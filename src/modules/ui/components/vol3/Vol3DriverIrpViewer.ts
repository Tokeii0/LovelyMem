/**
 * Vol3 驱动IRP视图 (driverirp)
 * 按驱动分组手风琴，标注非标准IRP处理 (IopInvalidDeviceRequest以外的)
 */
import { loadVol3Csv, esc, highlight } from './vol3CsvUtils';

interface Vol3IrpEntry { offset: string; driverName: string; irp: string; address: string; module: string; symbol: string; }
interface Vol3IrpGroup { driverName: string; offset: string; entries: Vol3IrpEntry[]; customCount: number; }

export class Vol3DriverIrpViewer {
  private container: HTMLElement | null = null;
  private groups: Vol3IrpGroup[] = [];
  private total = 0;
  private isLoading = false;
  private error: string | null = null;
  private searchKeyword = '';
  private onlyCustom = false;
  private expandedDrivers: Set<string> = new Set();

  init(containerId: string) { this.container = document.getElementById(containerId); }

  async load(fileName: string) {
    if (!this.container) return;
    this.isLoading = true; this.error = null; this.render();
    try {
      const rows = await loadVol3Csv(fileName);
      if (rows.length < 2) { this.isLoading = false; this.render(); this.bindEvents(); return; }
      const h = rows[0]; const idx = (n: string) => h.indexOf(n);
      const entries: Vol3IrpEntry[] = rows.slice(1).map(r => ({
        offset: r[idx('Offset')] || '', driverName: r[idx('Driver Name')] || '',
        irp: r[idx('IRP')] || '', address: r[idx('Address')] || '',
        module: r[idx('Module')] || '', symbol: r[idx('Symbol')] || '',
      }));
      this.total = entries.length;
      const map = new Map<string, Vol3IrpGroup>();
      entries.forEach(e => {
        const key = e.driverName;
        if (!map.has(key)) map.set(key, { driverName: key, offset: e.offset, entries: [], customCount: 0 });
        const g = map.get(key)!; g.entries.push(e);
        if (e.symbol !== 'IopInvalidDeviceRequest') g.customCount++;
      });
      this.groups = Array.from(map.values()).sort((a, b) => b.customCount - a.customCount);
    } catch (e) { this.error = String(e); }
    this.isLoading = false; this.render(); this.bindEvents();
  }

  private render() {
    if (!this.container) return;
    if (this.isLoading) { this.container.innerHTML = `<div class="mod-loading"><div class="mod-spinner"></div><div>正在解析驱动IRP...</div></div>`; return; }
    if (this.error) { this.container.innerHTML = `<div class="svc-error">${esc(this.error)}</div>`; return; }
    if (!this.groups.length) { this.container.innerHTML = `<div class="svc-empty">暂无数据</div>`; return; }
    const customTotal = this.groups.reduce((s, g) => s + g.customCount, 0);
    const filtered = this.getFiltered();
    this.container.innerHTML = `
      <div class="mod-wrapper">
        <div style="padding:10px 16px;background:rgba(37,99,235,0.05);border:1px solid rgba(37,99,235,0.12);border-radius:8px;margin-bottom:10px">
          <div style="font-size:12px;color:#64748b">💡 IRP 分派表显示每个驱动注册的 I/O 请求处理函数。<strong style="color:#2563eb">${customTotal}</strong> 个自定义处理函数（非 IopInvalidDeviceRequest），按自定义数量排序。</div>
        </div>
        <div class="mod-stats-bar">
          <span class="mod-stat"><span class="mod-stat-v">${this.groups.length}</span> 驱动</span>
          <span class="mod-stat"><span class="mod-stat-v">${this.total.toLocaleString()}</span> IRP</span>
          <span class="mod-stat" style="color:#2563eb"><span class="mod-stat-v">${customTotal}</span> 自定义处理</span>
        </div>
        <div class="mod-toolbar">
          <input type="text" class="mod-search" id="v3irp-search" placeholder="搜索驱动名、IRP..." value="${esc(this.searchKeyword)}">
          <div class="mod-company-filters"><button class="mod-cbtn ${this.onlyCustom ? 'active' : ''}" id="v3irp-custom" style="color:#2563eb">仅看自定义处理</button></div>
        </div>
        <div class="mod-list" id="v3irp-list">${filtered.map(g => this.renderGroup(g)).join('') || '<div class="mod-empty">没有匹配</div>'}</div>
      </div>`;
  }

