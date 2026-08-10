/**
 * 内存文件浏览器模块
 * 提供内存取证文件的浏览和管理功能
 */

export { MemoryFileBrowserManager } from './MemoryFileBrowserManager';
export type { MemoryFileBrowserConfig } from './types';
export { defaultMemoryFileBrowserConfig } from './types';

/**
 * 内存文件浏览器模块初始化函数
 */
import type { MemoryFileBrowserConfig } from './types';
import { defaultMemoryFileBrowserConfig } from './types';

export function initMemoryFileBrowserModule(config: Partial<MemoryFileBrowserConfig> = {}): MemoryFileBrowserConfig {
  const finalConfig = { ...defaultMemoryFileBrowserConfig, ...config };

  // 加载样式
  const existingLink = document.querySelector('link[href*="memory-file-browser.css"]');
  if (!existingLink) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = './modules/memory-file-browser/styles/memory-file-browser.css';
    document.head.appendChild(link);
  }

  console.log('内存文件浏览器模块已初始化', finalConfig);
  return finalConfig;
}
