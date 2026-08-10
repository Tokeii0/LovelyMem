//! 进程管理模块
//!
//! 提供进程监控、结束进程和强制清理等功能

use crate::loadmem;
use crate::settings;

/// 进程信息结构
#[derive(serde::Serialize)]
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
    pub command_line: String,
}

/// 获取监控的进程列表
#[tauri::command]
pub async fn get_monitored_processes() -> Result<Vec<ProcessInfo>, String> {
    let target_processes = vec!["memprocfs", "memnixfs", "python", "python27", "python3"];

    let start_time = std::time::Instant::now();

    // 使用 spawn_blocking 因为 sysinfo 操作不是 async 的
    let processes = tokio::task::spawn_blocking(move || {
        use sysinfo::{ProcessRefreshKind, RefreshKind, System};

        // 仅刷新进程信息，避免不必要的开销
        let sys = System::new_with_specifics(
            RefreshKind::new().with_processes(ProcessRefreshKind::everything()),
        );

        let mut found_processes = Vec::new();

        for (pid, process) in sys.processes() {
            let name = process.name().to_lowercase();
            let name_no_ext = name.trim_end_matches(".exe");

            // 检查是否是目标进程（忽略大小写）
            if target_processes
                .iter()
                .any(|&target| name_no_ext == target || name == target)
            {
                // 获取命令行
                let command_line = process.cmd().join(" ");

                found_processes.push(ProcessInfo {
                    pid: pid.as_u32(),
                    name: process.name().to_string(),
                    command_line: if command_line.is_empty() {
                        "N/A".to_string()
                    } else {
                        command_line
                    },
                });
            }
        }

        found_processes
    })
    .await
    .map_err(|e| format!("获取进程列表失败: {}", e))?;

    let _total_elapsed = start_time.elapsed();

    Ok(processes)
}

/// 通过 PID 结束进程
#[tauri::command]
pub fn kill_process_by_pid(pid: u32) -> Result<String, String> {
    use sysinfo::{Pid, System};

    let mut sys = System::new();

    let pid_sys = Pid::from(pid as usize);

    // 刷新指定进程
    sys.refresh_process(pid_sys);

    if let Some(process) = sys.process(pid_sys) {
        if process.kill() {
            Ok(format!("进程 {} 已成功结束", pid))
        } else {
            Err(format!("无法结束进程 {}，可能权限不足", pid))
        }
    } else {
        // 如果 sysinfo 找不到，尝试用 taskkill 作为回退（仅 Windows）
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            use std::process::Command;

            let result = Command::new("taskkill")
                .args(&["/F", "/PID", &pid.to_string()])
                .creation_flags(0x08000000) // CREATE_NO_WINDOW
                .output();

            match result {
                Ok(output) => {
                    if output.status.success() {
                        Ok(format!("进程 {} 已成功结束 (via taskkill)", pid))
                    } else {
                        let stderr = String::from_utf8_lossy(&output.stderr);
                        Err(format!("结束进程失败 (sysinfo & taskkill): {}", stderr))
                    }
                }
                Err(e) => Err(format!("结束进程失败: {}", e)),
            }
        }

        #[cfg(not(target_os = "windows"))]
        Err(format!("找不到进程 {}", pid))
    }
}

/// 强制清理进程并可选清空输出目录
#[tauri::command]
pub async fn force_cleanup_and_clear(clear_output: bool) -> Result<String, String> {
    debug_info!("强制清理进程，clear_output: {}", clear_output);

    let mut results = Vec::new();

    // 强制停止所有相关进程
    debug_info!("开始强制停止进程");

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        use std::process::Command;

        let processes_to_kill = vec![
            "MemProcFS.exe",
            "memprocfs.exe",
            "memnixfs.exe",
            "python27.exe",
            "python.exe",
            "python3.exe",
        ];

        for process_name in processes_to_kill {
            let result = Command::new("taskkill")
                .args(&["/F", "/IM", process_name])
                .creation_flags(0x08000000) // CREATE_NO_WINDOW
                .output();

            match result {
                Ok(output) => {
                    let success = output.status.success();
                    if success {
                        debug_info!("已停止进程: {}", process_name);
                        results.push(format!("已停止进程: {}", process_name));
                    }
                }
                Err(e) => {
                    debug_warn!("停止 {} 失败: {}", process_name, e);
                }
            }
        }

        // 额外的强力清理：使用 PowerShell 查找并结束包含 memprocfs 的进程
        let powershell_result = Command::new("powershell")
            .args(&[
                "-Command",
                "Get-Process | Where-Object {{$_.ProcessName -like '*memprocfs*' -or $_.ProcessName -like '*MemProcFS*'} | Stop-Process -Force"
            ])
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .output();

        match powershell_result {
            Ok(output) => {
                if output.status.success() {
                    debug_info!("PowerShell 额外清理完成");
                    results.push("PowerShell 额外清理完成".to_string());
                }
            }
            Err(e) => {
                debug_warn!("PowerShell 清理失败: {}", e);
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        // 对于非Windows系统，使用killall命令
        use std::process::Command;

        let processes_to_kill = vec!["MemProcFS", "memnixfs", "python", "python3"];

        for process_name in processes_to_kill {
            let result = Command::new("killall").args(&["-9", process_name]).output();

            match result {
                Ok(output) => {
                    if output.status.success() {
                        debug_info!("[*] 已停止进程: {}", process_name);
                        results.push(format!("已停止进程: {}", process_name));
                    }
                }
                Err(e) => {
                    debug_info!("[-] 停止 {} 失败: {}", process_name, e);
                }
            }
        }
    }

    // 清空 settings.json 中的 current_image_path
    match settings::clear_current_image_path().await {
        Ok(_) => {
            results.push("已清空当前镜像路径".to_string());
        }
        Err(e) => {
            results.push(format!("清空当前镜像路径失败: {}", e));
        }
    }

    // 如果需要清空输出目录
    if clear_output {
        let settings = settings::load_settings()?;
        match loadmem::clear_output_directory_standalone(&settings.output_path).await {
            Ok(clear_msg) => {
                results.push(clear_msg);
            }
            Err(e) => {
                results.push(format!("清空输出目录失败: {}", e));
            }
        }
    }

    let final_result = if results.is_empty() {
        "强制清理完成，但没有找到需要停止的进程".to_string()
    } else {
        format!("强制清理完成: {}", results.join("; "))
    };

    debug_info!("[*] 强制清理完成: {}", final_result);
    Ok(final_result)
}