  private renderGroup(g: Vol3IrpGroup): string {
    const isExp = this.expandedDrivers.has(g.driverName);
    let entries = g.entries;
    if (this.onlyCustom) entries = entries.filter(e => e.symbol !== 'IopInvalidDeviceRequest');
    const kw = this.searchKeyword.toLowerCase();
    if (kw) entries = entries.filter(e => e.irp.toLowerCase().includes(kw) || e.symbol.toLowerCase().includes(kw));
    return `
      <div class="mod-process ${isExp ? 'expanded' : ''}" data-drv="${esc(g.driverName)}">
        <div class="mod-process-header">
          <span class="mod-arrow">${isExp ? '&#9660;' : '&#9654;'}</span>
          <span class="mod-pname" style="font-weight:600">${highlight(g.driverName, this.searchKeyword)}</span>
          <span class="mod-pcount">${g.customCount > 0 ? `<span style="color:#2563eb;font-weight:600">${g.customCount} 自定义</span> / ` : ''}${g.entries.length} IRP</span>
        </div>
        ${isExp ? `<div class="mod-detail"><table class="mod-table">
          <thead><tr><th style="min-width:200px">IRP</th><th style="width:130px">Address</th><th style="width:100px">Module</th><th>Symbol</th></tr></thead>
          <tbody>${entries.map(e => {
            const isCustom = e.symbol !== 'IopInvalidDeviceRequest';
            return `<tr class="mod-row" style="${isCustom ? 'background:rgba(37,99,235,0.04)' : ''}">
              <td style="font-size:11px;font-weight:${isCustom ? '500' : '400'}">${esc(e.irp)}</td>
              <td class="mod-cell-addr">${esc(e.address)}</td>
              <td style="color:${isCustom ? '#2563eb' : '#94a3b8'};font-size:11px">${esc(e.module)}</td>
              <td class="mod-cell-name" style="color:${isCustom ? 'var(--text-primary,#1e293b)' : '#94a3b8'}">${highlight(e.symbol, this.searchKeyword)}</td>
            </tr>`;}).join('')}</tbody></table></div>` : ''}
      </div>`;
  }

  private getFiltered() {
    const kw = this.searchKeyword.toLowerCase();
    return this.groups.filter(g => {
      if (this.onlyCustom && g.customCount === 0) return false;
      if (kw) { if (g.driverName.toLowerCase().includes(kw)) return true; return g.entries.some(e => e.irp.toLowerCase().includes(kw) || e.symbol.toLowerCase().includes(kw)); }
      return true;
    });
  }

  private bindEvents() {
    if (!this.container) return;
    const input = this.container.querySelector('#v3irp-search') as HTMLInputElement;
    if (input) { let t: number | null = null; input.addEventListener('input', () => { if (t) clearTimeout(t); t = window.setTimeout(() => { this.searchKeyword = input.value; this.render(); this.bindEvents(); const n = this.container?.querySelector('#v3irp-search') as HTMLInputElement; if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250); }); }
    this.container.querySelector('#v3irp-custom')?.addEventListener('click', () => { this.onlyCustom = !this.onlyCustom; this.render(); this.bindEvents(); });
    this.container.querySelector('#v3irp-list')?.addEventListener('click', e => {
      const h = (e.target as HTMLElement).closest('.mod-process-header'); if (!h) return;
      const p = h.closest('.mod-process') as HTMLElement; if (!p) return;
      const drv = p.getAttribute('data-drv') || '';
      if (this.expandedDrivers.has(drv)) this.expandedDrivers.delete(drv); else this.expandedDrivers.add(drv);
      this.render(); this.bindEvents();
    });
  }

  cleanup() { this.groups = []; this.total = 0; this.expandedDrivers.clear(); this.searchKeyword = ''; this.onlyCustom = false; this.error = null; }
}
