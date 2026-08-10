/**
 * Vol3 定时器视图 (timers)
 * 卡片网格，关注第三方模块的定时器
 */
import { loadVol3Csv, esc, highlight } from './vol3CsvUtils';

interface Vol3Timer { offset: string; dueTime: string; period: string; signaled: string; routine: string; module: string; symbol: string; }

export class Vol3TimersViewer {
  private container: HTMLElement | null = null;
  private data: Vol3Timer[] = [];
  private isLoading = false;
  private error: string | null = null;
  private searchKeyword = '';
  private onlyThirdParty = false;

  init(containerId: string) { this.container = document.getElementById(containerId); }

  async load(fileName: string) {
    if (!this.container) return;
    this.isLoading = true; this.error = null; this.render();
    try {
      const rows = await loadVol3Csv(fileName);
      if (rows.length < 2) { this.data = []; this.isLoading = false; this.render(); this.bindEvents(); return; }
      const h = rows[0]; const idx = (n: string) => h.indexOf(n);
      this.data = rows.slice(1).map(r => ({
        offset: r[idx('Offset')] || '', dueTime: r[idx('DueTime')] || '',
        period: r[idx('Period(ms)')] || '', signaled: r[idx('Signaled')] || '',
        routine: r[idx('Routine')] || '', module: r[idx('Module')] || '', symbol: r[idx('Symbol')] || '',
      }));
    } catch (e) { this.error = String(e); }
    this.isLoading = false; this.render(); this.bindEvents();
  }

  private render() {
    if (!this.container) return;
    if (this.isLoading) { this.container.innerHTML = `<div class="svc-loading"><div class="svc-spinner"></div><div>正在解析定时器...</div></div>`; return; }
    if (this.error) { this.container.innerHTML = `<div class="svc-error">${esc(this.error)}</div>`; return; }
    if (!this.data.length) { this.container.innerHTML = `<div class="svc-empty">暂无数据</div>`; return; }
    const sysModules = new Set(['ntoskrnl', 'hal', 'ndis', 'tcpip', 'netbt', 'fltMgr']);
    const thirdParty = this.data.filter(t => !sysModules.has(t.module));
    const periodic = this.data.filter(t => parseInt(t.period) > 0);
    const filtered = this.getFiltered();
    this.container.innerHTML = `
      <div class="svc-wrapper">
        ${thirdParty.length > 0 ? `<div style="padding:10px 16px;background:rgba(217,119,6,0.06);border:1px solid rgba(217,119,6,0.15);border-radius:8px;margin-bottom:10px">
          <div style="font-size:12px;color:#64748b">⚠ 发现 <strong style="color:#d97706">${thirdParty.length}</strong> 个第三方模块定时器（非系统核心模块），来自：${[...new Set(thirdParty.map(t => t.module))].map(m => `<strong style="color:#d97706">${esc(m)}</strong>`).join('、')}</div>
        </div>` : ''}
        <div class="svc-stats-bar">
          <span class="svc-stat"><span class="svc-stat-v">${this.data.length}</span> 定时器</span>
          <span class="svc-stat"><span class="svc-stat-v">${periodic.length}</span> 周期性</span>
          <span class="svc-stat" style="color:#d97706"><span class="svc-stat-v">${thirdParty.length}</span> 第三方</span>
        </div>
        <div class="svc-toolbar">
          <input type="text" class="svc-search" id="v3tmr-search" placeholder="搜索模块、符号..." value="${esc(this.searchKeyword)}">
          ${thirdParty.length > 0 ? `<div class="svc-filters"><button class="svc-fbtn ${this.onlyThirdParty ? 'active' : ''}" id="v3tmr-tp" style="color:#d97706">仅第三方</button></div>` : ''}
        </div>
        <div class="svc-grid" id="v3tmr-grid">
          ${filtered.map(t => {
            const isTP = !sysModules.has(t.module);
            const isPeriodic = parseInt(t.period) > 0;
            return `<div class="svc-card ${isTP ? 'svc-card-running' : ''}">
              <div class="svc-card-header">
                <span class="svc-dot" style="background:${isTP ? '#d97706' : '#64748b'}"></span>
                <span class="svc-card-name">${highlight(t.symbol || '-', this.searchKeyword)}</span>
                ${isPeriodic ? `<span class="svc-badge" style="color:#2563eb;border-color:#2563eb30;background:#2563eb10">${t.period}ms</span>` : ''}
              </div>
              <div class="svc-card-desc">${highlight(t.module, this.searchKeyword)}</div>
              <div class="svc-card-meta">
                <span class="svc-tag">Routine: ${t.routine}</span>
                <span class="svc-tag">${t.dueTime}</span>
              </div>
            </div>`;
          }).join('') || '<div class="svc-empty">没有匹配</div>'}
        </div>
      </div>`;
  }

  private getFiltered() {
    const kw = this.searchKeyword.toLowerCase();
    const sysModules = new Set(['ntoskrnl', 'hal', 'ndis', 'tcpip', 'netbt', 'fltMgr']);
    return this.data.filter(t => {
      if (this.onlyThirdParty && sysModules.has(t.module)) return false;
      if (kw) return t.module.toLowerCase().includes(kw) || t.symbol.toLowerCase().includes(kw);
      return true;
    });
  }

  private bindEvents() {
    if (!this.container) return;
    const input = this.container.querySelector('#v3tmr-search') as HTMLInputElement;
    if (input) { let t: number | null = null; input.addEventListener('input', () => { if (t) clearTimeout(t); t = window.setTimeout(() => { this.searchKeyword = input.value; this.render(); this.bindEvents(); const n = this.container?.querySelector('#v3tmr-search') as HTMLInputElement; if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250); }); }
    this.container.querySelector('#v3tmr-tp')?.addEventListener('click', () => { this.onlyThirdParty = !this.onlyThirdParty; this.render(); this.bindEvents(); });
  }

  cleanup() { this.data = []; this.searchKeyword = ''; this.onlyThirdParty = false; this.error = null; }
}
