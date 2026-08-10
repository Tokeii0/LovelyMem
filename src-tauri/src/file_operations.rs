use crate::settings::{load_settings, update_settings};
use crate::types::{
    DetectedImage, FileInfo, ImageFileInfo, ImageInfo, MultipleImagesResult, QrCodePosition,
    QrCodeResult,
};
use crc32fast::Hasher as Crc32Hasher;
use hex;
use md5;
use serde::{Deserialize, Serialize};
use sha1::Sha1;
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Read;
use std::path::Path;
use tauri_plugin_dialog::DialogExt;

fn use_english_ui() -> bool {
    load_settings()
        .map(|settings| settings.language.eq_ignore_ascii_case("en-US"))
        .unwrap_or(false)
}

fn localized<'a>(english: bool, chinese: &'a str, english_text: &'a str) -> &'a str {
    if english { english_text } else { chinese }
}

/// 加载镜像文件
#[tauri::command]
pub async fn load_image_file(window: tauri::Window) -> Result<Option<ImageInfo>, String> {
    let window_clone = window.clone();
    let english = use_english_ui();

    let file_path = tokio::task::spawn_blocking(move || {
        let mut dialog = window_clone.dialog().file();

        // 在 macOS 上，先添加"所有文件"选项作为默认
        #[cfg(target_os = "macos")]
        {
            dialog = dialog.add_filter(localized(english, "所有文件", "All Files"), &["*"]);
        }

        dialog = dialog
            .add_filter(
                localized(english, "镜像文件", "Memory Image Files"),
                &["raw", "dmp", "vmem", "img", "dd", "bin", "mem", "001"],
            )
            .add_filter(
                localized(english, "内存转储文件", "Memory Dump Files"),
                &["dmp", "vmem", "raw"],
            );

        // 在非 macOS 系统上添加"所有文件"选项
        #[cfg(not(target_os = "macos"))]
        {
            dialog = dialog.add_filter(localized(english, "所有文件", "All Files"), &["*"]);
        }

        dialog.blocking_pick_file()
    })
    .await
    .map_err(|e| format!("任务执行失败: {}", e))?;

    if let Some(file_path) = file_path {
        let path = file_path.as_path().expect("无法获取文件路径");

        // 获取文件信息
        let file_name = path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("未知文件")
            .to_string();

        let file_size = match std::fs::metadata(&path) {
            Ok(metadata) => metadata.len(),
            Err(_) => 0,
        };

        let image_path_str = path.to_string_lossy().to_string();

        // 保存当前镜像路径到设置中（使用原子更新避免竞态）
        let path_for_save = image_path_str.clone();
        if let Err(e) = update_settings(|s| {
            s.current_image_path = path_for_save;
        }) {
            debug_info!("⚠️ 保存 current_image_path 到设置失败: {}", e);
        }

        let image_info = ImageInfo {
            path: image_path_str,
            name: file_name,
            size: file_size,
        };

        Ok(Some(image_info))
    } else {
        Ok(None)
    }
}

/// 加载本地虚拟机内存镜像
#[tauri::command]
pub fn load_vm_memory_image() -> Result<Option<ImageInfo>, String> {
    // 直接返回虚拟机镜像信息，不需要文件选择
    let image_info = ImageInfo {
        path: "vmware".to_string(),
        name: "正在运行的虚拟机内存镜像".to_string(),
        size: 0, // 虚拟机内存镜像大小未知
    };

    // 保存当前镜像路径到设置中（使用原子更新避免竞态）
    if let Err(e) = update_settings(|s| {
        s.current_image_path = "vmware".to_string();
    }) {
        debug_info!("⚠️ 保存 current_image_path 到设置失败: {}", e);
    }

    Ok(Some(image_info))
}

/// 加载本机内存
#[tauri::command]
pub async fn load_local_memory_command() -> Result<serde_json::Value, String> {
    use std::process::Command;

    // 加载设置
    let settings = load_settings().map_err(|e| format!("加载设置失败: {}", e))?;

    // 验证必要的路径
    if settings.dumpit_path.is_empty() {
        return Err("DumpIt 路径未配置，请先在应用设置中配置".to_string());
    }
    if settings.memprocfs_path.is_empty() {
        return Err("MemProcFS 路径未配置，请先在应用设置中配置".to_string());
    }
    if settings.python3_path.is_empty() {
        return Err("Python 3 路径未配置，请先在应用设置中配置".to_string());
    }

    // 验证文件是否存在
    if !std::path::Path::new(&settings.dumpit_path).exists() {
        return Err(format!("DumpIt 执行文件不存在: {}", settings.dumpit_path));
    }
    if !std::path::Path::new(&settings.memprocfs_path).exists() {
        return Err(format!(
            "MemProcFS 执行文件不存在: {}",
            settings.memprocfs_path
        ));
    }
    if !std::path::Path::new(&settings.python3_path).exists() {
        return Err(format!(
            "Python 3 执行文件不存在: {}",
            settings.python3_path
        ));
    }

    debug_info!("🔧 DumpIt 路径: {}", settings.dumpit_path);
    debug_info!("🔧 MemProcFS 路径: {}", settings.memprocfs_path);
    debug_info!("🔧 Python 3 路径: {}", settings.python3_path);

    // 构建命令
    // 命令格式: dumpit_path /LIVEKD /APP memprocfs_path /C -license-accept-elastic-license-2-0 -forensic 1 -pythonpath python3_path
    let command_str = format!(
        "\"{}\" /LIVEKD /APP \"{}\" /C \"-license-accept-elastic-license-2-0 -forensic 1 -pythonpath {}\"",
        settings.dumpit_path, settings.memprocfs_path, settings.python3_path
    );

    debug_info!("🚀 执行命令: {}", command_str);

    // 在 Windows 上执行命令
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;

        // 使用 tokio 异步执行命令
        let output = tokio::task::spawn_blocking(move || {
            Command::new("cmd")
                .args(&["/C", &command_str])
                .creation_flags(0x08000000) // CREATE_NO_WINDOW
                .spawn()
        })
        .await
        .map_err(|e| format!("任务执行失败: {}", e))?
        .map_err(|e| format!("执行命令失败: {}", e))?;

        debug_info!("✅ 命令已启动，进程 ID: {:?}", output.id());

        // 更新当前镜像路径到设置中（使用原子更新避免竞态）
        if let Err(e) = update_settings(|s| {
            s.current_image_path = "livekd".to_string();
        }) {
            debug_info!("⚠️ 保存 current_image_path 到设置失败: {}", e);
        }

        Ok(serde_json::json!({
            "success": true,
            "message": "本机内存加载命令已执行",
            "pid": output.id()
        }))
    }

    // 在非 Windows 系统上返回错误
    #[cfg(not(target_os = "windows"))]
    {
        Err("本机内存加载功能仅支持 Windows 系统".to_string())
    }
}

