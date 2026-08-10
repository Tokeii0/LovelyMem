//! 文件操作模块
//!
//! 负责 forensic 文件复制、输出目录清理等文件系统操作

use crate::AppSettings;
use std::path::{Path, PathBuf};
use tokio::fs;

use super::utils::{check_memprocfs_mount_status, get_system_arch, is_arm64_system};

/// 清空输出目录
pub async fn clear_output_directory(output_path: &str) -> Result<String, String> {
    debug_info!("[*] 开始清空输出目录: {}", output_path);

    let output_dir = Path::new(output_path);

    // 检查目录是否存在
    if !output_dir.exists() {
        debug_info!("[*] 输出目录不存在，创建新目录");
        fs::create_dir_all(output_dir)
            .await
            .map_err(|e| format!("创建输出目录失败: {}", e))?;
        return Ok("输出目录已创建".to_string());
    }

    // 尝试直接删除整个目录并重新创建
    match fs::remove_dir_all(output_dir).await {
        Ok(_) => {
            debug_info!("[+] 成功删除输出目录");
            match fs::create_dir_all(output_dir).await {
                Ok(_) => {
                    debug_info!("[+] 成功重新创建空的输出目录");
                    return Ok("输出目录清空完成".to_string());
                }
                Err(e) => {
                    debug_info!("[-] 重新创建输出目录失败: {}", e);
                    return Err(format!("删除成功但重新创建目录失败: {}", e));
                }
            }
        }
        Err(e) => {
            debug_info!("[-] 直接 remove_dir_all 失败: {}，尝试使用备用方案", e);
        }
    }

    // 备用方案：逐个删除文件和目录
    let mut entries = fs::read_dir(output_dir)
        .await
        .map_err(|e| format!("读取输出目录失败: {}", e))?;

    let mut deleted_files = 0;
    let mut deleted_dirs = 0;
    let mut errors = Vec::new();

    while let Some(entry) = entries
        .next_entry()
        .await
        .map_err(|e| format!("读取目录项失败: {}", e))?
    {
        let path = entry.path();
        let file_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("未知文件");

        debug_info!("[*] 删除: {}", path.display());

        if path.is_dir() {
            match fs::remove_dir_all(&path).await {
                Ok(_) => {
                    deleted_dirs += 1;
                    debug_info!("[+] 成功删除目录: {}", file_name);
                }
                Err(e) => {
                    let error_msg = format!("删除目录失败 {}: {}", file_name, e);
                    errors.push(error_msg.clone());
                    debug_info!("[-] {}", error_msg);
                }
            }
        } else {
            match fs::remove_file(&path).await {
                Ok(_) => {
                    deleted_files += 1;
                    debug_info!("[+] 成功删除文件: {}", file_name);
                }
                Err(e) => {
                    let error_msg = format!("删除文件失败 {}: {}", file_name, e);
                    errors.push(error_msg.clone());
                    debug_info!("[-] {}", error_msg);
                }
            }
        }
    }

    // 生成结果消息
    let mut result_parts = Vec::new();

    if deleted_files > 0 {
        result_parts.push(format!("删除了 {} 个文件", deleted_files));
    }

    if deleted_dirs > 0 {
        result_parts.push(format!("删除了 {} 个目录", deleted_dirs));
    }

    if deleted_files == 0 && deleted_dirs == 0 {
        return Ok("输出目录已经是空的".to_string());
    }

    let success_msg = if result_parts.is_empty() {
        "输出目录清空完成".to_string()
    } else {
        format!("输出目录清空完成: {}", result_parts.join("，"))
    };

    if !errors.is_empty() {
        return Err(format!(
            "{}，但有部分操作失败: {}",
            success_msg,
            errors.join("; ")
        ));
    }

    Ok(success_msg)
}

