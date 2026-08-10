//! IOC（失陷指标）提取
//!
//! 从任意文本或文件中识别常见 IOC：IPv4/IPv6、域名、URL、Email、
//! MD5/SHA1/SHA256 哈希、比特币地址。结果去重并按出现次数排序。
//! 供 IOC 提取工具窗口与字符串搜索联动调用。

use lazy_static::lazy_static;
use regex::Regex;
use serde::Serialize;
use std::collections::HashMap;

/// 从文件提取时的读取上限（64MB），超出部分截断
const MAX_FILE_READ: usize = 64 * 1024 * 1024;

lazy_static! {
    static ref RE_IPV4: Regex =
        Regex::new(r"\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b")
            .unwrap();
    static ref RE_IPV6: Regex =
        Regex::new(r"\b(?:[A-Fa-f0-9]{1,4}:){2,7}[A-Fa-f0-9]{1,4}\b").unwrap();
    static ref RE_URL: Regex = Regex::new(r#"(?:https?|ftp)://[^\s"'<>()]+"#).unwrap();
    static ref RE_EMAIL: Regex =
        Regex::new(r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b").unwrap();
    static ref RE_DOMAIN: Regex =
        Regex::new(r"\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}\b")
            .unwrap();
    static ref RE_MD5: Regex = Regex::new(r"\b[a-fA-F0-9]{32}\b").unwrap();
    static ref RE_SHA1: Regex = Regex::new(r"\b[a-fA-F0-9]{40}\b").unwrap();
    static ref RE_SHA256: Regex = Regex::new(r"\b[a-fA-F0-9]{64}\b").unwrap();
    static ref RE_BTC: Regex = Regex::new(r"\b(?:bc1|[13])[a-zA-HJ-NP-Z0-9]{25,39}\b").unwrap();
}

#[derive(Serialize)]
pub struct IocItem {
    pub value: String,
    pub count: usize,
}

#[derive(Serialize, Default)]
pub struct IocResult {
    pub ipv4: Vec<IocItem>,
    pub ipv6: Vec<IocItem>,
    pub domain: Vec<IocItem>,
    pub url: Vec<IocItem>,
    pub email: Vec<IocItem>,
    pub md5: Vec<IocItem>,
    pub sha1: Vec<IocItem>,
    pub sha256: Vec<IocItem>,
    pub btc: Vec<IocItem>,
    /// 提取来源是否被截断（大文件）
    pub truncated: bool,
}

/// 用正则匹配、去重并按出现次数降序排序
fn collect(re: &Regex, text: &str) -> Vec<IocItem> {
    let mut counts: HashMap<&str, usize> = HashMap::new();
    for m in re.find_iter(text) {
        *counts.entry(m.as_str()).or_insert(0) += 1;
    }
    let mut items: Vec<IocItem> = counts
        .into_iter()
        .map(|(value, count)| IocItem {
            value: value.to_string(),
            count,
        })
        .collect();
    items.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.value.cmp(&b.value)));
    items
}

/// 从文本提取全部 IOC
fn extract(text: &str) -> IocResult {
    // 哈希优先识别，避免 SHA256(64) 被 MD5(32)/SHA1(40) 的边界误吞：正则各自 \b 约束已足够独立
    IocResult {
        ipv4: collect(&RE_IPV4, text),
        ipv6: collect(&RE_IPV6, text),
        domain: collect(&RE_DOMAIN, text),
        url: collect(&RE_URL, text),
        email: collect(&RE_EMAIL, text),
        md5: collect(&RE_MD5, text),
        sha1: collect(&RE_SHA1, text),
        sha256: collect(&RE_SHA256, text),
        btc: collect(&RE_BTC, text),
        truncated: false,
    }
}

/// 从文本提取 IOC
#[tauri::command]
pub async fn extract_ioc_from_text(text: String) -> Result<IocResult, String> {
    Ok(extract(&text))
}

/// 从文件提取 IOC（大文件按 64MB 截断）
#[tauri::command]
pub async fn extract_ioc_from_file(file_path: String) -> Result<IocResult, String> {
    let path = std::path::Path::new(&file_path);
    if !path.exists() {
        return Err(format!("文件不存在: {}", file_path));
    }
    let bytes = std::fs::read(path).map_err(|e| format!("读取文件失败: {}", e))?;
    let truncated = bytes.len() > MAX_FILE_READ;
    let slice = if truncated {
        &bytes[..MAX_FILE_READ]
    } else {
        &bytes[..]
    };
    let text = String::from_utf8_lossy(slice);
    let mut result = extract(&text);
    result.truncated = truncated;
    Ok(result)
}

/// 打开 IOC 提取工具窗口。可选携带初始文本（经 URL 传入，超长则前端改用事件更稳妥，
/// 此处仅用于短文本快速联动）
#[tauri::command]
pub async fn open_ioc_extractor_window(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::{WebviewUrl, WebviewWindowBuilder};

    let window_label = "ioc-extractor";
    if let Some(existing) = tauri::Manager::get_webview_window(&app, window_label) {
        existing
            .set_focus()
            .map_err(|e| format!("聚焦 IOC 窗口失败: {}", e))?;
        return Ok(());
    }

    WebviewWindowBuilder::new(
        &app,
        window_label,
        WebviewUrl::App("ioc-extractor.html".into()),
    )
    .title("IOC 提取")
    .inner_size(1050.0, 780.0)
    .min_inner_size(760.0, 500.0)
    .center()
    .resizable(true)
    .decorations(crate::window_manager::should_use_decorations())
    .focused(true)
    .skip_taskbar(false)
    .build()
    .map_err(|e| format!("创建 IOC 提取窗口失败: {}", e))?;

    Ok(())
}
