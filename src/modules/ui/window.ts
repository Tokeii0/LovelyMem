/**
 * 窗口管理器
 * 处理Tauri窗口控制和窗口相关操作
 */

import { getCurrentWindow } from "@tauri-apps/api/window";

export class WindowManager {

  /**
   * 绑定窗口控制按钮事件
   */
  bindWindowControls(): void {
    const minimizeBtn = document.getElementById('minimize-btn');
    const maximizeBtn = document.getElementById('maximize-btn');
    const closeBtn = document.getElementById('close-btn');

    minimizeBtn?.addEventListener('click', async () => {
      try {
        // 检查 Tauri API 是否可用
        if (typeof window !== 'undefined' && (window as any).__TAURI__) {
          const appWindow = getCurrentWindow();
          await appWindow.minimize();
          //console.log('窗口已最小化');
        } else {
          //console.log('Tauri API 不可用，模拟最小化');
        }
      } catch (error) {
        console.error('最小化窗口失败:', error);
      }
    });

    maximizeBtn?.addEventListener('click', async () => {
      try {
        // 检查 Tauri API 是否可用
        if (typeof window !== 'undefined' && (window as any).__TAURI__) {
          const appWindow = getCurrentWindow();
          const isMaximized = await appWindow.isMaximized();
          if (isMaximized) {
            await appWindow.unmaximize();
            //console.log('窗口已恢复');
          } else {
            await appWindow.maximize();
            //console.log('窗口已最大化');
          }
          // 操作完成后更新图标
          setTimeout(() => this.updateMaximizeButtonIcon(), 100);
        } else {
          //console.log('Tauri API 不可用，模拟最大化/恢复');
        }
      } catch (error) {
        console.error('切换窗口最大化状态失败:', error);
      }
    });

    closeBtn?.addEventListener('click', async () => {
      try {
        // 检查 Tauri API 是否可用
        if (typeof window !== 'undefined' && (window as any).__TAURI__) {
          //console.log('🚪 用户点击关闭按钮');

          // 直接关闭窗口，不执行进程清理（只有主窗口才需要清理进程）
          const appWindow = getCurrentWindow();
          await appWindow.close();
          //console.log('窗口已关闭');
        } else {
          //console.log('Tauri API 不可用，模拟关闭窗口');
        }
      } catch (error) {
        console.error('关闭窗口失败:', error);
      }
    });

    // 延迟更新最大化按钮图标，确保Tauri API已完全初始化
    setTimeout(() => {
      this.updateMaximizeButtonIcon().catch(error => {
        console.warn('初始化最大化按钮图标失败:', error);
      });
    }, 1000);
  }

  /**
   * 更新最大化按钮图标
   */
  private async updateMaximizeButtonIcon(): Promise<void> {
    try {
      const maximizeBtn = document.getElementById('maximize-btn');
      
      if (!maximizeBtn) return;
      
      // 检查 Tauri API 是否可用
      if (typeof window !== 'undefined' && (window as any).__TAURI__) {
        const appWindow = getCurrentWindow();
        const isMaximized = await appWindow.isMaximized();
        const svg = maximizeBtn.querySelector('svg');
        
        if (svg) {
          if (isMaximized) {
            // 恢复图标 (两个重叠的方框)
            svg.innerHTML = '<path d="M3 3h6v6H3zM5 5h6v6H5z" stroke="currentColor" stroke-width="1.5" fill="none"/>';
          } else {
            // 最大化图标 (单个方框)
            svg.innerHTML = '<path d="M6 6h12v12H6z" stroke="currentColor" stroke-width="1.5" fill="none"/>';
          }
        }
      }
    } catch (error) {
      console.error('更新最大化按钮图标失败:', error);
    }
  }



  /**
   * 打开主题编辑器
   */
  async openThemeEditor(): Promise<void> {
    try {
      const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      
      const themeEditorWindow = new WebviewWindow(`theme-editor-${Date.now()}`, {
        url: 'theme_editor.html',
        title: 'LovelyTheme Editor - 主题编辑器',
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        resizable: true,
        decorations: false, // 无边框
        transparent: false,
        alwaysOnTop: false,
        center: true,
        skipTaskbar: false
      });

      // 监听窗口创建事件
      themeEditorWindow.once('tauri://created', () => {
        //console.log('主题编辑器窗口已创建');
      });

      // 监听窗口错误事件
      themeEditorWindow.once('tauri://error', (e) => {
        console.error('主题编辑器窗口创建失败:', e);
        this.showErrorMessage('无法创建主题编辑器窗口');
      });

      this.updateStatus('主题编辑器已打开');
    } catch (error) {
      console.error('打开主题编辑器失败:', error);
      this.showErrorMessage('无法打开主题编辑器');
    }
  }

  /**
   * 使元素可拖拽
   */
  makeDraggable(element: HTMLElement): void {
    const header = element.querySelector('.command-window-header, .files-window-header') as HTMLElement;
    if (!header) return;

    let isDragging = false;
    let currentX = 0;
    let currentY = 0;
    let initialX = 0;
    let initialY = 0;

    header.addEventListener('mousedown', (e) => {
      isDragging = true;
      initialX = e.clientX - currentX;
      initialY = e.clientY - currentY;
      header.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', (e) => {
      if (isDragging) {
        e.preventDefault();
        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;

        element.style.transform = `translate(${currentX}px, ${currentY}px)`;
      }
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        header.style.cursor = 'move';
      }
    });
  }

  /**
   * 更新状态文本
   */
  private updateStatus(text: string): void {
    const statusText = document.querySelector('#task-status .status-text');
    if (statusText) {
      statusText.textContent = text;
    }
  }

  /**
   * 显示错误消息
   */
  private showErrorMessage(message: string): void {
    const toast = document.createElement('div');
    toast.className = 'toast-message toast-error';
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    // 添加显示类触发动画
    setTimeout(() => toast.classList.add('show'), 10);
    
    // 3秒后移除
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
} 