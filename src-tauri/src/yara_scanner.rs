use lazy_static::lazy_static;
use memmap2::MmapOptions;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Instant;
use tauri::Emitter;
use tokio::sync::mpsc;

lazy_static! {
    static ref YARA_CANCEL_FLAG: Arc<AtomicBool> = Arc::new(AtomicBool::new(false));
}

/// YARA 扫描配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YaraConfig {
    /// 规则文件路径列表
    pub rule_paths: Vec<String>,
    /// 内联规则内容（可选）
    pub rule_content: Option<String>,
    /// 扫描目标文件路径
    pub target_path: String,
}

/// YARA 匹配的字符串
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YaraStringMatch {
    /// 标识符（如 $s1, $hex_string）
    pub identifier: String,
    /// 匹配偏移量
    pub offset: u64,
    /// 匹配数据（十六进制）
    pub matched_data_hex: String,
    /// 匹配长度
    pub length: usize,
}

/// YARA 规则匹配结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YaraRuleMatch {
    /// 规则名称
    pub rule_name: String,
    /// 规则命名空间
    pub namespace: String,
    /// 规则标签
    pub tags: Vec<String>,
    /// 元数据
    pub metadata: HashMap<String, String>,
    /// 匹配的字符串列表
    pub matched_strings: Vec<YaraStringMatch>,
}

/// YARA 扫描结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YaraScanResult {
    /// 匹配的规则列表
    pub matches: Vec<YaraRuleMatch>,
    /// 扫描统计
    pub stats: YaraScanStats,
}

/// YARA 扫描统计
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YaraScanStats {
    /// 加载的规则数量
    pub rules_loaded: usize,
    /// 匹配的规则数量
    pub rules_matched: usize,
    /// 匹配的字符串总数
    pub strings_matched: usize,
    /// 扫描耗时（毫秒）
    pub duration_ms: u64,
    /// 扫描的文件大小（字节）
    pub file_size: u64,
}

/// YARA 扫描进度
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YaraScanProgress {
    pub status: String,
    pub completed: bool,
    pub rules_loaded: usize,
    pub matches_found: usize,
}

/// 验证 YARA 规则文件
#[tauri::command]
pub async fn yara_validate_rules(rule_paths: Vec<String>) -> Result<String, String> {
    let mut compiler = yara_x::Compiler::new();

    for path in &rule_paths {
        let p = Path::new(path);
        if !p.exists() {
            return Err(format!("规则文件不存在: {}", path));
        }

        if p.is_dir() {
            // 目录：加载所有 .yar/.yara 文件
            let entries = fs::read_dir(p).map_err(|e| format!("无法读取目录 {}: {}", path, e))?;
            for entry in entries.flatten() {
                let ep = entry.path();
                if let Some(ext) = ep.extension() {
                    let ext = ext.to_string_lossy().to_lowercase();
                    if ext == "yar" || ext == "yara" {
                        let content = fs::read_to_string(&ep)
                            .map_err(|e| format!("无法读取 {}: {}", ep.display(), e))?;
                        compiler
                            .add_source(content.as_str())
                            .map_err(|e| format!("规则编译错误 ({}): {}", ep.display(), e))?;
                    }
                }
            }
        } else {
            let content = fs::read_to_string(p).map_err(|e| format!("无法读取 {}: {}", path, e))?;
            compiler
                .add_source(content.as_str())
                .map_err(|e| format!("规则编译错误 ({}): {}", path, e))?;
        }
    }

    let rules = compiler.build();
    Ok(format!("验证通过，共 {} 条规则", rules.iter().count()))
}

/// 内部消息：blocking 线程 → tokio 异步任务
enum YaraMsg {
    Progress(YaraScanProgress),
    Batch(YaraRuleMatch),
    Completed(YaraScanResult),
    Error(String),
}

