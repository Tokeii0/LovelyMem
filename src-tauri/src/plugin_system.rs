use crate::path_utils;
use crate::settings::{load_settings, save_settings};
use crate::types::{CustomTool, FileBrowserPlugin};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

// 自定义工具管理
#[tauri::command]
pub fn load_custom_tools() -> Result<Vec<CustomTool>, String> {
    let settings = load_settings()?;
    debug_info!("🔧 加载自定义工具，数量: {}", settings.custom_tools.len());
    for (i, tool) in settings.custom_tools.iter().enumerate() {
        debug_info!("🔧 工具{}: {} - {}", i + 1, tool.name, tool.command);
    }
    Ok(settings.custom_tools)
}
#[tauri::command]
pub fn save_custom_tools(tools: Vec<CustomTool>) -> Result<(), String> {
    let mut settings = load_settings()?;
    settings.custom_tools = tools;
    save_settings(settings)
}

#[tauri::command]
pub fn add_custom_tool(tool: CustomTool) -> Result<(), String> {
    debug_info!("🔧 添加自定义工具: {:?}", tool);

    let mut settings = load_settings()?;
    debug_info!(
        "🔧 当前设置加载成功，现有工具数量: {}",
        settings.custom_tools.len()
    );

    settings.custom_tools.push(tool);
    debug_info!("🔧 工具已添加，总数量: {}", settings.custom_tools.len());

    let result = save_settings(settings);
    match &result {
        Ok(_) => {
            debug_info!("🔧 设置保存成功");
        }
        Err(e) => {
            debug_info!("🔧 设置保存失败: {}", e);
        }
    }

    result
}

#[tauri::command]
pub fn update_custom_tool(tool_id: String, updated_tool: CustomTool) -> Result<(), String> {
    let mut settings = load_settings()?;

    if let Some(existing_tool) = settings.custom_tools.iter_mut().find(|t| t.id == tool_id) {
        *existing_tool = updated_tool;
        save_settings(settings)
    } else {
        Err("工具未找到".to_string())
    }
}

#[tauri::command]
pub fn delete_custom_tool(tool_id: String) -> Result<(), String> {
    let mut settings = load_settings()?;
    settings.custom_tools.retain(|t| t.id != tool_id);
    save_settings(settings)
}

#[tauri::command]
pub fn execute_custom_tool(
    tool_id: String,
    variables: HashMap<String, String>,
) -> Result<String, String> {
    let settings = load_settings()?;

    if let Some(tool) = settings
        .custom_tools
        .iter()
        .find(|t| t.id == tool_id && t.enabled)
    {
        let mut command = tool.command.clone();
        let mut arguments = tool.arguments.clone();

        // 替换变量 - 使用安全的路径处理
        command = path_utils::replace_path_variables_safely(&command, &variables);
        arguments = path_utils::replace_path_variables_safely(&arguments, &variables);

        let full_command = if arguments.is_empty() {
            command
        } else {
            format!("{} {}", command, arguments)
        };

        crate::command_executor::execute_command_sync(&full_command)
    } else {
        Err("工具未找到或已禁用".to_string())
    }
}

// 文件浏览器插件管理 - 使用独立的JSON文件

/// 获取文件浏览器插件配置文件路径
fn get_file_browser_plugins_path() -> Result<PathBuf, String> {
    let app_data_dir = crate::settings::get_app_data_dir()?;
    Ok(app_data_dir.join("file_browser_plugins.json"))
}

/// 迁移文件浏览器插件配置（从settings.json到独立文件）
fn migrate_file_browser_plugins_if_needed() -> Result<(), String> {
    let plugins_file = get_file_browser_plugins_path()?;

    // 如果独立文件已存在，无需迁移
    if plugins_file.exists() {
        return Ok(());
    }

    // 尝试从settings.json中读取插件配置
    let settings_file = crate::settings::get_app_data_dir()?.join("settings.json");
    if !settings_file.exists() {
        return Ok(());
    }

    let settings_content =
        fs::read_to_string(&settings_file).map_err(|e| format!("读取设置文件失败: {}", e))?;

    // 尝试解析settings.json并提取file_browser_plugins
    if let Ok(settings_value) = serde_json::from_str::<serde_json::Value>(&settings_content) {
        if let Some(plugins_array) = settings_value.get("file_browser_plugins") {
            if let Ok(plugins) =
                serde_json::from_value::<Vec<FileBrowserPlugin>>(plugins_array.clone())
            {
                if !plugins.is_empty() {
                    debug_info!("🔄 迁移 {} 个文件浏览器插件到独立配置文件", plugins.len());
                    save_file_browser_plugins(plugins)?;
                    debug_info!("✅ 文件浏览器插件迁移完成");
                }
            }
        }
    }

    Ok(())
}

/// 加载文件浏览器插件配置
#[tauri::command]
pub fn load_file_browser_plugins() -> Result<Vec<FileBrowserPlugin>, String> {
    // 首先尝试迁移旧配置
    migrate_file_browser_plugins_if_needed()?;

    let plugins_file = get_file_browser_plugins_path()?;

    if !plugins_file.exists() {
        debug_info!("📁 文件浏览器插件配置文件不存在，返回空列表");
        return Ok(Vec::new());
    }

    let plugins_content = fs::read_to_string(&plugins_file)
        .map_err(|e| format!("读取文件浏览器插件配置失败: {}", e))?;

    let plugins: Vec<FileBrowserPlugin> = serde_json::from_str(&plugins_content)
        .map_err(|e| format!("解析文件浏览器插件配置失败: {}", e))?;

    debug_info!("✅ 成功加载 {} 个文件浏览器插件", plugins.len());
    Ok(plugins)
}

