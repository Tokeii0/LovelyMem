use crate::types::AppSettings;
use serde::{Deserialize, Serialize};
use std::path::Path;

/// 设置验证结果
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SettingsValidationResult {
    pub is_valid: bool,
    pub issues: Vec<SettingsIssue>,
    pub summary: String,
}

/// 设置问题
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SettingsIssue {
    pub field: String,
    pub field_name: String,
    pub issue_type: IssueType,
    pub current_value: String,
    pub description: String,
    pub severity: IssueSeverity,
}

/// 问题类型
#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum IssueType {
    FileNotExists,
    DirectoryNotExists,
    NotAbsolutePath,
    EmptyPath,
    InvalidPath,
    PythonEnvMissing, // MemProcFS Python环境缺失
}

/// 问题严重程度
#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum IssueSeverity {
    Critical, // 关键问题，影响核心功能
    Warning,  // 警告，影响部分功能
    Info,     // 信息，建议配置
}

/// 验证应用设置
pub fn validate_app_settings(settings: &AppSettings) -> SettingsValidationResult {
    let mut issues = Vec::new();

    // macOS 下跳过 Python2 和 Volatility2 相关检测
    #[cfg(not(target_os = "macos"))]
    {
        // 验证Python2路径
        if !settings.python2_path.is_empty() {
            validate_file_path(
                &settings.python2_path,
                "python2_path",
                "Python 2 路径",
                IssueSeverity::Warning,
                &mut issues,
            );
        } else {
            issues.push(SettingsIssue {
                field: "python2_path".to_string(),
                field_name: "Python 2 路径".to_string(),
                issue_type: IssueType::EmptyPath,
                current_value: String::new(),
                description: "Python 2 路径未配置，部分旧版本工具可能无法使用".to_string(),
                severity: IssueSeverity::Warning,
            });
        }
    }

    // 验证Python3路径
    if !settings.python3_path.is_empty() {
        validate_file_path(
            &settings.python3_path,
            "python3_path",
            "Python 3 路径",
            IssueSeverity::Critical,
            &mut issues,
        );
    } else {
        issues.push(SettingsIssue {
            field: "python3_path".to_string(),
            field_name: "Python 3 路径".to_string(),
            issue_type: IssueType::EmptyPath,
            current_value: String::new(),
            description: "Python 3 路径未配置，这将影响大部分功能的正常使用".to_string(),
            severity: IssueSeverity::Critical,
        });
    }

    // 验证MemProcFS路径
    if !settings.memprocfs_path.is_empty() {
        validate_file_path(
            &settings.memprocfs_path,
            "memprocfs_path",
            "MemProcFS 路径",
            IssueSeverity::Critical,
            &mut issues,
        );

        // 检查 MemProcFS 的 Python 环境
        validate_memprocfs_python_env(&settings.memprocfs_path, &mut issues);
    } else {
        issues.push(SettingsIssue {
            field: "memprocfs_path".to_string(),
            field_name: "MemProcFS 路径".to_string(),
            issue_type: IssueType::EmptyPath,
            current_value: String::new(),
            description: "MemProcFS 路径未配置，无法进行内存取证分析".to_string(),
            severity: IssueSeverity::Critical,
        });
    }

    // macOS 下跳过 Volatility2 相关检测
    #[cfg(not(target_os = "macos"))]
    {
        // 验证Volatility2路径
        if !settings.volatility2_path.is_empty() {
            validate_file_path(
                &settings.volatility2_path,
                "volatility2_path",
                "Volatility 2 路径",
                IssueSeverity::Warning,
                &mut issues,
            );
        } else {
            issues.push(SettingsIssue {
                field: "volatility2_path".to_string(),
                field_name: "Volatility 2 路径".to_string(),
                issue_type: IssueType::EmptyPath,
                current_value: String::new(),
                description: "Volatility 2 路径未配置，无法使用 Volatility 2 进行内存分析"
                    .to_string(),
                severity: IssueSeverity::Warning,
            });
        }

        // 验证Volatility2插件目录
        if !settings.volatility2_plugin.is_empty() {
            validate_directory_path(
                &settings.volatility2_plugin,
                "volatility2_plugin",
                "Volatility 2 插件目录",
                IssueSeverity::Warning,
                &mut issues,
            );
        } else {
            issues.push(SettingsIssue {
                field: "volatility2_plugin".to_string(),
                field_name: "Volatility 2 插件目录".to_string(),
                issue_type: IssueType::EmptyPath,
                current_value: String::new(),
                description: "Volatility 2 插件目录未配置，可能影响部分插件功能".to_string(),
                severity: IssueSeverity::Warning,
            });
        }
    }

    // 验证Volatility3路径
    if !settings.volatility3_path.is_empty() {
        validate_file_path(
            &settings.volatility3_path,
            "volatility3_path",
            "Volatility 3 路径",
            IssueSeverity::Warning,
            &mut issues,
        );
    } else {
        issues.push(SettingsIssue {
            field: "volatility3_path".to_string(),
            field_name: "Volatility 3 路径".to_string(),
            issue_type: IssueType::EmptyPath,
            current_value: String::new(),
            description: "Volatility 3 路径未配置，无法使用 Volatility 3 进行内存分析".to_string(),
            severity: IssueSeverity::Warning,
        });
    }

    // 验证 MemNixFS 路径。此前只判断字符串非空，错误路径也会在设置页显示为“已配置”。
    if !settings.memnixfs_path.is_empty() {
        validate_file_path(
            &settings.memnixfs_path,
            "memnixfs_path",
            "MemNixFS 路径",
            IssueSeverity::Warning,
            &mut issues,
        );
    } else {
        issues.push(SettingsIssue {
            field: "memnixfs_path".to_string(),
            field_name: "MemNixFS 路径".to_string(),
            issue_type: IssueType::EmptyPath,
            current_value: String::new(),
            description: "MemNixFS 路径未配置，无法进行 Linux 内存取证分析".to_string(),
            severity: IssueSeverity::Warning,
        });
    }

    // 验证输出路径（只验证格式，不验证是否存在，因为退出时会清空该目录）
    if !settings.output_path.is_empty() {
        let path_obj = Path::new(&settings.output_path);
        // 只检查是否为绝对路径，不检查是否存在
        if !path_obj.is_absolute() {
            issues.push(SettingsIssue {
                field: "output_path".to_string(),
                field_name: "输出目录".to_string(),
                issue_type: IssueType::NotAbsolutePath,
                current_value: settings.output_path.clone(),
                description: "输出目录 不是完整路径，建议使用绝对路径".to_string(),
                severity: IssueSeverity::Warning,
            });
        }
    } else {
        issues.push(SettingsIssue {
            field: "output_path".to_string(),
            field_name: "输出目录".to_string(),
            issue_type: IssueType::EmptyPath,
            current_value: String::new(),
            description: "输出目录未配置，分析结果将无法保存".to_string(),
            severity: IssueSeverity::Critical,
        });
    }

    // 验证告警目录（允许为空：为空时将自动使用 output_path 同级目录下的 warnings）
    if !settings.warning_path.is_empty() {
        validate_directory_path(
            &settings.warning_path,
            "warning_path",
            "告警目录",
            IssueSeverity::Info,
            &mut issues,
        );
    }

    // 验证脚本路径
    if !settings.scripts_path.is_empty() {
        validate_directory_path(
            &settings.scripts_path,
            "scripts_path",
            "脚本目录",
            IssueSeverity::Info,
            &mut issues,
        );
    } else {
        issues.push(SettingsIssue {
            field: "scripts_path".to_string(),
            field_name: "脚本目录".to_string(),
            issue_type: IssueType::EmptyPath,
            current_value: String::new(),
            description: "脚本目录未配置，无法使用自定义脚本功能".to_string(),
            severity: IssueSeverity::Info,
        });
    }

    // 验证扩展路径
    if !settings.extensions_path.is_empty() {
        validate_directory_path(
            &settings.extensions_path,
            "extensions_path",
            "扩展目录",
            IssueSeverity::Info,
            &mut issues,
        );
    } else {
        issues.push(SettingsIssue {
            field: "extensions_path".to_string(),
            field_name: "扩展目录".to_string(),
            issue_type: IssueType::EmptyPath,
            current_value: String::new(),
            description: "扩展目录未配置，无法使用扩展功能".to_string(),
            severity: IssueSeverity::Info,
        });
    }

    // 验证工具提示规则路径
    if !settings.tooltip_rules_path.is_empty() {
        validate_directory_path(
            &settings.tooltip_rules_path,
            "tooltip_rules_path",
            "工具提示规则目录",
            IssueSeverity::Info,
            &mut issues,
        );
    } else {
        issues.push(SettingsIssue {
            field: "tooltip_rules_path".to_string(),
            field_name: "工具提示规则目录".to_string(),
            issue_type: IssueType::EmptyPath,
            current_value: String::new(),
            description: "工具提示规则目录未配置，无法使用智能提示功能".to_string(),
            severity: IssueSeverity::Info,
        });
    }

    // 生成摘要
    let critical_count = issues
        .iter()
        .filter(|i| matches!(i.severity, IssueSeverity::Critical))
        .count();
    let warning_count = issues
        .iter()
        .filter(|i| matches!(i.severity, IssueSeverity::Warning))
        .count();
    let info_count = issues
        .iter()
        .filter(|i| matches!(i.severity, IssueSeverity::Info))
        .count();

    let summary = if critical_count > 0 {
        format!(
            "发现 {} 个关键问题，{} 个警告，{} 个建议。需要立即配置关键路径。",
            critical_count, warning_count, info_count
        )
    } else if warning_count > 0 {
        format!(
            "发现 {} 个警告，{} 个建议。建议完善相关配置。",
            warning_count, info_count
        )
    } else if info_count > 0 {
        format!("发现 {} 个建议。配置基本正常。", info_count)
    } else {
        "所有设置配置正常。".to_string()
    };

    SettingsValidationResult {
        is_valid: critical_count == 0,
        issues,
        summary,
    }
}

