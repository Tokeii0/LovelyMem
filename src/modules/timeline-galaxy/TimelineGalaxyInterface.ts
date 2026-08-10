/**
 * 时间线星迹界面 - Timeline Galaxy (星迹)
 * 使用力导向图可视化展示时间线事件之间的关系
 * 使用力导向布局呈现星图效果
 */

import { invoke } from '@tauri-apps/api/core';
import './styles/timeline-galaxy.css';
import IconParkHelper from '../utils/iconparkHelper';

// 时间线事件类型颜色映射
const TYPE_COLORS: Record<string, string> = {
    'THREAD': '#10b981',    // Emerald - 线程
    'PROCESS': '#10b981',   // Emerald - 进程
    'Net': '#3b82f6',       // Blue - 网络
    'SOCKET': '#3b82f6',    // Blue - 套接字
    'NTFS': '#f59e0b',      // Amber - NTFS
    'FILE': '#f59e0b',      // Amber - 文件
    'REG': '#8b5cf6',       // Violet - 注册表
    'REGISTRY': '#8b5cf6',  // Violet - 注册表
    'WEB': '#ec4899',       // Pink - Web
    'TASK': '#06b6d4',      // Cyan - 任务
    'PREFETCH': '#84cc16',  // Lime - 预读取
    'Default': '#64748b'    // Slate - 默认
};

// 操作类型颜色映射
const ACTION_COLORS: Record<string, string> = {
    'CRE': '#22c55e',   // Green - 创建
    'MOD': '#f59e0b',   // Amber - 修改
    'DEL': '#ef4444',   // Red - 删除
    'RD': '#3b82f6',    // Blue - 读取
    'Default': '#64748b'
};

// 时间线数据接口
interface TimelineData {
    Time: string;
    Type: string;
    Action: string;
    PID: string;
    Value32: string;
    Value64: string;
    Text: string;
    Timestamp?: Date;
    id?: number;
}

// 声明 D3 全局变量类型
declare const d3: any;

// D3 节点基础类型
interface SimulationNodeDatum {
    index?: number;
    x?: number;
    y?: number;
    vx?: number;
    vy?: number;
    fx?: number | null;
    fy?: number | null;
}

// D3 节点接口
interface GalaxyNode extends SimulationNodeDatum {
    id: string;
    label: string;
    size: number;
    color: string;
    type: 'STAR' | 'PLANET' | 'EVENT';  // STAR = PID中心, PLANET = Type, EVENT = 时间事件
    rawPid: string;
    eventType?: string;
    timestamp?: number;
    timeLabel?: string;
    stats?: {
        count: number;
        types: Set<string>;
        actions: Set<string>;
        firstTime?: string;
        lastTime?: string;
    };
}

// D3 连线接口
interface GalaxyLink {
    source: string | GalaxyNode;
    target: string | GalaxyNode;
    color: string;
    linkType?: 'time-sequence' | 'pid-relation' | 'type-relation';  // 连线类型
    strength?: number;
}

// 图数据接口
interface GraphData {
    nodes: GalaxyNode[];
    links: GalaxyLink[];
}

export class TimelineGalaxyInterface {
    private container: HTMLElement | null = null;
    private rawData: TimelineData[] = [];
    private filteredData: TimelineData[] = [];
    private graphData: GraphData | null = null;
    private simulation: any = null;
    private svg: any = null;
    private g: any = null;
    private zoomBehavior: any = null;  // 缩放行为实例
    private isLoading: boolean = false;
    private d3Loaded: boolean = false;
    private dataLoaded: boolean = false;  // 数据是否已加载标记
    private detailPanelOpen: boolean = false;  // 详情面板是否打开
    private processData: any[] = [];  // 进程数据缓存
    private threadsData: any[] = [];  // 线程数据缓存
    
    // 过滤状态
    private searchTerm: string = '';
    private selectedType: string = 'ALL';
    private selectedPid: string = '';
    
    // 时间筛选状态
    private startTime: string = '';
    private endTime: string = '';
    private minTime: Date | null = null;  // 数据中的最早时间
    private maxTime: Date | null = null;  // 数据中的最晚时间
    
    // 分页状态
    private currentPage: number = 1;
    private itemsPerPage: number = 15;

    // 线条可见性状态
    private linkVisibility = {
        pidRelation: true,      // PID关系线（彩色）
        timeSequence: true,     // 时间顺序线（灰色虚线）
        crossPid: false         // 跨PID关联线（红色）- 默认不显示
    };

    // 缓存的 SVG 图标
    private icons = {
        refresh: IconParkHelper.getSvgString('refresh', { size: 16 }),
        search: IconParkHelper.getSvgString('search', { size: 16 }),
        zoomIn: IconParkHelper.getSvgString('zoom-in', { size: 16 }),
        zoomOut: IconParkHelper.getSvgString('zoom-out', { size: 16 }),
        home: IconParkHelper.getSvgString('home', { size: 16 }),
        close: IconParkHelper.getSvgString('close', { size: 16 }),
        filter: IconParkHelper.getSvgString('filter', { size: 16 }),
        time: IconParkHelper.getSvgString('time', { size: 14 }),
        info: IconParkHelper.getSvgString('info', { size: 14 }),
        fullscreen: IconParkHelper.getSvgString('full-screen', { size: 16 }),
        exitFullscreen: IconParkHelper.getSvgString('off-screen', { size: 16 }),
        galaxy: IconParkHelper.getSvgString('planet', { size: 14 }),
        database: IconParkHelper.getSvgString('data', { size: 14 }),
        cpu: IconParkHelper.getSvgString('cpu', { size: 14 }),
        left: IconParkHelper.getSvgString('left', { size: 14 }),
        right: IconParkHelper.getSvgString('right', { size: 14 }),
        up: IconParkHelper.getSvgString('up', { size: 14 }),
        down: IconParkHelper.getSvgString('down', { size: 14 }),
    };

    constructor() {}

