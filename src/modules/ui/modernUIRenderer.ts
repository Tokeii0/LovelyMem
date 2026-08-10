import { AppState } from '../core/types';
import { SidebarRenderer } from './components/SidebarRenderer';
import { TitleBarRenderer } from './components/TitleBarRenderer';
import { NavBarRenderer } from './components/NavBarRenderer';
import { WorkspaceRenderer } from './components/WorkspaceRenderer';
import { ImageStatusRenderer } from './components/ImageStatusRenderer';
import { FilesRenderer } from './components/FilesRenderer';
import { CommandPreviewRenderer } from './components/CommandPreviewRenderer';
import { StatusBarRenderer } from './components/StatusBarRenderer';
import { AIChatRenderer } from './components/AIChatRenderer';
import './components/AIChat.css';
import { WarningPage } from './components/WarningPage';
import { RegistryViewerInterface } from '../registry-viewer/RegistryViewerInterface';
import { EventViewerInterface } from '../evtx-viewer/EventViewerInterface';
import { ReportEditorInterface } from '../report-editor/ReportEditorInterface';
import { ProcessGalaxyInterface } from '../process-galaxy/ProcessGalaxyInterface';
import { TimelineGalaxyInterface } from '../timeline-galaxy/TimelineGalaxyInterface';
import { ProfileManager } from '../utils/profileManager';
import { StringSearchPanel } from '../string-search/StringSearchPanel';
import { TerminalInterface } from './terminalInterface';
import { LogPage } from './components/LogPage';

export class ModernUIRenderer {
  private sidebarRenderer: SidebarRenderer;
  private titleBarRenderer: TitleBarRenderer;
  private navBarRenderer: NavBarRenderer;
  private workspaceRenderer: WorkspaceRenderer;
  private imageStatusRenderer: ImageStatusRenderer;
  private filesRenderer: FilesRenderer;
  private commandPreviewRenderer: CommandPreviewRenderer;
  private statusBarRenderer: StatusBarRenderer;
  private aiChatRenderer: AIChatRenderer;
  private warningPage: WarningPage;
  private registryViewerInterface: RegistryViewerInterface;
  private eventViewerInterface: EventViewerInterface;
  private reportEditorInterface: ReportEditorInterface;
  private processGalaxyInterface: ProcessGalaxyInterface;
  private timelineGalaxyInterface: TimelineGalaxyInterface;
  private stringSearchPanel: StringSearchPanel;
  private terminalInterface: TerminalInterface;
  private logPage: LogPage;

  constructor(private state: AppState) {
    this.sidebarRenderer = new SidebarRenderer(state);
    this.titleBarRenderer = new TitleBarRenderer(state);
    this.aiChatRenderer = new AIChatRenderer(state);
    this.warningPage = new WarningPage(state);
    this.registryViewerInterface = new RegistryViewerInterface();
    this.eventViewerInterface = new EventViewerInterface();
    this.reportEditorInterface = new ReportEditorInterface();
    this.processGalaxyInterface = new ProcessGalaxyInterface();
    this.timelineGalaxyInterface = new TimelineGalaxyInterface();
    this.stringSearchPanel = new StringSearchPanel();
    this.terminalInterface = new TerminalInterface();
    this.logPage = new LogPage();

    // Helper function for NavBar and Workspace to get area icons
    const getAreaIcon = (config: any) => this.sidebarRenderer.getAreaIcon(config);
    const isFilePath = (str: string) => this.isFilePath(str);

    this.navBarRenderer = new NavBarRenderer(
      state,
      this.sidebarRenderer.getAreas(),
      getAreaIcon,
      isFilePath
    );

    this.workspaceRenderer = new WorkspaceRenderer(
      state,
      this.sidebarRenderer.getAreas(),
      getAreaIcon,
      isFilePath
    );

    this.imageStatusRenderer = new ImageStatusRenderer(
      state,
      this.updateMainWorkspace.bind(this)
    );

    this.filesRenderer = new FilesRenderer(state);
    this.commandPreviewRenderer = new CommandPreviewRenderer(state);
    this.statusBarRenderer = new StatusBarRenderer();
  }

  // Update state for all renderers
  updateState(newState: AppState): void {
    this.state = newState;
    this.sidebarRenderer.updateState(newState);
    this.titleBarRenderer.updateState(newState);
    this.navBarRenderer.updateState(newState);
    this.workspaceRenderer.updateState(newState);
    this.imageStatusRenderer.updateState(newState);
    this.filesRenderer.updateState(newState);
    this.commandPreviewRenderer.updateState(newState);
    this.aiChatRenderer.updateState(newState);
    this.warningPage.updateState(newState);
  }

