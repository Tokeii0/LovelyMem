//! Volatility3 命令模块
//!
//! 提供 Volatility3 相关的 Tauri 命令包装。

use crate::settings;
use crate::volatility3;
/// 执行 Volatility3 命令（带实时进度推送和取消支持）
#[tauri::command]
pub async fn execute_volatility3(
    python_path: String,
    volatility3_path: String,
    image_path: String,
    plugin: String,
    offline: bool,
    output_dir: String,
    app_handle: tauri::AppHandle,
) -> Result<volatility3::Volatility3Result, String> {
    // 创建配置
    let config = volatility3::Volatility3Config {
        python_path,
        volatility3_path,
        image_path: image_path.clone(),
    };

    // 插件结果缓存：同一镜像 + 同一插件 + 同一参数 命中则直接返回上次结果
    let cache_enabled = crate::vol_cache::is_cache_enabled();
    let image_key = crate::vol_cache::compute_image_key(&image_path);
    let cache_args = format!("offline={}", offline);
    let cache_key = crate::vol_cache::compute_cache_key(&image_key, "vol3", &plugin, &cache_args);

    if cache_enabled && let Some(entry) = crate::vol_cache::get_cached(&cache_key) {
        return Ok(volatility3::Volatility3Result {
            success: true,
            output_file: entry.output_file,
            message: "来自缓存".to_string(),
            stdout: entry.stdout,
            stderr: entry.stderr,
            output_type: entry.output_type,
            from_cache: true,
        });
    }

    // 注：输出目录创建已在 execute_volatility3_command 内部处理，无需重复调用

    let result = volatility3::execute_volatility3_command_with_progress(
        &config,
        &plugin,
        offline,
        &output_dir,
        app_handle,
    )
    .await?;

    // 仅缓存成功结果
    if cache_enabled && result.success {
        let _ = crate::vol_cache::store_cache(
            &cache_key,
            &image_key,
            "vol3",
            &plugin,
            &cache_args,
            &result.output_type,
            &result.output_file,
            &result.stdout,
            &result.stderr,
        );
    }

    Ok(result)
}

/// 导出注册表 Hive 文件
#[tauri::command]
pub async fn execute_vol3_dump_hives(
    python_path: String,
    volatility3_path: String,
    image_path: String,
    offline: bool,
    output_dir: String,
    app_handle: tauri::AppHandle,
) -> Result<Vec<String>, String> {
    let config = volatility3::Volatility3Config {
        python_path,
        volatility3_path,
        image_path,
    };

    volatility3::execute_vol3_dump_hives_command(&config, offline, &output_dir, Some(app_handle))
        .await
}

/// 取消正在运行的 Volatility3 命令（可指定插件名，不指定则取消全部）
#[tauri::command]
pub async fn cancel_volatility3(plugin: Option<String>) -> Result<String, String> {
    volatility3::cancel_running_vol3(plugin.as_deref()).await
}

/// 获取 Volatility3 插件列表
#[tauri::command]
pub async fn get_volatility3_plugins() -> Result<Vec<String>, String> {
    let settings = settings::load_settings()?;
    let config = volatility3::Volatility3Config {
        python_path: settings.python3_path,
        volatility3_path: settings.volatility3_path,
        image_path: String::new(),
    };
    volatility3::get_volatility3_plugins(&config).await
}

/// 获取 Volatility3 版本
#[tauri::command]
pub async fn get_volatility3_version() -> Result<String, String> {
    let settings = settings::load_settings()?;
    let config = volatility3::Volatility3Config {
        python_path: settings.python3_path,
        volatility3_path: settings.volatility3_path,
        image_path: String::new(),
    };
    volatility3::get_volatility3_version(&config).await
}

/// 检查 Volatility3 环境
#[tauri::command]
pub async fn check_volatility3_environment() -> Result<String, String> {
    let settings = settings::load_settings()?;
    let config = volatility3::Volatility3Config {
        python_path: settings.python3_path,
        volatility3_path: settings.volatility3_path,
        image_path: String::new(),
    };
    match volatility3::check_volatility3_environment(&config).await {
        Ok(true) => Ok("Volatility3环境检查通过".to_string()),
        Ok(false) => Ok("Volatility3环境检查失败".to_string()),
        Err(e) => Err(e),
    }
}

