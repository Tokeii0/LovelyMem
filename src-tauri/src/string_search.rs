use lazy_static::lazy_static;
use memmap2::MmapOptions;
use rayon::prelude::*;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime};
use tauri::Emitter;
use tokio::sync::mpsc;
use uuid::Uuid;

// 全局搜索取消标志
lazy_static! {
    static ref SEARCH_CANCEL_FLAG: Arc<AtomicBool> = Arc::new(AtomicBool::new(false));
}

// 全局批次结果发送器（用于流式推送搜索结果到前端）
lazy_static! {
    static ref BATCH_SENDER: Mutex<Option<mpsc::UnboundedSender<Vec<FoundString>>>> =
        Mutex::new(None);
}

/// 字符串编码类型
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
pub enum StringEncoding {
    Ascii,
    Utf8,
    Utf16Le,
    Utf16Be,
    Gbk,
}

impl std::fmt::Display for StringEncoding {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            StringEncoding::Ascii => write!(f, "ASCII"),
            StringEncoding::Utf8 => write!(f, "UTF-8"),
            StringEncoding::Utf16Le => write!(f, "UTF-16LE"),
            StringEncoding::Utf16Be => write!(f, "UTF-16BE"),
            StringEncoding::Gbk => write!(f, "GBK"),
        }
    }
}

/// 搜索模式
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SearchMode {
    /// 镜像搜索 - 在内存镜像文件中搜索
    ImageSearch { image_path: String },
    /// 进程搜索 - 在特定进程内存中搜索
    ProcessSearch { process_id: u32 },
    /// 文件搜索 - 在指定文件中搜索
    FileSearch { file_path: String },
    /// 文件夹搜索 - 在指定文件夹及其子文件夹中的所有文件中搜索
    FolderSearch { folder_path: String },
}

/// 搜索配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StringSearchConfig {
    /// 搜索模式
    pub mode: SearchMode,
    /// 最小字符串长度
    pub min_length: usize,
    /// 支持的编码类型
    pub encodings: Vec<StringEncoding>,
    /// 搜索模式（可选）
    pub search_pattern: Option<String>,
    /// 是否使用正则表达式
    pub use_regex: bool,
    /// 是否区分大小写
    pub case_sensitive: bool,
    /// 最大结果数量
    pub max_results: Option<usize>,
    /// 并行线程数
    pub thread_count: Option<usize>,
    /// 启用高熵值过滤
    pub enable_entropy_filter: Option<bool>,
    /// 最小熵值阈值（默认 3.5）
    pub min_entropy: Option<f64>,
    /// 是否使用十六进制搜索模式
    pub use_hex: Option<bool>,
}

impl Default for StringSearchConfig {
    fn default() -> Self {
        Self {
            mode: SearchMode::FileSearch {
                file_path: String::new(),
            },
            min_length: 4,
            encodings: vec![StringEncoding::Ascii, StringEncoding::Utf8],
            search_pattern: None,
            use_regex: false,
            case_sensitive: false,
            max_results: Some(10000),
            thread_count: None,
            enable_entropy_filter: None,
            min_entropy: None,
            use_hex: None,
        }
    }
}

/// 找到的字符串
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FoundString {
    /// 偏移量
    pub offset: u64,
    /// 字符串内容
    pub content: String,
    /// 编码类型
    pub encoding: StringEncoding,
    /// 字节长度
    pub byte_length: usize,
    /// 上下文信息（可选）
    pub context: Option<String>,
    /// 源文件路径（用于文件夹搜索）
    pub source_file: Option<String>,
    /// 源文件完整路径（用于上下文查看）
    pub source_file_path: Option<String>,
    /// 熵值（如果启用了熵值过滤）
    pub entropy: Option<f64>,
}

/// 搜索进度信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchProgress {
    /// 已处理的字节数
    pub processed_bytes: u64,
    /// 总字节数
    pub total_bytes: u64,
    /// 找到的字符串数量
    pub found_count: usize,
    /// 当前状态描述
    pub status: String,
    /// 是否完成
    pub completed: bool,
    /// 扫描日志信息
    pub scan_logs: Vec<ScanLogEntry>,
    /// 扫描统计信息
    pub scan_stats: ScanStats,
}

/// 扫描日志条目
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanLogEntry {
    /// 日志类型
    pub log_type: ScanLogType,
    /// 日志消息
    pub message: String,
    /// 时间戳
    pub timestamp: u64,
    /// 相关路径（可选）
    pub path: Option<String>,
}

/// 扫描日志类型
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ScanLogType {
    /// 信息
    Info,
    /// 警告
    Warning,
    /// 错误
    Error,
    /// 调试
    Debug,
    /// 文件夹扫描
    FolderScan,
    /// 文件处理
    FileProcess,
    /// 文件跳过
    FileSkip,
}

/// 扫描统计信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanStats {
    /// 扫描的文件夹数量
    pub folders_scanned: usize,
    /// 找到的文件数量
    pub files_found: usize,
    /// 跳过的文件数量
    pub files_skipped: usize,
    /// 处理的文件数量
    pub files_processed: usize,
    /// 失败的文件数量
    pub files_failed: usize,
    /// 扫描开始时间
    pub scan_start_time: u64,
    /// 当前扫描深度
    pub current_depth: usize,
    /// 最大扫描深度
    pub max_depth: usize,
    /// 总处理字节数
    pub total_bytes_processed: u64,
    /// 跳过的大文件数量
    pub large_files_skipped: usize,
    /// 空文件数量
    pub empty_files_count: usize,
    /// 系统文件夹跳过数量
    pub system_folders_skipped: usize,
}

impl Default for ScanStats {
    fn default() -> Self {
        Self {
            folders_scanned: 0,
            files_found: 0,
            files_skipped: 0,
            files_processed: 0,
            files_failed: 0,
            scan_start_time: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64,
            current_depth: 0,
            max_depth: 0,
            total_bytes_processed: 0,
            large_files_skipped: 0,
            empty_files_count: 0,
            system_folders_skipped: 0,
        }
    }
}

impl ScanLogEntry {
    /// 创建新的日志条目
    pub fn new(log_type: ScanLogType, message: String, path: Option<String>) -> Self {
        Self {
            log_type,
            message,
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64,
            path,
        }
    }

    /// 创建文件夹扫描日志
    pub fn folder_scan(path: &str) -> Self {
        Self::new(
            ScanLogType::FolderScan,
            format!("正在扫描文件夹: {}", path),
            Some(path.to_string()),
        )
    }

    /// 创建文件处理日志
    pub fn file_process(path: &str) -> Self {
        Self::new(
            ScanLogType::FileProcess,
            format!("处理文件: {}", path),
            Some(path.to_string()),
        )
    }

    /// 创建文件跳过日志
    pub fn file_skip(path: &str, reason: &str) -> Self {
        Self::new(
            ScanLogType::FileSkip,
            format!("跳过文件: {} ({})", path, reason),
            Some(path.to_string()),
        )
    }

    /// 创建警告日志
    pub fn warning(message: String, path: Option<String>) -> Self {
        Self::new(ScanLogType::Warning, message, path)
    }

    /// 创建错误日志
    pub fn error(message: String, path: Option<String>) -> Self {
        Self::new(ScanLogType::Error, message, path)
    }

    /// 创建信息日志
    pub fn info(message: String, path: Option<String>) -> Self {
        Self::new(ScanLogType::Info, message, path)
    }
}

/// 搜索结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StringSearchResult {
    /// 找到的字符串列表
    pub strings: Vec<FoundString>,
    /// 搜索统计信息
    pub stats: SearchStats,
    /// 是否被截断（达到最大结果数）
    pub truncated: bool,
    /// 分页信息
    pub page: usize,
    pub page_size: usize,
    pub total_pages: usize,
    pub has_more: bool,
    pub cache_key: Option<String>,
}

/// 搜索统计信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchStats {
    /// 总处理时间（毫秒）
    pub duration_ms: u64,
    /// 处理的字节数
    pub processed_bytes: u64,
    /// 找到的字符串总数
    pub total_found: usize,
    /// 各编码类型的统计
    pub encoding_stats: std::collections::HashMap<String, usize>,
}

const PAGINATED_CACHE_MAX_ENTRIES: usize = 8;
const PAGINATED_CACHE_TTL: Duration = Duration::from_secs(600);

#[derive(Clone)]
struct PaginatedSearchCacheEntry {
    results: Vec<FoundString>,
    stats: SearchStats,
    truncated: bool,
    created_at: SystemTime,
}

lazy_static! {
    static ref PAGINATED_SEARCH_CACHE: Mutex<HashMap<String, PaginatedSearchCacheEntry>> =
        Mutex::new(HashMap::new());
}

fn prune_paginated_search_cache(cache: &mut HashMap<String, PaginatedSearchCacheEntry>) {
    while cache.len() > PAGINATED_CACHE_MAX_ENTRIES {
        if let Some(oldest_key) = cache
            .iter()
            .min_by_key(|(_, entry)| entry.created_at)
            .map(|(key, _)| key.clone())
        {
            cache.remove(&oldest_key);
        } else {
            break;
        }
    }
}

fn store_paginated_search_cache(
    cache_key: Option<String>,
    entry: PaginatedSearchCacheEntry,
) -> String {
    let mut cache = PAGINATED_SEARCH_CACHE
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    let key = cache_key.unwrap_or_else(|| Uuid::new_v4().to_string());
    cache.insert(key.clone(), entry);
    prune_paginated_search_cache(&mut cache);
    key
}

fn get_paginated_search_cache(cache_key: &str) -> Option<PaginatedSearchCacheEntry> {
    let mut cache = PAGINATED_SEARCH_CACHE
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    if let Some(entry) = cache.get_mut(cache_key) {
        if entry
            .created_at
            .elapsed()
            .unwrap_or_else(|_| Duration::from_secs(0))
            > PAGINATED_CACHE_TTL
        {
            cache.remove(cache_key);
            None
        } else {
            entry.created_at = SystemTime::now();
            Some(entry.clone())
        }
    } else {
        None
    }
}

/// 简单查询结构 - 用于优化的搜索语法
#[derive(Debug, Clone)]
pub struct SimpleQuery {
    /// 必须包含的词 (AND)
    pub positive_terms: Vec<Vec<u8>>,
    /// 必须不包含的词 (NOT)
    pub negative_terms: Vec<Vec<u8>>,
}

impl SimpleQuery {
    /// 解析查询字符串
    pub fn parse(query: &str, case_sensitive: bool) -> Self {
        let mut positive_terms = Vec::new();
        let mut negative_terms = Vec::new();

        let mut chars = query.chars().peekable();
        let mut current_term = String::new();
        let mut in_quote = false;
        let mut is_negative = false;

        while let Some(c) = chars.next() {
            if c == '"' {
                if in_quote {
                    // 引用结束
                    if !current_term.is_empty() {
                        let term_bytes = if case_sensitive {
                            current_term.as_bytes().to_vec()
                        } else {
                            current_term.to_lowercase().as_bytes().to_vec()
                        };

                        if is_negative {
                            negative_terms.push(term_bytes);
                        } else {
                            positive_terms.push(term_bytes);
                        }
                        current_term.clear();
                    }
                    in_quote = false;
                    is_negative = false;
                } else {
                    // 引用开始
                    in_quote = true;
                }
            } else if c == ' ' && !in_quote {
                if !current_term.is_empty() {
                    let term_bytes = if case_sensitive {
                        current_term.as_bytes().to_vec()
                    } else {
                        current_term.to_lowercase().as_bytes().to_vec()
                    };

                    if is_negative {
                        negative_terms.push(term_bytes);
                    } else {
                        positive_terms.push(term_bytes);
                    }
                    current_term.clear();
                }
                is_negative = false;
            } else if c == '-' && !in_quote && current_term.is_empty() {
                is_negative = true;
            } else {
                current_term.push(c);
            }
        }

        // 处理最后一个词
        if !current_term.is_empty() {
            let term_bytes = if case_sensitive {
                current_term.as_bytes().to_vec()
            } else {
                current_term.to_lowercase().as_bytes().to_vec()
            };

            if is_negative {
                negative_terms.push(term_bytes);
            } else {
                positive_terms.push(term_bytes);
            }
        }

        // 如果没有任何术语，但有查询字符串（可能是空引号或仅空格），确保不匹配所有内容
        // 除非原字符串真的是空的，那样应该由上层处理
        // 在这里，如果解析后没有 positive_terms，我们通常认为这是空查询

        SimpleQuery {
            positive_terms,
            negative_terms,
        }
    }
}

