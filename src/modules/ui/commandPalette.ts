/**
 * 命令面板 (Command Palette)
 * 提供 VS Code 风格的模糊搜索命令执行界面
 */

import { IconParkHelper } from '../utils/iconparkHelper';
import { keyboardShortcutManager, ShortcutDefinition } from '../core/keyboardShortcuts';
import { debounce } from '../utils/helpers';

function getIcon(name: string, size: number = 16): string {
  return IconParkHelper.getSvgString(name, { size, strokeWidth: 3 });
}

export interface CommandItem {
  id: string;
  label: string;
  category: string;
  categoryLabel: string;
  shortcut?: string;
  icon?: string;
  handler: () => void;
}

class CommandPalette {
  private overlay: HTMLElement | null = null;
  private commands: CommandItem[] = [];
  private filteredCommands: CommandItem[] = [];
  private selectedIndex: number = 0;
  private isOpen: boolean = false;
  private recentlyUsed: string[] = [];

  /**
   * 注册命令到面板
   */
  registerCommand(cmd: CommandItem): void {
    // 避免重复注册
    const existing = this.commands.findIndex(c => c.id === cmd.id);
    if (existing >= 0) {
      this.commands[existing] = cmd;
    } else {
      this.commands.push(cmd);
    }
  }

  /**
   * 批量注册命令
   */
  registerCommands(cmds: CommandItem[]): void {
    for (const cmd of cmds) {
      this.registerCommand(cmd);
    }
  }

  /**
   * 从已注册的快捷键自动添加命令
   */
  syncFromShortcuts(): void {
    const shortcuts = keyboardShortcutManager.getAllShortcuts();
    for (const s of shortcuts) {
      if (s.action === 'command-palette' || s.action === 'close-dialog') continue;
      const existing = this.commands.find(c => c.id === `shortcut-${s.action}`);
      if (!existing) {
        this.commands.push({
          id: `shortcut-${s.action}`,
          label: s.label,
          category: s.category,
          categoryLabel: this.getCategoryLabel(s.category),
          shortcut: s.keys,
          handler: s.handler,
        });
      }
    }
  }

  private getCategoryLabel(cat: string): string {
    const map: Record<string, string> = {
      'navigation': '导航',
      'tool': '工具',
      'general': '通用',
      'analysis': '分析',
      'settings': '设置',
    };
    return map[cat] || cat;
  }

  /**
   * 打开命令面板
   */
  open(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    this.selectedIndex = 0;

    // 同步快捷键到命令列表
    this.syncFromShortcuts();
    this.filteredCommands = this.sortByMRU([...this.commands]);

    this.renderOverlay();
    this.bindEvents();

    // 聚焦搜索框
    setTimeout(() => {
      const input = this.overlay?.querySelector('.cp-search-input') as HTMLInputElement;
      input?.focus();
    }, 50);
  }

