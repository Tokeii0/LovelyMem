/**
 * NTFS 文件树查看器组件
 * 从 timeline_ntfs.csv 解析并展示文件目录树结构
 * Action (CRE/MOD/RD) 以彩色徽标方式融合到每个节点
 */

import { invoke } from '@tauri-apps/api/core';
import { loadAppSettings } from '../../core/settingsHelper';
import { getMountLetter, mountPath } from '../../core/mountDrive';
import { RowContextMenuHost } from './rowContextMenuShared';

// ---- 类型定义 ----

interface NtfsFileTreeNode {
  name: string;
  full_path: string;
  is_directory: boolean;
  size: string | null;
  mft_ref: string | null;
  children: NtfsFileTreeNode[];
  cre_count: number;
  mod_count: number;
  rd_count: number;
  first_created: string | null;
  last_modified: string | null;
  last_read: string | null;
  action_count: number;
  is_orphan: boolean;
}

interface NtfsFileTreeStats {
  total_files: number;
  total_directories: number;
  orphan_files: number;
  total_cre: number;
  total_mod: number;
  total_rd: number;
  total_entries: number;
}

interface NtfsFileTreeResult {
  roots: NtfsFileTreeNode[];
  stats: NtfsFileTreeStats;
}

// ---- SVG 图标 ----

const TREE_ICONS = {
  folder_closed: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>',
  folder_open: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v1M2 10h20l-2 9H4l-2-9z"></path></svg>',
  file: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>',
  chevron_right: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>',
  chevron_down: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>',
  search: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>',
  warning: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
  filter_all: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>',
};

// 常见文件扩展名分组
const EXT_GROUPS: { id: string; label: string; exts: string[] }[] = [
  { id: 'doc',     label: '文档',   exts: ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'pdf', 'txt', 'rtf', 'odt', 'csv', 'wps'] },
  { id: 'img',     label: '图片',   exts: ['jpg', 'jpeg', 'png', 'bmp', 'gif', 'ico', 'svg', 'tif', 'tiff', 'webp', 'psd'] },
  { id: 'exe',     label: '可执行', exts: ['exe', 'dll', 'sys', 'drv', 'bat', 'cmd', 'com', 'scr', 'msi'] },
  { id: 'archive', label: '压缩包', exts: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'cab'] },
  { id: 'db',      label: '数据库', exts: ['db', 'sqlite', 'sqlite3', 'mdb', 'accdb', 'ldf', 'mdf'] },
  { id: 'script',  label: '脚本',   exts: ['js', 'ts', 'py', 'ps1', 'vbs', 'sh', 'rb', 'php', 'pl', 'lua'] },
  { id: 'config',  label: '配置',   exts: ['ini', 'cfg', 'conf', 'json', 'xml', 'yaml', 'yml', 'toml', 'reg', 'inf'] },
  { id: 'log',     label: '日志',   exts: ['log', 'evt', 'evtx', 'etl'] },
];

// ---- 组件类 ----

export class NtfsFileTreeViewer {
  private container: HTMLElement | null = null;
  private treeData: NtfsFileTreeResult | null = null;
  private expandedPaths: Set<string> = new Set();
  private searchKeyword: string = '';
  private isLoading: boolean = false;
  private error: string | null = null;
  private activeFilter: 'all' | 'cre' | 'mod' | 'rd' | 'orphan' = 'all';
  private activeExtFilter: string = '';  // 空=不过滤, 否则为 EXT_GROUPS 的 id
  private nodeMap: Map<string, NtfsFileTreeNode> = new Map();
  private treeMode: 'ntfs' | 'files' = 'ntfs';
  private contextMenuHost: RowContextMenuHost | null = null;

  /**
   * 初始化
   */
  init(containerId: string): void {
    this.container = document.getElementById(containerId);
  }

  setContextMenuHost(host: RowContextMenuHost | null): void {
    this.contextMenuHost = host;
  }

  /** 树节点 -> 以原始 CSV 列名为键的行数据（供共享右键菜单使用） */
  private toRowData(node: NtfsFileTreeNode): Record<string, string> {
    if (this.treeMode === 'files') {
      return {
        Path: '\\' + node.full_path,
        File: node.name,
        Object: node.mft_ref || '',
        Size: node.size || '',
      };
    }
    return {
      Text: '\\' + node.full_path,
      Name: node.name,
      Size: node.size || '',
      MFT: node.mft_ref || '',
    };
  }