/// 异步复制目录下所有文件到目标目录
pub async fn copy_forensic_files(settings: &AppSettings) -> Result<String, String> {
    // ARM64 系统特殊处理
    if is_arm64_system() {
        debug_info!("[*] ARM64 系统检测到，启用文件复制兼容性模式");
        debug_info!("[*] 系统架构: {}", get_system_arch());

        let mount_info = check_memprocfs_mount_status();
        debug_info!("[*] MemProcFS 挂载状态检查:");
        for info in &mount_info {
            debug_info!("    {}", info);
        }
    }

    // 根据平台确定挂载路径
    let (source_dir, otherfilelist) = {
        #[cfg(target_os = "macos")]
        {
            let desktop_path = std::env::var("HOME")
                .map(|home| format!("{}/Desktop/MemProcFS", home))
                .unwrap_or_else(|_| "/Users/Shared/MemProcFS".to_string());
            let source_dir_path = format!("{}/forensic/csv", desktop_path);
            let source_dir = PathBuf::from(source_dir_path);
            let otherfilelist = vec![
                (
                    format!("{}/sys/sysinfo/sysinfo.txt", desktop_path),
                    "sysinfo.txt".to_string(),
                ),
                (
                    format!("{}/forensic/findevil/yara.txt", desktop_path),
                    "yara.txt".to_string(),
                ),
            ];
            (source_dir, otherfilelist)
        }

        #[cfg(not(target_os = "macos"))]
        {
            let root = crate::settings::mount_root();
            let source_dir = PathBuf::from(format!("{}forensic\\csv", root));
            let otherfilelist = vec![
                (
                    format!("{}sys\\sysinfo\\sysinfo.txt", root),
                    "sysinfo.txt".to_string(),
                ),
                (
                    format!("{}forensic\\findevil\\yara.txt", root),
                    "yara.txt".to_string(),
                ),
                (
                    format!("{}py\\regsecrets\\all.txt", root),
                    "secrets_all.txt".to_string(),
                ),
                (
                    format!("{}py\\reg\\usb\\usb_devices.txt", root),
                    "usb_devices.txt".to_string(),
                ),
            ];
            (source_dir, otherfilelist)
        }
    };

    let target_dir = Path::new(&settings.output_path);

    // 并行复制独立文件列表中的文件
    let copy_tasks: Vec<_> = otherfilelist
        .iter()
        .map(|(source_path, target_filename)| {
            let source = PathBuf::from(source_path);
            let target = target_dir.join(target_filename);
            let src_display = source_path.clone();
            let tgt_name = target_filename.clone();
            tokio::spawn(async move {
                if source.exists() {
                    match fs::copy(&source, &target).await {
                        Ok(_) => {
                            debug_info!(
                                "[+] 成功复制独立文件: {} -> {}",
                                src_display,
                                target.display()
                            );
                            Some(tgt_name)
                        }
                        Err(e) => {
                            debug_info!("[-] 复制独立文件失败 {}: {}", src_display, e);
                            None
                        }
                    }
                } else {
                    debug_info!("[*] 独立文件不存在，跳过: {}", src_display);
                    None
                }
            })
        })
        .collect();

    let mut copied_individual_files = Vec::new();
    for task in copy_tasks {
        if let Ok(Some(name)) = task.await {
            copied_individual_files.push(name);
        }
    }

    // 复制 py\lovelymem 目录下的 txt 文件
    let py_lovelymem_dir = {
        #[cfg(target_os = "macos")]
        {
            let desktop_path = std::env::var("HOME")
                .map(|home| format!("{}/Desktop/MemProcFS/py/lovelymem", home))
                .unwrap_or_else(|_| "/Users/Shared/MemProcFS/py/lovelymem".to_string());
            PathBuf::from(desktop_path)
        }

        #[cfg(not(target_os = "macos"))]
        {
            PathBuf::from(format!("{}py\\lovelymem", crate::settings::mount_root()))
        }
    };

    if py_lovelymem_dir.exists() {
        debug_info!(
            "[*] 开始复制 {} 目录下的 txt 文件到 lovelymem 子目录",
            py_lovelymem_dir.display()
        );
        match copy_txt_files_as_csv(&py_lovelymem_dir, target_dir, Some("lovelymem")).await {
            Ok(count) => {
                debug_info!(
                    "[+] 成功从 {} 复制了 {} 个 txt 文件（转为 csv）到 lovelymem 子目录",
                    py_lovelymem_dir.display(),
                    count
                );
            }
            Err(e) => {
                debug_info!(
                    "[-] 从 {} 复制 txt 文件失败: {}",
                    py_lovelymem_dir.display(),
                    e
                );
            }
        }
    } else {
        debug_info!("[*] 目录不存在，跳过: {}", py_lovelymem_dir.display());
    }

    // 复制 py\by-user 目录下的 lovelymem 文件
    let by_user_base_dir = {
        #[cfg(target_os = "macos")]
        {
            let desktop_path = std::env::var("HOME")
                .map(|home| format!("{}/Desktop/MemProcFS/py/by-user", home))
                .unwrap_or_else(|_| "/Users/Shared/MemProcFS/py/by-user".to_string());
            PathBuf::from(desktop_path)
        }

        #[cfg(not(target_os = "macos"))]
        {
            PathBuf::from(format!("{}py\\by-user", crate::settings::mount_root()))
        }
    };

    if by_user_base_dir.exists() {
        debug_info!(
            "[*] 开始扫描 {} 目录下的用户目录",
            by_user_base_dir.display()
        );
        match copy_by_user_lovelymem_files(&by_user_base_dir, target_dir).await {
            Ok(count) => {
                debug_info!(
                    "[+] 成功从 by-user 目录复制了 {} 个 txt 文件（转为 csv）",
                    count
                );
            }
            Err(e) => {
                debug_info!("[-] 从 by-user 目录复制文件失败: {}", e);
            }
        }
    } else {
        debug_info!("[*] 目录不存在，跳过: {}", by_user_base_dir.display());
    }

    // 检查源目录是否存在
    if !source_dir.exists() {
        debug_info!("[*] 默认源目录不存在: {}", source_dir.display());

        // 搜索替代路径
        let alternative_paths = get_alternative_paths();

        let mut found_csv_dir = None;

        for alt_path in &alternative_paths {
            if alt_path.exists() {
                let csv_subdir = alt_path.join("csv");
                if csv_subdir.exists() {
                    found_csv_dir = Some(csv_subdir);
                    break;
                }

                if let Ok(entries) = std::fs::read_dir(alt_path) {
                    let has_csv_files = entries.filter_map(|entry| entry.ok()).any(|entry| {
                        entry
                            .path()
                            .extension()
                            .and_then(|ext| ext.to_str())
                            .map(|ext| ext.to_lowercase() == "csv")
                            .unwrap_or(false)
                    });

                    if has_csv_files {
                        found_csv_dir = Some(alt_path.to_path_buf());
                        break;
                    }
                }
            }
        }

        if let Some(csv_dir) = found_csv_dir {
            debug_info!("[*] 在 {} 找到 forensic CSV 文件", csv_dir.display());
            return copy_files_from_directory(&csv_dir, target_dir).await;
        }

        let mut error_msg = "执行失败请确认:\n-是否M盘被占用 \n-是否正确安装Dokany \n-检查内存镜像版本为非XP \n-检查是否自己修改了软件目录结构 ".to_string();

        // ARM64 系统特殊错误信息
        if is_arm64_system() {
            error_msg.push_str(&format!(
                "\n\n[ARM64 系统特殊说明]\n\
                - 当前系统架构: {}\n\
                - ARM64 系统上 MemProcFS 可能使用不同的挂载方式",
                get_system_arch()
            ));

            // ARM64 备用策略
            debug_info!("[*] ARM64 系统启用备用文件复制策略");
            let current_dir =
                std::env::current_dir().unwrap_or_else(|_| Path::new(".").to_path_buf());

            let search_dirs = [
                current_dir.join("forensic"),
                current_dir.join("output"),
                current_dir.join("csv"),
                current_dir.join("temp"),
            ];

            for search_dir in &search_dirs {
                if search_dir.exists() {
                    debug_info!("[*] 在 {} 找到目录，尝试复制文件", search_dir.display());
                    match copy_files_from_directory(search_dir, target_dir).await {
                        Ok(result) => {
                            debug_info!("[✓] ARM64 备用策略成功: {}", result);
                            return Ok(format!("ARM64 备用策略成功: {}", result));
                        }
                        Err(e) => {
                            debug_info!("[-] ARM64 备用策略失败 {}: {}", search_dir.display(), e);
                        }
                    }
                }
            }
        }

        return Err(error_msg);
    }

    debug_info!(
        "[*] 开始从 {} 复制 forensic 文件到 {}",
        source_dir.display(),
        target_dir.display()
    );
    copy_files_from_directory(&source_dir, target_dir).await
}

