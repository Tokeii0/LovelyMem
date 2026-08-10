/**
 * Stegsolve 隐写分析工具主模块
 * 负责图像隐写分析、通道分析、位平面分析等功能
 */

// 导入组件模块
import { ImageLoader } from './components/ImageLoader';
import { ChannelAnalyzer } from './components/ChannelAnalyzer';
import { BitPlaneAnalyzer } from './components/BitPlaneAnalyzer';
import { SteganographyAnalyzer } from './components/SteganographyAnalyzer';
import { FilterProcessor } from './components/FilterProcessor';
import { DataExtractor } from './components/DataExtractor';
import type { Channel, DataFormat, ExtractedData, ExtractionMethod, ImageStatisticsBasic, StegsolveApp } from './types';
import { translate } from '../../i18n';

// 全局Stegsolve分析器实例，用于调试
let globalStegsolveAnalyzer: StegsolveAnalyzer | null = null;

/** 应用数据状态 */
interface StegsolveData {
    originalImage: HTMLImageElement | null;
    currentImage: HTMLImageElement | null;
    imageData: ImageData | null;
    filename: string;
    filepath: string;
    currentMode: string;
    currentChannel: Channel;
    currentBit: number;
    zoomLevel: number;
    extractedData: ExtractedData | string | null;
    statistics: Record<string, unknown>;
    currentExtractionMethod?: ExtractionMethod;
    [key: string]: unknown;
}

/** 组件集合 */
interface StegsolveComponents {
    imageLoader: ImageLoader | null;
    channelAnalyzer: ChannelAnalyzer | null;
    bitPlaneAnalyzer: BitPlaneAnalyzer | null;
    steganographyAnalyzer: SteganographyAnalyzer | null;
    filterProcessor: FilterProcessor | null;
    dataExtractor: DataExtractor | null;
}

/** 选中的位平面项 */
interface SelectedBitPlane {
    channel: Channel;
    bit: number;
}

/**
 * Stegsolve隐写分析工具应用类
 */
class StegsolveAnalyzer implements StegsolveApp {
    data: StegsolveData;
    components: StegsolveComponents;
    canvas: HTMLCanvasElement | null;
    ctx: CanvasRenderingContext2D | null;
    isProcessing: boolean;
    readonly analysisModes: Record<string, string>;
    readonly filters: Record<string, string>;

    constructor() {
        this.data = {
            originalImage: null,
            currentImage: null,
            imageData: null,
            filename: '',
            filepath: '',
            currentMode: 'original',
            currentChannel: 'red',
            currentBit: 0,
            zoomLevel: 1.0,
            extractedData: '',
            statistics: {}
        };

        this.components = {
            imageLoader: null,
            channelAnalyzer: null,
            bitPlaneAnalyzer: null,
            steganographyAnalyzer: null,
            filterProcessor: null,
            dataExtractor: null
        };

        this.canvas = null;
        this.ctx = null;
        this.isProcessing = false;

        // 分析模式定义
        this.analysisModes = {
            'original': '原图',
            'red': '红通道',
            'green': '绿通道',
            'blue': '蓝通道',
            'alpha': 'Alpha通道',
            'grayscale': '灰度'
        };

        // 过滤器定义
        this.filters = {
            'invert': '反色',
            'xor': 'XOR',
            'add': '加法',
            'sub': '减法',
            'mul': '乘法',
            'and': 'AND',
            'or': 'OR'
        };

        this.init();
    }

    /**
     * 初始化应用
     */
    async init(): Promise<void> {
        try {
            console.log('🔍 初始化Stegsolve隐写分析工具...');

            // 初始化Canvas
            this.initCanvas();

            // 初始化组件
            await this.initComponents();

            // 绑定事件
            this.bindEvents();

            // 初始化UI状态
            this.initUIState();

            console.log('✅ Stegsolve隐写分析工具初始化完成');
            this.updateStatus('就绪');

        } catch (error) {
            console.error('❌ 初始化Stegsolve隐写分析工具失败:', error);
            this.updateStatus('初始化失败');
            this.showError('初始化失败: ' + (error instanceof Error ? error.message : String(error)));
        }
    }

    /**
     * 初始化Canvas
     */
    initCanvas(): void {
        this.canvas = document.getElementById('imageCanvas') as HTMLCanvasElement | null;
        if (!this.canvas) {
            throw new Error('未找到 imageCanvas 元素');
        }
        this.ctx = this.canvas.getContext('2d');

        // 设置Canvas样式
        this.canvas.style.imageRendering = 'pixelated';
        this.canvas.style.imageRendering = '-moz-crisp-edges';
        this.canvas.style.imageRendering = 'crisp-edges';
    }

    /**
     * 初始化组件
     */
    async initComponents(): Promise<void> {
        this.components.imageLoader = new ImageLoader(this);
        this.components.channelAnalyzer = new ChannelAnalyzer(this);
        this.components.bitPlaneAnalyzer = new BitPlaneAnalyzer(this);
        this.components.steganographyAnalyzer = new SteganographyAnalyzer();
        this.components.filterProcessor = new FilterProcessor(this);
        this.components.dataExtractor = new DataExtractor(this);

        // 初始化隐写分析器
        this.components.steganographyAnalyzer.init();
    }

    /**
     * 绑定事件
     */
    bindEvents(): void {
        // 标题栏事件
        this.bindTitleBarEvents();

        // 工具栏事件
        this.bindToolbarEvents();

        // 分析模式事件
        this.bindAnalysisModeEvents();

        // 位平面控制事件
        this.bindBitPlaneEvents();

        // 过滤器事件
        this.bindFilterEvents();

        // 数据提取事件
        this.bindExtractionEvents();

        // 图像控制事件
        this.bindImageControlEvents();

        // 数据控制事件
        this.bindDataControlEvents();

        // 数据格式标签页事件
        this.bindDataFormatEvents();

        // 提取方法标签页事件
        this.bindExtractionMethodEvents();

        // 拖拽事件
        this.bindDragDropEvents();

        // 粘贴事件 (新增)
        this.bindPasteEvents();

        // 键盘快捷键
        this.bindKeyboardEvents();
    }

