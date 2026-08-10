/**
 * Lovelymem V2 重构版本主文件
 * 展示新的模块化架构
 */

import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { BaseApplication } from './modules/ui/baseApplication';
import { ModernUIRenderer } from './modules/ui/modernUIRenderer';

// 导入功能模块
import { ImageManager } from './modules/features/image';
import { CSVManager } from './modules/features/csv';
import { TextManager } from './modules/features/text';
import { MemProcFSManager } from './modules/features/memprocfs';
import { EXIFManager } from './modules/features/exif';
import { MemoryFileBrowserManager } from './modules/memory-file-browser/MemoryFileBrowserManager';
import { defaultMemoryFileBrowserConfig } from './modules/memory-file-browser/types';
import { initMountDrive } from './modules/core/mountDrive';
import { FilesInterface } from './modules/ui/filesInterface';
import { TerminalInterface } from './modules/ui/terminalInterface';
import { LogPage } from './modules/ui/components/LogPage';

// 导入工具模块
import { MessageManager } from './modules/utils';
import { SettingsManager } from './modules/settings/manager';
import { EventManager } from './modules/ui/events';
import { ProfileManager } from './modules/utils/profileManager';
import logManager from './utils/logManager';
import { ProcessManager } from './modules/ui/processManager';
import { scriptManagementUI } from './modules/scripts';
import { applyPlatformStyles, adjustMainContainerForPlatform, detectPlatform } from './utils/platformDetection';
import { wallpaperManager } from './modules/ui/wallpaperManager';
import { titleBarCarousel } from './modules/ui/titleBarCarousel';
import { showCloseConfirmDialog } from './modules/ui/closeAnimation';

// 导入新的模块化管理器
import { WindowLifecycle } from './modules/window/windowLifecycle';
import { StartupManager } from './modules/startup/startupManager';
import { ProfileCoordinator } from './modules/profile/profileCoordinator';
import { SettingsOrchestrator } from './modules/settings/settingsOrchestrator';
import { EventCoordinator } from './modules/events/eventCoordinator';
import { Volatility2Executor } from './modules/volatility/volatility2Executor';
import { Volatility3Executor } from './modules/volatility/volatility3Executor';
import { Vol3LinuxExecutor } from './modules/volatility/vol3LinuxExecutor';
import { MemNixFSManager } from './modules/features/memnixfs-linux';
import { formatBytes } from './utils/formatters';
import { FeatureHandlers } from './modules/FeatureHandlers';
import { registerDefaultShortcuts } from './modules/core/keyboardShortcuts';
import { commandPalette, CommandItem } from './modules/ui/commandPalette';

class LovelymemAppRefactored extends BaseApplication {
  private eventsInitialized: boolean = false;
  private volatility2CompletedFiles: Map<string, string> = new Map(); // 存储已完成的功能和对应的文件路径
  private volatility3CompletedFiles: Map<string, string> = new Map(); // 存储已完成的Volatility3功能和对应的文件路径
  private vol3linuxCompletedFiles: Map<string, string> = new Map(); // 存储已完成的Vol3Linux功能和对应的文件路径

  // 功能管理器
  private imageManager: ImageManager;
  private csvManager: CSVManager;
  private textManager: TextManager;
  private memProcFSManager: MemProcFSManager;
  private exifManager: EXIFManager;
  private settingsManager: SettingsManager;
  private memoryFileBrowserManager: MemoryFileBrowserManager;
  public featureHandlers: FeatureHandlers;
  public filesInterface: FilesInterface;
  public terminalInterface: TerminalInterface;
  public logPage: LogPage;
  private eventManager: EventManager;
  private processManager: ProcessManager;
  private backendLogUnlisten: UnlistenFn | null = null;
  private backendLogs: any[] = [];

  // 新的模块化管理器
  private windowLifecycle: WindowLifecycle;
  private startupManager: StartupManager;
  private profileCoordinator: ProfileCoordinator;
  private settingsOrchestrator: SettingsOrchestrator;
  private eventCoordinator: EventCoordinator;
  
  // Volatility 执行器
  private volatility2Executor: Volatility2Executor;
  private volatility3Executor: Volatility3Executor;
  private vol3LinuxExecutor: Vol3LinuxExecutor;
  private memNixFSManager: MemNixFSManager;

  constructor() {
    super(); // 调用基类构造函数
    
    // 初始化功能管理器
    this.imageManager = new ImageManager(this.stateManager);
    this.csvManager = new CSVManager(this.stateManager);
    this.textManager = new TextManager(this.stateManager);
    this.memProcFSManager = new MemProcFSManager(this.stateManager);
    this.exifManager = new EXIFManager(this.stateManager);
    this.settingsManager = new SettingsManager();
    this.memoryFileBrowserManager = new MemoryFileBrowserManager(this.stateManager, defaultMemoryFileBrowserConfig);
    this.filesInterface = new FilesInterface();
    this.terminalInterface = new TerminalInterface();
    this.logPage = new LogPage();
    this.processManager = new ProcessManager();

    // 初始化事件管理器 - 传入this作为app实例
    this.eventManager = new EventManager(this.stateManager, this.modernUIRenderer, this as any);
    
    // 初始化新的模块化管理器
    this.windowLifecycle = new WindowLifecycle();
    this.startupManager = new StartupManager(this.stateManager);
    this.profileCoordinator = new ProfileCoordinator(
      this.stateManager,
      this.modernUIRenderer,
      this.commandWindowManager,
      () => this.render()
    );
    this.settingsOrchestrator = new SettingsOrchestrator();
    this.eventCoordinator = new EventCoordinator(
      this.stateManager,
      this.commandWindowManager,
      this.eventManager
    );
    
    // 初始化 Volatility 执行器
    this.volatility2Executor = new Volatility2Executor(
      this.stateManager,
      this.modernUIRenderer,
      this.commandWindowManager
    );
    this.volatility3Executor = new Volatility3Executor(
      this.stateManager,
      this.modernUIRenderer,
      this.commandWindowManager
    );
    this.vol3LinuxExecutor = new Vol3LinuxExecutor(
      this.stateManager,
      this.modernUIRenderer,
      this.commandWindowManager
    );
    this.memNixFSManager = new MemNixFSManager(this.stateManager);

    // 初始化 FeatureHandlers
    this.featureHandlers = new FeatureHandlers(
      this.csvManager,
      this.textManager,
      this.memoryFileBrowserManager,
      this.exifManager,
      this.memProcFSManager,
      this.volatility2Executor,
      this.volatility3Executor,
      this.vol3LinuxExecutor,
      this.memNixFSManager
    );
    
    // 将ModernUIRenderer暴露到全局，供其他模块使用
    (window as any).ModernUIRenderer = ModernUIRenderer;
    (window as any).modernUIRenderer = this.modernUIRenderer;

    // 将CommandWindowManager暴露到全局，供插件系统使用
    (window as any).commandWindowManager = this.commandWindowManager;

    console.log('✅ 重构版本应用已初始化');
    console.log('📊 功能模块:', {
      imageManager: this.imageManager,
      csvManager: this.csvManager,
      textManager: this.textManager,
      memProcFSManager: this.memProcFSManager,
      settingsManager: this.settingsManager,
      processManager: this.processManager
    });
  }

  /**
   * 设置后端日志监听器（全局级别，在应用启动时就开始收集日志）
   */
  private async setupBackendLogListener(): Promise<void> {
    try {
      this.backendLogUnlisten = await listen('backend-log', (event: any) => {
        const log = event.payload;
        this.backendLogs.push(log);
        if (this.backendLogs.length > 1000) {
          this.backendLogs.shift();
        }
        // 如果 LogPage 已经初始化，直接更新其日志
        if (this.logPage && (this.logPage as any).backendLogs) {
          (this.logPage as any).backendLogs = this.backendLogs;
        }
      });
    } catch (error) {
      console.error('[App] 设置后端日志监听器失败:', error);
    }
  }

  /**
   * 获取收集的后端日志
   */
  public getBackendLogs(): any[] {
    return this.backendLogs;
  }

  async init(): Promise<void> {
    // 初始化日志管理器（优先级最高，确保所有日志都被记录）
    try {
      await logManager.init();
    } catch (error) {
      console.error('❌ 日志管理器初始化失败:', error);
    }

    // 立即设置后端日志监听器（在应用启动时就开始收集日志）
    await this.setupBackendLogListener();

    // 初始化 MemProcFS 挂载盘符缓存（须早于启动自检与各渲染器，供各处同步读取）
    await initMountDrive();

    // 软件启动时强制清除Profile信息
    ProfileManager.clearStoredProfileInfo();
    console.log('🧹 启动时已清除存储的Profile信息');

    this.loadModernStyles();
    await this.stateManager.initializeTheme();

    await wallpaperManager.init();

    // 应用平台特定的样式
    applyPlatformStyles();
    
    // 首先显示启动画面（使用新的StartupManager）
    await this.startupManager.render();

    // 启动自检：Dokan 环境 + 挂载盘/残留 MemProcFS 进程（使用WindowLifecycle）
    await this.windowLifecycle.runStartupSelfCheck();

    // 验证应用设置（使用SettingsOrchestrator）
    await this.settingsOrchestrator.validateOnStartup(
      (msg, progress) => this.startupManager.updateProgress(msg, progress)
    );

    // 添加启动屏幕淡出效果（使用StartupManager）
    await this.startupManager.fadeOut();
    
    // 请求通知权限
    await this.requestNotificationPermission();
    
    this.render();
    this.bindEvents();
    this.initAnimations();

    // 调整主容器以适应平台特定的标题栏
    adjustMainContainerForPlatform();

    // 初始化内存文件浏览器
    await this.memoryFileBrowserManager.init();
    await this.profileCoordinator.initialize();
    await this.eventCoordinator.listenForCommandEvents();
    await this.eventCoordinator.listenForCSVPluginEvents();
    await this.eventCoordinator.bindAITriggerEvents();
    await this.eventCoordinator.listenForDragDropEvents();
    await this.windowLifecycle.setupCloseConfirmation();

    // 加载日志调试工具（动态导入，挂载 window.debugLog 调试 API）
    import('./utils/debugLog').catch((error) => {
      console.error('❌ 加载日志调试工具失败:', error);
    });

    // 延迟自动检测版本更新，确保界面完全初始化
    setTimeout(() => {
      this.autoCheckVersion();
    }, 200);

    // 延迟静默校验 MemProcFS 组件（vmm.dll / memprocfs.exe）与云端清单
    setTimeout(() => {
      this.autoCheckMemProcFsComponents();
    }, 800);

    // 在生产环境中禁用开发者工具
    this.disableDevToolsInProduction();
  }
  
  /**
   * 加载内联样式文件
   */
  protected loadInlineStyles(): void {
    if (document.getElementById('inline-styles')) {
      return;
    }

    const link = document.createElement('link');
    link.id = 'inline-styles';
    link.rel = 'stylesheet';
    link.href = 'src/css/inline-styles.css';
    document.head.appendChild(link);

    // 加载命令面板样式
    const cpLink = document.createElement('link');
    cpLink.id = 'command-palette-styles';
    cpLink.rel = 'stylesheet';
    cpLink.href = 'src/css/commandPalette.css';
    document.head.appendChild(cpLink);

    // 加载面包屑导航样式
    const bcLink = document.createElement('link');
    bcLink.id = 'breadcrumb-styles';
    bcLink.rel = 'stylesheet';
    bcLink.href = 'src/css/breadcrumb.css';
    document.head.appendChild(bcLink);

    // 加载仪表盘样式
    const dbLink = document.createElement('link');
    dbLink.id = 'dashboard-styles';
    dbLink.rel = 'stylesheet';
    dbLink.href = 'src/css/dashboard.css';
    document.head.appendChild(dbLink);

    // 加载标注系统样式
    const anLink = document.createElement('link');
    anLink.id = 'annotations-styles';
    anLink.rel = 'stylesheet';
    anLink.href = 'src/css/annotations.css';
    document.head.appendChild(anLink);

    // 加载通知中心样式
    const ntLink = document.createElement('link');
    ntLink.id = 'notification-styles';
    ntLink.rel = 'stylesheet';
    ntLink.href = 'src/css/notification.css';
    document.head.appendChild(ntLink);

    // 加载平台特定样式
    this.loadPlatformStyles();
  }

  /**
   * 加载平台特定样式文件
   */
  protected loadPlatformStyles(): void {
    if (document.getElementById('platform-styles')) {
      return;
    }

    const link = document.createElement('link');
    link.id = 'platform-styles';
    link.rel = 'stylesheet';
    link.href = 'src/css/platform-styles.css';
    document.head.appendChild(link);
  }

