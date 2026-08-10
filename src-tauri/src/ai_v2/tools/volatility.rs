//! Volatility 取证工具
//! 支持调用 Volatility2 和 Volatility3 进行内存取证分析

use super::Tool;
use crate::ai_v2::types::{ToolCallResult, ToolContext};
use async_trait::async_trait;
use std::process::Command;

/// Volatility 工具配置
#[derive(Debug, Clone)]
pub struct VolatilityConfig {
    pub python2_path: String,
    pub python3_path: String,
    pub volatility2_path: String,
    pub volatility3_path: String,
    pub memory_image_path: String,
    pub profile: String,
}

impl Default for VolatilityConfig {
    fn default() -> Self {
        Self {
            python2_path: String::new(),
            python3_path: String::new(),
            volatility2_path: String::new(),
            volatility3_path: String::new(),
            memory_image_path: String::new(),
            profile: String::new(),
        }
    }
}

/// Volatility2 工具
pub struct Volatility2Tool {
    pub config: VolatilityConfig,
}

impl Volatility2Tool {
    pub fn new(config: VolatilityConfig) -> Self {
        Self { config }
    }
}

#[async_trait]
impl Tool for Volatility2Tool {
    fn id(&self) -> &str {
        "volatility2"
    }

    fn name(&self) -> &str {
        "volatility2"
    }

    fn description(&self) -> &str {
        "使用 Volatility2 执行内存取证分析。支持常用插件如 pslist, pstree, netscan, filescan, hivelist, hashdump 等。"
    }

    fn parameters(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "plugin": {
                    "type": "string",
                    "description": "Volatility2 插件名称，如 pslist, pstree, netscan, filescan, hivelist, handles, dlllist, cmdline, malfind 等"
                },
                "args": {
                    "type": "string",
                    "description": "额外的插件参数（可选）"
                }
            },
            "required": ["plugin"]
        })
    }

    async fn execute(&self, args: serde_json::Value, ctx: &ToolContext) -> ToolCallResult {
        let plugin = args
            .get("plugin")
            .and_then(|v| v.as_str())
            .unwrap_or("pslist");

        let extra_args = args.get("args").and_then(|v| v.as_str()).unwrap_or("");

        // 检查配置
        if self.config.python2_path.is_empty() || self.config.volatility2_path.is_empty() {
            return ToolCallResult {
                call_id: String::new(),
                name: self.name().to_string(),
                output:
                    "错误：Volatility2 未配置。请在设置中配置 python2_path 和 volatility2_path。"
                        .to_string(),
                success: false,
                metadata: None,
                duration_ms: 0,
                truncated: false,
            };
        }

        if self.config.memory_image_path.is_empty() {
            return ToolCallResult {
                call_id: String::new(),
                name: self.name().to_string(),
                output: "错误：内存镜像路径未设置。请先加载内存镜像。".to_string(),
                success: false,
                metadata: None,
                duration_ms: 0,
                truncated: false,
            };
        }

        // 构建命令
        let mut cmd = Command::new(&self.config.python2_path);
        cmd.arg(&self.config.volatility2_path)
            .arg("-f")
            .arg(&self.config.memory_image_path);

        // 添加 profile（如果有）
        if !self.config.profile.is_empty() {
            cmd.arg("--profile").arg(&self.config.profile);
        }

        // 添加插件
        cmd.arg(plugin);

        // 添加额外参数
        if !extra_args.is_empty() {
            for arg in extra_args.split_whitespace() {
                cmd.arg(arg);
            }
        }

        // 设置工作目录
        cmd.current_dir(&ctx.working_directory);

        // 执行命令
        match cmd.output() {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let stderr = String::from_utf8_lossy(&output.stderr);

                if output.status.success() {
                    // 限制输出长度
                    let result = if stdout.len() > 50000 {
                        format!(
                            "{}...\n\n[输出已截断，共 {} 字符]",
                            &stdout[..50000],
                            stdout.len()
                        )
                    } else {
                        stdout.to_string()
                    };

                    ToolCallResult {
                        call_id: String::new(),
                        name: self.name().to_string(),
                        output: format!("Volatility2 {} 执行成功:\n\n{}", plugin, result),
                        success: true,
                        metadata: Some(serde_json::json!({
                            "plugin": plugin,
                            "chars": stdout.len()
                        })),
                        duration_ms: 0,
                        truncated: false,
                    }
                } else {
                    ToolCallResult {
                        call_id: String::new(),
                        name: self.name().to_string(),
                        output: format!("Volatility2 执行失败:\n{}\n{}", stdout, stderr),
                        success: false,
                        metadata: None,
                        duration_ms: 0,
                        truncated: false,
                    }
                }
            }
            Err(e) => ToolCallResult {
                call_id: String::new(),
                name: self.name().to_string(),
                output: format!("执行 Volatility2 失败: {}", e),
                success: false,
                metadata: None,
                duration_ms: 0,
                truncated: false,
            },
        }
    }
}

