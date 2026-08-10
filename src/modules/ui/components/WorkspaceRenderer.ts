import { AppState } from '../../core/types';
import { ToolsArea } from '../../areas/toolsArea';
import { WelcomePageRenderer } from '../welcomePage';
import { MemProcFSAreaV2 } from '../../areas/memprocfsAreaV2';
import { MemProcFSWorkspaceV2Renderer } from './MemProcFSWorkspaceV2Renderer';
import { Volatility3WorkspaceV2Renderer } from './Volatility3WorkspaceV2Renderer';
import { Vol3LinuxWorkspaceV2Renderer } from './Vol3LinuxWorkspaceV2Renderer';
import { Volatility2WorkspaceV2Renderer } from './Volatility2WorkspaceV2Renderer';
import { MemNixFSWorkspaceV2Renderer } from './MemNixFSWorkspaceV2Renderer';
import { BreadcrumbNav } from './BreadcrumbNav';
import { favoritesManager } from '../../core/favorites';
import { IconParkHelper } from '../../utils/iconparkHelper';
import { DashboardPanel } from './DashboardPanel';

export class WorkspaceRenderer {
    private v2Renderer: MemProcFSWorkspaceV2Renderer | null = null;
    private vol3V2Renderer: Volatility3WorkspaceV2Renderer | null = null;
    private vol3LinuxV2Renderer: Vol3LinuxWorkspaceV2Renderer | null = null;
    private vol2V2Renderer: Volatility2WorkspaceV2Renderer | null = null;
    private memnixfsV2Renderer: MemNixFSWorkspaceV2Renderer | null = null;

    constructor(
        private state: AppState,
        private areas: any[],
        private getAreaIcon: (config: any) => string,
        private isFilePath: (str: string) => boolean
    ) { }

    public updateState(state: AppState) {
        this.state = state;
    }

    /**
     * 获取V2渲染器实例
     */
    public getV2Renderer(): MemProcFSWorkspaceV2Renderer | null {
        return this.v2Renderer;
    }

    /**
     * 获取Vol3 V2渲染器实例
     */
    public getVol3V2Renderer(): Volatility3WorkspaceV2Renderer | null {
        return this.vol3V2Renderer;
    }

    /**
     * 获取Vol3 Linux V2渲染器实例
     */
    public getVol3LinuxV2Renderer(): Vol3LinuxWorkspaceV2Renderer | null {
        return this.vol3LinuxV2Renderer;
    }

    /**
     * 检查当前区域是否是 MemNixFS V2 版本（内嵌CSV）
     */
    private isMemNixFSV2Area(): boolean {
        const currentArea = this.areas[this.state.selectedAvatar];
        if (!currentArea) return false;
        const config = currentArea.getConfig();
        return config.name === 'MemNixFS V2' && config.desc?.includes('内嵌CSV');
    }

    /**
     * 检查当前区域是否是V2版本
     */
    private isV2Area(): boolean {
        const currentArea = this.areas[this.state.selectedAvatar];
        if (!currentArea) return false;
        const config = currentArea.getConfig();
        // V2版本现在显示为 'MemProcFS'，手动版本显示为 'MemProcFS(手动版本)'
        return config.name === 'MemProcFS' && config.desc?.includes('内嵌CSV');
    }

    /**
     * 检查当前区域是否是Volatility3 V2版本（内嵌CSV）
     */
    private isVol3V2Area(): boolean {
        const currentArea = this.areas[this.state.selectedAvatar];
        if (!currentArea) return false;
        const config = currentArea.getConfig();
        // V2版本现在显示为 'Volatility3' 且描述包含内嵌CSV
        return config.name === 'Volatility3' && config.desc?.includes('内嵌CSV');
    }

    /**
     * 检查当前区域是否是Vol3 Linux V2版本（内嵌CSV）
     */
    private isVol3LinuxV2Area(): boolean {
        const currentArea = this.areas[this.state.selectedAvatar];
        if (!currentArea) return false;
        const config = currentArea.getConfig();
        return config.name === 'Vol3Linux V2' && config.desc?.includes('内嵌CSV');
    }

