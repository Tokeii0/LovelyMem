// MemProcFS 符号表管理
//
// 扫描 MemProcFS 安装目录下的 Symbols\ 子目录，列出已下载的 PDB 符号文件，
// 并基于已知 GUID 映射推测对应 Windows 系统版本；通过 `pdb` crate 解析
// 出机器架构、自带 GUID/Age 等元数据。

use pdb::FallibleIterator;
use rayon::prelude::*;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use crate::settings;

lazy_static::lazy_static! {
    static ref PDB_DETAIL_CACHE: Mutex<HashMap<PathBuf, PdbDetails>> = Mutex::new(HashMap::new());
}

#[derive(Serialize, Clone, Debug)]
pub struct SymbolEntry {
    pub pdb_name: String,
    pub guid: String,
    pub age: String,
    pub file_size: u64,
    pub modified_time: String,
    pub full_path: String,
    pub entry_dir: String,
    pub system_version: Option<String>,
    pub category: String,
    pub machine: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
pub struct PdbDetails {
    pub machine: String,
    pub guid: String,
    pub age: String,
    pub public_symbol_count: u64,
    pub global_symbol_count: u64,
    pub module_count: u64,
    pub source_file_count: u64,
    pub parse_warnings: Vec<String>,
}

#[derive(Serialize, Clone, Debug)]
pub struct SymbolManagerInfo {
    pub configured: bool,
    pub memprocfs_path: String,
    pub symbols_dir: String,
    pub exists: bool,
    pub total_count: usize,
    pub total_size: u64,
}

fn resolve_symbols_dir() -> Result<(String, PathBuf), String> {
    let settings = settings::load_settings()?;
    let memprocfs_path = settings.memprocfs_path.clone();

    if memprocfs_path.is_empty() {
        return Err("MemProcFS 路径未配置，请先在设置中配置 MemProcFS 路径".to_string());
    }

    let memprocfs_file = Path::new(&memprocfs_path);
    let parent = memprocfs_file
        .parent()
        .ok_or("无法获取 MemProcFS 所在目录")?;
    let symbols_dir = parent.join("Symbols");
    Ok((memprocfs_path, symbols_dir))
}

fn classify_pdb(pdb_dir_name: &str) -> &'static str {
    let lower = pdb_dir_name.to_lowercase();
    if lower.starts_with("ntkrnlmp")
        || lower.starts_with("ntkrpamp")
        || lower.starts_with("ntoskrnl")
        || lower.starts_with("ntkrla57mp")
    {
        "kernel"
    } else if lower.ends_with(".sys") {
        "driver"
    } else {
        "other"
    }
}

fn split_guid_age(combo: &str) -> Option<(String, String)> {
    if combo.len() <= 32 {
        return None;
    }
    let (g, a) = combo.split_at(32);
    if !g.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }
    Some((g.to_uppercase(), a.to_uppercase()))
}

fn is_kernel_pdb(pdb_name: &str) -> bool {
    matches!(
        pdb_name.to_lowercase().as_str(),
        "ntkrnlmp.pdb" | "ntoskrnl.pdb" | "ntkrpamp.pdb" | "ntkrla57mp.pdb"
    )
}

fn machine_to_str(m: pdb::MachineType) -> &'static str {
    use pdb::MachineType as M;
    match m {
        M::X86 => "x86",
        M::Amd64 => "x64",
        M::Arm | M::ArmNT => "ARM",
        M::Arm64 => "ARM64",
        M::Ia64 => "IA64",
        _ => "Unknown",
    }
}

/// 轻量解析：只读 PDB Info Stream + DBI 头，毫秒级。
/// 返回 (机器架构, PDB 自带 GUID 大写无连字符, PDB 自带 Age 大写 hex, PDB Signature/timestamp)。
fn parse_pdb_light(path: &Path) -> Option<(String, String, String, u32)> {
    let file = std::fs::File::open(path).ok()?;
    let mut pdb = pdb::PDB::open(file).ok()?;
    let info = pdb.pdb_information().ok()?;
    let guid = info.guid.simple().to_string().to_uppercase();
    let age = format!("{:X}", info.age);
    let signature = info.signature;
    let machine = pdb
        .debug_information()
        .ok()
        .and_then(|d| d.machine_type().ok())
        .map(machine_to_str)
        .unwrap_or("Unknown")
        .to_string();
    Some((machine, guid, age, signature))
}

