import { LovelymemApp } from '../../core/app';
import { StateManager } from '../../core/stateManager';
import { iconSelector } from '../iconSelector';
import { invoke } from '@tauri-apps/api/core';
import { showAlert } from '../../core/confirmDialog';

export class ContextMenuEvents {
  private app: LovelymemApp;
  private stateManager: StateManager;
  private triggerFeatureCallback: (feature: string) => void;

  constructor(
    app: LovelymemApp,
    stateManager: StateManager,
    triggerFeatureCallback: (feature: string) => void
  ) {
    this.app = app;
    this.stateManager = stateManager;
    this.triggerFeatureCallback = triggerFeatureCallback;
  }

  /**
   * 绑定右键菜单事件
   */
  bindContextMenuEvents(): void {
    document.addEventListener('contextmenu', (e) => {
      this.handleContextMenu(e);
    });

    // 点击其他地方关闭菜单
    document.addEventListener('click', () => {
      this.removeContextMenu();
    });
  }

  /**
   * 处理右键菜单
   */
  private handleContextMenu(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    const featureCard = target.closest('.feature-card');
    const imageLoadBtn = target.closest('.image-load-btn, .welcome-load-btn');
    const imageCard = target.closest('.image-card');
    const areaIcon = target.closest('.area-icon');
    const featureGridContainer = target.closest('.feature-grid-container');

    // 如果是文件面板内的文件项，不处理（让文件面板自己处理）
    if (target.closest('.file-panel')) {
      return;
    }

    if (featureCard) {
      e.preventDefault();
      this.removeContextMenu();
      this.showFeatureContextMenu(e, featureCard as HTMLElement);
    } else if (imageLoadBtn || imageCard) {
      e.preventDefault();
      this.removeContextMenu();
      this.showImageContextMenu(e);
    } else if (areaIcon) {
      e.preventDefault();
      this.removeContextMenu();
      const areaName = areaIcon.getAttribute('data-area-name');
      const originalIcon = areaIcon.getAttribute('data-original-icon') || '';
      if (areaName) {
        this.showAreaIconContextMenu(e, areaName, originalIcon);
      }
    } else if (featureGridContainer && this.isInToolsArea()) {
       // 确保不是点击在功能卡片上
       if (!featureCard) {
        e.preventDefault();
        this.removeContextMenu();
        this.showFeatureGridContextMenu(e);
      }
    } else {
      // 对于没有自定义右键菜单的区域，不显示任何菜单
      e.preventDefault();
    }
  }

  /**
   * 检查当前是否在小工具区域
   */
  private isInToolsArea(): boolean {
    const activeAreaSection = document.querySelector('.area-section.active');
    if (activeAreaSection) {
      const areaIcon = activeAreaSection.querySelector('.area-icon');
      const areaName = areaIcon?.getAttribute('data-area-name');
      return areaName === '小工具';
    }
    return false;
  }

