use byteorder::{LittleEndian, ReadBytesExt};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::File;
use std::io::{self, Read, Seek, SeekFrom};
use std::path::Path;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RegistryKey {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_modified: Option<String>,
    pub values: HashMap<String, RegistryValue>,
    pub subkeys: HashMap<String, RegistryKey>,
}

impl RegistryKey {
    fn empty(name: String) -> Self {
        RegistryKey {
            name,
            last_modified: None,
            values: HashMap::new(),
            subkeys: HashMap::new(),
        }
    }
}

/// Convert Windows FILETIME (100-nanosecond intervals since 1601-01-01) to readable string
fn filetime_to_string(filetime: u64) -> Option<String> {
    if filetime == 0 {
        return None;
    }
    // Windows FILETIME epoch: 1601-01-01, Unix epoch: 1970-01-01
    // Difference: 11644473600 seconds
    let secs_since_1601 = filetime / 10_000_000;
    let unix_secs = secs_since_1601.checked_sub(11644473600)?;
    let remaining_100ns = filetime % 10_000_000;
    let millis = remaining_100ns / 10_000;

    // Convert to date components
    let total_days = (unix_secs / 86400) as i64;
    let time_of_day = (unix_secs % 86400) as u32;
    let hours = time_of_day / 3600;
    let minutes = (time_of_day % 3600) / 60;
    let seconds = time_of_day % 60;

    // Days since 1970-01-01 to Y-M-D
    let (year, month, day) = days_to_ymd(total_days);

    Some(format!(
        "{:04}-{:02}-{:02} {:02}:{:02}:{:02}.{:03}",
        year, month, day, hours, minutes, seconds, millis
    ))
}

/// Convert days since 1970-01-01 to (year, month, day)
fn days_to_ymd(mut days: i64) -> (i64, u32, u32) {
    // Shift epoch to 0000-03-01 for easier leap year calculation
    days += 719468;
    let era = if days >= 0 { days } else { days - 146096 } / 146097;
    let doe = (days - era * 146097) as u32;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
}

/// Decode UTF-16LE bytes to String
fn decode_utf16le(bytes: &[u8]) -> String {
    let mut utf16_chars = Vec::new();
    for chunk in bytes.chunks_exact(2) {
        let ch = u16::from_le_bytes([chunk[0], chunk[1]]);
        if ch == 0 {
            break;
        }
        utf16_chars.push(ch);
    }
    String::from_utf16_lossy(&utf16_chars)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RegistryValue {
    pub value_type: String,
    pub data: String,
}

#[derive(Debug)]
#[allow(dead_code)]
struct RegfHeader {
    signature: [u8; 4],
    primary_sequence_number: u32,
    secondary_sequence_number: u32,
    last_written_timestamp: u64,
    major_version: u32,
    minor_version: u32,
    file_type: u32,
    file_format: u32,
    root_key_offset: u32,
    hive_bins_data_size: u32,
    clustering_factor: u32,
    filename: [u8; 64],
}

/// 解析注册表hive文件
pub fn parse_registry_file(file_path: &str) -> Result<RegistryKey, String> {
    // 验证文件存在
    if !Path::new(file_path).exists() {
        return Err(format!("注册表文件不存在: {}", file_path));
    }

    // 验证文件扩展名
    let path = Path::new(file_path);
    if let Some(extension) = path.extension() {
        let ext = extension.to_string_lossy().to_lowercase();
        if ext != "reghive" && ext != "hive" && ext != "dat" && ext != "raw" {
            return Err(format!("不支持的文件类型: .{}", ext));
        }
    }

    //debug_info!("📁 文件验证通过，开始解析...");

    match parse_regf_file(file_path, true) {
        // 启用详细输出
        Ok(registry) => {
            debug_info!("✅ 注册表文件解析成功");
            Ok(registry)
        }
        Err(e) => {
            debug_info!("❌ 解析失败: {}", e);
            Err(format!("解析注册表文件失败: {}", e))
        }
    }
}

fn parse_regf_file(file_path: &str, verbose: bool) -> io::Result<RegistryKey> {
    let mut file = File::open(file_path)?;

    if verbose {
        debug_info!("📖 读取文件: {}", file_path);
    }

    // Read and validate REGF header
    let header = read_regf_header(&mut file)?;

    if verbose {
        debug_info!("✅ REGF头部验证成功");
        debug_info!(
            "主版本: {}, 次版本: {}",
            header.major_version,
            header.minor_version
        );
        debug_info!("根键偏移: 0x{:x}", header.root_key_offset);
        debug_info!("Hive数据大小: {} 字节", header.hive_bins_data_size);
    }

    // Skip to hive bins data (after 4KB header)
    file.seek(SeekFrom::Start(4096))?;

    // Parse the root key
    let root_key = if header.root_key_offset > 0 {
        parse_key_node(
            &mut file,
            (header.root_key_offset + 4096) as u64,
            "ROOT".to_string(),
            verbose,
        )?
    } else {
        RegistryKey {
            name: "ROOT".to_string(),
            last_modified: None,
            values: HashMap::new(),
            subkeys: HashMap::new(),
        }
    };

    if verbose {
        debug_info!("✅ 注册表解析完成");
    }

    Ok(root_key)
}

fn read_regf_header(file: &mut File) -> io::Result<RegfHeader> {
    let mut signature = [0u8; 4];
    file.read_exact(&mut signature)?;

    // Validate REGF signature
    if &signature != b"regf" {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "无效的REGF签名"));
    }

    let primary_sequence_number = file.read_u32::<LittleEndian>()?;
    let secondary_sequence_number = file.read_u32::<LittleEndian>()?;
    let last_written_timestamp = file.read_u64::<LittleEndian>()?;
    let major_version = file.read_u32::<LittleEndian>()?;
    let minor_version = file.read_u32::<LittleEndian>()?;
    let file_type = file.read_u32::<LittleEndian>()?;
    let file_format = file.read_u32::<LittleEndian>()?;
    let root_key_offset = file.read_u32::<LittleEndian>()?;
    let hive_bins_data_size = file.read_u32::<LittleEndian>()?;
    let clustering_factor = file.read_u32::<LittleEndian>()?;

    let mut filename = [0u8; 64];
    file.read_exact(&mut filename)?;

    Ok(RegfHeader {
        signature,
        primary_sequence_number,
        secondary_sequence_number,
        last_written_timestamp,
        major_version,
        minor_version,
        file_type,
        file_format,
        root_key_offset,
        hive_bins_data_size,
        clustering_factor,
        filename,
    })
}

