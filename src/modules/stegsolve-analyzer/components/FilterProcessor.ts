/**
 * 过滤器处理器组件
 * 负责各种图像过滤器和变换的应用
 */

import type { StegsolveApp } from '../types';

/** 过滤器类型 */
export type FilterType = 'invert' | 'xor' | 'add' | 'sub' | 'mul' | 'and' | 'or';

/** 边缘检测算子类型 */
export type EdgeDetectionType = 'sobel' | 'prewitt';

/** 卷积核 (二维数字数组) */
export type Kernel = number[][];

export class FilterProcessor {
    private app: StegsolveApp;
    private filters: Record<FilterType, string>;
    private customValue: number; // 用于数学运算的自定义值

    constructor(app: StegsolveApp) {
        this.app = app;
        this.filters = {
            'invert': '反色',
            'xor': 'XOR',
            'add': '加法',
            'sub': '减法',
            'mul': '乘法',
            'and': 'AND',
            'or': 'OR'
        };
        this.customValue = 128;
    }

    /**
     * 应用过滤器
     */
    applyFilter(imageData: ImageData, filterType: string, value: number | null = null): ImageData {
        switch (filterType) {
            case 'invert':
                return this.invertColors(imageData);
            case 'xor':
                return this.xorFilter(imageData, value ?? this.customValue);
            case 'add':
                return this.addFilter(imageData, value ?? this.customValue);
            case 'sub':
                return this.subtractFilter(imageData, value ?? this.customValue);
            case 'mul':
                return this.multiplyFilter(imageData, value ?? 2);
            case 'and':
                return this.andFilter(imageData, value ?? this.customValue);
            case 'or':
                return this.orFilter(imageData, value ?? this.customValue);
            default:
                return imageData;
        }
    }

    /**
     * 反色过滤器
     */
    invertColors(imageData: ImageData): ImageData {
        const width = imageData.width;
        const height = imageData.height;
        const data = new Uint8ClampedArray(imageData.data);

        for (let i = 0; i < data.length; i += 4) {
            data[i] = 255 - data[i];         // R
            data[i + 1] = 255 - data[i + 1]; // G
            data[i + 2] = 255 - data[i + 2]; // B
            // Alpha通道保持不变
        }

        return new ImageData(data, width, height);
    }

    /**
     * XOR过滤器
     */
    xorFilter(imageData: ImageData, value: number): ImageData {
        const width = imageData.width;
        const height = imageData.height;
        const data = new Uint8ClampedArray(imageData.data);

        for (let i = 0; i < data.length; i += 4) {
            data[i] = data[i] ^ value;         // R
            data[i + 1] = data[i + 1] ^ value; // G
            data[i + 2] = data[i + 2] ^ value; // B
        }

        return new ImageData(data, width, height);
    }

    /**
     * 加法过滤器
     */
    addFilter(imageData: ImageData, value: number): ImageData {
        const width = imageData.width;
        const height = imageData.height;
        const data = new Uint8ClampedArray(imageData.data);

        for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.min(255, data[i] + value);         // R
            data[i + 1] = Math.min(255, data[i + 1] + value); // G
            data[i + 2] = Math.min(255, data[i + 2] + value); // B
        }

