//! loadmem 模块的类型定义
//!
//! 包含内存加载相关的所有数据结构定义

use serde::{Deserialize, Serialize};

/// 内存镜像加载结果
#[derive(Debug, Serialize, Deserialize)]
pub struct LoadMemResult {
    pub success: bool,
    pub message: String,
    pub process_id: Option<u32>,
    pub command: String,
    pub output: String,
    pub error: String,
    pub profile_info: Option<ProfileInfo>,
}

/// 操作系统 Profile 信息
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProfileInfo {
    pub detected_os: Option<String>,
    pub suggested_profile: Option<String>,
    pub profile_list: Vec<String>,
}

/// 命令执行事件，用于前端通信
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CommandEvent {
    pub id: u64,
    pub name: String,
    pub command: String,
    pub status: String,
    pub output: Option<String>,
    pub error: Option<String>,
    pub time: String,
}

/// 加载内存镜像请求
#[allow(dead_code)]
#[derive(Debug, Serialize, Deserialize)]
pub struct LoadMemRequest {
    pub image_path: String,
}
