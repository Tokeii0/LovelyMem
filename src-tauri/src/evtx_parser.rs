use crate::settings::load_settings;
use evtx::{EvtxChunkData, EvtxParser, ParserSettings, SerializedEvtxRecord};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::Path;
use std::sync::Arc;

/// EVTX事件记录结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EvtxEventRecord {
    /// 事件ID
    pub event_id: u32,
    /// 事件级别 (Critical=1, Error=2, Warning=3, Information=4, Verbose=5)
    pub level: u8,
    /// 事件级别名称
    pub level_name: String,
    /// 事件来源/提供者
    pub provider_name: String,
    /// 事件时间戳
    pub timestamp: String,
    /// 事件消息/描述
    pub message: String,
    /// 计算机名称
    pub computer_name: String,
    /// 用户SID
    pub user_sid: Option<String>,
    /// 进程ID
    pub process_id: Option<u32>,
    /// 线程ID
    pub thread_id: Option<u32>,
    /// 任务类别
    pub task_category: Option<String>,
    /// 关键词
    pub keywords: Option<String>,
    /// 原始XML数据
    pub raw_xml: String,
}

/// EVTX解析结果
#[derive(Debug, Serialize, Deserialize)]
pub struct EvtxParseResult {
    /// 文件名
    pub filename: String,
    /// 事件记录列表
    pub events: Vec<EvtxEventRecord>,
    /// 总记录数
    pub total_count: usize,
    /// 解析错误信息
    pub errors: Vec<String>,
}

/// 事件级别转换为名称
fn level_to_name(level: u8) -> String {
    match level {
        1 => "Critical".to_string(),
        2 => "Error".to_string(),
        3 => "Warning".to_string(),
        4 => "Information".to_string(),
        5 => "Verbose".to_string(),
        _ => format!("Unknown({})", level),
    }
}

/// 从XML中提取字段值
fn extract_xml_field(xml: &str, field: &str) -> Option<String> {
    // 简单的XML字段提取，可以根据需要改进
    let start_tag = format!("<{}>", field);
    let end_tag = format!("</{}>", field);

    if let Some(start_pos) = xml.find(&start_tag) {
        let content_start = start_pos + start_tag.len();
        if let Some(end_pos) = xml[content_start..].find(&end_tag) {
            let content = &xml[content_start..content_start + end_pos];
            return Some(content.trim().to_string());
        }
    }
    None
}

/// 从XML中提取属性值
fn extract_xml_attribute(xml: &str, element: &str, attribute: &str) -> Option<String> {
    let pattern = format!("<{} ", element);
    if let Some(start_pos) = xml.find(&pattern) {
        let element_start = start_pos + pattern.len() - 1;
        if let Some(element_end) = xml[element_start..].find('>') {
            let element_content = &xml[element_start..element_start + element_end];
            let attr_pattern = format!("{}=\"", attribute);
            if let Some(attr_start) = element_content.find(&attr_pattern) {
                let value_start = attr_start + attr_pattern.len();
                if let Some(value_end) = element_content[value_start..].find('"') {
                    let value = &element_content[value_start..value_start + value_end];
                    return Some(value.to_string());
                }
            }
        }
    }
    None
}

/// 从EventData中提取消息内容
fn extract_event_data_message(xml: &str) -> Option<String> {
    // 查找EventData部分
    if let Some(event_data_start) = xml.find("<EventData>") {
        if let Some(event_data_end) = xml.find("</EventData>") {
            let event_data_content = &xml[event_data_start..event_data_end + "</EventData>".len()];

            // 提取所有Data元素
            let mut data_parts = Vec::new();
            let mut search_pos = 0;

            while let Some(data_start) = event_data_content[search_pos..].find("<Data") {
                let absolute_start = search_pos + data_start;
                if let Some(data_end) = event_data_content[absolute_start..].find("</Data>") {
                    let data_element = &event_data_content
                        [absolute_start..absolute_start + data_end + "</Data>".len()];

                    // 提取Data元素的内容
                    if let Some(content_start) = data_element.find('>') {
                        if let Some(content_end) = data_element.rfind('<') {
                            let content = &data_element[content_start + 1..content_end];
                            if !content.trim().is_empty() {
                                data_parts.push(content.trim().to_string());
                            }
                        }
                    }

                    search_pos = absolute_start + data_end + "</Data>".len();
                } else {
                    break;
                }
            }

            if !data_parts.is_empty() {
                return Some(data_parts.join(" "));
            }
        }
    }

    None
}

