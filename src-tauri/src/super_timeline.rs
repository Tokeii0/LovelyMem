//! Super Timeline (统一取证时间线) 模块
//!
//! 聚合 NTFS 文件系统、EVTX 事件日志、注册表修改、进程创建/退出
//! 四个来源的时间戳事件，提供统一的时间轴查询和异常检测。

use chrono::NaiveDateTime;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use crate::evtx_parser;
use crate::registry_parser;
use crate::settings::load_settings;

// ─── 数据结构 ───────────────────────────────────────────────────

/// 事件来源类型
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum EventSource {
    Ntfs,
    Evtx,
    Registry,
    Process,
}

impl EventSource {
    fn as_str(&self) -> &'static str {
        match self {
            EventSource::Ntfs => "Ntfs",
            EventSource::Evtx => "Evtx",
            EventSource::Registry => "Registry",
            EventSource::Process => "Process",
        }
    }
}

/// 统一时间线事件
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SuperTimelineEvent {
    /// epoch 毫秒，用于排序和二分搜索
    pub timestamp_ms: i64,
    /// 可读时间字符串
    pub timestamp_str: String,
    /// 事件来源
    pub source: EventSource,
    /// 操作类型 (Create/Modify/Delete/Read/Execute/Login/Exit 等)
    pub action: String,
    /// 严重度: 0=Info, 1=Low, 2=Medium, 3=High, 4=Critical
    pub severity: u8,
    /// 时间线标签 (短文本)
    pub summary: String,
    /// 详情面板完整信息
    pub detail: String,
    /// 关联 PID
    pub pid: Option<u32>,
    /// 关联路径 (文件路径或注册表键路径)
    pub path: Option<String>,
}

/// 检测到的异常
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimelineAnomaly {
    /// 异常类型: "burst" | "suspicious_sequence" | "time_gap"
    pub anomaly_type: String,
    pub severity: u8,
    pub start_ms: i64,
    pub end_ms: i64,
    pub start_str: String,
    pub end_str: String,
    pub description: String,
    pub event_count: usize,
}

/// build_super_timeline 返回的元数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SuperTimelineMeta {
    pub total_count: usize,
    pub time_range: (String, String),
    pub source_counts: HashMap<String, usize>,
    pub anomalies: Vec<TimelineAnomaly>,
}

/// 分页查询参数
#[derive(Debug, Clone, Deserialize)]
pub struct TimelineQuery {
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub sources: Option<Vec<String>>,
    pub min_severity: Option<u8>,
    pub keyword: Option<String>,
    pub page: Option<usize>,
    pub page_size: Option<usize>,
}

/// 密度桶 (给热力图)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DensityBucket {
    pub start_ms: i64,
    pub end_ms: i64,
    pub count: usize,
    pub by_source: HashMap<String, usize>,
}

/// 每日统计 (用于热力图)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyCount {
    pub date: String,
    pub total: usize,
    pub by_source: HashMap<String, usize>,
    pub by_hour: Vec<usize>,
}

/// 异常汇总
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnomalySummary {
    pub total_anomalies: usize,
    pub by_type: HashMap<String, usize>,
    pub max_severity: u8,
    pub high_severity_count: usize,
}

/// 时间线统计数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimelineStatistics {
    pub total_count: usize,
    pub source_counts: HashMap<String, usize>,
    pub severity_counts: HashMap<u8, usize>,
    pub action_counts: HashMap<String, usize>,
    pub hourly_distribution: Vec<usize>,
    pub daily_distribution: Vec<DailyCount>,
    pub top_paths: Vec<(String, usize)>,
    pub top_pids: Vec<(u32, usize)>,
    pub anomaly_summary: AnomalySummary,
}

/// 分页查询结果包装
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimelineQueryResult {
    pub events: Vec<SuperTimelineEvent>,
    pub total_filtered: usize,
    pub total_pages: usize,
}

// ─── 内存缓存 ───────────────────────────────────────────────────

lazy_static::lazy_static! {
    static ref TIMELINE_CACHE: Mutex<Option<TimelineCache>> = Mutex::new(None);
}

struct TimelineCache {
    events: Vec<SuperTimelineEvent>,
    anomalies: Vec<TimelineAnomaly>,
}

// ─── 时间戳解析 ─────────────────────────────────────────────────

