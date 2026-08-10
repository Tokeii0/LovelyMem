/**
 * 边框编辑器
 * 用于编辑主题中的边框相关变量
 */

import { EventEmitter, type EventMap } from '../../utils/EventEmitter';
import type { ThemeEditorCore, ThemeVariable } from '../../core/ThemeEditorCore';

export interface BorderEditorEvents extends EventMap {
    variableChanged: { key: string; value: string };
}

export class BorderEditor extends EventEmitter<BorderEditorEvents> {
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
        const category = this.core.getThemeCategories()['borders'];
        if (!category) return;

        const currentTheme = this.core.getCurrentTheme() || {};

        this.container.innerHTML = `
            <div class="te-border-editor ${this.isVisible ? 'visible' : 'hidden'}">
                <div class="te-border-grid">
                    ${category.variables.map(variable => {
                        const key = `--${variable.key}`;
                        const currentValue = currentTheme[key] || variable.default;
                        const isModified = currentTheme[key] && currentTheme[key] !== variable.default;

                        return `
                            <div class="te-border-item ${isModified ? 'modified' : ''}" data-variable="${variable.key}">
                                <div class="te-border-header">
                                    <label class="te-border-label">${variable.name}</label>
                                    <div class="te-border-actions">
                                        <button class="te-border-action-btn" data-action="reset" title="重置">🔄</button>
                                        <button class="te-border-action-btn" data-action="copy" title="复制">📋</button>
                                    </div>
                                </div>

                                <div class="te-border-preview">
                                    <div class="te-border-demo" style="${this.getBorderStyle(variable.key, currentValue)}">
                                        ${this.getPreviewContent(variable.key)}
                                    </div>
                                </div>

                                <div class="te-border-controls">
                                    ${this.renderControl(variable, currentValue)}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>

                <div class="te-border-tools">
                    <div class="te-border-presets">
                        <h4>边框预设</h4>
                        <div class="te-preset-borders">
                            ${this.renderBorderPresets()}
                        </div>
                    </div>

                    <div class="te-radius-showcase">
                        <h4>圆角展示</h4>
                        <div class="te-radius-examples">
                            ${this.renderRadiusExamples()}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderControl(variable: ThemeVariable, currentValue: string): string {
        if (variable.key.includes('radius')) {
            return `
                <div class="te-radius-control">
                    <input type="range"
                           class="te-radius-slider"
                           min="0"
                           max="32"
                           value="${parseInt(currentValue)}"
                           data-variable="${variable.key}">
                    <input type="text"
                           class="te-radius-input"
                           value="${currentValue}"
                           data-variable="${variable.key}">
                </div>
                <div class="te-radius-presets">
                    ${[0, 4, 8, 12, 16, 20, 24, 32].map(value => `
                        <button class="te-radius-preset" data-value="${value}px" data-variable="${variable.key}">
                            ${value}
                        </button>
                    `).join('')}
                </div>
            `;
        } else if (variable.key.includes('color')) {
            return `
                <div class="te-border-color-control">
                    <input type="color"
                           class="te-border-color-picker"
                           value="${this.convertToHex(currentValue)}"
                           data-variable="${variable.key}">
                    <input type="text"
                           class="te-border-color-input"
                           value="${currentValue}"
                           data-variable="${variable.key}">
                </div>
                <div class="te-border-color-presets">
                    ${this.renderColorPresets(variable.key)}
                </div>
            `;
        } else {
            return `
                <input type="text"
                       class="te-border-input"
                       value="${currentValue}"
                       data-variable="${variable.key}">
            `;
        }
    }

    renderBorderPresets(): string {
        const presets = [
            { name: '无边框', style: 'border: none;' },
            { name: '细边框', style: 'border: 1px solid var(--border-color);' },
            { name: '粗边框', style: 'border: 2px solid var(--border-color);' },
            { name: '虚线边框', style: 'border: 1px dashed var(--border-color);' },
            { name: '点线边框', style: 'border: 1px dotted var(--border-color);' },
            { name: '双线边框', style: 'border: 3px double var(--border-color);' }
        ];

        return presets.map(preset => `
            <div class="te-border-preset" data-style="${preset.style}">
                <div class="te-preset-demo" style="${preset.style} padding: 8px; margin: 4px;">
                    ${preset.name}
                </div>
            </div>
        `).join('');
    }

    renderRadiusExamples(): string {
        const examples = [
            { name: '无圆角', value: '0px' },
            { name: '小圆角', value: '4px' },
            { name: '中圆角', value: '8px' },
            { name: '大圆角', value: '12px' },
            { name: '超大圆角', value: '16px' },
            { name: '圆形', value: '50%' }
        ];

        return examples.map(example => `
            <div class="te-radius-example">
                <div class="te-radius-demo" style="border-radius: ${example.value}; border: 2px solid var(--border-color); width: 40px; height: 40px;"></div>
                <span class="te-radius-name">${example.name}</span>
                <span class="te-radius-value">${example.value}</span>
            </div>
        `).join('');
    }

