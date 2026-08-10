/**
 * 内存文件浏览器管理器
 * 负责内存取证文件的浏览和管理功能
 */

import { invoke } from '@tauri-apps/api/core';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { MemoryFileBrowserConfig, FileTreeNode } from './types';
import { StateManager } from '../core/stateManager';
import { mountPath } from '../core/mountDrive';

export class MemoryFileBrowserManager {
  private container: HTMLElement | null = null;
  private fileTree: FileTreeNode[] = [];
  private currentPath: string;

  constructor(_stateManager: StateManager, config: MemoryFileBrowserConfig) {
    this.currentPath = config.ntfsPath; // 初始化当前路径
  }

  /**
   * 初始化内存文件浏览器
   */
  public async init(): Promise<void> {
    try {
      console.log('🗂️ 初始化内存文件浏览器');

      // 按配置的挂载盘符修正 NTFS 根路径（macOS 走桌面目录，保持不变）
      const isMacOS = navigator.platform.toLowerCase().includes('mac') ||
                      navigator.userAgent.toLowerCase().includes('mac');
      if (!isMacOS) {
        this.currentPath = mountPath('forensic', 'ntfs', '0');
      }

      // 加载样式
      this.loadStyles();

      this.createContainer();
      this.bindEvents();
    } catch (error) {
      console.error('初始化内存文件浏览器失败:', error);
    }
  }

