//! 自动化取证分析工作流工具
//! 提供一键式取证分析能力，自动运行多个 Volatility 插件并生成结构化结果

use super::{Tool, VolatilityConfig};
use crate::ai_v2::types::{ToolCallResult, ToolContext};
use async_trait::async_trait;
use std::collections::HashMap;
use tokio::process::Command;

/// 取证工作流工具 - 自动化分析
pub struct ForensicWorkflowTool {
    pub config: VolatilityConfig,
}

impl ForensicWorkflowTool {
    pub fn new(config: VolatilityConfig) -> Self {
        Self { config }
    }

    /// 执行单个 Volatility2 插件
    async fn run_vol2_plugin(
        &self,
        plugin: &str,
        extra_args: &str,
        working_dir: &str,
    ) -> Result<String, String> {
        if self.config.python2_path.is_empty() || self.config.volatility2_path.is_empty() {
            return Err("Volatility2 未配置".to_string());
        }

        let mut cmd = Command::new(&self.config.python2_path);
        cmd.arg(&self.config.volatility2_path)
            .arg("-f")
            .arg(&self.config.memory_image_path);

        if !self.config.profile.is_empty() {
            cmd.arg("--profile").arg(&self.config.profile);
        }

        cmd.arg(plugin);

        if !extra_args.is_empty() {
            for arg in extra_args.split_whitespace() {
                cmd.arg(arg);
            }
        }

        cmd.current_dir(working_dir);

        match cmd.output().await {
            Ok(output) => {
                if output.status.success() {
                    Ok(String::from_utf8_lossy(&output.stdout).to_string())
                } else {
                    Err(format!(
                        "插件 {} 执行失败: {}",
                        plugin,
                        String::from_utf8_lossy(&output.stderr)
                    ))
                }
            }
            Err(e) => Err(format!("执行失败: {}", e)),
        }
    }

    /// 执行单个 Volatility3 插件
    async fn run_vol3_plugin(
        &self,
        plugin: &str,
        extra_args: &str,
        working_dir: &str,
    ) -> Result<String, String> {
        if self.config.python3_path.is_empty() || self.config.volatility3_path.is_empty() {
            return Err("Volatility3 未配置".to_string());
        }

        let mut cmd = Command::new(&self.config.python3_path);
        cmd.arg(&self.config.volatility3_path)
            .arg("-f")
            .arg(&self.config.memory_image_path)
            .arg(plugin);

        if !extra_args.is_empty() {
            for arg in extra_args.split_whitespace() {
                cmd.arg(arg);
            }
        }

        cmd.current_dir(working_dir);

        match cmd.output().await {
            Ok(output) => {
                if output.status.success() {
                    Ok(String::from_utf8_lossy(&output.stdout).to_string())
                } else {
                    Err(format!(
                        "插件 {} 执行失败: {}",
                        plugin,
                        String::from_utf8_lossy(&output.stderr)
                    ))
                }
            }
            Err(e) => Err(format!("执行失败: {}", e)),
        }
    }

    /// 快速扫描 - 获取基本信息
    async fn quick_scan(&self, working_dir: &str, use_vol3: bool) -> HashMap<String, String> {
        let mut results = HashMap::new();

        let plugins = if use_vol3 {
            vec![
                ("进程列表", "windows.pslist", ""),
                ("网络连接", "windows.netscan", ""),
                ("命令行", "windows.cmdline", ""),
            ]
        } else {
            vec![
                ("进程列表", "pslist", ""),
                ("网络连接", "netscan", ""),
                ("命令行", "cmdline", ""),
            ]
        };

        for (name, plugin, args) in plugins {
            let result = if use_vol3 {
                self.run_vol3_plugin(plugin, args, working_dir).await
            } else {
                self.run_vol2_plugin(plugin, args, working_dir).await
            };

            match result {
                Ok(output) => {
                    let truncated = if output.len() > 10000 {
                        format!("{}...\n[截断，共{}字符]", &output[..10000], output.len())
                    } else {
                        output
                    };
                    results.insert(name.to_string(), truncated);
                }
                Err(e) => {
                    results.insert(name.to_string(), format!("❌ {}", e));
                }
            }
        }

        results
    }

