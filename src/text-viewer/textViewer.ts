// 使用全局 __TAURI__ 对象来避免模块导入问题

type ViewMode = 'text' | 'hex' | 'binary';

interface SearchOptions {
    caseSensitive: boolean;
    wholeWord: boolean;
    useRegex: boolean;
}

interface SearchMatch {
    lineIndex: number;
    lineNumber: number;
    matchIndex: number;
    startPos: number;
    endPos: number;
    text: string;
    fullLine: string;
    pageNumber: number;
}

interface SearchResults {
    matches: SearchMatch[];
    currentIndex: number;
    totalCount: number;
}

interface HexLine {
    type: 'hex';
    offset: string;
    hex: string;
    ascii: string;
    rawData: Uint8Array;
}

interface BinaryLine {
    type: 'binary';
    offset: string;
    data: string;
    rawData: Uint8Array;
}

type TextLine = string | HexLine | BinaryLine;

interface TextPayloadData {
    type: 'text' | 'binary';
    content: any;
}

interface TextPayload {
    filename?: string;
    path?: string;
    size?: number;
    extension?: string;
    data: TextPayloadData;
}

interface AiMessage {
    role: 'user' | 'assistant';
    content: string;
}

interface AiConversation {
    fileName: string;
    selectedText: string;
    messages: AiMessage[];
}

type SearchOptionKey = keyof SearchOptions;

type Unlisten = () => void;

class TextViewer {
    private textData: TextLine[] | null = null;
    private originalData: string | ArrayBuffer | number[] | null = null;
    private currentViewMode: ViewMode = 'text';
    private currentSearchTerm = '';
    private currentPage = 1;
    private pageSize = 1000;
    private totalPages = 1;
    private fileEncoding = 'utf-8';
    private lineNumbers = true;
    private wordWrap = false;

    private searchOptions: SearchOptions = {
        caseSensitive: false,
        wholeWord: false,
        useRegex: false
    };

    private searchResults: SearchResults = {
        matches: [],
        currentIndex: -1,
        totalCount: 0
    };

    // 插件系统相关
    private selectedText: string | null = null;
    private savedSelectedText: string | null = null;
    private plugins: Map<string, unknown> = new Map();
    private contextMenu: HTMLElement | null = null;

    // 运行时状态
    private originalPayload: TextPayload | null = null;
    private hasReceivedAnyData = false;
    private windowLabel = '';
    private isProcessingContextMenu = false;
    private modalEventListenersSet = false;
    private hasMainTheme = false;

    private aiConversation: AiConversation = {
        fileName: '',
        selectedText: '',
        messages: []
    };

    // 事件处理器引用
    private contextMenuHandler: ((e: MouseEvent) => void) | null = null;
    private documentClickHandler: ((e: MouseEvent) => void) | null = null;
    private menuClickHandler: ((e: MouseEvent) => void) | null = null;

    // 按钮引用
    private searchOptionButtons: Record<SearchOptionKey, HTMLElement | null> | null = null;
    private searchNavigationButtons: { prev: HTMLElement | null; next: HTMLElement | null } | null = null;

    // 定时器与监听器
    private loadingTimeout: ReturnType<typeof setTimeout> | null = null;
    private dataCheckInterval: ReturnType<typeof setInterval> | null = null;
    private unlistenTextData: Unlisten | null = null;
    private unlistenTextDataGeneric: Unlisten | null = null;
    private unlistenSearchQuery: Unlisten | null = null;

    constructor() {
        void this.init();
    }

    async init(): Promise<void> {
        console.log('文本查看器初始化开始...');
        this.createHTML();
        console.log('HTML结构已创建');

        // 步骤1：初始化查看器
        this.updateProgress(20, '初始化查看器', 'step-init');

        await this.setupEventListeners();
        console.log('事件监听器已设置');
        await this.setupWindowControls();
        console.log('窗口控制已设置');
        this.setupScaleControls();
        console.log('缩放控制已设置');
        this.setupSearch();
        this.setupViewModes();
        this.setupPagination();
        this.setupPluginSystem();
        void this.setupThemeSync();

        // 步骤2：等待数据传输
        this.updateProgress(40, '等待数据传输', 'step-wait');
        this.setupDataListener();

        // 确保工具栏始终可见
        setTimeout(() => {
            const toolbar = document.querySelector<HTMLElement>('.text-toolbar');
            if (toolbar) {
                toolbar.style.display = 'flex';
                toolbar.style.visibility = 'visible';
                console.log('工具栏强制显示');
            }
        }, 100);

        console.log('文本查看器初始化完成');
    }

    setupDataListener(): void {
        console.log('开始设置文本数据监听器...');

        // 设置超时检测
        this.setupLoadingTimeout();

        // 监听来自Tauri后端的文本数据
        if (typeof (window as any).__TAURI__ !== 'undefined') {
            // 标记是否收到过数据
            this.hasReceivedAnyData = false;

            // 获取当前窗口标签
            void this.setupWindowSpecificListener();

            console.log('文本数据监听器已设置');

            // 设置重试机制
            this.setupRetryMechanism();

        } else {
            console.warn('Tauri API 不可用，使用模拟数据');
            // 开发模式下的模拟数据
            setTimeout(() => {
                this.handleTextData({
                    filename: "示例文本.txt",
                    path: "/path/to/sample.txt",
                    size: 1024,
                    extension: "txt",
                    data: {
                        type: "text",
                        content: "这是一个示例文本文件\n第二行内容\n第三行内容\n第四行内容"
                    }
                });
            }, 2000);
        }
    }

    handleTextData(payload: TextPayload): void {
        try {
            console.log('收到文本数据:', payload);

            // 标记已收到数据
            this.hasReceivedAnyData = true;

            // 保存原始载荷数据
            this.originalPayload = payload;

            // 更新文件信息
            this.updateTextInfo(payload);

            // 处理文件数据
            if (payload.data.type === 'text') {
                this.originalData = payload.data.content;
                this.loadTextData(payload.data.content);
            } else if (payload.data.type === 'binary') {
                // 将数组转换为ArrayBuffer
                const uint8Array = new Uint8Array(payload.data.content);
                this.originalData = uint8Array.buffer;
                this.loadBinaryData(payload.data.content);
            }
        } catch (error) {
            console.error('处理文本数据失败:', error);
            this.showError('处理文本数据失败: ' + (error as Error).message);
        }
    }

    loadBinaryData(binaryData: number[]): void {
        try {
            console.log('开始加载二进制数据...');
            this.updateProgress(60, '解析二进制数据', 'step-parse');

            // 将二进制数据转换为Uint8Array
            const uint8Array = new Uint8Array(binaryData);
            this.originalData = uint8Array.buffer;

            // 保持默认的文本模式，不自动切换
            // 用户可以手动在工具栏中切换到hex或binary模式
            if (!this.currentViewMode) {
                this.currentViewMode = 'text';
            }
            const viewModeSelect = document.getElementById('view-mode-select') as HTMLSelectElement | null;
            if (viewModeSelect) {
                viewModeSelect.value = this.currentViewMode;
            }
            console.log(`二进制文件，使用${this.currentViewMode}模式显示`);

            this.textData = this.parseArrayBuffer(uint8Array.buffer);

            this.updateProgress(80, '渲染文本内容', 'step-render');

            this.updatePagination();
            this.renderCurrentPage();

            // 隐藏加载界面，显示内容
            this.setElementDisplay('loading', 'none');
            this.setElementDisplay('text-container', 'block');
            this.setElementDisplay('pagination-footer', 'flex');

            this.updateProgress(100, '加载完成', 'step-complete');

            console.log('二进制数据加载完成');
            this.showNotification('二进制文件加载成功', 'success');

            // 确保工具栏可见
            const toolbar = document.querySelector<HTMLElement>('.text-toolbar');
            if (toolbar) {
                toolbar.style.display = 'flex';
                console.log('工具栏已确保可见');
            } else {
                console.error('未找到工具栏元素');
            }

        } catch (error) {
            console.error('加载二进制数据失败:', error);
            this.showError('加载二进制数据失败: ' + (error as Error).message);
        }
    }

    private setElementDisplay(id: string, display: string): void {
        const el = document.getElementById(id);
        if (el) {
            el.style.display = display;
        }
    }

