//! 差量编辑文件工具
//! 参考 Claude Code 的 Edit tool，支持 old_text → new_text 替换模式

use super::Tool;
use crate::ai_v2::types::{ToolCallResult, ToolContext, ValidationResult};
use async_trait::async_trait;
use std::path::Path;
use tokio::fs;

/// 差量编辑文件工具
pub struct EditFileTool;

#[async_trait]
impl Tool for EditFileTool {
    fn id(&self) -> &str {
        "edit_file"
    }

    fn name(&self) -> &str {
        "edit_file"
    }

    fn description(&self) -> &str {
        "对文件进行差量编辑。指定需要替换的旧内容和新内容，只修改匹配的部分而非重写整个文件。\
         适合小范围代码修改，节省 Token 开销。旧内容必须精确匹配文件中的唯一片段。"
    }

    fn validate_input(&self, args: &serde_json::Value) -> ValidationResult {
        if args["filename"].as_str().unwrap_or("").is_empty() {
            return ValidationResult::Invalid {
                message: "未指定文件名".to_string(),
            };
        }
        if args["old_text"].as_str().unwrap_or("").is_empty() {
            return ValidationResult::Invalid {
                message: "未指定要替换的旧文本 (old_text)".to_string(),
            };
        }
        // new_text 可以为空（表示删除）
        if args["new_text"].is_null() {
            return ValidationResult::Invalid {
                message: "未指定替换后的新文本 (new_text)".to_string(),
            };
        }
        ValidationResult::Valid
    }

    fn activity_description(&self, args: &serde_json::Value) -> String {
        let filename = args["filename"].as_str().unwrap_or("文件");
        format!("正在编辑 {}", filename)
    }

    fn parameters(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "filename": {
                    "type": "string",
                    "description": "要编辑的文件名或路径"
                },
                "old_text": {
                    "type": "string",
                    "description": "要替换的原始文本片段。必须精确匹配文件中的内容（包括空白和缩进）。建议包含足够的上下文行以确保唯一匹配。"
                },
                "new_text": {
                    "type": "string",
                    "description": "替换后的新文本。如果为空字符串则表示删除匹配的内容。"
                }
            },
            "required": ["filename", "old_text", "new_text"]
        })
    }

    async fn execute(&self, args: serde_json::Value, ctx: &ToolContext) -> ToolCallResult {
        let filename = args["filename"].as_str().unwrap_or("");
        let old_text = args["old_text"].as_str().unwrap_or("");
        let new_text = args["new_text"].as_str().unwrap_or("");

        if filename.is_empty() || old_text.is_empty() {
            return ToolCallResult::error(self.name(), "文件名和旧文本不能为空".to_string());
        }

        // 构建文件路径
        let file_path = if Path::new(filename).is_absolute() {
            filename.to_string()
        } else {
            format!("{}/{}", ctx.output_path, filename)
        };

        // 读取文件内容
        let content = match fs::read_to_string(&file_path).await {
            Ok(c) => c,
            Err(e) => return ToolCallResult::error(self.name(), format!("读取文件失败: {}", e)),
        };

        // 查找匹配次数
        let match_count = content.matches(old_text).count();

        if match_count == 0 {
            // 尝试规范化换行符匹配
            let normalized_content = content.replace("\r\n", "\n");
            let normalized_old = old_text.replace("\r\n", "\n");
            let norm_count = normalized_content.matches(&normalized_old).count();

            if norm_count == 0 {
                return ToolCallResult::error(
                    self.name(),
                    format!(
                        "在文件 '{}' 中未找到匹配的文本。请确认 old_text 精确匹配文件内容（包括空白和缩进）。\n\n提示：可以先使用 read_file 查看文件内容，再确定要替换的文本。",
                        filename
                    ),
                );
            }

            if norm_count > 1 {
                return ToolCallResult::error(
                    self.name(),
                    format!(
                        "在文件 '{}' 中找到 {} 处匹配。old_text 必须唯一匹配文件中的一个位置。请添加更多上下文行以缩小范围。",
                        filename, norm_count
                    ),
                );
            }

            // 规范化后唯一匹配，执行替换
            let new_content =
                normalized_content.replacen(&normalized_old, &new_text.replace("\r\n", "\n"), 1);
            return self
                .write_and_report(&file_path, filename, &new_content, old_text, new_text)
                .await;
        }

        if match_count > 1 {
            return ToolCallResult::error(
                self.name(),
                format!(
                    "在文件 '{}' 中找到 {} 处匹配。old_text 必须唯一匹配文件中的一个位置。请添加更多上下文行以缩小范围。",
                    filename, match_count
                ),
            );
        }

        // 唯一匹配，执行替换
        let new_content = content.replacen(old_text, new_text, 1);
        self.write_and_report(&file_path, filename, &new_content, old_text, new_text)
            .await
    }
}

impl EditFileTool {
    async fn write_and_report(
        &self,
        file_path: &str,
        filename: &str,
        new_content: &str,
        old_text: &str,
        new_text: &str,
    ) -> ToolCallResult {
        match fs::write(file_path, new_content).await {
            Ok(_) => {
                let old_lines = old_text.lines().count();
                let new_lines = new_text.lines().count();
                let diff = new_lines as i64 - old_lines as i64;
                let diff_str = if diff > 0 {
                    format!("+{} 行", diff)
                } else if diff < 0 {
                    format!("{} 行", diff)
                } else {
                    "行数不变".to_string()
                };

                ToolCallResult::success(
                    self.name(),
                    format!(
                        "成功编辑文件: {} (替换 {} 行 → {} 行, {})",
                        filename, old_lines, new_lines, diff_str
                    ),
                )
            }
            Err(e) => ToolCallResult::error(self.name(), format!("写入文件失败: {}", e)),
        }
    }
}