    renderColorPresets(variableKey: string): string {
        const colors = ['#e2e8f0', '#cbd5e1', '#94a3b8', '#64748b', '#475569', '#334155'];

        return colors.map(color => `
            <button class="te-border-color-preset"
                    style="background-color: ${color};"
                    data-color="${color}"
                    data-variable="${variableKey}"
                    title="${color}">
            </button>
        `).join('');
    }

    getBorderStyle(key: string, value: string): string {
        if (key.includes('radius')) {
            return `border-radius: ${value}; border: 2px solid var(--border-color); padding: 16px; background: var(--bg-secondary);`;
        } else if (key.includes('color')) {
            return `border: 2px solid ${value}; border-radius: 8px; padding: 16px; background: var(--bg-secondary);`;
        }
        return `border: 2px solid var(--border-color); border-radius: 8px; padding: 16px; background: var(--bg-secondary);`;
    }

    getPreviewContent(key: string): string {
        if (key.includes('radius')) {
            return '圆角预览';
        } else if (key.includes('color')) {
            return '边框颜色';
        }
        return '边框预览';
    }

    convertToHex(color: string): string {
        if (color.startsWith('#')) {
            return color;
        }
        return '#e2e8f0';
    }

    bindEvents(): void {
        this.container.addEventListener('input', (e) => {
            const target = e.target as HTMLInputElement;
            if (target.classList.contains('te-radius-slider')) {
                const variable = target.dataset.variable;
                const value = target.value + 'px';
                if (variable) {
                    this.updateBorder(variable, value);

                    const textInput = this.container.querySelector<HTMLInputElement>(`input[type="text"][data-variable="${variable}"]`);
                    if (textInput) {
                        textInput.value = value;
                    }
                }
            }

            if (target.classList.contains('te-radius-input') ||
                target.classList.contains('te-border-color-input') ||
                target.classList.contains('te-border-input')) {
                const variable = target.dataset.variable;
                const value = target.value;
                if (variable) this.updateBorder(variable, value);
            }
        });

        this.container.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            if (target.classList.contains('te-border-color-picker')) {
                const variable = target.dataset.variable;
                const value = target.value;
                if (variable) {
                    this.updateBorder(variable, value);

                    const textInput = this.container.querySelector<HTMLInputElement>(`input[type="text"][data-variable="${variable}"]`);
                    if (textInput) {
                        textInput.value = value;
                    }
                }
            }
        });

        this.container.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target.classList.contains('te-radius-preset')) {
                const variable = target.dataset.variable;
                const value = target.dataset.value;
                if (variable && value) {
                    this.updateBorder(variable, value);
                    this.updateInputs(variable, value);
                }
            }

            if (target.classList.contains('te-border-color-preset')) {
                const variable = target.dataset.variable;
                const color = target.dataset.color;
                if (variable && color) {
                    this.updateBorder(variable, color);
                    this.updateColorInputs(variable, color);
                }
            }

            if (target.classList.contains('te-border-action-btn')) {
                const action = target.dataset.action;
                const borderItem = target.closest<HTMLElement>('.te-border-item');
                const variable = borderItem?.dataset.variable;

                if (variable && action === 'copy') {
                    this.copyBorder(variable);
                } else if (variable && action === 'reset') {
                    this.resetBorder(variable);
                }
            }
        });
    }

    updateBorder(variable: string, value: string): void {
        const borderItem = this.container.querySelector<HTMLElement>(`[data-variable="${variable}"]`);
        if (borderItem) {
            const demo = borderItem.querySelector<HTMLElement>('.te-border-demo');
            if (demo) demo.style.cssText = this.getBorderStyle(variable, value);
            borderItem.classList.add('modified');
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

    updateColorInputs(variable: string, color: string): void {
        const textInput = this.container.querySelector<HTMLInputElement>(`input[type="text"][data-variable="${variable}"]`);
        const colorPicker = this.container.querySelector<HTMLInputElement>(`input[type="color"][data-variable="${variable}"]`);

        if (textInput) {
            textInput.value = color;
        }

        if (colorPicker) {
            colorPicker.value = color;
        }
    }

    copyBorder(variable: string): void {
        const borderItem = this.container.querySelector<HTMLElement>(`[data-variable="${variable}"]`);
        const input = borderItem?.querySelector<HTMLInputElement>('input[type="text"]');
        if (!borderItem || !input) return;

        navigator.clipboard.writeText(input.value).then(() => {
            this.showCopySuccess(borderItem);
        });
    }

    resetBorder(variable: string): void {
        const category = this.core.getThemeCategories()['borders'];
        const variableInfo = category?.variables.find(v => v.key === variable);

        if (variableInfo) {
            this.updateBorder(variable, variableInfo.default);
            this.updateInputs(variable, variableInfo.default);

            const borderItem = this.container.querySelector<HTMLElement>(`[data-variable="${variable}"]`);
            borderItem?.classList.remove('modified');
        }
    }

    showCopySuccess(borderItem: HTMLElement): void {
        const copyBtn = borderItem.querySelector<HTMLElement>('[data-action="copy"]');
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
        const editor = this.container.querySelector<HTMLElement>('.te-border-editor');
        if (editor) {
            editor.classList.remove('hidden');
            editor.classList.add('visible');
        }
    }

    hide(): void {
        this.isVisible = false;
        const editor = this.container.querySelector<HTMLElement>('.te-border-editor');
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
