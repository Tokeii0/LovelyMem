//! MemNixFS Linux 内存镜像加载命令模块
//!
//! 提供 Linux 内存镜像加载、卸载、状态检查与关键取证报告导出的 Tauri 命令包装

use crate::memnixfs;
use crate::settings;

/// 加载 Linux 内存镜像（通过 MemNixFS 挂载）
#[tauri::command]
pub async fn load_linux_memory_image(
    app: tauri::AppHandle,
    image_path: String,
) -> Result<memnixfs::LinuxLoadResult, String> {
    debug_info!("========== load_linux_memory_image 开始 ==========");
    debug_info!("镜像路径: {}", image_path);

    let settings = match settings::load_settings() {
        Ok(s) => s,
        Err(e) => {
            debug_error!("[MemNixFS] 设置加载失败: {}", e);
            return Err(e);
        }
    };

    let result = memnixfs::load_linux_memory_image(&settings, &image_path, Some(app)).await;
    match &result {
        Ok(r) => debug_info!(
            "[MemNixFS] load_linux_memory_image 完成: success={}, pid={:?}",
            r.success,
            r.process_id
        ),
        Err(e) => debug_error!("[MemNixFS] load_linux_memory_image 失败: {}", e),
    }
    debug_info!("========== load_linux_memory_image 结束 ==========");
    result
}

/// 检查 memnixfs 进程状态
#[tauri::command]
pub fn check_memnixfs_status(process_id: u32) -> bool {
    memnixfs::check_memnixfs_status(process_id)
}

/// 停止 memnixfs 进程
#[tauri::command]
pub fn stop_memnixfs(process_id: u32) -> Result<bool, String> {
    memnixfs::stop_memnixfs(process_id)
}

/// 停止 memnixfs 进程并清空输出目录
#[tauri::command]
pub async fn stop_memnixfs_and_clear_output(process_id: u32) -> Result<String, String> {
    memnixfs::stop_memnixfs_and_clear_output(process_id).await
}

/// 导出关键取证报告到 output 目录（保留结构，带进度事件）
#[tauri::command]
pub async fn export_key_forensic_reports(app: tauri::AppHandle) -> Result<String, String> {
    memnixfs::file_ops::export_key_forensic_reports_retry(Some(app)).await
}

/// 探测内存镜像的操作系统类型，用于在主加载入口自动把 Linux 镜像路由到 MemNixFS。
/// 返回 "linux" | "windows" | "unknown"。
#[tauri::command]
pub async fn detect_memory_image_os(image_path: String) -> Result<String, String> {
    use std::io::Read;

    if !std::path::Path::new(&image_path).exists() {
        return Ok("unknown".to_string());
    }

    let mut head = [0u8; 16];
    let n = match std::fs::File::open(&image_path) {
        Ok(mut f) => f.read(&mut head).unwrap_or(0),
        Err(_) => 0,
    };
    let head = &head[..n];

    if head.len() >= 4 {
        // LiME 魔数 0x4C694D45（磁盘小端序为 "EMiL"；兼容直接写 "LiME"）
        if &head[0..4] == b"EMiL" || &head[0..4] == b"LiME" {
            return Ok("linux".to_string());
        }
        // AVML
        if &head[0..4] == b"AVML" {
            return Ok("linux".to_string());
        }
        // ELF（vmcore / ELF core，Linux）
        if head[0] == 0x7F && &head[1..4] == b"ELF" {
            return Ok("linux".to_string());
        }
    }

    // Windows 崩溃转储魔数（PAGEDUMP / PAGEDU64）
    if head.len() >= 8 && head.starts_with(b"PAGEDU") {
        return Ok("windows".to_string());
    }

    // 回退：按扩展名
    let lower = image_path.to_lowercase();
    if lower.ends_with(".lime")
        || lower.ends_with(".avml")
        || lower.ends_with(".core")
        || lower.ends_with(".vmcore")
    {
        return Ok("linux".to_string());
    }

    Ok("unknown".to_string())
}