/// 从JSON Value解析事件记录 (用于备用解析方法)
fn parse_event_from_json(
    json_value: &Value,
    timestamp: chrono::DateTime<chrono::Utc>,
) -> Option<EvtxEventRecord> {
    let event = json_value.get("Event")?;
    let system = event.get("System")?;

    // 提取EventID
    let event_id = match system.get("EventID") {
        Some(Value::Number(n)) => n.as_u64().unwrap_or(0) as u32,
        Some(Value::Object(obj)) => obj
            .get("#text")
            .and_then(|v| v.as_str())
            .and_then(|s| s.parse::<u32>().ok())
            .unwrap_or(0),
        Some(Value::String(s)) => s.parse::<u32>().unwrap_or(0),
        _ => 0,
    };

    // 提取Level
    let level = system.get("Level").and_then(|v| v.as_u64()).unwrap_or(4) as u8;

    let level_name = level_to_name(level);

    // 提取Provider Name
    let provider_name = system
        .get("Provider")
        .and_then(|p| {
            if let Some(obj) = p.as_object() {
                obj.get("#attributes")
                    .and_then(|a| a.get("Name"))
                    .and_then(|n| n.as_str())
                    .map(|s| s.to_string())
            } else {
                p.as_str().map(|s| s.to_string())
            }
        })
        .unwrap_or_else(|| "Unknown".to_string());

    // 提取Computer Name
    let computer_name = system
        .get("Computer")
        .and_then(|v| v.as_str())
        .unwrap_or("Unknown")
        .to_string();

    // 格式化时间戳
    let timestamp_str = timestamp.format("%Y-%m-%d %H:%M:%S%.3f UTC").to_string();

    // 提取EventData作为消息
    let message = event
        .get("EventData")
        .map(|ed| {
            if let Some(obj) = ed.as_object() {
                let parts: Vec<String> = obj
                    .iter()
                    .filter_map(|(k, v)| {
                        if k == "#attributes" {
                            return None;
                        }
                        match v {
                            Value::String(s) if !s.is_empty() => Some(format!("{}: {}", k, s)),
                            Value::Number(n) => Some(format!("{}: {}", k, n)),
                            Value::Array(arr) => {
                                let items: Vec<String> = arr
                                    .iter()
                                    .filter_map(|item| {
                                        if let Some(obj) = item.as_object() {
                                            obj.get("#text")
                                                .and_then(|t| t.as_str())
                                                .map(|s| s.to_string())
                                        } else {
                                            item.as_str().map(|s| s.to_string())
                                        }
                                    })
                                    .collect();
                                if !items.is_empty() {
                                    Some(format!("{}: {}", k, items.join(", ")))
                                } else {
                                    None
                                }
                            }
                            _ => None,
                        }
                    })
                    .collect();
                parts.join(" | ")
            } else {
                ed.to_string()
            }
        })
        .unwrap_or_else(|| format!("Event ID: {}", event_id));

    // 提取可选字段
    let user_sid = system
        .get("Security")
        .and_then(|s| s.get("#attributes"))
        .and_then(|a| a.get("UserID"))
        .and_then(|u| u.as_str())
        .map(|s| s.to_string());

    let process_id = system
        .get("Execution")
        .and_then(|e| e.get("#attributes"))
        .and_then(|a| a.get("ProcessID"))
        .and_then(|p| p.as_str())
        .and_then(|s| s.parse::<u32>().ok());

    let thread_id = system
        .get("Execution")
        .and_then(|e| e.get("#attributes"))
        .and_then(|a| a.get("ThreadID"))
        .and_then(|t| t.as_str())
        .and_then(|s| s.parse::<u32>().ok());

    let task_category = system
        .get("Task")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let keywords = system
        .get("Keywords")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    // 将JSON转换为格式化的字符串作为raw_xml
    let raw_xml = serde_json::to_string_pretty(json_value).unwrap_or_default();

    Some(EvtxEventRecord {
        event_id,
        level,
        level_name,
        provider_name,
        timestamp: timestamp_str,
        message,
        computer_name,
        user_sid,
        process_id,
        thread_id,
        task_category,
        keywords,
        raw_xml,
    })
}