  /**
   * 加载文件树数据
   */
  async loadTree(csvFile: string, mode: 'ntfs' | 'files' = 'ntfs'): Promise<void> {
    if (!this.container) return;

    this.treeMode = mode;
    this.isLoading = true;
    this.error = null;
    this.render();

    try {
      const settings = await loadAppSettings();
      const outputPath = (settings as any).output_path || 'output';
      const csvPath = `${outputPath}\\${csvFile}`;

      const command = mode === 'files' ? 'parse_files_csv_tree' : 'parse_ntfs_timeline_tree';
      const result = await invoke(command, {
        csvFilePath: csvPath,
      }) as NtfsFileTreeResult;

      this.treeData = result;

      // 如果只有一个卷根节点（如 "0"），跳过该层直接显示子节点
      if (result.roots.length === 1 && result.roots[0].is_directory) {
        result.roots = result.roots[0].children;
      }

      // 构建节点查找表
      this.nodeMap.clear();
      this.buildNodeMap(result.roots);

      // 默认不展开任何文件夹
    } catch (e) {
      this.error = String(e);
    } finally {
      this.isLoading = false;
      this.render();
      this.bindEvents();
    }
  }

  /**
   * 渲染组件
   */
  private render(): void {
    if (!this.container) return;

    // 展开/折叠等操作会整体重建 innerHTML，滚动容器随之销毁 → 滚动条跳回顶部。
    // 这里先记下滚动位置，渲染完再还原，保证点击节点时视图不跳。
    const prevScroll = (this.container.querySelector('#ntfs-tree-container') as HTMLElement | null)?.scrollTop ?? 0;

    if (this.isLoading) {
      this.container.innerHTML = `
        <div class="ntfs-tree-loading">
          <div class="ntfs-tree-spinner"></div>
          <div class="ntfs-tree-loading-text">正在解析文件结构...</div>
        </div>
      `;
      return;
    }

    if (this.error) {
      this.container.innerHTML = `
        <div class="ntfs-tree-error">
          <div class="ntfs-tree-error-icon">${TREE_ICONS.warning}</div>
          <div class="ntfs-tree-error-text">${this.escapeHtml(this.error)}</div>
        </div>
      `;
      return;
    }

    if (!this.treeData) {
      this.container.innerHTML = `<div class="ntfs-tree-empty">暂无数据</div>`;
      return;
    }

    const stats = this.treeData.stats;
    const filteredRoots = this.getFilteredRoots();

    this.container.innerHTML = `
      <div class="ntfs-tree-wrapper">
        <!-- 统计信息栏 -->
        <div class="ntfs-tree-stats-bar">
          <div class="ntfs-tree-stats-items">
            <span class="ntfs-tree-stat-item">
              <span class="ntfs-tree-stat-icon">${TREE_ICONS.folder_closed}</span>
              <span class="ntfs-tree-stat-label">目录</span>
              <span class="ntfs-tree-stat-value">${stats.total_directories.toLocaleString()}</span>
            </span>
            <span class="ntfs-tree-stat-item">
              <span class="ntfs-tree-stat-icon">${TREE_ICONS.file}</span>
              <span class="ntfs-tree-stat-label">文件</span>
              <span class="ntfs-tree-stat-value">${stats.total_files.toLocaleString()}</span>
            </span>
            ${this.treeMode === 'ntfs' ? `
            <span class="ntfs-tree-stat-item ntfs-tree-stat-orphan">
              <span class="ntfs-tree-stat-icon">${TREE_ICONS.warning}</span>
              <span class="ntfs-tree-stat-label">孤立</span>
              <span class="ntfs-tree-stat-value">${stats.orphan_files.toLocaleString()}</span>
            </span>
            ` : ''}
            <span class="ntfs-tree-stat-divider"></span>
            ${this.treeMode === 'ntfs' ? `
            <span class="ntfs-tree-stat-item ntfs-tree-stat-cre">
              <span class="ntfs-tree-stat-badge ntfs-badge-cre">CRE</span>
              <span class="ntfs-tree-stat-value">${stats.total_cre.toLocaleString()}</span>
            </span>
            <span class="ntfs-tree-stat-item ntfs-tree-stat-mod">
              <span class="ntfs-tree-stat-badge ntfs-badge-mod">MOD</span>
              <span class="ntfs-tree-stat-value">${stats.total_mod.toLocaleString()}</span>
            </span>
            <span class="ntfs-tree-stat-item ntfs-tree-stat-rd">
              <span class="ntfs-tree-stat-badge ntfs-badge-rd">RD</span>
              <span class="ntfs-tree-stat-value">${stats.total_rd.toLocaleString()}</span>
            </span>
            ` : `
            <span class="ntfs-tree-stat-item ntfs-tree-stat-cre">
              <span class="ntfs-tree-stat-badge ntfs-badge-cre">Data</span>
              <span class="ntfs-tree-stat-value">${stats.total_cre.toLocaleString()}</span>
            </span>
            <span class="ntfs-tree-stat-item ntfs-tree-stat-mod">
              <span class="ntfs-tree-stat-badge ntfs-badge-mod">Image</span>
              <span class="ntfs-tree-stat-value">${stats.total_mod.toLocaleString()}</span>
            </span>
            `}
          </div>
        </div>

        <!-- 工具栏：搜索 + 过滤 -->
        <div class="ntfs-tree-toolbar">
          <div class="ntfs-tree-search">
            <span class="ntfs-tree-search-icon">${TREE_ICONS.search}</span>
            <input type="text" class="ntfs-tree-search-input" 
                   id="ntfs-tree-search-input"
                   placeholder="搜索文件或目录..." 
                   value="${this.escapeHtml(this.searchKeyword)}">
          </div>
          <div class="ntfs-tree-filters">
            <button class="ntfs-tree-filter-btn ${this.activeFilter === 'all' ? 'active' : ''}" data-filter="all">
              ${TREE_ICONS.filter_all} 全部
            </button>
            ${this.treeMode === 'ntfs' ? `
            <button class="ntfs-tree-filter-btn ntfs-filter-cre ${this.activeFilter === 'cre' ? 'active' : ''}" data-filter="cre">
              CRE 创建
            </button>
            <button class="ntfs-tree-filter-btn ntfs-filter-mod ${this.activeFilter === 'mod' ? 'active' : ''}" data-filter="mod">
              MOD 修改
            </button>
            <button class="ntfs-tree-filter-btn ntfs-filter-rd ${this.activeFilter === 'rd' ? 'active' : ''}" data-filter="rd">
              RD 读取
            </button>
            <button class="ntfs-tree-filter-btn ntfs-filter-orphan ${this.activeFilter === 'orphan' ? 'active' : ''}" data-filter="orphan">
              ${TREE_ICONS.warning} 孤立文件
            </button>
            ` : `
            <button class="ntfs-tree-filter-btn ntfs-filter-cre ${this.activeFilter === 'cre' ? 'active' : ''}" data-filter="cre">
              Data 数据
            </button>
            <button class="ntfs-tree-filter-btn ntfs-filter-mod ${this.activeFilter === 'mod' ? 'active' : ''}" data-filter="mod">
              Image 镜像
            </button>
            `}
          </div>
          <div class="ntfs-tree-ext-filters">
            ${EXT_GROUPS.map(g => `
              <button class="ntfs-tree-ext-btn ${this.activeExtFilter === g.id ? 'active' : ''}" data-ext="${g.id}">${g.label}</button>
            `).join('')}
          </div>
        </div>

        <!-- 文件树 -->
        <div class="ntfs-tree-container" id="ntfs-tree-container">
          ${this.renderNodes(filteredRoots, 0)}
        </div>
      </div>
    `;

    // 还原滚动位置（展开/折叠不应让视图跳动）
    if (prevScroll > 0) {
      const treeEl = this.container.querySelector('#ntfs-tree-container') as HTMLElement | null;
      if (treeEl) treeEl.scrollTop = prevScroll;
    }
  }

