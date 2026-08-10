//! Dokan 环境状态检测

/// 检查 Dokan 状态（简单检测，用于启动时检查）
#[tauri::command]
pub async fn check_dokan_status() -> bool {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        use std::process::Command;

        // 执行 sc queryex dokan2
        let output = Command::new("sc")
            .args(&["queryex", "dokan2"])
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .output();

        match output {
            Ok(output) => {
                if output.status.success() {
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    // 只要能查询到状态（STATE），说明服务存在且已安装
                    // 无论是 RUNNING 还是 STOPPED，都视为环境存在
                    if stdout.contains("STATE") {
                        return true;
                    }
                    return false;
                }
                false
            }
            Err(_) => false,
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        true
    }
}
