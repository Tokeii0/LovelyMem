/**
 * 编辑区域组件
 * 显示不同分类的主题编辑界面
 */

import { EventEmitter, type EventMap, type EventCallback } from '../utils/EventEmitter';
import type { ThemeEditorCore } from '../core/ThemeEditorCore';
import type { ThemePresetManager } from '../presets/ThemePresetManager';
import { ColorEditor } from './editors/ColorEditor';
import { GradientEditor } from './editors/GradientEditor';
import { TypographyEditor } from './editors/TypographyEditor';
import { SpacingEditor } from './editors/SpacingEditor';
import { BorderEditor } from './editors/BorderEditor';
import { ShadowEditor } from './editors/ShadowEditor';
import { AnimationEditor } from './editors/AnimationEditor';
import { PresetEditor } from './editors/PresetEditor';
import { TemplateEditor } from './editors/TemplateEditor';
import { CustomCSSEditor } from './editors/CustomCSSEditor';

export interface EditorAreaComponentEvents extends EventMap {
    variableChanged: { key: string; value: string };
    presetSelected: string;
}

type ViewMode = 'grid' | 'list';

/** 编辑器可能触发的事件 */
interface EditorComponentEditorEvents extends EventMap {
    variableChanged: { key: string; value: string };
    presetSelected: string;
}

/** 编辑器实例共有的接口（部分能力为可选） */
interface EditorComponent {
    show(): void;
    hide(): void;
    refresh(): void;
    update(): void;
    destroy(): void;
    on?<K extends keyof EditorComponentEditorEvents>(
        event: K,
        callback: EventCallback<EditorComponentEditorEvents[K]>
    ): () => void;
    filter?(query: string): void;
    setViewMode?(mode: ViewMode): void;
    reset?(): void;
}

/** 分类标题与描述信息 */
interface CategoryInfo {
    title: string;
    description: string;
}

export class EditorAreaComponent extends EventEmitter<EditorAreaComponentEvents> {
    private container: HTMLElement;
    private core: ThemeEditorCore;
    private presetManager: ThemePresetManager;
    private currentCategory = 'colors';

    // 编辑器实例
    private editors: Map<string, EditorComponent> = new Map();

    constructor(container: HTMLElement, core: ThemeEditorCore, presetManager: ThemePresetManager) {
        super();

        this.container = container;
        this.core = core;
        this.presetManager = presetManager;

        this.init();
    }

    init(): void {
        this.render();
        this.initializeEditors();
        this.bindEvents();
    }

    render(): void {
        this.container.innerHTML = `
            <div class="te-editor-header">
                <div class="te-editor-title-section">
                    <h2 id="editorTitle" class="te-editor-title">颜色配置</h2>
                    <p id="editorDescription" class="te-editor-description">配置主题的主要颜色和状态颜色</p>
                </div>

                <div class="te-editor-actions">
                    <div class="te-search-box">
                        <input type="text" id="variableSearch" class="te-search-input" placeholder="搜索配置项...">
                        <span class="te-search-icon">🔍</span>
                    </div>

                    <div class="te-view-toggle">
                        <button id="gridViewBtn" class="te-view-btn active" title="网格视图">
                            <span class="te-btn-icon">⊞</span>
                        </button>
                        <button id="listViewBtn" class="te-view-btn" title="列表视图">
                            <span class="te-btn-icon">☰</span>
                        </button>
                    </div>

                    <button id="resetCategoryBtn" class="te-action-btn secondary" title="重置当前分类">
                        <span class="te-btn-icon">🔄</span>
                        <span class="te-btn-text">重置</span>
                    </button>
                </div>
            </div>

            <div class="te-editor-content">
                <div id="editorContainer" class="te-editor-container">
                    <!-- 编辑器内容将在这里动态加载 -->
                </div>
            </div>

            <div class="te-editor-footer">
                <div class="te-editor-stats">
                    <span class="te-stat-item">
                        <span class="te-stat-label">当前分类:</span>
                        <span id="currentCategoryName" class="te-stat-value">颜色配置</span>
                    </span>
                    <span class="te-stat-separator">•</span>
                    <span class="te-stat-item">
                        <span class="te-stat-label">配置项:</span>
                        <span id="variableCountStat" class="te-stat-value">0</span>
                    </span>
                    <span class="te-stat-separator">•</span>
                    <span class="te-stat-item">
                        <span class="te-stat-label">已修改:</span>
                        <span id="modifiedCountStat" class="te-stat-value">0</span>
                    </span>
                </div>

                <div class="te-editor-tips">
                    <span class="te-tip-text" id="editorTip">💡 提示: 点击颜色块可以打开颜色选择器</span>
                </div>
            </div>
        `;
    }

