/**
 * 文件面板管理器
 * 处理文件面板的所有交互功能
 */

import { invoke } from '@tauri-apps/api/core';
import { loadAppSettings } from '../core/settingsHelper';
import { getMountLetter, getMountRootSlash } from '../core/mountDrive';
import { showConfirm } from '../core/confirmDialog';
import { MessageManager } from '../utils/message';
import { IconParkHelper } from '../utils/iconparkHelper';

export interface FileItem {
  name: string;
  size: number;
  is_dir: boolean;
  modified: string;
  created: string;
  extension: string;
}

export interface FilePanelConfig {
  currentPath: string;
  showHiddenFiles: boolean;
  sortBy: 'name' | 'size' | 'created';
  sortOrder: 'asc' | 'desc';
}

export class FilePanelManager {
  private currentPath: string = '';
  private config: FilePanelConfig;
  private contextMenu: HTMLElement | null = null;
  private updateStatusCallback?: (message: string) => void;
  private originalFileList: FileItem[] = [];
  private currentSearchQuery: string = ''; // 保存当前的搜索关键字

  constructor(updateStatusCallback?: (message: string) => void) {
    this.updateStatusCallback = updateStatusCallback;
    this.config = {
      currentPath: '',
      showHiddenFiles: false,
      sortBy: 'name',
      sortOrder: 'asc',
      ...this.loadPersistedConfig()
    };
    this.bindGlobalEvents();
  }

  private static readonly PREFS_KEY = 'filePanel.prefs';

  /** 读取持久化的文件面板偏好（排序/隐藏文件），失败返回空对象 */
  private loadPersistedConfig(): Partial<FilePanelConfig> {
    try {
      const raw = localStorage.getItem(FilePanelManager.PREFS_KEY);
      if (!raw) return {};
      const saved = JSON.parse(raw) as Partial<FilePanelConfig>;
      const result: Partial<FilePanelConfig> = {};
      if (saved.sortBy === 'name' || saved.sortBy === 'size' || saved.sortBy === 'created') {
        result.sortBy = saved.sortBy;
      }
      if (saved.sortOrder === 'asc' || saved.sortOrder === 'desc') {
        result.sortOrder = saved.sortOrder;
      }
      if (typeof saved.showHiddenFiles === 'boolean') {
        result.showHiddenFiles = saved.showHiddenFiles;
      }
      return result;
    } catch {
      return {};
    }
  }

  /** 持久化文件面板偏好（排序与隐藏文件开关），下次打开沿用 */
  private savePersistedConfig(): void {
    try {
      localStorage.setItem(FilePanelManager.PREFS_KEY, JSON.stringify({
        sortBy: this.config.sortBy,
        sortOrder: this.config.sortOrder,
        showHiddenFiles: this.config.showHiddenFiles
      }));
    } catch {
      // localStorage 不可用时忽略
    }
  }

  /**
   * 打开独立文件管理器窗口
   */
  async openStandaloneFileManager(): Promise<void> {
    try {
      await invoke('open_file_manager');
      this.updateStatus('文件管理器窗口已打开');
    } catch (error) {
      console.error('打开文件管理器窗口失败:', error);
      this.updateStatus('打开文件管理器窗口失败');
    }
  }

  /**
   * 创建文件面板
   */
  async createFilePanel(): Promise<void> {
    try {
      // 检查是否已存在文件面板
      const existingPanel = document.getElementById('file-panel');
      if (existingPanel) {
        existingPanel.remove();
        return;
      }

      // 获取用户设置中的输出路径
      const settings = await loadAppSettings();
      const outputPath = settings.output_path || 'output';
      this.currentPath = outputPath;
      this.config.currentPath = outputPath;
      
      // 获取文件列表
      const files = await invoke('get_file_list', { path: outputPath }) as FileItem[];
      
      // 保存原始文件列表
      this.updateOriginalFileList(files);

      // 创建文件面板
      const panel = document.createElement('div');
      panel.id = 'file-panel';
      panel.className = 'file-panel';
      
      panel.innerHTML = this.generatePanelHTML(outputPath, files);

      // 添加到页面
      document.body.appendChild(panel);

      // 绑定事件
      this.bindFilePanelEvents(panel);
      this.bindNavigationEvents(panel);

      // 显示动画
      setTimeout(() => {
        panel.classList.add('visible');
      }, 10);

    } catch (error) {
      console.error('创建文件面板失败:', error);
      this.updateStatus('获取文件列表失败');
    }
  }

  /**
   * 生成面板HTML
   */
  private generatePanelHTML(currentPath: string, files: FileItem[]): string {
    return `
      <div class="file-panel-resize-handle" title="拖拽调整宽度"></div>
      <div class="file-panel-header">
        <div class="file-panel-navigation">
          <button class="nav-btn back-btn" title="返回上一级" data-action="go-back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <div class="breadcrumb-container">
            ${this.generateBreadcrumbs(currentPath)}
          </div>
        </div>
        <button class="file-panel-close-btn" title="关闭文件面板" data-action="close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="file-panel-controls">
          <div class="search-container">
            <button class="search-mode-toggle" title="切换搜索模式" data-mode="filename">
              <svg class="mode-icon-filename" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14,2 14,8 20,8"/>
              </svg>
              <svg class="mode-icon-content" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none;">
                <circle cx="11" cy="11" r="8"/>
                <path d="m21 21-4.35-4.35"/>
              </svg>
            </button>
            <input type="text" class="search-input" placeholder="搜索文件名..." />
            <button class="search-clear" title="清空搜索">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
            <div class="search-dropdown" style="display: none;">
              <div class="search-dropdown-header">
                <span class="search-result-count">找到 0 个结果</span>
              </div>
              <div class="search-dropdown-list"></div>
            </div>
          </div>
          <div class="sort-controls">
            <button class="sort-btn ${this.config.sortBy === 'name' ? 'active' : ''}" data-sort="name" title="按文件名排序">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 6h18M7 12h10m-7 6h4"/>
              </svg>
              <span>名称</span>
              ${this.config.sortBy === 'name' ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="sort-indicator ${this.config.sortOrder}">
                <polyline points="${this.config.sortOrder === 'asc' ? '6 9 12 15 18 9' : '18 15 12 9 6 15'}"/>
              </svg>` : ''}
            </button>
            <button class="sort-btn ${this.config.sortBy === 'size' ? 'active' : ''}" data-sort="size" title="按文件大小排序">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
              </svg>
              <span>大小</span>
              ${this.config.sortBy === 'size' ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="sort-indicator ${this.config.sortOrder}">
                <polyline points="${this.config.sortOrder === 'asc' ? '6 9 12 15 18 9' : '18 15 12 9 6 15'}"/>
              </svg>` : ''}
            </button>
            <button class="sort-btn ${this.config.sortBy === 'created' ? 'active' : ''}" data-sort="created" title="按创建时间排序">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <span>时间</span>
              ${this.config.sortBy === 'created' ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="sort-indicator ${this.config.sortOrder}">
                <polyline points="${this.config.sortOrder === 'asc' ? '6 9 12 15 18 9' : '18 15 12 9 6 15'}"/>
              </svg>` : ''}
            </button>
          </div>
          <div class="action-buttons">
            <button class="action-btn danger-btn" title="清空输出目录" data-action="clear-output">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 6h18"/>
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                <line x1="10" y1="11" x2="10" y2="17"/>
                <line x1="14" y1="11" x2="14" y2="17"/>
              </svg>
            </button>
            <button class="action-btn" title="刷新" data-action="refresh">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="23 4 23 10 17 10"/>
                <polyline points="1 20 1 14 7 14"/>
                <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
              </svg>
            </button>
            <button class="action-btn" title="切换到${getMountLetter()}盘" data-action="switch-m-drive">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21,15 16,10 5,21"/>
              </svg>
            </button>
            <button class="action-btn" title="切换到输出目录" data-action="switch-output">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14,2 14,8 20,8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10,9 9,9 8,9"/>
              </svg>
            </button>
          </div>
        </div>
      <div class="file-panel-content">
        <div class="file-list">
          ${this.renderFileList(files)}
        </div>
      </div>
    `;
  }

  /**
   * 生成面包屑导航
   */
  private generateBreadcrumbs(path: string): string {
    // 将路径转换为面包屑导航
    const normalizedPath = path.replace(/\\/g, '/');
    const parts = normalizedPath.split('/').filter(part => part.length > 0);

    let breadcrumbs = '';
    let currentPath = '';

    // 添加根目录
    if (parts.length > 0 && parts[0].includes(':')) {
      const drive = parts[0];
      currentPath = drive;
      breadcrumbs += `<button class="breadcrumb-item root" data-path="${drive}/" title="切换到${drive}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21,15 16,10 5,21"/>
        </svg>
        <span>${drive.toLowerCase()}</span>
      </button>`;

      // 处理剩余路径
      for (let i = 1; i < parts.length; i++) {
        currentPath += '/' + parts[i];
        const isLast = i === parts.length - 1;

        breadcrumbs += `
          <svg class="breadcrumb-separator" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
          <button class="breadcrumb-item ${isLast ? 'current' : ''}" data-path="${currentPath.replace(/\//g, '\\')}" title="切换到${parts[i]}">
            <span>${parts[i]}</span>
          </button>`;
      }
    } else {
      // 处理相对路径或其他格式
      breadcrumbs = `<span class="breadcrumb-text">${normalizedPath}</span>`;
    }

    return breadcrumbs;
  }

  /**
   * 渲染文件列表
   */
  private renderFileList(files: FileItem[]): string {
    if (files.length === 0) {
      return '<div class="file-list-empty">📄 当前目录为空</div>';
    }

    // 排序文件
    const sortedFiles = this.sortFiles(files);

    return sortedFiles.map(file => {
      const icon = this.getFileIcon(file);
      const size = file.is_dir ? '' : this.formatFileSize(file.size);
      
      return `
        <div class="file-item" data-filename="${file.name}" data-is-dir="${file.is_dir}" data-extension="${file.extension}">
          <div class="file-icon">${icon}</div>
          <div class="file-info">
            <div class="file-name">${file.name}</div>
            <div class="file-meta">
              ${size ? `<span class="file-size">${size}</span>` : ''}
            </div>
          </div>
          <div class="file-actions">
            ${!file.is_dir ? `
              <button class="file-action-btn" data-action="open-folder" title="打开目标文件夹">📂</button>
              ${file.extension.toLowerCase() === 'csv' ? `<button class="file-action-btn" data-action="view-csv" title="CSV查看器打开">📊</button>` : ''}
              ${this.isTextFile('.' + file.extension) ? `<button class="file-action-btn" data-action="view-text" title="文本查看器打开">📝</button>` : ''}
              ${this.isRegistryFile('.' + file.extension) ? `<button class="file-action-btn" data-action="view-registry" title="注册表查看器打开">📋</button>` : ''}
              ${this.isEvtxFile('.' + file.extension) ? `<button class="file-action-btn" data-action="view-evtx" title="EVTX查看器打开">📋</button>` : ''}
              <button class="file-action-btn delete-btn" data-action="delete-file" title="删除文件">🗑️</button>
            ` : `
              <button class="file-action-btn delete-btn" data-action="delete-file" title="删除目录">🗑️</button>
            `}
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * 排序文件
   */
  private sortFiles(files: FileItem[]): FileItem[] {
    return [...files].sort((a, b) => {
      // 目录始终在前
      if (a.is_dir && !b.is_dir) return -1;
      if (!a.is_dir && b.is_dir) return 1;

      let result = 0;
      switch (this.config.sortBy) {
        case 'name':
          result = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
          break;
        case 'size':
          result = a.size - b.size;
          break;
        case 'created':
          // created 字段是 Unix 时间戳（秒），需要转换为毫秒
          const timeA = parseInt(a.created) * 1000 || 0;
          const timeB = parseInt(b.created) * 1000 || 0;
          result = timeA - timeB;
          break;
      }

      return this.config.sortOrder === 'desc' ? -result : result;
    });
  }