    /**
     * 渲染界面HTML
     */
    public render(): string {
        return `
            <div class="timeline-galaxy-container" id="timeline-galaxy-root">
                <!-- 顶部工具栏 -->
                <div class="tg-toolbar">
                    <div class="tg-toolbar-left">
                        <div class="tg-title">
                            ${this.icons.galaxy}
                            <span>星迹 StarTrace</span>
                        </div>
                    </div>
                    <div class="tg-toolbar-right">
                        <div class="tg-search">
                            <span class="search-icon">${this.icons.search}</span>
                            <input type="text" 
                                   id="tg-search-input" 
                                   class="tg-search-input" 
                                   placeholder="搜索路径、PID..."
                                   autocomplete="off">
                        </div>
                        <select id="tg-type-filter" class="tg-select">
                            <option value="ALL">全部类型</option>
                        </select>
                        <input type="text" 
                               id="tg-pid-filter" 
                               class="tg-pid-input" 
                               placeholder="PID"
                               autocomplete="off">
                        <div class="tg-time-filter">
                            <span class="time-filter-label">${this.icons.time} 时间:</span>
                            <input type="datetime-local" 
                                   id="tg-start-time" 
                                   class="tg-datetime-input" 
                                   title="开始时间">
                            <span class="time-separator">至</span>
                            <input type="datetime-local" 
                                   id="tg-end-time" 
                                   class="tg-datetime-input" 
                                   title="结束时间">
                            <button class="tg-btn tg-btn-small" id="tg-clear-time-btn" title="清除时间筛选">
                                ${this.icons.close}
                            </button>
                        </div>
                        <button class="tg-btn" id="tg-refresh-btn" title="重新加载数据">
                            ${this.icons.refresh}
                        </button>
                    </div>
                </div>
                
                <!-- 主内容区域 -->
                <div class="tg-main-content">
                    <!-- 星图区域 -->
                    <div class="tg-galaxy-section">
                        <div class="tg-section-header">
                            <h3>${this.icons.galaxy} 活动星图 (全部 PID)</h3>
                            <span class="tg-section-hint">滚轮缩放 • 拖拽移动 • 点击恒星筛选</span>
                        </div>
                        <div class="tg-canvas-wrapper" id="tg-canvas-wrapper">
                            <!-- 加载状态 -->
                            <div class="tg-loading" id="tg-loading">
                                <div class="loading-spinner"></div>
                                <div class="loading-text">正在加载时间线数据...</div>
                            </div>
                            
                            <!-- 空状态 -->
                            <div class="tg-empty" id="tg-empty" style="display: none;">
                                <div class="empty-icon">${this.icons.galaxy}</div>
                                <div class="empty-title">暂无时间线数据</div>
                                <div class="empty-desc">请先加载内存镜像并生成 forensic 数据</div>
                                <button class="btn-primary" id="tg-retry-btn">重新加载</button>
                            </div>
                            
                            <!-- SVG 画布 -->
                            <svg id="tg-svg" class="tg-svg"></svg>
                            
                            <!-- 左上角统计图例 -->
                            <div class="galaxy-legend" id="galaxy-legend">
                                <div class="legend-item">
                                    <span class="legend-icon blue">${this.icons.database}</span>
                                    <span class="legend-label">事件</span>
                                    <span class="legend-value" id="stat-total">0</span>
                                </div>
                                <div class="legend-item">
                                    <span class="legend-icon green">${this.icons.cpu}</span>
                                    <span class="legend-label">PID</span>
                                    <span class="legend-value" id="stat-pids">0</span>
                                </div>
                                <div class="legend-item">
                                    <span class="legend-icon violet">${this.icons.time}</span>
                                    <span class="legend-label">时间</span>
                                    <span class="legend-value small" id="stat-time-range">-</span>
                                </div>
                                <div class="legend-item">
                                    <span class="legend-icon amber">${this.icons.galaxy}</span>
                                    <span class="legend-label">活跃</span>
                                    <span class="legend-value" id="stat-top-activity">-</span>
                                </div>
                            </div>
                            
                            <!-- 悬浮提示 -->
                            <div class="tg-tooltip" id="tg-tooltip" style="display: none;"></div>
                        </div>
                        
                            <!-- 缩放控制 -->
                        <div class="tg-zoom-controls">
                            <button class="zoom-btn" id="tg-zoom-in-btn" title="放大">${this.icons.zoomIn}</button>
                            <button class="zoom-btn" id="tg-zoom-out-btn" title="缩小">${this.icons.zoomOut}</button>
                        </div>
                        
                        <!-- 线条控制面板 -->
                        <div class="tg-link-controls" id="tg-link-controls">
                            <div class="link-control-title">线条显示</div>
                            <label class="link-control-item">
                                <input type="checkbox" id="link-pid-relation" checked>
                                <span class="link-color-dot" style="background: linear-gradient(90deg, #fbbf24, #60a5fa, #34d399);"></span>
                                <span class="link-label">PID关系</span>
                            </label>
                            <label class="link-control-item">
                                <input type="checkbox" id="link-time-sequence" checked>
                                <span class="link-color-dot" style="background: #94a3b8;"></span>
                                <span class="link-label">时间顺序</span>
                            </label>
                            <label class="link-control-item">
                                <input type="checkbox" id="link-cross-pid">
                                <span class="link-color-dot" style="background: #ef4444;"></span>
                                <span class="link-label">跨PID关联</span>
                            </label>
                        </div>                        <!-- 侧边详情面板 -->
                        <div class="tg-detail-panel" id="tg-detail-panel">
                            <div class="detail-panel-header">
                                <h4 id="detail-panel-title">节点详情</h4>
                                <button class="detail-panel-close" id="detail-panel-close">${this.icons.close}</button>
                            </div>
                            <div class="detail-panel-content" id="detail-panel-content">
                                <!-- 动态内容 -->
                            </div>
                        </div>
                    </div>
                    
                    <!-- 数据表格区域（可收缩）- 默认收缩 -->
                    <div class="tg-table-section collapsed" id="tg-table-section">
                        <div class="tg-table-collapse-header" id="tg-table-collapse-header">
                            <span class="collapse-title">${this.icons.database} 事件列表</span>
                            <span class="collapse-icon" id="collapse-icon">${this.icons.up}</span>
                        </div>
                        <div class="tg-table-collapse-content" id="tg-table-collapse-content">
                            <div class="tg-table-wrapper" id="tg-table-wrapper">
                                <table class="tg-table">
                                    <thead>
                                        <tr>
                                            <th class="col-time">时间</th>
                                            <th class="col-type">类型</th>
                                            <th class="col-action">操作</th>
                                            <th class="col-pid">PID</th>
                                            <th class="col-text">描述 / 路径 / 详情</th>
                                        </tr>
                                    </thead>
                                    <tbody id="tg-table-body">
                                        <!-- 动态生成 -->
                                    </tbody>
                                </table>
                            </div>
                            
                            <!-- 分页控制 -->
                            <div class="tg-pagination">
                                <div class="pagination-info">
                                    显示 <span id="page-start">0</span> 至 <span id="page-end">0</span>，共 <span id="page-total">0</span> 条事件
                                </div>
                                <div class="pagination-controls">
                                    <button class="page-btn" id="prev-page-btn">${this.icons.left}</button>
                                    <span class="page-indicator"><span id="current-page">1</span> / <span id="total-pages">1</span></span>
                                    <button class="page-btn" id="next-page-btn">${this.icons.right}</button>
                                </div>
                            </div>
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

        // 加载 D3.js
        await this.loadD3();

        // 绑定事件
        this.bindEvents();

        // 如果数据已加载，直接渲染，否则加载数据
        if (this.dataLoaded && this.rawData.length > 0) {
            console.log('✅ 星迹使用缓存数据渲染');
            this.hideLoading();
            this.restoreFilterState();
            this.applyFilters();
        } else {
            await this.loadTimelineData();
        }
    }

    /**
     * 恢复筛选状态到 UI
     */
    private restoreFilterState(): void {
        const searchInput = this.container?.querySelector('#tg-search-input') as HTMLInputElement;
        const typeFilter = this.container?.querySelector('#tg-type-filter') as HTMLSelectElement;
        const pidInput = this.container?.querySelector('#tg-pid-filter') as HTMLInputElement;
        const startTimeInput = this.container?.querySelector('#tg-start-time') as HTMLInputElement;
        const endTimeInput = this.container?.querySelector('#tg-end-time') as HTMLInputElement;

        if (searchInput) searchInput.value = this.searchTerm;
        if (typeFilter) {
            this.updateTypeFilterOptions();
            typeFilter.value = this.selectedType;
        }
        if (pidInput) pidInput.value = this.selectedPid;
        if (startTimeInput) startTimeInput.value = this.startTime;
        if (endTimeInput) endTimeInput.value = this.endTime;
    }

    /**
     * 动态加载 D3.js（多源回退）
     */
    private async loadD3(): Promise<void> {
        if (this.d3Loaded && typeof d3 !== 'undefined') {
            return;
        }

        if (typeof d3 !== 'undefined') {
            this.d3Loaded = true;
            console.log('✅ D3.js 已经存在 (Timeline Galaxy)');
            return;
        }

        // 检查是否有正在加载的脚本
        const existingScript = document.querySelector('script[src*="d3"]');
        if (existingScript) {
            await new Promise<void>((resolve) => {
                const checkD3 = setInterval(() => {
                    if (typeof d3 !== 'undefined') {
                        clearInterval(checkD3);
                        this.d3Loaded = true;
                        resolve();
                    }
                }, 100);
                setTimeout(() => {
                    clearInterval(checkD3);
                    resolve();
                }, 5000);
            });
            if (typeof d3 !== 'undefined') {
                this.d3Loaded = true;
                return;
            }
        }

        // 尝试加载本地文件，失败则使用 CDN
        const sources = [
            '/assets/js/d3.v7.min.js',
            './assets/js/d3.v7.min.js',
            'https://d3js.org/d3.v7.min.js'
        ];

        for (const src of sources) {
            try {
                await this.loadScript(src);
                if (typeof d3 !== 'undefined') {
                    this.d3Loaded = true;
                    console.log(`✅ D3.js 加载成功 (Timeline Galaxy): ${src}`);
                    return;
                }
            } catch (error) {
                console.warn(`⚠️ 尝试加载 D3.js 失败: ${src}`);
            }
        }

        console.error('❌ 所有 D3.js 源加载失败 (Timeline Galaxy)');
        throw new Error('Failed to load D3.js from all sources');
    }

    /**
     * 加载脚本的辅助方法
     */
    private loadScript(src: string): Promise<void> {
        return new Promise((resolve, reject) => {
            // 临时屏蔽 AMD define，避免与 Monaco loader.js 冲突
            const win = window as any;
            const savedDefine = win.define;
            win.define = undefined;

            const script = document.createElement('script');
            script.src = src;
            script.async = true;
            script.onload = () => {
                win.define = savedDefine;
                resolve();
            };
            script.onerror = () => {
                win.define = savedDefine;
                reject(new Error(`Failed to load: ${src}`));
            };
            document.head.appendChild(script);
        });
    }

    /**
     * 绑定DOM事件
     */
    private bindEvents(): void {
        if (!this.container) return;

        // 刷新按钮
        const refreshBtn = this.container.querySelector('#tg-refresh-btn');
        refreshBtn?.addEventListener('click', () => this.loadTimelineData());

        // 重置视图按钮
        const resetViewBtn = this.container.querySelector('#tg-reset-view-btn');
        resetViewBtn?.addEventListener('click', () => this.resetView());

        // 全屏按钮
        const fullscreenBtn = this.container.querySelector('#tg-fullscreen-btn');
        fullscreenBtn?.addEventListener('click', () => this.toggleFullscreen());

        // 搜索输入
        const searchInput = this.container.querySelector('#tg-search-input') as HTMLInputElement;
        if (searchInput) {
            let searchTimeout: number;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(searchTimeout);
                searchTimeout = window.setTimeout(() => {
                    this.searchTerm = (e.target as HTMLInputElement).value;
                    this.applyFilters();
                }, 300);
            });
        }

        // 类型过滤
        const typeFilter = this.container.querySelector('#tg-type-filter') as HTMLSelectElement;
        typeFilter?.addEventListener('change', (e) => {
            this.selectedType = (e.target as HTMLSelectElement).value;
            this.applyFilters();
        });

        // PID 过滤
        const pidFilter = this.container.querySelector('#tg-pid-filter') as HTMLInputElement;
        pidFilter?.addEventListener('input', (e) => {
            this.selectedPid = (e.target as HTMLInputElement).value;
            this.applyFilters();
        });

        // 时间筛选
        const startTimeInput = this.container.querySelector('#tg-start-time') as HTMLInputElement;
        const endTimeInput = this.container.querySelector('#tg-end-time') as HTMLInputElement;
        const clearTimeBtn = this.container.querySelector('#tg-clear-time-btn');

        startTimeInput?.addEventListener('change', (e) => {
            this.startTime = (e.target as HTMLInputElement).value;
            this.applyFilters();
        });

        endTimeInput?.addEventListener('change', (e) => {
            this.endTime = (e.target as HTMLInputElement).value;
            this.applyFilters();
        });

        clearTimeBtn?.addEventListener('click', () => {
            // 重置为数据的原始时间范围
            this.setDefaultTimeRange();
            this.applyFilters();
        });

        // 缩放按钮
        const zoomInBtn = this.container.querySelector('#tg-zoom-in-btn');
        const zoomOutBtn = this.container.querySelector('#tg-zoom-out-btn');
        
        zoomInBtn?.addEventListener('click', () => this.zoom(1.2));
        zoomOutBtn?.addEventListener('click', () => this.zoom(0.8));

        // 线条可见性控制
        const linkPidRelation = this.container.querySelector('#link-pid-relation') as HTMLInputElement;
        const linkTimeSequence = this.container.querySelector('#link-time-sequence') as HTMLInputElement;
        const linkCrossPid = this.container.querySelector('#link-cross-pid') as HTMLInputElement;

        linkPidRelation?.addEventListener('change', (e) => {
            this.linkVisibility.pidRelation = (e.target as HTMLInputElement).checked;
            this.updateLinkVisibility();
        });
        linkTimeSequence?.addEventListener('change', (e) => {
            this.linkVisibility.timeSequence = (e.target as HTMLInputElement).checked;
            this.updateLinkVisibility();
        });
        linkCrossPid?.addEventListener('change', (e) => {
            this.linkVisibility.crossPid = (e.target as HTMLInputElement).checked;
            this.updateLinkVisibility();
        });

        // 分页按钮
        const prevPageBtn = this.container.querySelector('#prev-page-btn');
        const nextPageBtn = this.container.querySelector('#next-page-btn');
        
        prevPageBtn?.addEventListener('click', () => {
            if (this.currentPage > 1) {
                this.currentPage--;
                this.renderTable();
            }
        });
        
        nextPageBtn?.addEventListener('click', () => {
            const totalPages = Math.ceil(this.filteredData.length / this.itemsPerPage);
            if (this.currentPage < totalPages) {
                this.currentPage++;
                this.renderTable();
            }
        });

        // 重试按钮
        const retryBtn = this.container.querySelector('#tg-retry-btn');
        retryBtn?.addEventListener('click', () => this.loadTimelineData());

        // 详情面板关闭按钮
        const detailPanelClose = this.container.querySelector('#detail-panel-close');
        detailPanelClose?.addEventListener('click', () => this.closeDetailPanel());

        // 表格收缩/展开
        const tableCollapseHeader = this.container.querySelector('#tg-table-collapse-header');
        tableCollapseHeader?.addEventListener('click', () => this.toggleTableCollapse());
    }

    /**
     * 切换表格收缩/展开状态
     */
    private toggleTableCollapse(): void {
        const tableSection = this.container?.querySelector('#tg-table-section') as HTMLElement;
        const collapseIcon = this.container?.querySelector('#collapse-icon') as HTMLElement;
        
        if (!tableSection) return;

        const isCollapsed = tableSection.classList.toggle('collapsed');
        
        if (collapseIcon) {
            // 收缩时显示向上箭头（点击可展开），展开时显示向下箭头（点击可收缩）
            collapseIcon.innerHTML = isCollapsed ? this.icons.up : this.icons.down;
        }
    }

    /**
     * 加载时间线数据
     */
    private async loadTimelineData(): Promise<void> {
        if (this.isLoading) return;
        this.isLoading = true;

        this.showLoading();

        try {
            // 从后端读取 timeline_all.csv
            const result = await invoke('read_timeline_csv') as { headers: string[], rows: string[][] };
            
            if (!result || !result.rows || result.rows.length === 0) {
                this.showEmpty();
                return;
            }

            // 转换为 TimelineData 数组
            this.rawData = this.convertToTimelineData(result.headers, result.rows);
            
            if (this.rawData.length === 0) {
                this.showEmpty();
                return;
            }

            // 计算时间范围
            this.calculateTimeRange();

            console.log(`✅ 星迹加载完成: ${this.rawData.length} 条时间线事件`);

            // 标记数据已加载
            this.dataLoaded = true;

            // 更新类型过滤器选项
            this.updateTypeFilterOptions();

            // 应用过滤
            this.applyFilters();

            this.hideLoading();
        } catch (error) {
            console.error('加载时间线数据失败:', error);
            this.showEmpty();
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * 计算数据的时间范围
     */
    private calculateTimeRange(): void {
        if (this.rawData.length === 0) return;

        let minTime: Date | null = null;
        let maxTime: Date | null = null;

        this.rawData.forEach(item => {
            if (item.Timestamp) {
                if (!minTime || item.Timestamp < minTime) {
                    minTime = item.Timestamp;
                }
                if (!maxTime || item.Timestamp > maxTime) {
                    maxTime = item.Timestamp;
                }
            }
        });

        this.minTime = minTime;
        this.maxTime = maxTime;

        // 设置默认时间范围并更新 UI
        this.setDefaultTimeRange();
    }

    /**
     * 设置默认时间范围
     */
    private setDefaultTimeRange(): void {
        if (!this.minTime || !this.maxTime) return;

        // 转换为 datetime-local 格式 (YYYY-MM-DDTHH:mm)
        this.startTime = this.formatDateTimeLocal(this.minTime);
        this.endTime = this.formatDateTimeLocal(this.maxTime);

        // 更新 UI
        const startTimeInput = this.container?.querySelector('#tg-start-time') as HTMLInputElement;
        const endTimeInput = this.container?.querySelector('#tg-end-time') as HTMLInputElement;

        if (startTimeInput) startTimeInput.value = this.startTime;
        if (endTimeInput) endTimeInput.value = this.endTime;
    }

    /**
     * 格式化日期为 datetime-local 输入框格式
     */
    private formatDateTimeLocal(date: Date): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    }

    /**
     * 将 CSV 数据转换为 TimelineData 数组
     */
    private convertToTimelineData(headers: string[], rows: string[][]): TimelineData[] {
        const data: TimelineData[] = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const obj: any = { id: i + 1 };
            
            headers.forEach((header, index) => {
                obj[header] = row[index] || '';
            });

            // 解析时间
            if (obj.Time) {
                const parsed = new Date(obj.Time);
                obj.Timestamp = isNaN(parsed.getTime()) ? new Date() : parsed;
            }

            data.push(obj as TimelineData);
        }

        // 按时间倒序排序
        return data.sort((a, b) => {
            const timeA = a.Timestamp?.getTime() || 0;
            const timeB = b.Timestamp?.getTime() || 0;
            return timeB - timeA;
        });
    }

    /**
     * 更新类型过滤器选项
     */
    private updateTypeFilterOptions(): void {
        const typeFilter = this.container?.querySelector('#tg-type-filter') as HTMLSelectElement;
        if (!typeFilter) return;

        const types = new Set(this.rawData.map(d => d.Type));
        const sortedTypes = Array.from(types).sort();

        typeFilter.innerHTML = `<option value="ALL">全部类型</option>` +
            sortedTypes.map(t => `<option value="${t}">${t}</option>`).join('');
    }

    /**
     * 应用过滤器
     */
    private applyFilters(): void {
        const searchLower = this.searchTerm.toLowerCase().trim();
        
        // 解析时间筛选
        const startDate = this.startTime ? new Date(this.startTime) : null;
        const endDate = this.endTime ? new Date(this.endTime) : null;

        this.filteredData = this.rawData.filter(item => {
            // 搜索过滤
            const matchSearch = searchLower === '' || 
                item.Text.toLowerCase().includes(searchLower) ||
                item.Type.toLowerCase().includes(searchLower) ||
                item.Time.includes(searchLower) ||
                item.PID === searchLower;
            
            // 类型过滤
            const matchType = this.selectedType === 'ALL' || item.Type === this.selectedType;
            
            // PID 过滤
            const matchPid = this.selectedPid === '' || item.PID === this.selectedPid;

            // 时间过滤
            let matchTime = true;
            if (item.Timestamp) {
                if (startDate && item.Timestamp < startDate) {
                    matchTime = false;
                }
                if (endDate && item.Timestamp > endDate) {
                    matchTime = false;
                }
            }

            return matchSearch && matchType && matchPid && matchTime;
        });

        // 重置分页
        this.currentPage = 1;

        // 更新统计
        this.updateStats();

        // 构建图数据并渲染
        this.graphData = this.buildGraphData(this.filteredData);
        this.renderGraph();

        // 渲染表格
        this.renderTable();
    }

    /**
     * 更新统计信息
     */
    private updateStats(): void {
        const types: Record<string, number> = {};
        const pids = new Set<string>();

        this.filteredData.forEach(item => {
            types[item.Type] = (types[item.Type] || 0) + 1;
            pids.add(item.PID);
        });

        // 更新统计卡片
        const totalEl = this.container?.querySelector('#stat-total');
        const pidsEl = this.container?.querySelector('#stat-pids');
        const timeRangeEl = this.container?.querySelector('#stat-time-range');
        const topActivityEl = this.container?.querySelector('#stat-top-activity');

        if (totalEl) totalEl.textContent = this.filteredData.length.toLocaleString();
        if (pidsEl) pidsEl.textContent = pids.size.toString();
        
        if (timeRangeEl && this.filteredData.length > 0) {
            const oldest = this.filteredData[this.filteredData.length - 1].Time.split(' ')[0];
            const newest = this.filteredData[0].Time.split(' ')[0];
            timeRangeEl.textContent = oldest === newest ? oldest : `${oldest} → ${newest}`;
        }

        if (topActivityEl) {
            const topType = Object.entries(types).sort((a, b) => b[1] - a[1])[0];
            topActivityEl.textContent = topType ? topType[0] : '暂无';
        }
    }

    /**
     * 构建图数据 - 基于时间关系的可视化
     * 采用采样策略：对大数据集进行智能采样，保留关键事件
     */
    private buildGraphData(data: TimelineData[]): GraphData {
        if (!data || data.length === 0) return { nodes: [], links: [] };

        const nodes: GalaxyNode[] = [];
        const links: GalaxyLink[] = [];
        const nodeMap = new Map<string, GalaxyNode>();

        // 1. 统计每个 PID 的事件数量和类型
        const pidStats: Record<string, { 
            count: number; 
            types: Set<string>; 
            actions: Set<string>;
            firstTime: Date | null;
            lastTime: Date | null;
            events: TimelineData[];
        }> = {};
        
        data.forEach(item => {
            if (!pidStats[item.PID]) {
                pidStats[item.PID] = { 
                    count: 0, 
                    types: new Set(), 
                    actions: new Set(),
                    firstTime: null,
                    lastTime: null,
                    events: []
                };
            }
            const stat = pidStats[item.PID];
            stat.count++;
            stat.types.add(item.Type);
            stat.actions.add(item.Action);
            stat.events.push(item);
            
            if (item.Timestamp) {
                if (!stat.firstTime || item.Timestamp < stat.firstTime) {
                    stat.firstTime = item.Timestamp;
                }
                if (!stat.lastTime || item.Timestamp > stat.lastTime) {
                    stat.lastTime = item.Timestamp;
                }
            }
        });

        // 2. 按活跃度排序 PIDs，取前 N 个最活跃的
        const maxPids = 20;
        const sortedPids = Object.entries(pidStats)
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, maxPids);

        // 3. 为每个 PID 创建中心节点，并采样其事件
        const maxEventsPerPid = 15;  // 每个 PID 最多显示的事件数
        
        sortedPids.forEach(([pid, stats], pidIndex) => {
            // 创建 PID 中心节点
            const pidNodeId = `PID-${pid}`;
            const pidSize = Math.min(Math.max(Math.sqrt(stats.count) * 3, 20), 50);
            
            const pidNode: GalaxyNode = {
                id: pidNodeId,
                label: pid === '0' ? 'SYSTEM' : `PID ${pid}`,
                size: pidSize,
                color: this.getPidColor(pidIndex),
                type: 'STAR',
                rawPid: pid,
                stats: {
                    count: stats.count,
                    types: stats.types,
                    actions: stats.actions,
                    firstTime: stats.firstTime?.toLocaleString('zh-CN'),
                    lastTime: stats.lastTime?.toLocaleString('zh-CN')
                }
            };
            nodes.push(pidNode);
            nodeMap.set(pidNodeId, pidNode);

            // 采样该 PID 的事件：取首尾和中间均匀分布的事件
            const events = stats.events.sort((a, b) => 
                (a.Timestamp?.getTime() || 0) - (b.Timestamp?.getTime() || 0)
            );
            
            const sampledEvents = this.sampleEvents(events, maxEventsPerPid);
            
            // 为每个采样事件创建节点
            let prevEventNodeId: string | null = null;
            
            sampledEvents.forEach((event) => {
                const eventNodeId = `EVENT-${pid}-${event.id}`;
                const eventNode: GalaxyNode = {
                    id: eventNodeId,
                    label: this.truncateText(event.Text, 20),
                    size: 8,
                    color: TYPE_COLORS[event.Type] || TYPE_COLORS.Default,
                    type: 'EVENT',
                    rawPid: pid,
                    eventType: event.Type,
                    timestamp: event.Timestamp?.getTime(),
                    timeLabel: event.Time
                };
                nodes.push(eventNode);
                nodeMap.set(eventNodeId, eventNode);

                // 连接到 PID 中心
                links.push({
                    source: pidNodeId,
                    target: eventNodeId,
                    color: this.getPidColor(pidIndex) + '80',
                    linkType: 'pid-relation',
                    strength: 0.3
                });

                // 按时间顺序连接事件
                if (prevEventNodeId) {
                    links.push({
                        source: prevEventNodeId,
                        target: eventNodeId,
                        color: '#94a3b8',
                        linkType: 'time-sequence',
                        strength: 0.8
                    });
                }
                prevEventNodeId = eventNodeId;
            });
        });

        // 4. 检测跨 PID 的时间关联（相近时间内不同 PID 的事件可能相关）
        this.addCrossTimeLinks(nodes, links, data);

        return { nodes, links };
    }

    /**
     * 获取 PID 颜色
     */
    private getPidColor(index: number): string {
        const colors = [
            '#fbbf24', // 金色
            '#60a5fa', // 蓝色
            '#34d399', // 绿色
            '#f472b6', // 粉色
            '#a78bfa', // 紫色
            '#fb923c', // 橙色
            '#2dd4bf', // 青色
            '#e879f9', // 洋红
            '#4ade80', // 浅绿
            '#f87171', // 红色
        ];
        return colors[index % colors.length];
    }

    /**
     * 智能采样事件：保留首尾和均匀分布的中间事件
     */
    private sampleEvents(events: TimelineData[], maxCount: number): TimelineData[] {
        if (events.length <= maxCount) return events;
        
        const sampled: TimelineData[] = [];
        
        // 必须包含首尾
        sampled.push(events[0]);
        
        // 均匀采样中间事件
        const step = (events.length - 2) / (maxCount - 2);
        for (let i = 1; i < maxCount - 1; i++) {
            const idx = Math.floor(1 + i * step);
            if (idx < events.length - 1) {
                sampled.push(events[idx]);
            }
        }
        
        // 添加最后一个
        if (events.length > 1) {
            sampled.push(events[events.length - 1]);
        }
        
        return sampled;
    }

    /**
     * 添加跨 PID 的时间关联连线
     * 检测在短时间窗口内发生的不同 PID 事件
     */
    private addCrossTimeLinks(nodes: GalaxyNode[], links: GalaxyLink[], _data: TimelineData[]): void {
        const eventNodes = nodes.filter(n => n.type === 'EVENT' && n.timestamp);
        
        // 按时间排序
        eventNodes.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        
        // 检测 2 秒内的跨 PID 事件
        const timeWindowMs = 2000;
        
        for (let i = 0; i < eventNodes.length - 1; i++) {
            const current = eventNodes[i];
            
            for (let j = i + 1; j < eventNodes.length; j++) {
                const next = eventNodes[j];
                const timeDiff = (next.timestamp || 0) - (current.timestamp || 0);
                
                if (timeDiff > timeWindowMs) break;  // 超出时间窗口
                
                // 不同 PID 且时间相近
                if (current.rawPid !== next.rawPid) {
                    links.push({
                        source: current.id,
                        target: next.id,
                        color: '#ef4444',  // 红色
                        linkType: 'time-sequence',
                        strength: 0.1
                    });
                }
            }
        }
    }

    /**
     * 截断文本
     */
    private truncateText(text: string, maxLen: number): string {
        if (!text) return '';
        // 取最后一部分（通常是文件名）
        const parts = text.split(/[\\\/]/);
        const lastPart = parts[parts.length - 1] || text;
        return lastPart.length > maxLen ? lastPart.substring(0, maxLen) + '...' : lastPart;
    }

    /**
     * 渲染星图 - 使用 D3 力导向图
     */
    private renderGraph(): void {
        if (!this.graphData || !this.d3Loaded || !this.container) return;

        const canvasWrapper = this.container.querySelector('#tg-canvas-wrapper');
        const svgElement = this.container.querySelector('#tg-svg');
        if (!canvasWrapper || !svgElement) return;

        const width = canvasWrapper.clientWidth;
        const height = canvasWrapper.clientHeight;

        // 停止旧的模拟
        if (this.simulation) {
            this.simulation.stop();
        }

        // 清除旧图表
        d3.select(svgElement).selectAll('*').remove();

        this.svg = d3.select(svgElement)
            .attr('viewBox', [-width/2, -height/2, width, height])
            .attr('width', '100%')
            .attr('height', '100%');

        // 定义滤镜
        const defs = this.svg.append('defs');
        
        // 发光滤镜
        const glowFilter = defs.append('filter')
            .attr('id', 'glow')
            .attr('x', '-50%')
            .attr('y', '-50%')
            .attr('width', '200%')
            .attr('height', '200%');
        
        glowFilter.append('feGaussianBlur')
            .attr('stdDeviation', '3')
            .attr('result', 'coloredBlur');
        
        const feMerge = glowFilter.append('feMerge');
        feMerge.append('feMergeNode').attr('in', 'coloredBlur');
        feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

        // 箭头标记
        defs.append('marker')
            .attr('id', 'arrowhead')
            .attr('viewBox', '-0 -5 10 10')
            .attr('refX', 15)
            .attr('refY', 0)
            .attr('orient', 'auto')
            .attr('markerWidth', 6)
            .attr('markerHeight', 6)
            .append('path')
            .attr('d', 'M 0,-5 L 10,0 L 0,5')
            .attr('fill', '#ffffff30');

        // 创建容器组以支持缩放
        this.g = this.svg.append('g');

        // 缩放行为 - 保存为成员变量以便后续使用
        this.zoomBehavior = d3.zoom()
            .scaleExtent([0.1, 4])
            .on('zoom', (event: any) => {
                this.g.attr('transform', event.transform);
            });

        this.svg.call(this.zoomBehavior);

        // 准备数据副本用于力模拟
        const nodes = this.graphData.nodes.map(d => ({...d}));
        const links = this.graphData.links.map(d => ({
            ...d,
            source: typeof d.source === 'string' ? d.source : d.source.id,
            target: typeof d.target === 'string' ? d.target : d.target.id
        }));

        // 创建力模拟
        this.simulation = d3.forceSimulation(nodes)
            .force('link', d3.forceLink(links)
                .id((d: any) => d.id)
                .distance((d: any) => {
                    // 根据连线类型调整距离
                    if (d.linkType === 'time-sequence') return 60;
                    if (d.linkType === 'pid-relation') return 80;
                    return 100;
                })
                .strength((d: any) => d.strength || 0.5))
            .force('charge', d3.forceManyBody()
                .strength((d: any) => d.type === 'STAR' ? -300 : -50))
            .force('center', d3.forceCenter(0, 0))
            .force('collision', d3.forceCollide()
                .radius((d: any) => d.size + 5))
            .force('x', d3.forceX(0).strength(0.02))
            .force('y', d3.forceY(0).strength(0.02));

        // 绘制连线
        const linkGroup = this.g.append('g').attr('class', 'links');
        
        const link = linkGroup.selectAll('line')
            .data(links)
            .join('line')
            .attr('class', 'tg-link')
            .attr('stroke', (d: any) => d.color)
            .attr('stroke-width', (d: any) => d.linkType === 'time-sequence' ? 1.5 : 1)
            .attr('stroke-dasharray', (d: any) => d.linkType === 'time-sequence' ? '3,3' : 'none')
            .attr('marker-end', (d: any) => d.linkType === 'time-sequence' ? 'url(#arrowhead)' : '')
            .style('display', (d: any) => {
                // 根据初始可见性设置显示/隐藏
                if (d.linkType === 'pid-relation') {
                    return this.linkVisibility.pidRelation ? 'block' : 'none';
                } else if (d.linkType === 'time-sequence') {
                    if (d.color === '#ef4444') {
                        return this.linkVisibility.crossPid ? 'block' : 'none';
                    }
                    return this.linkVisibility.timeSequence ? 'block' : 'none';
                }
                return 'block';
            });

        // 绘制节点组
        const nodeGroup = this.g.append('g').attr('class', 'nodes');
        
        const node = nodeGroup.selectAll('g')
            .data(nodes)
            .join('g')
            .attr('class', 'tg-node')
            .style('cursor', 'pointer')
            .call(d3.drag()
                .on('start', (event: any, d: any) => {
                    if (!event.active) this.simulation.alphaTarget(0.3).restart();
                    d.fx = d.x;
                    d.fy = d.y;
                })
                .on('drag', (event: any, d: any) => {
                    d.fx = event.x;
                    d.fy = event.y;
                })
                .on('end', (event: any, d: any) => {
                    if (!event.active) this.simulation.alphaTarget(0);
                    d.fx = null;
                    d.fy = null;
                }))
            .on('click', (_: any, d: any) => this.handleNodeClick(d.rawPid, d));

        // 恒星发光光晕
        node.filter((d: any) => d.type === 'STAR')
            .append('circle')
            .attr('r', (d: any) => d.size * 1.8)
            .attr('fill', (d: any) => d.color)
            .attr('opacity', 0.15)
            .attr('class', 'pulse-slow');

        // 核心实体
        node.append('circle')
            .attr('r', (d: any) => d.size)
            .attr('fill', (d: any) => d.color)
            .attr('filter', (d: any) => d.type === 'STAR' ? 'url(#glow)' : '')
            .attr('stroke', (d: any) => d.type === 'EVENT' ? d.color : '#fff')
            .attr('stroke-width', (d: any) => d.type === 'STAR' ? 2 : 1)
            .attr('opacity', (d: any) => d.type === 'STAR' ? 1 : 0.85)
            .on('mouseover', (event: any, d: any) => {
                this.showTooltip(event, d);
                d3.select(event.currentTarget.parentNode)
                    .select('circle')
                    .transition()
                    .duration(200)
                    .attr('r', d.size * 1.3);
            })
            .on('mouseout', (event: any, d: any) => {
                this.hideTooltip();
                d3.select(event.currentTarget.parentNode)
                    .select('circle')
                    .transition()
                    .duration(200)
                    .attr('r', d.size);
            });

        // 标签
        node.filter((d: any) => d.type === 'STAR')
            .append('text')
            .attr('dy', (d: any) => d.size + 15)
            .attr('text-anchor', 'middle')
            .attr('fill', '#e2e8f0')
            .attr('font-size', 12)
            .attr('font-weight', 'bold')
            .attr('class', 'node-label')
            .text((d: any) => d.label);

        // 事件节点标签（悬停时显示）
        node.filter((d: any) => d.type === 'EVENT')
            .append('text')
            .attr('dy', (d: any) => d.size + 12)
            .attr('text-anchor', 'middle')
            .attr('fill', '#94a3b8')
            .attr('font-size', 9)
            .attr('class', 'event-label')
            .attr('opacity', 0)
            .text((d: any) => d.label);

        // 力模拟 tick
        this.simulation.on('tick', () => {
            link
                .attr('x1', (d: any) => d.source.x)
                .attr('y1', (d: any) => d.source.y)
                .attr('x2', (d: any) => d.target.x)
                .attr('y2', (d: any) => d.target.y);

            node.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
        });

        // 初始冷却后降低模拟强度
        setTimeout(() => {
            if (this.simulation) {
                this.simulation.alphaTarget(0).alphaDecay(0.02);
            }
        }, 3000);
    }

    /**
     * 渲染表格
     */
    private renderTable(): void {
        const tbody = this.container?.querySelector('#tg-table-body');
        if (!tbody) return;

        const totalPages = Math.ceil(this.filteredData.length / this.itemsPerPage) || 1;
        const start = (this.currentPage - 1) * this.itemsPerPage;
        const end = Math.min(start + this.itemsPerPage, this.filteredData.length);
        const pageData = this.filteredData.slice(start, end);

        if (pageData.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="empty-row">
                        <div class="empty-message">
                            ${this.icons.search}
                            <p>未找到匹配的事件</p>
                            <button class="clear-filter-btn" id="clear-filters-btn">清除筛选</button>
                        </div>
                    </td>
                </tr>
            `;
            
            // 绑定清除过滤按钮
            const clearBtn = tbody.querySelector('#clear-filters-btn');
            clearBtn?.addEventListener('click', () => this.clearFilters());
        } else {
            tbody.innerHTML = pageData.map(row => `
                <tr class="tg-table-row">
                    <td class="col-time"><span class="mono">${this.escapeHtml(row.Time)}</span></td>
                    <td class="col-type"><span class="badge" style="background: ${TYPE_COLORS[row.Type] || TYPE_COLORS.Default}20; color: ${TYPE_COLORS[row.Type] || TYPE_COLORS.Default}; border-color: ${TYPE_COLORS[row.Type] || TYPE_COLORS.Default}40">${row.Type}</span></td>
                    <td class="col-action"><span class="action-badge" style="background: ${ACTION_COLORS[row.Action] || ACTION_COLORS.Default}20; color: ${ACTION_COLORS[row.Action] || ACTION_COLORS.Default}">${row.Action}</span></td>
                    <td class="col-pid">
                        <span class="pid-link ${row.PID === this.selectedPid ? 'active' : ''}" data-pid="${row.PID}">${row.PID}</span>
                    </td>
                    <td class="col-text">
                        <div class="text-content" title="${this.escapeHtml(row.Text)}">${this.escapeHtml(row.Text)}</div>
                        <div class="value-hints">
                            ${row.Value32 !== '0x0' ? `<span>V32: ${row.Value32}</span>` : ''}
                            ${row.Value64 !== '0x0' ? `<span>V64: ${row.Value64}</span>` : ''}
                        </div>
                    </td>
                </tr>
            `).join('');

            // 绑定 PID 点击事件
            tbody.querySelectorAll('.pid-link').forEach(el => {
                el.addEventListener('click', (e) => {
                    const pid = (e.target as HTMLElement).getAttribute('data-pid') || '';
                    this.selectedPid = this.selectedPid === pid ? '' : pid;
                    
                    // 更新 PID 输入框
                    const pidInput = this.container?.querySelector('#tg-pid-filter') as HTMLInputElement;
                    if (pidInput) pidInput.value = this.selectedPid;
                    
                    this.applyFilters();
                });
            });
        }

