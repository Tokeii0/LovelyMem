use crate::ai_v2::provider::{ProviderType, build_endpoint};
use crate::settings::{load_settings, save_settings, update_settings};
use crate::types::AiProvider;

fn is_local_provider(base_url: &str) -> bool {
    matches!(ProviderType::from_url(base_url), ProviderType::Ollama)
}

fn sanitize_provider(mut provider: AiProvider) -> Result<AiProvider, String> {
    provider.id = provider.id.trim().to_string();
    provider.name = provider.name.trim().to_string();
    provider.base_url = provider.base_url.trim().trim_end_matches('/').to_string();
    provider.model = provider.model.trim().to_string();
    provider.api_key = provider.api_key.trim().to_string();
    provider.custom_prompt = provider.custom_prompt.and_then(|prompt| {
        let trimmed = prompt.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    });

    if provider.id.is_empty() {
        return Err("提供商 ID 不能为空".to_string());
    }
    if provider.name.is_empty() {
        return Err("提供商名称不能为空".to_string());
    }
    if provider.base_url.is_empty() {
        return Err("Base URL 不能为空".to_string());
    }
    if provider.model.is_empty() {
        return Err("模型名称不能为空".to_string());
    }
    if provider.api_key.is_empty() && !is_local_provider(&provider.base_url) {
        return Err("API Key 不能为空（Ollama 本地模型可留空）".to_string());
    }

    Ok(provider)
}

fn first_enabled_provider_id(providers: &[AiProvider]) -> Option<String> {
    providers.iter().find(|p| p.enabled).map(|p| p.id.clone())
}

/// 加载所有AI提供商
#[tauri::command]
pub fn load_ai_providers() -> Result<Vec<AiProvider>, String> {
    let settings = load_settings()?;
    debug_info!("🤖 加载AI提供商，数量: {}", settings.ai_providers.len());
    Ok(settings.ai_providers)
}

/// 添加AI提供商
#[tauri::command]
pub fn add_ai_provider(provider: AiProvider) -> Result<(), String> {
    let provider = sanitize_provider(provider)?;
    debug_info!("🤖 添加AI提供商: {:?}", provider.name);

    let mut duplicate = false;
    update_settings(|settings| {
        if settings.ai_providers.iter().any(|p| p.id == provider.id) {
            duplicate = true;
            return;
        }

        let current_provider_exists = settings
            .current_ai_provider_id
            .as_ref()
            .is_some_and(|id| settings.ai_providers.iter().any(|p| &p.id == id));
        let should_select =
            provider.enabled && (settings.ai_providers.is_empty() || !current_provider_exists);
        settings.ai_providers.push(provider.clone());
        if should_select {
            settings.current_ai_provider_id = Some(provider.id.clone());
        }
    })?;

    if duplicate {
        Err("提供商已存在".to_string())
    } else {
        Ok(())
    }
}

/// 更新AI提供商
#[tauri::command]
pub fn update_ai_provider(provider_id: String, updated_provider: AiProvider) -> Result<(), String> {
    let mut updated_provider = updated_provider;
    updated_provider.id = provider_id.clone();
    let mut updated_provider = sanitize_provider(updated_provider)?;

    let mut found = false;
    update_settings(|settings| {
        if let Some(existing_provider) = settings
            .ai_providers
            .iter_mut()
            .find(|p| p.id == provider_id)
        {
            found = true;
            updated_provider.created_at = existing_provider.created_at.clone();
            *existing_provider = updated_provider.clone();
        }

        if settings.current_ai_provider_id.as_ref() == Some(&provider_id)
            && !settings
                .ai_providers
                .iter()
                .any(|p| p.id == provider_id && p.enabled)
        {
            settings.current_ai_provider_id = first_enabled_provider_id(&settings.ai_providers);
        }
    })?;

    if found {
        Ok(())
    } else {
        Err("提供商未找到".to_string())
    }
}

/// 删除AI提供商
#[tauri::command]
pub fn delete_ai_provider(provider_id: String) -> Result<(), String> {
    update_settings(|settings| {
        settings.ai_providers.retain(|p| p.id != provider_id);
        if settings.current_ai_provider_id.as_ref() == Some(&provider_id) {
            settings.current_ai_provider_id = first_enabled_provider_id(&settings.ai_providers);
        }
    })
}

/// 设置当前AI提供商
#[tauri::command]
pub fn set_current_ai_provider(provider_id: String) -> Result<(), String> {
    let mut settings = load_settings()?;

    // 验证提供商是否存在
    let provider = settings.ai_providers.iter().find(|p| p.id == provider_id);
    match provider {
        None => return Err("提供商不存在".to_string()),
        Some(p) => {
            if !p.enabled {
                return Err(format!("提供商 {} 已禁用，不能设为当前使用", p.name));
            }
        }
    }

    settings.current_ai_provider_id = Some(provider_id.clone());
    debug_info!("🤖 设置当前AI提供商: {}", provider_id);
    save_settings(settings)
}