/// 多格式时间戳 → epoch 毫秒
fn normalize_timestamp(s: &str) -> Option<i64> {
    let s = s.trim();
    if s.is_empty() || s == "N/A" || s == "-" {
        return None;
    }

    // 尝试各种格式
    let formats = [
        "%Y-%m-%d %H:%M:%S%.3f UTC", // EVTX: "2024-01-15 10:30:45.123 UTC"
        "%Y-%m-%d %H:%M:%S%.3f",     // Registry: "2024-01-15 10:30:45.123"
        "%Y-%m-%d %H:%M:%S",         // NTFS/Process: "2024-01-15 10:30:45"
        "%Y-%m-%dT%H:%M:%S%.3f",     // ISO: "2024-01-15T10:30:45.123"
        "%Y-%m-%dT%H:%M:%S",         // ISO: "2024-01-15T10:30:45"
    ];

    // 去掉可能的 " UTC" / "Z" 后缀再解析
    let clean = s
        .trim_end_matches(" UTC")
        .trim_end_matches(" utc")
        .trim_end_matches('Z');

    for fmt in &formats {
        if let Ok(dt) = NaiveDateTime::parse_from_str(clean, fmt) {
            return Some(dt.and_utc().timestamp_millis());
        }
    }

    None
}

/// epoch 毫秒 → 可读字符串
fn ms_to_string(ms: i64) -> String {
    let dt = chrono::DateTime::from_timestamp_millis(ms);
    match dt {
        Some(dt) => dt.format("%Y-%m-%d %H:%M:%S%.3f").to_string(),
        None => format!("{}ms", ms),
    }
}

// ─── CSV 行解析 (复用现有模式) ───────────────────────────────────

fn parse_csv_line(line: &str, delimiter: char) -> Vec<String> {
    if !line.contains('"') {
        return line
            .split(delimiter)
            .map(|s| s.trim().to_string())
            .collect();
    }
    let mut result = Vec::new();
    let mut current = String::new();
    let mut in_q = false;
    let mut chars = line.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '"' => {
                if in_q {
                    if chars.peek() == Some(&'"') {
                        current.push('"');
                        chars.next();
                    } else {
                        in_q = false;
                    }
                } else {
                    in_q = true;
                }
            }
            c if c == delimiter && !in_q => {
                result.push(current.trim().to_string());
                current = String::new();
            }
            _ => current.push(c),
        }
    }
    result.push(current.trim().to_string());
    result
}

// ─── 数据采集器 ─────────────────────────────────────────────────

/// 1. 从 timeline_ntfs.csv 采集 NTFS 事件
fn collect_ntfs_events(output_dir: &Path) -> Vec<SuperTimelineEvent> {
    let csv_path = output_dir.join("timeline_ntfs.csv");
    if !csv_path.exists() {
        debug_info!("[SuperTimeline] timeline_ntfs.csv 不存在，跳过 NTFS 采集");
        return Vec::new();
    }

    debug_info!("[SuperTimeline] 开始采集 NTFS 事件: {}", csv_path.display());

    let file = match File::open(&csv_path) {
        Ok(f) => f,
        Err(e) => {
            debug_error!("[SuperTimeline] 无法打开 timeline_ntfs.csv: {}", e);
            return Vec::new();
        }
    };
    let reader = BufReader::new(file);
    let mut lines_iter = reader.lines();

    // 读取表头
    let header = match lines_iter.next() {
        Some(Ok(h)) => h,
        _ => return Vec::new(),
    };
    let headers = parse_csv_line(header.trim(), ',');
    let time_idx = headers.iter().position(|h| h == "Time");
    let action_idx = headers.iter().position(|h| h == "Action");
    let text_idx = match headers.iter().position(|h| h == "Text") {
        Some(i) => i,
        None => return Vec::new(),
    };
    let value32_idx = headers.iter().position(|h| h == "Value32");

    // 收集所有行
    let lines: Vec<String> = lines_iter.filter_map(|r| r.ok()).collect();

    // 并行解析
    let events: Vec<SuperTimelineEvent> = lines
        .par_iter()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() {
                return None;
            }
            let values = parse_csv_line(line, ',');
            if values.len() <= text_idx {
                return None;
            }

            let time_str = time_idx
                .and_then(|i| values.get(i))
                .cloned()
                .unwrap_or_default();
            let timestamp_ms = normalize_timestamp(&time_str)?;

            let action_raw = action_idx
                .and_then(|i| values.get(i))
                .cloned()
                .unwrap_or_default();
            let action = match action_raw.as_str() {
                "CRE" => "Create",
                "MOD" => "Modify",
                "RD" => "Read",
                "DEL" => "Delete",
                other => other,
            }
            .to_string();

            let raw_path = &values[text_idx];
            let path = if raw_path.starts_with("\\0\\") {
                &raw_path[3..]
            } else if raw_path.starts_with("\\0") {
                &raw_path[2..]
            } else {
                raw_path.as_str()
            };
            if path.is_empty() {
                return None;
            }

            let size_str = value32_idx
                .and_then(|i| values.get(i))
                .cloned()
                .unwrap_or_default();

            let summary = format!("[NTFS] {} {}", action, path);
            let detail = format!(
                "操作: {}\n路径: {}\n大小: {}\n时间: {}",
                action, path, size_str, time_str
            );

            Some(SuperTimelineEvent {
                timestamp_ms,
                timestamp_str: time_str,
                source: EventSource::Ntfs,
                action,
                severity: 0,
                summary,
                detail,
                pid: None,
                path: Some(path.to_string()),
            })
        })
        .collect();

    debug_info!("[SuperTimeline] NTFS 采集完成: {} 个事件", events.len());
    events
}

