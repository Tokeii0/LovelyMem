/**
 * 字体编辑器
 * 用于编辑主题中的字体相关变量
 */

import { EventEmitter, type EventMap } from '../../utils/EventEmitter';
import type { ThemeEditorCore, ThemeVariable } from '../../core/ThemeEditorCore';

export interface TypographyEditorEvents extends EventMap {
    variableChanged: { key: string; value: string };
}

export class TypographyEditor extends EventEmitter<TypographyEditorEvents> {
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
        const category = this.core.getThemeCategories()['typography'];
        if (!category) return;

        const currentTheme = this.core.getCurrentTheme() || {};

        this.container.innerHTML = `
            <div class="te-typography-editor ${this.isVisible ? 'visible' : 'hidden'}">
                <div class="te-typography-grid">
                    ${category.variables.map(variable => {
                        const key = `--${variable.key}`;
                        const currentValue = currentTheme[key] || variable.default;
                        const isModified = currentTheme[key] && currentTheme[key] !== variable.default;

                        return `
                            <div class="te-typography-item ${isModified ? 'modified' : ''}" data-variable="${variable.key}">
                                <div class="te-typography-header">
                                    <label class="te-typography-label">${variable.name}</label>
                                    <div class="te-typography-actions">
                                        <button class="te-typography-action-btn" data-action="reset" title="重置">🔄</button>
                                        <button class="te-typography-action-btn" data-action="copy" title="复制">📋</button>
                                    </div>
                                </div>

                                <div class="te-typography-preview" style="${this.getPreviewStyle(variable.key, currentValue)}">
                                    ${this.getPreviewText(variable.key)}
                                </div>

                                <div class="te-typography-controls">
                                    ${this.renderControl(variable, currentValue)}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>

                <div class="te-typography-tools">
                    <div class="te-font-presets">
                        <h4>字体预设</h4>
                        <div class="te-preset-fonts">
                            ${this.renderFontPresets()}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderControl(variable: ThemeVariable, currentValue: string): string {
        switch (variable.type) {
            case 'font-family':
                return `
                    <select class="te-typography-select" data-variable="${variable.key}">
                        <option value='"Inter", "Noto Sans SC", sans-serif' ${currentValue.includes('Inter') ? 'selected' : ''}>Inter (默认)</option>
                        <option value='"Roboto", "Noto Sans SC", sans-serif' ${currentValue.includes('Roboto') ? 'selected' : ''}>Roboto</option>
                        <option value='"Poppins", "Noto Sans SC", sans-serif' ${currentValue.includes('Poppins') ? 'selected' : ''}>Poppins</option>
                        <option value='"Source Sans Pro", "Noto Sans SC", sans-serif' ${currentValue.includes('Source Sans Pro') ? 'selected' : ''}>Source Sans Pro</option>
                        <option value='"JetBrains Mono", "Consolas", monospace' ${currentValue.includes('JetBrains Mono') ? 'selected' : ''}>JetBrains Mono</option>
                        <option value='"Fira Code", "Consolas", monospace' ${currentValue.includes('Fira Code') ? 'selected' : ''}>Fira Code</option>
                    </select>
                    <input type="text" class="te-typography-input" value="${currentValue}" data-variable="${variable.key}" placeholder="自定义字体">
                `;
            case 'size':
                return `
                    <div class="te-size-control">
                        <input type="range" class="te-size-slider" min="10" max="32" value="${parseInt(currentValue)}" data-variable="${variable.key}">
                        <input type="text" class="te-size-input" value="${currentValue}" data-variable="${variable.key}">
                    </div>
                `;
            default:
                return `
                    <input type="text" class="te-typography-input" value="${currentValue}" data-variable="${variable.key}">
                `;
        }
    }

    renderFontPresets(): string {
        const presets = [
            { name: 'Inter', value: '"Inter", "Noto Sans SC", sans-serif' },
            { name: 'Roboto', value: '"Roboto", "Noto Sans SC", sans-serif' },
            { name: 'Poppins', value: '"Poppins", "Noto Sans SC", sans-serif' },
            { name: 'Source Sans Pro', value: '"Source Sans Pro", "Noto Sans SC", sans-serif' },
            { name: 'JetBrains Mono', value: '"JetBrains Mono", "Consolas", monospace' },
            { name: 'Fira Code', value: '"Fira Code", "Consolas", monospace' }
        ];

        return presets.map(preset => `
            <button class="te-font-preset" data-font="${preset.value}" style="font-family: ${preset.value};">
                ${preset.name}
            </button>
        `).join('');
    }

