use crate::path_utils;
use crate::types::{
    PluginCommandContext, PluginCommandResult, PythonScriptInfo, TerminalCommandResult,
};
use std::env;
use std::process::Command;
use std::time::Instant;

/// 执行插件命令
#[tauri::command]
pub async fn execute_plugin_command(
    command: String,
    _context: Option<PluginCommandContext>,
) -> Result<PluginCommandResult, String> {
    crate::integrity_check!();

    let start_time = Instant::now();

    // 解析命令和参数
    let parts: Vec<&str> = command.split_whitespace().collect();
    if parts.is_empty() {
        return Err("空命令".to_string());
    }

    let _program = parts[0];
    let _args = &parts[1..];

    debug_info!("🚀 执行插件命令: {}", command);
    debug_info!("📋 完整命令详情: {}", command);

    // 修复命令中的路径问题
    let fixed_command = path_utils::fix_command_paths(&command);
    debug_info!("🔧 修复后的命令: {}", fixed_command);

    // 执行命令
    let output_result = if cfg!(target_os = "windows") {
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;

            // 解析命令以避免双重引号问题
            let parsed_command = parse_command_line(&fixed_command);
            if let Some((program, args)) = parsed_command {
                Command::new(program)
                    .args(args)
                    .creation_flags(0x08000000) // CREATE_NO_WINDOW - 隐藏控制台窗口
                    .output()
            } else {
                // 如果解析失败，回退到原来的方法
                Command::new("cmd")
                    .args(["/C", &fixed_command])
                    .creation_flags(0x08000000)
                    .output()
            }
        }
        #[cfg(not(target_os = "windows"))]
        {
            // 这个分支在编译时不会被包含在 Windows 版本中
            unreachable!()
        }
    } else {
        // 非Windows系统的处理 (macOS, Linux等)
        Command::new("sh").args(["-c", &fixed_command]).output()
    };

    let execution_time = start_time.elapsed().as_millis() as u64;

    match output_result {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();

            let success = output.status.success();
            let exit_code = output.status.code();

            debug_info!(
                "✅ 命令执行完成，耗时: {}ms, 成功: {}",
                execution_time,
                success
            );

            Ok(PluginCommandResult {
                success,
                output: if success && !stdout.is_empty() {
                    stdout
                } else if !stderr.is_empty() {
                    stderr.clone()
                } else {
                    "命令执行完成".to_string()
                },
                error: if success { None } else { Some(stderr) },
                exit_code,
                execution_time,
            })
        }
        Err(e) => {
            debug_info!("❌ 命令执行失败: {}", e);
            Ok(PluginCommandResult {
                success: false,
                output: "".to_string(),
                error: Some(format!("命令执行失败: {}", e)),
                exit_code: None,
                execution_time,
            })
        }
    }
}

