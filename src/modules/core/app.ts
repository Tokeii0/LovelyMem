/**
 * Lovelymem V2 应用程序核心类
 * 核心应用类，提供基础架构和接口定义
 * 注意：主要实现已迁移到 src/main.ts，此文件保留作为核心接口
 */

import { BaseApplication } from '../ui/baseApplication';
import { StateManager } from './stateManager';
import { ModernUIRenderer } from '../ui/modernUIRenderer';
import { WindowManager } from '../ui/window';
import { EventManager } from '../ui/events';
import { FeatureHandlers } from '../FeatureHandlers';

export class LovelymemApp extends BaseApplication {
  private windowManager: WindowManager;
  private eventManager: EventManager;
  private eventsInitialized: boolean = false;
  public featureHandlers!: FeatureHandlers;

  constructor() {
    super(); // 调用基类构造函数

    this.windowManager = new WindowManager();
    this.eventManager = new EventManager(this.stateManager, this.modernUIRenderer, this);
    // 将ModernUIRenderer暴露到全局，供其他模块使用
    (window as any).ModernUIRenderer = ModernUIRenderer;
  }

  async init(): Promise<void> {
    this.loadModernStyles();
    this.stateManager.initializeTheme(); // 初始化主题
    this.render();
    this.bindEvents();
    this.initAnimations();
  }

  render(): void {
    const app = document.getElementById('app');
    if (app) {
      app.innerHTML = `
        <div class="app-layout">
          ${this.modernUIRenderer.renderTitleBar()}
          <div class="main-container">
            ${this.modernUIRenderer.renderModernSidebar()}
            ${this.modernUIRenderer.renderMainWorkspaceSync()}
          </div>
          ${this.modernUIRenderer.renderFloatingActions()}
        </div>
      `;
      
      // 首次渲染时绑定全局事件，每次渲染时更新搜索事件
      if (!this.eventsInitialized) {
        setTimeout(() => {
          this.eventManager.bindModernEvents();
          this.eventsInitialized = true;
        }, 50);
      } else {
        // 每次渲染后重新绑定搜索事件（因为搜索输入框会重新创建）
        setTimeout(() => {
          this.eventManager.bindSearchEvents();
        }, 50);
      }
      
      // 调试信息
      console.log('界面渲染完成');
    }
  }

  private bindEvents(): void {
    // 直接绑定窗口控制事件
    this.windowManager.bindWindowControls();
    this.eventManager.bindModernEvents();
    this.bindKeyboardShortcuts();
  }

  // 注意：具体的功能实现已迁移到 src/main.ts
  // 此处保留接口定义供类型检查使用

  // 实现基类要求的抽象方法
  async loadImageFile(_forceOs?: 'windows' | 'linux'): Promise<void> {
    // 实际实现在 src/main.ts 中
    throw new Error('此方法应在 src/main.ts 的 LovelymemAppRefactored 中实现');
  }

  async unloadImageFile(): Promise<void> {
    // 实际实现在 src/main.ts 中
    throw new Error('此方法应在 src/main.ts 的 LovelymemAppRefactored 中实现');
  }

  async showSettingsDialog(): Promise<void> {
    console.warn('此方法应在 src/main.ts 的 LovelymemAppRefactored 中实现');
  }

  // 委托方法 - 实际实现在 src/main.ts 中
  async openThemeEditor(): Promise<void> {
    await this.windowManager.openThemeEditor();
  }

  updateSidebarActiveState(areaIndex: number): void {
    this.eventManager.updateSidebarActiveState(areaIndex);
  }

  async updateMainWorkspace(): Promise<void> {
    await this.eventManager.updateMainWorkspace();
  }

  // 获取状态管理器，供其他模块使用
  getStateManager(): StateManager {
    return this.stateManager;
  }

  // 获取UI渲染器，供其他模块使用
  getUIRenderer(): ModernUIRenderer {
    return this.modernUIRenderer;
  }
} 