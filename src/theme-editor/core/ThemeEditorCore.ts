/**
 * 主题编辑器核心管理器
 * 负责主题数据管理、状态管理和业务逻辑
 */

import { EventEmitter, type EventMap } from '../utils/EventEmitter';
import { ThemeValidator, type ThemeData, type ThemeConfig } from '../utils/ThemeValidator';

/** 主题变量值类型 */
export type ThemeVariableType =
    | 'color'
    | 'gradient'
    | 'font-family'
    | 'size'
    | 'shadow'
    | 'transition';

/** 单个主题变量定义 */
export interface ThemeVariable {
    key: string;
    name: string;
    type: ThemeVariableType;
    default: string;
}

/** 主题分类定义 */
export interface ThemeCategory {
    name: string;
    icon: string;
    description: string;
    variables: ThemeVariable[];
}

/** 所有主题分类的集合 */
export type ThemeCategories = Record<string, ThemeCategory>;

/** 历史变更通知数据 */
export interface HistoryState {
    canUndo: boolean;
    canRedo: boolean;
}

/** 主题保存事件数据 */
export interface ThemeSavedData {
    name: string;
    theme: ThemeData;
}

/** 错误事件数据 */
export interface CoreErrorData {
    type: string;
    error: Error;
}

/** ThemeEditorCore 触发的事件 */
export interface ThemeEditorCoreEvents extends EventMap {
    initialized: void;
    error: CoreErrorData;
    themeChanged: ThemeData;
    variableChanged: { key: string; value: string };
    historyChanged: HistoryState;
    themeSaved: ThemeSavedData;
    themeApplied: ThemeData;
    themeImported: ThemeConfig;
    baseThemeChanged: string;
}

type ToastType = 'info' | 'success' | 'error' | 'warning';

export class ThemeEditorCore extends EventEmitter<ThemeEditorCoreEvents> {
    private currentTheme: ThemeData | null = null;
    private baseTheme = 'light';
    private isDirty = false;
    private history: ThemeData[] = [];
    private historyIndex = -1;
    private maxHistorySize = 50;

    // 主题变量分类
    private themeCategories: ThemeCategories;

    constructor() {
        super();

        // 主题变量分类
        this.themeCategories = this.initializeCategories();

        void this.init();
    }

    async init(): Promise<void> {
        try {
            await this.loadCurrentTheme();
            this.emit('initialized');
        } catch (error) {
            console.error('主题编辑器核心初始化失败:', error);
            this.emit('error', { type: 'init', error: error as Error });
        }
    }