  /**
   * 获取过滤后的根节点
   */
  private getFilteredRoots(): NtfsFileTreeNode[] {
    if (!this.treeData) return [];

    let roots = this.treeData.roots;

    if (this.searchKeyword || this.activeFilter !== 'all' || this.activeExtFilter) {
      roots = this.filterNodes(roots);
    }

    return roots;
  }

  /**
   * 递归过滤节点
   */
  private filterNodes(nodes: NtfsFileTreeNode[]): NtfsFileTreeNode[] {
    const result: NtfsFileTreeNode[] = [];
    const keyword = this.searchKeyword.toLowerCase();

    for (const node of nodes) {
      const matchesSearch = !keyword || node.name.toLowerCase().includes(keyword) || node.full_path.toLowerCase().includes(keyword);
      const matchesFilter = this.matchesFilter(node);

      // 递归过滤子节点
      const filteredChildren = this.filterNodes(node.children);

      if ((matchesSearch && matchesFilter) || filteredChildren.length > 0) {
        result.push({
          ...node,
          children: filteredChildren.length > 0 ? filteredChildren : (matchesSearch && matchesFilter ? node.children : []),
        });
      }
    }

    return result;
  }

  /**
   * 检查节点是否匹配当前 Action 过滤器
   */
  private matchesFilter(node: NtfsFileTreeNode): boolean {
    // Action / Type 过滤
    let matchesAction = true;
    switch (this.activeFilter) {
      case 'cre': matchesAction = node.cre_count > 0; break;
      case 'mod': matchesAction = node.mod_count > 0; break;
      case 'rd': matchesAction = node.rd_count > 0; break;
      case 'orphan': matchesAction = node.is_orphan; break;
    }

    // 扩展名过滤
    let matchesExt = true;
    if (this.activeExtFilter && !node.is_directory) {
      const group = EXT_GROUPS.find(g => g.id === this.activeExtFilter);
      if (group) {
        const dotIdx = node.name.lastIndexOf('.');
        if (dotIdx >= 0) {
          const ext = node.name.substring(dotIdx + 1).toLowerCase();
          matchesExt = group.exts.includes(ext);
        } else {
          matchesExt = false;
        }
      }
    }

    return matchesAction && matchesExt;
  }

