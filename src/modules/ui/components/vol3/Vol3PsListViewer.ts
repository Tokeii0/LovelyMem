/**
 * Vol3 进程视图 (pslist)
 *
 * 与 MemProcFS 的进程视图保持一致：渲染为可折叠的**进程树**（复用 proc-* 样式）。
 * 注意：vol3 pslist 的 TreeDepth 恒为 0（它本就是扁平列表），父子关系需由
 * PID/PPID 自行构建；父进程已退出/不在列表中的条目会作为根节点显示。
 * 搜索/筛选时切换为扁平结果列表（同 MemProcFS 行为）。
 */

import { loadVol3Csv, esc, highlight } from './vol3CsvUtils';
import { showProcessContextMenu } from '../../../memory-image-visualizer/dumpAndVisualize';
import { RowContextMenuHost, attachSharedRowContextMenu } from '../rowContextMenuShared';

interface Vol3Process {
  depth: number; pid: number; ppid: number; name: string; offset: string;
  threads: number; handles: number; sessionId: string; wow64: boolean;
  createTime: string; exitTime: string;
}

/** 由 PID/PPID 构建出的进程树节点 */
interface Vol3ProcNode {
  p: Vol3Process;
  children: Vol3ProcNode[];
  depth: number;
}

export class Vol3PsListViewer {
  private container: HTMLElement | null = null;
  private data: Vol3Process[] = [];
  private tree: Vol3ProcNode[] = [];
  private collapsedPids: Set<number> = new Set();
  private isLoading = false;
  private error: string | null = null;
  private searchKeyword = '';
  private wow64Filter = false;
  private contextMenuHost: RowContextMenuHost | null = null;
  /** 当前加载的 CSV 文件名，作为共享右键菜单的文件上下文（条件项/插件匹配与表格视图一致） */
  private currentFile = '';

  init(containerId: string) { this.container = document.getElementById(containerId); }

  setContextMenuHost(host: RowContextMenuHost | null) { this.contextMenuHost = host; }

  /** 进程条目 -> 以 vol3 pslist 原始列名为键的行数据（供共享右键菜单使用） */
  private toRowData(p: Vol3Process): Record<string, string> {
    return {
      TreeDepth: String(p.depth),
      PID: String(p.pid),
      PPID: String(p.ppid),
      ImageFileName: p.name,
      'Offset(V)': p.offset,
      Threads: String(p.threads),
      Handles: String(p.handles),
      SessionId: p.sessionId,
      Wow64: p.wow64 ? 'True' : 'False',
      CreateTime: p.createTime,
      ExitTime: p.exitTime,
    };
  }

  async load(fileName: string) {
    if (!this.container) return;
    this.currentFile = fileName;
    this.isLoading = true; this.error = null; this.render();
    try {
      const rows = await loadVol3Csv(fileName);
      if (rows.length < 2) { this.data = []; this.isLoading = false; this.render(); this.bindEvents(); return; }
      const h = rows[0];
      const idx = (n: string) => h.indexOf(n);
      this.data = rows.slice(1).map(r => ({
        depth: parseInt(r[idx('TreeDepth')] || '0', 10),
        pid: parseInt(r[idx('PID')] || '0', 10),
        ppid: parseInt(r[idx('PPID')] || '0', 10),
        name: r[idx('ImageFileName')] || '',
        offset: r[idx('Offset(V)')] || '',
        threads: parseInt(r[idx('Threads')] || '0', 10),
        handles: parseInt(r[idx('Handles')] || '0', 10),
        sessionId: r[idx('SessionId')] || 'N/A',
        wow64: (r[idx('Wow64')] || '').toLowerCase() === 'true',
        createTime: r[idx('CreateTime')] || '',
        exitTime: r[idx('ExitTime')] || '',
      }));
      this.tree = this.buildTree(this.data);
    } catch (e) { this.error = String(e); }
    this.isLoading = false; this.render(); this.bindEvents();
  }

