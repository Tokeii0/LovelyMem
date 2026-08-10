//! 保存PE分析结果模块

use super::types::PEParseResult;
use std::fs;

/// 保存PE分析结果到文件
pub fn save_pe_analysis_files(output_dir: &str, result: &PEParseResult) -> Result<(), String> {
    // 保存PE头详细信息
    let headers_content = format!(
        r#"PE文件头详细信息 - {}
{}

=== DOS Header ===
DOS Magic: {}
PE Offset: {}

=== COFF Header ===
Machine: {}
Number of Sections: {}
Timestamp: {}
Characteristics: {}

=== Optional Header ===
Linker Version: {}
Size of Code: {} (0x{:X})
Size of Initialized Data: {} (0x{:X})
Size of Uninitialized Data: {} (0x{:X})
Entry Point: {}
Image Base: {}
Section Alignment: {} (0x{:X})
File Alignment: {} (0x{:X})
OS Version: {}
Image Version: {}
Subsystem Version: {}
Subsystem: {}
Size of Image: {} (0x{:X})
Size of Headers: {} (0x{:X})
Checksum: {}
Stack Reserve: {} (0x{:X})
Stack Commit: {} (0x{:X})
Heap Reserve: {} (0x{:X})
Heap Commit: {} (0x{:X})
Number of Data Directories: {}
"#,
        result.filename,
        "=".repeat(50),
        result.header_details.dos_magic,
        result.header_details.pe_offset,
        result.machine_type,
        result.number_of_sections,
        result.timestamp,
        result.header_details.coff_characteristics.join(", "),
        result.header_details.linker_version,
        result.header_details.size_of_code,
        result.header_details.size_of_code,
        result.header_details.size_of_initialized_data,
        result.header_details.size_of_initialized_data,
        result.header_details.size_of_uninitialized_data,
        result.header_details.size_of_uninitialized_data,
        result.entry_point,
        result.image_base,
        result.header_details.section_alignment,
        result.header_details.section_alignment,
        result.header_details.file_alignment,
        result.header_details.file_alignment,
        result.header_details.os_version,
        result.header_details.image_version,
        result.header_details.subsystem_version,
        result.subsystem,
        result.header_details.size_of_image,
        result.header_details.size_of_image,
        result.header_details.size_of_headers,
        result.header_details.size_of_headers,
        result.header_details.checksum,
        result.header_details.stack_reserve,
        result.header_details.stack_reserve,
        result.header_details.stack_commit,
        result.header_details.stack_commit,
        result.header_details.heap_reserve,
        result.header_details.heap_reserve,
        result.header_details.heap_commit,
        result.header_details.heap_commit,
        result.header_details.number_of_rva_and_sizes,
    );

    fs::write(format!("{}\\headers.txt", output_dir), headers_content)
        .map_err(|e| format!("写入headers.txt失败: {}", e))?;

    // 保存安全特性分析
    let security_content = format!(
        r#"PE文件安全特性分析 - {}
{}

DLL Characteristics: {}

=== 安全特性状态 ===
ASLR (地址空间布局随机化): {}
DEP/NX (数据执行保护): {}
SEH (结构化异常处理): {}
CFG (控制流保护): {}
High Entropy VA: {}
Force Integrity: {}
AppContainer: {}
Terminal Server Aware: {}

=== 完整特性列表 ===
{}

=== 安全评估 ===
{}
"#,
        result.filename,
        "=".repeat(50),
        result.security.dll_characteristics,
        if result.security.aslr {
            "✓ 启用"
        } else {
            "✗ 未启用"
        },
        if result.security.dep {
            "✓ 启用"
        } else {
            "✗ 未启用"
        },
        if result.security.seh {
            "✓ 支持"
        } else {
            "✗ 禁用 (NO_SEH)"
        },
        if result.security.cfg {
            "✓ 启用"
        } else {
            "✗ 未启用"
        },
        if result.security.high_entropy_va {
            "✓ 启用"
        } else {
            "✗ 未启用"
        },
        if result.security.force_integrity {
            "✓ 启用"
        } else {
            "✗ 未启用"
        },
        if result.security.app_container {
            "✓ 启用"
        } else {
            "✗ 未启用"
        },
        if result.security.terminal_server_aware {
            "✓ 启用"
        } else {
            "✗ 未启用"
        },
        if result.security.features_list.is_empty() {
            "无".to_string()
        } else {
            result.security.features_list.join("\n")
        },
        if result.security.aslr && result.security.dep && result.security.cfg {
            "该文件启用了主要安全保护机制（ASLR、DEP、CFG）"
        } else if result.security.aslr && result.security.dep {
            "该文件启用了基本安全保护（ASLR、DEP），但未启用CFG"
        } else {
            "警告：该文件未启用完整的安全保护机制"
        }
    );

    fs::write(format!("{}\\security.txt", output_dir), security_content)
        .map_err(|e| format!("写入security.txt失败: {}", e))?;

    // 保存文件哈希
    let hashes_content = format!(
        r#"PE文件哈希值 - {}
{}

MD5:    {}
SHA1:   {}
SHA256: {}
"#,
        result.filename,
        "=".repeat(50),
        result.hashes.md5,
        result.hashes.sha1,
        result.hashes.sha256,
    );

    fs::write(format!("{}\\hashes.txt", output_dir), hashes_content)
        .map_err(|e| format!("写入hashes.txt失败: {}", e))?;

    // 保存熵值分析
    let entropy_content = format!(
        r#"PE文件熵值分析 - {}
{}

=== 整体熵值 ===
文件熵值: {:.4}
状态: {}

=== 各节熵值 ===
{}

=== 熵值说明 ===
- 熵值范围: 0.0 - 8.0
- 普通代码/数据: 通常在 4.0 - 6.5 之间
- 压缩/加密数据: 通常在 7.0 - 8.0 之间
- 熵值 > 7.0 可能表示数据被压缩、加密或加壳
"#,
        result.filename,
        "=".repeat(50),
        result.entropy.file_entropy,
        if result.entropy.is_suspicious {
            "⚠️ 可疑（可能加壳/加密）"
        } else {
            "✓ 正常"
        },
        result
            .entropy
            .section_entropy
            .iter()
            .map(|s| {
                format!(
                    "{}: {:.4} {}",
                    s.name,
                    s.entropy,
                    if s.suspicious { "⚠️" } else { "✓" }
                )
            })
            .collect::<Vec<_>>()
            .join("\n"),
    );

    fs::write(format!("{}\\entropy.txt", output_dir), entropy_content)
        .map_err(|e| format!("写入entropy.txt失败: {}", e))?;

    // 保存数据目录表
    let data_dirs_content = format!(
        r#"PE文件数据目录表 - {}
{}

{}
"#,
        result.filename,
        "=".repeat(50),
        result
            .data_directories
            .iter()
            .map(|d| {
                format!(
                    "[{:2}] {:30} RVA: {:12} Size: {:10} {}",
                    d.index,
                    d.name,
                    d.rva,
                    d.size,
                    if d.present { "✓" } else { "-" }
                )
            })
            .collect::<Vec<_>>()
            .join("\n"),
    );

    fs::write(
        format!("{}\\data_directories.txt", output_dir),
        data_dirs_content,
    )
    .map_err(|e| format!("写入data_directories.txt失败: {}", e))?;

    // 保存节表信息
    let sections_content = result.sections.iter().map(|s| {
        format!(
            "{}\n  虚拟地址: {}\n  虚拟大小: {} (0x{:X})\n  原始大小: {} (0x{:X})\n  原始偏移: 0x{:08X}\n  熵值: {:.4} {}\n  特性: {} [{}]\n",
            s.name,
            s.virtual_address,
            s.virtual_size, s.virtual_size,
            s.raw_size, s.raw_size,
            s.raw_offset,
            s.entropy, if s.entropy > 7.0 { "⚠️" } else { "✓" },
            s.characteristics,
            s.characteristics_desc.join(", ")
        )
    }).collect::<Vec<_>>().join("\n");

    fs::write(
        format!("{}\\sections.txt", output_dir),
        format!(
            "PE文件节表信息 - {}\n{}\n\n{}",
            result.filename,
            "=".repeat(50),
            sections_content
        ),
    )
    .map_err(|e| format!("写入sections.txt失败: {}", e))?;

    // 保存导入表信息
    let imports_content = result
        .imports
        .iter()
        .map(|i| {
            let funcs = i
                .functions
                .iter()
                .map(|f| format!("    {}", f))
                .collect::<Vec<_>>()
                .join("\n");
            format!("{} ({} 个函数)\n{}", i.dll_name, i.functions.len(), funcs)
        })
        .collect::<Vec<_>>()
        .join("\n\n");

    fs::write(
        format!("{}\\imports.txt", output_dir),
        format!(
            "PE文件导入表 - {}\n{}\n\n{}",
            result.filename,
            "=".repeat(50),
            imports_content
        ),
    )
    .map_err(|e| format!("写入imports.txt失败: {}", e))?;

    // 保存导出表信息
    let exports_content = if result.exports.is_empty() {
        "无导出函数".to_string()
    } else {
        result
            .exports
            .iter()
            .map(|e| format!("{} (序号: {}, RVA: {})", e.name, e.ordinal, e.rva))
            .collect::<Vec<_>>()
            .join("\n")
    };

    fs::write(
        format!("{}\\exports.txt", output_dir),
        format!(
            "PE文件导出表 - {}\n{}\n\n{}",
            result.filename,
            "=".repeat(50),
            exports_content
        ),
    )
    .map_err(|e| format!("写入exports.txt失败: {}", e))?;

    // 保存导入函数分类
    let classification = &result.import_classification;
    let classification_content = format!(
        r#"PE文件导入函数分类 - {}
{}

=== 分类统计 ===
文件操作: {} 个
注册表操作: {} 个
网络操作: {} 个
进程操作: {} 个
内存操作: {} 个
加密操作: {} 个
反调试: {} 个
代码注入: {} 个
其他: {} 个
可疑函数总数: {}

=== 文件操作 ===
{}

=== 注册表操作 ===
{}

=== 网络操作 ===
{}

=== 进程操作 ===
{}

=== 内存操作 ===
{}

=== 加密操作 ===
{}

=== 反调试 ===
{}

=== 代码注入 ===
{}
"#,
        result.filename,
        "=".repeat(50),
        classification.file_operations.len(),
        classification.registry_operations.len(),
        classification.network_operations.len(),
        classification.process_operations.len(),
        classification.memory_operations.len(),
        classification.crypto_operations.len(),
        classification.anti_debug.len(),
        classification.injection.len(),
        classification.other.len(),
        classification.suspicious_count,
        classification.file_operations.join("\n"),
        classification.registry_operations.join("\n"),
        classification.network_operations.join("\n"),
        classification.process_operations.join("\n"),
        classification.memory_operations.join("\n"),
        classification.crypto_operations.join("\n"),
        classification.anti_debug.join("\n"),
        classification.injection.join("\n"),
    );

    fs::write(
        format!("{}\\import_classification.txt", output_dir),
        classification_content,
    )
    .map_err(|e| format!("写入import_classification.txt失败: {}", e))?;

    // 保存调试信息
    if result.debug_info.has_debug {
        let debug_content = format!(
            r#"PE文件调试信息 - {}
{}

调试类型: {}
PDB路径: {}
PDB GUID: {}
PDB Age: {}
时间戳: {}

=== 调试条目 ===
{}
"#,
            result.filename,
            "=".repeat(50),
            result.debug_info.debug_type,
            result.debug_info.pdb_path.as_deref().unwrap_or("N/A"),
            result.debug_info.pdb_guid.as_deref().unwrap_or("N/A"),
            result
                .debug_info
                .pdb_age
                .map(|a| a.to_string())
                .unwrap_or_else(|| "N/A".to_string()),
            result.debug_info.timestamp.as_deref().unwrap_or("N/A"),
            result
                .debug_info
                .debug_entries
                .iter()
                .map(|e| { format!("  {} - Size: {}, RVA: {}", e.debug_type, e.size, e.rva) })
                .collect::<Vec<_>>()
                .join("\n"),
        );

        fs::write(format!("{}\\debug_info.txt", output_dir), debug_content)
            .map_err(|e| format!("写入debug_info.txt失败: {}", e))?;
    }

    // 保存Rich头信息
    if result.rich_header.present {
        let rich_content = format!(
            r#"PE文件Rich头信息 - {}
{}

校验和: {}

=== 编译器/链接器信息 ===
{}

=== 详细条目 ===
{}
"#,
            result.filename,
            "=".repeat(50),
            result.rich_header.checksum,
            result.rich_header.compiler_info.join("\n"),
            result
                .rich_header
                .entries
                .iter()
                .map(|e| {
                    format!(
                        "  Product: {} (ID: {}), Build: {}, Count: {}, VS: {}",
                        e.product_name, e.product_id, e.build_id, e.count, e.vs_version
                    )
                })
                .collect::<Vec<_>>()
                .join("\n"),
        );

        fs::write(format!("{}\\rich_header.txt", output_dir), rich_content)
            .map_err(|e| format!("写入rich_header.txt失败: {}", e))?;
    }

    // 保存资源信息
    if result.resources.total_resources > 0 {
        let mut resource_content = format!(
            r#"PE文件资源信息 - {}
{}

总资源数: {}
有图标: {}
有清单: {}

=== 资源类型 ===
{}
"#,
            result.filename,
            "=".repeat(50),
            result.resources.total_resources,
            if result.resources.has_icon {
                "是"
            } else {
                "否"
            },
            if result.resources.has_manifest {
                "是"
            } else {
                "否"
            },
            result
                .resources
                .resource_types
                .iter()
                .map(|r| { format!("  {} (ID: {}): {} 个", r.type_name, r.type_id, r.count) })
                .collect::<Vec<_>>()
                .join("\n"),
        );

        if let Some(ref version) = result.resources.version_info {
            resource_content.push_str(&format!(
                r#"

=== 版本信息 ===
文件版本: {}
产品版本: {}
公司名称: {}
文件描述: {}
产品名称: {}
原始文件名: {}
内部名称: {}
版权信息: {}
"#,
                version.file_version,
                version.product_version,
                version.company_name,
                version.file_description,
                version.product_name,
                version.original_filename,
                version.internal_name,
                version.legal_copyright,
            ));
        }

        if let Some(ref manifest) = result.resources.manifest_content {
            let truncated = if manifest.len() > 2000 {
                format!("{}...\n[截断，完整内容请查看原文件]", &manifest[..2000])
            } else {
                manifest.clone()
            };
            resource_content.push_str(&format!("\n=== 清单内容 ===\n{}\n", truncated));
        }

        fs::write(format!("{}\\resources.txt", output_dir), resource_content)
            .map_err(|e| format!("写入resources.txt失败: {}", e))?;
    }

    // 保存完整的JSON结果
    let json_content =
        serde_json::to_string_pretty(result).map_err(|e| format!("序列化JSON失败: {}", e))?;
    fs::write(format!("{}\\pe_info.json", output_dir), json_content)
        .map_err(|e| format!("写入pe_info.json失败: {}", e))?;

    Ok(())
}
