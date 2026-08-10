import { LovelymemApp } from '../../core/app';
import { Vol2EventHandler } from '../vol2event';
import { Vol3EventHandler } from '../vol3event';
import { Vol3LinuxEventHandler } from '../vol3linuxEventHandler';
import { MemProcFSEventHandler } from '../memprocfsevent';
import { ToolsArea } from '../../areas/toolsArea';
import { toolsManager } from '../../tools/toolsManager';
import { scriptManagementUI } from '../../scripts';
import { ProcessManager } from '../processManager';
import { invoke } from '@tauri-apps/api/core';
import { StateManager } from '../../core/stateManager';
import { ModernUIRenderer } from '../modernUIRenderer';
import { iconSelector } from '../iconSelector';

import { MessageManager } from '../../utils/message';
import { translate } from '../../../i18n';

export class FeatureEvents {
  private app: LovelymemApp;
  private stateManager: StateManager;
  private updateStatus: (text: string) => void;
  private modernUIRenderer: ModernUIRenderer;

  private vol2EventHandler: Vol2EventHandler;
  private vol3EventHandler: Vol3EventHandler;
  private vol3LinuxEventHandler: Vol3LinuxEventHandler;
  private memProcFSEventHandler: MemProcFSEventHandler;

  constructor(
    app: LovelymemApp,
    stateManager: StateManager,
    updateStatus: (text: string) => void,
    modernUIRenderer: ModernUIRenderer
  ) {
    this.app = app;
    this.stateManager = stateManager;
    this.updateStatus = updateStatus;
    this.modernUIRenderer = modernUIRenderer;

    this.vol2EventHandler = new Vol2EventHandler(app);
    this.vol3EventHandler = new Vol3EventHandler(app);
    this.vol3LinuxEventHandler = new Vol3LinuxEventHandler(app);
    this.memProcFSEventHandler = new MemProcFSEventHandler(app);
  }

  /**
   * 公共方法：触发功能执行（供外部调用）
   */
  triggerFeature(feature: string): void {
    this.handleFeatureClick(feature).catch(error => {
      console.error('处理功能点击失败:', error);
    });
  }

  /**
   * 处理功能点击
   */
  async handleFeatureClick(feature: string | null): Promise<void> {
    console.trace('handleFeatureClick 调用堆栈:');

    if (!feature) return;

    // 防重复点击保护 - 检查功能卡片是否正在运行中
    const featureCard = document.querySelector(`[data-feature="${feature}"]`);
    if (featureCard && (featureCard.classList.contains('vol2-running') || featureCard.classList.contains('memprocfs-running'))) {
      return;
    }

    // 检查是否是 Volatility2 功能
    if (Vol2EventHandler.isVol2Feature(feature)) {
      this.vol2EventHandler.handleVol2Feature(feature);
      return;
    }

    // 检查是否是 Volatility3 功能
    if (Vol3EventHandler.isVol3Feature(feature)) {
      this.vol3EventHandler.handleVol3Feature(feature);
      return;
    }

    // 检查是否是 Vol3Linux 功能
    if (feature.startsWith('vol3linux-')) {
      this.vol3LinuxEventHandler.handleVol3LinuxFeatureClick(feature);
      return;
    }

    // 检查是否是 MemNixFS（Linux 内存取证）功能
    if (feature.startsWith('memnixfs-')) {
      this.app.featureHandlers.handleMemNixFSFeature(feature);
      return;
    }

    // 检查是否是 MemProcFS 功能
    if (MemProcFSEventHandler.isMemProcFSFeature(feature)) {
      this.memProcFSEventHandler.handleMemProcFSFeature(feature);
      return;
    }

    // 检查是否是自定义工具功能
    if (this.isCustomToolFeature(feature)) {
      this.handleCustomToolFeature(feature);
      return;
    }

    // 处理通用功能
    switch (feature) {
      case 'load-image':
        await this.app.loadImageFile();
        break;
      case 'load-image-windows':
        await this.app.loadImageFile('windows');
        break;
      case 'load-image-linux':
        await this.app.loadImageFile('linux');
        break;
      case 'unload-image':
        await this.app.unloadImageFile();
        break;
      case 'show-commands':
        this.app.toggleCommandWindow();
        break;
      case 'csv-reader':
        this.app.featureHandlers.handleCSVReaderFeature();
        break;
      case 'text-viewer':
        this.app.featureHandlers.handleTextViewerFeature();
        break;
      case 'ai-chat':
        this.handleAIChatFeature();
        break;
      case 'memory-file-browser':
        if (this.app.featureHandlers && typeof this.app.featureHandlers.handleMemoryFileBrowserFeature === 'function') {
          this.app.featureHandlers.handleMemoryFileBrowserFeature();
        } else {
          console.error('handleMemoryFileBrowserFeature 不是一个函数');
          this.updateStatus('内存文件浏览器功能暂时不可用');
        }
        break;
      case 'string-search':
        this.handleStringSearchFeature();
        break;

      case 'exif-viewer':
        if (this.app.featureHandlers && typeof this.app.featureHandlers.handleEXIFViewerFeature === 'function') {
          this.app.featureHandlers.handleEXIFViewerFeature();
        } else {
          console.error('handleEXIFViewerFeature 不是一个函数');
          this.updateStatus('EXIF查看器功能暂时不可用');
        }
        break;

      case 'image-finder':
        this.handleImageFinderFeature();
        break;

      case 'sqlite-viewer':
        this.handleSqliteViewerFeature();
        break;

      case 'hex-viewer':
        this.handleHexViewerFeature();
        break;

      case 'ioc-extractor':
        this.handleIocExtractorFeature();
        break;

      case 'registry-forensics':
        this.handleRegistryForensicsFeature();
        break;

      case 'stegsolve-analyzer':
        this.handleStegsolveAnalyzerFeature();
        break;

      case 'memory-image-visualizer':
        this.handleMemoryImageVisualizerFeature();
        break;

      case 'super-timeline':
        this.handleSuperTimelineFeature();
        break;

      default:
        this.updateStatus(`功能开发中: ${feature}`);
    }
  }