fn parse_key_node(
    file: &mut File,
    offset: u64,
    key_name: String,
    verbose: bool,
) -> io::Result<RegistryKey> {
    file.seek(SeekFrom::Start(offset))?;

    // Read cell header
    let cell_size = file.read_i32::<LittleEndian>()?;
    if cell_size >= 0 {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "无效的单元格大小（应为负数）",
        ));
    }

    let mut signature = [0u8; 2];
    file.read_exact(&mut signature)?;

    if &signature != b"nk" {
        // 静默处理非键节点，避免循环警告
        return Ok(RegistryKey::empty(key_name));
    }

    // Read key node structure
    let flags = file.read_u16::<LittleEndian>()?;
    let last_written_ts = file.read_u64::<LittleEndian>()?;
    let _spare = file.read_u32::<LittleEndian>()?;
    let _parent_key_offset = file.read_u32::<LittleEndian>()?;
    let number_of_subkeys = file.read_u32::<LittleEndian>()?;
    let _number_of_volatile_subkeys = file.read_u32::<LittleEndian>()?;
    let subkeys_list_offset = file.read_u32::<LittleEndian>()?;
    let _volatile_subkeys_list_offset = file.read_u32::<LittleEndian>()?;
    let number_of_key_values = file.read_u32::<LittleEndian>()?;
    let key_values_list_offset = file.read_u32::<LittleEndian>()?;
    let _key_security_offset = file.read_u32::<LittleEndian>()?;
    let _class_name_offset = file.read_u32::<LittleEndian>()?;

    // Skip remaining fields
    file.seek(SeekFrom::Current(20))?; // Skip to key name length
    let key_name_length = file.read_u16::<LittleEndian>()?;
    let _class_name_length = file.read_u16::<LittleEndian>()?;

    // Read key name: KEY_COMP_NAME (0x0020) means ASCII compressed name
    let is_compressed_name = flags & 0x0020 != 0;
    let actual_key_name = if key_name_length > 0 {
        let mut name_bytes = vec![0u8; key_name_length as usize];
        file.read_exact(&mut name_bytes)?;
        if is_compressed_name {
            // ASCII compressed name
            String::from_utf8_lossy(&name_bytes).to_string()
        } else {
            // UTF-16LE name
            decode_utf16le(&name_bytes)
        }
    } else {
        key_name
    };

    let mut registry_key = RegistryKey {
        name: actual_key_name,
        last_modified: filetime_to_string(last_written_ts),
        values: HashMap::new(),
        subkeys: HashMap::new(),
    };

    // Parse values if present
    if number_of_key_values > 0 && key_values_list_offset > 0 {
        if let Ok(values) = parse_key_values(
            file,
            key_values_list_offset.saturating_add(4096) as u64,
            number_of_key_values,
            verbose,
        ) {
            registry_key.values = values;
        }
    }

    // Parse subkeys if present (limited to prevent deep recursion)
    if number_of_subkeys > 0 && subkeys_list_offset > 0 && number_of_subkeys <= 50000 {
        if let Ok(subkeys) = parse_subkeys_list(
            file,
            subkeys_list_offset.saturating_add(4096) as u64,
            number_of_subkeys,
            verbose,
        ) {
            registry_key.subkeys = subkeys;
        }
    }

    Ok(registry_key)
}

fn parse_key_values(
    file: &mut File,
    offset: u64,
    count: u32,
    verbose: bool,
) -> io::Result<HashMap<String, RegistryValue>> {
    let mut values = HashMap::new();

    // if verbose && count > 0 {
    //     debug_info!("📝 开始解析 {} 个值...", count);
    // }

    file.seek(SeekFrom::Start(offset))?;
    let _cell_size = file.read_i32::<LittleEndian>()?;

    // 批量读取值偏移量
    let count_to_read = count.min(10000);
    let mut value_offsets = Vec::with_capacity(count_to_read as usize);

    for _i in 0..count_to_read {
        let value_offset = file.read_u32::<LittleEndian>()?;
        if value_offset > 0 {
            value_offsets.push(value_offset);
        }
    }

    // 解析每个值
    for (i, value_offset) in value_offsets.iter().enumerate() {
        if verbose && i % 100 == 0 && i > 0 {
            debug_info!("📊 已解析 {}/{} 个值", i, value_offsets.len());
        }

        if let Ok((name, value)) =
            parse_value_entry(file, value_offset.saturating_add(4096) as u64, verbose)
        {
            values.insert(name, value);
        }
    }

    Ok(values)
}

fn parse_value_entry(
    file: &mut File,
    offset: u64,
    verbose: bool,
) -> io::Result<(String, RegistryValue)> {
    file.seek(SeekFrom::Start(offset))?;

    let _cell_size = file.read_i32::<LittleEndian>()?;
    let mut signature = [0u8; 2];
    file.read_exact(&mut signature)?;

    if &signature != b"vk" {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "无效的值签名"));
    }

    let name_length = file.read_u16::<LittleEndian>()?;
    let data_size = file.read_u32::<LittleEndian>()?;
    let data_offset = file.read_u32::<LittleEndian>()?;
    let data_type = file.read_u32::<LittleEndian>()?;
    let _flags = file.read_u16::<LittleEndian>()?;
    let _spare = file.read_u16::<LittleEndian>()?;

    // Read value name
    let name = if name_length > 0 {
        let mut name_bytes = vec![0u8; name_length as usize];
        file.read_exact(&mut name_bytes)?;
        String::from_utf8_lossy(&name_bytes).to_string()
    } else {
        "(Default)".to_string()
    };

    let value_type = match data_type {
        0 => "REG_NONE",
        1 => "REG_SZ",
        2 => "REG_EXPAND_SZ",
        3 => "REG_BINARY",
        4 => "REG_DWORD",
        5 => "REG_DWORD_BIG_ENDIAN",
        6 => "REG_LINK",
        7 => "REG_MULTI_SZ",
        8 => "REG_RESOURCE_LIST",
        9 => "REG_FULL_RESOURCE_DESCRIPTOR",
        10 => "REG_RESOURCE_REQUIREMENTS_LIST",
        11 => "REG_QWORD",
        _ => "REG_UNKNOWN",
    }
    .to_string();

    // Parse actual data content
    // Bit 31 of data_size indicates inline data (stored in data_offset field)
    let is_inline = data_size & 0x80000000 != 0;
    let actual_data_size = if is_inline {
        data_size & 0x7FFFFFFF
    } else {
        data_size
    };

    let data = if actual_data_size == 0 {
        "(empty)".to_string()
    } else if is_inline {
        // Data is stored inline in the data_offset field
        let bytes = data_offset.to_le_bytes();
        let inline_len = (actual_data_size as usize).min(4);
        match data_type {
            4 => {
                // REG_DWORD
                let value = if inline_len >= 4 {
                    u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]])
                } else {
                    data_offset
                };
                format!("{} (0x{:08x})", value, value)
            }
            1 | 2 => {
                // REG_SZ, REG_EXPAND_SZ
                // Try UTF-16LE first (2 bytes per char)
                if inline_len >= 2 {
                    let mut utf16_chars = Vec::new();
                    for chunk in bytes[..inline_len].chunks_exact(2) {
                        let ch = u16::from_le_bytes([chunk[0], chunk[1]]);
                        if ch == 0 {
                            break;
                        }
                        utf16_chars.push(ch);
                    }
                    if !utf16_chars.is_empty() {
                        String::from_utf16_lossy(&utf16_chars)
                    } else {
                        let mut end_pos = inline_len;
                        for i in 0..inline_len {
                            if bytes[i] == 0 {
                                end_pos = i;
                                break;
                            }
                        }
                        String::from_utf8_lossy(&bytes[..end_pos]).to_string()
                    }
                } else {
                    String::from_utf8_lossy(&bytes[..inline_len]).to_string()
                }
            }
            11 => {
                // REG_QWORD (inline, though rare)
                let value = data_offset as u64;
                format!("{} (0x{:016x})", value, value)
            }
            _ => bytes[..inline_len]
                .iter()
                .map(|b| format!("{:02x}", b))
                .collect::<Vec<_>>()
                .join(" "),
        }
    } else {
        // Large data is stored at the specified offset
        if data_offset > 0 {
            let current_pos = file.stream_position()?;
            match file.seek(SeekFrom::Start(data_offset.saturating_add(4096) as u64)) {
                Ok(_) => {
                    let actual_data =
                        read_registry_data(file, actual_data_size, data_type, verbose);
                    file.seek(SeekFrom::Start(current_pos)).ok();
                    actual_data.unwrap_or_else(|_| format!("<{} bytes>", actual_data_size))
                }
                Err(_) => format!("<{} bytes>", actual_data_size),
            }
        } else {
            format!("<{} bytes>", actual_data_size)
        }
    };

    Ok((name, RegistryValue { value_type, data }))
}