/// 执行 YARA 扫描（后台异步，结果通过事件逐条推送）
#[tauri::command]
pub async fn yara_scan(app: tauri::AppHandle, config: YaraConfig) -> Result<(), String> {
    YARA_CANCEL_FLAG.store(false, Ordering::SeqCst);

    // 先验证
    for path in &config.rule_paths {
        if !Path::new(path).exists() {
            return Err(format!("规则文件不存在: {}", path));
        }
    }
    if !Path::new(&config.target_path).exists() {
        return Err(format!("目标文件不存在: {}", config.target_path));
    }

    // 通道：blocking 线程发送，tokio 任务接收并 emit（带 yield）
    let (tx, mut rx) = mpsc::unbounded_channel::<YaraMsg>();

    // 接收端：逐条 emit，每条之间 yield 让前端有机会渲染
    let app_emitter = app.clone();
    tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            match msg {
                YaraMsg::Progress(p) => {
                    let _ = app_emitter.emit("yara-scan-progress", &p);
                }
                YaraMsg::Batch(rule) => {
                    let _ = app_emitter.emit("yara-scan-batch", &rule);
                    // 短暂让出，确保前端事件循环有机会处理并渲染
                    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
                }
                YaraMsg::Completed(r) => {
                    let _ = app_emitter.emit("yara-scan-completed", &r);
                }
                YaraMsg::Error(e) => {
                    let _ = app_emitter.emit("yara-scan-error", &e);
                }
            }
        }
    });

    // blocking 线程做实际扫描
    tokio::task::spawn_blocking(move || {
        let start = Instant::now();

        let _ = tx.send(YaraMsg::Progress(YaraScanProgress {
            status: "正在编译 YARA 规则...".into(),
            completed: false,
            rules_loaded: 0,
            matches_found: 0,
        }));

        // 编译规则
        let mut compiler = yara_x::Compiler::new();
        if let Some(ref content) = config.rule_content {
            if !content.trim().is_empty() {
                if let Err(e) = compiler.add_source(content.as_str()) {
                    let _ = tx.send(YaraMsg::Error(format!("内联规则编译错误: {}", e)));
                    return;
                }
            }
        }
        for path in &config.rule_paths {
            let p = Path::new(path);
            if p.is_dir() {
                if let Err(e) = load_rules_from_dir(&mut compiler, p) {
                    let _ = tx.send(YaraMsg::Error(e));
                    return;
                }
            } else {
                match fs::read_to_string(p) {
                    Ok(content) => {
                        if let Err(e) = compiler.add_source(content.as_str()) {
                            let _ =
                                tx.send(YaraMsg::Error(format!("规则编译错误 ({}): {}", path, e)));
                            return;
                        }
                    }
                    Err(e) => {
                        let _ = tx.send(YaraMsg::Error(format!("无法读取 {}: {}", path, e)));
                        return;
                    }
                }
            }
        }

        let rules = compiler.build();
        let rules_count = rules.iter().count();

        let _ = tx.send(YaraMsg::Progress(YaraScanProgress {
            status: format!("已加载 {} 条规则，开始扫描...", rules_count),
            completed: false,
            rules_loaded: rules_count,
            matches_found: 0,
        }));

        if YARA_CANCEL_FLAG.load(Ordering::SeqCst) {
            let _ = tx.send(YaraMsg::Error("扫描已取消".into()));
            return;
        }

        // mmap
        let file = match fs::File::open(&config.target_path) {
            Ok(f) => f,
            Err(e) => {
                let _ = tx.send(YaraMsg::Error(format!("无法打开文件: {}", e)));
                return;
            }
        };
        let file_size = file.metadata().map(|m| m.len()).unwrap_or(0);
        let mmap = match unsafe { MmapOptions::new().map(&file) } {
            Ok(m) => m,
            Err(e) => {
                let _ = tx.send(YaraMsg::Error(format!("内存映射失败: {}", e)));
                return;
            }
        };

        let _ = tx.send(YaraMsg::Progress(YaraScanProgress {
            status: format!("正在扫描 {}...", format_file_size(file_size)),
            completed: false,
            rules_loaded: rules_count,
            matches_found: 0,
        }));

        // 扫描（阻塞）
        let mut scanner = yara_x::Scanner::new(&rules);
        let scan_results = match scanner.scan(&mmap[..]) {
            Ok(r) => r,
            Err(e) => {
                let _ = tx.send(YaraMsg::Error(format!("YARA 扫描失败: {}", e)));
                return;
            }
        };

        if YARA_CANCEL_FLAG.load(Ordering::SeqCst) {
            let _ = tx.send(YaraMsg::Error("扫描已取消".into()));
            return;
        }

        // 逐条规则发送到通道（由 tokio 任务逐条 emit + yield）
        let mut matches: Vec<YaraRuleMatch> = Vec::new();
        let mut total_strings = 0;

        for rule_match in scan_results.matching_rules() {
            let mut metadata = HashMap::new();
            for (ident, value) in rule_match.metadata() {
                let value_str = match value {
                    yara_x::MetaValue::Integer(v) => v.to_string(),
                    yara_x::MetaValue::Float(v) => v.to_string(),
                    yara_x::MetaValue::Bool(v) => v.to_string(),
                    yara_x::MetaValue::String(v) => v.to_string(),
                    yara_x::MetaValue::Bytes(v) => hex::encode(v),
                };
                metadata.insert(ident.to_string(), value_str);
            }

            let rule_name = rule_match.identifier().to_string();
            let mut matched_strings = Vec::new();
            for pattern in rule_match.patterns() {
                for m in pattern.matches() {
                    let data = &mmap[m.range()];
                    let data_hex = if data.len() <= 64 {
                        hex::encode(data)
                    } else {
                        format!("{}...", hex::encode(&data[..64]))
                    };
                    matched_strings.push(YaraStringMatch {
                        identifier: pattern.identifier().to_string(),
                        offset: m.range().start as u64,
                        matched_data_hex: data_hex,
                        length: m.range().len(),
                    });
                    total_strings += 1;
                }
            }

            let tags: Vec<String> = rule_match
                .tags()
                .map(|t| t.identifier().to_string())
                .collect();
            let rule_result = YaraRuleMatch {
                rule_name,
                namespace: rule_match.namespace().to_string(),
                tags,
                metadata,
                matched_strings,
            };

            if !rule_result.matched_strings.is_empty() {
                let _ = tx.send(YaraMsg::Batch(rule_result.clone()));
            }
            matches.push(rule_result);
        }

        let duration_ms = start.elapsed().as_millis() as u64;
        let _ = tx.send(YaraMsg::Completed(YaraScanResult {
            stats: YaraScanStats {
                rules_loaded: rules_count,
                rules_matched: matches.len(),
                strings_matched: total_strings,
                duration_ms,
                file_size,
            },
            matches,
        }));
    });

    Ok(())
}