/// 2. 从 .evtx 文件采集事件日志
fn collect_evtx_events(output_dir: &Path) -> Vec<SuperTimelineEvent> {
    // 查找 output_dir 下所有 .evtx 文件
    let evtx_files: Vec<PathBuf> = find_evtx_files(output_dir);
    if evtx_files.is_empty() {
        debug_info!("[SuperTimeline] 未找到 .evtx 文件，跳过 EVTX 采集");
        return Vec::new();
    }

    debug_info!(
        "[SuperTimeline] 开始采集 EVTX 事件，共 {} 个文件",
        evtx_files.len()
    );

    // 并行解析每个 evtx 文件
    let events: Vec<SuperTimelineEvent> = evtx_files
        .par_iter()
        .flat_map(|evtx_path| {
            let path_str = evtx_path.to_string_lossy().to_string();
            match evtx_parser::parse_evtx_file(&path_str) {
                Ok(result) => result
                    .events
                    .into_iter()
                    .filter_map(|record| {
                        let timestamp_ms = normalize_timestamp(&record.timestamp)?;

                        // EVTX level → severity
                        let severity = match record.level {
                            1 => 4, // Critical
                            2 => 3, // Error
                            3 => 2, // Warning
                            4 => 0, // Information
                            5 => 0, // Verbose
                            _ => 0,
                        };

                        let summary = format!(
                            "[EVTX] {} EventID:{} {}",
                            record.level_name,
                            record.event_id,
                            record.provider_name
                        );
                        let detail = format!(
                            "事件ID: {}\n级别: {}\n来源: {}\n计算机: {}\n消息: {}\nSID: {}\n进程ID: {}\n线程ID: {}",
                            record.event_id,
                            record.level_name,
                            record.provider_name,
                            record.computer_name,
                            truncate_str(&record.message, 500),
                            record.user_sid.as_deref().unwrap_or("N/A"),
                            record.process_id.map_or("N/A".to_string(), |p| p.to_string()),
                            record.thread_id.map_or("N/A".to_string(), |t| t.to_string()),
                        );

                        Some(SuperTimelineEvent {
                            timestamp_ms,
                            timestamp_str: record.timestamp,
                            source: EventSource::Evtx,
                            action: record.level_name,
                            severity,
                            summary,
                            detail,
                            pid: record.process_id,
                            path: Some(result.filename.clone()),
                        })
                    })
                    .collect::<Vec<_>>(),
                Err(e) => {
                    debug_error!("[SuperTimeline] 解析 EVTX 失败 {}: {}", path_str, e);
                    Vec::new()
                }
            }
        })
        .collect();

    debug_info!("[SuperTimeline] EVTX 采集完成: {} 个事件", events.len());
    events
}

/// 3. 从注册表 hive 文件采集键修改时间
fn collect_registry_events(output_dir: &Path) -> Vec<SuperTimelineEvent> {
    // 查找 output_dir 下的 .reghive 文件
    let hive_files: Vec<PathBuf> = find_registry_hive_files(output_dir);
    if hive_files.is_empty() {
        debug_info!("[SuperTimeline] 未找到注册表 hive 文件，跳过 Registry 采集");
        return Vec::new();
    }

    debug_info!(
        "[SuperTimeline] 开始采集 Registry 事件，共 {} 个 hive 文件",
        hive_files.len()
    );

    let mut events = Vec::new();
    for hive_path in &hive_files {
        let path_str = hive_path.to_string_lossy().to_string();
        let hive_name = hive_path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        match registry_parser::parse_registry_file(&path_str) {
            Ok(root_key) => {
                collect_registry_key_timestamps(&root_key, &hive_name, "", &mut events);
            }
            Err(e) => {
                debug_error!("[SuperTimeline] 解析注册表 hive 失败 {}: {}", path_str, e);
            }
        }
    }

    debug_info!("[SuperTimeline] Registry 采集完成: {} 个事件", events.len());
    events
}

