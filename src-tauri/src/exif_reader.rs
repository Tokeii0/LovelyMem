use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use tauri::command;
// use kamadak_exif; // 暂时注释掉，使用基础实现

#[derive(Debug, Serialize, Deserialize)]
pub struct FileInfo {
    pub name: String,
    pub size: u64,
    pub modified: Option<String>,
    pub created: Option<String>,
}

/// 读取图片文件的EXIF数据
#[command]
pub async fn read_exif_data(file_path: String) -> Result<HashMap<String, Value>, String> {
    debug_info!("🖼️ 开始读取EXIF数据: {}", file_path);

    // 验证文件是否存在
    if !Path::new(&file_path).exists() {
        return Err("文件不存在".to_string());
    }

    // 验证文件格式
    if !is_supported_image_format(&file_path) {
        return Err("不支持的图片格式".to_string());
    }

    // 后端只提供基础文件信息，EXIF解析由前端JavaScript库处理
    debug_info!("ℹ️ 后端提供基础文件信息，EXIF解析将由前端处理");
    extract_basic_info(&file_path)
}

/// 读取文件字节数据
#[command]
pub async fn read_file_bytes(file_path: String) -> Result<Vec<u8>, String> {
    use std::fs;

    fs::read(&file_path).map_err(|e| format!("读取文件失败: {}", e))
}

/// 获取文件基本信息
#[command]
pub async fn get_file_info(file_path: String) -> Result<FileInfo, String> {
    debug_info!("📁 获取文件信息: {}", file_path);

    let path = Path::new(&file_path);
    if !path.exists() {
        return Err("文件不存在".to_string());
    }

    match fs::metadata(&file_path) {
        Ok(metadata) => {
            let name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("未知文件")
                .to_string();

            let size = metadata.len();

            let modified = metadata.modified().ok().and_then(|time| {
                time.duration_since(std::time::UNIX_EPOCH)
                    .ok()
                    .map(|duration| {
                        let secs = duration.as_secs();
                        format_timestamp(secs)
                    })
            });

            let created = metadata.created().ok().and_then(|time| {
                time.duration_since(std::time::UNIX_EPOCH)
                    .ok()
                    .map(|duration| {
                        let secs = duration.as_secs();
                        format_timestamp(secs)
                    })
            });

            let file_info = FileInfo {
                name,
                size,
                modified,
                created,
            };

            debug_info!("✅ 文件信息获取成功");
            Ok(file_info)
        }
        Err(e) => {
            debug_info!("❌ 获取文件信息失败: {}", e);
            Err(format!("获取文件信息失败: {}", e))
        }
    }
}

/// 保存文本文件
#[command]
pub async fn save_text_file(path: String, content: String) -> Result<(), String> {
    debug_info!("💾 保存文本文件: {}", path);

    match fs::write(&path, content) {
        Ok(_) => {
            debug_info!("✅ 文件保存成功: {}", path);
            Ok(())
        }
        Err(e) => {
            debug_info!("❌ 文件保存失败: {}", e);
            Err(format!("保存文件失败: {}", e))
        }
    }
}

/// 保存二进制数据文件
#[command]
pub async fn save_binary_data(file_path: String, data: Vec<u8>) -> Result<(), String> {
    debug_info!("💾 保存二进制文件: {}", file_path);

    match fs::write(&file_path, data) {
        Ok(_) => {
            debug_info!("✅ 二进制文件保存成功: {}", file_path);
            Ok(())
        }
        Err(e) => {
            debug_info!("❌ 二进制文件保存失败: {}", e);
            Err(format!("保存二进制文件失败: {}", e))
        }
    }
}

/// 检查是否为支持的图片格式
fn is_supported_image_format(file_path: &str) -> bool {
    let supported_extensions = [
        "jpg", "jpeg", "tiff", "tif", "raw", "cr2", "nef", "arw", "dng", "orf", "rw2", "pef",
        "srw", "raf", "3fr", "fff", "dcr", "kdc", "srf", "mrw", "x3f", "erf", "mef", "mos", "crw",
    ];

    if let Some(extension) = Path::new(file_path)
        .extension()
        .and_then(|ext| ext.to_str())
    {
        let ext_lower = extension.to_lowercase();
        supported_extensions.contains(&ext_lower.as_str())
    } else {
        false
    }
}

