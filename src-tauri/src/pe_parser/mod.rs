//! PE文件解析模块
//! 用于解析Windows可执行文件（EXE、DLL等）的结构信息

pub mod debug_info;
pub mod import_classifier;
pub mod parser;
pub mod resources;
pub mod rich_header;
pub mod save;
pub mod types;
pub mod utils;

// 重导出主要类型和函数
pub use parser::parse_pe_file;
pub use types::*;

/// Tauri命令：解析PE文件
#[tauri::command]
pub async fn parse_pe_file_command(
    file_path: String,
    output_base_path: String,
) -> Result<PEParseResult, String> {
    debug_info!("🔍 收到PE解析请求: {}", file_path);

    let result =
        tokio::task::spawn_blocking(move || parse_pe_file(&file_path, &output_base_path)).await;

    match result {
        Ok(parse_result) => match parse_result {
            Ok(pe_data) => {
                debug_info!(
                    "✅ PE文件解析成功: {} 个节, {} 个导入, {} 个导出",
                    pe_data.sections.len(),
                    pe_data.import_count,
                    pe_data.export_count
                );
                Ok(pe_data)
            }
            Err(e) => {
                debug_info!("❌ PE文件解析失败: {}", e);
                Err(e)
            }
        },
        Err(join_error) => {
            debug_info!("❌ 异步任务执行失败: {}", join_error);
            Err(format!("异步任务执行失败: {}", join_error))
        }
    }
}