fn read_registry_data(
    file: &mut File,
    data_size: u32,
    data_type: u32,
    _verbose: bool,
) -> io::Result<String> {
    let size_to_read = data_size.min(16384); // Read up to 16KB
    let mut data_bytes = vec![0u8; size_to_read as usize];

    // Skip cell size
    let _cell_size = file.read_i32::<LittleEndian>()?;

    file.read_exact(&mut data_bytes)?;

    let result = match data_type {
        1 | 2 | 6 => {
            // REG_SZ, REG_EXPAND_SZ, REG_LINK (UTF-16 strings)
            if data_bytes.len() >= 2 {
                let mut utf16_chars = Vec::new();
                for chunk in data_bytes.chunks_exact(2) {
                    let char_code = u16::from_le_bytes([chunk[0], chunk[1]]);
                    if char_code == 0 {
                        break;
                    }
                    utf16_chars.push(char_code);
                }
                String::from_utf16_lossy(&utf16_chars)
            } else {
                String::from_utf8_lossy(&data_bytes).to_string()
            }
        }
        3 | 8 | 9 | 10 => {
            // REG_BINARY, REG_RESOURCE_LIST, etc.
            if data_size <= 256 {
                // Show hex for binary data up to 256 bytes
                data_bytes
                    .iter()
                    .map(|b| format!("{:02x}", b))
                    .collect::<Vec<_>>()
                    .join(" ")
            } else {
                // Show first 64 bytes as hex preview
                let preview: String = data_bytes[..64.min(data_bytes.len())]
                    .iter()
                    .map(|b| format!("{:02x}", b))
                    .collect::<Vec<_>>()
                    .join(" ");
                format!("{}... ({} bytes total)", preview, data_size)
            }
        }
        4 => {
            // REG_DWORD
            if data_bytes.len() >= 4 {
                let value = u32::from_le_bytes([
                    data_bytes[0],
                    data_bytes[1],
                    data_bytes[2],
                    data_bytes[3],
                ]);
                format!("{} (0x{:08x})", value, value)
            } else {
                "<invalid DWORD>".to_string()
            }
        }
        5 => {
            // REG_DWORD_BIG_ENDIAN
            if data_bytes.len() >= 4 {
                let value = u32::from_be_bytes([
                    data_bytes[0],
                    data_bytes[1],
                    data_bytes[2],
                    data_bytes[3],
                ]);
                format!("{} (0x{:08x})", value, value)
            } else {
                "<invalid DWORD_BE>".to_string()
            }
        }
        7 => {
            // REG_MULTI_SZ
            if data_bytes.len() >= 2 {
                let mut strings = Vec::new();
                let mut current_string = Vec::new();

                for chunk in data_bytes.chunks_exact(2) {
                    let char_code = u16::from_le_bytes([chunk[0], chunk[1]]);
                    if char_code == 0 {
                        if !current_string.is_empty() {
                            strings.push(String::from_utf16_lossy(&current_string));
                            current_string.clear();
                        }
                    } else {
                        current_string.push(char_code);
                    }
                }

                if strings.is_empty() {
                    "(empty multi-string)".to_string()
                } else {
                    format!("[{}]", strings.join(", "))
                }
            } else {
                "(invalid multi-string)".to_string()
            }
        }
        11 => {
            // REG_QWORD
            if data_bytes.len() >= 8 {
                let value = u64::from_le_bytes([
                    data_bytes[0],
                    data_bytes[1],
                    data_bytes[2],
                    data_bytes[3],
                    data_bytes[4],
                    data_bytes[5],
                    data_bytes[6],
                    data_bytes[7],
                ]);
                format!("{} (0x{:016x})", value, value)
            } else {
                "<invalid QWORD>".to_string()
            }
        }
        0 => {
            // REG_NONE
            if data_size == 0 {
                "(none)".to_string()
            } else {
                data_bytes
                    .iter()
                    .map(|b| format!("{:02x}", b))
                    .collect::<Vec<_>>()
                    .join(" ")
            }
        }
        _ => {
            if data_size <= 256 {
                data_bytes
                    .iter()
                    .map(|b| format!("{:02x}", b))
                    .collect::<Vec<_>>()
                    .join(" ")
            } else {
                format!("<type {} data: {} bytes>", data_type, data_size)
            }
        }
    };

    Ok(result)
}

fn parse_subkeys_list(
    file: &mut File,
    offset: u64,
    count: u32,
    verbose: bool,
) -> io::Result<HashMap<String, RegistryKey>> {
    let mut subkeys = HashMap::new();

    // if verbose && count > 0 {
    //     debug_info!("🗂️ 开始解析 {} 个子键...", count);
    // }

    file.seek(SeekFrom::Start(offset))?;
    let _cell_size = file.read_i32::<LittleEndian>()?;
    let mut signature = [0u8; 2];
    file.read_exact(&mut signature)?;

    // Handle different list types (lf, lh, ri, li)
    if &signature == b"lf" || &signature == b"lh" || &signature == b"li" {
        let _number_of_elements = file.read_u16::<LittleEndian>()?;

        // 批量读取子键偏移量
        let count_to_read = count.min(50000);
        let mut key_offsets = Vec::with_capacity(count_to_read as usize);

        for _i in 0..count_to_read {
            let key_offset = file.read_u32::<LittleEndian>()?;
            if &signature == b"lf" || &signature == b"lh" {
                let _hash = file.read_u32::<LittleEndian>()?;
            }

            if key_offset > 0 {
                key_offsets.push(key_offset);
            }
        }

        // 解析每个子键
        let _total_keys = key_offsets.len();
        for (i, key_offset) in key_offsets.into_iter().enumerate() {
            // 首先获取真实的键名
            if let Ok(real_key_name) =
                get_key_name_only(file, key_offset.saturating_add(4096) as u64)
            {
                if let Ok(subkey) = parse_key_node(
                    file,
                    key_offset.saturating_add(4096) as u64,
                    real_key_name.clone(),
                    verbose,
                ) {
                    subkeys.insert(real_key_name, subkey);
                }
            } else {
                // 如果无法获取真实键名，使用备用名称
                if let Ok(subkey) = parse_key_node(
                    file,
                    key_offset.saturating_add(4096) as u64,
                    format!("Subkey_{}", i),
                    verbose,
                ) {
                    subkeys.insert(subkey.name.clone(), subkey);
                }
            }
        }
    } else if &signature == b"ri" {
        // 处理间接列表 - 使用实际元素数量而非外部传入的count
        let number_of_elements = file.read_u16::<LittleEndian>()?;

        for _i in 0..(number_of_elements as u32).min(1000) {
            let list_offset = file.read_u32::<LittleEndian>()?;
            if list_offset > 0 {
                let current_pos = file.stream_position()?;
                if let Ok(indirect_subkeys) = parse_subkeys_list(
                    file,
                    list_offset.saturating_add(4096) as u64,
                    count,
                    verbose,
                ) {
                    subkeys.extend(indirect_subkeys);
                }
                file.seek(SeekFrom::Start(current_pos))?;
            }
        }
    }

    Ok(subkeys)
}

