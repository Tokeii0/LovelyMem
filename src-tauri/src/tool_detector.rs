//! 取证工具智能探测模块
//!
//! 在多个候选目录（程序目录、上级目录、标准 `Tools` 布局、系统 `PATH`、
//! 常见安装位置等）中**智能搜索**并**校验真实存在**取证工具的可执行文件 / 脚本，
//! 取代以往「写死固定相对路径」的一键配置方式。
//!
//! 设计要点：
//! - 单次遍历每个候选根目录，统一收集目标文件 / 目录，再为每个工具解析最佳命中；
//! - 通过祖先目录名「提示词」打分消歧（如区分 vol2/vol3、python2/python3）；
//! - 遍历带预算上限与目录裁剪，避免极端目录结构导致卡顿；
//! - 仅返回真实存在的路径（found=true），未找到的工具如实上报，交由前端提示用户手动补充。

use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

/// 单个探测结果
#[derive(Debug, Clone, Serialize)]
pub struct DetectedPath {
    /// 探测到的绝对路径（未找到时为空字符串）
    pub path: String,
    /// 是否在磁盘上真实存在
    pub found: bool,
    /// 来源：search=目录搜索命中, path=系统 PATH, derived=程序目录派生默认值, none=未找到
    pub source: String,
}

impl DetectedPath {
    fn found_at(path: &Path, source: &str) -> Self {
        Self {
            path: path.to_string_lossy().to_string(),
            found: true,
            source: source.to_string(),
        }
    }

    fn missing() -> Self {
        Self {
            path: String::new(),
            found: false,
            source: "none".to_string(),
        }
    }

    fn derived(path: &Path) -> Self {
        Self {
            path: path.to_string_lossy().to_string(),
            found: true,
            source: "derived".to_string(),
        }
    }
}

/// 单个工具的探测规则
struct ToolRule {
    /// 对应 AppSettings 字段名
    field: &'static str,
    /// 目标文件名（小写，精确匹配）；is_dir 时忽略
    filenames: &'static [&'static str],
    /// 祖先路径包含其一 → 命中加分（消歧关键）
    dir_hints: &'static [&'static str],
    /// 祖先路径包含其一 → 直接排除
    neg_hints: &'static [&'static str],
    /// 是否为目录（如 volatility2 插件目录）
    is_dir: bool,
    /// 是否要求命中 dir_hint（用于消歧，如 vol.py 必须位于 vol3/vol2 目录下）
    require_hint: bool,
}

/// 工具探测规则表
const RULES: &[ToolRule] = &[
    ToolRule {
        field: "python3_path",
        filenames: &["python.exe", "python3.exe"],
        dir_hints: &["python3"],
        neg_hints: &["python2", "python27"],
        is_dir: false,
        require_hint: false,
    },
    ToolRule {
        field: "python2_path",
        filenames: &["python27.exe", "python2.exe", "python.exe"],
        dir_hints: &["python27", "python2"],
        neg_hints: &["python3"],
        is_dir: false,
        require_hint: true,
    },
    ToolRule {
        field: "memprocfs_path",
        filenames: &["memprocfs.exe"],
        dir_hints: &["memprocfs"],
        neg_hints: &[],
        is_dir: false,
        require_hint: false,
    },
    ToolRule {
        field: "volatility3_path",
        filenames: &["vol.py", "vol3.py", "vol.exe"],
        dir_hints: &["volatility3", "vol3"],
        neg_hints: &["volatility2", "vol2"],
        is_dir: false,
        require_hint: true,
    },
    ToolRule {
        field: "volatility2_path",
        filenames: &["vol.py", "vol2.py"],
        dir_hints: &["volatility2", "vol2"],
        neg_hints: &["volatility3", "vol3"],
        is_dir: false,
        require_hint: true,
    },
    ToolRule {
        field: "volatility2_plugin",
        filenames: &[],
        dir_hints: &["volatility2_plugin", "volatility2_plugins"],
        neg_hints: &[],
        is_dir: true,
        require_hint: true,
    },
    ToolRule {
        field: "dumpit_path",
        filenames: &["dumpit.exe"],
        dir_hints: &["dumpit"],
        neg_hints: &[],
        is_dir: false,
        require_hint: false,
    },
    ToolRule {
        field: "memnixfs_path",
        filenames: &["memnixfs.exe"],
        dir_hints: &["memnixfs"],
        neg_hints: &[],
        is_dir: false,
        require_hint: false,
    },
];

/// 遍历时裁剪掉的超大 / 无关目录（小写名精确匹配）
const SKIP_DIRS: &[&str] = &[
    "$recycle.bin",
    "windows",
    "winsxs",
    "node_modules",
    ".git",
    "system volume information",
];

/// 遍历最大深度
const MAX_DEPTH: usize = 6;
/// 全局遍历条目预算，防止极端目录卡死
const SCAN_BUDGET: i64 = 150_000;

/// 单次遍历收集到的候选
struct Scanned {
    files: Vec<PathBuf>,
    dirs: Vec<PathBuf>,
}

