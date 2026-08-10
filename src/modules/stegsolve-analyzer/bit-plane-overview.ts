/**
 * 位平面全览窗口
 * 显示所有32个位平面的缩略图
 */

import type { Channel } from './types';

/** 图像信息事件负载 */
interface BitPlaneImageInfo {
    width: number;
    height: number;
    filename: string;
    totalChunks: number;
}

/** 图像数据块事件负载 */
interface BitPlaneImageChunk {
    chunkIndex: number;
    totalChunks: number;
    data: number[];
}

/** 非 Tauri 降级时存储的图像信息 */
interface FallbackImageInfo {
    width: number;
    height: number;
    filename: string;
}

/** Tauri 事件对象（最小化定义） */
interface TauriEvent<T> {
    payload: T;
}

/** 变换类型 */
type TransformType = 'none' | 'invert' | 'xor' | 'add' | 'sub' | 'mul' | 'and' | 'or';

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

class BitPlaneOverview {
    private imageData: ImageData | null = null;
    private originalImageData: ImageData | null = null;
    private imageInfo: BitPlaneImageInfo | null = null;
    private imageDataChunks: Array<number[] | undefined> = [];
    private lastImageInfoStr: string | null = null;

    constructor() {
        this.init();
    }

    /**
     * 初始化
     */
    async init(): Promise<void> {
        try {
            // 绑定标题栏事件
            await this.bindTitleBarEvents();

            // 绑定工具栏事件
            this.bindToolbarEvents();

            // 绑定位平面点击事件
            this.bindBitPlaneEvents();

            // 监听来自主窗口的消息
            this.listenForImageData();

            console.log('位平面全览窗口初始化完成');

        } catch (error) {
            console.error('初始化失败:', error);
        }
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
     * 绑定模拟窗口控制
     */
    bindMockWindowControls(): void {
        const minimizeBtn = document.getElementById('minimizeBtn');
        const maximizeBtn = document.getElementById('maximizeBtn');
        const closeBtn = document.getElementById('closeBtn');

        if (minimizeBtn) {
            minimizeBtn.addEventListener('click', () => {
                console.log('模拟最小化窗口');
            });
        }

        if (maximizeBtn) {
            maximizeBtn.addEventListener('click', () => {
                console.log('模拟最大化/还原窗口');
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
        const saveAllBtn = document.getElementById('saveAllBtn');
        const refreshBtn = document.getElementById('refreshBtn');
        const applyTransformBtn = document.getElementById('applyTransformBtn');

        if (saveAllBtn) {
            saveAllBtn.addEventListener('click', () => {
                this.saveAllBitPlanes();
            });
        }

        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.refreshBitPlanes();
            });
        }

        if (applyTransformBtn) {
            applyTransformBtn.addEventListener('click', () => {
                this.applyTransform();
            });
        }
    }

    /**
     * 绑定位平面点击事件
     */
    bindBitPlaneEvents(): void {
        const bitPlaneItems = document.querySelectorAll<HTMLElement>('.bit-plane-item');
        bitPlaneItems.forEach(item => {
            item.addEventListener('click', () => {
                const channel = item.getAttribute('data-channel') as Channel;
                const bit = parseInt(item.getAttribute('data-bit') || '0');
                this.onBitPlaneClick(channel, bit);
            });
        });
    }

    /**
     * 监听来自主窗口的图像数据
     */
    listenForImageData(): void {
        // 检查是否在Tauri环境中
        if (typeof (window as any).__TAURI__ === 'undefined') {
            // 非Tauri环境，使用localStorage检查
            this.listenForImageDataFallback();
            return;
        }

        // 使用Tauri事件系统
        this.setupTauriEventListeners();
    }

    /**
     * 设置Tauri事件监听器
     */
    async setupTauriEventListeners(): Promise<void> {
        try {
            const { listen } = (window as any).__TAURI__.event;

            // 监听图像信息
            await listen('bit-plane-image-info', (event: TauriEvent<BitPlaneImageInfo>) => {
                console.log('收到图像信息:', event.payload);
                this.imageInfo = event.payload;
                this.imageDataChunks = new Array<number[] | undefined>(event.payload.totalChunks);
                this.updateImageInfo(event.payload.width, event.payload.height, event.payload.filename);
                this.showLoading(true, '正在接收图像数据...');
            });

            // 监听图像数据块
            await listen('bit-plane-image-chunk', (event: TauriEvent<BitPlaneImageChunk>) => {
                const { chunkIndex, data } = event.payload;
                this.imageDataChunks[chunkIndex] = data;

                const totalChunks = this.imageInfo?.totalChunks ?? 1;
                const progress = Math.round(((chunkIndex + 1) / totalChunks) * 100);
                this.updateLoadingProgress(`正在接收图像数据... ${progress}%`);
            });

            // 监听传输完成
            await listen('bit-plane-image-complete', async () => {
                console.log('图像数据接收完成');
                await this.assembleImageData();
            });

        } catch (error) {
            console.error('设置Tauri事件监听器失败:', error);
            this.listenForImageDataFallback();
        }
    }

    /**
     * 组装图像数据
     */
    async assembleImageData(): Promise<void> {
        try {
            this.updateLoadingProgress('正在组装图像数据...');

            if (!this.imageInfo) {
                throw new Error('缺少图像信息');
            }

            // 合并所有数据块
            const allData: number[] = [];
            for (const chunk of this.imageDataChunks) {
                if (chunk) {
                    allData.push(...chunk);
                }
            }

            // 创建ImageData对象
            const uint8Array = new Uint8ClampedArray(allData);
            this.imageData = new ImageData(uint8Array, this.imageInfo.width, this.imageInfo.height);

            // 保存原始图像数据的副本
            this.originalImageData = new ImageData(
                new Uint8ClampedArray(uint8Array),
                this.imageInfo.width,
                this.imageInfo.height
            );

            console.log('图像数据组装完成，开始生成位平面');

            // 生成所有位平面
            await this.generateAllBitPlanes();

        } catch (error) {
            console.error('组装图像数据失败:', error);
            this.showLoading(false);
        }
    }

    /**
     * 降级方案：使用localStorage检查
     */
    listenForImageDataFallback(): void {
        const checkForImageData = () => {
            const imageInfoStr = localStorage.getItem('stegsolve_image_info');
            if (imageInfoStr && imageInfoStr !== this.lastImageInfoStr) {
                this.lastImageInfoStr = imageInfoStr;
                try {
                    const info = JSON.parse(imageInfoStr) as FallbackImageInfo;
                    this.updateImageInfo(info.width, info.height, info.filename);
                    // 在非Tauri环境中，我们无法获取完整的图像数据
                    // 显示提示信息
                    this.showMessage('位平面全览功能需要在Tauri环境中运行以获取完整图像数据');
                } catch (error) {
                    console.error('解析图像信息失败:', error);
                }
            }
        };

        // 每秒检查一次
        setInterval(checkForImageData, 1000);

        // 立即检查一次
        checkForImageData();
    }

    /**
     * 加载图像数据
     */
    async loadImageData(data: { data: number[]; width: number; height: number; filename: string }): Promise<void> {
        try {
            this.showLoading(true);

            // 创建ImageData对象
            const uint8Array = new Uint8ClampedArray(data.data);
            this.imageData = new ImageData(uint8Array, data.width, data.height);

            // 更新图像信息
            this.updateImageInfo(data.width, data.height, data.filename);

            // 生成所有位平面
            await this.generateAllBitPlanes();

        } catch (error) {
            console.error('加载图像数据失败:', error);
        } finally {
            this.showLoading(false);
        }
    }

    /**
     * 更新图像信息
     */
    updateImageInfo(width: number, height: number, filename: string): void {
        const imageInfo = document.getElementById('overviewImageInfo');
        if (imageInfo) {
            imageInfo.textContent = `${filename || '未知文件'} - ${width} × ${height}`;
        }
    }

    /**
     * 生成所有位平面
     */
    async generateAllBitPlanes(): Promise<void> {
        if (!this.imageData) return;

        const channels: Channel[] = ['red', 'green', 'blue', 'alpha'];
        const totalPlanes = channels.length * 8;
        let processedPlanes = 0;

        this.updateLoadingProgress('正在生成位平面... 0%');

        for (const channel of channels) {
            for (let bit = 0; bit < 8; bit++) {
                try {
                    await this.generateBitPlane(channel, bit);
                    processedPlanes++;

                    // 更新进度
                    const progress = Math.round((processedPlanes / totalPlanes) * 100);
                    this.updateLoadingProgress(`正在生成位平面... ${progress}%`);

                    // 让出控制权，避免阻塞UI
                    await new Promise<void>(resolve => setTimeout(resolve, 10));

                } catch (error) {
                    console.error(`生成位平面失败 ${channel}:${bit}:`, error);
                }
            }
        }

        // 生成完成，隐藏加载状态
        this.showLoading(false);
        console.log('所有位平面生成完成');
    }

    /**
     * 生成单个位平面
     */
    async generateBitPlane(channel: Channel, bit: number): Promise<void> {
        if (!this.imageData) return;

        const item = document.querySelector(`[data-channel="${channel}"][data-bit="${bit}"]`);
        if (!item) return;

        const canvas = item.querySelector<HTMLCanvasElement>('.bit-plane-canvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // 提取位平面数据
        const bitPlaneData = this.extractBitPlane(this.imageData, channel, bit);

        // 调整canvas尺寸以适应容器
        const containerWidth = 200;
        const containerHeight = 150;

        canvas.width = containerWidth;
        canvas.height = containerHeight;

        // 绘制位平面
        ctx.putImageData(bitPlaneData, 0, 0);

        // 如果图像尺寸与容器不匹配，进行缩放
        if (bitPlaneData.width !== containerWidth || bitPlaneData.height !== containerHeight) {
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            if (!tempCtx) return;
            tempCanvas.width = bitPlaneData.width;
            tempCanvas.height = bitPlaneData.height;
            tempCtx.putImageData(bitPlaneData, 0, 0);

            ctx.clearRect(0, 0, containerWidth, containerHeight);
            ctx.drawImage(tempCanvas, 0, 0, containerWidth, containerHeight);
        }
    }

    /**
     * 提取位平面
     */
    extractBitPlane(imageData: ImageData, channel: Channel, bitPosition: number): ImageData {
        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;
        const newData = new Uint8ClampedArray(width * height * 4);

        const channelOffset = getChannelOffset(channel);
        const bitMask = 1 << bitPosition;

        for (let i = 0; i < data.length; i += 4) {
            const value = (data[i + channelOffset] & bitMask) ? 255 : 0;

            // 显示为黑白位平面
            newData[i] = value;     // R
            newData[i + 1] = value; // G
            newData[i + 2] = value; // B
            newData[i + 3] = 255;   // A
        }

        return new ImageData(newData, width, height);
    }

    /**
     * 位平面点击事件
     */
    onBitPlaneClick(channel: Channel, bit: number): void {
        console.log(`点击位平面: ${channel} bit ${bit}`);
        // 可以在这里添加放大显示或其他功能
    }

    /**
     * 保存所有位平面
     */
    async saveAllBitPlanes(): Promise<void> {
        console.log('保存所有位平面功能开发中');
        // TODO: 实现保存功能
    }

    /**
     * 应用变换
     */
    async applyTransform(): Promise<void> {
        const transformSelect = document.getElementById('transformSelect') as HTMLSelectElement | null;
        if (!transformSelect || !this.originalImageData) {
            console.log('无法应用变换：缺少变换选择器或原始图像数据');
            return;
        }

        const transform = transformSelect.value as TransformType;

        if (transform === 'none') {
            // 恢复原始图像
            this.imageData = new ImageData(
                new Uint8ClampedArray(this.originalImageData.data),
                this.originalImageData.width,
                this.originalImageData.height
            );
        } else {
            // 应用变换
            this.imageData = this.applyImageTransform(this.originalImageData, transform);
        }

        // 重新生成位平面
        await this.generateAllBitPlanes();
    }

    /**
     * 应用图像变换
     */
    applyImageTransform(imageData: ImageData, transform: TransformType): ImageData {
        const width = imageData.width;
        const height = imageData.height;
        const data = new Uint8ClampedArray(imageData.data);
        const newData = new Uint8ClampedArray(data.length);

        for (let i = 0; i < data.length; i += 4) {
            let r = data[i];
            let g = data[i + 1];
            let b = data[i + 2];
            const a = data[i + 3];

            switch (transform) {
                case 'invert':
                    r = 255 - r;
                    g = 255 - g;
                    b = 255 - b;
                    break;
                case 'xor':
                    r = r ^ 128;
                    g = g ^ 128;
                    b = b ^ 128;
                    break;
                case 'add':
                    r = Math.min(255, r + 50);
                    g = Math.min(255, g + 50);
                    b = Math.min(255, b + 50);
                    break;
                case 'sub':
                    r = Math.max(0, r - 50);
                    g = Math.max(0, g - 50);
                    b = Math.max(0, b - 50);
                    break;
                case 'mul':
                    r = Math.min(255, r * 1.5);
                    g = Math.min(255, g * 1.5);
                    b = Math.min(255, b * 1.5);
                    break;
                case 'and':
                    r = r & 128;
                    g = g & 128;
                    b = b & 128;
                    break;
                case 'or':
                    r = r | 128;
                    g = g | 128;
                    b = b | 128;
                    break;
                default:
                    // 保持原值
                    break;
            }

            newData[i] = r;
            newData[i + 1] = g;
            newData[i + 2] = b;
            newData[i + 3] = a;
        }

        return new ImageData(newData, width, height);
    }

    /**
     * 刷新位平面
     */
    async refreshBitPlanes(): Promise<void> {
        if (this.imageData) {
            await this.generateAllBitPlanes();
        }
    }

    /**
     * 显示/隐藏加载状态
     */
    showLoading(show: boolean, text: string = '正在生成位平面...'): void {
        const overlay = document.getElementById('loadingOverlay');
        const loadingText = overlay?.querySelector<HTMLElement>('.loading-text');

        if (overlay) {
            overlay.style.display = show ? 'flex' : 'none';
        }

        if (loadingText && show) {
            loadingText.textContent = text;
        }
    }

    /**
     * 更新加载进度
     */
    updateLoadingProgress(text: string): void {
        const loadingText = document.querySelector<HTMLElement>('.loading-text');
        if (loadingText) {
            loadingText.textContent = text;
        }
    }

    /**
     * 显示消息
     */
    showMessage(message: string): void {
        const imageInfo = document.getElementById('overviewImageInfo');
        if (imageInfo) {
            imageInfo.textContent = message;
        }
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    new BitPlaneOverview();
});
