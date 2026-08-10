use crate::settings::load_settings;
use std::collections::HashMap;
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

/// 检测当前平台是否为 macOS
fn is_macos() -> bool {
    cfg!(target_os = "macos")
}

/// 根据平台决定是否使用装饰（标题栏）
pub fn should_use_decorations() -> bool {
    is_macos()
}

/// 最小化窗口
#[tauri::command]
pub async fn minimize_window(window: tauri::Window) -> Result<(), String> {
    window
        .minimize()
        .map_err(|e| format!("最小化窗口失败: {}", e))?;
    Ok(())
}

/// 切换最大化状态
#[tauri::command]
pub async fn toggle_maximize(window: tauri::Window) -> Result<(), String> {
    let is_maximized = window
        .is_maximized()
        .map_err(|e| format!("检查窗口状态失败: {}", e))?;
    if is_maximized {
        window
            .unmaximize()
            .map_err(|e| format!("取消最大化失败: {}", e))?;
    } else {
        window
            .maximize()
            .map_err(|e| format!("最大化失败: {}", e))?;
    }
    Ok(())
}

/// 关闭窗口
#[tauri::command]
pub async fn close_window(window: tauri::Window) -> Result<(), String> {
    window.close().map_err(|e| format!("关闭窗口失败: {}", e))?;
    Ok(())
}

/// 打开CSV查看器
#[tauri::command]
pub async fn open_csv_viewer(
    app: tauri::AppHandle,
    csv_file_path: String,
    window_title: String,
    search_query: Option<String>,
) -> Result<(), String> {
    debug_info!("🔍 开始打开CSV查看器，文件路径: {}", csv_file_path);
    if let Some(ref query) = search_query {
        debug_info!("🔍 搜索关键字: {}", query);
    }

    // 确定完整的文件路径 - 如果传入的是文件名，则从输出目录构建完整路径
    let full_path = if std::path::Path::new(&csv_file_path).is_absolute() {
        debug_info!("📁 使用绝对路径: {}", csv_file_path);
        csv_file_path.clone()
    } else {
        // 相对路径，从设置中获取输出目录
        debug_info!("📁 处理相对路径，加载设置...");
        let settings = match load_settings() {
            Ok(s) => {
                debug_info!("✅ 设置加载成功，输出路径: {}", s.output_path);
                s
            }
            Err(e) => {
                debug_info!("❌ 设置加载失败: {}, 使用默认输出路径", e);
                crate::types::AppSettings::default()
            }
        };
        let output_dir = std::path::Path::new(&settings.output_path);
        let constructed_path = output_dir
            .join(&csv_file_path)
            .to_string_lossy()
            .to_string();
        debug_info!("📁 构建完整路径: {}", constructed_path);
        constructed_path
    };

    // 检查CSV文件是否存在
    debug_info!("🔍 检查CSV文件是否存在: {}", full_path);
    if !std::path::Path::new(&full_path).exists() {
        debug_info!("❌ CSV文件不存在: {}", full_path);
        return Err(format!("未正常加载Memprocfs数据: {}", full_path));
    }
    debug_info!("✅ CSV文件存在，继续处理");

    // 创建新的CSV查看器窗口
    // 使用UUID作为窗口标签，避免时间戳不一致问题
    let window_id = uuid::Uuid::new_v4().to_string().replace("-", "")[..16].to_string();
    let window_label = format!("csv-viewer-{}", window_id);

    let webview_window = WebviewWindowBuilder::new(
        &app,
        &window_label,
        WebviewUrl::App("csv_viewer.html".into()),
    )
    .title(window_title)
    .inner_size(1400.0, 900.0)
    .min_inner_size(900.0, 600.0)
    .resizable(true)
    .maximizable(true)
    .center()
    .decorations(should_use_decorations()) // 平台特定的装饰设置
    .focused(true)
    .always_on_top(false)
    .skip_taskbar(false) // 在任务栏显示，表现为独立窗口
    .build()
    .map_err(|e| format!("创建窗口失败: {}", e))?;

    // 在生产环境中禁用开发者工具
    #[cfg(not(debug_assertions))]
    {
        webview_window
            .eval(
                "
            // 禁用开发者工具快捷键
            window.addEventListener('keydown', (e) => {
                if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I')) {
                    e.preventDefault();
                    return false;
                }
            }, true);

            // 禁用右键菜单
            window.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                return false;
            }, true);
        ",
            )
            .expect("Failed to inject devtools blocking script");
    }

    // 异步加载CSV数据
    let full_path_clone = full_path.clone();
    let webview_window_clone = webview_window.clone();
    let window_label_clone = window_label.clone();
    let search_query_clone = search_query.clone();

    debug_info!(
        "🚀 启动异步CSV数据加载任务，窗口标签: {}",
        window_label_clone
    );
    tokio::spawn(async move {
        // 延迟确保窗口完全加载
        debug_info!("⏳ 等待窗口完全加载...");
        tokio::time::sleep(tokio::time::Duration::from_millis(1500)).await;

        debug_info!("📊 开始加载CSV文件: {}", full_path_clone);
        match load_csv_file_optimized(&full_path_clone, &webview_window_clone, &window_label_clone)
            .await
        {
            Ok(_) => {
                debug_info!("✅ CSV文件加载完成: {}", full_path_clone);

                // 如果有搜索关键字，发送搜索事件
                if let Some(query) = search_query_clone {
                    let search_event_name = format!("csv-search-query-{}", window_label_clone);
                    debug_info!(
                        "📤 发送搜索关键字事件: {}, 关键字: {}",
                        search_event_name,
                        query
                    );
                    if let Err(emit_err) = webview_window_clone.emit(&search_event_name, &query) {
                        debug_info!("❌ 发送搜索关键字事件失败: {}", emit_err);
                    } else {
                        debug_info!("✅ 搜索关键字事件发送成功");
                    }
                }
            }
            Err(e) => {
                debug_info!("❌ CSV文件加载失败: {}", e);
                let error_event_name = format!("csv-error-{}", window_label_clone);
                debug_info!("📤 发送错误事件: {}", error_event_name);
                if let Err(emit_err) =
                    webview_window_clone.emit(&error_event_name, &format!("加载失败: {}", e))
                {
                    debug_info!("❌ 发送错误事件失败: {}", emit_err);
                } else {
                    debug_info!("✅ 错误事件发送成功");
                }
            }
        }
    });

    Ok(())
}

