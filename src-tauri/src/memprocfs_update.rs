//! MemProcFS 组件（vmm.dll / memprocfs.exe）启动自更新
//!
//! 每次启动时，从设置中的 `memprocfs_update_url` 拉取云端清单 JSON，
//! 对本地 memprocfs 目录（`memprocfs_path` 所在目录）下的组件做 SHA256 校验；
//! 若与云端不一致（或本地缺失），先结束正在运行的 memprocfs 进程释放文件句柄，
//! 再逐个下载对应文件、校验 SHA256 通过后静默替换。
//!
//! 复用 [`crate::update_manager`] 的安全 HTTP 客户端与 URL 白名单校验。

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

use crate::update_manager::{create_secure_client, validate_url};

/// 云端清单中的单个文件条目
#[derive(Debug, Deserialize)]
struct ManifestFile {
    /// 文件名（如 "vmm.dll" / "memprocfs.exe"）
    name: String,
    /// 期望的 SHA256（十六进制，大小写不敏感）
    sha256: String,
    /// 该文件的独立下载地址
    download_url: String,
    /// 文件大小（可选，用于下载后二次校验）
    #[serde(default)]
    size: Option<u64>,
}

/// 云端 MemProcFS 组件清单
#[derive(Debug, Deserialize)]
struct MemProcFsManifest {
    #[serde(default)]
    version: String,
    #[serde(default)]
    #[allow(dead_code)]
    release_date: Option<String>,
    #[serde(default)]
    #[allow(dead_code)]
    changelog_url: Option<String>,
    /// 需要校验 / 更新的文件列表
    #[serde(default)]
    files: Vec<ManifestFile>,
}

/// 返回给前端的校验 / 更新结果
#[derive(Debug, Serialize, Clone)]
pub struct MemProcFsUpdateResult {
    /// 是否实际执行了校验（未配置 URL / 路径、清单为空时为 false）
    pub checked: bool,
    /// 是否发生了替换更新
    pub updated: bool,
    /// 云端清单版本号
    pub version: String,
    /// 已替换的文件名列表
    pub replaced_files: Vec<String>,
    /// 校验一致、无需更新的文件名列表
    pub up_to_date_files: Vec<String>,
    /// 人类可读的结果描述
    pub message: String,
}

impl MemProcFsUpdateResult {
    /// 构造一个「跳过校验」的结果（非错误，用于优雅跳过场景）
    fn skipped(message: impl Into<String>) -> Self {
        Self {
            checked: false,
            updated: false,
            version: String::new(),
            replaced_files: Vec::new(),
            up_to_date_files: Vec::new(),
            message: message.into(),
        }
    }
}

/// 计算文件 SHA256（十六进制小写）
fn sha256_of_file(path: &Path) -> Result<String, String> {
    let content =
        std::fs::read(path).map_err(|e| format!("读取文件失败 {}: {}", path.display(), e))?;
    let mut hasher = Sha256::new();
    hasher.update(&content);
    Ok(hex::encode(hasher.finalize()))
}

/// 计算内存中字节内容的 SHA256（十六进制小写）
fn sha256_of_bytes(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}

/// 结束正在运行的 memprocfs 进程，释放 vmm.dll / memprocfs.exe 的文件句柄
fn kill_memprocfs_processes() {
    // sysinfo 扫描：结束名称包含 memprocfs 的进程
    {
        use sysinfo::{ProcessRefreshKind, RefreshKind, System};
        let sys = System::new_with_specifics(
            RefreshKind::new().with_processes(ProcessRefreshKind::everything()),
        );
        for (_pid, process) in sys.processes() {
            if process.name().to_lowercase().contains("memprocfs") {
                let _ = process.kill();
            }
        }
    }

    // Windows 额外用 taskkill 兜底（无窗口）
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        use std::process::Command;
        for image in ["MemProcFS.exe", "memprocfs.exe"] {
            let _ = Command::new("taskkill")
                .args(["/F", "/IM", image])
                .creation_flags(0x08000000) // CREATE_NO_WINDOW
                .output();
        }
    }
}