    /**
     * 检查当前区域是否是Volatility2 V2版本（内嵌CSV）
     */
    private isVol2V2Area(): boolean {
        const currentArea = this.areas[this.state.selectedAvatar];
        if (!currentArea) return false;
        const config = currentArea.getConfig();
        return config.name === 'Volatility2' && config.desc?.includes('内嵌CSV');
    }

    /**
     * 获取Vol2 V2渲染器实例
     */
    public getVol2V2Renderer(): Volatility2WorkspaceV2Renderer | null {
        return this.vol2V2Renderer;
    }

    /**
     * 检查当前区域是否是Volatility3手动版本
     */
    private isVol3ManualArea(): boolean {
        const currentArea = this.areas[this.state.selectedAvatar];
        if (!currentArea) return false;
        const config = currentArea.getConfig();
        return config.name === 'Volatility3(手动版本)';
    }

    public async render(): Promise<string> {
        if (!this.state.currentImage) {
            // 没有加载镜像时，清理V2渲染器并显示欢迎页面
            if (this.v2Renderer) {
                this.v2Renderer.cleanup();
                this.v2Renderer = null;
            }
            if (this.vol3V2Renderer) {
                this.vol3V2Renderer.cleanup();
                this.vol3V2Renderer = null;
            }
            if (this.vol3LinuxV2Renderer) {
                this.vol3LinuxV2Renderer.cleanup();
                this.vol3LinuxV2Renderer = null;
            }
            if (this.vol2V2Renderer) {
                this.vol2V2Renderer.cleanup();
                this.vol2V2Renderer = null;
            }
            if (this.memnixfsV2Renderer) {
                this.memnixfsV2Renderer.cleanup();
                this.memnixfsV2Renderer = null;
            }
            return this.renderEmptyWorkspace();
        }

        const currentArea = this.areas[this.state.selectedAvatar];
        const config = currentArea.getConfig();

        // 检查是否是MemProcFS V2版本（内嵌CSV），使用特殊渲染
        if (config.name === 'MemProcFS' && config.desc?.includes('内嵌CSV')) {
            // 清理Vol3 V2渲染器
            if (this.vol3V2Renderer) {
                this.vol3V2Renderer.cleanup();
                this.vol3V2Renderer = null;
            }
            // 创建或复用V2渲染器
            if (!this.v2Renderer) {
                this.v2Renderer = new MemProcFSWorkspaceV2Renderer(
                    this.state,
                    this.getAreaIcon,
                    this.isFilePath
                );
            } else {
                this.v2Renderer.updateState(this.state);
            }
            return this.v2Renderer.render();
        }

        // 检查是否是Volatility3 V2版本（内嵌CSV），使用V2风格渲染
        if (config.name === 'Volatility3' && config.desc?.includes('内嵌CSV')) {
            // 清理MemProcFS V2渲染器
            if (this.v2Renderer) {
                this.v2Renderer.cleanup();
                this.v2Renderer = null;
            }
            // 清理Vol3 Linux V2渲染器
            if (this.vol3LinuxV2Renderer) {
                this.vol3LinuxV2Renderer.cleanup();
                this.vol3LinuxV2Renderer = null;
            }
            // 创建或复用Vol3 V2渲染器
            if (!this.vol3V2Renderer) {
                this.vol3V2Renderer = new Volatility3WorkspaceV2Renderer(
                    this.state,
                    this.getAreaIcon,
                    this.isFilePath
                );
            } else {
                this.vol3V2Renderer.updateState(this.state);
            }
            return this.vol3V2Renderer.render();
        }

        // 检查是否是Volatility2 V2版本（内嵌CSV），使用V2风格渲染
        if (config.name === 'Volatility2' && config.desc?.includes('内嵌CSV')) {
            // 清理其他V2渲染器
            if (this.v2Renderer) {
                this.v2Renderer.cleanup();
                this.v2Renderer = null;
            }
            if (this.vol3V2Renderer) {
                this.vol3V2Renderer.cleanup();
                this.vol3V2Renderer = null;
            }
            if (this.vol3LinuxV2Renderer) {
                this.vol3LinuxV2Renderer.cleanup();
                this.vol3LinuxV2Renderer = null;
            }
            // 创建或复用Vol2 V2渲染器
            if (!this.vol2V2Renderer) {
                this.vol2V2Renderer = new Volatility2WorkspaceV2Renderer(
                    this.state,
                    this.getAreaIcon,
                    this.isFilePath
                );
            } else {
                this.vol2V2Renderer.updateState(this.state);
            }
            return this.vol2V2Renderer.render();
        }

        // 检查是否是Vol3 Linux V2版本（内嵌CSV），使用V2风格渲染
        if (config.name === 'Vol3Linux V2' && config.desc?.includes('内嵌CSV')) {
            // 清理 MemProcFS V2 渲染器
            if (this.v2Renderer) {
                this.v2Renderer.cleanup();
                this.v2Renderer = null;
            }
            // 清理 Vol3 V2 渲染器
            if (this.vol3V2Renderer) {
                this.vol3V2Renderer.cleanup();
                this.vol3V2Renderer = null;
            }

            // 创建或复用 Vol3 Linux V2 渲染器
            if (!this.vol3LinuxV2Renderer) {
                this.vol3LinuxV2Renderer = new Vol3LinuxWorkspaceV2Renderer(
                    this.state,
                    this.getAreaIcon,
                    this.isFilePath
                );
            } else {
                this.vol3LinuxV2Renderer.updateState(this.state);
            }
            return this.vol3LinuxV2Renderer.render();
        }

        // 检查是否是 MemNixFS V2 版本（内嵌CSV）
        if (config.name === 'MemNixFS V2' && config.desc?.includes('内嵌CSV')) {
            // 清理其它 V2 渲染器
            if (this.v2Renderer) { this.v2Renderer.cleanup(); this.v2Renderer = null; }
            if (this.vol3V2Renderer) { this.vol3V2Renderer.cleanup(); this.vol3V2Renderer = null; }
            if (this.vol3LinuxV2Renderer) { this.vol3LinuxV2Renderer.cleanup(); this.vol3LinuxV2Renderer = null; }
            if (this.vol2V2Renderer) { this.vol2V2Renderer.cleanup(); this.vol2V2Renderer = null; }
            // 创建或复用 MemNixFS V2 渲染器
            if (!this.memnixfsV2Renderer) {
                this.memnixfsV2Renderer = new MemNixFSWorkspaceV2Renderer(
                    this.state,
                    this.getAreaIcon,
                    this.isFilePath
                );
            } else {
                this.memnixfsV2Renderer.updateState(this.state);
            }
            return this.memnixfsV2Renderer.render();
        }

        // 如果切换到非V2区域，清理V2渲染器
        if (this.memnixfsV2Renderer) {
            this.memnixfsV2Renderer.cleanup();
            this.memnixfsV2Renderer = null;
        }
        if (this.v2Renderer) {
            this.v2Renderer.cleanup();
            this.v2Renderer = null;
        }
        if (this.vol3V2Renderer) {
            this.vol3V2Renderer.cleanup();
            this.vol3V2Renderer = null;
        }
        if (this.vol3LinuxV2Renderer) {
            this.vol3LinuxV2Renderer.cleanup();
            this.vol3LinuxV2Renderer = null;
        }
        if (this.vol2V2Renderer) {
            this.vol2V2Renderer.cleanup();
            this.vol2V2Renderer = null;
        }

        let features: any[];
        if (config.name === '小工具') {
            features = await ToolsArea.getFeatures();
        } else {
            const result = currentArea.getFeatures();
            features = Array.isArray(result) ? result : await result;
        }

        const breadcrumbLevels = BreadcrumbNav.buildLevels({
            hasImage: !!this.state.currentImage,
            engineName: config.name,
        });

        return `
      <div class="main-workspace">
        ${BreadcrumbNav.render(breadcrumbLevels)}
        ${DashboardPanel.render(this.state)}
        <div class="workspace-header">
          <div class="current-area-info">
            <div class="current-area-icon area-${config.name.toLowerCase().replace(/\s+/g, '-')}">
              ${this.isFilePath(this.getAreaIcon(config)) ?
                `<img src="${this.getAreaIcon(config)}" alt="${config.name}" style="width: 100%; height: 100%; object-fit: contain; border-radius: var(--radius-lg);">` :
                this.getAreaIcon(config)
            }
            </div>
            <div class="current-area-details">
              <h2>${config.name}</h2>
              <p>${config.desc}</p>
            </div>
          </div>
          <div class="workspace-config">
            ${this.renderWorkspaceConfig(this.state.selectedAvatar)}
          </div>
        </div>

        <div class="feature-workspace">
          <div class="feature-scroll-wrapper">
            <div class="feature-grid-container">
              <div class="feature-grid" id="feature-grid">
                ${features.map(feature => {
                    const isFav = favoritesManager.isFavorite(feature.feature);
                    const starIcon = IconParkHelper.getSvgString('star', { size: 14, strokeWidth: 3, fill: isFav ? 'var(--accent-color, #6366f1)' : 'currentColor' });
                    return `
                  <div class="modern-feature-card" data-feature="${feature.feature}" data-category="${feature.category || 'other'}">
                    <div class="feature-header">
                      <div class="feature-icon">${feature.icon}</div>
                      <button class="feature-fav-btn ${isFav ? 'is-favorite' : ''}" data-fav-feature="${feature.feature}" title="${isFav ? '取消收藏' : '收藏'}">
                        ${starIcon}
                      </button>
                    </div>
                    <div class="feature-body">
                      <h4 class="feature-title">${feature.title}</h4>
                      <p class="feature-description">${feature.desc}</p>
                    </div>
                  </div>
                `;
                }).join('')}
              </div>
            </div>
          </div>
        </div>

        <!-- 右下角分类筛选器 -->
        <div class="floating-category-container">
          <div class="expandable-category-box">
            <div class="category-drawer" id="category-drawer">
              ${this.renderFloatingCategories(features)}
            </div>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="category-icon">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
          </div>
        </div>

        <!-- 右下角搜索框 -->
        <div class="floating-search-container">
          <div class="expandable-search-box">
            <input type="text" placeholder="搜索功能..." class="expandable-search-input" id="workspace-search">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="search-icon">
              <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
            </svg>
          </div>
        </div>
      </div>
    `;
    }