    initializeEditors(): void {
        const editorContainer = this.container.querySelector<HTMLElement>('#editorContainer');
        if (!editorContainer) return;

        try {
            // 初始化各种编辑器
            this.editors.set('colors', new ColorEditor(editorContainer, this.core));
            this.editors.set('backgrounds', new ColorEditor(editorContainer, this.core, 'backgrounds'));
            this.editors.set('gradients', new GradientEditor(editorContainer, this.core));
            this.editors.set('typography', new TypographyEditor(editorContainer, this.core));
            this.editors.set('spacing', new SpacingEditor(editorContainer, this.core));
            this.editors.set('borders', new BorderEditor(editorContainer, this.core));
            this.editors.set('shadows', new ShadowEditor(editorContainer, this.core));
            this.editors.set('animations', new AnimationEditor(editorContainer, this.core));
            this.editors.set('presets', new PresetEditor(editorContainer, this.core, this.presetManager));
            this.editors.set('templates', new TemplateEditor(editorContainer, this.core));
            this.editors.set('custom-css', new CustomCSSEditor(editorContainer, this.core));

            console.log('✅ 编辑器初始化完成，共', this.editors.size, '个编辑器');

            // 监听编辑器事件
            this.editors.forEach((editor, key) => {
                try {
                    if (editor.on) {
                        editor.on('variableChanged', (data) => {
                            this.emit('variableChanged', data);
                        });

                        editor.on('presetSelected', (presetId) => {
                            this.emit('presetSelected', presetId);
                        });
                    }
                } catch (error) {
                    console.warn(`编辑器 ${key} 事件绑定失败:`, error);
                }
            });
        } catch (error) {
            console.error('编辑器初始化失败:', error);
            throw error;
        }
    }

    bindEvents(): void {
        // 搜索功能
        const searchInput = this.container.querySelector<HTMLInputElement>('#variableSearch');
        searchInput?.addEventListener('input', (e) => {
            this.filterVariables((e.target as HTMLInputElement).value);
        });

        // 视图切换
        const gridViewBtn = this.container.querySelector<HTMLButtonElement>('#gridViewBtn');
        const listViewBtn = this.container.querySelector<HTMLButtonElement>('#listViewBtn');

        gridViewBtn?.addEventListener('click', () => {
            this.setViewMode('grid');
        });

        listViewBtn?.addEventListener('click', () => {
            this.setViewMode('list');
        });

        // 重置分类
        const resetCategoryBtn = this.container.querySelector<HTMLButtonElement>('#resetCategoryBtn');
        resetCategoryBtn?.addEventListener('click', () => {
            this.resetCurrentCategory();
        });

        // 监听核心事件
        this.core.on('themeChanged', () => {
            this.updateStats();
            this.updateCurrentEditor();
        });
    }

    // 切换分类
    switchCategory(category: string): void {
        if (this.currentCategory === category) return;

        // 隐藏当前编辑器
        const currentEditor = this.editors.get(this.currentCategory);
        if (currentEditor) {
            currentEditor.hide();
        }

        this.currentCategory = category;

        // 更新标题和描述
        this.updateCategoryInfo(category);

        // 显示新编辑器
        const newEditor = this.editors.get(category);
        if (newEditor) {
            newEditor.show();
            newEditor.refresh();
        }

        // 更新统计信息
        this.updateStats();

        // 更新提示信息
        this.updateTips(category);
    }

    // 更新分类信息
    updateCategoryInfo(category: string): void {
        const titleElement = this.container.querySelector<HTMLElement>('#editorTitle');
        const descriptionElement = this.container.querySelector<HTMLElement>('#editorDescription');
        const categoryNameElement = this.container.querySelector<HTMLElement>('#currentCategoryName');

        const categoryInfo = this.getCategoryInfo(category);

        if (titleElement) titleElement.textContent = categoryInfo.title;
        if (descriptionElement) descriptionElement.textContent = categoryInfo.description;
        if (categoryNameElement) categoryNameElement.textContent = categoryInfo.title;
    }

    // 获取分类信息
    getCategoryInfo(category: string): CategoryInfo {
        const categories = this.core.getThemeCategories();

        if (categories[category]) {
            return {
                title: categories[category].name,
                description: categories[category].description
            };
        }

        // 特殊分类
        const specialCategories: Record<string, CategoryInfo> = {
            presets: { title: '主题预设', description: '选择和应用预设主题' },
            templates: { title: '主题模板', description: '基于模板创建主题' },
            'custom-css': { title: '自定义CSS', description: '添加自定义CSS样式' },
            'export-import': { title: '导入导出', description: '导入和导出主题配置' }
        };

        return specialCategories[category] || { title: '未知分类', description: '' };
    }

