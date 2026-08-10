/**
 * 按钮加载态工具
 * 在异步操作执行期间禁用按钮并显示 spinner，结束后自动恢复，
 * 用于防止长操作期间界面"假死"与重复点击。
 */

import { ensureFeedbackStyles } from './ensureFeedbackStyles';

interface ButtonLoadingOptions {
  /** 加载期间替换的文案；不传则保留原内容并在前面加 spinner */
  loadingText?: string;
}

/**
 * 包裹一个异步操作，自动管理按钮的加载/禁用态。
 * @param button 目标按钮（可为 null，此时直接执行 fn）
 * @param fn 异步操作
 * @returns fn 的返回值
 */
export async function withButtonLoading<T>(
  button: HTMLElement | null | undefined,
  fn: () => Promise<T>,
  options: ButtonLoadingOptions = {}
): Promise<T> {
  if (!button) {
    return fn();
  }

  ensureFeedbackStyles();
  const btn = button as HTMLButtonElement;
  const wasDisabled = btn.disabled;
  const originalHtml = btn.innerHTML;

  btn.disabled = true;
  btn.classList.add('btn-loading');
  btn.innerHTML = options.loadingText
    ? `<span class="btn-spinner"></span><span>${escapeHtml(options.loadingText)}</span>`
    : `<span class="btn-spinner"></span>${originalHtml}`;

  try {
    return await fn();
  } finally {
    btn.disabled = wasDisabled;
    btn.classList.remove('btn-loading');
    btn.innerHTML = originalHtml;
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
