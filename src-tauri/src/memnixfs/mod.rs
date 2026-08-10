//! MemNixFS Linux 内存镜像加载模块
//!
//! 该模块负责通过外部 MemNixFS 程序把 Linux 内存转储挂载为可浏览文件系统，
//! 并复用现有的挂载盘浏览管线（mountDrive / 文件查看器）。
//!
//! # 模块结构
//! - `types`: 类型定义（LinuxLoadResult）
//! - `process`: 进程管理（查找、停止 memnixfs）
//! - `file_ops`: 关键取证报告的持久化导出
//! - `loader`: 主加载逻辑（spawn + 挂载轮询）

pub mod file_ops;
pub mod loader;
pub mod process;
pub mod types;

pub use loader::load_linux_memory_image;
pub use process::{check_memnixfs_status, stop_memnixfs, stop_memnixfs_and_clear_output};
pub use types::LinuxLoadResult;