/// 完整解析：枚举模块、源文件、全局/公共符号。可能耗时数百毫秒至数秒。
fn parse_pdb_full(path: &Path) -> Result<PdbDetails, String> {
    let mut warnings: Vec<String> = Vec::new();

    let file = std::fs::File::open(path).map_err(|e| format!("打开 PDB 失败: {e}"))?;
    let mut pdb = pdb::PDB::open(file).map_err(|e| format!("解析 PDB 头失败: {e}"))?;

    let info = pdb
        .pdb_information()
        .map_err(|e| format!("读取 PDB Info 失败: {e}"))?;
    let pdb_guid = info.guid.simple().to_string().to_uppercase();
    let pdb_age = format!("{:X}", info.age);

    let mut machine = String::from("Unknown");
    let mut module_count: u64 = 0;
    let mut source_files: HashSet<String> = HashSet::new();

    match pdb.debug_information() {
        Ok(dbi) => {
            machine = dbi
                .machine_type()
                .ok()
                .map(machine_to_str)
                .unwrap_or("Unknown")
                .to_string();
            match dbi.modules() {
                Ok(mut modules) => loop {
                    match modules.next() {
                        Ok(Some(module)) => {
                            module_count += 1;
                            if let Ok(Some(mi)) = pdb.module_info(&module) {
                                if let Ok(lp) = mi.line_program() {
                                    let mut files = lp.files();
                                    while let Ok(Some(f)) = files.next() {
                                        // StringRef Debug 形式作为去重键（offset 唯一）
                                        source_files.insert(format!("{:?}", f.name));
                                    }
                                }
                            }
                        }
                        Ok(None) => break,
                        Err(e) => {
                            warnings.push(format!("模块迭代错误: {e}"));
                            break;
                        }
                    }
                },
                Err(e) => warnings.push(format!("读取模块列表失败: {e}")),
            }
        }
        Err(e) => warnings.push(format!("读取 DBI 失败: {e}")),
    }

    let mut public_symbol_count: u64 = 0;
    let mut global_symbol_count: u64 = 0;
    match pdb.global_symbols() {
        Ok(syms) => {
            let mut it = syms.iter();
            loop {
                match it.next() {
                    Ok(Some(sym)) => {
                        global_symbol_count += 1;
                        if let Ok(pdb::SymbolData::Public(_)) = sym.parse() {
                            public_symbol_count += 1;
                        }
                    }
                    Ok(None) => break,
                    Err(e) => {
                        warnings.push(format!("符号迭代错误: {e}"));
                        break;
                    }
                }
            }
        }
        Err(e) => warnings.push(format!("读取全局符号失败: {e}")),
    }

    Ok(PdbDetails {
        machine,
        guid: pdb_guid,
        age: pdb_age,
        public_symbol_count,
        global_symbol_count,
        module_count,
        source_file_count: source_files.len() as u64,
        parse_warnings: warnings,
    })
}

fn format_modified(metadata: &std::fs::Metadata) -> String {
    metadata
        .modified()
        .ok()
        .and_then(|t| {
            let dt: chrono::DateTime<chrono::Local> = t.into();
            Some(dt.format("%Y-%m-%d %H:%M:%S").to_string())
        })
        .unwrap_or_else(|| "-".to_string())
}

