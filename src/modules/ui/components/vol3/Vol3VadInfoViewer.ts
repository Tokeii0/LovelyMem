/**
 * Vol3 VAD 信息视图 (vadinfo)
 * 按进程分组手风琴，Protection 颜色编码，关联文件映射
 * 安全分析：高亮 EXECUTE 类保护区
 */

import { loadVol3Csv, esc, highlight } from './vol3CsvUtils';

interface Vol3Vad {
  pid: number; process: string; offset: string;
  startVpn: string; endVpn: string; tag: string;
  protection: string; commitCharge: string; privateMemory: string;
  parent: string; file: string;
}

interface Vol3VadGroup {
  pid: number; process: string; vads: Vol3Vad[];
  execCount: number; fileMapCount: number;
}

const PROT_COLORS: Record<string, string> = {
  'PAGE_EXECUTE_READWRITE': '#dc2626',
  'PAGE_EXECUTE_WRITECOPY': '#ea580c',
  'PAGE_EXECUTE_READ': '#d97706',
  'PAGE_EXECUTE': '#f59e0b',
  'PAGE_READWRITE': '#2563eb',
  'PAGE_READONLY': '#16a34a',
  'PAGE_WRITECOPY': '#6366f1',
  'PAGE_NOACCESS': '#94a3b8',
};

export class Vol3VadInfoViewer {
  private container: HTMLElement | null = null;
  private groups: Vol3VadGroup[] = [];
  private total = 0;
  private protDist: Record<string, number> = {};
  private isLoading = false;
  private error: string | null = null;
  private searchKeyword = '';
  private protFilter = '';
  private onlyExec = false;
  private expandedPids: Set<number> = new Set();

  init(containerId: string) { this.container = document.getElementById(containerId); }

  async load(fileName: string) {
    if (!this.container) return;
    this.isLoading = true; this.error = null; this.render();
    try {
      const rows = await loadVol3Csv(fileName);
      if (rows.length < 2) { this.isLoading = false; this.render(); this.bindEvents(); return; }
      const h = rows[0]; const idx = (n: string) => h.indexOf(n);

      const vads: Vol3Vad[] = rows.slice(1).map(r => ({
        pid: parseInt(r[idx('PID')] || '0', 10), process: r[idx('Process')] || '',
        offset: r[idx('Offset')] || '', startVpn: r[idx('Start VPN')] || '',
        endVpn: r[idx('End VPN')] || '', tag: (r[idx('Tag')] || '').trim(),
        protection: (r[idx('Protection')] || '').trim(), commitCharge: r[idx('CommitCharge')] || '',
        privateMemory: r[idx('PrivateMemory')] || '', parent: r[idx('Parent')] || '',
        file: r[idx('File')] || '',
      }));

      this.total = vads.length;
      this.protDist = {};
      vads.forEach(v => { if (v.protection) this.protDist[v.protection] = (this.protDist[v.protection] || 0) + 1; });

      const map = new Map<number, Vol3VadGroup>();
      vads.forEach(v => {
        if (!map.has(v.pid)) map.set(v.pid, { pid: v.pid, process: v.process, vads: [], execCount: 0, fileMapCount: 0 });
        const g = map.get(v.pid)!; g.vads.push(v);
        if (v.protection.includes('EXECUTE')) g.execCount++;
        if (v.file && v.file !== 'N/A') g.fileMapCount++;
      });
      this.groups = Array.from(map.values()).sort((a, b) => a.pid - b.pid);
    } catch (e) { this.error = String(e); }
    this.isLoading = false; this.render(); this.bindEvents();
  }

  private render() {
    if (!this.container) return;
    if (this.isLoading) { this.container.innerHTML = `<div class="mod-loading"><div class="mod-spinner"></div><div>正在解析VAD信息...</div></div>`; return; }
    if (this.error) { this.container.innerHTML = `<div class="svc-error">${esc(this.error)}</div>`; return; }
    if (!this.groups.length) { this.container.innerHTML = `<div class="svc-empty">暂无数据</div>`; return; }

    const execTotal = Object.entries(this.protDist).filter(([k]) => k.includes('EXECUTE')).reduce((s, [, v]) => s + v, 0);
    const topProts = Object.entries(this.protDist).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const filtered = this.getFiltered();

    this.container.innerHTML = `
      <div class="mod-wrapper">
        <div class="mod-stats-bar">
          <span class="mod-stat"><span class="mod-stat-v">${this.groups.length}</span> 进程</span>
          <span class="mod-stat"><span class="mod-stat-v">${this.total.toLocaleString()}</span> VAD</span>
          <span class="mod-stat" style="color:#dc2626"><span class="mod-stat-v">${execTotal}</span> 可执行区</span>
        </div>
        <div class="mod-toolbar">
          <input type="text" class="mod-search" id="v3vad-search" placeholder="搜索文件名、进程..." value="${esc(this.searchKeyword)}">
          <div class="mod-company-filters">
            <button class="mod-cbtn ${!this.protFilter && !this.onlyExec ? 'active' : ''}" data-prot="">全部</button>
            <button class="mod-cbtn ${this.onlyExec ? 'active' : ''}" id="v3vad-exec" style="color:#dc2626">⚠ 可执行 (${execTotal})</button>
            ${topProts.map(([p, c]) => `<button class="mod-cbtn ${this.protFilter === p ? 'active' : ''}" data-prot="${esc(p)}" style="color:${PROT_COLORS[p] || '#64748b'}">${p.replace('PAGE_', '')} (${c})</button>`).join('')}
          </div>
        </div>
        <div class="mod-list" id="v3vad-list">
          ${filtered.length === 0 ? '<div class="mod-empty">没有匹配</div>' : filtered.map(g => this.renderGroup(g)).join('')}
        </div>
      </div>`;
  }

