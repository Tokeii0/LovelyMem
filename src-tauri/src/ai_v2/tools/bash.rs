//! Bash/Shell 命令执行工具

use super::Tool;
use crate::ai_v2::types::{ToolCallResult, ToolContext, ValidationResult};
use async_trait::async_trait;
use std::process::Stdio;
use tokio::process::Command;
use tokio::time::{Duration, timeout};

/// Bash 命令执行工具
pub struct BashTool;

#[async_trait]
impl Tool for BashTool {
    fn id(&self) -> &str {
        "bash"
    }

    fn name(&self) -> &str {
        "bash"
    }

    fn description(&self) -> &str {
        "执行shell命令。可以运行系统命令、脚本等。支持设置工作目录和超时时间。危险操作需谨慎。"
    }

    fn validate_input(&self, args: &serde_json::Value) -> ValidationResult {
        if args["command"].as_str().unwrap_or("").is_empty() {
            return ValidationResult::Invalid {
                message: "命令不能为空".to_string(),
            };
        }
        ValidationResult::Valid
    }

    fn activity_description(&self, args: &serde_json::Value) -> String {
        let desc = args["description"].as_str().unwrap_or("执行命令");
        desc.to_string()
    }

    fn parameters(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "要执行的命令"
                },
                "workdir": {
                    "type": "string",
                    "description": "工作目录"
                },
                "timeout_ms": {
                    "type": "integer",
                    "description": "超时时间（毫秒），默认120000"
                },
                "description": {
                    "type": "string",
                    "description": "命令描述（5-10个字）"
                }
            },
            "required": ["command", "description"]
        })
    }

    async fn execute(&self, args: serde_json::Value, ctx: &ToolContext) -> ToolCallResult {
        let command = args["command"].as_str().unwrap_or("");
        let workdir = args["workdir"].as_str().unwrap_or(&ctx.working_directory);
        let timeout_ms = args["timeout_ms"].as_u64().unwrap_or(120000);
        let description = args["description"].as_str().unwrap_or("执行命令");

        // 检查危险命令
        if is_dangerous_command(command) {
            return ToolCallResult {
                call_id: String::new(),
                name: self.name().to_string(),
                output: format!(
                    "警告: 检测到潜在危险命令 '{}'. 此操作需要用户确认。",
                    command
                ),
                success: false,
                metadata: Some(serde_json::json!({
                    "requires_confirmation": true,
                    "danger_level": "high"
                })),
                duration_ms: 0,
                truncated: false,
            };
        }

        // 根据操作系统选择shell
        let (shell, shell_arg) = if cfg!(windows) {
            ("powershell", "-Command")
        } else {
            ("sh", "-c")
        };

        // 执行命令
        let result = timeout(Duration::from_millis(timeout_ms), async {
            let output = Command::new(shell)
                .arg(shell_arg)
                .arg(command)
                .current_dir(workdir)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .output()
                .await;
            output
        })
        .await;

        match result {
            Ok(Ok(output)) => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let stderr = String::from_utf8_lossy(&output.stderr);
                let exit_code = output.status.code().unwrap_or(-1);

                let mut result_output = String::new();

                if !stdout.is_empty() {
                    result_output.push_str(&format!("标准输出:\n{}\n", stdout));
                }

                if !stderr.is_empty() {
                    result_output.push_str(&format!("标准错误:\n{}\n", stderr));
                }

                result_output.push_str(&format!("\n退出码: {}", exit_code));

                ToolCallResult {
                    call_id: String::new(),
                    name: self.name().to_string(),
                    output: result_output,
                    success: exit_code == 0,
                    metadata: Some(serde_json::json!({
                        "exit_code": exit_code,
                        "description": description
                    })),
                    duration_ms: 0,
                    truncated: false,
                }
            }
            Ok(Err(e)) => ToolCallResult {
                call_id: String::new(),
                name: self.name().to_string(),
                output: format!("命令执行失败: {}", e),
                success: false,
                metadata: None,
                duration_ms: 0,
                truncated: false,
            },
            Err(_) => ToolCallResult {
                call_id: String::new(),
                name: self.name().to_string(),
                output: format!("命令执行超时（{}ms）", timeout_ms),
                success: false,
                metadata: Some(serde_json::json!({ "timeout": true })),
                duration_ms: 0,
                truncated: false,
            },
        }
    }
}

/// 检查是否是危险命令
fn is_dangerous_command(command: &str) -> bool {
    let dangerous_patterns = [
        "rm -rf",
        "rm -r /",
        "mkfs",
        "dd if=",
        "> /dev/",
        "chmod 777",
        ":(){ :|:& };:", // fork bomb
        "wget -O- | bash",
        "wget -O- | sh",
        "curl | bash",
        "curl | sh",
        "shutdown",
        "reboot",
        "init 0",
        "init 6",
        "format ",
        "del /f /s /q",
        "rd /s /q",
    ];

    let lower_command = command.to_lowercase();
    dangerous_patterns.iter().any(|p| lower_command.contains(p))
}
