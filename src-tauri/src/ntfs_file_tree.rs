//! NTFS 时间线文件树恢复模块
//!
//! 从 timeline_ntfs.csv 的 Text 列解析路径，构建可交互的文件目录树，
//! 并将 Action (CRE/MOD/RD) 信息融合到每个节点。

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::File;
use std::io::{BufRead, BufReader};

/// 单个路径的聚合信息
#[derive(Debug, Clone, Default)]
struct PathInfo {
    /// 所有操作时间和类型
    cre_count: u32,
    mod_count: u32,
    rd_count: u32,
    /// 最早创建时间
    first_created: Option<String>,
    /// 最晚修改时间
    last_modified: Option<String>,
    /// 最晚读取时间
    last_read: Option<String>,
    /// 文件大小 (来自 Value32, 取最大非零值)
    size: Option<String>,
    /// MFT 引用 (来自 Value64, 取最后非零值)
    mft_ref: Option<String>,
}

/// 文件树节点
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NtfsFileTreeNode {
    pub name: String,
    pub full_path: String,
    pub is_directory: bool,
    pub size: Option<String>,
    pub mft_ref: Option<String>,
    pub children: Vec<NtfsFileTreeNode>,
    pub cre_count: u32,
    pub mod_count: u32,
    pub rd_count: u32,
    pub first_created: Option<String>,
    pub last_modified: Option<String>,
    pub last_read: Option<String>,
    pub action_count: u32,
    pub is_orphan: bool,
}

/// 文件树统计信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NtfsFileTreeStats {
    pub total_files: u32,
    pub total_directories: u32,
    pub orphan_files: u32,
    pub total_cre: u32,
    pub total_mod: u32,
    pub total_rd: u32,
    pub total_entries: u32,
}

/// 文件树解析结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NtfsFileTreeResult {
    pub roots: Vec<NtfsFileTreeNode>,
    pub stats: NtfsFileTreeStats,
}

