/**
 * 独立文件管理器应用
 */

import { FilePanelManager } from '../modules/ui/filePanelManager';
import { windowThemeAdapter } from '../modules/ui/windowThemeAdapter';
import { initMountDrive } from '../modules/core/mountDrive';

class FileManagerApp {
  private filePanelManager: FilePanelManager | null = null;
  private isInitialized = false;

  /**
   * 初始化应用
   */
  async init(): Promise<void> {
    try {
      console.log('🗂️ 初始化文件管理器应用');

      // 绑定标题栏事件
      await this.bindTitleBarEvents();

      // 初始化文件面板管理器
      this.filePanelManager = new FilePanelManager((message: string) => {
        this.updateStatus(message);
      });

      // 创建文件面板内容
      await this.createFilePanel();

      // 绑定主题切换
      await this.bindThemeEvents();

      this.isInitialized = true;
      console.log('✅ 文件管理器应用初始化完成', this.isInitialized);

    } catch (error) {
      console.error('❌ 文件管理器应用初始化失败:', error);
      this.updateStatus('初始化失败');
    }
  }

  /**
   * 绑定标题栏事件
   */
  async bindTitleBarEvents(): Promise<void> {
    try {
      // 检查是否在Tauri环境中
      if (typeof (window as any).__TAURI__ === 'undefined') {
        console.log('非Tauri环境，使用模拟窗口控制');
        return;
      }

      // Tauri v2 API
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const appWindow = getCurrentWindow();

      // 最小化按钮
      const minimizeBtn = document.getElementById('minimize-btn');
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
      const maximizeBtn = document.getElementById('maximize-btn');
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
            console.error('切换最大化状态失败:', error);
          }
        });
      }

      // 关闭按钮
      const closeBtn = document.getElementById('close-btn');
      if (closeBtn) {
        closeBtn.addEventListener('click', async () => {
          try {
            await appWindow.close();
          } catch (error) {
            console.error('关闭窗口失败:', error);
          }
        });
      }

      // 监听窗口状态变化
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
      console.warn('Tauri API不可用:', error);
    }
  }

  /**
   * 更新最大化按钮状态
   */
  updateMaximizeButton(isMaximized: boolean): void {
    const maximizeBtn = document.getElementById('maximize-btn');
    if (!maximizeBtn) return;

    const svg = maximizeBtn.querySelector('svg');
    if (!svg) return;

    if (isMaximized) {
      // 还原图标
      svg.innerHTML = `<path d="M6 6h8v8H6zM10 10h8v8h-8z"/>`;
      maximizeBtn.title = '还原';
    } else {
      // 最大化图标
      svg.innerHTML = `<path d="M6 6h12v12H6z"/>`;
      maximizeBtn.title = '最大化';
    }
  }

  /**
   * 创建文件面板
   */
  async createFilePanel(): Promise<void> {
    try {
      // 获取文件面板容器
      const fileListContainer = document.querySelector('.file-list');
      const breadcrumbContainer = document.querySelector('.breadcrumb-container');

      if (!fileListContainer || !breadcrumbContainer) {
        throw new Error('找不到文件面板容器');
      }

      // 使用文件面板管理器的逻辑
      await this.filePanelManager?.initializeStandaloneFilePanel();

    } catch (error) {
      console.error('创建文件面板失败:', error);
      this.updateStatus('加载文件列表失败');
    }
  }

  /**
   * 绑定主题事件
   */
  async bindThemeEvents(): Promise<void> {
    try {
      // 使用统一的窗口主题适配器
      await windowThemeAdapter.init();
      console.log(`🎨 文件管理器主题初始化完成: ${windowThemeAdapter.getCurrentTheme()}`);
    } catch (error) {
      console.warn('⚠️ 主题初始化失败:', error);
    }
  }

  /**
   * 更新状态栏
   */
  updateStatus(message: string): void {
    const statusText = document.querySelector('.status-text');
    if (statusText) {
      statusText.textContent = message;
    }
  }

  /**
   * 更新文件计数
   */
  updateFileCount(count: number): void {
    const fileCount = document.querySelector('.file-count');
    if (fileCount) {
      fileCount.textContent = `${count} 个项目`;
    }
  }
}

// 应用入口
document.addEventListener('DOMContentLoaded', async () => {
  // 初始化挂载盘符缓存（须早于面板路径拼接）
  await initMountDrive();

  const app = new FileManagerApp();
  await app.init();

  // 将应用实例暴露到全局，方便调试
  (window as any).fileManagerApp = app;
});

// 错误处理
window.addEventListener('error', (event) => {
  console.error('全局错误:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('未处理的Promise拒绝:', event.reason);
});

export default FileManagerApp;