/// 递归遍历注册表键，提取有时间戳的键
fn collect_registry_key_timestamps(
    key: &registry_parser::RegistryKey,
    hive_name: &str,
    parent_path: &str,
    events: &mut Vec<SuperTimelineEvent>,
) {
    let full_path = if parent_path.is_empty() {
        key.name.clone()
    } else {
        format!("{}\\{}", parent_path, key.name)
    };

    if let Some(ref last_modified) = key.last_modified {
        if let Some(timestamp_ms) = normalize_timestamp(last_modified) {
            // 检查是否为自启动相关键 → 提高严重度
            let severity = if is_autorun_key(&full_path) { 2 } else { 0 };

            let value_names: Vec<&str> = key.values.keys().map(|k| k.as_str()).collect();
            let value_preview = if value_names.is_empty() {
                String::new()
            } else {
                format!("\n值: {}", truncate_str(&value_names.join(", "), 200))
            };

            let summary = format!("[REG] {} Modify {}", hive_name, full_path);
            let detail = format!(
                "Hive: {}\n键路径: {}\n修改时间: {}\n子键数: {}\n值数: {}{}",
                hive_name,
                full_path,
                last_modified,
                key.subkeys.len(),
                key.values.len(),
                value_preview
            );

            events.push(SuperTimelineEvent {
                timestamp_ms,
                timestamp_str: last_modified.clone(),
                source: EventSource::Registry,
                action: "Modify".to_string(),
                severity,
                summary,
                detail,
                pid: None,
                path: Some(format!("{}\\{}", hive_name, full_path)),
            });
        }
    }

    // 递归子键
    for subkey in key.subkeys.values() {
        collect_registry_key_timestamps(subkey, hive_name, &full_path, events);
    }
}

/// 4. 从 process.csv 采集进程创建/退出事件
fn collect_process_events(output_dir: &Path) -> Vec<SuperTimelineEvent> {
    // 查找进程 CSV 文件
    let candidates = [
        "process.csv",
        "output_vol3_pslist.csv",
        "output_vol3_psscan.csv",
    ];
    let csv_path = candidates
        .iter()
        .map(|f| output_dir.join(f))
        .find(|p| p.exists());

    let csv_path = match csv_path {
        Some(p) => p,
        None => {
            debug_info!("[SuperTimeline] 未找到进程 CSV 文件，跳过 Process 采集");
            return Vec::new();
        }
    };

    debug_info!(
        "[SuperTimeline] 开始采集 Process 事件: {}",
        csv_path.display()
    );

    let file = match File::open(&csv_path) {
        Ok(f) => f,
        Err(e) => {
            debug_error!("[SuperTimeline] 无法打开进程 CSV: {}", e);
            return Vec::new();
        }
    };
    let reader = BufReader::new(file);
    let mut lines_iter = reader.lines();

    // 读取表头
    let header = match lines_iter.next() {
        Some(Ok(h)) => h,
        _ => return Vec::new(),
    };
    let headers = parse_csv_line(header.trim(), ',');
    let idx = |name: &str| headers.iter().position(|h| h == name);

    let pid_idx = match idx("PID") {
        Some(i) => i,
        None => return Vec::new(),
    };
    let ppid_idx = idx("PPID");
    let name_idx = idx("Name").or_else(|| idx("ShortName"));
    let ctime_idx = idx("CreateTime");
    let etime_idx = idx("ExitTime");
    let user_idx = idx("User");
    let cmd_idx = idx("CommandLine");
    let upath_idx = idx("UserPath");

    let mut events = Vec::new();

    for line_result in lines_iter {
        let line = match line_result {
            Ok(l) => l,
            Err(_) => continue,
        };
        if line.trim().is_empty() {
            continue;
        }
        let v = parse_csv_line(line.trim(), ',');
        if v.len() <= pid_idx {
            continue;
        }

        let get =
            |i: Option<usize>| -> String { i.and_then(|i| v.get(i)).cloned().unwrap_or_default() };

        let pid: u32 = v[pid_idx].parse().unwrap_or(0);
        let ppid = get(ppid_idx);
        let name = get(name_idx);
        let user = get(user_idx);
        let cmd = get(cmd_idx);
        let user_path = get(upath_idx);
        let create_time = get(ctime_idx);
        let exit_time = get(etime_idx);

        // 进程创建事件
        if let Some(ts_ms) = normalize_timestamp(&create_time) {
            let summary = format!("[PROC] Create PID:{} {}", pid, name);
            let detail = format!(
                "操作: 进程创建\nPID: {}\nPPID: {}\n名称: {}\n用户: {}\n路径: {}\n命令行: {}\n创建时间: {}",
                pid,
                ppid,
                name,
                user,
                user_path,
                truncate_str(&cmd, 300),
                create_time
            );

            events.push(SuperTimelineEvent {
                timestamp_ms: ts_ms,
                timestamp_str: create_time.clone(),
                source: EventSource::Process,
                action: "Create".to_string(),
                severity: 0,
                summary,
                detail,
                pid: Some(pid),
                path: if user_path.is_empty() {
                    None
                } else {
                    Some(user_path.clone())
                },
            });
        }

        // 进程退出事件
        if !exit_time.is_empty() {
            if let Some(ts_ms) = normalize_timestamp(&exit_time) {
                let summary = format!("[PROC] Exit PID:{} {}", pid, name);
                let detail = format!(
                    "操作: 进程退出\nPID: {}\n名称: {}\n退出时间: {}",
                    pid, name, exit_time
                );

                events.push(SuperTimelineEvent {
                    timestamp_ms: ts_ms,
                    timestamp_str: exit_time,
                    source: EventSource::Process,
                    action: "Exit".to_string(),
                    severity: 0,
                    summary,
                    detail,
                    pid: Some(pid),
                    path: None,
                });
            }
        }
    }

    debug_info!("[SuperTimeline] Process 采集完成: {} 个事件", events.len());
    events
}