  /**
   * 加载样式文件
   */
  private loadStyles(): void {
    const existingLink = document.querySelector('link[href*="memory-file-browser.css"]');
    //console.log('🗂️ 检查现有样式链接:', existingLink);

    if (!existingLink) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = './src/modules/memory-file-browser/styles/memory-file-browser.css';
      document.head.appendChild(link);
      //onsole.log('🗂️ 内存文件浏览器样式已加载，路径:', link.href);

      // 检查样式是否加载成功
      link.onload = () => {
        //console.log('🗂️ 样式文件加载成功');
      };
      link.onerror = () => {
        console.error('🗂️ 样式文件加载失败');
      };
    } else {
      console.log('🗂️ 样式文件已存在，跳过加载');
    }
  }

  /**
   * 显示内存文件浏览器
   */
  public async show(): Promise<void> {
    console.log('🗂️ show() 方法被调用');

    try {
      // 创建独立窗口
      const webview = new WebviewWindow('memory-file-browser', {
        url: '/memory-file-browser.html',
        title: '内存文件浏览器',
        width: 1000,
        height: 700,
        minWidth: 800,
        minHeight: 600,
        resizable: true,
        maximizable: true,
        minimizable: true,
        closable: true,
        center: true,
        decorations: false, // 禁用系统标题栏
        alwaysOnTop: false,
        skipTaskbar: false,
        theme: 'auto' as any
      });

      console.log('🗂️ 内存文件浏览器窗口已创建');

      // 等待窗口加载完成
      await webview.once('tauri://created', () => {
        console.log('🗂️ 内存文件浏览器窗口创建完成');
      });

    } catch (error) {
      console.error('🗂️ 创建内存文件浏览器窗口失败:', error);
      // 如果创建窗口失败，回退到原来的方式
      this.showInCurrentWindow();
    }
  }

  /**
   * 在当前窗口中显示（回退方案）
   */
  private showInCurrentWindow(): void {
    console.log('🗂️ 在当前窗口中显示内存文件浏览器');

    if (!this.container) {
      console.log('🗂️ 容器不存在，尝试创建');
      this.createContainer();
    }

    if (this.container) {
      this.container.classList.add('visible');
      console.log('🗂️ 显示内存文件浏览器 - 容器已添加 visible 类');
      console.log('🗂️ 容器当前类名:', this.container.className);
    } else {
      console.error('🗂️ 错误：容器仍然不存在');
    }
  }

  /**
   * 隐藏内存文件浏览器
   */
  public hide(): void {
    if (this.container) {
      this.container.classList.remove('visible');
      console.log('🗂️ 隐藏内存文件浏览器');
    }
  }

  /**
   * 切换显示状态
   */
  public toggle(): void {
    if (this.container) {
      if (this.container.classList.contains('visible')) {
        this.hide();
      } else {
        this.show();
      }
    }
  }

  /**
   * 显示NTFS时间线功能
   */
  public showNTFSTimeline(): void {
    this.createNTFSTimelineModal();
  }

  /**
   * 创建容器
   */
  private createContainer(): void {
    // 移除现有容器
    const existing = document.getElementById('memory-file-browser');
    if (existing) {
      existing.remove();
    }

    // 创建新容器
    this.container = document.createElement('div');
    this.container.id = 'memory-file-browser';
    this.container.className = 'memory-file-browser';
    
    this.container.innerHTML = this.generateHTML();
    
    // 添加到页面
    document.body.appendChild(this.container);
  }

  /**
   * 生成HTML内容
   */
  private generateHTML(): string {
    return `
      <div class="memory-browser-toolbar">
        <div class="memory-browser-title">
          <span class="icon">🗂️</span>
          <span>内存文件浏览器</span>
        </div>
        <div class="memory-browser-actions">
          <button class="memory-browser-btn primary" data-action="ntfs-timeline">
            <span>📅</span>
            <span>NTFS文件时间线</span>
          </button>
          <button class="memory-browser-btn" data-action="refresh">
            <span>🔄</span>
            <span>刷新</span>
          </button>
          <button class="memory-browser-btn" data-action="close">
            <span>✕</span>
            <span>关闭</span>
          </button>
        </div>
      </div>
      <div class="memory-browser-content">
        <div id="memory-browser-main">
          <p style="text-align: center; color: var(--text-secondary); margin-top: 40px;">
            点击"NTFS文件时间线"开始浏览内存文件系统
          </p>
        </div>
      </div>
    `;
  }

  /**
   * 创建NTFS时间线模态对话框
   */
  private createNTFSTimelineModal(): void {
    // 移除现有模态框
    const existing = document.getElementById('ntfs-timeline-modal');
    if (existing) {
      existing.remove();
    }

    const modal = document.createElement('div');
    modal.id = 'ntfs-timeline-modal';
    modal.className = 'ntfs-timeline-modal';
    
    modal.innerHTML = `
      <div class="ntfs-timeline-dialog">
        <div class="ntfs-timeline-header">
          <div class="ntfs-timeline-title">
            <span>📅</span>
            <span>NTFS文件时间线</span>
          </div>
          <button class="ntfs-timeline-close" data-action="close-modal">✕</button>
        </div>
        <div class="ntfs-timeline-body">
          <p class="ntfs-timeline-description">
            点击下方按钮开始浏览NTFS文件系统。将以树形结构显示文件系统的层次关系，您可以展开目录查看其中的文件和子目录。
          </p>
          <div class="ntfs-timeline-options">
            <div class="ntfs-timeline-option" data-action="tree-view">
              <div class="ntfs-timeline-option-icon">🌳</div>
              <div class="ntfs-timeline-option-content">
                <div class="ntfs-timeline-option-title">开始浏览文件系统</div>
                <div class="ntfs-timeline-option-desc">以树形结构浏览NTFS文件系统，显示目录层次关系</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // 绑定模态框事件
    this.bindModalEvents(modal);

    // 添加动画
    setTimeout(() => {
      modal.style.opacity = '1';
    }, 10);
  }

  /**
   * 绑定事件
   */
  private bindEvents(): void {
    if (!this.container) return;

    // 工具栏按钮事件
    this.container.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const button = target.closest('[data-action]') as HTMLElement;
      
      if (button) {
        const action = button.getAttribute('data-action');
        this.handleToolbarAction(action);
      }
    });
  }

  /**
   * 绑定模态框事件
   */
  private bindModalEvents(modal: HTMLElement): void {
    modal.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const button = target.closest('[data-action]') as HTMLElement;
      
      if (button) {
        const action = button.getAttribute('data-action');
        this.handleModalAction(action, modal);
      }
    });

    // 点击遮罩关闭
    modal.addEventListener('click', (event) => {
      if (event.target === modal) {
        this.closeModal(modal);
      }
    });

    // ESC键关闭
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        this.closeModal(modal);
        document.removeEventListener('keydown', handleKeyDown);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
  }

  /**
   * 处理工具栏操作
   */
  private handleToolbarAction(action: string | null): void {
    switch (action) {
      case 'ntfs-timeline':
        this.showNTFSTimeline();
        break;
      case 'refresh':
        this.refreshContent();
        break;
      case 'close':
        this.hide();
        break;
    }
  }

  /**
   * 处理模态框操作
   */
  private async handleModalAction(action: string | null, modal: HTMLElement): Promise<void> {
    switch (action) {
      case 'close-modal':
        this.closeModal(modal);
        break;
      case 'tree-view':
        this.closeModal(modal);
        await this.showTreeView();
        break;
    }
  }

  /**
   * 关闭模态框
   */
  private closeModal(modal: HTMLElement): void {
    modal.style.opacity = '0';
    setTimeout(() => {
      if (modal.parentNode) {
        modal.parentNode.removeChild(modal);
      }
    }, 300);
  }



  /**
   * 显示树视图
   */
  private async showTreeView(): Promise<void> {
    console.log('🗂️ 显示树视图');
    try {
      await this.loadFileTree();
      this.renderTreeView();
    } catch (error) {
      console.error('加载树视图失败:', error);
      this.updateMainContent('<p style="text-align: center; color: var(--text-danger); margin-top: 40px;">加载文件树失败，请检查NTFS路径是否可访问</p>');
    }
  }

  /**
   * 加载文件树
   */
  private async loadFileTree(): Promise<void> {
    try {
      // 使用现有的get_file_list命令获取文件列表
      console.log('🗂️ 加载文件树，路径:', this.currentPath);
      const files = await invoke('get_file_list', { path: this.currentPath }) as any[];
      this.fileTree = this.convertToFileTree(files);
      console.log('🗂️ 文件树加载完成，共', this.fileTree.length, '项');
    } catch (error) {
      console.error('加载文件树失败:', error);
      throw error;
    }
  }

  /**
   * 转换为文件树格式
   */
  private convertToFileTree(files: any[]): FileTreeNode[] {
    return files
      .filter(file => {
        // 过滤掉以$开头的系统文件（如$AttrDef），这些通常不是有效的目录
        if (file.name.startsWith('$')) {
          return false;
        }
        return true;
      })
      .map(file => ({
        name: file.name,
        path: `${this.currentPath}\\${file.name}`,
        isDirectory: file.is_dir,
        size: file.size,
        modified: file.modified,
        extension: file.extension,
        expanded: false,
        level: 0
      }));
  }



  /**
   * 渲染树视图
   */
  private renderTreeView(): void {
    const treeHTML = this.generateTreeHTML(this.fileTree);
    this.updateMainContent(`
      <div class="file-tree-container">
        <div class="file-tree-header">
          <h3>📁 ${this.currentPath}</h3>
          <p>共 ${this.fileTree.length} 项</p>
        </div>
        <div class="file-tree" id="file-tree">
          ${treeHTML}
        </div>
      </div>
    `);

    // 绑定树视图事件
    this.bindTreeEvents();
  }



  /**
   * 生成树HTML
   */
  private generateTreeHTML(nodes: FileTreeNode[]): string {
    return nodes.map(node => `
      <div class="file-tree-node" data-path="${node.path}" data-is-dir="${node.isDirectory}" data-expanded="${node.expanded || false}">
        <div class="file-tree-item">
          ${node.isDirectory ? `<span class="file-tree-expand" data-action="toggle-expand">${node.expanded ? '▼' : '▶'}</span>` : '<span class="file-tree-expand-placeholder"></span>'}
          <span class="file-tree-icon">${node.isDirectory ? '📁' : this.getFileIcon(node.extension || '')}</span>
          <span class="file-tree-name">${node.name}</span>
          ${node.size ? `<span class="file-tree-size">${this.formatFileSize(node.size)}</span>` : ''}
        </div>
        ${node.children && node.expanded ? `<div class="file-tree-children">${this.generateTreeHTML(node.children)}</div>` : ''}
      </div>
    `).join('');
  }

  /**
   * 获取文件图标
   */
  private getFileIcon(extension: string): string {
    const ext = extension.toLowerCase();
    const iconMap: { [key: string]: string } = {
      'txt': '📄',
      'csv': '📊',
      'json': '📋',
      'xml': '📄',
      'log': '📜',
      'exe': '⚙️',
      'dll': '🔧',
      'sys': '⚙️',
      'jpg': '🖼️',
      'png': '🖼️',
      'gif': '🖼️',
      'pdf': '📕',
      'zip': '📦',
      'rar': '📦'
    };
    return iconMap[ext] || '📄';
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
   * 更新主内容区域
   */
  private updateMainContent(html: string): void {
    const mainContent = document.getElementById('memory-browser-main');
    if (mainContent) {
      mainContent.innerHTML = html;
    }
  }

  /**
   * 刷新内容
   */
  private async refreshContent(): Promise<void> {
    console.log('🗂️ 刷新内容');
    await this.showTreeView();
  }

  /**
   * 绑定树视图事件
   */
  private bindTreeEvents(): void {
    const fileTree = document.getElementById('file-tree');
    if (!fileTree) return;

    fileTree.addEventListener('click', async (event) => {
      const target = event.target as HTMLElement;

      // 处理展开/折叠
      if (target.classList.contains('file-tree-expand')) {
        event.stopPropagation();
        const node = target.closest('.file-tree-node') as HTMLElement;
        if (node) {
          await this.toggleNodeExpansion(node);
        }
        return;
      }

      // 处理文件/文件夹点击
      const nodeElement = target.closest('.file-tree-node') as HTMLElement;
      if (nodeElement) {
        const path = nodeElement.getAttribute('data-path');
        const isDir = nodeElement.getAttribute('data-is-dir') === 'true';

        if (path) {
          if (isDir) {
            // 双击文件夹展开/折叠
            if (event.detail === 2) {
              await this.toggleNodeExpansion(nodeElement);
            }
          } else {
            // 双击文件打开
            if (event.detail === 2) {
              await this.openFile(path);
            }
          }
        }
      }
    });
  }

  /**
   * 切换节点展开状态
   */
  private async toggleNodeExpansion(nodeElement: HTMLElement): Promise<void> {
    const path = nodeElement.getAttribute('data-path');
    const isExpanded = nodeElement.getAttribute('data-expanded') === 'true';

    if (!path) return;

    if (isExpanded) {
      // 折叠节点
      nodeElement.setAttribute('data-expanded', 'false');
      const expandIcon = nodeElement.querySelector('.file-tree-expand');
      if (expandIcon) {
        expandIcon.textContent = '▶';
      }
      const children = nodeElement.querySelector('.file-tree-children');
      if (children) {
        children.remove();
      }
    } else {
      // 展开节点
      try {
        const children = await this.loadDirectoryChildren(path);
        if (children.length > 0) {
          nodeElement.setAttribute('data-expanded', 'true');
          const expandIcon = nodeElement.querySelector('.file-tree-expand');
          if (expandIcon) {
            expandIcon.textContent = '▼';
          }

          const childrenContainer = document.createElement('div');
          childrenContainer.className = 'file-tree-children';
          childrenContainer.innerHTML = this.generateTreeHTML(children);
          nodeElement.appendChild(childrenContainer);
        }
      } catch (error) {
        console.error('加载子目录失败:', error);
      }
    }
  }

  /**
   * 加载目录子项
   */
  private async loadDirectoryChildren(path: string): Promise<FileTreeNode[]> {
    try {
      const files = await invoke('get_file_list', { path }) as any[];
      // 临时保存当前路径
      const originalPath = this.currentPath;
      // 设置为子目录路径来正确构建子项路径
      this.currentPath = path;
      const children = this.convertToFileTree(files);
      // 恢复原路径
      this.currentPath = originalPath;
      return children;
    } catch (error) {
      console.error('加载目录子项失败:', error);
      return [];
    }
  }



  /**
   * 打开文件
   */
  private async openFile(path: string): Promise<void> {
    console.log('🗂️ 打开文件:', path);
    try {
      // 使用hexdump方式打开文件
      await invoke('open_file_with_default', { path: path });
    } catch (error) {
      console.error('打开文件失败:', error);
      // 如果默认打开失败，尝试使用hexdump
      try {
        await invoke('open_hexdump', { filePath: path });
      } catch (hexError) {
        console.error('Hexdump打开失败:', hexError);
      }
    }
  }

  /**
   * 销毁管理器
   */
  public destroy(): void {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }

    // 移除模态框
    const modal = document.getElementById('ntfs-timeline-modal');
    if (modal) {
      modal.remove();
    }
  }
}
