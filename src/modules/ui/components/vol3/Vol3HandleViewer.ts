/**
 * Vol3 句柄视图 (handles)
 * 按进程分组手风琴，Type 筛选，搜索
 */

import { loadVol3Csv, esc, highlight } from './vol3CsvUtils';

interface Vol3Handle {
  pid: number; process: string; offset: string; handleValue: string;
  type: string; grantedAccess: string; name: string;
}

interface Vol3HandleGroup {
  pid: number; process: string; offset: string; handles: Vol3Handle[];
}

export class Vol3HandleViewer {
  private container: HTMLElement | null = null;
  private groups: Vol3HandleGroup[] = [];
  private allHandles: Vol3Handle[] = [];
  private typeDist: Record<string, number> = {};
  private isLoading = false;
  private error: string | null = null;
  private searchKeyword = '';
  private typeFilter = '';
  private expandedPids: Set<number> = new Set();

  init(containerId: string) { this.container = document.getElementById(containerId); }

  async load(fileName: string) {
    if (!this.container) return;
    this.isLoading = true; this.error = null; this.render();
    try {
      const rows = await loadVol3Csv(fileName);
      if (rows.length < 2) { this.isLoading = false; this.render(); this.bindEvents(); return; }
      const h = rows[0];
      const idx = (n: string) => h.indexOf(n);

      this.allHandles = rows.slice(1).map(r => ({
        pid: parseInt(r[idx('PID')] || '0', 10),
        process: r[idx('Process')] || '',
        offset: r[idx('Offset')] || '',
        handleValue: r[idx('HandleValue')] || '',
        type: r[idx('Type')] || '',
        grantedAccess: r[idx('GrantedAccess')] || '',
        name: r[idx('Name')] || '',
      }));

      // 统计类型
      this.typeDist = {};
      this.allHandles.forEach(h => { if (h.type) this.typeDist[h.type] = (this.typeDist[h.type] || 0) + 1; });

      // 按进程分组
      const map = new Map<number, Vol3HandleGroup>();
      this.allHandles.forEach(h => {
        if (!map.has(h.pid)) map.set(h.pid, { pid: h.pid, process: h.process, offset: h.offset, handles: [] });
        map.get(h.pid)!.handles.push(h);
      });
      this.groups = Array.from(map.values()).sort((a, b) => a.pid - b.pid);
    } catch (e) { this.error = String(e); }
    this.isLoading = false; this.render(); this.bindEvents();
  }

  private render() {
    if (!this.container) return;
    if (this.isLoading) { this.container.innerHTML = `<div class="mod-loading"><div class="mod-spinner"></div><div>正在解析句柄数据...</div></div>`; return; }
    if (this.error) { this.container.innerHTML = `<div class="svc-error">${esc(this.error)}</div>`; return; }
    if (!this.allHandles.length) { this.container.innerHTML = `<div class="svc-empty">暂无数据</div>`; return; }

    const topTypes = Object.entries(this.typeDist).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const filtered = this.getFiltered();

    this.container.innerHTML = `
      <div class="mod-wrapper">
        <div class="mod-stats-bar">
          <span class="mod-stat"><span class="mod-stat-v">${this.groups.length}</span> 进程</span>
          <span class="mod-stat"><span class="mod-stat-v">${this.allHandles.length.toLocaleString()}</span> 句柄</span>
          <span class="mod-stat-sep"></span>
          ${topTypes.slice(0, 4).map(([t, c]) => `<span class="mod-stat"><span class="mod-stat-v">${c}</span> ${t}</span>`).join('')}
        </div>
        <div class="mod-toolbar">
          <input type="text" class="mod-search" id="v3h-search" placeholder="搜索名称、类型、进程..." value="${esc(this.searchKeyword)}">
          <div class="mod-company-filters">
            <button class="mod-cbtn ${this.typeFilter === '' ? 'active' : ''}" data-type="">全部类型</button>
            ${topTypes.map(([t, c]) => `<button class="mod-cbtn ${this.typeFilter === t ? 'active' : ''}" data-type="${esc(t)}">${t} (${c})</button>`).join('')}
          </div>
        </div>
        <div class="mod-list" id="v3h-list">
          ${filtered.length === 0 ? '<div class="mod-empty">没有匹配</div>' : filtered.map(g => this.renderGroup(g)).join('')}
        </div>
      </div>`;
  }