/// 加载镜像文件时附加分页文件
#[tauri::command]
pub async fn load_image_with_pagefile_command(
    window: tauri::Window,
) -> Result<Option<ImageInfo>, String> {
    // 第一步：选择镜像文件
    let window_clone = window.clone();
    let english = use_english_ui();
    let image_file_path = tokio::task::spawn_blocking(move || {
        let mut dialog = window_clone.dialog().file().set_title(localized(
            english,
            "选择镜像文件",
            "Select Memory Image",
        ));

        // 在 macOS 上，先添加"所有文件"选项作为默认
        #[cfg(target_os = "macos")]
        {
            dialog = dialog.add_filter(localized(english, "所有文件", "All Files"), &["*"]);
        }

        dialog = dialog
            .add_filter(
                localized(english, "镜像文件", "Memory Image Files"),
                &["raw", "dmp", "vmem", "img", "dd", "bin", "mem", "001"],
            )
            .add_filter(
                localized(english, "内存转储文件", "Memory Dump Files"),
                &["dmp", "vmem", "raw"],
            );

        // 在非 macOS 系统上添加"所有文件"选项
        #[cfg(not(target_os = "macos"))]
        {
            dialog = dialog.add_filter(localized(english, "所有文件", "All Files"), &["*"]);
        }

        dialog.blocking_pick_file()
    })
    .await
    .map_err(|e| format!("任务执行失败: {}", e))?;

    if let Some(image_file_path) = image_file_path {
        let image_path = image_file_path.as_path().expect("无法获取镜像文件路径");

        // 第二步：选择第一个分页文件 (pagefile.sys)
        let window_clone2 = window.clone();
        let pagefile0_path = tokio::task::spawn_blocking(move || {
            let mut dialog = window_clone2.dialog().file().set_title(localized(
                english,
                "选择第一个分页文件 (pagefile.sys)",
                "Select First Page File (pagefile.sys)",
            ));

            // 在 macOS 上，先添加"所有文件"选项作为默认
            #[cfg(target_os = "macos")]
            {
                dialog = dialog.add_filter(localized(english, "所有文件", "All Files"), &["*"]);
            }

            dialog = dialog.add_filter(localized(english, "分页文件", "Page Files"), &["sys"]);

            // 在非 macOS 系统上添加"所有文件"选项
            #[cfg(not(target_os = "macos"))]
            {
                dialog = dialog.add_filter(localized(english, "所有文件", "All Files"), &["*"]);
            }

            dialog.blocking_pick_file()
        })
        .await
        .map_err(|e| format!("任务执行失败: {}", e))?;

        let mut pagefile_params = Vec::new();
        let mut pagefile_info = String::new();

        if let Some(pagefile0_path) = pagefile0_path {
            let pagefile0_str = pagefile0_path
                .as_path()
                .expect("无法获取分页文件路径")
                .to_string_lossy()
                .to_string();

            // 检查文件是否存在
            if !std::path::Path::new(&pagefile0_str).exists() {
                return Err(format!("分页文件不存在: {}", pagefile0_str));
            }

            pagefile_params.push(format!("-pagefile0 \"{}\"", pagefile0_str));
            let pagefile0_name = pagefile0_path
                .as_path()
                .expect("无法获取分页文件路径")
                .file_name()
                .unwrap_or_default()
                .to_string_lossy();
            pagefile_info.push_str(&format!("pagefile0: {}", pagefile0_name));

            // 第三步：选择第二个分页文件 (swapfile.sys) - 可选
            let window_clone3 = window.clone();
            let pagefile1_path = tokio::task::spawn_blocking(move || {
                let mut dialog = window_clone3.dialog().file().set_title(localized(
                    english,
                    "选择第二个分页文件 (swapfile.sys) - 可选，点击取消跳过",
                    "Select Second Page File (swapfile.sys) - Optional, click Cancel to skip",
                ));

                // 在 macOS 上，先添加"所有文件"选项作为默认
                #[cfg(target_os = "macos")]
                {
                    dialog = dialog.add_filter(localized(english, "所有文件", "All Files"), &["*"]);
                }

                dialog = dialog.add_filter(localized(english, "分页文件", "Page Files"), &["sys"]);

                // 在非 macOS 系统上添加"所有文件"选项
                #[cfg(not(target_os = "macos"))]
                {
                    dialog = dialog.add_filter(localized(english, "所有文件", "All Files"), &["*"]);
                }

                dialog.blocking_pick_file()
            })
            .await
            .map_err(|e| format!("任务执行失败: {}", e))?;

            if let Some(pagefile1_path) = pagefile1_path {
                let pagefile1_str = pagefile1_path
                    .as_path()
                    .expect("无法获取第二个分页文件路径")
                    .to_string_lossy()
                    .to_string();

                // 检查文件是否存在
                if std::path::Path::new(&pagefile1_str).exists() {
                    pagefile_params.push(format!("-pagefile1 \"{}\"", pagefile1_str));
                    let pagefile1_name = pagefile1_path
                        .as_path()
                        .expect("无法获取第二个分页文件路径")
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy();
                    pagefile_info.push_str(&format!(", pagefile1: {}", pagefile1_name));
                } else {
                    debug_info!(
                        "[!] 警告: 第二个分页文件不存在，将只使用第一个分页文件: {}",
                        pagefile1_str
                    );
                }
            } else {
                debug_info!("[*] 用户选择只使用单个分页文件模式");
            }
        } else {
            return Err("必须选择至少一个分页文件".to_string());
        }

        // 获取镜像文件信息
        let file_name = image_path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("未知文件")
            .to_string();

        let file_size = match std::fs::metadata(&image_path) {
            Ok(metadata) => metadata.len(),
            Err(_) => 0,
        };

        let image_path_str = image_path.to_string_lossy().to_string();

        // 保存当前镜像路径和分页文件参数到设置中（使用原子更新避免竞态）
        let path_for_save = image_path_str.clone();
        let pagefile_params_clone = pagefile_params.clone();
        if let Err(e) = update_settings(|s| {
            s.current_image_path = path_for_save;
            s.pagefile0_path = if pagefile_params_clone.len() > 0 {
                pagefile_params_clone[0]
                    .replace("-pagefile0 \"", "")
                    .replace("\"", "")
            } else {
                String::new()
            };
            s.pagefile1_path = if pagefile_params_clone.len() > 1 {
                pagefile_params_clone[1]
                    .replace("-pagefile1 \"", "")
                    .replace("\"", "")
            } else {
                String::new()
            };
        }) {
            debug_info!("⚠️ 保存 current_image_path 到设置失败: {}", e);
        }

        let image_info = ImageInfo {
            path: image_path_str,
            name: format!("{} (附加分页文件: {})", file_name, pagefile_info),
            size: file_size,
        };

        debug_info!(
            "[*] 镜像文件已加载（附加分页文件模式）: {}",
            image_info.path
        );
        debug_info!("[*] 分页文件参数: {}", pagefile_params.join(" "));

        Ok(Some(image_info))
    } else {
        Ok(None)
    }
}

/// 选择文件路径
#[tauri::command]
pub async fn select_file_path(
    window: tauri::Window,
    title: String,
    filters: Vec<String>,
) -> Result<Option<String>, String> {
    let window_clone = window.clone();
    let title_clone = title.clone();
    let filters_clone = filters.clone();
    let english = use_english_ui();

    let result = tokio::task::spawn_blocking(move || {
        let mut dialog = window_clone.dialog().file();

        // 设置标题
        dialog = dialog.set_title(&title_clone);

        // 在 macOS 上，完全不使用过滤器，让用户可以选择任何文件
        #[cfg(target_os = "macos")]
        {
            // 在 macOS 上不添加任何过滤器，这样所有文件都应该可见
            // 这是为了解决 macOS 上可执行文件没有扩展名导致的问题
        }

        // 在非 macOS 系统上的处理
        #[cfg(not(target_os = "macos"))]
        {
            // 添加文件过滤器
            if !filters_clone.is_empty() {
                // 将 Vec<String> 转换为 Vec<&str>
                let filter_refs: Vec<&str> = filters_clone.iter().map(|s| s.as_str()).collect();
                dialog = dialog.add_filter(
                    localized(english, "建议文件类型", "Recommended File Types"),
                    &filter_refs,
                );
            }
            // 始终添加"所有文件"选项
            dialog = dialog.add_filter(localized(english, "所有文件", "All Files"), &["*"]);
        }

        dialog.blocking_pick_file()
    })
    .await
    .map_err(|e| format!("任务执行失败: {}", e))?;

    if let Some(file_path) = result {
        let path = file_path.as_path().expect("无法获取文件路径");
        Ok(Some(path.to_string_lossy().to_string()))
    } else {
        Ok(None)
    }
}

#[derive(serde::Serialize)]
pub struct AppIcon {
    pub name: String,
    pub path: String,
    pub category: String,
}

/// 获取应用程序内置图标
#[tauri::command]
pub fn get_app_icons() -> Result<Vec<AppIcon>, String> {
    use std::fs;

    let mut icons = Vec::new();

    // 获取应用程序目录
    let app_dir = std::env::current_exe()
        .map_err(|e| format!("获取应用程序目录失败: {}", e))?
        .parent()
        .ok_or("无法获取父目录")?
        .to_path_buf();

    // 1. 扫描 exe 文件的图标
    if let Ok(exe_icons) = extract_exe_icons(&app_dir) {
        icons.extend(exe_icons);
    }

    // 2. 扫描图标文件目录
    let possible_dirs = vec![
        app_dir.join("assets"),
        app_dir.join("resources"),
        app_dir.join("icons"),
        // 开发环境路径
        app_dir.join("..").join("..").join("src").join("assets"),
    ];

    for dir in possible_dirs {
        if dir.exists() && dir.is_dir() {
            debug_info!("🔍 检查图标目录: {:?}", dir);
            if let Ok(entries) = fs::read_dir(&dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if let Some(extension) = path.extension() {
                        let ext = extension.to_string_lossy().to_lowercase();
                        if matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "svg" | "ico" | "gif") {
                            if let Some(file_name) = path.file_stem() {
                                let name = file_name.to_string_lossy().to_string();
                                let category = categorize_icon(&name);

                                // 转换为相对路径或资源路径
                                let icon_path = if dir.ends_with("assets") {
                                    format!(
                                        "/assets/{}",
                                        path.file_name().unwrap_or_default().to_string_lossy()
                                    )
                                } else {
                                    path.to_string_lossy().to_string()
                                };

                                icons.push(AppIcon {
                                    name: name.clone(),
                                    path: icon_path.clone(),
                                    category,
                                });

                                debug_info!("📁 找到图标文件: {} -> {}", name, icon_path);
                            }
                        }
                    }
                }
            }
        }
    }

    // 按分类和名称排序
    icons.sort_by(|a, b| a.category.cmp(&b.category).then(a.name.cmp(&b.name)));

    debug_info!("🎨 总共找到 {} 个应用图标", icons.len());
    Ok(icons)
}

