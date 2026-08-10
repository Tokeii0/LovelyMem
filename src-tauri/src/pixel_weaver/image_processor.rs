use super::types::*;
use anyhow::{Result, anyhow};
// byteorder imports removed as we now use direct byte conversion
use base64::{Engine as _, engine::general_purpose};
use image::{DynamicImage, ImageBuffer, ImageFormat, Luma, Rgb, Rgba};
use memmap2::Mmap;
use rayon::prelude::*;
use std::fs::File;
use std::io::Cursor;

pub struct ImageProcessor;

impl ImageProcessor {
    pub fn new() -> Self {
        Self
    }

    /// 处理原始图像数据
    pub async fn process_image(&self, params: ImageProcessingParams) -> Result<ProcessingResult> {
        // 打开并内存映射文件
        let file =
            File::open(&params.input_path).map_err(|e| anyhow!("无法打开输入文件: {}", e))?;

        let mmap = unsafe { Mmap::map(&file) }.map_err(|e| anyhow!("无法内存映射文件: {}", e))?;

        // 应用偏移量
        let offset = params.offset as usize;
        if offset >= mmap.len() {
            return Err(anyhow!("偏移量 {} 超出文件大小 {}", offset, mmap.len()));
        }

        let data_slice = &mmap[offset..];

        // 根据格式和位深度处理图像
        let result = match (&params.image_type, &params.depth) {
            (ImageType::Luma, BitDepth::B8) => self.process_luma_8bit(data_slice, &params).await?,
            (ImageType::Luma, BitDepth::B16) => {
                self.process_luma_16bit(data_slice, &params).await?
            }
            (ImageType::Rgb, BitDepth::B8) => self.process_rgb_8bit(data_slice, &params).await?,
            (ImageType::Rgb, BitDepth::B16) => self.process_rgb_16bit(data_slice, &params).await?,
            (ImageType::Rgba, BitDepth::B8) => self.process_rgba_8bit(data_slice, &params).await?,
            (ImageType::Rgba, BitDepth::B16) => {
                self.process_rgba_16bit(data_slice, &params).await?
            }
            (ImageType::Bgr, BitDepth::B8) => self.process_bgr_8bit(data_slice, &params).await?,
            (ImageType::Bgr, BitDepth::B16) => self.process_bgr_16bit(data_slice, &params).await?,
            (ImageType::Bgra, BitDepth::B8) => self.process_bgra_8bit(data_slice, &params).await?,
            (ImageType::Bgra, BitDepth::B16) => {
                self.process_bgra_16bit(data_slice, &params).await?
            }
        };

        Ok(result)
    }

    /// 处理8位灰度图像
    async fn process_luma_8bit(
        &self,
        data: &[u8],
        params: &ImageProcessingParams,
    ) -> Result<ProcessingResult> {
        let buffer = self.prepare_buffer_8bit(data, 1, params)?;
        let img_buffer =
            ImageBuffer::<Luma<u8>, Vec<u8>>::from_raw(params.width, params.height, buffer)
                .ok_or_else(|| anyhow!("无法创建图像缓冲区"))?;

        let base64_data = self.luma_u8_to_base64(&img_buffer)?;
        Ok(self.create_success_result_with_data(params, data.len() as u64, 1, 8, base64_data))
    }

    /// 处理16位灰度图像
    async fn process_luma_16bit(
        &self,
        data: &[u8],
        params: &ImageProcessingParams,
    ) -> Result<ProcessingResult> {
        let buffer = self.prepare_buffer_16bit(data, 1, params)?;
        let img_buffer =
            ImageBuffer::<Luma<u16>, Vec<u16>>::from_raw(params.width, params.height, buffer)
                .ok_or_else(|| anyhow!("无法创建图像缓冲区"))?;

        let base64_data = self.luma_u16_to_base64(&img_buffer)?;
        Ok(self.create_success_result_with_data(params, data.len() as u64, 1, 16, base64_data))
    }

    /// 处理8位RGB图像
    async fn process_rgb_8bit(
        &self,
        data: &[u8],
        params: &ImageProcessingParams,
    ) -> Result<ProcessingResult> {
        let buffer = self.prepare_buffer_8bit(data, 3, params)?;
        let img_buffer =
            ImageBuffer::<Rgb<u8>, Vec<u8>>::from_raw(params.width, params.height, buffer)
                .ok_or_else(|| anyhow!("无法创建图像缓冲区"))?;

        let base64_data = self.rgb_u8_to_base64(&img_buffer)?;
        Ok(self.create_success_result_with_data(params, data.len() as u64, 3, 8, base64_data))
    }