/// 打开文本查看器
#[tauri::command]
pub async fn open_text_viewer(
    app: tauri::AppHandle,
    text_file_path: String,
    window_title: String,
    search_query: Option<String>,
) -> Result<(), String> {
    debug_info!("🔍 开始打开文本查看器，文件路径: {}", text_file_path);
    if let Some(ref query) = search_query {
        debug_info!("🔍 搜索关键字: {}", query);
    }

    // 确定完整的文件路径 - 如果传入的是文件名，则从输出目录构建完整路径
    let full_path = if std::path::Path::new(&text_file_path).is_absolute() {
        debug_info!("📁 使用绝对路径: {}", text_file_path);
        text_file_path.clone()
    } else {
        // 相对路径，从设置中获取输出目录
        debug_info!("📁 处理相对路径，加载设置...");
        let settings = match load_settings() {
            Ok(s) => {
                debug_info!("✅ 设置加载成功，输出路径: {}", s.output_path);
                s
            }
            Err(e) => {
                debug_info!("❌ 设置加载失败: {}, 使用默认输出路径", e);
                crate::types::AppSettings::default()
            }
        };
        let output_dir = std::path::Path::new(&settings.output_path);
        let constructed_path = output_dir
            .join(&text_file_path)
            .to_string_lossy()
            .to_string();
        debug_info!("📁 构建完整路径: {}", constructed_path);
        constructed_path
    };

    // 检查文本文件是否存在
    debug_info!("🔍 检查文本文件: {}", full_path);
    if !std::path::Path::new(&full_path).exists() {
        debug_info!("❌ 文本文件不存在: {}", full_path);
        return Err(format!("文本文件不存在: {}", full_path));
    }
    debug_info!("✅ 文本文件存在，开始读取");

    // 创建新的文本查看器窗口
    // 使用UUID作为窗口标签，避免时间戳不一致和中文文件名问题
    let window_id = uuid::Uuid::new_v4().to_string().replace("-", "")[..16].to_string();
    let window_label = format!("text-viewer-{}", window_id);

    debug_info!("🏷️ 创建文本查看器窗口，标签: {}", window_label);
    let webview_window = WebviewWindowBuilder::new(
        &app,
        &window_label,
        WebviewUrl::App("text_viewer.html".into()),
    )
    .title(window_title)
    .inner_size(1200.0, 800.0)
    .min_inner_size(600.0, 400.0)
    .resizable(true)
    .maximizable(true)
    .center()
    .decorations(should_use_decorations()) // 平台特定的装饰设置
    .focused(true)
    .always_on_top(false)
    .skip_taskbar(false) // 在任务栏显示，表现为独立窗口
    .build()
    .map_err(|e| format!("创建窗口失败: {}", e))?;

    // 在生产环境中禁用开发者工具
    #[cfg(not(debug_assertions))]
    {
        webview_window
            .eval(
                "
            // 禁用开发者工具快捷键
            window.addEventListener('keydown', (e) => {
                if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I')) {
                    e.preventDefault();
                    return false;
                }
            }, true);

            // 禁用右键菜单
            window.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                return false;
            }, true);
        ",
            )
            .expect("Failed to inject devtools blocking script");
    }

    // 读取文件内容
    debug_info!("📖 开始读取文件内容: {}", full_path);
    let file_content = match std::fs::read(&full_path) {
        Ok(bytes) => {
            debug_info!("✅ 文件读取成功，大小: {} 字节", bytes.len());
            // 始终发送原始二进制数据，让前端根据编码选择进行解码
            // 这样前端可以切换不同的编码（UTF-8, UTF-16 LE, UTF-16 BE, GBK等）
            debug_info!("🔢 发送原始二进制数据，前端将根据编码选择进行解码");
            serde_json::json!({
                "type": "binary",
                "content": bytes
            })
        }
        Err(e) => {
            debug_info!("❌ 读取文件失败: {}", e);
            return Err(format!("读取文本文件失败: {}", e));
        }
    };

    // 提取文件名和文件信息
    let file_path = std::path::Path::new(&full_path);
    let filename = file_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("未知文件")
        .to_string();

    let file_size = match std::fs::metadata(&full_path) {
        Ok(metadata) => metadata.len(),
        Err(_) => 0,
    };

    let file_extension = file_path
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_string();

    let text_data = serde_json::json!({
        "filename": filename,
        "path": full_path,
        "size": file_size,
        "extension": file_extension,
        "data": file_content
    });

    // 延迟发送数据，确保窗口完全加载
    let webview_window_clone = webview_window.clone();
    let window_label_clone = window_label.clone();
    let search_query_clone = search_query.clone();
    debug_info!(
        "🚀 启动异步文本数据发送任务，窗口标签: {}",
        window_label_clone
    );
    tokio::spawn(async move {
        debug_info!("⏳ 等待窗口完全加载...");
        tokio::time::sleep(tokio::time::Duration::from_millis(1500)).await;

        // 使用窗口特定的事件名，与前端保持一致
        let text_event_name = format!("text-data-{}", window_label_clone);
        let data_size = serde_json::to_string(&text_data).unwrap_or_default().len();
        debug_info!(
            "📤 发送文本数据事件: {} (数据大小: {} 字节)",
            text_event_name,
            data_size
        );

        if let Err(e) = webview_window_clone.emit(&text_event_name, &text_data) {
            debug_error!("❌ 发送窗口特定文本数据失败: {}", e);

            // 如果窗口特定事件失败，尝试发送通用事件作为备用
            debug_info!("🔄 尝试发送通用文本数据事件作为备用");
            if let Err(e2) = webview_window_clone.emit("text-data", &text_data) {
                debug_error!("❌ 发送备用文本数据事件也失败: {}", e2);
            } else {
                debug_info!("✅ 通用文本数据事件发送成功");
            }
        } else {
            debug_info!("✅ 窗口特定文本数据事件发送成功");

            // 如果有搜索关键字，发送搜索事件
            if let Some(query) = search_query_clone {
                let search_event_name = format!("text-search-query-{}", window_label_clone);
                debug_info!(
                    "📤 发送搜索关键字事件: {}, 关键字: {}",
                    search_event_name,
                    query
                );
                if let Err(emit_err) = webview_window_clone.emit(&search_event_name, &query) {
                    debug_info!("❌ 发送搜索关键字事件失败: {}", emit_err);
                } else {
                    debug_info!("✅ 搜索关键字事件发送成功");
                }
            }
        }
    });

    Ok(())
}

