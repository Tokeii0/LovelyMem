/**
 * 内存文件浏览器类型定义
 */

import { mountPath } from '../core/mountDrive';

/**
 * 内存文件浏览器配置接口
 */
export interface MemoryFileBrowserConfig {
  enabled: boolean;
  ntfsPath: string;
  showFileIcons: boolean;
  showMetadata: boolean;
  defaultViewMode: 'tree';
}

/**
 * 获取默认NTFS路径（根据平台）
 */
function getDefaultNtfsPath(): string {
  // 检测平台
  const isMacOS = navigator.platform.toLowerCase().includes('mac') ||
                  navigator.userAgent.toLowerCase().includes('mac');

  if (isMacOS) {
    // macOS 下使用桌面路径
    return '~/Desktop/MemProcFS/forensic/ntfs/0';
  } else {
    // Windows/Linux 下使用配置的挂载盘符（导入期为默认 M，运行时由
    // MemoryFileBrowserManager.init() 按实际盘符覆盖）
    return mountPath('forensic', 'ntfs', '0');
  }
}

/**
 * 默认配置
 */
export const defaultMemoryFileBrowserConfig: MemoryFileBrowserConfig = {
  enabled: true,
  ntfsPath: getDefaultNtfsPath(),
  showFileIcons: true,
  showMetadata: true,
  defaultViewMode: 'tree'
};

/**
 * 文件树节点接口
 */
export interface FileTreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  modified?: string;
  extension?: string;
  children?: FileTreeNode[];
  expanded?: boolean;
  level?: number;
}

/**
 * NTFS时间线条目接口
 */
export interface NTFSTimelineEntry {
  timestamp: string;
  type: 'created' | 'modified' | 'accessed' | 'changed';
  path: string;
  size: number;
  attributes: string;
}

/**
 * 查看模式类型
 */
export type ViewMode = 'tree';

/**
 * 文件操作类型
 */
export type FileAction = 'open' | 'copy' | 'delete' | 'properties' | 'timeline';
