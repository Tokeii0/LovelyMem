/**
 * 进程星图界面 - Process Galaxy
 * 使用力导向图可视化展示进程间的父子关系和网络连接
 */

import { invoke } from '@tauri-apps/api/core';
import './styles/process-galaxy.css';
import IconParkHelper from '../utils/iconparkHelper';
import { ProcessEntropyAnalyzer, type ProcessAnalysisResult } from './ProcessEntropyAnalyzer';

// 声明 D3.js 全局变量（通过 script 标签动态加载）
declare var d3: any;

// 进程数据接口（来自 process.csv）
interface ProcessData {
    PID: string;
    PPID: string;
    State: string;
    ShortName: string;
    Name: string;
    IntegrityLevel: string;
    User: string;
    CreateTime: string;
    ExitTime: string;
    Wow64: string;
    EPROCESS: string;
    PEB: string;
    PEB32: string;
    DTB: string;
    UserDTB: string;
    UserPath: string;
    KernelPath: string;
    CommandLine: string;
    Flag: string;
}

// Volatility3 pstree 数据接口（来自 output_vol3_pstree.csv，备用数据源）
// 表头: TreeDepth,PID,PPID,ImageFileName,Offset(V),Threads,Handles,SessionId,Wow64,CreateTime,ExitTime,File output
interface Vol3ProcessData {
    TreeDepth: string;
    PID: string;
    PPID: string;
    ImageFileName: string;
    'Offset(V)': string;
    Threads: string;
    Handles: string;
    SessionId: string;
    Wow64: string;
    CreateTime: string;
    ExitTime: string;
    'File output': string;
}

// 网络连接数据接口（来自 net.csv）
interface NetworkData {
    Proto: string;
    State: string;
    SrcAddr: string;
    SrcPort: string;
    DstAddr: string;
    DstPort: string;
    Time: string;
    Object: string;
    PID: string;
    Process: string;
    ProcessPath: string;
}

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

// D3 连线基础类型
interface SimulationLinkDatum<NodeDatum extends SimulationNodeDatum> {
    source: NodeDatum | string | number;
    target: NodeDatum | string | number;
    index?: number;
}

// D3 节点接口
interface GraphNode extends SimulationNodeDatum {
    id: string;
    group: string;
    name: string;
    radius: number;
    data: ProcessData;
    anomalyScore: number;
    anomalyLevel: 'normal' | 'low' | 'medium' | 'high' | 'critical';
}

// D3 连线接口
interface GraphLink extends SimulationLinkDatum<GraphNode> {
    source: string | GraphNode;
    target: string | GraphNode;
    value: number;
}

// 图数据接口
interface GraphData {
    nodes: GraphNode[];
    links: GraphLink[];
}

export class ProcessGalaxyInterface {
    private container: HTMLElement | null = null;
    private graphData: GraphData | null = null;
    private rawData: ProcessData[] = [];
    private networkData: NetworkData[] = [];
    private selectedNode: GraphNode | null = null;
    private hoveredNode: GraphNode | null = null;
    private simulation: any = null;
    private svg: any = null;
    private g: any = null;
    private zoomBehavior: any = null; // D3 zoom 行为
    private isLoading: boolean = false;
    private d3Loaded: boolean = false;
    private showNetworkConnections: boolean = true;
    private dataSource: 'process.csv' | 'vol3_pstree' = 'process.csv'; // 当前数据源
    
    // 力导向图参数
    private clusterGravity: number = 0.01; // 聚拢度（向心力强度，值越大簇间距越小）
    private linkDistance: number = 80; // 连线距离

    // 缓存的 SVG 图标
    private icons = {
        refresh: IconParkHelper.getSvgString('refresh', { size: 16 }),
        search: IconParkHelper.getSvgString('search', { size: 16 }),
        zoomIn: IconParkHelper.getSvgString('zoom-in', { size: 16 }),
        zoomOut: IconParkHelper.getSvgString('zoom-out', { size: 16 }),
        home: IconParkHelper.getSvgString('home', { size: 16 }),
        close: IconParkHelper.getSvgString('close', { size: 16 }),
        process: IconParkHelper.getSvgString('cpu', { size: 14 }),
        network: IconParkHelper.getSvgString('network-tree', { size: 14 }),
        time: IconParkHelper.getSvgString('time', { size: 14 }),
        code: IconParkHelper.getSvgString('code', { size: 14 }),
        info: IconParkHelper.getSvgString('info', { size: 14 }),
        warning: IconParkHelper.getSvgString('attention', { size: 14 }),
        copy: IconParkHelper.getSvgString('copy', { size: 14 }),
        fullscreen: IconParkHelper.getSvgString('full-screen', { size: 16 }),
        exitFullscreen: IconParkHelper.getSvgString('off-screen', { size: 16 }),
        connection: IconParkHelper.getSvgString('connection', { size: 14 }),
    };

    // 颜色映射
    private colorScale: any = null;

    // 熵值分析器
    private analyzer: ProcessEntropyAnalyzer = new ProcessEntropyAnalyzer();
    private analysisResults: Map<string, ProcessAnalysisResult> = new Map();
    private showAnomalyMode: boolean = true; // 是否显示异常度模式

    constructor() {}