  /**
   * 由 PID/PPID 构建进程森林。
   * - 父进程不在列表（已退出/未列出）或自引用 → 作为根节点，保证不丢进程；
   * - PID 复用可能造成环，链接前先做祖先检查，确保结果一定是无环森林
   *   （否则渲染时会无限递归）。
   */
  private buildTree(list: Vol3Process[]): Vol3ProcNode[] {
    const byPid = new Map<number, Vol3ProcNode>();
    for (const p of list) {
      // 极少数情况下同 PID 可能重复，保留首个
      if (!byPid.has(p.pid)) byPid.set(p.pid, { p, children: [], depth: 0 });
    }

    // 沿 ppid 向上回溯，判断把 node 挂到 parent 下是否会成环。
    // 只有「node 本身是 parent 的祖先」才算成环；若上游链路自己有环（PID 复用所致），
    // 只需停止回溯即可——那个环会由其成员各自被提升为根来打断，
    // 不能因此把整条下游都判成根（否则一个环会让上百个进程全变成根节点）。
    const wouldCycle = (node: Vol3ProcNode, parent: Vol3ProcNode): boolean => {
      const guard = new Set<number>();
      let cur: Vol3ProcNode | undefined = parent;
      while (cur) {
        if (cur === node) return true;
        if (guard.has(cur.p.pid)) break; // 上游有环：停止回溯，但与 node 无关
        guard.add(cur.p.pid);
        cur = byPid.get(cur.p.ppid);
      }
      return false;
    };

    const roots: Vol3ProcNode[] = [];
    for (const node of byPid.values()) {
      const parent = byPid.get(node.p.ppid);
      if (!parent || parent === node || wouldCycle(node, parent)) {
        roots.push(node);
      } else {
        parent.children.push(node);
      }
    }

    // 设置层级 + 按 PID 排序
    const assign = (nodes: Vol3ProcNode[], d: number) => {
      nodes.sort((a, b) => a.p.pid - b.p.pid);
      for (const n of nodes) {
        n.depth = d;
        assign(n.children, d + 1);
      }
    };
    assign(roots, 0);
    return roots;
  }

  private render() {
    if (!this.container) return;
    if (this.isLoading) { this.container.innerHTML = `<div class="svc-loading"><div class="svc-spinner"></div><div>正在解析进程列表...</div></div>`; return; }
    if (this.error) { this.container.innerHTML = `<div class="svc-error">${esc(this.error)}</div>`; return; }
    if (!this.data.length) { this.container.innerHTML = `<div class="svc-empty">暂无数据</div>`; return; }

    const filtered = this.getFiltered();
    // 有搜索/筛选时展示扁平结果，否则展示进程树（同 MemProcFS）
    const isFiltering = !!this.searchKeyword || this.wow64Filter;
    const active = this.data.filter(p => p.exitTime === 'N/A' || !p.exitTime).length;
    const w64 = this.data.filter(p => p.wow64).length;

    this.container.innerHTML = `
      <div class="svc-wrapper">
        <div class="svc-stats-bar">
          <span class="svc-stat"><span class="svc-stat-v">${this.data.length}</span> 进程</span>
          <span class="svc-stat" style="color:#16a34a"><span class="svc-stat-v">${active}</span> 活跃</span>
          <span class="svc-stat" style="color:#94a3b8"><span class="svc-stat-v">${this.data.length - active}</span> 已退出</span>
          ${w64 > 0 ? `<span class="svc-stat" style="color:#d97706"><span class="svc-stat-v">${w64}</span> WoW64</span>` : ''}
        </div>
        <div class="svc-toolbar">
          <input type="text" class="svc-search" id="v3ps-search" placeholder="搜索进程名、PID..." value="${esc(this.searchKeyword)}">
          <div class="svc-filters">
            ${w64 > 0 ? `<button class="svc-fbtn ${this.wow64Filter ? 'active' : ''}" id="v3ps-w64">仅 WoW64</button>` : ''}
          </div>
        </div>
        <div class="svc-count">显示 ${filtered.length} / ${this.data.length}</div>
        <div class="proc-tree" id="v3ps-tree">
          ${isFiltering ? this.renderFlatFiltered(filtered) : this.renderTree(this.tree)}
        </div>
      </div>`;
  }

  private renderTree(nodes: Vol3ProcNode[]): string {
    return nodes.map(n => this.renderTreeNode(n)).join('');
  }

