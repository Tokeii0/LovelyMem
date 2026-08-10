use crate::settings;
use crate::types::AppSettings;
use chrono::Utc;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeSet, HashMap};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CsvAnyMatchItem {
    #[serde(default)]
    pub column: String,
    #[serde(default)]
    pub regex: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WarningRule {
    pub id: String,
    pub enabled: bool,
    #[serde(default)]
    pub file: String,
    pub severity: String,
    pub title: String,
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub details: String,
    /// 规则分组（主要用于内置规则库在 UI 中分类展示，外置规则可留空）
    #[serde(default)]
    pub category: String,
    /// 命中后供 CSV 查看器"快速筛选"用的关键词（纯子串，正则留给后端匹配）
    #[serde(default)]
    pub quick_filter: String,
    pub kind: RuleKind,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type")]
pub enum RuleKind {
    FileExists,
    CsvHasColumns {
        columns: Vec<String>,
    },
    CsvAnyMatch {
        #[serde(default)]
        matches: Vec<CsvAnyMatchItem>,
        #[serde(default)]
        column: String,
        #[serde(default)]
        regex: String,
    },
    CsvRowCountGreater {
        threshold: usize,
    },
    TextFileContains {
        #[serde(default)]
        regexes: Vec<String>,
        #[serde(default)]
        regex: String,
    },
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct WarningItem {
    pub id: String,
    pub title: String,
    pub severity: String,
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub details: String,
    #[serde(default)]
    pub evidence: Vec<String>,
    #[serde(default)]
    pub source: String,
    pub created_at: i64,
    /// 命中所针对的目标文件名（供前端"在 CSV 中筛选查看"构造路径）
    #[serde(default)]
    pub file: String,
    /// 命中后跳转 CSV 查看器时预填的搜索关键词
    #[serde(default)]
    pub filter_query: String,
}

fn sanitize_rule_file_stem(input: &str) -> String {
    let base = Path::new(input)
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| input.to_string());

    let stem = base.split('.').next().unwrap_or(&base).to_string();

    let mut normalized = stem;
    // 兼容：如果前端误把规则文件名（例如 process_warning.json）当成 output_file 传入，避免拼接成 process_warning_warning.json
    // 规则文件名固定是 *_warning.json，所以 stem 末尾可能会带 _warning，这里统一剥离。
    while normalized.to_ascii_lowercase().ends_with("_warning") {
        normalized = normalized
            .trim_end_matches("_warning")
            .trim_end_matches("_WARNING")
            .to_string();
    }

    normalized
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '_' || c == '-' {
                c
            } else {
                '_'
            }
        })
        .collect::<String>()
}

fn effective_warning_dir(app_settings: &AppSettings) -> PathBuf {
    if !app_settings.warning_path.trim().is_empty() {
        return PathBuf::from(app_settings.warning_path.trim());
    }

    let out = PathBuf::from(app_settings.output_path.trim());
    if let Some(parent) = out.parent() {
        return parent.join("warnings");
    }

    PathBuf::from("warnings")
}

fn rules_file_path_for_output_file(
    warning_dir: &Path,
    output_file: &str,
) -> Result<PathBuf, String> {
    let stem = sanitize_rule_file_stem(output_file);
    Ok(warning_dir.join(format!("{}_warning.json", stem)))
}

fn infer_output_file_from_rule_file(app_settings: &AppSettings, file_arg: &str) -> String {
    let base = Path::new(file_arg)
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| file_arg.to_string());

    // 如果传入的是规则文件名（*_warning.json），则尝试从 output_path 里找同 stem 的真实输出文件；找不到则回退为 <stem>.csv
    if base.to_ascii_lowercase().ends_with("_warning.json") {
        let inferred_stem = base
            .trim_end_matches("_warning.json")
            .trim_end_matches("_WARNING.json")
            .to_string();

        let output_dir = Path::new(app_settings.output_path.trim());
        if output_dir.exists() {
            if let Ok(entries) = fs::read_dir(output_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if !path.is_file() {
                        continue;
                    }
                    let name = match path.file_name() {
                        Some(n) => n.to_string_lossy().to_string(),
                        None => continue,
                    };
                    let stem_match = Path::new(&name)
                        .file_stem()
                        .map(|s| s.to_string_lossy().eq_ignore_ascii_case(&inferred_stem))
                        .unwrap_or(false);
                    if stem_match {
                        return name;
                    }
                }
            }
        }

        return format!("{}.csv", inferred_stem);
    }

    base
}