    public renderSync(): string {
        if (!this.state.currentImage) {
            return this.renderEmptyWorkspace();
        }

        const currentArea = this.areas[this.state.selectedAvatar];
        const config = currentArea.getConfig();

        let features: any[];
        if (config.name === '小工具') {
            features = [
                {
                    icon: '📱',
                    title: '获取指定应用中的手机号',
                    desc: '获取指定应用中可能存在的手机号',
                    feature: 'getphonenum',
                    category: 'extract'
                }
            ];
        } else {
            features = currentArea.getFeatures() as any[];
        }

        const breadcrumbLevels = BreadcrumbNav.buildLevels({
            hasImage: !!this.state.currentImage,
            engineName: config.name,
        });

        return `
      <div class="main-workspace">
        ${BreadcrumbNav.render(breadcrumbLevels)}
        ${DashboardPanel.render(this.state)}
        <div class="workspace-header">
          <div class="current-area-info">
            <div class="current-area-icon area-${config.name.toLowerCase().replace(/\s+/g, '-')}">
              ${this.isFilePath(this.getAreaIcon(config)) ?
                `<img src="${this.getAreaIcon(config)}" alt="${config.name}" style="width: 100%; height: 100%; object-fit: contain; border-radius: var(--radius-lg);">` :
                this.getAreaIcon(config)
            }
            </div>
            <div class="current-area-details">
              <h2>${config.name}</h2>
              <p>${config.desc}</p>
            </div>
          </div>
          <div class="workspace-config">
            ${this.renderWorkspaceConfig(this.state.selectedAvatar)}
          </div>
        </div>

        <div class="feature-workspace">
          <div class="feature-scroll-wrapper">
            <div class="feature-grid-container">
              <div class="feature-grid" id="feature-grid">
                ${features.map(feature => {
                    const isFav = favoritesManager.isFavorite(feature.feature);
                    const starIcon = IconParkHelper.getSvgString('star', { size: 14, strokeWidth: 3, fill: isFav ? 'var(--accent-color, #6366f1)' : 'currentColor' });
                    return `
                  <div class="modern-feature-card" data-feature="${feature.feature}" data-category="${feature.category || 'other'}">
                    <div class="feature-header">
                      <div class="feature-icon">${feature.icon}</div>
                      <button class="feature-fav-btn ${isFav ? 'is-favorite' : ''}" data-fav-feature="${feature.feature}" title="${isFav ? '\u53d6\u6d88\u6536\u85cf' : '\u6536\u85cf'}">
                        ${starIcon}
                      </button>
                    </div>
                    <div class="feature-body">
                      <h4 class="feature-title">${feature.title}</h4>
                      <p class="feature-description">${feature.desc}</p>
                    </div>
                  </div>
                `;
                }).join('')}
              </div>
            </div>
          </div>
        </div>

        <!-- 右下角分类筛选器 -->
        <div class="floating-category-container">
          <div class="expandable-category-box">
            <div class="category-drawer" id="category-drawer">
              ${this.renderFloatingCategories(features)}
            </div>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="category-icon">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
          </div>
        </div>

        <!-- 右下角搜索框 -->
        <div class="floating-search-container">
          <div class="expandable-search-box">
            <input type="text" placeholder="搜索功能..." class="expandable-search-input" id="workspace-search">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="search-icon">
              <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
            </svg>
          </div>
        </div>
      </div>
    `;
    }