/// 流式解析注册表文件
pub fn parse_registry_file_streaming<F>(
    file_path: &str,
    chunk_callback: F,
) -> Result<RegistryKey, String>
where
    F: FnMut(RegistryKey) + Send + 'static,
{
    debug_info!("🔄 开始流式解析注册表文件: {}", file_path);

    // 验证文件存在
    if !Path::new(file_path).exists() {
        return Err(format!("注册表文件不存在: {}", file_path));
    }

    // 验证文件扩展名
    let path = Path::new(file_path);
    if let Some(extension) = path.extension() {
        let ext = extension.to_string_lossy().to_lowercase();
        if ext != "reghive" && ext != "hive" && ext != "dat" && ext != "raw" {
            return Err(format!("不支持的文件类型: .{}", ext));
        }
    }

    debug_info!("📁 文件验证通过，开始流式解析...");

    match parse_regf_file_streaming(file_path, chunk_callback) {
        Ok(registry) => {
            debug_info!("✅ 流式注册表文件解析成功");
            Ok(registry)
        }
        Err(e) => {
            debug_info!("❌ 流式解析失败: {}", e);
            Err(format!("流式解析注册表文件失败: {}", e))
        }
    }
}

/// 流式解析REGF文件
fn parse_regf_file_streaming<F>(file_path: &str, mut chunk_callback: F) -> io::Result<RegistryKey>
where
    F: FnMut(RegistryKey) + Send + 'static,
{
    let mut file = File::open(file_path)?;
    let verbose = true;

    debug_info!("📖 读取文件: {}", file_path);

    // Read and validate REGF header
    let header = read_regf_header(&mut file)?;

    debug_info!("✅ REGF头部验证成功");
    debug_info!(
        "主版本: {}, 次版本: {}",
        header.major_version,
        header.minor_version
    );
    debug_info!("根键偏移: 0x{:x}", header.root_key_offset);
    debug_info!("Hive数据大小: {} 字节", header.hive_bins_data_size);

    // Skip to hive bins data (after 4KB header)
    file.seek(SeekFrom::Start(4096))?;

    // Parse the root key with streaming
    let root_key = if header.root_key_offset > 0 {
        parse_key_node_streaming(
            &mut file,
            (header.root_key_offset + 4096) as u64,
            "ROOT".to_string(),
            verbose,
            &mut chunk_callback,
        )?
    } else {
        RegistryKey::empty("ROOT".to_string())
    };

    debug_info!("✅ 流式注册表解析完成");

    Ok(root_key)
}

/// 流式解析键节点
fn parse_key_node_streaming<F>(
    file: &mut File,
    offset: u64,
    key_name: String,
    verbose: bool,
    chunk_callback: &mut F,
) -> io::Result<RegistryKey>
where
    F: FnMut(RegistryKey) + Send + 'static,
{
    file.seek(SeekFrom::Start(offset))?;

    // Read cell header
    let cell_size = file.read_i32::<LittleEndian>()?;
    if cell_size >= 0 {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "无效的单元格大小（应为负数）",
        ));
    }

    let mut signature = [0u8; 2];
    file.read_exact(&mut signature)?;

    if &signature != b"nk" {
        if verbose {
            debug_info!("⚠️ 警告: 期望'nk'签名，得到 {:?}", signature);
        }
        return Ok(RegistryKey::empty(key_name));
    }

    // Read key node structure (same as before)
    let flags = file.read_u16::<LittleEndian>()?;
    let last_written_ts = file.read_u64::<LittleEndian>()?;
    let _spare = file.read_u32::<LittleEndian>()?;
    let _parent_key_offset = file.read_u32::<LittleEndian>()?;
    let number_of_subkeys = file.read_u32::<LittleEndian>()?;
    let _number_of_volatile_subkeys = file.read_u32::<LittleEndian>()?;
    let subkeys_list_offset = file.read_u32::<LittleEndian>()?;
    let _volatile_subkeys_list_offset = file.read_u32::<LittleEndian>()?;
    let number_of_key_values = file.read_u32::<LittleEndian>()?;
    let key_values_list_offset = file.read_u32::<LittleEndian>()?;
    let _key_security_offset = file.read_u32::<LittleEndian>()?;
    let _class_name_offset = file.read_u32::<LittleEndian>()?;

    // Skip remaining fields
    file.seek(SeekFrom::Current(20))?; // Skip to key name length
    let key_name_length = file.read_u16::<LittleEndian>()?;
    let _class_name_length = file.read_u16::<LittleEndian>()?;

    // Read key name: KEY_COMP_NAME (0x0020) means ASCII compressed name
    let is_compressed_name = flags & 0x0020 != 0;
    let actual_key_name = if key_name_length > 0 {
        let mut name_bytes = vec![0u8; key_name_length as usize];
        file.read_exact(&mut name_bytes)?;
        if is_compressed_name {
            String::from_utf8_lossy(&name_bytes).to_string()
        } else {
            decode_utf16le(&name_bytes)
        }
    } else {
        key_name
    };

    if verbose {
        debug_info!(
            "🔑 流式解析键: '{}' (子键: {}, 值: {})",
            actual_key_name,
            number_of_subkeys,
            number_of_key_values
        );
    }

    let mut registry_key = RegistryKey {
        name: actual_key_name.clone(),
        last_modified: filetime_to_string(last_written_ts),
        values: HashMap::new(),
        subkeys: HashMap::new(),
    };

    // Parse values if present
    if number_of_key_values > 0 && key_values_list_offset > 0 {
        if let Ok(values) = parse_key_values(
            file,
            key_values_list_offset.saturating_add(4096) as u64,
            number_of_key_values,
            verbose,
        ) {
            registry_key.values = values;
        }
    }

    // 先发送当前键（包含值但不包含子键）
    let current_chunk = RegistryKey {
        name: registry_key.name.clone(),
        last_modified: registry_key.last_modified.clone(),
        values: registry_key.values.clone(),
        subkeys: HashMap::new(),
    };
    chunk_callback(current_chunk);

    // Parse subkeys if present (limited batches for streaming)
    if number_of_subkeys > 0 && subkeys_list_offset > 0 && number_of_subkeys <= 50000 {
        if let Ok(subkeys) = parse_subkeys_list_streaming(
            file,
            subkeys_list_offset.saturating_add(4096) as u64,
            number_of_subkeys,
            verbose,
            chunk_callback,
        ) {
            registry_key.subkeys = subkeys;
        }
    }

    Ok(registry_key)
}

