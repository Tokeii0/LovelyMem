//! 内置 CSV 插件库
//!
//! 把进程与文件相关的取证动作以 `include_str!` 形式编入二进制，右键菜单
//! 不再依赖用户目录中的外部插件配置。
//!
//! 这些动作是只读的编译期资源。前端只提交动作 ID 与当前单元格上下文，
//! 后端按固定 ID 分派类型化实现，资源中的 `command` 仅是不可执行的动作标识。

use serde::Deserialize;

use crate::types::CsvPlugin;

/// 编译期嵌入的内置插件库
const EMBEDDED_PLUGINS_JSON: &str = include_str!("../resources/builtin_csv_plugins/plugins.json");

#[derive(Debug, Deserialize)]
struct BuiltinPluginsFile {
    #[serde(default)]
    #[allow(dead_code)]
    version: u32,
    #[serde(default)]
    plugins: Vec<CsvPlugin>,
}

/// 解析全部内置插件（解析失败返回空集合，避免影响右键菜单整体可用）。每个插件标记 builtin=true。
pub fn all_builtin_csv_plugins() -> Vec<CsvPlugin> {
    match serde_json::from_str::<BuiltinPluginsFile>(EMBEDDED_PLUGINS_JSON) {
        Ok(f) => f
            .plugins
            .into_iter()
            .map(|mut p| {
                p.builtin = true;
                p
            })
            .collect(),
        Err(e) => {
            eprintln!("[builtin_csv_plugins] 解析内置插件失败: {}", e);
            Vec::new()
        }
    }
}

/// 当前生效的内嵌取证动作。
pub fn enabled_builtin_csv_plugins() -> Vec<CsvPlugin> {
    all_builtin_csv_plugins()
        .into_iter()
        .filter(|p| p.context_menu_enabled)
        .collect()
}

// ──────────────────────────────────────────────────────────────────────────
// 命令
// ──────────────────────────────────────────────────────────────────────────

/// 返回当前生效的内置插件（供前端合并进右键菜单）
#[tauri::command]
pub async fn get_builtin_csv_plugins() -> Result<Vec<CsvPlugin>, String> {
    Ok(enabled_builtin_csv_plugins())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn embedded_actions_are_unique_and_self_contained() {
        let actions = all_builtin_csv_plugins();
        assert!(!actions.is_empty());

        let mut ids = HashSet::new();
        for action in actions {
            assert!(ids.insert(action.id.clone()), "重复动作 ID: {}", action.id);
            assert!(action.builtin);
            assert!(matches!(
                action.category.as_deref(),
                Some("进程内存" | "可执行程序" | "文件导出" | "进程信息")
            ));
            assert_eq!(action.command, format!("embedded:{}", action.id));
        }
    }
}