/// 获取当前AI提供商
#[tauri::command]
pub fn get_current_ai_provider() -> Result<Option<AiProvider>, String> {
    let settings = load_settings()?;

    if let Some(provider_id) = &settings.current_ai_provider_id {
        let provider = settings
            .ai_providers
            .iter()
            .find(|p| &p.id == provider_id && p.enabled)
            .cloned();

        if provider.is_some() {
            debug_info!("🤖 获取当前AI提供商: {}", provider_id);
        } else {
            debug_info!("⚠️ 当前选中的提供商不存在: {}", provider_id);
        }

        Ok(provider)
    } else {
        debug_info!("🤖 未设置当前AI提供商");
        Ok(None)
    }
}

/// 切换AI提供商启用状态
#[tauri::command]
pub fn toggle_ai_provider(provider_id: String) -> Result<(), String> {
    let mut found = false;
    update_settings(|settings| {
        if let Some(provider) = settings
            .ai_providers
            .iter_mut()
            .find(|p| p.id == provider_id)
        {
            found = true;
            provider.enabled = !provider.enabled;
            provider.updated_at = chrono::Utc::now().to_rfc3339();
        }

        if settings.current_ai_provider_id.as_ref() == Some(&provider_id)
            && !settings
                .ai_providers
                .iter()
                .any(|p| p.id == provider_id && p.enabled)
        {
            settings.current_ai_provider_id = first_enabled_provider_id(&settings.ai_providers);
        }
    })?;

    if found {
        Ok(())
    } else {
        Err("提供商未找到".to_string())
    }
}

/// 构建获取模型列表的端点
fn build_models_endpoint(base_url: &str, provider: ProviderType) -> String {
    let mut base = base_url.trim_end_matches('/').to_string();
    let lower = base.to_lowercase();
    // 去除聊天端点后缀，回退到根路径
    for suffix in [
        "/chat/completions",
        "/v1/messages",
        "/messages",
        "/api/chat",
    ] {
        if lower.ends_with(suffix) {
            base.truncate(base.len() - suffix.len());
            break;
        }
    }
    let base = base.trim_end_matches('/').to_string();
    let lower = base.to_lowercase();

    match provider {
        // Ollama 使用 /api/tags
        ProviderType::Ollama => {
            let root = if lower.ends_with("/v1") {
                base[..base.len() - 3].trim_end_matches('/')
            } else {
                base.as_str()
            };
            format!("{}/api/tags", root)
        }
        ProviderType::Anthropic => {
            if lower.ends_with("/v1") {
                format!("{}/models", base)
            } else {
                format!("{}/v1/models", base)
            }
        }
        // OpenAI 兼容接口：若已含版本段则直接追加 /models
        _ => {
            if lower.ends_with("/v1")
                || lower.ends_with("/v2")
                || lower.ends_with("/v3")
                || lower.ends_with("/v4")
            {
                format!("{}/models", base)
            } else {
                format!("{}/v1/models", base)
            }
        }
    }
}

/// 拉取指定服务可用的模型列表
#[tauri::command]
pub async fn fetch_ai_models(base_url: String, api_key: String) -> Result<Vec<String>, String> {
    let base_url = base_url.trim().trim_end_matches('/').to_string();
    let api_key = api_key.trim().to_string();
    if base_url.is_empty() {
        return Err("Base URL 不能为空".to_string());
    }

    let provider = ProviderType::from_url(&base_url);
    if api_key.is_empty() && !matches!(provider, ProviderType::Ollama) {
        return Err("API Key 不能为空（Ollama 本地模型可留空）".to_string());
    }

    let endpoint = build_models_endpoint(&base_url, provider);
    let client = crate::network_utils::http_client();

    let mut req = client
        .get(&endpoint)
        .header("Content-Type", "application/json");
    match provider {
        ProviderType::Anthropic => {
            req = req
                .header("x-api-key", &api_key)
                .header("anthropic-version", "2023-06-01");
        }
        ProviderType::Azure => {
            req = req.header("api-key", &api_key);
        }
        ProviderType::Ollama => {}
        _ => {
            if !api_key.is_empty() {
                req = req.header("Authorization", format!("Bearer {}", api_key));
            }
        }
    }

    let response = req.send().await.map_err(|e| format!("请求失败: {}", e))?;

    let status = response.status();
    let text = response.text().await.unwrap_or_default();

    if !status.is_success() {
        let short_error: String = text.trim().chars().take(200).collect();
        return Err(format!(
            "拉取模型失败 ({}): {}",
            status.as_u16(),
            short_error
        ));
    }

    let json: serde_json::Value =
        serde_json::from_str(&text).map_err(|_| "响应不是有效的 JSON".to_string())?;

    let mut models: Vec<String> = Vec::new();

    // OpenAI / Anthropic 兼容格式: { "data": [{ "id": "..." }] }
    if let Some(arr) = json.get("data").and_then(|v| v.as_array()) {
        for item in arr {
            if let Some(id) = item.get("id").and_then(|v| v.as_str()) {
                models.push(id.to_string());
            }
        }
    }

    // Ollama 格式: { "models": [{ "name": "..." }] }
    if models.is_empty() {
        if let Some(arr) = json.get("models").and_then(|v| v.as_array()) {
            for item in arr {
                if let Some(name) = item
                    .get("name")
                    .or_else(|| item.get("model"))
                    .and_then(|v| v.as_str())
                {
                    models.push(name.to_string());
                }
            }
        }
    }

    // 顶层直接是数组的情况
    if models.is_empty() {
        if let Some(arr) = json.as_array() {
            for item in arr {
                if let Some(id) = item
                    .get("id")
                    .or_else(|| item.get("name"))
                    .and_then(|v| v.as_str())
                {
                    models.push(id.to_string());
                } else if let Some(s) = item.as_str() {
                    models.push(s.to_string());
                }
            }
        }
    }

    if models.is_empty() {
        return Err("未能从响应中解析出模型列表".to_string());
    }

    models.sort();
    models.dedup();
    Ok(models)
}

