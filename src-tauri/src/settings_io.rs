//! 设置导入 / 导出 / 重置
//!
//! 为设置界面「快速操作」提供后端能力：
//! - 导出当前设置为 JSON 文件
//! - 从 JSON 文件导入设置（缺字段由 serde `#[serde(default)]` 兜底）
//! - 重置全部工具 / 路径配置为默认值（保留主题、AI、自定义工具等非路径设置）
//!
//! 文件选择对话框在前端用 `@tauri-apps/plugin-dialog` 完成，这里只接收路径做读写。

use crate::settings;
use crate::types::AppSettings;
use std::fs;

/// 导出当前设置到指定 JSON 文件
fn export_settings(path: &str) -> Result<(), String> {
    let current = settings::load_settings()?;
    let json =
        serde_json::to_string_pretty(&current).map_err(|e| format!("序列化设置失败: {}", e))?;
    fs::write(path, json).map_err(|e| format!("导出设置失败: {}", e))?;
    Ok(())
}

/// 从指定 JSON 文件导入设置（保护运行时字段后落盘），返回合并后的设置
fn import_settings(path: &str) -> Result<AppSettings, String> {
    let content = fs::read_to_string(path).map_err(|e| format!("读取配置文件失败: {}", e))?;

    let mut imported: AppSettings =
        serde_json::from_str(&content).map_err(|e| format!("解析配置文件失败: {}", e))?;

    // 保护运行时字段：导入的配置通常不含这些，避免清掉当前已加载镜像等状态
    if let Ok(current) = settings::load_settings() {
        if imported.current_image_path.is_empty() {
            imported.current_image_path = current.current_image_path;
        }
        if imported.pagefile0_path.is_empty() {
            imported.pagefile0_path = current.pagefile0_path;
        }
        if imported.pagefile1_path.is_empty() {
            imported.pagefile1_path = current.pagefile1_path;
        }
    }

    settings::save_settings(imported.clone())?;
    Ok(imported)
}

/// 重置全部工具 / 路径字段为默认值，保留主题 / AI / 自定义工具等非路径设置
fn reset_tool_paths() -> Result<AppSettings, String> {
    let defaults = AppSettings::default();

    settings::update_settings(|s| {
        // 解释器 / 可执行文件 / 脚本路径
        s.python2_path = defaults.python2_path.clone();
        s.python3_path = defaults.python3_path.clone();
        s.memprocfs_path = defaults.memprocfs_path.clone();
        s.mount_drive_letter = defaults.mount_drive_letter.clone();
        s.dumpit_path = defaults.dumpit_path.clone();
        s.volatility2_path = defaults.volatility2_path.clone();
        s.volatility2_plugin = defaults.volatility2_plugin.clone();
        s.volatility2_profile = defaults.volatility2_profile.clone();
        s.volatility3_path = defaults.volatility3_path.clone();
        // MemNixFS（Linux 内存取证）
        s.memnixfs_path = defaults.memnixfs_path.clone();
        s.memnixfs_symbols_path = defaults.memnixfs_symbols_path.clone();
        s.memnixfs_vmlinux_path = defaults.memnixfs_vmlinux_path.clone();
        s.memnixfs_symbol_cache_path = defaults.memnixfs_symbol_cache_path.clone();
        // 目录类（回退到内置默认值）
        s.output_path = defaults.output_path.clone();
        s.warning_path = defaults.warning_path.clone();
        s.scripts_path = defaults.scripts_path.clone();
        s.extensions_path = defaults.extensions_path.clone();
        s.tooltip_rules_path = defaults.tooltip_rules_path.clone();
        s.markdown_save_path = defaults.markdown_save_path.clone();
        // YARA 规则路径（保留开关，仅清空路径）
        s.yara_rules_path = defaults.yara_rules_path.clone();
    })?;

    settings::load_settings()
}

// ─── Tauri 命令包装器 ─────────────────────────────────────────

/// 导出当前设置到 JSON 文件（路径由前端文件对话框提供）
#[tauri::command]
pub async fn export_settings_command(path: String) -> Result<(), String> {
    debug_info!("导出设置到: {}", path);
    export_settings(&path)
}

/// 从 JSON 文件导入设置，返回合并后的设置
#[tauri::command]
pub async fn import_settings_command(path: String) -> Result<AppSettings, String> {
    debug_info!("从文件导入设置: {}", path);
    import_settings(&path)
}

/// 重置全部工具 / 路径配置为默认值，返回重置后的设置
#[tauri::command]
pub async fn reset_tool_paths_command() -> Result<AppSettings, String> {
    debug_info!("重置全部工具 / 路径配置");
    reset_tool_paths()
}