  /**
   * 处理标题栏操作
   */
  async handleTitleBarAction(action: string | null): Promise<void> {
    switch (action) {
      case 'load-image':
        await this.app.loadImageFile();
        break;
      case 'load-image-windows':
        await this.app.loadImageFile('windows');
        break;
      case 'load-image-linux':
        await this.app.loadImageFile('linux');
        break;
      case 'unload-image':
        await this.app.unloadImageFile();
        break;
      case 'enter-without-image':
        await this.enterWithoutImage();
        break;
      case 'show-commands':
        this.app.toggleCommandWindow();
        break;
      case 'show-terminal':
        this.toggleTerminalWindow();
        break;
      case 'open-file-manager':
        this.toggleFilePanel();
        break;
      case 'open-theme-editor':
        await this.app.openThemeEditor();
        break;
      case 'toggle-theme':
        this.app.toggleTheme().catch(error => {
          console.error('主题切换失败:', error);
        });
        break;
      case 'show-script-manager':
        this.toggleScriptManager();
        break;
      case 'show-process-manager':
        this.toggleProcessManager();
        break;
      default:
        //console.log('未知标题栏操作:', action);
    }
  }

  /**
   * 处理设置主题操作
   */
  async handleSetThemeAction(theme: string): Promise<void> {
    try {
      await this.app.setTheme(theme);
    } catch (error) {
      console.error('设置主题失败:', error);
      this.updateStatus('设置主题失败');
    }
  }

  /**
   * 不加载内存直接进入主界面
   * 设置一个虚拟的镜像信息以跳过欢迎页面
   */
  private async enterWithoutImage(): Promise<void> {
    try {
      // 设置一个虚拟的镜像信息，表示无镜像模式
      const virtualImageInfo = {
        path: '',
        name: '未加载镜像',
        size: 0
      };

      this.stateManager.setCurrentImage(virtualImageInfo);
      this.updateStatus('已进入无镜像模式');

      // 同步状态到 modernUIRenderer
      (window as any).modernUIRenderer?.updateState(this.stateManager.getState());

      // 更新主工作区显示
      await this.modernUIRenderer.updateMainWorkspace();

      console.log('✅ 已进入无镜像模式');
    } catch (error) {
      console.error('进入无镜像模式失败:', error);
      this.updateStatus('进入失败');
    }
  }