    /**
     * 渲染界面HTML
     */
    public render(): string {
        return `
            <div class="process-galaxy-container" id="process-galaxy-root">
                <!-- 顶部工具栏 -->
                <div class="galaxy-toolbar">
                    <div class="galaxy-toolbar-left">
                        <div class="galaxy-title">
                            ${this.icons.network}
                            <span>进程星图</span>
                        </div>
                        <div class="galaxy-stats" id="galaxy-stats">
                            <span class="stat-item">节点: <strong id="node-count">0</strong></span>
                            <span class="stat-item">关系: <strong id="link-count">0</strong></span>
                            <span class="stat-divider">|</span>
                            <span class="stat-item network-stat">网络: <strong id="network-count">0</strong></span>
                            <span class="stat-item network-stat external">外联: <strong id="external-count">0</strong></span>
                            <label class="toggle-switch-inline" title="显示/隐藏网络连接">
                                <input type="checkbox" id="network-toggle" checked>
                                <span class="toggle-slider-inline"></span>
                            </label>
                            <span class="stat-divider">|</span>
                            <span class="stat-item data-source clickable" id="data-source-indicator" title="点击切换数据源">
                                ${this.icons.info} <span id="data-source-text">-</span>
                            </span>
                        </div>
                        <div class="galaxy-divider"></div>
                        <div class="galaxy-slider-group">
                            <span class="slider-label">聚拢度:</span>
                            <input type="range" 
                                   id="cluster-gravity-slider" 
                                   class="galaxy-slider" 
                                   min="1" 
                                   max="30" 
                                   value="10" 
                                   title="调节进程簇之间的聚拢程度，值越大越聚拢">
                            <span class="slider-value" id="cluster-gravity-value">0.010</span>
                        </div>
                        <div class="galaxy-slider-group">
                            <span class="slider-label">连线长:</span>
                            <input type="range" 
                                   id="link-distance-slider" 
                                   class="galaxy-slider" 
                                   min="30" 
                                   max="200" 
                                   value="80" 
                                   title="调节连线距离">
                            <span class="slider-value" id="link-distance-value">80</span>
                        </div>
                    </div>
                    <div class="galaxy-toolbar-right">
                        <div class="galaxy-search">
                            <span class="search-icon">${this.icons.search}</span>
                            <input type="text" 
                                   id="galaxy-search-input" 
                                   class="galaxy-search-input" 
                                   placeholder="搜索进程名或PID..."
                                   autocomplete="off">
                            <button class="search-clear-btn" id="galaxy-search-clear" title="清除搜索" style="display: none;">×</button>
                        </div>
                        <button class="galaxy-btn" id="galaxy-refresh-btn" title="重新加载数据">
                            ${this.icons.refresh}
                        </button>
                    </div>
                </div>
                
                <!-- 异常度摘要栏 -->
                <div class="galaxy-anomaly-bar" id="galaxy-anomaly-bar" style="display: none;">
                    <div class="anomaly-bar-left">
                        <span class="anomaly-bar-title">${this.icons.warning} 熵值分析</span>
                        <span class="anomaly-badge critical" id="anomaly-critical-count" title="高危">0</span>
                        <span class="anomaly-badge high" id="anomaly-high-count" title="可疑">0</span>
                        <span class="anomaly-badge medium" id="anomaly-medium-count" title="轻微">0</span>
                        <span class="anomaly-badge low" id="anomaly-low-count" title="低危">0</span>
                        <label class="toggle-switch-inline" title="异常度着色模式">
                            <input type="checkbox" id="anomaly-mode-toggle" checked>
                            <span class="toggle-slider-inline"></span>
                        </label>
                        <span class="anomaly-mode-label" id="anomaly-mode-label">异常度着色</span>
                    </div>
                    <div class="anomaly-bar-right" id="anomaly-top-list"></div>
                </div>
                
                <!-- 主画布区域 -->
                <div class="galaxy-canvas-wrapper" id="galaxy-canvas-wrapper">
                    <!-- 加载状态 -->
                    <div class="galaxy-loading" id="galaxy-loading">
                        <div class="loading-spinner"></div>
                        <div class="loading-text">正在加载进程数据...</div>
                    </div>
                    
                    <!-- 空状态 -->
                    <div class="galaxy-empty" id="galaxy-empty" style="display: none;">
                        <div class="empty-icon">${this.icons.network}</div>
                        <div class="empty-title">暂无进程数据</div>
                        <div class="empty-desc">请先加载内存镜像并生成进程数据</div>
                        <button class="btn-primary" id="galaxy-retry-btn">重新加载</button>
                    </div>
                    
                    <!-- SVG 画布 -->
                    <svg id="galaxy-svg" class="galaxy-svg"></svg>
                    
                    <!-- 悬浮提示 -->
                    <div class="galaxy-tooltip" id="galaxy-tooltip" style="display: none;"></div>
                    
                    <!-- 图例 - 位于 SVG 画布左下角 -->
                    <div class="galaxy-legend" id="galaxy-legend">
                        <div class="legend-title">用户类型</div>
                        <div class="legend-items" id="legend-items">
                            <!-- 动态生成 -->
                        </div>
                    </div>
                </div>
                
                <!-- 右侧详情面板 -->
                <div class="galaxy-detail-panel" id="galaxy-detail-panel" style="display: none;">
                    <div class="detail-panel-header">
                        <h3 id="detail-panel-title">进程详情</h3>
                        <button class="detail-close-btn" id="detail-close-btn" title="关闭" aria-label="关闭">${this.icons.close}</button>
                    </div>
                    <div class="detail-panel-body" id="detail-panel-body">
                        <!-- 详情内容 -->
                    </div>
                </div>
                
                <!-- 缩放控制 -->
                <div class="galaxy-zoom-controls">
                    <button class="zoom-btn" id="zoom-in-btn" title="放大">${this.icons.zoomIn}</button>
                    <button class="zoom-btn" id="zoom-out-btn" title="缩小">${this.icons.zoomOut}</button>
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

        // 加载进程数据
        await this.loadProcessData();
    }

    /**
     * 动态加载 D3.js
     */
    private async loadD3(): Promise<void> {
        // 检查 D3 是否已经加载
        if (this.d3Loaded && typeof d3 !== 'undefined') {
            return;
        }
        
        if (typeof d3 !== 'undefined') {
            this.d3Loaded = true;
            console.log('✅ D3.js 已经存在');
            return;
        }

        // 检查是否有正在加载的脚本
        const existingScript = document.querySelector('script[src*="d3"]');
        if (existingScript) {
            // 等待现有脚本加载完成
            return new Promise((resolve) => {
                const checkD3 = setInterval(() => {
                    if (typeof d3 !== 'undefined') {
                        clearInterval(checkD3);
                        this.d3Loaded = true;
                        resolve();
                    }
                }, 100);
                // 超时处理
                setTimeout(() => {
                    clearInterval(checkD3);
                    resolve();
                }, 5000);
            });
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
                    console.log(`✅ D3.js 加载成功: ${src}`);
                    return;
                }
            } catch (error) {
                console.warn(`⚠️ 尝试加载 D3.js 失败: ${src}`);
            }
        }

        console.error('❌ 所有 D3.js 源加载失败');
        throw new Error('Failed to load D3.js from all sources');
    }

    /**
     * 加载脚本的辅助方法
     */
    private loadScript(src: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.async = true;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`Failed to load: ${src}`));
            document.head.appendChild(script);
        });
    }

    /**
     * 绑定DOM事件
     */
    private bindEvents(): void {
        if (!this.container) return;

        // 刷新按钮
        const refreshBtn = this.container.querySelector('#galaxy-refresh-btn');
        refreshBtn?.addEventListener('click', () => this.loadProcessData());

        // 重置视图按钮
        const resetViewBtn = this.container.querySelector('#galaxy-reset-view-btn');
        resetViewBtn?.addEventListener('click', () => this.resetView());

        // 全屏按钮
        const fullscreenBtn = this.container.querySelector('#galaxy-fullscreen-btn');
        fullscreenBtn?.addEventListener('click', () => this.toggleFullscreen());

        // 搜索输入
        const searchInput = this.container.querySelector('#galaxy-search-input') as HTMLInputElement;
        const searchClearBtn = this.container.querySelector('#galaxy-search-clear') as HTMLElement;
        
        if (searchInput) {
            let searchTimeout: number;
            searchInput.addEventListener('input', (e) => {
                const value = (e.target as HTMLInputElement).value;
                searchClearBtn.style.display = value ? 'flex' : 'none';
                
                clearTimeout(searchTimeout);
                searchTimeout = window.setTimeout(() => {
                    this.highlightSearchResult(value);
                }, 300);
            });
        }
        
        searchClearBtn?.addEventListener('click', () => {
            if (searchInput) {
                searchInput.value = '';
                searchClearBtn.style.display = 'none';
                this.highlightSearchResult('');
            }
        });

        // 缩放按钮
        const zoomInBtn = this.container.querySelector('#zoom-in-btn');
        const zoomOutBtn = this.container.querySelector('#zoom-out-btn');
        
        zoomInBtn?.addEventListener('click', () => this.zoom(1.2));
        zoomOutBtn?.addEventListener('click', () => this.zoom(0.8));

        // 详情面板关闭按钮
        const closeDetailBtn = this.container.querySelector('#detail-close-btn');
        closeDetailBtn?.addEventListener('click', () => this.hideDetailPanel());

        // 重试按钮
        const retryBtn = this.container.querySelector('#galaxy-retry-btn');
        retryBtn?.addEventListener('click', () => this.loadProcessData());

        // 网络连接开关
        const networkToggle = this.container.querySelector('#network-toggle') as HTMLInputElement;
        networkToggle?.addEventListener('change', (e) => {
            this.showNetworkConnections = (e.target as HTMLInputElement).checked;
            this.renderGraph();
        });
        
        // 聚拢度滑块
        const clusterSlider = this.container.querySelector('#cluster-gravity-slider') as HTMLInputElement;
        const clusterValue = this.container.querySelector('#cluster-gravity-value') as HTMLElement;
        clusterSlider?.addEventListener('input', (e) => {
            const value = parseInt((e.target as HTMLInputElement).value);
            this.clusterGravity = value / 1000; // 转换为 0.001-0.03 范围
            if (clusterValue) clusterValue.textContent = this.clusterGravity.toFixed(3);
            this.updateForceParameters();
        });
        
        // 连线距离滑块
        const linkSlider = this.container.querySelector('#link-distance-slider') as HTMLInputElement;
        const linkValue = this.container.querySelector('#link-distance-value') as HTMLElement;
        linkSlider?.addEventListener('input', (e) => {
            const value = parseInt((e.target as HTMLInputElement).value);
            this.linkDistance = value;
            if (linkValue) linkValue.textContent = value.toString();
            this.updateForceParameters();
        });
        
        // 数据源切换点击事件
        const dataSourceIndicator = this.container.querySelector('#data-source-indicator');
        dataSourceIndicator?.addEventListener('click', () => this.toggleDataSource());

        // 异常度着色开关
        const anomalyToggle = this.container.querySelector('#anomaly-mode-toggle') as HTMLInputElement;
        anomalyToggle?.addEventListener('change', (e) => {
            this.showAnomalyMode = (e.target as HTMLInputElement).checked;
            this.renderGraph();
        });
    }
    
    /**
     * 切换数据源
     */
    private async toggleDataSource(): Promise<void> {
        if (this.isLoading) return;
        
        // 切换到另一个数据源
        const newSource = this.dataSource === 'process.csv' ? 'vol3_pstree' : 'process.csv';
        console.log(`🔄 切换数据源: ${this.dataSource} → ${newSource}`);
        
        this.isLoading = true;
        this.showLoading();
        
        try {
            let success = false;
            
            if (newSource === 'vol3_pstree') {
                // 尝试加载 Vol3 pstree 数据
                try {
                    const vol3Result = await invoke('read_vol3_pstree_csv') as { headers: string[], rows: string[][] };
                    if (vol3Result && vol3Result.rows && vol3Result.rows.length > 0) {
                        this.dataSource = 'vol3_pstree';
                        this.rawData = this.convertVol3ToProcessData(vol3Result.headers, vol3Result.rows);
                        success = true;
                        console.log('✅ 切换到 Vol3 pstree 数据源');
                    }
                } catch (error) {
                    console.error('❌ Vol3 pstree 数据源不可用:', error);
                }
            } else {
                // 尝试加载 process.csv 数据
                try {
                    const processResult = await invoke('read_process_csv') as { headers: string[], rows: string[][] };
                    if (processResult && processResult.rows && processResult.rows.length > 0) {
                        this.dataSource = 'process.csv';
                        this.rawData = this.convertToProcessData(processResult.headers, processResult.rows);
                        success = true;
                        console.log('✅ 切换到 process.csv 数据源');
                    }
                } catch (error) {
                    console.error('❌ process.csv 数据源不可用:', error);
                }
            }
            
            if (!success) {
                console.warn(`⚠️ 无法切换到 ${newSource}，保持当前数据源`);
                this.hideLoading();
                return;
            }
            
            if (this.rawData.length === 0) {
                this.showEmpty();
                return;
            }
            
            // 重新构建图数据
            this.graphData = this.buildGraphData(this.rawData);
            
            // 更新统计
            this.updateStats();
            
            // 渲染图表
            this.renderGraph();
            
            // 更新图例
            this.updateLegend();
            
            // 更新网络统计
            this.updateNetworkStats();
            
            this.hideLoading();
            console.log(`✅ 数据源切换完成: ${this.graphData.nodes.length} 个节点`);
        } catch (error) {
            console.error('切换数据源失败:', error);
            this.hideLoading();
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * 加载进程数据
     */
    private async loadProcessData(): Promise<void> {
        if (this.isLoading) return;
        this.isLoading = true;

        this.showLoading();

        try {
            // 尝试从 process.csv 读取数据
            let processResult: { headers: string[], rows: string[][] } | null = null;
            let useVol3Fallback = false;
            
            try {
                processResult = await invoke('read_process_csv') as { headers: string[], rows: string[][] };
                if (!processResult || !processResult.rows || processResult.rows.length === 0) {
                    console.log('⚠️ process.csv 为空，尝试使用 Vol3 pstree 备用数据源');
                    useVol3Fallback = true;
                }
            } catch (error) {
                console.log('⚠️ 读取 process.csv 失败，尝试使用 Vol3 pstree 备用数据源:', error);
                useVol3Fallback = true;
            }
            
            // 如果主数据源失败，尝试备用数据源
            if (useVol3Fallback) {
                try {
                    const vol3Result = await invoke('read_vol3_pstree_csv') as { headers: string[], rows: string[][] };
                    if (vol3Result && vol3Result.rows && vol3Result.rows.length > 0) {
                        console.log('✅ 使用 Vol3 pstree 备用数据源');
                        this.dataSource = 'vol3_pstree';
                        // 将 Vol3 数据转换为标准 ProcessData 格式
                        this.rawData = this.convertVol3ToProcessData(vol3Result.headers, vol3Result.rows);
                    } else {
                        this.showEmpty();
                        return;
                    }
                } catch (vol3Error) {
                    console.error('❌ 备用数据源也加载失败:', vol3Error);
                    this.showEmpty();
                    return;
                }
            } else {
                this.dataSource = 'process.csv';
                // 将 headers + rows 转换为 ProcessData 数组
                this.rawData = this.convertToProcessData(processResult!.headers, processResult!.rows);
            }
            
            // 尝试加载网络数据（网络数据不是必需的）
            try {
                const networkResult = await invoke('read_network_csv') as { headers: string[], rows: string[][] };
                if (networkResult && networkResult.rows && networkResult.rows.length > 0) {
                    this.networkData = this.convertToNetworkData(networkResult.headers, networkResult.rows);
                    console.log(`🌐 加载了 ${this.networkData.length} 条网络连接数据`);
                } else {
                    this.networkData = [];
                }
            } catch (netError) {
                console.log('⚠️ 网络数据加载失败，继续显示进程数据:', netError);
                this.networkData = [];
            }
            
            if (this.rawData.length === 0) {
                this.showEmpty();
                return;
            }

            // 运行熵值分析
            this.runEntropyAnalysis();

            // 构建图数据
            this.graphData = this.buildGraphData(this.rawData);

            // 更新统计
            this.updateStats();

            // 渲染图表
            this.renderGraph();

            // 更新图例
            this.updateLegend();
            
            // 更新网络统计
            this.updateNetworkStats();

            // 更新异常度摘要
            this.updateAnomalyBar();

            this.hideLoading();
            const sourceLabel = this.dataSource === 'vol3_pstree' ? '(Vol3 pstree)' : '(process.csv)';
            console.log(`✅ 进程星图加载完成 ${sourceLabel}: ${this.graphData.nodes.length} 个节点, ${this.graphData.links.length} 条连接`);
        } catch (error) {
            console.error('加载进程数据失败:', error);
            this.showEmpty();
        } finally {
            this.isLoading = false;
        }
    }
    
    /**
     * 将 Vol3 pstree CSV 数据转换为 ProcessData 数组
     * Vol3 表头: TreeDepth,PID,PPID,ImageFileName,Offset(V),Threads,Handles,SessionId,Wow64,CreateTime,ExitTime,File output
     */
    private convertVol3ToProcessData(headers: string[], rows: string[][]): ProcessData[] {
        const data: ProcessData[] = [];

        for (const row of rows) {
            const obj: any = {};
            headers.forEach((header, index) => {
                obj[header] = row[index] || '';
            });

            // 必须有 PID
            if (obj.PID) {
                // 将 Vol3 格式转换为标准 ProcessData 格式
                const processData: ProcessData = {
                    PID: obj.PID,
                    PPID: obj.PPID || '',
                    State: '', // Vol3 没有 State 字段
                    ShortName: obj.ImageFileName || '',
                    Name: obj.ImageFileName || '',
                    IntegrityLevel: '', // Vol3 没有此字段
                    User: `Session ${obj.SessionId || 'N/A'}`, // 用 SessionId 代替 User
                    CreateTime: obj.CreateTime || '',
                    ExitTime: obj.ExitTime || '',
                    Wow64: obj.Wow64 === 'True' ? '1' : '0',
                    EPROCESS: obj['Offset(V)'] || '', // 使用 Offset(V) 作为 EPROCESS
                    PEB: '',
                    PEB32: '',
                    DTB: '',
                    UserDTB: '',
                    UserPath: '',
                    KernelPath: '',
                    CommandLine: '',
                    Flag: ''
                };
                data.push(processData);
            }
        }

        return data;
    }
    
    /**
     * 将 CSV 数据转换为 NetworkData 数组
     */
    private convertToNetworkData(headers: string[], rows: string[][]): NetworkData[] {
        const data: NetworkData[] = [];

        for (const row of rows) {
            const obj: any = {};
            headers.forEach((header, index) => {
                obj[header] = row[index] || '';
            });

            // 必须有 PID 和目标地址
            if (obj.PID && obj.DstAddr) {
                data.push(obj as NetworkData);
            }
        }

        return data;
    }
    
    /**
     * 更新网络统计
     */
    private updateNetworkStats(): void {
        const networkCountEl = this.container?.querySelector('#network-count');
        const externalCountEl = this.container?.querySelector('#external-count');
        
        if (networkCountEl) {
            networkCountEl.textContent = this.networkData.length.toString();
        }
        
        if (externalCountEl) {
            // 统计外联连接（非本地地址）
            const externalCount = this.networkData.filter(net => {
                const dst = net.DstAddr;
                return dst && !dst.startsWith('127.') && 
                       !dst.startsWith('0.0.0.0') && 
                       !dst.startsWith('::') && 
                       !dst.startsWith('*') &&
                       dst !== '0';
            }).length;
            externalCountEl.textContent = externalCount.toString();
        }
    }
    
    /**
     * 获取进程的网络连接
     */
    private getProcessNetworkConnections(pid: string): NetworkData[] {
        return this.networkData.filter(net => net.PID === pid);
    }

    /**
     * 将 CSV 数据转换为 ProcessData 数组
     */
    private convertToProcessData(headers: string[], rows: string[][]): ProcessData[] {
        const data: ProcessData[] = [];

        for (const row of rows) {
            const obj: any = {};
            headers.forEach((header, index) => {
                obj[header] = row[index] || '';
            });

            // 必须有 PID
            if (obj.PID) {
                data.push(obj as ProcessData);
            }
        }

        return data;
    }

    /**
     * 解析 CSV 数据 (保留作为备用)
     */
    private parseCSV(csvContent: string): ProcessData[] {
        const lines = csvContent.trim().split('\n');
        if (lines.length < 2) return [];

        const headers = lines[0].split(',').map(h => h.trim());
        const data: ProcessData[] = [];

        for (let i = 1; i < lines.length; i++) {
            const values = this.parseCSVLine(lines[i]);
            if (values.length !== headers.length) continue;

            const row: any = {};
            headers.forEach((header, index) => {
                row[header] = values[index];
            });

            // 必须有 PID
            if (row.PID) {
                data.push(row as ProcessData);
            }
        }

        return data;
    }

    /**
     * 解析 CSV 行（处理引号内的逗号）
     */
    private parseCSVLine(line: string): string[] {
        const result: string[] = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current.trim());

        return result;
    }

    /**
     * 构建图数据
     */
    private buildGraphData(rawData: ProcessData[]): GraphData {
        const nodesMap = new Map<string, GraphNode>();

        // 创建节点
        rawData.forEach(row => {
            if (!row.PID) return;

            const isSystemProcess = row.IntegrityLevel === 'System' || row.User === 'SYSTEM';
            const analysis = this.analysisResults.get(row.PID);
            const anomalyScore = analysis?.anomalyScore ?? 0;
            const anomalyLevel = analysis?.level ?? 'normal';

            // 节点大小由异常度驱动: 正常 6px, 异常越高越大
            let radius = isSystemProcess ? 8 : 6;
            if (anomalyScore >= 80) radius = 16;
            else if (anomalyScore >= 60) radius = 13;
            else if (anomalyScore >= 40) radius = 10;
            else if (anomalyScore >= 20) radius = 8;
            
            nodesMap.set(row.PID, {
                id: row.PID,
                group: row.User || 'Unknown',
                name: row.ShortName || row.Name || 'Unknown',
                radius,
                data: row,
                anomalyScore,
                anomalyLevel,
            });
        });

        // 创建连线
        const links: GraphLink[] = [];
        const nodes = Array.from(nodesMap.values());

        nodes.forEach(node => {
            const ppid = node.data.PPID;
            // 只有当父进程也在列表中时，才创建连线
            if (ppid && nodesMap.has(ppid) && ppid !== node.id && ppid !== '0') {
                links.push({
                    source: ppid,
                    target: node.id,
                    value: 1
                });
            }
        });

        return { nodes, links };
    }

    /**
     * 渲染力导向图
     */
    private renderGraph(): void {
        if (!this.graphData || !this.container) return;
        
        // 检查 D3 是否可用
        if (typeof d3 === 'undefined') {
            console.error('❌ D3.js 未加载，无法渲染图表');
            return;
        }

        const canvasWrapper = this.container.querySelector('#galaxy-canvas-wrapper');
        const svgElement = this.container.querySelector('#galaxy-svg');
        if (!canvasWrapper || !svgElement) return;

        const width = canvasWrapper.clientWidth;
        const height = canvasWrapper.clientHeight;

        // 清除旧图表
        d3.select(svgElement).selectAll('*').remove();

        // 颜色比例尺
        const uniqueGroups = [...new Set(this.graphData.nodes.map(n => n.group))];
        this.colorScale = d3.scaleOrdinal()
            .domain(uniqueGroups)
            .range(d3.schemeSet3);

        // 创建力导向模拟
        this.simulation = d3.forceSimulation(this.graphData.nodes)
            .force('link', d3.forceLink(this.graphData.links).id((d: any) => d.id).distance(this.linkDistance))
            .force('charge', d3.forceManyBody().strength(-150))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .force('x', d3.forceX(width / 2).strength(this.clusterGravity))
            .force('y', d3.forceY(height / 2).strength(this.clusterGravity))
            .force('collide', d3.forceCollide().radius((d: any) => d.radius + 5));

        this.svg = d3.select(svgElement)
            .attr('viewBox', [0, 0, width, height])
            .attr('width', '100%')
            .attr('height', '100%');

        // 定义箭头标记
        this.svg.append('defs').selectAll('marker')
            .data(['end'])
            .enter().append('marker')
            .attr('id', 'arrow')
            .attr('viewBox', '0 -5 10 10')
            .attr('refX', 15)
            .attr('refY', 0)
            .attr('markerWidth', 6)
            .attr('markerHeight', 6)
            .attr('orient', 'auto')
            .append('path')
            .attr('d', 'M0,-5L10,0L0,5')
            .attr('fill', 'var(--galaxy-link-color, #666)');

        // 创建容器组以支持缩放
        this.g = this.svg.append('g');

        // 缩放行为
        this.zoomBehavior = d3.zoom()
            .scaleExtent([0.1, 4])
            .on('zoom', (event: any) => {
                this.g.attr('transform', event.transform);
            });

        this.svg.call(this.zoomBehavior);

        // 绘制连线
        const link = this.g.append('g')
            .attr('class', 'links')
            .selectAll('line')
            .data(this.graphData.links)
            .join('line')
            .attr('class', 'galaxy-link')
            .attr('marker-end', 'url(#arrow)');

        // 绘制节点组
        const node = this.g.append('g')
            .attr('class', 'nodes')
            .selectAll('g')
            .data(this.graphData.nodes)
            .join('g')
            .attr('class', 'galaxy-node')
            .call(d3.drag()
                .on('start', (event: any) => this.dragStarted(event))
                .on('drag', (event: any) => this.dragged(event))
                .on('end', (event: any) => this.dragEnded(event)));

        // 节点圆圈
        node.append('circle')
            .attr('r', (d: GraphNode) => d.radius)
            .attr('fill', (d: GraphNode) => this.showAnomalyMode ? this.getAnomalyColor(d) : this.colorScale(d.group))
            .attr('class', (d: GraphNode) => `node-circle anomaly-${d.anomalyLevel}`)
            .on('click', (event: any, d: GraphNode) => {
                event.stopPropagation();
                this.selectNode(d);
            })
            .on('mouseover', (event: any, d: GraphNode) => {
                this.showTooltip(event, d);
                d3.select(event.currentTarget).classed('hovered', true);
            })
            .on('mouseout', (event: any) => {
                this.hideTooltip();
                d3.select(event.currentTarget).classed('hovered', false);
            });

        // 节点标签 (Process Name)
        node.append('text')
            .text((d: GraphNode) => d.name)
            .attr('x', 10)
            .attr('y', 4)
            .attr('class', 'node-label');

        // 节点 PID 标签
        node.append('text')
            .text((d: GraphNode) => `[${d.id}]`)
            .attr('x', 10)
            .attr('y', -8)
            .attr('class', 'node-pid');

        // 网络连接指示器 - 显示有网络活动的进程
        if (this.showNetworkConnections && this.networkData.length > 0) {
            node.each((d: GraphNode, i: number, nodes: any) => {
                const connections = this.getProcessNetworkConnections(d.id);
                if (connections.length > 0) {
                    const nodeEl = d3.select(nodes[i]);
                    const hasExternal = connections.some(c => this.isExternalAddress(c.DstAddr));
                    
                    // 添加外环表示有网络活动
                    nodeEl.insert('circle', ':first-child')
                        .attr('r', d.radius + 4)
                        .attr('fill', 'none')
                        .attr('stroke', hasExternal ? '#ef4444' : '#22c55e')
                        .attr('stroke-width', 2)
                        .attr('stroke-dasharray', hasExternal ? 'none' : '3,2')
                        .attr('class', 'network-indicator')
                        .attr('opacity', 0.8);
                    
                    // 添加连接数标签
                    nodeEl.append('text')
                        .text(connections.length.toString())
                        .attr('x', d.radius + 2)
                        .attr('y', -d.radius - 2)
                        .attr('class', 'network-count-label')
                        .style('font-size', '9px')
                        .style('fill', hasExternal ? '#ef4444' : '#22c55e')
                        .style('font-weight', 'bold');
                }
            });
        }

        // 模拟每帧更新
        this.simulation.on('tick', () => {
            link
                .attr('x1', (d: any) => d.source.x)
                .attr('y1', (d: any) => d.source.y)
                .attr('x2', (d: any) => d.target.x)
                .attr('y2', (d: any) => d.target.y);

            node.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
        });

        // 点击背景取消选择
        this.svg.on('click', () => {
            this.deselectNode();
        });
    }

    /**
     * 拖拽开始
     */
    private dragStarted(event: any): void {
        if (!event.active) this.simulation.alphaTarget(0.3).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
    }

    /**
     * 拖拽中
     */
    private dragged(event: any): void {
        event.subject.fx = event.x;
        event.subject.fy = event.y;
    }

    /**
     * 拖拽结束
     */
    private dragEnded(event: any): void {
        if (!event.active) this.simulation.alphaTarget(0);
        event.subject.fx = null;
        event.subject.fy = null;
    }

    /**
     * 选择节点
     */
    private selectNode(node: GraphNode): void {
        this.selectedNode = node;
        
        // 更新节点样式
        this.g?.selectAll('.node-circle')
            .classed('selected', (d: GraphNode) => d.id === node.id);

        // 显示详情面板
        this.showDetailPanel(node);
    }

    /**
     * 更新力导向图参数（不重新渲染整个图）
     */
    private updateForceParameters(): void {
        if (!this.simulation) return;
        
        const canvasWrapper = this.container?.querySelector('#galaxy-canvas-wrapper');
        const width = canvasWrapper?.clientWidth || 800;
        const height = canvasWrapper?.clientHeight || 600;
        
        // 更新向心力（聚拢度）
        this.simulation.force('x', d3.forceX(width / 2).strength(this.clusterGravity));
        this.simulation.force('y', d3.forceY(height / 2).strength(this.clusterGravity));
        
        // 更新连线距离
        if (this.graphData) {
            this.simulation.force('link', d3.forceLink(this.graphData.links).id((d: any) => d.id).distance(this.linkDistance));
        }
        
        // 重新启动模拟
        this.simulation.alpha(0.5).restart();
    }

    /**
     * 取消选择节点
     */
    private deselectNode(): void {
        this.selectedNode = null;
        
        // 移除选中样式
        this.g?.selectAll('.node-circle').classed('selected', false);

        // 隐藏详情面板
        this.hideDetailPanel();
    }

    /**
     * 显示详情面板
     */
    private showDetailPanel(node: GraphNode): void {
        const panel = this.container?.querySelector('#galaxy-detail-panel') as HTMLElement;
        const title = this.container?.querySelector('#detail-panel-title');
        const body = this.container?.querySelector('#detail-panel-body');

        if (!panel || !body) return;

        const data = node.data;
        
        if (title) {
            title.textContent = data.ShortName || data.Name || 'Unknown';
        }

        body.innerHTML = `
            <div class="detail-section">
                <h4>${this.icons.process} 基本信息</h4>
                <div class="detail-grid">
                    <div class="detail-item">
                        <span class="detail-label">PID:</span>
                        <span class="detail-value highlight">${data.PID}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">PPID:</span>
                        <span class="detail-value">${data.PPID}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">进程名:</span>
                        <span class="detail-value">${this.escapeHtml(data.Name || '-')}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">状态:</span>
                        <span class="detail-value">${data.State || '-'}</span>
                    </div>
                </div>
            </div>

            <div class="detail-section">
                <h4>${this.icons.info} 安全信息</h4>
                <div class="detail-grid">
                    <div class="detail-item">
                        <span class="detail-label">用户:</span>
                        <span class="detail-value">${this.escapeHtml(data.User || '-')}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">完整性级别:</span>
                        <span class="detail-value">${data.IntegrityLevel || '-'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Wow64:</span>
                        <span class="detail-value">${data.Wow64 === '1' ? 'Yes (32位)' : 'No (64位)'}</span>
                    </div>
                </div>
            </div>

            <div class="detail-section">
                <h4>${this.icons.time} 时间信息</h4>
                <div class="detail-grid">
                    <div class="detail-item full-width">
                        <span class="detail-label">创建时间:</span>
                        <span class="detail-value">${this.escapeHtml(data.CreateTime || '-')}</span>
                    </div>
                    <div class="detail-item full-width">
                        <span class="detail-label">退出时间:</span>
                        <span class="detail-value">${this.escapeHtml(data.ExitTime || '-')}</span>
                    </div>
                </div>
            </div>

            <div class="detail-section">
                <h4>${this.icons.code} 路径信息</h4>
                <div class="detail-grid">
                    <div class="detail-item full-width">
                        <span class="detail-label">用户路径:</span>
                        <span class="detail-value code">${this.escapeHtml(data.UserPath || '-')}</span>
                    </div>
                    <div class="detail-item full-width">
                        <span class="detail-label">内核路径:</span>
                        <span class="detail-value code">${this.escapeHtml(data.KernelPath || '-')}</span>
                    </div>
                    <div class="detail-item full-width">
                        <span class="detail-label">命令行:</span>
                        <span class="detail-value code">${this.escapeHtml(data.CommandLine || '-')}</span>
                    </div>
                </div>
            </div>

            <div class="detail-section">
                <h4>${this.icons.info} 内存信息</h4>
                <div class="detail-grid">
                    <div class="detail-item">
                        <span class="detail-label">EPROCESS:</span>
                        <span class="detail-value code">${data.EPROCESS || '-'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">PEB:</span>
                        <span class="detail-value code">${data.PEB || '-'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">DTB:</span>
                        <span class="detail-value code">${data.DTB || '-'}</span>
                    </div>
                </div>
            </div>
            
            ${this.renderNetworkSection(data.PID)}
            ${this.renderAnomalySection(data.PID)}
        `;

        panel.style.display = 'flex';
    }
    
    /**
     * 渲染网络连接部分
     */
    private renderNetworkSection(pid: string): string {
        const connections = this.getProcessNetworkConnections(pid);
        
        if (connections.length === 0) {
            return `
                <div class="detail-section">
                    <h4>${this.icons.connection} 网络连接</h4>
                    <div class="no-connections">该进程没有网络连接</div>
                </div>
            `;
        }
        
        // 按状态分组
        const listening = connections.filter(c => c.State === 'LISTENING');
        const established = connections.filter(c => c.State === 'ESTABLISHED' || c.State === 'CLOSED' || c.State === 'SYN_SENT');
        
        let connectionsHtml = '';
        
        // 监听连接
        if (listening.length > 0) {
            connectionsHtml += `
                <div class="network-group">
                    <div class="network-group-title">监听 (${listening.length})</div>
                    ${listening.slice(0, 10).map(conn => `
                        <div class="network-item listening">
                            <span class="net-proto">${conn.Proto}</span>
                            <span class="net-addr">${this.escapeHtml(conn.SrcAddr)}:${conn.SrcPort}</span>
                            <span class="net-state">${conn.State}</span>
                        </div>
                    `).join('')}
                    ${listening.length > 10 ? `<div class="network-more">还有 ${listening.length - 10} 条...</div>` : ''}
                </div>
            `;
        }
        
        // 外出连接
        if (established.length > 0) {
            connectionsHtml += `
                <div class="network-group">
                    <div class="network-group-title">连接 (${established.length})</div>
                    ${established.slice(0, 10).map(conn => `
                        <div class="network-item ${this.isExternalAddress(conn.DstAddr) ? 'external' : 'internal'}">
                            <span class="net-proto">${conn.Proto}</span>
                            <span class="net-direction">→</span>
                            <span class="net-addr">${this.escapeHtml(conn.DstAddr)}:${conn.DstPort}</span>
                            <span class="net-state">${conn.State}</span>
                        </div>
                    `).join('')}
                    ${established.length > 10 ? `<div class="network-more">还有 ${established.length - 10} 条...</div>` : ''}
                </div>
            `;
        }
        
        return `
            <div class="detail-section network-section">
                <h4>${this.icons.connection} 网络连接 (${connections.length})</h4>
                ${connectionsHtml}
            </div>
        `;
    }
    
    /**
     * 判断是否为外部地址
     */
    private isExternalAddress(addr: string): boolean {
        if (!addr) return false;
        return !addr.startsWith('127.') && 
               !addr.startsWith('0.0.0.0') && 
               !addr.startsWith('10.') && 
               !addr.startsWith('192.168.') && 
               !addr.startsWith('172.16.') &&
               !addr.startsWith('::') && 
               !addr.startsWith('*') &&
               addr !== '0';
    }

    /**
     * 隐藏详情面板
     */
    private hideDetailPanel(): void {
        const panel = this.container?.querySelector('#galaxy-detail-panel') as HTMLElement;
        if (panel) {
            panel.style.display = 'none';
        }
    }

    /**
     * 显示悬浮提示
     */
    private showTooltip(event: any, node: GraphNode): void {
        const tooltip = this.container?.querySelector('#galaxy-tooltip') as HTMLElement;
        if (!tooltip) return;

        const connections = this.getProcessNetworkConnections(node.id);
        const externalConnections = connections.filter(c => this.isExternalAddress(c.DstAddr));
        
        let networkInfo = '';
        if (connections.length > 0) {
            networkInfo = `
                <div class="tooltip-divider"></div>
                <div class="tooltip-info network">${this.icons.connection} 网络连接: ${connections.length}</div>
                ${externalConnections.length > 0 ? `<div class="tooltip-info external">⚠ 外联: ${externalConnections.length}</div>` : ''}
            `;
        }

        // 异常度信息
        let anomalyInfo = '';
        if (node.anomalyScore > 0) {
            const levelLabels: Record<string, string> = { normal: '正常', low: '低危', medium: '轻微', high: '可疑', critical: '高危' };
            const levelColors: Record<string, string> = { normal: '#22c55e', low: '#eab308', medium: '#f97316', high: '#ef4444', critical: '#dc2626' };
            anomalyInfo = `
                <div class="tooltip-divider"></div>
                <div class="tooltip-info" style="color: ${levelColors[node.anomalyLevel] || '#666'}">
                    ${this.icons.warning} 异常度: ${node.anomalyScore.toFixed(1)} (${levelLabels[node.anomalyLevel] || '未知'})
                </div>
            `;
        }

        tooltip.innerHTML = `
            <div class="tooltip-title">${this.escapeHtml(node.name)}</div>
            <div class="tooltip-info">PID: ${node.id}</div>
            <div class="tooltip-info">PPID: ${node.data.PPID}</div>
            <div class="tooltip-info">User: ${this.escapeHtml(node.data.User || 'Unknown')}</div>
            ${anomalyInfo}
            ${networkInfo}
        `;

        tooltip.style.display = 'block';
        tooltip.style.left = `${event.pageX + 15}px`;
        tooltip.style.top = `${event.pageY + 15}px`;
    }

    /**
     * 隐藏悬浮提示
     */
    private hideTooltip(): void {
        const tooltip = this.container?.querySelector('#galaxy-tooltip') as HTMLElement;
        if (tooltip) {
            tooltip.style.display = 'none';
        }
    }

    /**
     * 高亮搜索结果
     */
    private highlightSearchResult(keyword: string): void {
        if (!this.g) return;

        const searchLower = keyword.toLowerCase().trim();

        this.g.selectAll('.galaxy-node')
            .classed('search-match', (d: GraphNode) => {
                if (!searchLower) return false;
                return d.name.toLowerCase().includes(searchLower) ||
                       d.id.includes(searchLower) ||
                       (d.data.CommandLine || '').toLowerCase().includes(searchLower);
            })
            .classed('search-dimmed', (d: GraphNode) => {
                if (!searchLower) return false;
                return !d.name.toLowerCase().includes(searchLower) &&
                       !d.id.includes(searchLower) &&
                       !(d.data.CommandLine || '').toLowerCase().includes(searchLower);
            });
    }

    /**
     * 缩放
     */
    private zoom(factor: number): void {
        if (!this.svg || !this.zoomBehavior) return;

        const svgNode = this.svg.node();
        const currentTransform = d3.zoomTransform(svgNode);
        const newScale = currentTransform.k * factor;

        if (newScale >= 0.1 && newScale <= 4) {
            // 保留当前平移位置，只改变缩放比例
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
        const container = this.container?.querySelector('.process-galaxy-container') as HTMLElement;
        const btn = this.container?.querySelector('#galaxy-fullscreen-btn');
        
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
     * 更新统计信息
     */
    private updateStats(): void {
        const nodeCount = this.container?.querySelector('#node-count');
        const linkCount = this.container?.querySelector('#link-count');
        const dataSourceText = this.container?.querySelector('#data-source-text');

        if (nodeCount && this.graphData) {
            nodeCount.textContent = this.graphData.nodes.length.toString();
        }
        if (linkCount && this.graphData) {
            linkCount.textContent = this.graphData.links.length.toString();
        }
        
        // 更新数据源指示器
        if (dataSourceText) {
            if (this.dataSource === 'vol3_pstree') {
                dataSourceText.textContent = 'Vol3 pstree';
                dataSourceText.parentElement?.classList.add('vol3-source');
            } else {
                dataSourceText.textContent = 'process.csv';
                dataSourceText.parentElement?.classList.remove('vol3-source');
            }
        }
    }

    /**
     * 更新图例
     */
    private updateLegend(): void {
        const legendItems = this.container?.querySelector('#legend-items');
        if (!legendItems || !this.graphData || !this.colorScale) return;

        const uniqueGroups = [...new Set(this.graphData.nodes.map(n => n.group))];
        
        legendItems.innerHTML = uniqueGroups.slice(0, 10).map(group => `
            <div class="legend-item">
                <span class="legend-color" style="background-color: ${this.colorScale(group)}"></span>
                <span class="legend-text">${this.escapeHtml(group || 'Unknown')}</span>
            </div>
        `).join('');

        if (uniqueGroups.length > 10) {
            legendItems.innerHTML += `<div class="legend-item legend-more">+${uniqueGroups.length - 10} 更多...</div>`;
        }
    }

    /**
     * 显示加载状态
     */
    private showLoading(): void {
        const loading = this.container?.querySelector('#galaxy-loading') as HTMLElement;
        const empty = this.container?.querySelector('#galaxy-empty') as HTMLElement;
        const svg = this.container?.querySelector('#galaxy-svg') as HTMLElement;

        if (loading) loading.style.display = 'flex';
        if (empty) empty.style.display = 'none';
        if (svg) svg.style.display = 'none';
    }

    /**
     * 隐藏加载状态
     */
    private hideLoading(): void {
        const loading = this.container?.querySelector('#galaxy-loading') as HTMLElement;
        const svg = this.container?.querySelector('#galaxy-svg') as HTMLElement;

        if (loading) loading.style.display = 'none';
        if (svg) svg.style.display = 'block';
    }

    /**
     * 显示空状态
     */
    private showEmpty(): void {
        const loading = this.container?.querySelector('#galaxy-loading') as HTMLElement;
        const empty = this.container?.querySelector('#galaxy-empty') as HTMLElement;
        const svg = this.container?.querySelector('#galaxy-svg') as HTMLElement;

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

    // ==================== 熵值分析相关 ====================

    /**
     * 运行熵值分析
     */
    private runEntropyAnalysis(): void {
        this.analysisResults.clear();
        const results = this.analyzer.analyze(this.rawData as any, this.networkData as any);
        for (const result of results) {
            this.analysisResults.set(result.pid, result);
        }
        console.log(`🔬 熵值分析完成: ${results.length} 个进程, 异常进程: ${results.filter(r => r.level !== 'normal').length}`);
    }

    /**
     * 获取异常度着色
     */
    private getAnomalyColor(node: GraphNode): string {
        switch (node.anomalyLevel) {
            case 'critical': return '#dc2626';
            case 'high': return '#ef4444';
            case 'medium': return '#f97316';
            case 'low': return '#eab308';
            default: return this.colorScale?.(node.group) || '#64748b';
        }
    }

    /**
     * 更新异常度摘要栏
     */
    private updateAnomalyBar(): void {
        const bar = this.container?.querySelector('#galaxy-anomaly-bar') as HTMLElement;
        if (!bar) return;

        let critical = 0, high = 0, medium = 0, low = 0;
        const topAnomalies: ProcessAnalysisResult[] = [];

        for (const result of this.analysisResults.values()) {
            if (result.level === 'critical') critical++;
            else if (result.level === 'high') high++;
            else if (result.level === 'medium') medium++;
            else if (result.level === 'low') low++;

            if (result.anomalyScore >= 40) {
                topAnomalies.push(result);
            }
        }

        const total = critical + high + medium + low;
        if (total === 0) {
            bar.style.display = 'none';
            return;
        }

        bar.style.display = 'flex';

        const criticalEl = this.container?.querySelector('#anomaly-critical-count');
        const highEl = this.container?.querySelector('#anomaly-high-count');
        const mediumEl = this.container?.querySelector('#anomaly-medium-count');
        const lowEl = this.container?.querySelector('#anomaly-low-count');

        if (criticalEl) criticalEl.textContent = critical.toString();
        if (highEl) highEl.textContent = high.toString();
        if (mediumEl) mediumEl.textContent = medium.toString();
        if (lowEl) lowEl.textContent = low.toString();

        // Top 异常进程列表
        topAnomalies.sort((a, b) => b.anomalyScore - a.anomalyScore);
        const topList = this.container?.querySelector('#anomaly-top-list');
        if (topList) {
            topList.innerHTML = topAnomalies.slice(0, 5).map(r => {
                const levelColors: Record<string, string> = { critical: '#dc2626', high: '#ef4444', medium: '#f97316', low: '#eab308', normal: '#64748b' };
                return `<span class="anomaly-top-item" style="border-left: 3px solid ${levelColors[r.level]};" 
                    title="点击定位" data-pid="${r.pid}">
                    <strong>${this.escapeHtml(r.processName)}</strong>
                    <span class="anomaly-score">${r.anomalyScore.toFixed(1)}</span>
                </span>`;
            }).join('');

            // 绑定点击事件：点击异常进程自动定位
            topList.querySelectorAll('.anomaly-top-item').forEach(item => {
                item.addEventListener('click', () => {
                    const pid = item.getAttribute('data-pid');
                    if (pid && this.graphData) {
                        const targetNode = this.graphData.nodes.find(n => n.id === pid);
                        if (targetNode) this.selectNode(targetNode);
                    }
                });
            });
        }
    }

    /**
     * 渲染异常度分析部分（详情面板）
     */
    private renderAnomalySection(pid: string): string {
        const analysis = this.analysisResults.get(pid);
        if (!analysis || analysis.anomalyScore === 0) {
            return `
                <div class="detail-section">
                    <h4>${this.icons.warning} 熵值分析</h4>
                    <div class="anomaly-normal">该进程未检测到异常</div>
                </div>
            `;
        }

        const levelLabels: Record<string, string> = { normal: '正常', low: '低危', medium: '轻微可疑', high: '可疑', critical: '高危' };
        const levelColors: Record<string, string> = { normal: '#22c55e', low: '#eab308', medium: '#f97316', high: '#ef4444', critical: '#dc2626' };

        // 维度评分柱状图
        const dimensionBars = analysis.dimensions.map(dim => {
            const barWidth = Math.max(dim.normalizedScore, 2);
            const barColor = dim.normalizedScore >= 60 ? '#ef4444' : dim.normalizedScore >= 30 ? '#f97316' : '#22c55e';
            return `
                <div class="dimension-row">
                    <span class="dim-name">${dim.dimension}</span>
                    <div class="dim-bar-bg">
                        <div class="dim-bar" style="width: ${barWidth}%; background: ${barColor};"></div>
                    </div>
                    <span class="dim-value">${dim.normalizedScore.toFixed(0)}</span>
                </div>
            `;
        }).join('');

        // 告警列表
        const alertsHtml = analysis.alerts.length > 0 ? analysis.alerts.map(alert => {
            const icon = alert.severity === 'critical' ? '🚨' : alert.severity === 'warning' ? '⚠️' : 'ℹ️';
            return `
                <div class="anomaly-alert ${alert.severity}">
                    <span class="alert-icon">${icon}</span>
                    <div class="alert-content">
                        <strong>${this.escapeHtml(alert.title)}</strong>
                        <div class="alert-desc">${this.escapeHtml(alert.description)}</div>
                    </div>
                </div>
            `;
        }).join('') : '';

        return `
            <div class="detail-section anomaly-section">
                <h4>${this.icons.warning} 熵值分析</h4>
                <div class="anomaly-score-header">
                    <span class="anomaly-total-score" style="color: ${levelColors[analysis.level]}">
                        ${analysis.anomalyScore.toFixed(1)}
                    </span>
                    <span class="anomaly-level-badge" style="background: ${levelColors[analysis.level]}">
                        ${levelLabels[analysis.level]}
                    </span>
                </div>
                <div class="dimension-chart">
                    ${dimensionBars}
                </div>
                ${alertsHtml ? `<div class="anomaly-alerts">${alertsHtml}</div>` : ''}
            </div>
        `;
    }

    // ==================== 工具方法 ====================

    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
