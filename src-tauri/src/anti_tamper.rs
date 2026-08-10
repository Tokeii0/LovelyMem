//! 运行时完整性保护模块
//! 提供多层运行时完整性检查：
//! - 系统时钟回拨检测（多位置时间戳存储）
//! - 调试器附加检测（Windows API）
//! - 网络时间校验（HTTP Date 头部）

use chrono::Utc;
use obfstr::obfstr;
use std::fs;
use std::path::PathBuf;

/// 时间戳 XOR 混淆密钥
const TS_KEY: u8 = 0xA7;
/// 合法时钟漂移容忍度（2小时，覆盖时区调整和NTP同步）
const DRIFT_TOLERANCE: i64 = 7200;

// ─── 时间戳存储基础设施 ───

fn xor_transform(data: &[u8]) -> Vec<u8> {
    data.iter().map(|b| b ^ TS_KEY).collect()
}

fn ts_path_primary() -> Result<PathBuf, String> {
    let dir = crate::settings::get_app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join(obfstr!(".cache_idx")))
}

fn ts_path_secondary() -> Result<PathBuf, String> {
    let dir = crate::settings::get_app_data_dir().map_err(|e| e.to_string())?;
    let sub = dir.join(obfstr!("cache"));
    let _ = fs::create_dir_all(&sub);
    Ok(sub.join(obfstr!(".font_cache")))
}

fn read_ts(path: &PathBuf) -> Option<i64> {
    let data = fs::read(path).ok()?;
    if data.is_empty() {
        return None;
    }
    let decoded = xor_transform(&data);
    String::from_utf8(decoded).ok()?.trim().parse::<i64>().ok()
}

fn write_ts(path: &PathBuf, ts: i64) {
    let encoded = xor_transform(ts.to_string().as_bytes());
    if fs::write(path, &encoded).is_ok() {
        #[cfg(windows)]
        {
            // 设置隐藏+系统属性，使文件不易被发现
            use std::os::windows::process::CommandExt;
            let p = path.to_string_lossy().to_string();
            let _ = std::process::Command::new("attrib")
                .args(["+H", "+S", &p])
                .creation_flags(0x08000000)
                .output();
        }
    }
}

// ─── Windows 注册表时间戳存储（第三存储位置）───

#[cfg(windows)]
fn registry_read_ts() -> Option<i64> {
    use std::os::windows::process::CommandExt;
    let key = obfstr!("HKCU\\Software\\Microsoft\\InputSettings\\Cache").to_string();
    let val = obfstr!("SyncTimestamp").to_string();

    let output = std::process::Command::new("reg")
        .args(["query", &key, "/v", &val])
        .creation_flags(0x08000000)
        .output()
        .ok()?;

    let out = String::from_utf8_lossy(&output.stdout);
    for line in out.lines() {
        let trimmed = line.trim();
        if trimmed.contains("SyncTimestamp") || trimmed.contains(&val) {
            let parts: Vec<&str> = trimmed.split_whitespace().collect();
            if parts.len() >= 3 {
                return parts.last()?.parse::<i64>().ok();
            }
        }
    }
    None
}

#[cfg(windows)]
fn registry_write_ts(ts: i64) {
    use std::os::windows::process::CommandExt;
    let key = obfstr!("HKCU\\Software\\Microsoft\\InputSettings\\Cache").to_string();
    let val = obfstr!("SyncTimestamp").to_string();
    let data = ts.to_string();

    let _ = std::process::Command::new("reg")
        .args(["add", &key, "/v", &val, "/t", "REG_SZ", "/d", &data, "/f"])
        .creation_flags(0x08000000)
        .output();
}

// ─── 时钟回拨检测 ───

/// 检查系统时间完整性，检测时钟回拨攻击
/// 在多个位置存储上次验证时间戳，如果当前时间早于记录时间则判定为篡改
pub fn check_time_integrity() -> Result<(), String> {
    check_time_integrity_inner()
}