/// 汇总所有规则需要匹配的目标文件名（去重）
fn wanted_files() -> Vec<&'static str> {
    let mut v: Vec<&'static str> = Vec::new();
    for r in RULES {
        if !r.is_dir {
            for f in r.filenames {
                if !v.contains(f) {
                    v.push(f);
                }
            }
        }
    }
    v
}

/// 汇总所有「目录型」规则的提示词
fn dir_hints() -> Vec<&'static str> {
    let mut v: Vec<&'static str> = Vec::new();
    for r in RULES {
        if r.is_dir {
            for h in r.dir_hints {
                if !v.contains(h) {
                    v.push(h);
                }
            }
        }
    }
    v
}

/// 构造候选根目录列表（最具体的标准布局优先，存在才加入、自动去重）
fn candidate_roots() -> Vec<PathBuf> {
    let mut roots: Vec<PathBuf> = Vec::new();

    fn add(p: PathBuf, roots: &mut Vec<PathBuf>) {
        if p.is_dir() && !roots.iter().any(|r| r == &p) {
            roots.push(p);
        }
    }

    // 一键下载器统一安装到应用数据目录；优先探测该受管目录。
    if let Ok(app_data_dir) = crate::settings::get_app_data_dir() {
        add(app_data_dir.join("tools"), &mut roots);
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(app_dir) = exe.parent() {
            // 标准布局：<安装根>/Tools 与程序目录同级（见 get_app_paths）
            if let Some(parent) = app_dir.parent() {
                add(parent.join("Tools"), &mut roots);
            }
            add(app_dir.join("Tools"), &mut roots);
            add(app_dir.to_path_buf(), &mut roots);
            if let Some(parent) = app_dir.parent() {
                add(parent.to_path_buf(), &mut roots);
                if let Some(gp) = parent.parent() {
                    add(gp.join("Tools"), &mut roots);
                }
            }
        }
    }

    if let Ok(cwd) = std::env::current_dir() {
        add(cwd.join("Tools"), &mut roots);
        add(cwd, &mut roots);
    }

    #[cfg(windows)]
    {
        for d in ["C:\\Tools", "D:\\Tools", "E:\\Tools"] {
            add(PathBuf::from(d), &mut roots);
        }
    }

    if let Some(home) = dirs::home_dir() {
        add(home.join("Tools"), &mut roots);
        add(home.join("tools"), &mut roots);
        add(home.join("Desktop").join("Tools"), &mut roots);
    }

    roots
}

/// 遍历单个根目录，收集目标文件 / 目录（带预算与目录裁剪）
fn scan_one_root(
    root: &Path,
    wanted: &[&str],
    hints: &[&str],
    scanned: &mut Scanned,
    budget: &mut i64,
) {
    let walker = WalkDir::new(root)
        .max_depth(MAX_DEPTH)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| {
            // 根目录始终进入；裁剪掉无关超大目录
            if e.depth() == 0 {
                return true;
            }
            if e.file_type().is_dir() {
                if let Some(n) = e.file_name().to_str() {
                    let nl = n.to_lowercase();
                    return !SKIP_DIRS.iter().any(|s| nl == *s);
                }
            }
            true
        });

    for entry in walker.filter_map(|e| e.ok()) {
        if *budget <= 0 {
            break;
        }
        *budget -= 1;

        let ft = entry.file_type();
        let name = match entry.file_name().to_str() {
            Some(n) => n.to_lowercase(),
            None => continue,
        };

        if ft.is_dir() {
            if hints.iter().any(|h| name.contains(*h)) {
                scanned.dirs.push(entry.path().to_path_buf());
            }
        } else if ft.is_file() && wanted.iter().any(|w| name == *w) {
            scanned.files.push(entry.path().to_path_buf());
        }
    }
}

/// 扫描系统 PATH 中的目标可执行文件
fn scan_path_env(wanted: &[&str]) -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Ok(path_var) = std::env::var("PATH") {
        let sep = if cfg!(windows) { ';' } else { ':' };
        for dir in path_var.split(sep) {
            if dir.trim().is_empty() {
                continue;
            }
            let d = Path::new(dir);
            for f in wanted {
                let p = d.join(f);
                if p.is_file() {
                    out.push(p);
                }
            }
        }
    }
    out
}

/// 在给定候选池中按打分选出最佳命中（不区分来源）
fn best_in(rule: &ToolRule, pool: &[PathBuf]) -> Option<PathBuf> {
    let mut best: Option<(i64, PathBuf)> = None;

    for cand in pool {
        let name = cand
            .file_name()
            .and_then(|n| n.to_str())
            .map(|s| s.to_lowercase())
            .unwrap_or_default();
        let lower = cand.to_string_lossy().to_lowercase();

        // 类型 / 文件名匹配
        if rule.is_dir {
            if !rule.dir_hints.iter().any(|h| name.contains(*h)) {
                continue;
            }
        } else if !rule.filenames.iter().any(|f| name == *f) {
            continue;
        }

        // 负向提示直接排除（如 python3 目录下的 python.exe 不能作为 python2）
        if rule.neg_hints.iter().any(|h| lower.contains(*h)) {
            continue;
        }

        let hint_matched = rule.dir_hints.iter().any(|h| lower.contains(*h));
        // 「强文件名」（非通用 python.exe / vol.py）可豁免 require_hint 要求
        let strong_name = !rule.is_dir && name != "python.exe" && name != "vol.py";
        if rule.require_hint && !hint_matched && !strong_name {
            continue;
        }

        let mut score: i64 = 0;
        if hint_matched {
            score += 100;
        }
        if lower.contains("\\tools\\") || lower.contains("/tools/") {
            score += 20;
        }
        // 较短路径优先（更接近根、更「干净」），作为细粒度 tiebreak
        score -= (lower.len() as i64) / 20;

        match &best {
            Some((s, _)) if *s >= score => {}
            _ => best = Some((score, cand.clone())),
        }
    }

    best.map(|(_, p)| p)
}

