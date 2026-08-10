use crate::settings::{load_settings, save_settings};
use crate::types::{PythonScript, ScriptExecutionResult, ScriptExecutionStatus};
use chrono::Utc;
use regex::Regex;
use std::collections::HashMap;
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use tokio::process::Command as TokioCommand;
use tokio::time::timeout;

/// 解码脚本输出，处理各种编码问题
fn decode_script_output(bytes: &[u8]) -> String {
    // 首先尝试UTF-8解码
    match std::str::from_utf8(bytes) {
        Ok(s) => s.to_string(),
        Err(_) => {
            // UTF-8解码失败，尝试其他方法
            #[cfg(target_os = "windows")]
            {
                // Windows下尝试GBK编码
                use encoding_rs::GBK;
                let (decoded, _, had_errors) = GBK.decode(bytes);
                if !had_errors {
                    decoded.to_string()
                } else {
                    // 如果GBK也失败，使用lossy转换
                    String::from_utf8_lossy(bytes).to_string()
                }
            }
            #[cfg(not(target_os = "windows"))]
            {
                // 非Windows系统使用lossy转换
                String::from_utf8_lossy(bytes).to_string()
            }
        }
    }
}

/// 脚本管理器
pub struct ScriptManager {
    execution_status: Arc<Mutex<HashMap<String, ScriptExecutionStatus>>>,
}