  /**
   * 显示镜像操作右键菜单
   */
  private showImageContextMenu(e: MouseEvent): void {
    const menu = document.createElement('div');
    menu.className = 'custom-context-menu';
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;

    const hasImage = !!this.stateManager.getCurrentImage();

    menu.innerHTML = `
      <div class="menu-item" data-action="load-image">
        <span class="menu-icon"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg></span>
        <span class="menu-text">加载镜像</span>
      </div>
      <div class="menu-item" data-action="load-image-with-pagefile">
        <span class="menu-icon"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg></span>
        <span class="menu-text">加载镜像(含分页文件)</span>
      </div>
      <div class="menu-item" data-action="load-vm-memory-image">
        <span class="menu-icon"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg></span>
        <span class="menu-text">加载虚拟机镜像</span>
      </div>
      <div class="menu-item" data-action="load-local-memory">
        <span class="menu-icon"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><rect x="9" y="9" width="6" height="6"></rect><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/></svg></span>
        <span class="menu-text">加载本机内存(风险)</span>
      </div>
      <div class="menu-item" data-action="load-remote-memory">
        <span class="menu-icon"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg></span>
        <span class="menu-text">加载远程内存</span>
      </div>
      ${hasImage ? `
        <div class="menu-separator"></div>
        <div class="menu-item" data-action="unload-image">
          <span class="menu-icon"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></span>
          <span class="menu-text">卸载镜像</span>
        </div>
        <div class="menu-item" data-action="image-info">
          <span class="menu-icon"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg></span>
          <span class="menu-text">镜像信息</span>
        </div>
      ` : ''}
    `;

    document.body.appendChild(menu);
    this.adjustMenuPosition(menu);

    // 添加显示动画类
    requestAnimationFrame(() => {
      menu.classList.add('show');
    });

    // 绑定菜单点击事件
    menu.querySelectorAll('.menu-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = (item as HTMLElement).dataset.action;
        this.handleImageMenuAction(action);
        this.removeContextMenu();
      });
    });
  }

  /**
   * 处理镜像菜单动作
   */
  private handleImageMenuAction(action: string | undefined): void {
    switch (action) {
      case 'load-image':
        this.triggerFeatureCallback('load-image');
        break;
      case 'load-image-with-pagefile':
        // 需要在 app 中实现
        console.log('TODO: load-image-with-pagefile');
        break;
      case 'load-vm-memory-image':
        // 需要在 app 中实现
        console.log('TODO: load-vm-memory-image');
        break;
      case 'load-local-memory':
        // 需要在 app 中实现
        console.log('TODO: load-local-memory');
        break;
      case 'load-remote-memory':
        // 需要在 app 中实现
        console.log('TODO: load-remote-memory');
        break;
      case 'unload-image':
        this.triggerFeatureCallback('unload-image');
        break;
      case 'image-info':
        const image = this.stateManager.getCurrentImage();
        if (image) {
          void showAlert({ title: '镜像信息', message: `镜像名称: ${image.name}\n大小: ${image.size}\n路径: ${image.path}`, type: 'info' });
        }
        break;
    }
  }

  /**
   * 显示区域图标右键菜单
   */
  private showAreaIconContextMenu(e: MouseEvent, areaName: string, originalIcon: string): void {
    const menu = document.createElement('div');
    menu.className = 'custom-context-menu';
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;

    menu.innerHTML = `
      <div class="menu-item" data-action="customize-icon">
        <span class="menu-icon"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5"></circle><circle cx="17.5" cy="10.5" r=".5"></circle><circle cx="8.5" cy="7.5" r=".5"></circle><circle cx="6.5" cy="12.5" r=".5"></circle><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"></path></svg></span>
        <span class="menu-text">自定义图标</span>
      </div>
      <div class="menu-item" data-action="reset-icon">
        <span class="menu-icon"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"></path><path d="M1 20v-6h6"></path><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg></span>
        <span class="menu-text">重置为默认</span>
      </div>
    `;

    document.body.appendChild(menu);
    this.adjustMenuPosition(menu);

    // 添加显示动画类
    requestAnimationFrame(() => {
      menu.classList.add('show');
    });

    menu.querySelectorAll('.menu-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = (item as HTMLElement).dataset.action;
        this.handleAreaIconMenuAction(action, areaName, originalIcon);
        this.removeContextMenu();
      });
    });
  }

  /**
   * 处理区域图标菜单动作
   */
  private async handleAreaIconMenuAction(action: string | undefined, areaName: string, originalIcon: string): Promise<void> {
    switch (action) {
      case 'customize-icon':
        const currentIcon = await this.getCurrentAreaIcon(areaName, originalIcon);
        iconSelector.show(areaName, currentIcon, (newIcon: string) => {
          console.log('New icon selected:', newIcon);
          // 刷新UI显示，这里可能需要调用 renderer 的方法，或者发送事件
          // 暂时简单处理，重新加载页面或者通知 renderer
          window.location.reload(); // 简单粗暴，或者应该有一个 refreshAreaIcons 方法
        });
        break;
      case 'reset-icon':
        await invoke('set_area_icon_command', {
          areaName: areaName,
          icon: ''
        });
        window.location.reload();
        break;
    }
  }

  private async getCurrentAreaIcon(areaName: string, originalIcon: string): Promise<string> {
    try {
      const customIcon = await invoke('get_area_icon_command', { areaName }) as string | null;
      return (customIcon && customIcon.trim() !== '') ? customIcon : originalIcon;
    } catch (error) {
      console.error('获取区域图标失败:', error);
      return originalIcon;
    }
  }

  /**
   * 显示功能网格右键菜单
   */
  private showFeatureGridContextMenu(e: MouseEvent): void {
    const menu = document.createElement('div');
    menu.className = 'custom-context-menu';
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;

    menu.innerHTML = `
      <div class="menu-item" data-action="add-tool">
        <span class="menu-icon"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg></span>
        <span class="menu-text">添加工具</span>
      </div>
      <div class="menu-item" data-action="manage-tools">
        <span class="menu-icon"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg></span>
        <span class="menu-text">管理工具</span>
      </div>
    `;

    document.body.appendChild(menu);
    this.adjustMenuPosition(menu);

    // 添加显示动画类
    requestAnimationFrame(() => {
      menu.classList.add('show');
    });

    menu.querySelectorAll('.menu-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = (item as HTMLElement).dataset.action;
        this.handleFeatureGridMenuAction(action);
        this.removeContextMenu();
      });
    });
  }

  private handleFeatureGridMenuAction(action: string | undefined): void {
    switch (action) {
      case 'add-tool':
        // 需要 FeatureEvents 来处理这个，或者在这里触发回调
        // 暂时打印日志
        console.log('Trigger add-tool');
        // 理想情况下应该调用 FeatureEvents.showAddToolDialog()
        // 但这里没有引用，可能需要通过 triggerFeatureCallback 传递特殊事件
        break;
      case 'manage-tools':
        console.log('Trigger manage-tools');
        break;
    }
  }

  /**
   * 调整菜单位置防止溢出
   */
  private adjustMenuPosition(menu: HTMLElement): void {
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = `${window.innerWidth - rect.width - 10}px`;
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = `${window.innerHeight - rect.height - 10}px`;
    }
  }

  /**
   * 显示功能卡片右键菜单
   */
  private showFeatureContextMenu(e: MouseEvent, card: HTMLElement): void {
    const feature = card.dataset.feature;
    if (!feature) return;

    const menu = document.createElement('div');
    menu.className = 'custom-context-menu';
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;

    const isFavorite = card.classList.contains('favorite');

    menu.innerHTML = `
      <div class="menu-item" data-action="run">
        <span class="menu-icon"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg></span>
        <span class="menu-text">运行功能</span>
      </div>
      <div class="menu-item" data-action="favorite">
        <span class="menu-icon">${isFavorite ? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>' : '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>'}</span>
        <span class="menu-text">${isFavorite ? '取消收藏' : '添加到收藏'}</span>
      </div>
      <div class="menu-separator"></div>
      <div class="menu-item" data-action="help">
        <span class="menu-icon"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg></span>
        <span class="menu-text">功能说明</span>
      </div>
    `;

    document.body.appendChild(menu);

    // 调整位置防止溢出
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = `${window.innerWidth - rect.width - 10}px`;
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = `${window.innerHeight - rect.height - 10}px`;
    }

    // 添加显示动画类
    requestAnimationFrame(() => {
      menu.classList.add('show');
    });

    // 绑定菜单点击事件
    menu.querySelectorAll('.menu-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = (item as HTMLElement).dataset.action;
        this.handleFeatureMenuAction(action, feature, card);
        this.removeContextMenu();
      });
    });
  }

  /**
   * 处理功能菜单动作
   */
  private handleFeatureMenuAction(action: string | undefined, feature: string, card: HTMLElement): void {
    switch (action) {
      case 'run':
        this.triggerFeatureCallback(feature);
        break;
      case 'favorite':
        this.toggleFavorite(card);
        break;
      case 'help':
        this.showFeatureHelp(feature);
        break;
    }
  }

  /**
   * 切换收藏状态
   */
  private toggleFavorite(card: HTMLElement): void {
    card.classList.toggle('favorite');
    // 这里可以添加保存收藏状态的逻辑
    const feature = card.dataset.feature;
    const isFavorite = card.classList.contains('favorite');
    console.log(`功能 ${feature} 收藏状态: ${isFavorite}`);
    
    // 保存到本地存储
    try {
      const favorites = JSON.parse(localStorage.getItem('favorite_features') || '[]');
      if (isFavorite) {
        if (!favorites.includes(feature)) favorites.push(feature);
      } else {
        const index = favorites.indexOf(feature);
        if (index > -1) favorites.splice(index, 1);
      }
      localStorage.setItem('favorite_features', JSON.stringify(favorites));
    } catch (e) {
      console.error('保存收藏状态失败', e);
    }
  }

  /**
   * 显示功能帮助
   */
  private showFeatureHelp(feature: string): void {
    // 简单的帮助提示，后续可以扩展为弹窗
    const card = document.querySelector(`[data-feature="${feature}"]`);
    const title = card?.querySelector('h3')?.textContent || feature;
    const desc = card?.querySelector('p')?.textContent || '暂无说明';

    void showAlert({ title: `功能：${title}`, message: `说明：${desc}`, type: 'info' });
  }

  /**
   * 显示全局右键菜单
   */
  private showGlobalContextMenu(): void {
    // 移除全局右键菜单功能，不再显示任何菜单项
    // 如果需要，可以在这里添加其他全局菜单选项
    return;
  }

  /**
   * 移除右键菜单
   */
  private removeContextMenu(): void {
    const existingMenu = document.querySelector('.custom-context-menu');
    if (existingMenu) {
      existingMenu.remove();
    }
  }
}