    /// 处理16位RGB图像
    async fn process_rgb_16bit(
        &self,
        data: &[u8],
        params: &ImageProcessingParams,
    ) -> Result<ProcessingResult> {
        let buffer = self.prepare_buffer_16bit(data, 3, params)?;
        let img_buffer =
            ImageBuffer::<Rgb<u16>, Vec<u16>>::from_raw(params.width, params.height, buffer)
                .ok_or_else(|| anyhow!("无法创建图像缓冲区"))?;

        let base64_data = self.rgb_u16_to_base64(&img_buffer)?;
        Ok(self.create_success_result_with_data(params, data.len() as u64, 3, 16, base64_data))
    }

    /// 处理8位RGBA图像
    async fn process_rgba_8bit(
        &self,
        data: &[u8],
        params: &ImageProcessingParams,
    ) -> Result<ProcessingResult> {
        let buffer = self.prepare_buffer_8bit(data, 4, params)?;
        let img_buffer =
            ImageBuffer::<Rgba<u8>, Vec<u8>>::from_raw(params.width, params.height, buffer)
                .ok_or_else(|| anyhow!("无法创建图像缓冲区"))?;

        let base64_data = self.rgba_u8_to_base64(&img_buffer)?;
        Ok(self.create_success_result_with_data(params, data.len() as u64, 4, 8, base64_data))
    }

    /// 处理16位RGBA图像
    async fn process_rgba_16bit(
        &self,
        data: &[u8],
        params: &ImageProcessingParams,
    ) -> Result<ProcessingResult> {
        let buffer = self.prepare_buffer_16bit(data, 4, params)?;
        let img_buffer =
            ImageBuffer::<Rgba<u16>, Vec<u16>>::from_raw(params.width, params.height, buffer)
                .ok_or_else(|| anyhow!("无法创建图像缓冲区"))?;

        let base64_data = self.rgba_u16_to_base64(&img_buffer)?;
        Ok(self.create_success_result_with_data(params, data.len() as u64, 4, 16, base64_data))
    }

    /// 处理8位BGR图像
    async fn process_bgr_8bit(
        &self,
        data: &[u8],
        params: &ImageProcessingParams,
    ) -> Result<ProcessingResult> {
        let mut buffer = self.prepare_buffer_8bit(data, 3, params)?;

        // BGR -> RGB 通道交换 (并行处理)
        buffer.par_chunks_exact_mut(3).for_each(|chunk| {
            chunk.swap(0, 2);
        });

        let img_buffer =
            ImageBuffer::<Rgb<u8>, Vec<u8>>::from_raw(params.width, params.height, buffer)
                .ok_or_else(|| anyhow!("无法创建图像缓冲区"))?;

        let base64_data = self.rgb_u8_to_base64(&img_buffer)?;
        Ok(self.create_success_result_with_data(params, data.len() as u64, 3, 8, base64_data))
    }

    /// 处理16位BGR图像
    async fn process_bgr_16bit(
        &self,
        data: &[u8],
        params: &ImageProcessingParams,
    ) -> Result<ProcessingResult> {
        let mut buffer = self.prepare_buffer_16bit(data, 3, params)?;

        // BGR -> RGB 通道交换 (并行处理)
        buffer.par_chunks_exact_mut(3).for_each(|chunk| {
            chunk.swap(0, 2);
        });

        let img_buffer =
            ImageBuffer::<Rgb<u16>, Vec<u16>>::from_raw(params.width, params.height, buffer)
                .ok_or_else(|| anyhow!("无法创建图像缓冲区"))?;

        let base64_data = self.rgb_u16_to_base64(&img_buffer)?;
        Ok(self.create_success_result_with_data(params, data.len() as u64, 3, 16, base64_data))
    }

