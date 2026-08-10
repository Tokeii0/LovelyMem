//! 写入文件工具

use super::Tool;
use crate::ai_v2::types::{ToolCallResult, ToolContext, ValidationResult};
use async_trait::async_trait;
use std::path::Path;
use tokio::fs;

/// 写入文件工具
pub struct WriteFileTool;

#[async_trait]
impl Tool for WriteFileTool {
    fn id(&self) -> &str {
        "write_file"
    }

    fn name(&self) -> &str {
        "write_file"
    }

    fn description(&self) -> &str {
        "创建或覆盖文件内容。可以创建新文件或修改现有文件。"
    }

    fn validate_input(&self, args: &serde_json::Value) -> ValidationResult {
        if args["filename"].as_str().unwrap_or("").is_empty() {
            return ValidationResult::Invalid {
                message: "未指定文件名".to_string(),
            };
        }
        if args["content"].is_null() {
            return ValidationResult::Invalid {
                message: "未指定要写入的内容 (content)".to_string(),
            };
        }
        ValidationResult::Valid
    }

    fn activity_description(&self, args: &serde_json::Value) -> String {
        let filename = args["filename"].as_str().unwrap_or("文件");
        format!("正在写入 {}", filename)
    }

    fn parameters(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "filename": {
                    "type": "string",
                    "description": "文件名或路径"
                },
                "content": {
                    "type": "string",
                    "description": "要写入的内容"
                },
                "append": {
                    "type": "boolean",
                    "description": "是否追加而非覆盖，默认false"
                }
            },
            "required": ["filename", "content"]
        })
    }

    async fn execute(&self, args: serde_json::Value, ctx: &ToolContext) -> ToolCallResult {
        let filename = args["filename"].as_str().unwrap_or("");
        let content = args["content"].as_str().unwrap_or("");
        let append = args["append"].as_bool().unwrap_or(false);

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

        // 确保父目录存在
        if let Some(parent) = Path::new(&file_path).parent() {
            if let Err(e) = fs::create_dir_all(parent).await {
                return ToolCallResult {
                    call_id: String::new(),
                    name: self.name().to_string(),
                    output: format!("创建目录失败: {}", e),
                    success: false,
                    metadata: None,
                    duration_ms: 0,
                    truncated: false,
                };
            }
        }

        let result = if append {
            // 追加模式
            let existing = fs::read_to_string(&file_path).await.unwrap_or_default();
            fs::write(&file_path, format!("{}{}", existing, content)).await
        } else {
            // 覆盖模式
            fs::write(&file_path, content).await
        };

        match result {
            Ok(_) => {
                let mode = if append { "追加到" } else { "写入" };
                ToolCallResult {
                    call_id: String::new(),
                    name: self.name().to_string(),
                    output: format!("成功{}文件: {} ({} 字符)", mode, filename, content.len()),
                    success: true,
                    metadata: Some(serde_json::json!({
                        "bytes_written": content.len(),
                        "append_mode": append
                    })),
                    duration_ms: 0,
                    truncated: false,
                }
            }
            Err(e) => ToolCallResult {
                call_id: String::new(),
                name: self.name().to_string(),
                output: format!("写入文件失败: {}", e),
                success: false,
                metadata: None,
                duration_ms: 0,
                truncated: false,
            },
        }
    }
}
