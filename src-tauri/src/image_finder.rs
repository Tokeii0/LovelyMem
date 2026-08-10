use anyhow::{Context, Result};
use image::ImageFormat;
use memchr::memmem;
use memmap2::Mmap;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::Write;
use std::path::Path;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::time::Instant;
use tauri::Emitter;
use tokio::sync::mpsc;

// 文件签名常量
const PNG_HEADER: &[u8] = &[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
const PNG_FOOTER: &[u8] = &[0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82];
const JPG_HEADER_JFIF: &[u8] = &[0xFF, 0xD8, 0xFF, 0xE0];
const JPG_HEADER_EXIF: &[u8] = &[0xFF, 0xD8, 0xFF, 0xE1];
const JPG_FOOTER: &[u8] = &[0xFF, 0xD9];

/// 图像提取取消标志：start_image_extraction 时重置为 false，stop_image_extraction 置为 true。
/// 并行扫描/提取闭包与各阶段之间据此短路，实现中途停止。
static EXTRACT_CANCEL_FLAG: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum ImageType {
    PNG,
    JPG,
}

impl ImageType {
    fn extension(&self) -> &'static str {
        match self {
            ImageType::PNG => "png",
            ImageType::JPG => "jpg",
        }
    }

    fn headers(&self) -> Vec<&'static [u8]> {
        match self {
            ImageType::PNG => vec![PNG_HEADER],
            ImageType::JPG => vec![JPG_HEADER_JFIF, JPG_HEADER_EXIF],
        }
    }

    fn footer(&self) -> &'static [u8] {
        match self {
            ImageType::PNG => PNG_FOOTER,
            ImageType::JPG => JPG_FOOTER,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageMatch {
    pub start_offset: usize,
    pub end_offset: Option<usize>,
    pub image_type: ImageType,
    pub file_size: usize,
    pub filename: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageFinderProgress {
    pub processed_bytes: u64,
    pub total_bytes: u64,
    pub found_count: usize,
    pub extracted_count: usize,
    pub status: String,
    pub completed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageFinderResult {
    pub extracted_images: Vec<ExtractedImage>,
    pub total_found: usize,
    pub total_extracted: usize,
    pub duration_ms: u64,
    pub output_directory: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedImage {
    pub filename: String,
    pub file_path: String,
    pub image_type: ImageType,
    pub file_size: usize,
    pub offset: usize,
    pub thumbnail_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageFinderConfig {
    pub input_file: String,
    pub output_directory: String,
    pub chunk_size_mb: usize,
    pub max_png_size_mb: usize,
    pub max_jpg_size_mb: usize,
    pub generate_thumbnails: bool,
    pub thumbnail_size: u32,
}

impl Default for ImageFinderConfig {
    fn default() -> Self {
        Self {
            input_file: String::new(),
            output_directory: "extracted_images".to_string(),
            chunk_size_mb: 256,
            max_png_size_mb: 50,
            max_jpg_size_mb: 20,
            generate_thumbnails: true,
            thumbnail_size: 150,
        }
    }
}

pub struct ImageFinder {
    config: ImageFinderConfig,
}

impl ImageFinder {
    pub fn new(config: ImageFinderConfig) -> Self {
        Self { config }
    }

    /// 执行图像提取
    pub async fn extract_images(
        &self,
        progress_sender: Option<mpsc::UnboundedSender<ImageFinderProgress>>,
    ) -> Result<ImageFinderResult> {
        let start_time = Instant::now();

        // 创建输出目录
        fs::create_dir_all(&self.config.output_directory).with_context(|| {
            format!(
                "Failed to create output directory: {}",
                self.config.output_directory
            )
        })?;

        // 发送初始进度
        if let Some(ref sender) = progress_sender {
            let _ = sender.send(ImageFinderProgress {
                processed_bytes: 0,
                total_bytes: 0,
                found_count: 0,
                extracted_count: 0,
                status: "正在打开文件...".to_string(),
                completed: false,
            });
        }

        // 打开并映射文件
        let file = File::open(&self.config.input_file)
            .with_context(|| format!("Failed to open input file: {}", self.config.input_file))?;

        let mmap =
            unsafe { Mmap::map(&file) }.with_context(|| "Failed to memory map the input file")?;

        let total_bytes = mmap.len() as u64;

        // 发送文件大小信息
        if let Some(ref sender) = progress_sender {
            let _ = sender.send(ImageFinderProgress {
                processed_bytes: 0,
                total_bytes,
                found_count: 0,
                extracted_count: 0,
                status: format!("文件大小: {} MB", total_bytes / (1024 * 1024)),
                completed: false,
            });
        }

        let mut extracted_images = Vec::new();

        // 搜索PNG和JPG文件
        let png_matches = self
            .find_image_headers(&mmap, ImageType::PNG, progress_sender.clone())
            .await?;
        if EXTRACT_CANCEL_FLAG.load(Ordering::Relaxed) {
            return Ok(self.cancelled_result(
                extracted_images,
                png_matches.len(),
                start_time,
                &progress_sender,
                total_bytes,
            ));
        }
        let jpg_matches = self
            .find_image_headers(&mmap, ImageType::JPG, progress_sender.clone())
            .await?;

        let total_found = png_matches.len() + jpg_matches.len();
        if EXTRACT_CANCEL_FLAG.load(Ordering::Relaxed) {
            return Ok(self.cancelled_result(
                extracted_images,
                total_found,
                start_time,
                &progress_sender,
                total_bytes,
            ));
        }

        // 发送搜索完成状态
        if let Some(ref sender) = progress_sender {
            let _ = sender.send(ImageFinderProgress {
                processed_bytes: total_bytes,
                total_bytes,
                found_count: total_found,
                extracted_count: 0,
                status: format!(
                    "找到 {} 个PNG文件和 {} 个JPG文件",
                    png_matches.len(),
                    jpg_matches.len()
                ),
                completed: false,
            });
        }

        // 提取文件
        let png_extracted = self
            .extract_images_by_type(
                &mmap,
                &png_matches,
                &mut extracted_images,
                progress_sender.clone(),
            )
            .await?;
        if EXTRACT_CANCEL_FLAG.load(Ordering::Relaxed) {
            return Ok(self.cancelled_result(
                extracted_images,
                total_found,
                start_time,
                &progress_sender,
                total_bytes,
            ));
        }
        let jpg_extracted = self
            .extract_images_by_type(
                &mmap,
                &jpg_matches,
                &mut extracted_images,
                progress_sender.clone(),
            )
            .await?;

        let total_extracted = png_extracted + jpg_extracted;
        let duration_ms = start_time.elapsed().as_millis() as u64;

        // 发送完成状态
        if let Some(ref sender) = progress_sender {
            let _ = sender.send(ImageFinderProgress {
                processed_bytes: total_bytes,
                total_bytes,
                found_count: total_found,
                extracted_count: total_extracted,
                status: format!("提取完成！成功提取 {} 个图像文件", total_extracted),
                completed: true,
            });
        }

        Ok(ImageFinderResult {
            extracted_images,
            total_found,
            total_extracted,
            duration_ms,
            output_directory: self.config.output_directory.clone(),
        })
    }

    /// 构造"已停止"结果并发送最终进度（保留已提取的部分结果）
    fn cancelled_result(
        &self,
        extracted_images: Vec<ExtractedImage>,
        total_found: usize,
        start_time: Instant,
        progress_sender: &Option<mpsc::UnboundedSender<ImageFinderProgress>>,
        total_bytes: u64,
    ) -> ImageFinderResult {
        let total_extracted = extracted_images.len();
        if let Some(sender) = progress_sender {
            let _ = sender.send(ImageFinderProgress {
                processed_bytes: total_bytes,
                total_bytes,
                found_count: total_found,
                extracted_count: total_extracted,
                status: format!("已停止，已提取 {} 个图像文件", total_extracted),
                completed: true,
            });
        }
        ImageFinderResult {
            extracted_images,
            total_found,
            total_extracted,
            duration_ms: start_time.elapsed().as_millis() as u64,
            output_directory: self.config.output_directory.clone(),
        }
    }

    /// 搜索图像文件头
    async fn find_image_headers(
        &self,
        mmap: &Mmap,
        image_type: ImageType,
        progress_sender: Option<mpsc::UnboundedSender<ImageFinderProgress>>,
    ) -> Result<Vec<ImageMatch>> {
        let chunk_size = self.config.chunk_size_mb * 1024 * 1024;
        let headers = image_type.headers();
        let finders: Vec<_> = headers.iter().map(|h| memmem::Finder::new(h)).collect();
        let overlap_size = headers.iter().map(|h| h.len()).max().unwrap_or(0) - 1;

        let matches = Arc::new(std::sync::Mutex::new(Vec::new()));
        let processed_chunks = AtomicUsize::new(0);
        let total_chunks = (mmap.len() + chunk_size - 1) / chunk_size;

        // 并行处理块
        (0..total_chunks).into_par_iter().for_each(|chunk_idx| {
            if EXTRACT_CANCEL_FLAG.load(Ordering::Relaxed) {
                return;
            }
            let start = chunk_idx * chunk_size;
            let end = std::cmp::min(start + chunk_size + overlap_size, mmap.len());
            let chunk = &mmap[start..end];

            let mut chunk_matches = Vec::new();

            // 使用所有可能的文件头搜索
            for finder in &finders {
                let mut search_start = 0;

                while let Some(pos) = finder.find(&chunk[search_start..]) {
                    let absolute_offset = start + search_start + pos;

                    // 避免重叠区域的重复
                    if chunk_idx > 0 && search_start + pos < overlap_size {
                        search_start += pos + 1;
                        continue;
                    }

                    chunk_matches.push(ImageMatch {
                        start_offset: absolute_offset,
                        end_offset: None,
                        image_type,
                        file_size: 0,
                        filename: String::new(),
                    });

                    search_start += pos + 1;
                }
            }

            if !chunk_matches.is_empty() {
                let mut global_matches = matches.lock().unwrap_or_else(|e| e.into_inner());
                global_matches.extend(chunk_matches);
            }

            let processed = processed_chunks.fetch_add(1, Ordering::Relaxed) + 1;

            // 定期发送进度更新
            if processed % 10 == 0 {
                if let Some(ref sender) = progress_sender {
                    let progress_bytes = (processed * chunk_size).min(mmap.len()) as u64;
                    let _ = sender.send(ImageFinderProgress {
                        processed_bytes: progress_bytes,
                        total_bytes: mmap.len() as u64,
                        found_count: 0,
                        extracted_count: 0,
                        status: format!(
                            "正在搜索 {} 文件头... ({}/{})",
                            image_type.extension().to_uppercase(),
                            processed,
                            total_chunks
                        ),
                        completed: false,
                    });
                }
            }
        });

        let mut result = match Arc::try_unwrap(matches) {
            Ok(mutex) => mutex.into_inner().unwrap_or_else(|e| e.into_inner()),
            Err(arc) => arc.lock().unwrap_or_else(|e| e.into_inner()).clone(),
        };
        result.sort_by_key(|m| m.start_offset);

        Ok(result)
    }

    /// 按类型提取图像文件
    async fn extract_images_by_type(
        &self,
        mmap: &Mmap,
        matches: &[ImageMatch],
        extracted_images: &mut Vec<ExtractedImage>,
        progress_sender: Option<mpsc::UnboundedSender<ImageFinderProgress>>,
    ) -> Result<usize> {
        if matches.is_empty() {
            return Ok(0);
        }

        let image_type = matches[0].image_type;
        let footer = image_type.footer();
        let footer_finder = memmem::Finder::new(footer);
        let extension = image_type.extension();
        let extracted_count = AtomicUsize::new(0);
        let extracted_images_sync = Arc::new(std::sync::Mutex::new(Vec::<ExtractedImage>::new()));

        let max_size = match image_type {
            ImageType::PNG => self.config.max_png_size_mb * 1024 * 1024,
            ImageType::JPG => self.config.max_jpg_size_mb * 1024 * 1024,
        };

        matches.par_iter().enumerate().for_each(|(i, image_match)| {
            if EXTRACT_CANCEL_FLAG.load(Ordering::Relaxed) {
                return;
            }
            let start_offset = image_match.start_offset;

            let search_end = std::cmp::min(start_offset + max_size, mmap.len());
            let search_slice = &mmap[start_offset..search_end];

            if let Some(footer_pos) = footer_finder.find(search_slice) {
                let end_offset = start_offset + footer_pos + footer.len();

                if end_offset <= mmap.len() {
                    let file_data = &mmap[start_offset..end_offset];
                    let file_size = file_data.len();

                    // 验证文件大小和结构
                    let (min_size, max_size_bytes) = match image_type {
                        ImageType::PNG => (67, self.config.max_png_size_mb * 1024 * 1024),
                        ImageType::JPG => (20, self.config.max_jpg_size_mb * 1024 * 1024),
                    };

                    if file_size >= min_size && file_size <= max_size_bytes {
                        let is_valid = match image_type {
                            ImageType::JPG => self.validate_jpg_structure(file_data),
                            ImageType::PNG => true,
                        };

                        if is_valid {
                            let filename = format!("{}_{:06}.{}", extension, i, extension);
                            let filepath = Path::new(&self.config.output_directory).join(&filename);

                            if let Ok(mut output_file) = File::create(&filepath) {
                                if output_file.write_all(file_data).is_ok() {
                                    let _current_count =
                                        extracted_count.fetch_add(1, Ordering::Relaxed) + 1;

                                    // 生成缩略图
                                    let thumbnail_path = if self.config.generate_thumbnails {
                                        self.generate_thumbnail(&filepath, file_data).ok()
                                    } else {
                                        None
                                    };

                                    // 创建提取的图像信息并添加到线程安全的集合中
                                    let extracted_image = ExtractedImage {
                                        filename: filename.clone(),
                                        file_path: filepath.to_string_lossy().to_string(),
                                        image_type,
                                        file_size,
                                        offset: start_offset,
                                        thumbnail_path,
                                    };

                                    if let Ok(mut images) = extracted_images_sync.lock() {
                                        images.push(extracted_image);
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // 定期发送进度更新
            if i % 100 == 0 {
                if let Some(ref sender) = progress_sender {
                    let current_extracted = extracted_count.load(Ordering::Relaxed);
                    let _ = sender.send(ImageFinderProgress {
                        processed_bytes: 0,
                        total_bytes: 0,
                        found_count: matches.len(),
                        extracted_count: current_extracted,
                        status: format!(
                            "正在提取 {} 文件... ({}/{})",
                            extension.to_uppercase(),
                            i + 1,
                            matches.len()
                        ),
                        completed: false,
                    });
                }
            }
        });

        // 将收集的图像信息添加到结果中
        if let Ok(images) = Arc::try_unwrap(extracted_images_sync) {
            if let Ok(images) = images.into_inner() {
                extracted_images.extend(images);
            }
        }

        Ok(extracted_count.load(Ordering::Relaxed))
    }

    /// 验证JPG文件结构
    fn validate_jpg_structure(&self, data: &[u8]) -> bool {
        if data.len() < 4 {
            return false;
        }

        // 检查文件头
        let has_valid_header =
            data.len() >= 4 && (&data[0..4] == JPG_HEADER_JFIF || &data[0..4] == JPG_HEADER_EXIF);

        if !has_valid_header {
            return false;
        }

        // 检查文件尾
        let len = data.len();
        if len < 2 || &data[len - 2..len] != &[0xFF, 0xD9] {
            return false;
        }

        // 额外的JPEG结构验证
        if data.len() >= 6 {
            if &data[0..4] == JPG_HEADER_JFIF && data.len() >= 10 {
                if data.len() > 9 && &data[6..10] == b"JFIF" {
                    return true;
                }
            }

            if &data[0..4] == JPG_HEADER_EXIF && data.len() >= 10 {
                if data.len() > 9 && &data[6..10] == b"Exif" {
                    return true;
                }
            }

            return true;
        }

        false
    }

    /// 生成缩略图
    fn generate_thumbnail(&self, file_path: &Path, image_data: &[u8]) -> Result<String> {
        // 创建缩略图目录
        let thumbnails_dir = Path::new(&self.config.output_directory).join("thumbnails");
        fs::create_dir_all(&thumbnails_dir)
            .with_context(|| "Failed to create thumbnails directory")?;

        // 生成缩略图文件名
        let file_stem = file_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("thumbnail");
        let thumbnail_filename = format!("{}_thumb.jpg", file_stem);
        let thumbnail_path = thumbnails_dir.join(&thumbnail_filename);

        // 尝试加载图像
        let img = image::load_from_memory(image_data)
            .with_context(|| "Failed to load image from memory")?;

        // 生成缩略图
        let thumbnail = img.thumbnail(self.config.thumbnail_size, self.config.thumbnail_size);

        // 保存缩略图
        thumbnail
            .save_with_format(&thumbnail_path, ImageFormat::Jpeg)
            .with_context(|| "Failed to save thumbnail")?;

        Ok(thumbnail_path.to_string_lossy().to_string())
    }
}

// Tauri 命令
#[tauri::command]
pub async fn start_image_extraction(
    config: ImageFinderConfig,
    window: tauri::Window,
) -> Result<ImageFinderResult, String> {
    // 重置取消标志，开始新的提取任务
    EXTRACT_CANCEL_FLAG.store(false, Ordering::Relaxed);

    let (progress_sender, mut progress_receiver) = mpsc::unbounded_channel();

    // 启动进度监听任务
    let window_clone = window.clone();
    tokio::spawn(async move {
        while let Some(progress) = progress_receiver.recv().await {
            let _ = window_clone.emit("image_finder_progress", &progress);
        }
    });

    let finder = ImageFinder::new(config);
    finder
        .extract_images(Some(progress_sender))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_image_finder_config() -> Result<ImageFinderConfig, String> {
    Ok(ImageFinderConfig::default())
}

/// Tauri 命令：停止图像提取
#[tauri::command]
pub async fn stop_image_extraction() -> Result<(), String> {
    EXTRACT_CANCEL_FLAG.store(true, Ordering::Relaxed);
    Ok(())
}
