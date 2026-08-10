//! 脚本命令模块
//!
//! 提供脚本管理相关的 Tauri 命令包装

use crate::script_manager;
use crate::types;

/// 获取所有脚本
#[tauri::command]
pub async fn get_scripts() -> Result<Vec<types::PythonScript>, String> {
    let manager = script_manager::create_script_manager();
    manager.get_scripts()
}

/// 添加脚本
#[tauri::command]
pub async fn add_script(script: types::PythonScript) -> Result<types::PythonScript, String> {
    let manager = script_manager::create_script_manager();
    manager.add_script(script)
}

/// 更新脚本
#[tauri::command]
pub async fn update_script(script: types::PythonScript) -> Result<types::PythonScript, String> {
    let manager = script_manager::create_script_manager();
    manager.update_script(script)
}

/// 删除脚本
#[tauri::command]
pub async fn delete_script(script_id: String) -> Result<(), String> {
    let manager = script_manager::create_script_manager();
    manager.delete_script(script_id)
}

/// 执行脚本
#[tauri::command]
pub async fn execute_script(
    script_id: String,
    app_handle: tauri::AppHandle,
) -> Result<types::ScriptExecutionResult, String> {
    let manager = script_manager::create_script_manager();
    manager.execute_script(script_id, Some(app_handle)).await
}

/// 获取脚本执行状态
#[tauri::command]
pub async fn get_script_status(
    script_id: String,
) -> Result<Option<types::ScriptExecutionStatus>, String> {
    let manager = script_manager::create_script_manager();
    Ok(manager.get_script_status(script_id))
}

/// 获取所有脚本执行状态
#[tauri::command]
pub async fn get_all_script_status()
-> Result<std::collections::HashMap<String, types::ScriptExecutionStatus>, String> {
    let manager = script_manager::create_script_manager();
    Ok(manager.get_all_script_status())
}

/// 执行所有启用的脚本
#[tauri::command]
pub async fn execute_all_enabled_scripts(
    app_handle: tauri::AppHandle,
) -> Result<Vec<types::ScriptExecutionResult>, String> {
    let manager = script_manager::create_script_manager();
    manager.execute_all_enabled_scripts(Some(app_handle)).await
}

/// 获取可用的脚本变量
#[tauri::command]
pub async fn get_script_variables() -> Result<std::collections::HashMap<String, String>, String> {
    let manager = script_manager::create_script_manager();
    manager.get_available_variables()
}