/// 格式化时间戳
fn format_timestamp(secs: u64) -> String {
    // 简单的时间格式化
    let days = secs / 86400;
    let hours = (secs % 86400) / 3600;
    let minutes = (secs % 3600) / 60;
    let seconds = secs % 60;

    // 从1970年开始计算的简单日期
    let year = 1970 + (days / 365);
    let day_of_year = days % 365;
    let month = (day_of_year / 30) + 1;
    let day = (day_of_year % 30) + 1;

    format!(
        "{:04}-{:02}-{:02} {:02}:{:02}:{:02}",
        year, month, day, hours, minutes, seconds
    )
}

/// 获取图像尺寸
fn get_image_dimensions(file_path: &str) -> Result<(u32, u32), String> {
    use std::fs::File;
    use std::io::BufReader;

    let file = File::open(file_path).map_err(|e| format!("打开文件失败: {}", e))?;

    let mut reader = BufReader::new(file);

    // 尝试读取图像头部信息来获取尺寸
    // 这是一个简化的实现，只处理常见的图像格式

    // 对于JPEG文件
    if file_path.to_lowercase().ends_with(".jpg") || file_path.to_lowercase().ends_with(".jpeg") {
        return get_jpeg_dimensions(&mut reader);
    }

    // 对于PNG文件
    if file_path.to_lowercase().ends_with(".png") {
        return get_png_dimensions(&mut reader);
    }

    // 其他格式暂时返回错误
    Err("不支持的图像格式".to_string())
}

/// 获取JPEG图像尺寸
fn get_jpeg_dimensions(
    reader: &mut std::io::BufReader<std::fs::File>,
) -> Result<(u32, u32), String> {
    use std::io::{Read, Seek, SeekFrom};

    let mut buffer = [0u8; 2];
    reader.read_exact(&mut buffer).map_err(|_| "读取文件失败")?;

    // 检查JPEG文件头
    if buffer != [0xFF, 0xD8] {
        return Err("不是有效的JPEG文件".to_string());
    }

    loop {
        reader.read_exact(&mut buffer).map_err(|_| "读取文件失败")?;

        if buffer[0] != 0xFF {
            continue;
        }

        let marker = buffer[1];

        // SOF0, SOF1, SOF2 markers contain image dimensions
        if marker == 0xC0 || marker == 0xC1 || marker == 0xC2 {
            // Skip length (2 bytes) and precision (1 byte)
            let mut skip_buffer = [0u8; 3];
            reader
                .read_exact(&mut skip_buffer)
                .map_err(|_| "读取文件失败")?;

            // Read height (2 bytes)
            let mut height_buffer = [0u8; 2];
            reader
                .read_exact(&mut height_buffer)
                .map_err(|_| "读取文件失败")?;
            let height = u16::from_be_bytes(height_buffer) as u32;

            // Read width (2 bytes)
            let mut width_buffer = [0u8; 2];
            reader
                .read_exact(&mut width_buffer)
                .map_err(|_| "读取文件失败")?;
            let width = u16::from_be_bytes(width_buffer) as u32;

            return Ok((width, height));
        } else {
            // Skip this segment
            let mut length_buffer = [0u8; 2];
            reader
                .read_exact(&mut length_buffer)
                .map_err(|_| "读取文件失败")?;
            let length = u16::from_be_bytes(length_buffer) as i64;

            if length < 2 {
                return Err("无效的JPEG段长度".to_string());
            }

            reader
                .seek(SeekFrom::Current(length - 2))
                .map_err(|_| "文件定位失败")?;
        }
    }
}