  /** 按区域配置名查找其在区域列表中的索引（供 Linux 镜像加载后切换到 MemNixFS 区） */
  public getAreaIndexByName(name: string): number {
    try {
      const areas = this.sidebarRenderer.getAreas();
      return areas.findIndex((a: any) => a && typeof a.getConfig === 'function' && a.getConfig().name === name);
    } catch {
      return -1;
    }
  }

  getState(): AppState {
    return this.state;
  }

  // Delegate methods
  async updateMainWorkspace(): Promise<void> {
    // Try to find the workspace container by class or ID
    let mainWorkspace = document.querySelector('.main-workspace') ||
                        document.getElementById('ai-chat-root');
    
    // If not found by specific selectors, try to find it within the main container
    if (!mainWorkspace) {
        const mainContainer = document.querySelector('.main-container');
        if (mainContainer) {
            // The workspace is typically the last element in the main container
            // or the one that is not the navbar or sidebar
            const children = Array.from(mainContainer.children);
            for (const child of children) {
                if (!child.classList.contains('vertical-navbar') && 
                    !child.classList.contains('modern-sidebar')) {
                    mainWorkspace = child as Element;
                    break;
                }
            }
        }
    }

    if (!mainWorkspace) return;

    try {
      const newWorkspaceContent = await this.renderMainWorkspace();
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = newWorkspaceContent;
      const newContent = tempDiv.firstElementChild;

      if (newContent) {
        const currentSearchInput = mainWorkspace.querySelector('.enhanced-search-input') as HTMLInputElement;
        const searchValue = currentSearchInput?.value || '';

        mainWorkspace.replaceWith(newContent);
        
        // 将模板中的 style 标签也添加到 document.head 中（如果有的话）
        const styleElements = tempDiv.querySelectorAll('style');
        styleElements.forEach(style => {
          // 检查是否已存在相同内容的 style 标签，避免重复添加
          const styleContent = style.textContent || '';
          const existingStyles = document.head.querySelectorAll('style');
          let isDuplicate = false;
          existingStyles.forEach(existing => {
            if (existing.textContent === styleContent) {
              isDuplicate = true;
            }
          });
          if (!isDuplicate && styleContent.trim()) {
            document.head.appendChild(style.cloneNode(true));
          }
        });

        if (this.state.currentTab === 'registry-viewer') {
          const root = document.getElementById('registry-viewer-root');
          if (root) {
            await this.registryViewerInterface.initialize(root);
          }
        } else if (this.state.currentTab === 'event-viewer') {
          const root = document.getElementById('event-viewer-root');
          if (root) {
            await this.eventViewerInterface.initialize(root);
          }
        } else if (this.state.currentTab === 'report-editor') {
          const root = document.getElementById('report-editor-root');
          if (root) {
            await this.reportEditorInterface.initialize(root);
          }
        } else if (this.state.currentTab === 'process-galaxy') {
          const root = document.getElementById('process-galaxy-root');
          if (root) {
            await this.processGalaxyInterface.initialize(root);
          }
        } else if (this.state.currentTab === 'timeline-galaxy') {
          const root = document.getElementById('timeline-galaxy-root');
          if (root) {
            await this.timelineGalaxyInterface.initialize(root);
          }
        } else if (this.state.currentTab === 'string-search') {
          const root = document.getElementById('string-search-panel-root');
          if (root) {
            await this.stringSearchPanel.initialize(root);
          }
        } else if (this.state.currentTab === 'ai-chat') {
          // AI Chat is rendered via string, but manager initialization is handled in render() via setTimeout
        } else if (this.state.currentTab === 'warnings') {
          const root = document.getElementById('warning-page-root');
          if (root) {
            await this.warningPage.initialize(root);
          }
        } else if (this.state.currentTab === 'terminal') {
          const root = document.getElementById('terminal-root');
          if (root) {
            await this.terminalInterface.initialize(root);
          }
        } else if (this.state.currentTab === 'logs') {
          const root = document.getElementById('log-page-root');
          if (root) {
            await this.logPage.initialize(root);
          }
        } else {
          const newSearchInput = document.querySelector('.enhanced-search-input') as HTMLInputElement;
          if (newSearchInput && searchValue) {
            newSearchInput.value = searchValue;
          }
          
          // 检查当前是否在 Volatility2 区域，尝试应用存储的 Profile 信息
          const areas = this.sidebarRenderer.getAreas();
          const currentArea = areas[this.state.selectedAvatar];
          const currentAreaName = currentArea?.getConfig?.()?.name;
          if (currentAreaName === 'Volatility2' || currentAreaName === 'Volatility2(手动版本)') {
            // 延迟执行以确保 DOM 完全渲染
            setTimeout(() => {
              ProfileManager.checkAndApplyProfileInfo();
            }, 50);
          }

          // 初始化V2工作区事件 (如果是MemProcFS V2区域)
          setTimeout(() => {
            this.workspaceRenderer.initPostRenderEvents();
          }, 50);
        }
      }
    } catch (error) {
      console.error('更新主工作区失败:', error);
    }
  }