/// 验证文件路径
fn validate_file_path(
    path: &str,
    field: &str,
    field_name: &str,
    severity: IssueSeverity,
    issues: &mut Vec<SettingsIssue>,
) {
    if path.is_empty() {
        return;
    }

    let path_obj = Path::new(path);

    // 检查是否为绝对路径
    if !path_obj.is_absolute() {
        issues.push(SettingsIssue {
            field: field.to_string(),
            field_name: field_name.to_string(),
            issue_type: IssueType::NotAbsolutePath,
            current_value: path.to_string(),
            description: format!("{} 不是完整路径，建议使用绝对路径", field_name),
            severity: severity.clone(),
        });
    }

    // 检查文件是否存在
    if !path_obj.exists() {
        issues.push(SettingsIssue {
            field: field.to_string(),
            field_name: field_name.to_string(),
            issue_type: IssueType::FileNotExists,
            current_value: path.to_string(),
            description: format!("{} 指向的文件不存在", field_name),
            severity,
        });
    } else if !path_obj.is_file() {
        issues.push(SettingsIssue {
            field: field.to_string(),
            field_name: field_name.to_string(),
            issue_type: IssueType::InvalidPath,
            current_value: path.to_string(),
            description: format!("{} 指向的不是一个有效文件", field_name),
            severity,
        });
    }
}

