import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import * as monaco from 'monaco-editor';
import './styles/report-editor.css';
import IconParkHelper from '../utils/iconparkHelper';
import { showFriendlyError } from '../utils/errorMessage';
import { translate } from '../../i18n';

interface ReportFile {
    name: string;
    path: string;
    content: string;
    modified: boolean;
}

interface FileEntry {
    name: string;
    path: string;
    is_dir: boolean;
    modified: string;
}

export class ReportEditorInterface {
    private container: HTMLElement | null = null;
    private currentFile: ReportFile | null = null;
    private currentDirectory: string = '';
    private files: FileEntry[] = [];
    private monacoEditor: monaco.editor.IStandaloneCodeEditor | null = null;
    private preview: HTMLElement | null = null;
    private isPreviewMode: boolean = false;
    private isEditMode: boolean = true;
    private isSplitMode: boolean = false;
    private autoSaveTimer: number | null = null;
    private themeObserver: MutationObserver | null = null;
    private expandedFolders: Set<string> = new Set(); // 跟踪展开的文件夹
    
    // 缓存的 SVG 图标
    private icons = {
        file: IconParkHelper.getSvgString('file-text', { size: 16 }),
        folder: IconParkHelper.getSvgString('folder', { size: 16 }),
        folderOpen: IconParkHelper.getSvgString('folder-open', { size: 16 }),
        save: IconParkHelper.getSvgString('save', { size: 16 }),
        newFile: IconParkHelper.getSvgString('add-one', { size: 16 }),
        newFolder: IconParkHelper.getSvgString('folder-plus', { size: 16 }),
        openFolder: IconParkHelper.getSvgString('folder-open', { size: 16 }),
        refresh: IconParkHelper.getSvgString('refresh', { size: 16 }),
        preview: IconParkHelper.getSvgString('preview-open', { size: 16 }),
        edit: IconParkHelper.getSvgString('edit', { size: 16 }),
        split: IconParkHelper.getSvgString('split', { size: 16 }),
        bold: IconParkHelper.getSvgString('text-bold', { size: 16 }),
        italic: IconParkHelper.getSvgString('text-italic', { size: 16 }),
        strikethrough: IconParkHelper.getSvgString('strikethrough', { size: 16 }),
        heading: IconParkHelper.getSvgString('h', { size: 16 }),
        link: IconParkHelper.getSvgString('link-one', { size: 16 }),
        image: IconParkHelper.getSvgString('pic', { size: 16 }),
        code: IconParkHelper.getSvgString('code', { size: 16 }),
        list: IconParkHelper.getSvgString('list', { size: 16 }),
        listOrdered: IconParkHelper.getSvgString('ordered-list', { size: 16 }),
        quote: IconParkHelper.getSvgString('quote', { size: 16 }),
        table: IconParkHelper.getSvgString('table', { size: 16 }),
        undo: IconParkHelper.getSvgString('undo', { size: 16 }),
        redo: IconParkHelper.getSvgString('redo', { size: 16 }),
        markdown: IconParkHelper.getSvgString('markdown', { size: 16 }),
        close: IconParkHelper.getSvgString('close', { size: 16 }),
        delete: IconParkHelper.getSvgString('delete', { size: 16 }),
        back: IconParkHelper.getSvgString('left', { size: 16 }),
        chevronRight: IconParkHelper.getSvgString('right', { size: 12 }),
        chevronDown: IconParkHelper.getSvgString('down', { size: 12 }),
        warning: IconParkHelper.getSvgString('attention', { size: 20 }),
    };
    
    constructor() {}

