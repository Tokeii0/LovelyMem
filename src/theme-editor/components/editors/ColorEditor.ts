/**
 * 颜色编辑器
 * 用于编辑主题中的颜色变量
 */

import { EventEmitter, type EventMap } from '../../utils/EventEmitter';
import type { ThemeEditorCore } from '../../core/ThemeEditorCore';

export interface ColorEditorEvents extends EventMap {
    variableChanged: { key: string; value: string };
}

type ViewMode = 'grid' | 'list';

export class ColorEditor extends EventEmitter<ColorEditorEvents> {
    private container: HTMLElement;
    private core: ThemeEditorCore;
    private categoryKey: string;
    private isVisible = false;
    private viewMode: ViewMode = 'grid';

    constructor(container: HTMLElement, core: ThemeEditorCore, categoryKey = 'colors') {
        super();

        this.container = container;
        this.core = core;
        this.categoryKey = categoryKey;

        this.init();
    }

    init(): void {
        this.render();
        this.bindEvents();
    }

    render(): void {
        const category = this.core.getThemeCategories()[this.categoryKey];
        if (!category) return;

        const currentTheme = this.core.getCurrentTheme() || {};

        this.container.innerHTML = `
            <div class="te-color-editor ${this.isVisible ? 'visible' : 'hidden'}">
                <div class="te-color-grid ${this.viewMode === 'list' ? 'list-view' : 'grid-view'}">
                    ${category.variables.map(variable => {
                        const key = `--${variable.key}`;
                        const currentValue = currentTheme[key] || variable.default;
                        const isModified = currentTheme[key] && currentTheme[key] !== variable.default;

                        return `
                            <div class="te-color-item ${isModified ? 'modified' : ''}" data-variable="${variable.key}">
                                <div class="te-color-preview-container">
                                    <div class="te-color-preview"
                                         style="background-color: ${currentValue};"
                                         title="点击选择颜色">
                                    </div>
                                    ${isModified ? '<div class="te-modified-indicator">●</div>' : ''}
                                </div>

                                <div class="te-color-info">
                                    <div class="te-color-header">
                                        <label class="te-color-label">${variable.name}</label>
                                        <div class="te-color-actions">
                                            <button class="te-color-action-btn" data-action="copy" title="复制颜色值">
                                                📋
                                            </button>
                                            <button class="te-color-action-btn" data-action="reset" title="重置为默认值">
                                                🔄
                                            </button>
                                        </div>
                                    </div>

                                    <div class="te-color-inputs">
                                        <input type="color"
                                               class="te-color-picker"
                                               value="${this.convertToHex(currentValue)}"
                                               data-variable="${variable.key}">

                                        <input type="text"
                                               class="te-color-input"
                                               value="${currentValue}"
                                               data-variable="${variable.key}"
                                               placeholder="输入颜色值">
                                    </div>

                                    <div class="te-color-presets">
                                        ${this.renderColorPresets(variable.key)}
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>

                <div class="te-color-tools">
                    <div class="te-color-palette">
                        <h4 class="te-palette-title">快速颜色</h4>
                        <div class="te-palette-colors">
                            ${this.renderQuickColors()}
                        </div>
                    </div>

                    <div class="te-color-history">
                        <h4 class="te-history-title">最近使用</h4>
                        <div class="te-history-colors" id="colorHistory">
                            <!-- 颜色历史将在这里显示 -->
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderColorPresets(variableKey: string): string {
        const presets = this.getColorPresets(variableKey);
        return presets.map(color => `
            <button class="te-color-preset"
                    style="background-color: ${color};"
                    data-color="${color}"
                    data-variable="${variableKey}"
                    title="${color}">
            </button>
        `).join('');
    }

    getColorPresets(variableKey: string): string[] {
        // 根据变量类型返回相应的颜色预设
        const presetMap: Record<string, string[]> = {
            'primary-color': ['#667eea', '#4f46e5', '#3b82f6', '#06b6d4', '#10b981'],
            'secondary-color': ['#764ba2', '#7c3aed', '#8b5cf6', '#a855f7', '#c084fc'],
            'accent-color': ['#f093fb', '#ec4899', '#f59e0b', '#ef4444', '#84cc16'],
            'success-color': ['#4ecdc4', '#10b981', '#059669', '#047857', '#065f46'],
            'warning-color': ['#ffa726', '#f59e0b', '#d97706', '#b45309', '#92400e'],
            'error-color': ['#ff5252', '#ef4444', '#dc2626', '#b91c1c', '#991b1b'],
            'info-color': ['#42a5f5', '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af']
        };

        return presetMap[variableKey] || ['#667eea', '#764ba2', '#f093fb', '#4ecdc4', '#ffa726'];
    }

    renderQuickColors(): string {
        const quickColors = [
            '#ff0000', '#ff8000', '#ffff00', '#80ff00', '#00ff00', '#00ff80',
            '#00ffff', '#0080ff', '#0000ff', '#8000ff', '#ff00ff', '#ff0080',
            '#ffffff', '#cccccc', '#999999', '#666666', '#333333', '#000000'
        ];

        return quickColors.map(color => `
            <button class="te-quick-color"
                    style="background-color: ${color};"
                    data-color="${color}"
                    title="${color}">
            </button>
        `).join('');
    }

    bindEvents(): void {
        // 颜色选择器事件
        this.container.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            if (target.classList.contains('te-color-picker')) {
                const variable = target.dataset.variable;
                const value = target.value;
                if (variable) this.updateColor(variable, value);
            }
        });

