//! PE文件解析核心模块

use goblin::pe::PE;
use goblin::pe::options::ParseOptions;
use std::fs;
use std::path::Path;

use super::debug_info::parse_debug_info;
use super::import_classifier::classify_imports;
use super::resources::parse_resources;
use super::rich_header::parse_rich_header;
use super::save::save_pe_analysis_files;
use super::types::*;
use super::utils::*;

/// 解析PE文件
pub fn parse_pe_file(file_path: &str, output_base_path: &str) -> Result<PEParseResult, String> {
    debug_info!("🔍 开始解析PE文件: {}", file_path);

    // 检查文件是否存在
    let path = Path::new(file_path);
    if !path.exists() {
        return Err(format!("PE文件不存在: {}", file_path));
    }

    // 获取文件名
    let filename = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("unknown")
        .to_string();

    // 读取文件
    let file_data = fs::read(file_path).map_err(|e| format!("无法读取文件: {}", e))?;

    let file_size = file_data.len() as u64;
    debug_info!("📁 文件大小: {} 字节", file_size);

    // 计算文件哈希
    debug_info!("🔐 计算文件哈希...");
    let hashes = calculate_file_hashes(&file_data);

    // 计算整体文件熵值
    debug_info!("📊 计算熵值...");
    let file_entropy = calculate_entropy(&file_data);
    let file_entropy_suspicious = file_entropy > 7.0;

    // 解析Rich头
    debug_info!("📦 解析Rich头...");
    let rich_header = parse_rich_header(&file_data);

    // 解析PE文件 - 跳过证书解析以避免某些PE文件的证书格式问题
    let parse_opts = ParseOptions {
        resolve_rva: true,
        parse_attribute_certificates: false,
    };
    let pe =
        PE::parse_with_opts(&file_data, &parse_opts).map_err(|e| format!("PE解析失败: {}", e))?;

    debug_info!("✅ PE文件解析成功");

    // 获取基本信息
    let is_64bit = pe.is_64;
    let is_dll = pe.is_lib;
    let machine_type = machine_type_to_string(pe.header.coff_header.machine);
    let entry_point = format!("0x{:08X}", pe.entry);
    let image_base = format!("0x{:016X}", pe.image_base);
    let timestamp = timestamp_to_string(pe.header.coff_header.time_date_stamp);
    let number_of_sections = pe.header.coff_header.number_of_sections;

    // 解析调试信息
    debug_info!("🔧 解析调试信息...");
    let debug_info_result = parse_debug_info(&pe, &file_data);

    // 解析资源信息
    debug_info!("📋 解析资源信息...");
    let resources = parse_resources(&pe, &file_data);

    // 获取子系统信息和可选头详细信息
    let (subsystem, header_details, security, data_directories) =
        if let Some(oh) = pe.header.optional_header {
            let wf = &oh.windows_fields;
            let sf = &oh.standard_fields;

            let subsystem_str = subsystem_to_string(wf.subsystem);

            let header_details = PEHeaderDetails {
                dos_magic: "MZ".to_string(),
                pe_offset: format!("0x{:08X}", pe.header.dos_header.pe_pointer),
                coff_characteristics: coff_characteristics_to_desc(
                    pe.header.coff_header.characteristics,
                ),
                linker_version: format!("{}.{}", sf.major_linker_version, sf.minor_linker_version),
                size_of_code: sf.size_of_code,
                size_of_initialized_data: sf.size_of_initialized_data,
                size_of_uninitialized_data: sf.size_of_uninitialized_data,
                section_alignment: wf.section_alignment,
                file_alignment: wf.file_alignment,
                os_version: format!(
                    "{}.{}",
                    wf.major_operating_system_version, wf.minor_operating_system_version
                ),
                image_version: format!("{}.{}", wf.major_image_version, wf.minor_image_version),
                subsystem_version: format!(
                    "{}.{}",
                    wf.major_subsystem_version, wf.minor_subsystem_version
                ),
                size_of_image: wf.size_of_image,
                size_of_headers: wf.size_of_headers,
                checksum: format!("0x{:08X}", wf.check_sum),
                stack_reserve: wf.size_of_stack_reserve,
                stack_commit: wf.size_of_stack_commit,
                heap_reserve: wf.size_of_heap_reserve,
                heap_commit: wf.size_of_heap_commit,
                number_of_rva_and_sizes: wf.number_of_rva_and_sizes,
            };

            let security = parse_dll_characteristics(wf.dll_characteristics);

            // 解析数据目录
            let mut data_dirs = Vec::new();
            for (i, dd) in oh.data_directories.data_directories.iter().enumerate() {
                if i >= 16 {
                    break;
                }
                if let Some((_offset, dir)) = dd {
                    data_dirs.push(DataDirectory {
                        name: get_data_directory_name(i).to_string(),
                        index: i,
                        rva: format!("0x{:08X}", dir.virtual_address),
                        size: dir.size,
                        present: dir.virtual_address != 0 || dir.size != 0,
                    });
                } else {
                    data_dirs.push(DataDirectory {
                        name: get_data_directory_name(i).to_string(),
                        index: i,
                        rva: "0x00000000".to_string(),
                        size: 0,
                        present: false,
                    });
                }
            }

            (subsystem_str, header_details, security, data_dirs)
        } else {
            (
                "Unknown".to_string(),
                PEHeaderDetails {
                    dos_magic: "MZ".to_string(),
                    pe_offset: format!("0x{:08X}", pe.header.dos_header.pe_pointer),
                    coff_characteristics: coff_characteristics_to_desc(
                        pe.header.coff_header.characteristics,
                    ),
                    linker_version: "N/A".to_string(),
                    size_of_code: 0,
                    size_of_initialized_data: 0,
                    size_of_uninitialized_data: 0,
                    section_alignment: 0,
                    file_alignment: 0,
                    os_version: "N/A".to_string(),
                    image_version: "N/A".to_string(),
                    subsystem_version: "N/A".to_string(),
                    size_of_image: 0,
                    size_of_headers: 0,
                    checksum: "N/A".to_string(),
                    stack_reserve: 0,
                    stack_commit: 0,
                    heap_reserve: 0,
                    heap_commit: 0,
                    number_of_rva_and_sizes: 0,
                },
                SecurityFeatures {
                    aslr: false,
                    dep: false,
                    seh: true,
                    cfg: false,
                    high_entropy_va: false,
                    force_integrity: false,
                    app_container: false,
                    terminal_server_aware: false,
                    features_list: Vec::new(),
                    dll_characteristics: "N/A".to_string(),
                },
                Vec::new(),
            )
        };

    debug_info!(
        "📊 PE信息: {}位, {}, 入口点: {}",
        if is_64bit { "64" } else { "32" },
        if is_dll { "DLL" } else { "EXE" },
        entry_point
    );

    // 解析节表并计算各节熵值
    let mut section_entropy_list = Vec::new();
    let sections: Vec<PESection> = pe
        .sections
        .iter()
        .map(|section| {
            let name = String::from_utf8_lossy(&section.name)
                .trim_end_matches('\0')
                .to_string();

            // 计算节熵值
            let section_data_start = section.pointer_to_raw_data as usize;
            let section_data_end = section_data_start + section.size_of_raw_data as usize;
            let section_entropy =
                if section_data_end <= file_data.len() && section.size_of_raw_data > 0 {
                    calculate_entropy(&file_data[section_data_start..section_data_end])
                } else {
                    0.0
                };

            section_entropy_list.push(SectionEntropy {
                name: name.clone(),
                entropy: section_entropy,
                suspicious: section_entropy > 7.0,
            });

            PESection {
                name,
                virtual_address: format!("0x{:08X}", section.virtual_address),
                virtual_size: section.virtual_size,
                raw_size: section.size_of_raw_data,
                raw_offset: section.pointer_to_raw_data,
                characteristics: format!("0x{:08X}", section.characteristics),
                characteristics_desc: section_characteristics_to_desc(section.characteristics),
                entropy: section_entropy,
            }
        })
        .collect();

    let entropy = EntropyInfo {
        file_entropy,
        is_suspicious: file_entropy_suspicious || section_entropy_list.iter().any(|s| s.suspicious),
        section_entropy: section_entropy_list,
    };

    debug_info!(
        "📦 发现 {} 个节, 文件熵值: {:.2}",
        sections.len(),
        file_entropy
    );

    // 解析导入表
    let mut imports: Vec<PEImport> = Vec::new();
    let mut import_count = 0;

    for import in &pe.imports {
        let dll_name = import.dll.to_string();
        let func_name = import.name.to_string();

        if let Some(existing) = imports.iter_mut().find(|i| i.dll_name == dll_name) {
            existing.functions.push(func_name);
        } else {
            imports.push(PEImport {
                dll_name,
                functions: vec![func_name],
            });
        }
        import_count += 1;
    }

    debug_info!(
        "📥 发现 {} 个导入函数，来自 {} 个DLL",
        import_count,
        imports.len()
    );

    // 导入函数分类
    debug_info!("🔍 分类导入函数...");
    let import_classification = classify_imports(&imports);

    // 解析导出表
    let exports: Vec<PEExport> = pe
        .exports
        .iter()
        .enumerate()
        .map(|(index, export)| PEExport {
            name: export.name.unwrap_or("(unnamed)").to_string(),
            ordinal: index as u32,
            rva: format!("0x{:08X}", export.rva),
        })
        .collect();

    let export_count = exports.len();
    debug_info!("📤 发现 {} 个导出函数", export_count);

    // 创建输出目录
    let timestamp_str = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    let safe_filename = filename.replace('.', "_");
    let output_dir = format!(
        "{}\\pe_analysis\\{}_{}",
        output_base_path, safe_filename, timestamp_str
    );

    if let Err(e) = fs::create_dir_all(&output_dir) {
        debug_info!("⚠️ 创建输出目录失败: {}", e);
    } else {
        debug_info!("📁 创建输出目录: {}", output_dir);
    }

    let result = PEParseResult {
        filename,
        file_size,
        is_64bit,
        is_dll,
        machine_type,
        entry_point,
        image_base,
        timestamp,
        subsystem,
        number_of_sections,
        sections,
        imports,
        exports,
        import_count,
        export_count,
        output_dir: output_dir.clone(),
        header_details,
        security,
        data_directories,
        hashes,
        entropy,
        resources,
        debug_info: debug_info_result,
        rich_header,
        import_classification,
    };

    // 保存分析结果
    if let Err(e) = save_pe_analysis_files(&output_dir, &result) {
        debug_info!("⚠️ 保存分析文件失败: {}", e);
    }

    Ok(result)
}
