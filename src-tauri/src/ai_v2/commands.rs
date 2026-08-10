//! AI V2 Tauri 命令
//! 参考 Claude Code 架构升级：并发工具执行、Token追踪、自动压缩、错误恢复

use crate::ai_v2::agent::{AgentRequest, AgentRunner, emit_thinking, emit_tool_call};
use crate::ai_v2::compaction::{self, CompactionConfig, estimate_tokens};
use crate::ai_v2::provider::{ProviderType, build_endpoint, get_headers};
use crate::ai_v2::types::{
    AgentStep, AgentType, ConcurrencySafety, ContinueReason, SessionUsage, TokenUsage, ToolContext,
};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::Emitter;

/// 全局取消标志
static AGENT_CANCELLED: AtomicBool = AtomicBool::new(false);
const MAX_API_RETRY_ATTEMPTS: u32 = 3;

/// 请求取消当前 Agent 执行
#[tauri::command]
pub async fn cancel_agent_v2() -> Result<(), String> {
    AGENT_CANCELLED.store(true, Ordering::SeqCst);
    debug_info!("🛑 收到取消请求");
    Ok(())
}

/// 检查是否已取消
fn is_agent_cancelled() -> bool {
    AGENT_CANCELLED.load(Ordering::SeqCst)
}

/// 等待取消信号，用于中断网络请求、流式读取和工具执行等待
async fn wait_for_agent_cancel() {
    while !is_agent_cancelled() {
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
    }
}

fn emit_agent_cancelled(
    app_handle: &tauri::AppHandle,
    window_label: &str,
    iteration: u32,
    usage: &SessionUsage,
) {
    let _ = app_handle.emit_to(
        window_label,
        "agent-step",
        AgentStep {
            step_type: "cancelled".to_string(),
            content: "Agent 执行已被用户取消".to_string(),
            tool_name: None,
            tool_args: None,
            iteration: Some(iteration),
            duration_ms: None,
            usage: Some(usage.total.clone()),
        },
    );
}

fn emit_retry_step(
    app_handle: &tauri::AppHandle,
    window_label: &str,
    iteration: u32,
    content: String,
) {
    let _ = app_handle.emit_to(
        window_label,
        "agent-step",
        AgentStep {
            step_type: "retry".to_string(),
            content,
            tool_name: None,
            tool_args: None,
            iteration: Some(iteration),
            duration_ms: None,
            usage: None,
        },
    );
}

async fn wait_before_retry_or_cancel(
    app_handle: &tauri::AppHandle,
    window_label: &str,
    iteration: u32,
    usage: &SessionUsage,
    delay_secs: u64,
) -> bool {
    tokio::select! {
        _ = tokio::time::sleep(tokio::time::Duration::from_secs(delay_secs)) => true,
        _ = wait_for_agent_cancel() => {
            debug_info!("🛑 Agent 重试等待期间被取消 (迭代 {})", iteration);
            emit_agent_cancelled(app_handle, window_label, iteration, usage);
            emit_session_usage(app_handle, window_label, usage, iteration);
            false
        }
    }
}

fn retry_delay_secs(attempt: u32) -> u64 {
    match attempt {
        0 | 1 => 2,
        2 => 4,
        _ => 8,
    }
}

fn is_retryable_http_status(status: reqwest::StatusCode) -> bool {
    matches!(
        status.as_u16(),
        408 | 409 | 425 | 429 | 500 | 502 | 503 | 504
    )
}

fn is_context_length_error(status: reqwest::StatusCode, error_text: &str) -> bool {
    status.as_u16() == 413
        || error_text.contains("prompt is too long")
        || error_text.contains("maximum context length")
}

fn is_reasoning_content_error(error_text: &str) -> bool {
    let lower = error_text.to_lowercase();
    lower.contains("reasoning_content")
        && (lower.contains("thinking mode") || lower.contains("passed back"))
}

fn repair_missing_reasoning_content(messages: &mut [serde_json::Value]) -> usize {
    let mut repaired = 0;

    for msg in messages.iter_mut() {
        if msg["role"].as_str() != Some("assistant") {
            continue;
        }

        let has_tool_calls = msg["tool_calls"]
            .as_array()
            .map(|calls| !calls.is_empty())
            .unwrap_or(false);
        if !has_tool_calls {
            continue;
        }

        let reasoning_missing = msg
            .get("reasoning_content")
            .and_then(|value| value.as_str())
            .map(|value| value.trim().is_empty())
            .unwrap_or(true);
        if !reasoning_missing {
            continue;
        }

        let Some(content) = msg
            .get("content")
            .and_then(|value| value.as_str())
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
        else {
            continue;
        };

        msg["reasoning_content"] = serde_json::json!(content);
        repaired += 1;
    }

    repaired
}

/// 获取可用的工具列表
#[tauri::command]
pub async fn get_available_tools_v2() -> Result<Vec<serde_json::Value>, String> {
    let runner = AgentRunner::new(AgentType::General);
    let definitions = runner.get_tool_definitions();

    let tools: Vec<serde_json::Value> = definitions
        .iter()
        .map(|d| {
            serde_json::json!({
                "name": d.function.name,
                "description": d.function.description,
                "parameters": d.function.parameters
            })
        })
        .collect();

    Ok(tools)
}

/// 获取可用的代理列表
#[tauri::command]
pub async fn get_available_agents() -> Result<Vec<serde_json::Value>, String> {
    let agents = vec![
        serde_json::json!({
            "name": "build",
            "description": "构建代理 - 编写和修改代码",
            "max_iterations": 20,
            "tools": ["read_file", "write_file", "list_files", "search_in_file", "grep_files", "bash"]
        }),
        serde_json::json!({
            "name": "plan",
            "description": "规划代理 - 分析需求、制定计划",
            "max_iterations": 10,
            "tools": ["read_file", "list_files", "search_in_file"]
        }),
        serde_json::json!({
            "name": "explore",
            "description": "探索代理 - 快速搜索和分析",
            "max_iterations": 15,
            "tools": ["read_file", "list_files", "search_in_file", "grep_files"]
        }),
        serde_json::json!({
            "name": "general",
            "description": "通用代理 - 处理复杂任务",
            "max_iterations": 25,
            "tools": ["read_file", "write_file", "list_files", "search_in_file", "grep_files", "bash", "analyze_csv"]
        }),
        serde_json::json!({
            "name": "forensic",
            "description": "取证代理 - 内存取证分析专家，自动化取证工作流",
            "max_iterations": 30,
            "tools": ["read_file", "list_files", "search_in_file", "grep_files", "analyze_csv", "volatility2", "volatility3", "forensic_workflow", "process_analysis", "extract_ioc", "write_markdown", "write_code", "execute_code"]
        }),
    ];

    Ok(agents)
}

/// 执行单个工具调用 (V2)
#[tauri::command]
pub async fn execute_tool_v2(
    tool_name: String,
    args: serde_json::Value,
    working_directory: Option<String>,
) -> Result<serde_json::Value, String> {
    let output_path = match crate::settings::load_settings() {
        Ok(settings) => settings.output_path,
        Err(_) => "./testoutput".to_string(),
    };

    let ctx = ToolContext {
        session_id: "direct_call".to_string(),
        working_directory: working_directory.unwrap_or_else(|| ".".to_string()),
        output_path,
    };

    let runner = AgentRunner::new(AgentType::General);
    let result = runner.execute_tool(&tool_name, args, &ctx).await;

    Ok(serde_json::json!({
        "name": result.name,
        "output": result.output,
        "success": result.success,
        "metadata": result.metadata
    }))
}