  /**
   * 渲染节点列表
   */
  private renderNodes(nodes: NtfsFileTreeNode[], depth: number): string {
    if (!nodes.length) return '';
    return nodes.map(node => this.renderNode(node, depth)).join('');
  }

  /**
   * 渲染单个节点
   */
  private renderNode(node: NtfsFileTreeNode, depth: number): string {
    const isExpanded = this.expandedPaths.has(node.full_path);
    const hasChildren = node.children.length > 0;
    const paddingLeft = depth * 20 + 8;

    // 文件/文件夹图标
    let icon: string;
    if (node.is_directory) {
      icon = isExpanded ? TREE_ICONS.folder_open : TREE_ICONS.folder_closed;
    } else {
      icon = TREE_ICONS.file;
    }

    // 展开/收起箭头
    const arrow = hasChildren
      ? `<span class="ntfs-tree-arrow ${isExpanded ? 'expanded' : ''}">${isExpanded ? TREE_ICONS.chevron_down : TREE_ICONS.chevron_right}</span>`
      : '<span class="ntfs-tree-arrow-placeholder"></span>';

    // Action 徽标
    const badges = this.renderActionBadges(node);

    // 大小显示
    let sizeStr = '';
    if (this.treeMode === 'files' && node.size && !node.is_directory) {
      sizeStr = `<span class="ntfs-tree-size">${this.formatFileSize(parseInt(node.size, 10) || 0)}</span>`;
    } else if (node.size && node.size !== '0x0') {
      sizeStr = `<span class="ntfs-tree-size">${node.size}</span>`;
    }

    // 孤立文件标记
    const orphanClass = node.is_orphan ? ' ntfs-tree-node-orphan' : '';
    const orphanTag = node.is_orphan && node.name === '$_ORPHAN' ? '<span class="ntfs-tree-orphan-tag">已删除/孤立</span>' : '';

    // 目录/文件类名
    const typeClass = node.is_directory ? 'ntfs-tree-node-dir' : 'ntfs-tree-node-file';

    // 时间/类型信息 tooltip
    const timeInfoParts: string[] = [];
    if (this.treeMode === 'ntfs') {
      if (node.first_created) timeInfoParts.push(`创建: ${node.first_created}`);
      if (node.last_modified) timeInfoParts.push(`修改: ${node.last_modified}`);
      if (node.last_read) timeInfoParts.push(`读取: ${node.last_read}`);
    } else {
      if (node.first_created) timeInfoParts.push(`类型: ${node.first_created}`);
      if (node.mft_ref) timeInfoParts.push(`Object: ${node.mft_ref}`);
      if (node.size && !node.is_directory) timeInfoParts.push(`大小: ${this.formatFileSize(parseInt(node.size, 10) || 0)}`);
    }
    const timeTitle = timeInfoParts.join(' | ');

    // 高亮搜索词
    const nameHtml = this.highlightSearch(node.name);

    const childrenHtml = hasChildren && isExpanded
      ? `<div class="ntfs-tree-children">${this.renderNodes(node.children, depth + 1)}</div>`
      : '';

    return `
      <div class="ntfs-tree-node ${typeClass}${orphanClass}" data-path="${this.escapeHtml(node.full_path)}">
        <div class="ntfs-tree-node-row" style="padding-left: ${paddingLeft}px" title="${this.escapeHtml(timeTitle)}">
          ${arrow}
          <span class="ntfs-tree-icon ${node.is_directory ? 'ntfs-tree-icon-dir' : 'ntfs-tree-icon-file'}">${icon}</span>
          <span class="ntfs-tree-name">${nameHtml}</span>
          ${orphanTag}
          ${badges}
          ${sizeStr}
        </div>
        ${childrenHtml}
      </div>
    `;
  }

