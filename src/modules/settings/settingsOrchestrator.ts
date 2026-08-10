/**
 * 设置协调器
 * 管理设置验证和配置对话框
 */

import { invoke } from "@tauri-apps/api/core";
import { listen } from '@tauri-apps/api/event';
import { formatBytes } from '../../utils/formatters';
import { MessageManager } from '../utils/message';
import { IconParkHelper } from '../utils/iconparkHelper';

/** 获取图标 SVG（与程序内设置保持一致） */
function getIcon(name: string, size: number = 16): string {
  return IconParkHelper.getSvgString(name, { size, strokeWidth: 3 });
}

/** 按严重程度返回对应图标 */
function severityIcon(severity: string): string {
  if (severity === 'Critical') return getIcon('close-circle', 18);
  if (severity === 'Warning') return getIcon('warning', 18);
  return getIcon('info', 18);
}

export class SettingsOrchestrator {
  /**
   * 验证应用设置（在启动时）
   */
  async validateOnStartup(onProgressUpdate?: (message: string, progress: number) => void): Promise<void> {
    try {
      console.log('🔍 开始验证应用设置...');
      onProgressUpdate?.('正在验证应用设置...', 85);

      const validationResult = await invoke('validate_settings_on_startup') as any;

      // 处理设置验证结果
      if (validationResult && typeof validationResult === 'object') {
        // 检查是否有关键问题
        const criticalIssues = validationResult.issues.filter((issue: any) => issue.severity === 'Critical');

        if (criticalIssues.length > 0) {
          console.log('❌ 发现关键设置问题，需要用户配置');
          await this.showValidationDialog(validationResult);
        } else {
          // 输出警告日志
          validationResult.issues.forEach((issue: any) => {
            console.warn(`⚠️ 设置问题 [${issue.severity}] - ${issue.field_name}: ${issue.description}`);
          });
        }
      } else {
        console.log('✅ 应用设置验证通过');
      }

      onProgressUpdate?.('设置验证完成', 90);
    } catch (error) {
      console.error('❌ 设置验证失败:', error);
    }
  }

  /**
   * 显示设置验证对话框
   */
  private async showValidationDialog(validationResult: any): Promise<void> {
    return new Promise((resolve) => {
      // 检查是否有 Python 环境缺失问题
      const pythonEnvIssue = validationResult.issues.find((issue: any) => issue.issue_type === 'PythonEnvMissing');
      
      if (pythonEnvIssue) {
        this.showPythonEnvFixDialog(pythonEnvIssue, resolve);
      } else {
        this.showNormalValidationDialog(validationResult, resolve);
      }
    });
  }

