/**
 * 位平面分析器组件
 * 负责图像位平面分析和LSB隐写检测
 */

import type { Channel, StegsolveApp } from '../types';

/** 可疑程度等级 */
export type SuspiciousLevel = 'low' | 'medium' | 'high';

/** 位序列统计分析结果 */
export interface BitSequenceAnalysis {
    length: number;
    ones: number;
    zeros: number;
    ratio: number;
    transitions: number;
    transitionRatio: number;
    avgRunLength: number;
    entropy: number;
    randomnessScore: number;
    suspiciousLevel: SuspiciousLevel;
}

/** 位平面差异统计 */
export interface BitPlaneDifference {
    differences: number;
    totalPixels: number;
    percentage: number;
}

/** 水平/垂直模式 */
export interface LinePattern {
    type: 'horizontal' | 'vertical';
    value: number;
    x?: number;
    y?: number;
    start: number;
    end: number;
    length: number;
}

/** 对角线追踪点 */
export interface DiagonalPoint {
    x: number;
    y: number;
    value: number;
}

/** 对角线模式 */
export interface DiagonalPattern {
    type: string;
    startX: number;
    startY: number;
    length: number;
    pattern: DiagonalPoint[];
}

/** 模式检测结果 */
export interface PatternDetectionResult {
    horizontal: LinePattern[];
    vertical: LinePattern[];
    diagonal: DiagonalPattern[];
}

/** 单个位平面报告项 */
export interface BitPlaneReportEntry {
    analysis: BitSequenceAnalysis;
    patterns: PatternDetectionResult;
    significance: string;
}

/** 分析总结 */
export interface BitPlaneSummary {
    overallSuspicion: SuspiciousLevel;
    randomnessScore: number;
    highSuspiciousBits: number;
    mediumSuspiciousBits: number;
    recommendation: string;
}

/** 位平面综合报告 */
export interface BitPlaneReport {
    channel: Channel;
    bitPlanes: Record<number, BitPlaneReportEntry>;
    lsbAnalysis: BitSequenceAnalysis | null;
    patterns: Record<string, PatternDetectionResult>;
    summary: BitPlaneSummary | Record<string, never>;
}

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

export class BitPlaneAnalyzer {
    private app: StegsolveApp;
    readonly bitPlanes: number[];
    readonly channels: Channel[];

    constructor(app: StegsolveApp) {
        this.app = app;
        this.bitPlanes = [0, 1, 2, 3, 4, 5, 6, 7];
        this.channels = ['red', 'green', 'blue', 'alpha'];
    }

    /**
     * 提取指定通道的位平面
     */
    extractBitPlane(imageData: ImageData, channel: Channel, bitPosition: number): ImageData {
        const width = imageData.width;
        const height = imageData.height;
        const data = new Uint8ClampedArray(imageData.data);
        const newData = new Uint8ClampedArray(width * height * 4);

        const channelOffset = getChannelOffset(channel);
        const bitMask = 1 << bitPosition;

        for (let i = 0; i < data.length; i += 4) {
            const channelValue = data[i + channelOffset];
            const bitValue = (channelValue & bitMask) ? 255 : 0;

            newData[i] = bitValue;     // R
            newData[i + 1] = bitValue; // G
            newData[i + 2] = bitValue; // B
            newData[i + 3] = 255;      // A
        }

        return new ImageData(newData, width, height);
    }

    /**
     * 提取所有位平面
     */
    extractAllBitPlanes(imageData: ImageData, channel: Channel): Record<number, ImageData> {
        const bitPlanes: Record<number, ImageData> = {};

        for (let bit = 0; bit < 8; bit++) {
            bitPlanes[bit] = this.extractBitPlane(imageData, channel, bit);
        }

        return bitPlanes;
    }

    /**
     * LSB分析 - 检测最低有效位的随机性
     */
    analyzeLSB(imageData: ImageData, channel: Channel = 'red'): BitSequenceAnalysis {
        const data = imageData.data;
        const channelOffset = getChannelOffset(channel);

        const lsbValues: number[] = [];
        for (let i = channelOffset; i < data.length; i += 4) {
            lsbValues.push(data[i] & 1);
        }

        return this.analyzeBitSequence(lsbValues);
    }

