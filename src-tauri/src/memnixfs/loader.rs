//! Linux 内存镜像加载模块（MemNixFS）
//!
//! 通过外部 MemNixFS 程序把 Linux 内存转储（AVML/LiME/raw/kdump）挂载为可浏览文件系统。
//! Windows 使用 WinFsp 挂载到盘符（默认 M:），最大化复用现有的挂载盘浏览管线。
//!
//! 与 MemProcFS 加载的差异：
//! - 命令形态：`memnixfs --dump <镜像> [--symbols <目录>] --forensic=<mode> [--no-http-cache|--auto-fetch] mount M:`
//! - 完成判定改为"轮询挂载点存在"（M:\sys / M:\proc），而非依赖 stdout 关键字
//! - 不做 Windows 的 vol2 profile 检测

use crate::AppSettings;
use std::path::Path;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command as TokioCommand;

use super::types::LinuxLoadResult;
use crate::loadmem::types::CommandEvent;
use crate::loadmem::utils::{decode_with_fallback, generate_command_id, get_current_time};

/// 构造失败结果（未启动进程的早期校验失败）
fn fail(message: &str, command: String) -> LinuxLoadResult {
    LinuxLoadResult {
        success: false,
        message: message.to_string(),
        process_id: None,
        command,
        output: String::new(),
        error: message.to_string(),
        kernel_banner: None,
        symbols_resolved: false,
    }
}

/// 检测 MemNixFS 输出是否表明"未找到内核符号表(ISF)"
fn is_symbols_missing(line: &str) -> bool {
    let l = line.to_lowercase();
    l.contains("fetch_symbols.sh")
        || l.contains("kernel debug symbols")
        || l.contains("no --symbols path")
        || l.contains("--auto-fetch to have us")
        || (l.contains("searched:") && l.contains("symbol"))
}

/// 从 `fetch_symbols.sh '5.4.0-84-generic'` 提取内核版本
fn extract_kernel_version(line: &str) -> Option<String> {
    let idx = line.find("fetch_symbols.sh")?;
    let rest = &line[idx..];
    let q1 = rest.find('\'')?;
    let after = &rest[q1 + 1..];
    let q2 = after.find('\'')?;
    let v = after[..q2].trim();
    if v.is_empty() {
        None
    } else {
        Some(v.to_string())
    }
}

/// 加载 Linux 内存镜像。
pub async fn load_linux_memory_image(
    settings: &AppSettings,
    image_path: &str,
    app_handle: Option<AppHandle>,
) -> Result<LinuxLoadResult, String> {
    load_linux_memory_image_impl(settings, image_path, app_handle).await
}

/// 验证 MemNixFS 是否真正完成挂载。
/// Windows 轮询挂载盘下的 sys/proc 目录（MemNixFS 顶层目录，区别于 MemProcFS 的 forensic\ntfs）；
/// forensic 预热较慢，放宽到约 60 秒。非 Windows 暂不阻断。
async fn verify_memnixfs_mounted(symbols_missing: &Arc<AtomicBool>) -> bool {
    #[cfg(target_os = "windows")]
    {
        let root = crate::settings::mount_root();
        let sys_dir = format!("{}sys", root);
        let proc_dir = format!("{}proc", root);
        let mem_dir = format!("{}mem", root);
        for _ in 0..120 {
            if Path::new(&sys_dir).exists()
                || Path::new(&proc_dir).exists()
                || Path::new(&mem_dir).exists()
            {
                return true;
            }
            // 检测到"未找到符号表"则提前结束等待，快速给出明确提示
            if symbols_missing.load(Ordering::SeqCst) {
                return false;
            }
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        }
        false
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = symbols_missing;
        true
    }
}

/// 尝试读取内核版本字符串（M:\sys\banner.txt）
async fn read_kernel_banner() -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        let path = format!("{}sys\\banner.txt", crate::settings::mount_root());
        match tokio::fs::read_to_string(&path).await {
            Ok(s) => {
                let t = s.trim().to_string();
                if t.is_empty() { None } else { Some(t) }
            }
            Err(_) => None,
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        None
    }
}

/// 后台流式读取一个管道并把每行作为 command-event 发送给前端日志面板
async fn stream_pipe<R>(
    pipe: R,
    app_handle: Option<AppHandle>,
    is_err: bool,
    symbols_missing: Arc<AtomicBool>,
    kernel_version: Arc<Mutex<Option<String>>>,
) where
    R: tokio::io::AsyncRead + Unpin,
{
    let mut reader = BufReader::new(pipe);
    let mut buffer = Vec::new();

    loop {
        buffer.clear();
        match reader.read_until(b'\n', &mut buffer).await {
            Ok(0) => break,
            Ok(_) => {
                let line = decode_with_fallback(&buffer);
                let line = line.trim_end_matches('\n').trim_end_matches('\r');
                if line.is_empty() {
                    continue;
                }

                // 检测"未找到内核符号表"
                if is_symbols_missing(line) {
                    symbols_missing.store(true, Ordering::SeqCst);
                    if let Some(v) = extract_kernel_version(line) {
                        if let Ok(mut kv) = kernel_version.lock() {
                            if kv.is_none() {
                                *kv = Some(v);
                            }
                        }
                    }
                }

                debug_info!(
                    "[MemNixFS {}] {}",
                    if is_err { "STDERR" } else { "STDOUT" },
                    line
                );

                if let Some(app) = &app_handle {
                    let event = CommandEvent {
                        id: generate_command_id(),
                        name: "MemNixFS 输出".to_string(),
                        command: "MemNixFS 实时输出".to_string(),
                        status: "running".to_string(),
                        output: if is_err { None } else { Some(line.to_string()) },
                        error: if is_err { Some(line.to_string()) } else { None },
                        time: get_current_time(),
                    };
                    let _ = app.emit("command-event", &event);
                }
            }
            Err(e) => {
                debug_info!("[MemNixFS] 读取管道出错: {}", e);
                break;
            }
        }
    }
}

