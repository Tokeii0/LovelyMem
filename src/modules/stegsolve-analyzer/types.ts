/**
 * Stegsolve 隐写分析工具 - 共享类型定义
 */

/** 颜色通道 */
export type Channel = 'red' | 'green' | 'blue' | 'alpha';

/** 提取方法 */
export type ExtractionMethod = 'lsb' | 'msb' | 'sequential' | 'reverse' | 'random';

/** 数据显示格式 */
export type DataFormat = 'text' | 'hex' | 'binary';

/** 提取出的数据结构 */
export interface ExtractedData {
    text: string;
    bytes: number[];
    bits: number[];
}

/**
 * 主应用对外暴露给各组件使用的接口子集。
 * 组件通过该接口访问主应用的数据与 UI 方法。
 */
export interface StegsolveApp {
    data: {
        originalImage: HTMLImageElement | null;
        currentImage: HTMLImageElement | null;
        imageData: ImageData | null;
        filename: string;
        filepath: string;
        [key: string]: unknown;
    };
    showLoading(message?: string): void;
    hideLoading(): void;
    showError(message: string): void;
    updateStatus(message: string): void;
    updateCanvasDisplay(imageData: ImageData): void;
    setAnalysisMode(mode: string): void;
    updateStatistics(imageData: ImageData): void;
    getImageStatistics?(imageData: ImageData): ImageStatisticsBasic;
}

/** ImageLoader.getImageStatistics 返回的基础统计信息 */
export interface ImageStatisticsBasic {
    width: number;
    height: number;
    totalPixels: number;
    uniqueColors: number;
    averageColor: { r: number; g: number; b: number };
    averageBrightness: number;
    hasAlpha: boolean;
}

/** 后端 get_file_info / 文件对象的文件信息 */
export interface FileInfo {
    name: string;
    size: number;
    type: string;
    lastModified: number;
}