    /**
     * 分析位序列的统计特性
     */
    analyzeBitSequence(bitSequence: number[]): BitSequenceAnalysis {
        const length = bitSequence.length;
        let ones = 0;
        let zeros = 0;
        let transitions = 0;
        const runs: number[] = [];
        let currentRun = 1;
        let currentBit = bitSequence[0];

        // 统计0和1的数量
        for (let i = 0; i < length; i++) {
            if (bitSequence[i] === 1) {
                ones++;
            } else {
                zeros++;
            }

            // 统计转换次数和游程长度
            if (i > 0) {
                if (bitSequence[i] === currentBit) {
                    currentRun++;
                } else {
                    runs.push(currentRun);
                    currentRun = 1;
                    currentBit = bitSequence[i];
                    transitions++;
                }
            }
        }
        runs.push(currentRun);

        // 计算统计指标
        const ratio = ones / length;
        const expectedTransitions = 2 * ones * zeros / length;
        const transitionRatio = transitions / expectedTransitions;

        // 计算平均游程长度
        const avgRunLength = runs.reduce((sum, run) => sum + run, 0) / runs.length;

        // 计算熵
        const entropy = this.calculateEntropy(bitSequence);

        return {
            length,
            ones,
            zeros,
            ratio,
            transitions,
            transitionRatio,
            avgRunLength,
            entropy,
            randomnessScore: this.calculateRandomnessScore(ratio, transitionRatio, entropy),
            suspiciousLevel: this.getSuspiciousLevel(ratio, transitionRatio, entropy)
        };
    }

    /**
     * 计算熵值
     */
    calculateEntropy(sequence: number[]): number {
        const length = sequence.length;
        const counts: Record<number, number> = {};

        // 统计每个值的出现次数
        for (const value of sequence) {
            counts[value] = (counts[value] || 0) + 1;
        }

        let entropy = 0;
        for (const count of Object.values(counts)) {
            const probability = count / length;
            if (probability > 0) {
                entropy -= probability * Math.log2(probability);
            }
        }

        return entropy;
    }

    /**
     * 计算随机性评分
     */
    calculateRandomnessScore(ratio: number, transitionRatio: number, entropy: number): number {
        // 理想的随机序列应该有：
        // - 比例接近0.5
        // - 转换比例接近1
        // - 熵接近1

        const ratioScore = 1 - Math.abs(ratio - 0.5) * 2;
        const transitionScore = Math.min(1, transitionRatio);
        const entropyScore = entropy;

        return (ratioScore + transitionScore + entropyScore) / 3;
    }

    /**
     * 获取可疑程度
     */
    getSuspiciousLevel(ratio: number, transitionRatio: number, entropy: number): SuspiciousLevel {
        const randomnessScore = this.calculateRandomnessScore(ratio, transitionRatio, entropy);

        if (randomnessScore > 0.8) {
            return 'low'; // 低可疑度，可能是随机数据
        } else if (randomnessScore > 0.6) {
            return 'medium'; // 中等可疑度
        } else {
            return 'high'; // 高可疑度，可能包含隐藏信息
        }
    }