  private renderGroup(g: Vol3VadGroup): string {
    const isExpanded = this.expandedPids.has(g.pid);
    const vads = this.filterVads(g.vads);

    return `
      <div class="mod-process ${isExpanded ? 'expanded' : ''}" data-pid="${g.pid}">
        <div class="mod-process-header">
          <span class="mod-arrow">${isExpanded ? '&#9660;' : '&#9654;'}</span>
          <span class="mod-pid">PID ${g.pid}</span>
          <span class="mod-pname">${esc(g.process)}</span>
          <span class="mod-pcount">${vads.length}${vads.length !== g.vads.length ? '/' + g.vads.length : ''} VAD</span>
          ${g.execCount > 0 ? `<span class="mod-psize" style="color:#dc2626">${g.execCount} 可执行</span>` : ''}
          ${g.fileMapCount > 0 ? `<span class="mod-psize" style="color:#2563eb">${g.fileMapCount} 文件映射</span>` : ''}
        </div>
        ${isExpanded ? `<div class="mod-detail"><table class="mod-table">
          <thead><tr><th style="width:110px">起始地址</th><th style="width:110px">结束地址</th><th style="width:40px">Tag</th><th style="min-width:160px">保护</th><th style="width:50px">提交</th><th>映射文件</th></tr></thead>
          <tbody>${vads.map(v => {
            const isExec = v.protection.includes('EXECUTE');
            const pColor = PROT_COLORS[v.protection] || '#64748b';
            return `<tr class="mod-row" style="${isExec ? 'background:rgba(220,38,38,0.04)' : ''}">
              <td class="mod-cell-addr">${esc(v.startVpn)}</td>
              <td class="mod-cell-addr">${esc(v.endVpn)}</td>
              <td style="font-size:10px;color:#94a3b8">${esc(v.tag)}</td>
              <td><span style="color:${pColor};font-weight:${isExec ? '600' : '400'};font-size:11px">${esc(v.protection.replace('PAGE_', ''))}</span></td>
              <td style="text-align:center;font-size:11px">${esc(v.commitCharge)}</td>
              <td class="mod-cell-path" title="${esc(v.file)}">${v.file && v.file !== 'N/A' ? highlight(v.file, this.searchKeyword) : '<span style="color:#94a3b8">-</span>'}</td>
            </tr>`;
          }).join('')}</tbody></table>
          ${vads.length === 0 ? '<div class="mod-empty" style="padding:16px">没有匹配</div>' : ''}
        </div>` : ''}
      </div>`;
  }

  private filterVads(vads: Vol3Vad[]): Vol3Vad[] {
    const kw = this.searchKeyword.toLowerCase();
    return vads.filter(v => {
      if (this.onlyExec && !v.protection.includes('EXECUTE')) return false;
      if (this.protFilter && v.protection !== this.protFilter) return false;
      if (kw) return v.file.toLowerCase().includes(kw) || v.startVpn.includes(kw);
      return true;
    });
  }

  private getFiltered(): Vol3VadGroup[] {
    const kw = this.searchKeyword.toLowerCase();
    return this.groups.filter(g => {
      const vads = this.filterVads(g.vads);
      if (vads.length > 0) return true;
      if (kw && (g.process.toLowerCase().includes(kw) || g.pid.toString().includes(kw))) return true;
      return false;
    });
  }

  private bindEvents() {
    if (!this.container) return;
    const input = this.container.querySelector('#v3vad-search') as HTMLInputElement;
    if (input) { let t: number | null = null; input.addEventListener('input', () => { if (t) clearTimeout(t); t = window.setTimeout(() => { this.searchKeyword = input.value; this.render(); this.bindEvents(); const n = this.container?.querySelector('#v3vad-search') as HTMLInputElement; if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250); }); }
    this.container.querySelector('#v3vad-exec')?.addEventListener('click', () => { this.onlyExec = !this.onlyExec; if (this.onlyExec) this.protFilter = ''; this.render(); this.bindEvents(); });
    this.container.querySelectorAll('.mod-cbtn[data-prot]').forEach(btn => {
      btn.addEventListener('click', () => { this.protFilter = btn.getAttribute('data-prot') || ''; this.onlyExec = false; this.render(); this.bindEvents(); });
    });
    this.container.querySelector('#v3vad-list')?.addEventListener('click', e => {
      const h = (e.target as HTMLElement).closest('.mod-process-header'); if (!h) return;
      const p = h.closest('.mod-process') as HTMLElement; if (!p) return;
      const pid = parseInt(p.getAttribute('data-pid') || '0', 10);
      if (this.expandedPids.has(pid)) this.expandedPids.delete(pid); else this.expandedPids.add(pid);
      this.render(); this.bindEvents();
    });
  }

  cleanup() { this.groups = []; this.total = 0; this.protDist = {}; this.expandedPids.clear(); this.searchKeyword = ''; this.protFilter = ''; this.onlyExec = false; this.error = null; }
}
