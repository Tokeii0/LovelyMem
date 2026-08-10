/**
 * EXIF文件选择器组件
 * 负责图片文件的选择和拖拽功能
 */

import { translate } from '../../../i18n';

const { open } = (window as any).__TAURI__.dialog;

/** 文件选择回调 */
type OnFileSelected = (filePath: string) => void | Promise<void>;

/** 文件信息（供选择器内部使用与展示） */
interface FileInfo {
    name: string;
    path: string;
    size: number;
    modified: string | null;
    created: string | null;
}

/** 后端 get_file_info 返回的原始数据结构 */
interface RawFileInfo {
    name?: string;
    size?: number;
    modified?: string | null;
    created?: string | null;
}

export class EXIFFileSelector {
    private container: HTMLElement;
    private onFileSelected: OnFileSelected;
    private supportedFormats: string[];

    constructor(container: HTMLElement, onFileSelected: OnFileSelected) {
        this.container = container;
        this.onFileSelected = onFileSelected;
        this.supportedFormats = [
            'jpg', 'jpeg', 'tiff', 'tif', 'raw', 'cr2', 'nef', 'arw', 'dng',
            'orf', 'rw2', 'pef', 'srw', 'raf', '3fr', 'fff', 'dcr', 'kdc',
            'srf', 'mrw', 'x3f', 'erf', 'mef', 'mos', 'crw'
        ];

        this.init();
    }

    /**
     * 初始化文件选择器
     */
    init(): void {
        this.render();
        this.bindEvents();
    }