/// Volatility3 工具
pub struct Volatility3Tool {
    pub config: VolatilityConfig,
}

impl Volatility3Tool {
    pub fn new(config: VolatilityConfig) -> Self {
        Self { config }
    }
}

#[async_trait]
impl Tool for Volatility3Tool {
    fn id(&self) -> &str {
        "volatility3"
    }

    fn name(&self) -> &str {
        "volatility3"
    }

    fn description(&self) -> &str {
        "使用 Volatility3 执行内存取证分析。支持 Windows/Linux/Mac 插件如 windows.pslist, windows.pstree, windows.netscan, windows.filescan 等。"
    }

    fn parameters(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "plugin": {
                    "type": "string",
                    "description": "Volatility3 插件名称，如 windows.pslist, windows.pstree, windows.netscan, windows.filescan, windows.handles, windows.cmdline, windows.malfind 等"
                },
                "args": {
                    "type": "string",
                    "description": "额外的插件参数（可选）"
                }
            },
            "required": ["plugin"]
        })
    }

    async fn execute(&self, args: serde_json::Value, ctx: &ToolContext) -> ToolCallResult {
        let plugin = args
            .get("plugin")
            .and_then(|v| v.as_str())
            .unwrap_or("windows.pslist");

        let extra_args = args.get("args").and_then(|v| v.as_str()).unwrap_or("");

        // 检查配置
        if self.config.python3_path.is_empty() || self.config.volatility3_path.is_empty() {
            return ToolCallResult {
                call_id: String::new(),
                name: self.name().to_string(),
                output:
                    "错误：Volatility3 未配置。请在设置中配置 python3_path 和 volatility3_path。"
                        .to_string(),
                success: false,
                metadata: None,
                duration_ms: 0,
                truncated: false,
            };
        }

        if self.config.memory_image_path.is_empty() {
            return ToolCallResult {
                call_id: String::new(),
                name: self.name().to_string(),
                output: "错误：内存镜像路径未设置。请先加载内存镜像。".to_string(),
                success: false,
                metadata: None,
                duration_ms: 0,
                truncated: false,
            };
        }

        // 构建命令
        let mut cmd = Command::new(&self.config.python3_path);
        cmd.arg(&self.config.volatility3_path)
            .arg("-f")
            .arg(&self.config.memory_image_path)
            .arg(plugin);

        // 添加额外参数
        if !extra_args.is_empty() {
            for arg in extra_args.split_whitespace() {
                cmd.arg(arg);
            }
        }

        // 设置工作目录
        cmd.current_dir(&ctx.working_directory);

        // 执行命令
        match cmd.output() {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let stderr = String::from_utf8_lossy(&output.stderr);

                if output.status.success() {
                    // 限制输出长度
                    let result = if stdout.len() > 50000 {
                        format!(
                            "{}...\n\n[输出已截断，共 {} 字符]",
                            &stdout[..50000],
                            stdout.len()
                        )
                    } else {
                        stdout.to_string()
                    };

                    ToolCallResult {
                        call_id: String::new(),
                        name: self.name().to_string(),
                        output: format!("Volatility3 {} 执行成功:\n\n{}", plugin, result),
                        success: true,
                        metadata: Some(serde_json::json!({
                            "plugin": plugin,
                            "chars": stdout.len()
                        })),
                        duration_ms: 0,
                        truncated: false,
                    }
                } else {
                    ToolCallResult {
                        call_id: String::new(),
                        name: self.name().to_string(),
                        output: format!("Volatility3 执行失败:\n{}\n{}", stdout, stderr),
                        success: false,
                        metadata: None,
                        duration_ms: 0,
                        truncated: false,
                    }
                }
            }
            Err(e) => ToolCallResult {
                call_id: String::new(),
                name: self.name().to_string(),
                output: format!("执行 Volatility3 失败: {}", e),
                success: false,
                metadata: None,
                duration_ms: 0,
                truncated: false,
            },
        }
    }
}
