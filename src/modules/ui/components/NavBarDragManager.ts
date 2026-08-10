/**
 * NavBar 拖拽排序管理器
 * 实现类似 iOS 图标拖拽排序的交互效果
 */

export interface NavItemOrder {
  id: string;
  order: number;
}

export class NavBarDragManager {
  private navbar: HTMLElement | null = null;
  private draggedItem: HTMLElement | null = null;
  private placeholder: HTMLElement | null = null;
  private isDragging = false;
  private longPressTimer: number | null = null;
  private isEditMode = false;
  private startX = 0;
  private startY = 0;
  private offsetX = 0;
  private offsetY = 0;

  // 长按时间阈值（毫秒）
  private readonly LONG_PRESS_DURATION = 500;
  // 拖拽触发的最小移动距离
  private readonly DRAG_THRESHOLD = 5;

  // 保存的导航项顺序
  private navItemOrder: NavItemOrder[] = [];

  // 本地存储键名
  private readonly STORAGE_KEY = 'navbar-item-order';

  // 是否已初始化
  private initialized = false;

  // MutationObserver 用于监听 DOM 变化
  private observer: MutationObserver | null = null;

  constructor() {
    this.loadOrder();
  }

  /**
   * 初始化拖拽功能
   */
  public init(): void {
    // 防止重复初始化事件监听
    if (this.initialized) {
      // 如果已初始化，只需重新应用顺序
      this.navbar = document.querySelector('.vertical-navbar');
      if (this.navbar) {
        this.applyOrder();
      }
      return;
    }

    this.navbar = document.querySelector('.vertical-navbar');
    if (!this.navbar) {
      console.warn('NavBarDragManager: 未找到 .vertical-navbar 元素');
      return;
    }

    // 应用保存的顺序
    this.applyOrder();

    // 绑定事件
    this.bindEvents();

    // 设置 MutationObserver 监听 nav-top 的子元素变化
    this.setupObserver();

    this.initialized = true;
  }

