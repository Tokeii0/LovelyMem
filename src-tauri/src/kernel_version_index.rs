// Windows 内核 PDB Signature(timestamp) -> 系统版本反查索引
//
// 数据源：winbindex (https://winbindex.m417z.com/) 的 by_filename_compressed
// 公开 JSON。winbindex 索引每个 PE 文件，含 fileInfo.timestamp（PE link
// 时间戳）和 windowsVersions（所属 release/KB），但不含 PDB GUID。
//
// 关键事实：PDB v7（RSDS）头部 Signature 字段 = PE 的 link timestamp，两者
// 相同。所以我们用 timestamp 当桥梁：winbindex 同步时建表
// `timestamp -> "Windows 10 22H2 (Build 19045)"`，扫 PDB 时读其内部
// signature 做反查。
//
// 索引文件落地在 app data 目录，可手动触发刷新。

use flate2::read::GzDecoder;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::io::Read;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Emitter;

const KERNEL_PE_FILES: &[&str] = &[
    "ntoskrnl.exe",
    "ntkrnlmp.exe",
    "ntkrpamp.exe",
    "ntkrla57mp.exe",
];
const WINBINDEX_BASE: &str = "https://winbindex.m417z.com/data/by_filename_compressed/";

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct KernelVersionIndex {
    pub last_synced: Option<String>,
    pub entry_count: u64,
    /// key = PE link timestamp (decimal string), value = 版本字符串
    pub entries: HashMap<String, String>,
}

#[derive(Serialize, Clone, Debug, Default)]
pub struct VersionIndexInfo {
    pub last_synced: Option<String>,
    pub entry_count: u64,
}

lazy_static::lazy_static! {
    static ref INDEX_CACHE: Mutex<Option<KernelVersionIndex>> = Mutex::new(None);
}

fn index_file_path() -> Option<PathBuf> {
    dirs::data_local_dir().map(|d| {
        d.join(crate::settings::APP_STORAGE_DIR_NAME)
            .join("kernel-version-index.json")
    })
}

fn load_from_disk() -> Option<KernelVersionIndex> {
    let path = index_file_path()?;
    let bytes = std::fs::read(&path).ok()?;
    serde_json::from_slice(&bytes).ok()
}

fn save_to_disk(idx: &KernelVersionIndex) -> Result<(), String> {
    let path = index_file_path().ok_or("无法定位 app data 目录")?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let bytes = serde_json::to_vec_pretty(idx).map_err(|e| e.to_string())?;
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(())
}

fn ensure_loaded() {
    if let Ok(mut g) = INDEX_CACHE.lock() {
        if g.is_none() {
            *g = Some(load_from_disk().unwrap_or_default());
        }
    }
}

/// 用 PDB Signature(=PE link timestamp) 反查 Windows 版本。
pub fn lookup_by_signature(signature: u32) -> Option<String> {
    ensure_loaded();
    let g = INDEX_CACHE.lock().ok()?;
    let idx = g.as_ref()?;
    idx.entries.get(&signature.to_string()).cloned()
}

/// 根据 build 号粗判 Windows 系列名。
fn windows_series(build: u64) -> &'static str {
    if build >= 22000 {
        "Windows 11"
    } else if build >= 10240 {
        "Windows 10"
    } else if build >= 9600 {
        "Windows 8.1"
    } else if build >= 9200 {
        "Windows 8"
    } else if build >= 7600 {
        "Windows 7"
    } else if build >= 6000 {
        "Windows Vista"
    } else {
        "Windows"
    }
}

fn parse_build_from_version(version: &str) -> Option<u64> {
    // e.g. "10.0.19045.5371 (...)" -> 19045
    let trimmed = version.split_whitespace().next().unwrap_or(version);
    let parts: Vec<&str> = trimmed.split('.').collect();
    if parts.len() >= 3 {
        parts[2].parse::<u64>().ok()
    } else {
        None
    }
}

fn build_version_label(entry: &Value) -> Option<String> {
    let file_info = entry.get("fileInfo")?;
    let version = file_info.get("version").and_then(|v| v.as_str())?;
    let build = parse_build_from_version(version);

    // windowsVersions 的最外层 key 直接是 release（如 "1507"、"22H2"）
    let release = entry
        .get("windowsVersions")
        .and_then(|v| v.as_object())
        .and_then(|o| o.keys().next().cloned());

    let series = build.map(windows_series).unwrap_or("Windows");
    Some(match (release, build) {
        (Some(r), Some(b)) => format!("{} {} (Build {})", series, r, b),
        (Some(r), None) => format!("{} {}", series, r),
        (None, Some(b)) => format!("{} (Build {})", series, b),
        (None, None) => series.to_string(),
    })
}

