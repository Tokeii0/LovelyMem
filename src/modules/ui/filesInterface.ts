import { invoke } from '@tauri-apps/api/core';
import { loadAppSettings } from '../core/settingsHelper';
import { getMountLetter, getMountRoot, mountPath } from '../core/mountDrive';
import { debounce } from '../utils/helpers';
import { emit } from '@tauri-apps/api/event';
import { IconParkHelper } from '../utils/iconparkHelper';
import { PEAnalysisDialog, PEParseResult } from './peAnalysisDialog';
import { FilePreview } from './filePreview';
import '../../css/filesInterface.css';

export interface FileItem {
  name: string;
  size: number;
  is_dir: boolean;
  modified: string;
  created: string;
  extension: string;
}

export interface FilesInterfaceConfig {
  currentPath: string;
  showHiddenFiles: boolean;
  sortBy: 'name' | 'size' | 'modified' | 'extension';
  sortOrder: 'asc' | 'desc';
  viewMode: 'details' | 'icons';
}

export class FilesInterface {
  private currentPath: string = '';
  private config: FilesInterfaceConfig;
  private originalFileList: FileItem[] = [];
  private container: HTMLElement | null = null;
  private history: string[] = [];
  private historyIndex: number = -1;
  private selectedFiles: Set<string> = new Set();
  private contextMenu: HTMLElement | null = null;
  private outputPath: string = '';
  // PE分析缓存 - 使用文件路径作为key
  private peAnalysisCache: Map<string, PEParseResult> = new Map();
  // 文件快速预览
  private filePreview: FilePreview = new FilePreview();

  constructor() {
    this.config = {
      currentPath: '',
      showHiddenFiles: false,
      sortBy: 'name',
      sortOrder: 'asc',
      viewMode: 'details'
    };
  }

  public render(): string {
    const iconBack = IconParkHelper.getSvgString('left', { size: 18 });
    const iconForward = IconParkHelper.getSvgString('right', { size: 18 });
    const iconUp = IconParkHelper.getSvgString('up', { size: 18 });
    const iconRefresh = IconParkHelper.getSvgString('refresh', { size: 16 });
    const iconSearch = IconParkHelper.getSvgString('search', { size: 16 });
    const iconAddress = IconParkHelper.getSvgString('folder-open', { size: 16 });
    const iconOpen = IconParkHelper.getSvgString('folder-open', { size: 14 });
    const iconNtfs = IconParkHelper.getSvgString('data', { size: 14 });
    const iconFiles = IconParkHelper.getSvgString('file-text', { size: 14 });

    return `
      <div class="file-explorer">
        <div class="explorer-toolbar">
          <div class="nav-group">
            <button class="tool-btn" id="nav-back" title="后退" disabled>
               ${iconBack}
            </button>
            <button class="tool-btn" id="nav-forward" title="前进" disabled>
               ${iconForward}
            </button>
            <button class="tool-btn" id="nav-up" title="上级目录">
               ${iconUp}
            </button>
          </div>
          
          <div class="address-bar-container">
            <div class="address-icon">${iconAddress}</div>
            <div class="breadcrumbs" id="address-breadcrumbs"></div>
            <button class="tool-btn refresh-btn" id="action-refresh" title="刷新">
                ${iconRefresh}
            </button>
          </div>

          <div class="search-box">
            <input type="text" id="file-search" placeholder="搜索文件名 / Enter搜索字符串" title="输入关键词过滤文件名，或按Enter在当前目录搜索字符串" />
            <button class="search-string-btn" id="btn-string-search" title="在当前目录中搜索字符串">${iconSearch}</button>
          </div>
        </div>

        <div class="explorer-body">
            <div class="file-view-container details-view" id="file-view-container">
                <div class="file-list-header">
                    <div class="col-header col-name" data-sort="name">
                        <span>名称</span>
                        <span class="sort-indicator"></span>
                    </div>
                    <div class="col-header col-date" data-sort="modified">
                        <span>修改日期</span>
                        <span class="sort-indicator"></span>
                    </div>
                    <div class="col-header col-type" data-sort="extension">
                        <span>类型</span>
                        <span class="sort-indicator"></span>
                    </div>
                    <div class="col-header col-size" data-sort="size">
                        <span>大小</span>
                        <span class="sort-indicator"></span>
                    </div>
                </div>
                <div class="file-list-body" id="file-list-body">
                    <div class="loading-state">
                        <div class="state-icon spin">${iconRefresh}</div>
                        <div>正在加载...</div>
                    </div>
                </div>
            </div>
            <div class="preview-splitter" id="preview-splitter"></div>
            <div class="file-preview-panel" id="file-preview-panel">
                ${this.filePreview.render()}
            </div>
        </div>

        <div class="explorer-statusbar">
            <div class="status-left">
                <span id="status-item-count">0 个项目</span>
                <span class="status-separator">|</span>
                <span id="status-selection"></span>
            </div>
            <div class="status-right">
                <button class="status-btn" id="btn-switch-ntfs" title="切换到NTFS目录">${iconNtfs} NTFS</button>
                <button class="status-btn" id="btn-switch-files" title="切换到内存文件目录">${iconFiles} 可提取</button>
                <button class="status-btn" id="btn-switch-drive" title="切换到${getMountLetter()}盘">${iconOpen} ${getMountLetter()}盘</button>
            </div>
        </div>
      </div>
    `;
  }

