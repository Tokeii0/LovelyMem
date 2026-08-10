/**
 * Vol3 LDR模块视图 (ldrmodules)
 * 安全分析重点：InLoad/InInit/InMem 三列为 False 时疑似注入
 * 按进程分组手风琴，异常行红色高亮
 */

import { loadVol3Csv, esc, highlight } from './vol3CsvUtils';

interface Vol3LdrModule {
  pid: number; process: string; base: string;
  inLoad: boolean; inInit: boolean; inMem: boolean;
  mappedPath: string;
}

interface Vol3LdrGroup {
  pid: number; process: string; modules: Vol3LdrModule[];
  suspiciousCount: number;
}

export class Vol3LdrModulesViewer {
  private container: HTMLElement | null = null;
  private groups: Vol3LdrGroup[] = [];
  private total = 0;
  private totalSuspicious = 0;
  private isLoading = false;
  private error: string | null = null;
  private searchKeyword = '';
  private onlySuspicious = false;
  private expandedPids: Set<number> = new Set();

  init(containerId: string) { this.container = document.getElementById(containerId); }

  async load(fileName: string) {
    if (!this.container) return;
    this.isLoading = true; this.error = null; this.render();
    try {
      const rows = await loadVol3Csv(fileName);
      if (rows.length < 2) { this.isLoading = false; this.render(); this.bindEvents(); return; }
      const h = rows[0]; const idx = (n: string) => h.indexOf(n);

      const mods: Vol3LdrModule[] = rows.slice(1).map(r => ({
        pid: parseInt(r[idx('Pid')] || r[idx('PID')] || '0', 10),
        process: r[idx('Process')] || '',
        base: r[idx('Base')] || '',
        inLoad: (r[idx('InLoad')] || '').toLowerCase() === 'true',
        inInit: (r[idx('InInit')] || '').toLowerCase() === 'true',
        inMem: (r[idx('InMem')] || '').toLowerCase() === 'true',
        mappedPath: r[idx('MappedPath')] || '',
      }));

      this.total = mods.length;
      this.totalSuspicious = 0;
      const map = new Map<number, Vol3LdrGroup>();
      mods.forEach(m => {
        if (!map.has(m.pid)) map.set(m.pid, { pid: m.pid, process: m.process, modules: [], suspiciousCount: 0 });
        const g = map.get(m.pid)!; g.modules.push(m);
        const isSusp = !m.inLoad && !m.inInit && !m.inMem;
        if (isSusp) { g.suspiciousCount++; this.totalSuspicious++; }
      });
      this.groups = Array.from(map.values()).sort((a, b) => b.suspiciousCount - a.suspiciousCount || a.pid - b.pid);
    } catch (e) { this.error = String(e); }
    this.isLoading = false; this.render(); this.bindEvents();
  }

  private isSuspicious(m: Vol3LdrModule): boolean { return !m.inLoad && !m.inInit && !m.inMem; }

  private render() {
    if (!this.container) return;
    if (this.isLoading) { this.container.innerHTML = `<div class="mod-loading"><div class="mod-spinner"></div><div>正在解析LDR模块...</div></div>`; return; }
    if (this.error) { this.container.innerHTML = `<div class="svc-error">${esc(this.error)}</div>`; return; }
    if (!this.groups.length) { this.container.innerHTML = `<div class="svc-empty">暂无数据</div>`; return; }

    const filtered = this.getFiltered();

    this.container.innerHTML = `
      <div class="mod-wrapper">
        <div class="mod-stats-bar">
          <span class="mod-stat"><span class="mod-stat-v">${this.groups.length}</span> 进程</span>
          <span class="mod-stat"><span class="mod-stat-v">${this.total.toLocaleString()}</span> 模块</span>
          ${this.totalSuspicious > 0 ? `<span class="mod-stat" style="color:#dc2626"><span class="mod-stat-v">${this.totalSuspicious}</span> ⚠ 可疑 (三列全False)</span>` : '<span class="mod-stat" style="color:#16a34a">✓ 无可疑模块</span>'}
        </div>
        <div class="mod-toolbar">
          <input type="text" class="mod-search" id="v3ldr-search" placeholder="搜索路径、进程..." value="${esc(this.searchKeyword)}">
          <div class="mod-company-filters">
            ${this.totalSuspicious > 0 ? `<button class="mod-cbtn ${this.onlySuspicious ? 'active' : ''}" id="v3ldr-susp" style="color:#dc2626">⚠ 仅看可疑 (${this.totalSuspicious})</button>` : ''}
          </div>
        </div>
        <div class="mod-list" id="v3ldr-list">
          ${filtered.length === 0 ? '<div class="mod-empty">没有匹配</div>' : filtered.map(g => this.renderGroup(g)).join('')}
        </div>
      </div>`;
  }

