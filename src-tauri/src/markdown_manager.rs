use crate::settings;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

/// Markdown 文件信息
#[derive(Debug, Serialize, Deserialize)]
pub struct MarkdownFileInfo {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub modified: String,
    pub created: String,
}

/// 保存 Markdown 文件
///
/// # Arguments
/// * `file_name` - 文件名（不含路径）
/// * `content` - Markdown 内容
/// * `custom_path` - 可选的自定义保存路径，如果为 None 则使用设置中的默认路径
#[tauri::command]
pub async fn save_markdown_file(
    file_name: String,
    content: String,
    custom_path: Option<String>,
) -> Result<String, String> {
    debug_info!("保存 Markdown 文件: {}", file_name);

    // 确定保存目录
    let save_dir = if let Some(path) = custom_path {
        PathBuf::from(path)
    } else {
        get_markdown_save_path()?
    };

    // 确保目录存在
    if !save_dir.exists() {
        fs::create_dir_all(&save_dir).map_err(|e| format!("创建 Markdown 保存目录失败: {}", e))?;
    }

    // 确保文件名有 .md 扩展名
    let file_name = if file_name.ends_with(".md") || file_name.ends_with(".markdown") {
        file_name
    } else {
        format!("{}.md", file_name)
    };

    // 构建完整路径
    let file_path = save_dir.join(&file_name);

    // 写入文件
    fs::write(&file_path, &content).map_err(|e| format!("保存文件失败: {}", e))?;

    debug_info!("Markdown 文件保存成功: {}", file_path.display());

    Ok(file_path.to_string_lossy().to_string())
}

/// 读取 Markdown 文件
#[tauri::command]
pub async fn read_markdown_file(file_path: String) -> Result<String, String> {
    let path = Path::new(&file_path);

    if !path.exists() {
        return Err(format!("文件不存在: {}", file_path));
    }

    fs::read_to_string(path).map_err(|e| format!("读取文件失败: {}", e))
}

/// 获取 Markdown 保存目录下的所有 Markdown 文件
#[tauri::command]
pub async fn list_markdown_files(
    custom_path: Option<String>,
) -> Result<Vec<MarkdownFileInfo>, String> {
    let save_dir = if let Some(path) = custom_path {
        PathBuf::from(path)
    } else {
        get_markdown_save_path()?
    };

    if !save_dir.exists() {
        return Ok(Vec::new());
    }

    let mut files = Vec::new();

    let entries = fs::read_dir(&save_dir).map_err(|e| format!("读取目录失败: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("读取目录项失败: {}", e))?;
        let path = entry.path();

        if path.is_file() {
            let extension = path.extension().and_then(|ext| ext.to_str()).unwrap_or("");

            if extension == "md" || extension == "markdown" {
                let metadata =
                    fs::metadata(&path).map_err(|e| format!("获取文件元数据失败: {}", e))?;

                let modified = metadata
                    .modified()
                    .map(|time| {
                        let datetime: chrono::DateTime<chrono::Utc> = time.into();
                        datetime.format("%Y-%m-%d %H:%M:%S").to_string()
                    })
                    .unwrap_or_else(|_| "未知".to_string());

                let created = metadata
                    .created()
                    .map(|time| {
                        let datetime: chrono::DateTime<chrono::Utc> = time.into();
                        datetime.format("%Y-%m-%d %H:%M:%S").to_string()
                    })
                    .unwrap_or_else(|_| "未知".to_string());

                files.push(MarkdownFileInfo {
                    name: path
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("unknown")
                        .to_string(),
                    path: path.to_string_lossy().to_string(),
                    size: metadata.len(),
                    modified,
                    created,
                });
            }
        }
    }

    // 按修改时间排序，最新的在前
    files.sort_by(|a, b| b.modified.cmp(&a.modified));

    Ok(files)
}

/// 删除 Markdown 文件
#[tauri::command]
pub async fn delete_markdown_file(file_path: String) -> Result<(), String> {
    let path = Path::new(&file_path);

    if !path.exists() {
        return Err(format!("文件不存在: {}", file_path));
    }

    fs::remove_file(path).map_err(|e| format!("删除文件失败: {}", e))?;

    debug_info!("Markdown 文件已删除: {}", file_path);

    Ok(())
}

/// 重命名 Markdown 文件
#[tauri::command]
pub async fn rename_markdown_file(old_path: String, new_name: String) -> Result<String, String> {
    let old_path = Path::new(&old_path);

    if !old_path.exists() {
        return Err(format!("文件不存在: {}", old_path.display()));
    }

    let parent = old_path.parent().ok_or("无法获取父目录")?;

    // 确保新文件名有 .md 扩展名
    let new_name = if new_name.ends_with(".md") || new_name.ends_with(".markdown") {
        new_name
    } else {
        format!("{}.md", new_name)
    };

    let new_path = parent.join(&new_name);

    // 检查新文件是否已存在
    if new_path.exists() {
        return Err(format!("文件已存在: {}", new_name));
    }

    fs::rename(old_path, &new_path).map_err(|e| format!("重命名失败: {}", e))?;

    debug_info!(
        "Markdown 文件已重命名: {} -> {}",
        old_path.display(),
        new_path.display()
    );

    Ok(new_path.to_string_lossy().to_string())
}

/// 获取 Markdown 保存路径（从设置中读取或使用默认路径）
#[tauri::command]
pub fn get_markdown_save_path() -> Result<PathBuf, String> {
    let settings = settings::load_settings()?;

    if !settings.markdown_save_path.is_empty() {
        let path = PathBuf::from(&settings.markdown_save_path);
        // 确保目录存在
        if !path.exists() {
            fs::create_dir_all(&path).map_err(|e| format!("创建 Markdown 保存目录失败: {}", e))?;
        }
        return Ok(path);
    }

    // 使用默认路径：应用数据目录下的 markdown 文件夹
    let app_data_dir = settings::get_app_data_dir()?;
    let default_path = app_data_dir.join("markdown");

    if !default_path.exists() {
        fs::create_dir_all(&default_path)
            .map_err(|e| format!("创建默认 Markdown 保存目录失败: {}", e))?;
    }

    Ok(default_path)
}

/// 获取 Markdown 保存路径字符串（用于前端调用）
#[tauri::command]
pub async fn get_markdown_save_path_string() -> Result<String, String> {
    let path = get_markdown_save_path()?;
    Ok(path.to_string_lossy().to_string())
}

/// 设置 Markdown 保存路径
#[tauri::command]
pub async fn set_markdown_save_path(path: String) -> Result<(), String> {
    let mut settings = settings::load_settings()?;
    settings.markdown_save_path = path;
    settings::save_settings(settings)?;

    debug_info!("Markdown 保存路径已更新");

    Ok(())
}

/// 创建新的 Markdown 文件（带模板）
#[tauri::command]
pub async fn create_markdown_file(
    filename: String,
    template_content: Option<String>,
    custom_path: Option<String>,
) -> Result<String, String> {
    let content = template_content.unwrap_or_else(|| {
        format!(
            "# {}\n\n",
            filename
                .trim_end_matches(".md")
                .trim_end_matches(".markdown")
        )
    });

    save_markdown_file(filename, content, custom_path).await
}

/// 检查文件是否存在
#[tauri::command]
pub async fn markdown_file_exists(file_path: String) -> Result<bool, String> {
    Ok(Path::new(&file_path).exists())
}

/// 获取默认的 Markdown 保存路径
pub fn default_markdown_save_path() -> String {
    "markdown".to_string()
}

/// 目录条目信息（用于报告编辑器的文件列表）
#[derive(Debug, Serialize, Deserialize)]
pub struct DirectoryEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub modified: String,
}