/// 验证目录路径
fn validate_directory_path(
    path: &str,
    field: &str,
    field_name: &str,
    severity: IssueSeverity,
    issues: &mut Vec<SettingsIssue>,
) {
    if path.is_empty() {
        return;
    }

    let path_obj = Path::new(path);

    // 检查是否为绝对路径
    if !path_obj.is_absolute() {
        issues.push(SettingsIssue {
            field: field.to_string(),
            field_name: field_name.to_string(),
            issue_type: IssueType::NotAbsolutePath,
            current_value: path.to_string(),
            description: format!("{} 不是完整路径，建议使用绝对路径", field_name),
            severity: severity.clone(),
        });
    }

    // 检查目录是否存在
    if !path_obj.exists() {
        issues.push(SettingsIssue {
            field: field.to_string(),
            field_name: field_name.to_string(),
            issue_type: IssueType::DirectoryNotExists,
            current_value: path.to_string(),
            description: format!("{} 指向的目录不存在", field_name),
            severity,
        });
    } else if !path_obj.is_dir() {
        issues.push(SettingsIssue {
            field: field.to_string(),
            field_name: field_name.to_string(),
            issue_type: IssueType::InvalidPath,
            current_value: path.to_string(),
            description: format!("{} 指向的不是一个有效目录", field_name),
            severity,
        });
    }
}

/// 验证 MemProcFS 的 Python 环境
fn validate_memprocfs_python_env(memprocfs_path: &str, issues: &mut Vec<SettingsIssue>) {
    // 获取 MemProcFS 所在目录
    let memprocfs_file = Path::new(memprocfs_path);
    if let Some(memprocfs_dir) = memprocfs_file.parent() {
        // 检查 python 文件夹
        let python_dir = memprocfs_dir.join("python");

        if !python_dir.exists() || !python_dir.is_dir() {
            issues.push(SettingsIssue {
                field: "memprocfs_path".to_string(),
                field_name: "MemProcFS Python 环境".to_string(),
                issue_type: IssueType::PythonEnvMissing,
                current_value: python_dir.to_string_lossy().to_string(),
                description: "MemProcFS 的 python 文件夹不存在，需要修复 Python 环境".to_string(),
                severity: IssueSeverity::Critical,
            });
            return;
        }

        // 检查 python.exe 是否存在
        let python_exe = python_dir.join("python.exe");
        if !python_exe.exists() {
            issues.push(SettingsIssue {
                field: "memprocfs_path".to_string(),
                field_name: "MemProcFS Python 环境".to_string(),
                issue_type: IssueType::PythonEnvMissing,
                current_value: python_exe.to_string_lossy().to_string(),
                description: "MemProcFS 的 python 文件夹中缺少 python.exe，需要修复 Python 环境"
                    .to_string(),
                severity: IssueSeverity::Critical,
            });
        }
    }
}

/// 验证应用设置的Tauri命令
#[tauri::command]
pub async fn validate_app_settings_command() -> Result<SettingsValidationResult, String> {
    let settings = crate::settings::load_settings()?;
    Ok(validate_app_settings(&settings))
}
