//! AI V2 类型定义
//! 参考 Claude Code 架构升级：并发工具执行、Token追踪、增强事件、工具验证

use serde::{Deserialize, Serialize};

/// Agent 步骤类型（增强版 - 参考 Claude Code 的精细事件）
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AgentStep {
    pub step_type: String, // "thinking", "tool_call", "tool_result", "final_answer", "error", "compaction", "retry", "parallel_tools"
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tool_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tool_args: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub iteration: Option<u32>,
    /// 工具执行耗时（毫秒）
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub duration_ms: Option<u64>,
    /// 本轮 Token 使用情况
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub usage: Option<TokenUsage>,
}

/// Token 使用追踪（参考 Claude Code 的 cost-tracker）
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TokenUsage {
    pub input_tokens: u64,
    pub output_tokens: u64,
    #[serde(default)]
    pub cache_read_tokens: u64,
    #[serde(default)]
    pub cache_creation_tokens: u64,
    /// 估算成本（USD）
    #[serde(default)]
    pub cost_usd: f64,
}

impl TokenUsage {
    /// 累加另一个 TokenUsage
    pub fn accumulate(&mut self, other: &TokenUsage) {
        self.input_tokens += other.input_tokens;
        self.output_tokens += other.output_tokens;
        self.cache_read_tokens += other.cache_read_tokens;
        self.cache_creation_tokens += other.cache_creation_tokens;
        self.cost_usd += other.cost_usd;
    }

    /// 从 API 响应中提取 Token 使用情况
    pub fn from_api_response(json: &serde_json::Value, is_claude: bool) -> Self {
        if is_claude {
            let usage = &json["usage"];
            TokenUsage {
                input_tokens: usage["input_tokens"].as_u64().unwrap_or(0),
                output_tokens: usage["output_tokens"].as_u64().unwrap_or(0),
                cache_read_tokens: usage["cache_read_input_tokens"].as_u64().unwrap_or(0),
                cache_creation_tokens: usage["cache_creation_input_tokens"].as_u64().unwrap_or(0),
                cost_usd: 0.0,
            }
        } else {
            let usage = &json["usage"];
            TokenUsage {
                input_tokens: usage["prompt_tokens"].as_u64().unwrap_or(0),
                output_tokens: usage["completion_tokens"].as_u64().unwrap_or(0),
                cache_read_tokens: usage["prompt_tokens_details"]["cached_tokens"]
                    .as_u64()
                    .unwrap_or(0),
                cache_creation_tokens: 0,
                cost_usd: 0.0,
            }
        }
    }
}

/// 会话级别的累计使用量追踪
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SessionUsage {
    pub total: TokenUsage,
    pub per_iteration: Vec<TokenUsage>,
    pub total_tool_duration_ms: u64,
    pub total_api_duration_ms: u64,
    pub iteration_count: u32,
}

/// 工具调用请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallRequest {
    pub id: String,
    pub name: String,
    pub arguments: serde_json::Value,
}

/// 工具调用结果（增强版）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallResult {
    pub call_id: String,
    pub name: String,
    pub output: String,
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
    /// 执行耗时（毫秒）
    #[serde(default)]
    pub duration_ms: u64,
    /// 输出是否被截断（参考 Claude Code 的 maxResultSizeChars）
    #[serde(default)]
    pub truncated: bool,
}

impl ToolCallResult {
    /// 创建成功结果
    pub fn success(name: &str, output: String) -> Self {
        Self {
            call_id: String::new(),
            name: name.to_string(),
            output,
            success: true,
            metadata: None,
            duration_ms: 0,
            truncated: false,
        }
    }

    /// 创建失败结果
    pub fn error(name: &str, message: String) -> Self {
        Self {
            call_id: String::new(),
            name: name.to_string(),
            output: message,
            success: false,
            metadata: None,
            duration_ms: 0,
            truncated: false,
        }
    }
}

impl Default for ToolCallResult {
    fn default() -> Self {
        Self {
            call_id: String::new(),
            name: String::new(),
            output: String::new(),
            success: false,
            metadata: None,
            duration_ms: 0,
            truncated: false,
        }
    }
}

/// 工具验证结果（参考 Claude Code Tool.validateInput）
#[derive(Debug, Clone)]
pub enum ValidationResult {
    Valid,
    Invalid { message: String },
}

/// 工具并发安全标记（参考 Claude Code Tool.isConcurrencySafe）
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConcurrencySafety {
    /// 可以安全并行执行（只读操作）
    Safe,
    /// 不可并行执行（有副作用的操作）
    Unsafe,
}

