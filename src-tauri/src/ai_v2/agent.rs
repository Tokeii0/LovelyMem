//! Agent 模块 - 代理循环逻辑

use crate::ai_v2::tools::ToolRegistry;
use crate::ai_v2::types::{
    AgentConfig, AgentStep, AgentType, ConcurrencySafety, ToolContext, ToolDefinition,
};
use crate::types::AiSettings;
use serde::{Deserialize, Serialize};
use tauri::Emitter;

/// Agent 执行器
pub struct AgentRunner {
    config: AgentConfig,
    tool_registry: ToolRegistry,
    current_iteration: u32,
}

impl AgentRunner {
    /// 创建新的Agent执行器
    pub fn new(agent_type: AgentType) -> Self {
        Self {
            config: agent_type.config(),
            tool_registry: ToolRegistry::with_builtin_tools(),
            current_iteration: 0,
        }
    }

    /// 从配置创建
    pub fn from_config(config: AgentConfig) -> Self {
        Self {
            config,
            tool_registry: ToolRegistry::with_builtin_tools(),
            current_iteration: 0,
        }
    }

    /// 从配置创建，带有 Volatility 工具
    pub fn from_config_with_volatility(
        config: AgentConfig,
        vol_config: crate::ai_v2::tools::VolatilityConfig,
    ) -> Self {
        Self {
            config,
            tool_registry: ToolRegistry::with_volatility_tools(vol_config),
            current_iteration: 0,
        }
    }

    /// 从配置创建，带有所有扩展工具（Volatility + 代码 + Markdown 工具）
    pub fn from_config_with_all_tools(
        config: AgentConfig,
        vol_config: crate::ai_v2::tools::VolatilityConfig,
        python_path: String,
        markdown_path: String,
    ) -> Self {
        Self {
            config,
            tool_registry: ToolRegistry::with_all_tools(vol_config, python_path, markdown_path),
            current_iteration: 0,
        }
    }

    /// 获取可用工具定义
    pub fn get_tool_definitions(&self) -> Vec<ToolDefinition> {
        self.tool_registry.get_definitions_for(&self.config.tools)
    }

    /// 获取最大迭代次数
    pub fn max_iterations(&self) -> u32 {
        self.config.max_iterations
    }

    /// 获取当前迭代
    pub fn current_iteration(&self) -> u32 {
        self.current_iteration
    }

    /// 递增迭代
    pub fn increment_iteration(&mut self) -> u32 {
        self.current_iteration += 1;
        self.current_iteration
    }

    /// 检查是否可以继续
    pub fn can_continue(&self) -> bool {
        self.current_iteration < self.config.max_iterations
    }

    /// 重置状态
    pub fn reset(&mut self) {
        self.current_iteration = 0;
    }

    /// 执行工具调用
    pub async fn execute_tool(
        &self,
        tool_name: &str,
        args: serde_json::Value,
        ctx: &ToolContext,
    ) -> crate::ai_v2::types::ToolCallResult {
        self.tool_registry.execute(tool_name, args, ctx).await
    }

    /// 使用验证管道执行工具（验证 + 计时 + 截断）
    pub async fn execute_tool_validated(
        &self,
        tool_name: &str,
        args: serde_json::Value,
        ctx: &ToolContext,
    ) -> crate::ai_v2::types::ToolCallResult {
        self.tool_registry
            .execute_validated(tool_name, args, ctx)
            .await
    }

    /// 获取工具的并发安全性
    pub fn get_tool_concurrency_safety(&self, tool_name: &str) -> ConcurrencySafety {
        self.tool_registry.get_concurrency_safety(tool_name)
    }

    /// 获取工具的动态活动描述
    pub fn get_tool_activity_description(
        &self,
        tool_name: &str,
        args: &serde_json::Value,
    ) -> String {
        self.tool_registry.get_activity_description(tool_name, args)
    }

    /// 获取配置的最大输出 Token 数
    pub fn config_max_output_tokens(&self) -> u32 {
        self.config.max_output_tokens
    }

    /// 检查工具是否可用
    pub fn is_tool_available(&self, tool_name: &str) -> bool {
        self.config.tools.contains(&tool_name.to_string()) && self.tool_registry.has(tool_name)
    }

