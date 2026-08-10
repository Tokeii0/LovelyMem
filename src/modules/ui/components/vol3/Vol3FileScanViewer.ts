/**
 * Vol3 文件扫描视图 (filescan)
 * 文件树视图：复用 ntfs-tree-* CSS 类保持统一风格
 * 支持扩展名分组筛选、右键导出
 */

import { loadVol3Csv, esc, highlight } from './vol3CsvUtils';

interface Vol3FileEntry { offset: string; name: string; }

interface FileTreeNode {
  name: string;
  fullPath: string;
  isFile: boolean;
  offset: string;
  children: Map<string, FileTreeNode>;
  childCount: number;
}

// SVG 图标 (复用 NtfsFileTreeViewer 风格)
const ICONS = {
  folder_closed: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>',
  folder_open: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v1M2 10h20l-2 9H4l-2-9z"></path></svg>',
  file: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>',
  file_exe: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/><path d="M8 13h2M8 17h2M14 13h2M14 17h2"/></svg>',
  file_dll: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/><circle cx="12" cy="15" r="2"/></svg>',
  file_sys: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/><path d="M12 13v4M10 15h4"/></svg>',
  chevron_right: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>',
  chevron_down: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>',
  search: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>',
  filter: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>',
};

// 扩展名分组筛选 (同 NtfsFileTreeViewer)
const EXT_GROUPS: { id: string; label: string; exts: string[] }[] = [
  { id: 'exe', label: '可执行', exts: ['exe', 'dll', 'sys', 'drv', 'bat', 'cmd', 'com', 'scr', 'msi'] },
  { id: 'doc', label: '文档', exts: ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'pdf', 'txt', 'rtf'] },
  { id: 'config', label: '配置', exts: ['ini', 'cfg', 'conf', 'json', 'xml', 'yaml', 'yml', 'reg', 'inf'] },
  { id: 'log', label: '日志', exts: ['log', 'evt', 'evtx', 'etl'] },
  { id: 'db', label: '数据库', exts: ['db', 'sqlite', 'mdb', 'ldf', 'mdf', 'dat'] },
  { id: 'archive', label: '压缩', exts: ['zip', 'rar', '7z', 'tar', 'gz', 'cab'] },
];

export class Vol3FileScanViewer {
  private container: HTMLElement | null = null;
  private data: Vol3FileEntry[] = [];
  private tree: FileTreeNode | null = null;
  private isLoading = false;
  private error: string | null = null;
  private searchKeyword = '';
  private expandedPaths: Set<string> = new Set();
  private contextMenuEl: HTMLElement | null = null;
  private extFilter = '';

  init(containerId: string) { this.container = document.getElementById(containerId); }

  async load(fileName: string) {
    if (!this.container) return;
    this.isLoading = true; this.error = null; this.render();
    try {
      const rows = await loadVol3Csv(fileName);
      if (rows.length < 2) { this.data = []; this.isLoading = false; this.render(); this.bindEvents(); return; }
      const h = rows[0]; const idx = (n: string) => h.indexOf(n);
      this.data = rows.slice(1).map(r => ({ offset: r[idx('Offset')] || '', name: r[idx('Name')] || '' }));
      this.buildTree();
    } catch (e) { this.error = String(e); }
    this.isLoading = false; this.render(); this.bindEvents();
  }

  private buildTree() {
    const root: FileTreeNode = { name: '\\', fullPath: '\\', isFile: false, offset: '', children: new Map(), childCount: 0 };
    this.data.forEach(f => {
      const parts = f.name.replace(/^\\+/, '').split('\\').filter(Boolean);
      let node = root;
      let path = '';
      parts.forEach((part, i) => {
        path += '\\' + part;
        if (!node.children.has(part)) {
          node.children.set(part, { name: part, fullPath: path, isFile: i === parts.length - 1, offset: i === parts.length - 1 ? f.offset : '', children: new Map(), childCount: 0 });
        }
        node = node.children.get(part)!;
      });
    });
    const countChildren = (n: FileTreeNode): number => {
      if (n.isFile && n.children.size === 0) { n.childCount = 1; return 1; }
      let c = 0; n.children.forEach(ch => { c += countChildren(ch); }); n.childCount = c; return c;
    };
    countChildren(root);
    this.tree = root;
    root.children.forEach(ch => { this.expandedPaths.add(ch.fullPath); });
  }