  private renderGroup(g: Vol3HandleGroup): string {
    const isExpanded = this.expandedPids.has(g.pid);
    const kw = this.searchKeyword.toLowerCase();
    let handles = g.handles;
    if (this.typeFilter) handles = handles.filter(h => h.type === this.typeFilter);
    if (kw) handles = handles.filter(h => h.name.toLowerCase().includes(kw) || h.type.toLowerCase().includes(kw));

    return `
      <div class="mod-process ${isExpanded ? 'expanded' : ''}" data-pid="${g.pid}">
        <div class="mod-process-header">
          <span class="mod-arrow">${isExpanded ? '&#9660;' : '&#9654;'}</span>
          <span class="mod-pid">PID ${g.pid}</span>
          <span class="mod-pname">${esc(g.process)}</span>
          <span class="mod-pcount">${handles.length}${handles.length !== g.handles.length ? '/' + g.handles.length : ''} 个句柄</span>
        </div>
        ${isExpanded ? `<div class="mod-detail"><table class="mod-table">
          <thead><tr><th style="width:80px">句柄值</th><th style="width:80px">类型</th><th style="width:100px">权限</th><th>名称</th></tr></thead>
          <tbody>${handles.map(h => `<tr class="mod-row"><td class="mod-cell-addr">${esc(h.handleValue)}</td><td><span style="color:#8b5cf6;font-weight:500">${esc(h.type)}</span></td><td class="mod-cell-addr">${esc(h.grantedAccess)}</td><td style="white-space:normal;word-break:break-all">${highlight(h.name, this.searchKeyword)}</td></tr>`).join('')}
          </tbody></table>
          ${handles.length === 0 ? '<div class="mod-empty" style="padding:16px">没有匹配的句柄</div>' : ''}
        </div>` : ''}
      </div>`;
  }

  private getFiltered(): Vol3HandleGroup[] {
    const kw = this.searchKeyword.toLowerCase();
    return this.groups.filter(g => {
      let handles = g.handles;
      if (this.typeFilter) handles = handles.filter(h => h.type === this.typeFilter);
      if (kw) {
        const matchProc = g.process.toLowerCase().includes(kw) || g.pid.toString().includes(kw);
        const matchHandle = handles.some(h => h.name.toLowerCase().includes(kw) || h.type.toLowerCase().includes(kw));
        return matchProc || matchHandle;
      }
      if (this.typeFilter) return handles.length > 0;
      return true;
    });
  }

  private bindEvents() {
    if (!this.container) return;
    const input = this.container.querySelector('#v3h-search') as HTMLInputElement;
    if (input) {
      let t: number | null = null;
      input.addEventListener('input', () => { if (t) clearTimeout(t); t = window.setTimeout(() => { this.searchKeyword = input.value; this.render(); this.bindEvents(); const n = this.container?.querySelector('#v3h-search') as HTMLInputElement; if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250); });
    }
    this.container.querySelectorAll('.mod-cbtn[data-type]').forEach(btn => {
      btn.addEventListener('click', () => { this.typeFilter = btn.getAttribute('data-type') || ''; this.render(); this.bindEvents(); });
    });
    this.container.querySelector('#v3h-list')?.addEventListener('click', e => {
      const h = (e.target as HTMLElement).closest('.mod-process-header');
      if (!h) return;
      const p = h.closest('.mod-process') as HTMLElement;
      if (!p) return;
      const pid = parseInt(p.getAttribute('data-pid') || '0', 10);
      if (this.expandedPids.has(pid)) this.expandedPids.delete(pid); else this.expandedPids.add(pid);
      this.render(); this.bindEvents();
    });
  }

  cleanup() { this.groups = []; this.allHandles = []; this.typeDist = {}; this.expandedPids.clear(); this.searchKeyword = ''; this.typeFilter = ''; this.error = null; }
}
