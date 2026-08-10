//! Python 环境管理模块
//!
//! 提供 Python 环境修复、包更新等功能

use crate::settings;
use tauri::Emitter;

/// 修复 MemProcFS Python 环境（带真实进度）
#[tauri::command]
pub async fn fix_memprocfs_python_env(app_handle: tauri::AppHandle) -> Result<String, String> {
    use std::path::Path;

    debug_info!("开始修复 MemProcFS Python 环境");

    // 加载设置
    let settings = settings::load_settings()?;

    if settings.memprocfs_path.is_empty() {
        return Err("MemProcFS 路径未配置".to_string());
    }

    if settings.python3_path.is_empty() {
        return Err("Python 3 路径未配置".to_string());
    }

    // 获取 MemProcFS 所在目录
    let memprocfs_file = Path::new(&settings.memprocfs_path);
    let memprocfs_dir = memprocfs_file
        .parent()
        .ok_or("无法获取 MemProcFS 所在目录".to_string())?;

    // 获取 Python3 所在目录
    let python3_file = Path::new(&settings.python3_path);
    let python3_dir = python3_file
        .parent()
        .ok_or("无法获取 Python 3 所在目录".to_string())?;

    // 目标 python 文件夹路径
    let target_python_dir = memprocfs_dir.join("python");

    debug_info!("源目录: {}", python3_dir.display());
    debug_info!("目标目录: {}", target_python_dir.display());

    let app_handle_clone = app_handle.clone();
    let source_dir = python3_dir.to_path_buf();
    let target_dir = target_python_dir.to_path_buf();

    let copy_result = tokio::task::spawn_blocking(move || {
        copy_python_env_with_progress(app_handle_clone, source_dir, target_dir)
    })
    .await
    .map_err(|e| format!("任务执行失败: {}", e))?;

    copy_result
}