    private renderEmptyWorkspace(): string {
        return WelcomePageRenderer.render();
    }

    private renderWorkspaceConfig(areaIndex: number): string {
        const area = this.areas[areaIndex];
        const areaName = area.getConfig().name;

        switch (areaName) {
            case 'Volatility2(手动版本)':
                return `
          <div class="config-section">
            <label class="config-label">Profile:</label>
            <select class="config-select" id="vol2-profile">
              <option value="" disabled selected>请先加载镜像以检测Profile</option>
            </select>
          </div>
        `;

            case 'Volatility3':
                return `
          <div class="config-section">
            <label class="config-checkbox">
              <input type="checkbox" id="vol3-offline"> Offline模式
            </label>
          </div>
        `;

            case 'MemProcFS':
                return ``;

            case 'Vol2 Linux':
                return ` `;

            case 'Vol3 Linux':
                return `
          <div class="config-section">
            <label class="config-checkbox">
              <input type="checkbox" id="vol3linux-proxy" checked> 使用远程符号表
            </label>
          </div>
          <div class="config-section">
            <label class="config-label">代理URL:</label>
            <input type="text" class="config-input" id="vol3linux-proxy-url" placeholder="这里填代理地址，例如http://127.0.0.1:7890">
          </div>
        `;

            case '小工具':
                return ``;

            default:
                return `
          <div class="config-section">
            <label class="config-checkbox">
              <input type="checkbox" checked> 详细输出
            </label>
          </div>
        `;
        }
    }

