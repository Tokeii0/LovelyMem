use crate::types::AppSettings;
use std::fs;
use std::path::PathBuf;
use std::sync::{OnceLock, RwLock};

// ─── 全局设置缓存 ─────────────────────────────────────────────
// 首次读取后缓存在内存中，save_settings 同步更新缓存与磁盘。
// 所有现有 load_settings() 调用点无需任何修改即可受益。
static SETTINGS_CACHE: OnceLock<RwLock<AppSettings>> = OnceLock::new();

/// 统一的应用存储目录名。
///
/// 配置文件位于 `dirs::config_dir()/lovelymem-v2`，本地缓存类数据也复用
/// 这个目录名，避免各模块各自维护品牌相关路径。
pub const APP_STORAGE_DIR_NAME: &str = "lovelymem-v2";

fn get_settings_cache() -> &'static RwLock<AppSettings> {
    SETTINGS_CACHE.get_or_init(|| {
        let settings = load_settings_from_disk().unwrap_or_default();
        RwLock::new(settings)
    })
}

/// 获取应用数据目录
pub fn get_app_data_dir() -> Result<PathBuf, String> {
    let app_data_dir = dirs::config_dir()
        .or_else(|| dirs::home_dir().map(|p| p.join(".config")))
        .ok_or("无法获取应用数据目录")?
        .join(APP_STORAGE_DIR_NAME);

    if !app_data_dir.exists() {
        fs::create_dir_all(&app_data_dir).map_err(|e| format!("创建应用数据目录失败: {}", e))?;
    }

    Ok(app_data_dir)
}

/// 保存应用设置（同时写入磁盘 + 更新内存缓存）
pub fn save_settings(settings: AppSettings) -> Result<(), String> {
    let app_data_dir = get_app_data_dir()?;
    let settings_file = app_data_dir.join("settings.json");

    let settings_json =
        serde_json::to_string_pretty(&settings).map_err(|e| format!("序列化设置失败: {}", e))?;

    fs::write(&settings_file, settings_json).map_err(|e| format!("保存设置失败: {}", e))?;

    // 同步更新内存缓存
    let cache = get_settings_cache();
    if let Ok(mut cached) = cache.write() {
        *cached = settings;
    }

    Ok(())
}

/// 原子更新设置：在持有写锁期间读取-修改-写入，避免并发覆盖
/// 解决 load_settings → 修改 → save_settings 模式下的竞态条件
pub fn update_settings<F>(updater: F) -> Result<(), String>
where
    F: FnOnce(&mut AppSettings),
{
    let cache = get_settings_cache();
    let mut settings = cache
        .write()
        .map_err(|e| format!("获取设置写锁失败: {}", e))?;

    updater(&mut settings);

    // 在持有写锁期间写入磁盘，确保原子性
    let app_data_dir = get_app_data_dir()?;
    let settings_file = app_data_dir.join("settings.json");
    let settings_json =
        serde_json::to_string_pretty(&*settings).map_err(|e| format!("序列化设置失败: {}", e))?;
    fs::write(&settings_file, settings_json).map_err(|e| format!("保存设置失败: {}", e))?;

    Ok(())
}

/// 从磁盘加载设置（仅在初始化缓存时使用）
fn load_settings_from_disk() -> Result<AppSettings, String> {
    let app_data_dir = get_app_data_dir()?;
    let settings_file = app_data_dir.join("settings.json");

    if !settings_file.exists() {
        return Ok(AppSettings::default());
    }

    let settings_content =
        fs::read_to_string(&settings_file).map_err(|e| format!("读取设置文件失败: {}", e))?;

    let mut settings: AppSettings =
        serde_json::from_str(&settings_content).map_err(|e| format!("解析设置文件失败: {}", e))?;

    // 如果 volatility2_plugin 为空，尝试基于 volatility2_path 自动生成默认路径
    if settings.volatility2_plugin.is_empty() && !settings.volatility2_path.is_empty() {
        settings.volatility2_plugin =
            generate_default_volatility2_plugin_path(&settings.volatility2_path);
    }
    // macOS: 禁用 Volatility2/Python2 相关路径
    #[cfg(target_os = "macos")]
    {
        settings.python2_path.clear();
        settings.volatility2_path.clear();
        settings.volatility2_plugin.clear();
    }

    Ok(settings)
}

/// 加载应用设置（从内存缓存读取，首次调用自动从磁盘初始化）
pub fn load_settings() -> Result<AppSettings, String> {
    let cache = get_settings_cache();
    let settings = cache
        .read()
        .map_err(|e| format!("读取设置缓存失败: {}", e))?;
    Ok(settings.clone())
}

/// 把原始盘符字符串无害化为单个大写字母（A–Z），非法时回退 "M"
pub fn sanitize_drive_letter(raw: &str) -> String {
    raw.trim()
        .chars()
        .next()
        .map(|c| c.to_ascii_uppercase())
        .filter(|c| c.is_ascii_uppercase())
        .unwrap_or('M')
        .to_string()
}

/// 当前配置的 MemProcFS 挂载盘符（单个大写字母，默认 "M"）
pub fn mount_drive_letter() -> String {
    let letter = load_settings()
        .map(|s| s.mount_drive_letter)
        .unwrap_or_default();
    sanitize_drive_letter(&letter)
}

