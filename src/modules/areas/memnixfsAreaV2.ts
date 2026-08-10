/**
 * MemNixFS V2 区域定义
 * Linux 内存取证 - 内嵌CSV查看器，无需打开新窗口。
 * 功能 Tab 在 MemNixFSWorkspaceV2Renderer 中定义；数据来自后端复制到 output 的取证产物。
 */

import { FeatureConfig } from '../core/types';

export class MemNixFSAreaV2 {
  static getFeatures(): FeatureConfig[] {
    return [];
  }

  static getConfig() {
    return {
      name: 'MemNixFS V2',
      desc: 'Linux 内存取证 (内嵌CSV)',
      icon: '🐧',
      color: '#a78bfa',
    };
  }
}
