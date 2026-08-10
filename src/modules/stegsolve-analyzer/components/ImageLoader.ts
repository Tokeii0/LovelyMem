/**
 * 图像加载器组件
 * 负责图像文件的加载、验证和预处理
 */

import type { FileInfo, ImageStatisticsBasic, StegsolveApp } from '../types';
import { translate } from '../../../i18n';

/** 预加载的图像项 */
export interface PreloadedImage {
    path: string;
    image: HTMLImageElement;
    name: string;
}

export class ImageLoader {
    private app: StegsolveApp;
    readonly supportedFormats: string[];
    readonly maxFileSize: number;

    constructor(app: StegsolveApp) {
        this.app = app;
        this.supportedFormats = ['png', 'jpg', 'jpeg', 'bmp', 'gif', 'tiff', 'webp'];
        this.maxFileSize = 50 * 1024 * 1024; // 50MB
    }

    /**
     * 选择图像文件
     */
    async selectImage(): Promise<void> {
        try {
            // 检查是否在Tauri环境中
            if (typeof (window as any).__TAURI__ === 'undefined') {
                // 非Tauri环境，使用HTML文件输入
                this.selectImageWithFileInput();
                return;
            }

            // 使用Tauri V2的文件对话框API
            const { open } = (window as any).__TAURI__.dialog;

            const selected = await open({
                title: translate('选择图像文件'),
                multiple: false,
                filters: [{
                    name: translate('图像文件'),
                    extensions: this.supportedFormats
                }]
            });

            if (selected && typeof selected === 'object' && 'path' in selected) {
                await this.loadImageFromPath((selected as { path: string }).path);
            } else if (selected && typeof selected === 'string') {
                await this.loadImageFromPath(selected);
            }
        } catch (error) {
            console.error('选择图像文件失败:', error);
            // 降级到HTML文件输入
            this.selectImageWithFileInput();
        }
    }

    /**
     * 使用HTML文件输入选择图像
     */
    selectImageWithFileInput(): void {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = this.supportedFormats.map(ext => `.${ext}`).join(',');

        input.onchange = (event: Event) => {
            const target = event.target as HTMLInputElement;
            const file = target.files?.[0];
            if (file) {
                this.loadImageFile(file);
            }
        };

        input.click();
    }

    /**
     * 从路径加载图像
     */
    async loadImageFromPath(filePath: string): Promise<void> {
        try {
            this.app.showLoading('加载图像文件...');

            // 验证文件格式
            if (!this.validateFileFormat(filePath)) {
                throw new Error('不支持的文件格式');
            }

            // 读取文件信息
            const fileInfo = await this.getFileInfo(filePath);

            // 验证文件大小
            if (fileInfo.size > this.maxFileSize) {
                throw new Error(`文件过大，最大支持 ${this.maxFileSize / 1024 / 1024}MB`);
            }

            // 读取图像数据
            const imageData = await this.readImageFile(filePath);

            // 创建图像对象
            const image = await this.createImageFromData(imageData);

            // 更新应用数据
            this.updateAppData(image, filePath, fileInfo);

            // 显示图像
            await this.displayImage(image);

            this.app.updateStatus(`已加载图像: ${fileInfo.name}`);

        } catch (error) {
            console.error('加载图像失败:', error);
            this.app.showError('加载图像失败: ' + (error instanceof Error ? error.message : String(error)));
        } finally {
            this.app.hideLoading();
        }
    }