  private render() {
    if (!this.container) return;
    if (this.isLoading) { this.container.innerHTML = `<div class="ntfs-tree-loading"><div class="ntfs-tree-spinner"></div><div class="ntfs-tree-loading-text">正在构建文件树...</div></div>`; return; }
    if (this.error) { this.container.innerHTML = `<div class="ntfs-tree-error"><div class="ntfs-tree-error-text">${esc(this.error)}</div></div>`; return; }
    if (!this.tree || !this.data.length) { this.container.innerHTML = `<div class="ntfs-tree-empty">暂无数据</div>`; return; }

    const dirCount = this.countDirs(this.tree);
    const kw = this.searchKeyword;

    this.container.innerHTML = `
      <div class="ntfs-tree-wrapper">
        <div class="ntfs-tree-stats-bar">
          <div class="ntfs-tree-stats-items">
            <span class="ntfs-tree-stat-item">
              <span class="ntfs-tree-stat-icon">${ICONS.folder_closed}</span>
              <span class="ntfs-tree-stat-label">目录</span>
              <span class="ntfs-tree-stat-value">${dirCount.toLocaleString()}</span>
            </span>
            <span class="ntfs-tree-stat-item">
              <span class="ntfs-tree-stat-icon">${ICONS.file}</span>
              <span class="ntfs-tree-stat-label">文件</span>
              <span class="ntfs-tree-stat-value">${this.data.length.toLocaleString()}</span>
            </span>
          </div>
        </div>
        <div class="ntfs-tree-toolbar">
          <div class="ntfs-tree-search">
            <span class="ntfs-tree-search-icon">${ICONS.search}</span>
            <input type="text" class="ntfs-tree-search-input"
                   id="v3fs-search"
                   placeholder="搜索文件名..."
                   value="${esc(this.searchKeyword)}">
          </div>
          <div class="ntfs-tree-filters">
            <button class="ntfs-tree-filter-btn ${this.extFilter === '' ? 'active' : ''}" data-extf="">
              ${ICONS.filter} 全部
            </button>
            ${EXT_GROUPS.map(g => `<button class="ntfs-tree-filter-btn ${this.extFilter === g.id ? 'active' : ''}" data-extf="${g.id}">${g.label}</button>`).join('')}
          </div>
          <div class="ntfs-tree-filters" style="margin-left:8px">
            <button class="ntfs-tree-filter-btn" id="v3fs-expandall">全部展开</button>
            <button class="ntfs-tree-filter-btn" id="v3fs-collapseall">全部折叠</button>
          </div>
        </div>
        <div class="ntfs-tree-content" id="v3fs-tree" style="overflow:auto;flex:1;min-height:0">
          ${kw ? this.renderSearchResults() : this.renderTreeNodes(this.tree, 0)}
        </div>
      </div>`;
  }

  private countDirs(node: FileTreeNode): number {
    let c = 0;
    node.children.forEach(ch => {
      if (ch.children.size > 0 || !ch.isFile) { c++; c += this.countDirs(ch); }
    });
    return c;
  }

  private renderTreeNodes(node: FileTreeNode, depth: number): string {
    const sorted = [...node.children.entries()].sort((a, b) => {
      if (!a[1].isFile && b[1].isFile) return -1;
      if (a[1].isFile && !b[1].isFile) return 1;
      return a[0].localeCompare(b[0]);
    });

    return sorted.map(([, child]) => {
      const isDir = child.children.size > 0 || !child.isFile;
      const isExpanded = this.expandedPaths.has(child.fullPath);
      const paddingLeft = depth * 20 + 8;

      // 扩展名过滤
      if (this.extFilter && !isDir) {
        const group = EXT_GROUPS.find(g => g.id === this.extFilter);
        if (group) {
          const dotIdx = child.name.lastIndexOf('.');
          if (dotIdx < 0) return '';
          const ext = child.name.substring(dotIdx + 1).toLowerCase();
          if (!group.exts.includes(ext)) return '';
        }
      }

      if (isDir) {
        const childHtml = isExpanded ? this.renderTreeNodes(child, depth + 1) : '';
        // 如果有扩展名过滤且子树为空，跳过空目录
        if (this.extFilter && isExpanded && !childHtml.trim()) return '';
        const icon = isExpanded ? ICONS.folder_open : ICONS.folder_closed;
        const arrow = `<span class="ntfs-tree-arrow ${isExpanded ? 'expanded' : ''}">${isExpanded ? ICONS.chevron_down : ICONS.chevron_right}</span>`;
        return `
          <div class="ntfs-tree-node ntfs-tree-node-dir" data-path="${esc(child.fullPath)}">
            <div class="ntfs-tree-node-row" style="padding-left:${paddingLeft}px">
              ${arrow}
              <span class="ntfs-tree-icon ntfs-tree-icon-dir">${icon}</span>
              <span class="ntfs-tree-name">${esc(child.name)}</span>
              <span class="ntfs-tree-size">${child.childCount}</span>
            </div>
            ${isExpanded ? `<div class="ntfs-tree-children">${childHtml}</div>` : ''}
          </div>`;
      } else {
        const ext = child.name.match(/\.(\w{1,5})$/)?.[1]?.toLowerCase() || '';
        const icon = this.getFileIcon(ext);
        return `
          <div class="ntfs-tree-node ntfs-tree-node-file" data-path="${esc(child.fullPath)}" data-offset="${esc(child.offset)}">
            <div class="ntfs-tree-node-row" style="padding-left:${paddingLeft}px">
              <span class="ntfs-tree-arrow-placeholder"></span>
              <span class="ntfs-tree-icon ntfs-tree-icon-file">${icon}</span>
              <span class="ntfs-tree-name">${esc(child.name)}</span>
              <span class="ntfs-tree-size">${esc(child.offset)}</span>
            </div>
          </div>`;
      }
    }).join('');
  }

