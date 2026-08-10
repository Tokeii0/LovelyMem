/**
 * Vol3 权限视图 (privileges)
 * 按进程分组手风琴，Attributes 筛选 (Present/Enabled/Default)
 */

import { loadVol3Csv, esc, highlight } from './vol3CsvUtils';

interface Vol3Privilege {
  pid: number; process: string; value: number;
  privilege: string; attributes: string; description: string;
}

interface Vol3PrivGroup {
  pid: number; process: string; privileges: Vol3Privilege[];
  enabledCount: number;
}

const ATTR_COLORS: Record<string, string> = {
  'Present': '#64748b',
  'Enabled': '#16a34a',
  'Default': '#2563eb',
  'Enabled,Default': '#059669',
  'Present,Enabled': '#16a34a',
  'Present,Default': '#2563eb',
  'Present,Enabled,Default': '#059669',
};

export class Vol3PrivilegeViewer {
  private container: HTMLElement | null = null;
  private groups: Vol3PrivGroup[] = [];
  private total = 0;
  private attrDist: Record<string, number> = {};
  private isLoading = false;
  private error: string | null = null;
  private searchKeyword = '';
  private attrFilter = '';
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

      const allPrivs: Vol3Privilege[] = rows.slice(1).map(r => ({
        pid: parseInt(r[idx('PID')] || '0', 10),
        process: r[idx('Process')] || '',
        value: parseInt(r[idx('Value')] || '0', 10),
        privilege: r[idx('Privilege')] || '',
        attributes: r[idx('Attributes')] || '',
        description: r[idx('Description')] || '',
      }));

      this.total = allPrivs.length;
      this.attrDist = {};
      allPrivs.forEach(p => { if (p.attributes) this.attrDist[p.attributes] = (this.attrDist[p.attributes] || 0) + 1; });

