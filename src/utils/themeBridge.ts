import { windowThemeAdapter } from '../modules/ui/windowThemeAdapter';

windowThemeAdapter.init().catch((error) => {
  console.warn('子窗口主题同步失败:', error);
});
