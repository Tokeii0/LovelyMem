/**
 * 窗口主题适配器
 * 用于子窗口（CSV查看器、字符串搜索、文件管理器等）的主题管理
 *
 * 使用方法：
 * 1. 在HTML中引入主题CSS文件：
 *    <link rel="stylesheet" href="src/css/theme/base.css" id="theme-base">
 *    <link rel="stylesheet" href="src/css/theme/light.css" id="theme-light">
 *
 * 2. 在JavaScript中初始化：
 *    import { WindowThemeAdapter } from './src/modules/ui/windowThemeAdapter';
 *    const themeAdapter = new WindowThemeAdapter();
 *    await themeAdapter.init();
 */

/** 后端返回的主题设置结构（仅声明本模块用到的字段） */
interface ThemeSettings {
  current_theme?: string;
}

/** 主题变化事件负载 */
interface ThemeChangedPayload {
  theme?: string;
}

export class WindowThemeAdapter {
  private currentTheme: string;
  private initialized: boolean;

  constructor() {
    this.currentTheme = 'light';
    this.initialized = false;
  }

  /**
   * 初始化主题适配器
   */
  async init(): Promise<void> {
    if (this.initialized) {
      console.warn('⚠️ 主题适配器已经初始化');
      return;
    }

    try {
      // 1. 从后端加载当前主题
      await this.loadThemeFromBackend();

      // 2. 监听主题变化事件
      await this.setupThemeListener();

      // 3. 监听localStorage变化（备用方案）
      this.setupStorageListener();

      this.initialized = true;
      console.log(`✅ 窗口主题适配器初始化完成，当前主题: ${this.currentTheme}`);
    } catch (error) {
      console.error('❌ 主题适配器初始化失败:', error);
      // 降级到默认主题
      this.applyTheme('light');
    }
  }

  /**
   * 从后端加载主题设置
   */
  async loadThemeFromBackend(): Promise<void> {
    try {
      if (typeof (window as any).__TAURI__ === 'undefined') {
        console.warn('⚠️ 非Tauri环境，使用默认主题');
        this.applyTheme('light');
        return;
      }

      const { invoke } = await import('@tauri-apps/api/core');
      const themeSettings = await invoke<ThemeSettings>('get_theme_settings');

      if (themeSettings && themeSettings.current_theme) {
        //console.log('✅ 从后端加载的主题设置:', themeSettings.current_theme);
        this.applyTheme(themeSettings.current_theme);
      } else {
        // 如果后端没有主题设置，尝试从 localStorage 加载
        const savedTheme = localStorage.getItem('theme') || 'light';
        console.log('✅ 从 localStorage 加载主题:', savedTheme);
        this.applyTheme(savedTheme);
      }
    } catch (error) {
      console.error('❌ 从后端加载主题失败:', error);
      // 尝试从localStorage加载
      const savedTheme = localStorage.getItem('theme') || 'light';
      this.applyTheme(savedTheme);
    }
  }

  /**
   * 设置主题变化监听器
   */
  async setupThemeListener(): Promise<void> {
    try {
      if (typeof (window as any).__TAURI__ === 'undefined') {
        return;
      }

      const { listen } = await import('@tauri-apps/api/event');

      // 监听主题变化事件
      await listen<ThemeChangedPayload>('theme-changed', (event) => {
        console.log('🎨 收到主题变化事件:', event.payload);
        if (event.payload && event.payload.theme) {
          this.applyTheme(event.payload.theme);
        }
      });

      console.log('✅ 主题监听器已设置');
    } catch (error) {
      console.error('❌ 设置主题监听器失败:', error);
    }
  }

  /**
   * 设置localStorage监听器（备用方案）
   */
  setupStorageListener(): void {
    window.addEventListener('storage', (e: StorageEvent) => {
      if (e.key === 'theme' && e.newValue) {
        console.log('🎨 从localStorage检测到主题变化:', e.newValue);
        this.applyTheme(e.newValue);
      }
    });
  }

  /**
   * 应用主题
   * @param theme - 主题名称 ('light' | 'dark' | 'sakura')
   */
  applyTheme(theme: string): void {
    try {
      // 查找现有的主题样式表链接（统一使用 theme-stylesheet ID）
      const themeLink = (document.getElementById('theme-stylesheet')
        || document.getElementById('theme-light')
        || document.getElementById(`theme-${theme}`)) as HTMLLinkElement | null;

      if (themeLink) {
        // 直接更新 href，保持路径前缀一致
        const currentHref = themeLink.href;
        const prefix = currentHref.includes('/src/') ? '/src' : 'src';
        themeLink.href = `${prefix}/css/theme/${theme}.css`;
        themeLink.id = 'theme-stylesheet';
      } else {
        // 如果没有找到现有链接，创建新的
        const newLink = document.createElement('link');
        newLink.rel = 'stylesheet';
        newLink.id = 'theme-stylesheet';
        newLink.href = `/src/css/theme/${theme}.css`;
        document.head.appendChild(newLink);
      }

      // 设置 data-theme 属性到 body 和 html
      document.body.setAttribute('data-theme', theme);
      document.documentElement.setAttribute('data-theme', theme);

      // 同时保存到 localStorage 作为备份
      localStorage.setItem('theme', theme);

      this.currentTheme = theme;
      console.log(`🎨 主题已应用: ${theme}`);
    } catch (error) {
      console.error('❌ 应用主题失败:', error);
    }
  }

  /**
   * 获取当前主题
   * @returns 当前主题名称
   */
  getCurrentTheme(): string {
    return this.currentTheme;
  }

  /**
   * 获取主题显示名称
   * @param theme - 主题名称
   * @returns 主题显示名称
   */
  getThemeDisplayName(theme: string): string {
    const themeNames: Record<string, string> = {
      'light': '浅色',
      'dark': '深色',
      'sakura': '樱花'
    };
    return themeNames[theme] || theme;
  }
}

// 导出单例实例
export const windowThemeAdapter = new WindowThemeAdapter();

// 默认导出类
export default WindowThemeAdapter;