        return new ImageData(data, width, height);
    }

    /**
     * 减法过滤器
     */
    subtractFilter(imageData: ImageData, value: number): ImageData {
        const width = imageData.width;
        const height = imageData.height;
        const data = new Uint8ClampedArray(imageData.data);

        for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.max(0, data[i] - value);         // R
            data[i + 1] = Math.max(0, data[i + 1] - value); // G
            data[i + 2] = Math.max(0, data[i + 2] - value); // B
        }

        return new ImageData(data, width, height);
    }

    /**
     * 乘法过滤器
     */
    multiplyFilter(imageData: ImageData, factor: number): ImageData {
        const width = imageData.width;
        const height = imageData.height;
        const data = new Uint8ClampedArray(imageData.data);

        for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.min(255, Math.round(data[i] * factor));         // R
            data[i + 1] = Math.min(255, Math.round(data[i + 1] * factor)); // G
            data[i + 2] = Math.min(255, Math.round(data[i + 2] * factor)); // B
        }

        return new ImageData(data, width, height);
    }

    /**
     * AND过滤器
     */
    andFilter(imageData: ImageData, value: number): ImageData {
        const width = imageData.width;
        const height = imageData.height;
        const data = new Uint8ClampedArray(imageData.data);

        for (let i = 0; i < data.length; i += 4) {
            data[i] = data[i] & value;         // R
            data[i + 1] = data[i + 1] & value; // G
            data[i + 2] = data[i + 2] & value; // B
        }

        return new ImageData(data, width, height);
    }

    /**
     * OR过滤器
     */
    orFilter(imageData: ImageData, value: number): ImageData {
        const width = imageData.width;
        const height = imageData.height;
        const data = new Uint8ClampedArray(imageData.data);

        for (let i = 0; i < data.length; i += 4) {
            data[i] = data[i] | value;         // R
            data[i + 1] = data[i + 1] | value; // G
            data[i + 2] = data[i + 2] | value; // B
        }

        return new ImageData(data, width, height);
    }

    /**
     * 高通过滤器
     */
    highPassFilter(imageData: ImageData): ImageData {
        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;
        const newData = new Uint8ClampedArray(width * height * 4);

        // 高通滤波器核
        const kernel: Kernel = [
            [-1, -1, -1],
            [-1, 8, -1],
            [-1, -1, -1]
        ];

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                let r = 0, g = 0, b = 0;

                // 应用卷积核
                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        const pixelIndex = ((y + ky) * width + (x + kx)) * 4;
                        const weight = kernel[ky + 1][kx + 1];

                        r += data[pixelIndex] * weight;
                        g += data[pixelIndex + 1] * weight;
                        b += data[pixelIndex + 2] * weight;
                    }
                }

                const outputIndex = (y * width + x) * 4;
                newData[outputIndex] = Math.max(0, Math.min(255, r));
                newData[outputIndex + 1] = Math.max(0, Math.min(255, g));
                newData[outputIndex + 2] = Math.max(0, Math.min(255, b));
                newData[outputIndex + 3] = 255;
            }
        }

        return new ImageData(newData, width, height);
    }

    /**
     * 低通过滤器（模糊）
     */
    lowPassFilter(imageData: ImageData): ImageData {
        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;
        const newData = new Uint8ClampedArray(width * height * 4);

        // 低通滤波器核（高斯模糊）
        const kernel: Kernel = [
            [1, 2, 1],
            [2, 4, 2],
            [1, 2, 1]
        ];
        const kernelSum = 16;

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                let r = 0, g = 0, b = 0;

                // 应用卷积核
                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        const pixelIndex = ((y + ky) * width + (x + kx)) * 4;
                        const weight = kernel[ky + 1][kx + 1];

                        r += data[pixelIndex] * weight;
                        g += data[pixelIndex + 1] * weight;
                        b += data[pixelIndex + 2] * weight;
                    }
                }

                const outputIndex = (y * width + x) * 4;
                newData[outputIndex] = r / kernelSum;
                newData[outputIndex + 1] = g / kernelSum;
                newData[outputIndex + 2] = b / kernelSum;
                newData[outputIndex + 3] = 255;
            }
        }

        return new ImageData(newData, width, height);
    }

    /**
     * 边缘检测过滤器
     */
    edgeDetectionFilter(imageData: ImageData, type: EdgeDetectionType = 'sobel'): ImageData {
        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;
        const newData = new Uint8ClampedArray(width * height * 4);

        let kernelX: Kernel;
        let kernelY: Kernel;

        switch (type) {
            case 'sobel':
                kernelX = [
                    [-1, 0, 1],
                    [-2, 0, 2],
                    [-1, 0, 1]
                ];
                kernelY = [
                    [-1, -2, -1],
                    [0, 0, 0],
                    [1, 2, 1]
                ];
                break;
            case 'prewitt':
                kernelX = [
                    [-1, 0, 1],
                    [-1, 0, 1],
                    [-1, 0, 1]
                ];
                kernelY = [
                    [-1, -1, -1],
                    [0, 0, 0],
                    [1, 1, 1]
                ];
                break;
            default:
                return imageData;
        }

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                let gx = 0, gy = 0;

                // 应用卷积核
                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        const pixelIndex = ((y + ky) * width + (x + kx)) * 4;
                        const gray = (data[pixelIndex] + data[pixelIndex + 1] + data[pixelIndex + 2]) / 3;

                        gx += gray * kernelX[ky + 1][kx + 1];
                        gy += gray * kernelY[ky + 1][kx + 1];
                    }
                }

                const magnitude = Math.sqrt(gx * gx + gy * gy);
                const outputIndex = (y * width + x) * 4;

                newData[outputIndex] = magnitude;
                newData[outputIndex + 1] = magnitude;
                newData[outputIndex + 2] = magnitude;
                newData[outputIndex + 3] = 255;
            }
        }

        return new ImageData(newData, width, height);
    }

    /**
     * 对比度增强
     */
    enhanceContrast(imageData: ImageData, factor: number = 1.5): ImageData {
        const width = imageData.width;
        const height = imageData.height;
        const data = new Uint8ClampedArray(imageData.data);

        for (let i = 0; i < data.length; i += 4) {
            // 对每个颜色通道应用对比度增强
            data[i] = Math.max(0, Math.min(255, (data[i] - 128) * factor + 128));
            data[i + 1] = Math.max(0, Math.min(255, (data[i + 1] - 128) * factor + 128));
            data[i + 2] = Math.max(0, Math.min(255, (data[i + 2] - 128) * factor + 128));
        }

        return new ImageData(data, width, height);
    }

    /**
     * 亮度调整
     */
    adjustBrightness(imageData: ImageData, adjustment: number): ImageData {
        const width = imageData.width;
        const height = imageData.height;
        const data = new Uint8ClampedArray(imageData.data);

        for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.max(0, Math.min(255, data[i] + adjustment));
            data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + adjustment));
            data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + adjustment));
        }

        return new ImageData(data, width, height);
    }

    /**
     * 伽马校正
     */
    gammaCorrection(imageData: ImageData, gamma: number): ImageData {
        const width = imageData.width;
        const height = imageData.height;
        const data = new Uint8ClampedArray(imageData.data);

        // 预计算伽马查找表
        const gammaTable = new Array<number>(256);
        for (let i = 0; i < 256; i++) {
            gammaTable[i] = Math.round(255 * Math.pow(i / 255, 1 / gamma));
        }

        for (let i = 0; i < data.length; i += 4) {
            data[i] = gammaTable[data[i]];
            data[i + 1] = gammaTable[data[i + 1]];
            data[i + 2] = gammaTable[data[i + 2]];
        }

        return new ImageData(data, width, height);
    }

    /**
     * 直方图均衡化
     */
    histogramEqualization(imageData: ImageData): ImageData {
        const width = imageData.width;
        const height = imageData.height;
        const data = new Uint8ClampedArray(imageData.data);
        const totalPixels = width * height;

        // 计算灰度直方图
        const histogram = new Array<number>(256).fill(0);
        for (let i = 0; i < data.length; i += 4) {
            const gray = Math.round((data[i] + data[i + 1] + data[i + 2]) / 3);
            histogram[gray]++;
        }

        // 计算累积分布函数
        const cdf = new Array<number>(256);
        cdf[0] = histogram[0];
        for (let i = 1; i < 256; i++) {
            cdf[i] = cdf[i - 1] + histogram[i];
        }

        // 创建映射表
        const mapping = new Array<number>(256);
        for (let i = 0; i < 256; i++) {
            mapping[i] = Math.round((cdf[i] / totalPixels) * 255);
        }

        // 应用映射
        for (let i = 0; i < data.length; i += 4) {
            const gray = Math.round((data[i] + data[i + 1] + data[i + 2]) / 3);
            const newGray = mapping[gray];

            data[i] = newGray;
            data[i + 1] = newGray;
            data[i + 2] = newGray;
        }

        return new ImageData(data, width, height);
    }

    /**
     * 自定义卷积过滤器
     */
    customConvolution(imageData: ImageData, kernel: Kernel, divisor: number | null = null): ImageData {
        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;
        const newData = new Uint8ClampedArray(width * height * 4);

        const kernelSize = kernel.length;
        const halfKernel = Math.floor(kernelSize / 2);

        // 计算除数（如果未提供）
        let effectiveDivisor = divisor;
        if (effectiveDivisor === null) {
            effectiveDivisor = kernel.flat().reduce((sum, val) => sum + val, 0) || 1;
        }

        for (let y = halfKernel; y < height - halfKernel; y++) {
            for (let x = halfKernel; x < width - halfKernel; x++) {
                let r = 0, g = 0, b = 0;

                // 应用卷积核
                for (let ky = 0; ky < kernelSize; ky++) {
                    for (let kx = 0; kx < kernelSize; kx++) {
                        const pixelY = y + ky - halfKernel;
                        const pixelX = x + kx - halfKernel;
                        const pixelIndex = (pixelY * width + pixelX) * 4;
                        const weight = kernel[ky][kx];

                        r += data[pixelIndex] * weight;
                        g += data[pixelIndex + 1] * weight;
                        b += data[pixelIndex + 2] * weight;
                    }
                }

                const outputIndex = (y * width + x) * 4;
                newData[outputIndex] = Math.max(0, Math.min(255, r / effectiveDivisor));
                newData[outputIndex + 1] = Math.max(0, Math.min(255, g / effectiveDivisor));
                newData[outputIndex + 2] = Math.max(0, Math.min(255, b / effectiveDivisor));
                newData[outputIndex + 3] = 255;
            }
        }

        return new ImageData(newData, width, height);
    }

    /**
     * 获取预定义的卷积核
     */
    getPredefinedKernels(): Record<string, Kernel> {
        return {
            blur: [
                [1, 1, 1],
                [1, 1, 1],
                [1, 1, 1]
            ],
            sharpen: [
                [0, -1, 0],
                [-1, 5, -1],
                [0, -1, 0]
            ],
            emboss: [
                [-2, -1, 0],
                [-1, 1, 1],
                [0, 1, 2]
            ],
            outline: [
                [-1, -1, -1],
                [-1, 8, -1],
                [-1, -1, -1]
            ]
        };
    }

    /**
     * 设置自定义值
     */
    setCustomValue(value: number): void {
        this.customValue = Math.max(0, Math.min(255, value));
    }

    /**
     * 获取当前自定义值
     */
    getCustomValue(): number {
        return this.customValue;
    }
}