/// 提取目录中 exe 文件的图标
fn extract_exe_icons(dir: &std::path::Path) -> Result<Vec<AppIcon>, String> {
    use std::fs;

    let mut icons = Vec::new();

    // 扫描目录中的 exe 文件
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if let Some(extension) = path.extension() {
                if extension.to_string_lossy().to_lowercase() == "exe" {
                    if let Some(file_name) = path.file_stem() {
                        let name = file_name.to_string_lossy().to_string();

                        // 提取图标并保存为临时文件
                        if let Ok(icon_path) = extract_exe_icon(&path, &name) {
                            let category = categorize_exe_icon(&name);

                            icons.push(AppIcon {
                                name: format!("{} (程序图标)", name),
                                path: icon_path,
                                category,
                            });

                            debug_info!("🎯 提取程序图标: {} -> {}", name, path.display());
                        }
                    }
                }
            }
        }
    }

    Ok(icons)
}

/// 提取单个 exe 文件的图标
#[cfg(target_os = "windows")]
fn extract_exe_icon(exe_path: &std::path::Path, name: &str) -> Result<String, String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use std::ptr;
    use winapi::um::shellapi::ExtractIconW;
    use winapi::um::winuser::DestroyIcon;

    // 转换路径为 Windows 宽字符
    let wide_path: Vec<u16> = OsStr::new(exe_path)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    unsafe {
        // 检查是否有图标 (-1 表示获取图标数量)
        let icon_count = ExtractIconW(ptr::null_mut(), wide_path.as_ptr(), u32::MAX);

        if icon_count.is_null() || icon_count as usize <= 1 {
            return Err("文件中没有图标".to_string());
        }

        // 提取第一个图标
        let icon_handle = ExtractIconW(ptr::null_mut(), wide_path.as_ptr(), 0);

        if icon_handle.is_null() || icon_handle as isize <= 1 {
            return Err("无法提取图标".to_string());
        }

        // 清理图标句柄
        DestroyIcon(icon_handle);

        // 返回一个特殊的标识符，前端可以通过这个来显示程序图标
        // 格式: exe-icon://程序名称|完整路径
        Ok(format!("exe-icon://{}|{}", name, exe_path.display()))
    }
}

/// 非 Windows 系统的占位实现
#[cfg(not(target_os = "windows"))]
fn extract_exe_icon(_exe_path: &std::path::Path, name: &str) -> Result<String, String> {
    // 在非 Windows 系统上，返回一个通用图标标识
    Ok(format!("exe-icon://{}", name))
}

/// 根据 exe 文件名分类
fn categorize_exe_icon(name: &str) -> String {
    let name_lower = name.to_lowercase();

    if name_lower.contains("volatility") || name_lower.contains("vol") {
        "内存分析工具".to_string()
    } else if name_lower.contains("memprocfs") {
        "进程分析工具".to_string()
    } else if name_lower.contains("winpmem") || name_lower.contains("dumpit") {
        "内存获取工具".to_string()
    } else if name_lower.contains("rekall") {
        "内存分析工具".to_string()
    } else if name_lower.contains("strings") {
        "字符串工具".to_string()
    } else if name_lower.contains("hex") || name_lower.contains("editor") {
        "编辑工具".to_string()
    } else {
        "程序图标".to_string()
    }
}

/// 根据图标名称分类
fn categorize_icon(name: &str) -> String {
    let name_lower = name.to_lowercase();

    if name_lower.contains("vol") || name_lower.contains("volatility") {
        "内存分析".to_string()
    } else if name_lower.contains("tool") || name_lower.contains("工具") {
        "工具".to_string()
    } else if name_lower.contains("memprocfs") || name_lower.contains("proc") {
        "进程分析".to_string()
    } else if name_lower.contains("linux") {
        "Linux".to_string()
    } else if name_lower.contains("quick") || name_lower.contains("fast") {
        "快速工具".to_string()
    } else if name_lower.contains("logo") || name_lower.contains("icon") {
        "应用图标".to_string()
    } else {
        "其他".to_string()
    }
}

/// 选择文件夹路径
#[tauri::command]
pub async fn select_folder_path(
    window: tauri::Window,
    title: String,
) -> Result<Option<String>, String> {
    let window_clone = window.clone();
    let title_clone = title.clone();

    let result = tokio::task::spawn_blocking(move || {
        let dialog = window_clone.dialog().file().set_title(&title_clone);
        dialog.blocking_pick_folder()
    })
    .await
    .map_err(|e| format!("任务执行失败: {}", e))?;

    if let Some(folder_path) = result {
        let path = folder_path.as_path().expect("无法获取文件夹路径");
        Ok(Some(path.to_string_lossy().to_string()))
    } else {
        Ok(None)
    }
}

/// 检查文件夹是否为空
#[tauri::command]
pub fn is_folder_empty(path: String) -> Result<bool, String> {
    use std::path::Path;

    let folder_path = Path::new(&path);

    // 检查路径是否存在
    if !folder_path.exists() {
        return Err(format!("路径不存在: {}", path));
    }

    // 检查是否为目录
    if !folder_path.is_dir() {
        return Err(format!("路径不是目录: {}", path));
    }

    // 检查目录是否为空
    match fs::read_dir(folder_path) {
        Ok(mut entries) => {
            // 如果没有任何条目，则目录为空
            Ok(entries.next().is_none())
        }
        Err(e) => Err(format!("无法读取目录: {}", e)),
    }
}

/// 读取输出目录
#[tauri::command]
pub fn read_output_directory() -> Result<Vec<FileInfo>, String> {
    // 加载设置以获取输出路径
    let settings = match load_settings() {
        Ok(settings) => settings,
        Err(_) => crate::types::AppSettings::default(),
    };
    let output_dir = std::path::Path::new(&settings.output_path);

    // 检查输出目录是否存在
    if !output_dir.exists() {
        // 如果不存在则创建
        if let Err(e) = fs::create_dir_all(output_dir) {
            return Err(format!(
                "创建输出目录失败 ({}): {}",
                settings.output_path, e
            ));
        }
        return Ok(Vec::new()); // 返回空列表
    }

    let mut files = Vec::new();

    match fs::read_dir(output_dir) {
        Ok(entries) => {
            for entry in entries {
                if let Ok(entry) = entry {
                    let path = entry.path();
                    let metadata = match entry.metadata() {
                        Ok(metadata) => metadata,
                        Err(_) => continue,
                    };

                    let name = path
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("未知文件")
                        .to_string();

                    let size = metadata.len();
                    let is_dir = metadata.is_dir();

                    let modified = match metadata.modified() {
                        Ok(time) => {
                            format!("{:?}", time)
                        }
                        Err(_) => "未知时间".to_string(),
                    };

                    let created = match metadata.created() {
                        Ok(time) => {
                            format!("{:?}", time)
                        }
                        Err(_) => "未知时间".to_string(),
                    };

                    let extension = path
                        .extension()
                        .and_then(|ext| ext.to_str())
                        .unwrap_or("")
                        .to_string();

                    files.push(FileInfo {
                        name,
                        size,
                        is_dir,
                        modified,
                        created,
                        extension,
                    });
                }
            }
        }
        Err(e) => {
            return Err(format!(
                "读取输出目录失败 ({}): {}",
                settings.output_path, e
            ));
        }
    }

    // 按文件名排序
    files.sort_by(|a, b| {
        // 目录排在前面，然后按名称排序
        match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.cmp(&b.name),
        }
    });

    Ok(files)
}

/// 读取告警目录（warning_path；若为空则使用 output_path 同级目录下的 warnings）
#[tauri::command]
pub fn read_warning_directory() -> Result<Vec<FileInfo>, String> {
    // 加载设置以获取告警路径
    let settings = match load_settings() {
        Ok(settings) => settings,
        Err(_) => crate::types::AppSettings::default(),
    };

    let warning_dir_path = if !settings.warning_path.trim().is_empty() {
        settings.warning_path.trim().to_string()
    } else {
        let out = std::path::PathBuf::from(settings.output_path.trim());
        if let Some(parent) = out.parent() {
            parent.join("warnings").to_string_lossy().to_string()
        } else {
            "warnings".to_string()
        }
    };

    let warning_dir = std::path::Path::new(&warning_dir_path);

    // 检查告警目录是否存在
    if !warning_dir.exists() {
        // 如果不存在则创建
        if let Err(e) = fs::create_dir_all(warning_dir) {
            return Err(format!("创建告警目录失败 ({}): {}", warning_dir_path, e));
        }
        return Ok(Vec::new());
    }

    let mut files = Vec::new();
    match fs::read_dir(warning_dir) {
        Ok(entries) => {
            for entry in entries {
                if let Ok(entry) = entry {
                    let path = entry.path();
                    let metadata = match entry.metadata() {
                        Ok(metadata) => metadata,
                        Err(_) => continue,
                    };

                    let name = path
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("未知文件")
                        .to_string();

                    let size = metadata.len();
                    let is_dir = metadata.is_dir();

                    let modified = match metadata.modified() {
                        Ok(time) => format!("{:?}", time),
                        Err(_) => "未知时间".to_string(),
                    };

                    let created = match metadata.created() {
                        Ok(time) => format!("{:?}", time),
                        Err(_) => "未知时间".to_string(),
                    };

                    let extension = path
                        .extension()
                        .and_then(|ext| ext.to_str())
                        .unwrap_or("")
                        .to_string();

                    files.push(FileInfo {
                        name,
                        size,
                        is_dir,
                        modified,
                        created,
                        extension,
                    });
                }
            }
        }
        Err(e) => return Err(format!("读取告警目录失败 ({}): {}", warning_dir_path, e)),
    }

    // 按文件名排序
    files.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.cmp(&b.name),
    });

    Ok(files)
}

