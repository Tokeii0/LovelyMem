//! 搜索工具

use super::Tool;
use crate::ai_v2::types::{ConcurrencySafety, ToolCallResult, ToolContext, ValidationResult};
use async_trait::async_trait;
use regex::Regex;
use std::path::Path;
use tokio::fs;

/// 文件内搜索工具
pub struct SearchInFileTool;

#[async_trait]
impl Tool for SearchInFileTool {
    fn id(&self) -> &str {
        "search_in_file"
    }

    fn name(&self) -> &str {
        "search_in_file"
    }

    fn description(&self) -> &str {
        "在指定文件中搜索关键词或正则表达式，返回匹配的行及其上下文。"
    }

    fn concurrency_safety(&self) -> ConcurrencySafety {
        ConcurrencySafety::Safe
    }

    fn is_read_only(&self) -> bool {
        true
    }

    fn validate_input(&self, args: &serde_json::Value) -> ValidationResult {
        if args["filename"].as_str().unwrap_or("").is_empty() {
            return ValidationResult::Invalid {
                message: "未指定搜索的文件名".to_string(),
            };
        }
        if args["search_term"].as_str().unwrap_or("").is_empty() {
            return ValidationResult::Invalid {
                message: "未指定搜索关键词".to_string(),
            };
        }
        ValidationResult::Valid
    }

    fn activity_description(&self, args: &serde_json::Value) -> String {
        let term = args["search_term"].as_str().unwrap_or("关键词");
        let file = args["filename"].as_str().unwrap_or("文件");
        format!("正在搜索 {} 中的 \"{}\"", file, term)
    }

    fn parameters(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "filename": {
                    "type": "string",
                    "description": "要搜索的文件名"
                },
                "search_term": {
                    "type": "string",
                    "description": "搜索词或正则表达式"
                },
                "context_lines": {
                    "type": "integer",
                    "description": "返回匹配行前后的上下文行数，默认2"
                },
                "use_regex": {
                    "type": "boolean",
                    "description": "是否使用正则表达式"
                },
                "case_insensitive": {
                    "type": "boolean",
                    "description": "是否忽略大小写，默认true"
                },
                "max_results": {
                    "type": "integer",
                    "description": "最多返回多少个匹配结果，默认50"
                }
            },
            "required": ["filename", "search_term"]
        })
    }

    async fn execute(&self, args: serde_json::Value, ctx: &ToolContext) -> ToolCallResult {
        let filename = args["filename"].as_str().unwrap_or("");
        let search_term = args["search_term"].as_str().unwrap_or("");
        let context_lines = args["context_lines"].as_u64().unwrap_or(2) as usize;
        let use_regex = args["use_regex"].as_bool().unwrap_or(false);
        let case_insensitive = args["case_insensitive"].as_bool().unwrap_or(true);
        let max_results = args["max_results"].as_u64().unwrap_or(50) as usize;

        if filename.is_empty() || search_term.is_empty() {
            return ToolCallResult {
                call_id: String::new(),
                name: self.name().to_string(),
                output: "错误: 文件名和搜索词都是必需的".to_string(),
                success: false,
                metadata: None,
                duration_ms: 0,
                truncated: false,
            };
        }

        let file_path = if Path::new(filename).is_absolute() {
            filename.to_string()
        } else {
            format!("{}/{}", ctx.output_path, filename)
        };

        match fs::read_to_string(&file_path).await {
            Ok(content) => {
                let lines: Vec<&str> = content.lines().collect();
                let mut matches = Vec::new();

                // 构建匹配器
                let pattern = if use_regex {
                    if case_insensitive {
                        format!("(?i){}", search_term)
                    } else {
                        search_term.to_string()
                    }
                } else {
                    if case_insensitive {
                        format!("(?i){}", regex::escape(search_term))
                    } else {
                        regex::escape(search_term)
                    }
                };

                let regex = match Regex::new(&pattern) {
                    Ok(r) => r,
                    Err(e) => {
                        return ToolCallResult {
                            call_id: String::new(),
                            name: self.name().to_string(),
                            output: format!("正则表达式错误: {}", e),
                            success: false,
                            metadata: None,
                            duration_ms: 0,
                            truncated: false,
                        };
                    }
                };

                // 搜索匹配行
                for (line_num, line) in lines.iter().enumerate() {
                    if regex.is_match(line) {
                        if matches.len() >= max_results {
                            break;
                        }

                        // 获取上下文
                        let start = line_num.saturating_sub(context_lines);
                        let end = (line_num + context_lines + 1).min(lines.len());

                        let context: Vec<String> = (start..end)
                            .map(|i| {
                                let prefix = if i == line_num { ">>> " } else { "    " };
                                format!("{}{:5}| {}", prefix, i + 1, lines[i])
                            })
                            .collect();

                        matches.push(format!(
                            "--- 匹配 #{} (行 {}) ---\n{}",
                            matches.len() + 1,
                            line_num + 1,
                            context.join("\n")
                        ));
                    }
                }

                if matches.is_empty() {
                    return ToolCallResult {
                        call_id: String::new(),
                        name: self.name().to_string(),
                        output: format!("在文件 '{}' 中未找到 '{}'", filename, search_term),
                        success: true,
                        metadata: Some(serde_json::json!({ "match_count": 0 })),
                        duration_ms: 0,
                        truncated: false,
                    };
                }

                let total_matches = matches.len();
                let output = format!(
                    "在 '{}' 中找到 {} 个匹配:\n\n{}",
                    filename,
                    total_matches,
                    matches.join("\n\n")
                );

                ToolCallResult {
                    call_id: String::new(),
                    name: self.name().to_string(),
                    output,
                    success: true,
                    metadata: Some(serde_json::json!({ "match_count": total_matches })),
                    duration_ms: 0,
                    truncated: false,
                }
            }
            Err(e) => ToolCallResult {
                call_id: String::new(),
                name: self.name().to_string(),
                output: format!("读取文件失败: {}", e),
                success: false,
                metadata: None,
                duration_ms: 0,
                truncated: false,
            },
        }
    }
}

