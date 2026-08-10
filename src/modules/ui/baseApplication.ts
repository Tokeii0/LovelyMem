import { getCurrentWindow } from "@tauri-apps/api/window";
import { StateManager } from '../core/stateManager';
import { ModernUIRenderer } from './modernUIRenderer';
import { CommandWindowManager } from './commandWindowManager';
import { MessageManager } from '../utils';
import { themeLoader } from './themeLoader';

/**
 * 基础应用类
 * 包含通用的功能和方法，避免代码重复
 */
export abstract class BaseApplication {
  protected stateManager: StateManager;
  protected modernUIRenderer: ModernUIRenderer;
  protected commandWindowManager: CommandWindowManager;

  constructor() {
    this.stateManager = new StateManager();
    this.modernUIRenderer = new ModernUIRenderer(this.stateManager.getState());
    this.commandWindowManager = new CommandWindowManager(this.stateManager);
  }



  /**
   * 加载现代化样式
   * 使用新的主题系统
   */
  protected loadModernStyles(): void {
    const modernStyleLink = document.createElement('link');
    modernStyleLink.rel = 'stylesheet';
    modernStyleLink.href = '/src/modernStyles.css';
    document.head.appendChild(modernStyleLink);

    // 同时加载内联样式文件
    this.loadInlineStyles();
  }

  /**
   * 加载内联样式文件
   */
  protected loadInlineStyles(): void {
    if (document.getElementById('inline-styles')) {
      return;
    }

    const link = document.createElement('link');
    link.id = 'inline-styles';
    link.rel = 'stylesheet';
    link.href = 'src/css/inline-styles.css';
    document.head.appendChild(link);
  }

  /**
   * 绑定窗口控制事件
   */
  protected bindWindowControls(): void {
    const minimizeBtn = document.getElementById('minimize-btn');
    const maximizeBtn = document.getElementById('maximize-btn');
    const closeBtn = document.getElementById('close-btn');

    minimizeBtn?.addEventListener('click', async () => {
      try {
        if (typeof window !== 'undefined' && (window as any).__TAURI__) {
          const appWindow = getCurrentWindow();
          await appWindow.minimize();
        }
      } catch (error) {
        console.error('最小化窗口失败:', error);
      }
    });

    maximizeBtn?.addEventListener('click', async () => {
      try {
        if (typeof window !== 'undefined' && (window as any).__TAURI__) {
          const appWindow = getCurrentWindow();
          const isMaximized = await appWindow.isMaximized();
          if (isMaximized) {
            await appWindow.unmaximize();
          } else {
            await appWindow.maximize();
          }
        }
      } catch (error) {
        console.error('切换窗口最大化状态失败:', error);
      }
    });

    closeBtn?.addEventListener('click', async () => {
      try {
        if (typeof window !== 'undefined' && (window as any).__TAURI__) {
          console.log('🚪 用户点击关闭按钮');

          // 直接关闭窗口，不执行进程清理（只有主窗口才需要清理进程）
          const appWindow = getCurrentWindow();
          await appWindow.close();
        }
      } catch (error) {
        console.error('关闭窗口失败:', error);
      }
    });
  }

  /**
   * 绑定键盘快捷键
   * 子类可覆盖此方法以注册更多快捷键
   */
  protected bindKeyboardShortcuts(): void {
    // 基类不再内联绑定，由子类通过 KeyboardShortcutManager 统一管理
    // 保留空实现以兼容其他继承类
  }

  /**
   * 初始化动画效果
   */
  protected initAnimations(): void {
    setTimeout(() => {
      document.querySelectorAll('.area-section').forEach((section, index) => {
        (section as HTMLElement).style.animationDelay = `${index * 0.1}s`;
        section.classList.add('fadeIn');
      });
    }, 100);

    setTimeout(() => {
      document.querySelectorAll('.modern-feature-card').forEach((card, index) => {
        (card as HTMLElement).style.animationDelay = `${index * 0.05}s`;
        card.classList.add('scaleIn');
      });
    }, 300);
  }

