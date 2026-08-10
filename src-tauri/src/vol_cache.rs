//! Volatility 插件结果缓存
//!
//! 按 `(镜像标识 + 引擎 + 插件 + 参数)` 缓存 Vol2/Vol3 插件执行结果，避免对同一
//! 镜像重复执行同一插件时反复启动 Python（动辄数分钟）。缓存持久化于
//! `<app_data_dir>/vol_cache.db`（SQLite），跨会话有效。
//!
//! 镜像标识采用 `路径 + 文件大小 + 修改时间`，避免对 10GB+ 镜像做全量哈希。
//! 命中时会校验缓存记录指向的输出文件仍存在，否则视为未命中并清理该条目。

use rusqlite::{Connection, params};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

/// 缓存库文件路径：`<app_data_dir>/vol_cache.db`
fn cache_db_path() -> Result<PathBuf, String> {
    Ok(crate::settings::get_app_data_dir()?.join("vol_cache.db"))
}

/// 打开缓存库并确保表结构存在
fn open_db() -> Result<Connection, String> {
    let path = cache_db_path()?;
    let conn = Connection::open(&path).map_err(|e| format!("打开缓存库失败: {}", e))?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS plugin_cache (
            cache_key   TEXT PRIMARY KEY,
            image_key   TEXT NOT NULL,
            engine      TEXT NOT NULL,
            plugin      TEXT NOT NULL,
            args        TEXT NOT NULL,
            output_type TEXT NOT NULL,
            output_file TEXT NOT NULL,
            stdout      TEXT NOT NULL,
            stderr      TEXT NOT NULL,
            created_at  INTEGER NOT NULL
        );",
    )
    .map_err(|e| format!("初始化缓存表失败: {}", e))?;
    Ok(conn)
}

/// 读取设置判断缓存是否启用（读取失败时默认启用，与设置默认值一致）
pub fn is_cache_enabled() -> bool {
    crate::settings::load_settings()
        .map(|s| s.vol_cache_enabled)
        .unwrap_or(true)
}

/// 由镜像路径计算稳定标识：`路径|大小|修改时间`（避免全量哈希）
pub fn compute_image_key(image_path: &str) -> String {
    match std::fs::metadata(image_path) {
        Ok(meta) => {
            let size = meta.len();
            let mtime = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);
            format!("{}|{}|{}", image_path, size, mtime)
        }
        // 取不到元数据时退化为路径本身，仍可作为 key（只是无法感知内容变化）
        Err(_) => image_path.to_string(),
    }
}

/// 计算缓存 key = sha256(image_key + engine + plugin + args)
pub fn compute_cache_key(image_key: &str, engine: &str, plugin: &str, args: &str) -> String {
    let mut hasher = Sha256::new();
    for part in [image_key, engine, plugin, args] {
        hasher.update(part.as_bytes());
        hasher.update([0u8]);
    }
    format!("{:x}", hasher.finalize())
}

/// 缓存命中的结果条目
pub struct CachedEntry {
    pub output_type: String,
    pub output_file: String,
    pub stdout: String,
    pub stderr: String,
}

/// 查询缓存。命中但输出文件已丢失时，清理该条目并返回 None。
pub fn get_cached(cache_key: &str) -> Option<CachedEntry> {
    let conn = open_db().ok()?;
    let entry = conn
        .query_row(
            "SELECT output_type, output_file, stdout, stderr \
             FROM plugin_cache WHERE cache_key = ?1",
            params![cache_key],
            |r| {
                Ok(CachedEntry {
                    output_type: r.get(0)?,
                    output_file: r.get(1)?,
                    stdout: r.get(2)?,
                    stderr: r.get(3)?,
                })
            },
        )
        .ok()?;

    // 输出文件已被删除/移动 -> 缓存失效，清理后按未命中处理
    if !entry.output_file.is_empty() && !Path::new(&entry.output_file).exists() {
        let _ = conn.execute(
            "DELETE FROM plugin_cache WHERE cache_key = ?1",
            params![cache_key],
        );
        return None;
    }
    Some(entry)
}

/// 写入/更新缓存条目
#[allow(clippy::too_many_arguments)]
pub fn store_cache(
    cache_key: &str,
    image_key: &str,
    engine: &str,
    plugin: &str,
    args: &str,
    output_type: &str,
    output_file: &str,
    stdout: &str,
    stderr: &str,
) -> Result<(), String> {
    let conn = open_db()?;
    let created_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    conn.execute(
        "INSERT OR REPLACE INTO plugin_cache \
         (cache_key, image_key, engine, plugin, args, output_type, output_file, stdout, stderr, created_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            cache_key, image_key, engine, plugin, args, output_type, output_file, stdout, stderr,
            created_at
        ],
    )
    .map_err(|e| format!("写入缓存失败: {}", e))?;
    Ok(())
}

/// 缓存统计信息
#[derive(serde::Serialize)]
pub struct VolCacheStats {
    pub entries: i64,
    pub db_size_bytes: u64,
    pub db_path: String,
}

/// 清空所有插件结果缓存，返回被删除的条目数
#[tauri::command]
pub async fn clear_vol_cache() -> Result<usize, String> {
    let conn = open_db()?;
    let deleted = conn
        .execute("DELETE FROM plugin_cache", [])
        .map_err(|e| format!("清空缓存失败: {}", e))?;
    Ok(deleted)
}

/// 获取缓存统计（条目数、库大小、库路径）
#[tauri::command]
pub async fn get_vol_cache_stats() -> Result<VolCacheStats, String> {
    let path = cache_db_path()?;
    let conn = open_db()?;
    let entries: i64 = conn
        .query_row("SELECT COUNT(*) FROM plugin_cache", [], |r| r.get(0))
        .map_err(|e| format!("读取缓存统计失败: {}", e))?;
    let db_size_bytes = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
    Ok(VolCacheStats {
        entries,
        db_size_bytes,
        db_path: path.to_string_lossy().to_string(),
    })
}
