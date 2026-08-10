//! Volatility2 命令执行模块
//!
//! 该模块提供了异步执行Volatility2内存分析工具的功能，支持：
//! - 异步执行Volatility2命令
//! - JSON输出格式自动转换为CSV
//! - 插件列表和配置文件(profiles)获取
//! - 输出目录管理
//!
//! # 使用示例
//!
//! ```rust
//! // 创建配置
//! let config = Volatility2Config {
//!     python2_path: "python2".to_string(),
//!     volatility2_path: "vol.py".to_string(),
//!     volatility2_plugin: "/path/to/plugins".to_string(),
//!     image_path: "/path/to/memory.raw".to_string(),
//! };
//!
//! // 执行pslist插件
//! let result = execute_volatility2_command(
//!     &config,
//!     "Win7SP1x64",
//!     "pslist",
//!     "json",
//!     "output.json"
//! ).await?;
//! ```

use serde::{Deserialize, Serialize};
use std::process::Stdio;
use tokio::fs;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

/// 检测当前系统架构，用于 ARM64 兼容性处理
fn get_system_arch() -> String {
    std::env::consts::ARCH.to_string()
}

/// ARM64 系统的特殊处理
fn is_arm64_system() -> bool {
    std::env::consts::ARCH == "aarch64"
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Volatility2Config {
    pub python2_path: String,
    pub volatility2_path: String,
    pub volatility2_plugin: String,
    pub image_path: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Volatility2Result {
    pub success: bool,
    pub output_file: String,
    pub message: String,
    pub stdout: String,
    pub stderr: String,
    /// 该结果是否来自插件结果缓存（前端据此提示"来自缓存"）
    #[serde(default)]
    pub from_cache: bool,
}

/// 异步执行Volatility2命令
pub async fn execute_volatility2_command(
    config: &Volatility2Config,
    profile: &str,
    plugin: &str,
    output_type: &str,
    output_file: &str,
    extra_args: Option<Vec<String>>,
) -> Result<Volatility2Result, String> {
    // 运行时完整性校验（宏展开）
    crate::integrity_check!();

    // 构建命令参数 - Command::args()会自动处理路径中的空格，不需要引号
    let plugin_arg = format!("--plugin={}", config.volatility2_plugin);
    let profile_arg = format!("--profile={}", profile);
    let output_arg = format!("--output={}", output_type);
    let output_file_arg = format!("--output-file={}", output_file);

    let mut args = vec![
        &config.volatility2_path,
        &plugin_arg,
        "-f",
        &config.image_path,
        &profile_arg,
        plugin,
        &output_arg,
        &output_file_arg,
    ];

    // 如果有额外参数，添加到 plugin 之后、output 之前
    let extra_args_owned: Vec<String>;
    if let Some(ref extra) = extra_args {
        extra_args_owned = extra.clone();
        // 在 plugin 后插入额外参数（索引6是plugin的位置，所以在7插入）
        for (i, arg) in extra_args_owned.iter().enumerate() {
            args.insert(6 + i + 1, arg);
        }
    }

    // ARM64 系统特殊处理
    if is_arm64_system() {
        debug_info!("[*] ARM64 系统检测到，启用 Volatility2 兼容性模式");
        debug_info!("[*] 系统架构: {}", get_system_arch());
    }

    debug_info!(
        "[+] 执行Volatility2命令: {} {}",
        config.python2_path,
        args.join(" ")
    );

    // 创建命令 - Command::new()会自动处理路径中的空格，不需要引号
    let mut cmd = Command::new(&config.python2_path);
    cmd.args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // ARM64 系统特殊环境变量设置
    if is_arm64_system() {
        debug_info!("[*] ARM64 系统，设置 Volatility2 兼容性环境变量");
        cmd.env("PYTHONIOENCODING", "utf-8")
            .env("PYTHONUTF8", "1")
            .env("PYTHONUNBUFFERED", "1")
            .env("PYTHONDONTWRITEBYTECODE", "1"); // 避免字节码缓存问题
    }

    // Windows下隐藏控制台窗口
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    // 异步执行命令
    let mut child = cmd.spawn().map_err(|e| {
        let mut error_msg = format!("启动命令失败: {}", e);

        // ARM64 系统特殊错误处理
        if is_arm64_system() {
            error_msg.push_str(&format!(
                "\n\n[ARM64 Volatility2 启动失败]\n\
                - 当前系统架构: {}\n\
                - Python2 可能不兼容 ARM64 架构\n\
                - Volatility2 可能不支持 ARM64 系统\n\
                - 建议: 使用 x64 系统或通过兼容层运行\n\
                - 尝试: 安装 ARM64 兼容的 Python2 版本",
                get_system_arch()
            ));
        }

        error_msg
    })?;

    // 异步读取输出
    let stdout = child.stdout.take().ok_or("无法获取stdout")?;
    let stderr = child.stderr.take().ok_or("无法获取stderr")?;

    let mut stdout_reader = BufReader::new(stdout);
    let mut stderr_reader = BufReader::new(stderr);

    let mut stdout_output = String::new();
    let mut stderr_output = String::new();

    // 异步读取stdout和stderr
    let stdout_task = async {
        let mut line = String::new();
        while stdout_reader.read_line(&mut line).await.unwrap_or(0) > 0 {
            stdout_output.push_str(&line);
            line.clear();
        }
    };

    let stderr_task = async {
        let mut line = String::new();
        while stderr_reader.read_line(&mut line).await.unwrap_or(0) > 0 {
            stderr_output.push_str(&line);
            line.clear();
        }
    };

    // 并发执行读取任务
    tokio::join!(stdout_task, stderr_task);

    // 等待命令完成
    let status = child
        .wait()
        .await
        .map_err(|e| format!("等待命令完成失败: {}", e))?;

    let success = status.success();
    let message = if success {
        "[+] Volatility2命令执行成功".to_string()
    } else {
        let mut error_msg = format!("[-] Volatility2命令执行失败，退出码: {:?}", status.code());

        // ARM64 系统特殊错误处理
        if is_arm64_system() {
            error_msg.push_str(&format!(
                "\n\n[ARM64 Volatility2 执行失败]\n\
                - 当前系统架构: {}\n\
                - 可能的原因:\n\
                  * Python2 在 ARM64 上运行异常\n\
                  * Volatility2 插件不兼容 ARM64\n\
                  * 内存镜像格式与 ARM64 系统不匹配\n\
                - 建议解决方案:\n\
                  * 使用 x64 系统运行\n\
                  * 通过兼容层运行 Python2\n\
                  * 检查内存镜像是否来自兼容的系统",
                get_system_arch()
            ));
        }

        error_msg
    };

    // 如果输出类型是JSON，尝试转换为CSV
    let final_output_file = if success && output_type.to_lowercase() == "json" {
        match json_to_csv(output_file).await {
            Ok(csv_file) => csv_file,
            Err(e) => {
                debug_error!("[!] JSON转CSV失败: {}", e);
                output_file.to_string()
            }
        }
    } else {
        output_file.to_string()
    };

    Ok(Volatility2Result {
        success,
        output_file: final_output_file,
        message,
        stdout: stdout_output,
        stderr: stderr_output,
        from_cache: false,
    })
}

/// 将JSON文件异步转换为CSV文件
pub async fn json_to_csv(json_file: &str) -> Result<String, String> {
    debug_info!("[+] 开始转换JSON文件到CSV: {}", json_file);

    // 异步读取JSON文件
    let json_content = fs::read_to_string(json_file)
        .await
        .map_err(|e| format!("读取JSON文件失败: {}", e))?;

    // 解析JSON
    let data: serde_json::Value =
        serde_json::from_str(&json_content).map_err(|e| format!("解析JSON失败: {}", e))?;

    // 检查JSON格式
    if let (Some(rows), Some(columns)) = (data.get("rows"), data.get("columns")) {
        let rows_array = rows.as_array().ok_or("rows不是数组格式")?;
        let columns_array = columns.as_array().ok_or("columns不是数组格式")?;

        // 构建CSV内容
        let mut csv_content = String::new();

        // 添加列标题
        let headers: Result<Vec<String>, String> = columns_array
            .iter()
            .map(|col| {
                col.as_str()
                    .map(|s| s.to_string())
                    .ok_or_else(|| "列名不是字符串格式".to_string())
            })
            .collect();

        let headers = headers?;
        csv_content.push_str(&headers.join(","));
        csv_content.push('\n');

        // 添加数据行
        for row in rows_array {
            if let Some(row_array) = row.as_array() {
                let row_values: Vec<String> = row_array
                    .iter()
                    .map(|value| match value {
                        serde_json::Value::String(s) => format!("\"{}\"", s.replace("\"", "\"\"")),
                        serde_json::Value::Number(n) => n.to_string(),
                        serde_json::Value::Bool(b) => b.to_string(),
                        serde_json::Value::Null => "".to_string(),
                        _ => format!("\"{}\"", value.to_string().replace("\"", "\"\"")),
                    })
                    .collect();

                csv_content.push_str(&row_values.join(","));
                csv_content.push('\n');
            }
        }

        // 生成CSV文件路径
        let csv_file = json_file.replace(".json", ".csv");

        // 异步写入CSV文件
        fs::write(&csv_file, csv_content)
            .await
            .map_err(|e| format!("写入CSV文件失败: {}", e))?;

        debug_info!("[+] 成功将 {} 转换为 {}", json_file, csv_file);

        // 删除原始JSON文件
        if let Err(e) = fs::remove_file(json_file).await {
            debug_warn!("[!] 删除JSON文件失败: {}", e);
        }

        Ok(csv_file)
    } else {
        Err(format!(
            "[!] {} 不包含预期的数据格式(缺少rows或columns)",
            json_file
        ))
    }
}

/// 创建输出目录
pub async fn create_output_dir(dir_path: &str) -> Result<(), String> {
    fs::create_dir_all(dir_path)
        .await
        .map_err(|e| format!("创建输出目录失败: {}", e))
}

/// 获取可用的Volatility2插件列表
pub async fn get_volatility2_plugins(config: &Volatility2Config) -> Result<Vec<String>, String> {
    let mut cmd = Command::new(&config.python2_path);
    cmd.args(&[&config.volatility2_path, "--info"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // Windows下隐藏控制台窗口
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("获取插件列表失败: {}", e))?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let plugins: Vec<String> = stdout
            .lines()
            .filter_map(|line| {
                if line.trim().starts_with("-") && line.contains("----") {
                    None
                } else if line.trim().is_empty() {
                    None
                } else {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if !parts.is_empty() && !parts[0].starts_with("-") {
                        Some(parts[0].to_string())
                    } else {
                        None
                    }
                }
            })
            .collect();

        Ok(plugins)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("获取插件列表失败: {}", stderr))
    }
}

/// 获取可用的内存配置文件(profiles)
pub async fn get_volatility2_profiles(config: &Volatility2Config) -> Result<Vec<String>, String> {
    let mut cmd = Command::new(&config.python2_path);
    cmd.args(&[&config.volatility2_path, "--info", "--profiles"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // Windows下隐藏控制台窗口
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("获取配置文件列表失败: {}", e))?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let profiles: Vec<String> = stdout
            .lines()
            .filter_map(|line| {
                let trimmed = line.trim();
                if trimmed.is_empty() || trimmed.starts_with("-") || trimmed.contains("Profiles") {
                    None
                } else {
                    let parts: Vec<&str> = trimmed.split_whitespace().collect();
                    if !parts.is_empty() {
                        Some(parts[0].to_string())
                    } else {
                        None
                    }
                }
            })
            .collect();

        Ok(profiles)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("获取配置文件列表失败: {}", stderr))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_json_to_csv() {
        // 创建测试JSON文件
        let test_json = r#"{
            "columns": ["Name", "Age", "City"],
            "rows": [
                ["Alice", 30, "New York"],
                ["Bob", 25, "Los Angeles"],
                ["Charlie", 35, "Chicago"]
            ]
        }"#;

        let json_file = "test_output.json";
        fs::write(json_file, test_json).await.unwrap();

        // 测试转换
        let result = json_to_csv(json_file).await;
        assert!(result.is_ok());

        let csv_file = result.unwrap();
        assert_eq!(csv_file, "test_output.csv");

        // 验证CSV内容
        let csv_content = fs::read_to_string(&csv_file).await.unwrap();
        assert!(csv_content.contains("Name,Age,City"));
        assert!(csv_content.contains("Alice,30,New York"));

        // 清理测试文件
        let _ = fs::remove_file(&csv_file).await;
    }
}