    // 过滤变量
    filterVariables(query: string): void {
        const currentEditor = this.editors.get(this.currentCategory);
        if (currentEditor && currentEditor.filter) {
            currentEditor.filter(query);
        }
    }

    // 设置视图模式
    setViewMode(mode: ViewMode): void {
        const gridViewBtn = this.container.querySelector<HTMLElement>('#gridViewBtn');
        const listViewBtn = this.container.querySelector<HTMLElement>('#listViewBtn');
        const editorContainer = this.container.querySelector<HTMLElement>('#editorContainer');

        if (mode === 'grid') {
            gridViewBtn?.classList.add('active');
            listViewBtn?.classList.remove('active');
            editorContainer?.classList.remove('list-view');
            editorContainer?.classList.add('grid-view');
        } else {
            listViewBtn?.classList.add('active');
            gridViewBtn?.classList.remove('active');
            editorContainer?.classList.remove('grid-view');
            editorContainer?.classList.add('list-view');
        }

        // 通知当前编辑器视图模式变化
        const currentEditor = this.editors.get(this.currentCategory);
        if (currentEditor && currentEditor.setViewMode) {
            currentEditor.setViewMode(mode);
        }
    }

    // 重置当前分类
    resetCurrentCategory(): void {
        const currentEditor = this.editors.get(this.currentCategory);
        if (currentEditor && currentEditor.reset) {
            currentEditor.reset();
        }
    }

    // 更新统计信息
    updateStats(): void {
        const categories = this.core.getThemeCategories();
        const currentTheme = this.core.getCurrentTheme();

        let variableCount = 0;
        let modifiedCount = 0;

        const category = categories[this.currentCategory];
        if (category) {
            variableCount = category.variables.length;

            if (currentTheme) {
                modifiedCount = category.variables.filter(variable => {
                    const key = `--${variable.key}`;
                    return currentTheme[key] && currentTheme[key] !== variable.default;
                }).length;
            }
        }

        const variableCountElement = this.container.querySelector<HTMLElement>('#variableCountStat');
        const modifiedCountElement = this.container.querySelector<HTMLElement>('#modifiedCountStat');

        if (variableCountElement) {
            variableCountElement.textContent = String(variableCount);
        }

        if (modifiedCountElement) {
            modifiedCountElement.textContent = String(modifiedCount);
        }
    }

    // 更新提示信息
    updateTips(category: string): void {
        const tipElement = this.container.querySelector<HTMLElement>('#editorTip');
        if (!tipElement) return;

        const tips: Record<string, string> = {
            colors: '💡 提示: 点击颜色块可以打开颜色选择器',
            gradients: '💡 提示: 拖拽渐变滑块可以调整渐变效果',
            typography: '💡 提示: 可以输入自定义字体名称',
            spacing: '💡 提示: 支持px、em、rem等单位',
            borders: '💡 提示: 圆角值越大边框越圆润',
            shadows: '💡 提示: 调整阴影参数可以创建不同的视觉效果',
            animations: '💡 提示: 过渡时间影响动画的流畅度',
            presets: '💡 提示: 点击预设主题可以快速应用',
            templates: '💡 提示: 基于模板可以快速创建主题',
            'custom-css': '💡 提示: 自定义CSS会覆盖默认样式'
        };

        tipElement.textContent = tips[category] || '💡 提示: 修改配置后记得保存主题';
    }

    // 更新当前编辑器
    updateCurrentEditor(): void {
        const currentEditor = this.editors.get(this.currentCategory);
        if (currentEditor && currentEditor.update) {
            currentEditor.update();
        }
    }

    // 刷新预设
    refreshPresets(): void {
        const presetEditor = this.editors.get('presets');
        if (presetEditor && presetEditor.refresh) {
            presetEditor.refresh();
        }
    }

    // 获取当前分类
    getCurrentCategory(): string {
        return this.currentCategory;
    }

    // 更新组件
    update(): void {
        this.updateStats();
        this.updateCurrentEditor();
    }

    // 销毁组件
    destroy(): void {
        this.removeAllListeners();

        // 销毁所有编辑器
        this.editors.forEach(editor => {
            if (editor.destroy) {
                editor.destroy();
            }
        });

        this.editors.clear();
        this.container.innerHTML = '';
    }
}
