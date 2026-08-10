/**
 * 嵌入式事件查看器界面
 * 集成到主界面内，左侧为EVTX文件列表，右侧为事件展示
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import './styles/event-viewer-embedded.css';
import IconParkHelper from '../utils/iconparkHelper';
import { friendlyError } from '../utils/errorMessage';
import { translate } from '../../i18n';

// 安全事件快速筛选预设
const SECURITY_PRESETS: { id: string; label: string; eventIds: number[]; color: string; description: string }[] = [
    { id: 'login_fail', label: '登录失败', eventIds: [4625], color: '#ef4444', description: '账户登录失败事件' },
    { id: 'login_success', label: '成功登录', eventIds: [4624], color: '#10b981', description: '账户登录成功' },
    { id: 'account_lock', label: '账户锁定', eventIds: [4740], color: '#f59e0b', description: '账户被锁定' },
    { id: 'user_create', label: '用户创建', eventIds: [4720], color: '#3b82f6', description: '新用户账户创建' },
    { id: 'service_install', label: '服务安装', eventIds: [7045], color: '#8b5cf6', description: '新服务安装' },
    { id: 'privilege_use', label: '特权使用', eventIds: [4672, 4673], color: '#ec4899', description: '特权操作' },
    { id: 'process_create', label: '进程创建', eventIds: [4688], color: '#06b6d4', description: '新进程创建' },
    { id: 'powershell', label: 'PowerShell', eventIds: [4103, 4104], color: '#6366f1', description: 'PowerShell 执行' },
    { id: 'log_clear', label: '日志清除', eventIds: [1102, 104], color: '#dc2626', description: '事件日志被清除' },
    { id: 'policy_change', label: '策略变更', eventIds: [4719, 4739], color: '#d97706', description: '审计策略变更' },
];

// 统计数据接口
interface EvtxStatistics {
    totalEvents: number;
    criticalErrorCount: number;
    uniqueProviders: number;
    timeRange: string;
    levelDistribution: { level: string; count: number; color: string }[];
    topProviders: { name: string; count: number }[];
    topEventIds: { id: number; count: number }[];
    hourlyDistribution: number[];
}

// 事件数据接口
interface EvtxEvent {
    event_id: number;
    level: number;
    level_name: string;
    provider_name: string;
    timestamp: string;
    message: string;
    computer_name: string;
    user_sid?: string;
    process_id?: number;
    thread_id?: number;
    task_category?: string;
    keywords?: string;
    raw_xml: string;
}

// EVTX文件数据接口
interface EvtxFileData {
    filename: string;
    events: EvtxEvent[];
    total_count: number;
    errors: string[];
}

// EVTX文件信息接口
interface EvtxFileInfo {
    name: string;
    path: string;
    size: number;
    modified: string;
}

export class EventViewerInterface {
    private container: HTMLElement | null = null;
    private currentEvtxFile: string = '';
    private evtxFiles: EvtxFileInfo[] = [];
    private events: EvtxEvent[] = [];
    private filteredEvents: EvtxEvent[] = [];
    private selectedEventIndex: number = -1;
    private isLoading: boolean = false;
    
    // 分页相关
    private currentPage: number = 1;
    private rowsPerPage: number = 100;
    private totalPages: number = 1;
    
    // 搜索相关
    private searchKeyword: string = '';
    
    // 排序相关
    private sortColumn: string = 'timestamp';
    private sortDirection: 'asc' | 'desc' = 'desc';

    // 统计面板
    private statsVisible: boolean = false;
    private cachedStats: EvtxStatistics | null = null;

    // 事件监听器
    private evtxDataUnlisten: UnlistenFn | null = null;
    private evtxErrorUnlisten: UnlistenFn | null = null;
    
    // 缓存的 SVG 图标
    private icons = {
        refresh: IconParkHelper.getSvgString('refresh', { size: 16 }),
        search: IconParkHelper.getSvgString('search', { size: 16 }),
        folder: IconParkHelper.getSvgString('folder', { size: 14 }),
        folderOpen: IconParkHelper.getSvgString('folder-open', { size: 14 }),
        file: IconParkHelper.getSvgString('file-text', { size: 14 }),
        left: IconParkHelper.getSvgString('left', { size: 14 }),
        right: IconParkHelper.getSvgString('right', { size: 14 }),
        filter: IconParkHelper.getSvgString('filter', { size: 14 }),
        sort: IconParkHelper.getSvgString('sort', { size: 14 }),
        // 空状态大图标
        clipboard: IconParkHelper.getSvgString('clipboard', { size: 16 }),
        folderEmpty: IconParkHelper.getSvgString('folder-close', { size: 48 }),
        searchEmpty: IconParkHelper.getSvgString('search', { size: 48 }),
        errorEmpty: IconParkHelper.getSvgString('close-one', { size: 48 }),
        // 级别小图标（统一 14px）
        error: IconParkHelper.getSvgString('close-one', { size: 14 }),
        info: IconParkHelper.getSvgString('info', { size: 14 }),
        warning: IconParkHelper.getSvgString('attention', { size: 14 }),
        critical: IconParkHelper.getSvgString('caution', { size: 14 }),
        verbose: IconParkHelper.getSvgString('message', { size: 14 }),
        computer: IconParkHelper.getSvgString('computer', { size: 14 }),
        time: IconParkHelper.getSvgString('time', { size: 14 }),
        code: IconParkHelper.getSvgString('code', { size: 14 }),
        copy: IconParkHelper.getSvgString('copy', { size: 14 }),
        close: IconParkHelper.getSvgString('close', { size: 16 }),
        chart: IconParkHelper.getSvgString('chart-line', { size: 14 }),
        download: IconParkHelper.getSvgString('download', { size: 14 }),
        shield: IconParkHelper.getSvgString('shield', { size: 14 }),
        clock: IconParkHelper.getSvgString('time', { size: 14 }),
    };

    constructor() {}

    /**
     * 渲染界面HTML
     */
    public render(): string {
        return `
            <div class="event-viewer-container" id="event-viewer-root">
                <!-- 左侧文件列表面板 -->
                <div class="event-viewer-sidebar">
                    <div class="event-viewer-sidebar-header">
                        <span>EVTX 文件列表</span>
                        <div class="event-viewer-sidebar-actions">
                            <button class="icon-btn" id="refresh-evtx-files-btn" title="刷新文件列表">
                                ${this.icons.refresh}
                            </button>
                            <button class="icon-btn" id="browse-evtx-btn" title="浏览文件">
                                ${this.icons.folder}
                            </button>
                        </div>
                    </div>
                    <div class="event-viewer-file-list" id="evtx-file-list">
                        <div class="event-viewer-loading">正在加载文件列表...</div>
                    </div>
                </div>
                
                <!-- 分隔线 -->
                <div class="event-viewer-resizer" id="event-viewer-resizer"></div>
                
                <!-- 右侧事件展示面板 -->
                <div class="event-viewer-content">
                    <!-- 顶部工具栏 -->
                    <div class="event-viewer-toolbar">
                        <div class="event-viewer-toolbar-left">
                            <div class="event-viewer-file-info" id="current-evtx-info">
                                <span class="file-icon">${this.icons.file}</span>
                                <span class="file-name">请选择EVTX文件</span>
                            </div>
                        </div>
                        <div class="event-viewer-toolbar-right">
                            <div class="event-viewer-search">
                                <span class="search-icon">${this.icons.search}</span>
                                <input type="text" 
                                       id="event-search-input" 
                                       class="event-search-input" 
                                       placeholder="搜索事件..."
                                       autocomplete="off">
                                <button class="search-clear-btn" id="event-search-clear" title="清除搜索" style="display: none;">×</button>
                            </div>
                            <button class="event-viewer-filter-btn" id="event-filter-btn" title="高级筛选">
                                ${this.icons.filter}
                                <span>筛选</span>
                            </button>
                            <button class="event-viewer-stats-btn" id="event-stats-btn" title="统计面板">
                                ${this.icons.chart}
                                <span>统计</span>
                            </button>
                            <button class="event-viewer-export-btn" id="event-export-btn" title="导出数据">
                                ${this.icons.download}
                                <span>导出</span>
                            </button>
                        </div>
                    </div>

                    <!-- 安全事件快速预设 -->
                    <div class="evtx-security-presets" id="evtx-security-presets" style="display: none;">
                        <div class="presets-label">${this.icons.shield} 安全事件快筛:</div>
                        <div class="presets-pills">
                            ${SECURITY_PRESETS.map(p => `
                                <button class="preset-pill" data-preset-id="${p.id}" data-event-ids="${p.eventIds.join(',')}" title="${p.description}" style="--preset-color: ${p.color}">
                                    ${p.label}
                                </button>
                            `).join('')}
                        </div>
                        <button class="preset-clear-btn" id="preset-clear-btn" title="清除预设筛选" style="display:none;">清除</button>
                    </div>

                    <!-- 统计仪表板面板 -->
                    <div class="evtx-stats-panel" id="evtx-stats-panel" style="display: none;">
                        <div class="evtx-stats-content" id="evtx-stats-content"></div>
                    </div>

                    <!-- 迷你时间线 -->
                    <div class="evtx-mini-timeline" id="evtx-mini-timeline" style="display: none;">
                        <div class="mini-timeline-bars" id="mini-timeline-bars"></div>
                        <div class="mini-timeline-labels">
                            <span class="mini-tl-label-start" id="mini-tl-start"></span>
                            <span class="mini-tl-label-end" id="mini-tl-end"></span>
                        </div>
                    </div>

                    <!-- 事件表格 -->
                    <div class="event-viewer-table-wrapper" id="event-table-wrapper">
                        <div class="event-viewer-empty-state">
                            <div class="empty-icon">${this.icons.clipboard}</div>
                            <div class="empty-title">没有选择EVTX文件</div>
                            <div class="empty-desc">从左侧列表选择一个EVTX文件，或点击"浏览文件"打开新文件</div>
                        </div>
                    </div>
                    
                    <!-- 分页控件 -->
                    <div class="event-viewer-pagination" id="event-pagination" style="display: none;">
                        <div class="pagination-info">
                            <span id="pagination-info-text">共 0 个事件</span>
                        </div>
                        <div class="pagination-controls">
                            <div class="rows-per-page">
                                <span>每页:</span>
                                <select id="rows-per-page-select">
                                    <option value="50">50</option>
                                    <option value="100" selected>100</option>
                                    <option value="200">200</option>
                                    <option value="500">500</option>
                                </select>
                            </div>
                            <div class="page-navigation">
                                <button class="page-btn" id="first-page-btn" title="首页">«</button>
                                <button class="page-btn" id="prev-page-btn" title="上一页">‹</button>
                                <span class="page-info" id="page-info">第 1 页 / 共 1 页</span>
                                <button class="page-btn" id="next-page-btn" title="下一页">›</button>
                                <button class="page-btn" id="last-page-btn" title="末页">»</button>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- 事件详情模态框 -->
                <div class="event-detail-modal" id="event-detail-modal" style="display: none;">
                    <div class="event-detail-overlay"></div>
                    <div class="event-detail-content">
                        <div class="event-detail-header">
                            <h3>事件详情</h3>
                            <div class="event-detail-nav">
                                <button class="event-nav-btn" id="prev-event-btn" title="上一条">
                                    ${this.icons.left}
                                </button>
                                <span class="event-nav-info" id="event-nav-info">1 / 100</span>
                                <button class="event-nav-btn" id="next-event-btn" title="下一条">
                                    ${this.icons.right}
                                </button>
                            </div>
                            <button class="event-detail-close-btn" id="event-detail-close">×</button>
                        </div>
                        <div class="event-detail-body" id="event-detail-body">
                            <!-- 事件详情内容 -->
                        </div>
                        <div class="event-detail-footer">
                            <button class="btn-secondary" id="copy-event-btn">${this.icons.copy} 复制事件</button>
                            <button class="btn-primary" id="close-detail-btn">关闭</button>
                        </div>
                    </div>
                </div>
                
                <!-- 高级筛选模态框 -->
                <div class="event-filter-modal" id="event-filter-modal" style="display: none;">
                    <div class="event-filter-overlay"></div>
                    <div class="event-filter-content">
                        <div class="event-filter-header">
                            <h3>高级筛选</h3>
                            <button class="event-filter-close-btn" id="event-filter-close">×</button>
                        </div>
                        <div class="event-filter-body">
                            <!-- 事件级别 -->
                            <div class="filter-group">
                                <label class="filter-label">事件级别</label>
                                <div class="filter-checkboxes">
                                    <label><input type="checkbox" class="level-checkbox" value="1" checked> <span class="level-icon critical">${this.icons.critical}</span> Critical</label>
                                    <label><input type="checkbox" class="level-checkbox" value="2" checked> <span class="level-icon error">${this.icons.error}</span> Error</label>
                                    <label><input type="checkbox" class="level-checkbox" value="3" checked> <span class="level-icon warning">${this.icons.warning}</span> Warning</label>
                                    <label><input type="checkbox" class="level-checkbox" value="4" checked> <span class="level-icon info">${this.icons.info}</span> Information</label>
                                    <label><input type="checkbox" class="level-checkbox" value="5" checked> <span class="level-icon verbose">${this.icons.verbose}</span> Verbose</label>
                                </div>
                            </div>
                            
                            <!-- 事件来源 -->
                            <div class="filter-group">
                                <label class="filter-label">事件来源</label>
                                <select id="provider-filter-select" class="filter-select">
                                    <option value="">全部来源</option>
                                </select>
                            </div>
                            
                            <!-- 事件ID -->
                            <div class="filter-group">
                                <label class="filter-label">事件ID</label>
                                <input type="text" id="event-id-filter" class="filter-input" placeholder="输入事件ID或范围 (如: 1000 或 1000-2000)">
                            </div>
                            
                            <!-- 时间范围 -->
                            <div class="filter-group">
                                <label class="filter-label">时间范围</label>
                                <div class="date-range">
                                    <input type="datetime-local" id="start-date-filter" class="filter-input">
                                    <span>至</span>
                                    <input type="datetime-local" id="end-date-filter" class="filter-input">
                                </div>
                            </div>
                        </div>
                        <div class="event-filter-footer">
                            <button class="btn-secondary" id="reset-filter-btn">重置</button>
                            <button class="btn-primary" id="apply-filter-btn">应用筛选</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 初始化界面
     */
    public async initialize(container: HTMLElement): Promise<void> {
        this.container = container;
        
        // 绑定事件
        this.bindEvents();
        
        // 设置事件监听器
        await this.setupEventListeners();
        
        // 加载EVTX文件列表
        await this.loadEvtxFileList();
    }

    /**
     * 绑定DOM事件
     */
    private bindEvents(): void {
        if (!this.container) return;

        // 刷新文件列表
        const refreshBtn = this.container.querySelector('#refresh-evtx-files-btn');
        refreshBtn?.addEventListener('click', () => this.loadEvtxFileList());

        // 浏览文件
        const browseBtn = this.container.querySelector('#browse-evtx-btn');
        browseBtn?.addEventListener('click', () => this.browseEvtxFile());

        // 搜索事件
        const searchInput = this.container.querySelector('#event-search-input') as HTMLInputElement;
        const searchClearBtn = this.container.querySelector('#event-search-clear') as HTMLElement;
        
        if (searchInput) {
            let searchTimeout: number;
            searchInput.addEventListener('input', (e) => {
                const value = (e.target as HTMLInputElement).value;
                searchClearBtn.style.display = value ? 'flex' : 'none';
                
                clearTimeout(searchTimeout);
                searchTimeout = window.setTimeout(() => {
                    this.performSearch(value);
                }, 300);
            });
            
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    clearTimeout(searchTimeout);
                    this.performSearch(searchInput.value);
                }
            });
        }
        
        searchClearBtn?.addEventListener('click', () => {
            if (searchInput) {
                searchInput.value = '';
                searchClearBtn.style.display = 'none';
                this.performSearch('');
            }
        });

        // 高级筛选按钮
        const filterBtn = this.container.querySelector('#event-filter-btn');
        filterBtn?.addEventListener('click', () => this.showFilterModal());

        // 统计面板按钮
        const statsBtn = this.container.querySelector('#event-stats-btn');
        statsBtn?.addEventListener('click', () => this.toggleStatsPanel());

        // 导出按钮
        const exportBtn = this.container.querySelector('#event-export-btn');
        exportBtn?.addEventListener('click', () => this.exportEvents());

        // 安全预设按钮
        this.bindSecurityPresetEvents();

        // 筛选模态框事件
        this.bindFilterModalEvents();

        // 事件详情模态框事件
        this.bindDetailModalEvents();

        // 分页事件
        this.bindPaginationEvents();

        // 分隔线拖拽
        this.bindResizerEvents();
    }

    /**
     * 绑定筛选模态框事件
     */
    private bindFilterModalEvents(): void {
        if (!this.container) return;

        const modal = this.container.querySelector('#event-filter-modal');
        const overlay = this.container.querySelector('.event-filter-overlay');
        const closeBtn = this.container.querySelector('#event-filter-close');
        const resetBtn = this.container.querySelector('#reset-filter-btn');
        const applyBtn = this.container.querySelector('#apply-filter-btn');

        const closeModal = () => {
            if (modal) (modal as HTMLElement).style.display = 'none';
        };

        overlay?.addEventListener('click', closeModal);
        closeBtn?.addEventListener('click', closeModal);
        resetBtn?.addEventListener('click', () => this.resetFilters());
        applyBtn?.addEventListener('click', () => {
            this.applyFilters();
            closeModal();
        });
    }

    /**
     * 绑定详情模态框事件
     */
    private bindDetailModalEvents(): void {
        if (!this.container) return;

        const modal = this.container.querySelector('#event-detail-modal');
        const overlay = this.container.querySelector('.event-detail-overlay');
        const closeBtn = this.container.querySelector('#event-detail-close');
        const closeDetailBtn = this.container.querySelector('#close-detail-btn');
        const copyBtn = this.container.querySelector('#copy-event-btn');

        const closeModal = () => {
            if (modal) (modal as HTMLElement).style.display = 'none';
        };

        overlay?.addEventListener('click', closeModal);
        closeBtn?.addEventListener('click', closeModal);
        closeDetailBtn?.addEventListener('click', closeModal);
        
        copyBtn?.addEventListener('click', () => {
            if (this.selectedEventIndex >= 0 && this.selectedEventIndex < this.filteredEvents.length) {
                const event = this.filteredEvents[this.selectedEventIndex];
                navigator.clipboard.writeText(event.raw_xml).then(() => {
                    this.showToast('事件数据已复制到剪贴板');
                });
            }
        });

        // 上一条/下一条导航按钮
        const prevEventBtn = this.container.querySelector('#prev-event-btn');
        const nextEventBtn = this.container.querySelector('#next-event-btn');

        prevEventBtn?.addEventListener('click', () => this.navigateEvent(-1));
        nextEventBtn?.addEventListener('click', () => this.navigateEvent(1));
    }

    /**
     * 绑定分页事件
     */
    private bindPaginationEvents(): void {
        if (!this.container) return;

        const firstBtn = this.container.querySelector('#first-page-btn');
        const prevBtn = this.container.querySelector('#prev-page-btn');
        const nextBtn = this.container.querySelector('#next-page-btn');
        const lastBtn = this.container.querySelector('#last-page-btn');
        const rowsSelect = this.container.querySelector('#rows-per-page-select') as HTMLSelectElement;

        firstBtn?.addEventListener('click', () => this.goToPage(1));
        prevBtn?.addEventListener('click', () => this.goToPage(this.currentPage - 1));
        nextBtn?.addEventListener('click', () => this.goToPage(this.currentPage + 1));
        lastBtn?.addEventListener('click', () => this.goToPage(this.totalPages));

        rowsSelect?.addEventListener('change', (e) => {
            this.rowsPerPage = parseInt((e.target as HTMLSelectElement).value);
            this.currentPage = 1;
            this.calculatePagination();
            this.renderEventTable();
        });
    }

    /**
     * 绑定分隔线拖拽事件
     */
    private bindResizerEvents(): void {
        if (!this.container) return;

        const resizer = this.container.querySelector('#event-viewer-resizer') as HTMLElement;
        const sidebar = this.container.querySelector('.event-viewer-sidebar') as HTMLElement;

        if (!resizer || !sidebar) return;

        let isResizing = false;
        let startX = 0;
        let startWidth = 0;

        resizer.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startWidth = sidebar.getBoundingClientRect().width;
            resizer.classList.add('resizing');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            const width = startWidth + (e.clientX - startX);
            if (width >= 200 && width <= 500) {
                sidebar.style.width = `${width}px`;
            }
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                resizer.classList.remove('resizing');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            }
        });
    }

    /**
     * 设置Tauri事件监听器
     */
    private async setupEventListeners(): Promise<void> {
        try {
            // 监听EVTX数据事件
            this.evtxDataUnlisten = await listen('evtx-data', (event: any) => {
                console.log('📊 收到EVTX数据:', event.payload);
                this.handleEvtxData(event.payload);
            });

            // 监听EVTX错误事件
            this.evtxErrorUnlisten = await listen('evtx-error', (event: any) => {
                console.error('❌ EVTX解析错误:', event.payload);
                this.handleEvtxError(event.payload.message);
            });

            console.log('✅ EVTX事件监听器设置完成');
        } catch (error) {
            console.error('❌ 设置EVTX事件监听器失败:', error);
        }
    }

    /**
     * 清理事件监听器
     */
    public async cleanup(): Promise<void> {
        if (this.evtxDataUnlisten) {
            this.evtxDataUnlisten();
            this.evtxDataUnlisten = null;
        }
        if (this.evtxErrorUnlisten) {
            this.evtxErrorUnlisten();
            this.evtxErrorUnlisten = null;
        }
    }

    /**
     * 加载EVTX文件列表
     */
    private async loadEvtxFileList(): Promise<void> {
        const fileListContainer = this.container?.querySelector('#evtx-file-list');
        if (!fileListContainer) return;

        fileListContainer.innerHTML = '<div class="event-viewer-loading">正在加载文件列表...</div>';

        try {
            // 尝试从挂载盘的事件日志目录读取EVTX文件（如果存在）
            // 使用通用的文件列表命令
            const files = await invoke('list_evtx_files') as EvtxFileInfo[];
            this.evtxFiles = files || [];
            // 按文件大小从大到小排序
            this.evtxFiles.sort((a, b) => b.size - a.size);
            this.renderFileList();
        } catch (error) {
            console.log('暂无已加载的EVTX文件:', error);
            // 显示空状态，提示用户选择文件
            fileListContainer.innerHTML = `
                <div class="event-viewer-empty">
                    <div class="empty-icon">${this.icons.folderEmpty}</div>
                    <div class="empty-text">未找到EVTX文件</div>
                    <div class="empty-hint">点击上方"浏览文件"按钮选择EVTX文件</div>
                </div>
            `;
        }
    }

    /**
     * 渲染文件列表
     */
    private renderFileList(): void {
        const fileListContainer = this.container?.querySelector('#evtx-file-list');
        if (!fileListContainer) return;

        if (this.evtxFiles.length === 0) {
            fileListContainer.innerHTML = `
                <div class="event-viewer-empty fade-in">
                    <div class="empty-icon">${this.icons.folderEmpty}</div>
                    <div class="empty-text">未找到EVTX文件</div>
                    <div class="empty-hint">点击上方浏览按钮选择文件</div>
                </div>
            `;
            return;
        }

        fileListContainer.innerHTML = this.evtxFiles.map((file, index) => `
            <div class="evtx-file-item ${this.currentEvtxFile === file.path ? 'active' : ''}" 
                 data-path="${file.path}" 
                 data-index="${index}">
                <span class="file-icon">${this.icons.file}</span>
                <span class="file-name" title="${file.name}">${this.formatEvtxFileName(file.name)}</span>
                <span class="file-size">${this.formatFileSize(file.size)}</span>
            </div>
        `).join('');

        // 绑定文件项点击事件
        fileListContainer.querySelectorAll('.evtx-file-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const path = (e.currentTarget as HTMLElement).dataset.path;
                if (path) {
                    this.loadEvtxFile(path);
                }
            });
        });
    }

    /**
     * 浏览并选择EVTX文件
     */
    private async browseEvtxFile(): Promise<void> {
        try {
            const { open } = await import('@tauri-apps/plugin-dialog');
            const result = await open({
                title: translate('选择EVTX文件'),
                filters: [{
                    name: translate('Windows事件日志'),
                    extensions: ['evtx']
                }],
                multiple: false
            });

            if (result) {
                await this.loadEvtxFile(result as string);
            }
        } catch (error) {
            console.error('浏览文件失败:', error);
            this.showToast('无法打开文件选择器');
        }
    }

    /**
     * 加载EVTX文件
     */
    private async loadEvtxFile(filePath: string): Promise<void> {
        if (this.isLoading) return;

        this.isLoading = true;
        this.currentEvtxFile = filePath;
        
        // 更新文件列表选中状态
        this.container?.querySelectorAll('.evtx-file-item').forEach(item => {
            const path = (item as HTMLElement).dataset.path;
            item.classList.toggle('active', path === filePath);
        });

        // 更新文件信息显示
        const fileInfo = this.container?.querySelector('#current-evtx-info');
        if (fileInfo) {
            const fileName = filePath.split(/[\\\/]/).pop() || filePath;
            fileInfo.innerHTML = `
                <span class="file-icon">${this.icons.file}</span>
                <span class="file-name">${this.formatEvtxFileName(fileName)}</span>
                <span class="file-status loading">加载中...</span>
            `;
        }

        // 显示加载状态
        this.showLoadingState();

        try {
            // 调用后端解析EVTX文件 - 使用同步方式获取数据
            const result = await invoke('parse_evtx_file_command', { filePath }) as EvtxFileData;
            this.handleEvtxData(result);
        } catch (error) {
            console.error('加载EVTX文件失败:', error);
            this.handleEvtxError(friendlyError(error).message);
        }
    }

    /**
     * 处理EVTX数据
     */
    private handleEvtxData(data: EvtxFileData): void {
        this.isLoading = false;
        this.events = data.events || [];
        this.filteredEvents = [...this.events];
        this.currentPage = 1;
        
        // 更新文件信息
        const fileInfo = this.container?.querySelector('#current-evtx-info');
        if (fileInfo) {
            const fileName = data.filename || this.currentEvtxFile.split(/[\\\/]/).pop() || '';
            fileInfo.innerHTML = `
                <span class="file-icon">${this.icons.file}</span>
                <span class="file-name">${this.formatEvtxFileName(fileName)}</span>
                <span class="event-count">${data.total_count} 个事件</span>
            `;
        }

        // 更新筛选器的提供者列表
        this.updateProviderFilter();
        
        // 计算分页
        this.calculatePagination();
        
        // 渲染事件表格
        this.renderEventTable();
        
        // 显示分页控件
        const pagination = this.container?.querySelector('#event-pagination') as HTMLElement;
        if (pagination) pagination.style.display = 'flex';

        // 显示安全预设栏
        const presets = this.container?.querySelector('#evtx-security-presets') as HTMLElement;
        if (presets) presets.style.display = 'flex';

        // 刷新统计缓存并渲染迷你时间线
        this.cachedStats = null;
        this.renderMiniTimeline();

        // 如果统计面板已打开，刷新统计
        if (this.statsVisible) {
            this.renderStatsPanel();
        }

        console.log(`✅ EVTX数据加载完成: ${this.events.length} 个事件`);
    }

    /**
     * 处理EVTX错误
     */
    private handleEvtxError(message: string): void {
        this.isLoading = false;
        
        const tableWrapper = this.container?.querySelector('#event-table-wrapper');
        if (tableWrapper) {
            tableWrapper.innerHTML = `
                <div class="event-viewer-error fade-in">
                    <div class="error-icon">${this.icons.errorEmpty}</div>
                    <div class="error-title">加载EVTX文件失败</div>
                    <div class="error-message">${this.escapeHtml(message)}</div>
                    <button class="btn-primary retry-btn">重试</button>
                </div>
            `;

            const retryBtn = tableWrapper.querySelector('.retry-btn');
            retryBtn?.addEventListener('click', () => {
                if (this.currentEvtxFile) {
                    this.loadEvtxFile(this.currentEvtxFile);
                }
            });
        }

        // 更新文件信息
        const fileInfo = this.container?.querySelector('#current-evtx-info');
        if (fileInfo) {
            const fileName = this.currentEvtxFile.split(/[\\\/]/).pop() || '';
            fileInfo.innerHTML = `
                <span class="file-icon">${this.icons.file}</span>
                <span class="file-name">${this.formatEvtxFileName(fileName)}</span>
                <span class="file-status error">加载失败</span>
            `;
        }
    }

    /**
     * 显示加载状态
     */
    private showLoadingState(): void {
        const tableWrapper = this.container?.querySelector('#event-table-wrapper');
        if (tableWrapper) {
            tableWrapper.innerHTML = `
                <div class="event-viewer-loading-state">
                    <div class="loading-spinner"></div>
                    <div class="loading-text">正在解析EVTX文件...</div>
                    <div class="loading-hint">请稍候，正在处理Windows事件日志</div>
                </div>
            `;
        }
    }

    /**
     * 渲染事件表格
     */
    private renderEventTable(): void {
        const tableWrapper = this.container?.querySelector('#event-table-wrapper');
        if (!tableWrapper) return;

        if (this.filteredEvents.length === 0) {
            tableWrapper.innerHTML = `
                <div class="event-viewer-empty-state fade-in">
                    <div class="empty-icon">${this.icons.searchEmpty}</div>
                    <div class="empty-title">没有匹配的事件</div>
                    <div class="empty-desc">尝试调整搜索条件或筛选条件</div>
                </div>
            `;
            return;
        }

        // 获取当前页数据
        const startIndex = (this.currentPage - 1) * this.rowsPerPage;
        const endIndex = Math.min(startIndex + this.rowsPerPage, this.filteredEvents.length);
        const pageEvents = this.filteredEvents.slice(startIndex, endIndex);

        tableWrapper.innerHTML = `
            <table class="event-table">
                <thead>
                    <tr>
                        <th class="sortable" data-column="event_id" style="width: 80px;">事件ID</th>
                        <th class="sortable" data-column="level_name" style="width: 100px;">级别</th>
                        <th class="sortable" data-column="provider_name" style="width: 180px;">来源</th>
                        <th class="sortable" data-column="timestamp" style="width: 160px;">时间</th>
                        <th>消息</th>
                        <th class="sortable" data-column="computer_name" style="width: 120px;">计算机</th>
                    </tr>
                </thead>
                <tbody>
                    ${pageEvents.map((event, index) => this.renderEventRow(event, startIndex + index)).join('')}
                </tbody>
            </table>
        `;

        // 绑定排序事件
        tableWrapper.querySelectorAll('.sortable').forEach(th => {
            th.addEventListener('click', (e) => {
                const column = (e.currentTarget as HTMLElement).dataset.column;
                if (column) {
                    this.handleSort(column);
                }
            });
        });

        // 绑定行点击事件
        tableWrapper.querySelectorAll('.event-row').forEach(row => {
            row.addEventListener('click', (e) => {
                const index = parseInt((e.currentTarget as HTMLElement).dataset.index || '-1');
                this.showEventDetail(index);
            });
        });

        // 更新分页信息
        this.updatePaginationInfo();
    }

    /**
     * 渲染事件行
     */
    private renderEventRow(event: EvtxEvent, index: number): string {
        const levelClass = event.level_name.toLowerCase();
        const levelIcon = this.getLevelIcon(event.level);
        const levelShort = this.getLevelShortName(event.level_name);
        const timestamp = this.formatTimestamp(event.timestamp);
        const message = this.truncateText(event.message || '', 100);
        // 计算延迟，最大延迟限制在 20 个条目，避免长列表等待太久
        const delay = (index % 20) * 30;

        return `
            <tr class="event-row level-${levelClass} fade-in" style="animation-delay: ${delay}ms" data-index="${index}">
                <td class="event-id">${event.event_id}</td>
                <td class="event-level">
                    <span class="level-badge ${levelClass}">
                        ${levelIcon} ${levelShort}
                    </span>
                </td>
                <td class="event-provider" title="${this.escapeHtml(event.provider_name)}">${this.highlightHtml(event.provider_name, this.searchKeyword)}</td>
                <td class="event-timestamp">${timestamp}</td>
                <td class="event-message" title="${this.escapeHtml(event.message || '')}">${this.highlightHtml(message, this.searchKeyword)}</td>
                <td class="event-computer" title="${this.escapeHtml(event.computer_name)}">${this.highlightHtml(event.computer_name, this.searchKeyword)}</td>
            </tr>
        `;
    }

    /**
     * 显示事件详情
     */
    private showEventDetail(index: number): void {
        if (index < 0 || index >= this.filteredEvents.length) return;

        this.selectedEventIndex = index;
        const event = this.filteredEvents[index];
        const modal = this.container?.querySelector('#event-detail-modal') as HTMLElement;
        const body = this.container?.querySelector('#event-detail-body');

        if (!modal || !body) return;

        body.innerHTML = `
            <div class="detail-section">
                <h4><span class="section-icon">${this.icons.info}</span> 基本信息</h4>
                <div class="detail-grid">
                    <div class="detail-item">
                        <span class="detail-label">事件ID:</span>
                        <span class="detail-value highlight">${event.event_id}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">级别:</span>
                        <span class="detail-value">
                            <span class="level-badge ${event.level_name.toLowerCase()}">
                                ${this.getLevelIcon(event.level)} ${event.level_name}
                            </span>
                        </span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">来源:</span>
                        <span class="detail-value">${this.escapeHtml(event.provider_name)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">时间:</span>
                        <span class="detail-value">${this.formatTimestamp(event.timestamp)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">计算机:</span>
                        <span class="detail-value">${this.escapeHtml(event.computer_name)}</span>
                    </div>
                    ${event.user_sid ? `
                    <div class="detail-item">
                        <span class="detail-label">用户SID:</span>
                        <span class="detail-value code">${this.escapeHtml(event.user_sid)}</span>
                    </div>
                    ` : ''}
                    ${event.process_id ? `
                    <div class="detail-item">
                        <span class="detail-label">进程ID:</span>
                        <span class="detail-value">${event.process_id}</span>
                    </div>
                    ` : ''}
                    ${event.thread_id ? `
                    <div class="detail-item">
                        <span class="detail-label">线程ID:</span>
                        <span class="detail-value">${event.thread_id}</span>
                    </div>
                    ` : ''}
                </div>
            </div>
            
            <div class="detail-section">
                <h4><span class="section-icon">${this.icons.verbose}</span> 消息内容</h4>
                <div class="detail-message">${this.escapeHtml(event.message || '无消息')}</div>
            </div>
            
            <div class="detail-section">
                <h4><span class="section-icon">${this.icons.code}</span> 原始XML</h4>
                <pre class="detail-xml">${this.highlightXml(event.raw_xml)}</pre>
            </div>

            <div class="detail-section detail-section-related">
                <h4><span class="section-icon">${this.icons.search}</span> 相关事件</h4>
                <div class="detail-related-list">
                    ${(() => {
                        const related = this.findRelatedEvents(event);
                        if (related.length === 0) return '<div class="detail-related-empty">无相关事件</div>';
                        return related.map(r => `
                            <div class="detail-related-item">
                                <span class="level-badge ${r.level_name.toLowerCase()}">${r.level_name}</span>
                                <span class="related-event-id">ID: ${r.event_id}</span>
                                <span class="related-provider">${this.escapeHtml(this.truncateText(r.provider_name, 25))}</span>
                                <span class="related-time">${this.formatTimestamp(r.timestamp)}</span>
                            </div>
                        `).join('');
                    })()}
                </div>
            </div>
        `;

        // 更新导航信息
        this.updateEventNavInfo();

        modal.style.display = 'flex';
    }

    /**
     * 导航到上一条/下一条事件
     */
    private navigateEvent(direction: number): void {
        const newIndex = this.selectedEventIndex + direction;
        if (newIndex >= 0 && newIndex < this.filteredEvents.length) {
            this.showEventDetail(newIndex);
        }
    }

    /**
     * 更新事件导航信息
     */
    private updateEventNavInfo(): void {
        const navInfo = this.container?.querySelector('#event-nav-info');
        const prevBtn = this.container?.querySelector('#prev-event-btn') as HTMLButtonElement;
        const nextBtn = this.container?.querySelector('#next-event-btn') as HTMLButtonElement;

        if (navInfo) {
            navInfo.textContent = `${this.selectedEventIndex + 1} / ${this.filteredEvents.length}`;
        }

        // 更新按钮禁用状态
        if (prevBtn) {
            prevBtn.disabled = this.selectedEventIndex <= 0;
        }
        if (nextBtn) {
            nextBtn.disabled = this.selectedEventIndex >= this.filteredEvents.length - 1;
        }
    }

    /**
     * 执行搜索
     */
    private performSearch(keyword: string): void {
        this.searchKeyword = keyword.trim().toLowerCase();
        
        if (!this.searchKeyword) {
            this.filteredEvents = [...this.events];
        } else {
            this.filteredEvents = this.events.filter(event => {
                const searchText = [
                    event.message || '',
                    event.provider_name,
                    event.computer_name,
                    event.event_id.toString(),
                    event.level_name,
                    event.user_sid || '',
                    event.task_category || ''
                ].join(' ').toLowerCase();
                
                return searchText.includes(this.searchKeyword);
            });
        }

        this.currentPage = 1;
        this.calculatePagination();
        this.renderEventTable();
    }

    /**
     * 显示筛选模态框
     */
    private showFilterModal(): void {
        const modal = this.container?.querySelector('#event-filter-modal') as HTMLElement;
        if (modal) {
            modal.style.display = 'flex';
        }
    }

    /**
     * 重置筛选器
     */
    private resetFilters(): void {
        // 重置所有级别复选框
        this.container?.querySelectorAll('.level-checkbox').forEach(cb => {
            (cb as HTMLInputElement).checked = true;
        });

        // 重置其他筛选器
        const providerSelect = this.container?.querySelector('#provider-filter-select') as HTMLSelectElement;
        if (providerSelect) providerSelect.value = '';

        const eventIdInput = this.container?.querySelector('#event-id-filter') as HTMLInputElement;
        if (eventIdInput) eventIdInput.value = '';

        const startDate = this.container?.querySelector('#start-date-filter') as HTMLInputElement;
        if (startDate) startDate.value = '';

        const endDate = this.container?.querySelector('#end-date-filter') as HTMLInputElement;
        if (endDate) endDate.value = '';
    }

    /**
     * 应用筛选器
     */
    private applyFilters(): void {
        // 获取选中的级别
        const selectedLevels: number[] = [];
        this.container?.querySelectorAll('.level-checkbox:checked').forEach(cb => {
            selectedLevels.push(parseInt((cb as HTMLInputElement).value));
        });

        // 获取其他筛选条件
        const provider = (this.container?.querySelector('#provider-filter-select') as HTMLSelectElement)?.value || '';
        const eventIdPattern = (this.container?.querySelector('#event-id-filter') as HTMLInputElement)?.value || '';
        const startDate = (this.container?.querySelector('#start-date-filter') as HTMLInputElement)?.value || '';
        const endDate = (this.container?.querySelector('#end-date-filter') as HTMLInputElement)?.value || '';

        // 应用筛选
        this.filteredEvents = this.events.filter(event => {
            // 级别筛选
            if (selectedLevels.length > 0 && !selectedLevels.includes(event.level)) {
                return false;
            }

            // 来源筛选
            if (provider && event.provider_name !== provider) {
                return false;
            }

            // 事件ID筛选
            if (eventIdPattern && !this.matchEventId(event.event_id, eventIdPattern)) {
                return false;
            }

            // 时间范围筛选
            if (startDate || endDate) {
                const eventTime = new Date(event.timestamp);
                if (startDate && eventTime < new Date(startDate)) {
                    return false;
                }
                if (endDate && eventTime > new Date(endDate)) {
                    return false;
                }
            }

            return true;
        });

        // 如果有搜索关键词，继续筛选
        if (this.searchKeyword) {
            this.filteredEvents = this.filteredEvents.filter(event => {
                const searchText = [
                    event.message || '',
                    event.provider_name,
                    event.computer_name,
                    event.event_id.toString(),
                    event.level_name
                ].join(' ').toLowerCase();
                
                return searchText.includes(this.searchKeyword);
            });
        }

        this.currentPage = 1;
        this.calculatePagination();
        this.renderEventTable();
    }

    /**
     * 匹配事件ID
     */
    private matchEventId(eventId: number, pattern: string): boolean {
        if (/^\d+$/.test(pattern)) {
            return eventId === parseInt(pattern);
        }

        const rangeMatch = pattern.match(/^(\d+)-(\d+)$/);
        if (rangeMatch) {
            const start = parseInt(rangeMatch[1]);
            const end = parseInt(rangeMatch[2]);
            return eventId >= start && eventId <= end;
        }

        const idList = pattern.split(',').map(id => id.trim());
        return idList.some(id => /^\d+$/.test(id) && eventId === parseInt(id));
    }

    /**
     * 更新提供者筛选器
     */
    private updateProviderFilter(): void {
        const select = this.container?.querySelector('#provider-filter-select') as HTMLSelectElement;
        if (!select) return;

        const providers = [...new Set(this.events.map(e => e.provider_name))].sort();
        
        select.innerHTML = '<option value="">全部来源</option>' + 
            providers.map(p => `<option value="${this.escapeHtml(p)}">${this.escapeHtml(p)}</option>`).join('');
    }

    /**
     * 处理排序
     */
    private handleSort(column: string): void {
        if (this.sortColumn === column) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortColumn = column;
            this.sortDirection = 'asc';
        }

        this.filteredEvents.sort((a, b) => {
            let valueA: any = (a as any)[column];
            let valueB: any = (b as any)[column];

            if (valueA == null && valueB == null) return 0;
            if (valueA == null) return this.sortDirection === 'asc' ? 1 : -1;
            if (valueB == null) return this.sortDirection === 'asc' ? -1 : 1;

            if (column === 'event_id' || column === 'level') {
                valueA = parseInt(valueA) || 0;
                valueB = parseInt(valueB) || 0;
            } else if (column === 'timestamp') {
                valueA = new Date(valueA).getTime() || 0;
                valueB = new Date(valueB).getTime() || 0;
            } else {
                valueA = String(valueA).toLowerCase();
                valueB = String(valueB).toLowerCase();
            }

            let comparison = 0;
            if (valueA > valueB) comparison = 1;
            else if (valueA < valueB) comparison = -1;

            return this.sortDirection === 'desc' ? -comparison : comparison;
        });

        this.renderEventTable();
    }

    /**
     * 计算分页
     */
    private calculatePagination(): void {
        this.totalPages = Math.ceil(this.filteredEvents.length / this.rowsPerPage);
        if (this.currentPage > this.totalPages) {
            this.currentPage = Math.max(1, this.totalPages);
        }
    }

    /**
     * 跳转到指定页
     */
    private goToPage(page: number): void {
        if (page < 1 || page > this.totalPages) return;
        this.currentPage = page;
        this.renderEventTable();
    }

    /**
     * 更新分页信息
     */
    private updatePaginationInfo(): void {
        const infoText = this.container?.querySelector('#pagination-info-text');
        const pageInfo = this.container?.querySelector('#page-info');
        
        if (infoText) {
            infoText.textContent = `共 ${this.filteredEvents.length} 个事件`;
        }
        
        if (pageInfo) {
            pageInfo.textContent = `第 ${this.currentPage} 页 / 共 ${this.totalPages} 页`;
        }

        // 更新按钮状态
        const firstBtn = this.container?.querySelector('#first-page-btn') as HTMLButtonElement;
        const prevBtn = this.container?.querySelector('#prev-page-btn') as HTMLButtonElement;
        const nextBtn = this.container?.querySelector('#next-page-btn') as HTMLButtonElement;
        const lastBtn = this.container?.querySelector('#last-page-btn') as HTMLButtonElement;

        if (firstBtn) firstBtn.disabled = this.currentPage === 1;
        if (prevBtn) prevBtn.disabled = this.currentPage === 1;
        if (nextBtn) nextBtn.disabled = this.currentPage === this.totalPages;
        if (lastBtn) lastBtn.disabled = this.currentPage === this.totalPages;
    }

    // ==================== 工具方法 ====================

    private getLevelIcon(level: number): string {
        switch (level) {
            case 1: return this.icons.critical;
            case 2: return this.icons.error;
            case 3: return this.icons.warning;
            case 4: return this.icons.info;
            case 5: return this.icons.verbose;
            default: return this.icons.info;
        }
    }

    /** 统一级别名称长度，避免 badge 大小不一 */
    private getLevelShortName(levelName: string): string {
        switch (levelName.toLowerCase()) {
            case 'critical': return 'Critical';
            case 'error': return 'Error';
            case 'warning': return 'Warning';
            case 'information': return 'Info';
            case 'verbose': return 'Verbose';
            default: return levelName;
        }
    }

    private formatTimestamp(timestamp: string): string {
        try {
            const date = new Date(timestamp);
            if (isNaN(date.getTime())) return timestamp;
            return date.toLocaleString('zh-CN');
        } catch {
            return timestamp;
        }
    }

    private formatFileSize(bytes: number): string {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * 格式化EVTX文件名，从第一个-后分割，只显示后面部分
     */
    private formatEvtxFileName(name: string): string {
        const dashIndex = name.indexOf('-');
        if (dashIndex !== -1 && dashIndex < name.length - 1) {
            return name.substring(dashIndex + 1);
        }
        return name;
    }

    private truncateText(text: string, maxLength: number): string {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /** 转义文本并高亮当前搜索关键词（this.searchKeyword 已为小写） */
    private highlightHtml(text: string, keyword: string): string {
        const escaped = this.escapeHtml(text || '');
        if (!keyword) return escaped;
        const safe = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        try {
            return escaped.replace(new RegExp(`(${safe})`, 'gi'), '<mark class="search-match">$1</mark>');
        } catch {
            return escaped;
        }
    }

    private showToast(message: string): void {
        // 简单的toast提示
        const toast = document.createElement('div');
        toast.className = 'event-viewer-toast';
        toast.textContent = message;
        document.body.appendChild(toast);

        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    }

    // ==================== 统计面板 ====================

    private computeStatistics(): EvtxStatistics {
        if (this.cachedStats) return this.cachedStats;

        const events = this.events;
        const levelMap = new Map<number, number>();
        const providerMap = new Map<string, number>();
        const eventIdMap = new Map<number, number>();
        const hourly = new Array(24).fill(0);
        let minTime = Infinity;
        let maxTime = -Infinity;

        for (const e of events) {
            // 级别
            levelMap.set(e.level, (levelMap.get(e.level) || 0) + 1);
            // Provider
            providerMap.set(e.provider_name, (providerMap.get(e.provider_name) || 0) + 1);
            // Event ID
            eventIdMap.set(e.event_id, (eventIdMap.get(e.event_id) || 0) + 1);
            // 小时分布
            try {
                const dt = new Date(e.timestamp);
                const h = dt.getHours();
                if (h >= 0 && h < 24) hourly[h]++;
                const t = dt.getTime();
                if (t < minTime) minTime = t;
                if (t > maxTime) maxTime = t;
            } catch { /* skip */ }
        }

        const LEVEL_META: Record<number, { name: string; color: string }> = {
            1: { name: 'Critical', color: '#dc2626' },
            2: { name: 'Error', color: '#ef4444' },
            3: { name: 'Warning', color: '#f59e0b' },
            4: { name: 'Information', color: '#3b82f6' },
            5: { name: 'Verbose', color: '#94a3b8' },
        };

        const levelDistribution = [1, 2, 3, 4, 5].map(l => ({
            level: LEVEL_META[l]?.name || `Level ${l}`,
            count: levelMap.get(l) || 0,
            color: LEVEL_META[l]?.color || '#666',
        })).filter(x => x.count > 0);

        const topProviders = [...providerMap.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([name, count]) => ({ name, count }));

        const topEventIds = [...eventIdMap.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([id, count]) => ({ id, count }));

        const criticalErrorCount = (levelMap.get(1) || 0) + (levelMap.get(2) || 0);

        let timeRange = 'N/A';
        if (minTime !== Infinity && maxTime !== -Infinity) {
            const diffMs = maxTime - minTime;
            const hours = Math.floor(diffMs / 3600000);
            const days = Math.floor(hours / 24);
            timeRange = days > 0 ? `${days}天 ${hours % 24}小时` : `${hours}小时`;
        }

        this.cachedStats = {
            totalEvents: events.length,
            criticalErrorCount,
            uniqueProviders: providerMap.size,
            timeRange,
            levelDistribution,
            topProviders,
            topEventIds,
            hourlyDistribution: hourly,
        };
        return this.cachedStats;
    }

    private toggleStatsPanel(): void {
        this.statsVisible = !this.statsVisible;
        const panel = this.container?.querySelector('#evtx-stats-panel') as HTMLElement;
        if (!panel) return;

        if (this.statsVisible) {
            panel.style.display = 'block';
            this.renderStatsPanel();
        } else {
            panel.style.display = 'none';
        }
    }

    private renderStatsPanel(): void {
        const content = this.container?.querySelector('#evtx-stats-content');
        if (!content || this.events.length === 0) return;

        const stats = this.computeStatistics();
        const maxLevelCount = Math.max(...stats.levelDistribution.map(x => x.count), 1);
        const maxProviderCount = stats.topProviders[0]?.count || 1;
        const maxEventIdCount = stats.topEventIds[0]?.count || 1;
        const maxHourly = Math.max(...stats.hourlyDistribution, 1);

        content.innerHTML = `
            <div class="stats-cards-row">
                <div class="stats-card">
                    <div class="stats-card-value">${stats.totalEvents.toLocaleString()}</div>
                    <div class="stats-card-label">总事件数</div>
                </div>
                <div class="stats-card stats-card-alert">
                    <div class="stats-card-value">${stats.criticalErrorCount.toLocaleString()}</div>
                    <div class="stats-card-label">Critical + Error</div>
                </div>
                <div class="stats-card">
                    <div class="stats-card-value">${stats.uniqueProviders}</div>
                    <div class="stats-card-label">事件来源</div>
                </div>
                <div class="stats-card">
                    <div class="stats-card-value">${stats.timeRange}</div>
                    <div class="stats-card-label">时间跨度</div>
                </div>
            </div>
            <div class="stats-charts-row">
                <div class="stats-chart-section">
                    <div class="stats-chart-title">事件级别分布</div>
                    <div class="stats-bar-chart">
                        ${stats.levelDistribution.map(l => `
                            <div class="stats-bar-row">
                                <span class="stats-bar-label">${l.level}</span>
                                <div class="stats-bar-track">
                                    <div class="stats-bar-fill" style="width: ${(l.count / maxLevelCount * 100).toFixed(1)}%; background: ${l.color};"></div>
                                </div>
                                <span class="stats-bar-value">${l.count.toLocaleString()}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
                <div class="stats-chart-section">
                    <div class="stats-chart-title">Top 10 事件来源</div>
                    <div class="stats-bar-chart stats-bar-chart-sm">
                        ${stats.topProviders.map(p => `
                            <div class="stats-bar-row">
                                <span class="stats-bar-label" title="${this.escapeHtml(p.name)}">${this.truncateText(p.name, 20)}</span>
                                <div class="stats-bar-track">
                                    <div class="stats-bar-fill" style="width: ${(p.count / maxProviderCount * 100).toFixed(1)}%; background: var(--primary-color);"></div>
                                </div>
                                <span class="stats-bar-value">${p.count.toLocaleString()}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
                <div class="stats-chart-section">
                    <div class="stats-chart-title">Top 10 Event ID</div>
                    <div class="stats-bar-chart stats-bar-chart-sm">
                        ${stats.topEventIds.map(e => `
                            <div class="stats-bar-row">
                                <span class="stats-bar-label">${e.id}</span>
                                <div class="stats-bar-track">
                                    <div class="stats-bar-fill" style="width: ${(e.count / maxEventIdCount * 100).toFixed(1)}%; background: #8b5cf6;"></div>
                                </div>
                                <span class="stats-bar-value">${e.count.toLocaleString()}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
            <div class="stats-hourly-section">
                <div class="stats-chart-title">24小时事件分布</div>
                <div class="stats-hourly-chart">
                    ${stats.hourlyDistribution.map((count, hour) => `
                        <div class="stats-hourly-bar" title="${hour}:00 - ${count} 个事件" style="--bar-height: ${(count / maxHourly * 100).toFixed(1)}%;">
                            <div class="stats-hourly-fill"></div>
                            ${hour % 3 === 0 ? `<span class="stats-hourly-label">${hour}</span>` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    // ==================== 安全事件快速预设 ====================

    private bindSecurityPresetEvents(): void {
        if (!this.container) return;

        this.container.querySelectorAll('.preset-pill').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const el = e.currentTarget as HTMLElement;
                const ids = el.dataset.eventIds?.split(',').map(Number) || [];
                this.applySecurityPreset(ids);

                // 高亮当前选中的预设
                this.container?.querySelectorAll('.preset-pill').forEach(b => b.classList.remove('active'));
                el.classList.add('active');

                // 显示清除按钮
                const clearBtn = this.container?.querySelector('#preset-clear-btn') as HTMLElement;
                if (clearBtn) clearBtn.style.display = 'inline-flex';
            });
        });

        const clearBtn = this.container.querySelector('#preset-clear-btn');
        clearBtn?.addEventListener('click', () => {
            this.container?.querySelectorAll('.preset-pill').forEach(b => b.classList.remove('active'));
            (clearBtn as HTMLElement).style.display = 'none';
            this.filteredEvents = [...this.events];
            if (this.searchKeyword) this.performSearch(this.searchKeyword);
            else {
                this.currentPage = 1;
                this.calculatePagination();
                this.renderEventTable();
            }
        });
    }

    private applySecurityPreset(eventIds: number[]): void {
        this.filteredEvents = this.events.filter(e => eventIds.includes(e.event_id));

        if (this.searchKeyword) {
            this.filteredEvents = this.filteredEvents.filter(e => {
                const text = [e.message || '', e.provider_name, e.event_id.toString()].join(' ').toLowerCase();
                return text.includes(this.searchKeyword);
            });
        }

        this.currentPage = 1;
        this.calculatePagination();
        this.renderEventTable();
    }

    // ==================== 迷你时间线 ====================

    private renderMiniTimeline(): void {
        const container = this.container?.querySelector('#evtx-mini-timeline') as HTMLElement;
        const barsContainer = this.container?.querySelector('#mini-timeline-bars') as HTMLElement;
        if (!container || !barsContainer || this.events.length === 0) return;

        container.style.display = 'block';

        // 解析时间戳并分桶
        const BUCKETS = 80;
        const timestamps: number[] = [];
        for (const e of this.events) {
            try {
                const t = new Date(e.timestamp).getTime();
                if (!isNaN(t)) timestamps.push(t);
            } catch { /* skip */ }
        }
        if (timestamps.length === 0) { container.style.display = 'none'; return; }

        timestamps.sort((a, b) => a - b);
        const minT = timestamps[0];
        const maxT = timestamps[timestamps.length - 1];
        const range = maxT - minT || 1;
        const bucketWidth = range / BUCKETS;

        // 计算每桶数量和级别分布
        const buckets: { count: number; critical: number; error: number; warning: number }[] =
            Array.from({ length: BUCKETS }, () => ({ count: 0, critical: 0, error: 0, warning: 0 }));

        for (const e of this.events) {
            try {
                const t = new Date(e.timestamp).getTime();
                if (isNaN(t)) continue;
                let idx = Math.floor((t - minT) / bucketWidth);
                if (idx >= BUCKETS) idx = BUCKETS - 1;
                buckets[idx].count++;
                if (e.level === 1) buckets[idx].critical++;
                else if (e.level === 2) buckets[idx].error++;
                else if (e.level === 3) buckets[idx].warning++;
            } catch { /* skip */ }
        }

        const maxCount = Math.max(...buckets.map(b => b.count), 1);

        barsContainer.innerHTML = buckets.map((b, i) => {
            const h = (b.count / maxCount * 100).toFixed(1);
            const alertRatio = b.count > 0 ? (b.critical + b.error) / b.count : 0;
            const warnRatio = b.count > 0 ? b.warning / b.count : 0;
            let color = 'var(--primary-color)';
            if (alertRatio > 0.5) color = '#ef4444';
            else if (alertRatio > 0.2) color = '#f59e0b';
            else if (warnRatio > 0.5) color = '#f59e0b';

            return `<div class="mini-tl-bar" data-bucket="${i}" style="height: ${h}%; background: ${color};" title="${b.count} 个事件"></div>`;
        }).join('');

        // 时间标签
        const startEl = this.container?.querySelector('#mini-tl-start');
        const endEl = this.container?.querySelector('#mini-tl-end');
        if (startEl) startEl.textContent = new Date(minT).toLocaleString('zh-CN');
        if (endEl) endEl.textContent = new Date(maxT).toLocaleString('zh-CN');

        // 点击时间桶筛选
        barsContainer.querySelectorAll('.mini-tl-bar').forEach(bar => {
            bar.addEventListener('click', (ev) => {
                const idx = parseInt((ev.currentTarget as HTMLElement).dataset.bucket || '0');
                const start = new Date(minT + idx * bucketWidth);
                const end = new Date(minT + (idx + 1) * bucketWidth);

                this.filteredEvents = this.events.filter(e => {
                    try {
                        const t = new Date(e.timestamp).getTime();
                        return t >= start.getTime() && t < end.getTime();
                    } catch { return false; }
                });
                this.currentPage = 1;
                this.calculatePagination();
                this.renderEventTable();
            });
        });
    }

    // ==================== 导出功能 ====================

    private async exportEvents(): Promise<void> {
        if (this.filteredEvents.length === 0) {
            this.showToast('没有可导出的事件');
            return;
        }

        try {
            const { save } = await import('@tauri-apps/plugin-dialog');
            const filePath = await save({
                title: translate('导出事件日志'),
                filters: [
                    { name: translate('CSV 文件'), extensions: ['csv'] },
                    { name: translate('JSON 文件'), extensions: ['json'] },
                ],
                defaultPath: 'evtx_events.csv',
            });

            if (!filePath) return;

            const { writeTextFile } = await import('@tauri-apps/plugin-fs');

            if (filePath.endsWith('.json')) {
                const jsonData = this.filteredEvents.map(e => ({
                    event_id: e.event_id,
                    level: e.level_name,
                    provider: e.provider_name,
                    timestamp: e.timestamp,
                    message: e.message,
                    computer: e.computer_name,
                    user_sid: e.user_sid || '',
                    process_id: e.process_id || '',
                    thread_id: e.thread_id || '',
                }));
                await writeTextFile(filePath, JSON.stringify(jsonData, null, 2));
            } else {
                const csvEscape = (s: string) => {
                    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
                        return '"' + s.replace(/"/g, '""') + '"';
                    }
                    return s;
                };
                const headers = ['EventID', 'Level', 'Provider', 'Timestamp', 'Message', 'Computer', 'UserSID', 'ProcessID', 'ThreadID'];
                const rows = this.filteredEvents.map(e => [
                    e.event_id.toString(),
                    csvEscape(e.level_name),
                    csvEscape(e.provider_name),
                    csvEscape(e.timestamp),
                    csvEscape(e.message || ''),
                    csvEscape(e.computer_name),
                    csvEscape(e.user_sid || ''),
                    (e.process_id || '').toString(),
                    (e.thread_id || '').toString(),
                ].join(','));
                const csv = [headers.join(','), ...rows].join('\n');
                await writeTextFile(filePath, csv);
            }

            this.showToast(`已导出 ${this.filteredEvents.length} 条事件`);
        } catch (error) {
            console.error('导出失败:', error);
            this.showToast('导出失败');
        }
    }

    // ==================== 事件详情增强 ====================

    private highlightXml(xml: string): string {
        return this.escapeHtml(xml)
            .replace(/(&lt;\/?)([\w:]+)/g, '$1<span class="xml-tag">$2</span>')
            .replace(/([\w:]+)(=)/g, '<span class="xml-attr">$1</span>$2')
            .replace(/(=&quot;)([^&]*?)(&quot;)/g, '$1<span class="xml-value">$2</span>$3');
    }

    private findRelatedEvents(event: EvtxEvent): EvtxEvent[] {
        const related: EvtxEvent[] = [];
        const limit = 5;

        for (const e of this.events) {
            if (e === event) continue;
            if (e.event_id === event.event_id || (event.process_id && e.process_id === event.process_id)) {
                related.push(e);
                if (related.length >= limit) break;
            }
        }
        return related;
    }
}