    /// 恶意软件扫描
    async fn malware_scan(&self, working_dir: &str, use_vol3: bool) -> HashMap<String, String> {
        let mut results = HashMap::new();

        let plugins = if use_vol3 {
            vec![
                ("可疑内存段", "windows.malfind", ""),
                ("隐藏进程", "windows.psxview", ""),
                ("注入DLL", "windows.dlllist", ""),
            ]
        } else {
            vec![
                ("可疑内存段", "malfind", ""),
                ("隐藏进程检测", "psxview", ""),
                ("DLL列表", "dlllist", ""),
                ("Hooks检测", "apihooks", ""),
            ]
        };

        for (name, plugin, args) in plugins {
            let result = if use_vol3 {
                self.run_vol3_plugin(plugin, args, working_dir).await
            } else {
                self.run_vol2_plugin(plugin, args, working_dir).await
            };

            match result {
                Ok(output) => {
                    let truncated = if output.len() > 15000 {
                        format!("{}...\n[截断，共{}字符]", &output[..15000], output.len())
                    } else {
                        output
                    };
                    results.insert(name.to_string(), truncated);
                }
                Err(e) => {
                    results.insert(name.to_string(), format!("❌ {}", e));
                }
            }
        }

        results
    }

    /// 网络分析
    async fn network_analysis(&self, working_dir: &str, use_vol3: bool) -> HashMap<String, String> {
        let mut results = HashMap::new();

        let plugins = if use_vol3 {
            vec![
                ("网络连接", "windows.netscan", ""),
                ("网络统计", "windows.netstat", ""),
            ]
        } else {
            vec![
                ("网络连接", "netscan", ""),
                ("连接记录", "connscan", ""),
                ("Socket", "sockets", ""),
            ]
        };

        for (name, plugin, args) in plugins {
            let result = if use_vol3 {
                self.run_vol3_plugin(plugin, args, working_dir).await
            } else {
                self.run_vol2_plugin(plugin, args, working_dir).await
            };

            match result {
                Ok(output) => {
                    results.insert(name.to_string(), output);
                }
                Err(e) => {
                    results.insert(name.to_string(), format!("❌ {}", e));
                }
            }
        }

        results
    }

    /// 注册表分析
    async fn registry_analysis(
        &self,
        working_dir: &str,
        use_vol3: bool,
    ) -> HashMap<String, String> {
        let mut results = HashMap::new();

        let plugins = if use_vol3 {
            vec![("注册表Hive", "windows.registry.hivelist", "")]
        } else {
            vec![
                ("注册表Hive", "hivelist", ""),
                ("用户辅助", "userassist", ""),
                ("Shellbags", "shellbags", ""),
            ]
        };

        for (name, plugin, args) in plugins {
            let result = if use_vol3 {
                self.run_vol3_plugin(plugin, args, working_dir).await
            } else {
                self.run_vol2_plugin(plugin, args, working_dir).await
            };

            match result {
                Ok(output) => {
                    let truncated = if output.len() > 10000 {
                        format!("{}...\n[截断，共{}字符]", &output[..10000], output.len())
                    } else {
                        output
                    };
                    results.insert(name.to_string(), truncated);
                }
                Err(e) => {
                    results.insert(name.to_string(), format!("❌ {}", e));
                }
            }
        }

        results
    }

    /// 格式化结果为 Markdown
    fn format_results(&self, title: &str, results: &HashMap<String, String>) -> String {
        let mut output = format!("## {}\n\n", title);

        for (name, content) in results {
            output.push_str(&format!("### {}\n\n```\n{}\n```\n\n", name, content));
        }

        output
    }
}

#[async_trait]
impl Tool for ForensicWorkflowTool {
    fn id(&self) -> &str {
        "forensic_workflow"
    }

    fn name(&self) -> &str {
        "forensic_workflow"
    }

