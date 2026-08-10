//! 模板命令模块
//!
//! 提供模板读取和功能映射相关的 Tauri 命令

use crate::types;

/// 触发主界面功能
#[tauri::command]
pub async fn trigger_main_feature(
    feature: String,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    use tauri::Emitter;

    // 发送事件到前端，通知主界面执行相应功能
    app_handle
        .emit("trigger-main-feature", &feature)
        .map_err(|e| format!("发送事件失败: {}", e))?;

    Ok(format!("已触发功能: {}", feature))
}

/// 读取模板目录
#[tauri::command]
pub async fn read_template_directory(path: String) -> Result<Vec<types::FileInfo>, String> {
    use std::fs;
    use std::path::Path;

    let template_dir = Path::new(&path);

    if !template_dir.exists() {
        // 如果目录不存在，尝试创建它
        fs::create_dir_all(&template_dir).map_err(|e| format!("创建模板目录失败: {}", e))?;
        return Ok(Vec::new());
    }

    let mut files = Vec::new();

    let entries = fs::read_dir(&template_dir).map_err(|e| format!("读取模板目录失败: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("读取目录项失败: {}", e))?;
        let path = entry.path();

        if path.is_file() {
            if let Some(file_name) = path.file_name() {
                if let Some(name_str) = file_name.to_str() {
                    let metadata = entry
                        .metadata()
                        .map_err(|e| format!("获取文件元数据失败: {}", e))?;

                    let extension = path
                        .extension()
                        .and_then(|ext| ext.to_str())
                        .unwrap_or("")
                        .to_string();

                    let modified = metadata
                        .modified()
                        .map(|time| format!("{:?}", time))
                        .unwrap_or_else(|_| "Unknown".to_string());

                    let created = metadata
                        .created()
                        .map(|time| format!("{:?}", time))
                        .unwrap_or_else(|_| "Unknown".to_string());

                    files.push(types::FileInfo {
                        name: name_str.to_string(),
                        size: metadata.len(),
                        is_dir: false,
                        modified,
                        created,
                        extension,
                    });
                }
            }
        }
    }

    // 按文件名排序
    files.sort_by(|a, b| a.name.cmp(&b.name));

    Ok(files)
}

/// 读取模板文件内容
#[tauri::command]
pub async fn read_template_file(path: String, filename: String) -> Result<String, String> {
    use std::fs;
    use std::path::Path;

    let template_path = Path::new(&path).join(&filename);

    if !template_path.exists() {
        return Err(format!("模板文件不存在: {}", filename));
    }

    let content =
        fs::read_to_string(&template_path).map_err(|e| format!("读取模板文件失败: {}", e))?;

    Ok(content)
}

/// 获取文件名到功能的映射关系
#[tauri::command]
pub async fn get_file_to_feature_mapping()
-> Result<std::collections::HashMap<String, String>, String> {
    use std::collections::HashMap;

    let mut mapping = HashMap::new();

    // Volatility3 Windows 功能映射
    mapping.insert("output_vol3_info.txt".to_string(), "vol3-info".to_string());
    mapping.insert(
        "output_vol3_pslist.csv".to_string(),
        "vol3-pslist".to_string(),
    );
    mapping.insert(
        "output_vol3_psscan.csv".to_string(),
        "vol3-psscan".to_string(),
    );
    mapping.insert(
        "output_vol3_netscan.csv".to_string(),
        "vol3-netscan".to_string(),
    );
    mapping.insert(
        "output_vol3_filescan.csv".to_string(),
        "vol3-filescan".to_string(),
    );
    mapping.insert(
        "output_vol3_hashdump.txt".to_string(),
        "vol3-hashdump".to_string(),
    );
    mapping.insert(
        "output_vol3_malfind.csv".to_string(),
        "vol3-malfind".to_string(),
    );
    mapping.insert(
        "output_vol3_banners.txt".to_string(),
        "vol3-banners".to_string(),
    );
    mapping.insert(
        "output_vol3_crashinfo.txt".to_string(),
        "vol3-crashinfo".to_string(),
    );
    mapping.insert(
        "output_vol3_statistics.csv".to_string(),
        "vol3-statistics".to_string(),
    );
    mapping.insert(
        "output_vol3_verinfo.txt".to_string(),
        "vol3-verinfo".to_string(),
    );
    mapping.insert(
        "output_vol3_pstree.csv".to_string(),
        "vol3-pstree".to_string(),
    );
    mapping.insert(
        "output_vol3_psxview.csv".to_string(),
        "vol3-psxview".to_string(),
    );
    mapping.insert(
        "output_vol3_handles.csv".to_string(),
        "vol3-handles".to_string(),
    );
    mapping.insert(
        "output_vol3_dlllist.csv".to_string(),
        "vol3-dlllist".to_string(),
    );
    mapping.insert(
        "output_vol3_ldrmodules.csv".to_string(),
        "vol3-ldrmodules".to_string(),
    );
    mapping.insert(
        "output_vol3_modscan.csv".to_string(),
        "vol3-modscan".to_string(),
    );
    mapping.insert(
        "output_vol3_modules.csv".to_string(),
        "vol3-modules".to_string(),
    );
    mapping.insert(
        "output_vol3_driverscan.csv".to_string(),
        "vol3-driverscan".to_string(),
    );
    mapping.insert(
        "output_vol3_devicetree.csv".to_string(),
        "vol3-devicetree".to_string(),
    );
    mapping.insert("output_vol3_ssdt.csv".to_string(), "vol3-ssdt".to_string());
    mapping.insert(
        "output_vol3_callbacks.csv".to_string(),
        "vol3-callbacks".to_string(),
    );
    mapping.insert("output_vol3_idt.csv".to_string(), "vol3-idt".to_string());
    mapping.insert("output_vol3_gdt.csv".to_string(), "vol3-gdt".to_string());
    mapping.insert(
        "output_vol3_threads.csv".to_string(),
        "vol3-threads".to_string(),
    );
    mapping.insert(
        "output_vol3_thrdscan.csv".to_string(),
        "vol3-thrdscan".to_string(),
    );
    mapping.insert(
        "output_vol3_mutantscan.csv".to_string(),
        "vol3-mutantscan".to_string(),
    );
    mapping.insert(
        "output_vol3_symlinkscan.csv".to_string(),
        "vol3-symlinkscan".to_string(),
    );
    mapping.insert(
        "output_vol3_vadinfo.csv".to_string(),
        "vol3-vadinfo".to_string(),
    );
    mapping.insert(
        "output_vol3_vadwalk.csv".to_string(),
        "vol3-vadwalk".to_string(),
    );
    mapping.insert(
        "output_vol3_vadyarascan.csv".to_string(),
        "vol3-vadyarascan".to_string(),
    );
    mapping.insert(
        "output_vol3_virtmap.csv".to_string(),
        "vol3-virtmap".to_string(),
    );
    mapping.insert(
        "output_vol3_memmap.csv".to_string(),
        "vol3-memmap".to_string(),
    );
    mapping.insert(
        "output_vol3_bigpools.csv".to_string(),
        "vol3-bigpools".to_string(),
    );
    mapping.insert(
        "output_vol3_poolscanner.csv".to_string(),
        "vol3-poolscanner".to_string(),
    );

    // Vol3Linux 功能映射
    mapping.insert(
        "vol3linux_banners.txt".to_string(),
        "vol3linux-banners".to_string(),
    );
    mapping.insert(
        "vol3linux_boottime.csv".to_string(),
        "vol3linux-boottime".to_string(),
    );
    mapping.insert(
        "vol3linux_iomem.csv".to_string(),
        "vol3linux-iomem".to_string(),
    );
    mapping.insert(
        "vol3linux_vmcoreinfo.csv".to_string(),
        "vol3linux-vmcoreinfo".to_string(),
    );
    mapping.insert(
        "vol3linux_dmesg.csv".to_string(),
        "vol3linux-dmesg".to_string(),
    );
    mapping.insert(
        "vol3linux_kmsg.csv".to_string(),
        "vol3linux-kmsg".to_string(),
    );
    mapping.insert(
        "vol3linux_kallsyms.csv".to_string(),
        "vol3linux-kallsyms".to_string(),
    );
    mapping.insert(
        "vol3linux_pslist.csv".to_string(),
        "vol3linux-pslist".to_string(),
    );
    mapping.insert(
        "vol3linux_psscan.csv".to_string(),
        "vol3linux-psscan".to_string(),
    );
    mapping.insert(
        "vol3linux_pstree.csv".to_string(),
        "vol3linux-pstree".to_string(),
    );
    mapping.insert(
        "vol3linux_psaux.txt".to_string(),
        "vol3linux-psaux".to_string(),
    );
    mapping.insert(
        "vol3linux_proc_maps.csv".to_string(),
        "vol3linux-proc_maps".to_string(),
    );
    mapping.insert(
        "vol3linux_pscallstack.csv".to_string(),
        "vol3linux-pscallstack".to_string(),
    );
    mapping.insert(
        "vol3linux_pidhashtable.csv".to_string(),
        "vol3linux-pidhashtable".to_string(),
    );
    mapping.insert(
        "vol3linux_capabilities.csv".to_string(),
        "vol3linux-capabilities".to_string(),
    );
    mapping.insert(
        "vol3linux_ptrace.csv".to_string(),
        "vol3linux-ptrace".to_string(),
    );
    mapping.insert(
        "vol3linux_bash.csv".to_string(),
        "vol3linux-bash".to_string(),
    );
    mapping.insert(
        "vol3linux_bash_history.csv".to_string(),
        "vol3linux-bash_history".to_string(),
    );
    mapping.insert(
        "vol3linux_bash_hash.csv".to_string(),
        "vol3linux-bash_hash".to_string(),
    );
    mapping.insert(
        "vol3linux_envars.csv".to_string(),
        "vol3linux-envars".to_string(),
    );
    mapping.insert(
        "vol3linux_users.csv".to_string(),
        "vol3linux-users".to_string(),
    );
    mapping.insert(
        "vol3linux_ip_addr.csv".to_string(),
        "vol3linux-ip_addr".to_string(),
    );
    mapping.insert(
        "vol3linux_ip_link.csv".to_string(),
        "vol3linux-ip_link".to_string(),
    );
    mapping.insert("vol3linux_arp.csv".to_string(), "vol3linux-arp".to_string());
    mapping.insert(
        "vol3linux_netstat.csv".to_string(),
        "vol3linux-netstat".to_string(),
    );
    mapping.insert(
        "vol3linux_route.csv".to_string(),
        "vol3linux-route".to_string(),
    );
    mapping.insert(
        "vol3linux_sockstat.csv".to_string(),
        "vol3linux-sockstat".to_string(),
    );
    mapping.insert(
        "vol3linux_netfilter.csv".to_string(),
        "vol3linux-netfilter".to_string(),
    );

    // Volatility2 功能映射
    mapping.insert(
        "vol2_imageinfo.txt".to_string(),
        "vol2-imageinfo".to_string(),
    );
    mapping.insert("vol2_pslist.csv".to_string(), "vol2-pslist".to_string());
    mapping.insert("vol2_psscan.csv".to_string(), "vol2-psscan".to_string());
    mapping.insert("vol2_pstree.csv".to_string(), "vol2-pstree".to_string());
    mapping.insert("vol2_psxview.csv".to_string(), "vol2-psxview".to_string());
    mapping.insert("vol2_netscan.csv".to_string(), "vol2-netscan".to_string());
    mapping.insert("vol2_netstat.csv".to_string(), "vol2-netstat".to_string());
    mapping.insert(
        "vol2_connections.csv".to_string(),
        "vol2-connections".to_string(),
    );
    mapping.insert("vol2_connscan.csv".to_string(), "vol2-connscan".to_string());
    mapping.insert("vol2_sockets.csv".to_string(), "vol2-sockets".to_string());
    mapping.insert("vol2_sockscan.csv".to_string(), "vol2-sockscan".to_string());
    mapping.insert("vol2_filescan.csv".to_string(), "vol2-filescan".to_string());
    mapping.insert("vol2_handles.csv".to_string(), "vol2-handles".to_string());
    mapping.insert("vol2_dlllist.csv".to_string(), "vol2-dlllist".to_string());
    mapping.insert(
        "vol2_ldrmodules.csv".to_string(),
        "vol2-ldrmodules".to_string(),
    );
    mapping.insert("vol2_modscan.csv".to_string(), "vol2-modscan".to_string());
    mapping.insert("vol2_modules.csv".to_string(), "vol2-modules".to_string());
    mapping.insert(
        "vol2_driverscan.csv".to_string(),
        "vol2-driverscan".to_string(),
    );
    mapping.insert(
        "vol2_devicetree.csv".to_string(),
        "vol2-devicetree".to_string(),
    );
    mapping.insert("vol2_ssdt.csv".to_string(), "vol2-ssdt".to_string());
    mapping.insert("vol2_idt.csv".to_string(), "vol2-idt".to_string());
    mapping.insert("vol2_gdt.csv".to_string(), "vol2-gdt".to_string());
    mapping.insert(
        "vol2_callbacks.csv".to_string(),
        "vol2-callbacks".to_string(),
    );
    mapping.insert("vol2_threads.csv".to_string(), "vol2-threads".to_string());
    mapping.insert("vol2_thrdscan.csv".to_string(), "vol2-thrdscan".to_string());
    mapping.insert(
        "vol2_mutantscan.csv".to_string(),
        "vol2-mutantscan".to_string(),
    );
    mapping.insert(
        "vol2_symlinkscan.csv".to_string(),
        "vol2-symlinkscan".to_string(),
    );
    mapping.insert("vol2_vadinfo.csv".to_string(), "vol2-vadinfo".to_string());
    mapping.insert("vol2_vadwalk.csv".to_string(), "vol2-vadwalk".to_string());
    mapping.insert("vol2_vadtree.csv".to_string(), "vol2-vadtree".to_string());
    mapping.insert("vol2_vaddump.csv".to_string(), "vol2-vaddump".to_string());
    mapping.insert("vol2_procdump.csv".to_string(), "vol2-procdump".to_string());
    mapping.insert("vol2_memdump.csv".to_string(), "vol2-memdump".to_string());
    mapping.insert("vol2_dlldump.csv".to_string(), "vol2-dlldump".to_string());
    mapping.insert("vol2_moddump.csv".to_string(), "vol2-moddump".to_string());
    mapping.insert("vol2_hashdump.txt".to_string(), "vol2-hashdump".to_string());
    mapping.insert("vol2_lsadump.txt".to_string(), "vol2-lsadump".to_string());
    mapping.insert(
        "vol2_cachedump.txt".to_string(),
        "vol2-cachedump".to_string(),
    );
    mapping.insert("vol2_hivelist.csv".to_string(), "vol2-hivelist".to_string());
    mapping.insert("vol2_hivescan.csv".to_string(), "vol2-hivescan".to_string());
    mapping.insert("vol2_printkey.txt".to_string(), "vol2-printkey".to_string());
    mapping.insert("vol2_hivedump.txt".to_string(), "vol2-hivedump".to_string());
    mapping.insert(
        "vol2_userassist.csv".to_string(),
        "vol2-userassist".to_string(),
    );
    mapping.insert(
        "vol2_shellbags.csv".to_string(),
        "vol2-shellbags".to_string(),
    );
    mapping.insert(
        "vol2_shimcache.csv".to_string(),
        "vol2-shimcache".to_string(),
    );
    mapping.insert(
        "vol2_getservicesids.txt".to_string(),
        "vol2-getservicesids".to_string(),
    );
    mapping.insert("vol2_getsids.txt".to_string(), "vol2-getsids".to_string());
    mapping.insert("vol2_privs.csv".to_string(), "vol2-privs".to_string());
    mapping.insert("vol2_envars.csv".to_string(), "vol2-envars".to_string());
    mapping.insert("vol2_cmdline.csv".to_string(), "vol2-cmdline".to_string());
    mapping.insert("vol2_consoles.csv".to_string(), "vol2-consoles".to_string());
    mapping.insert("vol2_cmdscan.csv".to_string(), "vol2-cmdscan".to_string());
    mapping.insert(
        "vol2_clipboard.txt".to_string(),
        "vol2-clipboard".to_string(),
    );
    mapping.insert(
        "vol2_clipboard_verbose.txt".to_string(),
        "vol2-clipboard-verbose".to_string(),
    );
    mapping.insert(
        "vol2_iehistory.txt".to_string(),
        "vol2-iehistory".to_string(),
    );
    mapping.insert(
        "vol2_screenshot.csv".to_string(),
        "vol2-screenshot".to_string(),
    );
    mapping.insert("vol2_deskscan.csv".to_string(), "vol2-deskscan".to_string());
    mapping.insert("vol2_atoms.csv".to_string(), "vol2-atoms".to_string());
    mapping.insert("vol2_atomscan.csv".to_string(), "vol2-atomscan".to_string());
    mapping.insert(
        "vol2_messagehooks.txt".to_string(),
        "vol2-messagehooks".to_string(),
    );
    mapping.insert(
        "vol2_eventhooks.txt".to_string(),
        "vol2-eventhooks".to_string(),
    );
    mapping.insert("vol2_wintree.txt".to_string(), "vol2-wintree".to_string());
    mapping.insert("vol2_windows.txt".to_string(), "vol2-windows".to_string());
    mapping.insert("vol2_sessions.csv".to_string(), "vol2-sessions".to_string());
    mapping.insert("vol2_wndscan.csv".to_string(), "vol2-wndscan".to_string());
    mapping.insert(
        "vol2_dumpfiles.csv".to_string(),
        "vol2-dumpfiles".to_string(),
    );
    mapping.insert(
        "vol2_mftparser.txt".to_string(),
        "vol2-mftparser".to_string(),
    );
    mapping.insert(
        "vol2_timeliner.csv".to_string(),
        "vol2-timeliner".to_string(),
    );
    mapping.insert(
        "vol2_malsysproc.csv".to_string(),
        "vol2-malsysproc".to_string(),
    );
    mapping.insert("vol2_malfind.csv".to_string(), "vol2-malfind".to_string());
    mapping.insert("vol2_apihooks.csv".to_string(), "vol2-apihooks".to_string());
    mapping.insert(
        "vol2_driverirp.csv".to_string(),
        "vol2-driverirp".to_string(),
    );
    mapping.insert(
        "vol2_unloadedmodules.csv".to_string(),
        "vol2-unloadedmodules".to_string(),
    );
    mapping.insert("vol2_limeinfo.txt".to_string(), "vol2-limeinfo".to_string());
    mapping.insert(
        "vol2_imagecopy.csv".to_string(),
        "vol2-imagecopy".to_string(),
    );
    mapping.insert("vol2_raw2dmp.csv".to_string(), "vol2-raw2dmp".to_string());
    mapping.insert("vol2_vboxinfo.txt".to_string(), "vol2-vboxinfo".to_string());
    mapping.insert(
        "vol2_vmwareinfo.txt".to_string(),
        "vol2-vmwareinfo".to_string(),
    );
    mapping.insert("vol2_hpakinfo.txt".to_string(), "vol2-hpakinfo".to_string());
    mapping.insert(
        "vol2_hpakextract.csv".to_string(),
        "vol2-hpakextract".to_string(),
    );
    mapping.insert(
        "vol2_crashinfo.txt".to_string(),
        "vol2-crashinfo".to_string(),
    );
    mapping.insert("vol2_hibinfo.txt".to_string(), "vol2-hibinfo".to_string());
    mapping.insert("vol2_kdbgscan.csv".to_string(), "vol2-kdbgscan".to_string());
    mapping.insert("vol2_kpcrscan.csv".to_string(), "vol2-kpcrscan".to_string());
    mapping.insert("vol2_poolpeek.csv".to_string(), "vol2-poolpeek".to_string());
    mapping.insert("vol2_bigpools.csv".to_string(), "vol2-bigpools".to_string());

    Ok(mapping)
}

/// 获取应用程序路径信息，用于一键配置
#[tauri::command]
pub async fn get_app_paths() -> Result<std::collections::HashMap<String, String>, String> {
    use std::collections::HashMap;

    debug_info!("正在获取应用程序路径...");

    // 获取当前可执行文件路径
    let current_exe =
        std::env::current_exe().map_err(|e| format!("获取当前可执行文件路径失败: {}", e))?;

    let app_dir = current_exe.parent().ok_or("无法获取应用程序目录")?;

    // 获取上一级目录（Tools目录的父目录）
    let parent_dir = app_dir.parent().ok_or("无法获取上级目录")?;

    let tools_dir = parent_dir.join("Tools");

    let mut paths = HashMap::new();

    // 应用程序相关路径
    paths.insert("app_dir".to_string(), app_dir.to_string_lossy().to_string());
    paths.insert(
        "parent_dir".to_string(),
        parent_dir.to_string_lossy().to_string(),
    );
    paths.insert(
        "tools_dir".to_string(),
        tools_dir.to_string_lossy().to_string(),
    );

    // Python 路径
    let python2_path = tools_dir.join("python27").join("python27.exe");
    let python3_path = tools_dir.join("python3").join("python.exe");
    paths.insert(
        "python2_path".to_string(),
        python2_path.to_string_lossy().to_string(),
    );
    paths.insert(
        "python3_path".to_string(),
        python3_path.to_string_lossy().to_string(),
    );

    // MemProcFS 路径
    let memprocfs_path = tools_dir.join("MemProcFS").join("MemProcFS.exe");
    paths.insert(
        "memprocfs_path".to_string(),
        memprocfs_path.to_string_lossy().to_string(),
    );

    // DumpIt 路径
    let dumpit_path = tools_dir.join("DumpIt").join("DumpIt.exe");
    paths.insert(
        "dumpit_path".to_string(),
        dumpit_path.to_string_lossy().to_string(),
    );

    // Volatility 路径
    let volatility2_path = tools_dir.join("volatility2_python").join("vol.py");
    let volatility2_plugin_path = tools_dir.join("volatility2_plugin");
    let volatility3_path = tools_dir.join("volatility3").join("vol.py");
    paths.insert(
        "volatility2_path".to_string(),
        volatility2_path.to_string_lossy().to_string(),
    );
    paths.insert(
        "volatility2_plugin".to_string(),
        volatility2_plugin_path.to_string_lossy().to_string(),
    );
    paths.insert(
        "volatility3_path".to_string(),
        volatility3_path.to_string_lossy().to_string(),
    );

    // 应用程序目录下的路径
    let output_path = app_dir.join("output");
    let scripts_path = app_dir.join("scripts");
    let extensions_path = app_dir.join("extensions");
    let tooltip_rules_path = app_dir.join("tooltip_rules");

    paths.insert(
        "output_path".to_string(),
        output_path.to_string_lossy().to_string(),
    );
    paths.insert(
        "scripts_path".to_string(),
        scripts_path.to_string_lossy().to_string(),
    );
    paths.insert(
        "extensions_path".to_string(),
        extensions_path.to_string_lossy().to_string(),
    );
    paths.insert(
        "tooltip_rules_path".to_string(),
        tooltip_rules_path.to_string_lossy().to_string(),
    );

    Ok(paths)
}

/// 启动时验证应用设置
#[tauri::command]
pub async fn validate_settings_on_startup()
-> Result<crate::settings_validator::SettingsValidationResult, String> {
    use crate::settings;
    use crate::settings_validator;

    debug_info!("开始启动时设置验证");

    let settings = settings::load_settings()?;
    let validation_result = settings_validator::validate_app_settings(&settings);

    if !validation_result.is_valid {
        debug_warn!("设置验证发现问题: {}", validation_result.summary);
        for issue in &validation_result.issues {
            match issue.severity {
                settings_validator::IssueSeverity::Critical => {
                    debug_error!("[关键] {}: {}", issue.field_name, issue.description);
                }
                settings_validator::IssueSeverity::Warning => {
                    debug_warn!("[警告] {}: {}", issue.field_name, issue.description);
                }
                settings_validator::IssueSeverity::Info => {
                    debug_info!("[建议] {}: {}", issue.field_name, issue.description);
                }
            }
        }
    } else {
        debug_info!("设置验证通过");
    }

    Ok(validation_result)
}
