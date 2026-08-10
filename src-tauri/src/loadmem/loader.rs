//! 内存镜像加载模块
//!
//! 负责 MemProcFS 内存镜像的加载和远程内存加载

use crate::AppSettings;
use serde_json::json;
use std::path::Path;
use std::process::Stdio;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command as TokioCommand;

use super::file_ops::{clear_output_directory, copy_forensic_files};
use super::process::find_memprocfs_process_id;
use super::profile::get_profile_info;
use super::types::{CommandEvent, LoadMemResult};
use super::utils::*;

/// 加载远程内存镜像
pub async fn load_remote_memory_image(
    remote_ip: String,
    app_handle: Option<AppHandle>,
) -> Result<LoadMemResult, String> {
    debug_info!("[*] 开始加载远程内存镜像，远程IP: {}", remote_ip);

    // ARM64 系统特殊处理
    if is_arm64_system() {
        debug_info!(
            "[*] 检测到 ARM64 系统 ({}), 启用兼容性模式",
            get_system_arch()
        );

        if let Some(ref app) = app_handle {
            let _ = app.emit(
                "system_info",
                json!({
                    "architecture": get_system_arch(),
                    "compatibility_mode": true,
                    "message": "ARM64 系统已启用兼容性模式"
                }),
            );
        }
    }

    let settings = crate::settings::load_settings().map_err(|e| format!("加载设置失败: {}", e))?;

    // 清空 output_path
    if let Err(e) = clear_output_directory(&settings.output_path).await {
        debug_info!("[-] 清空输出目录失败: {}", e);
        return Err(format!("清空输出目录失败: {}", e));
    }

    // 检查 MemProcFS 路径
    if settings.memprocfs_path.is_empty() {
        return Ok(LoadMemResult {
            success: false,
            message: "MemProcFS路径未设置，请在应用设置中配置".to_string(),
            process_id: None,
            command: String::new(),
            output: String::new(),
            error: "MemProcFS路径未设置".to_string(),
            profile_info: None,
        });
    }

    if !Path::new(&settings.memprocfs_path).exists() {
        return Ok(LoadMemResult {
            success: false,
            message: format!("MemProcFS可执行文件不存在: {}", settings.memprocfs_path),
            process_id: None,
            command: String::new(),
            output: String::new(),
            error: format!("可执行文件不存在: {}", settings.memprocfs_path),
            profile_info: None,
        });
    }

    // 构建远程连接字符串
    let remote_url = format!("rpc://insecure:{}", remote_ip);
    let full_command = format!(
        "{} -device pmem -forensic 1 -v -remote {}",
        settings.memprocfs_path, remote_url
    );

    debug_info!("[*] 执行远程内存加载命令: {}", full_command);

    // 构建 Tokio 命令
    let mut tokio_cmd = TokioCommand::new(&settings.memprocfs_path);

    if let Some(parent_dir) = Path::new(&settings.memprocfs_path).parent() {
        tokio_cmd.current_dir(parent_dir);
        debug_info!("设置工作目录为: {}", parent_dir.display());
    }

    tokio_cmd
        .arg("-device")
        .arg("pmem")
        .arg("-forensic")
        .arg("1")
        .arg("-v")
        .arg("-remote")
        .arg(&remote_url)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null());

    // 移除 MYSQL 相关环境变量，避免干扰 MemProcFS
    for (key, _) in std::env::vars() {
        if key.to_uppercase().contains("MYSQL") {
            tokio_cmd.env_remove(&key);
        }
    }

    tokio_cmd
        .env("PYTHONIOENCODING", "utf-8")
        .env("LANG", "zh_CN.UTF-8")
        .env("LC_ALL", "zh_CN.UTF-8");

    #[cfg(target_os = "windows")]
    tokio_cmd.creation_flags(0x08000000);

    match tokio_cmd.spawn() {
        Ok(mut child) => {
            let process_id = child.id().unwrap_or(0);
            debug_info!("MemProcFS 远程连接启动成功，进程ID: {}", process_id);

            let stdout = child.stdout.take();
            let stderr = child.stderr.take();

            let mut captured_output = String::new();

            let timeout_duration = if is_arm64_system() {
                debug_info!("[*] ARM64 系统，延长超时时间到 1200 秒");
                tokio::time::Duration::from_secs(1200)
            } else {
                tokio::time::Duration::from_secs(600)
            };

            // 使用 Box::pin 将大型 async 闭包从栈移到堆，防止 stack overflow
            let mut stdout_task: Option<
                std::pin::Pin<Box<dyn std::future::Future<Output = String> + Send>>,
            > = None;
            let mut stderr_task: Option<
                std::pin::Pin<Box<dyn std::future::Future<Output = String> + Send>>,
            > = None;

            if let Some(stdout) = stdout {
                let mut reader = BufReader::new(stdout);
                let app_handle_stdout = app_handle.clone();
                stdout_task = Some(Box::pin(async move {
                    let mut stdout_output = String::new();
                    let mut _line_count = 0;
                    let mut finished = false;
                    let mut buffer = Vec::new();

                    while !finished {
                        buffer.clear();
                        match reader.read_until(b'\n', &mut buffer).await {
                            Ok(0) => break,
                            Ok(_) => {
                                let line = decode_with_fallback(&buffer);
                                let line = line.trim_end_matches('\n').trim_end_matches('\r');

                                if !line.is_empty() {
                                    debug_info!("[STDOUT] {}", line);
                                    stdout_output.push_str(&format!("{}\n", line));
                                    _line_count += 1;

                                    if let Some(app) = &app_handle_stdout {
                                        let output_event = CommandEvent {
                                            id: generate_command_id(),
                                            name: "远程内存 MemProcFS 输出".to_string(),
                                            command: "MemProcFS 远程连接实时输出".to_string(),
                                            status: "running".to_string(),
                                            output: Some(line.to_string()),
                                            error: None,
                                            time: get_current_time(),
                                        };
                                        let _ = app.emit("command-event", &output_event);
                                    }

                                    if is_memprocfs_completed(&line) {
                                        debug_info!("[*] 检测到 MemProcFS 完成标识符");

                                        if let Some(app) = &app_handle_stdout {
                                            let success_event = CommandEvent {
                                                id: generate_command_id(),
                                                name: "远程内存 MemProcFS 加载完成".to_string(),
                                                command: "MemProcFS forensic mode completed"
                                                    .to_string(),
                                                status: "completed".to_string(),
                                                output: Some(
                                                    "远程内存 MemProcFS 已完成加载和分析"
                                                        .to_string(),
                                                ),
                                                error: None,
                                                time: get_current_time(),
                                            };
                                            let _ = app.emit("command-event", &success_event);
                                        }

                                        finished = true;
                                    }
                                }
                            }
                            Err(e) => {
                                debug_info!("读取 stdout 出错: {}", e);
                                continue;
                            }
                        }
                    }
                    stdout_output
                }));
            }

            if let Some(stderr) = stderr {
                let mut reader = BufReader::new(stderr);
                let app_handle_stderr = app_handle.clone();
                stderr_task = Some(Box::pin(async move {
                    let mut stderr_output = String::new();
                    let mut buffer = Vec::new();

                    loop {
                        buffer.clear();
                        match reader.read_until(b'\n', &mut buffer).await {
                            Ok(0) => break,
                            Ok(_) => {
                                let line = decode_with_fallback(&buffer);
                                let line = line.trim_end_matches('\n').trim_end_matches('\r');

                                if !line.is_empty() {
                                    debug_info!("[STDERR] {}", line);
                                    stderr_output.push_str(&format!("{}\n", line));

                                    if let Some(app) = &app_handle_stderr {
                                        let error_event = CommandEvent {
                                            id: generate_command_id(),
                                            name: "远程内存 MemProcFS 错误输出".to_string(),
                                            command: "MemProcFS 远程连接实时错误输出".to_string(),
                                            status: "running".to_string(),
                                            output: None,
                                            error: Some(line.to_string()),
                                            time: get_current_time(),
                                        };
                                        let _ = app.emit("command-event", &error_event);
                                    }
                                }
                            }
                            Err(e) => {
                                debug_info!("读取 stderr 出错: {}", e);
                                continue;
                            }
                        }
                    }
                    stderr_output
                }));
            }

            match tokio::time::timeout(timeout_duration, async {
                let mut stdout_result = String::new();
                let mut stderr_result = String::new();

                match (stdout_task, stderr_task) {
                    (Some(stdout), Some(stderr)) => {
                        let (stdout_res, stderr_res) = tokio::join!(stdout, stderr);
                        stdout_result = stdout_res;
                        stderr_result = stderr_res;
                    }
                    (Some(stdout), None) => {
                        stdout_result = stdout.await;
                    }
                    (None, Some(stderr)) => {
                        stderr_result = stderr.await;
                    }
                    (None, None) => {}
                }

                (stdout_result, stderr_result)
            })
            .await
            {
                Ok((stdout_result, stderr_result)) => {
                    captured_output.push_str(&stdout_result);
                    captured_output.push_str(&stderr_result);
                }
                Err(_) => {
                    captured_output.push_str("读取输出超时\n");
                }
            }

            let final_output = if captured_output.is_empty() {
                format!(
                    "远程内存 MemProcFS 启动成功 (PID: {})\n进程正在后台运行\n远程主机: {}",
                    process_id, remote_ip
                )
            } else {
                format!(
                    "远程内存 MemProcFS 启动成功 (PID: {})\n远程主机: {}\n{}",
                    process_id, remote_ip, captured_output
                )
            };

            Ok(LoadMemResult {
                success: true,
                message: format!(
                    "远程内存 MemProcFS 启动成功，进程ID: {}，远程主机: {}",
                    process_id, remote_ip
                ),
                process_id: Some(process_id),
                command: full_command,
                output: final_output,
                error: String::new(),
                profile_info: None,
            })
        }
        Err(e) => {
            let mut error_msg = format!("启动远程内存 MemProcFS 失败: {}", e);

            if is_arm64_system() {
                error_msg.push_str(&format!(
                    "\n\n[ARM64 兼容性提示]\n- 当前系统架构: {}\n- 请确保 MemProcFS 支持 ARM64 架构",
                    get_system_arch()
                ));
            }

            Ok(LoadMemResult {
                success: false,
                message: error_msg.clone(),
                process_id: None,
                command: full_command,
                output: String::new(),
                error: error_msg,
                profile_info: None,
            })
        }
    }
}

