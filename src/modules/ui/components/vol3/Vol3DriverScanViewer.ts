/**
 * Vol3 驱动扫描视图 (driverscan)
 * 卡片网格，显示驱动名/服务键/基址/大小
 */
import { loadVol3Csv, esc, highlight } from './vol3CsvUtils';

interface Vol3Driver { offset: string; start: string; size: string; serviceKey: string; driverName: string; name: string; }

export class Vol3DriverScanViewer {
  private container: HTMLElement | null = null;
  private data: Vol3Driver[] = [];
  private isLoading = false;
  private error: string | null = null;
  private searchKeyword = '';

  init(containerId: string) { this.container = document.getElementById(containerId); }

  async load(fileName: string) {
    if (!this.container) return;
    this.isLoading = true; this.error = null; this.render();
    try {
      const rows = await loadVol3Csv(fileName);
      if (rows.length < 2) { this.data = []; this.isLoading = false; this.render(); this.bindEvents(); return; }
      const h = rows[0]; const idx = (n: string) => h.indexOf(n);
      this.data = rows.slice(1).map(r => ({
        offset: r[idx('Offset')] || '', start: r[idx('Start')] || '',
        size: r[idx('Size')] || '', serviceKey: r[idx('Service Key')] || '',
        driverName: r[idx('Driver Name')] || '', name: r[idx('Name')] || '',
      }));
    } catch (e) { this.error = String(e); }
    this.isLoading = false; this.render(); this.bindEvents();
  }

  private render() {
    if (!this.container) return;
    if (this.isLoading) { this.container.innerHTML = `<div class="svc-loading"><div class="svc-spinner"></div><div>正在解析驱动扫描...</div></div>`; return; }
    if (this.error) { this.container.innerHTML = `<div class="svc-error">${esc(this.error)}</div>`; return; }
    if (!this.data.length) { this.container.innerHTML = `<div class="svc-empty">暂无数据</div>`; return; }
    const filtered = this.getFiltered();
    this.container.innerHTML = `
      <div class="svc-wrapper">
        <div class="svc-stats-bar"><span class="svc-stat"><span class="svc-stat-v">${this.data.length}</span> 驱动</span></div>
        <div class="svc-toolbar"><input type="text" class="svc-search" id="v3drv-search" placeholder="搜索驱动名、服务键..." value="${esc(this.searchKeyword)}"></div>
        <div class="svc-grid" id="v3drv-grid">
          ${filtered.length === 0 ? '<div class="svc-empty">没有匹配</div>' : filtered.map((d, i) => `
            <div class="svc-card" data-idx="${i}" style="cursor:pointer">
              <div class="svc-card-header">
                <span class="svc-dot" style="background:#6366f1"></span>
                <span class="svc-card-name">${highlight(d.driverName, this.searchKeyword)}</span>
              </div>
              <div class="svc-card-desc" title="${esc(d.serviceKey)}">${highlight(d.serviceKey || '-', this.searchKeyword)}</div>
              <div class="svc-card-meta">
                <span class="svc-tag svc-tag-pid">Start: ${d.start}</span>
                <span class="svc-tag">${d.offset}</span>
              </div>
            </div>`).join('')}
        </div>
      </div>`;
  }

  private showDetail(d: Vol3Driver) {
    document.querySelectorAll('.svc-modal-overlay').forEach(e => e.remove());
    const ov = document.createElement('div'); ov.className = 'svc-modal-overlay';
    ov.innerHTML = `<div class="svc-modal"><div class="svc-modal-header"><span class="svc-modal-title">${esc(d.driverName)}</span><button class="svc-modal-close">&times;</button></div>
      <table class="svc-modal-table">
        <tr><td class="svc-modal-label">驱动名</td><td>${esc(d.driverName)}</td></tr>
        <tr><td class="svc-modal-label">名称</td><td>${esc(d.name)}</td></tr>
        <tr><td class="svc-modal-label">服务键</td><td class="svc-modal-mono svc-modal-path">${esc(d.serviceKey)}</td></tr>
        <tr><td class="svc-modal-label">Start</td><td class="svc-modal-mono">${esc(d.start)}</td></tr>
        <tr><td class="svc-modal-label">Size</td><td class="svc-modal-mono">${esc(d.size)}</td></tr>
        <tr><td class="svc-modal-label">Offset</td><td class="svc-modal-mono">${esc(d.offset)}</td></tr>
      </table></div>`;
    ov.addEventListener('click', e => { if (e.target === ov || (e.target as HTMLElement).classList.contains('svc-modal-close')) ov.remove(); });
    document.addEventListener('keydown', function h(e) { if (e.key === 'Escape') { ov.remove(); document.removeEventListener('keydown', h); } });
    document.body.appendChild(ov);
  }

  private getFiltered() {
    const kw = this.searchKeyword.toLowerCase();
    if (!kw) return this.data;
    return this.data.filter(d => d.driverName.toLowerCase().includes(kw) || d.serviceKey.toLowerCase().includes(kw) || d.name.toLowerCase().includes(kw));
  }

  private bindEvents() {
    if (!this.container) return;
    const input = this.container.querySelector('#v3drv-search') as HTMLInputElement;
    if (input) { let t: number | null = null; input.addEventListener('input', () => { if (t) clearTimeout(t); t = window.setTimeout(() => { this.searchKeyword = input.value; this.render(); this.bindEvents(); const n = this.container?.querySelector('#v3drv-search') as HTMLInputElement; if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250); }); }
    this.container.querySelector('#v3drv-grid')?.addEventListener('click', e => {
      const card = (e.target as HTMLElement).closest('.svc-card') as HTMLElement; if (!card) return;
      const idx = parseInt(card.getAttribute('data-idx') || '-1', 10);
      const f = this.getFiltered(); if (idx >= 0 && idx < f.length) this.showDetail(f[idx]);
    });
  }

  cleanup() { this.data = []; this.searchKeyword = ''; this.error = null; document.querySelectorAll('.svc-modal-overlay').forEach(e => e.remove()); }
}