/// 流式解析子键列表
fn parse_subkeys_list_streaming<F>(
    file: &mut File,
    offset: u64,
    count: u32,
    verbose: bool,
    chunk_callback: &mut F,
) -> io::Result<HashMap<String, RegistryKey>>
where
    F: FnMut(RegistryKey) + Send + 'static,
{
    let mut subkeys = HashMap::new();

    if verbose && count > 0 {
        debug_info!("🗂️ 开始流式解析 {} 个子键...", count);
    }

    file.seek(SeekFrom::Start(offset))?;
    let _cell_size = file.read_i32::<LittleEndian>()?;
    let mut signature = [0u8; 2];
    file.read_exact(&mut signature)?;

    // Handle different list types (lf, lh, ri, li)
    if &signature == b"lf" || &signature == b"lh" || &signature == b"li" {
        let _number_of_elements = file.read_u16::<LittleEndian>()?;

        // 批量读取子键偏移量
        let count_to_read = count.min(50000);
        let mut key_offsets = Vec::with_capacity(count_to_read as usize);

        for _i in 0..count_to_read {
            let key_offset = file.read_u32::<LittleEndian>()?;
            if &signature == b"lf" || &signature == b"lh" {
                let _hash = file.read_u32::<LittleEndian>()?;
            }

            if key_offset > 0 {
                key_offsets.push(key_offset);
            }
        }

        // 分批解析子键，每10个发送一次
        let batch_size = 10;
        let total_keys = key_offsets.len();

        for (batch_index, batch) in key_offsets.chunks(batch_size).enumerate() {
            if verbose {
                debug_info!(
                    "📦 处理第 {} 批子键 ({}/{})",
                    batch_index + 1,
                    batch_index * batch_size + batch.len(),
                    total_keys
                );
            }

            for (i, &key_offset) in batch.iter().enumerate() {
                let global_index = batch_index * batch_size + i;
                if let Ok(subkey) = parse_key_node_streaming(
                    file,
                    key_offset.saturating_add(4096) as u64,
                    format!("Subkey_{}", global_index),
                    verbose,
                    chunk_callback,
                ) {
                    subkeys.insert(subkey.name.clone(), subkey);
                }
            }

            // 每处理完一批就休眠一小段时间，让其他任务有机会执行
            std::thread::sleep(std::time::Duration::from_millis(1));
        }

        if verbose && !subkeys.is_empty() {
            debug_info!("✅ 流式子键解析完成，共 {} 个子键", subkeys.len());
        }
    } else if &signature == b"ri" {
        // 处理间接列表 - 使用实际元素数量
        let number_of_elements = file.read_u16::<LittleEndian>()?;

        for _i in 0..(number_of_elements as u32).min(1000) {
            let list_offset = file.read_u32::<LittleEndian>()?;
            if list_offset > 0 {
                let current_pos = file.stream_position()?;
                if let Ok(indirect_subkeys) = parse_subkeys_list_streaming(
                    file,
                    list_offset.saturating_add(4096) as u64,
                    count,
                    verbose,
                    chunk_callback,
                ) {
                    subkeys.extend(indirect_subkeys);
                }
                file.seek(SeekFrom::Start(current_pos))?;
            }
        }
    }

    Ok(subkeys)
}

/// 懒加载：初始化注册表文件，只加载根键和直接子键名称（异步优化版）
#[tauri::command]
pub async fn init_registry_hive(file_path: String) -> Result<RegistryKey, String> {
    debug_info!("🔍 初始化注册表文件: {}", file_path);

    // 使用 spawn_blocking 避免阻塞异步运行时
    let result = tokio::task::spawn_blocking(move || parse_registry_file_lazy(&file_path)).await;

    match result {
        Ok(parse_result) => match parse_result {
            Ok(registry_data) => {
                debug_info!("✅ 注册表文件初始化成功");
                Ok(registry_data)
            }
            Err(e) => {
                debug_info!("❌ 注册表文件初始化失败: {}", e);
                Err(e)
            }
        },
        Err(join_error) => {
            debug_info!("❌ 异步任务执行失败: {}", join_error);
            Err(format!("异步任务执行失败: {}", join_error))
        }
    }
}

/// 懒加载：按路径解析特定键的内容（带超时保护的异步版）
#[tauri::command]
pub async fn load_registry_key(file_path: String, key_path: String) -> Result<RegistryKey, String> {
    debug_info!("🔍 按需加载注册表键: {} -> {}", file_path, key_path);

    // 设置30秒超时
    let timeout_duration = std::time::Duration::from_secs(30);

    // 克隆变量以避免移动后使用的问题
    let file_path_clone = file_path.clone();
    let key_path_clone = key_path.clone();

    let parse_task = tokio::task::spawn_blocking(move || {
        parse_registry_key_by_path(&file_path_clone, &key_path_clone)
    });

    // 使用 timeout 包装任务
    match tokio::time::timeout(timeout_duration, parse_task).await {
        Ok(task_result) => match task_result {
            Ok(parse_result) => match parse_result {
                Ok(registry_data) => {
                    debug_info!("✅ 注册表键加载成功: {}", key_path);
                    Ok(registry_data)
                }
                Err(e) => {
                    debug_info!("❌ 注册表键加载失败: {} -> {}", key_path, e);
                    Err(e)
                }
            },
            Err(join_error) => {
                debug_info!("❌ 异步任务执行失败: {} -> {}", key_path, join_error);
                Err(format!("异步任务执行失败: {}", join_error))
            }
        },
        Err(_timeout_error) => {
            debug_info!("⏰ 注册表键加载超时: {} -> {}", file_path, key_path);
            Err(format!("键 '{}' 加载超时，请稍后重试", key_path))
        }
    }
}

/// Tauri命令：解析注册表文件（完整解析，带超时保护的异步版）
#[tauri::command]
pub async fn parse_registry_hive(file_path: String) -> Result<RegistryKey, String> {
    debug_info!("🔍 开始解析注册表文件: {}", file_path);

    // 设置45秒超时（完整解析需要更长时间）
    let timeout_duration = std::time::Duration::from_secs(45);

    // 克隆变量以避免移动后使用的问题
    let file_path_clone = file_path.clone();

    let parse_task = tokio::task::spawn_blocking(move || parse_registry_file(&file_path_clone));

    // 使用 timeout 包装任务
    match tokio::time::timeout(timeout_duration, parse_task).await {
        Ok(task_result) => match task_result {
            Ok(parse_result) => match parse_result {
                Ok(registry_data) => {
                    debug_info!("✅ 注册表文件解析成功");
                    Ok(registry_data)
                }
                Err(e) => {
                    debug_info!("❌ 注册表文件解析失败: {}", e);
                    Err(e)
                }
            },
            Err(join_error) => {
                debug_info!("❌ 异步任务执行失败: {}", join_error);
                Err(format!("异步任务执行失败: {}", join_error))
            }
        },
        Err(_timeout_error) => {
            debug_info!("⏰ 注册表文件解析超时: {}", file_path);
            Err("注册表文件解析超时，文件可能过大或损坏".to_string())
        }
    }
}

