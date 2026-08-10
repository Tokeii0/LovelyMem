use lazy_static::lazy_static;
use std::io::Write;
use std::sync::Mutex;
/// Debug模式管理模块
///
/// 功能：
/// - 检测 --debug 命令行参数
/// - 在Windows上动态显示/隐藏控制台窗口
/// - 提供debug日志输出功能
/// - 自动写入日志文件（debug.log）
/// - 设置 panic hook 捕获崩溃信息
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter};

lazy_static! {
    static ref APP_HANDLE: Mutex<Option<AppHandle>> = Mutex::new(None);
    /// 日志文件句柄（debug 模式下自动创建）
    static ref LOG_FILE: Mutex<Option<std::fs::File>> = Mutex::new(None);
    /// 日志文件路径
    static ref LOG_FILE_PATH: Mutex<String> = Mutex::new(String::new());
}

/// 全局debug模式标志
static DEBUG_MODE: AtomicBool = AtomicBool::new(false);

/// 获取当前时间戳字符串（精确到毫秒）
fn timestamp() -> String {
    chrono::Local::now()
        .format("%Y-%m-%d %H:%M:%S%.3f")
        .to_string()
}

/// 获取当前线程名称
fn thread_name() -> String {
    std::thread::current()
        .name()
        .unwrap_or("unnamed")
        .to_string()
}

/// 初始化日志文件
fn init_log_file() {
    // 日志文件放在可执行文件同级目录
    let log_path = if let Ok(exe_path) = std::env::current_exe() {
        if let Some(parent) = exe_path.parent() {
            parent.join("debug.log")
        } else {
            std::path::PathBuf::from("debug.log")
        }
    } else {
        std::path::PathBuf::from("debug.log")
    };

    // 同时在应用数据目录创建一份
    let app_data_log = crate::settings::get_app_data_dir()
        .ok()
        .map(|p| p.join("debug.log"));

    match std::fs::File::create(&log_path) {
        Ok(file) => {
            if let Ok(mut guard) = LOG_FILE.lock() {
                *guard = Some(file);
            }
            if let Ok(mut path_guard) = LOG_FILE_PATH.lock() {
                *path_guard = log_path.to_string_lossy().to_string();
            }
            println!("[DEBUG] 日志文件已创建: {}", log_path.display());
        }
        Err(e) => {
            eprintln!("[DEBUG] 创建日志文件失败 ({}): {}", log_path.display(), e);
            // 回退到应用数据目录
            if let Some(app_log) = &app_data_log {
                if let Some(parent) = app_log.parent() {
                    let _ = std::fs::create_dir_all(parent);
                }
                if let Ok(file) = std::fs::File::create(app_log) {
                    if let Ok(mut guard) = LOG_FILE.lock() {
                        *guard = Some(file);
                    }
                    if let Ok(mut path_guard) = LOG_FILE_PATH.lock() {
                        *path_guard = app_log.to_string_lossy().to_string();
                    }
                    println!("[DEBUG] 日志文件已创建（回退路径）: {}", app_log.display());
                }
            }
        }
    }

    // 如果应用数据目录和可执行文件目录不同，也在应用数据目录创建一份副本
    if let Some(app_log) = app_data_log {
        if app_log != log_path {
            if let Some(parent) = app_log.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            // 不需要再创建，后续 write_to_log 会同时写入
            println!("[DEBUG] 应用数据目录日志路径: {}", app_log.display());
        }
    }
}

/// 写入日志到文件
pub fn write_to_log(level: &str, message: &str) {
    if !is_debug_mode() {
        return;
    }
    let line = format!(
        "[{}] [{}] [{}] {}\n",
        timestamp(),
        level,
        thread_name(),
        message
    );
    if let Ok(mut guard) = LOG_FILE.lock() {
        if let Some(ref mut file) = *guard {
            let _ = file.write_all(line.as_bytes());
            let _ = file.flush();
        }
    }
}

