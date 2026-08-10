/**
 * 统一的消息提示工具模块
 * 提供成功、错误、信息等不同类型的提示消息功能
 * 支持多个Toast消息的智能排列和管理
 */

import { ensureFeedbackStyles } from './ensureFeedbackStyles';

interface ToastOptions {
  duration?: number;
  closable?: boolean;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
}

interface ToastItem {
  id: string;
  element: HTMLElement;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  timer?: number;
  options: ToastOptions;
}

export class MessageManager {
  private static instance: MessageManager;
  private toasts: Map<string, ToastItem> = new Map();
  private container: HTMLElement | null = null;
  private toastCounter = 0;
  private maxToasts = 5; // 最大同时显示的Toast数量
  private defaultDuration = 3000;
  private toastQueue: Array<{message: string, type: 'success' | 'error' | 'info' | 'warning', options?: ToastOptions}> = [];

  private constructor() {
    this.initContainer();
  }

  private static getInstance(): MessageManager {
    if (!MessageManager.instance) {
      MessageManager.instance = new MessageManager();
    }
    return MessageManager.instance;
  }

  /**
   * 初始化Toast容器
   */
  private initContainer(): void {
    if (this.container) return;

    // 保证 toast 样式在任意窗口（含各子窗口）都已加载
    ensureFeedbackStyles();

    this.container = document.createElement('div');
    this.container.className = 'unified-toast-container';
    // 样式移至 CSS 文件中管理
    document.body.appendChild(this.container);
  }

  /**
   * 显示成功消息
   */
  static showSuccess(message: string, options?: ToastOptions): string {
    return this.getInstance().show(message, 'success', options);
  }

  /**
   * 显示错误消息
   */
  static showError(message: string, options?: ToastOptions): string {
    return this.getInstance().show(message, 'error', options);
  }

  /**
   * 显示信息消息
   */
  static showInfo(message: string, options?: ToastOptions): string {
    return this.getInstance().show(message, 'info', options);
  }

  /**
   * 显示警告消息
   */
  static showWarning(message: string, options?: ToastOptions): string {
    return this.getInstance().show(message, 'warning', options);
  }

  /**
   * 显示Toast消息
   */
  private show(message: string, type: 'success' | 'error' | 'info' | 'warning', options: ToastOptions = {}): string {
    // 如果达到最大数量，将新消息加入队列
    if (this.toasts.size >= this.maxToasts) {
      this.toastQueue.push({ message, type, options });
      return '';
    }

    const id = `toast-${++this.toastCounter}`;
    const mergedOptions = {
      duration: this.defaultDuration,
      closable: true,
      position: 'top-right' as const,
      ...options
    };

    const toast = this.createToast(id, message, type, mergedOptions);
    const toastItem: ToastItem = {
      id,
      element: toast,
      type,
      message,
      options: mergedOptions
    };

    this.toasts.set(id, toastItem);
    this.container!.prepend(toast);

    // 触发进入动画
    requestAnimationFrame(() => {
      toast.classList.add('toast-show');
    });

    // 记录到通知中心
    import('../core/notificationCenter').then(({ notificationCenter }) => {
      notificationCenter.add(type, message);
    }).catch(() => {});

    // 设置自动隐藏
    if (mergedOptions.duration > 0) {
      toastItem.timer = window.setTimeout(() => {
        this.hide(id);
      }, mergedOptions.duration);
    }

    return id;
  }

  /**
   * 创建Toast元素
   */
  private createToast(id: string, message: string, type: 'success' | 'error' | 'info' | 'warning', options: ToastOptions): HTMLElement {
    const toast = document.createElement('div');
    toast.className = `unified-toast unified-toast-${type}`;
    toast.dataset.toastId = id;

    const icon = this.getIcon(type);

    toast.innerHTML = `
      <div class="unified-toast-content">
        <span class="unified-toast-icon">${icon}</span>
        <span class="unified-toast-message">${message}</span>
        ${options.closable ? `<button class="unified-toast-close" data-toast-id="${id}">×</button>` : ''}
      </div>
      <div class="unified-toast-progress"></div>
    `;

    // 绑定关闭事件
    if (options.closable) {
      const closeBtn = toast.querySelector('.unified-toast-close');
      closeBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.hide(id);
      });
    }

    // 设置进度条动画
    if (options.duration && options.duration > 0) {
      const progressBar = toast.querySelector('.unified-toast-progress') as HTMLElement;
      if (progressBar) {
        progressBar.style.animationDuration = `${options.duration}ms`;
      }
    }

    return toast;
  }

  /**
   * 获取消息类型对应的图标
   */
  private getIcon(type: string): string {
    switch (type) {
      case 'success': 
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
      case 'error': 
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
      case 'warning': 
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
      case 'info': 
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
      default: 
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`;
    }
  }

  /**
   * 隐藏Toast消息
   */
  private hide(id: string): void {
    const toastItem = this.toasts.get(id);
    if (!toastItem) return;

    // 清除定时器
    if (toastItem.timer) {
      clearTimeout(toastItem.timer);
    }

    // 添加退出动画
    toastItem.element.classList.add('toast-hide');

    // 动画完成后移除元素
    setTimeout(() => {
      if (toastItem.element.parentNode) {
        toastItem.element.parentNode.removeChild(toastItem.element);
      }
      this.toasts.delete(id);

      // 处理队列中的消息
      this.processQueue();
    }, 300);
  }

  /**
   * 处理队列中的消息
   */
  private processQueue(): void {
    if (this.toastQueue.length > 0 && this.toasts.size < this.maxToasts) {
      const queuedToast = this.toastQueue.shift();
      if (queuedToast) {
        this.show(queuedToast.message, queuedToast.type, queuedToast.options);
      }
    }
  }

  /**
   * 清除所有消息
   */
  static clearAll(): void {
    const instance = this.getInstance();
    instance.toasts.forEach((_, id) => {
      instance.hide(id);
    });
    instance.toastQueue = [];
  }

  /**
   * 清除指定类型的消息
   */
  static clearByType(type: 'success' | 'error' | 'info' | 'warning'): void {
    const instance = this.getInstance();
    instance.toasts.forEach((toastItem, id) => {
      if (toastItem.type === type) {
        instance.hide(id);
      }
    });
  }

  /**
   * 设置最大Toast数量
   */
  static setMaxToasts(max: number): void {
    this.getInstance().maxToasts = Math.max(1, max);
  }

  /**
   * 设置默认持续时间
   */
  static setDefaultDuration(duration: number): void {
    this.getInstance().defaultDuration = Math.max(1000, duration);
  }
}