/// 优化的CSV文件加载函数，支持大文件分块处理
async fn load_csv_file_optimized(
    file_path: &str,
    webview_window: &tauri::WebviewWindow,
    window_label: &str,
) -> Result<(), String> {
    use std::fs::File;

    // 检查文件大小
    let file_metadata =
        std::fs::metadata(file_path).map_err(|e| format!("无法获取文件信息: {}", e))?;
    let file_size = file_metadata.len();

    debug_info!(
        "📊 开始加载CSV文件: {}, 大小: {} bytes ({:.2} MB)",
        file_path,
        file_size,
        file_size as f64 / 1024.0 / 1024.0
    );

    // 发送加载开始事件
    let progress_event_name = format!("csv-progress-{}", window_label);
    debug_info!("📤 发送CSV加载开始事件: {}", progress_event_name);
    match webview_window.emit(
        &progress_event_name,
        serde_json::json!({
            "type": "start",
            "message": "开始读取文件...",
            "progress": 0
        }),
    ) {
        Ok(_) => {
            debug_info!("✅ 加载开始事件发送成功");
        }
        Err(e) => {
            debug_info!("❌ 加载开始事件发送失败: {}", e);
        }
    }

    // 打开文件
    let file = File::open(file_path).map_err(|e| format!("无能打开文件: {}", e))?;

    // 使用内存映射和分块读取，大幅提升性能
    const BATCH_SIZE: usize = 50000; // 每批处理10000行

    // 使用内存映射读取文件
    let mmap = unsafe {
        memmap2::MmapOptions::new()
            .map(&file)
            .map_err(|e| format!("内存映射失败: {}", e))?
    };

    // 将整个文件转换为字符串
    let file_content = std::str::from_utf8(&mmap).map_err(|e| format!("UTF-8解码失败: {}", e))?;

    // 找到第一行（表头）
    let mut lines_iter = file_content.lines();
    let first_line = lines_iter.next().ok_or("文件为空")?;

    // 解析表头
    let headers = parse_csv_line(first_line.trim(), ',');

    // 发送表头信息
    let _ = webview_window.emit(
        &progress_event_name,
        serde_json::json!({
            "type": "headers",
            "headers": headers,
            "message": "表头解析完成，开始读取数据...",
            "progress": 5
        }),
    );

    let mut line_count = 0;
    let mut batch_count = 0;

    // 收集所有数据行
    let data_lines: Vec<&str> = lines_iter.filter(|line| !line.trim().is_empty()).collect();

    let total_lines = data_lines.len();

    // 分批处理数据
    for (chunk_idx, chunk) in data_lines.chunks(BATCH_SIZE).enumerate() {
        // 并行处理当前批次的行数据
        use rayon::prelude::*;
        let chunk_rows: Vec<HashMap<String, String>> = chunk
            .par_iter()
            .map(|line| {
                let row_values = parse_csv_line(line.trim(), ',');
                let mut row_data = HashMap::new();

                for (i, value) in row_values.iter().enumerate() {
                    if let Some(header) = headers.get(i) {
                        row_data.insert(header.clone(), value.clone());
                    }
                }

                row_data
            })
            .collect();

        // 更新计数
        line_count += chunk_rows.len();
        batch_count += 1;

        // 发送批次数据
        let batch_event_name = format!("csv-batch-{}", window_label);
        let _ = webview_window.emit(
            &batch_event_name,
            serde_json::json!({
                "batch_number": batch_count,
                "rows": chunk_rows,
                "is_final": chunk_idx == data_lines.chunks(BATCH_SIZE).len() - 1
            }),
        );

        // 发送进度更新
        let progress = std::cmp::min(
            90,
            ((chunk_idx + 1) * 80 / data_lines.chunks(BATCH_SIZE).len()) as u32 + 10,
        );
        let _ = webview_window.emit(
            &progress_event_name,
            serde_json::json!({
                "type": "progress",
                "message": format!("已处理 {} 行数据（第 {} 批）...", line_count, batch_count),
                "progress": progress
            }),
        );

        // 让出CPU时间
        tokio::task::yield_now().await;
    }

    // 提取文件名
    let filename = std::path::Path::new(file_path)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("未知文件")
        .to_string();

    // 发送完成事件
    let complete_event_name = format!("csv-complete-{}", window_label);
    let _ = webview_window.emit(
        &complete_event_name,
        serde_json::json!({
            "filename": filename,
            "total_rows": total_lines,
            "total_batches": batch_count,
            "headers": headers
        }),
    );

    // 发送进度完成
    let _ = webview_window.emit(
        &progress_event_name,
        serde_json::json!({
            "type": "complete",
            "message": format!("加载完成！共 {} 行数据", total_lines),
            "progress": 100
        }),
    );

    // 发送主题数据
    if let Ok(settings) = load_settings() {
        let theme_data = serde_json::json!({
            "current_theme": settings.theme.current_theme
        });

        let theme_event_name = format!("theme-data-{}", window_label);
        let _ = webview_window.emit(&theme_event_name, &theme_data);
    }

    debug_info!(
        "CSV文件加载完成: {} 行数据，{} 个批次",
        total_lines,
        batch_count
    );
    Ok(())
}

/// 快速解析CSV行，优化性能
fn parse_csv_line(line: &str, delimiter: char) -> Vec<String> {
    // 对于简单情况（无引号），使用快速分割
    if !line.contains('"') {
        return line
            .split(delimiter)
            .map(|s| s.trim().to_string())
            .collect();
    }

    // 复杂情况使用完整解析
    let mut values = Vec::new();
    let mut current = String::with_capacity(64); // 预分配容量
    let mut in_quotes = false;
    let mut chars = line.chars();

    while let Some(ch) = chars.next() {
        match ch {
            '"' => {
                if in_quotes {
                    // 检查是否是转义的引号
                    match chars.as_str().chars().next() {
                        Some('"') => {
                            current.push('"');
                            chars.next(); // 跳过下一个引号
                        }
                        _ => {
                            in_quotes = false;
                        }
                    }
                } else {
                    in_quotes = true;
                }
            }
            c if c == delimiter && !in_quotes => {
                values.push(current.trim().to_string());
                current.clear();
            }
            _ => {
                current.push(ch);
            }
        }
    }

    // 添加最后一个值
    values.push(current.trim().to_string());
    values
}

