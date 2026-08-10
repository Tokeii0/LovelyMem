/**
 * Vol3 网络状态/扫描视图 (netstat / netscan)
 * 卡片网格: Proto色标, State色标, 源→目标地址, 关联进程
 */

import { loadVol3Csv, esc, highlight } from './vol3CsvUtils';

interface Vol3NetConn {
  offset: string; proto: string; localAddr: string; localPort: string;
  foreignAddr: string; foreignPort: string; state: string;
  pid: number; owner: string; created: string;
}

const PROTO_COLORS: Record<string, string> = { 'TCPv4': '#2563eb', 'TCPv6': '#7c3aed', 'UDPv4': '#16a34a', 'UDPv6': '#0d9488' };
const STATE_COLORS: Record<string, string> = { 'LISTENING': '#2563eb', 'ESTABLISHED': '#16a34a', 'CLOSE_WAIT': '#d97706', 'TIME_WAIT': '#94a3b8', 'CLOSED': '#64748b', 'SYN_SENT': '#ea580c', 'FIN_WAIT1': '#dc2626', 'FIN_WAIT2': '#dc2626' };

export class Vol3NetStatViewer {
  private container: HTMLElement | null = null;
  private data: Vol3NetConn[] = [];
  private isLoading = false;
  private error: string | null = null;
  private searchKeyword = '';
  private protoFilter = '';
  private stateFilter = '';

  init(containerId: string) { this.container = document.getElementById(containerId); }

  async load(fileName: string) {
    if (!this.container) return;
    this.isLoading = true; this.error = null; this.render();
    try {
      const rows = await loadVol3Csv(fileName);
      if (rows.length < 2) { this.data = []; this.isLoading = false; this.render(); this.bindEvents(); return; }
      const h = rows[0]; const idx = (n: string) => h.indexOf(n);
      this.data = rows.slice(1).map(r => ({
        offset: r[idx('Offset')] || '', proto: r[idx('Proto')] || '',
        localAddr: r[idx('LocalAddr')] || '', localPort: r[idx('LocalPort')] || '',
        foreignAddr: r[idx('ForeignAddr')] || '', foreignPort: r[idx('ForeignPort')] || '',
        state: r[idx('State')] || '', pid: parseInt(r[idx('PID')] || '0', 10),
        owner: r[idx('Owner')] || '', created: r[idx('Created')] || '',
      }));
    } catch (e) { this.error = String(e); }
    this.isLoading = false; this.render(); this.bindEvents();
  }

  private render() {
    if (!this.container) return;
    if (this.isLoading) { this.container.innerHTML = `<div class="svc-loading"><div class="svc-spinner"></div><div>正在解析网络连接...</div></div>`; return; }
    if (this.error) { this.container.innerHTML = `<div class="svc-error">${esc(this.error)}</div>`; return; }
    if (!this.data.length) { this.container.innerHTML = `<div class="svc-empty">暂无数据</div>`; return; }

    const protos = [...new Set(this.data.map(d => d.proto))].filter(Boolean);
    const states = [...new Set(this.data.map(d => d.state))].filter(Boolean);
    const filtered = this.getFiltered();

    this.container.innerHTML = `
      <div class="svc-wrapper">
        <div class="svc-stats-bar">
          <span class="svc-stat"><span class="svc-stat-v">${this.data.length}</span> 连接</span>
          ${protos.map(p => `<span class="svc-stat" style="color:${PROTO_COLORS[p] || '#64748b'}"><span class="svc-stat-v">${this.data.filter(d => d.proto === p).length}</span> ${p}</span>`).join('')}
        </div>
        <div class="svc-toolbar">
          <input type="text" class="svc-search" id="v3net-search" placeholder="搜索地址、端口、进程..." value="${esc(this.searchKeyword)}">
          <div class="svc-filters">
            <button class="svc-fbtn ${this.protoFilter === '' ? 'active' : ''}" data-proto="">全部协议</button>
            ${protos.map(p => `<button class="svc-fbtn ${this.protoFilter === p ? 'active' : ''}" data-proto="${p}" style="color:${PROTO_COLORS[p] || '#64748b'}">${p}</button>`).join('')}
          </div>
          ${states.length > 0 ? `<div class="svc-filters">
            <button class="svc-fbtn ${this.stateFilter === '' ? 'active' : ''}" data-state="">全部状态</button>
            ${states.map(s => `<button class="svc-fbtn ${this.stateFilter === s ? 'active' : ''}" data-state="${s}" style="color:${STATE_COLORS[s] || '#64748b'}">${s}</button>`).join('')}
          </div>` : ''}
        </div>
        <div class="svc-count">显示 ${filtered.length} / ${this.data.length}</div>
        <div class="svc-grid" id="v3net-grid">
          ${filtered.length === 0 ? '<div class="svc-empty">没有匹配</div>' : filtered.map((c, i) => this.renderCard(c, i)).join('')}
        </div>
      </div>`;
  }

