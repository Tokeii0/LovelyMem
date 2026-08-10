/**
 * Vol3 DLL 列表视图 (dlllist)
 * 按进程分组手风琴，展示加载的DLL：名称、路径、大小、加载时间
 */

import { loadVol3Csv, esc, highlight } from './vol3CsvUtils';

interface Vol3Dll {
  pid: number; process: string; base: string; size: string; sizeNum: number;
  name: string; path: string; loadTime: string;
}

interface Vol3DllGroup {
  pid: number; process: string; dlls: Vol3Dll[];
  totalSize: number;
}

export class Vol3DllListViewer {
  private container: HTMLElement | null = null;
  private groups: Vol3DllGroup[] = [];
  private total = 0;
  private isLoading = false;
  private error: string | null = null;
  private searchKeyword = '';
  private expandedPids: Set<number> = new Set();

  init(containerId: string) { this.container = document.getElementById(containerId); }

  async load(fileName: string) {
    if (!this.container) return;
    this.isLoading = true; this.error = null; this.render();
    try {
      const rows = await loadVol3Csv(fileName);
      if (rows.length < 2) { this.isLoading = false; this.render(); this.bindEvents(); return; }
      const h = rows[0]; const idx = (n: string) => h.indexOf(n);

      const dlls: Vol3Dll[] = rows.slice(1).map(r => {
        const sizeHex = r[idx('Size')] || '0';
        const sizeNum = parseInt(sizeHex, 16) || parseInt(sizeHex, 10) || 0;
        return {
          pid: parseInt(r[idx('PID')] || '0', 10), process: r[idx('Process')] || '',
          base: r[idx('Base')] || '', size: sizeHex, sizeNum, name: r[idx('Name')] || '',
          path: r[idx('Path')] || '', loadTime: r[idx('LoadTime')] || '',
        };
      });

      this.total = dlls.length;
      const map = new Map<number, Vol3DllGroup>();
      dlls.forEach(d => {
        if (!map.has(d.pid)) map.set(d.pid, { pid: d.pid, process: d.process, dlls: [], totalSize: 0 });
        const g = map.get(d.pid)!; g.dlls.push(d); g.totalSize += d.sizeNum;
      });
      this.groups = Array.from(map.values()).sort((a, b) => a.pid - b.pid);
    } catch (e) { this.error = String(e); }
    this.isLoading = false; this.render(); this.bindEvents();
  }

  private render() {
    if (!this.container) return;
    if (this.isLoading) { this.container.innerHTML = `<div class="mod-loading"><div class="mod-spinner"></div><div>正在解析DLL列表...</div></div>`; return; }
    if (this.error) { this.container.innerHTML = `<div class="svc-error">${esc(this.error)}</div>`; return; }
    if (!this.groups.length) { this.container.innerHTML = `<div class="svc-empty">暂无数据</div>`; return; }

    const filtered = this.getFiltered();

    this.container.innerHTML = `
      <div class="mod-wrapper">
        <div class="mod-stats-bar">
          <span class="mod-stat"><span class="mod-stat-v">${this.groups.length}</span> 进程</span>
          <span class="mod-stat"><span class="mod-stat-v">${this.total.toLocaleString()}</span> DLL</span>
        </div>
        <div class="mod-toolbar">
          <input type="text" class="mod-search" id="v3dll-search" placeholder="搜索DLL名、路径、进程..." value="${esc(this.searchKeyword)}">
        </div>
        <div class="mod-list" id="v3dll-list">
          ${filtered.length === 0 ? '<div class="mod-empty">没有匹配</div>' : filtered.map(g => this.renderGroup(g)).join('')}
        </div>
      </div>`;
  }

  private renderGroup(g: Vol3DllGroup): string {
    const isExpanded = this.expandedPids.has(g.pid);
    const kw = this.searchKeyword.toLowerCase();
    let dlls = g.dlls;
    if (kw) dlls = dlls.filter(d => d.name.toLowerCase().includes(kw) || d.path.toLowerCase().includes(kw));

    return `
      <div class="mod-process ${isExpanded ? 'expanded' : ''}" data-pid="${g.pid}">
        <div class="mod-process-header">
          <span class="mod-arrow">${isExpanded ? '&#9660;' : '&#9654;'}</span>
          <span class="mod-pid">PID ${g.pid}</span>
          <span class="mod-pname">${esc(g.process)}</span>
          <span class="mod-pcount">${dlls.length}${dlls.length !== g.dlls.length ? '/' + g.dlls.length : ''} DLL</span>
          <span class="mod-psize">${this.fmtSize(g.totalSize)}</span>
        </div>
        ${isExpanded ? `<div class="mod-detail"><table class="mod-table">
          <thead><tr><th style="min-width:140px">名称</th><th>路径</th><th style="width:120px">Base</th><th style="width:70px">Size</th><th style="width:80px">加载时间</th></tr></thead>
          <tbody>${dlls.map(d => `<tr class="mod-row">
            <td class="mod-cell-name">${highlight(d.name, this.searchKeyword)}</td>
            <td class="mod-cell-path" title="${esc(d.path)}">${highlight(d.path || '-', this.searchKeyword)}</td>
            <td class="mod-cell-addr">${esc(d.base)}</td>
            <td class="mod-cell-addr">${this.fmtSize(d.sizeNum)}</td>
            <td style="font-size:10px;color:var(--text-secondary,#94a3b8)">${esc(d.loadTime === 'N/A' ? '-' : d.loadTime)}</td>
          </tr>`).join('')}</tbody></table>
          ${dlls.length === 0 ? '<div class="mod-empty" style="padding:16px">没有匹配的DLL</div>' : ''}
        </div>` : ''}
      </div>`;
  }

  private getFiltered(): Vol3DllGroup[] {
    const kw = this.searchKeyword.toLowerCase();
    if (!kw) return this.groups;
    return this.groups.filter(g => {
      if (g.process.toLowerCase().includes(kw) || g.pid.toString().includes(kw)) return true;
      return g.dlls.some(d => d.name.toLowerCase().includes(kw) || d.path.toLowerCase().includes(kw));
    });
  }

  private fmtSize(b: number): string { if (b >= 1048576) return (b / 1048576).toFixed(1) + 'M'; if (b >= 1024) return (b / 1024).toFixed(0) + 'K'; return b + 'B'; }

  private bindEvents() {
    if (!this.container) return;
    const input = this.container.querySelector('#v3dll-search') as HTMLInputElement;
    if (input) { let t: number | null = null; input.addEventListener('input', () => { if (t) clearTimeout(t); t = window.setTimeout(() => { this.searchKeyword = input.value; this.render(); this.bindEvents(); const n = this.container?.querySelector('#v3dll-search') as HTMLInputElement; if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250); }); }
    this.container.querySelector('#v3dll-list')?.addEventListener('click', e => {
      const h = (e.target as HTMLElement).closest('.mod-process-header'); if (!h) return;
      const p = h.closest('.mod-process') as HTMLElement; if (!p) return;
      const pid = parseInt(p.getAttribute('data-pid') || '0', 10);
      if (this.expandedPids.has(pid)) this.expandedPids.delete(pid); else this.expandedPids.add(pid);
      this.render(); this.bindEvents();
    });
  }

  cleanup() { this.groups = []; this.total = 0; this.expandedPids.clear(); this.searchKeyword = ''; this.error = null; }
}