/// 执行终端命令
#[tauri::command]
pub async fn execute_terminal_command(
    command: String,
    working_directory: Option<String>,
) -> Result<TerminalCommandResult, String> {
    let start_time = Instant::now();

    // 验证命令不为空
    if command.trim().is_empty() {
        return Err("命令不能为空".to_string());
    }

    // 设置工作目录，默认为当前目录
    let work_dir = working_directory.unwrap_or_else(|| {
        env::current_dir()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string()
    });

    debug_info!("🖥️ 执行终端命令: {}", command);
    debug_info!("📁 工作目录: {}", work_dir);

    // 修复命令中的路径问题
    let fixed_command = path_utils::fix_command_paths(&command);
    debug_info!("🔧 修复后的终端命令: {}", fixed_command);

    // 执行命令，针对不同平台设置正确的编码和命令解析
    let mut cmd = if cfg!(target_os = "windows") {
        let mut c = Command::new("cmd");
        // 构建完整的命令，先设置 UTF-8 编码再执行用户命令
        let full_command = format!("chcp 65001 >nul 2>&1 && {}", fixed_command);
        c.args(["/C", &full_command]);
        c
    } else {
        let mut c = Command::new("sh");
        c.args(["-c", &fixed_command]);
        c
    };

    // 设置工作目录和环境变量
    cmd.current_dir(&work_dir);

    // 设置 UTF-8 相关环境变量
    cmd.env("PYTHONIOENCODING", "utf-8");
    cmd.env("PYTHONUTF8", "1");

    // 针对不同平台设置编码环境变量
    if cfg!(target_os = "windows") {
        cmd.env("CHCP", "65001");
    } else {
        cmd.env("LANG", "en_US.UTF-8");
        cmd.env("LC_ALL", "en_US.UTF-8");
    }

    let output_result = cmd.output();
    let execution_time = start_time.elapsed().as_millis() as u64;

    match output_result {
        Ok(output) => {
            // 尝试使用 UTF-8 解码，如果失败则使用系统默认编码
            let stdout = if let Ok(utf8_str) = String::from_utf8(output.stdout.clone()) {
                utf8_str
            } else {
                // 在 Windows 上尝试使用 GBK 编码
                #[cfg(target_os = "windows")]
                {
                    use encoding_rs::GBK;
                    let (decoded, _, _) = GBK.decode(&output.stdout);
                    decoded.to_string()
                }
                #[cfg(not(target_os = "windows"))]
                {
                    String::from_utf8_lossy(&output.stdout).to_string()
                }
            };

            let stderr = if let Ok(utf8_str) = String::from_utf8(output.stderr.clone()) {
                utf8_str
            } else {
                // 在 Windows 上尝试使用 GBK 编码
                #[cfg(target_os = "windows")]
                {
                    use encoding_rs::GBK;
                    let (decoded, _, _) = GBK.decode(&output.stderr);
                    decoded.to_string()
                }
                #[cfg(not(target_os = "windows"))]
                {
                    String::from_utf8_lossy(&output.stderr).to_string()
                }
            };

            let success = output.status.success();
            let exit_code = output.status.code();

            debug_info!(
                "✅ 终端命令执行完成，耗时: {}ms, 成功: {}",
                execution_time,
                success
            );
            if !stdout.is_empty() {
                debug_info!(
                    "📤 标准输出: {}",
                    stdout.chars().take(200).collect::<String>()
                );
            }
            if !stderr.is_empty() {
                debug_info!(
                    "⚠️ 错误输出: {}",
                    stderr.chars().take(200).collect::<String>()
                );
            }

            Ok(TerminalCommandResult {
                success,
                stdout,
                stderr,
                exit_code,
                execution_time,
                command: command.clone(),
                working_directory: work_dir,
            })
        }
        Err(e) => {
            debug_info!("❌ 终端命令执行失败: {}", e);
            Ok(TerminalCommandResult {
                success: false,
                stdout: String::new(),
                stderr: format!("命令执行失败: {}", e),
                exit_code: None,
                execution_time,
                command: command.clone(),
                working_directory: work_dir,
            })
        }
    }
}

/// 同步执行命令的简化版本
pub fn execute_command_sync(command: &str) -> Result<String, String> {
    debug_info!("🚀 执行命令: {}", command);

    // 修复命令中的路径问题
    let fixed_command = path_utils::fix_command_paths(command);
    debug_info!("🔧 修复后的同步命令: {}", fixed_command);

    let output_result = if cfg!(target_os = "windows") {
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;

            // 解析命令以避免双重引号问题
            let parsed_command = parse_command_line(&fixed_command);
            if let Some((program, args)) = parsed_command {
                Command::new(program)
                    .args(args)
                    .creation_flags(0x08000000) // CREATE_NO_WINDOW - 隐藏控制台窗口
                    .output()
            } else {
                // 如果解析失败，回退到原来的方法
                Command::new("cmd")
                    .args(["/C", &fixed_command])
                    .creation_flags(0x08000000)
                    .output()
            }
        }
        #[cfg(not(target_os = "windows"))]
        {
            unreachable!()
        }
    } else {
        // 非Windows系统的处理 (macOS, Linux等)
        Command::new("sh").args(["-c", &fixed_command]).output()
    };

    match output_result {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();

            if output.status.success() {
                debug_info!("✅ 命令执行成功");
                Ok(if !stdout.is_empty() {
                    stdout
                } else {
                    "命令执行完成".to_string()
                })
            } else {
                debug_info!("❌ 命令执行失败: {}", stderr);
                Err(stderr)
            }
        }
        Err(e) => {
            debug_info!("❌ 命令执行失败: {}", e);
            Err(format!("命令执行失败: {}", e))
        }
    }
}