/// 获取PNG图像尺寸
fn get_png_dimensions(
    reader: &mut std::io::BufReader<std::fs::File>,
) -> Result<(u32, u32), String> {
    use std::io::Read;

    let mut buffer = [0u8; 8];
    reader.read_exact(&mut buffer).map_err(|_| "读取文件失败")?;

    // 检查PNG文件头
    if buffer != [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] {
        return Err("不是有效的PNG文件".to_string());
    }

    // 跳过IHDR chunk长度和类型
    let mut skip_buffer = [0u8; 8];
    reader
        .read_exact(&mut skip_buffer)
        .map_err(|_| "读取文件失败")?;

    // 读取宽度
    let mut width_buffer = [0u8; 4];
    reader
        .read_exact(&mut width_buffer)
        .map_err(|_| "读取文件失败")?;
    let width = u32::from_be_bytes(width_buffer);

    // 读取高度
    let mut height_buffer = [0u8; 4];
    reader
        .read_exact(&mut height_buffer)
        .map_err(|_| "读取文件失败")?;
    let height = u32::from_be_bytes(height_buffer);

    Ok((width, height))
}

// 移除了复杂的EXIF解析函数，改为完全由前端处理

// 移除了硬编码的假数据函数
// 如果需要完整的EXIF支持，应该使用专业的EXIF库如kamadak-exif

/// 尝试提取EXIF数据（暂时使用基础实现）
#[allow(dead_code)]
fn try_extract_with_kamadak_exif(_file_path: &str) -> Result<HashMap<String, Value>, String> {
    // 暂时返回错误，让系统使用基础文件信息
    Err("EXIF库暂时不可用，使用基础文件信息".to_string())
}

/// 提取基础文件信息作为备选方案
fn extract_basic_info(file_path: &str) -> Result<HashMap<String, Value>, String> {
    let mut basic_info = HashMap::new();

    let path = Path::new(file_path);

    // 文件名
    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
        basic_info.insert("FileName".to_string(), Value::String(name.to_string()));
    }

    // 文件大小
    if let Ok(metadata) = fs::metadata(file_path) {
        basic_info.insert("FileSize".to_string(), Value::Number(metadata.len().into()));

        // 修改时间
        if let Ok(modified) = metadata.modified() {
            if let Ok(duration) = modified.duration_since(std::time::UNIX_EPOCH) {
                let secs = duration.as_secs();
                basic_info.insert(
                    "FileModifyDate".to_string(),
                    Value::String(format_timestamp(secs)),
                );
            }
        }

        // 创建时间
        if let Ok(created) = metadata.created() {
            if let Ok(duration) = created.duration_since(std::time::UNIX_EPOCH) {
                let secs = duration.as_secs();
                basic_info.insert(
                    "FileCreateDate".to_string(),
                    Value::String(format_timestamp(secs)),
                );
            }
        }
    }

    // 文件扩展名
    if let Some(extension) = path.extension().and_then(|ext| ext.to_str()) {
        basic_info.insert(
            "FileType".to_string(),
            Value::String(extension.to_uppercase()),
        );
    }

    // 后端只提供最基础的文件信息，EXIF解析完全由前端处理
    basic_info.insert(
        "_BackendInfo".to_string(),
        Value::String("基础文件信息由后端提供，EXIF数据由前端解析".to_string()),
    );

    // 尝试获取真实的图像尺寸
    if let Ok(dimensions) = get_image_dimensions(file_path) {
        basic_info.insert("ImageWidth".to_string(), Value::Number(dimensions.0.into()));
        basic_info.insert(
            "ImageHeight".to_string(),
            Value::Number(dimensions.1.into()),
        );
    }

    if basic_info.is_empty() {
        Err("无法提取任何文件信息".to_string())
    } else {
        debug_info!("✅ 提取基础文件信息成功，标签数量: {}", basic_info.len());
        Ok(basic_info)
    }
}

// 格式化EXIF值的函数暂时注释掉，等EXIF库可用时再启用
/*
fn format_exif_value(value: &kamadak_exif::Value) -> Value {
    // EXIF值格式化逻辑
    Value::String("暂不可用".to_string())
}
*/