/// 打开注册表查看器
#[tauri::command]
pub async fn open_registry_viewer(
    app: tauri::AppHandle,
    registry_file_path: String,
    window_title: String,
) -> Result<(), String> {
    debug_info!("🔍 开始打开注册表查看器，文件路径: {}", registry_file_path);

    // 确定完整的文件路径
    let full_path = if std::path::Path::new(&registry_file_path).is_absolute() {
        debug_info!("📁 使用绝对路径: {}", registry_file_path);
        registry_file_path.clone()
    } else {
        // 相对路径，从设置中获取输出目录
        debug_info!("📁 处理相对路径，加载设置...");
        let settings = match load_settings() {
            Ok(s) => {
                debug_info!("✅ 设置加载成功，输出路径: {}", s.output_path);
                s
            }
            Err(e) => {
                debug_info!("❌ 设置加载失败: {}, 使用默认输出路径", e);
                crate::types::AppSettings::default()
            }
        };
        let output_dir = std::path::Path::new(&settings.output_path);
        let constructed_path = output_dir
            .join(&registry_file_path)
            .to_string_lossy()
            .to_string();
        debug_info!("📁 构建完整路径: {}", constructed_path);
        constructed_path
    };

    // 检查注册表文件是否存在
    debug_info!("🔍 检查注册表文件: {}", full_path);
    if !std::path::Path::new(&full_path).exists() {
        debug_info!("❌ 注册表文件不存在: {}", full_path);
        return Err(format!("注册表文件不存在: {}", full_path));
    }
    debug_info!("✅ 注册表文件存在，继续处理");

    // 创建新的注册表查看器窗口
    let window_id = uuid::Uuid::new_v4().to_string().replace("-", "")[..16].to_string();
    let window_label = format!("registry-viewer-{}", window_id);

    debug_info!("🏷️ 创建注册表查看器窗口，标签: {}", window_label);
    let webview_window = WebviewWindowBuilder::new(
        &app,
        &window_label,
        WebviewUrl::App("registry_viewer.html".into()),
    )
    .title(window_title)
    .inner_size(1400.0, 900.0)
    .min_inner_size(800.0, 600.0)
    .resizable(true)
    .maximizable(true)
    .center()
    .decorations(should_use_decorations()) // 平台特定的装饰设置
    .focused(true)
    .always_on_top(false)
    .skip_taskbar(false)
    .build()
    .map_err(|e| format!("创建窗口失败: {}", e))?;

    debug_info!("✅ 注册表查看器窗口创建成功");

    // 克隆必要的变量用于异步任务
    let full_path_clone = full_path.clone();
    let webview_window_clone = webview_window.clone();
    let window_label_clone = window_label.clone();

    // 启动异步注册表数据加载任务
    debug_info!(
        "🚀 启动异步注册表数据加载任务，窗口标签: {}",
        window_label_clone
    );
    tokio::spawn(async move {
        // 延迟确保窗口完全加载
        debug_info!("⏳ 等待窗口完全加载...");
        tokio::time::sleep(tokio::time::Duration::from_millis(1500)).await;

        debug_info!("📊 开始懒加载注册表文件: {}", full_path_clone);

        // 发送开始解析事件
        let progress_event_name = format!("registry-progress-{}", window_label_clone);
        let data_event_name = format!("registry-data-{}", window_label_clone);

        let _ = webview_window_clone.emit(
            &progress_event_name,
            serde_json::json!({
                "stage": "initializing",
                "message": "正在初始化注册表文件..."
            }),
        );

        // 使用懒加载解析
        match crate::registry_parser::parse_registry_file_lazy(&full_path_clone) {
            Ok(registry_data) => {
                debug_info!("✅ 注册表文件懒加载完成");

                // 发送初始数据（只包含根键和直接子键名称）
                let payload = serde_json::json!({
                    "registry_data": registry_data,
                    "filename": std::path::Path::new(&full_path_clone)
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("Unknown"),
                    "file_path": full_path_clone,
                    "lazy_loaded": true
                });

                debug_info!("📤 发送懒加载注册表数据事件: {}", data_event_name);
                if let Err(emit_err) = webview_window_clone.emit(&data_event_name, &payload) {
                    debug_info!("❌ 发送懒加载注册表数据事件失败: {}", emit_err);
                } else {
                    debug_info!("✅ 懒加载注册表数据事件发送成功");
                }
            }
            Err(e) => {
                debug_info!("❌ 注册表文件解析失败: {}", e);
                let error_event_name = format!("registry-error-{}", window_label_clone);
                debug_info!("📤 发送错误事件: {}", error_event_name);
                if let Err(emit_err) =
                    webview_window_clone.emit(&error_event_name, &format!("解析失败: {}", e))
                {
                    debug_info!("❌ 发送错误事件失败: {}", emit_err);
                } else {
                    debug_info!("✅ 错误事件发送成功");
                }
            }
        }
    });

    Ok(())
}

/// 打开文件管理器窗口
#[tauri::command]
pub async fn open_file_manager(app: tauri::AppHandle) -> Result<(), String> {
    debug_info!("🗂️ 开始打开文件管理器窗口");

    // 创建新的文件管理器窗口
    let window_id = uuid::Uuid::new_v4().to_string().replace("-", "")[..16].to_string();
    let window_label = format!("file-manager-{}", window_id);

    debug_info!("🏷️ 创建文件管理器窗口，标签: {}", window_label);
    let webview_window = WebviewWindowBuilder::new(
        &app,
        &window_label,
        WebviewUrl::App("file_manager.html".into()),
    )
    .title("文件管理器 - Lovelymem V2")
    .inner_size(1000.0, 700.0)
    .min_inner_size(800.0, 600.0)
    .resizable(true)
    .maximizable(true)
    .center()
    .decorations(should_use_decorations()) // 平台特定的装饰设置
    .focused(true)
    .always_on_top(false)
    .skip_taskbar(false) // 在任务栏显示，表现为独立窗口
    .build()
    .map_err(|e| format!("创建窗口失败: {}", e))?;

    // 在生产环境中禁用开发者工具
    #[cfg(not(debug_assertions))]
    {
        let _ = webview_window
            .eval(
                "
            // 禁用开发者工具快捷键
            window.addEventListener('keydown', (e) => {
                if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I')) {
                    e.preventDefault();
                    return false;
                }
            }, true);

            // 禁用右键菜单
            window.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                return false;
            }, true);
        ",
            )
            .expect("Failed to inject devtools blocking script");
    }

    debug_info!("✅ 文件管理器窗口创建成功");
    Ok(())
}

/// 打开字符串搜索窗口
#[tauri::command]
pub async fn open_string_search_window(app_handle: tauri::AppHandle) -> Result<(), String> {
    use tauri::{WebviewUrl, WebviewWindowBuilder};

    debug_info!("🔤 开始创建字符串搜索窗口");

    let window_label = "string-search";

    // 检查窗口是否已经存在
    if let Some(existing_window) = app_handle.get_webview_window(window_label) {
        debug_info!("🔤 字符串搜索窗口已存在，聚焦到现有窗口");
        // 如果窗口已存在，则聚焦到该窗口
        existing_window
            .set_focus()
            .map_err(|e| format!("聚焦字符串搜索窗口失败: {}", e))?;
        return Ok(());
    }

    debug_info!("🔤 创建新的字符串搜索窗口");

    // 创建新的字符串搜索窗口
    let webview_window = WebviewWindowBuilder::new(
        &app_handle,
        window_label,
        WebviewUrl::App("string-search.html".into()),
    )
    .title("字符串搜索 - Lovelymem V2")
    .inner_size(1200.0, 800.0)
    .min_inner_size(800.0, 600.0)
    .center()
    .resizable(true)
    .decorations(should_use_decorations()) // 平台特定的装饰设置
    .focused(true)
    .always_on_top(false)
    .skip_taskbar(false) // 在任务栏显示，表现为独立窗口
    .build()
    .map_err(|e| {
        debug_info!("❌ 创建字符串搜索窗口失败: {}", e);
        format!("创建字符串搜索窗口失败: {}", e)
    })?;

    debug_info!("✅ 字符串搜索窗口已创建成功");

    // 在生产环境中禁用开发者工具
    #[cfg(not(debug_assertions))]
    {
        webview_window
            .eval(
                "
            // 禁用开发者工具快捷键
            window.addEventListener('keydown', (e) => {
                if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I')) {
                    e.preventDefault();
                    return false;
                }
            }, true);

            // 禁用右键菜单
            window.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                return false;
            }, true);
        ",
            )
            .expect("Failed to inject devtools blocking script");
    }

    Ok(())
}

