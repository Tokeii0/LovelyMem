use super::image_processor::ImageProcessor;
use super::types::*;
use base64::{Engine as _, engine::general_purpose};
use memmap2::Mmap;
use rayon::prelude::*;
use std::cmp::Ordering;
use std::collections::HashMap;
use std::fs;
use std::fs::File;
use std::sync::atomic::{AtomicU64, Ordering as AtomicOrdering};
use std::sync::{Arc, LazyLock, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::command;

const ENTROPY_CACHE_LIMIT: usize = 8;
const ENTROPY_CACHE_TTL: Duration = Duration::from_secs(15 * 60);

static ENTROPY_SESSION_COUNTER: AtomicU64 = AtomicU64::new(1);
static ENTROPY_CACHE: LazyLock<Mutex<HashMap<String, StoredEntropy>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

struct StoredEntropy {
    regions: Arc<Vec<EntropyRegionStored>>,
    file_path: String,
    width: u32,
    height: u32,
    image_type: ImageType,
    total_bytes: u64,
    chunks_scanned: usize,
    created_at: SystemTime,
}

#[derive(Clone)]
struct EntropyRegionStored {
    offset: u64,
    size: u64,
    entropy: f64,
    suggested_format: Option<String>,
}

fn cleanup_entropy_cache(cache: &mut HashMap<String, StoredEntropy>) {
    let now = SystemTime::now();
    cache.retain(|_, stored| {
        now.duration_since(stored.created_at)
            .unwrap_or_else(|_| Duration::from_secs(0))
            <= ENTROPY_CACHE_TTL
    });

    if cache.len() <= ENTROPY_CACHE_LIMIT {
        return;
    }

    let mut entries: Vec<_> = cache
        .iter()
        .map(|(key, stored)| {
            let ts = stored
                .created_at
                .duration_since(UNIX_EPOCH)
                .unwrap_or_else(|_| Duration::from_secs(0));
            (key.clone(), ts)
        })
        .collect();

    entries.sort_by_key(|(_, ts)| *ts);

    let remove_count = cache.len() - ENTROPY_CACHE_LIMIT;
    for (key, _) in entries.into_iter().take(remove_count) {
        cache.remove(&key);
    }
}

fn compute_total_pages(total: usize, page_size: usize) -> usize {
    if total == 0 || page_size == 0 {
        0
    } else {
        (total + page_size - 1) / page_size
    }
}

fn clamp_page(page: usize, total_pages: usize) -> usize {
    if total_pages == 0 {
        0
    } else {
        page.min(total_pages - 1)
    }
}

fn compute_page_indices(
    total: usize,
    page: usize,
    page_size: usize,
    sort_mode: &EntropySortMode,
    regions: &[EntropyRegionStored],
) -> Vec<usize> {
    if total == 0 || page_size == 0 {
        return Vec::new();
    }

    match sort_mode {
        EntropySortMode::EntropyHigh => {
            // 区域已经按熵值从高到低排序，直接返回索引
            let start = page.saturating_mul(page_size).min(total);
            let end = ((page + 1).saturating_mul(page_size)).min(total);
            (start..end).collect()
        }
        EntropySortMode::EntropyLow => {
            // 反向索引
            let start = page.saturating_mul(page_size).min(total);
            let end = ((page + 1).saturating_mul(page_size)).min(total);
            let mut indices = Vec::with_capacity(end.saturating_sub(start));
            for i in start..end {
                if i >= total {
                    break;
                }
                let idx = total - 1 - i;
                indices.push(idx);
            }
            indices
        }
        EntropySortMode::OffsetAsc | EntropySortMode::OffsetDesc => {
            // 创建带索引的区域列表并按偏移量排序
            let mut indexed_regions: Vec<(usize, u64)> = regions
                .iter()
                .enumerate()
                .map(|(idx, region)| (idx, region.offset))
                .collect();

            match sort_mode {
                EntropySortMode::OffsetAsc => {
                    indexed_regions.sort_by_key(|(_, offset)| *offset);
                }
                EntropySortMode::OffsetDesc => {
                    indexed_regions.sort_by_key(|(_, offset)| std::cmp::Reverse(*offset));
                }
                _ => {}
            }

            // 获取当前页的索引
            let start = page.saturating_mul(page_size).min(total);
            let end = ((page + 1).saturating_mul(page_size)).min(total);
            indexed_regions[start..end]
                .iter()
                .map(|(idx, _)| *idx)
                .collect()
        }
    }
}

fn build_page_regions(
    regions: &[EntropyRegionStored],
    file_path: &str,
    width: u32,
    height: u32,
    image_type: &ImageType,
    page: usize,
    page_size: usize,
    sort_mode: &EntropySortMode,
    mmap: Option<&Mmap>,
) -> Result<Vec<EntropyRegion>, String> {
    let indices = compute_page_indices(regions.len(), page, page_size, sort_mode, regions);
    if indices.is_empty() {
        return Ok(Vec::new());
    }

    let mut mmap_holder: Option<Mmap> = None;

    let data = if let Some(inner) = mmap {
        inner
    } else {
        let file = File::open(file_path).map_err(|e| format!("无法打开文件: {}", e))?;
        let map =
            unsafe { Mmap::map(&file).map_err(|e| format!("无法内存映射文件: {}", e))? };
        let map_ref = mmap_holder.insert(map);
        &*map_ref
    };

    let mut result = Vec::with_capacity(indices.len());
    for region_index in indices.into_iter() {
        let stored = match regions.get(region_index) {
            Some(value) => value,
            None => continue,
        };

        let mut region = EntropyRegion {
            offset: stored.offset,
            size: stored.size,
            entropy: stored.entropy,
            suggested_format: stored.suggested_format.clone(),
            preview_image: None,
        };

        let preview = std::panic::catch_unwind(|| {
            generate_preview_image(data, region.offset, region.size, width, height, image_type)
        })
        .ok()
        .flatten();
        region.preview_image = preview;

        result.push(region);
    }

    Ok(result)
}

/// 处理原始图像数据
#[command]
pub async fn process_raw_image(params: ImageProcessingParams) -> Result<ProcessingResult, String> {
    // 验证输入参数
    let validation = validate_parameters_internal(&params).await?;
    if !validation.valid {
        return Ok(ProcessingResult {
            success: false,
            message: format!("参数验证失败: {}", validation.errors.join(", ")),
            image_data: None,
            bytes_processed: None,
            image_info: None,
        });
    }

    // 创建图像处理器
    let processor = ImageProcessor::new();

    // 处理图像
    match processor.process_image(params).await {
        Ok(result) => Ok(result),
        Err(e) => Ok(ProcessingResult {
            success: false,
            message: format!("图像处理失败: {}", e),
            image_data: None,
            bytes_processed: None,
            image_info: None,
        }),
    }
}

/// 获取支持的格式列表
#[command]
pub async fn get_supported_formats() -> Result<Vec<FormatInfo>, String> {
    // 使用静态数据避免每次重新创建
    static FORMATS: LazyLock<Vec<FormatInfo>> = LazyLock::new(|| {
        vec![
            FormatInfo {
                name: "Luma".to_string(),
                description: "灰度图像 (单通道)".to_string(),
                supported_depths: vec![BitDepth::B8, BitDepth::B16],
                channels: 1,
            },
            FormatInfo {
                name: "RGB".to_string(),
                description: "RGB 彩色图像 (三通道)".to_string(),
                supported_depths: vec![BitDepth::B8, BitDepth::B16],
                channels: 3,
            },
            FormatInfo {
                name: "RGBA".to_string(),
                description: "RGBA 彩色图像 (四通道，包含透明度)".to_string(),
                supported_depths: vec![BitDepth::B8, BitDepth::B16],
                channels: 4,
            },
            FormatInfo {
                name: "BGR".to_string(),
                description: "BGR 彩色图像 (三通道，蓝绿红顺序)".to_string(),
                supported_depths: vec![BitDepth::B8, BitDepth::B16],
                channels: 3,
            },
            FormatInfo {
                name: "BGRA".to_string(),
                description: "BGRA 彩色图像 (四通道，蓝绿红透明度顺序)".to_string(),
                supported_depths: vec![BitDepth::B8, BitDepth::B16],
                channels: 4,
            },
        ]
    });

    Ok(FORMATS.clone())
}

/// 验证处理参数
#[command]
pub async fn validate_parameters(
    params: ImageProcessingParams,
) -> Result<ValidationResult, String> {
    validate_parameters_internal(&params).await
}

/// 内部参数验证函数
async fn validate_parameters_internal(
    params: &ImageProcessingParams,
) -> Result<ValidationResult, String> {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();

    // 验证基本参数
    if params.width == 0 {
        errors.push("宽度必须大于0".to_string());
    }

    if params.height == 0 {
        errors.push("高度必须大于0".to_string());
    }

    // 检查输入文件是否存在
    let file_size = match fs::metadata(&params.input_path) {
        Ok(metadata) => {
            if !metadata.is_file() {
                errors.push("输入路径不是一个文件".to_string());
                return Ok(ValidationResult {
                    valid: false,
                    errors,
                    warnings,
                    expected_bytes: None,
                    file_size: None,
                });
            }
            metadata.len()
        }
        Err(_) => {
            errors.push("输入文件不存在或无法访问".to_string());
            return Ok(ValidationResult {
                valid: false,
                errors,
                warnings,
                expected_bytes: None,
                file_size: None,
            });
        }
    };

    // 计算预期字节数
    let channels = match params.image_type {
        ImageType::Luma => 1,
        ImageType::Rgb | ImageType::Bgr => 3,
        ImageType::Rgba | ImageType::Bgra => 4,
    };

    let bytes_per_channel = match params.depth {
        BitDepth::B8 => 1,
        BitDepth::B16 => 2,
    };

    let expected_bytes = params.width as u64 * params.height as u64 * channels * bytes_per_channel;
    let total_needed = params.offset + expected_bytes;

    // 检查文件大小是否足够
    if total_needed > file_size {
        warnings.push(format!(
            "文件大小 ({} 字节) 小于所需大小 ({} 字节，包含偏移量)。缺失的部分将用黑色填充。",
            file_size, total_needed
        ));
    }

    // 检查偏移量是否合理
    if params.offset >= file_size {
        errors.push("偏移量超出文件大小".to_string());
    }

    // 不再需要验证输出路径

    Ok(ValidationResult {
        valid: errors.is_empty(),
        errors,
        warnings,
        expected_bytes: Some(expected_bytes),
        file_size: Some(file_size),
    })
}

/// 计算数据块的熵值
fn calculate_entropy(data: &[u8]) -> f64 {
    if data.is_empty() {
        return 0.0;
    }

    // 统计每个字节值的出现次数
    let mut counts = [0u32; 256];
    for &byte in data {
        counts[byte as usize] += 1;
    }

    // 计算熵值
    let len = data.len() as f64;
    let mut entropy = 0.0;

    for &count in &counts {
        if count > 0 {
            let probability = count as f64 / len;
            entropy -= probability * probability.log2();
        }
    }

    entropy
}

/// 分析文件的熵值分布（多线程版本）
#[command]
pub async fn analyze_entropy(
    params: EntropyAnalysisParams,
) -> Result<EntropyAnalysisResult, String> {
    // 打开文件
    let file = File::open(&params.file_path).map_err(|e| format!("无法打开文件: {}", e))?;

    let file_size = file
        .metadata()
        .map_err(|e| format!("无法获取文件信息: {}", e))?
        .len();

    // 内存映射文件以提高性能
    let mmap = unsafe { Mmap::map(&file) }.map_err(|e| format!("无法内存映射文件: {}", e))?;

    // 生成所有需要扫描的偏移量
    let offsets: Vec<u64> = (0..file_size).step_by(params.step_size).collect();

    // 并行计算每个块的熵值
    let entropy_data: Vec<(u64, f64)> = offsets
        .par_iter()
        .filter_map(|&offset| {
            let end =
                ((offset as usize + params.chunk_size).min(mmap.len())).min(file_size as usize);
            let chunk = &mmap[offset as usize..end];

            if chunk.len() < params.chunk_size / 2 {
                return None;
            }

            let entropy = calculate_entropy(chunk);
            Some((offset, entropy))
        })
        .collect();

    let chunks_scanned = entropy_data.len();

    // 合并相邻的高熵区域
    let mut regions = Vec::new();
    let mut current_region: Option<EntropyRegion> = None;

    for (offset, entropy) in entropy_data {
        if entropy >= params.min_entropy && entropy <= params.max_entropy {
            match &mut current_region {
                Some(region) => {
                    // 检查是否相邻
                    if offset <= region.offset + region.size + params.step_size as u64 {
                        // 扩展当前区域
                        region.size = offset + params.chunk_size as u64 - region.offset;
                        region.entropy = (region.entropy + entropy) / 2.0;
                    } else {
                        // 保存当前区域，开始新区域
                        if let Some(mut r) = current_region.take() {
                            if r.size >= params.min_size as u64 {
                                r.suggested_format = suggest_image_format(r.size);
                                regions.push(r);
                            }
                        }
                        current_region = Some(EntropyRegion {
                            offset,
                            size: params.chunk_size as u64,
                            entropy,
                            suggested_format: None,
                            preview_image: None,
                        });
                    }
                }
                None => {
                    current_region = Some(EntropyRegion {
                        offset,
                        size: params.chunk_size as u64,
                        entropy,
                        suggested_format: None,
                        preview_image: None,
                    });
                }
            }
        } else {
            if let Some(mut region) = current_region.take() {
                if region.size >= params.min_size as u64 {
                    region.suggested_format = suggest_image_format(region.size);
                    regions.push(region);
                }
            }
        }
    }

    // 保存最后一个区域
    if let Some(mut region) = current_region {
        if region.size >= params.min_size as u64 {
            region.suggested_format = suggest_image_format(region.size);
            regions.push(region);
        }
    }

    // 按熵值排序（从高到低）

    regions.sort_by(|a, b| b.entropy.partial_cmp(&a.entropy).unwrap_or(Ordering::Equal));

    let shared_regions: Arc<Vec<EntropyRegionStored>> = Arc::new(
        regions
            .into_iter()
            .map(|region| EntropyRegionStored {
                offset: region.offset,
                size: region.size,
                entropy: region.entropy,
                suggested_format: region.suggested_format,
            })
            .collect(),
    );

    let total_regions_found = shared_regions.len();
    let page_size = params.page_size.max(1);
    let total_pages = compute_total_pages(total_regions_found, page_size);
    let sort_mode = params.sort_mode.clone();
    let current_page = clamp_page(params.page, total_pages);

    let page_regions = build_page_regions(
        shared_regions.as_ref(),
        &params.file_path,
        params.width,
        params.height,
        &params.image_type,
        current_page,
        page_size,
        &sort_mode,
        Some(&mmap),
    )?;

    let analysis_id = if total_regions_found > 0 {
        let id = format!(
            "{:016x}",
            ENTROPY_SESSION_COUNTER.fetch_add(1, AtomicOrdering::Relaxed)
        );

        let mut cache = ENTROPY_CACHE
            .lock()
            .map_err(|_| "无法获取熵分析缓存锁".to_string())?;
        cleanup_entropy_cache(&mut cache);
        cache.insert(
            id.clone(),
            StoredEntropy {
                regions: shared_regions.clone(),
                file_path: params.file_path.clone(),
                width: params.width,
                height: params.height,
                image_type: params.image_type.clone(),
                total_bytes: file_size,
                chunks_scanned,
                created_at: SystemTime::now(),
            },
        );

        Some(id)
    } else {
        None
    };

    let returned_count = page_regions.len();
    let message = if total_regions_found == 0 {
        "扫描完成，未找到候选区域".to_string()
    } else {
        format!("扫描完成，共发现 {} 个候选区域", total_regions_found)
    };

    Ok(EntropyAnalysisResult {
        success: true,
        message,
        regions: page_regions,
        total_bytes: file_size,
        chunks_scanned,
        total_regions: total_regions_found,
        returned_regions: returned_count,
        truncated: false,
        analysis_id,
        page: current_page,
        page_size,
        total_pages,
        sort_mode,
    })
}

#[command]
pub async fn fetch_entropy_page(
    request: EntropyPageRequest,
) -> Result<EntropyAnalysisResult, String> {
    let EntropyPageRequest {
        analysis_id,
        page,
        page_size,
        sort_mode,
    } = request;

    let (shared_regions, file_path, width, height, image_type, total_bytes, chunks_scanned) = {
        let mut cache = ENTROPY_CACHE
            .lock()
            .map_err(|_| "无法获取熵分析缓存锁".to_string())?;
        cleanup_entropy_cache(&mut cache);
        let stored = cache
            .get_mut(&analysis_id)
            .ok_or_else(|| "分析结果已过期或不存在".to_string())?;
        stored.created_at = SystemTime::now();
        (
            Arc::clone(&stored.regions),
            stored.file_path.clone(),
            stored.width,
            stored.height,
            stored.image_type.clone(),
            stored.total_bytes,
            stored.chunks_scanned,
        )
    };

    let total_regions = shared_regions.len();
    let normalized_page_size = page_size.max(1);
    let total_pages = compute_total_pages(total_regions, normalized_page_size);
    let current_page = clamp_page(page, total_pages);
    let sort_mode_value = sort_mode.clone();

    let page_regions = build_page_regions(
        shared_regions.as_ref(),
        &file_path,
        width,
        height,
        &image_type,
        current_page,
        normalized_page_size,
        &sort_mode_value,
        None,
    )?;

    let returned_count = page_regions.len();
    let message = if total_regions == 0 {
        "扫描完成，未找到候选区域".to_string()
    } else {
        format!("扫描完成，共发现 {} 个候选区域", total_regions)
    };

    Ok(EntropyAnalysisResult {
        success: true,
        message,
        regions: page_regions,
        total_bytes,
        chunks_scanned,
        total_regions,
        returned_regions: returned_count,
        truncated: false,
        analysis_id: Some(analysis_id),
        page: current_page,
        page_size: normalized_page_size,
        total_pages,
        sort_mode,
    })
}

/// 根据数据大小推测可能的图像格式
fn suggest_image_format(size: u64) -> Option<String> {
    // 常见的图像尺寸
    let common_sizes = [
        (640 * 480, "640×480"),
        (800 * 600, "800×600"),
        (1024 * 768, "1024×768"),
        (1280 * 720, "1280×720"),
        (1920 * 1080, "1920×1080"),
    ];

    // 检查是否匹配常见的 RGB (3 bytes) 或 RGBA (4 bytes) 格式
    for &(pixels, label) in &common_sizes {
        if size == pixels * 3 {
            return Some(format!("{} RGB", label));
        }
        if size == pixels * 4 {
            return Some(format!("{} RGBA", label));
        }
        if size == pixels {
            return Some(format!("{} Luma", label));
        }
    }

    None
}

/// 生成预览图
fn generate_preview_image(
    data: &[u8],
    offset: u64,
    size: u64,
    _width: u32,
    _height: u32,
    image_type: &ImageType,
) -> Option<String> {
    // 预览图目标上限尺寸
    const MAX_W: u32 = 200;
    const MAX_H: u32 = 150;

    // 每像素字节数
    let bpp = match image_type {
        ImageType::Rgb => 3,
        ImageType::Rgba => 4,
        ImageType::Bgr => 3,
        ImageType::Bgra => 4,
        ImageType::Luma => 1,
    } as usize;

    // 该区域可用于渲染的像素数量
    let available_pixels = (size as usize) / bpp;
    if available_pixels == 0 {
        return None;
    }

    // 使用当前宽度，但为保证稳定性对预览宽度进行上限约束
    // 预览高度尽量小（最多 MAX_H 行），但至少为 1 行
    let mut w = if _width > 0 {
        _width.min(MAX_W).max(16)
    } else {
        MAX_W
    };
    let mut h = MAX_H;

    // 如果可用像素不足以填满(w*h)，则缩减高度（必要时缩减宽度）
    let mut total_pixels = (w as usize) * (h as usize);
    if total_pixels > available_pixels {
        // 优先缩减高度
        h = ((available_pixels as u32 + w - 1) / w).max(1).min(MAX_H);
        total_pixels = (w as usize) * (h as usize);
        if total_pixels > available_pixels {
            // 再缩减宽度
            w = (available_pixels as u32).max(1).min(MAX_W);
            h = ((available_pixels as u32 + w - 1) / w).max(1).min(MAX_H);
            total_pixels = (w as usize) * (h as usize);
        }
    }

    let needed_bytes = total_pixels * bpp;
    let start = offset as usize;
    let region_end = start.saturating_add(size as usize).min(data.len());
    let end = start.saturating_add(needed_bytes).min(region_end);
    if end <= start {
        return None;
    }
    let chunk = &data[start..end];

    // 首选按指定图像类型解码
    let primary = match image_type {
        ImageType::Rgb => try_generate_rgb_preview(chunk, w, h),
        ImageType::Rgba => try_generate_rgba_preview(chunk, w, h),
        ImageType::Bgr => try_generate_bgr_preview(chunk, w, h),
        ImageType::Bgra => try_generate_bgra_preview(chunk, w, h),
        ImageType::Luma => try_generate_luma_preview(chunk, w, h),
    };

    if primary.is_some() {
        return primary;
    }

    // 兜底：将原始字节按灰度渲染（使用 chunk 而不是 data，避免越界）
    let fallback_w = w.min(160).max(16);
    let fallback_pixels = (chunk.len()).min((fallback_w as usize) * (MAX_H as usize));
    let fallback_h = ((fallback_pixels as u32) / fallback_w).max(1);
    let luma_len = ((fallback_w as usize) * (fallback_h as usize)).min(chunk.len());
    if luma_len == 0 {
        return None;
    }
    let luma_slice = &chunk[0..luma_len];
    try_generate_luma_preview(luma_slice, fallback_w, fallback_h)
}

/// 尝试生成 RGB 预览图
fn try_generate_rgb_preview(data: &[u8], width: u32, height: u32) -> Option<String> {
    use image::{ImageBuffer, Rgb};

    let w = width as usize;
    let h = height as usize;
    let size = match w.checked_mul(h).and_then(|p| p.checked_mul(3)) {
        Some(s) => s,
        None => return None,
    };
    if data.len() < size {
        return None;
    }

    let mut img = ImageBuffer::<Rgb<u8>, Vec<u8>>::new(width, height);

    for y in 0..height {
        for x in 0..width {
            let idx = match (y as usize)
                .checked_mul(w)
                .and_then(|p| p.checked_add(x as usize))
                .and_then(|p| p.checked_mul(3))
            {
                Some(i) => i,
                None => continue,
            };
            if idx + 2 < data.len() {
                img.put_pixel(x, y, Rgb([data[idx], data[idx + 1], data[idx + 2]]));
            }
        }
    }

    let mut png_data = Vec::new();
    if img
        .write_to(
            &mut std::io::Cursor::new(&mut png_data),
            image::ImageFormat::Png,
        )
        .is_ok()
    {
        Some(general_purpose::STANDARD.encode(&png_data))
    } else {
        None
    }
}

/// 尝试生成 Luma 预览图
fn try_generate_luma_preview(data: &[u8], width: u32, height: u32) -> Option<String> {
    use image::{ImageBuffer, Luma};

    let w = width as usize;
    let h = height as usize;
    let size = match w.checked_mul(h) {
        Some(s) => s,
        None => return None,
    };
    if data.len() < size {
        return None;
    }

    let mut img = ImageBuffer::<Luma<u8>, Vec<u8>>::new(width, height);

    for y in 0..height {
        for x in 0..width {
            let idx = match (y as usize)
                .checked_mul(w)
                .and_then(|p| p.checked_add(x as usize))
            {
                Some(i) => i,
                None => continue,
            };
            if idx < data.len() {
                img.put_pixel(x, y, Luma([data[idx]]));
            }
        }
    }

    let mut png_data = Vec::new();
    if img
        .write_to(
            &mut std::io::Cursor::new(&mut png_data),
            image::ImageFormat::Png,
        )
        .is_ok()
    {
        Some(general_purpose::STANDARD.encode(&png_data))
    } else {
        None
    }
}

/// 尝试生成 RGBA 预览图
fn try_generate_rgba_preview(data: &[u8], width: u32, height: u32) -> Option<String> {
    use image::{ImageBuffer, Rgba};

    let w = width as usize;
    let h = height as usize;
    let size = match w.checked_mul(h).and_then(|p| p.checked_mul(4)) {
        Some(s) => s,
        None => return None,
    };
    if data.len() < size {
        return None;
    }

    let mut img = ImageBuffer::<Rgba<u8>, Vec<u8>>::new(width, height);

    for y in 0..height {
        for x in 0..width {
            let idx = match (y as usize)
                .checked_mul(w)
                .and_then(|p| p.checked_add(x as usize))
                .and_then(|p| p.checked_mul(4))
            {
                Some(i) => i,
                None => continue,
            };
            if idx + 3 < data.len() {
                img.put_pixel(
                    x,
                    y,
                    Rgba([data[idx], data[idx + 1], data[idx + 2], data[idx + 3]]),
                );
            }
        }
    }

    let mut png_data = Vec::new();
    if img
        .write_to(
            &mut std::io::Cursor::new(&mut png_data),
            image::ImageFormat::Png,
        )
        .is_ok()
    {
        Some(general_purpose::STANDARD.encode(&png_data))
    } else {
        None
    }
}

/// 尝试生成 BGR 预览图
fn try_generate_bgr_preview(data: &[u8], width: u32, height: u32) -> Option<String> {
    use image::{ImageBuffer, Rgb};

    let w = width as usize;
    let h = height as usize;
    let size = match w.checked_mul(h).and_then(|p| p.checked_mul(3)) {
        Some(s) => s,
        None => return None,
    };
    if data.len() < size {
        return None;
    }

    let mut img = ImageBuffer::<Rgb<u8>, Vec<u8>>::new(width, height);

    for y in 0..height {
        for x in 0..width {
            let idx = match (y as usize)
                .checked_mul(w)
                .and_then(|p| p.checked_add(x as usize))
                .and_then(|p| p.checked_mul(3))
            {
                Some(i) => i,
                None => continue,
            };
            if idx + 2 < data.len() {
                // BGR -> RGB
                img.put_pixel(x, y, Rgb([data[idx + 2], data[idx + 1], data[idx]]));
            }
        }
    }

    let mut png_data = Vec::new();
    if img
        .write_to(
            &mut std::io::Cursor::new(&mut png_data),
            image::ImageFormat::Png,
        )
        .is_ok()
    {
        Some(general_purpose::STANDARD.encode(&png_data))
    } else {
        None
    }
}

/// 尝试生成 BGRA 预览图
fn try_generate_bgra_preview(data: &[u8], width: u32, height: u32) -> Option<String> {
    use image::{ImageBuffer, Rgba};

    let size = (width * height * 4) as usize;
    if data.len() < size {
        return None;
    }

    let mut img = ImageBuffer::<Rgba<u8>, Vec<u8>>::new(width, height);

    for y in 0..height {
        for x in 0..width {
            let idx = ((y * width + x) * 4) as usize;
            if idx + 3 < data.len() {
                // BGRA -> RGBA
                img.put_pixel(
                    x,
                    y,
                    Rgba([data[idx + 2], data[idx + 1], data[idx], data[idx + 3]]),
                );
            }
        }
    }

    let mut png_data = Vec::new();
    if img
        .write_to(
            &mut std::io::Cursor::new(&mut png_data),
            image::ImageFormat::Png,
        )
        .is_ok()
    {
        Some(general_purpose::STANDARD.encode(&png_data))
    } else {
        None
    }
}
