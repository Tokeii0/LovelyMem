/**
 * Vol3 设备树视图 (devicetree)
 * 利用 TreeDepth 构建真实树结构：DRV → DEV → ATT
 * Type 色标: DRV=紫色, DEV=蓝色, ATT=绿色
 */
import { loadVol3Csv, esc, highlight } from './vol3CsvUtils';

interface Vol3DevNode {
  depth: number; offset: string; type: string; driverName: string;
  deviceName: string; driverNameOfAtt: string; deviceType: string;
}

const TYPE_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  'DRV': { color: '#7c3aed', bg: 'rgba(124,58,237,0.08)', label: '驱动' },
  'DEV': { color: '#2563eb', bg: 'rgba(37,99,235,0.08)', label: '设备' },
  'ATT': { color: '#16a34a', bg: 'rgba(22,163,106,0.08)', label: '附加' },
};

export class Vol3DeviceTreeViewer {
  private container: HTMLElement | null = null;
  private data: Vol3DevNode[] = [];
  private isLoading = false;
  private error: string | null = null;
  private searchKeyword = '';
  private typeFilter = '';

  init(containerId: string) { this.container = document.getElementById(containerId); }

  async load(fileName: string) {
    if (!this.container) return;
    this.isLoading = true; this.error = null; this.render();
    try {
      const rows = await loadVol3Csv(fileName);
      if (rows.length < 2) { this.data = []; this.isLoading = false; this.render(); this.bindEvents(); return; }
      const h = rows[0]; const idx = (n: string) => h.indexOf(n);
      this.data = rows.slice(1).map(r => ({
        depth: parseInt(r[idx('TreeDepth')] || '0', 10),
        offset: r[idx('Offset')] || '', type: r[idx('Type')] || '',
        driverName: r[idx('DriverName')] || '', deviceName: r[idx('DeviceName')] || '',
        driverNameOfAtt: r[idx('DriverNameOfAttDevice')] || '', deviceType: r[idx('DeviceType')] || '',
      }));
    } catch (e) { this.error = String(e); }
    this.isLoading = false; this.render(); this.bindEvents();
  }

  private render() {
    if (!this.container) return;
    if (this.isLoading) { this.container.innerHTML = `<div class="mod-loading"><div class="mod-spinner"></div><div>正在解析设备树...</div></div>`; return; }
    if (this.error) { this.container.innerHTML = `<div class="svc-error">${esc(this.error)}</div>`; return; }
    if (!this.data.length) { this.container.innerHTML = `<div class="svc-empty">暂无数据</div>`; return; }

    const typeCounts: Record<string, number> = {};
    this.data.forEach(n => { typeCounts[n.type] = (typeCounts[n.type] || 0) + 1; });
    const drivers = typeCounts['DRV'] || 0;
    const devices = typeCounts['DEV'] || 0;
    const attached = typeCounts['ATT'] || 0;
    const filtered = this.getFiltered();

    this.container.innerHTML = `
      <div class="mod-wrapper">
        <div style="padding:10px 16px;background:rgba(124,58,237,0.05);border:1px solid rgba(124,58,237,0.12);border-radius:8px;margin-bottom:10px">
          <div style="font-size:12px;color:#64748b">🌳 设备树展示驱动(DRV)、设备(DEV)、附加设备(ATT)的层级关系。附加设备通常是过滤驱动，如杀毒软件文件系统过滤。</div>
        </div>
        <div class="mod-stats-bar">
          <span class="mod-stat" style="color:#7c3aed"><span class="mod-stat-v">${drivers}</span> 驱动</span>
          <span class="mod-stat" style="color:#2563eb"><span class="mod-stat-v">${devices}</span> 设备</span>
          <span class="mod-stat" style="color:#16a34a"><span class="mod-stat-v">${attached}</span> 附加</span>
        </div>
        <div class="mod-toolbar">
          <input type="text" class="mod-search" id="v3dt-search" placeholder="搜索驱动名、设备名..." value="${esc(this.searchKeyword)}">
          <div class="mod-company-filters">
            <button class="mod-cbtn ${this.typeFilter === '' ? 'active' : ''}" data-dtt="">全部</button>
            ${Object.entries(TYPE_STYLE).map(([t, s]) => `<button class="mod-cbtn ${this.typeFilter === t ? 'active' : ''}" data-dtt="${t}" style="color:${s.color}">${s.label} (${typeCounts[t] || 0})</button>`).join('')}
          </div>
        </div>
        <div class="proc-tree-content" id="v3dt-tree" style="padding:8px;overflow:auto;flex:1;min-height:0">
          ${filtered.map(n => this.renderNode(n)).join('') || '<div class="mod-empty">没有匹配</div>'}
        </div>
      </div>`;
  }

  private renderNode(n: Vol3DevNode): string {
    const s = TYPE_STYLE[n.type] || { color: '#64748b', bg: 'rgba(100,116,139,0.08)', label: n.type };
    const indent = n.depth * 24;
    const name = n.type === 'DRV' ? n.driverName : n.deviceName;
    const connector = n.depth > 0 ? `<span style="color:#cbd5e1;margin-right:6px">${n.depth > 1 ? '└─' : '├─'}</span>` : '';
    return `
      <div class="proc-tree-row" style="padding-left:${indent + 12}px;display:flex;align-items:center;gap:6px;padding-top:4px;padding-bottom:4px;border-bottom:1px solid var(--border-color,#f1f5f9)">
        ${connector}
        <span style="display:inline-flex;align-items:center;justify-content:center;width:36px;height:18px;border-radius:4px;background:${s.bg};color:${s.color};font-size:10px;font-weight:700;flex-shrink:0">${n.type}</span>
        <span style="font-weight:500;font-size:12px;color:var(--text-primary,#1e293b)">${highlight(name || 'N/A', this.searchKeyword)}</span>
        ${n.deviceType && n.deviceType !== 'N/A' ? `<span style="margin-left:auto;font-size:10px;color:#94a3b8;white-space:nowrap">${esc(n.deviceType)}</span>` : ''}
        ${n.driverNameOfAtt && n.driverNameOfAtt !== 'N/A' ? `<span style="font-size:10px;color:#16a34a">→ ${esc(n.driverNameOfAtt)}</span>` : ''}
      </div>`;
  }

  private getFiltered() {
    const kw = this.searchKeyword.toLowerCase();
    return this.data.filter(n => {
      if (this.typeFilter && n.type !== this.typeFilter) return false;
      if (kw) return n.driverName.toLowerCase().includes(kw) || n.deviceName.toLowerCase().includes(kw) || n.deviceType.toLowerCase().includes(kw);
      return true;
    });
  }

  private bindEvents() {
    if (!this.container) return;
    const input = this.container.querySelector('#v3dt-search') as HTMLInputElement;
    if (input) { let t: number | null = null; input.addEventListener('input', () => { if (t) clearTimeout(t); t = window.setTimeout(() => { this.searchKeyword = input.value; this.render(); this.bindEvents(); const n = this.container?.querySelector('#v3dt-search') as HTMLInputElement; if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250); }); }
    this.container.querySelectorAll('[data-dtt]').forEach(b => b.addEventListener('click', () => { this.typeFilter = b.getAttribute('data-dtt') || ''; this.render(); this.bindEvents(); }));
  }

  cleanup() { this.data = []; this.searchKeyword = ''; this.typeFilter = ''; this.error = null; }
}
