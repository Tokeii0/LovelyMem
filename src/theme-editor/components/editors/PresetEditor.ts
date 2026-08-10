/**
 * 预设编辑器
 * 用于选择和管理主题预设
 */

import { EventEmitter, type EventMap } from '../../utils/EventEmitter';
import type { ThemeEditorCore } from '../../core/ThemeEditorCore';
import type { ThemePresetManager, ThemePreset } from '../../presets/ThemePresetManager';
import type { ThemeData } from '../../utils/ThemeValidator';

export interface PresetEditorEvents extends EventMap {
    variableChanged: { key: string; value: string };
    presetSelected: string;
}

type PresetAction = 'apply' | 'preview' | 'export' | 'delete';

export class PresetEditor extends EventEmitter<PresetEditorEvents> {
    private container: HTMLElement;
    private core: ThemeEditorCore;
    private presetManager: ThemePresetManager;
    private isVisible = false;
    private currentFilter = 'all';
    private searchQuery = '';

    constructor(container: HTMLElement, core: ThemeEditorCore, presetManager: ThemePresetManager) {
        super();

        this.container = container;
        this.core = core;
        this.presetManager = presetManager;

        this.init();
    }

    init(): void {
        this.render();
        this.bindEvents();
    }

    render(): void {
        const presets = this.presetManager.getAllPresets();
        const categories = this.presetManager.getCategories();

        this.container.innerHTML = `
            <div class="te-preset-editor ${this.isVisible ? 'visible' : 'hidden'}">
                <div class="te-preset-header">
                    <div class="te-preset-filters">
                        <button class="te-filter-btn ${this.currentFilter === 'all' ? 'active' : ''}" data-filter="all">
                            全部 (${presets.length})
                        </button>
                        ${categories.map(category => {
                            const count = presets.filter(p => p.category === category.id).length;
                            return `
                                <button class="te-filter-btn ${this.currentFilter === category.id ? 'active' : ''}"
                                        data-filter="${category.id}">
                                    ${category.icon} ${category.name} (${count})
                                </button>
                            `;
                        }).join('')}
                    </div>

                    <div class="te-preset-search">
                        <input type="text"
                               class="te-search-input"
                               placeholder="搜索主题预设..."
                               value="${this.searchQuery}">
                        <span class="te-search-icon">🔍</span>
                    </div>
                </div>

                <div class="te-preset-content">
                    <div class="te-preset-grid">
                        ${this.renderPresets(this.getFilteredPresets())}
                    </div>
                </div>

                <div class="te-preset-actions">
                    <button class="te-action-btn secondary" id="createPresetBtn">
                        <span class="te-btn-icon">➕</span>
                        <span class="te-btn-text">创建预设</span>
                    </button>

                    <button class="te-action-btn secondary" id="importPresetBtn">
                        <span class="te-btn-icon">📥</span>
                        <span class="te-btn-text">导入预设</span>
                    </button>

                    <button class="te-action-btn secondary" id="managePresetsBtn">
                        <span class="te-btn-icon">⚙️</span>
                        <span class="te-btn-text">管理预设</span>
                    </button>
                </div>
            </div>
        `;
    }

