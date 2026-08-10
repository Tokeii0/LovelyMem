//! Rich头分析模块
//! Rich头包含编译器和链接器信息，可用于识别构建工具链

use super::types::{RichHeaderEntry, RichHeaderInfo};

/// 解析Rich头
pub fn parse_rich_header(data: &[u8]) -> RichHeaderInfo {
    let mut info = RichHeaderInfo::default();

    // Rich头位于DOS stub之后，PE签名之前
    // 查找 "Rich" 签名 (52 69 63 68)
    let rich_sig: [u8; 4] = [0x52, 0x69, 0x63, 0x68]; // "Rich"

    let mut rich_offset = None;
    for i in 0x40..data.len().saturating_sub(4) {
        if data[i..i + 4] == rich_sig {
            rich_offset = Some(i);
            break;
        }
    }

    let rich_offset = match rich_offset {
        Some(o) => o,
        None => return info,
    };

    // Rich签名后面是XOR密钥
    if rich_offset + 8 > data.len() {
        return info;
    }

    let xor_key = u32::from_le_bytes([
        data[rich_offset + 4],
        data[rich_offset + 5],
        data[rich_offset + 6],
        data[rich_offset + 7],
    ]);

    info.checksum = format!("0x{:08X}", xor_key);

    // 向前查找 "DanS" 签名 (44 61 6E 53 XOR xor_key)
    let dans_sig_xored = 0x536E6144u32 ^ xor_key;
    let dans_bytes = dans_sig_xored.to_le_bytes();

    let mut dans_offset = None;
    for i in (0x40..rich_offset).rev() {
        if i + 4 <= data.len() && data[i..i + 4] == dans_bytes {
            dans_offset = Some(i);
            break;
        }
    }

    let dans_offset = match dans_offset {
        Some(o) => o,
        None => return info,
    };

    info.present = true;

    // 解析Rich头条目
    // 每个条目8字节：4字节CompId（高16位Product ID，低16位Build ID）+ 4字节Count
    let start = dans_offset + 16; // 跳过 DanS + 3个填充DWORD
    let end = rich_offset;

    if start >= end {
        return info;
    }

    let mut i = start;
    while i + 8 <= end {
        // 读取并解密
        let comp_id_xored = u32::from_le_bytes([data[i], data[i + 1], data[i + 2], data[i + 3]]);
        let count_xored = u32::from_le_bytes([data[i + 4], data[i + 5], data[i + 6], data[i + 7]]);

        let comp_id = comp_id_xored ^ xor_key;
        let count = count_xored ^ xor_key;

        if comp_id != 0 && count != 0 {
            let build_id = (comp_id & 0xFFFF) as u16;
            let product_id = ((comp_id >> 16) & 0xFFFF) as u16;

            let (product_name, vs_version) = get_product_info(product_id, build_id);

            info.entries.push(RichHeaderEntry {
                build_id,
                product_id,
                count,
                product_name: product_name.to_string(),
                vs_version: vs_version.to_string(),
            });

            // 记录编译器信息
            let compiler_info = format!("{} (Build {}) - {} 次使用", product_name, build_id, count);
            if !info.compiler_info.contains(&compiler_info) {
                info.compiler_info.push(compiler_info);
            }
        }

        i += 8;
    }

    info
}

