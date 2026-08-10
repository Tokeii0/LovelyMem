//! 代码编写和执行工具
//!
//! 提供 Python 代码的编写、修改和执行功能
//! - write_code: 编写/修改 Python 脚本
//! - execute_code: 执行 Python 脚本（需用户确认）

use super::Tool;
use crate::ai_v2::types::{ToolCallResult, ToolContext};
use async_trait::async_trait;
use std::path::Path;
use std::process::Stdio;
use tokio::fs;
use tokio::process::Command;
use tokio::time::{Duration, timeout};

/// 代码编写工具 - 创建或修改 Python 脚本
pub struct WriteCodeTool;

#[async_trait]
impl Tool for WriteCodeTool {
    fn id(&self) -> &str {
        "write_code"
    }

    fn name(&self) -> &str {
        "write_code"
    }

    fn description(&self) -> &str {
        r#"创建或修改 Python 脚本文件。用于编写自动化分析脚本。
- 文件将保存在工作目录的 scripts 子目录下
- 支持创建新文件或覆盖已有文件
- 代码应包含完整的 import 语句和注释
- 建议在脚本开头添加 # -*- coding: utf-8 -*- 声明"#
    }

    fn parameters(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "filename": {
                    "type": "string",
                    "description": "脚本文件名（如 analyze_process.py）"
                },
                "code": {
                    "type": "string",
                    "description": "Python 代码内容"
                },
                "description": {
                    "type": "string",
                    "description": "脚本功能描述"
                }
            },
            "required": ["filename", "code", "description"]
        })
    }

    async fn execute(&self, args: serde_json::Value, ctx: &ToolContext) -> ToolCallResult {
        let filename = args["filename"].as_str().unwrap_or("script.py");
        let code = args["code"].as_str().unwrap_or("");
        let description = args["description"].as_str().unwrap_or("Python 脚本");

        if code.is_empty() {
            return ToolCallResult {
                call_id: String::new(),
                name: self.name().to_string(),
                output: "错误: 代码内容不能为空".to_string(),
                success: false,
                metadata: None,
                duration_ms: 0,
                truncated: false,
            };
        }

        // 验证文件名
        if !filename.ends_with(".py") {
            return ToolCallResult {
                call_id: String::new(),
                name: self.name().to_string(),
                output: "错误: 文件名必须以 .py 结尾".to_string(),
                success: false,
                metadata: None,
                duration_ms: 0,
                truncated: false,
            };
        }

        // 安全检查：防止路径遍历
        if filename.contains("..") || filename.contains("/") || filename.contains("\\") {
            return ToolCallResult {
                call_id: String::new(),
                name: self.name().to_string(),
                output: "错误: 文件名不能包含路径分隔符".to_string(),
                success: false,
                metadata: None,
                duration_ms: 0,
                truncated: false,
            };
        }

        // 创建 scripts 目录
        let scripts_dir = Path::new(&ctx.output_path).join("scripts");
        if let Err(e) = fs::create_dir_all(&scripts_dir).await {
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

        let file_path = scripts_dir.join(filename);
        let file_exists = file_path.exists();

        // 写入文件
        match fs::write(&file_path, code).await {
            Ok(_) => {
                let action = if file_exists {
                    "已更新"
                } else {
                    "已创建"
                };
                let output = format!(
                    "脚本{}: {}\n路径: {}\n描述: {}\n\n代码行数: {}\n\n可以使用 execute_code 工具执行此脚本。",
                    action,
                    filename,
                    file_path.display(),
                    description,
                    code.lines().count()
                );

                ToolCallResult {
                    call_id: String::new(),
                    name: self.name().to_string(),
                    output,
                    success: true,
                    metadata: Some(serde_json::json!({
                        "filepath": file_path.to_string_lossy(),
                        "filename": filename,
                        "description": description,
                        "action": action,
                        "lines": code.lines().count()
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

/// 代码执行工具 - 执行 Python 脚本
pub struct ExecuteCodeTool {
    pub python_path: String,
}

impl ExecuteCodeTool {
    pub fn new(python_path: String) -> Self {
        Self { python_path }
    }
}

#[async_trait]
impl Tool for ExecuteCodeTool {
    fn id(&self) -> &str {
        "execute_code"
    }

    fn name(&self) -> &str {
        "execute_code"
    }

    fn description(&self) -> &str {
        r#"执行 Python 脚本。
⚠️ 此操作需要用户确认才能执行。
- 只能执行 scripts 目录下的 .py 文件
- 支持传递命令行参数
- 执行超时默认为 5 分钟"#
    }

    fn parameters(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "filename": {
                    "type": "string",
                    "description": "要执行的脚本文件名（如 analyze_process.py）"
                },
                "args": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "传递给脚本的命令行参数（可选）"
                },
                "timeout_ms": {
                    "type": "integer",
                    "description": "执行超时（毫秒），默认 300000（5分钟）"
                },
                "confirmed": {
                    "type": "boolean",
                    "description": "用户是否已确认执行（由系统设置）"
                }
            },
            "required": ["filename"]
        })
    }

    async fn execute(&self, args: serde_json::Value, ctx: &ToolContext) -> ToolCallResult {
        let filename = args["filename"].as_str().unwrap_or("");
        let script_args: Vec<String> = args["args"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default();
        let timeout_ms = args["timeout_ms"].as_u64().unwrap_or(300000);
        let confirmed = args["confirmed"].as_bool().unwrap_or(false);

        // 验证文件名
        if filename.is_empty() || !filename.ends_with(".py") {
            return ToolCallResult {
                call_id: String::new(),
                name: self.name().to_string(),
                output: "错误: 请指定有效的 .py 文件名".to_string(),
                success: false,
                metadata: None,
                duration_ms: 0,
                truncated: false,
            };
        }

        // 安全检查
        if filename.contains("..") || filename.contains("/") || filename.contains("\\") {
            return ToolCallResult {
                call_id: String::new(),
                name: self.name().to_string(),
                output: "错误: 文件名不能包含路径分隔符".to_string(),
                success: false,
                metadata: None,
                duration_ms: 0,
                truncated: false,
            };
        }

        let scripts_dir = Path::new(&ctx.output_path).join("scripts");
        let file_path = scripts_dir.join(filename);

        // 检查文件是否存在
        if !file_path.exists() {
            return ToolCallResult {
                call_id: String::new(),
                name: self.name().to_string(),
                output: format!("错误: 脚本文件不存在: {}", file_path.display()),
                success: false,
                metadata: None,
                duration_ms: 0,
                truncated: false,
            };
        }

        // 如果未确认，返回需要确认的响应
        if !confirmed {
            // 读取脚本内容预览
            let preview = match fs::read_to_string(&file_path).await {
                Ok(content) => {
                    let lines: Vec<&str> = content.lines().take(20).collect();
                    if content.lines().count() > 20 {
                        format!(
                            "{}\n... (共 {} 行)",
                            lines.join("\n"),
                            content.lines().count()
                        )
                    } else {
                        content
                    }
                }
                Err(_) => "无法读取脚本内容".to_string(),
            };

            return ToolCallResult {
                call_id: String::new(),
                name: self.name().to_string(),
                output: format!(
                    "⚠️ 需要用户确认执行脚本\n\n文件: {}\n参数: {:?}\n\n脚本预览:\n```python\n{}\n```\n\n请点击确认按钮以执行此脚本。",
                    filename, script_args, preview
                ),
                success: false,
                metadata: Some(serde_json::json!({
                    "requires_confirmation": true,
                    "confirmation_type": "execute_code",
                    "filename": filename,
                    "filepath": file_path.to_string_lossy(),
                    "args": script_args,
                    "timeout_ms": timeout_ms
                })),
                duration_ms: 0,
                truncated: false,
            };
        }

        // 执行脚本
        let python_path = if self.python_path.is_empty() {
            "python".to_string()
        } else {
            self.python_path.clone()
        };

        let result = timeout(Duration::from_millis(timeout_ms), async {
            let mut cmd = Command::new(&python_path);
            cmd.arg(&file_path)
                .args(&script_args)
                .current_dir(&ctx.output_path)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .env("PYTHONIOENCODING", "utf-8");

            cmd.output().await
        })
        .await;

        match result {
            Ok(Ok(output)) => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let stderr = String::from_utf8_lossy(&output.stderr);
                let exit_code = output.status.code().unwrap_or(-1);
                let is_success = exit_code == 0;

                let mut result_output = if is_success {
                    format!("✅ 执行脚本成功: {}\n", filename)
                } else {
                    format!("❌ 执行脚本失败: {} (退出码: {})\n", filename, exit_code)
                };

                if !stdout.is_empty() {
                    result_output
                        .push_str(&format!("\n📤 标准输出:\n```\n{}\n```\n", stdout.trim()));
                }

                if !stderr.is_empty() {
                    result_output
                        .push_str(&format!("\n⚠️ 标准错误:\n```\n{}\n```\n", stderr.trim()));
                }

                // 如果没有任何输出
                if stdout.is_empty() && stderr.is_empty() {
                    result_output.push_str("\n(脚本执行完成，无输出)");
                }

                // 截断过长的输出
                let max_output_len = 15000;
                if result_output.len() > max_output_len {
                    result_output = format!(
                        "{}...\n\n(输出已截断，原始长度: {} 字符)",
                        &result_output[..max_output_len],
                        result_output.len()
                    );
                }

                ToolCallResult {
                    call_id: String::new(),
                    name: self.name().to_string(),
                    output: result_output,
                    success: is_success,
                    metadata: Some(serde_json::json!({
                        "exit_code": exit_code,
                        "filename": filename,
                        "executed": true,
                        "has_error": !is_success
                    })),
                    duration_ms: 0,
                    truncated: false,
                }
            }
            Ok(Err(e)) => ToolCallResult {
                call_id: String::new(),
                name: self.name().to_string(),
                output: format!(
                    "❌ 执行失败: {}\n\nPython 路径: {}\n\n请检查 Python 是否正确安装并配置。",
                    e, python_path
                ),
                success: false,
                metadata: Some(serde_json::json!({
                    "error": e.to_string(),
                    "python_path": python_path
                })),
                duration_ms: 0,
                truncated: false,
            },
            Err(_) => ToolCallResult {
                call_id: String::new(),
                name: self.name().to_string(),
                output: format!(
                    "⏱️ 脚本执行超时（{}ms）\n\n脚本运行时间过长，已被终止。可以尝试增加 timeout_ms 参数。",
                    timeout_ms
                ),
                success: false,
                metadata: Some(serde_json::json!({ "timeout": true, "timeout_ms": timeout_ms })),
                duration_ms: 0,
                truncated: false,
            },
        }
    }
}

/// 读取脚本工具 - 读取已有的 Python 脚本内容
pub struct ReadCodeTool;

#[async_trait]
impl Tool for ReadCodeTool {
    fn id(&self) -> &str {
        "read_code"
    }

    fn name(&self) -> &str {
        "read_code"
    }

    fn description(&self) -> &str {
        "读取 scripts 目录下的 Python 脚本内容，用于查看或修改已有脚本。"
    }

    fn parameters(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "filename": {
                    "type": "string",
                    "description": "要读取的脚本文件名（如 analyze_process.py）"
                }
            },
            "required": ["filename"]
        })
    }

    async fn execute(&self, args: serde_json::Value, ctx: &ToolContext) -> ToolCallResult {
        let filename = args["filename"].as_str().unwrap_or("");

        if filename.is_empty() || !filename.ends_with(".py") {
            return ToolCallResult {
                call_id: String::new(),
                name: self.name().to_string(),
                output: "错误: 请指定有效的 .py 文件名".to_string(),
                success: false,
                metadata: None,
                duration_ms: 0,
                truncated: false,
            };
        }

        // 安全检查
        if filename.contains("..") || filename.contains("/") || filename.contains("\\") {
            return ToolCallResult {
                call_id: String::new(),
                name: self.name().to_string(),
                output: "错误: 文件名不能包含路径分隔符".to_string(),
                success: false,
                metadata: None,
                duration_ms: 0,
                truncated: false,
            };
        }

        let scripts_dir = Path::new(&ctx.output_path).join("scripts");
        let file_path = scripts_dir.join(filename);

        if !file_path.exists() {
            return ToolCallResult {
                call_id: String::new(),
                name: self.name().to_string(),
                output: format!("错误: 脚本文件不存在: {}", filename),
                success: false,
                metadata: None,
                duration_ms: 0,
                truncated: false,
            };
        }

        match fs::read_to_string(&file_path).await {
            Ok(content) => ToolCallResult {
                call_id: String::new(),
                name: self.name().to_string(),
                output: format!(
                    "文件: {}\n路径: {}\n行数: {}\n\n```python\n{}\n```",
                    filename,
                    file_path.display(),
                    content.lines().count(),
                    content
                ),
                success: true,
                metadata: Some(serde_json::json!({
                    "filepath": file_path.to_string_lossy(),
                    "filename": filename,
                    "lines": content.lines().count()
                })),
                duration_ms: 0,
                truncated: false,
            },
            Err(e) => ToolCallResult {
                call_id: String::new(),
                name: self.name().to_string(),
                output: format!("读取文件失败: {}", e),
                success: false,
                metadata: None,
                duration_ms: 0,
                truncated: false,
            },
        }
    }
}

/// 列出脚本工具 - 列出所有已创建的 Python 脚本
pub struct ListCodeTool;

#[async_trait]
impl Tool for ListCodeTool {
    fn id(&self) -> &str {
        "list_code"
    }

    fn name(&self) -> &str {
        "list_code"
    }

    fn description(&self) -> &str {
        "列出 scripts 目录下所有 Python 脚本文件。"
    }

    fn parameters(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {}
        })
    }

    async fn execute(&self, _args: serde_json::Value, ctx: &ToolContext) -> ToolCallResult {
        let scripts_dir = Path::new(&ctx.output_path).join("scripts");

        if !scripts_dir.exists() {
            return ToolCallResult {
                call_id: String::new(),
                name: self.name().to_string(),
                output: "scripts 目录不存在，尚未创建任何脚本。".to_string(),
                success: true,
                metadata: Some(serde_json::json!({ "scripts": [] })),
                duration_ms: 0,
                truncated: false,
            };
        }

        let mut scripts = Vec::new();

        match fs::read_dir(&scripts_dir).await {
            Ok(mut entries) => {
                while let Ok(Some(entry)) = entries.next_entry().await {
                    let path = entry.path();
                    if path.extension().map(|e| e == "py").unwrap_or(false) {
                        if let Some(name) = path.file_name() {
                            let name_str = name.to_string_lossy().to_string();
                            let size = entry.metadata().await.map(|m| m.len()).unwrap_or(0);
                            scripts.push(serde_json::json!({
                                "name": name_str,
                                "size": size
                            }));
                        }
                    }
                }
            }
            Err(e) => {
                return ToolCallResult {
                    call_id: String::new(),
                    name: self.name().to_string(),
                    output: format!("读取目录失败: {}", e),
                    success: false,
                    metadata: None,
                    duration_ms: 0,
                    truncated: false,
                };
            }
        }

        if scripts.is_empty() {
            return ToolCallResult {
                call_id: String::new(),
                name: self.name().to_string(),
                output: "scripts 目录为空，尚未创建任何脚本。".to_string(),
                success: true,
                metadata: Some(serde_json::json!({ "scripts": [] })),
                duration_ms: 0,
                truncated: false,
            };
        }

        let output = format!(
            "scripts 目录下共有 {} 个脚本:\n\n{}",
            scripts.len(),
            scripts
                .iter()
                .map(|s| format!(
                    "- {} ({} 字节)",
                    s["name"].as_str().unwrap_or(""),
                    s["size"].as_u64().unwrap_or(0)
                ))
                .collect::<Vec<_>>()
                .join("\n")
        );

        ToolCallResult {
            call_id: String::new(),
            name: self.name().to_string(),
            output,
            success: true,
            metadata: Some(serde_json::json!({ "scripts": scripts })),
            duration_ms: 0,
            truncated: false,
        }
    }
}

