/**
 * CSV浏览器主模块
 * 负责CSV数据的加载、显示、搜索和分页功能
 */

// 导入组件模块
import { CSVTable } from './components/CSVTable';
import { CSVPagination } from './components/CSVPagination';
import { CSVSearch, SearchOptionState } from './components/CSVSearch';
import { CSVUtils, CSVRow } from './utils/CSVUtils';
import { initializePluginManager, CSVPlugin } from './components/CSVPluginManager';
import { CSVTooltipRuleManager } from './components/CSVTooltipRuleManager';
import { windowThemeAdapter } from '../ui/windowThemeAdapter';

// Tauri API导入
const { listen } = (window as any).__TAURI__.event;
const { invoke } = (window as any).__TAURI__.core;
const { getCurrentWebviewWindow } = (window as any).__TAURI__.webviewWindow;

/** 每页行数 */
type RowsPerPage = number | 'all';

/** 单元格颜色样式 */
interface ColorStyle {
    backgroundColor: string;
    textColor: string;
}

/** CSV查看器核心数据 */
interface CSVViewerData {
    filename: string;
    headers: string[];
    rows: CSVRow[];
    filteredRows: CSVRow[];
    currentPage: number;
    rowsPerPage: RowsPerPage;
    totalPages: number;
    searchKeyword: string;
    searchOptions?: Partial<SearchOptionState>;
    columnFilters: Map<string, string>;
}

/** 组件集合 */
interface ComponentBundle {
    table: CSVTable | null;
    pagination: CSVPagination | null;
    search: CSVSearch | null;
}

/** DOM元素引用集合 */
interface ElementRefs {
    [key: string]: HTMLElement | null;
}

/** 命令执行加载状态 */
interface CommandLoadingState {
    isActive: boolean;
    currentCommandId: number | string | null;
    animationElement: HTMLElement | null;
    timeoutId?: ReturnType<typeof setTimeout> | null;
    originalTitle?: string | null;
}

/** 分批加载状态 */
interface BatchLoadingState {
    isActive: boolean;
    totalBatches: number;
    receivedBatches: number;
    allRows: CSVRow[];
}

/** 文件选择器中的文件项 */
interface CSVFileItem {
    name: string;
    path: string;
    size: number;
    modified?: number;
}

/** 文件选择器状态 */
interface FileSelectorState {
    isOpen: boolean;
    files: CSVFileItem[];
    filteredFiles: CSVFileItem[];
    currentFilePath: string;
}

/** 条件着色系统 */
interface ColorCoding {
    enabled: boolean;
    targetColumns: string[];
    specialValues: Record<string, ColorStyle>;
    columnColorMaps: Map<string, Map<string, ColorStyle>>;
    colorPalette: string[];
    textColors: string[];
}

/** 后端推送的CSV数据载荷 */
interface CSVDataPayload {
    filename?: string;
    filepath?: string;
    headers?: string[];
    rows?: CSVRow[];
}

/** 主题数据载荷 */
interface ThemeDataPayload {
    current_theme?: string;
    custom_theme?: Record<string, string>;
}

/** 分批数据载荷 */
interface BatchDataPayload {
    batch_number: number;
    rows: CSVRow[];
    is_final: boolean;
}

/** 加载完成载荷 */
interface LoadCompletePayload {
    filename?: string;
    total_rows?: number;
    total_batches?: number;
    headers?: string[];
    filepath?: string;
    file_path?: string;
    path?: string;
}

/** 加载进度载荷 */
interface LoadProgressPayload {
    type?: string;
    message?: string;
    progress?: number;
    headers?: string[];
}

/** 命令事件载荷 */
interface CommandEventPayload {
    status: string;
    id: number | string;
    name?: string;
    isReallyComplete?: boolean;
}

/** Tauri 取消监听函数 */
type UnlistenFn = () => void;

// 全局工具提示规则初始化状态
let globalTooltipRulesInitialized = false;

// 全局CSV查看器实例，用于调试
let globalCSVViewer: CSVViewer | null = null;

/**
 * CSV浏览器应用类
 */
class CSVViewer {
    public data: CSVViewerData;
    public components: ComponentBundle;
    private tooltipRuleManager: CSVTooltipRuleManager;
    public elements: ElementRefs;
    private isLoading: boolean;
    private cellClickListenerAdded: boolean;
    private tooltipRulesInitialized: boolean;
    private commandLoading: CommandLoadingState;
    private batchLoading: BatchLoadingState;
    private fileSelector: FileSelectorState;
    private colorCoding: ColorCoding;

    private pluginManager?: ReturnType<typeof initializePluginManager>;
    private windowLabel?: string;
    private hasReceivedAnyData?: boolean;
    private progressInterval?: ReturnType<typeof setInterval> | null;
    private loadingTimeout?: ReturnType<typeof setTimeout> | null;
    private dataCheckInterval?: ReturnType<typeof setInterval> | null;
    private scrollObserver?: ResizeObserver | null;
    private textMeasureCanvas?: HTMLCanvasElement;
    private textMeasureContext?: CanvasRenderingContext2D | null;

    private unlistenCSVData?: UnlistenFn;
    private unlistenThemeData?: UnlistenFn;
    private unlistenBatchData?: UnlistenFn;
    private unlistenCompleteData?: UnlistenFn;
    private unlistenProgressData?: UnlistenFn;
    private unlistenErrorData?: UnlistenFn;
    private unlistenCommandEvent?: UnlistenFn;

    constructor() {
        this.data = {
            filename: '',
            headers: [],
            rows: [],
            filteredRows: [],
            currentPage: 1,
            rowsPerPage: 500,
            totalPages: 1,
            searchKeyword: '',
            columnFilters: new Map() // 存储列过滤器 {columnName: value}
        };

        this.components = {
            table: null,
            pagination: null,
            search: null
        };

        // 初始化工具提示规则管理器
        this.tooltipRuleManager = new CSVTooltipRuleManager();

        this.elements = {};
        this.isLoading = true;
        this.cellClickListenerAdded = false; // 标记是否已添加单元格点击事件委托
        this.tooltipRulesInitialized = false; // 标记工具提示规则是否已初始化

        // 命令执行加载状态管理
        this.commandLoading = {
            isActive: false,
            currentCommandId: null,
            animationElement: null
        };

        // 分批加载相关状态
        this.batchLoading = {
            isActive: false,
            totalBatches: 0,
            receivedBatches: 0,
            allRows: []
        };

        // 文件选择器状态
        this.fileSelector = {
            isOpen: false,
            files: [],
            filteredFiles: [],
            currentFilePath: ''
        };

        // 条件单元格着色系统
        this.colorCoding = {
            enabled: true,
            // 指定需要着色的列名
            targetColumns: ['Action', 'Type', 'User', 'IntegrityLevel', 'State', 'SrcAddr','SrcPort','Wow64','Tag','HandleCount','pslist'
                            ,'psscan','thrdproc','pspcid','csrss','session','deskthrd','Attributes','Privilege','LocalAddr','LocalPort'],
            // 特殊值的固定颜色映射
            specialValues: {
                'True': { backgroundColor: '#E8F5E8', textColor: '#2E7D32' },    // 绿色
                'true': { backgroundColor: '#E8F5E8', textColor: '#2E7D32' },    // 绿色
                'TRUE': { backgroundColor: '#E8F5E8', textColor: '#2E7D32' },    // 绿色
                'False': { backgroundColor: '#FFEBEE', textColor: '#D32F2F' },   // 红色
                'false': { backgroundColor: '#FFEBEE', textColor: '#D32F2F' },   // 红色
                'FALSE': { backgroundColor: '#FFEBEE', textColor: '#D32F2F' },   // 红色
                'Yes': { backgroundColor: '#E8F5E8', textColor: '#2E7D32' },     // 绿色
                'yes': { backgroundColor: '#E8F5E8', textColor: '#2E7D32' },     // 绿色
                'YES': { backgroundColor: '#E8F5E8', textColor: '#2E7D32' },     // 绿色
                'No': { backgroundColor: '#FFEBEE', textColor: '#D32F2F' },      // 红色
                'no': { backgroundColor: '#FFEBEE', textColor: '#D32F2F' },      // 红色
                'NO': { backgroundColor: '#FFEBEE', textColor: '#D32F2F' },      // 红色
                'Success': { backgroundColor: '#E8F5E8', textColor: '#2E7D32' }, // 绿色
                'success': { backgroundColor: '#E8F5E8', textColor: '#2E7D32' }, // 绿色
                'SUCCESS': { backgroundColor: '#E8F5E8', textColor: '#2E7D32' }, // 绿色
                'Failed': { backgroundColor: '#FFEBEE', textColor: '#D32F2F' },  // 红色
                'failed': { backgroundColor: '#FFEBEE', textColor: '#D32F2F' },  // 红色
                'FAILED': { backgroundColor: '#FFEBEE', textColor: '#D32F2F' },  // 红色
                'Error': { backgroundColor: '#FFEBEE', textColor: '#D32F2F' },   // 红色
                'error': { backgroundColor: '#FFEBEE', textColor: '#D32F2F' },   // 红色
                'ERROR': { backgroundColor: '#FFEBEE', textColor: '#D32F2F' },   // 红色
                'OK': { backgroundColor: '#E8F5E8', textColor: '#2E7D32' },      // 绿色
                'ok': { backgroundColor: '#E8F5E8', textColor: '#2E7D32' },      // 绿色
                'Enabled': { backgroundColor: '#E8F5E8', textColor: '#2E7D32' }, // 绿色
                'enabled': { backgroundColor: '#E8F5E8', textColor: '#2E7D32' }, // 绿色
                'ENABLED': { backgroundColor: '#E8F5E8', textColor: '#2E7D32' }, // 绿色
                'Disabled': { backgroundColor: '#FFEBEE', textColor: '#D32F2F' },// 红色
                'disabled': { backgroundColor: '#FFEBEE', textColor: '#D32F2F' },// 红色
                'DISABLED': { backgroundColor: '#FFEBEE', textColor: '#D32F2F' },// 红色
                'DEL': { backgroundColor: '#FFEBEE', textColor: '#D32F2F' },   // 红色
                'del': { backgroundColor: '#FFEBEE', textColor: '#D32F2F' },   // 红色
                'DELETE': { backgroundColor: '#FFEBEE', textColor: '#D32F2F' },// 红色
                'CRE': { backgroundColor: '#E8F5E8', textColor: '#2E7D32' },   // 绿色
                'cre': { backgroundColor: '#E8F5E8', textColor: '#2E7D32' },   // 绿色
                'CREATE': { backgroundColor: '#E8F5E8', textColor: '#2E7D32' },// 绿色
                'MOD': { backgroundColor: '#FFF8E1', textColor: '#F57F17' },   // 橙色
                'mod': { backgroundColor: '#FFF8E1', textColor: '#F57F17' },   // 橙色
                'MODIFY': { backgroundColor: '#FFF8E1', textColor: '#F57F17' } // 橙色

            },
            columnColorMaps: new Map(), // 每列的值-颜色映射
            colorPalette: [
                '#E3F2FD', '#E8F5E8', '#FFF3E0', '#FCE4EC', '#F3E5F5',
                '#E0F2F1', '#FFF8E1', '#FFEBEE', '#E1F5FE', '#F1F8E9',
                '#FFF9C4', '#FFEAA7', '#DDD6FE', '#DBEAFE', '#D1FAE5'
            ],
            textColors: [
                '#1565C0', '#2E7D32', '#EF6C00', '#C2185B', '#7B1FA2',
                '#00695C', '#F57F17', '#D32F2F', '#0277BD', '#558B2F',
                '#F9A825', '#FF8F00', '#5B21B6', '#1E40AF', '#059669'
            ]
        };

        this.init();
    }