fn check_time_integrity_inner() -> Result<(), String> {
    let now = Utc::now().timestamp();
    let mut max_stored: i64 = 0;

    // 从所有存储位置读取最大时间戳
    if let Ok(p) = ts_path_primary() {
        if let Some(t) = read_ts(&p) {
            max_stored = max_stored.max(t);
        }
    }
    if let Ok(p) = ts_path_secondary() {
        if let Some(t) = read_ts(&p) {
            max_stored = max_stored.max(t);
        }
    }
    #[cfg(windows)]
    {
        if let Some(t) = registry_read_ts() {
            max_stored = max_stored.max(t);
        }
    }

    // 如果当前时间早于上次记录的时间超过容忍度，判定为时钟回拨
    if max_stored > 0 && now < max_stored - DRIFT_TOLERANCE {
        debug_error!(
            "⚠️ 时间完整性检查失败: 当前时间={}, 上次记录={}, 差值={}秒",
            now,
            max_stored,
            max_stored - now
        );
        return Err(
            obfstr!("系统时间异常，检测到时钟回拨。请恢复正确的系统时间后重试。").to_string(),
        );
    }

    // 更新所有存储位置（确保攻击者需要找到并清除所有位置）
    if let Ok(p) = ts_path_primary() {
        write_ts(&p, now);
    }
    if let Ok(p) = ts_path_secondary() {
        write_ts(&p, now);
    }
    #[cfg(windows)]
    {
        registry_write_ts(now);
    }

    Ok(())
}

// ─── 网络时间验证 ───

/// 通过 HTTP Date 头部验证网络时间
/// 使用国内常见网站作为时间源，离线时静默通过
pub async fn verify_network_time() -> Result<(), String> {
    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .no_proxy()
        .build()
    {
        Ok(c) => c,
        Err(_) => return Ok(()), // 客户端构建失败，静默通过
    };

    let urls: &[&str] = &[
        "https://www.baidu.com",
        "https://www.qq.com",
        "https://www.taobao.com",
    ];

    for url in urls {
        match client.head(*url).send().await {
            Ok(resp) => {
                if let Some(date_header) = resp.headers().get("date") {
                    if let Ok(date_str) = date_header.to_str() {
                        if let Ok(server_time) = chrono::DateTime::parse_from_rfc2822(date_str) {
                            let server_ts = server_time.timestamp();
                            let local_ts = Utc::now().timestamp();
                            let diff = (local_ts - server_ts).abs();

                            // 本地时间与服务器时间相差超过48小时，判定为可疑
                            if diff > 48 * 3600 {
                                debug_error!(
                                    "⚠️ NTP验证失败: 本地={}, 服务器={}, 差值={}小时",
                                    local_ts,
                                    server_ts,
                                    diff / 3600
                                );
                                return Err(obfstr!(
                                    "系统时间与网络时间差异过大，请校准系统时钟。"
                                )
                                .to_string());
                            }
                            return Ok(()); // 验证通过
                        }
                    }
                }
            }
            Err(_) => continue, // 该服务器不可达，尝试下一个
        }
    }

    // 所有服务器都不可达（离线环境），静默通过不阻断
    Ok(())
}

// ─── 代码段完整性校验 ───

/// 启动时记录的 .text 段哈希（32位截断的 FNV-1a）
static TEXT_SECTION_HASH: AtomicU64 = AtomicU64::new(0);
static TEXT_SECTION_BASE: AtomicU64 = AtomicU64::new(0);
static TEXT_SECTION_SIZE: AtomicU64 = AtomicU64::new(0);