/// 加载内存镜像。
pub async fn load_memory_image(
    settings: &AppSettings,
    image_path: &str,
    app_handle: Option<AppHandle>,
) -> Result<LoadMemResult, String> {
    load_memory_image_impl(settings, image_path, app_handle).await
}

/// 验证 MemProcFS 是否真正完成挂载(避免“进程已启动但挂载失败/超时”仍报成功)。
/// Windows 检查配置的挂载盘;非 Windows 暂保持原行为(不阻断)。
async fn verify_memprocfs_mounted() -> bool {
    #[cfg(target_os = "windows")]
    {
        // 进程刚启动时挂载点可能略有延迟,轮询最多约 8 秒
        for _ in 0..16 {
            if std::path::Path::new(&crate::settings::mount_root()).exists() {
                return true;
            }
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
        }
        false
    }
    #[cfg(not(target_os = "windows"))]
    {
        true
    }
}

/// 加载内存镜像的实际实现
async fn load_memory_image_impl(
    settings: &AppSettings,
    image_path: &str,
    app_handle: Option<AppHandle>,
) -> Result<LoadMemResult, String> {
    debug_info!(">>> load_memory_image_impl 开始");
    debug_info!("  image_path: {}", image_path);
    debug_info!("  memprocfs_path: {}", settings.memprocfs_path);
    debug_info!("  output_path: {}", settings.output_path);

    // ARM64 系统特殊处理
    if is_arm64_system() {
        debug_info!(
            "[*] 检测到 ARM64 系统 ({}), 启用兼容性模式",
            get_system_arch()
        );

        if let Some(ref app) = app_handle {
            let _ = app.emit(
                "system_info",
                json!({
                    "architecture": get_system_arch(),
                    "compatibility_mode": true,
                    "message": "ARM64 系统已启用兼容性模式"
                }),
            );
        }
    }

    // 先校验路径，避免无效路径时执行不必要的 IO 操作
    if settings.memprocfs_path.is_empty() {
        return Ok(LoadMemResult {
            success: false,
            message: "MemProcFS路径未设置，请在应用设置中配置".to_string(),
            process_id: None,
            command: String::new(),
            output: String::new(),
            error: "MemProcFS路径未设置".to_string(),
            profile_info: None,
        });
    }

    if !Path::new(&settings.memprocfs_path).exists() {
        return Ok(LoadMemResult {
            success: false,
            message: format!("MemProcFS可执行文件不存在: {}", settings.memprocfs_path),
            process_id: None,
            command: String::new(),
            output: String::new(),
            error: format!("可执行文件不存在: {}", settings.memprocfs_path),
            profile_info: None,
        });
    }

    // 检查镜像文件
    if image_path != "vmware" && image_path != "livekd" && !Path::new(image_path).exists() {
        return Ok(LoadMemResult {
            success: false,
            message: format!("镜像文件不存在: {}", image_path),
            process_id: None,
            command: String::new(),
            output: String::new(),
            error: format!("镜像文件不存在: {}", image_path),
            profile_info: None,
        });
    }

    // 运行时完整性校验（宏展开 — 每个调用点独立机器码）
    crate::integrity_check!();

    // 清空输出目录
    debug_info!("[步骤B] 清空输出目录: {}", settings.output_path);
    if let Err(e) = clear_output_directory(&settings.output_path).await {
        debug_info!("[-] 清空输出目录失败: {}", e);
        return Err(format!("清空输出目录失败: {}", e));
    }
    debug_info!("[步骤B] 输出目录清空成功");

    // 构建完整命令字符串
    let mut full_command = if image_path == "vmware" {
        format!(
            "{} -device vmware -v -license-accept-elastic-license-2-0 -forensic 1",
            settings.memprocfs_path
        )
    } else if image_path == "livekd" {
        format!(
            "{} /LIVEKD /APP {} /C \"-license-accept-elastic-license-2-0 -forensic 1\"",
            settings.dumpit_path, settings.memprocfs_path
        )
    } else {
        format!(
            "{} -device \"{}\" -license-accept-elastic-license-2-0 -forensic 1",
            settings.memprocfs_path, image_path
        )
    };

    // 添加可选参数
    if image_path != "vmware" && image_path != "livekd" {
        if settings.yara_enabled && !settings.yara_rules_path.is_empty() {
            full_command.push_str(&format!(
                " -forensic-yara-rules \"{}\"",
                settings.yara_rules_path
            ));
        }

        if !settings.pagefile0_path.is_empty() {
            full_command.push_str(&format!(" -pagefile0 \"{}\"", settings.pagefile0_path));
        }

        if !settings.pagefile1_path.is_empty() {
            full_command.push_str(&format!(" -pagefile1 \"{}\"", settings.pagefile1_path));
        }

        #[cfg(target_os = "macos")]
        {
            let desktop_path = std::env::var("HOME")
                .map(|home| format!("{}/Desktop/fs", home))
                .unwrap_or_else(|_| "/Users/Shared/MemProcFS".to_string());
            full_command.push_str(&format!(" -mount \"{}\"", desktop_path));
        }

        #[cfg(not(target_os = "macos"))]
        {
            full_command.push_str(&format!(
                " -mount {}",
                crate::settings::sanitize_drive_letter(&settings.mount_drive_letter)
            ));
        }
    }

    debug_info!("[步骤C] 构建命令完成");
    debug_info!("执行命令: {}", full_command);
    debug_info!("[步骤D] 使用 Tokio 异步启动 MemProcFS...");

    // 构建命令
    let mut tokio_cmd = if image_path == "vmware" {
        debug_info!("🖥️ 虚拟机内存镜像模式，以管理员权限启动...");
        let mut cmd = TokioCommand::new("powershell");
        cmd.arg("-Command")
            .arg(format!(
                "Start-Process -FilePath '{}' -ArgumentList '-device', 'vmware', '-v', '-license-accept-elastic-license-2-0', '-forensic', '1' -Verb RunAs -WindowStyle Hidden",
                settings.memprocfs_path
            ));
        cmd
    } else if image_path == "livekd" {
        debug_info!("💻 本机内存模式，以管理员权限启动 DumpIt...");
        let mut cmd = TokioCommand::new("powershell");
        cmd.arg("-Command")
            .arg(format!(
                "Start-Process -FilePath '{}' -ArgumentList '/LIVEKD', '/APP', '{}', '/C', '\"-license-accept-elastic-license-2-0 -forensic 1\"' -Verb RunAs -WindowStyle Hidden",
                settings.dumpit_path, settings.memprocfs_path
            ));
        cmd
    } else {
        let mut cmd = TokioCommand::new(&settings.memprocfs_path);

        if let Some(parent_dir) = Path::new(&settings.memprocfs_path).parent() {
            cmd.current_dir(parent_dir);
            debug_info!("Tokio命令设置工作目录为: {}", parent_dir.display());
        }

        cmd.arg("-device")
            .arg(image_path)
            .arg("-license-accept-elastic-license-2-0")
            .arg("-forensic")
            .arg("1");
        cmd
    };

    // 设置 YARA、Pagefile 和挂载参数
    if image_path != "vmware" && image_path != "livekd" {
        if settings.yara_enabled && !settings.yara_rules_path.is_empty() {
            tokio_cmd
                .arg("-forensic-yara-rules")
                .arg(&settings.yara_rules_path);
        }

        if !settings.pagefile0_path.is_empty() {
            tokio_cmd.arg("-pagefile0").arg(&settings.pagefile0_path);
        }

        if !settings.pagefile1_path.is_empty() {
            tokio_cmd.arg("-pagefile1").arg(&settings.pagefile1_path);
        }

        #[cfg(target_os = "macos")]
        {
            let desktop_path = std::env::var("HOME")
                .map(|home| format!("{}/Desktop/fs", home))
                .unwrap_or_else(|_| "/Users/Shared/MemProcFS".to_string());
            tokio_cmd.arg("-mount").arg(&desktop_path);
        }

        #[cfg(not(target_os = "macos"))]
        {
            tokio_cmd
                .arg("-mount")
                .arg(crate::settings::sanitize_drive_letter(
                    &settings.mount_drive_letter,
                ));
        }
    }

    // 设置标准输入输出和环境变量
    if image_path != "vmware" && image_path != "livekd" {
        tokio_cmd
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .stdin(Stdio::null());

        // 移除 MYSQL 相关环境变量，避免干扰 MemProcFS
        for (key, _) in std::env::vars() {
            if key.to_uppercase().contains("MYSQL") {
                tokio_cmd.env_remove(&key);
            }
        }

        tokio_cmd
            .env("PYTHONIOENCODING", "utf-8")
            .env("LANG", "zh_CN.UTF-8")
            .env("LC_ALL", "zh_CN.UTF-8");

        #[cfg(target_os = "windows")]
        tokio_cmd.creation_flags(0x08000000);
    }

    debug_info!("[步骤E] 准备 spawn MemProcFS 进程...");
    match tokio_cmd.spawn() {
        Ok(mut child) => {
            debug_info!("[步骤E] MemProcFS 进程 spawn 成功");
            let process_id = if image_path == "vmware" || image_path == "livekd" {
                debug_info!("🔍 等待MemProcFS进程启动...");
                tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;
                let pid = find_memprocfs_process_id().unwrap_or(0);
                if pid == 0 {
                    debug_info!("⚠️ 未找到MemProcFS进程");
                } else {
                    debug_info!("✅ 找到MemProcFS进程ID: {}", pid);
                }
                pid
            } else {
                child.id().unwrap_or(0)
            };
            debug_info!("MemProcFS 异步启动成功，进程ID: {}", process_id);

            // 立即并行启动 vol2 profile 检测（不等待 MemProcFS 完成，不做条件判断）
            if image_path != "vmware" && image_path != "livekd" {
                debug_info!("[Profile] 立即启动后台 vol2 profile 检测（与 MemProcFS 并行）");

                if let Some(app) = &app_handle {
                    let profile_start_event = CommandEvent {
                        id: generate_command_id(),
                        name: "Profile检测".to_string(),
                        command: "正在使用 Volatility2 获取Profile".to_string(),
                        status: "running".to_string(),
                        output: Some("正在执行 vol2 imageinfo 获取Profile...".to_string()),
                        error: None,
                        time: get_current_time(),
                    };
                    let _ = app.emit("command-event", &profile_start_event);
                }

                let settings_for_vol2 = settings.clone();
                let image_path_for_vol2 = image_path.to_string();
                let app_handle_for_vol2 = app_handle.clone();

                tokio::spawn(async move {
                    debug_info!("[*] 后台开始 vol2 profile 检测");
                    match get_profile_info(
                        &settings_for_vol2,
                        &image_path_for_vol2,
                        app_handle_for_vol2.clone(),
                    )
                    .await
                    {
                        Ok(info) => {
                            if !info.profile_list.is_empty() {
                                debug_info!("[*] 后台Profile检测完成: {:?}", info);

                                if let Some(app) = &app_handle_for_vol2 {
                                    let profile_event = CommandEvent {
                                        id: generate_command_id(),
                                        name: "Profile检测".to_string(),
                                        command: "Profile检测完成".to_string(),
                                        status: "completed".to_string(),
                                        output: Some(format!(
                                            "检测到Profile: {:?}",
                                            info.profile_list
                                        )),
                                        error: None,
                                        time: get_current_time(),
                                    };
                                    let _ = app.emit("command-event", &profile_event);

                                    let _ = app.emit(
                                        "profile_detection_success",
                                        json!({
                                            "detected_os": info.detected_os,
                                            "suggested_profile": info.suggested_profile,
                                            "profile_list": info.profile_list
                                        }),
                                    );
                                }
                            } else {
                                debug_info!("[-] 后台Profile检测完成但未检测到有效Profile");
                                if let Some(app) = &app_handle_for_vol2 {
                                    let _ = app.emit(
                                        "profile_detection_failed",
                                        json!({
                                            "reason": "no_valid_profile_detected",
                                            "message": "Profile检测完成但未检测到有效Profile"
                                        }),
                                    );
                                }
                            }
                        }
                        Err(e) => {
                            debug_info!("[-] 后台Profile检测失败: {}", e);
                            if let Some(app) = &app_handle_for_vol2 {
                                let _ = app.emit(
                                    "profile_detection_failed",
                                    json!({
                                        "reason": "profile_detection_error",
                                        "message": format!("Profile检测失败: {}", e)
                                    }),
                                );
                            }
                        }
                    }
                });
            }

            let stdout = if image_path != "vmware" && image_path != "livekd" {
                child.stdout.take()
            } else {
                None
            };
            let stderr = if image_path != "vmware" && image_path != "livekd" {
                child.stderr.take()
            } else {
                None
            };

            let mut captured_output = String::new();
            let mut windows_10_detected = false;
            let mut detected_profile: Option<String> = None;
            let mut vol2_disabled = false;

            let timeout_duration = if is_arm64_system() {
                tokio::time::Duration::from_secs(1200)
            } else {
                tokio::time::Duration::from_secs(600)
            };
            let start_time = tokio::time::Instant::now();

            let force_completion_timeout = if is_arm64_system() {
                tokio::time::Duration::from_secs(1800)
            } else {
                tokio::time::Duration::from_secs(900)
            };

            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

            // 使用 Box::pin 将大型 async 闭包从栈移到堆，防止 stack overflow
            let mut stdout_task: Option<
                std::pin::Pin<
                    Box<
                        dyn std::future::Future<Output = (String, bool, Option<String>, bool)>
                            + Send,
                    >,
                >,
            > = None;
            let mut stderr_task: Option<
                std::pin::Pin<Box<dyn std::future::Future<Output = (String, bool)> + Send>>,
            > = None;

            // 共享完成标志：当任一任务检测到 MemProcFS 完成时设置为 true，
            // 另一个任务检查此标志后也会退出，避免 tokio::join! 被阻塞 300 秒
            let completion_flag = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));

            if let Some(stdout) = stdout {
                let mut reader = BufReader::new(stdout);
                let app_handle_stdout = app_handle.clone();
                let settings_clone = settings.clone();
                let completion_flag_stdout = completion_flag.clone();
                stdout_task = Some(Box::pin(async move {
                    let mut stdout_output = String::new();
                    let mut _line_count = 0;
                    let mut finished = false;
                    let mut local_windows_10_detected = false;
                    let mut local_detected_profile: Option<String> = None;
                    let mut local_vol2_disabled = false;
                    let mut buffer = Vec::new();

                    while !finished {
                        // 检查另一个任务是否已检测到完成
                        if completion_flag_stdout.load(std::sync::atomic::Ordering::SeqCst) {
                            debug_info!("[STDOUT] 检测到共享完成标志，退出读取");
                            break;
                        }
                        buffer.clear();
                        match reader.read_until(b'\n', &mut buffer).await {
                            Ok(0) => {
                                debug_info!("stdout 读取完成，共读取 {} 行", _line_count);
                                break;
                            }
                            Ok(_) => {
                                let line = String::from_utf8_lossy(&buffer);
                                let line = line.trim_end_matches('\n').trim_end_matches('\r');

                                let line = if line.contains('\u{FFFD}') {
                                    decode_with_fallback(&buffer)
                                } else {
                                    line.to_string()
                                };

                                if !line.is_empty() {
                                    debug_info!("[STDOUT] {}", line);
                                    stdout_output.push_str(&format!("{}\n", line));
                                    _line_count += 1;

                                    if let Some(app) = &app_handle_stdout {
                                        let output_event = CommandEvent {
                                            id: generate_command_id(),
                                            name: "MemProcFS 输出".to_string(),
                                            command: "MemProcFS 实时输出".to_string(),
                                            status: "running".to_string(),
                                            output: Some(line.clone()),
                                            error: None,
                                            time: get_current_time(),
                                        };
                                        let _ = app.emit("command-event", &output_event);
                                    }

                                    // 检测 Windows 10
                                    if line.contains("Windows 10") {
                                        debug_info!("[*] 检测到Windows 10");
                                        local_windows_10_detected = true;

                                        if let Some((profile, vol2_dis)) =
                                            extract_windows_10_version_and_profile(&line)
                                        {
                                            local_detected_profile = Some(profile.clone());
                                            local_vol2_disabled = vol2_dis;

                                            if let Some(app) = &app_handle_stdout {
                                                let _ = app.emit(
                                                    "windows_10_profile_detected",
                                                    json!({
                                                        "profile": profile,
                                                        "vol2_disabled": vol2_dis
                                                    }),
                                                );
                                            }
                                        }
                                    }

                                    // 检查完成标识符
                                    if is_memprocfs_completed(&line)
                                        || check_arm64_completion_indicators(&line, 0)
                                    {
                                        debug_info!("[*] 检测到 MemProcFS 完成标识符");

                                        if let Some(app) = &app_handle_stdout {
                                            let success_event = CommandEvent {
                                                id: generate_command_id(),
                                                name: "MemProcFS 加载完成".to_string(),
                                                command: "MemProcFS forensic mode completed"
                                                    .to_string(),
                                                status: "completed".to_string(),
                                                output: Some(
                                                    "MemProcFS 已完成内存镜像加载和分析"
                                                        .to_string(),
                                                ),
                                                error: None,
                                                time: get_current_time(),
                                            };
                                            let _ = app.emit("command-event", &success_event);

                                            // 触发脚本执行
                                            let app_clone = app.clone();
                                            tokio::spawn(async move {
                                                debug_info!(
                                                    "🐍 内存镜像加载完成，开始执行自动脚本..."
                                                );
                                                let manager =
                                                    crate::script_manager::create_script_manager();
                                                match manager
                                                    .execute_all_enabled_scripts(Some(
                                                        app_clone.clone(),
                                                    ))
                                                    .await
                                                {
                                                    Ok(results) => {
                                                        debug_info!(
                                                            "🐍 脚本自动执行完成，共 {} 个结果",
                                                            results.len()
                                                        );
                                                        let _ = app_clone.emit(
                                                            "scripts-auto-execution-completed",
                                                            &results,
                                                        );
                                                    }
                                                    Err(e) => {
                                                        debug_info!("❌ 脚本自动执行失败: {}", e);
                                                        let _ = app_clone.emit(
                                                            "scripts-auto-execution-error",
                                                            &e,
                                                        );
                                                    }
                                                }
                                            });
                                        }

                                        // 复制文件
                                        debug_info!("[*] 开始复制 forensic 文件...");
                                        match tokio::time::timeout(
                                            tokio::time::Duration::from_secs(30),
                                            copy_forensic_files(&settings_clone),
                                        )
                                        .await
                                        {
                                            Ok(Ok(msg)) => {
                                                debug_info!("[✓] 文件复制成功: {}", msg);
                                                stdout_output.push_str(&format!(
                                                    "[✓] 文件复制成功: {}\n",
                                                    msg
                                                ));
                                            }
                                            Ok(Err(e)) => {
                                                debug_info!("[-] 文件复制失败: {}", e);
                                                stdout_output.push_str(&format!(
                                                    "[-] 文件复制失败: {}\n",
                                                    e
                                                ));
                                            }
                                            Err(_) => {
                                                debug_info!("[-] 文件复制超时");
                                                stdout_output.push_str("[-] 文件复制超时\n");
                                            }
                                        }
                                        // 设置共享完成标志，通知 stderr 任务退出
                                        completion_flag_stdout
                                            .store(true, std::sync::atomic::Ordering::SeqCst);
                                        finished = true;
                                    }
                                }
                            }
                            Err(e) => {
                                debug_info!("读取 stdout 出错: {}", e);
                                continue;
                            }
                        }
                    }
                    (
                        stdout_output,
                        local_windows_10_detected,
                        local_detected_profile,
                        local_vol2_disabled,
                    )
                }));
            }

            if let Some(stderr) = stderr {
                let mut reader = BufReader::new(stderr);
                let app_handle_stderr = app_handle.clone();
                let settings_clone = settings.clone();
                let completion_flag_stderr = completion_flag.clone();
                stderr_task = Some(Box::pin(async move {
                    let mut stderr_output = String::new();
                    let mut finished = false;
                    let mut local_windows_10_detected = false;
                    let mut buffer = Vec::new();

                    while !finished {
                        // 检查共享完成标志（stdout 任务可能已检测到完成）
                        if completion_flag_stderr.load(std::sync::atomic::Ordering::SeqCst) {
                            debug_info!("[STDERR] 检测到共享完成标志，退出读取");
                            break;
                        }
                        buffer.clear();
                        // 用 5 秒超时读取，定期检查完成标志
                        match tokio::time::timeout(
                            tokio::time::Duration::from_secs(5),
                            reader.read_until(b'\n', &mut buffer),
                        )
                        .await
                        {
                            Ok(Ok(0)) => break,
                            Ok(Ok(_)) => {
                                let line = String::from_utf8_lossy(&buffer);
                                let line = line.trim_end_matches('\n').trim_end_matches('\r');

                                let line = if line.contains('\u{FFFD}') {
                                    decode_with_fallback(&buffer)
                                } else {
                                    line.to_string()
                                };

                                if !line.is_empty() {
                                    debug_info!("[STDERR] {}", line);
                                    stderr_output.push_str(&format!("{}\n", line));

                                    if let Some(app) = &app_handle_stderr {
                                        let error_event = CommandEvent {
                                            id: generate_command_id(),
                                            name: "MemProcFS 错误输出".to_string(),
                                            command: "MemProcFS 实时错误输出".to_string(),
                                            status: "running".to_string(),
                                            output: None,
                                            error: Some(line.clone()),
                                            time: get_current_time(),
                                        };
                                        let _ = app.emit("command-event", &error_event);
                                    }

                                    if line.contains("Windows 10") {
                                        local_windows_10_detected = true;
                                    }

                                    if is_memprocfs_completed(&line)
                                        || check_arm64_completion_indicators(&line, 0)
                                    {
                                        debug_info!("[*] 检测到 MemProcFS 完成标识符（stderr）");

                                        if let Some(app) = &app_handle_stderr {
                                            let success_event = CommandEvent {
                                                id: generate_command_id(),
                                                name: "MemProcFS 加载完成".to_string(),
                                                command: "MemProcFS forensic mode completed"
                                                    .to_string(),
                                                status: "completed".to_string(),
                                                output: Some(
                                                    "MemProcFS 已完成内存镜像加载和分析"
                                                        .to_string(),
                                                ),
                                                error: None,
                                                time: get_current_time(),
                                            };
                                            let _ = app.emit("command-event", &success_event);

                                            let app_clone = app.clone();
                                            tokio::spawn(async move {
                                                let manager =
                                                    crate::script_manager::create_script_manager();
                                                let _ = manager
                                                    .execute_all_enabled_scripts(Some(app_clone))
                                                    .await;
                                            });
                                        }

                                        match tokio::time::timeout(
                                            tokio::time::Duration::from_secs(30),
                                            copy_forensic_files(&settings_clone),
                                        )
                                        .await
                                        {
                                            Ok(Ok(msg)) => {
                                                stderr_output.push_str(&format!("[✓] {}\n", msg))
                                            }
                                            Ok(Err(e)) => {
                                                stderr_output.push_str(&format!("[-] {}\n", e))
                                            }
                                            Err(_) => stderr_output.push_str("[-] 文件复制超时\n"),
                                        }
                                        // 设置共享完成标志，通知 stdout 任务退出
                                        completion_flag_stderr
                                            .store(true, std::sync::atomic::Ordering::SeqCst);
                                        finished = true;
                                    }
                                }
                            }
                            Ok(Err(e)) => {
                                debug_info!("读取 stderr 出错: {}", e);
                                continue;
                            }
                            Err(_) => {
                                // 读取超时，继续循环检查完成标志
                                continue;
                            }
                        }
                    }
                    (stderr_output, local_windows_10_detected)
                }));
            }

            // 等待任务完成
            match tokio::time::timeout(timeout_duration, async {
                let mut stdout_result = (String::new(), false, None::<String>, false);
                let mut stderr_result = (String::new(), false);

                match (stdout_task, stderr_task) {
                    (Some(stdout), Some(stderr)) => {
                        let (stdout_res, stderr_res) = tokio::join!(stdout, stderr);
                        stdout_result = stdout_res;
                        stderr_result = stderr_res;
                    }
                    (Some(stdout), None) => {
                        stdout_result = stdout.await;
                    }
                    (None, Some(stderr)) => {
                        stderr_result = stderr.await;
                    }
                    (None, None) => {}
                }

                (stdout_result, stderr_result)
            })
            .await
            {
                Ok((stdout_result, stderr_result)) => {
                    captured_output.push_str(&stdout_result.0);
                    captured_output.push_str(&stderr_result.0);
                    windows_10_detected = stdout_result.1 || stderr_result.1;

                    if let Some(profile) = stdout_result.2 {
                        detected_profile = Some(profile);
                        vol2_disabled = stdout_result.3;
                    }
                }
                Err(_) => {
                    let elapsed = start_time.elapsed();
                    debug_info!("读取输出超时，已运行 {:?}", elapsed);

                    if is_arm64_system() && elapsed >= force_completion_timeout {
                        captured_output
                            .push_str(&format!("[ARM64 强制完成] 运行时间 {:?}\n", elapsed));
                    } else {
                        captured_output.push_str("读取输出超时\n");
                    }
                }
            }

            // 处理虚拟机/本机内存模式
            if image_path == "vmware" || image_path == "livekd" {
                let mode_name = if image_path == "vmware" {
                    "虚拟机内存镜像"
                } else {
                    "本机内存"
                };
                debug_info!("🖥️ {}模式，开始检测加载状态...", mode_name);

                let forensic_file_path = format!(
                    "{}forensic\\ntfs\\ntfs_files.txt",
                    crate::settings::mount_root()
                );
                let mut loading_success = false;
                let mut check_count = 0;
                let max_checks = 60;

                if let Some(ref app) = app_handle {
                    let loading_event = CommandEvent {
                        id: generate_command_id(),
                        name: format!("{}加载", mode_name),
                        command: format!("正在加载{}...", mode_name),
                        status: "running".to_string(),
                        output: Some("正在检测加载状态...".to_string()),
                        error: None,
                        time: get_current_time(),
                    };
                    let _ = app.emit("command-event", &loading_event);
                }

                while check_count < max_checks && !loading_success {
                    tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
                    check_count += 1;

                    if std::path::Path::new(&forensic_file_path).exists() {
                        loading_success = true;
                        debug_info!("✅ 检测到文件 {}，加载成功！", forensic_file_path);

                        if let Some(ref app) = app_handle {
                            let success_event = CommandEvent {
                                id: generate_command_id(),
                                name: format!("{}加载", mode_name),
                                command: format!("{}加载完成", mode_name),
                                status: "completed".to_string(),
                                output: Some(format!(
                                    "加载成功！检测到文件: {}",
                                    forensic_file_path
                                )),
                                error: None,
                                time: get_current_time(),
                            };
                            let _ = app.emit("command-event", &success_event);
                        }
                        break;
                    }
                }

                let result = if loading_success {
                    LoadMemResult {
                        success: true,
                        message: format!("{}模式加载成功，进程ID: {}", mode_name, process_id),
                        process_id: Some(process_id),
                        command: full_command.clone(),
                        output: format!(
                            "{}模式加载成功 (PID: {})\n用时: {}秒",
                            mode_name, process_id, check_count
                        ),
                        error: String::new(),
                        profile_info: None,
                    }
                } else {
                    LoadMemResult {
                        success: false,
                        message: format!("{}模式加载超时", mode_name),
                        process_id: Some(process_id),
                        command: full_command.clone(),
                        output: format!("{}模式启动但加载超时", mode_name),
                        error: format!("加载超时，等待{}秒后未检测到文件", max_checks),
                        profile_info: None,
                    }
                };

                return Ok(result);
            }

            // Windows 10 信息仅用于前端显示（vol2 已在上方并行启动，不再做条件判断）
            if windows_10_detected {
                debug_info!("[*] 已检测到Windows 10");
                if let Some(profile) = &detected_profile {
                    if let Some(ref app) = app_handle {
                        let _ = app.emit(
                            "windows_10_profile_ready",
                            json!({
                                "profile": profile,
                                "vol2_disabled": vol2_disabled
                            }),
                        );
                    }
                }
            }

            let final_output = if captured_output.is_empty() {
                format!("MemProcFS 启动成功 (PID: {})\n进程正在后台运行", process_id)
            } else {
                format!(
                    "MemProcFS 启动成功 (PID: {})\n{}",
                    process_id, captured_output
                )
            };

            // 验证挂载是否真正成功:进程可能已启动但挂载失败/超时,此时不应报“成功”
            if verify_memprocfs_mounted().await {
                Ok(LoadMemResult {
                    success: true,
                    message: format!("MemProcFS 启动成功，进程ID: {}", process_id),
                    process_id: Some(process_id),
                    command: full_command,
                    output: final_output,
                    error: String::new(),
                    profile_info: None,
                })
            } else {
                Ok(LoadMemResult {
                    success: false,
                    message: format!(
                        "MemProcFS 进程已启动(PID: {})，但未检测到挂载盘 M:，加载可能失败",
                        process_id
                    ),
                    process_id: Some(process_id),
                    command: full_command,
                    output: final_output,
                    error: "未检测到 MemProcFS 挂载盘(M:)。可能原因:镜像格式不受支持、镜像损坏、或挂载被占用/失败。请检查镜像或重试。".to_string(),
                    profile_info: None,
                })
            }
        }
        Err(e) => {
            let mut error_msg = format!("启动 MemProcFS 失败: {}", e);

            if is_arm64_system() {
                error_msg.push_str(&format!(
                    "\n\n[ARM64 兼容性提示]\n- 当前系统架构: {}",
                    get_system_arch()
                ));
            }

            Ok(LoadMemResult {
                success: false,
                message: error_msg.clone(),
                process_id: None,
                command: full_command,
                output: String::new(),
                error: error_msg,
                profile_info: None,
            })
        }
    }
}
