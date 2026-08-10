/**
 * 侧边栏组件
 * 显示主题分类导航
 */

import { EventEmitter, type EventMap } from '../utils/EventEmitter';
import type { ThemeEditorCore } from '../core/ThemeEditorCore';
import type { ThemeData } from '../utils/ThemeValidator';

export interface SidebarComponentEvents extends EventMap {
    categoryChanged: string;
    themeReset: void;
    randomThemeGenerated: void;
}

export class SidebarComponent extends EventEmitter<SidebarComponentEvents> {
    private container: HTMLElement;
    private core: ThemeEditorCore;
    private activeCategory = 'colors';

    constructor(container: HTMLElement, core: ThemeEditorCore) {
        super();

        this.container = container;
        this.core = core;

        this.init();
    }

    init(): void {
        this.render();
        this.bindEvents();
    }

    render(): void {
        const categories = this.core.getThemeCategories();

        this.container.innerHTML = `
            <div class="te-sidebar-header">
                <h3 class="te-sidebar-title">主题配置</h3>
                <p class="te-sidebar-subtitle">选择要编辑的配置分类</p>
            </div>

            <nav class="te-sidebar-nav">
                <div class="te-nav-section">
                    <h4 class="te-nav-section-title">预设主题</h4>
                    <ul class="te-nav-list">
                        <li class="te-nav-item ${this.activeCategory === 'presets' ? 'active' : ''}" data-category="presets">
                            <div class="te-nav-link">
                                <span class="te-nav-icon">🎨</span>
                                <span class="te-nav-text">主题预设</span>
                                <span class="te-nav-badge">热门</span>
                            </div>
                        </li>
                    </ul>
                </div>

                <div class="te-nav-section">
                    <h4 class="te-nav-section-title">自定义配置</h4>
                    <ul class="te-nav-list">
                        ${Object.entries(categories).map(([key, category]) => `
                            <li class="te-nav-item ${this.activeCategory === key ? 'active' : ''}" data-category="${key}">
                                <div class="te-nav-link">
                                    <span class="te-nav-icon">${category.icon}</span>
                                    <span class="te-nav-text">${category.name}</span>
                                    <span class="te-nav-count">${category.variables.length}</span>
                                </div>
                                <div class="te-nav-description">${category.description}</div>
                            </li>
                        `).join('')}
                    </ul>
                </div>

                <div class="te-nav-section">
                    <h4 class="te-nav-section-title">高级功能</h4>
                    <ul class="te-nav-list">
                        <li class="te-nav-item ${this.activeCategory === 'templates' ? 'active' : ''}" data-category="templates">
                            <div class="te-nav-link">
                                <span class="te-nav-icon">📋</span>
                                <span class="te-nav-text">主题模板</span>
                                <span class="te-nav-badge new">新</span>
                            </div>
                        </li>
                        <li class="te-nav-item ${this.activeCategory === 'custom-css' ? 'active' : ''}" data-category="custom-css">
                            <div class="te-nav-link">
                                <span class="te-nav-icon">💻</span>
                                <span class="te-nav-text">自定义CSS</span>
                            </div>
                        </li>
                        <li class="te-nav-item ${this.activeCategory === 'export-import' ? 'active' : ''}" data-category="export-import">
                            <div class="te-nav-link">
                                <span class="te-nav-icon">🔄</span>
                                <span class="te-nav-text">导入导出</span>
                            </div>
                        </li>
                    </ul>
                </div>
            </nav>

            <div class="te-sidebar-footer">
                <div class="te-quick-actions">
                    <button class="te-quick-action-btn" id="resetThemeBtn" title="重置为默认主题">
                        <span class="te-btn-icon">🔄</span>
                        <span class="te-btn-text">重置主题</span>
                    </button>
                    <button class="te-quick-action-btn" id="randomThemeBtn" title="生成随机主题">
                        <span class="te-btn-icon">🎲</span>
                        <span class="te-btn-text">随机主题</span>
                    </button>
                </div>

                <div class="te-theme-info">
                    <div class="te-info-item">
                        <span class="te-info-label">当前主题:</span>
                        <span class="te-info-value" id="currentThemeName">自定义主题</span>
                    </div>
                    <div class="te-info-item">
                        <span class="te-info-label">变量数量:</span>
                        <span class="te-info-value" id="variableCount">0</span>
                    </div>
                </div>
            </div>
        `;
    }

