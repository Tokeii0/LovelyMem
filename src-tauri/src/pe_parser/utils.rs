//! PE解析辅助函数

use super::types::*;

/// 将机器类型转换为可读字符串
pub fn machine_type_to_string(machine: u16) -> String {
    match machine {
        0x0 => "Unknown".to_string(),
        0x14c => "i386 (x86)".to_string(),
        0x8664 => "AMD64 (x64)".to_string(),
        0x1c0 => "ARM".to_string(),
        0xaa64 => "ARM64".to_string(),
        0x1c4 => "ARMv7 Thumb".to_string(),
        0x200 => "Intel Itanium".to_string(),
        _ => format!("Unknown (0x{:X})", machine),
    }
}

/// 将子系统类型转换为可读字符串
pub fn subsystem_to_string(subsystem: u16) -> String {
    match subsystem {
        0 => "Unknown".to_string(),
        1 => "Native".to_string(),
        2 => "Windows GUI".to_string(),
        3 => "Windows Console".to_string(),
        5 => "OS/2 Console".to_string(),
        7 => "POSIX Console".to_string(),
        9 => "Windows CE".to_string(),
        10 => "EFI Application".to_string(),
        11 => "EFI Boot Service Driver".to_string(),
        12 => "EFI Runtime Driver".to_string(),
        13 => "EFI ROM".to_string(),
        14 => "Xbox".to_string(),
        16 => "Windows Boot Application".to_string(),
        _ => format!("Unknown ({})", subsystem),
    }
}

/// 将节特性标志转换为描述列表
pub fn section_characteristics_to_desc(characteristics: u32) -> Vec<String> {
    let mut desc = Vec::new();

    if characteristics & 0x00000020 != 0 {
        desc.push("CODE".to_string());
    }
    if characteristics & 0x00000040 != 0 {
        desc.push("INITIALIZED_DATA".to_string());
    }
    if characteristics & 0x00000080 != 0 {
        desc.push("UNINITIALIZED_DATA".to_string());
    }
    if characteristics & 0x02000000 != 0 {
        desc.push("DISCARDABLE".to_string());
    }
    if characteristics & 0x04000000 != 0 {
        desc.push("NOT_CACHED".to_string());
    }
    if characteristics & 0x08000000 != 0 {
        desc.push("NOT_PAGED".to_string());
    }
    if characteristics & 0x10000000 != 0 {
        desc.push("SHARED".to_string());
    }
    if characteristics & 0x20000000 != 0 {
        desc.push("EXECUTE".to_string());
    }
    if characteristics & 0x40000000 != 0 {
        desc.push("READ".to_string());
    }
    if characteristics & 0x80000000 != 0 {
        desc.push("WRITE".to_string());
    }

    desc
}

/// 将COFF特性标志转换为描述列表
pub fn coff_characteristics_to_desc(characteristics: u16) -> Vec<String> {
    let mut desc = Vec::new();

    if characteristics & 0x0001 != 0 {
        desc.push("RELOCS_STRIPPED".to_string());
    }
    if characteristics & 0x0002 != 0 {
        desc.push("EXECUTABLE_IMAGE".to_string());
    }
    if characteristics & 0x0004 != 0 {
        desc.push("LINE_NUMS_STRIPPED".to_string());
    }
    if characteristics & 0x0008 != 0 {
        desc.push("LOCAL_SYMS_STRIPPED".to_string());
    }
    if characteristics & 0x0010 != 0 {
        desc.push("AGGRESSIVE_WS_TRIM".to_string());
    }
    if characteristics & 0x0020 != 0 {
        desc.push("LARGE_ADDRESS_AWARE".to_string());
    }
    if characteristics & 0x0080 != 0 {
        desc.push("BYTES_REVERSED_LO".to_string());
    }
    if characteristics & 0x0100 != 0 {
        desc.push("32BIT_MACHINE".to_string());
    }
    if characteristics & 0x0200 != 0 {
        desc.push("DEBUG_STRIPPED".to_string());
    }
    if characteristics & 0x0400 != 0 {
        desc.push("REMOVABLE_RUN_FROM_SWAP".to_string());
    }
    if characteristics & 0x0800 != 0 {
        desc.push("NET_RUN_FROM_SWAP".to_string());
    }
    if characteristics & 0x1000 != 0 {
        desc.push("SYSTEM".to_string());
    }
    if characteristics & 0x2000 != 0 {
        desc.push("DLL".to_string());
    }
    if characteristics & 0x4000 != 0 {
        desc.push("UP_SYSTEM_ONLY".to_string());
    }
    if characteristics & 0x8000 != 0 {
        desc.push("BYTES_REVERSED_HI".to_string());
    }

    desc
}