/// 打开路径
#[tauri::command]
pub fn open_path(path: String) -> Result<(), String> {
    use std::process::Command;

    let full_path = std::path::Path::new(&path);

    if !full_path.exists() {
        return Err(format!("路径不存在: {}", path));
    }

    #[cfg(target_os = "windows")]
    {
        let result = Command::new("explorer").arg(&path).spawn();

        match result {
            Ok(_) => Ok(()),
            Err(e) => Err(format!("打开文件失败: {}", e)),
        }
    }

    #[cfg(target_os = "macos")]
    {
        let result = Command::new("open").arg(&path).spawn();

        match result {
            Ok(_) => Ok(()),
            Err(e) => Err(format!("打开文件失败: {}", e)),
        }
    }

    #[cfg(target_os = "linux")]
    {
        let result = Command::new("xdg-open").arg(&path).spawn();

        match result {
            Ok(_) => Ok(()),
            Err(e) => Err(format!("打开文件失败: {}", e)),
        }
    }
}

/// 获取文件列表
#[tauri::command]
pub fn get_file_list(path: String) -> Result<Vec<FileInfo>, String> {
    let path_buf = std::path::PathBuf::from(&path);

    // 处理特殊路径
    let actual_path = if path == "output" {
        // 从设置中获取输出路径
        match load_settings() {
            Ok(settings) => std::path::PathBuf::from(&settings.output_path),
            Err(_) => std::path::PathBuf::from("output"),
        }
    } else {
        path_buf
    };

    if !actual_path.exists() {
        return Err(format!("路径不存在: {}", actual_path.display()));
    }

    if !actual_path.is_dir() {
        return Err(format!("不是有效的目录: {}", actual_path.display()));
    }

    let mut files = Vec::new();

    match fs::read_dir(&actual_path) {
        Ok(entries) => {
            for entry in entries {
                match entry {
                    Ok(entry) => {
                        let file_path = entry.path();
                        let metadata = match entry.metadata() {
                            Ok(metadata) => metadata,
                            Err(_) => continue,
                        };

                        let file_name = file_path
                            .file_name()
                            .and_then(|name| name.to_str())
                            .unwrap_or("未知文件")
                            .to_string();

                        let extension = if metadata.is_file() {
                            file_path
                                .extension()
                                .and_then(|ext| ext.to_str())
                                .unwrap_or("")
                                .to_string()
                        } else {
                            String::new()
                        };

                        let modified = metadata
                            .modified()
                            .map(|time| {
                                use std::time::UNIX_EPOCH;
                                let duration = time.duration_since(UNIX_EPOCH).unwrap_or_default();
                                format!("{}", duration.as_secs())
                            })
                            .unwrap_or_default();

                        let created = metadata
                            .created()
                            .map(|time| {
                                use std::time::UNIX_EPOCH;
                                let duration = time.duration_since(UNIX_EPOCH).unwrap_or_default();
                                format!("{}", duration.as_secs())
                            })
                            .unwrap_or_default();

                        files.push(FileInfo {
                            name: file_name,
                            size: metadata.len(),
                            is_dir: metadata.is_dir(),
                            modified,
                            created,
                            extension,
                        });
                    }
                    Err(_) => continue,
                }
            }
        }
        Err(e) => return Err(format!("读取目录失败: {}", e)),
    }

    // 按类型和名称排序：目录在前，然后按名称排序
    files.sort_by(|a, b| {
        if a.is_dir && !b.is_dir {
            std::cmp::Ordering::Less
        } else if !a.is_dir && b.is_dir {
            std::cmp::Ordering::Greater
        } else {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        }
    });

    Ok(files)
}

/// 用默认程序打开文件
#[tauri::command]
pub async fn open_file_with_default(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let result = Command::new("cmd")
            .args(&["/C", "start", "", &path])
            .spawn();

        match result {
            Ok(_) => Ok(()),
            Err(e) => Err(format!("无法打开文件: {}", e)),
        }
    }

    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        let result = Command::new("open").arg(&path).spawn();

        match result {
            Ok(_) => Ok(()),
            Err(e) => Err(format!("无法打开文件: {}", e)),
        }
    }

    #[cfg(target_os = "linux")]
    {
        use std::process::Command;
        let result = Command::new("xdg-open").arg(&path).spawn();

        match result {
            Ok(_) => Ok(()),
            Err(e) => Err(format!("无法打开文件: {}", e)),
        }
    }
}

/// 打开文件夹并选中文件
#[tauri::command]
pub async fn open_folder_and_select(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        // 使用 Windows Explorer 命令打开文件夹并选中文件
        let result = Command::new("explorer").args(&["/select,", &path]).spawn();

        match result {
            Ok(_) => Ok(()),
            Err(e) => Err(format!("无法打开文件夹: {}", e)),
        }
    }

    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        // 使用 Finder 打开并选中文件
        let result = Command::new("open").args(&["-R", &path]).spawn();

        match result {
            Ok(_) => Ok(()),
            Err(e) => Err(format!("无法打开文件夹: {}", e)),
        }
    }

    #[cfg(target_os = "linux")]
    {
        use std::path::Path;
        use std::process::Command;

        let path_obj = Path::new(&path);
        let parent_dir = path_obj
            .parent()
            .ok_or("无法获取文件的父目录")?
            .to_str()
            .ok_or("路径包含无效字符")?;

        // Linux下打开包含文件的目录
        let result = Command::new("xdg-open").arg(parent_dir).spawn();

        match result {
            Ok(_) => Ok(()),
            Err(e) => Err(format!("无法打开文件夹: {}", e)),
        }
    }
}

/// 复制文件到剪贴板
#[tauri::command]
pub fn copy_file_to_clipboard(path: String) -> Result<(), String> {
    // 简化实现：将文件路径复制到剪贴板
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let result = Command::new("cmd")
            .args(&["/C", "echo", &path, "|", "clip"])
            .output();

        match result {
            Ok(_) => Ok(()),
            Err(e) => Err(format!("复制到剪贴板失败: {}", e)),
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        // 对于非Windows系统，简单返回成功
        Ok(())
    }
}

/// 删除文件
#[tauri::command]
pub fn delete_file(path: String) -> Result<(), String> {
    let path_buf = std::path::PathBuf::from(&path);

    if !path_buf.exists() {
        return Err("文件不存在".to_string());
    }

    if path_buf.is_dir() {
        fs::remove_dir_all(&path_buf).map_err(|e| format!("删除目录失败: {}", e))?;
    } else {
        fs::remove_file(&path_buf).map_err(|e| format!("删除文件失败: {}", e))?;
    }

    Ok(())
}

/// 重命名文件
#[tauri::command]
pub fn rename_file(old_path: String, new_name: String) -> Result<(), String> {
    let old_path_buf = std::path::PathBuf::from(&old_path);

    if !old_path_buf.exists() {
        return Err("文件不存在".to_string());
    }

    // 获取父目录
    let parent_dir = old_path_buf.parent().ok_or("无法获取父目录".to_string())?;

    // 构建新的文件路径
    let new_path_buf = parent_dir.join(&new_name);

    // 检查新文件名是否已存在
    if new_path_buf.exists() {
        return Err(format!("文件名 '{}' 已存在", new_name));
    }

    // 执行重命名
    fs::rename(&old_path_buf, &new_path_buf).map_err(|e| format!("重命名文件失败: {}", e))?;

    Ok(())
}

/// 获取图片文件信息
#[tauri::command]
pub fn get_image_info(file_path: String) -> Result<ImageFileInfo, String> {
    use std::path::Path;

    let path = Path::new(&file_path);

    if !path.exists() {
        return Err("文件不存在".to_string());
    }

    if !path.is_file() {
        return Err("不是有效的文件".to_string());
    }

    // 获取文件基本信息
    let metadata = fs::metadata(&path).map_err(|e| format!("获取文件信息失败: {}", e))?;

    let file_size = metadata.len();
    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("未知文件名")
        .to_string();

    // 尝试获取图片尺寸信息
    let (width, height) = get_image_dimensions(&file_path)?;

    Ok(ImageFileInfo {
        file_name,
        file_size,
        width,
        height,
        file_path: file_path.clone(),
    })
}