  /**
   * 关闭命令面板
   */
  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  }

  toggle(): void {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  isVisible(): boolean {
    return this.isOpen;
  }

  // --- 渲染 ---

  private renderOverlay(): void {
    if (this.overlay) {
      this.overlay.remove();
    }

    this.overlay = document.createElement('div');
    this.overlay.className = 'command-palette-overlay';
    this.overlay.innerHTML = `
      <div class="command-palette-container">
        <div class="cp-header">
          <span class="cp-header-icon">${getIcon('search', 16)}</span>
          <input type="text" class="cp-search-input" placeholder="输入命令名称进行搜索..." autocomplete="off" spellcheck="false">
        </div>
        <div class="cp-results" id="cp-results">
          ${this.renderResults()}
        </div>
        <div class="cp-footer">
          <span class="cp-hint">${getIcon('up', 10)} ${getIcon('down', 10)} 选择</span>
          <span class="cp-hint">Enter 执行</span>
          <span class="cp-hint">Esc 关闭</span>
        </div>
      </div>
    `;

    document.body.appendChild(this.overlay);
  }

  private renderResults(): string {
    if (this.filteredCommands.length === 0) {
      return `<div class="cp-empty">未找到匹配的命令</div>`;
    }

    let currentCategory = '';
    let html = '';

    for (let i = 0; i < this.filteredCommands.length; i++) {
      const cmd = this.filteredCommands[i];

      // 分类标题
      if (cmd.category !== currentCategory) {
        currentCategory = cmd.category;
        html += `<div class="cp-category-header">${cmd.categoryLabel}</div>`;
      }

      const isSelected = i === this.selectedIndex;
      html += `
        <div class="cp-item ${isSelected ? 'cp-item-selected' : ''}" data-index="${i}">
          <span class="cp-item-icon">${cmd.icon || getIcon('right', 14)}</span>
          <span class="cp-item-label">${cmd.label}</span>
          ${cmd.shortcut ? `<span class="cp-item-shortcut">${this.formatShortcut(cmd.shortcut)}</span>` : ''}
        </div>
      `;
    }

    return html;
  }

  private formatShortcut(keys: string): string {
    return keys
      .replace(/Ctrl/gi, 'Ctrl')
      .replace(/Shift/gi, 'Shift')
      .replace(/Alt/gi, 'Alt')
      .split('+')
      .map(k => `<kbd>${k.trim()}</kbd>`)
      .join('+');
  }

  private updateResults(): void {
    const resultsEl = this.overlay?.querySelector('#cp-results');
    if (resultsEl) {
      resultsEl.innerHTML = this.renderResults();
    }
  }

  // --- 模糊搜索 ---

  private fuzzyMatch(query: string, text: string): boolean {
    const q = query.toLowerCase();
    const t = text.toLowerCase();

    // 简单包含匹配
    if (t.includes(q)) return true;

    // 字符顺序匹配
    let qi = 0;
    for (let ti = 0; ti < t.length && qi < q.length; ti++) {
      if (t[ti] === q[qi]) qi++;
    }
    return qi === q.length;
  }

  private filter(query: string): void {
    if (!query.trim()) {
      this.filteredCommands = this.sortByMRU([...this.commands]);
    } else {
      this.filteredCommands = this.commands.filter(cmd =>
        this.fuzzyMatch(query, cmd.label) ||
        this.fuzzyMatch(query, cmd.categoryLabel)
      );
    }
    this.selectedIndex = 0;
    this.updateResults();
  }

  // --- 事件绑定 ---

  private bindEvents(): void {
    if (!this.overlay) return;

    const input = this.overlay.querySelector('.cp-search-input') as HTMLInputElement;

    // 搜索输入
    input?.addEventListener('input', debounce(() => {
      this.filter(input.value);
    }, 150));

    // 键盘导航
    input?.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.selectedIndex = Math.min(this.selectedIndex + 1, this.filteredCommands.length - 1);
        this.updateResults();
        this.scrollSelectedIntoView();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
        this.updateResults();
        this.scrollSelectedIntoView();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this.executeSelected();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.close();
      }
    });

    // 点击命令项
    this.overlay.addEventListener('click', (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const item = target.closest('.cp-item') as HTMLElement;

      if (item) {
        const index = parseInt(item.getAttribute('data-index') || '0', 10);
        this.selectedIndex = index;
        this.executeSelected();
        return;
      }

      // 点击遮罩关闭
      if (target === this.overlay) {
        this.close();
      }
    });
  }

  private scrollSelectedIntoView(): void {
    const selected = this.overlay?.querySelector('.cp-item-selected');
    selected?.scrollIntoView({ block: 'nearest' });
  }

  private executeSelected(): void {
    const cmd = this.filteredCommands[this.selectedIndex];
    if (cmd) {
      this.close();
      // Track MRU
      this.recentlyUsed = [cmd.id, ...this.recentlyUsed.filter(id => id !== cmd.id)].slice(0, 10);
      // 使用 setTimeout 确保面板先关闭
      setTimeout(() => cmd.handler(), 50);
    }
  }

  /**
   * 按最近使用排序
   */
  private sortByMRU(commands: CommandItem[]): CommandItem[] {
    const mruSet = new Set(this.recentlyUsed);
    const recent: CommandItem[] = [];
    const rest: CommandItem[] = [];
    for (const cmd of commands) {
      if (mruSet.has(cmd.id)) {
        recent.push(cmd);
      } else {
        rest.push(cmd);
      }
    }
    // Sort recent by MRU order
    recent.sort((a, b) => this.recentlyUsed.indexOf(a.id) - this.recentlyUsed.indexOf(b.id));
    return [...recent, ...rest];
  }
}

/**
 * 全局单例
 */
export const commandPalette = new CommandPalette();