/// 多文件搜索工具 (grep)
pub struct GrepFilesTool;

#[async_trait]
impl Tool for GrepFilesTool {
    fn id(&self) -> &str {
        "grep_files"
    }

    fn name(&self) -> &str {
        "grep_files"
    }

    fn description(&self) -> &str {
        "在多个文件中搜索文本，支持glob模式匹配文件。类似于grep命令。"
    }

    fn concurrency_safety(&self) -> ConcurrencySafety {
        ConcurrencySafety::Safe
    }

    fn is_read_only(&self) -> bool {
        true
    }

    fn activity_description(&self, args: &serde_json::Value) -> String {
        let pattern = args["search_term"].as_str().unwrap_or("关键词");
        format!("正在跨文件搜索 \"{}\"", pattern)
    }

    fn parameters(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "directory": {
                    "type": "string",
                    "description": "搜索的目录"
                },
                "query": {
                    "type": "string",
                    "description": "搜索内容"
                },
                "pattern": {
                    "type": "string",
                    "description": "文件匹配模式（如 *.txt, *.csv）"
                },
                "recursive": {
                    "type": "boolean",
                    "description": "是否递归搜索子目录，默认true"
                },
                "max_results": {
                    "type": "integer",
                    "description": "最大结果数，默认100"
                }
            },
            "required": ["query"]
        })
    }

    async fn execute(&self, args: serde_json::Value, ctx: &ToolContext) -> ToolCallResult {
        let directory = args["directory"].as_str().unwrap_or(&ctx.output_path);
        let query = args["query"].as_str().unwrap_or("");
        let pattern = args["pattern"].as_str();
        let recursive = args["recursive"].as_bool().unwrap_or(true);
        let max_results = args["max_results"].as_u64().unwrap_or(100) as usize;

        if query.is_empty() {
            return ToolCallResult {
                call_id: String::new(),
                name: self.name().to_string(),
                output: "错误: 搜索内容不能为空".to_string(),
                success: false,
                metadata: None,
                duration_ms: 0,
                truncated: false,
            };
        }

        let dir_path = if Path::new(directory).is_absolute() {
            directory.to_string()
        } else {
            format!("{}/{}", ctx.output_path, directory)
        };

        let regex = match Regex::new(&format!("(?i){}", regex::escape(query))) {
            Ok(r) => r,
            Err(e) => {
                return ToolCallResult {
                    call_id: String::new(),
                    name: self.name().to_string(),
                    output: format!("正则表达式错误: {}", e),
                    success: false,
                    metadata: None,
                    duration_ms: 0,
                    truncated: false,
                };
            }
        };

        let mut results = Vec::new();
        let mut files_searched = 0;

        // 递归搜索目录
        grep_search_dir(
            &dir_path,
            &dir_path,
            &regex,
            pattern,
            recursive,
            max_results,
            &mut results,
            &mut files_searched,
        )
        .await;

        if results.is_empty() {
            return ToolCallResult {
                call_id: String::new(),
                name: self.name().to_string(),
                output: format!("在 {} 个文件中未找到 '{}'", files_searched, query),
                success: true,
                metadata: Some(serde_json::json!({
                    "match_count": 0,
                    "files_searched": files_searched
                })),
                duration_ms: 0,
                truncated: false,
            };
        }

        let output = format!(
            "在 {} 个文件中找到 {} 个匹配:\n{}",
            files_searched,
            results.len(),
            results.join("\n")
        );

        ToolCallResult {
            call_id: String::new(),
            name: self.name().to_string(),
            output,
            success: true,
            metadata: Some(serde_json::json!({
                "match_count": results.len(),
                "files_searched": files_searched
            })),
            duration_ms: 0,
            truncated: false,
        }
    }
}