/// 打开Image Finder窗口
#[tauri::command]
pub async fn open_image_finder_window(app_handle: tauri::AppHandle) -> Result<(), String> {
    use tauri::{WebviewUrl, WebviewWindowBuilder};

    debug_info!("🖼️ 开始创建Image Finder窗口");

    let window_label = "image-finder";

    // 检查窗口是否已经存在
    if let Some(existing_window) = app_handle.get_webview_window(window_label) {
        debug_info!("🖼️ Image Finder窗口已存在，聚焦到现有窗口");
        // 如果窗口已存在，则聚焦到该窗口
        existing_window
            .set_focus()
            .map_err(|e| format!("聚焦Image Finder窗口失败: {}", e))?;
        return Ok(());
    }

    debug_info!("🖼️ 创建新的Image Finder窗口");

    // 创建新的Image Finder窗口
    let webview_window = WebviewWindowBuilder::new(
        &app_handle,
        window_label,
        WebviewUrl::App("image-finder.html".into()),
    )
    .title("Image Finder - Lovelymem V2")
    .inner_size(1400.0, 900.0)
    .min_inner_size(1000.0, 700.0)
    .center()
    .resizable(true)
    .decorations(should_use_decorations()) // 平台特定的装饰设置
    .focused(true)
    .always_on_top(false)
    .skip_taskbar(false) // 在任务栏显示，表现为独立窗口
    .build()
    .map_err(|e| {
        debug_info!("❌ 创建Image Finder窗口失败: {}", e);
        format!("创建Image Finder窗口失败: {}", e)
    })?;

    debug_info!("✅ Image Finder窗口已创建成功");

    // 在生产环境中禁用开发者工具
    #[cfg(not(debug_assertions))]
    {
        webview_window
            .eval(
                "
            // 禁用开发者工具快捷键
            window.addEventListener('keydown', (e) => {
                if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I')) {
                    e.preventDefault();
                    return false;
                }
            }, true);

            // 禁用右键菜单
            window.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                return false;
            }, true);
        ",
            )
            .expect("Failed to inject devtools blocking script");
    }

    Ok(())
}

/// 打开「内存图像可视化」窗口（PixelWeaver）。
///
/// 可多开：每次新建带随机后缀的窗口 label，便于同时查看多个进程的内存。
/// 可选初始参数（文件路径/宽/高）在窗口加载后通过 `mem-img-init-{label}` 事件下发
/// （emit-after-load，与 csv_viewer 数据下发方式一致）。
#[tauri::command]
pub async fn open_memory_image_visualizer_window(
    app_handle: tauri::AppHandle,
    initial_file_path: Option<String>,
    initial_width: Option<u32>,
    initial_height: Option<u32>,
) -> Result<(), String> {
    debug_info!("🧩 开始创建内存图像可视化窗口");

    let suffix = uuid::Uuid::new_v4().simple().to_string();
    let window_label = format!("mem-img-visualizer-{}", &suffix[..12]);

    let webview_window = WebviewWindowBuilder::new(
        &app_handle,
        &window_label,
        WebviewUrl::App("memory-image-visualizer.html".into()),
    )
    .title("内存图像可视化 - Lovelymem V2")
    .inner_size(1500.0, 950.0)
    .min_inner_size(1000.0, 700.0)
    .center()
    .resizable(true)
    .decorations(should_use_decorations())
    .focused(true)
    .always_on_top(false)
    .skip_taskbar(false)
    .build()
    .map_err(|e| {
        debug_info!("❌ 创建内存图像可视化窗口失败: {}", e);
        format!("创建内存图像可视化窗口失败: {}", e)
    })?;

    debug_info!("✅ 内存图像可视化窗口已创建成功: {}", window_label);

    // 在生产环境中禁用开发者工具
    #[cfg(not(debug_assertions))]
    {
        webview_window
            .eval(
                "
            window.addEventListener('keydown', (e) => {
                if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I')) {
                    e.preventDefault();
                    return false;
                }
            }, true);
            window.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                return false;
            }, true);
        ",
            )
            .expect("Failed to inject devtools blocking script");
    }

    // 有初始参数时，等待页面加载后通过窗口作用域事件下发
    if initial_file_path.is_some() || initial_width.is_some() || initial_height.is_some() {
        let event_name = format!("mem-img-init-{}", window_label);
        let payload = serde_json::json!({
            "filePath": initial_file_path,
            "width": initial_width,
            "height": initial_height,
        });
        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(1500)).await;
            let _ = webview_window.emit(&event_name, payload);
        });
    }

    Ok(())
}

/// 打开Stegsolve分析器窗口
#[tauri::command]
pub async fn open_stegsolve_analyzer_window(app_handle: tauri::AppHandle) -> Result<(), String> {
    use tauri::{WebviewUrl, WebviewWindowBuilder};

    debug_info!("🔍 开始创建Stegsolve分析器窗口");

    let window_label = "stegsolve-analyzer";

    // 检查窗口是否已经存在
    if let Some(existing_window) = app_handle.get_webview_window(window_label) {
        debug_info!("🔍 Stegsolve分析器窗口已存在，聚焦到现有窗口");
        // 如果窗口已存在，则聚焦到该窗口
        existing_window
            .set_focus()
            .map_err(|e| format!("聚焦Stegsolve分析器窗口失败: {}", e))?;
        return Ok(());
    }

    debug_info!("🔍 创建新的Stegsolve分析器窗口");

    // 创建新的Stegsolve分析器窗口
    let webview_window = WebviewWindowBuilder::new(
        &app_handle,
        window_label,
        WebviewUrl::App("stegsolve-analyzer.html".into()),
    )
    .title("Stegsolve 隐写分析工具 - Lovelymem V2")
    .inner_size(1400.0, 900.0)
    .min_inner_size(1000.0, 700.0)
    .center()
    .resizable(true)
    .decorations(should_use_decorations()) // 平台特定的装饰设置
    .focused(true)
    .always_on_top(false)
    .skip_taskbar(false) // 在任务栏显示，表现为独立窗口
    .build()
    .map_err(|e| {
        debug_info!("❌ 创建Stegsolve分析器窗口失败: {}", e);
        format!("创建Stegsolve分析器窗口失败: {}", e)
    })?;

    debug_info!("✅ Stegsolve分析器窗口已创建成功");

    // 在生产环境中禁用开发者工具
    #[cfg(not(debug_assertions))]
    {
        webview_window
            .eval(
                "
            // 禁用开发者工具快捷键
            window.addEventListener('keydown', (e) => {
                if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I')) {
                    e.preventDefault();
                    return false;
                }
            }, true);

            // 禁用右键菜单
            window.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                return false;
            }, true);
        ",
            )
            .expect("Failed to inject devtools blocking script");
    }

    Ok(())
}