    /**
     * 初始化应用
     */
    async init(): Promise<void> {
        console.log('初始化CSV浏览器...');

        try {
            // 获取DOM元素
            this.initElements();

            // 立即显示加载状态，避免窗口全白
            this.showLoading();

            // 初始化主题
            await this.initTheme();

            // 初始化组件
            this.initComponents();

            // 绑定事件
            this.bindEvents();

            // 监听来自后端的CSV数据
            await this.listenForCSVData();

            // 延迟初始化插件管理器，避免阻塞窗口打开
            setTimeout(() => {
                this.initPluginManager();
            }, 100);

            // 监听命令执行事件
            this.listenForCommandEvents();

            // 延迟初始化工具提示规则
            setTimeout(() => {
                this.initTooltipRules();
            }, 200);

            // 保存全局实例用于调试和其他模块访问
            globalCSVViewer = this;
            (window as any).globalCSVViewer = this;  // 暴露到全局作用域

            console.log('CSV浏览器初始化完成');
        } catch (error) {
            console.error('CSV浏览器初始化失败:', error);
            this.showError('初始化失败: ' + (error as Error).message);
        }
    }

    /**
     * 获取DOM元素引用
     */
    initElements(): void {
        this.elements = {
            // 容器元素
            app: document.getElementById('csv-viewer-app'),
            loadingIndicator: document.getElementById('loadingIndicator'),
            errorMessage: document.getElementById('errorMessage'),
            errorText: document.getElementById('errorText'),
            tableContainer: document.getElementById('tableContainer'),
            paginationContainer: document.getElementById('paginationContainer'),

            // 标题栏元素
            titleText: document.querySelector('.csv-viewer-title-text'),
            minimizeBtn: document.getElementById('minimizeBtn'),
            maximizeBtn: document.getElementById('maximizeBtn'),
            closeBtn: document.getElementById('closeBtn'),

            // 工具栏元素
            tooltipRulesBtn: document.getElementById('tooltipRulesBtn'),
            toggleFileListBtn: document.getElementById('toggleFileListBtn'),
            searchInput: document.getElementById('searchInput'),
            rowsPerPage: document.getElementById('rowsPerPage'),
            fileName: document.getElementById('fileName'),
            totalRows: document.getElementById('totalRows'),

            // 表格元素
            csvTable: document.getElementById('csvTable'),
            tableHead: document.getElementById('tableHead'),
            tableBody: document.getElementById('tableBody'),

            // 分页元素
            startRow: document.getElementById('startRow'),
            endRow: document.getElementById('endRow'),
            totalRowsCount: document.getElementById('totalRowsCount'),
            currentPage: document.getElementById('currentPage'),
            totalPages: document.getElementById('totalPages'),
            firstPageBtn: document.getElementById('firstPageBtn'),
            prevPageBtn: document.getElementById('prevPageBtn'),
            nextPageBtn: document.getElementById('nextPageBtn'),
            lastPageBtn: document.getElementById('lastPageBtn'),

            // 文件选择器元素
            fileSelector: document.getElementById('fileSelector'),
            closeFileListBtn: document.getElementById('closeFileListBtn'),
            fileSearchInput: document.getElementById('fileSearchInput'),
            fileListContainer: document.getElementById('fileListContainer')
        };

        // 验证必要元素是否存在
        const requiredElements = ['app', 'loadingIndicator', 'tableContainer'];
        for (const key of requiredElements) {
            if (!this.elements[key]) {
                throw new Error(`必要的DOM元素未找到: ${key}`);
            }
        }
    }

    /**
     * 初始化主题
     */
    async initTheme(): Promise<void> {
        try {
            // 使用统一的窗口主题适配器
            await windowThemeAdapter.init();
            console.log(`CSV查看器主题初始化完成: ${windowThemeAdapter.getCurrentTheme()}`);
        } catch (error) {
            console.warn('主题初始化失败，使用默认主题:', error);
        }
    }

    /**
     * 应用主题数据
     */
    applyTheme(themeData: ThemeDataPayload): void {
        try {
            console.log('应用主题数据:', themeData);

            if (themeData && themeData.current_theme) {
                // 应用主题模式
                document.documentElement.setAttribute('data-theme', themeData.current_theme);

                // 如果有自定义主题，应用CSS变量
                if (themeData.custom_theme && Object.keys(themeData.custom_theme).length > 0) {
                    const root = document.documentElement;
                    Object.entries(themeData.custom_theme).forEach(([key, value]) => {
                        if (key.startsWith('--')) {
                            root.style.setProperty(key, value);
                        }
                    });
                    console.log('自定义主题变量已应用');
                }

                console.log(`主题应用成功: ${themeData.current_theme}`);
            }
        } catch (error) {
            console.error('应用主题失败:', error);
        }
    }

    /**
     * 初始化组件
     */
    initComponents(): void {
        try {
            // 初始化表格组件
            this.components.table = new CSVTable(this.elements.csvTable as HTMLTableElement, {
                onCellClick: (row, column, value) => {
                    console.log('单元格点击:', { row, column, value });
                },
                onSort: (columnName, direction) => {
                    this.handleTableSort(columnName, direction);
                }
            });

            // 初始化分页组件
            this.components.pagination = new CSVPagination(this.elements.paginationContainer as HTMLElement, {
                onPageChange: (page) => this.goToPage(page),
                onRowsPerPageChange: (rowsPerPage) => this.changeRowsPerPage(rowsPerPage)
            });

            // 初始化搜索组件
            this.components.search = new CSVSearch(this.elements.searchInput as HTMLInputElement, {
                onSearch: (keyword, searchOptions) => this.performSearch(keyword, searchOptions),
                onClear: () => this.clearSearch()
            });

            console.log('所有组件初始化完成');
        } catch (error) {
            console.warn('组件初始化失败，使用备用模式:', error);
            // 如果组件初始化失败，仍然可以使用基本功能
        }
    }

