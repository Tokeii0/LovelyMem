//! 句柄分析视图模块
//!
//! 从 handles.csv 解析句柄数据，按进程分组，统计类型分布。

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::File;
use std::io::{BufRead, BufReader};

/// 解析 CSV 行（处理引号字段）
fn parse_csv_line(line: &str, delimiter: char) -> Vec<String> {
    if !line.contains('"') {
        return line
            .split(delimiter)
            .map(|s| s.trim().to_string())
            .collect();
    }

    let mut result = Vec::new();
    let mut current_field = String::new();
    let mut in_quotes = false;
    let mut chars = line.chars().peekable();

    while let Some(c) = chars.next() {
        match c {
            '"' => {
                if in_quotes {
                    if chars.peek() == Some(&'"') {
                        current_field.push('"');
                        chars.next();
                    } else {
                        in_quotes = false;
                    }
                } else {
                    in_quotes = true;
                }
            }
            c if c == delimiter && !in_quotes => {
                result.push(current_field.trim().to_string());
                current_field = String::new();
            }
            _ => {
                current_field.push(c);
            }
        }
    }

    result.push(current_field.trim().to_string());
    result
}

/// 单个句柄条目
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HandleEntry {
    pub handle: String,
    pub object: String,
    pub access: String,
    pub handle_type: String,
    pub tag: String,
    pub handle_count: String,
    pub device: String,
    pub description: String,
}

/// 单个进程的句柄信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessHandles {
    pub pid: u32,
    pub process_name: String,
    pub handles: Vec<HandleEntry>,
    pub total_handles: u32,
    /// 各类型的分布 { "Key": 45, "File": 12, ... }
    pub type_distribution: HashMap<String, u32>,
}

/// 句柄分析全局统计
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HandlesStats {
    pub total_processes: u32,
    pub total_handles: u32,
    /// 全局各类型分布
    pub type_distribution: HashMap<String, u32>,
    /// 按数量降序的类型名称列表
    pub top_types: Vec<String>,
}

/// 句柄分析结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HandlesResult {
    pub processes: Vec<ProcessHandles>,
    pub stats: HandlesStats,
}

/// 解析 handles.csv 并按进程分组
#[tauri::command]
pub async fn parse_handles_csv(csv_file_path: String) -> Result<HandlesResult, String> {
    debug_info!("[Handles] 开始解析: {}", csv_file_path);

    if !std::path::Path::new(&csv_file_path).exists() {
        return Err(format!("文件不存在: {}", csv_file_path));
    }

    let file = File::open(&csv_file_path).map_err(|e| format!("无法打开文件: {}", e))?;
    let reader = BufReader::new(file);
    let mut lines = reader.lines();

    // 读取表头: PID,Handle,Object,Access,Type,Tag,HandleCount,Device,Description
    let header_line = lines
        .next()
        .ok_or("文件为空")?
        .map_err(|e| format!("读取表头失败: {}", e))?;
    let headers = parse_csv_line(header_line.trim(), ',');

    let pid_idx = headers
        .iter()
        .position(|h| h == "PID")
        .ok_or("CSV 中找不到 PID 列")?;
    let handle_idx = headers.iter().position(|h| h == "Handle");
    let object_idx = headers.iter().position(|h| h == "Object");
    let access_idx = headers.iter().position(|h| h == "Access");
    let type_idx = headers.iter().position(|h| h == "Type");
    let tag_idx = headers.iter().position(|h| h == "Tag");
    let hcount_idx = headers.iter().position(|h| h == "HandleCount");
    let device_idx = headers.iter().position(|h| h == "Device");
    let desc_idx = headers.iter().position(|h| h == "Description");

    // 按 PID 分组收集
    let mut pid_map: HashMap<u32, (String, Vec<HandleEntry>, HashMap<String, u32>)> =
        HashMap::new();
    let mut global_type_dist: HashMap<String, u32> = HashMap::new();
    let mut line_count = 0u32;

    for line_result in lines {
        match line_result {
            Ok(line) => {
                if line.trim().is_empty() {
                    continue;
                }

                let values = parse_csv_line(line.trim(), ',');
                if values.len() <= pid_idx {
                    continue;
                }

                let pid_str = &values[pid_idx];
                let pid: u32 = match pid_str.parse() {
                    Ok(p) => p,
                    Err(_) => continue,
                };

                let get_val = |idx: Option<usize>| -> String {
                    idx.and_then(|i| values.get(i)).cloned().unwrap_or_default()
                };

                let handle_type = get_val(type_idx).trim().to_string();
                let description = get_val(desc_idx);

                // 统计类型分布
                let type_clean = handle_type.trim().to_string();
                if !type_clean.is_empty() {
                    *global_type_dist.entry(type_clean.clone()).or_insert(0) += 1;
                }

                let entry = HandleEntry {
                    handle: get_val(handle_idx),
                    object: get_val(object_idx),
                    access: get_val(access_idx),
                    handle_type: type_clean.clone(),
                    tag: get_val(tag_idx).trim().to_string(),
                    handle_count: get_val(hcount_idx),
                    device: get_val(device_idx),
                    description: description.clone(),
                };

                let (proc_name, handles, type_dist) = pid_map
                    .entry(pid)
                    .or_insert_with(|| (String::new(), Vec::new(), HashMap::new()));

                // 从 Process 类型的句柄中提取进程名
                if handle_type == "Process" && proc_name.is_empty() && description.contains(" - ") {
                    if let Some(name_part) = description.split(" - ").nth(1) {
                        *proc_name = name_part.trim().to_string();
                    }
                }

                if !type_clean.is_empty() {
                    *type_dist.entry(type_clean).or_insert(0) += 1;
                }

                handles.push(entry);
                line_count += 1;
            }
            Err(_) => continue,
        }
    }

    debug_info!(
        "[Handles] 解析完成: {} 行, {} 个进程",
        line_count,
        pid_map.len()
    );

    // 排序: top_types 按数量降序
    let mut type_list: Vec<(String, u32)> = global_type_dist
        .iter()
        .map(|(k, v)| (k.clone(), *v))
        .collect();
    type_list.sort_by(|a, b| b.1.cmp(&a.1));
    let top_types: Vec<String> = type_list.iter().map(|(k, _)| k.clone()).collect();

    // 构建进程列表，按句柄数降序
    let mut processes: Vec<ProcessHandles> = pid_map
        .into_iter()
        .map(|(pid, (name, handles, type_dist))| {
            let total = handles.len() as u32;
            let proc_name = if name.is_empty() {
                format!("PID {}", pid)
            } else {
                name
            };
            ProcessHandles {
                pid,
                process_name: proc_name,
                handles,
                total_handles: total,
                type_distribution: type_dist,
            }
        })
        .collect();

    processes.sort_by(|a, b| b.total_handles.cmp(&a.total_handles));

    let stats = HandlesStats {
        total_processes: processes.len() as u32,
        total_handles: line_count,
        type_distribution: global_type_dist,
        top_types,
    };

    debug_info!(
        "[Handles] 构建完成: {} 个进程, {} 个句柄, {} 种类型",
        stats.total_processes,
        stats.total_handles,
        stats.top_types.len()
    );

    Ok(HandlesResult { processes, stats })
}
