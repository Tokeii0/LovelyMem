/**
 * 模态 / 弹窗可访问性小工具：
 *  - lockBodyScroll / unlockBodyScroll：打开时锁背景滚动、关闭时恢复（支持嵌套计数）
 *  - autofocusFirstInput：打开后自动聚焦容器内首个可输入元素
 */

let lockCount = 0;
let prevOverflow = '';

/** 锁定页面背景滚动（嵌套安全） */
export function lockBodyScroll(): void {
  if (lockCount === 0) {
    prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  lockCount++;
}

/** 恢复页面背景滚动（与 lockBodyScroll 成对调用） */
export function unlockBodyScroll(): void {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.body.style.overflow = prevOverflow;
  }
}

/** 聚焦容器内首个可输入元素（在下一帧执行，确保元素已渲染） */
export function autofocusFirstInput(container: HTMLElement | null | undefined): void {
  if (!container) return;
  const el = container.querySelector(
    'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled]), [contenteditable="true"]'
  ) as HTMLElement | null;
  if (el) requestAnimationFrame(() => el.focus());
}
