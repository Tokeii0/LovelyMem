/**
 * 提示消息管理器
 * 管理各种提示消息的显示
 */

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export class ToastManager {
    private container: HTMLElement;
    private toasts: Map<number, HTMLElement> = new Map();
    private toastId = 0;

    constructor(container: HTMLElement) {
        this.container = container;

        this.init();
    }

    init(): void {
        this.container.innerHTML = '<div class="te-toast-container"></div>';
    }

    show(message: string, type: ToastType = 'info', duration = 3000): number {
        const id = ++this.toastId;
        const toast = this.createToast(id, message, type, duration);

        const container = this.container.querySelector<HTMLElement>('.te-toast-container');
        container?.appendChild(toast);

        this.toasts.set(id, toast);

        // 触发显示动画
        setTimeout(() => {
            toast.classList.add('visible');
        }, 10);

        // 自动隐藏
        if (duration > 0) {
            setTimeout(() => {
                this.hide(id);
            }, duration);
        }

        return id;
    }

    createToast(id: number, message: string, type: ToastType, duration: number): HTMLElement {
        const toast = document.createElement('div');
        toast.className = `te-toast te-toast-${type}`;
        toast.dataset.toastId = String(id);

        const icon = this.getTypeIcon(type);

        toast.innerHTML = `
            <div class="te-toast-content">
                <span class="te-toast-icon">${icon}</span>
                <span class="te-toast-message">${message}</span>
                <button class="te-toast-close" data-toast-id="${id}">×</button>
            </div>
            ${duration > 0 ? `<div class="te-toast-progress" style="animation-duration: ${duration}ms;"></div>` : ''}
        `;

        // 绑定关闭事件
        const closeBtn = toast.querySelector<HTMLButtonElement>('.te-toast-close');
        closeBtn?.addEventListener('click', () => {
            this.hide(id);
        });

        return toast;
    }

    getTypeIcon(type: ToastType): string {
        const icons: Record<ToastType, string> = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };
        return icons[type] || icons.info;
    }

    hide(id: number): void {
        const toast = this.toasts.get(id);
        if (!toast) return;

        toast.classList.add('hiding');

        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
            this.toasts.delete(id);
        }, 300);
    }

    clear(): void {
        this.toasts.forEach((_toast, id) => {
            this.hide(id);
        });
    }

    destroy(): void {
        this.clear();
        this.container.innerHTML = '';
    }
}
