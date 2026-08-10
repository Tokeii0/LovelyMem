/**
 * 自动更新模块入口
 * @module update
 */

import { UpdateManager as UpdateManagerClass } from './updateManager';
import { getUpdateUI as getUpdateUIImpl } from './updateUI';

// 导出核心类型
export type {
  UpdateInfo,
  UpdateProgress,
  UpdateStatus,
  UpdateStage,
  UpdateCheckResult,
  UpdateConfig,
  UpdateEvent,
  UpdateEventType,
  UpdateEventCallback,
  UpdateStatusCallback,
  UpdateProgressCallback,
} from './types';

// 重命名导出避免与 utils 模块冲突
export {
  DEFAULT_UPDATE_CONFIG,
  createInitialProgress,
  createIdleStatus,
  formatFileSize as updateFormatFileSize,
  formatSpeed as updateFormatSpeed,
  formatETA as updateFormatETA,
} from './types';

// 导出更新服务
export { UpdateService, UpdateServiceError, createUpdateService } from './updateService';
export type { UpdateLogEntry } from './updateService';

// 导出更新UI
export { UpdateUI, getUpdateUI } from './updateUI';
export type { UpdateDialogCallbacks } from './updateUI';

// 导出更新管理器
export { UpdateManager } from './updateManager';

// 存储跳过的版本（当次启动有效）
const skippedVersions = new Set<string>();

/**
 * 创建更新管理器实例
 */
export function createUpdateManager(currentVersion: string, updateUrl?: string): UpdateManagerClass {
  return new UpdateManagerClass(currentVersion, updateUrl);
}

/**
 * 显示更新通知指示器
 */
export async function showUpdateIndicator(
  version: string,
  isCritical: boolean = false,
  onClick?: () => void
): Promise<HTMLElement | null> {
  // 检查是否已跳过此版本
  if (skippedVersions.has(version)) {
    console.log('⏭️ 版本已跳过，不显示指示器:', version);
    return null;
  }

  const ui = getUpdateUIImpl();
  return await ui.showIndicator(version, isCritical, onClick);
}

/**
 * 隐藏更新通知指示器
 */
export function hideUpdateIndicator(): void {
  const ui = getUpdateUIImpl();
  ui.hideIndicator();
}

/**
 * 跳过指定版本
 */
export function skipVersion(version: string): void {
  skippedVersions.add(version);
}

/**
 * 检查版本是否被跳过
 */
export function isVersionSkipped(version: string): boolean {
  return skippedVersions.has(version);
}

/**
 * 清除所有跳过的版本
 */
export function clearSkippedVersions(): void {
  skippedVersions.clear();
}