/// FNV-1a 64 位哈希
fn fnv1a_64(data: &[u8]) -> u64 {
    let mut h: u64 = 0xcbf29ce484222325;
    for &b in data {
        h ^= b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    h
}

/// 在 Windows 上定位当前进程的 .text 段并计算其哈希
#[cfg(windows)]
fn compute_text_hash() -> Option<(u64, u64, u64)> {
    unsafe {
        unsafe extern "system" {
            fn GetModuleHandleW(module_name: *const u16) -> *mut core::ffi::c_void;
        }

        let h_mod = GetModuleHandleW(std::ptr::null());
        if h_mod.is_null() {
            return None;
        }
        let base = h_mod as *const u8;

        // DOS 头: e_lfanew 在偏移 0x3C
        let e_lfanew = *(base.add(0x3C) as *const u32) as usize;
        // PE 签名 "PE\0\0" 在 e_lfanew
        let pe_sig = *(base.add(e_lfanew) as *const u32);
        if pe_sig != 0x00004550 {
            return None;
        }
        // NT Headers: +4 是 FileHeader, FileHeader.SizeOfOptionalHeader 在 +4+16
        let file_header_off = e_lfanew + 4;
        let num_sections = *(base.add(file_header_off + 2) as *const u16) as usize;
        let size_of_optional_header = *(base.add(file_header_off + 16) as *const u16) as usize;
        // Section Headers 紧跟在 OptionalHeader 之后
        let section_table_off = file_header_off + 20 + size_of_optional_header;

        // 每个 section header 40 字节
        for i in 0..num_sections {
            let sec = base.add(section_table_off + i * 40);
            // Name: 前 8 字节
            let name = std::slice::from_raw_parts(sec, 8);
            if &name[..5] == b".text" {
                let virtual_size = *(sec.add(8) as *const u32) as u64;
                let virtual_addr = *(sec.add(12) as *const u32) as u64;
                let text_ptr = base.add(virtual_addr as usize);
                // 只哈希前 64KB 以避免开销过大（足够检测常见 patch）
                let hash_len = virtual_size.min(65536) as usize;
                let slice = std::slice::from_raw_parts(text_ptr, hash_len);
                let hash = fnv1a_64(slice);
                return Some((hash, virtual_addr, virtual_size));
            }
        }
    }
    None
}

#[cfg(not(windows))]
fn compute_text_hash() -> Option<(u64, u64, u64)> {
    None
}

/// 启动时记录 .text 段基线哈希
pub fn init_text_hash() {
    if let Some((hash, base, size)) = compute_text_hash() {
        TEXT_SECTION_HASH.store(hash, Ordering::SeqCst);
        TEXT_SECTION_BASE.store(base, Ordering::SeqCst);
        TEXT_SECTION_SIZE.store(size, Ordering::SeqCst);
    }
}

/// 校验当前 .text 段与启动时是否一致
pub fn verify_text_hash() -> bool {
    let expected = TEXT_SECTION_HASH.load(Ordering::SeqCst);
    if expected == 0 {
        return true; // 未初始化，跳过检查
    }
    if let Some((current, _, _)) = compute_text_hash() {
        if current != expected {
            debug_error!(
                "⚠️ 代码段完整性校验失败: expected={:016x} actual={:016x}",
                expected,
                current
            );
            return false;
        }
        return true;
    }
    // 无法计算时宽容（非 Windows 或异常）
    true
}

// ─── 调试器检测 ───

/// 检测是否有调试器附加到当前进程
#[cfg(windows)]
pub fn is_debugger_present() -> bool {
    unsafe {
        // 方法1: IsDebuggerPresent - 检测用户态调试器
        if winapi::um::debugapi::IsDebuggerPresent() != 0 {
            return true;
        }

        // 方法2: CheckRemoteDebuggerPresent - 检测远程/内核态调试器
        let mut debug_flag: i32 = 0;
        let _ = winapi::um::debugapi::CheckRemoteDebuggerPresent(
            winapi::um::processthreadsapi::GetCurrentProcess(),
            &mut debug_flag as *mut i32 as *mut _,
        );
        if debug_flag != 0 {
            return true;
        }
    }
    false
}

#[cfg(not(windows))]
pub fn is_debugger_present() -> bool {
    // Linux: 检查 TracerPid
    #[cfg(target_os = "linux")]
    {
        if let Ok(status) = std::fs::read_to_string("/proc/self/status") {
            for line in status.lines() {
                if line.starts_with("TracerPid:") {
                    let pid = line.split(':').nth(1).unwrap_or("0").trim();
                    if pid != "0" {
                        return true;
                    }
                }
            }
        }
    }
    false
}

// ─── 综合检查接口 ───

/// 同步反篡改检查（不含网络请求，适合高频调用）
/// 包含：调试器检测 + 时钟回拨检测
pub fn run_sync_checks() -> Result<(), String> {
    run_sync_checks_inner()
}

fn run_sync_checks_inner() -> Result<(), String> {
    if is_debugger_present() {
        debug_error!("⚠️ 检测到调试器附加到当前进程");
        return Err(obfstr!("检测到不安全的运行环境").to_string());
    }

    check_time_integrity()?;

    // 代码段完整性校验（检测运行时 patch）
    if !verify_text_hash() {
        return Err(obfstr!("运行环境异常").to_string());
    }

    check_cumulative_runtime()?;

    Ok(())
}

/// 完整反篡改检查（包含网络时间验证，适合定时任务）
pub async fn run_all_checks() -> Result<(), String> {
    // 同步检查
    run_sync_checks()?;

    // 网络时间验证
    verify_network_time().await?;

    Ok(())
}

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

const RUNTIME_GUARD_INTERVAL_SECS: u64 = 300;
const RUNTIME_GUARD_STALE_SECS: u64 = 1800;

static PROCESS_START_TS: AtomicU64 = AtomicU64::new(0);
static RUNTIME_HEARTBEAT: AtomicU64 = AtomicU64::new(0);
static RUNTIME_GUARD_STARTED: AtomicBool = AtomicBool::new(false);

fn current_unix_timestamp() -> u64 {
    Utc::now().timestamp().max(0) as u64
}

/// 初始化与授权无关的运行时守卫。
pub fn init_runtime_guard() {
    let now = current_unix_timestamp();
    PROCESS_START_TS.store(now, Ordering::SeqCst);
    RUNTIME_HEARTBEAT.store(now, Ordering::SeqCst);
}

/// 启动完整性检查心跳，检测守卫任务被停止或运行时被挂起后未恢复的情况。
pub fn start_runtime_guard() {
    if RUNTIME_GUARD_STARTED.swap(true, Ordering::SeqCst) {
        return;
    }

    tauri::async_runtime::spawn(async {
        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(
                RUNTIME_GUARD_INTERVAL_SECS,
            ))
            .await;

            if run_sync_checks().is_err() {
                debug_error!("⚠️ 运行时完整性守卫检测失败");
                break;
            }
            RUNTIME_HEARTBEAT.store(current_unix_timestamp(), Ordering::SeqCst);
        }
    });
}

