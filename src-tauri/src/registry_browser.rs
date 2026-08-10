use lazy_static::lazy_static;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::sync::mpsc;

/// 隐藏的目录列表（在根 registry 目录下隐藏）
const HIDDEN_DIRS: [&str; 3] = ["by-hive", "hive_files", "hive_memory"];

lazy_static! {
    /// 全局搜索取消标记
    static ref SEARCH_CANCEL_FLAG: AtomicBool = AtomicBool::new(false);
    static ref SEARCH_ACTIVE: Mutex<bool> = Mutex::new(false);
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RegistryEntry {
    pub name: String,
    pub is_directory: bool,
    pub last_modified: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RegistryValue {
    pub name: String,
    pub value_type: String,
    pub data: String,
}

/// 读取注册表目录（键）
#[tauri::command]
pub async fn read_registry_directory(path: String) -> Result<Vec<RegistryEntry>, String> {
    debug_info!("🔍 读取注册表目录: {}", path);

    let registry_path = Path::new(&path);

    if !registry_path.exists() {
        return Err(format!("路径不存在: {}", path));
    }

    if !registry_path.is_dir() {
        return Err(format!("不是目录: {}", path));
    }

    let entries = fs::read_dir(registry_path).map_err(|e| format!("读取目录失败: {}", e))?;

    let mut result = Vec::new();
    // 使用全局常量
    let is_root_registry = registry_path
        .file_name()
        .map(|f| f.to_string_lossy().to_lowercase() == "registry")
        .unwrap_or(false);

    for entry in entries {
        let entry = entry.map_err(|e| format!("读取条目失败: {}", e))?;
        let metadata = entry
            .metadata()
            .map_err(|e| format!("读取元数据失败: {}", e))?;
        let name = entry.file_name().to_string_lossy().to_string();

        let last_modified = metadata.modified().ok().and_then(|time| {
            time.duration_since(std::time::UNIX_EPOCH)
                .ok()
                .map(|d| d.as_secs().to_string())
        });

        // 如果是根 registry 目录并且该目录名称属于 HIDDEN_DIRS，则跳过
        if is_root_registry && metadata.is_dir() {
            let name_lc = name.to_lowercase();
            if HIDDEN_DIRS.contains(&name_lc.as_str()) {
                continue;
            }
        }

        result.push(RegistryEntry {
            name,
            is_directory: metadata.is_dir(),
            last_modified,
        });
    }

    // 按类型和名称排序
    result.sort_by(|a, b| match (a.is_directory, b.is_directory) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.cmp(&b.name),
    });

    debug_info!("✅ 成功读取 {} 个条目", result.len());
    Ok(result)
}

/// 读取注册表值
#[tauri::command]
pub async fn read_registry_values(path: String) -> Result<Vec<RegistryValue>, String> {
    debug_info!("🔍 读取注册表值: {}", path);

    let registry_path = Path::new(&path);

    if !registry_path.exists() {
        return Err(format!("路径不存在: {}", path));
    }

    if !registry_path.is_dir() {
        return Err(format!("不是目录: {}", path));
    }

    let entries = fs::read_dir(registry_path).map_err(|e| format!("读取目录失败: {}", e))?;

    let mut values_map = std::collections::HashMap::new();

    for entry in entries {
        let entry = entry.map_err(|e| format!("读取条目失败: {}", e))?;
        let metadata = entry
            .metadata()
            .map_err(|e| format!("读取元数据失败: {}", e))?;

        // 只处理文件
        if metadata.is_file() {
            let file_name = entry.file_name().to_string_lossy().to_string();
            let file_path = entry.path();

            // 确定是二进制文件还是文本文件
            if file_name.ends_with(".txt") {
                // 这是类型描述文件，读取类型信息
                let value_name = file_name.trim_end_matches(".txt").to_string();

                // 获取或创建值条目
                let value = values_map
                    .entry(value_name.clone())
                    .or_insert_with(|| RegistryValue {
                        name: value_name.clone(),
                        value_type: "Unknown".to_string(),
                        data: String::new(),
                    });

                // 读取 txt 文件获取类型和值
                if let Ok(content) = fs::read_to_string(&file_path) {
                    let lines: Vec<&str> = content.lines().collect();

                    // 第二行是类型（索引1）
                    if lines.len() > 1 {
                        let type_line = lines[1];
                        if type_line.starts_with("Type: ") {
                            value.value_type = type_line[6..].trim().to_string();
                        } else {
                            value.value_type = type_line.trim().to_string();
                        }
                    }

                    // 尝试从 txt 中提取 Value 字段
                    for line in lines {
                        if line.starts_with("Value: ") {
                            value.data = line[7..].trim().to_string();
                            break;
                        }
                    }
                }
            } else {
                // 这是二进制数据文件
                let value_name = file_name.clone();

                // 获取或创建值条目
                let value = values_map
                    .entry(value_name.clone())
                    .or_insert_with(|| RegistryValue {
                        name: value_name.clone(),
                        value_type: "Unknown".to_string(),
                        data: String::new(),
                    });

                // 如果还没有从 txt 读取到数据，尝试读取二进制文件
                if value.data.is_empty() {
                    if let Ok(bytes) = fs::read(&file_path) {
                        // 尝试解析为 ASCII/UTF-8
                        if let Ok(text) = String::from_utf8(bytes.clone()) {
                            // 检查是否是可打印的 ASCII
                            if text.chars().all(|c| {
                                c.is_ascii() && (c.is_ascii_graphic() || c.is_ascii_whitespace())
                            }) {
                                value.data = text.trim_end_matches('\0').to_string();
                            } else {
                                // 尝试 UTF-16 解析
                                if bytes.len() % 2 == 0 {
                                    let utf16_chars: Vec<u16> = bytes
                                        .chunks_exact(2)
                                        .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
                                        .take_while(|&c| c != 0)
                                        .collect();

                                    if let Ok(utf16_str) = String::from_utf16(&utf16_chars) {
                                        value.data = utf16_str;
                                    } else {
                                        // 无法解析为文本，显示为十六进制
                                        value.data = format_hex_data(&bytes);
                                    }
                                } else {
                                    // 无法解析为文本，显示为十六进制
                                    value.data = format_hex_data(&bytes);
                                }
                            }
                        } else {
                            // 无法解析为 UTF-8，显示为十六进制
                            value.data = format_hex_data(&bytes);
                        }
                    }
                }
            }
        }
    }

    let mut result: Vec<RegistryValue> = values_map.into_values().collect();

    // 排序：(Default) 在前，其他按名称排序
    result.sort_by(|a, b| {
        if a.name == "(Default)" {
            std::cmp::Ordering::Less
        } else if b.name == "(Default)" {
            std::cmp::Ordering::Greater
        } else {
            a.name.cmp(&b.name)
        }
    });

    debug_info!("✅ 成功读取 {} 个值", result.len());
    Ok(result)
}

/// 格式化二进制数据为十六进制字符串（最多显示 32 字节）
fn format_hex_data(bytes: &[u8]) -> String {
    let display_bytes = if bytes.len() > 32 {
        &bytes[..32]
    } else {
        bytes
    };

    let hex: String = display_bytes
        .iter()
        .map(|b| format!("{:02X}", b))
        .collect::<Vec<_>>()
        .join(" ");

    if bytes.len() > 32 {
        format!("{} ... ({} bytes total)", hex, bytes.len())
    } else if bytes.len() <= 8 {
        // 对于小数据，也显示十进制值
        if bytes.len() == 4 {
            let dword = u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]);
            format!("{} ({})", hex, dword)
        } else if bytes.len() == 8 {
            let qword = u64::from_le_bytes([
                bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
            ]);
            format!("{} ({})", hex, qword)
        } else {
            hex
        }
    } else {
        hex
    }
}

