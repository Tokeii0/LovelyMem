/**
 * UI组件管理器
 * 管理主题编辑器的所有UI组件
 */

import { EventEmitter, type EventMap } from '../utils/EventEmitter';
import type { ThemeEditorCore } from '../core/ThemeEditorCore';
import type { ThemePresetManager } from '../presets/ThemePresetManager';
import { TitleBarComponent } from './TitleBarComponent';
import { SidebarComponent } from './SidebarComponent';
import { EditorAreaComponent } from './EditorAreaComponent';
import { PreviewPanelComponent } from './PreviewPanelComponent';
import { DialogManager } from './DialogManager';
import { ToastManager, type ToastType } from './ToastManager';

export interface UIComponentManagerEvents extends EventMap {
    initialized: void;
    error: { type: string; error: Error };
    previewToggled: boolean;
}

/** UI 组件共有的接口（部分能力为可选） */
interface UIComponent {
    update?(): void;
    destroy?(): void;
    handleResize?(): void;
}

/** 管理器当前状态 */
interface UIState {
    currentCategory: string;
    isPreviewVisible: boolean;
    components: string[];
}

export class UIComponentManager extends EventEmitter<UIComponentManagerEvents> {
    private container: HTMLElement;
    private core: ThemeEditorCore;
    private presetManager: ThemePresetManager;

    // 组件实例
    private components: Map<string, UIComponent> = new Map();
    private dialogManager: DialogManager | null = null;
    private toastManager: ToastManager | null = null;

    // 当前状态
    private currentCategory = 'colors';
    private isPreviewVisible = false;

    constructor(container: HTMLElement, core: ThemeEditorCore, presetManager: ThemePresetManager) {
        super();

        this.container = container;
        this.core = core;
        this.presetManager = presetManager;

        void this.init();
    }

    async init(): Promise<void> {
        try {
            console.log('🖼️ 创建主布局...');
            this.createMainLayout();

            console.log('🔧 初始化组件...');
            this.initializeComponents();

            console.log('🔗 绑定事件...');
            this.bindEvents();

            console.log('✅ UI组件管理器初始化完成');
            this.emit('initialized');
        } catch (error) {
            console.error('UI组件管理器初始化失败:', error);
            this.emit('error', { type: 'ui-init', error: error as Error });
        }
    }

    createMainLayout(): void {
        this.container.innerHTML = `
            <div class="te-app">
                <div id="te-title-bar" class="te-title-bar"></div>
                <div class="te-main-content">
                    <div id="te-sidebar" class="te-sidebar"></div>
                    <div id="te-editor-area" class="te-editor-area"></div>
                    <div id="te-preview-panel" class="te-preview-panel ${this.isPreviewVisible ? 'visible' : 'hidden'}"></div>
                </div>
                <div id="te-dialogs" class="te-dialogs"></div>
                <div id="te-toasts" class="te-toasts"></div>
            </div>
        `;
    }

    initializeComponents(): void {
        // 标题栏组件
        const titleBarElement = this.container.querySelector<HTMLElement>('#te-title-bar')!;
        this.components.set('titleBar', new TitleBarComponent(titleBarElement, this.core));

        // 侧边栏组件
        const sidebarElement = this.container.querySelector<HTMLElement>('#te-sidebar')!;
        this.components.set('sidebar', new SidebarComponent(sidebarElement, this.core));

        // 编辑区域组件
        const editorAreaElement = this.container.querySelector<HTMLElement>('#te-editor-area')!;
        this.components.set('editorArea', new EditorAreaComponent(editorAreaElement, this.core, this.presetManager));

        // 预览面板组件
        const previewPanelElement = this.container.querySelector<HTMLElement>('#te-preview-panel')!;
        this.components.set('previewPanel', new PreviewPanelComponent(previewPanelElement, this.core));

        // 对话框管理器
        const dialogsElement = this.container.querySelector<HTMLElement>('#te-dialogs')!;
        this.dialogManager = new DialogManager(dialogsElement, this.core);

        // 提示管理器
        const toastsElement = this.container.querySelector<HTMLElement>('#te-toasts')!;
        this.toastManager = new ToastManager(toastsElement);
    }

    private getTitleBar(): TitleBarComponent | undefined {
        return this.components.get('titleBar') as TitleBarComponent | undefined;
    }

    private getSidebar(): SidebarComponent | undefined {
        return this.components.get('sidebar') as SidebarComponent | undefined;
    }

    private getEditorArea(): EditorAreaComponent | undefined {
        return this.components.get('editorArea') as EditorAreaComponent | undefined;
    }

    private getPreviewPanel(): PreviewPanelComponent | undefined {
        return this.components.get('previewPanel') as PreviewPanelComponent | undefined;
    }