/// 确认执行代码 - 用户确认后执行脚本
#[tauri::command]
pub async fn confirm_execute_code(
    filename: String,
    args: Vec<String>,
    timeout_ms: Option<u64>,
) -> Result<serde_json::Value, String> {
    let settings = crate::settings::load_settings().unwrap_or_default();
    let output_path = settings.output_path.clone();

    // 获取 Python 路径
    let python_path = if !settings.python3_path.is_empty() {
        settings.python3_path.clone()
    } else if !settings.python2_path.is_empty() {
        settings.python2_path.clone()
    } else {
        "python".to_string()
    };

    let ctx = ToolContext {
        session_id: "confirmed_execution".to_string(),
        working_directory: output_path.clone(),
        output_path: output_path.clone(),
    };

    // 创建带有 confirmed=true 的参数
    let execute_args = serde_json::json!({
        "filename": filename,
        "args": args,
        "timeout_ms": timeout_ms.unwrap_or(300000),
        "confirmed": true
    });

    // 创建 ExecuteCodeTool 并执行
    let tool = crate::ai_v2::tools::ExecuteCodeTool::new(python_path);
    use crate::ai_v2::tools::Tool;
    let result = tool.execute(execute_args, &ctx).await;

    Ok(serde_json::json!({
        "name": result.name,
        "output": result.output,
        "success": result.success,
        "metadata": result.metadata
    }))
}

