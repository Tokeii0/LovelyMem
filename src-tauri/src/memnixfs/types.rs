//! memnixfs 模块的类型定义
//!
//! Linux 内存镜像（MemNixFS）加载相关的数据结构

use serde::{Deserialize, Serialize};

/// Linux 内存镜像加载结果（对应 Windows 侧的 loadmem::LoadMemResult）
#[derive(Debug, Serialize, Deserialize)]
pub struct LinuxLoadResult {
    pub success: bool,
    pub message: String,
    pub process_id: Option<u32>,
    pub command: String,
    pub output: String,
    pub error: String,
    /// 内核版本字符串（从 M:\sys\banner.txt 或 stdout 提取，替代 Windows 的 profile_info）
    pub kernel_banner: Option<String>,
    /// 符号是否成功解析（影响功能可用性提示）
    pub symbols_resolved: bool,
}
