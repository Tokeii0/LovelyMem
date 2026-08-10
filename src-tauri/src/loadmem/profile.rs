//! Profile 检测模块
//!
//! 负责使用 Volatility2 imageinfo 检测内存镜像的操作系统 Profile

use crate::AppSettings;
use serde_json::json;
use std::path::Path;
use std::process::Stdio;
use tauri::{AppHandle, Emitter};
use tokio::process::Command as TokioCommand;

use super::types::ProfileInfo;
use super::utils::{get_system_arch, is_arm64_system};

/// 获取内存镜像的 profile 信息
pub async fn get_profile_info(
    settings: &AppSettings,
    image_path: &str,
    app_handle: Option<AppHandle>,
) -> Result<ProfileInfo, String> {
    debug_info!("[*] 未检测到Windows 10，正在执行profile检测");

    // ARM64 系统特殊处理
    if is_arm64_system() {
        debug_info!("[*] ARM64 系统检测到，启用 Profile 检测兼容性模式");

        if let Some(ref app) = app_handle {
            let _ = app.emit(
                "arm64_profile_detection",
                json!({
                    "architecture": get_system_arch(),
                    "status": "starting",
                    "message": "ARM64 系统正在启动 Profile 检测兼容性模式"
                }),
            );
        }
    }

    // 检查是否设置了 python2 和 volatility 路径
    if settings.python2_path.is_empty() {
        debug_info!("[-] Python2路径未设置，跳过profile检测");

        if let Some(ref app) = app_handle {
            let _ = app.emit(
                "profile_detection_failed",
                json!({
                    "reason": "python2_path_not_set",
                    "message": "Python2路径未设置，Volatility2功能不可用"
                }),
            );
        }

        return Ok(ProfileInfo {
            detected_os: None,
            suggested_profile: None,
            profile_list: vec![],
        });
    }

    if settings.volatility2_path.is_empty() {
        debug_info!("[-] Volatility2路径未设置，跳过profile检测");
        return Ok(ProfileInfo {
            detected_os: None,
            suggested_profile: None,
            profile_list: vec![],
        });
    }

    // 检查 Python2 可执行文件是否存在
    if !Path::new(&settings.python2_path).exists() {
        debug_info!("[-] Python2可执行文件不存在: {}", settings.python2_path);
        return Ok(ProfileInfo {
            detected_os: None,
            suggested_profile: None,
            profile_list: vec![],
        });
    }

    // 检查 Volatility2 脚本文件是否存在
    if !Path::new(&settings.volatility2_path).exists() {
        debug_info!(
            "[-] Volatility2脚本文件不存在: {}",
            settings.volatility2_path
        );

        if let Some(ref app) = app_handle {
            let _ = app.emit(
                "profile_detection_failed",
                json!({
                    "reason": "volatility2_path_not_found",
                    "message": "Volatility2脚本文件不存在，Volatility2功能不可用"
                }),
            );
        }

        return Ok(ProfileInfo {
            detected_os: None,
            suggested_profile: None,
            profile_list: vec![],
        });
    }

    debug_info!("[*] Python2路径: {}", settings.python2_path);
    debug_info!("[*] Volatility2路径: {}", settings.volatility2_path);
    debug_info!("[*] 镜像文件路径: {}", image_path);
    debug_info!("[*] 正在执行imageinfo命令获取profile...");

    let full_imageinfo_command = format!(
        "{} {} -f \"{}\" imageinfo",
        settings.python2_path, settings.volatility2_path, image_path
    );
    debug_info!("[*] 执行的完整命令: {}", full_imageinfo_command);

    // 构建 volatility imageinfo 命令
    let mut cmd = TokioCommand::new(&settings.python2_path);
    cmd.arg(&settings.volatility2_path)
        .arg("-f")
        .arg(image_path)
        .arg("imageinfo")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null());

    // ARM64 系统特殊环境变量设置
    if is_arm64_system() {
        debug_info!("[*] ARM64 系统，设置兼容性环境变量");
        cmd.env("PYTHONIOENCODING", "utf-8")
            .env("PYTHONUTF8", "1")
            .env("PYTHONUNBUFFERED", "1");
    }

    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    match cmd.spawn() {
        Ok(child) => {
            let timeout_duration = if is_arm64_system() {
                debug_info!("[*] ARM64 系统，延长 imageinfo 超时时间到 2400 秒");
                tokio::time::Duration::from_secs(2400)
            } else {
                tokio::time::Duration::from_secs(1200)
            };

            let timeout_result =
                tokio::time::timeout(timeout_duration, child.wait_with_output()).await;
            match timeout_result {
                Ok(Ok(output)) => {
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    let stderr = String::from_utf8_lossy(&output.stderr);

                    debug_info!("[*] Volatility imageinfo 执行完成");
                    debug_info!("STDOUT: {}", stdout);
                    if !stderr.is_empty() {
                        debug_info!("STDERR: {}", stderr);
                    }

                    if output.status.success() {
                        let profile_info = parse_imageinfo_output(&stdout);
                        debug_info!("[*] 检测到的profile信息: {:?}", profile_info);
                        Ok(profile_info)
                    } else {
                        let mut error_msg = format!("imageinfo执行失败: {}", stderr);

                        if is_arm64_system() {
                            error_msg.push_str(&format!(
                                "\n\n[ARM64 Profile 检测失败]\n\
                                - 当前系统架构: {}\n\
                                - Python2 可能不兼容 ARM64 架构\n\
                                - Volatility2 可能不支持 ARM64 系统\n\
                                - 建议: 使用 x64 系统或通过兼容层运行",
                                get_system_arch()
                            ));

                            if let Some(ref app) = app_handle {
                                let _ = app.emit(
                                    "arm64_profile_detection_failed",
                                    json!({
                                        "architecture": get_system_arch(),
                                        "error": stderr.to_string(),
                                        "suggestions": [
                                            "Python2 可能不兼容 ARM64 架构",
                                            "Volatility2 可能不支持 ARM64 系统",
                                            "建议使用 x64 系统运行",
                                            "尝试通过兼容层运行 Python2"
                                        ]
                                    }),
                                );
                            }
                        }

                        debug_info!("[-] {}", error_msg);

                        if let Some(ref app) = app_handle {
                            let _ = app.emit(
                                "profile_detection_failed",
                                json!({
                                    "reason": "imageinfo_execution_failed",
                                    "message": "Profile检测执行失败，Volatility2功能不可用"
                                }),
                            );
                        }

                        Ok(ProfileInfo {
                            detected_os: None,
                            suggested_profile: None,
                            profile_list: vec![],
                        })
                    }
                }
                Ok(Err(e)) => {
                    debug_info!("[-] 等待imageinfo输出时出错: {}", e);

                    if let Some(ref app) = app_handle {
                        let _ = app.emit(
                            "profile_detection_failed",
                            json!({
                                "reason": "imageinfo_wait_error",
                                "message": "Profile检测等待输出时出错，Volatility2功能不可用"
                            }),
                        );
                    }

                    Ok(ProfileInfo {
                        detected_os: None,
                        suggested_profile: None,
                        profile_list: vec![],
                    })
                }
                Err(_) => {
                    debug_info!("[-] imageinfo执行超时");

                    if let Some(ref app) = app_handle {
                        let _ = app.emit(
                            "profile_detection_failed",
                            json!({
                                "reason": "imageinfo_execution_timeout",
                                "message": "Profile检测执行超时，Volatility2功能不可用"
                            }),
                        );
                    }

                    Ok(ProfileInfo {
                        detected_os: None,
                        suggested_profile: None,
                        profile_list: vec![],
                    })
                }
            }
        }
        Err(e) => {
            let error_msg = format!("启动Volatility imageinfo失败: {}", e);
            debug_info!("[-] {}", error_msg);
            debug_info!("[-] 命令: {}", full_imageinfo_command);
            debug_info!("[-] Python2路径: {}", settings.python2_path);
            debug_info!("[-] Volatility2路径: {}", settings.volatility2_path);
            debug_info!("[-] 镜像路径: {}", image_path);

            // 检查 Python2 文件是否存在
            match std::fs::metadata(&settings.python2_path) {
                Ok(metadata) => {
                    debug_info!(
                        "[-] Python2文件信息: 大小={} bytes, 是否为文件={}",
                        metadata.len(),
                        metadata.is_file()
                    );
                }
                Err(meta_e) => {
                    debug_info!("[-] 无法获取Python2文件信息: {}", meta_e);
                }
            }

            // 检查 Volatility2 文件是否存在
            match std::fs::metadata(&settings.volatility2_path) {
                Ok(metadata) => {
                    debug_info!(
                        "[-] Volatility2文件信息: 大小={} bytes, 是否为文件={}",
                        metadata.len(),
                        metadata.is_file()
                    );
                }
                Err(meta_e) => {
                    debug_info!("[-] 无法获取Volatility2文件信息: {}", meta_e);
                }
            }

            if let Some(ref app) = app_handle {
                let _ = app.emit(
                    "profile_detection_failed",
                    json!({
                        "reason": "imageinfo_startup_failed",
                        "message": "Profile检测启动失败，Volatility2功能不可用"
                    }),
                );
            }

            Ok(ProfileInfo {
                detected_os: None,
                suggested_profile: None,
                profile_list: vec![],
            })
        }
    }
}

