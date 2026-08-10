import { AppState } from '../../core/types';
import { invoke } from '@tauri-apps/api/core';
import { Volatility2Area } from '../../areas/volatility2Area';
import { Volatility2AreaV2 } from '../../areas/volatility2AreaV2';
import { Volatility3Area } from '../../areas/volatility3Area';
import { Volatility3AreaV2 } from '../../areas/volatility3AreaV2';
import { MemProcFSArea } from '../../areas/memprocfsArea';
import { MemProcFSAreaV2 } from '../../areas/memprocfsAreaV2';
import { Volatility2LinuxArea } from '../../areas/volatility2LinuxArea';
import { Volatility3LinuxArea } from '../../areas/volatility3LinuxArea';
import { Volatility3LinuxAreaV2 } from '../../areas/volatility3LinuxAreaV2';
import { MemNixFSArea } from '../../areas/memnixfsArea';
import { MemNixFSAreaV2 } from '../../areas/memnixfsAreaV2';
import { ToolsArea } from '../../areas/toolsArea';
import { detectPlatform } from '../../../utils/platformDetection';

export class SidebarRenderer {
    private areaCategories = {
        windows: [
            MemProcFSAreaV2,  // V2版本（内嵌CSV）- 默认进入
            Volatility3AreaV2,  // Vol3 V2版本（内嵌CSV）
            Volatility2AreaV2,  // Vol2 V2版本（内嵌CSV）
            MemProcFSArea,  // MemProcFS 手动执行
            Volatility3Area,  // Vol3 手动执行
            Volatility2Area,  // Vol2 手动执行
            ToolsArea
        ],
        linux: [
            Volatility2LinuxArea,
            Volatility3LinuxArea,
            Volatility3LinuxAreaV2,
            MemNixFSAreaV2,
            MemNixFSArea
        ]
    };

    private areas = [
        ...this.areaCategories.windows,
        ...this.areaCategories.linux
    ];

    private customAreaIcons: { [key: string]: string } = {};

    constructor(private state: AppState) {
        this.initialize();
    }

    private initialize() {
        // 异步加载自定义图标
        this.loadCustomAreaIcons().catch(error => {
            console.error('初始化加载自定义图标失败:', error);
        });

        // 在 macOS 上隐藏 Volatility2 和 Volatility2 Linux 区域
        const { isMacOS } = detectPlatform();
        if (isMacOS) {
            this.areaCategories.windows = this.areaCategories.windows.filter(area => area !== Volatility2Area && area !== Volatility2AreaV2);
            this.areaCategories.linux = this.areaCategories.linux.filter(area => area !== Volatility2LinuxArea);
            this.areas = [
                ...this.areaCategories.windows,
                ...this.areaCategories.linux
            ];

            // 保护性处理：若当前选中索引越界，则重置为0
            if (typeof this.state.selectedAvatar === 'number' && this.state.selectedAvatar >= this.areas.length) {
                this.state.selectedAvatar = 0;
            }
        }
    }

    public updateState(state: AppState) {
        this.state = state;
    }

    public getAreas() {
        return this.areas;
    }

    private async loadCustomAreaIcons(): Promise<void> {
        try {
            const customIcons = await invoke('get_all_area_icons_command') as { [key: string]: string };
            this.customAreaIcons = customIcons || {};
        } catch (error) {
            console.error('加载自定义区域图标失败:', error);
            this.customAreaIcons = {};
        }
    }

    private isFilePath(str: string): boolean {
        if (!str) return false;
        return str.startsWith('/') ||
            str.startsWith('\\') ||
            /^[a-zA-Z]:/.test(str) ||
            str.includes('\\') ||
            str.includes('/');
    }

    public getAreaIcon(config: any): string {
        const areaName = config.name;
        const customIcon = this.customAreaIcons[areaName];

        if (customIcon && customIcon.trim() !== '') {
            return customIcon;
        }

        return config.icon;
    }

    public async refreshAreaIcons(): Promise<void> {
        await this.loadCustomAreaIcons();
        this.render();
    }

    private getAreaColors(theme: string): Record<string, string> {
        const colorSchemes = {
            light: {
                'memprocfs': '#6366f1',
                'memprocfs-v2': '#8b5cf6',  // V2版本使用紫色系
                'volatility2': '#3b82f6',
                'vol2-linux': '#06b6d4',
                'volatility3': '#10b981',
                'vol3-linux': '#84cc16',
                'vol3linux-v2': '#84cc16',
                'memnixfs': '#a78bfa',
                'memnixfs-v2': '#8b5cf6',
                'tools': '#ef4444',
                '小工具': '#ef4444'
            },
            dark: {
                'memprocfs': '#4f46e5',
                'memprocfs-v2': '#7c3aed',  // V2版本深色
                'volatility2': '#2563eb',
                'vol2-linux': '#0891b2',
                'volatility3': '#059669',
                'vol3-linux': '#65a30d',
                'vol3linux-v2': '#65a30d',
                'memnixfs': '#7c3aed',
                'memnixfs-v2': '#6d28d9',
                'tools': '#dc2626',
                '小工具': '#dc2626'
            },
            sakura: {
                'memprocfs': '#ec4899',
                'memprocfs-v2': '#d946ef',  // V2版本樱花紫
                'volatility2': '#f472b6',
                'vol2-linux': '#fb7185',
                'volatility3': '#f97316',
                'vol3-linux': '#fbbf24',
                'vol3linux-v2': '#fbbf24',
                'memnixfs': '#c084fc',
                'memnixfs-v2': '#d946ef',
                'tools': '#ef4444',
                '小工具': '#ef4444'
            },
        };

        return colorSchemes[theme as keyof typeof colorSchemes] || colorSchemes.light;
    }

