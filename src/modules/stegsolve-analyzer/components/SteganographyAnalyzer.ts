/**
 * 隐写分析器
 * 提供直方图分析、卡方检验、熵分析等隐写检测功能
 */

import { LANGUAGE_DOM_EVENT_NAME, translate } from '../../../i18n';

/** 直方图数据（按 RGB 通道） */
interface RGBHistogram {
    red: number[];
    green: number[];
    blue: number[];
}

/** 卡方检验结果 */
interface ChiSquareResult {
    chiSquare: number;
    pValue: number;
    stegoProb: string;
}

/** 熵分析结果 */
interface EntropyResult {
    overall: number;
    red: number;
    green: number;
    blue: number;
}

/** 块能量分布 */
interface BlockEnergy {
    total: number;
    highFreq: number;
}

/** DCT 分析结果 */
interface DCTResult {
    quality: number;
    anomalies: string;
}

/** 调色板颜色 */
interface PaletteColor {
    r: number;
    g: number;
    b: number;
    a: number;
}

/** 调色板分析结果 */
interface PaletteResult {
    imageType: string;
    paletteSize: number;
    unusedColors: number;
    palette: PaletteColor[];
    usage: Map<string, number>;
}

/** 直方图通道选择 */
type HistogramChannel = 'rgb' | 'red' | 'green' | 'blue';

/**
 * 获取元素的 2D 上下文，断言上下文存在
 */
function get2DContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('无法获取 Canvas 2D 上下文');
    }
    return ctx;
}

export class SteganographyAnalyzer {
    private histogramCanvas: HTMLCanvasElement | null = null;
    private entropyMapCanvas: HTMLCanvasElement | null = null;
    private spectrumCanvas: HTMLCanvasElement | null = null;
    private dctCanvas: HTMLCanvasElement | null = null;
    private paletteCanvas: HTMLCanvasElement | null = null;
    private currentImageData: ImageData | null = null;
    private currentFrequencyTab: string = 'fft';
    private languageListenerBound: boolean = false;
    private readonly handleLanguageChange = (): void => {
        if (!this.currentImageData) return;
        const activeAnalysis = document.querySelector<HTMLElement>('.analysis-tab.active')?.dataset.analysis;
        if (activeAnalysis === 'histogram') {
            const selectedChannel = document.querySelector<HTMLInputElement>('input[name="histogramChannel"]:checked')?.value as HistogramChannel || 'rgb';
            this.updateHistogram(selectedChannel);
        } else if (activeAnalysis === 'frequency' && this.currentFrequencyTab === 'fft') {
            this.generateFFTSpectrum(this.currentImageData);
        }
    };

    /**
     * 初始化分析器
     */
    init(): void {
        this.histogramCanvas = document.getElementById('histogramCanvas') as HTMLCanvasElement | null;
        this.entropyMapCanvas = document.getElementById('entropyMapCanvas') as HTMLCanvasElement | null;
        this.spectrumCanvas = document.getElementById('spectrumCanvas') as HTMLCanvasElement | null;
        this.dctCanvas = document.getElementById('dctCanvas') as HTMLCanvasElement | null;
        this.paletteCanvas = document.getElementById('paletteCanvas') as HTMLCanvasElement | null;

        // 绑定事件
        this.bindEvents();
        if (!this.languageListenerBound) {
            window.addEventListener(LANGUAGE_DOM_EVENT_NAME, this.handleLanguageChange);
            this.languageListenerBound = true;
        }

        console.log('隐写分析器初始化完成');
    }