/// V2 版本的 Agent 调用
#[tauri::command]
pub async fn call_ai_agent_v2(
    request: AgentRequest,
    app_handle: tauri::AppHandle,
    #[allow(non_snake_case)] windowLabel: String,
) -> Result<String, String> {
    debug_info!("🤖 启动 AI Agent V2");

    if request.ai_settings.base_url.is_empty() {
        return Err("Base URL 未配置".to_string());
    }
    if request.ai_settings.model.trim().is_empty() {
        return Err("模型名称未配置".to_string());
    }

    // 确定代理类型
    let agent_type = match request.agent_type.as_deref() {
        Some("plan") => AgentType::Plan,
        Some("explore") => AgentType::Explore,
        Some("general") => AgentType::General,
        Some("analyze") | Some("forensic") => AgentType::Forensic,
        _ => AgentType::Build,
    };

    // 获取完整设置
    let settings = crate::settings::load_settings().unwrap_or_default();
    let output_path = settings.output_path.clone();

    // 创建 Volatility 配置
    let vol_config = crate::ai_v2::tools::VolatilityConfig {
        python2_path: settings.python2_path.clone(),
        python3_path: settings.python3_path.clone(),
        volatility2_path: settings.volatility2_path.clone(),
        volatility3_path: settings.volatility3_path.clone(),
        memory_image_path: settings.current_image_path.clone(),
        profile: settings.volatility2_profile.clone(),
    };

    // 创建带有所有扩展工具的 AgentRunner
    let mut config = agent_type.config();

    // 添加 volatility 工具到配置
    config.tools.push("volatility2".to_string());
    config.tools.push("volatility3".to_string());

    // 添加代码工具到配置
    config.tools.push("write_code".to_string());
    config.tools.push("execute_code".to_string());
    config.tools.push("read_code".to_string());
    config.tools.push("list_code".to_string());

    // 添加 Markdown 文档工具到配置
    config.tools.push("write_markdown".to_string());
    config.tools.push("read_markdown".to_string());
    config.tools.push("list_markdown".to_string());

    // 覆盖最大迭代次数
    if let Some(max_iter) = request.max_iterations {
        config.max_iterations = max_iter.max(5).min(100);
    }

    // 获取 Python 路径（优先使用 python3）
    let python_path = if !settings.python3_path.is_empty() {
        settings.python3_path.clone()
    } else if !settings.python2_path.is_empty() {
        settings.python2_path.clone()
    } else {
        "python".to_string()
    };

    // 获取 Markdown 保存路径（与 output 同级目录下的 markdown）
    let markdown_path = std::path::Path::new(&output_path)
        .parent()
        .map(|p| p.join("markdown").to_string_lossy().to_string())
        .unwrap_or_else(|| "markdown".to_string());

    let mut runner =
        AgentRunner::from_config_with_all_tools(config, vol_config, python_path, markdown_path);

    let tool_ctx = ToolContext {
        session_id: format!("session_{}", chrono::Utc::now().timestamp()),
        working_directory: output_path.clone(),
        output_path: output_path.clone(),
    };

    // 检测提供商类型
    let provider = ProviderType::from_url(&request.ai_settings.base_url);
    let is_claude = provider.uses_claude_format();
    if request.ai_settings.api_key.trim().is_empty() && !matches!(provider, ProviderType::Ollama) {
        return Err("API Key 未配置".to_string());
    }

    debug_info!(
        "🔧 使用代理: {} | 提供商: {:?}",
        agent_type.config().name,
        provider
    );

    // 构建系统提示（包含工具路径信息）
    let system_prompt = build_system_prompt_with_tools(&runner, &settings);

    // 构建消息历史
    let mut messages = vec![serde_json::json!({
        "role": "system",
        "content": system_prompt
    })];

    // 添加历史消息
    if let Some(history) = &request.history {
        for msg in history.iter().take(15) {
            let mut history_msg = serde_json::json!({
                "role": msg.role,
                "content": msg.content
            });
            if let Some(reasoning_content) = msg
                .reasoning_content
                .as_deref()
                .filter(|value| !value.trim().is_empty())
            {
                history_msg["reasoning_content"] = serde_json::json!(reasoning_content);
            }
            messages.push(history_msg);
        }
    }

    // 添加当前用户消息
    messages.push(serde_json::json!({
        "role": "user",
        "content": request.message
    }));

    // Agent 循环（增强版 - 参考 Claude Code 架构）
    let max_iterations = runner.max_iterations();
    let mut session_usage = SessionUsage::default();
    let compaction_config = CompactionConfig::default();
    let mut continue_reason = ContinueReason::NextTurn;
    // 获取模型的上下文窗口大小（估算）
    let context_window: usize = 128_000;

    // 每次新会话开始时重置取消标志
    AGENT_CANCELLED.store(false, Ordering::SeqCst);

    'agent_loop: loop {
        let iteration = runner.increment_iteration();

        // 检查取消标志
        if is_agent_cancelled() {
            debug_info!("🛑 Agent 执行已被取消 (迭代 {})", iteration);
            emit_agent_cancelled(&app_handle, &windowLabel, iteration, &session_usage);
            emit_session_usage(&app_handle, &windowLabel, &session_usage, iteration);
            return Ok("（已取消）".to_string());
        }

        if iteration > max_iterations {
            // 发送会话使用统计
            let _ = app_handle.emit_to(
                &windowLabel,
                "agent-step",
                AgentStep {
                    step_type: "session_usage".to_string(),
                    content: serde_json::to_string(&session_usage).unwrap_or_default(),
                    tool_name: None,
                    tool_args: None,
                    iteration: Some(iteration),
                    duration_ms: None,
                    usage: Some(session_usage.total.clone()),
                },
            );
            return Err("代理执行超过最大迭代次数".to_string());
        }

        debug_info!(
            "🔄 迭代 {}/{} | 原因: {:?}",
            iteration,
            max_iterations,
            continue_reason
        );

        // 发送迭代事件（包含累计使用量）
        let _ = app_handle.emit_to(
            &windowLabel,
            "agent-step",
            AgentStep {
                step_type: "iteration".to_string(),
                content: format!("迭代 {}/{}", iteration, max_iterations),
                tool_name: None,
                tool_args: None,
                iteration: Some(iteration),
                duration_ms: None,
                usage: Some(session_usage.total.clone()),
            },
        );

        // === 自动上下文压缩（参考 Claude Code 的 3 级压缩策略）===
        let current_tokens = messages
            .iter()
            .map(|m| estimate_tokens(m.to_string().as_str()))
            .sum::<usize>();

        let max_output = runner.config_max_output_tokens() as usize;

        if compaction::should_compact(
            current_tokens,
            context_window,
            max_output,
            &compaction_config,
        ) {
            debug_info!(
                "📦 触发上下文压缩: {} tokens / {} limit",
                current_tokens,
                context_window
            );

            let _ = app_handle.emit_to(
                &windowLabel,
                "agent-step",
                AgentStep {
                    step_type: "compaction".to_string(),
                    content: format!("上下文使用率过高 ({} tokens)，正在压缩...", current_tokens),
                    tool_name: None,
                    tool_args: None,
                    iteration: Some(iteration),
                    duration_ms: None,
                    usage: None,
                },
            );

            // 先尝试修剪工具输出（Level 1: Snip）
            let mut compact_msgs: Vec<compaction::CompactMessage> = messages
                .iter()
                .filter_map(|m| {
                    Some(compaction::CompactMessage {
                        role: m["role"].as_str()?.to_string(),
                        content: m["content"].as_str().unwrap_or("").to_string(),
                        reasoning_content: m["reasoning_content"].as_str().map(|s| s.to_string()),
                        tool_calls: m["tool_calls"].as_array().cloned(),
                        tool_call_id: m["tool_call_id"].as_str().map(|s| s.to_string()),
                        is_summary: false,
                    })
                })
                .collect();

            let pruned = compaction::prune_tool_outputs(&mut compact_msgs, &compaction_config);

            if pruned > 0 {
                debug_info!("✂️ 修剪了 {} tokens 的工具输出", pruned);
                // 重建 messages
                messages = compact_msgs
                    .iter()
                    .map(|m| {
                        let mut msg = serde_json::json!({
                            "role": m.role,
                            "content": m.content
                        });
                        if let Some(tc) = &m.tool_calls {
                            msg["tool_calls"] = serde_json::json!(tc);
                        }
                        if let Some(reasoning_content) = &m.reasoning_content {
                            msg["reasoning_content"] = serde_json::json!(reasoning_content);
                        }
                        if let Some(id) = &m.tool_call_id {
                            msg["tool_call_id"] = serde_json::json!(id);
                        }
                        msg
                    })
                    .collect();
            }
        }

        // 构建API请求
        let tools_json = runner.get_tool_definitions();
        let _config_max_tokens = runner.config_max_output_tokens();

        let api_request = if is_claude {
            build_claude_request(
                &request,
                &messages,
                &tools_json,
                &system_prompt,
                settings.ai_max_tokens,
            )
        } else {
            build_openai_request(
                &request,
                &messages,
                &tools_json,
                settings.ai_temperature,
                settings.ai_max_tokens,
            )
        };

        // 发送请求（复用全局连接池，计时）
        let api_start = std::time::Instant::now();
        let client = crate::network_utils::http_client();
        let endpoint = build_endpoint(&request.ai_settings.base_url, provider);
        let headers = get_headers(provider, &request.ai_settings.api_key);

        let mut api_retry_attempt = 0;
        let response = loop {
            let mut req_builder = client.post(&endpoint);
            for (key, value) in &headers {
                req_builder = req_builder.header(key.as_str(), value.as_str());
            }

            let response = tokio::select! {
                response = req_builder.json(&api_request).send() => response,
                _ = wait_for_agent_cancel() => {
                    debug_info!("🛑 Agent 请求等待期间被取消 (迭代 {})", iteration);
                    emit_agent_cancelled(&app_handle, &windowLabel, iteration, &session_usage);
                    emit_session_usage(&app_handle, &windowLabel, &session_usage, iteration);
                    return Ok("（已取消）".to_string());
                }
            };

            let response = match response {
                Ok(resp) => resp,
                Err(e) => {
                    debug_info!("❌ 网络请求失败: {}", e);
                    if api_retry_attempt < MAX_API_RETRY_ATTEMPTS {
                        api_retry_attempt += 1;
                        let delay_secs = retry_delay_secs(api_retry_attempt);
                        emit_retry_step(
                            &app_handle,
                            &windowLabel,
                            iteration,
                            format!(
                                "网络请求失败，{} 秒后重试 ({}/{})：{}",
                                delay_secs, api_retry_attempt, MAX_API_RETRY_ATTEMPTS, e
                            ),
                        );
                        if !wait_before_retry_or_cancel(
                            &app_handle,
                            &windowLabel,
                            iteration,
                            &session_usage,
                            delay_secs,
                        )
                        .await
                        {
                            return Ok("（已取消）".to_string());
                        }
                        continue;
                    }
                    return Err(format!("网络请求失败: {}", e));
                }
            };

            let status = response.status();
            if status.is_success() {
                break response;
            }

            let error_text = tokio::select! {
                text = response.text() => text.unwrap_or_default(),
                _ = wait_for_agent_cancel() => {
                    debug_info!("🛑 Agent 错误响应读取期间被取消 (迭代 {})", iteration);
                    emit_agent_cancelled(&app_handle, &windowLabel, iteration, &session_usage);
                    emit_session_usage(&app_handle, &windowLabel, &session_usage, iteration);
                    return Ok("（已取消）".to_string());
                }
            };

            // 413 Prompt Too Long → 压缩后重试
            if is_context_length_error(status, &error_text) {
                if continue_reason != ContinueReason::CompactionRetry {
                    debug_info!("📦 Prompt 过长，触发强制压缩重试");
                    emit_retry_step(
                        &app_handle,
                        &windowLabel,
                        iteration,
                        "上下文过长，正在压缩后重试...".to_string(),
                    );

                    // 强制压缩：只保留系统提示和最后 5 条消息
                    if messages.len() > 6 {
                        let system_msg = messages[0].clone();
                        let recent: Vec<_> = messages
                            .iter()
                            .rev()
                            .take(5)
                            .cloned()
                            .collect::<Vec<_>>()
                            .into_iter()
                            .rev()
                            .collect();
                        messages = vec![system_msg];
                        messages.push(serde_json::json!({
                            "role": "user",
                            "content": "[之前的对话已被压缩以节省上下文空间。请继续当前任务。]"
                        }));
                        messages.extend(recent);
                    }

                    continue_reason = ContinueReason::CompactionRetry;
                    continue 'agent_loop;
                } else {
                    return Err(format!(
                        "API请求失败（压缩后仍然过长）({}): {}",
                        status, error_text
                    ));
                }
            }

            if is_reasoning_content_error(&error_text)
                && continue_reason != ContinueReason::ErrorRecovery
            {
                let repaired = repair_missing_reasoning_content(&mut messages);
                if repaired > 0 {
                    debug_info!(
                        "🧠 修复 {} 条缺少 reasoning_content 的 assistant 消息后重试",
                        repaired
                    );
                    emit_retry_step(
                        &app_handle,
                        &windowLabel,
                        iteration,
                        format!(
                            "检测到 thinking 模式上下文缺少 reasoning_content，已修复 {} 条消息并重试...",
                            repaired
                        ),
                    );
                    continue_reason = ContinueReason::ErrorRecovery;
                    continue 'agent_loop;
                }
            }

            if is_retryable_http_status(status) && api_retry_attempt < MAX_API_RETRY_ATTEMPTS {
                api_retry_attempt += 1;
                let delay_secs = retry_delay_secs(api_retry_attempt);
                debug_info!(
                    "⏳ API 请求失败 {}，等待 {} 秒后重试 ({}/{})",
                    status,
                    delay_secs,
                    api_retry_attempt,
                    MAX_API_RETRY_ATTEMPTS
                );
                emit_retry_step(
                    &app_handle,
                    &windowLabel,
                    iteration,
                    format!(
                        "API 请求失败 ({})，{} 秒后重试 ({}/{})：{}",
                        status, delay_secs, api_retry_attempt, MAX_API_RETRY_ATTEMPTS, error_text
                    ),
                );
                if !wait_before_retry_or_cancel(
                    &app_handle,
                    &windowLabel,
                    iteration,
                    &session_usage,
                    delay_secs,
                )
                .await
                {
                    return Ok("（已取消）".to_string());
                }
                continue;
            }

            return Err(format!("API请求失败 ({}): {}", status, error_text));
        };

        let api_duration = api_start.elapsed().as_millis() as u64;
        session_usage.total_api_duration_ms += api_duration;

        let response_text = tokio::select! {
            text = response.text() => text.map_err(|e| format!("读取响应失败: {}", e))?,
            _ = wait_for_agent_cancel() => {
                debug_info!("🛑 Agent 响应读取期间被取消 (迭代 {})", iteration);
                emit_agent_cancelled(&app_handle, &windowLabel, iteration, &session_usage);
                emit_session_usage(&app_handle, &windowLabel, &session_usage, iteration);
                return Ok("（已取消）".to_string());
            }
        };

        // === Token 追踪（参考 Claude Code 的 cost-tracker）===
        let response_json = parse_response_json(&response_text)?;

        let turn_usage = TokenUsage::from_api_response(&response_json, is_claude);
        session_usage.total.accumulate(&turn_usage);
        session_usage.per_iteration.push(turn_usage.clone());
        session_usage.iteration_count += 1;

        debug_info!(
            "📊 Token: 输入={}, 输出={}, 缓存读取={}, 累计成本=${:.4}",
            turn_usage.input_tokens,
            turn_usage.output_tokens,
            turn_usage.cache_read_tokens,
            session_usage.total.cost_usd
        );

        // 解析响应
        let parsed_response = parse_api_response(&response_text, is_claude)?;
        let content = parsed_response.content;
        let reasoning_content = parsed_response.reasoning_content;
        let tool_calls = parsed_response.tool_calls;

        // 重置继续原因
        continue_reason = ContinueReason::NextTurn;

        // 处理工具调用
        if let Some(calls) = tool_calls {
            if calls.is_empty() {
                // 没有工具调用，返回最终答案
                if let Some(final_content) = content {
                    let _ = emit_final_answer_step(
                        &app_handle,
                        &windowLabel,
                        &final_content,
                        reasoning_content.as_deref(),
                    );
                    emit_session_usage(&app_handle, &windowLabel, &session_usage, iteration);
                    return Ok(final_content);
                }
            }

            // 如果有文字内容或 reasoning_content，先发送思考状态
            let thinking_text = content
                .as_deref()
                .filter(|value| !value.trim().is_empty())
                .or_else(|| {
                    reasoning_content
                        .as_deref()
                        .filter(|value| !value.trim().is_empty())
                });
            if let Some(thinking) = thinking_text {
                let _ = emit_thinking(&app_handle, &windowLabel, thinking);
            }

            // === 并发工具执行（参考 Claude Code 的 StreamingToolExecutor）===
            if calls.len() > 1 {
                // 检查是否所有工具都是并发安全的
                let all_safe = calls.iter().all(|call| {
                    let name = call["function"]["name"].as_str().unwrap_or("");
                    runner.get_tool_concurrency_safety(name) == ConcurrencySafety::Safe
                });

                if all_safe {
                    debug_info!("⚡ 并行执行 {} 个并发安全工具", calls.len());

                    // 发送并行执行事件
                    let tool_names: Vec<String> = calls
                        .iter()
                        .map(|c| c["function"]["name"].as_str().unwrap_or("").to_string())
                        .collect();

                    let _ = app_handle.emit_to(
                        &windowLabel,
                        "agent-step",
                        AgentStep {
                            step_type: "parallel_tools".to_string(),
                            content: format!(
                                "并行执行 {} 个工具: {}",
                                calls.len(),
                                tool_names.join(", ")
                            ),
                            tool_name: None,
                            tool_args: Some(serde_json::json!(tool_names)),
                            iteration: Some(iteration),
                            duration_ms: None,
                            usage: None,
                        },
                    );

                    // 构建并发任务信息
                    let mut call_infos: Vec<(String, String, serde_json::Value)> = Vec::new();

                    for call in &calls {
                        let tool_name = call["function"]["name"].as_str().unwrap_or("").to_string();
                        let tool_args: serde_json::Value = serde_json::from_str(
                            call["function"]["arguments"].as_str().unwrap_or("{}"),
                        )
                        .unwrap_or(serde_json::json!({}));
                        let call_id = call["id"].as_str().unwrap_or("").to_string();

                        let _ = emit_tool_call(
                            &app_handle,
                            &windowLabel,
                            &tool_name,
                            tool_args.clone(),
                        );
                        call_infos.push((call_id, tool_name, tool_args));
                    }

                    // 创建并发 futures（从 call_infos 借用）
                    let futures: Vec<_> = call_infos
                        .iter()
                        .map(|(_, name, args)| {
                            runner.execute_tool_validated(name, args.clone(), &tool_ctx)
                        })
                        .collect();

                    // 并行等待所有结果，允许停止按钮中断等待
                    let results = tokio::select! {
                        results = futures_util::future::join_all(futures) => results,
                        _ = wait_for_agent_cancel() => {
                            debug_info!("🛑 Agent 并行工具执行期间被取消 (迭代 {})", iteration);
                            emit_agent_cancelled(&app_handle, &windowLabel, iteration, &session_usage);
                            emit_session_usage(&app_handle, &windowLabel, &session_usage, iteration);
                            return Ok("（已取消）".to_string());
                        }
                    };

                    // 处理并行结果：先记录 assistant 原始工具调用，保留 reasoning_content
                    messages.push(build_assistant_tool_call_message(
                        &content,
                        &reasoning_content,
                        calls.clone(),
                    ));

                    // 添加各个工具结果
                    for (i, result) in results.iter().enumerate() {
                        let (call_id, tool_name, _) = &call_infos[i];

                        session_usage.total_tool_duration_ms += result.duration_ms;

                        // 发送工具结果事件（包含耗时信息）
                        let _ = app_handle.emit_to(
                            &windowLabel,
                            "agent-step",
                            AgentStep {
                                step_type: if result.success {
                                    "tool_result"
                                } else {
                                    "tool_error"
                                }
                                .to_string(),
                                content: result.output.clone(),
                                tool_name: Some(tool_name.to_string()),
                                tool_args: None,
                                iteration: Some(iteration),
                                duration_ms: Some(result.duration_ms),
                                usage: None,
                            },
                        );

                        messages.push(serde_json::json!({
                            "role": "tool",
                            "tool_call_id": call_id,
                            "content": result.output
                        }));
                    }

                    continue; // 下一轮迭代
                }
            }

            // 顺序执行工具调用（包含写操作或单个工具时）
            messages.push(build_assistant_tool_call_message(
                &content,
                &reasoning_content,
                calls.clone(),
            ));

            for call in &calls {
                let tool_name = call["function"]["name"].as_str().unwrap_or("");
                let tool_args: serde_json::Value =
                    serde_json::from_str(call["function"]["arguments"].as_str().unwrap_or("{}"))
                        .unwrap_or(serde_json::json!({}));
                let call_id = call["id"].as_str().unwrap_or("");

                // 使用动态活动描述
                let activity = runner.get_tool_activity_description(tool_name, &tool_args);
                debug_info!("🔧 {}", activity);

                // 发送工具调用事件
                let _ = emit_tool_call(&app_handle, &windowLabel, tool_name, tool_args.clone());

                // 使用 execute_validated 执行工具（包含验证 + 计时 + 截断）
                let result = tokio::select! {
                    result = runner.execute_tool_validated(tool_name, tool_args.clone(), &tool_ctx) => result,
                    _ = wait_for_agent_cancel() => {
                        debug_info!("🛑 Agent 工具执行期间被取消 (迭代 {})", iteration);
                        emit_agent_cancelled(&app_handle, &windowLabel, iteration, &session_usage);
                        emit_session_usage(&app_handle, &windowLabel, &session_usage, iteration);
                        return Ok("（已取消）".to_string());
                    }
                };

                session_usage.total_tool_duration_ms += result.duration_ms;

                // 发送工具结果事件（包含耗时信息）
                let _ = app_handle.emit_to(
                    &windowLabel,
                    "agent-step",
                    AgentStep {
                        step_type: if result.success {
                            "tool_result"
                        } else {
                            "tool_error"
                        }
                        .to_string(),
                        content: result.output.clone(),
                        tool_name: Some(tool_name.to_string()),
                        tool_args: None,
                        iteration: Some(iteration),
                        duration_ms: Some(result.duration_ms),
                        usage: None,
                    },
                );

                messages.push(serde_json::json!({
                    "role": "tool",
                    "tool_call_id": call_id,
                    "content": result.output
                }));
            }
        } else {
            // 没有工具调用，返回最终答案
            if let Some(final_content) = content {
                let _ = emit_final_answer_step(
                    &app_handle,
                    &windowLabel,
                    &final_content,
                    reasoning_content.as_deref(),
                );
                emit_session_usage(&app_handle, &windowLabel, &session_usage, iteration);
                return Ok(final_content);
            }
            break;
        }
    }

    // 发送最终会话使用统计
    emit_session_usage(
        &app_handle,
        &windowLabel,
        &session_usage,
        runner.current_iteration(),
    );
    Ok("Agent 执行完成".to_string())
}

