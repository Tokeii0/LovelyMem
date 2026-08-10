/**
 * Vol3 进程树视图 (pstree)
 * 利用 TreeDepth 构建树，两行布局，显示 Cmd/Path
 */

import { loadVol3Csv, esc, highlight } from './vol3CsvUtils';
import { showProcessContextMenu } from '../../../memory-image-visualizer/dumpAndVisualize';

interface Vol3PsTreeEntry {
  depth: number; pid: number; ppid: number; name: string; offset: string;
  threads: number; handles: number; sessionId: string; wow64: boolean;
  createTime: string; exitTime: string; audit: string; cmd: string; path: string;
}

export class Vol3PsTreeViewer {
  private container: HTMLElement | null = null;
  private data: Vol3PsTreeEntry[] = [];
  private isLoading = false;
  private error: string | null = null;
  private searchKeyword = '';
  private collapsedPids: Set<number> = new Set();

  init(containerId: string) { this.container = document.getElementById(containerId); }

  async load(fileName: string) {
    if (!this.container) return;
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
        audit: r[idx('Audit')] || '',
        cmd: r[idx('Cmd')] || '',
        path: r[idx('Path')] || '',
      }));
    } catch (e) { this.error = String(e); }
    this.isLoading = false; this.render(); this.bindEvents();
  }

  private render() {
    if (!this.container) return;
    if (this.isLoading) { this.container.innerHTML = `<div class="proc-loading"><div class="svc-spinner"></div><div>正在解析进程树...</div></div>`; return; }
    if (this.error) { this.container.innerHTML = `<div class="svc-error">${esc(this.error)}</div>`; return; }
    if (!this.data.length) { this.container.innerHTML = `<div class="svc-empty">暂无数据</div>`; return; }

    const active = this.data.filter(p => p.exitTime === 'N/A' || !p.exitTime).length;
    const kw = this.searchKeyword.toLowerCase();
    const filtered = kw ? this.data.filter(p =>
      p.name.toLowerCase().includes(kw) || p.pid.toString().includes(kw) ||
      p.cmd.toLowerCase().includes(kw) || p.path.toLowerCase().includes(kw)
    ) : null;

    this.container.innerHTML = `
      <div class="proc-wrapper">
        <div class="svc-stats-bar">
          <span class="svc-stat"><span class="svc-stat-v">${this.data.length}</span> 进程</span>
          <span class="svc-stat" style="color:#16a34a"><span class="svc-stat-v">${active}</span> 活跃</span>
          <span class="svc-stat" style="color:#94a3b8"><span class="svc-stat-v">${this.data.length - active}</span> 已退出</span>
        </div>
        <div class="svc-toolbar">
          <input type="text" class="svc-search" id="v3tree-search" placeholder="搜索进程名、PID、命令行、路径..." value="${esc(this.searchKeyword)}">
        </div>
        <div class="proc-tree" id="v3tree-list">
          ${filtered ? this.renderFlat(filtered) : this.renderTree()}
        </div>
      </div>`;
  }

  private renderTree(): string {
    // Build visibility: track collapsed subtrees
    const result: string[] = [];
    let skipUntilDepth = -1;
    for (const p of this.data) {
      if (skipUntilDepth >= 0 && p.depth > skipUntilDepth) continue;
      skipUntilDepth = -1;
      // Check if this node has children (next entry has depth+1)
      const idx = this.data.indexOf(p);
      const hasChildren = idx < this.data.length - 1 && this.data[idx + 1].depth > p.depth;
      const isCollapsed = this.collapsedPids.has(p.pid);
      if (isCollapsed) skipUntilDepth = p.depth;
      result.push(this.renderRow(p, hasChildren, isCollapsed));
    }
    return result.join('');
  }

  private renderFlat(items: Vol3PsTreeEntry[]): string {
    if (!items.length) return '<div class="svc-empty">没有匹配的进程</div>';
    return items.map(p => this.renderRow(p, false, false, true)).join('');
  }

  private renderRow(p: Vol3PsTreeEntry, hasChildren: boolean, isCollapsed: boolean, flat = false): string {
    const isActive = p.exitTime === 'N/A' || !p.exitTime;
    const indent = flat ? 8 : p.depth * 20 + 8;
    const cmdShort = p.cmd && p.cmd !== '-' ? (p.cmd.length > 80 ? p.cmd.substring(0, 77) + '...' : p.cmd) : '';
    const pathStr = p.path && p.path !== '-' ? p.path : '';

    return `
      <div class="proc-row proc-row-rich ${isActive ? '' : 'proc-exited'}" style="padding-left:${indent}px" data-detail-pid="${p.pid}">
        <div class="proc-row-main">
          ${hasChildren ? `<span class="proc-toggle" data-toggle-pid="${p.pid}">${isCollapsed ? '&#9654;' : '&#9660;'}</span>` : '<span class="proc-toggle-space"></span>'}
          <span class="proc-icon">${isActive ? '&#9679;' : '&#9675;'}</span>
          <span class="proc-name">${highlight(p.name, this.searchKeyword)}</span>
          <span class="proc-pid">PID ${p.pid}</span>
          <span class="proc-ppid">PPID ${p.ppid}</span>
          <span class="proc-tag" style="color:#64748b">T:${p.threads} H:${p.handles}</span>
          <span class="proc-tag proc-tag-user">S:${p.sessionId}</span>
          ${p.wow64 ? '<span class="mod-wow64">W64</span>' : ''}
          <span class="proc-time">${p.createTime}</span>
        </div>
        <div class="proc-row-sub">
          ${pathStr ? `<span class="proc-path" title="${esc(pathStr)}">${highlight(pathStr, this.searchKeyword)}</span>` : ''}
          ${cmdShort ? `<span class="proc-cmd" title="${esc(p.cmd)}">${highlight(cmdShort, this.searchKeyword)}</span>` : ''}
          <span class="proc-addr">${p.offset}</span>
        </div>
      </div>`;
  }

  private showDetail(pid: number) {
    const p = this.data.find(x => x.pid === pid);
    if (!p) return;
    document.querySelectorAll('.svc-modal-overlay').forEach(e => e.remove());
    const isActive = p.exitTime === 'N/A' || !p.exitTime;
    const ov = document.createElement('div');
    ov.className = 'svc-modal-overlay';
    ov.innerHTML = `
      <div class="svc-modal" style="width:620px">
        <div class="svc-modal-header">
          <span class="proc-icon" style="font-size:14px">${isActive ? '&#9679;' : '&#9675;'}</span>
          <span class="svc-modal-title">${esc(p.name)}</span>
          ${p.wow64 ? '<span class="mod-wow64" style="font-size:11px;padding:1px 6px">WoW64</span>' : ''}
          <button class="svc-modal-close">&times;</button>
        </div>
        <table class="svc-modal-table">
          <tr><td class="svc-modal-label">进程名</td><td>${esc(p.name)}</td></tr>
          <tr><td class="svc-modal-label">PID / PPID</td><td class="svc-modal-mono">${p.pid} / ${p.ppid}</td></tr>
          <tr><td class="svc-modal-label">状态</td><td>${isActive ? '<span style="color:#16a34a">活跃</span>' : '<span style="color:#94a3b8">已退出</span>'}</td></tr>
          <tr><td class="svc-modal-label">线程 / 句柄</td><td>${p.threads} / ${p.handles}</td></tr>
          <tr><td class="svc-modal-label">Session ID</td><td>${esc(p.sessionId)}</td></tr>
          <tr><td class="svc-modal-label">WoW64</td><td>${p.wow64 ? '是' : '否'}</td></tr>
          <tr><td class="svc-modal-label">偏移量</td><td class="svc-modal-mono">${esc(p.offset)}</td></tr>
          <tr><td class="svc-modal-label">路径</td><td class="svc-modal-mono svc-modal-path">${esc(p.path || '-')}</td></tr>
          <tr><td class="svc-modal-label">命令行</td><td class="svc-modal-mono svc-modal-path">${esc(p.cmd || '-')}</td></tr>
          <tr><td class="svc-modal-label">审计信息</td><td class="svc-modal-mono svc-modal-path">${esc(p.audit || '-')}</td></tr>
          <tr><td class="svc-modal-label">创建时间</td><td>${esc(p.createTime)}</td></tr>
          <tr><td class="svc-modal-label">退出时间</td><td>${esc(p.exitTime || '-')}</td></tr>
        </table>
      </div>`;
    ov.addEventListener('click', e => { if (e.target === ov || (e.target as HTMLElement).classList.contains('svc-modal-close')) ov.remove(); });
    const escH = (e: KeyboardEvent) => { if (e.key === 'Escape') { ov.remove(); document.removeEventListener('keydown', escH); } };
    document.addEventListener('keydown', escH);
    document.body.appendChild(ov);
  }

  private bindEvents() {
    if (!this.container) return;
    const input = this.container.querySelector('#v3tree-search') as HTMLInputElement;
    if (input) {
      let t: number | null = null;
      input.addEventListener('input', () => { if (t) clearTimeout(t); t = window.setTimeout(() => { this.searchKeyword = input.value; this.render(); this.bindEvents(); const n = this.container?.querySelector('#v3tree-search') as HTMLInputElement; if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250); });
    }
    this.container.querySelector('#v3tree-list')?.addEventListener('click', e => {
      const toggle = (e.target as HTMLElement).closest('[data-toggle-pid]') as HTMLElement;
      if (toggle) { const pid = parseInt(toggle.getAttribute('data-toggle-pid') || '0', 10); if (this.collapsedPids.has(pid)) this.collapsedPids.delete(pid); else this.collapsedPids.add(pid); this.render(); this.bindEvents(); return; }
      const row = (e.target as HTMLElement).closest('.proc-row[data-detail-pid]') as HTMLElement;
      if (row) this.showDetail(parseInt(row.getAttribute('data-detail-pid') || '0', 10));
    });
    this.container.querySelector('#v3tree-list')?.addEventListener('contextmenu', e => {
      const row = (e.target as HTMLElement).closest('.proc-row[data-detail-pid]') as HTMLElement;
      if (!row) return;
      const pid = parseInt(row.getAttribute('data-detail-pid') || '0', 10);
      if (!pid) return;
      const entry = this.data.find(x => x.pid === pid);
      showProcessContextMenu(e as MouseEvent, pid, entry?.name);
    });
  }

  cleanup() { this.data = []; this.collapsedPids.clear(); this.searchKeyword = ''; this.error = null;
    document.querySelectorAll('.svc-modal-overlay').forEach(e => e.remove()); }
}