/// 读取图片文件并返回base64编码
#[tauri::command]
pub fn read_image_as_base64(file_path: String) -> Result<String, String> {
    use std::path::Path;

    let path = Path::new(&file_path);

    if !path.exists() {
        return Err("文件不存在".to_string());
    }

    if !path.is_file() {
        return Err("不是有效的文件".to_string());
    }

    // 检查文件大小，避免加载过大的图片
    let metadata = fs::metadata(&path).map_err(|e| format!("获取文件信息失败: {}", e))?;

    const MAX_SIZE: u64 = 50 * 1024 * 1024; // 50MB 限制
    if metadata.len() > MAX_SIZE {
        return Err("图片文件过大，无法预览".to_string());
    }

    // 读取文件内容
    let file_content = fs::read(&path).map_err(|e| format!("读取文件失败: {}", e))?;

    // 获取文件扩展名来确定MIME类型
    let extension = path
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_lowercase();

    let mime_type = match extension.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "bmp" => "image/bmp",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "tiff" | "tif" => "image/tiff",
        "ico" => "image/x-icon",
        _ => "image/jpeg", // 默认
    };

    // 编码为base64
    use base64::{Engine as _, engine::general_purpose};
    let base64_content = general_purpose::STANDARD.encode(&file_content);

    Ok(format!("data:{};base64,{}", mime_type, base64_content))
}

/// 获取图片尺寸
fn get_image_dimensions(file_path: &str) -> Result<(u32, u32), String> {
    use std::fs::File;
    use std::io::BufReader;

    let file = File::open(file_path).map_err(|e| format!("打开文件失败: {}", e))?;

    let mut reader = BufReader::new(file);

    // 尝试读取图片头部信息来获取尺寸
    // 这里实现一个简单的图片尺寸检测
    match get_image_format_and_size(&mut reader) {
        Ok((width, height)) => Ok((width, height)),
        Err(_) => {
            // 如果无法解析，返回默认值
            Ok((0, 0))
        }
    }
}

/// 简单的图片格式检测和尺寸获取
fn get_image_format_and_size(
    reader: &mut std::io::BufReader<std::fs::File>,
) -> Result<(u32, u32), String> {
    use std::io::{Read, Seek, SeekFrom};

    let mut header = [0u8; 54]; // 增加缓冲区大小以支持BMP格式
    let bytes_read = reader
        .read(&mut header)
        .map_err(|e| format!("读取文件头失败: {}", e))?;

    if bytes_read < 8 {
        return Err("文件太小，无法识别格式".to_string());
    }

    // PNG 格式检测
    if bytes_read >= 24 && &header[0..8] == b"\x89PNG\r\n\x1a\n" {
        reader
            .seek(SeekFrom::Start(16))
            .map_err(|e| format!("文件定位失败: {}", e))?;
        let mut size_bytes = [0u8; 8];
        reader
            .read_exact(&mut size_bytes)
            .map_err(|e| format!("读取PNG尺寸失败: {}", e))?;

        let width =
            u32::from_be_bytes([size_bytes[0], size_bytes[1], size_bytes[2], size_bytes[3]]);
        let height =
            u32::from_be_bytes([size_bytes[4], size_bytes[5], size_bytes[6], size_bytes[7]]);
        return Ok((width, height));
    }

    // JPEG 格式检测
    if bytes_read >= 2 && &header[0..2] == b"\xFF\xD8" {
        // JPEG 格式比较复杂，这里返回默认值
        // 实际项目中可以使用 image crate 来解析
        return Ok((0, 0));
    }

    // GIF 格式检测
    if bytes_read >= 10 && (&header[0..6] == b"GIF87a" || &header[0..6] == b"GIF89a") {
        let width = u16::from_le_bytes([header[6], header[7]]) as u32;
        let height = u16::from_le_bytes([header[8], header[9]]) as u32;
        return Ok((width, height));
    }

    // BMP 格式检测
    if bytes_read >= 26 && &header[0..2] == b"BM" {
        // BMP文件头结构：文件头(14字节) + 信息头(40字节)
        // 宽度在偏移18处，高度在偏移22处
        let width = u32::from_le_bytes([header[18], header[19], header[20], header[21]]);
        let height = u32::from_le_bytes([header[22], header[23], header[24], header[25]]);
        return Ok((width, height));
    }

    Err("不支持的图片格式".to_string())
}

/// 检测文件中的多个图片
#[tauri::command]
pub fn detect_multiple_images(file_path: String) -> Result<MultipleImagesResult, String> {
    use std::path::Path;

    let path = Path::new(&file_path);

    if !path.exists() {
        return Err("文件不存在".to_string());
    }

    if !path.is_file() {
        return Err("不是有效的文件".to_string());
    }

    // 检查文件大小，避免处理过大的文件
    let metadata = fs::metadata(&path).map_err(|e| format!("获取文件信息失败: {}", e))?;

    const MAX_SIZE: u64 = 100 * 1024 * 1024; // 100MB 限制
    if metadata.len() > MAX_SIZE {
        return Err("文件过大，无法检测多图片".to_string());
    }

    // 读取文件内容
    let file_content = fs::read(&path).map_err(|e| format!("读取文件失败: {}", e))?;

    let mut detected_images = Vec::new();
    let mut current_index = 0;

    // 扫描文件内容查找图片标识
    let mut offset = 0;
    while offset < file_content.len() {
        if let Some((format, start_offset, end_offset)) = find_next_image(&file_content, offset) {
            if let Ok(image_data) = extract_image_data(&file_content, start_offset, end_offset) {
                if let Ok((width, height)) = get_image_dimensions_from_bytes(&image_data) {
                    let base64_data = create_data_url(&image_data, &format);

                    detected_images.push(DetectedImage {
                        index: current_index,
                        format: format.clone(),
                        offset: start_offset as u64,
                        size: (end_offset - start_offset) as u64,
                        width,
                        height,
                        base64_data,
                    });

                    current_index += 1;
                }
            }
            offset = end_offset;
        } else {
            break;
        }
    }

    Ok(MultipleImagesResult {
        total_count: detected_images.len(),
        images: detected_images,
    })
}

/// 扫描图片中的二维码
#[tauri::command]
pub fn scan_qr_code(image_base64: String) -> Result<QrCodeResult, String> {
    use base64::{Engine as _, engine::general_purpose};

    // 处理 data URL 格式的 base64 数据
    let base64_data = if image_base64.starts_with("data:") {
        // 提取 base64 部分（去掉 "data:image/xxx;base64," 前缀）
        image_base64.split(',').nth(1).unwrap_or(&image_base64)
    } else {
        &image_base64
    };

    // 解码 base64 图片数据
    let image_data = general_purpose::STANDARD
        .decode(base64_data)
        .map_err(|e| format!("Base64 解码失败: {}", e))?;

    // 加载图片
    let img = image::load_from_memory(&image_data).map_err(|e| format!("图片加载失败: {}", e))?;

    // 转换为灰度图像
    let gray_img = img.to_luma8();

    // 使用 rqrr 进行二维码检测
    let mut prepared_img = rqrr::PreparedImage::prepare(gray_img);
    let grids = prepared_img.detect_grids();

    if grids.is_empty() {
        return Ok(QrCodeResult {
            found: false,
            content: None,
            qr_type: None,
            position: None,
        });
    }

    // 尝试解码第一个找到的二维码
    match grids[0].decode() {
        Ok((_meta, content)) => {
            // 判断二维码类型
            let qr_type = if content.starts_with("http://") || content.starts_with("https://") {
                "URL"
            } else if content.contains("@") && content.contains(".") {
                "EMAIL"
            } else if content
                .chars()
                .all(|c| c.is_ascii_digit() || c == '+' || c == '-' || c == ' ')
            {
                "PHONE"
            } else {
                "TEXT"
            };

            Ok(QrCodeResult {
                found: true,
                content: Some(content),
                qr_type: Some(qr_type.to_string()),
                position: Some(QrCodePosition {
                    x: 0.0, // rqrr 不直接提供位置信息，这里使用默认值
                    y: 0.0,
                    width: 0.0,
                    height: 0.0,
                }),
            })
        }
        Err(e) => {
            // 检测到二维码但解码失败
            debug_info!("二维码解码失败: {:?}", e);
            Ok(QrCodeResult {
                found: false,
                content: None,
                qr_type: None,
                position: None,
            })
        }
    }
}

/// 在字节流中查找下一个图片
fn find_next_image(data: &[u8], start_offset: usize) -> Option<(String, usize, usize)> {
    let signatures: Vec<(&[u8], &str)> = vec![
        (b"\x89PNG\r\n\x1a\n", "PNG"),
        (b"\xFF\xD8\xFF", "JPEG"),
        (b"GIF87a", "GIF"),
        (b"GIF89a", "GIF"),
        (b"BM", "BMP"),
        (b"RIFF", "WEBP"), // WEBP需要进一步验证
    ];

    let mut earliest_match: Option<(String, usize, usize)> = None;

    for (signature, format) in &signatures {
        if let Some(pos) = find_bytes(data, signature, start_offset) {
            // 验证是否为有效的图片开始
            if *format == "WEBP" {
                // WEBP需要额外验证WEBP标识
                if pos + 12 < data.len() && &data[pos + 8..pos + 12] == b"WEBP" {
                    if let Some(end_pos) = find_image_end(data, pos, format) {
                        if earliest_match.as_ref().map_or(true, |m| pos < m.1) {
                            earliest_match = Some((format.to_string(), pos, end_pos));
                        }
                    }
                }
            } else {
                if let Some(end_pos) = find_image_end(data, pos, format) {
                    if earliest_match.as_ref().map_or(true, |m| pos < m.1) {
                        earliest_match = Some((format.to_string(), pos, end_pos));
                    }
                }
            }
        }
    }

    earliest_match
}

