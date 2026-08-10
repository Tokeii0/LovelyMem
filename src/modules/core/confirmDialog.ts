/**
 * 自定义确认弹窗
 * 替代 window.confirm()，提供统一的 UI 体验
 */

import { IconParkHelper } from '../utils/iconparkHelper';
import { ensureFeedbackStyles } from '../utils/ensureFeedbackStyles';
import { lockBodyScroll, unlockBodyScroll } from '../utils/modalA11y';

function icon(name: string, size: number = 16): string {
  return IconParkHelper.getSvgString(name, { size, strokeWidth: 3 });
}

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'info' | 'warning' | 'danger';
}

export function showConfirm(options: ConfirmOptions): Promise<boolean> {
  ensureFeedbackStyles();
  return new Promise((resolve) => {
    const typeIcon = {
      info: icon('info', 20),
      warning: icon('attention', 20),
      danger: icon('caution', 20),
    };

    const typeColor = {
      info: '#6366f1',
      warning: '#f59e0b',
      danger: '#ef4444',
    };

    const type = options.type || 'info';
    const overlay = document.createElement('div');
    overlay.className = 'confirm-dialog-overlay';

    overlay.innerHTML = `
      <div class="confirm-dialog-card">
        <div class="confirm-dialog-icon" style="color: ${typeColor[type]}">
          ${typeIcon[type]}
        </div>
        <div class="confirm-dialog-body">
          ${options.title ? `<div class="confirm-dialog-title">${options.title}</div>` : ''}
          <div class="confirm-dialog-message">${options.message}</div>
        </div>
        <div class="confirm-dialog-actions">
          <button class="confirm-dialog-btn cancel" id="confirm-dialog-cancel">
            ${options.cancelText || '取消'}
          </button>
          <button class="confirm-dialog-btn confirm type-${type}" id="confirm-dialog-confirm">
            ${options.confirmText || '确定'}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    lockBodyScroll();
    requestAnimationFrame(() => overlay.classList.add('show'));

    const close = (result: boolean) => {
      overlay.classList.remove('show');
      setTimeout(() => overlay.remove(), 200);
      unlockBodyScroll();
      resolve(result);
    };

    overlay.querySelector('#confirm-dialog-cancel')?.addEventListener('click', () => close(false));
    overlay.querySelector('#confirm-dialog-confirm')?.addEventListener('click', () => close(true));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(false);
    });

    // Escape to cancel
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { close(false); document.removeEventListener('keydown', onKey); }
      if (e.key === 'Enter') { close(true); document.removeEventListener('keydown', onKey); }
    };
    document.addEventListener('keydown', onKey);
  });
}

interface AlertOptions {
  title?: string;
  message: string;
  type?: 'info' | 'warning' | 'danger';
  confirmText?: string;
}

/**
 * 自定义信息弹窗（单按钮，只读）
 * 替代 window.alert()，尤其适合多行信息展示（toast 会截断）
 */
export function showAlert(options: AlertOptions): Promise<void> {
  ensureFeedbackStyles();
  return new Promise((resolve) => {
    const typeIcon = {
      info: icon('info', 20),
      warning: icon('attention', 20),
      danger: icon('caution', 20),
    };
    const typeColor = {
      info: '#6366f1',
      warning: '#f59e0b',
      danger: '#ef4444',
    };

    const type = options.type || 'info';
    const overlay = document.createElement('div');
    overlay.className = 'confirm-dialog-overlay';

    overlay.innerHTML = `
      <div class="confirm-dialog-card confirm-dialog-card-alert">
        <div class="confirm-dialog-icon" style="color: ${typeColor[type]}">
          ${typeIcon[type]}
        </div>
        <div class="confirm-dialog-body">
          ${options.title ? `<div class="confirm-dialog-title"></div>` : ''}
          <div class="confirm-dialog-message confirm-dialog-message-multiline"></div>
        </div>
        <div class="confirm-dialog-actions">
          <button class="confirm-dialog-btn confirm type-${type}" id="confirm-dialog-ok">
            ${options.confirmText || '确定'}
          </button>
        </div>
      </div>
    `;

    // 安全地写入文本内容（避免 XSS 并保留换行）
    if (options.title) {
      const titleEl = overlay.querySelector('.confirm-dialog-title') as HTMLElement;
      if (titleEl) titleEl.textContent = options.title;
    }
    const msgEl = overlay.querySelector('.confirm-dialog-message') as HTMLElement;
    if (msgEl) msgEl.textContent = options.message;

    document.body.appendChild(overlay);
    lockBodyScroll();
    requestAnimationFrame(() => overlay.classList.add('show'));

    const close = () => {
      overlay.classList.remove('show');
      setTimeout(() => overlay.remove(), 200);
      unlockBodyScroll();
      document.removeEventListener('keydown', onKey);
      resolve();
    };

    overlay.querySelector('#confirm-dialog-ok')?.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); close(); }
    };
    document.addEventListener('keydown', onKey);
  });
}

interface PromptOptions {
  title?: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
  /** 返回错误文案则拦截提交；返回 null 表示校验通过 */
  validate?: (value: string) => string | null;
}

/**
 * 自定义输入弹窗
 * 替代 window.prompt()，支持输入校验、Esc 取消 / Enter 确认
 * resolve(null) 表示取消，resolve(string) 表示确认输入
 */
export function showPrompt(options: PromptOptions): Promise<string | null> {
  ensureFeedbackStyles();
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-dialog-overlay';

    overlay.innerHTML = `
      <div class="confirm-dialog-card confirm-dialog-card-prompt">
        <div class="confirm-dialog-body">
          ${options.title ? `<div class="confirm-dialog-title"></div>` : ''}
          ${options.message ? `<div class="confirm-dialog-message"></div>` : ''}
          <input type="text" class="confirm-dialog-input" id="confirm-dialog-input" spellcheck="false" autocomplete="off" />
          <div class="confirm-dialog-error" id="confirm-dialog-error"></div>
        </div>
        <div class="confirm-dialog-actions">
          <button class="confirm-dialog-btn cancel" id="confirm-dialog-cancel">
            ${options.cancelText || '取消'}
          </button>
          <button class="confirm-dialog-btn confirm type-info" id="confirm-dialog-confirm">
            ${options.confirmText || '确定'}
          </button>
        </div>
      </div>
    `;

    if (options.title) {
      const titleEl = overlay.querySelector('.confirm-dialog-title') as HTMLElement;
      if (titleEl) titleEl.textContent = options.title;
    }
    if (options.message) {
      const msgEl = overlay.querySelector('.confirm-dialog-message') as HTMLElement;
      if (msgEl) msgEl.textContent = options.message;
    }
    const input = overlay.querySelector('#confirm-dialog-input') as HTMLInputElement;
    if (options.placeholder) input.placeholder = options.placeholder;
    if (options.defaultValue) input.value = options.defaultValue;
    const errorEl = overlay.querySelector('#confirm-dialog-error') as HTMLElement;

    document.body.appendChild(overlay);
    lockBodyScroll();
    requestAnimationFrame(() => {
      overlay.classList.add('show');
      input.focus();
      input.select();
    });

    const close = (result: string | null) => {
      overlay.classList.remove('show');
      setTimeout(() => overlay.remove(), 200);
      unlockBodyScroll();
      document.removeEventListener('keydown', onKey);
      resolve(result);
    };

    const submit = () => {
      const value = input.value.trim();
      if (options.validate) {
        const err = options.validate(value);
        if (err) {
          errorEl.textContent = err;
          errorEl.classList.add('show');
          input.focus();
          return;
        }
      }
      close(value);
    };

    overlay.querySelector('#confirm-dialog-cancel')?.addEventListener('click', () => close(null));
    overlay.querySelector('#confirm-dialog-confirm')?.addEventListener('click', submit);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(null);
    });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close(null); }
      else if (e.key === 'Enter') { e.preventDefault(); submit(); }
    };
    document.addEventListener('keydown', onKey);
  });
}