// ─── 异常检测 ───────────────────────────────────────────────────

fn detect_anomalies(events: &[SuperTimelineEvent]) -> Vec<TimelineAnomaly> {
    let mut anomalies = Vec::new();
    if events.is_empty() {
        return anomalies;
    }

    // 1. 突发检测: 滑动窗口 5秒内超过50个事件
    detect_bursts(events, &mut anomalies, 5000, 50);

    // 2. 可疑序列: 进程创建后短时间内出现注册表自启动键修改
    detect_suspicious_sequences(events, &mut anomalies);

    // 3. 时间间隙: 密集数据中出现超大间隙
    detect_time_gaps(events, &mut anomalies);

    anomalies
}

/// 滑动窗口突发检测
fn detect_bursts(
    events: &[SuperTimelineEvent],
    anomalies: &mut Vec<TimelineAnomaly>,
    window_ms: i64,
    threshold: usize,
) {
    let len = events.len();
    let mut start = 0;
    let mut i = 0;

    while i < len {
        // 扩展窗口右边界
        while i < len && events[i].timestamp_ms - events[start].timestamp_ms <= window_ms {
            i += 1;
        }

        let count = i - start;
        if count >= threshold {
            let start_ms = events[start].timestamp_ms;
            let end_ms = events[i.saturating_sub(1)].timestamp_ms;

            // 避免与上一个异常重叠
            let already_covered = anomalies
                .iter()
                .any(|a| a.anomaly_type == "burst" && a.start_ms <= start_ms && a.end_ms >= end_ms);

            if !already_covered {
                anomalies.push(TimelineAnomaly {
                    anomaly_type: "burst".to_string(),
                    severity: 3,
                    start_ms,
                    end_ms,
                    start_str: ms_to_string(start_ms),
                    end_str: ms_to_string(end_ms),
                    description: format!(
                        "事件突发: {}ms 内出现 {} 个事件",
                        end_ms - start_ms,
                        count
                    ),
                    event_count: count,
                });
            }
        }

        start += 1;
        if i <= start {
            i = start;
        }
    }
}

/// 可疑序列: 进程创建后 30 秒内出现注册表自启动键修改
fn detect_suspicious_sequences(
    events: &[SuperTimelineEvent],
    anomalies: &mut Vec<TimelineAnomaly>,
) {
    let window_ms: i64 = 30_000; // 30 秒

    for (i, event) in events.iter().enumerate() {
        if event.source != EventSource::Process || event.action != "Create" {
            continue;
        }

        // 向后搜索窗口内的注册表自启动键修改
        for j in (i + 1)..events.len() {
            let diff = events[j].timestamp_ms - event.timestamp_ms;
            if diff > window_ms {
                break;
            }
            if events[j].source == EventSource::Registry && events[j].severity >= 2 {
                anomalies.push(TimelineAnomaly {
                    anomaly_type: "suspicious_sequence".to_string(),
                    severity: 4,
                    start_ms: event.timestamp_ms,
                    end_ms: events[j].timestamp_ms,
                    start_str: event.timestamp_str.clone(),
                    end_str: events[j].timestamp_str.clone(),
                    description: format!(
                        "可疑序列: 进程创建 (PID:{} {}) 后 {:.1}s 内出现注册表自启动键修改",
                        event.pid.unwrap_or(0),
                        truncate_str(&event.summary, 40),
                        diff as f64 / 1000.0,
                    ),
                    event_count: 2,
                });
                break; // 每个进程创建只报告一次
            }
        }
    }
}

/// 时间间隙检测: 在事件密度较高的区域检测异常间隔
fn detect_time_gaps(events: &[SuperTimelineEvent], anomalies: &mut Vec<TimelineAnomaly>) {
    if events.len() < 100 {
        return;
    }

    // 计算相邻事件的时间差的中位数
    let mut diffs: Vec<i64> = events
        .windows(2)
        .map(|w| w[1].timestamp_ms - w[0].timestamp_ms)
        .filter(|&d| d > 0)
        .collect();

    if diffs.is_empty() {
        return;
    }

    diffs.sort_unstable();
    let median = diffs[diffs.len() / 2];
    // 间隙阈值: 中位数的 1000 倍，且至少 1 小时
    let gap_threshold = (median * 1000).max(3_600_000);

    for window in events.windows(2) {
        let diff = window[1].timestamp_ms - window[0].timestamp_ms;
        if diff >= gap_threshold {
            anomalies.push(TimelineAnomaly {
                anomaly_type: "time_gap".to_string(),
                severity: 2,
                start_ms: window[0].timestamp_ms,
                end_ms: window[1].timestamp_ms,
                start_str: window[0].timestamp_str.clone(),
                end_str: window[1].timestamp_str.clone(),
                description: format!(
                    "时间间隙: 事件流中出现 {:.1} 小时的空白（可能日志被清除或系统关机）",
                    diff as f64 / 3_600_000.0
                ),
                event_count: 0,
            });
        }
    }
}

