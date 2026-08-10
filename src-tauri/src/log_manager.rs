//! 日志管理模块
//!
//! 提供前端日志记录和日志文件管理功能

use crate::settings;

/// 前端日志写入（仅控制台输出，已禁用文件写入）
#[tauri::command]
pub async fn write_frontend_log(
    level: String,
    message: String,
    timestamp: String,
) -> Result<(), String> {
    // 仅在控制台输出日志，不写入文件
    debug_info!(
        "前端日志: [{}] [{}] {}",
        timestamp,
        level.to_uppercase(),
        message
    );

    // 直接返回成功，不进行任何文件操作
    Ok(())
}

/// 获取日志文件列表
#[tauri::command]
pub async fn get_log_files() -> Result<Vec<serde_json::Value>, String> {
    use std::fs;

    let app_data_dir =
        settings::get_app_data_dir().map_err(|e| format!("获取应用数据目录失败: {}", e))?;

    if !app_data_dir.exists() {
        return Ok(Vec::new());
    }

    let mut log_files = Vec::new();

    let entries =
        fs::read_dir(&app_data_dir).map_err(|e| format!("读取应用数据目录失败: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("读取目录项失败: {}", e))?;
        let path = entry.path();

        if path.is_file()
            && path.extension().map_or(false, |ext| ext == "log")
            && path.file_name().map_or(false, |name| {
                let name_str = name.to_string_lossy();
                name_str.starts_with("frontend-")
                    || name_str.starts_with("csv-viewer-")
                    || name_str.starts_with("text-viewer-")
            })
        {
            let metadata = fs::metadata(&path).map_err(|e| format!("获取文件元数据失败: {}", e))?;

            let file_info = serde_json::json!({
                "name": path.file_name().unwrap_or_default().to_string_lossy(),
                "path": path.to_string_lossy(),
                "size": metadata.len(),
                "modified": metadata.modified()
                    .map(|time| {
                        let datetime: chrono::DateTime<chrono::Utc> = time.into();
                        datetime.format("%Y-%m-%d %H:%M:%S").to_string()
                    })
                    .unwrap_or_else(|_| "未知".to_string())
            });

            log_files.push(file_info);
        }
    }

    // 按修改时间排序，最新的在前
    log_files.sort_by(|a, b| {
        let b_time = b.get("modified").and_then(|v| v.as_str()).unwrap_or("");
        let a_time = a.get("modified").and_then(|v| v.as_str()).unwrap_or("");
        b_time.cmp(a_time)
    });

    Ok(log_files)
}

/// 读取日志文件内容
#[tauri::command]
pub async fn read_log_file(file_path: String) -> Result<String, String> {
    use std::fs;

    let content = fs::read_to_string(&file_path).map_err(|e| format!("读取日志文件失败: {}", e))?;

    Ok(content)
}

/// 清空日志文件
#[tauri::command]
pub async fn clear_log_file(file_path: String) -> Result<(), String> {
    use std::fs;

    fs::write(&file_path, "").map_err(|e| format!("清空日志文件失败: {}", e))?;

    Ok(())
}

/// 清空所有日志文件
#[tauri::command]
pub async fn clear_all_logs() -> Result<(), String> {
    use std::fs;

    let app_data_dir =
        settings::get_app_data_dir().map_err(|e| format!("获取应用数据目录失败: {}", e))?;

    if !app_data_dir.exists() {
        return Ok(());
    }

    let entries =
        fs::read_dir(&app_data_dir).map_err(|e| format!("读取应用数据目录失败: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("读取目录项失败: {}", e))?;
        let path = entry.path();

        if path.is_file()
            && path.extension().map_or(false, |ext| ext == "log")
            && path.file_name().map_or(false, |name| {
                let name_str = name.to_string_lossy();
                name_str.starts_with("frontend-")
                    || name_str.starts_with("csv-viewer-")
                    || name_str.starts_with("text-viewer-")
            })
        {
            fs::remove_file(&path).map_err(|e| format!("删除日志文件失败: {}", e))?;
        }
    }

    Ok(())
}
