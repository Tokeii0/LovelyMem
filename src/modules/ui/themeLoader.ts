/**
 * 主题加载器
 * 负责动态加载和切换主题CSS文件
 */

export type ThemeName = 'light' | 'dark' | 'sakura';

export class ThemeLoader {
  private static instance: ThemeLoader;
  private currentTheme: ThemeName = 'light';
  private baseLoaded: boolean = false;
  private themeStyleElement: HTMLLinkElement | null = null;

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): ThemeLoader {
    if (!ThemeLoader.instance) {
      ThemeLoader.instance = new ThemeLoader();
    }
    return ThemeLoader.instance;
  }

  /**
   * 初始化主题系统
   * 加载基础样式和默认主题
   */
  async initialize(defaultTheme: ThemeName = 'light'): Promise<void> {
    try {
      // 1. 加载基础样式（只加载一次）
      if (!this.baseLoaded) {
        await this.loadBaseStyles();
        this.baseLoaded = true;
        //console.log('✅ 基础样式已加载');
      }

      // 2. 加载默认主题
      await this.loadTheme(defaultTheme);
      //console.log(`✅ 主题系统初始化完成，当前主题: ${defaultTheme}`);
    } catch (error) {
      console.error('❌ 主题系统初始化失败:', error);
      throw error;
    }
  }

  /**
   * 加载基础样式
   */
  private loadBaseStyles(): Promise<void> {
    return new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.id = 'theme-base-styles';
      link.rel = 'stylesheet';
      link.href = 'src/css/theme/base.css';
      
      link.onload = () => resolve();
      link.onerror = () => reject(new Error('Failed to load base styles'));
      
      document.head.appendChild(link);
    });
  }

  /**
   * 加载指定主题
   */
  async loadTheme(themeName: ThemeName): Promise<void> {
    return new Promise((resolve, reject) => {
      // 移除旧的主题样式
      if (this.themeStyleElement) {
        this.themeStyleElement.remove();
        this.themeStyleElement = null;
      }

      // 创建新的主题样式链接
      const link = document.createElement('link');
      link.id = 'theme-stylesheet';
      link.rel = 'stylesheet';
      link.href = `src/css/theme/${themeName}.css`;
      
      link.onload = () => {
        this.currentTheme = themeName;
        this.updateBodyAttribute(themeName);
        console.log(`✅ 主题已切换: ${themeName}`);
        resolve();
      };
      
      link.onerror = () => {
        console.error(`❌ 主题加载失败: ${themeName}`);
        reject(new Error(`Failed to load theme: ${themeName}`));
      };
      
      this.themeStyleElement = link;
      document.head.appendChild(link);
    });
  }

  /**
   * 更新 body 的 data-theme 属性
   */
  private updateBodyAttribute(themeName: ThemeName): void {
    document.body.setAttribute('data-theme', themeName);
    document.documentElement.setAttribute('data-theme', themeName);
    
    // 移除旧的主题类
    document.body.classList.remove('light-theme', 'dark-theme', 'sakura-theme');
    // 添加新的主题类
    document.body.classList.add(`${themeName}-theme`);
  }

  /**
   * 切换到下一个主题
   */
  async switchToNextTheme(): Promise<ThemeName> {
    const themes: ThemeName[] = ['light', 'dark', 'sakura'];
    const currentIndex = themes.indexOf(this.currentTheme);
    const nextIndex = (currentIndex + 1) % themes.length;
    const nextTheme = themes[nextIndex];
    
    await this.loadTheme(nextTheme);
    return nextTheme;
  }

  /**
   * 切换到指定主题
   */
  async switchTheme(themeName: ThemeName): Promise<void> {
    if (themeName === this.currentTheme) {
      console.log(`⚠️ 已经是 ${themeName} 主题，无需切换`);
      return;
    }
    
    await this.loadTheme(themeName);
  }

  /**
   * 获取当前主题
   */
  getCurrentTheme(): ThemeName {
    return this.currentTheme;
  }

  /**
   * 获取主题显示名称
   */
  getThemeDisplayName(themeName?: ThemeName): string {
    const theme = themeName || this.currentTheme;
    const names: Record<ThemeName, string> = {
      'light': '浅色',
      'dark': '深色',
      'sakura': '少女樱花粉',
    };
    return names[theme];
  }

  /**
   * 预加载所有主题（可选，用于优化性能）
   */
  async preloadAllThemes(): Promise<void> {
    const themes: ThemeName[] = ['light', 'dark', 'sakura'];
    const promises = themes.map(theme => {
      return new Promise<void>((resolve) => {
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = `src/css/theme/${theme}.css`;
        link.onload = () => resolve();
        link.onerror = () => resolve(); // 即使失败也继续
        document.head.appendChild(link);
      });
    });
    
    await Promise.all(promises);
    console.log('✅ 所有主题已预加载');
  }

  /**
   * 从本地存储恢复主题
   */
  async restoreThemeFromStorage(): Promise<void> {
    try {
      const savedTheme = localStorage.getItem('theme') as ThemeName | null;
      if (savedTheme && ['light', 'dark', 'sakura'].includes(savedTheme)) {
        await this.loadTheme(savedTheme);
        console.log(`✅ 从本地存储恢复主题: ${savedTheme}`);
      }
    } catch (error) {
      console.error('❌ 从本地存储恢复主题失败:', error);
    }
  }

  /**
   * 保存主题到本地存储
   */
  saveThemeToStorage(): void {
    try {
      localStorage.setItem('theme', this.currentTheme);
      console.log(`✅ 主题已保存到本地存储: ${this.currentTheme}`);
    } catch (error) {
      console.error('❌ 保存主题到本地存储失败:', error);
    }
  }

  /**
   * 检测系统主题偏好
   */
  detectSystemTheme(): ThemeName {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  }

  /**
   * 监听系统主题变化
   */
  watchSystemTheme(callback: (theme: ThemeName) => void): void {
    if (window.matchMedia) {
      const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
      darkModeQuery.addEventListener('change', (e) => {
        const newTheme = e.matches ? 'dark' : 'light';
        callback(newTheme);
      });
    }
  }
}

// 导出单例实例
export const themeLoader = ThemeLoader.getInstance();