/// 在字节流中查找指定字节序列
fn find_bytes(data: &[u8], pattern: &[u8], start_offset: usize) -> Option<usize> {
    if start_offset >= data.len() {
        return None;
    }

    data[start_offset..]
        .windows(pattern.len())
        .position(|window| window == pattern)
        .map(|pos| pos + start_offset)
}

/// 查找图片结束位置
fn find_image_end(data: &[u8], start_pos: usize, format: &str) -> Option<usize> {
    match format {
        "PNG" => find_png_end(data, start_pos),
        "JPEG" => find_jpeg_end(data, start_pos),
        "GIF" => find_gif_end(data, start_pos),
        "BMP" => find_bmp_end(data, start_pos),
        "WEBP" => find_webp_end(data, start_pos),
        _ => None,
    }
}

/// 查找PNG图片结束位置
fn find_png_end(data: &[u8], start_pos: usize) -> Option<usize> {
    // PNG以IEND块结束
    let iend_signature = b"IEND\xae\x42\x60\x82";
    find_bytes(data, iend_signature, start_pos).map(|pos| pos + iend_signature.len())
}

/// 查找JPEG图片结束位置
fn find_jpeg_end(data: &[u8], start_pos: usize) -> Option<usize> {
    // JPEG以FFD9结束
    find_bytes(data, b"\xFF\xD9", start_pos).map(|pos| pos + 2)
}

/// 查找GIF图片结束位置
fn find_gif_end(data: &[u8], start_pos: usize) -> Option<usize> {
    // GIF以0x3B结束
    for i in start_pos..data.len() {
        if data[i] == 0x3B {
            return Some(i + 1);
        }
    }
    None
}

/// 查找BMP图片结束位置
fn find_bmp_end(data: &[u8], start_pos: usize) -> Option<usize> {
    // BMP文件大小在文件头的第2-5字节
    if start_pos + 6 > data.len() {
        return None;
    }

    let size_bytes = &data[start_pos + 2..start_pos + 6];
    let file_size =
        u32::from_le_bytes([size_bytes[0], size_bytes[1], size_bytes[2], size_bytes[3]]) as usize;

    Some(start_pos + file_size)
}

/// 查找WEBP图片结束位置
fn find_webp_end(data: &[u8], start_pos: usize) -> Option<usize> {
    // WEBP文件大小在RIFF头的第4-7字节
    if start_pos + 8 > data.len() {
        return None;
    }

    let size_bytes = &data[start_pos + 4..start_pos + 8];
    let chunk_size =
        u32::from_le_bytes([size_bytes[0], size_bytes[1], size_bytes[2], size_bytes[3]]) as usize;

    Some(start_pos + 8 + chunk_size)
}

/// 提取图片数据
fn extract_image_data(data: &[u8], start_pos: usize, end_pos: usize) -> Result<Vec<u8>, String> {
    if start_pos >= data.len() || end_pos > data.len() || start_pos >= end_pos {
        return Err("无效的图片数据范围".to_string());
    }

    Ok(data[start_pos..end_pos].to_vec())
}

/// 从字节数据获取图片尺寸
fn get_image_dimensions_from_bytes(image_data: &[u8]) -> Result<(u32, u32), String> {
    match image::load_from_memory(image_data) {
        Ok(img) => {
            use image::GenericImageView;
            let (width, height) = img.dimensions();
            Ok((width, height))
        }
        Err(_) => {
            // 如果image crate无法解析，尝试手动解析
            if image_data.len() >= 24 {
                if &image_data[0..8] == b"\x89PNG\r\n\x1a\n" {
                    // PNG格式
                    if image_data.len() >= 24 {
                        let width = u32::from_be_bytes([
                            image_data[16],
                            image_data[17],
                            image_data[18],
                            image_data[19],
                        ]);
                        let height = u32::from_be_bytes([
                            image_data[20],
                            image_data[21],
                            image_data[22],
                            image_data[23],
                        ]);
                        return Ok((width, height));
                    }
                }
            }
            Ok((0, 0)) // 无法获取尺寸时返回0
        }
    }
}

/// 创建data URL
fn create_data_url(image_data: &[u8], format: &str) -> String {
    let mime_type = match format {
        "PNG" => "image/png",
        "JPEG" => "image/jpeg",
        "GIF" => "image/gif",
        "BMP" => "image/bmp",
        "WEBP" => "image/webp",
        _ => "image/jpeg",
    };

    use base64::{Engine as _, engine::general_purpose};
    let base64_data = general_purpose::STANDARD.encode(image_data);
    format!("data:{};base64,{}", mime_type, base64_data)
}

/// 写入文件
#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<(), String> {
    debug_info!("📝 开始写入文件: {}", path);
    debug_info!("📄 内容长度: {} 字符", content.len());

    let path_buf = std::path::PathBuf::from(&path);

    // 确保父目录存在
    if let Some(parent) = path_buf.parent() {
        if !parent.exists() {
            debug_info!("📁 创建父目录: {:?}", parent);
            fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
        }
    }

    // 写入文件，使用UTF-8编码
    match fs::write(&path_buf, content.as_bytes()) {
        Ok(_) => {
            debug_info!("✅ 文件写入成功: {}", path);
            Ok(())
        }
        Err(e) => {
            debug_info!("❌ 文件写入失败: {}", e);
            Err(format!("写入文件失败: {}", e))
        }
    }
}

/// 复制单个文件
#[tauri::command]
pub fn copy_file(source_path: String, target_path: String) -> Result<String, String> {
    use std::path::Path;

    debug_info!("📄 开始复制文件: {} -> {}", source_path, target_path);

    let source_file = Path::new(&source_path);
    let target_file = Path::new(&target_path);

    // 检查源文件是否存在
    if !source_file.exists() {
        return Err(format!("源文件不存在: {}", source_path));
    }

    if !source_file.is_file() {
        return Err(format!("源路径不是文件: {}", source_path));
    }

    // 确保目标目录存在
    if let Some(parent) = target_file.parent() {
        if !parent.exists() {
            debug_info!("📁 创建目标目录: {:?}", parent);
            fs::create_dir_all(parent).map_err(|e| format!("创建目标目录失败: {}", e))?;
        }
    }

    // 复制文件
    match fs::copy(&source_file, &target_file) {
        Ok(bytes_copied) => {
            let result_msg = format!("成功复制文件到 {}: {} 字节", target_path, bytes_copied);
            debug_info!("✅ {}", result_msg);
            Ok(result_msg)
        }
        Err(e) => {
            let error_msg = format!("复制文件失败: {}", e);
            debug_info!("❌ {}", error_msg);
            Err(error_msg)
        }
    }
}

/// 递归复制整个目录到目标位置
#[tauri::command]
pub async fn copy_directory_recursive(
    source_path: String,
    target_path: String,
) -> Result<String, String> {
    use std::path::Path;

    debug_info!("📁 开始递归复制目录: {} -> {}", source_path, target_path);

    let source_dir = Path::new(&source_path);

    // 检查源目录是否存在
    if !source_dir.exists() {
        return Err(format!("源目录不存在: {}", source_path));
    }

    if !source_dir.is_dir() {
        return Err(format!("源路径不是目录: {}", source_path));
    }

    // 使用tokio::task::spawn_blocking在后台线程中执行同步操作
    let source_path_clone = source_path.clone();
    let target_path_clone = target_path.clone();

    match tokio::task::spawn_blocking(move || {
        copy_dir_recursive_sync(Path::new(&source_path_clone), Path::new(&target_path_clone))
    })
    .await
    {
        Ok(result) => match result {
            Ok((files_count, dirs_count)) => {
                let result_msg = format!(
                    "成功复制目录到 {}: {} 个文件，{} 个子目录",
                    target_path, files_count, dirs_count
                );
                debug_info!("✅ {}", result_msg);
                Ok(result_msg)
            }
            Err(e) => {
                debug_info!("❌ 复制目录失败: {}", e);
                Err(e)
            }
        },
        Err(e) => {
            debug_info!("❌ 任务执行失败: {}", e);
            Err(format!("任务执行失败: {}", e))
        }
    }
}

/// 同步递归复制目录的辅助函数
fn copy_dir_recursive_sync(source: &Path, target: &Path) -> Result<(u32, u32), String> {
    use std::fs;

    let mut files_count = 0u32;
    let mut dirs_count = 0u32;

    // 创建目标目录
    if let Err(e) = fs::create_dir_all(target) {
        return Err(format!("创建目标目录失败 {}: {}", target.display(), e));
    }

    // 读取源目录内容
    let entries =
        fs::read_dir(source).map_err(|e| format!("读取源目录失败 {}: {}", source.display(), e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("读取目录项失败: {}", e))?;
        let entry_path = entry.path();
        let entry_name = match entry_path.file_name() {
            Some(name) => name,
            None => continue,
        };

        let target_path = target.join(entry_name);

        if entry_path.is_dir() {
            // 递归复制子目录
            let (sub_files, sub_dirs) = copy_dir_recursive_sync(&entry_path, &target_path)?;
            files_count += sub_files;
            dirs_count += sub_dirs + 1; // +1 for the current directory

            debug_info!(
                "[+] 复制子目录: {} -> {}",
                entry_path.display(),
                target_path.display()
            );
        } else {
            // 复制文件
            if let Err(e) = fs::copy(&entry_path, &target_path) {
                return Err(format!(
                    "复制文件失败 {} -> {}: {}",
                    entry_path.display(),
                    target_path.display(),
                    e
                ));
            }

            files_count += 1;
            debug_info!(
                "[+] 复制文件: {} -> {}",
                entry_path.display(),
                target_path.display()
            );
        }
    }

    Ok((files_count, dirs_count))
}

