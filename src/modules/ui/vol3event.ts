/**
 * Volatility3 事件处理器
 * 专门处理所有 Volatility3 相关功能的事件
 */

import { LovelymemApp } from '../core/app';

export class Vol3EventHandler {
  private app: LovelymemApp;

  constructor(app: LovelymemApp) {
    this.app = app;
  }

  /**
   * 处理 Volatility3 功能点击事件
   */
  handleVol3Feature(feature: string): void {
    // 移除 vol3- 前缀，获取实际功能名
    const actualFeature = feature.replace(/^vol3-/, '');
    //console.log(`🔍 DEBUG: 启动Volatility3 ${actualFeature}功能`);

    // 所有的功能都通过统一的 handleVolatility3Feature 方法处理
    this.app.featureHandlers.handleVolatility3Feature(actualFeature);
  }

  /**
   * 检查是否是 Volatility3 功能
   */
  static isVol3Feature(feature: string): boolean {
    return feature.startsWith('vol3-');
  }
}