/// 使用JSON Value方式解析EVTX文件 (备用方法，更好的兼容性)
fn parse_evtx_file_with_json(file_path: &str) -> Result<EvtxParseResult, String> {
    debug_info!("🔄 使用JSON Value方式解析EVTX文件...");

    let filename = Path::new(file_path)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("unknown.evtx")
        .to_string();

    // 配置解析器设置
    let settings = ParserSettings::default().separate_json_attributes(true);

    // 首先尝试从文件直接解析
    if let Ok(parser) = EvtxParser::from_path(file_path) {
        let mut parser = parser.with_configuration(settings.clone());
        let result = parse_records_json_value(&mut parser, &filename);
        if let Ok(ref r) = result {
            if r.total_count > 0 {
                return result;
            }
        }
        debug_info!("⚠️ 文件直接解析失败或无结果，尝试从内存读取...");
    }

    // 备用方法：从内存读取
    match std::fs::read(file_path) {
        Ok(data) => {
            match EvtxParser::from_buffer(data.clone()) {
                Ok(parser) => {
                    let mut parser = parser.with_configuration(settings);
                    parse_records_json_value(&mut parser, &filename)
                }
                Err(e) => {
                    debug_info!("⚠️ 标准解析器创建失败: {}", e);
                    // 尝试使用更底层的 chunk 解析方法
                    parse_evtx_chunks_directly(&data, &filename)
                }
            }
        }
        Err(io_err) => Err(format!("无法读取文件: {}", io_err)),
    }
}