  /**
   * 显示 Python 环境修复对话框
   */
  private async showPythonEnvFixDialog(issue: any, resolve: () => void): Promise<void> {
    const dialog = document.createElement('div');
    dialog.className = 'settings-validation-dialog';
    dialog.innerHTML = `
      <div class="settings-validation-overlay">
        <div class="settings-validation-content">
          <div class="settings-validation-header">
            <span class="sv-header-icon">${getIcon('config', 20)}</span>
            <h3>MemProcFS Python 环境需要修复</h3>
          </div>
          <div class="settings-validation-body">
            <p class="validation-summary">${issue.description}</p>
            <div class="validation-issues">
              <div class="validation-issue critical">
                <div class="issue-icon">${getIcon('close-circle', 18)}</div>
                <div class="issue-content">
                  <div class="issue-title">${issue.field_name}</div>
                  <div class="issue-description">检测到 MemProcFS 环境异常</div>
                  <div class="issue-description">点击"立即修复"后，程序会自动修复 MemProcFS 环境</div>
                </div>
              </div>
            </div>
            <div class="python-fix-progress" style="display: none;">
              <div class="progress-label">修复进度</div>
              <div class="pixel-progress-bar">
                <div class="pixel-progress-fill" style="width: 0%;">
                  <span class="progress-text">0%</span>
                </div>
              </div>
              <div class="progress-status">正在准备修复环境...</div>
              <div class="progress-details">
                <div class="detail-item">
                  <span class="detail-label">文件</span>
                  <span class="detail-value progress-files">0 / 0</span>
                </div>
                <div class="detail-item">
                  <span class="detail-label">数据</span>
                  <span class="detail-value progress-bytes">0 B / 0 B</span>
                </div>
                <div class="detail-item current-file">当前文件：-</div>
              </div>
            </div>
          </div>
          <div class="settings-validation-footer">
            <button class="settings-validation-btn settings-validation-fix">立即修复</button>
            <button class="settings-validation-btn settings-validation-later">稍后处理</button>
          </div>
        </div>
      </div>
    `;

    this.addValidationStyles();
    this.addProgressBarStyles();

    const fixBtn = dialog.querySelector('.settings-validation-fix');
    const laterBtn = dialog.querySelector('.settings-validation-later');
    const progressContainer = dialog.querySelector('.python-fix-progress') as HTMLElement;
    const progressFill = dialog.querySelector('.pixel-progress-fill') as HTMLElement;
    const progressText = dialog.querySelector('.progress-text') as HTMLElement;
    const progressStatus = dialog.querySelector('.progress-status') as HTMLElement;
    const progressFiles = dialog.querySelector('.progress-files') as HTMLElement;
    const progressBytes = dialog.querySelector('.progress-bytes') as HTMLElement;
    const currentFileEl = dialog.querySelector('.current-file') as HTMLElement;

    let unlisten: (() => void) | null = null;
    let operationCompleted = false;

    const cleanup = () => {
      if (unlisten) {
        unlisten();
        unlisten = null;
      }
    };

    const resetProgress = () => {
      progressFill.style.width = '0%';
      progressText.textContent = '0%';
      progressStatus.textContent = '正在准备修复环境...';
      progressFiles.textContent = '0 / 0';
      progressBytes.textContent = '0 B / 0 B';
      currentFileEl.textContent = '当前文件：-';
    };

    const handleFailure = (message: string) => {
      MessageManager.showError(message);
      fixBtn?.removeAttribute('disabled');
      laterBtn?.removeAttribute('disabled');
      progressContainer.style.display = 'none';
    };

    fixBtn?.addEventListener('click', async () => {
      try {
        progressContainer.style.display = 'block';
        resetProgress();
        fixBtn.setAttribute('disabled', 'true');
        laterBtn?.setAttribute('disabled', 'true');

        cleanup();

        unlisten = await listen('fix-python-progress', (event) => {
          const payload = event.payload as any;
          if (!payload) return;

          const percent = Math.min(Math.max(Number(payload.percent) || 0, 0), 100);
          const statusText = payload.status || '处理中...';
          const currentFile = payload.current_file ? ` (${payload.current_file})` : '';

          progressFill.style.width = `${percent}%`;
          progressText.textContent = `${Math.round(percent)}%`;
          progressStatus.textContent = `${statusText}${currentFile}`;

          if (progressFiles) {
            const filesDone = Number(payload.files_done) || 0;
            const filesTotal = Number(payload.files_total) || 0;
            progressFiles.textContent = `${filesDone} / ${filesTotal}`;
          }

          if (progressBytes) {
            const copiedBytes = Number(payload.copied_bytes) || 0;
            const totalBytes = Number(payload.total_bytes) || 0;
            progressBytes.textContent = `${formatBytes(copiedBytes)} / ${formatBytes(totalBytes)}`;
          }

          if (currentFileEl && payload.current_file) {
            currentFileEl.textContent = `当前文件：${payload.current_file}`;
          }

          if (payload.completed) {
            operationCompleted = true;
            cleanup();

            if (payload.success) {
              MessageManager.showSuccess(payload.message || 'MemProcFS Python 环境修复完成');
              dialog.remove();
              resolve();
            } else {
              handleFailure(payload.message || 'MemProcFS Python 环境修复失败');
            }
          }
        });

        await invoke('fix_memprocfs_python_env');

        if (!operationCompleted) {
          MessageManager.showSuccess('MemProcFS Python 环境修复完成');
          dialog.remove();
          resolve();
        }
      } catch (error) {
        cleanup();
        if (!operationCompleted) {
          handleFailure(String(error));
        }
      }
    });

    laterBtn?.addEventListener('click', () => {
      cleanup();
      dialog.remove();
      resolve();
    });

    document.body.appendChild(dialog);
  }