/// 列出目录内容（包含文件和子目录），专门用于报告编辑器
#[tauri::command]
pub async fn list_directory_entries(path: String) -> Result<Vec<DirectoryEntry>, String> {
    let dir_path = Path::new(&path);

    if !dir_path.exists() {
        return Ok(Vec::new());
    }

    if !dir_path.is_dir() {
        return Err("指定路径不是目录".to_string());
    }

    let mut entries = Vec::new();

    let read_entries = fs::read_dir(&dir_path).map_err(|e| format!("读取目录失败: {}", e))?;

    for entry in read_entries {
        let entry = entry.map_err(|e| format!("读取目录项失败: {}", e))?;
        let entry_path = entry.path();

        let metadata = fs::metadata(&entry_path).map_err(|e| format!("获取元数据失败: {}", e))?;

        let modified = metadata
            .modified()
            .map(|time| {
                let datetime: chrono::DateTime<chrono::Utc> = time.into();
                datetime.format("%Y-%m-%d %H:%M:%S").to_string()
            })
            .unwrap_or_else(|_| "未知".to_string());

        entries.push(DirectoryEntry {
            name: entry_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown")
                .to_string(),
            path: entry_path.to_string_lossy().to_string(),
            is_dir: entry_path.is_dir(),
            modified,
        });
    }

    // 排序：目录在前，文件在后，然后按名称排序
    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(entries)
}

/// 创建新目录
#[tauri::command]
pub async fn create_directory(path: String) -> Result<String, String> {
    let dir_path = Path::new(&path);

    if dir_path.exists() {
        return Err("目录已存在".to_string());
    }

    fs::create_dir_all(&dir_path).map_err(|e| format!("创建目录失败: {}", e))?;

    debug_info!("目录已创建: {}", path);

    Ok(path)
}

/// 删除目录（包括目录下的所有内容）
#[tauri::command]
pub async fn delete_directory(path: String) -> Result<(), String> {
    let dir_path = Path::new(&path);

    if !dir_path.exists() {
        return Err("目录不存在".to_string());
    }

    if !dir_path.is_dir() {
        return Err("指定路径不是目录".to_string());
    }

    fs::remove_dir_all(&dir_path).map_err(|e| format!("删除目录失败: {}", e))?;

    debug_info!("目录已删除: {}", path);

    Ok(())
}

/// 直接写入文件（不经过目录处理）
#[tauri::command]
pub async fn write_file_directly(file_path: String, content: String) -> Result<String, String> {
    let path = Path::new(&file_path);

    // 确保父目录存在
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| format!("创建父目录失败: {}", e))?;
        }
    }

    fs::write(&path, &content).map_err(|e| format!("写入文件失败: {}", e))?;

    debug_info!("文件已写入: {}", file_path);

    Ok(file_path)
}