/// 懒加载：解析注册表文件，只加载根键和直接子键名称
pub fn parse_registry_file_lazy(file_path: &str) -> Result<RegistryKey, String> {
    debug_info!("🔍 开始懒加载注册表文件: {}", file_path);

    // 验证文件存在
    if !Path::new(file_path).exists() {
        return Err(format!("注册表文件不存在: {}", file_path));
    }

    // 验证文件扩展名
    let path = Path::new(file_path);
    if let Some(extension) = path.extension() {
        let ext = extension.to_string_lossy().to_lowercase();
        if ext != "reghive" && ext != "hive" && ext != "dat" && ext != "raw" {
            return Err(format!("不支持的文件类型: .{}", ext));
        }
    }

    debug_info!("📁 文件验证通过，开始懒加载解析...");

    match parse_regf_file_lazy(file_path) {
        Ok(registry) => {
            debug_info!("✅ 懒加载注册表文件解析成功");
            Ok(registry)
        }
        Err(e) => {
            debug_info!("❌ 懒加载解析失败: {}", e);
            Err(format!("懒加载解析注册表文件失败: {}", e))
        }
    }
}

/// 按路径解析特定键的内容
pub fn parse_registry_key_by_path(file_path: &str, key_path: &str) -> Result<RegistryKey, String> {
    debug_info!("🔍 按路径解析注册表键: {} -> {}", file_path, key_path);

    // 验证文件存在
    if !Path::new(file_path).exists() {
        debug_info!("❌ 文件不存在: {}", file_path);
        return Err(format!("注册表文件不存在: {}", file_path));
    }

    debug_info!("📁 文件存在，开始解析...");

    match parse_regf_key_by_path(file_path, key_path) {
        Ok(registry) => {
            debug_info!("✅ 按路径解析成功: {}", key_path);
            debug_info!(
                "📊 解析结果 - 键名: {}, 值数量: {}, 子键数量: {}",
                registry.name,
                registry.values.len(),
                registry.subkeys.len()
            );
            Ok(registry)
        }
        Err(e) => {
            debug_info!("❌ 按路径解析失败: {} -> {}", key_path, e);
            Err(format!("按路径解析失败: {}", e))
        }
    }
}

/// 懒加载解析REGF文件
fn parse_regf_file_lazy(file_path: &str) -> io::Result<RegistryKey> {
    let mut file = File::open(file_path)?;
    let verbose = false; // 懒加载时减少日志输出

    debug_info!("📖 懒加载读取文件: {}", file_path);

    // Read and validate REGF header
    let header = read_regf_header(&mut file)?;

    debug_info!("✅ REGF头部验证成功");

    // Skip to hive bins data (after 4KB header)
    file.seek(SeekFrom::Start(4096))?;

    // Parse the root key with lazy loading (only direct children names)
    let root_key = if header.root_key_offset > 0 {
        parse_key_node_lazy(
            &mut file,
            (header.root_key_offset + 4096) as u64,
            "ROOT".to_string(),
            verbose,
        )?
    } else {
        RegistryKey::empty("ROOT".to_string())
    };

    debug_info!("✅ 懒加载注册表解析完成");

    Ok(root_key)
}

/// 按路径解析REGF文件中的特定键
fn parse_regf_key_by_path(file_path: &str, key_path: &str) -> io::Result<RegistryKey> {
    let mut file = File::open(file_path)?;
    let verbose = true; // 启用详细日志

    debug_info!("📖 开始按路径解析文件: {}", file_path);

    // Read and validate REGF header
    let header = read_regf_header(&mut file)?;
    debug_info!(
        "✅ REGF头部验证成功，根键偏移: 0x{:x}",
        header.root_key_offset
    );

    // Skip to hive bins data (after 4KB header)
    file.seek(SeekFrom::Start(4096))?;

    // 解析路径，找到目标键
    let path_parts: Vec<&str> = key_path
        .split('\\')
        .filter(|s| !s.is_empty() && *s != "ROOT")
        .collect();
    debug_info!("🔍 解析路径: {} -> 路径部分: {:?}", key_path, path_parts);

    if path_parts.is_empty() {
        // 请求根键，使用懒加载避免递归解析整棵树
        debug_info!("🌳 请求根键，懒加载根键内容");
        return parse_key_node_lazy(
            &mut file,
            (header.root_key_offset + 4096) as u64,
            "ROOT".to_string(),
            verbose,
        );
    }

    // 从根键开始导航到目标键
    let root_offset = (header.root_key_offset + 4096) as u64;
    debug_info!("🔍 开始从根键导航到目标键，根键偏移: 0x{:x}", root_offset);
    find_key_by_path_lazy(&mut file, root_offset, &path_parts, verbose)
}

/// 懒加载解析键节点（只加载直接子键名称，不加载子键内容）
fn parse_key_node_lazy(
    file: &mut File,
    offset: u64,
    key_name: String,
    verbose: bool,
) -> io::Result<RegistryKey> {
    file.seek(SeekFrom::Start(offset))?;

    // Read cell header
    let cell_size = file.read_i32::<LittleEndian>()?;
    if cell_size >= 0 {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "无效的单元格大小（应为负数）",
        ));
    }

    let mut signature = [0u8; 2];
    file.read_exact(&mut signature)?;

    if &signature != b"nk" {
        // 静默处理非键节点，避免循环警告
        return Ok(RegistryKey::empty(key_name));
    }

    // Read key node structure
    let flags = file.read_u16::<LittleEndian>()?;
    let last_written_ts = file.read_u64::<LittleEndian>()?;
    let _spare = file.read_u32::<LittleEndian>()?;
    let _parent_key_offset = file.read_u32::<LittleEndian>()?;
    let number_of_subkeys = file.read_u32::<LittleEndian>()?;
    let _number_of_volatile_subkeys = file.read_u32::<LittleEndian>()?;
    let subkeys_list_offset = file.read_u32::<LittleEndian>()?;
    let _volatile_subkeys_list_offset = file.read_u32::<LittleEndian>()?;
    let number_of_key_values = file.read_u32::<LittleEndian>()?;
    let key_values_list_offset = file.read_u32::<LittleEndian>()?;
    let _key_security_offset = file.read_u32::<LittleEndian>()?;
    let _class_name_offset = file.read_u32::<LittleEndian>()?;

    // Skip remaining fields
    file.seek(SeekFrom::Current(20))?; // Skip to key name length
    let key_name_length = file.read_u16::<LittleEndian>()?;
    let _class_name_length = file.read_u16::<LittleEndian>()?;

    // Read key name: KEY_COMP_NAME (0x0020) means ASCII compressed name
    let is_compressed_name = flags & 0x0020 != 0;
    let actual_key_name = if key_name_length > 0 {
        let mut name_bytes = vec![0u8; key_name_length as usize];
        file.read_exact(&mut name_bytes)?;
        if is_compressed_name {
            String::from_utf8_lossy(&name_bytes).to_string()
        } else {
            decode_utf16le(&name_bytes)
        }
    } else {
        key_name
    };

    if verbose {
        debug_info!(
            "🔑 懒加载解析键: '{}' (子键: {}, 值: {})",
            actual_key_name,
            number_of_subkeys,
            number_of_key_values
        );
    }

    let mut registry_key = RegistryKey {
        name: actual_key_name.clone(),
        last_modified: filetime_to_string(last_written_ts),
        values: HashMap::new(),
        subkeys: HashMap::new(),
    };

    // 懒加载：只解析值，不解析子键内容
    if number_of_key_values > 0 && key_values_list_offset > 0 {
        if let Ok(values) = parse_key_values(
            file,
            key_values_list_offset.saturating_add(4096) as u64,
            number_of_key_values,
            verbose,
        ) {
            registry_key.values = values;
        }
    }

    // 懒加载：只获取子键名称，不解析子键内容
    if number_of_subkeys > 0 && subkeys_list_offset > 0 && number_of_subkeys <= 50000 {
        if let Ok(subkey_names) = get_subkey_names_only(
            file,
            subkeys_list_offset.saturating_add(4096) as u64,
            number_of_subkeys,
            verbose,
        ) {
            for subkey_name in subkey_names {
                registry_key
                    .subkeys
                    .insert(subkey_name.clone(), RegistryKey::empty(subkey_name));
            }
        }
    }

    Ok(registry_key)
}

