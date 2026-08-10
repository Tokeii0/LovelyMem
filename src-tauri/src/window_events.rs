use std::sync::atomic::{AtomicU8, Ordering};
use tauri::{AppHandle, Emitter, Manager, WindowEvent};

const CLOSE_STATE_IDLE: u8 = 0;
const CLOSE_STATE_WAITING_CONFIRM: u8 = 1;
const CLOSE_STATE_SHUTTING_DOWN: u8 = 2;
/// 前端响应超时时间（毫秒）- 如果前端在此时间内没有响应，自动执行关闭
const CLOSE_CONFIRMATION_TIMEOUT_MS: u64 = 10000;

static CLOSE_STATE: AtomicU8 = AtomicU8::new(CLOSE_STATE_IDLE);

fn begin_close_confirmation() -> bool {
    CLOSE_STATE
        .compare_exchange(
            CLOSE_STATE_IDLE,
            CLOSE_STATE_WAITING_CONFIRM,
            Ordering::SeqCst,
            Ordering::SeqCst,
        )
        .is_ok()
}

fn mark_shutting_down_if_waiting() -> bool {
    CLOSE_STATE
        .compare_exchange(
            CLOSE_STATE_WAITING_CONFIRM,
            CLOSE_STATE_SHUTTING_DOWN,
            Ordering::SeqCst,
            Ordering::SeqCst,
        )
        .is_ok()
}

fn force_mark_shutting_down() -> bool {
    loop {
        let current = CLOSE_STATE.load(Ordering::SeqCst);
        if current == CLOSE_STATE_SHUTTING_DOWN {
            return false;
        }

        if CLOSE_STATE
            .compare_exchange(
                current,
                CLOSE_STATE_SHUTTING_DOWN,
                Ordering::SeqCst,
                Ordering::SeqCst,
            )
            .is_ok()
        {
            return true;
        }
    }
}

/// 重置关闭状态为空闲（用于取消关闭后重置状态）
#[allow(dead_code)]
fn reset_close_state() {
    CLOSE_STATE.store(CLOSE_STATE_IDLE, Ordering::SeqCst);
}

/// 检测当前平台是否为 macOS
fn is_macos() -> bool {
    cfg!(target_os = "macos")
}

/// 根据平台决定是否使用装饰（标题栏）
fn should_use_decorations() -> bool {
    is_macos()
}

// ============================================================================
// 统一的关闭逻辑 (Shared Shutdown Logic)
// ============================================================================

/// 执行统一的优雅关闭流程
///
/// 这个函数是所有关闭路径的统一出口：
/// - 用户点击窗口 X 按钮
/// - 用户点击应用内退出按钮
/// - 前端响应超时自动关闭
/// - 前端通信失败时的兜底关闭
pub async fn perform_graceful_shutdown(app_handle: AppHandle) {
    debug_info!("🔄 执行统一关闭流程...");

    // 1. 先隐藏所有窗口（避免白屏，提升用户体验）
    let windows: Vec<_> = app_handle.webview_windows().into_iter().collect();
    for (label, window) in &windows {
        let _ = window.hide();
        debug_info!("  已隐藏窗口: {}", label);
    }

    // 2. 执行核心清理（带超时保护，防止清理过程死锁）
    let cleanup_task = async {
        match crate::process_manager::force_cleanup_and_clear(true).await {
            Ok(result) => {
                debug_info!("  资源清理成功: {}", result);
            }
            Err(e) => {
                debug_error!("  资源清理失败: {}", e);
            }
        }
    };

    // 清理任务超时保护（3秒）
    if tokio::time::timeout(tokio::time::Duration::from_secs(3), cleanup_task)
        .await
        .is_err()
    {
        debug_error!("⚠️ 警告：清理任务超时！");
    }

    // 3. 关闭所有窗口（解决 Chrome_WidgetWin_0 注销失败问题）
    // 必须在 app.exit() 之前显式关闭窗口，否则 Chromium 窗口类无法正确注销
    debug_info!("🪟 正在关闭所有窗口...");
    for (label, window) in &windows {
        if let Err(e) = window.close() {
            debug_error!("  关闭窗口 {} 失败: {}", label, e);
        } else {
            debug_info!("  已关闭窗口: {}", label);
        }
    }

    // 给窗口一点时间完成销毁
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

    // 4. 退出应用 - 使用 Tauri 标准退出
    debug_info!("📤 请求 Tauri 退出...");
    app_handle.exit(0);

    // 5. 保底措施：如果 app.exit() 没有在 1 秒内退出（可能被死锁阻挡），强制结束
    tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
    debug_info!("⚠️ Tauri 退出无响应，执行系统级强制退出。");
    std::process::exit(0);
}