// ─── Tauri 命令 ─────────────────────────────────────────────────

/// 构建统一时间线：聚合 4 个来源 → 排序 → 缓存 → 返回元数据
#[tauri::command]
pub async fn build_super_timeline(app: tauri::AppHandle) -> Result<SuperTimelineMeta, String> {
    use tauri::Emitter;

    let settings = load_settings().map_err(|e| format!("加载设置失败: {}", e))?;
    let output_dir = PathBuf::from(&settings.output_path);

    if !output_dir.exists() {
        return Err(format!("输出目录不存在: {}", output_dir.display()));
    }

    // 发送进度事件
    let _ = app.emit("super-timeline-progress", "正在采集 NTFS 文件系统事件...");

    // 并行采集 4 个来源
    let (pair_a, pair_b): (
        (Vec<SuperTimelineEvent>, Vec<SuperTimelineEvent>),
        (Vec<SuperTimelineEvent>, Vec<SuperTimelineEvent>),
    ) = rayon::join(
        || {
            rayon::join(
                || collect_ntfs_events(&output_dir),
                || collect_evtx_events(&output_dir),
            )
        },
        || {
            rayon::join(
                || collect_registry_events(&output_dir),
                || collect_process_events(&output_dir),
            )
        },
    );
    let (ntfs_events, evtx_events) = pair_a;
    let (registry_events, process_events) = pair_b;

    let _ = app.emit("super-timeline-progress", "正在合并和排序事件...");

    // 合并
    let total_estimate =
        ntfs_events.len() + evtx_events.len() + registry_events.len() + process_events.len();
    let mut all_events = Vec::with_capacity(total_estimate);
    all_events.extend(ntfs_events);
    all_events.extend(evtx_events);
    all_events.extend(registry_events);
    all_events.extend(process_events);

    // 按时间戳排序
    all_events.par_sort_unstable_by_key(|e| e.timestamp_ms);

    let _ = app.emit("super-timeline-progress", "正在检测异常模式...");

    // 异常检测
    let mut anomalies = detect_anomalies(&all_events);
    // 按时间倒序排列（最新的异常在前）
    anomalies.sort_unstable_by(|a, b| b.start_ms.cmp(&a.start_ms));

    // 统计
    let total_count = all_events.len();
    let mut source_counts: HashMap<String, usize> = HashMap::new();
    for event in &all_events {
        *source_counts
            .entry(event.source.as_str().to_string())
            .or_insert(0) += 1;
    }

    let time_range = if all_events.is_empty() {
        ("N/A".to_string(), "N/A".to_string())
    } else {
        (
            all_events.first().unwrap().timestamp_str.clone(),
            all_events.last().unwrap().timestamp_str.clone(),
        )
    };

    let meta = SuperTimelineMeta {
        total_count,
        time_range: time_range.clone(),
        source_counts: source_counts.clone(),
        anomalies: anomalies.clone(),
    };

    // 缓存
    let mut cache = TIMELINE_CACHE
        .lock()
        .map_err(|e| format!("缓存锁失败: {}", e))?;
    *cache = Some(TimelineCache {
        events: all_events,
        anomalies,
    });

    let _ = app.emit("super-timeline-progress", "完成");

    debug_info!(
        "[SuperTimeline] 构建完成: {} 个事件, {} 个异常",
        total_count,
        meta.anomalies.len()
    );

    Ok(meta)
}