/// 递归搜索目录中的文件
async fn grep_search_dir(
    base_dir: &str,
    current_dir: &str,
    regex: &Regex,
    pattern: Option<&str>,
    recursive: bool,
    max_results: usize,
    results: &mut Vec<String>,
    files_searched: &mut usize,
) {
    let mut entries = match fs::read_dir(current_dir).await {
        Ok(e) => e,
        Err(_) => return,
    };

    while let Ok(Some(entry)) = entries.next_entry().await {
        if results.len() >= max_results {
            break;
        }

        let path = entry.path();
        let is_dir = path.is_dir();

        // 递归进入子目录
        if is_dir && recursive {
            Box::pin(grep_search_dir(
                base_dir,
                &path.to_string_lossy(),
                regex,
                pattern,
                recursive,
                max_results,
                results,
                files_searched,
            ))
            .await;
            continue;
        }

        if !path.is_file() {
            continue;
        }

        let filename = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        // 检查文件模式
        if let Some(pat) = pattern {
            if !matches_glob(&filename, pat) {
                continue;
            }
        }

        *files_searched += 1;

        // 计算相对路径用于显示
        let rel_path = path
            .strip_prefix(base_dir)
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or(filename);

        // 搜索文件内容
        if let Ok(content) = fs::read_to_string(&path).await {
            for (line_num, line) in content.lines().enumerate() {
                if regex.is_match(line) {
                    if results.len() >= max_results {
                        break;
                    }
                    results.push(format!("{}:{}: {}", rel_path, line_num + 1, line.trim()));
                }
            }
        }
    }
}

/// 简单的glob匹配
fn matches_glob(name: &str, pattern: &str) -> bool {
    if pattern.starts_with("*.") {
        let ext = &pattern[1..];
        return name.ends_with(ext);
    }
    if pattern.ends_with("*") {
        let prefix = &pattern[..pattern.len() - 1];
        return name.starts_with(prefix);
    }
    name.contains(pattern)
}
