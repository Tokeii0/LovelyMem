//! 进程详情分析视图模块
//!
//! 从 process.csv 解析进程数据，构建进程树。

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

/// 扁平进程条目
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessEntry {
    pub pid: u32,
    pub ppid: u32,
    pub state: String,
    pub short_name: String,
    pub name: String,
    pub integrity: String,
    pub user: String,
    pub create_time: String,
    pub exit_time: String,
    pub wow64: bool,
    pub eprocess: String,
    pub peb: String,
    pub dtb: String,
    pub user_path: String,
    pub kernel_path: String,
    pub command_line: String,
    pub flag: String,
}

/// 进程树节点
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessTreeNode {
    pub process: ProcessEntry,
    pub children: Vec<ProcessTreeNode>,
    pub depth: u32,
}

/// 进程统计
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessStats {
    pub total: u32,
    pub active: u32,
    pub exited: u32,
    pub wow64_count: u32,
    pub user_dist: HashMap<String, u32>,
    pub integrity_dist: HashMap<String, u32>,
}

/// 进程分析结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessResult {
    pub tree: Vec<ProcessTreeNode>,
    pub flat: Vec<ProcessEntry>,
    pub stats: ProcessStats,
}

#[tauri::command]
pub async fn parse_process_csv(csv_file_path: String) -> Result<ProcessResult, String> {
    debug_info!("[Process] 开始解析: {}", csv_file_path);

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
    let ppid_idx = idx("PPID");
    let state_idx = idx("State");
    let sname_idx = idx("ShortName");
    let name_idx = idx("Name");
    let integ_idx = idx("IntegrityLevel");
    let user_idx = idx("User");
    let ctime_idx = idx("CreateTime");
    let etime_idx = idx("ExitTime");
    let wow64_idx = idx("Wow64");
    let eproc_idx = idx("EPROCESS");
    let peb_idx = idx("PEB");
    let dtb_idx = idx("DTB");
    let upath_idx = idx("UserPath");
    let kpath_idx = idx("KernelPath");
    let cmd_idx = idx("CommandLine");
    let flag_idx = idx("Flag");

    let mut processes = Vec::new();
    let mut stats = ProcessStats {
        total: 0,
        active: 0,
        exited: 0,
        wow64_count: 0,
        user_dist: HashMap::new(),
        integrity_dist: HashMap::new(),
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
        let ppid: u32 = get(ppid_idx).parse().unwrap_or(0);
        let state_str = get(state_idx);
        let wow64 = get(wow64_idx) == "1";
        let user = get(user_idx);
        let integrity = get(integ_idx);
        let exit_time = get(etime_idx);

        // 状态判断：有 exit_time 表示已退出
        let is_exited = !exit_time.is_empty();
        if is_exited {
            stats.exited += 1;
        } else {
            stats.active += 1;
        }
        if wow64 {
            stats.wow64_count += 1;
        }
        if !user.is_empty() {
            *stats.user_dist.entry(user.clone()).or_insert(0) += 1;
        }
        if !integrity.is_empty() {
            *stats.integrity_dist.entry(integrity.clone()).or_insert(0) += 1;
        }

        processes.push(ProcessEntry {
            pid,
            ppid,
            state: state_str,
            short_name: get(sname_idx),
            name: get(name_idx),
            integrity,
            user,
            create_time: get(ctime_idx),
            exit_time,
            wow64,
            eprocess: get(eproc_idx),
            peb: get(peb_idx),
            dtb: get(dtb_idx),
            user_path: get(upath_idx),
            kernel_path: get(kpath_idx),
            command_line: get(cmd_idx),
            flag: get(flag_idx),
        });
        stats.total += 1;
    }

    // 构建进程树
    let tree = build_process_tree(&processes);

    debug_info!("[Process] 完成: {} 个进程", stats.total);
    Ok(ProcessResult {
        tree,
        flat: processes,
        stats,
    })
}

fn build_process_tree(processes: &[ProcessEntry]) -> Vec<ProcessTreeNode> {
    let pid_set: std::collections::HashSet<u32> = processes.iter().map(|p| p.pid).collect();
    let mut children_map: HashMap<u32, Vec<&ProcessEntry>> = HashMap::new();

    for p in processes {
        children_map.entry(p.ppid).or_default().push(p);
    }

    // 找根节点：ppid 不在 pid_set 中的
    let roots: Vec<&ProcessEntry> = processes
        .iter()
        .filter(|p| !pid_set.contains(&p.ppid) || p.ppid == 0)
        .collect();

    fn build_node(
        proc: &ProcessEntry,
        children_map: &HashMap<u32, Vec<&ProcessEntry>>,
        depth: u32,
    ) -> ProcessTreeNode {
        let children = children_map
            .get(&proc.pid)
            .map(|kids| {
                kids.iter()
                    .map(|k| build_node(k, children_map, depth + 1))
                    .collect()
            })
            .unwrap_or_default();
        ProcessTreeNode {
            process: proc.clone(),
            children,
            depth,
        }
    }

    roots
        .iter()
        .map(|r| build_node(r, &children_map, 0))
        .collect()
}