    bindEvents(): void {
        // 分类导航点击事件
        const navItems = this.container.querySelectorAll<HTMLElement>('.te-nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', () => {
                const category = item.dataset.category;
                if (!category) return;
                this.setActiveCategory(category);
                this.emit('categoryChanged', category);
            });
        });

        // 快速操作按钮
        const resetThemeBtn = this.container.querySelector<HTMLButtonElement>('#resetThemeBtn');
        const randomThemeBtn = this.container.querySelector<HTMLButtonElement>('#randomThemeBtn');

        resetThemeBtn?.addEventListener('click', () => {
            this.resetTheme();
        });

        randomThemeBtn?.addEventListener('click', () => {
            this.generateRandomTheme();
        });

        // 监听核心事件
        this.core.on('themeChanged', () => {
            this.updateThemeInfo();
        });
    }

    // 设置活动分类
    setActiveCategory(category: string): void {
        // 移除所有活动状态
        const navItems = this.container.querySelectorAll<HTMLElement>('.te-nav-item');
        navItems.forEach(item => {
            item.classList.remove('active');
        });

        // 设置新的活动状态
        const activeItem = this.container.querySelector<HTMLElement>(`[data-category="${category}"]`);
        if (activeItem) {
            activeItem.classList.add('active');
            this.activeCategory = category;
        }
    }

    // 重置主题
    resetTheme(): void {
        const defaultTheme = this.core.getDefaultTheme();
        this.core.setTheme(defaultTheme);
        this.emit('themeReset');
    }

    // 生成随机主题
    generateRandomTheme(): void {
        const randomTheme = this.generateRandomThemeData();
        this.core.setTheme(randomTheme);
        this.emit('randomThemeGenerated');
    }

    // 生成随机主题数据
    generateRandomThemeData(): ThemeData {
        const categories = this.core.getThemeCategories();
        const randomTheme: ThemeData = {};

        // 生成随机颜色
        const generateRandomColor = (): string => {
            const hue = Math.floor(Math.random() * 360);
            const saturation = Math.floor(Math.random() * 50) + 50; // 50-100%
            const lightness = Math.floor(Math.random() * 40) + 30; // 30-70%
            return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
        };

        // 生成随机尺寸
        const generateRandomSize = (min = 4, max = 32): string => {
            return `${Math.floor(Math.random() * (max - min + 1)) + min}px`;
        };

        // 为每个分类生成随机值
        Object.entries(categories).forEach(([_categoryKey, category]) => {
            category.variables.forEach(variable => {
                const key = `--${variable.key}`;

                switch (variable.type) {
                    case 'color':
                        randomTheme[key] = generateRandomColor();
                        break;
                    case 'size':
                        randomTheme[key] = generateRandomSize();
                        break;
                    case 'gradient': {
                        const color1 = generateRandomColor();
                        const color2 = generateRandomColor();
                        randomTheme[key] = `linear-gradient(135deg, ${color1} 0%, ${color2} 100%)`;
                        break;
                    }
                    case 'shadow': {
                        const shadowColor = generateRandomColor();
                        const blur = Math.floor(Math.random() * 10) + 2;
                        randomTheme[key] = `0 ${blur}px ${blur * 2}px 0 ${shadowColor}`;
                        break;
                    }
                    default:
                        randomTheme[key] = variable.default;
                }
            });
        });

        return randomTheme;
    }

    // 更新主题信息
    updateThemeInfo(): void {
        const currentTheme = this.core.getCurrentTheme();
        const variableCount = currentTheme ? Object.keys(currentTheme).length : 0;

        const variableCountElement = this.container.querySelector<HTMLElement>('#variableCount');
        if (variableCountElement) {
            variableCountElement.textContent = String(variableCount);
        }
    }

    // 高亮分类（当有未保存更改时）
    highlightCategory(category: string, highlight = true): void {
        const categoryItem = this.container.querySelector<HTMLElement>(`[data-category="${category}"]`);
        if (categoryItem) {
            if (highlight) {
                categoryItem.classList.add('has-changes');
            } else {
                categoryItem.classList.remove('has-changes');
            }
        }
    }

    // 添加分类徽章
    addCategoryBadge(category: string, badge: string): void {
        const categoryItem = this.container.querySelector<HTMLElement>(`[data-category="${category}"]`);
        if (categoryItem) {
            const navLink = categoryItem.querySelector<HTMLElement>('.te-nav-link');
            if (!navLink) return;

            // 移除现有徽章
            const existingBadge = navLink.querySelector('.te-nav-badge');
            if (existingBadge) {
                existingBadge.remove();
            }

            // 添加新徽章
            const badgeElement = document.createElement('span');
            badgeElement.className = 'te-nav-badge';
            badgeElement.textContent = badge;
            navLink.appendChild(badgeElement);
        }
    }

    // 移除分类徽章
    removeCategoryBadge(category: string): void {
        const categoryItem = this.container.querySelector<HTMLElement>(`[data-category="${category}"]`);
        if (categoryItem) {
            const badge = categoryItem.querySelector('.te-nav-badge');
            if (badge) {
                badge.remove();
            }
        }
    }

    // 获取当前活动分类
    getActiveCategory(): string {
        return this.activeCategory;
    }

    // 更新组件
    update(): void {
        this.updateThemeInfo();
    }

    // 销毁组件
    destroy(): void {
        this.removeAllListeners();
        this.container.innerHTML = '';
    }
}
