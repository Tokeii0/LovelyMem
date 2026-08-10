/**
 * 仪表盘概览面板
 * 在加载镜像后显示关键信息摘要和快捷操作
 */

import { AppState } from '../../core/types';
import { IconParkHelper } from '../../utils/iconparkHelper';

function icon(name: string, size: number = 18): string {
  return IconParkHelper.getSvgString(name, { size, strokeWidth: 3 });
}

/**
 * 格式化文件大小
 */
function formatSize(bytes: number): string {
  if (bytes <= 0) return '未知';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
}

/**
 * 截断路径显示
 */
function truncatePath(path: string, maxLen: number = 50): string {
  if (path.length <= maxLen) return path;
  return '...' + path.slice(-(maxLen - 3));
}

export class DashboardPanel {
  /**
   * 渲染仪表盘 HTML
   */
  static render(state: AppState): string {
    if (!state.currentImage) return '';

    const img = state.currentImage;
    const warningCount = (state.warnings || []).length;
    const cmdCount = (state.commandHistory || []).length;
    const completedCmds = (state.commandHistory || []).filter(c => c.status === 'completed').length;
    const errorCmds = (state.commandHistory || []).filter(c => c.status === 'error').length;

    return `
      <div class="dashboard-panel">
        <div class="dashboard-grid">
          
          <div class="dashboard-card dashboard-card-primary">
            <div class="dashboard-card-icon">${icon('file-text', 22)}</div>
            <div class="dashboard-card-content">
              <div class="dashboard-card-title">镜像信息</div>
              <div class="dashboard-card-value">${img.name}</div>
              <div class="dashboard-card-meta">${formatSize(img.size)}</div>
              <div class="dashboard-card-meta dashboard-path" title="${img.path}">${truncatePath(img.path)}</div>
            </div>
          </div>

          <div class="dashboard-card">
            <div class="dashboard-card-icon">${icon('rocket', 22)}</div>
            <div class="dashboard-card-content">
              <div class="dashboard-card-title">执行命令</div>
              <div class="dashboard-card-value">${cmdCount}</div>
              <div class="dashboard-card-meta">已完成 ${completedCmds} / 错误 ${errorCmds}</div>
            </div>
          </div>

          <div class="dashboard-card ${warningCount > 0 ? 'dashboard-card-warning' : ''}">
            <div class="dashboard-card-icon">${icon('attention', 22)}</div>
            <div class="dashboard-card-content">
              <div class="dashboard-card-title">告警</div>
              <div class="dashboard-card-value">${warningCount}</div>
              <div class="dashboard-card-meta">${warningCount > 0 ? '存在安全发现' : '暂无告警信息'}</div>
            </div>
          </div>

          <div class="dashboard-card">
            <div class="dashboard-card-icon">${icon('cpu', 22)}</div>
            <div class="dashboard-card-content">
              <div class="dashboard-card-title">进程状态</div>
              <div class="dashboard-card-value">${state.memProcFSProcessId ? '运行中' : '未运行'}</div>
              <div class="dashboard-card-meta">${state.memProcFSProcessId ? 'PID: ' + state.memProcFSProcessId : 'MemProcFS 未启动'}</div>
            </div>
          </div>

        </div>
      </div>
    `;
  }
}