  private renderSearchResults(): string {
    const kw = this.searchKeyword.toLowerCase();
    let matched = this.data.filter(f => f.name.toLowerCase().includes(kw));
    if (this.extFilter) {
      const group = EXT_GROUPS.find(g => g.id === this.extFilter);
      if (group) matched = matched.filter(f => { const dotIdx = f.name.lastIndexOf('.'); if (dotIdx < 0) return false; return group.exts.includes(f.name.substring(dotIdx + 1).toLowerCase()); });
    }
    if (matched.length === 0) return '<div class="ntfs-tree-empty">没有匹配</div>';
    return `<div style="padding:4px 12px;color:var(--text-secondary,#94a3b8);font-size:11px;margin-bottom:4px">搜索到 ${matched.length} 个文件</div>` +
      matched.slice(0, 500).map(f => {
        const ext = f.name.match(/\.(\w{1,5})$/)?.[1]?.toLowerCase() || '';
        return `
          <div class="ntfs-tree-node ntfs-tree-node-file" data-path="${esc(f.name)}" data-offset="${esc(f.offset)}">
            <div class="ntfs-tree-node-row" style="padding-left:8px">
              <span class="ntfs-tree-arrow-placeholder"></span>
              <span class="ntfs-tree-icon ntfs-tree-icon-file">${this.getFileIcon(ext)}</span>
              <span class="ntfs-tree-name">${highlight(f.name, this.searchKeyword)}</span>
              <span class="ntfs-tree-size">${esc(f.offset)}</span>
            </div>
          </div>`;
      }).join('') +
      (matched.length > 500 ? `<div class="ntfs-tree-empty">显示前 500 / ${matched.length} 条</div>` : '');
  }

  private getFileIcon(ext: string): string {
    if (['exe', 'com', 'scr', 'bat', 'cmd'].includes(ext)) return ICONS.file_exe;
    if (['dll', 'ocx'].includes(ext)) return ICONS.file_dll;
    if (['sys', 'drv'].includes(ext)) return ICONS.file_sys;
    return ICONS.file;
  }