    /**
     * 绑定事件处理器
     */
    bindEvents(): void {
        // 标题栏按钮事件
        this.elements.minimizeBtn?.addEventListener('click', () => this.minimizeWindow());
        this.elements.maximizeBtn?.addEventListener('click', () => this.maximizeWindow());
        this.elements.closeBtn?.addEventListener('click', () => this.closeWindow());

        // 工具栏按钮事件
        this.elements.tooltipRulesBtn?.addEventListener('click', () => this.showTooltipRuleManager());
        this.elements.toggleFileListBtn?.addEventListener('click', () => this.toggleFileSelector());
        this.elements.closeFileListBtn?.addEventListener('click', () => this.closeFileSelector());

        // 工具栏事件
        this.elements.rowsPerPage?.addEventListener('change', (e: Event) => {
            this.changeRowsPerPage((e.target as HTMLSelectElement).value);
        });

        // 文件搜索事件
        this.elements.fileSearchInput?.addEventListener('input', (e: Event) => {
            this.filterFileList((e.target as HTMLInputElement).value);
        });

        // 分页按钮事件
        this.elements.firstPageBtn?.addEventListener('click', () => this.goToPage(1));
        this.elements.prevPageBtn?.addEventListener('click', () => this.goToPage(this.data.currentPage - 1));
        this.elements.nextPageBtn?.addEventListener('click', () => this.goToPage(this.data.currentPage + 1));
        this.elements.lastPageBtn?.addEventListener('click', () => this.goToPage(this.data.totalPages));

        // 使用事件委托处理表格单元格点击，避免重复绑定
        this.bindTableCellEvents();

        // 优化滚动条交互
        this.optimizeScrollbars();

        // 键盘快捷键
        document.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key) {
                    case 'f':
                        e.preventDefault();
                        (this.elements.searchInput as HTMLInputElement | null)?.focus();
                        break;

                    case 'w':
                        e.preventDefault();
                        this.closeWindow();
                        break;
                }
            }
        });

        // 窗口关闭时清理资源
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });
    }

    /**
     * 绑定表格单元格事件（使用事件委托）
     */
    bindTableCellEvents(): void {
        if (this.cellClickListenerAdded) {
            return;
        }

        // 使用事件委托在表格容器上监听点击事件
        if (this.elements.tableContainer) {
            this.elements.tableContainer.addEventListener('click', (e: MouseEvent) => {
                const cell = (e.target as HTMLElement).closest('td, th') as HTMLTableCellElement | null;
                if (cell && cell.closest('#csvTable')) {
                    if (cell.tagName === 'TH') {
                        // 表头点击 - 排序
                        const columnIndex = Array.from(cell.parentNode!.children).indexOf(cell);
                        const columnName = this.data.headers[columnIndex];
                        if (columnName) {
                            this.handleHeaderClick(columnName);
                        }
                    } else if (cell.tagName === 'TD') {
                        // 单元格点击
                        const row = cell.parentNode as HTMLTableRowElement;
                        const columnIndex = Array.from(row.children).indexOf(cell);
                        const rowIndex = Array.from(row.parentNode!.children).indexOf(row);
                        const cellValue = cell.textContent || '';

                        this.handleCellClick(e, rowIndex, columnIndex, cellValue);
                    }
                }
            });

            this.cellClickListenerAdded = true;
            console.log('表格单元格和表头事件委托已绑定');
        }
    }

    /**
     * 监听来自后端的CSV数据
     */
    async listenForCSVData(): Promise<void> {
        console.log('开始监听CSV数据事件...');

        // 设置超时检测
        this.setupLoadingTimeout();

        try {
            // 获取当前窗口标签
            const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
            const currentWindow = getCurrentWebviewWindow();
            const windowLabel = currentWindow.label;

            console.log(`当前窗口标签: ${windowLabel}`);
            console.log(`窗口对象:`, currentWindow);

            // 监听窗口特定的CSV数据事件（兼容旧版本）
            const csvEventName = `csv-data-${windowLabel}`;
            console.log(`监听窗口特定事件: ${csvEventName}`);

            const unlistenCSV = await listen(csvEventName, (event: { payload: CSVDataPayload }) => {
                console.log(`收到CSV数据事件 (${windowLabel}):`, event);
                console.log(`事件载荷类型:`, typeof event.payload);
                console.log(`事件载荷内容:`, event.payload);
                this.clearLoadingTimeout();
                this.loadCSVData(event.payload);
            });

            // 监听分批数据事件
            const batchEventName = `csv-batch-${windowLabel}`;
            console.log(`监听分批数据事件: ${batchEventName}`);

            const unlistenBatch = await listen(batchEventName, (event: { payload: BatchDataPayload }) => {
                console.log(`收到分批数据 (${windowLabel}):`, event.payload);
                this.clearLoadingTimeout();
                this.handleBatchData(event.payload);
            });

            // 监听加载完成事件
            const completeEventName = `csv-complete-${windowLabel}`;
            console.log(`监听加载完成事件: ${completeEventName}`);

            const unlistenComplete = await listen(completeEventName, (event: { payload: LoadCompletePayload }) => {
                console.log(`收到加载完成事件 (${windowLabel}):`, event.payload);
                this.clearLoadingTimeout();
                this.handleLoadComplete(event.payload);
            });

            // 监听加载进度事件
            const progressEventName = `csv-progress-${windowLabel}`;
            console.log(`监听加载进度事件: ${progressEventName}`);

            const unlistenProgress = await listen(progressEventName, (event: { payload: LoadProgressPayload }) => {
                console.log(`收到加载进度 (${windowLabel}):`, event.payload);
                this.handleLoadProgress(event.payload);
            });

            // 监听搜索关键字事件
            const searchQueryEventName = `csv-search-query-${windowLabel}`;
            console.log(`监听搜索关键字事件: ${searchQueryEventName}`);

            const unlistenSearchQuery = await listen(searchQueryEventName, (event: { payload: unknown }) => {
                console.log(`收到搜索关键字 (${windowLabel}):`, event.payload);
                const searchQuery = event.payload;
                if (searchQuery && typeof searchQuery === 'string') {
                    // 将搜索关键字填充到搜索输入框
                    const searchInput = document.getElementById('searchInput') as HTMLInputElement | null;
                    if (searchInput) {
                        searchInput.value = searchQuery;
                        // 触发搜索
                        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                        console.log(`搜索关键字已自动填充: ${searchQuery}`);
                    }
                }
            });
            void unlistenSearchQuery;

            // 监听错误事件
            const errorEventName = `csv-error-${windowLabel}`;
            console.log(`监听错误事件: ${errorEventName}`);

            const unlistenError = await listen(errorEventName, (event: { payload: string }) => {
                console.log(`收到错误事件 (${windowLabel}):`, event.payload);
                this.clearLoadingTimeout();
                this.showError(event.payload);
            });

            // 监听窗口特定的主题数据事件
            const themeEventName = `theme-data-${windowLabel}`;
            console.log(`监听窗口特定主题事件: ${themeEventName}`);

            const unlistenTheme = await listen(themeEventName, (event: { payload: ThemeDataPayload }) => {
                console.log(`收到主题数据事件 (${windowLabel}):`, event);
                this.applyTheme(event.payload);
            });

            // 保存取消监听函数，以便在组件销毁时调用
            this.unlistenCSVData = unlistenCSV;
            this.unlistenThemeData = unlistenTheme;
            this.unlistenBatchData = unlistenBatch;
            this.unlistenCompleteData = unlistenComplete;
            this.unlistenProgressData = unlistenProgress;
            this.unlistenErrorData = unlistenError;

            // 保存窗口标签用于调试
            this.windowLabel = windowLabel;

            console.log(`CSV和主题数据监听器已设置，窗口: ${windowLabel}`);

            // 设置重试机制
            this.setupRetryMechanism();

        } catch (error) {
            console.error('设置数据监听器失败:', error);
            this.clearLoadingTimeout();
            this.showError('无法接收数据: ' + (error as Error).message);
        }
    }

    /**
     * 加载CSV数据
     */
    loadCSVData(csvData: CSVDataPayload): void {
        console.log('开始加载CSV数据...', csvData);

        // 标记已收到数据
        this.hasReceivedAnyData = true;

        try {
            // 验证数据格式
            if (!csvData || !csvData.headers || !csvData.rows) {
                throw new Error('CSV数据格式无效');
            }

            // 更新数据
            this.data.filename = csvData.filename || '未知文件';
            this.data.headers = csvData.headers || [];
            this.data.rows = csvData.rows || [];
            this.data.filteredRows = [...this.data.rows];

            // 保存文件名和路径到全局变量
            (window as any).currentCSVFileName = this.data.filename;
            (window as any).currentCSVFilePath = csvData.filepath || '';
            console.log('保存文件信息:', {
                fileName: (window as any).currentCSVFileName,
                filePath: (window as any).currentCSVFilePath
            });

            // 更新界面
            this.updateFileInfo();
            this.calculatePagination();
            this.renderTable();
            this.updatePagination();

            // 隐藏加载状态
            this.hideLoading();

            console.log(`CSV数据加载完成: ${this.data.rows.length} 行数据`);
        } catch (error) {
            console.error('加载CSV数据失败:', error);
            this.showError('加载CSV数据失败: ' + (error as Error).message);
        }
    }

    /**
     * 更新文件信息显示
     */
    updateFileInfo(): void {
        if (this.elements.fileName) {
            this.elements.fileName.textContent = this.data.filename;
        }

        if (this.elements.totalRows) {
            this.elements.totalRows.textContent = this.data.rows.length.toLocaleString();
        }

        if (this.elements.titleText) {
            this.elements.titleText.textContent = `LovelyForm - ${this.data.filename}`;
        }
    }

    /**
     * 计算分页信息
     */
    calculatePagination(): void {
        const totalRows = this.data.filteredRows.length;

        if (this.data.rowsPerPage === 'all' || (this.data.rowsPerPage as number) >= totalRows) {
            this.data.totalPages = 1;
            this.data.currentPage = 1;
        } else {
            this.data.totalPages = Math.ceil(totalRows / (this.data.rowsPerPage as number));
            this.data.currentPage = Math.min(this.data.currentPage, this.data.totalPages);
        }

        if (this.data.currentPage < 1) {
            this.data.currentPage = 1;
        }
    }

    /**
     * 渲染表格
     */
    renderTable(): void {
        try {
            // 生成颜色映射
            this.generateColumnColorMaps();

            // 获取当前页数据
            const pageData = this.getCurrentPageData();

            // 直接使用简单表格渲染以支持动画效果
            this.renderSimpleTable(pageData);

            console.log(`表格渲染完成: ${pageData.length} 行`);

            // 渲染完成后调整列宽和诊断滚动条状态
            setTimeout(() => {
                this.autoAdjustColumnWidths();
                this.diagnoseScrollbarIssues();
            }, 100);
        } catch (error) {
            console.error('表格渲染失败:', error);
            this.showError('表格渲染失败: ' + (error as Error).message);
        }
    }

    /**
     * 生成列的颜色映射
     */
    generateColumnColorMaps(): void {
        if (!this.colorCoding.enabled) return;

        this.colorCoding.columnColorMaps.clear();

        // 只为指定的列分析唯一值并分配颜色
        this.data.headers.forEach(header => {
            // 检查是否是需要着色的列
            if (!this.colorCoding.targetColumns.includes(header)) {
                return;
            }

            const uniqueValues = new Set<string>();

            // 收集该列的所有唯一值
            this.data.filteredRows.forEach(row => {
                const value = row[header];
                if (value && value.toString().trim()) {
                    uniqueValues.add(value.toString().trim());
                }
            });

            // 为唯一值分配颜色
            const colorMap = new Map<string, ColorStyle>();
            const valuesArray = Array.from(uniqueValues).sort();

            valuesArray.forEach((value, index) => {
                const colorIndex = index % this.colorCoding.colorPalette.length;
                colorMap.set(value, {
                    backgroundColor: this.colorCoding.colorPalette[colorIndex],
                    textColor: this.colorCoding.textColors[colorIndex]
                });
            });

            this.colorCoding.columnColorMaps.set(header, colorMap);
        });

        console.log('列颜色映射已生成:', this.colorCoding.columnColorMaps);
    }

    /**
     * 获取单元格的颜色样式
     */
    getCellColorStyle(columnName: string, cellValue: string): ColorStyle | null {
        if (!this.colorCoding.enabled || !cellValue) return null;

        const trimmedValue = cellValue.toString().trim();

        // 优先检查特殊值的固定颜色
        if (Object.prototype.hasOwnProperty.call(this.colorCoding.specialValues, trimmedValue)) {
            return this.colorCoding.specialValues[trimmedValue];
        }

        // 如果不是特殊值，使用列的颜色映射
        const columnColorMap = this.colorCoding.columnColorMaps.get(columnName);
        if (!columnColorMap) return null;

        return columnColorMap.get(trimmedValue) || null;
    }

    /**
     * 简单表格渲染
     */
    renderSimpleTable(pageData: CSVRow[]): void {
        // 渲染表头
        if (this.elements.tableHead) {
            this.elements.tableHead.innerHTML = '';
            const headerRow = document.createElement('tr');

            this.data.headers.forEach(header => {
                const th = document.createElement('th');
                th.textContent = header;
                th.title = `点击排序 ${header}`;

                // 添加可排序样式
                th.classList.add('sortable');

                // 添加当前排序样式
                if (this.components.table && this.components.table.data.sortColumn === header) {
                    const direction = this.components.table.data.sortDirection;
                    th.classList.add(direction === 'asc' ? 'sort-asc' : 'sort-desc');
                }

                headerRow.appendChild(th);
            });

            this.elements.tableHead.appendChild(headerRow);
        }

        // 渲染表体
        if (this.elements.tableBody) {
            this.elements.tableBody.innerHTML = '';

            pageData.forEach((rowData, rowIndex) => {
                const tr = document.createElement('tr');

                this.data.headers.forEach((header, colIndex) => {
                    const td = document.createElement('td');
                    const cellValue = rowData[header] || '';

                    td.title = cellValue;
                    td.dataset.row = String(rowIndex);
                    td.dataset.col = String(colIndex);

                    // 应用条件颜色样式 - 只包裹文字内容
                    const colorStyle = this.getCellColorStyle(header, cellValue);
                    if (colorStyle && cellValue.trim()) {
                        // 创建包裹文字的span元素
                        const span = document.createElement('span');
                        span.className = 'color-coded-text';
                        span.style.backgroundColor = colorStyle.backgroundColor;
                        span.style.color = colorStyle.textColor;
                        span.style.fontWeight = '600';
                        span.style.padding = '2px 6px';
                        span.style.borderRadius = '4px';
                        span.style.display = 'inline-block';

                        if (this.data.searchKeyword && cellValue) {
                            span.innerHTML = this.highlightSearchText(cellValue, this.data.searchKeyword);
                        } else {
                            span.textContent = cellValue;
                        }

                        td.innerHTML = '';
                        td.appendChild(span);
                    } else {
                        // 正常显示文字内容
                        if (this.data.searchKeyword && cellValue) {
                            td.innerHTML = this.highlightSearchText(cellValue, this.data.searchKeyword);
                        } else {
                            td.textContent = cellValue;
                        }
                    }

                    // 不再需要单独绑定点击事件，使用事件委托处理

                    tr.appendChild(td);
                });

                this.elements.tableBody!.appendChild(tr);
            });

            console.log('表格渲染完成，使用事件委托处理单元格点击');
        }
    }

    /**
     * 获取当前页数据
     */
    getCurrentPageData(): CSVRow[] {
        if (this.data.rowsPerPage === 'all') {
            return this.data.filteredRows;
        }

        const startIndex = (this.data.currentPage - 1) * (this.data.rowsPerPage as number);
        const endIndex = startIndex + (this.data.rowsPerPage as number);

        return this.data.filteredRows.slice(startIndex, endIndex);
    }

    /**
     * 高亮搜索文本
     */
    highlightSearchText(text: string, keyword: string): string {
        if (!keyword || !text) return text;

        const searchOptions = this.data.searchOptions || {};
        const { caseSensitive = false, wholeWord = false, useRegex = false } = searchOptions;

        try {
            let regex: RegExp;

            if (useRegex) {
                // 使用正则表达式
                const flags = caseSensitive ? 'g' : 'gi';
                regex = new RegExp(`(${keyword})`, flags);
            } else if (wholeWord) {
                // 全字匹配
                const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const flags = caseSensitive ? 'g' : 'gi';
                regex = new RegExp(`(\\b${escapedKeyword}\\b)`, flags);
            } else {
                // 普通匹配
                const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const flags = caseSensitive ? 'g' : 'gi';
                regex = new RegExp(`(${escapedKeyword})`, flags);
            }

            return text.replace(regex, '<span class="csv-search-highlight">$1</span>');
        } catch (error) {
            console.warn('高亮文本失败:', error);
            return text;
        }
    }

    /**
     * 处理表头点击事件（排序）
     */
    handleHeaderClick(columnName: string): void {
        console.log(`表头点击: ${columnName}`);

        // 更新排序状态
        if (this.components.table) {
            if (this.components.table.data.sortColumn === columnName) {
                // 切换排序方向
                this.components.table.data.sortDirection =
                    this.components.table.data.sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                // 新列排序
                this.components.table.data.sortColumn = columnName;
                this.components.table.data.sortDirection = 'asc';
            }

            // 触发排序处理
            this.handleTableSort(columnName, this.components.table.data.sortDirection);
        }
    }

    /**
     * 处理单元格点击
     */
    handleCellClick(event: MouseEvent, rowIndex: number, colIndex: number, cellValue: string): void {
        // 清除之前选中的单元格
        const previousSelected = this.elements.tableBody!.querySelector('.selected');
        if (previousSelected) {
            previousSelected.classList.remove('selected');
        }

        // 选中当前单元格
        const currentCell = event.target as HTMLElement;
        currentCell.classList.add('selected');

        // 触发选中回调
        if (this.components.table && typeof this.components.table.onCellClick === 'function') {
            this.components.table.onCellClick(rowIndex, colIndex, cellValue);
        }

        console.log(`单元格选中: 行${rowIndex}, 列${colIndex}, 值: ${cellValue}`);

        // 3秒后自动取消选中效果
        setTimeout(() => {
            if (currentCell.classList.contains('selected')) {
                currentCell.classList.remove('selected');
            }
        }, 3000);
    }

    /**
     * 更新分页控件
     */
    updatePagination(): void {
        try {
            const totalRows = this.data.filteredRows.length;
            const startRow = totalRows === 0 ? 0 : (this.data.currentPage - 1) * (this.data.rowsPerPage as number) + 1;
            const endRow = this.data.rowsPerPage === 'all' ? totalRows : Math.min(this.data.currentPage * (this.data.rowsPerPage as number), totalRows);

            // 更新分页信息
            if (this.elements.startRow) this.elements.startRow.textContent = startRow.toLocaleString();
            if (this.elements.endRow) this.elements.endRow.textContent = endRow.toLocaleString();
            if (this.elements.totalRowsCount) this.elements.totalRowsCount.textContent = totalRows.toLocaleString();
            if (this.elements.currentPage) this.elements.currentPage.textContent = String(this.data.currentPage);
            if (this.elements.totalPages) this.elements.totalPages.textContent = String(this.data.totalPages);

            // 更新分页按钮状态
            if (this.elements.firstPageBtn) (this.elements.firstPageBtn as HTMLButtonElement).disabled = this.data.currentPage <= 1;
            if (this.elements.prevPageBtn) (this.elements.prevPageBtn as HTMLButtonElement).disabled = this.data.currentPage <= 1;
            if (this.elements.nextPageBtn) (this.elements.nextPageBtn as HTMLButtonElement).disabled = this.data.currentPage >= this.data.totalPages;
            if (this.elements.lastPageBtn) (this.elements.lastPageBtn as HTMLButtonElement).disabled = this.data.currentPage >= this.data.totalPages;

            // 始终显示分页容器（因为包含工具栏），只控制分页相关元素的显示
            if (this.elements.paginationContainer) {
                this.elements.paginationContainer.style.display = 'flex';

                // 控制分页信息的显示/隐藏
                const paginationInfo = this.elements.paginationContainer.querySelector('.csv-pagination-info') as HTMLElement | null;
                if (paginationInfo) {
                    paginationInfo.style.display = totalRows > 0 ? 'block' : 'none';
                }

                // 控制分页控制按钮的显示/隐藏
                const paginationControls = this.elements.paginationContainer.querySelector('.csv-pagination-controls') as HTMLElement | null;
                if (paginationControls) {
                    paginationControls.style.display = this.data.totalPages > 1 ? 'flex' : 'none';
                }
            }

            console.log(`分页信息更新: ${this.data.currentPage}/${this.data.totalPages}`);
        } catch (error) {
            console.error('更新分页控件失败:', error);
        }
    }

    /**
     * 跳转到指定页面
     */
    goToPage(page: number): void {
        if (page < 1 || page > this.data.totalPages) {
            return;
        }

        this.data.currentPage = page;
        this.renderTable();
        this.updatePagination();

        // 重置滚动条位置
        this.resetScrollPosition();

        console.log(`跳转到第${page}页`);
    }

    /**
     * 改变每页显示行数
     */
    changeRowsPerPage(rowsPerPage: RowsPerPage | string): void {
        this.data.rowsPerPage = rowsPerPage === 'all' ? 'all' : parseInt(rowsPerPage as string);
        this.data.currentPage = 1;

        this.calculatePagination();
        this.renderTable();
        this.updatePagination();

        // 重置滚动条位置
        this.resetScrollPosition();

        console.log(`每页显示行数改变为: ${rowsPerPage}`);
    }

    /**
     * 处理表格排序
     */
    handleTableSort(columnName: string, direction: 'asc' | 'desc'): void {
        console.log(`表格排序: ${columnName} ${direction}`);

        try {
            // 使用工具类进行排序
            this.data.filteredRows = CSVUtils.sortRows(this.data.filteredRows, columnName, direction);

            // 重新计算分页和渲染
            this.calculatePagination();
            this.renderTable();
            this.updatePagination();

            console.log(`排序完成: ${columnName} ${direction}`);
        } catch (error) {
            console.error('排序失败:', error);
        }
    }

    /**
     * 执行搜索
     */
    performSearch(keyword: string, searchOptions: Partial<SearchOptionState> = {}): void {
        console.log('执行搜索:', keyword, searchOptions);

        if (!keyword.trim()) {
            this.clearSearch();
            return;
        }

        try {
            this.data.searchKeyword = keyword; // 保存搜索关键词用于高亮
            this.data.searchOptions = searchOptions; // 保存搜索选项

            // 重置到第一页
            this.data.currentPage = 1;

            // 应用所有过滤器（包括搜索和列过滤器）
            this.applyFilters();

            console.log(`搜索完成: 找到 ${this.data.filteredRows.length} 条匹配记录`);
        } catch (error) {
            console.error('搜索失败:', error);
            this.showError('搜索失败: ' + (error as Error).message);
        }
    }

    /**
     * 清除搜索
     */
    clearSearch(): void {
        console.log('清除搜索');

        this.data.searchKeyword = ''; // 清除搜索关键词
        this.data.searchOptions = {}; // 清除搜索选项
        this.data.currentPage = 1;

        // 重新应用过滤器（保持列过滤器）
        this.applyFilters();

        if (this.elements.searchInput) {
            (this.elements.searchInput as HTMLInputElement).value = '';
        }
    }

    /**
     * 应用所有过滤器（搜索 + 列过滤器）
     */
    applyFilters(): void {
        console.log('应用过滤器...');

        let filteredData = [...this.data.rows];

        // 首先应用列过滤器
        if (this.data.columnFilters.size > 0) {
            filteredData = filteredData.filter(row => {
                // 所有列过滤器都必须匹配
                for (const [columnName, filterValue] of this.data.columnFilters) {
                    const cellValue = (row[columnName] || '').toString().trim();
                    if (cellValue !== filterValue) {
                        return false;
                    }
                }
                return true;
            });
            console.log(`列过滤器应用后: ${filteredData.length} 行`);
        }

        // 然后应用搜索过滤器
        if (this.data.searchKeyword && this.data.searchKeyword.trim()) {
            filteredData = CSVUtils.searchRows(filteredData, this.data.searchKeyword, this.data.headers, this.data.searchOptions || {});
            console.log(`搜索过滤器应用后: ${filteredData.length} 行`);
        }

        this.data.filteredRows = filteredData;

        // 重新计算分页和渲染
        this.calculatePagination();
        this.renderTable();
        this.updatePagination();

        // 重置滚动条位置
        this.resetScrollPosition();

        console.log(`过滤器应用完成: ${this.data.filteredRows.length} 行数据`);
    }

    /**
     * 添加列过滤器
     */
    addColumnFilter(columnName: string, value: string): void {
        console.log(`添加列过滤器: ${columnName} = "${value}"`);

        this.data.columnFilters.set(columnName, value);
        this.data.currentPage = 1; // 重置到第一页

        this.applyFilters();

        // 显示过滤器状态
        this.updateFilterStatus();
    }

    /**
     * 清除所有过滤器
     */
    clearAllFilters(): void {
        console.log('清除所有过滤器');

        this.data.columnFilters.clear();
        this.data.searchKeyword = '';
        this.data.searchOptions = {};
        this.data.currentPage = 1;

        this.data.filteredRows = [...this.data.rows];

        this.calculatePagination();
        this.renderTable();
        this.updatePagination();
        this.resetScrollPosition();

        // 清除搜索框
        if (this.elements.searchInput) {
            (this.elements.searchInput as HTMLInputElement).value = '';
        }

        // 更新过滤器状态
        this.updateFilterStatus();

        console.log('所有过滤器已清除');
    }

    /**
     * 更新过滤器状态显示
     */
    updateFilterStatus(): void {
        // 这里可以添加过滤器状态的UI显示
        // 比如在界面上显示当前应用的过滤器
        const hasFilters = this.data.columnFilters.size > 0 || (this.data.searchKeyword && this.data.searchKeyword.trim());

        if (hasFilters) {
            console.log('当前过滤器状态:');
            if (this.data.columnFilters.size > 0) {
                for (const [column, value] of this.data.columnFilters) {
                    console.log(`  - ${column}: "${value}"`);
                }
            }
            if (this.data.searchKeyword) {
                console.log(`  - 搜索: "${this.data.searchKeyword}"`);
            }
        }
    }

    /**
     * 重置滚动条位置
     */
    resetScrollPosition(): void {
        const tableWrapper = this.elements.tableContainer?.querySelector('.csv-table-wrapper') as HTMLElement | null;
        if (tableWrapper) {
            tableWrapper.scrollTop = 0;
            tableWrapper.scrollLeft = 0;
            console.log('滚动条位置已重置');
        }
    }

    /**
     * 优化滚动条交互
     */
    optimizeScrollbars(): void {
        const tableWrapper = this.elements.tableContainer?.querySelector('.csv-table-wrapper') as HTMLElement | null;
        if (!tableWrapper) {
            console.warn('未找到表格包装器，跳过滚动条优化');
            return;
        }

        // 确保滚动容器有正确的样式
        tableWrapper.style.position = 'relative';
        tableWrapper.style.zIndex = '1';

        // 防止事件冒泡影响滚动条
        tableWrapper.addEventListener('mousedown', (e: MouseEvent) => {
            // 如果点击的是滚动条区域，不阻止默认行为
            const rect = tableWrapper.getBoundingClientRect();
            const isVerticalScrollbar = e.clientX > rect.right - 20;
            const isHorizontalScrollbar = e.clientY > rect.bottom - 20;

            if (isVerticalScrollbar || isHorizontalScrollbar) {
                // 点击的是滚动条区域，允许默认行为
                console.log('滚动条区域点击，允许默认行为');
                return;
            }
        });

        // 优化滚动性能
        let scrollTimeout: ReturnType<typeof setTimeout>;
        tableWrapper.addEventListener('scroll', () => {
            // 防抖处理，避免频繁触发
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                // 可以在这里添加滚动相关的逻辑
                console.log('滚动事件触发');
            }, 100);
        });

        // 确保滚动条在内容变化时正确显示
        const observer = new ResizeObserver(() => {
            // 当内容大小变化时，确保滚动条状态正确
            const hasVerticalScroll = tableWrapper.scrollHeight > tableWrapper.clientHeight;
            const hasHorizontalScroll = tableWrapper.scrollWidth > tableWrapper.clientWidth;

            console.log(`滚动条状态: 垂直=${hasVerticalScroll}, 水平=${hasHorizontalScroll}`);
        });

        observer.observe(tableWrapper);

        // 保存观察器引用以便清理
        this.scrollObserver = observer;

        console.log('滚动条优化完成');
    }

    /**
     * 自动调整列宽，确保内容显示完整
     */
    autoAdjustColumnWidths(): void {
        const table = this.elements.csvTable;
        if (!table) {
            console.warn('未找到表格元素，跳过列宽调整');
            return;
        }

        const headers = table.querySelectorAll('th');
        const rows = table.querySelectorAll('tbody tr');

        if (headers.length === 0 || rows.length === 0) {
            console.warn('表格无数据，跳过列宽调整');
            return;
        }

        // 为每列计算合适的宽度
        const columnWidths: number[] = [];

        headers.forEach((header, colIndex) => {
            let maxWidth = 120; // 最小宽度

            // 检查表头文本宽度
            const headerText = header.textContent || '';
            const headerWidth = this.measureTextWidth(headerText, '600 14px "Segoe UI"') + 40; // 加上padding
            maxWidth = Math.max(maxWidth, headerWidth);

            // 检查前几行数据的宽度（避免检查所有行影响性能）
            const sampleRows = Math.min(rows.length, 20);
            for (let i = 0; i < sampleRows; i++) {
                const cell = rows[i].children[colIndex];
                if (cell) {
                    const cellText = cell.textContent || '';
                    const cellWidth = this.measureTextWidth(cellText, '14px "Segoe UI"') + 24; // 加上padding
                    maxWidth = Math.max(maxWidth, cellWidth);
                }
            }

            // 限制最大宽度，避免单列过宽
            maxWidth = Math.min(maxWidth, 300);
            columnWidths[colIndex] = maxWidth;
        });

        // 应用列宽
        headers.forEach((header, colIndex) => {
            header.style.width = columnWidths[colIndex] + 'px';
            header.style.minWidth = columnWidths[colIndex] + 'px';
        });

        // 为所有数据行的单元格设置相同宽度
        rows.forEach(row => {
            Array.from(row.children).forEach((cell, colIndex) => {
                if (columnWidths[colIndex]) {
                    (cell as HTMLElement).style.width = columnWidths[colIndex] + 'px';
                    (cell as HTMLElement).style.minWidth = columnWidths[colIndex] + 'px';
                }
            });
        });

        console.log('列宽自动调整完成:', columnWidths);
    }

    /**
     * 测量文本宽度的辅助函数
     */
    measureTextWidth(text: string, font: string): number {
        if (!this.textMeasureCanvas) {
            this.textMeasureCanvas = document.createElement('canvas');
            this.textMeasureContext = this.textMeasureCanvas.getContext('2d');
        }

        this.textMeasureContext!.font = font;
        return this.textMeasureContext!.measureText(text).width;
    }

    /**
     * 诊断滚动条问题
     */
    diagnoseScrollbarIssues(): Record<string, unknown> | undefined {
        const tableWrapper = this.elements.tableContainer?.querySelector('.csv-table-wrapper') as HTMLElement | null;
        if (!tableWrapper) {
            console.error('未找到表格包装器');
            return;
        }

        const diagnostics = {
            containerDimensions: {
                width: tableWrapper.clientWidth,
                height: tableWrapper.clientHeight,
                scrollWidth: tableWrapper.scrollWidth,
                scrollHeight: tableWrapper.scrollHeight
            },
            scrollbarStatus: {
                hasVerticalScroll: tableWrapper.scrollHeight > tableWrapper.clientHeight,
                hasHorizontalScroll: tableWrapper.scrollWidth > tableWrapper.clientWidth,
                scrollTop: tableWrapper.scrollTop,
                scrollLeft: tableWrapper.scrollLeft
            },
            styles: {
                overflow: getComputedStyle(tableWrapper).overflow,
                overflowX: getComputedStyle(tableWrapper).overflowX,
                overflowY: getComputedStyle(tableWrapper).overflowY,
                position: getComputedStyle(tableWrapper).position,
                zIndex: getComputedStyle(tableWrapper).zIndex
            }
        };

        console.log('滚动条诊断信息:', diagnostics);

        // 检查是否有元素可能阻挡滚动条
        const rect = tableWrapper.getBoundingClientRect();
        const scrollbarArea = {
            vertical: { x: rect.right - 20, y: rect.top, width: 20, height: rect.height },
            horizontal: { x: rect.left, y: rect.bottom - 20, width: rect.width, height: 20 }
        };

        console.log('滚动条区域:', scrollbarArea);

        return diagnostics;
    }

    /**
     * 刷新数据
     */
    refresh(): void {
        console.log('刷新CSV数据...');
        this.renderTable();
        this.updatePagination();
    }

    /**
     * 导出数据
     */
    exportData(): void {
        console.log('导出CSV数据...');
        try {
            // 使用工具类创建CSV内容
            const csvContent = CSVUtils.arrayToCSV(this.data.headers, this.data.filteredRows);

            // 创建下载链接
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);

            link.setAttribute('href', url);
            link.setAttribute('download', `${this.data.filename}_exported.csv`);
            link.style.visibility = 'hidden';

            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            console.log('数据导出成功');
        } catch (error) {
            console.error('数据导出失败:', error);
            this.showError('数据导出失败: ' + (error as Error).message);
        }
    }

    /**
     * 最小化窗口
     */
    async minimizeWindow(): Promise<void> {
        console.log('最小化CSV浏览器窗口...');
        try {
            const webview = getCurrentWebviewWindow();
            await webview.minimize();
        } catch (error) {
            console.error('最小化窗口失败:', error);
        }
    }

    /**
     * 最大化/还原窗口
     */
    async maximizeWindow(): Promise<void> {
        console.log('切换CSV浏览器窗口最大化状态...');
        try {
            const webview = getCurrentWebviewWindow();
            const isMaximized = await webview.isMaximized();

            if (isMaximized) {
                await webview.unmaximize();
                console.log('窗口已还原');
            } else {
                await webview.maximize();
                console.log('窗口已最大化');
            }
        } catch (error) {
            console.error('切换窗口状态失败:', error);
        }
    }

    /**
     * 关闭窗口
     */
    async closeWindow(): Promise<void> {
        console.log('关闭CSV浏览器窗口...');
        try {
            const webview = getCurrentWebviewWindow();
            await webview.close();
        } catch (error) {
            console.error('关闭窗口失败:', error);
        }
    }

    /**
     * 显示加载状态
     */
    showLoading(): void {
        this.isLoading = true;

        // 不再显示加载动画（本地文件加载很快，动画只会一闪而过，无实际价值）
        if (this.elements.loadingIndicator) {
            this.elements.loadingIndicator.style.display = 'none';
        }
        if (this.elements.errorMessage) {
            this.elements.errorMessage.style.display = 'none';
        }
        if (this.elements.tableContainer) {
            this.elements.tableContainer.style.display = '';
            this.elements.tableContainer.classList.remove('loading');
        }
    }

    /**
     * 启动进度条动画
     */
    startProgressAnimation(): void {
        const progressFill = document.querySelector('.csv-loading-progress-fill') as HTMLElement | null;
        if (progressFill) {
            // 重置进度条
            progressFill.style.width = '0%';

            // 模拟加载进度
            let progress = 0;
            const interval = setInterval(() => {
                progress += Math.random() * 15 + 5; // 随机增加5-20%
                if (progress > 90) progress = 90; // 最多到90%，等待真实数据

                progressFill.style.width = `${progress}%`;

                if (progress >= 90) {
                    clearInterval(interval);
                }
            }, 200);

            // 保存interval以便清理
            this.progressInterval = interval;
        }
    }

    /**
     * 隐藏加载状态
     */
    hideLoading(): void {
        this.isLoading = false;

        // 完成进度条动画
        this.completeProgressAnimation();

        // 延迟隐藏加载界面，让用户看到完成效果
        setTimeout(() => {
            if (this.elements.loadingIndicator) {
                this.elements.loadingIndicator.style.display = 'none';
            }
            if (this.elements.tableContainer) {
                this.elements.tableContainer.style.display = 'block';
                // 触发数据流动效果
                this.elements.tableContainer.classList.add('loading');
                setTimeout(() => {
                    this.elements.tableContainer!.classList.remove('loading');
                }, 2000);
            }
        }, 800);

        console.log('加载动画完成');
    }

    /**
     * 监听命令执行事件
     */
    async listenForCommandEvents(): Promise<void> {
        try {
            // 监听CSV插件命令事件
            const unlistenCommand = await listen('csv-plugin-command', (event: { payload: CommandEventPayload }) => {
                console.log('收到CSV插件命令事件:', event.payload);
                this.handleCommandEvent(event.payload);
            });

            // 保存取消监听函数
            this.unlistenCommandEvent = unlistenCommand;

            console.log('命令执行事件监听器已设置');
        } catch (error) {
            console.error('设置命令事件监听器失败:', error);
        }
    }

    /**
     * 处理命令执行事件
     */
    handleCommandEvent(commandData: CommandEventPayload): void {
        const { status, id, isReallyComplete } = commandData;
        console.log('处理命令事件:', { status, id, name: commandData.name, isReallyComplete });

        switch (status) {
            case 'running':
                this.showCommandLoading(id, commandData.name || '');
                break;
            case 'completed':
                // 检查是否真正完成
                if (isReallyComplete) {
                    console.log('插件真正执行完成，隐藏加载动画');
                    this.hideCommandLoading(id);
                } else {
                    console.log('插件返回但未真正完成，继续显示加载动画');
                    // 设置一个保护性超时，防止动画永远不消失
                    setTimeout(() => {
                        if (this.commandLoading.isActive && this.commandLoading.currentCommandId === id) {
                            console.log('保护性超时：强制隐藏加载动画');
                            this.hideCommandLoading(id);
                        }
                    }, 15000); // 15秒保护性超时
                }
                break;
            case 'error':
                console.log('命令执行出错，隐藏加载动画');
                this.hideCommandLoading(id);
                break;
            default:
                console.warn('未知的命令状态:', status);
        }
    }

    /**
     * 显示命令执行加载动画
     */
    showCommandLoading(commandId: number | string, commandName: string): void {
        console.log('显示命令执行加载动画:', commandName, '命令ID:', commandId);

        // 如果已经有加载动画在运行，先隐藏它
        if (this.commandLoading.isActive) {
            console.log('检测到已有活动的加载动画，先隐藏它');
            this.hideCommandLoading(this.commandLoading.currentCommandId);
        }

        // 更新加载状态
        this.commandLoading.isActive = true;
        this.commandLoading.currentCommandId = commandId;

        // 创建加载动画元素
        this.createCommandLoadingAnimation(commandName);

        // 设置超时保护，防止加载动画卡住
        this.commandLoading.timeoutId = setTimeout(() => {
            console.warn('命令执行超时，自动隐藏加载动画');
            this.hideCommandLoading(commandId);
        }, 60000); // 60秒超时，给异步命令更多时间
    }

    /**
     * 创建命令加载动画元素
     */
    createCommandLoadingAnimation(commandName: string): void {
        void commandName;
        // 获取标题元素
        const titleElement = this.elements.titleText;
        if (!titleElement) {
            console.warn('未找到标题元素，无法显示加载动画');
            return;
        }

        // 创建加载动画容器
        const loadingContainer = document.createElement('div');
        loadingContainer.className = 'csv-command-loading';
        loadingContainer.innerHTML = `
            <div class="csv-command-loading-spinner"></div>
            <span class="csv-command-loading-text">执行中...</span>
        `;

        // 保存原始标题内容
        if (!this.commandLoading.originalTitle) {
            // 确保保存的是正确的标题格式
            const currentTitle = titleElement.textContent;
            console.log('当前标题元素内容:', currentTitle);
            console.log('数据文件名:', this.data.filename);

            if (currentTitle && !currentTitle.includes('执行中')) {
                this.commandLoading.originalTitle = currentTitle;
            } else {
                // 如果当前标题不正确，使用默认格式
                this.commandLoading.originalTitle = `LovelyForm - ${this.data.filename || 'CSV文件'}`;
            }
            console.log('保存原始标题:', this.commandLoading.originalTitle);
        }

        // 添加加载动画到标题区域
        titleElement.style.display = 'flex';
        titleElement.style.alignItems = 'center';
        titleElement.style.gap = '8px';
        titleElement.innerHTML = '';
        titleElement.appendChild(loadingContainer);

        // 保存动画元素引用
        this.commandLoading.animationElement = loadingContainer;

        // 确保spinner动画正常工作
        const spinner = loadingContainer.querySelector('.csv-command-loading-spinner') as HTMLElement | null;
        if (spinner) {
            spinner.style.animation = 'csv-spin 1s linear infinite';
            spinner.style.border = '2px solid transparent';
            spinner.style.borderTop = '2px solid var(--primary-color)';
            spinner.style.borderRight = '2px solid rgba(102, 126, 234, 0.3)';
            spinner.style.borderRadius = '50%';
        }

        // 添加入场动画
        loadingContainer.style.opacity = '0';
        loadingContainer.style.transform = 'translateX(-10px)';

        // 使用requestAnimationFrame确保DOM更新后再执行动画
        requestAnimationFrame(() => {
            loadingContainer.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            loadingContainer.style.opacity = '1';
            loadingContainer.style.transform = 'translateX(0)';
        });

        console.log('命令加载动画已创建');
    }

    /**
     * 隐藏命令执行加载动画
     */
    hideCommandLoading(commandId: number | string | null): void {
        console.log('尝试隐藏加载动画:', {
            commandId,
            isActive: this.commandLoading.isActive,
            currentCommandId: this.commandLoading.currentCommandId
        });

        // 检查是否是当前正在执行的命令
        if (!this.commandLoading.isActive || this.commandLoading.currentCommandId !== commandId) {
            console.log('跳过隐藏：没有活动动画或命令ID不匹配');
            return;
        }

        console.log('隐藏命令执行加载动画');

        // 清除超时定时器
        if (this.commandLoading.timeoutId) {
            clearTimeout(this.commandLoading.timeoutId);
            this.commandLoading.timeoutId = null;
        }

        // 添加退场动画然后恢复原始标题
        const titleElement = this.elements.titleText;
        if (titleElement) {
            const loadingElement = this.commandLoading.animationElement;

            // 确定要恢复的标题
            let titleToRestore = this.commandLoading.originalTitle;
            if (!titleToRestore) {
                titleToRestore = `LovelyForm - ${this.data.filename || 'CSV文件'}`;
                console.log('原始标题为空，使用默认标题:', titleToRestore);
            }

            if (loadingElement) {
                // 退场动画
                loadingElement.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                loadingElement.style.opacity = '0';
                loadingElement.style.transform = 'translateX(10px)';

                // 动画完成后恢复标题
                setTimeout(() => {
                    console.log('恢复标题:', titleToRestore);
                    titleElement.textContent = titleToRestore as string;
                    titleElement.style.display = '';
                    titleElement.style.alignItems = '';
                    titleElement.style.gap = '';
                }, 300);
            } else {
                // 如果没有动画元素，直接恢复
                console.log('直接恢复标题:', titleToRestore);
                titleElement.textContent = titleToRestore as string;
                titleElement.style.display = '';
                titleElement.style.alignItems = '';
                titleElement.style.gap = '';
            }
        }

        // 重置加载状态
        this.commandLoading.isActive = false;
        this.commandLoading.currentCommandId = null;
        this.commandLoading.animationElement = null;
        this.commandLoading.originalTitle = null;

        console.log('命令加载动画已隐藏');
    }

    /**
     * 完成进度条动画
     */
    completeProgressAnimation(): void {
        // 清除进度间隔
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }

        const progressFill = document.querySelector('.csv-loading-progress-fill') as HTMLElement | null;
        if (progressFill) {
            // 快速完成到100%
            progressFill.style.width = '100%';

            // 添加完成效果
            setTimeout(() => {
                progressFill.style.background = 'linear-gradient(90deg, #28a745, #20c997)';
            }, 200);
        }
    }

    /**
     * 显示错误信息
     */
    showError(message: string): void {
        console.error('显示错误:', message);

        if (this.elements.errorText) {
            this.elements.errorText.textContent = message;
        }
        if (this.elements.errorMessage) {
            this.elements.errorMessage.style.display = 'flex';
        }
        if (this.elements.loadingIndicator) {
            this.elements.loadingIndicator.style.display = 'none';
        }
        if (this.elements.tableContainer) {
            this.elements.tableContainer.style.display = 'none';
        }
    }

    /**
     * 初始化插件管理器
     */
    initPluginManager(): void {
        try {
            this.pluginManager = initializePluginManager();

            if (this.pluginManager && typeof this.pluginManager === 'object') {
                this.pluginManager.isPluginAllowedForFile = (plugin: CSVPlugin, currentFileName?: string): boolean => {
                    try {
                        if (!plugin) return true;

                        const normalizeFileName = (name: unknown): string => {
                            if (typeof name !== 'string') return '';
                            let s = name.trim();
                            if (!s) return '';
                            s = s.replace(/\\/g, '/');
                            const parts = s.split('/');
                            s = parts[parts.length - 1] || '';
                            return s.trim().toLowerCase();
                        };

                        const rawAllowed = plugin.allowed_filenames;
                        if (rawAllowed === null || rawAllowed === undefined) return true;

                        let allowed: string[] = [];
                        if (Array.isArray(rawAllowed)) {
                            allowed = rawAllowed;
                        } else if (typeof rawAllowed === 'string') {
                            allowed = rawAllowed
                                .split(/[,，]/)
                                .map(s => s.trim())
                                .filter(Boolean);
                        } else {
                            return true;
                        }

                        if (!allowed || allowed.length === 0) return true;

                        const w = window as any;
                        const fallbackFileName =
                            currentFileName ||
                            w.currentCSVFileName ||
                            (w.globalCSVViewer && w.globalCSVViewer.data && w.globalCSVViewer.data.filename) ||
                            (w.csvViewer && w.csvViewer.data && w.csvViewer.data.filename) ||
                            '';

                        const normalizedCurrent = normalizeFileName(fallbackFileName);
                        if (!normalizedCurrent) return true;

                        return allowed.some((rule) => {
                            if (typeof rule !== 'string') return false;
                            const r = normalizeFileName(rule);
                            if (!r) return false;
                            if (r === '*') return true;

                            if (r.includes('*')) {
                                const escaped = r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                                const pattern = '^' + escaped.replace(/\*/g, '.*') + '$';
                                try {
                                    return new RegExp(pattern, 'i').test(normalizedCurrent);
                                } catch (_e) {
                                    return false;
                                }
                            }

                            return r === normalizedCurrent;
                        });
                    } catch (error) {
                        console.warn('isPluginAllowedForFile 过滤失败，降级为不过滤:', error);
                        return true;
                    }
                };
            }

            console.log('插件管理器已启动');
        } catch (error) {
            console.warn('插件管理器启动失败:', error);
        }
    }

    /**
     * 初始化工具提示规则
     */
    async initTooltipRules(): Promise<void> {
        // 如果全局已经初始化过，直接返回
        if (globalTooltipRulesInitialized) {
            console.log('工具提示规则已全局初始化，跳过重复初始化');
            this.tooltipRulesInitialized = true;
            return;
        }

        try {
            console.log('开始初始化工具提示规则...');

            // 获取应用设置
            const settings = await invoke('load_settings_command') as { tooltip_rules_path?: string };
            const rulesPath = settings.tooltip_rules_path || 'tooltip_rules';
            console.log('工具提示规则路径:', rulesPath);

            // 首先检查是否已有规则
            let allRules: { column_name: string }[] = [];
            try {
                allRules = await invoke('get_all_tooltip_rules', { rulesPath }) as { column_name: string }[];
                console.log(`已存在 ${allRules.length} 个工具提示规则`);
            } catch (error) {
                console.log('未找到现有规则，将创建示例规则');
            }

            // 只有在没有规则时才创建示例规则
            if (allRules.length === 0) {
                try {
                    await invoke('create_example_tooltip_rules', { rulesPath });
                    console.log('工具提示示例规则已创建');

                    // 重新获取规则列表
                    allRules = await invoke('get_all_tooltip_rules', { rulesPath }) as { column_name: string }[];
                    console.log(`新创建了 ${allRules.length} 个工具提示规则:`, allRules.map(r => r.column_name));
                } catch (error) {
                    console.error('创建示例规则失败:', error);
                }
            } else {
                console.log(`使用现有的 ${allRules.length} 个工具提示规则:`, allRules.map(r => r.column_name));
            }

            // 标记为已初始化（全局和实例级别）
            globalTooltipRulesInitialized = true;
            this.tooltipRulesInitialized = true;
            console.log('工具提示系统初始化完成');
        } catch (error) {
            console.error('工具提示系统初始化失败:', error);
        }
    }

    /**
     * 显示工具提示规则管理器
     */
    showTooltipRuleManager(): void {
        if (this.tooltipRuleManager) {
            this.tooltipRuleManager.show();
        }
    }

    /**
     * 重置工具提示规则初始化状态（用于强制重新初始化）
     */
    static resetTooltipRulesInitialization(): void {
        globalTooltipRulesInitialized = false;
        console.log('已重置工具提示规则初始化状态');
    }

    /**
     * 切换文件选择器
     */
    toggleFileSelector(): void {
        if (this.fileSelector.isOpen) {
            this.closeFileSelector();
        } else {
            this.openFileSelector();
        }
    }

    /**
     * 打开文件选择器
     */
    async openFileSelector(): Promise<void> {
        console.log('打开文件选择器');
        this.fileSelector.isOpen = true;

        // 添加打开状态样式
        this.elements.fileSelector?.classList.add('open');
        this.elements.app?.classList.add('file-selector-open');
        this.elements.toggleFileListBtn?.classList.add('active');

        // 加载文件列表（如果还没加载）
        if (this.fileSelector.files.length === 0) {
            await this.loadFileList();
        }
    }

    /**
     * 关闭文件选择器
     */
    closeFileSelector(): void {
        console.log('关闭文件选择器');
        this.fileSelector.isOpen = false;

        // 移除打开状态样式
        this.elements.fileSelector?.classList.remove('open');
        this.elements.app?.classList.remove('file-selector-open');
        this.elements.toggleFileListBtn?.classList.remove('active');
    }

    /**
     * 加载文件列表
     */
    async loadFileList(): Promise<void> {
        console.log('加载文件列表...');

        try {
            // 获取用户设置中的输出路径
            const settings = await invoke('load_settings_command') as { output_path?: string };
            const outputPath = settings.output_path || 'output';

            console.log('输出路径:', outputPath);

            // 调用后端命令获取CSV文件列表
            const files = await invoke('get_csv_files_list', { directoryPath: outputPath }) as CSVFileItem[];

            console.log(`获取到 ${files.length} 个CSV文件`);

            this.fileSelector.files = files;
            this.fileSelector.filteredFiles = files;

            // 渲染文件列表
            this.renderFileList();

        } catch (error) {
            console.error('加载文件列表失败:', error);
            this.showFileListError('无法加载文件列表: ' + error);
        }
    }

    /**
     * 渲染文件列表
     */
    renderFileList(): void {
        const container = this.elements.fileListContainer;
        if (!container) return;

        // 清空容器
        container.innerHTML = '';

        const files = this.fileSelector.filteredFiles;

        if (files.length === 0) {
            // 显示空状态
            container.innerHTML = `
                <div class="csv-file-empty">
                    <div class="csv-file-empty-icon"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></div>
                    <div>未找到CSV文件</div>
                </div>
            `;
            return;
        }

        // 渲染文件项
        files.forEach(file => {
            const fileItem = this.createFileItem(file);
            container.appendChild(fileItem);
        });

        console.log(`已渲染 ${files.length} 个文件项`);
    }

    /**
     * 创建文件项元素
     */
    createFileItem(file: CSVFileItem): HTMLElement {
        const item = document.createElement('div');
        item.className = 'csv-file-item';

        // 判断是否是当前文件
        const isCurrentFile = file.path === this.fileSelector.currentFilePath ||
                              file.name === this.data.filename;

        if (isCurrentFile) {
            item.classList.add('active');
        }

        // 格式化文件大小
        const fileSize = this.formatFileSize(file.size);

        // 格式化修改时间
        const fileTime = this.formatFileTime(file.modified);

        item.innerHTML = `
            <div class="csv-file-name" title="${file.name}">${file.name}</div>
            <div class="csv-file-info">
                <span class="csv-file-size">${fileSize}</span>
                <span class="csv-file-time">${fileTime}</span>
            </div>
        `;

        // 绑定点击事件
        item.addEventListener('click', () => {
            this.switchToFile(file);
        });

        return item;
    }

    /**
     * 格式化文件大小
     */
    formatFileSize(bytes: number): string {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }

    /**
     * 格式化文件时间
     */
    formatFileTime(timestamp?: number): string {
        if (!timestamp) return '未知';

        const date = new Date(timestamp * 1000);
        const now = new Date();
        const diff = now.getTime() - date.getTime();

        // 如果是今天
        if (diff < 24 * 60 * 60 * 1000) {
            return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        }

        // 否则显示日期
        return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
    }

    /**
     * 切换到指定文件
     */
    async switchToFile(file: CSVFileItem): Promise<void> {
        console.log('切换到文件:', file.name);

        try {
            // 提前同步当前文件名/路径（用于右键菜单插件过滤）
            (window as any).currentCSVFileName = file?.name || '';
            (window as any).currentCSVFilePath = file?.path || '';

            // 显示加载状态
            this.showLoading();

            // 更新当前文件路径
            this.fileSelector.currentFilePath = file.path;

            // 调用后端命令重新加载CSV文件
            await invoke('reload_csv_file', {
                filePath: file.path,
                windowLabel: this.windowLabel
            });

            console.log('文件切换成功');

        } catch (error) {
            console.error('切换文件失败:', error);
            this.showError('切换文件失败: ' + error);
            this.hideLoading();
        }
    }

    /**
     * 过滤文件列表
     */
    filterFileList(keyword: string): void {
        if (!keyword || keyword.trim() === '') {
            this.fileSelector.filteredFiles = this.fileSelector.files;
        } else {
            const lowerKeyword = keyword.toLowerCase();
            this.fileSelector.filteredFiles = this.fileSelector.files.filter(file =>
                file.name.toLowerCase().includes(lowerKeyword)
            );
        }

        this.renderFileList();
        console.log(`过滤后显示 ${this.fileSelector.filteredFiles.length} 个文件`);
    }

    /**
     * 显示文件列表错误
     */
    showFileListError(message: string): void {
        const container = this.elements.fileListContainer;
        if (!container) return;

        container.innerHTML = `
            <div class="csv-file-empty">
                <div class="csv-file-empty-icon"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>
                <div>${message}</div>
                <button class="csv-file-reload-btn" onclick="window.csvViewer.loadFileList()">
                    重新加载
                </button>
            </div>
        `;
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
                console.warn('CSV数据加载超时，可能的原因：');
                console.warn('1. 文件路径不正确');
                console.warn('2. 后端处理时间过长');
                console.warn('3. 事件名称不匹配');
                console.warn('4. 窗口标签不一致');
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
        console.error('CSV数据加载超时');

        // 显示超时错误，但提供重试选项
        const errorMessage = `
            <div style="text-align: center;">
                <h3>数据加载超时</h3>
                <p>CSV文件可能过大或网络连接存在问题</p>
                <div style="margin-top: 20px;">
                    <button onclick="csvViewer.retryLoading()" style="
                        background: #007bff;
                        color: white;
                        border: none;
                        padding: 10px 20px;
                        border-radius: 5px;
                        cursor: pointer;
                        margin-right: 10px;
                    ">重试加载</button>
                    <button onclick="csvViewer.closeWindow()" style="
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
            if (this.isLoading && !this.hasReceivedAnyData) {
                console.log('检查数据接收状态...');
            }
        }, 5000);

        // 标记是否收到过任何数据
        this.hasReceivedAnyData = false;
    }

    /**
     * 重试加载数据
     */
    async retryLoading(): Promise<void> {
        console.log('重试加载CSV数据...');

        // 重置状态
        this.hasReceivedAnyData = false;
        this.isLoading = true;

        // 显示加载状态
        this.showLoading();

        // 重新设置监听器
        try {
            await this.listenForCSVData();

            // 添加调试信息
            console.log(`调试信息 - 窗口标签: ${this.windowLabel}`);
            console.log('调试信息 - 监听器状态:', {
                unlistenCSVData: !!this.unlistenCSVData,
                unlistenBatchData: !!this.unlistenBatchData,
                unlistenCompleteData: !!this.unlistenCompleteData,
                unlistenProgressData: !!this.unlistenProgressData,
                unlistenErrorData: !!this.unlistenErrorData
            });

        } catch (error) {
            console.error('重试设置监听器失败:', error);
            this.showError('重试失败: ' + (error as Error).message);
        }
    }

    /**
     * 处理分批数据
     */
    handleBatchData(batchData: BatchDataPayload): void {
        console.log('处理分批数据:', batchData);

        // 标记已收到数据
        this.hasReceivedAnyData = true;

        try {
            const { batch_number, rows, is_final } = batchData;

            // 如果是第一批数据，初始化分批加载状态
            if (batch_number === 1) {
                this.batchLoading.isActive = true;
                this.batchLoading.receivedBatches = 0;
                this.batchLoading.allRows = [];
                console.log('开始分批加载模式');
            }

            // 添加当前批次的数据
            this.batchLoading.allRows.push(...rows);
            this.batchLoading.receivedBatches = batch_number;

            console.log(`已接收第 ${batch_number} 批数据，包含 ${rows.length} 行，总计 ${this.batchLoading.allRows.length} 行`);

            // 如果是最后一批，标记完成
            if (is_final) {
                console.log('分批数据接收完成');
            }

        } catch (error) {
            console.error('处理分批数据失败:', error);
        }
    }

    /**
     * 处理加载完成事件
     */
    handleLoadComplete(completeData: LoadCompletePayload): void {
        console.log('处理加载完成事件:', completeData);

        // 标记已收到数据
        this.hasReceivedAnyData = true;

        try {
            const { filename, total_rows, total_batches, headers } = completeData;

            // 更新数据
            this.data.filename = filename || '未知文件';
            this.data.headers = headers || [];
            this.data.rows = this.batchLoading.allRows || [];
            this.data.filteredRows = [...this.data.rows];

            // 同步全局文件名/路径（用于右键菜单插件过滤）
            (window as any).currentCSVFileName = this.data.filename || '';
            const payloadPath = completeData.filepath || completeData.file_path || completeData.path;
            (window as any).currentCSVFilePath = payloadPath || this.fileSelector.currentFilePath || (window as any).currentCSVFilePath || '';

            // 更新界面
            this.updateFileInfo();
            this.calculatePagination();
            this.renderTable();
            this.updatePagination();

            // 隐藏加载状态
            this.hideLoading();

            // 重置分批加载状态
            this.batchLoading.isActive = false;
            this.batchLoading.totalBatches = total_batches || 0;

            console.log(`CSV数据加载完成: ${total_rows} 行数据，${total_batches} 个批次`);

        } catch (error) {
            console.error('处理加载完成事件失败:', error);
            this.showError('加载完成处理失败: ' + (error as Error).message);
        }
    }

    /**
     * 处理加载进度事件
     */
    handleLoadProgress(progressData: LoadProgressPayload): void {
        console.log('处理加载进度:', progressData);

        try {
            const { type, message, progress } = progressData;

            // 更新进度条
            const progressFill = document.querySelector('.csv-loading-progress-fill') as HTMLElement | null;
            if (progressFill && typeof progress === 'number') {
                progressFill.style.width = `${progress}%`;
            }

            // 更新加载消息
            const loadingTitle = document.querySelector('.csv-loading-title');
            const loadingSubtext = document.querySelector('.csv-loading-subtext');
            if (loadingTitle && message) {
                loadingTitle.textContent = '正在加载CSV数据';
            }
            if (loadingSubtext && message) {
                loadingSubtext.textContent = message;
            }

            // 根据类型处理不同的进度事件
            switch (type) {
                case 'start':
                    this.showLoading();
                    break;
                case 'headers':
                    // 可以在这里预先设置表头
                    if (progressData.headers) {
                        this.data.headers = progressData.headers;
                    }
                    break;
                case 'progress':
                    // 进度更新已在上面处理
                    break;
                case 'complete':
                    // 完成事件会由 handleLoadComplete 处理
                    break;
            }

        } catch (error) {
            console.error('处理加载进度失败:', error);
        }
    }

    /**
     * 清理资源
     */
    cleanup(): void {
        console.log('清理CSV浏览器资源...');

        // 清理进度动画
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }

        // 清理超时和间隔
        this.clearLoadingTimeout();

        if (this.dataCheckInterval) {
            clearInterval(this.dataCheckInterval);
            this.dataCheckInterval = null;
        }

        // 清理滚动条观察器
        if (this.scrollObserver) {
            this.scrollObserver.disconnect();
            this.scrollObserver = null;
        }

        // 取消事件监听
        if (this.unlistenCSVData) {
            this.unlistenCSVData();
        }

        if (this.unlistenThemeData) {
            this.unlistenThemeData();
        }

        if (this.unlistenBatchData) {
            this.unlistenBatchData();
        }

        if (this.unlistenCompleteData) {
            this.unlistenCompleteData();
        }

        if (this.unlistenProgressData) {
            this.unlistenProgressData();
        }

        if (this.unlistenErrorData) {
            this.unlistenErrorData();
        }

        // 清理组件
        if (this.components.table && typeof this.components.table.cleanup === 'function') {
            this.components.table.cleanup();
        }
        if (this.components.pagination && typeof this.components.pagination.cleanup === 'function') {
            this.components.pagination.cleanup();
        }
        if (this.components.search && typeof this.components.search.cleanup === 'function') {
            this.components.search.cleanup();
        }

        // 清理工具提示规则管理器
        if (this.tooltipRuleManager && typeof this.tooltipRuleManager.cleanup === 'function') {
            this.tooltipRuleManager.cleanup();
        }
    }
}

// 当页面加载完成时初始化应用
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM加载完成，开始初始化CSV浏览器...');
    const csvViewer = new CSVViewer();
    (window as any).csvViewer = csvViewer;
    (window as any).globalCSVViewer = csvViewer; // 确保全局实例可访问
    globalCSVViewer = csvViewer; // 设置模块级全局变量
});

// 当页面即将卸载时清理资源
window.addEventListener('beforeunload', () => {
    if ((window as any).csvViewer) {
        (window as any).csvViewer.cleanup();
    }
});

// 全局调试函数
(window as any).debugScrollbars = function() {
    if (globalCSVViewer) {
        return globalCSVViewer.diagnoseScrollbarIssues();
    } else {
        console.error('CSV查看器实例未找到');
        return null;
    }
};

// 全局滚动条优化函数
(window as any).optimizeScrollbars = function() {
    if (globalCSVViewer) {
        globalCSVViewer.optimizeScrollbars();
        console.log('滚动条优化已重新执行');
    } else {
        console.error('CSV查看器实例未找到');
    }
};

// 全局列宽调整函数
(window as any).adjustColumnWidths = function() {
    if (globalCSVViewer) {
        globalCSVViewer.autoAdjustColumnWidths();
        console.log('列宽调整已重新执行');
    } else {
        console.error('CSV查看器实例未找到');
    }
};

// 导出类以供其他模块使用
export { CSVViewer };