/// 同步执行多条命令
pub fn execute_multiple_commands_sync(commands_str: &str) -> Result<String, String> {
    // 支持多种分隔符：换行符、分号、&&
    let commands: Vec<&str> = commands_str
        .split('\n')
        .flat_map(|line| line.split(';'))
        .flat_map(|part| part.split("&&"))
        .map(|cmd| cmd.trim())
        .filter(|cmd| !cmd.is_empty())
        .collect();

    if commands.is_empty() {
        return Err("没有找到有效的命令".to_string());
    }

    debug_info!("🚀 准备执行 {} 条命令", commands.len());

    let mut all_outputs = Vec::new();
    let mut has_error = false;

    for (index, command) in commands.iter().enumerate() {
        debug_info!("🔧 执行命令 {}/{}: {}", index + 1, commands.len(), command);

        // 修复命令中的路径问题
        let fixed_command = path_utils::fix_command_paths(command);
        debug_info!("🔧 修复后的批量命令: {}", fixed_command);

        let output_result = if cfg!(target_os = "windows") {
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;

                // 解析命令以避免双重引号问题
                let parsed_command = parse_command_line(&fixed_command);
                if let Some((program, args)) = parsed_command {
                    Command::new(program)
                        .args(args)
                        .creation_flags(0x08000000) // CREATE_NO_WINDOW - 隐藏控制台窗口
                        .output()
                } else {
                    // 如果解析失败，回退到原来的方法
                    Command::new("cmd")
                        .args(["/C", &fixed_command])
                        .creation_flags(0x08000000)
                        .output()
                }
            }
            #[cfg(not(target_os = "windows"))]
            {
                unreachable!()
            }
        } else {
            // 非Windows系统的处理 (macOS, Linux等)
            Command::new("sh").args(["-c", &fixed_command]).output()
        };

        match output_result {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();

                if output.status.success() {
                    debug_info!("✅ 命令 {} 执行成功", index + 1);
                    let output_text = if !stdout.is_empty() {
                        stdout
                    } else {
                        format!("命令 {} 执行完成", index + 1)
                    };
                    all_outputs.push(format!("[命令{}] {}", index + 1, output_text));
                } else {
                    debug_info!("❌ 命令 {} 执行失败: {}", index + 1, stderr);
                    all_outputs.push(format!("[命令{}] 错误: {}", index + 1, stderr));
                    has_error = true;
                    // 继续执行其他命令，不中断
                }
            }
            Err(e) => {
                debug_info!("❌ 命令 {} 执行失败: {}", index + 1, e);
                all_outputs.push(format!("[命令{}] 执行失败: {}", index + 1, e));
                has_error = true;
                // 继续执行其他命令，不中断
            }
        }
    }

    let combined_output = all_outputs.join("\n");

    if has_error {
        debug_info!("⚠️ 部分命令执行失败，但已完成所有命令");
        // 即使有错误也返回Ok，因为我们希望显示所有命令的结果
        Ok(format!("多命令执行完成（部分失败）:\n{}", combined_output))
    } else {
        debug_info!("✅ 所有命令执行成功");
        Ok(format!("多命令执行完成:\n{}", combined_output))
    }
}

/// 异步执行多条命令
pub async fn execute_multiple_commands_async(commands_str: &str) -> Result<String, String> {
    // 支持多种分隔符：换行符、分号、&&
    let commands: Vec<&str> = commands_str
        .split('\n')
        .flat_map(|line| line.split(';'))
        .flat_map(|part| part.split("&&"))
        .map(|cmd| cmd.trim())
        .filter(|cmd| !cmd.is_empty())
        .collect();

    if commands.is_empty() {
        return Err("没有找到有效的命令".to_string());
    }

    debug_info!("🚀 准备异步执行 {} 条命令", commands.len());

    let mut all_outputs = Vec::new();
    let mut has_error = false;

    for (index, command) in commands.iter().enumerate() {
        debug_info!(
            "🔧 异步执行命令 {}/{}: {}",
            index + 1,
            commands.len(),
            command
        );

        // 修复命令中的路径问题
        let fixed_command = path_utils::fix_command_paths(command);
        debug_info!("🔧 修复后的异步批量命令: {}", fixed_command);

        let output_result = if cfg!(target_os = "windows") {
            #[cfg(target_os = "windows")]
            {
                // 解析命令以避免双重引号问题
                let parsed_command = parse_command_line(&fixed_command);
                if let Some((program, args)) = parsed_command {
                    tokio::process::Command::new(program)
                        .args(args)
                        .creation_flags(0x08000000) // CREATE_NO_WINDOW - 隐藏控制台窗口
                        .output()
                        .await
                } else {
                    // 如果解析失败，回退到原来的方法
                    tokio::process::Command::new("cmd")
                        .args(["/C", &fixed_command])
                        .creation_flags(0x08000000)
                        .output()
                        .await
                }
            }
            #[cfg(not(target_os = "windows"))]
            {
                unreachable!()
            }
        } else {
            // 非Windows系统的处理 (macOS, Linux等)
            tokio::process::Command::new("sh")
                .args(["-c", &fixed_command])
                .output()
                .await
        };

        match output_result {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();

                if output.status.success() {
                    debug_info!("✅ 命令 {} 执行成功", index + 1);
                    if !stdout.is_empty() {
                        all_outputs.push(format!("命令 {}: {}", index + 1, stdout.trim()));
                    } else {
                        all_outputs.push(format!("命令 {}: 执行完成", index + 1));
                    }
                } else {
                    debug_info!("❌ 命令 {} 执行失败: {}", index + 1, stderr);
                    all_outputs.push(format!("命令 {} 失败: {}", index + 1, stderr.trim()));
                    has_error = true;
                }
            }
            Err(e) => {
                debug_info!("❌ 命令 {} 执行失败: {}", index + 1, e);
                all_outputs.push(format!("命令 {} 失败: {}", index + 1, e));
                has_error = true;
            }
        }
    }

    let combined_output = all_outputs.join("\n");

    if has_error {
        debug_info!("⚠️ 部分命令执行失败，但已完成所有命令");
        // 即使有错误也返回Ok，因为我们希望显示所有命令的结果
        Ok(format!(
            "多命令异步执行完成（部分失败）:\n{}",
            combined_output
        ))
    } else {
        debug_info!("✅ 所有命令异步执行成功");
        Ok(format!("多命令异步执行完成:\n{}", combined_output))
    }
}