pub fn load_warning_rules_for_file(output_file: &str) -> Result<Vec<WarningRule>, String> {
    let app_settings: AppSettings = settings::load_settings().unwrap_or_default();
    let warning_dir = effective_warning_dir(&app_settings);
    if !warning_dir.exists() {
        let _ = fs::create_dir_all(&warning_dir);
    }

    let file_path = rules_file_path_for_output_file(&warning_dir, output_file)?;
    // 兼容：旧逻辑如果传入 process_warning.json，会写到 process_warning_warning.json，这里尝试自动迁移
    let base_arg = Path::new(output_file)
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| output_file.to_string());
    let legacy_path = if base_arg.to_ascii_lowercase().ends_with("_warning.json") {
        let stem_no_ext = Path::new(&base_arg)
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| base_arg.clone());
        Some(warning_dir.join(format!("{}_warning.json", stem_no_ext)))
    } else {
        None
    };

    if !file_path.exists() {
        if let Some(lp) = &legacy_path {
            if lp.exists() {
                // 尽量把旧文件重命名到新文件名，避免用户看到重复文件
                if let Err(_) = fs::rename(lp, &file_path) {
                    // rename 失败就不强求，后续读取 legacy 内容
                }
            }
        }
    }

    if !file_path.exists() {
        // 外置规则文件不存在时返回空集合；开箱即用的检测能力由内置规则库提供（见 builtin_warnings）。
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(&file_path).map_err(|e| format!("读取规则失败: {}", e))?;
    let mut rules: Vec<WarningRule> =
        serde_json::from_str(&content).map_err(|e| format!("解析规则失败: {}", e))?;

    // 兼容：如果规则中没填 file，则自动填充当前输出文件名
    let inferred_target = infer_output_file_from_rule_file(&app_settings, output_file);

    for r in &mut rules {
        if r.file.trim().is_empty() {
            r.file = inferred_target.clone();
        }
    }

    Ok(rules)
}

pub fn save_warning_rules_for_file(
    output_file: &str,
    rules: Vec<WarningRule>,
) -> Result<(), String> {
    let app_settings: AppSettings = settings::load_settings().unwrap_or_default();
    let warning_dir = effective_warning_dir(&app_settings);
    if !warning_dir.exists() {
        fs::create_dir_all(&warning_dir).map_err(|e| format!("创建告警目录失败: {}", e))?;
    }

    let file_path = rules_file_path_for_output_file(&warning_dir, output_file)?;

    // 兼容：如果前端把规则文件名传进来（process_warning.json），或者把 rules[].file 强行写成同名，保存时统一纠正为真实输出文件名
    let inferred_target = infer_output_file_from_rule_file(&app_settings, output_file);
    let base_arg = Path::new(output_file)
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| output_file.to_string());
    let mut normalized_rules = rules;
    for r in &mut normalized_rules {
        let rule_file_base = Path::new(r.file.trim())
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| r.file.clone());

        if r.file.trim().is_empty()
            || rule_file_base.eq_ignore_ascii_case(&base_arg)
            || rule_file_base
                .to_ascii_lowercase()
                .ends_with("_warning.json")
        {
            r.file = inferred_target.clone();
        }
    }

    let json = serde_json::to_string_pretty(&normalized_rules)
        .map_err(|e| format!("序列化规则失败: {}", e))?;
    fs::write(&file_path, json).map_err(|e| format!("保存规则失败: {}", e))?;
    Ok(())
}

fn resolve_target_path(output_path: &str, file: &str) -> PathBuf {
    Path::new(output_path).join(file)
}

/// 从命中单元格原文中截取以关键词为中心的简短上下文片段，
/// 避免在证据里堆砌整段内容（matched 是 value 的精确子串，按字节定位后换算字符下标保证 UTF-8 安全）。
fn snippet_around(value: &str, matched: &str, window: usize) -> String {
    let chars: Vec<char> = value.chars().collect();
    if chars.is_empty() {
        return String::new();
    }
    let start_char = match value.find(matched) {
        Some(byte_pos) => value[..byte_pos].chars().count(),
        None => 0,
    };
    let matched_len = matched.chars().count().max(1);
    let from = start_char.saturating_sub(window);
    let to = (start_char + matched_len + window).min(chars.len());
    let prefix = if from > 0 { "…" } else { "" };
    let suffix = if to < chars.len() { "…" } else { "" };
    let mid: String = chars[from..to].iter().collect();
    format!("{}{}{}", prefix, mid, suffix)
}

