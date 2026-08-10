use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ModuleTypeCount {
    pub extension: String,
    pub count: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ModuleStats {
    pub dll_count: usize,
    pub sys_count: usize,
    pub other_count: usize,
    pub total_count: usize,
    pub other_breakdown: Vec<ModuleTypeCount>,
}

/// 统计指定 PID 的模块数量
///
/// # Arguments
/// * `output_path` - output 目录路径
/// * `pid` - 进程 ID
///
/// # Returns
/// * `Result<ModuleStats, String>` - 模块统计结果或错误信息
#[tauri::command]
pub async fn get_module_stats_by_pid(
    output_path: String,
    pid: String,
) -> Result<ModuleStats, String> {
    use std::fs::File;
    use std::io::{BufRead, BufReader};

    debug_info!("📊 开始统计 PID {} 的模块数量", pid);

    // 构建 modules.csv 文件路径
    let modules_csv_path = Path::new(&output_path).join("modules.csv");

    // 检查文件是否存在
    if !modules_csv_path.exists() {
        return Err(format!(
            "modules.csv 文件不存在: {}",
            modules_csv_path.display()
        ));
    }

    debug_info!("📂 读取文件: {}", modules_csv_path.display());

    // 打开文件
    let file = File::open(&modules_csv_path).map_err(|e| format!("无法打开 modules.csv: {}", e))?;

    let reader = BufReader::new(file);
    let mut lines = reader.lines();

    // 读取表头
    let header_line = lines
        .next()
        .ok_or_else(|| "modules.csv 文件为空".to_string())?
        .map_err(|e| format!("读取表头失败: {}", e))?;

    // 解析表头，找到 PID 和 Name 列的索引
    debug_info!("📄 表头原始内容: {}", header_line);

    let delimiter = if header_line.contains('\t') {
        '\t'
    } else {
        ','
    };
    debug_info!("🪚 检测到的分隔符: '{}'", delimiter);

    let headers: Vec<String> = header_line
        .split(delimiter)
        .map(|h| h.trim().trim_matches('"').to_string())
        .collect();

    debug_info!("🧾 解析后的表头: {:?}", headers);

    let pid_index = headers
        .iter()
        .position(|h| h.eq_ignore_ascii_case("PID"))
        .ok_or_else(|| format!("未找到 PID 列，可用列: {:?}", headers))?;
    let name_index = headers
        .iter()
        .position(|h| h.eq_ignore_ascii_case("Name"))
        .ok_or_else(|| format!("未找到 Name 列，可用列: {:?}", headers))?;

    debug_info!("📋 PID 列索引: {}, Name 列索引: {}", pid_index, name_index);

    // 统计变量
    let mut dll_count = 0;
    let mut sys_count = 0;
    let mut other_counts: HashMap<String, usize> = HashMap::new();

    // 遍历所有行
    for line_result in lines {
        let line = line_result.map_err(|e| format!("读取行失败: {}", e))?;

        // 跳过空行
        if line.trim().is_empty() {
            continue;
        }

        let fields: Vec<&str> = line.split(delimiter).collect();

        // 确保有足够的字段
        if fields.len() <= pid_index.max(name_index) {
            continue;
        }

        // 检查 PID 是否匹配
        let row_pid = fields[pid_index].trim().trim_matches('"');
        if row_pid != pid {
            //println!("🚫 PID 不匹配: pid={}, row_pid={}", pid, row_pid);
            continue;
        }

        //println!("🔍 匹配到 PID 行: pid={}, row_pid={}", pid, row_pid);

        // 获取 Name 字段
        let name = fields[name_index].trim().trim_matches('"').to_lowercase();

        if name.is_empty() {
            continue;
        }

        let extension = Path::new(&name)
            .extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("")
            .to_lowercase();

        match extension.as_str() {
            "dll" => dll_count += 1,
            "sys" => sys_count += 1,
            ext => {
                let key = if ext.is_empty() {
                    "无扩展".to_string()
                } else {
                    ext.to_uppercase()
                };
                *other_counts.entry(key).or_insert(0) += 1;
            }
        }
    }

    let mut other_breakdown: Vec<ModuleTypeCount> = other_counts
        .into_iter()
        .map(|(extension, count)| ModuleTypeCount { extension, count })
        .collect();

    other_breakdown.sort_by(|a, b| {
        b.count
            .cmp(&a.count)
            .then_with(|| a.extension.cmp(&b.extension))
    });

    let other_count: usize = other_breakdown.iter().map(|entry| entry.count).sum();
    let total_count = dll_count + sys_count + other_count;

    if other_breakdown.is_empty() {
        debug_info!(
            "✅ 统计完成 - DLL: {}, SYS: {}, 其他: 0, 总计: {}",
            dll_count,
            sys_count,
            total_count
        );
    } else {
        let detail = other_breakdown
            .iter()
            .map(|entry| format!("{}: {}", entry.extension, entry.count))
            .collect::<Vec<_>>()
            .join(", ");
        debug_info!(
            "✅ 统计完成 - DLL: {}, SYS: {}, 其他: {} [{}], 总计: {}",
            dll_count,
            sys_count,
            other_count,
            detail,
            total_count
        );
    }

    Ok(ModuleStats {
        dll_count,
        sys_count,
        other_count,
        total_count,
        other_breakdown,
    })
}