fn scan_symbols_dir(symbols_dir: &Path) -> Vec<SymbolEntry> {
    let mut entries: Vec<SymbolEntry> = Vec::new();

    let outer = match std::fs::read_dir(symbols_dir) {
        Ok(it) => it,
        Err(_) => return entries,
    };

    for pdb_entry in outer.flatten() {
        let pdb_path = pdb_entry.path();
        if !pdb_path.is_dir() {
            continue;
        }
        let pdb_name = match pdb_path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };

        let category = classify_pdb(&pdb_name).to_string();

        let inner = match std::fs::read_dir(&pdb_path) {
            Ok(it) => it,
            Err(_) => continue,
        };

        for combo_entry in inner.flatten() {
            let combo_path = combo_entry.path();
            if !combo_path.is_dir() {
                continue;
            }
            let combo_name = match combo_path.file_name().and_then(|n| n.to_str()) {
                Some(n) => n.to_string(),
                None => continue,
            };
            let (guid, age) = match split_guid_age(&combo_name) {
                Some(v) => v,
                None => continue,
            };

            // 期望的 .pdb 文件路径（与目录同名）
            let pdb_file = combo_path.join(&pdb_name);
            let (file_size, modified_time, full_path) = if pdb_file.exists() {
                match std::fs::metadata(&pdb_file) {
                    Ok(meta) => (
                        meta.len(),
                        format_modified(&meta),
                        pdb_file.to_string_lossy().to_string(),
                    ),
                    Err(_) => (0, "-".to_string(), pdb_file.to_string_lossy().to_string()),
                }
            } else {
                // 也可能命名变体，扫描 combo_path 内任一文件
                let mut size = 0u64;
                let mut mtime = "-".to_string();
                let mut found_path = combo_path.to_string_lossy().to_string();
                if let Ok(rd) = std::fs::read_dir(&combo_path) {
                    for f in rd.flatten() {
                        if let Ok(meta) = f.metadata() {
                            if meta.is_file() {
                                size = meta.len();
                                mtime = format_modified(&meta);
                                found_path = f.path().to_string_lossy().to_string();
                                break;
                            }
                        }
                    }
                }
                (size, mtime, found_path)
            };

            entries.push(SymbolEntry {
                pdb_name: pdb_name.clone(),
                guid,
                age,
                file_size,
                modified_time,
                full_path,
                entry_dir: combo_path.to_string_lossy().to_string(),
                system_version: None, // 由后续并行 pass 通过 PDB signature 反查填充
                category: category.clone(),
                machine: None,
            });
        }
    }

    // 并行轻量解析每条 PDB 的机器架构 + 用 PDB signature 反查 Windows 版本（仅内核 PDB）
    entries.par_iter_mut().for_each(|e| {
        if let Some((machine, _, _, signature)) = parse_pdb_light(Path::new(&e.full_path)) {
            e.machine = Some(machine);
            if e.system_version.is_none() && is_kernel_pdb(&e.pdb_name) {
                e.system_version = crate::kernel_version_index::lookup_by_signature(signature);
            }
        }
    });

    entries.sort_by(|a, b| {
        a.category
            .cmp(&b.category)
            .then(a.pdb_name.to_lowercase().cmp(&b.pdb_name.to_lowercase()))
            .then(a.guid.cmp(&b.guid))
    });
    entries
}

#[tauri::command]
pub async fn get_symbol_manager_info() -> Result<SymbolManagerInfo, String> {
    let settings = settings::load_settings()?;
    let memprocfs_path = settings.memprocfs_path.clone();
    let configured = !memprocfs_path.is_empty();

    if !configured {
        return Ok(SymbolManagerInfo {
            configured: false,
            memprocfs_path: String::new(),
            symbols_dir: String::new(),
            exists: false,
            total_count: 0,
            total_size: 0,
        });
    }

    let (mem_path, symbols_dir) = resolve_symbols_dir()?;
    let exists = symbols_dir.exists();

    let (count, size) = if exists {
        let entries = scan_symbols_dir(&symbols_dir);
        let total: u64 = entries.iter().map(|e| e.file_size).sum();
        (entries.len(), total)
    } else {
        (0, 0)
    };

    Ok(SymbolManagerInfo {
        configured: true,
        memprocfs_path: mem_path,
        symbols_dir: symbols_dir.to_string_lossy().to_string(),
        exists,
        total_count: count,
        total_size: size,
    })
}