  public async refreshAreaIcons(): Promise<void> {
    await this.sidebarRenderer.refreshAreaIcons();
  }

  renderTitleBar(): string {
    return this.titleBarRenderer.render();
  }

  renderVerticalNavBar(): string {
    return this.navBarRenderer.render();
  }

  renderModernSidebar(): string {
    return ''; // Deprecated as per original file
  }

  updateImageStatusArea(): void {
    this.imageStatusRenderer.updateImageStatusArea();
  }

  updateImageLoadingStatus(status: 'loading' | 'completed' | 'error', message?: string) {
    this.imageStatusRenderer.updateImageLoadingStatus(status, message);
  }

  setImageLoadingEngine(engine: 'memprocfs' | 'memnixfs') {
    this.imageStatusRenderer.setLoadingEngine(engine);
  }

  async renderMainWorkspace(): Promise<string> {
    if (this.state.currentTab === 'registry-viewer') {
      return this.registryViewerInterface.render();
    }
    if (this.state.currentTab === 'event-viewer') {
      return this.eventViewerInterface.render();
    }
    if (this.state.currentTab === 'report-editor') {
      return this.reportEditorInterface.render();
    }
    if (this.state.currentTab === 'process-galaxy') {
      return this.processGalaxyInterface.render();
    }
    if (this.state.currentTab === 'timeline-galaxy') {
      return this.timelineGalaxyInterface.render();
    }
    if (this.state.currentTab === 'string-search') {
      return this.stringSearchPanel.render();
    }
    if (this.state.currentTab === 'ai-chat') {
      return this.aiChatRenderer.render();
    }
    if (this.state.currentTab === 'warnings') {
      return this.warningPage.render();
    }
    if (this.state.currentTab === 'terminal') {
      return `<div id="terminal-root" class="main-workspace" style="height: 100%; overflow: hidden;">${this.terminalInterface.render()}</div>`;
    }
    if (this.state.currentTab === 'logs') {
      return `<div id="log-page-root" class="main-workspace" style="height: 100%; overflow: hidden;">${this.logPage.render()}</div>`;
    }
    return this.workspaceRenderer.render();
  }

  renderMainWorkspaceSync(): string {
    return this.workspaceRenderer.renderSync();
  }

  renderFilesList(): string {
    return this.filesRenderer.renderList();
  }

  updateFilesPreview(
    files: Array<{ name: string; size: number; is_dir: boolean; modified: string; extension: string }> = [],
    errorMessage?: string
  ): void {
    this.filesRenderer.updateFilesPreview(files, errorMessage);
  }

  renderCommandPreview(): string {
    return this.commandPreviewRenderer.render();
  }

  renderStatusBar(): string {
    return this.statusBarRenderer.render();
  }

  renderAnalysisPanel(): string {
    return this.workspaceRenderer.renderAnalysisPanel();
  }

  renderFloatingActions(): string {
    return ''; // Empty as per original
  }

  renderProgressIndicator(): string {
    return ''; // Empty as per original
  }

  demonstrateImageAnimations(): void {
    this.imageStatusRenderer.demonstrateImageAnimations();
  }

  bindImageInfoClickEvent(): void {
    this.imageStatusRenderer.bindImageInfoClickEvent();
  }

  // Private helper that was used in multiple places
  private isFilePath(str: string): boolean {
    if (!str) return false;
    return str.startsWith('/') ||
      str.startsWith('\\') ||
      /^[a-zA-Z]:/.test(str) ||
      str.includes('\\') ||
      str.includes('/');
  }
}
