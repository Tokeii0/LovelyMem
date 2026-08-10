//! Provider 模块 - AI 模型提供商

use serde::{Deserialize, Serialize};

/// 支持的提供商类型
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProviderType {
    OpenAI,
    Anthropic,
    Google,
    DeepSeek,
    Ollama,
    Azure,
    Volcengine, // 火山引擎/豆包
    Custom,
}

impl ProviderType {
    /// 从URL检测提供商类型
    pub fn from_url(url: &str) -> Self {
        let url_lower = url.to_lowercase();
        if url_lower.contains("anthropic") || url_lower.ends_with("/v1/messages") {
            ProviderType::Anthropic
        } else if url_lower.contains("googleapis") || url_lower.contains("google") {
            ProviderType::Google
        } else if url_lower.contains("deepseek") {
            ProviderType::DeepSeek
        } else if url_lower.contains("localhost:11434") || url_lower.contains("ollama") {
            ProviderType::Ollama
        } else if url_lower.contains("azure") {
            ProviderType::Azure
        } else if url_lower.contains("volces")
            || url_lower.contains("volcengine")
            || url_lower.contains("ark.cn")
        {
            ProviderType::Volcengine
        } else if url_lower.contains("openai") {
            ProviderType::OpenAI
        } else {
            ProviderType::Custom
        }
    }

    /// 检查是否需要特殊的API格式
    pub fn uses_claude_format(&self) -> bool {
        matches!(self, ProviderType::Anthropic)
    }

    /// 获取API版本头
    pub fn api_version(&self) -> Option<&'static str> {
        match self {
            ProviderType::Anthropic => Some("2023-06-01"),
            _ => None,
        }
    }
}

/// 模型信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub max_tokens: u32,
    pub supports_tools: bool,
    pub supports_streaming: bool,
    pub supports_vision: bool,
}

/// 默认模型列表
pub fn get_default_models() -> Vec<ModelInfo> {
    vec![
        // OpenAI
        ModelInfo {
            id: "gpt-4o".to_string(),
            name: "GPT-4o".to_string(),
            provider: "openai".to_string(),
            max_tokens: 128000,
            supports_tools: true,
            supports_streaming: true,
            supports_vision: true,
        },
        ModelInfo {
            id: "gpt-4o-mini".to_string(),
            name: "GPT-4o Mini".to_string(),
            provider: "openai".to_string(),
            max_tokens: 128000,
            supports_tools: true,
            supports_streaming: true,
            supports_vision: true,
        },
        // Anthropic
        ModelInfo {
            id: "claude-sonnet-4-20250514".to_string(),
            name: "Claude Sonnet 4".to_string(),
            provider: "anthropic".to_string(),
            max_tokens: 200000,
            supports_tools: true,
            supports_streaming: true,
            supports_vision: true,
        },
        ModelInfo {
            id: "claude-3-5-sonnet-20241022".to_string(),
            name: "Claude 3.5 Sonnet".to_string(),
            provider: "anthropic".to_string(),
            max_tokens: 200000,
            supports_tools: true,
            supports_streaming: true,
            supports_vision: true,
        },
        // DeepSeek
        ModelInfo {
            id: "deepseek-chat".to_string(),
            name: "DeepSeek Chat".to_string(),
            provider: "deepseek".to_string(),
            max_tokens: 64000,
            supports_tools: true,
            supports_streaming: true,
            supports_vision: false,
        },
        ModelInfo {
            id: "deepseek-reasoner".to_string(),
            name: "DeepSeek Reasoner".to_string(),
            provider: "deepseek".to_string(),
            max_tokens: 64000,
            supports_tools: true,
            supports_streaming: true,
            supports_vision: false,
        },
        // Google
        ModelInfo {
            id: "gemini-2.0-flash".to_string(),
            name: "Gemini 2.0 Flash".to_string(),
            provider: "google".to_string(),
            max_tokens: 1000000,
            supports_tools: true,
            supports_streaming: true,
            supports_vision: true,
        },
    ]
}

/// 获取API请求头
pub fn get_headers(provider: ProviderType, api_key: &str) -> Vec<(String, String)> {
    let mut headers = vec![("Content-Type".to_string(), "application/json".to_string())];

    match provider {
        ProviderType::Anthropic => {
            headers.push(("x-api-key".to_string(), api_key.to_string()));
            headers.push(("anthropic-version".to_string(), "2023-06-01".to_string()));
        }
        ProviderType::Azure => {
            headers.push(("api-key".to_string(), api_key.to_string()));
        }
        _ => {
            headers.push(("Authorization".to_string(), format!("Bearer {}", api_key)));
        }
    }

    headers
}

/// 构建API端点
pub fn build_endpoint(base_url: &str, provider: ProviderType) -> String {
    let base = base_url.trim_end_matches('/');
    let base_lower = base.to_lowercase();

    if base_lower.ends_with("/chat/completions")
        || base_lower.ends_with("/v1/messages")
        || base_lower.ends_with("/api/chat")
    {
        return base.to_string();
    }

    match provider {
        ProviderType::Anthropic => {
            if base_lower.ends_with("/v1") {
                format!("{}/messages", base)
            } else {
                format!("{}/v1/messages", base)
            }
        }
        ProviderType::Ollama => {
            if base_lower.ends_with("/v1") {
                format!("{}/chat/completions", base)
            } else {
                format!("{}/v1/chat/completions", base)
            }
        }
        // 火山引擎API - base_url已经包含完整路径，直接添加chat/completions
        ProviderType::Volcengine => format!("{}/chat/completions", base),
        _ => format!("{}/chat/completions", base),
    }
}