/// 分页查询时间线事件
#[tauri::command]
pub async fn query_super_timeline(query: TimelineQuery) -> Result<TimelineQueryResult, String> {
    let cache = TIMELINE_CACHE
        .lock()
        .map_err(|e| format!("缓存锁失败: {}", e))?;
    let cache = cache
        .as_ref()
        .ok_or("时间线未构建，请先调用 build_super_timeline")?;

    let events = &cache.events;
    if events.is_empty() {
        return Ok(TimelineQueryResult {
            events: Vec::new(),
            total_filtered: 0,
            total_pages: 0,
        });
    }

    // 时间范围二分搜索
    let start_idx = if let Some(ref start_time) = query.start_time {
        if let Some(start_ms) = normalize_timestamp(start_time) {
            events.partition_point(|e| e.timestamp_ms < start_ms)
        } else {
            0
        }
    } else {
        0
    };

    let end_idx = if let Some(ref end_time) = query.end_time {
        if let Some(end_ms) = normalize_timestamp(end_time) {
            events.partition_point(|e| e.timestamp_ms <= end_ms)
        } else {
            events.len()
        }
    } else {
        events.len()
    };

    // 在范围内应用过滤器
    let page = query.page.unwrap_or(0);
    let page_size = query.page_size.unwrap_or(1000).min(5000);
    let min_severity = query.min_severity.unwrap_or(0);

    let sources: Option<Vec<String>> = query.sources;
    let keyword = query.keyword.as_deref().unwrap_or("").to_lowercase();

    // 先统计总数，再分页
    let all_filtered: Vec<&SuperTimelineEvent> = events[start_idx..end_idx]
        .iter()
        .rev()
        .filter(|e| {
            // 来源过滤
            if let Some(ref srcs) = sources {
                if !srcs.contains(&e.source.as_str().to_string()) {
                    return false;
                }
            }
            // 严重度过滤
            if e.severity < min_severity {
                return false;
            }
            // 关键词过滤
            if !keyword.is_empty() {
                let matches = e.summary.to_lowercase().contains(&keyword)
                    || e.detail.to_lowercase().contains(&keyword)
                    || e.path
                        .as_deref()
                        .unwrap_or("")
                        .to_lowercase()
                        .contains(&keyword);
                if !matches {
                    return false;
                }
            }
            true
        })
        .collect();

    let total_filtered = all_filtered.len();
    let total_pages = if page_size > 0 {
        (total_filtered + page_size - 1) / page_size
    } else {
        1
    };

    let paged: Vec<SuperTimelineEvent> = all_filtered
        .into_iter()
        .skip(page * page_size)
        .take(page_size)
        .cloned()
        .collect();

    Ok(TimelineQueryResult {
        events: paged,
        total_filtered,
        total_pages,
    })
}

/// 获取密度桶数据 (给热力图)
#[tauri::command]
pub async fn get_timeline_density(
    bucket_count: Option<usize>,
) -> Result<Vec<DensityBucket>, String> {
    let cache = TIMELINE_CACHE
        .lock()
        .map_err(|e| format!("缓存锁失败: {}", e))?;
    let cache = cache
        .as_ref()
        .ok_or("时间线未构建，请先调用 build_super_timeline")?;

    let events = &cache.events;
    if events.is_empty() {
        return Ok(Vec::new());
    }

    let bucket_count = bucket_count.unwrap_or(500).max(10).min(2000);
    let min_ms = events.first().unwrap().timestamp_ms;
    let max_ms = events.last().unwrap().timestamp_ms;
    let range = (max_ms - min_ms).max(1);
    let bucket_width = (range as f64 / bucket_count as f64).ceil() as i64;

    let mut buckets: Vec<DensityBucket> = (0..bucket_count)
        .map(|i| {
            let start = min_ms + (i as i64) * bucket_width;
            let end = start + bucket_width;
            DensityBucket {
                start_ms: start,
                end_ms: end,
                count: 0,
                by_source: HashMap::new(),
            }
        })
        .collect();

    for event in events {
        let bucket_idx =
            ((event.timestamp_ms - min_ms) as f64 / bucket_width as f64).floor() as usize;
        let bucket_idx = bucket_idx.min(buckets.len() - 1);
        buckets[bucket_idx].count += 1;
        *buckets[bucket_idx]
            .by_source
            .entry(event.source.as_str().to_string())
            .or_insert(0) += 1;
    }

    Ok(buckets)
}

// ─── 辅助函数 ───────────────────────────────────────────────────

/// 截断路径显示
fn truncate_path(path: &str, max_len: usize) -> String {
    if path.len() <= max_len {
        return path.to_string();
    }
    let parts: Vec<&str> = path.split('\\').collect();
    if parts.len() <= 2 {
        return format!("...{}", &path[path.len() - max_len..]);
    }
    format!("{}\\...\\{}", parts[0], parts.last().unwrap_or(&""))
}

/// 截断字符串
fn truncate_str(s: &str, max_len: usize) -> String {
    if s.len() <= max_len {
        s.to_string()
    } else {
        format!("{}...", &s[..max_len])
    }
}

/// 检查注册表键是否为自启动相关
fn is_autorun_key(path: &str) -> bool {
    let lower = path.to_lowercase();
    lower.contains("\\run\\")
        || lower.contains("\\runonce\\")
        || lower.contains("\\runonceex\\")
        || lower.ends_with("\\run")
        || lower.ends_with("\\runonce")
        || lower.contains("\\services\\")
        || lower.contains("\\currentversion\\explorer\\shell folders")
        || lower.contains("\\currentversion\\explorer\\user shell folders")
        || lower.contains("\\winlogon\\")
        || lower.contains("\\image file execution options\\")
}

/// 递归查找 .evtx 文件
fn find_evtx_files(dir: &Path) -> Vec<PathBuf> {
    let mut results = Vec::new();
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                results.extend(find_evtx_files(&path));
            } else if let Some(ext) = path.extension() {
                if ext.to_string_lossy().to_lowercase() == "evtx" {
                    results.push(path);
                }
            }
        }
    }
    results
}