    /**
     * 绑定粘贴事件
     */
    bindPasteEvents(): void {
        document.addEventListener('paste', (e: ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    e.preventDefault();
                    const blob = items[i].getAsFile();
                    if (blob) {
                        this.components.imageLoader?.loadImageFile(blob);
                        this.updateStatus('从剪贴板加载图像');
                    }
                    return;
                }
            }
        });
    }

    /**
     * 绑定标题栏事件
     */
    async bindTitleBarEvents(): Promise<void> {
        try {
            // 检查是否在Tauri环境中
            if (typeof (window as any).__TAURI__ === 'undefined') {
                console.log('非Tauri环境，使用模拟窗口控制');
                this.bindMockWindowControls();
                return;
            }

            // 使用Tauri V2 API
            const { getCurrentWebviewWindow } = (window as any).__TAURI__.webviewWindow;
            const appWindow = getCurrentWebviewWindow();

            // 最小化按钮
            const minimizeBtn = document.getElementById('minimizeBtn');
            if (minimizeBtn) {
                minimizeBtn.addEventListener('click', async () => {
                    try {
                        await appWindow.minimize();
                    } catch (error) {
                        console.error('最小化窗口失败:', error);
                    }
                });
            }

            // 最大化/还原按钮
            const maximizeBtn = document.getElementById('maximizeBtn');
            if (maximizeBtn) {
                maximizeBtn.addEventListener('click', async () => {
                    try {
                        const isMaximized = await appWindow.isMaximized();
                        if (isMaximized) {
                            await appWindow.unmaximize();
                        } else {
                            await appWindow.maximize();
                        }
                    } catch (error) {
                        console.error('切换窗口状态失败:', error);
                    }
                });
            }

            // 关闭按钮
            const closeBtn = document.getElementById('closeBtn');
            if (closeBtn) {
                closeBtn.addEventListener('click', async () => {
                    try {
                        await appWindow.close();
                    } catch (error) {
                        console.error('关闭窗口失败:', error);
                    }
                });
            }

        } catch (error) {
            console.warn('绑定标题栏事件失败:', error);
            this.bindMockWindowControls();
        }
    }

    /**
     * 绑定模拟窗口控制（用于非Tauri环境）
     */
    bindMockWindowControls(): void {
        const minimizeBtn = document.getElementById('minimizeBtn');
        const maximizeBtn = document.getElementById('maximizeBtn');
        const closeBtn = document.getElementById('closeBtn');

        if (minimizeBtn) {
            minimizeBtn.addEventListener('click', () => {
                console.log('模拟最小化窗口');
                this.updateStatus('模拟最小化窗口');
            });
        }

        if (maximizeBtn) {
            maximizeBtn.addEventListener('click', () => {
                console.log('模拟最大化/还原窗口');
                this.updateStatus('模拟最大化/还原窗口');
            });
        }

        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                console.log('模拟关闭窗口');
                if (confirm('确定要关闭窗口吗？')) {
                    window.close();
                }
            });
        }
    }

    /**
     * 绑定工具栏事件
     */
    bindToolbarEvents(): void {
        // 加载图像按钮
        const loadImageBtn = document.getElementById('loadImageBtn');
        if (loadImageBtn) {
            loadImageBtn.addEventListener('click', () => {
                this.components.imageLoader?.selectImage();
            });
        }

        // 保存图像按钮
        const saveImageBtn = document.getElementById('saveImageBtn');
        if (saveImageBtn) {
            saveImageBtn.addEventListener('click', () => {
                this.saveCurrentImage();
            });
        }

        // 导出数据按钮
        const exportDataBtn = document.getElementById('exportDataBtn');
        if (exportDataBtn) {
            exportDataBtn.addEventListener('click', () => {
                this.exportAnalysisData();
            });
        }

        // 重置按钮
        const resetBtn = document.getElementById('resetBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                this.resetView();
            });
        }

        // 全屏按钮
        const fullscreenBtn = document.getElementById('fullscreenBtn');
        if (fullscreenBtn) {
            fullscreenBtn.addEventListener('click', () => {
                this.toggleFullscreen();
            });
        }
    }

    /**
     * 绑定分析模式事件
     */
    bindAnalysisModeEvents(): void {
        const modeTabs = document.querySelectorAll<HTMLElement>('.mode-tab');
        modeTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const mode = tab.getAttribute('data-mode');
                if (mode) this.setAnalysisMode(mode);
            });
        });
    }

    /**
     * 绑定位平面事件
     */
    bindBitPlaneEvents(): void {
        // 模式切换开关
        const extractModeSwitch = document.getElementById('extractModeSwitch') as HTMLInputElement | null;
        if (extractModeSwitch) {
            extractModeSwitch.addEventListener('change', (e: Event) => {
                this.toggleBitPlaneMode((e.target as HTMLInputElement).checked);
            });
        }

        // 位平面复选框
        const bitCheckboxes = document.querySelectorAll<HTMLInputElement>('.bit-checkboxes input[type="checkbox"]');
        bitCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', (e: Event) => {
                const target = e.target as HTMLInputElement;
                const switchEl = document.getElementById('extractModeSwitch') as HTMLInputElement | null;
                const isExtractMode = switchEl?.checked ?? false;

                if (isExtractMode) {
                    // 提取模式：允许多选
                    this.updateBitPlaneSelection();
                } else {
                    // 查看模式：单选并立即显示
                    if (target.checked) {
                        // 取消其他复选框的选中状态
                        bitCheckboxes.forEach(cb => {
                            if (cb !== target) {
                                cb.checked = false;
                            }
                        });

                        // 显示选中的位平面
                        const channel = target.getAttribute('data-channel') as Channel;
                        const bit = parseInt(target.getAttribute('data-bit') || '0');
                        this.showBitPlane(channel, bit);
                    } else {
                        // 如果取消选中，回到原图
                        this.setAnalysisMode('original');
                    }
                }
            });
        });

        // 位平面全览按钮
        const bitPlaneOverviewBtn = document.getElementById('bitPlaneOverviewBtn');
        if (bitPlaneOverviewBtn) {
            bitPlaneOverviewBtn.addEventListener('click', () => {
                this.openBitPlaneOverview();
            });
        }

        // 清除选择按钮
        const clearBitPlaneBtn = document.getElementById('clearBitPlaneBtn');
        if (clearBitPlaneBtn) {
            clearBitPlaneBtn.addEventListener('click', () => {
                this.clearBitPlaneSelection();
            });
        }
    }

    /**
     * 绑定过滤器事件
     */
    bindFilterEvents(): void {
        const filterTabs = document.querySelectorAll<HTMLElement>('.filter-tab');
        filterTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const filter = tab.getAttribute('data-filter');
                if (!filter) return;

                if (filter === 'reset') {
                    // 重置到原图
                    this.setAnalysisMode('original');
                    // 清除所有过滤器的激活状态
                    filterTabs.forEach(t => t.classList.remove('active'));
                } else {
                    // 应用过滤器
                    this.applyFilter(filter);
                    // 更新标签页状态
                    filterTabs.forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                }
            });
        });
    }

    /**
     * 绑定数据提取事件
     */
    bindExtractionEvents(): void {
        const startExtractionBtn = document.getElementById('startExtractionBtn');
        if (startExtractionBtn) {
            startExtractionBtn.addEventListener('click', () => {
                this.startDataExtraction();
            });
        }
    }

    /**
     * 绑定图像控制事件
     */
    bindImageControlEvents(): void {
        // 缩放控制
        const zoomInBtn = document.getElementById('zoomInBtn');
        const zoomOutBtn = document.getElementById('zoomOutBtn');
        const fitToScreenBtn = document.getElementById('fitToScreenBtn');

        if (zoomInBtn) {
            zoomInBtn.addEventListener('click', () => this.zoomIn());
        }
        if (zoomOutBtn) {
            zoomOutBtn.addEventListener('click', () => this.zoomOut());
        }
        if (fitToScreenBtn) {
            fitToScreenBtn.addEventListener('click', () => this.fitToScreen());
        }

        // 导航控制
        const prevImageBtn = document.getElementById('prevImageBtn');
        const nextImageBtn = document.getElementById('nextImageBtn');

        if (prevImageBtn) {
            prevImageBtn.addEventListener('click', () => this.previousImage());
        }
        if (nextImageBtn) {
            nextImageBtn.addEventListener('click', () => this.nextImage());
        }
    }

    /**
     * 绑定数据控制事件
     */
    bindDataControlEvents(): void {
        const copyDataBtn = document.getElementById('copyDataBtn');
        const saveDataBtn = document.getElementById('saveDataBtn');
        const clearDataBtn = document.getElementById('clearDataBtn');

        if (copyDataBtn) {
            copyDataBtn.addEventListener('click', () => this.copyExtractedData());
        }
        if (saveDataBtn) {
            saveDataBtn.addEventListener('click', () => this.saveExtractedData());
        }
        if (clearDataBtn) {
            clearDataBtn.addEventListener('click', () => this.clearExtractedData());
        }
    }

    /**
     * 绑定数据格式事件
     */
    bindDataFormatEvents(): void {
        const formatTabs = document.querySelectorAll<HTMLElement>('.format-tab');
        formatTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const format = tab.getAttribute('data-format') as DataFormat | null;
                if (format) this.switchDataFormat(format);
            });
        });
    }

    /**
     * 绑定提取方法事件
     */
    bindExtractionMethodEvents(): void {
        const methodTabs = document.querySelectorAll<HTMLElement>('.method-tab');
        methodTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const method = tab.getAttribute('data-method') as ExtractionMethod | null;
                if (method) this.switchExtractionMethod(method);
            });
        });
    }

    /**
     * 绑定拖拽事件
     */
    bindDragDropEvents(): void {
        const dropZone = document.getElementById('dropZone');
        if (!dropZone) return;

        dropZone.addEventListener('dragover', (e: DragEvent) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });

        dropZone.addEventListener('dragleave', (e: DragEvent) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
        });

        dropZone.addEventListener('drop', (e: DragEvent) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');

            const files = e.dataTransfer?.files;
            if (files && files.length > 0) {
                this.components.imageLoader?.loadImageFile(files[0]);
            }
        });
    }

    /**
     * 绑定键盘事件
     */
    bindKeyboardEvents(): void {
        document.addEventListener('keydown', (e: KeyboardEvent) => {
            // Ctrl+O: 打开文件
            if (e.ctrlKey && e.key === 'o') {
                e.preventDefault();
                this.components.imageLoader?.selectImage();
            }

            // Ctrl+S: 保存图像
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                this.saveCurrentImage();
            }

            // Ctrl+E: 导出数据
            if (e.ctrlKey && e.key === 'e') {
                e.preventDefault();
                this.exportAnalysisData();
            }

            // R: 重置视图
            if (e.key === 'r' || e.key === 'R') {
                this.resetView();
            }

            // F11: 全屏
            if (e.key === 'F11') {
                e.preventDefault();
                this.toggleFullscreen();
            }

            // 数字键1-8: 切换位平面
            if (e.key >= '0' && e.key <= '7') {
                const bit = parseInt(e.key);
                this.setBitPlane(bit);
            }
        });
    }

    /**
     * 初始化UI状态
     */
    initUIState(): void {
        // 设置默认分析模式
        this.setAnalysisMode('original');

        // 初始化模式标签状态
        const modeLabels = document.querySelectorAll<HTMLElement>('.mode-label');
        if (modeLabels.length >= 2) {
            modeLabels[0].classList.add('active');    // 查看模式默认激活
            modeLabels[1].classList.remove('active'); // 提取模式默认不激活
        }

        // 初始化默认提取方法
        this.data.currentExtractionMethod = 'lsb';

        // 更新按钮状态
        this.updateButtonStates();

        // 清空结果显示
        this.clearResults();
    }

    /**
     * 设置分析模式
     */
    setAnalysisMode(mode: string): void {
        if (!this.data.originalImage) return;

        this.data.currentMode = mode;

        // 更新标签页状态
        document.querySelectorAll<HTMLElement>('.mode-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`[data-mode="${mode}"]`)?.classList.add('active');

        // 应用分析模式
        this.applyAnalysisMode();
    }

    /**
     * 应用分析模式
     */
    async applyAnalysisMode(): Promise<void> {
        if (!this.data.originalImage || !this.data.imageData) return;

        this.showLoading('应用分析模式...');

        try {
            let processedImageData: ImageData;

            switch (this.data.currentMode) {
                case 'original':
                    // 确保显示原始彩色图像
                    processedImageData = new ImageData(
                        new Uint8ClampedArray(this.data.imageData.data),
                        this.data.imageData.width,
                        this.data.imageData.height
                    );
                    break;
                case 'red':
                case 'green':
                case 'blue':
                case 'alpha':
                    processedImageData = this.components.channelAnalyzer!.extractChannel(
                        this.data.imageData, this.data.currentMode as Channel
                    );
                    break;
                case 'grayscale':
                    processedImageData = this.components.channelAnalyzer!.convertToGrayscale(
                        this.data.imageData
                    );
                    break;
                default:
                    processedImageData = new ImageData(
                        new Uint8ClampedArray(this.data.imageData.data),
                        this.data.imageData.width,
                        this.data.imageData.height
                    );
            }

            // 更新Canvas显示
            this.updateCanvasDisplay(processedImageData);

            // 更新统计信息
            this.updateStatistics(processedImageData);

            // 更新隐写分析器数据
            if (this.components.steganographyAnalyzer && this.data.currentMode === 'original') {
                this.components.steganographyAnalyzer.setImageData(this.data.imageData);
            }

            this.updateStatus(`已应用${this.analysisModes[this.data.currentMode]}模式`);

        } catch (error) {
            console.error('应用分析模式失败:', error);
            this.showError('应用分析模式失败: ' + (error instanceof Error ? error.message : String(error)));
        } finally {
            this.hideLoading();
        }
    }

    /**
     * 更新Canvas显示
     */
    updateCanvasDisplay(imageData: ImageData): void {
        if (!imageData || !this.canvas || !this.ctx) return;

        // 设置Canvas尺寸
        this.canvas.width = imageData.width;
        this.canvas.height = imageData.height;

        // 绘制图像数据
        this.ctx.putImageData(imageData, 0, 0);

        // 应用缩放
        this.applyZoom();

        // 显示Canvas，隐藏拖拽区域
        this.canvas.style.display = 'block';
        const dropZone = document.getElementById('dropZone');
        if (dropZone) dropZone.style.display = 'none';
        const imageControls = document.getElementById('imageControls');
        if (imageControls) imageControls.style.display = 'flex';

        // 更新按钮状态
        this.updateButtonStates();
    }

    /**
     * 更新按钮状态
     */
    updateButtonStates(): void {
        const hasImage = !!this.data.originalImage;

        const saveImageBtn = document.getElementById('saveImageBtn') as HTMLButtonElement | null;
        if (saveImageBtn) saveImageBtn.disabled = !hasImage;
        const exportDataBtn = document.getElementById('exportDataBtn') as HTMLButtonElement | null;
        if (exportDataBtn) exportDataBtn.disabled = !hasImage;
    }

    /**
     * 更新状态显示
     */
    updateStatus(message: string): void {
        const statusText = document.getElementById('statusText');
        if (statusText) {
            statusText.textContent = message;
        }
    }

    /**
     * 显示加载状态
     */
    showLoading(message: string = '处理中...'): void {
        const loadingOverlay = document.getElementById('loadingOverlay');
        const loadingText = loadingOverlay?.querySelector<HTMLElement>('.loading-text');

        if (loadingOverlay) {
            loadingOverlay.style.display = 'flex';
        }
        if (loadingText) {
            loadingText.textContent = message;
        }
    }

    /**
     * 隐藏加载状态
     */
    hideLoading(): void {
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) {
            loadingOverlay.style.display = 'none';
        }
    }

    /**
     * 显示错误信息
     */
    showError(message: string): void {
        console.error('错误:', message);
        alert('错误: ' + message);
    }

    /**
     * 清空结果显示
     */
    clearResults(): void {
        const resultContent = document.getElementById('resultContent');
        if (resultContent) {
            resultContent.innerHTML = '<div class="result-placeholder">加载图像后显示分析结果</div>';
        }

        const dataTextarea = document.getElementById('dataTextarea') as HTMLTextAreaElement | null;
        if (dataTextarea) {
            dataTextarea.value = '';
        }

        // 清空统计信息
        const statElements = ['totalPixels', 'uniqueColors', 'avgBrightness', 'entropy'];
        statElements.forEach(id => {
            const element = document.getElementById(id);
            if (element) element.textContent = '-';
        });

        // 清空图像信息
        const infoElements = ['imageDimensions', 'imageFormat', 'imageSize', 'colorDepth'];
        infoElements.forEach(id => {
            const element = document.getElementById(id);
            if (element) element.textContent = '-';
        });
    }

    /**
     * 设置位平面
     */
    setBitPlane(bit: number): void {
        if (!this.data.originalImage) return;

        this.data.currentBit = bit;

        // 更新按钮状态
        document.querySelectorAll<HTMLElement>('.bit-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-bit="${bit}"]`)?.classList.add('active');

        // 应用位平面分析
        this.updateBitPlaneAnalysis();
    }

    /**
     * 更新位平面分析
     */
    async updateBitPlaneAnalysis(): Promise<void> {
        if (!this.data.originalImage || !this.data.imageData) return;

        this.showLoading('分析位平面...');

        try {
            const bitPlaneImageData = this.components.bitPlaneAnalyzer!.extractBitPlane(
                this.data.imageData,
                this.data.currentChannel,
                this.data.currentBit
            );

            this.updateCanvasDisplay(bitPlaneImageData);
            this.updateStatus(`已显示${this.data.currentChannel}通道第${this.data.currentBit}位平面`);

        } catch (error) {
            console.error('位平面分析失败:', error);
            this.showError('位平面分析失败: ' + (error instanceof Error ? error.message : String(error)));
        } finally {
            this.hideLoading();
        }
    }

    /**
     * 应用过滤器
     */
    async applyFilter(filter: string): Promise<void> {
        if (!this.data.originalImage || !this.data.imageData) return;

        this.showLoading('应用过滤器...');

        try {
            const filteredImageData = this.components.filterProcessor!.applyFilter(
                this.data.imageData,
                filter
            );

            this.updateCanvasDisplay(filteredImageData);
            this.updateStatus(`已应用${filter}过滤器`);

        } catch (error) {
            console.error('应用过滤器失败:', error);
            this.showError('应用过滤器失败: ' + (error instanceof Error ? error.message : String(error)));
        } finally {
            this.hideLoading();
        }
    }

    /**
     * 切换提取方法
     */
    switchExtractionMethod(method: ExtractionMethod): void {
        // 更新标签页状态
        document.querySelectorAll<HTMLElement>('.method-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`[data-method="${method}"]`)?.classList.add('active');

        this.data.currentExtractionMethod = method;
        this.updateStatus(`已切换到${this.getMethodName(method)}提取模式`);
    }

    /**
     * 获取方法名称
     */
    getMethodName(method: string): string {
        const names: Record<string, string> = {
            'lsb': 'LSB (低位优先)',
            'msb': 'MSB (高位优先)',
            'sequential': '顺序',
            'reverse': '逆序'
        };
        return names[method] || method;
    }

    /**
     * 开始数据提取
     */
    async startDataExtraction(): Promise<void> {
        if (!this.data.originalImage || !this.data.imageData) {
            this.updateStatus('请先加载图像');
            return;
        }

        this.showLoading('提取数据...');

        try {
            const extractFromSelected = (document.getElementById('extractFromSelected') as HTMLInputElement | null)?.checked ?? false;
            const extractHex = (document.getElementById('extractHex') as HTMLInputElement | null)?.checked ?? false;
            const method = this.data.currentExtractionMethod || 'lsb';

            let bits: number[] = [];
            let description = '';

            if (extractFromSelected) {
                // 从选中的位平面提取
                const selectedBits = this.getSelectedBitPlanes();
                if (selectedBits.length === 0) {
                    this.updateStatus('请先选择要提取的位平面，或取消"从选中位平面提取"选项');
                    return;
                }

                bits = this.extractFromSelectedBitPlanes(selectedBits, method);
                description = `从${selectedBits.length}个选中位平面`;
            } else {
                // 从默认通道提取
                bits = this.extractFromDefaultChannel(method);
                description = '从红色通道';
            }

            // 转换为字节和文本
            const bytes = this.convertBitsToBytes(bits, method);
            const text = this.convertBytesToText(bytes);

            this.data.extractedData = {
                text: text,
                bytes: bytes,
                bits: bits
            };

            // 显示数据
            const format: DataFormat = extractHex ? 'hex' : 'text';
            this.displayExtractedData(format);
            this.switchDataFormat(format);

            this.updateStatus(`${this.getMethodName(method)}数据提取完成，${description}提取了 ${bytes.length} 字节数据`);

        } catch (error) {
            console.error('数据提取失败:', error);
            this.updateStatus('数据提取失败: ' + (error instanceof Error ? error.message : String(error)));
        } finally {
            this.hideLoading();
        }
    }

    /**
     * 从选中的位平面提取数据
     */
    extractFromSelectedBitPlanes(selectedBits: SelectedBitPlane[], _method: ExtractionMethod): number[] {
        const data = this.data.imageData!.data;
        const totalPixels = this.data.imageData!.width * this.data.imageData!.height;
        const allBits: number[] = [];

        // 按像素顺序提取，每个像素提取所有选中的位平面
        for (let pixelIndex = 0; pixelIndex < totalPixels; pixelIndex++) {
            for (const selection of selectedBits) {
                const channelOffset = this.getChannelOffset(selection.channel);
                const bitPosition = selection.bit;
                const bitMask = 1 << bitPosition;
                const dataIndex = pixelIndex * 4 + channelOffset;

                if (dataIndex < data.length) {
                    const bit = (data[dataIndex] & bitMask) ? 1 : 0;
                    allBits.push(bit);
                }
            }
        }

        return allBits;
    }

    /**
     * 从默认通道提取数据
     */
    extractFromDefaultChannel(_method: ExtractionMethod): number[] {
        const data = this.data.imageData!.data;
        const bits: number[] = [];

        // 默认总是提取最低有效位 (LSB, Bit 0)
        // method参数只控制后续的字节重组顺序(Bit Order)
        const bitPosition = 0;

        const bitMask = 1 << bitPosition;

        for (let i = 0; i < data.length; i += 4) {
            const bit = (data[i] & bitMask) ? 1 : 0;
            bits.push(bit);
        }

        return bits;
    }

    /**
     * 获取通道偏移量
     */
    getChannelOffset(channel: Channel): number {
        switch (channel) {
            case 'red': return 0;
            case 'green': return 1;
            case 'blue': return 2;
            case 'alpha': return 3;
            default: return 0;
        }
    }

    /**
     * 转换位为字节
     */
    convertBitsToBytes(bits: number[], method: ExtractionMethod): number[] {
        const bytes: number[] = [];

        let workingBits = bits;
        if (method === 'reverse') {
            // 逆序处理
            workingBits = bits.slice().reverse();
        }

        for (let i = 0; i < workingBits.length; i += 8) {
            let byte = 0;
            for (let j = 0; j < 8 && i + j < workingBits.length; j++) {
                // MSB 和 Sequential 模式通常期望高位优先 (Big Endian)
                // 这是阅读文本和文件头的标准方式
                if (method === 'msb' || method === 'sequential') {
                    // MSB: 高位优先 (bit 0 -> 2^7)
                    byte |= (workingBits[i + j] << (7 - j));
                } else {
                    // LSB: 低位优先 (bit 0 -> 2^0)
                    byte |= (workingBits[i + j] << j);
                }
            }
            bytes.push(byte);
        }

        return bytes;
    }

    /**
     * 转换字节为文本
     */
    convertBytesToText(bytes: number[]): string {
        try {
            // 直接转换所有字节为字符，不过滤
            return bytes.map(b => String.fromCharCode(b)).join('');
        } catch (e) {
            return '数据解析失败';
        }
    }

    /**
     * 从指定通道和位提取位数据
     */
    extractBitsFromChannel(channel: Channel, bitPosition: number): number[] {
        const data = this.data.imageData!.data;
        const channelOffset = this.getChannelOffset(channel);

        const bitMask = 1 << bitPosition;
        const extractedBits: number[] = [];

        for (let i = channelOffset; i < data.length; i += 4) {
            const bit = (data[i] & bitMask) ? 1 : 0;
            extractedBits.push(bit);
        }

        return extractedBits;
    }

    /**
     * 位数组转字节数组
     */
    bitsToBytes(bits: number[]): number[] {
        const bytes: number[] = [];
        for (let i = 0; i < bits.length; i += 8) {
            let byte = 0;
            for (let j = 0; j < 8 && i + j < bits.length; j++) {
                byte |= (bits[i + j] << j);
            }
            bytes.push(byte);
        }
        return bytes;
    }

    /**
     * 字节数组转文本
     */
    bytesToText(bytes: number[]): string {
        let endIndex = bytes.length;
        try {
            // 移除尾部零字节
            while (endIndex > 0 && bytes[endIndex - 1] === 0) {
                endIndex--;
            }

            const cleanBytes = bytes.slice(0, endIndex);
            const uint8Array = new Uint8Array(cleanBytes);
            return new TextDecoder('utf-8').decode(uint8Array);
        } catch (error) {
            // 如果UTF-8解码失败，使用ASCII
            const cleanBytes = bytes.slice(0, endIndex);
            return cleanBytes.map(byte => String.fromCharCode(byte)).join('');
        }
    }

    /**
     * 缩放控制
     */
    zoomIn(): void {
        this.data.zoomLevel = Math.min(5.0, this.data.zoomLevel * 1.2);
        this.applyZoom();
    }

    zoomOut(): void {
        this.data.zoomLevel = Math.max(0.1, this.data.zoomLevel / 1.2);
        this.applyZoom();
    }

    fitToScreen(): void {
        if (!this.canvas) return;

        const container = document.getElementById('imageContainer');
        if (!container) return;
        const containerRect = container.getBoundingClientRect();

        const scaleX = containerRect.width / this.canvas.width;
        const scaleY = containerRect.height / this.canvas.height;

        this.data.zoomLevel = Math.min(scaleX, scaleY) * 0.9;
        this.applyZoom();
    }

    applyZoom(): void {
        if (!this.canvas) return;

        this.canvas.style.transform = `scale(${this.data.zoomLevel})`;

        const zoomLevel = document.getElementById('zoomLevel');
        if (zoomLevel) {
            zoomLevel.textContent = `${Math.round(this.data.zoomLevel * 100)}%`;
        }
    }

    /**
     * 重置视图
     */
    resetView(): void {
        this.data.zoomLevel = 1.0;
        this.data.currentMode = 'original';
        this.data.currentBit = 0;

        if (this.data.originalImage) {
            this.setAnalysisMode('original');
        }

        this.applyZoom();
        this.updateStatus('视图已重置');
    }

    /**
     * 数据操作
     */
    async copyExtractedData(): Promise<void> {
        const dataTextarea = document.getElementById('dataTextarea') as HTMLTextAreaElement | null;
        if (dataTextarea && dataTextarea.value) {
            try {
                await navigator.clipboard.writeText(dataTextarea.value);
                this.updateStatus('数据已复制到剪贴板');
            } catch (error) {
                console.error('复制失败:', error);
                this.showError('复制失败: ' + (error instanceof Error ? error.message : String(error)));
            }
        }
    }

    clearExtractedData(): void {
        const dataTextarea = document.getElementById('dataTextarea') as HTMLTextAreaElement | null;
        if (dataTextarea) {
            dataTextarea.value = '';
        }
        this.data.extractedData = null;
        this.updateStatus('已清除提取的数据');
    }

    /**
     * 更新统计信息
     */
    updateStatistics(imageData: ImageData): void {
        if (!imageData) return;

        try {
            const stats: ImageStatisticsBasic = this.components.imageLoader!.getImageStatistics(imageData);

            // 更新tooltip中的统计信息
            const elements: Record<string, string> = {
                'tooltipTotalPixels': stats.totalPixels.toLocaleString(),
                'tooltipUniqueColors': stats.uniqueColors.toLocaleString(),
                'tooltipAvgBrightness': String(stats.averageBrightness),
                'tooltipEntropy': this.calculateImageEntropy(imageData).toFixed(2)
            };

            for (const [id, value] of Object.entries(elements)) {
                const element = document.getElementById(id);
                if (element) element.textContent = value;
            }

        } catch (error) {
            console.error('更新统计信息失败:', error);
        }
    }

    /**
     * 计算图像熵
     */
    calculateImageEntropy(imageData: ImageData): number {
        const data = imageData.data;
        const histogram = new Array<number>(256).fill(0);
        let totalPixels = 0;

        // 计算灰度直方图
        for (let i = 0; i < data.length; i += 4) {
            const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
            histogram[gray]++;
            totalPixels++;
        }

        // 计算熵
        let entropy = 0;
        for (const count of histogram) {
            if (count > 0) {
                const probability = count / totalPixels;
                entropy -= probability * Math.log2(probability);
            }
        }

        return entropy;
    }

    /**
     * 切换位平面模式
     */
    toggleBitPlaneMode(isExtractMode: boolean): void {
        const modeLabels = document.querySelectorAll<HTMLElement>('.mode-label');
        if (modeLabels.length < 2) return;

        if (isExtractMode) {
            // 提取模式
            modeLabels[0].classList.remove('active'); // 查看
            modeLabels[1].classList.add('active');    // 提取
            this.updateStatus('已切换到提取模式，可以多选位平面进行数据提取');
        } else {
            // 查看模式
            modeLabels[0].classList.add('active');    // 查看
            modeLabels[1].classList.remove('active'); // 提取
            this.updateStatus('已切换到查看模式，选择位平面将直接显示');

            // 清除多选状态
            const checkboxes = document.querySelectorAll<HTMLInputElement>('.bit-checkboxes input[type="checkbox"]');
            checkboxes.forEach(cb => cb.checked = false);
            this.setAnalysisMode('original');
        }
    }

    /**
     * 显示指定的位平面
     */
    async showBitPlane(channel: Channel, bit: number): Promise<void> {
        if (!this.data.originalImage || !this.data.imageData) return;

        this.showLoading(`显示${channel}通道第${bit}位平面...`);

        try {
            const bitPlaneImageData = this.components.bitPlaneAnalyzer!.extractBitPlane(
                this.data.imageData,
                channel,
                bit
            );

            this.updateCanvasDisplay(bitPlaneImageData);
            this.updateStatus(`已显示${channel}通道第${bit}位平面`);

        } catch (error) {
            console.error('显示位平面失败:', error);
            this.showError('显示位平面失败: ' + (error instanceof Error ? error.message : String(error)));
        } finally {
            this.hideLoading();
        }
    }

    /**
     * 更新位平面选择
     */
    updateBitPlaneSelection(): void {
        const selectedBits = this.getSelectedBitPlanes();
        this.updateStatus(`已选择 ${selectedBits.length} 个位平面`);
    }

    /**
     * 获取选中的位平面
     */
    getSelectedBitPlanes(): SelectedBitPlane[] {
        const checkboxes = document.querySelectorAll<HTMLInputElement>('.bit-checkboxes input[type="checkbox"]:checked');
        return Array.from(checkboxes).map(cb => ({
            channel: cb.getAttribute('data-channel') as Channel,
            bit: parseInt(cb.getAttribute('data-bit') || '0')
        }));
    }

    /**
     * 打开位平面全览窗口
     */
    async openBitPlaneOverview(): Promise<void> {
        if (!this.data.originalImage || !this.data.imageData) {
            this.updateStatus('请先加载图像');
            return;
        }

        try {
            // 检查是否在Tauri环境中
            if (typeof (window as any).__TAURI__ === 'undefined') {
                // 非Tauri环境，使用简化的数据传递
                const imageDataForOverview = {
                    width: this.data.imageData.width,
                    height: this.data.imageData.height,
                    filename: this.data.filename || '未知文件'
                };

                // 只存储基本信息，图像数据通过其他方式传递
                localStorage.setItem('stegsolve_image_info', JSON.stringify(imageDataForOverview));

                const overviewWindow = window.open(
                    'bit-plane-overview.html',
                    'bitPlaneOverview',
                    'width=1400,height=900,scrollbars=yes,resizable=yes'
                );

                if (overviewWindow) {
                    this.updateStatus('位平面全览窗口已打开');
                } else {
                    this.updateStatus('无法打开位平面全览窗口，请检查弹窗拦截设置');
                }
                return;
            }

            // 使用Tauri创建新窗口
            const { invoke } = (window as any).__TAURI__.core;
            await invoke('open_bit_plane_overview_window');

            // 等待窗口创建完成后发送图像数据
            setTimeout(async () => {
                try {
                    const { emit } = (window as any).__TAURI__.event;
                    const imageData = this.data.imageData;
                    if (!imageData) return;

                    // 分块发送图像数据以避免内存问题
                    const chunkSize = 100000; // 每块100KB
                    const totalChunks = Math.ceil(imageData.data.length / chunkSize);

                    // 发送图像信息
                    await emit('bit-plane-image-info', {
                        width: imageData.width,
                        height: imageData.height,
                        filename: this.data.filename || '未知文件',
                        totalChunks: totalChunks
                    });

                    // 分块发送图像数据
                    for (let i = 0; i < totalChunks; i++) {
                        const start = i * chunkSize;
                        const end = Math.min(start + chunkSize, imageData.data.length);
                        const chunk = Array.from(imageData.data.slice(start, end));

                        await emit('bit-plane-image-chunk', {
                            chunkIndex: i,
                            totalChunks: totalChunks,
                            data: chunk
                        });

                        // 短暂延迟避免阻塞
                        await new Promise<void>(resolve => setTimeout(resolve, 10));
                    }

                    // 发送完成信号
                    await emit('bit-plane-image-complete', {});

                } catch (error) {
                    console.error('发送图像数据失败:', error);
                }
            }, 1000);

            this.updateStatus('位平面全览窗口已打开');

        } catch (error) {
            console.error('打开位平面全览窗口失败:', error);
            this.showError('打开位平面全览窗口失败: ' + (error instanceof Error ? error.message : String(error)));
        }
    }

    /**
     * 清除位平面选择
     */
    clearBitPlaneSelection(): void {
        const checkboxes = document.querySelectorAll<HTMLInputElement>('.bit-checkboxes input[type="checkbox"]');
        checkboxes.forEach(cb => cb.checked = false);

        // 回到原图显示
        this.setAnalysisMode('original');
        this.updateStatus('已清除位平面选择，回到原图显示');
    }

    /**
     * 切换数据格式显示
     */
    switchDataFormat(format: DataFormat): void {
        // 更新标签页状态
        document.querySelectorAll<HTMLElement>('.format-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`[data-format="${format}"]`)?.classList.add('active');

        // 显示对应格式的数据
        this.displayExtractedData(format);
    }

    /**
     * 显示提取的数据
     */
    displayExtractedData(format: DataFormat): void {
        const dataTextarea = document.getElementById('dataTextarea') as HTMLTextAreaElement | null;
        if (!dataTextarea || !this.data.extractedData || typeof this.data.extractedData === 'string') return;

        const extracted = this.data.extractedData;
        let displayText = '';

        switch (format) {
            case 'text':
                displayText = extracted.text || '未检测到可读文本';
                break;
            case 'hex':
                if (extracted.bytes) {
                    displayText = extracted.bytes
                        .map(b => b.toString(16).padStart(2, '0'))
                        .join(' ');
                }
                break;
            case 'binary':
                if (extracted.bits) {
                    displayText = extracted.bits.join('');
                }
                break;
        }

        dataTextarea.value = displayText;
    }

    /**
     * 保存提取的数据
     */
    async saveExtractedData(): Promise<void> {
        if (!this.data.extractedData || typeof this.data.extractedData === 'string') {
            this.updateStatus('没有可保存的数据，请先进行数据提取');
            return;
        }

        try {
            // 检查是否在Tauri环境中
            if (typeof (window as any).__TAURI__ === 'undefined') {
                // 非Tauri环境，使用浏览器下载
                this.downloadDataInBrowser();
                return;
            }

            // 使用Tauri的文件对话框
            const { save } = (window as any).__TAURI__.dialog;

            const filePath = await save({
                title: translate('保存提取的数据'),
                defaultPath: `extracted_data_${Date.now()}.txt`,
                filters: [{
                    name: translate('文本文件'),
                    extensions: ['txt']
                }, {
                    name: translate('二进制文件'),
                    extensions: ['bin']
                }, {
                    name: translate('Hex文件'),
                    extensions: ['hex']
                }]
            });

            if (filePath) {
                // 根据文件扩展名决定保存格式
                const extension = (filePath.split('.').pop() || '').toLowerCase();
                await this.saveDataToFile(filePath, extension);
            }

        } catch (error) {
            console.error('保存数据失败:', error);
            this.showError('保存数据失败: ' + (error instanceof Error ? error.message : String(error)));
        }
    }

    /**
     * 保存数据到文件
     */
    async saveDataToFile(filePath: string, format: string): Promise<void> {
        try {
            const { invoke } = (window as any).__TAURI__.core;
            const extracted = this.data.extractedData;
            if (!extracted || typeof extracted === 'string') return;
            let content = '';

            switch (format) {
                case 'txt':
                    // 保存纯文本内容（不是报告）
                    content = extracted.text || '';
                    break;
                case 'bin':
                    // 保存纯二进制数据
                    await invoke('save_binary_data', {
                        file_path: filePath,
                        data: Array.from(extracted.bytes)
                    });
                    this.updateStatus(`二进制数据已保存到: ${filePath}`);
                    return;
                case 'hex':
                    // 保存纯Hex格式（无空格）
                    content = extracted.bytes
                        .map(b => b.toString(16).padStart(2, '0'))
                        .join('');
                    break;
                default:
                    content = extracted.text || '';
            }

            // 保存文本内容
            await invoke('save_text_file', { path: filePath, content: content });
            this.updateStatus(`数据已保存到: ${filePath}`);

        } catch (error) {
            throw new Error('文件保存失败: ' + (error instanceof Error ? error.message : String(error)));
        }
    }

    /**
     * 生成完整的文本报告
     */
    generateTextReport(): string {
        const data = this.data.extractedData;
        if (!data || typeof data === 'string') return '';
        const timestamp = new Date().toLocaleString();

        let report = `Stegsolve 数据提取报告\n`;
        report += `生成时间: ${timestamp}\n`;
        report += `图像文件: ${this.data.filename}\n`;
        report += `提取方法: ${this.getMethodName(this.data.currentExtractionMethod || 'lsb')}\n`;
        report += `\n${'='.repeat(50)}\n\n`;

        // 基本统计信息
        report += `数据统计:\n`;
        report += `- 总位数: ${data.bits ? data.bits.length : 0}\n`;
        report += `- 总字节数: ${data.bytes ? data.bytes.length : 0}\n`;
        report += `- 文本长度: ${data.text ? data.text.length : 0} 字符\n`;
        report += `\n`;

        // 提取的文本内容
        if (data.text) {
            report += `提取的文本内容:\n`;
            report += `${'-'.repeat(30)}\n`;
            report += `${data.text}\n`;
            report += `${'-'.repeat(30)}\n\n`;
        }

        // 完整Hex数据
        if (data.bytes && data.bytes.length > 0) {
            report += `完整Hex数据:\n`;
            report += `${'-'.repeat(30)}\n`;
            const hexData = data.bytes
                .map(b => b.toString(16).padStart(2, '0'))
                .join(' ');
            report += `${hexData}\n`;
            report += `${'-'.repeat(30)}\n\n`;
        }

        // 完整二进制数据
        if (data.bits && data.bits.length > 0) {
            report += `完整二进制数据:\n`;
            report += `${'-'.repeat(30)}\n`;
            const binaryData = data.bits.join('');
            // 每8位分组
            const groupedBinary = binaryData.match(/.{1,8}/g)?.join(' ') || binaryData;
            report += `${groupedBinary}\n`;
            report += `${'-'.repeat(30)}\n\n`;
        }

        return report;
    }

    /**
     * 在浏览器中下载数据
     */
    downloadDataInBrowser(): void {
        const content = this.generateTextReport();
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `extracted_data_${Date.now()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.updateStatus('数据已下载');
    }

    // 占位方法
    previousImage(): void { this.updateStatus('上一张图像功能开发中'); }
    nextImage(): void { this.updateStatus('下一张图像功能开发中'); }
    saveCurrentImage(): void { this.updateStatus('保存图像功能开发中'); }
    exportAnalysisData(): void { this.updateStatus('导出分析数据功能开发中'); }
    toggleFullscreen(): void { this.updateStatus('全屏功能开发中'); }
}

// 应用启动
document.addEventListener('DOMContentLoaded', async () => {
    try {
        globalStegsolveAnalyzer = new StegsolveAnalyzer();

        // 将实例暴露到全局作用域以便调试
        (window as any).stegsolveAnalyzer = globalStegsolveAnalyzer;

    } catch (error) {
        console.error('❌ 启动Stegsolve隐写分析工具失败:', error);
        alert('启动失败: ' + (error instanceof Error ? error.message : String(error)));
    }
});

// 导出类以供其他模块使用
export { StegsolveAnalyzer };