/// 从 winbindex 单文件 JSON 提取 timestamp -> version 映射。
fn extract_from_winbindex_json(decompressed: &[u8]) -> Result<HashMap<String, String>, String> {
    let json: Value =
        serde_json::from_slice(decompressed).map_err(|e| format!("JSON 解析失败: {e}"))?;
    let obj = json.as_object().ok_or("winbindex 顶层不是对象")?;

    let mut out: HashMap<String, String> = HashMap::new();
    for (_sha, entry) in obj {
        let ts = match entry
            .get("fileInfo")
            .and_then(|fi| fi.get("timestamp"))
            .and_then(|v| v.as_u64())
        {
            Some(t) => t,
            None => continue,
        };
        let label = match build_version_label(entry) {
            Some(l) => l,
            None => continue,
        };
        out.entry(ts.to_string()).or_insert(label);
    }
    Ok(out)
}

#[tauri::command]
pub async fn get_kernel_version_index_info() -> Result<VersionIndexInfo, String> {
    ensure_loaded();
    let g = INDEX_CACHE.lock().map_err(|e| e.to_string())?;
    let idx = g.as_ref().cloned().unwrap_or_default();
    Ok(VersionIndexInfo {
        last_synced: idx.last_synced,
        entry_count: idx.entry_count,
    })
}

#[tauri::command]
pub async fn sync_kernel_version_index(window: tauri::Window) -> Result<VersionIndexInfo, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(180))
        .user_agent("LovelymemV2/2.3.6")
        .build()
        .map_err(|e| format!("HTTP 客户端初始化失败: {e}"))?;

    let mut entries: HashMap<String, String> = HashMap::new();
    let total_files = KERNEL_PE_FILES.len();
    let mut downloaded_files = 0usize;
    let mut errors: Vec<String> = Vec::new();

    for (i, pe_filename) in KERNEL_PE_FILES.iter().enumerate() {
        let url = format!("{}{}.json.gz", WINBINDEX_BASE, pe_filename);
        let _ = window.emit(
            "kernel_version_sync_progress",
            serde_json::json!({
                "stage": "downloading",
                "file": pe_filename,
                "current": i + 1,
                "total": total_files,
            }),
        );

        let resp = match client.get(&url).send().await {
            Ok(r) => r,
            Err(e) => {
                errors.push(format!("{}: 网络错误 {}", pe_filename, e));
                continue;
            }
        };
        if !resp.status().is_success() {
            // 404 等：winbindex 未必收录所有变体，继续下一项
            continue;
        }
        let bytes = match resp.bytes().await {
            Ok(b) => b,
            Err(e) => {
                errors.push(format!("{}: 下载体读取失败 {}", pe_filename, e));
                continue;
            }
        };

        let _ = window.emit(
            "kernel_version_sync_progress",
            serde_json::json!({
                "stage": "parsing",
                "file": pe_filename,
                "current": i + 1,
                "total": total_files,
                "size": bytes.len(),
            }),
        );

        let pe_filename_owned = pe_filename.to_string();
        let map_part = tokio::task::spawn_blocking(move || {
            let mut decoder = GzDecoder::new(&bytes[..]);
            let mut decompressed = Vec::new();
            decoder
                .read_to_end(&mut decompressed)
                .map_err(|e| format!("{}: gzip 解压失败 {}", pe_filename_owned, e))?;
            extract_from_winbindex_json(&decompressed)
                .map_err(|e| format!("{}: {}", pe_filename_owned, e))
        })
        .await
        .map_err(|e| format!("解析任务异常: {e}"))?;

        match map_part {
            Ok(m) => {
                downloaded_files += 1;
                entries.extend(m);
            }
            Err(e) => errors.push(e),
        }
    }

    if downloaded_files == 0 {
        return Err(format!(
            "未能从 winbindex 获取任何数据：{}",
            errors.join("; ")
        ));
    }

    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let idx = KernelVersionIndex {
        last_synced: Some(now),
        entry_count: entries.len() as u64,
        entries,
    };
    save_to_disk(&idx)?;

    {
        let mut g = INDEX_CACHE.lock().map_err(|e| e.to_string())?;
        *g = Some(idx.clone());
    }

    let _ = window.emit(
        "kernel_version_sync_progress",
        serde_json::json!({
            "stage": "done",
            "entry_count": idx.entry_count,
            "warnings": errors,
        }),
    );

    Ok(VersionIndexInfo {
        last_synced: idx.last_synced,
        entry_count: idx.entry_count,
    })
}
