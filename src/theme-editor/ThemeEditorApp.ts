/**
 * 主题编辑器应用程序
 * 新的模块化主题编辑器入口
 */

import { ThemeEditorCore } from './core/ThemeEditorCore';
import { ThemePresetManager } from './presets/ThemePresetManager';
import { UIComponentManager } from './components/UIComponentManager';
import { ConfigManager } from './config/ConfigManager';
import type { ThemeData, ThemeConfig } from './utils/ThemeValidator';
import type { ExportOptions } from './config/ConfigManager';

/** 应用状态 */
interface AppState {
    initialized: boolean;
    core?: {
        currentTheme: ThemeData | null;
        baseTheme: string;
        isDirty: boolean;
        canUndo: boolean;
        canRedo: boolean;
    };
    ui?: ReturnType<UIComponentManager['getState']>;
    presets?: {
        count: number;
        categories: number;
    };
}

/** 版本信息 */
interface VersionInfo {
    version: string;
    name: string;
    description: string;
    author: string;
    buildDate: string;
}

export class ThemeEditorApp {
    private core: ThemeEditorCore | null = null;
    private presetManager: ThemePresetManager | null = null;
    private uiManager: UIComponentManager | null = null;
    private configManager: ConfigManager | null = null;

    private isInitialized = false;
    private container: HTMLElement | null = null;

    constructor() {
        void this.init();
    }

    async init(): Promise<void> {
        try {
            console.log('🎨 初始化主题编辑器...');

            // 等待DOM加载完成
            if (document.readyState === 'loading') {
                await new Promise<void>(resolve => {
                    document.addEventListener('DOMContentLoaded', () => resolve());
                });
            }

            // 获取容器
            this.container = document.getElementById('app');
            if (!this.container) {
                throw new Error('未找到应用容器元素 #app');
            }

            // 初始化核心模块
            await this.initializeCore();

            // 初始化预设管理器
            await this.initializePresetManager();

            // 初始化配置管理器
            await this.initializeConfigManager();

            // 初始化UI管理器
            await this.initializeUIManager();

            // 绑定全局事件
            this.bindGlobalEvents();

            this.isInitialized = true;
            console.log('✅ 主题编辑器初始化完成');

            // 隐藏加载屏幕
            this.hideLoadingScreen();

        } catch (error) {
            console.error('❌ 主题编辑器初始化失败:', error);
            this.showErrorMessage('主题编辑器初始化失败: ' + (error as Error).message);
            this.hideLoadingScreen();
        }
    }

    async initializeCore(): Promise<void> {
        console.log('📦 初始化核心管理器...');

        this.core = new ThemeEditorCore();

        // 等待核心初始化完成
        await new Promise<void>((resolve, reject) => {
            this.core!.once('initialized', () => resolve());
            this.core!.once('error', (data) => reject(data.error));
        });

        console.log('✅ 核心管理器初始化完成');
    }

    async initializePresetManager(): Promise<void> {
        console.log('🎨 初始化预设管理器...');

        this.presetManager = new ThemePresetManager();

        // 等待预设管理器初始化完成
        await new Promise<void>((resolve, reject) => {
            this.presetManager!.once('initialized', () => resolve());
            this.presetManager!.once('error', (error) => reject(error));
        });

        console.log('✅ 预设管理器初始化完成');
    }

    async initializeConfigManager(): Promise<void> {
        console.log('⚙️ 初始化配置管理器...');

        this.configManager = new ConfigManager();

        // 等待配置管理器初始化完成
        await new Promise<void>((resolve, reject) => {
            this.configManager!.once('initialized', () => resolve());
            this.configManager!.once('error', (data) => reject(data.error));

            // 添加超时处理
            setTimeout(() => {
                console.warn('配置管理器初始化超时，继续执行...');
                resolve();
            }, 2000);
        });

        console.log('✅ 配置管理器初始化完成');
    }

    async initializeUIManager(): Promise<void> {
        console.log('🖼️ 初始化UI管理器...');

        this.uiManager = new UIComponentManager(
            this.container!,
            this.core!,
            this.presetManager!
        );

        // 等待UI管理器初始化完成
        await new Promise<void>((resolve, reject) => {
            this.uiManager!.once('initialized', () => resolve());
            this.uiManager!.once('error', (data) => reject(data.error));

            // 添加超时处理
            setTimeout(() => {
                console.warn('UI管理器初始化超时，继续执行...');
                resolve();
            }, 3000);
        });

        console.log('✅ UI管理器初始化完成');
    }

    bindGlobalEvents(): void {
        // 窗口大小变化事件
        window.addEventListener('resize', () => {
            if (this.uiManager) {
                this.uiManager.handleResize();
            }
        });

        // 键盘快捷键事件
        document.addEventListener('keydown', (e) => {
            if (this.uiManager) {
                this.uiManager.handleKeyboard(e);
            }
        });

        // 页面卸载前保存提醒
        window.addEventListener('beforeunload', (e) => {
            if (this.core && this.core.isDirtyState()) {
                e.preventDefault();
                e.returnValue = '您有未保存的更改，确定要离开吗？';
                return e.returnValue;
            }
        });

        // 监听核心事件
        if (this.core) {
            this.core.on('error', (error) => {
                console.error('核心错误:', error);
                this.showErrorMessage('操作失败: ' + error.error.message);
            });

            this.core.on('themeSaved', (data) => {
                console.log('主题已保存:', data.name);
                this.showSuccessMessage(`主题 "${data.name}" 保存成功`);
            });

            this.core.on('themeApplied', () => {
                console.log('主题已应用');
                this.showSuccessMessage('主题应用成功');
            });
        }

        // 监听预设管理器事件
        if (this.presetManager) {
            this.presetManager.on('error', (error) => {
                console.error('预设管理器错误:', error);
                this.showErrorMessage('预设操作失败: ' + error.message);
            });
        }

        // 监听配置管理器事件
        if (this.configManager) {
            this.configManager.on('error', (error) => {
                console.error('配置管理器错误:', error);
                this.showErrorMessage('配置操作失败: ' + error.error.message);
            });
        }

        // 监听UI管理器事件
        if (this.uiManager) {
            this.uiManager.on('error', (error) => {
                console.error('UI管理器错误:', error);
                this.showErrorMessage('界面操作失败: ' + error.error.message);
            });
        }
    }

