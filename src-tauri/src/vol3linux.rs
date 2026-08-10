//! Volatility3 Linux 命令执行模块
//!
//! 该模块提供了异步执行Volatility3 Linux内存分析工具的功能，支持：
//! - 异步执行Volatility3 Linux命令
//! - 支持offline模式和代理设置
//! - 自动判断输出格式（quick/csv）
//! - Linux插件列表和符号表获取
//! - 输出目录管理
//!
//! # 使用示例
//!
//! ```rust
//! // 创建配置
//! let config = Vol3LinuxConfig {
//!     python_path: "python".to_string(),
//!     volatility3_path: "vol.py".to_string(),
//!     image_path: "/path/to/memory.raw".to_string(),
//! };
//!
//! // 执行pslist插件
//! let result = execute_vol3linux_command(
//!     &config,
//!     "pslist",
//!     false,
//!     false,
//!     None,
//!     "output"
//! ).await?;
//! ```

use crate::path_utils;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Stdio;
use tokio::fs;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::time::{Duration, timeout};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Vol3LinuxConfig {
    pub python_path: String,
    pub volatility3_path: String,
    pub image_path: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Vol3LinuxResult {
    pub success: bool,
    pub output_file: String,
    pub message: String,
    pub stdout: String,
    pub stderr: String,
    pub output_type: String,
}

/// Linux特有的txt输出插件列表
const TXT_PLUGINS: &[&str] = &["psaux"];

/// 检查插件是否需要txt格式输出
fn is_txt_plugin(plugin: &str) -> bool {
    TXT_PLUGINS.contains(&plugin)
}

/// 配置命令的环境变量以支持UTF-8编码和实时输出
fn configure_command_encoding(cmd: &mut Command) {
    // 禁用 Python 输出缓冲，确保 stderr 进度信息实时刷新
    cmd.env("PYTHONUNBUFFERED", "1");

    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        // 设置环境变量强制使用UTF-8编码
        cmd.env("PYTHONIOENCODING", "utf-8");
        cmd.env("PYTHONUTF8", "1");
        // 设置控制台代码页为UTF-8
        cmd.env("CHCP", "65001");
    }
}

/// 将简化的插件名称转换为完整的插件路径
fn get_full_plugin_name(plugin: &str) -> String {
    match plugin {
        // 特殊插件路径映射
        "proc_maps" => "linux.proc.Maps".to_string(),
        "ip_addr" => "linux.ip.Addr".to_string(),
        "ip_link" => "linux.ip.Link".to_string(),
        "pagecache_files" => "linux.pagecache.Files".to_string(),
        "pagecache_inodepages" => "linux.pagecache.InodePages".to_string(),
        "pagecache_recoverfs" => "linux.pagecache.RecoverFs".to_string(),
        "ftrace" => "tracing.ftrace.CheckFtrace".to_string(),
        "perf_events" => "tracing.perf_events.PerfEvents".to_string(),
        "tracepoints" => "tracing.tracepoints.CheckTracepoints".to_string(),
        "fbdev" => "linux.graphics.fbdev".to_string(),
        "banners" => "banners".to_string(), // banners不需要前缀
        // 特殊大小写映射
        "bash" => "linux.bash.Bash".to_string(),
        "envars" => "linux.envars.Envars".to_string(),
        "elfs" => "linux.elfs.Elfs".to_string(),
        "lsmod" => "linux.lsmod.Lsmod".to_string(),
        "lsof" => "linux.lsof.Lsof".to_string(),
        "kthreads" => "linux.kthreads.Kthreads".to_string(),
        "kmsg" => "linux.kmsg.Kmsg".to_string(),
        "kallsyms" => "linux.kallsyms.Kallsyms".to_string(),
        "iomem" => "linux.iomem.IOMem".to_string(),
        "vmcoreinfo" => "linux.vmcoreinfo.VMCoreInfo".to_string(),
        "pidhashtable" => "linux.pidhashtable.PIDHashTable".to_string(),
        "library_list" => "linux.library_list.LibraryList".to_string(),
        "module_extract" => "linux.module_extract.module_extract".to_string(),
        "mountinfo" => "linux.mountinfo.MountInfo".to_string(),
        "sockstat" => "linux.sockstat.Sockstat".to_string(),
        // 进程相关特殊映射
        "pslist" => "linux.pslist.PsList".to_string(),
        "psscan" => "linux.psscan.PsScan".to_string(),
        "pstree" => "linux.pstree.PsTree".to_string(),
        "psaux" => "linux.psaux.PsAux".to_string(),
        "pscallstack" => "linux.pscallstack.PsCallStack".to_string(),
        "ptrace" => "linux.ptrace.Ptrace".to_string(),
        "capabilities" => "linux.capabilities.Capabilities".to_string(),
        // 其他特殊映射
        "boottime" => "linux.boottime.boottime".to_string(),
        "ebpf" => "linux.ebpf.EBPF".to_string(),
        // Malware分析插件（新版本）
        "malware_check_afinfo" => "linux.malware.check_afinfo.Check_afinfo".to_string(),
        "malware_check_creds" => "linux.malware.check_creds.Check_creds".to_string(),
        "malware_check_idt" => "linux.malware.check_idt.Check_idt".to_string(),
        "malware_check_syscall" => "linux.malware.check_syscall.Check_syscall".to_string(),
        "malware_check_modules" => "linux.malware.check_modules.Check_modules".to_string(),
        "malware_hidden_modules" => "linux.malware.hidden_modules.Hidden_modules".to_string(),
        "malware_keyboard_notifiers" => {
            "linux.malware.keyboard_notifiers.Keyboard_notifiers".to_string()
        }
        "malware_malfind" => "linux.malware.malfind.Malfind".to_string(),
        "malware_modxview" => "linux.malware.modxview.Modxview".to_string(),
        "malware_netfilter" => "linux.malware.netfilter.Netfilter".to_string(),
        "malware_tty_check" => "linux.malware.tty_check.Tty_Check".to_string(),
        // 其他插件需要linux.前缀
        _ => {
            if plugin.starts_with("ip.")
                || plugin.starts_with("pagecache.")
                || plugin.starts_with("tracing.")
                || plugin == "proc.maps"
            {
                plugin.to_string()
            } else {
                format!("linux.{}", plugin.replace('_', "."))
            }
        }
    }
}