  private renderTreeNode(node: Vol3ProcNode): string {
    const p = node.p;
    const hasChildren = node.children.length > 0;
    const isCollapsed = this.collapsedPids.has(p.pid);
    const indent = node.depth * 20;
    return `
      <div class="proc-node" data-pid="${p.pid}">
        ${this.renderRow(p, indent, hasChildren, isCollapsed)}
        ${hasChildren && !isCollapsed ? `<div class="proc-children">${this.renderTree(node.children)}</div>` : ''}
      </div>`;
  }

  /** 搜索/筛选时的扁平结果（与 MemProcFS 行为一致） */
  private renderFlatFiltered(filtered: Vol3Process[]): string {
    if (filtered.length === 0) return '<div class="svc-empty">没有匹配的进程</div>';
    return filtered.map(p => this.renderRow(p, 0, false, false)).join('');
  }

  /** 单行渲染（树节点与扁平结果共用，保证样式一致） */
  private renderRow(p: Vol3Process, indent: number, hasChildren: boolean, isCollapsed: boolean): string {
    const isExited = !(p.exitTime === 'N/A' || !p.exitTime);
    const kw = this.searchKeyword;
    return `
      <div class="proc-row proc-row-rich ${isExited ? 'proc-exited' : ''}" style="padding-left:${indent + 8}px" data-detail-pid="${p.pid}">
        <div class="proc-row-main">
          ${hasChildren
            ? `<span class="proc-toggle" data-toggle-pid="${p.pid}">${isCollapsed ? '&#9654;' : '&#9660;'}</span>`
            : '<span class="proc-toggle-space"></span>'}
          <span class="proc-icon">${isExited ? '&#9675;' : '&#9679;'}</span>
          <span class="proc-name">${highlight(p.name, kw)}</span>
          <span class="proc-pid">PID ${p.pid}</span>
          ${p.ppid > 0 ? `<span class="proc-ppid">PPID ${p.ppid}</span>` : ''}
          ${p.sessionId && p.sessionId !== 'N/A' ? `<span class="proc-tag proc-tag-user">Session ${esc(p.sessionId)}</span>` : ''}
          ${p.wow64 ? '<span class="mod-wow64">W64</span>' : ''}
          <span class="proc-time">${esc(p.createTime)}</span>
        </div>
        <div class="proc-row-sub">
          <span class="proc-cmd">线程 ${p.threads} · 句柄 ${p.handles}</span>
          ${p.offset ? `<span class="proc-addr">Offset ${esc(p.offset)}</span>` : ''}
          ${isExited ? `<span class="proc-cmd">退出于 ${esc(p.exitTime)}</span>` : ''}
        </div>
      </div>`;
  }

  private showDetail(p: Vol3Process) {
    document.querySelectorAll('.svc-modal-overlay').forEach(e => e.remove());
    const isActive = p.exitTime === 'N/A' || !p.exitTime;
    const ov = document.createElement('div');
    ov.className = 'svc-modal-overlay';
    ov.innerHTML = `
      <div class="svc-modal">
        <div class="svc-modal-header">
          <span class="svc-dot" style="background:${isActive ? '#16a34a' : '#94a3b8'};width:10px;height:10px"></span>
          <span class="svc-modal-title">${esc(p.name)}</span>
          ${p.wow64 ? '<span class="mod-wow64" style="font-size:11px;padding:1px 6px">WoW64</span>' : ''}
          <button class="svc-modal-close">&times;</button>
        </div>
        <table class="svc-modal-table">
          <tr><td class="svc-modal-label">进程名</td><td>${esc(p.name)}</td></tr>
          <tr><td class="svc-modal-label">PID</td><td class="svc-modal-mono">${p.pid}</td></tr>
          <tr><td class="svc-modal-label">PPID</td><td class="svc-modal-mono">${p.ppid}</td></tr>
          <tr><td class="svc-modal-label">状态</td><td>${isActive ? '<span style="color:#16a34a">活跃</span>' : '<span style="color:#94a3b8">已退出</span>'}</td></tr>
          <tr><td class="svc-modal-label">线程数</td><td>${p.threads}</td></tr>
          <tr><td class="svc-modal-label">句柄数</td><td>${p.handles}</td></tr>
          <tr><td class="svc-modal-label">Session ID</td><td>${esc(p.sessionId)}</td></tr>
          <tr><td class="svc-modal-label">WoW64</td><td>${p.wow64 ? '是 (32位)' : '否'}</td></tr>
          <tr><td class="svc-modal-label">偏移量</td><td class="svc-modal-mono">${esc(p.offset)}</td></tr>
          <tr><td class="svc-modal-label">创建时间</td><td>${esc(p.createTime)}</td></tr>
          <tr><td class="svc-modal-label">退出时间</td><td>${esc(p.exitTime || '-')}</td></tr>
        </table>
      </div>`;
    ov.addEventListener('click', e => { if (e.target === ov || (e.target as HTMLElement).classList.contains('svc-modal-close')) ov.remove(); });
    const escH = (e: KeyboardEvent) => { if (e.key === 'Escape') { ov.remove(); document.removeEventListener('keydown', escH); } };
    document.addEventListener('keydown', escH);
    document.body.appendChild(ov);
  }