fn evaluate_rule(output_path: &str, rule: &WarningRule) -> Result<Option<WarningItem>, String> {
    if !rule.enabled {
        return Ok(None);
    }

    let target = resolve_target_path(output_path, &rule.file);

    match &rule.kind {
        RuleKind::FileExists => {
            if !target.exists() {
                return Ok(Some(WarningItem {
                    id: rule.id.clone(),
                    title: rule.title.clone(),
                    severity: rule.severity.clone(),
                    summary: rule.summary.clone(),
                    details: rule.details.clone(),
                    evidence: vec![target.to_string_lossy().to_string()],
                    source: format!("规则: {}", rule.id),
                    created_at: Utc::now().timestamp_millis(),
                    ..Default::default()
                }));
            }
            Ok(None)
        }
        RuleKind::CsvHasColumns { columns } => {
            if !target.exists() {
                return Ok(None);
            }

            let mut rdr =
                csv::Reader::from_path(&target).map_err(|e| format!("读取CSV失败: {}", e))?;
            let headers = rdr
                .headers()
                .map_err(|e| format!("读取CSV表头失败: {}", e))?
                .clone();

            let mut missing: Vec<String> = Vec::new();
            for col in columns {
                if !headers.iter().any(|h| h == col) {
                    missing.push(col.clone());
                }
            }

            if missing.is_empty() {
                return Ok(None);
            }

            Ok(Some(WarningItem {
                id: rule.id.clone(),
                title: rule.title.clone(),
                severity: rule.severity.clone(),
                summary: rule.summary.clone(),
                details: format!("缺失列: {}. {}", missing.join(", "), rule.details),
                evidence: vec![target.to_string_lossy().to_string()],
                source: format!("规则: {}", rule.id),
                created_at: Utc::now().timestamp_millis(),
                ..Default::default()
            }))
        }
        RuleKind::CsvAnyMatch {
            matches,
            column,
            regex,
        } => {
            if !target.exists() {
                return Ok(None);
            }

            let mut normalized: Vec<CsvAnyMatchItem> = matches.clone();
            if normalized.is_empty() && (!column.trim().is_empty() || !regex.trim().is_empty()) {
                normalized.push(CsvAnyMatchItem {
                    column: column.clone(),
                    regex: regex.clone(),
                });
            }
            normalized.retain(|m| !m.column.trim().is_empty() && !m.regex.trim().is_empty());
            if normalized.is_empty() {
                return Ok(None);
            }

            let mut rdr =
                csv::Reader::from_path(&target).map_err(|e| format!("读取CSV失败: {}", e))?;
            let headers = rdr
                .headers()
                .map_err(|e| format!("读取CSV表头失败: {}", e))?
                .clone();

            let find_idx = |candidates: &[&str]| -> Option<usize> {
                headers
                    .iter()
                    .position(|h| candidates.iter().any(|c| h.eq_ignore_ascii_case(c)))
            };
            let pid_idx = find_idx(&["PID", "Pid", "ProcessId", "ProcessID"]);
            let name_idx = find_idx(&["ImageFileName", "Image", "Name", "ProcessName"]);

            // 列定位目标：Any 表示对整行所有列做匹配（列名写 "*"），
            // Index 表示仅匹配指定列。指定列在目标 CSV 中缺失时跳过该匹配项（非致命），
            // 避免一条规则因不同工具导出的列名差异而整体报错。
            enum ColTarget {
                Any,
                Index(usize),
            }

            let mut compiled: Vec<(String, ColTarget, Regex)> = Vec::new();
            for m in normalized {
                let col = m.column.trim().to_string();
                let re = Regex::new(&m.regex).map_err(|e| format!("正则错误: {}", e))?;
                if col == "*" {
                    compiled.push((m.regex.clone(), ColTarget::Any, re));
                } else if let Some(idx) = headers
                    .iter()
                    .position(|h| h.trim().eq_ignore_ascii_case(&col))
                {
                    compiled.push((m.regex.clone(), ColTarget::Index(idx), re));
                } else {
                    // 目标 CSV 不含该列：跳过此匹配项
                    continue;
                }
            }
            if compiled.is_empty() {
                return Ok(None);
            }

            // 供"快速筛选"使用的关键词：优先 rule.quick_filter，否则回退第一个正则
            let filter_query = if !rule.quick_filter.trim().is_empty() {
                rule.quick_filter.trim().to_string()
            } else {
                compiled
                    .first()
                    .map(|(rx, _, _)| rx.clone())
                    .unwrap_or_default()
            };

            #[derive(Clone, Default)]
            struct MatchAgg {
                count: usize,
                matched_display: String,
                sample_value: String,
                rows: Vec<usize>,
                pids: BTreeSet<String>,
                names: BTreeSet<String>,
            }

            // 分组键 = (列名, 命中关键词的小写形式)，让相同关键词的多行命中聚合到一起，
            // 这样证据会明确写出"命中了哪个关键词"，而不是堆砌整段单元格内容与超长正则。
            let mut groups: HashMap<(String, String), MatchAgg> = HashMap::new();
            let mut total_hits: usize = 0;
            let max_total_hits: usize = 20000;
            let max_groups: usize = 50;
            let max_row_samples: usize = 8;
            let max_pid_samples: usize = 20;
            let max_name_samples: usize = 10;
            for (row_idx, result) in rdr.records().enumerate() {
                let record = result.map_err(|e| format!("读取CSV行失败: {}", e))?;
                for (_, target_col, re) in &compiled {
                    // 命中后得到 (实际命中的列名, 命中的关键词/子串, 命中单元格原文)
                    let hit: Option<(String, String, String)> = match target_col {
                        ColTarget::Index(idx) => match record.get(*idx) {
                            Some(v) => re.find(v).map(|m| {
                                let col_name =
                                    headers.get(*idx).map(|h| h.to_string()).unwrap_or_default();
                                (col_name, m.as_str().to_string(), v.to_string())
                            }),
                            None => None,
                        },
                        ColTarget::Any => {
                            let mut found: Option<(String, String, String)> = None;
                            for (ci, value) in record.iter().enumerate() {
                                if let Some(m) = re.find(value) {
                                    let col_name = headers
                                        .get(ci)
                                        .map(|h| h.to_string())
                                        .unwrap_or_else(|| format!("col{}", ci));
                                    found =
                                        Some((col_name, m.as_str().to_string(), value.to_string()));
                                    break;
                                }
                            }
                            found
                        }
                    };

                    if let Some((col_name, matched, value)) = hit {
                        total_hits += 1;
                        if total_hits > max_total_hits {
                            break;
                        }

                        if groups.len() >= max_groups {
                            break;
                        }

                        let pid = pid_idx.and_then(|i| record.get(i)).unwrap_or("").trim();
                        let pname = name_idx.and_then(|i| record.get(i)).unwrap_or("").trim();

                        let key = (col_name, matched.to_lowercase());
                        let entry = groups.entry(key).or_insert_with(MatchAgg::default);
                        entry.count += 1;
                        if entry.matched_display.is_empty() {
                            entry.matched_display = matched;
                        }
                        if entry.sample_value.is_empty() {
                            entry.sample_value = value.trim().to_string();
                        }
                        if entry.rows.len() < max_row_samples {
                            entry.rows.push(row_idx + 1);
                        }
                        if !pid.is_empty() && entry.pids.len() < max_pid_samples {
                            entry.pids.insert(pid.to_string());
                        }
                        if !pname.is_empty() && entry.names.len() < max_name_samples {
                            entry.names.insert(pname.to_string());
                        }
                    }
                }
                if total_hits > max_total_hits || groups.len() >= max_groups {
                    break;
                }
            }

            if groups.is_empty() {
                return Ok(None);
            }

            let mut grouped: Vec<((String, String), MatchAgg)> = groups.into_iter().collect();
            grouped.sort_by(|a, b| b.1.count.cmp(&a.1.count));

            let mut evidence: Vec<String> = Vec::new();
            for ((col_name, matched_lower), agg) in grouped {
                let keyword = if agg.matched_display.is_empty() {
                    matched_lower
                } else {
                    agg.matched_display
                };

                let rows_preview = if agg.rows.is_empty() {
                    String::new()
                } else {
                    let s: Vec<String> = agg.rows.iter().map(|r| r.to_string()).collect();
                    format!(" · 行 {}", s.join(","))
                };
                let pids_preview = if agg.pids.is_empty() {
                    String::new()
                } else {
                    format!(
                        " · PID {}",
                        agg.pids.iter().cloned().collect::<Vec<_>>().join(",")
                    )
                };
                let names_preview = if agg.names.is_empty() {
                    String::new()
                } else {
                    format!(
                        " · 进程 {}",
                        agg.names.iter().cloned().collect::<Vec<_>>().join(",")
                    )
                };

                let snippet = snippet_around(&agg.sample_value, &keyword, 36);

                evidence.push(format!(
                    "命中「{}」· 列 {} · {} 次{}{}{}\n    片段: {}",
                    keyword,
                    col_name,
                    agg.count,
                    rows_preview,
                    pids_preview,
                    names_preview,
                    snippet
                ));
            }

            if evidence.is_empty() {
                return Ok(None);
            }

            Ok(Some(WarningItem {
                id: rule.id.clone(),
                title: rule.title.clone(),
                severity: rule.severity.clone(),
                summary: rule.summary.clone(),
                details: rule.details.clone(),
                evidence,
                source: format!("规则: {}", rule.id),
                created_at: Utc::now().timestamp_millis(),
                file: rule.file.clone(),
                filter_query,
            }))
        }
        RuleKind::CsvRowCountGreater { threshold } => {
            if !target.exists() {
                return Ok(None);
            }

            let mut rdr =
                csv::Reader::from_path(&target).map_err(|e| format!("读取CSV失败: {}", e))?;
            let mut count: usize = 0;
            for result in rdr.records() {
                result.map_err(|e| format!("读取CSV行失败: {}", e))?;
                count += 1;
                if count > *threshold {
                    return Ok(Some(WarningItem {
                        id: rule.id.clone(),
                        title: rule.title.clone(),
                        severity: rule.severity.clone(),
                        summary: rule.summary.clone(),
                        details: format!("行数 {} > {}. {}", count, threshold, rule.details),
                        evidence: vec![target.to_string_lossy().to_string()],
                        source: format!("规则: {}", rule.id),
                        created_at: Utc::now().timestamp_millis(),
                        ..Default::default()
                    }));
                }
            }

            Ok(None)
        }
        RuleKind::TextFileContains { regexes, regex } => {
            if !target.exists() {
                return Ok(None);
            }

            let mut normalized: Vec<String> = regexes.clone();
            if normalized.is_empty() && !regex.trim().is_empty() {
                normalized.push(regex.clone());
            }
            normalized.retain(|r| !r.trim().is_empty());
            if normalized.is_empty() {
                return Ok(None);
            }

            let mut compiled: Vec<Regex> = Vec::new();
            for r in normalized {
                compiled.push(Regex::new(&r).map_err(|e| format!("正则错误: {}", e))?);
            }
            let content =
                fs::read_to_string(&target).map_err(|e| format!("读取文件失败: {}", e))?;

            let mut evidence: Vec<String> = Vec::new();
            evidence.push(target.to_string_lossy().to_string());
            for (idx, re) in compiled.iter().enumerate() {
                if re.is_match(&content) {
                    evidence.push(format!("matched regex[{}]", idx));
                }
            }

            if evidence.len() > 1 {
                return Ok(Some(WarningItem {
                    id: rule.id.clone(),
                    title: rule.title.clone(),
                    severity: rule.severity.clone(),
                    summary: rule.summary.clone(),
                    details: rule.details.clone(),
                    evidence,
                    source: format!("规则: {}", rule.id),
                    created_at: Utc::now().timestamp_millis(),
                    ..Default::default()
                }));
            }

            Ok(None)
        }
    }
}

