/**
 * 配置管理器
 * 处理主题配置的导入导出、验证和转换
 */

import { EventEmitter, type EventMap } from '../utils/EventEmitter';
import { ThemeValidator, type ThemeData, type ThemeConfig } from '../utils/ThemeValidator';

/** 导出为 JSON 时的选项 */
export interface JSONExportOptions {
    pretty?: boolean;
    includeMetadata?: boolean;
    includeDefaults?: boolean;
}

/** 导出为 CSS 时的选项 */
export interface CSSExportOptions {
    selector?: string;
    includeComments?: boolean;
    groupByCategory?: boolean;
}

export type ExportOptions = JSONExportOptions & CSSExportOptions;

/** ConfigManager 触发的事件 */
export interface ConfigManagerEvents extends EventMap {
    initialized: void;
    error: { type: string; error: Error; format?: string; fromFormat?: string; toFormat?: string };
    configImported: { data: ThemeConfig; format: string };
    configExported: { data: string; format: string; options: ExportOptions };
}

export class ConfigManager extends EventEmitter<ConfigManagerEvents> {
    private validator: ThemeValidator;
    private supportedFormats: string[] = ['json', 'css', 'scss'];
    private exportFormats: string[] = ['json', 'css'];

    constructor() {
        super();

        this.validator = new ThemeValidator();

        this.init();
    }

    init(): void {
        this.emit('initialized');
    }

    // 导入配置
    async importConfig(data: string | ThemeConfig | ThemeData, format = 'json'): Promise<ThemeConfig> {
        try {
            let themeData: ThemeConfig;

            switch (format.toLowerCase()) {
                case 'json':
                    themeData = this.importFromJSON(data);
                    break;
                case 'css':
                    themeData = this.importFromCSS(data as string);
                    break;
                case 'scss':
                    themeData = this.importFromSCSS(data as string);
                    break;
                default:
                    throw new Error(`不支持的导入格式: ${format}`);
            }

            // 验证主题数据
            if (!this.validator.validate(themeData)) {
                const errors = this.validator.getValidationErrors(themeData);
                throw new Error(`主题数据验证失败: ${errors.join(', ')}`);
            }

            // 修复主题数据
            themeData = this.validator.fixThemeData(themeData);

            this.emit('configImported', { data: themeData, format });
            return themeData;

        } catch (error) {
            this.emit('error', { type: 'import', error: error as Error, format });
            throw error;
        }
    }

    // 导出配置
    exportConfig(themeData: ThemeConfig, format = 'json', options: ExportOptions = {}): string {
        try {
            let exportData: string;

            switch (format.toLowerCase()) {
                case 'json':
                    exportData = this.exportToJSON(themeData, options);
                    break;
                case 'css':
                    exportData = this.exportToCSS(themeData, options);
                    break;
                default:
                    throw new Error(`不支持的导出格式: ${format}`);
            }

            this.emit('configExported', { data: exportData, format, options });
            return exportData;

        } catch (error) {
            this.emit('error', { type: 'export', error: error as Error, format });
            throw error;
        }
    }

    // 从JSON导入
    importFromJSON(jsonData: string | ThemeConfig | ThemeData): ThemeConfig {
        let data: ThemeConfig | ThemeData;

        if (typeof jsonData === 'string') {
            data = JSON.parse(jsonData) as ThemeConfig | ThemeData;
        } else {
            data = jsonData;
        }

        // 处理不同的JSON格式
        if ((data as ThemeConfig).theme) {
            // 完整的主题配置格式
            return data as ThemeConfig;
        } else if (this.isThemeVariablesObject(data)) {
            // 直接的CSS变量对象
            return {
                version: '1.0',
                name: 'Imported Theme',
                description: '导入的主题',
                theme: data as ThemeData
            };
        } else {
            throw new Error('无效的JSON格式');
        }
    }

    // 从CSS导入
    importFromCSS(cssData: string): ThemeConfig {
        const variables: ThemeData = {};

        // 匹配CSS变量定义
        const cssVarRegex = /--([a-zA-Z0-9-_]+)\s*:\s*([^;]+);/g;
        let match: RegExpExecArray | null;

        while ((match = cssVarRegex.exec(cssData)) !== null) {
            const [, name, value] = match;
            variables[`--${name}`] = value.trim();
        }

        if (Object.keys(variables).length === 0) {
            throw new Error('未找到有效的CSS变量');
        }

        return {
            version: '1.0',
            name: 'CSS Imported Theme',
            description: '从CSS导入的主题',
            theme: variables
        };
    }

    // 从SCSS导入
    importFromSCSS(scssData: string): ThemeConfig {
        const variables: ThemeData = {};

        // 匹配SCSS变量定义
        const scssVarRegex = /\$([a-zA-Z0-9-_]+)\s*:\s*([^;]+);/g;
        let match: RegExpExecArray | null;

        while ((match = scssVarRegex.exec(scssData)) !== null) {
            const [, name, value] = match;
            // 转换SCSS变量名为CSS变量名
            const cssVarName = `--${name.replace(/_/g, '-')}`;
            variables[cssVarName] = value.trim();
        }

        if (Object.keys(variables).length === 0) {
            throw new Error('未找到有效的SCSS变量');
        }

        return {
            version: '1.0',
            name: 'SCSS Imported Theme',
            description: '从SCSS导入的主题',
            theme: variables
        };
    }