/// 获取替代搜索路径
fn get_alternative_paths() -> Vec<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        let desktop_path = std::env::var("HOME")
            .map(|home| format!("{}/Desktop/MemProcFS", home))
            .unwrap_or_else(|_| "/Users/Shared/MemProcFS".to_string());
        vec![
            PathBuf::from(format!("{}/forensic", desktop_path)),
            PathBuf::from(format!("{}/csv", desktop_path)),
            PathBuf::from(&desktop_path),
            PathBuf::from("/tmp/memprocfs"),
            PathBuf::from("/Users/Shared/memprocfs"),
            PathBuf::from("./forensic"),
            PathBuf::from("./output"),
            PathBuf::from("./csv"),
        ]
    }

    #[cfg(not(target_os = "macos"))]
    {
        let root = crate::settings::mount_root();
        let mut paths = vec![
            PathBuf::from(format!("{}forensic", root)),
            PathBuf::from(format!("{}csv", root)),
            PathBuf::from(&root),
        ];

        if is_arm64_system() {
            debug_info!("[*] ARM64 系统，添加额外搜索路径");
            paths.extend_from_slice(&[
                PathBuf::from("C:\\temp\\memprocfs"),
                PathBuf::from("C:\\Users\\Public\\memprocfs"),
                PathBuf::from("D:\\memprocfs"),
                PathBuf::from("C:\\Tools\\MemProcFS"),
                PathBuf::from(".\\forensic"),
                PathBuf::from(".\\output"),
                PathBuf::from(".\\csv"),
            ]);
        }
        paths
    }
}