/// 构建Volatility3 Linux命令和输出文件路径
pub fn construct_vol3linux_command(
    config: &Vol3LinuxConfig,
    plugin: &str,
    offline: bool,
    use_proxy: bool,
    _proxy_url: Option<&str>,
    output_dir: &str,
) -> (Vec<String>, String) {
    let output_type = if is_txt_plugin(plugin) {
        "quick"
    } else {
        "csv"
    };
    let file_ext = if is_txt_plugin(plugin) { "txt" } else { "csv" };
    let output_file = format!("{}/vol3linux_{}.{}", output_dir, plugin, file_ext);

    // 构建基础命令参数 - 使用String类型避免借用问题
    let mut additional_args = Vec::<String>::new();

    // 获取 Vol3 目录路径（去掉 vol.py）用于 --cache-path
    let vol3_dir = std::path::Path::new(&config.volatility3_path)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();
    additional_args.push("--cache-path".to_string());
    additional_args.push(vol3_dir);

    // 添加离线模式或远程ISF URL参数
    if offline {
        additional_args.push("--offline".to_string());
    } else if use_proxy {
        // 使用远程符号表（remote ISF URL）
        additional_args.push("--remote-isf-url".to_string());
        additional_args.push(
            "https://github.com/Abyss-W4tcher/volatility3-symbols/raw/master/banners/banners.json"
                .to_string(),
        );
    } else {
        // 否则使用本地符号表
        let symbols_path = std::path::Path::new(&config.volatility3_path)
            .parent()
            .unwrap_or_else(|| std::path::Path::new("."))
            .join("symbols");
        let symbols_path_str = symbols_path.to_string_lossy().to_string();
        additional_args.push("--single-location".to_string());
        additional_args.push(symbols_path_str);
    }

    // 添加输出格式和插件名
    let plugin_name = get_full_plugin_name(plugin);
    additional_args.push("-r".to_string());
    additional_args.push(output_type.to_string());
    additional_args.push(plugin_name);

    // 使用安全的路径处理构建命令 - 转换为&str引用
    let additional_args_refs: Vec<&str> = additional_args.iter().map(|s| s.as_str()).collect();
    let cmd = path_utils::build_volatility_args(
        &config.python_path,
        &config.volatility3_path,
        &config.image_path,
        &additional_args_refs,
    );

    (cmd, output_file)
}