  private getFiltered(): Vol3Process[] {
    const kw = this.searchKeyword.toLowerCase();
    return this.data.filter(p => {
      if (this.wow64Filter && !p.wow64) return false;
      if (kw) return p.name.toLowerCase().includes(kw) || p.pid.toString().includes(kw) || p.ppid.toString().includes(kw);
      return true;
    });
  }

  private bindEvents() {
    if (!this.container) return;
    const input = this.container.querySelector('#v3ps-search') as HTMLInputElement;
    if (input) {
      let t: number | null = null;
      input.addEventListener('input', () => { if (t) clearTimeout(t); t = window.setTimeout(() => { this.searchKeyword = input.value; this.render(); this.bindEvents(); const n = this.container?.querySelector('#v3ps-search') as HTMLInputElement; if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250); });
    }
    this.container.querySelector('#v3ps-w64')?.addEventListener('click', () => { this.wow64Filter = !this.wow64Filter; this.render(); this.bindEvents(); });

    const tree = this.container.querySelector('#v3ps-tree') as HTMLElement | null;
    if (!tree) return;

    tree.addEventListener('click', e => {
      // 展开/折叠
      const toggle = (e.target as HTMLElement).closest('[data-toggle-pid]') as HTMLElement | null;
      if (toggle) {
        const pid = parseInt(toggle.getAttribute('data-toggle-pid') || '0', 10);
        if (this.collapsedPids.has(pid)) this.collapsedPids.delete(pid);
        else this.collapsedPids.add(pid);
        this.render(); this.bindEvents();
        return;
      }
      // 点击行 -> 详情
      const row = (e.target as HTMLElement).closest('.proc-row[data-detail-pid]') as HTMLElement | null;
      if (row) {
        const pid = parseInt(row.getAttribute('data-detail-pid') || '0', 10);
        const p = this.data.find(x => x.pid === pid);
        if (p) this.showDetail(p);
      }
    });

    // 行右键：与 CSV 表格视图共用同一套菜单（复制/查看行详情/CSV 插件/可视化进程内存等）
    attachSharedRowContextMenu(
      tree,
      () => this.contextMenuHost,
      { loadFileName: this.currentFile, displayName: '进程列表' },
      (target) => {
        const row = target.closest('.proc-row[data-detail-pid]') as HTMLElement | null;
        if (!row) return null;
        const pid = parseInt(row.getAttribute('data-detail-pid') || '0', 10);
        const p = this.data.find(x => x.pid === pid);
        return p ? { rowData: this.toRowData(p) } : null;
      }
    );

    // 宿主未注入时（理论上不会发生）回退到原来的单项菜单，保证仍可用
    tree.addEventListener('contextmenu', e => {
      if (this.contextMenuHost) return;
      const row = (e.target as HTMLElement).closest('.proc-row[data-detail-pid]') as HTMLElement | null;
      if (!row) return;
      const pid = parseInt(row.getAttribute('data-detail-pid') || '0', 10);
      const p = this.data.find(x => x.pid === pid);
      if (p) showProcessContextMenu(e as MouseEvent, p.pid, p.name);
    });
  }

  cleanup() {
    this.data = []; this.tree = []; this.collapsedPids.clear();
    this.searchKeyword = ''; this.wow64Filter = false; this.error = null;
    document.querySelectorAll('.svc-modal-overlay').forEach(e => e.remove());
  }
}