/// 从指定目录复制所有文件到目标目录
pub async fn copy_files_from_directory(
    source_dir: &Path,
    target_dir: &Path,
) -> Result<String, String> {
    // 创建目标目录
    if let Err(e) = fs::create_dir_all(target_dir).await {
        return Err(format!("创建output目录失败: {}", e));
    }

    let mut entries = match fs::read_dir(source_dir).await {
        Ok(entries) => entries,
        Err(e) => return Err(format!("读取源目录失败: {}", e)),
    };

    let mut copied_files = Vec::new();
    let mut errors = Vec::new();

    while let Some(entry) = entries
        .next_entry()
        .await
        .map_err(|e| format!("读取目录项失败: {}", e))?
    {
        let file_path = entry.path();

        if file_path.is_file() {
            let file_name = match file_path.file_name() {
                Some(name) => name,
                None => continue,
            };

            let target_path = target_dir.join(file_name);

            match fs::copy(&file_path, &target_path).await {
                Ok(_) => {
                    copied_files.push(file_name.to_string_lossy().to_string());
                }
                Err(e) => {
                    let error_msg = format!("复制文件失败 {}: {}", file_path.display(), e);
                    errors.push(error_msg.clone());
                    debug_info!("[-] {}", error_msg);
                }
            }
        }
    }

    if !errors.is_empty() {
        return Err(format!("部分文件复制失败: {}", errors.join("; ")));
    }
    Ok("成功复制文件到 output 目录".to_string())
}