  /**
   * 处理文件操作
   */
  handleFileAction(action: string | null): void {
    switch (action) {
      case 'add-file':
        // this.addSampleFiles();
        break;
      case 'clear-files':
        // this.clearFiles();
        break;
      default:
        //console.log('未知文件操作:', action);
    }
  }

  /**
   * 检查是否是自定义工具功能
   */
  private isCustomToolFeature(feature: string): boolean {
    return feature.startsWith('custom-tool-');
  }

  /**
   * 处理自定义工具功能点击
   */
  private async handleCustomToolFeature(feature: string): Promise<void> {
    try {
      const toolId = ToolsArea.extractToolIdFromFeature(feature);
      //const result = await toolsManager.executeTool(toolId, {});
      this.updateStatus(`工具执行完成: ${toolId}`);
    } catch (error) {
      console.error('执行自定义工具失败:', error);
      this.updateStatus(`工具执行失败: ${error}`);
    }
  }

  /**
   * 处理AI智能助手功能点击
   */
  private async handleAIChatFeature(): Promise<void> {
    try {
      const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');

      new WebviewWindow(`ai-chat-${Date.now()}`, {
        url: 'ai_chat.html',
        title: 'AI 智能助手 - AI Assistant',
        width: 1600,
        height: 1000,
        minWidth: 1000,
        minHeight: 700,
        resizable: true,
        decorations: false,
        transparent: false,
        alwaysOnTop: false,
        center: true,
        skipTaskbar: false
      });

      this.updateStatus('AI智能助手已打开');

    } catch (error) {
      console.error('打开AI智能助手失败:', error);
      this.updateStatus('无法打开AI智能助手');
    }
  }

  /**
   * 处理字符串搜索功能
   */
  private async handleStringSearchFeature(): Promise<void> {
    try {
      console.log('🔤 启动字符串搜索功能');
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('open_string_search_window');
      this.updateStatus('字符串搜索窗口已打开');

    } catch (error) {
      console.error('❌ 启动字符串搜索功能失败:', error);
      this.updateStatus('启动字符串搜索功能失败: ' + error);
    }
  }