    /// 处理8位BGRA图像
    async fn process_bgra_8bit(
        &self,
        data: &[u8],
        params: &ImageProcessingParams,
    ) -> Result<ProcessingResult> {
        let mut buffer = self.prepare_buffer_8bit(data, 4, params)?;

        // BGRA -> RGBA 通道交换 (并行处理)
        buffer.par_chunks_exact_mut(4).for_each(|chunk| {
            chunk.swap(0, 2);
        });

        let img_buffer =
            ImageBuffer::<Rgba<u8>, Vec<u8>>::from_raw(params.width, params.height, buffer)
                .ok_or_else(|| anyhow!("无法创建图像缓冲区"))?;

        let base64_data = self.rgba_u8_to_base64(&img_buffer)?;
        Ok(self.create_success_result_with_data(params, data.len() as u64, 4, 8, base64_data))
    }

    /// 处理16位BGRA图像
    async fn process_bgra_16bit(
        &self,
        data: &[u8],
        params: &ImageProcessingParams,
    ) -> Result<ProcessingResult> {
        let mut buffer = self.prepare_buffer_16bit(data, 4, params)?;

        // BGRA -> RGBA 通道交换 (并行处理)
        buffer.par_chunks_exact_mut(4).for_each(|chunk| {
            chunk.swap(0, 2);
        });

        let img_buffer =
            ImageBuffer::<Rgba<u16>, Vec<u16>>::from_raw(params.width, params.height, buffer)
                .ok_or_else(|| anyhow!("无法创建图像缓冲区"))?;

        let base64_data = self.rgba_u16_to_base64(&img_buffer)?;
        Ok(self.create_success_result_with_data(params, data.len() as u64, 4, 16, base64_data))
    }

    /// 准备8位数据缓冲区
    fn prepare_buffer_8bit(
        &self,
        data: &[u8],
        channels: u64,
        params: &ImageProcessingParams,
    ) -> Result<Vec<u8>> {
        // 计算图像所需的总元素数
        let required_elements = params.width as u64 * params.height as u64 * channels;

        // 计算可用的字节数（不超过所需的元素数）
        let available_bytes = data.len().min(required_elements as usize);

        // 创建缓冲区并预分配空间
        let mut buffer = Vec::with_capacity(required_elements as usize);

        // 复制可用的数据
        buffer.extend_from_slice(&data[..available_bytes]);

        // 如果数据不足，用黑色填充
        if (buffer.len() as u64) < required_elements {
            buffer.resize(required_elements as usize, 0);
        }

        Ok(buffer)
    }

    /// 准备16位数据缓冲区
    fn prepare_buffer_16bit(
        &self,
        data: &[u8],
        channels: u64,
        params: &ImageProcessingParams,
    ) -> Result<Vec<u16>> {
        let required_elements = params.width as u64 * params.height as u64 * channels;
        let required_bytes = required_elements * 2;

        let available_bytes = data.len().min(required_bytes as usize);
        let mut u16_data = Vec::with_capacity(required_elements as usize);

        // 优化：预分配所需大小的向量，避免多次重新分配
        let chunk_size = 2; // 每个u16占用2个字节
        let num_complete_elements = available_bytes / chunk_size;

        // 使用并行迭代器处理数据
        match params.endian {
            Endianness::Little => {
                u16_data.extend(
                    data[..num_complete_elements * chunk_size]
                        .par_chunks_exact(chunk_size)
                        .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
                        .collect::<Vec<u16>>(),
                );
            }
            Endianness::Big => {
                u16_data.extend(
                    data[..num_complete_elements * chunk_size]
                        .par_chunks_exact(chunk_size)
                        .map(|chunk| u16::from_be_bytes([chunk[0], chunk[1]]))
                        .collect::<Vec<u16>>(),
                );
            }
            Endianness::Native => {
                if cfg!(target_endian = "little") {
                    u16_data.extend(
                        data[..num_complete_elements * chunk_size]
                            .par_chunks_exact(chunk_size)
                            .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
                            .collect::<Vec<u16>>(),
                    );
                } else {
                    u16_data.extend(
                        data[..num_complete_elements * chunk_size]
                            .par_chunks_exact(chunk_size)
                            .map(|chunk| u16::from_be_bytes([chunk[0], chunk[1]]))
                            .collect::<Vec<u16>>(),
                    );
                }
            }
        }

        // 如果数据不足，用黑色填充
        if (u16_data.len() as u64) < required_elements {
            u16_data.resize(required_elements as usize, 0);
        }

        Ok(u16_data)
    }

