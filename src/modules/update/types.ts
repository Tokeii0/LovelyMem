/**
 * 更新系统核心类型定义
 * @module update/types
 */

/**
 * 更新信息接口
 */
export interface UpdateInfo {
  /** 新版本号 */
  version: string;
  /** 更新日志URL */
  changelog_url: string;
  /** 下载地址 */
  download_url: string;
  /** 文件SHA256哈希值 */
  file_hash?: string;
  /** 文件大小（字节） */
  file_size?: number;
  /** 发布日期 */
  release_date?: string;
  /** 是否为关键更新 */
  is_critical?: boolean;
  /** 最低支持版本（可选） */
  min_version?: string;
  /** 更新描述（可选） */
  description?: string;
}

/**
 * 更新进度接口
 */
export interface UpdateProgress {
  /** 当前阶段：checking, downloading, verifying, installing, completed, failed */
  stage: UpdateStage;
  /** 进度百分比 0-100 */
  progress: number;
  /** 状态消息 */
  message: string;
  /** 已下载字节数 */
  downloaded_bytes: number;
  /** 总字节数 */
  total_bytes: number;
  /** 下载速度（字节/秒） */
  speed?: number;
  /** 预计剩余时间（秒） */
  eta?: number;
  /** 错误信息 */
  error?: string;
}

/**
 * 更新阶段枚举
 */
export type UpdateStage =
  | 'idle'
  | 'checking'
  | 'downloading'
  | 'verifying'
  | 'installing'
  | 'completed'
  | 'failed';

/**
 * 更新状态类型
 */
export type UpdateStatus =
  | { type: 'idle' }
  | { type: 'checking' }
  | { type: 'available'; info: UpdateInfo }
  | { type: 'downloading'; progress: UpdateProgress }
  | { type: 'downloaded'; filePath: string }
  | { type: 'installing' }
  | { type: 'completed' }
  | { type: 'failed'; error: string };

/**
 * 更新检查结果
 */
export interface UpdateCheckResult {
  /** 是否有可用更新 */
  hasUpdate: boolean;
  /** 更新信息（如果有更新） */
  updateInfo?: UpdateInfo;
  /** 当前版本 */
  currentVersion: string;
  /** 检查时间 */
  checkTime: Date;
}

/**
 * 更新配置选项
 */
export interface UpdateConfig {
  /** 更新服务器URL */
  updateUrl: string;
  /** 当前版本 */
  currentVersion: string;
  /** 自动检查更新 */
  autoCheck: boolean;
  /** 自动下载更新 */
  autoDownload: boolean;
  /** 检查间隔（毫秒） */
  checkInterval: number;
  /** 跳过的版本列表 */
  skippedVersions: string[];
  /** 是否允许降级 */
  allowDowngrade: boolean;
  /** 超时时间（毫秒） */
  timeout: number;
}

/**
 * 更新事件类型
 */
export type UpdateEventType =
  | 'check-start'
  | 'check-complete'
  | 'check-error'
  | 'update-available'
  | 'download-start'
  | 'download-progress'
  | 'download-complete'
  | 'download-error'
  | 'verify-start'
  | 'verify-complete'
  | 'verify-error'
  | 'install-start'
  | 'install-complete'
  | 'install-error';

/**
 * 更新事件
 */
export interface UpdateEvent {
  type: UpdateEventType;
  timestamp: Date;
  data?: unknown;
  error?: Error;
}

/**
 * 更新事件回调函数类型
 */
export type UpdateEventCallback = (event: UpdateEvent) => void;

/**
 * 更新状态变更回调函数类型
 */
export type UpdateStatusCallback = (status: UpdateStatus) => void;

/**
 * 更新进度回调函数类型
 */
export type UpdateProgressCallback = (progress: UpdateProgress) => void;

/**
 * 默认更新配置
 */
export const DEFAULT_UPDATE_CONFIG: UpdateConfig = {
  updateUrl: '',
  currentVersion: '',
  autoCheck: false,
  autoDownload: false,
  checkInterval: 24 * 60 * 60 * 1000, // 24小时
  skippedVersions: [],
  allowDowngrade: false,
  timeout: 30000, // 30秒
};

/**
 * 创建初始进度对象
 */
export function createInitialProgress(stage: UpdateStage = 'idle'): UpdateProgress {
  return {
    stage,
    progress: 0,
    message: '',
    downloaded_bytes: 0,
    total_bytes: 0,
  };
}

/**
 * 创建空闲状态
 */
export function createIdleStatus(): UpdateStatus {
  return { type: 'idle' };
}

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * 格式化下载速度
 */
export function formatSpeed(bytesPerSecond: number): string {
  return `${formatFileSize(bytesPerSecond)}/s`;
}

/**
 * 格式化剩余时间
 */
export function formatETA(seconds: number): string {
  if (seconds < 60) return `${Math.ceil(seconds)}秒`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)}分钟`;
  return `${Math.ceil(seconds / 3600)}小时`;
}