/// 异步执行Volatility3 Linux命令
pub async fn execute_vol3linux_command(
    config: &Vol3LinuxConfig,
    plugin: &str,
    offline: bool,
    use_proxy: bool,
    proxy_url: Option<&str>,
    output_dir: &str,
) -> Result<Vol3LinuxResult, String> {
    // 确保输出目录存在
    create_output_dir(output_dir).await?;

    // 构建命令和输出文件路径
    let (cmd_args, output_file) =
        construct_vol3linux_command(config, plugin, offline, use_proxy, proxy_url, output_dir);

    // 格式化完整命令用于日志显示（正确处理包含空格的参数）
    let formatted_cmd = cmd_args
        .iter()
        .map(|arg| {
            if arg.contains(' ') || arg.contains('\t') {
                format!("\"{}\"", arg)
            } else {
                arg.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join(" ");
    debug_info!("[+] 执行Volatility3 Linux命令: {}", formatted_cmd);

    // 创建命令，重定向输出到文件
    // cmd_args[0] 是 python_path，cmd_args[1..] 是参数
    let mut cmd = Command::new(&cmd_args[0]);
    cmd.args(&cmd_args[1..])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // 如果使用代理，设置环境变量
    if let (true, Some(proxy)) = (use_proxy, proxy_url.as_deref()) {
        cmd.env("HTTPS_PROXY", proxy).env("HTTP_PROXY", proxy);
        debug_info!("[+] 使用代理: {}", proxy);
    }

    // 配置命令环境变量以支持UTF-8编码
    configure_command_encoding(&mut cmd);

    // 异步执行命令
    let mut child = cmd.spawn().map_err(|e| format!("启动命令失败: {}", e))?;

    // 异步读取输出
    let stdout = child.stdout.take().ok_or("无法获取stdout")?;
    let stderr = child.stderr.take().ok_or("无法获取stderr")?;

    let mut stdout_reader = BufReader::new(stdout);
    let mut stderr_reader = BufReader::new(stderr);

    let mut stdout_output = String::new();
    let mut stderr_output = String::new();

    // 异步读取stdout和stderr，使用UTF-8编码处理
    let stdout_task = async {
        let mut line = String::new();
        while let Ok(bytes_read) = stdout_reader.read_line(&mut line).await {
            if bytes_read == 0 {
                break;
            }
            stdout_output.push_str(&line);
            line.clear();
        }
    };

    let stderr_task = async {
        let mut line = String::new();
        while let Ok(bytes_read) = stderr_reader.read_line(&mut line).await {
            if bytes_read == 0 {
                break;
            }
            stderr_output.push_str(&line);
            line.clear();
        }
    };

    // 并发执行读取任务
    tokio::join!(stdout_task, stderr_task);

    // 等待命令完成（带超时机制，默认10分钟）
    let timeout_duration = Duration::from_secs(600);
    let status = timeout(timeout_duration, child.wait())
        .await
        .map_err(|_| {
            debug_info!("[!] Volatility3 Linux命令执行超时（10分钟），正在终止进程...");
            "Volatility3 Linux命令执行超时（10分钟），已自动终止".to_string()
        })?
        .map_err(|e| format!("等待命令完成失败: {}", e))?;

    let success = status.success();
    let message = if success {
        "[+] Volatility3 Linux命令执行成功".to_string()
    } else {
        format!(
            "[-] Volatility3 Linux命令执行失败，退出码: {:?}",
            status.code()
        )
    };

    // 如果成功执行，将stdout写入输出文件（使用UTF-8编码）
    if success && !stdout_output.trim().is_empty() {
        // 确保以UTF-8编码写入文件
        match fs::write(&output_file, stdout_output.as_bytes()).await {
            Ok(_) => {
                debug_info!("[+] 输出已保存到: {}", output_file);
            }
            Err(e) => {
                debug_error!("[!] 写入输出文件失败: {}", e);
                // 尝试创建目录后重新写入
                if let Some(parent) = Path::new(&output_file).parent() {
                    if let Err(dir_err) = fs::create_dir_all(parent).await {
                        debug_error!("[!] 创建目录失败: {}", dir_err);
                    } else if let Err(retry_err) =
                        fs::write(&output_file, stdout_output.as_bytes()).await
                    {
                        debug_error!("[!] 重试写入文件失败: {}", retry_err);
                    } else {
                        debug_info!("[+] 输出已保存到: {}", output_file);
                    }
                }
            }
        }
    }

    let output_type = if is_txt_plugin(plugin) {
        "quick"
    } else {
        "csv"
    };

    Ok(Vol3LinuxResult {
        success,
        output_file,
        message,
        stdout: stdout_output,
        stderr: stderr_output,
        output_type: output_type.to_string(),
    })
}

/// 检查文件是否存在
pub async fn file_exists(path: &str) -> bool {
    tokio::fs::try_exists(path).await.unwrap_or(false)
}

/// 创建输出目录
pub async fn create_output_dir(dir_path: &str) -> Result<(), String> {
    fs::create_dir_all(dir_path)
        .await
        .map_err(|e| format!("创建输出目录失败: {}", e))
}

/// 获取可用的Volatility3 Linux插件列表
pub async fn get_vol3linux_plugins(config: &Vol3LinuxConfig) -> Result<Vec<String>, String> {
    let mut cmd = Command::new(&config.python_path);
    cmd.args(&[&config.volatility3_path, "--help"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // 配置命令环境变量以支持UTF-8编码
    configure_command_encoding(&mut cmd);

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("获取插件列表失败: {}", e))?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let plugins: Vec<String> = stdout
            .lines()
            .filter_map(|line| {
                let trimmed = line.trim();
                // 查找linux.开头的插件或特殊插件
                if trimmed.starts_with("linux.") {
                    let parts: Vec<&str> = trimmed.split_whitespace().collect();
                    if !parts.is_empty() {
                        // 移除"linux."前缀
                        let plugin_name = parts[0].strip_prefix("linux.").unwrap_or(parts[0]);
                        Some(plugin_name.to_string())
                    } else {
                        None
                    }
                } else if trimmed.starts_with("banners") {
                    // banners插件不需要前缀
                    Some("banners".to_string())
                } else {
                    None
                }
            })
            .collect();

        Ok(plugins)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("获取插件列表失败: {}", stderr))
    }
}

/// 获取Volatility3版本信息
pub async fn get_vol3linux_version(config: &Vol3LinuxConfig) -> Result<String, String> {
    let mut cmd = Command::new(&config.python_path);
    cmd.args(&[&config.volatility3_path, "--version"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // 配置命令环境变量以支持UTF-8编码
    configure_command_encoding(&mut cmd);

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("获取版本信息失败: {}", e))?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        Ok(stdout.trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("获取版本信息失败: {}", stderr))
    }
}

/// 检查Volatility3 Linux环境
pub async fn check_vol3linux_environment(config: &Vol3LinuxConfig) -> Result<bool, String> {
    // 检查Python路径
    if !file_exists(&config.python_path).await {
        return Err(format!("Python路径不存在: {}", config.python_path));
    }

    // 检查Volatility3脚本
    if !file_exists(&config.volatility3_path).await {
        return Err(format!(
            "Volatility3脚本不存在: {}",
            config.volatility3_path
        ));
    }

    // 检查内存映像文件
    if !file_exists(&config.image_path).await {
        return Err(format!("内存映像文件不存在: {}", config.image_path));
    }

    // 尝试执行version命令验证环境
    match get_vol3linux_version(config).await {
        Ok(_) => Ok(true),
        Err(e) => Err(format!("Volatility3环境验证失败: {}", e)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_txt_plugin() {
        assert!(is_txt_plugin("psaux"));
        assert!(!is_txt_plugin("pslist"));
        assert!(!is_txt_plugin("netstat"));
    }

    #[test]
    fn test_get_full_plugin_name() {
        assert_eq!(get_full_plugin_name("pslist"), "linux.pslist");
        assert_eq!(get_full_plugin_name("proc_maps"), "proc.maps");
        assert_eq!(get_full_plugin_name("ip_addr"), "ip.addr");
        assert_eq!(get_full_plugin_name("banners"), "banners");
        assert_eq!(get_full_plugin_name("ftrace"), "tracing.ftrace.CheckFtrace");
    }

    #[test]
    fn test_construct_command() {
        let config = Vol3LinuxConfig {
            python_path: "python".to_string(),
            volatility3_path: "vol.py".to_string(),
            image_path: "memory.raw".to_string(),
        };

        // 测试普通插件（csv输出）
        let (cmd, output_file) =
            construct_vol3linux_command(&config, "pslist", false, false, None, "output");
        assert!(cmd.contains(&"linux.pslist".to_string()));
        assert_eq!(output_file, "output/vol3linux_pslist.csv");

        // 测试txt插件
        let (cmd, output_file) =
            construct_vol3linux_command(&config, "psaux", false, false, None, "output");
        assert!(cmd.contains(&"linux.psaux".to_string()));
        assert_eq!(output_file, "output/vol3linux_psaux.txt");

        // 测试offline模式
        let (cmd, _) = construct_vol3linux_command(&config, "pslist", true, false, None, "output");
        assert!(cmd.contains(&"--offline".to_string()));
    }
}
