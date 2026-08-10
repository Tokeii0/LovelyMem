/**
 * 预览面板组件
 * 实时预览主题效果
 */

import { EventEmitter, type EventMap } from '../utils/EventEmitter';
import type { ThemeEditorCore } from '../core/ThemeEditorCore';

export class PreviewPanelComponent extends EventEmitter<EventMap> {
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
        this.container.innerHTML = `
            <div class="te-preview-header">
                <h3 class="te-preview-title">实时预览</h3>
                <div class="te-preview-controls">
                    <button class="te-preview-control-btn" id="refreshPreview" title="刷新预览">
                        🔄
                    </button>
                    <button class="te-preview-control-btn" id="fullscreenPreview" title="全屏预览">
                        ⛶
                    </button>
                </div>
            </div>

            <div class="te-preview-content">
                <div class="te-preview-frame" id="previewFrame">
                    <div class="te-preview-demo">
                        <div class="demo-header">
                            <h2 style="color: var(--primary-color);">主题预览</h2>
                            <p style="color: var(--text-secondary);">这是主题效果的实时预览</p>
                        </div>

                        <div class="demo-content">
                            <div class="demo-card" style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); box-shadow: var(--shadow-md);">
                                <h3 style="color: var(--text-primary);">示例卡片</h3>
                                <p style="color: var(--text-secondary);">这是一个示例卡片，展示主题的颜色和样式效果。</p>

                                <div class="demo-buttons">
                                    <button class="demo-btn primary" style="background: var(--primary-color); color: white; border: none; padding: 8px 16px; border-radius: var(--radius-sm);">
                                        主要按钮
                                    </button>
                                    <button class="demo-btn secondary" style="background: var(--secondary-color); color: white; border: none; padding: 8px 16px; border-radius: var(--radius-sm);">
                                        次要按钮
                                    </button>
                                    <button class="demo-btn accent" style="background: var(--accent-color); color: white; border: none; padding: 8px 16px; border-radius: var(--radius-sm);">
                                        强调按钮
                                    </button>
                                </div>
                            </div>

                            <div class="demo-status-colors">
                                <div class="status-item">
                                    <div class="status-color" style="background: var(--success-color);"></div>
                                    <span style="color: var(--text-primary);">成功</span>
                                </div>
                                <div class="status-item">
                                    <div class="status-color" style="background: var(--warning-color);"></div>
                                    <span style="color: var(--text-primary);">警告</span>
                                </div>
                                <div class="status-item">
                                    <div class="status-color" style="background: var(--error-color);"></div>
                                    <span style="color: var(--text-primary);">错误</span>
                                </div>
                                <div class="status-item">
                                    <div class="status-color" style="background: var(--info-color);"></div>
                                    <span style="color: var(--text-primary);">信息</span>
                                </div>
                            </div>

                            <div class="demo-gradient" style="background: var(--gradient-primary); padding: 20px; border-radius: var(--radius-lg); margin: 16px 0;">
                                <h4 style="color: white; margin: 0;">渐变效果</h4>
                                <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0;">主渐变背景效果展示</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="te-preview-footer">
                <div class="te-preview-info">
                    <span class="te-info-text">预览会实时更新主题变化</span>
                </div>
            </div>
        `;
    }

    bindEvents(): void {
        // 刷新预览按钮
        const refreshBtn = this.container.querySelector<HTMLButtonElement>('#refreshPreview');
        refreshBtn?.addEventListener('click', () => {
            this.updatePreview();
        });

        // 全屏预览按钮
        const fullscreenBtn = this.container.querySelector<HTMLButtonElement>('#fullscreenPreview');
        fullscreenBtn?.addEventListener('click', () => {
            this.toggleFullscreen();
        });

        // 监听核心事件
        this.core.on('themeChanged', () => {
            if (this.isVisible) {
                this.updatePreview();
            }
        });

        this.core.on('variableChanged', () => {
            if (this.isVisible) {
                this.updatePreview();
            }
        });
    }

    updatePreview(): void {
        const currentTheme = this.core.getCurrentTheme();
        if (!currentTheme) return;

        const previewFrame = this.container.querySelector<HTMLElement>('#previewFrame');
        if (!previewFrame) return;

        // 应用主题变量到预览框架
        Object.entries(currentTheme).forEach(([key, value]) => {
            previewFrame.style.setProperty(key, value);
        });

        // 添加更新动画效果
        previewFrame.classList.add('updating');
        setTimeout(() => {
            previewFrame.classList.remove('updating');
        }, 300);
    }

    toggleFullscreen(): void {
        const previewContent = this.container.querySelector<HTMLElement>('.te-preview-content');
        if (!previewContent) return;

        if (previewContent.classList.contains('fullscreen')) {
            previewContent.classList.remove('fullscreen');
            document.body.classList.remove('preview-fullscreen');
        } else {
            previewContent.classList.add('fullscreen');
            document.body.classList.add('preview-fullscreen');
        }
    }

    show(): void {
        this.isVisible = true;
        this.container.classList.remove('hidden');
        this.container.classList.add('visible');
        this.updatePreview();
    }

    hide(): void {
        this.isVisible = false;
        this.container.classList.remove('visible');
        this.container.classList.add('hidden');
    }

    update(): void {
        if (this.isVisible) {
            this.updatePreview();
        }
    }

    destroy(): void {
        this.removeAllListeners();
        this.container.innerHTML = '';
    }
}
