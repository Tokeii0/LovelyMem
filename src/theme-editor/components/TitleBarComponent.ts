/**
 * 标题栏组件
 * 显示应用标题、基础主题选择器和操作按钮
 */

import { EventEmitter, type EventMap } from '../utils/EventEmitter';
import type { ThemeEditorCore, HistoryState } from '../core/ThemeEditorCore';

export interface TitleBarComponentEvents extends EventMap {
    togglePreview: void;
    import: void;
    export: void;
    undo: void;
    redo: void;
    save: void;
}

type StatusType = 'info' | 'success' | 'error' | 'warning';

export class TitleBarComponent extends EventEmitter<TitleBarComponentEvents> {
    private container: HTMLElement;
    private core: ThemeEditorCore;
    private isClosing = false; // 防止重复关闭

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
            <!-- 统一标题栏 -->
            <div class="unified-titlebar">
                <div class="unified-titlebar-left">
                    <span class="unified-titlebar-icon">🎨</span>
                    <span class="unified-titlebar-title">LovelyTheme Editor</span>

                    <!-- 基础主题选择器 -->
                    <div class="unified-titlebar-center">
                        <label for="baseTheme" style="font-size: 12px; color: var(--text-secondary); margin-right: 8px;">基础主题:</label>
                        <select id="baseTheme" class="te-base-theme-select" style="padding: 4px 8px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-secondary); color: var(--text-primary); font-size: 12px;">
                            <option value="light">明亮主题</option>
                            <option value="dark">黑暗主题</option>
                        </select>
                    </div>
                </div>

                <div class="unified-titlebar-right">
                    <!-- 操作按钮 -->
                    <button id="previewBtn" class="unified-titlebar-btn" title="切换预览 (Ctrl+P)">
                        <span>👁️</span>
                    </button>

                    <button id="importBtn" class="unified-titlebar-btn" title="导入主题 (Ctrl+I)">
                        <span>📥</span>
                    </button>

                    <button id="exportBtn" class="unified-titlebar-btn" title="导出主题 (Ctrl+E)">
                        <span>📤</span>
                    </button>

                    <button id="applyBtn" class="unified-titlebar-btn" title="应用主题" style="background: var(--primary-color); color: var(--text-white);">
                        <span>✨</span>
                    </button>

                    <div class="unified-titlebar-separator"></div>

                    <div class="unified-window-controls">
                        <button class="unified-window-btn minimize-btn" id="minimizeBtn" title="最小化">
                            <svg width="12" height="12" viewBox="0 0 12 12">
                                <path d="M2 6h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                            </svg>
                        </button>
                        <button class="unified-window-btn maximize-btn" id="maximizeBtn" title="最大化">
                            <svg width="12" height="12" viewBox="0 0 12 12">
                                <rect x="2" y="2" width="8" height="8" stroke="currentColor" stroke-width="1.5" fill="none"/>
                            </svg>
                        </button>
                        <button class="unified-window-btn close-btn" id="closeBtn" title="关闭">
                            <svg width="12" height="12" viewBox="0 0 12 12">
                                <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>

            <!-- te-title-content已移除，功能已集成到自定义标题栏中 -->

            <div class="te-status-bar">
                <div class="te-status-info">
                    <span id="themeStatus" class="te-status-text">就绪</span>
                    <span class="te-status-separator">•</span>
                    <span id="dirtyIndicator" class="te-dirty-indicator hidden">未保存的更改</span>
                </div>