// ============================================================================
// 窗口事件处理器
// ============================================================================

/// 窗口事件处理器
pub struct WindowEventHandler;

impl WindowEventHandler {
    pub fn new() -> Self {
        Self
    }

    /// 设置窗口关闭事件处理
    ///
    /// 注意：明确获取 'main' 窗口，而不是随机获取一个窗口
    /// 这样可以避免多窗口场景下的混乱
    pub fn setup_window_events(&self, app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
        // 优化：明确获取主窗口，而不是使用 into_iter().next()
        // 主窗口的默认 label 是 "main"
        if let Some(window) = app.get_webview_window("main") {
            let app_handle = app.handle().clone();

            window.on_window_event(move |event| {
                match event {
                    WindowEvent::CloseRequested { api, .. } => {
                        // 1. 拦截默认关闭行为
                        api.prevent_close();

                        // 2. 检查状态，防止重复处理
                        if !begin_close_confirmation() {
                            debug_info!("🚫 忽略重复的关闭请求（关闭流程已在进行中）");
                            return;
                        }

                        let app_handle_clone = app_handle.clone();

                        tauri::async_runtime::spawn(async move {
                            // 3. 通知前端显示确认弹窗
                            if let Err(e) = app_handle_clone.emit("show-close-confirmation", ()) {
                                // 前端通信失败（可能页面崩溃/白屏），直接执行关闭
                                debug_error!("⚠️ 前端通信失败 ({})，直接执行关闭流程", e);
                                force_mark_shutting_down();
                                perform_graceful_shutdown(app_handle_clone).await;
                                return;
                            }

                            // 4. 超时保底机制（防止前端 JS 崩溃导致关不掉窗口）
                            tokio::time::sleep(tokio::time::Duration::from_millis(
                                CLOSE_CONFIRMATION_TIMEOUT_MS,
                            ))
                            .await;

                            // 再次检查状态，如果仍是"等待中"，说明前端没有响应
                            if mark_shutting_down_if_waiting() {
                                debug_info!("⏰ 前端响应超时，执行强制关闭流程");
                                perform_graceful_shutdown(app_handle_clone).await;
                            }
                        });
                    }
                    WindowEvent::Destroyed => {
                        debug_info!("🗑️ 窗口句柄已销毁");
                    }
                    _ => {}
                }
            });

            debug_info!("✅ 主窗口关闭事件已绑定");
        } else {
            // 如果找不到 "main" 窗口，尝试使用第一个可用窗口（兼容性处理）
            if let Some((label, window)) = app.webview_windows().into_iter().next() {
                debug_info!("⚠️ 未找到 'main' 窗口，使用窗口 '{}' 作为主窗口", label);
                let app_handle = app.handle().clone();

                window.on_window_event(move |event| match event {
                    WindowEvent::CloseRequested { api, .. } => {
                        api.prevent_close();

                        if !begin_close_confirmation() {
                            debug_info!("🚫 忽略重复的关闭请求");
                            return;
                        }

                        let app_handle_clone = app_handle.clone();

                        tauri::async_runtime::spawn(async move {
                            if let Err(e) = app_handle_clone.emit("show-close-confirmation", ()) {
                                debug_error!("⚠️ 前端通信失败 ({})，直接执行关闭流程", e);
                                force_mark_shutting_down();
                                perform_graceful_shutdown(app_handle_clone).await;
                                return;
                            }

                            tokio::time::sleep(tokio::time::Duration::from_millis(
                                CLOSE_CONFIRMATION_TIMEOUT_MS,
                            ))
                            .await;

                            if mark_shutting_down_if_waiting() {
                                debug_info!("⏰ 前端响应超时，执行强制关闭流程");
                                perform_graceful_shutdown(app_handle_clone).await;
                            }
                        });
                    }
                    WindowEvent::Destroyed => {
                        debug_info!("🗑️ 窗口句柄已销毁");
                    }
                    _ => {}
                });
            } else {
                debug_info!("⚠️ 警告: 未找到任何窗口，窗口关闭事件未绑定");
            }
        }

        Ok(())
    }
}