    fn description(&self) -> &str {
        r#"自动化取证分析工作流。支持多种分析模式:
- quick_scan: 快速扫描，获取进程、网络、命令行基本信息
- malware_scan: 恶意软件扫描，检测可疑内存段、隐藏进程、注入DLL
- network_analysis: 网络连接分析
- registry_analysis: 注册表分析
- full_analysis: 完整分析（运行所有模块）

自动选择 Volatility2 或 Volatility3 执行分析。"#
    }

    fn parameters(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "mode": {
                    "type": "string",
                    "enum": ["quick_scan", "malware_scan", "network_analysis", "registry_analysis", "full_analysis"],
                    "description": "分析模式: quick_scan(快速扫描), malware_scan(恶意软件扫描), network_analysis(网络分析), registry_analysis(注册表分析), full_analysis(完整分析)"
                },
                "use_vol3": {
                    "type": "boolean",
                    "description": "是否优先使用 Volatility3（默认自动检测）"
                }
            },
            "required": ["mode"]
        })
    }

    async fn execute(&self, args: serde_json::Value, ctx: &ToolContext) -> ToolCallResult {
        let mode = args
            .get("mode")
            .and_then(|v| v.as_str())
            .unwrap_or("quick_scan");

        // 自动检测使用哪个版本
        let use_vol3 = args
            .get("use_vol3")
            .and_then(|v| v.as_bool())
            .unwrap_or_else(|| {
                // 优先使用 Vol3，如果未配置则用 Vol2
                !self.config.python3_path.is_empty() && !self.config.volatility3_path.is_empty()
            });

        // 检查配置
        if self.config.memory_image_path.is_empty() {
            return ToolCallResult {
                call_id: String::new(),
                name: self.name().to_string(),
                output: "❌ 错误：内存镜像路径未设置。请先加载内存镜像。".to_string(),
                success: false,
                metadata: None,
                duration_ms: 0,
                truncated: false,
            };
        }

        let vol_version = if use_vol3 {
            "Volatility3"
        } else {
            "Volatility2"
        };
        let working_dir = &ctx.working_directory;

        let mut full_output = format!(
            "# 🔍 自动化取证分析报告\n\n**内存镜像**: `{}`\n**分析引擎**: {}\n**分析模式**: {}\n\n---\n\n",
            self.config.memory_image_path, vol_version, mode
        );

        match mode {
            "quick_scan" => {
                let results = self.quick_scan(working_dir, use_vol3).await;
                full_output.push_str(&self.format_results("快速扫描结果", &results));
            }
            "malware_scan" => {
                let results = self.malware_scan(working_dir, use_vol3).await;
                full_output.push_str(&self.format_results("恶意软件扫描结果", &results));
            }
            "network_analysis" => {
                let results = self.network_analysis(working_dir, use_vol3).await;
                full_output.push_str(&self.format_results("网络分析结果", &results));
            }
            "registry_analysis" => {
                let results = self.registry_analysis(working_dir, use_vol3).await;
                full_output.push_str(&self.format_results("注册表分析结果", &results));
            }
            "full_analysis" => {
                // 完整分析：运行所有模块
                full_output.push_str("## 📋 完整取证分析\n\n");

                let quick = self.quick_scan(working_dir, use_vol3).await;
                full_output.push_str(&self.format_results("1️⃣ 快速扫描", &quick));

                let malware = self.malware_scan(working_dir, use_vol3).await;
                full_output.push_str(&self.format_results("2️⃣ 恶意软件扫描", &malware));

                let network = self.network_analysis(working_dir, use_vol3).await;
                full_output.push_str(&self.format_results("3️⃣ 网络分析", &network));

                let registry = self.registry_analysis(working_dir, use_vol3).await;
                full_output.push_str(&self.format_results("4️⃣ 注册表分析", &registry));
            }
            _ => {
                return ToolCallResult {
                    call_id: String::new(),
                    name: self.name().to_string(),
                    output: format!(
                        "❌ 未知的分析模式: {}。支持: quick_scan, malware_scan, network_analysis, registry_analysis, full_analysis",
                        mode
                    ),
                    success: false,
                    metadata: None,
                    duration_ms: 0,
                    truncated: false,
                };
            }
        }

        // 添加分析建议
        full_output.push_str("\n---\n\n## 💡 后续建议\n\n");
        full_output.push_str("- 对可疑进程使用 `volatility2` 或 `volatility3` 工具进行深入分析\n");
        full_output.push_str("- 使用 `write_markdown` 工具保存分析报告\n");
        full_output.push_str("- 检查高熵值进程和 RWX 内存段\n");

        ToolCallResult {
            call_id: String::new(),
            name: self.name().to_string(),
            output: full_output,
            success: true,
            metadata: Some(serde_json::json!({
                "mode": mode,
                "volatility_version": vol_version,
                "memory_image": self.config.memory_image_path
            })),
            duration_ms: 0,
            truncated: false,
        }
    }
}

