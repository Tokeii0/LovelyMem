//! 资源信息解析模块

use super::types::{ResourceInfo, ResourceTypeInfo, VersionInfo};
use goblin::pe::PE;

/// 资源类型ID常量
const RT_CURSOR: u32 = 1;
const RT_BITMAP: u32 = 2;
const RT_ICON: u32 = 3;
const RT_MENU: u32 = 4;
const RT_DIALOG: u32 = 5;
const RT_STRING: u32 = 6;
const RT_FONTDIR: u32 = 7;
const RT_FONT: u32 = 8;
const RT_ACCELERATOR: u32 = 9;
const RT_RCDATA: u32 = 10;
const RT_MESSAGETABLE: u32 = 11;
const RT_GROUP_CURSOR: u32 = 12;
const RT_GROUP_ICON: u32 = 14;
const RT_VERSION: u32 = 16;
const RT_DLGINCLUDE: u32 = 17;
const RT_PLUGPLAY: u32 = 19;
const RT_VXD: u32 = 20;
const RT_ANICURSOR: u32 = 21;
const RT_ANIICON: u32 = 22;
const RT_HTML: u32 = 23;
const RT_MANIFEST: u32 = 24;

/// 获取资源类型名称
fn get_resource_type_name(type_id: u32) -> &'static str {
    match type_id {
        RT_CURSOR => "Cursor",
        RT_BITMAP => "Bitmap",
        RT_ICON => "Icon",
        RT_MENU => "Menu",
        RT_DIALOG => "Dialog",
        RT_STRING => "String Table",
        RT_FONTDIR => "Font Directory",
        RT_FONT => "Font",
        RT_ACCELERATOR => "Accelerator",
        RT_RCDATA => "RC Data",
        RT_MESSAGETABLE => "Message Table",
        RT_GROUP_CURSOR => "Cursor Group",
        RT_GROUP_ICON => "Icon Group",
        RT_VERSION => "Version Info",
        RT_DLGINCLUDE => "Dialog Include",
        RT_PLUGPLAY => "Plug and Play",
        RT_VXD => "VXD",
        RT_ANICURSOR => "Animated Cursor",
        RT_ANIICON => "Animated Icon",
        RT_HTML => "HTML",
        RT_MANIFEST => "Manifest",
        _ => "Unknown",
    }
}

/// 解析资源信息
pub fn parse_resources(pe: &PE, file_data: &[u8]) -> ResourceInfo {
    let mut info = ResourceInfo::default();

    // 检查资源数据目录
    if let Some(optional_header) = pe.header.optional_header {
        let data_dirs = &optional_header.data_directories;

        // 资源表是索引 2
        if let Some(Some((_, resource_dir))) = data_dirs.data_directories.get(2) {
            if resource_dir.virtual_address == 0 || resource_dir.size == 0 {
                return info;
            }

            // 尝试从节中找到资源数据
            for section in &pe.sections {
                let section_va = section.virtual_address;
                let section_raw = section.pointer_to_raw_data;
                let section_size = section.size_of_raw_data;

                // 检查资源目录是否在这个节中
                if resource_dir.virtual_address >= section_va
                    && resource_dir.virtual_address < section_va + section_size
                {
                    let resource_offset = section_raw + (resource_dir.virtual_address - section_va);
                    let resource_size = resource_dir
                        .size
                        .min(section_size - (resource_dir.virtual_address - section_va));

                    if resource_offset as usize + resource_size as usize <= file_data.len() {
                        let resource_data = &file_data
                            [resource_offset as usize..(resource_offset + resource_size) as usize];
                        parse_resource_directory(
                            resource_data,
                            section_va,
                            resource_dir.virtual_address,
                            &mut info,
                            file_data,
                            section_raw,
                        );
                    }
                    break;
                }
            }
        }
    }

    info
}

/// 解析资源目录
fn parse_resource_directory(
    resource_data: &[u8],
    section_va: u32,
    resource_va: u32,
    info: &mut ResourceInfo,
    file_data: &[u8],
    section_raw: u32,
) {
    if resource_data.len() < 16 {
        return;
    }

    // 读取 IMAGE_RESOURCE_DIRECTORY
    let num_named_entries = u16::from_le_bytes([resource_data[12], resource_data[13]]) as usize;
    let num_id_entries = u16::from_le_bytes([resource_data[14], resource_data[15]]) as usize;
    let total_entries = num_named_entries + num_id_entries;

    let mut offset = 16; // 跳过目录头
    let mut resource_counts: std::collections::HashMap<u32, usize> =
        std::collections::HashMap::new();

    for _ in 0..total_entries {
        if offset + 8 > resource_data.len() {
            break;
        }

        let type_id = u32::from_le_bytes([
            resource_data[offset],
            resource_data[offset + 1],
            resource_data[offset + 2],
            resource_data[offset + 3],
        ]);

        let data_offset = u32::from_le_bytes([
            resource_data[offset + 4],
            resource_data[offset + 5],
            resource_data[offset + 6],
            resource_data[offset + 7],
        ]);

        // 如果高位被设置，这是一个子目录
        let is_directory = (data_offset & 0x80000000) != 0;
        let actual_offset = (data_offset & 0x7FFFFFFF) as usize;

        // 只处理 ID 类型的资源（不是命名资源）
        if (type_id & 0x80000000) == 0 {
            // 计数
            *resource_counts.entry(type_id).or_insert(0) += 1;

            // 检查特定资源类型
            match type_id {
                RT_VERSION if is_directory && actual_offset < resource_data.len() => {
                    // 尝试解析版本信息
                    if let Some(version) = parse_version_resource(
                        resource_data,
                        actual_offset,
                        section_va,
                        resource_va,
                        file_data,
                        section_raw,
                    ) {
                        info.version_info = Some(version);
                    }
                }
                RT_MANIFEST => {
                    info.has_manifest = true;
                    // 尝试提取清单内容
                    if is_directory && actual_offset < resource_data.len() {
                        if let Some(manifest) = extract_manifest(
                            resource_data,
                            actual_offset,
                            section_va,
                            resource_va,
                            file_data,
                            section_raw,
                        ) {
                            info.manifest_content = Some(manifest);
                        }
                    }
                }
                RT_ICON | RT_GROUP_ICON => {
                    info.has_icon = true;
                }
                _ => {}
            }
        }

        offset += 8;
        info.total_resources += 1;
    }

    // 构建资源类型信息
    for (type_id, count) in resource_counts {
        info.resource_types.push(ResourceTypeInfo {
            type_name: get_resource_type_name(type_id).to_string(),
            type_id,
            count,
        });
    }

    // 按类型名称排序
    info.resource_types
        .sort_by(|a, b| a.type_name.cmp(&b.type_name));
}

