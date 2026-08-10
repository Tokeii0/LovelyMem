import { AppState } from '../../core/types';
import IconParkHelper from '../../utils/iconparkHelper';

// 导航项文字标签映射
const NAV_ITEM_LABELS: Record<string, string> = {
    home: '主页',
    files: '文件',
    'timeline-galaxy': '星迹',
    'ai-chat': 'AI助手',
    warnings: '告警',
    'registry-viewer': '注册表',
    'event-viewer': '事件查看器',
    'string-search': '字符串搜索',
    'process-galaxy': '星图',
    'more-tools': '更多工具',
    settings: '设置',
};

// 定义侧边栏图标键名到默认 emoji 的映射
const DEFAULT_NAVBAR_ICONS: Record<string, string> = {
    home: '🏠',
    files: '📁',
    process_galaxy: 'process_galaxy',
    timeline_galaxy: 'timeline_galaxy',
    terminal: '💻',
    ai_assistant: '✨',
    alerts: '⚠️',
    registry: '🗄️',
    event_viewer: '📅',
    report_editor: '📝',
    string_search: 'string_search',
    super_timeline: 'super_timeline',
    symbol_manager: '🧩',
    logs: '📋',
    settings: '⚙️',
};

export class NavBarRenderer {
    constructor(
        private state: AppState,
        private areas: any[],
        private getAreaIcon: (config: any) => string,
        private isFilePath: (str: string) => boolean
    ) { }

    private getNavbarIcon(key: keyof typeof DEFAULT_NAVBAR_ICONS, size: number = 20): string {
        const defaultIcon = DEFAULT_NAVBAR_ICONS[key];
        if (!defaultIcon) {
            return '';
        }
        
        // 特殊处理自定义 SVG 图标
        if (defaultIcon === 'process_galaxy') {
            return this.getProcessGalaxySvg();
        }
        if (defaultIcon === 'timeline_galaxy') {
            return this.getStarTraceSvg();
        }
        if (defaultIcon === 'string_search') {
            return this.getStringSearchSvg();
        }
        if (defaultIcon === 'super_timeline') {
            return this.getSuperTimelineSvg();
        }
        return this.getIconSvgHtml(defaultIcon, size);
    }

    public updateState(state: AppState) {
        this.state = state;
    }

    public render(): string {
        const renderMenuItem = (index: number, target: string) => {
            const area = this.areas[index];
            if (!area) return '';
            const config = area.getConfig();

            const icon = this.getAreaIcon(config);
            const iconContent = this.isFilePath(icon) ?
                `<img src="${icon}" alt="${config.name}" data-original-src="${icon}" style="width: 100%; height: 100%; object-fit: contain;">` :
                this.getIconSvgHtml(icon, 16);

            return `
        <div class="secondary-menu-item" data-action="switch-area" data-target="${target}">
          <span class="menu-icon">${iconContent}</span>
          <span class="menu-text">${config.name}</span>
        </div>
      `;
        };

        const navItem = (nav: string, iconKey: string, label: string, extra: string = '') => `
          <div class="nav-item${nav === 'home' ? ' active' : ''}" title="${label}" data-nav="${nav}">
            <span class="nav-icon">${this.getNavbarIcon(iconKey as any, 20)}</span>
            <span class="nav-label">${label}</span>
            ${extra}
          </div>`;

        return `
      <div class="vertical-navbar">
        <div class="nav-top">
          ${navItem('home', 'home', '主页', `
            <div class="secondary-menu">
              ${renderMenuItem(0, 'memprocfs-v2')}
              ${renderMenuItem(1, 'volatility3-v2')}
              ${renderMenuItem(2, 'volatility2-v2')}
              <div class="menu-separator"></div>
              ${renderMenuItem(3, 'memprocfs')}
              ${renderMenuItem(4, 'volatility3')}
              ${renderMenuItem(5, 'volatility2')}
              <div class="menu-separator"></div>
              ${renderMenuItem(6, 'tools')}
              <div class="menu-separator"></div>
              ${renderMenuItem(7, 'vol2-linux')}
              ${renderMenuItem(8, 'vol3-linux')}
              ${renderMenuItem(9, 'vol3linux-v2')}
              ${renderMenuItem(10, 'memnixfs-v2')}
              ${renderMenuItem(11, 'memnixfs')}
            </div>
          `)}
          ${navItem('files', 'files', '文件')}
          ${navItem('process-galaxy', 'process_galaxy', '星图')}
          ${navItem('timeline-galaxy', 'timeline_galaxy', '星迹')}
          ${navItem('ai-chat', 'ai_assistant', 'AI助手')}
          ${navItem('warnings', 'alerts', '告警')}
          ${navItem('registry-viewer', 'registry', '注册表')}
          ${navItem('event-viewer', 'event_viewer', '事件查看器')}
          ${navItem('string-search', 'string_search', '字符串搜索')}
          <div class="nav-item" title="更多工具" data-nav="more-tools">
            <span class="nav-icon">${this.getMoreToolsSvg()}</span>
            <span class="nav-label">更多工具</span>
            <div class="secondary-menu">
              <div class="secondary-menu-item" data-action="nav-shortcut" data-nav-target="terminal">
                <span class="menu-icon">${this.getNavbarIcon('terminal', 16)}</span>
                <span class="menu-text">终端</span>
              </div>
              <div class="secondary-menu-item" data-action="nav-shortcut" data-nav-target="report-editor">
                <span class="menu-icon">${this.getNavbarIcon('report_editor', 16)}</span>
                <span class="menu-text">报告编辑器</span>
              </div>
              <div class="secondary-menu-item" data-action="nav-shortcut" data-nav-target="logs">
                <span class="menu-icon">${this.getNavbarIcon('logs', 16)}</span>
                <span class="menu-text">日志</span>
              </div>
              <div class="menu-separator"></div>
              <div class="secondary-menu-item" data-action="nav-shortcut" data-nav-target="super-timeline">
                <span class="menu-icon">${this.getNavbarIcon('super_timeline', 16)}</span>
                <span class="menu-text">Super Timeline</span>
                <span class="menu-beta-tag">BETA</span>
              </div>
              <div class="secondary-menu-item" data-action="nav-shortcut" data-nav-target="symbol-manager">
                <span class="menu-icon">${this.getNavbarIcon('symbol_manager', 16)}</span>
                <span class="menu-text">符号表管理</span>
              </div>
            </div>
          </div>

        </div>
        <div class="nav-bottom">
          <div class="nav-toggle" title="展开/收起导航栏" id="nav-toggle-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline class="nav-toggle-arrow" points="9 18 15 12 9 6"/>
            </svg>
          </div>
          ${navItem('settings', 'settings', '设置')}
        </div>
      </div>
    `;
    }