/// 解析DLL特性并返回安全特性结构
pub fn parse_dll_characteristics(dll_characteristics: u16) -> SecurityFeatures {
    let mut features_list = Vec::new();

    let high_entropy_va = dll_characteristics & 0x0020 != 0;
    let aslr = dll_characteristics & 0x0040 != 0;
    let force_integrity = dll_characteristics & 0x0080 != 0;
    let dep = dll_characteristics & 0x0100 != 0;
    let no_isolation = dll_characteristics & 0x0200 != 0;
    let no_seh = dll_characteristics & 0x0400 != 0;
    let no_bind = dll_characteristics & 0x0800 != 0;
    let app_container = dll_characteristics & 0x1000 != 0;
    let wdm_driver = dll_characteristics & 0x2000 != 0;
    let cfg = dll_characteristics & 0x4000 != 0;
    let terminal_server_aware = dll_characteristics & 0x8000 != 0;

    if high_entropy_va {
        features_list.push("HIGH_ENTROPY_VA".to_string());
    }
    if aslr {
        features_list.push("DYNAMIC_BASE (ASLR)".to_string());
    }
    if force_integrity {
        features_list.push("FORCE_INTEGRITY".to_string());
    }
    if dep {
        features_list.push("NX_COMPAT (DEP)".to_string());
    }
    if no_isolation {
        features_list.push("NO_ISOLATION".to_string());
    }
    if no_seh {
        features_list.push("NO_SEH".to_string());
    }
    if no_bind {
        features_list.push("NO_BIND".to_string());
    }
    if app_container {
        features_list.push("APPCONTAINER".to_string());
    }
    if wdm_driver {
        features_list.push("WDM_DRIVER".to_string());
    }
    if cfg {
        features_list.push("GUARD_CF (CFG)".to_string());
    }
    if terminal_server_aware {
        features_list.push("TERMINAL_SERVER_AWARE".to_string());
    }

    SecurityFeatures {
        aslr,
        dep,
        seh: !no_seh,
        cfg,
        high_entropy_va,
        force_integrity,
        app_container,
        terminal_server_aware,
        features_list,
        dll_characteristics: format!("0x{:04X}", dll_characteristics),
    }
}

/// 获取数据目录名称
pub fn get_data_directory_name(index: usize) -> &'static str {
    match index {
        0 => "Export Table",
        1 => "Import Table",
        2 => "Resource Table",
        3 => "Exception Table",
        4 => "Certificate Table",
        5 => "Base Relocation Table",
        6 => "Debug",
        7 => "Architecture",
        8 => "Global Ptr",
        9 => "TLS Table",
        10 => "Load Config Table",
        11 => "Bound Import",
        12 => "IAT",
        13 => "Delay Import Descriptor",
        14 => "CLR Runtime Header",
        15 => "Reserved",
        _ => "Unknown",
    }
}

/// 将时间戳转换为可读日期
pub fn timestamp_to_string(timestamp: u32) -> String {
    use chrono::{TimeZone, Utc};

    if timestamp == 0 {
        return "N/A".to_string();
    }

    match Utc.timestamp_opt(timestamp as i64, 0) {
        chrono::LocalResult::Single(dt) => dt.format("%Y-%m-%d %H:%M:%S UTC").to_string(),
        _ => format!("0x{:08X}", timestamp),
    }
}

/// 计算数据的熵值
pub fn calculate_entropy(data: &[u8]) -> f64 {
    if data.is_empty() {
        return 0.0;
    }

    let mut freq = [0u64; 256];
    for &byte in data {
        freq[byte as usize] += 1;
    }

    let len = data.len() as f64;
    let mut entropy = 0.0;

    for &count in &freq {
        if count > 0 {
            let p = count as f64 / len;
            entropy -= p * p.log2();
        }
    }

    entropy
}

/// 计算文件哈希
pub fn calculate_file_hashes(data: &[u8]) -> FileHashes {
    use sha1::Digest as Sha1Digest;

    let md5_result = md5::compute(data);
    let md5 = format!("{:x}", md5_result);

    let mut sha1_hasher = sha1::Sha1::new();
    sha1_hasher.update(data);
    let sha1_result = sha1_hasher.finalize();
    let sha1 = format!("{:x}", sha1_result);

    let mut sha256_hasher = sha2::Sha256::new();
    sha256_hasher.update(data);
    let sha256_result = sha256_hasher.finalize();
    let sha256 = format!("{:x}", sha256_result);

    FileHashes { md5, sha1, sha256 }
}

/// 获取调试类型名称
pub fn get_debug_type_name(debug_type: u32) -> &'static str {
    match debug_type {
        0 => "Unknown",
        1 => "COFF",
        2 => "CodeView",
        3 => "FPO",
        4 => "Misc",
        5 => "Exception",
        6 => "Fixup",
        7 => "OMAP_TO_SRC",
        8 => "OMAP_FROM_SRC",
        9 => "Borland",
        10 => "Reserved10",
        11 => "CLSID",
        12 => "VC_FEATURE",
        13 => "POGO",
        14 => "ILTCG",
        15 => "MPX",
        16 => "Repro",
        17 => "Embedded Portable PDB",
        19 => "SPGO",
        20 => "PDB Hash",
        21 => "EX_DLLCHARACTERISTICS",
        _ => "Unknown",
    }
}