/// 将临时文件 `src` 替换到目标 `dst`（带重试，应对句柄尚未释放导致的占用）
fn replace_file_with_retry(src: &Path, dst: &Path) -> Result<(), String> {
    let backup = PathBuf::from(format!("{}.lmlbak", dst.to_string_lossy()));
    let mut last_err = String::new();

    for attempt in 0..5 {
        if attempt > 0 {
            std::thread::sleep(std::time::Duration::from_millis(400));
        }

        // 备份原文件（存在时）：先删旧备份再改名
        if dst.exists() {
            let _ = std::fs::remove_file(&backup);
            if let Err(e) = std::fs::rename(dst, &backup) {
                last_err = format!("备份原文件失败: {}", e);
                continue;
            }
        }

        // 移动新文件到目标；跨卷失败则回退为 copy
        let moved = std::fs::rename(src, dst).or_else(|_| std::fs::copy(src, dst).map(|_| ()));
        match moved {
            Ok(_) => {
                let _ = std::fs::remove_file(&backup);
                let _ = std::fs::remove_file(src);
                return Ok(());
            }
            Err(e) => {
                last_err = format!("写入目标文件失败: {}", e);
                // 尝试恢复备份，避免留下空缺
                if backup.exists() {
                    let _ = std::fs::rename(&backup, dst);
                }
            }
        }
    }

    Err(last_err)
}

