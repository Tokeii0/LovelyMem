//! 系统服务分析视图模块
//!
//! 从 services.csv 解析服务数据，按状态和类型分组统计。

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

/// 单个服务条目
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceEntry {
    pub pid: u32,
    pub ordinal: String,
    pub service_name: String,
    pub display_name: String,
    pub user: String,
    pub start_type: String,
    pub state: String,
    pub type1: String,
    pub type2: String,
    pub object_address: String,
    pub image_path: String,
    pub driver_path: String,
}

/// 服务统计
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServicesStats {
    pub total: u32,
    pub running: u32,
    pub stopped: u32,
    pub drivers: u32,
    pub processes: u32,
    pub start_type_dist: HashMap<String, u32>,
    pub state_dist: HashMap<String, u32>,
}

/// 服务分析结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServicesResult {
    pub services: Vec<ServiceEntry>,
    pub stats: ServicesStats,
}

#[tauri::command]
pub async fn parse_services_csv(csv_file_path: String) -> Result<ServicesResult, String> {
    debug_info!("[Services] 开始解析: {}", csv_file_path);

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
    let pid_idx = idx("PID").ok_or("找不到 PID 列")?;
    let ordinal_idx = idx("Ordinal");
    let sname_idx = idx("ServiceName");
    let dname_idx = idx("DisplayName");
    let user_idx = idx("User");
    let start_idx = idx("StartType");
    let state_idx = idx("State");
    let t1_idx = idx("Type1");
    let t2_idx = idx("Type2");
    let obj_idx = idx("ObjectAddress");
    let img_idx = idx("ImagePath");
    let drv_idx = idx("DriverpathOrCmdline");

    let mut services = Vec::new();
    let mut stats = ServicesStats {
        total: 0,
        running: 0,
        stopped: 0,
        drivers: 0,
        processes: 0,
        start_type_dist: HashMap::new(),
        state_dist: HashMap::new(),
    };

    for line_result in lines {
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
        let state = get(state_idx);
        let type1 = get(t1_idx);
        let start_type = get(start_idx);

        // 统计
        if state.contains("RUNNING") {
            stats.running += 1;
        }
        if state.contains("STOPPED") {
            stats.stopped += 1;
        }
        if type1 == "Driver" {
            stats.drivers += 1;
        }
        if type1 == "Process" {
            stats.processes += 1;
        }
        *stats.start_type_dist.entry(start_type.clone()).or_insert(0) += 1;
        *stats.state_dist.entry(state.clone()).or_insert(0) += 1;

        services.push(ServiceEntry {
            pid,
            ordinal: get(ordinal_idx),
            service_name: get(sname_idx),
            display_name: get(dname_idx),
            user: get(user_idx),
            start_type,
            state,
            type1,
            type2: get(t2_idx),
            object_address: get(obj_idx),
            image_path: get(img_idx),
            driver_path: get(drv_idx),
        });
        stats.total += 1;
    }

    // 排序: 运行中的排前面, 再按名称排序
    services.sort_by(|a, b| {
        let a_run = a.state.contains("RUNNING");
        let b_run = b.state.contains("RUNNING");
        match (a_run, b_run) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a
                .service_name
                .to_lowercase()
                .cmp(&b.service_name.to_lowercase()),
        }
    });

    debug_info!("[Services] 完成: {} 个服务", stats.total);
    Ok(ServicesResult { services, stats })
}
