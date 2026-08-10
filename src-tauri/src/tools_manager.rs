use crate::path_utils;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CustomTool {
    pub id: String,
    pub name: String,
    pub description: String,
    pub command: String,
    pub arguments: String,
    pub icon: String,
    pub category: String,
    pub enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

/// 获取工具配置文件路径
fn get_tools_config_path() -> Result<PathBuf, String> {
    Ok(crate::settings::get_app_data_dir()?.join("tools.json"))
}

/// 加载工具配置
pub fn load_tools() -> Result<Vec<CustomTool>, String> {
    let config_path = get_tools_config_path()?;

    if !config_path.exists() {
        debug_info!("🔧 工具配置文件不存在，返回空列表");
        return Ok(Vec::new());
    }

    let content =
        fs::read_to_string(&config_path).map_err(|e| format!("读取工具配置文件失败: {}", e))?;

    if content.trim().is_empty() {
        return Ok(Vec::new());
    }

    let tools: Vec<CustomTool> =
        serde_json::from_str(&content).map_err(|e| format!("解析工具配置文件失败: {}", e))?;

    debug_info!("🔧 成功加载 {} 个工具", tools.len());
    Ok(tools)
}

/// 保存工具配置
pub fn save_tools(tools: Vec<CustomTool>) -> Result<(), String> {
    let config_path = get_tools_config_path()?;

    let content =
        serde_json::to_string_pretty(&tools).map_err(|e| format!("序列化工具配置失败: {}", e))?;

    fs::write(&config_path, content).map_err(|e| format!("写入工具配置文件失败: {}", e))?;

    debug_info!("🔧 成功保存 {} 个工具到配置文件", tools.len());
    Ok(())
}

/// 执行工具命令
pub fn execute_tool_command(
    command: String,
    arguments: String,
    variables: HashMap<String, String>,
) -> Result<String, String> {
    // 使用安全的路径变量替换
    let final_command = path_utils::replace_path_variables_safely(&command, &variables);
    let final_arguments = path_utils::replace_path_variables_safely(&arguments, &variables);

    // 构建完整命令 - 使用安全的路径处理
    let full_command = if final_arguments.is_empty() {
        final_command
    } else {
        // 对命令和参数分别进行路径安全处理
        let safe_command = path_utils::quote_path_if_needed(&final_command);
        let safe_arguments = path_utils::quote_path_if_needed(&final_arguments);
        format!("{} {}", safe_command, safe_arguments)
    };

    debug_info!("🔧 执行工具命令: {}", full_command);

    // 使用现有的命令执行器
    crate::command_executor::execute_command_sync(&full_command)
}

// Tauri 命令包装器
#[tauri::command]
pub async fn load_tools_json() -> Result<Vec<CustomTool>, String> {
    load_tools()
}

#[tauri::command]
pub async fn save_tools_json(tools: Vec<CustomTool>) -> Result<(), String> {
    save_tools(tools)
}

#[tauri::command]
pub async fn execute_tool_command_tauri(
    command: String,
    arguments: String,
    variables: HashMap<String, String>,
) -> Result<String, String> {
    execute_tool_command(command, arguments, variables)
}