  /**
   * 切换主题
   * 使用新的主题加载器
   */
  async toggleTheme(): Promise<void> {
    try {
      // 使用主题加载器切换到下一个主题
      const newTheme = await themeLoader.switchToNextTheme();

      // 同步到 StateManager
      this.stateManager.setTheme(newTheme);

      // 保存主题设置到后端
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('set_current_theme', { theme: newTheme });

      // 保存到本地存储
      themeLoader.saveThemeToStorage();

      const themeName = themeLoader.getThemeDisplayName(newTheme);
      console.log(`✅ 主题已切换: ${newTheme} (${themeName})`);
      MessageManager.showSuccess(`已切换到${themeName}模式`);

      // 通知其他窗口主题变化
      await this.notifyThemeChange(newTheme);

      // 更新UI
      this.modernUIRenderer.updateState(this.stateManager.getState());
      this.updateTitleBar();

    } catch (error) {
      console.error('❌ 切换主题失败:', error);
      MessageManager.showError('切换主题失败');
    }
  }

  /**
   * 设置特定主题
   */
  async setTheme(theme: string): Promise<void> {
    try {
      // 应用主题
      await themeLoader.switchTheme(theme as any);

      // 同步到 StateManager
      this.stateManager.setTheme(theme as any);

      // 保存主题设置到后端
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('set_current_theme', { theme: theme });

      // 保存到本地存储
      themeLoader.saveThemeToStorage();

      const themeName = themeLoader.getThemeDisplayName(theme as any);
      console.log(`✅ 主题已设置: ${theme} (${themeName})`);
      MessageManager.showSuccess(`已切换到${themeName}模式`);

      // 通知其他窗口主题变化
      await this.notifyThemeChange(theme);

      // 更新UI
      this.modernUIRenderer.updateState(this.stateManager.getState());
      this.updateTitleBar();

    } catch (error) {
      console.error('❌ 设置主题失败:', error);
      MessageManager.showError('设置主题失败');
    }
  }

  /**
   * 通知其他窗口主题变化
   */
  private async notifyThemeChange(theme: string): Promise<void> {
    try {
      const { emit } = await import('@tauri-apps/api/event');
      await emit('theme-changed', { theme });
      console.log(`✅ 已发送主题变化事件: ${theme}`);
    } catch (error) {
      console.warn('发送主题变化事件失败:', error);
    }
  }

  /**
   * 更新标题栏
   */
  protected updateTitleBar(): void {
    const titleBar = document.querySelector('.modern-title-bar');
    if (!titleBar) return;

    this.modernUIRenderer.updateState(this.stateManager.getState());
    const newTitleBarContent = this.modernUIRenderer.renderTitleBar();
    
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = newTitleBarContent;
    const newContent = tempDiv.firstElementChild;
    
    if (newContent) {
      titleBar.replaceWith(newContent);
      this.bindWindowControls();
      
      // 重新初始化标题栏文本循环
      setTimeout(async () => {
        try {
          const { titleBarCarousel } = await import('./titleBarCarousel');
          if (titleBarCarousel) {
            titleBarCarousel.init();
          }
        } catch (error) {
          console.warn('⚠️ 重新初始化标题栏文本循环失败:', error);
        }
      }, 50);
    }
  }

  /**
   * 切换命令窗口
   */
  toggleCommandWindow(): void {
    this.commandWindowManager.toggleCommandWindow();
  }

  /**
   * 更新命令窗口显示
   */
  protected updateCommandWindowDisplay(): void {
    this.commandWindowManager.updateCommandWindowDisplay();
  }

  /**
   * 更新状态显示
   */
  updateStatus(text: string): void {
    const statusText = document.querySelector('#task-status .status-text');
    if (statusText) {
      statusText.textContent = text;
    }
  }

  /**
   * 更新侧边栏激活状态
   */
  updateSidebarActiveState(areaIndex: number): void {
    // 清除所有区域的激活状态
    document.querySelectorAll('.area-item').forEach(item => {
      item.classList.remove('active');
    });
    
    // 设置当前区域为激活状态
    const currentArea = document.querySelector(`.area-item[data-area-index="${areaIndex}"]`);
    if (currentArea) {
      currentArea.classList.add('active');
    }
  }

  // 抽象方法，需要在子类中实现
  abstract loadImageFile(forceOs?: 'windows' | 'linux'): Promise<void>;
  abstract unloadImageFile(): Promise<void>;
  abstract render(): void;
  abstract init(): Promise<void>;

  // 功能处理方法，需要在子类中实现
  // abstract handleCSVReaderFeature(): void;
  // abstract handleTextViewerFeature(): void;
  // abstract handleMemoryFileBrowserFeature(): void;
  // abstract handleEXIFViewerFeature(): void;

  // 访问器方法
  getStateManager(): StateManager {
    return this.stateManager;
  }

  getUIRenderer(): ModernUIRenderer {
    return this.modernUIRenderer;
  }
}