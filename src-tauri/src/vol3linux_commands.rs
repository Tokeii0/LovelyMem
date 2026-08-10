//! Vol3Linux 命令模块
//!
//! 提供 Volatility3 Linux 分析相关的 Tauri 命令包装

use crate::settings;
use crate::vol3linux;

/// 执行 Vol3Linux 命令
#[tauri::command]
pub async fn execute_vol3linux(
    python_path: String,
    volatility3_path: String,
    image_path: String,
    plugin: String,
    offline: bool,
    use_proxy: bool,
    proxy_url: Option<String>,
    output_dir: String,
) -> Result<vol3linux::Vol3LinuxResult, String> {
    // 创建配置
    let config = vol3linux::Vol3LinuxConfig {
        python_path,
        volatility3_path,
        image_path: image_path.clone(),
    };

    // 确保输出目录存在
    vol3linux::create_output_dir(&output_dir)
        .await
        .map_err(|e| format!("创建输出目录失败: {}", e))?;

    match vol3linux::execute_vol3linux_command(
        &config,
        &plugin,
        offline,
        use_proxy,
        proxy_url.as_deref(),
        &output_dir,
    )
    .await
    {
        Ok(result) => Ok(result),
        Err(e) => Err(e),
    }
}

/// 获取 Vol3Linux 插件列表
#[tauri::command]
pub async fn get_vol3linux_plugins() -> Result<Vec<String>, String> {
    let settings = settings::load_settings()?;
    let config = vol3linux::Vol3LinuxConfig {
        python_path: settings.python3_path,
        volatility3_path: settings.volatility3_path,
        image_path: String::new(),
    };
    vol3linux::get_vol3linux_plugins(&config).await
}

/// 获取 Vol3Linux 版本
#[tauri::command]
pub async fn get_vol3linux_version() -> Result<String, String> {
    let settings = settings::load_settings()?;
    let config = vol3linux::Vol3LinuxConfig {
        python_path: settings.python3_path,
        volatility3_path: settings.volatility3_path,
        image_path: String::new(),
    };
    vol3linux::get_vol3linux_version(&config).await
}

/// 检查 Vol3Linux 环境
#[tauri::command]
pub async fn check_vol3linux_environment() -> Result<String, String> {
    let settings = settings::load_settings()?;
    let config = vol3linux::Vol3LinuxConfig {
        python_path: settings.python3_path,
        volatility3_path: settings.volatility3_path,
        image_path: String::new(),
    };
    match vol3linux::check_vol3linux_environment(&config).await {
        Ok(true) => Ok("Vol3Linux环境检查通过".to_string()),
        Ok(false) => Ok("Vol3Linux环境检查失败".to_string()),
        Err(e) => Err(e),
    }
}

/// 创建 Vol3Linux 输出目录
#[tauri::command]
pub async fn create_vol3linux_output_dir() -> Result<String, String> {
    let settings = settings::load_settings()?;
    let output_dir = format!("{}/vol3linux", settings.output_path);
    vol3linux::create_output_dir(&output_dir).await?;
    Ok(output_dir)
}