  /**
   * 绑定文件面板事件
   */
  private bindFilePanelEvents(panel: HTMLElement): void {
    // 关闭按钮事件
    const closeBtn = panel.querySelector('.file-panel-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const action = closeBtn.getAttribute('data-action');
        await this.handleControlAction(action, panel);
      });
    }

    // 控制按钮事件 - 新样式按钮
    panel.querySelectorAll('.action-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const action = btn.getAttribute('data-action');
        //console.log('🔍 按钮点击事件:', action);
        await this.handleControlAction(action, panel);
      });
    });

    // // 工具栏按钮事件
    // panel.querySelectorAll('.action-btn').forEach(btn => {
    //   btn.addEventListener('click', async () => {
    //     const action = btn.getAttribute('data-action');
    //     await this.handleToolbarAction(action);
    //   });
    // });

    // 文件操作
    this.bindFileActions(panel);

    // 右键菜单
    this.bindContextMenu(panel);

    // 点击外部关闭
    this.bindOutsideClick(panel);

    // 拖拽调整宽度
    this.bindResizeHandle(panel);

    // 搜索功能
    this.bindSearchEvents(panel);

    // 排序功能
    this.bindSortEvents(panel);
  }

  /**
   * 处理控制按钮操作
   */
  private async handleControlAction(action: string | null, panel: HTMLElement): Promise<void> {
    switch (action) {
      case 'close':
        // 清空搜索关键字
        this.currentSearchQuery = '';
        panel.classList.remove('visible');
        setTimeout(() => panel.remove(), 300);
        break;
      case 'refresh':
        await this.refreshFileList(panel);
        break;
      case 'clear-output':
        await this.clearOutputDirectory(panel);
        break;
      case 'switch-m-drive':
        await this.switchToMDrive(panel);
        break;
      case 'switch-output':
        await this.switchToOutputDir(panel);
        break;
    }
  }

  /**
   * 切换到挂载盘
   */
  private async switchToMDrive(panel: HTMLElement): Promise<void> {
    const letter = getMountLetter();
    try {
      const mDrivePath = getMountRootSlash();
      const files = await invoke('get_file_list', { path: mDrivePath }) as FileItem[];

      this.currentPath = mDrivePath;
      this.config.currentPath = mDrivePath;
      this.updateOriginalFileList(files);

      // 更新面板内容
      this.updatePanelContent(panel, mDrivePath, files);
      this.updateStatus(`已切换到${letter}盘`);
    } catch (error) {
      console.error('切换到挂载盘失败:', error);
      this.updateStatus(`${letter}盘不可用或无访问权限`);
    }
  }

  /**
   * 切换到输出目录
   */
  private async switchToOutputDir(panel: HTMLElement): Promise<void> {
    try {
      const settings = await loadAppSettings();
      const outputPath = settings.output_path || 'output';
      const files = await invoke('get_file_list', { path: outputPath }) as FileItem[];

      this.currentPath = outputPath;
      this.config.currentPath = outputPath;
      this.updateOriginalFileList(files);

      // 更新面板内容
      this.updatePanelContent(panel, outputPath, files);
      this.updateStatus('已切换到输出目录');
    } catch (error) {
      console.error('切换到输出目录失败:', error);
      this.updateStatus('切换到输出目录失败');
    }
  }

  /**
   * 清空输出目录
   */
  private async clearOutputDirectory(panel: HTMLElement): Promise<void> {
    try {
      // 显示自定义确认对话框
      const confirmed = await this.showConfirmDialog(
        '确认清空输出目录',
        '此操作将删除输出目录下的所有文件和文件夹，且无法恢复。\n\n确定要继续吗？',
        'danger'
      );

      if (!confirmed) {
        this.updateStatus('已取消清空操作');
        return;
      }

      this.updateStatus('正在清空输出目录...');

      // 调用后端清空目录命令
      const result = await invoke('clear_output_directory') as string;

      // 刷新文件列表
      await this.refreshFileList(panel);

      this.updateStatus(`✅ ${result}`);
    } catch (error) {
      console.error('清空输出目录失败:', error);
      this.updateStatus(`❌ 清空输出目录失败: ${error}`);
    }
  }

  /**
   * 刷新文件列表
   */
  private async refreshFileList(panel: HTMLElement): Promise<void> {
    const content = panel.querySelector('.file-list');
    if (content) {
      content.innerHTML = '<div class="loading">🔄 正在刷新...</div>';
      try {
        const files = await invoke('get_file_list', { path: this.currentPath }) as FileItem[];
        this.updateOriginalFileList(files);
        content.innerHTML = this.renderFileList(files);

        // 重新绑定所有事件
        this.bindFileActions(panel);
        this.bindContextMenu(panel);  // 🔧 修复：重新绑定右键菜单事件
        this.bindSearchEvents(panel);
        this.bindSortEvents(panel);

        this.updateStatus('文件列表已刷新');
        //console.log('🔍 文件列表刷新完成，已重新绑定右键菜单事件');
      } catch (error) {
        content.innerHTML = '<div class="error">❌ 刷新失败</div>';
        this.updateStatus('刷新失败');
      }
    }
  }

  /**
   * 更新面板内容
   */
  private updatePanelContent(panel: HTMLElement, path: string, files: FileItem[]): void {
    // 更新面包屑导航
    const breadcrumbContainer = panel.querySelector('.breadcrumb-container');
    if (breadcrumbContainer) {
      breadcrumbContainer.innerHTML = this.generateBreadcrumbs(path);
    }

    // 更新文件列表
    const contentDiv = panel.querySelector('.file-panel-content');
    if (contentDiv) {
      contentDiv.innerHTML = `
        <div class="file-list">
          ${this.renderFileList(files)}
        </div>
      `;

      // 重新绑定事件
      this.bindFileActions(panel);
      this.bindContextMenu(panel);
      this.bindNavigationEvents(panel);
      this.bindSearchEvents(panel);
      this.bindSortEvents(panel);
    }
  }

  /**
   * 处理工具栏操作
   */
  // private async handleToolbarAction(action: string | null): Promise<void> {
  //   // 工具栏按钮已移除，此方法保留以防未来需要
  //   //console.log('工具栏操作:', action);
  // }



  /**
   * 进入子目录
   */
  private async enterDirectory(dirname: string, panel: HTMLElement): Promise<void> {
    try {
      // 构建新路径
      const newPath = this.joinPath(this.currentPath, dirname);
      
      // 获取子目录文件列表
      const files = await invoke('get_file_list', { path: newPath }) as FileItem[];
      
      // 更新当前路径
      this.currentPath = newPath;
      this.config.currentPath = newPath;
      
      // 更新面板内容
      this.updatePanelContent(panel, newPath, files);
      this.updateStatus(`已进入目录: ${dirname}`);
    } catch (error) {
      console.error('进入目录失败:', error);
      this.updateStatus(`无法进入目录: ${dirname}`);
    }
  }

  /**
   * 返回上一级目录
   */
  private async goBack(panel: HTMLElement): Promise<void> {
    try {
      // 获取父目录路径
      const parentPath = this.getParentPath(this.currentPath);
      
      if (parentPath === this.currentPath) {
        this.updateStatus('已在根目录');
        return;
      }
      
      // 获取父目录文件列表
      const files = await invoke('get_file_list', { path: parentPath }) as FileItem[];
      
      // 更新当前路径
      this.currentPath = parentPath;
      this.config.currentPath = parentPath;
      
      // 更新面板内容
      this.updatePanelContent(panel, parentPath, files);
      this.updateStatus('已返回上一级目录');
    } catch (error) {
      console.error('返回上一级失败:', error);
      this.updateStatus('返回上一级失败');
    }
  }

  /**
   * 拼接路径
   */
  private joinPath(basePath: string, subPath: string): string {
    // 处理不同操作系统的路径分隔符
    const separator = basePath.includes('/') ? '/' : '\\';
    const normalizedBasePath = basePath.endsWith(separator) ? basePath.slice(0, -1) : basePath;
    return `${normalizedBasePath}${separator}${subPath}`;
  }

  /**
   * 获取父目录路径
   */
  private getParentPath(currentPath: string): string {
    // 处理不同操作系统的路径分隔符
    const separator = currentPath.includes('/') ? '/' : '\\';
    const pathParts = currentPath.split(separator).filter(part => part !== '');
    
    if (pathParts.length <= 1) {
      // 如果是根目录或单级目录，返回原路径
      return currentPath;
    }
    
    // 移除最后一个路径部分
    pathParts.pop();
    
    // 重新构建路径
    if (currentPath.startsWith(separator)) {
      // Unix风格路径
      return separator + pathParts.join(separator);
    } else {
      // Windows风格路径
      return pathParts.join(separator);
    }
  }

  /**
   * 绑定文件操作事件
   */
  private bindFileActions(panel: HTMLElement): void {
    // 文件操作按钮
    panel.querySelectorAll('.file-action-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const action = btn.getAttribute('data-action');
        const fileItem = btn.closest('.file-item');
        const filename = fileItem?.getAttribute('data-filename');
        
        if (filename && action) {
          await this.handleFileAction(action, filename);
        }
      });
    });

    // 文件项双击打开
    panel.querySelectorAll('.file-item').forEach(item => {
      item.addEventListener('dblclick', async (e) => {
        e.stopPropagation();
        const filename = item.getAttribute('data-filename');
        const isDir = item.getAttribute('data-is-dir') === 'true';
        
        if (filename) {
          if (isDir) {
            // 双击目录进入子目录
            await this.enterDirectory(filename, panel);
          } else {
            // 双击文件智能打开
            await this.smartOpenFile(filename);
          }
        }
      });
    });
  }

  /**
   * 绑定导航事件
   */
  private bindNavigationEvents(panel: HTMLElement): void {
    // 返回上一级按钮（新样式）
    panel.querySelectorAll('.nav-btn.back-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        await this.goBack(panel);
      });
    });

    // 面包屑导航点击事件
    panel.querySelectorAll('.breadcrumb-item').forEach(item => {
      item.addEventListener('click', async () => {
        const targetPath = item.getAttribute('data-path');
        if (targetPath && targetPath !== this.currentPath) {
          await this.navigateToPath(panel, targetPath);
        }
      });
    });
  }

  /**
   * 导航到指定路径
   */
  private async navigateToPath(panel: HTMLElement, targetPath: string): Promise<void> {
    try {
      const files = await invoke('get_file_list', { path: targetPath }) as FileItem[];

      // 更新当前路径
      this.currentPath = targetPath;
      this.config.currentPath = targetPath;
      this.updateOriginalFileList(files);

      // 更新面板内容
      this.updatePanelContent(panel, targetPath, files);
      this.updateStatus(`已切换到: ${targetPath}`);
    } catch (error) {
      console.error('导航到路径失败:', error);
      this.updateStatus(`无法访问路径: ${targetPath}`);
    }
  }

  /**
   * 绑定右键菜单
   */
  private bindContextMenu(panel: HTMLElement): void {
    const fileItems = panel.querySelectorAll('.file-item');
    //console.log(`🔍 绑定右键菜单，找到 ${fileItems.length} 个文件项`);

    fileItems.forEach((item) => {
      //const filename = item.getAttribute('data-filename');
      //console.log(`🔍 文件项 ${index}: ${filename}`);

      item.addEventListener('contextmenu', (e: Event) => {
        e.preventDefault();
        e.stopPropagation();

        const mouseEvent = e as MouseEvent;
        const filename = item.getAttribute('data-filename');
        const isDir = item.getAttribute('data-is-dir') === 'true';
        const extension = item.getAttribute('data-extension') || '';

        //console.log(`🔍 右键点击文件: ${filename}, 位置: (${mouseEvent.clientX}, ${mouseEvent.clientY})`);

        if (filename) {
          this.showContextMenu(mouseEvent.clientX, mouseEvent.clientY, filename, isDir, extension);
        } else {
          console.warn('⚠️ 文件名为空，无法显示右键菜单');
        }
      });
    });
  }

  /**
   * 显示右键菜单
   */
  private showContextMenu(x: number, y: number, filename: string, isDir: boolean, extension: string): void {
    //console.log(`🔍 显示右键菜单: ${filename} (${isDir ? '目录' : '文件'}) at (${x}, ${y})`);

    // 移除已存在的菜单
    this.hideContextMenu();

    const menu = document.createElement('div');
    menu.className = 'file-context-menu';
    menu.style.position = 'fixed';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.style.zIndex = '10000';

    const menuItems = this.generateContextMenuItems(filename, isDir, extension);
    //console.log(`🔍 生成的菜单项数量: ${menu.querySelectorAll('.context-menu-item').length}`);
    menu.innerHTML = menuItems;

    document.body.appendChild(menu);
    this.contextMenu = menu;

    //console.log(`🔍 右键菜单已添加到页面，菜单元素:`, menu);

    // 绑定菜单项点击事件
    menu.querySelectorAll('.context-menu-item').forEach(item => {
      item.addEventListener('click', async (e) => {
        e.stopPropagation();
        const action = item.getAttribute('data-action');
        const submenu = item.getAttribute('data-submenu');
        
        if (submenu) {
          // 显示二级菜单
          this.showSubmenu(item as HTMLElement, submenu, filename, isDir, extension);
        } else if (action) {
          await this.handleContextMenuAction(action, filename);
          this.hideContextMenu();
        }
      });
      
      // 鼠标悬停显示二级菜单
      item.addEventListener('mouseenter', () => {
        const submenu = item.getAttribute('data-submenu');
        if (submenu) {
          // 隐藏其他可能存在的二级菜单
          this.hideSubmenus();
          // 显示当前二级菜单
          this.showSubmenu(item as HTMLElement, submenu, filename, isDir, extension);
        } else {
          // 如果不是子菜单项，隐藏所有二级菜单
          this.hideSubmenus();
        }
      });
    });

    // 调整菜单位置避免超出屏幕
    this.adjustContextMenuPosition(menu, x, y);
  }

  /**
   * 生成图标 HTML
   */
  private getIconHtml(emoji: string): string {
    const iconName = IconParkHelper.getIconNameFromEmoji(emoji);
    if (iconName) {
      return IconParkHelper.getSvgString(iconName, { size: 16 });
    }
    return `<span>${emoji}</span>`;
  }

  /**
   * 生成右键菜单项
   */
  private generateContextMenuItems(_filename: string, isDir: boolean, extension: string): string {
    const items = [];

    if (!isDir) {
      // 文件操作
      items.push(`<div class="context-menu-item" data-action="open-folder">
        <span class="menu-icon">${this.getIconHtml('📂')}</span>
        <span class="menu-text">打开目标文件夹</span>
      </div>`);

      // 图片快速预览功能 - 仅对图片文件显示
      if (this.isImageFile('.' + extension)) {
        items.push(`<div class="context-menu-item" data-action="quick-preview">
          <span class="menu-icon">${this.getIconHtml('🖼️')}</span>
          <span class="menu-text">快速预览</span>
        </div>`);
      }

      // 查看器选项 - 增强显示逻辑
      const hasViewerOptions = this.isTextFile('.' + extension) || extension.toLowerCase() === 'csv' || this.isRegistryFile('.' + extension) || this.isEvtxFile('.' + extension);

      if (hasViewerOptions) {
        items.push('<div class="context-menu-separator"></div>');

        // CSV查看器 - 优先显示
        if (extension.toLowerCase() === 'csv') {
          items.push(`<div class="context-menu-item" data-action="view-csv">
            <span class="menu-icon">${this.getIconHtml('📊')}</span>
            <span class="menu-text">CSV查看器打开</span>
          </div>`);
        }

        // 注册表查看器 - 支持注册表hive文件
        if (this.isRegistryFile('.' + extension)) {
          items.push(`<div class="context-menu-item" data-action="view-registry">
            <span class="menu-icon">${this.getIconHtml('📋')}</span>
            <span class="menu-text">注册表查看器打开</span>
          </div>`);
        }

        // EVTX查看器 - 支持Windows事件日志文件
        if (this.isEvtxFile('.' + extension)) {
          items.push(`<div class="context-menu-item" data-action="view-evtx">
            <span class="menu-icon">${this.getIconHtml('📋')}</span>
            <span class="menu-text">EVTX查看器打开</span>
          </div>`);
        }

        // 文本查看器 - 支持多种文本格式
        if (this.isTextFile('.' + extension)) {
          items.push(`<div class="context-menu-item" data-action="view-text">
            <span class="menu-icon">${this.getIconHtml('📝')}</span>
            <span class="menu-text">文本查看器打开</span>
          </div>`);
        }

        // 如果是CSV文件，同时也提供文本查看器选项
        if (extension.toLowerCase() === 'csv') {
          items.push(`<div class="context-menu-item" data-action="view-text">
            <span class="menu-icon">${this.getIconHtml('📄')}</span>
            <span class="menu-text">以文本方式打开</span>
          </div>`);
        }
      }

      items.push('<div class="context-menu-separator"></div>');

      // 文件重命名功能 - 仅对文件显示
      items.push(`<div class="context-menu-item" data-action="rename-file">
        <span class="menu-icon">${this.getIconHtml('✏️')}</span>
        <span class="menu-text">重命名文件</span>
      </div>`);

      items.push('<div class="context-menu-separator"></div>');

      // 计算文件哈希值选项
      items.push(`<div class="context-menu-item" data-action="calculate-hash">
        <span class="menu-icon">${this.getIconHtml('🔐')}</span>
        <span class="menu-text">计算文件哈希值</span>
      </div>`);

      items.push('<div class="context-menu-separator"></div>');

      // 自定义插件执行选项 - 二级菜单
      items.push(`<div class="context-menu-item submenu-parent" data-submenu="custom-plugins">
        <span class="menu-icon">${this.getIconHtml('🔧')}</span>
        <span class="menu-text">自定义插件</span>
        <span class="submenu-arrow">▶</span>
      </div>`);

      items.push('<div class="context-menu-separator"></div>');
    } else {
      // 目录操作
      items.push(`<div class="context-menu-item" data-action="open">
        <span class="menu-icon">${this.getIconHtml('📁')}</span>
        <span class="menu-text">打开目录</span>
      </div>`);

      items.push('<div class="context-menu-separator"></div>');

      items.push(`<div class="context-menu-item" data-action="copy-path">
        <span class="menu-icon">${this.getIconHtml('📋')}</span>
        <span class="menu-text">复制路径</span>
      </div>`);
    }

    return items.join('');
  }

  /**
   * 处理右键菜单操作
   */
  private async handleContextMenuAction(action: string, filename: string): Promise<void> {
    // 检查是否是插件执行动作
    if (action.startsWith('run-plugin:')) {
      const pluginId = action.replace('run-plugin:', '');
      await this.executeCustomPlugin(pluginId, filename);
      return;
    }

    switch (action) {
      case 'open':
      case 'open-folder':
      case 'view-text':
      case 'view-csv':
      case 'view-registry':
      case 'view-evtx':
        await this.handleFileAction(action, filename);
        break;
      case 'compress-zip':
        await this.compressToZip(filename);
        break;
      case 'process-python':
        await this.processPythonScript(filename);
        break;
      // case 'run-python':
      //   await this.runPythonScript(filename);
      //   break;
      case 'copy-path':
        await this.copyFilePath(filename);
        break;
      case 'copy-name':
        await this.copyFileName(filename);
        break;
      case 'show-properties':
        await this.showFileProperties(filename);
        break;
      case 'manage-plugins':
        await this.openPluginManager();
        break;
      case 'calculate-hash':
        await this.calculateFileHashes(filename);
        break;
      case 'rename-file':
        await this.renameFile(filename);
        break;
      case 'quick-preview':
        await this.showImagePreview(filename);
        break;
    }
  }

  /**
   * 执行自定义插件
   */
  private async executeCustomPlugin(pluginId: string, filename: string): Promise<void> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');

      // 构建完整文件路径
      const filePath = `${this.currentPath}\\${filename}`;

      this.updateStatus(`正在执行插件: ${pluginId} 处理 ${filename}...`);

      // 记录开始时间，用于超时检测
      const startTime = Date.now();
      
      // 执行文件浏览器插件（现在是异步的，不会阻塞UI）
      const result = await invoke('execute_file_browser_plugin', {
        pluginId: pluginId,
        filePath: filePath,
        fileName: filename,
        currentPath: this.currentPath
      }) as string;

      const executionTime = Date.now() - startTime;
      this.updateStatus(`✅ 插件执行完成 (${executionTime}ms): ${result}`);

      // 刷新文件列表以显示可能生成的新文件
      const panel = document.querySelector('.file-panel') as HTMLElement;
      if (panel) {
        await this.refreshFileList(panel);
      }

    } catch (error) {
      console.error('执行插件失败:', error);
      this.updateStatus(`❌ 插件执行失败: ${error}`);
    }
  }


  /**
   * 打开插件管理器
   */
  private async openPluginManager(): Promise<void> {
    try {
      // 导入文件浏览器插件管理器
      const { FileBrowserPluginManager } = await import('./fileBrowserPluginManager');
      const pluginManager = new FileBrowserPluginManager((message) => this.updateStatus(message));
      await pluginManager.showPluginManager();
      this.updateStatus('已打开插件管理器');
    } catch (error) {
      console.error('打开插件管理器失败:', error);
      this.updateStatus('打开插件管理器失败');
    }
  }

  /**
   * 压缩文件为ZIP格式
   */
  private async compressToZip(filename: string): Promise<void> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      
      // 获取设置中的Python路径
      const settings = await loadAppSettings();
      const pythonPath = settings.python3_path || 'python';
      
      // 构建完整文件路径
      const filePath = `${this.currentPath}\\${filename}`;
      
      // 构建输出目录 - 在同级目录下创建compressed文件夹
      const outputDir = `${this.currentPath}\\compressed`;
      
      this.updateStatus(`正在压缩 ${filename}...`);
      
      // 调用Python脚本进行压缩
      const result = await invoke('execute_python_script', {
        pythonPath: pythonPath,
        scriptName: 'compress_to_zip',
        filePath: filePath,
        outputDir: outputDir,
        args: ['6'] // 默认压缩级别为6
      }) as string;
      
      // 解析结果
      if (result.includes('SUCCESS:')) {
        const zipPath = result.split('SUCCESS:')[1].trim();
        this.updateStatus(`✅ 压缩完成: ${zipPath.split('\\').pop()}`);
        
        // 如果当前在同一目录，刷新文件列表以显示新的compressed文件夹
        if (this.currentPath === this.currentPath) {
          const panel = document.querySelector('.file-panel') as HTMLElement;
          if (panel) {
            await this.refreshFileList(panel);
          }
        }
      } else {
        throw new Error(result);
      }
    } catch (error) {
      console.error('压缩文件失败:', error);
      this.updateStatus(`❌ 压缩失败: ${error}`);
    }
  }

  /**
   * Python脚本处理（预留接口）
   */
  private async processPythonScript(filename: string): Promise<void> {
    //console.log('🐍 Python脚本处理:', filename);
    this.updateStatus(`Python脚本处理: ${filename} - 功能开发中`);
    
    // TODO: 实现Python脚本处理
    // 可以调用用户自定义的Python脚本对文件进行处理
  }



  /**
   * 复制文件路径
   */
  private async copyFilePath(filename: string): Promise<void> {
    try {
      const filePath = `${this.currentPath}\\${filename}`;
      await navigator.clipboard.writeText(filePath);
      this.updateStatus(`已复制路径: ${filePath}`);
    } catch (error) {
      console.error('复制路径失败:', error);
      this.updateStatus('复制路径失败');
    }
  }

  /**
   * 复制文件名
   */
  private async copyFileName(filename: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(filename);
      this.updateStatus(`已复制文件名: ${filename}`);
    } catch (error) {
      console.error('复制文件名失败:', error);
      this.updateStatus('复制文件名失败');
    }
  }

  /**
   * 显示文件属性（预留接口）
   */
  private async showFileProperties(filename: string): Promise<void> {
    //console.log('ℹ️ 显示文件属性:', filename);
    this.updateStatus(`显示文件属性: ${filename} - 功能开发中`);
    
    // TODO: 实现文件属性显示
    // 可以显示文件大小、创建时间、修改时间、权限等信息
  }

  /**
   * 调整右键菜单位置
   */
  private adjustContextMenuPosition(menu: HTMLElement, x: number, y: number): void {
    const rect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let adjustedX = x;
    let adjustedY = y;

    // 防止菜单超出右边界
    if (x + rect.width > viewportWidth) {
      adjustedX = viewportWidth - rect.width - 10;
    }

    // 防止菜单超出下边界
    if (y + rect.height > viewportHeight) {
      adjustedY = viewportHeight - rect.height - 10;
    }

    menu.style.left = `${adjustedX}px`;
    menu.style.top = `${adjustedY}px`;
  }

  /**
   * 显示二级菜单
   */
  private async showSubmenu(parentItem: HTMLElement, submenuType: string, filename: string, isDir: boolean, extension: string): Promise<void> {
    // 隐藏已存在的二级菜单
    this.hideSubmenus();

    const submenu = document.createElement('div');
    submenu.className = 'file-context-submenu';
    submenu.style.position = 'fixed';
    submenu.style.zIndex = '10001';

    // 显示加载状态
    submenu.innerHTML = `<div class="context-menu-item disabled">
      <span class="menu-icon">⏳</span>
      <span class="menu-text">加载中...</span>
    </div>`;

    document.body.appendChild(submenu);

    // 计算二级菜单位置
    const parentRect = parentItem.getBoundingClientRect();
    const submenuX = parentRect.right + 5;
    const submenuY = parentRect.top;

    submenu.style.left = `${submenuX}px`;
    submenu.style.top = `${submenuY}px`;

    // 调整位置避免超出屏幕
    this.adjustSubmenuPosition(submenu, submenuX, submenuY);

    // 给二级菜单添加标识以便管理
    submenu.setAttribute('data-submenu-type', submenuType);

    try {
      // 异步生成二级菜单内容
      const menuItems = await this.generateSubmenuItems(submenuType, filename, isDir, extension);
      submenu.innerHTML = menuItems;

      // 重新绑定二级菜单项点击事件
      submenu.querySelectorAll('.context-menu-item:not(.disabled)').forEach(item => {
        item.addEventListener('click', async (e) => {
          e.stopPropagation();
          const action = item.getAttribute('data-action');
          if (action) {
            await this.handleContextMenuAction(action, filename);
            this.hideContextMenu();
          }
        });
      });
    } catch (error) {
      console.error('生成二级菜单失败:', error);
      submenu.innerHTML = `<div class="context-menu-item disabled">
        <span class="menu-icon">${this.getIconHtml('❌')}</span>
        <span class="menu-text">加载失败</span>
      </div>`;
    }
  }

  /**
   * 生成二级菜单项
   */
  private async generateSubmenuItems(submenuType: string, _filename: string, isDir: boolean, extension: string): Promise<string> {
    const items = [];

    switch (submenuType) {
      case 'custom-plugins':
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const plugins = await invoke('load_file_browser_plugins') as any[];

          // 只显示启用的插件，并根据文件类型过滤
          const enabledPlugins = plugins.filter(plugin => {
            if (!plugin.enabled) return false;

            // 检查文件类型支持
            if (plugin.file_types.includes('*')) return true;
            if (isDir && plugin.file_types.includes('dir')) return true;

            const cleanExtension = extension.toLowerCase();
            return plugin.file_types.some((type: string) =>
              type.toLowerCase() === cleanExtension
            );
          });

          if (enabledPlugins.length > 0) {
            enabledPlugins.forEach(plugin => {
              items.push(`<div class="context-menu-item" data-action="run-plugin:${plugin.id}" title="${plugin.description}">
                <span class="menu-icon">${plugin.icon}</span>
                <span class="menu-text">${plugin.name}</span>
              </div>`);
            });
          } else {
            items.push(`<div class="context-menu-item disabled">
              <span class="menu-icon">${this.getIconHtml('❌')}</span>
              <span class="menu-text">无适用插件 (${extension || '目录'})</span>
            </div>`);
          }

          // 添加分隔符和管理选项
          items.push('<div class="context-menu-separator"></div>');
          items.push(`<div class="context-menu-item" data-action="manage-plugins">
            <span class="menu-icon">${this.getIconHtml('⚙️')}</span>
            <span class="menu-text">管理插件</span>
          </div>`);

        } catch (error) {
          console.error('获取文件浏览器插件列表失败:', error);
          items.push(`<div class="context-menu-item disabled">
            <span class="menu-icon">${this.getIconHtml('❌')}</span>
            <span class="menu-text">加载插件失败</span>
          </div>`);
        }
        break;
    }

    return items.join('');
  }

  /**
   * 调整二级菜单位置
   */
  private adjustSubmenuPosition(submenu: HTMLElement, x: number, y: number): void {
    const rect = submenu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let adjustedX = x;
    let adjustedY = y;

    // 防止菜单超出右边界
    if (x + rect.width > viewportWidth) {
      // 如果右侧空间不够，显示在左侧
      const parentRect = this.contextMenu?.getBoundingClientRect();
      if (parentRect) {
        adjustedX = parentRect.left - rect.width - 5;
      }
    }

    // 防止菜单超出下边界
    if (y + rect.height > viewportHeight) {
      adjustedY = viewportHeight - rect.height - 10;
    }

    submenu.style.left = `${adjustedX}px`;
    submenu.style.top = `${adjustedY}px`;
  }

  /**
   * 隐藏所有二级菜单
   */
  private hideSubmenus(): void {
    document.querySelectorAll('.file-context-submenu').forEach(submenu => {
      submenu.remove();
    });
  }

  /**
   * 隐藏右键菜单
   */
  private hideContextMenu(): void {
    this.hideSubmenus(); // 同时隐藏二级菜单
    if (this.contextMenu) {
      this.contextMenu.remove();
      this.contextMenu = null;
    }
  }

  /**
   * 绑定全局事件
   */
  private bindGlobalEvents(): void {
    // 点击其他地方关闭右键菜单
    document.addEventListener('click', (e) => {
      if (this.contextMenu && !this.contextMenu.contains(e.target as Node)) {
        this.hideContextMenu();
      }
    });
  }

  /**
   * 绑定点击外部关闭面板
   */
  private bindOutsideClick(panel: HTMLElement): void {
    setTimeout(() => {
      const handler = (e: Event) => {
        if (!panel.contains(e.target as Node)) {
          const btn = document.getElementById('open-file-manager-btn');
          if (!btn?.contains(e.target as Node)) {
            panel.classList.remove('visible');
            setTimeout(() => {
              panel.remove();
              document.removeEventListener('click', handler);
            }, 300);
          }
        }
      };
      document.addEventListener('click', handler);
    }, 100);
  }

  /**
   * 处理文件操作
   */
  private async handleFileAction(action: string, filename: string): Promise<void> {
    try {
      const filePath = `${this.currentPath}\\${filename}`;

      switch (action) {
        case 'open':
          await invoke('open_file_with_default', { path: filePath });
          this.updateStatus(`已用默认程序打开: ${filename}`);
          break;
        case 'open-folder':
          await invoke('open_folder_and_select', { path: filePath });
          this.updateStatus(`已打开文件夹并选中: ${filename}`);
          break;
        case 'view-text':
          await invoke('open_text_viewer', {
            textFilePath: filePath,
            windowTitle: `文本查看器 - ${filename}`,
            searchQuery: null
          });
          this.updateStatus(`已在文本查看器中打开: ${filename}`);
          break;
        case 'view-csv':
          await invoke('open_csv_viewer', {
            csvFilePath: filePath,
            windowTitle: `CSV查看器 - ${filename}`,
            searchQuery: null
          });
          this.updateStatus(`已在CSV查看器中打开: ${filename}`);
          break;
        case 'view-registry':
          await invoke('open_registry_viewer', {
            registryFilePath: filePath,
            windowTitle: `注册表查看器 - ${filename}`
          });
          this.updateStatus(`已在注册表查看器中打开: ${filename}`);
          break;
        case 'delete-file':
          await this.deleteFile(filename);
          break;
      }
    } catch (error) {
      console.error(`文件操作失败 (${action}):`, error);
      this.updateStatus(`操作失败: ${filename}`);
    }
  }

  /**
   * 智能打开文件 - 根据文件类型选择合适的查看器
   * @param filename 文件名
   * @param useSearchQuery 是否使用搜索关键词（只有从搜索下拉框打开时才传递true）
   */
  private async smartOpenFile(filename: string, useSearchQuery: boolean = false): Promise<void> {
    try {
      const filePath = `${this.currentPath}\\${filename}`;
      const extension = filename.split('.').pop()?.toLowerCase() || '';

      //console.log(`🔍 智能打开文件: ${filename}, 扩展名: ${extension}`);

      // 只有从搜索下拉框打开时才传递搜索关键词
      const searchQuery = useSearchQuery ? (this.currentSearchQuery || null) : null;

      // 根据文件扩展名选择合适的查看器
      switch (extension) {
        case 'csv':
          // CSV文件使用CSV查看器
          await invoke('open_csv_viewer', {
            csvFilePath: filePath,
            windowTitle: `CSV查看器 - ${filename}`,
            searchQuery: searchQuery
          });
          this.updateStatus(`已在CSV查看器中打开: ${filename}`);
          break;

        case 'txt':
        case 'log':
        case 'json':
        case 'xml':
        case 'md':
        case 'py':
        case 'js':
        case 'ts':
        case 'html':
        case 'css':
        case 'sql':
        case 'ini':
        case 'cfg':
        case 'conf':
        case 'yml':
        case 'yaml':
          // 文本类文件使用文本查看器
          await invoke('open_text_viewer', {
            textFilePath: filePath,
            windowTitle: `文本查看器 - ${filename}`,
            searchQuery: searchQuery
          });
          this.updateStatus(`已在文本查看器中打开: ${filename}`);
          break;

        case 'reghive':
        case 'hive':
        case 'dat':
          // 注册表hive文件使用注册表查看器
          await invoke('open_registry_viewer', {
            registryFilePath: filePath,
            windowTitle: `注册表查看器 - ${filename}`
          });
          this.updateStatus(`已在注册表查看器中打开: ${filename}`);
          break;

        case 'dmp':
        case 'vmem':
        case 'raw':
        case 'mem':
          // 内存转储文件，提示用户使用内存分析工具
          this.updateStatus(`内存文件 ${filename}，请使用右键菜单选择分析工具`);
          // 可以考虑直接打开某个内存分析工具，或者显示提示
          break;

        case 'zip':
        case 'rar':
        case '7z':
        case 'tar':
        case 'gz':
          // 压缩文件，提示用户或使用系统默认程序
          await invoke('open_file_with_default', { path: filePath });
          this.updateStatus(`已用默认程序打开压缩文件: ${filename}`);
          break;

        case 'jpg':
        case 'jpeg':
        case 'png':
        case 'gif':
        case 'bmp':
        case 'webp':
        case 'svg':
          // 图片文件使用系统默认程序
          await invoke('open_file_with_default', { path: filePath });
          this.updateStatus(`已用默认程序打开图片: ${filename}`);
          break;

        case 'pdf':
        case 'doc':
        case 'docx':
        case 'xls':
        case 'xlsx':
        case 'ppt':
        case 'pptx':
          // 办公文档使用系统默认程序
          await invoke('open_file_with_default', { path: filePath });
          this.updateStatus(`已用默认程序打开文档: ${filename}`);
          break;

        case 'mp4':
        case 'avi':
        case 'mkv':
        case 'mov':
        case 'wmv':
        case 'flv':
        case 'mp3':
        case 'wav':
        case 'flac':
        case 'aac':
          // 媒体文件使用系统默认程序
          await invoke('open_file_with_default', { path: filePath });
          this.updateStatus(`已用默认程序打开媒体文件: ${filename}`);
          break;

        case 'exe':
        case 'msi':
        case 'bat':
        case 'cmd':
        case 'ps1':
          // 可执行文件，提示用户注意安全
          const confirmRun = await showConfirm({ message: `确定要运行可执行文件 "${filename}" 吗？<br><br>⚠️ 请确保文件来源安全！`, type: 'danger' });
          if (confirmRun) {
            await invoke('open_file_with_default', { path: filePath });
            this.updateStatus(`已运行: ${filename}`);
          } else {
            this.updateStatus(`已取消运行: ${filename}`);
          }
          break;

        default:
          // 未知类型的文件，优先尝试文本查看器
          if (this.isTextFile('.' + extension)) {
            await invoke('open_text_viewer', {
              textFilePath: filePath,
              windowTitle: `文本查看器 - ${filename}`,
              searchQuery: searchQuery
            });
            this.updateStatus(`已在文本查看器中打开: ${filename}`);
          } else {
            // 如果不是文本文件，使用系统默认程序
            await invoke('open_file_with_default', { path: filePath });
            this.updateStatus(`已用默认程序打开: ${filename}`);
          }
          break;
      }
    } catch (error) {
      console.error('智能打开文件失败:', error);
      this.updateStatus(`打开文件失败: ${filename}`);
    }
  }



  /**
   * 获取文件图标
   */
  private getFileIcon(file: FileItem): string {
    if (file.is_dir) return '📁';
    
    switch (file.extension.toLowerCase()) {
      case 'csv': return '📊';
      case 'txt': return '📄';
      case 'log': return '📋';
      case 'json': return '🔧';
      case 'xml': return '📰';
      case 'pdf': return '📕';
      case 'doc':
      case 'docx': return '📘';
      case 'xls':
      case 'xlsx': return '📗';
      case 'zip':
      case 'rar':
      case '7z': return '📦';
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
      case 'bmp': return '🖼️';
      case 'py': return '🐍';
      case 'ps1': return '💻';
      case 'bat':
      case 'cmd': return '⚙️';
      default: return '📄';
    }
  }

  /**
   * 格式化文件大小
   */
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * 判断是否为文本文件
   */
  private isTextFile(extension: string): boolean {
    const textExtensions = [
      '.txt', '.log', '.json', '.xml', '.csv', '.md', '.yaml', '.yml',
      '.ini', '.conf', '.config', '.py', '.ps1', '.bat', '.cmd', '.sh',
      '.js', '.ts', '.html', '.css', '.sql', '.c', '.cpp', '.h', '.hpp',
      '.java', '.php', '.rb', '.go', '.rs', '.swift', '.kt', '.scala',
      '.vb', '.cs', '.pl', '.r', '.matlab', '.m', '.asm', '.s',
      '.properties', '.env', '.gitignore', '.dockerfile', '.makefile',
      '.readme', '.license', '.changelog', '.version', '.manifest','.img',
      '.vacb','.data','.dat'
    ];
    return textExtensions.includes(extension.toLowerCase());
  }

  /**
   * 判断是否为注册表文件
   */
  private isRegistryFile(extension: string): boolean {
    const registryExtensions = [
      '.reghive', '.hive', '.dat'
    ];
    return registryExtensions.includes(extension.toLowerCase());
  }

  /**
   * 判断是否为EVTX文件
   */
  private isEvtxFile(extension: string): boolean {
    const evtxExtensions = [
      '.evtx'
    ];
    return evtxExtensions.includes(extension.toLowerCase());
  }

  /**
   * 判断是否为图片文件
   */
  private isImageFile(extension: string): boolean {
    const imageExtensions = [
      '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.tiff', '.ico'
    ];
    return imageExtensions.includes(extension.toLowerCase());
  }

  /**
   * 更新状态
   */
  private updateStatus(message: string): void {
    if (this.updateStatusCallback) {
      this.updateStatusCallback(message);
    }
  }

  /**
   * 获取当前路径
   */
  getCurrentPath(): string {
    return this.currentPath;
  }

  /**
   * 获取配置
   */
  getConfig(): FilePanelConfig {
    return { ...this.config };
  }

  /**
   * 设置配置
   */
  setConfig(config: Partial<FilePanelConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 绑定拖拽调整宽度功能
   */
  private bindResizeHandle(panel: HTMLElement): void {
    const resizeHandle = panel.querySelector('.file-panel-resize-handle') as HTMLElement;
    if (!resizeHandle) return;

    let isResizing = false;
    let startX = 0;
    let startWidth = 0;
    const minWidth = 250;
    const maxWidth = 800;

    const handleMouseDown = (e: MouseEvent) => {
      isResizing = true;
      startX = e.clientX;
      startWidth = panel.offsetWidth;
      
      // 添加全局样式，防止选择文本
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'ew-resize';
      
      e.preventDefault();
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      
      const deltaX = startX - e.clientX; // 注意：向左拖拽是正值
      const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidth + deltaX));
      
      panel.style.width = `${newWidth}px`;
      e.preventDefault();
    };

    const handleMouseUp = () => {
      if (!isResizing) return;
      
      isResizing = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    // 绑定事件
    resizeHandle.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    // 清理事件监听器
    const cleanup = () => {
      resizeHandle.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    // 当面板被移除时清理事件监听器
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.removedNodes.forEach((node) => {
          if (node === panel) {
            cleanup();
            observer.disconnect();
          }
        });
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  /**
   * 绑定搜索事件
   */
  private bindSearchEvents(panel: HTMLElement): void {
    const searchInput = panel.querySelector('.search-input') as HTMLInputElement;
    const clearButton = panel.querySelector('.search-clear') as HTMLElement;
    const modeToggle = panel.querySelector('.search-mode-toggle') as HTMLElement;
    const dropdown = panel.querySelector('.search-dropdown') as HTMLElement;
    
    // 当前搜索模式：filename 或 content
    let searchMode = 'filename';
    
    // 搜索模式切换
    if (modeToggle) {
      modeToggle.addEventListener('click', () => {
        const currentMode = modeToggle.getAttribute('data-mode');
        const newMode = currentMode === 'filename' ? 'content' : 'filename';
        modeToggle.setAttribute('data-mode', newMode);
        searchMode = newMode;
        
        // 切换图标
        const filenameIcon = modeToggle.querySelector('.mode-icon-filename') as HTMLElement;
        const contentIcon = modeToggle.querySelector('.mode-icon-content') as HTMLElement;
        
        if (newMode === 'content') {
          filenameIcon.style.display = 'none';
          contentIcon.style.display = 'block';
          searchInput.placeholder = '搜索文件内容...';
          modeToggle.title = '切换到文件名搜索';
        } else {
          filenameIcon.style.display = 'block';
          contentIcon.style.display = 'none';
          searchInput.placeholder = '搜索文件名...';
          modeToggle.title = '切换到内容搜索';
        }
        
        // 清空搜索和下拉框
        searchInput.value = '';
        if (dropdown) {
          dropdown.style.display = 'none';
        }
        // 清空搜索关键字
        this.currentSearchQuery = '';
        // 重置文件列表
        this.filterFiles(panel, '');
      });
    }
    
    if (searchInput) {
      // 输入事件
      searchInput.addEventListener('input', async (e) => {
        const searchTerm = (e.target as HTMLInputElement).value;
        
        // 显示/隐藏清空按钮
        if (clearButton) {
          clearButton.style.display = searchTerm ? 'block' : 'none';
        }
        
        if (searchMode === 'filename') {
          // 文件名搜索模式下清空搜索关键字
          this.currentSearchQuery = '';
          this.filterFiles(panel, searchTerm.toLowerCase());
          if (dropdown) {
            dropdown.style.display = 'none';
          }
        }
      });

      // 回车搜索
      searchInput.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const searchTerm = searchInput.value.trim();
          
          if (searchMode === 'filename') {
            // 文件名搜索模式下清空搜索关键字
            this.currentSearchQuery = '';
            this.filterFiles(panel, searchTerm.toLowerCase());
          } else if (searchMode === 'content' && searchTerm) {
            // 内容搜索 - 保存搜索关键字
            this.currentSearchQuery = searchTerm;
            await this.searchFileContent(panel, searchTerm);
          }
        }
      });
    }

    if (clearButton) {
      // 清空搜索
      clearButton.addEventListener('click', () => {
        if (searchInput) {
          searchInput.value = '';
          if (dropdown) {
            dropdown.style.display = 'none';
          }
          // 清空搜索关键字
          this.currentSearchQuery = '';
          // 重置文件列表
          this.filterFiles(panel, '');
        }
      });
    }
    
    // 点击外部关闭下拉框
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const searchContainer = panel.querySelector('.search-container');
      if (dropdown && searchContainer && !searchContainer.contains(target)) {
        dropdown.style.display = 'none';
      }
    });
  }

  /**
   * 过滤文件列表
   */
  private filterFiles(panel: HTMLElement, searchTerm: string): void {
    const fileListContainer = panel.querySelector('.file-list');
    if (!fileListContainer) return;

    // 如果没有搜索词，显示所有文件
    if (!searchTerm.trim()) {
      fileListContainer.innerHTML = this.renderFileList(this.originalFileList);
      this.bindFileActions(panel);
      this.bindContextMenu(panel);  // 🔧 修复：重新绑定右键菜单事件
      return;
    }

    // 过滤文件
    const filteredFiles = this.originalFileList.filter(file =>
      file.name.toLowerCase().includes(searchTerm) ||
      file.extension.toLowerCase().includes(searchTerm)
    );

    fileListContainer.innerHTML = this.renderFileList(filteredFiles);
    this.bindFileActions(panel);
    this.bindContextMenu(panel);  // 🔧 修复：重新绑定右键菜单事件
  }

  /**
   * 绑定排序事件
   */
  private bindSortEvents(panel: HTMLElement): void {
    const sortButtons = panel.querySelectorAll('.sort-btn');

    sortButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const sortType = btn.getAttribute('data-sort') as 'name' | 'size' | 'created';
        if (!sortType) return;

        // 如果点击的是当前排序字段，切换排序顺序
        if (this.config.sortBy === sortType) {
          this.config.sortOrder = this.config.sortOrder === 'asc' ? 'desc' : 'asc';
        } else {
          // 切换到新的排序字段，默认升序
          this.config.sortBy = sortType;
          this.config.sortOrder = 'asc';
        }

        // 持久化排序偏好，下次打开文件面板沿用
        this.savePersistedConfig();

        // 更新排序按钮状态
        this.updateSortButtonStates(panel);

        // 重新渲染文件列表
        this.refreshFileListWithCurrentSort(panel);

        this.updateStatus(`已按${this.getSortDisplayName(sortType)}${this.config.sortOrder === 'asc' ? '升序' : '降序'}排序`);
      });
    });
  }

  /**
   * 更新排序按钮状态
   */
  private updateSortButtonStates(panel: HTMLElement): void {
    const sortButtons = panel.querySelectorAll('.sort-btn');

    sortButtons.forEach(btn => {
      const sortType = btn.getAttribute('data-sort');
      const isActive = sortType === this.config.sortBy;

      // 更新按钮激活状态
      if (isActive) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }

      // 更新排序指示器
      const existingIndicator = btn.querySelector('.sort-indicator');
      if (existingIndicator) {
        existingIndicator.remove();
      }

      if (isActive) {
        const indicator = document.createElement('svg');
        indicator.setAttribute('width', '12');
        indicator.setAttribute('height', '12');
        indicator.setAttribute('viewBox', '0 0 24 24');
        indicator.setAttribute('fill', 'none');
        indicator.setAttribute('stroke', 'currentColor');
        indicator.setAttribute('stroke-width', '2');
        indicator.className = `sort-indicator ${this.config.sortOrder}`;

        const polyline = document.createElement('polyline');
        polyline.setAttribute('points', this.config.sortOrder === 'asc' ? '6 9 12 15 18 9' : '18 15 12 9 6 15');
        indicator.appendChild(polyline);

        btn.appendChild(indicator);
      }
    });
  }

  /**
   * 获取排序字段的显示名称
   */
  private getSortDisplayName(sortType: string): string {
    switch (sortType) {
      case 'name': return '文件名';
      case 'size': return '文件大小';
      case 'created': return '创建时间';
      default: return '文件名';
    }
  }

  /**
   * 使用当前排序设置刷新文件列表
   */
  private refreshFileListWithCurrentSort(panel: HTMLElement): void {
    const fileListContainer = panel.querySelector('.file-list');
    if (!fileListContainer) return;

    // 检查是否有搜索条件
    const searchInput = panel.querySelector('.search-input') as HTMLInputElement;
    const searchTerm = searchInput?.value?.trim() || '';

    let filesToRender = this.originalFileList;

    // 如果有搜索条件，先过滤
    if (searchTerm) {
      filesToRender = this.originalFileList.filter(file =>
        file.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        file.extension.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // 重新渲染文件列表（会自动应用排序）
    fileListContainer.innerHTML = this.renderFileList(filesToRender);
    this.bindFileActions(panel);
    this.bindContextMenu(panel);
  }

  /**
   * 初始化独立文件面板（用于独立窗口）
   */
  async initializeStandaloneFilePanel(): Promise<void> {
    try {
      // 获取用户设置中的输出路径
      // 获取用户设置中的输出路径
      const settings = await loadAppSettings();
      const outputPath = settings.output_path || 'output';
      this.currentPath = outputPath;
      this.config.currentPath = outputPath;

      // 获取文件列表
      const files = await invoke('get_file_list', { path: outputPath }) as FileItem[];

      // 保存原始文件列表
      this.updateOriginalFileList(files);

      // 更新面包屑导航
      const breadcrumbContainer = document.querySelector('.breadcrumb-container');
      if (breadcrumbContainer) {
        breadcrumbContainer.innerHTML = this.generateBreadcrumbs(outputPath);
      }

      // 更新文件列表
      const fileListContainer = document.querySelector('.file-list');
      if (fileListContainer) {
        fileListContainer.innerHTML = this.renderFileList(files);
      }

      // 绑定事件
      const panel = document.querySelector('.file-manager-content') as HTMLElement;
      if (panel) {
        this.bindFileActions(panel);
        this.bindContextMenu(panel);
        this.bindNavigationEvents(panel);
        this.bindSearchEvents(panel);
        this.bindSortEvents(panel);
        this.bindControlActions(panel);
      }

      // 更新文件计数
      if ((window as any).fileManagerApp) {
        (window as any).fileManagerApp.updateFileCount(files.length);
      }

      this.updateStatus('文件列表加载完成');

    } catch (error) {
      console.error('初始化独立文件面板失败:', error);
      const fileListContainer = document.querySelector('.file-list');
      if (fileListContainer) {
        fileListContainer.innerHTML = '<div class="error">❌ 加载失败</div>';
      }
      this.updateStatus('加载失败');
    }
  }

  /**
   * 绑定控制按钮操作（独立窗口版本）
   */
  private bindControlActions(panel: HTMLElement): void {
    panel.querySelectorAll('.action-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const action = btn.getAttribute('data-action');
        await this.handleControlAction(action, panel);
      });
    });
  }

  /**
   * 更新原始文件列表
   */
  private updateOriginalFileList(files: FileItem[]): void {
    this.originalFileList = [...files];
  }

  /**
   * 删除文件
   */
  private async deleteFile(filename: string): Promise<void> {
    try {
      const filePath = `${this.currentPath}\\${filename}`;

      // 显示自定义确认对话框
      const confirmed = await this.showConfirmDialog(
        '确认删除',
        `确定要删除 "${filename}" 吗？\n\n此操作无法恢复。`,
        'danger'
      );

      if (!confirmed) {
        this.updateStatus('已取消删除操作');
        return;
      }

      this.updateStatus(`正在删除: ${filename}...`);

      // 调用后端删除文件命令
      await invoke('delete_file', { path: filePath });

      // 刷新文件列表
      const panel = document.querySelector('.file-panel') as HTMLElement;
      if (panel) {
        await this.refreshFileList(panel);
      }

      this.updateStatus(`✅ 已删除: ${filename}`);
    } catch (error) {
      console.error('删除文件失败:', error);
      this.updateStatus(`❌ 删除失败: ${filename} - ${error}`);
    }
  }

  /**
   * 显示自定义确认对话框
   */
  private showConfirmDialog(title: string, message: string, type: 'info' | 'warning' | 'danger' = 'info'): Promise<boolean> {
    return new Promise((resolve) => {
      // 创建遮罩层
      const overlay = document.createElement('div');
      overlay.className = 'confirm-dialog-overlay';
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition: opacity 0.3s ease;
      `;

      // 创建对话框
      const dialog = document.createElement('div');
      dialog.className = 'confirm-dialog';
      dialog.style.cssText = `
        background: white;
        border-radius: 12px;
        padding: 0;
        width: 400px;
        max-width: 90vw;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
        transform: scale(0.9);
        transition: transform 0.3s ease;
        overflow: hidden;
      `;

      // 根据类型设置颜色
      const colors = {
        info: '#3b82f6',
        warning: '#f59e0b',
        danger: '#ef4444'
      };

      const color = colors[type];

      dialog.innerHTML = `
        <div style="
          background: ${color};
          color: white;
          padding: 20px;
          font-weight: 600;
          font-size: 16px;
        ">
          ${title}
        </div>
        <div style="
          padding: 24px;
          color: #374151;
          line-height: 1.6;
          white-space: pre-line;
        ">
          ${message}
        </div>
        <div style="
          padding: 20px;
          border-top: 1px solid #e5e7eb;
          display: flex;
          gap: 12px;
          justify-content: flex-end;
        ">
          <button class="cancel-btn" style="
            padding: 8px 16px;
            border: 1px solid #d1d5db;
            background: white;
            color: #374151;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.2s ease;
          ">取消</button>
          <button class="confirm-btn" style="
            padding: 8px 16px;
            border: none;
            background: ${color};
            color: white;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.2s ease;
          ">确认</button>
        </div>
      `;

      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

      // 显示动画
      requestAnimationFrame(() => {
        overlay.style.opacity = '1';
        dialog.style.transform = 'scale(1)';
      });

      // 绑定事件
      const cancelBtn = dialog.querySelector('.cancel-btn') as HTMLElement;
      const confirmBtn = dialog.querySelector('.confirm-btn') as HTMLElement;

      const cleanup = () => {
        overlay.style.opacity = '0';
        dialog.style.transform = 'scale(0.9)';
        setTimeout(() => {
          document.body.removeChild(overlay);
        }, 300);
      };

      cancelBtn.addEventListener('click', () => {
        cleanup();
        resolve(false);
      });

      confirmBtn.addEventListener('click', () => {
        cleanup();
        resolve(true);
      });

      // 点击遮罩层关闭
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          cleanup();
          resolve(false);
        }
      });

      // ESC键关闭
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          cleanup();
          resolve(false);
          document.removeEventListener('keydown', handleKeyDown);
        }
      };
      document.addEventListener('keydown', handleKeyDown);

      // 按钮悬停效果
      cancelBtn.addEventListener('mouseenter', () => {
        cancelBtn.style.background = '#f3f4f6';
      });
      cancelBtn.addEventListener('mouseleave', () => {
        cancelBtn.style.background = 'white';
      });

      confirmBtn.addEventListener('mouseenter', () => {
        confirmBtn.style.opacity = '0.9';
      });
      confirmBtn.addEventListener('mouseleave', () => {
        confirmBtn.style.opacity = '1';
      });
    });
  }

  /**
   * 计算文件哈希值
   */
  private async calculateFileHashes(filename: string): Promise<void> {
    try {
      // 构建完整文件路径
      const filePath = `${this.currentPath}\\${filename}`;

      // 显示哈希计算对话框
      this.showHashCalculationDialog(filePath);

    } catch (error) {
      console.error('计算文件哈希值失败:', error);
      this.updateStatus(`计算文件哈希值失败: ${error}`);
    }
  }

  /**
   * 显示哈希计算对话框
   */
  private showHashCalculationDialog(filePath: string): void {
    // 创建遮罩层
    const overlay = document.createElement('div');
    overlay.className = 'hash-dialog-overlay';

    // 继承当前页面的主题类
    const currentTheme = document.documentElement.getAttribute('data-theme') ||
                        (document.body.classList.contains('dark-theme') ? 'dark' :
                         document.body.classList.contains('sakura-theme') ? 'sakura' : 'light');

    if (currentTheme !== 'light') {
      overlay.setAttribute('data-theme', currentTheme);
    }

    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      backdrop-filter: blur(4px);
    `;

    // 创建对话框
    const dialog = document.createElement('div');
    dialog.className = 'hash-dialog';
    dialog.style.cssText = `
      background: var(--bg-primary, white);
      border-radius: 12px;
      padding: 24px;
      width: 600px;
      max-width: 90vw;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: var(--shadow-xl, 0 20px 40px rgba(0, 0, 0, 0.15));
      border: 1px solid var(--border-color, rgba(0, 0, 0, 0.1));
      animation: hashDialogSlideIn 0.3s ease-out;
    `;

    // 添加动画样式
    if (!document.getElementById('hash-dialog-styles')) {
      const style = document.createElement('style');
      style.id = 'hash-dialog-styles';
      style.textContent = `
        /* 主题适配 */
        .hash-dialog-overlay {
          --bg-primary: white;
          --bg-secondary: #f8f9fa;
          --bg-hover: #e9ecef;
          --text-primary: #333;
          --text-secondary: #666;
          --border-color: #e9ecef;
          --accent-color: #007bff;
          --accent-hover: #0056b3;
          --accent-active: #004085;
          --info-bg: #e7f3ff;
          --error-bg: #f8d7da;
          --error-text: #721c24;
          --error-color: #dc3545;
          --shadow-xl: 0 20px 40px rgba(0, 0, 0, 0.15);
        }

        /* 深色主题 */
        [data-theme="dark"] .hash-dialog-overlay,
        .dark-theme .hash-dialog-overlay {
          --bg-primary: #2d3748;
          --bg-secondary: #4a5568;
          --bg-hover: #718096;
          --text-primary: #e2e8f0;
          --text-secondary: #a0aec0;
          --border-color: #4a5568;
          --accent-color: #63b3ed;
          --accent-hover: #4299e1;
          --accent-active: #3182ce;
          --info-bg: #2c5282;
          --error-bg: #742a2a;
          --error-text: #feb2b2;
          --error-color: #f56565;
          --shadow-xl: 0 20px 40px rgba(0, 0, 0, 0.4);
        }

        /* Sakura主题 */
        [data-theme="sakura"] .hash-dialog-overlay,
        .sakura-theme .hash-dialog-overlay {
          --bg-primary: #fef7f0;
          --bg-secondary: #fdeee5;
          --bg-hover: #fce4d6;
          --text-primary: #744c3e;
          --text-secondary: #8b6f5c;
          --border-color: #e8c5b5;
          --accent-color: #d97706;
          --accent-hover: #b45309;
          --accent-active: #92400e;
          --info-bg: #fef3c7;
          --error-bg: #fecaca;
          --error-text: #991b1b;
          --error-color: #dc2626;
          --shadow-xl: 0 20px 40px rgba(217, 119, 6, 0.15);
        }

        @keyframes hashDialogSlideIn {
          from {
            opacity: 0;
            transform: scale(0.9) translateY(-20px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        .hash-result-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px;
          margin: 8px 0;
          background: var(--bg-secondary, #f8f9fa);
          border-radius: 8px;
          border: 1px solid var(--border-color, #e9ecef);
          transition: background-color 0.2s ease;
        }

        .hash-result-item:hover {
          background: var(--bg-hover, #e9ecef);
        }

        .hash-label {
          font-weight: 600;
          color: var(--text-primary, #495057);
          min-width: 80px;
        }

        .hash-value {
          font-family: 'Consolas', 'Monaco', monospace;
          font-size: 12px;
          color: var(--text-primary, #212529);
          word-break: break-all;
          flex: 1;
          margin: 0 12px;
          padding: 4px 8px;
          background: var(--bg-primary, white);
          border-radius: 4px;
          border: 1px solid var(--border-color, #dee2e6);
        }

        .hash-copy-btn {
          background: var(--accent-color, #007bff);
          color: white;
          border: none;
          border-radius: 4px;
          padding: 6px 12px;
          cursor: pointer;
          font-size: 12px;
          transition: all 0.2s ease;
        }

        .hash-copy-btn:hover {
          background: var(--accent-hover, #0056b3);
          transform: translateY(-1px);
        }

        .hash-copy-btn:active {
          background: var(--accent-active, #004085);
          transform: translateY(0);
        }

        .loading-spinner {
          display: inline-block;
          width: 20px;
          height: 20px;
          border: 3px solid var(--border-color, #f3f3f3);
          border-top: 3px solid var(--accent-color, #007bff);
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }

    dialog.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h3 style="margin: 0; color: var(--text-primary, #333); font-size: 18px;">文件哈希值计算</h3>
        <button id="hash-close-btn" style="background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text-secondary, #666); padding: 0; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: all 0.2s ease;">×</button>
      </div>

      <div style="margin-bottom: 16px; padding: 12px; background: var(--bg-secondary, #f8f9fa); border-radius: 8px; border-left: 4px solid var(--accent-color, #007bff);">
        <div style="font-weight: 600; color: var(--text-primary, #495057); margin-bottom: 4px;">文件路径:</div>
        <div style="font-family: 'Consolas', 'Monaco', monospace; font-size: 12px; color: var(--text-secondary, #6c757d); word-break: break-all;">${filePath}</div>
      </div>

      <div id="hash-loading" style="text-align: center; padding: 40px;">
        <div class="loading-spinner"></div>
        <div style="margin-top: 16px; color: var(--text-secondary, #666);">正在计算哈希值，请稍候...</div>
      </div>

      <div id="hash-results" style="display: none;">
        <div id="file-info" style="margin-bottom: 20px; padding: 12px; background: var(--info-bg, #e7f3ff); border-radius: 8px; border-left: 4px solid var(--accent-color, #007bff);">
          <div style="font-weight: 600; color: var(--accent-color, #0056b3); margin-bottom: 8px;">文件信息</div>
          <div id="file-size" style="color: var(--text-primary, #495057); font-size: 14px;"></div>
        </div>

        <div style="margin-bottom: 16px;">
          <div style="font-weight: 600; color: var(--text-primary, #333); margin-bottom: 12px;">哈希值结果:</div>
          <div id="hash-values"></div>
        </div>
      </div>

      <div id="hash-error" style="display: none; padding: 12px; background: var(--error-bg, #f8d7da); color: var(--error-text, #721c24); border-radius: 8px; border-left: 4px solid var(--error-color, #dc3545); margin-bottom: 16px;">
      </div>

      <div style="text-align: right; margin-top: 20px;">
        <button id="hash-ok-btn" style="background: var(--accent-color, #007bff); color: white; border: none; border-radius: 6px; padding: 10px 20px; cursor: pointer; font-size: 14px; transition: all 0.2s ease;">关闭</button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // 绑定关闭事件
    const closeBtn = dialog.querySelector('#hash-close-btn') as HTMLElement;
    const okBtn = dialog.querySelector('#hash-ok-btn') as HTMLElement;

    const closeDialog = () => {
      document.body.removeChild(overlay);
    };

    closeBtn.addEventListener('click', closeDialog);
    okBtn.addEventListener('click', closeDialog);

    // 添加悬停效果
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.background = 'var(--bg-hover, rgba(0, 0, 0, 0.1))';
    });
    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.background = 'none';
    });

    okBtn.addEventListener('mouseenter', () => {
      okBtn.style.background = 'var(--accent-hover, #0056b3)';
      okBtn.style.transform = 'translateY(-1px)';
    });
    okBtn.addEventListener('mouseleave', () => {
      okBtn.style.background = 'var(--accent-color, #007bff)';
      okBtn.style.transform = 'translateY(0)';
    });

    // 点击遮罩层关闭
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeDialog();
      }
    });

    // 开始计算哈希值
    this.performHashCalculation(filePath, dialog);
  }

  /**
   * 执行哈希值计算
   */
  private async performHashCalculation(filePath: string, dialog: HTMLElement): Promise<void> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');

      // 调用后端计算哈希值
      const result = await invoke('calculate_file_hashes', { filePath }) as any;

      // 隐藏加载指示器
      const loadingDiv = dialog.querySelector('#hash-loading') as HTMLElement;
      const resultsDiv = dialog.querySelector('#hash-results') as HTMLElement;

      loadingDiv.style.display = 'none';
      resultsDiv.style.display = 'block';

      // 显示文件信息
      const fileSizeDiv = dialog.querySelector('#file-size') as HTMLElement;
      fileSizeDiv.textContent = `文件大小: ${this.formatFileSize(result.file_size)}`;

      // 显示哈希值
      const hashValuesDiv = dialog.querySelector('#hash-values') as HTMLElement;
      const hashTypes = [
        { label: 'MD5', value: result.md5 },
        { label: 'SHA1', value: result.sha1 },
        { label: 'SHA256', value: result.sha256 },
        { label: 'CRC32', value: result.crc32 }
      ];

      hashValuesDiv.innerHTML = hashTypes.map(hash => `
        <div class="hash-result-item">
          <div class="hash-label">${hash.label}:</div>
          <div class="hash-value">${hash.value}</div>
          <button class="hash-copy-btn" data-hash="${hash.value}">复制</button>
        </div>
      `).join('');

      // 绑定复制按钮事件
      hashValuesDiv.querySelectorAll('.hash-copy-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const button = e.target as HTMLElement;
          const hashValue = button.getAttribute('data-hash');
          if (hashValue) {
            try {
              await navigator.clipboard.writeText(hashValue);
              const originalText = button.textContent;
              button.textContent = '已复制';
              button.style.background = '#28a745';
              setTimeout(() => {
                button.textContent = originalText;
                button.style.background = '#007bff';
              }, 1500);
            } catch (error) {
              console.error('复制到剪贴板失败:', error);
              this.updateStatus('复制到剪贴板失败');
            }
          }
        });
      });

      this.updateStatus(`文件哈希值计算完成: ${result.file_path}`);

    } catch (error) {
      console.error('计算哈希值失败:', error);

      // 显示错误信息
      const loadingDiv = dialog.querySelector('#hash-loading') as HTMLElement;
      const errorDiv = dialog.querySelector('#hash-error') as HTMLElement;

      loadingDiv.style.display = 'none';
      errorDiv.style.display = 'block';
      errorDiv.textContent = `计算哈希值失败: ${error}`;

      this.updateStatus(`计算哈希值失败: ${error}`);
    }
  }

  /**
   * 重命名文件
   */
  private async renameFile(filename: string): Promise<void> {
    try {
      // 创建重命名对话框
      const dialog = document.createElement('div');
      dialog.className = 'rename-dialog-overlay';
      dialog.innerHTML = `
        <div class="rename-dialog">
          <div class="rename-dialog-header">
            <h3>重命名文件</h3>
            <button class="rename-dialog-close" title="关闭">×</button>
          </div>
          <div class="rename-dialog-content">
            <div class="rename-input-group">
              <label for="new-filename">新文件名：</label>
              <input type="text" id="new-filename" class="rename-input" value="${filename}" />
            </div>
            <div class="rename-note">
              <small>提示：可以修改完整的文件名，包括扩展名</small>
            </div>
            <div class="rename-dialog-buttons">
              <button class="rename-btn-cancel">取消</button>
              <button class="rename-btn-confirm">确认</button>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(dialog);

      // 获取输入框并选中文件名部分（不包含扩展名）
      const input = dialog.querySelector('#new-filename') as HTMLInputElement;
      input.focus();

      // 智能选择：如果有扩展名，只选中文件名部分
      const lastDotIndex = filename.lastIndexOf('.');
      if (lastDotIndex > 0) {
        input.setSelectionRange(0, lastDotIndex);
      } else {
        input.select();
      }

      // 绑定事件
      const closeBtn = dialog.querySelector('.rename-dialog-close') as HTMLElement;
      const cancelBtn = dialog.querySelector('.rename-btn-cancel') as HTMLElement;
      const confirmBtn = dialog.querySelector('.rename-btn-confirm') as HTMLElement;

      const closeDialog = () => {
        dialog.remove();
      };

      const handleRename = async () => {
        const newFullName = input.value.trim();
        if (!newFullName) {
          MessageManager.showError('文件名不能为空');
          return;
        }

        if (newFullName === filename) {
          closeDialog();
          return;
        }

        // 检查文件名是否包含非法字符
        const invalidChars = /[<>:"/\\|?*]/;
        if (invalidChars.test(newFullName)) {
          MessageManager.showError('文件名不能包含以下字符: < > : " / \\ | ? *');
          return;
        }

        try {
          const oldPath = `${this.currentPath}\\${filename}`;
          await invoke('rename_file', { oldPath, newName: newFullName });

          this.updateStatus(`文件重命名成功: ${filename} → ${newFullName}`);
          closeDialog();

          // 刷新文件列表
          const panel = document.querySelector('.file-panel') as HTMLElement;
          if (panel) {
            await this.refreshFileList(panel);
          }
        } catch (error) {
          console.error('重命名文件失败:', error);
          MessageManager.showError(`重命名失败: ${error}`);
        }
      };

      closeBtn.addEventListener('click', closeDialog);
      cancelBtn.addEventListener('click', closeDialog);
      confirmBtn.addEventListener('click', handleRename);

      // 支持回车键确认
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          handleRename();
        } else if (e.key === 'Escape') {
          closeDialog();
        }
      });

      // 点击遮罩层关闭
      dialog.addEventListener('click', (e) => {
        if (e.target === dialog) {
          closeDialog();
        }
      });

    } catch (error) {
      console.error('显示重命名对话框失败:', error);
      this.updateStatus('显示重命名对话框失败');
    }
  }

  /**
   * 显示图片预览
   */
  private async showImagePreview(filename: string): Promise<void> {
    try {
      const filePath = `${this.currentPath}\\${filename}`;

      // 创建预览对话框（先显示加载状态）
      const dialog = document.createElement('div');
      dialog.className = 'image-preview-overlay';
      dialog.innerHTML = `
        <div class="image-preview-dialog">
          <div class="image-preview-header">
            <h3>图片预览</h3>
            <button class="image-preview-close" title="关闭">×</button>
          </div>
          <div class="image-preview-content">
            <div class="image-display-area">
              <div class="image-loading">
                <div class="loading-spinner"></div>
                <div class="loading-text">正在加载图片...</div>
              </div>
              <div class="image-navigation" style="display: none;">
                <button class="nav-btn prev-btn" title="上一张">‹</button>
                <span class="image-counter">第 1 个，共 1 个</span>
                <button class="nav-btn next-btn" title="下一张">›</button>
              </div>
            </div>
            <div class="image-info-panel">
              <div class="info-item">
                <span class="info-label">文件名：</span>
                <span class="info-value">${filename}</span>
              </div>
              <div class="info-item">
                <span class="info-label">文件大小：</span>
                <span class="info-value">加载中...</span>
              </div>
              <div class="info-item">
                <span class="info-label">图片尺寸：</span>
                <span class="info-value">加载中...</span>
              </div>
              <div class="info-item">
                <span class="info-label">图片格式：</span>
                <span class="info-value" id="image-format">加载中...</span>
              </div>

              <div class="image-actions">
                <button class="image-action-btn detect-images-btn">
                  <span class="btn-icon">🔍</span>
                  <span class="btn-text">检测隐藏图片</span>
                </button>
                <button class="image-action-btn scan-qr-btn">
                  <span class="btn-icon">📱</span>
                  <span class="btn-text">扫描二维码</span>
                </button>
              </div>

              <div class="qr-result" style="display: none;">
                <div class="info-item">
                  <span class="info-label">二维码内容：</span>
                  <span class="info-value" id="qr-content">-</span>
                </div>
                <div class="info-item">
                  <span class="info-label">二维码类型：</span>
                  <span class="info-value" id="qr-type">-</span>
                </div>
                <div class="qr-actions" id="qr-actions" style="display: none;">
                  <button class="action-btn qr-action-btn" id="qr-action-btn">
                    <span class="btn-text">执行操作</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(dialog);

      // 绑定关闭事件
      const closeBtn = dialog.querySelector('.image-preview-close') as HTMLElement;
      const closeDialog = () => {
        dialog.remove();
      };

      closeBtn.addEventListener('click', closeDialog);

      // 点击遮罩层关闭
      dialog.addEventListener('click', (e) => {
        if (e.target === dialog) {
          closeDialog();
        }
      });

      // 支持ESC键关闭
      const handleKeydown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          closeDialog();
          document.removeEventListener('keydown', handleKeydown);
        }
      };
      document.addEventListener('keydown', handleKeydown);

      // 初始化预览状态
      let currentImages: any[] = [];
      let currentImageIndex = 0;

      try {
        // 并行获取图片信息和base64数据
        const [imageInfo, base64Data] = await Promise.all([
          invoke('get_image_info', { filePath }) as Promise<any>,
          invoke('read_image_as_base64', { filePath }) as Promise<string>
        ]);

        currentImages = [{
          index: 0,
          format: this.getImageFormat(filename),
          base64_data: base64Data,
          width: imageInfo.width,
          height: imageInfo.height,
          size: imageInfo.file_size
        }];

        // 更新图片显示
        this.updateImageDisplay(dialog, currentImages[0]);

        // 更新信息面板
        this.updateImageInfo(dialog, imageInfo, filename);

        // 绑定功能按钮事件
        this.bindImagePreviewActions(dialog, filePath, currentImages, () => currentImageIndex, (index) => {
          currentImageIndex = index;
        });

        this.updateStatus(`已打开图片预览: ${filename}`);

      } catch (error) {
        console.error('加载图片失败:', error);

        // 显示错误信息
        const displayArea = dialog.querySelector('.image-display-area') as HTMLElement;
        displayArea.innerHTML = `
          <div class="image-error">
            <div class="error-icon">⚠️</div>
            <div class="error-text">加载图片失败</div>
            <div class="error-detail">${error}</div>
          </div>
        `;

        this.updateStatus(`图片预览失败: ${error}`);
      }

    } catch (error) {
      console.error('显示图片预览失败:', error);
      this.updateStatus(`图片预览失败: ${error}`);
    }
  }

  /**
   * 获取图片格式
   */
  private getImageFormat(filename: string): string {
    const extension = filename.split('.').pop()?.toLowerCase() || '';
    const formatMap: { [key: string]: string } = {
      'jpg': 'JPEG',
      'jpeg': 'JPEG',
      'png': 'PNG',
      'gif': 'GIF',
      'bmp': 'BMP',
      'webp': 'WEBP',
      'svg': 'SVG',
      'tiff': 'TIFF',
      'tif': 'TIFF',
      'ico': 'ICO'
    };
    return formatMap[extension] || 'Unknown';
  }

  /**
   * 更新图片显示
   */
  private updateImageDisplay(dialog: HTMLElement, imageData: any): void {
    const displayArea = dialog.querySelector('.image-display-area') as HTMLElement;
    const navigationDiv = displayArea.querySelector('.image-navigation') as HTMLElement;

    displayArea.innerHTML = `
      <img src="${imageData.base64_data}" alt="预览图片" class="preview-image" />
    `;

    // 重新添加导航栏
    if (navigationDiv) {
      displayArea.appendChild(navigationDiv);
    }
  }

  /**
   * 更新图片信息
   */
  private updateImageInfo(dialog: HTMLElement, imageInfo: any, filename: string): void {
    const infoItems = dialog.querySelectorAll('.info-value');
    if (infoItems.length >= 4) {
      (infoItems[1] as HTMLElement).textContent = this.formatFileSize(imageInfo.file_size);
      (infoItems[2] as HTMLElement).textContent = imageInfo.width > 0 && imageInfo.height > 0
        ? `${imageInfo.width} × ${imageInfo.height}`
        : '无法获取';
      (infoItems[3] as HTMLElement).textContent = this.getImageFormat(filename);
    }
  }

  /**
   * 绑定图片预览功能按钮事件
   */
  private bindImagePreviewActions(
    dialog: HTMLElement,
    filePath: string,
    images: any[],
    getCurrentIndex: () => number,
    setCurrentIndex: (index: number) => void
  ): void {
    const detectBtn = dialog.querySelector('.detect-images-btn') as HTMLButtonElement;
    const scanQrBtn = dialog.querySelector('.scan-qr-btn') as HTMLButtonElement;

    // 检测隐藏图片
    detectBtn?.addEventListener('click', async () => {
      try {
        detectBtn.innerHTML = '<span class="btn-icon">⏳</span><span class="btn-text">检测中...</span>';
        detectBtn.disabled = true;

        const result = await invoke('detect_multiple_images', { filePath }) as any;

        if (result.total_count > 1) {
          // 更新图片列表
          images.splice(0, images.length, ...result.images);

          // 显示导航栏
          const navigationDiv = dialog.querySelector('.image-navigation') as HTMLElement;
          if (navigationDiv) {
            navigationDiv.style.display = 'flex';
            this.updateImageNavigation(dialog, images, getCurrentIndex());
          }

          // 绑定导航事件
          this.bindImageNavigation(dialog, images, getCurrentIndex, setCurrentIndex);

          this.updateStatus(`检测到 ${result.total_count} 个图片`);
        } else {
          this.updateStatus('未检测到隐藏图片');
        }
      } catch (error) {
        console.error('检测隐藏图片失败:', error);
        this.updateStatus(`检测失败: ${error}`);
      } finally {
        detectBtn.innerHTML = '<span class="btn-icon">🔍</span><span class="btn-text">检测隐藏图片</span>';
        detectBtn.disabled = false;
      }
    });

    // 扫描二维码
    scanQrBtn?.addEventListener('click', async () => {
      try {
        scanQrBtn.innerHTML = '<span class="btn-icon">⏳</span><span class="btn-text">扫描中...</span>';
        scanQrBtn.disabled = true;

        const currentImage = images[getCurrentIndex()];
        const result = await invoke('scan_qr_code', { imageBase64: currentImage.base64_data }) as any;

        this.displayQrResult(dialog, result);

        if (result.found) {
          this.updateStatus('二维码识别成功');
        } else {
          this.updateStatus('未检测到二维码');
        }
      } catch (error) {
        console.error('二维码识别失败:', error);
        this.updateStatus(`二维码识别失败: ${error}`);
      } finally {
        scanQrBtn.innerHTML = '<span class="btn-icon">📱</span><span class="btn-text">扫描二维码</span>';
        scanQrBtn.disabled = false;
      }
    });
  }

  /**
   * 更新图片导航信息
   */
  private updateImageNavigation(dialog: HTMLElement, images: any[], currentIndex: number): void {
    const counter = dialog.querySelector('.image-counter') as HTMLElement;
    if (counter) {
      counter.textContent = `第 ${currentIndex + 1} 个，共 ${images.length} 个`;
    }
  }

  /**
   * 绑定图片导航事件
   */
  private bindImageNavigation(
    dialog: HTMLElement,
    images: any[],
    getCurrentIndex: () => number,
    setCurrentIndex: (index: number) => void
  ): void {
    const prevBtn = dialog.querySelector('.prev-btn') as HTMLElement;
    const nextBtn = dialog.querySelector('.next-btn') as HTMLElement;

    prevBtn?.addEventListener('click', () => {
      const currentIndex = getCurrentIndex();
      if (currentIndex > 0) {
        const newIndex = currentIndex - 1;
        setCurrentIndex(newIndex);
        this.updateImageDisplay(dialog, images[newIndex]);
        this.updateImageNavigation(dialog, images, newIndex);
      }
    });

    nextBtn?.addEventListener('click', () => {
      const currentIndex = getCurrentIndex();
      if (currentIndex < images.length - 1) {
        const newIndex = currentIndex + 1;
        setCurrentIndex(newIndex);
        this.updateImageDisplay(dialog, images[newIndex]);
        this.updateImageNavigation(dialog, images, newIndex);
      }
    });
  }

  /**
   * 显示二维码识别结果
   */
  private displayQrResult(_dialog: HTMLElement, result: any): void {
    if (result.found) {
      this.showQrResultModal(result);
    } else {
      this.showQrResultModal({ found: false, message: '未检测到二维码' });
    }
  }

  /**
   * 显示二维码结果模态框
   */
  private showQrResultModal(result: any): void {
    // 创建模态框遮罩
    const overlay = document.createElement('div');
    overlay.className = 'qr-result-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      backdrop-filter: blur(5px);
    `;

    // 检测当前主题
    const isDarkTheme = document.documentElement.getAttribute('data-theme') === 'dark';

    // 创建模态框内容
    const modal = document.createElement('div');
    modal.className = 'qr-result-modal';
    modal.style.cssText = `
      background: ${isDarkTheme ? '#1e293b' : 'white'};
      border-radius: 12px;
      padding: 24px;
      max-width: 500px;
      width: 90%;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: 0 20px 40px rgba(0, 0, 0, ${isDarkTheme ? '0.3' : '0.15'});
      position: relative;
      border: ${isDarkTheme ? '1px solid #334155' : 'none'};
    `;

    if (result.found) {
      modal.innerHTML = `
        <div class="qr-result-header">
          <h3 style="margin: 0 0 16px 0; color: ${isDarkTheme ? '#f1f5f9' : '#1e293b'}; font-size: 18px; font-weight: 600;">
            📱 二维码识别结果
          </h3>
          <button class="qr-close-btn" style="
            position: absolute;
            top: 16px;
            right: 16px;
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
            color: ${isDarkTheme ? '#94a3b8' : '#64748b'};
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 6px;
            transition: all 0.2s ease;
          " onmouseover="this.style.background='${isDarkTheme ? '#334155' : '#f1f5f9'}'" onmouseout="this.style.background='none'">×</button>
        </div>
        <div class="qr-result-content">
          <div style="margin-bottom: 16px;">
            <label style="display: block; font-weight: 500; color: ${isDarkTheme ? '#e2e8f0' : '#374151'}; margin-bottom: 8px;">类型:</label>
            <span style="
              display: inline-block;
              padding: 4px 12px;
              background: ${isDarkTheme ? '#1e40af' : '#eff6ff'};
              color: ${isDarkTheme ? '#bfdbfe' : '#1d4ed8'};
              border-radius: 20px;
              font-size: 12px;
              font-weight: 500;
            ">${result.qr_type}</span>
          </div>
          <div style="margin-bottom: 20px;">
            <label style="display: block; font-weight: 500; color: ${isDarkTheme ? '#e2e8f0' : '#374151'}; margin-bottom: 8px;">内容:</label>
            <div style="
              padding: 12px;
              background: ${isDarkTheme ? '#0f172a' : '#f8fafc'};
              border: 1px solid ${isDarkTheme ? '#334155' : '#e2e8f0'};
              border-radius: 8px;
              font-family: monospace;
              font-size: 14px;
              color: ${isDarkTheme ? '#f1f5f9' : '#1e293b'};
              word-break: break-all;
              max-height: 200px;
              overflow-y: auto;
            ">${result.content}</div>
          </div>
          <div class="qr-actions" style="display: flex; gap: 12px; justify-content: flex-end;">
            <button class="qr-copy-btn" style="
              padding: 10px 20px;
              background: ${isDarkTheme ? '#334155' : '#f1f5f9'};
              color: ${isDarkTheme ? '#e2e8f0' : '#475569'};
              border: 1px solid ${isDarkTheme ? '#475569' : '#e2e8f0'};
              border-radius: 8px;
              cursor: pointer;
              font-size: 14px;
              font-weight: 500;
              transition: all 0.2s ease;
            " onmouseover="this.style.background='${isDarkTheme ? '#475569' : '#e2e8f0'}'" onmouseout="this.style.background='${isDarkTheme ? '#334155' : '#f1f5f9'}'">
              📋 复制内容
            </button>
            ${result.qr_type === 'URL' ? `
              <button class="qr-open-btn" style="
                padding: 10px 20px;
                background: #3b82f6;
                color: white;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
                transition: all 0.2s ease;
              " onmouseover="this.style.background='#2563eb'" onmouseout="this.style.background='#3b82f6'">
                🔗 打开链接
              </button>
            ` : ''}
          </div>
        </div>
      `;
    } else {
      modal.innerHTML = `
        <div class="qr-result-header">
          <h3 style="margin: 0 0 16px 0; color: ${isDarkTheme ? '#f1f5f9' : '#1e293b'}; font-size: 18px; font-weight: 600;">
            📱 二维码识别结果
          </h3>
          <button class="qr-close-btn" style="
            position: absolute;
            top: 16px;
            right: 16px;
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
            color: ${isDarkTheme ? '#94a3b8' : '#64748b'};
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 6px;
            transition: all 0.2s ease;
          " onmouseover="this.style.background='${isDarkTheme ? '#334155' : '#f1f5f9'}'" onmouseout="this.style.background='none'">×</button>
        </div>
        <div class="qr-result-content">
          <div style="
            text-align: center;
            padding: 40px 20px;
            color: ${isDarkTheme ? '#94a3b8' : '#64748b'};
          ">
            <div style="font-size: 48px; margin-bottom: 16px;">❌</div>
            <div style="font-size: 16px; font-weight: 500; color: ${isDarkTheme ? '#e2e8f0' : '#374151'};">${result.message || '未检测到二维码'}</div>
            <div style="font-size: 14px; margin-top: 8px; color: ${isDarkTheme ? '#64748b' : '#94a3b8'};">
              请确保图片中包含清晰的二维码
            </div>
          </div>
        </div>
      `;
    }

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // 绑定事件
    const closeBtn = modal.querySelector('.qr-close-btn');
    const copyBtn = modal.querySelector('.qr-copy-btn');
    const openBtn = modal.querySelector('.qr-open-btn');

    const closeModal = () => {
      document.body.removeChild(overlay);
    };

    // 关闭按钮
    closeBtn?.addEventListener('click', closeModal);

    // 点击遮罩关闭
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeModal();
      }
    });

    // ESC键关闭
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', handleKeyDown);
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    // 复制按钮
    copyBtn?.addEventListener('click', () => {
      navigator.clipboard.writeText(result.content).then(() => {
        this.updateStatus('内容已复制到剪贴板');
        copyBtn.textContent = '✅ 已复制';
        setTimeout(() => {
          copyBtn.textContent = '📋 复制内容';
        }, 2000);
      }).catch(() => {
        this.updateStatus('复制失败');
      });
    });

    // 打开链接按钮
    openBtn?.addEventListener('click', () => {
      window.open(result.content, '_blank');
      this.updateStatus('已在新窗口打开链接');
    });
  }

  /**
   * 搜索文件内容
   */
  private async searchFileContent(panel: HTMLElement, searchTerm: string): Promise<void> {
    try {
      this.updateStatus('正在搜索文件内容...');

      const dropdown = panel.querySelector('.search-dropdown') as HTMLElement;
      const dropdownList = panel.querySelector('.search-dropdown-list') as HTMLElement;
      const resultCount = panel.querySelector('.search-result-count') as HTMLElement;
      
      if (!dropdown || !dropdownList || !resultCount) {
        console.error('搜索下拉框容器未找到');
        return;
      }

      // 显示下拉框并显示加载状态
      dropdown.style.display = 'block';
      dropdownList.innerHTML = '<div class="dropdown-loading">正在搜索...</div>';
      resultCount.textContent = '搜索中...';

      // 获取用户设置，获取output_path
      const settings = await loadAppSettings();
      const outputPath = settings.output_path || 'output';

      // 构建搜索配置
      const searchConfig = {
        mode: {
          FolderSearch: {
            folder_path: outputPath
          }
        },
        min_length: 4,
        encodings: ['Ascii', 'Utf8'],
        search_pattern: searchTerm,
        use_regex: false,
        case_sensitive: false,
        max_results: null,  // 不限制结果数量，返回全部匹配结果
        thread_count: null
      };

      // 调用后端搜索API
      const result = await invoke('execute_string_search', {
        config: searchConfig
      }) as any;

      // 显示搜索结果
      if (result.strings && result.strings.length > 0) {
        resultCount.textContent = `找到 ${result.strings.length} 个结果`;
        
        // 按文件分组
        const fileGroups = new Map<string, any[]>();
        result.strings.forEach((item: any) => {
          const fileName = item.source_file || '未知文件';
          if (!fileGroups.has(fileName)) {
            fileGroups.set(fileName, []);
          }
          fileGroups.get(fileName)!.push(item);
        });

        // 生成下拉列表HTML
        let dropdownHtml = '';
        fileGroups.forEach((items, fileName) => {
          dropdownHtml += `
            <div class="dropdown-file-group">
              <div class="dropdown-file-header" data-filename="${this.escapeHtml(fileName)}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14,2 14,8 20,8"/>
                </svg>
                <span class="dropdown-filename">${this.escapeHtml(fileName)}</span>
                <span class="dropdown-count">${items.length} 个匹配</span>
              </div>
            </div>
          `;
        });

        dropdownList.innerHTML = dropdownHtml;

        // 绑定点击事件
        const fileHeaders = dropdownList.querySelectorAll('.dropdown-file-header');
        fileHeaders.forEach(header => {
          header.addEventListener('click', async () => {
            const fileName = header.getAttribute('data-filename');
            if (fileName) {
              await this.openFileFromSearch(fileName);
              dropdown.style.display = 'none';
            }
          });
        });

        this.updateStatus(`找到 ${result.strings.length} 个匹配结果`);
      } else {
        resultCount.textContent = '未找到结果';
        dropdownList.innerHTML = '<div class="dropdown-empty">未找到匹配的内容</div>';
        this.updateStatus('未找到匹配的内容');
      }

    } catch (error) {
      console.error('搜索文件内容失败:', error);
      this.updateStatus('搜索失败: ' + error);
      
      const dropdownList = panel.querySelector('.search-dropdown-list') as HTMLElement;
      const resultCount = panel.querySelector('.search-result-count') as HTMLElement;
      if (dropdownList) {
        dropdownList.innerHTML = `<div class="dropdown-error">搜索失败: ${error}</div>`;
      }
      if (resultCount) {
        resultCount.textContent = '搜索失败';
      }
    }
  }

  /**
   * 从搜索结果打开文件
   */
  private async openFileFromSearch(fileName: string): Promise<void> {
    try {
      // 使用智能打开函数，传递 true 表示使用搜索关键词
      await this.smartOpenFile(fileName, true);
    } catch (error) {
      console.error('打开文件失败:', error);
      this.updateStatus(`无法打开文件: ${fileName}`);
    }
  }

  /**
   * HTML转义
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

}