#[tauri::command]
pub async fn list_memprocfs_symbols() -> Result<Vec<SymbolEntry>, String> {
    let (_, symbols_dir) = resolve_symbols_dir()?;
    if !symbols_dir.exists() {
        return Ok(Vec::new());
    }
    Ok(scan_symbols_dir(&symbols_dir))
}

#[tauri::command]
pub async fn delete_symbol_entry(
    pdb_name: String,
    guid: String,
    age: String,
) -> Result<(), String> {
    if pdb_name.is_empty() || guid.is_empty() {
        return Err("无效的删除参数".to_string());
    }
    // 校验 guid/age 仅含十六进制字符，避免路径注入
    if !guid.chars().all(|c| c.is_ascii_hexdigit()) || !age.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("GUID/Age 含非法字符".to_string());
    }
    if pdb_name.contains('/') || pdb_name.contains('\\') || pdb_name.contains("..") {
        return Err("PDB 名称含非法字符".to_string());
    }

    let (_, symbols_dir) = resolve_symbols_dir()?;
    let target = symbols_dir.join(&pdb_name).join(format!("{}{}", guid, age));
    if !target.exists() {
        return Err(format!("条目不存在: {}", target.to_string_lossy()));
    }
    std::fs::remove_dir_all(&target).map_err(|e| format!("删除符号条目失败: {}", e))?;

    // 若上层 PDB 目录已空则一并清理
    if let Ok(mut rd) = std::fs::read_dir(symbols_dir.join(&pdb_name)) {
        if rd.next().is_none() {
            let _ = std::fs::remove_dir(symbols_dir.join(&pdb_name));
        }
    }

    // 删除条目时同步淘汰其缓存
    let stale_prefix = symbols_dir.join(&pdb_name).join(format!("{}{}", guid, age));
    if let Ok(mut cache) = PDB_DETAIL_CACHE.lock() {
        cache.retain(|k, _| !k.starts_with(&stale_prefix));
    }
    Ok(())
}

#[tauri::command]
pub async fn get_pdb_details(
    pdb_name: String,
    guid: String,
    age: String,
) -> Result<PdbDetails, String> {
    if pdb_name.is_empty() || guid.is_empty() {
        return Err("无效参数".to_string());
    }
    if !guid.chars().all(|c| c.is_ascii_hexdigit()) || !age.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("GUID/Age 含非法字符".to_string());
    }
    if pdb_name.contains('/') || pdb_name.contains('\\') || pdb_name.contains("..") {
        return Err("PDB 名称含非法字符".to_string());
    }

    let (_, symbols_dir) = resolve_symbols_dir()?;
    let combo_dir = symbols_dir.join(&pdb_name).join(format!("{}{}", guid, age));
    if !combo_dir.exists() {
        return Err(format!("条目不存在: {}", combo_dir.to_string_lossy()));
    }

    // 解析目标 PDB 文件路径：先按同名匹配，否则取目录内首个文件
    let mut pdb_path = combo_dir.join(&pdb_name);
    if !pdb_path.exists() {
        if let Ok(rd) = std::fs::read_dir(&combo_dir) {
            for f in rd.flatten() {
                if let Ok(meta) = f.metadata() {
                    if meta.is_file() {
                        pdb_path = f.path();
                        break;
                    }
                }
            }
        }
    }
    if !pdb_path.exists() {
        return Err("未找到 PDB 文件".to_string());
    }

    // 缓存命中
    if let Ok(cache) = PDB_DETAIL_CACHE.lock() {
        if let Some(hit) = cache.get(&pdb_path) {
            return Ok(hit.clone());
        }
    }

    let pdb_path_for_task = pdb_path.clone();

    let details = tokio::task::spawn_blocking(move || parse_pdb_full(&pdb_path_for_task))
        .await
        .map_err(|e| format!("解析任务异常: {e}"))??;

    if let Ok(mut cache) = PDB_DETAIL_CACHE.lock() {
        cache.insert(pdb_path, details.clone());
    }
    Ok(details)
}
