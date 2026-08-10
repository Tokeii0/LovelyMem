/**
 * 图像处理工具类
 * 提供各种图像处理和分析的通用工具函数
 */

/** RGBA 像素颜色 */
export interface PixelColor {
    r: number;
    g: number;
    b: number;
    a?: number;
}

/** 颜色数组 [r, g, b, a] */
export type ColorTuple = [number, number, number, number];

/** 图像差异计算结果 */
export interface ImageDifferenceResult {
    imageData: ImageData;
    averageDifference: number;
    totalDifference: number;
    pixelCount: number;
}

/** 图像相似度计算结果 */
export interface ImageSimilarityResult {
    similarity: number;
    difference: number;
    ssim: number;
}

/** 直方图（每个通道 256 个桶） */
export interface ImageHistogram {
    red: number[];
    green: number[];
    blue: number[];
    alpha: number[];
    luminance: number[];
}

/** 单通道统计信息 */
export interface ChannelStat {
    min: number;
    max: number;
    mean: number;
}

/** 图像统计信息 */
export interface ImageStatistics {
    width: number;
    height: number;
    totalPixels: number;
    uniqueColors: number;
    channels: {
        red: ChannelStat;
        green: ChannelStat;
        blue: ChannelStat;
        alpha: ChannelStat;
    };
    averageBrightness: number;
}

/** 边缘检测结果项 */
export interface EdgePoint {
    x: number;
    y: number;
    magnitude: number;
    direction: number;
}

/**
 * 创建一个新的离屏 Canvas 2D 上下文，断言上下文存在
 */
function createContext2D(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('无法获取 Canvas 2D 上下文');
    }
    return { canvas, ctx };
}

export class ImageUtils {
    /**
     * 复制ImageData对象
     */
    static cloneImageData(imageData: ImageData): ImageData {
        const clonedData = new Uint8ClampedArray(imageData.data);
        return new ImageData(clonedData, imageData.width, imageData.height);
    }

    /**
     * 创建空白ImageData
     */
    static createBlankImageData(width: number, height: number, color: ColorTuple = [0, 0, 0, 255]): ImageData {
        const data = new Uint8ClampedArray(width * height * 4);

        for (let i = 0; i < data.length; i += 4) {
            data[i] = color[0];     // R
            data[i + 1] = color[1]; // G
            data[i + 2] = color[2]; // B
            data[i + 3] = color[3]; // A
        }

        return new ImageData(data, width, height);
    }

    /**
     * 调整图像大小
     */
    static resizeImageData(imageData: ImageData, newWidth: number, newHeight: number): ImageData {
        const { ctx } = createContext2D(newWidth, newHeight);

        // 创建临时canvas绘制原图
        const { canvas: tempCanvas, ctx: tempCtx } = createContext2D(imageData.width, imageData.height);
        tempCtx.putImageData(imageData, 0, 0);

        // 调整大小
        ctx.drawImage(tempCanvas, 0, 0, newWidth, newHeight);

        return ctx.getImageData(0, 0, newWidth, newHeight);
    }

    /**
     * 裁剪图像
     */
    static cropImageData(imageData: ImageData, x: number, y: number, width: number, height: number): ImageData {
        const { ctx } = createContext2D(width, height);

        // 创建临时canvas
        const { canvas: tempCanvas, ctx: tempCtx } = createContext2D(imageData.width, imageData.height);
        tempCtx.putImageData(imageData, 0, 0);

        // 裁剪
        ctx.drawImage(tempCanvas, x, y, width, height, 0, 0, width, height);

        return ctx.getImageData(0, 0, width, height);
    }

    /**
     * 旋转图像
     */
    static rotateImageData(imageData: ImageData, angle: number): ImageData {
        const radians = (angle * Math.PI) / 180;
        const cos = Math.abs(Math.cos(radians));
        const sin = Math.abs(Math.sin(radians));

        const newWidth = Math.round(imageData.width * cos + imageData.height * sin);
        const newHeight = Math.round(imageData.width * sin + imageData.height * cos);

        const { ctx } = createContext2D(newWidth, newHeight);

        // 创建临时canvas
        const { canvas: tempCanvas, ctx: tempCtx } = createContext2D(imageData.width, imageData.height);
        tempCtx.putImageData(imageData, 0, 0);

        // 旋转
        ctx.translate(newWidth / 2, newHeight / 2);
        ctx.rotate(radians);
        ctx.drawImage(tempCanvas, -imageData.width / 2, -imageData.height / 2);

        return ctx.getImageData(0, 0, newWidth, newHeight);
    }

