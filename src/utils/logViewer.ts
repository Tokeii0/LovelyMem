/**
 * 日志查看器
 * 提供日志文件查看和管理功能
 */

import { invoke } from '@tauri-apps/api/core';
import { showConfirm } from '../modules/core/confirmDialog';

interface LogFile {
  name: string;
  path: string;
  size: number;
  modified: string;
}

class LogViewer {
  private isOpen = false;
  private currentLogFile: string | null = null;

  /**
   * 打开日志查看器
   */
  async openLogViewer(): Promise<void> {
    if (this.isOpen) {
      return;
    }

    this.isOpen = true;
    await this.createLogViewerWindow();
  }

  /**
   * 创建日志查看器窗口
   */
  private async createLogViewerWindow(): Promise<void> {
    const existingViewer = document.querySelector('.log-viewer-overlay');
    if (existingViewer) {
      existingViewer.remove();
    }

    const overlay = document.createElement('div');
    overlay.className = 'log-viewer-overlay';
    overlay.innerHTML = `
      <div class="log-viewer-container">
        <div class="log-viewer-header">
          <h3>📋 前端日志查看器</h3>
          <div class="log-viewer-controls">
            <button class="btn-refresh" title="刷新日志列表">🔄</button>
            <button class="btn-clear-logs" title="清空所有日志">🗑️</button>
            <button class="btn-close" title="关闭">✕</button>
          </div>
        </div>
        
        <div class="log-viewer-body">
          <div class="log-files-panel">
            <h4>日志文件</h4>
            <div class="log-files-list" id="logFilesList">
              <div class="loading">加载中...</div>
            </div>
          </div>
          
          <div class="log-content-panel">
            <div class="log-content-header">
              <span id="currentLogFile">选择一个日志文件查看内容</span>
              <div class="log-content-controls">
                <button class="btn-download" title="下载日志文件" disabled>💾</button>
                <button class="btn-clear-current" title="清空当前日志" disabled>🧹</button>
              </div>
            </div>
            <div class="log-content" id="logContent">
              <div class="log-placeholder">
                <p>📝 选择左侧的日志文件来查看内容</p>
                <p>日志文件按日期自动分割，便于管理和查看</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // 添加样式
    const style = document.createElement('style');
    style.textContent = `
      .log-viewer-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        backdrop-filter: blur(5px);
      }
      