/// 加载 Linux 内存镜像的实际实现
async fn load_linux_memory_image_impl(
    settings: &AppSettings,
    image_path: &str,
    app_handle: Option<AppHandle>,
) -> Result<LinuxLoadResult, String> {
    debug_info!(">>> load_linux_memory_image_impl 开始");
    debug_info!("  image_path: {}", image_path);
    debug_info!("  memnixfs_path: {}", settings.memnixfs_path);
    debug_info!("  symbols_path: {}", settings.memnixfs_symbols_path);

    // 1. 校验 MemNixFS 可执行文件
    if settings.memnixfs_path.is_empty() {
        return Ok(fail(
            "MemNixFS 路径未设置，请在应用设置中配置",
            String::new(),
        ));
    }
    if !Path::new(&settings.memnixfs_path).exists() {
        return Ok(fail(
            &format!("MemNixFS 可执行文件不存在: {}", settings.memnixfs_path),
            String::new(),
        ));
    }

    // 2. 校验镜像文件
    if !Path::new(image_path).exists() {
        return Ok(fail(
            &format!("镜像文件不存在: {}", image_path),
            String::new(),
        ));
    }

    // 3. 符号相关路径（不在此早退：MemNixFS 还会搜索符号缓存/默认目录，真正缺符号由运行时检测处理）
    let symbols = settings.memnixfs_symbols_path.trim().to_string();

    // 4. 运行时完整性校验
    crate::integrity_check!();

    // 5. 清空输出目录
    if let Err(e) = super::file_ops::clear_output_directory(&settings.output_path).await {
        debug_info!("[-] 清空输出目录失败: {}", e);
        return Err(format!("清空输出目录失败: {}", e));
    }

    // 6. 互斥保险：加载 Linux 前先停掉占用挂载盘的 MemProcFS 残留（前端通常已处理，这里兜底）
    #[cfg(target_os = "windows")]
    {
        if let Some(pid) = crate::loadmem::process::find_memprocfs_process_id() {
            debug_info!(
                "[MemNixFS] 检测到 MemProcFS 残留(PID {})，先停止以释放挂载盘",
                pid
            );
            let _ = crate::loadmem::stop_memprocfs(pid);
            tokio::time::sleep(std::time::Duration::from_millis(800)).await;
        }
    }

    // 7. 构建命令
    let letter = crate::settings::sanitize_drive_letter(&settings.mount_drive_letter);
    let vmlinux = settings.memnixfs_vmlinux_path.trim().to_string();
    let symbol_cache = settings.memnixfs_symbol_cache_path.trim().to_string();
    let proxy = settings.memnixfs_proxy.trim().to_string();

    // 供前端展示的可读命令字符串
    let mut full_command = format!("{} --dump \"{}\"", settings.memnixfs_path, image_path);
    if !symbols.is_empty() {
        full_command.push_str(&format!(" --symbols \"{}\"", symbols));
    }
    if !symbol_cache.is_empty() {
        full_command.push_str(&format!(" --symbol-cache \"{}\"", symbol_cache));
    }
    if !vmlinux.is_empty() {
        full_command.push_str(&format!(" --vmlinux \"{}\"", vmlinux));
    }
    if settings.memnixfs_auto_fetch {
        full_command.push_str(" --auto-fetch");
    } else {
        full_command.push_str(" --no-http-cache");
    }
    full_command.push_str(&format!(" mount {}:", letter));
    if !proxy.is_empty() {
        full_command.push_str(&format!("  [proxy={}]", proxy));
    }
    debug_info!("[MemNixFS] 执行命令: {}", full_command);

    // 逐参拼接，避免命令注入
    let mut cmd = TokioCommand::new(&settings.memnixfs_path);
    if let Some(parent) = Path::new(&settings.memnixfs_path).parent() {
        cmd.current_dir(parent);
    }
    cmd.arg("--dump").arg(image_path);
    if !symbols.is_empty() {
        cmd.arg("--symbols").arg(&symbols);
    }
    if !symbol_cache.is_empty() {
        cmd.arg("--symbol-cache").arg(&symbol_cache);
    }
    if !vmlinux.is_empty() {
        cmd.arg("--vmlinux").arg(&vmlinux);
    }
    if settings.memnixfs_auto_fetch {
        cmd.arg("--auto-fetch");
    } else {
        cmd.arg("--no-http-cache");
    }
    cmd.arg("mount").arg(format!("{}:", letter));
    cmd.stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null());

    // 符号拉取代理（GitHub/ddebs 有时不通）：注入标准 HTTP 代理环境变量，
    // MemNixFS 的 HTTP 符号下载会走代理。
    if !proxy.is_empty() {
        cmd.env("HTTP_PROXY", &proxy)
            .env("HTTPS_PROXY", &proxy)
            .env("ALL_PROXY", &proxy)
            .env("http_proxy", &proxy)
            .env("https_proxy", &proxy)
            .env("all_proxy", &proxy);
    }

    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    // 8. 启动进程
    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            return Ok(fail(&format!("启动 MemNixFS 失败: {}", e), full_command));
        }
    };
    let process_id = child.id().unwrap_or(0);
    debug_info!("[MemNixFS] 进程启动成功，PID: {}", process_id);

    // 9. 后台流式转发 stdout/stderr 到日志面板（fire-and-forget；进程会持有挂载盘常驻运行）
    //    同时检测"未找到符号表"输出
    let symbols_missing = Arc::new(AtomicBool::new(false));
    let kernel_version: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
    if let Some(stdout) = child.stdout.take() {
        let app = app_handle.clone();
        let sm = symbols_missing.clone();
        let kv = kernel_version.clone();
        tokio::spawn(async move {
            stream_pipe(stdout, app, false, sm, kv).await;
        });
    }
    if let Some(stderr) = child.stderr.take() {
        let app = app_handle.clone();
        let sm = symbols_missing.clone();
        let kv = kernel_version.clone();
        tokio::spawn(async move {
            stream_pipe(stderr, app, true, sm, kv).await;
        });
    }

    // 10. 等待挂载就绪（轮询 M:\sys / M:\proc；检测到符号缺失则提前结束）
    let mounted = verify_memnixfs_mounted(&symbols_missing).await;
    if !mounted {
        // 挂载失败，杀掉进程避免残留卡死
        let _ = super::process::stop_memnixfs(process_id);

        // 符号表缺失：给出明确、可操作的提示
        if symbols_missing.load(Ordering::SeqCst) {
            let kv = kernel_version.lock().ok().and_then(|k| k.clone());
            let kv_text = kv.clone().unwrap_or_else(|| "该 Linux 内核".to_string());
            let msg = format!(
                "未找到内核符号表(ISF)：MemNixFS 无法解析 {} 的内核结构。\n请在设置中配置「MemNixFS 符号目录」或「符号缓存目录」，或开启「联网自动获取符号」(--auto-fetch)。",
                kv_text
            );
            return Ok(LinuxLoadResult {
                success: false,
                message: msg,
                process_id: Some(process_id),
                command: full_command,
                output: String::new(),
                error: "symbols-not-found".to_string(),
                kernel_banner: kv,
                symbols_resolved: false,
            });
        }

        return Ok(LinuxLoadResult {
            success: false,
            message: format!(
                "MemNixFS 进程已启动(PID: {})，但未检测到挂载盘 {}:。可能原因：符号不匹配、WinFsp 未安装、{}: 被占用、或镜像格式不受支持",
                process_id, letter, letter
            ),
            process_id: Some(process_id),
            command: full_command,
            output: String::new(),
            error: format!("未检测到 MemNixFS 挂载盘({}:\\sys)", letter),
            kernel_banner: None,
            symbols_resolved: false,
        });
    }

    // 11. 挂载成功：读取内核版本
    let kernel_banner = read_kernel_banner().await;

    // 加载时同步把取证产物复制到 output（复制完才返回，保证 output 一定有文件）。
    // 进度通过 memnixfs-copy-progress / memnixfs-copy-done 事件上报到加载界面。
    match super::file_ops::export_key_forensic_reports(settings, app_handle.clone()).await {
        Ok(msg) => debug_info!("[MemNixFS] 复制完成: {}", msg),
        Err(e) => debug_info!("[MemNixFS] 复制失败: {}", e),
    }

    if let Some(app) = &app_handle {
        let event = CommandEvent {
            id: generate_command_id(),
            name: "MemNixFS 加载完成".to_string(),
            command: "MemNixFS mount ready".to_string(),
            status: "completed".to_string(),
            output: Some(format!(
                "Linux 内存镜像已挂载到 {}:\\，正在后台复制取证文件到 output",
                letter
            )),
            error: None,
            time: get_current_time(),
        };
        let _ = app.emit("command-event", &event);
    }

    Ok(LinuxLoadResult {
        success: true,
        message: format!("MemNixFS 启动成功，进程ID: {}", process_id),
        process_id: Some(process_id),
        command: full_command,
        output: format!(
            "MemNixFS 已挂载 Linux 内存镜像到 {}:\\ (PID: {})",
            letter, process_id
        ),
        error: String::new(),
        kernel_banner,
        symbols_resolved: true,
    })
}