pub fn evaluate_warnings_from_settings() -> Result<Vec<WarningItem>, String> {
    let app_settings: AppSettings = settings::load_settings()?;
    if app_settings.output_path.is_empty() {
        return Err("output_path 未配置".to_string());
    }

    let mut warnings: Vec<WarningItem> = Vec::new();

    let output_dir = Path::new(&app_settings.output_path);
    let output_entries: Vec<String> = if output_dir.exists() {
        fs::read_dir(output_dir)
            .ok()
            .map(|entries| {
                entries
                    .filter_map(|e| e.ok())
                    .filter(|e| e.path().is_file())
                    .filter_map(|e| {
                        e.path()
                            .file_name()
                            .map(|n| n.to_string_lossy().to_string())
                    })
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default()
    } else {
        Vec::new()
    };

    // 读取告警目录下的 *_warning.json（每个文件一份规则），即使 output_path 中缺少目标文件，也能触发 FileExists 等规则
    let warning_dir = effective_warning_dir(&app_settings);
    let mut all_rules: Vec<WarningRule> = Vec::new();

    if let Ok(entries) = fs::read_dir(&warning_dir) {
        for entry in entries {
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let file_name = match path.file_name() {
                Some(n) => n.to_string_lossy().to_string(),
                None => continue,
            };
            if !file_name.ends_with("_warning.json") {
                continue;
            }

            let inferred_stem = file_name.trim_end_matches("_warning.json").to_string();

            let inferred_target = output_entries
                .iter()
                .find(|n| {
                    Path::new(n)
                        .file_stem()
                        .map(|s| s.to_string_lossy().eq_ignore_ascii_case(&inferred_stem))
                        .unwrap_or(false)
                })
                .cloned()
                .unwrap_or_else(|| format!("{}.csv", inferred_stem));

            let content = match fs::read_to_string(&path) {
                Ok(c) => c,
                Err(_) => continue,
            };

            let mut rules: Vec<WarningRule> = match serde_json::from_str(&content) {
                Ok(r) => r,
                Err(e) => {
                    warnings.push(WarningItem {
                        id: format!("parse-error-{}", file_name),
                        title: format!("规则文件解析失败: {}", file_name),
                        severity: "low".to_string(),
                        summary: e.to_string(),
                        details: String::new(),
                        evidence: vec![path.to_string_lossy().to_string()],
                        source: "规则引擎".to_string(),
                        created_at: Utc::now().timestamp_millis(),
                        ..Default::default()
                    });
                    Vec::new()
                }
            };

            for r in &mut rules {
                // 兼容旧规则：早期版本可能没填 file（用于确定 output_path 下的目标文件）
                if r.file.trim().is_empty() {
                    r.file = inferred_target.clone();
                }
            }

            all_rules.extend(rules);
        }
    }

    // 合并内置规则库：用户外置规则中存在同 id 时，外置覆盖内置；
    // 全局开关与单条停用在 enabled_builtin_rules 内已处理。
    let external_ids: std::collections::HashSet<String> =
        all_rules.iter().map(|r| r.id.clone()).collect();
    let mut builtin_ids: std::collections::HashSet<String> = std::collections::HashSet::new();
    for r in crate::builtin_warnings::enabled_builtin_rules(&app_settings) {
        if external_ids.contains(&r.id) {
            continue; // 已被同 id 外置规则覆盖
        }
        builtin_ids.insert(r.id.clone());
        all_rules.push(r);
    }

    for rule in all_rules {
        if rule.file.trim().is_empty() {
            continue;
        }
        match evaluate_rule(&app_settings.output_path, &rule) {
            Ok(Some(mut item)) => {
                // 标记内置来源，便于前端区分展示（外置覆盖项不在 builtin_ids 内，保持"规则:"来源）
                if builtin_ids.contains(&rule.id) {
                    item.source = format!("内置规则: {}", rule.id);
                }
                warnings.push(item);
            }
            Ok(None) => {}
            Err(e) => {
                warnings.push(WarningItem {
                    id: format!("{}-error", rule.id),
                    title: format!("规则执行失败: {}", rule.id),
                    severity: "low".to_string(),
                    summary: e.clone(),
                    details: String::new(),
                    evidence: vec![format!("file={}", rule.file)],
                    source: "规则引擎".to_string(),
                    created_at: Utc::now().timestamp_millis(),
                    ..Default::default()
                });
            }
        }
    }

    Ok(warnings)
}

#[tauri::command]
pub async fn load_warning_rules_command(file: String) -> Result<Vec<WarningRule>, String> {
    load_warning_rules_for_file(&file)
}

#[tauri::command]
pub async fn save_warning_rules_command(
    file: String,
    rules: Vec<WarningRule>,
) -> Result<(), String> {
    save_warning_rules_for_file(&file, rules)
}

#[tauri::command]
pub async fn evaluate_warnings_command() -> Result<Vec<WarningItem>, String> {
    evaluate_warnings_from_settings()
}