/// 启动时校验并（在需要时）静默更新 MemProcFS 组件。
///
/// 行为：
/// 1. 未配置 `memprocfs_update_url` 或 `memprocfs_path` → 优雅跳过（`checked = false`）；
/// 2. 拉取云端清单，逐个比对本地 SHA256；
/// 3. 存在不一致 / 缺失文件时，先结束 memprocfs 进程，再下载校验并替换。
///
/// 该命令面向「每次启动静默执行」，网络 / 解析类问题会作为 `Err` 返回，
/// 由前端静默忽略，不打断用户。
#[tauri::command]
pub async fn check_and_update_memprocfs_command() -> Result<MemProcFsUpdateResult, String> {
    let settings = crate::settings::load_settings()?;
    let url = settings.memprocfs_update_url.trim().to_string();
    let memprocfs_path = settings.memprocfs_path.trim().to_string();

    if url.is_empty() {
        return Ok(MemProcFsUpdateResult::skipped(
            "未配置 MemProcFS 组件更新地址，跳过校验",
        ));
    }
    if memprocfs_path.is_empty() {
        return Ok(MemProcFsUpdateResult::skipped(
            "未配置 MemProcFS 路径，跳过组件校验",
        ));
    }

    // vmm.dll / memprocfs.exe 均与 memprocfs.exe 同目录
    let target_dir = match Path::new(&memprocfs_path).parent() {
        Some(p) => p.to_path_buf(),
        None => {
            return Ok(MemProcFsUpdateResult::skipped(
                "无法定位 MemProcFS 目录，跳过组件校验",
            ));
        }
    };

    // 校验清单 URL 安全性（HTTPS + 域名白名单）
    validate_url(&url)?;

    // 拉取云端清单
    let client = create_secure_client()?;
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("获取组件更新清单失败: {}", e))?;
    if !resp.status().is_success() {
        return Err(format!("获取组件更新清单失败，状态码: {}", resp.status()));
    }
    let body = resp
        .text()
        .await
        .map_err(|e| format!("读取组件清单内容失败: {}", e))?;

    // 云端地址当前可能为空：优雅跳过，避免启动报错
    if body.trim().is_empty() {
        return Ok(MemProcFsUpdateResult::skipped("云端组件清单为空，跳过更新"));
    }

    let manifest: MemProcFsManifest =
        serde_json::from_str(&body).map_err(|e| format!("解析组件清单失败: {}", e))?;

    if manifest.files.is_empty() {
        return Ok(MemProcFsUpdateResult::skipped(
            "云端组件清单未列出任何文件，跳过更新",
        ));
    }

    // 逐个比对本地 SHA256，挑出需要更新的文件
    let mut to_update: Vec<&ManifestFile> = Vec::new();
    let mut up_to_date: Vec<String> = Vec::new();
    for f in &manifest.files {
        let local = target_dir.join(&f.name);
        let needs = if local.exists() {
            match sha256_of_file(&local) {
                Ok(h) => !h.eq_ignore_ascii_case(f.sha256.trim()),
                Err(_) => true, // 本地读取失败，按需要更新处理
            }
        } else {
            true // 本地缺失
        };

        if needs {
            to_update.push(f);
        } else {
            up_to_date.push(f.name.clone());
        }
    }

    if to_update.is_empty() {
        debug_info!("[MemProcFS更新] 组件已是最新（版本 {}）", manifest.version);
        return Ok(MemProcFsUpdateResult {
            checked: true,
            updated: false,
            version: manifest.version,
            replaced_files: Vec::new(),
            up_to_date_files: up_to_date,
            message: "MemProcFS 组件已是最新".to_string(),
        });
    }

    let pending: Vec<&str> = to_update.iter().map(|f| f.name.as_str()).collect();
    debug_info!(
        "[MemProcFS更新] 检测到 {} 个组件需要更新: {}",
        to_update.len(),
        pending.join(", ")
    );

    // 先结束 memprocfs 进程，释放 vmm.dll / memprocfs.exe 句柄，再等待句柄释放
    kill_memprocfs_processes();
    tokio::time::sleep(std::time::Duration::from_millis(800)).await;

    // 依次下载 → 校验 SHA256 → 替换
    let mut replaced: Vec<String> = Vec::new();
    for f in &to_update {
        validate_url(&f.download_url)?;

        let resp = client
            .get(&f.download_url)
            .timeout(std::time::Duration::from_secs(600))
            .send()
            .await
            .map_err(|e| format!("下载 {} 失败: {}", f.name, e))?;
        if !resp.status().is_success() {
            return Err(format!("下载 {} 失败，状态码: {}", f.name, resp.status()));
        }
        let bytes = resp
            .bytes()
            .await
            .map_err(|e| format!("读取 {} 下载内容失败: {}", f.name, e))?;

        // 大小校验（可选）
        if let Some(sz) = f.size {
            if sz != bytes.len() as u64 {
                return Err(format!(
                    "{} 大小不匹配，期望 {} 字节，实际 {} 字节",
                    f.name,
                    sz,
                    bytes.len()
                ));
            }
        }

        // SHA256 校验
        let actual = sha256_of_bytes(&bytes);
        if !actual.eq_ignore_ascii_case(f.sha256.trim()) {
            return Err(format!(
                "{} SHA256 校验失败，期望 {}，实际 {}",
                f.name, f.sha256, actual
            ));
        }

        // 先写入同目录临时文件，再原子替换
        let tmp = target_dir.join(format!("{}.lmlnew", f.name));
        std::fs::write(&tmp, &bytes)
            .map_err(|e| format!("写入临时文件 {} 失败: {}", tmp.display(), e))?;

        let dst = target_dir.join(&f.name);
        replace_file_with_retry(&tmp, &dst).map_err(|e| {
            let _ = std::fs::remove_file(&tmp);
            format!("替换 {} 失败: {}", f.name, e)
        })?;

        debug_info!("[MemProcFS更新] 已更新组件: {}", f.name);
        replaced.push(f.name.clone());
    }

    let message = format!(
        "已静默更新 {} 个 MemProcFS 组件: {}",
        replaced.len(),
        replaced.join(", ")
    );
    debug_info!("[MemProcFS更新] {}", message);

    Ok(MemProcFsUpdateResult {
        checked: true,
        updated: true,
        version: manifest.version,
        replaced_files: replaced,
        up_to_date_files: up_to_date,
        message,
    })
}