    /**
     * 加载图像文件（从File对象）
     */
    async loadImageFile(file: File): Promise<void> {
        try {
            this.app.showLoading('加载图像文件...');

            // 验证文件格式
            if (!this.validateFile(file)) {
                throw new Error('不支持的文件格式或文件过大');
            }

            // 读取文件数据
            const arrayBuffer = await file.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);

            // 创建图像对象
            const image = await this.createImageFromBuffer(uint8Array);

            // 更新应用数据
            this.updateAppData(image, file.name, {
                name: file.name,
                size: file.size,
                type: file.type,
                lastModified: file.lastModified
            });

            // 显示图像
            await this.displayImage(image);

            this.app.updateStatus(`已加载图像: ${file.name}`);

        } catch (error) {
            console.error('加载图像文件失败:', error);
            this.app.showError('加载图像文件失败: ' + (error instanceof Error ? error.message : String(error)));
        } finally {
            this.app.hideLoading();
        }
    }

    /**
     * 验证文件格式
     */
    validateFileFormat(filePath: string): boolean {
        const extension = (filePath.split('.').pop() || '').toLowerCase();
        return this.supportedFormats.includes(extension);
    }

    /**
     * 验证文件对象
     */
    validateFile(file: File): boolean {
        // 检查文件大小
        if (file.size > this.maxFileSize) {
            return false;
        }

        // 检查文件类型
        const validTypes = [
            'image/png', 'image/jpeg', 'image/jpg', 'image/bmp',
            'image/gif', 'image/tiff', 'image/webp'
        ];

        return validTypes.includes(file.type);
    }

    /**
     * 获取文件信息
     */
    async getFileInfo(filePath: string): Promise<FileInfo> {
        try {
            // 检查是否在Tauri环境中
            if (typeof (window as any).__TAURI__ === 'undefined') {
                const fileName = filePath.split(/[/\\]/).pop() || filePath;
                return {
                    name: fileName,
                    size: 0,
                    type: 'unknown',
                    lastModified: Date.now()
                };
            }

            const { invoke } = (window as any).__TAURI__.core;
            return await invoke('get_file_info', { filePath }) as FileInfo;
        } catch (error) {
            // 如果后端命令不可用，返回基本信息
            const fileName = filePath.split(/[/\\]/).pop() || filePath;
            return {
                name: fileName,
                size: 0,
                type: 'unknown',
                lastModified: Date.now()
            };
        }
    }

    /**
     * 读取图像文件
     */
    async readImageFile(filePath: string): Promise<number[]> {
        try {
            // 检查是否在Tauri环境中
            if (typeof (window as any).__TAURI__ === 'undefined') {
                throw new Error('文件读取需要Tauri环境支持');
            }

            const { invoke } = (window as any).__TAURI__.core;
            return await invoke('read_file_bytes', { filePath }) as number[];
        } catch (error) {
            throw new Error('无法读取图像文件: ' + (error instanceof Error ? error.message : String(error)));
        }
    }

    /**
     * 从数据创建图像对象
     */
    async createImageFromData(imageData: number[] | Uint8Array): Promise<HTMLImageElement> {
        return new Promise<HTMLImageElement>((resolve, reject) => {
            const blob = new Blob([new Uint8Array(imageData)]);
            const url = URL.createObjectURL(blob);

            const image = new Image();
            image.onload = () => {
                URL.revokeObjectURL(url);
                resolve(image);
            };
            image.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('无法解析图像数据'));
            };
            image.src = url;
        });
    }

    /**
     * 从缓冲区创建图像对象
     */
    async createImageFromBuffer(buffer: Uint8Array): Promise<HTMLImageElement> {
        return new Promise<HTMLImageElement>((resolve, reject) => {
            const blob = new Blob([buffer]);
            const url = URL.createObjectURL(blob);

            const image = new Image();
            image.onload = () => {
                URL.revokeObjectURL(url);
                resolve(image);
            };
            image.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('无法解析图像数据'));
            };
            image.src = url;
        });
    }

    /**
     * 更新应用数据
     */
    updateAppData(image: HTMLImageElement, filePath: string, fileInfo: FileInfo): void {
        this.app.data.originalImage = image;
        this.app.data.currentImage = image;
        this.app.data.filename = fileInfo.name;
        this.app.data.filepath = filePath;

        // 更新图像信息显示
        this.updateImageInfo(image, fileInfo);
    }

    /**
     * 显示图像
     */
    async displayImage(image: HTMLImageElement): Promise<void> {
        try {
            // 创建Canvas并获取图像数据
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                throw new Error('无法获取 Canvas 2D 上下文');
            }

            canvas.width = image.width;
            canvas.height = image.height;

            ctx.drawImage(image, 0, 0);

            // 获取图像数据
            const imageData = ctx.getImageData(0, 0, image.width, image.height);
            this.app.data.imageData = imageData;

            // 更新主Canvas显示
            this.app.updateCanvasDisplay(imageData);

            // 重置分析模式为原图
            this.app.setAnalysisMode('original');

            // 计算并显示统计信息
            this.app.updateStatistics(imageData);

        } catch (error) {
            throw new Error('显示图像失败: ' + (error instanceof Error ? error.message : String(error)));
        }
    }

    /**
     * 更新图像信息显示
     */
    updateImageInfo(image: HTMLImageElement, fileInfo: FileInfo): void {
        // 显示信息图标
        const imageInfoIcon = document.getElementById('imageInfoIcon');
        if (imageInfoIcon) {
            imageInfoIcon.style.display = 'block';
        }

        // 更新tooltip中的信息
        const dimensionsElement = document.getElementById('tooltipImageDimensions');
        if (dimensionsElement) {
            dimensionsElement.textContent = `${image.width} × ${image.height}`;
        }

        const formatElement = document.getElementById('tooltipImageFormat');
        if (formatElement) {
            const extension = (fileInfo.name.split('.').pop() || '').toUpperCase();
            formatElement.textContent = extension;
        }

        const sizeElement = document.getElementById('tooltipImageSize');
        if (sizeElement) {
            sizeElement.textContent = this.formatFileSize(fileInfo.size);
        }

        const colorDepthElement = document.getElementById('tooltipColorDepth');
        if (colorDepthElement) {
            // 简单检测，实际应该根据图像数据分析
            colorDepthElement.textContent = '24位 (RGB)';
        }
    }

    /**
     * 格式化文件大小
     */
    formatFileSize(bytes: number): string {
        if (bytes === 0) return '0 B';

        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * 预加载图像（用于批量处理）
     */
    async preloadImages(filePaths: string[]): Promise<PreloadedImage[]> {
        const images: PreloadedImage[] = [];

        for (const filePath of filePaths) {
            try {
                const imageData = await this.readImageFile(filePath);
                const image = await this.createImageFromData(imageData);
                images.push({
                    path: filePath,
                    image: image,
                    name: filePath.split(/[/\\]/).pop() || filePath
                });
            } catch (error) {
                console.warn(`预加载图像失败: ${filePath}`, error);
            }
        }

        return images;
    }

    /**
     * 检查图像是否有Alpha通道
     */
    hasAlphaChannel(imageData: ImageData): boolean {
        const data = imageData.data;

        // 检查Alpha通道是否有变化
        for (let i = 3; i < data.length; i += 4) {
            if (data[i] !== 255) {
                return true;
            }
        }

        return false;
    }

    /**
     * 获取图像基本统计信息
     */
    getImageStatistics(imageData: ImageData): ImageStatisticsBasic {
        const data = imageData.data;
        const width = imageData.width;
        const height = imageData.height;
        const totalPixels = width * height;

        let totalR = 0, totalG = 0, totalB = 0;
        const colorSet = new Set<string>();

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            totalR += r;
            totalG += g;
            totalB += b;

            // 创建颜色字符串用于统计唯一颜色
            const colorKey = `${r},${g},${b}`;
            colorSet.add(colorKey);
        }

        const avgR = Math.round(totalR / totalPixels);
        const avgG = Math.round(totalG / totalPixels);
        const avgB = Math.round(totalB / totalPixels);
        const avgBrightness = Math.round((avgR + avgG + avgB) / 3);

        return {
            width,
            height,
            totalPixels,
            uniqueColors: colorSet.size,
            averageColor: { r: avgR, g: avgG, b: avgB },
            averageBrightness: avgBrightness,
            hasAlpha: this.hasAlphaChannel(imageData)
        };
    }
}