/// 打开位平面全览窗口
#[tauri::command]
pub async fn open_bit_plane_overview_window(app_handle: tauri::AppHandle) -> Result<(), String> {
    use tauri::{WebviewUrl, WebviewWindowBuilder};

    debug_info!("🔍 开始创建位平面全览窗口");

    let window_label = "bit-plane-overview";

    // 检查窗口是否已经存在
    if let Some(existing_window) = app_handle.get_webview_window(window_label) {
        debug_info!("🔍 位平面全览窗口已存在，聚焦到现有窗口");
        // 如果窗口已存在，则聚焦到该窗口
        existing_window
            .set_focus()
            .map_err(|e| format!("聚焦位平面全览窗口失败: {}", e))?;
        return Ok(());
    }

    debug_info!("🔍 创建新的位平面全览窗口");

    // 创建新的位平面全览窗口
    let webview_window = WebviewWindowBuilder::new(
        &app_handle,
        window_label,
        WebviewUrl::App("bit-plane-overview.html".into()),
    )
    .title("位平面全览 - Stegsolve分析器")
    .inner_size(1400.0, 900.0)
    .min_inner_size(1000.0, 700.0)
    .center()
    .resizable(true)
    .decorations(should_use_decorations()) // 平台特定的装饰设置
    .focused(true)
    .always_on_top(false)
    .skip_taskbar(false) // 在任务栏显示，表现为独立窗口
    .build()
    .map_err(|e| {
        debug_info!("❌ 创建位平面全览窗口失败: {}", e);
        format!("创建位平面全览窗口失败: {}", e)
    })?;

    debug_info!("✅ 位平面全览窗口已创建成功");

    // 在生产环境中禁用开发者工具
    #[cfg(not(debug_assertions))]
    {
        webview_window
            .eval(
                "
            // 禁用开发者工具快捷键
            window.addEventListener('keydown', (e) => {
                if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I')) {
                    e.preventDefault();
                    return false;
                }
            }, true);

            // 禁用右键菜单
            window.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                return false;
            }, true);
        ",
            )
            .expect("Failed to inject devtools blocking script");
    }

    Ok(())
}

/// 打开 Super Timeline（统一取证时间线）窗口
#[tauri::command]
pub async fn open_super_timeline_window(app_handle: tauri::AppHandle) -> Result<(), String> {
    use tauri::{WebviewUrl, WebviewWindowBuilder};

    debug_info!("[SuperTimeline] 开始创建统一取证时间线窗口");

    let window_label = "super-timeline";

    // 检查窗口是否已经存在
    if let Some(existing_window) = app_handle.get_webview_window(window_label) {
        debug_info!("[SuperTimeline] 窗口已存在，聚焦到现有窗口");
        existing_window
            .set_focus()
            .map_err(|e| format!("聚焦窗口失败: {}", e))?;
        return Ok(());
    }

    debug_info!("[SuperTimeline] 创建新的 Super Timeline 窗口");

    let webview_window = WebviewWindowBuilder::new(
        &app_handle,
        window_label,
        WebviewUrl::App("super-timeline.html".into()),
    )
    .title("Super Timeline - 统一取证时间线")
    .inner_size(1600.0, 1000.0)
    .min_inner_size(1000.0, 700.0)
    .center()
    .resizable(true)
    .decorations(should_use_decorations())
    .focused(true)
    .always_on_top(false)
    .skip_taskbar(false)
    .build()
    .map_err(|e| {
        debug_info!("[SuperTimeline] 创建窗口失败: {}", e);
        format!("创建 Super Timeline 窗口失败: {}", e)
    })?;

    debug_info!("[SuperTimeline] 窗口已创建成功");
    Ok(())
}

/// 获取指定目录下的所有CSV文件
#[tauri::command]
pub async fn get_csv_files_list(directory_path: String) -> Result<Vec<serde_json::Value>, String> {
    use std::fs;
    use std::time::SystemTime;

    debug_info!("📋 获取CSV文件列表，目录: {}", directory_path);

    let dir_path = std::path::Path::new(&directory_path);

    if !dir_path.exists() {
        return Err(format!("目录不存在: {}", directory_path));
    }

    if !dir_path.is_dir() {
        return Err(format!("路径不是目录: {}", directory_path));
    }

    let mut files = Vec::new();

    match fs::read_dir(dir_path) {
        Ok(entries) => {
            for entry in entries {
                if let Ok(entry) = entry {
                    let path = entry.path();

                    // 只处理CSV文件
                    if path.is_file() {
                        if let Some(ext) = path.extension() {
                            if ext.to_str().unwrap_or("").to_lowercase() == "csv" {
                                // 获取文件元数据
                                if let Ok(metadata) = fs::metadata(&path) {
                                    let size = metadata.len();
                                    let modified = metadata
                                        .modified()
                                        .ok()
                                        .and_then(|time| {
                                            time.duration_since(SystemTime::UNIX_EPOCH).ok()
                                        })
                                        .map(|duration| duration.as_secs())
                                        .unwrap_or(0);

                                    let file_name = path
                                        .file_name()
                                        .and_then(|n| n.to_str())
                                        .unwrap_or("unknown")
                                        .to_string();

                                    let file_path = path.to_str().unwrap_or("").to_string();

                                    files.push(serde_json::json!({
                                        "name": file_name,
                                        "path": file_path,
                                        "size": size,
                                        "modified": modified
                                    }));
                                }
                            }
                        }
                    }
                }
            }
        }
        Err(e) => {
            return Err(format!("读取目录失败: {}", e));
        }
    }

    // 按修改时间降序排序
    files.sort_by(|a, b| {
        let a_time = a.get("modified").and_then(|v| v.as_u64()).unwrap_or(0);
        let b_time = b.get("modified").and_then(|v| v.as_u64()).unwrap_or(0);
        b_time.cmp(&a_time)
    });

    debug_info!("✅ 找到 {} 个CSV文件", files.len());
    Ok(files)
}