/// 解析 CSV 行（复用 file_operations 中的逻辑）
fn parse_csv_line(line: &str, delimiter: char) -> Vec<String> {
    if !line.contains('"') {
        return line
            .split(delimiter)
            .map(|s| s.trim().to_string())
            .collect();
    }

    let mut result = Vec::new();
    let mut current_field = String::new();
    let mut in_quotes = false;
    let mut chars = line.chars().peekable();

    while let Some(c) = chars.next() {
        match c {
            '"' => {
                if in_quotes {
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

    result.push(current_field.trim().to_string());
    result
}

/// 比较两个时间字符串，返回较早/较晚的
fn is_earlier(a: &str, b: &str) -> bool {
    a < b
}

/// 归一化 MemProcFS NTFS 时间线路径。
///
/// timeline_ntfs.csv 的 Text 列格式为 `\<卷号>\真实路径`，卷号可为 `0`/`1`/`2`…
/// （对应不同 NTFS 卷）。MemProcFS 会把每个卷挂载到 `M:\forensic\ntfs\<卷号>\` 下，
/// 因此**卷号必须保留**为路径首段——既用于构建正确的目录树（卷号作为顶层节点），
/// 也用于右键「查看文件内容」时还原挂载读取路径。
///
/// 这里仅去掉前导反斜杠（否则 `split('\\')` 后首段为空，整棵树被塞进一个空名根下——
/// 这是文件树视图渲染异常的根因）。例如：
/// - `\1\Windows\System32\foo` → `1\Windows\System32\foo`
/// - `\1\$_ORPHAN\$54\...`      → `1\$_ORPHAN\$54\...`
fn normalize_ntfs_path(raw: &str) -> &str {
    raw.trim_start_matches('\\')
}

/// 解析 NTFS 时间线 CSV 并构建文件树
#[tauri::command]
pub async fn parse_ntfs_timeline_tree(csv_file_path: String) -> Result<NtfsFileTreeResult, String> {
    debug_info!("[NTFS Tree] 开始解析: {}", csv_file_path);

    // 检查文件是否存在
    if !std::path::Path::new(&csv_file_path).exists() {
        return Err(format!("文件不存在: {}", csv_file_path));
    }

    let file = File::open(&csv_file_path).map_err(|e| format!("无法打开文件: {}", e))?;
    let reader = BufReader::new(file);
    let mut lines = reader.lines();

    // 读取表头
    let header_line = lines
        .next()
        .ok_or("文件为空")?
        .map_err(|e| format!("读取表头失败: {}", e))?;
    let headers = parse_csv_line(header_line.trim(), ',');

    // 查找列索引
    let time_idx = headers.iter().position(|h| h == "Time");
    let action_idx = headers.iter().position(|h| h == "Action");
    let value32_idx = headers.iter().position(|h| h == "Value32");
    let value64_idx = headers.iter().position(|h| h == "Value64");
    let text_idx = headers.iter().position(|h| h == "Text");

    let text_idx = text_idx.ok_or("CSV 中找不到 Text 列")?;

    // 聚合所有路径的信息
    let mut path_map: HashMap<String, PathInfo> = HashMap::new();
    let mut line_count = 0u32;

    for line_result in lines {
        match line_result {
            Ok(line) => {
                if line.trim().is_empty() {
                    continue;
                }

                let values = parse_csv_line(line.trim(), ',');
                if values.len() <= text_idx {
                    continue;
                }

                let raw_path = &values[text_idx];
                // 去掉前导反斜杠，保留卷号作为首段（卷号是 forensic\ntfs\<卷号> 挂载子目录）
                let path = normalize_ntfs_path(raw_path);

                if path.is_empty() {
                    continue;
                }

                let time = time_idx
                    .and_then(|i| values.get(i))
                    .cloned()
                    .unwrap_or_default();
                let action = action_idx
                    .and_then(|i| values.get(i))
                    .cloned()
                    .unwrap_or_default();
                let value32 = value32_idx
                    .and_then(|i| values.get(i))
                    .cloned()
                    .unwrap_or_default();
                let value64 = value64_idx
                    .and_then(|i| values.get(i))
                    .cloned()
                    .unwrap_or_default();

                let info = path_map.entry(path.to_string()).or_default();

                // 聚合 Action
                match action.as_str() {
                    "CRE" => {
                        info.cre_count += 1;
                        match &info.first_created {
                            Some(existing) => {
                                if is_earlier(&time, existing) {
                                    info.first_created = Some(time.clone());
                                }
                            }
                            None => {
                                info.first_created = Some(time.clone());
                            }
                        }
                    }
                    "MOD" => {
                        info.mod_count += 1;
                        match &info.last_modified {
                            Some(existing) => {
                                if !is_earlier(&time, existing) {
                                    info.last_modified = Some(time.clone());
                                }
                            }
                            None => {
                                info.last_modified = Some(time.clone());
                            }
                        }
                    }
                    "RD" => {
                        info.rd_count += 1;
                        match &info.last_read {
                            Some(existing) => {
                                if !is_earlier(&time, existing) {
                                    info.last_read = Some(time.clone());
                                }
                            }
                            None => {
                                info.last_read = Some(time.clone());
                            }
                        }
                    }
                    _ => {}
                }

                // 记录文件大小（取最大非零值）
                if !value32.is_empty() && value32 != "0x0" && value32 != "0" {
                    info.size = Some(value32);
                }

                // 记录 MFT 引用（取最后非零值）
                if !value64.is_empty() && value64 != "0x0" && value64 != "0" {
                    info.mft_ref = Some(value64);
                }

                line_count += 1;
            }
            Err(_) => continue,
        }
    }

    debug_info!(
        "[NTFS Tree] 解析完成: {} 行, {} 个唯一路径",
        line_count,
        path_map.len()
    );

    // 收集所有路径用于判断目录
    let all_paths: Vec<String> = path_map.keys().cloned().collect();

    // 判断哪些路径是目录（如果某路径是其他路径的前缀 + \，则是目录）
    let mut is_dir_set: std::collections::HashSet<String> = std::collections::HashSet::new();
    for path in &all_paths {
        // 拆分路径，将父路径标记为目录
        let parts: Vec<&str> = path.split('\\').collect();
        let mut current = String::new();
        for (i, part) in parts.iter().enumerate() {
            if i > 0 {
                current.push('\\');
            }
            current.push_str(part);
            if i < parts.len() - 1 {
                is_dir_set.insert(current.clone());
            }
        }
    }

    // 构建树形结构
    // 使用嵌套 HashMap 来表示树
    struct TreeBuilder {
        children: HashMap<String, TreeBuilder>,
        is_leaf: bool,
        full_path: String,
    }

    impl TreeBuilder {
        fn new() -> Self {
            TreeBuilder {
                children: HashMap::new(),
                is_leaf: false,
                full_path: String::new(),
            }
        }
    }

    let mut root = TreeBuilder::new();

    for path in &all_paths {
        let parts: Vec<&str> = path.split('\\').collect();
        let mut current = &mut root;
        let mut accumulated_path = String::new();

        for (i, part) in parts.iter().enumerate() {
            if i > 0 {
                accumulated_path.push('\\');
            }
            accumulated_path.push_str(part);

            current = current.children.entry(part.to_string()).or_insert_with(|| {
                let mut tb = TreeBuilder::new();
                tb.full_path = accumulated_path.clone();
                tb
            });

            if i == parts.len() - 1 {
                current.is_leaf = true;
                current.full_path = accumulated_path.clone();
            }
        }
    }

    // 统计信息
    let mut stats = NtfsFileTreeStats {
        total_files: 0,
        total_directories: 0,
        orphan_files: 0,
        total_cre: 0,
        total_mod: 0,
        total_rd: 0,
        total_entries: path_map.len() as u32,
    };

    // 递归转换 TreeBuilder 为 NtfsFileTreeNode
    fn convert_tree(
        builder: &TreeBuilder,
        path_map: &HashMap<String, PathInfo>,
        is_dir_set: &std::collections::HashSet<String>,
        stats: &mut NtfsFileTreeStats,
        parent_is_orphan: bool,
    ) -> Vec<NtfsFileTreeNode> {
        let mut nodes: Vec<NtfsFileTreeNode> = Vec::new();

        for (name, child) in &builder.children {
            let full_path = &child.full_path;
            let is_directory = is_dir_set.contains(full_path) || !child.children.is_empty();
            let is_orphan = parent_is_orphan || name == "$_ORPHAN";

            let info = path_map.get(full_path).cloned().unwrap_or_default();

            let children = if !child.children.is_empty() {
                convert_tree(child, path_map, is_dir_set, stats, is_orphan)
            } else {
                Vec::new()
            };

            let action_count = info.cre_count + info.mod_count + info.rd_count;

            // 更新统计
            if is_directory {
                stats.total_directories += 1;
            } else {
                stats.total_files += 1;
                if is_orphan {
                    stats.orphan_files += 1;
                }
            }
            stats.total_cre += info.cre_count;
            stats.total_mod += info.mod_count;
            stats.total_rd += info.rd_count;

            nodes.push(NtfsFileTreeNode {
                name: name.clone(),
                full_path: full_path.clone(),
                is_directory,
                size: info.size,
                mft_ref: info.mft_ref,
                children,
                cre_count: info.cre_count,
                mod_count: info.mod_count,
                rd_count: info.rd_count,
                first_created: info.first_created,
                last_modified: info.last_modified,
                last_read: info.last_read,
                action_count,
                is_orphan,
            });
        }

        // 排序：目录在前，文件在后，同类按名称排序
        nodes.sort_by(|a, b| match (a.is_directory, b.is_directory) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        });

        nodes
    }

    let roots = convert_tree(&root, &path_map, &is_dir_set, &mut stats, false);

    debug_info!(
        "[NTFS Tree] 构建完成: {} 个文件, {} 个目录, {} 个孤立文件",
        stats.total_files,
        stats.total_directories,
        stats.orphan_files
    );

    Ok(NtfsFileTreeResult { roots, stats })
}

// ============================================================
// 内存文件 (files.csv) 文件树
// ============================================================

/// files.csv 单行信息
#[derive(Debug, Clone, Default)]
struct FilesPathInfo {
    /// 内存对象地址 (Object 列)
    object: Option<String>,
    /// 文件类型 (Type 列)
    file_type: Option<String>,
    /// 签名信息 (SignInfo 列)
    sign_info: Option<String>,
    /// 文件大小 (Size 列)
    size: Option<String>,
    /// 文件名 (File 列)
    file_name: Option<String>,
    /// 该路径下的文件数量
    file_count: u32,
}

/// 解析 files.csv 并构建文件树
#[tauri::command]
pub async fn parse_files_csv_tree(csv_file_path: String) -> Result<NtfsFileTreeResult, String> {
    debug_info!("[Files Tree] 开始解析: {}", csv_file_path);

    if !std::path::Path::new(&csv_file_path).exists() {
        return Err(format!("文件不存在: {}", csv_file_path));
    }

    let file = File::open(&csv_file_path).map_err(|e| format!("无法打开文件: {}", e))?;
    let reader = BufReader::new(file);
    let mut lines = reader.lines();

    // 读取表头: Object,Type,SignInfo,Size,File,Path
    let header_line = lines
        .next()
        .ok_or("文件为空")?
        .map_err(|e| format!("读取表头失败: {}", e))?;
    let headers = parse_csv_line(header_line.trim(), ',');

    let object_idx = headers.iter().position(|h| h == "Object");
    let type_idx = headers.iter().position(|h| h == "Type");
    let sign_idx = headers.iter().position(|h| h == "SignInfo");
    let size_idx = headers.iter().position(|h| h == "Size");
    let file_idx = headers.iter().position(|h| h == "File");
    let path_idx = headers
        .iter()
        .position(|h| h == "Path")
        .ok_or("CSV 中找不到 Path 列")?;

    // 聚合路径信息
    let mut path_map: HashMap<String, FilesPathInfo> = HashMap::new();
    let mut line_count = 0u32;
    let mut type_counts: HashMap<String, u32> = HashMap::new();

    for line_result in lines {
        match line_result {
            Ok(line) => {
                if line.trim().is_empty() {
                    continue;
                }

                let values = parse_csv_line(line.trim(), ',');
                if values.len() <= path_idx {
                    continue;
                }

                let raw_path = &values[path_idx];
                // 去掉开头的 \
                let path = raw_path.trim_start_matches('\\');
                if path.is_empty() {
                    continue;
                }

                let object = object_idx
                    .and_then(|i| values.get(i))
                    .cloned()
                    .unwrap_or_default();
                let file_type = type_idx
                    .and_then(|i| values.get(i))
                    .cloned()
                    .unwrap_or_default();
                let sign_info = sign_idx
                    .and_then(|i| values.get(i))
                    .cloned()
                    .unwrap_or_default();
                let size = size_idx
                    .and_then(|i| values.get(i))
                    .cloned()
                    .unwrap_or_default();
                let file_name = file_idx
                    .and_then(|i| values.get(i))
                    .cloned()
                    .unwrap_or_default();

                // 统计类型
                if !file_type.is_empty() {
                    for t in file_type.split(',') {
                        let t = t.trim();
                        if !t.is_empty() {
                            *type_counts.entry(t.to_string()).or_insert(0) += 1;
                        }
                    }
                }

                let info = path_map.entry(path.to_string()).or_default();
                info.object = if object.is_empty() {
                    None
                } else {
                    Some(object)
                };
                info.file_type = if file_type.is_empty() {
                    None
                } else {
                    Some(file_type)
                };
                info.sign_info = if sign_info.is_empty() {
                    None
                } else {
                    Some(sign_info)
                };
                info.size = if size.is_empty() || size == "0" {
                    None
                } else {
                    Some(size)
                };
                info.file_name = if file_name.is_empty() {
                    None
                } else {
                    Some(file_name)
                };
                info.file_count = 1;

                line_count += 1;
            }
            Err(_) => continue,
        }
    }

    debug_info!(
        "[Files Tree] 解析完成: {} 行, {} 个唯一路径",
        line_count,
        path_map.len()
    );

    // 收集所有路径，判断目录
    let all_paths: Vec<String> = path_map.keys().cloned().collect();
    let mut is_dir_set: std::collections::HashSet<String> = std::collections::HashSet::new();
    for path in &all_paths {
        let parts: Vec<&str> = path.split('\\').collect();
        let mut current = String::new();
        for (i, part) in parts.iter().enumerate() {
            if i > 0 {
                current.push('\\');
            }
            current.push_str(part);
            if i < parts.len() - 1 {
                is_dir_set.insert(current.clone());
            }
        }
    }

    // 构建树
    struct TreeBuilder {
        children: HashMap<String, TreeBuilder>,
        is_leaf: bool,
        full_path: String,
    }

    impl TreeBuilder {
        fn new() -> Self {
            TreeBuilder {
                children: HashMap::new(),
                is_leaf: false,
                full_path: String::new(),
            }
        }
    }

    let mut root = TreeBuilder::new();

    for path in &all_paths {
        let parts: Vec<&str> = path.split('\\').collect();
        let mut current = &mut root;
        let mut accumulated_path = String::new();

        for (i, part) in parts.iter().enumerate() {
            if i > 0 {
                accumulated_path.push('\\');
            }
            accumulated_path.push_str(part);

            current = current.children.entry(part.to_string()).or_insert_with(|| {
                let mut tb = TreeBuilder::new();
                tb.full_path = accumulated_path.clone();
                tb
            });

            if i == parts.len() - 1 {
                current.is_leaf = true;
                current.full_path = accumulated_path.clone();
            }
        }
    }

    let mut stats = NtfsFileTreeStats {
        total_files: 0,
        total_directories: 0,
        orphan_files: 0,
        total_cre: 0, // Data 类型数量
        total_mod: 0, // Image 类型数量
        total_rd: 0,  // 其他类型数量
        total_entries: path_map.len() as u32,
    };

    // 将类型统计映射到 stats
    stats.total_cre = *type_counts.get("Data").unwrap_or(&0);
    stats.total_mod = *type_counts.get("Image").unwrap_or(&0);

    fn convert_files_tree(
        builder: &TreeBuilder,
        path_map: &HashMap<String, FilesPathInfo>,
        is_dir_set: &std::collections::HashSet<String>,
        stats: &mut NtfsFileTreeStats,
    ) -> Vec<NtfsFileTreeNode> {
        let mut nodes: Vec<NtfsFileTreeNode> = Vec::new();

        for (name, child) in &builder.children {
            let full_path = &child.full_path;
            let is_directory = is_dir_set.contains(full_path) || !child.children.is_empty();

            let info = path_map.get(full_path);

            let children = if !child.children.is_empty() {
                convert_files_tree(child, path_map, is_dir_set, stats)
            } else {
                Vec::new()
            };

            // 统计目录下的文件数量
            let child_file_count = if is_directory {
                children
                    .iter()
                    .map(|c| if c.is_directory { c.action_count } else { 1 })
                    .sum::<u32>()
            } else {
                0
            };

            if is_directory {
                stats.total_directories += 1;
            } else {
                stats.total_files += 1;
            }

            // 将 files.csv 的字段映射到 NtfsFileTreeNode:
            // - mft_ref -> Object 地址
            // - size -> 文件大小 (bytes)
            // - first_created -> Type 类型字符串 (用于前端显示 badge)
            // - last_modified -> SignInfo
            // - cre_count -> 是否包含 Data 类型 (1=是, 0=否)
            // - mod_count -> 是否包含 Image 类型 (1=是, 0=否)
            // - action_count -> 目录下的文件数 或 1
            let (object, file_type, sign_info, size, cre, modv) = match info {
                Some(fi) => {
                    let ft = fi.file_type.clone().unwrap_or_default();
                    let has_data = if ft.contains("Data") { 1u32 } else { 0 };
                    let has_image = if ft.contains("Image") { 1u32 } else { 0 };
                    (
                        fi.object.clone(),
                        fi.file_type.clone(),
                        fi.sign_info.clone(),
                        fi.size.clone(),
                        has_data,
                        has_image,
                    )
                }
                None => (None, None, None, None, 0, 0),
            };

            nodes.push(NtfsFileTreeNode {
                name: name.clone(),
                full_path: full_path.clone(),
                is_directory,
                size,
                mft_ref: object,
                children,
                cre_count: cre,
                mod_count: modv,
                rd_count: 0,
                first_created: file_type, // 存储 Type 字符串
                last_modified: sign_info, // 存储 SignInfo
                last_read: None,
                action_count: if is_directory { child_file_count } else { 1 },
                is_orphan: false,
            });
        }

        nodes.sort_by(|a, b| match (a.is_directory, b.is_directory) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        });

        nodes
    }

    let roots = convert_files_tree(&root, &path_map, &is_dir_set, &mut stats);

    debug_info!(
        "[Files Tree] 构建完成: {} 个文件, {} 个目录",
        stats.total_files,
        stats.total_directories
    );

    Ok(NtfsFileTreeResult { roots, stats })
}
