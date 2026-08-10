/**
 * 设置管理模块（薄壳入口）
 *
 * 设置界面的实际实现已迁移到 `settingsDialog.ts`。
 * 这里保留 `SettingsManager` 对外入口以兼容现有调用点（main.ts、快捷键、全局事件等）。
 */

import { SettingsDialog } from './settingsDialog';

export class SettingsManager {
  private dialog = new SettingsDialog();

  /** 显示设置弹窗 */
  async showSettingsDialog(): Promise<void> {
    return this.dialog.showSettingsDialog();
  }
}