/// 解析 imageinfo 输出获取 profile 信息
pub fn parse_imageinfo_output(output: &str) -> ProfileInfo {
    let mut detected_os = None;
    let mut suggested_profile = None;
    let mut profile_list = Vec::new();

    let lines: Vec<&str> = output.split('\n').collect();

    for line in lines {
        // 查找操作系统信息
        if line.contains("Operating System") {
            if let Some(os_part) = line.split(':').nth(1) {
                detected_os = Some(os_part.trim().to_string());
                debug_info!("[*] 检测到操作系统: {}", os_part.trim());
            }
        }

        // 查找建议的 profile
        if line.contains("Suggested Profile(s)") {
            if let Some(profiles_part) = line.split(':').nth(1) {
                let profiles_str = profiles_part.trim();
                let profiles: Vec<String> = profiles_str
                    .split(',')
                    .map(|p| p.trim().to_string())
                    .filter(|p| !p.is_empty())
                    .collect();

                if !profiles.is_empty() {
                    suggested_profile = Some(profiles[0].clone());
                    profile_list = profiles.clone();
                    debug_info!("[*] 建议的Profile: {}", profiles[0]);
                    debug_info!("[*] 所有可用Profile: {:?}", profiles);
                }
            }
        }
    }

    ProfileInfo {
        detected_os,
        suggested_profile,
        profile_list,
    }
}
