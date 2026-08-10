/**
 * 通道分析器组件
 * 负责RGB、HSV、YUV等颜色空间的通道分析
 */

import type { Channel, StegsolveApp } from '../types';

/** HSV 颜色 */
export interface HSVColor {
    h: number;
    s: number;
    v: number;
}

/** YUV 颜色 */
export interface YUVColor {
    y: number;
    u: number;
    v: number;
}

/** RGB 颜色 */
export interface RGBColor {
    r: number;
    g: number;
    b: number;
}

/** 浮点通道数据（HSV / YUV 等中间表示） */
export interface FloatChannelData {
    width: number;
    height: number;
    data: Float32Array;
    channels: string[];
}

/** 分离后的通道集合 */
export interface SeparatedChannels {
    red: ImageData;
    green: ImageData;
    blue: ImageData;
    alpha?: ImageData;
}

/** 所有通道直方图 */
export interface AllHistograms {
    red: number[];
    green: number[];
    blue: number[];
    alpha: number[] | null;
}

/** 单通道统计信息 */
export interface ChannelStatistics {
    min: number;
    max: number;
    mean: number;
    stdDev: number;
    range: number;
}

/** 通道混合模式 */
export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay';

/** 获取通道在像素数据中的偏移量 */
function getChannelOffset(channel: Channel): number {
    switch (channel) {
        case 'red': return 0;
        case 'green': return 1;
        case 'blue': return 2;
        case 'alpha': return 3;
        default: return 0;
    }
}

export class ChannelAnalyzer {
    private app: StegsolveApp;
    readonly channels: Channel[];
    readonly colorSpaces: string[];

    constructor(app: StegsolveApp) {
        this.app = app;
        this.channels = ['red', 'green', 'blue', 'alpha'];
        this.colorSpaces = ['rgb', 'hsv', 'yuv', 'lab'];
    }

    /**
     * 提取指定通道
     */
    extractChannel(imageData: ImageData, channel: Channel): ImageData {
        const width = imageData.width;
        const height = imageData.height;
        const data = new Uint8ClampedArray(imageData.data);
        const newData = new Uint8ClampedArray(width * height * 4);

        for (let i = 0; i < data.length; i += 4) {
            let value = 0;

            switch (channel) {
                case 'red':
                    value = data[i];
                    break;
                case 'green':
                    value = data[i + 1];
                    break;
                case 'blue':
                    value = data[i + 2];
                    break;
                case 'alpha':
                    value = data[i + 3];
                    break;
                default:
                    value = 0;
            }

            // 根据通道类型显示彩色通道
            switch (channel) {
                case 'red':
                    newData[i] = value;     // R
                    newData[i + 1] = 0;     // G
                    newData[i + 2] = 0;     // B
                    break;
                case 'green':
                    newData[i] = 0;         // R
                    newData[i + 1] = value; // G
                    newData[i + 2] = 0;     // B
                    break;
                case 'blue':
                    newData[i] = 0;         // R
                    newData[i + 1] = 0;     // G
                    newData[i + 2] = value; // B
                    break;
                case 'alpha':
                    // Alpha通道显示为灰度
                    newData[i] = value;     // R
                    newData[i + 1] = value; // G
                    newData[i + 2] = value; // B
                    break;
                default:
                    newData[i] = 0;
                    newData[i + 1] = 0;
                    newData[i + 2] = 0;
            }
            newData[i + 3] = 255;   // A
        }

        return new ImageData(newData, width, height);
    }

    /**
     * 转换为灰度图像
     */
    convertToGrayscale(imageData: ImageData): ImageData {
        const width = imageData.width;
        const height = imageData.height;
        const data = new Uint8ClampedArray(imageData.data);
        const newData = new Uint8ClampedArray(width * height * 4);

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            // 使用标准灰度转换公式
            const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

            newData[i] = gray;     // R
            newData[i + 1] = gray; // G
            newData[i + 2] = gray; // B
            newData[i + 3] = 255;  // A
        }