  private showContextMenu(x: number, y: number, path: string, offset: string) {
    this.hideContextMenu();
    const menu = document.createElement('div');
    menu.className = 'vol3-ctx-menu';
    Object.assign(menu.style, {
      position: 'fixed', left: x + 'px', top: y + 'px', zIndex: '10000',
      background: 'var(--bg-card, #ffffff)', border: '1px solid var(--border-color, #e2e8f0)',
      borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: '4px',
      minWidth: '200px',
    });

    const items = [
      { label: '复制文件路径', icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>', action: () => navigator.clipboard.writeText(path) },
      { label: '复制偏移量', icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>', action: () => navigator.clipboard.writeText(offset) },
      { label: '导出该文件 (dumpfiles)', icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>', action: () => this.exportFile(path, offset) },
    ];

    menu.innerHTML = items.map((item, i) =>
      `<div class="vol3-ctx-item" data-idx="${i}" style="padding:7px 12px;font-size:12px;cursor:pointer;border-radius:4px;color:var(--text-primary,#1e293b);display:flex;align-items:center;gap:8px">
        <span style="color:var(--text-secondary,#94a3b8);flex-shrink:0">${item.icon}</span>
        ${item.label}
      </div>`
    ).join('');

    menu.querySelectorAll('.vol3-ctx-item').forEach(el => {
      (el as HTMLElement).addEventListener('mouseover', () => { (el as HTMLElement).style.background = 'var(--hover-bg, #f1f5f9)'; });
      (el as HTMLElement).addEventListener('mouseout', () => { (el as HTMLElement).style.background = ''; });
      (el as HTMLElement).addEventListener('click', () => {
        const idx = parseInt((el as HTMLElement).getAttribute('data-idx') || '0', 10);
        items[idx]?.action();
        this.hideContextMenu();
      });
    });

    document.body.appendChild(menu);
    this.contextMenuEl = menu;
    const close = () => { this.hideContextMenu(); document.removeEventListener('click', close); };
    setTimeout(() => document.addEventListener('click', close), 10);
  }

  private hideContextMenu() {
    if (this.contextMenuEl) { this.contextMenuEl.remove(); this.contextMenuEl = null; }
    document.querySelectorAll('.vol3-ctx-menu').forEach(e => e.remove());
  }

  /**
   * 真正执行 windows.dumpfiles 把该偏移处的文件提取出来。
   * （旧实现只写了一个说明 txt 让用户自己去跑 dumpfiles，等于没导出。）
   */
  private async exportFile(path: string, offset: string) {
    const name = path.split('\\').pop() || path;
    const toast = this.showToast(`正在导出 ${name} ...`, true);
    let unlisten: (() => void) | null = null;

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const { listen } = await import('@tauri-apps/api/event');

      // 实时展示 dumpfiles 执行进度（后端通过 vol3-progress 事件推送）
      unlisten = await listen<{ plugin: string; message: string; stage: string }>(
        'vol3-progress',
        (e) => {
          if (e.payload?.plugin !== 'dumpfiles') return;
          const msg = (e.payload.message || '').trim();
          if (msg) toast.textContent = msg;
        }
      );

      // 传入原始文件名：txt/csv/png/jpg/bmp 等类型后端会把产物重命名回该名字
      const files = (await invoke<string[]>('dump_files_by_offset', {
        offset,
        fileName: name,
      })) || [];

      unlisten?.(); unlisten = null;
      this.dismissToast(toast);

      if (files.length === 0) {
        this.showToast(`未能导出 ${name}：该偏移无可恢复的文件内容`);
        return;
      }

      console.log('[FileScan] 已导出文件:', files);
      this.showExportResult(files);
    } catch (e) {
      unlisten?.();
      this.dismissToast(toast);
      console.error('导出文件失败:', e);
      this.showToast(`导出失败: ${e}`);
    }
  }

  /** 导出结果面板：打印导出文件的完整路径，并可一键打开所在目录 */
  private showExportResult(files: string[]) {
    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed', bottom: '26px', left: '50%', transform: 'translateX(-50%)',
      background: 'var(--bg-card, #ffffff)', border: '1px solid var(--border-color, #e2e8f0)',
      borderRadius: '10px', padding: '12px 16px', fontSize: '12px',
      color: 'var(--text-primary, #1e293b)', boxShadow: '0 10px 30px rgba(0,0,0,0.22)',
      zIndex: '10001', maxWidth: '80vw', minWidth: '360px',
      display: 'flex', flexDirection: 'column', gap: '8px',
    });

    const btn = 'padding:5px 12px;border-radius:6px;cursor:pointer;font-size:12px;border:1px solid var(--border-color,#e2e8f0);';
    el.innerHTML = `
      <div style="font-weight:600">已导出 ${files.length} 个文件</div>
      <div style="max-height:130px;overflow:auto;opacity:.85;display:flex;flex-direction:column;gap:4px">
        ${files.map(f => `<div style="font-family:Consolas,monospace;word-break:break-all;user-select:text">${esc(f)}</div>`).join('')}
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button data-act="view" style="${btn}background:var(--primary-color,#3b82f6);color:#fff;border-color:transparent">快速打开</button>
        <button data-act="open" style="${btn}background:var(--bg-secondary,#f1f5f9);color:var(--text-primary,#1e293b)">打开所在目录</button>
        <button data-act="close" style="${btn}background:var(--bg-secondary,#f1f5f9);color:var(--text-primary,#1e293b)">关闭</button>
      </div>`;
    document.body.appendChild(el);

    const close = () => el.remove();
    el.querySelector('[data-act="close"]')?.addEventListener('click', close);

    // 快速打开：图片走内嵌图片预览，其余走内置文本查看器
    el.querySelector('[data-act="view"]')?.addEventListener('click', () => {
      void this.quickOpen(files[0]);
    });

    // 打开所在目录并选中该文件（explorer /select,<path>）
    el.querySelector('[data-act="open"]')?.addEventListener('click', async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('open_folder_and_select', { path: files[0] });
      } catch (err) {
        console.error('打开所在目录失败:', err);
        this.showToast(`打开所在目录失败: ${err}`);
      }
    });
  }

  /** 图片类型：走内嵌图片预览而不是文本查看器（二进制在文本里只是乱码） */
  private static readonly IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'bmp', 'gif', 'webp', 'ico'];

  /** 快速打开：按扩展名分流——图片内嵌预览，其余用内置文本查看器 */
  private async quickOpen(filePath: string) {
    const name = filePath.split(/[\\/]/).pop() || filePath;
    const ext = (name.split('.').pop() || '').toLowerCase();

    if (Vol3FileScanViewer.IMAGE_EXTS.includes(ext)) {
      this.showImagePreview(filePath, name);
      return;
    }
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('open_text_viewer', {
        textFilePath: filePath,
        windowTitle: name,
        searchQuery: null,
      });
    } catch (err) {
      console.error('快速打开失败:', err);
      this.showToast(`快速打开失败: ${err}`);
    }
  }

  /**
   * 内嵌图片快速查看：默认适应窗口，点击图片可在「适应/原始尺寸」间切换。
   * 通过 Tauri asset 协议(convertFileSrc)加载本地文件，无需把整张图读进内存转 base64。
   */
  private async showImagePreview(filePath: string, name: string) {
    let src = '';
    try {
      const { convertFileSrc } = await import('@tauri-apps/api/core');
      src = convertFileSrc(filePath);
    } catch (e) {
      console.error('生成图片地址失败:', e);
      this.showToast(`无法预览图片: ${e}`);
      return;
    }

    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: '10002',
    });

    const btn = 'padding:5px 12px;border-radius:6px;cursor:pointer;font-size:12px;border:1px solid var(--border-color,#e2e8f0);background:var(--bg-secondary,#f1f5f9);color:var(--text-primary,#1e293b);';
    overlay.innerHTML = `
      <div style="width:min(900px,92vw);height:min(80vh,900px);display:flex;flex-direction:column;
                  background:var(--bg-card,#fff);border:1px solid var(--border-color,#e2e8f0);
                  border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,0.35);overflow:hidden">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;
                    padding:10px 14px;border-bottom:1px solid var(--border-color,#e2e8f0);flex-shrink:0">
          <span title="${esc(filePath)}" style="font-size:13px;font-weight:600;overflow:hidden;
                text-overflow:ellipsis;white-space:nowrap;color:var(--text-primary,#1e293b)">${esc(name)}</span>
          <div style="display:flex;gap:8px;flex-shrink:0">
            <span data-role="meta" style="font-size:12px;opacity:.6;align-self:center"></span>
            <button data-act="folder" style="${btn}">打开所在目录</button>
            <button data-act="close" style="${btn}">关闭</button>
          </div>
        </div>
        <div data-role="stage" style="flex:1;overflow:auto;display:flex;align-items:center;
             justify-content:center;background:var(--bg-secondary,#0f172a10);padding:8px">
          <img data-role="img" src="${src}" alt="${esc(name)}"
               style="max-width:100%;max-height:100%;object-fit:contain;cursor:zoom-in" />
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const img = overlay.querySelector('[data-role="img"]') as HTMLImageElement;
    const meta = overlay.querySelector('[data-role="meta"]') as HTMLElement;

    // 加载失败时如实告知（可能不是真正的图片/数据不完整），而不是留个空白框
    img.addEventListener('error', () => {
      meta.textContent = '';
      img.replaceWith(
        Object.assign(document.createElement('div'), {
          textContent: '无法解析为图片：内容可能不完整或不是有效的图片数据',
          style: 'font-size:13px;opacity:.7;padding:24px;text-align:center',
        })
      );
    });
    img.addEventListener('load', () => {
      meta.textContent = `${img.naturalWidth}×${img.naturalHeight}`;
    });

    // 点击图片在「适应窗口 / 原始尺寸」间切换
    let actual = false;
    img.addEventListener('click', () => {
      actual = !actual;
      if (actual) {
        img.style.maxWidth = 'none';
        img.style.maxHeight = 'none';
        img.style.cursor = 'zoom-out';
      } else {
        img.style.maxWidth = '100%';
        img.style.maxHeight = '100%';
        img.style.cursor = 'zoom-in';
      }
    });

    const close = () => { overlay.remove(); document.removeEventListener('keydown', onEsc); };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onEsc);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('[data-act="close"]')?.addEventListener('click', close);
    overlay.querySelector('[data-act="folder"]')?.addEventListener('click', async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('open_folder_and_select', { path: filePath });
      } catch (err) {
        console.error('打开所在目录失败:', err);
      }
    });
  }

  /** 轻量提示条；persistent=true 时需手动 dismissToast */
  private showToast(message: string, persistent = false): HTMLElement {
    const el = document.createElement('div');
    el.textContent = message;
    Object.assign(el.style, {
      position: 'fixed', bottom: '26px', left: '50%', transform: 'translateX(-50%)',
      background: 'var(--bg-card, #ffffff)', border: '1px solid var(--border-color, #e2e8f0)',
      borderRadius: '10px', padding: '10px 18px', fontSize: '13px',
      color: 'var(--text-primary, #1e293b)', boxShadow: '0 10px 30px rgba(0,0,0,0.22)',
      zIndex: '10001', maxWidth: '72vw', whiteSpace: 'nowrap',
      overflow: 'hidden', textOverflow: 'ellipsis',
    });
    document.body.appendChild(el);
    if (!persistent) setTimeout(() => el.remove(), 3000);
    return el;
  }

  private dismissToast(el: HTMLElement | null) {
    if (el && el.parentNode) el.remove();
  }

  private bindEvents() {
    if (!this.container) return;
    const input = this.container.querySelector('#v3fs-search') as HTMLInputElement;
    if (input) {
      let t: number | null = null;
      input.addEventListener('input', () => {
        if (t) clearTimeout(t);
        t = window.setTimeout(() => {
          this.searchKeyword = input.value;
          this.render(); this.bindEvents();
          const n = this.container?.querySelector('#v3fs-search') as HTMLInputElement;
          if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
        }, 300);
      });
    }

    // 扩展名筛选
    this.container.querySelectorAll('[data-extf]').forEach(b => b.addEventListener('click', () => {
      this.extFilter = b.getAttribute('data-extf') || '';
      this.render(); this.bindEvents();
    }));

    // 展开/折叠全部
    this.container.querySelector('#v3fs-expandall')?.addEventListener('click', () => {
      const addAll = (node: FileTreeNode) => { if (node.children.size > 0) { this.expandedPaths.add(node.fullPath); node.children.forEach(ch => addAll(ch)); } };
      if (this.tree) addAll(this.tree);
      this.render(); this.bindEvents();
    });
    this.container.querySelector('#v3fs-collapseall')?.addEventListener('click', () => {
      this.expandedPaths.clear(); this.render(); this.bindEvents();
    });

    // 点击目录展开/折叠
    const treeEl = this.container.querySelector('#v3fs-tree');
    if (treeEl) {
      treeEl.addEventListener('click', (e) => {
        const row = (e.target as HTMLElement).closest('.ntfs-tree-node-dir') as HTMLElement;
        if (!row) return;
        const path = row.getAttribute('data-path') || '';
        if (this.expandedPaths.has(path)) this.expandedPaths.delete(path); else this.expandedPaths.add(path);
        this.render(); this.bindEvents();
      });

      treeEl.addEventListener('contextmenu', (e) => {
        const node = (e.target as HTMLElement).closest('.ntfs-tree-node-file') as HTMLElement;
        if (!node) return;
        e.preventDefault();
        const path = node.getAttribute('data-path') || '';
        const offset = node.getAttribute('data-offset') || '';
        this.showContextMenu((e as MouseEvent).clientX, (e as MouseEvent).clientY, path, offset);
      });
    }
  }

  cleanup() {
    this.data = []; this.tree = null; this.expandedPaths.clear();
    this.searchKeyword = ''; this.extFilter = ''; this.error = null;
    this.hideContextMenu();
  }
}
