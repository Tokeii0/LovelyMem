// 内存图像可视化 - 前端类型定义（镜像后端 pixel_weaver::types）
//
// 注意：以下结构体字段用 snake_case，因为它们作为 invoke 的结构体参数，
// 由 Rust serde 按 snake_case 反序列化（命令的顶层参数名才走 camelCase）。

export type ImageType = 'Luma' | 'Rgb' | 'Rgba' | 'Bgr' | 'Bgra';
export type BitDepth = 'B8' | 'B16';
export type Endianness = 'Little' | 'Big' | 'Native';

export interface ImageProcessingParams {
  input_path: string;
  width: number;
  height: number;
  offset: number;
  image_type: ImageType;
  depth: BitDepth;
  endian: Endianness;
}

export interface ImageInfo {
  width: number;
  height: number;
  channels: number;
  bit_depth: number;
  file_size: number;
  bytes_used: number;
}

export interface ProcessingResult {
  success: boolean;
  message: string;
  image_data?: string;
  bytes_processed?: number;
  image_info?: ImageInfo;
}

export interface FormatInfo {
  name: string;
  description: string;
  supported_depths: BitDepth[];
  channels: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  expected_bytes?: number;
  file_size?: number;
}

export interface Resolution {
  width: number;
  height: number;
  label: string;
}

export type EntropySortMode = 'entropy-high' | 'entropy-low' | 'offset-asc' | 'offset-desc';

export interface EntropyAnalysisParams {
  file_path: string;
  chunk_size: number;
  step_size: number;
  min_entropy: number;
  max_entropy: number;
  min_size: number;
  width: number;
  height: number;
  image_type: ImageType;
  page_size?: number;
  page?: number;
  sort_mode?: EntropySortMode;
}

export interface EntropyRegion {
  offset: number;
  size: number;
  entropy: number;
  suggested_format?: string;
  preview_image?: string;
}

export interface EntropyAnalysisResult {
  success: boolean;
  message: string;
  regions: EntropyRegion[];
  total_bytes: number;
  chunks_scanned: number;
  total_regions: number;
  returned_regions: number;
  truncated: boolean;
  analysis_id?: string | null;
  page: number;
  page_size: number;
  total_pages: number;
  sort_mode: EntropySortMode;
}

export interface EntropyPageRequest {
  analysis_id: string;
  page: number;
  page_size: number;
  sort_mode: EntropySortMode;
}

/** 窗口初始参数（由后端 `mem-img-init-{label}` 事件下发） */
export interface InitPayload {
  filePath?: string | null;
  width?: number | null;
  height?: number | null;
}

/** 预设分辨率（前端硬编码，替代旧版从命令行读取的方式） */
export const PRESET_RESOLUTIONS: Resolution[] = [
  { width: 256, height: 256, label: '256×256' },
  { width: 512, height: 512, label: '512×512' },
  { width: 640, height: 480, label: '640×480' },
  { width: 800, height: 600, label: '800×600' },
  { width: 1024, height: 768, label: '1024×768' },
  { width: 1280, height: 720, label: '1280×720' },
  { width: 1920, height: 1080, label: '1920×1080' },
];
