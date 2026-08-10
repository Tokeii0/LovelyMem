//! 驱动程序分析视图模块
//!
//! 从 drivers.csv 解析驱动信息。

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::File;
use std::io::{BufRead, BufReader};

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
            _ => {
                current.push(c);
            }
        }
    }
    result.push(current.trim().to_string());
    result
}

/// 单个驱动条目
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DriverEntry {
    pub name: String,
    pub object_address: String,
    pub size: String,
    pub size_bytes: u64,
    pub start_addr: String,
    pub end_addr: String,
    pub service_key: String,
    pub driver_name: String,
    pub driver_path: String,
}

/// 驱动统计
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DriversStats {
    pub total: u32,
    pub with_path: u32,
    pub without_path: u32,
    pub total_size: u64,
    /// 按驱动路径目录分布
    pub path_dist: HashMap<String, u32>,
    pub top_paths: Vec<String>,
}

/// 驱动分析结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DriversResult {
    pub drivers: Vec<DriverEntry>,
    pub stats: DriversStats,
}

#[tauri::command]
pub async fn parse_drivers_csv(csv_file_path: String) -> Result<DriversResult, String> {
    debug_info!("[Drivers] 开始解析: {}", csv_file_path);

    if !std::path::Path::new(&csv_file_path).exists() {
        return Err(format!("文件不存在: {}", csv_file_path));
    }

    let file = File::open(&csv_file_path).map_err(|e| format!("无法打开文件: {}", e))?;
    let reader = BufReader::new(file);
    let mut lines = reader.lines();

    let header = lines
        .next()
        .ok_or("文件为空")?
        .map_err(|e| format!("{}", e))?;
    let headers = parse_csv_line(header.trim(), ',');

    let idx = |name: &str| headers.iter().position(|h| h == name);
    let name_idx = idx("Name").ok_or("找不到 Name 列")?;
    let obj_idx = idx("ObjectAddress");
    let size_idx = idx("Size");
    let start_idx = idx("Start");
    let end_idx = idx("End");
    let skey_idx = idx("ServiceKey");
    let dname_idx = idx("DriverName");
    let dpath_idx = idx("DriverPath");

    let mut drivers = Vec::new();
    let mut with_path = 0u32;
    let mut without_path = 0u32;
    let mut total_size = 0u64;
    let mut path_dist: HashMap<String, u32> = HashMap::new();

    for line_result in lines {
        let line = match line_result {
            Ok(l) => l,
            Err(_) => continue,
        };
        if line.trim().is_empty() {
            continue;
        }
        let v = parse_csv_line(line.trim(), ',');
        if v.len() <= name_idx {
            continue;
        }

        let get =
            |i: Option<usize>| -> String { i.and_then(|i| v.get(i)).cloned().unwrap_or_default() };
        let size_str = get(size_idx);
        let size_bytes: u64 = if size_str.starts_with("0x") {
            u64::from_str_radix(&size_str[2..], 16).unwrap_or(0)
        } else {
            size_str.parse().unwrap_or(0)
        };
        let driver_path = get(dpath_idx);

        if driver_path.is_empty() {
            without_path += 1;
        } else {
            with_path += 1;
            // 提取路径目录
            let dir = if let Some(pos) = driver_path.rfind('\\') {
                driver_path[..pos].to_string()
            } else {
                driver_path.clone()
            };
            if !dir.is_empty() {
                *path_dist.entry(dir).or_insert(0) += 1;
            }
        }

        total_size += size_bytes;

        drivers.push(DriverEntry {
            name: v[name_idx].clone(),
            object_address: get(obj_idx),
            size: size_str,
            size_bytes,
            start_addr: get(start_idx),
            end_addr: get(end_idx),
            service_key: get(skey_idx),
            driver_name: get(dname_idx),
            driver_path,
        });
    }

    // 按名称排序
    drivers.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    let mut path_list: Vec<(String, u32)> =
        path_dist.iter().map(|(k, v)| (k.clone(), *v)).collect();
    path_list.sort_by(|a, b| b.1.cmp(&a.1));
    let top_paths: Vec<String> = path_list.iter().take(8).map(|(k, _)| k.clone()).collect();

    let total = drivers.len() as u32;
    let stats = DriversStats {
        total,
        with_path,
        without_path,
        total_size,
        path_dist,
        top_paths,
    };

    debug_info!("[Drivers] 完成: {} 个驱动", total);
    Ok(DriversResult { drivers, stats })
}
