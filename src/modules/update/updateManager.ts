/**
 * 更新管理器 - 重构版本
 * 协调更新服务和UI组件，提供完整的更新功能
 * @module update/updateManager
 */

import type {
  UpdateInfo,
  UpdateProgress,
  UpdateStatus,
  UpdateEventCallback,
  UpdateEvent,
  UpdateEventType,
} from './types';
import { UpdateService, UpdateServiceError } from './updateService';
import { UpdateUI, getUpdateUI } from './updateUI';

/**
 * 更新管理器类
 */
export class UpdateManager {
  private service: UpdateService;
  private ui: UpdateUI;
  private currentVersion: string;
  private eventListeners: Map<UpdateEventType, Set<UpdateEventCallback>> = new Map();
  private status: UpdateStatus = { type: 'idle' };
  private skippedVersions: Set<string> = new Set();

  constructor(currentVersion: string, updateUrl?: string) {
    this.currentVersion = currentVersion;
    this.service = new UpdateService({
      currentVersion,
      updateUrl,
    });
    this.ui = getUpdateUI();
  }

  /**
   * 获取当前版本
   */
  getCurrentVersion(): string {
    return this.currentVersion;
  }

  /**
   * 获取当前状态
   */
  getStatus(): UpdateStatus {
    return this.status;
  }

  /**
   * 检查更新
   */
  async checkForUpdates(): Promise<UpdateInfo | null> {
    try {
      this.setStatus({ type: 'checking' });
      this.emitEvent('check-start');

      const result = await this.service.checkForUpdates();

      if (result.hasUpdate && result.updateInfo) {
        // 检查是否被跳过
        if (this.skippedVersions.has(result.updateInfo.version)) {
          console.log('⏭️ 版本已被用户跳过:', result.updateInfo.version);
          this.setStatus({ type: 'idle' });
          return null;
        }

        this.setStatus({ type: 'available', info: result.updateInfo });
        this.emitEvent('update-available', result.updateInfo);
        return result.updateInfo;
      }

      this.setStatus({ type: 'idle' });
      this.emitEvent('check-complete', result);
      return null;
    } catch (error) {
      const errorMessage = error instanceof UpdateServiceError
        ? error.getDetails()
        : String(error);

      this.setStatus({ type: 'failed', error: errorMessage });
      this.emitEvent('check-error', undefined, error as Error);
      throw error;
    }
  }

  /**
   * 静默检查更新（不抛出错误）
   */
  async silentCheckForUpdates(): Promise<UpdateInfo | null> {
    try {
      return await this.checkForUpdates();
    } catch (error) {
      console.error('静默检查更新失败:', error);
      return null;
    }
  }

  /**
   * 显示更新对话框
   */
  async showUpdateDialog(updateInfo: UpdateInfo): Promise<void> {
    await this.ui.showUpdateDialog(updateInfo, this.currentVersion, {
      onInstall: async () => {
        await this.downloadAndInstall(updateInfo);
      },
      onLater: () => {
        console.log('用户选择稍后提醒');
        this.ui.hideIndicator();
      },
      onSkip: () => {
        console.log('用户跳过版本:', updateInfo.version);
        this.skipVersion(updateInfo.version);
        this.ui.hideIndicator();
      },
      onClose: () => {
        console.log('用户关闭对话框');
      },
    });
  }

  /**
   * 显示更新指示器
   */
  async showUpdateIndicator(
    updateInfo: UpdateInfo,
    onClick?: () => void
  ): Promise<HTMLElement | null> {
    // 检查是否被跳过
    if (this.skippedVersions.has(updateInfo.version)) {
      return null;
    }

    return await this.ui.showIndicator(
      updateInfo.version,
      updateInfo.is_critical ?? false,
      onClick ?? (() => this.showUpdateDialog(updateInfo))
    );
  }

  /**
   * 隐藏更新指示器
   */
  hideUpdateIndicator(): void {
    this.ui.hideIndicator();
  }