    private renderCategorizedAreas(): string {
        const categoryNames = {
            windows: '🪟 Windows',
            linux: '🐧 Linux'
        };

        let html = '';
        let globalIndex = 0;

        Object.entries(this.areaCategories).forEach(([categoryKey, areas]) => {
            html += `<div class="area-category" data-category="${categoryKey}">
        <div class="category-header">
          <h4>${categoryNames[categoryKey as keyof typeof categoryNames]}</h4>
        </div>
        <div class="category-areas">`;

            let insertedSeparator = false;

            areas.forEach((area) => {
                const config = area.getConfig();
                const displayIcon = this.getAreaIcon(config);

                // 在第一个包含「手动版本」的区域前插入分割线（仅 Windows 分类，仅一次）
                if (categoryKey === 'windows' && !insertedSeparator && config.name.includes('(手动版本)')) {
                    html += `<div class="area-group-separator"><span class="area-group-label">手动执行</span></div>`;
                    insertedSeparator = true;
                }

                const isVolatility2 = config.name === 'Volatility2' || config.name === 'Volatility2(手动版本)';
                const isDisabled = isVolatility2 && this.state.volatility2Disabled;
                const disabledClass = isDisabled ? 'disabled' : '';
                const disabledTitle = isDisabled ?
                    `${config.name} - ${this.state.volatility2DisabledMessage || '功能不可用'}` :
                    config.name;

                const currentTheme = this.state.theme || 'light';
                const areaColors = this.getAreaColors(currentTheme);
                const areaKey = config.name.toLowerCase().replace(/\s+/g, '-');
                const backgroundColor = areaColors[areaKey as keyof typeof areaColors] || '#000000';

                html += `
          <div class="area-section ${this.state.selectedAvatar === globalIndex ? 'active' : ''} ${disabledClass}"
               data-area="${globalIndex}" data-area-color="${backgroundColor}" ${isDisabled ? 'data-disabled="true"' : ''}>
            <div class="area-header area-${areaKey}" title="${disabledTitle}">
              <div class="area-icon" data-area-name="${config.name}" data-original-icon="${config.icon}">
                ${this.isFilePath(displayIcon) ?
                        `<img src="${displayIcon}" alt="${config.name}" data-original-src="${displayIcon}" style="width: 100%; height: 100%; object-fit: contain; ${isDisabled ? 'opacity: 0.5; filter: grayscale(100%);' : ''}">` :
                        `<span style="${isDisabled ? 'opacity: 0.5; filter: grayscale(100%);' : ''}">${displayIcon}</span>`
                    }
              </div>
              <div class="area-info">
                <div class="area-name" style="${isDisabled ? 'opacity: 0.6;' : ''}">${config.name}</div>
                <div class="area-desc" style="${isDisabled ? 'opacity: 0.6;' : ''}">${isDisabled ? (this.state.volatility2DisabledMessage || '功能不可用') : config.desc}</div>
                ${isDisabled ? `
                  <div class="area-retry-section" style="margin-top: 8px;">
                    <button class="retry-profile-btn" data-action="retry-profile" title="重新检测 Volatility2 Profile">
                      🔄 重新检测 Profile
                    </button>
                  </div>
                ` : ''}
              </div>
            </div>
          </div>
        `;
                globalIndex++;
            });

            html += `</div></div>`;
        });

        return html;
    }

    public render(): void {
        const sidebarElement = document.querySelector('.area-sections');
        if (sidebarElement) {
            sidebarElement.innerHTML = this.renderCategorizedAreas();
        }

        const currentAreaIcon = document.querySelector('.current-area-icon');
        if (currentAreaIcon && this.state.selectedAvatar !== undefined) {
            const currentArea = this.areas[this.state.selectedAvatar];
            if (currentArea) {
                const config = currentArea.getConfig();
                const displayIcon = this.getAreaIcon(config);
                currentAreaIcon.innerHTML = this.isFilePath(displayIcon) ?
                    `<img src="${displayIcon}" alt="${config.name}" style="width: 100%; height: 100%; object-fit: contain; border-radius: var(--radius-lg);">` :
                    displayIcon;
            }
        }
    }
}
