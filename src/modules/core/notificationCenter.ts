/**
 * 通知中心
 * 记录所有操作结果（成功/失败/警告），可快速回溯
 */

import { IconParkHelper } from '../utils/iconparkHelper';

function icon(name: string, size: number = 14): string {
  return IconParkHelper.getSvgString(name, { size, strokeWidth: 3 });
}

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

interface NotificationItem {
  id: number;
  type: NotificationType;
  title: string;
  message?: string;
  timestamp: number;
  read: boolean;
}

const MAX_NOTIFICATIONS = 100;

class NotificationCenter {
  private notifications: NotificationItem[] = [];
  private nextId: number = 1;
  private panel: HTMLElement | null = null;
  private isOpen: boolean = false;

  /**
   * 添加通知
   */
  add(type: NotificationType, title: string, message?: string): void {
    const item: NotificationItem = {
      id: this.nextId++,
      type,
      title,
      message,
      timestamp: Date.now(),
      read: false,
    };
    this.notifications.unshift(item);
    if (this.notifications.length > MAX_NOTIFICATIONS) {
      this.notifications = this.notifications.slice(0, MAX_NOTIFICATIONS);
    }
    this.updateBadge();
    if (this.isOpen) {
      this.renderList();
    }
  }

  /**
   * 切换面板显示
   */
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
    this.ensurePanel();
    if (this.panel) {
      this.renderList();
      this.panel.classList.add('show');
    }
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    if (this.panel) {
      this.panel.classList.remove('show');
    }
    // 标记所有为已读
    this.notifications.forEach(n => n.read = true);
    this.updateBadge();
  }

  /**
   * 未读数
   */
  get unreadCount(): number {
    return this.notifications.filter(n => !n.read).length;
  }

  /**
   * 更新角标
   */
  private updateBadge(): void {
    const badge = document.getElementById('notification-badge');
    if (!badge) return;
    const count = this.unreadCount;
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }

  private ensurePanel(): void {
    if (this.panel && document.body.contains(this.panel)) return;

    this.panel = document.createElement('div');
    this.panel.className = 'notification-panel';
    this.panel.id = 'notification-panel';
    this.panel.innerHTML = `
      <div class="notification-panel-header">
        <span class="notification-panel-title">通知中心</span>
        <div class="notification-panel-actions">
          <button class="notification-panel-clear" id="notification-clear-all" title="清空全部">
            ${icon('delete', 14)}
          </button>
          <button class="notification-panel-close" id="notification-panel-close">
            ${icon('close', 14)}
          </button>
        </div>
      </div>
      <div class="notification-panel-list" id="notification-panel-list"></div>
    `;
    document.body.appendChild(this.panel);

    this.panel.querySelector('#notification-panel-close')?.addEventListener('click', () => this.close());
    this.panel.querySelector('#notification-clear-all')?.addEventListener('click', () => {
      this.notifications = [];
      this.updateBadge();
      this.renderList();
    });

    // 点击外部关闭
    document.addEventListener('click', (e) => {
      if (!this.isOpen) return;
      const target = e.target as HTMLElement;
      if (!target.closest('#notification-panel') && !target.closest('#notification-center-btn')) {
        this.close();
      }
    });
  }

  private renderList(): void {
    const list = this.panel?.querySelector('#notification-panel-list');
    if (!list) return;

    if (this.notifications.length === 0) {
      list.innerHTML = `<div class="notification-empty">暂无通知</div>`;
      return;
    }

    const typeIcons: Record<NotificationType, string> = {
      success: icon('check-circle', 14),
      error: icon('close-one', 14),
      warning: icon('attention', 14),
      info: icon('info', 14),
    };

    list.innerHTML = this.notifications.map(n => {
      const time = this.formatTime(n.timestamp);
      return `
        <div class="notification-item type-${n.type} ${n.read ? 'read' : 'unread'}">
          <div class="notification-item-icon">${typeIcons[n.type]}</div>
          <div class="notification-item-body">
            <div class="notification-item-title">${this.escapeHtml(n.title)}</div>
            ${n.message ? `<div class="notification-item-msg">${this.escapeHtml(n.message)}</div>` : ''}
          </div>
          <div class="notification-item-time">${time}</div>
        </div>
      `;
    }).join('');
  }

  private formatTime(ts: number): string {
    const d = new Date(ts);
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

export const notificationCenter = new NotificationCenter();