/// 检查路径是否存在
#[tauri::command]
pub async fn check_registry_path(path: String) -> Result<bool, String> {
    Ok(Path::new(&path).exists())
}

/// 读取单个注册表值的详细信息（用于详情弹窗）
#[tauri::command]
pub async fn read_registry_value_detail(
    path: String,
    value_name: String,
) -> Result<RegistryValueDetail, String> {
    debug_info!("🔍 读取注册表值详情: {} -> {}", path, value_name);

    let registry_path = Path::new(&path);

    if !registry_path.exists() {
        return Err(format!("路径不存在: {}", path));
    }

    let mut detail = RegistryValueDetail {
        name: value_name.clone(),
        value_type: "Unknown".to_string(),
        data_text: String::new(),
        data_hex: String::new(),
        data_size: 0,
    };

    // 读取 txt 文件获取类型
    let txt_path = registry_path.join(format!("{}.txt", value_name));
    if txt_path.exists() {
        if let Ok(content) = fs::read_to_string(&txt_path) {
            let lines: Vec<&str> = content.lines().collect();

            // 第二行是类型
            if lines.len() > 1 {
                let type_line = lines[1];
                if type_line.starts_with("Type: ") {
                    detail.value_type = type_line[6..].trim().to_string();
                } else {
                    detail.value_type = type_line.trim().to_string();
                }
            }

            // 尝试从 txt 中提取 Value 字段
            for line in lines {
                if line.starts_with("Value: ") {
                    detail.data_text = line[7..].to_string();
                    break;
                }
            }
        }
    }

    // 读取二进制文件
    let bin_path = registry_path.join(&value_name);
    if bin_path.exists() {
        if let Ok(bytes) = fs::read(&bin_path) {
            detail.data_size = bytes.len();

            // 生成 hexdump 格式的十六进制表示
            detail.data_hex = format_hexdump(&bytes);

            // 如果文本数据为空，尝试解析二进制数据
            if detail.data_text.is_empty() {
                // 尝试 UTF-8
                if let Ok(text) = String::from_utf8(bytes.clone()) {
                    if text
                        .chars()
                        .all(|c| c.is_ascii() && (c.is_ascii_graphic() || c.is_ascii_whitespace()))
                    {
                        detail.data_text = text.trim_end_matches('\0').to_string();
                    }
                }

                // 如果 UTF-8 失败，尝试 UTF-16
                if detail.data_text.is_empty() && bytes.len() % 2 == 0 {
                    let utf16_chars: Vec<u16> = bytes
                        .chunks_exact(2)
                        .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
                        .take_while(|&c| c != 0)
                        .collect();

                    if let Ok(utf16_str) = String::from_utf16(&utf16_chars) {
                        detail.data_text = utf16_str;
                    }
                }
            }
        }
    }

    debug_info!("✅ 成功读取值详情: {}", value_name);
    Ok(detail)
}