/// 设置 panic hook，在崩溃时写入详细信息到日志文件
fn setup_panic_hook() {
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |panic_info| {
        let ts = timestamp();
        let thread = thread_name();

        let location = if let Some(loc) = panic_info.location() {
            format!("{}:{}:{}", loc.file(), loc.line(), loc.column())
        } else {
            "unknown location".to_string()
        };

        let payload = if let Some(s) = panic_info.payload().downcast_ref::<&str>() {
            s.to_string()
        } else if let Some(s) = panic_info.payload().downcast_ref::<String>() {
            s.clone()
        } else {
            "unknown panic payload".to_string()
        };

        let sep = "=".repeat(60);
        let crash_msg = format!(
            "\n{sep}\n\
             PANIC / CRASH DETECTED\n\
             {sep}\n\
             时间: {ts}\n\
             线程: {thread}\n\
             位置: {location}\n\
             信息: {payload}\n\
             {sep}\n\
             完整 panic 信息:\n{panic_info}\n\
             {sep}\n",
        );

        // 写入日志文件
        if let Ok(mut guard) = LOG_FILE.lock() {
            if let Some(ref mut file) = *guard {
                let _ = file.write_all(crash_msg.as_bytes());
                let _ = file.flush();
            }
        }

        // 同时尝试写入独立的 crash 日志
        if let Ok(path_guard) = LOG_FILE_PATH.lock() {
            if !path_guard.is_empty() {
                let crash_path =
                    std::path::Path::new(path_guard.as_str()).with_file_name("crash.log");
                if let Ok(mut crash_file) = std::fs::OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(&crash_path)
                {
                    let _ = crash_file.write_all(crash_msg.as_bytes());
                    let _ = crash_file.flush();
                }
            }
        }

        // 控制台输出
        eprintln!("{}", crash_msg);

        // 调用默认 hook（保留原有行为）
        default_hook(panic_info);
    }));
}

/// 设置全局 AppHandle，用于发送日志事件
pub fn set_app_handle(handle: AppHandle) {
    if is_debug_mode() {
        let msg = "AppHandle 已设置，后端日志系统已初始化";
        println!("[{}] [INFO] {}", timestamp(), msg);
        write_to_log("INFO", msg);
    }
    if let Ok(mut guard) = APP_HANDLE.lock() {
        *guard = Some(handle.clone());

        let _ = handle.emit(
            "backend-log",
            serde_json::json!({
                "level": "info",
                "message": "后端日志系统已初始化",
                "timestamp": chrono::Local::now().to_rfc3339()
            }),
        );
    }
}

/// 发送后端日志到前端（仅 debug 模式下发送）
pub fn emit_backend_log(level: &str, message: &str) {
    // 始终写入日志文件（如果 debug 模式开启）
    write_to_log(level, message);

    // 发送到前端
    if let Ok(guard) = APP_HANDLE.lock() {
        if let Some(handle) = &*guard {
            let payload = serde_json::json!({
                "level": level,
                "message": message,
                "timestamp": chrono::Local::now().to_rfc3339()
            });
            if let Err(e) = handle.emit("backend-log", payload) {
                eprintln!("[BACKEND-LOG] 发送事件失败: {}", e);
            }
        }
    }
}

/// 检查是否启用debug模式
pub fn is_debug_mode() -> bool {
    DEBUG_MODE.load(Ordering::Relaxed)
}

/// 获取日志文件路径
pub fn get_log_file_path() -> String {
    if let Ok(guard) = LOG_FILE_PATH.lock() {
        guard.clone()
    } else {
        String::new()
    }
}

/// 初始化debug模式
///
/// 检查命令行参数，如果包含 --debug 则启用debug模式、显示控制台、初始化日志文件
pub fn init_debug_mode() {
    let args: Vec<String> = std::env::args().collect();

    // 检查是否有 --debug 参数
    let has_debug_flag = args.iter().any(|arg| arg == "--debug" || arg == "-d");

    if has_debug_flag {
        DEBUG_MODE.store(true, Ordering::Relaxed);

        #[cfg(windows)]
        {
            show_console_window();
        }

        // 初始化日志文件
        init_log_file();

        // 设置 panic hook
        setup_panic_hook();

        let header = format!(
            "\n============================================================\n\
               Lovelymem V2 Debug Mode\n\
             ============================================================\n\
             启动时间:   {}\n\
             命令行参数: {:?}\n\
             工作目录:   {:?}\n\
             可执行文件: {:?}\n\
             系统架构:   {}\n\
             操作系统:   {}\n\
             Rust版本:   {}\n\
             日志文件:   {}\n\
             ============================================================\n",
            timestamp(),
            args,
            std::env::current_dir().unwrap_or_default(),
            std::env::current_exe().unwrap_or_default(),
            std::env::consts::ARCH,
            std::env::consts::OS,
            env!("CARGO_PKG_VERSION"),
            get_log_file_path(),
        );

        println!("{}", header);
        write_to_log("INFO", &header);
    }
}

