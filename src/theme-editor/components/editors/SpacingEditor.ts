/**
 * 间距编辑器
 * 用于编辑主题中的间距相关变量
 */

import { EventEmitter, type EventMap } from '../../utils/EventEmitter';
import type { ThemeEditorCore } from '../../core/ThemeEditorCore';

export interface SpacingEditorEvents extends EventMap {
    variableChanged: { key: string; value: string };
}

export class SpacingEditor extends EventEmitter<SpacingEditorEvents> {
    private container: HTMLElement;
    private core: ThemeEditorCore;
    private isVisible = false;

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
        const category = this.core.getThemeCategories()['spacing'];
        if (!category) return;

        const currentTheme = this.core.getCurrentTheme() || {};

        this.container.innerHTML = `
            <div class="te-spacing-editor ${this.isVisible ? 'visible' : 'hidden'}">
                <div class="te-spacing-grid">
                    ${category.variables.map(variable => {
                        const key = `--${variable.key}`;
                        const currentValue = currentTheme[key] || variable.default;
                        const isModified = currentTheme[key] && currentTheme[key] !== variable.default;

                        return `
                            <div class="te-spacing-item ${isModified ? 'modified' : ''}" data-variable="${variable.key}">
                                <div class="te-spacing-header">
                                    <label class="te-spacing-label">${variable.name}</label>
                                    <div class="te-spacing-actions">
                                        <button class="te-spacing-action-btn" data-action="reset" title="重置">🔄</button>
                                        <button class="te-spacing-action-btn" data-action="copy" title="复制">📋</button>
                                    </div>
                                </div>

                                <div class="te-spacing-preview">
                                    <div class="te-spacing-demo" style="padding: ${currentValue}; margin: ${currentValue};">
                                        <div class="te-spacing-content">
                                            ${variable.name}
                                        </div>
                                    </div>
                                </div>

                                <div class="te-spacing-controls">
                                    <div class="te-spacing-slider-group">
                                        <input type="range"
                                               class="te-spacing-slider"
                                               min="0"
                                               max="64"
                                               value="${parseInt(currentValue)}"
                                               data-variable="${variable.key}">
                                        <input type="text"
                                               class="te-spacing-input"
                                               value="${currentValue}"
                                               data-variable="${variable.key}"
                                               placeholder="输入间距值">
                                    </div>

                                    <div class="te-spacing-presets">
                                        ${this.renderSpacingPresets(variable.key)}
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>

                <div class="te-spacing-tools">
                    <div class="te-spacing-system">
                        <h4>间距系统</h4>
                        <div class="te-spacing-scale">
                            ${this.renderSpacingScale()}
                        </div>
                    </div>

                    <div class="te-spacing-units">
                        <h4>单位选择</h4>
                        <div class="te-unit-buttons">
                            <button class="te-unit-btn active" data-unit="px">px</button>
                            <button class="te-unit-btn" data-unit="rem">rem</button>
                            <button class="te-unit-btn" data-unit="em">em</button>
                            <button class="te-unit-btn" data-unit="%">%</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderSpacingPresets(variableKey: string): string {
        const presets = [4, 8, 12, 16, 20, 24, 32, 40, 48, 64];

        return presets.map(value => `
            <button class="te-spacing-preset"
                    data-value="${value}px"
                    data-variable="${variableKey}"
                    title="${value}px">
                ${value}
            </button>
        `).join('');
    }

    renderSpacingScale(): string {
        const scale = [
            { name: 'xs', value: '4px', description: '超小间距' },
            { name: 'sm', value: '8px', description: '小间距' },
            { name: 'md', value: '16px', description: '中等间距' },
            { name: 'lg', value: '24px', description: '大间距' },
            { name: 'xl', value: '32px', description: '超大间距' }
        ];

        return scale.map(item => `
            <div class="te-scale-item">
                <div class="te-scale-visual" style="width: ${item.value}; height: ${item.value};"></div>
                <div class="te-scale-info">
                    <span class="te-scale-name">${item.name}</span>
                    <span class="te-scale-value">${item.value}</span>
                    <span class="te-scale-desc">${item.description}</span>
                </div>
            </div>
        `).join('');
    }

