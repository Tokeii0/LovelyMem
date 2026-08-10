/**
 * 回到顶部按钮
 * 当主工作区滚动超过阈值时显示
 */

import { IconParkHelper } from '../utils/iconparkHelper';

const THRESHOLD = 200;

function createScrollToTopButton(): void {
  // 避免重复创建
  if (document.getElementById('scroll-to-top-btn')) return;

  const btn = document.createElement('button');
  btn.id = 'scroll-to-top-btn';
  btn.className = 'scroll-to-top-btn';
  btn.title = '回到顶部';
  btn.innerHTML = IconParkHelper.getSvgString('up', { size: 16, strokeWidth: 3 });
  document.body.appendChild(btn);

  // 监听主滚动区域
  const observeScroll = () => {
    const wrapper = document.querySelector('.feature-scroll-wrapper');
    if (!wrapper) {
      // 延迟重试
      setTimeout(observeScroll, 1000);
      return;
    }

    wrapper.addEventListener('scroll', () => {
      const scrollTop = (wrapper as HTMLElement).scrollTop;
      if (scrollTop > THRESHOLD) {
        btn.classList.add('visible');
      } else {
        btn.classList.remove('visible');
      }
    });
  };

  observeScroll();
}

/**
 * 初始化回到顶部按钮
 */
export function initScrollToTop(): void {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(createScrollToTopButton, 500));
  } else {
    setTimeout(createScrollToTopButton, 500);
  }
}
