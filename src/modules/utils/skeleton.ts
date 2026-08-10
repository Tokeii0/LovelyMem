/**
 * 骨架屏占位 HTML（复用 notification.css 的 .skeleton-* 样式）。
 * 用于加载态替代生硬的"加载中…"文字或白屏，提升等待时的体感。
 */
import { ensureFeedbackStyles } from './ensureFeedbackStyles';

const WIDTHS = ['w-full', 'w-3-4', 'w-1-2', 'w-3-4', 'w-1-3', 'w-1-2'];

/**
 * 生成若干行骨架占位。
 * @param count 行数，默认 6
 */
export function skeletonRows(count: number = 6): string {
  ensureFeedbackStyles(); // .skeleton-* 样式定义在 notification.css 中
  let rows = '';
  for (let i = 0; i < count; i++) {
    const w = WIDTHS[i % WIDTHS.length];
    rows += `<div class="skeleton-row"><div class="skeleton-block skeleton-line ${w}"></div></div>`;
  }
  return `<div class="skeleton-loader">${rows}</div>`;
}
