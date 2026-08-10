/**
 * 数据提取器组件
 * 负责从图像中提取隐藏数据，包括LSB提取、文本检测等
 */

import type { Channel, StegsolveApp } from '../types';
import { translate } from '../../../i18n';

/** 位序 */
export type BitOrder = 'msb' | 'lsb';

/** ASCII 文本检测结果 */
export interface AsciiPattern {
    isProbable: boolean;
    confidence: number;
    length: number;
}

/** UTF-8 文本检测结果 */
export interface Utf8Pattern {
    isProbable: boolean;
    confidence: number;
    length: number;
    text?: string;
}

/** 二进制数据检测结果 */
export interface BinaryPattern {
    isProbable: boolean;
    confidence: number;
    nullBytes?: number;
    highBytes?: number;
}

/** 压缩数据检测结果 */
export interface CompressedPattern {
    isProbable: boolean;
    confidence: number;
    format?: string;
    entropy?: number;
}

/** 加密数据检测结果 */
export interface EncryptedPattern {
    isProbable: boolean;
    confidence: number;
    entropy?: number;
    uniformity?: number;
}

/** 综合文本/数据模式检测结果 */
export interface TextPatterns {
    ascii: AsciiPattern;
    utf8: Utf8Pattern;
    binary: BinaryPattern;
    compressed: CompressedPattern;
    encrypted: EncryptedPattern;
}

/** 字节分布分析结果 */
export interface ByteDistribution {
    uniformity: number;
    usedBytes: number;
    chiSquare: number;
    mostFrequent: number;
    leastFrequent: number;
}

/** 单次提取结果 */
export interface ExtractionResult {
    bits: number[];
    bytes: number[];
    patterns: TextPatterns;
    text: string | null;
    length: number;
    seed?: number;
}

/** 多通道提取结果 */
export type MultiChannelResult = Record<string, ExtractionResult>;

/** 单个 LSB 提取候选评分结果 */
export interface ScoredExtraction {
    bytes: number[];
    patterns: TextPatterns;
    text: string | null;
    score: number;
}

/** 智能提取最佳候选 */
export interface BestExtraction {
    method: string;
    score: number;
    result: ScoredExtraction | ExtractionResult | null;
}

/** 智能提取的全部结果 */
export interface SmartExtractionResult {
    lsb: Record<string, Record<number, ScoredExtraction>>;
    multiChannel: MultiChannelResult;
    sequential: ExtractionResult | null;
    bestCandidate: BestExtraction | null;
}

/** 导出格式 */
export type ExportFormat = 'text' | 'binary' | 'hex';

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

export class DataExtractor {
    private app: StegsolveApp;
    readonly extractionMethods: string[];
    readonly channels: Channel[];
    readonly bitPositions: number[];

    constructor(app: StegsolveApp) {
        this.app = app;
        this.extractionMethods = ['lsb', 'msb', 'sequential', 'random'];
        this.channels = ['red', 'green', 'blue', 'alpha'];
        this.bitPositions = [0, 1, 2, 3, 4, 5, 6, 7];
    }

    /**
     * LSB数据提取
     */
    extractLSB(imageData: ImageData, channel: Channel = 'red', bitPosition: number = 0): number[] {
        const data = imageData.data;
        const channelOffset = getChannelOffset(channel);

        const bitMask = 1 << bitPosition;
        const extractedBits: number[] = [];

        for (let i = channelOffset; i < data.length; i += 4) {
            const bit = (data[i] & bitMask) ? 1 : 0;
            extractedBits.push(bit);
        }

        return extractedBits;
    }

    /**
     * 从位数组转换为字节数组
     * @param bits 位数组
     * @param bitOrder 位序 'msb' (默认, 先入高位) 或 'lsb' (先入低位)
     */
    bitsToBytes(bits: number[], bitOrder: BitOrder = 'msb'): number[] {
        const bytes: number[] = [];

        for (let i = 0; i < bits.length; i += 8) {
            let byte = 0;
            // 确保最后不满8位也能处理
            const len = Math.min(8, bits.length - i);

            if (bitOrder === 'lsb') {
                // LSB First: bits[0]是最低位 (2^0)
                for (let j = 0; j < len; j++) {
                    byte |= (bits[i + j] << j);
                }
            } else {
                // MSB First: bits[0]是最高位 (2^7)，标准隐写常用
                for (let j = 0; j < len; j++) {
                    byte = (byte << 1) | bits[i + j];
                }
                // 如果不满8位，需要移位对齐吗？通常不需要，剩下的位是0
                if (len < 8) {
                    byte <<= (8 - len);
                }
            }
            bytes.push(byte);
        }

        return bytes;
    }