    // 导出为JSON
    exportToJSON(themeData: ThemeConfig, options: JSONExportOptions = {}): string {
        const {
            pretty = true,
            includeMetadata = true,
            includeDefaults = false
        } = options;

        let exportData: ThemeConfig | ThemeData = { ...themeData };

        if (!includeMetadata) {
            // 只导出主题变量
            exportData = themeData.theme || (themeData as unknown as ThemeData);
        }

        if (!includeDefaults && themeData.theme && 'theme' in exportData) {
            // 移除默认值（如果有的话）
            (exportData as ThemeConfig).theme = this.removeDefaultValues(themeData.theme);
        }

        return pretty ? JSON.stringify(exportData, null, 2) : JSON.stringify(exportData);
    }

    // 导出为CSS
    exportToCSS(themeData: ThemeConfig, options: CSSExportOptions = {}): string {
        const {
            selector = ':root',
            includeComments = true,
            groupByCategory = true
        } = options;

        const theme = themeData.theme || (themeData as unknown as ThemeData);
        let css = '';

        if (includeComments) {
            css += `/* ${themeData.name || 'Custom Theme'} */\n`;
            if (themeData.description) {
                css += `/* ${themeData.description} */\n`;
            }
            css += `/* Generated on ${new Date().toISOString()} */\n\n`;
        }

        css += `${selector} {\n`;

        if (groupByCategory) {
            css += this.generateCategorizedCSS(theme, includeComments);
        } else {
            Object.entries(theme).forEach(([key, value]) => {
                css += `  ${key}: ${value};\n`;
            });
        }

        css += '}\n';

        return css;
    }

    // 生成分类的CSS
    generateCategorizedCSS(theme: ThemeData, includeComments: boolean): string {
        const categories: Record<string, string[]> = {
            colors: ['color', 'bg'],
            gradients: ['gradient'],
            typography: ['font'],
            spacing: ['spacing', 'padding', 'margin'],
            borders: ['border', 'radius'],
            shadows: ['shadow'],
            animations: ['transition', 'animation']
        };

        let css = '';
        const usedVariables = new Set<string>();

        Object.entries(categories).forEach(([categoryName, keywords]) => {
            const categoryVars = Object.entries(theme).filter(([key]) =>
                keywords.some(keyword => key.includes(keyword)) && !usedVariables.has(key)
            );

            if (categoryVars.length > 0) {
                if (includeComments) {
                    css += `  /* ${categoryName.charAt(0).toUpperCase() + categoryName.slice(1)} */\n`;
                }

                categoryVars.forEach(([key, value]) => {
                    css += `  ${key}: ${value};\n`;
                    usedVariables.add(key);
                });

                css += '\n';
            }
        });

        // 添加未分类的变量
        const uncategorizedVars = Object.entries(theme).filter(([key]) => !usedVariables.has(key));
        if (uncategorizedVars.length > 0) {
            if (includeComments) {
                css += '  /* Other */\n';
            }
            uncategorizedVars.forEach(([key, value]) => {
                css += `  ${key}: ${value};\n`;
            });
        }

        return css;
    }

    // 移除默认值
    removeDefaultValues(theme: ThemeData): ThemeData {
        // 这里可以实现移除默认值的逻辑
        // 需要与ThemeEditorCore的默认主题进行比较
        return theme;
    }

    // 检查是否为主题变量对象
    isThemeVariablesObject(obj: unknown): obj is ThemeData {
        if (!obj || typeof obj !== 'object') {
            return false;
        }

        const record = obj as Record<string, unknown>;
        const keys = Object.keys(record);
        if (keys.length === 0) {
            return true;
        }

        return keys.every(key =>
            key.startsWith('--') &&
            typeof record[key] === 'string'
        );
    }

    // 转换主题格式
    async convertThemeFormat(
        themeData: string | ThemeConfig | ThemeData,
        fromFormat: string,
        toFormat: string,
        options: ExportOptions = {}
    ): Promise<string> {
        try {
            // 先导入为标准格式
            const standardTheme = await this.importConfig(themeData, fromFormat);

            // 再导出为目标格式
            return this.exportConfig(standardTheme, toFormat, options);

        } catch (error) {
            this.emit('error', { type: 'convert', error: error as Error, fromFormat, toFormat });
            throw error;
        }
    }

    // 合并主题配置
    mergeThemes(baseTheme: ThemeConfig, overlayTheme: ThemeConfig | ThemeData): ThemeConfig {
        const overlayConfig = overlayTheme as ThemeConfig;
        const merged: ThemeConfig = {
            ...baseTheme,
            theme: {
                ...(baseTheme.theme || {}),
                ...(overlayConfig.theme || (overlayTheme as ThemeData))
            }
        };

        // 更新元数据
        if (overlayConfig.name) {
            merged.name = overlayConfig.name;
        }
        if (overlayConfig.description) {
            merged.description = overlayConfig.description;
        }

        return merged;
    }

    // 获取支持的格式
    getSupportedImportFormats(): string[] {
        return [...this.supportedFormats];
    }

    getSupportedExportFormats(): string[] {
        return [...this.exportFormats];
    }

    // 验证配置
    validateConfig(themeData: unknown): boolean {
        return this.validator.validate(themeData);
    }

    // 获取验证错误
    getValidationErrors(themeData: unknown): string[] {
        return this.validator.getValidationErrors(themeData);
    }

    // 修复配置
    fixConfig(themeData: ThemeConfig): ThemeConfig {
        return this.validator.fixThemeData(themeData);
    }

    // 销毁
    destroy(): void {
        this.removeAllListeners();
    }
}