/// 停止 YARA 扫描
#[tauri::command]
pub async fn yara_stop_scan() -> Result<(), String> {
    YARA_CANCEL_FLAG.store(true, Ordering::SeqCst);
    Ok(())
}

/// 递归加载目录中的 YARA 规则
fn load_rules_from_dir(compiler: &mut yara_x::Compiler, dir: &Path) -> Result<(), String> {
    let entries =
        fs::read_dir(dir).map_err(|e| format!("无法读取目录 {}: {}", dir.display(), e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            load_rules_from_dir(compiler, &path)?;
        } else if let Some(ext) = path.extension() {
            let ext = ext.to_string_lossy().to_lowercase();
            if ext == "yar" || ext == "yara" {
                let content = fs::read_to_string(&path)
                    .map_err(|e| format!("无法读取 {}: {}", path.display(), e))?;
                compiler
                    .add_source(content.as_str())
                    .map_err(|e| format!("规则编译错误 ({}): {}", path.display(), e))?;
            }
        }
    }
    Ok(())
}

/// 格式化文件大小
fn format_file_size(size: u64) -> String {
    if size >= 1024 * 1024 * 1024 {
        format!("{:.1} GB", size as f64 / (1024.0 * 1024.0 * 1024.0))
    } else if size >= 1024 * 1024 {
        format!("{:.1} MB", size as f64 / (1024.0 * 1024.0))
    } else if size >= 1024 {
        format!("{:.1} KB", size as f64 / 1024.0)
    } else {
        format!("{} B", size)
    }
}
