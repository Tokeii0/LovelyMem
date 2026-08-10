/**
 * 事件管理器
 * 处理所有用户界面事件
 * 重构版本：将功能拆分为多个子模块
 */

import { StateManager } from '../core/stateManager';
import { ModernUIRenderer } from './modernUIRenderer';
import { LovelymemApp } from '../core/app';
import { SearchEvents } from './events/searchEvents';
import { SidebarEvents } from './events/sidebarEvents';
import { FeatureEvents } from './events/featureEvents';
import { ContextMenuEvents } from './events/contextMenuEvents';
import { GlobalEvents } from './events/globalEvents';
import { UserEvents } from './events/userEvents';
import { WatermarkEvents } from './events/watermarkEvents';
import { Vol2EventHandler } from './vol2event';
import { navBarDragManager } from './components/NavBarDragManager';

export class EventManager {
  private stateManager: StateManager;
  private modernUIRenderer: ModernUIRenderer;
  private app: LovelymemApp;
  
  // 子模块
  private searchEvents: SearchEvents;
  private sidebarEvents: SidebarEvents;
  private featureEvents: FeatureEvents;
  private contextMenuEvents: ContextMenuEvents;
  private globalEvents: GlobalEvents;
  private userEvents: UserEvents;
  private watermarkEvents: WatermarkEvents;
  
  // 为了兼容性保留对 Vol2EventHandler 的引用
  private vol2EventHandler: Vol2EventHandler;

  constructor(stateManager: StateManager, modernUIRenderer: ModernUIRenderer, app: LovelymemApp) {
    this.stateManager = stateManager;
    this.modernUIRenderer = modernUIRenderer;
    this.app = app;

    // 初始化子模块
    const updateStatus = (text: string) => this.app.updateStatus(text);

    this.searchEvents = new SearchEvents();
    
    this.sidebarEvents = new SidebarEvents(
      stateManager, 
      modernUIRenderer, 
      async () => this.updateMainWorkspace()
    );
    
    this.featureEvents = new FeatureEvents(app, stateManager, updateStatus, modernUIRenderer);
    
    this.contextMenuEvents = new ContextMenuEvents(
      app, 
      stateManager, 
      (feature) => this.featureEvents.triggerFeature(feature)
    );
    
    this.globalEvents = new GlobalEvents(
      app, 
      stateManager, 
      this.searchEvents, 
      this.featureEvents, 
      this.sidebarEvents,
      updateStatus
    );
    
    this.userEvents = new UserEvents(app, stateManager, updateStatus);
    
    this.watermarkEvents = new WatermarkEvents();
    
    // 获取 FeatureEvents 中的 vol2EventHandler 引用，或者新建一个
    // 这里新建一个，因为 FeatureEvents 中的是私有的
    this.vol2EventHandler = new Vol2EventHandler(app);
  }

  /**
   * 绑定现代化事件
   */
  bindModernEvents(): void {
    // 绑定各个子模块的事件
    this.globalEvents.bindGlobalEvents();
    this.searchEvents.bindSearchEvents();
    this.contextMenuEvents.bindContextMenuEvents();
    this.userEvents.bindUserEvents();
    this.watermarkEvents.bindWatermarkEvents();
    this.vol2EventHandler.bindProfileEvents();

    // 恢复侧边栏状态
    this.sidebarEvents.restoreSidebarState();
    this.sidebarEvents.initializeSidebarButtonEffects();
    
    // 绑定侧边栏切换按钮事件（如果 GlobalEvents 没有覆盖到）
    const sidebarToggle = document.querySelector('.sidebar-toggle');
    if (sidebarToggle) {
      sidebarToggle.addEventListener('click', (e) => {
        this.sidebarEvents.handleSidebarToggleWithEffect(e.currentTarget as HTMLElement);
        e.stopPropagation();
      });
    }
  }

  /**
   * 绑定搜索事件（供外部调用，如渲染后）
   */
  bindSearchEvents(): void {
    this.searchEvents.bindSearchEvents();
  }

  /**
   * 绑定配置选择器事件（供外部调用，如渲染后）
   */
  bindConfigSelectEvents(): void {
    this.vol2EventHandler.bindProfileEvents();
  }

  /**
   * 重新应用导航栏顺序（供外部调用，如渲染后）
   */
  reapplyNavBarOrder(): void {
    navBarDragManager.reapplyOrder();
  }

  /**
   * 更新侧边栏激活状态
   */
  updateSidebarActiveState(areaIndex: number): void {
    this.sidebarEvents.updateSidebarActiveState(areaIndex);
  }

  /**
   * 更新主工作区显示
   */
  async updateMainWorkspace(): Promise<void> {
    await this.sidebarEvents.updateMainWorkspace();
    // 工作区更新后重新绑定搜索事件（搜索框会重新创建）
    setTimeout(() => {
      this.searchEvents.bindSearchEvents();
    }, 50);
  }

  /**
   * 触发功能执行（供外部调用）
   */
  triggerFeature(feature: string): void {
    this.featureEvents.triggerFeature(feature);
  }
}