    renderPresets(presets: ThemePreset[]): string {
        if (presets.length === 0) {
            return `
                <div class="te-empty-state">
                    <div class="te-empty-icon">🎨</div>
                    <h3 class="te-empty-title">没有找到匹配的预设</h3>
                    <p class="te-empty-description">尝试调整搜索条件或创建新的主题预设</p>
                </div>
            `;
        }

        return presets.map(preset => `
            <div class="te-preset-card ${preset.builtin ? 'builtin' : 'user'}" data-preset-id="${preset.id}">
                <div class="te-preset-preview">
                    <div class="te-preset-colors">
                        ${preset.colors ? preset.colors.slice(0, 4).map(color => `
                            <div class="te-preset-color" style="background-color: ${color};"></div>
                        `).join('') : ''}
                    </div>

                    ${preset.badge ? `<div class="te-preset-badge ${preset.badge.toLowerCase()}">${preset.badge}</div>` : ''}
                </div>

                <div class="te-preset-info">
                    <h4 class="te-preset-name">${preset.name}</h4>
                    <p class="te-preset-description">${preset.description}</p>

                    <div class="te-preset-meta">
                        <span class="te-preset-author">by ${preset.author || 'Unknown'}</span>
                        ${preset.tags ? `
                            <div class="te-preset-tags">
                                ${preset.tags.slice(0, 3).map(tag => `
                                    <span class="te-preset-tag">${tag}</span>
                                `).join('')}
                            </div>
                        ` : ''}
                    </div>
                </div>

                <div class="te-preset-actions">
                    <button class="te-preset-action-btn primary" data-action="apply" data-preset-id="${preset.id}">
                        <span class="te-btn-icon">✨</span>
                        <span class="te-btn-text">应用</span>
                    </button>

                    <button class="te-preset-action-btn secondary" data-action="preview" data-preset-id="${preset.id}">
                        <span class="te-btn-icon">👁️</span>
                    </button>

                    <button class="te-preset-action-btn secondary" data-action="export" data-preset-id="${preset.id}">
                        <span class="te-btn-icon">📤</span>
                    </button>

                    ${!preset.builtin ? `
                        <button class="te-preset-action-btn danger" data-action="delete" data-preset-id="${preset.id}">
                            <span class="te-btn-icon">🗑️</span>
                        </button>
                    ` : ''}
                </div>
            </div>
        `).join('');
    }

    bindEvents(): void {
        // 过滤器按钮事件
        this.container.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target.classList.contains('te-filter-btn')) {
                const filter = target.dataset.filter;
                if (filter) this.setFilter(filter);
            }

            // 预设操作按钮事件
            const actionBtn = target.closest<HTMLElement>('.te-preset-action-btn');
            if (actionBtn) {
                const action = actionBtn.dataset.action as PresetAction | undefined;
                const presetId = actionBtn.dataset.presetId;

                if (action && presetId) this.handlePresetAction(action, presetId);
            }

            // 主要操作按钮事件
            if (target.closest('#createPresetBtn')) {
                this.createPreset();
            }

            if (target.closest('#importPresetBtn')) {
                this.importPreset();
            }

