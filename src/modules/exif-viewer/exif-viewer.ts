/**
 * EXIF查看器主模块
 * 负责图片EXIF元数据的读取、显示和导出功能
 */

// 导入组件模块
import { EXIFTable } from './components/EXIFTable';
import { EXIFFileSelector } from './components/EXIFFileSelector';
import { EXIFExporter } from './components/EXIFExporter';
import { EXIFUtils, type EXIFData, type EXIFValue } from './utils/EXIFUtils';

// 全局EXIF查看器实例，用于调试
let globalEXIFViewer: EXIFViewer | null = null;

/** 分类键 -> 分类显示名称 */
type CategoryMap = Record<string, string>;

/** EXIF查看器应用的内部状态 */
interface EXIFViewerData {
    filename: string;
    filepath: string;
    exifData: EXIFData;
    filteredData: EXIFData;
    searchKeyword: string;
    selectedCategories: Set<string>;
}

/** EXIF查看器使用的组件集合 */
interface EXIFViewerComponents {
    fileSelector: EXIFFileSelector | null;
    table: EXIFTable | null;
    exporter: EXIFExporter | null;
}

/** 后端 get_file_info 返回的原始结构 */
interface BackendFileInfo {
    size?: number;
    modified?: string | null;
    [key: string]: unknown;
}

/**
 * EXIF查看器应用类
 */
class EXIFViewer {
    private data: EXIFViewerData;
    private components: EXIFViewerComponents;
    private categories: CategoryMap;

    constructor() {
        this.data = {
            filename: '',
            filepath: '',
            exifData: {},
            filteredData: {},
            searchKeyword: '',
            selectedCategories: new Set(['all']) // 选中的EXIF分类
        };

        this.components = {
            fileSelector: null,
            table: null,
            exporter: null
        };

        // EXIF分类定义
        this.categories = {
            'basic': '基本信息',
            'camera': '相机信息',
            'shooting': '拍摄参数',
            'gps': 'GPS位置',
            'datetime': '时间信息',
            'technical': '技术参数',
            'other': '其他信息'
        };

        this.init();
    }

    /**
     * 初始化应用
     */
    async init(): Promise<void> {
        try {
            console.log('🖼️ 初始化EXIF查看器...');

            // 初始化UI
            this.initializeUI();

            // 初始化组件
            this.initializeComponents();

            // 绑定事件
            this.bindEvents();

            // 初始化主题
            this.initTheme();

            // 设置全局实例
            globalEXIFViewer = this;
            (window as any).exifViewer = this;

            console.log('✅ EXIF查看器初始化完成');

        } catch (error) {
            console.error('❌ EXIF查看器初始化失败:', error);
            this.showError('初始化失败: ' + (error as Error).message);
        }
    }

