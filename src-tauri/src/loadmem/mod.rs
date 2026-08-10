//! MemProcFS 内存镜像加载模块
//!
//! 该模块负责：
//! - 加载本地内存镜像文件
//! - 加载远程内存镜像
//! - 管理 MemProcFS 进程
//! - 复制 forensic 分析文件
//! - 检测操作系统 Profile
//!
//! # 模块结构
//!
//! - `types`: 类型定义（LoadMemResult, ProfileInfo 等）
//! - `utils`: 工具函数（编码处理、完成检测等）
//! - `profile`: Profile 检测（Volatility2 imageinfo）
//! - `process`: 进程管理（查找、停止 MemProcFS）
//! - `file_ops`: 文件操作（复制 forensic 文件）
//! - `loader`: 主加载逻辑

// 子模块声明
pub mod file_ops;
pub mod loader;
pub mod process;
pub mod profile;
pub mod types;
pub mod utils;

// 重新导出公共类型
pub use types::LoadMemResult;

// 重新导出主要功能函数
pub use file_ops::copy_forensic_files_retry;
pub use loader::{load_memory_image, load_remote_memory_image};
pub use process::{check_memprocfs_status, stop_memprocfs, stop_memprocfs_and_clear_output};
pub use profile::get_profile_info;

/// 独立的清空输出目录功能（公开函数）
pub async fn clear_output_directory_standalone(output_path: &str) -> Result<String, String> {
    file_ops::clear_output_directory(output_path).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::debug_info;

    #[test]
    fn test_system_arch_detection() {
        let arch = utils::get_system_arch();
        debug_info!("检测到的系统架构: {}", arch);
        assert!(!arch.is_empty());

        let is_arm64 = utils::is_arm64_system();
        debug_info!("是否为 ARM64 系统: {}", is_arm64);

        if arch == "aarch64" {
            assert!(is_arm64);
        } else {
            assert!(!is_arm64);
        }
    }

    #[tokio::test]
    async fn test_load_memory_image_empty_path() {
        let settings = crate::AppSettings::default();
        let result = load_memory_image(&settings, "test.dmp", None)
            .await
            .unwrap();

        assert!(!result.success);
        assert!(result.message.contains("MemProcFS路径未设置"));
    }

    #[tokio::test]
    async fn test_load_memory_image_invalid_memprocfs_path() {
        let mut settings = crate::AppSettings::default();
        settings.memprocfs_path = "/nonexistent/path".to_string();

        let result = load_memory_image(&settings, "test.dmp", None)
            .await
            .unwrap();

        assert!(!result.success);
        assert!(result.message.contains("MemProcFS可执行文件不存在"));
    }

    #[tokio::test]
    async fn test_arm64_error_handling() {
        if utils::is_arm64_system() {
            debug_info!("在 ARM64 系统上运行测试");

            let mut settings = crate::AppSettings::default();
            settings.memprocfs_path = "/nonexistent/arm64/path".to_string();

            let result = load_memory_image(&settings, "test.dmp", None)
                .await
                .unwrap();

            assert!(!result.success);
            if result.error.contains("ARM64") {
                debug_info!("ARM64 兼容性错误处理正常工作");
            }
        } else {
            debug_info!("非 ARM64 系统，跳过 ARM64 特定测试");
        }
    }
}