/// 字符串提取器
pub struct StringExtractor {
    config: StringSearchConfig,
    regex_pattern: Option<Regex>,
    parsed_query: Option<SimpleQuery>,
    /// 十六进制搜索的字节模式
    hex_pattern: Option<Vec<u8>>,
}

impl StringExtractor {
    /// 计算字符串的香农熵值
    fn calculate_entropy(s: &str) -> f64 {
        if s.is_empty() {
            return 0.0;
        }

        let mut freq: std::collections::HashMap<char, usize> = std::collections::HashMap::new();
        for c in s.chars() {
            *freq.entry(c).or_insert(0) += 1;
        }

        let len = s.chars().count() as f64;
        let mut entropy = 0.0;

        for count in freq.values() {
            let p = *count as f64 / len;
            entropy -= p * p.log2();
        }

        entropy
    }

    /// 编码感知的熵值归一化
    /// CJK 字符集远大于 ASCII，导致中文文本的原始熵值天然偏高（~2.0）
    /// 按 CJK 字符占比做比例偏移，使熵值分类与 ASCII 体系对齐
    fn normalize_entropy_for_encoding(raw_entropy: f64, content: &str, offset: f64) -> f64 {
        if offset <= 0.0 {
            return raw_entropy;
        }
        let total = content.chars().count();
        if total == 0 {
            return raw_entropy;
        }
        let cjk_count = content
            .chars()
            .filter(|c| {
                let code = *c as u32;
                (0x4E00..=0x9FFF).contains(&code)
                    || (0x3400..=0x4DBF).contains(&code)
                    || (0xF900..=0xFAFF).contains(&code)
                    || (0x3000..=0x303F).contains(&code)
                    || (0xFF00..=0xFFEF).contains(&code)
            })
            .count();
        let cjk_ratio = cjk_count as f64 / total as f64;
        (raw_entropy - offset * cjk_ratio).max(0.0)
    }

    /// 创建新的字符串提取器
    pub fn new(config: StringSearchConfig) -> Result<Self, String> {
        let use_hex = config.use_hex.unwrap_or(false);

        // 解析十六进制模式
        let hex_pattern = if let (true, Some(pattern)) = (use_hex, config.search_pattern.as_ref()) {
            Some(Self::parse_hex_pattern(pattern)?)
        } else {
            None
        };

        let regex_pattern = if let (false, true, Some(pattern)) =
            (use_hex, config.use_regex, config.search_pattern.as_ref())
        {
            let mut regex_builder = regex::RegexBuilder::new(pattern);
            if !config.case_sensitive {
                regex_builder.case_insensitive(true);
            }

            Some(
                regex_builder
                    .build()
                    .map_err(|e| format!("正则表达式错误: {}", e))?,
            )
        } else {
            None
        };

        // 解析简单查询语法
        let parsed_query = if let (false, false, Some(pattern)) =
            (use_hex, config.use_regex, config.search_pattern.as_ref())
        {
            // 只有当模式包含空格或引号或减号时才解析，否则作为简单字符串处理
            if pattern.contains(' ') || pattern.contains('"') || pattern.starts_with('-') {
                Some(SimpleQuery::parse(pattern, config.case_sensitive))
            } else {
                None
            }
        } else {
            None
        };

        Ok(StringExtractor {
            config,
            regex_pattern,
            parsed_query,
            hex_pattern,
        })
    }

    /// 解析十六进制模式字符串为字节序列
    /// 支持格式: "4D 5A 90 00", "4D5A9000", "0x4D 0x5A", "4D-5A-90-00", "?? 5A ?? 00"(通配符)
    pub(crate) fn parse_hex_pattern(pattern: &str) -> Result<Vec<u8>, String> {
        let pattern = pattern.trim();
        if pattern.is_empty() {
            return Err("十六进制模式不能为空".to_string());
        }

        // 移除常见前缀和分隔符，提取纯十六进制字符
        let cleaned: String = pattern
            .replace("0x", "")
            .replace("0X", "")
            .replace(' ', "")
            .replace('-', "")
            .replace(',', "")
            .replace(':', "");

        if cleaned.len() % 2 != 0 {
            return Err("十六进制字符串长度必须为偶数".to_string());
        }

        if cleaned.is_empty() {
            return Err("十六进制模式不能为空".to_string());
        }

        let mut bytes = Vec::with_capacity(cleaned.len() / 2);
        let chars: Vec<char> = cleaned.chars().collect();

        for i in (0..chars.len()).step_by(2) {
            let hex_str: String = chars[i..i + 2].iter().collect();
            let byte = u8::from_str_radix(&hex_str, 16)
                .map_err(|_| format!("无效的十六进制值: '{}'", hex_str))?;
            bytes.push(byte);
        }

        Ok(bytes)
    }

    /// 十六进制字节模式搜索 - 在原始数据中搜索字节序列
    fn search_hex_pattern(&self, data: &[u8], base_offset: u64) -> Vec<FoundString> {
        let hex_bytes = match &self.hex_pattern {
            Some(bytes) => bytes,
            None => return Vec::new(),
        };

        if hex_bytes.is_empty() || hex_bytes.len() > data.len() {
            return Vec::new();
        }

        let max_results = self.config.max_results.unwrap_or(10000);
        let mut results = Vec::new();
        let needle_len = hex_bytes.len();
        let context_bytes = 16; // 前后各显示16字节上下文

        let mut pos = 0;
        while pos <= data.len() - needle_len {
            // 检查是否需要取消搜索
            if SEARCH_CANCEL_FLAG.load(Ordering::Relaxed) {
                break;
            }

            if &data[pos..pos + needle_len] == hex_bytes.as_slice() {
                let offset = base_offset + pos as u64;

                // 格式化匹配的字节为十六进制字符串
                let hex_content: String = hex_bytes
                    .iter()
                    .map(|b| format!("{:02X}", b))
                    .collect::<Vec<_>>()
                    .join(" ");

                // 构建上下文：前后各 context_bytes 字节
                let ctx_start = pos.saturating_sub(context_bytes);
                let ctx_end = std::cmp::min(pos + needle_len + context_bytes, data.len());
                let context_hex: String = data[ctx_start..ctx_end]
                    .iter()
                    .map(|b| format!("{:02X}", b))
                    .collect::<Vec<_>>()
                    .join(" ");

                results.push(FoundString {
                    offset,
                    content: hex_content,
                    encoding: StringEncoding::Ascii, // Hex 搜索标记为 ASCII 编码
                    byte_length: needle_len,
                    context: Some(context_hex),
                    source_file: None,
                    source_file_path: None,
                    entropy: None,
                });

                if results.len() >= max_results {
                    break;
                }

                pos += needle_len; // 跳过已匹配的区域，避免重叠
            } else {
                pos += 1;
            }
        }

        results
    }

    /// 从字节数据中提取字符串（并行优化版本）
    pub fn extract_strings(&self, data: &[u8], base_offset: u64) -> Vec<FoundString> {
        use rayon::prelude::*;

        // 如果是十六进制搜索模式，直接走 hex 路径
        if self.hex_pattern.is_some() {
            return self.search_hex_pattern(data, base_offset);
        }

        let encodings: HashSet<StringEncoding> = self.config.encodings.iter().cloned().collect();
        let chunk_size = std::cmp::max(64 * 1024, data.len() / rayon::current_num_threads()); // 64KB 最小块大小

        // 并行处理数据块
        let results: Vec<Vec<FoundString>> = data
            .par_chunks(chunk_size)
            .enumerate()
            .map(|(chunk_idx, chunk)| {
                let chunk_offset = base_offset + (chunk_idx * chunk_size) as u64;
                let mut chunk_results = Vec::new();

                // 提取 ASCII/UTF-8 字符串
                if encodings.contains(&StringEncoding::Ascii)
                    || encodings.contains(&StringEncoding::Utf8)
                {
                    chunk_results.extend(self.extract_ascii_utf8_optimized(chunk, chunk_offset));
                }

                // 提取 UTF-16LE 字符串
                if encodings.contains(&StringEncoding::Utf16Le) {
                    chunk_results.extend(self.extract_utf16le(chunk, chunk_offset));
                }

                // 提取 UTF-16BE 字符串
                if encodings.contains(&StringEncoding::Utf16Be) {
                    chunk_results.extend(self.extract_utf16be(chunk, chunk_offset));
                }

                // 提取 GBK 字符串
                if encodings.contains(&StringEncoding::Gbk) {
                    chunk_results.extend(self.extract_gbk(chunk, chunk_offset));
                }

                chunk_results
            })
            .collect();

        // 合并结果
        let mut final_results = Vec::with_capacity(results.iter().map(|r| r.len()).sum());
        for chunk_results in results {
            final_results.extend(chunk_results);
        }

        // 按偏移量排序
        final_results.sort_by_key(|s| s.offset);

        // 应用最大结果数限制
        if let Some(max_results) = self.config.max_results {
            if final_results.len() > max_results {
                final_results.truncate(max_results);
            }
        }

        final_results
    }

    /// 提取 ASCII/UTF-8 字符串（高度优化版本）
    fn extract_ascii_utf8_optimized(&self, data: &[u8], base_offset: u64) -> Vec<FoundString> {
        let mut results = Vec::new();
        let encodings: HashSet<StringEncoding> = self.config.encodings.iter().cloned().collect();
        let min_len = self.config.min_length;

        // 使用滑动窗口避免重复分配
        let mut window_start = 0;

        while window_start < data.len() {
            // 检查是否需要取消搜索
            if SEARCH_CANCEL_FLAG.load(Ordering::Relaxed) {
                debug_info!("🛑 搜索已被取消");
                break;
            }

            // 快速跳过非可打印字符
            while window_start < data.len() && !self.is_printable_ascii(data[window_start]) {
                window_start += 1;
            }

            if window_start >= data.len() {
                break;
            }

            let string_start = window_start;
            let mut string_end = window_start;

            // 找到字符串结束位置
            while string_end < data.len() && self.is_printable_ascii(data[string_end]) {
                string_end += 1;
            }

            let byte_length = string_end - string_start;
            if byte_length >= min_len {
                // 直接从切片创建字符串，避免中间Vec分配
                let slice = &data[string_start..string_end];

                // 预检查是否匹配搜索条件，避免不必要的字符串创建
                if self.slice_matches_criteria(slice) {
                    let content = String::from_utf8_lossy(slice).into_owned();
                    let is_pure_ascii = slice.iter().all(|&b| b < 128);

                    if is_pure_ascii && encodings.contains(&StringEncoding::Ascii) {
                        // 始终计算熵值并返回，供前端筛选使用
                        let entropy = Self::calculate_entropy(&content);
                        results.push(FoundString {
                            offset: base_offset + string_start as u64,
                            content,
                            encoding: StringEncoding::Ascii,
                            byte_length,
                            context: None,
                            source_file: None,
                            source_file_path: None,
                            entropy: Some(entropy),
                        });
                    } else if encodings.contains(&StringEncoding::Utf8) {
                        if std::str::from_utf8(slice).is_ok() {
                            let entropy = Self::calculate_entropy(&content);
                            results.push(FoundString {
                                offset: base_offset + string_start as u64,
                                content,
                                encoding: StringEncoding::Utf8,
                                byte_length,
                                context: None,
                                source_file: None,
                                source_file_path: None,
                                entropy: Some(entropy),
                            });
                        }
                    }
                }
            }

            window_start = string_end + 1;
        }

        results
    }