/// 直接解析EVTX chunks (最底层的方法，跳过有问题的chunks)
/// 支持文件头被清零的情况（常见于内存提取的EVTX文件）
fn parse_evtx_chunks_directly(data: &[u8], filename: &str) -> Result<EvtxParseResult, String> {
    debug_info!("🔧 尝试直接解析EVTX chunks...");

    // EVTX文件头是4096字节
    const EVTX_HEADER_SIZE: usize = 4096;
    const EVTX_CHUNK_SIZE: usize = 65536; // 64KB

    // 验证文件头签名 "ElfFile\0"
    if data.len() < EVTX_HEADER_SIZE {
        return Err("EVTX文件太小，无法包含有效的文件头".to_string());
    }

    let signature = &data[0..8];
    let header_valid = signature == b"ElfFile\0";

    if header_valid {
        debug_info!("✅ EVTX文件签名验证通过");
    } else if signature == &[0u8; 8] {
        debug_info!("⚠️ EVTX文件头被清零（可能是从内存提取的文件），尝试直接解析chunks...");
    } else {
        debug_info!(
            "⚠️ EVTX文件签名无效: {:?}，尝试搜索有效的chunks...",
            signature
        );
    }

    let mut events = Vec::new();
    let mut errors = Vec::new();
    let mut chunk_count = 0;
    let mut success_chunk_count = 0;

    // 配置解析器设置
    let settings = Arc::new(ParserSettings::default().separate_json_attributes(true));

    // 搜索所有可能的chunk位置
    // 首先尝试标准位置（文件头之后，每64KB一个chunk）
    let mut offset = EVTX_HEADER_SIZE;

    // 同时也搜索整个文件中的 "ElfChnk\0" 签名
    let chunk_signature = b"ElfChnk\0";
    let mut found_chunks: Vec<usize> = Vec::new();

    // 先收集所有chunk的位置
    while offset + 8 <= data.len() {
        if &data[offset..offset + 8] == chunk_signature {
            found_chunks.push(offset);
            offset += EVTX_CHUNK_SIZE; // 跳到下一个可能的chunk位置
        } else {
            offset += 1; // 逐字节搜索
        }

        // 限制搜索范围，避免无限循环
        if found_chunks.len() > 10000 {
            break;
        }
    }

    debug_info!("📊 发现 {} 个可能的EVTX chunks", found_chunks.len());

    if found_chunks.is_empty() {
        return Err("在文件中未找到任何有效的EVTX chunk签名".to_string());
    }

    // 解析每个找到的chunk
    for chunk_offset in found_chunks {
        chunk_count += 1;

        // 确定chunk的实际大小（可能是64KB或更小，取决于剩余数据）
        let chunk_end = std::cmp::min(chunk_offset + EVTX_CHUNK_SIZE, data.len());
        let chunk_data = &data[chunk_offset..chunk_end];

        if chunk_data.len() < 512 {
            // chunk太小，跳过
            continue;
        }

        // 尝试解析这个chunk
        match EvtxChunkData::new(chunk_data.to_vec(), true) {
            Ok(mut chunk) => {
                match chunk.parse(settings.clone()) {
                    Ok(mut parsed_chunk) => {
                        success_chunk_count += 1;

                        // 遍历chunk中的记录
                        for record_result in parsed_chunk.iter() {
                            match record_result {
                                Ok(record) => match record.into_json_value() {
                                    Ok(json_record) => {
                                        if let Some(event) = parse_event_from_json(
                                            &json_record.data,
                                            json_record.timestamp,
                                        ) {
                                            events.push(event);
                                        }
                                    }
                                    Err(e) => {
                                        if errors.len() < 10 {
                                            errors.push(format!(
                                                "Chunk {}: 记录序列化失败: {}",
                                                chunk_count, e
                                            ));
                                        }
                                    }
                                },
                                Err(e) => {
                                    if errors.len() < 10 {
                                        errors.push(format!(
                                            "Chunk {}: 记录解析失败: {}",
                                            chunk_count, e
                                        ));
                                    }
                                }
                            }
                        }

                        // 每处理一些chunks输出进度
                        if success_chunk_count % 10 == 0 {
                            debug_info!(
                                "📈 已成功解析 {} 个chunks，{} 个事件",
                                success_chunk_count,
                                events.len()
                            );
                        }
                    }
                    Err(e) => {
                        if errors.len() < 10 {
                            errors.push(format!("Chunk {} 解析失败: {}", chunk_count, e));
                        }
                    }
                }
            }
            Err(e) => {
                if errors.len() < 10 {
                    errors.push(format!("Chunk {} 数据创建失败: {}", chunk_count, e));
                }
            }
        }

        // 限制事件数量
        if events.len() > 100000 {
            debug_info!("⚠️ 事件数量达到上限 (100,000), 停止解析");
            break;
        }
    }

    let total_count = events.len();
    debug_info!(
        "✅ Chunk直接解析完成: {} 个chunks, {} 个成功, {} 个事件, {} 个错误",
        chunk_count,
        success_chunk_count,
        total_count,
        errors.len()
    );

    if total_count == 0 {
        return Err(format!(
            "无法从EVTX文件中解析出任何事件。共处理 {} 个chunks，成功 {} 个。{}",
            chunk_count,
            success_chunk_count,
            if !errors.is_empty() {
                format!("首个错误: {}", errors[0])
            } else {
                "".to_string()
            }
        ));
    }

    Ok(EvtxParseResult {
        filename: filename.to_string(),
        events,
        total_count,
        errors,
    })
}

/// 通用的JSON Value记录解析函数
fn parse_records_json_value<R: std::io::Read + std::io::Seek>(
    parser: &mut EvtxParser<R>,
    filename: &str,
) -> Result<EvtxParseResult, String> {
    let mut events = Vec::new();
    let mut errors = Vec::new();
    let mut record_count = 0;
    let mut success_count = 0;

    debug_info!("📊 开始使用JSON Value方式解析事件记录...");

    // 使用 records_json_value 方法 - 这个方法通常更稳定
    for record_result in parser.records_json_value() {
        record_count += 1;

        if record_count % 1000 == 0 {
            debug_info!(
                "📈 已处理 {} 条记录，成功解析 {} 条",
                record_count,
                success_count
            );
        }

        match record_result {
            Ok(record) => {
                if let Some(event) = parse_event_from_json(&record.data, record.timestamp) {
                    events.push(event);
                    success_count += 1;
                }
            }
            Err(e) => {
                if errors.len() < 10 {
                    errors.push(format!("记录 #{} 解析失败: {}", record_count, e));
                }
            }
        }

        if events.len() > 100000 {
            debug_info!("⚠️ 事件数量达到上限 (100,000), 停止解析");
            break;
        }
    }

    let total_count = events.len();
    debug_info!(
        "✅ JSON Value解析完成: {} 条记录，成功 {} 条",
        record_count,
        total_count
    );

    if total_count == 0 && !errors.is_empty() {
        return Err(format!(
            "无法解析事件记录: {}",
            errors.first().unwrap_or(&"未知错误".to_string())
        ));
    }

    Ok(EvtxParseResult {
        filename: filename.to_string(),
        events,
        total_count,
        errors,
    })
}