    /**
     * 从字节数组转换为文本
     */
    bytesToText(bytes: number[], encoding: 'utf-8' | 'ascii' = 'utf-8'): string | null {
        try {
            // 简化处理，只移除尾部连续的零字节
            let endIndex = bytes.length;
            while (endIndex > 0 && bytes[endIndex - 1] === 0) {
                endIndex--;
            }

            const cleanBytes = bytes.slice(0, endIndex);

            if (encoding === 'ascii') {
                return cleanBytes.map(byte => String.fromCharCode(byte)).join('');
            } else {
                // UTF-8解码
                const uint8Array = new Uint8Array(cleanBytes);
                return new TextDecoder('utf-8').decode(uint8Array);
            }
        } catch (error) {
            console.warn('文本解码失败:', error);
            return null;
        }
    }

    /**
     * 检测文本模式
     */
    detectTextPatterns(bytes: number[]): TextPatterns {
        const patterns: TextPatterns = {
            ascii: this.isASCIIText(bytes),
            utf8: this.isUTF8Text(bytes),
            binary: this.isBinaryData(bytes),
            compressed: this.isCompressedData(bytes),
            encrypted: this.isEncryptedData(bytes)
        };

        return patterns;
    }

    /**
     * 检查是否为ASCII文本
     */
    isASCIIText(bytes: number[]): AsciiPattern {
        let printableCount = 0;
        let totalCount = 0;

        for (const byte of bytes) {
            if (byte === 0) break; // 遇到空字节停止

            totalCount++;

            // 可打印ASCII字符 (32-126) 或常见控制字符 (9, 10, 13)
            if ((byte >= 32 && byte <= 126) || byte === 9 || byte === 10 || byte === 13) {
                printableCount++;
            }
        }

        const ratio = totalCount > 0 ? printableCount / totalCount : 0;
        return {
            isProbable: ratio > 0.8,
            confidence: ratio,
            length: totalCount
        };
    }

    /**
     * 检查是否为UTF-8文本
     */
    isUTF8Text(bytes: number[]): Utf8Pattern {
        try {
            const text = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));

            // 检查是否包含可打印字符
            const printableChars = text.match(/[\x20-\x7E\s]/g);
            const ratio = printableChars ? printableChars.length / text.length : 0;