    // 隐藏加载屏幕
    hideLoadingScreen(): void {
        const loadingScreen = document.querySelector<HTMLElement>('.loading-screen');
        if (loadingScreen) {
            loadingScreen.style.opacity = '0';
            setTimeout(() => {
                loadingScreen.style.display = 'none';
            }, 300);
        }
    }

    // 显示错误消息
    showErrorMessage(message: string): void {
        if (this.uiManager) {
            this.uiManager.showToast(message, 'error', 5000);
        } else {
            alert('错误: ' + message);
        }
    }

    // 显示成功消息
    showSuccessMessage(message: string): void {
        if (this.uiManager) {
            this.uiManager.showToast(message, 'success', 3000);
        } else {
            console.log('成功: ' + message);
        }
    }

    // 显示信息消息
    showInfoMessage(message: string): void {
        if (this.uiManager) {
            this.uiManager.showToast(message, 'info', 3000);
        } else {
            console.log('信息: ' + message);
        }
    }

    // 获取应用状态
    getState(): AppState {
        if (!this.isInitialized || !this.core || !this.uiManager || !this.presetManager) {
            return { initialized: false };
        }

        return {
            initialized: true,
            core: {
                currentTheme: this.core.getCurrentTheme(),
                baseTheme: this.core.getBaseTheme(),
                isDirty: this.core.isDirtyState(),
                canUndo: this.core.canUndo(),
                canRedo: this.core.canRedo()
            },
            ui: this.uiManager.getState(),
            presets: {
                count: this.presetManager.getAllPresets().length,
                categories: this.presetManager.getCategories().length
            }
        };
    }

    // 重置应用
    async reset(): Promise<void> {
        try {
            if (this.core) {
                const defaultTheme = this.core.getDefaultTheme();
                this.core.setTheme(defaultTheme);
                this.showInfoMessage('主题已重置为默认设置');
            }
        } catch (error) {
            console.error('重置失败:', error);
            this.showErrorMessage('重置失败: ' + (error as Error).message);
        }
    }

    // 导入主题
    async importTheme(data: string | ThemeConfig | ThemeData, format = 'json'): Promise<void> {
        try {
            const themeData = await this.configManager!.importConfig(data, format);
            this.core!.importTheme(themeData);
            this.showSuccessMessage('主题导入成功');
        } catch (error) {
            console.error('导入失败:', error);
            this.showErrorMessage('导入失败: ' + (error as Error).message);
        }
    }

    // 导出主题
    exportTheme(format = 'json', options: ExportOptions = {}): string | null {
        try {
            const themeData = this.core!.exportTheme();
            return this.configManager!.exportConfig(themeData, format, options);
        } catch (error) {
            console.error('导出失败:', error);
            this.showErrorMessage('导出失败: ' + (error as Error).message);
            return null;
        }
    }

    // 应用预设主题
    applyPreset(presetId: string): void {
        try {
            const preset = this.presetManager!.getPreset(presetId);
            if (!preset) {
                throw new Error('预设不存在');
            }

            this.core!.setTheme(preset.theme);
            this.showSuccessMessage(`已应用预设主题: ${preset.name}`);
        } catch (error) {
            console.error('应用预设失败:', error);
            this.showErrorMessage('应用预设失败: ' + (error as Error).message);
        }
    }

    // 销毁应用
    destroy(): void {
        console.log('🗑️ 销毁主题编辑器...');

        // 销毁各个管理器
        if (this.uiManager) {
            this.uiManager.destroy();
            this.uiManager = null;
        }

        if (this.configManager) {
            this.configManager.destroy();
            this.configManager = null;
        }

        if (this.presetManager) {
            this.presetManager.removeAllListeners();
            this.presetManager = null;
        }

        if (this.core) {
            this.core.removeAllListeners();
            this.core = null;
        }

        // 清空容器
        if (this.container) {
            this.container.innerHTML = '';
            this.container = null;
        }

        this.isInitialized = false;
        console.log('✅ 主题编辑器已销毁');
    }

    // 获取版本信息
    getVersion(): VersionInfo {
        return {
            version: '2.0.0',
            name: 'LovelyTheme Editor',
            description: '模块化主题编辑器',
            author: 'Lovelymem V2 Team',
            buildDate: new Date().toISOString()
        };
    }
}

// 创建全局实例
let themeEditorApp: ThemeEditorApp | null = null;

// 自动初始化
document.addEventListener('DOMContentLoaded', () => {
    try {
        themeEditorApp = new ThemeEditorApp();

        // 将实例暴露到全局作用域（用于调试）
        if (typeof window !== 'undefined') {
            (window as any).themeEditorApp = themeEditorApp;
        }

    } catch (error) {
        console.error('主题编辑器启动失败:', error);
    }
});

// 导出应用类
export default ThemeEditorApp;
