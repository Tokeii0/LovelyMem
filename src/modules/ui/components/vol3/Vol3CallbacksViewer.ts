/**
 * Vol3 回调函数视图 (callbacks)
 * 卡片网格，按 Type 分组，第三方模块高亮
 */
import { loadVol3Csv, esc, highlight } from './vol3CsvUtils';

interface Vol3Callback { type: string; callback: string; module: string; symbol: string; detail: string; }

export class Vol3CallbacksViewer {
  private container: HTMLElement | null = null;
  private data: Vol3Callback[] = [];
  private typeDist: Record<string, number> = {};
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
        type: r[idx('Type')] || '', callback: r[idx('Callback')] || '',
        module: r[idx('Module')] || '', symbol: r[idx('Symbol')] || '', detail: r[idx('Detail')] || '',
      }));
      this.typeDist = {};
      this.data.forEach(c => { if (c.type) this.typeDist[c.type] = (this.typeDist[c.type] || 0) + 1; });
    } catch (e) { this.error = String(e); }
    this.isLoading = false; this.render(); this.bindEvents();
  }

  private render() {
    if (!this.container) return;
    if (this.isLoading) { this.container.innerHTML = `<div class="svc-loading"><div class="svc-spinner"></div><div>正在解析回调函数...</div></div>`; return; }
    if (this.error) { this.container.innerHTML = `<div class="svc-error">${esc(this.error)}</div>`; return; }
    if (!this.data.length) { this.container.innerHTML = `<div class="svc-empty">暂无数据</div>`; return; }
    const topTypes = Object.entries(this.typeDist).sort((a, b) => b[1] - a[1]);
    const filtered = this.getFiltered();
    const nonNt = this.data.filter(c => c.module !== 'ntoskrnl').length;
    this.container.innerHTML = `
      <div class="svc-wrapper">
        <div class="svc-stats-bar">
          <span class="svc-stat"><span class="svc-stat-v">${this.data.length}</span> 回调</span>
          <span class="svc-stat"><span class="svc-stat-v">${topTypes.length}</span> 类型</span>
          ${nonNt > 0 ? `<span class="svc-stat" style="color:#d97706"><span class="svc-stat-v">${nonNt}</span> 非ntoskrnl</span>` : ''}
        </div>
        <div class="svc-toolbar">
          <input type="text" class="svc-search" id="v3cb-search" placeholder="搜索模块、符号..." value="${esc(this.searchKeyword)}">
          <div class="svc-filters">
            <button class="svc-fbtn ${this.typeFilter === '' ? 'active' : ''}" data-cbt="">全部</button>
            ${topTypes.map(([t, c]) => `<button class="svc-fbtn ${this.typeFilter === t ? 'active' : ''}" data-cbt="${esc(t)}">${t.replace(/Routine$/,'').replace(/^Psp/,'').replace(/^Cmp/,'')} (${c})</button>`).join('')}
          </div>
        </div>
        <div class="svc-grid" id="v3cb-grid">
          ${filtered.length === 0 ? '<div class="svc-empty">没有匹配</div>' : filtered.map((c) => {
            const tp = c.module !== 'ntoskrnl';
            return `<div class="svc-card ${tp ? 'svc-card-running' : ''}">
              <div class="svc-card-header">
                <span class="svc-badge" style="color:#6366f1;border-color:#6366f130;background:#6366f110">${esc(c.type.replace(/Routine$/,'').replace(/^Psp/,'').replace(/^Cmp/,''))}</span>
                ${tp ? '<span class="mod-wow64" style="background:#d97706">第三方</span>' : ''}
              </div>
              <div class="svc-card-desc" style="font-weight:600">${highlight(c.symbol || '-', this.searchKeyword)}</div>
              <div class="svc-card-meta">
                <span class="svc-tag svc-tag-pid">${highlight(c.module, this.searchKeyword)}</span>
                <span class="svc-tag">${c.callback}</span>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>`;
  }

  private getFiltered() {
    const kw = this.searchKeyword.toLowerCase();
    return this.data.filter(c => {
      if (this.typeFilter && c.type !== this.typeFilter) return false;
      if (kw) return c.module.toLowerCase().includes(kw) || c.symbol.toLowerCase().includes(kw) || c.type.toLowerCase().includes(kw);
      return true;
    });
  }

  private bindEvents() {
    if (!this.container) return;
    const input = this.container.querySelector('#v3cb-search') as HTMLInputElement;
    if (input) { let t: number | null = null; input.addEventListener('input', () => { if (t) clearTimeout(t); t = window.setTimeout(() => { this.searchKeyword = input.value; this.render(); this.bindEvents(); const n = this.container?.querySelector('#v3cb-search') as HTMLInputElement; if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250); }); }
    this.container.querySelectorAll('[data-cbt]').forEach(b => b.addEventListener('click', () => { this.typeFilter = b.getAttribute('data-cbt') || ''; this.render(); this.bindEvents(); }));
  }

  cleanup() { this.data = []; this.typeDist = {}; this.searchKeyword = ''; this.typeFilter = ''; this.error = null; }
}