    /**
     * 翻转图像
     */
    static flipImageData(imageData: ImageData, horizontal: boolean = true, vertical: boolean = false): ImageData {
        const { ctx } = createContext2D(imageData.width, imageData.height);

        // 创建临时canvas
        const { canvas: tempCanvas, ctx: tempCtx } = createContext2D(imageData.width, imageData.height);
        tempCtx.putImageData(imageData, 0, 0);

        // 设置变换
        ctx.scale(horizontal ? -1 : 1, vertical ? -1 : 1);
        ctx.drawImage(
            tempCanvas,
            horizontal ? -imageData.width : 0,
            vertical ? -imageData.height : 0
        );

        return ctx.getImageData(0, 0, imageData.width, imageData.height);
    }

    /**
     * 计算图像差异
     */
    static calculateImageDifference(imageData1: ImageData, imageData2: ImageData): ImageDifferenceResult {
        const width = Math.min(imageData1.width, imageData2.width);
        const height = Math.min(imageData1.height, imageData2.height);
        const newData = new Uint8ClampedArray(width * height * 4);

        let totalDifference = 0;
        let pixelCount = 0;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index1 = (y * imageData1.width + x) * 4;
                const index2 = (y * imageData2.width + x) * 4;
                const newIndex = (y * width + x) * 4;

                const r1 = imageData1.data[index1];
                const g1 = imageData1.data[index1 + 1];
                const b1 = imageData1.data[index1 + 2];

                const r2 = imageData2.data[index2];
                const g2 = imageData2.data[index2 + 1];
                const b2 = imageData2.data[index2 + 2];

                const diffR = Math.abs(r1 - r2);
                const diffG = Math.abs(g1 - g2);
                const diffB = Math.abs(b1 - b2);

                newData[newIndex] = diffR;
                newData[newIndex + 1] = diffG;
                newData[newIndex + 2] = diffB;
                newData[newIndex + 3] = 255;

                totalDifference += diffR + diffG + diffB;
                pixelCount++;
            }
        }

        return {
            imageData: new ImageData(newData, width, height),
            averageDifference: totalDifference / (pixelCount * 3),
            totalDifference,
            pixelCount
        };
    }

    /**
     * 计算图像相似度
     */
    static calculateImageSimilarity(imageData1: ImageData, imageData2: ImageData): ImageSimilarityResult {
        const diff = this.calculateImageDifference(imageData1, imageData2);
        const maxPossibleDiff = 255 * 3; // RGB最大差异
        const similarity = 1 - (diff.averageDifference / maxPossibleDiff);

        return {
            similarity: Math.max(0, Math.min(1, similarity)),
            difference: diff.averageDifference,
            ssim: this.calculateSSIM(imageData1, imageData2)
        };
    }

    /**
     * 计算结构相似性指数(SSIM)
     */
    static calculateSSIM(imageData1: ImageData, imageData2: ImageData, windowSize: number = 11): number {
        // 简化的SSIM计算
        const width = Math.min(imageData1.width, imageData2.width);
        const height = Math.min(imageData1.height, imageData2.height);

        // 转换为灰度
        const gray1 = this.convertToGrayscaleArray(imageData1);
        const gray2 = this.convertToGrayscaleArray(imageData2);

        let ssimSum = 0;
        let windowCount = 0;

        const halfWindow = Math.floor(windowSize / 2);

        for (let y = halfWindow; y < height - halfWindow; y += windowSize) {
            for (let x = halfWindow; x < width - halfWindow; x += windowSize) {
                const window1 = this.extractWindow(gray1, width, x, y, windowSize);
                const window2 = this.extractWindow(gray2, width, x, y, windowSize);

                const ssim = this.calculateWindowSSIM(window1, window2);
                ssimSum += ssim;
                windowCount++;
            }
        }

        return windowCount > 0 ? ssimSum / windowCount : 0;
    }

    /**
     * 转换为灰度数组
     */
    static convertToGrayscaleArray(imageData: ImageData): number[] {
        const data = imageData.data;
        const gray = new Array<number>(imageData.width * imageData.height);

        for (let i = 0; i < data.length; i += 4) {
            const grayValue = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
            gray[i / 4] = grayValue;
        }

        return gray;
    }

    /**
     * 提取窗口数据
     */
    static extractWindow(grayArray: number[], width: number, centerX: number, centerY: number, windowSize: number): number[] {
        const windowValues: number[] = [];
        const halfWindow = Math.floor(windowSize / 2);

        for (let y = centerY - halfWindow; y <= centerY + halfWindow; y++) {
            for (let x = centerX - halfWindow; x <= centerX + halfWindow; x++) {
                if (x >= 0 && x < width && y >= 0) {
                    const index = y * width + x;
                    if (index < grayArray.length) {
                        windowValues.push(grayArray[index]);
                    }
                }
            }
        }

        return windowValues;
    }

    /**
     * 计算窗口SSIM
     */
    static calculateWindowSSIM(window1: number[], window2: number[]): number {
        if (window1.length !== window2.length || window1.length === 0) {
            return 0;
        }

        // 计算均值
        const mean1 = window1.reduce((sum, val) => sum + val, 0) / window1.length;
        const mean2 = window2.reduce((sum, val) => sum + val, 0) / window2.length;

        // 计算方差和协方差
        let var1 = 0, var2 = 0, covar = 0;

        for (let i = 0; i < window1.length; i++) {
            const diff1 = window1[i] - mean1;
            const diff2 = window2[i] - mean2;

            var1 += diff1 * diff1;
            var2 += diff2 * diff2;
            covar += diff1 * diff2;
        }

        var1 /= window1.length - 1;
        var2 /= window2.length - 1;
        covar /= window1.length - 1;

        // SSIM常数
        const c1 = 6.5025; // (0.01 * 255)^2
        const c2 = 58.5225; // (0.03 * 255)^2

        // 计算SSIM
        const numerator = (2 * mean1 * mean2 + c1) * (2 * covar + c2);
        const denominator = (mean1 * mean1 + mean2 * mean2 + c1) * (var1 + var2 + c2);

        return denominator !== 0 ? numerator / denominator : 0;
    }

    /**
     * 计算图像直方图
     */
    static calculateHistogram(imageData: ImageData, channel: 'all'): ImageHistogram;
    static calculateHistogram(imageData: ImageData, channel: keyof ImageHistogram): number[];
    static calculateHistogram(imageData: ImageData, channel: 'all' | keyof ImageHistogram = 'all'): ImageHistogram | number[] {
        const data = imageData.data;
        const histogram: ImageHistogram = {
            red: new Array<number>(256).fill(0),
            green: new Array<number>(256).fill(0),
            blue: new Array<number>(256).fill(0),
            alpha: new Array<number>(256).fill(0),
            luminance: new Array<number>(256).fill(0)
        };

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];

            histogram.red[r]++;
            histogram.green[g]++;
            histogram.blue[b]++;
            histogram.alpha[a]++;

            // 计算亮度
            const luminance = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
            histogram.luminance[luminance]++;
        }

        if (channel === 'all') {
            return histogram;
        } else {
            return histogram[channel] || histogram.luminance;
        }
    }

    /**
     * 应用查找表(LUT)
     */
    static applyLUT(imageData: ImageData, lut: number[]): ImageData {
        const width = imageData.width;
        const height = imageData.height;
        const data = new Uint8ClampedArray(imageData.data);

        for (let i = 0; i < data.length; i += 4) {
            data[i] = lut[data[i]] ?? data[i];         // R
            data[i + 1] = lut[data[i + 1]] ?? data[i + 1]; // G
            data[i + 2] = lut[data[i + 2]] ?? data[i + 2]; // B
        }

        return new ImageData(data, width, height);
    }

    /**
     * 创建线性查找表
     */
    static createLinearLUT(inputMin: number, inputMax: number, outputMin: number, outputMax: number): number[] {
        const lut = new Array<number>(256);

        for (let i = 0; i < 256; i++) {
            if (i <= inputMin) {
                lut[i] = outputMin;
            } else if (i >= inputMax) {
                lut[i] = outputMax;
            } else {
                const ratio = (i - inputMin) / (inputMax - inputMin);
                lut[i] = Math.round(outputMin + ratio * (outputMax - outputMin));
            }
        }

        return lut;
    }

    /**
     * 创建伽马查找表
     */
    static createGammaLUT(gamma: number): number[] {
        const lut = new Array<number>(256);

        for (let i = 0; i < 256; i++) {
            lut[i] = Math.round(255 * Math.pow(i / 255, 1 / gamma));
        }

        return lut;
    }

    /**
     * 获取像素值
     */
    static getPixel(imageData: ImageData, x: number, y: number): Required<PixelColor> | null {
        if (x < 0 || x >= imageData.width || y < 0 || y >= imageData.height) {
            return null;
        }

        const index = (y * imageData.width + x) * 4;
        return {
            r: imageData.data[index],
            g: imageData.data[index + 1],
            b: imageData.data[index + 2],
            a: imageData.data[index + 3]
        };
    }

    /**
     * 设置像素值
     */
    static setPixel(imageData: ImageData, x: number, y: number, color: PixelColor): void {
        if (x < 0 || x >= imageData.width || y < 0 || y >= imageData.height) {
            return;
        }

        const index = (y * imageData.width + x) * 4;
        imageData.data[index] = color.r;
        imageData.data[index + 1] = color.g;
        imageData.data[index + 2] = color.b;
        imageData.data[index + 3] = color.a !== undefined ? color.a : 255;
    }

    /**
     * 计算图像统计信息
     */
    static calculateImageStatistics(imageData: ImageData): ImageStatistics {
        const data = imageData.data;
        const totalPixels = imageData.width * imageData.height;

        let minR = 255, maxR = 0, sumR = 0;
        let minG = 255, maxG = 0, sumG = 0;
        let minB = 255, maxB = 0, sumB = 0;
        let minA = 255, maxA = 0, sumA = 0;

        const colorSet = new Set<string>();

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];

            minR = Math.min(minR, r); maxR = Math.max(maxR, r); sumR += r;
            minG = Math.min(minG, g); maxG = Math.max(maxG, g); sumG += g;
            minB = Math.min(minB, b); maxB = Math.max(maxB, b); sumB += b;
            minA = Math.min(minA, a); maxA = Math.max(maxA, a); sumA += a;

            colorSet.add(`${r},${g},${b}`);
        }

        return {
            width: imageData.width,
            height: imageData.height,
            totalPixels,
            uniqueColors: colorSet.size,
            channels: {
                red: { min: minR, max: maxR, mean: Math.round(sumR / totalPixels) },
                green: { min: minG, max: maxG, mean: Math.round(sumG / totalPixels) },
                blue: { min: minB, max: maxB, mean: Math.round(sumB / totalPixels) },
                alpha: { min: minA, max: maxA, mean: Math.round(sumA / totalPixels) }
            },
            averageBrightness: Math.round((sumR + sumG + sumB) / (totalPixels * 3))
        };
    }

    /**
     * 检测图像中的边缘
     */
    static detectEdges(imageData: ImageData, threshold: number = 100): EdgePoint[] {
        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;
        const edges: EdgePoint[] = [];

        // Sobel算子
        const sobelX = [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]];
        const sobelY = [[-1, -2, -1], [0, 0, 0], [1, 2, 1]];

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                let gx = 0, gy = 0;

                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        const pixelIndex = ((y + ky) * width + (x + kx)) * 4;
                        const gray = (data[pixelIndex] + data[pixelIndex + 1] + data[pixelIndex + 2]) / 3;

                        gx += gray * sobelX[ky + 1][kx + 1];
                        gy += gray * sobelY[ky + 1][kx + 1];
                    }
                }

                const magnitude = Math.sqrt(gx * gx + gy * gy);

                if (magnitude > threshold) {
                    edges.push({
                        x,
                        y,
                        magnitude,
                        direction: Math.atan2(gy, gx)
                    });
                }
            }
        }

        return edges;
    }

    /**
     * 将ImageData转换为Base64
     */
    static imageDataToBase64(imageData: ImageData): string {
        const { canvas, ctx } = createContext2D(imageData.width, imageData.height);
        ctx.putImageData(imageData, 0, 0);

        return canvas.toDataURL();
    }

    /**
     * 从Base64创建ImageData
     */
    static async base64ToImageData(base64: string): Promise<ImageData> {
        return new Promise<ImageData>((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const { ctx } = createContext2D(img.width, img.height);
                ctx.drawImage(img, 0, 0);

                const imageData = ctx.getImageData(0, 0, img.width, img.height);
                resolve(imageData);
            };
            img.onerror = () => reject(new Error('无法从 Base64 加载图像'));
            img.src = base64;
        });
    }
}
