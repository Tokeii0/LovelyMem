//! Volatility3 命令执行模块
//!
//! 该模块提供了异步执行Volatility3内存分析工具的功能，支持：
//! - 异步执行Volatility3命令
//! - 支持offline模式
//! - 自动判断输出格式（quick/csv）
//! - 插件列表和符号表获取
//! - 输出目录管理
//!
//! # 使用示例
//!
//! ```rust
//! // 创建配置
//! let config = Volatility3Config {
//!     python_path: "python".to_string(),
//!     volatility3_path: "vol.py".to_string(),
//!     image_path: "/path/to/memory.raw".to_string(),
//! };
//!
//! // 执行pslist插件
//! let result = execute_volatility3_command(
//!     &config,
//!     "pslist",
//!     false,
//!     "output"
//! ).await?;
//! ```

use crate::path_utils;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use std::process::Stdio;
use std::sync::Arc;
use tauri::Emitter;
use tokio::fs;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::Mutex;
use tokio::time::{Duration, timeout};

/// 全局正在运行的 Vol3 子进程句柄（按插件名索引，支持多插件并发）
static VOL3_RUNNING_CHILDREN: std::sync::LazyLock<
    Arc<Mutex<HashMap<String, tokio::process::Child>>>,
> = std::sync::LazyLock::new(|| Arc::new(Mutex::new(HashMap::new())));