impl Default for WindowEventHandler {
    fn default() -> Self {
        Self::new()
    }
}

/// 配置主窗口的平台特定设置
pub fn configure_main_window_decorations(
    app: &tauri::App,
) -> Result<(), Box<dyn std::error::Error>> {
    // 优化：明确获取主窗口
    if let Some(window) = app.get_webview_window("main") {
        if should_use_decorations() {
            debug_info!("🍎 检测到 macOS 平台，启用原生标题栏装饰");
            if let Err(e) = window.set_decorations(true) {
                debug_info!("⚠️ 设置窗口装饰失败: {}", e);
            }
        } else {
            debug_info!("🖥️ 检测到非 macOS 平台，保持自定义标题栏");
        }
    } else if let Some((label, window)) = app.webview_windows().into_iter().next() {
        // 兼容性处理
        debug_info!("⚠️ 未找到 'main' 窗口，使用窗口 '{}' 配置装饰", label);
        if should_use_decorations() {
            if let Err(e) = window.set_decorations(true) {
                debug_info!("⚠️ 设置窗口装饰失败: {}", e);
            }
        }
    }
    Ok(())
}

/// 设置应用程序的窗口事件处理（统一入口）
///
/// 注意：此函数应该只被调用一次，避免重复绑定事件
pub fn setup_app_window_events(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    // 首先配置主窗口装饰
    configure_main_window_decorations(app)?;

    // 然后设置事件处理
    let handler = WindowEventHandler::new();
    handler.setup_window_events(app)
}

// ============================================================================
// Tauri Commands
// ============================================================================

/// Tauri command: 用户确认关闭应用程序
///
/// 前端调用此命令表示用户确认退出
#[tauri::command]
pub async fn confirm_close_application(app_handle: AppHandle) -> Result<(), String> {
    debug_info!("✅ 用户确认关闭应用程序");
    if force_mark_shutting_down() {
        perform_graceful_shutdown(app_handle).await;
    } else {
        debug_info!("ℹ️ 关闭流程已在执行中，忽略重复的确认请求");
    }
    Ok(())
}

/// Tauri command: 用户取消关闭应用程序
///
/// 前端调用此命令表示用户取消退出
#[tauri::command]
pub fn cancel_close_application() -> Result<(), String> {
    if CLOSE_STATE
        .compare_exchange(
            CLOSE_STATE_WAITING_CONFIRM,
            CLOSE_STATE_IDLE,
            Ordering::SeqCst,
            Ordering::SeqCst,
        )
        .is_ok()
    {
        debug_info!("❌ 用户取消关闭应用程序");
    } else {
        debug_info!("ℹ️ 收到取消关闭请求，但当前没有等待确认的关闭流程");
    }
    Ok(())
}

/// Tauri command: 强制退出应用程序（用于应用内退出按钮）
///
/// 此命令会跳过确认流程，直接执行优雅关闭
#[tauri::command]
pub async fn exit_application(app_handle: AppHandle) -> Result<(), String> {
    debug_info!("🚪 收到退出应用程序请求");
    // 标记为正在关闭，防止其他关闭流程干扰
    force_mark_shutting_down();
    // 执行统一的关闭流程
    perform_graceful_shutdown(app_handle).await;
    Ok(())
}

/// Tauri command: 重启应用程序
#[tauri::command]
pub fn restart_application(app_handle: AppHandle) {
    debug_info!("🔄 收到重启应用程序请求");
    app_handle.restart();
}