impl ScriptManager {
    pub fn new() -> Self {
        Self {
            execution_status: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// 获取可用的脚本变量
    pub fn get_available_variables(&self) -> Result<HashMap<String, String>, String> {
        let settings = load_settings()?;
        let mut variables = HashMap::new();

        // 基础路径变量
        variables.insert("output_path".to_string(), settings.output_path.clone());
        variables.insert(
            "current_image_path".to_string(),
            settings.current_image_path.clone(),
        );
        variables.insert("scripts_path".to_string(), settings.scripts_path.clone());
        // 工具路径变量
        variables.insert("python2_path".to_string(), settings.python2_path.clone());
        variables.insert("python3_path".to_string(), settings.python3_path.clone());
        variables.insert(
            "memprocfs_path".to_string(),
            settings.memprocfs_path.clone(),
        );
        variables.insert(
            "volatility2_path".to_string(),
            settings.volatility2_path.clone(),
        );
        variables.insert(
            "volatility3_path".to_string(),
            settings.volatility3_path.clone(),
        );
        variables.insert(
            "volatility2_profile".to_string(),
            settings.volatility2_profile.clone(),
        );

        // 系统变量
        let now = Utc::now();
        variables.insert("timestamp".to_string(), now.timestamp().to_string());
        variables.insert("date".to_string(), now.format("%Y-%m-%d").to_string());
        variables.insert("time".to_string(), now.format("%H:%M:%S").to_string());
        variables.insert(
            "datetime".to_string(),
            now.format("%Y-%m-%d %H:%M:%S").to_string(),
        );

        // 镜像相关变量
        if !settings.current_image_path.is_empty() {
            let image_path = std::path::Path::new(&settings.current_image_path);
            if let Some(image_name) = image_path.file_name() {
                variables.insert(
                    "image_name".to_string(),
                    image_name.to_string_lossy().to_string(),
                );
            }
            if let Some(image_dir) = image_path.parent() {
                variables.insert(
                    "image_directory".to_string(),
                    image_dir.to_string_lossy().to_string(),
                );
            }
            if let Some(image_stem) = image_path.file_stem() {
                variables.insert(
                    "image_name_without_ext".to_string(),
                    image_stem.to_string_lossy().to_string(),
                );
            }
        }

        // 自定义工具变量
        for tool in &settings.custom_tools {
            if tool.enabled {
                let tool_key = format!("tool_{}", tool.id);
                let tool_command = if tool.arguments.is_empty() {
                    tool.command.clone()
                } else {
                    format!("{} {}", tool.command, tool.arguments)
                };
                variables.insert(tool_key, tool_command);
            }
        }

        Ok(variables)
    }

    /// 替换脚本中的变量
    fn replace_script_variables(&self, content: &str) -> Result<String, String> {
        let variables = self.get_available_variables()?;
        let mut result = content.to_string();

        // 使用正则表达式替换变量
        let re = Regex::new(r"\{([^}]+)\}").map_err(|e| format!("正则表达式错误: {}", e))?;

        result = re
            .replace_all(&result, |caps: &regex::Captures| {
                let var_name = &caps[1];
                if let Some(value) = variables.get(var_name) {
                    debug_info!("🔧 替换变量: {{{}}} -> {}", var_name, value);
                    // 对于路径变量，使用原始字符串格式
                    if var_name.contains("path")
                        || var_name.contains("directory")
                        || var_name.contains("image")
                    {
                        // 使用原始字符串 r"..." 来避免转义问题
                        format!("r\"{}\"", value)
                    } else {
                        // 对于其他变量（如时间、日期等），也用引号包围
                        format!("\"{}\"", value)
                    }
                } else {
                    //debug_info!("⚠️ 未找到变量: {{{}}}", var_name);
                    caps[0].to_string() // 保持原样
                }
            })
            .to_string();

        Ok(result)
    }

    /// 获取所有脚本
    pub fn get_scripts(&self) -> Result<Vec<PythonScript>, String> {
        let settings = load_settings()?;
        Ok(settings.script_management.scripts)
    }

    /// 添加脚本
    pub fn add_script(&self, mut script: PythonScript) -> Result<PythonScript, String> {
        let mut settings = load_settings()?;

        // 确保ID唯一
        script.id = format!("script_{}", Utc::now().timestamp_millis());
        script.created_at = Utc::now().to_rfc3339();
        script.updated_at = Utc::now().to_rfc3339();

        settings.script_management.scripts.push(script.clone());
        save_settings(settings)?;

        debug_info!("✅ 脚本已添加: {} ({})", script.name, script.id);
        Ok(script)
    }

    /// 更新脚本
    pub fn update_script(&self, script: PythonScript) -> Result<PythonScript, String> {
        let mut settings = load_settings()?;

        let script_index = settings
            .script_management
            .scripts
            .iter()
            .position(|s| s.id == script.id)
            .ok_or("脚本不存在")?;

        let mut updated_script = script;
        updated_script.updated_at = Utc::now().to_rfc3339();

        settings.script_management.scripts[script_index] = updated_script.clone();
        save_settings(settings)?;

        debug_info!(
            "✅ 脚本已更新: {} ({})",
            updated_script.name,
            updated_script.id
        );
        Ok(updated_script)
    }

    /// 删除脚本
    pub fn delete_script(&self, script_id: String) -> Result<(), String> {
        let mut settings = load_settings()?;

        let script_index = settings
            .script_management
            .scripts
            .iter()
            .position(|s| s.id == script_id)
            .ok_or("脚本不存在")?;

        let script = settings.script_management.scripts.remove(script_index);
        save_settings(settings)?;

        debug_info!("✅ 脚本已删除: {} ({})", script.name, script.id);
        Ok(())
    }

    /// 获取脚本执行状态
    pub fn get_script_status(&self, script_id: String) -> Option<ScriptExecutionStatus> {
        let status_map = self
            .execution_status
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        status_map.get(&script_id).cloned()
    }

    /// 获取所有脚本执行状态
    pub fn get_all_script_status(&self) -> HashMap<String, ScriptExecutionStatus> {
        let status_map = self
            .execution_status
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        status_map.clone()
    }

    /// 更新脚本执行状态
    fn update_script_status(&self, script_id: String, status: ScriptExecutionStatus) {
        let mut status_map = self
            .execution_status
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        status_map.insert(script_id, status);
    }

    /// 执行单个脚本
    pub async fn execute_script(
        &self,
        script_id: String,
        app_handle: Option<AppHandle>,
    ) -> Result<ScriptExecutionResult, String> {
        let settings = load_settings()?;

        let script = settings
            .script_management
            .scripts
            .iter()
            .find(|s| s.id == script_id)
            .ok_or("脚本不存在")?
            .clone();

        if !script.enabled {
            return Err("脚本已禁用".to_string());
        }

        // 检查脚本文件是否存在（如果使用文件模式）
        let use_inline_script = script
            .script_content
            .as_ref()
            .map_or(false, |c| !c.is_empty());
        if !use_inline_script && !std::path::Path::new(&script.file_path).exists() {
            return Err(format!("脚本文件不存在: {}", script.file_path));
        }

        // 更新执行状态为运行中
        let status = ScriptExecutionStatus {
            script_id: script.id.clone(),
            status: "running".to_string(),
            progress: Some("正在执行...".to_string()),
            started_at: Some(Utc::now().to_rfc3339()),
        };
        self.update_script_status(script.id.clone(), status.clone());

        // 发送状态更新事件
        if let Some(app) = &app_handle {
            let _ = app.emit("script-status-changed", &status);
            // 向控制台输出脚本开始执行的信息
            let _ = app.emit(
                "console-output",
                serde_json::json!({
                    "type": "system",
                    "content": format!("🐍 开始执行脚本: {}", script.name),
                    "timestamp": Utc::now().to_rfc3339()
                }),
            );
        }

        let start_time = Instant::now();
        let executed_at = Utc::now().to_rfc3339();

        // 构建Python命令
        let python_path = if !settings.python3_path.is_empty() {
            &settings.python3_path
        } else {
            "python"
        };

        let mut cmd = TokioCommand::new(python_path);

        // 处理脚本执行方式
        let temp_file_path = if use_inline_script {
            // 使用内联脚本内容
            let script_content = script.script_content.as_ref().ok_or("内联脚本内容为空")?;

            // 进行变量替换（如果启用）
            let processed_content = if script.enable_variable_substitution {
                self.replace_script_variables(script_content)?
            } else {
                script_content.clone()
            };

            // 创建临时文件
            let temp_dir = std::env::temp_dir();
            let temp_file_path = temp_dir.join(format!(
                "script_{}_{}.py",
                script.id,
                Utc::now().timestamp_millis()
            ));

            // 写入处理后的脚本内容
            std::fs::write(&temp_file_path, processed_content)
                .map_err(|e| format!("创建临时脚本文件失败: {}", e))?;

            debug_info!("📝 创建临时脚本文件: {}", temp_file_path.display());
            Some(temp_file_path)
        } else {
            // 使用文件路径模式
            let processed_file_path = if script.enable_variable_substitution {
                self.replace_script_variables(&script.file_path)?
            } else {
                script.file_path.clone()
            };

            // 如果启用变量替换，还需要处理脚本文件内容
            if script.enable_variable_substitution {
                // 读取原始脚本文件内容
                let original_content = std::fs::read_to_string(&processed_file_path)
                    .map_err(|e| format!("读取脚本文件失败: {}", e))?;

                // 进行变量替换
                let processed_content = self.replace_script_variables(&original_content)?;

                // 创建临时文件
                let temp_dir = std::env::temp_dir();
                let temp_file_path = temp_dir.join(format!(
                    "script_{}_{}.py",
                    script.id,
                    Utc::now().timestamp_millis()
                ));

                // 写入处理后的脚本内容
                std::fs::write(&temp_file_path, processed_content)
                    .map_err(|e| format!("创建临时脚本文件失败: {}", e))?;

                debug_info!(
                    "📝 创建临时脚本文件（文件模式+变量替换）: {}",
                    temp_file_path.display()
                );
                Some(temp_file_path)
            } else {
                // 直接使用原文件
                cmd.arg(&processed_file_path);
                None
            }
        };

        // 如果使用临时文件，添加到命令参数
        if let Some(ref temp_path) = temp_file_path {
            cmd.arg(temp_path);
        }

        // 添加参数并进行变量替换
        if !script.arguments.is_empty() {
            let processed_arguments = if script.enable_variable_substitution {
                self.replace_script_variables(&script.arguments)?
            } else {
                script.arguments.clone()
            };
            let args: Vec<&str> = processed_arguments.split_whitespace().collect();
            cmd.args(args);
        }

        // 设置编码相关环境变量（解决emoji和中文字符问题）
        cmd.env("PYTHONIOENCODING", "utf-8");
        cmd.env("PYTHONUTF8", "1");

        // Windows下设置控制台代码页
        #[cfg(target_os = "windows")]
        {
            cmd.env("CHCP", "65001");
            cmd.env("PYTHONLEGACYWINDOWSFSENCODING", "utf-8");
        }

        // 非Windows系统设置UTF-8环境
        #[cfg(not(target_os = "windows"))]
        {
            cmd.env("LANG", "en_US.UTF-8");
            cmd.env("LC_ALL", "en_US.UTF-8");
        }

        // 设置脚本相关环境变量
        cmd.env("SCRIPT_OUTPUT_PATH", &settings.output_path);
        cmd.env("SCRIPT_IMAGE_PATH", &settings.current_image_path);
        cmd.env("SCRIPT_SCRIPTS_PATH", &settings.scripts_path);
        cmd.env("SCRIPT_PYTHON2_PATH", &settings.python2_path);
        cmd.env("SCRIPT_PYTHON3_PATH", &settings.python3_path);
        cmd.env("SCRIPT_MEMPROCFS_PATH", &settings.memprocfs_path);
        cmd.env("SCRIPT_VOLATILITY2_PATH", &settings.volatility2_path);
        cmd.env("SCRIPT_VOLATILITY3_PATH", &settings.volatility3_path);
        cmd.env("SCRIPT_VOLATILITY2_PROFILE", &settings.volatility2_profile);

        // 添加时间相关环境变量
        let now = Utc::now();
        cmd.env("SCRIPT_TIMESTAMP", now.timestamp().to_string());
        cmd.env("SCRIPT_DATE", now.format("%Y-%m-%d").to_string());
        cmd.env("SCRIPT_TIME", now.format("%H:%M:%S").to_string());
        cmd.env(
            "SCRIPT_DATETIME",
            now.format("%Y-%m-%d %H:%M:%S").to_string(),
        );

        // 添加镜像相关环境变量
        if !settings.current_image_path.is_empty() {
            let image_path = std::path::Path::new(&settings.current_image_path);
            if let Some(image_name) = image_path.file_name() {
                cmd.env(
                    "SCRIPT_IMAGE_NAME",
                    image_name.to_string_lossy().to_string(),
                );
            }
            if let Some(image_dir) = image_path.parent() {
                cmd.env(
                    "SCRIPT_IMAGE_DIRECTORY",
                    image_dir.to_string_lossy().to_string(),
                );
            }
            if let Some(image_stem) = image_path.file_stem() {
                cmd.env(
                    "SCRIPT_IMAGE_NAME_WITHOUT_EXT",
                    image_stem.to_string_lossy().to_string(),
                );
            }
        }

        cmd.stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .stdin(Stdio::null());

        // Windows下隐藏控制台窗口
        #[cfg(target_os = "windows")]
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

        debug_info!("🐍 执行Python脚本: {} {}", python_path, script.file_path);

        // 执行脚本并设置超时，支持实时输出流
        let timeout_duration = Duration::from_secs(script.timeout_seconds);
        let result = timeout(
            timeout_duration,
            self.execute_script_with_streaming(cmd, app_handle.clone(), script.name.clone()),
        )
        .await;

        let execution_time = start_time.elapsed().as_millis() as u64;

        let execution_result = match result {
            Ok(Ok(output)) => {
                // 改进的输出解码，优先使用UTF-8，失败时使用更好的fallback
                let stdout = decode_script_output(&output.stdout);
                let stderr = decode_script_output(&output.stderr);

                let success = output.status.success();
                let error = if !stderr.is_empty() && !success {
                    // 详细的错误信息处理
                    let error_msg = if stderr.contains("ModuleNotFoundError") {
                        format!("Python模块缺失: {}", stderr)
                    } else if stderr.contains("SyntaxError") {
                        format!("Python语法错误: {}", stderr)
                    } else if stderr.contains("Permission denied") {
                        format!("权限不足: {}", stderr)
                    } else if stderr.contains("No such file or directory") {
                        format!("文件不存在: {}", stderr)
                    } else {
                        format!("脚本执行错误: {}", stderr)
                    };
                    Some(error_msg)
                } else {
                    None
                };

                // 记录执行日志
                if success {
                    debug_info!(
                        "✅ 脚本执行成功: {} - 输出长度: {} 字符",
                        script.name,
                        stdout.len()
                    );
                } else {
                    debug_info!("❌ 脚本执行失败: {} - 错误: {:?}", script.name, error);
                }

                // 发送脚本输出到控制台
                if let Some(app) = &app_handle {
                    // 发送标准输出
                    if !stdout.is_empty() {
                        let _ = app.emit(
                            "console-output",
                            serde_json::json!({
                                "type": "output",
                                "content": stdout,
                                "timestamp": Utc::now().to_rfc3339()
                            }),
                        );
                    }

                    // 发送错误输出
                    if !stderr.is_empty() {
                        let _ = app.emit(
                            "console-output",
                            serde_json::json!({
                                "type": "error",
                                "content": stderr,
                                "timestamp": Utc::now().to_rfc3339()
                            }),
                        );
                    }

                    // 发送执行完成状态
                    let status_msg = if success {
                        format!(
                            "✅ 脚本 {} 执行完成 (耗时: {}ms)",
                            script.name, execution_time
                        )
                    } else {
                        format!(
                            "❌ 脚本 {} 执行失败 (耗时: {}ms)",
                            script.name, execution_time
                        )
                    };

                    let _ = app.emit(
                        "console-output",
                        serde_json::json!({
                            "type": "system",
                            "content": status_msg,
                            "timestamp": Utc::now().to_rfc3339()
                        }),
                    );
                }

                ScriptExecutionResult {
                    script_id: script.id.clone(),
                    success,
                    output: stdout,
                    error,
                    execution_time_ms: execution_time,
                    executed_at,
                }
            }
            Ok(Err(e)) => {
                let error_msg = format!("进程启动失败: {}", e);
                debug_info!("❌ 脚本进程启动失败: {} - {}", script.name, error_msg);

                // 发送错误信息到控制台
                if let Some(app) = &app_handle {
                    let _ = app.emit(
                        "console-output",
                        serde_json::json!({
                            "type": "error",
                            "content": error_msg.clone(),
                            "timestamp": Utc::now().to_rfc3339()
                        }),
                    );
                }

                ScriptExecutionResult {
                    script_id: script.id.clone(),
                    success: false,
                    output: String::new(),
                    error: Some(error_msg),
                    execution_time_ms: execution_time,
                    executed_at,
                }
            }
            Err(_) => {
                let error_msg = format!("脚本执行超时 ({}秒)", script.timeout_seconds);
                debug_info!("⏰ 脚本执行超时: {} - {}", script.name, error_msg);

                // 发送超时信息到控制台
                if let Some(app) = &app_handle {
                    let _ = app.emit(
                        "console-output",
                        serde_json::json!({
                            "type": "error",
                            "content": error_msg.clone(),
                            "timestamp": Utc::now().to_rfc3339()
                        }),
                    );
                }

                ScriptExecutionResult {
                    script_id: script.id.clone(),
                    success: false,
                    output: String::new(),
                    error: Some(error_msg),
                    execution_time_ms: execution_time,
                    executed_at,
                }
            }
        };

        // 更新脚本执行统计
        self.update_script_execution_stats(&script.id, &execution_result)
            .await?;

        // 更新执行状态
        let final_status = ScriptExecutionStatus {
            script_id: script.id.clone(),
            status: if execution_result.success {
                "completed".to_string()
            } else {
                "error".to_string()
            },
            progress: Some(if execution_result.success {
                "执行完成".to_string()
            } else {
                "执行失败".to_string()
            }),
            started_at: None,
        };
        self.update_script_status(script.id.clone(), final_status.clone());

        // 发送状态更新事件
        if let Some(app) = &app_handle {
            let _ = app.emit("script-status-changed", &final_status);
            let _ = app.emit("script-execution-completed", &execution_result);
        }

        // 清理临时文件
        if let Some(temp_path) = temp_file_path {
            if let Err(e) = std::fs::remove_file(&temp_path) {
                debug_info!("⚠️ 清理临时脚本文件失败: {} - {}", temp_path.display(), e);
            } else {
                debug_info!("�️ 已清理临时脚本文件: {}", temp_path.display());
            }
        }

        debug_info!(
            "�🐍 脚本执行完成: {} - 成功: {} - 耗时: {}ms",
            script.name,
            execution_result.success,
            execution_time
        );

        Ok(execution_result)
    }

    /// 更新脚本执行统计信息
    async fn update_script_execution_stats(
        &self,
        script_id: &str,
        result: &ScriptExecutionResult,
    ) -> Result<(), String> {
        let mut settings = load_settings()?;

        if let Some(script) = settings
            .script_management
            .scripts
            .iter_mut()
            .find(|s| s.id == script_id)
        {
            script.last_executed = Some(result.executed_at.clone());
            script.execution_count += 1;
            script.updated_at = Utc::now().to_rfc3339();
        }

        save_settings(settings)?;
        Ok(())
    }

    /// 执行所有启用的脚本（用于内存镜像加载完成后自动执行）
    pub async fn execute_all_enabled_scripts(
        &self,
        app_handle: Option<AppHandle>,
    ) -> Result<Vec<ScriptExecutionResult>, String> {
        let settings = load_settings()?;

        debug_info!("🔍 脚本管理设置检查:");
        debug_info!("  - 脚本管理启用: {}", settings.script_management.enabled);
        debug_info!(
            "  - 自动执行启用: {}",
            settings.script_management.auto_execute_on_image_load
        );
        debug_info!("  - 脚本总数: {}", settings.script_management.scripts.len());

        if !settings.script_management.enabled
            || !settings.script_management.auto_execute_on_image_load
        {
            debug_info!("⚠️ 脚本自动执行已禁用");
            return Ok(Vec::new());
        }

        let enabled_scripts: Vec<_> = settings
            .script_management
            .scripts
            .iter()
            .filter(|s| s.enabled)
            .cloned()
            .collect();

        if enabled_scripts.is_empty() {
            debug_info!("📝 没有启用的脚本需要执行");
            return Ok(Vec::new());
        }

        debug_info!("📝 开始执行 {} 个启用的脚本", enabled_scripts.len());

        // 发送批量执行开始信息到控制台
        if let Some(app) = &app_handle {
            let _ = app.emit(
                "console-output",
                serde_json::json!({
                    "type": "system",
                    "content": format!("📝 开始批量执行 {} 个启用的脚本", enabled_scripts.len()),
                    "timestamp": Utc::now().to_rfc3339()
                }),
            );
        }

        let mut results = Vec::new();

        for script in enabled_scripts {
            match self
                .execute_script(script.id.clone(), app_handle.clone())
                .await
            {
                Ok(result) => {
                    results.push(result);
                }
                Err(e) => {
                    debug_info!("❌ 脚本执行失败: {} - {}", script.name, e);
                    // 创建失败结果
                    let error_result = ScriptExecutionResult {
                        script_id: script.id,
                        success: false,
                        output: String::new(),
                        error: Some(e),
                        execution_time_ms: 0,
                        executed_at: Utc::now().to_rfc3339(),
                    };
                    results.push(error_result);
                }
            }
        }

        debug_info!("📝 脚本批量执行完成，共 {} 个结果", results.len());

        // 发送批量执行完成信息到控制台
        if let Some(app) = &app_handle {
            let success_count = results.iter().filter(|r| r.success).count();
            let _ = app.emit("console-output", serde_json::json!({
                "type": "system",
                "content": format!("📝 脚本批量执行完成: {}/{} 成功", success_count, results.len()),
                "timestamp": Utc::now().to_rfc3339()
            }));
        }

        Ok(results)
    }

    /// 执行脚本并支持实时输出流
    async fn execute_script_with_streaming(
        &self,
        mut cmd: TokioCommand,
        app_handle: Option<AppHandle>,
        script_name: String,
    ) -> Result<std::process::Output, std::io::Error> {
        use std::process::Stdio;
        use tokio::io::{AsyncBufReadExt, BufReader};

        // 重新配置命令以支持流式输出
        cmd.stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .stdin(Stdio::null());

        // Windows下隐藏控制台窗口
        #[cfg(target_os = "windows")]
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

        let mut child = cmd.spawn()?;

        // 获取stdout和stderr的句柄
        let stdout = child.stdout.take().ok_or_else(|| {
            std::io::Error::new(std::io::ErrorKind::Other, "无法获取子进程标准输出")
        })?;
        let stderr = child.stderr.take().ok_or_else(|| {
            std::io::Error::new(std::io::ErrorKind::Other, "无法获取子进程标准错误")
        })?;

        // 创建缓冲读取器
        let stdout_reader = BufReader::new(stdout);
        let stderr_reader = BufReader::new(stderr);

        // 用于收集完整输出（将在后面被重新赋值）

        // 创建异步任务来处理stdout
        let app_handle_stdout = app_handle.clone();
        let script_name_stdout = script_name.clone();
        let stdout_task = tokio::spawn(async move {
            let mut lines = stdout_reader.lines();
            let mut collected_lines = Vec::new();

            while let Ok(Some(line)) = lines.next_line().await {
                collected_lines.push(line.clone());

                // 实时发送输出到控制台
                if let Some(app) = &app_handle_stdout {
                    let _ = app.emit(
                        "console-output",
                        serde_json::json!({
                            "type": "output",
                            "content": line,
                            "timestamp": chrono::Utc::now().to_rfc3339(),
                            "script_name": script_name_stdout
                        }),
                    );
                }
            }
            collected_lines
        });

        // 创建异步任务来处理stderr
        let app_handle_stderr = app_handle.clone();
        let script_name_stderr = script_name.clone();
        let stderr_task = tokio::spawn(async move {
            let mut lines = stderr_reader.lines();
            let mut collected_lines = Vec::new();

            while let Ok(Some(line)) = lines.next_line().await {
                collected_lines.push(line.clone());

                // 实时发送错误输出到控制台
                if let Some(app) = &app_handle_stderr {
                    let _ = app.emit(
                        "console-output",
                        serde_json::json!({
                            "type": "error",
                            "content": line,
                            "timestamp": chrono::Utc::now().to_rfc3339(),
                            "script_name": script_name_stderr
                        }),
                    );
                }
            }
            collected_lines
        });

        // 等待进程完成和输出收集完成
        let (status_result, stdout_result, stderr_result) =
            tokio::join!(child.wait(), stdout_task, stderr_task);

        let status = status_result?;
        let stdout_lines = stdout_result.unwrap_or_default();
        let stderr_lines = stderr_result.unwrap_or_default();

        // 构造标准的Output结构
        let stdout_bytes = stdout_lines.join("\n").into_bytes();
        let stderr_bytes = stderr_lines.join("\n").into_bytes();

        Ok(std::process::Output {
            status,
            stdout: stdout_bytes,
            stderr: stderr_bytes,
        })
    }
}

// 创建脚本管理器实例的辅助函数
pub fn create_script_manager() -> ScriptManager {
    ScriptManager::new()
}
