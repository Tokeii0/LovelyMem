/**
 * Vol3 内核模块视图 (modules)
 * 卡片网格：模块名、路径、基址、大小
 */

import { loadVol3Csv, esc, highlight } from './vol3CsvUtils';

interface Vol3Module {
  offset: string; base: string; size: string; sizeNum: number;
  name: string; path: string;
}

export class Vol3ModulesViewer {
  private container: HTMLElement | null = null;
  private data: Vol3Module[] = [];
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
      this.data = rows.slice(1).map(r => {
        const sizeHex = r[idx('Size')] || '0';
        const sizeNum = parseInt(sizeHex, 16) || parseInt(sizeHex, 10) || 0;
        return { offset: r[idx('Offset')] || '', base: r[idx('Base')] || '', size: sizeHex, sizeNum, name: r[idx('Name')] || '', path: r[idx('Path')] || '' };
      }).filter(m => m.name && m.name !== '-');
    } catch (e) { this.error = String(e); }
    this.isLoading = false; this.render(); this.bindEvents();
  }

  private render() {
    if (!this.container) return;
    if (this.isLoading) { this.container.innerHTML = `<div class="svc-loading"><div class="svc-spinner"></div><div>正在解析内核模块...</div></div>`; return; }
    if (this.error) { this.container.innerHTML = `<div class="svc-error">${esc(this.error)}</div>`; return; }
    if (!this.data.length) { this.container.innerHTML = `<div class="svc-empty">暂无数据</div>`; return; }

    const filtered = this.getFiltered();
    const totalSize = this.data.reduce((s, m) => s + m.sizeNum, 0);

    this.container.innerHTML = `
      <div class="svc-wrapper">
        <div class="svc-stats-bar">
          <span class="svc-stat"><span class="svc-stat-v">${this.data.length}</span> 模块</span>
          <span class="svc-stat"><span class="svc-stat-v">${this.fmtSize(totalSize)}</span> 总大小</span>
        </div>
        <div class="svc-toolbar">
          <input type="text" class="svc-search" id="v3mod-search" placeholder="搜索模块名、路径..." value="${esc(this.searchKeyword)}">
        </div>
        <div class="svc-count">显示 ${filtered.length} / ${this.data.length}</div>
        <div class="svc-grid" id="v3mod-grid">
          ${filtered.length === 0 ? '<div class="svc-empty">没有匹配</div>' : filtered.map((m, i) => `
            <div class="svc-card" data-idx="${i}" style="cursor:pointer">
              <div class="svc-card-header">
                <span class="svc-dot" style="background:#2563eb"></span>
                <span class="svc-card-name">${highlight(m.name, this.searchKeyword)}</span>
                <span class="svc-badge" style="color:#64748b;border-color:#64748b30;background:#64748b10">${this.fmtSize(m.sizeNum)}</span>
              </div>
              <div class="svc-card-desc" title="${esc(m.path)}">${highlight(m.path || '-', this.searchKeyword)}</div>
              <div class="svc-card-meta">
                <span class="svc-tag svc-tag-pid">Base: ${m.base}</span>
              </div>
            </div>`).join('')}
        </div>
      </div>`;
  }

  private showDetail(m: Vol3Module) {
    document.querySelectorAll('.svc-modal-overlay').forEach(e => e.remove());
    const ov = document.createElement('div'); ov.className = 'svc-modal-overlay';
    ov.innerHTML = `<div class="svc-modal"><div class="svc-modal-header"><span class="svc-modal-title">${esc(m.name)}</span><button class="svc-modal-close">&times;</button></div>
      <table class="svc-modal-table">
        <tr><td class="svc-modal-label">模块名</td><td>${esc(m.name)}</td></tr>
        <tr><td class="svc-modal-label">路径</td><td class="svc-modal-mono svc-modal-path">${esc(m.path || '-')}</td></tr>
        <tr><td class="svc-modal-label">Base</td><td class="svc-modal-mono">${esc(m.base)}</td></tr>
        <tr><td class="svc-modal-label">Size</td><td class="svc-modal-mono">${m.size} (${this.fmtSize(m.sizeNum)})</td></tr>
        <tr><td class="svc-modal-label">Offset</td><td class="svc-modal-mono">${esc(m.offset)}</td></tr>
      </table></div>`;
    ov.addEventListener('click', e => { if (e.target === ov || (e.target as HTMLElement).classList.contains('svc-modal-close')) ov.remove(); });
    document.addEventListener('keydown', function h(e) { if (e.key === 'Escape') { ov.remove(); document.removeEventListener('keydown', h); } });
    document.body.appendChild(ov);
  }

  private getFiltered() {
    const kw = this.searchKeyword.toLowerCase();
    if (!kw) return this.data;
    return this.data.filter(m => m.name.toLowerCase().includes(kw) || m.path.toLowerCase().includes(kw));
  }

  private fmtSize(b: number): string { if (b >= 1048576) return (b / 1048576).toFixed(1) + ' MB'; if (b >= 1024) return (b / 1024).toFixed(0) + ' KB'; return b + ' B'; }

  private bindEvents() {
    if (!this.container) return;
    const input = this.container.querySelector('#v3mod-search') as HTMLInputElement;
    if (input) { let t: number | null = null; input.addEventListener('input', () => { if (t) clearTimeout(t); t = window.setTimeout(() => { this.searchKeyword = input.value; this.render(); this.bindEvents(); const n = this.container?.querySelector('#v3mod-search') as HTMLInputElement; if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250); }); }
    this.container.querySelector('#v3mod-grid')?.addEventListener('click', e => {
      const card = (e.target as HTMLElement).closest('.svc-card') as HTMLElement;
      if (!card) return; const idx = parseInt(card.getAttribute('data-idx') || '-1', 10);
      const f = this.getFiltered(); if (idx >= 0 && idx < f.length) this.showDetail(f[idx]);
    });
  }

  cleanup() { this.data = []; this.searchKeyword = ''; this.error = null; document.querySelectorAll('.svc-modal-overlay').forEach(e => e.remove()); }
}

// modscan has identical structure, export alias
export class Vol3ModScanViewer extends Vol3ModulesViewer {}
