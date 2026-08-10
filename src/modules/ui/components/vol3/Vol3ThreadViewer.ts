/**
 * Vol3 线程视图 (threads)
 * 按进程分组手风琴，显示 TID/StartAddress/Path/CreateTime
 */

import { loadVol3Csv, esc } from './vol3CsvUtils';

interface Vol3Thread {
  offset: string; pid: number; tid: number;
  startAddr: string; startPath: string;
  win32StartAddr: string; win32StartPath: string;
  createTime: string; exitTime: string;
}

interface Vol3ThreadGroup {
  pid: number; threads: Vol3Thread[];
}

export class Vol3ThreadViewer {
  private container: HTMLElement | null = null;
  private groups: Vol3ThreadGroup[] = [];
  private total = 0;
  private isLoading = false;
  private error: string | null = null;
  private searchKeyword = '';
  private expandedPids: Set<number> = new Set();
  // PID -> 进程名映射 (从数据中无法得到，但尽力)
  private pidNames: Map<number, string> = new Map();

  init(containerId: string) { this.container = document.getElementById(containerId); }

  async load(fileName: string) {
    if (!this.container) return;
    this.isLoading = true; this.error = null; this.render();
    try {
      const rows = await loadVol3Csv(fileName);
      if (rows.length < 2) { this.isLoading = false; this.render(); this.bindEvents(); return; }
      const h = rows[0];
      const idx = (n: string) => h.indexOf(n);

      const threads: Vol3Thread[] = rows.slice(1).map(r => ({
        offset: r[idx('Offset')] || '',
        pid: parseInt(r[idx('PID')] || '0', 10),
        tid: parseInt(r[idx('TID')] || '0', 10),
        startAddr: r[idx('StartAddress')] || '',
        startPath: r[idx('StartPath')] || '',
        win32StartAddr: r[idx('Win32StartAddress')] || '',
        win32StartPath: r[idx('Win32StartPath')] || '',
        createTime: r[idx('CreateTime')] || '',
        exitTime: r[idx('ExitTime')] || '',
      }));

      this.total = threads.length;
      const map = new Map<number, Vol3Thread[]>();
      threads.forEach(t => { if (!map.has(t.pid)) map.set(t.pid, []); map.get(t.pid)!.push(t); });
      this.groups = Array.from(map.entries()).map(([pid, threads]) => ({ pid, threads })).sort((a, b) => a.pid - b.pid);
    } catch (e) { this.error = String(e); }
    this.isLoading = false; this.render(); this.bindEvents();
  }

  private render() {
    if (!this.container) return;
    if (this.isLoading) { this.container.innerHTML = `<div class="mod-loading"><div class="mod-spinner"></div><div>正在解析线程数据...</div></div>`; return; }
    if (this.error) { this.container.innerHTML = `<div class="svc-error">${esc(this.error)}</div>`; return; }
    if (!this.groups.length) { this.container.innerHTML = `<div class="svc-empty">暂无数据</div>`; return; }

    const filtered = this.getFiltered();

    this.container.innerHTML = `
      <div class="mod-wrapper">
        <div class="mod-stats-bar">
          <span class="mod-stat"><span class="mod-stat-v">${this.groups.length}</span> 进程</span>
          <span class="mod-stat"><span class="mod-stat-v">${this.total.toLocaleString()}</span> 线程</span>
        </div>
        <div class="mod-toolbar">
          <input type="text" class="mod-search" id="v3t-search" placeholder="搜索PID、TID、路径..." value="${esc(this.searchKeyword)}">
        </div>
        <div class="mod-list" id="v3t-list">
          ${filtered.length === 0 ? '<div class="mod-empty">没有匹配</div>' : filtered.map(g => this.renderGroup(g)).join('')}
        </div>
      </div>`;
  }

  private renderGroup(g: Vol3ThreadGroup): string {
    const isExpanded = this.expandedPids.has(g.pid);
    const kw = this.searchKeyword.toLowerCase();
    let threads = g.threads;
    if (kw) threads = threads.filter(t => t.tid.toString().includes(kw) || t.startPath.toLowerCase().includes(kw) || t.win32StartPath.toLowerCase().includes(kw));

    return `
      <div class="mod-process ${isExpanded ? 'expanded' : ''}" data-pid="${g.pid}">
        <div class="mod-process-header">
          <span class="mod-arrow">${isExpanded ? '&#9660;' : '&#9654;'}</span>
          <span class="mod-pid">PID ${g.pid}</span>
          <span class="mod-pcount">${threads.length}${threads.length !== g.threads.length ? '/' + g.threads.length : ''} 个线程</span>
        </div>
        ${isExpanded ? `<div class="mod-detail"><table class="mod-table">
          <thead><tr><th style="width:60px">TID</th><th style="width:140px">StartAddress</th><th>StartPath</th><th style="width:140px">Win32Addr</th><th>Win32Path</th><th style="width:100px">创建时间</th></tr></thead>
          <tbody>${threads.map(t => `<tr class="mod-row">
            <td class="mod-cell-addr">${t.tid}</td>
            <td class="mod-cell-addr">${esc(t.startAddr)}</td>
            <td style="white-space:normal;word-break:break-all;color:var(--text-secondary,#64748b)">${esc(t.startPath || '-')}</td>
            <td class="mod-cell-addr">${esc(t.win32StartAddr)}</td>
            <td style="white-space:normal;word-break:break-all;color:var(--text-secondary,#64748b)">${esc(t.win32StartPath || '-')}</td>
            <td style="font-size:10px;color:var(--text-secondary,#94a3b8)">${esc(t.createTime === 'N/A' ? '-' : t.createTime)}</td>
          </tr>`).join('')}</tbody></table>
          ${threads.length === 0 ? '<div class="mod-empty" style="padding:16px">没有匹配的线程</div>' : ''}
        </div>` : ''}
      </div>`;
  }

  private getFiltered(): Vol3ThreadGroup[] {
    const kw = this.searchKeyword.toLowerCase();
    if (!kw) return this.groups;
    return this.groups.filter(g => {
      if (g.pid.toString().includes(kw)) return true;
      return g.threads.some(t => t.tid.toString().includes(kw) || t.startPath.toLowerCase().includes(kw) || t.win32StartPath.toLowerCase().includes(kw));
    });
  }

  private bindEvents() {
    if (!this.container) return;
    const input = this.container.querySelector('#v3t-search') as HTMLInputElement;
    if (input) {
      let t: number | null = null;
      input.addEventListener('input', () => { if (t) clearTimeout(t); t = window.setTimeout(() => { this.searchKeyword = input.value; this.render(); this.bindEvents(); const n = this.container?.querySelector('#v3t-search') as HTMLInputElement; if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250); });
    }
    this.container.querySelector('#v3t-list')?.addEventListener('click', e => {
      const h = (e.target as HTMLElement).closest('.mod-process-header');
      if (!h) return;
      const p = h.closest('.mod-process') as HTMLElement;
      if (!p) return;
      const pid = parseInt(p.getAttribute('data-pid') || '0', 10);
      if (this.expandedPids.has(pid)) this.expandedPids.delete(pid); else this.expandedPids.add(pid);
      this.render(); this.bindEvents();
    });
  }

  cleanup() { this.groups = []; this.total = 0; this.expandedPids.clear(); this.searchKeyword = ''; this.error = null; }
}
