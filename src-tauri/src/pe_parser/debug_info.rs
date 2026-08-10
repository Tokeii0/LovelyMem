//! 调试信息解析模块

use super::types::{DebugEntry, DebugInfo};
use super::utils::{get_debug_type_name, timestamp_to_string};
use goblin::pe::PE;

/// 解析调试信息
pub fn parse_debug_info(pe: &PE, file_data: &[u8]) -> DebugInfo {
    let mut info = DebugInfo::default();

    // 检查是否有调试数据
    if let Some(debug_data) = &pe.debug_data {
        info.has_debug = true;

        // 解析调试目录
        let image_debug_directory = &debug_data.image_debug_directory;
        let debug_type = image_debug_directory.data_type;
        info.debug_type = get_debug_type_name(debug_type).to_string();
        info.timestamp = Some(timestamp_to_string(image_debug_directory.time_date_stamp));

        info.debug_entries.push(DebugEntry {
            debug_type: get_debug_type_name(debug_type).to_string(),
            size: image_debug_directory.size_of_data,
            rva: format!("0x{:08X}", image_debug_directory.address_of_raw_data),
            pointer_to_raw_data: image_debug_directory.pointer_to_raw_data,
        });

        // 如果是 CodeView 类型，尝试提取 PDB 信息
        if debug_type == 2 {
            let raw_data_offset = image_debug_directory.pointer_to_raw_data as usize;
            let raw_data_size = image_debug_directory.size_of_data as usize;

            if raw_data_offset > 0 && raw_data_offset + raw_data_size <= file_data.len() {
                let debug_raw = &file_data[raw_data_offset..raw_data_offset + raw_data_size];
                parse_codeview_info(debug_raw, &mut info);
            }
        }

        // PDB 7.0 格式
        if let Some(pdb70) = &debug_data.codeview_pdb70_debug_info {
            info.pdb_guid = Some(format_guid(&pdb70.signature));
            info.pdb_age = Some(pdb70.age);

            // 提取 PDB 路径
            let pdb_path = String::from_utf8_lossy(&pdb70.filename)
                .trim_end_matches('\0')
                .to_string();
            if !pdb_path.is_empty() {
                info.pdb_path = Some(pdb_path);
            }
        }
    }

    info
}

/// 格式化 GUID
fn format_guid(guid: &[u8; 16]) -> String {
    format!(
        "{:08X}-{:04X}-{:04X}-{:02X}{:02X}-{:02X}{:02X}{:02X}{:02X}{:02X}{:02X}",
        u32::from_le_bytes([guid[0], guid[1], guid[2], guid[3]]),
        u16::from_le_bytes([guid[4], guid[5]]),
        u16::from_le_bytes([guid[6], guid[7]]),
        guid[8],
        guid[9],
        guid[10],
        guid[11],
        guid[12],
        guid[13],
        guid[14],
        guid[15]
    )
}

/// 解析 CodeView 信息
fn parse_codeview_info(data: &[u8], info: &mut DebugInfo) {
    if data.len() < 4 {
        return;
    }

    // 检查签名
    let signature = &data[0..4];

    // RSDS (PDB 7.0)
    if signature == b"RSDS" && data.len() >= 24 {
        let guid_bytes: [u8; 16] = data[4..20].try_into().unwrap_or([0u8; 16]);
        info.pdb_guid = Some(format_guid(&guid_bytes));

        let age = u32::from_le_bytes(data[20..24].try_into().unwrap_or([0u8; 4]));
        info.pdb_age = Some(age);

        // PDB 路径从偏移 24 开始
        if data.len() > 24 {
            let pdb_path = String::from_utf8_lossy(&data[24..])
                .trim_end_matches('\0')
                .to_string();
            if !pdb_path.is_empty() {
                info.pdb_path = Some(pdb_path);
            }
        }
    }
    // NB10 (PDB 2.0)
    else if signature == b"NB10" && data.len() >= 16 {
        let age = u32::from_le_bytes(data[8..12].try_into().unwrap_or([0u8; 4]));
        info.pdb_age = Some(age);

        // PDB 路径从偏移 16 开始
        if data.len() > 16 {
            let pdb_path = String::from_utf8_lossy(&data[16..])
                .trim_end_matches('\0')
                .to_string();
            if !pdb_path.is_empty() {
                info.pdb_path = Some(pdb_path);
            }
        }
    }
}
