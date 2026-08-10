/**
 * 更新服务层 - 封装与后端的通信逻辑
 * @module update/updateService
 */

import { invoke } from "@tauri-apps/api/core";
import type {
  UpdateInfo,
  UpdateProgress,
  UpdateCheckResult,
  UpdateConfig,
} from './types';
import { createInitialProgress } from './types';

/**
 * 更新日志条目接口
 */
export interface UpdateLogEntry {
  timestamp: string;
  level: string;
  event: string;
  message: string;
  details?: string;
}

/**
 * 更新服务类 - 处理与后端的所有通信
 */
export class UpdateService {
  private config: UpdateConfig;
  private abortController: AbortController | null = null;

  constructor(config: Partial<UpdateConfig> = {}) {
    this.config = {
      updateUrl: config.updateUrl ?? '',
      currentVersion: config.currentVersion ?? '',
      autoCheck: config.autoCheck ?? false,
      autoDownload: config.autoDownload ?? false,
      checkInterval: config.checkInterval ?? 24 * 60 * 60 * 1000,
      skippedVersions: config.skippedVersions ?? [],
      allowDowngrade: config.allowDowngrade ?? false,
      timeout: config.timeout ?? 30000,
    };
  }

  /**
   * 设置当前版本
   */
  setCurrentVersion(version: string): void {
    this.config.currentVersion = version;
  }

  /**
   * 获取当前配置
   */
  getConfig(): Readonly<UpdateConfig> {
    return { ...this.config };
  }

  /**
   * 检查更新
   */
  async checkForUpdates(): Promise<UpdateCheckResult> {
    const startTime = Date.now();

    if (!this.config.updateUrl.trim()) {
      throw new UpdateServiceError('未配置更新地址');
    }

    try {
      console.log('🔍 UpdateService: 开始检查更新...', {
        currentVersion: this.config.currentVersion,
        updateUrl: this.config.updateUrl
      });

      const updateInfo = await invoke<UpdateInfo | null>('check_for_updates_command', {
        currentVersion: this.config.currentVersion,
        updateUrl: this.config.updateUrl
      });

      const result: UpdateCheckResult = {
        hasUpdate: updateInfo !== null,
        updateInfo: updateInfo ?? undefined,
        currentVersion: this.config.currentVersion,
        checkTime: new Date(),
      };

      console.log('✅ UpdateService: 检查更新完成', {
        hasUpdate: result.hasUpdate,
        version: updateInfo?.version,
        duration: Date.now() - startTime
      });

      return result;
    } catch (error) {
      console.error('❌ UpdateService: 检查更新失败', error);
      throw new UpdateServiceError('检查更新失败', error);
    }
  }

  /**
   * 下载更新
   */
  async downloadUpdate(updateInfo: UpdateInfo): Promise<string> {
    try {
      console.log('📥 UpdateService: 开始下载更新...', {
        version: updateInfo.version,
        url: updateInfo.download_url
      });

      const filePath = await invoke<string>('download_update_command', {
        updateInfo
      });

      console.log('✅ UpdateService: 下载完成', { filePath });
      return filePath;
    } catch (error) {
      console.error('❌ UpdateService: 下载失败', error);
      throw new UpdateServiceError('下载更新失败', error);
    }
  }

  /**
   * 执行安装
   */
  async executeUpdate(downloadedFilePath: string): Promise<void> {
    try {
      console.log('🔧 UpdateService: 开始执行安装...', { downloadedFilePath });

      await invoke('execute_update_command', {
        downloadedFilePath
      });

      console.log('✅ UpdateService: 安装命令已执行');
    } catch (error) {
      console.error('❌ UpdateService: 安装失败', error);
      throw new UpdateServiceError('执行更新失败', error);
    }
  }

  /**
   * 获取当前更新进度
   */
  async getProgress(): Promise<UpdateProgress> {
    try {
      const progress = await invoke<UpdateProgress | null>('get_update_progress');
      return progress ?? createInitialProgress();
    } catch (error) {
      console.warn('⚠️ UpdateService: 获取进度失败', error);
      return createInitialProgress();
    }
  }