  /**
   * 处理 SQLite 查看器功能：选择一个数据库文件后以只读方式打开查看器窗口
   */
  private async handleSqliteViewerFeature(): Promise<void> {
    try {
      console.log('🗃️ 启动 SQLite 查看器');
      const { invoke } = await import('@tauri-apps/api/core');
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        multiple: false,
        filters: [
          { name: translate('SQLite 数据库'), extensions: ['db', 'sqlite', 'sqlite3', 'db3', 'dat'] },
          { name: translate('所有文件'), extensions: ['*'] },
        ],
      });
      // 未选择文件时仍打开空窗口，允许用户在窗口内再选
      const dbPath = typeof selected === 'string' ? selected : '';
      await invoke('open_sqlite_viewer_window', { dbPath });
      this.updateStatus('SQLite 查看器已打开');

    } catch (error) {
      console.error('❌ 启动 SQLite 查看器失败:', error);
      this.updateStatus('启动 SQLite 查看器失败: ' + error);
    }
  }

  /**
   * 处理注册表取证功能：选择一份 Vol3 导出的注册表 CSV 后打开取证专项视图
   */
  private async handleRegistryForensicsFeature(): Promise<void> {
    try {
      console.log('📊 启动注册表取证');
      const { invoke } = await import('@tauri-apps/api/core');
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        multiple: false,
        filters: [
          { name: 'CSV', extensions: ['csv'] },
          { name: translate('所有文件'), extensions: ['*'] },
        ],
      });
      const csvPath = typeof selected === 'string' ? selected : '';
      await invoke('open_registry_forensics_window', { csvPath });
      this.updateStatus('注册表取证窗口已打开');

    } catch (error) {
      console.error('❌ 启动注册表取证失败:', error);
      this.updateStatus('启动注册表取证失败: ' + error);
    }
  }

  /**
   * 处理 Hex 查看器功能：选择文件后以分块懒加载方式查看十六进制
   */
  private async handleHexViewerFeature(): Promise<void> {
    try {
      console.log('🔢 启动 Hex 查看器');
      const { invoke } = await import('@tauri-apps/api/core');
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({ multiple: false });
      if (typeof selected !== 'string') return;
      await invoke('open_hex_viewer_window', { filePath: selected, offset: null });
      this.updateStatus('Hex 查看器已打开');

    } catch (error) {
      console.error('❌ 启动 Hex 查看器失败:', error);
      this.updateStatus('启动 Hex 查看器失败: ' + error);
    }
  }

  /**
   * 处理 IOC 提取功能
   */
  private async handleIocExtractorFeature(): Promise<void> {
    try {
      console.log('🛡️ 启动 IOC 提取');
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('open_ioc_extractor_window');
      this.updateStatus('IOC 提取窗口已打开');

    } catch (error) {
      console.error('❌ 启动 IOC 提取失败:', error);
      this.updateStatus('启动 IOC 提取失败: ' + error);
    }
  }

  /**
   * 处理Image Finder功能
   */
  private async handleImageFinderFeature(): Promise<void> {
    try {
      console.log('🖼️ 启动Image Finder功能');
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('open_image_finder_window');
      this.updateStatus('Image Finder窗口已打开');

    } catch (error) {
      console.error('❌ 启动Image Finder功能失败:', error);
      this.updateStatus('启动Image Finder功能失败');
      MessageManager.showError('启动Image Finder功能失败: ' + (error as Error).message);
    }
  }

  /**
   * 处理Stegsolve分析器功能
   */
  private async handleStegsolveAnalyzerFeature(): Promise<void> {
    try {
      console.log('🔍 启动Stegsolve分析器功能');
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('open_stegsolve_analyzer_window');
      this.updateStatus('Stegsolve分析器窗口已打开');

    } catch (error) {
      console.error('❌ 启动Stegsolve分析器功能失败:', error);
      this.updateStatus('启动Stegsolve分析器功能失败');
      MessageManager.showError('启动Stegsolve分析器功能失败: ' + (error as Error).message);
    }
  }

  /**
   * 处理内存图像可视化功能（打开空白窗口，手动选文件）
   */
  private async handleMemoryImageVisualizerFeature(): Promise<void> {
    try {
      console.log('🧩 启动内存图像可视化功能');
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('open_memory_image_visualizer_window', {});
      this.updateStatus('内存图像可视化窗口已打开');

    } catch (error) {
      console.error('❌ 启动内存图像可视化功能失败:', error);
      this.updateStatus('启动内存图像可视化功能失败');
      MessageManager.showError('启动内存图像可视化功能失败: ' + (error as Error).message);
    }
  }

  /**
   * 处理Super Timeline功能
   */
  private async handleSuperTimelineFeature(): Promise<void> {
    try {
      console.log('启动 Super Timeline 功能');
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('open_super_timeline_window');
      this.updateStatus('Super Timeline 窗口已打开');

    } catch (error) {
      console.error('启动 Super Timeline 功能失败:', error);
      this.updateStatus('启动 Super Timeline 功能失败');
      MessageManager.showError('启动 Super Timeline 功能失败: ' + (error as Error).message);
    }
  }

  /**
   * 切换文件面板
   */
  toggleFilePanel(): void {
    import('../filePanelManager').then(({ FilePanelManager }) => {
      const filePanelManager = new FilePanelManager((message) => this.updateStatus(message));
      filePanelManager.createFilePanel();
    });
  }

  /**
   * 打开独立文件管理器窗口
   */
  async openStandaloneFileManager(): Promise<void> {
    import('../filePanelManager').then(({ FilePanelManager }) => {
      const filePanelManager = new FilePanelManager((message) => this.updateStatus(message));
      filePanelManager.openStandaloneFileManager();
    });
  }

  /**
   * 切换脚本管理器
   */
  toggleScriptManager(): void {
    console.log('🐍 切换脚本管理器');
    const scriptBtn = document.querySelector('.status-action-btn.script-manager') as HTMLElement;
    if (scriptBtn) {
      scriptBtn.style.opacity = '0.6';
      scriptBtn.style.pointerEvents = 'none';
    }
    this.updateStatus('正在打开脚本管理器...');

    try {
      scriptManagementUI.toggleWindow();
      const isNowVisible = scriptManagementUI.getVisibleState();
      this.updateStatus(isNowVisible ? '脚本管理器已打开' : '脚本管理器已关闭');
    } catch (error) {
      console.error('❌ 脚本管理器操作失败:', error);
      this.updateStatus('脚本管理器操作失败');
    } finally {
      if (scriptBtn) {
        scriptBtn.style.opacity = '1';
        scriptBtn.style.pointerEvents = 'auto';
      }
    }
  }

  /**
   * 切换进程管理器
   */
  toggleProcessManager(): void {
    console.log('⚙️ 切换进程管理器');
    const processBtn = document.querySelector('.status-action-btn.process-manager') as HTMLElement;
    if (processBtn) {
      processBtn.style.opacity = '0.6';
      processBtn.style.pointerEvents = 'none';
    }
    this.updateStatus('正在打开进程管理器...');

    try {
      const processManager = new ProcessManager();
      processManager.toggleProcessManager();
      this.updateStatus('进程管理器已打开');
    } catch (error) {
      console.error('❌ 进程管理器操作失败:', error);
      this.updateStatus('进程管理器操作失败');
    } finally {
      if (processBtn) {
        processBtn.style.opacity = '1';
        processBtn.style.pointerEvents = 'auto';
      }
    }
  }

  /**
   * 切换终端窗口
   */
  toggleTerminalWindow(): void {
    const existingTerminal = document.querySelector('.terminal-window');
    if (existingTerminal) {
      existingTerminal.remove();
      return;
    }

    import('../terminalManager').then(({ TerminalManager }) => {
      const terminalManager = new TerminalManager(this.stateManager, (message) => this.updateStatus(message));
      terminalManager.createTerminalWindow();
    }).catch(error => {
      console.error('加载终端管理器失败:', error);
      this.updateStatus('终端功能加载失败');
    });
  }

  /**
   * 显示添加工具对话框
   */
  showAddToolDialog(): void {
    // 创建遮罩层
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
    `;

    // 创建对话框
    const dialog = document.createElement('div');
    dialog.className = 'add-tool-dialog';
    dialog.style.cssText = `
      background: white;
      border-radius: 12px;
      padding: 24px;
      width: 500px;
      max-width: 90vw;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
    `;

    dialog.innerHTML = `
      <div class="dialog-header">
        <h2 style="margin: 0 0 16px 0; color: #333; font-size: 18px;">➕ 添加自定义工具</h2>
        <button class="close-btn" style="position: absolute; top: 16px; right: 16px; background: none; border: none; font-size: 20px; cursor: pointer; color: #666;">×</button>
      </div>
      <form class="add-tool-form">
        <div class="form-group" style="margin-bottom: 16px;">
          <label style="display: block; margin-bottom: 4px; font-weight: 500; color: #555;">工具图标</label>
          <div style="display: flex; gap: 8px; align-items: center;">
            <input type="text" name="icon" placeholder="🔧" style="flex: 1; padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px;" required>
            <button type="button" class="select-icon-btn" style="padding: 8px 12px; border: 1px solid #ddd; background: #f8f9fa; border-radius: 6px; cursor: pointer; white-space: nowrap;">选择图标</button>
          </div>
          <div style="font-size: 12px; color: #666; margin-top: 4px;">💡 可以直接输入emoji或点击"选择图标"从预设中选择</div>
        </div>
        <div class="form-group" style="margin-bottom: 16px;">
          <label style="display: block; margin-bottom: 4px; font-weight: 500; color: #555;">工具名称</label>
          <input type="text" name="name" placeholder="我的工具" style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px;" required>
        </div>
        <div class="form-group" style="margin-bottom: 16px;">
          <label style="display: block; margin-bottom: 4px; font-weight: 500; color: #555;">工具描述</label>
          <textarea name="description" placeholder="工具的功能描述" style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; resize: vertical; min-height: 60px;" required></textarea>
        </div>
        <div class="form-group" style="margin-bottom: 16px;">
          <label style="display: block; margin-bottom: 4px; font-weight: 500; color: #555;">命令路径</label>
          <div style="display: flex; gap: 8px;">
            <input type="text" name="command" placeholder="C:\\path\\to\\tool.exe" style="flex: 1; padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px;" required>
            <button type="button" class="browse-command-btn" style="padding: 8px 12px; border: 1px solid #ddd; background: #f8f9fa; border-radius: 6px; cursor: pointer; white-space: nowrap;">浏览...</button>
          </div>
          <div style="font-size: 12px; color: #666; margin-top: 4px;">💡 支持 .exe、.bat、.cmd、.ps1、.py 等可执行文件</div>
        </div>
        <div class="form-group" style="margin-bottom: 16px;">
          <label style="display: block; margin-bottom: 4px; font-weight: 500; color: #555;">命令参数</label>
          <textarea name="arguments" placeholder="--input {current_image_path} --output {output_path}/result_{timestamp}.txt" style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; resize: vertical; min-height: 60px;"></textarea>
          <div style="font-size: 12px; color: #666; margin-top: 4px;">💡 可以使用下方的变量，点击变量名可快速插入</div>
        </div>
        ${this.generateVariablesSection()}
        ${this.generateCategorySection()}
        <div class="form-actions" style="display: flex; gap: 12px; justify-content: flex-end;">
          <button type="button" class="cancel-btn" style="padding: 8px 16px; border: 1px solid #ddd; background: white; border-radius: 6px; cursor: pointer;">取消</button>
          <button type="submit" class="save-btn" style="padding: 8px 16px; border: none; background: #007bff; color: white; border-radius: 6px; cursor: pointer;">保存</button>
        </div>
      </form>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // 添加事件监听器
    const closeBtn = dialog.querySelector('.close-btn');
    const cancelBtn = dialog.querySelector('.cancel-btn');
    const form = dialog.querySelector('.add-tool-form') as HTMLFormElement;
    const browseBtn = dialog.querySelector('.browse-command-btn');
    const selectIconBtn = dialog.querySelector('.select-icon-btn');
    const commandInput = dialog.querySelector('input[name="command"]') as HTMLInputElement;
    const iconInput = dialog.querySelector('input[name="icon"]') as HTMLInputElement;
    const argumentsTextarea = dialog.querySelector('textarea[name="arguments"]') as HTMLTextAreaElement;

    const closeDialog = () => {
      overlay.remove();
    };

    closeBtn?.addEventListener('click', closeDialog);
    cancelBtn?.addEventListener('click', closeDialog);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeDialog();
    });

    // 浏览文件按钮事件
    browseBtn?.addEventListener('click', async () => {
      try {
        const selectedPath = await invoke('select_file_path', {
          title: translate('选择工具程序'),
          filters: ['exe', 'bat', 'cmd', 'ps1', 'py']
        }) as string;

        if (selectedPath) {
          commandInput.value = selectedPath;
        }
      } catch (error) {
        console.error('选择文件失败:', error);
        this.updateStatus('选择文件失败: ' + error);
      }
    });

    // 图标选择按钮事件
    selectIconBtn?.addEventListener('click', async () => {
      await this.showToolIconSelector(iconInput);
    });

    // 设置分类选择事件
    this.setupCategoryEvents(dialog);

    // 变量点击事件
    dialog.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('var-item')) {
        const varName = target.textContent?.trim();
        if (varName && argumentsTextarea) {
          this.insertVariableToTextarea(argumentsTextarea, varName);
        }
      }
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      // 验证自定义分类
      const categoryHidden = form.querySelector('input[name="category"]') as HTMLInputElement;
      const categorySelect = form.querySelector('select[name="category-select"]') as HTMLSelectElement;

      if (categorySelect.value === 'custom' && !categoryHidden.value.trim()) {
        this.updateStatus('请输入自定义分类名称');
        return;
      }

      await this.handleAddToolSubmit(form, closeDialog);
    });
  }

  /**
   * 生成变量说明部分
   */
  private generateVariablesSection(): string {
    return `
      <div class="form-group" style="margin-bottom: 16px; background: #f8f9fa; padding: 12px; border-radius: 6px; border: 1px dashed #ddd;">
        <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #555; font-size: 13px;">可用变量 (点击插入)</label>
        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
          <span class="var-item" style="background: #e3f2fd; color: #1976d2; padding: 4px 8px; border-radius: 4px; font-size: 12px; cursor: pointer; border: 1px solid #bbdefb;">{current_image_path}</span>
          <span class="var-item" style="background: #e3f2fd; color: #1976d2; padding: 4px 8px; border-radius: 4px; font-size: 12px; cursor: pointer; border: 1px solid #bbdefb;">{output_path}</span>
          <span class="var-item" style="background: #e3f2fd; color: #1976d2; padding: 4px 8px; border-radius: 4px; font-size: 12px; cursor: pointer; border: 1px solid #bbdefb;">{timestamp}</span>
          <span class="var-item" style="background: #e3f2fd; color: #1976d2; padding: 4px 8px; border-radius: 4px; font-size: 12px; cursor: pointer; border: 1px solid #bbdefb;">{app_dir}</span>
        </div>
      </div>
    `;
  }

  /**
   * 生成分类选择部分
   */
  private generateCategorySection(): string {
    return `
      <div class="form-group" style="margin-bottom: 16px;">
        <label style="display: block; margin-bottom: 4px; font-weight: 500; color: #555;">工具分类</label>
        <div style="display: flex; gap: 8px;">
          <select name="category-select" style="flex: 1; padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px;">
            <option value="system">系统工具</option>
            <option value="analysis">分析工具</option>
            <option value="network">网络工具</option>
            <option value="file">文件工具</option>
            <option value="other">其他工具</option>
            <option value="custom">自定义...</option>
          </select>
          <input type="text" name="category" value="system" style="display: none; flex: 1; padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px;" placeholder="输入分类名称">
        </div>
      </div>
    `;
  }

  /**
   * 设置分类选择事件
   */
  private setupCategoryEvents(dialog: HTMLElement): void {
    const categorySelect = dialog.querySelector('select[name="category-select"]') as HTMLSelectElement;
    const categoryInput = dialog.querySelector('input[name="category"]') as HTMLInputElement;

    if (categorySelect && categoryInput) {
      categorySelect.addEventListener('change', () => {
        if (categorySelect.value === 'custom') {
          categoryInput.style.display = 'block';
          categoryInput.value = '';
          categoryInput.focus();
        } else {
          categoryInput.style.display = 'none';
          categoryInput.value = categorySelect.value;
        }
      });

      categoryInput.addEventListener('input', () => {
        // 保持 input 的值
      });
    }
  }

  /**
   * 插入变量到文本框
   */
  private insertVariableToTextarea(textarea: HTMLTextAreaElement, variable: string): void {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const before = text.substring(0, start);
    const after = text.substring(end, text.length);

    textarea.value = before + variable + after;
    textarea.selectionStart = textarea.selectionEnd = start + variable.length;
    textarea.focus();
  }

  /**
   * 显示工具图标选择器
   */
  private async showToolIconSelector(inputElement: HTMLInputElement): Promise<void> {
    const currentIcon = inputElement.value;
    iconSelector.show('tool-icon', currentIcon, (newIcon: string) => {
      inputElement.value = newIcon;
    });
  }

  /**
   * 处理添加工具表单提交
   */
  private async handleAddToolSubmit(form: HTMLFormElement, closeDialog: () => void): Promise<void> {
    const formData = new FormData(form);

    const toolData = {
      name: formData.get('name') as string,
      description: formData.get('description') as string,
      command: formData.get('command') as string,
      arguments: formData.get('arguments') as string || '',
      icon: formData.get('icon') as string,
      category: formData.get('category') as string,
      enabled: true
    };

    try {
      await toolsManager.addTool(toolData);

      // 刷新工具区域显示
      await this.refreshToolsArea();

      closeDialog();
      this.updateStatus('工具添加成功');
    } catch (error) {
      console.error('添加工具失败:', error);
      this.updateStatus('添加工具失败: ' + error);
    }
  }

  /**
   * 刷新工具区域显示
   */
  private async refreshToolsArea(): Promise<void> {
    // 检查当前是否在小工具区域
    if (this.isInToolsArea()) {
      // 重新渲染当前区域
      await this.modernUIRenderer.updateMainWorkspace();
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
}