/// 发送会话使用统计事件
fn emit_session_usage(
    app_handle: &tauri::AppHandle,
    window_label: &str,
    usage: &SessionUsage,
    iteration: u32,
) {
    let _ = app_handle.emit_to(
        window_label,
        "agent-step",
        AgentStep {
            step_type: "session_usage".to_string(),
            content: serde_json::to_string(usage).unwrap_or_default(),
            tool_name: None,
            tool_args: None,
            iteration: Some(iteration),
            duration_ms: Some(usage.total_api_duration_ms + usage.total_tool_duration_ms),
            usage: Some(usage.total.clone()),
        },
    );
}

fn emit_final_answer_step(
    app_handle: &tauri::AppHandle,
    window_label: &str,
    content: &str,
    reasoning_content: Option<&str>,
) -> Result<(), String> {
    let tool_args = reasoning_content
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| serde_json::json!({ "reasoning_content": value }));

    app_handle
        .emit_to(
            window_label,
            "agent-step",
            AgentStep {
                step_type: "final_answer".to_string(),
                content: content.to_string(),
                tool_name: None,
                tool_args,
                iteration: None,
                duration_ms: None,
                usage: None,
            },
        )
        .map_err(|e| format!("发送事件失败: {}", e))
}

/// 构建系统提示（包含工具路径信息）
fn build_system_prompt_with_tools(
    runner: &AgentRunner,
    settings: &crate::types::AppSettings,
) -> String {
    let tools = runner.get_tool_definitions();
    let tool_names: Vec<String> = tools.iter().map(|t| t.function.name.clone()).collect();

    // 构建工具路径信息
    let mut tool_paths = Vec::new();
    if !settings.python2_path.is_empty() {
        tool_paths.push(format!("Python2: {}", settings.python2_path));
    }
    if !settings.python3_path.is_empty() {
        tool_paths.push(format!("Python3: {}", settings.python3_path));
    }
    if !settings.volatility2_path.is_empty() {
        tool_paths.push(format!("Volatility2: {}", settings.volatility2_path));
    }
    if !settings.volatility3_path.is_empty() {
        tool_paths.push(format!("Volatility3: {}", settings.volatility3_path));
    }
    if !settings.memprocfs_path.is_empty() {
        tool_paths.push(format!("MemProcFS: {}", settings.memprocfs_path));
    }

    let tool_paths_str = if tool_paths.is_empty() {
        "未配置".to_string()
    } else {
        tool_paths.join("\n- ")
    };

    let memory_image = if settings.current_image_path.is_empty() {
        "未加载".to_string()
    } else {
        settings.current_image_path.clone()
    };

    let profile = if settings.volatility2_profile.is_empty() {
        "未设置".to_string()
    } else {
        settings.volatility2_profile.clone()
    };

    format!(
        r#"你是一个专业的内存取证分析AI助手。

⚠️ **核心原则：优先分析工作目录中已有的取证文件！**

工作目录: {}
当前内存镜像: {}
Volatility2 Profile: {}

已配置的取证工具:
- {}

可用工具: {}

## 工作流程（严格按顺序执行）

### 第一步：必须先检查工作目录
1. **首先**使用 list_files 查看工作目录中有哪些文件
2. 检查是否存在与用户请求相关的取证文件（如 process*.csv、netscan*.csv 等）

### 第二步：分析已有取证文件（优先）
如果工作目录中**存在相关文件**：
1. 使用 read_file 读取相关文件
2. 使用 analyze_csv 对CSV格式数据进行分析
3. 使用 grep_files 或 search_in_file 搜索特定关键词
4. 根据数据给出专业的取证分析结论

### 第三步：使用 Volatility（仅在必要时）
**只有在以下情况才使用 Volatility 工具：**
- 工作目录中**没有**与用户请求相关的取证文件
- 用户**明确要求**使用 Volatility 进行分析
- 需要获取工作目录中不存在的特定信息

Volatility2 常用插件：pslist, pstree, netscan, filescan, hivelist, handles, dlllist, cmdline, malfind
Volatility3 常用插件：windows.pslist, windows.pstree, windows.netscan, windows.filescan, windows.handles

## 常见取证文件类型
- process*.csv / pslist*.csv - 进程信息
- netstat*.csv / netscan*.csv - 网络连接
- handles*.csv - 句柄信息
- registry*.csv / hivelist*.csv - 注册表信息
- *filescan*.csv - 文件扫描结果
- timeline_ntfs.csv - ntfs文件时间线，找到的文件可以尝试使用filescan插件提取
- files.csv 可 100% 提取的文件，可使用filescan 提取
- dlllist*.csv - DLL列表
- cmdline*.csv - 命令行参数
- sysinfo.txt - 系统信息
- services.csv - 服务信息
- findevil.csv - 可能的恶意文件信息
- yara.txt - yara规则扫描详情
- 
## volatility2,3选择
- windows7以下内存镜像使用volatility2
- windows7以上内存镜像使用volatility3
## 文件提取
- volatility2使用filescan搜索文件，使用dumpfiles提取文件
- volatility3使用windows.filescan搜索文件，使用 --dump 提取文件

## 🚀 自动化取证分析功能
提供一键式自动化取证分析能力：

### 取证工作流工具
- **forensic_workflow**: 自动化取证分析工作流
  - mode="quick_scan": 快速扫描（进程、网络、命令行）
  - mode="malware_scan": 恶意软件扫描（malfind、隐藏进程、DLL注入）
  - mode="network_analysis": 网络连接分析
  - mode="registry_analysis": 注册表分析
  - mode="full_analysis": 完整分析（运行所有模块）
- **process_analysis**: 对指定 PID 进行深度分析（内存段、DLL、句柄、环境变量）
- **extract_ioc**: IOC 提取指导（IP、域名、URL、文件路径）

### 推荐分析流程
1. 首先使用 `forensic_workflow` 的 `quick_scan` 模式获取内存镜像概览
2. 如发现可疑进程，使用 `process_analysis` 进行深度分析
3. 使用 `malware_scan` 检测恶意软件特征
4. 使用 `write_markdown` 保存分析报告

### 可疑特征识别
- 高熵值进程（>7.0）：可能是加壳/加密的恶意软件
- RWX 内存段：可能存在代码注入
- 隐藏进程：使用 psxview 检测
- 异常网络连接：外连到可疑 IP/端口

## 代码编写功能
当需要进行复杂的数据处理或自动化分析时，可以编写 Python 脚本：

### 代码工具
- **write_code**: 创建或修改 Python 脚本（保存在 scripts 目录）
- **read_code**: 读取已有脚本的内容
- **list_code**: 列出所有已创建的脚本
- **execute_code**: 执行脚本（⚠️ 需要用户确认）

### 代码编写流程
1. 使用 write_code 创建脚本，包含完整的 import 和注释
2. 使用 execute_code 执行脚本（会提示用户确认）
3. 根据执行结果，可以用 write_code 修改脚本并重新执行

### 代码规范
- 脚本开头添加 `# -*- coding: utf-8 -*-`
- 使用 argparse 处理命令行参数
- 输出结果应清晰、结构化
- 处理异常并给出有意义的错误信息

## 文档编写功能（WriteUp）
用于编写分析报告或 CTF WriteUp：

### 文档工具
- **write_markdown**: 创建或修改 Markdown 文档（保存在 markdown 目录）
  - mode="overwrite": 覆盖模式（默认）
  - mode="append": 追加模式
- **read_markdown**: 读取已有文档内容
- **list_markdown**: 列出所有文档

### WriteUp 编写建议
- 使用清晰的标题和章节结构
- 包含分析过程、发现的关键证据、使用的工具和命令
- 添加代码块展示关键命令和输出
- 总结分析结论和 Flag（如果是 CTF）

## 注意事项
- 🔴 **禁止在未检查工作目录的情况下直接调用 Volatility**
- 🔴 **执行代码需要用户确认，未确认的执行会返回预览信息**
- 大文件应分批读取（使用offset和limit参数）
- 给出清晰的取证分析结论和可疑发现
- ⚠️ 避免读取 timeline_all.csv（文件过大），除非用户明确要求"#,
        settings.output_path,
        memory_image,
        profile,
        tool_paths_str,
        tool_names.join(", ")
    )
}