    bindEvents(): void {
        this.container.addEventListener('input', (e) => {
            const target = e.target as HTMLInputElement;
            if (target.classList.contains('te-spacing-slider')) {
                const variable = target.dataset.variable;
                const value = target.value + 'px';
                if (variable) {
                    this.updateSpacing(variable, value);

                    // 同步更新文本输入框
                    const textInput = this.container.querySelector<HTMLInputElement>(`input[type="text"][data-variable="${variable}"]`);
                    if (textInput) {
                        textInput.value = value;
                    }
                }
            }

            if (target.classList.contains('te-spacing-input')) {
                const variable = target.dataset.variable;
                const value = target.value;
                if (variable) {
                    this.updateSpacing(variable, value);

                    // 同步更新滑块
                    const slider = this.container.querySelector<HTMLInputElement>(`input[type="range"][data-variable="${variable}"]`);
                    if (slider) {
                        const numValue = parseInt(value);
                        if (!isNaN(numValue)) {
                            slider.value = String(numValue);
                        }
                    }
                }
            }
        });

        this.container.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target.classList.contains('te-spacing-preset')) {
                const variable = target.dataset.variable;
                const value = target.dataset.value;
                if (variable && value) {
                    this.updateSpacing(variable, value);

                    // 更新输入框和滑块
                    this.updateInputs(variable, value);
                }
            }

            if (target.classList.contains('te-unit-btn')) {
                if (target.dataset.unit) this.switchUnit(target.dataset.unit);
            }

            if (target.classList.contains('te-spacing-action-btn')) {
                const action = target.dataset.action;
                const spacingItem = target.closest<HTMLElement>('.te-spacing-item');
                const variable = spacingItem?.dataset.variable;

                if (variable && action === 'copy') {
                    this.copySpacing(variable);
                } else if (variable && action === 'reset') {
                    this.resetSpacing(variable);
                }
            }
        });
    }

    updateSpacing(variable: string, value: string): void {
        const spacingItem = this.container.querySelector<HTMLElement>(`[data-variable="${variable}"]`);
        if (spacingItem) {
            const demo = spacingItem.querySelector<HTMLElement>('.te-spacing-demo');
            if (demo) {
                demo.style.padding = value;
                demo.style.margin = value;
            }
            spacingItem.classList.add('modified');
        }

        this.emit('variableChanged', { key: variable, value });
    }

    updateInputs(variable: string, value: string): void {
        const textInput = this.container.querySelector<HTMLInputElement>(`input[type="text"][data-variable="${variable}"]`);
        const slider = this.container.querySelector<HTMLInputElement>(`input[type="range"][data-variable="${variable}"]`);

        if (textInput) {
            textInput.value = value;
        }

        if (slider) {
            const numValue = parseInt(value);
            if (!isNaN(numValue)) {
                slider.value = String(numValue);
            }
        }
    }

    switchUnit(unit: string): void {
        // 更新单位按钮状态
        const unitBtns = this.container.querySelectorAll<HTMLElement>('.te-unit-btn');
        unitBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.unit === unit);
        });

        // 这里可以添加单位转换逻辑
        console.log('切换到单位:', unit);
    }

    copySpacing(variable: string): void {
        const spacingItem = this.container.querySelector<HTMLElement>(`[data-variable="${variable}"]`);
        const input = spacingItem?.querySelector<HTMLInputElement>('.te-spacing-input');
        if (!spacingItem || !input) return;

        navigator.clipboard.writeText(input.value).then(() => {
            this.showCopySuccess(spacingItem);
        });
    }

    resetSpacing(variable: string): void {
        const category = this.core.getThemeCategories()['spacing'];
        const variableInfo = category?.variables.find(v => v.key === variable);

        if (variableInfo) {
            this.updateSpacing(variable, variableInfo.default);
            this.updateInputs(variable, variableInfo.default);

            const spacingItem = this.container.querySelector<HTMLElement>(`[data-variable="${variable}"]`);
            spacingItem?.classList.remove('modified');
        }
    }

    showCopySuccess(spacingItem: HTMLElement): void {
        const copyBtn = spacingItem.querySelector<HTMLElement>('[data-action="copy"]');
        if (!copyBtn) return;
        const originalText = copyBtn.textContent;

        copyBtn.textContent = '✓';
        copyBtn.classList.add('success');

        setTimeout(() => {
            copyBtn.textContent = originalText;
            copyBtn.classList.remove('success');
        }, 1000);
    }

    show(): void {
        this.isVisible = true;
        const editor = this.container.querySelector<HTMLElement>('.te-spacing-editor');
        if (editor) {
            editor.classList.remove('hidden');
            editor.classList.add('visible');
        }
    }

    hide(): void {
        this.isVisible = false;
        const editor = this.container.querySelector<HTMLElement>('.te-spacing-editor');
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

    update(): void { this.refresh(); }
    destroy(): void { this.removeAllListeners(); }
}