/// 执行Python脚本
#[tauri::command]
pub async fn execute_python_script(
    python_path: String,
    script_name: String,
    file_path: String,
    output_dir: String,
    args: Vec<String>,
) -> Result<String, String> {
    use std::path::Path;

    debug_info!("🐍 执行Python脚本: {}", script_name);
    debug_info!("📁 文件路径: {}", file_path);
    debug_info!("📂 输出目录: {}", output_dir);

    // 验证文件是否存在
    if !Path::new(&file_path).exists() {
        return Err(format!("文件不存在: {}", file_path));
    }

    // 创建输出目录
    if let Err(e) = std::fs::create_dir_all(&output_dir) {
        return Err(format!("创建输出目录失败: {}", e));
    }

    // 构建脚本路径 - 使用用户设置的脚本目录
    let settings = crate::settings::load_settings()?;
    let scripts_dir = std::path::PathBuf::from(&settings.scripts_path);
    let script_path = scripts_dir
        .join(format!("{}.py", script_name))
        .to_string_lossy()
        .to_string();

    debug_info!("🐍 脚本路径: {}", script_path);

    // 构建安全的命令参数 - 使用路径处理工具
    let cmd_args = path_utils::build_python_script_args(
        &python_path,
        &script_path,
        &file_path,
        &output_dir,
        &args,
    );

    // 执行Python脚本 - Command::new()会自动处理路径中的空格
    let output = Command::new(&python_path)
        .args(&cmd_args) // 使用完整的参数列表
        .env("PYTHONIOENCODING", "utf-8") // 设置Python输出编码为UTF-8
        .env("PYTHONLEGACYWINDOWSFSENCODING", "utf-8") // Windows文件系统编码
        .output()
        .map_err(|e| format!("执行Python脚本失败: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    if !output.status.success() {
        return Err(format!("脚本执行失败: {}\n错误输出: {}", stdout, stderr));
    }

    debug_info!("✅ Python脚本执行成功");
    debug_info!("📤 标准输出: {}", stdout);

    Ok(stdout.to_string())
}

/// 获取Python脚本列表
#[tauri::command]
pub async fn get_python_scripts() -> Result<Vec<PythonScriptInfo>, String> {
    use crate::settings::load_settings;
    use std::fs;
    use std::path::PathBuf;

    // 从设置中获取用户配置的脚本路径
    let settings = load_settings()?;
    let scripts_dir_path = PathBuf::from(&settings.scripts_path);

    debug_info!("📁 用户设置的脚本目录: {:?}", scripts_dir_path);

    debug_info!("🔍 正在扫描脚本目录: {:?}", scripts_dir_path);
    debug_info!("📂 脚本目录是否存在: {}", scripts_dir_path.exists());

    // 如果脚本目录不存在，尝试创建它
    if !scripts_dir_path.exists() {
        debug_info!("📁 脚本目录不存在，尝试创建: {:?}", scripts_dir_path);
        match fs::create_dir_all(&scripts_dir_path) {
            Ok(_) => {
                debug_info!("✅ 脚本目录创建成功");
            }
            Err(e) => {
                debug_info!("❌ 创建脚本目录失败: {}", e);
                return Err(format!("创建脚本目录失败: {}", e));
            }
        }
    }

    let mut scripts = Vec::new();

    match fs::read_dir(&scripts_dir_path) {
        Ok(entries) => {
            debug_info!("✅ 成功打开脚本目录");
            for entry in entries {
                if let Ok(entry) = entry {
                    let path = entry.path();
                    debug_info!("📄 发现文件: {:?}", path);

                    if path.extension().and_then(|s| s.to_str()) == Some("py") {
                        debug_info!("🐍 找到Python脚本: {:?}", path);
                        match parse_python_script_info(&path) {
                            Ok(script_info) => {
                                debug_info!("✅ 解析脚本信息成功: {}", script_info.display_name);
                                scripts.push(script_info);
                            }
                            Err(e) => {
                                debug_info!("❌ 解析脚本信息失败: {}", e);
                            }
                        }
                    }
                }
            }
        }
        Err(e) => {
            debug_info!("❌ 无法打开脚本目录 {:?}: {}", scripts_dir_path, e);
            return Err(format!("无法打开脚本目录: {}", e));
        }
    }

    debug_info!("📊 总共找到 {} 个脚本", scripts.len());
    Ok(scripts)
}

fn parse_python_script_info(script_path: &std::path::Path) -> Result<PythonScriptInfo, String> {
    use std::fs;

    let content =
        fs::read_to_string(script_path).map_err(|e| format!("读取脚本文件失败: {}", e))?;

    let file_name = script_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("unknown")
        .to_string();

    // 解析脚本头部的元信息
    let mut display_name = file_name.clone();
    let mut description = "Python脚本".to_string();
    let mut icon = "🐍".to_string();
    let mut file_types = vec!["*".to_string()];

    // 查找脚本头部的注释信息
    for line in content.lines() {
        if line.trim().starts_with("#") {
            let line = line.trim_matches('#').trim();
            if line.starts_with("name:") {
                display_name = line["name:".len()..].trim().to_string();
            } else if line.starts_with("description:") {
                description = line["description:".len()..].trim().to_string();
            } else if line.starts_with("icon:") {
                icon = line["icon:".len()..].trim().to_string();
            } else if line.starts_with("file_types:") {
                file_types = line["file_types:".len()..]
                    .trim()
                    .split(',')
                    .map(|s| s.trim().to_string())
                    .collect();
            }
        } else {
            break;
        }
    }

    let script_info = PythonScriptInfo {
        name: file_name,
        display_name: display_name.clone(),
        description: description.clone(),
        icon: icon.clone(),
        file_types: file_types.clone(),
        file_path: script_path.to_string_lossy().to_string(),
    };

    //debug_info!("🎉 脚本解析完成: {} -> {:?}", display_name, file_types);

    Ok(script_info)
}

/// 解析命令行字符串，正确处理引号
fn parse_command_line(command: &str) -> Option<(String, Vec<String>)> {
    let mut parts = Vec::new();
    let mut current_part = String::new();
    let mut in_quotes = false;
    let mut chars = command.chars().peekable();

    while let Some(ch) = chars.next() {
        match ch {
            '"' => {
                in_quotes = !in_quotes;
                // 不包含引号字符本身
            }
            ' ' | '\t' if !in_quotes => {
                if !current_part.is_empty() {
                    parts.push(current_part.clone());
                    current_part.clear();
                }
            }
            _ => {
                current_part.push(ch);
            }
        }
    }

    // 添加最后一个部分
    if !current_part.is_empty() {
        parts.push(current_part);
    }

    if parts.is_empty() {
        return None;
    }

    let program = parts[0].clone();
    let args = parts[1..].to_vec();

    Some((program, args))
}

/// 异步执行命令的版本，使用 spawn_blocking 避免阻塞主线程
pub async fn execute_command_async(command: &str) -> Result<String, String> {
    debug_info!("🚀 异步执行命令: {}", command);

    let command_clone = command.to_string();
    match tokio::task::spawn_blocking(move || execute_command_sync(&command_clone)).await {
        Ok(result) => result,
        Err(e) => Err(format!("异步命令执行任务失败: {}", e)),
    }
}