    /**
     * 渲染文件选择器UI
     */
    render(): void {
        this.container.innerHTML = `
            <div class="exif-file-selector compact">
                <div class="file-drop-zone compact" id="exif-drop-zone">
                    <div class="drop-zone-content">
                        <div class="drop-icon">📁</div>
                        <h4>选择图片文件</h4>
                        <p>拖拽文件到此处或点击浏览</p>
                        <div class="file-actions">
                            <button id="exif-browse-btn" class="btn btn-primary btn-sm">
                                <i class="icon">📂</i>
                                浏览文件
                            </button>
                        </div>
                        <div class="supported-formats">
                            <span class="formats-list">支持: JPEG, TIFF, RAW等格式</span>
                        </div>
                    </div>
                </div>

                <div class="current-file-info compact" id="current-file-info" style="display: none;">
                    <div class="file-info-content">
                        <div class="file-icon">🖼️</div>
                        <div class="file-details">
                            <div class="file-name" id="current-file-name"></div>
                            <div class="file-size" id="current-file-size"></div>
                        </div>
                        <div class="file-actions">
                            <button id="change-file-btn" class="btn btn-secondary btn-sm">
                                <i class="icon">🔄</i>
                                更换
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 绑定事件
     */
    bindEvents(): void {
        const dropZone = document.getElementById('exif-drop-zone');
        const browseBtn = document.getElementById('exif-browse-btn');
        const changeFileBtn = document.getElementById('change-file-btn');

        // 浏览文件按钮
        browseBtn?.addEventListener('click', this.handleBrowseFile.bind(this));

        // 更换文件按钮
        if (changeFileBtn) {
            changeFileBtn.addEventListener('click', this.handleBrowseFile.bind(this));
        }

        // 拖拽事件
        if (dropZone) {
            dropZone.addEventListener('dragover', this.handleDragOver.bind(this));
            dropZone.addEventListener('dragleave', this.handleDragLeave.bind(this));
            dropZone.addEventListener('drop', this.handleDrop.bind(this));
        }

        // 防止页面默认拖拽行为
        document.addEventListener('dragover', (e: DragEvent) => e.preventDefault());
        document.addEventListener('drop', (e: DragEvent) => e.preventDefault());
    }

    /**
     * 处理文件浏览
     */
    async handleBrowseFile(): Promise<void> {
        try {
            const selected = await open({
                title: translate('选择图片文件'),
                multiple: false,
                filters: [
                    {
                        name: translate('图片文件'),
                        extensions: this.supportedFormats
                    },
                    {
                        name: translate('JPEG图片'),
                        extensions: ['jpg', 'jpeg']
                    },
                    {
                        name: translate('TIFF图片'),
                        extensions: ['tiff', 'tif']
                    },
                    {
                        name: translate('RAW文件'),
                        extensions: ['raw', 'cr2', 'nef', 'arw', 'dng', 'orf', 'rw2', 'pef', 'srw', 'raf']
                    },
                    {
                        name: translate('所有文件'),
                        extensions: ['*']
                    }
                ]
            });

            if (selected) {
                await this.handleFileSelection(selected as string);
            }
        } catch (error) {
            console.error('文件选择失败:', error);
            this.showError('文件选择失败: ' + (error as Error).message);
        }
    }

    /**
     * 处理拖拽悬停
     */
    handleDragOver(e: DragEvent): void {
        e.preventDefault();
        e.stopPropagation();

        const dropZone = e.currentTarget as HTMLElement;
        dropZone.classList.add('drag-over');

        // 检查拖拽的文件类型
        const items = e.dataTransfer?.items;
        let hasValidFile = false;

        if (items) {
            for (const item of Array.from(items)) {
                if (item.kind === 'file') {
                    const file = item.getAsFile();
                    if (file && this.isValidImageFile(file.name)) {
                        hasValidFile = true;
                        break;
                    }
                }
            }
        }

        if (hasValidFile) {
            dropZone.classList.add('valid-drop');
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
        } else {
            dropZone.classList.add('invalid-drop');
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
        }
    }

    /**
     * 处理拖拽离开
     */
    handleDragLeave(e: DragEvent): void {
        e.preventDefault();
        e.stopPropagation();

        const dropZone = e.currentTarget as HTMLElement;
        dropZone.classList.remove('drag-over', 'valid-drop', 'invalid-drop');
    }

    /**
     * 处理文件拖拽放置
     */
    async handleDrop(e: DragEvent): Promise<void> {
        e.preventDefault();
        e.stopPropagation();

        const dropZone = e.currentTarget as HTMLElement;
        dropZone.classList.remove('drag-over', 'valid-drop', 'invalid-drop');

        const files = Array.from(e.dataTransfer?.files ?? []);

        if (files.length === 0) {
            this.showError('没有检测到文件');
            return;
        }

        if (files.length > 1) {
            this.showError('请一次只选择一个文件');
            return;
        }

        const file = files[0];

        if (!this.isValidImageFile(file.name)) {
            this.showError('不支持的文件格式，请选择图片文件');
            return;
        }

        // 对于拖拽的文件，我们需要获取文件路径
        // 在Tauri中，我们可能需要通过其他方式处理
        try {
            // 这里可能需要调用后端API来处理拖拽的文件
            // 暂时使用文件名作为路径（实际应用中需要完整路径）
            await this.handleFileSelection((file as File & { path?: string }).path || file.name);
        } catch (error) {
            console.error('处理拖拽文件失败:', error);
            this.showError('处理文件失败: ' + (error as Error).message);
        }
    }

    /**
     * 处理文件选择
     */
    async handleFileSelection(filePath: string): Promise<void> {
        try {
            console.log('选择文件:', filePath);

            // 验证文件
            if (!this.isValidImageFile(filePath)) {
                throw new Error('不支持的文件格式');
            }

            // 获取文件信息
            const fileInfo = await this.getFileInfo(filePath);

            // 更新UI显示
            this.updateFileDisplay(fileInfo);

            // 调用回调函数
            if (this.onFileSelected) {
                await this.onFileSelected(filePath);
            }

        } catch (error) {
            console.error('文件选择处理失败:', error);
            this.showError('文件处理失败: ' + (error as Error).message);
        }
    }

    /**
     * 获取文件信息
     */
    async getFileInfo(filePath: string): Promise<FileInfo> {
        try {
            // 调用后端获取文件信息
            const { invoke } = (window as any).__TAURI__.core;
            const fileInfo = await invoke('get_file_info', { filePath }) as RawFileInfo;

            return {
                name: fileInfo.name || (filePath.split(/[/\\]/).pop() ?? filePath),
                path: filePath,
                size: fileInfo.size || 0,
                modified: fileInfo.modified || null,
                created: fileInfo.created || null
            };
        } catch (error) {
            console.warn('获取文件信息失败，使用基本信息:', error);
            // 如果后端调用失败，使用基本信息
            return {
                name: filePath.split(/[/\\]/).pop() ?? filePath,
                path: filePath,
                size: 0,
                modified: null,
                created: null
            };
        }
    }

    /**
     * 更新文件显示
     */
    updateFileDisplay(fileInfo: FileInfo): void {
        const dropZone = document.getElementById('exif-drop-zone');
        const currentFileInfo = document.getElementById('current-file-info');

        // 隐藏拖拽区域，显示文件信息
        if (dropZone) dropZone.style.display = 'none';
        if (currentFileInfo) currentFileInfo.style.display = 'block';

        // 更新文件信息（在紧凑布局中）
        const fileNameEl = document.getElementById('current-file-name');
        const filePathEl = document.getElementById('current-file-path');
        const fileSizeEl = document.getElementById('current-file-size');

        if (fileNameEl) fileNameEl.textContent = fileInfo.name;
        if (filePathEl) filePathEl.textContent = fileInfo.path;
        if (fileSizeEl) fileSizeEl.textContent = this.formatFileSize(fileInfo.size);

        // 同时更新主界面的文件信息区域（新布局）
        const fileNameDisplay = document.getElementById('file-name-display');
        const fileSizeDisplay = document.getElementById('file-size-display');
        const fileModifiedDisplay = document.getElementById('file-modified-display');

        if (fileNameDisplay) fileNameDisplay.textContent = fileInfo.name;
        if (fileSizeDisplay) fileSizeDisplay.textContent = this.formatFileSize(fileInfo.size);
        if (fileModifiedDisplay) fileModifiedDisplay.textContent = fileInfo.modified || '未知';

        // 重新绑定更换文件按钮事件
        const changeFileBtn = document.getElementById('change-file-btn');
        if (changeFileBtn) {
            changeFileBtn.addEventListener('click', this.showFileSelector.bind(this));
        }
    }

    /**
     * 显示文件选择器
     */
    showFileSelector(): void {
        const dropZone = document.getElementById('exif-drop-zone');
        const currentFileInfo = document.getElementById('current-file-info');

        if (dropZone) dropZone.style.display = 'block';
        if (currentFileInfo) currentFileInfo.style.display = 'none';
    }

    /**
     * 验证是否为有效的图片文件
     */
    isValidImageFile(filename: string): boolean {
        if (!filename) return false;

        const extension = filename.split('.').pop()?.toLowerCase() ?? '';
        return this.supportedFormats.includes(extension);
    }

    /**
     * 格式化文件大小
     */
    formatFileSize(bytes: number): string {
        if (bytes === 0) return '未知大小';

        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * 显示错误信息
     */
    showError(message: string): void {
        const toast = document.createElement('div');
        toast.className = 'exif-toast error';
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
        // 清理事件监听器
        if (this.container) {
            this.container.innerHTML = '';
        }
    }
}