/// Windows平台：显示控制台窗口
#[cfg(windows)]
fn show_console_window() {
    use winapi::um::consoleapi::AllocConsole;
    use winapi::um::wincon::GetConsoleWindow;
    use winapi::um::winuser::{SW_SHOW, ShowWindow};

    unsafe {
        let console_allocated = AllocConsole();
        if console_allocated != 0 {
            println!("已分配新的控制台窗口");
        }
        let console_window = GetConsoleWindow();
        if !console_window.is_null() {
            ShowWindow(console_window, SW_SHOW);
        } else {
            eprintln!("警告: 无法获取控制台窗口句柄");
        }
    }
}

/// 非Windows平台：空实现
#[cfg(not(windows))]
fn show_console_window() {
    println!("Debug模式已启用（非Windows平台）");
}

/// Debug日志宏 - 控制台输出仅在 debug 模式下，但始终发送到前端
#[macro_export]
macro_rules! debug_log {
    ($($arg:tt)*) => {
        {
            let msg = format!($($arg)*);
            if $crate::debug_mode::is_debug_mode() {
                println!("[{}] [DEBUG] [{}] {}",
                    chrono::Local::now().format("%H:%M:%S%.3f"),
                    std::thread::current().name().unwrap_or("unnamed"),
                    msg);
            }
            $crate::debug_mode::emit_backend_log("debug", &msg);
        }
    };
}

/// Debug错误日志宏
#[macro_export]
macro_rules! debug_error {
    ($($arg:tt)*) => {
        {
            let msg = format!($($arg)*);
            if $crate::debug_mode::is_debug_mode() {
                eprintln!("[{}] [ERROR] [{}] {}",
                    chrono::Local::now().format("%H:%M:%S%.3f"),
                    std::thread::current().name().unwrap_or("unnamed"),
                    msg);
            }
            $crate::debug_mode::emit_backend_log("error", &msg);
        }
    };
}

/// Debug警告日志宏
#[macro_export]
macro_rules! debug_warn {
    ($($arg:tt)*) => {
        {
            let msg = format!($($arg)*);
            if $crate::debug_mode::is_debug_mode() {
                println!("[{}] [WARN] [{}] {}",
                    chrono::Local::now().format("%H:%M:%S%.3f"),
                    std::thread::current().name().unwrap_or("unnamed"),
                    msg);
            }
            $crate::debug_mode::emit_backend_log("warn", &msg);
        }
    };
}

/// Debug信息日志宏
#[macro_export]
macro_rules! debug_info {
    ($($arg:tt)*) => {
        {
            let msg = format!($($arg)*);
            if $crate::debug_mode::is_debug_mode() {
                println!("[{}] [INFO] [{}] {}",
                    chrono::Local::now().format("%H:%M:%S%.3f"),
                    std::thread::current().name().unwrap_or("unnamed"),
                    msg);
            }
            $crate::debug_mode::emit_backend_log("info", &msg);
        }
    };
}

/// 获取debug模式状态（Tauri命令）
#[tauri::command]
pub fn get_debug_mode_status() -> bool {
    is_debug_mode()
}

/// 打印debug信息（Tauri命令）
#[tauri::command]
pub fn print_debug_info(message: String) {
    if is_debug_mode() {
        let msg = format!("[FRONTEND] {}", message);
        println!("[{}] [INFO] {}", timestamp(), msg);
        write_to_log("INFO", &msg);
    }
}

/// 获取日志文件路径（Tauri命令）
#[tauri::command]
pub fn get_debug_log_path() -> String {
    get_log_file_path()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_debug_mode_default() {
        // 默认应该是关闭的
        assert!(!is_debug_mode());
    }
}