/// 测试AI连接
#[tauri::command]
pub async fn test_ai_connection(
    base_url: String,
    api_key: String,
    model: String,
) -> Result<serde_json::Value, String> {
    use std::time::Instant;

    let start = Instant::now();
    let base_url = base_url.trim().trim_end_matches('/').to_string();
    let model = model.trim().to_string();
    let api_key = api_key.trim().to_string();
    if base_url.is_empty() {
        return Err("Base URL 不能为空".to_string());
    }
    if model.is_empty() {
        return Err("模型名称不能为空".to_string());
    }

    let provider = ProviderType::from_url(&base_url);
    let is_anthropic = provider.uses_claude_format();
    if api_key.is_empty() && !matches!(provider, ProviderType::Ollama) {
        return Err("API Key 不能为空（Ollama 本地模型可留空）".to_string());
    }

    let client = crate::network_utils::http_client();

    let (endpoint, request_body, auth_header) = if is_anthropic {
        let endpoint = build_endpoint(&base_url, provider);
        let body = serde_json::json!({
            "model": model,
            "messages": [{"role": "user", "content": "Hi"}],
            "max_tokens": 5
        });
        (endpoint, body, None)
    } else {
        let endpoint = build_endpoint(&base_url, provider);
        let body = serde_json::json!({
            "model": model,
            "messages": [{"role": "user", "content": "Hi"}],
            "max_tokens": 5
        });
        (endpoint, body, Some(format!("Bearer {}", api_key)))
    };

    let mut req = client
        .post(&endpoint)
        .header("Content-Type", "application/json")
        .json(&request_body);

    if is_anthropic {
        req = req
            .header("x-api-key", &api_key)
            .header("anthropic-version", "2023-06-01");
    } else if let Some(auth) = auth_header {
        req = req.header("Authorization", auth);
    }

    match req.send().await {
        Ok(response) => {
            let latency_ms = start.elapsed().as_millis();
            let status = response.status().as_u16();

            if response.status().is_success() {
                let response_text = response.text().await.unwrap_or_default();
                if serde_json::from_str::<serde_json::Value>(&response_text).is_err() {
                    let preview: String = response_text.trim().chars().take(120).collect();
                    return Ok(serde_json::json!({
                        "success": false,
                        "latency_ms": latency_ms,
                        "status": status,
                        "message": format!("连接到服务，但响应不是 JSON：{}", preview)
                    }));
                }

                Ok(serde_json::json!({
                    "success": true,
                    "latency_ms": latency_ms,
                    "status": status,
                    "message": format!("连接成功 ({}ms)", latency_ms)
                }))
            } else {
                let error_text = response.text().await.unwrap_or_default();
                let short_error = if error_text.len() > 200 {
                    format!("{}...", &error_text[..200])
                } else {
                    error_text
                };
                Ok(serde_json::json!({
                    "success": false,
                    "latency_ms": latency_ms,
                    "status": status,
                    "message": format!("API返回错误 ({}): {}", status, short_error)
                }))
            }
        }
        Err(e) => {
            let latency_ms = start.elapsed().as_millis();
            Ok(serde_json::json!({
                "success": false,
                "latency_ms": latency_ms,
                "status": 0,
                "message": format!("连接失败: {}", e)
            }))
        }
    }
}
