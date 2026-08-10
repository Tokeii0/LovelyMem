import { keyboardShortcutManager, type ShortcutDefinition } from './keyboardShortcuts';
import { getCurrentWindow } from '@tauri-apps/api/window';

interface ChildWindowShortcutOptions {
  /** Ctrl+F 聚焦的搜索框选择器（不传则不注册 Ctrl+F） */
  searchSelector?: string;
  /** 是否注册 Ctrl+W 关闭窗口（默认 true） */
  closeWindow?: boolean;
}

/**
 * 为子窗口注册通用快捷键：Ctrl+W 关闭窗口、Ctrl+F 聚焦搜索框。
 *
 * 故意不注册 Esc —— 自定义弹窗（showConfirm/showAlert/showPrompt）已自带 Esc，
 * 且部分子窗口已有自定义 Esc 行为（如字符串搜索的 Esc 停止搜索）。
 * keyboardShortcutManager 在 capture 阶段对已注册键会 stopPropagation，
 * 若在此注册 Esc 会抢占这些已有行为，造成回归，故规避。
 */
export function registerChildWindowShortcuts(options: ChildWindowShortcutOptions = {}): void {
  const defs: ShortcutDefinition[] = [];

  if (options.searchSelector) {
    const selector = options.searchSelector;
    defs.push({
      keys: 'Ctrl+F',
      action: 'focus-search',
      label: '聚焦搜索框',
      category: 'general',
      handler: () => {
        const el = document.querySelector(selector) as HTMLInputElement | null;
        if (el) {
          el.focus();
          if (typeof el.select === 'function') el.select();
        }
      },
    });
  }

  if (options.closeWindow !== false) {
    defs.push({
      keys: 'Ctrl+W',
      action: 'close-window',
      label: '关闭窗口',
      category: 'general',
      handler: () => {
        try {
          getCurrentWindow().close();
        } catch (e) {
          console.warn('关闭窗口失败:', e);
        }
      },
    });
  }

  if (defs.length === 0) return;
  keyboardShortcutManager.registerAll(defs);
  keyboardShortcutManager.init();
}
