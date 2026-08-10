use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};

#[derive(Debug, Serialize, Deserialize)]
pub struct MCPServerResponse {
    pub success: bool,
    pub message: String,
    pub port: Option<u16>,
}

/// MCP 服务器管理器
pub struct MCPServerManager {
    process: Arc<Mutex<Option<Child>>>,
    executable_path: PathBuf,
}

impl MCPServerManager {
    pub fn new() -> Self {
        // 获取 MCP 服务器可执行文件路径
        let executable_path = Self::get_mcp_server_path();

        Self {
            process: Arc::new(Mutex::new(None)),
            executable_path,
        }
    }

    /// 获取 MCP 服务器可执行文件路径
    fn get_mcp_server_path() -> PathBuf {
        // 获取当前可执行文件路径
        let current_exe = std::env::current_exe().unwrap_or_default();
        let app_dir = current_exe
            .parent()
            .unwrap_or_else(|| std::path::Path::new("."));

        // MCP 服务器应该在同一目录下
        let mcp_server_name = if cfg!(target_os = "windows") {
            "lovelymem-mcp-server.exe"
        } else {
            "lovelymem-mcp-server"
        };

        app_dir.join(mcp_server_name)
    }

    /// 启动 MCP 服务器
    pub fn start(&self) -> Result<MCPServerResponse, String> {
        let mut process_lock = self
            .process
            .lock()
            .map_err(|e| format!("锁定进程失败: {}", e))?;

        // 检查是否已经在运行
        if let Some(child) = process_lock.as_mut() {
            // 检查进程是否还在运行
            match child.try_wait() {
                Ok(Some(_)) => {
                    // 进程已经退出，清理
                    *process_lock = None;
                }
                Ok(None) => {
                    // 进程仍在运行
                    return Ok(MCPServerResponse {
                        success: true,
                        message: "MCP 服务器已在运行中".to_string(),
                        port: None,
                    });
                }
                Err(e) => {
                    return Err(format!("检查进程状态失败: {}", e));
                }
            }
        }

        // 检查可执行文件是否存在
        if !self.executable_path.exists() {
            return Err(format!(
                "MCP 服务器可执行文件不存在: {}",
                self.executable_path.display()
            ));
        }

        // 启动新进程
        let child = Command::new(&self.executable_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("启动 MCP 服务器失败: {}", e))?;

        debug_info!("✅ MCP 服务器已启动，PID: {:?}", child.id());

        *process_lock = Some(child);

        Ok(MCPServerResponse {
            success: true,
            message: format!("MCP 服务器已成功启动"),
            port: None,
        })
    }

    /// 停止 MCP 服务器
    pub fn stop(&self) -> Result<MCPServerResponse, String> {
        let mut process_lock = self
            .process
            .lock()
            .map_err(|e| format!("锁定进程失败: {}", e))?;

        if let Some(mut child) = process_lock.take() {
            // 尝试终止进程
            match child.kill() {
                Ok(_) => {
                    debug_info!("✅ MCP 服务器进程已终止");
                    Ok(MCPServerResponse {
                        success: true,
                        message: "MCP 服务器已停止".to_string(),
                        port: None,
                    })
                }
                Err(e) => Err(format!("终止 MCP 服务器失败: {}", e)),
            }
        } else {
            Ok(MCPServerResponse {
                success: true,
                message: "MCP 服务器未在运行".to_string(),
                port: None,
            })
        }
    }

    /// 检查 MCP 服务器是否在运行
    pub fn is_running(&self) -> bool {
        let mut process_lock = self.process.lock().unwrap_or_else(|e| e.into_inner());

        if let Some(child) = process_lock.as_mut() {
            match child.try_wait() {
                Ok(Some(_)) => {
                    // 进程已退出
                    *process_lock = None;
                    false
                }
                Ok(None) => {
                    // 进程仍在运行
                    true
                }
                Err(_) => {
                    // 检查失败，假设未运行
                    false
                }
            }
        } else {
            false
        }
    }
}

impl Drop for MCPServerManager {
    fn drop(&mut self) {
        // 当管理器被销毁时，停止 MCP 服务器
        let _ = self.stop();
    }
}

// 全局 MCP 服务器管理器实例
lazy_static::lazy_static! {
    static ref MCP_MANAGER: Arc<MCPServerManager> = Arc::new(MCPServerManager::new());
}

/// Tauri 命令：启动 MCP 服务器
#[tauri::command]
pub async fn start_mcp_server() -> Result<MCPServerResponse, String> {
    MCP_MANAGER.start()
}

/// Tauri 命令：停止 MCP 服务器
#[tauri::command]
pub async fn stop_mcp_server() -> Result<MCPServerResponse, String> {
    MCP_MANAGER.stop()
}

/// Tauri 命令：检查 MCP 服务器状态
#[tauri::command]
pub async fn check_mcp_server_status() -> Result<MCPServerResponse, String> {
    let is_running = MCP_MANAGER.is_running();

    Ok(MCPServerResponse {
        success: true,
        message: if is_running {
            "MCP 服务器正在运行".to_string()
        } else {
            "MCP 服务器未运行".to_string()
        },
        port: None,
    })
}
