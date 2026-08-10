//! Volatility2 命令模块
//!
//! 提供 Volatility2 相关的 Tauri 命令包装

use crate::loadmem;
use crate::settings;
use crate::volatility2;
use tauri::Emitter;

/// 执行 Volatility2 命令
#[tauri::command]
pub async fn execute_volatility2(
    python2_path: String,
    volatility2_path: String,
    volatility2_plugin: String,
    image_path: String,
    profile: String,
    plugin: String,
    output_type: String,
    output_file: String,
    extra_args: Option<Vec<String>>,
) -> Result<volatility2::Volatility2Result, String> {
    // 创建配置
    let config = volatility2::Volatility2Config {
        python2_path,
        volatility2_path,
        volatility2_plugin,
        image_path: image_path.clone(),
    };

    // 插件结果缓存：缓存 key 纳入 profile、输出格式与额外参数，确保参数变化即重跑
    let cache_enabled = crate::vol_cache::is_cache_enabled();
    let image_key = crate::vol_cache::compute_image_key(&image_path);
    let cache_args = format!(
        "profile={}|type={}|args={}",
        profile,
        output_type,
        extra_args.as_ref().map(|a| a.join(" ")).unwrap_or_default()
    );
    let cache_key = crate::vol_cache::compute_cache_key(&image_key, "vol2", &plugin, &cache_args);

    if cache_enabled && let Some(entry) = crate::vol_cache::get_cached(&cache_key) {
        return Ok(volatility2::Volatility2Result {
            success: true,
            output_file: entry.output_file,
            message: "来自缓存".to_string(),
            stdout: entry.stdout,
            stderr: entry.stderr,
            from_cache: true,
        });
    }

    match volatility2::execute_volatility2_command(
        &config,
        &profile,
        &plugin,
        &output_type,
        &output_file,
        extra_args,
    )
    .await
    {
        Ok(result) => {
            if cache_enabled && result.success {
                let _ = crate::vol_cache::store_cache(
                    &cache_key,
                    &image_key,
                    "vol2",
                    &plugin,
                    &cache_args,
                    &output_type,
                    &result.output_file,
                    &result.stdout,
                    &result.stderr,
                );
            }
            Ok(result)
        }
        Err(e) => Err(e),
    }
}

/// 获取 Volatility2 插件列表
#[tauri::command]
pub async fn get_volatility2_plugins() -> Result<Vec<String>, String> {
    let settings = settings::load_settings()?;
    let config = volatility2::Volatility2Config {
        python2_path: settings.python2_path,
        volatility2_path: settings.volatility2_path,
        volatility2_plugin: String::new(),
        image_path: String::new(),
    };
    volatility2::get_volatility2_plugins(&config).await
}

/// 获取 Volatility2 Profile 列表
#[tauri::command]
pub async fn get_volatility2_profiles() -> Result<Vec<String>, String> {
    let settings = settings::load_settings()?;
    let config = volatility2::Volatility2Config {
        python2_path: settings.python2_path,
        volatility2_path: settings.volatility2_path,
        volatility2_plugin: String::new(),
        image_path: String::new(),
    };
    volatility2::get_volatility2_profiles(&config).await
}

/// JSON 转 CSV 命令
#[tauri::command]
pub async fn json_to_csv_command(json_file_path: String) -> Result<String, String> {
    volatility2::json_to_csv(&json_file_path).await
}

/// 保存 Volatility2 Profile（使用原子更新，避免与其他设置保存操作竞态）
#[tauri::command]
pub async fn save_volatility2_profile(profile: String) -> Result<(), String> {
    debug_info!("DEBUG: 准备保存 volatility2_profile: {}", profile);
    settings::update_settings(|s| {
        debug_info!(
            "DEBUG: 保存前，当前设置中的 volatility2_profile: {}",
            s.volatility2_profile
        );
        s.volatility2_profile = profile.clone();
    })?;
    debug_info!("DEBUG: volatility2_profile 已保存: {}", profile);
    Ok(())
}

/// 重试 Profile 检测
#[tauri::command]
pub async fn retry_profile_detection(app_handle: tauri::AppHandle) -> Result<(), String> {
    debug_info!("开始重新检测 Volatility2 Profile...");

    // 获取当前设置
    let settings = settings::load_settings()?;

    // 获取当前镜像路径
    let current_image_path = settings.current_image_path.clone();
    if current_image_path.is_empty() {
        return Err("没有加载的内存镜像，无法检测Profile".to_string());
    }

    // 在后台执行 profile 检测
    let settings_clone = settings.clone();
    let image_path_clone = current_image_path.clone();
    let app_handle_clone = app_handle.clone();

    tokio::spawn(async move {
        debug_info!("后台开始重新检测profile");
        match loadmem::get_profile_info(
            &settings_clone,
            &image_path_clone,
            Some(app_handle_clone.clone()),
        )
        .await
        {
            Ok(info) => {
                if !info.profile_list.is_empty() {
                    debug_info!("重新检测Profile成功: {:?}", info);

                    // 发送成功事件，重新启用 Volatility2 区域
                    let _ = app_handle_clone.emit(
                        "profile_detection_success",
                        serde_json::json!({
                            "detected_os": info.detected_os,
                            "suggested_profile": info.suggested_profile,
                            "profile_list": info.profile_list
                        }),
                    );
                } else {
                    debug_warn!("重新检测Profile失败：未检测到有效Profile");

                    // 发送失败事件
                    let _ = app_handle_clone.emit(
                        "profile_detection_failed",
                        serde_json::json!({
                            "reason": "no_valid_profile_detected",
                            "message": "重新检测失败：未检测到有效Profile"
                        }),
                    );
                }
            }
            Err(e) => {
                debug_error!("重新检测Profile失败: {}", e);

                // 发送失败事件
                let _ = app_handle_clone.emit(
                    "profile_detection_failed",
                    serde_json::json!({
                        "reason": "retry_detection_failed",
                        "message": format!("重新检测Profile失败: {}", e)
                    }),
                );
            }
        }
    });

    Ok(())
}

/// 创建 Volatility2 输出目录
#[tauri::command]
pub async fn create_volatility2_output_dir() -> Result<String, String> {
    let settings = settings::load_settings()?;
    let output_dir = format!("{}/volatility2", settings.output_path);
    volatility2::create_output_dir(&output_dir).await?;
    Ok(output_dir)
}
