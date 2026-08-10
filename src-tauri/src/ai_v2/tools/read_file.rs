//! 读取文件工具

use super::Tool;
use crate::ai_v2::types::{ConcurrencySafety, ToolCallResult, ToolContext, ValidationResult};
use async_trait::async_trait;
use std::path::Path;
use tokio::fs;

/// 读取文件工具
pub struct ReadFileTool;

#[async_trait]
impl Tool for ReadFileTool {
    fn id(&self) -> &str {
        "read_file"
    }

    fn name(&self) -> &str {
        "read_file"
    }

    fn description(&self) -> &str {
        "读取指定文件的内容。支持分页读取大文件。可以指定起始行和读取行数。"
    }

    // 只读操作，可以安全并行
    fn concurrency_safety(&self) -> ConcurrencySafety {
        ConcurrencySafety::Safe
    }

    fn is_read_only(&self) -> bool {
        true
    }

    // 读取结果不应被截断（参考 Claude Code: Read tool 的 maxResultSizeChars = Infinity）
    fn max_result_size(&self) -> usize {
        usize::MAX
    }

    fn validate_input(&self, args: &serde_json::Value) -> ValidationResult {
        if args["filename"].as_str().unwrap_or("").is_empty() {
            return ValidationResult::Invalid {
                message: "未指定文件名".to_string(),
            };
        }
        ValidationResult::Valid
    }

    fn activity_description(&self, args: &serde_json::Value) -> String {
        let filename = args["filename"].as_str().unwrap_or("文件");
        format!("正在读取 {}", filename)
    }

    fn parameters(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "filename": {
                    "type": "string",
                    "description": "要读取的文件名或路径"
                },
                "start_line": {
                    "type": "integer",
                    "description": "起始行号（从1开始），用于分页读取大文件"
                },
                "max_lines": {
                    "type": "integer",
                    "description": "最多读取多少行，默认500行"
                }
            },
            "required": ["filename"]
        })
    }

    async fn execute(&self, args: serde_json::Value, ctx: &ToolContext) -> ToolCallResult {
        let filename = args["filename"].as_str().unwrap_or("");
        let start_line = args["start_line"].as_u64().map(|n| n as usize).unwrap_or(1);
        let max_lines = args["max_lines"]
            .as_u64()
            .map(|n| n as usize)
            .unwrap_or(500);

        if filename.is_empty() {
            return ToolCallResult {
                call_id: String::new(),
                name: self.name().to_string(),
                output: "错误: 未指定文件名".to_string(),
                success: false,
                ..Default::default()
            };
        }

        // 构建文件路径
        let file_path = if Path::new(filename).is_absolute() {
            filename.to_string()
        } else {
            format!("{}/{}", ctx.output_path, filename)
        };

        // 读取文件
        match fs::read_to_string(&file_path).await {
            Ok(content) => {
                let lines: Vec<&str> = content.lines().collect();
                let total_lines = lines.len();

                // 计算实际读取范围
                let start_idx = (start_line.saturating_sub(1)).min(total_lines);
                let end_idx = (start_idx + max_lines).min(total_lines);

                // 提取指定范围的行
                let selected_lines: Vec<String> = lines[start_idx..end_idx]
                    .iter()
                    .enumerate()
                    .map(|(i, line)| format!("{:5}| {}", start_idx + i + 1, line))
                    .collect();

                let mut output = format!(
                    "<file path=\"{}\">\n{}\n</file>",
                    filename,
                    selected_lines.join("\n")
                );

                // 添加分页信息
                if end_idx < total_lines {
                    output.push_str(&format!(
                        "\n\n(显示第 {}-{} 行，共 {} 行。使用 start_line={} 继续读取)",
                        start_idx + 1,
                        end_idx,
                        total_lines,
                        end_idx + 1
                    ));
                } else {
                    output.push_str(&format!("\n\n(文件结束，共 {} 行)", total_lines));
                }

                ToolCallResult {
                    call_id: String::new(),
                    name: self.name().to_string(),
                    output,
                    success: true,
                    metadata: Some(serde_json::json!({
                        "total_lines": total_lines,
                        "start_line": start_idx + 1,
                        "end_line": end_idx,
                        "truncated": end_idx < total_lines
                    })),
                    ..Default::default()
                }
            }
            Err(e) => ToolCallResult::error(self.name(), format!("读取文件失败: {}", e)),
        }
    }
}