/// 获取产品信息
fn get_product_info(product_id: u16, _build_id: u16) -> (&'static str, &'static str) {
    // 产品ID映射表
    let product_name = match product_id {
        0 => "Unknown",
        1 => "Import0",
        2 => "Linker510",
        3 => "Cvtomf510",
        4 => "Linker600",
        5 => "Cvtomf600",
        6 => "Cvtres500",
        7 => "Utc11_Basic",
        8 => "Utc11_C",
        9 => "Utc12_Basic",
        10 => "Utc12_C",
        11 => "Utc12_CPP",
        12 => "AliasObj60",
        13 => "VisualBasic60",
        14 => "Masm613",
        15 => "Masm710",
        16 => "Linker511",
        17 => "Cvtomf511",
        18 => "Masm614",
        19 => "Linker512",
        20 => "Cvtomf512",
        21 => "Utc12_C_Std",
        22 => "Utc12_CPP_Std",
        23 => "Utc12_C_Book",
        24 => "Utc12_CPP_Book",
        25 => "Implib700",
        26 => "Cvtomf700",
        27 => "Utc13_Basic",
        28 => "Utc13_C",
        29 => "Utc13_CPP",
        30 => "Linker610",
        31 => "Cvtomf610",
        32 => "Linker601",
        33 => "Cvtomf601",
        34 => "Utc12_1_Basic",
        35 => "Utc12_1_C",
        36 => "Utc12_1_CPP",
        37 => "Linker620",
        38 => "Cvtomf620",
        39 => "AliasObj70",
        40 => "Linker621",
        41 => "Cvtomf621",
        42 => "Masm615",
        43 => "Utc13_LTCG_C",
        44 => "Utc13_LTCG_CPP",
        45 => "Masm620",
        46 => "ILAsm100",
        47 => "Utc12_2_Basic",
        48 => "Utc12_2_C",
        49 => "Utc12_2_CPP",
        50 => "Utc12_2_C_Std",
        51 => "Utc12_2_CPP_Std",
        52 => "Utc12_2_C_Book",
        53 => "Utc12_2_CPP_Book",
        54 => "Implib622",
        55 => "Cvtomf622",
        56 => "Cvtres501",
        57 => "Utc13_C_Std",
        58 => "Utc13_CPP_Std",
        59 => "Cvtpgd1300",
        60 => "Linker622",
        61 => "Linker700",
        62 => "Export622",
        63 => "Export700",
        64 => "Masm700",
        65 => "Utc13_POGO_I_C",
        66 => "Utc13_POGO_I_CPP",
        67 => "Utc13_POGO_O_C",
        68 => "Utc13_POGO_O_CPP",
        69 => "Cvtres700",
        70 => "Cvtres710p",
        71 => "Linker710p",
        72 => "Cvtomf710p",
        73 => "Export710p",
        74 => "Implib710p",
        75 => "Masm710p",
        76 => "Utc13_POGO_I_C_Std",
        77 => "Utc13_POGO_I_CPP_Std",
        78 => "Utc13_POGO_O_C_Std",
        79 => "Utc13_POGO_O_CPP_Std",
        80 => "Linker624",
        81 => "Cvtomf624",
        82 => "Export624",
        83 => "Implib624",
        84 => "Linker710",
        85 => "Cvtomf710",
        86 => "Export710",
        87 => "Implib710",
        88 => "Cvtres710",
        89 => "Utc1310_C",
        90 => "Utc1310_CPP",
        91 => "Utc1310_C_Std",
        92 => "Utc1310_CPP_Std",
        93 => "Utc1310_LTCG_C",
        94 => "Utc1310_LTCG_CPP",
        95 => "Utc1310_POGO_I_C",
        96 => "Utc1310_POGO_I_CPP",
        97 => "Utc1310_POGO_O_C",
        98 => "Utc1310_POGO_O_CPP",
        99 => "AliasObj710",
        100 => "AliasObj710p",
        101 => "Cvtpgd1310",
        102 => "Cvtpgd1310p",
        103 => "Utc1400_C",
        104 => "Utc1400_CPP",
        105 => "Utc1400_C_Std",
        106 => "Utc1400_CPP_Std",
        107 => "Utc1400_LTCG_C",
        108 => "Utc1400_LTCG_CPP",
        109 => "Utc1400_POGO_I_C",
        110 => "Utc1400_POGO_I_CPP",
        111 => "Utc1400_POGO_O_C",
        112 => "Utc1400_POGO_O_CPP",
        113 => "Cvtpgd1400",
        114 => "Linker800",
        115 => "Cvtomf800",
        116 => "Export800",
        117 => "Implib800",
        118 => "Cvtres800",
        119 => "Masm800",
        120 => "AliasObj800",
        121 => "PhoenixPrerelease",
        122 => "Utc1400_CVTCIL_C",
        123 => "Utc1400_CVTCIL_CPP",
        124 => "Utc1400_LTCG_MSIL",
        125 => "Utc1500_C",
        126 => "Utc1500_CPP",
        127 => "Utc1500_C_Std",
        128 => "Utc1500_CPP_Std",
        129 => "Utc1500_CVTCIL_C",
        130 => "Utc1500_CVTCIL_CPP",
        131 => "Utc1500_LTCG_C",
        132 => "Utc1500_LTCG_CPP",
        133 => "Utc1500_LTCG_MSIL",
        134 => "Utc1500_POGO_I_C",
        135 => "Utc1500_POGO_I_CPP",
        136 => "Utc1500_POGO_O_C",
        137 => "Utc1500_POGO_O_CPP",
        138 => "Cvtpgd1500",
        139 => "Linker900",
        140 => "Export900",
        141 => "Implib900",
        142 => "Cvtres900",
        143 => "Masm900",
        144 => "AliasObj900",
        145 => "Resource900",
        146 => "Utc1600_C",
        147 => "Utc1600_CPP",
        148 => "Utc1600_CVTCIL_C",
        149 => "Utc1600_CVTCIL_CPP",
        150 => "Utc1600_LTCG_C",
        151 => "Utc1600_LTCG_CPP",
        152 => "Utc1600_LTCG_MSIL",
        153 => "Utc1600_POGO_I_C",
        154 => "Utc1600_POGO_I_CPP",
        155 => "Utc1600_POGO_O_C",
        156 => "Utc1600_POGO_O_CPP",
        157 => "Cvtpgd1600",
        158 => "Linker1000",
        159 => "Export1000",
        160 => "Implib1000",
        161 => "Cvtres1000",
        162 => "Masm1000",
        163 => "Phx1600_C",
        164 => "Phx1600_CPP",
        165 => "Phx1600_CVTCIL_C",
        166 => "Phx1600_CVTCIL_CPP",
        167 => "Phx1600_LTCG_C",
        168 => "Phx1600_LTCG_CPP",
        169 => "Phx1600_LTCG_MSIL",
        170 => "Phx1600_POGO_I_C",
        171 => "Phx1600_POGO_I_CPP",
        172 => "Phx1600_POGO_O_C",
        173 => "Phx1600_POGO_O_CPP",
        174 => "AliasObj1000",
        175 => "Resource1000",
        176 => "Cvtpgd1610",
        177 => "Utc1610_C",
        178 => "Utc1610_CPP",
        179 => "Utc1610_CVTCIL_C",
        180 => "Utc1610_CVTCIL_CPP",
        181 => "Utc1610_LTCG_C",
        182 => "Utc1610_LTCG_CPP",
        183 => "Utc1610_LTCG_MSIL",
        184 => "Utc1610_POGO_I_C",
        185 => "Utc1610_POGO_I_CPP",
        186 => "Utc1610_POGO_O_C",
        187 => "Utc1610_POGO_O_CPP",
        188 => "Linker1010",
        189 => "Export1010",
        190 => "Implib1010",
        191 => "Cvtres1010",
        192 => "Masm1010",
        193 => "AliasObj1010",
        194 => "Linker1100",
        195 => "Export1100",
        196 => "Implib1100",
        197 => "Cvtres1100",
        198 => "Masm1100",
        199 => "AliasObj1100",
        200 => "Utc1700_C",
        201 => "Utc1700_CPP",
        202 => "Utc1700_CVTCIL_C",
        203 => "Utc1700_CVTCIL_CPP",
        204 => "Utc1700_LTCG_C",
        205 => "Utc1700_LTCG_CPP",
        206 => "Utc1700_LTCG_MSIL",
        207 => "Utc1700_POGO_I_C",
        208 => "Utc1700_POGO_I_CPP",
        209 => "Utc1700_POGO_O_C",
        210 => "Utc1700_POGO_O_CPP",
        255 => "Cvtpgd1700",
        256..=270 => "VS2015+",
        _ => "Unknown",
    };

    // Visual Studio版本映射
    let vs_version = match product_id {
        1..=6 => "VC 5.0",
        7..=13 => "VC 6.0",
        14..=24 => "VC .NET 2002",
        25..=45 => "VC .NET 2003",
        46..=59 => "VC 2003",
        60..=69 => "VC 2005 Beta",
        70..=102 => "VC 2005",
        103..=124 => "VC 2008",
        125..=145 => "VC 2010",
        146..=175 => "VC 2012",
        176..=193 => "VC 2013",
        194..=210 => "VC 2015",
        211..=255 => "VC 2017",
        256..=270 => "VC 2019/2022",
        _ => "Unknown",
    };

    (product_name, vs_version)
}
