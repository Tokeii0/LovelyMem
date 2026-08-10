//! 内置告警规则库
//!
//! 把一批高价值的检测规则（敏感关键词、异常文件、可疑进程/网络、持久化等）以
//! `include_str!` 形式编入二进制，在评估时与用户的外置规则合并。
//!
//! 设计要点：
//! - 内置规则就是普通的 [`WarningRule`]，复用现有匹配引擎，不引入新的匹配逻辑；
//! - 只读：用户通过"全局开关 / 单条停用 / 复制为外置"来定制，内置内容本身不落盘；
//! - 去重：若用户的外置规则存在同 `id`，外置覆盖内置（见 `warning_rules` 评估逻辑）。

use serde::{Deserialize, Serialize};
use std::collections::HashSet;

use crate::types::AppSettings;
use crate::warning_rules::{RuleKind, WarningRule};

/// 编译期嵌入的内置规则库（JSON，结构与外置 `*_warning.json` 一致）
const EMBEDDED_RULES_JSON: &str = include_str!("../resources/builtin_warnings/rules.json");

#[derive(Debug, Deserialize)]
struct BuiltinRulesFile {
    #[serde(default)]
    #[allow(dead_code)]
    version: u32,
    #[serde(default)]
    rules: Vec<WarningRule>,
}

/// 解析全部内置规则。解析失败时返回空集合而非 panic，避免影响告警中心整体可用性。
pub fn all_builtin_rules() -> Vec<WarningRule> {
    match serde_json::from_str::<BuiltinRulesFile>(EMBEDDED_RULES_JSON) {
        Ok(f) => f.rules,
        Err(e) => {
            eprintln!("[builtin_warnings] 解析内置规则失败: {}", e);
            Vec::new()
        }
    }
}

/// 返回当前生效的内置规则：全局开关关闭则为空；并过滤掉被用户单独停用的规则。
pub fn enabled_builtin_rules(settings: &AppSettings) -> Vec<WarningRule> {
    if !settings.builtin_warnings_enabled {
        return Vec::new();
    }
    let disabled: HashSet<&str> = settings
        .disabled_builtin_warning_ids
        .iter()
        .map(|s| s.as_str())
        .collect();

    all_builtin_rules()
        .into_iter()
        .filter(|r| r.enabled && !disabled.contains(r.id.as_str()))
        .collect()
}

// ──────────────────────────────────────────────────────────────────────────
// 供前端"内置规则库"页签使用的视图与命令
// ──────────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct BuiltinWarningRuleView {
    pub id: String,
    pub title: String,
    pub severity: String,
    pub file: String,
    pub category: String,
    pub summary: String,
    /// 一行"匹配说明"（由规则的 kind 推导，便于用户理解该规则在查什么）
    pub explain: String,
    /// 该规则当前是否启用（未被用户单独停用）
    pub enabled: bool,
}

#[derive(Debug, Serialize)]
pub struct BuiltinWarningRulesResponse {
    /// 内置规则库的全局开关
    pub global_enabled: bool,
    pub rules: Vec<BuiltinWarningRuleView>,
}

/// 由规则类型生成一行人类可读的匹配说明
fn explain_kind(kind: &RuleKind) -> String {
    let col_label = |col: &str| -> String {
        let c = col.trim();
        if c.is_empty() || c == "*" {
            "任意列".to_string()
        } else {
            format!("列[{}]", c)
        }
    };

    match kind {
        RuleKind::CsvAnyMatch {
            matches,
            column,
            regex,
        } => {
            let mut parts: Vec<String> = matches
                .iter()
                .filter(|m| !m.regex.trim().is_empty())
                .map(|m| format!("{} 匹配 /{}/", col_label(&m.column), m.regex))
                .collect();
            if parts.is_empty() && !regex.trim().is_empty() {
                parts.push(format!("{} 匹配 /{}/", col_label(column), regex));
            }
            parts.join("；")
        }
        RuleKind::CsvHasColumns { columns } => format!("CSV 需包含列: {}", columns.join(", ")),
        RuleKind::CsvRowCountGreater { threshold } => format!("CSV 行数 > {}", threshold),
        RuleKind::TextFileContains { regexes, regex } => {
            let mut all = regexes.clone();
            if !regex.trim().is_empty() {
                all.push(regex.clone());
            }
            format!("文本匹配: {}", all.join(" | "))
        }
        RuleKind::FileExists => "目标文件不存在时触发".to_string(),
    }
}

/// 返回内置规则库列表 + 全局开关状态（供前端展示与管理）
#[tauri::command]
pub async fn get_builtin_warning_rules() -> Result<BuiltinWarningRulesResponse, String> {
    let settings = crate::settings::load_settings().unwrap_or_default();
    let disabled: HashSet<&str> = settings
        .disabled_builtin_warning_ids
        .iter()
        .map(|s| s.as_str())
        .collect();

    let rules = all_builtin_rules()
        .into_iter()
        .map(|r| {
            let enabled = !disabled.contains(r.id.as_str());
            BuiltinWarningRuleView {
                explain: explain_kind(&r.kind),
                enabled,
                id: r.id,
                title: r.title,
                severity: r.severity,
                file: r.file,
                category: r.category,
                summary: r.summary,
            }
        })
        .collect();

    Ok(BuiltinWarningRulesResponse {
        global_enabled: settings.builtin_warnings_enabled,
        rules,
    })
}

/// 设置内置规则库全局开关
#[tauri::command]
pub async fn set_builtin_warnings_global_enabled(enabled: bool) -> Result<(), String> {
    crate::settings::update_settings(|s| {
        s.builtin_warnings_enabled = enabled;
    })
}

/// 启用/停用某条内置规则（写入/移除 disabled_builtin_warning_ids）
#[tauri::command]
pub async fn set_builtin_warning_enabled(id: String, enabled: bool) -> Result<(), String> {
    crate::settings::update_settings(|s| {
        if enabled {
            s.disabled_builtin_warning_ids.retain(|x| x != &id);
        } else if !s.disabled_builtin_warning_ids.iter().any(|x| x == &id) {
            s.disabled_builtin_warning_ids.push(id.clone());
        }
    })
}

/// 把一条内置规则复制到对应文件的外置规则中（保留同 id，从而在评估时覆盖该内置规则）。
/// 复制后用户即可在现有外置规则编辑器中自由改写。返回目标输出文件名。
#[tauri::command]
pub async fn copy_builtin_warning_to_external(id: String) -> Result<String, String> {
    let rule = all_builtin_rules()
        .into_iter()
        .find(|r| r.id == id)
        .ok_or_else(|| format!("未找到内置规则: {}", id))?;

    let file = rule.file.trim().to_string();
    if file.is_empty() {
        return Err("该内置规则缺少目标文件，无法复制".to_string());
    }

    let mut existing = crate::warning_rules::load_warning_rules_for_file(&file)?;
    if existing.iter().any(|r| r.id == rule.id) {
        // 已复制过，幂等返回
        return Ok(file);
    }
    existing.push(rule);
    crate::warning_rules::save_warning_rules_for_file(&file, existing)?;
    Ok(file)
}
