//! WinFsp 环境管理模块
//!
//! 提供 WinFsp 文件系统驱动的状态检测和环境验证功能（MemNixFS 在 Windows 上依赖 WinFsp 挂载）。
//! 设计镜像 dokan_manager.rs，但检测目标为 WinFsp（服务名 WinFsp.Launcher，DLL winfsp-x64.dll）。
//!
//! 注意：WinFsp 是带内核驱动的 MSI 安装包，无法像 dokan2.dll 那样单文件下载，
//! 因此本模块不提供下载功能；未安装时 UI 引导用户从 https://winfsp.dev/rel/ 安装，或改用 export 降级。

use crate::settings;

/// WinFsp 环境检测结果
#[derive(serde::Serialize)]
pub struct WinFspEnvironmentCheckResult {
    /// 总体状态: true 表示环境正常
    pub all_ok: bool,
    /// DLL 检测结果
    pub dll_check: WinFspDllCheckResult,
    /// 服务检测结果
    pub service_check: WinFspServiceCheckResult,
}

/// WinFsp DLL 检测结果
#[derive(serde::Serialize)]
pub struct WinFspDllCheckResult {
    /// 是否找到 DLL
    pub found: bool,
    /// DLL 所在位置（MemNixFS 目录 / WinFsp 安装目录 / 注册表）
    pub location: String,
    /// 具体路径
    pub path: String,
    /// 检测详情
    pub details: String,
}

/// WinFsp 服务检测结果
#[derive(serde::Serialize)]
pub struct WinFspServiceCheckResult {
    /// 服务是否存在
    pub exists: bool,
    /// 服务状态
    pub state: String,
    /// 启动类型
    pub start_type: String,
    /// 检测详情
    pub details: String,
    /// 原始输出
    pub raw_output: String,
}

/// WinFsp 服务名（Launcher 服务）
#[cfg(target_os = "windows")]
const WINFSP_SERVICE: &str = "WinFsp.Launcher";

/// 通过注册表查询 WinFsp 安装目录（失败返回 None）
#[cfg(target_os = "windows")]
fn query_winfsp_install_dir() -> Option<String> {
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    let output = Command::new("reg")
        .args(&[
            "query",
            "HKLM\\SOFTWARE\\WOW6432Node\\WinFsp",
            "/v",
            "InstallDir",
        ])
        .creation_flags(0x08000000)
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    // 解析形如:    InstallDir    REG_SZ    C:\Program Files (x86)\WinFsp\
    for line in stdout.lines() {
        if line.contains("InstallDir") {
            if let Some(idx) = line.find("REG_SZ") {
                let value = line[idx + "REG_SZ".len()..].trim();
                if !value.is_empty() {
                    return Some(value.to_string());
                }
            }
        }
    }
    None
}

/// 检查 WinFsp 状态（简单检测，用于启动时检查）
#[tauri::command]
pub async fn check_winfsp_status() -> bool {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        use std::process::Command;

        let output = Command::new("sc")
            .args(&["queryex", WINFSP_SERVICE])
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .output();

        match output {
            Ok(output) => {
                if output.status.success() {
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    // 只要能查询到状态（STATE），说明服务存在且已安装
                    return stdout.contains("STATE");
                }
                false
            }
            Err(_) => false,
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        true
    }
}