  /**
   * 获取当前更新状态
   */
  async getStatus(): Promise<string> {
    try {
      const status = await invoke<any>('get_update_status');
      return status;
    } catch (error) {
      console.warn('⚠️ UpdateService: 获取状态失败', error);
      return 'Idle';
    }
  }

  /**
   * 取消更新
   */
  async cancelUpdate(): Promise<void> {
    try {
      console.log('🚫 UpdateService: 取消更新...');
      await invoke('cancel_update_command');
      this.abortController?.abort();
      this.abortController = null;
    } catch (error) {
      console.error('❌ UpdateService: 取消更新失败', error);
      throw new UpdateServiceError('取消更新失败', error);
    }
  }

  /**
   * 回滚更新
   */
  async rollbackUpdate(): Promise<void> {
    try {
      console.log('⏪ UpdateService: 回滚更新...');
      await invoke('rollback_update_command');
    } catch (error) {
      console.error('❌ UpdateService: 回滚失败', error);
      throw new UpdateServiceError('回滚更新失败', error);
    }
  }

  /**
   * 清理更新文件
   */
  async cleanupUpdateFiles(): Promise<void> {
    try {
      console.log('🧹 UpdateService: 清理更新文件...');
      await invoke('cleanup_update_files_command');
    } catch (error) {
      console.warn('⚠️ UpdateService: 清理失败', error);
      // 清理失败不抛出错误
    }
  }

  /**
   * 获取调试日志
   * @returns 更新过程中的调试日志列表
   */
  async getDebugLogs(): Promise<UpdateLogEntry[]> {
    try {
      console.log('📋 UpdateService: 获取调试日志...');
      const logs = await invoke<UpdateLogEntry[]>('get_update_debug_logs_command');
      console.log(`✅ UpdateService: 获取到 ${logs.length} 条调试日志`);
      return logs;
    } catch (error) {
      console.warn('⚠️ UpdateService: 获取调试日志失败', error);
      return [];
    }
  }

  /**
   * 清除调试日志
   */
  async clearDebugLogs(): Promise<void> {
    try {
      console.log('🗑️ UpdateService: 清除调试日志...');
      await invoke('clear_update_debug_logs_command');
      console.log('✅ UpdateService: 调试日志已清除');
    } catch (error) {
      console.warn('⚠️ UpdateService: 清除调试日志失败', error);
    }
  }

  /**
   * 写入错误日志
   */
  async writeErrorLog(error: string, details: string): Promise<void> {
    try {
      await invoke('write_update_error_log_command', { error, details });
    } catch (e) {
      console.warn('⚠️ UpdateService: 写入错误日志失败', e);
    }
  }

  /**
   * 跳过指定版本
   */
  skipVersion(version: string): void {
    if (!this.config.skippedVersions.includes(version)) {
      this.config.skippedVersions.push(version);
    }
  }

  /**
   * 检查版本是否被跳过
   */
  isVersionSkipped(version: string): boolean {
    return this.config.skippedVersions.includes(version);
  }

  /**
   * 清除跳过的版本
   */
  clearSkippedVersions(): void {
    this.config.skippedVersions = [];
  }
}

/**
 * 更新服务错误类
 */
export class UpdateServiceError extends Error {
  public readonly cause: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'UpdateServiceError';
    this.cause = cause;
  }

  /**
   * 获取详细错误信息
   */
  getDetails(): string {
    if (this.cause instanceof Error) {
      return `${this.message}: ${this.cause.message}`;
    }
    if (typeof this.cause === 'string') {
      return `${this.message}: ${this.cause}`;
    }
    return this.message;
  }
}

/**
 * 创建更新服务实例
 */
export function createUpdateService(currentVersion: string, updateUrl?: string): UpdateService {
  return new UpdateService({
    currentVersion,
    updateUrl,
  });
}