/// 只获取子键名称，不解析子键内容
fn get_subkey_names_only(
    file: &mut File,
    offset: u64,
    count: u32,
    verbose: bool,
) -> io::Result<Vec<String>> {
    let mut subkey_names = Vec::new();

    file.seek(SeekFrom::Start(offset))?;
    let _cell_size = file.read_i32::<LittleEndian>()?;
    let mut signature = [0u8; 2];
    file.read_exact(&mut signature)?;

    // Handle different list types (lf, lh, ri, li)
    if &signature == b"lf" || &signature == b"lh" || &signature == b"li" {
        let _number_of_elements = file.read_u16::<LittleEndian>()?;

        // 批量读取子键偏移量
        let count_to_read = count.min(50000);
        let mut key_offsets = Vec::with_capacity(count_to_read as usize);

        for _i in 0..count_to_read {
            let key_offset = file.read_u32::<LittleEndian>()?;
            if &signature == b"lf" || &signature == b"lh" {
                let _hash = file.read_u32::<LittleEndian>()?;
            }

            if key_offset > 0 {
                key_offsets.push(key_offset);
            }
        }

        // 只读取子键名称
        for key_offset in key_offsets {
            if let Ok(key_name) = get_key_name_only(file, key_offset.saturating_add(4096) as u64) {
                subkey_names.push(key_name);
            }
        }

        if verbose && !subkey_names.is_empty() {
            debug_info!("✅ 获取子键名称完成，共 {} 个子键", subkey_names.len());
        }
    } else if &signature == b"ri" {
        // 处理间接列表 - 使用实际元素数量
        let number_of_elements = file.read_u16::<LittleEndian>()?;

        for _i in 0..(number_of_elements as u32).min(1000) {
            let list_offset = file.read_u32::<LittleEndian>()?;
            if list_offset > 0 {
                let current_pos = file.stream_position()?;
                if let Ok(indirect_names) = get_subkey_names_only(
                    file,
                    list_offset.saturating_add(4096) as u64,
                    count,
                    verbose,
                ) {
                    subkey_names.extend(indirect_names);
                }
                file.seek(SeekFrom::Start(current_pos))?;
            }
        }
    }

    Ok(subkey_names)
}

/// 只获取键名称，不解析键内容
fn get_key_name_only(file: &mut File, offset: u64) -> io::Result<String> {
    file.seek(SeekFrom::Start(offset))?;

    // Read cell header
    let cell_size = file.read_i32::<LittleEndian>()?;
    if cell_size >= 0 {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "无效的单元格大小（应为负数）",
        ));
    }

    let mut signature = [0u8; 2];
    file.read_exact(&mut signature)?;

    if &signature != b"nk" {
        // 如果遇到值节点(vk)或其他类型，静默跳过而不是报错
        if &signature == b"vk" {
            // 这是一个值节点，不是键节点，跳过
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "遇到值节点，跳过",
            ));
        }
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            format!("期望键签名'nk'，得到 {:?}", signature),
        ));
    }

    // Read key node structure
    let flags = file.read_u16::<LittleEndian>()?;
    let _last_written_timestamp = file.read_u64::<LittleEndian>()?;
    let _spare = file.read_u32::<LittleEndian>()?;
    let _parent_key_offset = file.read_u32::<LittleEndian>()?;
    let _number_of_subkeys = file.read_u32::<LittleEndian>()?;
    let _number_of_volatile_subkeys = file.read_u32::<LittleEndian>()?;
    let _subkeys_list_offset = file.read_u32::<LittleEndian>()?;
    let _volatile_subkeys_list_offset = file.read_u32::<LittleEndian>()?;
    let _number_of_key_values = file.read_u32::<LittleEndian>()?;
    let _key_values_list_offset = file.read_u32::<LittleEndian>()?;
    let _key_security_offset = file.read_u32::<LittleEndian>()?;
    let _class_name_offset = file.read_u32::<LittleEndian>()?;

    // Skip remaining fields
    file.seek(SeekFrom::Current(20))?; // Skip to key name length
    let key_name_length = file.read_u16::<LittleEndian>()?;
    let _class_name_length = file.read_u16::<LittleEndian>()?;

    // Read key name: KEY_COMP_NAME (0x0020) means ASCII compressed name
    let is_compressed_name = flags & 0x0020 != 0;
    let key_name = if key_name_length > 0 {
        let mut name_bytes = vec![0u8; key_name_length as usize];
        file.read_exact(&mut name_bytes)?;
        if is_compressed_name {
            String::from_utf8_lossy(&name_bytes).to_string()
        } else {
            decode_utf16le(&name_bytes)
        }
    } else {
        "Unknown".to_string()
    };

    Ok(key_name)
}

/// 按路径查找键（完整递归解析，仅用于需要全部子树的场景）
#[allow(dead_code)]
fn find_key_by_path(
    file: &mut File,
    root_offset: u64,
    path_parts: &[&str],
    verbose: bool,
) -> io::Result<RegistryKey> {
    let current_offset = navigate_to_key(file, root_offset, path_parts, verbose)?;
    debug_info!("🎯 解析最终目标键（完整），偏移: 0x{:x}", current_offset);
    parse_key_node(
        file,
        current_offset,
        path_parts.last().unwrap_or(&"Unknown").to_string(),
        verbose,
    )
}