    /// 获取工具状态文本
    pub fn get_tool_status_text(tool_name: &str) -> &'static str {
        match tool_name {
            "list_files" => "正在浏览文件",
            "read_file" => "正在读取文件",
            "write_file" => "正在写入文件",
            "edit_file" => "正在编辑文件",
            "search_in_file" => "正在搜索代码",
            "grep_files" => "正在搜索代码库",
            "analyze_csv" => "正在分析数据",
            "bash" => "正在执行命令",
            "write_code" => "正在编写代码",
            "read_code" => "正在读取脚本",
            "list_code" => "正在列出脚本",
            "execute_code" => "正在执行脚本",
            "volatility2" => "正在运行 Volatility2",
            "volatility3" => "正在运行 Volatility3",
            "write_markdown" => "正在编写文档",
            "read_markdown" => "正在读取文档",
            "list_markdown" => "正在列出文档",
            "forensic_workflow" => "正在执行自动化取证分析",
            "process_analysis" => "正在深度分析进程",
            "extract_ioc" => "正在提取 IOC 指标",
            _ => "正在处理",
        }
    }
}

/// Agent 请求
#[derive(Debug, Serialize, Deserialize)]
pub struct AgentRequest {
    pub message: String,
    pub ai_settings: AiSettings,
    pub context: AgentContext,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub history: Option<Vec<HistoryMessage>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_iterations: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_type: Option<String>,
}

/// Agent 上下文
#[derive(Debug, Serialize, Deserialize)]
pub struct AgentContext {
    pub selected_files: Vec<SelectedFile>,
    pub selected_text: String,
}

/// 选中的文件
#[derive(Debug, Serialize, Deserialize)]
pub struct SelectedFile {
    pub name: String,
    pub size: u64,
    pub modified: String,
}

/// 历史消息
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HistoryMessage {
    pub role: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub reasoning_content: Option<String>,
}

/// 发送Agent步骤事件
pub fn emit_agent_step(
    app_handle: &tauri::AppHandle,
    window_label: &str,
    step: &AgentStep,
) -> Result<(), String> {
    app_handle
        .emit_to(window_label, "agent-step", step)
        .map_err(|e| format!("发送事件失败: {}", e))
}

/// 发送思考状态
pub fn emit_thinking(
    app_handle: &tauri::AppHandle,
    window_label: &str,
    content: &str,
) -> Result<(), String> {
    let step = AgentStep {
        step_type: "thinking".to_string(),
        content: content.to_string(),
        tool_name: None,
        tool_args: None,
        iteration: None,
        duration_ms: None,
        usage: None,
    };
    emit_agent_step(app_handle, window_label, &step)
}

/// 发送工具调用事件
pub fn emit_tool_call(
    app_handle: &tauri::AppHandle,
    window_label: &str,
    tool_name: &str,
    tool_args: serde_json::Value,
) -> Result<(), String> {
    let step = AgentStep {
        step_type: "tool_call".to_string(),
        content: format!("调用工具: {}", tool_name),
        tool_name: Some(tool_name.to_string()),
        tool_args: Some(tool_args),
        iteration: None,
        duration_ms: None,
        usage: None,
    };
    emit_agent_step(app_handle, window_label, &step)
}

/// 发送工具结果事件
pub fn emit_tool_result(
    app_handle: &tauri::AppHandle,
    window_label: &str,
    tool_name: &str,
    result: &str,
    success: bool,
) -> Result<(), String> {
    let step = AgentStep {
        step_type: if success { "tool_result" } else { "tool_error" }.to_string(),
        content: result.to_string(),
        tool_name: Some(tool_name.to_string()),
        tool_args: None,
        iteration: None,
        duration_ms: None,
        usage: None,
    };
    emit_agent_step(app_handle, window_label, &step)
}

/// 发送最终答案
pub fn emit_final_answer(
    app_handle: &tauri::AppHandle,
    window_label: &str,
    content: &str,
) -> Result<(), String> {
    let step = AgentStep {
        step_type: "final_answer".to_string(),
        content: content.to_string(),
        tool_name: None,
        tool_args: None,
        iteration: None,
        duration_ms: None,
        usage: None,
    };
    emit_agent_step(app_handle, window_label, &step)
}

/// 发送迭代事件
pub fn emit_iteration(
    app_handle: &tauri::AppHandle,
    window_label: &str,
    iteration: u32,
) -> Result<(), String> {
    let step = AgentStep {
        step_type: "iteration".to_string(),
        content: format!("迭代 {}", iteration),
        tool_name: None,
        tool_args: None,
        iteration: Some(iteration),
        duration_ms: None,
        usage: None,
    };
    emit_agent_step(app_handle, window_label, &step)
}