/// 格式化为 hexdump 样式（类似 xxd 输出）
fn format_hexdump(bytes: &[u8]) -> String {
    let mut result = String::new();

    for (offset, chunk) in bytes.chunks(16).enumerate() {
        // 偏移地址（8位十六进制）
        result.push_str(&format!("{:08x}: ", offset * 16));

        // 十六进制数据（每8字节一组）
        for (i, byte) in chunk.iter().enumerate() {
            result.push_str(&format!("{:02x} ", byte));
            if i == 7 {
                result.push(' '); // 中间额外空格
            }
        }

        // 填充空白（如果不足16字节）
        let padding = 16 - chunk.len();
        for i in 0..padding {
            result.push_str("   ");
            if i == 7 {
                result.push(' ');
            }
        }

        // ASCII 表示
        result.push_str(" |");
        for &byte in chunk {
            if byte.is_ascii_graphic() || byte == b' ' {
                result.push(byte as char);
            } else {
                result.push('.');
            }
        }
        result.push('|');
        result.push('\n');
    }

    result
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RegistryValueDetail {
    pub name: String,
    pub value_type: String,
    pub data_text: String,
    pub data_hex: String,
    pub data_size: usize,
}

/// 注册表搜索结果
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RegistrySearchResult {
    /// 匹配类型：key（键/文件夹名）, value_name（值名）, value_data（值数据）
    pub match_type: String,
    /// 完整路径
    pub path: String,
    /// 显示名称
    pub name: String,
    /// 匹配的内容预览
    pub preview: String,
    /// 值类型（如果是值）
    pub value_type: Option<String>,
}

/// 注册表搜索配置
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RegistrySearchConfig {
    /// 搜索关键词
    pub query: String,
    /// 搜索根路径
    pub root_path: String,
    /// 是否区分大小写
    pub case_sensitive: bool,
    /// 是否搜索键名（文件夹名）
    pub search_keys: bool,
    /// 是否搜索值名
    pub search_value_names: bool,
    /// 是否搜索值数据
    pub search_value_data: bool,
    /// 最大结果数
    pub max_results: usize,
}

impl Default for RegistrySearchConfig {
    fn default() -> Self {
        Self {
            query: String::new(),
            root_path: format!("{}registry", crate::settings::mount_root()),
            case_sensitive: false,
            search_keys: true,
            search_value_names: true,
            search_value_data: true,
            max_results: 500,
        }
    }
}

/// 注册表搜索进度
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RegistrySearchProgress {
    /// 当前正在搜索的路径
    pub current_path: String,
    /// 已扫描的文件/目录数
    pub scanned_count: usize,
    /// 已找到的结果数
    pub found_count: usize,
    /// 是否完成
    pub completed: bool,
    /// 错误信息（如果有）
    pub error: Option<String>,
    /// 新找到的结果（实时推送）
    pub new_results: Vec<RegistrySearchResult>,
}

/// 检查路径是否在隐藏目录下
fn is_in_hidden_dir(path: &Path, root_path: &Path) -> bool {
    // 获取相对路径
    if let Ok(relative) = path.strip_prefix(root_path) {
        // 检查第一级目录是否是隐藏目录
        if let Some(first_component) = relative.components().next() {
            let first_dir = first_component.as_os_str().to_string_lossy().to_lowercase();
            return HIDDEN_DIRS.contains(&first_dir.as_str());
        }
    }
    false
}

/// 搜索注册表
#[tauri::command]
pub async fn search_registry(
    config: RegistrySearchConfig,
) -> Result<Vec<RegistrySearchResult>, String> {
    debug_info!(
        "🔍 开始搜索注册表: query='{}', root='{}'",
        config.query,
        config.root_path
    );

    if config.query.trim().is_empty() {
        return Err("搜索关键词不能为空".to_string());
    }

    let root_path = Path::new(&config.root_path);
    if !root_path.exists() {
        return Err(format!("路径不存在: {}", config.root_path));
    }

    // 在阻塞线程中执行同步搜索
    tokio::task::spawn_blocking(move || search_registry_internal_sync(config, None))
        .await
        .map_err(|e| format!("搜索任务失败: {}", e))?
}

/// 取消注册表搜索
#[tauri::command]
pub fn cancel_registry_search() -> Result<(), String> {
    debug_info!("⚠️ 收到取消搜索请求");
    SEARCH_CANCEL_FLAG.store(true, Ordering::SeqCst);
    Ok(())
}

/// 搜索注册表（带进度回调）
#[tauri::command]
pub async fn search_registry_with_progress(
    config: RegistrySearchConfig,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    use tauri::Emitter;

    debug_info!(
        "🔍 开始带进度搜索注册表: query='{}', root='{}'",
        config.query,
        config.root_path
    );

    // 检查是否有搜索正在进行
    {
        let mut active = SEARCH_ACTIVE.lock().unwrap_or_else(|e| e.into_inner());
        if *active {
            return Err("已有搜索正在进行中".to_string());
        }
        *active = true;
    }

    // 重置取消标记
    SEARCH_CANCEL_FLAG.store(false, Ordering::SeqCst);

    if config.query.trim().is_empty() {
        *SEARCH_ACTIVE.lock().unwrap_or_else(|e| e.into_inner()) = false;
        return Err("搜索关键词不能为空".to_string());
    }

    let root_path = Path::new(&config.root_path);
    if !root_path.exists() {
        *SEARCH_ACTIVE.lock().unwrap_or_else(|e| e.into_inner()) = false;
        return Err(format!("路径不存在: {}", config.root_path));
    }

    // 创建进度通道
    let (progress_sender, mut progress_receiver) =
        mpsc::unbounded_channel::<RegistrySearchProgress>();

    // 启动进度监听任务
    let app_handle_clone = app_handle.clone();
    tokio::spawn(async move {
        while let Some(progress) = progress_receiver.recv().await {
            if let Err(e) = app_handle_clone.emit("registry-search-progress", &progress) {
                debug_error!("发送进度事件失败: {}", e);
            }
        }
    });

    // 在阻塞线程池中执行搜索（WalkDir 是同步的）
    let config_clone = config.clone();
    let app_handle_clone = app_handle.clone();

    tokio::task::spawn_blocking(move || {
        // 短暂延迟，确保前端监听器已准备好
        std::thread::sleep(std::time::Duration::from_millis(50));

        let result = search_registry_internal_sync(config_clone, Some(progress_sender));

        // 标记搜索结束
        *SEARCH_ACTIVE.lock().unwrap_or_else(|e| e.into_inner()) = false;

        // 发送完成事件
        match result {
            Ok(search_results) => {
                if let Err(e) = app_handle_clone.emit("registry-search-completed", &search_results)
                {
                    debug_error!("发送完成事件失败: {}", e);
                }
            }
            Err(error) => {
                if let Err(e) = app_handle_clone.emit("registry-search-error", &error) {
                    debug_error!("发送错误事件失败: {}", e);
                }
            }
        }
    });

    Ok(())
}

/// 内部搜索实现（同步版本，用于 spawn_blocking）
fn search_registry_internal_sync(
    config: RegistrySearchConfig,
    progress_sender: Option<mpsc::UnboundedSender<RegistrySearchProgress>>,
) -> Result<Vec<RegistrySearchResult>, String> {
    let root_path = Path::new(&config.root_path);

    let mut all_results = Vec::new();
    let query = if config.case_sensitive {
        config.query.clone()
    } else {
        config.query.to_lowercase()
    };

    let mut scanned_count = 0usize;
    let mut last_progress_time = std::time::Instant::now();
    let mut pending_results: Vec<RegistrySearchResult> = Vec::new();

    // 立即发送初始进度
    if let Some(ref sender) = progress_sender {
        let _ = sender.send(RegistrySearchProgress {
            current_path: "正在初始化搜索...".to_string(),
            scanned_count: 0,
            found_count: 0,
            completed: false,
            error: None,
            new_results: vec![],
        });
    }

    // 辅助闭包：发送进度和结果
    let send_progress = |sender: &mpsc::UnboundedSender<RegistrySearchProgress>,
                         current_path: &str,
                         scanned: usize,
                         found: usize,
                         new_results: Vec<RegistrySearchResult>,
                         completed: bool| {
        let _ = sender.send(RegistrySearchProgress {
            current_path: current_path.to_string(),
            scanned_count: scanned,
            found_count: found,
            completed,
            error: None,
            new_results,
        });
    };

    // 使用手动递归遍历
    let mut dirs_to_scan: Vec<std::path::PathBuf> = vec![root_path.to_path_buf()];
    let mut was_cancelled = false;

    while let Some(current_dir) = dirs_to_scan.pop() {
        // 检查是否被取消
        if SEARCH_CANCEL_FLAG.load(Ordering::SeqCst) {
            debug_info!("⚠️ 搜索已被用户取消");
            was_cancelled = true;
            break;
        }

        // 检查结果数量限制
        if all_results.len() >= config.max_results {
            debug_info!("⚠️ 达到最大结果数限制: {}", config.max_results);
            break;
        }

        // 跳过隐藏目录
        if is_in_hidden_dir(&current_dir, root_path) {
            continue;
        }

        // 每 100ms 发送一次进度和累积的结果
        if let Some(ref sender) = progress_sender {
            if last_progress_time.elapsed().as_millis() > 100
                || !pending_results.is_empty() && last_progress_time.elapsed().as_millis() > 50
            {
                let results_to_send = std::mem::take(&mut pending_results);
                send_progress(
                    sender,
                    &current_dir.to_string_lossy(),
                    scanned_count,
                    all_results.len(),
                    results_to_send,
                    false,
                );
                last_progress_time = std::time::Instant::now();
            }
        }

        // 读取当前目录
        let entries = match fs::read_dir(&current_dir) {
            Ok(entries) => entries,
            Err(_) => continue,
        };

        for entry in entries.filter_map(|e| e.ok()) {
            scanned_count += 1;

            let path = entry.path();
            let metadata = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };

            let name = entry.file_name().to_string_lossy().to_string();
            let name_for_match = if config.case_sensitive {
                name.clone()
            } else {
                name.to_lowercase()
            };

            if metadata.is_dir() {
                // 添加子目录到待扫描列表
                dirs_to_scan.push(path.clone());

                // 搜索键名（目录名）
                if config.search_keys && name_for_match.contains(&query) {
                    let result = RegistrySearchResult {
                        match_type: "key".to_string(),
                        path: path.to_string_lossy().to_string(),
                        name: name.clone(),
                        preview: format!("键: {}", path.to_string_lossy()),
                        value_type: None,
                    };
                    all_results.push(result.clone());
                    pending_results.push(result);
                }
            } else if metadata.is_file() {
                // 跳过 .txt 描述文件
                if name.ends_with(".txt") {
                    continue;
                }

                let parent_path = current_dir.to_string_lossy().to_string();

                // 搜索值名
                if config.search_value_names && name_for_match.contains(&query) {
                    let txt_path = path.with_extension("txt");
                    let value_type = if txt_path.exists() {
                        fs::read_to_string(&txt_path).ok().and_then(|content| {
                            content.lines().nth(1).map(|line| {
                                if line.starts_with("Type: ") {
                                    line[6..].trim().to_string()
                                } else {
                                    line.trim().to_string()
                                }
                            })
                        })
                    } else {
                        None
                    };

                    let result = RegistrySearchResult {
                        match_type: "value_name".to_string(),
                        path: parent_path.clone(),
                        name: name.clone(),
                        preview: format!("值名: {}", name),
                        value_type,
                    };
                    all_results.push(result.clone());
                    pending_results.push(result);
                }

                // 搜索值数据
                if config.search_value_data {
                    let txt_path = path.with_file_name(format!("{}.txt", name));
                    let mut found_in_data = false;
                    let mut data_preview = String::new();
                    let mut value_type = None;

                    if txt_path.exists() {
                        if let Ok(content) = fs::read_to_string(&txt_path) {
                            let content_for_match = if config.case_sensitive {
                                content.clone()
                            } else {
                                content.to_lowercase()
                            };

                            if content_for_match.contains(&query) {
                                found_in_data = true;

                                for line in content.lines() {
                                    if line.starts_with("Type: ") {
                                        value_type = Some(line[6..].trim().to_string());
                                    }
                                    if line.starts_with("Value: ") {
                                        data_preview = line[7..].chars().take(100).collect();
                                        break;
                                    }
                                }

                                if data_preview.is_empty() {
                                    data_preview = content.chars().take(100).collect();
                                }
                            }
                        }
                    }

                    if !found_in_data {
                        if let Ok(bytes) = fs::read(&path) {
                            if let Some(text) = try_parse_as_text(&bytes) {
                                let text_for_match = if config.case_sensitive {
                                    text.clone()
                                } else {
                                    text.to_lowercase()
                                };

                                if text_for_match.contains(&query) {
                                    found_in_data = true;
                                    data_preview = text.chars().take(100).collect();
                                }
                            }
                        }
                    }

                    if found_in_data {
                        let result = RegistrySearchResult {
                            match_type: "value_data".to_string(),
                            path: parent_path,
                            name: name.clone(),
                            preview: if data_preview.len() > 100 {
                                format!("{}...", &data_preview[..100])
                            } else {
                                data_preview
                            },
                            value_type,
                        };
                        all_results.push(result.clone());
                        pending_results.push(result);
                    }
                }
            }

            // 检查结果数量限制
            if all_results.len() >= config.max_results {
                break;
            }
        }
    }

    // 发送最终进度和剩余结果
    if let Some(sender) = progress_sender {
        send_progress(
            &sender,
            if was_cancelled { "搜索已取消" } else { "" },
            scanned_count,
            all_results.len(),
            pending_results,
            true,
        );
    }

    if was_cancelled {
        debug_info!("⚠️ 搜索已取消，共找到 {} 个结果", all_results.len());
    } else {
        debug_info!("✅ 搜索完成，找到 {} 个结果", all_results.len());
    }
    Ok(all_results)
}

/// 尝试将字节解析为文本
fn try_parse_as_text(bytes: &[u8]) -> Option<String> {
    // 尝试 UTF-8
    if let Ok(text) = String::from_utf8(bytes.to_vec()) {
        if text
            .chars()
            .all(|c| c.is_ascii() && (c.is_ascii_graphic() || c.is_ascii_whitespace()))
        {
            return Some(text.trim_end_matches('\0').to_string());
        }
    }

    // 尝试 UTF-16 LE
    if bytes.len() % 2 == 0 {
        let utf16_chars: Vec<u16> = bytes
            .chunks_exact(2)
            .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
            .take_while(|&c| c != 0)
            .collect();

        if let Ok(text) = String::from_utf16(&utf16_chars) {
            return Some(text);
        }
    }

    None
}