/// 按路径查找键（懒加载：只加载直接子键名称和值，不递归）
fn find_key_by_path_lazy(
    file: &mut File,
    root_offset: u64,
    path_parts: &[&str],
    verbose: bool,
) -> io::Result<RegistryKey> {
    let current_offset = navigate_to_key(file, root_offset, path_parts, verbose)?;
    debug_info!("🎯 解析最终目标键（懒加载），偏移: 0x{:x}", current_offset);
    parse_key_node_lazy(
        file,
        current_offset,
        path_parts.last().unwrap_or(&"Unknown").to_string(),
        verbose,
    )
}

/// 导航到指定路径的键，返回其偏移量
fn navigate_to_key(
    file: &mut File,
    root_offset: u64,
    path_parts: &[&str],
    verbose: bool,
) -> io::Result<u64> {
    let mut current_offset = root_offset;

    debug_info!("🔍 开始按路径查找键，路径部分: {:?}", path_parts);

    for (i, part) in path_parts.iter().enumerate() {
        debug_info!(
            "🔍 查找路径部分: {} (第{}/{}部分)",
            part,
            i + 1,
            path_parts.len()
        );

        if let Ok(offset) = find_subkey_offset(file, current_offset, part, verbose) {
            debug_info!("✅ 找到目标子键: {}，偏移: 0x{:x}", part, offset);
            current_offset = offset;
        } else {
            debug_info!("❌ 找不到路径部分: {}", part);
            if let Ok(subkey_names) = get_subkey_names_from_offset(file, current_offset, verbose) {
                debug_info!("❌ 可用的子键: {:?}", subkey_names);
            }
            return Err(io::Error::new(
                io::ErrorKind::NotFound,
                format!("找不到路径: {}", part),
            ));
        }
    }

    Ok(current_offset)
}

/// 从指定偏移量获取子键名称列表（用于调试）
fn get_subkey_names_from_offset(
    file: &mut File,
    offset: u64,
    verbose: bool,
) -> io::Result<Vec<String>> {
    file.seek(SeekFrom::Start(offset))?;

    // Read cell header and key node structure
    let _cell_size = file.read_i32::<LittleEndian>()?;
    let mut signature = [0u8; 2];
    file.read_exact(&mut signature)?;

    if &signature != b"nk" {
        return Ok(vec!["<invalid key>".to_string()]);
    }

    // Read key node structure (same as parse_key_node)
    let _flags = file.read_u16::<LittleEndian>()?;
    let _last_written_timestamp = file.read_u64::<LittleEndian>()?;
    let _spare = file.read_u32::<LittleEndian>()?;
    let _parent_key_offset = file.read_u32::<LittleEndian>()?;
    let number_of_subkeys = file.read_u32::<LittleEndian>()?;
    let _number_of_volatile_subkeys = file.read_u32::<LittleEndian>()?;
    let subkeys_list_offset = file.read_u32::<LittleEndian>()?;

    if verbose {
        debug_info!(
            "📊 调试 - 子键数量: {}, 子键列表偏移: 0x{:x}",
            number_of_subkeys,
            subkeys_list_offset
        );
    }

    if number_of_subkeys == 0 || subkeys_list_offset == 0 {
        if verbose {
            debug_info!("⚠️ 没有子键或偏移量为0");
        }
        return Ok(vec!["<no subkeys>".to_string()]);
    }

    // 获取子键名称
    if verbose {
        debug_info!(
            "🔍 开始获取子键名称，偏移: 0x{:x}",
            subkeys_list_offset.saturating_add(4096)
        );
    }
    get_subkey_names_only(
        file,
        subkeys_list_offset.saturating_add(4096) as u64,
        number_of_subkeys,
        verbose,
    )
}

/// 查找子键的偏移量
fn find_subkey_offset(
    file: &mut File,
    parent_offset: u64,
    target_name: &str,
    verbose: bool,
) -> io::Result<u64> {
    file.seek(SeekFrom::Start(parent_offset))?;

    // Read cell header and key node structure
    let _cell_size = file.read_i32::<LittleEndian>()?;
    let mut signature = [0u8; 2];
    file.read_exact(&mut signature)?;

    if &signature != b"nk" {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "无效的键签名"));
    }

    // Read key node structure (same as parse_key_node)
    let _flags = file.read_u16::<LittleEndian>()?;
    let _last_written_timestamp = file.read_u64::<LittleEndian>()?;
    let _spare = file.read_u32::<LittleEndian>()?;
    let _parent_key_offset = file.read_u32::<LittleEndian>()?;
    let number_of_subkeys = file.read_u32::<LittleEndian>()?;
    let _number_of_volatile_subkeys = file.read_u32::<LittleEndian>()?;
    let subkeys_list_offset = file.read_u32::<LittleEndian>()?;

    if verbose {
        debug_info!(
            "🔍 find_subkey_offset - 查找目标: {}, 子键数量: {}, 列表偏移: 0x{:x}",
            target_name,
            number_of_subkeys,
            subkeys_list_offset
        );
    }

    if number_of_subkeys == 0 || subkeys_list_offset == 0 {
        if verbose {
            debug_info!("❌ find_subkey_offset - 没有子键或偏移量为0");
        }
        return Err(io::Error::new(io::ErrorKind::NotFound, "没有子键"));
    }

    // 在子键列表中查找目标键
    if verbose {
        debug_info!(
            "🔍 find_subkey_offset - 开始在列表中查找，偏移: 0x{:x}",
            subkeys_list_offset.saturating_add(4096)
        );
    }
    find_key_offset_in_list(
        file,
        subkeys_list_offset.saturating_add(4096) as u64,
        target_name,
        verbose,
    )
}

/// 在子键列表中查找特定键的偏移量
fn find_key_offset_in_list(
    file: &mut File,
    list_offset: u64,
    target_name: &str,
    _verbose: bool,
) -> io::Result<u64> {
    file.seek(SeekFrom::Start(list_offset))?;
    let _cell_size = file.read_i32::<LittleEndian>()?;
    let mut signature = [0u8; 2];
    file.read_exact(&mut signature)?;

    if &signature == b"lf" || &signature == b"lh" || &signature == b"li" {
        let number_of_elements = file.read_u16::<LittleEndian>()?;

        for _i in 0..number_of_elements {
            let key_offset = file.read_u32::<LittleEndian>()?;
            if &signature == b"lf" || &signature == b"lh" {
                let _hash = file.read_u32::<LittleEndian>()?;
            }

            if key_offset > 0 {
                let current_pos = file.stream_position()?;
                match get_key_name_only(file, key_offset.saturating_add(4096) as u64) {
                    Ok(key_name) => {
                        if key_name == target_name {
                            return Ok(key_offset.saturating_add(4096) as u64);
                        }
                    }
                    Err(_e) => {
                        // 静默处理错误，可能是值节点或其他类型的节点
                        // 不输出任何警告，避免循环日志
                    }
                }
                file.seek(SeekFrom::Start(current_pos))?;
            }
        }
    }

    Err(io::Error::new(
        io::ErrorKind::NotFound,
        format!("找不到键: {}", target_name),
    ))
}
