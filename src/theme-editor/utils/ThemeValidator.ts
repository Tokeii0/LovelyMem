/**
 * 主题数据验证器
 * 验证主题配置的有效性
 */

/** CSS 变量映射：键以 -- 开头，值为字符串 */
export type ThemeData = Record<string, string>;

/** 完整的主题配置对象 */
export interface ThemeConfig {
    version?: string;
    name?: string;
    description?: string;
    author?: string;
    createdAt?: string;
    theme?: ThemeData;
    [key: string]: unknown;
}

export class ThemeValidator {
    private requiredFields: string[] = ['version'];
    private validVersions: string[] = ['1.0'];

    // CSS 颜色值正则表达式
    private colorRegex = /^(#([0-9a-fA-F]{3}){1,2}|rgb\(.*\)|rgba\(.*\)|hsl\(.*\)|hsla\(.*\)|[a-zA-Z]+)$/;

    // CSS 尺寸值正则表达式
    private sizeRegex = /^(\d+(\.\d+)?(px|em|rem|%|vh|vw|vmin|vmax)|0)$/;

    // CSS 阴影值正则表达式
    private shadowRegex = /^(\d+px\s+\d+px(\s+\d+px)?(\s+\d+px)?\s+(rgba?\([^)]+\)|#[0-9a-fA-F]{3,6}|[a-zA-Z]+)|none)$/;

    validate(themeData: unknown): boolean {
        try {
            // 基本结构验证
            if (!this.validateStructure(themeData)) {
                return false;
            }

            const data = themeData as ThemeConfig;

            // 主题变量验证
            if (data.theme && !this.validateThemeVariables(data.theme)) {
                return false;
            }

            return true;
        } catch (error) {
            console.error('主题验证失败:', error);
            return false;
        }
    }

    validateStructure(data: unknown): data is ThemeConfig {
        if (!data || typeof data !== 'object') {
            console.error('主题数据必须是对象');
            return false;
        }

        const config = data as ThemeConfig;

        // 如果直接是主题变量对象（向后兼容）
        if (this.isThemeVariablesObject(data)) {
            return true;
        }

        // 检查必需字段
        for (const field of this.requiredFields) {
            if (!(field in config)) {
                console.error(`缺少必需字段: ${field}`);
                return false;
            }
        }

        // 验证版本
        if (typeof config.version !== 'string' || !this.validVersions.includes(config.version)) {
            console.error(`不支持的版本: ${config.version}`);
            return false;
        }

        // 验证主题对象
        if (config.theme && !this.isThemeVariablesObject(config.theme)) {
            console.error('主题对象格式无效');
            return false;
        }

        return true;
    }

    isThemeVariablesObject(obj: unknown): obj is ThemeData {
        if (!obj || typeof obj !== 'object') {
            return false;
        }

        // 检查是否所有键都是CSS变量格式
        const record = obj as Record<string, unknown>;
        const keys = Object.keys(record);
        if (keys.length === 0) {
            return true; // 空对象也是有效的
        }

        return keys.every(key =>
            key.startsWith('--') &&
            typeof record[key] === 'string'
        );
    }

    validateThemeVariables(theme: ThemeData): boolean {
        for (const [key, value] of Object.entries(theme)) {
            if (!this.validateVariable(key, value)) {
                return false;
            }
        }
        return true;
    }

    validateVariable(key: string, value: unknown): boolean {
        if (!key.startsWith('--')) {
            console.error(`CSS变量名必须以--开头: ${key}`);
            return false;
        }

        if (typeof value !== 'string') {
            console.error(`CSS变量值必须是字符串: ${key}`);
            return false;
        }

        // 根据变量名推断类型并验证
        return this.validateVariableValue(key, value);
    }

    validateVariableValue(key: string, value: string): boolean {
        const lowerKey = key.toLowerCase();

        // 颜色相关变量
        if (lowerKey.includes('color') || lowerKey.includes('bg')) {
            return this.validateColor(value);
        }

        // 尺寸相关变量
        if (lowerKey.includes('size') || lowerKey.includes('width') ||
            lowerKey.includes('height') || lowerKey.includes('radius') ||
            lowerKey.includes('spacing')) {
            return this.validateSize(value);
        }

        // 阴影相关变量
        if (lowerKey.includes('shadow')) {
            return this.validateShadow(value);
        }

        // 字体相关变量
        if (lowerKey.includes('font-family')) {
            return this.validateFontFamily(value);
        }

        // 过渡动画相关变量
        if (lowerKey.includes('transition')) {
            return this.validateTransition(value);
        }

        // 渐变相关变量
        if (lowerKey.includes('gradient')) {
            return this.validateGradient(value);
        }

        // 其他情况，只要是字符串就认为有效
        return true;
    }

    validateColor(value: string): boolean {
        // 支持 CSS 颜色值、rgba、hsla 等
        if (this.colorRegex.test(value.trim())) {
            return true;
        }

        // 特殊情况：transparent
        if (value.trim().toLowerCase() === 'transparent') {
            return true;
        }

        console.error(`无效的颜色值: ${value}`);
        return false;
    }

    validateSize(value: string): boolean {
        if (this.sizeRegex.test(value.trim())) {
            return true;
        }

        console.error(`无效的尺寸值: ${value}`);
        return false;
    }

    validateShadow(value: string): boolean {
        const trimmedValue = value.trim();

        if (trimmedValue === 'none') {
            return true;
        }

        // 简单的阴影验证（可以进一步完善）
        if (this.shadowRegex.test(trimmedValue)) {
            return true;
        }
        if (trimmedValue.includes('px') &&
            (trimmedValue.includes('rgba') || trimmedValue.includes('rgb') ||
             trimmedValue.includes('#') || /[a-zA-Z]+/.test(trimmedValue))) {
            return true;
        }

        console.error(`无效的阴影值: ${value}`);
        return false;
    }

    validateFontFamily(value: string): boolean {
        // 字体族名称验证（基本检查）
        if (typeof value === 'string' && value.trim().length > 0) {
            return true;
        }

        console.error(`无效的字体族: ${value}`);
        return false;
    }

    validateTransition(value: string): boolean {
        // 过渡动画验证（基本检查）
        const trimmedValue = value.trim();

        if (trimmedValue.includes('s') &&
            (trimmedValue.includes('ease') || trimmedValue.includes('linear') ||
             trimmedValue.includes('cubic-bezier'))) {
            return true;
        }

        console.error(`无效的过渡值: ${value}`);
        return false;
    }

    validateGradient(value: string): boolean {
        // 渐变验证（基本检查）
        const trimmedValue = value.trim();

        if (trimmedValue.startsWith('linear-gradient') ||
            trimmedValue.startsWith('radial-gradient') ||
            trimmedValue.startsWith('conic-gradient')) {
            return true;
        }

        console.error(`无效的渐变值: ${value}`);
        return false;
    }

    // 获取验证错误信息
    getValidationErrors(themeData: unknown): string[] {
        const errors: string[] = [];

        try {
            if (!this.validateStructure(themeData)) {
                errors.push('主题结构无效');
                return errors;
            }

            const data = themeData as ThemeConfig;
            if (data.theme) {
                for (const [key, value] of Object.entries(data.theme)) {
                    if (!this.validateVariable(key, value)) {
                        errors.push(`变量 ${key} 的值无效: ${value}`);
                    }
                }
            }
        } catch (error) {
            errors.push(`验证过程中发生错误: ${(error as Error).message}`);
        }

        return errors;
    }

    // 修复主题数据
    fixThemeData(themeData: ThemeConfig): ThemeConfig {
        const fixed: ThemeConfig = { ...themeData };

        // 确保有版本号
        if (!fixed.version) {
            fixed.version = '1.0';
        }

        // 确保主题变量键以--开头
        if (fixed.theme) {
            const fixedTheme: ThemeData = {};
            for (const [key, value] of Object.entries(fixed.theme)) {
                const fixedKey = key.startsWith('--') ? key : `--${key}`;
                fixedTheme[fixedKey] = value;
            }
            fixed.theme = fixedTheme;
        }

        return fixed;
    }
}
