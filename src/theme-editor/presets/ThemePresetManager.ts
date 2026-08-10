/**
 * 主题预设管理器
 * 管理内置和用户自定义主题预设
 */

import { EventEmitter, type EventMap } from '../utils/EventEmitter';
import type { ThemeData } from '../utils/ThemeValidator';

/** 主题预设定义 */
export interface ThemePreset {
    id: string;
    name: string;
    category: string;
    badge?: string;
    description: string;
    author?: string;
    colors?: string[];
    tags?: string[];
    theme: ThemeData;
    builtin?: boolean;
    user?: boolean;
    createdAt?: string;
    updatedAt?: string;
}

/** 预设分类定义 */
export interface PresetCategory {
    id: string;
    name: string;
    icon: string;
    description: string;
}

/** 导出的预设数据 */
export interface ExportedPreset extends ThemePreset {
    version: string;
    type: string;
    exportedAt: string;
}

/** 导入预设时的输入数据（部分字段可缺省） */
export interface ImportPresetData {
    name?: string;
    description?: string;
    category?: string;
    tags?: string[];
    theme: ThemeData;
    author?: string;
}

/** ThemePresetManager 触发的事件 */
export interface ThemePresetManagerEvents extends EventMap {
    initialized: void;
    error: Error;
    presetAdded: ThemePreset;
    presetDeleted: { id: string; preset: ThemePreset };
    presetUpdated: ThemePreset;
}

export class ThemePresetManager extends EventEmitter<ThemePresetManagerEvents> {
    private presets: Map<string, ThemePreset> = new Map();
    private categories: Map<string, PresetCategory> = new Map();
    private userPresets: Map<string, ThemePreset> = new Map();

    constructor() {
        super();

        void this.init();
    }

    async init(): Promise<void> {
        this.initializeBuiltinPresets();
        await this.loadUserPresets();
        this.emit('initialized');
    }