/// 复制目录下所有 txt 文件并重命名为 csv
///
/// # 参数
/// - `source_dir`: 源目录路径
/// - `target_dir`: 目标目录路径
/// - `sub_folder`: 可选的子目录名，如果提供则在 target_dir 下创建该子目录
pub async fn copy_txt_files_as_csv(
    source_dir: &Path,
    target_dir: &Path,
    sub_folder: Option<&str>,
) -> Result<usize, String> {
    // 确定实际的目标目录
    let actual_target_dir = if let Some(folder_name) = sub_folder {
        target_dir.join(folder_name)
    } else {
        target_dir.to_path_buf()
    };

    if let Err(e) = fs::create_dir_all(&actual_target_dir).await {
        return Err(format!("创建目标目录失败: {}", e));
    }

    let mut entries = match fs::read_dir(source_dir).await {
        Ok(entries) => entries,
        Err(e) => return Err(format!("读取源目录失败: {}", e)),
    };

    let mut copied_count = 0;

    while let Some(entry) = entries
        .next_entry()
        .await
        .map_err(|e| format!("读取目录项失败: {}", e))?
    {
        let file_path = entry.path();

        if file_path.is_file() {
            if let Some(extension) = file_path.extension() {
                if extension.to_str().unwrap_or("").to_lowercase() == "txt" {
                    if let Some(file_stem) = file_path.file_stem() {
                        let new_filename = format!("{}.csv", file_stem.to_string_lossy());
                        let target_path = actual_target_dir.join(&new_filename);

                        match fs::copy(&file_path, &target_path).await {
                            Ok(_) => {
                                copied_count += 1;
                                debug_info!(
                                    "[+] 成功复制并转换: {} -> {}",
                                    file_path.display(),
                                    target_path.display()
                                );
                            }
                            Err(e) => {
                                debug_info!("[-] 复制文件失败 {}: {}", file_path.display(), e);
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(copied_count)
}

/// 扫描 by-user 目录下所有用户子目录的 lovelymem 文件夹
pub async fn copy_by_user_lovelymem_files(
    by_user_dir: &Path,
    target_dir: &Path,
) -> Result<usize, String> {
    // 在 target_dir 下创建 lovelymem 子目录
    let lovelymem_target = target_dir.join("lovelymem");
    if let Err(e) = fs::create_dir_all(&lovelymem_target).await {
        return Err(format!("创建目标目录失败: {}", e));
    }

    let mut entries = match fs::read_dir(by_user_dir).await {
        Ok(entries) => entries,
        Err(e) => return Err(format!("读取 by-user 目录失败: {}", e)),
    };

    let mut total_copied = 0;

    while let Some(entry) = entries
        .next_entry()
        .await
        .map_err(|e| format!("读取目录项失败: {}", e))?
    {
        let user_dir = entry.path();

        if user_dir.is_dir() {
            let lovelymem_dir = user_dir.join("lovelymem");

            if lovelymem_dir.exists() && lovelymem_dir.is_dir() {
                debug_info!("[*] 发现 lovelymem 目录: {}", lovelymem_dir.display());

                // 直接复制到 lovelymem_target，不需要额外子目录
                match copy_txt_files_as_csv(&lovelymem_dir, &lovelymem_target, None).await {
                    Ok(count) => {
                        total_copied += count;
                        debug_info!(
                            "[+] 从 {} 复制了 {} 个文件到 lovelymem 子目录",
                            lovelymem_dir.display(),
                            count
                        );
                    }
                    Err(e) => {
                        debug_info!("[-] 从 {} 复制文件失败: {}", lovelymem_dir.display(), e);
                    }
                }
            }
        }
    }

    Ok(total_copied)
}

/// 公共的重新复制 forensic 文件函数
pub async fn copy_forensic_files_retry() -> Result<String, String> {
    debug_info!("[*] 前端请求重新复制 forensic 文件");

    let settings = crate::settings::load_settings_command()
        .await
        .map_err(|e| format!("加载设置失败: {}", e))?;

    if is_arm64_system() {
        debug_info!("[*] ARM64 系统重新复制 forensic 文件");
        debug_info!("[*] 系统架构: {}", get_system_arch());
    }

    match copy_forensic_files(&settings).await {
        Ok(result) => {
            debug_info!("[✓] 重新复制 forensic 文件成功: {}", result);
            Ok(format!("重新复制成功: {}", result))
        }
        Err(e) => {
            debug_info!("[-] 重新复制 forensic 文件失败: {}", e);
            Err(format!("重新复制失败: {}", e))
        }
    }
}