/// 构建 OpenAI 格式请求
fn build_openai_request(
    request: &AgentRequest,
    messages: &[serde_json::Value],
    tools: &[crate::ai_v2::types::ToolDefinition],
    temperature: f32,
    max_tokens: u32,
) -> serde_json::Value {
    let tools_json: Vec<serde_json::Value> = tools
        .iter()
        .map(|t| {
            serde_json::json!({
                "type": "function",
                "function": {
                    "name": t.function.name,
                    "description": t.function.description,
                    "parameters": t.function.parameters
                }
            })
        })
        .collect();

    serde_json::json!({
        "model": request.ai_settings.model,
        "messages": messages,
        "tools": tools_json,
        "temperature": temperature,
        "max_tokens": max_tokens
    })
}

/// 构建 Claude 格式请求
fn build_claude_request(
    request: &AgentRequest,
    messages: &[serde_json::Value],
    tools: &[crate::ai_v2::types::ToolDefinition],
    system: &str,
    max_tokens: u32,
) -> serde_json::Value {
    let tools_json: Vec<serde_json::Value> = tools
        .iter()
        .map(|t| {
            serde_json::json!({
                "name": t.function.name,
                "description": t.function.description,
                "input_schema": t.function.parameters
            })
        })
        .collect();

    // 转换消息格式：从 OpenAI 内部格式 → Claude API 格式
    // Claude 要求：
    //   assistant 的 tool_calls → content 块含 type:"tool_use"
    //   role:"tool" 消息 → user content 块含 type:"tool_result"
    let mut claude_messages: Vec<serde_json::Value> = Vec::new();
    let mut i = 0;
    while i < messages.len() {
        let msg = &messages[i];
        let role = msg["role"].as_str().unwrap_or("");

        if role == "system" {
            // 跳过 system 消息（用独立 system 字段传递）
            i += 1;
            continue;
        }

        if role == "assistant" {
            if let Some(tool_calls) = msg["tool_calls"].as_array() {
                // 有工具调用的 assistant 消息 → 转为 Claude content blocks
                let mut content_blocks: Vec<serde_json::Value> = Vec::new();

                // 添加文本内容（如思考）
                let text = msg["content"].as_str().unwrap_or("");
                if !text.is_empty() {
                    content_blocks.push(serde_json::json!({
                        "type": "text",
                        "text": text
                    }));
                }

                // 添加 tool_use 块
                for call in tool_calls {
                    let call_id = call["id"].as_str().unwrap_or("");
                    let name = call["function"]["name"].as_str().unwrap_or("");
                    let args_str = call["function"]["arguments"].as_str().unwrap_or("{}");
                    let input: serde_json::Value =
                        serde_json::from_str(args_str).unwrap_or(serde_json::json!({}));

                    content_blocks.push(serde_json::json!({
                        "type": "tool_use",
                        "id": call_id,
                        "name": name,
                        "input": input
                    }));
                }

                // 如果没有任何内容块，添加占位文本
                if content_blocks.is_empty() {
                    content_blocks.push(serde_json::json!({
                        "type": "text",
                        "text": "使用工具"
                    }));
                }

                claude_messages.push(serde_json::json!({
                    "role": "assistant",
                    "content": content_blocks
                }));

                // 收集紧跟的所有 tool 结果消息 → 合并为一条 user 消息
                let mut tool_results: Vec<serde_json::Value> = Vec::new();
                i += 1;
                while i < messages.len() && messages[i]["role"].as_str() == Some("tool") {
                    let tool_id = messages[i]["tool_call_id"].as_str().unwrap_or("");
                    let content = messages[i]["content"].as_str().unwrap_or("");
                    if !tool_id.is_empty() {
                        tool_results.push(serde_json::json!({
                            "type": "tool_result",
                            "tool_use_id": tool_id,
                            "content": content
                        }));
                    }
                    i += 1;
                }

                if !tool_results.is_empty() {
                    claude_messages.push(serde_json::json!({
                        "role": "user",
                        "content": tool_results
                    }));
                }
            } else {
                // 普通 assistant 消息
                let text = msg["content"].as_str().unwrap_or("");
                if !text.is_empty() {
                    claude_messages.push(serde_json::json!({
                        "role": "assistant",
                        "content": text
                    }));
                }
                i += 1;
            }
        } else if role == "user" {
            let content = msg["content"].as_str().unwrap_or("");
            // 避免连续 user 消息：合并
            if let Some(last) = claude_messages.last() {
                if last["role"].as_str() == Some("user") && last["content"].is_string() {
                    let prev = claude_messages
                        .last_mut()
                        .expect("已确认 claude_messages 非空");
                    let prev_text = prev["content"].as_str().unwrap_or("").to_string();
                    prev["content"] = serde_json::json!(format!("{}\n\n{}", prev_text, content));
                    i += 1;
                    continue;
                }
            }
            claude_messages.push(serde_json::json!({
                "role": "user",
                "content": content
            }));
            i += 1;
        } else if role == "tool" {
            // 孤立的 tool 消息（没有跟在 assistant 后面）→ 作为 user 消息处理
            let tool_id = msg["tool_call_id"].as_str().unwrap_or("");
            let content = msg["content"].as_str().unwrap_or("");
            if !tool_id.is_empty() {
                claude_messages.push(serde_json::json!({
                    "role": "user",
                    "content": [{
                        "type": "tool_result",
                        "tool_use_id": tool_id,
                        "content": content
                    }]
                }));
            }
            i += 1;
        } else {
            i += 1;
        }
    }

    // 确保消息以 user 开头（Claude 要求）
    if !claude_messages.is_empty() {
        if claude_messages[0]["role"].as_str() != Some("user") {
            claude_messages.insert(
                0,
                serde_json::json!({
                    "role": "user",
                    "content": "请继续。"
                }),
            );
        }
    }

    serde_json::json!({
        "model": request.ai_settings.model,
        "messages": claude_messages,
        "system": system,
        "tools": tools_json,
        "max_tokens": max_tokens
    })
}