        return new ImageData(newData, width, height);
    }

    /**
     * 分离所有RGB通道
     */
    separateRGBChannels(imageData: ImageData): SeparatedChannels {
        const channels: SeparatedChannels = {
            red: this.extractChannel(imageData, 'red'),
            green: this.extractChannel(imageData, 'green'),
            blue: this.extractChannel(imageData, 'blue')
        };

        if (this.hasAlphaChannel(imageData)) {
            channels.alpha = this.extractChannel(imageData, 'alpha');
        }

        return channels;
    }

    /**
     * 转换到HSV颜色空间
     */
    convertToHSV(imageData: ImageData): FloatChannelData {
        const width = imageData.width;
        const height = imageData.height;
        const data = new Uint8ClampedArray(imageData.data);
        const hsvData = new Float32Array(width * height * 3);

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i] / 255;
            const g = data[i + 1] / 255;
            const b = data[i + 2] / 255;

            const hsv = this.rgbToHsv(r, g, b);
            const pixelIndex = (i / 4) * 3;

            hsvData[pixelIndex] = hsv.h;
            hsvData[pixelIndex + 1] = hsv.s;
            hsvData[pixelIndex + 2] = hsv.v;
        }

        return {
            width,
            height,
            data: hsvData,
            channels: ['hue', 'saturation', 'value']
        };
    }

    /**
     * 提取HSV通道
     */
    extractHSVChannel(hsvData: FloatChannelData, channel: 'hue' | 'saturation' | 'value'): ImageData {
        const width = hsvData.width;
        const height = hsvData.height;
        const data = hsvData.data;
        const newData = new Uint8ClampedArray(width * height * 4);

        let channelIndex = 0;
        switch (channel) {
            case 'hue':
                channelIndex = 0;
                break;
            case 'saturation':
                channelIndex = 1;
                break;
            case 'value':
                channelIndex = 2;
                break;
        }

        for (let i = 0; i < width * height; i++) {
            const dataIndex = i * 3 + channelIndex;
            let value = 0;

            if (channel === 'hue') {
                // 色相值范围0-360，转换为0-255
                value = Math.round((data[dataIndex] / 360) * 255);
            } else {
                // 饱和度和明度值范围0-1，转换为0-255
                value = Math.round(data[dataIndex] * 255);
            }

            const pixelIndex = i * 4;
            newData[pixelIndex] = value;     // R
            newData[pixelIndex + 1] = value; // G
            newData[pixelIndex + 2] = value; // B
            newData[pixelIndex + 3] = 255;   // A
        }

        return new ImageData(newData, width, height);
    }

    /**
     * RGB到HSV转换
     */
    rgbToHsv(r: number, g: number, b: number): HSVColor {
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const delta = max - min;

        let h = 0;
        let s = 0;
        const v = max;

        if (delta !== 0) {
            s = delta / max;

            switch (max) {
                case r:
                    h = ((g - b) / delta) % 6;
                    break;
                case g:
                    h = (b - r) / delta + 2;
                    break;
                case b:
                    h = (r - g) / delta + 4;
                    break;
            }

            h *= 60;
            if (h < 0) h += 360;
        }

        return { h, s, v };
    }

    /**
     * HSV到RGB转换
     */
    hsvToRgb(h: number, s: number, v: number): RGBColor {
        const c = v * s;
        const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
        const m = v - c;

        let r = 0, g = 0, b = 0;

        if (h >= 0 && h < 60) {
            r = c; g = x; b = 0;
        } else if (h >= 60 && h < 120) {
            r = x; g = c; b = 0;
        } else if (h >= 120 && h < 180) {
            r = 0; g = c; b = x;
        } else if (h >= 180 && h < 240) {
            r = 0; g = x; b = c;
        } else if (h >= 240 && h < 300) {
            r = x; g = 0; b = c;
        } else if (h >= 300 && h < 360) {
            r = c; g = 0; b = x;
        }

        return {
            r: Math.round((r + m) * 255),
            g: Math.round((g + m) * 255),
            b: Math.round((b + m) * 255)
        };
    }

    /**
     * 转换到YUV颜色空间
     */
    convertToYUV(imageData: ImageData): FloatChannelData {
        const width = imageData.width;
        const height = imageData.height;
        const data = new Uint8ClampedArray(imageData.data);
        const yuvData = new Float32Array(width * height * 3);

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            const yuv = this.rgbToYuv(r, g, b);
            const pixelIndex = (i / 4) * 3;

            yuvData[pixelIndex] = yuv.y;
            yuvData[pixelIndex + 1] = yuv.u;
            yuvData[pixelIndex + 2] = yuv.v;
        }

        return {
            width,
            height,
            data: yuvData,
            channels: ['y', 'u', 'v']
        };
    }

    /**
     * RGB到YUV转换
     */
    rgbToYuv(r: number, g: number, b: number): YUVColor {
        const y = 0.299 * r + 0.587 * g + 0.114 * b;
        const u = -0.14713 * r - 0.28886 * g + 0.436 * b;
        const v = 0.615 * r - 0.51499 * g - 0.10001 * b;

        return { y, u, v };
    }

    /**
     * 提取YUV通道
     */
    extractYUVChannel(yuvData: FloatChannelData, channel: 'y' | 'u' | 'v'): ImageData {
        const width = yuvData.width;
        const height = yuvData.height;
        const data = yuvData.data;
        const newData = new Uint8ClampedArray(width * height * 4);

        let channelIndex = 0;
        switch (channel) {
            case 'y':
                channelIndex = 0;
                break;
            case 'u':
                channelIndex = 1;
                break;
            case 'v':
                channelIndex = 2;
                break;
        }

        for (let i = 0; i < width * height; i++) {
            const dataIndex = i * 3 + channelIndex;
            let value = data[dataIndex];

            // 对于U和V通道，需要进行范围调整
            if (channel === 'u' || channel === 'v') {
                value = Math.round(value + 128); // 调整到0-255范围
            }

            value = Math.max(0, Math.min(255, Math.round(value)));

            const pixelIndex = i * 4;
            newData[pixelIndex] = value;     // R
            newData[pixelIndex + 1] = value; // G
            newData[pixelIndex + 2] = value; // B
            newData[pixelIndex + 3] = 255;   // A
        }

        return new ImageData(newData, width, height);
    }

    /**
     * 计算通道直方图
     */
    calculateChannelHistogram(imageData: ImageData, channel: Channel): number[] {
        const data = imageData.data;
        const histogram = new Array<number>(256).fill(0);

        const channelOffset = getChannelOffset(channel);

        for (let i = channelOffset; i < data.length; i += 4) {
            histogram[data[i]]++;
        }

        return histogram;
    }

    /**
     * 计算所有通道的直方图
     */
    calculateAllHistograms(imageData: ImageData): AllHistograms {
        return {
            red: this.calculateChannelHistogram(imageData, 'red'),
            green: this.calculateChannelHistogram(imageData, 'green'),
            blue: this.calculateChannelHistogram(imageData, 'blue'),
            alpha: this.hasAlphaChannel(imageData) ?
                this.calculateChannelHistogram(imageData, 'alpha') : null
        };
    }

    /**
     * 通道统计信息
     */
    getChannelStatistics(imageData: ImageData, channel: Channel): ChannelStatistics {
        const data = imageData.data;
        const channelOffset = getChannelOffset(channel);

        let min = 255;
        let max = 0;
        let sum = 0;
        let count = 0;

        for (let i = channelOffset; i < data.length; i += 4) {
            const value = data[i];
            min = Math.min(min, value);
            max = Math.max(max, value);
            sum += value;
            count++;
        }

        const mean = sum / count;

        // 计算标准差
        let variance = 0;
        for (let i = channelOffset; i < data.length; i += 4) {
            const value = data[i];
            variance += Math.pow(value - mean, 2);
        }
        const stdDev = Math.sqrt(variance / count);

        return {
            min,
            max,
            mean: Math.round(mean),
            stdDev: Math.round(stdDev),
            range: max - min
        };
    }

    /**
     * 检查是否有Alpha通道
     */
    hasAlphaChannel(imageData: ImageData): boolean {
        const data = imageData.data;

        for (let i = 3; i < data.length; i += 4) {
            if (data[i] !== 255) {
                return true;
            }
        }

        return false;
    }

    /**
     * 通道混合
     */
    blendChannels(imageData1: ImageData, imageData2: ImageData, mode: BlendMode = 'normal', opacity: number = 0.5): ImageData {
        const width = Math.min(imageData1.width, imageData2.width);
        const height = Math.min(imageData1.height, imageData2.height);
        const newData = new Uint8ClampedArray(width * height * 4);

        for (let i = 0; i < newData.length; i += 4) {
            const r1 = imageData1.data[i];
            const g1 = imageData1.data[i + 1];
            const b1 = imageData1.data[i + 2];

            const r2 = imageData2.data[i];
            const g2 = imageData2.data[i + 1];
            const b2 = imageData2.data[i + 2];

            let r: number, g: number, b: number;

            switch (mode) {
                case 'multiply':
                    r = (r1 * r2) / 255;
                    g = (g1 * g2) / 255;
                    b = (b1 * b2) / 255;
                    break;
                case 'screen':
                    r = 255 - ((255 - r1) * (255 - r2)) / 255;
                    g = 255 - ((255 - g1) * (255 - g2)) / 255;
                    b = 255 - ((255 - b1) * (255 - b2)) / 255;
                    break;
                case 'overlay':
                    r = r1 < 128 ? (2 * r1 * r2) / 255 : 255 - (2 * (255 - r1) * (255 - r2)) / 255;
                    g = g1 < 128 ? (2 * g1 * g2) / 255 : 255 - (2 * (255 - g1) * (255 - g2)) / 255;
                    b = b1 < 128 ? (2 * b1 * b2) / 255 : 255 - (2 * (255 - b1) * (255 - b2)) / 255;
                    break;
                default: // normal
                    r = r1 * (1 - opacity) + r2 * opacity;
                    g = g1 * (1 - opacity) + g2 * opacity;
                    b = b1 * (1 - opacity) + b2 * opacity;
            }

            newData[i] = Math.round(r);
            newData[i + 1] = Math.round(g);
            newData[i + 2] = Math.round(b);
            newData[i + 3] = 255;
        }

        return new ImageData(newData, width, height);
    }

    /**
     * 通道增强
     */
    enhanceChannel(imageData: ImageData, channel: Channel, factor: number = 1.5): ImageData {
        const width = imageData.width;
        const height = imageData.height;
        const data = new Uint8ClampedArray(imageData.data);

        const channelOffset = getChannelOffset(channel);

        for (let i = channelOffset; i < data.length; i += 4) {
            data[i] = Math.min(255, Math.max(0, Math.round(data[i] * factor)));
        }

        return new ImageData(data, width, height);
    }
}