/// 读取文件（严格 UTF-8）
#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    let path_buf = std::path::PathBuf::from(&path);

    if !path_buf.exists() {
        return Err("文件不存在".to_string());
    }

    if !path_buf.is_file() {
        return Err("不是有效的文件".to_string());
    }

    // 读取文件内容，使用UTF-8编码
    fs::read_to_string(&path_buf).map_err(|e| format!("读取文件失败: {}", e))
}

/// 智能文本读取结果
#[derive(Debug, Serialize, Deserialize)]
pub struct SmartTextFileResult {
    pub content: String,
    pub encoding: String,
    pub had_invalid_bytes: bool,
    pub size: u64,
}

/// 自动检测编码读取文本文件
///
/// 解码顺序：
/// 1. BOM 检测（UTF-8 BOM / UTF-16 LE / UTF-16 BE）
/// 2. 严格 UTF-8
/// 3. GB18030（中文 Windows 默认，覆盖 GBK/GB2312）
/// 4. UTF-8 lossy 兜底（替换无效字节为 U+FFFD）
///
/// Vol2 在中文 Windows 上常输出 GBK 编码的 txt，
/// 此命令避免 fs::read_to_string 严格 UTF-8 检查的崩溃。
pub fn decode_text_with_fallback(bytes: &[u8]) -> SmartTextFileResult {
    let size = bytes.len() as u64;

    // 1) UTF-8 BOM
    if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        if let Ok(s) = std::str::from_utf8(&bytes[3..]) {
            return SmartTextFileResult {
                content: s.to_string(),
                encoding: "UTF-8 (BOM)".to_string(),
                had_invalid_bytes: false,
                size,
            };
        }
    }

    // 2) UTF-16 LE BOM
    if bytes.starts_with(&[0xFF, 0xFE]) {
        let (cow, _, had_errors) = encoding_rs::UTF_16LE.decode(&bytes[2..]);
        return SmartTextFileResult {
            content: cow.into_owned(),
            encoding: "UTF-16 LE".to_string(),
            had_invalid_bytes: had_errors,
            size,
        };
    }

    // 3) UTF-16 BE BOM
    if bytes.starts_with(&[0xFE, 0xFF]) {
        let (cow, _, had_errors) = encoding_rs::UTF_16BE.decode(&bytes[2..]);
        return SmartTextFileResult {
            content: cow.into_owned(),
            encoding: "UTF-16 BE".to_string(),
            had_invalid_bytes: had_errors,
            size,
        };
    }

    // 4) 严格 UTF-8
    if let Ok(s) = std::str::from_utf8(bytes) {
        return SmartTextFileResult {
            content: s.to_string(),
            encoding: "UTF-8".to_string(),
            had_invalid_bytes: false,
            size,
        };
    }

    // 5) GB18030 (覆盖 GBK / GB2312 / 中文 Windows 默认)
    let (cow, _, had_errors_gb) = encoding_rs::GB18030.decode(bytes);
    if !had_errors_gb {
        return SmartTextFileResult {
            content: cow.into_owned(),
            encoding: "GB18030".to_string(),
            had_invalid_bytes: false,
            size,
        };
    }

    // 6) UTF-8 lossy 兜底
    SmartTextFileResult {
        content: String::from_utf8_lossy(bytes).into_owned(),
        encoding: "UTF-8 (lossy)".to_string(),
        had_invalid_bytes: true,
        size,
    }
}

/// 智能编码识别读取文本文件 — 兼容 Vol2 GBK 输出 / UTF-8 BOM 等
#[tauri::command]
pub fn read_text_file_smart(path: String) -> Result<SmartTextFileResult, String> {
    let path_buf = std::path::PathBuf::from(&path);
    if !path_buf.exists() {
        return Err("文件不存在".to_string());
    }
    if !path_buf.is_file() {
        return Err("不是有效的文件".to_string());
    }
    let bytes = fs::read(&path_buf).map_err(|e| format!("读取文件失败: {}", e))?;
    Ok(decode_text_with_fallback(&bytes))
}

/// 获取文件的hexdump预览
#[tauri::command]
pub fn get_file_hexdump(file_path: String, max_bytes: Option<usize>) -> Result<String, String> {
    let path_buf = std::path::PathBuf::from(&file_path);

    if !path_buf.exists() {
        return Err("文件不存在".to_string());
    }

    if !path_buf.is_file() {
        return Err("不是有效的文件".to_string());
    }

    // 限制最大读取字节数，默认1KB
    let max_read = max_bytes.unwrap_or(1024);

    // 读取文件的二进制数据
    let data = match fs::read(&path_buf) {
        Ok(data) => {
            if data.len() > max_read {
                data[..max_read].to_vec()
            } else {
                data
            }
        }
        Err(e) => return Err(format!("读取文件失败: {}", e)),
    };

    // 生成hexdump格式的字符串
    let mut hexdump = String::new();

    for (i, chunk) in data.chunks(16).enumerate() {
        let offset = i * 16;

        // 地址部分 (8位十六进制)
        hexdump.push_str(&format!("{:08x}  ", offset));

        // 十六进制部分
        for (j, byte) in chunk.iter().enumerate() {
            if j == 8 {
                hexdump.push(' '); // 在第8个字节后添加额外空格
            }
            hexdump.push_str(&format!("{:02x} ", byte));
        }

        // 如果这一行不足16字节，补充空格
        if chunk.len() < 16 {
            let missing = 16 - chunk.len();
            for j in 0..missing {
                if chunk.len() + j == 8 {
                    hexdump.push(' ');
                }
                hexdump.push_str("   ");
            }
        }

        // ASCII部分
        hexdump.push_str(" |");
        for byte in chunk {
            if *byte >= 32 && *byte <= 126 {
                hexdump.push(*byte as char);
            } else {
                hexdump.push('.');
            }
        }
        hexdump.push_str("|\n");
    }

    // 如果文件被截断，添加提示
    if data.len() == max_read
        && fs::metadata(&path_buf)
            .map(|m| m.len() as usize)
            .unwrap_or(0)
            > max_read
    {
        hexdump.push_str(&format!("\n... (文件被截断，仅显示前 {} 字节)", max_read));
    }

    Ok(hexdump)
}

/// NTFS文件查看器返回结果
#[derive(Debug, Serialize, Deserialize)]
pub struct NtfsFileViewerResult {
    pub content: String,
    pub file_size: u64,
    pub truncated: bool,
    pub encoding_used: String,
    pub mode: String,
}

/// 解析 MemProcFS NTFS 文件的可读路径。
///
/// 优先直接文件路径（`M:\forensic\ntfs\<卷>\<路径>`）；若未物化，则回退到
/// MemProcFS 为每个条目暴露的重建内容 `<父目录>\$_INFO\<名称>\mftfile.bin`
/// （再退到 `mftdata.mem`）。三者皆无则返回 None（该文件无法从内存恢复）。
fn resolve_ntfs_read_path(file_path: &str) -> Option<std::path::PathBuf> {
    let direct = std::path::PathBuf::from(file_path);
    if direct.is_file() {
        return Some(direct);
    }
    if let (Some(parent), Some(name)) = (direct.parent(), direct.file_name()) {
        let info_dir = parent.join("$_INFO").join(name);
        for candidate in ["mftfile.bin", "mftdata.mem"] {
            let p = info_dir.join(candidate);
            if p.is_file() {
                return Some(p);
            }
        }
    }
    None
}

/// 读取NTFS挂载点文件内容（支持hexdump/strings模式和多编码）
#[tauri::command]
pub async fn read_ntfs_file_for_viewer(
    file_path: String,
    mode: String,
    encoding: String,
    max_bytes: Option<usize>,
) -> Result<NtfsFileViewerResult, String> {
    let path_buf = resolve_ntfs_read_path(&file_path).ok_or_else(|| {
        format!(
            "文件内容不可用: {}\n\n\
             该文件可能未驻留内存 / 无法从内存恢复（例如已删除、非常驻或稀疏文件）。\n\
             请确认 MemProcFS 已挂载，且该文件在 forensic\\ntfs 下有可恢复内容。",
            file_path
        )
    })?;

    let file_size = fs::metadata(&path_buf)
        .map(|m| m.len())
        .map_err(|e| format!("获取文件信息失败: {}", e))?;

    let max_read = max_bytes.unwrap_or(512 * 1024); // 默认512KB

    let raw_data = fs::read(&path_buf).map_err(|e| format!("读取文件失败: {}", e))?;

    let truncated = raw_data.len() > max_read;
    let data = if truncated {
        &raw_data[..max_read]
    } else {
        &raw_data
    };

    let content = if mode == "hexdump" {
        format_hexdump_view(data, max_read, file_size)
    } else {
        decode_with_encoding(data, &encoding)
    };

    Ok(NtfsFileViewerResult {
        content,
        file_size,
        truncated,
        encoding_used: encoding,
        mode,
    })
}