fn response_preview(response_text: &str) -> String {
    const MAX_PREVIEW_CHARS: usize = 300;
    let trimmed = response_text.trim();
    let preview: String = trimmed.chars().take(MAX_PREVIEW_CHARS).collect();
    if trimmed.chars().count() > MAX_PREVIEW_CHARS {
        format!("{}...", preview)
    } else {
        preview
    }
}

fn parse_response_json(response_text: &str) -> Result<serde_json::Value, String> {
    let trimmed = response_text.trim_start_matches('\u{feff}').trim();
    if trimmed.is_empty() {
        return Err(
            "解析响应失败：服务返回了空响应，请检查 Base URL、模型名称或代理网关配置".to_string(),
        );
    }

    serde_json::from_str(trimmed).map_err(|e| {
        let first_char = trimmed.chars().next().unwrap_or('\0');
        if first_char != '{' && first_char != '[' {
            format!(
                "解析响应失败：服务返回的不是 JSON（开头为 {:?}）。响应预览: {}",
                first_char,
                response_preview(trimmed)
            )
        } else {
            format!(
                "解析响应失败：{}。响应预览: {}",
                e,
                response_preview(trimmed)
            )
        }
    })
}

#[derive(Debug, Clone, Default)]
struct ParsedApiResponse {
    content: Option<String>,
    reasoning_content: Option<String>,
    tool_calls: Option<Vec<serde_json::Value>>,
}