    /// 预检查切片是否匹配条件，避免字符串创建
    fn slice_matches_criteria(&self, slice: &[u8]) -> bool {
        if let Some(ref pattern) = self.config.search_pattern {
            if self.config.use_regex {
                // 对于正则表达式，仍需要创建字符串
                let content = String::from_utf8_lossy(slice);
                if let Some(ref regex) = self.regex_pattern {
                    return regex.find(&content).is_some();
                }
            } else if let Some(ref query) = self.parsed_query {
                // 优化的多词查询
                // 1. 检查所有必须包含的词
                for term in &query.positive_terms {
                    if !self.slice_contains_pattern(slice, term) {
                        return false;
                    }
                }
                // 2. 检查所有必须不包含的词
                for term in &query.negative_terms {
                    if self.slice_contains_pattern(slice, term) {
                        return false;
                    }
                }
                return true;
            } else {
                // 对于简单字符串匹配，可以直接在字节级别操作
                return self.slice_contains_pattern(slice, pattern.as_bytes());
            }
        }
        true
    }

    /// 字节级别的模式匹配
    fn slice_contains_pattern(&self, haystack: &[u8], needle: &[u8]) -> bool {
        if needle.is_empty() {
            return true;
        }
        if haystack.len() < needle.len() {
            return false;
        }

        // 简单的Boyer-Moore风格搜索
        let mut i = 0;
        while i <= haystack.len() - needle.len() {
            let mut j = 0;
            while j < needle.len() {
                let hay_byte = if self.config.case_sensitive {
                    haystack[i + j]
                } else {
                    haystack[i + j].to_ascii_lowercase()
                };
                let needle_byte = if self.config.case_sensitive {
                    needle[j]
                } else {
                    needle[j].to_ascii_lowercase()
                };

                if hay_byte != needle_byte {
                    break;
                }
                j += 1;
            }

            if j == needle.len() {
                return true;
            }
            i += 1;
        }
        false
    }

    /// 提取 UTF-16LE 字符串
    fn extract_utf16le(&self, data: &[u8], base_offset: u64) -> Vec<FoundString> {
        let mut results = Vec::new();
        let mut i = 0;

        while i + 1 < data.len() {
            let word = u16::from_le_bytes([data[i], data[i + 1]]);

            if self.is_printable_utf16(word) {
                let start = i;
                let mut utf16_bytes = Vec::new();

                // 收集连续的可打印 UTF-16 字符
                while i + 1 < data.len() {
                    let word = u16::from_le_bytes([data[i], data[i + 1]]);
                    if self.is_printable_utf16(word) {
                        utf16_bytes.push(word);
                        i += 2;
                    } else {
                        break;
                    }
                }

                let byte_length = i - start;
                if utf16_bytes.len() >= self.config.min_length {
                    if let Ok(content) = String::from_utf16(&utf16_bytes) {
                        if self.matches_search_criteria(&content) {
                            let raw_entropy = Self::calculate_entropy(&content);
                            let entropy =
                                Self::normalize_entropy_for_encoding(raw_entropy, &content, 1.5);
                            results.push(FoundString {
                                offset: base_offset + start as u64,
                                content,
                                encoding: StringEncoding::Utf16Le,
                                byte_length,
                                context: None,
                                source_file: None,
                                source_file_path: None,
                                entropy: Some(entropy),
                            });
                        }
                    }
                }
            } else {
                i += 1;
            }
        }

        results
    }

    /// 提取 UTF-16BE 字符串
    fn extract_utf16be(&self, data: &[u8], base_offset: u64) -> Vec<FoundString> {
        let mut results = Vec::new();
        let mut i = 0;

        while i + 1 < data.len() {
            let word = u16::from_be_bytes([data[i], data[i + 1]]);

            if self.is_printable_utf16(word) {
                let start = i;
                let mut utf16_bytes = Vec::new();

                // 收集连续的可打印 UTF-16 字符
                while i + 1 < data.len() {
                    let word = u16::from_be_bytes([data[i], data[i + 1]]);
                    if self.is_printable_utf16(word) {
                        utf16_bytes.push(word);
                        i += 2;
                    } else {
                        break;
                    }
                }

                let byte_length = i - start;
                if utf16_bytes.len() >= self.config.min_length {
                    if let Ok(content) = String::from_utf16(&utf16_bytes) {
                        if self.matches_search_criteria(&content) {
                            let raw_entropy = Self::calculate_entropy(&content);
                            let entropy =
                                Self::normalize_entropy_for_encoding(raw_entropy, &content, 1.5);
                            results.push(FoundString {
                                offset: base_offset + start as u64,
                                content,
                                encoding: StringEncoding::Utf16Be,
                                byte_length,
                                context: None,
                                source_file: None,
                                source_file_path: None,
                                entropy: Some(entropy),
                            });
                        }
                    }
                }
            } else {
                i += 1;
            }
        }

        results
    }

    /// 提取 GBK 字符串（性能优化版）
    /// 核心优化：仅从 GBK 双字节首字节（0x81-0xFE）触发扫描，跳过纯 ASCII 区域
    /// 典型内存转储中 90%+ 的字节 < 0x81，此策略可跳过绝大部分数据
    fn extract_gbk(&self, data: &[u8], base_offset: u64) -> Vec<FoundString> {
        use encoding_rs::GBK;

        let mut results = Vec::new();
        let min_len = self.config.min_length;
        let len = data.len();
        let mut i: usize = 0;
        let mut last_end: usize = 0; // 避免重叠处理

        while i + 1 < len {
            // 每 64KB 检查取消标志
            if i & 0xFFFF == 0 && SEARCH_CANCEL_FLAG.load(Ordering::Relaxed) {
                break;
            }

            // 快速跳过：只寻找 GBK 双字节首字节（0x81-0xFE）
            if data[i] < 0x81 || data[i] > 0xFE {
                i += 1;
                continue;
            }

            // 验证次字节（0x40-0xFE，排除 0x7F）
            if data[i + 1] < 0x40 || data[i + 1] > 0xFE || data[i + 1] == 0x7F {
                i += 1;
                continue;
            }

            // 找到有效 GBK 双字节，向后回溯 ASCII 上下文（限 128 字节，不超过上次结束位置）
            let mut start = i;
            let back_limit = if i > last_end + 128 {
                i - 128
            } else {
                last_end
            };
            while start > back_limit && data[start - 1] >= 0x20 && data[start - 1] <= 0x7E {
                start -= 1;
            }

            // 向前扩展：收集连续的 GBK 双字节 + ASCII 可打印字符
            let mut end = i;
            while end < len {
                if end + 1 < len
                    && data[end] >= 0x81
                    && data[end] <= 0xFE
                    && data[end + 1] >= 0x40
                    && data[end + 1] <= 0xFE
                    && data[end + 1] != 0x7F
                {
                    end += 2;
                } else if data[end] >= 0x20 && data[end] <= 0x7E {
                    end += 1;
                } else {
                    break;
                }
            }

            let slice = &data[start..end];
            let byte_length = slice.len();

            // 字节长度预检（解码后字符数 <= 字节数，提前排除过短序列）
            if byte_length >= min_len {
                let (decoded, _, had_errors) = GBK.decode(slice);

                if !had_errors && decoded.chars().count() >= min_len {
                    // 验证包含 CJK 字符（减少误报）
                    let has_cjk = decoded.chars().any(|c| {
                        let code = c as u32;
                        (0x4E00..=0x9FFF).contains(&code)
                            || (0x3400..=0x4DBF).contains(&code)
                            || (0xF900..=0xFAFF).contains(&code)
                            || (0x3000..=0x303F).contains(&code)
                            || (0xFF00..=0xFFEF).contains(&code)
                    });

                    if has_cjk {
                        let content = decoded.into_owned();
                        if self.matches_search_criteria(&content) {
                            let raw_entropy = Self::calculate_entropy(&content);
                            let entropy =
                                Self::normalize_entropy_for_encoding(raw_entropy, &content, 2.0);
                            results.push(FoundString {
                                offset: base_offset + start as u64,
                                content,
                                encoding: StringEncoding::Gbk,
                                byte_length,
                                context: None,
                                source_file: None,
                                source_file_path: None,
                                entropy: Some(entropy),
                            });
                        }
                    }
                }
            }

            last_end = end;
            i = end;
        }

        results
    }

    /// 检查字节是否为可打印 ASCII 字符
    fn is_printable_ascii(&self, byte: u8) -> bool {
        byte >= 0x20 && byte <= 0x7E
    }

    /// 检查 UTF-16 字符是否可打印
    fn is_printable_utf16(&self, word: u16) -> bool {
        // 基本 ASCII 范围
        if word >= 0x20 && word <= 0x7E {
            return true;
        }
        // 扩展 Unicode 范围（简化版本）
        word >= 0x80 && word < 0xD800 || word > 0xDFFF && word < 0xFFFE
    }

    /// 检查字符串是否匹配搜索条件
    fn matches_search_criteria(&self, content: &str) -> bool {
        if let Some(ref regex) = self.regex_pattern {
            // 使用 find() 而不是 is_match() 来支持在字符串内部查找匹配
            regex.find(content).is_some()
        } else if let Some(ref query) = self.parsed_query {
            // 优化的多词查询
            let content_check = if self.config.case_sensitive {
                content.to_string()
            } else {
                content.to_lowercase()
            };

            // 1. 检查所有必须包含的词
            for term in &query.positive_terms {
                let term_str = String::from_utf8_lossy(term);
                if !content_check.contains(term_str.as_ref()) {
                    return false;
                }
            }
            // 2. 检查所有必须不包含的词
            for term in &query.negative_terms {
                let term_str = String::from_utf8_lossy(term);
                if content_check.contains(term_str.as_ref()) {
                    return false;
                }
            }
            return true;
        } else if let Some(ref pattern) = self.config.search_pattern {
            if self.config.case_sensitive {
                content.contains(pattern)
            } else {
                content.to_lowercase().contains(&pattern.to_lowercase())
            }
        } else {
            true
        }
    }
}

/// 优化的搜索管理器，支持缓存和增量搜索
#[allow(dead_code)]
pub struct OptimizedSearchManager {
    // 结果缓存
    result_cache: Arc<Mutex<HashMap<String, (StringSearchResult, SystemTime)>>>,
    // 文件修改时间缓存
    file_mtime_cache: Arc<Mutex<HashMap<String, SystemTime>>>,
}

