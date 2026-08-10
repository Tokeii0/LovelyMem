//! CSV 分析工具

use super::Tool;
use crate::ai_v2::types::{ToolCallResult, ToolContext};
use async_trait::async_trait;
use std::collections::HashMap;
use std::path::Path;
use tokio::fs;

/// CSV 分析工具
pub struct AnalyzeCsvTool;

#[async_trait]
impl Tool for AnalyzeCsvTool {
    fn id(&self) -> &str {
        "analyze_csv"
    }

    fn name(&self) -> &str {
        "analyze_csv"
    }

    fn description(&self) -> &str {
        "分析CSV文件，提供数据统计、列信息和数据预览。支持分组统计和数据筛选。"
    }

    fn parameters(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "filename": {
                    "type": "string",
                    "description": "CSV文件名"
                },
                "operation": {
                    "type": "string",
                    "enum": ["info", "preview", "group_by", "filter"],
                    "description": "操作类型: info=获取列信息, preview=预览数据, group_by=分组统计, filter=筛选数据"
                },
                "column": {
                    "type": "string",
                    "description": "用于分组或筛选的列名"
                },
                "filter_value": {
                    "type": "string",
                    "description": "筛选值"
                },
                "limit": {
                    "type": "integer",
                    "description": "限制返回行数，默认20"
                }
            },
            "required": ["filename"]
        })
    }

    async fn execute(&self, args: serde_json::Value, ctx: &ToolContext) -> ToolCallResult {
        let filename = args["filename"].as_str().unwrap_or("");
        let operation = args["operation"].as_str().unwrap_or("info");
        let column = args["column"].as_str();
        let filter_value = args["filter_value"].as_str();
        let limit = args["limit"].as_u64().unwrap_or(20) as usize;

        if filename.is_empty() {
            return ToolCallResult {
                call_id: String::new(),
                name: self.name().to_string(),
                output: "错误: 未指定文件名".to_string(),
                success: false,
                metadata: None,
                duration_ms: 0,
                truncated: false,
            };
        }

        let file_path = if Path::new(filename).is_absolute() {
            filename.to_string()
        } else {
            format!("{}/{}", ctx.output_path, filename)
        };

        // 读取CSV文件
        let content = match fs::read_to_string(&file_path).await {
            Ok(c) => c,
            Err(e) => {
                return ToolCallResult {
                    call_id: String::new(),
                    name: self.name().to_string(),
                    output: format!("读取文件失败: {}", e),
                    success: false,
                    metadata: None,
                    duration_ms: 0,
                    truncated: false,
                };
            }
        };

        let lines: Vec<&str> = content.lines().collect();
        if lines.is_empty() {
            return ToolCallResult {
                call_id: String::new(),
                name: self.name().to_string(),
                output: "文件为空".to_string(),
                success: false,
                metadata: None,
                duration_ms: 0,
                truncated: false,
            };
        }

        // 解析CSV头
        let headers: Vec<&str> = lines[0].split(',').map(|s| s.trim()).collect();
        let total_rows = lines.len() - 1;

        match operation {
            "info" => {
                let output = format!(
                    "CSV文件: {}\n总行数: {}\n列数: {}\n\n列名:\n{}",
                    filename,
                    total_rows,
                    headers.len(),
                    headers
                        .iter()
                        .enumerate()
                        .map(|(i, h)| format!("  {}. {}", i + 1, h))
                        .collect::<Vec<_>>()
                        .join("\n")
                );

                ToolCallResult {
                    call_id: String::new(),
                    name: self.name().to_string(),
                    output,
                    success: true,
                    metadata: Some(serde_json::json!({
                        "total_rows": total_rows,
                        "columns": headers
                    })),
                    duration_ms: 0,
                    truncated: false,
                }
            }
            "preview" => {
                let preview_lines: Vec<String> = lines
                    .iter()
                    .take(limit + 1)
                    .map(|l| l.to_string())
                    .collect();

                let output = format!(
                    "CSV预览 (前{}行):\n\n{}",
                    limit.min(total_rows),
                    preview_lines.join("\n")
                );

                ToolCallResult {
                    call_id: String::new(),
                    name: self.name().to_string(),
                    output,
                    success: true,
                    metadata: None,
                    duration_ms: 0,
                    truncated: false,
                }
            }
            "group_by" => {
                let col_name = match column {
                    Some(c) => c,
                    None => {
                        return ToolCallResult {
                            call_id: String::new(),
                            name: self.name().to_string(),
                            output: "错误: group_by操作需要指定column参数".to_string(),
                            success: false,
                            metadata: None,
                            duration_ms: 0,
                            truncated: false,
                        };
                    }
                };

                let col_index = headers.iter().position(|&h| h == col_name);
                let col_idx = match col_index {
                    Some(i) => i,
                    None => {
                        return ToolCallResult {
                            call_id: String::new(),
                            name: self.name().to_string(),
                            output: format!("错误: 未找到列 '{}'", col_name),
                            success: false,
                            metadata: None,
                            duration_ms: 0,
                            truncated: false,
                        };
                    }
                };

                let mut counts: HashMap<String, usize> = HashMap::new();
                for line in lines.iter().skip(1) {
                    let cols: Vec<&str> = line.split(',').collect();
                    if let Some(val) = cols.get(col_idx) {
                        *counts.entry(val.trim().to_string()).or_insert(0) += 1;
                    }
                }

                let mut sorted: Vec<_> = counts.into_iter().collect();
                sorted.sort_by(|a, b| b.1.cmp(&a.1));

                let output = format!(
                    "按 '{}' 分组统计 (共{}个不同值):\n\n{}",
                    col_name,
                    sorted.len(),
                    sorted
                        .iter()
                        .take(limit)
                        .map(|(k, v)| format!("  {}: {}", k, v))
                        .collect::<Vec<_>>()
                        .join("\n")
                );

                ToolCallResult {
                    call_id: String::new(),
                    name: self.name().to_string(),
                    output,
                    success: true,
                    metadata: Some(serde_json::json!({
                        "unique_values": sorted.len()
                    })),
                    duration_ms: 0,
                    truncated: false,
                }
            }
            "filter" => {
                let col_name = match column {
                    Some(c) => c,
                    None => {
                        return ToolCallResult {
                            call_id: String::new(),
                            name: self.name().to_string(),
                            output: "错误: filter操作需要指定column参数".to_string(),
                            success: false,
                            metadata: None,
                            duration_ms: 0,
                            truncated: false,
                        };
                    }
                };

                let filter_val = match filter_value {
                    Some(v) => v,
                    None => {
                        return ToolCallResult {
                            call_id: String::new(),
                            name: self.name().to_string(),
                            output: "错误: filter操作需要指定filter_value参数".to_string(),
                            success: false,
                            metadata: None,
                            duration_ms: 0,
                            truncated: false,
                        };
                    }
                };

                let col_index = headers.iter().position(|&h| h == col_name);
                let col_idx = match col_index {
                    Some(i) => i,
                    None => {
                        return ToolCallResult {
                            call_id: String::new(),
                            name: self.name().to_string(),
                            output: format!("错误: 未找到列 '{}'", col_name),
                            success: false,
                            metadata: None,
                            duration_ms: 0,
                            truncated: false,
                        };
                    }
                };

                let filtered: Vec<&str> = lines
                    .iter()
                    .skip(1)
                    .filter(|line| {
                        let cols: Vec<&str> = line.split(',').collect();
                        cols.get(col_idx)
                            .map(|v| v.trim().to_lowercase().contains(&filter_val.to_lowercase()))
                            .unwrap_or(false)
                    })
                    .take(limit)
                    .copied()
                    .collect();

                let output = format!(
                    "筛选结果 ({}='{}', 显示前{}条):\n\n{}\n{}",
                    col_name,
                    filter_val,
                    limit,
                    lines[0],
                    filtered.join("\n")
                );

                ToolCallResult {
                    call_id: String::new(),
                    name: self.name().to_string(),
                    output,
                    success: true,
                    metadata: Some(serde_json::json!({
                        "filtered_count": filtered.len()
                    })),
                    duration_ms: 0,
                    truncated: false,
                }
            }
            _ => ToolCallResult {
                call_id: String::new(),
                name: self.name().to_string(),
                output: format!("未知操作: {}", operation),
                success: false,
                metadata: None,
                duration_ms: 0,
                truncated: false,
            },
        }
    }
}
