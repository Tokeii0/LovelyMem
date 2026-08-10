/**
 * Vol3 大内存池视图 (bigpools)
 * 按 Tag 分组统计，PoolType 筛选，Allocated/Freed 状态
 */

import { loadVol3Csv, esc, highlight } from './vol3CsvUtils';

interface Vol3BigPool {
  allocation: string; tag: string; poolType: string;
  numberOfBytes: string; sizeNum: number; status: string;
}

interface Vol3TagGroup {
  tag: string; pools: Vol3BigPool[];
  totalSize: number; count: number;
}

const STATUS_COLORS: Record<string, string> = {
  'Allocated': '#16a34a',
  'Freed': '#94a3b8',
  'Free': '#94a3b8',
};

export class Vol3BigPoolsViewer {
  private container: HTMLElement | null = null;
  private data: Vol3BigPool[] = [];
  private tagGroups: Vol3TagGroup[] = [];
  private poolTypes: Record<string, number> = {};
  private isLoading = false;
  private error: string | null = null;
  private searchKeyword = '';
  private poolTypeFilter = '';
  private statusFilter = '';
  private viewMode: 'grouped' | 'flat' = 'grouped';
  private expandedTags: Set<string> = new Set();

  init(containerId: string) { this.container = document.getElementById(containerId); }

  async load(fileName: string) {
    if (!this.container) return;
    this.isLoading = true; this.error = null; this.render();
    try {
      const rows = await loadVol3Csv(fileName);
      if (rows.length < 2) { this.data = []; this.isLoading = false; this.render(); this.bindEvents(); return; }
      const h = rows[0]; const idx = (n: string) => h.indexOf(n);

      this.data = rows.slice(1).map(r => {
        const sizeHex = r[idx('NumberOfBytes')] || '0';
        const sizeNum = parseInt(sizeHex, 16) || parseInt(sizeHex, 10) || 0;
        return {
          allocation: r[idx('Allocation')] || '', tag: (r[idx('Tag')] || '').trim(),
          poolType: r[idx('PoolType')] || '', numberOfBytes: sizeHex,
          sizeNum, status: r[idx('Status')] || '',
        };
      });

      // 统计
      this.poolTypes = {};
      this.data.forEach(p => { if (p.poolType) this.poolTypes[p.poolType] = (this.poolTypes[p.poolType] || 0) + 1; });

      // 按 Tag 分组
      const map = new Map<string, Vol3TagGroup>();
      this.data.forEach(p => {
        if (!map.has(p.tag)) map.set(p.tag, { tag: p.tag, pools: [], totalSize: 0, count: 0 });
        const g = map.get(p.tag)!; g.pools.push(p); g.totalSize += p.sizeNum; g.count++;
      });
      this.tagGroups = Array.from(map.values()).sort((a, b) => b.totalSize - a.totalSize);
    } catch (e) { this.error = String(e); }
    this.isLoading = false; this.render(); this.bindEvents();
  }

  private render() {
    if (!this.container) return;
    if (this.isLoading) { this.container.innerHTML = `<div class="mod-loading"><div class="mod-spinner"></div><div>正在解析大内存池...</div></div>`; return; }
    if (this.error) { this.container.innerHTML = `<div class="svc-error">${esc(this.error)}</div>`; return; }
    if (!this.data.length) { this.container.innerHTML = `<div class="svc-empty">暂无数据</div>`; return; }

    const totalSize = this.data.reduce((s, p) => s + p.sizeNum, 0);
    const allocated = this.data.filter(p => p.status === 'Allocated').length;
    const topTypes = Object.entries(this.poolTypes).sort((a, b) => b[1] - a[1]);

    this.container.innerHTML = `
      <div class="mod-wrapper">
        <div class="mod-stats-bar">
          <span class="mod-stat"><span class="mod-stat-v">${this.data.length.toLocaleString()}</span> 分配</span>
          <span class="mod-stat"><span class="mod-stat-v">${this.tagGroups.length}</span> 标签</span>
          <span class="mod-stat"><span class="mod-stat-v">${this.fmtSize(totalSize)}</span> 总大小</span>
          <span class="mod-stat" style="color:#16a34a"><span class="mod-stat-v">${allocated.toLocaleString()}</span> 已分配</span>
          <span class="mod-stat" style="color:#94a3b8"><span class="mod-stat-v">${(this.data.length - allocated).toLocaleString()}</span> 已释放</span>
        </div>
        <div class="mod-toolbar">
          <input type="text" class="mod-search" id="v3bp-search" placeholder="搜索Tag、地址..." value="${esc(this.searchKeyword)}">
          <div class="mod-company-filters">
            <button class="mod-cbtn ${this.poolTypeFilter === '' ? 'active' : ''}" data-pool="">全部类型</button>
            ${topTypes.map(([t, c]) => `<button class="mod-cbtn ${this.poolTypeFilter === t ? 'active' : ''}" data-pool="${esc(t)}">${t.replace('Pool', '').replace('CacheAligned', 'CA')} (${c})</button>`).join('')}
            <span style="width:1px;height:16px;background:var(--border-color,#e2e8f0);margin:0 4px"></span>
            <button class="mod-cbtn ${this.statusFilter === '' ? 'active' : ''}" data-status="">全部状态</button>
            <button class="mod-cbtn ${this.statusFilter === 'Allocated' ? 'active' : ''}" data-status="Allocated" style="color:#16a34a">已分配</button>
            <button class="mod-cbtn ${this.statusFilter === 'Freed' ? 'active' : ''}" data-status="Freed" style="color:#94a3b8">已释放</button>
          </div>
        </div>
        <div class="mod-list" id="v3bp-list">
          ${this.renderGrouped()}
        </div>
      </div>`;
  }