                <div class="te-status-actions">
                    <span class="te-shortcut-hint">快捷键: Ctrl+S 保存 | Ctrl+P 预览 | Ctrl+Z 撤销</span>
                </div>
            </div>
        `;

        // 设置当前基础主题
        const baseThemeSelect = this.container.querySelector<HTMLSelectElement>('#baseTheme');
        if (baseThemeSelect) {
            baseThemeSelect.value = this.core.getBaseTheme();
        }
    }

    bindEvents(): void {
        // 自定义标题栏按钮事件（包含关闭按钮）
        void this.bindTitleBarEvents();

        // 基础主题选择
        const baseThemeSelect = this.container.querySelector<HTMLSelectElement>('#baseTheme');
        if (baseThemeSelect) {
            baseThemeSelect.addEventListener('change', (e) => {
                this.core.setBaseTheme((e.target as HTMLSelectElement).value);
            });
        }

        // 操作按钮
        const previewBtn = this.container.querySelector<HTMLButtonElement>('#previewBtn');
        const importBtn = this.container.querySelector<HTMLButtonElement>('#importBtn');
        const exportBtn = this.container.querySelector<HTMLButtonElement>('#exportBtn');
        const applyBtn = this.container.querySelector<HTMLButtonElement>('#applyBtn');

        if (previewBtn) {
            previewBtn.addEventListener('click', () => {
                this.emit('togglePreview');
                this.togglePreviewButton();
            });
        }

        if (importBtn) {
            importBtn.addEventListener('click', () => {
                this.emit('import');
            });
        }

        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                this.emit('export');
            });
        }

        if (applyBtn) {
            applyBtn.addEventListener('click', async () => {
                try {
                    this.setApplyButtonLoading(true);
                    await this.core.applyTheme();
                    this.updateStatus('主题已应用', 'success');
                } catch (error) {
                    this.updateStatus('应用主题失败', 'error');
                    console.error('应用主题失败:', error);
                } finally {
                    this.setApplyButtonLoading(false);
                }
            });
        }

        // 监听核心事件
        this.core.on('themeChanged', () => {
            this.updateDirtyIndicator(true);
        });

        this.core.on('themeSaved', () => {
            this.updateDirtyIndicator(false);
            this.updateStatus('主题已保存', 'success');
        });

        this.core.on('themeApplied', () => {
            this.updateStatus('主题已应用', 'success');
        });

        this.core.on('baseThemeChanged', (baseTheme) => {
            const baseThemeSelect = this.container.querySelector<HTMLSelectElement>('#baseTheme');
            if (baseThemeSelect) {
                baseThemeSelect.value = baseTheme;
            }
        });

        this.core.on('error', ({ error }) => {
            this.updateStatus(`操作失败: ${error.message}`, 'error');
        });
    }

    // 绑定自定义标题栏事件
    async bindTitleBarEvents(): Promise<void> {
        try {
            // 检查是否在Tauri环境中
            if (typeof (window as any).__TAURI__ === 'undefined') {
                console.log('非Tauri环境，使用模拟窗口控制');
                this.bindMockWindowControls();
                return;
            }

            // Tauri v2 API
            const { getCurrentWindow } = await import('@tauri-apps/api/window');
            const appWindow = getCurrentWindow();

            // 最小化按钮
            const minimizeBtn = this.container.querySelector<HTMLButtonElement>('#minimizeBtn');
            if (minimizeBtn) {
                minimizeBtn.addEventListener('click', async () => {
                    try {
                        await appWindow.minimize();
                    } catch (error) {
                        console.error('最小化窗口失败:', error);
                    }
                });
            }

            // 最大化/还原按钮
            const maximizeBtn = this.container.querySelector<HTMLButtonElement>('#maximizeBtn');
            if (maximizeBtn) {
                maximizeBtn.addEventListener('click', async () => {
                    try {
                        const isMaximized = await appWindow.isMaximized();
                        if (isMaximized) {
                            await appWindow.unmaximize();
                        } else {
                            await appWindow.maximize();
                        }
                        this.updateMaximizeButton(!isMaximized);
                    } catch (error) {
                        console.error('切换窗口状态失败:', error);
                    }
                });
            }

            // 关闭按钮
            const closeBtn = this.container.querySelector<HTMLButtonElement>('#closeBtn');
            if (closeBtn) {
                closeBtn.addEventListener('click', async () => {
                    // 防止重复触发
                    if (this.isClosing) {
                        console.log('窗口正在关闭中，忽略重复点击');
                        return;
                    }

                    this.isClosing = true;

                    try {
                        // 检查是否有未保存的更改
                        if (this.core.isDirtyState()) {
                            const result = confirm('检测到未保存的主题更改！\n\n点击"确定"：保存主题后关闭\n点击"取消"：放弃更改直接关闭');
                            if (result) {
                                // 保存主题
                                try {
                                    await this.core.saveTheme('auto_save_' + Date.now());
                                    console.log('主题已保存，正在关闭窗口...');
                                } catch (saveError) {
                                    console.error('保存主题失败:', saveError);
                                    const forceClose = confirm('保存失败，是否强制关闭？');
                                    if (!forceClose) {
                                        this.isClosing = false;
                                        return;
                                    }
                                }
                            }
                        }

                        // 关闭窗口 - 添加超时保护
                        const closePromise = appWindow.close();
                        const timeoutPromise = new Promise<never>((_resolve, reject) => {
                            setTimeout(() => reject(new Error('关闭超时')), 3000);
                        });

                        await Promise.race([closePromise, timeoutPromise]);

                    } catch (error) {
                        console.error('关闭窗口失败:', error);

                        // 如果是无效句柄错误，直接尝试强制关闭
                        const message = (error as Error).message;
                        if (message.includes('无效的窗口句柄') || message.includes('Invalid window handle')) {
                            console.log('检测到无效窗口句柄，尝试强制关闭');
                            try {
                                window.close();
                            } catch (browserError) {
                                console.log('浏览器关闭也失败，窗口可能已经关闭');
                            }
                        } else {
                            // 其他错误，尝试浏览器API
                            try {
                                window.close();
                            } catch (browserError) {
                                console.error('浏览器关闭失败:', browserError);
                                alert('无法关闭窗口，请手动关闭');
                            }
                        }
                    } finally {
                        this.isClosing = false;
                    }
                });
            }

            // 监听窗口状态变化 - Tauri v2
            try {
                const { listen } = await import('@tauri-apps/api/event');
                await listen('tauri://resize', async () => {
                    try {
                        const isMaximized = await appWindow.isMaximized();
                        this.updateMaximizeButton(isMaximized);
                    } catch (error) {
                        console.error('获取窗口状态失败:', error);
                    }
                });
            } catch (error) {
                console.warn('监听窗口事件失败:', error);
            }

        } catch (error) {
            console.warn('Tauri API不可用，使用模拟窗口控制:', error);
            this.bindMockWindowControls();
        }
    }

    // 模拟窗口控制（用于非Tauri环境）
    bindMockWindowControls(): void {
        // 最小化按钮
        const minimizeBtn = this.container.querySelector<HTMLButtonElement>('#minimizeBtn');
        if (minimizeBtn) {
            minimizeBtn.addEventListener('click', () => {
                console.log('模拟最小化窗口');
                this.showToast('模拟最小化窗口', 'info');
            });
        }

        // 最大化/还原按钮
        const maximizeBtn = this.container.querySelector<HTMLButtonElement>('#maximizeBtn');
        if (maximizeBtn) {
            let isMaximized = false;
            maximizeBtn.addEventListener('click', () => {
                isMaximized = !isMaximized;
                console.log(isMaximized ? '模拟最大化窗口' : '模拟还原窗口');
                this.showToast(isMaximized ? '模拟最大化窗口' : '模拟还原窗口', 'info');
                this.updateMaximizeButton(isMaximized);

                // 模拟全屏效果
                if (isMaximized) {
                    document.body.style.margin = '0';
                    document.body.style.padding = '0';
                } else {
                    document.body.style.margin = '';
                    document.body.style.padding = '';
                }
            });
        }

        // 关闭按钮 (模拟环境)
        const closeBtn = this.container.querySelector<HTMLButtonElement>('#closeBtn');
        if (closeBtn) {
            closeBtn.addEventListener('click', async () => {
                // 防止重复触发
                if (this.isClosing) {
                    console.log('窗口正在关闭中，忽略重复点击');
                    return;
                }

                this.isClosing = true;

                try {
                    // 检查是否有未保存的更改
                    if (this.core.isDirtyState()) {
                        const result = confirm('检测到未保存的主题更改！\n\n点击"确定"：保存主题后关闭\n点击"取消"：放弃更改直接关闭');
                        if (result) {
                            // 保存主题
                            try {
                                await this.core.saveTheme('auto_save_' + Date.now());
                                this.showToast('主题已保存', 'success');
                                console.log('主题已保存，正在关闭窗口...');
                            } catch (saveError) {
                                console.error('保存主题失败:', saveError);
                                this.showToast('保存失败: ' + (saveError as Error).message, 'error');
                                const forceClose = confirm('保存失败，是否强制关闭？');
                                if (!forceClose) {
                                    this.isClosing = false;
                                    return;
                                }
                            }
                        }
                    }

                    // 最终确认关闭
                    const shouldClose = confirm('确定要关闭主题编辑器吗？');
                    if (shouldClose) {
                        console.log('正在关闭窗口...');
                        this.showToast('正在关闭窗口...', 'info');

                        // 尝试关闭窗口
                        try {
                            window.close();
                        } catch (error) {
                            console.log('无法使用window.close()，模拟关闭');
                            this.showToast('在实际应用中，窗口将被关闭', 'info');

                            // 模拟关闭效果
                            setTimeout(() => {
                                document.body.style.opacity = '0';
                                document.body.style.transform = 'scale(0.9)';
                                document.body.style.transition = 'all 0.3s ease-out';

                                setTimeout(() => {
                                    alert('模拟环境：窗口已关闭\n在实际应用中，窗口将被关闭');
                                    // 重置样式
                                    document.body.style.opacity = '';
                                    document.body.style.transform = '';
                                    document.body.style.transition = '';
                                }, 300);
                            }, 500);
                        }
                    }
                } catch (error) {
                    console.error('关闭窗口过程中发生错误:', error);
                    this.showToast('关闭失败: ' + (error as Error).message, 'error');
                } finally {
                    this.isClosing = false;
                }
            });
        }
    }

    // 显示提示消息
    showToast(message: string, type: StatusType = 'info'): void {
        // 简单的提示实现
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            top: 60px;
            right: 20px;
            background: ${type === 'success' ? '#4ecdc4' : type === 'error' ? '#ff5252' : '#42a5f5'};
            color: white;
            padding: 8px 12px;
            border-radius: 6px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            z-index: 2000;
            font-size: 12px;
            max-width: 250px;
            animation: slideIn 0.3s ease-out;
        `;