  public async initialize(container: HTMLElement): Promise<void> {
    this.container = container;

    // 绑定预览面板
    const previewPanel = container.querySelector('#file-preview-panel') as HTMLElement;
    if (previewPanel) {
      this.filePreview.attach(previewPanel);
    }

    // 绑定分隔条拖动
    this.bindSplitter();

    try {
      const settings = await loadAppSettings();
      this.outputPath = settings.output_path || 'output';
      await this.navigateTo(this.outputPath);
      this.bindGlobalEvents();
    } catch (error) {
      console.error('Failed to initialize files interface:', error);
      this.showError('初始化失败: ' + error);
    }
  }

  /** 绑定左右面板的分隔条拖动 */
  private bindSplitter(): void {
    if (!this.container) return;
    const splitter = this.container.querySelector('#preview-splitter') as HTMLElement;
    const explorerBody = this.container.querySelector('.explorer-body') as HTMLElement;
    const previewPanel = this.container.querySelector('#file-preview-panel') as HTMLElement;
    if (!splitter || !explorerBody || !previewPanel) return;

    let isDragging = false;

    splitter.addEventListener('mousedown', (e) => {
      isDragging = true;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const rect = explorerBody.getBoundingClientRect();
      const previewWidth = rect.right - e.clientX;
      const minW = 240;
      const maxW = rect.width - 300;
      const clamped = Math.max(minW, Math.min(maxW, previewWidth));
      previewPanel.style.width = `${clamped}px`;
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    });
  }

  private async navigateTo(path: string, addToHistory: boolean = true): Promise<void> {
    this.currentPath = path;
    this.config.currentPath = path;
    
    if (addToHistory) {
        if (this.historyIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyIndex + 1);
        }
        this.history.push(path);
        this.historyIndex = this.history.length - 1;
    }
    
