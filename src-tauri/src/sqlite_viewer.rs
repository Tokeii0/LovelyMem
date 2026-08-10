//! SQLite 查看器
//!
//! 以**只读**方式打开任意 SQLite 数据库（微信解密产物、浏览器 History/Cookies/
//! LoginData 等），提供表列表与只读查询能力，并内置常见浏览器取证预设查询。
//!
//! 安全约束：
//! - 使用 `OpenFlags::SQLITE_OPEN_READ_ONLY` 打开，物理层面禁止写入；
//! - `sqlite_query` 只接受单条 SELECT / PRAGMA / WITH / EXPLAIN 语句，拒绝多语句与写操作。

use rusqlite::types::Value as SqlValue;
use rusqlite::{Connection, OpenFlags};
use serde::Serialize;
use serde_json::json;
use tauri::{WebviewUrl, WebviewWindowBuilder};

/// 单次查询返回的最大行数（防止一次性拉爆前端）
const DEFAULT_QUERY_LIMIT: usize = 5000;

/// 表/视图信息
#[derive(Serialize)]
pub struct SqliteTableInfo {
    pub name: String,
    /// "table" | "view"
    pub kind: String,
    pub row_count: i64,
}

/// 查询结果
#[derive(Serialize)]
pub struct SqliteQueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<serde_json::Value>>,
    /// 是否因超过 limit 被截断
    pub truncated: bool,
    pub row_count: usize,
}

/// 以只读方式打开数据库
fn open_readonly(db_path: &str) -> Result<Connection, String> {
    if !std::path::Path::new(db_path).exists() {
        return Err(format!("数据库文件不存在: {}", db_path));
    }
    Connection::open_with_flags(
        db_path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|e| format!("打开数据库失败（可能被占用或非法 SQLite 文件）: {}", e))
}

/// 将 rusqlite 值转换为 JSON（BLOB 以 `[BLOB N bytes]` 占位，避免超大二进制拖垮前端）
fn value_to_json(v: SqlValue) -> serde_json::Value {
    match v {
        SqlValue::Null => serde_json::Value::Null,
        SqlValue::Integer(i) => json!(i),
        SqlValue::Real(f) => json!(f),
        SqlValue::Text(s) => json!(s),
        SqlValue::Blob(b) => json!(format!("[BLOB {} bytes]", b.len())),
    }
}

/// 校验 SQL 为单条只读语句
fn ensure_readonly_sql(sql: &str) -> Result<(), String> {
    let trimmed = sql.trim().trim_end_matches(';').trim();
    if trimmed.is_empty() {
        return Err("SQL 语句为空".to_string());
    }
    // 拒绝多语句（去掉尾分号后不应再含分号）
    if trimmed.contains(';') {
        return Err("仅允许执行单条语句".to_string());
    }
    let first = trimmed
        .split_whitespace()
        .next()
        .unwrap_or("")
        .to_lowercase();
    match first.as_str() {
        "select" | "pragma" | "with" | "explain" => Ok(()),
        _ => Err(format!(
            "只读模式仅支持 SELECT / WITH / PRAGMA / EXPLAIN，已拒绝: {}",
            first
        )),
    }
}

/// 列出数据库中的表与视图（含行数）
#[tauri::command]
pub async fn sqlite_list_tables(db_path: String) -> Result<Vec<SqliteTableInfo>, String> {
    let conn = open_readonly(&db_path)?;
    let mut stmt = conn
        .prepare(
            "SELECT name, type FROM sqlite_master \
             WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' \
             ORDER BY type, name",
        )
        .map_err(|e| format!("读取表结构失败: {}", e))?;

    let rows: Vec<(String, String)> = stmt
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(|e| format!("枚举表失败: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    let mut result = Vec::with_capacity(rows.len());
    for (name, kind) in rows {
        // 表名来自 sqlite_master，用双引号转义防注入
        let count_sql = format!("SELECT COUNT(*) FROM \"{}\"", name.replace('"', "\"\""));
        let row_count: i64 = conn.query_row(&count_sql, [], |r| r.get(0)).unwrap_or(-1);
        result.push(SqliteTableInfo {
            name,
            kind,
            row_count,
        });
    }
    Ok(result)
}

/// 执行只读查询
#[tauri::command]
pub async fn sqlite_query(
    db_path: String,
    sql: String,
    limit: Option<usize>,
) -> Result<SqliteQueryResult, String> {
    ensure_readonly_sql(&sql)?;
    let limit = limit.unwrap_or(DEFAULT_QUERY_LIMIT).max(1);

    let conn = open_readonly(&db_path)?;
    let mut stmt = conn
        .prepare(sql.trim().trim_end_matches(';'))
        .map_err(|e| format!("SQL 语法错误: {}", e))?;

    let columns: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
    let col_count = columns.len();

    let mut rows_iter = stmt.query([]).map_err(|e| format!("执行查询失败: {}", e))?;

    let mut rows: Vec<Vec<serde_json::Value>> = Vec::new();
    let mut truncated = false;
    while let Some(row) = rows_iter.next().map_err(|e| format!("读取行失败: {}", e))? {
        if rows.len() >= limit {
            truncated = true;
            break;
        }
        let mut out = Vec::with_capacity(col_count);
        for i in 0..col_count {
            let v: SqlValue = row.get(i).unwrap_or(SqlValue::Null);
            out.push(value_to_json(v));
        }
        rows.push(out);
    }

    let row_count = rows.len();
    Ok(SqliteQueryResult {
        columns,
        rows,
        truncated,
        row_count,
    })
}

/// 打开 SQLite 查看器窗口，数据库路径通过 URL 查询参数 `?db=` 传入
#[tauri::command]
pub async fn open_sqlite_viewer_window(
    app: tauri::AppHandle,
    db_path: String,
) -> Result<(), String> {
    let window_id = uuid::Uuid::new_v4().to_string().replace('-', "")[..16].to_string();
    let window_label = format!("sqlite-viewer-{}", window_id);

    let encoded = urlencoding::encode(&db_path);
    let url = format!("sqlite-viewer.html?db={}", encoded);

    let title = std::path::Path::new(&db_path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "SQLite 查看器".to_string());

    WebviewWindowBuilder::new(&app, &window_label, WebviewUrl::App(url.into()))
        .title(format!("SQLite 查看器 - {}", title))
        .inner_size(1300.0, 850.0)
        .min_inner_size(900.0, 600.0)
        .center()
        .resizable(true)
        .maximizable(true)
        .decorations(crate::window_manager::should_use_decorations())
        .focused(true)
        .skip_taskbar(false)
        .build()
        .map_err(|e| format!("创建 SQLite 查看器窗口失败: {}", e))?;

    Ok(())
}