  /**
   * 显示普通设置验证对话框
   */
  private showNormalValidationDialog(validationResult: any, resolve: () => void): void {
    const dialog = document.createElement('div');
    dialog.className = 'settings-validation-dialog';
    dialog.innerHTML = `
      <div class="settings-validation-overlay">
        <div class="settings-validation-content">
          <div class="settings-validation-header">
            <span class="sv-header-icon">${getIcon('setting', 20)}</span>
            <h3>应用设置需要配置</h3>
          </div>
          <div class="settings-validation-body">
            <p class="validation-summary">${validationResult.summary}</p>
            <div class="validation-issues">
              ${validationResult.issues.map((issue: any) => `
                <div class="validation-issue ${issue.severity.toLowerCase()}">
                  <div class="issue-icon">${severityIcon(issue.severity)}</div>
                  <div class="issue-content">
                    <div class="issue-title">${issue.field_name}</div>
                    <div class="issue-description">${issue.description}</div>
                    ${issue.current_value ? `<div class="issue-current">当前值: ${issue.current_value}</div>` : ''}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
          <div class="settings-validation-footer">
            <button class="settings-validation-btn settings-validation-configure">一键配置</button>
            <button class="settings-validation-btn settings-validation-later">稍后配置</button>
          </div>
        </div>
      </div>
    `;

    this.addValidationStyles();

    const configureBtn = dialog.querySelector('.settings-validation-configure');
    const laterBtn = dialog.querySelector('.settings-validation-later');

    configureBtn?.addEventListener('click', async () => {
      const btn = configureBtn as HTMLButtonElement;
      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = '智能搜索中...';
      if (laterBtn) (laterBtn as HTMLButtonElement).disabled = true;

      try {
        // 智能探测工具路径（多目录搜索 + 校验存在），合并到现有设置后直接保存
        const detected = await invoke('smart_detect_app_paths') as Record<string, { path: string; found: boolean; source: string }>;
        const current = await invoke('get_app_settings_command') as Record<string, any>;
        const merged = { ...current };

        let toolCount = 0;
        for (const [field, item] of Object.entries(detected)) {
          if (item && item.found && item.path) {
            merged[field] = item.path;
            if (item.source !== 'derived') toolCount++;
          }
        }

        await invoke('save_settings_command', { settings: merged });

        // 广播设置更新，让主应用实时刷新状态
        const { emit } = await import('@tauri-apps/api/event');
        await emit('settings-updated', merged);

        MessageManager.showSuccess(`已智能匹配并自动保存 ${toolCount} 项工具配置`);
        dialog.remove();
        resolve();
      } catch (e) {
        console.error('智能配置失败:', e);
        btn.disabled = false;
        btn.textContent = originalText;
        if (laterBtn) (laterBtn as HTMLButtonElement).disabled = false;
        MessageManager.showError('智能配置失败: ' + String(e));
      }
    });

    laterBtn?.addEventListener('click', () => {
      dialog.remove();
      resolve();
    });

    document.body.appendChild(dialog);
  }

  /**
   * 添加验证对话框样式
   */
  private addValidationStyles(): void {
    if (document.getElementById('settings-validation-styles')) return;

    const style = document.createElement('style');
    style.id = 'settings-validation-styles';
    style.textContent = `
      .settings-validation-dialog {
        position: fixed;
        inset: 0;
        z-index: 10000;
      }
      .settings-validation-overlay {
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(8px);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .settings-validation-content {
        background: var(--bg-secondary);
        color: var(--text-primary);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-lg, 16px);
        box-shadow: var(--shadow-xl, 0 20px 25px -5px rgba(0, 0, 0, 0.25));
        padding: 28px;
        max-width: 540px;
        width: 92%;
        max-height: 84vh;
        overflow-y: auto;
      }
      /* 头部：图标块 + 标题（与程序内设置一致） */
      .settings-validation-header {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 6px;
      }
      .settings-validation-header .sv-header-icon {
        display: inline-flex;
        width: 40px;
        height: 40px;
        align-items: center;
        justify-content: center;
        border-radius: var(--radius, 8px);
        background: linear-gradient(135deg, var(--primary-color), var(--secondary-color));
        color: #fff;
        flex-shrink: 0;
      }
      .settings-validation-header h3 {
        margin: 0;
        font-size: 18px;
        font-weight: 700;
        color: var(--text-primary);
      }
      .validation-summary {
        margin: 6px 0 18px;
        font-size: 13.5px;
        color: var(--text-secondary);
        line-height: 1.6;
      }
      /* 问题卡片 */
      .validation-issues {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .validation-issue {
        display: flex;
        gap: 12px;
        align-items: flex-start;
        padding: 14px 16px;
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-left: 3px solid var(--text-light);
        border-radius: var(--radius, 8px);
      }
      .validation-issue.critical { border-left-color: var(--error-color); }
      .validation-issue.warning { border-left-color: var(--warning-color); }
      .validation-issue.info { border-left-color: var(--info-color); }
      .validation-issue .issue-icon {
        display: inline-flex;
        flex-shrink: 0;
        margin-top: 1px;
        color: var(--text-light);
      }
      .validation-issue.critical .issue-icon { color: var(--error-color); }
      .validation-issue.warning .issue-icon { color: var(--warning-color); }
      .validation-issue.info .issue-icon { color: var(--info-color); }
      .issue-content { min-width: 0; flex: 1; }
      .issue-title { font-size: 14px; font-weight: 600; color: var(--text-primary); margin-bottom: 3px; }
      .issue-description { font-size: 12.5px; color: var(--text-secondary); line-height: 1.55; }
      .issue-current {
        font-size: 12px;
        color: var(--text-light);
        margin-top: 5px;
        word-break: break-all;
        font-family: ui-monospace, monospace;
      }
      /* 底部按钮（与设置弹窗一致） */
      .settings-validation-footer {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        margin-top: 22px;
      }
      .settings-validation-btn {
        padding: 10px 22px;
        border: none;
        border-radius: var(--radius, 8px);
        cursor: pointer;
        font-size: 14px;
        font-weight: 600;
        transition: var(--transition, all 0.2s ease);
      }
      .settings-validation-btn:disabled { opacity: 0.55; cursor: not-allowed; }
      .settings-validation-configure,
      .settings-validation-fix {
        background: linear-gradient(135deg, var(--primary-color), var(--secondary-color));
        color: #fff;
        box-shadow: var(--shadow-sm);
      }
      .settings-validation-configure:hover:not(:disabled),
      .settings-validation-fix:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: var(--shadow-md);
      }
      .settings-validation-later {
        background: var(--bg-tertiary);
        color: var(--text-secondary);
        border: 1px solid var(--border-color);
      }
      .settings-validation-later:hover:not(:disabled) {
        color: var(--text-primary);
        border-color: var(--primary-color);
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * 添加进度条样式
   */
  private addProgressBarStyles(): void {
    if (document.getElementById('progress-bar-styles')) return;

    const style = document.createElement('style');
    style.id = 'progress-bar-styles';
    style.textContent = `
      .python-fix-progress { margin-top: 16px; }
      .progress-label { font-size: 13px; font-weight: 600; color: var(--text-primary); margin-bottom: 8px; }
      .pixel-progress-bar {
        width: 100%;
        height: 22px;
        background: var(--bg-tertiary);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-sm, 6px);
        overflow: hidden;
        position: relative;
      }
      .pixel-progress-fill {
        height: 100%;
        background: linear-gradient(90deg, var(--primary-color), var(--secondary-color));
        transition: width 0.3s ease;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .progress-text {
        color: #fff;
        font-weight: 700;
        font-size: 11px;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
      }
      .progress-status { font-size: 12.5px; color: var(--text-secondary); margin-top: 8px; }
      .progress-details {
        margin-top: 10px;
        display: flex;
        flex-wrap: wrap;
        gap: 8px 18px;
        font-size: 12px;
        color: var(--text-light);
      }
      .detail-item { display: flex; gap: 6px; align-items: center; }
      .detail-label { color: var(--text-light); }
      .detail-value { color: var(--text-secondary); font-weight: 600; }
      .current-file { width: 100%; word-break: break-all; }
    `;
    document.head.appendChild(style);
  }
}