/// 进程深度分析工具
pub struct ProcessAnalysisTool {
    pub config: VolatilityConfig,
}

impl ProcessAnalysisTool {
    pub fn new(config: VolatilityConfig) -> Self {
        Self { config }
    }

    async fn run_vol2_plugin(
        &self,
        plugin: &str,
        extra_args: &str,
        working_dir: &str,
    ) -> Result<String, String> {
        if self.config.python2_path.is_empty() || self.config.volatility2_path.is_empty() {
            return Err("Volatility2 未配置".to_string());
        }

        let mut cmd = Command::new(&self.config.python2_path);
        cmd.arg(&self.config.volatility2_path)
            .arg("-f")
            .arg(&self.config.memory_image_path);

        if !self.config.profile.is_empty() {
            cmd.arg("--profile").arg(&self.config.profile);
        }

        cmd.arg(plugin);

        if !extra_args.is_empty() {
            for arg in extra_args.split_whitespace() {
                cmd.arg(arg);
            }
        }

        cmd.current_dir(working_dir);

        match cmd.output().await {
            Ok(output) => {
                if output.status.success() {
                    Ok(String::from_utf8_lossy(&output.stdout).to_string())
                } else {
                    Err(String::from_utf8_lossy(&output.stderr).to_string())
                }
            }
            Err(e) => Err(format!("执行失败: {}", e)),
        }
    }
}

#[async_trait]
impl Tool for ProcessAnalysisTool {
    fn id(&self) -> &str {
        "process_analysis"
    }

    fn name(&self) -> &str {
        "process_analysis"
    }

    fn description(&self) -> &str {
        "对指定进程进行深度分析，包括: 内存段扫描(malfind)、DLL列表、句柄、环境变量等。用于分析可疑进程。"
    }

    fn parameters(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "pid": {
                    "type": "integer",
                    "description": "要分析的进程ID (PID)"
                },
                "process_name": {
                    "type": "string",
                    "description": "进程名称（可选，用于过滤）"
                }
            },
            "required": ["pid"]
        })
    }

    async fn execute(&self, args: serde_json::Value, ctx: &ToolContext) -> ToolCallResult {
        let pid = args.get("pid").and_then(|v| v.as_i64()).unwrap_or(0);

        if pid == 0 {
            return ToolCallResult {
                call_id: String::new(),
                name: self.name().to_string(),
                output: "❌ 错误：请提供有效的进程 PID".to_string(),
                success: false,
                metadata: None,
                duration_ms: 0,
                truncated: false,
            };
        }

        if self.config.memory_image_path.is_empty() {
            return ToolCallResult {
                call_id: String::new(),
                name: self.name().to_string(),
                output: "❌ 错误：内存镜像路径未设置".to_string(),
                success: false,
                metadata: None,
                duration_ms: 0,
                truncated: false,
            };
        }

        let working_dir = &ctx.working_directory;
        let pid_arg = format!("-p {}", pid);

        let mut output = format!("# 🔬 进程深度分析 (PID: {})\n\n", pid);

        // 运行多个分析插件
        let analyses = vec![
            ("进程信息", "pslist", &pid_arg),
            ("命令行", "cmdline", &pid_arg),
            ("DLL列表", "dlllist", &pid_arg),
            ("句柄", "handles", &pid_arg),
            ("可疑内存段", "malfind", &pid_arg),
            ("环境变量", "envars", &pid_arg),
        ];

        for (name, plugin, args) in analyses {
            output.push_str(&format!("## {}\n\n", name));

            match self.run_vol2_plugin(plugin, args, working_dir).await {
                Ok(result) => {
                    let truncated = if result.len() > 8000 {
                        format!("{}...\n[截断]", &result[..8000])
                    } else {
                        result
                    };
                    output.push_str(&format!("```\n{}\n```\n\n", truncated));
                }
                Err(e) => {
                    output.push_str(&format!("❌ {}\n\n", e));
                }
            }
        }

        ToolCallResult {
            call_id: String::new(),
            name: self.name().to_string(),
            output,
            success: true,
            metadata: Some(serde_json::json!({
                "pid": pid
            })),
            duration_ms: 0,
            truncated: false,
        }
    }
}