/// 查找注册表 hive 文件
fn find_registry_hive_files(dir: &Path) -> Vec<PathBuf> {
    let mut results = Vec::new();
    // 查找常见的注册表 hive 路径
    let hive_dirs = [
        dir.join("registry"),
        dir.join("Registry"),
        dir.to_path_buf(),
    ];

    for hive_dir in &hive_dirs {
        if !hive_dir.exists() {
            continue;
        }
        if let Ok(entries) = std::fs::read_dir(hive_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    if let Some(ext) = path.extension() {
                        let ext_str = ext.to_string_lossy().to_lowercase();
                        if ext_str == "reghive" || ext_str == "hive" || ext_str == "dat" {
                            results.push(path);
                        }
                    }
                }
            }
        }
    }
    results
}

/// 获取时间线统计数据（从缓存计算）
#[tauri::command]
pub async fn get_timeline_statistics() -> Result<TimelineStatistics, String> {
    let cache = TIMELINE_CACHE
        .lock()
        .map_err(|e| format!("缓存锁失败: {}", e))?;
    let cache = cache
        .as_ref()
        .ok_or("时间线未构建，请先调用 build_super_timeline")?;

    let events = &cache.events;
    let anomalies = &cache.anomalies;

    let total_count = events.len();
    let mut source_counts: HashMap<String, usize> = HashMap::new();
    let mut severity_counts: HashMap<u8, usize> = HashMap::new();
    let mut action_counts: HashMap<String, usize> = HashMap::new();
    let mut hourly_distribution = vec![0usize; 24];
    let mut path_counts: HashMap<String, usize> = HashMap::new();
    let mut pid_counts: HashMap<u32, usize> = HashMap::new();
    // 按日期+小时的二维计数: date_str -> [24]usize
    let mut daily_map: HashMap<String, (usize, HashMap<String, usize>, Vec<usize>)> =
        HashMap::new();

    for event in events {
        // 来源
        *source_counts
            .entry(event.source.as_str().to_string())
            .or_insert(0) += 1;

        // 严重度
        *severity_counts.entry(event.severity).or_insert(0) += 1;

        // 操作类型
        *action_counts.entry(event.action.clone()).or_insert(0) += 1;

        // 按小时分布 & 按天分布
        if let Some(dt) = chrono::DateTime::from_timestamp_millis(event.timestamp_ms) {
            let hour = dt.format("%H").to_string().parse::<usize>().unwrap_or(0);
            if hour < 24 {
                hourly_distribution[hour] += 1;
            }

            let date_str = dt.format("%Y-%m-%d").to_string();
            let entry = daily_map
                .entry(date_str)
                .or_insert_with(|| (0, HashMap::new(), vec![0usize; 24]));
            entry.0 += 1;
            *entry
                .1
                .entry(event.source.as_str().to_string())
                .or_insert(0) += 1;
            if hour < 24 {
                entry.2[hour] += 1;
            }
        }

        // 路径 Top N
        if let Some(ref path) = event.path {
            if !path.is_empty() {
                *path_counts.entry(path.clone()).or_insert(0) += 1;
            }
        }

        // PID Top N
        if let Some(pid) = event.pid {
            *pid_counts.entry(pid).or_insert(0) += 1;
        }
    }

    // 排序取 Top 10
    let mut top_paths: Vec<(String, usize)> = path_counts.into_iter().collect();
    top_paths.sort_unstable_by(|a, b| b.1.cmp(&a.1));
    top_paths.truncate(10);

    let mut top_pids: Vec<(u32, usize)> = pid_counts.into_iter().collect();
    top_pids.sort_unstable_by(|a, b| b.1.cmp(&a.1));
    top_pids.truncate(10);

    // 日统计按日期排序
    let mut daily_distribution: Vec<DailyCount> = daily_map
        .into_iter()
        .map(|(date, (total, by_source, by_hour))| DailyCount {
            date,
            total,
            by_source,
            by_hour,
        })
        .collect();
    daily_distribution.sort_unstable_by(|a, b| a.date.cmp(&b.date));

    // 异常汇总
    let mut anomaly_by_type: HashMap<String, usize> = HashMap::new();
    let mut max_severity: u8 = 0;
    let mut high_severity_count: usize = 0;
    for anomaly in anomalies {
        *anomaly_by_type
            .entry(anomaly.anomaly_type.clone())
            .or_insert(0) += 1;
        if anomaly.severity > max_severity {
            max_severity = anomaly.severity;
        }
        if anomaly.severity >= 3 {
            high_severity_count += 1;
        }
    }

    Ok(TimelineStatistics {
        total_count,
        source_counts,
        severity_counts,
        action_counts,
        hourly_distribution,
        daily_distribution,
        top_paths,
        top_pids,
        anomaly_summary: AnomalySummary {
            total_anomalies: anomalies.len(),
            by_type: anomaly_by_type,
            max_severity,
            high_severity_count,
        },
    })
}