/// Markdown 文档编写工具 - 创建或修改 Markdown 文档（用于 WriteUp）
pub struct WriteMarkdownTool {
    pub markdown_path: String,
}

impl WriteMarkdownTool {
    pub fn new(markdown_path: String) -> Self {
        Self { markdown_path }
    }
}

#[async_trait]
impl Tool for WriteMarkdownTool {
    fn id(&self) -> &str {
        "write_markdown"
    }

    fn name(&self) -> &str {
        "write_markdown"
    }

    fn description(&self) -> &str {
        r#"创建或修改 Markdown 文档，用于编写分析报告或 WriteUp。
- 文件将保存在配置的 markdown 目录下
- 支持创建新文档或追加/覆盖已有文档
- 使用标准 Markdown 语法"#
    }

    fn parameters(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "filename": {
                    "type": "string",
                    "description": "文档文件名（如 writeup.md、分析报告.md）"
                },
                "content": {
                    "type": "string",
                    "description": "Markdown 文档内容"
                },
                "mode": {
                    "type": "string",
                    "enum": ["overwrite", "append"],
                    "description": "写入模式: overwrite(覆盖) 或 append(追加)，默认 overwrite"
                },
                "title": {
                    "type": "string",
                    "description": "文档标题（可选，会自动添加为一级标题）"
                }
            },
            "required": ["filename", "content"]
        })
    }

    async fn execute(&self, args: serde_json::Value, _ctx: &ToolContext) -> ToolCallResult {
        let filename = args["filename"].as_str().unwrap_or("document.md");
        let content = args["content"].as_str().unwrap_or("");
        let mode = args["mode"].as_str().unwrap_or("overwrite");
        let title = args["title"].as_str();

        if content.is_empty() {
            return ToolCallResult {
                call_id: String::new(),
                name: self.name().to_string(),
                output: "错误: 文档内容不能为空".to_string(),
                success: false,
                metadata: None,
                duration_ms: 0,
                truncated: false,
            };
        }

        // 确保文件名以 .md 结尾
        let filename = if filename.ends_with(".md") {
            filename.to_string()
        } else {
            format!("{}.md", filename)
        };

        // 安全检查：防止路径遍历
        if filename.contains("..") || filename.contains("/") || filename.contains("\\") {
            return ToolCallResult {
                call_id: String::new(),
                name: self.name().to_string(),
                output: "错误: 文件名不能包含路径分隔符".to_string(),
                success: false,
                metadata: None,
                duration_ms: 0,
                truncated: false,
            };
        }

        // 创建 markdown 目录
        let markdown_dir = Path::new(&self.markdown_path);
        if let Err(e) = fs::create_dir_all(&markdown_dir).await {
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

        let file_path = markdown_dir.join(&filename);
        let file_exists = file_path.exists();

        // 构建最终内容
        let final_content = if let Some(doc_title) = title {
            format!("# {}\n\n{}", doc_title, content)
        } else {
            content.to_string()
        };

        // 根据模式写入文件
        let write_result = if mode == "append" && file_exists {
            // 追加模式：读取现有内容并追加
            match fs::read_to_string(&file_path).await {
                Ok(existing) => {
                    let new_content = format!("{}\n\n{}", existing.trim(), final_content);
                    fs::write(&file_path, new_content).await
                }
                Err(e) => Err(e),
            }
        } else {
            // 覆盖模式
            fs::write(&file_path, &final_content).await
        };

        match write_result {
            Ok(_) => {
                let action = if mode == "append" && file_exists {
                    "已追加内容到"
                } else if file_exists {
                    "已更新"
                } else {
                    "已创建"
                };

                let output = format!(
                    "📄 文档{}: {}\n路径: {}\n字数: {} 字\n行数: {} 行",
                    action,
                    filename,
                    file_path.display(),
                    final_content.chars().count(),
                    final_content.lines().count()
                );

                ToolCallResult {
                    call_id: String::new(),
                    name: self.name().to_string(),
                    output,
                    success: true,
                    metadata: Some(serde_json::json!({
                        "filepath": file_path.to_string_lossy(),
                        "filename": filename,
                        "action": action,
                        "mode": mode,
                        "chars": final_content.chars().count(),
                        "lines": final_content.lines().count()
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

/// 读取 Markdown 文档工具
pub struct ReadMarkdownTool {
    pub markdown_path: String,
}

impl ReadMarkdownTool {
    pub fn new(markdown_path: String) -> Self {
        Self { markdown_path }
    }
}

#[async_trait]
impl Tool for ReadMarkdownTool {
    fn id(&self) -> &str {
        "read_markdown"
    }

    fn name(&self) -> &str {
        "read_markdown"
    }

    fn description(&self) -> &str {
        "读取 markdown 目录下的 Markdown 文档内容。"
    }

    fn parameters(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "filename": {
                    "type": "string",
                    "description": "要读取的文档文件名"
                }
            },
            "required": ["filename"]
        })
    }

    async fn execute(&self, args: serde_json::Value, _ctx: &ToolContext) -> ToolCallResult {
        let filename = args["filename"].as_str().unwrap_or("");

        if filename.is_empty() {
            return ToolCallResult {
                call_id: String::new(),
                name: self.name().to_string(),
                output: "错误: 请指定文件名".to_string(),
                success: false,
                metadata: None,
                duration_ms: 0,
                truncated: false,
            };
        }

        // 安全检查
        if filename.contains("..") || filename.contains("/") || filename.contains("\\") {
            return ToolCallResult {
                call_id: String::new(),
                name: self.name().to_string(),
                output: "错误: 文件名不能包含路径分隔符".to_string(),
                success: false,
                metadata: None,
                duration_ms: 0,
                truncated: false,
            };
        }

        let file_path = Path::new(&self.markdown_path).join(filename);

        if !file_path.exists() {
            return ToolCallResult {
                call_id: String::new(),
                name: self.name().to_string(),
                output: format!("错误: 文档不存在: {}", filename),
                success: false,
                metadata: None,
                duration_ms: 0,
                truncated: false,
            };
        }

        match fs::read_to_string(&file_path).await {
            Ok(content) => ToolCallResult {
                call_id: String::new(),
                name: self.name().to_string(),
                output: format!(
                    "文件: {}\n路径: {}\n字数: {} 字\n行数: {} 行\n\n---\n\n{}",
                    filename,
                    file_path.display(),
                    content.chars().count(),
                    content.lines().count(),
                    content
                ),
                success: true,
                metadata: Some(serde_json::json!({
                    "filepath": file_path.to_string_lossy(),
                    "filename": filename,
                    "chars": content.chars().count(),
                    "lines": content.lines().count()
                })),
                duration_ms: 0,
                truncated: false,
            },
            Err(e) => ToolCallResult {
                call_id: String::new(),
                name: self.name().to_string(),
                output: format!("读取文件失败: {}", e),
                success: false,
                metadata: None,
                duration_ms: 0,
                truncated: false,
            },
        }
    }
}

/// 列出 Markdown 文档工具
pub struct ListMarkdownTool {
    pub markdown_path: String,
}

impl ListMarkdownTool {
    pub fn new(markdown_path: String) -> Self {
        Self { markdown_path }
    }
}

#[async_trait]
impl Tool for ListMarkdownTool {
    fn id(&self) -> &str {
        "list_markdown"
    }

    fn name(&self) -> &str {
        "list_markdown"
    }

    fn description(&self) -> &str {
        "列出 markdown 目录下所有 Markdown 文档文件。"
    }

    fn parameters(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {}
        })
    }

    async fn execute(&self, _args: serde_json::Value, _ctx: &ToolContext) -> ToolCallResult {
        let markdown_dir = Path::new(&self.markdown_path);

        if !markdown_dir.exists() {
            return ToolCallResult {
                call_id: String::new(),
                name: self.name().to_string(),
                output: "markdown 目录不存在，尚未创建任何文档。".to_string(),
                success: true,
                metadata: Some(serde_json::json!({ "documents": [] })),
                duration_ms: 0,
                truncated: false,
            };
        }

        let mut documents = Vec::new();

        match fs::read_dir(&markdown_dir).await {
            Ok(mut entries) => {
                while let Ok(Some(entry)) = entries.next_entry().await {
                    let path = entry.path();
                    if path.extension().map(|e| e == "md").unwrap_or(false) {
                        if let Some(name) = path.file_name() {
                            let name_str = name.to_string_lossy().to_string();
                            let size = entry.metadata().await.map(|m| m.len()).unwrap_or(0);
                            documents.push(serde_json::json!({
                                "name": name_str,
                                "size": size
                            }));
                        }
                    }
                }
            }
            Err(e) => {
                return ToolCallResult {
                    call_id: String::new(),
                    name: self.name().to_string(),
                    output: format!("读取目录失败: {}", e),
                    success: false,
                    metadata: None,
                    duration_ms: 0,
                    truncated: false,
                };
            }
        }

        if documents.is_empty() {
            return ToolCallResult {
                call_id: String::new(),
                name: self.name().to_string(),
                output: "markdown 目录为空，尚未创建任何文档。".to_string(),
                success: true,
                metadata: Some(serde_json::json!({ "documents": [] })),
                duration_ms: 0,
                truncated: false,
            };
        }

        let output = format!(
            "📁 markdown 目录下共有 {} 个文档:\n\n{}",
            documents.len(),
            documents
                .iter()
                .map(|d| format!(
                    "- {} ({} 字节)",
                    d["name"].as_str().unwrap_or(""),
                    d["size"].as_u64().unwrap_or(0)
                ))
                .collect::<Vec<_>>()
                .join("\n")
        );

        ToolCallResult {
            call_id: String::new(),
            name: self.name().to_string(),
            output,
            success: true,
            metadata: Some(serde_json::json!({ "documents": documents })),
            duration_ms: 0,
            truncated: false,
        }
    }
}