fn check_cumulative_runtime() -> Result<(), String> {
    let now = current_unix_timestamp();
    let start = PROCESS_START_TS.load(Ordering::SeqCst);
    if start != 0 && now < start {
        debug_error!("⚠️ 运行时时钟异常: now={} < process_start={}", now, start);
        return Err(obfstr!("系统时间异常").to_string());
    }
    Ok(())
}

fn runtime_guard_is_healthy() -> bool {
    let heartbeat = RUNTIME_HEARTBEAT.load(Ordering::SeqCst);
    heartbeat == 0 || current_unix_timestamp().saturating_sub(heartbeat) <= RUNTIME_GUARD_STALE_SECS
}

/// 内联完整性检查宏。
#[macro_export]
macro_rules! integrity_check {
    () => {{
        if let Err(__integrity_error) = $crate::anti_tamper::run_sync_checks() {
            return Err(__integrity_error);
        }
        if !$crate::anti_tamper::runtime_guard_healthy() {
            return Err(obfstr::obfstr!("完整性守卫异常").to_string());
        }
    }};
}

#[doc(hidden)]
pub fn runtime_guard_healthy() -> bool {
    runtime_guard_is_healthy()
}

/// 兼容旧 API。
#[inline(always)]
pub fn inline_integrity_check() -> bool {
    run_sync_checks().is_ok() && runtime_guard_is_healthy()
}

/// 异步内联验证
pub async fn async_inline_check() -> Result<(), String> {
    if !inline_integrity_check() {
        let delay = (Utc::now().timestamp() % 3 + 1) as u64;
        tokio::time::sleep(tokio::time::Duration::from_secs(delay)).await;
        return Err(obfstr!("操作执行失败").to_string());
    }
    Ok(())
}

/// 静默完整性检查
#[inline(always)]
pub fn silent_tamper_flag() -> bool {
    run_sync_checks().is_err() || !runtime_guard_is_healthy()
}