      const map = new Map<number, Vol3PrivGroup>();
      allPrivs.forEach(p => {
        if (!map.has(p.pid)) map.set(p.pid, { pid: p.pid, process: p.process, privileges: [], enabledCount: 0 });
        const g = map.get(p.pid)!;
        g.privileges.push(p);
        if (p.attributes.includes('Enabled')) g.enabledCount++;
      });
      this.groups = Array.from(map.values()).sort((a, b) => a.pid - b.pid);
    } catch (e) { this.error = String(e); }
    this.isLoading = false; this.render(); this.bindEvents();
  }

  private render() {
    if (!this.container) return;
    if (this.isLoading) { this.container.innerHTML = `<div class="mod-loading"><div class="mod-spinner"></div><div>正在解析权限数据...</div></div>`; return; }
    if (this.error) { this.container.innerHTML = `<div class="svc-error">${esc(this.error)}</div>`; return; }
    if (!this.groups.length) { this.container.innerHTML = `<div class="svc-empty">暂无数据</div>`; return; }

    const topAttrs = Object.entries(this.attrDist).sort((a, b) => b[1] - a[1]);
    const filtered = this.getFiltered();
    const enabledTotal = this.groups.reduce((s, g) => s + g.enabledCount, 0);

    this.container.innerHTML = `
      <div class="mod-wrapper">
        <div class="mod-stats-bar">
          <span class="mod-stat"><span class="mod-stat-v">${this.groups.length}</span> 进程</span>
          <span class="mod-stat"><span class="mod-stat-v">${this.total.toLocaleString()}</span> 权限条目</span>
          <span class="mod-stat" style="color:#16a34a"><span class="mod-stat-v">${enabledTotal}</span> 已启用</span>
        </div>
        <div class="mod-toolbar">
          <input type="text" class="mod-search" id="v3p-search" placeholder="搜索权限名、进程名、描述..." value="${esc(this.searchKeyword)}">
          <div class="mod-company-filters">
            <button class="mod-cbtn ${this.attrFilter === '' ? 'active' : ''}" data-attr="">全部</button>
            ${topAttrs.map(([a, c]) => `<button class="mod-cbtn ${this.attrFilter === a ? 'active' : ''}" data-attr="${esc(a)}" style="color:${ATTR_COLORS[a] || '#64748b'}">${a} (${c})</button>`).join('')}
          </div>
        </div>
        <div class="mod-list" id="v3p-list">
          ${filtered.length === 0 ? '<div class="mod-empty">没有匹配</div>' : filtered.map(g => this.renderGroup(g)).join('')}
        </div>
      </div>`;
  }

  private renderGroup(g: Vol3PrivGroup): string {
    const isExpanded = this.expandedPids.has(g.pid);
    const kw = this.searchKeyword.toLowerCase();
    let privs = g.privileges;
    if (this.attrFilter) privs = privs.filter(p => p.attributes === this.attrFilter);
    if (kw) privs = privs.filter(p => p.privilege.toLowerCase().includes(kw) || p.description.toLowerCase().includes(kw));

    return `
      <div class="mod-process ${isExpanded ? 'expanded' : ''}" data-pid="${g.pid}">
        <div class="mod-process-header">
          <span class="mod-arrow">${isExpanded ? '&#9660;' : '&#9654;'}</span>
          <span class="mod-pid">PID ${g.pid}</span>
          <span class="mod-pname">${esc(g.process)}</span>
          <span class="mod-pcount">${privs.length}${privs.length !== g.privileges.length ? '/' + g.privileges.length : ''} 权限</span>
          ${g.enabledCount > 0 ? `<span class="mod-psize" style="color:#16a34a">${g.enabledCount} 已启用</span>` : ''}
        </div>
        ${isExpanded ? `<div class="mod-detail"><table class="mod-table">
          <thead><tr><th style="width:40px">#</th><th style="min-width:200px">权限名称</th><th style="width:140px">属性</th><th>描述</th></tr></thead>
          <tbody>${privs.map(p => {
            const attrColor = ATTR_COLORS[p.attributes] || '#64748b';
            const isEnabled = p.attributes.includes('Enabled');
            return `<tr class="mod-row" style="${isEnabled ? 'background:rgba(22,163,106,0.04)' : ''}">
              <td class="mod-cell-addr">${p.value}</td>
              <td class="mod-cell-name">${highlight(p.privilege, this.searchKeyword)}</td>
              <td><span style="color:${attrColor};font-weight:${isEnabled ? '600' : '400'};font-size:11px">${esc(p.attributes)}</span></td>
              <td class="mod-cell-desc">${highlight(p.description, this.searchKeyword)}</td>
            </tr>`;
          }).join('')}</tbody></table>
          ${privs.length === 0 ? '<div class="mod-empty" style="padding:16px">没有匹配的权限</div>' : ''}
        </div>` : ''}
      </div>`;
  }

  private getFiltered(): Vol3PrivGroup[] {
    const kw = this.searchKeyword.toLowerCase();
    return this.groups.filter(g => {
      let privs = g.privileges;
      if (this.attrFilter) privs = privs.filter(p => p.attributes === this.attrFilter);
      if (kw) {
        const matchProc = g.process.toLowerCase().includes(kw) || g.pid.toString().includes(kw);
        const matchPriv = privs.some(p => p.privilege.toLowerCase().includes(kw) || p.description.toLowerCase().includes(kw));
        return matchProc || matchPriv;
      }
      if (this.attrFilter) return privs.length > 0;
      return true;
    });
  }

  private bindEvents() {
    if (!this.container) return;
    const input = this.container.querySelector('#v3p-search') as HTMLInputElement;
    if (input) {
      let t: number | null = null;
      input.addEventListener('input', () => { if (t) clearTimeout(t); t = window.setTimeout(() => { this.searchKeyword = input.value; this.render(); this.bindEvents(); const n = this.container?.querySelector('#v3p-search') as HTMLInputElement; if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250); });
    }
    this.container.querySelectorAll('.mod-cbtn[data-attr]').forEach(btn => {
      btn.addEventListener('click', () => { this.attrFilter = btn.getAttribute('data-attr') || ''; this.render(); this.bindEvents(); });
    });
    this.container.querySelector('#v3p-list')?.addEventListener('click', e => {
      const h = (e.target as HTMLElement).closest('.mod-process-header');
      if (!h) return;
      const p = h.closest('.mod-process') as HTMLElement;
      if (!p) return;
      const pid = parseInt(p.getAttribute('data-pid') || '0', 10);
      if (this.expandedPids.has(pid)) this.expandedPids.delete(pid); else this.expandedPids.add(pid);
      this.render(); this.bindEvents();
    });
  }

  cleanup() { this.groups = []; this.total = 0; this.attrDist = {}; this.expandedPids.clear(); this.searchKeyword = ''; this.attrFilter = ''; this.error = null; }
}