impl OptimizedSearchManager {
    pub fn new() -> Self {
        Self {
            result_cache: Arc::new(Mutex::new(HashMap::new())),
            file_mtime_cache: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// 带缓存的搜索
    pub async fn search_with_cache(
        &self,
        config: StringSearchConfig,
        progress_sender: Option<mpsc::UnboundedSender<SearchProgress>>,
    ) -> Result<StringSearchResult, String> {
        let cache_key = self.generate_cache_key(&config);

        // 检查缓存
        if let Some(cached_result) = self.get_cached_result(&cache_key, &config).await? {
            return Ok(cached_result);
        }

        // 执行搜索
        let result = StringSearchManager::search_strings(config.clone(), progress_sender).await?;

        // 缓存结果
        self.cache_result(cache_key, result.clone()).await;

        Ok(result)
    }

    /// 生成缓存键
    fn generate_cache_key(&self, config: &StringSearchConfig) -> String {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};

        let mut hasher = DefaultHasher::new();
        format!("{:?}", config).hash(&mut hasher);
        format!("{:x}", hasher.finish())
    }

    /// 获取缓存结果
    async fn get_cached_result(
        &self,
        cache_key: &str,
        config: &StringSearchConfig,
    ) -> Result<Option<StringSearchResult>, String> {
        let cache = self.result_cache.lock().unwrap_or_else(|e| e.into_inner());

        if let Some((result, cached_time)) = cache.get(cache_key) {
            // 检查文件是否被修改
            if self.is_cache_valid(config, *cached_time).await? {
                return Ok(Some(result.clone()));
            }
        }

        Ok(None)
    }

    /// 检查缓存是否有效
    async fn is_cache_valid(
        &self,
        config: &StringSearchConfig,
        cached_time: SystemTime,
    ) -> Result<bool, String> {
        match &config.mode {
            SearchMode::FileSearch { file_path }
            | SearchMode::ImageSearch {
                image_path: file_path,
            } => {
                let metadata =
                    std::fs::metadata(file_path).map_err(|e| format!("无法获取文件信息: {}", e))?;

                let modified_time = metadata
                    .modified()
                    .map_err(|e| format!("无法获取修改时间: {}", e))?;

                Ok(modified_time <= cached_time)
            }
            _ => Ok(false), // 文件夹搜索和进程搜索不缓存
        }
    }

    /// 缓存结果
    async fn cache_result(&self, cache_key: String, result: StringSearchResult) {
        let mut cache = self.result_cache.lock().unwrap_or_else(|e| e.into_inner());
        cache.insert(cache_key, (result, SystemTime::now()));

        // 限制缓存大小
        if cache.len() > 100 {
            // 移除最旧的条目
            let oldest_key = cache
                .iter()
                .min_by_key(|(_, (_, time))| time)
                .map(|(k, _)| k.clone());

            if let Some(key) = oldest_key {
                cache.remove(&key);
            }
        }
    }
}

/// 字符串搜索管理器
pub struct StringSearchManager;

impl StringSearchManager {
    /// 执行字符串搜索
    pub async fn search_strings(
        config: StringSearchConfig,
        progress_sender: Option<mpsc::UnboundedSender<SearchProgress>>,
    ) -> Result<StringSearchResult, String> {
        let _start_time = std::time::Instant::now();

        match config.mode.clone() {
            SearchMode::ImageSearch { image_path } => {
                Self::search_in_file_optimized(&image_path, config, progress_sender).await
            }
            SearchMode::FileSearch { file_path } => {
                Self::search_in_file_optimized(&file_path, config, progress_sender).await
            }
            SearchMode::FolderSearch { folder_path } => {
                Self::search_in_folder(&folder_path, config, progress_sender).await
            }
            SearchMode::ProcessSearch { process_id } => {
                Self::search_in_process(process_id, config, progress_sender).await
            }
        }
    }

    /// 计算最优块大小
    fn calculate_optimal_chunk_size(data_len: usize) -> usize {
        // 基于数据大小和CPU缓存优化
        let l3_cache_size = 8 * 1024 * 1024; // 假设8MB L3缓存
        let min_chunk = 64 * 1024; // 64KB最小
        let max_chunk = l3_cache_size / 2; // 不超过L3缓存的一半

        let ideal_chunk = data_len / (num_cpus::get() * 2);
        std::cmp::max(min_chunk, std::cmp::min(max_chunk, ideal_chunk))
    }

    /// 计算智能重叠大小
    fn calculate_overlap_size(config: &StringSearchConfig) -> usize {
        // 基于最大可能字符串长度计算重叠
        let max_string_len = config.max_results.unwrap_or(1000).min(8192);
        max_string_len * 4 // UTF-8最多4字节per字符
    }

    /// 创建智能数据块
    fn create_smart_chunks(
        data_len: usize,
        _thread_count: usize,
        chunk_size: usize,
        overlap_size: usize,
    ) -> Vec<(usize, usize, u64)> {
        if data_len <= chunk_size {
            return vec![(0, data_len, 0)];
        }

        let mut chunks = Vec::new();
        let mut start = 0;

        while start < data_len {
            let end = std::cmp::min(start + chunk_size + overlap_size, data_len);
            chunks.push((start, end, start as u64));

            if end >= data_len {
                break;
            }
            start += chunk_size;
        }

        chunks
    }

    /// 去重结果（处理重叠区域的重复）
    fn deduplicate_results(mut results: Vec<FoundString>) -> Vec<FoundString> {
        results.sort_by_key(|s| (s.offset, s.encoding));
        results.dedup_by(|a, b| {
            a.offset == b.offset && a.encoding == b.encoding && a.content == b.content
        });
        results
    }

    /// 使用内存映射的优化文件搜索
    async fn search_in_file_optimized(
        file_path: &str,
        config: StringSearchConfig,
        progress_sender: Option<mpsc::UnboundedSender<SearchProgress>>,
    ) -> Result<StringSearchResult, String> {
        let _start_time = std::time::Instant::now();

        let file = File::open(file_path).map_err(|e| format!("无法打开文件: {}", e))?;

        let file_size = file
            .metadata()
            .map_err(|e| format!("无法获取文件信息: {}", e))?
            .len();

        // 对于小文件直接读取，大文件使用内存映射
        let use_mmap = file_size > 16 * 1024 * 1024; // 16MB以上使用mmap

        if use_mmap {
            let mmap = unsafe {
                MmapOptions::new()
                    .map(&file)
                    .map_err(|e| format!("内存映射失败: {}", e))?
            };

            Self::search_mapped_data(&mmap, config, file_size, progress_sender).await
        } else {
            // 小文件使用原有逻辑
            Self::search_in_file(file_path, config, progress_sender).await
        }
    }

    /// 搜索内存映射的数据
    async fn search_mapped_data(
        data: &[u8],
        config: StringSearchConfig,
        file_size: u64,
        progress_sender: Option<mpsc::UnboundedSender<SearchProgress>>,
    ) -> Result<StringSearchResult, String> {
        let start_time = std::time::Instant::now();

        let extractor =
            StringExtractor::new(config.clone()).map_err(|e| format!("创建提取器失败: {}", e))?;

        // 动态计算最优块大小
        let optimal_chunk_size = Self::calculate_optimal_chunk_size(data.len());
        let thread_count = config
            .thread_count
            .unwrap_or_else(|| std::cmp::min(num_cpus::get(), 8));

        // 智能重叠计算
        let overlap_size = Self::calculate_overlap_size(&config);

        let chunks =
            Self::create_smart_chunks(data.len(), thread_count, optimal_chunk_size, overlap_size);

        // 发送初始进度
        if let Some(ref sender) = progress_sender {
            let _ = sender.send(SearchProgress {
                processed_bytes: 0,
                total_bytes: file_size,
                found_count: 0,
                status: "开始内存映射搜索...".to_string(),
                completed: false,
                scan_logs: vec![],
                scan_stats: ScanStats::default(),
            });
        }

        // 并行处理，支持提前终止
        let processed_count = Arc::new(AtomicUsize::new(0));
        let total_found = Arc::new(AtomicUsize::new(0));
        let should_stop = Arc::new(AtomicBool::new(false));

        let results: Vec<FoundString> = chunks
            .par_iter()
            .flat_map(|(start, end, base_offset)| {
                // 检查是否应该提前终止
                if should_stop.load(Ordering::Relaxed) {
                    return Vec::new();
                }

                let chunk_data = &data[*start..*end];
                let chunk_results = extractor.extract_strings(chunk_data, *base_offset);

                // 更新进度
                let count = processed_count.fetch_add(1, Ordering::Relaxed) + 1;
                let found = total_found.fetch_add(chunk_results.len(), Ordering::Relaxed)
                    + chunk_results.len();

                // 检查是否达到最大结果数限制
                if let Some(max_results) = config.max_results {
                    if found >= max_results {
                        should_stop.store(true, Ordering::Relaxed);
                    }
                }

                // 流式推送该 chunk 的结果到前端
                if !chunk_results.is_empty() {
                    if let Ok(guard) = BATCH_SENDER.lock() {
                        if let Some(ref sender) = *guard {
                            let _ = sender.send(chunk_results.clone());
                        }
                    }
                }

                // 发送进度更新
                if let Some(ref sender) = progress_sender {
                    let processed_bytes = (*end as u64 * count as u64) / chunks.len() as u64;
                    let status = if should_stop.load(Ordering::Relaxed) {
                        format!("已达到最大结果数限制 ({})", config.max_results.unwrap_or(0))
                    } else {
                        format!("处理中... ({}/{})", count, chunks.len())
                    };

                    let _ = sender.send(SearchProgress {
                        processed_bytes,
                        total_bytes: file_size,
                        found_count: found,
                        status,
                        completed: false,
                        scan_logs: vec![],
                        scan_stats: ScanStats::default(),
                    });
                }

                chunk_results
            })
            .collect();

        // 去重和排序
        let mut final_results = Self::deduplicate_results(results);
        final_results.sort_by_key(|s| s.offset);

        // 应用限制
        if let Some(max_results) = config.max_results {
            if final_results.len() > max_results {
                final_results.truncate(max_results);
            }
        }

        let duration = start_time.elapsed();

        let page_size = 500;
        let total_count = final_results.len();
        let total_pages = if total_count == 0 {
            0
        } else {
            (total_count + page_size - 1) / page_size
        };
        let truncated = config.max_results.map_or(false, |max| total_count >= max);
        let has_more = 1 < total_pages;

        let stats = SearchStats {
            duration_ms: duration.as_millis() as u64,
            processed_bytes: file_size,
            total_found: total_count,
            encoding_stats: HashMap::new(),
        };

        let cache_key = if total_pages > 1 {
            Some(store_paginated_search_cache(
                None,
                PaginatedSearchCacheEntry {
                    results: final_results.clone(),
                    stats: stats.clone(),
                    truncated,
                    created_at: SystemTime::now(),
                },
            ))
        } else {
            None
        };

        Ok(StringSearchResult {
            strings: final_results,
            stats,
            truncated,
            page: 1,
            page_size,
            total_pages,
            has_more,
            cache_key,
        })
    }