/// 继续执行的原因（参考 Claude Code 的 Continue 状态机）
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ContinueReason {
    /// 正常工具执行后继续
    NextTurn,
    /// 上下文压缩后重试
    CompactionRetry,
    /// 错误恢复后重试
    ErrorRecovery,
    /// Token 超限恢复
    TokenBudgetRecovery,
}

/// Agent 配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    pub name: String,
    pub description: Option<String>,
    pub max_iterations: u32,
    pub temperature: f32,
    pub tools: Vec<String>,
    /// 最大输出 Token（参考 Claude Code 的 maxOutputTokens 升级机制）
    #[serde(default = "default_max_tokens")]
    pub max_output_tokens: u32,
}

fn default_max_tokens() -> u32 {
    4096
}

/// 内置代理类型
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AgentType {
    Build,
    Plan,
    Explore,
    General,
    /// 新增：专业取证代理
    Forensic,
}

impl AgentType {
    pub fn config(&self) -> AgentConfig {
        match self {
            AgentType::Build => AgentConfig {
                name: "build".to_string(),
                description: Some("构建代理 - 编写和修改代码".to_string()),
                max_iterations: 20,
                temperature: 0.7,
                max_output_tokens: 4096,
                tools: vec![
                    "read_file".to_string(),
                    "write_file".to_string(),
                    "edit_file".to_string(),
                    "list_files".to_string(),
                    "search_in_file".to_string(),
                    "grep_files".to_string(),
                    "bash".to_string(),
                ],
            },
            AgentType::Plan => AgentConfig {
                name: "plan".to_string(),
                description: Some("规划代理 - 分析需求、制定计划".to_string()),
                max_iterations: 10,
                temperature: 0.5,
                max_output_tokens: 4096,
                tools: vec![
                    "read_file".to_string(),
                    "list_files".to_string(),
                    "search_in_file".to_string(),
                ],
            },
            AgentType::Explore => AgentConfig {
                name: "explore".to_string(),
                description: Some("探索代理 - 快速搜索和分析".to_string()),
                max_iterations: 15,
                temperature: 0.3,
                max_output_tokens: 4096,
                tools: vec![
                    "read_file".to_string(),
                    "list_files".to_string(),
                    "search_in_file".to_string(),
                    "grep_files".to_string(),
                ],
            },
            AgentType::General => AgentConfig {
                name: "general".to_string(),
                description: Some("通用代理 - 处理复杂任务".to_string()),
                max_iterations: 25,
                temperature: 0.7,
                max_output_tokens: 4096,
                tools: vec![
                    "read_file".to_string(),
                    "write_file".to_string(),
                    "edit_file".to_string(),
                    "list_files".to_string(),
                    "search_in_file".to_string(),
                    "grep_files".to_string(),
                    "bash".to_string(),
                    "analyze_csv".to_string(),
                ],
            },
            AgentType::Forensic => AgentConfig {
                name: "forensic".to_string(),
                description: Some("取证代理 - 内存取证分析专家".to_string()),
                max_iterations: 30,
                temperature: 0.3,
                max_output_tokens: 8192,
                tools: vec![
                    "read_file".to_string(),
                    "list_files".to_string(),
                    "search_in_file".to_string(),
                    "grep_files".to_string(),
                    "analyze_csv".to_string(),
                    "volatility2".to_string(),
                    "volatility3".to_string(),
                    "forensic_workflow".to_string(),
                    "process_analysis".to_string(),
                    "extract_ioc".to_string(),
                    "write_markdown".to_string(),
                    "write_code".to_string(),
                    "execute_code".to_string(),
                ],
            },
        }
    }
}

/// 工具定义（用于API）
#[derive(Debug, Clone, Serialize)]
pub struct ToolDefinition {
    #[serde(rename = "type")]
    pub tool_type: String,
    pub function: FunctionDefinition,
}

/// 函数定义
#[derive(Debug, Clone, Serialize)]
pub struct FunctionDefinition {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
}

/// 工具执行上下文（增强版）
#[derive(Debug, Clone)]
pub struct ToolContext {
    pub session_id: String,
    pub working_directory: String,
    pub output_path: String,
}

/// 工具结果大小限制（参考 Claude Code 的 maxResultSizeChars）
pub const MAX_TOOL_RESULT_CHARS: usize = 100_000;
/// 截断后的预览大小
pub const TRUNCATED_PREVIEW_CHARS: usize = 5_000;