/// 检测 WinFsp 环境详情（详细检测，用于问题诊断）
#[tauri::command]
pub async fn check_winfsp_environment() -> Result<WinFspEnvironmentCheckResult, String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        use std::path::Path;
        use std::process::Command;

        // 1. 检测 DLL
        let dll_check = {
            let settings = settings::load_settings()?;
            let memnixfs_path = &settings.memnixfs_path;

            let mut found = false;
            let mut location = String::new();
            let mut path = String::new();
            let mut details = String::new();

            // ① MemNixFS 同目录下的 winfsp-x64.dll（用户可能把 dll 放一起）
            if !memnixfs_path.is_empty() {
                let memnixfs_file = Path::new(memnixfs_path);
                if let Some(dir) = memnixfs_file.parent() {
                    let dll_path = dir.join("winfsp-x64.dll");
                    if dll_path.exists() {
                        found = true;
                        location = "MemNixFS 目录".to_string();
                        path = dll_path.to_string_lossy().to_string();
                        details = format!("在 MemNixFS 目录找到 winfsp-x64.dll: {}", path);
                    }
                }
            }

            // ② WinFsp 标准安装目录
            if !found {
                let candidates = [
                    "C:\\Program Files (x86)\\WinFsp\\bin\\winfsp-x64.dll",
                    "C:\\Program Files\\WinFsp\\bin\\winfsp-x64.dll",
                ];
                for cand in candidates.iter() {
                    if Path::new(cand).exists() {
                        found = true;
                        location = "WinFsp 安装目录".to_string();
                        path = cand.to_string();
                        details = format!("在 WinFsp 安装目录找到 winfsp-x64.dll: {}", path);
                        break;
                    }
                }
            }

            // ③ 注册表 InstallDir 回退
            if !found {
                if let Some(install_dir) = query_winfsp_install_dir() {
                    let dll_path = Path::new(&install_dir).join("bin").join("winfsp-x64.dll");
                    if dll_path.exists() {
                        found = true;
                        location = "注册表 InstallDir".to_string();
                        path = dll_path.to_string_lossy().to_string();
                        details = format!("通过注册表找到 winfsp-x64.dll: {}", path);
                    }
                }
            }

            if !found {
                details =
                    "未找到 winfsp-x64.dll，请从 https://winfsp.dev/rel/ 安装 WinFsp".to_string();
            }

            WinFspDllCheckResult {
                found,
                location,
                path,
                details,
            }
        };

        // 2. 检测服务
        let service_check = {
            let output = Command::new("sc")
                .args(&["qc", WINFSP_SERVICE])
                .creation_flags(0x08000000) // CREATE_NO_WINDOW
                .output();

            match output {
                Ok(output) => {
                    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

                    if output.status.success() && stdout.contains("SERVICE_NAME") {
                        let start_type = if stdout.contains("AUTO_START") {
                            "自动启动".to_string()
                        } else if stdout.contains("DEMAND_START") {
                            "手动启动".to_string()
                        } else if stdout.contains("DISABLED") {
                            "已禁用".to_string()
                        } else if stdout.contains("BOOT_START") {
                            "启动时加载".to_string()
                        } else if stdout.contains("SYSTEM_START") {
                            "系统启动".to_string()
                        } else {
                            "未知".to_string()
                        };

                        let state_output = Command::new("sc")
                            .args(&["query", WINFSP_SERVICE])
                            .creation_flags(0x08000000)
                            .output();

                        let state = match state_output {
                            Ok(so) => {
                                let state_stdout = String::from_utf8_lossy(&so.stdout);
                                if state_stdout.contains("RUNNING") {
                                    "正在运行".to_string()
                                } else if state_stdout.contains("STOPPED") {
                                    "已停止".to_string()
                                } else if state_stdout.contains("PAUSED") {
                                    "已暂停".to_string()
                                } else if state_stdout.contains("PENDING") {
                                    "待定".to_string()
                                } else {
                                    "未知状态".to_string()
                                }
                            }
                            Err(_) => "无法查询状态".to_string(),
                        };

                        WinFspServiceCheckResult {
                            exists: true,
                            state,
                            start_type,
                            details: "WinFsp 服务已安装".to_string(),
                            raw_output: stdout,
                        }
                    } else {
                        WinFspServiceCheckResult {
                            exists: false,
                            state: "未安装".to_string(),
                            start_type: "N/A".to_string(),
                            details: if !stderr.is_empty() {
                                format!("WinFsp 服务未安装: {}", stderr.trim())
                            } else {
                                "WinFsp 服务未安装，请从 https://winfsp.dev/rel/ 安装".to_string()
                            },
                            raw_output: if !stderr.is_empty() { stderr } else { stdout },
                        }
                    }
                }
                Err(e) => WinFspServiceCheckResult {
                    exists: false,
                    state: "检测失败".to_string(),
                    start_type: "N/A".to_string(),
                    details: format!("无法执行 sc 命令: {}", e),
                    raw_output: String::new(),
                },
            }
        };

        // WinFsp 的服务存在即视为可用（DLL 找不到不一定致命，驱动随服务安装）
        let all_ok = service_check.exists;

        Ok(WinFspEnvironmentCheckResult {
            all_ok,
            dll_check,
            service_check,
        })
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(WinFspEnvironmentCheckResult {
            all_ok: true,
            dll_check: WinFspDllCheckResult {
                found: true,
                location: "N/A".to_string(),
                path: "N/A".to_string(),
                details: "非 Windows 系统，使用 FUSE，无需 WinFsp".to_string(),
            },
            service_check: WinFspServiceCheckResult {
                exists: true,
                state: "N/A".to_string(),
                start_type: "N/A".to_string(),
                details: "非 Windows 系统，使用 FUSE".to_string(),
                raw_output: String::new(),
            },
        })
    }
}