        // 颜色输入框事件
        this.container.addEventListener('input', (e) => {
            const target = e.target as HTMLInputElement;
            if (target.classList.contains('te-color-input')) {
                const variable = target.dataset.variable;
                const value = target.value;
                if (variable) this.updateColor(variable, value);
            }
        });

        // 颜色预览点击事件
        this.container.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target.classList.contains('te-color-preview')) {
                const colorItem = target.closest<HTMLElement>('.te-color-item');
                const colorPicker = colorItem?.querySelector<HTMLInputElement>('.te-color-picker');
                colorPicker?.click();
            }

            // 颜色预设点击事件
            if (target.classList.contains('te-color-preset')) {
                const variable = target.dataset.variable;
                const color = target.dataset.color;
                if (variable && color) this.updateColor(variable, color);
            }

            // 快速颜色点击事件
            if (target.classList.contains('te-quick-color')) {
                const color = target.dataset.color;
                // 应用到当前选中的颜色变量（如果有的话）
                if (color) this.applyQuickColor(color);
            }

            // 操作按钮事件
            if (target.classList.contains('te-color-action-btn')) {
                const action = target.dataset.action;
                const colorItem = target.closest<HTMLElement>('.te-color-item');
                const variable = colorItem?.dataset.variable;

                if (variable && action === 'copy') {
                    this.copyColor(variable);
                } else if (variable && action === 'reset') {
                    this.resetColor(variable);
                }
            }
        });
    }

    updateColor(variable: string, value: string): void {
        // 验证颜色值
        if (!this.isValidColor(value)) {
            return;
        }

        // 更新颜色预览
        const colorItem = this.container.querySelector<HTMLElement>(`[data-variable="${variable}"]`);
        if (colorItem) {
            const preview = colorItem.querySelector<HTMLElement>('.te-color-preview');
            const input = colorItem.querySelector<HTMLInputElement>('.te-color-input');
            const picker = colorItem.querySelector<HTMLInputElement>('.te-color-picker');

            if (preview) preview.style.backgroundColor = value;
            if (input) input.value = value;
            if (picker) picker.value = this.convertToHex(value);

            // 添加修改标记
            colorItem.classList.add('modified');
        }

        // 添加到颜色历史
        this.addToColorHistory(value);

        // 触发变量更改事件
        this.emit('variableChanged', { key: variable, value });
    }

    copyColor(variable: string): void {
        const colorItem = this.container.querySelector<HTMLElement>(`[data-variable="${variable}"]`);
        const input = colorItem?.querySelector<HTMLInputElement>('.te-color-input');
        if (!colorItem || !input) return;

        navigator.clipboard.writeText(input.value).then(() => {
            // 显示复制成功提示
            this.showCopySuccess(colorItem);
        });
    }

    resetColor(variable: string): void {
        const category = this.core.getThemeCategories()[this.categoryKey];
        const variableInfo = category?.variables.find(v => v.key === variable);

        if (variableInfo) {
            this.updateColor(variable, variableInfo.default);

            // 移除修改标记
            const colorItem = this.container.querySelector<HTMLElement>(`[data-variable="${variable}"]`);
            colorItem?.classList.remove('modified');
        }
    }

    applyQuickColor(color: string): void {
        // 这里可以实现应用快速颜色的逻辑
        // 例如应用到最后选中的颜色变量
        console.log('Apply quick color:', color);
    }

    addToColorHistory(color: string): void {
        const historyContainer = this.container.querySelector<HTMLElement>('#colorHistory');
        if (!historyContainer) return;

        // 检查颜色是否已存在
        const existingColor = historyContainer.querySelector(`[data-color="${color}"]`);
        if (existingColor) {
            existingColor.remove();
        }

        // 添加新颜色到历史开头
        const colorButton = document.createElement('button');
        colorButton.className = 'te-history-color';
        colorButton.style.backgroundColor = color;
        colorButton.dataset.color = color;
        colorButton.title = color;

        historyContainer.insertBefore(colorButton, historyContainer.firstChild);

        // 限制历史记录数量
        const historyColors = historyContainer.querySelectorAll('.te-history-color');
        if (historyColors.length > 10) {
            historyColors[historyColors.length - 1].remove();
        }
    }

    showCopySuccess(colorItem: HTMLElement): void {
        const copyBtn = colorItem.querySelector<HTMLElement>('[data-action="copy"]');
        if (!copyBtn) return;
        const originalText = copyBtn.textContent;

        copyBtn.textContent = '✓';
        copyBtn.classList.add('success');

        setTimeout(() => {
            copyBtn.textContent = originalText;
            copyBtn.classList.remove('success');
        }, 1000);
    }

    isValidColor(color: string): boolean {
        // 简单的颜色值验证
        const colorRegex = /^(#([0-9a-fA-F]{3}){1,2}|rgb\(.*\)|rgba\(.*\)|hsl\(.*\)|hsla\(.*\)|[a-zA-Z]+)$/;
        return colorRegex.test(color.trim());
    }

    convertToHex(color: string): string {
        // 简单的颜色转换为十六进制
        if (color.startsWith('#')) {
            return color;
        }

        // 这里可以添加更复杂的颜色转换逻辑
        return '#667eea'; // 默认值
    }

    filter(query: string): void {
        const colorItems = this.container.querySelectorAll<HTMLElement>('.te-color-item');
        const lowerQuery = query.toLowerCase();

        colorItems.forEach(item => {
            const label = item.querySelector('.te-color-label')?.textContent?.toLowerCase() ?? '';
            const variable = (item.dataset.variable ?? '').toLowerCase();

            if (label.includes(lowerQuery) || variable.includes(lowerQuery)) {
                item.style.display = '';
            } else {
                item.style.display = 'none';
            }
        });
    }

    setViewMode(mode: ViewMode): void {
        this.viewMode = mode;
        const colorGrid = this.container.querySelector<HTMLElement>('.te-color-grid');
        if (!colorGrid) return;

        if (mode === 'list') {
            colorGrid.classList.remove('grid-view');
            colorGrid.classList.add('list-view');
        } else {
            colorGrid.classList.remove('list-view');
            colorGrid.classList.add('grid-view');
        }
    }

    show(): void {
        this.isVisible = true;
        const editor = this.container.querySelector<HTMLElement>('.te-color-editor');
        if (editor) {
            editor.classList.remove('hidden');
            editor.classList.add('visible');
        }
    }

    hide(): void {
        this.isVisible = false;
        const editor = this.container.querySelector<HTMLElement>('.te-color-editor');
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
        this.refresh();
    }

    reset(): void {
        const category = this.core.getThemeCategories()[this.categoryKey];
        if (!category) return;

        category.variables.forEach(variable => {
            this.resetColor(variable.key);
        });
    }

    destroy(): void {
        this.removeAllListeners();
    }
}
