/**
 * 更新UI组件 - 管理更新对话框和进度显示
 * @module update/updateUI
 */

import type { UpdateInfo, UpdateProgress } from './types';
import { formatFileSize, formatSpeed, formatETA } from './types';
import type { UpdateLogEntry } from './updateService';

/**
 * 更新UI管理器
 */
export class UpdateUI {
  private static instance: UpdateUI | null = null;
  private dialogElement: HTMLElement | null = null;
  private indicatorElement: HTMLElement | null = null;
  private debugPanelElement: HTMLElement | null = null;
  private progressInterval: number | null = null;
  private cssLoaded = false;

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): UpdateUI {
    if (!UpdateUI.instance) {
      UpdateUI.instance = new UpdateUI();
    }
    return UpdateUI.instance;
  }

  /**
   * 确保CSS已加载
   */
  private async ensureCSS(): Promise<void> {
    if (this.cssLoaded) return;

    // 检查是否已存在
    if (document.getElementById('update-ui-styles')) {
      this.cssLoaded = true;
      return;
    }

    // 注入CSS样式
    const style = document.createElement('style');
    style.id = 'update-ui-styles';
    style.textContent = this.getStyles();
    document.head.appendChild(style);
    this.cssLoaded = true;
  }

  /**
   * 显示更新指示器
   */
  async showIndicator(
    version: string,
    isCritical: boolean = false,
    onClick?: () => void
  ): Promise<HTMLElement | null> {
    await this.ensureCSS();

    // 移除现有指示器
    this.hideIndicator();

    // 创建指示器
    const indicator = document.createElement('div');
    indicator.className = `update-indicator ${isCritical ? 'critical' : ''}`;
    indicator.innerHTML = `
      <span class="update-indicator-dot"></span>
      <span class="update-indicator-text">新版本 ${version} 可用</span>
      <span class="update-indicator-arrow">›</span>
    `;

    if (onClick) {
      indicator.style.cursor = 'pointer';
      indicator.addEventListener('click', onClick);
    }

    document.body.appendChild(indicator);
    this.indicatorElement = indicator;

    // 2分钟后停止闪烁动画
    setTimeout(() => {
      if (indicator.parentNode) {
        indicator.style.animation = 'none';
      }
    }, 120000);

    // 非关键更新10分钟后自动隐藏
    if (!isCritical) {
      setTimeout(() => this.hideIndicator(), 600000);
    }

    return indicator;
  }

  /**
   * 隐藏更新指示器
   */
  hideIndicator(): void {
    if (this.indicatorElement) {
      this.indicatorElement.remove();
      this.indicatorElement = null;
    }
    // 也尝试移除其他可能存在的指示器
    document.querySelectorAll('.update-indicator').forEach(el => el.remove());
  }

  /**
   * 显示更新对话框
   */
  async showUpdateDialog(
    updateInfo: UpdateInfo,
    currentVersion: string,
    callbacks: UpdateDialogCallbacks
  ): Promise<void> {
    await this.ensureCSS();

    // 移除现有对话框
    this.closeDialog();

    const dialog = document.createElement('div');
    dialog.className = 'update-dialog-overlay';
    dialog.innerHTML = this.createDialogHTML(updateInfo, currentVersion);

    document.body.appendChild(dialog);
    this.dialogElement = dialog;

    // 绑定事件
    this.bindDialogEvents(dialog, updateInfo, callbacks);

    // 添加进入动画
    requestAnimationFrame(() => {
      dialog.classList.add('visible');
    });
  }

  /**
   * 创建对话框HTML
   */
  private createDialogHTML(updateInfo: UpdateInfo, currentVersion: string): string {
    const isCritical = updateInfo.is_critical ?? false;

    return `
      <div class="update-panel">
        <div class="update-panel-header">
          <div class="update-panel-title">
            <span class="update-title-dot ${isCritical ? 'critical' : ''}"></span>
            <span>${isCritical ? '重要更新' : '发现新版本'}</span>
          </div>
          <button class="update-panel-close" data-action="close">×</button>
        </div>

        <div class="update-panel-body">
          <div class="update-version-row">
            <span class="version-current">${currentVersion}</span>
            <span class="version-arrow">→</span>
            <span class="version-new">${updateInfo.version}</span>
          </div>

          ${updateInfo.file_size ? `
          <div class="update-meta">
            <span>${formatFileSize(updateInfo.file_size)}</span>
            ${updateInfo.release_date ? `<span>·</span><span>${updateInfo.release_date}</span>` : ''}
          </div>
          ` : ''}

          ${isCritical ? `
          <div class="update-critical-badge">安全更新，建议立即安装</div>
          ` : ''}

          <div class="update-progress-section" id="update-progress-section" style="display: none;">
            <div class="progress-bar-container">
              <div class="progress-bar" id="update-progress-bar"></div>
            </div>
            <div class="progress-info">
              <span class="progress-text" id="update-progress-text">准备下载...</span>
              <span class="progress-stats" id="update-progress-stats"></span>
            </div>
          </div>
        </div>

        <div class="update-panel-footer">
          ${!isCritical ? `
          <button class="update-btn-text" data-action="later">稍后</button>
          <button class="update-btn-text" data-action="skip">跳过</button>
          ` : ''}
          <button class="update-btn-primary" data-action="install">立即更新</button>
        </div>
      </div>
    `;
  }

  /**
   * 绑定对话框事件
   */
  private bindDialogEvents(
    dialog: HTMLElement,
    updateInfo: UpdateInfo,
    callbacks: UpdateDialogCallbacks
  ): void {
    dialog.addEventListener('click', async (e) => {
      const target = e.target as HTMLElement;
      const action = target.dataset.action;

      if (!action) {
        // 点击遮罩层关闭
        if (target.classList.contains('update-dialog-overlay')) {
          this.closeDialog();
          callbacks.onClose?.();
        }
        return;
      }

      switch (action) {
        case 'close':
          this.closeDialog();
          callbacks.onClose?.();
          break;

        case 'changelog':
          if (updateInfo.changelog_url) {
            window.open(updateInfo.changelog_url, '_blank');
          }
          break;

        case 'install':
          try {
            // 禁用所有按钮
            this.setButtonsDisabled(dialog, true);
            this.showProgress();
            await callbacks.onInstall?.();
          } catch (error) {
            this.hideProgress();
            this.setButtonsDisabled(dialog, false);
            this.showError((error as Error).message);
          }
          break;

        case 'later':
          this.closeDialog();
          callbacks.onLater?.();
          break;

        case 'skip':
          this.closeDialog();
          callbacks.onSkip?.();
          break;
      }
    });
  }

  /**
   * 显示进度区域
   */
  showProgress(): void {
    const section = document.getElementById('update-progress-section');
    if (section) {
      section.style.display = 'block';
    }
  }

  /**
   * 隐藏进度区域
   */
  hideProgress(): void {
    const section = document.getElementById('update-progress-section');
    if (section) {
      section.style.display = 'none';
    }
  }

  /**
   * 更新进度显示
   */
  updateProgress(progress: UpdateProgress): void {
    const bar = document.getElementById('update-progress-bar');
    const text = document.getElementById('update-progress-text');
    const stats = document.getElementById('update-progress-stats');

    if (bar) {
      bar.style.width = `${progress.progress}%`;
    }

    if (text) {
      text.textContent = progress.message || `${progress.stage}...`;
    }

    if (stats && progress.total_bytes > 0) {
      const downloaded = formatFileSize(progress.downloaded_bytes);
      const total = formatFileSize(progress.total_bytes);
      let statsText = `${downloaded} / ${total}`;

      if (progress.speed) {
        statsText += ` · ${formatSpeed(progress.speed)}`;
      }
      if (progress.eta) {
        statsText += ` · ${formatETA(progress.eta)}`;
      }

      stats.textContent = statsText;
    }
  }

  /**
   * 显示安装完成界面
   */
  showInstallComplete(): void {
    const panel = this.dialogElement?.querySelector('.update-panel');
    if (!panel) return;

    panel.innerHTML = `
      <div class="update-panel-header">
        <div class="update-panel-title">
          <span class="update-title-dot" style="background: #10b981;"></span>
          <span>更新完成</span>
        </div>
      </div>
      <div class="update-panel-body" style="text-align: center; padding: 24px 16px;">
        <div style="width: 48px; height: 48px; margin: 0 auto 16px; background: rgba(16, 185, 129, 0.1); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
        <p style="font-size: 14px; font-weight: 500; margin-bottom: 6px; color: var(--text-primary, #374151);">更新已成功安装</p>
        <p style="font-size: 12px; color: var(--text-secondary, #9ca3af);">应用程序将自动重启</p>
      </div>
      <div class="update-panel-footer" style="justify-content: center;">
        <button class="update-btn-primary" onclick="window.location.reload()">
          立即重启
        </button>
      </div>
    `;
  }

  /**
   * 显示错误信息
   */
  showError(message: string): void {
    const section = document.getElementById('update-progress-section');
    if (section) {
      section.innerHTML = `
        <div class="update-error">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="15" y1="9" x2="9" y2="15"></line>
            <line x1="9" y1="9" x2="15" y2="15"></line>
          </svg>
          <span>${message}</span>
        </div>
      `;
      section.style.display = 'block';
    }
  }

  /**
   * 关闭对话框
   */
  closeDialog(): void {
    if (this.dialogElement) {
      this.dialogElement.classList.remove('visible');
      setTimeout(() => {
        this.dialogElement?.remove();
        this.dialogElement = null;
      }, 300);
    }
    // 清除进度监控
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }

  /**
   * 设置按钮禁用状态
   */
  private setButtonsDisabled(dialog: HTMLElement, disabled: boolean): void {
    dialog.querySelectorAll('button').forEach(btn => {
      (btn as HTMLButtonElement).disabled = disabled;
    });
  }

  /**
   * 启动进度监控
   */
  startProgressMonitoring(getProgress: () => Promise<UpdateProgress>): void {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
    }

    this.progressInterval = window.setInterval(async () => {
      try {
        const progress = await getProgress();
        this.updateProgress(progress);
      } catch {
        // 忽略错误
      }
    }, 500);
  }

  /**
   * 停止进度监控
   */
  stopProgressMonitoring(): void {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }

  /**
   * 显示调试面板
   */
  async showDebugPanel(logs: UpdateLogEntry[]): Promise<void> {
    await this.ensureCSS();

    // 移除现有面板
    this.hideDebugPanel();

    const panel = document.createElement('div');
    panel.className = 'update-debug-panel';
    panel.innerHTML = this.createDebugPanelHTML(logs);

    document.body.appendChild(panel);
    this.debugPanelElement = panel;

    // 绑定事件
    this.bindDebugPanelEvents(panel);

    // 添加进入动画
    requestAnimationFrame(() => {
      panel.classList.add('visible');
    });
  }

  /**
   * 创建调试面板HTML
   */
  private createDebugPanelHTML(logs: UpdateLogEntry[]): string {
    const logsHTML = logs.length > 0
      ? logs.map(log => `
        <div class="debug-log-entry ${log.level.toLowerCase()}">
          <span class="log-time">${log.timestamp}</span>
          <span class="log-level ${log.level.toLowerCase()}">${log.level}</span>
          <span class="log-event">[${log.event}]</span>
          <span class="log-message">${log.message}</span>
          ${log.details ? `<div class="log-details">${log.details}</div>` : ''}
        </div>
      `).join('')
      : '<div class="debug-log-empty">暂无调试日志</div>';

    return `
      <div class="debug-panel-header">
        <h3>更新调试日志</h3>
        <div class="debug-panel-actions">
          <button class="debug-btn" data-action="refresh">刷新</button>
          <button class="debug-btn" data-action="clear">清除</button>
          <button class="debug-btn" data-action="copy">复制</button>
          <button class="debug-btn close" data-action="close">×</button>
        </div>
      </div>
      <div class="debug-panel-body">
        <div class="debug-log-container" id="debug-log-container">
          ${logsHTML}
        </div>
      </div>
      <div class="debug-panel-footer">
        <span class="log-count">共 ${logs.length} 条日志</span>
        <span class="log-filter">
          <label><input type="checkbox" checked data-filter="info"> INFO</label>
          <label><input type="checkbox" checked data-filter="warn"> WARN</label>
          <label><input type="checkbox" checked data-filter="error"> ERROR</label>
          <label><input type="checkbox" checked data-filter="debug"> DEBUG</label>
        </span>
      </div>
    `;
  }

  /**
   * 绑定调试面板事件
   */
  private bindDebugPanelEvents(panel: HTMLElement): void {
    panel.addEventListener('click', async (e) => {
      const target = e.target as HTMLElement;
      const action = target.dataset.action;

      if (!action) return;

      switch (action) {
        case 'close':
          this.hideDebugPanel();
          break;

        case 'refresh':
          // 触发刷新事件，由 UpdateManager 处理
          panel.dispatchEvent(new CustomEvent('debug-refresh'));
          break;

        case 'clear':
          // 触发清除事件，由 UpdateManager 处理
          panel.dispatchEvent(new CustomEvent('debug-clear'));
          break;

        case 'copy':
          this.copyDebugLogs(panel);
          break;
      }
    });

    // 过滤器事件
    panel.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      const filter = target.dataset.filter;
      if (filter) {
        this.toggleLogFilter(panel, filter, target.checked);
      }
    });
  }

  /**
   * 复制调试日志
   */
  private copyDebugLogs(panel: HTMLElement): void {
    const container = panel.querySelector('#debug-log-container');
    if (!container) return;

    const logs = Array.from(container.querySelectorAll('.debug-log-entry'))
      .map(entry => {
        const time = entry.querySelector('.log-time')?.textContent || '';
        const level = entry.querySelector('.log-level')?.textContent || '';
        const event = entry.querySelector('.log-event')?.textContent || '';
        const message = entry.querySelector('.log-message')?.textContent || '';
        const details = entry.querySelector('.log-details')?.textContent || '';
        return `${time} ${level} ${event} ${message}${details ? '\n  ' + details : ''}`;
      })
      .join('\n');

    navigator.clipboard.writeText(logs).then(() => {
      this.showToast('日志已复制到剪贴板');
    }).catch(() => {
      this.showToast('复制失败', 'error');
    });
  }

  /**
   * 切换日志过滤器
   */
  private toggleLogFilter(panel: HTMLElement, level: string, show: boolean): void {
    const entries = panel.querySelectorAll(`.debug-log-entry.${level}`);
    entries.forEach(entry => {
      (entry as HTMLElement).style.display = show ? '' : 'none';
    });
  }

  /**
   * 显示提示消息
   */
  private showToast(message: string, type: 'success' | 'error' = 'success'): void {
    const toast = document.createElement('div');
    toast.className = `update-toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('visible');
    });

    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }

  /**
   * 隐藏调试面板
   */
  hideDebugPanel(): void {
    if (this.debugPanelElement) {
      this.debugPanelElement.classList.remove('visible');
      setTimeout(() => {
        this.debugPanelElement?.remove();
        this.debugPanelElement = null;
      }, 300);
    }
  }

  /**
   * 更新调试面板日志
   */
  updateDebugLogs(logs: UpdateLogEntry[]): void {
    const container = document.getElementById('debug-log-container');
    if (!container) return;

    const logsHTML = logs.length > 0
      ? logs.map(log => `
        <div class="debug-log-entry ${log.level.toLowerCase()}">
          <span class="log-time">${log.timestamp}</span>
          <span class="log-level ${log.level.toLowerCase()}">${log.level}</span>
          <span class="log-event">[${log.event}]</span>
          <span class="log-message">${log.message}</span>
          ${log.details ? `<div class="log-details">${log.details}</div>` : ''}
        </div>
      `).join('')
      : '<div class="debug-log-empty">暂无调试日志</div>';

    container.innerHTML = logsHTML;

    // 更新计数
    const countEl = this.debugPanelElement?.querySelector('.log-count');
    if (countEl) {
      countEl.textContent = `共 ${logs.length} 条日志`;
    }
  }

  /**
   * 获取调试面板元素
   */
  getDebugPanel(): HTMLElement | null {
    return this.debugPanelElement;
  }

  /**
   * 获取样式
   */
  private getStyles(): string {
    return `
      /* ==========================================
         更新指示器 - 侧边简洁长条
         ========================================== */
      .update-indicator {
        position: fixed;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
        color: #ffffff;
        padding: 12px 20px;
        border-radius: 10px;
        font-size: 13px;
        font-weight: 500;
        box-shadow: 0 4px 20px rgba(99, 102, 241, 0.35);
        z-index: 9999;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        cursor: pointer;
        transition: all 0.25s ease;
        border: none;
        white-space: nowrap;
      }

      .update-indicator:hover {
        box-shadow: 0 6px 24px rgba(99, 102, 241, 0.45);
        transform: translateX(-50%) translateY(-2px);
      }

      .update-indicator-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #ffffff;
        flex-shrink: 0;
        animation: dotPulse 2s ease-in-out infinite;
        box-shadow: 0 0 6px rgba(255, 255, 255, 0.6);
      }

      .update-indicator-text {
        font-weight: 600;
        white-space: nowrap;
        color: #ffffff;
      }

      .update-indicator-arrow {
        color: rgba(255, 255, 255, 0.8);
        font-size: 16px;
        font-weight: 400;
        margin-left: 2px;
      }

      /* 关键更新样式 - 红色警告 */
      .update-indicator.critical {
        background: linear-gradient(135deg, #ef4444 0%, #f97316 100%);
        box-shadow: 0 4px 20px rgba(239, 68, 68, 0.4);
        animation: criticalGlow 2s ease-in-out infinite;
      }

      .update-indicator.critical:hover {
        box-shadow: 0 6px 24px rgba(239, 68, 68, 0.5);
        transform: translateX(-50%) translateY(-2px);
      }

      .update-indicator.critical .update-indicator-dot {
        background: #ffffff;
        box-shadow: 0 0 8px rgba(255, 255, 255, 0.8);
      }

      @keyframes dotPulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.7; transform: scale(0.85); }
      }

      @keyframes criticalGlow {
        0%, 100% { 
          box-shadow: 0 4px 20px rgba(239, 68, 68, 0.4);
        }
        50% { 
          box-shadow: 0 4px 28px rgba(239, 68, 68, 0.6);
        }
      }

      /* ==========================================
         更新面板 - 侧边弹出
         ========================================== */
      .update-dialog-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: transparent;
        z-index: 10000;
        pointer-events: none;
      }

      .update-dialog-overlay.visible {
        pointer-events: auto;
      }

      .update-panel {
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 320px;
        background: var(--bg-primary, #ffffff);
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
        border: 1px solid var(--border-color, rgba(0, 0, 0, 0.08));
        transform: translateX(calc(100% + 40px));
        opacity: 0;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        pointer-events: auto;
        overflow: hidden;
      }

      .update-dialog-overlay.visible .update-panel {
        transform: translateX(0);
        opacity: 1;
      }

      /* 面板头部 */
      .update-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 16px;
        border-bottom: 1px solid var(--border-color, #e5e7eb);
      }

      .update-panel-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 14px;
        font-weight: 600;
        color: var(--text-primary, #1f2937);
      }

      .update-title-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--primary-color, #667eea);
      }

      .update-title-dot.critical {
        background: #ef4444;
      }

      .update-panel-close {
        width: 28px;
        height: 28px;
        border: none;
        background: transparent;
        font-size: 18px;
        color: var(--text-secondary, #9ca3af);
        cursor: pointer;
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
      }

      .update-panel-close:hover {
        background: var(--bg-secondary, #f3f4f6);
        color: var(--text-primary, #374151);
      }

      /* 面板内容 */
      .update-panel-body {
        padding: 16px;
      }

      .update-version-row {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        padding: 12px;
        background: var(--bg-secondary, #f9fafb);
        border-radius: 8px;
        margin-bottom: 12px;
      }

      .version-current {
        font-size: 14px;
        color: var(--text-secondary, #6b7280);
        font-weight: 500;
      }

      .version-arrow {
        color: var(--text-secondary, #9ca3af);
        font-size: 12px;
      }

      .version-new {
        font-size: 14px;
        font-weight: 600;
        color: var(--primary-color, #667eea);
        background: rgba(102, 126, 234, 0.1);
        padding: 4px 10px;
        border-radius: 6px;
      }

      .update-meta {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        font-size: 12px;
        color: var(--text-secondary, #9ca3af);
        margin-bottom: 12px;
      }

      .update-critical-badge {
        background: rgba(239, 68, 68, 0.1);
        color: #dc2626;
        font-size: 12px;
        font-weight: 500;
        padding: 8px 12px;
        border-radius: 6px;
        text-align: center;
        margin-bottom: 12px;
      }

      /* 进度条 */
      .update-progress-section {
        margin-top: 12px;
        padding: 12px;
        background: var(--bg-secondary, #f9fafb);
        border-radius: 8px;
      }

      .progress-bar-container {
        background: var(--bg-tertiary, #e5e7eb);
        border-radius: 4px;
        height: 6px;
        overflow: hidden;
      }

      .progress-bar {
        height: 100%;
        width: 0%;
        background: var(--primary-color, #667eea);
        border-radius: 4px;
        transition: width 0.3s ease;
      }

      .progress-info {
        display: flex;
        justify-content: space-between;
        margin-top: 8px;
        font-size: 11px;
        color: var(--text-secondary, #9ca3af);
      }

      .progress-text {
        font-weight: 500;
      }

      .progress-stats {
        font-family: 'SF Mono', 'Consolas', monospace;
        font-size: 11px;
      }

      .update-error {
        display: flex;
        align-items: center;
        gap: 8px;
        color: #dc2626;
        font-size: 12px;
        padding: 10px 12px;
        background: rgba(239, 68, 68, 0.08);
        border-radius: 6px;
      }

      /* 面板底部 */
      .update-panel-footer {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        padding: 12px 16px;
        border-top: 1px solid var(--border-color, #e5e7eb);
        gap: 8px;
      }

      .update-btn-text {
        padding: 8px 12px;
        border: none;
        background: transparent;
        color: var(--text-secondary, #6b7280);
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        border-radius: 6px;
        transition: all 0.2s;
      }

      .update-btn-text:hover {
        background: var(--bg-secondary, #f3f4f6);
        color: var(--text-primary, #374151);
      }

      .update-btn-text:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .update-btn-primary {
        padding: 8px 16px;
        border: none;
        background: var(--primary-color, #667eea);
        color: white;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        border-radius: 6px;
        transition: all 0.2s;
      }

      .update-btn-primary:hover {
        filter: brightness(1.1);
      }

      .update-btn-primary:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      /* 调试面板样式 */
      .update-debug-panel {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) scale(0.9);
        width: 800px;
        max-width: 95vw;
        max-height: 80vh;
        background: var(--bg-primary, #1a1a2e);
        border-radius: 12px;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        z-index: 10001;
        display: flex;
        flex-direction: column;
        opacity: 0;
        transition: opacity 0.3s, transform 0.3s;
        font-family: 'Consolas', 'Monaco', monospace;
      }

      .update-debug-panel.visible {
        opacity: 1;
        transform: translate(-50%, -50%) scale(1);
      }

      .debug-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        border-bottom: 1px solid var(--border-color, #2d2d44);
        background: var(--bg-secondary, #16213e);
        border-radius: 12px 12px 0 0;
      }

      .debug-panel-header h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        color: var(--text-primary, #e0e0e0);
      }

      .debug-panel-actions {
        display: flex;
        gap: 8px;
      }

      .debug-btn {
        padding: 6px 12px;
        border: none;
        border-radius: 6px;
        background: var(--bg-tertiary, #2d2d44);
        color: var(--text-secondary, #a0a0a0);
        font-size: 12px;
        cursor: pointer;
        transition: all 0.2s;
      }

      .debug-btn:hover {
        background: var(--bg-hover, #3d3d54);
        color: var(--text-primary, #e0e0e0);
      }

      .debug-btn.close {
        background: transparent;
        font-size: 16px;
        padding: 4px 8px;
      }

      .debug-btn.close:hover {
        color: #f5576c;
      }

      .debug-panel-body {
        flex: 1;
        overflow: hidden;
        padding: 0;
      }

      .debug-log-container {
        height: 100%;
        max-height: 50vh;
        overflow-y: auto;
        padding: 12px;
      }

      .debug-log-entry {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        padding: 8px 12px;
        margin-bottom: 4px;
        border-radius: 6px;
        font-size: 12px;
        line-height: 1.5;
        background: var(--bg-secondary, #16213e);
      }

      .debug-log-entry.info {
        border-left: 3px solid #3b82f6;
      }

      .debug-log-entry.warn {
        border-left: 3px solid #f59e0b;
        background: rgba(245, 158, 11, 0.1);
      }

      .debug-log-entry.error {
        border-left: 3px solid #ef4444;
        background: rgba(239, 68, 68, 0.1);
      }

      .debug-log-entry.debug {
        border-left: 3px solid #8b5cf6;
        opacity: 0.8;
      }

      .log-time {
        color: #6b7280;
        font-size: 11px;
        white-space: nowrap;
      }

      .log-level {
        font-weight: 600;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 10px;
        text-transform: uppercase;
      }

      .log-level.info {
        color: #3b82f6;
        background: rgba(59, 130, 246, 0.2);
      }

      .log-level.warn {
        color: #f59e0b;
        background: rgba(245, 158, 11, 0.2);
      }

      .log-level.error {
        color: #ef4444;
        background: rgba(239, 68, 68, 0.2);
      }

      .log-level.debug {
        color: #8b5cf6;
        background: rgba(139, 92, 246, 0.2);
      }

      .log-event {
        color: #10b981;
        font-weight: 500;
      }

      .log-message {
        color: var(--text-primary, #e0e0e0);
        flex: 1;
      }

      .log-details {
        width: 100%;
        margin-top: 4px;
        padding: 8px;
        background: rgba(0, 0, 0, 0.2);
        border-radius: 4px;
        color: #9ca3af;
        font-size: 11px;
        white-space: pre-wrap;
        word-break: break-all;
      }

      .debug-log-empty {
        text-align: center;
        color: #6b7280;
        padding: 40px;
        font-size: 14px;
      }

      .debug-panel-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 20px;
        border-top: 1px solid var(--border-color, #2d2d44);
        background: var(--bg-secondary, #16213e);
        border-radius: 0 0 12px 12px;
        font-size: 12px;
        color: #6b7280;
      }

      .log-filter {
        display: flex;
        gap: 12px;
      }

      .log-filter label {
        display: flex;
        align-items: center;
        gap: 4px;
        cursor: pointer;
      }

      .log-filter input[type="checkbox"] {
        width: 14px;
        height: 14px;
        cursor: pointer;
      }

      /* Toast 提示样式 */
      .update-toast {
        position: fixed;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%) translateY(20px);
        padding: 12px 24px;
        background: var(--bg-primary, #1a1a2e);
        color: var(--text-primary, #e0e0e0);
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        z-index: 10002;
        opacity: 0;
        transition: all 0.3s;
      }

      .update-toast.visible {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }

      .update-toast.error {
        background: #dc2626;
        color: white;
      }
    `;
  }
}

/**
 * 对话框回调接口
 */
export interface UpdateDialogCallbacks {
  onInstall?: () => Promise<void>;
  onLater?: () => void;
  onSkip?: () => void;
  onClose?: () => void;
}

/**
 * 获取UpdateUI实例
 */
export function getUpdateUI(): UpdateUI {
  return UpdateUI.getInstance();
}
