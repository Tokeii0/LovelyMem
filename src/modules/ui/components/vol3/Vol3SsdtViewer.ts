/**
 * Vol3 SSDT 视图 — 安全分析重点
 * 非 ntoskrnl 的条目 = 疑似被 Hook，红色高亮 + 统计面板
 */
import { loadVol3Csv, esc, highlight } from './vol3CsvUtils';

interface Vol3SsdtEntry { index: number; address: string; module: string; symbol: string; }

export class Vol3SsdtViewer {
  private container: HTMLElement | null = null;
  private data: Vol3SsdtEntry[] = [];
  private isLoading = false;
  private error: string | null = null;
  private searchKeyword = '';
  private onlyHooked = false;

  init(containerId: string) { this.container = document.getElementById(containerId); }

  async load(fileName: string) {
    if (!this.container) return;
    this.isLoading = true; this.error = null; this.render();
    try {
      const rows = await loadVol3Csv(fileName);
      if (rows.length < 2) { this.data = []; this.isLoading = false; this.render(); this.bindEvents(); return; }
      const h = rows[0]; const idx = (n: string) => h.indexOf(n);
      this.data = rows.slice(1).map(r => ({
        index: parseInt(r[idx('Index')] || '0', 10), address: r[idx('Address')] || '',
        module: r[idx('Module')] || '', symbol: r[idx('Symbol')] || '',
      }));
    } catch (e) { this.error = String(e); }
    this.isLoading = false; this.render(); this.bindEvents();
  }

  private render() {
    if (!this.container) return;
    if (this.isLoading) { this.container.innerHTML = `<div class="mod-loading"><div class="mod-spinner"></div><div>正在解析SSDT...</div></div>`; return; }
    if (this.error) { this.container.innerHTML = `<div class="svc-error">${esc(this.error)}</div>`; return; }
    if (!this.data.length) { this.container.innerHTML = `<div class="svc-empty">暂无数据</div>`; return; }

    const hooked = this.data.filter(e => e.module !== 'ntoskrnl');
    const filtered = this.getFiltered();
    const hookedMods = [...new Set(hooked.map(h => h.module))];

    // 安全分析摘要面板
    const summaryHtml = hooked.length > 0
      ? `<div style="padding:12px 16px;background:rgba(220,38,38,0.06);border:1px solid rgba(220,38,38,0.15);border-radius:8px;margin-bottom:12px">
          <div style="font-weight:600;color:#dc2626;font-size:13px;margin-bottom:6px">⚠ 发现 ${hooked.length} 个疑似 SSDT Hook</div>
          <div style="font-size:12px;color:#64748b">涉及模块：${hookedMods.map(m => `<span style="color:#dc2626;font-weight:600">${esc(m)}</span>`).join('、')}</div>
          <div style="font-size:11px;color:#94a3b8;margin-top:4px">正常情况下所有系统调用都应指向 ntoskrnl，第三方模块拦截可能是安全软件或 rootkit</div>
        </div>`
      : `<div style="padding:12px 16px;background:rgba(22,163,106,0.06);border:1px solid rgba(22,163,106,0.15);border-radius:8px;margin-bottom:12px">
          <div style="font-weight:600;color:#16a34a;font-size:13px">✓ SSDT 完整性正常</div>
          <div style="font-size:12px;color:#64748b">所有 ${this.data.length} 个系统调用均指向 ntoskrnl，未发现 Hook</div>
        </div>`;

    this.container.innerHTML = `
      <div class="mod-wrapper">
        ${summaryHtml}
        <div class="mod-stats-bar">
          <span class="mod-stat"><span class="mod-stat-v">${this.data.length}</span> 系统调用</span>
          ${hooked.length > 0 ? `<span class="mod-stat" style="color:#dc2626"><span class="mod-stat-v">${hooked.length}</span> ⚠ 被Hook</span>` : ''}
        </div>
        <div class="mod-toolbar">
          <input type="text" class="mod-search" id="v3ssdt-search" placeholder="搜索Nt*系统调用、模块..." value="${esc(this.searchKeyword)}">
          ${hooked.length > 0 ? `<div class="mod-company-filters"><button class="mod-cbtn ${this.onlyHooked ? 'active' : ''}" id="v3ssdt-hooked" style="color:#dc2626">⚠ 仅看Hook (${hooked.length})</button></div>` : ''}
        </div>
        <div class="mod-detail"><table class="mod-table">
          <thead><tr><th style="width:60px">#</th><th style="width:140px">Address</th><th style="width:120px">Module</th><th>Symbol</th></tr></thead>
          <tbody>${filtered.map(e => {
            const h = e.module !== 'ntoskrnl';
            return `<tr class="mod-row" style="${h ? 'background:rgba(220,38,38,0.06)' : ''}">
              <td class="mod-cell-addr">${e.index}</td><td class="mod-cell-addr">${esc(e.address)}</td>
              <td style="font-weight:${h ? '600' : '400'};color:${h ? '#dc2626' : 'var(--text-secondary,#64748b)'}">${highlight(e.module, this.searchKeyword)}</td>
              <td class="mod-cell-name">${highlight(e.symbol, this.searchKeyword)}</td>
            </tr>`;
          }).join('')}</tbody></table></div>
      </div>`;
  }

  private getFiltered() {
    const kw = this.searchKeyword.toLowerCase();
    return this.data.filter(e => {
      if (this.onlyHooked && e.module === 'ntoskrnl') return false;
      if (kw) return e.symbol.toLowerCase().includes(kw) || e.module.toLowerCase().includes(kw);
      return true;
    });
  }

  private bindEvents() {
    if (!this.container) return;
    const input = this.container.querySelector('#v3ssdt-search') as HTMLInputElement;
    if (input) { let t: number | null = null; input.addEventListener('input', () => { if (t) clearTimeout(t); t = window.setTimeout(() => { this.searchKeyword = input.value; this.render(); this.bindEvents(); const n = this.container?.querySelector('#v3ssdt-search') as HTMLInputElement; if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250); }); }
    this.container.querySelector('#v3ssdt-hooked')?.addEventListener('click', () => { this.onlyHooked = !this.onlyHooked; this.render(); this.bindEvents(); });
  }

  cleanup() { this.data = []; this.searchKeyword = ''; this.onlyHooked = false; this.error = null; }
}
