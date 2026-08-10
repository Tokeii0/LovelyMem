/**
 * Vol3 Linux V2 区域定义
 * 新版工作区域 - 内嵌CSV查看器，无需打开新窗口
 */

import { FeatureConfig } from '../core/types';

export class Volatility3LinuxAreaV2 {
  static getFeatures(): FeatureConfig[] {
    return [];
  }

  static getConfig() {
    return {
      name: 'Vol3Linux V2',
      desc: '新一代Linux内存分析 (内嵌CSV)',
      icon: '/assets/vol3linux.png',
      color: '#a29bfe',
    };
  }
}
