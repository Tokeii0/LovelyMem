use crate::settings::{load_settings, save_settings};

/// 获取主题设置（仅返回当前主题模式）
#[tauri::command]
pub fn get_theme_settings() -> Result<serde_json::Value, String> {
    let settings = load_settings()?;

    // 返回主题设置
    let theme_settings = serde_json::json!({
        "current_theme": settings.theme.current_theme
    });

    Ok(theme_settings)
}

/// 设置当前主题模式
#[tauri::command]
pub fn set_current_theme(theme: String) -> Result<(), String> {
    let mut settings = load_settings()?;
    settings.theme.current_theme = theme.clone();
    save_settings(settings)?;

    debug_info!("🎨 主题模式已更新为: {}", theme);
    Ok(())
}
