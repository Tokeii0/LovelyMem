use serde::{Deserialize, Serialize};

/// 支持的像素格式类型
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ImageType {
    /// 灰度图像 (单通道)
    Luma,
    /// RGB 图像 (三通道)
    Rgb,
    /// RGBA 图像 (四通道，包含透明度)
    Rgba,
    /// BGR 图像 (三通道，蓝绿红顺序)
    Bgr,
    /// BGRA 图像 (四通道，蓝绿红透明度顺序)
    Bgra,
}

/// 支持的位深度
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum BitDepth {
    /// 8位每通道
    B8,
    /// 16位每通道
    B16,
}

/// 字节序
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Endianness {
    /// 小端序
    Little,
    /// 大端序
    Big,
    /// 本机字节序
    Native,
}

/// 图像处理参数
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageProcessingParams {
    /// 输入文件路径
    pub input_path: String,
    /// 图像宽度（像素）
    pub width: u32,
    /// 图像高度（像素）
    pub height: u32,
    /// 从文件开头跳过的字节数
    pub offset: u64,
    /// 像素格式类型
    pub image_type: ImageType,
    /// 每个颜色通道的位深度
    pub depth: BitDepth,
    /// 多字节数据的字节序
    pub endian: Endianness,
}

/// 处理结果
#[derive(Debug, Serialize, Deserialize)]
pub struct ProcessingResult {
    /// 是否成功
    pub success: bool,
    /// 消息
    pub message: String,
    /// Base64 编码的图像数据
    pub image_data: Option<String>,
    /// 处理的字节数
    pub bytes_processed: Option<u64>,
    /// 图像信息
    pub image_info: Option<ImageInfo>,
}

/// 图像信息
#[derive(Debug, Serialize, Deserialize)]
pub struct ImageInfo {
    /// 宽度
    pub width: u32,
    /// 高度
    pub height: u32,
    /// 通道数
    pub channels: u8,
    /// 位深度
    pub bit_depth: u8,
    /// 文件大小
    pub file_size: u64,
    /// 实际处理的字节数
    pub bytes_used: u64,
}

/// 支持的格式信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FormatInfo {
    /// 格式名称
    pub name: String,
    /// 格式描述
    pub description: String,
    /// 支持的位深度
    pub supported_depths: Vec<BitDepth>,
    /// 通道数
    pub channels: u8,
}

/// 参数验证结果
#[derive(Debug, Serialize, Deserialize)]
pub struct ValidationResult {
    /// 是否有效
    pub valid: bool,
    /// 错误信息（如果无效）
    pub errors: Vec<String>,
    /// 警告信息
    pub warnings: Vec<String>,
    /// 预计需要的字节数
    pub expected_bytes: Option<u64>,
    /// 文件实际大小
    pub file_size: Option<u64>,
}

/// 熵分析参数
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EntropyAnalysisParams {
    /// 文件路径
    pub file_path: String,
    /// 块大小（字节）
    pub chunk_size: usize,
    /// 步进（字节）
    pub step_size: usize,
    /// 最小熵值
    pub min_entropy: f64,
    /// 最大熵值
    pub max_entropy: f64,
    /// 最小区域大小（字节）
    pub min_size: usize,
    /// 预览宽度
    pub width: u32,
    /// 预览高度
    pub height: u32,
    /// 图像类型
    pub image_type: ImageType,
    /// 每页大小
    #[serde(default = "default_entropy_page_size")]
    pub page_size: usize,
    /// 页码（从 0 开始）
    #[serde(default)]
    pub page: usize,
    /// 排序方式
    #[serde(default)]
    pub sort_mode: EntropySortMode,
}

/// 熵分析区域
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EntropyRegion {
    /// 起始偏移量
    pub offset: u64,
    /// 区域大小
    pub size: u64,
    /// 熵值
    pub entropy: f64,
    /// 建议的图像格式（基于大小推测）
    pub suggested_format: Option<String>,
    /// 预览图（base64编码的PNG图像）
    pub preview_image: Option<String>,
}

/// 熵分析排序方式
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum EntropySortMode {
    /// 熵值高 -> 低
    EntropyHigh,
    /// 熵值低 -> 高
    EntropyLow,
    /// 偏移量升序
    OffsetAsc,
    /// 偏移量降序
    OffsetDesc,
}

impl Default for EntropySortMode {
    fn default() -> Self {
        Self::EntropyHigh
    }
}

/// 熵分析分页请求
#[derive(Debug, Serialize, Deserialize)]
pub struct EntropyPageRequest {
    /// 分析任务 ID
    pub analysis_id: String,
    /// 页码（从 0 开始）
    #[serde(default)]
    pub page: usize,
    /// 每页大小
    #[serde(default = "default_entropy_page_size")]
    pub page_size: usize,
    /// 排序方式
    #[serde(default)]
    pub sort_mode: EntropySortMode,
}

/// 熵分析结果
#[derive(Debug, Serialize, Deserialize)]
pub struct EntropyAnalysisResult {
    /// 是否成功
    pub success: bool,
    /// 消息
    pub message: String,
    /// 找到的区域列表
    pub regions: Vec<EntropyRegion>,
    /// 扫描的总字节数
    pub total_bytes: u64,
    /// 扫描的块数
    pub chunks_scanned: usize,
    /// 实际发现的区域总数
    pub total_regions: usize,
    /// 返回给前端的区域数量
    pub returned_regions: usize,
    /// 是否由于数量过大而截断结果
    pub truncated: bool,
    /// 分析任务 ID
    pub analysis_id: Option<String>,
    /// 当前页码
    #[serde(default)]
    pub page: usize,
    /// 每页大小
    #[serde(default = "default_entropy_page_size")]
    pub page_size: usize,
    /// 总页数
    pub total_pages: usize,
    /// 排序方式
    #[serde(default)]
    pub sort_mode: EntropySortMode,
}

fn default_entropy_page_size() -> usize {
    1000
}