    public render(): string {
        return `
            <div class="report-editor-container" id="report-editor-root">
                <!-- 文件侧边栏 -->
                <div class="report-sidebar">
                    <div class="report-sidebar-header">
                        <span>文件列表</span>
                        <div class="sidebar-actions">
                            <button class="icon-btn" id="report-new-file-btn" title="新建文件">${this.icons.newFile}</button>
                            <button class="icon-btn" id="report-new-folder-btn" title="新建文件夹">${this.icons.newFolder}</button>
                            <button class="icon-btn" id="report-open-folder-btn" title="打开文件夹">${this.icons.openFolder}</button>
                            <button class="icon-btn" id="report-refresh-btn" title="刷新">${this.icons.refresh}</button>
                        </div>
                    </div>
                    <div class="report-path-bar" id="report-path-bar" style="display: none;">
                        <button class="icon-btn" id="report-back-btn" title="返回上级">${this.icons.back}</button>
                        <span class="current-path" id="current-path-display"></span>
                    </div>
                    <div class="report-file-list" id="report-file-list">
                        <div class="empty-state">
                            <span class="empty-icon">${this.icons.folder}</span>
                            <p>点击上方按钮打开文件夹</p>
                        </div>
                    </div>
                </div>
                
                <!-- 主编辑区 -->
                <div class="report-main">
                    <!-- 工具栏 -->
                    <div class="report-toolbar">
                        <div class="toolbar-left">
                            <div class="toolbar-group">
                                <button class="toolbar-btn" id="report-save-btn" title="保存 (Ctrl+S)">${this.icons.save}</button>
                                <button class="toolbar-btn" id="report-undo-btn" title="撤销 (Ctrl+Z)">${this.icons.undo}</button>
                                <button class="toolbar-btn" id="report-redo-btn" title="重做 (Ctrl+Y)">${this.icons.redo}</button>
                            </div>
                            <div class="toolbar-separator"></div>
                            <div class="toolbar-group format-tools">
                                <button class="toolbar-btn" data-action="bold" title="粗体 (Ctrl+B)">${this.icons.bold}</button>
                                <button class="toolbar-btn" data-action="italic" title="斜体 (Ctrl+I)">${this.icons.italic}</button>
                                <button class="toolbar-btn" data-action="strikethrough" title="删除线">${this.icons.strikethrough}</button>
                            </div>
                            <div class="toolbar-separator"></div>
                            <div class="toolbar-group">
                                <button class="toolbar-btn" data-action="heading" title="标题">${this.icons.heading}</button>
                                <button class="toolbar-btn" data-action="quote" title="引用">${this.icons.quote}</button>
                                <button class="toolbar-btn" data-action="code" title="代码">${this.icons.code}</button>
                            </div>
                            <div class="toolbar-separator"></div>
                            <div class="toolbar-group">
                                <button class="toolbar-btn" data-action="link" title="链接">${this.icons.link}</button>
                                <button class="toolbar-btn" data-action="image" title="图片">${this.icons.image}</button>
                                <button class="toolbar-btn" data-action="table" title="表格">${this.icons.table}</button>
                            </div>
                            <div class="toolbar-separator"></div>
                            <div class="toolbar-group">
                                <button class="toolbar-btn" data-action="list" title="无序列表">${this.icons.list}</button>
                                <button class="toolbar-btn" data-action="listOrdered" title="有序列表">${this.icons.listOrdered}</button>
                            </div>
                        </div>
                        <div class="toolbar-right">
                            <div class="toolbar-group view-modes">
                                <button class="toolbar-btn active" id="edit-mode-btn" title="编辑模式">${this.icons.edit}</button>
                                <button class="toolbar-btn" id="split-mode-btn" title="分屏模式">${this.icons.split}</button>
                                <button class="toolbar-btn" id="preview-mode-btn" title="预览模式">${this.icons.preview}</button>
                            </div>
                        </div>
                    </div>
                    
                    <!-- 编辑器区域 -->
                    <div class="report-editor-area">
                        <div class="editor-pane" id="editor-pane">
                            <div class="editor-header">
                                <span class="editor-title" id="editor-title">未打开文件</span>
                                <span class="file-modified-indicator" id="file-modified-indicator" style="display: none;">●</span>
                            </div>
                            <div class="markdown-editor-container" id="monaco-editor-container" style="width: 100%; height: 100%;"></div>
                        </div>
                        <div class="preview-pane hidden" id="preview-pane">
                            <div class="preview-header">
                                <span>预览</span>
                            </div>
                            <div class="markdown-preview" id="markdown-preview"></div>
                        </div>
                    </div>
                    
                    <!-- 状态栏 -->
                    <div class="report-statusbar">
                        <div class="statusbar-left">
                            <span class="status-item" id="status-line">行: 1</span>
                            <span class="status-item" id="status-column">列: 1</span>
                            <span class="status-item" id="status-chars">字符: 0</span>
                        </div>
                        <div class="statusbar-right">
                            <span class="status-item">${this.icons.markdown} Markdown</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    public async initialize(container: HTMLElement): Promise<void> {
        this.container = container;
        
        // 获取预览区域
        this.preview = container.querySelector('#markdown-preview');
        
        // 初始化 Monaco Editor
        this.initMonacoEditor();
        
        // 绑定事件
        this.bindEvents();
        
        // 设置默认模式
        this.setViewMode('edit');
        
        // 尝试加载上次打开的目录，如果没有则使用设置中的 markdown 保存路径
        const lastDir = localStorage.getItem('report-editor-last-dir');
        if (lastDir) {
            this.currentDirectory = lastDir;
            this.updatePathBar();
            await this.refreshFileList();
        } else {
            // 尝试从设置获取默认 markdown 保存路径
            try {
                const defaultDir = await invoke<string>('get_markdown_save_path_string');
                if (defaultDir) {
                    this.currentDirectory = defaultDir;
                    localStorage.setItem('report-editor-last-dir', defaultDir);
                    this.updatePathBar();
                    await this.refreshFileList();
                }
            } catch (error) {
                console.log('未设置默认 Markdown 保存路径');
            }
        }
    }

    private rgbToHex(rgb: string): string {
        const result = rgb.match(/\d+/g);
        if (!result || result.length < 3) return rgb;
        const r = parseInt(result[0]);
        const g = parseInt(result[1]);
        const b = parseInt(result[2]);
        return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }

    private updateEditorTheme(): void {
        const style = getComputedStyle(document.documentElement);
        
        const getColor = (varName: string) => {
            const val = style.getPropertyValue(varName).trim();
            if (val.startsWith('#')) return val;
            if (val.startsWith('rgb')) return this.rgbToHex(val);
            return val;
        };

        const bgPrimary = getColor('--bg-primary');
        const textPrimary = getColor('--text-primary');
        const borderColor = getColor('--border-color');
        const primaryColor = getColor('--primary-color');
        
        const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
        const baseTheme = isDark ? 'vs-dark' : 'vs';

        monaco.editor.defineTheme('app-theme', {
            base: baseTheme,
            inherit: true,
            rules: [
                { token: '', foreground: textPrimary, background: bgPrimary }
            ],
            colors: {
                'editor.background': bgPrimary,
                'editor.foreground': textPrimary,
                'editorCursor.foreground': textPrimary,
                'editor.lineHighlightBackground': isDark ? '#ffffff10' : '#00000010',
                'editorLineNumber.foreground': isDark ? '#858585' : '#6e7681',
                'editorIndentGuide.background': borderColor,
                'editor.selectionBackground': primaryColor + '40',
            }
        });
        
        monaco.editor.setTheme('app-theme');
    }

    private initMonacoEditor(): void {
        const editorContainer = this.container?.querySelector('#monaco-editor-container') as HTMLElement;
        if (!editorContainer) return;

        // 销毁旧实例
        if (this.monacoEditor) {
            this.monacoEditor.dispose();
        }

        // 清理旧的观察者
        if (this.themeObserver) {
            this.themeObserver.disconnect();
            this.themeObserver = null;
        }

        // 初始化主题
        this.updateEditorTheme();
        
        // 监听主题变化
        this.themeObserver = new MutationObserver(() => {
            // 如果容器已不在 DOM 中，自动断开连接
            if (this.container && !document.body.contains(this.container)) {
                this.themeObserver?.disconnect();
                this.themeObserver = null;
                return;
            }
            this.updateEditorTheme();
        });
        this.themeObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme', 'style', 'class']
        });

        // 创建新实例
        this.monacoEditor = monaco.editor.create(editorContainer, {
            value: '',
            language: 'markdown',
            theme: 'app-theme', // 使用自定义主题
            automaticLayout: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontSize: 14,
            fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
            wordWrap: 'on',
            lineNumbers: 'on',
            renderLineHighlight: 'all',
            scrollbar: {
                vertical: 'visible',
                horizontal: 'visible',
                useShadows: false,
                verticalScrollbarSize: 10,
                horizontalScrollbarSize: 10
            }
        });

        // 监听内容变化
        this.monacoEditor.onDidChangeModelContent(() => {
            this.handleEditorInput();
        });

        // 监听光标变化
        this.monacoEditor.onDidChangeCursorPosition(() => {
            this.updateCursorPosition();
        });

        // 监听滚动同步
        this.monacoEditor.onDidScrollChange((e) => {
            if (e.scrollTopChanged) {
                this.syncScroll();
            }
        });
    }

    private bindEvents(): void {
        if (!this.container) return;
        
        // 文件操作按钮
        this.container.querySelector('#report-new-file-btn')?.addEventListener('click', () => this.createNewFile());
        this.container.querySelector('#report-new-folder-btn')?.addEventListener('click', () => this.createNewFolder());
        this.container.querySelector('#report-open-folder-btn')?.addEventListener('click', () => this.openFolder());
        this.container.querySelector('#report-refresh-btn')?.addEventListener('click', () => this.refreshFileList());
        this.container.querySelector('#report-back-btn')?.addEventListener('click', () => this.goToParentDirectory());
        this.container.querySelector('#report-save-btn')?.addEventListener('click', () => this.saveFile());
        this.container.querySelector('#report-undo-btn')?.addEventListener('click', () => this.monacoEditor?.trigger('source', 'undo', null));
        this.container.querySelector('#report-redo-btn')?.addEventListener('click', () => this.monacoEditor?.trigger('source', 'redo', null));
        
        // 视图模式按钮
        this.container.querySelector('#edit-mode-btn')?.addEventListener('click', () => this.setViewMode('edit'));
        this.container.querySelector('#split-mode-btn')?.addEventListener('click', () => this.setViewMode('split'));
        this.container.querySelector('#preview-mode-btn')?.addEventListener('click', () => this.setViewMode('preview'));
        
        // 格式化工具按钮
        this.container.querySelectorAll('.toolbar-btn[data-action]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = (e.currentTarget as HTMLElement).getAttribute('data-action');
                if (action) {
                    this.handleFormatAction(action);
                }
            });
        });
        
        // 文件列表点击
        // 文件列表点击 - 树结构
        this.container.querySelector('#report-file-list')?.addEventListener('click', (e) => {
            const treeItem = (e.target as HTMLElement).closest('.tree-item');
            if (treeItem) {
                const path = treeItem.getAttribute('data-path');
                const isFolder = treeItem.classList.contains('folder');
                if (path) {
                    if (isFolder) {
                        // 展开/折叠文件夹
                        this.toggleFolder(path);
                    } else {
                        // 打开文件
                        this.openFile(path);
                    }
                }
            }
        });
        
        // 文件列表右键菜单
        this.container.querySelector('#report-file-list')?.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const treeItem = (e.target as HTMLElement).closest('.tree-item');
            if (treeItem) {
                const path = treeItem.getAttribute('data-path');
                const isDir = treeItem.classList.contains('folder');
                const name = treeItem.querySelector('.file-name')?.textContent || '';
                if (path) {
                    this.showContextMenu(e as MouseEvent, path, isDir, name);
                }
            }
        });
        
        // 点击其他地方关闭右键菜单
        document.addEventListener('click', () => this.hideContextMenu());
        
        // 键盘快捷键
        this.container.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                this.saveFile();
            }
        });
    }

    private handleEditorInput(): void {
        // 标记文件已修改
        if (this.currentFile) {
            this.currentFile.modified = true;
            this.updateModifiedIndicator();
        }
        
        // 更新预览
        this.updatePreview();
        
        // 更新字符统计
        this.updateCharCount();
        
        // 自动保存（延迟）
        this.scheduleAutoSave();
    }

    private updateCharCount(): void {
        const chars = this.monacoEditor?.getValue().length || 0;
        const statusChars = this.container?.querySelector('#status-chars');
        if (statusChars) {
            statusChars.textContent = `字符: ${chars}`;
        }
    }

    private updateCursorPosition(): void {
        if (!this.monacoEditor) return;
        
        const position = this.monacoEditor.getPosition();
        if (!position) return;

        const statusLine = this.container?.querySelector('#status-line');
        const statusColumn = this.container?.querySelector('#status-column');
        
        if (statusLine) statusLine.textContent = `行: ${position.lineNumber}`;
        if (statusColumn) statusColumn.textContent = `列: ${position.column}`;
    }

    private updateModifiedIndicator(): void {
        const indicator = this.container?.querySelector('#file-modified-indicator');
        if (indicator) {
            (indicator as HTMLElement).style.display = this.currentFile?.modified ? 'inline' : 'none';
        }
    }

    private scheduleAutoSave(): void {
        if (this.autoSaveTimer) {
            clearTimeout(this.autoSaveTimer);
        }
        
        this.autoSaveTimer = window.setTimeout(() => {
            // 自动保存逻辑（可选）
        }, 30000);
    }

    private async openFolder(): Promise<void> {
        try {
            const selected = await open({
                directory: true,
                multiple: false,
                title: translate('选择报告文件夹')
            });
            
            if (selected) {
                this.currentDirectory = selected as string;
                localStorage.setItem('report-editor-last-dir', this.currentDirectory);
                this.updatePathBar();
                await this.refreshFileList();
            }
        } catch (error) {
            console.error('打开文件夹失败:', error);
        }
    }

    private async openDirectory(path: string): Promise<void> {
        this.currentDirectory = path;
        localStorage.setItem('report-editor-last-dir', path);
        this.updatePathBar();
        await this.refreshFileList();
    }

    private async refreshFileList(): Promise<void> {
        if (!this.currentDirectory) return;
        
        try {
            const files = await invoke<FileEntry[]>('list_directory_entries', {
                path: this.currentDirectory
            });
            
            // 过滤只显示 Markdown 文件和目录
            this.files = files.filter(f => 
                f.is_dir || 
                f.name.endsWith('.md') || 
                f.name.endsWith('.markdown') ||
                f.name.endsWith('.txt')
            );
            
            this.renderFileList();
        } catch (error) {
            console.error('刷新文件列表失败:', error);
            this.showError('无法加载文件列表');
        }
    }

    private renderFileList(): void {
        const fileList = this.container?.querySelector('#report-file-list');
        if (!fileList) return;
        
        if (this.files.length === 0) {
            fileList.innerHTML = `
                <div class="empty-state">
                    <span class="empty-icon">${this.icons.file}</span>
                    <p>没有找到 Markdown 文件</p>
                </div>
            `;
            return;
        }
        
        // 排序：目录在前，文件在后
        const sorted = [...this.files].sort((a, b) => {
            if (a.is_dir && !b.is_dir) return -1;
            if (!a.is_dir && b.is_dir) return 1;
            return a.name.localeCompare(b.name);
        });
        
        fileList.innerHTML = sorted.map(file => this.renderTreeItem(file, 0)).join('');
    }

    private renderTreeItem(file: FileEntry, depth: number): string {
        const isExpanded = this.expandedFolders.has(file.path);
        const indent = depth * 16;
        
        if (file.is_dir) {
            return `
                <div class="tree-item folder ${isExpanded ? 'expanded' : ''}" 
                     data-path="${file.path}" 
                     data-depth="${depth}"
                     style="padding-left: ${indent + 8}px;">
                    <span class="tree-toggle">${isExpanded ? this.icons.chevronDown : this.icons.chevronRight}</span>
                    <span class="file-icon">${isExpanded ? this.icons.folderOpen : this.icons.folder}</span>
                    <span class="file-name">${file.name}</span>
                </div>
                <div class="tree-children ${isExpanded ? '' : 'hidden'}" data-parent="${file.path}"></div>
            `;
        } else {
            return `
                <div class="tree-item file ${this.currentFile?.path === file.path ? 'active' : ''}" 
                     data-path="${file.path}" 
                     data-depth="${depth}"
                     style="padding-left: ${indent + 24}px;"
                     title="${file.name}">
                    <span class="file-icon">${this.icons.file}</span>
                    <span class="file-name">${file.name}</span>
                </div>
            `;
        }
    }

    private async toggleFolder(path: string): Promise<void> {
        const isExpanded = this.expandedFolders.has(path);
        
        if (isExpanded) {
            this.expandedFolders.delete(path);
            // 折叠子目录
            const childrenContainer = this.container?.querySelector(`.tree-children[data-parent="${path}"]`);
            if (childrenContainer) {
                childrenContainer.classList.add('hidden');
                childrenContainer.innerHTML = '';
            }
            // 更新文件夹图标
            const folderItem = this.container?.querySelector(`.tree-item[data-path="${path}"]`);
            if (folderItem) {
                folderItem.classList.remove('expanded');
                const toggle = folderItem.querySelector('.tree-toggle');
                const icon = folderItem.querySelector('.file-icon');
                if (toggle) toggle.innerHTML = this.icons.chevronRight;
                if (icon) icon.innerHTML = this.icons.folder;
            }
        } else {
            this.expandedFolders.add(path);
            // 加载子目录内容
            try {
                const files = await invoke<FileEntry[]>('list_directory_entries', { path });
                const filteredFiles = files.filter(f => 
                    f.is_dir || 
                    f.name.endsWith('.md') || 
                    f.name.endsWith('.markdown') ||
                    f.name.endsWith('.txt')
                ).sort((a, b) => {
                    if (a.is_dir && !b.is_dir) return -1;
                    if (!a.is_dir && b.is_dir) return 1;
                    return a.name.localeCompare(b.name);
                });
                
                const childrenContainer = this.container?.querySelector(`.tree-children[data-parent="${path}"]`);
                if (childrenContainer) {
                    const depth = parseInt(this.container?.querySelector(`.tree-item[data-path="${path}"]`)?.getAttribute('data-depth') || '0') + 1;
                    childrenContainer.innerHTML = filteredFiles.map(f => this.renderTreeItem(f, depth)).join('');
                    childrenContainer.classList.remove('hidden');
                }
                
                // 更新文件夹图标
                const folderItem = this.container?.querySelector(`.tree-item[data-path="${path}"]`);
                if (folderItem) {
                    folderItem.classList.add('expanded');
                    const toggle = folderItem.querySelector('.tree-toggle');
                    const icon = folderItem.querySelector('.file-icon');
                    if (toggle) toggle.innerHTML = this.icons.chevronDown;
                    if (icon) icon.innerHTML = this.icons.folderOpen;
                }
            } catch (error) {
                console.error('加载目录内容失败:', error);
            }
        }
    }

    private async openFile(path: string): Promise<void> {
        // 检查是否有未保存的更改
        if (this.currentFile?.modified) {
            const confirmed = await this.showConfirmModal(
                '未保存的更改',
                '当前文件有未保存的更改，是否放弃更改并继续？',
                '继续',
                '取消'
            );
            if (!confirmed) return;
        }
        
        try {
            // 使用 markdown_manager 读取文件
            const content = await invoke<string>('read_markdown_file', { filePath: path });
            
            this.currentFile = {
                name: path.split(/[\\/]/).pop() || 'unknown',
                path: path,
                content: content,
                modified: false
            };
            
            // 更新编辑器
            if (this.monacoEditor) {
                this.monacoEditor.setValue(content);
            }
            
            // 更新标题
            const titleEl = this.container?.querySelector('#editor-title');
            if (titleEl) {
                titleEl.textContent = this.currentFile.name;
            }
            
            // 更新预览
            this.updatePreview();
            
            // 更新修改指示器
            this.updateModifiedIndicator();
            
            // 更新文件列表选中状态
            this.renderFileList();
            
            // 更新字符统计
            this.updateCharCount();
        } catch (error) {
            console.error('打开文件失败:', error);
            this.showError('无法打开文件');
        }
    }

    private showNewFileModal(): Promise<string | null> {
        return new Promise((resolve) => {
            const modalHtml = `
                <div class="rep-modal-overlay" id="new-file-modal">
                    <div class="rep-modal">
                        <div class="rep-modal-header">
                            <span class="rep-modal-title">新建文件</span>
                            <button class="rep-modal-close" id="modal-close-btn">
                                ${this.icons.close}
                            </button>
                        </div>
                        <div class="rep-modal-body">
                            <div class="rep-form-group">
                                <label class="rep-form-label">文件名</label>
                                <input type="text" class="rep-form-input" id="new-file-name-input" placeholder="请输入文件名（无需后缀）" value="新报告">
                            </div>
                        </div>
                        <div class="rep-modal-footer">
                            <button class="rep-btn rep-btn-secondary" id="modal-cancel-btn">取消</button>
                            <button class="rep-btn rep-btn-primary" id="modal-confirm-btn">创建</button>
                        </div>
                    </div>
                </div>
            `;

            // Append modal to body
            const modalContainer = document.createElement('div');
            modalContainer.innerHTML = modalHtml;
            document.body.appendChild(modalContainer);

            const modal = modalContainer.querySelector('#new-file-modal') as HTMLElement;
            const input = modalContainer.querySelector('#new-file-name-input') as HTMLInputElement;
            const closeBtn = modalContainer.querySelector('#modal-close-btn');
            const cancelBtn = modalContainer.querySelector('#modal-cancel-btn');
            const confirmBtn = modalContainer.querySelector('#modal-confirm-btn');

            // Focus input
            setTimeout(() => input.focus(), 100);
            input.select();

            const cleanup = () => {
                modal.style.opacity = '0';
                setTimeout(() => {
                    if (document.body.contains(modalContainer)) {
                        document.body.removeChild(modalContainer);
                    }
                }, 200);
            };

            const confirm = () => {
                const value = input.value.trim();
                if (value) {
                    resolve(value);
                    cleanup();
                } else {
                    input.style.borderColor = '#ff4d4f';
                    input.focus();
                }
            };

            const cancel = () => {
                resolve(null);
                cleanup();
            };

            closeBtn?.addEventListener('click', cancel);
            cancelBtn?.addEventListener('click', cancel);
            confirmBtn?.addEventListener('click', confirm);

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') confirm();
                if (e.key === 'Escape') cancel();
            });
            
            // Click outside to close
            modal.addEventListener('click', (e) => {
                if (e.target === modal) cancel();
            });
        });
    }

    private async createNewFile(): Promise<void> {
        const fileName = await this.showNewFileModal();
        if (!fileName) return;
        
        const fullName = fileName.endsWith('.md') ? fileName : `${fileName}.md`;
        
        if (this.currentDirectory) {
            try {
                // 使用 markdown_manager 创建文件，传入目录路径而非完整文件路径
                const savedPath = await invoke<string>('create_markdown_file', {
                    filename: fullName,
                    templateContent: `# ${fileName}\n\n`,
                    customPath: this.currentDirectory
                });
                
                await this.refreshFileList();
                await this.openFile(savedPath);
            } catch (error) {
                console.error('创建文件失败:', error);
                this.showError('无法创建文件');
            }
        } else {
            // 没有打开目录时，使用默认保存路径或保存对话框
            try {
                // 尝试获取默认保存路径
                let defaultDir = '';
                try {
                    defaultDir = await invoke<string>('get_markdown_save_path_string');
                } catch {
                    // 忽略错误
                }
                
                const savePath = await save({
                    defaultPath: defaultDir ? `${defaultDir}/${fullName}` : fullName,
                    filters: [{
                        name: 'Markdown',
                        extensions: ['md', 'markdown']
                    }]
                });
                
                if (savePath) {
                    // 从完整路径提取目录和文件名
                    const pathParts = savePath.split(/[\\/]/);
                    const actualFileName = pathParts.pop() || fullName;
                    const dirPath = pathParts.join('\\');
                    
                    // 使用 write_file_directly 直接写入文件，避免目录混淆
                    await invoke<string>('write_file_directly', {
                        filePath: savePath,
                        content: `# ${fileName}\n\n`
                    });
                    
                    // 设置当前目录并刷新
                    if (dirPath) {
                        this.currentDirectory = dirPath;
                        localStorage.setItem('report-editor-last-dir', dirPath);
                        this.updatePathBar();
                        await this.refreshFileList();
                    }
                    
                    // 打开新创建的文件
                    await this.openFile(savePath);
                }
            } catch (error) {
                console.error('创建文件失败:', error);
            }
        }
    }

    private async saveFile(): Promise<void> {
        if (!this.currentFile) {
            // 另存为
            await this.saveFileAs();
            return;
        }
        
        try {
            const content = this.monacoEditor?.getValue() || '';
            
            // 从完整文件路径提取目录路径
            // 使用更健壮的方式堰取目录
            const pathParts = this.currentFile.path.split(/[\\/]/);
            pathParts.pop(); // 移除文件名
            const dirPath = pathParts.join('\\') || '.';
            
            // 使用 markdown_manager 后端保存
            await invoke('save_markdown_file', {
                fileName: this.currentFile.name,
                content: content,
                customPath: dirPath
            });
            
            this.currentFile.content = content;
            this.currentFile.modified = false;
            this.updateModifiedIndicator();
            
            this.showNotification('文件已保存');
        } catch (error) {
            showFriendlyError(error, '保存报告');
        }
    }

    private async saveFileAs(): Promise<void> {
        try {
            // 获取默认保存路径
            let defaultDir = '';
            try {
                defaultDir = await invoke<string>('get_markdown_save_path_string');
            } catch {
                // 忽略错误，使用空路径
            }
            
            const savePath = await save({
                defaultPath: defaultDir ? `${defaultDir}/report.md` : 'report.md',
                filters: [{
                    name: 'Markdown',
                    extensions: ['md', 'markdown']
                }]
            });
            
            if (savePath) {
                const content = this.monacoEditor?.getValue() || '';
                // 使用更健壮的方式提取文件名和目录
                const pathParts = savePath.split(/[\\/]/);
                const filename = pathParts.pop() || 'report.md';
                const dirPath = pathParts.join('\\') || '.';
                
                // 使用 markdown_manager 后端保存
                await invoke('save_markdown_file', {
                    fileName: filename,
                    content: content,
                    customPath: dirPath
                });
                
                this.currentFile = {
                    name: filename,
                    path: savePath,
                    content: content,
                    modified: false
                };
                
                // 更新标题
                const titleEl = this.container?.querySelector('#editor-title');
                if (titleEl) {
                    titleEl.textContent = this.currentFile.name;
                }
                
                this.updateModifiedIndicator();
                this.showNotification('文件已保存');
            }
        } catch (error) {
            console.error('保存文件失败:', error);
        }
    }

    private setViewMode(mode: 'edit' | 'split' | 'preview'): void {
        const editorPane = this.container?.querySelector('#editor-pane');
        const previewPane = this.container?.querySelector('#preview-pane');
        const editBtn = this.container?.querySelector('#edit-mode-btn');
        const splitBtn = this.container?.querySelector('#split-mode-btn');
        const previewBtn = this.container?.querySelector('#preview-mode-btn');
        
        // 移除所有按钮的 active 类
        editBtn?.classList.remove('active');
        splitBtn?.classList.remove('active');
        previewBtn?.classList.remove('active');
        
        switch (mode) {
            case 'edit':
                editorPane?.classList.remove('hidden');
                previewPane?.classList.add('hidden');
                editBtn?.classList.add('active');
                this.isEditMode = true;
                this.isPreviewMode = false;
                this.isSplitMode = false;
                break;
            case 'split':
                editorPane?.classList.remove('hidden');
                previewPane?.classList.remove('hidden');
                splitBtn?.classList.add('active');
                this.isEditMode = true;
                this.isPreviewMode = true;
                this.isSplitMode = true;
                this.updatePreview();
                break;
            case 'preview':
                editorPane?.classList.add('hidden');
                previewPane?.classList.remove('hidden');
                previewBtn?.classList.add('active');
                this.isEditMode = false;
                this.isPreviewMode = true;
                this.isSplitMode = false;
                this.updatePreview();
                break;
        }

        // 重新布局 Monaco Editor
        if (this.monacoEditor) {
            setTimeout(() => {
                this.monacoEditor?.layout();
            }, 50);
        }
    }

    private updatePreview(): void {
        if (!this.preview || !this.isPreviewMode) return;
        
        const markdown = this.monacoEditor?.getValue() || '';
        const html = this.parseMarkdown(markdown);
        this.preview.innerHTML = html;
    }

    private parseMarkdown(markdown: string): string {
        // 简单的 Markdown 解析器
        let html = markdown;
        
        // 转义 HTML
        html = html.replace(/&/g, '&amp;')
                   .replace(/</g, '&lt;')
                   .replace(/>/g, '&gt;');
        
        // 代码块 (```code```)
        html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
            return `<pre class="code-block"><code class="language-${lang}">${code.trim()}</code></pre>`;
        });
        
        // 行内代码 (`code`)
        html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
        
        // 标题
        html = html.replace(/^###### (.*$)/gm, '<h6>$1</h6>');
        html = html.replace(/^##### (.*$)/gm, '<h5>$1</h5>');
        html = html.replace(/^#### (.*$)/gm, '<h4>$1</h4>');
        html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>');
        html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');
        html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>');
        
        // 粗体
        html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
        
        // 斜体
        html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        html = html.replace(/_([^_]+)_/g, '<em>$1</em>');
        
        // 删除线
        html = html.replace(/~~([^~]+)~~/g, '<del>$1</del>');
        
        // 链接
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
        
        // 图片
        html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="md-image">');
        
        // 引用
        html = html.replace(/^&gt; (.*$)/gm, '<blockquote>$1</blockquote>');
        
        // 无序列表
        html = html.replace(/^\* (.*$)/gm, '<li class="ul-item">$1</li>');
        html = html.replace(/^- (.*$)/gm, '<li class="ul-item">$1</li>');
        
        // 有序列表
        html = html.replace(/^\d+\. (.*$)/gm, '<li class="ol-item">$1</li>');
        
        // 包裹列表项
        html = html.replace(/(<li class="ul-item">.*<\/li>)+/g, '<ul>$&</ul>');
        html = html.replace(/(<li class="ol-item">.*<\/li>)+/g, '<ol>$&</ol>');
        
        // 水平线
        html = html.replace(/^---$/gm, '<hr>');
        html = html.replace(/^\*\*\*$/gm, '<hr>');
        
        // 表格解析
        html = this.parseTable(html);
        
        // 段落 (将剩余文本包裹在 p 标签中)
        html = html.split('\n\n').map(para => {
            if (para.trim() && 
                !para.startsWith('<h') && 
                !para.startsWith('<ul') && 
                !para.startsWith('<ol') && 
                !para.startsWith('<blockquote') &&
                !para.startsWith('<pre') &&
                !para.startsWith('<table') &&
                !para.startsWith('<hr')) {
                return `<p>${para.replace(/\n/g, '<br>')}</p>`;
            }
            return para;
        }).join('\n');
        
        return html;
    }

    private parseTable(html: string): string {
        // 简单的表格解析
        const tableRegex = /^\|(.+)\|\n\|[-| ]+\|\n((?:\|.+\|\n?)+)/gm;
        
        return html.replace(tableRegex, (_, header, body) => {
            const headers = header.split('|').filter((h: string) => h.trim());
            const rows = body.trim().split('\n').map((row: string) => 
                row.split('|').filter((c: string) => c.trim())
            );
            
            let table = '<table class="md-table">';
            table += '<thead><tr>';
            headers.forEach((h: string) => {
                table += `<th>${h.trim()}</th>`;
            });
            table += '</tr></thead>';
            table += '<tbody>';
            rows.forEach((row: string[]) => {
                table += '<tr>';
                row.forEach((cell: string) => {
                    table += `<td>${cell.trim()}</td>`;
                });
                table += '</tr>';
            });
            table += '</tbody></table>';
            
            return table;
        });
    }

    private handleFormatAction(action: string): void {
        if (!this.monacoEditor) return;
        
        const selection = this.monacoEditor.getSelection();
        if (!selection) return;

        const selectedText = this.monacoEditor.getModel()?.getValueInRange(selection) || '';
        
        let insertText = '';
        let cursorOffset = 0;
        
        switch (action) {
            case 'bold':
                insertText = `**${selectedText || '粗体文本'}**`;
                cursorOffset = selectedText ? 0 : -2;
                break;
            case 'italic':
                insertText = `*${selectedText || '斜体文本'}*`;
                cursorOffset = selectedText ? 0 : -1;
                break;
            case 'strikethrough':
                insertText = `~~${selectedText || '删除线文本'}~~`;
                cursorOffset = selectedText ? 0 : -2;
                break;
            case 'heading':
                insertText = `## ${selectedText || '标题'}`;
                cursorOffset = 0;
                break;
            case 'link':
                insertText = `[${selectedText || '链接文本'}](url)`;
                cursorOffset = selectedText ? -1 : -6; // Adjust based on where we want cursor
                break;
            case 'image':
                insertText = `![${selectedText || '图片描述'}](url)`;
                cursorOffset = selectedText ? -1 : -6;
                break;
            case 'code':
                if (selectedText.includes('\n')) {
                    insertText = `\`\`\`\n${selectedText || '代码'}\n\`\`\``;
                } else {
                    insertText = `\`${selectedText || '代码'}\``;
                }
                cursorOffset = selectedText ? 0 : -1; // Simplified
                break;
            case 'quote':
                insertText = `> ${selectedText || '引用文本'}`;
                cursorOffset = 0;
                break;
            case 'list':
                insertText = `- ${selectedText || '列表项'}`;
                cursorOffset = 0;
                break;
            case 'listOrdered':
                insertText = `1. ${selectedText || '列表项'}`;
                cursorOffset = 0;
                break;
            case 'table':
                insertText = `| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| 数据 | 数据 | 数据 |`;
                cursorOffset = 0;
                break;
        }
        
        // Execute edit
        const id = { major: 1, minor: 1 };
        const op = { range: selection, text: insertText, forceMoveMarkers: true };
        this.monacoEditor.executeEdits("my-source", [op]);
        this.monacoEditor.focus();
        
        // Adjust cursor if needed (simplified logic here, can be improved)
        // For now, just focus back.
    }

    private syncScroll(): void {
        if (!this.isSplitMode || !this.monacoEditor || !this.preview) return;
        
        const editorScrollTop = this.monacoEditor.getScrollTop();
        const editorScrollHeight = this.monacoEditor.getScrollHeight();
        const editorClientHeight = this.monacoEditor.getLayoutInfo().height;
        
        const editorScrollRatio = editorScrollTop / (editorScrollHeight - editorClientHeight);
        
        this.preview.scrollTop = editorScrollRatio * (this.preview.scrollHeight - this.preview.clientHeight);
    }

    private showError(message: string): void {
        console.error(message);
        this.showToast(message, 'error');
    }

    private showNotification(message: string): void {
        console.log(message);
        this.showToast(message, 'success');
    }

    private showToast(message: string, type: 'success' | 'error' = 'success'): void {
        // 移除现有的 toast
        const existingToast = document.querySelector('.rep-toast');
        if (existingToast) {
            existingToast.remove();
        }

        const toast = document.createElement('div');
        toast.className = `rep-toast ${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        // 触发动画
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        // 自动消失
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                if (document.body.contains(toast)) {
                    document.body.removeChild(toast);
                }
            }, 200);
        }, 2000);
    }

    // ========== 文件夹操作 ==========
    
    private async createNewFolder(): Promise<void> {
        if (!this.currentDirectory) {
            this.showError('请先打开一个文件夹');
            return;
        }
        
        const folderName = await this.showInputModal('新建文件夹', '文件夹名', '新文件夹');
        if (!folderName) return;
        
        try {
            const folderPath = `${this.currentDirectory}\\${folderName}`;
            await invoke('create_directory', { path: folderPath });
            await this.refreshFileList();
            this.showNotification('文件夹已创建');
        } catch (error) {
            showFriendlyError(error, '创建文件夹');
        }
    }

    private goToParentDirectory(): void {
        if (!this.currentDirectory) return;
        
        const parts = this.currentDirectory.split(/[\\/]/);
        if (parts.length > 1) {
            parts.pop();
            const parentPath = parts.join('\\');
            if (parentPath) {
                this.openDirectory(parentPath);
            }
        }
    }

    private updatePathBar(): void {
        const pathBar = this.container?.querySelector('#report-path-bar') as HTMLElement;
        const pathDisplay = this.container?.querySelector('#current-path-display');
        
        if (pathBar && pathDisplay && this.currentDirectory) {
            pathBar.style.display = 'flex';
            // 显示简短路径
            const parts = this.currentDirectory.split(/[\\/]/);
            const shortPath = parts.length > 2 
                ? `.../${parts.slice(-2).join('/')}`
                : this.currentDirectory;
            pathDisplay.textContent = shortPath;
            pathDisplay.setAttribute('title', this.currentDirectory);
        } else if (pathBar) {
            pathBar.style.display = 'none';
        }
    }

    // ========== 右键菜单 ==========

    private showContextMenu(e: MouseEvent, path: string, isDir: boolean, name: string): void {
        this.hideContextMenu();
        
        const menu = document.createElement('div');
        menu.className = 'rep-context-menu';
        menu.innerHTML = `
            ${isDir ? `
                <div class="context-menu-item" data-action="open">打开文件夹</div>
                <div class="context-menu-separator"></div>
            ` : `
                <div class="context-menu-item" data-action="open">打开文件</div>
                <div class="context-menu-separator"></div>
            `}
            <div class="context-menu-item danger" data-action="delete">删除${isDir ? '文件夹' : ''}</div>
        `;
        
        menu.style.left = `${e.clientX}px`;
        menu.style.top = `${e.clientY}px`;
        
        // 处理菜单项点击
        menu.addEventListener('click', async (event) => {
            const target = event.target as HTMLElement;
            const action = target.getAttribute('data-action');
            
            if (action === 'open') {
                if (isDir) {
                    this.openDirectory(path);
                } else {
                    this.openFile(path);
                }
            } else if (action === 'delete') {
                await this.deleteItem(path, isDir, name);
            }
            
            this.hideContextMenu();
        });
        
        document.body.appendChild(menu);
        
        // 确保菜单不超出屏幕
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            menu.style.left = `${window.innerWidth - rect.width - 10}px`;
        }
        if (rect.bottom > window.innerHeight) {
            menu.style.top = `${window.innerHeight - rect.height - 10}px`;
        }
    }

    private hideContextMenu(): void {
        const existingMenu = document.querySelector('.rep-context-menu');
        if (existingMenu) {
            existingMenu.remove();
        }
    }

    private async deleteItem(path: string, isDir: boolean, name: string): Promise<void> {
        const title = isDir ? '删除文件夹' : '删除文件';
        const message = isDir 
            ? `确定要删除文件夹 "${name}" 及其所有内容吗？此操作不可撤销。`
            : `确定要删除文件 "${name}" 吗？此操作不可撤销。`;
        
        const confirmed = await this.showConfirmModal(title, message, '删除', '取消', true);
        if (!confirmed) return;
        
        try {
            if (isDir) {
                await invoke('delete_directory', { path });
            } else {
                await invoke('delete_markdown_file', { filePath: path });
                // 如果删除的是当前打开的文件，清空编辑器
                if (this.currentFile?.path === path) {
                    this.currentFile = null;
                    this.monacoEditor?.setValue('');
                    const titleEl = this.container?.querySelector('#editor-title');
                    if (titleEl) {
                        titleEl.textContent = '未打开文件';
                    }
                }
            }
            await this.refreshFileList();
            this.showNotification(`已删除 ${name}`);
        } catch (error) {
            showFriendlyError(error, '删除文件');
        }
    }

    // ========== 通用输入模态框 ==========

    private showInputModal(title: string, label: string, defaultValue: string): Promise<string | null> {
        return new Promise((resolve) => {
            const modalHtml = `
                <div class="rep-modal-overlay" id="input-modal">
                    <div class="rep-modal">
                        <div class="rep-modal-header">
                            <span class="rep-modal-title">${title}</span>
                            <button class="rep-modal-close" id="modal-close-btn">
                                ${this.icons.close}
                            </button>
                        </div>
                        <div class="rep-modal-body">
                            <div class="rep-form-group">
                                <label class="rep-form-label">${label}</label>
                                <input type="text" class="rep-form-input" id="input-value" placeholder="请输入${label}" value="${defaultValue}">
                            </div>
                        </div>
                        <div class="rep-modal-footer">
                            <button class="rep-btn rep-btn-secondary" id="modal-cancel-btn">取消</button>
                            <button class="rep-btn rep-btn-primary" id="modal-confirm-btn">确定</button>
                        </div>
                    </div>
                </div>
            `;

            const modalContainer = document.createElement('div');
            modalContainer.innerHTML = modalHtml;
            document.body.appendChild(modalContainer);

            const modal = modalContainer.querySelector('#input-modal') as HTMLElement;
            const input = modalContainer.querySelector('#input-value') as HTMLInputElement;
            const closeBtn = modalContainer.querySelector('#modal-close-btn');
            const cancelBtn = modalContainer.querySelector('#modal-cancel-btn');
            const confirmBtn = modalContainer.querySelector('#modal-confirm-btn');

            setTimeout(() => input.focus(), 100);
            input.select();

            const cleanup = () => {
                modal.style.opacity = '0';
                setTimeout(() => {
                    if (document.body.contains(modalContainer)) {
                        document.body.removeChild(modalContainer);
                    }
                }, 200);
            };

            const confirmAction = () => {
                const value = input.value.trim();
                if (value) {
                    resolve(value);
                    cleanup();
                } else {
                    input.style.borderColor = '#ff4d4f';
                    input.focus();
                }
            };

            const cancel = () => {
                resolve(null);
                cleanup();
            };

            closeBtn?.addEventListener('click', cancel);
            cancelBtn?.addEventListener('click', cancel);
            confirmBtn?.addEventListener('click', confirmAction);

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') confirmAction();
                if (e.key === 'Escape') cancel();
            });
            
            modal.addEventListener('click', (e) => {
                if (e.target === modal) cancel();
            });
        });
    }

    // ========== 确认对话框 ==========

    private showConfirmModal(
        title: string, 
        message: string, 
        confirmText: string = '确定', 
        cancelText: string = '取消',
        isDanger: boolean = false
    ): Promise<boolean> {
        return new Promise((resolve) => {
            const modalHtml = `
                <div class="rep-modal-overlay" id="confirm-modal">
                    <div class="rep-modal rep-confirm-modal">
                        <div class="rep-modal-header">
                            <span class="rep-modal-title">${title}</span>
                            <button class="rep-modal-close" id="confirm-close-btn">
                                ${this.icons.close}
                            </button>
                        </div>
                        <div class="rep-modal-body">
                            <div class="confirm-content">
                                <span class="confirm-icon ${isDanger ? 'danger' : ''}">${this.icons.warning}</span>
                                <p class="confirm-message">${message}</p>
                            </div>
                        </div>
                        <div class="rep-modal-footer">
                            <button class="rep-btn rep-btn-secondary" id="confirm-cancel-btn">${cancelText}</button>
                            <button class="rep-btn ${isDanger ? 'rep-btn-danger' : 'rep-btn-primary'}" id="confirm-ok-btn">${confirmText}</button>
                        </div>
                    </div>
                </div>
            `;

            const modalContainer = document.createElement('div');
            modalContainer.innerHTML = modalHtml;
            document.body.appendChild(modalContainer);

            const modal = modalContainer.querySelector('#confirm-modal') as HTMLElement;
            const closeBtn = modalContainer.querySelector('#confirm-close-btn');
            const cancelBtn = modalContainer.querySelector('#confirm-cancel-btn');
            const confirmBtn = modalContainer.querySelector('#confirm-ok-btn');

            const cleanup = () => {
                modal.style.opacity = '0';
                setTimeout(() => {
                    if (document.body.contains(modalContainer)) {
                        document.body.removeChild(modalContainer);
                    }
                }, 200);
            };

            const confirm = () => {
                resolve(true);
                cleanup();
            };

            const cancel = () => {
                resolve(false);
                cleanup();
            };

            closeBtn?.addEventListener('click', cancel);
            cancelBtn?.addEventListener('click', cancel);
            confirmBtn?.addEventListener('click', confirm);

            // ESC 取消，Enter 确认
            const handleKeydown = (e: KeyboardEvent) => {
                if (e.key === 'Escape') {
                    cancel();
                    document.removeEventListener('keydown', handleKeydown);
                } else if (e.key === 'Enter') {
                    confirm();
                    document.removeEventListener('keydown', handleKeydown);
                }
            };
            document.addEventListener('keydown', handleKeydown);
            
            modal.addEventListener('click', (e) => {
                if (e.target === modal) cancel();
            });

            // 聚焦确认按钮
            setTimeout(() => (confirmBtn as HTMLButtonElement)?.focus(), 100);
        });
    }
}