            return {
                isProbable: ratio > 0.7,
                confidence: ratio,
                length: text.length,
                text: text.substring(0, 100) // 预览前100个字符
            };
        } catch (error) {
            return {
                isProbable: false,
                confidence: 0,
                length: 0
            };
        }
    }

    /**
     * 检查是否为二进制数据
     */
    isBinaryData(bytes: number[]): BinaryPattern {
        let nullCount = 0;
        let highByteCount = 0;

        for (const byte of bytes) {
            if (byte === 0) nullCount++;
            if (byte > 127) highByteCount++;
        }

        const nullRatio = nullCount / bytes.length;
        const highByteRatio = highByteCount / bytes.length;

        return {
            isProbable: nullRatio > 0.1 || highByteRatio > 0.3,
            confidence: Math.max(nullRatio, highByteRatio),
            nullBytes: nullCount,
            highBytes: highByteCount
        };
    }

    /**
     * 检查是否为压缩数据
     */
    isCompressedData(bytes: number[]): CompressedPattern {
        if (bytes.length < 4) return { isProbable: false, confidence: 0 };

        // 检查常见压缩格式的魔数
        const signatures: Record<string, number[]> = {
            zip: [0x50, 0x4B, 0x03, 0x04],
            gzip: [0x1F, 0x8B],
            bzip2: [0x42, 0x5A, 0x68],
            rar: [0x52, 0x61, 0x72, 0x21],
            '7z': [0x37, 0x7A, 0xBC, 0xAF]
        };

        for (const [format, signature] of Object.entries(signatures)) {
            if (this.matchesSignature(bytes, signature)) {
                return {
                    isProbable: true,
                    confidence: 0.9,
                    format: format
                };
            }
        }

        // 检查熵值（压缩数据通常有高熵）
        const entropy = this.calculateEntropy(bytes);
        return {
            isProbable: entropy > 7.5,
            confidence: entropy / 8,
            entropy: entropy
        };
    }

    /**
     * 检查是否为加密数据
     */
    isEncryptedData(bytes: number[]): EncryptedPattern {
        // 加密数据通常具有高熵和均匀分布
        const entropy = this.calculateEntropy(bytes);
        const distribution = this.analyzeByteDistribution(bytes);

        return {
            isProbable: entropy > 7.8 && distribution.uniformity > 0.8,
            confidence: (entropy / 8 + distribution.uniformity) / 2,
            entropy: entropy,
            uniformity: distribution.uniformity
        };
    }

    /**
     * 匹配文件签名
     */
    matchesSignature(bytes: number[], signature: number[]): boolean {
        if (bytes.length < signature.length) return false;

        for (let i = 0; i < signature.length; i++) {
            if (bytes[i] !== signature[i]) return false;
        }

        return true;
    }

    /**
     * 计算字节序列的熵
     */
    calculateEntropy(bytes: number[]): number {
        const frequency = new Array<number>(256).fill(0);

        for (const byte of bytes) {
            frequency[byte]++;
        }

        let entropy = 0;
        const length = bytes.length;

        for (const count of frequency) {
            if (count > 0) {
                const probability = count / length;
                entropy -= probability * Math.log2(probability);
            }
        }

        return entropy;
    }

    /**
     * 分析字节分布
     */
    analyzeByteDistribution(bytes: number[]): ByteDistribution {
        const frequency = new Array<number>(256).fill(0);

        for (const byte of bytes) {
            frequency[byte]++;
        }

        // 计算分布的均匀性
        const expectedFreq = bytes.length / 256;
        let chiSquare = 0;
        let usedBytes = 0;

        for (const count of frequency) {
            if (count > 0) {
                usedBytes++;
                chiSquare += Math.pow(count - expectedFreq, 2) / expectedFreq;
            }
        }

        // 均匀性评分（0-1，1表示完全均匀）
        const uniformity = Math.max(0, 1 - chiSquare / (bytes.length * 2));

        return {
            uniformity,
            usedBytes,
            chiSquare,
            mostFrequent: frequency.indexOf(Math.max(...frequency)),
            leastFrequent: frequency.indexOf(Math.min(...frequency.filter(f => f > 0)))
        };
    }

    /**
     * 多通道数据提取
     */
    extractMultiChannel(imageData: ImageData, channels: Channel[] = ['red', 'green', 'blue'], bitPosition: number = 0): MultiChannelResult {
        const results: MultiChannelResult = {};

        for (const channel of channels) {
            const bits = this.extractLSB(imageData, channel, bitPosition);
            const bytes = this.bitsToBytes(bits); // 默认MSB First
            const patterns = this.detectTextPatterns(bytes);

            results[channel] = {
                bits,
                bytes,
                patterns,
                text: this.bytesToText(bytes),
                length: bytes.length
            };
        }

        return results;
    }

    /**
     * 顺序数据提取
     */
    extractSequential(imageData: ImageData, _startChannel: Channel = 'red', bitPositions: number[] = [0, 1, 2], channels: Channel[] = ['red', 'green', 'blue']): ExtractionResult {
        const allBits: number[] = [];

        for (const bitPos of bitPositions) {
            for (const channel of channels) {
                const bits = this.extractLSB(imageData, channel, bitPos);
                allBits.push(...bits);
            }
        }

        const bytes = this.bitsToBytes(allBits); // 默认MSB First
        const patterns = this.detectTextPatterns(bytes);

        return {
            bits: allBits,
            bytes,
            patterns,
            text: this.bytesToText(bytes),
            length: bytes.length
        };
    }

    /**
     * 随机位置数据提取
     */
    extractRandom(imageData: ImageData, seed: number = 12345, channel: Channel = 'red', bitPosition: number = 0): ExtractionResult {
        const data = imageData.data;
        const totalPixels = imageData.width * imageData.height;

        // 简单的线性同余生成器
        let rng = seed;
        const positions: number[] = [];

        for (let i = 0; i < totalPixels; i++) {
            rng = (rng * 1103515245 + 12345) & 0x7fffffff;
            positions.push(rng % totalPixels);
        }

        const channelOffset = getChannelOffset(channel);
        const bitMask = 1 << bitPosition;
        const extractedBits: number[] = [];

        for (const pos of positions) {
            const pixelIndex = pos * 4 + channelOffset;
            if (pixelIndex < data.length) {
                const bit = (data[pixelIndex] & bitMask) ? 1 : 0;
                extractedBits.push(bit);
            }
        }

        const bytes = this.bitsToBytes(extractedBits);
        const patterns = this.detectTextPatterns(bytes);

        return {
            bits: extractedBits,
            bytes,
            patterns,
            text: this.bytesToText(bytes),
            length: bytes.length,
            seed
        };
    }

    /**
     * 智能数据提取
     */
    smartExtraction(imageData: ImageData): SmartExtractionResult {
        const results: SmartExtractionResult = {
            lsb: {},
            multiChannel: {},
            sequential: null,
            bestCandidate: null
        };

        // LSB提取（所有通道和位位置）
        for (const channel of this.channels) {
            results.lsb[channel] = {};
            for (let bit = 0; bit < 3; bit++) { // 只检查低3位
                const extraction = this.extractLSB(imageData, channel, bit);
                const bytes = this.bitsToBytes(extraction);
                const patterns = this.detectTextPatterns(bytes);

                results.lsb[channel][bit] = {
                    bytes,
                    patterns,
                    text: this.bytesToText(bytes),
                    score: this.calculateExtractionScore(patterns)
                };
            }
        }

        // 多通道提取
        results.multiChannel = this.extractMultiChannel(imageData);

        // 顺序提取
        results.sequential = this.extractSequential(imageData);

        // 找到最佳候选
        results.bestCandidate = this.findBestExtraction(results);

        return results;
    }

    /**
     * 计算提取结果的评分
     */
    calculateExtractionScore(patterns: TextPatterns): number {
        let score = 0;

        if (patterns.ascii.isProbable) {
            score += patterns.ascii.confidence * 0.4;
        }

        if (patterns.utf8.isProbable) {
            score += patterns.utf8.confidence * 0.3;
        }

        if (patterns.compressed.isProbable) {
            score += patterns.compressed.confidence * 0.2;
        }

        if (patterns.encrypted.isProbable) {
            score += patterns.encrypted.confidence * 0.1;
        }

        return score;
    }

    /**
     * 找到最佳提取结果
     */
    findBestExtraction(results: SmartExtractionResult): BestExtraction {
        let bestScore = 0;
        let bestResult: ScoredExtraction | ExtractionResult | null = null;
        let bestMethod = '';

        // 检查LSB结果
        for (const [channel, channelResults] of Object.entries(results.lsb)) {
            for (const [bit, result] of Object.entries(channelResults)) {
                if (result.score > bestScore) {
                    bestScore = result.score;
                    bestResult = result;
                    bestMethod = `LSB ${channel} bit ${bit}`;
                }
            }
        }

        // 检查多通道结果
        for (const [channel, result] of Object.entries(results.multiChannel)) {
            const score = this.calculateExtractionScore(result.patterns);
            if (score > bestScore) {
                bestScore = score;
                bestResult = result;
                bestMethod = `Multi-channel ${channel}`;
            }
        }

        // 检查顺序提取结果
        if (results.sequential) {
            const score = this.calculateExtractionScore(results.sequential.patterns);
            if (score > bestScore) {
                bestScore = score;
                bestResult = results.sequential;
                bestMethod = 'Sequential';
            }
        }

        return {
            method: bestMethod,
            score: bestScore,
            result: bestResult
        };
    }

    /**
     * 导出提取的数据
     */
    async exportExtractedData(data: ExtractionResult, format: ExportFormat = 'text'): Promise<string | undefined> {
        try {
            const { save } = await import('@tauri-apps/plugin-dialog');

            let content: string | Uint8Array;
            let extension: string;

            switch (format) {
                case 'text':
                    content = data.text || '';
                    extension = 'txt';
                    break;
                case 'binary':
                    content = new Uint8Array(data.bytes);
                    extension = 'bin';
                    break;
                case 'hex':
                    content = data.bytes.map(b => b.toString(16).padStart(2, '0')).join(' ');
                    extension = 'hex';
                    break;
                default:
                    throw new Error('不支持的导出格式');
            }

            const filePath = await save({
                title: translate('保存提取的数据'),
                defaultPath: `extracted_data.${extension}`,
                filters: [{
                    name: `${(format as string).toUpperCase()} ${translate('文件')}`,
                    extensions: [extension]
                }]
            });

            if (filePath) {
                const { invoke } = (window as any).__TAURI__.core;
                await invoke('save_extracted_data', {
                    filePath,
                    content: content instanceof Uint8Array ? Array.from(content) : content,
                    format
                });

                return filePath;
            }
            return undefined;
        } catch (error) {
            throw new Error('导出数据失败: ' + (error instanceof Error ? error.message : String(error)));
        }
    }
}