    initializeBuiltinPresets(): void {
        // 内置主题预设
        const builtinPresets: ThemePreset[] = [
            {
                id: 'lovely-default',
                name: 'Lovely',
                category: 'elegant',
                badge: 'Default',
                description: '奢华优雅的默认主题，金色点缀',
                author: 'Lovelymem V2 Team',
                colors: ['#667eea', '#764ba2', '#f093fb', '#FFD700'],
                tags: ['elegant', 'luxury', 'gradient'],
                theme: {
                    '--primary-color': '#667eea',
                    '--secondary-color': '#764ba2',
                    '--accent-color': '#f093fb',
                    '--success-color': '#4ecdc4',
                    '--warning-color': '#ffa726',
                    '--error-color': '#ff5252',
                    '--info-color': '#42a5f5',
                    '--bg-primary': '#f8fafc',
                    '--bg-secondary': '#ffffff',
                    '--bg-tertiary': '#f1f5f9',
                    '--bg-dark': '#1e293b',
                    '--bg-glass': 'rgba(255, 255, 255, 0.1)',
                    '--bg-overlay': 'rgba(0, 0, 0, 0.5)',
                    '--text-primary': '#1e293b',
                    '--text-secondary': '#64748b',
                    '--text-light': '#94a3b8',
                    '--text-white': '#ffffff',
                    '--gradient-primary': 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    '--gradient-secondary': 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                    '--border-color': '#e2e8f0',
                    '--border-light': '#f1f5f9',
                    '--radius-sm': '4px',
                    '--radius-md': '8px',
                    '--radius-lg': '12px',
                    '--shadow-sm': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                    '--shadow-md': '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                    '--shadow-lg': '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                }
            },
            {
                id: 'sakura-dream',
                name: 'Sakura Dream',
                category: 'cute',
                badge: 'Popular',
                description: '樱花粉色梦幻主题，温柔可爱',
                author: 'Lovelymem V2 Team',
                colors: ['#ff9a9e', '#fecfef', '#ffecd2', '#fcb69f'],
                tags: ['cute', 'pink', 'dreamy'],
                theme: {
                    '--primary-color': '#ff9a9e',
                    '--secondary-color': '#fecfef',
                    '--accent-color': '#ffecd2',
                    '--success-color': '#98fb98',
                    '--warning-color': '#ffd700',
                    '--error-color': '#ff6b6b',
                    '--info-color': '#87ceeb',
                    '--bg-primary': '#fef7f7',
                    '--bg-secondary': '#ffffff',
                    '--bg-tertiary': '#fdf2f8',
                    '--bg-dark': '#4a1a2c',
                    '--bg-glass': 'rgba(255, 182, 193, 0.1)',
                    '--gradient-primary': 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 50%, #ffecd2 100%)',
                    '--gradient-secondary': 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
                    '--text-primary': '#4a1a2c',
                    '--text-secondary': '#8b5a6b',
                    '--border-color': '#f8d7da',
                    '--radius-md': '12px',
                    '--shadow-md': '0 4px 6px -1px rgba(255, 154, 158, 0.2)'
                }
            },
            {
                id: 'ocean-breeze',
                name: 'Ocean Breeze',
                category: 'nature',
                badge: 'Fresh',
                description: '海洋微风主题，清新自然',
                author: 'Lovelymem V2 Team',
                colors: ['#667eea', '#764ba2', '#4facfe', '#00f2fe'],
                tags: ['fresh', 'blue', 'ocean'],
                theme: {
                    '--primary-color': '#4facfe',
                    '--secondary-color': '#00f2fe',
                    '--accent-color': '#667eea',
                    '--success-color': '#20b2aa',
                    '--warning-color': '#ffa500',
                    '--error-color': '#ff4757',
                    '--info-color': '#3742fa',
                    '--bg-primary': '#f0f8ff',
                    '--bg-secondary': '#ffffff',
                    '--bg-tertiary': '#e6f3ff',
                    '--gradient-primary': 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                    '--gradient-secondary': 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    '--text-primary': '#1e3a8a',
                    '--text-secondary': '#3b82f6',
                    '--border-color': '#bfdbfe',
                    '--shadow-md': '0 4px 6px -1px rgba(79, 172, 254, 0.2)'
                }
            },
            {
                id: 'sunset-glow',
                name: 'Sunset Glow',
                category: 'warm',
                badge: 'Trending',
                description: '日落余晖主题，温暖橙黄色调',
                author: 'Lovelymem V2 Team',
                colors: ['#ff7e5f', '#feb47b', '#ff6b6b', '#feca57'],
                tags: ['warm', 'orange', 'sunset'],
                theme: {
                    '--primary-color': '#ff7e5f',
                    '--secondary-color': '#feb47b',
                    '--accent-color': '#feca57',
                    '--success-color': '#26de81',
                    '--warning-color': '#fed330',
                    '--error-color': '#ff3838',
                    '--info-color': '#3d5afe',
                    '--bg-primary': '#fffbf5',
                    '--bg-secondary': '#ffffff',
                    '--bg-tertiary': '#fef5e7',
                    '--gradient-primary': 'linear-gradient(135deg, #ff7e5f 0%, #feb47b 100%)',
                    '--gradient-secondary': 'linear-gradient(135deg, #feca57 0%, #ff6b6b 100%)',
                    '--text-primary': '#8b4513',
                    '--text-secondary': '#cd853f',
                    '--border-color': '#fde68a',
                    '--shadow-md': '0 4px 6px -1px rgba(255, 126, 95, 0.2)'
                }
            },
            {
                id: 'midnight-purple',
                name: 'Midnight Purple',
                category: 'dark',
                badge: 'Dark',
                description: '午夜紫色主题，神秘优雅',
                author: 'Lovelymem V2 Team',
                colors: ['#667eea', '#764ba2', '#9c27b0', '#673ab7'],
                tags: ['dark', 'purple', 'mysterious'],
                theme: {
                    '--primary-color': '#9c27b0',
                    '--secondary-color': '#673ab7',
                    '--accent-color': '#e91e63',
                    '--success-color': '#4caf50',
                    '--warning-color': '#ff9800',
                    '--error-color': '#f44336',
                    '--info-color': '#2196f3',
                    '--bg-primary': '#1a0d2e',
                    '--bg-secondary': '#16213e',
                    '--bg-tertiary': '#0f3460',
                    '--bg-dark': '#0a0a0a',
                    '--gradient-primary': 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    '--gradient-secondary': 'linear-gradient(135deg, #9c27b0 0%, #673ab7 100%)',
                    '--text-primary': '#ffffff',
                    '--text-secondary': '#b39ddb',
                    '--text-light': '#9575cd',
                    '--border-color': '#4a148c',
                    '--shadow-md': '0 4px 6px -1px rgba(156, 39, 176, 0.3)'
                }
            },
            {
                id: 'forest-green',
                name: 'Forest Green',
                category: 'nature',
                badge: 'Eco',
                description: '森林绿色主题，自然环保',
                author: 'Lovelymem V2 Team',
                colors: ['#2e7d32', '#388e3c', '#43a047', '#66bb6a'],
                tags: ['nature', 'green', 'eco'],
                theme: {
                    '--primary-color': '#2e7d32',
                    '--secondary-color': '#388e3c',
                    '--accent-color': '#66bb6a',
                    '--success-color': '#4caf50',
                    '--warning-color': '#ff8f00',
                    '--error-color': '#d32f2f',
                    '--info-color': '#1976d2',
                    '--bg-primary': '#f1f8e9',
                    '--bg-secondary': '#ffffff',
                    '--bg-tertiary': '#e8f5e8',
                    '--gradient-primary': 'linear-gradient(135deg, #2e7d32 0%, #388e3c 100%)',
                    '--gradient-secondary': 'linear-gradient(135deg, #43a047 0%, #66bb6a 100%)',
                    '--text-primary': '#1b5e20',
                    '--text-secondary': '#2e7d32',
                    '--border-color': '#c8e6c9',
                    '--shadow-md': '0 4px 6px -1px rgba(46, 125, 50, 0.2)'
                }
            }
        ];

        // 注册内置预设
        builtinPresets.forEach(preset => {
            this.presets.set(preset.id, {
                ...preset,
                builtin: true,
                createdAt: new Date().toISOString()
            });
        });

        // 初始化分类
        this.initializeCategories();
    }

