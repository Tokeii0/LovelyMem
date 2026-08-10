/**
 * AI 助手 独立窗口控制器
 * 负责：挂载聊天界面、标题栏窗口控制、吸附到屏幕右侧
 */

import { getCurrentWindow, currentMonitor } from '@tauri-apps/api/window';
import { PhysicalPosition, PhysicalSize } from '@tauri-apps/api/dpi';
import { AIChatRenderer } from '../../ui/components/AIChatRenderer';

const DOCK_STORAGE_KEY = 'ai-window-docked';
const DOCK_WIDTH_LOGICAL = 420;
const FLOAT_WIDTH_LOGICAL = 420;
const FLOAT_HEIGHT_LOGICAL = 820;

export class AIAssistantWindow {
  private renderer: AIChatRenderer;
  private isDocked = false;

  constructor() {
    // 标记为独立窗口模式（CSS 据此隐藏「弹出」按钮、调整布局）
    document.body.classList.add('ai-standalone');

    this.renderer = new AIChatRenderer({} as any);
    this.mountChat();
    this.bindWindowControls();
    this.bindDockButton();

    // 恢复上次吸附状态
    this.isDocked = (() => {
      try { return localStorage.getItem(DOCK_STORAGE_KEY) === '1'; } catch { return false; }
    })();
    if (this.isDocked) {
      // 窗口创建后立即重新吸附
      void this.dockToRight();
    } else {
      this.updateDockButton();
    }
  }

  /** 将聊天界面渲染进内容容器 */
  private mountChat(): void {
    const content = document.getElementById('ai-window-content');
    if (!content) {
      console.error('[AIAssistantWindow] 未找到内容容器 #ai-window-content');
      return;
    }
    content.innerHTML = this.renderer.render();
  }

  /** 绑定标题栏最小化/最大化/关闭 */
  private bindWindowControls(): void {
    const win = getCurrentWindow();
    document.querySelector('.ai-win-min-btn')?.addEventListener('click', () => {
      void win.minimize();
    });
    document.querySelector('.ai-win-max-btn')?.addEventListener('click', async () => {
      try {
        const maximized = await win.isMaximized();
        if (maximized) {
          await win.unmaximize();
        } else {
          await win.maximize();
        }
      } catch (e) {
        console.error('[AIAssistantWindow] 切换最大化失败', e);
      }
    });
    document.querySelector('.ai-win-close-btn')?.addEventListener('click', () => {
      void win.close();
    });
  }

  /** 绑定吸附按钮 */
  private bindDockButton(): void {
    document.querySelector('.ai-win-dock-btn')?.addEventListener('click', () => {
      void this.toggleDock();
    });
  }

  private async toggleDock(): Promise<void> {
    if (this.isDocked) {
      await this.undock();
    } else {
      await this.dockToRight();
    }
  }

  /** 吸附到当前显示器右缘：满高、置顶 */
  private async dockToRight(): Promise<void> {
    try {
      const win = getCurrentWindow();
      const monitor = await currentMonitor();
      if (!monitor) {
        console.warn('[AIAssistantWindow] 无法获取显示器信息');
        return;
      }
      const scale = monitor.scaleFactor || 1;
      const dockWidth = Math.round(DOCK_WIDTH_LOGICAL * scale);
      const mw = monitor.size.width;
      const mh = monitor.size.height;
      const mx = monitor.position.x;
      const my = monitor.position.y;

      await win.setAlwaysOnTop(true);
      await win.setSize(new PhysicalSize(dockWidth, mh));
      await win.setPosition(new PhysicalPosition(mx + mw - dockWidth, my));

      this.isDocked = true;
      try { localStorage.setItem(DOCK_STORAGE_KEY, '1'); } catch { /* ignore */ }
      this.updateDockButton();
    } catch (e) {
      console.error('[AIAssistantWindow] 吸附失败', e);
    }
  }

  /** 取消吸附，恢复浮动窗口 */
  private async undock(): Promise<void> {
    try {
      const win = getCurrentWindow();
      const monitor = await currentMonitor();
      const scale = monitor?.scaleFactor || 1;

      await win.setAlwaysOnTop(false);
      await win.setSize(new PhysicalSize(
        Math.round(FLOAT_WIDTH_LOGICAL * scale),
        Math.round(FLOAT_HEIGHT_LOGICAL * scale),
      ));
      await win.center();

      this.isDocked = false;
      try { localStorage.setItem(DOCK_STORAGE_KEY, '0'); } catch { /* ignore */ }
      this.updateDockButton();
    } catch (e) {
      console.error('[AIAssistantWindow] 取消吸附失败', e);
    }
  }

  private updateDockButton(): void {
    const btn = document.querySelector('.ai-win-dock-btn');
    if (!btn) return;
    btn.classList.toggle('active', this.isDocked);
    btn.setAttribute('title', this.isDocked ? '取消吸附（恢复浮动）' : '吸附到屏幕右侧');
  }
}
