/**
 * 进度指示器工具模块
 * 提供进度显示和状态更新功能
 */

export class ProgressManager {

  /**
   * 显示进度 (已禁用)
   */
  static show(text: string): void {
    // Progress indicator has been removed from the UI
    console.log('Progress:', text);
  }

  /**
   * 隐藏进度 (已禁用)
   */
  static hide(): void {
    // Progress indicator has been removed from the UI
  }

  /**
   * 更新进度文本 (已禁用)
   */
  static updateText(text: string): void {
    // Progress indicator has been removed from the UI
    console.log('Progress text:', text);
  }

  /**
   * 设置进度百分比 (已禁用)
   */
  static setProgress(percentage: number): void {
    // Progress indicator has been removed from the UI
    console.log('Progress:', percentage + '%');
  }

  /**
   * 重置进度 (已禁用)
   */
  static reset(): void {
    // Progress indicator has been removed from the UI
  }
} 