/// 解析EVTX文件
pub fn parse_evtx_file(file_path: &str) -> Result<EvtxParseResult, String> {
    debug_info!("🔍 开始解析EVTX文件: {}", file_path);

    // 检查文件是否存在
    if !Path::new(file_path).exists() {
        return Err(format!("EVTX文件不存在: {}", file_path));
    }

    // 检查文件大小
    let file_metadata =
        std::fs::metadata(file_path).map_err(|e| format!("无法读取文件信息: {}", e))?;

    if file_metadata.len() == 0 {
        return Err("EVTX文件为空".to_string());
    }

    if file_metadata.len() < 4096 {
        return Err("EVTX文件太小，可能已损坏".to_string());
    }

    debug_info!("📁 文件大小: {} 字节", file_metadata.len());

    // 获取文件名
    let filename = Path::new(file_path)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("unknown.evtx")
        .to_string();

    // 配置解析器设置，增加容错能力
    let settings = ParserSettings::default()
        .num_threads(4) // 使用多线程加速解析
        .separate_json_attributes(true); // 分离JSON属性以获得更好的兼容性

    // 首先尝试从文件直接解析
    debug_info!("🔧 创建EVTX解析器...");
    match EvtxParser::from_path(file_path) {
        Ok(parser) => {
            debug_info!("✅ EVTX解析器创建成功");
            let mut parser = parser.with_configuration(settings.clone());

            match parse_records_xml(&mut parser, &filename) {
                Ok(result) if result.total_count > 0 => return Ok(result),
                Ok(_) | Err(_) => {
                    debug_info!("⚠️ 标准XML解析失败或无结果，尝试JSON Value方法...");
                }
            }
        }
        Err(e) => {
            let error_msg = format!("{}", e);
            debug_info!("⚠️ 创建解析器失败: {}", error_msg);

            // 如果不是反序列化错误，提供更具体的错误信息并返回
            if !error_msg.contains("deserialize") {
                let detailed_error = if error_msg.contains("Invalid signature") {
                    "文件不是有效的EVTX格式，可能文件已损坏或不是Windows事件日志文件"
                } else if error_msg.contains("Permission denied") {
                    "文件访问被拒绝，请检查文件权限"
                } else if error_msg.contains("No such file") {
                    "文件不存在或路径无效"
                } else {
                    "EVTX文件格式错误或不受支持"
                };
                return Err(format!("{}: {}", detailed_error, e));
            }
        }
    }

    // 尝试从内存缓冲区解析
    debug_info!("🔄 尝试从内存缓冲区解析...");
    match std::fs::read(file_path) {
        Ok(file_data) => match EvtxParser::from_buffer(file_data) {
            Ok(parser) => {
                debug_info!("✅ 使用内存缓冲区方式创建解析器成功");
                let mut parser = parser.with_configuration(settings);

                match parse_records_xml(&mut parser, &filename) {
                    Ok(result) if result.total_count > 0 => return Ok(result),
                    Ok(_) | Err(_) => {
                        debug_info!("⚠️ 内存缓冲区XML解析也失败，尝试JSON Value方法...");
                    }
                }
            }
            Err(e2) => {
                debug_info!("⚠️ 内存缓冲区解析器创建失败: {}", e2);
            }
        },
        Err(io_err) => {
            return Err(format!("无法读取EVTX文件: {}", io_err));
        }
    }

    // 最后尝试使用JSON Value备用方法
    debug_info!("🔄 使用JSON Value备用解析方法...");
    parse_evtx_file_with_json(file_path)
}