/// 重新加载CSV文件到指定窗口
#[tauri::command]
pub async fn reload_csv_file(
    app: tauri::AppHandle,
    file_path: String,
    window_label: String,
) -> Result<(), String> {
    use std::fs;

    debug_info!("🔄 重新加载CSV文件: {}", file_path);
    debug_info!("🏷️ 目标窗口: {}", window_label);

    // 检查文件是否存在
    if !std::path::Path::new(&file_path).exists() {
        return Err(format!("文件不存在: {}", file_path));
    }

    // 获取窗口
    let webview_window = app
        .get_webview_window(&window_label)
        .ok_or_else(|| format!("未找到窗口: {}", window_label))?;

    // 读取CSV文件
    let csv_content = fs::read_to_string(&file_path).map_err(|e| format!("读取文件失败: {}", e))?;

    // 解析CSV
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(true)
        .from_reader(csv_content.as_bytes());

    // 获取表头
    let headers: Vec<String> = reader
        .headers()
        .map_err(|e| format!("读取表头失败: {}", e))?
        .iter()
        .map(|h| h.to_string())
        .collect();

    // 读取所有行
    let mut rows = Vec::new();
    for result in reader.records() {
        match result {
            Ok(record) => {
                let mut row_map = std::collections::HashMap::new();
                for (i, field) in record.iter().enumerate() {
                    if let Some(header) = headers.get(i) {
                        row_map.insert(header.clone(), field.to_string());
                    }
                }
                rows.push(row_map);
            }
            Err(e) => {
                debug_info!("⚠️ 跳过无效行: {}", e);
            }
        }
    }

    // 获取文件名
    let filename = std::path::Path::new(&file_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Unknown")
        .to_string();

    // 构建数据
    let csv_data = serde_json::json!({
        "filename": filename,
        "filepath": file_path,
        "headers": headers,
        "rows": rows
    });

    // 发送数据到窗口
    let event_name = format!("csv-data-{}", window_label);
    debug_info!("📤 发送CSV数据到事件: {}", event_name);

    webview_window
        .emit(&event_name, &csv_data)
        .map_err(|e| format!("发送数据失败: {}", e))?;

    debug_info!("✅ CSV文件重新加载完成，共 {} 行数据", rows.len());
    Ok(())
}

/// 读取进程CSV文件用于星图可视化
#[tauri::command]
pub async fn read_process_csv() -> Result<serde_json::Value, String> {
    use std::fs;

    debug_info!("🌌 读取进程CSV文件用于星图可视化");

    // 从设置中获取输出目录
    let settings = match load_settings() {
        Ok(s) => {
            debug_info!("✅ 设置加载成功，输出路径: {}", s.output_path);
            s
        }
        Err(e) => {
            debug_info!("❌ 设置加载失败: {}, 使用默认输出路径", e);
            crate::types::AppSettings::default()
        }
    };

    let output_dir = std::path::Path::new(&settings.output_path);
    let process_csv_path = output_dir.join("process.csv");

    debug_info!("📁 进程CSV文件路径: {}", process_csv_path.display());

    // 检查文件是否存在
    if !process_csv_path.exists() {
        debug_info!("❌ 进程CSV文件不存在");
        return Err("进程CSV文件不存在，请先加载内存镜像".to_string());
    }

    // 读取CSV文件
    let csv_content =
        fs::read_to_string(&process_csv_path).map_err(|e| format!("读取进程CSV文件失败: {}", e))?;

    // 解析CSV
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(true)
        .flexible(true)
        .from_reader(csv_content.as_bytes());

    // 获取表头
    let headers: Vec<String> = reader
        .headers()
        .map_err(|e| format!("读取表头失败: {}", e))?
        .iter()
        .map(|h| h.to_string())
        .collect();

    debug_info!("📋 CSV表头: {:?}", headers);

    // 读取所有行
    let mut rows: Vec<Vec<String>> = Vec::new();
    for result in reader.records() {
        match result {
            Ok(record) => {
                let row: Vec<String> = record.iter().map(|s| s.to_string()).collect();
                rows.push(row);
            }
            Err(e) => {
                debug_info!("⚠️ 跳过无效行: {}", e);
            }
        }
    }

    debug_info!("✅ 成功读取 {} 行进程数据", rows.len());

    Ok(serde_json::json!({
        "headers": headers,
        "rows": rows
    }))
}

/// 读取Volatility3 pstree CSV文件用于星图可视化（备用数据源）
#[tauri::command]
pub async fn read_vol3_pstree_csv() -> Result<serde_json::Value, String> {
    use std::fs;

    debug_info!("🌌 读取Volatility3 pstree CSV文件用于星图可视化");

    // 从设置中获取输出目录
    let settings = match load_settings() {
        Ok(s) => {
            debug_info!("✅ 设置加载成功，输出路径: {}", s.output_path);
            s
        }
        Err(e) => {
            debug_info!("❌ 设置加载失败: {}, 使用默认输出路径", e);
            crate::types::AppSettings::default()
        }
    };

    let output_dir = std::path::Path::new(&settings.output_path);
    let pstree_csv_path = output_dir.join("output_vol3_pstree.csv");

    debug_info!("📁 Vol3 pstree CSV文件路径: {}", pstree_csv_path.display());

    // 检查文件是否存在
    if !pstree_csv_path.exists() {
        debug_info!("⚠️ Vol3 pstree CSV文件不存在");
        return Err("Vol3 pstree CSV文件不存在".to_string());
    }

    // 读取CSV文件
    let csv_content = fs::read_to_string(&pstree_csv_path)
        .map_err(|e| format!("读取Vol3 pstree CSV文件失败: {}", e))?;

    // 解析CSV
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(true)
        .flexible(true)
        .from_reader(csv_content.as_bytes());

    // 获取表头
    let headers: Vec<String> = reader
        .headers()
        .map_err(|e| format!("读取表头失败: {}", e))?
        .iter()
        .map(|h| h.to_string())
        .collect();

    debug_info!("📋 Vol3 pstree CSV表头: {:?}", headers);

    // 读取所有行
    let mut rows: Vec<Vec<String>> = Vec::new();
    for result in reader.records() {
        match result {
            Ok(record) => {
                let row: Vec<String> = record.iter().map(|s| s.to_string()).collect();
                rows.push(row);
            }
            Err(e) => {
                debug_info!("⚠️ 跳过无效行: {}", e);
            }
        }
    }

    debug_info!("✅ 成功读取 {} 行Vol3 pstree数据", rows.len());

    Ok(serde_json::json!({
        "headers": headers,
        "rows": rows
    }))
}

/// 读取网络CSV文件用于星图可视化
#[tauri::command]
pub async fn read_network_csv() -> Result<serde_json::Value, String> {
    use std::fs;

    debug_info!("🌐 读取网络CSV文件用于星图可视化");

    // 从设置中获取输出目录
    let settings = match load_settings() {
        Ok(s) => {
            debug_info!("✅ 设置加载成功，输出路径: {}", s.output_path);
            s
        }
        Err(e) => {
            debug_info!("❌ 设置加载失败: {}, 使用默认输出路径", e);
            crate::types::AppSettings::default()
        }
    };

    let output_dir = std::path::Path::new(&settings.output_path);
    let net_csv_path = output_dir.join("net.csv");

    debug_info!("📁 网络CSV文件路径: {}", net_csv_path.display());

    // 检查文件是否存在
    if !net_csv_path.exists() {
        debug_info!("⚠️ 网络CSV文件不存在");
        return Ok(serde_json::json!({
            "headers": [],
            "rows": []
        }));
    }

    // 读取CSV文件
    let csv_content =
        fs::read_to_string(&net_csv_path).map_err(|e| format!("读取网络CSV文件失败: {}", e))?;

    // 解析CSV
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(true)
        .flexible(true)
        .from_reader(csv_content.as_bytes());

    // 获取表头
    let headers: Vec<String> = reader
        .headers()
        .map_err(|e| format!("读取表头失败: {}", e))?
        .iter()
        .map(|h| h.to_string())
        .collect();

    debug_info!("📋 CSV表头: {:?}", headers);

    // 读取所有行
    let mut rows: Vec<Vec<String>> = Vec::new();
    for result in reader.records() {
        match result {
            Ok(record) => {
                let row: Vec<String> = record.iter().map(|s| s.to_string()).collect();
                rows.push(row);
            }
            Err(e) => {
                debug_info!("⚠️ 跳过无效行: {}", e);
            }
        }
    }

    debug_info!("✅ 成功读取 {} 行网络数据", rows.len());

    Ok(serde_json::json!({
        "headers": headers,
        "rows": rows
    }))
}

/// 读取线程CSV文件用于星迹详情面板
#[tauri::command]
pub async fn read_threads_csv() -> Result<serde_json::Value, String> {
    use std::fs;

    debug_info!("🧵 读取线程CSV文件用于星迹详情");

    // 从设置中获取输出目录
    let settings = match load_settings() {
        Ok(s) => {
            debug_info!("✅ 设置加载成功，输出路径: {}", s.output_path);
            s
        }
        Err(e) => {
            debug_info!("❌ 设置加载失败: {}, 使用默认输出路径", e);
            crate::types::AppSettings::default()
        }
    };

    let output_dir = std::path::Path::new(&settings.output_path);

    // 尝试多个可能的线程文件名
    let possible_files = [
        "threads.csv",
        "output_vol3_threads.csv",
        "vol3_threads.csv",
        "vol2_threads.csv",
    ];

    let mut threads_csv_path = None;
    for filename in &possible_files {
        let path = output_dir.join(filename);
        if path.exists() {
            debug_info!("📁 找到线程文件: {}", path.display());
            threads_csv_path = Some(path);
            break;
        }
    }

    let threads_csv_path = match threads_csv_path {
        Some(path) => path,
        None => {
            debug_info!("⚠️ 未找到线程CSV文件");
            return Ok(serde_json::json!({
                "headers": [],
                "rows": []
            }));
        }
    };

    // 读取CSV文件
    let csv_content =
        fs::read_to_string(&threads_csv_path).map_err(|e| format!("读取线程CSV文件失败: {}", e))?;

    // 解析CSV
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(true)
        .flexible(true)
        .from_reader(csv_content.as_bytes());

    // 获取表头
    let headers: Vec<String> = reader
        .headers()
        .map_err(|e| format!("读取表头失败: {}", e))?
        .iter()
        .map(|h| h.to_string())
        .collect();

    debug_info!("📋 线程CSV表头: {:?}", headers);

    // 读取所有行
    let mut rows: Vec<Vec<String>> = Vec::new();
    for result in reader.records() {
        match result {
            Ok(record) => {
                let row: Vec<String> = record.iter().map(|s| s.to_string()).collect();
                rows.push(row);
            }
            Err(e) => {
                debug_info!("⚠️ 跳过无效行: {}", e);
            }
        }
    }

    debug_info!("✅ 成功读取 {} 行线程数据", rows.len());

    Ok(serde_json::json!({
        "headers": headers,
        "rows": rows
    }))
}

/// 读取时间线CSV文件用于星迹可视化
#[tauri::command]
pub async fn read_timeline_csv() -> Result<serde_json::Value, String> {
    use std::fs;

    debug_info!("⏱️ 读取时间线CSV文件用于星迹可视化");

    // 从设置中获取输出目录
    let settings = match load_settings() {
        Ok(s) => {
            debug_info!("✅ 设置加载成功，输出路径: {}", s.output_path);
            s
        }
        Err(e) => {
            debug_info!("❌ 设置加载失败: {}, 使用默认输出路径", e);
            crate::types::AppSettings::default()
        }
    };

    let output_dir = std::path::Path::new(&settings.output_path);

    // 尝试多个可能的时间线文件名
    let possible_files = ["timeline_all.csv", "timeline.csv", "timeliner.csv"];

    let mut timeline_csv_path = None;
    for filename in &possible_files {
        let path = output_dir.join(filename);
        if path.exists() {
            timeline_csv_path = Some(path);
            break;
        }
    }

    let timeline_csv_path = match timeline_csv_path {
        Some(p) => p,
        None => {
            debug_info!("⚠️ 未找到时间线CSV文件");
            return Ok(serde_json::json!({
                "headers": [],
                "rows": []
            }));
        }
    };

    debug_info!("📁 时间线CSV文件路径: {}", timeline_csv_path.display());

    // 读取CSV文件
    let csv_content = fs::read_to_string(&timeline_csv_path)
        .map_err(|e| format!("读取时间线CSV文件失败: {}", e))?;

    // 解析CSV
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(true)
        .flexible(true)
        .from_reader(csv_content.as_bytes());

    // 获取表头
    let headers: Vec<String> = reader
        .headers()
        .map_err(|e| format!("读取表头失败: {}", e))?
        .iter()
        .map(|h| h.to_string())
        .collect();

    debug_info!("📋 时间线CSV表头: {:?}", headers);

    // 读取所有行 (限制最大行数以避免内存问题)
    let max_rows = 500000; // 增加到50万行
    let mut rows: Vec<Vec<String>> = Vec::new();
    for result in reader.records() {
        if rows.len() >= max_rows {
            debug_info!("⚠️ 达到最大行数限制 {}, 停止读取", max_rows);
            break;
        }
        match result {
            Ok(record) => {
                let row: Vec<String> = record.iter().map(|s| s.to_string()).collect();
                rows.push(row);
            }
            Err(e) => {
                debug_info!("⚠️ 跳过无效行: {}", e);
            }
        }
    }

    debug_info!("✅ 成功读取 {} 行时间线数据", rows.len());

    Ok(serde_json::json!({
        "headers": headers,
        "rows": rows
    }))
}

#[tauri::command]
pub async fn open_symbol_manager_window(app_handle: tauri::AppHandle) -> Result<(), String> {
    use tauri::{WebviewUrl, WebviewWindowBuilder};

    debug_info!("📚 开始创建 符号表管理 窗口");

    let window_label = "symbol-manager";

    if let Some(existing_window) = app_handle.get_webview_window(window_label) {
        debug_info!("📚 符号表管理 窗口已存在，聚焦到现有窗口");
        existing_window
            .set_focus()
            .map_err(|e| format!("聚焦 符号表管理 窗口失败: {}", e))?;
        return Ok(());
    }

    let webview_window = WebviewWindowBuilder::new(
        &app_handle,
        window_label,
        WebviewUrl::App("symbol-manager.html".into()),
    )
    .title("符号表管理 - Lovelymem V2")
    .inner_size(1200.0, 800.0)
    .min_inner_size(900.0, 600.0)
    .center()
    .resizable(true)
    .decorations(should_use_decorations())
    .focused(true)
    .always_on_top(false)
    .skip_taskbar(false)
    .build()
    .map_err(|e| {
        debug_info!("❌ 创建 符号表管理 窗口失败: {}", e);
        format!("创建 符号表管理 窗口失败: {}", e)
    })?;

    debug_info!("✅ 符号表管理 窗口已创建成功");

    #[cfg(not(debug_assertions))]
    {
        webview_window
            .eval(
                "
            window.addEventListener('keydown', (e) => {
                if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I')) {
                    e.preventDefault();
                    return false;
                }
            }, true);
            window.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                return false;
            }, true);
        ",
            )
            .expect("Failed to inject devtools blocking script");
    }

    Ok(())
}