  /**
   * 渲染 Action 徽标
   */
  private renderActionBadges(node: NtfsFileTreeNode): string {
    const badges: string[] = [];

    if (this.treeMode === 'ntfs') {
      if (node.cre_count > 0) {
        badges.push(`<span class="ntfs-tree-badge ntfs-badge-cre" title="创建操作: ${node.cre_count} 次${node.first_created ? '\n最早: ' + node.first_created : ''}">CRE:${node.cre_count}</span>`);
      }
      if (node.mod_count > 0) {
        badges.push(`<span class="ntfs-tree-badge ntfs-badge-mod" title="修改操作: ${node.mod_count} 次${node.last_modified ? '\n最后: ' + node.last_modified : ''}">MOD:${node.mod_count}</span>`);
      }
      if (node.rd_count > 0) {
        badges.push(`<span class="ntfs-tree-badge ntfs-badge-rd" title="读取操作: ${node.rd_count} 次${node.last_read ? '\n最后: ' + node.last_read : ''}">RD:${node.rd_count}</span>`);
      }
    } else {
      // files 模式: 显示 Type 徽标
      if (node.first_created && !node.is_directory) {
        const types = node.first_created.split(',').map(t => t.trim());
        for (const t of types) {
          if (t === 'Data') {
            badges.push(`<span class="ntfs-tree-badge ntfs-badge-cre">Data</span>`);
          } else if (t === 'Image') {
            badges.push(`<span class="ntfs-tree-badge ntfs-badge-mod">Image</span>`);
          } else if (t) {
            badges.push(`<span class="ntfs-tree-badge ntfs-badge-rd">${this.escapeHtml(t)}</span>`);
          }
        }
      }
      // 目录显示文件数
      if (node.is_directory && node.action_count > 0) {
        badges.push(`<span class="ntfs-tree-badge" style="background:var(--bg-secondary,#f1f5f9);color:var(--text-secondary,#64748b);border:1px solid var(--border-color,#e2e8f0)">${node.action_count} 个文件</span>`);
      }
    }

    return badges.length > 0 ? `<span class="ntfs-tree-badges">${badges.join('')}</span>` : '';
  }

  /**
   * 高亮搜索关键词
   */
  private highlightSearch(text: string): string {
    const escaped = this.escapeHtml(text);
    if (!this.searchKeyword) return escaped;

    const keyword = this.escapeHtml(this.searchKeyword);
    const regex = new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return escaped.replace(regex, '<mark class="ntfs-tree-highlight">$1</mark>');
  }

