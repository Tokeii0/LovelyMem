/**
 * 全局键盘快捷键管理器
 * 提供统一的快捷键注册、冲突检测和分发机制
 */

export interface ShortcutDefinition {
  /** 快捷键组合描述，如 'Ctrl+Shift+P' */
  keys: string;
  /** 动作标识 */
  action: string;
  /** 显示名称（中文） */
  label: string;
  /** 分类 */
  category: 'navigation' | 'tool' | 'general';
  /** 回调 */
  handler: () => void;
}

interface ParsedKeyCombination {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  key: string;
}

class KeyboardShortcutManager {
  private shortcuts: Map<string, ShortcutDefinition> = new Map();
  private enabled: boolean = true;
  private listener: ((e: KeyboardEvent) => void) | null = null;

  /**
   * 初始化快捷键系统，绑定全局 keydown 事件
   */
  init(): void {
    if (this.listener) {
      document.removeEventListener('keydown', this.listener);
    }

    this.listener = (event: KeyboardEvent) => {
      if (!this.enabled) return;

      // 如果焦点在可编辑元素中，只响应带 Ctrl/Shift 的组合键
      const target = event.target as HTMLElement;
      const isEditing = target.tagName === 'INPUT'
        || target.tagName === 'TEXTAREA'
        || target.tagName === 'SELECT'
        || target.isContentEditable;

      const combo = this.eventToComboKey(event);
      const def = this.shortcuts.get(combo);

      if (!def) return;

      // Escape 在所有情况下都响应
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        def.handler();
        return;
      }

      // 编辑状态下仅响应带修饰键的组合
      if (isEditing && !event.ctrlKey && !event.metaKey) return;

      event.preventDefault();
      event.stopPropagation();
      def.handler();
    };

    document.addEventListener('keydown', this.listener, { capture: true });
  }

  /**
   * 注册快捷键
   */
  register(def: ShortcutDefinition): void {
    const comboKey = this.parseToComboKey(def.keys);
    this.shortcuts.set(comboKey, def);
  }

  /**
   * 批量注册快捷键
   */
  registerAll(defs: ShortcutDefinition[]): void {
    for (const def of defs) {
      this.register(def);
    }
  }

  /**
   * 注销快捷键
   */
  unregister(keys: string): void {
    const comboKey = this.parseToComboKey(keys);
    this.shortcuts.delete(comboKey);
  }

  /**
   * 获取所有已注册的快捷键（供命令面板展示）
   */
  getAllShortcuts(): ShortcutDefinition[] {
    return Array.from(this.shortcuts.values());
  }

  /**
   * 暂时禁用快捷键（如弹窗内的特殊输入场景）
   */
  disable(): void {
    this.enabled = false;
  }

  enable(): void {
    this.enabled = true;
  }

  /**
   * 清理
   */
  destroy(): void {
    if (this.listener) {
      document.removeEventListener('keydown', this.listener, { capture: true } as any);
      this.listener = null;
    }
    this.shortcuts.clear();
  }

  // --- 内部工具方法 ---

  private parseKeyCombination(keys: string): ParsedKeyCombination {
    const parts = keys.toLowerCase().split('+').map(s => s.trim());
    return {
      ctrl: parts.includes('ctrl') || parts.includes('meta'),
      shift: parts.includes('shift'),
      alt: parts.includes('alt'),
      key: parts.filter(p => !['ctrl', 'meta', 'shift', 'alt'].includes(p))[0] || '',
    };
  }

  private parseToComboKey(keys: string): string {
    const parsed = this.parseKeyCombination(keys);
    return `${parsed.ctrl ? 'C' : ''}${parsed.shift ? 'S' : ''}${parsed.alt ? 'A' : ''}+${parsed.key}`;
  }

  private eventToComboKey(event: KeyboardEvent): string {
    const ctrl = event.ctrlKey || event.metaKey;
    const shift = event.shiftKey;
    const alt = event.altKey;
    if (!event.key) return '';
    let key = event.key.toLowerCase();

    // 标准化特殊键名
    if (key === 'escape') key = 'escape';
    else if (key === ',') key = ',';
    else if (key === '.') key = '.';

    return `${ctrl ? 'C' : ''}${shift ? 'S' : ''}${alt ? 'A' : ''}+${key}`;
  }
}

/**
 * 全局单例
 */
export const keyboardShortcutManager = new KeyboardShortcutManager();

/**
 * 注册默认应用快捷键
 * 需要在 app 初始化后调用，传入各 handler
 */
export function registerDefaultShortcuts(handlers: {
  openCommandPalette: () => void;
  loadImage: () => void;
  openSettings: () => void;
  toggleTheme: () => void;
  closeActiveDialog: () => void;
  focusSearch: () => void;
  switchNav: (index: number) => void;
}): void {
  const navTargets = [
    { key: '1', label: '切换到主页', nav: 0 },
    { key: '2', label: '切换到文件', nav: 1 },
    { key: '3', label: '切换到星图', nav: 2 },
    { key: '4', label: '切换到星迹', nav: 3 },
    { key: '5', label: '切换到终端', nav: 4 },
    { key: '6', label: '切换到AI助手', nav: 5 },
    { key: '7', label: '切换到答题版', nav: 6 },
    { key: '8', label: '切换到告警', nav: 7 },
    { key: '9', label: '切换到注册表', nav: 8 },
  ];

  const defs: ShortcutDefinition[] = [
    {
      keys: 'Ctrl+Shift+P',
      action: 'command-palette',
      label: '打开命令面板',
      category: 'general',
      handler: handlers.openCommandPalette,
    },
    {
      keys: 'Ctrl+O',
      action: 'load-image',
      label: '加载内存镜像',
      category: 'general',
      handler: handlers.loadImage,
    },
    {
      keys: 'Ctrl+,',
      action: 'open-settings',
      label: '打开设置',
      category: 'general',
      handler: handlers.openSettings,
    },
    {
      keys: 'Ctrl+T',
      action: 'toggle-theme',
      label: '切换主题',
      category: 'general',
      handler: handlers.toggleTheme,
    },
    {
      keys: 'Escape',
      action: 'close-dialog',
      label: '关闭当前弹窗',
      category: 'general',
      handler: handlers.closeActiveDialog,
    },
    {
      keys: 'Ctrl+F',
      action: 'focus-search',
      label: '聚焦搜索框',
      category: 'general',
      handler: handlers.focusSearch,
    },
    {
      keys: 'Ctrl+/',
      action: 'shortcut-cheatsheet',
      label: '快捷键速查',
      category: 'general',
      handler: () => {
        import('../ui/shortcutCheatsheet').then(({ shortcutCheatsheet }) => {
          shortcutCheatsheet.toggle();
        });
      },
    },
    ...navTargets.map(nav => ({
      keys: `Ctrl+${nav.key}`,
      action: `nav-${nav.key}`,
      label: nav.label,
      category: 'navigation' as const,
      handler: () => handlers.switchNav(nav.nav),
    })),
  ];

  keyboardShortcutManager.registerAll(defs);
  keyboardShortcutManager.init();

  // 初始化回到顶部按钮
  import('../ui/scrollToTop').then(({ initScrollToTop }) => {
    initScrollToTop();
  });
}