  /**
   * 下载并安装更新
   */
  async downloadAndInstall(updateInfo: UpdateInfo): Promise<void> {
    try {
      // 显示进度
      this.ui.showProgress();
      this.emitEvent('download-start', updateInfo);

      // 开始进度监控
      this.ui.startProgressMonitoring(() => this.service.getProgress());

      // 下载更新
      this.setStatus({ type: 'downloading', progress: this.createProgress('downloading', 0, '正在下载...') });
      const filePath = await this.service.downloadUpdate(updateInfo);

      this.setStatus({ type: 'downloaded', filePath });
      this.emitEvent('download-complete', { filePath });

      // 停止进度监控
      this.ui.stopProgressMonitoring();

      // 更新进度显示
      this.ui.updateProgress(this.createProgress('installing', 100, '正在安装...'));

      // 执行安装
      this.emitEvent('install-start');
      this.setStatus({ type: 'installing' });
      await this.service.executeUpdate(filePath);

      this.setStatus({ type: 'completed' });
      this.emitEvent('install-complete');

      // 显示完成界面
      this.ui.showInstallComplete();

    } catch (error) {
      const errorMessage = error instanceof UpdateServiceError
        ? error.getDetails()
        : String(error);

      this.setStatus({ type: 'failed', error: errorMessage });
      this.ui.stopProgressMonitoring();
      this.ui.showError(errorMessage);

      // 记录错误日志
      await this.service.writeErrorLog('更新失败', errorMessage);

      this.emitEvent('download-error', undefined, error as Error);
      throw error;
    }
  }

  /**
   * 取消更新
   */
  async cancelUpdate(): Promise<void> {
    await this.service.cancelUpdate();
    this.ui.stopProgressMonitoring();
    this.ui.hideProgress();
    this.ui.closeDialog();
    this.setStatus({ type: 'idle' });
  }

  /**
   * 回滚更新
   */
  async rollbackUpdate(): Promise<void> {
    await this.service.rollbackUpdate();
    this.setStatus({ type: 'idle' });
  }

  /**
   * 清理更新文件
   */
  async cleanupUpdateFiles(): Promise<void> {
    await this.service.cleanupUpdateFiles();
  }

  /**
   * 获取调试日志
   * @returns 更新过程中的调试日志列表
   */
  async getDebugLogs() {
    return await this.service.getDebugLogs();
  }

  /**
   * 清除调试日志
   */
  async clearDebugLogs(): Promise<void> {
    await this.service.clearDebugLogs();
  }

  /**
   * 显示调试面板
   */
  async showDebugPanel(): Promise<void> {
    const logs = await this.getDebugLogs();
    this.ui.showDebugPanel(logs);
  }

  /**
   * 隐藏调试面板
   */
  hideDebugPanel(): void {
    this.ui.hideDebugPanel();
  }

  /**
   * 跳过指定版本
   */
  skipVersion(version: string): void {
    this.skippedVersions.add(version);
    this.service.skipVersion(version);
  }

  /**
   * 检查版本是否被跳过
   */
  isVersionSkipped(version: string): boolean {
    return this.skippedVersions.has(version) || this.service.isVersionSkipped(version);
  }

  /**
   * 清除跳过的版本
   */
  clearSkippedVersions(): void {
    this.skippedVersions.clear();
    this.service.clearSkippedVersions();
  }

  /**
   * 添加事件监听器
   */
  on(event: UpdateEventType, callback: UpdateEventCallback): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);
  }

  /**
   * 移除事件监听器
   */
  off(event: UpdateEventType, callback: UpdateEventCallback): void {
    this.eventListeners.get(event)?.delete(callback);
  }

  /**
   * 移除所有事件监听器
   */
  removeAllListeners(): void {
    this.eventListeners.clear();
  }

  /**
   * 销毁实例
   */
  destroy(): void {
    this.removeAllListeners();
    this.ui.stopProgressMonitoring();
    this.ui.closeDialog();
    this.ui.hideIndicator();
  }

  // ==================== 私有方法 ====================

  /**
   * 设置状态
   */
  private setStatus(status: UpdateStatus): void {
    this.status = status;
    console.log('📊 UpdateManager 状态变更:', status.type);
  }

  /**
   * 发送事件
   */
  private emitEvent(type: UpdateEventType, data?: unknown, error?: Error): void {
    const event: UpdateEvent = {
      type,
      timestamp: new Date(),
      data,
      error,
    };

    const listeners = this.eventListeners.get(type);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(event);
        } catch (e) {
          console.error('事件回调执行错误:', e);
        }
      });
    }
  }

  /**
   * 创建进度对象
   */
  private createProgress(
    stage: 'downloading' | 'verifying' | 'installing',
    progress: number,
    message: string
  ): UpdateProgress {
    return {
      stage,
      progress,
      message,
      downloaded_bytes: 0,
      total_bytes: 0,
    };
  }
}

// ==================== 保持向后兼容的类型导出 ====================

export type { UpdateInfo, UpdateProgress, UpdateStatus } from './types';
