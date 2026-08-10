//! 进程管理模块
//!
//! 负责 MemProcFS 进程的查找、状态检查和停止

use crate::settings;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

/// 查找正在运行的 MemProcFS 进程 ID
pub fn find_memprocfs_process_id() -> Option<u32> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;

        // 使用 tasklist 查找 MemProcFS.exe 进程（wmic 已弃用）
        let output = Command::new("tasklist")
            .args(&["/FI", "IMAGENAME eq MemProcFS.exe", "/FO", "CSV", "/NH"])
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .output();

        match output {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                // CSV 格式: "MemProcFS.exe","PID","Session Name","Session#","Mem Usage"
                for line in stdout.lines() {
                    let trimmed = line.trim();
                    if trimmed.contains("MemProcFS.exe") {
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
                debug_info!("查找MemProcFS进程失败: {}", e);
                None
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        use std::process::Command;

        // macOS/Linux 使用 pgrep 查找进程
        let output = Command::new("pgrep").arg("-f").arg("MemProcFS").output();

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
                debug_info!("查找MemProcFS进程失败: {}", e);
                None
            }
        }
    }
}

/// 检查 MemProcFS 进程是否在运行
pub fn check_memprocfs_status(process_id: u32) -> bool {
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

        // 使用 kill -0 检查进程是否存在
        let output = Command::new("kill")
            .args(&["-0", &process_id.to_string()])
            .output();

        match output {
            Ok(output) => output.status.success(),
            Err(_) => false,
        }
    }
}

/// 停止 MemProcFS 进程
pub fn stop_memprocfs(_process_id: u32) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;

        // 直接 kill 所有 MemProcFS.exe 进程
        let mut cmd = Command::new("taskkill");
        cmd.arg("/F").arg("/IM").arg("MemProcFS.exe");

        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

        let output = cmd
            .output()
            .map_err(|e| format!("执行taskkill命令失败: {}", e))?;

        Ok(output.status.success())
    }

    #[cfg(not(target_os = "windows"))]
    {
        use std::process::Command;

        // 首先尝试使用 pkill
        let output = Command::new("pkill").arg("-f").arg("MemProcFS").output();

        match output {
            Ok(output) => {
                if output.status.success() {
                    debug_info!("✅ 使用pkill成功停止MemProcFS进程");
                    Ok(true)
                } else {
                    // 如果 pkill 失败，尝试使用 killall
                    let killall_output = Command::new("killall")
                        .arg("MemProcFS")
                        .output()
                        .map_err(|e| format!("执行killall命令失败: {}", e))?;

                    if killall_output.status.success() {
                        debug_info!("✅ 使用killall成功停止MemProcFS进程");
                        Ok(true)
                    } else {
                        debug_info!("⚠️ 未找到运行中的MemProcFS进程");
                        Ok(false)
                    }
                }
            }
            Err(_) => {
                // 如果 pkill 命令不存在，尝试 killall
                let killall_output = Command::new("killall")
                    .arg("MemProcFS")
                    .output()
                    .map_err(|e| format!("执行killall命令失败: {}", e))?;

                if killall_output.status.success() {
                    debug_info!("✅ 使用killall成功停止MemProcFS进程");
                    Ok(true)
                } else {
                    debug_info!("⚠️ 未找到运行中的MemProcFS进程");
                    Ok(false)
                }
            }
        }
    }
}

/// 停止 MemProcFS 进程并清空输出目录
pub async fn stop_memprocfs_and_clear_output(process_id: u32) -> Result<String, String> {
    // 首先停止进程
    let stop_result = stop_memprocfs(process_id)?;

    // 然后清空输出目录
    let settings = settings::load_settings()?;
    let clear_result = super::file_ops::clear_output_directory(&settings.output_path).await?;

    if stop_result {
        Ok(format!("进程已停止，{}", clear_result))
    } else {
        Ok(format!("进程未找到或已停止，{}", clear_result))
    }
}