    this.updateNavButtons();
    this.updateSwitchButton();
    await this.refreshFileList();
  }

  private updateNavButtons(): void {
      if (!this.container) return;
      const backBtn = this.container.querySelector('#nav-back') as HTMLButtonElement;
      const fwdBtn = this.container.querySelector('#nav-forward') as HTMLButtonElement;
      if (backBtn) backBtn.disabled = this.historyIndex <= 0;
      if (fwdBtn) fwdBtn.disabled = this.historyIndex >= this.history.length - 1;
  }

  private updateSwitchButton(): void {
      if (!this.container) return;
      const switchBtn = this.container.querySelector('#btn-switch-drive') as HTMLButtonElement;
      if (!switchBtn) return;

      const iconOpen = IconParkHelper.getSvgString('folder-open', { size: 14 });
      
      // 检查当前路径是否是挂载盘
      const driveLetter = getMountLetter();
      const lower = driveLetter.toLowerCase();
      const isMDrive = this.currentPath.toLowerCase().startsWith(`${lower}:\\`) || this.currentPath.toLowerCase() === `${lower}:`;

      if (isMDrive) {
          // 当前在挂载盘，按钮应该显示"输出目录"
          switchBtn.innerHTML = `${iconOpen} 输出目录`;
          switchBtn.title = '切换到输出目录';
      } else {
          // 当前不在挂载盘，按钮应该显示挂载盘
          switchBtn.innerHTML = `${iconOpen} ${driveLetter}盘`;
          switchBtn.title = `切换到${driveLetter}盘`;
      }
  }

  private async refreshFileList(): Promise<void> {
    if (!this.container) return;
    
    const listBody = this.container.querySelector('#file-list-body');
    if (listBody) {
      listBody.innerHTML = `
        <div class="loading-state">
          <div>正在加载...</div>
        </div>
      `;
    }

    this.updateBreadcrumbs();

    try {
      console.log('Fetching file list for path:', this.currentPath);
      const files = await invoke('get_file_list', { path: this.currentPath }) as FileItem[];
      console.log('Received files:', files.length);
      this.originalFileList = files;
      this.selectedFiles.clear();
      this.renderFileList(files);
      this.updateStatusBar();
    } catch (error) {
      console.error('Failed to refresh file list:', error);
      this.showError('无法访问目录: ' + error);
    }
  }

  private renderFileList(files: FileItem[]): void {
    if (!this.container) return;
    const listBody = this.container.querySelector('#file-list-body');
    if (!listBody) return;

    if (files.length === 0) {
      const iconEmpty = IconParkHelper.getSvgString('folder-open', { size: 48, fill: '#ccc' });
      listBody.innerHTML = `
        <div class="empty-state">
          <div class="state-icon">${iconEmpty}</div>
          <div>此文件夹为空</div>
        </div>
      `;
      return;
    }

    const sortedFiles = this.sortFiles(files);
    listBody.innerHTML = sortedFiles.map(file => this.generateFileRowHTML(file)).join('');
    this.bindFileEvents();
    this.updateSortIndicators();
  }

  private generateFileRowHTML(file: FileItem): string {
    const icon = this.getFileIcon(file);
    const date = this.formatDate(file.modified);
    const size = file.is_dir ? '' : this.formatFileSize(file.size);
    const type = file.is_dir ? '文件夹' : (file.extension.toUpperCase() + ' 文件');
    const isSelected = this.selectedFiles.has(file.name) ? 'selected' : '';

    return `
      <div class="file-row ${isSelected}" data-filename="${file.name}" data-is-dir="${file.is_dir}">
        <div class="col-name">
            <span class="file-icon">${icon}</span>
            <span class="file-name-text" title="${file.name}">${file.name}</span>
        </div>
        <div class="col-date">${date}</div>
        <div class="col-type">${type}</div>
        <div class="col-size">${size}</div>
      </div>
    `;
  }

  private sortFiles(files: FileItem[]): FileItem[] {
    return [...files].sort((a, b) => {
      if (a.is_dir && !b.is_dir) return -1;
      if (!a.is_dir && b.is_dir) return 1;

      let result = 0;
      switch (this.config.sortBy) {
        case 'name':
          result = a.name.localeCompare(b.name);
          break;
        case 'size':
          result = a.size - b.size;
          break;
        case 'modified':
             const tA = new Date(parseInt(a.modified) * 1000).getTime();
             const tB = new Date(parseInt(b.modified) * 1000).getTime();
             result = tA - tB;
          break;
        case 'extension':
          result = a.extension.localeCompare(b.extension);
          break;
      }
      return this.config.sortOrder === 'desc' ? -result : result;
    });
  }

  private updateBreadcrumbs(): void {
    if (!this.container) return;
    const breadcrumbContainer = this.container.querySelector('#address-breadcrumbs');
    if (!breadcrumbContainer) return;

    // Display full path with clickable breadcrumbs
    const normalizedPath = this.currentPath.replace(/\\/g, '/');
    const parts = normalizedPath.split('/').filter(part => part.length > 0);

    let html = '';
    let currentPath = '';

    if (parts.length > 0 && parts[0].includes(':')) {
        const drive = parts[0];
        currentPath = drive;
        html += `<div class="crumb" data-path="${drive}/" title="${drive}/">${drive}</div>`;
        
        for (let i = 1; i < parts.length; i++) {
            currentPath += '/' + parts[i];
            const fullPath = currentPath.replace(/\//g, '\\');
            html += `<div class="crumb-separator">›</div>`;
            html += `<div class="crumb" data-path="${fullPath}" title="${fullPath}">${parts[i]}</div>`;
        }
    } else {
        // For relative paths, show as-is
        html = `<div class="crumb" title="${this.currentPath}">${this.currentPath}</div>`;
    }

    breadcrumbContainer.innerHTML = html;

    breadcrumbContainer.querySelectorAll('.crumb').forEach(crumb => {
        crumb.addEventListener('click', () => {
            const path = crumb.getAttribute('data-path');
            if (path && path !== this.currentPath) {
                this.navigateTo(path);
            }
        });
    });
  }

  private bindGlobalEvents(): void {
      if (!this.container) return;

      this.container.querySelector('#nav-back')?.addEventListener('click', () => {
          if (this.historyIndex > 0) {
              this.historyIndex--;
              this.navigateTo(this.history[this.historyIndex], false);
          }
      });

      this.container.querySelector('#nav-forward')?.addEventListener('click', () => {
          if (this.historyIndex < this.history.length - 1) {
              this.historyIndex++;
              this.navigateTo(this.history[this.historyIndex], false);
          }
      });

      this.container.querySelector('#nav-up')?.addEventListener('click', () => {
          const separator = this.currentPath.includes('/') ? '/' : '\\';
          const parts = this.currentPath.split(separator).filter(p => p !== '');
          if (parts.length > 1) {
              parts.pop();
              let parentPath = parts.join(separator);
              if (parentPath.endsWith(':')) parentPath += separator;
              this.navigateTo(parentPath);
          }
      });

      this.container.querySelector('#action-refresh')?.addEventListener('click', () => {
          this.refreshFileList();
      });

      this.container.querySelectorAll('.col-header').forEach(header => {
          header.addEventListener('click', () => {
              const sortKey = header.getAttribute('data-sort') as any;
              if (this.config.sortBy === sortKey) {
                  this.config.sortOrder = this.config.sortOrder === 'asc' ? 'desc' : 'asc';
              } else {
                  this.config.sortBy = sortKey;
                  this.config.sortOrder = 'asc';
              }
              this.renderFileList(this.originalFileList);
          });
      });

      const searchInput = this.container.querySelector('#file-search') as HTMLInputElement;
      searchInput?.addEventListener('input', debounce((e: Event) => {
          const term = (e.target as HTMLInputElement).value.toLowerCase();
          if (term) {
              const filtered = this.originalFileList.filter(f => f.name.toLowerCase().includes(term));
              this.renderFileList(filtered);
          } else {
              this.renderFileList(this.originalFileList);
          }
      }, 200));

      // 按 Enter 键触发字符串搜索
      searchInput?.addEventListener('keydown', async (e) => {
          if (e.key === 'Enter') {
              const term = (e.target as HTMLInputElement).value.trim();
              if (term) {
                  await this.performStringSearch(term);
              }
          }
      });

      // 字符串搜索按钮
      this.container.querySelector('#btn-string-search')?.addEventListener('click', async () => {
          const term = searchInput?.value.trim();
          if (term) {
              await this.performStringSearch(term);
          }
      });
      
      this.container.querySelector('#btn-switch-drive')?.addEventListener('click', async () => {
          // 检查当前路径是否是挂载盘
          const letter = getMountLetter().toLowerCase();
          const isMDrive = this.currentPath.toLowerCase().startsWith(`${letter}:\\`) || this.currentPath.toLowerCase() === `${letter}:`;

          if (isMDrive) {
              // 当前在挂载盘，切换到输出目录
              await this.navigateTo(this.outputPath);
          } else {
              // 当前不在挂载盘，切换到挂载盘
              await this.navigateTo(getMountRoot());
          }
      });

      // 切换到NTFS目录
      this.container.querySelector('#btn-switch-ntfs')?.addEventListener('click', async () => {
          await this.navigateTo(mountPath('forensic', 'ntfs'));
      });

      // 切换到内存文件目录
      this.container.querySelector('#btn-switch-files')?.addEventListener('click', async () => {
          await this.navigateTo(mountPath('forensic', 'files'));
      });
  }

  private bindFileEvents(): void {
      if (!this.container) return;

      const rows = this.container.querySelectorAll('.file-row');
      rows.forEach(row => {
          row.addEventListener('click', () => {
              const filename = row.getAttribute('data-filename') || '';
              const isDir = row.getAttribute('data-is-dir') === 'true';
              this.selectedFiles.clear();
              this.selectedFiles.add(filename);
              this.container?.querySelectorAll('.file-row.selected').forEach(r => r.classList.remove('selected'));
              row.classList.add('selected');
              this.updateStatusBar();

              // 触发快速预览
              if (!isDir) {
                  const separator = this.currentPath.includes('/') ? '/' : '\\';
                  const normBase = this.currentPath.endsWith(separator) ? this.currentPath.slice(0, -1) : this.currentPath;
                  const filePath = `${normBase}${separator}${filename}`;
                  this.filePreview.preview(filePath, filename, false);
              } else {
                  this.filePreview.clear();
              }
          });

          row.addEventListener('dblclick', async () => {
              const filename = row.getAttribute('data-filename') || '';
              const isDir = row.getAttribute('data-is-dir') === 'true';
              
              if (isDir) {
                  const separator = this.currentPath.includes('/') ? '/' : '\\';
                  const normalizedBasePath = this.currentPath.endsWith(separator) ? this.currentPath.slice(0, -1) : this.currentPath;
                  const newPath = `${normalizedBasePath}${separator}${filename}`;
                  this.navigateTo(newPath);
              } else {
                  await this.openFile(filename);
              }
          });
          
          row.addEventListener('contextmenu', (e) => {
              e.preventDefault();
              const filename = row.getAttribute('data-filename') || '';
              const isDir = row.getAttribute('data-is-dir') === 'true';
              this.selectedFiles.clear();
              this.selectedFiles.add(filename);
              this.container?.querySelectorAll('.file-row.selected').forEach(r => r.classList.remove('selected'));
              row.classList.add('selected');
              this.updateStatusBar();
              
              // Show context menu
              const extension = filename.split('.').pop() || '';
              this.showContextMenu((e as MouseEvent).clientX, (e as MouseEvent).clientY, filename, isDir, extension);
          });
      });
  }

  private async openFile(filename: string): Promise<void> {
      const filePath = `${this.currentPath}\\${filename}`;
      const ext = filename.split('.').pop()?.toLowerCase();
      
      try {
          if (ext === 'csv') {
              // CSV文件使用csv_viewer打开
              await invoke('open_csv_viewer', {
                  csvFilePath: filePath,
                  windowTitle: `CSV查看器 - ${filename}`
              });
          } else {
              // 所有其他文件都使用文本查看器打开
              await invoke('open_text_viewer', {
                  textFilePath: filePath,
                  windowTitle: `查看 - ${filename}`,
                  searchQuery: null
              });
          }
      } catch (error) {
          console.error('Failed to open file:', error);
      }
  }

  private showContextMenu(x: number, y: number, filename: string, isDir: boolean, extension: string): void {
    this.hideContextMenu();

    const menu = document.createElement('div');
    menu.className = 'file-context-menu';
    menu.style.position = 'fixed';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.style.zIndex = '10000';

    const menuItems = this.generateContextMenuItems(filename, isDir, extension);
    menu.innerHTML = menuItems;

    document.body.appendChild(menu);
    this.contextMenu = menu;

    menu.querySelectorAll('.context-menu-item:not(.disabled)').forEach(item => {
      item.addEventListener('click', async (e) => {
        e.stopPropagation();
        const action = item.getAttribute('data-action');
        if (action) {
          await this.handleContextMenuAction(action, filename);
          this.hideContextMenu();
        }
      });
    });

    this.adjustContextMenuPosition(menu, x, y);

    document.addEventListener('click', () => this.hideContextMenu(), { once: true });
  }

  private generateContextMenuItems(_filename: string, isDir: boolean, extension: string): string {
    const items = [];
    const getIcon = (emoji: string) => {
      const iconName = IconParkHelper.getIconNameFromEmoji(emoji);
      return iconName ? IconParkHelper.getSvgString(iconName, { size: 16 }) : `<span>${emoji}</span>`;
    };

    if (!isDir) {
      items.push(`<div class="context-menu-item" data-action="open-folder">
        <span class="menu-icon">${getIcon('📂')}</span>
        <span class="menu-text">打开目标文件夹</span>
      </div>`);

      const ext = extension.toLowerCase();

      items.push('<div class="context-menu-separator"></div>');

      if (ext === 'csv') {
        items.push(`<div class="context-menu-item" data-action="view-csv">
          <span class="menu-icon">${getIcon('📊')}</span>
          <span class="menu-text">CSV查看器打开</span>
        </div>`);
      }

      // 所有文件都显示文本查看器选项
      items.push(`<div class="context-menu-item" data-action="view-text">
        <span class="menu-icon">${getIcon('📝')}</span>
        <span class="menu-text">文本查看器打开</span>
      </div>`);

      // 内存图像可视化 - 把文件按原始数据解释为图像
      items.push(`<div class="context-menu-item" data-action="visualize-image">
        <span class="menu-icon">${getIcon('🧩')}</span>
        <span class="menu-text">可视化为图像</span>
      </div>`);

      // PE文件分析 - 仅对PE文件显示
      if (this.isPeFile(ext)) {
        items.push(`<div class="context-menu-item" data-action="analyze-pe">
          <span class="menu-icon">${getIcon('🔍')}</span>
          <span class="menu-text">PE文件分析</span>
        </div>`);
      }

      items.push('<div class="context-menu-separator"></div>');
      
      // 查看属性
      items.push(`<div class="context-menu-item" data-action="view-properties">
        <span class="menu-icon">${getIcon('⚙️')}</span>
        <span class="menu-text">查看属性</span>
      </div>`);
      
      // 复制到输出目录
      items.push(`<div class="context-menu-item" data-action="copy-to-output">
        <span class="menu-icon">${getIcon('📥')}</span>
        <span class="menu-text">复制到输出目录</span>
      </div>`);

      items.push('<div class="context-menu-separator"></div>');
      items.push(`<div class="context-menu-item" data-action="copy-path">
        <span class="menu-icon">${getIcon('📋')}</span>
        <span class="menu-text">复制路径</span>
      </div>`);
    } else {
      items.push(`<div class="context-menu-item" data-action="open">
        <span class="menu-icon">${getIcon('📁')}</span>
        <span class="menu-text">打开目录</span>
      </div>`);
      items.push('<div class="context-menu-separator"></div>');
      
      // 查看属性
      items.push(`<div class="context-menu-item" data-action="view-properties">
        <span class="menu-icon">${getIcon('⚙️')}</span>
        <span class="menu-text">查看属性</span>
      </div>`);
      
      // 复制到输出目录
      items.push(`<div class="context-menu-item" data-action="copy-to-output">
        <span class="menu-icon">${getIcon('📥')}</span>
        <span class="menu-text">复制到输出目录</span>
      </div>`);

      items.push('<div class="context-menu-separator"></div>');
      items.push(`<div class="context-menu-item" data-action="copy-path">
        <span class="menu-icon">${getIcon('📋')}</span>
        <span class="menu-text">复制路径</span>
      </div>`);
    }

    return items.join('');
  }

  private async handleContextMenuAction(action: string, filename: string): Promise<void> {
    const filePath = `${this.currentPath}\\${filename}`;

    try {
      switch (action) {
        case 'open':
          const separator = this.currentPath.includes('/') ? '/' : '\\';
          const newPath = `${this.currentPath}${separator}${filename}`;
          await this.navigateTo(newPath);
          break;
        case 'open-folder':
          await invoke('open_folder_and_select', { path: filePath });
          break;
        case 'view-text':
          await invoke('open_text_viewer', {
            textFilePath: filePath,
            windowTitle: `文本查看器 - ${filename}`,
            searchQuery: null
          });
          break;
        case 'visualize-image':
          await invoke('open_memory_image_visualizer_window', { initialFilePath: filePath });
          break;
        case 'view-csv':
          await invoke('open_csv_viewer', {
            csvFilePath: filePath,
            windowTitle: `CSV查看器 - ${filename}`
          });
          break;
        case 'copy-path':
          await navigator.clipboard.writeText(filePath);
          break;
        case 'view-properties':
          await this.showFileProperties(filename);
          break;
        case 'copy-to-output':
          await this.copyToOutputDirectory(filename);
          break;
        case 'analyze-pe':
          await this.analyzePEFile(filename);
          break;
      }
    } catch (error) {
      console.error('Context menu action failed:', error);
    }
  }

  private adjustContextMenuPosition(menu: HTMLElement, x: number, y: number): void {
    const rect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let adjustedX = x;
    let adjustedY = y;

    if (x + rect.width > viewportWidth) {
      adjustedX = viewportWidth - rect.width - 10;
    }

    if (y + rect.height > viewportHeight) {
      adjustedY = viewportHeight - rect.height - 10;
    }

    menu.style.left = `${adjustedX}px`;
    menu.style.top = `${adjustedY}px`;
  }

  private hideContextMenu(): void {
    if (this.contextMenu) {
      this.contextMenu.remove();
      this.contextMenu = null;
    }
  }

  private updateStatusBar(): void {
      if (!this.container) return;
      const countEl = this.container.querySelector('#status-item-count');
      const selEl = this.container.querySelector('#status-selection');
      
      if (countEl) countEl.textContent = `${this.originalFileList.length} 个项目`;
      if (selEl) {
          if (this.selectedFiles.size > 0) {
              selEl.textContent = `选中 ${this.selectedFiles.size} 个项目`;
          } else {
              selEl.textContent = '';
          }
      }
  }

  private updateSortIndicators(): void {
      if (!this.container) return;
      const iconUp = IconParkHelper.getSvgString('up', { size: 12 });
      const iconDown = IconParkHelper.getSvgString('down', { size: 12 });

      this.container.querySelectorAll('.col-header').forEach(header => {
          const sortKey = header.getAttribute('data-sort');
          const indicator = header.querySelector('.sort-indicator');
          if (indicator) {
              if (this.config.sortBy === sortKey) {
                  indicator.innerHTML = this.config.sortOrder === 'asc' ? iconUp : iconDown;
              } else {
                  indicator.innerHTML = '';
              }
          }
      });
  }

  private showError(message: string): void {
      if (!this.container) return;
      const listBody = this.container.querySelector('#file-list-body');
      if (listBody) {
          listBody.innerHTML = `<div class="error-state">${message}</div>`;
      }
  }

  private getFileIcon(file: FileItem): string {
      if (file.is_dir) {
          return IconParkHelper.getSvgString('folder', { size: 18, fill: '#FCD53F' });
      }
      
      const ext = file.extension.toLowerCase();
      let iconName = 'file-text';
      let color = '#888';

      // 图片
      if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'ico', 'webp'].includes(ext)) {
          iconName = 'pic';
          color = '#20B2AA';
      } 
      // 代码/脚本
      else if (['js', 'ts', 'py', 'html', 'css', 'json', 'java', 'c', 'cpp', 'rs', 'php', 'sql', 'xml', 'yaml'].includes(ext)) {
          iconName = 'code';
          color = '#4169E1';
      } 
      // 可执行/系统
      else if (['exe', 'dll', 'sys', 'bat', 'cmd', 'msi'].includes(ext)) {
          iconName = 'setting';
          color = '#A9A9A9';
      } 
      // 压缩包
      else if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
          iconName = 'folder-open'; // 暂用 folder-open 表示压缩包
          color = '#DAA520';
      }
      // 文档
      else if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md'].includes(ext)) {
          iconName = 'file-text';
          color = '#4682B4';
      }

      return IconParkHelper.getSvgString(iconName, { size: 18, fill: color });
  }

  private formatDate(timestampStr: string): string {
      try {
          const timestamp = parseInt(timestampStr);
          if (isNaN(timestamp)) return timestampStr;
          const date = new Date(timestamp * 1000);
          return date.toLocaleString('zh-CN', { hour12: false });
      } catch {
          return timestampStr;
      }
  }

  private formatFileSize(bytes: number): string {
      if (bytes === 0) return '0 KB';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  private canViewText(ext: string): boolean {
      return ['txt', 'log', 'json', 'xml', 'csv', 'md', 'py', 'js', 'ts', 'html', 'css', 'ini', 'conf', 'yaml', 'toml'].includes(ext.toLowerCase());
  }

  /**
   * 显示文件属性对话框
   */
  private async showFileProperties(filename: string): Promise<void> {
      const filePath = `${this.currentPath}\\${filename}`;
      const file = this.originalFileList.find(f => f.name === filename);
      
      if (!file) return;

      // 创建属性对话框
      const overlay = document.createElement('div');
      overlay.className = 'properties-overlay';
      overlay.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.5);
          z-index: 10001;
          display: flex;
          align-items: center;
          justify-content: center;
      `;

      const dialog = document.createElement('div');
      dialog.className = 'properties-dialog';
      dialog.style.cssText = `
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          padding: 20px;
          min-width: 350px;
          max-width: 500px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      `;

      const iconInfo = IconParkHelper.getSvgString('info', { size: 20 });
      
      dialog.innerHTML = `
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid var(--border-color);">
              <span style="color: var(--primary-color);">${iconInfo}</span>
              <h3 style="margin: 0; font-size: 16px; color: var(--text-primary);">文件属性</h3>
          </div>
          <div style="display: grid; gap: 12px;">
              <div style="display: grid; grid-template-columns: 80px 1fr; gap: 8px; align-items: start;">
                  <span style="color: var(--text-secondary); font-size: 13px;">名称:</span>
                  <span style="color: var(--text-primary); font-size: 13px; word-break: break-all;">${file.name}</span>
              </div>
              <div style="display: grid; grid-template-columns: 80px 1fr; gap: 8px; align-items: start;">
                  <span style="color: var(--text-secondary); font-size: 13px;">路径:</span>
                  <span style="color: var(--text-primary); font-size: 13px; word-break: break-all;">${filePath}</span>
              </div>
              <div style="display: grid; grid-template-columns: 80px 1fr; gap: 8px; align-items: center;">
                  <span style="color: var(--text-secondary); font-size: 13px;">类型:</span>
                  <span style="color: var(--text-primary); font-size: 13px;">${file.is_dir ? '文件夹' : (file.extension ? file.extension.toUpperCase() + ' 文件' : '文件')}</span>
              </div>
              ${!file.is_dir ? `
              <div style="display: grid; grid-template-columns: 80px 1fr; gap: 8px; align-items: center;">
                  <span style="color: var(--text-secondary); font-size: 13px;">大小:</span>
                  <span style="color: var(--text-primary); font-size: 13px;">${this.formatFileSize(file.size)} (${file.size.toLocaleString()} 字节)</span>
              </div>
              ` : ''}
              <div style="display: grid; grid-template-columns: 80px 1fr; gap: 8px; align-items: center;">
                  <span style="color: var(--text-secondary); font-size: 13px;">修改时间:</span>
                  <span style="color: var(--text-primary); font-size: 13px;">${this.formatDate(file.modified)}</span>
              </div>
              <div style="display: grid; grid-template-columns: 80px 1fr; gap: 8px; align-items: center;">
                  <span style="color: var(--text-secondary); font-size: 13px;">创建时间:</span>
                  <span style="color: var(--text-primary); font-size: 13px;">${this.formatDate(file.created)}</span>
              </div>
          </div>
          <div style="display: flex; justify-content: flex-end; margin-top: 20px;">
              <button class="properties-close-btn" style="
                  padding: 6px 16px;
                  background: var(--primary-color);
                  color: white;
                  border: none;
                  border-radius: 4px;
                  cursor: pointer;
                  font-size: 13px;
              ">确定</button>
          </div>
      `;

      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

      // 点击关闭
      overlay.addEventListener('click', (e) => {
          if (e.target === overlay) {
              overlay.remove();
          }
      });

      dialog.querySelector('.properties-close-btn')?.addEventListener('click', () => {
          overlay.remove();
      });
  }

  /**
   * 复制文件到输出目录
   */
  private async copyToOutputDirectory(filename: string): Promise<void> {
      const sourcePath = `${this.currentPath}\\${filename}`;
      const destPath = `${this.outputPath}\\${filename}`;

      try {
          await invoke('copy_file', { 
              sourcePath: sourcePath, 
              targetPath: destPath 
          });
          console.log(`File copied to: ${destPath}`);
      } catch (error) {
          console.error('Failed to copy file:', error);
      }
  }

  /**
   * 在当前目录执行字符串搜索
   */
  private async performStringSearch(searchTerm: string): Promise<void> {
      if (!searchTerm || !this.currentPath) return;

      try {
          // 打开字符串搜索窗口
          await invoke('open_string_search_window');
          
          // 等待窗口初始化完成后发送搜索参数
          setTimeout(async () => {
              await emit('string-search-quick-start', {
                  folderPath: this.currentPath,
                  searchPattern: searchTerm
              });
          }, 500);
          
          console.log(`Opening string search window for: ${searchTerm} in ${this.currentPath}`);
      } catch (error) {
          console.error('String search failed:', error);
      }
  }

  /**
   * 判断是否为PE文件（可执行文件）或内存转储文件
   */
  private isPeFile(ext: string): boolean {
      return ['exe', 'dll', 'sys', 'ocx', 'scr', 'drv', 'cpl', 'efi', 'dmp'].includes(ext.toLowerCase());
  }

  /**
   * 分析PE文件
   */
  private async analyzePEFile(filename: string): Promise<void> {
      const filePath = `${this.currentPath}\\${filename}`;
      
      // 检查缓存
      if (this.peAnalysisCache.has(filePath)) {
          console.log(`使用缓存的PE分析结果: ${filePath}`);
          const cachedResult = this.peAnalysisCache.get(filePath)!;
          PEAnalysisDialog.show(cachedResult);
          return;
      }
      
      // 创建loading提示
      const loadingOverlay = PEAnalysisDialog.createLoadingOverlay(filename);
      document.body.appendChild(loadingOverlay);
      
      try {
          console.log(`开始分析PE文件: ${filePath}`);
          
          // 调用后端命令解析PE文件
          const result = await invoke('parse_pe_file_command', {
              filePath: filePath,
              outputBasePath: this.outputPath
          }) as PEParseResult;
          
          console.log('PE解析结果:', result);
          
          // 存入缓存
          this.peAnalysisCache.set(filePath, result);
          
          // 移除loading
          loadingOverlay.remove();
          
          // 显示解析结果对话框
          PEAnalysisDialog.show(result);
          
      } catch (error) {
          // 移除loading
          loadingOverlay.remove();
          
          console.error('PE文件分析失败:', error);
          PEAnalysisDialog.showErrorDialog(filename, String(error));
      }
  }
}