/// 本地优先解析：先在「程序附近目录」的扫描结果中查找；
/// 本地没有时才回退到系统 PATH（满足「优先使用与主程序相近的目录」的要求）。
fn resolve(rule: &ToolRule, scanned: &Scanned, path_hits: &[PathBuf]) -> DetectedPath {
    let local_pool = if rule.is_dir {
        &scanned.dirs
    } else {
        &scanned.files
    };
    if let Some(p) = best_in(rule, local_pool) {
        return DetectedPath::found_at(&p, "local");
    }
    // 目录型工具不在 PATH 中查找
    if !rule.is_dir {
        if let Some(p) = best_in(rule, path_hits) {
            return DetectedPath::found_at(&p, "path");
        }
    }
    DetectedPath::missing()
}

/// 是否已在「程序附近目录」中命中（用于早停判断：本地全部找齐才停止扫描，
/// 避免 PATH 命中导致提前结束、从而错过更近的本地版本）。
fn resolved_locally(rule: &ToolRule, scanned: &Scanned) -> bool {
    let local_pool = if rule.is_dir {
        &scanned.dirs
    } else {
        &scanned.files
    };
    best_in(rule, local_pool).is_some()
}

/// 当前规则在本平台是否启用（macOS 跳过 Python2 / Volatility2 相关）
fn rule_enabled(field: &str) -> bool {
    #[cfg(target_os = "macos")]
    {
        !matches!(
            field,
            "python2_path" | "volatility2_path" | "volatility2_plugin"
        )
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = field;
        true
    }
}

/// 程序目录（可执行文件所在目录）
fn app_dir() -> Option<PathBuf> {
    std::env::current_exe()
        .ok()
        .and_then(|e| e.parent().map(|p| p.to_path_buf()))
}

/// 阻塞式执行智能探测（在 spawn_blocking 中运行）
fn detect_blocking() -> HashMap<String, DetectedPath> {
    let roots = candidate_roots();
    let wanted = wanted_files();
    let hints = dir_hints();
    let path_hits = scan_path_env(&wanted);

    let mut scanned = Scanned {
        files: Vec::new(),
        dirs: Vec::new(),
    };
    let mut budget: i64 = SCAN_BUDGET;

    let active: Vec<&ToolRule> = RULES.iter().filter(|r| rule_enabled(r.field)).collect();

    // 逐根目录遍历；一旦累积候选已能解析出全部工具即提前结束
    for root in &roots {
        if budget <= 0 {
            break;
        }
        scan_one_root(root, &wanted, &hints, &mut scanned, &mut budget);
        // 仅当全部工具都已在本地命中才提前结束（PATH 命中不算，确保穷尽本地搜索）
        let all_local = active.iter().all(|r| resolved_locally(r, &scanned));
        if all_local {
            break;
        }
    }

    let mut out: HashMap<String, DetectedPath> = HashMap::new();
    for r in &active {
        out.insert(r.field.to_string(), resolve(r, &scanned, &path_hits));
    }

    // 程序目录派生的默认目录（与 get_app_paths 保持一致，始终提供）
    if let Some(dir) = app_dir() {
        out.insert(
            "output_path".into(),
            DetectedPath::derived(&dir.join("output")),
        );
        out.insert(
            "scripts_path".into(),
            DetectedPath::derived(&dir.join("scripts")),
        );
        out.insert(
            "extensions_path".into(),
            DetectedPath::derived(&dir.join("extensions")),
        );
        out.insert(
            "tooltip_rules_path".into(),
            DetectedPath::derived(&dir.join("tooltip_rules")),
        );
    }
    out
}

/// 智能探测应用程序路径，用于一键配置。
///
/// 相比 `get_app_paths`（仅基于固定相对布局推算且不校验存在性），
/// 本命令会在多个候选目录与系统 PATH 中实际搜索并校验文件存在，
/// 返回结构包含每项路径是否真实命中（`found`）及来源（`source`）。
#[tauri::command]
pub async fn smart_detect_app_paths() -> Result<HashMap<String, DetectedPath>, String> {
    debug_info!("开始智能探测应用程序工具路径...");

    let result = tokio::task::spawn_blocking(detect_blocking)
        .await
        .map_err(|e| format!("智能探测任务执行失败: {}", e))?;

    let found = result.values().filter(|d| d.found).count();
    debug_info!("智能探测完成：共 {} 项命中", found);

    Ok(result)
}