    private renderFloatingCategories(features: any[]): string {
        const categories = [...new Set(features.map(f => f.category))];
        const favStar = IconParkHelper.getSvgString('star', { size: 14, strokeWidth: 3 });
        const allIcon = IconParkHelper.getSvgString('list', { size: 14, strokeWidth: 3 });

        return `
      <div class="floating-category-filters">
        <button class="floating-category-btn active" data-category="all">
          <span class="floating-category-icon">${allIcon}</span>
          <span class="floating-category-title">全部</span>
        </button>
        <button class="floating-category-btn" data-category="favorites">
          <span class="floating-category-icon">${favStar}</span>
          <span class="floating-category-title">收藏</span>
        </button>
        ${categories.map(category => `
          <button class="floating-category-btn" data-category="${category}">
            <span class="floating-category-icon">${this.getCategoryIcon(category)}</span>
            <span class="floating-category-title">${this.getCategoryName(category)}</span>
          </button>
        `).join('')}
      </div>
    `;
    }

    private getCategoryIcon(category: string): string {
        const icons: { [key: string]: string } = {
            'system-info': '🖥️',
            'process': '📋',
            'memory': '🧠',
            'network': '🌐',
            'filesystem': '🗂️',
            'registry': '📜',
            'security': '🛡️',
            'kernel': '⚙️',
            'gui': '🪟',
            'services': '🔧',
            'browser-forensics': '🌍',
            'timeline': '📅',
            'forensics': '🔍',
            'core': '🎯',
            'analysis': '📊',
            'system': '⚙️',
            'forensic': '🔍',
            'file': '📁',
            'info': '🟢',
            'dump': '💾',
            'extract': '🔧',
            'view': '👁️',
            'crypto': '🔐',
            'utility': '🛠️',
            'monitor': '📡',
            'export': '📤'
        };
        return icons[category] || '📌';
    }