/// 格式化hexdump视图
fn format_hexdump_view(data: &[u8], _max_read: usize, _file_size: u64) -> String {
    let mut hexdump = String::new();

    for (i, chunk) in data.chunks(16).enumerate() {
        let offset = i * 16;
        hexdump.push_str(&format!("{:08x}  ", offset));

        for (j, byte) in chunk.iter().enumerate() {
            if j == 8 {
                hexdump.push(' ');
            }
            hexdump.push_str(&format!("{:02x} ", byte));
        }

        if chunk.len() < 16 {
            let missing = 16 - chunk.len();
            for j in 0..missing {
                if chunk.len() + j == 8 {
                    hexdump.push(' ');
                }
                hexdump.push_str("   ");
            }
        }

        hexdump.push_str(" |");
        for byte in chunk {
            if *byte >= 32 && *byte <= 126 {
                hexdump.push(*byte as char);
            } else {
                hexdump.push('.');
            }
        }
        hexdump.push_str("|\n");
    }

    hexdump
}

/// 使用指定编码解码字节数据
fn decode_with_encoding(data: &[u8], encoding: &str) -> String {
    use encoding_rs::*;

    match encoding.to_lowercase().as_str() {
        "utf-8" | "utf8" => String::from_utf8_lossy(data).to_string(),
        "gbk" | "gb2312" | "gb18030" => {
            let (result, _, _) = GBK.decode(data);
            result.to_string()
        }
        "utf-16le" | "utf16le" => {
            let (result, _, _) = UTF_16LE.decode(data);
            result.to_string()
        }
        "utf-16be" | "utf16be" => {
            let (result, _, _) = UTF_16BE.decode(data);
            result.to_string()
        }
        "ascii" => data
            .iter()
            .map(|&b| if b >= 32 && b <= 126 { b as char } else { '.' })
            .collect(),
        _ => String::from_utf8_lossy(data).to_string(),
    }
}

/// 文件哈希值结果结构体
#[derive(Debug, Serialize, Deserialize)]
pub struct FileHashResult {
    pub file_path: String,
    pub file_size: u64,
    pub md5: String,
    pub sha1: String,
    pub sha256: String,
    pub crc32: String,
}

/// 计算文件的多种哈希值
#[tauri::command]
pub async fn calculate_file_hashes(file_path: String) -> Result<FileHashResult, String> {
    let path_buf = std::path::PathBuf::from(&file_path);

    if !path_buf.exists() {
        return Err("文件不存在".to_string());
    }

    if !path_buf.is_file() {
        return Err("不是有效的文件".to_string());
    }

    // 获取文件大小
    let file_size = match fs::metadata(&path_buf) {
        Ok(metadata) => metadata.len(),
        Err(e) => return Err(format!("获取文件信息失败: {}", e)),
    };

    debug_info!("🔍 开始计算文件哈希值: {}", file_path);
    debug_info!("📏 文件大小: {} 字节", file_size);

    // 初始化哈希计算器
    let mut md5_hasher = md5::Context::new();
    let mut sha1_hasher = Sha1::new();
    let mut sha256_hasher = Sha256::new();
    let mut crc32_hasher = Crc32Hasher::new();

    // 打开文件并分块读取
    let mut file = match fs::File::open(&path_buf) {
        Ok(file) => file,
        Err(e) => return Err(format!("打开文件失败: {}", e)),
    };

    let mut buffer = [0u8; 8192]; // 8KB 缓冲区
    let mut total_read = 0u64;

    loop {
        match file.read(&mut buffer) {
            Ok(0) => break, // 文件读取完毕
            Ok(bytes_read) => {
                let chunk = &buffer[..bytes_read];

                // 更新所有哈希计算器
                md5_hasher.consume(chunk);
                sha1_hasher.update(chunk);
                sha256_hasher.update(chunk);
                crc32_hasher.update(chunk);

                total_read += bytes_read as u64;

                // 每读取1MB打印一次进度（对于大文件）
                if total_read % (1024 * 1024) == 0 {
                    debug_info!("📊 已处理: {} MB", total_read / (1024 * 1024));
                }
            }
            Err(e) => return Err(format!("读取文件失败: {}", e)),
        }
    }

    // 计算最终哈希值
    let md5_result = format!("{:x}", md5_hasher.finalize());
    let sha1_result = hex::encode(sha1_hasher.finalize());
    let sha256_result = hex::encode(sha256_hasher.finalize());
    let crc32_result = format!("{:08x}", crc32_hasher.finalize());

    debug_info!("✅ 哈希计算完成");
    debug_info!("🔐 MD5:    {}", md5_result);
    debug_info!("🔐 SHA1:   {}", sha1_result);
    debug_info!("🔐 SHA256: {}", sha256_result);
    debug_info!("🔐 CRC32:  {}", crc32_result);

    Ok(FileHashResult {
        file_path,
        file_size,
        md5: md5_result,
        sha1: sha1_result,
        sha256: sha256_result,
        crc32: crc32_result,
    })
}

/// CSV文件数据结构（用于内嵌CSV查看器）
#[derive(serde::Serialize)]
pub struct EmbeddedCSVData {
    pub filename: String,
    pub filepath: String,
    pub headers: Vec<String>,
    pub rows: Vec<std::collections::HashMap<String, String>>,
}

/// 读取CSV文件用于内嵌显示（不打开新窗口）
#[tauri::command]
pub async fn read_csv_file_embedded(csv_file_path: String) -> Result<EmbeddedCSVData, String> {
    use std::collections::HashMap;
    use std::fs::File;
    use std::io::{BufRead, BufReader};

    //debug_info!("📊 [内嵌CSV] 开始读取CSV文件: {}", csv_file_path);

    // 检查文件是否存在
    if !std::path::Path::new(&csv_file_path).exists() {
        return Err(format!("文件不存在: {}", csv_file_path));
    }

    // 打开文件
    let file = File::open(&csv_file_path).map_err(|e| format!("无法打开文件: {}", e))?;

    let reader = BufReader::new(file);
    let mut lines = reader.lines();

    // 读取第一行作为表头
    let first_line = lines
        .next()
        .ok_or("文件为空")?
        .map_err(|e| format!("读取表头失败: {}", e))?;

    let headers = parse_csv_line_for_embedded(first_line.trim(), ',');

    if headers.is_empty() {
        return Err("表头为空".to_string());
    }

    //debug_info!("📊 [内嵌CSV] 表头: {:?}", headers);

    // 读取所有数据行
    let mut rows: Vec<HashMap<String, String>> = Vec::new();
    let mut _line_count = 0;

    for line_result in lines {
        match line_result {
            Ok(line) => {
                if line.trim().is_empty() {
                    continue;
                }

                let values = parse_csv_line_for_embedded(line.trim(), ',');
                let mut row_data = HashMap::new();

                for (i, value) in values.iter().enumerate() {
                    if i < headers.len() {
                        row_data.insert(headers[i].clone(), value.clone());
                    }
                }

                rows.push(row_data);
                _line_count += 1;
            }
            Err(e) => {
                debug_info!("⚠️ [内嵌CSV] 读取行失败: {}", e);
                continue;
            }
        }
    }

    // 提取文件名
    let filename = std::path::Path::new(&csv_file_path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "unknown.csv".to_string());

    //debug_info!("✅ [内嵌CSV] 读取完成: {} 行数据", line_count);

    Ok(EmbeddedCSVData {
        filename,
        filepath: csv_file_path,
        headers,
        rows,
    })
}

/// 解析CSV行（用于内嵌CSV查看器）
fn parse_csv_line_for_embedded(line: &str, delimiter: char) -> Vec<String> {
    // 对于简单情况（无引号），使用快速分割
    if !line.contains('"') {
        return line
            .split(delimiter)
            .map(|s| s.trim().to_string())
            .collect();
    }

    // 复杂情况：处理引号内的逗号
    let mut result = Vec::new();
    let mut current_field = String::new();
    let mut in_quotes = false;
    let mut chars = line.chars().peekable();

    while let Some(c) = chars.next() {
        match c {
            '"' => {
                if in_quotes {
                    // 检查是否是转义的引号
                    if chars.peek() == Some(&'"') {
                        current_field.push('"');
                        chars.next();
                    } else {
                        in_quotes = false;
                    }
                } else {
                    in_quotes = true;
                }
            }
            c if c == delimiter && !in_quotes => {
                result.push(current_field.trim().to_string());
                current_field = String::new();
            }
            _ => {
                current_field.push(c);
            }
        }
    }

    // 添加最后一个字段
    result.push(current_field.trim().to_string());

    result
}