  private renderGrouped(): string {
    const filtered = this.getFilteredGroups();
    if (filtered.length === 0) return '<div class="mod-empty">没有匹配</div>';

    return filtered.map(g => {
      const isExpanded = this.expandedTags.has(g.tag);
      const pools = this.filterPools(g.pools);

      return `
        <div class="mod-process ${isExpanded ? 'expanded' : ''}" data-tag="${esc(g.tag)}">
          <div class="mod-process-header">
            <span class="mod-arrow">${isExpanded ? '&#9660;' : '&#9654;'}</span>
            <span class="mod-pid" style="font-weight:700;font-size:13px;letter-spacing:1px">${highlight(g.tag || '(empty)', this.searchKeyword)}</span>
            <span class="mod-pcount">${pools.length}${pools.length !== g.pools.length ? '/' + g.pools.length : ''} 个分配</span>
            <span class="mod-psize">${this.fmtSize(pools.reduce((s, p) => s + p.sizeNum, 0))}</span>
          </div>
          ${isExpanded ? `<div class="mod-detail"><table class="mod-table">
            <thead><tr><th style="width:140px">Allocation</th><th style="width:160px">PoolType</th><th style="width:100px">Size</th><th style="width:80px">状态</th></tr></thead>
            <tbody>${pools.map(p => `<tr class="mod-row">
              <td class="mod-cell-addr">${esc(p.allocation)}</td>
              <td style="font-size:11px;color:#64748b">${esc(p.poolType)}</td>
              <td class="mod-cell-addr">${p.numberOfBytes} (${this.fmtSize(p.sizeNum)})</td>
              <td><span style="color:${STATUS_COLORS[p.status] || '#64748b'};font-weight:500;font-size:11px">${esc(p.status)}</span></td>
            </tr>`).join('')}</tbody></table>
            ${pools.length === 0 ? '<div class="mod-empty" style="padding:16px">没有匹配</div>' : ''}
          </div>` : ''}
        </div>`;
    }).join('');
  }

  private filterPools(pools: Vol3BigPool[]): Vol3BigPool[] {
    const kw = this.searchKeyword.toLowerCase();
    return pools.filter(p => {
      if (this.poolTypeFilter && p.poolType !== this.poolTypeFilter) return false;
      if (this.statusFilter && p.status !== this.statusFilter) return false;
      if (kw) return p.allocation.toLowerCase().includes(kw) || p.tag.toLowerCase().includes(kw);
      return true;
    });
  }

  private getFilteredGroups(): Vol3TagGroup[] {
    const kw = this.searchKeyword.toLowerCase();
    return this.tagGroups.filter(g => {
      const pools = this.filterPools(g.pools);
      if (pools.length > 0) return true;
      if (kw && g.tag.toLowerCase().includes(kw)) return true;
      return false;
    });
  }

  private fmtSize(b: number): string { if (b >= 1048576) return (b / 1048576).toFixed(1) + ' MB'; if (b >= 1024) return (b / 1024).toFixed(0) + ' KB'; return b + ' B'; }

  private bindEvents() {
    if (!this.container) return;
    const input = this.container.querySelector('#v3bp-search') as HTMLInputElement;
    if (input) { let t: number | null = null; input.addEventListener('input', () => { if (t) clearTimeout(t); t = window.setTimeout(() => { this.searchKeyword = input.value; this.render(); this.bindEvents(); const n = this.container?.querySelector('#v3bp-search') as HTMLInputElement; if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250); }); }
    this.container.querySelectorAll('.mod-cbtn[data-pool]').forEach(btn => {
      btn.addEventListener('click', () => { this.poolTypeFilter = btn.getAttribute('data-pool') || ''; this.render(); this.bindEvents(); });
    });
    this.container.querySelectorAll('.mod-cbtn[data-status]').forEach(btn => {
      btn.addEventListener('click', () => { this.statusFilter = btn.getAttribute('data-status') || ''; this.render(); this.bindEvents(); });
    });
    this.container.querySelector('#v3bp-list')?.addEventListener('click', e => {
      const h = (e.target as HTMLElement).closest('.mod-process-header'); if (!h) return;
      const p = h.closest('.mod-process') as HTMLElement; if (!p) return;
      const tag = p.getAttribute('data-tag') || '';
      if (this.expandedTags.has(tag)) this.expandedTags.delete(tag); else this.expandedTags.add(tag);
      this.render(); this.bindEvents();
    });
  }

  cleanup() { this.data = []; this.tagGroups = []; this.poolTypes = {}; this.expandedTags.clear(); this.searchKeyword = ''; this.poolTypeFilter = ''; this.statusFilter = ''; this.error = null; }
}