    private getCategoryName(category: string): string {
        const names: { [key: string]: string } = {
            'system-info': '系统信息',
            'process': '进程分析',
            'memory': '内存分析',
            'network': '网络分析',
            'filesystem': '文件系统',
            'registry': '注册表',
            'security': '安全分析',
            'kernel': '内核分析',
            'gui': 'GUI分析',
            'services': '服务分析',
            'browser-forensics': '浏览器取证',
            'timeline': '时间线分析',
            'forensics': '取证工具',
            'core': '核心',
            'analysis': '分析',
            'system': '系统',
            'forensic': '取证',
            'file': '文件',
            'info': '信息',
            'dump': '转储',
            'extract': '提取',
            'view': '查看',
            'crypto': '加密',
            'utility': '工具',
            'monitor': '监控',
            'export': '导出'
        };
        return names[category] || category;
    }

    public renderAnalysisPanel(): string {
        return `
      <div class="analysis-panel">
        <div class="panel-header">
          <h3>📊 分析面板</h3>
          <div class="panel-controls">
            <button class="panel-btn" id="export-results">
              <span>📤</span> 导出
            </button>
            <button class="panel-btn" id="clear-results">
              <span>🗑️</span> 清空
            </button>
          </div>
        </div>
        <div class="analysis-content">
          <div class="analysis-tabs">
            <button class="analysis-tab active" data-tab="results">结果</button>
            <button class="analysis-tab" data-tab="logs">日志</button>
            <button class="analysis-tab" data-tab="timeline">时间线</button>
          </div>
          <div class="analysis-data" id="analysis-results">
            ${this.state.commandOutput.length > 0 ?
                this.state.commandOutput.map(line => `<div class="result-line">${line}</div>`).join('') :
                '<div class="empty-state">暂无分析结果</div>'
            }
          </div>
        </div>
      </div>
    `;
    }

    /**
     * 渲染后初始化事件
     * 在DOM更新后调用此方法
     */
    public initPostRenderEvents(): void {
        // 如果没有加载镜像，不需要初始化V2事件（此时显示的是欢迎页面）
        if (!this.state.currentImage) {
            return;
        }
        
        // 如果是MemProcFS V2区域，初始化V2事件
        if (this.v2Renderer && this.isV2Area()) {
            this.v2Renderer.initEvents();
        }
        // 如果是Volatility3 V2区域，初始化Vol3 V2事件
        if (this.vol3V2Renderer && this.isVol3V2Area()) {
            this.vol3V2Renderer.initEvents();
        }

        // 如果是Vol3 Linux V2区域，初始化Vol3 Linux V2事件
        if (this.vol3LinuxV2Renderer && this.isVol3LinuxV2Area()) {
            this.vol3LinuxV2Renderer.initEvents();
        }
        // 如果是Volatility2 V2区域，初始化Vol2 V2事件
        if (this.vol2V2Renderer && this.isVol2V2Area()) {
            this.vol2V2Renderer.initEvents();
        }
        // 如果是 MemNixFS V2 区域，初始化事件
        if (this.memnixfsV2Renderer && this.isMemNixFSV2Area()) {
            this.memnixfsV2Renderer.initEvents();
        }
    }

    /**
     * 清理资源
     */
    public cleanup(): void {
        if (this.memnixfsV2Renderer) {
            this.memnixfsV2Renderer.cleanup();
            this.memnixfsV2Renderer = null;
        }
        if (this.v2Renderer) {
            this.v2Renderer.cleanup();
            this.v2Renderer = null;
        }
        if (this.vol3V2Renderer) {
            this.vol3V2Renderer.cleanup();
            this.vol3V2Renderer = null;
        }
        if (this.vol3LinuxV2Renderer) {
            this.vol3LinuxV2Renderer.cleanup();
            this.vol3LinuxV2Renderer = null;
        }
        if (this.vol2V2Renderer) {
            this.vol2V2Renderer.cleanup();
            this.vol2V2Renderer = null;
        }
    }
}
