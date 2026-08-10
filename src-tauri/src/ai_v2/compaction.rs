//! 上下文压缩模块
//! 基于 OpenCode 的上下文管理机制

use serde::{Deserialize, Serialize};

/// 压缩配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompactionConfig {
    /// 是否启用自动压缩
    pub auto_enabled: bool,
    /// 触发压缩的阈值（上下文使用率百分比）
    pub threshold: f32,
    /// 是否启用工具输出修剪
    pub prune_enabled: bool,
    /// 保护的工具输出 token 数量
    pub prune_protect_tokens: usize,
    /// 最小可修剪 token 数量
    pub prune_minimum_tokens: usize,
}

impl Default for CompactionConfig {
    fn default() -> Self {
        Self {
            auto_enabled: true,
            threshold: 0.85, // 85% 使用率时触发
            prune_enabled: true,
            prune_protect_tokens: 40_000,
            prune_minimum_tokens: 20_000,
        }
    }
}

/// 压缩提示词
pub const COMPACTION_SYSTEM_PROMPT: &str =
    r#"你是一个专业的对话摘要助手。你的任务是创建详细但简洁的对话摘要，以便对话可以无缝继续。"#;

pub const COMPACTION_USER_PROMPT: &str = r#"请总结上述对话。这个摘要将是对话继续时唯一可用的上下文，因此请保留关键信息，包括：

1. **已完成的工作**：完成了哪些任务
2. **当前状态**：修改了哪些文件，当前状态如何
3. **进行中的工作**：正在进行什么
4. **下一步计划**：明确的后续行动
5. **约束条件**：用户偏好、项目要求、已做出的关键决策
6. **关键上下文**：继续工作所必需的任何信息

请简洁但保留足够的细节，以便工作可以无缝继续。"#;

/// 估算文本的 token 数量（粗略估计）
pub fn estimate_tokens(text: &str) -> usize {
    // 简单估算：中文约 1.5 字符/token，英文约 4 字符/token
    // 这里使用保守估计：2 字符/token
    text.chars().count() / 2
}

/// 检查是否需要压缩
pub fn should_compact(
    current_tokens: usize,
    context_limit: usize,
    output_limit: usize,
    config: &CompactionConfig,
) -> bool {
    if !config.auto_enabled {
        return false;
    }

    let available_tokens = context_limit.saturating_sub(output_limit);
    let usage_ratio = current_tokens as f32 / available_tokens as f32;

    usage_ratio >= config.threshold
}

/// 消息类型（用于压缩逻辑）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompactMessage {
    pub role: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
    #[serde(default)]
    pub is_summary: bool,
}

/// 修剪工具输出
pub fn prune_tool_outputs(messages: &mut Vec<CompactMessage>, config: &CompactionConfig) -> usize {
    if !config.prune_enabled {
        return 0;
    }

    let mut pruned_tokens = 0;
    let mut protected_tokens = 0;

    // 从后往前扫描，保护最近的工具输出
    for msg in messages.iter_mut().rev() {
        if msg.role == "tool" {
            let msg_tokens = estimate_tokens(&msg.content);

            if protected_tokens < config.prune_protect_tokens {
                // 保护这条消息
                protected_tokens += msg_tokens;
            } else if pruned_tokens + msg_tokens >= config.prune_minimum_tokens {
                // 修剪这条消息
                msg.content = "[工具输出已修剪以节省上下文空间]".to_string();
                pruned_tokens += msg_tokens;
            }
        }
    }

    pruned_tokens
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_estimate_tokens() {
        assert!(estimate_tokens("Hello World") > 0);
        assert!(estimate_tokens("你好世界") > 0);
    }

    #[test]
    fn test_should_compact() {
        let config = CompactionConfig::default();

        // 未达到阈值
        assert!(!should_compact(1000, 10000, 2000, &config));

        // 达到阈值
        assert!(should_compact(7000, 10000, 2000, &config));
    }

    #[test]
    fn test_prune_tool_outputs() {
        let config = CompactionConfig {
            prune_enabled: true,
            prune_protect_tokens: 100,
            prune_minimum_tokens: 50,
            ..Default::default()
        };

        let mut messages = vec![
            CompactMessage {
                role: "tool".to_string(),
                content: "A".repeat(200),
                reasoning_content: None,
                tool_calls: None,
                tool_call_id: Some("1".to_string()),
                is_summary: false,
            },
            CompactMessage {
                role: "tool".to_string(),
                content: "B".repeat(200),
                reasoning_content: None,
                tool_calls: None,
                tool_call_id: Some("2".to_string()),
                is_summary: false,
            },
        ];

        let pruned = prune_tool_outputs(&mut messages, &config);
        assert!(pruned > 0);
    }
}