    /**
     * 初始化UI结构
     */
    initializeUI(): void {
        const container = document.getElementById('exif-viewer-container');
        if (!container) {
            throw new Error('找不到EXIF查看器容器元素');
        }

        container.innerHTML = `
            <div class="exif-viewer-app">
                <!-- 自定义标题栏 -->
                <div class="exif-titlebar">
                    <div class="titlebar-content">
                        <div class="titlebar-title">
                            <span class="titlebar-icon">📷</span>
                            <span class="titlebar-text">EXIF查看器</span>
                        </div>
                        <div class="titlebar-controls">
                            <button id="exif-minimize-btn" class="titlebar-btn minimize-btn" title="最小化">
                                <span class="btn-icon">−</span>
                            </button>
                            <button id="exif-maximize-btn" class="titlebar-btn maximize-btn" title="最大化">
                                <span class="btn-icon">□</span>
                            </button>
                            <button id="exif-close-btn" class="titlebar-btn close-btn" title="关闭">
                                <span class="btn-icon">×</span>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- 主要内容区域 -->
                <div class="exif-main-content">
                    <!-- 左侧面板：图片预览和文件选择 -->
                    <div class="exif-left-panel">
                        <div class="panel-header">
                            <h3>图片预览</h3>
                            <div class="panel-actions">
                                <button id="exif-export-btn" class="btn btn-primary btn-sm" disabled>
                                    <i class="icon">💾</i>
                                    导出
                                </button>
                            </div>
                        </div>

                        <!-- 图片预览区域 -->
                        <div class="image-preview-section">
                            <div id="image-preview-container" class="image-preview">
                                <div class="preview-placeholder">
                                    <div class="placeholder-icon">🖼️</div>
                                    <p>选择图片文件预览</p>
                                </div>
                            </div>
                        </div>

                        <!-- 文件选择区域 -->
                        <div class="file-selection-section">
                            <div id="exif-file-selector"></div>
                        </div>

                        <!-- 文件信息区域 -->
                        <div class="file-info-section" id="file-info-section" style="display: none;">
                            <div class="info-header">
                                <h4>文件信息</h4>
                            </div>
                            <div class="info-content">
                                <div class="info-item">
                                    <label>文件名:</label>
                                    <span id="file-name-display">-</span>
                                </div>
                                <div class="info-item">
                                    <label>文件大小:</label>
                                    <span id="file-size-display">-</span>
                                </div>
                                <div class="info-item">
                                    <label>图像尺寸:</label>
                                    <span id="image-dimensions-display">-</span>
                                </div>
                                <div class="info-item">
                                    <label>修改时间:</label>
                                    <span id="file-modified-display">-</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 右侧面板：EXIF数据展示 -->
                    <div class="exif-right-panel">
                        <div class="panel-header">
                            <h3>EXIF元数据</h3>
                            <div class="panel-actions">
                                <button id="exif-copy-btn" class="btn btn-secondary btn-sm" disabled>
                                    <i class="icon">📋</i>
                                    复制
                                </button>
                            </div>
                        </div>

                        <!-- 搜索和过滤区域 -->
                        <div class="exif-filter-section" id="exif-filter-section" style="display: none;">
                            <div class="filter-row">
                                <div class="search-group">
                                    <input type="text" id="exif-search-input" placeholder="搜索EXIF标签或值..." class="search-input">
                                    <button id="exif-clear-search" class="btn btn-clear">清除</button>
                                </div>
                            </div>
                            <div class="filter-row">
                                <div class="category-group">
                                    <label class="category-label">显示分类:</label>
                                    <div class="category-checkboxes">
                                        <label class="category-checkbox">
                                            <input type="checkbox" value="all" checked>
                                            <span>全部</span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- EXIF数据表格区域 -->
                        <div class="exif-data-section">
                            <div id="exif-table-container" class="exif-table-wrapper">
                                <div class="exif-empty-state">
                                    <div class="empty-icon">📊</div>
                                    <h3>等待数据加载</h3>
                                    <p>选择图片文件后，EXIF元数据将在此处显示</p>
                                </div>
                            </div>
                        </div>

                        <!-- 数据统计区域 -->
                        <div class="exif-stats-section" id="exif-stats-section" style="display: none;">
                            <div class="stats-content">
                                <span class="stats-item">
                                    <span class="stats-label">总标签数:</span>
                                    <span id="total-tags-count">0</span>
                                </span>
                                <span class="stats-item">
                                    <span class="stats-label">显示标签:</span>
                                    <span id="visible-tags-count">0</span>
                                </span>
                                <span class="stats-item">
                                    <span class="stats-label">当前文件:</span>
                                    <span id="current-file-name">未选择</span>
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 初始化组件
     */
    initializeComponents(): void {
        const fileSelectorEl = document.getElementById('exif-file-selector');
        const tableContainerEl = document.getElementById('exif-table-container');

        // 初始化文件选择器
        if (fileSelectorEl) {
            this.components.fileSelector = new EXIFFileSelector(
                fileSelectorEl,
                this.handleFileSelected.bind(this)
            );
        }

        // 初始化表格组件
        if (tableContainerEl) {
            this.components.table = new EXIFTable(tableContainerEl);
        }

        // 初始化导出器
        this.components.exporter = new EXIFExporter();

        // 初始化分类复选框
        this.initializeCategoryCheckboxes();
    }

    /**
     * 初始化分类复选框
     */
    initializeCategoryCheckboxes(): void {
        const container = document.querySelector<HTMLElement>('.category-checkboxes');
        if (!container) return;

        // 添加其他分类复选框
        Object.entries(this.categories).forEach(([key, label]) => {
            const checkboxHtml = `
                <label class="category-checkbox">
                    <input type="checkbox" value="${key}">
                    <span>${label}</span>
                </label>
            `;
            container.insertAdjacentHTML('beforeend', checkboxHtml);
        });
    }

    /**
     * 绑定事件
     */
    bindEvents(): void {
        // 标题栏控制按钮事件
        this.bindTitlebarEvents();

        // 搜索事件
        const searchInput = document.getElementById('exif-search-input') as HTMLInputElement | null;
        if (searchInput) {
            searchInput.addEventListener('input', this.handleSearch.bind(this));
        }

        // 清除搜索
        const clearSearchBtn = document.getElementById('exif-clear-search');
        if (clearSearchBtn) {
            clearSearchBtn.addEventListener('click', () => {
                if (searchInput) {
                    searchInput.value = '';
                    this.handleSearch();
                }
            });
        }

        // 分类过滤事件
        const categoryCheckboxes = document.querySelectorAll<HTMLInputElement>('.category-checkbox input');
        categoryCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', this.handleCategoryFilter.bind(this));
        });

        // 导出按钮
        const exportBtn = document.getElementById('exif-export-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', this.handleExport.bind(this));
        }

        // 复制按钮
        const copyBtn = document.getElementById('exif-copy-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', this.handleCopyAll.bind(this));
        }

        // 窗口关闭事件
        window.addEventListener('beforeunload', this.cleanup.bind(this));
    }

    /**
     * 绑定标题栏事件
     */
    bindTitlebarEvents(): void {
        // 最小化按钮
        const minimizeBtn = document.getElementById('exif-minimize-btn');
        if (minimizeBtn) {
            minimizeBtn.addEventListener('click', async () => {
                try {
                    const { getCurrentWebviewWindow } = (window as any).__TAURI__.webviewWindow;
                    const appWindow = getCurrentWebviewWindow();
                    await appWindow.minimize();
                } catch (error) {
                    console.error('最小化窗口失败:', error);
                }
            });
        }

        // 最大化按钮
        const maximizeBtn = document.getElementById('exif-maximize-btn');
        if (maximizeBtn) {
            maximizeBtn.addEventListener('click', async () => {
                try {
                    const { getCurrentWebviewWindow } = (window as any).__TAURI__.webviewWindow;
                    const appWindow = getCurrentWebviewWindow();
                    const isMaximized = await appWindow.isMaximized();
                    if (isMaximized) {
                        await appWindow.unmaximize();
                        const icon = maximizeBtn.querySelector<HTMLElement>('.btn-icon');
                        if (icon) icon.textContent = '□';
                    } else {
                        await appWindow.maximize();
                        const icon = maximizeBtn.querySelector<HTMLElement>('.btn-icon');
                        if (icon) icon.textContent = '❐';
                    }
                } catch (error) {
                    console.error('切换窗口最大化状态失败:', error);
                }
            });
        }

        // 关闭按钮
        const closeBtn = document.getElementById('exif-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', (e: MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('🔴 关闭按钮被点击');

                // 直接关闭窗口
                const tauri = (window as any).__TAURI__;
                if (tauri && tauri.webviewWindow) {
                    const { getCurrentWebviewWindow } = tauri.webviewWindow;
                    const appWindow = getCurrentWebviewWindow();
                    console.log('🔴 正在关闭窗口...');
                    appWindow.close();
                } else {
                    console.log('🔴 Tauri API不可用，使用window.close()');
                    window.close();
                }
            });

            console.log('✅ 关闭按钮事件绑定成功');
        } else {
            console.error('❌ 找不到关闭按钮元素');
        }
    }

    /**
     * 初始化主题
     */
    initTheme(): void {
        try {
            // 从localStorage获取主题设置
            const savedTheme = localStorage.getItem('theme') || 'light';
            this.applyTheme(savedTheme);

            // 监听主题变化
            window.addEventListener('storage', (e: StorageEvent) => {
                if (e.key === 'theme') {
                    this.applyTheme(e.newValue || 'light');
                }
            });

            // 监听来自主窗口的主题变化消息
            const tauri = (window as any).__TAURI__;
            if (tauri) {
                const { listen } = tauri.event;
                listen('theme-changed', (event: { payload: { theme: string } }) => {
                    this.applyTheme(event.payload.theme);
                });
            }

            console.log('✅ 主题系统初始化完成');
        } catch (error) {
            console.error('❌ 主题初始化失败:', error);
        }
    }

    /**
     * 应用主题
     */
    applyTheme(theme: string): void {
        try {
            document.documentElement.setAttribute('data-theme', theme);
            localStorage.setItem('theme', theme);
            console.log(`🎨 应用主题: ${theme}`);
        } catch (error) {
            console.error('❌ 应用主题失败:', error);
        }
    }

    /**
     * 处理文件选择
     */
    async handleFileSelected(filePath: string): Promise<void> {
        try {
            console.log('📁 选择文件:', filePath);

            this.showLoading('正在读取EXIF数据...');

            // 更新基本文件信息
            this.data.filename = filePath.split(/[/\\]/).pop() ?? filePath;
            this.data.filepath = filePath;

            // 先获取后端的基础文件信息
            const { invoke } = (window as any).__TAURI__.core;
            const basicInfo = await invoke('read_exif_data', { filePath }) as EXIFData;

            // 使用前端JavaScript库解析EXIF数据
            const frontendExifData = await this.extractEXIFWithJS(filePath);

            // 合并后端基础信息和前端EXIF数据
            this.data.exifData = { ...basicInfo, ...frontendExifData };

            // 更新UI
            this.updateFileInfo();
            this.updateEXIFDisplay();
            this.showFilterSection();

            console.log('✅ EXIF数据加载完成:', Object.keys(this.data.exifData).length, '个标签');

        } catch (error) {
            console.error('❌ 读取EXIF数据失败:', error);

            // 即使EXIF读取失败，也要显示基本文件信息
            this.data.filename = filePath.split(/[/\\]/).pop() ?? filePath;
            this.data.filepath = filePath;
            this.data.exifData = {};

            this.updateFileInfo();
            this.showError('读取EXIF数据失败，但文件已选择: ' + (error as Error).message);
        }
    }

    /**
     * 处理搜索
     */
    handleSearch(): void {
        const searchInput = document.getElementById('exif-search-input') as HTMLInputElement | null;
        const keyword = (searchInput?.value ?? '').toLowerCase();
        this.data.searchKeyword = keyword;
        this.updateEXIFDisplay();
    }

    /**
     * 处理分类过滤
     */
    handleCategoryFilter(event: Event): void {
        const checkbox = event.target as HTMLInputElement;
        const value = checkbox.value;

        if (value === 'all') {
            // 全部选择/取消选择
            const allCheckboxes = document.querySelectorAll<HTMLInputElement>('.category-checkbox input');
            allCheckboxes.forEach(cb => {
                cb.checked = checkbox.checked;
            });

            if (checkbox.checked) {
                this.data.selectedCategories = new Set(['all', ...Object.keys(this.categories)]);
            } else {
                this.data.selectedCategories = new Set();
            }
        } else {
            // 单个分类选择
            if (checkbox.checked) {
                this.data.selectedCategories.add(value);
            } else {
                this.data.selectedCategories.delete(value);
                // 取消全部选择
                const allCheckbox = document.querySelector<HTMLInputElement>('input[value="all"]');
                if (allCheckbox) allCheckbox.checked = false;
                this.data.selectedCategories.delete('all');
            }
        }

        this.updateEXIFDisplay();
    }

    /**
     * 更新文件信息显示
     */
    updateFileInfo(): void {
        // 更新文件信息区域
        const fileInfoSection = document.getElementById('file-info-section');
        const fileNameDisplay = document.getElementById('file-name-display');
        const currentFileName = document.getElementById('current-file-name');

        if (fileInfoSection) fileInfoSection.style.display = 'block';
        if (fileNameDisplay) fileNameDisplay.textContent = this.data.filename;
        if (currentFileName) currentFileName.textContent = this.data.filename;

        // 启用操作按钮
        const exportBtn = document.getElementById('exif-export-btn') as HTMLButtonElement | null;
        const copyBtn = document.getElementById('exif-copy-btn') as HTMLButtonElement | null;
        if (exportBtn) exportBtn.disabled = false;
        if (copyBtn) copyBtn.disabled = false;

        // 显示图片预览（如果可能）
        this.updateImagePreview();

        // 获取并显示详细文件信息
        this.updateDetailedFileInfo();
    }

    /**
     * 更新详细文件信息
     */
    async updateDetailedFileInfo(): Promise<void> {
        try {
            const { invoke } = (window as any).__TAURI__.core;
            const fileInfo = await invoke('get_file_info', { filePath: this.data.filepath }) as BackendFileInfo;

            // 更新文件大小显示
            const fileSizeDisplay = document.getElementById('file-size-display');
            if (fileSizeDisplay && fileInfo.size) {
                fileSizeDisplay.textContent = this.formatFileSize(fileInfo.size);
            }

            // 更新修改时间显示
            const fileModifiedDisplay = document.getElementById('file-modified-display');
            if (fileModifiedDisplay && fileInfo.modified) {
                fileModifiedDisplay.textContent = fileInfo.modified;
            }

        } catch (error) {
            console.warn('获取详细文件信息失败:', error);
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
     * 更新图片预览
     */
    async updateImagePreview(): Promise<void> {
        const previewContainer = document.getElementById('image-preview-container');
        if (!previewContainer || !this.data.filepath) return;

        try {
            // 使用Tauri的convertFileSrc来安全地加载本地文件
            const { convertFileSrc } = (window as any).__TAURI__.core;
            const assetUrl = convertFileSrc(this.data.filepath);

            // 创建图片预览
            const img = document.createElement('img');
            img.src = assetUrl;
            img.alt = this.data.filename;
            img.className = 'preview-image';

            img.onload = () => {
                previewContainer.innerHTML = '';
                previewContainer.appendChild(img);

                // 更新图像尺寸信息
                const dimensionsDisplay = document.getElementById('image-dimensions-display');
                if (dimensionsDisplay) {
                    dimensionsDisplay.textContent = `${img.naturalWidth} × ${img.naturalHeight}`;
                }

                console.log('✅ 图片预览加载成功');
            };

            img.onerror = (error) => {
                console.error('图片加载失败:', error);
                previewContainer.innerHTML = `
                    <div class="preview-error">
                        <div class="error-icon">⚠️</div>
                        <p>无法预览此图片</p>
                        <small>格式可能不受支持</small>
                    </div>
                `;
            };
        } catch (error) {
            console.error('更新图片预览失败:', error);
            previewContainer.innerHTML = `
                <div class="preview-error">
                    <div class="error-icon">❌</div>
                    <p>预览加载失败</p>
                    <small>${(error as Error).message}</small>
                </div>
            `;
        }
    }

    /**
     * 使用前端JavaScript解析EXIF数据
     */
    async extractEXIFWithJS(filePath: string): Promise<EXIFData> {
        try {
            console.log('🔍 开始前端EXIF解析:', filePath);

            // 使用Tauri的invoke调用后端读取文件数据
            const { invoke } = (window as any).__TAURI__.core;
            const fileData = await invoke('read_file_bytes', { filePath }) as number[];

            // 将数据转换为ArrayBuffer
            const arrayBuffer = new Uint8Array(fileData).buffer;

            // 解析EXIF数据
            const exifData = this.parseEXIFFromArrayBuffer(arrayBuffer, filePath);

            console.log('✅ 前端EXIF解析完成:', Object.keys(exifData).length, '个标签');
            return exifData;

        } catch (error) {
            console.warn('❌ 前端EXIF解析失败:', error);

            // 如果文件读取失败，尝试通过图片加载获取基本信息
            return this.extractBasicImageInfo(filePath);
        }
    }

    /**
     * 从ArrayBuffer解析EXIF数据
     */
    parseEXIFFromArrayBuffer(arrayBuffer: ArrayBuffer, filePath: string): EXIFData {
        const exifData: EXIFData = {};
        const dataView = new DataView(arrayBuffer);

        try {
            // 检查JPEG文件头
            if (dataView.getUint16(0) === 0xFFD8) {
                console.log('📸 检测到JPEG文件，开始解析EXIF');
                Object.assign(exifData, this.parseJPEGEXIF(dataView, filePath));
            } else if (dataView.getUint32(0) === 0x89504E47) {
                console.log('🖼️ 检测到PNG文件');
                Object.assign(exifData, this.parsePNGInfo(dataView, filePath));
            } else {
                console.log('📄 未知文件格式，提供基本信息');
                Object.assign(exifData, this.getBasicFileInfo(filePath));
            }
        } catch (error) {
            console.warn('EXIF解析过程中出错:', error);
            Object.assign(exifData, this.getBasicFileInfo(filePath));
        }

        return exifData;
    }

    /**
     * 解析JPEG文件的EXIF数据
     */
    parseJPEGEXIF(dataView: DataView, filePath: string): EXIFData {
        const exifData = this.getBasicFileInfo(filePath);

        try {
            // 查找EXIF段
            let offset = 2; // 跳过JPEG文件头 0xFFD8

            while (offset < dataView.byteLength - 1) {
                const marker = dataView.getUint16(offset);

                if (marker === 0xFFE1) { // APP1段，通常包含EXIF数据
                    const segmentLength = dataView.getUint16(offset + 2);
                    const exifHeader = dataView.getUint32(offset + 4);

                    if (exifHeader === 0x45786966) { // "Exif"
                        console.log('🎯 找到EXIF段');
                        Object.assign(exifData, this.parseEXIFSegment(dataView, offset + 10));
                        break;
                    }

                    offset += 2 + segmentLength;
                } else if ((marker & 0xFF00) === 0xFF00) {
                    // 其他JPEG段
                    const segmentLength = dataView.getUint16(offset + 2);
                    offset += 2 + segmentLength;
                } else {
                    break;
                }
            }
        } catch (error) {
            console.warn('JPEG EXIF解析失败:', error);
        }

        return exifData;
    }

    /**
     * 解析EXIF段数据
     */
    parseEXIFSegment(dataView: DataView, offset: number): EXIFData {
        const exifData: EXIFData = {};

        try {
            // 检查TIFF头部
            const tiffOffset = offset;
            const byteOrder = dataView.getUint16(tiffOffset);
            const littleEndian = byteOrder === 0x4949; // "II"

            // 读取IFD偏移
            const ifdOffset = this.readUint32(dataView, tiffOffset + 4, littleEndian);

            // 解析主IFD
            this.parseIFD(dataView, tiffOffset + ifdOffset, tiffOffset, littleEndian, exifData);

            console.log('📋 解析了EXIF标签:', Object.keys(exifData).length, '个');
        } catch (error) {
            console.warn('EXIF段解析失败:', error);
            // 如果解析失败，添加一些基本信息
            exifData['_ParseError'] = 'EXIF解析失败，显示基本信息';
        }

        return exifData;
    }

    /**
     * 解析IFD（Image File Directory）
     */
    parseIFD(dataView: DataView, ifdOffset: number, tiffOffset: number, littleEndian: boolean, exifData: EXIFData): void {
        try {
            const entryCount = this.readUint16(dataView, ifdOffset, littleEndian);

            for (let i = 0; i < entryCount; i++) {
                const entryOffset = ifdOffset + 2 + (i * 12);
                const tag = this.readUint16(dataView, entryOffset, littleEndian);
                const type = this.readUint16(dataView, entryOffset + 2, littleEndian);
                const count = this.readUint32(dataView, entryOffset + 4, littleEndian);
                const valueOffset = entryOffset + 8;

                const tagName = this.getTagName(tag);
                const value = this.readTagValue(dataView, type, count, valueOffset, tiffOffset, littleEndian);

                if (tagName && value !== null) {
                    exifData[tagName] = value;
                }

                // 处理子IFD（如EXIF IFD, GPS IFD等）
                if (tag === 0x8769) { // EXIF IFD
                    const exifIfdOffset = this.readUint32(dataView, valueOffset, littleEndian);
                    this.parseIFD(dataView, tiffOffset + exifIfdOffset, tiffOffset, littleEndian, exifData);
                } else if (tag === 0x8825) { // GPS IFD
                    const gpsIfdOffset = this.readUint32(dataView, valueOffset, littleEndian);
                    this.parseGPSIFD(dataView, tiffOffset + gpsIfdOffset, tiffOffset, littleEndian, exifData);
                }
            }
        } catch (error) {
            console.warn('IFD解析失败:', error);
        }
    }

    /**
     * 解析GPS IFD
     */
    parseGPSIFD(dataView: DataView, ifdOffset: number, tiffOffset: number, littleEndian: boolean, exifData: EXIFData): void {
        try {
            const entryCount = this.readUint16(dataView, ifdOffset, littleEndian);

            for (let i = 0; i < entryCount; i++) {
                const entryOffset = ifdOffset + 2 + (i * 12);
                const tag = this.readUint16(dataView, entryOffset, littleEndian);
                const type = this.readUint16(dataView, entryOffset + 2, littleEndian);
                const count = this.readUint32(dataView, entryOffset + 4, littleEndian);
                const valueOffset = entryOffset + 8;

                const tagName = this.getGPSTagName(tag);
                const value = this.readTagValue(dataView, type, count, valueOffset, tiffOffset, littleEndian);

                if (tagName && value !== null) {
                    exifData[tagName] = value;
                }
            }
        } catch (error) {
            console.warn('GPS IFD解析失败:', error);
        }
    }

    /**
     * 解析PNG文件信息
     */
    parsePNGInfo(dataView: DataView, filePath: string): EXIFData {
        const exifData = this.getBasicFileInfo(filePath);

        try {
            // PNG文件头: 89 50 4E 47 0D 0A 1A 0A
            if (dataView.getUint32(0) === 0x89504E47 && dataView.getUint32(4) === 0x0D0A1A0A) {
                // 读取IHDR块获取图像尺寸
                const width = dataView.getUint32(16);
                const height = dataView.getUint32(20);
                const bitDepth = dataView.getUint8(24);
                const colorType = dataView.getUint8(25);

                exifData['ImageWidth'] = width;
                exifData['ImageHeight'] = height;
                exifData['PixelXDimension'] = width;
                exifData['PixelYDimension'] = height;
                exifData['BitDepth'] = bitDepth;
                exifData['ColorType'] = this.getPNGColorType(colorType);

                console.log('📋 解析了PNG基本信息');
            }
        } catch (error) {
            console.warn('PNG信息解析失败:', error);
        }

        return exifData;
    }

    /**
     * 获取PNG颜色类型描述
     */
    getPNGColorType(colorType: number): string {
        const types: Record<number, string> = {
            0: 'Grayscale',
            2: 'RGB',
            3: 'Palette',
            4: 'Grayscale with Alpha',
            6: 'RGB with Alpha'
        };
        return types[colorType] || 'Unknown';
    }

    /**
     * 获取基本文件信息
     */
    getBasicFileInfo(filePath: string): EXIFData {
        const fileName = filePath.split(/[/\\]/).pop() ?? filePath;
        const fileExt = (fileName.split('.').pop() ?? '').toLowerCase();

        return {
            'FileName': fileName,
            'FileType': fileExt.toUpperCase(),
            'MIMEType': this.getMimeType(fileExt),
            // 移除ProcessedDateTime，避免显示错误时间
            'ColorSpace': 'sRGB',
            'Orientation': 1,
            'ResolutionUnit': 'inches',
            'XResolution': 72,
            'YResolution': 72
        };
    }

    /**
     * 通过图片加载获取基本信息（备用方案）
     */
    async extractBasicImageInfo(filePath: string): Promise<EXIFData> {
        try {
            const { convertFileSrc } = (window as any).__TAURI__.core;
            const assetUrl = convertFileSrc(filePath);

            return new Promise<EXIFData>((resolve) => {
                const img = new Image();
                img.onload = () => {
                    const basicInfo = this.getBasicFileInfo(filePath);
                    basicInfo['ImageWidth'] = img.naturalWidth;
                    basicInfo['ImageHeight'] = img.naturalHeight;
                    basicInfo['PixelXDimension'] = img.naturalWidth;
                    basicInfo['PixelYDimension'] = img.naturalHeight;
                    resolve(basicInfo);
                };
                img.onerror = () => {
                    resolve(this.getBasicFileInfo(filePath));
                };
                img.src = assetUrl;
            });
        } catch (error) {
            return this.getBasicFileInfo(filePath);
        }
    }

    /**
     * 获取MIME类型
     */
    getMimeType(extension: string): string {
        const mimeTypes: Record<string, string> = {
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'bmp': 'image/bmp',
            'tiff': 'image/tiff',
            'tif': 'image/tiff',
            'webp': 'image/webp'
        };
        return mimeTypes[extension] || 'application/octet-stream';
    }

    /**
     * 读取16位无符号整数
     */
    readUint16(dataView: DataView, offset: number, littleEndian: boolean): number {
        return dataView.getUint16(offset, littleEndian);
    }

    /**
     * 读取32位无符号整数
     */
    readUint32(dataView: DataView, offset: number, littleEndian: boolean): number {
        return dataView.getUint32(offset, littleEndian);
    }

    /**
     * 读取标签值
     */
    readTagValue(dataView: DataView, type: number, count: number, valueOffset: number, tiffOffset: number, littleEndian: boolean): EXIFValue {
        try {
            let actualOffset = valueOffset;

            // 如果数据长度超过4字节，需要从偏移位置读取
            const dataSize = this.getTypeSize(type) * count;
            if (dataSize > 4) {
                actualOffset = tiffOffset + this.readUint32(dataView, valueOffset, littleEndian);
            }

            switch (type) {
                case 1: // BYTE
                    return count === 1 ? dataView.getUint8(actualOffset) :
                           Array.from({ length: count }, (_, i) => dataView.getUint8(actualOffset + i));

                case 2: { // ASCII
                    const bytes = new Uint8Array(dataView.buffer, actualOffset, count);
                    return new TextDecoder().decode(bytes).replace(/\0+$/, '');
                }

                case 3: // SHORT
                    return count === 1 ? this.readUint16(dataView, actualOffset, littleEndian) :
                           Array.from({ length: count }, (_, i) => this.readUint16(dataView, actualOffset + i * 2, littleEndian));

                case 4: // LONG
                    return count === 1 ? this.readUint32(dataView, actualOffset, littleEndian) :
                           Array.from({ length: count }, (_, i) => this.readUint32(dataView, actualOffset + i * 4, littleEndian));

                case 5: // RATIONAL
                    if (count === 1) {
                        const num = this.readUint32(dataView, actualOffset, littleEndian);
                        const den = this.readUint32(dataView, actualOffset + 4, littleEndian);
                        return den === 0 ? 0 : num / den;
                    }
                    return Array.from({ length: count }, (_, i) => {
                        const num = this.readUint32(dataView, actualOffset + i * 8, littleEndian);
                        const den = this.readUint32(dataView, actualOffset + i * 8 + 4, littleEndian);
                        return den === 0 ? 0 : num / den;
                    });

                default:
                    return null;
            }
        } catch (error) {
            console.warn('读取标签值失败:', error);
            return null;
        }
    }

    /**
     * 获取数据类型大小
     */
    getTypeSize(type: number): number {
        const sizes: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };
        return sizes[type] || 1;
    }

    /**
     * 在系统默认程序中打开图片
     */
    async openInSystemViewer(): Promise<void> {
        try {
            const { invoke } = (window as any).__TAURI__.core;
            await invoke('open_file_in_default_app', { filePath: this.data.filepath });
        } catch (error) {
            console.error('打开系统预览失败:', error);
            this.showError('无法在系统默认程序中打开文件');
        }
    }

    /**
     * 获取EXIF标签名称
     */
    getTagName(tag: number): string | undefined {
        const tags: Record<number, string> = {
            0x010E: 'ImageDescription',
            0x010F: 'Make',
            0x0110: 'Model',
            0x0112: 'Orientation',
            0x011A: 'XResolution',
            0x011B: 'YResolution',
            0x0128: 'ResolutionUnit',
            0x0131: 'Software',
            0x0132: 'DateTime',
            0x013B: 'Artist',
            0x8298: 'Copyright',
            0x8769: 'ExifOffset',
            0x8825: 'GPSOffset',

            // EXIF IFD标签
            0x829A: 'ExposureTime',
            0x829D: 'FNumber',
            0x8822: 'ExposureProgram',
            0x8827: 'ISO',
            0x9000: 'ExifVersion',
            0x9003: 'DateTimeOriginal',
            0x9004: 'DateTimeDigitized',
            0x9201: 'ShutterSpeedValue',
            0x9202: 'ApertureValue',
            0x9204: 'ExposureBiasValue',
            0x9205: 'MaxApertureValue',
            0x9206: 'SubjectDistance',
            0x9207: 'MeteringMode',
            0x9208: 'LightSource',
            0x9209: 'Flash',
            0x920A: 'FocalLength',
            0x9286: 'UserComment',
            0xA000: 'FlashpixVersion',
            0xA001: 'ColorSpace',
            0xA002: 'PixelXDimension',
            0xA003: 'PixelYDimension',
            0xA402: 'ExposureMode',
            0xA403: 'WhiteBalance',
            0xA405: 'FocalLengthIn35mmFormat'
        };
        return tags[tag];
    }

    /**
     * 获取GPS标签名称
     */
    getGPSTagName(tag: number): string | undefined {
        const gpsTags: Record<number, string> = {
            0x0000: 'GPSVersionID',
            0x0001: 'GPSLatitudeRef',
            0x0002: 'GPSLatitude',
            0x0003: 'GPSLongitudeRef',
            0x0004: 'GPSLongitude',
            0x0005: 'GPSAltitudeRef',
            0x0006: 'GPSAltitude',
            0x0007: 'GPSTimeStamp',
            0x0012: 'GPSMapDatum',
            0x001D: 'GPSDateStamp'
        };
        return gpsTags[tag];
    }

    /**
     * 更新EXIF数据显示
     */
    updateEXIFDisplay(): void {
        // 过滤数据
        this.data.filteredData = this.filterEXIFData();

        // 更新表格
        this.components.table?.render(this.data.filteredData, this.categories);

        // 更新计数
        const totalCount = Object.keys(this.data.exifData).length;
        const visibleCount = Object.keys(this.data.filteredData).length;

        const totalTagsCount = document.getElementById('total-tags-count');
        const visibleTagsCount = document.getElementById('visible-tags-count');

        if (totalTagsCount) totalTagsCount.textContent = totalCount.toString();
        if (visibleTagsCount) visibleTagsCount.textContent = visibleCount.toString();
    }

    /**
     * 过滤EXIF数据
     */
    filterEXIFData(): EXIFData {
        let filtered: EXIFData = { ...this.data.exifData };

        // 搜索过滤
        if (this.data.searchKeyword) {
            const keyword = this.data.searchKeyword;
            filtered = Object.fromEntries(
                Object.entries(filtered).filter(([key, value]) =>
                    key.toLowerCase().includes(keyword) ||
                    String(value).toLowerCase().includes(keyword)
                )
            );
        }

        // 分类过滤
        if (!this.data.selectedCategories.has('all')) {
            filtered = Object.fromEntries(
                Object.entries(filtered).filter(([key]) => {
                    const category = EXIFUtils.getTagCategory(key);
                    return this.data.selectedCategories.has(category);
                })
            );
        }

        return filtered;
    }

    /**
     * 显示过滤区域和统计信息
     */
    showFilterSection(): void {
        const filterSection = document.getElementById('exif-filter-section');
        const statsSection = document.getElementById('exif-stats-section');

        if (filterSection) filterSection.style.display = 'block';
        if (statsSection) statsSection.style.display = 'block';
    }

    /**
     * 处理导出
     */
    async handleExport(): Promise<void> {
        try {
            await this.components.exporter?.exportData(this.data.filteredData, this.data.filename);
        } catch (error) {
            console.error('❌ 导出失败:', error);
            this.showError('导出失败: ' + (error as Error).message);
        }
    }

    /**
     * 处理复制全部
     */
    async handleCopyAll(): Promise<void> {
        try {
            const text = EXIFUtils.formatForClipboard(this.data.filteredData);
            await navigator.clipboard.writeText(text);
            this.showSuccess('EXIF数据已复制到剪贴板');
        } catch (error) {
            console.error('❌ 复制失败:', error);
            this.showError('复制失败: ' + (error as Error).message);
        }
    }

    /**
     * 显示加载状态
     */
    showLoading(message: string): void {
        const container = document.getElementById('exif-table-container');
        if (!container) return;
        container.innerHTML = `
            <div class="exif-loading-state">
                <div class="loading-spinner"></div>
                <p>${message}</p>
            </div>
        `;
    }

    /**
     * 显示错误信息
     */
    showError(message: string): void {
        const container = document.getElementById('exif-table-container');
        if (!container) return;
        container.innerHTML = `
            <div class="exif-error-state">
                <div class="error-icon">❌</div>
                <h3>出现错误</h3>
                <p>${message}</p>
            </div>
        `;
    }

    /**
     * 显示成功信息
     */
    showSuccess(message: string): void {
        // 创建临时提示
        const toast = document.createElement('div');
        toast.className = 'exif-toast success';
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.remove();
        }, 3000);
    }

    /**
     * 清理资源
     */
    cleanup(): void {
        console.log('🧹 清理EXIF查看器资源...');
        // 清理组件
        Object.values(this.components).forEach(component => {
            if (component && typeof component.cleanup === 'function') {
                component.cleanup();
            }
        });
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    new EXIFViewer();
});

// 导出类供外部使用
export { EXIFViewer };
