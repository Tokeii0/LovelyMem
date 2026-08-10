use crate::settings::{get_app_data_dir, load_settings, save_settings};
use crate::types::WallpaperSettings;
use std::fs;
use std::path::PathBuf;

#[tauri::command]
pub fn get_wallpaper_settings() -> Result<serde_json::Value, String> {
    let settings = load_settings()?;
    Ok(serde_json::to_value(settings.wallpaper)
        .map_err(|e| format!("序列化壁纸设置失败: {}", e))?)
}

#[tauri::command]
pub fn set_wallpaper_settings(wallpaper: WallpaperSettings) -> Result<(), String> {
    let mut settings = load_settings()?;
    settings.wallpaper = wallpaper;
    save_settings(settings)?;
    Ok(())
}

fn ensure_wallpaper_dir() -> Result<PathBuf, String> {
    let dir = get_app_data_dir()?.join("wallpaper");
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| format!("创建壁纸目录失败: {}", e))?;
    }
    Ok(dir)
}

#[tauri::command]
pub fn import_wallpaper(source_path: String) -> Result<String, String> {
    let src = PathBuf::from(&source_path);
    if !src.exists() {
        return Err("壁纸文件不存在".to_string());
    }

    let dir = ensure_wallpaper_dir()?;
    let ext = src.extension().and_then(|s| s.to_str()).unwrap_or("png");
    let filename = format!(
        "wallpaper_{}.{}",
        chrono::Utc::now().timestamp_millis(),
        ext
    );
    let target = dir.join(filename);

    fs::copy(&src, &target).map_err(|e| format!("复制壁纸失败: {}", e))?;

    let mut settings = load_settings()?;
    settings.wallpaper.file_path = target.to_string_lossy().to_string();
    settings.wallpaper.enabled = true;
    settings.wallpaper.mode = "overlay".to_string();
    if settings.wallpaper.blend_mode.is_empty() {
        settings.wallpaper.blend_mode = "normal".to_string();
    }
    save_settings(settings)?;

    debug_info!("🖼️ 壁纸已导入: {}", target.display());
    Ok(target.to_string_lossy().to_string())
}

#[tauri::command]
pub fn clear_wallpaper() -> Result<(), String> {
    let mut settings = load_settings()?;
    settings.wallpaper.file_path = String::new();
    settings.wallpaper.enabled = false;
    save_settings(settings)?;
    Ok(())
}
