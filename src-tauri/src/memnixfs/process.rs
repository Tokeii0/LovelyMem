//! MemNixFS 进程管理模块
//!
//! 负责 memnixfs 进程的查找、状态检查和停止（镜像 loadmem::process）

use crate::settings;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

/// 查找正在运行的 memnixfs 进程 ID
#[allow(dead_code)]
pub fn find_memnixfs_process_id() -> Option<u32> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;

        let output = Command::new("tasklist")
            .args(&["/FI", "IMAGENAME eq memnixfs.exe", "/FO", "CSV", "/NH"])
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .output();

        match output {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                for line in stdout.lines() {
                    let trimmed = line.trim();
                    if trimmed.to_lowercase().contains("memnixfs.exe") {
                        let fields: Vec<&str> = trimmed.split(',').collect();
                        if fields.len() >= 2 {
                            let pid_str = fields[1].trim_matches('"').trim();
                            if let Ok(pid) = pid_str.parse::<u32>() {
                                return Some(pid);
                            }
                        }
                    }
                }
                None
            }
            Err(e) => {
                debug_info!("查找MemNixFS进程失败: {}", e);
                None
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        use std::process::Command;

        let output = Command::new("pgrep").arg("-f").arg("memnixfs").output();

        match output {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                for line in stdout.lines() {
                    let trimmed = line.trim();
                    if !trimmed.is_empty() {
                        if let Ok(pid) = trimmed.parse::<u32>() {
                            return Some(pid);
                        }
                    }
                }
                None
            }
            Err(e) => {
                debug_info!("查找MemNixFS进程失败: {}", e);
                None
            }
        }
    }
}

/// 检查 memnixfs 进程是否在运行
pub fn check_memnixfs_status(process_id: u32) -> bool {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;

        let output = Command::new("tasklist")
            .args(&["/FI", &format!("PID eq {}", process_id)])
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .output();

        match output {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                stdout.contains(&process_id.to_string())
            }
            Err(_) => false,
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        use std::process::Command;

        let output = Command::new("kill")
            .args(&["-0", &process_id.to_string()])
            .output();

        match output {
            Ok(output) => output.status.success(),
            Err(_) => false,
        }
    }
}

/// 停止 memnixfs 进程（杀进程后 WinFsp/FUSE 会随之自动卸载挂载点）
pub fn stop_memnixfs(_process_id: u32) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;

        let mut cmd = Command::new("taskkill");
        cmd.arg("/F").arg("/IM").arg("memnixfs.exe");
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

        let output = cmd
            .output()
            .map_err(|e| format!("执行taskkill命令失败: {}", e))?;

        Ok(output.status.success())
    }

    #[cfg(not(target_os = "windows"))]
    {
        use std::process::Command;

        let output = Command::new("pkill").arg("-f").arg("memnixfs").output();

        match output {
            Ok(output) if output.status.success() => {
                debug_info!("✅ 使用pkill成功停止MemNixFS进程");
                Ok(true)
            }
            _ => {
                let killall_output = Command::new("killall")
                    .arg("memnixfs")
                    .output()
                    .map_err(|e| format!("执行killall命令失败: {}", e))?;

                if killall_output.status.success() {
                    debug_info!("✅ 使用killall成功停止MemNixFS进程");
                    Ok(true)
                } else {
                    debug_info!("⚠️ 未找到运行中的MemNixFS进程");
                    Ok(false)
                }
            }
        }
    }
}

/// 停止 memnixfs 进程并清空输出目录
pub async fn stop_memnixfs_and_clear_output(process_id: u32) -> Result<String, String> {
    let stop_result = stop_memnixfs(process_id)?;

    let settings = settings::load_settings()?;
    let clear_result =
        crate::loadmem::file_ops::clear_output_directory(&settings.output_path).await?;

    if stop_result {
        Ok(format!("进程已停止，{}", clear_result))
    } else {
        Ok(format!("进程未找到或已停止，{}", clear_result))
    }
}