            if (target.closest('#managePresetsBtn')) {
                this.managePresets();
            }
        });

        // 搜索输入事件
        const searchInput = this.container.querySelector<HTMLInputElement>('.te-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchQuery = (e.target as HTMLInputElement).value;
                this.refreshPresets();
            });
        }

        // 预设卡片点击事件（应用预设）
        this.container.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            const card = target.closest<HTMLElement>('.te-preset-card');
            if (card && !target.closest('.te-preset-actions')) {
                const presetId = card.dataset.presetId;
                if (presetId) this.handlePresetAction('apply', presetId);
            }
        });
    }

    setFilter(filter: string): void {
        this.currentFilter = filter;

        // 更新过滤器按钮状态
        const filterBtns = this.container.querySelectorAll<HTMLElement>('.te-filter-btn');
        filterBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === filter);
        });

        this.refreshPresets();
    }

    getFilteredPresets(): ThemePreset[] {
        let presets = this.presetManager.getAllPresets();

        // 按分类过滤
        if (this.currentFilter !== 'all') {
            presets = presets.filter(preset => preset.category === this.currentFilter);
        }

        // 按搜索查询过滤
        if (this.searchQuery) {
            presets = this.presetManager.searchPresets(this.searchQuery);
        }

        return presets;
    }

    handlePresetAction(action: PresetAction, presetId: string): void {
        const preset = this.presetManager.getPreset(presetId);
        if (!preset) return;

        switch (action) {
            case 'apply':
                this.applyPreset(preset);
                break;
            case 'preview':
                this.previewPreset(preset);
                break;
            case 'export':
                this.exportPreset(preset);
                break;
            case 'delete':
                void this.deletePreset(preset);
                break;
        }
    }

    applyPreset(preset: ThemePreset): void {
        this.core.setTheme(preset.theme);
        this.emit('presetSelected', preset.id);

        // 高亮应用的预设
        this.highlightAppliedPreset(preset.id);
    }

    previewPreset(preset: ThemePreset): void {
        // 实现预览功能
        console.log('Preview preset:', preset.name);
    }

    exportPreset(preset: ThemePreset): void {
        try {
            const exportData = this.presetManager.exportPreset(preset.id);
            const dataStr = JSON.stringify(exportData, null, 2);

            // 创建下载链接
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${preset.name.replace(/\s+/g, '-').toLowerCase()}-theme.json`;
            a.click();

            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('导出预设失败:', error);
        }
    }

    async deletePreset(preset: ThemePreset): Promise<void> {
        if (preset.builtin) {
            alert('不能删除内置预设');
            return;
        }

    }

    createPreset(): void {
        const currentTheme = this.core.getCurrentTheme();
        if (!currentTheme) {
            alert('没有可保存的主题');
            return;
        }

        const name = prompt('请输入预设名称:');
        if (!name) return;

        const description = prompt('请输入预设描述:') || '用户自定义主题';

        const preset = {
            name,
            description,
            category: 'minimal',
            theme: currentTheme,
            colors: this.extractColors(currentTheme),
            tags: ['custom', 'user']
        };

        this.presetManager.addUserPreset(preset).then(() => {
            this.refreshPresets();
        }).catch(error => {
            console.error('创建预设失败:', error);
            alert('创建预设失败');
        });
    }

    importPreset(): void {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

        input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const presetData = JSON.parse(ev.target?.result as string);
                    this.presetManager.importPreset(presetData).then(() => {
                        this.refreshPresets();
                    });
                } catch (error) {
                    console.error('导入预设失败:', error);
                    alert('导入预设失败：文件格式无效');
                }
            };
            reader.readAsText(file);
        };

        input.click();
    }

    managePresets(): void {
        // 实现预设管理界面
        console.log('Manage presets');
    }

    extractColors(theme: ThemeData): string[] {
        const colorKeys = ['--primary-color', '--secondary-color', '--accent-color', '--success-color'];
        return colorKeys
            .map(key => theme[key])
            .filter((color): color is string => Boolean(color) && color.startsWith('#'))
            .slice(0, 4);
    }

    highlightAppliedPreset(presetId: string): void {
        // 移除所有高亮
        const cards = this.container.querySelectorAll<HTMLElement>('.te-preset-card');
        cards.forEach(card => card.classList.remove('applied'));

        // 高亮当前应用的预设
        const appliedCard = this.container.querySelector<HTMLElement>(`[data-preset-id="${presetId}"]`);
        if (appliedCard) {
            appliedCard.classList.add('applied');
        }
    }

    refreshPresets(): void {
        const presetGrid = this.container.querySelector<HTMLElement>('.te-preset-grid');
        if (presetGrid) {
            presetGrid.innerHTML = this.renderPresets(this.getFilteredPresets());
        }
    }

    show(): void {
        this.isVisible = true;
        const editor = this.container.querySelector<HTMLElement>('.te-preset-editor');
        if (editor) {
            editor.classList.remove('hidden');
            editor.classList.add('visible');
        }
    }

    hide(): void {
        this.isVisible = false;
        const editor = this.container.querySelector<HTMLElement>('.te-preset-editor');
        if (editor) {
            editor.classList.remove('visible');
            editor.classList.add('hidden');
        }
    }

    refresh(): void {
        if (this.isVisible) {
            this.render();
            this.bindEvents();
        }
    }

    update(): void {
        this.refreshPresets();
    }

    destroy(): void {
        this.removeAllListeners();
    }
}