    createHTML(): void {
        const app = document.getElementById('app');
        if (!app) {
            console.error('未找到 #app 容器');
            return;
        }
        app.innerHTML = `
            <!-- 统一标题栏 -->
            <div class="unified-titlebar">
                <div class="unified-titlebar-left">
                    <span class="unified-titlebar-icon"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></span>
                    <span class="unified-titlebar-title">LovelyText</span>
                    <span class="unified-titlebar-subtitle" id="text-info" style="display: none;">
                        <span id="text-filename"></span>
                        <span id="text-stats"></span>
                    </span>
                </div>
                <div class="unified-titlebar-right">
                    <button id="scale-down-btn" class="unified-titlebar-btn" title="缩小界面">
                        <span>-</span>
                    </button>
                    <span id="scale-indicator" style="font-size: 12px; color: var(--text-secondary); padding: 0 8px;">100%</span>
                    <button id="scale-up-btn" class="unified-titlebar-btn" title="放大界面">
                        <span>+</span>
                    </button>
                    <div class="unified-titlebar-separator"></div>
                    <div class="unified-window-controls">
                        <button id="minimize-btn" class="unified-window-btn minimize-btn" title="最小化">
                            <svg width="12" height="12" viewBox="0 0 12 12">
                                <path d="M2 6h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                            </svg>
                        </button>
                        <button id="maximize-btn" class="unified-window-btn maximize-btn" title="最大化">
                            <svg width="12" height="12" viewBox="0 0 12 12">
                                <rect x="2" y="2" width="8" height="8" stroke="currentColor" stroke-width="1.5" fill="none"/>
                            </svg>
                        </button>
                        <button id="close-btn" class="unified-window-btn close-btn" title="关闭">
                            <svg width="12" height="12" viewBox="0 0 12 12">
                                <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>

            <!-- 工具栏 -->
            <div class="text-toolbar">
                <div class="text-search-container">
                    <div class="text-search-box">
                        <span class="text-search-icon"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg></span>
                        <input type="text" id="search-input" class="text-search-input" placeholder="搜索文本...">
                    </div>

                    <!-- 搜索结果统计和导航 -->
                    <div id="search-stats" class="text-search-stats" style="display: none;">
                        <span id="search-stats-text">第 0 项，共 0 项</span>
                        <div class="text-search-navigation">
                            <button id="search-prev-btn" class="text-search-nav-btn" title="上一个匹配项 (Shift+F3)" disabled>
                                <span class="nav-icon">↑</span>
                            </button>
                            <button id="search-next-btn" class="text-search-nav-btn" title="下一个匹配项 (F3)" disabled>
                                <span class="nav-icon">↓</span>
                            </button>
                        </div>
                    </div>

                    <!-- 搜索选项按钮 -->
                    <div class="text-search-options">
                        <button id="case-sensitive-btn" class="text-search-option-btn" title="区分大小写 (Alt+C)" data-option="caseSensitive">
                            <span class="option-icon">Aa</span>
                        </button>
                        <button id="whole-word-btn" class="text-search-option-btn" title="全词匹配 (Alt+W)" data-option="wholeWord">
                            <span class="option-icon">Ab</span>
                        </button>
                        <button id="regex-btn" class="text-search-option-btn" title="使用正则表达式 (Alt+R)" data-option="useRegex">
                            <span class="option-icon">.*</span>
                        </button>
                    </div>
                </div>

                <div class="text-view-modes">
                    <label>查看模式:</label>
                    <select id="view-mode-select" class="text-view-mode-select">
                        <option value="text">文本模式</option>
                        <option value="hex">十六进制</option>
                        <option value="binary">二进制</option>
                    </select>
                </div>

                <div class="text-encoding-selector">
                    <label>编码:</label>
                    <select id="encoding-select" class="text-encoding-select">
                        <option value="utf-8">UTF-8</option>
                        <option value="utf-16le">UTF-16 LE</option>
                        <option value="utf-16be">UTF-16 BE</option>
                        <option value="gbk">GBK</option>
                        <option value="gb2312">GB2312</option>
                        <option value="ascii">ASCII</option>
                        <option value="latin1">Latin-1</option>
                    </select>
                </div>

                <div class="text-display-options">
                    <label>
                        <input type="checkbox" id="line-numbers-toggle" checked> 行号
                    </label>
                    <label>
                        <input type="checkbox" id="word-wrap-toggle"> 自动换行
                    </label>
                </div>

                <div class="text-theme-selector">
                    <label>主题:</label>
                    <select id="theme-select" class="text-theme-select">
                        <option value="light">浅色</option>
                        <option value="dark">深色</option>
                        <option value="sakura">樱花</option>
                    </select>
                </div>

                <div class="text-pagination-controls">
                    <label>每页:</label>
                    <select id="page-size-select" class="text-page-size-select">
                        <option value="500">500 行</option>
                        <option value="1000" selected>1000 行</option>
                        <option value="2000">2000 行</option>
                        <option value="5000">5000 行</option>
                        <option value="10000">10000 行</option>
                    </select>
                </div>
            </div>

            <!-- 主内容区域 -->
            <div class="text-main-content">
                <!-- 加载状态（默认隐藏：本地文本加载很快，无需加载动画） -->
                <div id="loading" class="text-loading" style="display:none">
                    <div class="text-loading-content">
                        <div class="text-loading-icon"><svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>
                        <div class="text-loading-title">正在加载文本数据</div>
                        <div class="text-loading-subtitle" id="loading-subtitle">请稍候，正在准备文本查看器...</div>

                        <div class="text-progress-container">
                            <div class="text-progress-bar" id="progress-bar"></div>
                        </div>

                        <div class="text-progress-text">
                            <span id="progress-status">初始化中...</span>
                            <span class="text-progress-percentage" id="progress-percentage">0%</span>
                        </div>

                        <div class="text-loading-steps" id="loading-steps">
                            <div class="text-loading-step" id="step-init">
                                <div class="text-step-icon">1</div>
                                <div class="text-step-text">初始化查看器</div>
                            </div>
                            <div class="text-loading-step" id="step-wait">
                                <div class="text-step-icon">2</div>
                                <div class="text-step-text">等待数据传输</div>
                            </div>
                            <div class="text-loading-step" id="step-parse">
                                <div class="text-step-icon">3</div>
                                <div class="text-step-text">解析文本数据</div>
                            </div>
                            <div class="text-loading-step" id="step-render">
                                <div class="text-step-icon">4</div>
                                <div class="text-step-text">渲染文本内容</div>
                            </div>
                            <div class="text-loading-step" id="step-complete">
                                <div class="text-step-icon">✓</div>
                                <div class="text-step-text">加载完成</div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 错误状态 -->
                <div id="error" class="text-error" style="display: none;">
                    <h3>加载失败</h3>
                    <p id="error-message">未知错误</p>
                </div>

                <!-- 文本容器 -->
                <div class="text-container" id="text-container" style="display: none;">
                    <div id="text-content" class="text-content-wrapper">
                        <pre id="text-pre" class="text-display"></pre>
                    </div>
                </div>
            </div>

            <!-- 分页控制 -->
            <div id="pagination-footer" class="text-pagination-footer" style="display: none;">
                <div id="pagination-info-text" class="text-pagination-info">
                    显示第 1-1000 行，共 0 行
                </div>

                <div class="text-pagination-nav">
                    <button id="first-page-btn" class="text-pagination-btn small" disabled>首页</button>
                    <button id="prev-page-btn" class="text-pagination-btn small" disabled>上一页</button>

                    <div class="text-page-jump">
                        <span>第</span>
                        <input type="number" id="page-input" class="text-page-input" value="1" min="1">
                        <span>页 / 共 <span id="total-pages">1</span> 页</span>
                        <button id="jump-page-btn" class="text-pagination-btn small">跳转</button>
                    </div>

                    <button id="next-page-btn" class="text-pagination-btn small">下一页</button>
                    <button id="last-page-btn" class="text-pagination-btn small">末页</button>
                </div>
            </div>

            <!-- 右键菜单 -->
            <div id="context-menu" class="text-context-menu">
                <div class="text-context-menu-header">
                    <div class="text-context-menu-title">文本操作</div>
                    <div class="text-context-menu-subtitle" id="context-selection-info">选择操作</div>
                </div>

                <div class="text-context-menu-section">
                    <div class="text-context-menu-item" data-action="copy">
                        <div class="text-context-menu-icon"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg></div>
                        <div class="text-context-menu-text">复制</div>
                        <div class="text-context-menu-shortcut">Ctrl+C</div>
                    </div>
                    <div class="text-context-menu-item" data-action="copy-line">
                        <div class="text-context-menu-icon"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>
                        <div class="text-context-menu-text">复制行</div>
                    </div>
                    <div class="text-context-menu-item" data-action="copy-hex">
                        <div class="text-context-menu-icon"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/></svg></div>
                        <div class="text-context-menu-text">复制为十六进制</div>
                    </div>
                </div>

                <div class="text-context-menu-separator"></div>

                <div class="text-context-menu-section">
                    <div class="text-context-menu-item" data-action="search">
                        <div class="text-context-menu-icon"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg></div>
                        <div class="text-context-menu-text">搜索选中文本</div>
                        <div class="text-context-menu-shortcut">Ctrl+F</div>
                    </div>
                    <div class="text-context-menu-item" data-action="goto-line">
                        <div class="text-context-menu-icon"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg></div>
                        <div class="text-context-menu-text">跳转到行</div>
                        <div class="text-context-menu-shortcut">Ctrl+G</div>
                    </div>
                </div>

                <div class="text-context-menu-separator"></div>

                <div class="text-context-menu-section">
                    <div class="text-context-menu-item" data-action="decode-base64">
                        <div class="text-context-menu-icon"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg></div>
                        <div class="text-context-menu-text">解码Base64</div>
                    </div>
                    <div class="text-context-menu-item" data-action="hex-to-string">
                        <div class="text-context-menu-icon"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg></div>
                        <div class="text-context-menu-text">Hex转字符串</div>
                    </div>
                </div>

                <div class="text-context-menu-separator"></div>

                <div class="text-context-menu-section">
                    <div class="text-context-menu-item" data-action="ai-analyze">
                        <div class="text-context-menu-icon"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="8" width="18" height="12" rx="2"/><path d="M12 2v6M7 13h.01M17 13h.01M9 17h6"/></svg></div>
                        <div class="text-context-menu-text">AI分析选中内容</div>
                    </div>
                </div>
            </div>

            <!-- AI分析模态框 -->
            <div id="aiAnalysisModal" class="ai-analysis-modal" style="display: none;">
                <div class="ai-modal-overlay"></div>
                <div class="ai-modal-content">
                    <div class="ai-modal-header">
                        <div class="ai-modal-title">
                            <span class="ai-modal-icon"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="8" width="18" height="12" rx="2"/><path d="M12 2v6M7 13h.01M17 13h.01M9 17h6"/></svg></span>
                            <span>AI 文本分析</span>
                        </div>
                        <button class="ai-modal-close" id="aiModalClose">✕</button>
                    </div>
                    <div class="ai-modal-body">
                        <div class="ai-analysis-info" id="aiAnalysisInfo">
                            <div class="ai-info-item">
                                <span class="ai-info-label">文件名:</span>
                                <span class="ai-info-value" id="aiFileName">-</span>
                            </div>
                            <div class="ai-info-item">
                                <span class="ai-info-label">选中内容:</span>
                                <span class="ai-info-value" id="aiSelectedText">-</span>
                            </div>
                        </div>
                        <div class="ai-messages-container" id="aiMessagesContainer"></div>
                    </div>
                    <div class="ai-modal-footer">
                        <div class="ai-input-container">
                            <textarea class="ai-input" id="aiInput" placeholder="继续提问..."></textarea>
                            <button class="ai-send-btn" id="aiSendBtn">发送</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 解码结果模态框 -->
            <div id="decode-modal" class="decode-modal">
                <div class="decode-modal-content">
                    <div class="decode-modal-header">
                        <h3 id="decode-modal-title">解码结果</h3>
                        <button id="decode-modal-close" class="decode-modal-close">&times;</button>
                    </div>
                    <div class="decode-modal-body">
                        <div class="decode-result-container">
                            <label class="decode-result-label">原始内容:</label>
                            <div id="decode-original" class="decode-original-text"></div>

                            <label class="decode-result-label">解码结果:</label>
                            <div id="decode-result" class="decode-result-text"></div>
                        </div>
                        <div class="decode-modal-actions">
                            <button id="decode-copy-btn" class="decode-action-btn primary">复制结果</button>
                            <button id="decode-close-btn" class="decode-action-btn secondary">关闭</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async setupEventListeners(): Promise<void> {
        // 确保Tauri API可用
        const tauri = (window as any).__TAURI__;
        if (typeof tauri !== 'undefined') {
            try {
                // 监听窗口关闭事件
                if (tauri.event) {
                    await tauri.event.listen('tauri://close-requested', async () => {
                        console.log('收到窗口关闭请求');
                        try {
                            // 清理资源
                            this.cleanup();

                            if (tauri.window) {
                                const currentWindow = await tauri.window.getCurrent();
                                await currentWindow.close();
                            }
                        } catch (error) {
                            console.error('处理关闭请求失败:', error);
                        }
                    });
                }
            } catch (error) {
                console.error('设置事件监听器失败:', error);
            }
        }
    }

    async setupWindowControls(): Promise<void> {
        try {
            // 使用CSV查看器相同的API调用方式
            const { getCurrentWindow } = (window as any).__TAURI__.window;
            const currentWindow = getCurrentWindow();

            const minimizeBtn = document.getElementById('minimize-btn');
            minimizeBtn?.addEventListener('click', async () => {
                try {
                    await currentWindow.minimize();
                } catch (error) {
                    console.error('最小化窗口失败:', error);
                }
            });

            const maximizeBtn = document.getElementById('maximize-btn');
            maximizeBtn?.addEventListener('click', async () => {
                try {
                    const isMaximized = await currentWindow.isMaximized();
                    if (isMaximized) {
                        await currentWindow.unmaximize();
                    } else {
                        await currentWindow.maximize();
                    }
                } catch (error) {
                    console.error('切换窗口状态失败:', error);
                }
            });

            const closeBtn = document.getElementById('close-btn');
            closeBtn?.addEventListener('click', async () => {
                try {
                    console.log('关闭按钮被点击，使用CSV查看器相同的API');
                    await currentWindow.close();
                } catch (error) {
                    console.error('关闭窗口失败:', error);
                }
            });
        } catch (error) {
            console.error('设置窗口控制失败:', error);
        }
    }

    setupScaleControls(): void {
        let scaleFactor = 1;
        const minScale = 0.25;
        const maxScale = 5.0;
        const scaleFactors = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5];

        const scaleUpBtn = document.getElementById('scale-up-btn');
        const scaleDownBtn = document.getElementById('scale-down-btn');
        const scaleIndicator = document.getElementById('scale-indicator');
        const textContent = document.getElementById('text-content');

        if (!scaleUpBtn || !scaleDownBtn || !textContent) {
            console.error('缩放控制元素未找到');
            return;
        }

        const applyScale = (): void => {
            // 直接应用到文本内容区域
            const textPre = document.getElementById('text-pre');
            if (textPre) {
                textPre.style.transform = `scale(${scaleFactor})`;
                textPre.style.transformOrigin = 'top left';
            }

            // 更新显示
            if (scaleIndicator) {
                scaleIndicator.textContent = Math.round(scaleFactor * 100) + '%';
            }

            (scaleDownBtn as HTMLButtonElement).disabled = scaleFactor <= minScale;
            (scaleUpBtn as HTMLButtonElement).disabled = scaleFactor >= maxScale;

            console.log(`缩放应用: ${Math.round(scaleFactor * 100)}%`);
        };

        // 智能缩放：使用预定义的缩放级别
        const getNextScaleUp = (current: number): number => {
            return scaleFactors.find(scale => scale > current + 0.01) || maxScale;
        };

        const getNextScaleDown = (current: number): number => {
            return scaleFactors.slice().reverse().find(scale => scale < current - 0.01) || minScale;
        };

        scaleUpBtn.addEventListener('click', () => {
            const nextScale = getNextScaleUp(scaleFactor);
            if (nextScale <= maxScale) {
                scaleFactor = nextScale;
                applyScale();
            }
        });

        scaleDownBtn.addEventListener('click', () => {
            const nextScale = getNextScaleDown(scaleFactor);
            if (nextScale >= minScale) {
                scaleFactor = nextScale;
                applyScale();
            }
        });

        // 滚轮缩放支持
        textContent.addEventListener('wheel', (e: WheelEvent) => {
            if (e.ctrlKey) {
                e.preventDefault();

                if (e.deltaY < 0) {
                    // 向上滚动，放大
                    const nextScale = getNextScaleUp(scaleFactor);
                    if (nextScale <= maxScale) {
                        scaleFactor = nextScale;
                        applyScale();
                    }
                } else {
                    // 向下滚动，缩小
                    const nextScale = getNextScaleDown(scaleFactor);
                    if (nextScale >= minScale) {
                        scaleFactor = nextScale;
                        applyScale();
                    }
                }
            }
        });

        // 键盘快捷键
        document.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.ctrlKey) {
                switch (e.key) {
                    case '=':
                    case '+':
                        e.preventDefault();
                        scaleUpBtn.click();
                        break;
                    case '-':
                        e.preventDefault();
                        scaleDownBtn.click();
                        break;
                    case '0':
                        e.preventDefault();
                        scaleFactor = 1;
                        applyScale();
                        break;
                }
            }
        });

        // 初始化
        applyScale();
    }

    setupSearch(): void {
        const searchInput = document.getElementById('search-input') as HTMLInputElement | null;

        // 搜索选项按钮
        const caseSensitiveBtn = document.getElementById('case-sensitive-btn');
        const wholeWordBtn = document.getElementById('whole-word-btn');
        const regexBtn = document.getElementById('regex-btn');

        // 搜索导航按钮
        const searchPrevBtn = document.getElementById('search-prev-btn');
        const searchNextBtn = document.getElementById('search-next-btn');

        if (!searchInput) {
            console.error('搜索输入框未找到');
            return;
        }

        // 保存按钮引用
        this.searchOptionButtons = {
            caseSensitive: caseSensitiveBtn,
            wholeWord: wholeWordBtn,
            useRegex: regexBtn
        };

        this.searchNavigationButtons = {
            prev: searchPrevBtn,
            next: searchNextBtn
        };

        // 搜索输入事件
        searchInput.addEventListener('input', (e: Event) => {
            this.currentSearchTerm = (e.target as HTMLInputElement).value;
            this.performSearch();
        });

        // 搜索选项按钮事件
        caseSensitiveBtn?.addEventListener('click', () => {
            this.toggleSearchOption('caseSensitive');
        });

        wholeWordBtn?.addEventListener('click', () => {
            this.toggleSearchOption('wholeWord');
        });

        regexBtn?.addEventListener('click', () => {
            this.toggleSearchOption('useRegex');
        });

        // 搜索导航按钮事件
        searchPrevBtn?.addEventListener('click', () => {
            this.navigateToSearchResult('prev');
        });

        searchNextBtn?.addEventListener('click', () => {
            this.navigateToSearchResult('next');
        });

        // 键盘快捷键
        document.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.ctrlKey && e.key === 'f') {
                e.preventDefault();
                searchInput.focus();
            } else if (e.key === 'F3') {
                e.preventDefault();
                if (e.shiftKey) {
                    this.navigateToSearchResult('prev');
                } else {
                    this.navigateToSearchResult('next');
                }
            } else if (e.altKey) {
                switch (e.key.toLowerCase()) {
                    case 'c':
                        e.preventDefault();
                        this.toggleSearchOption('caseSensitive');
                        break;
                    case 'w':
                        e.preventDefault();
                        this.toggleSearchOption('wholeWord');
                        break;
                    case 'r':
                        e.preventDefault();
                        this.toggleSearchOption('useRegex');
                        break;
                }
            }
        });

        console.log('搜索功能已初始化，包含高级选项');
    }

    setupViewModes(): void {
        const viewModeSelect = document.getElementById('view-mode-select') as HTMLSelectElement | null;
        const encodingSelect = document.getElementById('encoding-select') as HTMLSelectElement | null;
        const lineNumbersToggle = document.getElementById('line-numbers-toggle') as HTMLInputElement | null;
        const wordWrapToggle = document.getElementById('word-wrap-toggle') as HTMLInputElement | null;

        viewModeSelect?.addEventListener('change', (e: Event) => {
            this.currentViewMode = (e.target as HTMLSelectElement).value as ViewMode;
            console.log('视图模式切换到:', this.currentViewMode);

            // 如果有原始数据，重新解析
            if (this.originalData) {
                if (this.currentViewMode === 'hex' || this.currentViewMode === 'binary') {
                    // Hex/Binary模式需要ArrayBuffer
                    let bufferData: ArrayBuffer | undefined;
                    if (typeof this.originalData === 'string') {
                        console.log('文本模式切换到hex/binary，转换字符串为ArrayBuffer');
                        const encoder = new TextEncoder();
                        const uint8Array = encoder.encode(this.originalData);
                        bufferData = uint8Array.buffer;
                    } else if (this.originalData instanceof ArrayBuffer) {
                        bufferData = this.originalData;
                    } else if (Array.isArray(this.originalData)) {
                        // 二进制数组转ArrayBuffer
                        const uint8Array = new Uint8Array(this.originalData);
                        bufferData = uint8Array.buffer;
                    }

                    if (bufferData) {
                        this.textData = this.parseArrayBuffer(bufferData);
                    }
                } else {
                    // 文本模式
                    if (typeof this.originalData === 'string') {
                        this.textData = this.originalData.split('\n');
                    } else {
                        // 如果原始数据不是字符串，尝试解码
                        console.log('非字符串数据在文本模式下，尝试解码');
                        try {
                            let bufferData: ArrayBuffer | undefined;
                            if (this.originalData instanceof ArrayBuffer) {
                                bufferData = this.originalData;
                            } else if (Array.isArray(this.originalData)) {
                                const uint8Array = new Uint8Array(this.originalData);
                                bufferData = uint8Array.buffer;
                            }

                            if (bufferData) {
                                const decoder = new TextDecoder('utf-8');
                                const text = decoder.decode(bufferData);
                                this.textData = text.split('\n');
                            }
                        } catch (error) {
                            console.error('解码失败:', error);
                            this.textData = ['[无法以文本模式显示二进制数据]'];
                        }
                    }
                }
                this.updatePagination();
            }

            this.renderCurrentPage();

            // 重新更新文件信息，因为行数可能会变化
            if (this.originalPayload) {
                this.updateTextInfo(this.originalPayload);
            }
        });

        encodingSelect?.addEventListener('change', (e: Event) => {
            this.fileEncoding = (e.target as HTMLSelectElement).value;
            console.log('编码切换到:', this.fileEncoding);

            // 如果有原始数据，重新解析并刷新显示
            if (this.originalData) {
                try {
                    if (typeof this.originalData === 'string') {
                        // 如果原始数据是字符串，直接使用
                        this.textData = this.originalData.split('\n');
                    } else if (this.originalData instanceof ArrayBuffer) {
                        // 如果是二进制数据，使用新编码解码
                        if (this.currentViewMode === 'text') {
                            const decoder = new TextDecoder(this.fileEncoding);
                            const text = decoder.decode(this.originalData);
                            this.textData = text.split('\n');
                        } else {
                            // hex/binary模式不受编码影响
                            this.textData = this.parseArrayBuffer(this.originalData);
                        }
                    } else if (Array.isArray(this.originalData)) {
                        // 数组数据转换为ArrayBuffer后解码
                        const uint8Array = new Uint8Array(this.originalData);
                        if (this.currentViewMode === 'text') {
                            const decoder = new TextDecoder(this.fileEncoding);
                            const text = decoder.decode(uint8Array);
                            this.textData = text.split('\n');
                        } else {
                            this.textData = this.parseArrayBuffer(uint8Array.buffer);
                        }
                    }

                    // 重新分页和渲染
                    this.updatePagination();
                    this.renderCurrentPage();

                    // 更新文件信息
                    if (this.originalPayload) {
                        this.updateTextInfo(this.originalPayload);
                    }

                    this.showNotification(`编码已切换到 ${this.fileEncoding}`, 'success');
                    console.log('编码切换完成，重新渲染内容');

                } catch (error) {
                    console.error('编码切换失败:', error);
                    this.showNotification(`编码切换失败: ${(error as Error).message}`, 'error');
                }
            } else {
                this.showNotification(`编码已设置为 ${this.fileEncoding}`, 'info');
            }
        });

        lineNumbersToggle?.addEventListener('change', (e: Event) => {
            this.lineNumbers = (e.target as HTMLInputElement).checked;
            this.renderCurrentPage();
        });

        wordWrapToggle?.addEventListener('change', (e: Event) => {
            this.wordWrap = (e.target as HTMLInputElement).checked;
            const textPre = document.getElementById('text-pre');
            if (textPre) {
                if (this.wordWrap) {
                    textPre.classList.add('word-wrap');
                } else {
                    textPre.classList.remove('word-wrap');
                }
            }
        });

        // 主题切换
        const themeSelect = document.getElementById('theme-select') as HTMLSelectElement | null;
        themeSelect?.addEventListener('change', (e: Event) => {
            this.switchTheme((e.target as HTMLSelectElement).value);
        });

        // 初始化主题
        this.initTheme();
    }

    setupPagination(): void {
        const pageSizeSelect = document.getElementById('page-size-select') as HTMLSelectElement | null;
        const firstPageBtn = document.getElementById('first-page-btn');
        const prevPageBtn = document.getElementById('prev-page-btn');
        const nextPageBtn = document.getElementById('next-page-btn');
        const lastPageBtn = document.getElementById('last-page-btn');
        const jumpPageBtn = document.getElementById('jump-page-btn');

        pageSizeSelect?.addEventListener('change', (e: Event) => {
            this.pageSize = parseInt((e.target as HTMLSelectElement).value);
            this.currentPage = 1;
            this.updatePagination();
            this.renderCurrentPage();
        });

        firstPageBtn?.addEventListener('click', () => this.goToPage(1));
        prevPageBtn?.addEventListener('click', () => this.goToPage(this.currentPage - 1));
        nextPageBtn?.addEventListener('click', () => this.goToPage(this.currentPage + 1));
        lastPageBtn?.addEventListener('click', () => this.goToPage(this.totalPages));
        jumpPageBtn?.addEventListener('click', () => this.jumpToPage());

        // 页码输入框回车跳转
        const pageInput = document.getElementById('page-input');
        pageInput?.addEventListener('keypress', (e: Event) => {
            if ((e as KeyboardEvent).key === 'Enter') {
                this.jumpToPage();
            }
        });
    }

    setupPluginSystem(): void {
        this.setupContextMenu();
        this.setupTextSelection();
        this.setupAiAnalysis();
    }

    setupAiAnalysis(): void {
        // AI 对话历史
        this.aiConversation = {
            fileName: '',
            selectedText: '',
            messages: []
        };

        // 关闭按钮
        const closeBtn = document.getElementById('aiModalClose') as HTMLButtonElement | null;
        if (closeBtn) {
            closeBtn.onclick = () => this.closeAiAnalysis();
        }

        // 发送按钮
        const sendBtn = document.getElementById('aiSendBtn') as HTMLButtonElement | null;
        if (sendBtn) {
            sendBtn.onclick = () => void this.sendAiMessage();
        }

        // 输入框回车发送
        const input = document.getElementById('aiInput') as HTMLTextAreaElement | null;
        if (input) {
            input.addEventListener('keydown', (e: KeyboardEvent) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void this.sendAiMessage();
                }
            });
        }

        // 点击遮罩层关闭
        const modal = document.getElementById('aiAnalysisModal');
        if (modal) {
            modal.addEventListener('click', (e: MouseEvent) => {
                const target = e.target as HTMLElement;
                if (target === modal || target.classList.contains('ai-modal-overlay')) {
                    this.closeAiAnalysis();
                }
            });

            // 阻止点击模态框内容时关闭
            const modalContent = modal.querySelector('.ai-modal-content');
            if (modalContent) {
                modalContent.addEventListener('click', (e: Event) => {
                    e.stopPropagation();
                });
            }
        }
    }

    setupContextMenu(): void {
        const contextMenu = document.getElementById('context-menu');
        const textContent = document.getElementById('text-content');

        if (!contextMenu || !textContent) {
            console.error('右键菜单元素未找到');
            return;
        }

        this.contextMenu = contextMenu;

        // 移除旧的事件监听器（如果存在）
        if (this.contextMenuHandler) {
            textContent.removeEventListener('contextmenu', this.contextMenuHandler);
        }
        if (this.documentClickHandler) {
            document.removeEventListener('click', this.documentClickHandler);
        }
        if (this.menuClickHandler) {
            contextMenu.removeEventListener('click', this.menuClickHandler);
        }

        // 防止重复处理的标志
        this.isProcessingContextMenu = false;

        // 创建新的事件处理器
        this.contextMenuHandler = (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();  // 阻止事件冒泡

            // 防止重复触发
            if (this.isProcessingContextMenu) {
                console.log('正在处理右键菜单，忽略重复事件');
                return;
            }

            this.isProcessingContextMenu = true;
            this.showContextMenu(e.clientX, e.clientY, this.getSelectionText());

            // 重置标志
            setTimeout(() => {
                this.isProcessingContextMenu = false;
            }, 100);
        };

        this.documentClickHandler = (e: MouseEvent) => {
            if (!contextMenu.contains(e.target as Node)) {
                this.hideContextMenu();
            }
        };

        this.menuClickHandler = (e: MouseEvent) => {
            const actionEl = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
            const action = actionEl?.dataset.action;
            if (action) {
                this.handleContextMenuAction(action);
                this.hideContextMenu();
            }
        };

        // 添加事件监听器（只添加一次）
        textContent.addEventListener('contextmenu', this.contextMenuHandler);
        document.addEventListener('click', this.documentClickHandler);
        contextMenu.addEventListener('click', this.menuClickHandler);

        console.log('右键菜单事件监听器已设置');
    }

    setupTextSelection(): void {
        const textContent = document.getElementById('text-content');

        textContent?.addEventListener('mouseup', () => {
            this.selectedText = this.getSelectionText();
        });
    }

    loadTextData(data: string | ArrayBuffer): void {
        try {
            console.log('开始加载文本数据...');
            this.updateProgress(60, '解析文本数据', 'step-parse');

            // 根据数据类型处理
            if (typeof data === 'string') {
                this.originalData = data;
                this.textData = data.split('\n');
            } else if (data instanceof ArrayBuffer) {
                // 处理二进制数据
                this.originalData = data;
                this.textData = this.parseArrayBuffer(data);
            } else {
                throw new Error('不支持的数据格式');
            }

            this.updateProgress(80, '渲染文本内容', 'step-render');
            this.updatePagination();
            this.renderCurrentPage();

            // 隐藏加载界面，显示内容
            this.setElementDisplay('loading', 'none');
            this.setElementDisplay('text-container', 'block');
            this.setElementDisplay('pagination-footer', 'flex');

            this.updateProgress(100, '加载完成', 'step-complete');

            console.log('文本数据加载完成');
            this.showNotification('文本文件加载成功', 'success');

            // 确保工具栏可见
            const toolbar = document.querySelector<HTMLElement>('.text-toolbar');
            if (toolbar) {
                toolbar.style.display = 'flex';
                console.log('工具栏已确保可见');
            } else {
                console.error('未找到工具栏元素');
            }

        } catch (error) {
            console.error('加载文本数据失败:', error);
            this.showError('加载文本数据失败: ' + (error as Error).message);
        }
    }

    parseArrayBuffer(buffer: ArrayBuffer): TextLine[] {
        // 将ArrayBuffer转换为不同格式的文本行
        const uint8Array = new Uint8Array(buffer);
        const lines: TextLine[] = [];

        console.log(`开始解析ArrayBuffer，模式: ${this.currentViewMode}，字节数: ${uint8Array.length}`);

        if (this.currentViewMode === 'hex') {
            // 经典的十六进制模式 - 010 Editor风格
            for (let i = 0; i < uint8Array.length; i += 16) {
                const chunk = uint8Array.slice(i, i + 16);
                const offset = i.toString(16).padStart(8, '0').toUpperCase();

                // 生成十六进制字节，每8个字节用空格分隔
                const hexBytes1 = Array.from(chunk.slice(0, 8)).map((byte, index) => {
                    const hex = byte.toString(16).padStart(2, '0').toUpperCase();
                    const colorClass = this.getByteColorClass(byte);
                    return `<span class="${colorClass}" data-offset="${i + index}" data-byte="${hex}">${hex}</span>`;
                }).join(' ');

                const hexBytes2 = Array.from(chunk.slice(8, 16)).map((byte, index) => {
                    const hex = byte.toString(16).padStart(2, '0').toUpperCase();
                    const colorClass = this.getByteColorClass(byte);
                    return `<span class="${colorClass}" data-offset="${i + 8 + index}" data-byte="${hex}">${hex}</span>`;
                }).join(' ');

                // 组合前后两部分，中间用两个空格分隔
                let hexPart = hexBytes1;
                if (hexBytes2) {
                    hexPart += '  ' + hexBytes2;
                }

                // 确保十六进制部分有固定宽度（用空格填充到49个字符）
                const hexPartText = hexPart.replace(/<[^>]*>/g, ''); // 移除HTML标签计算实际长度
                const paddingNeeded = 49 - hexPartText.length;
                const paddedHexBytes = hexPart + ' '.repeat(Math.max(0, paddingNeeded));

                // 生成ASCII显示
                const ascii = Array.from(chunk).map((byte, index) => {
                    const char = (byte >= 32 && byte <= 126) ? String.fromCharCode(byte) : '.';
                    const colorClass = this.getByteColorClass(byte);
                    return `<span class="${colorClass}" data-offset="${i + index}" data-byte="${byte.toString(16).padStart(2, '0').toUpperCase()}">${this.escapeHtml(char)}</span>`;
                }).join('');

                const hexLine: HexLine = {
                    type: 'hex',
                    offset: offset,
                    hex: paddedHexBytes,
                    ascii: ascii,
                    rawData: chunk
                };

                lines.push(hexLine);

                // 输出前几行的调试信息
                if (lines.length <= 3) {
                    console.log(`Hex行 ${lines.length}: offset=${offset}, hex字节数=${chunk.length}`);
                }
            }
        } else if (this.currentViewMode === 'binary') {
            // 增强的二进制模式
            for (let i = 0; i < uint8Array.length; i += 8) {
                const chunk = uint8Array.slice(i, i + 8);
                const offset = i.toString(16).padStart(8, '0').toUpperCase();

                const binaryBytes = Array.from(chunk).map((byte, index) => {
                    const binary = byte.toString(2).padStart(8, '0');
                    const colorClass = this.getByteColorClass(byte);
                    return `<span class="${colorClass}" data-offset="${i + index}" data-byte="${byte.toString(16).padStart(2, '0').toUpperCase()}">${binary}</span>`;
                }).join(' ');

                lines.push({
                    type: 'binary',
                    offset: offset,
                    data: binaryBytes,
                    rawData: chunk
                });
            }
        } else {
            // 文本模式
            const decoder = new TextDecoder(this.fileEncoding);
            const text = decoder.decode(buffer);
            return text.split('\n');
        }

        return lines;
    }

    // 根据字节值返回颜色类
    getByteColorClass(byte: number): string {
        if (byte === 0x00) return 'byte-null';           // NULL字节
        if (byte === 0xFF) return 'byte-max';            // 最大值字节
        if (byte >= 0x20 && byte <= 0x7E) return 'byte-printable'; // 可打印ASCII
        if (byte >= 0x09 && byte <= 0x0D) return 'byte-whitespace'; // 空白字符
        if (byte >= 0x80) return 'byte-extended';        // 扩展ASCII
        return 'byte-control';                           // 控制字符
    }

    updateTextInfo(payload: TextPayload): void {
        const infoDiv = document.getElementById('text-info');
        const filenameSpan = document.getElementById('text-filename');
        const statsSpan = document.getElementById('text-stats');

        if (!infoDiv || !filenameSpan || !statsSpan) {
            console.error('文件信息元素未找到');
            return;
        }

        // 获取准确的文件名（从完整路径中提取）
        let fileName = payload.filename || '未知文件';
        if (payload.path) {
            // 从路径中提取文件名
            const pathParts = payload.path.replace(/\\/g, '/').split('/');
            fileName = pathParts[pathParts.length - 1] || fileName;
        }

        // 计算准确的文件大小
        let actualFileSize = 0;
        let lineCount = 0;

        if (payload.data && payload.data.type === 'text') {
            // 文本文件：计算字符串的UTF-8字节长度
            const textContent = payload.data.content as string;
            actualFileSize = new TextEncoder().encode(textContent).length;
            lineCount = textContent.split('\n').length;
        } else if (payload.data && payload.data.type === 'binary') {
            // 二进制文件：直接使用数据长度
            actualFileSize = payload.data.content.length;
            lineCount = Math.ceil(payload.data.content.length / 16); // hex模式下每行16字节
        } else if (this.originalData) {
            // 使用原始数据计算大小
            if (typeof this.originalData === 'string') {
                actualFileSize = new TextEncoder().encode(this.originalData).length;
                lineCount = this.originalData.split('\n').length;
            } else if (this.originalData instanceof ArrayBuffer) {
                actualFileSize = this.originalData.byteLength;
                lineCount = Math.ceil(this.originalData.byteLength / 16);
            } else if (Array.isArray(this.originalData)) {
                actualFileSize = this.originalData.length;
                lineCount = Math.ceil(this.originalData.length / 16);
            }
        }

        // 如果无法从数据计算，使用payload提供的大小作为fallback
        const fileSize = actualFileSize || payload.size || 0;

        // 更新显示
        filenameSpan.textContent = fileName;
        statsSpan.textContent = `${this.formatFileSize(fileSize)} • ${lineCount} 行`;

        infoDiv.style.display = 'flex';

        console.log('文件信息已更新:', {
            原始文件名: payload.filename,
            显示文件名: fileName,
            payload大小: payload.size,
            实际计算大小: actualFileSize,
            最终显示大小: fileSize,
            行数: lineCount
        });
    }

    formatFileSize(bytes: number): string {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    updatePagination(): void {
        if (!this.textData) return;

        this.totalPages = Math.ceil(this.textData.length / this.pageSize);

        // 更新分页控制
        const totalPagesEl = document.getElementById('total-pages');
        if (totalPagesEl) totalPagesEl.textContent = String(this.totalPages);
        const pageInput = document.getElementById('page-input') as HTMLInputElement | null;
        if (pageInput) pageInput.max = String(this.totalPages);

        // 更新按钮状态
        const firstBtn = document.getElementById('first-page-btn') as HTMLButtonElement | null;
        const prevBtn = document.getElementById('prev-page-btn') as HTMLButtonElement | null;
        const nextBtn = document.getElementById('next-page-btn') as HTMLButtonElement | null;
        const lastBtn = document.getElementById('last-page-btn') as HTMLButtonElement | null;

        if (firstBtn) firstBtn.disabled = this.currentPage <= 1;
        if (prevBtn) prevBtn.disabled = this.currentPage <= 1;
        if (nextBtn) nextBtn.disabled = this.currentPage >= this.totalPages;
        if (lastBtn) lastBtn.disabled = this.currentPage >= this.totalPages;

        // 更新信息文本
        const startLine = (this.currentPage - 1) * this.pageSize + 1;
        const endLine = Math.min(this.currentPage * this.pageSize, this.textData.length);
        const infoText = document.getElementById('pagination-info-text');
        if (infoText) {
            infoText.textContent = `显示第 ${startLine}-${endLine} 行，共 ${this.textData.length} 行`;
        }
    }

    goToPage(pageNumber: number): void {
        if (pageNumber < 1 || pageNumber > this.totalPages) return;

        this.currentPage = pageNumber;
        const pageInput = document.getElementById('page-input') as HTMLInputElement | null;
        if (pageInput) pageInput.value = String(pageNumber);
        this.updatePagination();
        this.renderCurrentPage();
    }

    jumpToPage(): void {
        const pageInput = document.getElementById('page-input') as HTMLInputElement | null;
        if (!pageInput) return;
        const pageNumber = parseInt(pageInput.value);
        this.goToPage(pageNumber);
    }

    getCurrentPageData(): TextLine[] {
        if (!this.textData) return [];

        const startIndex = (this.currentPage - 1) * this.pageSize;
        const endIndex = startIndex + this.pageSize;
        return this.textData.slice(startIndex, endIndex);
    }

    renderCurrentPage(): void {
        const pageData = this.getCurrentPageData();
        this.renderText(pageData);
    }

    renderText(lines: TextLine[]): void {
        const textPre = document.getElementById('text-pre');
        console.log(`开始渲染文本，行数: ${lines.length}，视图模式: ${this.currentViewMode}`);

        if (!textPre) {
            console.error('找不到text-pre元素');
            return;
        }

        let content = '';
        const startLineNumber = (this.currentPage - 1) * this.pageSize + 1;

        lines.forEach((line, index) => {
            const lineNumber = startLineNumber + index;
            let displayLine = '';

            // 处理不同类型的行数据
            if (typeof line === 'object' && line.type) {
                console.log(`渲染对象类型行: ${line.type}`);
                if (line.type === 'hex') {
                    // 十六进制模式渲染 - 经典格式
                    let hexPart = line.hex;
                    let asciiPart = line.ascii;

                    // 在hex和ascii部分应用搜索高亮
                    if (this.currentSearchTerm) {
                        hexPart = this.highlightSearchInHex(hexPart, this.currentSearchTerm);
                        asciiPart = this.highlightSearchInText(asciiPart, this.currentSearchTerm);
                    }

                    displayLine = `<span class="hex-offset">${line.offset}</span>  <span class="hex-bytes">${hexPart}</span> <span class="hex-separator">|</span><span class="hex-ascii">${asciiPart}</span><span class="hex-separator">|</span>`;
                } else if (line.type === 'binary') {
                    // 二进制模式渲染
                    let binaryData = line.data;

                    // 在二进制数据中应用搜索高亮
                    if (this.currentSearchTerm) {
                        binaryData = this.highlightSearchInText(binaryData, this.currentSearchTerm);
                    }

                    displayLine = `<span class="binary-offset">${line.offset}</span>  <span class="binary-data">${binaryData}</span>`;
                }
            } else {
                // 普通文本模式
                displayLine = this.escapeHtml(line as string);

                // 高亮搜索词
                if (this.currentSearchTerm) {
                    displayLine = this.highlightSearchInText(displayLine, this.currentSearchTerm);
                }
            }

            if (this.lineNumbers) {
                const lineNumStr = lineNumber.toString().padStart(6, ' ');
                content += `<div class="text-line" data-line="${lineNumber}"><span class="line-number">${lineNumStr}</span> <span class="line-content">${displayLine}</span></div>`;
            } else {
                content += `<div class="text-line" data-line="${lineNumber}"><span class="line-content">${displayLine}</span></div>`;
            }
        });

        console.log(`生成的HTML内容长度: ${content.length}`);
        textPre.innerHTML = content;

        // 为hex/binary模式添加交互功能
        if (this.currentViewMode === 'hex' || this.currentViewMode === 'binary') {
            console.log('设置hex/binary交互功能');
            this.setupHexInteractions();
        }

        console.log('文本渲染完成');
    }

    // 设置hex/binary模式的交互功能
    setupHexInteractions(): void {
        const textPre = document.getElementById('text-pre');
        if (!textPre) return;

        // 字节悬停高亮
        textPre.addEventListener('mouseover', (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (target.dataset.offset !== undefined) {
                this.highlightByteGroup(target.dataset.offset);
            }
        });

        textPre.addEventListener('mouseout', () => {
            this.clearByteHighlight();
        });

        // 字节点击显示详细信息
        textPre.addEventListener('click', (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (target.dataset.offset !== undefined && target.dataset.byte !== undefined) {
                this.showByteInfo(target.dataset.offset, target.dataset.byte, e.clientX, e.clientY);
            }
        });
    }

    // 高亮字节组
    highlightByteGroup(offset: string): void {
        const allBytes = document.querySelectorAll(`[data-offset="${offset}"]`);
        allBytes.forEach(byte => {
            byte.classList.add('byte-highlighted');
        });
    }

    // 清除字节高亮
    clearByteHighlight(): void {
        const highlightedBytes = document.querySelectorAll('.byte-highlighted');
        highlightedBytes.forEach(byte => {
            byte.classList.remove('byte-highlighted');
        });
    }

    // 显示字节详细信息
    showByteInfo(offset: string, byteValue: string, x: number, y: number): void {
        // 移除现有的信息框
        const existingInfo = document.getElementById('byte-info-popup');
        if (existingInfo) {
            existingInfo.remove();
        }

        const offsetInt = parseInt(offset);
        const byteInt = parseInt(byteValue, 16);

        const popup = document.createElement('div');
        popup.id = 'byte-info-popup';
        popup.className = 'byte-info-popup';
        popup.innerHTML = `
            <div class="byte-info-header">字节信息</div>
            <div class="byte-info-content">
                <div class="byte-info-row">
                    <span class="byte-info-label">偏移:</span>
                    <span class="byte-info-value">0x${offsetInt.toString(16).padStart(8, '0').toUpperCase()}</span>
                </div>
                <div class="byte-info-row">
                    <span class="byte-info-label">十六进制:</span>
                    <span class="byte-info-value">0x${byteValue}</span>
                </div>
                <div class="byte-info-row">
                    <span class="byte-info-label">十进制:</span>
                    <span class="byte-info-value">${byteInt}</span>
                </div>
                <div class="byte-info-row">
                    <span class="byte-info-label">二进制:</span>
                    <span class="byte-info-value">${byteInt.toString(2).padStart(8, '0')}</span>
                </div>
                <div class="byte-info-row">
                    <span class="byte-info-label">ASCII:</span>
                    <span class="byte-info-value">${(byteInt >= 32 && byteInt <= 126) ? String.fromCharCode(byteInt) : '不可显示'}</span>
                </div>
                <div class="byte-info-row">
                    <span class="byte-info-label">类型:</span>
                    <span class="byte-info-value">${this.getByteTypeDescription(byteInt)}</span>
                </div>
            </div>
        `;

        // 定位弹出框
        popup.style.position = 'fixed';
        popup.style.left = x + 10 + 'px';
        popup.style.top = y + 10 + 'px';
        popup.style.zIndex = '10000';

        document.body.appendChild(popup);

        // 3秒后自动隐藏
        setTimeout(() => {
            if (popup.parentNode) {
                popup.remove();
            }
        }, 3000);

        // 点击其他地方隐藏
        const hidePopup = (e: MouseEvent) => {
            if (!popup.contains(e.target as Node)) {
                popup.remove();
                document.removeEventListener('click', hidePopup);
            }
        };
        setTimeout(() => document.addEventListener('click', hidePopup), 100);
    }

    // 获取字节类型描述
    getByteTypeDescription(byte: number): string {
        if (byte === 0x00) return 'NULL字节';
        if (byte === 0xFF) return '最大值字节';
        if (byte >= 0x20 && byte <= 0x7E) return '可打印ASCII';
        if (byte >= 0x09 && byte <= 0x0D) return '空白字符';
        if (byte >= 0x80) return '扩展ASCII';
        return '控制字符';
    }

    /**
     * 切换搜索选项
     */
    toggleSearchOption(option: SearchOptionKey): void {
        if (!Object.prototype.hasOwnProperty.call(this.searchOptions, option)) {
            console.warn('未知的搜索选项:', option);
            return;
        }

        // 切换选项状态
        this.searchOptions[option] = !this.searchOptions[option];

        // 更新按钮样式
        const button = this.searchOptionButtons?.[option];
        if (button) {
            if (this.searchOptions[option]) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        }

        // 如果有搜索关键词，重新执行搜索
        if (this.currentSearchTerm) {
            this.performSearch();
        }

        console.log(`搜索选项 ${option} 已${this.searchOptions[option] ? '启用' : '禁用'}`);
    }

    /**
     * 执行搜索并统计结果
     */
    performSearch(): void {
        if (!this.textData) return;

        const searchTerm = this.currentSearchTerm.trim();

        if (!searchTerm) {
            // 清空搜索结果
            this.searchResults = {
                matches: [],
                currentIndex: -1,
                totalCount: 0
            };
            this.updateSearchStats();
            this.renderCurrentPage();
            return;
        }

        // 统计所有匹配项
        this.countSearchMatches(searchTerm);

        // 找到当前页面中的第一个匹配项
        this.findCurrentPageMatch();

        this.updateSearchStats();
        this.renderCurrentPage();
    }

    /**
     * 统计搜索匹配项
     */
    countSearchMatches(searchTerm: string): void {
        const matches: SearchMatch[] = [];
        let totalCount = 0;

        try {
            let regex: RegExp;

            if (this.searchOptions.useRegex) {
                const flags = this.searchOptions.caseSensitive ? 'g' : 'gi';
                regex = new RegExp(searchTerm, flags);
            } else {
                let pattern = this.escapeRegex(searchTerm);
                if (this.searchOptions.wholeWord) {
                    pattern = `\\b${pattern}\\b`;
                }
                const flags = this.searchOptions.caseSensitive ? 'g' : 'gi';
                regex = new RegExp(pattern, flags);
            }

            // 遍历所有文本数据
            (this.textData ?? []).forEach((line, lineIndex) => {
                let lineText = '';

                // 处理不同类型的行数据
                if (typeof line === 'object' && line.type) {
                    if (line.type === 'hex') {
                        // 在hex模式下搜索ASCII部分和hex部分
                        lineText = this.extractTextFromHexLine(line);
                    } else if (line.type === 'binary') {
                        lineText = this.extractTextFromBinaryLine(line);
                    }
                } else {
                    lineText = line as string;
                }

                // 查找匹配项
                let match: RegExpExecArray | null;
                const lineRegex = new RegExp(regex.source, regex.flags);
                while ((match = lineRegex.exec(lineText)) !== null) {
                    matches.push({
                        lineIndex: lineIndex,
                        lineNumber: lineIndex + 1,
                        matchIndex: totalCount,
                        startPos: match.index,
                        endPos: match.index + match[0].length,
                        text: match[0],
                        fullLine: lineText,
                        // 计算在哪一页
                        pageNumber: Math.floor(lineIndex / this.pageSize) + 1
                    });
                    totalCount++;

                    // 防止无限循环
                    if (!regex.global) break;
                }
            });

        } catch (error) {
            console.warn('搜索统计失败:', error);
            totalCount = 0;
        }

        this.searchResults = {
            matches: matches,
            currentIndex: totalCount > 0 ? 0 : -1,
            totalCount: totalCount
        };
    }

    /**
     * 找到当前页面中的第一个匹配项
     */
    findCurrentPageMatch(): void {
        if (this.searchResults.totalCount === 0) return;

        const currentPageStart = (this.currentPage - 1) * this.pageSize;
        const currentPageEnd = currentPageStart + this.pageSize - 1;

        // 查找当前页面中的第一个匹配项
        const currentPageMatchIndex = this.searchResults.matches.findIndex(match =>
            match.lineIndex >= currentPageStart && match.lineIndex <= currentPageEnd
        );

        if (currentPageMatchIndex !== -1) {
            this.searchResults.currentIndex = currentPageMatchIndex;
        }
    }

    /**
     * 从hex行中提取可搜索的文本
     */
    extractTextFromHexLine(hexLine: HexLine): string {
        // 提取ASCII部分的文本内容（去除HTML标签）
        const asciiText = hexLine.ascii ? hexLine.ascii.replace(/<[^>]*>/g, '') : '';
        // 也可以搜索hex部分
        const hexText = hexLine.hex ? hexLine.hex.replace(/<[^>]*>/g, '') : '';
        return asciiText + ' ' + hexText;
    }

    /**
     * 从binary行中提取可搜索的文本
     */
    extractTextFromBinaryLine(binaryLine: BinaryLine): string {
        return binaryLine.data ? binaryLine.data.replace(/<[^>]*>/g, '') : '';
    }

    /**
     * 更新搜索统计显示
     */
    updateSearchStats(): void {
        const searchStats = document.getElementById('search-stats');
        const searchStatsText = document.getElementById('search-stats-text');

        if (!searchStats || !searchStatsText) return;

        if (this.searchResults.totalCount > 0) {
            const currentIndex = this.searchResults.currentIndex + 1;
            searchStatsText.textContent = `第 ${currentIndex} 项，共 ${this.searchResults.totalCount} 项`;
            searchStats.style.display = 'flex';

            // 更新导航按钮状态
            this.updateSearchNavigationButtons();
        } else if (this.currentSearchTerm.trim()) {
            searchStatsText.textContent = '无匹配项';
            searchStats.style.display = 'flex';

            // 禁用导航按钮
            this.updateSearchNavigationButtons(true);
        } else {
            searchStats.style.display = 'none';
        }
    }

    /**
     * 更新搜索导航按钮状态
     */
    updateSearchNavigationButtons(disabled = false): void {
        const prevBtn = this.searchNavigationButtons?.prev as HTMLButtonElement | null | undefined;
        const nextBtn = this.searchNavigationButtons?.next as HTMLButtonElement | null | undefined;

        if (!prevBtn || !nextBtn) return;

        if (disabled || this.searchResults.totalCount === 0) {
            prevBtn.disabled = true;
            nextBtn.disabled = true;
        } else {
            prevBtn.disabled = false;
            nextBtn.disabled = false;
        }
    }

    /**
     * 导航到搜索结果
     */
    navigateToSearchResult(direction: 'prev' | 'next'): void {
        if (this.searchResults.totalCount === 0) {
            console.log('没有搜索结果可导航');
            return;
        }

        const currentIndex = this.searchResults.currentIndex;
        let newIndex: number;

        if (direction === 'next') {
            newIndex = (currentIndex + 1) % this.searchResults.totalCount;
        } else if (direction === 'prev') {
            newIndex = currentIndex <= 0 ? this.searchResults.totalCount - 1 : currentIndex - 1;
        } else {
            return;
        }

        this.searchResults.currentIndex = newIndex;
        const match = this.searchResults.matches[newIndex];

        if (match) {
            // 跳转到包含匹配项的页面
            this.navigateToMatch(match);

            // 更新统计显示
            this.updateSearchStats();

            console.log(`导航到搜索结果 ${newIndex + 1}/${this.searchResults.totalCount}，行号: ${match.lineNumber}`);
        }
    }

    /**
     * 跳转到指定的匹配项
     */
    navigateToMatch(match: SearchMatch): void {
        const targetPage = match.pageNumber;

        // 如果不在当前页，跳转到目标页
        if (this.currentPage !== targetPage) {
            this.goToPage(targetPage);
        }

        // 等待页面渲染完成后滚动到匹配项
        setTimeout(() => {
            this.scrollToMatch(match);
        }, 100);
    }

    /**
     * 滚动到指定的匹配项并高亮显示
     */
    scrollToMatch(match: SearchMatch): void {
        // 查找对应的行元素
        const lineElement = document.querySelector(`[data-line="${match.lineNumber}"]`);

        if (lineElement) {
            // 滚动到该行
            lineElement.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });

            // 添加临时高亮效果
            lineElement.classList.add('current-search-match');

            // 移除之前的高亮
            document.querySelectorAll('.current-search-match').forEach(el => {
                if (el !== lineElement) {
                    el.classList.remove('current-search-match');
                }
            });

            // 3秒后移除高亮效果
            setTimeout(() => {
                lineElement.classList.remove('current-search-match');
            }, 3000);

            console.log(`已滚动到行 ${match.lineNumber}`);
        } else {
            console.warn(`未找到行元素: ${match.lineNumber}`);
        }
    }

    highlightSearchTerm(): void {
        if (!this.textData) return;
        this.renderCurrentPage();
    }

    escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    escapeRegex(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * 在文本中高亮搜索词
     */
    highlightSearchInText(text: string, searchTerm: string): string {
        if (!searchTerm || !text) return text;

        try {
            let regex: RegExp;

            if (this.searchOptions.useRegex) {
                // 正则表达式模式
                const flags = this.searchOptions.caseSensitive ? 'g' : 'gi';
                regex = new RegExp(`(${searchTerm})`, flags);
            } else {
                // 普通搜索模式
                let pattern = this.escapeRegex(searchTerm);

                if (this.searchOptions.wholeWord) {
                    // 全词匹配：添加单词边界
                    pattern = `\\b${pattern}\\b`;
                }

                const flags = this.searchOptions.caseSensitive ? 'g' : 'gi';
                regex = new RegExp(`(${pattern})`, flags);
            }

            return text.replace(regex, '<mark class="search-highlight">$1</mark>');

        } catch (error) {
            // 如果正则表达式无效，回退到普通搜索
            console.warn('搜索表达式无效，回退到普通搜索:', error);
            const flags = this.searchOptions.caseSensitive ? 'g' : 'gi';
            const escapedTerm = this.escapeRegex(searchTerm);
            const regex = new RegExp(`(${escapedTerm})`, flags);
            return text.replace(regex, '<mark class="search-highlight">$1</mark>');
        }
    }

    /**
     * 在十六进制数据中高亮搜索词
     */
    highlightSearchInHex(hexText: string, searchTerm: string): string {
        if (!searchTerm || !hexText) return hexText;

        // 对于hex模式，支持搜索十六进制值
        try {
            // 如果搜索词看起来像十六进制（只包含0-9, A-F, a-f）
            if (/^[0-9A-Fa-f\s]+$/.test(searchTerm.trim())) {
                // 移除空格并转换为大写
                const cleanHexTerm = searchTerm.replace(/\s+/g, '').toUpperCase();

                if (cleanHexTerm.length > 0) {
                    // 在hex文本中搜索（保持HTML标签结构）
                    const flags = this.searchOptions.caseSensitive ? 'g' : 'gi';
                    const regex = new RegExp(`(${this.escapeRegex(cleanHexTerm)})`, flags);
                    return hexText.replace(regex, '<mark class="search-highlight">$1</mark>');
                }
            }

            // 如果不是十六进制格式，尝试普通文本搜索
            return this.highlightSearchInText(hexText, searchTerm);

        } catch (error) {
            console.warn('Hex搜索失败，回退到普通搜索:', error);
            return this.highlightSearchInText(hexText, searchTerm);
        }
    }

    getSelectionText(): string {
        return window.getSelection()?.toString() ?? '';
    }

    showContextMenu(x: number, y: number, selectedText: string): void {
        const contextMenu = document.getElementById('context-menu');
        const selectionInfo = document.getElementById('context-selection-info');
        if (!contextMenu) return;

        // 保存选中的文本，因为点击菜单时选择会丢失
        this.savedSelectedText = selectedText;

        // 更新选择信息
        if (selectionInfo) {
            if (selectedText) {
                selectionInfo.textContent = `已选择: "${selectedText.substring(0, 20)}${selectedText.length > 20 ? '...' : ''}"`;
            } else {
                selectionInfo.textContent = '右键菜单';
            }
        }

        // 根据是否有选中文本来启用/禁用菜单项
        this.updateContextMenuItems(selectedText);

        // 先显示菜单以获取其尺寸
        contextMenu.style.left = `${x}px`;
        contextMenu.style.top = `${y}px`;
        contextMenu.classList.add('show');

        // 获取菜单和窗口的尺寸
        const menuRect = contextMenu.getBoundingClientRect();
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;

        // 调整水平位置，防止超出右边界
        let finalX = x;
        if (x + menuRect.width > windowWidth) {
            finalX = windowWidth - menuRect.width - 10; // 留10px边距
        }

        // 调整垂直位置，防止超出底部边界
        let finalY = y;
        if (y + menuRect.height > windowHeight) {
            // 如果菜单会超出底部，则向上显示
            finalY = y - menuRect.height;
            // 如果向上显示还是会超出顶部，则贴着底部显示
            if (finalY < 0) {
                finalY = windowHeight - menuRect.height - 10; // 留10px边距
            }
        }

        // 应用最终位置
        contextMenu.style.left = `${finalX}px`;
        contextMenu.style.top = `${finalY}px`;

        console.log('显示右键菜单，保存的选中文本:', this.savedSelectedText);
        console.log(`菜单位置调整: (${x}, ${y}) -> (${finalX}, ${finalY}), 菜单尺寸: ${menuRect.width}x${menuRect.height}`);
    }

    // 更新右键菜单项的可用状态
    updateContextMenuItems(selectedText: string): void {
        const hasSelection = selectedText && selectedText.trim().length > 0;

        // 需要选中文本才能使用的菜单项
        const selectionRequiredItems = [
            'copy',
            'copy-hex',
            'search',
            'decode-base64',
            'hex-to-string',
            'ai-analyze'
        ];

        selectionRequiredItems.forEach(action => {
            const menuItem = document.querySelector(`[data-action="${action}"]`);
            if (menuItem) {
                if (hasSelection) {
                    menuItem.classList.remove('disabled');
                } else {
                    menuItem.classList.add('disabled');
                }
            }
        });
    }

    hideContextMenu(): void {
        const contextMenu = document.getElementById('context-menu');
        contextMenu?.classList.remove('show');

        // 清理保存的选中文本
        this.savedSelectedText = null;
    }

    handleContextMenuAction(action: string): void {
        // 使用保存的选中文本，而不是当前选择（因为点击菜单时选择会丢失）
        const selectedText = this.savedSelectedText || this.getSelectionText();

        // 检查菜单项是否被禁用
        const menuItem = document.querySelector(`[data-action="${action}"]`);
        if (menuItem && menuItem.classList.contains('disabled')) {
            console.log('菜单项被禁用:', action);
            return;
        }

        console.log('执行菜单操作:', action, '保存的选中文本:', this.savedSelectedText, '当前选中文本:', this.getSelectionText());

        switch (action) {
            case 'copy':
                if (selectedText) {
                    void this.copyToClipboard(selectedText);
                }
                break;
            case 'copy-line':
                // 复制当前行
                break;
            case 'copy-hex':
                if (selectedText) {
                    const hexText = Array.from(selectedText)
                        .map(char => char.charCodeAt(0).toString(16).padStart(2, '0'))
                        .join(' ');
                    void this.copyToClipboard(hexText);
                }
                break;
            case 'search':
                if (selectedText) {
                    const searchInput = document.getElementById('search-input') as HTMLInputElement | null;
                    if (searchInput) searchInput.value = selectedText;
                    this.currentSearchTerm = selectedText;
                    this.highlightSearchTerm();
                }
                break;
            case 'goto-line':
                this.showGotoLineDialog();
                break;
            case 'decode-base64':
                if (selectedText) {
                    console.log('开始Base64解码:', selectedText);
                    this.decodeBase64(selectedText);
                } else {
                    console.log('没有选中文本，无法进行Base64解码');
                }
                break;
            case 'hex-to-string':
                if (selectedText) {
                    console.log('开始Hex转字符串:', selectedText);
                    this.hexToString(selectedText);
                } else {
                    console.log('没有选中文本，无法进行Hex转字符串');
                }
                break;
            case 'ai-analyze':
                if (selectedText) {
                    console.log('开始AI分析:', selectedText);
                    void this.showAiAnalysis(selectedText);
                } else {
                    console.log('没有选中文本，无法进行AI分析');
                }
                break;
        }
    }

    showGotoLineDialog(): void {
        const lineNumber = prompt('跳转到行号:', String(this.currentPage));
        if (lineNumber && !isNaN(Number(lineNumber))) {
            const line = parseInt(lineNumber);
            const page = Math.ceil(line / this.pageSize);
            this.goToPage(page);
        }
    }

    /**
     * 显示AI分析模态框
     */
    async showAiAnalysis(selectedText: string): Promise<void> {
        const modal = document.getElementById('aiAnalysisModal');
        const messagesContainer = document.getElementById('aiMessagesContainer');
        const fileNameEl = document.getElementById('aiFileName');
        const selectedTextEl = document.getElementById('aiSelectedText');

        if (!modal || !messagesContainer || !fileNameEl || !selectedTextEl) {
            console.error('AI分析模态框元素未找到');
            return;
        }

        // 获取文件名
        const fileName = this.originalPayload?.filename || '未知文件';

        // 更新信息显示
        fileNameEl.textContent = fileName;
        const displayText = selectedText.length > 100
            ? selectedText.substring(0, 100) + '...'
            : selectedText;
        selectedTextEl.textContent = displayText;

        // 初始化对话
        this.aiConversation = {
            fileName: fileName,
            selectedText: selectedText,
            messages: []
        };

        // 清空消息容器
        messagesContainer.innerHTML = '';

        // 显示模态框
        modal.style.display = 'flex';

        // 自动发送初始分析请求
        const initialPrompt = `你是一个Windows内存取证分析专家。请分析以下文本内容：

文件名: ${fileName}
选中内容:
${selectedText}

请提供专业的分析，包括：
1. 这段文本的含义和重要性
2. 可能的安全隐患或异常行为
3. 建议的进一步调查方向

请用简洁专业的语言回答。`;

        await this.sendAiAnalysisRequest(initialPrompt, true);
    }

    /**
     * 关闭AI分析模态框
     */
    closeAiAnalysis(): void {
        const modal = document.getElementById('aiAnalysisModal');
        if (modal) modal.style.display = 'none';

        // 清空对话历史
        this.aiConversation = {
            fileName: '',
            selectedText: '',
            messages: []
        };
    }

    /**
     * 发送AI消息
     */
    async sendAiMessage(): Promise<void> {
        const input = document.getElementById('aiInput') as HTMLTextAreaElement | null;
        if (!input) return;
        const message = input.value.trim();

        if (!message) {
            return;
        }

        // 清空输入框
        input.value = '';

        // 发送请求
        await this.sendAiAnalysisRequest(message, false);
    }

    /**
     * 发送AI分析请求
     */
    async sendAiAnalysisRequest(prompt: string, isInitial = false): Promise<void> {
        const messagesContainer = document.getElementById('aiMessagesContainer');
        if (!messagesContainer) return;

        try {
            // 添加用户消息到对话历史
            this.aiConversation.messages.push({
                role: 'user',
                content: prompt
            });

            // 显示用户消息（非初始请求时）
            if (!isInitial) {
                const userMsgDiv = document.createElement('div');
                userMsgDiv.className = 'ai-message ai-message-user';
                userMsgDiv.innerHTML = `
                    <div class="ai-message-content">
                        ${this.escapeHtml(prompt)}
                    </div>
                `;
                messagesContainer.appendChild(userMsgDiv);
            }

            // 创建AI响应消息容器
            const aiMsgDiv = document.createElement('div');
            aiMsgDiv.className = 'ai-message ai-message-assistant';
            aiMsgDiv.innerHTML = `
                <div class="ai-message-content">
                    <div class="ai-loading">正在分析...</div>
                </div>
            `;
            messagesContainer.appendChild(aiMsgDiv);

            // 滚动到底部
            messagesContainer.scrollTop = messagesContainer.scrollHeight;

            const contentDiv = aiMsgDiv.querySelector<HTMLElement>('.ai-message-content');
            if (!contentDiv) return;

            // 调用流式API
            await this.streamAiResponse(prompt, contentDiv);

            // 滚动到底部
            messagesContainer.scrollTop = messagesContainer.scrollHeight;

        } catch (error) {
            console.error('AI分析失败:', error);
            this.showNotification('AI分析失败: ' + (error as Error).message, 'error');
        }
    }

    /**
     * 流式输出AI响应（使用Tauri后端避免CORS）
     */
    async streamAiResponse(_prompt: string, contentDiv: HTMLElement): Promise<void> {
        try {
            const { invoke } = (window as any).__TAURI__.core;

            // 获取AI设置
            const settings = await invoke('load_settings_command');
            const currentProvider = await invoke('get_current_ai_provider');

            let aiSettings: any;
            if (currentProvider && currentProvider.enabled) {
                aiSettings = {
                    base_url: currentProvider.base_url,
                    model: currentProvider.model,
                    api_key: currentProvider.api_key,
                    custom_prompt: currentProvider.custom_prompt || ''
                };
                console.log('[AI分析] 使用提供商:', currentProvider.name);
            } else {
                aiSettings = settings.ai_settings;
                console.log('[AI分析] 使用默认配置');
            }

            if (!aiSettings || !aiSettings.api_key) {
                throw new Error('请先在设置中配置AI参数');
            }

            console.log('[AI分析] Base URL:', aiSettings.base_url);
            console.log('[AI分析] Model:', aiSettings.model);

            // 构建完整的消息内容（包含历史）
            let fullMessage = '';
            for (const msg of this.aiConversation.messages) {
                if (msg.role === 'user') {
                    fullMessage += `用户: ${msg.content}\n\n`;
                } else {
                    fullMessage += `助手: ${msg.content}\n\n`;
                }
            }

            console.log('[AI分析] 消息历史:', this.aiConversation.messages.length, '条');

            // 使用 Tauri 后端的流式 API（避免 CORS）
            const { listen } = (window as any).__TAURI__.event;
            const { getCurrentWebviewWindow } = (window as any).__TAURI__.webviewWindow;

            // 获取当前窗口标签
            const currentWindow = getCurrentWebviewWindow();
            const windowLabel = currentWindow.label;

            console.log('[AI分析] 窗口标签:', windowLabel);

            let fullContent = '';
            let streamListenerUnsubscribe: Unlisten | null = null;
            let endListenerUnsubscribe: Unlisten | null = null;
            let errorListenerUnsubscribe: Unlisten | null = null;

            // 创建 Promise 来等待流式响应完成
            const streamPromise = new Promise<string>((resolve, reject) => {
                // 监听流式内容块
                listen('ai-stream-chunk', (event: { payload: string }) => {
                    const chunk = event.payload;
                    console.log('[AI分析] 接收内容块:', chunk);
                    fullContent += chunk;
                    contentDiv.innerHTML = this.formatMessageContent(fullContent);

                    // 自动滚动
                    const messagesContainer = document.getElementById('aiMessagesContainer');
                    if (messagesContainer) {
                        messagesContainer.scrollTop = messagesContainer.scrollHeight;
                    }
                }).then((unsubscribe: Unlisten) => {
                    streamListenerUnsubscribe = unsubscribe;
                });

                // 监听流式结束
                listen('ai-stream-end', () => {
                    console.log('[AI分析] 流式传输完成，总长度:', fullContent.length);
                    resolve(fullContent);
                }).then((unsubscribe: Unlisten) => {
                    endListenerUnsubscribe = unsubscribe;
                });

                // 监听流式错误
                listen('ai-stream-error', (event: { payload: string }) => {
                    console.error('[AI分析] 流式错误:', event.payload);
                    reject(new Error(event.payload));
                }).then((unsubscribe: Unlisten) => {
                    errorListenerUnsubscribe = unsubscribe;
                });
            });

            // 调用后端流式 API (使用V2版本)
            const requestData = {
                message: fullMessage,
                ai_settings: aiSettings,
                context: {
                    selected_files: [],
                    selected_text: ''
                },
                history: []  // V2 版本需要 history 字段
            };

            console.log('[AI分析] 发送请求到后端');

            await invoke('call_ai_api_stream_v2', {
                request: requestData,
                windowLabel: windowLabel
            });

            // 等待流式响应完成
            await streamPromise;

            // 清理监听器
            if (streamListenerUnsubscribe) (streamListenerUnsubscribe as Unlisten)();
            if (endListenerUnsubscribe) (endListenerUnsubscribe as Unlisten)();
            if (errorListenerUnsubscribe) (errorListenerUnsubscribe as Unlisten)();

            console.log('[AI分析] 完整响应长度:', fullContent.length, '字符');

            if (fullContent.length === 0) {
                console.warn('[AI分析] 警告：未接收到任何内容');
                throw new Error('未接收到AI响应内容，请检查API配置');
            }

            // 保存AI响应到对话历史
            this.aiConversation.messages.push({
                role: 'assistant',
                content: fullContent
            });

        } catch (error) {
            console.error('[AI分析] 错误:', error);
            throw error;
        }
    }

    /**
     * 格式化消息内容（支持Markdown）
     */
    formatMessageContent(content: string): string {
        // 简单的Markdown格式化
        let formatted = this.escapeHtml(content);

        // 代码块
        formatted = formatted.replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');

        // 行内代码
        formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');

        // 加粗
        formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

        // 斜体
        formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');

        // 换行
        formatted = formatted.replace(/\n/g, '<br>');

        return formatted;
    }

    async copyToClipboard(text: string): Promise<void> {
        try {
            await navigator.clipboard.writeText(text);
            this.showNotification('已复制到剪贴板', 'success');
        } catch (err) {
            console.error('复制失败:', err);
            this.showNotification('复制失败', 'error');
        }
    }

    // Base64解码功能
    decodeBase64(text: string): void {
        try {
            // 清理输入文本，移除空白字符
            const cleanText = text.replace(/\s+/g, '');

            // 验证Base64格式
            if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleanText)) {
                this.showDecodeModal('Base64解码', text, '错误：不是有效的Base64格式');
                return;
            }

            // 解码Base64
            const decoded = atob(cleanText);
            this.showDecodeModal('Base64解码', text, decoded);

        } catch (error) {
            console.error('Base64解码失败:', error);
            this.showDecodeModal('Base64解码', text, `解码失败：${(error as Error).message}`);
        }
    }

    // Hex转字符串功能
    hexToString(text: string): void {
        try {
            // 清理输入文本，移除空白字符和常见分隔符
            const cleanText = text.replace(/[\s\-:]/g, '');

            // 验证十六进制格式
            if (!/^[0-9A-Fa-f]*$/.test(cleanText)) {
                this.showDecodeModal('Hex转字符串', text, '错误：不是有效的十六进制格式');
                return;
            }

            // 确保是偶数长度
            if (cleanText.length % 2 !== 0) {
                this.showDecodeModal('Hex转字符串', text, '错误：十六进制字符串长度必须是偶数');
                return;
            }

            // 转换为字符串
            let result = '';
            for (let i = 0; i < cleanText.length; i += 2) {
                const hexByte = cleanText.substr(i, 2);
                const charCode = parseInt(hexByte, 16);
                result += String.fromCharCode(charCode);
            }

            this.showDecodeModal('Hex转字符串', text, result);

        } catch (error) {
            console.error('Hex转字符串失败:', error);
            this.showDecodeModal('Hex转字符串', text, `转换失败：${(error as Error).message}`);
        }
    }

    // 显示解码结果模态框
    showDecodeModal(title: string, originalText: string, result: string): void {
        const modal = document.getElementById('decode-modal');
        const modalTitle = document.getElementById('decode-modal-title');
        const originalDiv = document.getElementById('decode-original');
        const resultDiv = document.getElementById('decode-result');

        if (!modal || !modalTitle || !originalDiv || !resultDiv) {
            console.error('解码模态框元素未找到');
            return;
        }

        // 设置内容
        modalTitle.textContent = title;
        originalDiv.textContent = originalText;
        resultDiv.textContent = result;

        // 显示模态框
        modal.style.display = 'flex';

        // 设置事件监听器（如果还没有设置）
        if (!this.modalEventListenersSet) {
            this.setupDecodeModalEvents();
            this.modalEventListenersSet = true;
        }
    }

    // 设置模态框事件监听器
    setupDecodeModalEvents(): void {
        const modal = document.getElementById('decode-modal');
        const closeBtn = document.getElementById('decode-modal-close');
        const copyBtn = document.getElementById('decode-copy-btn');
        const closeActionBtn = document.getElementById('decode-close-btn');

        if (!modal) return;

        // 关闭按钮事件
        const closeModal = (): void => {
            modal.style.display = 'none';
        };

        closeBtn?.addEventListener('click', closeModal);
        closeActionBtn?.addEventListener('click', closeModal);

        // 复制结果按钮事件
        copyBtn?.addEventListener('click', () => {
            const resultText = document.getElementById('decode-result')?.textContent ?? '';
            void this.copyToClipboard(resultText);
        });

        // 点击模态框背景关闭
        modal.addEventListener('click', (e: MouseEvent) => {
            if (e.target === modal) {
                closeModal();
            }
        });

        // ESC键关闭
        document.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Escape' && modal.style.display === 'flex') {
                closeModal();
            }
        });
    }

    // 设置主题同步
    async setupThemeSync(): Promise<void> {
        try {
            // 从主界面同步主题
            await this.syncThemeFromMain();

            // 监听主界面主题变化
            await this.listenToMainThemeChanges();

            console.log('主题同步已设置');
        } catch (error) {
            console.warn('主题同步设置失败:', error);
            // 使用默认主题
            this.initTheme();
        }
    }

    // 从主界面同步主题
    async syncThemeFromMain(): Promise<void> {
        try {
            if (typeof (window as any).__TAURI__ !== 'undefined') {
                const { invoke } = await import('@tauri-apps/api/core');
                const themeSettings = await invoke<{ current_theme?: string }>('get_theme_settings');
                if (themeSettings && themeSettings.current_theme) {
                    this.setTheme(themeSettings.current_theme);
                    this.hasMainTheme = true;
                    console.log('从主界面同步主题:', themeSettings.current_theme);
                    return;
                }
            }
        } catch (error) {
            console.warn('无法从主界面获取主题设置:', error);
        }

        // 如果无法获取主界面主题，使用本地保存的主题
        this.hasMainTheme = false;
        this.initTheme();
    }

    // 监听主界面主题变化
    async listenToMainThemeChanges(): Promise<void> {
        try {
            if (typeof (window as any).__TAURI__ !== 'undefined') {
                const { listen } = await import('@tauri-apps/api/event');

                // 监听主题变化事件
                await listen<{ theme?: string }>('theme-changed', (event) => {
                    console.log('收到主题变化事件:', event.payload);
                    if (event.payload && event.payload.theme) {
                        this.setTheme(event.payload.theme);
                        this.hasMainTheme = true;
                    }
                });

                console.log('已开始监听主界面主题变化');
            }
        } catch (error) {
            console.warn('监听主界面主题变化失败:', error);
        }
    }

    // 初始化主题（备用方法）
    initTheme(): void {
        // 从localStorage获取保存的主题，默认为浅色主题
        const savedTheme = localStorage.getItem('theme') || 'light';
        this.setTheme(savedTheme);
        console.log('主题已初始化:', savedTheme);
    }

    // 设置主题
    setTheme(theme: string): void {
        const body = document.body;
        const themeSelect = document.getElementById('theme-select') as HTMLSelectElement | null;

        // 移除所有主题类
        body.removeAttribute('data-theme');

        // 应用新主题
        if (theme !== 'light') {
            body.setAttribute('data-theme', theme);
        }

        // 更新选择器的值
        if (themeSelect) {
            themeSelect.value = theme;
        }

        console.log('主题已设置为:', theme);
    }

    // 切换主题（手动切换时使用）
    switchTheme(theme: string): void {
        this.setTheme(theme);

        // 只有手动切换时才保存到localStorage和显示通知
        localStorage.setItem('theme', theme);

        // 显示通知
        const themeNames: Record<string, string> = {
            'light': '浅色主题',
            'dark': '深色主题',
            'sakura': '樱花主题'
        };

        this.showNotification(`已切换到${themeNames[theme]}`, 'success');

        console.log('主题已手动切换到:', theme);
    }

    showError(message: string): void {
        this.setElementDisplay('loading', 'none');
        this.setElementDisplay('error', 'flex');
        const errorMessage = document.getElementById('error-message');
        if (errorMessage) errorMessage.innerHTML = message;
    }

    /**
     * 设置加载超时检测
     */
    setupLoadingTimeout(): void {
        // 清除之前的超时
        this.clearLoadingTimeout();

        // 设置60秒超时（增加超时时间）
        this.loadingTimeout = setTimeout(() => {
            if (!this.hasReceivedAnyData) {
                console.warn('文本数据加载超时，可能的原因：');
                console.warn('1. 文件路径不正确');
                console.warn('2. 后端处理时间过长');
                console.warn('3. 事件名称不匹配');
                console.warn('4. 窗口标签不一致');
                console.warn('5. 文件编码问题');
                this.handleLoadingTimeout();
            } else {
                console.log('已收到数据，取消超时处理');
            }
        }, 60000);

        console.log('已设置60秒加载超时检测');
    }

    /**
     * 清除加载超时
     */
    clearLoadingTimeout(): void {
        if (this.loadingTimeout) {
            clearTimeout(this.loadingTimeout);
            this.loadingTimeout = null;
            console.log('已清除加载超时检测');
        }
    }

    /**
     * 处理加载超时
     */
    handleLoadingTimeout(): void {
        console.error('文本数据加载超时');

        // 显示超时错误，但提供重试选项
        const errorMessage = `
            <div style="text-align: center;">
                <h3>数据加载超时</h3>
                <p>文本文件可能过大或网络连接存在问题</p>
                <div style="margin-top: 20px;">
                    <button onclick="textViewer.retryLoading()" style="
                        background: #007bff;
                        color: white;
                        border: none;
                        padding: 10px 20px;
                        border-radius: 5px;
                        cursor: pointer;
                        margin-right: 10px;
                    ">重试加载</button>
                    <button onclick="textViewer.closeWindow()" style="
                        background: #6c757d;
                        color: white;
                        border: none;
                        padding: 10px 20px;
                        border-radius: 5px;
                        cursor: pointer;
                    ">关闭窗口</button>
                </div>
            </div>
        `;

        this.showError(errorMessage);
    }

    /**
     * 设置重试机制
     */
    setupRetryMechanism(): void {
        // 设置一个较短的检查间隔，用于检测是否收到任何数据
        this.dataCheckInterval = setInterval(() => {
            if (!this.hasReceivedAnyData) {
                console.log('检查文本数据接收状态...');
            }
        }, 5000);
    }

    /**
     * 重试加载数据
     */
    async retryLoading(): Promise<void> {
        console.log('重试加载文本数据...');

        // 重置状态
        this.hasReceivedAnyData = false;

        // 显示加载状态
        this.setElementDisplay('loading', 'flex');
        this.setElementDisplay('error', 'none');
        this.setElementDisplay('text-container', 'none');

        // 重新设置监听器
        try {
            this.setupDataListener();

            // 添加调试信息
            console.log(`调试信息 - 窗口标签: ${this.windowLabel}`);
            console.log('调试信息 - 监听器状态:', {
                unlistenTextData: !!this.unlistenTextData,
                unlistenTextDataGeneric: !!this.unlistenTextDataGeneric
            });

        } catch (error) {
            console.error('重试设置监听器失败:', error);
            this.showError('重试失败: ' + (error as Error).message);
        }
    }

    /**
     * 关闭窗口
     */
    async closeWindow(): Promise<void> {
        console.log('关闭文本查看器窗口...');
        try {
            const tauri = (window as any).__TAURI__;
            if (typeof tauri !== 'undefined' && tauri.window) {
                const currentWindow = await tauri.window.getCurrent();
                await currentWindow.close();
            }
        } catch (error) {
            console.error('关闭窗口失败:', error);
        }
    }

    /**
     * 设置窗口特定的事件监听器
     */
    async setupWindowSpecificListener(): Promise<void> {
        const tauri = (window as any).__TAURI__;
        try {
            // 获取当前窗口标签
            if (tauri && tauri.webviewWindow) {
                // 使用新的 API
                const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
                const currentWindow = getCurrentWebviewWindow();
                const windowLabel = currentWindow.label;

                console.log(`当前窗口标签: ${windowLabel}`);

                // 监听窗口特定的文本数据事件
                const textEventName = `text-data-${windowLabel}`;
                console.log(`监听窗口特定事件: ${textEventName}`);

                const { listen } = await import('@tauri-apps/api/event');

                this.unlistenTextData = await listen<TextPayload>(textEventName, (event) => {
                    console.log(`收到文本数据事件 (${windowLabel}):`, event.payload);
                    this.clearLoadingTimeout();
                    this.hasReceivedAnyData = true;
                    this.handleTextData(event.payload);
                });

                // 同时监听通用事件作为备用
                this.unlistenTextDataGeneric = await listen<TextPayload>('text-data', (event) => {
                    console.log('收到通用文本数据事件:', event.payload);
                    this.clearLoadingTimeout();
                    this.hasReceivedAnyData = true;
                    this.handleTextData(event.payload);
                });

                // 监听搜索关键字事件
                const searchQueryEventName = `text-search-query-${windowLabel}`;
                console.log(`监听搜索关键字事件: ${searchQueryEventName}`);

                this.unlistenSearchQuery = await listen<string>(searchQueryEventName, (event) => {
                    console.log(`收到搜索关键字 (${windowLabel}):`, event.payload);
                    const searchQuery = event.payload;
                    if (searchQuery && typeof searchQuery === 'string') {
                        // 将搜索关键字填充到搜索输入框
                        const searchInput = document.getElementById('search-input') as HTMLInputElement | null;
                        if (searchInput) {
                            searchInput.value = searchQuery;
                            // 触发搜索
                            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                            console.log(`搜索关键字已自动填充: ${searchQuery}`);
                        }
                    }
                });

                // 保存窗口标签用于调试
                this.windowLabel = windowLabel;

            } else if (tauri && tauri.window) {
                // 降级到旧的 API
                const currentWindow = await tauri.window.getCurrent();
                const windowLabel = currentWindow.label;

                console.log(`当前窗口标签 (旧API): ${windowLabel}`);

                // 监听窗口特定的文本数据事件
                const textEventName = `text-data-${windowLabel}`;
                console.log(`监听窗口特定事件: ${textEventName}`);

                this.unlistenTextData = await tauri.event.listen(textEventName, (event: { payload: TextPayload }) => {
                    console.log(`收到文本数据事件 (${windowLabel}):`, event.payload);
                    this.clearLoadingTimeout();
                    this.hasReceivedAnyData = true;
                    this.handleTextData(event.payload);
                });

                // 同时监听通用事件作为备用
                this.unlistenTextDataGeneric = await tauri.event.listen('text-data', (event: { payload: TextPayload }) => {
                    console.log('收到通用文本数据事件:', event.payload);
                    this.clearLoadingTimeout();
                    this.hasReceivedAnyData = true;
                    this.handleTextData(event.payload);
                });

                // 保存窗口标签用于调试
                this.windowLabel = windowLabel;

            } else {
                // 如果无法获取窗口标签，使用通用监听器
                console.warn('无法获取窗口标签，使用通用事件监听');

                if (tauri && tauri.event) {
                    this.unlistenTextData = await tauri.event.listen('text-data', (event: { payload: TextPayload }) => {
                        console.log('收到文本数据:', event.payload);
                        this.clearLoadingTimeout();
                        this.hasReceivedAnyData = true;
                        this.handleTextData(event.payload);
                    });
                } else {
                    const { listen } = await import('@tauri-apps/api/event');
                    this.unlistenTextData = await listen<TextPayload>('text-data', (event) => {
                        console.log('收到文本数据:', event.payload);
                        this.clearLoadingTimeout();
                        this.hasReceivedAnyData = true;
                        this.handleTextData(event.payload);
                    });
                }
            }
        } catch (error) {
            console.error('设置窗口特定监听器失败:', error);
            // 最后的降级方案
            try {
                if (tauri && tauri.event) {
                    this.unlistenTextData = await tauri.event.listen('text-data', (event: { payload: TextPayload }) => {
                        console.log('收到文本数据 (最终降级):', event.payload);
                        this.clearLoadingTimeout();
                        this.hasReceivedAnyData = true;
                        this.handleTextData(event.payload);
                    });
                } else {
                    const { listen } = await import('@tauri-apps/api/event');
                    this.unlistenTextData = await listen<TextPayload>('text-data', (event) => {
                        console.log('收到文本数据 (最终降级):', event.payload);
                        this.clearLoadingTimeout();
                        this.hasReceivedAnyData = true;
                        this.handleTextData(event.payload);
                    });
                }
            } catch (finalError) {
                console.error('所有监听器设置都失败:', finalError);
                this.showError('无法设置事件监听器，请检查 Tauri API 是否正常工作');
            }
        }
    }

    /**
     * 清理资源
     */
    cleanup(): void {
        console.log('清理文本查看器资源...');

        // 清理超时和间隔
        this.clearLoadingTimeout();

        if (this.dataCheckInterval) {
            clearInterval(this.dataCheckInterval);
            this.dataCheckInterval = null;
        }

        // 取消事件监听
        if (this.unlistenTextData) {
            this.unlistenTextData();
            this.unlistenTextData = null;
        }

        if (this.unlistenTextDataGeneric) {
            this.unlistenTextDataGeneric();
            this.unlistenTextDataGeneric = null;
        }

        if (this.unlistenSearchQuery) {
            this.unlistenSearchQuery();
            this.unlistenSearchQuery = null;
        }

        console.log('文本查看器资源清理完成');
    }

    showNotification(message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info'): void {
        // 创建通知元素
        const notification = document.createElement('div');
        notification.className = `text-notification ${type}`;
        notification.innerHTML = `
            <div class="text-notification-content">
                <span class="text-notification-icon">${this.getNotificationIcon(type)}</span>
                <span class="text-notification-text">${message}</span>
            </div>
        `;

        document.body.appendChild(notification);

        // 动画显示
        setTimeout(() => notification.classList.add('show'), 10);

        // 自动隐藏
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => document.body.removeChild(notification), 300);
        }, 3000);
    }

    getNotificationIcon(type: string): string {
        const icons: Record<string, string> = {
            success: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
            error: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
            warning: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
            info: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
        };
        return icons[type] || icons.info;
    }

    updateProgress(percentage: number, status: string, activeStep?: string): void {
        const progressBar = document.getElementById('progress-bar');
        const progressStatus = document.getElementById('progress-status');
        const progressPercentage = document.getElementById('progress-percentage');

        if (progressBar) {
            progressBar.style.width = `${percentage}%`;
        }

        if (progressStatus) {
            progressStatus.textContent = status;
        }

        if (progressPercentage) {
            progressPercentage.textContent = `${percentage}%`;
        }

        // 更新步骤状态
        if (activeStep) {
            const steps = document.querySelectorAll('.text-loading-step');
            steps.forEach(step => {
                step.classList.remove('active', 'completed');
                if (step.id === activeStep) {
                    step.classList.add('active');
                } else if (this.isStepCompleted(step.id, activeStep)) {
                    step.classList.add('completed');
                }
            });
        }
    }

    isStepCompleted(stepId: string, currentStep: string): boolean {
        const stepOrder = ['step-init', 'step-wait', 'step-parse', 'step-render', 'step-complete'];
        const currentIndex = stepOrder.indexOf(currentStep);
        const stepIndex = stepOrder.indexOf(stepId);
        return stepIndex < currentIndex;
    }
}

// 初始化函数
function initApp(): void {
    console.log('开始初始化文本查看器应用...');

    // 等待DOM加载完成
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            console.log('DOM加载完成，创建文本查看器实例');
            (window as any).textViewer = new TextViewer();
        });
    } else {
        console.log('DOM已就绪，直接创建文本查看器实例');
        (window as any).textViewer = new TextViewer();
    }
}

// 导出到全局作用域，供HTML调用
(window as any).initTextViewer = initApp;
(window as any).TextViewer = TextViewer;

// 自动初始化
initApp();
