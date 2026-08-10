use crate::settings::get_app_data_dir;
use crate::types::{ColumnTooltipRules, TooltipRule, TooltipRuleType};
use chrono;
use regex::Regex;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

/// 工具提示规则管理器
pub struct TooltipRulesManager {
    rules_cache: HashMap<String, ColumnTooltipRules>,
    rules_directory: PathBuf,
}

impl TooltipRulesManager {
    /// 创建新的工具提示规则管理器
    pub fn new(rules_path: &str) -> Result<Self, String> {
        let app_data_dir = get_app_data_dir()?;
        let rules_directory = app_data_dir.join(rules_path);

        // 确保规则目录存在
        if !rules_directory.exists() {
            fs::create_dir_all(&rules_directory)
                .map_err(|e| format!("创建工具提示规则目录失败: {}", e))?;
        }

        Ok(Self {
            rules_cache: HashMap::new(),
            rules_directory,
        })
    }

    /// 加载指定列的规则
    pub fn load_column_rules(
        &mut self,
        column_name: &str,
    ) -> Result<Option<ColumnTooltipRules>, String> {
        // 检查缓存
        if let Some(rules) = self.rules_cache.get(column_name) {
            return Ok(Some(rules.clone()));
        }

        // 构建规则文件路径
        let rule_file = self
            .rules_directory
            .join(format!("{}_rule.json", column_name.to_lowercase()));

        if !rule_file.exists() {
            return Ok(None);
        }

        // 读取并解析规则文件
        let content =
            fs::read_to_string(&rule_file).map_err(|e| format!("读取规则文件失败: {}", e))?;

        let rules: ColumnTooltipRules =
            serde_json::from_str(&content).map_err(|e| format!("解析规则文件失败: {}", e))?;

        // 缓存规则
        self.rules_cache
            .insert(column_name.to_string(), rules.clone());

        Ok(Some(rules))
    }

    /// 保存列的规则
    pub fn save_column_rules(&mut self, rules: &ColumnTooltipRules) -> Result<(), String> {
        let rule_file = self
            .rules_directory
            .join(format!("{}_rule.json", rules.column_name.to_lowercase()));

        let content =
            serde_json::to_string_pretty(rules).map_err(|e| format!("序列化规则失败: {}", e))?;

        fs::write(&rule_file, content).map_err(|e| format!("保存规则文件失败: {}", e))?;

        // 更新缓存
        self.rules_cache
            .insert(rules.column_name.clone(), rules.clone());

        Ok(())
    }

    /// 删除列的规则
    pub fn delete_column_rules(&mut self, column_name: &str) -> Result<(), String> {
        let rule_file = self
            .rules_directory
            .join(format!("{}_rule.json", column_name.to_lowercase()));

        if rule_file.exists() {
            fs::remove_file(&rule_file).map_err(|e| format!("删除规则文件失败: {}", e))?;
        }

        // 从缓存中移除
        self.rules_cache.remove(column_name);

        Ok(())
    }

    /// 匹配单元格值并返回工具提示（按优先级：精确匹配 > 范围匹配 > 正则表达式）
    pub fn match_cell_value(
        &mut self,
        column_name: &str,
        cell_value: &str,
    ) -> Result<Option<String>, String> {
        let rules = match self.load_column_rules(column_name)? {
            Some(rules) if rules.enabled => rules,
            _ => return Ok(None),
        };

        // 按优先级分组规则
        let mut exact_rules = Vec::new();
        let mut range_rules = Vec::new();
        let mut regex_rules = Vec::new();

        for rule in &rules.rules {
            if !rule.enabled {
                continue;
            }

            match &rule.rule_type {
                TooltipRuleType::Exact { .. } => exact_rules.push(rule),
                TooltipRuleType::Range { .. } => range_rules.push(rule),
                TooltipRuleType::Regex { .. } => regex_rules.push(rule),
            }
        }

        // 1. 优先检查精确匹配
        for rule in exact_rules {
            if let TooltipRuleType::Exact { value } = &rule.rule_type {
                if cell_value.trim() == value.trim() {
                    return Ok(Some(rule.tooltip.clone()));
                }
            }
        }

        // 2. 然后检查范围匹配
        for rule in range_rules {
            if let TooltipRuleType::Range { min, max } = &rule.rule_type {
                if let Ok(num_value) = cell_value.trim().parse::<f64>() {
                    if num_value >= *min && num_value <= *max {
                        return Ok(Some(rule.tooltip.clone()));
                    }
                }
            }
        }

        // 3. 最后检查正则表达式匹配
        for rule in regex_rules {
            if let TooltipRuleType::Regex { pattern } = &rule.rule_type {
                match Regex::new(pattern) {
                    Ok(regex) => {
                        if regex.is_match(cell_value) {
                            return Ok(Some(rule.tooltip.clone()));
                        }
                    }
                    Err(_) => continue, // 忽略无效的正则表达式
                }
            }
        }

        Ok(None)
    }