  private renderGroup(g: Vol3LdrGroup): string {
    const isExpanded = this.expandedPids.has(g.pid);
    const kw = this.searchKeyword.toLowerCase();
    let mods = g.modules;
    if (this.onlySuspicious) mods = mods.filter(m => this.isSuspicious(m));
    if (kw) mods = mods.filter(m => m.mappedPath.toLowerCase().includes(kw));

    return `
      <div class="mod-process ${isExpanded ? 'expanded' : ''}" data-pid="${g.pid}">
        <div class="mod-process-header">
          <span class="mod-arrow">${isExpanded ? '&#9660;' : '&#9654;'}</span>
          <span class="mod-pid">PID ${g.pid}</span>
          <span class="mod-pname">${esc(g.process)}</span>
          <span class="mod-pcount">${mods.length}${mods.length !== g.modules.length ? '/' + g.modules.length : ''} 模块</span>
          ${g.suspiciousCount > 0 ? `<span class="mod-psize" style="color:#dc2626;font-weight:600">⚠ ${g.suspiciousCount} 可疑</span>` : ''}
        </div>
        ${isExpanded ? `<div class="mod-detail"><table class="mod-table">
          <thead><tr><th style="width:120px">Base</th><th style="width:60px">InLoad</th><th style="width:60px">InInit</th><th style="width:60px">InMem</th><th>映射路径</th></tr></thead>
          <tbody>${mods.map(m => {
            const susp = this.isSuspicious(m);
            return `<tr class="mod-row" style="${susp ? 'background:rgba(220,38,38,0.06)' : ''}">
              <td class="mod-cell-addr">${esc(m.base)}</td>
              <td style="text-align:center">${this.boolBadge(m.inLoad)}</td>
              <td style="text-align:center">${this.boolBadge(m.inInit)}</td>
              <td style="text-align:center">${this.boolBadge(m.inMem)}</td>
              <td class="mod-cell-path" title="${esc(m.mappedPath)}">${highlight(m.mappedPath || '-', this.searchKeyword)}</td>
            </tr>`;
          }).join('')}</tbody></table>
          ${mods.length === 0 ? '<div class="mod-empty" style="padding:16px">没有匹配</div>' : ''}
        </div>` : ''}
      </div>`;
  }

  private boolBadge(v: boolean): string {
    return v
      ? '<span style="color:#16a34a;font-weight:600;font-size:12px">✓</span>'
      : '<span style="color:#dc2626;font-weight:600;font-size:12px">✗</span>';
  }

  private getFiltered(): Vol3LdrGroup[] {
    const kw = this.searchKeyword.toLowerCase();
    return this.groups.filter(g => {
      if (this.onlySuspicious && g.suspiciousCount === 0) return false;
      if (kw) {
        if (g.process.toLowerCase().includes(kw) || g.pid.toString().includes(kw)) return true;
        let mods = this.onlySuspicious ? g.modules.filter(m => this.isSuspicious(m)) : g.modules;
        return mods.some(m => m.mappedPath.toLowerCase().includes(kw));
      }
      return true;
    });
  }

  private bindEvents() {
    if (!this.container) return;
    const input = this.container.querySelector('#v3ldr-search') as HTMLInputElement;
    if (input) { let t: number | null = null; input.addEventListener('input', () => { if (t) clearTimeout(t); t = window.setTimeout(() => { this.searchKeyword = input.value; this.render(); this.bindEvents(); const n = this.container?.querySelector('#v3ldr-search') as HTMLInputElement; if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250); }); }
    this.container.querySelector('#v3ldr-susp')?.addEventListener('click', () => { this.onlySuspicious = !this.onlySuspicious; this.render(); this.bindEvents(); });
    this.container.querySelector('#v3ldr-list')?.addEventListener('click', e => {
      const h = (e.target as HTMLElement).closest('.mod-process-header'); if (!h) return;
      const p = h.closest('.mod-process') as HTMLElement; if (!p) return;
      const pid = parseInt(p.getAttribute('data-pid') || '0', 10);
      if (this.expandedPids.has(pid)) this.expandedPids.delete(pid); else this.expandedPids.add(pid);
      this.render(); this.bindEvents();
    });
  }

  cleanup() { this.groups = []; this.total = 0; this.totalSuspicious = 0; this.expandedPids.clear(); this.searchKeyword = ''; this.onlySuspicious = false; this.error = null; }
}