/// Vol3 进度事件数据
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Vol3ProgressEvent {
    pub plugin: String,
    pub message: String,
    pub stage: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Volatility3Config {
    pub python_path: String,
    pub volatility3_path: String,
    pub image_path: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Volatility3Result {
    pub success: bool,
    pub output_file: String,
    pub message: String,
    pub stdout: String,
    pub stderr: String,
    pub output_type: String,
    /// 该结果是否来自插件结果缓存（前端据此提示"来自缓存"）
    #[serde(default)]
    pub from_cache: bool,
}

/// 需要使用txt格式输出的插件列表
const TXT_PLUGINS: &[&str] = &[
    "info",
    "banners",
    "crashinfo",
    "envars",
    "getservicesids",
    "getsids",
    "hashdump",
    "lsadump",
    "printkey",
    "registry.printkey",
    "cachedump",
];

/// 检查插件是否需要txt格式输出
fn is_txt_plugin(plugin: &str) -> bool {
    TXT_PLUGINS.contains(&plugin)
}

/// 将简化的插件名称转换为完整的插件路径
fn get_full_plugin_name(plugin: &str) -> String {
    match plugin {
        // 特殊插件路径映射 - 需要完整路径的插件
        "windows" => "windows.windows.Windows".to_string(),
        "windowstations" => "windows.windowstations.WindowStations".to_string(),
        "truecrypt" => "windows.truecrypt.Passphrase".to_string(),
        // 注册表插件已经包含完整路径
        plugin if plugin.starts_with("registry.") => format!("windows.{}", plugin),
        // 其他插件需要windows.前缀
        _ => format!("windows.{}", plugin),
    }
}

/// 配置命令的环境变量以支持UTF-8编码和实时输出
fn configure_command_encoding(cmd: &mut Command) {
    // 禁用 Python 输出缓冲，确保 stderr 进度信息实时刷新
    // 这对于 Vol3 原生的符号表下载/缓存更新进度展示至关重要
    cmd.env("PYTHONUNBUFFERED", "1");

    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        // 设置环境变量强制使用UTF-8编码
        cmd.env("PYTHONIOENCODING", "utf-8");
        cmd.env("PYTHONUTF8", "1");
        // 设置控制台代码页为UTF-8
        cmd.env("CHCP", "65001");
    }
}

/// 构建Volatility3命令和输出文件路径
pub fn construct_volatility3_command(
    config: &Volatility3Config,
    plugin: &str,
    offline: bool,
    output_dir: &str,
) -> (Vec<String>, String) {
    let output_type = if is_txt_plugin(plugin) {
        "quick"
    } else {
        "csv"
    };
    let file_ext = if is_txt_plugin(plugin) { "txt" } else { "csv" };
    let output_file = format!("{}/output_vol3_{}.{}", output_dir, plugin, file_ext);

    // 构建完整的插件名称
    let plugin_name = get_full_plugin_name(plugin);

    // 获取 Vol3 目录路径（去掉 vol.py）用于 --cache-path
    let vol3_dir = std::path::Path::new(&config.volatility3_path)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    let mut additional_args = vec!["--cache-path", &vol3_dir, "-r", output_type, &plugin_name];
    if offline {
        additional_args.insert(0, "--offline");
    }

    let cmd = path_utils::build_volatility_args(
        &config.python_path,
        &config.volatility3_path,
        &config.image_path,
        &additional_args,
    );

    (cmd, output_file)
}

/// 异步执行Volatility3命令（无进度推送版本，保持向后兼容）
#[allow(dead_code)]
pub async fn execute_volatility3_command(
    config: &Volatility3Config,
    plugin: &str,
    offline: bool,
    output_dir: &str,
) -> Result<Volatility3Result, String> {
    execute_volatility3_command_inner(config, plugin, offline, output_dir, None).await
}

/// 异步执行Volatility3命令（带实时进度推送）
pub async fn execute_volatility3_command_with_progress(
    config: &Volatility3Config,
    plugin: &str,
    offline: bool,
    output_dir: &str,
    app_handle: tauri::AppHandle,
) -> Result<Volatility3Result, String> {
    execute_volatility3_command_inner(config, plugin, offline, output_dir, Some(app_handle)).await
}

/// 异步执行Volatility3命令（内部实现）
async fn execute_volatility3_command_inner(
    config: &Volatility3Config,
    plugin: &str,
    offline: bool,
    output_dir: &str,
    app_handle: Option<tauri::AppHandle>,
) -> Result<Volatility3Result, String> {
    // 运行时完整性校验（宏展开）
    crate::integrity_check!();

    // 确保输出目录存在
    create_output_dir(output_dir).await?;

    // 构建命令和输出文件路径
    let (cmd_args, output_file) =
        construct_volatility3_command(config, plugin, offline, output_dir);

    // 格式化完整命令用于日志显示（正确处理包含空格的参数）
    let formatted_cmd = cmd_args
        .iter()
        .map(|arg| {
            if arg.contains(' ') || arg.contains('\t') {
                format!("\"{}\"", arg)
            } else {
                arg.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join(" ");
    debug_info!("[+] 执行Volatility3命令: {}", formatted_cmd);

    // 发送开始事件
    if let Some(ref handle) = app_handle {
        let _ = handle.emit(
            "vol3-progress",
            Vol3ProgressEvent {
                plugin: plugin.to_string(),
                message: format!("正在启动插件 {}...", plugin),
                stage: "starting".to_string(),
            },
        );
    }

    // 创建命令，重定向输出到文件
    // cmd_args[0] 是 python_path，cmd_args[1..] 是参数
    let mut cmd = Command::new(&cmd_args[0]);
    cmd.args(&cmd_args[1..])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // 配置命令环境变量以支持UTF-8编码
    configure_command_encoding(&mut cmd);

    // 异步执行命令
    let mut child = cmd.spawn().map_err(|e| format!("启动命令失败: {}", e))?;

    // 将子进程存入全局变量，以便取消操作
    // 注意：我们需要先 take stdout/stderr，然后再存入全局变量
    let stdout = child.stdout.take().ok_or("无法获取stdout")?;
    let stderr = child.stderr.take().ok_or("无法获取stderr")?;

    // 将子进程存入全局变量（按插件名索引，支持多插件并发）
    {
        let mut guard = VOL3_RUNNING_CHILDREN.lock().await;
        guard.insert(plugin.to_string(), child);
    }

    let mut stdout_reader = BufReader::new(stdout);
    let mut stderr_reader = BufReader::new(stderr);

    let mut stdout_output = String::new();
    let mut stderr_output = String::new();

    let plugin_name = plugin.to_string();
    let app_handle_clone = app_handle.clone();

    // 异步读取stdout和stderr，使用UTF-8编码处理
    let stdout_task = async {
        let mut line = String::new();
        while let Ok(bytes_read) = stdout_reader.read_line(&mut line).await {
            if bytes_read == 0 {
                break;
            }
            stdout_output.push_str(&line);
            line.clear();
        }
    };

    let stderr_task = async {
        // 使用按字节块读取而非 read_line，以支持 \r 分隔的进度条更新
        // Vol3 下载符号表时会用 \r 原地覆盖进度信息
        let mut buf = vec![0u8; 4096];
        let mut partial_line = String::new();

        loop {
            match tokio::io::AsyncReadExt::read(&mut stderr_reader, &mut buf).await {
                Ok(0) => break, // EOF
                Ok(n) => {
                    let chunk = String::from_utf8_lossy(&buf[..n]).to_string();
                    stderr_output.push_str(&chunk);
                    partial_line.push_str(&chunk);

                    // 按 \r 或 \n 分割，提取最新的进度行
                    while let Some(pos) = partial_line.find(|c: char| c == '\r' || c == '\n') {
                        let segment = partial_line[..pos].trim().to_string();
                        partial_line = partial_line[pos + 1..].to_string();

                        if !segment.is_empty() {
                            if let Some(ref handle) = app_handle_clone {
                                let _ = handle.emit(
                                    "vol3-progress",
                                    Vol3ProgressEvent {
                                        plugin: plugin_name.clone(),
                                        message: segment,
                                        stage: "running".to_string(),
                                    },
                                );
                            }
                        }
                    }
                }
                Err(_) => break,
            }
        }

        // 处理剩余的不完整行
        let remaining = partial_line.trim().to_string();
        if !remaining.is_empty() {
            if let Some(ref handle) = app_handle_clone {
                let _ = handle.emit(
                    "vol3-progress",
                    Vol3ProgressEvent {
                        plugin: plugin_name.clone(),
                        message: remaining,
                        stage: "running".to_string(),
                    },
                );
            }
        }
    };

    // 并发执行读取任务
    tokio::join!(stdout_task, stderr_task);

    // 从全局变量中取出当前插件的 child 并等待完成
    let mut child = {
        let mut guard = VOL3_RUNNING_CHILDREN.lock().await;
        guard.remove(plugin)
    };

    let status = if let Some(ref mut child) = child {
        // 等待命令完成（带超时机制，默认10分钟）
        let timeout_duration = Duration::from_secs(600);
        timeout(timeout_duration, child.wait())
            .await
            .map_err(|_| {
                debug_info!("[!] Volatility3命令执行超时（10分钟），正在终止进程...");
                // 超时时尝试终止进程
                let _ = child.start_kill();
                "Volatility3命令执行超时（10分钟），已自动终止".to_string()
            })?
            .map_err(|e| format!("等待命令完成失败: {}", e))?
    } else {
        // 子进程已被取消（cancel_volatility3 被调用）
        if let Some(ref handle) = app_handle {
            let _ = handle.emit(
                "vol3-progress",
                Vol3ProgressEvent {
                    plugin: plugin.to_string(),
                    message: "插件执行已被用户取消".to_string(),
                    stage: "cancelled".to_string(),
                },
            );
        }
        return Err("插件执行已被用户取消".to_string());
    };

    let success = status.success();
    let message = if success {
        "[+] Volatility3命令执行成功".to_string()
    } else {
        format!("[-] Volatility3命令执行失败，退出码: {:?}", status.code())
    };

    // 发送完成事件
    if let Some(ref handle) = app_handle {
        let _ = handle.emit(
            "vol3-progress",
            Vol3ProgressEvent {
                plugin: plugin.to_string(),
                message: message.clone(),
                stage: if success { "completed" } else { "error" }.to_string(),
            },
        );
    }

    // 如果成功执行，将stdout写入输出文件（使用UTF-8编码）
    if success && !stdout_output.trim().is_empty() {
        // 确保以UTF-8编码写入文件
        match fs::write(&output_file, stdout_output.as_bytes()).await {
            Ok(_) => {
                debug_info!("[+] 输出已保存到: {}", output_file);
            }
            Err(e) => {
                debug_info!("[!] 写入输出文件失败: {}", e);
                // 尝试创建目录后重新写入
                if let Some(parent) = Path::new(&output_file).parent() {
                    if let Err(dir_err) = fs::create_dir_all(parent).await {
                        debug_info!("[!] 创建目录失败: {}", dir_err);
                    } else if let Err(retry_err) =
                        fs::write(&output_file, stdout_output.as_bytes()).await
                    {
                        debug_info!("[!] 重试写入文件失败: {}", retry_err);
                    } else {
                        debug_info!("[+] 输出已保存到: {}", output_file);
                    }
                }
            }
        }
    }

    let output_type = if is_txt_plugin(plugin) {
        "quick"
    } else {
        "csv"
    };

    Ok(Volatility3Result {
        success,
        output_file,
        message,
        stdout: stdout_output,
        stderr: stderr_output,
        output_type: output_type.to_string(),
        from_cache: false,
    })
}

/// 导出注册表 Hives
pub async fn execute_vol3_dump_hives_command(
    config: &Volatility3Config,
    offline: bool,
    output_dir: &str,
    app_handle: Option<tauri::AppHandle>,
) -> Result<Vec<String>, String> {
    let dump_dir = format!("{}/hives_dump", output_dir);
    create_output_dir(&dump_dir).await?;

    // 为了防止旧的数据干扰，先清空目录里原有的 hive 文件
    if let Ok(mut entries) = fs::read_dir(&dump_dir).await {
        while let Ok(Some(entry)) = entries.next_entry().await {
            let path = entry.path();
            if path.is_file() {
                let _ = fs::remove_file(path).await;
            }
        }
    }

    let vol3_dir = std::path::Path::new(&config.volatility3_path)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    let mut additional_args = vec![
        "--cache-path",
        &vol3_dir,
        "-o",
        &dump_dir,
        "windows.registry.hivelist",
        "--dump",
    ];
    if offline {
        additional_args.insert(0, "--offline");
    }

    let cmd_args = path_utils::build_volatility_args(
        &config.python_path,
        &config.volatility3_path,
        &config.image_path,
        &additional_args,
    );

    let formatted_cmd = cmd_args
        .iter()
        .map(|arg| {
            if arg.contains(' ') {
                format!("\"{}\"", arg)
            } else {
                arg.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join(" ");
    debug_info!("[+] 执行Volatility3 Registry Dump命令: {}", formatted_cmd);

    if let Some(ref handle) = app_handle {
        let _ = handle.emit(
            "vol3-progress",
            Vol3ProgressEvent {
                plugin: "registry.hivelist".to_string(),
                message: "正在导出 Hive 文件...".to_string(),
                stage: "running".to_string(),
            },
        );
    }

    let mut cmd = Command::new(&cmd_args[0]);
    cmd.args(&cmd_args[1..])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    configure_command_encoding(&mut cmd);

    let mut child = cmd.spawn().map_err(|e| format!("启动命令失败: {}", e))?;

    let stdout = child.stdout.take().ok_or("无法获取stdout")?;
    let stderr = child.stderr.take().ok_or("无法获取stderr")?;

    {
        let mut guard = VOL3_RUNNING_CHILDREN.lock().await;
        guard.insert("registry.hivelist".to_string(), child);
    }

    let mut stdout_reader = BufReader::new(stdout);
    let mut stderr_reader = BufReader::new(stderr);

    let mut stdout_output = String::new();
    let mut stderr_output = String::new();

    let app_handle_clone = app_handle.clone();
    let stdout_task = tokio::spawn(async move {
        let mut line = String::new();
        while let Ok(bytes) = stdout_reader.read_line(&mut line).await {
            if bytes == 0 {
                break;
            }
            if let Some(ref handle) = app_handle_clone {
                let _ = handle.emit(
                    "vol3-progress",
                    Vol3ProgressEvent {
                        plugin: "registry.hivelist".to_string(),
                        message: line.trim().to_string(),
                        stage: "running".to_string(),
                    },
                );
            }
            stdout_output.push_str(&line);
            line.clear();
        }
        stdout_output
    });

    let app_handle_clone2 = app_handle.clone();
    let stderr_task = tokio::spawn(async move {
        let mut line = String::new();
        while let Ok(bytes) = stderr_reader.read_line(&mut line).await {
            if bytes == 0 {
                break;
            }
            if let Some(ref handle) = app_handle_clone2 {
                let _ = handle.emit(
                    "vol3-progress",
                    Vol3ProgressEvent {
                        plugin: "registry.hivelist".to_string(),
                        message: line.trim().to_string(),
                        stage: "running".to_string(),
                    },
                );
            }
            stderr_output.push_str(&line);
            line.clear();
        }
        stderr_output
    });

    let (stdout_res, stderr_res) = tokio::join!(stdout_task, stderr_task);

    let mut guard = VOL3_RUNNING_CHILDREN.lock().await;
    let mut success = false;
    if let Some(mut child) = guard.remove("registry.hivelist") {
        if let Ok(Some(status)) = child.try_wait() {
            success = status.success();
        } else if let Ok(status) = timeout(Duration::from_secs(120), child.wait()).await {
            success = status
                .unwrap_or_else(|_| std::process::ExitStatus::default())
                .success();
        } else {
            let _ = child.kill().await;
        }
    }

    if let Some(ref handle) = app_handle {
        let _ = handle.emit(
            "vol3-progress",
            Vol3ProgressEvent {
                plugin: "registry.hivelist".to_string(),
                message: if success {
                    "导出完成".to_string()
                } else {
                    "导出失败".to_string()
                },
                stage: if success {
                    "completed".to_string()
                } else {
                    "error".to_string()
                },
            },
        );
    }

    if !success {
        return Err(format!(
            "导出 Hive 文件失败:\nStdout: {}\nStderr: {}",
            stdout_res.unwrap_or_default(),
            stderr_res.unwrap_or_default()
        ));
    }

    // 收集导出的 hive 文件
    let mut dumped_files = Vec::new();
    if let Ok(mut entries) = fs::read_dir(&dump_dir).await {
        while let Ok(Some(entry)) = entries.next_entry().await {
            let path = entry.path();
            if path.is_file() {
                if let Some(ext) = path.extension() {
                    let ext_str = ext.to_string_lossy().to_lowercase();
                    // Vol3 dump registry hives usually have .hive or .vacb extensions, or just checking if they contain "registry" in the name
                    if ext_str == "hive"
                        || ext_str == "vacb"
                        || ext_str == "raw"
                        || ext_str == "dat"
                    {
                        dumped_files.push(path.to_string_lossy().to_string());
                        continue;
                    }
                }

                let name = path
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_lowercase();
                if name.contains("registry") || name.contains(".hive") {
                    dumped_files.push(path.to_string_lossy().to_string());
                }
            }
        }
    }

    if dumped_files.is_empty() {
        return Err("未找到任何导出的 Hive 文件".to_string());
    }

    Ok(dumped_files)
}

/// 导出指定进程的内存（windows.memmap --pid N --dump），用于原始数据图像可视化。
///
/// 产出为**裸内存** dump（非 MDMP minidump），正合「按宽高/格式解释为图像」的需求。
/// 返回单个 dump 文件的绝对路径。进度通过 `vol3-progress` 事件上报（plugin = "memmap"），
/// 可用 `cancel_running_vol3(Some("memmap"))` 取消。
pub async fn dump_process_memory_command(
    config: &Volatility3Config,
    pid: u32,
    offline: bool,
    output_dir: &str,
    app_handle: Option<tauri::AppHandle>,
) -> Result<String, String> {
    // 每个 pid 独立子目录，便于多次 dump 互不干扰
    let dump_dir = format!("{}/memmap_dump/pid_{}", output_dir, pid);
    create_output_dir(&dump_dir).await?;

    // 清空旧产物，避免定位到过期文件
    if let Ok(mut entries) = fs::read_dir(&dump_dir).await {
        while let Ok(Some(entry)) = entries.next_entry().await {
            let path = entry.path();
            if path.is_file() {
                let _ = fs::remove_file(path).await;
            }
        }
    }

    let vol3_dir = std::path::Path::new(&config.volatility3_path)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    let pid_str = pid.to_string();
    let mut additional_args = vec![
        "--cache-path",
        &vol3_dir,
        "-o",
        &dump_dir,
        "windows.memmap.Memmap",
        "--pid",
        &pid_str,
        "--dump",
    ];
    if offline {
        additional_args.insert(0, "--offline");
    }

    let cmd_args = path_utils::build_volatility_args(
        &config.python_path,
        &config.volatility3_path,
        &config.image_path,
        &additional_args,
    );

    let formatted_cmd = cmd_args
        .iter()
        .map(|arg| {
            if arg.contains(' ') {
                format!("\"{}\"", arg)
            } else {
                arg.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join(" ");
    debug_info!("[+] 执行Volatility3 进程内存 Dump命令: {}", formatted_cmd);

    if let Some(ref handle) = app_handle {
        let _ = handle.emit(
            "vol3-progress",
            Vol3ProgressEvent {
                plugin: "memmap".to_string(),
                message: format!("正在 dump 进程 {} 的内存...", pid),
                stage: "running".to_string(),
            },
        );
    }

    let mut cmd = Command::new(&cmd_args[0]);
    cmd.args(&cmd_args[1..])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    configure_command_encoding(&mut cmd);

    let mut child = cmd.spawn().map_err(|e| format!("启动命令失败: {}", e))?;

    let stdout = child.stdout.take().ok_or("无法获取stdout")?;
    let stderr = child.stderr.take().ok_or("无法获取stderr")?;

    {
        let mut guard = VOL3_RUNNING_CHILDREN.lock().await;
        guard.insert("memmap".to_string(), child);
    }

    let mut stdout_reader = BufReader::new(stdout);
    let mut stderr_reader = BufReader::new(stderr);

    let mut stdout_output = String::new();
    let mut stderr_output = String::new();

    let app_handle_clone = app_handle.clone();
    let stdout_task = tokio::spawn(async move {
        let mut line = String::new();
        while let Ok(bytes) = stdout_reader.read_line(&mut line).await {
            if bytes == 0 {
                break;
            }
            if let Some(ref handle) = app_handle_clone {
                let _ = handle.emit(
                    "vol3-progress",
                    Vol3ProgressEvent {
                        plugin: "memmap".to_string(),
                        message: line.trim().to_string(),
                        stage: "running".to_string(),
                    },
                );
            }
            stdout_output.push_str(&line);
            line.clear();
        }
        stdout_output
    });

    let app_handle_clone2 = app_handle.clone();
    let stderr_task = tokio::spawn(async move {
        let mut line = String::new();
        while let Ok(bytes) = stderr_reader.read_line(&mut line).await {
            if bytes == 0 {
                break;
            }
            if let Some(ref handle) = app_handle_clone2 {
                let _ = handle.emit(
                    "vol3-progress",
                    Vol3ProgressEvent {
                        plugin: "memmap".to_string(),
                        message: line.trim().to_string(),
                        stage: "running".to_string(),
                    },
                );
            }
            stderr_output.push_str(&line);
            line.clear();
        }
        stderr_output
    });

    let (stdout_res, stderr_res) = tokio::join!(stdout_task, stderr_task);

    let mut success = false;
    {
        let mut guard = VOL3_RUNNING_CHILDREN.lock().await;
        if let Some(mut child) = guard.remove("memmap") {
            if let Ok(Some(status)) = child.try_wait() {
                success = status.success();
            } else if let Ok(status) = timeout(Duration::from_secs(600), child.wait()).await {
                success = status
                    .unwrap_or_else(|_| std::process::ExitStatus::default())
                    .success();
            } else {
                let _ = child.kill().await;
            }
        }
    }

    if let Some(ref handle) = app_handle {
        let _ = handle.emit(
            "vol3-progress",
            Vol3ProgressEvent {
                plugin: "memmap".to_string(),
                message: if success {
                    "Dump 完成".to_string()
                } else {
                    "Dump 失败".to_string()
                },
                stage: if success {
                    "completed".to_string()
                } else {
                    "error".to_string()
                },
            },
        );
    }

    if !success {
        return Err(format!(
            "Dump 进程内存失败:\nStdout: {}\nStderr: {}",
            stdout_res.unwrap_or_default(),
            stderr_res.unwrap_or_default()
        ));
    }

    // 收集产物（路径 + 大小），选择优先级：含 pid 的 .dmp > 任意 .dmp > 体积最大者
    let mut files: Vec<(std::path::PathBuf, u64)> = Vec::new();
    if let Ok(mut entries) = fs::read_dir(&dump_dir).await {
        while let Ok(Some(entry)) = entries.next_entry().await {
            let path = entry.path();
            if path.is_file() {
                let size = fs::metadata(&path).await.map(|m| m.len()).unwrap_or(0);
                files.push((path, size));
            }
        }
    }

    if files.is_empty() {
        return Err("未找到任何导出的内存 dump 文件".to_string());
    }

    let pid_marker = pid.to_string();
    let is_dmp = |p: &std::path::Path| {
        p.extension()
            .map(|e| e.to_string_lossy().to_lowercase() == "dmp")
            .unwrap_or(false)
    };

    let chosen = files
        .iter()
        .find(|(p, _)| {
            is_dmp(p)
                && p.file_name()
                    .map(|n| n.to_string_lossy().contains(&pid_marker))
                    .unwrap_or(false)
        })
        .or_else(|| files.iter().find(|(p, _)| is_dmp(p)))
        .or_else(|| files.iter().max_by_key(|(_, s)| *s))
        .map(|(p, _)| p.clone())
        .ok_or_else(|| "无法从 dump 产物中选择文件".to_string())?;

    Ok(chosen.to_string_lossy().to_string())
}

/// 收集目录下的所有普通文件路径。
/// 排序优先级：DataSectionObject（真正的文件内容） > ImageSectionObject > 其它，
/// 便于把最“正统”的那份产物重命名回原始文件名。
async fn collect_files_in_dir(dir: &str) -> Vec<String> {
    let mut files = Vec::new();
    if let Ok(mut entries) = fs::read_dir(dir).await {
        while let Ok(Some(entry)) = entries.next_entry().await {
            let p = entry.path();
            if p.is_file() {
                files.push(p.to_string_lossy().to_string());
            }
        }
    }
    let rank = |p: &String| -> u8 {
        if p.contains("DataSectionObject") {
            0
        } else if p.contains("ImageSectionObject") {
            1
        } else {
            2
        }
    };
    files.sort_by_key(rank);
    files
}

/// 可直接查看的常见类型：这些类型的产物重命名回原始文件名，方便直接打开
const RENAMABLE_EXTS: &[&str] = &["txt", "csv", "png", "jpg", "jpeg", "bmp"];

/// 把 vol3 生成的 `file.0x…​.0x…​.DataSectionObject.<name>.dat` 重命名回原始文件名。
/// 仅对 [`RENAMABLE_EXTS`] 生效；多个产物时给后续文件加序号避免互相覆盖。
async fn rename_dumps_to_original(files: Vec<String>, original_name: &str) -> Vec<String> {
    let ext = std::path::Path::new(original_name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    if !RENAMABLE_EXTS.contains(&ext.as_str()) {
        return files;
    }
    let stem = std::path::Path::new(original_name)
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "exported".to_string());

    let mut out = Vec::with_capacity(files.len());
    for (i, f) in files.iter().enumerate() {
        let src = std::path::Path::new(f);
        let Some(dir) = src.parent() else {
            out.push(f.clone());
            continue;
        };
        let target = if i == 0 {
            original_name.to_string()
        } else {
            format!("{}_{}.{}", stem, i + 1, ext)
        };
        let dst = dir.join(&target);
        match fs::rename(src, &dst).await {
            Ok(_) => out.push(dst.to_string_lossy().to_string()),
            // 重命名失败（占用/同名等）时保留原产物，不影响导出结果
            Err(_) => out.push(f.clone()),
        }
    }
    out
}

/// 按偏移导出文件（windows.dumpfiles）
///
/// FileScan 列出的 Offset 通常是物理偏移，因此先尝试 `--physaddr`；
/// 若没有产出文件，再退回 `--virtaddr`（部分条目需要虚拟地址）。
/// 返回导出的文件绝对路径列表。
pub async fn dump_files_by_offset_command(
    config: &Volatility3Config,
    offset: &str,
    original_name: Option<&str>,
    offline: bool,
    output_dir: &str,
    app_handle: Option<tauri::AppHandle>,
) -> Result<Vec<String>, String> {
    let offset = offset.trim();
    if offset.is_empty() {
        return Err("偏移量为空，无法导出文件".to_string());
    }

    // 每个偏移独立子目录，避免多次导出互相覆盖/混淆
    let safe = offset.trim_start_matches("0x").trim_start_matches("0X");
    let dump_dir = format!("{}/dumpfiles/{}", output_dir, safe);
    create_output_dir(&dump_dir).await?;

    // 清空旧产物，避免把上次的结果误认为本次导出
    if let Ok(mut entries) = fs::read_dir(&dump_dir).await {
        while let Ok(Some(entry)) = entries.next_entry().await {
            let p = entry.path();
            if p.is_file() {
                let _ = fs::remove_file(p).await;
            }
        }
    }

    let vol3_dir = std::path::Path::new(&config.volatility3_path)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    let emit = |msg: &str, stage: &str| {
        if let Some(ref handle) = app_handle {
            let _ = handle.emit(
                "vol3-progress",
                Vol3ProgressEvent {
                    plugin: "dumpfiles".to_string(),
                    message: msg.to_string(),
                    stage: stage.to_string(),
                },
            );
        }
    };

    let mut last_err = String::new();

    for addr_flag in ["--physaddr", "--virtaddr"] {
        emit(
            &format!("正在导出文件（{} {}）...", addr_flag, offset),
            "running",
        );

        let mut additional_args = vec![
            "--cache-path",
            &vol3_dir,
            "-o",
            &dump_dir,
            "windows.dumpfiles.DumpFiles",
            addr_flag,
            offset,
        ];
        if offline {
            additional_args.insert(0, "--offline");
        }

        let cmd_args = path_utils::build_volatility_args(
            &config.python_path,
            &config.volatility3_path,
            &config.image_path,
            &additional_args,
        );
        debug_info!("[+] 执行Volatility3 文件导出命令: {}", cmd_args.join(" "));

        let mut cmd = Command::new(&cmd_args[0]);
        cmd.args(&cmd_args[1..])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        configure_command_encoding(&mut cmd);

        let output = match timeout(Duration::from_secs(600), cmd.output()).await {
            Ok(Ok(o)) => o,
            Ok(Err(e)) => {
                last_err = format!("启动命令失败: {}", e);
                continue;
            }
            Err(_) => {
                last_err = "文件导出超时（600 秒）".to_string();
                continue;
            }
        };

        let files = collect_files_in_dir(&dump_dir).await;
        if !files.is_empty() {
            // txt/csv/png/jpg/bmp 等常见类型重命名回原始文件名，便于直接打开
            let files = match original_name {
                Some(name) if !name.trim().is_empty() => {
                    rename_dumps_to_original(files, name.trim()).await
                }
                _ => files,
            };
            emit(&format!("已导出 {} 个文件", files.len()), "completed");
            return Ok(files);
        }

        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        last_err = format!("{} 未产出文件。{}", addr_flag, stderr.trim());
    }

    emit("文件导出失败", "error");
    Err(format!(
        "未能在该偏移处导出文件（已尝试 --physaddr 与 --virtaddr）。\n\
         该条目可能只是 MFT/对象残留，文件内容未驻留内存。\n{}",
        last_err
    ))
}

/// 取消正在运行的 Volatility3 命令（指定插件名或取消全部）
pub async fn cancel_running_vol3(plugin: Option<&str>) -> Result<String, String> {
    let mut guard = VOL3_RUNNING_CHILDREN.lock().await;

    // 收集需要取消的插件名
    let plugins_to_cancel: Vec<String> = if let Some(p) = plugin {
        if guard.contains_key(p) {
            vec![p.to_string()]
        } else {
            return Ok("当前没有正在运行的 Volatility3 命令".to_string());
        }
    } else {
        guard.keys().cloned().collect()
    };

    if plugins_to_cancel.is_empty() {
        return Ok("当前没有正在运行的 Volatility3 命令".to_string());
    }

    for plugin_name in &plugins_to_cancel {
        if let Some(ref mut child) = guard.get_mut(plugin_name) {
            let pid = child.id();

            #[cfg(target_os = "windows")]
            {
                if let Some(pid) = pid {
                    debug_info!(
                        "[+] 正在终止 Volatility3 插件 {} 进程树 (PID: {})...",
                        plugin_name,
                        pid
                    );
                    let kill_result = tokio::process::Command::new("taskkill")
                        .args(["/F", "/T", "/PID", &pid.to_string()])
                        .creation_flags(0x08000000)
                        .output()
                        .await;

                    match kill_result {
                        Ok(output) => {
                            let stdout = String::from_utf8_lossy(&output.stdout);
                            let stderr = String::from_utf8_lossy(&output.stderr);
                            debug_info!("[+] taskkill 输出: {} {}", stdout.trim(), stderr.trim());
                        }
                        Err(e) => {
                            debug_info!("[!] taskkill 失败: {}，回退到 start_kill", e);
                            let _ = child.start_kill();
                        }
                    }
                } else {
                    let _ = child.start_kill();
                }
            }

            #[cfg(not(target_os = "windows"))]
            {
                let _ = child.start_kill();
            }
        }
    }

    // 从全局变量中移除
    for plugin_name in &plugins_to_cancel {
        guard.remove(plugin_name);
    }

    let msg = if plugins_to_cancel.len() == 1 {
        format!("已取消 Volatility3 插件 {} 的执行", plugins_to_cancel[0])
    } else {
        format!(
            "已取消 {} 个 Volatility3 插件的执行",
            plugins_to_cancel.len()
        )
    };
    debug_info!("[+] {}", msg);
    Ok(msg)
}

/// 检查文件是否存在
pub async fn file_exists(path: &str) -> bool {
    tokio::fs::try_exists(path).await.unwrap_or(false)
}

/// 创建输出目录
pub async fn create_output_dir(dir_path: &str) -> Result<(), String> {
    fs::create_dir_all(dir_path)
        .await
        .map_err(|e| format!("创建输出目录失败: {}", e))
}

/// 获取可用的Volatility3插件列表
pub async fn get_volatility3_plugins(config: &Volatility3Config) -> Result<Vec<String>, String> {
    let mut cmd = Command::new(&config.python_path);
    cmd.args(&[&config.volatility3_path, "--help"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // 配置命令环境变量以支持UTF-8编码
    configure_command_encoding(&mut cmd);

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("获取插件列表失败: {}", e))?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let plugins: Vec<String> = stdout
            .lines()
            .filter_map(|line| {
                let trimmed = line.trim();
                // 查找windows.开头的插件
                if trimmed.starts_with("windows.") {
                    let parts: Vec<&str> = trimmed.split_whitespace().collect();
                    if !parts.is_empty() {
                        // 移除"windows."前缀
                        let plugin_name = parts[0].strip_prefix("windows.").unwrap_or(parts[0]);
                        Some(plugin_name.to_string())
                    } else {
                        None
                    }
                } else {
                    None
                }
            })
            .collect();

        Ok(plugins)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("获取插件列表失败: {}", stderr))
    }
}

/// 获取Volatility3版本信息
pub async fn get_volatility3_version(config: &Volatility3Config) -> Result<String, String> {
    let mut cmd = Command::new(&config.python_path);
    cmd.args(&[&config.volatility3_path, "--version"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // 配置命令环境变量以支持UTF-8编码
    configure_command_encoding(&mut cmd);

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("获取版本信息失败: {}", e))?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        Ok(stdout.trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("获取版本信息失败: {}", stderr))
    }
}

/// 检查Volatility3环境
pub async fn check_volatility3_environment(config: &Volatility3Config) -> Result<bool, String> {
    // 检查Python路径
    if !file_exists(&config.python_path).await {
        return Err(format!("Python路径不存在: {}", config.python_path));
    }

    // 检查Volatility3脚本
    if !file_exists(&config.volatility3_path).await {
        return Err(format!(
            "Volatility3脚本不存在: {}",
            config.volatility3_path
        ));
    }

    // 检查内存映像文件
    if !file_exists(&config.image_path).await {
        return Err(format!("内存映像文件不存在: {}", config.image_path));
    }

    // 尝试执行version命令验证环境
    match get_volatility3_version(config).await {
        Ok(_) => Ok(true),
        Err(e) => Err(format!("Volatility3环境验证失败: {}", e)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_txt_plugin() {
        assert!(is_txt_plugin("info"));
        assert!(is_txt_plugin("banners"));
        assert!(!is_txt_plugin("pslist"));
        assert!(!is_txt_plugin("netstat"));
    }

    #[test]
    fn test_get_full_plugin_name() {
        assert_eq!(get_full_plugin_name("pslist"), "windows.pslist");
        assert_eq!(get_full_plugin_name("windows"), "windows.windows.Windows");
        assert_eq!(
            get_full_plugin_name("windowstations"),
            "windows.windowstations.WindowStations"
        );
        assert_eq!(
            get_full_plugin_name("truecrypt"),
            "windows.truecrypt.Passphrase"
        );
        assert_eq!(
            get_full_plugin_name("registry.printkey"),
            "windows.registry.printkey"
        );
    }

    #[test]
    fn test_construct_command() {
        let config = Volatility3Config {
            python_path: "python".to_string(),
            volatility3_path: "vol.py".to_string(),
            image_path: "memory.raw".to_string(),
        };

        // 测试普通插件（csv输出）
        let (cmd, output_file) = construct_volatility3_command(&config, "pslist", false, "output");
        assert_eq!(
            cmd,
            vec![
                "python",
                "vol.py",
                "-f",
                "memory.raw",
                "-r",
                "csv",
                "windows.pslist"
            ]
        );
        assert_eq!(output_file, "output/output_vol3_pslist.csv");

        // 测试txt插件
        let (cmd, output_file) = construct_volatility3_command(&config, "info", false, "output");
        assert_eq!(
            cmd,
            vec![
                "python",
                "vol.py",
                "-f",
                "memory.raw",
                "-r",
                "quick",
                "windows.info"
            ]
        );
        assert_eq!(output_file, "output/output_vol3_info.txt");

        // 测试特殊插件 - windows
        let (cmd, output_file) = construct_volatility3_command(&config, "windows", false, "output");
        assert_eq!(
            cmd,
            vec![
                "python",
                "vol.py",
                "-f",
                "memory.raw",
                "-r",
                "csv",
                "windows.windows.Windows"
            ]
        );
        assert_eq!(output_file, "output/output_vol3_windows.csv");

        // 测试offline模式
        let (cmd, _) = construct_volatility3_command(&config, "pslist", true, "output");
        assert_eq!(
            cmd,
            vec![
                "python",
                "vol.py",
                "-f",
                "memory.raw",
                "--offline",
                "-r",
                "csv",
                "windows.pslist"
            ]
        );
    }
}