/// 通用的XML记录解析函数
fn parse_records_xml<R: std::io::Read + std::io::Seek>(
    parser: &mut EvtxParser<R>,
    filename: &str,
) -> Result<EvtxParseResult, String> {
    let mut events = Vec::new();
    let mut errors = Vec::new();
    let mut record_count = 0;
    let mut success_count = 0;
    let mut deserialize_error_count = 0;

    debug_info!("📊 开始解析事件记录...");

    // 使用标准的 records() 方法
    for record_result in parser.records() {
        record_count += 1;

        // 每处理1000条记录输出一次进度
        if record_count % 1000 == 0 {
            debug_info!(
                "📈 已处理 {} 条记录，成功解析 {} 条",
                record_count,
                success_count
            );
        }

        match record_result {
            Ok(record) => {
                match parse_event_record(record) {
                    Ok(event) => {
                        events.push(event);
                        success_count += 1;
                    }
                    Err(e) => {
                        // 只在前10个错误时记录详细信息，避免日志过多
                        if errors.len() < 10 {
                            errors.push(format!("解析事件记录 #{} 失败: {}", record_count, e));
                        }

                        // 如果错误太多，可能整个文件都有问题
                        if errors.len() > 1000 {
                            debug_info!("⚠️ 错误数量过多 ({}), 停止解析", errors.len());
                            break;
                        }
                    }
                }
            }
            Err(e) => {
                let error_str = e.to_string();

                // 检测反序列化错误 - 这类错误在新版本Windows上常见
                if error_str.contains("deserialize") || error_str.contains("Deserialization") {
                    deserialize_error_count += 1;
                    // 对于反序列化错误，只记录计数，不记录每个错误
                    if deserialize_error_count == 1 {
                        debug_info!("⚠️ 检测到反序列化错误，尝试继续解析其他记录...");
                    }
                } else {
                    if errors.len() < 10 {
                        errors.push(format!(
                            "读取事件记录 #{} 失败: {}",
                            record_count, error_str
                        ));
                    }
                }

                // 如果连续读取失败太多次，可能文件严重损坏
                if errors.len() > 1000 && deserialize_error_count == 0 {
                    debug_info!("⚠️ 读取错误过多 ({}), 停止解析", errors.len());
                    break;
                }
            }
        }

        // 防止内存占用过多，限制最大事件数量
        if events.len() > 100000 {
            debug_info!("⚠️ 事件数量达到上限 (100,000), 停止解析");
            errors.push("事件数量过多，已截断显示".to_string());
            break;
        }
    }

    // 如果有大量反序列化错误，添加一条汇总信息
    if deserialize_error_count > 0 {
        debug_info!(
            "ℹ️ 共有 {} 条记录因反序列化问题被跳过",
            deserialize_error_count
        );
        if deserialize_error_count > 10 {
            errors.push(format!(
                "有 {} 条记录因格式兼容性问题被跳过（可能是较新的Windows版本）",
                deserialize_error_count
            ));
        }
    }

    let total_count = events.len();
    debug_info!(
        "✅ EVTX解析完成: 处理了 {} 条记录，成功解析 {} 个事件，{} 个错误，{} 条反序列化跳过",
        record_count,
        total_count,
        errors.len(),
        deserialize_error_count
    );

    Ok(EvtxParseResult {
        filename: filename.to_string(),
        events,
        total_count,
        errors,
    })
}