fn build_assistant_tool_call_message(
    content: &Option<String>,
    reasoning_content: &Option<String>,
    tool_calls: Vec<serde_json::Value>,
) -> serde_json::Value {
    let mut message = serde_json::json!({
        "role": "assistant",
        "content": content,
        "tool_calls": tool_calls
    });

    if let Some(reasoning) = reasoning_content
        .as_ref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
    {
        message["reasoning_content"] = serde_json::json!(reasoning);
    }

    message
}

/// 解析 API 响应
fn parse_api_response(response_text: &str, is_claude: bool) -> Result<ParsedApiResponse, String> {
    let json = parse_response_json(response_text)?;

    if is_claude {
        // Claude 格式
        let content = json["content"].as_array();
        let mut text_content = String::new();
        let mut tool_calls = Vec::new();

        if let Some(blocks) = content {
            for block in blocks {
                match block["type"].as_str() {
                    Some("text") => {
                        if let Some(text) = block["text"].as_str() {
                            text_content.push_str(text);
                        }
                    }
                    Some("tool_use") => {
                        tool_calls.push(serde_json::json!({
                            "id": block["id"],
                            "type": "function",
                            "function": {
                                "name": block["name"],
                                "arguments": serde_json::to_string(&block["input"]).unwrap_or_default()
                            }
                        }));
                    }
                    _ => {}
                }
            }
        }

        let text = if text_content.is_empty() {
            None
        } else {
            Some(text_content)
        };
        let calls = if tool_calls.is_empty() {
            None
        } else {
            Some(tool_calls)
        };

        Ok(ParsedApiResponse {
            content: text,
            reasoning_content: None,
            tool_calls: calls,
        })
    } else {
        // OpenAI 格式
        let choice = json["choices"].get(0).ok_or("响应中没有choices")?;

        let message = &choice["message"];
        let content = message["content"].as_str().map(|s| s.to_string());
        let reasoning_content = message["reasoning_content"].as_str().map(|s| s.to_string());
        let tool_calls = message["tool_calls"].as_array().cloned();

        Ok(ParsedApiResponse {
            content,
            reasoning_content,
            tool_calls,
        })
    }
}

// ============ 兼容旧版 ai_chat 的命令 ============

use futures_util::StreamExt;
use std::fs;
use std::path::Path;

