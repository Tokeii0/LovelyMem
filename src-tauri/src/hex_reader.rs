//! 十六进制查看器后端
//!
//! 提供按 `offset + length` 分块读取文件字节的能力，避免对大文件（如进程内存
//! dump、整镜像）一次性全量读入导致 OOM。配合前端虚拟滚动实现懒加载 Hex 视图。

use std::io::{Read, Seek, SeekFrom};
use tauri::{WebviewUrl, WebviewWindowBuilder};

/// 单次读取上限：4 MB（前端按页请求，足够覆盖一屏并预取）
const MAX_RANGE_LEN: u64 = 4 * 1024 * 1024;

/// 分块读取结果
#[derive(serde::Serialize)]
pub struct HexChunk {
    /// 实际起始偏移
    pub offset: u64,
    /// 本次读取到的字节（可能小于请求长度，如读到文件尾）
    pub bytes: Vec<u8>,
    /// 文件总大小
    pub total_size: u64,
}

/// 按 offset + length 读取文件字节
#[tauri::command]
pub async fn read_file_bytes_range(
    file_path: String,
    offset: u64,
    length: u64,
) -> Result<HexChunk, String> {
    let path = std::path::Path::new(&file_path);
    if !path.exists() {
        return Err(format!("文件不存在: {}", file_path));
    }
    let total_size = std::fs::metadata(path)
        .map_err(|e| format!("读取文件信息失败: {}", e))?
        .len();

    if offset >= total_size {
        return Ok(HexChunk {
            offset,
            bytes: Vec::new(),
            total_size,
        });
    }

    let len = length.min(MAX_RANGE_LEN).min(total_size - offset);

    let mut file = std::fs::File::open(path).map_err(|e| format!("打开文件失败: {}", e))?;
    file.seek(SeekFrom::Start(offset))
        .map_err(|e| format!("定位偏移失败: {}", e))?;

    let mut buf = vec![0u8; len as usize];
    let mut read_total = 0usize;
    // 循环读满，兼容部分读取
    while read_total < buf.len() {
        match file.read(&mut buf[read_total..]) {
            Ok(0) => break,
            Ok(n) => read_total += n,
            Err(e) => return Err(format!("读取字节失败: {}", e)),
        }
    }
    buf.truncate(read_total);

    Ok(HexChunk {
        offset,
        bytes: buf,
        total_size,
    })
}

/// 打开 Hex 查看器窗口，文件路径与可选初始偏移通过 URL 查询参数传入
#[tauri::command]
pub async fn open_hex_viewer_window(
    app: tauri::AppHandle,
    file_path: String,
    offset: Option<u64>,
) -> Result<(), String> {
    let window_id = uuid::Uuid::new_v4().to_string().replace('-', "")[..16].to_string();
    let window_label = format!("hex-viewer-{}", window_id);

    let mut url = format!("hex-viewer.html?path={}", urlencoding::encode(&file_path));
    if let Some(off) = offset {
        url.push_str(&format!("&offset={}", off));
    }

    let title = std::path::Path::new(&file_path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "Hex 查看器".to_string());

    WebviewWindowBuilder::new(&app, &window_label, WebviewUrl::App(url.into()))
        .title(format!("Hex 查看器 - {}", title))
        .inner_size(1150.0, 800.0)
        .min_inner_size(820.0, 500.0)
        .center()
        .resizable(true)
        .maximizable(true)
        .decorations(crate::window_manager::should_use_decorations())
        .focused(true)
        .skip_taskbar(false)
        .build()
        .map_err(|e| format!("创建 Hex 查看器窗口失败: {}", e))?;

    Ok(())
}