    /// 创建带有图像数据的成功结果
    fn create_success_result_with_data(
        &self,
        params: &ImageProcessingParams,
        bytes_processed: u64,
        channels: u8,
        bit_depth: u8,
        image_data: String,
    ) -> ProcessingResult {
        let file_size = std::fs::metadata(&params.input_path)
            .map(|m| m.len())
            .unwrap_or(0);

        ProcessingResult {
            success: true,
            message: "图像处理成功".to_string(),
            image_data: Some(image_data),
            bytes_processed: Some(bytes_processed),
            image_info: Some(ImageInfo {
                width: params.width,
                height: params.height,
                channels,
                bit_depth,
                file_size,
                bytes_used: bytes_processed,
            }),
        }
    }

    /// 将 Luma<u8> 图像转换为 base64 编码的 PNG 数据
    fn luma_u8_to_base64(&self, img: &ImageBuffer<Luma<u8>, Vec<u8>>) -> Result<String> {
        let dynamic_img = DynamicImage::ImageLuma8(img.clone());
        let mut buffer = Vec::new();

        dynamic_img
            .write_to(&mut Cursor::new(&mut buffer), ImageFormat::Png)
            .map_err(|e| anyhow!("编码图像失败: {}", e))?;

        Ok(general_purpose::STANDARD.encode(&buffer))
    }

    /// 将 Luma<u16> 图像转换为 base64 编码的 PNG 数据
    fn luma_u16_to_base64(&self, img: &ImageBuffer<Luma<u16>, Vec<u16>>) -> Result<String> {
        let dynamic_img = DynamicImage::ImageLuma16(img.clone());
        let mut buffer = Vec::new();

        dynamic_img
            .write_to(&mut Cursor::new(&mut buffer), ImageFormat::Png)
            .map_err(|e| anyhow!("编码图像失败: {}", e))?;

        Ok(general_purpose::STANDARD.encode(&buffer))
    }

    /// 将 Rgb<u8> 图像转换为 base64 编码的 PNG 数据
    fn rgb_u8_to_base64(&self, img: &ImageBuffer<Rgb<u8>, Vec<u8>>) -> Result<String> {
        let dynamic_img = DynamicImage::ImageRgb8(img.clone());
        let mut buffer = Vec::new();

        dynamic_img
            .write_to(&mut Cursor::new(&mut buffer), ImageFormat::Png)
            .map_err(|e| anyhow!("编码图像失败: {}", e))?;

        Ok(general_purpose::STANDARD.encode(&buffer))
    }

    /// 将 Rgb<u16> 图像转换为 base64 编码的 PNG 数据
    fn rgb_u16_to_base64(&self, img: &ImageBuffer<Rgb<u16>, Vec<u16>>) -> Result<String> {
        let dynamic_img = DynamicImage::ImageRgb16(img.clone());
        let mut buffer = Vec::new();

        dynamic_img
            .write_to(&mut Cursor::new(&mut buffer), ImageFormat::Png)
            .map_err(|e| anyhow!("编码图像失败: {}", e))?;

        Ok(general_purpose::STANDARD.encode(&buffer))
    }

    /// 将 Rgba<u8> 图像转换为 base64 编码的 PNG 数据
    fn rgba_u8_to_base64(&self, img: &ImageBuffer<Rgba<u8>, Vec<u8>>) -> Result<String> {
        let dynamic_img = DynamicImage::ImageRgba8(img.clone());
        let mut buffer = Vec::new();

        dynamic_img
            .write_to(&mut Cursor::new(&mut buffer), ImageFormat::Png)
            .map_err(|e| anyhow!("编码图像失败: {}", e))?;

        Ok(general_purpose::STANDARD.encode(&buffer))
    }

    /// 将 Rgba<u16> 图像转换为 base64 编码的 PNG 数据
    fn rgba_u16_to_base64(&self, img: &ImageBuffer<Rgba<u16>, Vec<u16>>) -> Result<String> {
        let dynamic_img = DynamicImage::ImageRgba16(img.clone());
        let mut buffer = Vec::new();

        dynamic_img
            .write_to(&mut Cursor::new(&mut buffer), ImageFormat::Png)
            .map_err(|e| anyhow!("编码图像失败: {}", e))?;

        Ok(general_purpose::STANDARD.encode(&buffer))
    }
}