/// 流式 AI API 调用 (V2版本)
#[tauri::command]
pub async fn call_ai_api_stream_v2(
    request: AgentRequest,
    app_handle: tauri::AppHandle,
    #[allow(non_snake_case)] windowLabel: String,
) -> Result<String, String> {
    debug_info!("🔄 启动流式 AI 调用 V2");
    AGENT_CANCELLED.store(false, Ordering::SeqCst);

    if request.ai_settings.base_url.trim().is_empty() {
        return Err("Base URL 未配置".to_string());
    }
    if request.ai_settings.model.trim().is_empty() {
        return Err("模型名称未配置".to_string());
    }

    let provider = ProviderType::from_url(&request.ai_settings.base_url);
    let is_local_ollama = matches!(provider, ProviderType::Ollama);
    if request.ai_settings.api_key.trim().is_empty() && !is_local_ollama {
        return Err("API Key 未配置".to_string());
    }

    let is_claude = provider.uses_claude_format();
    let app_settings = crate::settings::load_settings().unwrap_or_default();
    let max_tokens = app_settings.ai_max_tokens;
    let temperature = app_settings.ai_temperature;

    // 构建消息
    let mut messages = vec![serde_json::json!({
        "role": "user",
        "content": request.message
    })];

    // 添加历史消息
    if let Some(history) = &request.history {
        for msg in history.iter().take(15) {
            let mut history_msg = serde_json::json!({
                "role": msg.role,
                "content": msg.content
            });
            if let Some(reasoning_content) = msg
                .reasoning_content
                .as_deref()
                .filter(|value| !value.trim().is_empty())
            {
                history_msg["reasoning_content"] = serde_json::json!(reasoning_content);
            }
            messages.insert(messages.len() - 1, history_msg);
        }
    }

    let api_request = if is_claude {
        serde_json::json!({
            "model": request.ai_settings.model,
            "messages": messages,
            "max_tokens": max_tokens,
            "stream": true
        })
    } else {
        serde_json::json!({
            "model": request.ai_settings.model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "stream": true
        })
    };

    let client = crate::network_utils::http_client();
    let endpoint = build_endpoint(&request.ai_settings.base_url, provider);
    let headers = get_headers(provider, &request.ai_settings.api_key);

    let mut req_builder = client.post(&endpoint);
    for (key, value) in headers {
        req_builder = req_builder.header(&key, &value);
    }

    let response = tokio::select! {
        response = req_builder.json(&api_request).send() => {
            response.map_err(|e| format!("网络请求失败: {}", e))?
        }
        _ = wait_for_agent_cancel() => {
            debug_info!("🛑 流式 AI 请求等待期间被取消");
            let _ = app_handle.emit_to(&windowLabel, "ai-stream-end", ());
            return Ok("（已取消）".to_string());
        }
    };

    if !response.status().is_success() {
        let status = response.status();
        let error_text = tokio::select! {
            text = response.text() => text.unwrap_or_default(),
            _ = wait_for_agent_cancel() => {
                debug_info!("🛑 流式 AI 错误响应读取期间被取消");
                let _ = app_handle.emit_to(&windowLabel, "ai-stream-end", ());
                return Ok("（已取消）".to_string());
            }
        };
        let _ = app_handle.emit_to(&windowLabel, "ai-stream-error", &error_text);
        return Err(format!("API请求失败 ({}): {}", status, error_text));
    }

    // 处理流式响应
    let mut stream = response.bytes_stream();
    let mut buffer = String::new();

    loop {
        let chunk = tokio::select! {
            chunk = stream.next() => chunk,
            _ = wait_for_agent_cancel() => {
                debug_info!("🛑 流式 AI 读取期间被取消");
                let _ = app_handle.emit_to(&windowLabel, "ai-stream-end", ());
                return Ok("（已取消）".to_string());
            }
        };

        let Some(chunk) = chunk else {
            break;
        };

        match chunk {
            Ok(bytes) => {
                let chunk_str = String::from_utf8_lossy(&bytes);
                buffer.push_str(&chunk_str);

                // 解析SSE格式
                while let Some(line_end) = buffer.find('\n') {
                    let line = buffer[..line_end].to_string();
                    buffer = buffer[line_end + 1..].to_string();

                    if line.starts_with("data: ") {
                        let data = &line[6..];
                        if data == "[DONE]" {
                            let _ = app_handle.emit_to(&windowLabel, "ai-stream-end", ());
                            return Ok("完成".to_string());
                        }

                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                            // OpenAI格式
                            if let Some(content) = json["choices"][0]["delta"]["content"].as_str() {
                                let _ =
                                    app_handle.emit_to(&windowLabel, "ai-stream-chunk", content);
                            }
                            // Claude格式
                            if let Some(text) = json["delta"]["text"].as_str() {
                                let _ = app_handle.emit_to(&windowLabel, "ai-stream-chunk", text);
                            }
                        }
                    }
                }
            }
            Err(e) => {
                let _ =
                    app_handle.emit_to(&windowLabel, "ai-stream-error", format!("流错误: {}", e));
                return Err(format!("流错误: {}", e));
            }
        }
    }

    let _ = app_handle.emit_to(&windowLabel, "ai-stream-end", ());
    Ok("完成".to_string())
}

/// 保存聊天历史 (V2版本)
#[tauri::command]
pub async fn save_chat_history_v2(
    session_id: String,
    messages: Vec<serde_json::Value>,
) -> Result<(), String> {
    let history_dir = get_history_dir()?;
    let history_file = history_dir.join(format!("{}.json", session_id));

    let content =
        serde_json::to_string_pretty(&messages).map_err(|e| format!("序列化失败: {}", e))?;

    fs::write(&history_file, content).map_err(|e| format!("保存失败: {}", e))?;

    debug_info!("✅ 聊天历史已保存: {}", session_id);
    Ok(())
}

/// 加载聊天历史 (V2版本)
#[tauri::command]
pub async fn load_chat_history_v2(session_id: String) -> Result<Vec<serde_json::Value>, String> {
    let history_dir = get_history_dir()?;
    let history_file = history_dir.join(format!("{}.json", session_id));

    if !history_file.exists() {
        return Ok(vec![]);
    }

    let content = fs::read_to_string(&history_file).map_err(|e| format!("读取失败: {}", e))?;

    let messages: Vec<serde_json::Value> =
        serde_json::from_str(&content).map_err(|e| format!("解析失败: {}", e))?;

    Ok(messages)
}

/// 列出目录文件 (V2版本)
#[tauri::command]
pub async fn list_directory_files_v2(
    directory: Option<String>,
) -> Result<Vec<serde_json::Value>, String> {
    let output_path = match crate::settings::load_settings() {
        Ok(settings) => settings.output_path,
        Err(_) => "./testoutput".to_string(),
    };

    let dir_path = directory.unwrap_or(output_path);

    let mut files = Vec::new();
    let entries = fs::read_dir(&dir_path).map_err(|e| format!("读取目录失败: {}", e))?;

    for entry in entries.flatten() {
        let metadata = entry.metadata().ok();
        let name = entry.file_name().to_string_lossy().to_string();
        let is_dir = metadata.as_ref().map(|m| m.is_dir()).unwrap_or(false);
        let size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);

        files.push(serde_json::json!({
            "name": name,
            "is_dir": is_dir,
            "size": size
        }));
    }

    Ok(files)
}

/// 读取文件内容 (V2版本)
#[tauri::command]
pub async fn read_file_content_v2(
    filename: String,
    start_line: Option<usize>,
    max_lines: Option<usize>,
) -> Result<serde_json::Value, String> {
    let output_path = match crate::settings::load_settings() {
        Ok(settings) => settings.output_path,
        Err(_) => "./testoutput".to_string(),
    };

    let file_path = if Path::new(&filename).is_absolute() {
        filename
    } else {
        format!("{}/{}", output_path, filename)
    };

    let content = fs::read_to_string(&file_path).map_err(|e| format!("读取文件失败: {}", e))?;

    let lines: Vec<&str> = content.lines().collect();
    let total_lines = lines.len();
    let start = start_line.unwrap_or(1).saturating_sub(1).min(total_lines);
    let limit = max_lines.unwrap_or(500);
    let end = (start + limit).min(total_lines);

    let selected: Vec<String> = lines[start..end]
        .iter()
        .enumerate()
        .map(|(i, line)| format!("{:5}| {}", start + i + 1, line))
        .collect();

    Ok(serde_json::json!({
        "content": selected.join("\n"),
        "total_lines": total_lines,
        "start_line": start + 1,
        "end_line": end,
        "has_more": end < total_lines
    }))
}

/// 文件内搜索 (V2版本)
#[tauri::command]
pub async fn search_in_file_v2(
    filename: String,
    search_term: String,
    max_results: Option<usize>,
) -> Result<Vec<serde_json::Value>, String> {
    let output_path = match crate::settings::load_settings() {
        Ok(settings) => settings.output_path,
        Err(_) => "./testoutput".to_string(),
    };

    let file_path = if Path::new(&filename).is_absolute() {
        filename
    } else {
        format!("{}/{}", output_path, filename)
    };

    let content = fs::read_to_string(&file_path).map_err(|e| format!("读取文件失败: {}", e))?;

    let max = max_results.unwrap_or(50);
    let search_lower = search_term.to_lowercase();
    let mut results = Vec::new();

    for (line_num, line) in content.lines().enumerate() {
        if results.len() >= max {
            break;
        }
        if line.to_lowercase().contains(&search_lower) {
            results.push(serde_json::json!({
                "line_number": line_num + 1,
                "content": line
            }));
        }
    }

    Ok(results)
}

/// 获取历史记录目录
fn get_history_dir() -> Result<std::path::PathBuf, String> {
    let app_data = dirs::data_local_dir().ok_or("无法获取应用数据目录")?;

    let history_dir = app_data
        .join(crate::settings::APP_STORAGE_DIR_NAME)
        .join("ai_history");

    if !history_dir.exists() {
        fs::create_dir_all(&history_dir).map_err(|e| format!("创建历史目录失败: {}", e))?;
    }

    Ok(history_dir)
}