    /// 在文件夹中搜索字符串（递归遍历所有文件）
    async fn search_in_folder(
        folder_path: &str,
        config: StringSearchConfig,
        progress_sender: Option<mpsc::UnboundedSender<SearchProgress>>,
    ) -> Result<StringSearchResult, String> {
        use std::fs;
        use std::path::Path;

        let start_time = std::time::Instant::now();

        // 检查文件夹是否存在
        let folder_path = Path::new(folder_path);
        if !folder_path.exists() {
            return Err(format!("文件夹不存在: {}", folder_path.display()));
        }

        if !folder_path.is_dir() {
            return Err(format!("路径不是文件夹: {}", folder_path.display()));
        }

        // 初始化日志和统计信息
        let mut scan_logs = Vec::new();
        let mut scan_stats = ScanStats::default();

        // 发送初始进度
        if let Some(ref sender) = progress_sender {
            let _ = sender.send(SearchProgress {
                processed_bytes: 0,
                total_bytes: 0,
                found_count: 0,
                status: "正在扫描文件夹...".to_string(),
                completed: false,
                scan_logs: scan_logs.clone(),
                scan_stats: scan_stats.clone(),
            });
        }

        // 递归收集所有文件
        let mut all_files = Vec::new();
        scan_logs.push(ScanLogEntry::info(
            format!("开始扫描文件夹: {}", folder_path.display()),
            Some(folder_path.display().to_string()),
        ));

        Self::collect_files_recursive(
            folder_path,
            &mut all_files,
            &mut scan_logs,
            &mut scan_stats,
        )?;

        if all_files.is_empty() {
            scan_logs.push(ScanLogEntry::warning("未找到任何文件".to_string(), None));

            // 发送最终进度
            if let Some(ref sender) = progress_sender {
                let _ = sender.send(SearchProgress {
                    processed_bytes: 0,
                    total_bytes: 0,
                    found_count: 0,
                    status: "扫描完成，未找到任何文件".to_string(),
                    completed: true,
                    scan_logs: scan_logs.clone(),
                    scan_stats: scan_stats.clone(),
                });
            }

            return Ok(StringSearchResult {
                strings: Vec::new(),
                stats: SearchStats {
                    duration_ms: start_time.elapsed().as_millis() as u64,
                    processed_bytes: 0,
                    total_found: 0,
                    encoding_stats: HashMap::new(),
                },
                truncated: false,
                page: 1,
                page_size: 50,
                total_pages: 0,
                has_more: false,
                cache_key: None,
            });
        }

        // 计算总文件大小
        let mut total_size = 0u64;
        for file_path in &all_files {
            if let Ok(metadata) = fs::metadata(file_path) {
                total_size += metadata.len();
            }
        }

        // 记录扫描完成日志
        scan_logs.push(ScanLogEntry::info(
            format!(
                "文件夹扫描完成，找到 {} 个文件，总大小 {} MB",
                all_files.len(),
                total_size / (1024 * 1024)
            ),
            None,
        ));

        // 发送文件扫描完成进度
        if let Some(ref sender) = progress_sender {
            let _ = sender.send(SearchProgress {
                processed_bytes: 0,
                total_bytes: total_size,
                found_count: 0,
                status: format!("找到 {} 个文件，开始搜索...", all_files.len()),
                completed: false,
                scan_logs: scan_logs.clone(),
                scan_stats: scan_stats.clone(),
            });
        }

        // 搜索所有文件
        let mut all_results = Vec::new();
        let mut processed_bytes = 0u64;
        let mut total_found = 0usize;
        let mut encoding_stats = HashMap::new();

        for (file_index, file_path) in all_files.iter().enumerate() {
            let file_name = file_path.file_name().unwrap_or_default().to_string_lossy();
            let file_path_str = file_path.display().to_string();

            // 记录开始处理文件
            scan_logs.push(ScanLogEntry::file_process(&file_path_str));

            // 节流进度发送：每10个文件或最后一个文件才发送进度
            let should_send_progress =
                (file_index + 1) % 10 == 0 || file_index == all_files.len() - 1;
            if should_send_progress {
                if let Some(ref sender) = progress_sender {
                    let _ = sender.send(SearchProgress {
                        processed_bytes,
                        total_bytes: total_size,
                        found_count: total_found,
                        status: format!(
                            "搜索文件 {}/{}: {}",
                            file_index + 1,
                            all_files.len(),
                            file_name
                        ),
                        completed: false,
                        scan_logs: Vec::new(), // 不发送完整日志，减少数据量
                        scan_stats: scan_stats.clone(),
                    });
                }
            }

            // 搜索单个文件
            match Self::search_single_file_for_folder(file_path, &config).await {
                Ok((file_results, file_size, file_encoding_stats)) => {
                    let results_count = file_results.len();
                    all_results.extend(file_results);
                    processed_bytes += file_size;
                    total_found += results_count;
                    scan_stats.files_processed += 1;

                    // 记录文件处理成功
                    if results_count > 0 {
                        scan_logs.push(ScanLogEntry::info(
                            format!("文件 {} 找到 {} 个字符串", file_name, results_count),
                            Some(file_path_str.clone()),
                        ));
                    }

                    // 合并编码统计
                    for (encoding, count) in file_encoding_stats {
                        *encoding_stats.entry(encoding).or_insert(0) += count;
                    }
                }
                Err(e) => {
                    scan_stats.files_failed += 1;
                    let error_msg = format!("搜索文件失败 {}: {}", file_name, e);
                    scan_logs.push(ScanLogEntry::error(error_msg.clone(), Some(file_path_str)));
                    debug_info!("⚠️ {}", error_msg);
                    // 继续处理其他文件，不中断整个搜索
                }
            }

            // 检查是否达到最大结果数
            if let Some(max_results) = config.max_results {
                if all_results.len() >= max_results {
                    scan_logs.push(ScanLogEntry::warning(
                        format!("达到最大结果数限制 ({}), 停止搜索", max_results),
                        None,
                    ));
                    break;
                }
            }
        }

        let duration = start_time.elapsed();

        // 记录搜索完成日志
        scan_logs.push(ScanLogEntry::info(
            format!(
                "搜索完成！处理了 {} 个文件，找到 {} 个字符串，用时 {}ms",
                scan_stats.files_processed,
                total_found,
                duration.as_millis()
            ),
            None,
        ));

        // 发送完成进度
        if let Some(ref sender) = progress_sender {
            let _ = sender.send(SearchProgress {
                processed_bytes,
                total_bytes: total_size,
                found_count: total_found,
                status: "搜索完成".to_string(),
                completed: true,
                scan_logs: scan_logs.clone(),
                scan_stats: scan_stats.clone(),
            });
        }

        // 应用搜索模式过滤
        let filtered_results = Self::apply_search_filter(all_results, &config);
        let truncated = config
            .max_results
            .map_or(false, |max| filtered_results.len() >= max);
        let total_count = filtered_results.len();

        // 始终返回完整结果，不进行分页限制
        Ok(StringSearchResult {
            strings: filtered_results,
            stats: SearchStats {
                duration_ms: duration.as_millis() as u64,
                processed_bytes,
                total_found: total_count,
                encoding_stats,
            },
            truncated,
            page: 0,                       // 特殊标记：0表示完整结果
            page_size: total_count.max(1), // 使用实际结果数作为页大小
            total_pages: 1,                // 只有一页，包含所有结果
            has_more: false,
            cache_key: None,
        })
    }

    /// 递归收集文件夹中的所有文件
    fn collect_files_recursive(
        dir_path: &Path,
        files: &mut Vec<PathBuf>,
        scan_logs: &mut Vec<ScanLogEntry>,
        scan_stats: &mut ScanStats,
    ) -> Result<(), String> {
        Self::collect_files_recursive_with_depth(dir_path, files, scan_logs, scan_stats, 0)
    }

    /// 递归收集文件夹中的所有文件（带深度跟踪）
    fn collect_files_recursive_with_depth(
        dir_path: &Path,
        files: &mut Vec<PathBuf>,
        scan_logs: &mut Vec<ScanLogEntry>,
        scan_stats: &mut ScanStats,
        depth: usize,
    ) -> Result<(), String> {
        use std::fs;

        // 更新深度统计
        scan_stats.current_depth = depth;
        if depth > scan_stats.max_depth {
            scan_stats.max_depth = depth;
        }

        // 记录文件夹扫描日志
        let folder_path = dir_path.display().to_string();
        scan_logs.push(ScanLogEntry::folder_scan(&folder_path));
        scan_stats.folders_scanned += 1;

        // 添加深度限制保护（防止无限递归）
        const MAX_DEPTH: usize = 50;
        if depth > MAX_DEPTH {
            let warning_msg = format!("达到最大扫描深度限制 ({}), 跳过更深层文件夹", MAX_DEPTH);
            scan_logs.push(ScanLogEntry::warning(
                warning_msg.clone(),
                Some(folder_path),
            ));

            return Ok(());
        }

        // 检查文件夹权限
        match fs::metadata(dir_path) {
            Ok(metadata) => {
                if !metadata.is_dir() {
                    let error_msg = format!("路径不是文件夹: {}", folder_path);
                    scan_logs.push(ScanLogEntry::error(error_msg.clone(), Some(folder_path)));
                    return Err(error_msg);
                }

                // 检查是否有读取权限
                if metadata.permissions().readonly() {
                    scan_logs.push(ScanLogEntry::warning(
                        format!("文件夹为只读: {}", folder_path),
                        Some(folder_path.clone()),
                    ));
                }
            }
            Err(e) => {
                let error_msg = format!("无法获取文件夹元数据 {}: {}", folder_path, e);
                scan_logs.push(ScanLogEntry::error(error_msg.clone(), Some(folder_path)));
                return Err(error_msg);
            }
        }

        let entries = match fs::read_dir(dir_path) {
            Ok(entries) => entries,
            Err(e) => {
                let error_msg = format!("无法读取文件夹 {} (错误: {})", folder_path, e);
                scan_logs.push(ScanLogEntry::error(error_msg.clone(), Some(folder_path)));
                debug_info!("❌ {}", error_msg);
                return Err(error_msg);
            }
        };

        let mut entry_count = 0;
        let mut file_count = 0;
        let mut dir_count = 0;
        let mut error_count = 0;

        for entry in entries {
            entry_count += 1;

            let entry = match entry {
                Ok(entry) => entry,
                Err(e) => {
                    error_count += 1;
                    let error_msg = format!("读取文件夹条目失败 (条目 {}): {}", entry_count, e);
                    scan_logs.push(ScanLogEntry::error(
                        error_msg.clone(),
                        Some(folder_path.clone()),
                    ));
                    debug_info!("⚠️ {}", error_msg);
                    continue; // 继续处理其他条目
                }
            };

            let path = entry.path();
            let path_str = path.display().to_string();

            // 检查路径长度（Windows 路径长度限制）
            if path_str.len() > 260 {
                scan_logs.push(ScanLogEntry::warning(
                    format!(
                        "路径过长，可能导致问题: {} (长度: {})",
                        path_str,
                        path_str.len()
                    ),
                    Some(path_str.clone()),
                ));
            }

            if path.is_file() {
                file_count += 1;

                scan_logs.push(ScanLogEntry::info(
                    format!(
                        "找到文件: {}",
                        path.file_name().unwrap_or_default().to_string_lossy()
                    ),
                    Some(path_str),
                ));
                files.push(path);
                scan_stats.files_found += 1;
            } else if path.is_dir() {
                dir_count += 1;

                // 检查是否是系统文件夹或隐藏文件夹
                if let Some(folder_name) = path.file_name() {
                    let folder_name_str = folder_name.to_string_lossy();
                    if folder_name_str.starts_with('.')
                        || folder_name_str == "System Volume Information"
                        || folder_name_str == "$RECYCLE.BIN"
                        || folder_name_str == "pagefile.sys"
                        || folder_name_str == "hiberfil.sys"
                    {
                        scan_stats.system_folders_skipped += 1;
                        scan_logs.push(ScanLogEntry::warning(
                            format!("跳过系统/隐藏文件夹: {}", folder_name_str),
                            Some(path_str),
                        ));

                        continue;
                    }
                }

                // 递归处理子文件夹
                if let Err(e) = Self::collect_files_recursive_with_depth(
                    &path,
                    files,
                    scan_logs,
                    scan_stats,
                    depth + 1,
                ) {
                    // 记录子文件夹处理失败，但继续处理其他文件夹
                    let warning_msg = format!(
                        "处理子文件夹失败: {} (错误: {})",
                        path.file_name().unwrap_or_default().to_string_lossy(),
                        e
                    );
                    scan_logs.push(ScanLogEntry::warning(warning_msg.clone(), Some(path_str)));
                    debug_info!("⚠️ {}", warning_msg);
                }
            } else {
                // 既不是文件也不是文件夹的特殊条目（如符号链接等）
                let entry_type = if path.is_symlink() {
                    "符号链接"
                } else {
                    "特殊条目"
                };
                scan_logs.push(ScanLogEntry::warning(
                    format!(
                        "跳过{}: {}",
                        entry_type,
                        path.file_name().unwrap_or_default().to_string_lossy()
                    ),
                    Some(path_str.clone()),
                ));
            }
        }

        // 记录文件夹扫描统计
        let summary_msg = format!(
            "文件夹 {} 扫描完成: {} 个条目 ({} 文件, {} 子文件夹, {} 错误)",
            dir_path.file_name().unwrap_or_default().to_string_lossy(),
            entry_count,
            file_count,
            dir_count,
            error_count
        );
        scan_logs.push(ScanLogEntry::info(summary_msg.clone(), Some(folder_path)));

        Ok(())
    }

