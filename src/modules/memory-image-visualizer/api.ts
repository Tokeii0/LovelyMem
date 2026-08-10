// 内存图像可视化 - 后端命令封装
//
// 复用 pixel_weaver 后端命令；dump 与开窗为本项目合并时新增的命令。

import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { translate } from '../../i18n';
import type {
  ImageProcessingParams,
  ProcessingResult,
  FormatInfo,
  ValidationResult,
  EntropyAnalysisParams,
  EntropyAnalysisResult,
  EntropyPageRequest,
} from './types';

/** 把原始数据按参数解释为 PNG，返回 base64（image_data）。 */
export function processRawImage(params: ImageProcessingParams): Promise<ProcessingResult> {
  return invoke<ProcessingResult>('process_raw_image', { params });
}

/** 支持的像素格式列表。 */
export function getSupportedFormats(): Promise<FormatInfo[]> {
  return invoke<FormatInfo[]>('get_supported_formats');
}

/** 校验参数（文件存在性、偏移/尺寸是否越界等）。 */
export function validateParameters(params: ImageProcessingParams): Promise<ValidationResult> {
  return invoke<ValidationResult>('validate_parameters', { params });
}

/** 熵值分析：扫描高熵（疑似图像）区域，返回首页 + analysis_id。 */
export function analyzeEntropy(params: EntropyAnalysisParams): Promise<EntropyAnalysisResult> {
  const payload: EntropyAnalysisParams = {
    ...params,
    page_size: params.page_size ?? 1000,
    page: params.page ?? 0,
    sort_mode: params.sort_mode ?? 'entropy-high',
  };
  return invoke<EntropyAnalysisResult>('analyze_entropy', { params: payload });
}

/** 翻页/重排熵值分析结果（依赖 analysis_id 缓存）。 */
export function fetchEntropyPage(request: EntropyPageRequest): Promise<EntropyAnalysisResult> {
  return invoke<EntropyAnalysisResult>('fetch_entropy_page', { request });
}

/** dump 指定进程内存（vol3 windows.memmap --dump），返回 dump 文件绝对路径。 */
export function dumpProcessMemory(pid: number, outputDir?: string | null): Promise<string> {
  return invoke<string>('dump_process_memory', { pid, outputDir: outputDir ?? null });
}

/** 打开（可多开）内存图像可视化窗口，可带初始文件路径/尺寸。 */
export function openVisualizerWindow(
  initialFilePath?: string | null,
  initialWidth?: number | null,
  initialHeight?: number | null,
): Promise<void> {
  return invoke('open_memory_image_visualizer_window', {
    initialFilePath: initialFilePath ?? null,
    initialWidth: initialWidth ?? null,
    initialHeight: initialHeight ?? null,
  });
}

/** 取消正在进行的 memmap dump。 */
export async function cancelMemmapDump(): Promise<void> {
  try {
    await invoke('cancel_volatility3', { plugin: 'memmap' });
  } catch {
    /* 忽略：没有正在运行的命令时也会返回，无需处理 */
  }
}

/** 文件选择对话框，返回所选文件绝对路径。 */
export async function selectInputFile(): Promise<string | null> {
  const sel = await open({
    title: translate('选择要可视化的文件'),
    multiple: false,
    filters: [
      { name: translate('所有文件'), extensions: ['*'] },
      { name: translate('内存/转储'), extensions: ['bin', 'data', 'raw', 'dmp', 'dump', 'mem'] },
    ],
  });
  return typeof sel === 'string' ? sel : null;
}
