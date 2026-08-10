//! 工具模块 - 模块化工具系统
//! 参考 Claude Code 架构升级：工具验证、并发安全标记、结果截断

mod analyze_csv;
mod bash;
mod code;
mod edit_file;
mod forensic_workflow;
mod list_files;
mod read_file;
mod registry;
mod search;
mod volatility;
mod write_file;

pub use analyze_csv::AnalyzeCsvTool;
pub use bash::BashTool;
pub use code::{
    ExecuteCodeTool, ListCodeTool, ListMarkdownTool, ReadCodeTool, ReadMarkdownTool, WriteCodeTool,
    WriteMarkdownTool,
};
pub use edit_file::EditFileTool;
pub use forensic_workflow::{ExtractIocTool, ForensicWorkflowTool, ProcessAnalysisTool};
pub use list_files::ListFilesTool;
pub use read_file::ReadFileTool;
pub use registry::ToolRegistry;
pub use search::{GrepFilesTool, SearchInFileTool};
pub use volatility::{Volatility2Tool, Volatility3Tool, VolatilityConfig};
pub use write_file::WriteFileTool;

use crate::ai_v2::types::{
    ConcurrencySafety, MAX_TOOL_RESULT_CHARS, TRUNCATED_PREVIEW_CHARS, ToolCallResult, ToolContext,
    ToolDefinition, ValidationResult,
};
use async_trait::async_trait;

/// 工具特征（增强版 - 参考 Claude Code Tool 接口）
#[async_trait]
pub trait Tool: Send + Sync {
    /// 获取工具ID
    fn id(&self) -> &str;

    /// 获取工具名称
    fn name(&self) -> &str;

    /// 获取工具描述
    fn description(&self) -> &str;

    /// 获取参数定义
    fn parameters(&self) -> serde_json::Value;

    /// 执行工具
    async fn execute(&self, args: serde_json::Value, ctx: &ToolContext) -> ToolCallResult;

    /// 验证输入参数（参考 Claude Code Tool.validateInput）
    /// 在 execute 之前调用，验证失败时返回错误信息给模型
    fn validate_input(&self, _args: &serde_json::Value) -> ValidationResult {
        ValidationResult::Valid
    }

    /// 并发安全性标记（参考 Claude Code Tool.isConcurrencySafe）
    /// Safe = 只读操作，可以和其他 Safe 工具并行执行
    /// Unsafe = 有副作用，必须独占执行
    fn concurrency_safety(&self) -> ConcurrencySafety {
        ConcurrencySafety::Unsafe // 默认保守策略
    }

    /// 是否为只读操作（参考 Claude Code Tool.isReadOnly）
    fn is_read_only(&self) -> bool {
        false
    }

    /// 最大结果字符数（参考 Claude Code Tool.maxResultSizeChars）
    /// 超过此值的结果会被截断并保存到文件
    fn max_result_size(&self) -> usize {
        MAX_TOOL_RESULT_CHARS
    }

    /// 获取动态活动描述（参考 Claude Code Tool.getActivityDescription）
    /// 返回基于输入参数的描述，如 "正在读取 config.json"
    fn activity_description(&self, _args: &serde_json::Value) -> String {
        format!("正在执行 {}", self.name())
    }

    /// 转换为API定义
    fn to_definition(&self) -> ToolDefinition {
        ToolDefinition {
            tool_type: "function".to_string(),
            function: crate::ai_v2::types::FunctionDefinition {
                name: self.name().to_string(),
                description: self.description().to_string(),
                parameters: self.parameters(),
            },
        }
    }

    /// 带验证和截断的执行包装（参考 Claude Code 的工具执行管道）
    async fn execute_validated(
        &self,
        args: serde_json::Value,
        ctx: &ToolContext,
    ) -> ToolCallResult {
        // 1. 验证输入
        if let ValidationResult::Invalid { message } = self.validate_input(&args) {
            return ToolCallResult {
                call_id: String::new(),
                name: self.name().to_string(),
                output: format!("输入验证失败: {}", message),
                success: false,
                metadata: None,
                duration_ms: 0,
                truncated: false,
            };
        }

        // 2. 执行工具（计时）
        let start = std::time::Instant::now();
        let mut result = self.execute(args, ctx).await;
        result.duration_ms = start.elapsed().as_millis() as u64;

        // 3. 检查结果大小，必要时截断
        let max_size = self.max_result_size();
        if result.output.len() > max_size {
            let preview = &result.output[..TRUNCATED_PREVIEW_CHARS.min(result.output.len())];
            let total_chars = result.output.len();
            result.output = format!(
                "[结果已截断: 原始大小 {} 字符，显示前 {} 字符]\n\n{}...\n\n[使用 read_file 工具查看完整内容]",
                total_chars, TRUNCATED_PREVIEW_CHARS, preview
            );
            result.truncated = true;
        }

        result
    }
}