/// 挂载根路径（反斜杠风格），例如 "M:\\"
pub fn mount_root() -> String {
    format!("{}:\\", mount_drive_letter())
}

/// 强制从磁盘重新加载设置到缓存（用于外部修改设置文件后的同步）
pub fn reload_settings_from_disk() -> Result<AppSettings, String> {
    let fresh = load_settings_from_disk()?;
    let cache = get_settings_cache();
    if let Ok(mut cached) = cache.write() {
        *cached = fresh.clone();
    }
    Ok(fresh)
}

/// 基于 volatility2_path 生成默认的插件目录路径
fn generate_default_volatility2_plugin_path(volatility2_path: &str) -> String {
    use std::path::Path;

    let vol_path = Path::new(volatility2_path);

    // 如果路径包含 volatility2_python，则替换为 volatility2_plugin
    if let Some(parent) = vol_path.parent() {
        let parent_str = parent.to_string_lossy();
        if parent_str.contains("volatility2_python") {
            let plugin_path = parent_str.replace("volatility2_python", "volatility2_plugin");
            return plugin_path;
        }

        // 如果父目录名包含 volatility2，尝试在同级创建 volatility2_plugin 目录
        if let Some(grandparent) = parent.parent() {
            let plugin_dir = grandparent.join("volatility2_plugin");
            return plugin_dir.to_string_lossy().to_string();
        }
    }

    // 如果无法自动生成，返回空字符串
    String::new()
}

/// 获取设置文件路径
pub fn get_settings_path() -> Result<String, String> {
    let app_data_dir = get_app_data_dir()?;
    let settings_file = app_data_dir.join("settings.json");
    Ok(settings_file.to_string_lossy().to_string())
}

/// 清空当前镜像路径
pub async fn clear_current_image_path() -> Result<(), String> {
    update_settings(|s| {
        s.current_image_path = String::new();
    })
}

/// 设置当前镜像路径
pub fn set_current_image_path(image_path: String) -> Result<(), String> {
    update_settings(|s| {
        s.current_image_path = image_path;
    })
}

/// 获取当前镜像路径
pub fn get_current_image_path() -> Result<String, String> {
    let settings = load_settings()?;
    Ok(settings.current_image_path)
}

/// 设置区域图标
pub fn set_area_icon(area_name: String, icon: String) -> Result<(), String> {
    update_settings(|s| {
        s.area_icons.insert(area_name, icon);
    })
}

/// 获取区域图标
pub fn get_area_icon(area_name: String) -> Result<Option<String>, String> {
    let settings = load_settings()?;
    Ok(settings.area_icons.get(&area_name).cloned())
}

/// 获取所有区域图标
pub fn get_all_area_icons() -> Result<std::collections::HashMap<String, String>, String> {
    let settings = load_settings()?;
    Ok(settings.area_icons)
}

// ─── Tauri 命令包装器 ─────────────────────────────────────────

#[tauri::command]
pub async fn save_settings_command(settings: AppSettings) -> Result<(), String> {
    // 保护运行时字段：前端设置对话框不管理这些字段，
    // 如果传入值为空但缓存中有值，则保留缓存中的值，防止竞态覆盖
    let mut merged = settings;
    if let Ok(current) = load_settings() {
        if merged.current_image_path.is_empty() && !current.current_image_path.is_empty() {
            merged.current_image_path = current.current_image_path;
        }
        if merged.pagefile0_path.is_empty() && !current.pagefile0_path.is_empty() {
            merged.pagefile0_path = current.pagefile0_path;
        }
        if merged.pagefile1_path.is_empty() && !current.pagefile1_path.is_empty() {
            merged.pagefile1_path = current.pagefile1_path;
        }
    }
    save_settings(merged)
}

#[tauri::command]
pub async fn load_settings_command() -> Result<AppSettings, String> {
    load_settings()
}

#[tauri::command]
pub async fn set_area_icon_command(area_name: String, icon: String) -> Result<(), String> {
    set_area_icon(area_name, icon)
}

#[tauri::command]
pub async fn get_area_icon_command(area_name: String) -> Result<Option<String>, String> {
    get_area_icon(area_name)
}

#[tauri::command]
pub async fn get_all_area_icons_command()
-> Result<std::collections::HashMap<String, String>, String> {
    get_all_area_icons()
}

// 注意: get_settings_command 和 get_app_settings_command 是 load_settings_command 的别名，
// 保留以兼容前端已有调用 (StringSearchPanel、filePanelManager、terminalManager)
#[tauri::command]
pub async fn get_settings_command() -> Result<AppSettings, String> {
    load_settings()
}

#[tauri::command]
pub async fn get_settings_path_command() -> Result<String, String> {
    get_settings_path()
}

#[tauri::command]
pub async fn set_current_image_path_command(image_path: String) -> Result<(), String> {
    set_current_image_path(image_path)
}

#[tauri::command]
pub async fn get_current_image_path_command() -> Result<String, String> {
    get_current_image_path()
}

#[tauri::command]
pub async fn get_app_settings_command() -> Result<AppSettings, String> {
    load_settings()
}

#[tauri::command]
pub async fn reload_settings_command() -> Result<AppSettings, String> {
    reload_settings_from_disk()
}
