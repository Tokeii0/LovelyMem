/**
 * 启动管理器
 * 负责启动界面渲染、进度更新和动画控制
 * 现代简约 / 毛玻璃风格，纯 CSS 动画背景
 */

import { StateManager } from '../core/stateManager';
import { getAppVersion } from '../core/appVersion';

export class StartupManager {
  constructor(private stateManager: StateManager) {}

  /**
   * 渲染启动屏幕
   */
  async render(): Promise<void> {
    await this.loadStyles();

    const app = document.getElementById('app');
    if (app) {
      const currentTheme = this.stateManager.getTheme();

      app.innerHTML = `
        <div class="modern-startup-screen" data-theme="${currentTheme}">
          <!-- CSS 渐变色块背景 -->
          <div class="startup-bg-mesh">
            <div class="mesh-blob blob-1"></div>
            <div class="mesh-blob blob-2"></div>
            <div class="mesh-blob blob-3"></div>
          </div>

          <!-- 中心内容 -->
          <div class="startup-center">
            <div class="logo-container">
              <img src="assets/logo_100.png" alt="Lovelymem V2" class="startup-logo cyber-logo" />
            </div>
            <div class="app-title">Lovelymem V2</div>
            <div class="app-subtitle">Memory Forensics</div>
            <div class="progress-section">
              <div class="progress-track">
                <div class="progress-fill"></div>
              </div>
              <div class="status-text">正在初始化...</div>
            </div>
          </div>

          <!-- 版本号 -->
          <div class="version-text app-version-text">...</div>
        </div>
      `;

      this.injectVersion();
    }
  }

  private async injectVersion(): Promise<void> {
    const ver = await getAppVersion();
    document.querySelectorAll('.version-text.app-version-text').forEach(el => {
      el.textContent = ver;
    });
  }

  /**
   * 更新进度条和状态文字
   */
  updateProgress(message: string, progress: number): void {
    const statusText = document.querySelector('.status-text') as HTMLElement;
    const progressFill = document.querySelector('.progress-fill') as HTMLElement;

    if (statusText) {
      statusText.textContent = message;
      if (message.includes('成功')) {
        statusText.style.color = 'var(--s-accent)';
        statusText.style.fontWeight = '600';
      }
    }

    if (progressFill) {
      progressFill.style.width = `${Math.min(progress, 100)}%`;
    }
  }

  /**
   * 播放成功动画
   */
  animateSuccess(): void {
    const progressFill = document.querySelector('.progress-fill') as HTMLElement;
    const statusText = document.querySelector('.status-text') as HTMLElement;

    if (progressFill) {
      progressFill.style.width = '100%';
      progressFill.style.background = 'linear-gradient(90deg, #22c55e, #16a34a)';
    }

    if (statusText) {
      statusText.style.color = 'var(--s-accent)';
    }
  }

  /**
   * 淡出启动屏幕
   */
  async fadeOut(): Promise<void> {
    const screen = document.querySelector('.modern-startup-screen') as HTMLElement;
    if (screen) {
      screen.style.animation = 'fadeOutUp 0.4s ease-out forwards';
      await new Promise(resolve => setTimeout(resolve, 400));
    }
  }

  private loadStyles(): Promise<void> {
    return new Promise((resolve) => {
      if (document.getElementById('modern-startup-styles')) {
        resolve();
        return;
      }

      const link = document.createElement('link');
      link.id = 'modern-startup-styles';
      link.rel = 'stylesheet';
      link.href = 'src/css/modern-startup.css';

      link.onload = () => resolve();
      link.onerror = () => resolve();

      document.head.appendChild(link);
    });
  }
}