  render(): void {
    const app = document.getElementById('app');
    if (app) {
      app.innerHTML = `
        <div class="app-layout">
          ${this.modernUIRenderer.renderTitleBar()}
          <div class="main-container">
            ${this.modernUIRenderer.renderVerticalNavBar()}
            ${this.modernUIRenderer.renderModernSidebar()}
            ${this.modernUIRenderer.renderMainWorkspaceSync()}
          </div>
          ${this.modernUIRenderer.renderFloatingActions()}
          ${this.modernUIRenderer.renderProgressIndicator()}
          <div id="script-management-area"></div>
          ${this.modernUIRenderer.renderStatusBar()}
        </div>
      `;
      
      // 恢复导航栏展开/收起状态
      if (localStorage.getItem('navbar-expanded') === '1') {
        document.querySelector('.vertical-navbar')?.classList.add('expanded');
      }

      // 加载内联样式文件（如果还没有加载）
      this.loadInlineStyles();

      // 注入版本号到状态栏等所有 .app-version-text 元素
      import('./modules/core/appVersion').then(m => m.injectAppVersion());
      
      // 首次渲染时绑定全局事件，每次渲染时更新搜索事件
      if (!this.eventsInitialized) {
        setTimeout(() => {
          this.eventManager.bindModernEvents();
          this.eventsInitialized = true;
          // 首次渲染后检查是否需要应用存储的Profile信息
          ProfileManager.checkAndApplyProfileInfo();
          // 初始化脚本管理UI
          this.initializeScriptManagement();
          // 【修复】首次渲染后绑定窗口控制按钮事件
          this.bindMainWindowControls();
          // 初始化标题栏文本循环播放
          titleBarCarousel.init();
        }, 50);
      } else {
        // 每次渲染后重新绑定搜索事件和配置选择器事件（因为这些元素会重新创建）
        setTimeout(() => {
          this.eventManager.bindSearchEvents();
          this.eventManager.bindConfigSelectEvents();
          // 重新应用导航栏顺序
          this.eventManager.reapplyNavBarOrder();
          // 绑定镜像信息点击事件
          this.modernUIRenderer.bindImageInfoClickEvent();
          // 每次渲染后都检查Profile信息（可能用户切换了区域）
          ProfileManager.checkAndApplyProfileInfo();
          // 恢复已完成功能的状态
          this.restoreVolatility2CompletedStates();
          this.restoreVolatility3CompletedStates();
          this.restoreVol3LinuxCompletedStates();
          // 【修复】每次重新渲染后都重新绑定窗口控制按钮事件（最高优先级）
          this.bindMainWindowControls();
          // 重新初始化标题栏文本循环播放
          titleBarCarousel.init();
        }, 50);
      }
    }
  }

  /**
   * 初始化脚本管理界面
   */
  private async initializeScriptManagement(): Promise<void> {
    try {
      const scriptManagementArea = document.getElementById('script-management-area');
      if (scriptManagementArea) {
        await scriptManagementUI.initialize(scriptManagementArea);
        //console.log('✅ 脚本管理界面已初始化');
      } else {
        console.warn('⚠️ 未找到脚本管理区域容器');
      }
    } catch (error) {
      console.error('❌ 初始化脚本管理界面失败:', error);
    }
  }

  private bindEvents(): void {
    // 使用EventManager处理所有事件
    this.bindMainWindowControls(); // 使用主窗口专用的控制方法
    this.bindKeyboardShortcuts();
    // AI触发功能事件已在init方法中绑定，不需要重复绑定

    // 初始化全局快捷键和命令面板
    this.initShortcutsAndCommandPalette();

  }

  /**
   * 初始化全局快捷键和命令面板
   */
  private initShortcutsAndCommandPalette(): void {
    const navActions: Array<{ nav: string; label: string }> = [
      { nav: 'home', label: '主页' },
      { nav: 'files', label: '文件' },
      { nav: 'process-galaxy', label: '星图' },
      { nav: 'timeline-galaxy', label: '星迹' },
      { nav: 'terminal', label: '终端' },
      { nav: 'ai-chat', label: 'AI助手' },
      { nav: 'warnings', label: '告警' },
      { nav: 'registry-viewer', label: '注册表' },
    ];

    const switchNavByIndex = (index: number) => {
      if (index >= 0 && index < navActions.length) {
        const navType = navActions[index].nav;
        const navItem = document.querySelector(`.nav-item[data-nav="${navType}"]`) as HTMLElement;
        if (navItem) {
          navItem.click();
        }
      }
    };

    // 注册全局快捷键
    registerDefaultShortcuts({
      openCommandPalette: () => commandPalette.toggle(),
      loadImage: () => this.loadImageFile(),
      openSettings: () => this.settingsManager.showSettingsDialog(),
      toggleTheme: () => this.toggleTheme(),
      closeActiveDialog: () => {
        // 先尝试关闭命令面板
        if (commandPalette.isVisible()) {
          commandPalette.close();
          return;
        }
        // 再关闭设置弹窗
        const dialog = document.querySelector('.settings-dialog');
        const overlay = document.querySelector('.settings-overlay');
        if (dialog) dialog.remove();
        if (overlay) overlay.remove();
        // 关闭自定义弹窗
        const customOverlay = document.querySelector('.custom-dialog-overlay');
        if (customOverlay) customOverlay.remove();
      },
      focusSearch: () => {
        const searchInput = document.getElementById('workspace-search') as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      },
      switchNav: switchNavByIndex,
    });

    // 注册命令面板命令
    const commands: CommandItem[] = navActions.map(nav => ({
      id: `nav-${nav.nav}`,
      label: `导航到: ${nav.label}`,
      category: 'navigation',
      categoryLabel: '导航',
      handler: () => {
        const navItem = document.querySelector(`.nav-item[data-nav="${nav.nav}"]`) as HTMLElement;
        if (navItem) navItem.click();
      },
    }));

    // 添加额外命令
    commands.push(
      {
        id: 'load-image',
        label: '加载内存镜像',
        category: 'general',
        categoryLabel: '通用',
        shortcut: 'Ctrl+O',
        handler: () => this.loadImageFile(),
      },
      {
        id: 'open-settings',
        label: '打开应用设置',
        category: 'settings',
        categoryLabel: '设置',
        shortcut: 'Ctrl+,',
        handler: () => this.settingsManager.showSettingsDialog(),
      },
      {
        id: 'toggle-theme',
        label: '切换主题',
        category: 'general',
        categoryLabel: '通用',
        shortcut: 'Ctrl+T',
        handler: () => this.toggleTheme(),
      },
      {
        id: 'string-search',
        label: '导航到: 字符串搜索',
        category: 'navigation',
        categoryLabel: '导航',
        handler: () => {
          const navItem = document.querySelector('.nav-item[data-nav="string-search"]') as HTMLElement;
          if (navItem) navItem.click();
        },
      },
      {
        id: 'event-viewer',
        label: '导航到: 事件查看器',
        category: 'navigation',
        categoryLabel: '导航',
        handler: () => {
          const navItem = document.querySelector('.nav-item[data-nav="event-viewer"]') as HTMLElement;
          if (navItem) navItem.click();
        },
      },
      {
        id: 'report-editor',
        label: '导航到: 报告编辑器',
        category: 'navigation',
        categoryLabel: '导航',
        handler: () => {
          const navItem = document.querySelector('.nav-item[data-nav="report-editor"]') as HTMLElement;
          if (navItem) navItem.click();
        },
      },
      {
        id: 'logs',
        label: '导航到: 日志',
        category: 'navigation',
        categoryLabel: '导航',
        handler: () => {
          const navItem = document.querySelector('.nav-item[data-nav="logs"]') as HTMLElement;
          if (navItem) navItem.click();
        },
      },
    );

    commandPalette.registerCommands(commands);
  }