    initializeCategories(): ThemeCategories {
        return {
            colors: {
                name: '颜色配置',
                icon: '🎨',
                description: '主要颜色、状态颜色等',
                variables: [
                    { key: 'primary-color', name: '主色调', type: 'color', default: '#667eea' },
                    { key: 'secondary-color', name: '次要色', type: 'color', default: '#764ba2' },
                    { key: 'accent-color', name: '强调色', type: 'color', default: '#f093fb' },
                    { key: 'success-color', name: '成功色', type: 'color', default: '#4ecdc4' },
                    { key: 'warning-color', name: '警告色', type: 'color', default: '#ffa726' },
                    { key: 'error-color', name: '错误色', type: 'color', default: '#ff5252' },
                    { key: 'info-color', name: '信息色', type: 'color', default: '#42a5f5' }
                ]
            },
            backgrounds: {
                name: '背景配置',
                icon: '🖼️',
                description: '背景颜色、渐变、图片等',
                variables: [
                    { key: 'bg-primary', name: '主背景', type: 'color', default: '#f8fafc' },
                    { key: 'bg-secondary', name: '次背景', type: 'color', default: '#ffffff' },
                    { key: 'bg-tertiary', name: '第三背景', type: 'color', default: '#f1f5f9' },
                    { key: 'bg-dark', name: '深色背景', type: 'color', default: '#1e293b' },
                    { key: 'bg-glass', name: '玻璃效果', type: 'color', default: 'rgba(255, 255, 255, 0.1)' },
                    { key: 'bg-overlay', name: '遮罩背景', type: 'color', default: 'rgba(0, 0, 0, 0.5)' }
                ]
            },
            gradients: {
                name: '渐变配置',
                icon: '🌈',
                description: '渐变背景和效果',
                variables: [
                    { key: 'gradient-primary', name: '主渐变', type: 'gradient', default: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
                    { key: 'gradient-secondary', name: '次渐变', type: 'gradient', default: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
                    { key: 'gradient-accent', name: '强调渐变', type: 'gradient', default: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' }
                ]
            },
            typography: {
                name: '字体配置',
                icon: '📝',
                description: '字体、字号、行高等',
                variables: [
                    { key: 'font-family-primary', name: '主字体', type: 'font-family', default: '"Inter", "Noto Sans SC", sans-serif' },
                    { key: 'font-family-mono', name: '等宽字体', type: 'font-family', default: '"JetBrains Mono", "Consolas", monospace' },
                    { key: 'font-size-xs', name: '超小字号', type: 'size', default: '12px' },
                    { key: 'font-size-sm', name: '小字号', type: 'size', default: '14px' },
                    { key: 'font-size-base', name: '基础字号', type: 'size', default: '16px' },
                    { key: 'font-size-lg', name: '大字号', type: 'size', default: '18px' },
                    { key: 'font-size-xl', name: '超大字号', type: 'size', default: '20px' }
                ]
            },
            spacing: {
                name: '间距配置',
                icon: '📏',
                description: '内边距、外边距、间距等',
                variables: [
                    { key: 'spacing-xs', name: '超小间距', type: 'size', default: '4px' },
                    { key: 'spacing-sm', name: '小间距', type: 'size', default: '8px' },
                    { key: 'spacing-md', name: '中等间距', type: 'size', default: '16px' },
                    { key: 'spacing-lg', name: '大间距', type: 'size', default: '24px' },
                    { key: 'spacing-xl', name: '超大间距', type: 'size', default: '32px' }
                ]
            },
            borders: {
                name: '边框配置',
                icon: '⬜',
                description: '边框颜色、圆角、阴影等',
                variables: [
                    { key: 'border-color', name: '边框色', type: 'color', default: '#e2e8f0' },
                    { key: 'border-light', name: '浅边框色', type: 'color', default: '#f1f5f9' },
                    { key: 'radius-sm', name: '小圆角', type: 'size', default: '4px' },
                    { key: 'radius-md', name: '中圆角', type: 'size', default: '8px' },
                    { key: 'radius-lg', name: '大圆角', type: 'size', default: '12px' },
                    { key: 'radius-xl', name: '超大圆角', type: 'size', default: '16px' }
                ]
            },
            shadows: {
                name: '阴影配置',
                icon: '🌫️',
                description: '盒子阴影、文字阴影等',
                variables: [
                    { key: 'shadow-sm', name: '小阴影', type: 'shadow', default: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' },
                    { key: 'shadow-md', name: '中阴影', type: 'shadow', default: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' },
                    { key: 'shadow-lg', name: '大阴影', type: 'shadow', default: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' },
                    { key: 'shadow-xl', name: '超大阴影', type: 'shadow', default: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }
                ]
            },
            animations: {
                name: '动画配置',
                icon: '⚡',
                description: '过渡动画、持续时间等',
                variables: [
                    { key: 'transition-fast', name: '快速过渡', type: 'transition', default: '0.15s ease-out' },
                    { key: 'transition-normal', name: '正常过渡', type: 'transition', default: '0.3s ease-out' },
                    { key: 'transition-slow', name: '慢速过渡', type: 'transition', default: '0.5s ease-out' }
                ]
            }
        };
    }

    // 主题数据管理
    async loadCurrentTheme(): Promise<void> {
        try {
            // 检查是否在Tauri环境中
            if (typeof (window as any).__TAURI__ !== 'undefined') {
                // 优先从后端加载当前主题 - Tauri v2
                const { invoke } = await import('@tauri-apps/api/core');
                const themeData = await invoke<ThemeData>('get_current_theme');

                if (themeData && Object.keys(themeData).length > 0) {
                    console.log('✅ 从后端加载主题:', themeData);
                    this.setTheme(themeData, false);
                    return;
                }
            }
        } catch (error) {
            console.warn('从后端加载主题失败，尝试本地存储:', error);
        }

        try {
            // 备用：从 localStorage 加载当前主题
            const savedTheme = localStorage.getItem('current_theme');
            if (savedTheme) {
                const theme = JSON.parse(savedTheme) as ThemeData;
                console.log('✅ 从本地存储加载主题:', theme);
                this.setTheme(theme, false);
                return;
            }
        } catch (error) {
            console.warn('从本地存储加载主题失败:', error);
        }

        // 使用默认主题
        console.log('✅ 使用默认主题');
        this.setTheme(this.getDefaultTheme(), false);
    }

    getDefaultTheme(): ThemeData {
        const defaultTheme: ThemeData = {};
        Object.values(this.themeCategories).forEach(category => {
            category.variables.forEach(variable => {
                defaultTheme[`--${variable.key}`] = variable.default;
            });
        });
        return defaultTheme;
    }

    setTheme(theme: ThemeData, addToHistory = true): void {
        if (addToHistory) {
            this.addToHistory();
        }

        this.currentTheme = { ...theme };
        this.isDirty = true;
        this.emit('themeChanged', this.currentTheme);
    }

    updateThemeVariable(key: string, value: string, addToHistory = true): void {
        if (!this.currentTheme) {
            this.currentTheme = {};
        }

        if (addToHistory) {
            this.addToHistory();
        }

        const cssKey = key.startsWith('--') ? key : `--${key}`;
        this.currentTheme[cssKey] = value;
        this.isDirty = true;

        this.emit('variableChanged', { key: cssKey, value });
        this.emit('themeChanged', this.currentTheme);
    }

    // 历史记录管理
    addToHistory(): void {
        if (!this.currentTheme) return;

        // 移除当前位置之后的历史记录
        this.history = this.history.slice(0, this.historyIndex + 1);

        // 添加新的历史记录
        this.history.push(JSON.parse(JSON.stringify(this.currentTheme)) as ThemeData);

        // 限制历史记录大小
        if (this.history.length > this.maxHistorySize) {
            this.history.shift();
        } else {
            this.historyIndex++;
        }

        this.emit('historyChanged', {
            canUndo: this.canUndo(),
            canRedo: this.canRedo()
        });
    }

    canUndo(): boolean {
        return this.historyIndex > 0;
    }

    canRedo(): boolean {
        return this.historyIndex < this.history.length - 1;
    }

    undo(): boolean {
        if (!this.canUndo()) return false;

        this.historyIndex--;
        this.currentTheme = JSON.parse(JSON.stringify(this.history[this.historyIndex])) as ThemeData;
        this.isDirty = true;

        this.emit('themeChanged', this.currentTheme);
        this.emit('historyChanged', {
            canUndo: this.canUndo(),
            canRedo: this.canRedo()
        });

        return true;
    }

    redo(): boolean {
        if (!this.canRedo()) return false;

        this.historyIndex++;
        this.currentTheme = JSON.parse(JSON.stringify(this.history[this.historyIndex])) as ThemeData;
        this.isDirty = true;

        this.emit('themeChanged', this.currentTheme);
        this.emit('historyChanged', {
            canUndo: this.canUndo(),
            canRedo: this.canRedo()
        });

        return true;
    }

    // 主题操作
    async saveTheme(name: string): Promise<boolean> {
        if (!this.currentTheme) {
            throw new Error('没有可保存的主题');
        }

        try {
            // 用户主题功能已移除，仅保存到本地存储
            console.log('✅ 主题已保存到本地存储（用户主题功能已移除）');

            // 备用：同时保存到 localStorage
            const themeData = {
                name,
                theme: this.currentTheme,
                savedAt: new Date().toISOString()
            };

            localStorage.setItem('current_theme', JSON.stringify(this.currentTheme));
            localStorage.setItem(`saved_theme_${name}`, JSON.stringify(themeData));

            this.isDirty = false;
            this.emit('themeSaved', { name, theme: this.currentTheme });
            return true;
        } catch (error) {
            console.error('保存主题失败:', error);
            this.emit('error', { type: 'save', error: error as Error });
            throw error;
        }
    }

    async applyTheme(): Promise<boolean> {
        if (!this.currentTheme) {
            throw new Error('没有可应用的主题');
        }

        try {
            // 应用主题到当前页面
            this.applyThemeToDocument();

            // 用户主题功能已移除，仅应用到当前页面
            console.log('✅ 主题已应用到当前页面（用户主题功能已移除）');
            this.showSuccessMessage('主题已应用到当前页面（用户主题功能已移除）');

            // 备用：保存到本地存储
            localStorage.setItem('current_theme', JSON.stringify(this.currentTheme));

            // 重置脏状态
            this.isDirty = false;

            this.emit('themeApplied', this.currentTheme);
            return true;
        } catch (error) {
            console.error('应用主题失败:', error);
            this.showErrorMessage('应用主题失败: ' + (error as Error).message);
            this.emit('error', { type: 'apply', error: error as Error });
            throw error;
        }
    }

    // 显示成功消息
    showSuccessMessage(message: string): void {
        this.showToast(message, 'success');
    }

    // 显示错误消息
    showErrorMessage(message: string): void {
        this.showToast(message, 'error');
    }

    // 显示Toast消息
    showToast(message: string, type: ToastType = 'info'): void {
        // 创建toast元素
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            top: 60px;
            right: 20px;
            background: ${type === 'success' ? '#4ecdc4' : type === 'error' ? '#ff5252' : '#42a5f5'};
            color: white;
            padding: 12px 16px;
            border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 2000;
            font-size: 13px;
            max-width: 300px;
            animation: slideInRight 0.3s ease-out;
            font-family: 'Inter', sans-serif;
        `;

        // 添加动画样式
        if (!document.getElementById('toast-animations')) {
            const style = document.createElement('style');
            style.id = 'toast-animations';
            style.textContent = `
                @keyframes slideInRight {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes slideOutRight {
                    from { transform: translateX(0); opacity: 1; }
                    to { transform: translateX(100%); opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }

        toast.textContent = message;
        document.body.appendChild(toast);

        // 自动移除
        setTimeout(() => {
            if (toast.parentNode) {
                toast.style.animation = 'slideOutRight 0.3s ease-out';
                setTimeout(() => {
                    if (toast.parentNode) {
                        toast.parentNode.removeChild(toast);
                    }
                }, 300);
            }
        }, 3000);
    }

    // 应用主题到文档
    applyThemeToDocument(): void {
        if (!this.currentTheme) return;

        Object.entries(this.currentTheme).forEach(([key, value]) => {
            document.documentElement.style.setProperty(key, value);
        });
    }

    exportTheme(): ThemeConfig {
        if (!this.currentTheme) {
            throw new Error('没有可导出的主题');
        }

        return {
            version: '1.0',
            name: 'Custom Theme',
            description: '用户自定义主题',
            author: 'User',
            createdAt: new Date().toISOString(),
            theme: this.currentTheme
        };
    }

    importTheme(themeData: ThemeConfig | ThemeData): void {
        const validator = new ThemeValidator();

        if (!validator.validate(themeData)) {
            throw new Error('主题数据格式无效');
        }

        const config = themeData as ThemeConfig;
        this.setTheme(config.theme || (themeData as ThemeData));
        this.emit('themeImported', config);
    }

    // 获取器方法
    getCurrentTheme(): ThemeData | null {
        return this.currentTheme ? { ...this.currentTheme } : null;
    }

    getThemeCategories(): ThemeCategories {
        return this.themeCategories;
    }

    getBaseTheme(): string {
        return this.baseTheme;
    }

    setBaseTheme(theme: string): void {
        this.baseTheme = theme;
        this.emit('baseThemeChanged', theme);
    }

    isDirtyState(): boolean {
        return this.isDirty;
    }

    resetDirtyState(): void {
        this.isDirty = false;
    }
}
