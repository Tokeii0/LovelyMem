//! 注册表取证二次解析
//!
//! 对 Volatility3 已导出的注册表类插件 CSV（userassist / shimcachemem /
//! amcache）做二次结构化解析，归一化出「程序 / 路径 / 时间戳 / 运行次数 / 风险」
//! 字段，并对常见可疑持久化位置做风险标注，供前端「注册表取证」专项视图渲染。
//!
//! 说明：Vol3 的 userassist 插件本身已完成 ROT13 解码，因此这里不再重复解码，
//! 而是聚焦于「统一字段 + 时间线排序 + 风险高亮」这层取证增强。

use serde::Serialize;
use std::collections::HashMap;
use tauri::{WebviewUrl, WebviewWindowBuilder};

/// 可疑路径/命令特征（小写匹配），命中即标注风险
const SUSPICIOUS_PATTERNS: &[&str] = &[
    r"\temp\",
    r"\appdata\local\temp",
    r"\downloads\",
    r"\programdata\",
    r"\users\public",
    r"\public\",
    r"\$recycle",
    r"\windows\temp",
    r"\perflogs\",
    ".tmp",
    "powershell",
    "cmd.exe /c",
    "rundll32",
    "regsvr32",
    "mshta",
    "wscript",
    "cscript",
    "certutil",
    "bitsadmin",
];

#[derive(Serialize)]
pub struct RegForensicEntry {
    /// 程序名 / 值名
    pub name: String,
    /// 完整路径（若有）
    pub path: String,
    /// 时间戳（最后运行 / 最后修改 / 安装）
    pub timestamp: String,
    /// 运行次数（userassist 有；其余为 null）
    pub count: Option<i64>,
    /// 风险原因（命中可疑特征时非空）
    pub risk: Option<String>,
    /// 原始整行字段
    pub raw: HashMap<String, String>,
}

#[derive(Serialize)]
pub struct RegForensicResult {
    /// 识别到的类型：userassist | shimcache | amcache | generic
    pub kind: String,
    /// 原始列名
    pub columns: Vec<String>,
    pub entries: Vec<RegForensicEntry>,
    pub total: usize,
    pub suspicious: usize,
}

/// 在候选列名中找到第一个存在的（大小写不敏感），返回其索引
fn find_col(headers: &[String], candidates: &[&str]) -> Option<usize> {
    for cand in candidates {
        let lc = cand.to_lowercase();
        if let Some(idx) = headers.iter().position(|h| h.to_lowercase() == lc) {
            return Some(idx);
        }
    }
    None
}

/// 找到第一个「列名包含任一关键字」的列索引
fn find_col_contains(headers: &[String], keywords: &[&str]) -> Option<usize> {
    for (idx, h) in headers.iter().enumerate() {
        let hl = h.to_lowercase();
        if keywords.iter().any(|k| hl.contains(k)) {
            return Some(idx);
        }
    }
    None
}

/// 根据列名推断插件类型
fn detect_kind(headers: &[String]) -> String {
    let joined = headers.join(" ").to_lowercase();
    if joined.contains("focus") || (joined.contains("count") && joined.contains("last write")) {
        return "userassist".to_string();
    }
    if joined.contains("sha1") || (joined.contains("product") && joined.contains("company")) {
        return "amcache".to_string();
    }
    if joined.contains("last modified") && joined.contains("path") {
        return "shimcache".to_string();
    }
    "generic".to_string()
}

/// 对给定文本做可疑特征匹配，返回命中的第一个原因
fn assess_risk(text: &str) -> Option<String> {
    let lc = text.to_lowercase();
    for pat in SUSPICIOUS_PATTERNS {
        if lc.contains(pat) {
            return Some(format!("命中可疑特征: {}", pat));
        }
    }
    None
}