  /**
   * 绑定主窗口控制按钮事件（重写基类方法，添加进程清理）
   * 【修复】确保每次渲染后都重新绑定，并设置最高优先级
   */
  private bindMainWindowControls(): void {
    console.log('🔧 正在绑定主窗口控制按钮事件...');

    const minimizeBtn = document.getElementById('minimize-btn');
    const maximizeBtn = document.getElementById('maximize-btn');
    const closeBtn = document.getElementById('close-btn');

    if (!minimizeBtn || !maximizeBtn || !closeBtn) {
      console.warn('⚠️ 窗口控制按钮元素未找到，可能DOM还未完全加载');
      return;
    }

    // 【修复】先移除可能存在的旧事件监听器，避免重复绑定
    const newMinimizeBtn = minimizeBtn.cloneNode(true) as HTMLElement;
    const newMaximizeBtn = maximizeBtn.cloneNode(true) as HTMLElement;
    const newCloseBtn = closeBtn.cloneNode(true) as HTMLElement;

    minimizeBtn.parentNode?.replaceChild(newMinimizeBtn, minimizeBtn);
    maximizeBtn.parentNode?.replaceChild(newMaximizeBtn, maximizeBtn);
    closeBtn.parentNode?.replaceChild(newCloseBtn, closeBtn);

    // 【修复】为新元素绑定事件，确保最高优先级
    newMinimizeBtn.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      console.log('🔽 最小化按钮被点击');
      try {
        if (typeof window !== 'undefined' && (window as any).__TAURI__) {
          const { getCurrentWindow } = await import('@tauri-apps/api/window');
          const appWindow = getCurrentWindow();
          await appWindow.minimize();
          console.log('✅ 窗口已最小化');
        }
      } catch (error) {
        console.error('❌ 最小化窗口失败:', error);
      }
    }, { capture: true }); // 使用捕获阶段，确保最高优先级

    newMaximizeBtn.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      console.log('🔲 最大化按钮被点击');
      try {
        if (typeof window !== 'undefined' && (window as any).__TAURI__) {
          const { getCurrentWindow } = await import('@tauri-apps/api/window');
          const appWindow = getCurrentWindow();
          const isMaximized = await appWindow.isMaximized();
          if (isMaximized) {
            await appWindow.unmaximize();
            console.log('✅ 窗口已还原');
          } else {
            await appWindow.maximize();
            console.log('✅ 窗口已最大化');
          }
        }
      } catch (error) {
        console.error('❌ 切换窗口最大化状态失败:', error);
      }
    }, { capture: true }); // 使用捕获阶段，确保最高优先级

    // 关闭按钮 - 显示确认对话框后退出
    newCloseBtn.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      console.log('🚪 关闭按钮被点击');
      try {
        if (typeof window !== 'undefined' && (window as any).__TAURI__) {
          // 显示确认对话框
          const confirmed = await showCloseConfirmDialog();
          if (!confirmed) {
            console.log('❌ 用户取消关闭');
            return;
          }
          console.log('✅ 用户确认关闭，执行清理并退出');
          // 调用后端退出（后端会 kill 进程、清空 output_path、退出）
          await invoke('exit_application');
        }
      } catch (error) {
        console.error('❌ 关闭失败:', error);
      }
    }, { capture: true });

    console.log('✅ 主窗口控制按钮事件绑定完成');
  }



  /**
   * 禁用Volatility2区域
   */
  private disableVolatility2Area(reason: string, message: string): void {
    console.log(`🚫 禁用Volatility2区域: ${reason} - ${message}`);

    // 设置Volatility2区域为禁用状态
    this.stateManager.setVolatility2Disabled(true, message);

    // 如果当前在Volatility2区域（索引2），切换到MemProcFS V2区域
    if (this.stateManager.getSelectedAvatar() === 2) {
      this.stateManager.setSelectedAvatar(0);
    }

    // 只更新侧边栏禁用状态，不做全量重渲染（避免破坏 V2 工作区布局）
    this.modernUIRenderer.updateState(this.stateManager.getState());
    this.updateSidebarDisabledState(2, true);
  }

  /**
   * 重新启用Volatility2区域
   */
  private enableVolatility2Area(profileData: any): void {
    console.log(`✅ 重新启用Volatility2区域:`, profileData);

    // 设置Volatility2区域为启用状态
    this.stateManager.setVolatility2Disabled(false);

    // 存储Profile信息到localStorage，供Profile管理器使用，包含 timestamp
    if (profileData.profile_list && profileData.profile_list.length > 0) {
      const profileInfo = {
        detected_os: profileData.detected_os,
        suggested_profile: profileData.suggested_profile,
        profile_list: profileData.profile_list,
        timestamp: Date.now()
      };
      localStorage.setItem('detected_profile_info', JSON.stringify(profileInfo));
      console.log('📂 Profile信息已存储到localStorage');

      // 立即尝试应用到 vol2-profile 下拉框
      this.applyProfileToSelect(profileData.profile_list, profileData.suggested_profile);
    }

    // 只更新侧边栏启用状态，不做全量重渲染（避免破坏 V2 工作区布局）
    this.modernUIRenderer.updateState(this.stateManager.getState());
    this.updateSidebarDisabledState(2, false);

    // 延迟尝试应用 Profile 到下拉框
    setTimeout(() => {
      if (profileData.profile_list && profileData.profile_list.length > 0) {
        this.applyProfileToSelect(profileData.profile_list, profileData.suggested_profile);
      }
    }, 100);
  }

  /**
   * 应用 Profile 到 vol2-profile 下拉框
   */
  private applyProfileToSelect(profileList: string[], suggestedProfile?: string): void {
    const selectElement = document.getElementById('vol2-profile') as HTMLSelectElement;
    if (!selectElement) {
      console.log('🔍 vol2-profile 下拉框不存在，用户可能不在 Volatility2 区域');
      return;
    }

    console.log('✅ 找到 vol2-profile 下拉框，应用 Profile 列表:', profileList);

    // 清空现有选项
    selectElement.innerHTML = '';

    // 添加新的 profile 选项
    profileList.forEach((profile, index) => {
      const option = document.createElement('option');
      option.value = profile;
      option.textContent = profile;

      // 如果是建议的 profile，设为选中状态
      if (suggestedProfile && profile === suggestedProfile) {
        option.selected = true;
      } else if (!suggestedProfile && index === 0) {
        option.selected = true;
      }

      selectElement.appendChild(option);
    });

    console.log('✅ Profile 选项已应用到下拉框，选中:', suggestedProfile || profileList[0]);
  }

  /**
   * 更新侧边栏中指定区域的禁用状态（仅 DOM 操作，不做全量重渲染）
   */
  private updateSidebarDisabledState(areaIndex: number, disabled: boolean): void {
    const areaSections = document.querySelectorAll('.area-section');
    const targetSection = areaSections[areaIndex] as HTMLElement;
    if (targetSection) {
      targetSection.setAttribute('data-disabled', disabled.toString());
      if (disabled) {
        targetSection.classList.add('disabled');
        targetSection.style.opacity = '0.5';
        targetSection.style.pointerEvents = 'none';
      } else {
        targetSection.classList.remove('disabled');
        targetSection.style.opacity = '';
        targetSection.style.pointerEvents = '';
      }
    }
  }

  /**
   * 恢复重新检测按钮状态
   */
  private restoreRetryProfileButton(): void {
    const retryBtn = document.querySelector('.retry-profile-btn') as HTMLButtonElement;
    if (retryBtn) {
      retryBtn.disabled = false;
      retryBtn.textContent = '🔄 重新检测 Profile';
    }
  }

  /**
   * 处理实时输出事件
   */
  private handleRealtimeOutput(commandData: any): void {
    // 使用累积输出方法，将多行输出合并到同一个容器中
    if (commandData.output) {
      this.commandWindowManager.appendRealtimeOutput('output', commandData.output, commandData.time);
    }
    if (commandData.error) {
      this.commandWindowManager.appendRealtimeOutput('error', commandData.error, commandData.time);
    }
  }

  /**
   * 监听CSV插件命令事件
   */
  private async listenForCSVPluginEvents(): Promise<void> {
    try {
      const { listen } = await import('@tauri-apps/api/event');

      // 监听来自主窗口的CSV插件事件
      await listen('csv-plugin-main-window', (event: any) => {
        console.log('📥 收到CSV插件主窗口事件:', event.payload);

        const commandData = event.payload;

        // 添加到命令历史
        this.stateManager.addCommandHistory({
          id: commandData.id,
          name: commandData.name,
          command: commandData.command,
          status: commandData.status,
          time: commandData.time,
          output: commandData.output,
          error: commandData.error
        });

        // 更新控制台显示
        this.commandWindowManager.updateCommandWindowDisplay();

        console.log('✅ CSV插件命令已添加到历史记录');
      });

      //console.log('🎧 CSV插件事件监听器已启动');
    } catch (error) {
      console.error('❌ 启动CSV插件事件监听器失败:', error);
    }
  }

  /**
   * 绑定AI触发功能事件
   */
  private async bindAITriggerEvents(): Promise<void> {
    try {
      const { listen } = await import('@tauri-apps/api/event');

      await listen('trigger-feature', (event: any) => {
        //console.log('🤖 收到AI触发功能事件:', event.payload);

        const { feature } = event.payload;

        // 根据功能类型调用相应的处理方法
        //console.log(`🚀 AI触发功能: ${feature}`);
        this.eventManager.triggerFeature(feature);

        // 显示提示信息
        this.stateManager.addCommandOutput(`🤖 AI智能助手触发了功能: ${feature}`);
        this.commandWindowManager.updateCommandWindowDisplay();
      });

      //console.log('🎧 AI触发功能事件监听器已启动');
    } catch (error) {
      console.error('❌ 启动AI触发功能事件监听器失败:', error);
    }
  }

  private async listenForCommandEvents(): Promise<void> {
    try {
      const { listen } = await import('@tauri-apps/api/event');

      await listen('command-event', (event) => {
        console.log('收到命令事件:', event.payload);

        const commandData = event.payload as any;

        // 处理实时输出事件
        if (commandData.name === "MemProcFS 输出" || commandData.name === "MemProcFS 错误输出") {
          this.handleRealtimeOutput(commandData);
        } else if (commandData.name === "MemProcFS 加载完成") {
          // 特殊处理加载完成事件：添加到历史记录，并更新镜像状态为“已加载”
          this.stateManager.addCommandHistory({
            id: commandData.id,
            name: commandData.name,
            command: commandData.command,
            status: commandData.status,
            time: commandData.time,
            output: commandData.output,
            error: commandData.error
          });

          // 更新镜像状态为加载完成（以 Forensic 完成为准）
          console.log('✅ 检测到 MemProcFS 加载完成，更新镜像状态为已加载');
          this.modernUIRenderer.updateImageLoadingStatus('completed', commandData.output || 'MemProcFS 已完成内存镜像加载和分析');

          // 使用新的统一接口添加系统消息
          this.commandWindowManager.addCommandRecord({
            name: 'MemProcFS 加载完成',
            command: 'MemProcFS initialization completed',
            timestamp: commandData.time,
            type: 'system'
          });
        } else if (commandData.name === "Profile检测") {
          // 特殊处理Profile检测事件：添加到历史记录并同步到控制台监控
          this.stateManager.addCommandHistory({
            id: commandData.id,
            name: commandData.name,
            command: commandData.command,
            status: commandData.status,
            time: commandData.time,
            output: commandData.output,
            error: commandData.error
          });

          // 处理Profile相关逻辑
          this.handleProfileEvents(commandData);

          // 使用新的统一接口添加Profile检测记录到控制台监控
          this.commandWindowManager.addCommandRecord({
            id: commandData.id?.toString(),
            name: commandData.name,
            command: commandData.command || 'Profile detection process',
            timestamp: commandData.time,
            output: commandData.output,
            error: commandData.error,
            type: 'command'
          });

          console.log(`Profile检测事件已添加到控制台监控: ${commandData.status}`);
        } else if (commandData.name === "Windows 10 版本检测") {
          // 特殊处理Windows 10版本检测事件：只记录日志与历史，不改变镜像加载状态
          this.stateManager.addCommandHistory({
            id: commandData.id,
            name: commandData.name,
            command: commandData.command,
            status: commandData.status,
            time: commandData.time,
            output: commandData.output,
            error: commandData.error
          });

          // 不在此处触发已加载状态，等待真正的加载完成事件（如：MemProcFS 加载完成 / Forensic mode completed）
          console.log('⏭️ 跳过在“Windows 10 版本检测”阶段更新镜像状态');

          // 使用新的统一接口添加到控制台监控
          this.commandWindowManager.addCommandRecord({
            id: commandData.id?.toString(),
            name: commandData.name,
            command: commandData.command || 'Windows 10 version detection',
            timestamp: commandData.time,
            output: commandData.output,
            error: commandData.error,
            type: 'command'
          });

          console.log(`Windows 10 版本检测事件已处理: ${commandData.status}`);
        } else {
          // 添加到命令历史（其他非实时输出事件）
          this.stateManager.addCommandHistory({
            id: commandData.id,
            name: commandData.name,
            command: commandData.command,
            status: commandData.status,
            time: commandData.time,
            output: commandData.output,
            error: commandData.error
          });

          // 使用新的统一接口添加命令记录
          console.log('命令事件，添加到控制台记录');
          this.commandWindowManager.addCommandRecord({
            id: commandData.id?.toString(),
            name: commandData.name || 'Unknown Command',
            command: commandData.command || '',
            timestamp: commandData.time,
            output: commandData.output,
            error: commandData.error,
            type: 'command'
          });
        }

        //console.log('命令事件已处理:', commandData);
      });

      console.log('命令事件监听器已设置');
    } catch (error) {
      console.error('设置命令事件监听器失败:', error);
    }
  }

  /**
   * 处理 Profile 相关事件
   */
  private handleProfileEvents(commandData: any): void {
    if (commandData.name === 'Profile检测') {
      if (commandData.status === 'running') {
        // 显示"正在获取Profile"状态，并更新config-select默认值
        this.updateConfigSelectToWaiting();
        this.updateStatus('正在执行imageinfo命令获取profile...');
      } else if (commandData.status === 'completed') {
        // Profile检测完成，解析并存储Profile信息
        this.handleProfileDetectionComplete(commandData);
      } else if (commandData.status === 'error') {
        // Profile检测失败
        this.updateConfigSelectStatus('Profile检测失败');
        this.updateStatus('Profile检测失败');
      }
    }
  }

  /**
   * 更新 config-select 为等待状态
   */
  private updateConfigSelectToWaiting(): void {
    // 查找 vol2-profile 下拉框
    const vol2ProfileSelect = document.getElementById('vol2-profile') as HTMLSelectElement;
    if (vol2ProfileSelect) {
      // 清空现有选项，添加"请稍等"选项
      vol2ProfileSelect.innerHTML = '';
      const waitingOption = document.createElement('option');
      waitingOption.value = 'waiting';
      waitingOption.textContent = '请稍等';
      waitingOption.selected = true;
      waitingOption.disabled = true; // 禁用选择
      vol2ProfileSelect.appendChild(waitingOption);
      console.log('✅ 已将vol2-profile设置为等待状态');
    }
  }

  /**
   * 更新 config-select 区域状态
   */
  private updateConfigSelectStatus(status: string): void {
    // 查找 config-select 区域
    const configSelectArea = document.querySelector('.config-select-area');
    if (configSelectArea) {
      // 创建或更新状态显示
      let statusElement = configSelectArea.querySelector('.profile-status') as HTMLElement;
      if (!statusElement) {
        statusElement = document.createElement('div');
        statusElement.className = 'profile-status';
        statusElement.style.cssText = 'padding: 8px; background: #f0f8ff; border: 1px solid #4a90e2; border-radius: 4px; margin: 4px 0; font-size: 12px; color: #4a90e2;';
        configSelectArea.appendChild(statusElement);
      }
      statusElement.textContent = status;
      console.log('✅ 已更新config-select状态:', status);
    } else {
      console.log('⚠️ 未找到config-select区域');
    }
  }

  /**
   * 处理Profile检测完成事件
   */
  private handleProfileDetectionComplete(commandData: any): void {
    try {
      // 解析Profile信息
      const output = commandData.output || '';

      if (output.includes('检测到Profile:')) {
        // 解析Profile列表
        const profileMatch = output.match(/检测到Profile: \[(.*?)\]/);
        const suggestedMatch = output.match(/建议使用: (.+)/);

        if (profileMatch) {
          const profileListStr = profileMatch[1];
          const profileList = profileListStr.split(',').map((p: string) => p.trim().replace(/"/g, ''));
          const suggestedProfile = suggestedMatch ? suggestedMatch[1].trim() : profileList[0];

          // 存储Profile信息
          this.storeProfileInfo(profileList, suggestedProfile);

          // 自动保存建议的Profile到设置文件
          this.saveDetectedProfileToSettings(suggestedProfile);

          // 更新状态
          this.updateConfigSelectStatus(`检测到 ${profileList.length} 个Profile，建议: ${suggestedProfile}`);

          // 使用 updateStatus 提示完成
          this.updateStatus(`Profile已获取完毕，检测到 ${profileList.length} 个Profile，建议使用: ${suggestedProfile}`);

          // 如果当前在Volatility2区域，立即应用
          this.applyProfileInfoIfInVol2Area(profileList, suggestedProfile);
        }
      } else {
        // 未检测到有效Profile
        this.updateConfigSelectStatus('未检测到有效Profile');
        this.updateStatus('Profile检测完成，但未检测到有效Profile');

        // 恢复默认的Profile选项
        this.restoreDefaultProfileOptions();
      }
    } catch (error) {
      console.error('❌ 处理Profile检测完成事件失败:', error);
      this.updateConfigSelectStatus('Profile解析失败');
    }
  }

  /**
   * 存储Profile信息
   */
  private storeProfileInfo(profileList: string[], suggestedProfile: string): void {
    try {
      const profileData = {
        profile_list: profileList,
        suggested_profile: suggestedProfile,
        timestamp: Date.now()
      };

      localStorage.setItem('detected_profile_info', JSON.stringify(profileData));
    } catch (error) {
      console.error('❌ 存储Profile信息失败:', error);
    }
  }

  /**
   * 自动保存检测到的Profile到设置文件
   */
  private async saveDetectedProfileToSettings(suggestedProfile: string): Promise<void> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('save_volatility2_profile', { profile: suggestedProfile });
    } catch (error) {
      console.error('保存Profile到设置失败:', error);
    }
  }

  /**
   * 恢复默认的Profile选项
   */
  private restoreDefaultProfileOptions(): void {
    const vol2ProfileSelect = document.getElementById('vol2-profile') as HTMLSelectElement;
    if (vol2ProfileSelect) {
      // 清空现有选项
      vol2ProfileSelect.innerHTML = '';

      // 添加默认的Profile选项
      const defaultProfiles = [
        'Win7SP1x64',
        'Win7SP0x64',
        'Win10x64',
        'Win8SP0x64',
        'WinXPSP2x86',
        'WinXPSP3x86'
      ];

      defaultProfiles.forEach((profile, index) => {
        const option = document.createElement('option');
        option.value = profile;
        option.textContent = profile;

        // 默认选中第一个
        if (index === 0) {
          option.selected = true;
        }

        vol2ProfileSelect.appendChild(option);
      });
    }
  }

  /**
   * 如果当前在Volatility2区域，立即应用Profile信息
   */
  private applyProfileInfoIfInVol2Area(profileList: string[], suggestedProfile: string): void {
    const vol2ProfileSelect = document.getElementById('vol2-profile') as HTMLSelectElement;
    if (vol2ProfileSelect) {
      // 清空现有选项
      vol2ProfileSelect.innerHTML = '';

      // 添加新的profile选项
      profileList.forEach((profile) => {
        const option = document.createElement('option');
        option.value = profile;
        option.textContent = profile;

        // 如果是建议的profile，设为选中状态
        if (profile === suggestedProfile) {
          option.selected = true;
        }

        vol2ProfileSelect.appendChild(option);
      });
    }
  }

  /**
   * 处理 Windows 10 Profile 检测事件
   */
  private async handleWindows10ProfileDetected(profileData: any): Promise<void> {
    console.log('🔍 处理Windows 10 Profile检测事件:', profileData);

    const { profile, vol2_disabled, reason } = profileData;

    // 显示检测信息
    this.stateManager.addCommandOutput(`🔍 检测到 Windows 10 Profile: ${profile}`);
    this.stateManager.addCommandOutput(`📋 ${reason}`);
    this.commandWindowManager.updateCommandWindowDisplay();

    // 不在此阶段更改镜像加载状态；仅输出提示
    console.log('⏭️ 跳过在 Windows 10 Profile 检测阶段更新镜像状态');

    // 如果版本过高，禁用 Volatility2 区域
    if (vol2_disabled) {
      this.disableVolatility2Area('windows_10_version_too_high', `Windows 10 版本过高 (${profile}), Volatility2功能不可用`);
    } else {
      // 版本支持，应用 profile 到选择框
      await this.applyWindows10ProfileToUI(profile);
    }
  }

  /**
   * 处理 Windows 10 Profile 准备就绪事件
   */
  private async handleWindows10ProfileReady(profileData: any): Promise<void> {
    console.log('✅ 处理Windows 10 Profile准备就绪事件:', profileData);

    const { profile, vol2_disabled, message } = profileData;

    // 显示准备就绪信息
    this.stateManager.addCommandOutput(`✅ ${message}`);
    this.commandWindowManager.updateCommandWindowDisplay();

    // 不在此阶段更新镜像加载状态；仅同步提示
    console.log('⏭️ 跳过在 Windows 10 Profile 准备就绪 阶段更新镜像状态');

    // 如果版本过高，禁用 Volatility2 区域
    if (vol2_disabled) {
      this.disableVolatility2Area('windows_10_version_too_high', message);
    } else {
      // 版本支持，应用 profile 到选择框
      await this.applyWindows10ProfileToUI(profile);
    }
  }

  /**
   * 将 Windows 10 Profile 应用到 UI 选择框
   */
  private async applyWindows10ProfileToUI(profile: string): Promise<void> {
    console.log('🔧 应用Windows 10 Profile到UI:', profile);

    // 首先保存到 settings.json
    await this.saveWindows10ProfileToSettings(profile);

    const vol2ProfileSelect = document.getElementById('vol2-profile') as HTMLSelectElement;
    if (vol2ProfileSelect) {
      console.log('✅ 找到vol2-profile选择框，更新选项');

      // 清空现有选项
      vol2ProfileSelect.innerHTML = '';

      // 添加检测到的 Windows 10 profile
      const option = document.createElement('option');
      option.value = profile;
      option.textContent = profile;
      option.selected = true;
      vol2ProfileSelect.appendChild(option);

      console.log('✅ Windows 10 Profile已应用到vol2-profile选择框:', profile);

      // 存储 profile 信息供后续使用
      this.storeProfileInfo([profile], profile);

      // 显示成功信息
      this.stateManager.addCommandOutput(`✅ Windows 10 Profile已设置并保存: ${profile}`);
      this.commandWindowManager.updateCommandWindowDisplay();
    } else {
      console.log('⚠️ vol2-profile选择框未找到，可能用户不在Volatility2区域');

      // 存储 profile 信息，等用户切换到 Volatility2 区域时自动应用
      this.storeProfileInfo([profile], profile);

      // 显示保存成功信息
      this.stateManager.addCommandOutput(`✅ Windows 10 Profile已保存到设置: ${profile}`);
      this.commandWindowManager.updateCommandWindowDisplay();
    }
  }

  /**
   * 保存 Windows 10 Profile 到 settings.json
   */
  private async saveWindows10ProfileToSettings(profile: string): Promise<void> {
    try {
      console.log('💾 保存Windows 10 Profile到设置文件:', profile);
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('save_volatility2_profile', { profile: profile });
      console.log('✅ Windows 10 Profile已保存到settings.json:', profile);
    } catch (error) {
      console.error('❌ 保存Windows 10 Profile到设置失败:', error);
      // 显示错误信息但不阻止流程
      this.stateManager.addCommandOutput(`⚠️ 保存Profile到设置失败: ${error}`);
      this.commandWindowManager.updateCommandWindowDisplay();
    }
  }

  // 实现基类的抽象方法
  async loadImageFile(forceOs?: 'windows' | 'linux'): Promise<void> {
    await this.imageManager.loadImageFile(forceOs);
    // 立即更新镜像状态区域，因为异步操作已经完成
    this.modernUIRenderer.updateImageStatusArea();
  }

  async unloadImageFile(): Promise<void> {
    // 等待镜像卸载完成
    await this.imageManager.unloadImageFile();

    // 清空已完成文件的记录
    this.clearCompletedFilesCache();

    // 立即更新UI状态，因为异步操作已经完成
    // 先更新UI渲染器的状态
    this.modernUIRenderer.updateState(this.stateManager.getState());
    // 然后更新镜像状态区域
    this.modernUIRenderer.updateImageStatusArea();
  }

  /**
   * 清空已完成文件的缓存记录
   */
  private clearCompletedFilesCache(): void {
    this.volatility2CompletedFiles.clear();
    this.volatility3CompletedFiles.clear();
    this.vol3linuxCompletedFiles.clear();

    console.log('✅ 已清空所有已完成文件的缓存记录');
  }


  // toggleTheme 方法从基类继承

  // toggleCommandWindow 方法从基类继承

  /**
   * 在生产环境中禁用开发者工具
   */
  private disableDevToolsInProduction(): void {
    // 只在生产环境中执行（检查是否为开发模式）
    const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (!isDev) {
      console.log('🔒 生产环境：禁用开发者工具');

      // 禁用F12和Ctrl+Shift+I快捷键
      window.addEventListener('keydown', (e) => {
        if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I')) {
          e.preventDefault();
          return false;
        }
      }, true);

      // 禁用右键菜单
      window.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        return false;
      }, true);

      // 检测开发者工具是否打开
      const checkDevTools = () => {
        const widthThreshold = window.outerWidth - window.innerWidth > 160;
        const heightThreshold = window.outerHeight - window.innerHeight > 160;

        if (widthThreshold || heightThreshold) {
          // 如果检测到开发者工具打开，可以执行一些操作
          console.log('⚠️ 检测到开发者工具打开');
          // 可以在这里添加额外的保护措施
        }
      };

      // 定期检查
      setInterval(checkDevTools, 1000);
    }
  }


  async openThemeEditor(): Promise<void> {
    try {
      const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');

      new WebviewWindow(`theme-editor-${Date.now()}`, {
        url: 'theme_editor.html',
        title: 'LovelyTheme Editor - 主题编辑器',
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        resizable: true,
        decorations: false, // 去除原生标题栏
        transparent: false,
        alwaysOnTop: false,
        center: true,
        skipTaskbar: false
      });

      MessageManager.showSuccess('主题编辑器已打开');
    } catch (error) {
      console.error('打开主题编辑器失败:', error);
      MessageManager.showError('无法打开主题编辑器');
    }
  }



  // 设置Volatility3执行状态的视觉反馈
  private setVolatility3ExecutionState(feature: string, state: 'idle' | 'running' | 'success' | 'error'): void {
    // 尝试查找功能卡片，先尝试带vol3-前缀的，再尝试不带前缀的
    let featureCard = document.querySelector(`[data-feature="vol3-${feature}"]`);
    if (!featureCard) {
      featureCard = document.querySelector(`[data-feature="${feature}"]`);
    }
    if (!featureCard) {
      console.warn(`未找到功能卡片: ${feature}`);
      return;
    }

    // 移除所有状态类
    featureCard.classList.remove('vol3-idle', 'vol3-running', 'vol3-success', 'vol3-error', 'vol3-completed');
    
    // 添加新状态类
    featureCard.classList.add(`vol3-${state}`);

    // 获取功能卡片中的图标和标题
    const icon = featureCard.querySelector('.feature-icon') as HTMLElement;
    const title = featureCard.querySelector('.feature-title') as HTMLElement;
    const description = featureCard.querySelector('.feature-description') as HTMLElement;

    if (!icon || !title) return;

    switch (state) {
      case 'running':
        // 执行中状态
        icon.textContent = '⏳';
        if (title) title.style.color = '#4ecdc4';
        if (description) description.textContent = '正在执行中...';
        featureCard.classList.add('pulse-animation');
        break;
        
      case 'success':
        // 成功状态
        icon.textContent = '✅';
        if (title) title.style.color = '#38a169';
        if (description) description.textContent = '执行成功！';
        featureCard.classList.add('success-animation');
        break;
        
      case 'error':
        // 错误状态
        icon.textContent = '❌';
        if (title) title.style.color = '#e53e3e';
        if (description) description.textContent = '执行失败';
        featureCard.classList.add('error-animation');
        break;
        
      case 'idle':
      default:
        // 重置到默认状态或已完成状态
        featureCard.classList.remove('pulse-animation', 'success-animation', 'error-animation');
        if (title) title.style.color = '';
        
        // 检查是否有已完成的文件
        if (this.volatility3CompletedFiles.has(feature)) {
          // 已完成状态 - 显示特殊标识
          featureCard.classList.add('vol3-completed');
          
          // 根据功能类型显示不同图标
          const txtPlugins = [
            'info', 'banners', 'crashinfo', 'envars', 'getservicesids', 
            'getsids', 'hashdump', 'lsadump', 'printkey', 'registry.printkey', 'cachedump'
          ];
          
          if (txtPlugins.includes(feature)) {
            icon.textContent = '📝'; // 文本图标
            if (description) description.textContent = '点击查看文本结果';
          } else {
            icon.textContent = '📊'; // CSV图标
            if (description) description.textContent = '点击查看CSV结果';
          }
          
          if (title) title.style.color = '#4ecdc4'; // Volatility3主题色表示已完成
        } else {
          // 根据功能恢复原始图标和描述
          this.resetVol3FeatureCardToDefault(feature, icon, description);
        }
        break;
    }
  }

  // 设置Vol3Linux执行状态的视觉反馈
  private setVol3LinuxExecutionState(feature: string, state: 'idle' | 'running' | 'success' | 'error'): void {
    // 尝试查找功能卡片，先尝试带vol3linux-前缀的，再尝试不带前缀的
    let featureCard = document.querySelector(`[data-feature="vol3linux-${feature}"]`);
    if (!featureCard) {
      featureCard = document.querySelector(`[data-feature="${feature}"]`);
    }
    if (!featureCard) {
      console.warn(`未找到功能卡片: ${feature}`);
      return;
    }

    // 移除所有状态类
    featureCard.classList.remove('vol3linux-idle', 'vol3linux-running', 'vol3linux-success', 'vol3linux-error', 'vol3linux-completed');
    
    // 添加新状态类
    featureCard.classList.add(`vol3linux-${state}`);

    // 获取功能卡片中的图标和标题
    const icon = featureCard.querySelector('.feature-icon') as HTMLElement;
    const title = featureCard.querySelector('.feature-title') as HTMLElement;
    const description = featureCard.querySelector('.feature-description') as HTMLElement;

    if (!icon || !title) return;

    // 根据状态设置不同的视觉效果
    switch (state) {
      case 'running':
        featureCard.classList.add('pulse-animation');
        icon.textContent = '⏳';
        if (title) title.style.color = '#a29bfe'; // Vol3Linux主题色
        if (description) description.textContent = '正在分析Linux内存...';
        break;
      
      case 'success':
        featureCard.classList.remove('pulse-animation');
        featureCard.classList.add('success-animation');
        icon.textContent = '✅';
        if (title) title.style.color = '#38a169';
        if (description) description.textContent = '分析完成，点击查看结果';
        break;
      
      case 'error':
        featureCard.classList.remove('pulse-animation');
        featureCard.classList.add('error-animation');
        icon.textContent = '❌';
        if (title) title.style.color = '#e53e3e';
        if (description) description.textContent = '执行失败，请检查配置';
        break;
      
      default:
        // 重置到默认状态或已完成状态
        featureCard.classList.remove('pulse-animation', 'success-animation', 'error-animation');
        if (title) title.style.color = '';
        
        // 检查是否有已完成的文件
        if (this.vol3linuxCompletedFiles.has(feature)) {
          // 已完成状态 - 显示特殊标识
          featureCard.classList.add('vol3linux-completed');
          
          // 根据功能类型显示不同图标
          const txtPlugins = ['psaux'];
          
          if (txtPlugins.includes(feature)) {
            icon.textContent = '📝'; // 文本图标
            if (description) description.textContent = '点击查看文本结果';
          } else {
            icon.textContent = '📊'; // CSV图标
            if (description) description.textContent = '点击查看CSV结果';
          }
          
          if (title) title.style.color = '#a29bfe'; // Vol3Linux主题色表示已完成
        } else {
          // 根据功能恢复原始图标和描述
          this.resetVol3LinuxFeatureCardToDefault(feature, icon, description);
        }
        break;
    }
  }

  // 设置Volatility2执行状态的视觉反馈
  private setVolatility2ExecutionState(feature: string, state: 'idle' | 'running' | 'success' | 'error'): void {
    // 尝试查找功能卡片，先尝试带vol2-前缀的，再尝试不带前缀的
    let featureCard = document.querySelector(`[data-feature="vol2-${feature}"]`);
    if (!featureCard) {
      featureCard = document.querySelector(`[data-feature="${feature}"]`);
    }
    if (!featureCard) {
      console.warn(`未找到功能卡片: ${feature}`);
      return;
    }

    // 移除所有状态类
    featureCard.classList.remove('vol2-idle', 'vol2-running', 'vol2-success', 'vol2-error', 'vol2-completed');
    
    // 添加新状态类
    featureCard.classList.add(`vol2-${state}`);

    // 获取功能卡片中的图标和标题
    const icon = featureCard.querySelector('.feature-icon') as HTMLElement;
    const title = featureCard.querySelector('.feature-title') as HTMLElement;
    const description = featureCard.querySelector('.feature-description') as HTMLElement;

    if (!icon || !title) return;

    switch (state) {
      case 'running':
        // 执行中状态
        icon.textContent = '⏳';
        if (title) title.style.color = '#3182ce';
        if (description) description.textContent = '正在执行中...';
        featureCard.classList.add('pulse-animation');
        break;
        
      case 'success':
        // 成功状态
        icon.textContent = '✅';
        if (title) title.style.color = '#38a169';
        if (description) description.textContent = '执行成功！';
        featureCard.classList.add('success-animation');
        break;
        
      case 'error':
        // 错误状态
        icon.textContent = '❌';
        if (title) title.style.color = '#e53e3e';
        if (description) description.textContent = '执行失败';
        featureCard.classList.add('error-animation');
        break;
        
      case 'idle':
      default:
        // 重置到默认状态或已完成状态
        featureCard.classList.remove('pulse-animation', 'success-animation', 'error-animation');
        if (title) title.style.color = '';
        
        // 检查是否有已完成的文件
        if (this.volatility2CompletedFiles.has(feature)) {
          // 已完成状态 - 显示特殊标识
          featureCard.classList.add('vol2-completed');
          
          // 获取已完成的文件名
          const completedFile = this.volatility2CompletedFiles.get(feature);
          const isTextFile = completedFile?.endsWith('.txt') || false;
          
          // 根据功能类型或文件扩展名显示不同图标
          const textList = [
            'imageinfo', 'verinfo', 'shutdowntime', 'printkey', 
            'auditpol', 'atoms', 'atomscan', 'callbacks','iehistory',
            'editbox','wintree','windows','eventhooks','messagehooks',
            'mimikatz'
          ];
          
          if (textList.includes(feature) || isTextFile) {
            icon.textContent = '📝'; // 文本图标
            if (description) description.textContent = '点击查看文本结果';
          } else {
            icon.textContent = '📊'; // CSV图标
            if (description) description.textContent = '点击查看CSV结果';
          }
          
          if (title) title.style.color = '#805ad5'; // 紫色表示已完成
        } else {
          // 根据功能恢复原始图标和描述
          this.resetFeatureCardToDefault(feature, icon, description);
        }
        break;
    }
  }

  // 重置Volatility3功能卡片到默认状态
  private resetVol3FeatureCardToDefault(feature: string, icon: HTMLElement, description: HTMLElement): void {
    const vol3DefaultStates = {
      // 系统信息类
      'info': { icon: '⚡', desc: '获取Windows系统信息和版本详情' },
      'crashinfo': { icon: '📋', desc: '提取系统崩溃信息和错误详情' },
      'statistics': { icon: '📊', desc: '生成内存使用统计信息' },

      // 进程分析类
      'pslist': { icon: '📋', desc: '高性能进程列表分析' },
      'pstree': { icon: '🔍', desc: '进程树结构可视化分析' },
      'psscan': { icon: '🔎', desc: '扫描进程结构体' },
      'psxview': { icon: '🌳', desc: '进程交叉视图分析' },
      'cmdline': { icon: '⌨️', desc: '显示进程命令行参数' },
      'envars': { icon: '🌱', desc: '显示进程环境变量' },
      'handles': { icon: '🎯', desc: '系统句柄和对象分析' },
      'joblinks': { icon: '🔗', desc: '作业对象链接分析' },
      'threads': { icon: '🧵', desc: '线程信息分析' },
      'thrdscan': { icon: '🔍', desc: '扫描线程结构体' },
      'suspended_threads': { icon: '⏸️', desc: '检测挂起的线程' },
      'hollowprocesses': { icon: '👻', desc: '检测进程镂空技术' },
      'processghosting': { icon: '👻', desc: '检测进程镜像替换' },

      // 内存和模块分析类
      'modules': { icon: '📚', desc: '显示内核模块列表' },
      'modscan': { icon: '🔍', desc: '扫描内核模块' },
      'unloadedmodules': { icon: '📦', desc: '显示已卸载的模块' },
      'dlllist': { icon: '📚', desc: '列出进程加载的DLL模块' },
      'ldrmodules': { icon: '📖', desc: '比较不同模块列表' },
      'vadinfo': { icon: '🗺️', desc: '显示虚拟地址描述符信息' },
      'vadwalk': { icon: '🚶', desc: '遍历虚拟地址空间' },
      'vadregexscan': { icon: '🔎', desc: '在VAD中进行正则扫描' },
      'bigpools': { icon: '🌊', desc: '显示大内存池分配' },
      'poolscanner': { icon: '🔍', desc: '内存池扫描工具' },
      'virtmap': { icon: '🗺️', desc: '虚拟内存映射' },

      // 网络分析类
      'netstat': { icon: '🌐', desc: '网络连接状态深度分析' },
      'netscan': { icon: '🔍', desc: '扫描网络连接信息' },

      // 文件系统类
      'filescan': { icon: '🗂️', desc: '文件系统对象扫描分析' },
      'dumpfiles': { icon: '📄', desc: '转储文件内容' },
      'symlinkscan': { icon: '🔍', desc: '扫描符号链接' },

      // 注册表分析类
      'registry.hivelist': { icon: '📋', desc: '列出注册表配置单元' },
      'registry.hivescan': { icon: '🔍', desc: '扫描注册表配置单元' },
      'registry.printkey': { icon: '🔑', desc: '打印注册表项' },
      'registry.certificates': { icon: '📜', desc: '提取注册表证书' },
      'registry.userassist': { icon: '👤', desc: '用户辅助活动记录' },
      'registry.getcellroutine': { icon: '🔧', desc: '获取注册表单元例程' },

      // 安全和恶意软件分析类
      'malfind': { icon: '🔒', desc: '先进恶意代码检测算法' },
      'privileges': { icon: '🛡️', desc: '进程权限和特权分析' },
      'hashdump': { icon: '🔐', desc: '转储密码哈希' },
      'cachedump': { icon: '🗃️', desc: '转储域缓存凭据' },
      'lsadump': { icon: '🔑', desc: '转储LSA密钥' },
      'getsids': { icon: '🆔', desc: '获取安全标识符' },
      'getservicesids': { icon: '⚙️', desc: '获取服务SID' },
      'skeleton_key_check': { icon: '🔍', desc: '检测骨架密钥攻击' },
      'truecrypt': { icon: '🔒', desc: 'TrueCrypt加密检测' },
      'suspicious_threads': { icon: '🕵️', desc: '检测可疑线程' },

      // 系统调用和API分析类
      'callbacks': { icon: '📞', desc: '显示回调函数信息' },
      'ssdt': { icon: '🔧', desc: '系统服务描述符表' },
      'iat': { icon: '🏗️', desc: '导入地址表分析' },
      'direct_system_calls': { icon: '📊', desc: '检测直接系统调用' },
      'indirect_system_calls': { icon: '🔀', desc: '检测间接系统调用' },

      // 设备和驱动类
      'devicetree': { icon: '🌳', desc: '设备树结构分析' },
      'driverirp': { icon: '🚗', desc: '驱动IRP处理分析' },
      'drivermodule': { icon: '🔧', desc: '驱动模块信息' },
      'driverscan': { icon: '🔍', desc: '扫描驱动对象' },

      // 内核和处理器类
      'kpcrs': { icon: '💎', desc: '处理器控制区域' },
      'timers': { icon: '⏰', desc: '内核定时器信息' },

      // 服务和会话类
      'svclist': { icon: '⚙️', desc: '服务列表信息' },
      'svcdiff': { icon: '🔄', desc: '服务差异分析' },
      'sessions': { icon: '👥', desc: '会话信息分析' },

      // 字符串和搜索类
      'strings': { icon: '🔤', desc: '字符串搜索和提取' },

      // 互斥体和同步对象类
      'mutantscan': { icon: '🔒', desc: '扫描互斥体对象' },

      // GUI相关类
      'windows': { icon: '🪟', desc: '窗口信息分析' },
      'deskscan': { icon: '🖥️', desc: '桌面对象扫描' },
      'desktops': { icon: '🖼️', desc: '桌面信息分析' },
      'windowstations': { icon: '🚉', desc: '窗口站信息' },

      // MBR和启动类
      'mbrscan': { icon: '🚀', desc: '主引导记录扫描' },

      // 版本和PE信息类
      'verinfo': { icon: 'ℹ️', desc: '版本信息分析' },
      'pedump': { icon: '📦', desc: 'PE文件转储' },

      // 缓存相关类
      'shimcachemem': { icon: '🔄', desc: '内存中的应用兼容缓存' }
    };

    const defaultState = vol3DefaultStates[feature as keyof typeof vol3DefaultStates];
    if (defaultState) {
      icon.textContent = defaultState.icon;
      if (description) description.textContent = defaultState.desc;
    }
  }

  // 重置Vol3Linux功能卡片到默认状态
  private resetVol3LinuxFeatureCardToDefault(feature: string, icon: HTMLElement, description: HTMLElement): void {
    const vol3linuxDefaultStates = {
      // 系统基础信息
      'banners': { icon: '🎋', desc: '检查内核横幅信息' },
      'boottime': { icon: '⏰', desc: '显示系统启动时间' },
      'iomem': { icon: '🗺️', desc: '列出系统IO内存映射' },
      'vmcoreinfo': { icon: 'ℹ️', desc: '显示VM核心信息' },
      'dmesg': { icon: '📋', desc: '提取内核消息缓冲区' },
      'kmsg': { icon: '📝', desc: '提取内核消息' },
      'kallsyms': { icon: '🔍', desc: '显示内核符号表' },

      // 进程信息
      'pslist': { icon: '📋', desc: '列出活动进程' },
      'psscan': { icon: '🔍', desc: '扫描进程结构体' },
      'pstree': { icon: '🌳', desc: '显示进程树' },
      'psaux': { icon: '📊', desc: '显示详细进程信息' },
      'proc_maps': { icon: '🗺️', desc: '显示进程内存映射' },
      'pscallstack': { icon: '📞', desc: '显示进程调用栈' },
      'pidhashtable': { icon: '#️⃣', desc: '显示PID哈希表' },
      'capabilities': { icon: '🔐', desc: '显示进程权限' },
      'ptrace': { icon: '🔍', desc: '检测ptrace操作' },

      // 用户与环境
      'bash': { icon: '💻', desc: '检查bash进程信息' },
      'bash_history': { icon: '📜', desc: '提取bash历史记录' },
      'bash_hash': { icon: '#️⃣', desc: '显示bash哈希表' },
      'envars': { icon: '🌱', desc: '显示环境变量' },
      'users': { icon: '👥', desc: '显示用户信息' },

      // 网络与通信
      'ip_addr': { icon: '🔢', desc: '显示IP地址信息' },
      'ip_link': { icon: '🔗', desc: '显示网络接口链接' },
      'arp': { icon: '📡', desc: '显示ARP表' },
      'netstat': { icon: '🌐', desc: '显示网络连接状态' },
      'route': { icon: '🛣️', desc: '显示路由表' },
      'sockstat': { icon: '🔌', desc: '显示套接字统计' },
      'netfilter': { icon: '🛡️', desc: '显示netfilter规则' },

      // 文件系统
      'fs_metadata': { icon: '📁', desc: '显示文件系统元数据' },
      'getcwd': { icon: '📍', desc: '获取当前工作目录' },
      'mountinfo': { icon: '🗻', desc: '显示挂载信息' },
      'lsof': { icon: '📂', desc: '列出打开的文件' },
      'pagecache_files': { icon: '💾', desc: '显示页面缓存文件' },
      'pagecache_inodepages': { icon: '📄', desc: '显示页面缓存inode页面' },
      'pagecache_recoverfs': { icon: '🔄', desc: '从页面缓存恢复文件系统' },

      // 内核与模块
      'elfs': { icon: '📄', desc: '列出内存中的ELF文件' },
      'lsmod': { icon: '🧩', desc: '列出加载的内核模块' },
      'kthreads': { icon: '🧵', desc: '显示内核线程' },
      'module_extract': { icon: '📦', desc: '提取内核模块' },
      'modxview': { icon: '👁️', desc: '查看模块详细信息' },
      'hidden_modules': { icon: '👻', desc: '检测隐藏的内核模块' },
      'library_list': { icon: '📚', desc: '列出共享库' },

      // 图形和输入
      'fbdev': { icon: '🖼️', desc: '显示帧缓冲设备信息' },
      'keyboard_notifiers': { icon: '⌨️', desc: '显示键盘通知器' },
      'tty_check': { icon: '💻', desc: '检查TTY设备' },

      // 跟踪与性能
      'ebpf': { icon: '🔧', desc: '显示eBPF程序' },
      'ftrace': { icon: '📈', desc: '检查ftrace功能' },
      'perf_events': { icon: '⚡', desc: '显示性能事件' },
      'tracepoints': { icon: '📍', desc: '检查跟踪点' },

      // 安全检查
      'check_afinfo': { icon: '🔍', desc: '检查地址族信息' },
      'check_creds': { icon: '🔐', desc: '检查凭据结构' },
      'check_idt': { icon: '🛡️', desc: '检查中断描述符表' },
      'check_syscall': { icon: '📞', desc: '检查系统调用表' },
      'check_modules': { icon: '🧩', desc: '检查模块完整性' },
      'malfind': { icon: '🔒', desc: '检测恶意代码注入' },
      'vmaregexscan': { icon: '🔍', desc: 'VMA区域正则扫描' },

      // 兼容旧版本命令
      'getenv': { icon: '🌱', desc: '获取环境变量（兼容命令）' },
      'ifconfig': { icon: '🔧', desc: '显示网络接口配置（兼容命令）' },
      'list_files': { icon: '📂', desc: '列出文件（兼容命令）' },
      'sudoers': { icon: '👑', desc: '显示sudoers配置' },
      'whoami': { icon: '👤', desc: '显示当前用户信息' }
    };

    const defaultState = vol3linuxDefaultStates[feature as keyof typeof vol3linuxDefaultStates];
    if (defaultState) {
      icon.textContent = defaultState.icon;
      if (description) description.textContent = defaultState.desc;
    }
  }

  // 重置功能卡片到默认状态
  private resetFeatureCardToDefault(feature: string, icon: HTMLElement, description: HTMLElement): void {
    const defaultStates = {
      // 现有功能
      'pslist': { icon: '📋', desc: '列出所有活动进程及其详细信息' },
      'imageinfo': { icon: '🖥️', desc: '获取内存镜像的基本信息和元数据' },
      'psscan': { icon: '🔍', desc: '扫描内存中的进程结构体' },
      'netscan': { icon: '🌐', desc: '扫描网络连接和套接字信息' },
      'filescan': { icon: '🗂️', desc: '扫描文件对象和文件句柄' },
      'hashdump': { icon: '🔐', desc: '提取系统密码哈希值' },
      'memdump': { icon: '💾', desc: '转储进程内存到文件' },
      'malfind': { icon: '🔒', desc: '检测隐藏和注入的代码' },
      
      // 进程相关功能
      'psxview': { icon: '👁️', desc: '隐藏进程检测和交叉视图分析' },
      'handles': { icon: '🔗', desc: '分析进程打开的文件句柄' },
      'privs': { icon: '🔑', desc: '查看进程权限和特权' },
      'cmdline': { icon: '💻', desc: '提取进程命令行参数' },
      'cmdscan': { icon: '📟', desc: '扫描命令行历史和缓冲区' },
      'consoles': { icon: '🖥️', desc: '分析控制台命令历史' },
      'envars': { icon: '🌱', desc: '提取进程环境变量' },
      'dlllist': { icon: '📚', desc: '列出进程加载的DLL模块' },
      
      // 内存管理相关功能
      'vadinfo': { icon: '🗺️', desc: '分析虚拟地址描述符信息' },
      'modules': { icon: '🧩', desc: '列出内核模块和驱动' },
      'unloadedmodules': { icon: '📤', desc: '查看已卸载的内核模块' },
      'ssdt': { icon: '📋', desc: '显示系统服务描述符表' },
      'timers': { icon: '⏰', desc: '分析内核定时器对象' },
      'gditimers': { icon: '🎨', desc: '分析GDI定时器对象' },
      'driverscan': { icon: '🚗', desc: '扫描内存中的驱动对象' },
      'driverirp': { icon: '📡', desc: '检测驱动IRP钩子' },
      'bigpools': { icon: '🏊', desc: '分析大页内存池分配' },
      
      // 文件系统相关功能
      'mftparser': { icon: '🗃️', desc: '解析NTFS主文件表' },
      'shellbags': { icon: '🗁', desc: '提取文件夹访问记录' },
      
      // 注册表相关功能
      'printkey': { icon: '🗝️', desc: '读取特定注册表键值' },
      'shimcache': { icon: '💾', desc: '分析应用程序兼容性缓存' },
      'auditpol': { icon: '📊', desc: '提取审计策略配置' },
      
      // 服务相关功能
      'svcscan': { icon: '⚙️', desc: '扫描Windows服务列表' },
      
      // 浏览器历史功能
      'userassist': { icon: '📈', desc: '分析用户程序使用统计' },
      'iehistory': { icon: '🌍', desc: '提取IE浏览器历史记录' },
      'chromehistory': { icon: '🌐', desc: '提取Chrome浏览器历史' },
      'firefoxhistory': { icon: '🦊', desc: '提取Firefox浏览器历史' },
      
      // 加密和安全功能
      'truecryptsummary': { icon: '🔐', desc: '检测TrueCrypt加密卷' },
      
      // 窗口和GUI功能
      'windows': { icon: '🪟', desc: '枚举桌面窗口信息' },
      'wintree': { icon: '🌳', desc: '显示窗口层次结构树' },
      'deskscan': { icon: '🖥️', desc: '扫描桌面和窗口站' },
      'session': { icon: '👤', desc: '分析用户会话信息' },
      'clipboard': { icon: '📋', desc: '提取剪贴板内容' },
      'editbox': { icon: '✏️', desc: '提取编辑框文本内容' },
      
      // 系统信息功能
      'verinfo': { icon: 'ℹ️', desc: '显示内存镜像版本信息' },
      'shutdowntime': { icon: '⏹️', desc: '获取系统关机时间' },
      'atoms': { icon: '⚛️', desc: '列出全局原子表' },
      'atomscan': { icon: '🔬', desc: '扫描原子表结构' },
      'callbacks': { icon: '📞', desc: '列出系统回调函数' },
      
      // 恶意代码检测功能
      'apihooks': { icon: '🪝', desc: '检测API钩子和IAT挂钩' },
      'mutantscan': { icon: '🔒', desc: '扫描互斥对象和同步原语' },
      'eventhooks': { icon: '⚡', desc: '检测事件钩子' },
      'messagehooks': { icon: '💬', desc: '检测消息钩子' },
      'symlinkscan': { icon: '🔗', desc: '扫描符号链接对象' },
      
      // 时间线功能
      'timeliner': { icon: '📅', desc: '生成系统活动时间线' }
    };

    const defaultState = defaultStates[feature as keyof typeof defaultStates];
    if (defaultState) {
      icon.textContent = defaultState.icon;
      if (description) description.textContent = defaultState.desc;
    }
  }

  // 检查并恢复Volatility3已完成功能的状态
  private async restoreVolatility3CompletedStates(): Promise<void> {
    try {      
      // 检查所有Vol3输出文件
      const features = [
        // 系统信息类
        'info', 'crashinfo', 'statistics',
        // 进程分析类
        'pslist', 'pstree', 'psscan', 'psxview', 'cmdline', 'envars', 'handles',
        'joblinks', 'threads', 'thrdscan', 'suspended_threads', 'hollowprocesses', 'processghosting',
        // 内存和模块分析类
        'modules', 'modscan', 'unloadedmodules', 'dlllist', 'ldrmodules', 'vadinfo',
        'vadwalk', 'vadregexscan', 'bigpools', 'poolscanner', 'virtmap',
        // 网络分析类
        'netstat', 'netscan',
        // 文件系统类
        'filescan', 'dumpfiles', 'symlinkscan',
        // 注册表分析类
        'registry.hivelist', 'registry.hivescan', 'registry.printkey', 'registry.certificates',
        'registry.userassist', 'registry.getcellroutine',
        // 安全和恶意软件分析类
        'malfind', 'privileges', 'hashdump', 'cachedump', 'lsadump', 'getsids',
        'getservicesids', 'skeleton_key_check', 'truecrypt.Passphrase', 'suspicious_threads',
        // 系统调用和API分析类
        'callbacks', 'ssdt', 'iat', 'direct_system_calls', 'indirect_system_calls',
        // 设备和驱动类
        'devicetree', 'driverirp', 'drivermodule', 'driverscan',
        // 内核和处理器类
        'kpcrs', 'timers',
        // 服务和会话类
        'svclist', 'svcdiff', 'sessions',
        // 字符串和搜索类
        'strings',
        // 互斥体和同步对象类
        'mutantscan',
        // GUI相关类
        'windows.Windows', 'deskscan', 'desktops', 'windowstations',
        // MBR和启动类
        'mbrscan',
        // 版本和PE信息类
        'verinfo', 'pedump',
        // 缓存相关类
        'shimcachemem',
        // 其他遗漏的功能
        'banners', 'printkey'
      ];
      
      for (const feature of features) {
        // 检查CSV和TXT文件
        const csvFile = `vol3_${feature}.csv`;
        const txtFile = `vol3_${feature}.txt`;
        
        try {
          // 尝试检查文件是否存在（通过读取输出目录）
          const files = await invoke('read_output_directory') as Array<{name: string}>;
          
          // 检查CSV文件
          if (files.some(file => file.name === csvFile)) {
            this.volatility3CompletedFiles.set(feature, csvFile);
            console.log(`🔄 恢复已完成功能状态: ${feature} -> ${csvFile}`);
            // 更新视觉状态
            setTimeout(() => {
              this.setVolatility3ExecutionState(feature, 'idle');
            }, 100);
          }
          // 检查TXT文件
          else if (files.some(file => file.name === txtFile)) {
            this.volatility3CompletedFiles.set(feature, txtFile);
            console.log(`🔄 恢复已完成功能状态: ${feature} -> ${txtFile}`);
            // 更新视觉状态
            setTimeout(() => {
              this.setVolatility3ExecutionState(feature, 'idle');
            }, 100);
          }
        } catch (error) {
          // 忽略单个文件检查失败
          console.log(`恢复功能状态失败 ${feature}:`, error);
        }
      }
    } catch (error) {
      console.log('恢复Volatility3状态失败:', error);
    }
  }

  // 检查并恢复Volatility2已完成功能的状态
  private async restoreVolatility2CompletedStates(): Promise<void> {
    try {      
      // 检查所有Vol2输出文件
      const features = [
        // 现有功能
        'pslist', 'imageinfo', 'psscan', 'netscan', 'filescan', 'hashdump', 'memdump', 'malfind',
        // 进程相关功能
        'psxview', 'handles', 'privs', 'cmdline', 'cmdscan', 'consoles', 'envars', 'dlllist',
        // 内存管理相关功能
        'vadinfo', 'modules', 'unloadedmodules', 'ssdt', 'timers', 'gditimers', 'driverscan', 'driverirp', 'bigpools',
        // 文件系统相关功能
        'mftparser', 'shellbags',
        // 注册表相关功能
        'printkey', 'dumpregistry', 'shimcache', 'auditpol',
        // 服务相关功能
        'svcscan',
        // 浏览器历史功能
        'userassist', 'iehistory', 'chromehistory', 'firefoxhistory',
        // 加密和安全功能
        'truecryptsummary',
        // 窗口和GUI功能
        'windows', 'wintree', 'deskscan', 'session', 'clipboard', 'editbox',
        // 系统信息功能
        'verinfo', 'shutdowntime', 'atoms', 'atomscan', 'callbacks',
        // 恶意代码检测功能
        'apihooks', 'mutantscan', 'eventhooks', 'messagehooks', 'symlinkscan',
        // 时间线功能
        'timeliner'
      ];
      
      for (const feature of features) {
        // 检查CSV和TXT文件
        const csvFile = `vol2_${feature}.csv`;
        const txtFile = `vol2_${feature}.txt`;
        
        try {
          // 尝试检查文件是否存在（通过读取输出目录）
          const files = await invoke('read_output_directory') as Array<{name: string}>;
          
          // 检查CSV文件
          if (files.some(file => file.name === csvFile)) {
            this.volatility2CompletedFiles.set(feature, csvFile);
            console.log(`🔄 恢复已完成功能状态: ${feature} -> ${csvFile}`);
            // 更新视觉状态
            setTimeout(() => {
              this.setVolatility2ExecutionState(feature, 'idle');
            }, 100);
          }
          // 检查TXT文件
          else if (files.some(file => file.name === txtFile)) {
            this.volatility2CompletedFiles.set(feature, txtFile);
            console.log(`🔄 恢复已完成功能状态: ${feature} -> ${txtFile}`);
            // 更新视觉状态
            setTimeout(() => {
              this.setVolatility2ExecutionState(feature, 'idle');
            }, 100);
          }
        } catch (error) {
          // 忽略单个文件检查失败
          console.log(`恢复功能状态失败 ${feature}:`, error);
        }
      }
    } catch (error) {
      console.log('恢复Volatility2状态失败:', error);
    }
  }

  // 检查并恢复Vol3Linux已完成功能的状态
  private async restoreVol3LinuxCompletedStates(): Promise<void> {
    try {      
      // 检查所有Vol3Linux输出文件
      const features = [
        // 系统基础信息
        'banners', 'boottime', 'iomem', 'vmcoreinfo', 'dmesg', 'kmsg', 'kallsyms',
        // 进程信息
        'pslist', 'psscan', 'pstree', 'psaux', 'proc_maps', 'pscallstack', 'pidhashtable',
        'capabilities', 'ptrace',
        // 用户与环境
        'bash', 'bash_history', 'bash_hash', 'envars', 'users',
        // 网络与通信
        'ip_addr', 'ip_link', 'arp', 'netstat', 'route', 'sockstat', 'netfilter',
        // 文件系统
        'fs_metadata', 'getcwd', 'mountinfo', 'lsof', 'pagecache_files', 'pagecache_inodepages',
        'pagecache_recoverfs',
        // 内核与模块
        'elfs', 'lsmod', 'kthreads', 'module_extract', 'modxview', 'hidden_modules', 'library_list',
        // 图形和输入
        'fbdev', 'keyboard_notifiers', 'tty_check',
        // 跟踪与性能
        'ebpf', 'ftrace', 'perf_events', 'tracepoints',
        // 安全检查
        'check_afinfo', 'check_creds', 'check_idt', 'check_syscall', 'check_modules',
        'malfind', 'vmaregexscan',
        // 兼容旧版本命令
        'getenv', 'ifconfig', 'list_files', 'sudoers', 'whoami'
      ];
      
      for (const feature of features) {
        // 检查CSV和TXT文件
        const csvFile = `vol3linux_${feature}.csv`;
        const txtFile = `vol3linux_${feature}.txt`;
        
        try {
          // 尝试检查文件是否存在（通过读取输出目录）
          const files = await invoke('read_output_directory') as Array<{name: string}>;
          
          // 检查CSV文件
          if (files.some(file => file.name === csvFile)) {
            this.vol3linuxCompletedFiles.set(feature, csvFile);
            console.log(`🔄 恢复已完成功能状态: ${feature} -> ${csvFile}`);
            // 更新视觉状态
            setTimeout(() => {
              this.setVol3LinuxExecutionState(feature, 'idle');
            }, 100);
          }
          // 检查TXT文件
          else if (files.some(file => file.name === txtFile)) {
            this.vol3linuxCompletedFiles.set(feature, txtFile);
            console.log(`🔄 恢复已完成功能状态: ${feature} -> ${txtFile}`);
            // 更新视觉状态
            setTimeout(() => {
              this.setVol3LinuxExecutionState(feature, 'idle');
            }, 100);
          }
        } catch (error) {
          // 忽略单个文件检查失败
          console.log(`恢复功能状态失败 ${feature}:`, error);
        }
      }
    } catch (error) {
      console.log('恢复Vol3Linux状态失败:', error);
    }
  }

  // 设置相关功能
  showSettingsDialog(): void {
    this.settingsManager.showSettingsDialog();
  }

  // 状态更新功能
  // updateStatus 方法从基类继承

  // 请求通知权限
  private async requestNotificationPermission(): Promise<void> {
    if ('Notification' in window) {
      try {
        const permission = await Notification.requestPermission();
        console.log('通知权限状态:', permission);
      } catch (error) {
        console.log('请求通知权限失败:', error);
      }
    }
  }

  // 验证应用设置
  private async validateSettingsOnStartup(): Promise<void> {
    try {
      console.log('🔍 开始验证应用设置...');
      this.updateStartupProgress('正在验证应用设置...', 85);

      const { invoke } = await import('@tauri-apps/api/core');
      const validationResult = await invoke('validate_settings_on_startup') as any;

      // console.log('设置验证结果:', validationResult);

      // 处理设置验证结果
      if (validationResult && typeof validationResult === 'object') {
        // 检查是否有关键问题
        const criticalIssues = validationResult.issues.filter((issue: any) => issue.severity === 'Critical');

        if (criticalIssues.length > 0) {
          console.log('❌ 发现关键设置问题，需要用户配置');

          // 显示设置验证对话框
          await this.showSettingsValidationDialog(validationResult);
        } else {
          // 输出警告日志
          validationResult.issues.forEach((issue: any) => {
            console.warn(`⚠️ 设置问题 [${issue.severity}] - ${issue.field_name}: ${issue.description}`);
          });
          // 可以选择显示一个简单的通知
          // setTimeout(() => {
          //   this.showSettingsWarningNotification(validationResult);
          // }, 200);
        }
      } else {
        console.log('✅ 应用设置验证通过');
      }

      this.updateStartupProgress('设置验证完成', 90);
    } catch (error) {
      console.error('❌ 设置验证失败:', error);
      // 设置验证失败不阻止应用启动，只记录错误
    }
  }

  // 显示设置验证对话框
  private async showSettingsValidationDialog(validationResult: any): Promise<void> {
    return new Promise((resolve) => {
      // 检查是否有 Python 环境缺失问题
      const pythonEnvIssue = validationResult.issues.find((issue: any) => issue.issue_type === 'PythonEnvMissing');
      
      if (pythonEnvIssue) {
        // 显示 Python 环境修复对话框
        this.showPythonEnvFixDialog(pythonEnvIssue, resolve);
      } else {
        // 显示普通设置验证对话框
        this.showNormalSettingsValidationDialog(validationResult, resolve);
      }
    });
  }

  // 显示 Python 环境修复对话框
  private async showPythonEnvFixDialog(issue: any, resolve: () => void): Promise<void> {
    const dialog = document.createElement('div');
    dialog.className = 'settings-validation-dialog';
    dialog.innerHTML = `
      <div class="settings-validation-overlay">
        <div class="settings-validation-content">
          <div class="settings-validation-header">
            <h3>🔧 MemProcFS Python 环境需要修复</h3>
          </div>
          <div class="settings-validation-body">
            <p class="validation-summary">${issue.description}</p>
            <div class="validation-issues">
              <div class="validation-issue critical">
                <div class="issue-icon">❌</div>
                <div class="issue-content">
                  <div class="issue-title">${issue.field_name}</div>
                  <div class="issue-description">检测到 MemProcFS 环境异常</div>
                  <div class="issue-description">点击"立即修复"后，程序会自动修复 MemProcFS 环境</div>
                </div>
              </div>
            </div>
            <div class="python-fix-progress" style="display: none;">
              <div class="progress-label">修复进度</div>
              <div class="pixel-progress-bar">
                <div class="pixel-progress-fill" style="width: 0%;">
                  <span class="progress-text">0%</span>
                </div>
              </div>
              <div class="progress-status">正在准备修复环境...</div>
              <div class="progress-details">
                <div class="detail-item">
                  <span class="detail-label">文件</span>
                  <span class="detail-value progress-files">0 / 0</span>
                </div>
                <div class="detail-item">
                  <span class="detail-label">数据</span>
                  <span class="detail-value progress-bytes">0 B / 0 B</span>
                </div>
                <div class="detail-item current-file">当前文件：-</div>
              </div>
            </div>
          </div>
          <div class="settings-validation-footer">
            <button class="settings-validation-btn settings-validation-fix">立即修复</button>
            <button class="settings-validation-btn settings-validation-later">稍后处理</button>
          </div>
        </div>
      </div>
    `;


    // 添加事件监听
    const fixBtn = dialog.querySelector('.settings-validation-fix');
    const laterBtn = dialog.querySelector('.settings-validation-later');
    const progressContainer = dialog.querySelector('.python-fix-progress') as HTMLElement;
    const progressFill = dialog.querySelector('.pixel-progress-fill') as HTMLElement;
    const progressText = dialog.querySelector('.progress-text') as HTMLElement;
    const progressStatus = dialog.querySelector('.progress-status') as HTMLElement;
    const progressFiles = dialog.querySelector('.progress-files') as HTMLElement;
    const progressBytes = dialog.querySelector('.progress-bytes') as HTMLElement;
    const currentFileEl = dialog.querySelector('.current-file') as HTMLElement;

    let unlisten: (() => void) | null = null;
    let operationCompleted = false;

    const cleanup = () => {
      if (unlisten) {
        unlisten();
        unlisten = null;
      }
    };

    const resetProgress = () => {
      progressFill.style.width = '0%';
      progressText.textContent = '0%';
      progressStatus.textContent = '正在准备修复环境...';
      if (progressFiles) {
        progressFiles.textContent = '0 / 0';
      }
      if (progressBytes) {
        progressBytes.textContent = '0 B / 0 B';
      }
      if (currentFileEl) {
        currentFileEl.textContent = '当前文件：-';
      }
    };

    const handleFailure = (message: string) => {
      MessageManager.showError(`❌ ${message}`);
      fixBtn?.removeAttribute('disabled');
      laterBtn?.removeAttribute('disabled');
      progressContainer.style.display = 'none';
    };

    fixBtn?.addEventListener('click', async () => {
      try {
        progressContainer.style.display = 'block';
        resetProgress();
        fixBtn.setAttribute('disabled', 'true');
        laterBtn?.setAttribute('disabled', 'true');

        const { invoke } = await import('@tauri-apps/api/core');
        const { listen } = await import('@tauri-apps/api/event');

        cleanup();

        unlisten = await listen('fix-python-progress', (event) => {
          const payload = event.payload as any;
          if (!payload) {
            return;
          }

          const percent = Math.min(Math.max(Number(payload.percent) || 0, 0), 100);
          const statusText = payload.status || '处理中...';
          const currentFile = payload.current_file ? ` (${payload.current_file})` : '';

          progressFill.style.width = `${percent}%`;
                   progressText.textContent = `${Math.round(percent)}%`;
          progressStatus.textContent = `${statusText}${currentFile}`;

          if (progressFiles) {
            const filesDone = Number(payload.files_done) || 0;
            const filesTotal = Number(payload.files_total) || 0;
            progressFiles.textContent = `${filesDone} / ${filesTotal}`;
          }

          if (progressBytes) {
            const copiedBytes = Number(payload.copied_bytes) || 0;
            const totalBytes = Number(payload.total_bytes) || 0;
            progressBytes.textContent = `${this.formatBytes(copiedBytes)} / ${this.formatBytes(totalBytes)}`;
          }

          if (currentFileEl) {
            if (payload.current_file) {
              currentFileEl.textContent = `当前文件：${payload.current_file}`;
            } else {
              currentFileEl.textContent = '当前文件：-';
            }
          }

          if (payload.completed) {
            operationCompleted = true;
            cleanup();

            if (payload.success) {
              const message = payload.message || 'MemProcFS Python 环境修复完成';
              MessageManager.showSuccess(`✅ ${message}`);
              dialog.remove();
              resolve();
            } else {
              const message = payload.message || 'MemProcFS Python 环境修复失败';
              handleFailure(message);
            }
          }
        });

        await invoke('fix_memprocfs_python_env');

        if (!operationCompleted) {
          // 理论上不会发生，作为兜底处理
          MessageManager.showSuccess('✅ MemProcFS Python 环境修复完成');
          dialog.remove();
          resolve();
        }
      } catch (error) {
        cleanup();

        if (!operationCompleted) {
          console.error('修复 MemProcFS Python 环境失败:', error);
          handleFailure(String(error));
        }
      }
    });

    laterBtn?.addEventListener('click', () => {
      cleanup();
      dialog.remove();
      resolve();
    });

    document.body.appendChild(dialog);
  }

  private formatBytes(bytes: number): string {
    if (!bytes || bytes <= 0) {
      return '0 B';
    }

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, idx);
    const digits = idx === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2;
    return `${value.toFixed(digits)} ${units[idx]}`;
  }

  // 显示普通设置验证对话框
  private async showNormalSettingsValidationDialog(validationResult: any, resolve: () => void): Promise<void> {
    const dialog = document.createElement('div');
    dialog.className = 'settings-validation-dialog';
    dialog.innerHTML = `
      <div class="settings-validation-overlay">
        <div class="settings-validation-content">
          <div class="settings-validation-header">
            <h3>⚙️ 应用设置需要配置</h3>
          </div>
          <div class="settings-validation-body">
            <p class="validation-summary">${validationResult.summary}</p>
            <div class="validation-issues">
              ${validationResult.issues.map((issue: any) => `
                <div class="validation-issue ${issue.severity.toLowerCase()}">
                  <div class="issue-icon">
                    ${issue.severity === 'Critical' ? '❌' : issue.severity === 'Warning' ? '⚠️' : 'ℹ️'}
                  </div>
                  <div class="issue-content">
                    <div class="issue-title">${issue.field_name}</div>
                    <div class="issue-description">${issue.description}</div>
                    ${issue.current_value ? `<div class="issue-current">当前值: ${issue.current_value}</div>` : ''}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
          <div class="settings-validation-footer">
            <button class="settings-validation-btn settings-validation-configure">一键配置</button>
            <button class="settings-validation-btn settings-validation-later">稍后配置</button>
          </div>
        </div>
      </div>
    `;

    // 添加样式
    this.addSettingsValidationStyles();

    // 添加事件监听
    const configureBtn = dialog.querySelector('.settings-validation-configure');
    const laterBtn = dialog.querySelector('.settings-validation-later');

    configureBtn?.addEventListener('click', async () => {
      dialog.remove();
      // 打开设置界面
      this.showSettingsDialog();
      resolve();
    });

    laterBtn?.addEventListener('click', () => {
      dialog.remove();
      resolve();
    });

    document.body.appendChild(dialog);
  }

  private updateStartupProgress(message: string, progress: number): void {
    const statusText = document.querySelector('.status-text') as HTMLElement;
    const progressFill = document.querySelector('.progress-fill') as HTMLElement;

    if (statusText) {
      statusText.textContent = message;
      if (message.includes('成功')) {
        statusText.style.color = 'var(--s-accent, #22c55e)';
        statusText.style.fontWeight = '600';
      }
    }

    if (progressFill) {
      progressFill.style.width = `${progress}%`;
      if (progress >= 100) {
        progressFill.style.background = 'linear-gradient(90deg, #22c55e, #16a34a)';
      }
    }
  }

  /**
   * 自动检测版本更新
   */
  private async autoCheckVersion(): Promise<void> {
    try {
      console.log('🔍 主应用: 启动时自动检查版本更新...');

      const { getAppVersion } = await import('./modules/core/appVersion');
      const currentVersion = await getAppVersion();

      // 导入更新管理器
      const { UpdateManager } = await import('./modules/update');
      const updateManager = new UpdateManager(currentVersion);

      // 静默检查更新
      const updateInfo = await updateManager.silentCheckForUpdates();

      // 处理检查结果
      if (updateInfo) {
        console.log('🚀 主应用: 发现新版本:', updateInfo.version);

        // 显示更新指示器
        await updateManager.showUpdateIndicator(updateInfo);

        console.log('✅ 主应用: 自动版本检查完成');
      } else {
        console.log('✅ 主应用: 当前已是最新版本');
      }
    } catch (error) {
      console.error('❌ 主应用: 自动版本检查失败:', error);
      // 静默失败，不影响用户体验
    }
  }

  /**
   * 启动时静默校验并更新 MemProcFS 组件（vmm.dll / memprocfs.exe）
   *
   * 调用后端 check_and_update_memprocfs_command：从设置的更新地址拉取云端清单，
   * 对本地组件做 SHA256 校验；不一致时后端会先结束 MemProcFS 进程再静默下载替换。
   * 全程静默——仅在实际发生替换时给出一次提示，其余情况只写控制台日志。
   */
  private async autoCheckMemProcFsComponents(): Promise<void> {
    try {
      console.log('🔍 主应用: 启动时静默校验 MemProcFS 组件...');

      const result = await invoke<{
        checked: boolean;
        updated: boolean;
        version: string;
        replaced_files: string[];
        message: string;
      }>('check_and_update_memprocfs_command');

      if (result?.updated) {
        const files = (result.replaced_files || []).join('、');
        console.log('✅ 主应用: MemProcFS 组件已静默更新:', files);
        MessageManager.showSuccess(`MemProcFS 组件已更新至 ${result.version || '最新'}：${files}`);
      } else if (result?.checked) {
        console.log('✅ 主应用: MemProcFS 组件校验完成:', result.message);
      } else {
        console.log('ℹ️ 主应用: MemProcFS 组件校验跳过:', result?.message);
      }
    } catch (error) {
      // 静默失败（网络不通 / 清单为空 / 校验失败等），不影响用户体验
      console.warn('⚠️ 主应用: MemProcFS 组件校验失败（已忽略）:', error);
    }
  }


  /**
   * 更新关闭状态文本
   */
  protected updateClosingStatus(status: string): void {
    const statusElement = document.getElementById('closing-status');
    if (statusElement) {
      statusElement.textContent = status;
    }
  }

  /**
   * 添加设置验证对话框样式
   */
  private addSettingsValidationStyles(): void {
    if (document.getElementById('settings-validation-styles')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'settings-validation-styles';
    style.textContent = `
      .settings-validation-dialog {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 10000;
      }

      .settings-validation-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        justify-content: center;
        align-items: center;
        animation: fadeIn 0.3s ease-out;
      }

      .settings-validation-content {
        background: var(--bg-secondary, #ffffff);
        border: 1px solid var(--border-color, #e2e8f0);
        border-radius: 12px;
        padding: 30px;
        width: 640px;
        height: 520px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        box-shadow: var(--shadow-heavy, 0 10px 30px rgba(0, 0, 0, 0.3));
        animation: slideInUp 0.3s ease-out;
      }

      .settings-validation-body {
        flex: 1;
        overflow-y: auto;
        margin-bottom: 20px;
      }

      .settings-validation-footer {
        flex-shrink: 0;
      }

      .settings-validation-header h3 {
        margin: 0 0 20px 0;
        color: var(--text-primary, #1e293b);
        text-align: center;
        font-size: 20px;
        font-weight: 600;
      }

      .validation-summary {
        background: var(--bg-tertiary, #f1f5f9);
        border: 1px solid var(--border-color, #e2e8f0);
        border-radius: 8px;
        padding: 15px;
        margin-bottom: 20px;
        color: var(--text-primary, #1e293b);
        font-size: 14px;
        line-height: 1.5;
      }

      .validation-issues {
        margin-bottom: 25px;
      }

      .validation-issue {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 15px;
        margin-bottom: 10px;
        border-radius: 8px;
        border-left: 4px solid;
      }

      .validation-issue.critical {
        background: rgba(255, 82, 82, 0.1);
        border-left-color: var(--error-color, #ff5252);
      }

      .validation-issue.warning {
        background: rgba(255, 167, 38, 0.1);
        border-left-color: var(--warning-color, #ffa726);
      }

      .validation-issue.info {
        background: rgba(66, 165, 245, 0.1);
        border-left-color: var(--info-color, #42a5f5);
      }

      .issue-icon {
        font-size: 18px;
        flex-shrink: 0;
        margin-top: 2px;
      }

      .issue-content {
        flex: 1;
      }

      .issue-title {
        font-weight: 600;
        color: var(--text-primary, #1e293b);
        margin-bottom: 4px;
      }

      .issue-description {
        color: var(--text-secondary, #64748b);
        font-size: 13px;
        line-height: 1.4;
        margin-bottom: 4px;
      }

      .issue-current {
        color: var(--text-light, #94a3b8);
        font-size: 12px;
        font-family: monospace;
        background: rgba(0, 0, 0, 0.05);
        padding: 2px 6px;
        border-radius: 4px;
        display: inline-block;
      }

      .settings-validation-footer {
        display: flex;
        justify-content: center;
        gap: 15px;
      }

      .settings-validation-btn {
        padding: 10px 20px;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        min-width: 120px;
      }

      .settings-validation-configure {
        background: var(--primary-color, #667eea);
        color: white;
      }

      .settings-validation-configure:hover {
        background: var(--secondary-color, #764ba2);
        transform: translateY(-1px);
      }

      .settings-validation-later {
        background: var(--bg-tertiary, #f1f5f9);
        color: var(--text-secondary, #64748b);
        border: 1px solid var(--border-color, #e2e8f0);
      }

      .settings-validation-later:hover {
        background: var(--border-color, #e2e8f0);
      }

      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      @keyframes slideInUp {
        from {
          opacity: 0;
          transform: translateY(30px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
    `;
    document.head.appendChild(style);
  }

}


window.addEventListener('DOMContentLoaded', async () => {
  const app = new LovelymemAppRefactored();
  await app.init();
});