/// 解析单个事件记录
fn parse_event_record(record: SerializedEvtxRecord<String>) -> Result<EvtxEventRecord, String> {
    let xml_string = record.data.clone();

    // 验证XML数据不为空
    if xml_string.trim().is_empty() {
        return Err("事件记录XML数据为空".to_string());
    }

    // 验证这是一个有效的事件XML
    if !xml_string.contains("<Event") {
        return Err("无效的事件XML格式".to_string());
    }

    // 直接从XML字符串中提取信息，使用更安全的解析
    let event_id = extract_xml_field(&xml_string, "EventID")
        .and_then(|s| {
            s.trim()
                .parse::<u32>()
                .map_err(|e| {
                    debug_info!("⚠️ 解析EventID失败: '{}', 错误: {}", s, e);
                    e
                })
                .ok()
        })
        .unwrap_or(0);

    let level = extract_xml_field(&xml_string, "Level")
        .and_then(|s| {
            s.trim()
                .parse::<u8>()
                .map_err(|e| {
                    debug_info!("⚠️ 解析Level失败: '{}', 错误: {}", s, e);
                    e
                })
                .ok()
        })
        .unwrap_or(4);

    let level_name = level_to_name(level);

    let provider_name =
        extract_xml_attribute(&xml_string, "Provider", "Name").unwrap_or_else(|| {
            // 尝试从其他位置提取Provider信息
            extract_xml_field(&xml_string, "Provider").unwrap_or_else(|| "Unknown".to_string())
        });

    let timestamp =
        extract_xml_attribute(&xml_string, "TimeCreated", "SystemTime").unwrap_or_else(|| {
            // 尝试其他时间戳格式
            extract_xml_field(&xml_string, "TimeCreated").unwrap_or_else(|| "".to_string())
        });

    let computer_name =
        extract_xml_field(&xml_string, "Computer").unwrap_or_else(|| "Unknown".to_string());

    // 提取消息内容 - 从EventData中提取，提供更好的回退机制
    let message = extract_event_data_message(&xml_string)
        .or_else(|| {
            // 尝试从其他位置提取消息
            extract_xml_field(&xml_string, "Message")
        })
        .or_else(|| {
            // 尝试从Data字段提取
            extract_xml_field(&xml_string, "Data")
        })
        .unwrap_or_else(|| {
            if event_id > 0 {
                format!("Event ID: {}", event_id)
            } else {
                "No message available".to_string()
            }
        });

    // 提取其他可选字段，使用更安全的解析
    let user_sid = extract_xml_attribute(&xml_string, "Security", "UserID")
        .or_else(|| extract_xml_field(&xml_string, "UserID"));

    let process_id = extract_xml_attribute(&xml_string, "Execution", "ProcessID").and_then(|s| {
        s.trim()
            .parse::<u32>()
            .map_err(|e| {
                debug_info!("⚠️ 解析ProcessID失败: '{}', 错误: {}", s, e);
                e
            })
            .ok()
    });

    let thread_id = extract_xml_attribute(&xml_string, "Execution", "ThreadID").and_then(|s| {
        s.trim()
            .parse::<u32>()
            .map_err(|e| {
                debug_info!("⚠️ 解析ThreadID失败: '{}', 错误: {}", s, e);
                e
            })
            .ok()
    });

    let task_category = extract_xml_field(&xml_string, "Task")
        .or_else(|| extract_xml_field(&xml_string, "TaskCategory"));

    let keywords = extract_xml_field(&xml_string, "Keywords")
        .or_else(|| extract_xml_attribute(&xml_string, "Keywords", "value"));

    // 创建事件记录
    let event_record = EvtxEventRecord {
        event_id,
        level,
        level_name,
        provider_name,
        timestamp,
        message,
        computer_name,
        user_sid,
        process_id,
        thread_id,
        task_category,
        keywords,
        raw_xml: xml_string,
    };

    Ok(event_record)
}

/// Tauri命令：解析EVTX文件
#[tauri::command]
pub async fn parse_evtx_file_command(file_path: String) -> Result<EvtxParseResult, String> {
    crate::integrity_check!();

    debug_info!("🔍 收到EVTX解析请求: {}", file_path);

    // 使用 spawn_blocking 避免阻塞异步运行时
    let result = tokio::task::spawn_blocking(move || parse_evtx_file(&file_path)).await;

    match result {
        Ok(parse_result) => match parse_result {
            Ok(evtx_data) => {
                debug_info!("✅ EVTX文件解析成功: {} 个事件", evtx_data.total_count);
                Ok(evtx_data)
            }
            Err(e) => {
                debug_info!("❌ EVTX文件解析失败: {}", e);
                Err(e)
            }
        },
        Err(join_error) => {
            debug_info!("❌ 异步任务执行失败: {}", join_error);
            Err(format!("异步任务执行失败: {}", join_error))
        }
    }
}