/// 保存文件浏览器插件配置
#[tauri::command]
pub fn save_file_browser_plugins(plugins: Vec<FileBrowserPlugin>) -> Result<(), String> {
    let plugins_file = get_file_browser_plugins_path()?;

    // 确保目录存在
    if let Some(parent) = plugins_file.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建文件浏览器插件配置目录失败: {}", e))?;
    }

    let plugins_json = serde_json::to_string_pretty(&plugins)
        .map_err(|e| format!("序列化文件浏览器插件配置失败: {}", e))?;

    fs::write(&plugins_file, plugins_json)
        .map_err(|e| format!("保存文件浏览器插件配置失败: {}", e))?;

    debug_info!(
        "✅ 成功保存 {} 个文件浏览器插件到: {}",
        plugins.len(),
        plugins_file.display()
    );
    Ok(())
}

/// 添加文件浏览器插件
#[tauri::command]
pub fn add_file_browser_plugin(plugin: FileBrowserPlugin) -> Result<(), String> {
    let mut plugins = load_file_browser_plugins()?;
    plugins.push(plugin);
    save_file_browser_plugins(plugins)
}

/// 更新文件浏览器插件
#[tauri::command]
pub fn update_file_browser_plugin(
    plugin_id: String,
    updated_plugin: FileBrowserPlugin,
) -> Result<(), String> {
    let mut plugins = load_file_browser_plugins()?;

    if let Some(existing_plugin) = plugins.iter_mut().find(|p| p.id == plugin_id) {
        *existing_plugin = updated_plugin;
        save_file_browser_plugins(plugins)
    } else {
        Err("插件未找到".to_string())
    }
}

/// 删除文件浏览器插件
#[tauri::command]
pub fn delete_file_browser_plugin(plugin_id: String) -> Result<(), String> {
    let mut plugins = load_file_browser_plugins()?;
    plugins.retain(|p| p.id != plugin_id);
    save_file_browser_plugins(plugins)
}

/// 执行文件浏览器插件
#[tauri::command]
pub async fn execute_file_browser_plugin(
    plugin_id: String,
    file_path: String,
    file_name: String,
    current_path: String,
) -> Result<String, String> {
    let plugins = load_file_browser_plugins()?;
    let settings = load_settings()?; // 仍需要加载设置以获取工具路径

    if let Some(plugin) = plugins.iter().find(|p| p.id == plugin_id && p.enabled) {
        let mut command = plugin.command_template.clone();

        // 构建路径变量映射
        let mut path_variables = std::collections::HashMap::new();
        path_variables.insert("python2_path".to_string(), settings.python2_path.clone());
        path_variables.insert("python3_path".to_string(), settings.python3_path.clone());
        path_variables.insert(
            "memprocfs_path".to_string(),
            settings.memprocfs_path.clone(),
        );
        path_variables.insert(
            "volatility2_path".to_string(),
            settings.volatility2_path.clone(),
        );
        path_variables.insert(
            "volatility3_path".to_string(),
            settings.volatility3_path.clone(),
        );
        path_variables.insert("scripts_output".to_string(), settings.scripts_path.clone());
        path_variables.insert(
            "extensions_path".to_string(),
            settings.extensions_path.clone(),
        );
        path_variables.insert(
            "tooltip_rules_path".to_string(),
            settings.tooltip_rules_path.clone(),
        );

        // 使用安全的路径变量替换
        command = path_utils::replace_path_variables_safely(&command, &path_variables);

        // 替换自定义工具变量 - 格式: {tool_id}
        let mut tool_variables = std::collections::HashMap::new();
        for tool in &settings.custom_tools {
            if tool.enabled {
                // 构建完整的工具命令，使用安全的路径处理
                let tool_command = if tool.arguments.is_empty() {
                    path_utils::quote_path_if_needed(&tool.command)
                } else {
                    format!(
                        "{} {}",
                        path_utils::quote_path_if_needed(&tool.command),
                        path_utils::quote_path_if_needed(&tool.arguments)
                    )
                };
                tool_variables.insert(tool.id.clone(), tool_command);
                debug_info!(
                    "🔧 准备替换自定义工具: {} -> {}",
                    tool.id,
                    tool_variables[&tool.id]
                );
            }
        }
        command = path_utils::replace_path_variables_safely(&command, &tool_variables);

        // 替换文件相关变量 - 使用安全的路径处理
        let mut file_variables = std::collections::HashMap::new();
        file_variables.insert("file_path".to_string(), file_path.clone());
        file_variables.insert("file_name".to_string(), file_name.clone());
        file_variables.insert("current_path".to_string(), current_path.clone());

        // 获取文件扩展名和无扩展名的文件名
        let file_extension = std::path::Path::new(&file_name)
            .extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("");
        let file_name_without_ext = std::path::Path::new(&file_name)
            .file_stem()
            .and_then(|stem| stem.to_str())
            .unwrap_or(&file_name);

        file_variables.insert("file_extension".to_string(), file_extension.to_string());
        file_variables.insert(
            "file_name_without_ext".to_string(),
            file_name_without_ext.to_string(),
        );

        command = path_utils::replace_path_variables_safely(&command, &file_variables);

        debug_info!("🔧 执行文件浏览器插件命令: {}", command);

        // 使用异步命令执行函数，避免阻塞主线程
        crate::command_executor::execute_command_async(&command).await
    } else {
        Err("插件未找到或已禁用".to_string())
    }
}
