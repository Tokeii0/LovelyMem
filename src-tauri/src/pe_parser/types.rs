//! PE解析数据类型定义

use serde::{Deserialize, Serialize};

/// PE节信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PESection {
    pub name: String,
    pub virtual_address: String,
    pub virtual_size: u32,
    pub raw_size: u32,
    pub raw_offset: u32,
    pub characteristics: String,
    pub characteristics_desc: Vec<String>,
    pub entropy: f64,
}

/// PE导入信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PEImport {
    pub dll_name: String,
    pub functions: Vec<String>,
}

/// PE导出信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PEExport {
    pub name: String,
    pub ordinal: u32,
    pub rva: String,
}

/// PE头详细信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PEHeaderDetails {
    pub dos_magic: String,
    pub pe_offset: String,
    pub coff_characteristics: Vec<String>,
    pub linker_version: String,
    pub size_of_code: u64,
    pub size_of_initialized_data: u64,
    pub size_of_uninitialized_data: u64,
    pub section_alignment: u32,
    pub file_alignment: u32,
    pub os_version: String,
    pub image_version: String,
    pub subsystem_version: String,
    pub size_of_image: u32,
    pub size_of_headers: u32,
    pub checksum: String,
    pub stack_reserve: u64,
    pub stack_commit: u64,
    pub heap_reserve: u64,
    pub heap_commit: u64,
    pub number_of_rva_and_sizes: u32,
}

/// 安全特性
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityFeatures {
    pub aslr: bool,
    pub dep: bool,
    pub seh: bool,
    pub cfg: bool,
    pub high_entropy_va: bool,
    pub force_integrity: bool,
    pub app_container: bool,
    pub terminal_server_aware: bool,
    pub features_list: Vec<String>,
    pub dll_characteristics: String,
}

/// 数据目录项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataDirectory {
    pub name: String,
    pub index: usize,
    pub rva: String,
    pub size: u32,
    pub present: bool,
}

/// 文件哈希
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileHashes {
    pub md5: String,
    pub sha1: String,
    pub sha256: String,
}

/// 节熵值信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SectionEntropy {
    pub name: String,
    pub entropy: f64,
    pub suspicious: bool,
}

/// 熵值分析
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EntropyInfo {
    pub file_entropy: f64,
    pub is_suspicious: bool,
    pub section_entropy: Vec<SectionEntropy>,
}

/// 版本信息
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct VersionInfo {
    pub file_version: String,
    pub product_version: String,
    pub company_name: String,
    pub file_description: String,
    pub internal_name: String,
    pub original_filename: String,
    pub product_name: String,
    pub legal_copyright: String,
    pub legal_trademarks: String,
    pub comments: String,
    pub private_build: String,
    pub special_build: String,
}

/// 资源信息
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ResourceInfo {
    pub version_info: Option<VersionInfo>,
    pub has_manifest: bool,
    pub manifest_content: Option<String>,
    pub has_icon: bool,
    pub resource_types: Vec<ResourceTypeInfo>,
    pub total_resources: usize,
}

/// 资源类型信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceTypeInfo {
    pub type_name: String,
    pub type_id: u32,
    pub count: usize,
}

/// 调试信息
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DebugInfo {
    pub has_debug: bool,
    pub debug_type: String,
    pub pdb_path: Option<String>,
    pub pdb_guid: Option<String>,
    pub pdb_age: Option<u32>,
    pub timestamp: Option<String>,
    pub debug_entries: Vec<DebugEntry>,
}

/// 调试条目
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DebugEntry {
    pub debug_type: String,
    pub size: u32,
    pub rva: String,
    pub pointer_to_raw_data: u32,
}

/// Rich头信息
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RichHeaderInfo {
    pub present: bool,
    pub checksum: String,
    pub entries: Vec<RichHeaderEntry>,
    pub compiler_info: Vec<String>,
}

/// Rich头条目
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RichHeaderEntry {
    pub build_id: u16,
    pub product_id: u16,
    pub count: u32,
    pub product_name: String,
    pub vs_version: String,
}

/// 导入函数分类
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ImportClassification {
    pub file_operations: Vec<String>,
    pub registry_operations: Vec<String>,
    pub network_operations: Vec<String>,
    pub process_operations: Vec<String>,
    pub memory_operations: Vec<String>,
    pub crypto_operations: Vec<String>,
    pub anti_debug: Vec<String>,
    pub injection: Vec<String>,
    pub other: Vec<String>,
    pub suspicious_count: usize,
    pub total_classified: usize,
}

/// PE解析结果
#[derive(Debug, Serialize, Deserialize)]
pub struct PEParseResult {
    pub filename: String,
    pub file_size: u64,
    pub is_64bit: bool,
    pub is_dll: bool,
    pub machine_type: String,
    pub entry_point: String,
    pub image_base: String,
    pub timestamp: String,
    pub subsystem: String,
    pub number_of_sections: u16,
    pub sections: Vec<PESection>,
    pub imports: Vec<PEImport>,
    pub exports: Vec<PEExport>,
    pub import_count: usize,
    pub export_count: usize,
    pub output_dir: String,
    pub header_details: PEHeaderDetails,
    pub security: SecurityFeatures,
    pub data_directories: Vec<DataDirectory>,
    pub hashes: FileHashes,
    pub entropy: EntropyInfo,
    // 新增字段
    pub resources: ResourceInfo,
    pub debug_info: DebugInfo,
    pub rich_header: RichHeaderInfo,
    pub import_classification: ImportClassification,
}