    /// 获取所有已加载的列规则
    pub fn get_all_column_names(&self) -> Vec<String> {
        self.rules_cache.keys().cloned().collect()
    }

    /// 清除缓存
    pub fn clear_cache(&mut self) {
        self.rules_cache.clear();
    }

    /// 重新加载所有规则
    pub fn reload_all_rules(&mut self) -> Result<(), String> {
        self.clear_cache();

        // 扫描规则目录中的所有规则文件
        let entries =
            fs::read_dir(&self.rules_directory).map_err(|e| format!("读取规则目录失败: {}", e))?;

        for entry in entries {
            let entry = entry.map_err(|e| format!("读取目录项失败: {}", e))?;
            let path = entry.path();

            if path.is_file() && path.extension().map_or(false, |ext| ext == "json") {
                if let Some(file_stem) = path.file_stem() {
                    if let Some(file_name) = file_stem.to_str() {
                        if file_name.ends_with("_rule") {
                            let column_name = file_name.trim_end_matches("_rule");
                            let _ = self.load_column_rules(column_name);
                        }
                    }
                }
            }
        }

        Ok(())
    }
}

/// Tauri 命令：获取工具提示
#[tauri::command]
pub async fn get_cell_tooltip(
    column_name: String,
    cell_value: String,
    rules_path: String,
) -> Result<Option<String>, String> {
    let mut manager = TooltipRulesManager::new(&rules_path)?;
    manager.match_cell_value(&column_name, &cell_value)
}

/// Tauri 命令：保存列规则
#[tauri::command]
pub async fn save_tooltip_rules(
    rules: ColumnTooltipRules,
    rules_path: String,
) -> Result<(), String> {
    let mut manager = TooltipRulesManager::new(&rules_path)?;
    manager.save_column_rules(&rules)
}

/// Tauri 命令：删除列规则
#[tauri::command]
pub async fn delete_tooltip_rules(column_name: String, rules_path: String) -> Result<(), String> {
    let mut manager = TooltipRulesManager::new(&rules_path)?;
    manager.delete_column_rules(&column_name)
}

/// Tauri 命令：获取所有列规则
#[tauri::command]
pub async fn get_all_tooltip_rules(rules_path: String) -> Result<Vec<ColumnTooltipRules>, String> {
    let mut manager = TooltipRulesManager::new(&rules_path)?;
    manager.reload_all_rules()?;

    let mut all_rules = Vec::new();
    for column_name in manager.get_all_column_names() {
        if let Some(rules) = manager.load_column_rules(&column_name)? {
            all_rules.push(rules);
        }
    }

    Ok(all_rules)
}