    /**
     * 绑定事件
     */
    bindEvents(): void {
        // 分析标签页切换
        const analysisTabs = document.querySelectorAll<HTMLElement>('.analysis-tab');
        analysisTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                this.switchAnalysisTab(tab.getAttribute('data-analysis') || '');
            });
        });

        // 直方图通道切换
        const histogramChannels = document.querySelectorAll<HTMLInputElement>('input[name="histogramChannel"]');
        histogramChannels.forEach(radio => {
            radio.addEventListener('change', () => {
                if (radio.checked && this.currentImageData) {
                    this.updateHistogram(radio.value as HistogramChannel);
                }
            });
        });

        // 卡方检验按钮
        const runChiSquareBtn = document.getElementById('runChiSquareBtn');
        if (runChiSquareBtn) {
            runChiSquareBtn.addEventListener('click', () => {
                this.runChiSquareTest();
            });
        }

        // 熵分析按钮
        const runEntropyBtn = document.getElementById('runEntropyBtn');
        if (runEntropyBtn) {
            runEntropyBtn.addEventListener('click', () => {
                this.runEntropyAnalysis();
            });
        }

        // 频域分析标签页
        const freqTabs = document.querySelectorAll<HTMLElement>('.freq-tab');
        freqTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                this.switchFrequencyTab(tab.getAttribute('data-freq') || '');
            });
        });

        // FFT分析按钮
        const runFFTBtn = document.getElementById('runFFTBtn');
        if (runFFTBtn) {
            runFFTBtn.addEventListener('click', () => {
                this.runFFTAnalysis();
            });
        }

        // DCT分析按钮
        const runDCTBtn = document.getElementById('runDCTBtn');
        if (runDCTBtn) {
            runDCTBtn.addEventListener('click', () => {
                this.runDCTAnalysis();
            });
        }

        // 调色板分析按钮
        const runPaletteBtn = document.getElementById('runPaletteBtn');
        if (runPaletteBtn) {
            runPaletteBtn.addEventListener('click', () => {
                this.runPaletteAnalysis();
            });
        }

        // 调色板控制选项
        const showIndexLSB = document.getElementById('showIndexLSB');
        const highlightUnused = document.getElementById('highlightUnused');

        if (showIndexLSB) {
            showIndexLSB.addEventListener('change', () => {
                this.updatePaletteDisplay();
            });
        }

        if (highlightUnused) {
            highlightUnused.addEventListener('change', () => {
                this.updatePaletteDisplay();
            });
        }
    }

    /**
     * 切换分析标签页
     */
    switchAnalysisTab(analysisType: string): void {
        // 更新标签页状态
        document.querySelectorAll<HTMLElement>('.analysis-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`[data-analysis="${analysisType}"]`)?.classList.add('active');

        // 显示对应内容
        document.querySelectorAll<HTMLElement>('.analysis-content').forEach(content => {
            content.style.display = 'none';
        });

        const targetContent = document.getElementById(`${analysisType}Analysis`);
        if (targetContent) {
            targetContent.style.display = 'block';
        }

        // 如果切换到直方图且有图像数据，自动更新直方图
        if (analysisType === 'histogram' && this.currentImageData) {
            const selectedChannel = document.querySelector<HTMLInputElement>('input[name="histogramChannel"]:checked')?.value as HistogramChannel || 'rgb';
            this.updateHistogram(selectedChannel);
        }
    }

    /**
     * 设置图像数据
     */
    setImageData(imageData: ImageData): void {
        this.currentImageData = imageData;

        // 如果当前显示直方图，自动更新
        const activeTab = document.querySelector('.analysis-tab.active');
        if (activeTab && activeTab.getAttribute('data-analysis') === 'histogram') {
            const selectedChannel = document.querySelector<HTMLInputElement>('input[name="histogramChannel"]:checked')?.value as HistogramChannel || 'rgb';
            this.updateHistogram(selectedChannel);
        }
    }

    /**
     * 更新直方图
     */
    updateHistogram(channel: HistogramChannel): void {
        if (!this.histogramCanvas || !this.currentImageData) return;

        const ctx = get2DContext(this.histogramCanvas);
        const width = this.histogramCanvas.width;
        const height = this.histogramCanvas.height;

        // 清空画布
        ctx.clearRect(0, 0, width, height);

        // 计算直方图数据
        const histogramData = this.calculateHistogram(this.currentImageData, channel);

        // 绘制直方图
        this.drawHistogram(ctx, histogramData, channel, width, height);
    }

    /**
     * 计算直方图数据
     */
    calculateHistogram(imageData: ImageData, _channel: HistogramChannel): RGBHistogram {
        const data = imageData.data;
        const histogram: RGBHistogram = {
            red: new Array<number>(256).fill(0),
            green: new Array<number>(256).fill(0),
            blue: new Array<number>(256).fill(0)
        };

        // 统计像素值分布
        for (let i = 0; i < data.length; i += 4) {
            histogram.red[data[i]]++;
            histogram.green[data[i + 1]]++;
            histogram.blue[data[i + 2]]++;
        }

        return histogram;
    }

    /**
     * 绘制直方图
     */
    drawHistogram(ctx: CanvasRenderingContext2D, histogramData: RGBHistogram, channel: HistogramChannel, width: number, height: number): void {
        const margin = 20;
        const chartWidth = width - 2 * margin;
        const chartHeight = height - 2 * margin;

        // 找到最大值用于归一化
        let maxValue = 0;
        if (channel === 'rgb') {
            maxValue = Math.max(
                Math.max(...histogramData.red),
                Math.max(...histogramData.green),
                Math.max(...histogramData.blue)
            );
        } else {
            maxValue = Math.max(...histogramData[channel]);
        }

        // 绘制坐标轴
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(margin, margin);
        ctx.lineTo(margin, height - margin);
        ctx.lineTo(width - margin, height - margin);
        ctx.stroke();

        // 绘制直方图
        const barWidth = chartWidth / 256;

        if (channel === 'rgb') {
            // 绘制RGB三个通道
            this.drawChannelHistogram(ctx, histogramData.red, '#ff0000', margin, chartHeight, barWidth, maxValue, 0.3);
            this.drawChannelHistogram(ctx, histogramData.green, '#00ff00', margin, chartHeight, barWidth, maxValue, 0.3);
            this.drawChannelHistogram(ctx, histogramData.blue, '#0000ff', margin, chartHeight, barWidth, maxValue, 0.3);
        } else {
            // 绘制单个通道
            const colors: Record<'red' | 'green' | 'blue', string> = { red: '#ff0000', green: '#00ff00', blue: '#0000ff' };
            this.drawChannelHistogram(ctx, histogramData[channel], colors[channel], margin, chartHeight, barWidth, maxValue, 0.8);
        }

        // 添加标签和刻度
        ctx.fillStyle = '#333';
        ctx.font = '10px Arial';

        // X轴标签
        ctx.fillText('0', margin - 5, height - margin + 15);
        ctx.fillText('255', width - margin - 10, height - margin + 15);
        ctx.fillText(translate('像素值'), width / 2 - 15, height - 5);

        // Y轴刻度
        const ySteps = 5;
        for (let i = 0; i <= ySteps; i++) {
            const y = margin + (chartHeight * i / ySteps);
            const value = Math.round(maxValue * (ySteps - i) / ySteps);

            // 绘制刻度线
            ctx.strokeStyle = '#ddd';
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(margin - 3, y);
            ctx.lineTo(margin + 3, y);
            ctx.stroke();

            // 绘制刻度值（简化显示）
            let displayValue: string;
            if (value >= 1000) {
                displayValue = Math.round(value / 1000) + 'k';
            } else {
                displayValue = String(value);
            }

            ctx.fillStyle = '#666';
            ctx.font = '9px Arial';
            ctx.textAlign = 'right';
            ctx.fillText(displayValue, margin - 5, y + 3);
        }

        // 重置文本对齐
        ctx.textAlign = 'left';

        // Y轴标签
        ctx.save();
        ctx.translate(10, height / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillStyle = '#333';
        ctx.font = '10px Arial';
        ctx.fillText(translate('频次'), -15, 0);
        ctx.restore();
    }

    /**
     * 绘制单个通道的直方图
     */
    drawChannelHistogram(ctx: CanvasRenderingContext2D, data: number[], color: string, margin: number, chartHeight: number, barWidth: number, maxValue: number, alpha: number): void {
        ctx.fillStyle = color;
        ctx.globalAlpha = alpha;

        for (let i = 0; i < 256; i++) {
            const barHeight = (data[i] / maxValue) * chartHeight;
            const x = margin + i * barWidth;
            const y = margin + chartHeight - barHeight;

            ctx.fillRect(x, y, barWidth, barHeight);
        }

        ctx.globalAlpha = 1.0;
    }

    /**
     * 执行卡方检验
     */
    runChiSquareTest(): void {
        if (!this.currentImageData) {
            console.log('没有图像数据进行卡方检验');
            return;
        }

        console.log('开始执行卡方检验...');

        try {
            const result = this.calculateChiSquare(this.currentImageData);

            // 更新显示
            const chiSquareValue = document.getElementById('chiSquareValue');
            if (chiSquareValue) chiSquareValue.textContent = result.chiSquare.toFixed(4);
            const pValueEl = document.getElementById('pValue');
            if (pValueEl) pValueEl.textContent = result.pValue.toFixed(6);
            const stegoProbEl = document.getElementById('stegoProb');
            if (stegoProbEl) stegoProbEl.textContent = result.stegoProb;

        } catch (error) {
            console.error('卡方检验失败:', error);
        }
    }

    /**
     * 计算卡方值
     */
    calculateChiSquare(imageData: ImageData): ChiSquareResult {
        const data = imageData.data;

        // 使用LSB卡方检验方法
        const evenOdd = { even: 0, odd: 0 };
        const totalPixels = imageData.width * imageData.height;

        // 统计LSB为0和1的像素数量
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            if (r % 2 === 0) {
                evenOdd.even++;
            } else {
                evenOdd.odd++;
            }
        }

        // 计算期望值（理论上应该各占一半）
        const expectedEven = totalPixels / 2;
        const expectedOdd = totalPixels / 2;

        // 计算卡方值
        const chiSquare =
            Math.pow(evenOdd.even - expectedEven, 2) / expectedEven +
            Math.pow(evenOdd.odd - expectedOdd, 2) / expectedOdd;

        // 计算P值
        const pValue = this.calculatePValue(chiSquare);

        // 判断隐写概率
        let stegoProb = '低';
        if (chiSquare > 10.83) stegoProb = '高'; // 99.9%置信度
        else if (chiSquare > 6.63) stegoProb = '中'; // 99%置信度
        else if (chiSquare > 3.84) stegoProb = '低-中'; // 95%置信度

        console.log('卡方检验结果:', {
            evenPixels: evenOdd.even,
            oddPixels: evenOdd.odd,
            chiSquare,
            pValue,
            stegoProb
        });

        return {
            chiSquare: chiSquare,
            pValue: pValue,
            stegoProb: stegoProb
        };
    }

    /**
     * 计算P值（简化实现）
     */
    calculatePValue(chiSquare: number): number {
        // 使用简化的卡方分布P值计算（自由度为1）
        // 这是一个近似计算，实际应该使用更精确的统计方法
        if (chiSquare <= 0) return 1.0;

        // 简化的P值计算公式
        const pValue = Math.exp(-chiSquare / 2);
        return Math.min(1.0, Math.max(0.0, pValue));
    }

    /**
     * 执行熵分析
     */
    runEntropyAnalysis(): void {
        if (!this.currentImageData) {
            console.log('没有图像数据进行熵分析');
            return;
        }

        console.log('开始执行熵分析...');

        try {
            const result = this.calculateEntropy(this.currentImageData);

            // 更新显示
            const overallEntropy = document.getElementById('overallEntropy');
            if (overallEntropy) overallEntropy.textContent = result.overall.toFixed(4);
            const redEntropy = document.getElementById('redEntropy');
            if (redEntropy) redEntropy.textContent = result.red.toFixed(4);
            const greenEntropy = document.getElementById('greenEntropy');
            if (greenEntropy) greenEntropy.textContent = result.green.toFixed(4);
            const blueEntropy = document.getElementById('blueEntropy');
            if (blueEntropy) blueEntropy.textContent = result.blue.toFixed(4);

            // 生成熵图
            this.generateEntropyMap(this.currentImageData);

        } catch (error) {
            console.error('熵分析失败:', error);
        }
    }

    /**
     * 计算图像熵
     */
    calculateEntropy(imageData: ImageData): EntropyResult {
        const data = imageData.data;

        // 分别统计RGB通道的像素值分布
        const redHist = new Array<number>(256).fill(0);
        const greenHist = new Array<number>(256).fill(0);
        const blueHist = new Array<number>(256).fill(0);
        const overallHist = new Array<number>(256).fill(0);

        let totalPixels = 0;

        for (let i = 0; i < data.length; i += 4) {
            redHist[data[i]]++;
            greenHist[data[i + 1]]++;
            blueHist[data[i + 2]]++;

            // 计算灰度值用于整体熵
            const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
            overallHist[gray]++;
            totalPixels++;
        }

        // 计算各通道熵值
        const redEntropy = this.calculateChannelEntropy(redHist, totalPixels);
        const greenEntropy = this.calculateChannelEntropy(greenHist, totalPixels);
        const blueEntropy = this.calculateChannelEntropy(blueHist, totalPixels);
        const overallEntropy = this.calculateChannelEntropy(overallHist, totalPixels);

        return {
            overall: overallEntropy,
            red: redEntropy,
            green: greenEntropy,
            blue: blueEntropy
        };
    }

    /**
     * 计算单通道熵值
     */
    calculateChannelEntropy(histogram: number[], totalPixels: number): number {
        let entropy = 0;

        for (let i = 0; i < histogram.length; i++) {
            if (histogram[i] > 0) {
                const probability = histogram[i] / totalPixels;
                entropy -= probability * Math.log2(probability);
            }
        }

        return entropy;
    }

    /**
     * 生成熵图可视化
     */
    generateEntropyMap(imageData: ImageData): void {
        if (!this.entropyMapCanvas) return;

        const ctx = get2DContext(this.entropyMapCanvas);
        const canvasWidth = this.entropyMapCanvas.width;
        const canvasHeight = this.entropyMapCanvas.height;

        // 清空画布
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);

        const blockSize = 8; // 8x8像素块
        const imageWidth = imageData.width;
        const imageHeight = imageData.height;
        const data = imageData.data;

        const blocksX = Math.floor(imageWidth / blockSize);
        const blocksY = Math.floor(imageHeight / blockSize);

        const blockWidth = canvasWidth / blocksX;
        const blockHeight = canvasHeight / blocksY;

        // 计算每个块的熵值
        for (let by = 0; by < blocksY; by++) {
            for (let bx = 0; bx < blocksX; bx++) {
                const blockEntropy = this.calculateBlockEntropy(
                    data, imageWidth,
                    bx * blockSize, by * blockSize,
                    blockSize, blockSize
                );

                // 将熵值映射到颜色（0-8的熵值映射到0-255的灰度）
                const grayValue = Math.min(255, Math.floor(blockEntropy * 32));

                ctx.fillStyle = `rgb(${grayValue}, ${grayValue}, ${grayValue})`;
                ctx.fillRect(
                    bx * blockWidth,
                    by * blockHeight,
                    blockWidth,
                    blockHeight
                );
            }
        }
    }

    /**
     * 计算图像块的熵值
     */
    calculateBlockEntropy(data: Uint8ClampedArray, imageWidth: number, startX: number, startY: number, blockWidth: number, blockHeight: number): number {
        const histogram = new Array<number>(256).fill(0);
        let totalPixels = 0;

        // 统计块内像素的灰度分布
        for (let y = startY; y < startY + blockHeight; y++) {
            for (let x = startX; x < startX + blockWidth; x++) {
                const index = (y * imageWidth + x) * 4;
                if (index < data.length) {
                    const gray = Math.round(0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2]);
                    histogram[gray]++;
                    totalPixels++;
                }
            }
        }

        // 计算熵值
        return this.calculateChannelEntropy(histogram, totalPixels);
    }

    /**
     * 切换频域分析标签页
     */
    switchFrequencyTab(freqType: string): void {
        // 更新标签页状态
        document.querySelectorAll<HTMLElement>('.freq-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`[data-freq="${freqType}"]`)?.classList.add('active');

        // 显示对应内容
        document.querySelectorAll<HTMLElement>('.frequency-content').forEach(content => {
            content.style.display = 'none';
        });

        const targetContent = document.getElementById(`${freqType}Content`);
        if (targetContent) {
            targetContent.style.display = 'block';
        }

        this.currentFrequencyTab = freqType;
    }

    /**
     * 执行FFT频谱分析
     */
    runFFTAnalysis(): void {
        if (!this.currentImageData) {
            console.log('没有图像数据进行FFT分析');
            return;
        }

        console.log('开始执行FFT频谱分析...');

        try {
            this.generateFFTSpectrum(this.currentImageData);
        } catch (error) {
            console.error('FFT分析失败:', error);
        }
    }

    /**
     * 生成FFT频谱图
     */
    generateFFTSpectrum(imageData: ImageData): void {
        if (!this.spectrumCanvas) return;

        const ctx = get2DContext(this.spectrumCanvas);
        const canvasWidth = this.spectrumCanvas.width;
        const canvasHeight = this.spectrumCanvas.height;

        // 清空画布
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);

        // 转换为灰度图像
        const grayData = this.convertToGrayscale(imageData);

        // 简化的FFT可视化（实际应该使用真正的FFT算法）
        // 这里使用简化的频域表示
        const blockSize = 8;
        const blocksX = Math.floor(imageData.width / blockSize);
        const blocksY = Math.floor(imageData.height / blockSize);

        const blockWidth = canvasWidth / blocksX;
        const blockHeight = canvasHeight / blocksY;

        // 计算每个块的"频域强度"（简化）
        for (let by = 0; by < blocksY; by++) {
            for (let bx = 0; bx < blocksX; bx++) {
                const intensity = this.calculateBlockFrequencyIntensity(
                    grayData, imageData.width,
                    bx * blockSize, by * blockSize,
                    blockSize, blockSize
                );

                // 将强度映射到颜色
                const colorValue = Math.min(255, Math.floor(intensity * 255));

                ctx.fillStyle = `rgb(${colorValue}, ${colorValue}, ${colorValue})`;
                ctx.fillRect(
                    bx * blockWidth,
                    by * blockHeight,
                    blockWidth,
                    blockHeight
                );
            }
        }

        // 添加标签
        ctx.fillStyle = '#333';
        ctx.font = '10px Arial';
        ctx.fillText(translate('低频'), 10, canvasHeight - 10);
        ctx.fillText(translate('高频'), canvasWidth - 40, 20);
    }

    /**
     * 转换为灰度数据
     */
    convertToGrayscale(imageData: ImageData): Uint8ClampedArray {
        const data = imageData.data;
        const grayData = new Uint8ClampedArray(imageData.width * imageData.height);

        for (let i = 0; i < data.length; i += 4) {
            const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
            grayData[i / 4] = gray;
        }

        return grayData;
    }

    /**
     * 计算块的频域强度（简化）
     */
    calculateBlockFrequencyIntensity(grayData: Uint8ClampedArray, imageWidth: number, startX: number, startY: number, blockWidth: number, blockHeight: number): number {
        let totalVariation = 0;
        let pixelCount = 0;

        // 计算块内像素的变化程度作为频域强度的近似
        for (let y = startY; y < startY + blockHeight - 1; y++) {
            for (let x = startX; x < startX + blockWidth - 1; x++) {
                const index = y * imageWidth + x;
                const nextXIndex = y * imageWidth + (x + 1);
                const nextYIndex = (y + 1) * imageWidth + x;

                if (index < grayData.length && nextXIndex < grayData.length && nextYIndex < grayData.length) {
                    const current = grayData[index];
                    const rightDiff = Math.abs(current - grayData[nextXIndex]);
                    const downDiff = Math.abs(current - grayData[nextYIndex]);

                    totalVariation += rightDiff + downDiff;
                    pixelCount += 2;
                }
            }
        }

        return pixelCount > 0 ? totalVariation / (pixelCount * 255) : 0;
    }

    /**
     * 执行DCT系数分析
     */
    runDCTAnalysis(): void {
        if (!this.currentImageData) {
            console.log('没有图像数据进行DCT分析');
            return;
        }

        console.log('开始执行DCT系数分析...');

        try {
            const result = this.analyzeDCTCoefficients(this.currentImageData);

            // 更新显示
            const jpegQuality = document.getElementById('jpegQuality');
            if (jpegQuality) jpegQuality.textContent = result.quality + '%';
            const dctAnomalies = document.getElementById('dctAnomalies');
            if (dctAnomalies) dctAnomalies.textContent = result.anomalies;

            // 生成DCT可视化
            this.generateDCTVisualization(this.currentImageData);

        } catch (error) {
            console.error('DCT分析失败:', error);
        }
    }

    /**
     * 分析DCT系数
     */
    analyzeDCTCoefficients(imageData: ImageData): DCTResult {
        // 简化的DCT分析
        // 实际应该解析JPEG的DCT系数，这里使用近似方法

        const grayData = this.convertToGrayscale(imageData);
        let totalEnergy = 0;
        let highFreqEnergy = 0;
        let blockCount = 0;

        const blockSize = 8;
        const blocksX = Math.floor(imageData.width / blockSize);
        const blocksY = Math.floor(imageData.height / blockSize);

        // 分析8x8块的频域特征
        for (let by = 0; by < blocksY; by++) {
            for (let bx = 0; bx < blocksX; bx++) {
                const blockEnergy = this.calculateBlockEnergy(
                    grayData, imageData.width,
                    bx * blockSize, by * blockSize,
                    blockSize, blockSize
                );

                totalEnergy += blockEnergy.total;
                highFreqEnergy += blockEnergy.highFreq;
                blockCount++;
            }
        }

        // 估计JPEG质量（简化）
        const avgEnergy = totalEnergy / blockCount;
        const highFreqRatio = highFreqEnergy / totalEnergy;
        const estimatedQuality = Math.round((1 - highFreqRatio) * 100);
        void avgEnergy; // 原始实现保留的中间量（未直接使用）

        // 检测异常
        let anomalies = '无';
        if (highFreqRatio > 0.3) {
            anomalies = '高频异常';
        } else if (highFreqRatio < 0.05) {
            anomalies = '过度压缩';
        }

        return {
            quality: Math.max(10, Math.min(100, estimatedQuality)),
            anomalies: anomalies
        };
    }

    /**
     * 计算块的能量分布
     */
    calculateBlockEnergy(grayData: Uint8ClampedArray, imageWidth: number, startX: number, startY: number, blockWidth: number, blockHeight: number): BlockEnergy {
        let totalEnergy = 0;
        let highFreqEnergy = 0;
        let pixelCount = 0;

        // 计算块内的能量分布
        for (let y = startY; y < startY + blockHeight; y++) {
            for (let x = startX; x < startX + blockWidth; x++) {
                const index = y * imageWidth + x;
                if (index < grayData.length) {
                    const value = grayData[index];
                    totalEnergy += value * value;

                    // 简化的高频检测：边缘像素
                    if (x > startX && y > startY) {
                        const leftIndex = y * imageWidth + (x - 1);
                        const upIndex = (y - 1) * imageWidth + x;

                        if (leftIndex < grayData.length && upIndex < grayData.length) {
                            const leftDiff = Math.abs(value - grayData[leftIndex]);
                            const upDiff = Math.abs(value - grayData[upIndex]);
                            highFreqEnergy += leftDiff + upDiff;
                        }
                    }

                    pixelCount++;
                }
            }
        }

        return {
            total: totalEnergy / pixelCount,
            highFreq: highFreqEnergy / pixelCount
        };
    }

    /**
     * 生成DCT可视化
     */
    generateDCTVisualization(imageData: ImageData): void {
        if (!this.dctCanvas) return;

        const ctx = get2DContext(this.dctCanvas);
        const canvasWidth = this.dctCanvas.width;
        const canvasHeight = this.dctCanvas.height;

        // 清空画布
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);

        // 绘制DCT系数的可视化表示
        // 这里使用简化的方法，实际应该显示真正的DCT系数

        const blockSize = 8;
        const blocksX = Math.floor(imageData.width / blockSize);
        const blocksY = Math.floor(imageData.height / blockSize);

        const blockWidth = canvasWidth / blocksX;
        const blockHeight = canvasHeight / blocksY;

        const grayData = this.convertToGrayscale(imageData);

        for (let by = 0; by < blocksY; by++) {
            for (let bx = 0; bx < blocksX; bx++) {
                const energy = this.calculateBlockEnergy(
                    grayData, imageData.width,
                    bx * blockSize, by * blockSize,
                    blockSize, blockSize
                );

                // 将能量映射到颜色
                const intensity = Math.min(255, Math.floor(energy.total / 1000));

                ctx.fillStyle = `rgb(${intensity}, ${intensity}, ${intensity})`;
                ctx.fillRect(
                    bx * blockWidth,
                    by * blockHeight,
                    blockWidth,
                    blockHeight
                );
            }
        }

        // 添加网格线显示8x8块
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 0.5;

        for (let x = 0; x <= blocksX; x++) {
            ctx.beginPath();
            ctx.moveTo(x * blockWidth, 0);
            ctx.lineTo(x * blockWidth, canvasHeight);
            ctx.stroke();
        }

        for (let y = 0; y <= blocksY; y++) {
            ctx.beginPath();
            ctx.moveTo(0, y * blockHeight);
            ctx.lineTo(canvasWidth, y * blockHeight);
            ctx.stroke();
        }
    }

    /**
     * 执行调色板分析
     */
    runPaletteAnalysis(): void {
        if (!this.currentImageData) {
            console.log('没有图像数据进行调色板分析');
            return;
        }

        console.log('开始执行调色板分析...');

        try {
            const result = this.analyzePalette(this.currentImageData);

            // 更新显示
            const imageType = document.getElementById('imageType');
            if (imageType) imageType.textContent = result.imageType;
            const paletteSize = document.getElementById('paletteSize');
            if (paletteSize) paletteSize.textContent = String(result.paletteSize);
            const unusedColors = document.getElementById('unusedColors');
            if (unusedColors) unusedColors.textContent = String(result.unusedColors);

            // 生成调色板可视化
            this.generatePaletteVisualization(result.palette, result.usage);

        } catch (error) {
            console.error('调色板分析失败:', error);
        }
    }

    /**
     * 分析调色板
     */
    analyzePalette(imageData: ImageData): PaletteResult {
        const data = imageData.data;
        const colorMap = new Map<string, number>();
        const palette: PaletteColor[] = [];

        // 统计所有颜色
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];

            const colorKey = `${r},${g},${b},${a}`;

            if (colorMap.has(colorKey)) {
                colorMap.set(colorKey, (colorMap.get(colorKey) ?? 0) + 1);
            } else {
                colorMap.set(colorKey, 1);
                palette.push({ r, g, b, a });
            }
        }

        // 分析图像类型
        let imageType = 'True Color';
        if (palette.length <= 256) {
            imageType = `Indexed (${palette.length} colors)`;
        } else if (palette.length <= 65536) {
            imageType = `High Color (${palette.length} colors)`;
        }

        // 检测未使用的调色板条目（对于索引图像）
        let unusedColors = 0;
        if (palette.length <= 256) {
            // 简化检测：如果某些颜色使用频率极低，可能是未使用的
            const totalPixels = imageData.width * imageData.height;
            const threshold = totalPixels * 0.001; // 0.1%阈值

            palette.forEach(color => {
                const colorKey = `${color.r},${color.g},${color.b},${color.a}`;
                const usage = colorMap.get(colorKey) ?? 0;
                if (usage < threshold) {
                    unusedColors++;
                }
            });
        }

        return {
            imageType: imageType,
            paletteSize: palette.length,
            unusedColors: unusedColors,
            palette: palette.slice(0, 256), // 限制显示前256个颜色
            usage: colorMap
        };
    }

    /**
     * 生成调色板可视化
     */
    generatePaletteVisualization(palette: PaletteColor[], usage: Map<string, number>): void {
        if (!this.paletteCanvas) return;

        const ctx = get2DContext(this.paletteCanvas);
        const canvasWidth = this.paletteCanvas.width;
        const canvasHeight = this.paletteCanvas.height;

        // 清空画布
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);

        if (palette.length === 0) return;

        const colorsPerRow = Math.min(32, palette.length);
        const rows = Math.ceil(palette.length / colorsPerRow);
        const colorWidth = canvasWidth / colorsPerRow;
        const colorHeight = canvasHeight / rows;

        const showIndexLSB = (document.getElementById('showIndexLSB') as HTMLInputElement | null)?.checked || false;
        const highlightUnused = (document.getElementById('highlightUnused') as HTMLInputElement | null)?.checked || false;

        // 绘制调色板
        palette.forEach((color, index) => {
            const row = Math.floor(index / colorsPerRow);
            const col = index % colorsPerRow;

            const x = col * colorWidth;
            const y = row * colorHeight;

            // 获取颜色使用情况
            const colorKey = `${color.r},${color.g},${color.b},${color.a}`;
            const colorUsage = usage.get(colorKey) || 0;

            // 基础颜色
            ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a / 255})`;
            ctx.fillRect(x, y, colorWidth, colorHeight);

            // 高亮未使用颜色
            if (highlightUnused && colorUsage < 10) {
                ctx.strokeStyle = '#ff0000';
                ctx.lineWidth = 2;
                ctx.strokeRect(x, y, colorWidth, colorHeight);
            }

            // 显示索引LSB
            if (showIndexLSB) {
                const lsb = index & 1;
                ctx.fillStyle = lsb ? '#ffffff' : '#000000';
                ctx.font = '8px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(lsb.toString(), x + colorWidth / 2, y + colorHeight / 2 + 3);
            }

            // 绘制边框
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 0.5;
            ctx.strokeRect(x, y, colorWidth, colorHeight);
        });

        // 重置文本对齐
        ctx.textAlign = 'left';
    }

    /**
     * 更新调色板显示
     */
    updatePaletteDisplay(): void {
        // 重新运行调色板分析以更新显示
        this.runPaletteAnalysis();
    }
}