    /**
     * 位平面重组
     */
    reconstructFromBitPlanes(bitPlanes: Record<number, ImageData>, _channel: Channel): ImageData | null {
        if (!bitPlanes[0]) return null;

        const width = bitPlanes[0].width;
        const height = bitPlanes[0].height;
        const newData = new Uint8ClampedArray(width * height * 4);

        for (let i = 0; i < width * height; i++) {
            let value = 0;

            // 重组8个位平面
            for (let bit = 0; bit < 8; bit++) {
                if (bitPlanes[bit]) {
                    const pixelIndex = i * 4;
                    const bitValue = bitPlanes[bit].data[pixelIndex] > 128 ? 1 : 0;
                    value |= (bitValue << bit);
                }
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
     * 位平面差分分析
     */
    analyzeBitPlaneDifferences(imageData: ImageData, channel: Channel): Record<string, BitPlaneDifference> {
        const bitPlanes = this.extractAllBitPlanes(imageData, channel);
        const differences: Record<string, BitPlaneDifference> = {};

        for (let i = 0; i < 7; i++) {
            const diff = this.calculateBitPlaneDifference(bitPlanes[i], bitPlanes[i + 1]);
            differences[`${i}-${i + 1}`] = diff;
        }

        return differences;
    }

    /**
     * 计算两个位平面之间的差异
     */
    calculateBitPlaneDifference(plane1: ImageData, plane2: ImageData): BitPlaneDifference {
        const data1 = plane1.data;
        const data2 = plane2.data;
        let differences = 0;
        let totalPixels = 0;

        for (let i = 0; i < data1.length; i += 4) {
            const bit1 = data1[i] > 128 ? 1 : 0;
            const bit2 = data2[i] > 128 ? 1 : 0;

            if (bit1 !== bit2) {
                differences++;
            }
            totalPixels++;
        }

        return {
            differences,
            totalPixels,
            percentage: (differences / totalPixels) * 100
        };
    }

    /**
     * 检测位平面中的模式
     */
    detectPatterns(imageData: ImageData, channel: Channel, bitPosition: number): PatternDetectionResult {
        const bitPlane = this.extractBitPlane(imageData, channel, bitPosition);
        const data = bitPlane.data;
        const width = bitPlane.width;
        const height = bitPlane.height;

        // 检测水平模式
        const horizontalPatterns = this.detectHorizontalPatterns(data, width, height);

        // 检测垂直模式
        const verticalPatterns = this.detectVerticalPatterns(data, width, height);

        // 检测对角线模式
        const diagonalPatterns = this.detectDiagonalPatterns(data, width, height);

        return {
            horizontal: horizontalPatterns,
            vertical: verticalPatterns,
            diagonal: diagonalPatterns
        };
    }

    /**
     * 检测水平模式
     */
    detectHorizontalPatterns(data: Uint8ClampedArray, width: number, height: number): LinePattern[] {
        const patterns: LinePattern[] = [];

        for (let y = 0; y < height; y++) {
            let currentPattern: number[] = [];
            let currentValue = -1;

            for (let x = 0; x < width; x++) {
                const pixelIndex = (y * width + x) * 4;
                const value = data[pixelIndex] > 128 ? 1 : 0;

                if (value === currentValue) {
                    currentPattern.push(x);
                } else {
                    if (currentPattern.length > 5) { // 至少5个连续像素
                        patterns.push({
                            type: 'horizontal',
                            value: currentValue,
                            y: y,
                            start: currentPattern[0],
                            end: currentPattern[currentPattern.length - 1],
                            length: currentPattern.length
                        });
                    }
                    currentPattern = [x];
                    currentValue = value;
                }
            }
        }

        return patterns;
    }

    /**
     * 检测垂直模式
     */
    detectVerticalPatterns(data: Uint8ClampedArray, width: number, height: number): LinePattern[] {
        const patterns: LinePattern[] = [];

        for (let x = 0; x < width; x++) {
            let currentPattern: number[] = [];
            let currentValue = -1;

            for (let y = 0; y < height; y++) {
                const pixelIndex = (y * width + x) * 4;
                const value = data[pixelIndex] > 128 ? 1 : 0;

                if (value === currentValue) {
                    currentPattern.push(y);
                } else {
                    if (currentPattern.length > 5) {
                        patterns.push({
                            type: 'vertical',
                            value: currentValue,
                            x: x,
                            start: currentPattern[0],
                            end: currentPattern[currentPattern.length - 1],
                            length: currentPattern.length
                        });
                    }
                    currentPattern = [y];
                    currentValue = value;
                }
            }
        }

        return patterns;
    }

    /**
     * 检测对角线模式
     */
    detectDiagonalPatterns(data: Uint8ClampedArray, width: number, height: number): DiagonalPattern[] {
        const patterns: DiagonalPattern[] = [];

        // 检测主对角线方向的模式
        for (let startY = 0; startY < height; startY++) {
            for (let startX = 0; startX < width; startX++) {
                const pattern = this.traceDiagonalPattern(data, width, height, startX, startY, 1, 1);
                if (pattern.length > 5) {
                    patterns.push({
                        type: 'diagonal-main',
                        startX,
                        startY,
                        length: pattern.length,
                        pattern
                    });
                }
            }
        }

        return patterns;
    }

    /**
     * 追踪对角线模式
     */
    traceDiagonalPattern(data: Uint8ClampedArray, width: number, height: number, startX: number, startY: number, deltaX: number, deltaY: number): DiagonalPoint[] {
        const pattern: DiagonalPoint[] = [];
        let x = startX;
        let y = startY;
        let currentValue = -1;

        while (x >= 0 && x < width && y >= 0 && y < height) {
            const pixelIndex = (y * width + x) * 4;
            const value = data[pixelIndex] > 128 ? 1 : 0;

            if (currentValue === -1) {
                currentValue = value;
                pattern.push({ x, y, value });
            } else if (value === currentValue) {
                pattern.push({ x, y, value });
            } else {
                break;
            }

            x += deltaX;
            y += deltaY;
        }

        return pattern;
    }

    /**
     * 生成位平面统计报告
     */
    generateBitPlaneReport(imageData: ImageData, channel: Channel): BitPlaneReport {
        const report: BitPlaneReport = {
            channel,
            bitPlanes: {},
            lsbAnalysis: null,
            patterns: {},
            summary: {}
        };

        // 分析每个位平面
        for (let bit = 0; bit < 8; bit++) {
            const bitPlane = this.extractBitPlane(imageData, channel, bit);
            const bitSequence = this.extractBitSequence(bitPlane);
            const analysis = this.analyzeBitSequence(bitSequence);
            const patterns = this.detectPatterns(imageData, channel, bit);

            report.bitPlanes[bit] = {
                analysis,
                patterns,
                significance: bit === 0 ? 'LSB' : bit === 7 ? 'MSB' : `Bit ${bit}`
            };
        }

        // LSB特别分析
        report.lsbAnalysis = this.analyzeLSB(imageData, channel);

        // 生成总结
        report.summary = this.generateSummary(report);

        return report;
    }

    /**
     * 从位平面提取位序列
     */
    extractBitSequence(bitPlane: ImageData): number[] {
        const data = bitPlane.data;
        const sequence: number[] = [];

        for (let i = 0; i < data.length; i += 4) {
            sequence.push(data[i] > 128 ? 1 : 0);
        }

        return sequence;
    }

    /**
     * 生成分析总结
     */
    generateSummary(report: BitPlaneReport): BitPlaneSummary {
        const lsb = report.lsbAnalysis;
        if (!lsb) {
            throw new Error('生成总结前必须先完成 LSB 分析');
        }

        const suspiciousLevels = Object.values(report.bitPlanes)
            .map(bp => bp.analysis.suspiciousLevel);

        const highSuspicious = suspiciousLevels.filter(level => level === 'high').length;
        const mediumSuspicious = suspiciousLevels.filter(level => level === 'medium').length;

        return {
            overallSuspicion: lsb.suspiciousLevel,
            randomnessScore: lsb.randomnessScore,
            highSuspiciousBits: highSuspicious,
            mediumSuspiciousBits: mediumSuspicious,
            recommendation: this.getRecommendation(lsb.suspiciousLevel, highSuspicious)
        };
    }

    /**
     * 获取分析建议
     */
    getRecommendation(suspiciousLevel: SuspiciousLevel, highSuspiciousBits: number): string {
        if (suspiciousLevel === 'high' || highSuspiciousBits > 2) {
            return '检测到高度可疑的位平面模式，建议进一步分析是否包含隐藏信息';
        } else if (suspiciousLevel === 'medium' || highSuspiciousBits > 0) {
            return '检测到中等可疑的位平面模式，可能包含隐藏信息';
        } else {
            return '位平面分析未发现明显的隐写痕迹';
        }
    }
}