    /// 为文件夹搜索搜索单个文件
    async fn search_single_file_for_folder(
        file_path: &Path,
        config: &StringSearchConfig,
    ) -> Result<(Vec<FoundString>, u64, HashMap<String, usize>), String> {
        Self::search_single_file_for_folder_with_stats(file_path, config, None).await
    }

    /// 为文件夹搜索搜索单个文件（带统计信息）
    async fn search_single_file_for_folder_with_stats(
        file_path: &Path,
        config: &StringSearchConfig,
        scan_stats: Option<&mut ScanStats>,
    ) -> Result<(Vec<FoundString>, u64, HashMap<String, usize>), String> {
        use std::fs::File;
        use std::io::{BufReader, Read};

        // 检查文件是否存在
        if !file_path.exists() {
            return Err(format!("文件不存在: {}", file_path.display()));
        }

        // 获取文件大小
        let file_size = std::fs::metadata(file_path)
            .map_err(|e| format!("无法获取文件信息: {}", e))?
            .len();

        // 跳过过大的文件（超过1GB）
        const MAX_FILE_SIZE: u64 = 1024 * 1024 * 1024; // 1GB
        if file_size > MAX_FILE_SIZE {
            if let Some(stats) = scan_stats {
                stats.large_files_skipped += 1;
            }

            return Ok((Vec::new(), file_size, HashMap::new()));
        }

        // 跳过空文件
        if file_size == 0 {
            if let Some(stats) = scan_stats {
                stats.empty_files_count += 1;
            }

            return Ok((Vec::new(), 0, HashMap::new()));
        }

        // 更新处理字节数统计
        if let Some(stats) = scan_stats {
            stats.total_bytes_processed += file_size;
        }

        // 读取文件数据
        let file = File::open(file_path).map_err(|e| format!("无法打开文件: {}", e))?;

        let mut buffer = Vec::with_capacity(file_size as usize);
        let mut reader = BufReader::new(file);
        reader
            .read_to_end(&mut buffer)
            .map_err(|e| format!("读取文件失败: {}", e))?;

        // 创建字符串提取器
        let extractor =
            StringExtractor::new(config.clone()).map_err(|e| format!("创建提取器失败: {}", e))?;

        // 提取字符串
        let mut results = extractor.extract_strings(&buffer, 0);

        // 为每个结果设置源文件路径
        let file_name = file_path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        let file_path_str = file_path.to_string_lossy().to_string();

        for result in &mut results {
            result.source_file = Some(file_name.clone());
            result.source_file_path = Some(file_path_str.clone());
        }

        // 生成编码统计
        let mut encoding_stats = HashMap::new();
        for result in &results {
            *encoding_stats
                .entry(result.encoding.to_string())
                .or_insert(0) += 1;
        }

        Ok((results, file_size, encoding_stats))
    }

    /// 应用搜索过滤器
    fn apply_search_filter(
        results: Vec<FoundString>,
        config: &StringSearchConfig,
    ) -> Vec<FoundString> {
        if let Some(ref pattern) = config.search_pattern {
            if pattern.is_empty() {
                return results;
            }

            if config.use_regex {
                // 使用正则表达式过滤
                let mut regex_builder = regex::RegexBuilder::new(pattern);
                if !config.case_sensitive {
                    regex_builder.case_insensitive(true);
                }

                match regex_builder.build() {
                    Ok(re) => results
                        .into_iter()
                        .filter(|s| re.find(&s.content).is_some())
                        .collect(),
                    Err(_) => results,
                }
            } else {
                // 使用简单字符串匹配
                let search_pattern = if config.case_sensitive {
                    pattern.clone()
                } else {
                    pattern.to_lowercase()
                };

                results
                    .into_iter()
                    .filter(|s| {
                        let content = if config.case_sensitive {
                            s.content.clone()
                        } else {
                            s.content.to_lowercase()
                        };
                        content.contains(&search_pattern)
                    })
                    .collect()
            }
        } else {
            results
        }
    }

    /// 在文件中搜索字符串
    async fn search_in_file(
        file_path: &str,
        config: StringSearchConfig,
        progress_sender: Option<mpsc::UnboundedSender<SearchProgress>>,
    ) -> Result<StringSearchResult, String> {
        let start_time = std::time::Instant::now();

        // 检查文件是否存在
        if !Path::new(file_path).exists() {
            return Err(format!("文件不存在: {}", file_path));
        }

        // 获取文件大小
        let file_size = std::fs::metadata(file_path)
            .map_err(|e| format!("无法获取文件信息: {}", e))?
            .len();

        // 发送初始进度
        if let Some(ref sender) = progress_sender {
            let _ = sender.send(SearchProgress {
                processed_bytes: 0,
                total_bytes: file_size,
                found_count: 0,
                status: "开始读取文件...".to_string(),
                completed: false,
                scan_logs: vec![ScanLogEntry::info(
                    format!("开始搜索文件: {}", file_path),
                    Some(file_path.to_string()),
                )],
                scan_stats: ScanStats::default(),
            });
        }

        // 读取文件数据到内存
        let mut file = File::open(file_path).map_err(|e| format!("无法打开文件: {}", e))?;

        let mut buffer = Vec::new();
        file.read_to_end(&mut buffer)
            .map_err(|e| format!("读取文件失败: {}", e))?;

        let data = &buffer[..];

        // 创建字符串提取器
        let extractor =
            StringExtractor::new(config.clone()).map_err(|e| format!("创建提取器失败: {}", e))?;

        // 计算并行处理的块大小
        let thread_count = config
            .thread_count
            .unwrap_or_else(|| std::cmp::min(num_cpus::get(), 8));

        let chunk_size = if data.len() < 16 * 1024 * 1024 {
            // < 16MB
            data.len()
        } else {
            data.len() / thread_count
        };

        let overlap_size = 4096; // 4KB 重叠以避免跨边界字符串丢失

        // 创建处理块
        let chunks: Vec<(usize, usize, u64)> = if chunk_size >= data.len() {
            vec![(0, data.len(), 0)]
        } else {
            (0..thread_count)
                .map(|i| {
                    let start = i * chunk_size;
                    let end = if i == thread_count - 1 {
                        data.len()
                    } else {
                        std::cmp::min((i + 1) * chunk_size + overlap_size, data.len())
                    };
                    (start, end, start as u64)
                })
                .collect()
        };

        // 发送处理开始进度
        if let Some(ref sender) = progress_sender {
            let _ = sender.send(SearchProgress {
                processed_bytes: 0,
                total_bytes: file_size,
                found_count: 0,
                status: format!("开始并行处理 ({} 个线程)...", thread_count),
                completed: false,
                scan_logs: vec![ScanLogEntry::info(
                    format!("开始并行处理文件，使用 {} 个线程", thread_count),
                    Some(file_path.to_string()),
                )],
                scan_stats: ScanStats::default(),
            });
        }

        // 并行处理块
        let processed_count = Arc::new(AtomicUsize::new(0));
        let total_found = Arc::new(AtomicUsize::new(0));

        let results: Vec<FoundString> = chunks
            .par_iter()
            .flat_map(|(start, end, base_offset)| {
                let chunk_data = &data[*start..*end];
                let chunk_results = extractor.extract_strings(chunk_data, *base_offset);

                // 更新进度
                let count = processed_count.fetch_add(1, Ordering::Relaxed) + 1;
                let found = total_found.fetch_add(chunk_results.len(), Ordering::Relaxed)
                    + chunk_results.len();

                if let Some(ref sender) = progress_sender {
                    let processed_bytes = (*end as u64 * count as u64) / chunks.len() as u64;
                    let _ = sender.send(SearchProgress {
                        processed_bytes,
                        total_bytes: file_size,
                        found_count: found,
                        status: format!("处理中... ({}/{})", count, chunks.len()),
                        completed: false,
                        scan_logs: vec![ScanLogEntry::info(
                            format!("处理数据块 {}/{}", count, chunks.len()),
                            None,
                        )],
                        scan_stats: ScanStats {
                            folders_scanned: 0,
                            files_found: 1,
                            files_skipped: 0,
                            files_processed: if count == chunks.len() { 1 } else { 0 },
                            files_failed: 0,
                            scan_start_time: std::time::SystemTime::now()
                                .duration_since(std::time::UNIX_EPOCH)
                                .unwrap_or_default()
                                .as_millis() as u64,
                            current_depth: 0,
                            max_depth: 0,
                            total_bytes_processed: processed_bytes,
                            large_files_skipped: 0,
                            empty_files_count: 0,
                            system_folders_skipped: 0,
                        },
                    });
                }

                chunk_results
            })
            .collect();

        // 计算统计信息
        let duration = start_time.elapsed();
        let mut encoding_stats = std::collections::HashMap::new();

        for string in &results {
            let encoding_name = string.encoding.to_string();
            *encoding_stats.entry(encoding_name).or_insert(0) += 1;
        }

        let truncated = config.max_results.map_or(false, |max| results.len() >= max);

        // 发送完成进度
        if let Some(ref sender) = progress_sender {
            let _ = sender.send(SearchProgress {
                processed_bytes: file_size,
                total_bytes: file_size,
                found_count: results.len(),
                status: "搜索完成".to_string(),
                completed: true,
                scan_logs: vec![ScanLogEntry::info(
                    format!(
                        "文件搜索完成，找到 {} 个字符串，用时 {}ms",
                        results.len(),
                        duration.as_millis()
                    ),
                    Some(file_path.to_string()),
                )],
                scan_stats: ScanStats {
                    folders_scanned: 0,
                    files_found: 1,
                    files_skipped: 0,
                    files_processed: 1,
                    files_failed: 0,
                    scan_start_time: std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis() as u64,
                    current_depth: 0,
                    max_depth: 0,
                    total_bytes_processed: file_size,
                    large_files_skipped: 0,
                    empty_files_count: 0,
                    system_folders_skipped: 0,
                },
            });
        }

        // 计算分页信息
        let page_size = 500; // 每页500条结果，提升性能
        let total_count = total_found.load(Ordering::Relaxed);
        let total_pages = if total_count == 0 {
            0
        } else {
            (total_count + page_size - 1) / page_size
        };
        let current_page = 1; // 第一页
        let has_more = current_page < total_pages;

        let stats = SearchStats {
            duration_ms: duration.as_millis() as u64,
            processed_bytes: file_size,
            total_found: total_count,
            encoding_stats,
        };

        let cache_key = if total_pages > 1 {
            Some(store_paginated_search_cache(
                None,
                PaginatedSearchCacheEntry {
                    results: results.clone(),
                    stats: stats.clone(),
                    truncated,
                    created_at: SystemTime::now(),
                },
            ))
        } else {
            None
        };

        Ok(StringSearchResult {
            strings: results,
            stats,
            truncated,
            page: current_page,
            page_size,
            total_pages,
            has_more,
            cache_key,
        })
    }