        // 更新分页信息
        const pageStartEl = this.container?.querySelector('#page-start');
        const pageEndEl = this.container?.querySelector('#page-end');
        const pageTotalEl = this.container?.querySelector('#page-total');
        const currentPageEl = this.container?.querySelector('#current-page');
        const totalPagesEl = this.container?.querySelector('#total-pages');

        if (pageStartEl) pageStartEl.textContent = (this.filteredData.length > 0 ? start + 1 : 0).toString();
        if (pageEndEl) pageEndEl.textContent = end.toString();
        if (pageTotalEl) pageTotalEl.textContent = this.filteredData.length.toString();
        if (currentPageEl) currentPageEl.textContent = this.currentPage.toString();
        if (totalPagesEl) totalPagesEl.textContent = totalPages.toString();

        // 更新分页按钮状态
        const prevBtn = this.container?.querySelector('#prev-page-btn') as HTMLButtonElement;
        const nextBtn = this.container?.querySelector('#next-page-btn') as HTMLButtonElement;
        
        if (prevBtn) prevBtn.disabled = this.currentPage === 1;
        if (nextBtn) nextBtn.disabled = this.currentPage === totalPages;
    }

    /**
     * 清除所有过滤器
     */
    private clearFilters(): void {
        this.searchTerm = '';
        this.selectedType = 'ALL';
        this.selectedPid = '';
        this.startTime = '';
        this.endTime = '';

        // 重置 UI
        const searchInput = this.container?.querySelector('#tg-search-input') as HTMLInputElement;
        const typeFilter = this.container?.querySelector('#tg-type-filter') as HTMLSelectElement;
        const pidInput = this.container?.querySelector('#tg-pid-filter') as HTMLInputElement;
        const startTimeInput = this.container?.querySelector('#tg-start-time') as HTMLInputElement;
        const endTimeInput = this.container?.querySelector('#tg-end-time') as HTMLInputElement;

        if (searchInput) searchInput.value = '';
        if (typeFilter) typeFilter.value = 'ALL';
        if (pidInput) pidInput.value = '';
        if (startTimeInput) startTimeInput.value = '';
        if (endTimeInput) endTimeInput.value = '';

        this.applyFilters();
    }

    /**
     * 处理节点点击 - 打开详情面板
     */
    private handleNodeClick(pid: string, node?: GalaxyNode): void {
        // 更新选中的 PID
        this.selectedPid = pid;
        
        // 更新 PID 输入框
        const pidInput = this.container?.querySelector('#tg-pid-filter') as HTMLInputElement;
        if (pidInput) pidInput.value = this.selectedPid;
        
        // 打开详情面板
        this.showDetailPanel(pid, node);
        
        this.applyFilters();
    }

    /**
     * 显示详情面板
     */
    private async showDetailPanel(pid: string, node?: GalaxyNode): Promise<void> {
        const panel = this.container?.querySelector('#tg-detail-panel') as HTMLElement;
        const title = this.container?.querySelector('#detail-panel-title') as HTMLElement;
        const content = this.container?.querySelector('#detail-panel-content') as HTMLElement;
        
        if (!panel || !content) return;

        // 显示面板
        panel.classList.add('open');
        this.detailPanelOpen = true;

        if (title) {
            title.textContent = `PID ${pid} 详情`;
        }

        // 显示加载状态
        content.innerHTML = `<div class="detail-loading">正在加载...</div>`;

        try {
            // 加载进程和线程数据（如果尚未加载）
            await this.loadProcessAndThreadsData();

            // 构建详情内容
            let html = '';

            // 节点统计信息
            if (node && node.type === 'STAR' && node.stats) {
                html += `
                    <div class="detail-section">
                        <div class="detail-section-title">📊 时间线统计</div>
                        <div class="detail-item"><span class="detail-label">事件数:</span><span class="detail-value">${node.stats.count}</span></div>
                        <div class="detail-item"><span class="detail-label">类型:</span><span class="detail-value">${Array.from(node.stats.types).join(', ')}</span></div>
                        <div class="detail-item"><span class="detail-label">操作:</span><span class="detail-value">${Array.from(node.stats.actions).join(', ')}</span></div>
                        ${node.stats.firstTime ? `<div class="detail-item"><span class="detail-label">首次:</span><span class="detail-value">${node.stats.firstTime}</span></div>` : ''}
                        ${node.stats.lastTime ? `<div class="detail-item"><span class="detail-label">末次:</span><span class="detail-value">${node.stats.lastTime}</span></div>` : ''}
                    </div>
                `;
            }

            // 进程信息
            const processInfo = this.processData.find(p => p.PID === pid || p.pid === pid);
            if (processInfo) {
                html += `
                    <div class="detail-section">
                        <div class="detail-section-title">🔷 进程信息 (process.csv)</div>
                        ${this.renderProcessInfo(processInfo)}
                    </div>
                `;
            } else {
                html += `
                    <div class="detail-section">
                        <div class="detail-section-title">🔷 进程信息</div>
                        <div class="detail-empty">未找到 PID ${pid} 的进程信息</div>
                    </div>
                `;
            }

            // 关联的线程信息
            const relatedThreads = this.threadsData.filter(t => t.PID === pid || t.pid === pid);
            if (relatedThreads.length > 0) {
                html += `
                    <div class="detail-section">
                        <div class="detail-section-title">🧵 关联线程 (threads.csv) - ${relatedThreads.length} 个</div>
                        <div class="threads-list">
                            ${relatedThreads.slice(0, 20).map(t => this.renderThreadInfo(t)).join('')}
                            ${relatedThreads.length > 20 ? `<div class="detail-more">... 还有 ${relatedThreads.length - 20} 个线程</div>` : ''}
                        </div>
                    </div>
                `;
            } else {
                html += `
                    <div class="detail-section">
                        <div class="detail-section-title">🧵 关联线程</div>
                        <div class="detail-empty">未找到关联的线程信息</div>
                    </div>
                `;
            }

            content.innerHTML = html;

            // 绑定线程点击事件
            content.querySelectorAll('.thread-item').forEach(el => {
                el.addEventListener('click', () => {
                    const tid = el.getAttribute('data-tid');
                    if (tid) this.showThreadDetail(tid);
                });
            });

        } catch (error) {
            console.error('加载详情失败:', error);
            content.innerHTML = `<div class="detail-error">加载详情失败</div>`;
        }
    }

    /**
     * 渲染进程信息
     */
    private renderProcessInfo(process: any): string {
        const importantFields = ['Name', 'PID', 'PPID', 'Threads', 'Handles', 'CreateTime', 'ExitTime', 'Offset', 'SessionId'];
        let html = '';
        
        for (const field of importantFields) {
            const value = process[field] || process[field.toLowerCase()];
            if (value !== undefined && value !== '') {
                html += `<div class="detail-item"><span class="detail-label">${field}:</span><span class="detail-value">${this.escapeHtml(String(value))}</span></div>`;
            }
        }
        
        // 其他字段
        for (const [key, value] of Object.entries(process)) {
            if (!importantFields.includes(key) && !importantFields.map(f => f.toLowerCase()).includes(key.toLowerCase()) && value !== undefined && value !== '') {
                html += `<div class="detail-item"><span class="detail-label">${key}:</span><span class="detail-value small">${this.escapeHtml(String(value))}</span></div>`;
            }
        }
        
        return html;
    }

    /**
     * 渲染线程信息
     */
    private renderThreadInfo(thread: any): string {
        const tid = thread.TID || thread.tid || 'N/A';
        const state = thread.State || thread.state || 'Unknown';
        const createTime = thread.CreateTime || thread.createTime || '';
        
        return `
            <div class="thread-item" data-tid="${tid}">
                <span class="thread-tid">TID: ${tid}</span>
                <span class="thread-state">${state}</span>
                ${createTime ? `<span class="thread-time">${createTime}</span>` : ''}
            </div>
        `;
    }

    /**
     * 显示线程详情
     */
    private showThreadDetail(tid: string): void {
        const thread = this.threadsData.find(t => (t.TID || t.tid) === tid);
        if (!thread) return;

        const content = this.container?.querySelector('#detail-panel-content') as HTMLElement;
        const title = this.container?.querySelector('#detail-panel-title') as HTMLElement;
        
        if (!content) return;

        if (title) {
            title.textContent = `TID ${tid} 线程详情`;
        }

        let html = `
            <div class="detail-section">
                <div class="detail-section-title">🧵 线程信息 (threads.csv)</div>
        `;
        
        for (const [key, value] of Object.entries(thread)) {
            if (value !== undefined && value !== '') {
                html += `<div class="detail-item"><span class="detail-label">${key}:</span><span class="detail-value small">${this.escapeHtml(String(value))}</span></div>`;
            }
        }
        
        html += `
            </div>
            <button class="detail-back-btn" id="detail-back-btn">← 返回 PID ${thread.PID || thread.pid} 详情</button>
        `;
        
        content.innerHTML = html;

        // 绑定返回按钮
        const backBtn = content.querySelector('#detail-back-btn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                this.showDetailPanel(thread.PID || thread.pid);
            });
        }
    }

    /**
     * 关闭详情面板
     */
    private closeDetailPanel(): void {
        const panel = this.container?.querySelector('#tg-detail-panel') as HTMLElement;
        if (panel) {
            panel.classList.remove('open');
            this.detailPanelOpen = false;
        }
    }

    /**
     * 加载进程和线程数据
     */
    private async loadProcessAndThreadsData(): Promise<void> {
        // 如果已经加载过，则跳过
        if (this.processData.length > 0 && this.threadsData.length > 0) {
            return;
        }

        try {
            // 加载进程数据
            const processResult = await invoke('read_process_csv') as { headers: string[], rows: string[][] };
            if (processResult && processResult.rows) {
                this.processData = this.convertCsvToObjects(processResult.headers, processResult.rows);
                console.log(`✅ 加载进程数据: ${this.processData.length} 条`);
            }
        } catch (error) {
            console.warn('加载进程数据失败:', error);
        }

        try {
            // 加载线程数据
            const threadsResult = await invoke('read_threads_csv') as { headers: string[], rows: string[][] };
            if (threadsResult && threadsResult.rows) {
                this.threadsData = this.convertCsvToObjects(threadsResult.headers, threadsResult.rows);
                console.log(`✅ 加载线程数据: ${this.threadsData.length} 条`);
            }
        } catch (error) {
            console.warn('加载线程数据失败:', error);
        }
    }

    /**
     * 将 CSV 数据转换为对象数组
     */
    private convertCsvToObjects(headers: string[], rows: string[][]): any[] {
        return rows.map(row => {
            const obj: any = {};
            headers.forEach((header, index) => {
                obj[header] = row[index] || '';
            });
            return obj;
        });
    }

    /**
     * 显示悬浮提示
     */
    private showTooltip(event: any, node: GalaxyNode): void {
        const tooltip = this.container?.querySelector('#tg-tooltip') as HTMLElement;
        if (!tooltip) return;

        let content = `<div class="tooltip-title">${this.escapeHtml(node.label)}</div>`;
        
        if (node.type === 'STAR' && node.stats) {
            content += `
                <div class="tooltip-info">事件数: ${node.stats.count}</div>
                <div class="tooltip-info">类型: ${Array.from(node.stats.types).slice(0, 5).join(', ')}${node.stats.types.size > 5 ? '...' : ''}</div>
                <div class="tooltip-info">操作: ${Array.from(node.stats.actions).slice(0, 5).join(', ')}${node.stats.actions.size > 5 ? '...' : ''}</div>
                ${node.stats.firstTime ? `<div class="tooltip-info">首次: ${node.stats.firstTime}</div>` : ''}
                ${node.stats.lastTime ? `<div class="tooltip-info">末次: ${node.stats.lastTime}</div>` : ''}
            `;
        } else if (node.type === 'EVENT') {
            content += `
                <div class="tooltip-info">PID: ${node.rawPid}</div>
                ${node.timeLabel ? `<div class="tooltip-info">时间: ${node.timeLabel}</div>` : ''}
            `;
        }

        tooltip.innerHTML = content;
        tooltip.style.display = 'block';
        tooltip.style.left = `${event.pageX + 15}px`;
        tooltip.style.top = `${event.pageY + 15}px`;
    }

    /**
     * 隐藏悬浮提示
     */
    private hideTooltip(): void {
        const tooltip = this.container?.querySelector('#tg-tooltip') as HTMLElement;
        if (tooltip) {
            tooltip.style.display = 'none';
        }
    }

    /**
     * 更新线条可见性
     */
    private updateLinkVisibility(): void {
        if (!this.g) return;

        // 更新所有线条的可见性
        this.g.selectAll('.tg-link').each((d: any, i: number, nodes: any[]) => {
            const link = d3.select(nodes[i]);
            let visible = true;

            if (d.linkType === 'pid-relation') {
                visible = this.linkVisibility.pidRelation;
            } else if (d.linkType === 'time-sequence') {
                // 区分普通时间顺序线和跨PID关联线
                if (d.color === '#ef4444') {
                    visible = this.linkVisibility.crossPid;
                } else {
                    visible = this.linkVisibility.timeSequence;
                }
            }

            link.style('display', visible ? 'block' : 'none');
        });
    }

    /**
     * 缩放
     */
    private zoom(factor: number): void {
        if (!this.svg || !this.zoomBehavior) return;

        const currentTransform = d3.zoomTransform(this.svg.node());
        const newScale = currentTransform.k * factor;

        if (newScale >= 0.1 && newScale <= 4) {
            const newTransform = d3.zoomIdentity
                .translate(currentTransform.x, currentTransform.y)
                .scale(newScale);
            
            this.svg.transition()
                .duration(300)
                .call(this.zoomBehavior.transform, newTransform);
        }
    }

    /**
     * 重置视图
     */
    private resetView(): void {
        if (!this.svg || !this.zoomBehavior) return;

        this.svg.transition()
            .duration(500)
            .call(this.zoomBehavior.transform, d3.zoomIdentity);
    }

    /**
     * 切换全屏
     */
    private toggleFullscreen(): void {
        const container = this.container?.querySelector('.timeline-galaxy-container') as HTMLElement;
        const btn = this.container?.querySelector('#tg-fullscreen-btn');
        
        if (!container) return;

        if (container.classList.contains('fullscreen')) {
            container.classList.remove('fullscreen');
            if (btn) btn.innerHTML = this.icons.fullscreen;
        } else {
            container.classList.add('fullscreen');
            if (btn) btn.innerHTML = this.icons.exitFullscreen;
        }

        // 重新渲染以适应新尺寸
        setTimeout(() => {
            if (this.graphData) {
                this.renderGraph();
            }
        }, 300);
    }

    /**
     * 显示加载状态
     */
    private showLoading(): void {
        const loading = this.container?.querySelector('#tg-loading') as HTMLElement;
        const empty = this.container?.querySelector('#tg-empty') as HTMLElement;
        const svg = this.container?.querySelector('#tg-svg') as HTMLElement;

        if (loading) loading.style.display = 'flex';
        if (empty) empty.style.display = 'none';
        if (svg) svg.style.display = 'none';
    }

    /**
     * 隐藏加载状态
     */
    private hideLoading(): void {
        const loading = this.container?.querySelector('#tg-loading') as HTMLElement;
        const svg = this.container?.querySelector('#tg-svg') as HTMLElement;

        if (loading) loading.style.display = 'none';
        if (svg) svg.style.display = 'block';
    }

    /**
     * 显示空状态
     */
    private showEmpty(): void {
        const loading = this.container?.querySelector('#tg-loading') as HTMLElement;
        const empty = this.container?.querySelector('#tg-empty') as HTMLElement;
        const svg = this.container?.querySelector('#tg-svg') as HTMLElement;

        if (loading) loading.style.display = 'none';
        if (empty) empty.style.display = 'flex';
        if (svg) svg.style.display = 'none';

        this.isLoading = false;
    }

    /**
     * 清理资源
     */
    public cleanup(): void {
        if (this.simulation) {
            this.simulation.stop();
            this.simulation = null;
        }
    }

    // ==================== 工具方法 ====================

    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