  /**
   * 设置 MutationObserver 监听 DOM 变化
   * 当导航栏重新渲染时，自动重新应用保存的顺序
   */
  private setupObserver(): void {
    if (this.observer) {
      this.observer.disconnect();
    }

    const mainContainer = document.querySelector('.main-container');
    if (!mainContainer) return;

    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          // 检查是否有新的 vertical-navbar 被添加
          const addedNodes = Array.from(mutation.addedNodes);
          for (const node of addedNodes) {
            if (node instanceof HTMLElement) {
              if (node.classList?.contains('vertical-navbar') || node.querySelector?.('.vertical-navbar')) {
                // 导航栏被重新渲染，延迟应用顺序
                setTimeout(() => {
                  this.navbar = document.querySelector('.vertical-navbar');
                  if (this.navbar) {
                    this.applyOrder();
                    this.rebindNavTopEvents();
                  }
                }, 50);
                return;
              }
            }
          }
        }
      }
    });

    this.observer.observe(mainContainer, {
      childList: true,
      subtree: true
    });
  }

  /**
   * 重新绑定 nav-top 的事件（当 DOM 重新渲染后）
   */
  private rebindNavTopEvents(): void {
    if (!this.navbar) return;

    const navTop = this.navbar.querySelector('.nav-top');
    if (!navTop) return;

    // 移除旧的事件监听器（通过克隆节点的方式）
    // 注意：这里不能移除，因为会影响其他功能
    // 我们只需要确保事件委托仍然有效
  }

  /**
   * 绑定事件监听器
   */
  private bindEvents(): void {
    if (!this.navbar) return;

    const navTop = this.navbar.querySelector('.nav-top');
    if (!navTop) return;

    // 使用事件委托
    navTop.addEventListener('mousedown', (e) => this.handleMouseDown(e as MouseEvent));
    document.addEventListener('mousemove', (e) => this.handleMouseMove(e as MouseEvent));
    document.addEventListener('mouseup', () => this.handleMouseUp());

    // 触摸事件支持
    navTop.addEventListener('touchstart', (e) => this.handleTouchStart(e as TouchEvent), { passive: false });
    document.addEventListener('touchmove', (e) => this.handleTouchMove(e as TouchEvent), { passive: false });
    document.addEventListener('touchend', () => this.handleTouchEnd());

    // 按 ESC 键退出编辑模式
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isEditMode) {
        this.exitEditMode();
      }
    });

    // 点击其他地方退出编辑模式
    document.addEventListener('click', (e) => {
      if (this.isEditMode && !this.navbar?.contains(e.target as Node)) {
        this.exitEditMode();
      }
    });
  }

  /**
   * 处理鼠标按下事件
   */
  private handleMouseDown(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    const navItem = target.closest('.nav-item') as HTMLElement;
    
    if (!navItem || navItem.closest('.nav-bottom')) return;

    // 如果已经在编辑模式，直接开始拖拽
    if (this.isEditMode) {
      this.startDrag(navItem, e.clientX, e.clientY);
      e.preventDefault();
      return;
    }

    // 记录起始位置
    this.startX = e.clientX;
    this.startY = e.clientY;

    // 启动长按计时器
    this.longPressTimer = window.setTimeout(() => {
      this.enterEditMode();
      this.startDrag(navItem, e.clientX, e.clientY);
    }, this.LONG_PRESS_DURATION);
  }

  /**
   * 处理鼠标移动事件
   */
  private handleMouseMove(e: MouseEvent): void {
    // 检查是否移动超过阈值，取消长按
    if (this.longPressTimer) {
      const dx = Math.abs(e.clientX - this.startX);
      const dy = Math.abs(e.clientY - this.startY);
      if (dx > this.DRAG_THRESHOLD || dy > this.DRAG_THRESHOLD) {
        this.cancelLongPress();
      }
    }

    if (!this.isDragging || !this.draggedItem) return;

    e.preventDefault();
    this.updateDragPosition(e.clientX, e.clientY);
    this.checkDropTarget(e.clientY);
  }

  /**
   * 处理鼠标松开事件
   */
  private handleMouseUp(): void {
    this.cancelLongPress();
    
    if (this.isDragging) {
      this.endDrag();
    }
  }

  /**
   * 处理触摸开始事件
   */
  private handleTouchStart(e: TouchEvent): void {
    if (e.touches.length !== 1) return;

    const touch = e.touches[0];
    const target = touch.target as HTMLElement;
    const navItem = target.closest('.nav-item') as HTMLElement;
    
    if (!navItem || navItem.closest('.nav-bottom')) return;

    if (this.isEditMode) {
      this.startDrag(navItem, touch.clientX, touch.clientY);
      e.preventDefault();
      return;
    }

    this.startX = touch.clientX;
    this.startY = touch.clientY;

    this.longPressTimer = window.setTimeout(() => {
      this.enterEditMode();
      this.startDrag(navItem, touch.clientX, touch.clientY);
      // 触发触觉反馈（如果支持）
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    }, this.LONG_PRESS_DURATION);
  }

  /**
   * 处理触摸移动事件
   */
  private handleTouchMove(e: TouchEvent): void {
    if (e.touches.length !== 1) return;

    const touch = e.touches[0];

    if (this.longPressTimer) {
      const dx = Math.abs(touch.clientX - this.startX);
      const dy = Math.abs(touch.clientY - this.startY);
      if (dx > this.DRAG_THRESHOLD || dy > this.DRAG_THRESHOLD) {
        this.cancelLongPress();
      }
    }

    if (!this.isDragging || !this.draggedItem) return;

    e.preventDefault();
    this.updateDragPosition(touch.clientX, touch.clientY);
    this.checkDropTarget(touch.clientY);
  }

  /**
   * 处理触摸结束事件
   */
  private handleTouchEnd(): void {
    this.cancelLongPress();
    
    if (this.isDragging) {
      this.endDrag();
    }
  }

  /**
   * 取消长按计时器
   */
  private cancelLongPress(): void {
    if (this.longPressTimer) {
      window.clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  /**
   * 进入编辑模式
   */
  private enterEditMode(): void {
    this.isEditMode = true;
    this.navbar?.classList.add('edit-mode');

    // 为所有可拖拽的 nav-item 添加抖动效果
    const navTop = this.navbar?.querySelector('.nav-top');
    if (navTop) {
      const items = navTop.querySelectorAll('.nav-item');
      items.forEach((item, index) => {
        item.classList.add('wobble');
        // 添加随机延迟使抖动更自然
        (item as HTMLElement).style.animationDelay = `${index * 0.05}s`;
      });
    }
  }

  /**
   * 退出编辑模式
   */
  public exitEditMode(): void {
    this.isEditMode = false;
    this.navbar?.classList.remove('edit-mode');

    // 移除所有抖动效果
    const navTop = this.navbar?.querySelector('.nav-top');
    if (navTop) {
      const items = navTop.querySelectorAll('.nav-item');
      items.forEach(item => {
        item.classList.remove('wobble');
        (item as HTMLElement).style.animationDelay = '';
      });
    }

    // 保存顺序
    this.saveOrder();
  }

  /**
   * 开始拖拽
   */
  private startDrag(item: HTMLElement, clientX: number, clientY: number): void {
    this.isDragging = true;
    this.draggedItem = item;

    const rect = item.getBoundingClientRect();
    this.offsetX = clientX - rect.left;
    this.offsetY = clientY - rect.top;

    // 创建占位符
    this.placeholder = document.createElement('div');
    this.placeholder.className = 'nav-item-placeholder';
    this.placeholder.style.width = `${rect.width}px`;
    this.placeholder.style.height = `${rect.height}px`;
    item.parentNode?.insertBefore(this.placeholder, item);

    // 设置拖拽样式
    item.classList.add('dragging');
    item.style.position = 'fixed';
    item.style.zIndex = '10000';
    item.style.left = `${rect.left}px`;
    item.style.top = `${rect.top}px`;
    item.style.width = `${rect.width}px`;
    item.style.height = `${rect.height}px`;
    item.style.pointerEvents = 'none';

    // 移动到 body 以避免父元素 overflow 影响
    document.body.appendChild(item);
  }

  /**
   * 更新拖拽位置
   */
  private updateDragPosition(clientX: number, clientY: number): void {
    if (!this.draggedItem) return;

    this.draggedItem.style.left = `${clientX - this.offsetX}px`;
    this.draggedItem.style.top = `${clientY - this.offsetY}px`;
  }

  /**
   * 检查拖拽目标位置
   */
  private checkDropTarget(clientY: number): void {
    if (!this.navbar || !this.placeholder) return;

    const navTop = this.navbar.querySelector('.nav-top');
    if (!navTop) return;

    const items = Array.from(navTop.querySelectorAll('.nav-item:not(.dragging)')) as HTMLElement[];
    
    for (const item of items) {
      const rect = item.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;

      if (clientY < midY) {
        if (this.placeholder.nextSibling !== item) {
          navTop.insertBefore(this.placeholder, item);
        }
        return;
      }
    }

    // 如果在所有项目下方
    if (items.length > 0) {
      const lastItem = items[items.length - 1];
      if (this.placeholder !== lastItem.nextSibling) {
        navTop.insertBefore(this.placeholder, lastItem.nextSibling);
      }
    }
  }

  /**
   * 结束拖拽
   */
  private endDrag(): void {
    if (!this.draggedItem || !this.placeholder) return;

    // 获取目标位置
    const placeholderRect = this.placeholder.getBoundingClientRect();

    // 动画移动到目标位置
    this.draggedItem.style.transition = 'left 0.2s ease, top 0.2s ease';
    this.draggedItem.style.left = `${placeholderRect.left}px`;
    this.draggedItem.style.top = `${placeholderRect.top}px`;

    setTimeout(() => {
      if (!this.draggedItem || !this.placeholder) return;

      // 将元素放回原位
      this.placeholder.parentNode?.insertBefore(this.draggedItem, this.placeholder);
      this.placeholder.remove();

      // 清除样式
      this.draggedItem.classList.remove('dragging');
      this.draggedItem.style.position = '';
      this.draggedItem.style.zIndex = '';
      this.draggedItem.style.left = '';
      this.draggedItem.style.top = '';
      this.draggedItem.style.width = '';
      this.draggedItem.style.height = '';
      this.draggedItem.style.transition = '';
      this.draggedItem.style.pointerEvents = '';

      this.draggedItem = null;
      this.placeholder = null;
      this.isDragging = false;

      // 保存新顺序
      this.saveOrder();
    }, 200);
  }

  /**
   * 保存导航项顺序
   */
  private saveOrder(): void {
    const navTop = this.navbar?.querySelector('.nav-top');
    if (!navTop) return;

    const items = Array.from(navTop.querySelectorAll('.nav-item')) as HTMLElement[];
    this.navItemOrder = items.map((item, index) => ({
      id: item.getAttribute('data-nav') || '',
      order: index
    }));

    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.navItemOrder));
    } catch (error) {
      console.warn('NavBarDragManager: 无法保存顺序到 localStorage', error);
    }
  }

  /**
   * 加载导航项顺序
   */
  private loadOrder(): void {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved) {
        this.navItemOrder = JSON.parse(saved);
      }
    } catch (error) {
      console.warn('NavBarDragManager: 无法从 localStorage 加载顺序', error);
      this.navItemOrder = [];
    }
  }

  /**
   * 应用保存的顺序
   */
  private applyOrder(): void {
    if (this.navItemOrder.length === 0) return;

    const navTop = this.navbar?.querySelector('.nav-top');
    if (!navTop) return;

    const items = Array.from(navTop.querySelectorAll('.nav-item')) as HTMLElement[];
    
    // 创建 ID 到元素的映射
    const itemMap = new Map<string, HTMLElement>();
    items.forEach(item => {
      const id = item.getAttribute('data-nav');
      if (id) {
        itemMap.set(id, item);
      }
    });

    // 按保存的顺序重新排列
    const sortedOrder = [...this.navItemOrder].sort((a, b) => a.order - b.order);
    
    sortedOrder.forEach(({ id }) => {
      const item = itemMap.get(id);
      if (item) {
        navTop.appendChild(item);
      }
    });

    // 添加未在保存顺序中的新项目
    items.forEach(item => {
      const id = item.getAttribute('data-nav');
      if (id && !this.navItemOrder.find(o => o.id === id)) {
        navTop.appendChild(item);
      }
    });
  }

  /**
   * 公共方法：重新应用保存的顺序
   * 当导航栏重新渲染后调用此方法
   */
  public reapplyOrder(): void {
    this.navbar = document.querySelector('.vertical-navbar');
    if (this.navbar) {
      this.applyOrder();
    }
  }

  /**
   * 重置顺序
   */
  public resetOrder(): void {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
      this.navItemOrder = [];
      // 重新加载页面以应用默认顺序
      location.reload();
    } catch (error) {
      console.warn('NavBarDragManager: 无法重置顺序', error);
    }
  }

  /**
   * 检查是否处于编辑模式
   */
  public isInEditMode(): boolean {
    return this.isEditMode;
  }

  /**
   * 销毁实例
   */
  public destroy(): void {
    this.cancelLongPress();
    this.exitEditMode();
    
    // 清理 MutationObserver
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    
    this.initialized = false;
    // 事件监听器会在页面卸载时自动清理
  }
}

// 导出单例实例
export const navBarDragManager = new NavBarDragManager();