/// EVTX文件信息
#[derive(Debug, Serialize, Deserialize)]
pub struct EvtxFileInfo {
    /// 文件名
    pub name: String,
    /// 文件完整路径
    pub path: String,
    /// 文件大小（字节）
    pub size: u64,
    /// 修改时间
    pub modified: String,
}

/// Tauri命令：列出EVTX文件（自动从挂载盘的 misc\eventlog 复制到 output_path/logs 目录）
#[tauri::command]
pub async fn list_evtx_files() -> Result<Vec<EvtxFileInfo>, String> {
    debug_info!("📂 搜索并复制EVTX文件...");

    // 从设置中读取 output_path
    let settings = load_settings().map_err(|e| format!("加载设置失败: {}", e))?;
    let output_path = if settings.output_path.is_empty() {
        "output".to_string()
    } else {
        settings.output_path.clone()
    };

    // 源目录：{挂载盘符}:\misc\eventlog
    let source_dir_str = format!("{}misc\\eventlog", crate::settings::mount_root());
    let source_dir = Path::new(&source_dir_str);
    // 目标目录：{output_path}/logs
    let output_dir = Path::new(&output_path).join("logs");

    debug_info!("📁 输出路径: {:?}", output_dir);

    // 确保目标目录存在
    if !output_dir.exists() {
        if let Err(e) = std::fs::create_dir_all(&output_dir) {
            debug_info!("⚠️ 创建输出目录失败: {}", e);
        }
    }

    // 如果源目录存在，复制所有 EVTX 文件到目标目录
    if source_dir.exists() && source_dir.is_dir() {
        debug_info!("📁 发现源目录: {:?}", source_dir);
        if let Ok(entries) = std::fs::read_dir(source_dir) {
            for entry in entries.flatten() {
                let src_path = entry.path();
                if src_path.is_file() {
                    if let Some(ext) = src_path.extension() {
                        if ext.to_string_lossy().to_lowercase() == "evtx" {
                            // 复制文件到目标目录
                            if let Some(file_name) = src_path.file_name() {
                                let dest_path = output_dir.join(file_name);
                                // 只在目标文件不存在或源文件更新时复制
                                let should_copy = if dest_path.exists() {
                                    match (
                                        std::fs::metadata(&src_path),
                                        std::fs::metadata(&dest_path),
                                    ) {
                                        (Ok(src_meta), Ok(dest_meta)) => {
                                            src_meta.len() != dest_meta.len()
                                                || src_meta.modified().ok()
                                                    > dest_meta.modified().ok()
                                        }
                                        _ => true,
                                    }
                                } else {
                                    true
                                };

                                if should_copy {
                                    match std::fs::copy(&src_path, &dest_path) {
                                        Ok(_) => (),
                                        Err(e) => {
                                            debug_info!(
                                                "⚠️ 复制文件失败: {:?}, 错误: {}",
                                                src_path,
                                                e
                                            );
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    } else {
        debug_info!("⚠️ 源目录不存在: {:?}", source_dir);
    }

    // 读取目标目录中的所有 EVTX 文件
    let mut evtx_files = Vec::new();

    if output_dir.exists() && output_dir.is_dir() {
        if let Ok(entries) = std::fs::read_dir(&output_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    if let Some(ext) = path.extension() {
                        if ext.to_string_lossy().to_lowercase() == "evtx" {
                            if let Ok(metadata) = std::fs::metadata(&path) {
                                let modified = metadata
                                    .modified()
                                    .map(|t| {
                                        let datetime: chrono::DateTime<chrono::Local> = t.into();
                                        datetime.format("%Y-%m-%d %H:%M:%S").to_string()
                                    })
                                    .unwrap_or_default();

                                evtx_files.push(EvtxFileInfo {
                                    name: path
                                        .file_name()
                                        .map(|n| n.to_string_lossy().to_string())
                                        .unwrap_or_default(),
                                    path: path.to_string_lossy().to_string(),
                                    size: metadata.len(),
                                    modified,
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    // 按文件名排序
    evtx_files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    debug_info!("✅ 找到 {} 个EVTX文件", evtx_files.len());

    Ok(evtx_files)
}
