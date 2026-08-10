//! AI Assistant V2 - 模块化后端架构
//! 参考 OpenCode 设计，支持思考、工具调用、代理模式

pub mod agent;
pub mod commands;
pub mod compaction;
pub mod provider;
pub mod tools;
pub mod types;

pub use agent::AgentRunner;
pub use commands::*;
pub use compaction::*;
pub use tools::ToolRegistry;
pub use types::*;
