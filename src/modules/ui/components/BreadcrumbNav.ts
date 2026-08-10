/**
 * 面包屑导航组件
 * 显示当前用户在应用中的层级位置
 */

import { IconParkHelper } from '../../utils/iconparkHelper';

function getIcon(name: string, size: number = 12): string {
  return IconParkHelper.getSvgString(name, { size, strokeWidth: 3 });
}

export interface BreadcrumbLevel {
  label: string;
  action?: () => void;
}

export class BreadcrumbNav {
  /**
   * 渲染面包屑导航 HTML
   * @param levels 面包屑层级数组，从根到当前位置
   */
  static render(levels: BreadcrumbLevel[]): string {
    if (!levels || levels.length === 0) return '';

    const separator = `<span class="breadcrumb-separator">${getIcon('right', 10)}</span>`;

    const items = levels.map((level, index) => {
      const isLast = index === levels.length - 1;
      const isClickable = !isLast && level.action;

      return `<span class="breadcrumb-item ${isLast ? 'breadcrumb-current' : ''} ${isClickable ? 'breadcrumb-clickable' : ''}" 
                    data-breadcrumb-index="${index}">
                ${level.label}
              </span>`;
    });

    return `
      <nav class="breadcrumb-nav" aria-label="面包屑导航">
        <span class="breadcrumb-home-icon">${getIcon('home', 12)}</span>
        ${items.join(separator)}
      </nav>
    `;
  }

  /**
   * 从当前状态构建面包屑层级
   */
  static buildLevels(opts: {
    hasImage: boolean;
    engineName?: string;
    activeView?: string;
    onHomeClick?: () => void;
    onEngineClick?: () => void;
  }): BreadcrumbLevel[] {
    const levels: BreadcrumbLevel[] = [];

    levels.push({
      label: '主页',
      action: opts.onHomeClick,
    });

    if (opts.hasImage && opts.engineName) {
      levels.push({
        label: opts.engineName,
        action: opts.onEngineClick,
      });
    }

    if (opts.activeView) {
      levels.push({
        label: opts.activeView,
      });
    }

    return levels;
  }

  /**
   * 绑定面包屑点击事件
   * 应在 DOM 更新后调用
   */
  static bindEvents(levels: BreadcrumbLevel[]): void {
    const items = document.querySelectorAll('.breadcrumb-clickable');
    items.forEach(item => {
      const index = parseInt(item.getAttribute('data-breadcrumb-index') || '0', 10);
      if (levels[index]?.action) {
        item.addEventListener('click', () => {
          levels[index].action!();
        });
      }
    });
  }
}