/// IOC 提取工具
pub struct ExtractIocTool {
    pub config: VolatilityConfig,
}

impl ExtractIocTool {
    pub fn new(config: VolatilityConfig) -> Self {
        Self { config }
    }
}

#[async_trait]
impl Tool for ExtractIocTool {
    fn id(&self) -> &str {
        "extract_ioc"
    }

    fn name(&self) -> &str {
        "extract_ioc"
    }

    fn description(&self) -> &str {
        "从内存镜像中提取 IOC (Indicators of Compromise)，包括: IP地址、域名、URL、可疑文件路径、注册表键等。"
    }

    fn parameters(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "types": {
                    "type": "array",
                    "items": {
                        "type": "string",
                        "enum": ["ip", "domain", "url", "path", "registry", "all"]
                    },
                    "description": "要提取的 IOC 类型"
                }
            },
            "required": []
        })
    }

    async fn execute(&self, args: serde_json::Value, _ctx: &ToolContext) -> ToolCallResult {
        let types: Vec<String> = args
            .get("types")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_else(|| vec!["all".to_string()]);

        let extract_all = types.contains(&"all".to_string());

        let mut output = "# 🎯 IOC 提取结果\n\n".to_string();
        output.push_str("以下是从内存镜像中提取的可能 IOC 指标:\n\n");

        output.push_str("## 📋 提取方法建议\n\n");

        if extract_all || types.contains(&"ip".to_string()) {
            output.push_str("### IP 地址\n");
            output.push_str(
                "使用 `volatility2` 工具执行 `netscan` 或 `connscan` 插件获取网络连接中的 IP\n\n",
            );
        }

        if extract_all || types.contains(&"domain".to_string()) {
            output.push_str("### 域名\n");
            output.push_str("使用 `volatility2` 工具执行 `yarascan` 插件搜索域名模式\n\n");
        }

        if extract_all || types.contains(&"url".to_string()) {
            output.push_str("### URL\n");
            output.push_str("使用 `volatility2` 工具执行 `iehistory` 或内存字符串搜索\n\n");
        }

        if extract_all || types.contains(&"path".to_string()) {
            output.push_str("### 文件路径\n");
            output.push_str("使用 `volatility2` 工具执行 `filescan` 和 `cmdline` 获取可疑路径\n\n");
        }

        if extract_all || types.contains(&"registry".to_string()) {
            output.push_str("### 注册表\n");
            output.push_str("使用 `volatility2` 工具执行 `printkey` 检查启动项和持久化机制\n\n");
        }

        output.push_str("## 💡 建议流程\n\n");
        output.push_str("1. 先运行 `forensic_workflow` 的 `quick_scan` 模式获取概览\n");
        output.push_str("2. 对可疑进程使用 `process_analysis` 深入分析\n");
        output.push_str("3. 使用 `volatility2/3` 工具针对性提取 IOC\n");
        output.push_str("4. 使用 `write_markdown` 保存分析报告\n");

        ToolCallResult {
            call_id: String::new(),
            name: self.name().to_string(),
            output,
            success: true,
            metadata: Some(serde_json::json!({
                "types": types
            })),
            duration_ms: 0,
            truncated: false,
        }
    }
}
