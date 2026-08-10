//! loadmem 模块的工具函数
//!
//! 包含系统检测、编码处理、完成标识检测等通用功能

use regex::Regex;
use std::path::Path;
use std::sync::LazyLock;
use std::sync::atomic::{AtomicU64, Ordering};

static WIN10_VERSION_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"Windows 10\.0\.(\d+)").expect("Invalid regex pattern"));

/// 获取当前系统架构
pub fn get_system_arch() -> String {
    std::env::consts::ARCH.to_string()
}

/// 检测是否为 ARM64 系统
pub fn is_arm64_system() -> bool {
    std::env::consts::ARCH == "aarch64"
}

/// 从输出中提取 Windows 10 版本号并格式化为 profile
/// 匹配模式：从类似 `[STDOUT] Initialized 64-bit Windows 10.0.19041` 的输出中提取版本号
pub fn extract_windows_10_version_and_profile(line: &str) -> Option<(String, bool)> {
    if let Some(captures) = WIN10_VERSION_RE.captures(line) {
        if let Some(version_match) = captures.get(1) {
            let version_number = version_match.as_str();
            debug_info!("[*] 提取到 Windows 10 版本号: {}", version_number);

            // 将版本号转换为数字进行比较
            if let Ok(version_num) = version_number.parse::<u32>() {
                // 格式化为标准 profile 格式
                let profile = format!("Win10x64_{}", version_number);
                debug_info!("[*] 格式化的 Profile: {}", profile);

                // 检查版本号是否大于 19041
                let vol2_disabled = version_num > 19041;
                if vol2_disabled {
                    debug_info!("[*] 版本号 {} > 19041，将禁用 vol2 区域功能", version_num);
                } else {
                    debug_info!("[*] 版本号 {} <= 19041，vol2 区域功能可用", version_num);
                }

                return Some((profile, vol2_disabled));
            }
        }
    }

    None
}

/// 检测 MemProcFS 加载完成的多种标识符
pub fn is_memprocfs_completed(line: &str) -> bool {
    let completion_indicators = [
        "Forensic mode completed",
        "forensic mode completed",
        "FORENSIC MODE COMPLETED",
        "Forensic analysis completed",
        "Analysis completed",
        "Processing completed",
        "MemProcFS completed",
        "Ready for analysis",
        "Initialization completed",
        "完成取证模式",
        "取证分析完成",
    ];

    for indicator in &completion_indicators {
        if line.contains(indicator) {
            debug_info!(
                "[*] 检测到完成标识符: '{}' 在输出: '{}'",
                indicator,
                line.trim()
            );
            return true;
        }
    }

    // ARM64 系统额外检查
    if is_arm64_system() {
        if line.contains("processes") && (line.contains("found") || line.contains("loaded")) {
            debug_info!("[*] ARM64 系统检测到进程信息完成标识符: '{}'", line.trim());
            return true;
        }

        if line.contains("memory") && line.contains("regions") {
            debug_info!("[*] ARM64 系统检测到内存区域完成标识符: '{}'", line.trim());
            return true;
        }
    }

    false
}

/// 检查 MemProcFS 挂载状态
pub fn check_memprocfs_mount_status() -> Vec<String> {
    let mut mount_info = Vec::new();

    let mount_points = {
        #[cfg(target_os = "macos")]
        {
            let desktop_path = std::env::var("HOME")
                .map(|home| format!("{}/Desktop/MemProcFS", home))
                .unwrap_or_else(|_| "/Users/Shared/MemProcFS".to_string());
            vec![
                desktop_path,
                "/tmp/memprocfs".to_string(),
                "/Users/Shared/memprocfs".to_string(),
                "./forensic".to_string(),
                "./output".to_string(),
            ]
        }

        #[cfg(not(target_os = "macos"))]
        {
            vec![
                crate::settings::mount_root(),
                "C:\\temp\\memprocfs".to_string(),
                "C:\\Users\\Public\\memprocfs".to_string(),
                ".\\forensic".to_string(),
                ".\\output".to_string(),
            ]
        }
    };

    for mount_point in &mount_points {
        let path = Path::new(mount_point);
        if path.exists() {
            mount_info.push(format!("✓ 发现挂载点: {}", mount_point));

            if let Ok(entries) = std::fs::read_dir(path) {
                let mut has_forensic = false;
                let mut file_count = 0;

                for entry in entries.flatten() {
                    file_count += 1;
                    let file_name = entry.file_name().to_string_lossy().to_lowercase();
                    if file_name.contains("forensic") || file_name.contains("csv") {
                        has_forensic = true;
                    }
                }

                mount_info.push(format!("  - 文件数量: {}", file_count));
                if has_forensic {
                    mount_info.push("  - ✓ 包含 forensic 相关文件".to_string());
                } else {
                    mount_info.push("  - ⚠ 未发现 forensic 相关文件".to_string());
                }
            }
        } else {
            mount_info.push(format!("✗ 挂载点不存在: {}", mount_point));
        }
    }

    if is_arm64_system() {
        mount_info.push(format!("🔧 ARM64 系统架构: {}", get_system_arch()));
        mount_info.push("⚠ ARM64 系统可能不支持标准的驱动器挂载".to_string());
    }

    mount_info
}

/// ARM64 系统的额外完成检测（仅检查当前行，避免 O(n²) 全量扫描）
pub fn check_arm64_completion_indicators(line: &str, _process_id: u32) -> bool {
    if !is_arm64_system() {
        return false;
    }

    let completion_patterns = [
        "initialization complete",
        "ready for queries",
        "analysis ready",
        "memory map loaded",
        "process list loaded",
        "file system mounted",
        "forensic analysis ready",
    ];

    let line_lower = line.to_lowercase();
    for pattern in &completion_patterns {
        if line_lower.contains(pattern) {
            debug_info!("[*] ARM64 系统检测到完成模式: '{}'", pattern);
            return true;
        }
    }

    false
}

/// 尝试使用多种编码解码字节数据，处理中文乱码问题
pub fn decode_with_fallback(bytes: &[u8]) -> String {
    // 首先尝试 UTF-8
    if let Ok(s) = String::from_utf8(bytes.to_vec()) {
        return s;
    }

    // 如果 UTF-8 失败，在 Windows 上尝试 GBK 编码
    #[cfg(target_os = "windows")]
    {
        use encoding_rs::GBK;
        let (decoded, _, _) = GBK.decode(bytes);
        if !decoded.contains('\u{FFFD}') {
            return decoded.into_owned();
        }
    }

    // 最后使用 lossy 转换
    String::from_utf8_lossy(bytes).into_owned()
}

static COMMAND_ID_COUNTER: AtomicU64 = AtomicU64::new(0);

/// 生成唯一命令 ID（时间戳基数 + 原子自增计数器）
pub fn generate_command_id() -> u64 {
    let base = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let seq = COMMAND_ID_COUNTER.fetch_add(1, Ordering::Relaxed);
    base.wrapping_add(seq)
}

/// 获取当前时间字符串
pub fn get_current_time() -> String {
    chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}