    bindEvents(): void {
        // 监听核心事件
        this.core.on('themeChanged', () => {
            this.updateAllComponents();
        });

        this.core.on('baseThemeChanged', () => {
            this.updateAllComponents();
        });

        this.core.on('historyChanged', (historyState) => {
            this.getTitleBar()?.updateHistoryButtons(historyState);
        });

        // 监听组件事件
        this.getSidebar()?.on('categoryChanged', (category) => {
            this.currentCategory = category;
            this.getEditorArea()?.switchCategory(category);
        });

        this.getTitleBar()?.on('togglePreview', () => {
            this.togglePreview();
        });

        this.getTitleBar()?.on('undo', () => {
            this.core.undo();
        });

        this.getTitleBar()?.on('redo', () => {
            this.core.redo();
        });

        this.getTitleBar()?.on('save', () => {
            this.showSaveDialog();
        });

        this.getTitleBar()?.on('export', () => {
            this.showExportDialog();
        });

        this.getTitleBar()?.on('import', () => {
            this.showImportDialog();
        });

        this.getEditorArea()?.on('variableChanged', ({ key, value }) => {
            this.core.updateThemeVariable(key, value);
        });

        this.getEditorArea()?.on('presetSelected', (presetId) => {
            const preset = this.presetManager.getPreset(presetId);
            if (preset) {
                this.core.setTheme(preset.theme);
                this.showToast(`已应用预设主题：${preset.name}`, 'success');
            }
        });

        // 监听预设管理器事件
        this.presetManager.on('presetAdded', (preset) => {
            this.getEditorArea()?.refreshPresets();
            this.showToast(`预设主题 "${preset.name}" 已添加`, 'success');
        });

        this.presetManager.on('presetDeleted', ({ preset }) => {
            this.getEditorArea()?.refreshPresets();
            this.showToast(`预设主题 "${preset.name}" 已删除`, 'info');
        });
    }

    // 更新所有组件
    updateAllComponents(): void {
        this.components.forEach(component => {
            if (component.update) {
                component.update();
            }
        });

        if (this.isPreviewVisible) {
            this.getPreviewPanel()?.updatePreview();
        }
    }

    // 切换预览面板
    togglePreview(): void {
        this.isPreviewVisible = !this.isPreviewVisible;
        const previewPanel = this.container.querySelector<HTMLElement>('#te-preview-panel');
        if (!previewPanel) return;

        if (this.isPreviewVisible) {
            previewPanel.classList.remove('hidden');
            previewPanel.classList.add('visible');
            this.getPreviewPanel()?.show();
        } else {
            previewPanel.classList.remove('visible');
            previewPanel.classList.add('hidden');
            this.getPreviewPanel()?.hide();
        }

        this.emit('previewToggled', this.isPreviewVisible);
    }

    // 显示保存对话框
    showSaveDialog(): void {
        this.dialogManager?.showSaveDialog();
    }

    // 显示导出对话框
    showExportDialog(): void {
        const themeData = this.core.exportTheme();
        this.dialogManager?.showExportDialog(themeData);
    }

    // 显示导入对话框
    showImportDialog(): void {
        this.dialogManager?.showImportDialog();
    }

    // 显示提示消息
    showToast(message: string, type: ToastType = 'info', duration = 3000): void {
        this.toastManager?.show(message, type, duration);
    }

    // 显示确认对话框
    showConfirmDialog(title: string, message: string, onConfirm?: () => void, onCancel?: () => void): void {
        this.dialogManager?.showConfirmDialog(title, message, onConfirm, onCancel);
    }

    // 获取组件
    getComponent(name: string): UIComponent | undefined {
        return this.components.get(name);
    }

    // 获取对话框管理器
    getDialogManager(): DialogManager | null {
        return this.dialogManager;
    }

    // 获取提示管理器
    getToastManager(): ToastManager | null {
        return this.toastManager;
    }

    // 设置当前分类
    setCurrentCategory(category: string): void {
        this.currentCategory = category;
        this.getSidebar()?.setActiveCategory(category);
        this.getEditorArea()?.switchCategory(category);
    }

    // 获取当前分类
    getCurrentCategory(): string {
        return this.currentCategory;
    }

    // 刷新UI
    refresh(): void {
        this.updateAllComponents();
    }

    // 销毁组件
    destroy(): void {
        // 移除事件监听器
        this.removeAllListeners();

        // 销毁所有组件
        this.components.forEach(component => {
            if (component.destroy) {
                component.destroy();
            }
        });

        this.components.clear();

        // 销毁管理器
        if (this.dialogManager) {
            this.dialogManager.destroy();
        }

        if (this.toastManager) {
            this.toastManager.destroy();
        }

        // 清空容器
        this.container.innerHTML = '';
    }

    // 响应式布局调整
    handleResize(): void {
        this.components.forEach(component => {
            if (component.handleResize) {
                component.handleResize();
            }
        });
    }

    // 键盘快捷键处理
    handleKeyboard(event: KeyboardEvent): void {
        const { ctrlKey, metaKey, key } = event;
        const isCtrl = ctrlKey || metaKey;

        if (isCtrl) {
            switch (key.toLowerCase()) {
                case 'z':
                    event.preventDefault();
                    if (event.shiftKey) {
                        this.core.redo();
                    } else {
                        this.core.undo();
                    }
                    break;
                case 'y':
                    event.preventDefault();
                    this.core.redo();
                    break;
                case 's':
                    event.preventDefault();
                    this.showSaveDialog();
                    break;
                case 'e':
                    event.preventDefault();
                    this.showExportDialog();
                    break;
                case 'i':
                    event.preventDefault();
                    this.showImportDialog();
                    break;
                case 'p':
                    event.preventDefault();
                    this.togglePreview();
                    break;
            }
        }

        // ESC键关闭对话框
        if (key === 'Escape') {
            this.dialogManager?.closeAll();
        }
    }

    // 获取当前状态
    getState(): UIState {
        return {
            currentCategory: this.currentCategory,
            isPreviewVisible: this.isPreviewVisible,
            components: Array.from(this.components.keys())
        };
    }

    // 设置状态
    setState(state: Partial<UIState>): void {
        if (state.currentCategory) {
            this.setCurrentCategory(state.currentCategory);
        }

        if (typeof state.isPreviewVisible === 'boolean' && state.isPreviewVisible !== this.isPreviewVisible) {
            this.togglePreview();
        }
    }
}
