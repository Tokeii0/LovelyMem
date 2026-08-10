import { LovelymemApp } from '../../core/app';
import { StateManager } from '../../core/stateManager';
import { SearchEvents } from './searchEvents';
import { FeatureEvents } from './featureEvents';
import { SidebarEvents } from './sidebarEvents';
import { navBarDragManager } from '../components/NavBarDragManager';
import { watermarkManager } from '../watermarkManager';
import { wallpaperManager } from '../wallpaperManager';
import { invoke } from '@tauri-apps/api/core';
import { loadAppSettings } from '../../core/settingsHelper';
import { getAppVersion } from '../../core/appVersion';

import { showAlert } from '../../core/confirmDialog';
import { MessageManager } from '../../utils/message';

// 模态框通用 SVG 图标
const ModalIcons = {
  // 成功/勾选图标 (替代 ✅ ✓)
  success: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  // 错误/警告图标 (替代 ❌ ⚠️)
  error: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
  warning: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  // 信息图标 (替代 ℹ️)
  info: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
  // 搜索/检测图标 (替代 🔍)
  search: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  // 工具/修复图标 (替代 🔧)
  wrench: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
  // 文件夹图标 (替代 📁)
  folder: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
  // 齿轮/服务图标 (替代 ⚙️)
  gear: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  // 勾选小图标
  check: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  // 叉号小图标
  x: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  // 下载图标
  download: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  // 刷新图标
  refresh: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`,
};

export class GlobalEvents {
  private app: LovelymemApp;
  private stateManager: StateManager;
  private searchEvents: SearchEvents;
  private featureEvents: FeatureEvents;
  private sidebarEvents: SidebarEvents;
  private updateStatus: (text: string) => void;

  constructor(
    app: LovelymemApp,
    stateManager: StateManager,
    searchEvents: SearchEvents,
    featureEvents: FeatureEvents,
    sidebarEvents: SidebarEvents,
    updateStatus: (text: string) => void
  ) {
    this.app = app;
    this.stateManager = stateManager;
    this.searchEvents = searchEvents;
    this.featureEvents = featureEvents;
    this.sidebarEvents = sidebarEvents;
    this.updateStatus = updateStatus;
  }

  /**
   * 绑定全局事件
   */
  bindGlobalEvents(): void {
    document.addEventListener('click', (e) => this.globalClickHandler(e));
    this.bindKeyboardEvents();
    this.bindWindowEvents();
    this.bindThemeEvents();

    // 初始化导航栏拖拽排序功能
    // 延迟初始化以确保 DOM 已经渲染完成
    setTimeout(() => {
      navBarDragManager.init();
    }, 100);
  }

  /**
   * 更新主工作区并重新绑定搜索事件
   * 这是一个辅助方法，用于在工作区更新后重新绑定搜索框事件
   */
  /** 按区域索引缓存搜索词与工作区滚动位置，用于区域切换时恢复 */
  private areaUIState = new Map<number, { query: string; scroll: number }>();

  private async updateWorkspaceAndBindSearch(): Promise<void> {
    await this.sidebarEvents.updateMainWorkspace();
    // 工作区更新后重新绑定搜索事件（搜索框会重新创建）
    await new Promise(resolve => setTimeout(resolve, 50));
    this.searchEvents.bindSearchEvents();
  }

  /** 读取当前主工作区的搜索框元素（兼容三种搜索框形态） */
  private getWorkspaceSearchInput(): HTMLInputElement | null {
    return (document.querySelector('.expandable-search-input')
      || document.querySelector('.enhanced-search-input')
      || document.querySelector('.search-input')) as HTMLInputElement | null;
  }

  /** 保存指定区域的搜索词与滚动位置（在离开该区域前调用） */
  private saveAreaUIState(area: number): void {
    const query = this.getWorkspaceSearchInput()?.value || '';
    const workspace = document.querySelector('.main-workspace') as HTMLElement | null;
    const scroll = workspace?.scrollTop || 0;
    this.areaUIState.set(area, { query, scroll });
  }

  /** 恢复指定区域的搜索词（并重新过滤）与滚动位置（在重渲完成后调用） */
  private restoreAreaUIState(area: number): void {
    const state = this.areaUIState.get(area);
    if (!state) return;
    if (state.query) {
      const input = this.getWorkspaceSearchInput();
      if (input) {
        input.value = state.query;
        // 触发已绑定的搜索处理器以重新过滤功能卡片
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
    if (state.scroll > 0) {
      const workspace = document.querySelector('.main-workspace') as HTMLElement | null;
      if (workspace) workspace.scrollTop = state.scroll;
    }
  }

  /**
   * 全局点击处理
   */
  private globalClickHandler(e: MouseEvent): void {
    const target = e.target as HTMLElement;

    // 如果点击的是 select 元素或其选项，不处理，让浏览器默认行为处理
    if (target.tagName === 'SELECT' || target.tagName === 'OPTION') {
      return;
    }

    // 如果点击的是插件管理器对话框内的元素，不处理
    if (target.closest('.plugin-manager-dialog') || target.closest('.plugin-editor-dialog')) {
      return;
    }

    // 区域切换事件
    const areaSection = target.closest('.area-section');
    if (areaSection) {
      // 检查区域是否被禁用
      const isDisabled = areaSection.getAttribute('data-disabled') === 'true';
      if (isDisabled) {
        return;
      }

      const areaIndex = parseInt(areaSection.getAttribute('data-area') || '0');

      // 切换前保存当前区域的搜索词与滚动位置，便于切回时恢复
      const prevArea = this.stateManager.getState().selectedAvatar;
      this.saveAreaUIState(prevArea);
      // 重置当前标签页为功能页，确保显示正确的功能界面
      this.stateManager.updateCurrentTab('function');
      this.stateManager.updateSelectedModule(areaIndex);

      // 同步状态到modernUIRenderer
      (window as any).modernUIRenderer?.updateState(this.stateManager.getState());

      // 只更新必要的部分，而不是重新渲染整个页面
      this.sidebarEvents.updateSidebarActiveState(areaIndex);
      this.updateWorkspaceAndBindSearch().then(() => {
        this.restoreAreaUIState(areaIndex);
      }).catch(error => {
        console.error('更新主工作区失败:', error);
      });
      return;
    }

    // 分类筛选事件
    const categoryBtn = target.closest('.category-btn');
    if (categoryBtn) {
      const category = categoryBtn.getAttribute('data-category');
      this.searchEvents.filterFeaturesByCategory(category);
      return;
    }

    // 浮动分类筛选事件
    const floatingCategoryBtn = target.closest('.floating-category-btn');
    if (floatingCategoryBtn) {
      const category = floatingCategoryBtn.getAttribute('data-category');
      this.searchEvents.filterFeaturesByCategory(category);
      // 关闭抽屉
      const categoryBox = document.querySelector('.expandable-category-box');
      if (categoryBox) {
        categoryBox.classList.remove('expanded');
      }
      return;
    }

    // 浮动分类筛选器展开/收起事件
    const categoryBox = target.closest('.expandable-category-box');
    if (categoryBox && !target.closest('.floating-category-btn')) {
      categoryBox.classList.toggle('expanded');
      return;
    }

    // 功能卡片点击事件（排除配置按钮）
    const configBtn = target.closest('.config-btn');
    if (configBtn) {
      return;
    }

    // 收藏按钮点击事件
    const favBtn = target.closest('.feature-fav-btn') as HTMLElement;
    if (favBtn) {
      e.stopPropagation();
      const featureId = favBtn.getAttribute('data-fav-feature');
      if (featureId) {
        import('../../core/favorites').then(({ favoritesManager }) => {
          const isFav = favoritesManager.toggle(featureId);
          // 更新按钮样式
          favBtn.classList.toggle('is-favorite', isFav);
          favBtn.title = isFav ? '取消收藏' : '收藏';
          // 更新 SVG fill
          const svg = favBtn.querySelector('svg');
          if (svg) {
            const paths = svg.querySelectorAll('path, polygon');
            paths.forEach(p => {
              (p as SVGElement).setAttribute('fill', isFav ? 'var(--accent-color, #6366f1)' : 'none');
            });
          }
        });
      }
      return;
    }

    const featureCard = target.closest('.modern-feature-card');
    if (featureCard) {
      const feature = featureCard.getAttribute('data-feature');
      this.featureEvents.handleFeatureClick(feature).catch(error => {
        console.error('处理功能点击失败:', error);
      });
      return;
    }

    // 标题栏快捷按钮点击事件
    const shortcutBtn = target.closest('.title-shortcut-btn');
    if (shortcutBtn) {
      const feature = shortcutBtn.getAttribute('data-feature');
      this.featureEvents.handleFeatureClick(feature).catch(error => {
        console.error('处理功能点击失败:', error);
      });
      return;
    }

    // 通知中心按钮
    if (target.closest('#notification-center-btn')) {
      e.preventDefault();
      e.stopPropagation();
      import('../../core/notificationCenter').then(({ notificationCenter }) => {
        notificationCenter.toggle();
      });
      return;
    }

    // 回到顶部按钮
    if (target.closest('#scroll-to-top-btn')) {
      const scrollWrapper = document.querySelector('.feature-scroll-wrapper');
      if (scrollWrapper) {
        scrollWrapper.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }

    // 标题栏操作按钮事件
    const titleBtn = target.closest('.title-action-btn');
    if (titleBtn) {
      const action = titleBtn.getAttribute('data-action');
      this.featureEvents.handleTitleBarAction(action).catch(error => {
        console.error('处理标题栏操作失败:', error);
        this.updateStatus('操作失败');
      });
      return;
    }

    // 主题切换选项点击事件
    const themeOption = target.closest('.theme-switch-option');
    if (themeOption) {
      const action = themeOption.getAttribute('data-action');
      const theme = themeOption.getAttribute('data-theme');

      if (action === 'set-theme' && theme) {
        this.featureEvents.handleSetThemeAction(theme).catch((error: any) => {
          console.error('切换主题失败:', error);
          this.updateStatus('切换主题失败');
        });
        return;
      }
    }

    // 镜像状态区域按钮事件
    const imageBtn = target.closest('.image-load-btn, .image-action-btn, .image-load-btn-large, .welcome-load-btn, .welcome-enter-btn, .welcome-drop-card');
    if (imageBtn) {
      const action = imageBtn.getAttribute('data-action');
      this.featureEvents.handleTitleBarAction(action).catch(error => {
        console.error('处理镜像操作失败:', error);
        this.updateStatus('操作失败');
      });
      return;
    }

    // 最近会话 - 点击重新加载
    const recentItem = target.closest('.welcome-recent-item') as HTMLElement;
    if (recentItem && !target.closest('.recent-item-remove')) {
      const path = recentItem.getAttribute('data-recent-path');
      if (path) {
        const imageManager = (this.app as any).imageManager;
        if (imageManager) {
          imageManager.loadImageFromPath(path).catch((err: any) => {
            console.error('重新加载镜像失败:', err);
          });
        }
      }
      return;
    }

    // 最近会话 - 移除单个
    const removeBtn = target.closest('.recent-item-remove') as HTMLElement;
    if (removeBtn) {
      e.stopPropagation();
      const path = removeBtn.getAttribute('data-remove-path');
      if (path) {
        import('../../core/recentSessions').then(({ recentSessions }) => {
          recentSessions.remove(path);
          // 重新渲染欢迎页
          this.sidebarEvents.updateMainWorkspace().catch(() => {});
        });
      }
      return;
    }

    // 最近会话 - 清除全部
    if (target.id === 'clear-recent-sessions' || target.closest('#clear-recent-sessions')) {
      import('../../core/recentSessions').then(({ recentSessions }) => {
        recentSessions.clear();
        this.sidebarEvents.updateMainWorkspace().catch(() => {});
      });
      return;
    }

    // 状态栏操作按钮事件
    const statusBtn = target.closest('.status-action-btn');
    if (statusBtn) {
      const action = statusBtn.getAttribute('data-action');
      this.featureEvents.handleTitleBarAction(action).catch(error => {
        console.error('处理状态栏操作失败:', error);
        this.updateStatus('操作失败');
      });
      return;
    }

    // 侧边栏切换按钮事件
    const sidebarToggle = target.closest('.sidebar-toggle');
    if (sidebarToggle) {
      this.sidebarEvents.handleSidebarToggleWithEffect(sidebarToggle as HTMLElement);
      e.stopPropagation();
      return;
    }

    // 导航栏展开/收起切换
    const navToggle = target.closest('.nav-toggle');
    if (navToggle) {
      const navbar = document.querySelector('.vertical-navbar');
      if (navbar) {
        const isExpanded = navbar.classList.toggle('expanded');
        localStorage.setItem('navbar-expanded', isExpanded ? '1' : '0');
      }
      e.stopPropagation();
      return;
    }

    // 二级菜单点击事件
    const secondaryMenuItem = target.closest('.secondary-menu-item');
    if (secondaryMenuItem) {
      const action = secondaryMenuItem.getAttribute('data-action');
      const targetArea = secondaryMenuItem.getAttribute('data-target');

      if (action === 'switch-area' && targetArea) {
        this.handleAreaSwitch(targetArea);
        e.stopPropagation();
        return;
      }

      // 「更多工具」二级菜单 → 模拟导航点击
      if (action === 'nav-shortcut') {
        const navTarget = secondaryMenuItem.getAttribute('data-nav-target');
        if (navTarget) {
          this.simulateNavClick(navTarget);
          e.stopPropagation();
          return;
        }
      }
    }

    // 通用区域切换按钮
    const switchAreaBtn = target.closest('.switch-area-btn');
    if (switchAreaBtn) {
      const targetArea = switchAreaBtn.getAttribute('data-target');
      if (targetArea) {
        this.handleAreaSwitch(targetArea);
        e.stopPropagation();
        return;
      }
    }

    // 导航栏设置按钮事件
    const navItem = target.closest('.nav-item');
    if (navItem) {
      // 如果处于编辑模式（拖拽排序），不处理点击事件
      if (navBarDragManager.isInEditMode()) {
        e.stopPropagation();
        return;
      }

      const navType = navItem.getAttribute('data-nav');
      if (navType && navType !== 'settings' && navType !== 'more-tools') {

      }

      // 处理设置按钮
      if (navType === 'settings') {
        this.showSettingsMenu(e, navItem as HTMLElement);
        e.stopPropagation();
        return;
      }

      // 处理文件按钮
      if (navType === 'files') {
        this.handleFilesNavClick(navItem as HTMLElement);
        e.stopPropagation();
        return;
      }

      // 处理终端按钮
      if (navType === 'terminal') {
        this.handleTerminalNavClick(navItem as HTMLElement);
        e.stopPropagation();
        return;
      }

      // 处理主页按钮
      if (navType === 'home') {
        this.handleHomeNavClick(navItem as HTMLElement);
        e.stopPropagation();
        return;
      }

      // 处理日志按钮
      if (navType === 'logs') {
        this.handleLogsNavClick(navItem as HTMLElement);
        e.stopPropagation();
        return;
      }

      // 处理注册表按钮
      if (navType === 'registry-viewer') {
        this.handleRegistryViewerNavClick(navItem as HTMLElement);
        e.stopPropagation();
        return;
      }

      // 处理事件查看器按钮
      if (navType === 'event-viewer') {
        this.handleEventViewerNavClick(navItem as HTMLElement);
        e.stopPropagation();
        return;
      }

      // 处理AI助手按钮
      if (navType === 'ai-chat') {
        this.handleAIChatNavClick(navItem as HTMLElement);
        e.stopPropagation();
        return;
      }

      // 处理告警按钮
      if (navType === 'warnings') {
        this.handleWarningsNavClick(navItem as HTMLElement);
        e.stopPropagation();
        return;
      }

      // 处理报告编辑器按钮
      if (navType === 'report-editor') {
        this.handleReportEditorNavClick(navItem as HTMLElement);
        e.stopPropagation();
        return;
      }

      // 处理星图按钮
      if (navType === 'process-galaxy') {
        this.handleProcessGalaxyNavClick(navItem as HTMLElement);
        e.stopPropagation();
        return;
      }

      // 处理星迹按钮
      if (navType === 'timeline-galaxy') {
        this.handleTimelineGalaxyNavClick(navItem as HTMLElement);
        e.stopPropagation();
        return;
      }

      // 处理字符串搜索按钮
      if (navType === 'string-search') {
        this.handleStringSearchNavClick(navItem as HTMLElement);
        e.stopPropagation();
        return;
      }

      // 处理 Super Timeline 按钮
      if (navType === 'super-timeline') {
        this.handleSuperTimelineNavClick(navItem as HTMLElement);
        e.stopPropagation();
        return;
      }

    }

    // 文件操作事件
    const fileActionBtn = target.closest('.file-action-btn');
    if (fileActionBtn) {
      const action = fileActionBtn.getAttribute('data-action');
      this.featureEvents.handleFileAction(action);
      e.stopPropagation();
      return;
    }

    // 搜索建议相关事件处理
    const searchContainer = target.closest('.search-container');
    const suggestionItem = target.closest('.search-suggestion-item');

    if (!searchContainer && !suggestionItem) {
      // 点击搜索区域外部，隐藏搜索建议
      const suggestionsContainer = document.getElementById('search-suggestions');
      if (suggestionsContainer) {
        suggestionsContainer.style.display = 'none';
      }
    }

    // 点击其他地方关闭分类筛选抽屉
    const expandedCategoryBox = document.querySelector('.expandable-category-box');
    if (expandedCategoryBox && !expandedCategoryBox.contains(target)) {
      expandedCategoryBox.classList.remove('expanded');
    }

    // 关闭下拉菜单
    if (!target.closest('.dropdown-toggle') && !target.closest('.dropdown-menu')) {
      document.querySelectorAll('.dropdown-menu.show').forEach(menu => {
        menu.classList.remove('show');
      });
    }

    // 关闭模态框（点击背景）
    if (target.classList.contains('modal-overlay')) {
      const modal = target.closest('.modal');
      if (modal) {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 300);
      }
    }
  }

  /**
   * 获取主工作区元素（兼容各种视图状态）
   */
  private getMainWorkspaceElement(): HTMLElement | null {
    let mainWorkspace = document.querySelector('.main-workspace') as HTMLElement ||
                        document.getElementById('ai-chat-root') as HTMLElement;

    if (!mainWorkspace) {
        const mainContainer = document.querySelector('.main-container');
        if (mainContainer) {
            const children = Array.from(mainContainer.children);
            for (const child of children) {
                if (!child.classList.contains('vertical-navbar') &&
                    !child.classList.contains('modern-sidebar')) {
                    mainWorkspace = child as HTMLElement;
                    break;
                }
            }
        }
    }
    return mainWorkspace;
  }

  /**
   * 处理文件导航点击
   */
  private async handleFilesNavClick(navItem: HTMLElement): Promise<void> {
    // 更新导航栏激活状态
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    navItem.classList.add('active');

    // 重置当前标签页状态
    this.stateManager.updateCurrentTab('files');

    const mainWorkspace = this.getMainWorkspaceElement();
    const modernSidebar = document.querySelector('.modern-sidebar') as HTMLElement;

    if (mainWorkspace) {
      // 隐藏侧边栏，使文件界面占据整个空间
      // if (modernSidebar) {
      //   modernSidebar.style.display = 'none';
      // }

      // 获取 FilesInterface 实例
      const filesInterface = (this.app as any).filesInterface;
      if (filesInterface) {
        // 渲染文件界面
        mainWorkspace.innerHTML = filesInterface.render();
        // 恢复 main-workspace 类名，确保后续操作正常
        if (!mainWorkspace.classList.contains('main-workspace')) {
            mainWorkspace.className = 'main-workspace';
            mainWorkspace.id = ''; // 清除可能存在的特定ID
        }

        // 初始化逻辑 - 直接传入mainWorkspace，因为render()返回的HTML会被设置为其innerHTML
        await filesInterface.initialize(mainWorkspace);
      }
    }
  }

  /**
   * 处理终端导航点击
   */
  private async handleTerminalNavClick(navItem: HTMLElement): Promise<void> {
    // 更新导航栏激活状态
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    navItem.classList.add('active');

    // 重置当前标签页状态
    this.stateManager.updateCurrentTab('terminal');

    const mainWorkspace = this.getMainWorkspaceElement();
    const modernSidebar = document.querySelector('.modern-sidebar') as HTMLElement;

    if (mainWorkspace) {
      // 隐藏侧边栏，使终端界面占据整个空间
      // if (modernSidebar) {
      //   modernSidebar.style.display = 'none';
      // }

      // 获取 TerminalInterface 实例
      const terminalInterface = (this.app as any).terminalInterface;
      if (terminalInterface) {
        try {
          // 渲染终端界面
          mainWorkspace.innerHTML = terminalInterface.render();
          // 恢复 main-workspace 类名
          if (!mainWorkspace.classList.contains('main-workspace')) {
              mainWorkspace.className = 'main-workspace';
              mainWorkspace.id = '';
          }

          // 初始化逻辑（如果已经初始化过，会跳过重复初始化）
          await terminalInterface.initialize(mainWorkspace);
        } catch (error) {
          console.error('❌ 终端初始化失败:', error);
          mainWorkspace.innerHTML = `<div style="padding: 40px; color: #ef4444; text-align: center;">
            <h3>终端初始化失败</h3>
            <p style="color: #94a3b8; margin-top: 8px;">${error}</p>
          </div>`;
        }
      }
    }
  }

  /**
   * 处理主页导航点击
   */
  private async handleHomeNavClick(navItem: HTMLElement): Promise<void> {
    // 更新导航栏激活状态
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    navItem.classList.add('active');

    // 重置当前标签页为功能页
    this.stateManager.updateCurrentTab('function');

    // 同步状态到modernUIRenderer
    (window as any).modernUIRenderer?.updateState(this.stateManager.getState());

    const modernSidebar = document.querySelector('.modern-sidebar') as HTMLElement;
    // 恢复侧边栏显示
    // if (modernSidebar) {
    //   const state = this.stateManager.getState();
    //   if (state.currentImage) {
    //     modernSidebar.style.display = '';
    //   } else {
    //     modernSidebar.style.display = 'none';
    //   }
    // }

    // 恢复主工作区
    await this.updateWorkspaceAndBindSearch();
  }

  /**
   * 处理日志导航点击
   */
  private async handleLogsNavClick(navItem: HTMLElement): Promise<void> {
    // 更新导航栏激活状态
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    navItem.classList.add('active');

    // 重置当前标签页状态
    this.stateManager.updateCurrentTab('logs');

    const mainWorkspace = this.getMainWorkspaceElement();

    if (mainWorkspace) {
      // 获取 LogPage 实例
      const logPage = (this.app as any).logPage;
      if (logPage) {
        // 从 app 获取已收集的后端日志
        const backendLogs = (this.app as any).getBackendLogs?.() || [];

        // 传递给 LogPage
        logPage.backendLogs = backendLogs;

        // 渲染日志界面
        mainWorkspace.innerHTML = logPage.render();
        // 恢复 main-workspace 类名
        if (!mainWorkspace.classList.contains('main-workspace')) {
            mainWorkspace.className = 'main-workspace';
            mainWorkspace.id = '';
        }

        // 初始化逻辑
        await logPage.initialize(mainWorkspace);
      }
    }
  }

  /**
   * 处理AI助手导航点击
   */
  private async handleAIChatNavClick(navItem: HTMLElement): Promise<void> {
    // 更新导航栏激活状态
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    navItem.classList.add('active');

    // 更新当前标签页状态
    this.stateManager.updateCurrentTab('ai-chat');

    // 同步状态到modernUIRenderer
    (window as any).modernUIRenderer?.updateState(this.stateManager.getState());

    // 更新主工作区
    await this.updateWorkspaceAndBindSearch();
  }

  /**
   * 处理告警导航点击
   */
  private async handleWarningsNavClick(navItem: HTMLElement): Promise<void> {
    // 更新导航栏激活状态
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    navItem.classList.add('active');

    // 更新当前标签页状态
    this.stateManager.updateCurrentTab('warnings');

    // 同步状态到modernUIRenderer
    (window as any).modernUIRenderer?.updateState(this.stateManager.getState());

    // 更新主工作区
    await this.updateWorkspaceAndBindSearch();
  }

  /**
   * 显示设置菜单
   */
  private showSettingsMenu(_e: MouseEvent, target: HTMLElement): void {
    // 移除已存在的菜单
    this.closeAllOverlays();

    const menu = document.createElement('div');
    menu.className = 'settings-menu-dropdown'; // 使用不同的类名避免被删除

    // 获取按钮位置
    const rect = target.getBoundingClientRect();

    // 计算菜单位置（显示在按钮右侧）
    let left = rect.right + 10;
    let top = rect.top;

    // 防止菜单超出屏幕边界
    const menuWidth = 320; // 预估菜单宽度
    const menuHeight = 450; // 预估菜单高度

    if (left + menuWidth > window.innerWidth) {
      left = rect.left - menuWidth - 10;
    }

    if (top + menuHeight > window.innerHeight) {
      top = window.innerHeight - menuHeight - 10;
    }

    // 确保top不会为负值
    if (top < 10) {
      top = 10;
    }

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.position = 'fixed';
    menu.style.zIndex = '10000';

    // 获取当前主题
    const currentTheme = this.stateManager.getState().theme || 'light';

    menu.innerHTML = `
      <div class="menu-item" data-action="unmount-image">
        <span class="menu-icon" style="display: flex; align-items: center; justify-content: center;">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7"/><path d="M7 9l5-5 5 5"/><path d="M12 4v12"/></svg>
        </span>
        <span class="menu-text">卸载镜像/返回加载界面</span>
      </div>
      <div class="menu-separator"></div>
      <div class="menu-item menu-item-theme-switch">
        <span class="menu-icon" style="display: flex; align-items: center; justify-content: center;">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
        </span>
        <span class="menu-text">主题切换</span>
        <div class="theme-switch-container menu-theme-switch" data-current-theme="${currentTheme}">
          <div class="theme-switch-option ${currentTheme === 'light' ? 'active' : ''}" data-action="set-theme" data-theme="light" title="浅色模式">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.42 9.22A7 7 0 0 0 5.06 10.8A5 5 0 0 0 5 20H18A6 6 0 0 0 18.42 9.22Z"/>
            </svg>
            <span>浅色</span>
          </div>
          <div class="theme-switch-option ${currentTheme === 'dark' ? 'active' : ''}" data-action="set-theme" data-theme="dark" title="深色模式">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
            <span>深色</span>
          </div>
          <div class="theme-switch-option ${currentTheme === 'sakura' ? 'active' : ''}" data-action="set-theme" data-theme="sakura" title="少女模式">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12,2C12,2,14,5,14,8C14,11,12,12,12,12S10,11,10,8C10,5,12,2,12,2M12,22C12,22,10,19,10,16C10,13,12,12,12,12S14,13,14,16C14,19,12,22,12,22M22,12C22,12,19,14,16,14C13,14,12,12,12,12S13,10,16,10C19,10,22,12,22,12M2,12C2,12,5,10,8,10C11,10,12,12,12,12S11,14,8,14C5,14,2,12,2,12"/>
              <circle cx="12" cy="12" r="2" opacity="0.5"/>
            </svg>
            <span>粉色</span>
          </div>
          <div class="theme-switch-glider"></div>
        </div>
      </div>
      <div class="menu-separator"></div>
      <div class="menu-item submenu-parent" data-submenu="wallpaper-settings">
        <span class="menu-icon" style="display: flex; align-items: center; justify-content: center;">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
        </span>
        <span class="menu-text">壁纸换肤</span>
        <span class="submenu-arrow">▶</span>
      </div>
      <div class="menu-item" data-action="settings">
        <span class="menu-icon" style="display: flex; align-items: center; justify-content: center;">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </span>
        <span class="menu-text">应用设置</span>
      </div>
      <div class="menu-item submenu-parent" data-submenu="watermark-settings">
        <span class="menu-icon" style="display: flex; align-items: center; justify-content: center;">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.74 5.74a8 8 0 1 1-11.31 0z"/></svg>
        </span>
        <span class="menu-text">水印设置</span>
        <span class="submenu-arrow">▶</span>
      </div>
      <div class="menu-item" data-action="reset-navbar-order">
        <span class="menu-icon" style="display: flex; align-items: center; justify-content: center;">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
        </span>
        <span class="menu-text">重置导航栏顺序</span>
      </div>
      <div class="menu-separator"></div>
      <div class="menu-item" data-action="about">
        <span class="menu-icon" style="display: flex; align-items: center; justify-content: center;">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
        </span>
        <span class="menu-text">关于软件</span>
      </div>
    `;

    document.body.appendChild(menu);

    // 绑定点击事件
    menu.querySelectorAll('.menu-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const menuItem = e.currentTarget as HTMLElement;
        const action = menuItem.dataset.action;
        const submenu = menuItem.dataset.submenu;

        // 如果点击的是主题切换容器所在的菜单项，不关闭菜单
        if (menuItem.classList.contains('menu-item-theme-switch')) {
          return;
        }

        // 处理子菜单
        if (submenu) {
          this.showSubmenu(menuItem, submenu, menu);
          return;
        }

        this.handleSettingsAction(action);
        menu.remove();
      });
    });

    // 绑定主题切换选项事件
    menu.querySelectorAll('.theme-switch-option').forEach(option => {
      option.addEventListener('click', async (e) => {
        e.stopPropagation();
        const themeOption = e.currentTarget as HTMLElement;
        const theme = themeOption.getAttribute('data-theme');

        if (theme) {
          // 移除所有active状态
          menu.querySelectorAll('.theme-switch-option').forEach(opt => opt.classList.remove('active'));
          // 添加当前选项的active状态
          themeOption.classList.add('active');

          // 更新容器的 data-current-theme 属性以控制滑块位置
          const container = themeOption.closest('.theme-switch-container');
          if (container) {
            container.setAttribute('data-current-theme', theme);
          }

          // 切换主题
          try {
            await this.app.setTheme(theme);
          } catch (error: any) {
            console.error('切换主题失败:', error);
            this.updateStatus('切换主题失败');
          }
        }
      });
    });

    // 点击外部关闭
    const closeMenu = (e: MouseEvent) => {
      const submenu = document.querySelector('.settings-submenu');
      const eventTarget = e.target as Node;

      // 如果点击在主菜单或子菜单内，不关闭
      if (menu.contains(eventTarget) || (submenu && submenu.contains(eventTarget))) {
        return;
      }

      // 如果点击的是触发按钮本身，也不处理（防止立即关闭）
      if (eventTarget === target || target.contains(eventTarget)) {
        return;
      }

      menu.remove();
      if (submenu) submenu.remove();
      document.removeEventListener('click', closeMenu);
    };

    // 延迟绑定以避免立即触发关闭
    setTimeout(() => {
      document.addEventListener('click', closeMenu);
    }, 0);
  }

  /**
   * 处理设置菜单动作
   */
  private handleSettingsAction(action: string | undefined): void {
    switch (action) {
      case 'unmount-image':
        // 卸载镜像
        (this.app as any).unloadImageFile();
        break;
      case 'settings':
        // 应用设置
        this.app.showSettingsDialog();
        break;
      case 'watermark-settings':
        // 水印设置子菜单
        this.showWatermarkSubmenu();
        break;
      case 'about':
        // 关于软件
        getAppVersion().then(ver => { void showAlert({ title: '关于', message: `Lovelymem V2 ${ver}\n\n一个现代化的内存取证分析工具。`, type: 'info' }); });
        break;
      case 'toggle-watermark':
        // 切换水印
        this.handleToggleWatermark();
        break;
      case 'customize-watermark':
        // 自定义水印
        this.handleCustomizeWatermark();
        break;
      case 'toggle-wallpaper':
        this.handleToggleWallpaper();
        break;
      case 'import-wallpaper':
        this.handleImportWallpaper();
        break;
      case 'clear-wallpaper':
        this.handleClearWallpaper();
        break;
      case 'wallpaper-advanced':
        this.showWallpaperAdvancedDialog();
        break;
      case 'reset-navbar-order':
        // 重置导航栏顺序
        navBarDragManager.resetOrder();
        break;
    }
  }

  /**
   * 显示水印设置子菜单
   */
  private showWatermarkSubmenu(): void {
    // 实现水印设置子菜单逻辑
    MessageManager.showInfo('水印设置功能开发中...');
  }

  /**
   * 处理水印开关
   */
  private async handleToggleWatermark(): Promise<void> {
    try {
      // 加载当前设置
      const settings = await loadAppSettings();

      const watermarkConfig: any = settings.watermark_config
        ? { ...settings.watermark_config }
        : { enabled: true, custom_text: '', opacity: 0.1, font_size: 20, density: 1.0 };

      // 切换开关
      watermarkConfig.enabled = !watermarkConfig.enabled;

      settings.watermark_config = watermarkConfig;

      await invoke('save_settings_command', { settings });

      // 更新水印管理器配置
      watermarkManager.setConfig(watermarkConfig);

      // 更新水印显示
      if (watermarkConfig.enabled) {
        watermarkManager.addWatermark('Lovelymem V2');
        this.updateStatus('水印已开启');
      } else {
        watermarkManager.removeWatermark();
        this.updateStatus('水印已关闭');
      }

      console.log('✅ 水印开关已切换:', watermarkConfig.enabled);
    } catch (error) {
      console.error('❌ 切换水印开关失败:', error);
      this.updateStatus('切换水印开关失败');
    }
  }

  /**
   * 处理自定义水印
   */
  private async handleCustomizeWatermark(): Promise<void> {
    try {
      // 加载当前设置
      const settings = await loadAppSettings();

      const watermarkConfig: any = settings.watermark_config
        ? { ...settings.watermark_config }
        : { enabled: true, custom_text: '', opacity: 0.1, font_size: 20, density: 1.0 };

      // 显示自定义对话框
      this.showWatermarkCustomizeDialog(watermarkConfig);

    } catch (error) {
      console.error('❌ 自定义水印失败:', error);
      this.updateStatus('自定义水印失败');
    }
  }

  /**
   * 显示水印自定义对话框
   */
  private showWatermarkCustomizeDialog(currentConfig: any): void {
    const dialog = document.createElement('div');
    dialog.className = 'watermark-customize-dialog';
    dialog.innerHTML = `
      <div class="watermark-customize-overlay"></div>
      <div class="watermark-customize-content">
        <div class="watermark-customize-header">
          <span class="watermark-customize-icon">💧</span>
          <h3>自定义水印</h3>
        </div>
        <div class="watermark-customize-body">
          <div class="watermark-form-group">
            <label>自定义文本</label>
            <input type="text" class="watermark-custom-text"
                   value="${currentConfig.custom_text || ''}"
                   placeholder="留空则使用默认水印">
          </div>
          <div class="watermark-form-group">
            <label class="opacity-label">透明度 (${currentConfig.opacity || 0.1})</label>
            <input type="range" class="watermark-opacity"
                   min="0.05" max="0.3" step="0.05"
                   value="${currentConfig.opacity || 0.1}">
          </div>
          <div class="watermark-form-group">
            <label class="font-size-label">字体大小 (${currentConfig.font_size || 20}px)</label>
            <input type="range" class="watermark-font-size"
                   min="12" max="40" step="2"
                   value="${currentConfig.font_size || 20}">
          </div>
          <div class="watermark-form-group">
            <label class="density-label">密集程度 (${currentConfig.density || 1.0})</label>
            <input type="range" class="watermark-density"
                   min="0.5" max="2.0" step="0.1"
                   value="${currentConfig.density || 1.0}">
            <div class="watermark-density-hint">0.5=稀疏 | 1.0=默认 | 2.0=密集</div>
          </div>
        </div>
        <div class="watermark-customize-footer">
          <button class="watermark-cancel-btn">取消</button>
          <button class="watermark-save-btn">保存</button>
        </div>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      .watermark-customize-dialog {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 10000;
      }

      .watermark-customize-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(4px);
      }

      .watermark-customize-content {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: var(--bg-primary, white);
        border-radius: 12px;
        padding: 24px;
        min-width: 400px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
      }

      .watermark-customize-header {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 20px;
      }

      .watermark-customize-icon {
        font-size: 32px;
      }

      .watermark-customize-header h3 {
        margin: 0;
        font-size: 20px;
        color: var(--text-primary, #1e293b);
      }

      .watermark-customize-body {
        margin-bottom: 20px;
      }

      .watermark-form-group {
        margin-bottom: 16px;
      }

      .watermark-form-group label {
        display: block;
        margin-bottom: 8px;
        color: var(--text-secondary, #475569);
        font-size: 14px;
        font-weight: 500;
      }

      .watermark-custom-text {
        width: 100%;
        padding: 10px 12px;
        border: 1px solid var(--border-primary, #e2e8f0);
        border-radius: 8px;
        font-size: 14px;
        transition: all 0.2s ease;
        background: var(--bg-secondary, white);
        color: var(--text-primary, #1e293b);
        box-sizing: border-box;
      }

      .watermark-custom-text:focus {
        outline: none;
        border-color: #667eea;
        box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
      }

      .watermark-opacity,
      .watermark-font-size,
      .watermark-density {
        width: 100%;
        height: 6px;
        border-radius: 3px;
        background: var(--bg-tertiary, #e2e8f0);
        outline: none;
        -webkit-appearance: none;
      }

      .watermark-opacity::-webkit-slider-thumb,
      .watermark-font-size::-webkit-slider-thumb,
      .watermark-density::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        cursor: pointer;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
      }

      .watermark-density-hint {
        margin-top: 6px;
        font-size: 12px;
        color: var(--text-tertiary, #94a3b8);
        text-align: center;
      }

      .watermark-customize-footer {
        display: flex;
        gap: 12px;
        justify-content: flex-end;
      }

      .watermark-cancel-btn,
      .watermark-save-btn {
        padding: 10px 20px;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: all 0.2s ease;
      }

      .watermark-cancel-btn {
        background: var(--bg-tertiary, #f1f5f9);
        color: var(--text-secondary, #64748b);
      }

      .watermark-cancel-btn:hover {
        background: var(--bg-hover, #e2e8f0);
      }

      .watermark-save-btn {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
      }

      .watermark-save-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
      }
    `;
    dialog.appendChild(style);

    // 实时更新标签
    const opacityInput = dialog.querySelector('.watermark-opacity') as HTMLInputElement;
    const fontSizeInput = dialog.querySelector('.watermark-font-size') as HTMLInputElement;
    const densityInput = dialog.querySelector('.watermark-density') as HTMLInputElement;
    const opacityLabel = dialog.querySelector('.opacity-label') as HTMLElement;
    const fontSizeLabel = dialog.querySelector('.font-size-label') as HTMLElement;
    const densityLabel = dialog.querySelector('.density-label') as HTMLElement;

    opacityInput?.addEventListener('input', () => {
      if (opacityLabel) opacityLabel.textContent = `透明度 (${opacityInput.value})`;
    });

    fontSizeInput?.addEventListener('input', () => {
      if (fontSizeLabel) fontSizeLabel.textContent = `字体大小 (${fontSizeInput.value}px)`;
    });

    densityInput?.addEventListener('input', () => {
      if (densityLabel) densityLabel.textContent = `密集程度 (${densityInput.value})`;
    });

    // 保存按钮
    const saveBtn = dialog.querySelector('.watermark-save-btn');
    saveBtn?.addEventListener('click', async () => {
      try {
        const customText = (dialog.querySelector('.watermark-custom-text') as HTMLInputElement).value;
        const opacity = parseFloat((dialog.querySelector('.watermark-opacity') as HTMLInputElement).value);
        const fontSize = parseInt((dialog.querySelector('.watermark-font-size') as HTMLInputElement).value);
        const density = parseFloat((dialog.querySelector('.watermark-density') as HTMLInputElement).value);

        const newConfig = {
          enabled: currentConfig.enabled,
          custom_text: customText,
          opacity: opacity,
          font_size: fontSize,
          density: density
        };

        const settings = await loadAppSettings();
        settings.watermark_config = newConfig;
        await invoke('save_settings_command', { settings });

        // 更新水印管理器配置
        watermarkManager.setConfig(newConfig);

        // 更新水印显示
        if (newConfig.enabled) {
          watermarkManager.removeWatermark();
          watermarkManager.addWatermark('Lovelymem V2');
        }

        this.updateStatus('水印配置已保存');
        dialog.remove();
        console.log('✅ 水印配置已保存:', newConfig);
      } catch (error) {
        console.error('❌ 保存水印配置失败:', error);
        this.updateStatus('保存水印配置失败');
      }
    });

    // 取消按钮
    const cancelBtn = dialog.querySelector('.watermark-cancel-btn');
    cancelBtn?.addEventListener('click', () => {
      dialog.remove();
    });

    // 点击遮罩关闭
    const overlay = dialog.querySelector('.watermark-customize-overlay');
    overlay?.addEventListener('click', (e) => {
      if (e.target === overlay) {
        dialog.remove();
      }
    });

    document.body.appendChild(dialog);
  }


  /**
   * 显示子菜单
   */
  private showSubmenu(parentItem: HTMLElement, submenuType: string, parentMenu: HTMLElement): void {
    // 移除已存在的子菜单
    const existingSubmenu = document.querySelector('.settings-submenu');
    if (existingSubmenu) {
      existingSubmenu.remove();
    }

    const submenu = document.createElement('div');
    submenu.className = 'settings-menu-dropdown settings-submenu'; // 使用 settings-menu-dropdown 以继承样式

    let submenuContent = '';
    if (submenuType === 'watermark-settings') {
      submenuContent = `
        <div class="menu-item" data-action="toggle-watermark">
          <span class="menu-icon" style="display: flex; align-items: center; justify-content: center;">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>
          </span>
          <span class="menu-text">水印开关</span>
        </div>
        <div class="menu-item" data-action="customize-watermark">
          <span class="menu-icon" style="display: flex; align-items: center; justify-content: center;">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
          </span>
          <span class="menu-text">自定义水印</span>
        </div>
      `;
    } else if (submenuType === 'wallpaper-settings') {
      const settings = wallpaperManager.getSettings();
      const enabledText = settings.enabled ? '关闭壁纸' : '开启壁纸';
      submenuContent = `
        <div class="menu-item" data-action="toggle-wallpaper">
          <span class="menu-icon" style="display: flex; align-items: center; justify-content: center;">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.94 13.05A8 8 0 0 1 10.95 3.06"/><path d="M22 12A10 10 0 1 1 12 2"/></svg>
          </span>
          <span class="menu-text">${enabledText}</span>
        </div>
        <div class="menu-item" data-action="import-wallpaper">
          <span class="menu-icon" style="display: flex; align-items: center; justify-content: center;">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </span>
          <span class="menu-text">导入壁纸</span>
        </div>
        <div class="menu-item" data-action="clear-wallpaper">
          <span class="menu-icon" style="display: flex; align-items: center; justify-content: center;">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </span>
          <span class="menu-text">清除壁纸</span>
        </div>
        <div class="menu-item" data-action="wallpaper-advanced">
          <span class="menu-icon" style="display: flex; align-items: center; justify-content: center;">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </span>
          <span class="menu-text">高级调节</span>
        </div>
      `;
    }

    submenu.innerHTML = submenuContent;

    // 计算子菜单位置
    const parentRect = parentItem.getBoundingClientRect();
    const parentMenuRect = parentMenu.getBoundingClientRect();

    submenu.style.position = 'fixed';
    submenu.style.left = `${parentMenuRect.right + 5}px`;
    submenu.style.top = `${parentRect.top}px`;
    submenu.style.zIndex = '10001';

    document.body.appendChild(submenu);

    // 调整位置防止溢出
    const submenuRect = submenu.getBoundingClientRect();
    if (submenuRect.right > window.innerWidth) {
      submenu.style.left = `${parentMenuRect.left - submenuRect.width - 5}px`;
    }
    if (submenuRect.bottom > window.innerHeight) {
      submenu.style.top = `${window.innerHeight - submenuRect.height - 10}px`;
    }

    // 绑定子菜单点击事件
    submenu.querySelectorAll('.menu-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = (e.currentTarget as HTMLElement).dataset.action;
        this.handleSettingsAction(action);
        parentMenu.remove();
        submenu.remove();
      });
    });
  }

  /**
   * 绑定键盘快捷键
   */
  private bindKeyboardEvents(): void {
    document.addEventListener('keydown', (e) => {
      // Ctrl+F: 聚焦搜索框
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        this.searchEvents.focusSearch();
      }

      // Ctrl+L: 加载镜像
      if (e.ctrlKey && e.key === 'l') {
        e.preventDefault();
        this.featureEvents.handleFeatureClick('load-image');
      }

      // Ctrl+T: 打开终端
      if (e.ctrlKey && e.key === 't') {
        e.preventDefault();
        this.featureEvents.toggleTerminalWindow();
      }

      // F5: 刷新 (默认行为，但可以添加额外逻辑)
      if (e.key === 'F5') {
        // 可以在这里添加清理逻辑
      }

      // Esc: 关闭所有弹窗/菜单
      if (e.key === 'Escape') {
        this.closeAllOverlays();
      }
    });
  }

  /**
   * 绑定窗口事件
   */
  private bindWindowEvents(): void {
    window.addEventListener('resize', () => {
      this.handleWindowResize();
    });

    window.addEventListener('focus', () => {
      // 窗口获得焦点时的逻辑
      document.body.classList.add('window-focused');
    });

    window.addEventListener('blur', () => {
      // 窗口失去焦点时的逻辑
      document.body.classList.remove('window-focused');
    });
  }

  /**
   * 处理窗口大小调整
   */
  private handleWindowResize(): void {
    // 调整布局
    const sidebar = document.querySelector('.sidebar');
    const mainContent = document.querySelector('.main-content');

    if (window.innerWidth < 768) {
      sidebar?.classList.add('collapsed');
      mainContent?.classList.add('expanded');
    }
  }

  /**
   * 绑定主题相关事件
   */
  private bindThemeEvents(): void {
    // 监听系统主题变化
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
      if (localStorage.getItem('theme') === 'system') {
        this.app.setTheme(e.matches ? 'dark' : 'light');
      }
    });
  }

  private async handleToggleWallpaper(): Promise<void> {
    try {
      const settings = wallpaperManager.getSettings();
      await wallpaperManager.setEnabled(!settings.enabled);
      this.updateStatus(!settings.enabled ? '壁纸已开启' : '壁纸已关闭');
    } catch (error) {
      console.error('❌ 切换壁纸失败:', error);
      this.updateStatus('切换壁纸失败');
    }
  }

  private async handleImportWallpaper(): Promise<void> {
    try {
      await wallpaperManager.importFromFilePicker();
      this.updateStatus('壁纸已导入');
    } catch (error) {
      console.error('❌ 导入壁纸失败:', error);
      this.updateStatus('导入壁纸失败');
    }
  }

  private async handleClearWallpaper(): Promise<void> {
    try {
      await wallpaperManager.clear();
      this.updateStatus('壁纸已清除');
    } catch (error) {
      console.error('❌ 清除壁纸失败:', error);
      this.updateStatus('清除壁纸失败');
    }
  }

  private showWallpaperAdvancedDialog(): void {
    const current = wallpaperManager.getSettings();

    const overlay = document.createElement('div');
    overlay.className = 'wallpaper-advanced-overlay';

    const modal = document.createElement('div');
    modal.className = 'wallpaper-advanced-dialog wallpaper-advanced-modal';

    const header = document.createElement('div');
    header.className = 'wallpaper-advanced-header';
    header.innerHTML = `
      <div style="font-weight: 700; font-size: 16px;">壁纸高级调节</div>
    `;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'wallpaper-advanced-close-btn';
    closeBtn.title = '关闭';
    closeBtn.innerHTML = '×';
    header.appendChild(closeBtn);

    const body = document.createElement('div');
    body.className = 'wallpaper-advanced-body';
    body.innerHTML = `
      <div class="wallpaper-advanced-grid">
      <div class="wallpaper-advanced-row" style="align-items:center;">
        <span class="wallpaper-advanced-label">透明度</span>
        <input id="wallpaper-opacity" type="range" min="0" max="0.7" step="0.01" value="${Math.min(0.7, current.opacity)}" style="flex:1;" />
        <span class="wallpaper-advanced-value" id="wallpaper-opacity-text" style="font-family:inherit;">${Math.min(0.7, current.opacity).toFixed(2)}</span>
      </div>
      <div class="wallpaper-advanced-row" style="align-items:center;">
        <span class="wallpaper-advanced-label">清晰优先</span>
        <input id="wallpaper-clarity" type="range" min="0" max="1" step="0.01" value="${(current as any).clarity ?? 0}" style="flex:1;" />
        <span class="wallpaper-advanced-value" id="wallpaper-clarity-text" style="font-family:inherit;">${Number((current as any).clarity ?? 0).toFixed(2)}</span>
      </div>
      <div class="wallpaper-advanced-row" style="align-items:center;">
        <span class="wallpaper-advanced-label">混合</span>
        <select id="wallpaper-blend-mode" style="flex:1; padding: 6px 10px; border-radius: 8px; border: 1px solid var(--border-color, rgba(0,0,0,0.1)); background: var(--bg-secondary, #fff); color: var(--text-primary, #333);">
          <option value="normal" ${(current as any).blend_mode === 'normal' || !(current as any).blend_mode ? 'selected' : ''}>normal</option>
          <option value="multiply" ${(current as any).blend_mode === 'multiply' ? 'selected' : ''}>multiply</option>
          <option value="screen" ${(current as any).blend_mode === 'screen' ? 'selected' : ''}>screen</option>
          <option value="overlay" ${(current as any).blend_mode === 'overlay' ? 'selected' : ''}>overlay</option>
          <option value="soft-light" ${(current as any).blend_mode === 'soft-light' ? 'selected' : ''}>soft-light</option>
          <option value="hard-light" ${(current as any).blend_mode === 'hard-light' ? 'selected' : ''}>hard-light</option>
          <option value="color-dodge" ${(current as any).blend_mode === 'color-dodge' ? 'selected' : ''}>color-dodge</option>
          <option value="color-burn" ${(current as any).blend_mode === 'color-burn' ? 'selected' : ''}>color-burn</option>
          <option value="difference" ${(current as any).blend_mode === 'difference' ? 'selected' : ''}>difference</option>
          <option value="exclusion" ${(current as any).blend_mode === 'exclusion' ? 'selected' : ''}>exclusion</option>
          <option value="luminosity" ${(current as any).blend_mode === 'luminosity' ? 'selected' : ''}>luminosity</option>
        </select>
      </div>
      <div class="wallpaper-advanced-row" style="align-items:center;">
        <span class="wallpaper-advanced-label">模糊(px)</span>
        <input id="wallpaper-blur" type="range" min="0" max="30" step="0.5" value="${current.blur}" style="flex:1;" />
        <span class="wallpaper-advanced-value" id="wallpaper-blur-text" style="font-family:inherit;">${current.blur.toFixed(1)}</span>
      </div>
      <div class="wallpaper-advanced-row" style="align-items:center;">
        <span class="wallpaper-advanced-label">暗化/亮化</span>
        <input id="wallpaper-dim" type="range" min="-1" max="1" step="0.01" value="${current.dim}" style="flex:1;" />
        <span class="wallpaper-advanced-value" id="wallpaper-dim-text" style="font-family:inherit;">${current.dim.toFixed(2)}</span>
      </div>
      <div class="wallpaper-advanced-row" style="align-items:center;">
        <span class="wallpaper-advanced-label">饱和度</span>
        <input id="wallpaper-saturate" type="range" min="0" max="2" step="0.01" value="${current.saturate}" style="flex:1;" />
        <span class="wallpaper-advanced-value" id="wallpaper-saturate-text" style="font-family:inherit;">${current.saturate.toFixed(2)}</span>
      </div>
      <div class="wallpaper-advanced-row" style="align-items:center;">
        <span class="wallpaper-advanced-label">亮度</span>
        <input id="wallpaper-brightness" type="range" min="0" max="2" step="0.01" value="${(current as any).brightness ?? 1}" style="flex:1;" />
        <span class="wallpaper-advanced-value" id="wallpaper-brightness-text" style="font-family:inherit;">${Number((current as any).brightness ?? 1).toFixed(2)}</span>
      </div>
      <div class="wallpaper-advanced-row" style="align-items:center;">
        <span class="wallpaper-advanced-label">对比度</span>
        <input id="wallpaper-contrast" type="range" min="0" max="2" step="0.01" value="${(current as any).contrast ?? 1}" style="flex:1;" />
        <span class="wallpaper-advanced-value" id="wallpaper-contrast-text" style="font-family:inherit;">${Number((current as any).contrast ?? 1).toFixed(2)}</span>
      </div>
      <div class="wallpaper-advanced-row" style="align-items:center;">
        <span class="wallpaper-advanced-label">色相</span>
        <input id="wallpaper-hue" type="range" min="0" max="360" step="1" value="${(current as any).hue_rotate ?? 0}" style="flex:1;" />
        <span class="wallpaper-advanced-value" id="wallpaper-hue-text" style="font-family:inherit;">${Number((current as any).hue_rotate ?? 0).toFixed(0)}°</span>
      </div>
      <div class="wallpaper-advanced-row" style="align-items:center;">
        <span class="wallpaper-advanced-label">灰度</span>
        <input id="wallpaper-grayscale" type="range" min="0" max="1" step="0.01" value="${(current as any).grayscale ?? 0}" style="flex:1;" />
        <span class="wallpaper-advanced-value" id="wallpaper-grayscale-text" style="font-family:inherit;">${Number((current as any).grayscale ?? 0).toFixed(2)}</span>
      </div>
      <div class="wallpaper-advanced-row" style="align-items:center;">
        <span class="wallpaper-advanced-label">复古</span>
        <input id="wallpaper-sepia" type="range" min="0" max="1" step="0.01" value="${(current as any).sepia ?? 0}" style="flex:1;" />
        <span class="wallpaper-advanced-value" id="wallpaper-sepia-text" style="font-family:inherit;">${Number((current as any).sepia ?? 0).toFixed(2)}</span>
      </div>
      <div class="wallpaper-advanced-row" style="align-items:center;">
        <span class="wallpaper-advanced-label">蒙版色</span>
        <input id="wallpaper-tint-color" type="color" value="${(current as any).tint_color ?? '#000000'}" style="flex:1; height: 34px; padding: 0; border: 0; background: transparent;" />
      </div>
      <div class="wallpaper-advanced-row" style="align-items:center;">
        <span class="wallpaper-advanced-label">蒙版强度</span>
        <input id="wallpaper-tint-opacity" type="range" min="0" max="1" step="0.01" value="${(current as any).tint_opacity ?? 0}" style="flex:1;" />
        <span class="wallpaper-advanced-value" id="wallpaper-tint-opacity-text" style="font-family:inherit;">${Number((current as any).tint_opacity ?? 0).toFixed(2)}</span>
      </div>
      <div class="wallpaper-advanced-row" style="align-items:center;">
        <span class="wallpaper-advanced-label">暗角</span>
        <input id="wallpaper-vignette" type="range" min="0" max="1" step="0.01" value="${(current as any).vignette ?? 0}" style="flex:1;" />
        <span class="wallpaper-advanced-value" id="wallpaper-vignette-text" style="font-family:inherit;">${Number((current as any).vignette ?? 0).toFixed(2)}</span>
      </div>
      <div class="wallpaper-advanced-row" style="align-items:center;">
        <span class="wallpaper-advanced-label">缩放</span>
        <input id="wallpaper-zoom" type="range" min="1" max="2" step="0.01" value="${(current as any).zoom ?? 1}" style="flex:1;" />
        <span class="wallpaper-advanced-value" id="wallpaper-zoom-text" style="font-family:inherit;">${Number((current as any).zoom ?? 1).toFixed(2)}</span>
      </div>
      <div class="wallpaper-advanced-row" style="align-items:center;">
        <span class="wallpaper-advanced-label">焦点X</span>
        <input id="wallpaper-pos-x" type="range" min="0" max="100" step="1" value="${(current as any).pos_x ?? 50}" style="flex:1;" />
        <span class="wallpaper-advanced-value" id="wallpaper-pos-x-text" style="font-family:inherit;">${Number((current as any).pos_x ?? 50).toFixed(0)}%</span>
      </div>
      <div class="wallpaper-advanced-row" style="align-items:center;">
        <span class="wallpaper-advanced-label">焦点Y</span>
        <input id="wallpaper-pos-y" type="range" min="0" max="100" step="1" value="${(current as any).pos_y ?? 50}" style="flex:1;" />
        <span class="wallpaper-advanced-value" id="wallpaper-pos-y-text" style="font-family:inherit;">${Number((current as any).pos_y ?? 50).toFixed(0)}%</span>
      </div>
      <div class="wallpaper-advanced-row wallpaper-advanced-span-2" style="align-items:center;">
        <span class="wallpaper-advanced-label">适配</span>
        <select id="wallpaper-fit" style="flex:1; padding: 6px 10px; border-radius: 8px; border: 1px solid var(--border-color, rgba(0,0,0,0.1)); background: var(--bg-secondary, #fff); color: var(--text-primary, #333);">
          <option value="cover" ${current.fit === 'cover' ? 'selected' : ''}>cover(铺满)</option>
          <option value="contain" ${current.fit === 'contain' ? 'selected' : ''}>contain(完整显示)</option>
          <option value="fill" ${current.fit === 'fill' ? 'selected' : ''}>fill(拉伸)</option>
          <option value="scale-down" ${current.fit === 'scale-down' ? 'selected' : ''}>scale-down</option>
          <option value="none" ${current.fit === 'none' ? 'selected' : ''}>none</option>
        </select>
      </div>
      </div>
    `;

    modal.appendChild(header);
    modal.appendChild(body);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => overlay.classList.add('show'));

    const close = () => {
      overlay.classList.remove('show');
      setTimeout(() => overlay.remove(), 300);
    };

    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    const opacityInput = body.querySelector('#wallpaper-opacity') as HTMLInputElement;
    const clarityInput = body.querySelector('#wallpaper-clarity') as HTMLInputElement;
    const blendSelect = body.querySelector('#wallpaper-blend-mode') as HTMLSelectElement;
    const blurInput = body.querySelector('#wallpaper-blur') as HTMLInputElement;
    const dimInput = body.querySelector('#wallpaper-dim') as HTMLInputElement;
    const saturateInput = body.querySelector('#wallpaper-saturate') as HTMLInputElement;
    const brightnessInput = body.querySelector('#wallpaper-brightness') as HTMLInputElement;
    const contrastInput = body.querySelector('#wallpaper-contrast') as HTMLInputElement;
    const hueInput = body.querySelector('#wallpaper-hue') as HTMLInputElement;
    const grayscaleInput = body.querySelector('#wallpaper-grayscale') as HTMLInputElement;
    const sepiaInput = body.querySelector('#wallpaper-sepia') as HTMLInputElement;
    const tintColorInput = body.querySelector('#wallpaper-tint-color') as HTMLInputElement;
    const tintOpacityInput = body.querySelector('#wallpaper-tint-opacity') as HTMLInputElement;
    const vignetteInput = body.querySelector('#wallpaper-vignette') as HTMLInputElement;
    const zoomInput = body.querySelector('#wallpaper-zoom') as HTMLInputElement;
    const posXInput = body.querySelector('#wallpaper-pos-x') as HTMLInputElement;
    const posYInput = body.querySelector('#wallpaper-pos-y') as HTMLInputElement;
    const fitSelect = body.querySelector('#wallpaper-fit') as HTMLSelectElement;

    const opacityText = body.querySelector('#wallpaper-opacity-text') as HTMLElement;
    const clarityText = body.querySelector('#wallpaper-clarity-text') as HTMLElement;
    const blurText = body.querySelector('#wallpaper-blur-text') as HTMLElement;
    const dimText = body.querySelector('#wallpaper-dim-text') as HTMLElement;
    const saturateText = body.querySelector('#wallpaper-saturate-text') as HTMLElement;
    const brightnessText = body.querySelector('#wallpaper-brightness-text') as HTMLElement;
    const contrastText = body.querySelector('#wallpaper-contrast-text') as HTMLElement;
    const hueText = body.querySelector('#wallpaper-hue-text') as HTMLElement;
    const grayscaleText = body.querySelector('#wallpaper-grayscale-text') as HTMLElement;
    const sepiaText = body.querySelector('#wallpaper-sepia-text') as HTMLElement;
    const tintOpacityText = body.querySelector('#wallpaper-tint-opacity-text') as HTMLElement;
    const vignetteText = body.querySelector('#wallpaper-vignette-text') as HTMLElement;
    const zoomText = body.querySelector('#wallpaper-zoom-text') as HTMLElement;
    const posXText = body.querySelector('#wallpaper-pos-x-text') as HTMLElement;
    const posYText = body.querySelector('#wallpaper-pos-y-text') as HTMLElement;

    const bindRange = (input: HTMLInputElement, text: HTMLElement, cb: (v: number) => Promise<void>, digits: number) => {
      input.addEventListener('input', () => {
        const v = Number(input.value);
        text.textContent = v.toFixed(digits);
        cb(v).catch(() => {});
      });
    };

    bindRange(opacityInput, opacityText, (v) => wallpaperManager.setOpacity(v), 2);
    bindRange(clarityInput, clarityText, (v) => wallpaperManager.setClarity(v), 2);
    blendSelect.addEventListener('change', () => {
      wallpaperManager.setBlendMode(blendSelect.value).catch(() => {});
    });
    bindRange(blurInput, blurText, (v) => wallpaperManager.setBlur(v), 1);
    bindRange(dimInput, dimText, (v) => wallpaperManager.setDim(v), 2);
    bindRange(saturateInput, saturateText, (v) => wallpaperManager.setSaturate(v), 2);

    bindRange(brightnessInput, brightnessText, (v) => wallpaperManager.setBrightness(v), 2);
    bindRange(contrastInput, contrastText, (v) => wallpaperManager.setContrast(v), 2);

    hueInput.addEventListener('input', () => {
      const v = Number(hueInput.value);
      hueText.textContent = `${Math.round(v)}°`;
      wallpaperManager.setHueRotate(v).catch(() => {});
    });

    bindRange(grayscaleInput, grayscaleText, (v) => wallpaperManager.setGrayscale(v), 2);
    bindRange(sepiaInput, sepiaText, (v) => wallpaperManager.setSepia(v), 2);

    tintColorInput.addEventListener('input', () => {
      wallpaperManager.setTintColor(tintColorInput.value).catch(() => {});
    });
    bindRange(tintOpacityInput, tintOpacityText, (v) => wallpaperManager.setTintOpacity(v), 2);
    bindRange(vignetteInput, vignetteText, (v) => wallpaperManager.setVignette(v), 2);
    bindRange(zoomInput, zoomText, (v) => wallpaperManager.setZoom(v), 2);

    posXInput.addEventListener('input', () => {
      const v = Number(posXInput.value);
      posXText.textContent = `${Math.round(v)}%`;
      wallpaperManager.setPosX(v).catch(() => {});
    });
    posYInput.addEventListener('input', () => {
      const v = Number(posYInput.value);
      posYText.textContent = `${Math.round(v)}%`;
      wallpaperManager.setPosY(v).catch(() => {});
    });

    fitSelect.addEventListener('change', () => {
      wallpaperManager.setFit(fitSelect.value).catch(() => {});
    });
  }

  /**
   * 关闭所有覆盖层
   */
  private closeAllOverlays(): void {
    // 关闭搜索建议
    const suggestions = document.querySelector('.search-suggestions');
    if (suggestions) {
      suggestions.classList.remove('show');
    }

    // 关闭右键菜单
    const contextMenu = document.querySelector('.custom-context-menu');
    if (contextMenu) {
      contextMenu.remove();
    }

    // 关闭设置菜单
    const settingsMenu = document.querySelector('.settings-menu-dropdown');
    if (settingsMenu) {
      settingsMenu.remove();
    }

    // 关闭模态框
    document.querySelectorAll('.modal.show').forEach(modal => {
      modal.classList.remove('show');
      setTimeout(() => modal.remove(), 300);
    });

    // 关闭下拉菜单
    document.querySelectorAll('.dropdown-menu.show').forEach(menu => {
      menu.classList.remove('show');
    });
  }

  /**
   * 处理区域切换
   */
  private handleAreaSwitch(targetArea: string): void {
    const areaMap: { [key: string]: number } = {
      'memprocfs-v2': 0,  // MemProcFS V2 - 默认进入
      'volatility3-v2': 1,  // Vol3 V2
      'vol3-v2': 1, // Alias
      'volatility2-v2': 2,  // Vol2 V2（内嵌CSV）
      'vol2-v2': 2, // Alias
      'memprocfs': 3,  // MemProcFS 手动执行
      'volatility3': 4,  // Vol3 手动执行
      'vol3': 4, // Alias
      'volatility2': 5,  // Vol2 手动执行
      'tools': 6,  // 小工具
      'vol2-linux': 7,
      'vol3-linux': 8,
      'vol3linux-v2': 9,
      'memnixfs-v2': 10,
      'memnixfs': 11
    };

    const index = areaMap[targetArea.toLowerCase()];
    if (index !== undefined) {


      // 重置当前标签页为功能页，确保显示正确的功能界面
      this.stateManager.updateCurrentTab('function');
      this.stateManager.updateSelectedModule(index);

      // 同步状态到modernUIRenderer
      (window as any).modernUIRenderer?.updateState(this.stateManager.getState());

      this.sidebarEvents.updateSidebarActiveState(index);
      this.updateWorkspaceAndBindSearch().catch(error => {
        console.error('更新主工作区失败:', error);
      });

      // Ensure sidebar is visible if we are switching areas
      // const modernSidebar = document.querySelector('.modern-sidebar') as HTMLElement;
      // if (modernSidebar) {
      //   const state = this.stateManager.getState();
      //   if (state.currentImage) {
      //     modernSidebar.style.display = '';
      //   } else {
      //     modernSidebar.style.display = 'none';
      //   }
      // }
    }
  }

  /**
   * 处理注册表查看器导航点击
   */
  private async handleRegistryViewerNavClick(navItem: HTMLElement): Promise<void> {
    // 更新导航栏激活状态
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    navItem.classList.add('active');

    // 更新状态
    this.stateManager.updateState({ currentTab: 'registry-viewer' });

    // 同步状态到modernUIRenderer
    (window as any).modernUIRenderer?.updateState(this.stateManager.getState());

    // 触发UI更新
    await this.updateWorkspaceAndBindSearch();
  }

  /**
   * 处理事件查看器导航点击
   */
  private async handleEventViewerNavClick(navItem: HTMLElement): Promise<void> {
    // 更新导航栏激活状态
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    navItem.classList.add('active');

    // 更新状态
    this.stateManager.updateState({ currentTab: 'event-viewer' });

    // 同步状态到modernUIRenderer
    (window as any).modernUIRenderer?.updateState(this.stateManager.getState());

    // 触发UI更新
    await this.updateWorkspaceAndBindSearch();
  }

  /**
   * 处理报告编辑器导航点击
   */
  private async handleReportEditorNavClick(navItem: HTMLElement): Promise<void> {
    // 更新导航栏激活状态
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    navItem.classList.add('active');

    // 更新状态
    this.stateManager.updateState({ currentTab: 'report-editor' });

    // 同步状态到modernUIRenderer
    (window as any).modernUIRenderer?.updateState(this.stateManager.getState());

    // 触发UI更新
    await this.updateWorkspaceAndBindSearch();
  }

  /**
   * 处理星图导航点击
   */
  private async handleProcessGalaxyNavClick(navItem: HTMLElement): Promise<void> {
    // 更新导航栏激活状态
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    navItem.classList.add('active');

    // 更新状态
    this.stateManager.updateState({ currentTab: 'process-galaxy' });

    // 同步状态到modernUIRenderer
    (window as any).modernUIRenderer?.updateState(this.stateManager.getState());

    // 触发UI更新
    await this.updateWorkspaceAndBindSearch();
  }

  /**
   * 处理星迹导航点击
   */
  private async handleTimelineGalaxyNavClick(navItem: HTMLElement): Promise<void> {
    // 更新导航栏激活状态
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    navItem.classList.add('active');

    // 更新状态
    this.stateManager.updateState({ currentTab: 'timeline-galaxy' });

    // 同步状态到modernUIRenderer
    (window as any).modernUIRenderer?.updateState(this.stateManager.getState());

    // 触发UI更新
    await this.updateWorkspaceAndBindSearch();
  }

  /**
   * 处理字符串搜索导航点击
   */
  private async handleStringSearchNavClick(navItem: HTMLElement): Promise<void> {
    // 更新导航栏激活状态
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    navItem.classList.add('active');

    // 更新状态
    this.stateManager.updateState({ currentTab: 'string-search' });

    // 同步状态到modernUIRenderer
    (window as any).modernUIRenderer?.updateState(this.stateManager.getState());

    // 触发UI更新
    await this.updateWorkspaceAndBindSearch();
  }

  /**
   * 处理 Super Timeline 导航点击
   */
  private async handleSuperTimelineNavClick(_navItem: HTMLElement): Promise<void> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('open_super_timeline_window');

    } catch (error) {
      console.error('打开 Super Timeline 失败:', error);
    }
  }

  /**
   * 模拟导航点击（用于「更多工具」二级菜单）
   */
  private async simulateNavClick(navTarget: string): Promise<void> {
    // Super Timeline 直接打开新窗口
    if (navTarget === 'super-timeline') {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('open_super_timeline_window');

      } catch (error) {
        console.error('打开 Super Timeline 失败:', error);
      }
      return;
    }

    // 符号表管理 直接打开新窗口
    if (navTarget === 'symbol-manager') {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('open_symbol_manager_window');

      } catch (error) {
        console.error('打开 符号表管理 失败:', error);
      }
      return;
    }

    // 其他项: 更新 tab 状态 + 刷新 workspace
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    // 高亮「更多工具」按钮
    const moreBtn = document.querySelector('.nav-item[data-nav="more-tools"]');
    if (moreBtn) moreBtn.classList.add('active');

    this.stateManager.updateState({ currentTab: navTarget });

    (window as any).modernUIRenderer?.updateState(this.stateManager.getState());
    await this.updateWorkspaceAndBindSearch();
  }
}