/// 创建 Volatility3 输出目录
#[tauri::command]
pub async fn create_volatility3_output_dir() -> Result<String, String> {
    let settings = settings::load_settings()?;
    let output_dir = format!("{}/volatility3", settings.output_path);
    volatility3::create_output_dir(&output_dir).await?;
    Ok(output_dir)
}

/// Dump 指定进程的内存为裸数据文件（供「内存图像可视化」使用）。
///
/// 配置（python/vol3/镜像/输出目录）全部从全局 settings 自取，前端只需传 pid。
/// 返回 dump 出的单个文件的绝对路径。进度通过 `vol3-progress` 事件上报（plugin = "memmap"），
/// 可用 `cancel_volatility3(Some("memmap"))` 取消。
#[tauri::command]
pub async fn dump_process_memory(
    pid: u32,
    output_dir: Option<String>,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    // 优先：MemProcFS 已挂载时，直接使用该进程现成的 minidump（秒开，免跑 vol3）。
    // 未挂载 / 无此进程目录时该文件不存在，自动回退到下方的 vol3 dump。
    let minidump = format!(
        "{}pid\\{}\\minidump\\minidump.dmp",
        crate::settings::mount_root(),
        pid
    );
    if std::fs::metadata(&minidump)
        .map(|m| m.is_file() && m.len() > 0)
        .unwrap_or(false)
    {
        debug_info!("[*] 使用 MemProcFS 现成 minidump: {}", minidump);
        return Ok(minidump);
    }

    // 兜底：用 Volatility3 windows.memmap 现场 dump 进程内存
    let settings = settings::load_settings()?;

    let python = settings.python3_path.trim().to_string();
    let vol3 = settings.volatility3_path.trim().to_string();
    let image = settings.current_image_path.trim().to_string();

    if python.is_empty() {
        return Err("未配置 Python3 路径".to_string());
    }
    if vol3.is_empty() {
        return Err("未配置 Volatility3 路径(vol.py)".to_string());
    }
    if image.is_empty() {
        return Err("未检测到已加载的内存镜像路径".to_string());
    }

    let config = volatility3::Volatility3Config {
        python_path: python,
        volatility3_path: vol3,
        image_path: image,
    };

    let out_dir = output_dir
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| format!("{}/volatility3", settings.output_path));

    debug_info!("[*] Dump 进程内存: pid={}, 输出目录={}", pid, out_dir);

    volatility3::dump_process_memory_command(&config, pid, false, &out_dir, Some(app_handle)).await
}

/// 按偏移导出文件（windows.dumpfiles）——供 FileScan 视图右键"导出文件"使用。
/// 返回导出的文件绝对路径列表。
#[tauri::command]
pub async fn dump_files_by_offset(
    offset: String,
    file_name: Option<String>,
    output_dir: Option<String>,
    app_handle: tauri::AppHandle,
) -> Result<Vec<String>, String> {
    let settings = settings::load_settings()?;

    let python = settings.python3_path.trim().to_string();
    let vol3 = settings.volatility3_path.trim().to_string();
    let image = settings.current_image_path.trim().to_string();

    if python.is_empty() {
        return Err("未配置 Python3 路径".to_string());
    }
    if vol3.is_empty() {
        return Err("未配置 Volatility3 路径(vol.py)".to_string());
    }
    if image.is_empty() {
        return Err("未检测到已加载的内存镜像路径".to_string());
    }

    let config = volatility3::Volatility3Config {
        python_path: python,
        volatility3_path: vol3,
        image_path: image,
    };

    let out_dir = output_dir
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| format!("{}/volatility3", settings.output_path));

    debug_info!("[*] 导出文件: offset={}, 输出目录={}", offset, out_dir);

    volatility3::dump_files_by_offset_command(
        &config,
        &offset,
        file_name.as_deref(),
        false,
        &out_dir,
        Some(app_handle),
    )
    .await
}