/// 解析版本资源
fn parse_version_resource(
    resource_data: &[u8],
    _dir_offset: usize,
    _section_va: u32,
    _resource_va: u32,
    _file_data: &[u8],
    _section_raw: u32,
) -> Option<VersionInfo> {
    // 这是一个简化的版本信息解析
    // 完整解析需要遍历多层资源目录结构

    // 尝试在资源数据中搜索版本字符串
    let mut version = VersionInfo::default();

    // 搜索常见的版本字符串标记
    let search_area = if resource_data.len() > 10000 {
        &resource_data[..10000]
    } else {
        resource_data
    };

    // 搜索 VS_VERSION_INFO 签名
    let vs_version_info = b"V\0S\0_\0V\0E\0R\0S\0I\0O\0N\0_\0I\0N\0F\0O\0";
    if let Some(pos) = find_bytes(search_area, vs_version_info) {
        // 找到版本信息块，尝试解析字符串
        let remaining = &search_area[pos..];

        // 提取各种字符串字段
        version.file_description = extract_version_string(remaining, "FileDescription");
        version.file_version = extract_version_string(remaining, "FileVersion");
        version.product_version = extract_version_string(remaining, "ProductVersion");
        version.product_name = extract_version_string(remaining, "ProductName");
        version.company_name = extract_version_string(remaining, "CompanyName");
        version.legal_copyright = extract_version_string(remaining, "LegalCopyright");
        version.original_filename = extract_version_string(remaining, "OriginalFilename");
        version.internal_name = extract_version_string(remaining, "InternalName");
        version.comments = extract_version_string(remaining, "Comments");
        version.legal_trademarks = extract_version_string(remaining, "LegalTrademarks");
        version.private_build = extract_version_string(remaining, "PrivateBuild");
        version.special_build = extract_version_string(remaining, "SpecialBuild");

        return Some(version);
    }

    None
}

/// 提取清单内容
fn extract_manifest(
    resource_data: &[u8],
    _dir_offset: usize,
    _section_va: u32,
    _resource_va: u32,
    _file_data: &[u8],
    _section_raw: u32,
) -> Option<String> {
    // 简化处理：在资源数据中搜索 XML 内容
    let search_area = if resource_data.len() > 50000 {
        &resource_data[..50000]
    } else {
        resource_data
    };

    // 搜索 XML 声明或 assembly 标签
    let xml_markers = [
        b"<?xml".as_slice(),
        b"<assembly".as_slice(),
        b"<Assembly".as_slice(),
    ];

    for marker in xml_markers {
        if let Some(start) = find_bytes(search_area, marker) {
            // 找到 XML 开始，尝试找到结束
            let remaining = &search_area[start..];

            // 搜索 </assembly> 结束标签
            if let Some(end) = find_bytes(remaining, b"</assembly>") {
                let xml_content = &remaining[..end + 11];
                // 清理并返回
                let manifest = String::from_utf8_lossy(xml_content)
                    .replace('\0', "")
                    .trim()
                    .to_string();
                if manifest.len() > 50 && manifest.contains("assembly") {
                    return Some(manifest);
                }
            }
        }
    }

    None
}

/// 在字节数组中查找模式
fn find_bytes(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() || haystack.len() < needle.len() {
        return None;
    }

    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

/// 提取版本字符串值
fn extract_version_string(data: &[u8], key: &str) -> String {
    // 构建 Unicode 格式的键名
    let key_unicode: Vec<u8> = key.encode_utf16().flat_map(|c| c.to_le_bytes()).collect();

    if let Some(pos) = find_bytes(data, &key_unicode) {
        // 跳过键名，查找值
        let after_key = pos + key_unicode.len();
        if after_key + 10 < data.len() {
            // 跳过一些填充字节，找到值的开始
            let search_start = after_key;
            let search_end = (after_key + 500).min(data.len());
            let value_area = &data[search_start..search_end];

            // 查找非空的 Unicode 字符串
            let mut value = String::new();
            let mut i = 0;
            let mut found_start = false;

            while i + 1 < value_area.len() {
                let c = u16::from_le_bytes([value_area[i], value_area[i + 1]]);

                if c == 0 {
                    if found_start && !value.is_empty() {
                        break;
                    }
                } else if c >= 0x20 && c < 0xFFFE {
                    found_start = true;
                    if let Some(ch) = char::from_u32(c as u32) {
                        value.push(ch);
                    }
                }

                i += 2;

                // 限制长度
                if value.len() > 200 {
                    break;
                }
            }

            // 清理值
            let cleaned = value.trim().to_string();
            if cleaned.len() > 2 && !cleaned.contains('\u{FFFD}') {
                return cleaned;
            }
        }
    }

    String::new()
}