      .log-viewer-container {
        background: var(--bg-primary, #1a1a1a);
        border: 1px solid var(--border-color, #333);
        border-radius: 12px;
        width: 90vw;
        height: 80vh;
        max-width: 1200px;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
      }
      
      .log-viewer-header {
        background: var(--bg-secondary, #2a2a2a);
        padding: 16px 20px;
        border-bottom: 1px solid var(--border-color, #333);
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      
      .log-viewer-header h3 {
        margin: 0;
        color: var(--text-primary, #fff);
        font-size: 18px;
      }
      
      .log-viewer-controls {
        display: flex;
        gap: 8px;
      }
      
      .log-viewer-controls button {
        background: var(--bg-tertiary, #3a3a3a);
        border: 1px solid var(--border-color, #555);
        color: var(--text-primary, #fff);
        padding: 8px 12px;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s;
      }
      
      .log-viewer-controls button:hover {
        background: var(--accent-color, #4a9eff);
        transform: translateY(-1px);
      }
      
      .log-viewer-body {
        flex: 1;
        display: flex;
        overflow: hidden;
      }
      
      .log-files-panel {
        width: 300px;
        background: var(--bg-secondary, #2a2a2a);
        border-right: 1px solid var(--border-color, #333);
        display: flex;
        flex-direction: column;
      }
      
      .log-files-panel h4 {
        margin: 0;
        padding: 16px 20px;
        color: var(--text-primary, #fff);
        border-bottom: 1px solid var(--border-color, #333);
        font-size: 14px;
        font-weight: 600;
      }
      
      .log-files-list {
        flex: 1;
        overflow-y: auto;
        padding: 8px;
      }
      
      .log-file-item {
        padding: 12px 16px;
        margin: 4px 0;
        background: var(--bg-tertiary, #3a3a3a);
        border: 1px solid transparent;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s;
      }

      .log-file-item:hover {
        background: var(--bg-hover, #4a4a4a);
        border-color: var(--accent-color, #4a9eff);
      }

      .log-file-item.active {
        background: var(--accent-color, #4a9eff);
        color: white;
      }

      .log-file-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 4px;
      }

      .log-file-icon {
        font-size: 16px;
        flex-shrink: 0;
      }

      .log-file-name {
        font-weight: 600;
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .log-file-type {
        font-size: 11px;
        padding: 2px 6px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 4px;
        flex-shrink: 0;
      }

      .log-file-info {
        font-size: 12px;
        opacity: 0.7;
        margin-left: 24px;
      }
      
      .log-content-panel {
        flex: 1;
        display: flex;
        flex-direction: column;
      }
      
      .log-content-header {
        padding: 16px 20px;
        background: var(--bg-secondary, #2a2a2a);
        border-bottom: 1px solid var(--border-color, #333);
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      
      .log-content-controls {
        display: flex;
        gap: 8px;
      }
      
      .log-content {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
        font-family: 'Consolas', 'Monaco', monospace;
        font-size: 13px;
        line-height: 1.5;
        background: var(--bg-primary, #1a1a1a);
      }
      
      .log-placeholder {
        text-align: center;
        color: var(--text-secondary, #888);
        margin-top: 100px;
      }
      
      .log-entry {
        margin-bottom: 8px;
        padding: 8px 12px;
        border-radius: 4px;
        border-left: 3px solid transparent;
      }
      
      .log-entry.log { border-left-color: #4a9eff; }
      .log-entry.info { border-left-color: #00d4aa; }
      .log-entry.warn { border-left-color: #ffb84d; }
      .log-entry.error { border-left-color: #ff6b6b; }
      .log-entry.debug { border-left-color: #9c88ff; }
      
      .log-timestamp {
        color: var(--text-secondary, #888);
        margin-right: 12px;
      }
      
      .log-level {
        font-weight: 600;
        margin-right: 12px;
        text-transform: uppercase;
        font-size: 11px;
      }
      
      .loading {
        text-align: center;
        padding: 20px;
        color: var(--text-secondary, #888);
      }
    `;
    
    document.head.appendChild(style);
    document.body.appendChild(overlay);

    // 绑定事件
    this.bindLogViewerEvents(overlay);
    
    // 加载日志文件列表
    await this.loadLogFiles();
  }

  /**
   * 绑定事件
   */
  private bindLogViewerEvents(overlay: HTMLElement): void {
    // 关闭按钮
    overlay.querySelector('.btn-close')?.addEventListener('click', () => {
      this.closeLogViewer();
    });

    // 点击遮罩关闭
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this.closeLogViewer();
      }
    });

    // 刷新按钮
    overlay.querySelector('.btn-refresh')?.addEventListener('click', () => {
      this.loadLogFiles();
    });

    // 清空所有日志按钮
    overlay.querySelector('.btn-clear-logs')?.addEventListener('click', () => {
      this.clearAllLogs();
    });

    // 下载按钮
    overlay.querySelector('.btn-download')?.addEventListener('click', () => {
      this.downloadCurrentLog();
    });

    // 清空当前日志按钮
    overlay.querySelector('.btn-clear-current')?.addEventListener('click', () => {
      this.clearCurrentLog();
    });
  }

  /**
   * 加载日志文件列表
   */
  private async loadLogFiles(): Promise<void> {
    const listContainer = document.getElementById('logFilesList');
    if (!listContainer) return;

    listContainer.innerHTML = '<div class="loading">加载中...</div>';

    try {
      // 从后端获取日志文件列表
      const logFiles: LogFile[] = await invoke('get_log_files');

      if (logFiles.length === 0) {
        listContainer.innerHTML = '<div class="loading">暂无日志文件</div>';
        return;
      }

      listContainer.innerHTML = logFiles.map(file => {
        // 根据文件名确定类型和图标
        let fileIcon = '📋';
        let fileType = '前端日志';

        if (file.name.includes('csv-viewer')) {
          fileIcon = '📊';
          fileType = 'CSV查看器';
        } else if (file.name.includes('text-viewer')) {
          fileIcon = '📝';
          fileType = '文本查看器';
        } else if (file.name.includes('frontend')) {
          fileIcon = '🖥️';
          fileType = '主界面';
        }

        return `
          <div class="log-file-item" data-path="${file.path}">
            <div class="log-file-header">
              <span class="log-file-icon">${fileIcon}</span>
              <div class="log-file-name">${file.name}</div>
              <span class="log-file-type">${fileType}</span>
            </div>
            <div class="log-file-info">
              ${this.formatFileSize(file.size)} • ${file.modified}
            </div>
          </div>
        `;
      }).join('');

      // 绑定文件点击事件
      listContainer.querySelectorAll('.log-file-item').forEach(item => {
        item.addEventListener('click', () => {
          const path = item.getAttribute('data-path');
          if (path) {
            this.loadLogContent(path);
          }
        });
      });

    } catch (error) {
      console.error('加载日志文件列表失败:', error);
      listContainer.innerHTML = '<div class="loading">加载失败</div>';
    }
  }

  /**
   * 加载日志内容
   */
  private async loadLogContent(filePath: string): Promise<void> {
    // 更新选中状态
    document.querySelectorAll('.log-file-item').forEach(item => {
      item.classList.remove('active');
    });
    document.querySelector(`[data-path="${filePath}"]`)?.classList.add('active');

    const contentContainer = document.getElementById('logContent');
    const currentFileSpan = document.getElementById('currentLogFile');
    
    if (!contentContainer || !currentFileSpan) return;

    contentContainer.innerHTML = '<div class="loading">加载中...</div>';
    currentFileSpan.textContent = filePath.split('/').pop() || filePath;
    this.currentLogFile = filePath;

    // 启用控制按钮
    const downloadBtn = document.querySelector('.btn-download') as HTMLButtonElement;
    const clearBtn = document.querySelector('.btn-clear-current') as HTMLButtonElement;
    if (downloadBtn) downloadBtn.disabled = false;
    if (clearBtn) clearBtn.disabled = false;

    try {
      // 从后端读取日志文件内容
      const content: string = await invoke('read_log_file', { filePath });
      this.renderLogContent(content);

    } catch (error) {
      console.error('加载日志内容失败:', error);
      contentContainer.innerHTML = '<div class="loading">加载失败</div>';
    }
  }

  /**
   * 渲染日志内容
   */
  private renderLogContent(content: string): void {
    const contentContainer = document.getElementById('logContent');
    if (!contentContainer) return;

    const lines = content.split('\n').filter(line => line.trim());
    
    const html = lines.map(line => {
      const match = line.match(/^\[([^\]]+)\] \[([^\]]+)\] (.+)$/);
      if (match) {
        const [, timestamp, level, message] = match;
        return `
          <div class="log-entry ${level.toLowerCase()}">
            <span class="log-timestamp">${timestamp}</span>
            <span class="log-level">${level}</span>
            <span class="log-message">${message}</span>
          </div>
        `;
      } else {
        return `<div class="log-entry">${line}</div>`;
      }
    }).join('');

    contentContainer.innerHTML = html || '<div class="log-placeholder">日志文件为空</div>';
  }

  /**
   * 格式化文件大小
   */
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * 关闭日志查看器
   */
  private closeLogViewer(): void {
    const overlay = document.querySelector('.log-viewer-overlay');
    if (overlay) {
      overlay.remove();
    }
    this.isOpen = false;
    this.currentLogFile = null;
  }

  /**
   * 清空所有日志
   */
  private async clearAllLogs(): Promise<void> {
    if (!(await showConfirm({ message: '确定要清空所有日志文件吗？此操作不可恢复。', type: 'danger' }))) {
      return;
    }

    try {
      await invoke('clear_all_logs');
      console.log('✅ 所有日志已清空');
      await this.loadLogFiles();

      // 清空当前显示的内容
      const contentContainer = document.getElementById('logContent');
      if (contentContainer) {
        contentContainer.innerHTML = '<div class="log-placeholder"><p>📝 选择左侧的日志文件来查看内容</p></div>';
      }
    } catch (error) {
      console.error('❌ 清空日志失败:', error);
    }
  }

  /**
   * 下载当前日志
   */
  private async downloadCurrentLog(): Promise<void> {
    if (!this.currentLogFile) return;

    try {
      // 这里需要添加下载功能
      console.log('下载日志:', this.currentLogFile);
    } catch (error) {
      console.error('下载日志失败:', error);
    }
  }

  /**
   * 清空当前日志
   */
  private async clearCurrentLog(): Promise<void> {
    if (!this.currentLogFile) return;

    if (!(await showConfirm({ message: '确定要清空当前日志文件吗？此操作不可恢复。', type: 'danger' }))) {
      return;
    }

    try {
      await invoke('clear_log_file', { filePath: this.currentLogFile });
      console.log('✅ 当前日志已清空:', this.currentLogFile);
      await this.loadLogContent(this.currentLogFile);
    } catch (error) {
      console.error('❌ 清空当前日志失败:', error);
    }
  }
}

// 创建全局实例
const logViewer = new LogViewer();

export default logViewer;