    getPreviewStyle(key: string, value: string): string {
        if (key.includes('font-family')) {
            return `font-family: ${value}; font-size: 16px;`;
        } else if (key.includes('font-size')) {
            return `font-size: ${value};`;
        }
        return '';
    }

    getPreviewText(key: string): string {
        if (key.includes('mono')) {
            return 'console.log("Hello World");';
        }
        return '这是字体预览文本 The quick brown fox';
    }

    bindEvents(): void {
        this.container.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement | HTMLSelectElement;
            if (target.classList.contains('te-typography-select') ||
                target.classList.contains('te-typography-input') ||
                target.classList.contains('te-size-input')) {
                const variable = target.dataset.variable;
                const value = target.value;
                if (variable) this.updateTypography(variable, value);
            }
        });

        this.container.addEventListener('input', (e) => {
            const target = e.target as HTMLInputElement;
            if (target.classList.contains('te-size-slider')) {
                const variable = target.dataset.variable;
                const value = target.value + 'px';
                if (variable) {
                    this.updateTypography(variable, value);

                    // 同步更新文本输入框
                    const textInput = this.container.querySelector<HTMLInputElement>(`input[type="text"][data-variable="${variable}"]`);
                    if (textInput) {
                        textInput.value = value;
                    }
                }
            }
        });

        this.container.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target.classList.contains('te-font-preset')) {
                const font = target.dataset.font;
                if (font) this.applyFontPreset(font);
            }

            if (target.classList.contains('te-typography-action-btn')) {
                const action = target.dataset.action;
                const typographyItem = target.closest<HTMLElement>('.te-typography-item');
                const variable = typographyItem?.dataset.variable;

                if (variable && action === 'copy') {
                    this.copyTypography(variable);
                } else if (variable && action === 'reset') {
                    this.resetTypography(variable);
                }
            }
        });
    }

    updateTypography(variable: string, value: string): void {
        const typographyItem = this.container.querySelector<HTMLElement>(`[data-variable="${variable}"]`);
        if (typographyItem) {
            const preview = typographyItem.querySelector<HTMLElement>('.te-typography-preview');
            if (preview) preview.style.cssText = this.getPreviewStyle(variable, value);
            typographyItem.classList.add('modified');
        }

        this.emit('variableChanged', { key: variable, value });
    }

    applyFontPreset(font: string): void {
        // 应用到主字体
        this.updateTypography('font-family-primary', font);

        // 更新选择器
        const select = this.container.querySelector<HTMLSelectElement>('[data-variable="font-family-primary"]');
        if (select) {
            select.value = font;
        }
    }

    copyTypography(variable: string): void {
        const typographyItem = this.container.querySelector<HTMLElement>(`[data-variable="${variable}"]`);
        const input = typographyItem?.querySelector<HTMLInputElement>('.te-typography-input, .te-size-input');
        if (!typographyItem || !input) return;

        navigator.clipboard.writeText(input.value).then(() => {
            this.showCopySuccess(typographyItem);
        });
    }

    resetTypography(variable: string): void {
        const category = this.core.getThemeCategories()['typography'];
        const variableInfo = category?.variables.find(v => v.key === variable);

        if (variableInfo) {
            this.updateTypography(variable, variableInfo.default);

            // 更新输入框
            const typographyItem = this.container.querySelector<HTMLElement>(`[data-variable="${variable}"]`);
            const inputs = typographyItem?.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select');
            inputs?.forEach(input => {
                input.value = variableInfo.default;
            });

            typographyItem?.classList.remove('modified');
        }
    }

    showCopySuccess(typographyItem: HTMLElement): void {
        const copyBtn = typographyItem.querySelector<HTMLElement>('[data-action="copy"]');
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
        const editor = this.container.querySelector<HTMLElement>('.te-typography-editor');
        if (editor) {
            editor.classList.remove('hidden');
            editor.classList.add('visible');
        }
    }

    hide(): void {
        this.isVisible = false;
        const editor = this.container.querySelector<HTMLElement>('.te-typography-editor');
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