    /// 在进程内存中搜索字符串
    async fn search_in_process(
        _process_id: u32,
        _config: StringSearchConfig,
        progress_sender: Option<mpsc::UnboundedSender<SearchProgress>>,
    ) -> Result<StringSearchResult, String> {
        // 发送错误进度
        if let Some(ref sender) = progress_sender {
            let _ = sender.send(SearchProgress {
                processed_bytes: 0,
                total_bytes: 0,
                found_count: 0,
                status: "进程内存搜索功能暂未实现".to_string(),
                completed: true,
                scan_logs: vec![ScanLogEntry::error(
                    "进程内存搜索功能暂未实现".to_string(),
                    None,
                )],
                scan_stats: ScanStats::default(),
            });
        }

        Err("进程内存搜索功能暂未实现".to_string())
    }
}

/// Tauri 命令：执行字符串搜索
#[tauri::command]
pub async fn execute_string_search(
    config: StringSearchConfig,
) -> Result<StringSearchResult, String> {
    crate::integrity_check!();
    StringSearchManager::search_strings(config, None).await
}

/// Tauri 命令：执行带进度的字符串搜索
#[tauri::command]
pub async fn execute_string_search_with_progress(
    config: StringSearchConfig,
    app_handle: tauri::AppHandle,
) -> Result<StringSearchResult, String> {
    use tauri::Emitter;

    // 重置取消标志
    SEARCH_CANCEL_FLAG.store(false, Ordering::Relaxed);
    debug_info!("🔍 开始新的搜索，已重置取消标志");

    // 创建进度通道
    let (progress_sender, mut progress_receiver) = mpsc::unbounded_channel();

    // 启动进度监听任务
    let app_handle_clone = app_handle.clone();
    tokio::spawn(async move {
        while let Some(progress) = progress_receiver.recv().await {
            if let Err(e) = app_handle_clone.emit("string-search-progress", &progress) {
                debug_error!("发送进度事件失败: {}", e);
            }
        }
    });

    // 创建批次结果通道（流式推送搜索结果）
    let (batch_sender, mut batch_receiver) = mpsc::unbounded_channel::<Vec<FoundString>>();
    let app_handle_batch = app_handle.clone();
    tokio::spawn(async move {
        while let Some(batch) = batch_receiver.recv().await {
            if let Err(e) = app_handle_batch.emit("string-search-batch", &batch) {
                debug_error!("发送批次结果事件失败: {}", e);
            }
        }
    });

    // 存储到全局以便 search_mapped_data 等函数使用
    {
        let mut guard = BATCH_SENDER.lock().unwrap();
        *guard = Some(batch_sender);
    }

    // 在后台任务中执行搜索，避免阻塞主线程
    let config_clone = config.clone();
    let app_handle_clone = app_handle.clone();

    tokio::spawn(async move {
        let result = StringSearchManager::search_strings(config_clone, Some(progress_sender)).await;

        // 清理批次通道
        {
            let mut guard = BATCH_SENDER.lock().unwrap();
            *guard = None;
        }

        // 发送完成事件
        match &result {
            Ok(search_result) => {
                if let Err(e) = app_handle_clone.emit("string-search-completed", search_result) {
                    debug_error!("发送完成事件失败: {}", e);
                }
            }
            Err(error) => {
                if let Err(e) = app_handle_clone.emit("string-search-error", error) {
                    debug_error!("发送错误事件失败: {}", e);
                }
            }
        }
    });

    // 立即返回一个占位结果，真正的结果通过事件发送
    Ok(StringSearchResult {
        strings: vec![],
        stats: SearchStats {
            duration_ms: 0,
            processed_bytes: 0,
            total_found: 0,
            encoding_stats: std::collections::HashMap::new(),
        },
        truncated: false,
        page: 1,
        page_size: 500,
        total_pages: 1,
        has_more: false,
        cache_key: None,
    })
}

/// Tauri 命令：停止字符串搜索
#[tauri::command]
pub async fn stop_string_search() -> Result<(), String> {
    debug_info!("🛑 收到停止搜索请求");
    SEARCH_CANCEL_FLAG.store(true, Ordering::Relaxed);
    Ok(())
}

/// Tauri 命令：获取默认搜索配置
#[tauri::command]
pub async fn get_default_string_search_config() -> Result<StringSearchConfig, String> {
    Ok(StringSearchConfig::default())
}

/// Tauri 命令：验证搜索配置
#[tauri::command]
pub async fn validate_string_search_config(config: StringSearchConfig) -> Result<bool, String> {
    // 基本验证
    if config.min_length == 0 {
        return Err("最小字符串长度必须大于0".to_string());
    }

    if config.encodings.is_empty() {
        return Err("必须选择至少一种编码类型".to_string());
    }

    // 验证搜索模式
    match &config.mode {
        SearchMode::ImageSearch { image_path } => {
            if image_path.is_empty() {
                return Err("镜像文件路径不能为空".to_string());
            }

            if !Path::new(image_path).exists() {
                return Err(format!("镜像文件不存在: {}", image_path));
            }
        }
        SearchMode::FileSearch { file_path } => {
            if file_path.is_empty() {
                return Err("文件路径不能为空".to_string());
            }

            if !Path::new(file_path).exists() {
                return Err(format!("文件不存在: {}", file_path));
            }
        }
        SearchMode::FolderSearch { folder_path } => {
            if folder_path.is_empty() {
                return Err("文件夹路径不能为空".to_string());
            }

            let path = Path::new(folder_path);
            if !path.exists() {
                return Err(format!("文件夹不存在: {}", folder_path));
            }

            if !path.is_dir() {
                return Err(format!("路径不是文件夹: {}", folder_path));
            }
        }
        SearchMode::ProcessSearch { process_id } => {
            if *process_id == 0 {
                return Err("进程ID不能为0".to_string());
            }
        }
    }

    // 验证正则表达式
    if let (true, Some(pattern)) = (config.use_regex, config.search_pattern.as_ref()) {
        if let Err(e) = Regex::new(pattern) {
            return Err(format!("正则表达式错误: {}", e));
        }
    }

    // 验证十六进制模式
    if config.use_hex.unwrap_or(false) {
        if let Some(ref pattern) = config.search_pattern {
            if let Err(e) = StringExtractor::parse_hex_pattern(pattern) {
                return Err(format!("十六进制格式错误: {}", e));
            }
        } else {
            return Err("启用十六进制搜索时必须提供搜索模式".to_string());
        }
    }

    Ok(true)
}

/// Tauri 命令：读取文件指定范围的数据
#[tauri::command]
pub async fn read_file_range(path: String, start: u64, length: u64) -> Result<Vec<u8>, String> {
    use std::fs::File;
    use std::io::{Read, Seek, SeekFrom};

    let mut file = File::open(&path).map_err(|e| format!("无法打开文件 {}: {}", path, e))?;

    // 获取文件大小
    let file_size = file
        .metadata()
        .map_err(|e| format!("无法获取文件信息: {}", e))?
        .len();

    // 检查范围是否有效
    if start >= file_size {
        return Err(format!("起始偏移量 {} 超出文件大小 {}", start, file_size));
    }

    // 调整读取长度，确保不超出文件末尾
    let actual_length = std::cmp::min(length, file_size - start);

    // 定位到指定位置
    file.seek(SeekFrom::Start(start))
        .map_err(|e| format!("无法定位到偏移量 {}: {}", start, e))?;

    // 读取数据
    let mut buffer = vec![0u8; actual_length as usize];
    file.read_exact(&mut buffer)
        .map_err(|e| format!("读取文件数据失败: {}", e))?;

    Ok(buffer)
}

/// Tauri 命令：分页搜索字符串
#[tauri::command]
pub async fn execute_string_search_paginated(
    config: StringSearchConfig,
    page: usize,
    page_size: usize,
    cache_key: Option<String>,
    window: tauri::Window,
) -> Result<StringSearchResult, String> {
    // 验证配置
    validate_string_search_config(config.clone()).await?;

    match config.mode.clone() {
        SearchMode::FileSearch { file_path } => {
            search_in_file_paginated(
                &file_path,
                config,
                page,
                page_size,
                cache_key.clone(),
                window,
            )
            .await
        }
        SearchMode::ImageSearch { image_path } => {
            search_in_file_paginated(
                &image_path,
                config,
                page,
                page_size,
                cache_key.clone(),
                window,
            )
            .await
        }
        SearchMode::FolderSearch { folder_path } => {
            search_in_folder_paginated(&folder_path, config, page, page_size, cache_key, window)
                .await
        }
        SearchMode::ProcessSearch { process_id: _ } => {
            // 进程搜索暂不支持分页
            Err("进程搜索暂不支持分页功能".to_string())
        }
    }
}

/// 在文件中分页搜索字符串（优化版本）
async fn search_in_file_paginated(
    file_path: &str,
    config: StringSearchConfig,
    page: usize,
    page_size: usize,
    cache_key: Option<String>,
    window: tauri::Window,
) -> Result<StringSearchResult, String> {
    use std::fs::File;
    use std::io::{BufReader, Read};

    let start_time = std::time::Instant::now();

    if let Some(ref key) = cache_key {
        if let Some(entry) = get_paginated_search_cache(key) {
            let PaginatedSearchCacheEntry {
                results: cached_results,
                stats,
                truncated,
                ..
            } = entry;

            let total_count = cached_results.len();
            let total_pages = if total_count == 0 {
                0
            } else {
                (total_count + page_size - 1) / page_size
            };
            let page_results = apply_pagination(&cached_results, page, page_size);
            let has_more = page < total_pages;

            return Ok(StringSearchResult {
                strings: page_results,
                stats,
                truncated,
                page,
                page_size,
                total_pages,
                has_more,
                cache_key: Some(key.clone()),
            });
        }
    }

    let file = File::open(file_path).map_err(|e| format!("无法打开文件 {}: {}", file_path, e))?;

    let file_size = file
        .metadata()
        .map_err(|e| format!("无法获取文件信息: {}", e))?
        .len();

    // 对于大文件，使用流式处理
    let use_streaming = file_size > 100 * 1024 * 1024; // 100MB 以上使用流式处理

    let (filtered_results, encoding_stats) = if use_streaming {
        search_file_streaming(file, config.clone()).await?
    } else {
        // 小文件直接加载到内存
        let mut reader = BufReader::new(file);
        let mut buffer = Vec::with_capacity(file_size as usize);
        reader
            .read_to_end(&mut buffer)
            .map_err(|e| format!("读取文件失败: {}", e))?;

        search_buffer_paginated(buffer, config.clone()).await?
    };

    let total_count = filtered_results.len();
    let total_pages = if total_count == 0 {
        0
    } else {
        (total_count + page_size - 1) / page_size
    };
    let page_results = apply_pagination(&filtered_results, page, page_size);
    let has_more = page < total_pages;
    let duration = start_time.elapsed();

    let truncated = config.max_results.map_or(false, |max| total_count >= max);

    let stats = SearchStats {
        duration_ms: duration.as_millis() as u64,
        processed_bytes: file_size,
        total_found: total_count,
        encoding_stats,
    };

    let cache_identifier = if total_pages > 1 {
        Some(store_paginated_search_cache(
            cache_key,
            PaginatedSearchCacheEntry {
                results: filtered_results.clone(),
                stats: stats.clone(),
                truncated,
                created_at: SystemTime::now(),
            },
        ))
    } else {
        None
    };

    // 发送完成事件
    let _ = window.emit(
        "string-search-progress",
        SearchProgress {
            processed_bytes: file_size,
            total_bytes: file_size,
            found_count: total_count,
            status: "搜索完成".to_string(),
            completed: true,
            scan_logs: vec![ScanLogEntry::info(
                format!("文件搜索完成，找到 {} 个字符串", total_count),
                Some(file_path.to_string()),
            )],
            scan_stats: ScanStats::default(),
        },
    );

    Ok(StringSearchResult {
        strings: page_results,
        stats,
        truncated,
        page,
        page_size,
        total_pages,
        has_more,
        cache_key: cache_identifier,
    })
}

/// 流式搜索大文件
async fn search_file_streaming(
    file: File,
    config: StringSearchConfig,
) -> Result<(Vec<FoundString>, HashMap<String, usize>), String> {
    use std::io::{BufReader, Read};

    const CHUNK_SIZE: usize = 1024 * 1024; // 1MB 块大小
    let mut reader = BufReader::with_capacity(CHUNK_SIZE, file);
    let mut buffer = vec![0u8; CHUNK_SIZE];
    let mut all_results = Vec::new();
    let mut offset = 0u64;

    // 创建字符串提取器
    let extractor =
        StringExtractor::new(config.clone()).map_err(|e| format!("创建提取器失败: {}", e))?;

    // 分块读取和处理
    loop {
        let bytes_read = reader
            .read(&mut buffer)
            .map_err(|e| format!("读取文件块失败: {}", e))?;

        if bytes_read == 0 {
            break;
        }

        let chunk = &buffer[..bytes_read];
        let chunk_results = extractor.extract_strings(chunk, offset);
        all_results.extend(chunk_results);

        offset += bytes_read as u64;
    }

    // 应用搜索模式过滤
    let filtered_results = apply_search_filter(all_results, &config);

    // 生成编码统计
    let mut encoding_stats = HashMap::new();
    for encoding in &config.encodings {
        *encoding_stats.entry(encoding.to_string()).or_insert(0) += 1;
    }

    Ok((filtered_results, encoding_stats))
}

/// 在内存缓冲区中搜索并返回完整结果
async fn search_buffer_paginated(
    buffer: Vec<u8>,
    config: StringSearchConfig,
) -> Result<(Vec<FoundString>, HashMap<String, usize>), String> {
    // 创建字符串提取器
    let extractor =
        StringExtractor::new(config.clone()).map_err(|e| format!("创建提取器失败: {}", e))?;

    // 提取所有字符串
    let all_strings = extractor.extract_strings(&buffer, 0);

    // 应用搜索模式过滤
    let filtered_results = apply_search_filter(all_strings, &config);

    // 生成编码统计
    let mut encoding_stats = HashMap::new();
    for encoding in &config.encodings {
        *encoding_stats.entry(encoding.to_string()).or_insert(0) += 1;
    }

    Ok((filtered_results, encoding_stats))
}

/// 应用搜索过滤器
fn apply_search_filter(results: Vec<FoundString>, config: &StringSearchConfig) -> Vec<FoundString> {
    results
        .into_iter()
        .filter(|string_info| {
            if let Some(pattern) = &config.search_pattern {
                if config.use_regex {
                    // 创建正则表达式，考虑大小写敏感性
                    let mut regex_builder = regex::RegexBuilder::new(pattern);
                    if !config.case_sensitive {
                        regex_builder.case_insensitive(true);
                    }

                    if let Ok(regex) = regex_builder.build() {
                        regex.find(&string_info.content).is_some()
                    } else {
                        false
                    }
                } else {
                    if config.case_sensitive {
                        string_info.content.contains(pattern)
                    } else {
                        string_info
                            .content
                            .to_lowercase()
                            .contains(&pattern.to_lowercase())
                    }
                }
            } else {
                true
            }
        })
        .collect()
}

/// 应用分页
fn apply_pagination(results: &[FoundString], page: usize, page_size: usize) -> Vec<FoundString> {
    let total_count = results.len();
    let start_index = (page - 1) * page_size;
    let end_index = std::cmp::min(start_index + page_size, total_count);

    if start_index < total_count {
        results[start_index..end_index].to_vec()
    } else {
        Vec::new()
    }
}

/// 在文件夹中分页搜索字符串
async fn search_in_folder_paginated(
    folder_path: &str,
    config: StringSearchConfig,
    page: usize,
    page_size: usize,
    cache_key: Option<String>,
    window: tauri::Window,
) -> Result<StringSearchResult, String> {
    use std::fs;
    use std::path::Path;

    let start_time = std::time::Instant::now();

    // 检查文件夹是否存在
    let folder_path = Path::new(folder_path);
    if !folder_path.exists() {
        return Err(format!("文件夹不存在: {}", folder_path.display()));
    }

    if !folder_path.is_dir() {
        return Err(format!("路径不是文件夹: {}", folder_path.display()));
    }

    if let Some(ref key) = cache_key {
        if let Some(entry) = get_paginated_search_cache(key) {
            let total_count = entry.results.len();
            let total_pages = if total_count == 0 {
                0
            } else {
                (total_count + page_size - 1) / page_size
            };
            let start_index = page.saturating_sub(1) * page_size;
            let end_index = std::cmp::min(start_index + page_size, total_count);
            let page_results = if start_index < total_count {
                entry.results[start_index..end_index].to_vec()
            } else {
                Vec::new()
            };
            let has_more = page < total_pages;

            return Ok(StringSearchResult {
                strings: page_results,
                stats: entry.stats,
                truncated: entry.truncated,
                page,
                page_size,
                total_pages,
                has_more,
                cache_key: Some(key.clone()),
            });
        }
    }

    // 初始化日志和统计信息
    let mut scan_logs = Vec::new();
    let mut scan_stats = ScanStats::default();

    // 发送初始进度
    let _ = window.emit(
        "string-search-progress",
        SearchProgress {
            processed_bytes: 0,
            total_bytes: 0,
            found_count: 0,
            status: "正在扫描文件夹...".to_string(),
            completed: false,
            scan_logs: scan_logs.clone(),
            scan_stats: scan_stats.clone(),
        },
    );

    // 递归收集所有文件
    let mut all_files = Vec::new();
    scan_logs.push(ScanLogEntry::info(
        format!("开始扫描文件夹: {}", folder_path.display()),
        Some(folder_path.display().to_string()),
    ));

    StringSearchManager::collect_files_recursive(
        folder_path,
        &mut all_files,
        &mut scan_logs,
        &mut scan_stats,
    )?;

    if all_files.is_empty() {
        return Ok(StringSearchResult {
            strings: Vec::new(),
            stats: SearchStats {
                duration_ms: start_time.elapsed().as_millis() as u64,
                processed_bytes: 0,
                total_found: 0,
                encoding_stats: HashMap::new(),
            },
            truncated: false,
            page,
            page_size,
            total_pages: 0,
            has_more: false,
            cache_key: None,
        });
    }

    // 计算总文件大小
    let mut total_size = 0u64;
    for file_path in &all_files {
        if let Ok(metadata) = fs::metadata(file_path) {
            total_size += metadata.len();
        }
    }

    // 记录扫描完成日志
    scan_logs.push(ScanLogEntry::info(
        format!(
            "文件夹扫描完成，找到 {} 个文件，总大小 {} MB",
            all_files.len(),
            total_size / (1024 * 1024)
        ),
        None,
    ));

    // 发送文件扫描完成进度
    let _ = window.emit(
        "string-search-progress",
        SearchProgress {
            processed_bytes: 0,
            total_bytes: total_size,
            found_count: 0,
            status: format!("找到 {} 个文件，开始搜索...", all_files.len()),
            completed: false,
            scan_logs: scan_logs.clone(),
            scan_stats: scan_stats.clone(),
        },
    );

    // 搜索所有文件
    let mut all_results = Vec::new();
    let mut processed_bytes = 0u64;
    let mut encoding_stats = HashMap::new();

    for (file_index, file_path) in all_files.iter().enumerate() {
        // 发送当前文件进度
        let _ = window.emit(
            "string-search-progress",
            SearchProgress {
                processed_bytes,
                total_bytes: total_size,
                found_count: all_results.len(),
                status: format!(
                    "搜索文件 {}/{}: {}",
                    file_index + 1,
                    all_files.len(),
                    file_path.file_name().unwrap_or_default().to_string_lossy()
                ),
                completed: false,
                scan_logs: scan_logs.clone(),
                scan_stats: scan_stats.clone(),
            },
        );

        // 搜索单个文件
        match StringSearchManager::search_single_file_for_folder(file_path, &config).await {
            Ok((file_results, file_size, file_encoding_stats)) => {
                all_results.extend(file_results);
                processed_bytes += file_size;

                // 合并编码统计
                for (encoding, count) in file_encoding_stats {
                    *encoding_stats.entry(encoding).or_insert(0) += count;
                }
            }
            Err(_) => {
                // 继续处理其他文件，不中断整个搜索
            }
        }

        // 检查是否达到最大结果数
        if let Some(max_results) = config.max_results {
            if all_results.len() >= max_results {
                break;
            }
        }
    }

    // 应用搜索模式过滤
    let filtered_results = StringSearchManager::apply_search_filter(all_results, &config);
    let total_count = filtered_results.len();
    let truncated = config.max_results.map_or(false, |max| total_count >= max);

    let start_index = page.saturating_sub(1) * page_size;
    let end_index = std::cmp::min(start_index + page_size, total_count);
    let page_results = if start_index < total_count {
        filtered_results[start_index..end_index].to_vec()
    } else {
        Vec::new()
    };

    let duration = start_time.elapsed();
    let total_pages = if total_count == 0 {
        0
    } else {
        (total_count + page_size - 1) / page_size
    };
    let has_more = page < total_pages;

    let stats = SearchStats {
        duration_ms: duration.as_millis() as u64,
        processed_bytes,
        total_found: total_count,
        encoding_stats,
    };

    let cache_identifier = store_paginated_search_cache(
        cache_key,
        PaginatedSearchCacheEntry {
            results: filtered_results,
            stats: stats.clone(),
            truncated,
            created_at: SystemTime::now(),
        },
    );

    // 发送完成进度
    let _ = window.emit(
        "string-search-progress",
        SearchProgress {
            processed_bytes,
            total_bytes: total_size,
            found_count: total_count,
            status: "搜索完成".to_string(),
            completed: true,
            scan_logs: scan_logs.clone(),
            scan_stats: scan_stats.clone(),
        },
    );

    Ok(StringSearchResult {
        strings: page_results,
        stats,
        truncated,
        page,
        page_size,
        total_pages,
        has_more,
        cache_key: Some(cache_identifier),
    })
}

/// 读取文件的指定字节范围
/// 用于 HEX Context 显示
/// file_path: 可选的文件路径，如果不提供则使用当前加载的内存镜像
#[tauri::command]
pub async fn read_memory_bytes(
    offset: u64,
    size: usize,
    file_path: Option<String>,
) -> Result<Vec<u8>, String> {
    // 确定要读取的文件路径
    let target_path = if let Some(fp) = file_path {
        if fp.is_empty() {
            // 空字符串时使用内存镜像
            let settings = crate::settings::load_settings()?;
            settings.current_image_path
        } else {
            fp
        }
    } else {
        // 未提供时使用内存镜像
        let settings = crate::settings::load_settings()?;
        settings.current_image_path
    };

    if target_path.is_empty() {
        return Err("未指定文件路径".to_string());
    }

    let path = Path::new(&target_path);
    if !path.exists() {
        return Err(format!("文件不存在: {}", target_path));
    }

    // 打开文件并读取指定范围
    let file = File::open(path).map_err(|e| format!("无法打开文件: {}", e))?;
    let file_size = file
        .metadata()
        .map_err(|e| format!("无法获取文件信息: {}", e))?
        .len();

    // 边界检查
    if offset >= file_size {
        return Ok(Vec::new());
    }

    let actual_size = std::cmp::min(size as u64, file_size - offset) as usize;
    if actual_size == 0 {
        return Ok(Vec::new());
    }

    // 使用 mmap 读取
    let mmap = unsafe {
        MmapOptions::new()
            .offset(offset)
            .len(actual_size)
            .map(&file)
            .map_err(|e| format!("内存映射失败: {}", e))?
    };

    Ok(mmap.to_vec())
}