/// 创建示例规则
pub fn create_example_rules(rules_path: &str) -> Result<(), String> {
    let mut manager = TooltipRulesManager::new(rules_path)?;

    // 检查是否已有规则，如果有则跳过创建
    manager.reload_all_rules()?;
    let existing_column_names = manager.get_all_column_names();
    if !existing_column_names.is_empty() {
        return Err("示例规则已存在，跳过创建".to_string());
    }

    // 创建 SrcPort 示例规则
    let srcport_rules = ColumnTooltipRules {
        column_name: "SrcPort".to_string(),
        rules: vec![
            TooltipRule {
                rule_type: TooltipRuleType::Exact {
                    value: "80".to_string(),
                },
                tooltip: "HTTP端口\n常用于Web服务器\n如Apache、Nginx等\n默认的网页访问端口"
                    .to_string(),
                enabled: true,
                created_at: chrono::Utc::now().to_rfc3339(),
                updated_at: chrono::Utc::now().to_rfc3339(),
            },
            TooltipRule {
                rule_type: TooltipRuleType::Exact {
                    value: "443".to_string(),
                },
                tooltip: "HTTPS端口\n安全的Web服务\n使用SSL/TLS加密\n保护数据传输安全".to_string(),
                enabled: true,
                created_at: chrono::Utc::now().to_rfc3339(),
                updated_at: chrono::Utc::now().to_rfc3339(),
            },
            TooltipRule {
                rule_type: TooltipRuleType::Exact {
                    value: "22".to_string(),
                },
                tooltip: "SSH端口\n安全Shell协议\n用于远程登录和文件传输\nLinux/Unix系统常用"
                    .to_string(),
                enabled: true,
                created_at: chrono::Utc::now().to_rfc3339(),
                updated_at: chrono::Utc::now().to_rfc3339(),
            },
            TooltipRule {
                rule_type: TooltipRuleType::Range {
                    min: 1024.0,
                    max: 65535.0,
                },
                tooltip: "动态端口范围".to_string(),
                enabled: true,
                created_at: chrono::Utc::now().to_rfc3339(),
                updated_at: chrono::Utc::now().to_rfc3339(),
            },
        ],
        enabled: true,
        created_at: chrono::Utc::now().to_rfc3339(),
        updated_at: chrono::Utc::now().to_rfc3339(),
    };

    manager.save_column_rules(&srcport_rules)?;

    // 创建 DstPort 示例规则
    let dstport_rules = ColumnTooltipRules {
        column_name: "DstPort".to_string(),
        rules: vec![
            TooltipRule {
                rule_type: TooltipRuleType::Exact {
                    value: "80".to_string(),
                },
                tooltip: "可能是web服务".to_string(),
                enabled: true,
                created_at: chrono::Utc::now().to_rfc3339(),
                updated_at: chrono::Utc::now().to_rfc3339(),
            },
            TooltipRule {
                rule_type: TooltipRuleType::Exact {
                    value: "443".to_string(),
                },
                tooltip: "可能是HTTPS服务".to_string(),
                enabled: true,
                created_at: chrono::Utc::now().to_rfc3339(),
                updated_at: chrono::Utc::now().to_rfc3339(),
            },
        ],
        enabled: true,
        created_at: chrono::Utc::now().to_rfc3339(),
        updated_at: chrono::Utc::now().to_rfc3339(),
    };

    manager.save_column_rules(&dstport_rules)?;

    // 创建 ProcessName 示例规则（使用正则表达式）
    let processname_rules = ColumnTooltipRules {
        column_name: "ProcessName".to_string(),
        rules: vec![
            TooltipRule {
                rule_type: TooltipRuleType::Exact { value: "svchost.exe".to_string() },
                tooltip: "Windows服务主机进程\n系统核心进程\n管理多个Windows服务\n如网络、打印、主题等服务".to_string(),
                enabled: true,
                created_at: chrono::Utc::now().to_rfc3339(),
                updated_at: chrono::Utc::now().to_rfc3339(),
            },
            TooltipRule {
                rule_type: TooltipRuleType::Exact { value: "explorer.exe".to_string() },
                tooltip: "Windows资源管理器\n文件管理器进程\n负责桌面和文件浏览\nWindows图形界面核心".to_string(),
                enabled: true,
                created_at: chrono::Utc::now().to_rfc3339(),
                updated_at: chrono::Utc::now().to_rfc3339(),
            },
            TooltipRule {
                rule_type: TooltipRuleType::Regex { pattern: r".*\.exe$".to_string() },
                tooltip: "Windows可执行文件\n程序的主执行文件\n双击可运行程序".to_string(),
                enabled: true,
                created_at: chrono::Utc::now().to_rfc3339(),
                updated_at: chrono::Utc::now().to_rfc3339(),
            },
        ],
        enabled: true,
        created_at: chrono::Utc::now().to_rfc3339(),
        updated_at: chrono::Utc::now().to_rfc3339(),
    };

    manager.save_column_rules(&processname_rules)?;

    Ok(())
}

/// Tauri 命令：创建示例规则
#[tauri::command]
pub async fn create_example_tooltip_rules(rules_path: String) -> Result<(), String> {
    create_example_rules(&rules_path)
}