    initializeCategories(): void {
        const categories: PresetCategory[] = [
            { id: 'elegant', name: '优雅', icon: '✨', description: '优雅精致的主题风格' },
            { id: 'cute', name: '可爱', icon: '🌸', description: '可爱甜美的主题风格' },
            { id: 'nature', name: '自然', icon: '🌿', description: '自然清新的主题风格' },
            { id: 'warm', name: '温暖', icon: '🌅', description: '温暖舒适的主题风格' },
            { id: 'dark', name: '深色', icon: '🌙', description: '深色神秘的主题风格' },
            { id: 'minimal', name: '简约', icon: '⚪', description: '简约现代的主题风格' },
            { id: 'vibrant', name: '活力', icon: '🎨', description: '活力四射的主题风格' }
        ];

        categories.forEach(category => {
            this.categories.set(category.id, category);
        });
    }

    async loadUserPresets(): Promise<void> {
        try {
            // 尝试从 localStorage 加载用户预设
            const savedPresets = localStorage.getItem('user_theme_presets');
            if (savedPresets) {
                const userPresets = JSON.parse(savedPresets) as ThemePreset[];
                if (userPresets && Array.isArray(userPresets)) {
                    userPresets.forEach(preset => {
                        this.userPresets.set(preset.id, {
                            ...preset,
                            builtin: false,
                            user: true
                        });
                    });
                }
            }
        } catch (error) {
            console.warn('加载用户预设失败:', error);
        }
    }

    // 获取所有预设
    getAllPresets(): ThemePreset[] {
        const allPresets = new Map<string, ThemePreset>([...this.presets, ...this.userPresets]);
        return Array.from(allPresets.values());
    }

    // 按分类获取预设
    getPresetsByCategory(categoryId: string): ThemePreset[] {
        return this.getAllPresets().filter(preset => preset.category === categoryId);
    }

    // 按标签获取预设
    getPresetsByTag(tag: string): ThemePreset[] {
        return this.getAllPresets().filter(preset =>
            preset.tags && preset.tags.includes(tag)
        );
    }

    // 搜索预设
    searchPresets(query: string): ThemePreset[] {
        const lowerQuery = query.toLowerCase();
        return this.getAllPresets().filter(preset =>
            preset.name.toLowerCase().includes(lowerQuery) ||
            preset.description.toLowerCase().includes(lowerQuery) ||
            (preset.tags && preset.tags.some(tag => tag.toLowerCase().includes(lowerQuery)))
        );
    }

    // 获取单个预设
    getPreset(id: string): ThemePreset | undefined {
        return this.presets.get(id) || this.userPresets.get(id);
    }

    // 获取分类信息
    getCategories(): PresetCategory[] {
        return Array.from(this.categories.values());
    }