    private getIconSvgHtml(emoji: string, size: number = 14): string {
        const iconName = IconParkHelper.getIconNameFromEmoji(emoji);
        if (!iconName) {
            return emoji;
        }

        try {
            const svgString = IconParkHelper.getSvgString(iconName, {
                size,
                fill: 'currentColor',
                stroke: 'currentColor',
                strokeWidth: 2
            });
            return svgString || emoji;
        } catch (error) {
            console.warn(`Failed to get icon for ${emoji}:`, error);
            return emoji;
        }
    }

    private getStarTraceSvg(): string {
        return `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- 轨道 -->
  <path d="M25,80 Q10,50 25,25 T75,25" stroke="currentColor" stroke-width="12" stroke-linecap="round" opacity="0.4"/>
  <path d="M40,75 C40,75 55,85 70,65 C85,45 70,25 70,25" stroke="currentColor" stroke-width="12" stroke-linecap="round"/>
  <!-- 星星 (大号) -->
  <path d="M75 0 L83 17 L100 25 L83 33 L75 50 L67 33 L50 25 L67 17 Z" fill="currentColor"/>
</svg>`;
    }

    private getProcessGalaxySvg(): string {
        return `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- 连线 -->
  <path d="M25 75 L50 35 L80 60" stroke="currentColor" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/>
  <!-- 节点 -->
  <circle cx="25" cy="75" r="12" fill="currentColor"/>
  <circle cx="50" cy="35" r="14" fill="currentColor"/>
  <circle cx="80" cy="60" r="12" fill="currentColor"/>
</svg>`;
    }

    private getMoreToolsSvg(): string {
        return '<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">' +
  '<circle cx="25" cy="30" r="8" fill="currentColor"/>' +
  '<circle cx="50" cy="30" r="8" fill="currentColor"/>' +
  '<circle cx="75" cy="30" r="8" fill="currentColor"/>' +
  '<circle cx="25" cy="55" r="8" fill="currentColor"/>' +
  '<circle cx="50" cy="55" r="8" fill="currentColor"/>' +
  '<circle cx="75" cy="55" r="8" fill="currentColor"/>' +
  '<circle cx="25" cy="80" r="8" fill="currentColor" opacity="0.4"/>' +
  '<circle cx="50" cy="80" r="8" fill="currentColor" opacity="0.4"/>' +
  '<circle cx="75" cy="80" r="8" fill="currentColor" opacity="0.4"/>' +
  '</svg>';
    }

    private getSuperTimelineSvg(): string {
        return '<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">' +
  '<!-- 时间轴竖线 -->' +
  '<line x1="22" y1="8" x2="22" y2="92" stroke="currentColor" stroke-width="6" stroke-linecap="round" opacity="0.4"/>' +
  '<!-- 时间节点 -->' +
  '<circle cx="22" cy="20" r="7" fill="#f59e0b"/>' +
  '<circle cx="22" cy="45" r="7" fill="#3b82f6"/>' +
  '<circle cx="22" cy="70" r="7" fill="#8b5cf6"/>' +
  '<!-- 事件条 -->' +
  '<rect x="38" y="13" rx="4" width="50" height="14" fill="#f59e0b" opacity="0.8"/>' +
  '<rect x="38" y="38" rx="4" width="38" height="14" fill="#3b82f6" opacity="0.8"/>' +
  '<rect x="38" y="63" rx="4" width="44" height="14" fill="#8b5cf6" opacity="0.8"/>' +
  '<!-- 底部进程小圆 -->' +
  '<circle cx="22" cy="90" r="5" fill="#10b981"/>' +
  '<rect x="38" y="85" rx="3" width="30" height="10" fill="#10b981" opacity="0.8"/>' +
  '</svg>';
    }

    private getStringSearchSvg(): string {
        return `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- 放大镜圆圈 -->
  <circle cx="40" cy="40" r="28" stroke="currentColor" stroke-width="10" fill="none"/>
  <!-- 放大镜手柄 -->
  <line x1="60" y1="60" x2="90" y2="90" stroke="currentColor" stroke-width="12" stroke-linecap="round"/>
  <!-- 字符串符号 "A" -->
  <text x="40" y="48" font-size="28" font-weight="bold" fill="currentColor" text-anchor="middle" font-family="sans-serif">A</text>
</svg>`;
    }
}