  private renderCard(c: Vol3NetConn, idx: number): string {
    const pColor = PROTO_COLORS[c.proto] || '#64748b';
    const sColor = STATE_COLORS[c.state] || '#94a3b8';
    return `
      <div class="svc-card" data-idx="${idx}" style="cursor:pointer">
        <div class="svc-card-header">
          <span class="svc-badge" style="color:${pColor};border-color:${pColor}30;background:${pColor}10">${c.proto}</span>
          ${c.state ? `<span class="svc-badge" style="color:${sColor};border-color:${sColor}30;background:${sColor}10">${c.state}</span>` : ''}
          <span style="margin-left:auto;font-size:11px;color:#94a3b8">PID ${c.pid}</span>
        </div>
        <div class="svc-card-desc" style="font-family:monospace;font-size:11px">
          ${esc(c.localAddr)}:${esc(c.localPort)} → ${esc(c.foreignAddr)}:${esc(c.foreignPort)}
        </div>
        <div class="svc-card-meta">
          <span class="svc-tag svc-tag-pid">${highlight(c.owner, this.searchKeyword)}</span>
          ${c.created && c.created !== '-' ? `<span class="svc-tag">${c.created}</span>` : ''}
        </div>
      </div>`;
  }

  private showDetail(c: Vol3NetConn) {
    document.querySelectorAll('.svc-modal-overlay').forEach(e => e.remove());
    const ov = document.createElement('div'); ov.className = 'svc-modal-overlay';
    ov.innerHTML = `<div class="svc-modal"><div class="svc-modal-header"><span class="svc-modal-title">网络连接详情</span><button class="svc-modal-close">&times;</button></div>
      <table class="svc-modal-table">
        <tr><td class="svc-modal-label">协议</td><td>${esc(c.proto)}</td></tr>
        <tr><td class="svc-modal-label">状态</td><td>${esc(c.state || '-')}</td></tr>
        <tr><td class="svc-modal-label">本地地址</td><td class="svc-modal-mono">${esc(c.localAddr)}:${esc(c.localPort)}</td></tr>
        <tr><td class="svc-modal-label">远程地址</td><td class="svc-modal-mono">${esc(c.foreignAddr)}:${esc(c.foreignPort)}</td></tr>
        <tr><td class="svc-modal-label">PID</td><td class="svc-modal-mono">${c.pid}</td></tr>
        <tr><td class="svc-modal-label">进程</td><td>${esc(c.owner)}</td></tr>
        <tr><td class="svc-modal-label">偏移量</td><td class="svc-modal-mono">${esc(c.offset)}</td></tr>
        <tr><td class="svc-modal-label">创建时间</td><td>${esc(c.created || '-')}</td></tr>
      </table></div>`;
    ov.addEventListener('click', e => { if (e.target === ov || (e.target as HTMLElement).classList.contains('svc-modal-close')) ov.remove(); });
    document.addEventListener('keydown', function h(e) { if (e.key === 'Escape') { ov.remove(); document.removeEventListener('keydown', h); } });
    document.body.appendChild(ov);
  }

  private getFiltered() {
    const kw = this.searchKeyword.toLowerCase();
    return this.data.filter(c => {
      if (this.protoFilter && c.proto !== this.protoFilter) return false;
      if (this.stateFilter && c.state !== this.stateFilter) return false;
      if (kw) return c.localAddr.includes(kw) || c.foreignAddr.includes(kw) || c.localPort.includes(kw) || c.foreignPort.includes(kw) || c.owner.toLowerCase().includes(kw) || c.pid.toString().includes(kw);
      return true;
    });
  }

  private bindEvents() {
    if (!this.container) return;
    const input = this.container.querySelector('#v3net-search') as HTMLInputElement;
    if (input) { let t: number | null = null; input.addEventListener('input', () => { if (t) clearTimeout(t); t = window.setTimeout(() => { this.searchKeyword = input.value; this.render(); this.bindEvents(); const n = this.container?.querySelector('#v3net-search') as HTMLInputElement; if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250); }); }
    this.container.querySelectorAll('[data-proto]').forEach(b => b.addEventListener('click', () => { this.protoFilter = b.getAttribute('data-proto') || ''; this.render(); this.bindEvents(); }));
    this.container.querySelectorAll('[data-state]').forEach(b => b.addEventListener('click', () => { this.stateFilter = b.getAttribute('data-state') || ''; this.render(); this.bindEvents(); }));
    this.container.querySelector('#v3net-grid')?.addEventListener('click', e => {
      const card = (e.target as HTMLElement).closest('.svc-card') as HTMLElement; if (!card) return;
      const idx = parseInt(card.getAttribute('data-idx') || '-1', 10);
      const f = this.getFiltered(); if (idx >= 0 && idx < f.length) this.showDetail(f[idx]);
    });
  }

  cleanup() { this.data = []; this.searchKeyword = ''; this.protoFilter = ''; this.stateFilter = ''; this.error = null; document.querySelectorAll('.svc-modal-overlay').forEach(e => e.remove()); }
}

export class Vol3NetScanViewer extends Vol3NetStatViewer {}