    getCategory(id: string): PresetCategory | undefined {
        return this.categories.get(id);
    }

    // 添加用户预设
    async addUserPreset(preset: Partial<ThemePreset> & { theme: ThemeData }): Promise<ThemePreset> {
        const id = preset.id || this.generatePresetId();
        const userPreset: ThemePreset = {
            name: 'Imported Theme',
            description: '',
            category: 'minimal',
            ...preset,
            id,
            theme: preset.theme,
            builtin: false,
            user: true,
            createdAt: new Date().toISOString()
        };

        this.userPresets.set(id, userPreset);

        try {
            // 保存到 localStorage
            await this.saveUserPresetsToStorage();

            this.emit('presetAdded', userPreset);
            return userPreset;
        } catch (error) {
            this.userPresets.delete(id);
            throw error;
        }
    }

    // 删除用户预设
    async deleteUserPreset(id: string): Promise<void> {
        const preset = this.userPresets.get(id);
        if (!preset) {
            throw new Error('预设不存在');
        }

        if (preset.builtin) {
            throw new Error('不能删除内置预设');
        }

        this.userPresets.delete(id);

        try {
            // 保存到 localStorage
            await this.saveUserPresetsToStorage();

            this.emit('presetDeleted', { id, preset });
        } catch (error) {
            // 恢复预设
            this.userPresets.set(id, preset);
            throw error;
        }
    }

    // 更新用户预设
    async updateUserPreset(id: string, updates: Partial<ThemePreset>): Promise<ThemePreset> {
        const preset = this.userPresets.get(id);
        if (!preset) {
            throw new Error('预设不存在');
        }

        if (preset.builtin) {
            throw new Error('不能修改内置预设');
        }

        const updatedPreset: ThemePreset = {
            ...preset,
            ...updates,
            updatedAt: new Date().toISOString()
        };

        this.userPresets.set(id, updatedPreset);

        try {
            // 保存到 localStorage
            await this.saveUserPresetsToStorage();

            this.emit('presetUpdated', updatedPreset);
            return updatedPreset;
        } catch (error) {
            // 恢复原预设
            this.userPresets.set(id, preset);
            throw error;
        }
    }

    // 保存用户预设到本地存储
    async saveUserPresetsToStorage(): Promise<void> {
        try {
            const userPresetsArray = Array.from(this.userPresets.values());
            localStorage.setItem('user_theme_presets', JSON.stringify(userPresetsArray));
        } catch (error) {
            console.error('保存用户预设失败:', error);
            throw error;
        }
    }

    // 生成预设ID
    generatePresetId(): string {
        return `user-preset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    // 导出预设
    exportPreset(id: string): ExportedPreset {
        const preset = this.getPreset(id);
        if (!preset) {
            throw new Error('预设不存在');
        }

        return {
            ...preset,
            version: '1.0',
            type: 'theme-preset',
            exportedAt: new Date().toISOString()
        };
    }

    // 导入预设
    async importPreset(presetData: ImportPresetData): Promise<ThemePreset> {
        if (!presetData.theme) {
            throw new Error('预设数据无效');
        }

        const preset: Partial<ThemePreset> & { theme: ThemeData } = {
            id: this.generatePresetId(),
            name: presetData.name || 'Imported Theme',
            description: presetData.description || '导入的主题',
            category: presetData.category || 'minimal',
            colors: this.extractColors(presetData.theme),
            tags: presetData.tags || ['imported'],
            theme: presetData.theme,
            author: presetData.author || 'User'
        };

        return await this.addUserPreset(preset);
    }

    // 从主题中提取主要颜色
    extractColors(theme: ThemeData): string[] {
        const colorKeys = ['--primary-color', '--secondary-color', '--accent-color', '--success-color'];
        return colorKeys
            .map(key => theme[key])
            .filter((color): color is string => Boolean(color) && color.startsWith('#'))
            .slice(0, 4);
    }

    // 获取热门预设
    getPopularPresets(limit = 6): ThemePreset[] {
        return this.getAllPresets()
            .filter(preset => preset.badge === 'Popular' || preset.badge === 'Trending')
            .slice(0, limit);
    }

    // 获取最新预设
    getLatestPresets(limit = 6): ThemePreset[] {
        return this.getAllPresets()
            .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())
            .slice(0, limit);
    }
}
