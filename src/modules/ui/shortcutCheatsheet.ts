/**
 * 快捷键速查卡
 * 按 Ctrl+/ 或 F1 弹出所有可用快捷键列表
 */

import { IconParkHelper } from '../utils/iconparkHelper';

function icon(name: string, size: number = 14): string {
  return IconParkHelper.getSvgString(name, { size, strokeWidth: 3 });
}

interface ShortcutGroup {
  name: string;
  shortcuts: { keys: string; desc: string }[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    name: '通用操作',
    shortcuts: [
      { keys: 'Ctrl + O', desc: '加载内存镜像' },
      { keys: 'Ctrl + Shift + P', desc: '命令面板' },
      { keys: 'Ctrl + /', desc: '快捷键速查' },
      { keys: 'Ctrl + ,', desc: '打开设置' },
    ]
  },
  {
    name: '导航',
    shortcuts: [
      { keys: 'Ctrl + 1~9', desc: '切换导航页面' },
      { keys: 'Ctrl + B', desc: '收藏/取消收藏当前项' },
      { keys: 'Ctrl + F', desc: '搜索（表格内）' },
    ]
  },
  {
    name: '窗口',
    shortcuts: [
      { keys: 'F11', desc: '全屏切换' },
      { keys: 'Ctrl + T', desc: '切换主题' },
      { keys: 'Escape', desc: '关闭弹窗/面板' },
    ]
  },
];

class ShortcutCheatsheet {
  private overlay: HTMLElement | null = null;
  private isOpen: boolean = false;

  toggle(): void {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  open(): void {
    if (this.isOpen) return;
    this.isOpen = true;

    this.overlay = document.createElement('div');
    this.overlay.className = 'shortcut-cheatsheet-overlay';

    const groupsHtml = SHORTCUT_GROUPS.map(g => `
      <div class="shortcut-group">
        <div class="shortcut-group-title">${g.name}</div>
        ${g.shortcuts.map(s => `
          <div class="shortcut-row">
            <kbd class="shortcut-keys">${s.keys}</kbd>
            <span class="shortcut-desc">${s.desc}</span>
          </div>
        `).join('')}
      </div>
    `).join('');

    this.overlay.innerHTML = `
      <div class="shortcut-cheatsheet-card">
        <div class="shortcut-cheatsheet-header">
          <span class="shortcut-cheatsheet-title">${icon('setting', 16)} 快捷键速查</span>
          <button class="shortcut-cheatsheet-close" id="shortcut-cheatsheet-close">
            ${icon('close', 14)}
          </button>
        </div>
        <div class="shortcut-cheatsheet-body">
          ${groupsHtml}
        </div>
      </div>
    `;

    document.body.appendChild(this.overlay);
    requestAnimationFrame(() => this.overlay?.classList.add('show'));

    this.overlay.querySelector('#shortcut-cheatsheet-close')?.addEventListener('click', () => this.close());
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });

    // Escape 关闭
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.close();
        document.removeEventListener('keydown', onKey);
      }
    };
    document.addEventListener('keydown', onKey);
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    if (this.overlay) {
      this.overlay.classList.remove('show');
      setTimeout(() => {
        this.overlay?.remove();
        this.overlay = null;
      }, 200);
    }
  }
}

export const shortcutCheatsheet = new ShortcutCheatsheet();