        // 添加动画
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);

        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            if (toast.parentNode) {
                toast.style.animation = 'slideIn 0.3s ease-out reverse';
                setTimeout(() => {
                    if (toast.parentNode) {
                        toast.parentNode.removeChild(toast);
                    }
                }, 300);
            }
            if (style.parentNode) {
                style.parentNode.removeChild(style);
            }
        }, 2000);
    }

    // 更新最大化按钮图标
    updateMaximizeButton(isMaximized: boolean): void {
        const maximizeBtn = this.container.querySelector<HTMLButtonElement>('#maximizeBtn');
        if (!maximizeBtn) return;

        const svg = maximizeBtn.querySelector('svg');
        if (!svg) return;
        if (isMaximized) {
            // 还原图标 - 双重窗口
            svg.innerHTML = `
                <rect x="3" y="3" width="6" height="6" stroke="currentColor" stroke-width="1" fill="none"/>
                <rect x="5" y="1" width="6" height="6" stroke="currentColor" stroke-width="1" fill="none"/>
            `;
            maximizeBtn.title = '还原';
        } else {
            // 最大化图标 - 单个窗口
            svg.innerHTML = `
                <rect x="2" y="2" width="8" height="8" stroke="currentColor" stroke-width="1" fill="none"/>
            `;
            maximizeBtn.title = '最大化';
        }
    }

    // 更新历史按钮状态 - 已移除历史按钮，保留方法以避免错误
    updateHistoryButtons(historyState: HistoryState): void {
        // 历史按钮已集成到其他地方或移除，此方法保留以避免调用错误
        console.log('历史状态更新:', historyState);
    }

    // 切换预览按钮状态
    togglePreviewButton(): void {
        const previewBtn = this.container.querySelector<HTMLButtonElement>('#previewBtn');
        if (!previewBtn) return;
        const isActive = previewBtn.classList.contains('active');

        if (isActive) {
            previewBtn.classList.remove('active');
            previewBtn.title = '显示预览 (Ctrl+P)';
        } else {
            previewBtn.classList.add('active');
            previewBtn.title = '隐藏预览 (Ctrl+P)';
        }
    }

    // 设置应用按钮加载状态
    setApplyButtonLoading(loading: boolean): void {
        const applyBtn = this.container.querySelector<HTMLButtonElement>('#applyBtn');
        if (!applyBtn) return;
        const btnIcon = applyBtn.querySelector<HTMLElement>('.te-btn-icon');
        const btnText = applyBtn.querySelector<HTMLElement>('.te-btn-text');

        if (loading) {
            applyBtn.disabled = true;
            applyBtn.classList.add('loading');
            if (btnIcon) btnIcon.textContent = '⏳';
            if (btnText) btnText.textContent = '应用中...';
        } else {
            applyBtn.disabled = false;
            applyBtn.classList.remove('loading');
            if (btnIcon) btnIcon.textContent = '✨';
            if (btnText) btnText.textContent = '应用主题';
        }
    }

    // 更新脏数据指示器
    updateDirtyIndicator(isDirty: boolean): void {
        const dirtyIndicator = this.container.querySelector<HTMLElement>('#dirtyIndicator');

        if (dirtyIndicator) {
            if (isDirty) {
                dirtyIndicator.classList.remove('hidden');
            } else {
                dirtyIndicator.classList.add('hidden');
            }
        }
    }

    // 更新状态信息
    updateStatus(message: string, type: StatusType = 'info'): void {
        const themeStatus = this.container.querySelector<HTMLElement>('#themeStatus');

        if (themeStatus) {
            themeStatus.textContent = message;
            themeStatus.className = `te-status-text ${type}`;

            // 自动清除状态信息
            if (type !== 'info') {
                setTimeout(() => {
                    themeStatus.textContent = '就绪';
                    themeStatus.className = 'te-status-text';
                }, 3000);
            }
        } else {
            // 如果没有状态栏，使用控制台输出
            console.log(`状态更新 [${type}]: ${message}`);
        }
    }

    // 设置预览按钮状态
    setPreviewActive(active: boolean): void {
        const previewBtn = this.container.querySelector<HTMLButtonElement>('#previewBtn');
        if (!previewBtn) return;

        if (active) {
            previewBtn.classList.add('active');
            previewBtn.title = '隐藏预览 (Ctrl+P)';
        } else {
            previewBtn.classList.remove('active');
            previewBtn.title = '显示预览 (Ctrl+P)';
        }
    }

    // 更新组件
    update(): void {
        // 更新基础主题选择器
        const baseThemeSelect = this.container.querySelector<HTMLSelectElement>('#baseTheme');
        if (baseThemeSelect) {
            baseThemeSelect.value = this.core.getBaseTheme();
        }

        // 更新脏数据指示器
        this.updateDirtyIndicator(this.core.isDirtyState());
    }

    // 销毁组件
    destroy(): void {
        this.removeAllListeners();
        this.container.innerHTML = '';
    }
}
