//! 内存镜像加载命令模块
//!
//! 提供内存镜像加载、卸载和状态检查等 Tauri 命令包装

use crate::loadmem;
use crate::settings;

/// 加载内存镜像
#[tauri::command]
pub async fn load_memory_image(
    app: tauri::AppHandle,
    image_path: String,
) -> Result<loadmem::LoadMemResult, String> {
    debug_info!("========== load_memory_image 开始 ==========");
    debug_info!("镜像路径: {}", image_path);

    // 加载当前设置
    debug_info!("[步骤1] 加载设置...");
    let settings = match settings::load_settings() {
        Ok(s) => {
            debug_info!("[步骤1] 设置加载成功");
            debug_info!("  memprocfs_path: {}", s.memprocfs_path);
            debug_info!("  output_path: {}", s.output_path);
            debug_info!("  python3_path: {}", s.python3_path);
            s
        }
        Err(e) => {
            debug_error!("[步骤1] 设置加载失败: {}", e);
            return Err(e);
        }
    };

    // 调用loadmem模块的功能
    debug_info!("[步骤2] 调用 loadmem::load_memory_image...");
    let result = loadmem::load_memory_image(&settings, &image_path, Some(app)).await;

    match &result {
        Ok(r) => {
            debug_info!(
                "[完成] load_memory_image 成功: success={}, pid={:?}",
                r.success,
                r.process_id
            );
        }
        Err(e) => {
            debug_error!("[完成] load_memory_image 失败: {}", e);
        }
    }
    debug_info!("========== load_memory_image 结束 ==========");
    result
}

/// 加载远程内存镜像
#[tauri::command]
pub async fn load_remote_memory_image(
    app: tauri::AppHandle,
    remote_ip: String,
) -> Result<loadmem::LoadMemResult, String> {
    // 调用loadmem模块的远程内存加载功能
    loadmem::load_remote_memory_image(remote_ip, Some(app)).await
}

/// 检查 MemProcFS 进程状态
#[tauri::command]
pub fn check_memprocfs_status(process_id: u32) -> bool {
    loadmem::check_memprocfs_status(process_id)
}

/// 停止 MemProcFS 进程
#[tauri::command]
pub fn stop_memprocfs(process_id: u32) -> Result<bool, String> {
    loadmem::stop_memprocfs(process_id)
}

/// 停止 MemProcFS 并清空输出目录
#[tauri::command]
pub async fn stop_memprocfs_and_clear_output(process_id: u32) -> Result<String, String> {
    loadmem::stop_memprocfs_and_clear_output(process_id).await
}

/// 清空输出目录
#[tauri::command]
pub async fn clear_output_directory() -> Result<String, String> {
    let settings = settings::load_settings()?;
    loadmem::clear_output_directory_standalone(&settings.output_path).await
}

/// 重试复制取证文件
#[tauri::command]
pub async fn copy_forensic_files_retry() -> Result<String, String> {
    loadmem::copy_forensic_files_retry().await
}

/// 检查 M 盘（或其他平台对应的挂载点）是否可用
#[tauri::command]
pub fn check_m_drive_available() -> bool {
    #[cfg(target_os = "windows")]
    {
        // Windows系统检查配置的挂载盘符
        std::path::Path::new(&crate::settings::mount_root()).exists()
    }

    #[cfg(target_os = "macos")]
    {
        // macOS系统检查桌面MemProcFS目录
        let desktop_path = std::env::var("HOME")
            .map(|home| format!("{}/Desktop/MemProcFS", home))
            .unwrap_or_else(|_| "/Users/Shared/MemProcFS".to_string());
        std::path::Path::new(&desktop_path).exists()
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        // Linux系统检查常见挂载点
        std::path::Path::new("/mnt/memprocfs").exists()
            || std::path::Path::new("/tmp/memprocfs").exists()
    }
}