/// 复制 Python 环境并上报进度
fn copy_python_env_with_progress(
    app_handle: tauri::AppHandle,
    source_dir: std::path::PathBuf,
    target_dir: std::path::PathBuf,
) -> Result<String, String> {
    use serde_json::json;
    use std::collections::VecDeque;
    use std::fs;
    use std::io::{Read, Write};
    use std::path::{Path, PathBuf};

    #[derive(Debug)]
    #[allow(dead_code)]
    struct CopyEntry {
        source: PathBuf,
        target: PathBuf,
        relative: PathBuf,
        is_dir: bool,
        size: u64,
    }

    #[derive(Debug)]
    struct ProgressState {
        total_bytes: u64,
        copied_bytes: u64,
        files_done: u64,
        total_files: u64,
    }

    fn emit_progress(
        app_handle: &tauri::AppHandle,
        percent: f64,
        status: &str,
        progress: &ProgressState,
        current_file: Option<&Path>,
        completed: bool,
        success: bool,
        message: Option<&str>,
    ) {
        let current_file_str = current_file.and_then(|p| p.to_str()).map(|s| s.to_string());
        let safe_percent = if percent.is_nan() {
            0.0
        } else {
            percent.min(100.0).max(0.0)
        };
        let payload = json!({
            "percent": (safe_percent * 100.0).round() / 100.0,
            "status": status,
            "copied_bytes": progress.copied_bytes,
            "total_bytes": progress.total_bytes,
            "files_done": progress.files_done,
            "files_total": progress.total_files,
            "current_file": current_file_str,
            "completed": completed,
            "success": success,
            "message": message,
        });

        if let Err(err) = app_handle.emit("fix-python-progress", payload) {
            debug_error!("发送进度事件失败: {}", err);
        }
    }

    fn collect_entries(source: &Path, target: &Path) -> Result<(Vec<CopyEntry>, u64, u64), String> {
        let mut entries = Vec::new();
        let mut total_bytes = 0u64;
        let mut total_files = 0u64;

        if !source.exists() {
            return Err(format!("源目录不存在: {}", source.display()));
        }

        let mut stack = VecDeque::new();
        stack.push_back(source.to_path_buf());

        while let Some(current) = stack.pop_front() {
            let relative = current
                .strip_prefix(source)
                .unwrap_or(Path::new(""))
                .to_path_buf();
            let target_path = if relative.as_os_str().is_empty() {
                target.to_path_buf()
            } else {
                target.join(&relative)
            };

            if relative.as_os_str().len() > 0 {
                entries.push(CopyEntry {
                    source: current.clone(),
                    target: target_path.clone(),
                    relative: relative.clone(),
                    is_dir: true,
                    size: 0,
                });
            }

            let read_dir = fs::read_dir(&current)
                .map_err(|e| format!("读取目录失败 {}: {}", current.display(), e))?;

            for entry in read_dir {
                let entry = entry.map_err(|e| format!("读取目录项失败: {}", e))?;
                let path = entry.path();
                let rel_path = path
                    .strip_prefix(source)
                    .unwrap_or(Path::new(""))
                    .to_path_buf();
                let target_path = target.join(&rel_path);
                let metadata = entry
                    .metadata()
                    .map_err(|e| format!("读取{} 元数据失败: {}", path.display(), e))?;

                if metadata.is_dir() {
                    entries.push(CopyEntry {
                        source: path.clone(),
                        target: target_path.clone(),
                        relative: rel_path.clone(),
                        is_dir: true,
                        size: 0,
                    });
                    stack.push_back(path);
                } else if metadata.is_file() {
                    let size = metadata.len();
                    entries.push(CopyEntry {
                        source: path.clone(),
                        target: target_path.clone(),
                        relative: rel_path.clone(),
                        is_dir: false,
                        size,
                    });
                    total_bytes += size;
                    total_files += 1;
                }
            }
        }

        Ok((entries, total_bytes, total_files))
    }

    fn copy_file_with_progress(
        entry: &CopyEntry,
        app_handle: &tauri::AppHandle,
        progress: &mut ProgressState,
    ) -> Result<(), String> {
        use std::fs::File;

        if let Some(parent) = entry.target.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("创建目录失败 {}: {}", parent.display(), e))?;
        }

        let mut source_file = File::open(&entry.source)
            .map_err(|e| format!("打开源文件失败 {}: {}", entry.source.display(), e))?;
        let mut target_file = File::create(&entry.target)
            .map_err(|e| format!("创建目标文件失败 {}: {}", entry.target.display(), e))?;

        let mut buffer = vec![0u8; 1024 * 1024];
        let mut _bytes_read_total = 0u64;

        loop {
            let bytes_read = source_file
                .read(&mut buffer)
                .map_err(|e| format!("读取文件失败 {}: {}", entry.source.display(), e))?;
            if bytes_read == 0 {
                break;
            }

            target_file
                .write_all(&buffer[..bytes_read])
                .map_err(|e| format!("写入文件失败 {}: {}", entry.target.display(), e))?;

            _bytes_read_total += bytes_read as u64;
            progress.copied_bytes += bytes_read as u64;

            let percent = if progress.total_bytes == 0 {
                100.0
            } else {
                progress.copied_bytes as f64 / progress.total_bytes as f64 * 100.0
            };

            emit_progress(
                app_handle,
                percent,
                "正在复制文件...",
                progress,
                Some(&entry.relative),
                false,
                true,
                None,
            );
        }

        // 成功复制一个文件
        progress.files_done += 1;

        let percent = if progress.total_bytes == 0 {
            100.0
        } else {
            progress.copied_bytes as f64 / progress.total_bytes as f64 * 100.0
        };

        emit_progress(
            app_handle,
            percent,
            "文件复制完成",
            progress,
            Some(&entry.relative),
            false,
            true,
            None,
        );

        Ok(())
    }

    // 开始复制
    if let Err(e) = fs::create_dir_all(&target_dir) {
        emit_progress(
            &app_handle,
            0.0,
            "创建目标目录失败",
            &ProgressState {
                total_bytes: 0,
                copied_bytes: 0,
                files_done: 0,
                total_files: 0,
            },
            None,
            true,
            false,
            Some(&e.to_string()),
        );
        return Err(format!("创建目标目录失败 {}: {}", target_dir.display(), e));
    }

    let (entries, total_bytes, total_files) = collect_entries(&source_dir, &target_dir)?;

    let mut progress = ProgressState {
        total_bytes,
        copied_bytes: 0,
        files_done: 0,
        total_files,
    };

    emit_progress(
        &app_handle,
        0.0,
        "正在准备修复环境...",
        &progress,
        None,
        false,
        true,
        None,
    );

    for entry in entries {
        if entry.is_dir {
            if let Err(e) = fs::create_dir_all(&entry.target) {
                emit_progress(
                    &app_handle,
                    0.0,
                    "创建目录失败",
                    &progress,
                    Some(&entry.relative),
                    true,
                    false,
                    Some(&e.to_string()),
                );
                return Err(format!("创建目录失败 {}: {}", entry.target.display(), e));
            }
            continue;
        }

        if let Err(e) = copy_file_with_progress(&entry, &app_handle, &mut progress) {
            emit_progress(
                &app_handle,
                if progress.total_bytes == 0 {
                    0.0
                } else {
                    progress.copied_bytes as f64 / progress.total_bytes as f64 * 100.0
                },
                "复制文件失败",
                &progress,
                Some(&entry.relative),
                true,
                false,
                Some(&e),
            );
            return Err(e);
        }
    }

    emit_progress(
        &app_handle,
        100.0,
        "Python 环境修复完成",
        &progress,
        None,
        true,
        true,
        Some("MemProcFS Python 环境修复成功"),
    );

    Ok(format!(
        "Python 环境修复完成：复制 {} 个文件，共 {} 字节",
        progress.files_done, progress.total_bytes
    ))
}
