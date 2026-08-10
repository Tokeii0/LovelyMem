//! 模块信息分析视图模块
//!
//! 从 modules.csv 解析模块数据，按进程分组。

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

/// 单个模块条目
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModuleEntry {
    pub name: String,
    pub wow64: bool,
    pub size: String,
    pub start_addr: String,
    pub end_addr: String,
    pub imports: u32,
    pub exports: u32,
    pub sections: u32,
    pub path: String,
    pub company: String,
    pub description: String,
    pub file_version: String,
    pub product_name: String,
}

/// 按进程分组的模块
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessModules {
    pub pid: u32,
    pub process_name: String,
    pub modules: Vec<ModuleEntry>,
    pub total_modules: u32,
    pub total_size: u64,
}

/// 模块统计
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModulesStats {
    pub total_processes: u32,
    pub total_modules: u32,
    pub wow64_count: u32,
    /// 按公司分布
    pub company_dist: HashMap<String, u32>,
    /// 前N个公司名
    pub top_companies: Vec<String>,
}

/// 模块分析结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModulesResult {
    pub processes: Vec<ProcessModules>,
    pub stats: ModulesStats,
}

#[tauri::command]
pub async fn parse_modules_csv(csv_file_path: String) -> Result<ModulesResult, String> {
    debug_info!("[Modules] 开始解析: {}", csv_file_path);

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
    let proc_idx = idx("Process");
    let name_idx = idx("Name");
    let wow64_idx = idx("Wow64");
    let size_idx = idx("Size");
    let start_idx = idx("Start");
    let end_idx = idx("End");
    let imports_idx = idx("#Imports");
    let exports_idx = idx("#Exports");
    let sections_idx = idx("#Sections");
    let path_idx = idx("Path");
    let company_idx = idx("VerCompanyName");
    let desc_idx = idx("VerFileDescription");
    let ver_idx = idx("VerFileVersion");
    let product_idx = idx("VerProductName");

    let mut pid_map: HashMap<u32, (String, Vec<ModuleEntry>, u64)> = HashMap::new();
    let mut company_dist: HashMap<String, u32> = HashMap::new();
    let mut total = 0u32;
    let mut wow64_count = 0u32;

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
        let proc_name = get(proc_idx);
        let name = get(name_idx);
        let wow64 = get(wow64_idx) == "1";
        let size_str = get(size_idx);
        let size_val: u64 = if size_str.starts_with("0x") {
            u64::from_str_radix(&size_str[2..], 16).unwrap_or(0)
        } else {
            size_str.parse().unwrap_or(0)
        };
        let imports: u32 = get(imports_idx).parse().unwrap_or(0);
        let exports: u32 = get(exports_idx).parse().unwrap_or(0);
        let sections: u32 = get(sections_idx).parse().unwrap_or(0);
        let company = get(company_idx);

        if wow64 {
            wow64_count += 1;
        }
        if !company.is_empty() {
            *company_dist.entry(company.clone()).or_insert(0) += 1;
        }

        let entry = ModuleEntry {
            name,
            wow64,
            size: size_str,
            start_addr: get(start_idx),
            end_addr: get(end_idx),
            imports,
            exports,
            sections,
            path: get(path_idx),
            company,
            description: get(desc_idx),
            file_version: get(ver_idx),
            product_name: get(product_idx),
        };

        let (pname, modules, total_size) = pid_map
            .entry(pid)
            .or_insert_with(|| (String::new(), Vec::new(), 0u64));
        if pname.is_empty() && !proc_name.is_empty() {
            *pname = proc_name;
        }
        *total_size += size_val;
        modules.push(entry);
        total += 1;
    }

    // 公司分布排序
    let mut company_list: Vec<(String, u32)> =
        company_dist.iter().map(|(k, v)| (k.clone(), *v)).collect();
    company_list.sort_by(|a, b| b.1.cmp(&a.1));
    let top_companies: Vec<String> = company_list
        .iter()
        .take(10)
        .map(|(k, _)| k.clone())
        .collect();

    let mut processes: Vec<ProcessModules> = pid_map
        .into_iter()
        .map(|(pid, (name, modules, total_size))| {
            let total_modules = modules.len() as u32;
            let pname = if name.is_empty() {
                format!("PID {}", pid)
            } else {
                name
            };
            ProcessModules {
                pid,
                process_name: pname,
                modules,
                total_modules,
                total_size,
            }
        })
        .collect();

    processes.sort_by(|a, b| b.total_modules.cmp(&a.total_modules));

    let stats = ModulesStats {
        total_processes: processes.len() as u32,
        total_modules: total,
        wow64_count,
        company_dist,
        top_companies,
    };

    debug_info!(
        "[Modules] 完成: {} 个进程, {} 个模块",
        stats.total_processes,
        stats.total_modules
    );
    Ok(ModulesResult { processes, stats })
}
