/**
 * 渐变编辑器
 * 用于编辑主题中的渐变变量
 */

import { EventEmitter, type EventMap } from '../../utils/EventEmitter';
import type { ThemeEditorCore } from '../../core/ThemeEditorCore';

export interface GradientEditorEvents extends EventMap {
    variableChanged: { key: string; value: string };
}

export class GradientEditor extends EventEmitter<GradientEditorEvents> {
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
        const category = this.core.getThemeCategories()['gradients'];
        if (!category) return;

        const currentTheme = this.core.getCurrentTheme() || {};

        this.container.innerHTML = `
            <div class="te-gradient-editor ${this.isVisible ? 'visible' : 'hidden'}">
                <div class="te-gradient-grid">
                    ${category.variables.map(variable => {
                        const key = `--${variable.key}`;
                        const currentValue = currentTheme[key] || variable.default;
                        const isModified = currentTheme[key] && currentTheme[key] !== variable.default;

                        return `
                            <div class="te-gradient-item ${isModified ? 'modified' : ''}" data-variable="${variable.key}">
                                <div class="te-gradient-preview"
                                     style="background: ${currentValue};"
                                     title="点击编辑渐变">
                                </div>

                                <div class="te-gradient-info">
                                    <label class="te-gradient-label">${variable.name}</label>
                                    <textarea class="te-gradient-input"
                                              data-variable="${variable.key}"
                                              placeholder="输入渐变CSS值">${currentValue}</textarea>

                                    <div class="te-gradient-actions">
                                        <button class="te-gradient-action-btn" data-action="reset" title="重置">🔄</button>
                                        <button class="te-gradient-action-btn" data-action="copy" title="复制">📋</button>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>

                <div class="te-gradient-tools">
                    <h4>渐变预设</h4>
                    <div class="te-gradient-presets">
                        ${this.renderGradientPresets()}
                    </div>
                </div>
            </div>
        `;
    }

    renderGradientPresets(): string {
        const presets = [
            'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
            'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
            'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
            'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
            'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)'
        ];

        return presets.map(gradient => `
            <button class="te-gradient-preset"
                    style="background: ${gradient};"
                    data-gradient="${gradient}"
                    title="${gradient}">
            </button>
        `).join('');
    }

    bindEvents(): void {
        this.container.addEventListener('input', (e) => {
            const target = e.target as HTMLTextAreaElement;
            if (target.classList.contains('te-gradient-input')) {
                const variable = target.dataset.variable;
                const value = target.value;
                if (variable) this.updateGradient(variable, value);
            }
        });

        this.container.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target.classList.contains('te-gradient-preset')) {
                const gradient = target.dataset.gradient;
                // 应用到当前选中的渐变变量
                console.log('Apply gradient preset:', gradient);
            }
        });
    }

    updateGradient(variable: string, value: string): void {
        const gradientItem = this.container.querySelector<HTMLElement>(`[data-variable="${variable}"]`);
        if (gradientItem) {
            const preview = gradientItem.querySelector<HTMLElement>('.te-gradient-preview');
            if (preview) preview.style.background = value;
            gradientItem.classList.add('modified');
        }

        this.emit('variableChanged', { key: variable, value });
    }

    show(): void {
        this.isVisible = true;
        const editor = this.container.querySelector<HTMLElement>('.te-gradient-editor');
        if (editor) {
            editor.classList.remove('hidden');
            editor.classList.add('visible');
        }
    }

    hide(): void {
        this.isVisible = false;
        const editor = this.container.querySelector<HTMLElement>('.te-gradient-editor');
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

    destroy(): void {
        this.removeAllListeners();
    }
}
