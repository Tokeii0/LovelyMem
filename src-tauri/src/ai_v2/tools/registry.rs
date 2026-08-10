//! 工具注册表

use super::Tool;
use crate::ai_v2::types::{ToolCallResult, ToolContext, ToolDefinition};
use std::collections::HashMap;
use std::sync::Arc;

/// 工具注册表
pub struct ToolRegistry {
    tools: HashMap<String, Arc<dyn Tool>>,
}

impl ToolRegistry {
    /// 创建新的注册表
    pub fn new() -> Self {
        Self {
            tools: HashMap::new(),
        }
    }

    /// 创建并注册所有内置工具
    pub fn with_builtin_tools() -> Self {
        let mut registry = Self::new();

        // 注册所有内置工具
        registry.register(Arc::new(super::ReadFileTool));
        registry.register(Arc::new(super::ListFilesTool));
        registry.register(Arc::new(super::SearchInFileTool));
        registry.register(Arc::new(super::GrepFilesTool));
        registry.register(Arc::new(super::BashTool));
        registry.register(Arc::new(super::WriteFileTool));
        registry.register(Arc::new(super::EditFileTool));
        registry.register(Arc::new(super::AnalyzeCsvTool));

        registry
    }

    /// 创建带有 Volatility 工具的注册表
    pub fn with_volatility_tools(config: super::VolatilityConfig) -> Self {
        let mut registry = Self::with_builtin_tools();

        // 注册 Volatility 工具
        registry.register(Arc::new(super::Volatility2Tool::new(config.clone())));
        registry.register(Arc::new(super::Volatility3Tool::new(config)));

        registry
    }

    /// 创建带有所有扩展工具的注册表（包括 Volatility、代码和 Markdown 工具）
    pub fn with_all_tools(
        vol_config: super::VolatilityConfig,
        python_path: String,
        markdown_path: String,
    ) -> Self {
        let mut registry = Self::with_volatility_tools(vol_config.clone());

        // 注册代码工具
        registry.register(Arc::new(super::WriteCodeTool));
        registry.register(Arc::new(super::ExecuteCodeTool::new(python_path)));
        registry.register(Arc::new(super::ReadCodeTool));
        registry.register(Arc::new(super::ListCodeTool));

        // 注册 Markdown 文档工具
        registry.register(Arc::new(super::WriteMarkdownTool::new(
            markdown_path.clone(),
        )));
        registry.register(Arc::new(super::ReadMarkdownTool::new(
            markdown_path.clone(),
        )));
        registry.register(Arc::new(super::ListMarkdownTool::new(markdown_path)));

        // 注册取证工作流工具
        registry.register(Arc::new(super::ForensicWorkflowTool::new(
            vol_config.clone(),
        )));
        registry.register(Arc::new(super::ProcessAnalysisTool::new(
            vol_config.clone(),
        )));
        registry.register(Arc::new(super::ExtractIocTool::new(vol_config)));

        registry
    }

    /// 注册工具
    pub fn register(&mut self, tool: Arc<dyn Tool>) {
        self.tools.insert(tool.id().to_string(), tool);
    }

    /// 获取工具
    pub fn get(&self, id: &str) -> Option<Arc<dyn Tool>> {
        self.tools.get(id).cloned()
    }

    /// 检查工具是否存在
    pub fn has(&self, id: &str) -> bool {
        self.tools.contains_key(id)
    }

    /// 列出所有工具
    pub fn list(&self) -> Vec<Arc<dyn Tool>> {
        self.tools.values().cloned().collect()
    }

    /// 获取所有工具定义
    pub fn get_definitions(&self) -> Vec<ToolDefinition> {
        self.tools.values().map(|t| t.to_definition()).collect()
    }

    /// 获取指定工具列表的定义
    pub fn get_definitions_for(&self, tool_ids: &[String]) -> Vec<ToolDefinition> {
        tool_ids
            .iter()
            .filter_map(|id| self.tools.get(id))
            .map(|t| t.to_definition())
            .collect()
    }

    /// 执行工具
    pub async fn execute(
        &self,
        tool_id: &str,
        args: serde_json::Value,
        ctx: &ToolContext,
    ) -> ToolCallResult {
        match self.tools.get(tool_id) {
            Some(tool) => tool.execute(args, ctx).await,
            None => ToolCallResult {
                call_id: String::new(),
                name: tool_id.to_string(),
                output: format!("工具 '{}' 不存在", tool_id),
                success: false,
                metadata: None,
                duration_ms: 0,
                truncated: false,
            },
        }
    }

    /// 使用验证管道执行工具（验证 → 计时 → 截断）
    pub async fn execute_validated(
        &self,
        tool_id: &str,
        args: serde_json::Value,
        ctx: &ToolContext,
    ) -> ToolCallResult {
        match self.tools.get(tool_id) {
            Some(tool) => tool.execute_validated(args, ctx).await,
            None => ToolCallResult {
                call_id: String::new(),
                name: tool_id.to_string(),
                output: format!("工具 '{}' 不存在", tool_id),
                success: false,
                metadata: None,
                duration_ms: 0,
                truncated: false,
            },
        }
    }

    /// 获取工具的并发安全性标记
    pub fn get_concurrency_safety(&self, tool_id: &str) -> crate::ai_v2::types::ConcurrencySafety {
        match self.tools.get(tool_id) {
            Some(tool) => tool.concurrency_safety(),
            None => crate::ai_v2::types::ConcurrencySafety::Unsafe,
        }
    }

    /// 获取工具的动态活动描述
    pub fn get_activity_description(&self, tool_id: &str, args: &serde_json::Value) -> String {
        match self.tools.get(tool_id) {
            Some(tool) => tool.activity_description(args),
            None => format!("未知工具: {}", tool_id),
        }
    }
}

impl Default for ToolRegistry {
    fn default() -> Self {
        Self::with_builtin_tools()
    }
}
