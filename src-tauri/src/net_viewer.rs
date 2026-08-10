//! 网络连接分析视图模块
//!
//! 从 net.csv 解析网络连接数据。

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

/// 网络连接条目
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetEntry {
    pub proto: String,
    pub state: String,
    pub src_addr: String,
    pub src_port: String,
    pub dst_addr: String,
    pub dst_port: String,
    pub time: String,
    pub object: String,
    pub pid: u32,
    pub process: String,
    pub process_path: String,
}

/// 网络统计
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetStats {
    pub total: u32,
    pub proto_dist: HashMap<String, u32>,
    pub state_dist: HashMap<String, u32>,
    pub process_dist: HashMap<String, u32>,
    pub top_states: Vec<String>,
    pub top_processes: Vec<String>,
}

/// 网络分析结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetResult {
    pub connections: Vec<NetEntry>,
    pub stats: NetStats,
}

#[tauri::command]
pub async fn parse_net_csv(csv_file_path: String) -> Result<NetResult, String> {
    debug_info!("[Net] 开始解析: {}", csv_file_path);

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
    let proto_idx = idx("Proto");
    let state_idx = idx("State");
    let src_idx = idx("SrcAddr");
    let sport_idx = idx("SrcPort");
    let dst_idx = idx("DstAddr");
    let dport_idx = idx("DstPort");
    let time_idx = idx("Time");
    let obj_idx = idx("Object");
    let pid_idx = idx("PID");
    let proc_idx = idx("Process");
    let path_idx = idx("ProcessPath");

    let mut connections = Vec::new();
    let mut proto_dist: HashMap<String, u32> = HashMap::new();
    let mut state_dist: HashMap<String, u32> = HashMap::new();
    let mut process_dist: HashMap<String, u32> = HashMap::new();

    for line_result in lines {
        let line = match line_result {
            Ok(l) => l,
            Err(_) => continue,
        };
        if line.trim().is_empty() {
            continue;
        }
        let v = parse_csv_line(line.trim(), ',');

        let get =
            |i: Option<usize>| -> String { i.and_then(|i| v.get(i)).cloned().unwrap_or_default() };
        let proto = get(proto_idx);
        let state = get(state_idx);
        let process = get(proc_idx);
        let pid: u32 = get(pid_idx).parse().unwrap_or(0);

        if !proto.is_empty() {
            *proto_dist.entry(proto.clone()).or_insert(0) += 1;
        }
        if !state.is_empty() {
            *state_dist.entry(state.clone()).or_insert(0) += 1;
        }
        if !process.is_empty() {
            *process_dist
                .entry(format!("{} ({})", process, pid))
                .or_insert(0) += 1;
        }

        connections.push(NetEntry {
            proto,
            state,
            pid,
            process,
            src_addr: get(src_idx),
            src_port: get(sport_idx),
            dst_addr: get(dst_idx),
            dst_port: get(dport_idx),
            time: get(time_idx).trim().to_string(),
            object: get(obj_idx),
            process_path: get(path_idx),
        });
    }

    // 排序
    let mut state_list: Vec<(String, u32)> =
        state_dist.iter().map(|(k, v)| (k.clone(), *v)).collect();
    state_list.sort_by(|a, b| b.1.cmp(&a.1));
    let top_states = state_list.iter().map(|(k, _)| k.clone()).collect();

    let mut proc_list: Vec<(String, u32)> =
        process_dist.iter().map(|(k, v)| (k.clone(), *v)).collect();
    proc_list.sort_by(|a, b| b.1.cmp(&a.1));
    let top_processes = proc_list.iter().take(10).map(|(k, _)| k.clone()).collect();

    let total = connections.len() as u32;
    let stats = NetStats {
        total,
        proto_dist,
        state_dist,
        process_dist,
        top_states,
        top_processes,
    };

    debug_info!("[Net] 完成: {} 个连接", total);
    Ok(NetResult { connections, stats })
}