  /**
   * HTML 转义
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * 绑定事件
   */
  private bindEvents(): void {
    if (!this.container) return;

    const treeContainer = this.container.querySelector('#ntfs-tree-container');
    if (treeContainer) {
      // 点击节点展开/收起
      treeContainer.addEventListener('click', (e) => {
        const row = (e.target as HTMLElement).closest('.ntfs-tree-node-row');
        if (!row) return;

        const nodeEl = row.closest('.ntfs-tree-node') as HTMLElement;
        if (!nodeEl) return;

        const path = nodeEl.getAttribute('data-path');
        if (!path) return;

        if (this.expandedPaths.has(path)) {
          this.expandedPaths.delete(path);
        } else {
          this.expandedPaths.add(path);
        }

        this.render();
        this.bindEvents();
      });

      // 右键菜单：注入了共享宿主则使用与 CSV 表格视图完全一致的菜单，否则回退到本地菜单
      treeContainer.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const row = (e.target as HTMLElement).closest('.ntfs-tree-node-row');
        if (!row) return;
        const nodeEl = row.closest('.ntfs-tree-node') as HTMLElement;
        if (!nodeEl) return;
        const path = nodeEl.getAttribute('data-path');
        if (!path) return;
        const node = this.nodeMap.get(path);
        if (!node) return;
        if (this.contextMenuHost) {
          const me = e as MouseEvent;
          void this.contextMenuHost.showSharedRowContextMenu({
            rowData: this.toRowData(node),
            loadFileName: this.treeMode === 'files' ? 'files.csv' : 'timeline_ntfs.csv',
            displayName: this.treeMode === 'files' ? '内存文件' : 'NTFS时间线',
            x: me.clientX,
            y: me.clientY,
          });
        } else {
          this.showContextMenu(e as MouseEvent, node);
        }
      });
    }

    // 搜索框
    const searchInput = this.container.querySelector('#ntfs-tree-search-input') as HTMLInputElement;
    if (searchInput) {
      let debounceTimer: number | null = null;
      searchInput.addEventListener('input', () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = window.setTimeout(() => {
          this.searchKeyword = searchInput.value;
          if (this.searchKeyword && this.treeData) {
            this.expandMatchingPaths(this.treeData.roots);
          }
          this.render();
          this.bindEvents();
          const newInput = this.container?.querySelector('#ntfs-tree-search-input') as HTMLInputElement;
          if (newInput) {
            newInput.focus();
            newInput.setSelectionRange(newInput.value.length, newInput.value.length);
          }
        }, 300);
      });
    }

    // 过滤按钮
    const filterBtns = this.container.querySelectorAll('.ntfs-tree-filter-btn');
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const filter = btn.getAttribute('data-filter') as typeof this.activeFilter;
        if (filter) {
          this.activeFilter = filter;
          this.render();
          this.bindEvents();
        }
      });
    });

    // 扩展名过滤按钮
    const extBtns = this.container.querySelectorAll('.ntfs-tree-ext-btn');
    extBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const ext = btn.getAttribute('data-ext') || '';
        // 再次点击同一个则取消
        this.activeExtFilter = this.activeExtFilter === ext ? '' : ext;
        this.render();
        this.bindEvents();
      });
    });

    // 点击空白处关闭右键菜单
    document.addEventListener('click', () => this.hideContextMenu(), { once: true });
  }

  /**
   * 搜索时展开匹配路径的父节点
   */
  private expandMatchingPaths(nodes: NtfsFileTreeNode[]): void {
    const keyword = this.searchKeyword.toLowerCase();
    for (const node of nodes) {
      if (node.name.toLowerCase().includes(keyword)) {
        // 展开此节点的所有父路径
        const parts = node.full_path.split('\\');
        let current = '';
        for (let i = 0; i < parts.length - 1; i++) {
          if (i > 0) current += '\\';
          current += parts[i];
          this.expandedPaths.add(current);
        }
      }
      if (node.children.length > 0) {
        this.expandMatchingPaths(node.children);
      }
    }
  }

  /**
   * 构建节点路径到节点对象的映射
   */
  private buildNodeMap(nodes: NtfsFileTreeNode[]): void {
    for (const node of nodes) {
      this.nodeMap.set(node.full_path, node);
      if (node.children.length > 0) {
        this.buildNodeMap(node.children);
      }
    }
  }

  // ---- 右键菜单 ----

  /**
   * 显示右键菜单
   */
  private showContextMenu(e: MouseEvent, node: NtfsFileTreeNode): void {
    this.hideContextMenu();

    const menu = document.createElement('div');
    menu.className = 'ntfs-tree-context-menu';
    menu.id = 'ntfs-tree-context-menu';

    const items = [
      { label: '查看文件属性', icon: 'info', action: () => this.showPropertiesDialog(node) },
      { label: '查看文件内容', icon: 'file', action: () => this.showFileContent(node) },
    ];

    menu.innerHTML = items.map(item => `
      <div class="ntfs-tree-ctx-item" data-action="${item.label}">
        <span class="ntfs-tree-ctx-icon">${item.icon === 'info'
          ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>'
          : '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>'
        }</span>
        <span class="ntfs-tree-ctx-label">${item.label}</span>
      </div>
    `).join('');

    document.body.appendChild(menu);

    // 定位
    const menuRect = menu.getBoundingClientRect();
    let x = e.clientX;
    let y = e.clientY;
    if (x + menuRect.width > window.innerWidth) x = window.innerWidth - menuRect.width - 4;
    if (y + menuRect.height > window.innerHeight) y = window.innerHeight - menuRect.height - 4;
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    // 绑定菜单项事件
    items.forEach(item => {
      const el = menu.querySelector(`[data-action="${item.label}"]`);
      if (el) {
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this.hideContextMenu();
          item.action();
        });
      }
    });

    // 点击其他区域关闭
    setTimeout(() => {
      const handler = () => { this.hideContextMenu(); document.removeEventListener('click', handler); };
      document.addEventListener('click', handler);
    }, 0);
  }

  /**
   * 关闭右键菜单
   */
  private hideContextMenu(): void {
    const existing = document.getElementById('ntfs-tree-context-menu');
    if (existing) existing.remove();
  }

  // ---- 属性对话框 ----

  /**
   * 显示文件属性对话框
   */
  private showPropertiesDialog(node: NtfsFileTreeNode): void {
    const overlay = document.createElement('div');
    overlay.className = 'ntfs-tree-modal-overlay';
    overlay.id = 'ntfs-tree-modal-overlay';

    const typeLabel = node.is_directory ? '目录' : '文件';
    const orphanLabel = node.is_orphan ? '<span class="ntfs-prop-orphan-tag">已删除/孤立</span>' : '-';

    const rows = [
      ['名称', this.escapeHtml(node.name)],
      ['完整路径', `<span class="ntfs-prop-path">\\0\\${this.escapeHtml(node.full_path)}</span>`],
      ['类型', typeLabel],
      ['大小 (Value32)', node.size || '-'],
      ['MFT 引用 (Value64)', node.mft_ref || '-'],
      ['孤立状态', orphanLabel],
    ];

    const actionRows = [
      ['CRE (创建)', `${node.cre_count} 次`, node.first_created || '-'],
      ['MOD (修改)', `${node.mod_count} 次`, node.last_modified || '-'],
      ['RD (读取)', `${node.rd_count} 次`, node.last_read || '-'],
    ];

    overlay.innerHTML = `
      <div class="ntfs-tree-modal">
        <div class="ntfs-tree-modal-header">
          <span class="ntfs-tree-modal-title">文件属性</span>
          <button class="ntfs-tree-modal-close" id="ntfs-modal-close">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="ntfs-tree-modal-body">
          <table class="ntfs-prop-table">
            <tbody>
              ${rows.map(([k, v]) => `<tr><td class="ntfs-prop-key">${k}</td><td class="ntfs-prop-val">${v}</td></tr>`).join('')}
            </tbody>
          </table>
          <div class="ntfs-prop-section-title">操作记录</div>
          <table class="ntfs-prop-table">
            <thead><tr><th>操作类型</th><th>次数</th><th>时间</th></tr></thead>
            <tbody>
              ${actionRows.map(([type, count, time]) => `<tr><td class="ntfs-prop-key">${type}</td><td>${count}</td><td>${time}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // 关闭逻辑
    const close = () => overlay.remove();
    overlay.querySelector('#ntfs-modal-close')?.addEventListener('click', close);
    overlay.addEventListener('click', (ev) => { if (ev.target === overlay) close(); });
    const escHandler = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { close(); document.removeEventListener('keydown', escHandler); } };
    document.addEventListener('keydown', escHandler);
  }

  // ---- 文件内容查看器 ----

  /**
   * 查看文件内容（通过 MemProcFS 挂载点读取）
   */
  private async showFileContent(node: NtfsFileTreeNode): Promise<void> {
    // 构建 MemProcFS NTFS 挂载路径
    const filePath = mountPath('forensic', 'ntfs', node.full_path.replace(/\//g, '\\'));

    const overlay = document.createElement('div');
    overlay.className = 'ntfs-tree-modal-overlay';
    overlay.id = 'ntfs-tree-modal-overlay';

    overlay.innerHTML = `
      <div class="ntfs-tree-modal ntfs-tree-modal-wide">
        <div class="ntfs-tree-modal-header">
          <span class="ntfs-tree-modal-title">文件内容 - ${this.escapeHtml(node.name)}</span>
          <button class="ntfs-tree-modal-close" id="ntfs-content-close">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="ntfs-tree-modal-toolbar">
          <button class="ntfs-content-mode-btn active" data-mode="hexdump">Hexdump</button>
          <button class="ntfs-content-mode-btn" data-mode="strings">Strings</button>
          <select class="ntfs-content-encoding">
            <option value="utf-8">UTF-8</option>
            <option value="gbk">GBK</option>
            <option value="utf-16le">UTF-16LE</option>
            <option value="ascii">ASCII</option>
          </select>
          <span class="ntfs-content-size" id="ntfs-content-size"></span>
        </div>
        <div class="ntfs-tree-modal-body ntfs-content-body">
          <pre class="ntfs-content-pre" id="ntfs-content-pre">正在加载...</pre>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // 关闭
    const close = () => overlay.remove();
    overlay.querySelector('#ntfs-content-close')?.addEventListener('click', close);
    overlay.addEventListener('click', (ev) => { if (ev.target === overlay) close(); });
    const escHandler = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { close(); document.removeEventListener('keydown', escHandler); } };
    document.addEventListener('keydown', escHandler);

    let currentMode = 'hexdump';
    let currentEncoding = 'utf-8';
    const contentPre = overlay.querySelector('#ntfs-content-pre') as HTMLPreElement;
    const sizeEl = overlay.querySelector('#ntfs-content-size') as HTMLElement;

    const loadContent = async () => {
      contentPre.textContent = '正在加载...';
      try {
        const result = await invoke('read_ntfs_file_for_viewer', {
          filePath: filePath,
          mode: currentMode,
          encoding: currentEncoding,
          maxBytes: 512 * 1024,
        }) as { content: string; file_size: number; truncated: boolean };

        contentPre.textContent = result.content;
        let sizeText = this.formatFileSize(result.file_size);
        if (result.truncated) sizeText += ' (仅显示前 512 KB)';
        sizeEl.textContent = sizeText;
      } catch (error) {
        contentPre.textContent = `加载失败: ${error}\n\n尝试路径: ${filePath}\n\n提示: 请确保 MemProcFS 已挂载到 ${getMountLetter()}: 盘`;
      }
    };

    // 模式切换
    overlay.querySelectorAll('.ntfs-content-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-mode');
        if (mode && mode !== currentMode) {
          currentMode = mode;
          overlay.querySelectorAll('.ntfs-content-mode-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          // hexdump 模式下禁用编码
          const encodingSelect = overlay.querySelector('.ntfs-content-encoding') as HTMLSelectElement;
          if (encodingSelect) {
            encodingSelect.disabled = currentMode === 'hexdump';
            encodingSelect.style.opacity = currentMode === 'hexdump' ? '0.5' : '1';
          }
          loadContent();
        }
      });
    });

    // 编码切换
    const encodingSelect = overlay.querySelector('.ntfs-content-encoding') as HTMLSelectElement;
    if (encodingSelect) {
      encodingSelect.disabled = true; // hexdump 默认禁用
      encodingSelect.style.opacity = '0.5';
      encodingSelect.addEventListener('change', () => {
        currentEncoding = encodingSelect.value;
        loadContent();
      });
    }

    await loadContent();
  }

  /**
   * 格式化文件大小
   */
  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  /**
   * 清理
   */
  cleanup(): void {
    this.treeData = null;
    this.expandedPaths.clear();
    this.nodeMap.clear();
    this.searchKeyword = '';
    this.activeFilter = 'all';
    this.activeExtFilter = '';
    this.error = null;
    this.hideContextMenu();
  }
}