/// 解析注册表取证 CSV
#[tauri::command]
pub async fn analyze_registry_csv(csv_path: String) -> Result<RegForensicResult, String> {
    if !std::path::Path::new(&csv_path).exists() {
        return Err(format!("CSV 文件不存在: {}", csv_path));
    }

    let mut rdr = csv::ReaderBuilder::new()
        .flexible(true)
        .from_path(&csv_path)
        .map_err(|e| format!("打开 CSV 失败: {}", e))?;

    let headers: Vec<String> = rdr
        .headers()
        .map_err(|e| format!("读取表头失败: {}", e))?
        .iter()
        .map(|s| s.to_string())
        .collect();

    let kind = detect_kind(&headers);

    // 列定位（大小写不敏感 + 关键字兜底）
    let path_idx = find_col(
        &headers,
        &["Path", "ProcessName", "Program", "File", "Value", "Name"],
    )
    .or_else(|| find_col_contains(&headers, &["path", "name", "program", "file"]));
    let name_idx = find_col(&headers, &["Name", "Value", "Program"]).or(path_idx);
    let time_idx = find_col_contains(
        &headers,
        &["last write", "last modified", "install", "time", "date"],
    );
    let count_idx = find_col(&headers, &["Count", "Execution Count", "RunCount"]);

    let mut entries: Vec<RegForensicEntry> = Vec::new();
    let mut suspicious = 0usize;

    for record in rdr.records() {
        let record = match record {
            Ok(r) => r,
            Err(_) => continue,
        };
        let get = |idx: Option<usize>| -> String {
            idx.and_then(|i| record.get(i))
                .unwrap_or("")
                .trim()
                .to_string()
        };

        let path = get(path_idx);
        let name = {
            let n = get(name_idx);
            if n.is_empty() { path.clone() } else { n }
        };
        let timestamp = get(time_idx);
        let count = count_idx
            .and_then(|i| record.get(i))
            .and_then(|s| s.trim().parse::<i64>().ok());

        let mut raw = HashMap::new();
        for (i, h) in headers.iter().enumerate() {
            raw.insert(h.clone(), record.get(i).unwrap_or("").to_string());
        }

        // 风险评估：对 path + name 一起匹配
        let risk = assess_risk(&format!("{} {}", path, name));
        if risk.is_some() {
            suspicious += 1;
        }

        entries.push(RegForensicEntry {
            name,
            path,
            timestamp,
            count,
            risk,
            raw,
        });
    }

    // 优先按时间戳降序（Vol3 时间为可排序字符串）；无时间则按运行次数降序
    let has_time = entries.iter().any(|e| !e.timestamp.is_empty());
    if has_time {
        entries.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    } else {
        entries.sort_by(|a, b| b.count.unwrap_or(0).cmp(&a.count.unwrap_or(0)));
    }

    let total = entries.len();
    Ok(RegForensicResult {
        kind,
        columns: headers,
        entries,
        total,
        suspicious,
    })
}

/// 打开「注册表取证」窗口，CSV 路径通过 URL 查询参数传入
#[tauri::command]
pub async fn open_registry_forensics_window(
    app: tauri::AppHandle,
    csv_path: String,
) -> Result<(), String> {
    let window_id = uuid::Uuid::new_v4().to_string().replace('-', "")[..16].to_string();
    let window_label = format!("reg-forensics-{}", window_id);

    let url = format!(
        "registry-forensics.html?csv={}",
        urlencoding::encode(&csv_path)
    );

    WebviewWindowBuilder::new(&app, &window_label, WebviewUrl::App(url.into()))
        .title("注册表取证")
        .inner_size(1250.0, 820.0)
        .min_inner_size(880.0, 560.0)
        .center()
        .resizable(true)
        .maximizable(true)
        .decorations(crate::window_manager::should_use_decorations())
        .focused(true)
        .skip_taskbar(false)
        .build()
        .map_err(|e| format!("创建注册表取证窗口失败: {}", e))?;

    Ok(())
}
