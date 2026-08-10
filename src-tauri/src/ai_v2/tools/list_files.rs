//! 列出文件工具

use super::Tool;
use crate::ai_v2::types::{ConcurrencySafety, ToolCallResult, ToolContext};
use async_trait::async_trait;
use std::path::Path;
use tokio::fs;

/// 列出文件工具
pub struct ListFilesTool;

#[async_trait]
impl Tool for ListFilesTool {
    fn id(&self) -> &str {
        "list_files"
    }

    fn name(&self) -> &str {
        "list_files"
    }

    fn description(&self) -> &str {
        "列出目录中的所有文件和子目录。支持文件名过滤和递归列出。"
    }

    fn concurrency_safety(&self) -> ConcurrencySafety {
        ConcurrencySafety::Safe
    }

    fn is_read_only(&self) -> bool {
        true
    }

    fn activity_description(&self, args: &serde_json::Value) -> String {
        let dir = args["directory"].as_str().unwrap_or("工作目录");
        format!("正在浏览 {}", dir)
    }

    fn parameters(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "directory": {
                    "type": "string",
                    "description": "要列出的目录路径，默认为输出目录"
                },
                "filter": {
                    "type": "string",
                    "description": "文件名过滤器，支持通配符。例如：'*.csv' 只列出CSV文件"
                },
                "recursive": {
                    "type": "boolean",
                    "description": "是否递归列出子目录"
                }
            },
            "required": []
        })
    }

    async fn execute(&self, args: serde_json::Value, ctx: &ToolContext) -> ToolCallResult {
        let directory = args["directory"].as_str().unwrap_or(&ctx.output_path);
        let filter = args["filter"].as_str();
        let recursive = args["recursive"].as_bool().unwrap_or(false);

        // 确定目录路径
        let dir_path = if Path::new(directory).is_absolute() {
            directory.to_string()
        } else {
            format!("{}/{}", ctx.output_path, directory)
        };

        match list_directory(&dir_path, filter, recursive).await {
            Ok(files) => {
                if files.is_empty() {
                    return ToolCallResult {
                        call_id: String::new(),
                        name: self.name().to_string(),
                        output: format!("目录 '{}' 为空或未找到匹配的文件", dir_path),
                        success: true,
                        metadata: None,
                        duration_ms: 0,
                        truncated: false,
                    };
                }

                let file_list: Vec<String> = files
                    .iter()
                    .map(|f| {
                        format!(
                            "{} {} ({})",
                            if f.is_dir { "📁" } else { "📄" },
                            f.name,
                            format_size(f.size)
                        )
                    })
                    .collect();

                let output = format!(
                    "目录: {}\n共 {} 个项目:\n{}",
                    dir_path,
                    files.len(),
                    file_list.join("\n")
                );

                ToolCallResult {
                    call_id: String::new(),
                    name: self.name().to_string(),
                    output,
                    success: true,
                    metadata: Some(serde_json::json!({
                        "count": files.len(),
                        "directory": dir_path
                    })),
                    duration_ms: 0,
                    truncated: false,
                }
            }
            Err(e) => ToolCallResult {
                call_id: String::new(),
                name: self.name().to_string(),
                output: format!("列出目录失败: {}", e),
                success: false,
                metadata: None,
                duration_ms: 0,
                truncated: false,
            },
        }
    }
}

/// 文件信息
struct FileInfo {
    name: String,
    size: u64,
    is_dir: bool,
}

/// 列出目录内容
async fn list_directory(
    path: &str,
    filter: Option<&str>,
    recursive: bool,
) -> Result<Vec<FileInfo>, String> {
    let mut files = Vec::new();

    let mut entries = fs::read_dir(path)
        .await
        .map_err(|e| format!("无法读取目录: {}", e))?;

    while let Some(entry) = entries
        .next_entry()
        .await
        .map_err(|e| format!("读取条目失败: {}", e))?
    {
        let metadata = entry
            .metadata()
            .await
            .map_err(|e| format!("获取元数据失败: {}", e))?;

        let name = entry.file_name().to_string_lossy().to_string();
        let is_dir = metadata.is_dir();
        let size = if is_dir { 0 } else { metadata.len() };

        // 应用过滤器
        if let Some(pattern) = filter {
            if !matches_pattern(&name, pattern) {
                continue;
            }
        }

        files.push(FileInfo {
            name: name.clone(),
            size,
            is_dir,
        });

        // 递归处理子目录
        if recursive && is_dir {
            let sub_path = format!("{}/{}", path, name);
            if let Ok(sub_files) = Box::pin(list_directory(&sub_path, filter, true)).await {
                for mut sub_file in sub_files {
                    sub_file.name = format!("{}/{}", name, sub_file.name);
                    files.push(sub_file);
                }
            }
        }
    }

    // 排序：目录在前，然后按名称排序
    files.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.cmp(&b.name),
    });

    Ok(files)
}

/// 简单的通配符匹配
fn matches_pattern(name: &str, pattern: &str) -> bool {
    if pattern.contains('*') {
        let parts: Vec<&str> = pattern.split('*').collect();
        if parts.len() == 2 {
            let (prefix, suffix) = (parts[0], parts[1]);
            return name.starts_with(prefix) && name.ends_with(suffix);
        }
    }
    name.contains(pattern)
}

/// 格式化文件大小
fn format_size(size: u64) -> String {
    if size < 1024 {
        format!("{} B", size)
    } else if size < 1024 * 1024 {
        format!("{:.1} KB", size as f64 / 1024.0)
    } else if size < 1024 * 1024 * 1024 {
        format!("{:.1} MB", size as f64 / (1024.0 * 1024.0))
    } else {
        format!("{:.1} GB", size as f64 / (1024.0 * 1024.0 * 1024.0))
    }
}
