/**
 * 网络连接分析视图组件
 * 连接卡片布局，按协议/状态/进程筛选，点击弹出详情
 */

import { invoke } from '@tauri-apps/api/core';
import { loadAppSettings } from '../../core/settingsHelper';
import { RowContextMenuHost, attachSharedRowContextMenu } from './rowContextMenuShared';

interface NetEntry {
  proto: string;
  state: string;
  src_addr: string;
  src_port: string;
  dst_addr: string;
  dst_port: string;
  time: string;
  object: string;
  pid: number;
  process: string;
  process_path: string;
}

interface NetStats {
  total: number;
  proto_dist: Record<string, number>;
  state_dist: Record<string, number>;
  process_dist: Record<string, number>;
  top_states: string[];
  top_processes: string[];
}

interface NetResult {
  connections: NetEntry[];
  stats: NetStats;
}

const STATE_COLORS: Record<string, string> = {
  'LISTENING': '#2563eb',
  'ESTABLISHED': '#16a34a',
  'CLOSE_WAIT': '#d97706',
  'TIME_WAIT': '#ea580c',
  'CLOSED': '#94a3b8',
  'SYN_SENT': '#8b5cf6',
  'FIN_WAIT1': '#dc2626',
  'FIN_WAIT2': '#dc2626',
};

const PROTO_COLORS: Record<string, string> = {
  'TCP4': '#2563eb',
  'TCP6': '#8b5cf6',
  'UDP4': '#16a34a',
  'UDP6': '#059669',
};

export class NetViewer {
  private container: HTMLElement | null = null;
  private contextMenuHost: RowContextMenuHost | null = null;
  private data: NetResult | null = null;
  private isLoading = false;
  private error: string | null = null;
  private searchKeyword = '';
  private stateFilter = '';
  private protoFilter = '';

  init(containerId: string): void {
    this.container = document.getElementById(containerId);
  }

  async load(csvFile: string): Promise<void> {
    if (!this.container) return;
    this.isLoading = true;
    this.error = null;
    this.render();

    try {
      const settings = await loadAppSettings();
      const outputPath = (settings as any).output_path || 'output';
      const result = await invoke('parse_net_csv', {
        csvFilePath: `${outputPath}\\\\${csvFile}`,
      }) as NetResult;
      this.data = result;
    } catch (e) {
      this.error = String(e);
    } finally {
      this.isLoading = false;
      this.render();
      this.bindEvents();
    }
  }

  private render(): void {
    if (!this.container) return;

    if (this.isLoading) {
      this.container.innerHTML = `<div class="svc-loading"><div class="svc-spinner"></div><div>正在解析网络数据...</div></div>`;
      return;
    }
    if (this.error) {
      this.container.innerHTML = `<div class="svc-error">${this.esc(this.error)}</div>`;
      return;
    }
    if (!this.data) {
      this.container.innerHTML = `<div class="svc-empty">暂无数据</div>`;
      return;
    }

    const s = this.data.stats;
    const filtered = this.getFiltered();
    const protos = Object.keys(s.proto_dist).sort();

    this.container.innerHTML = `
      <div class="net-wrapper">
        <div class="svc-stats-bar">
          <span class="svc-stat"><span class="svc-stat-v">${s.total}</span> 连接</span>
          <span class="svc-stat-sep"></span>
          ${protos.map(p => `<span class="svc-stat" style="color:${PROTO_COLORS[p] || '#64748b'}"><span class="svc-stat-v">${s.proto_dist[p]}</span> ${p}</span>`).join('')}
          <span class="svc-stat-sep"></span>
          ${s.top_states.slice(0, 4).map(st => `<span class="svc-stat" style="color:${STATE_COLORS[st] || '#64748b'}"><span class="svc-stat-v">${s.state_dist[st]}</span> ${st}</span>`).join('')}
        </div>

        <div class="svc-toolbar">
          <input type="text" class="svc-search" id="net-search" placeholder="搜索地址、端口、进程名..." value="${this.esc(this.searchKeyword)}">
          <div class="svc-filters">
            <button class="svc-fbtn ${this.protoFilter === '' ? 'active' : ''}" data-proto="">全部协议</button>
            ${protos.map(p => `<button class="svc-fbtn ${this.protoFilter === p ? 'active' : ''}" data-proto="${p}" style="${this.protoFilter === p ? `background:${PROTO_COLORS[p] || '#64748b'};color:#fff;border-color:${PROTO_COLORS[p] || '#64748b'}` : `color:${PROTO_COLORS[p] || '#64748b'}`}">${p}</button>`).join('')}
            <span class="svc-stat-sep"></span>
            <button class="svc-fbtn ${this.stateFilter === '' ? 'active' : ''}" data-state="">全部状态</button>
            ${s.top_states.map(st => `<button class="svc-fbtn ${this.stateFilter === st ? 'active' : ''}" data-state="${st}" style="${this.stateFilter === st ? `background:${STATE_COLORS[st] || '#64748b'};color:#fff;border-color:${STATE_COLORS[st] || '#64748b'}` : `color:${STATE_COLORS[st] || '#64748b'}`}">${st} (${s.state_dist[st]})</button>`).join('')}
          </div>
        </div>

        <div class="svc-count">显示 ${filtered.length} / ${s.total} 个连接</div>

        <div class="net-list" id="net-list">
          ${filtered.length === 0 ? '<div class="svc-empty">没有匹配的连接</div>' :
            filtered.map((conn, i) => this.renderCard(conn, i)).join('')}
        </div>
      </div>
    `;
  }

  private renderCard(conn: NetEntry, index: number): string {
    const stColor = STATE_COLORS[conn.state] || '#64748b';
    const prColor = PROTO_COLORS[conn.proto] || '#64748b';
    const isListening = conn.state === 'LISTENING';
    const dst = conn.dst_addr === '***' || !conn.dst_addr ? '' : `${conn.dst_addr}:${conn.dst_port}`;

    return `
      <div class="net-card" data-net-idx="${index}" style="cursor:pointer">
        <div class="net-card-top">
          <span class="net-proto" style="color:${prColor}">${conn.proto}</span>
          <span class="net-state" style="color:${stColor};border-color:${stColor}30;background:${stColor}10">${conn.state}</span>
          <span class="net-process">${this.esc(conn.process)}</span>
          <span class="proc-pid">PID ${conn.pid}</span>
        </div>
        <div class="net-addr-row">
          <span class="net-endpoint net-src">${this.highlight(conn.src_addr)}:<strong>${conn.src_port}</strong></span>
          ${dst ? `<span class="net-arrow">${isListening ? '' : '&#8594;'}</span>
          <span class="net-endpoint net-dst">${this.highlight(dst)}</span>` : ''}
        </div>
      </div>
    `;
  }

  private showDetailModal(conn: NetEntry): void {
    document.querySelectorAll('.svc-modal-overlay').forEach(e => e.remove());
    const stColor = STATE_COLORS[conn.state] || '#64748b';
    const prColor = PROTO_COLORS[conn.proto] || '#64748b';

    const overlay = document.createElement('div');
    overlay.className = 'svc-modal-overlay';
    overlay.innerHTML = `
      <div class="svc-modal">
        <div class="svc-modal-header">
          <span class="net-proto" style="color:${prColor};font-size:14px">${conn.proto}</span>
          <span class="svc-modal-title">${this.esc(conn.src_addr)}:${conn.src_port} ${conn.dst_addr !== '***' ? '-> ' + conn.dst_addr + ':' + conn.dst_port : ''}</span>
          <span class="svc-badge" style="color:${stColor};border-color:${stColor}30;background:${stColor}10;font-size:12px">${conn.state}</span>
          <button class="svc-modal-close">&times;</button>
        </div>
        <table class="svc-modal-table">
          <tr><td class="svc-modal-label">协议</td><td style="color:${prColor};font-weight:600">${conn.proto}</td></tr>
          <tr><td class="svc-modal-label">状态</td><td style="color:${stColor};font-weight:600">${conn.state}</td></tr>
          <tr><td class="svc-modal-label">源地址</td><td class="svc-modal-mono">${this.esc(conn.src_addr)}</td></tr>
          <tr><td class="svc-modal-label">源端口</td><td class="svc-modal-mono">${conn.src_port}</td></tr>
          <tr><td class="svc-modal-label">目标地址</td><td class="svc-modal-mono">${this.esc(conn.dst_addr || '-')}</td></tr>
          <tr><td class="svc-modal-label">目标端口</td><td class="svc-modal-mono">${conn.dst_port || '-'}</td></tr>
          <tr><td class="svc-modal-label">时间</td><td>${this.esc(conn.time || '-')}</td></tr>
          <tr><td class="svc-modal-label">对象地址</td><td class="svc-modal-mono">${this.esc(conn.object || '-')}</td></tr>
          <tr><td class="svc-modal-label">PID</td><td class="svc-modal-mono">${conn.pid}</td></tr>
          <tr><td class="svc-modal-label">进程名称</td><td>${this.esc(conn.process)}</td></tr>
          <tr><td class="svc-modal-label">进程路径</td><td class="svc-modal-mono svc-modal-path">${this.esc(conn.process_path || '-')}</td></tr>
        </table>
      </div>
    `;

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || (e.target as HTMLElement).classList.contains('svc-modal-close')) overlay.remove();
    });
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', esc); } };
    document.addEventListener('keydown', esc);
    document.body.appendChild(overlay);
  }

  private getFiltered(): NetEntry[] {
    if (!this.data) return [];
    const kw = this.searchKeyword.toLowerCase();
    return this.data.connections.filter(c => {
      if (this.stateFilter && c.state !== this.stateFilter) return false;
      if (this.protoFilter && c.proto !== this.protoFilter) return false;
      if (kw) {
        return c.src_addr.toLowerCase().includes(kw) ||
               c.dst_addr.toLowerCase().includes(kw) ||
               c.src_port.includes(kw) ||
               c.dst_port.includes(kw) ||
               c.process.toLowerCase().includes(kw) ||
               c.pid.toString().includes(kw);
      }
      return true;
    });
  }

  private highlight(text: string): string {
    const e = this.esc(text);
    if (!this.searchKeyword) return e;
    const kw = this.esc(this.searchKeyword);
    return e.replace(new RegExp(`(${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<mark class="svc-hl">$1</mark>');
  }

  private esc(t: string): string { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

  private bindEvents(): void {
    if (!this.container) return;

    const input = this.container.querySelector('#net-search') as HTMLInputElement;
    if (input) {
      let timer: number | null = null;
      input.addEventListener('input', () => {
        if (timer) clearTimeout(timer);
        timer = window.setTimeout(() => {
          this.searchKeyword = input.value;
          this.render(); this.bindEvents();
          const ni = this.container?.querySelector('#net-search') as HTMLInputElement;
          if (ni) { ni.focus(); ni.setSelectionRange(ni.value.length, ni.value.length); }
        }, 300);
      });
    }

    this.container.querySelectorAll('.svc-fbtn[data-proto]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.protoFilter = btn.getAttribute('data-proto') || '';
        this.render(); this.bindEvents();
      });
    });

    this.container.querySelectorAll('.svc-fbtn[data-state]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.stateFilter = btn.getAttribute('data-state') || '';
        this.render(); this.bindEvents();
      });
    });

    const list = this.container.querySelector('#net-list');
    if (list) {
      list.addEventListener('click', (e) => {
        const card = (e.target as HTMLElement).closest('.net-card') as HTMLElement;
        if (!card) return;
        const idx = parseInt(card.getAttribute('data-net-idx') || '-1', 10);
        const filtered = this.getFiltered();
        if (idx >= 0 && idx < filtered.length) {
          this.showDetailModal(filtered[idx]);
        }
      });

      // 卡片右键 -> 共享 CSV 右键菜单
      attachSharedRowContextMenu(
        list as HTMLElement,
        () => this.contextMenuHost,
        { loadFileName: 'net.csv', displayName: '网络连接' },
        (target) => {
          const card = target.closest('.net-card') as HTMLElement | null;
          if (!card) return null;
          const idx = parseInt(card.getAttribute('data-net-idx') || '-1', 10);
          const filtered = this.getFiltered();
          if (idx < 0 || idx >= filtered.length) return null;
          return { rowData: this.toRowData(filtered[idx]) };
        }
      );
    }
  }

  setContextMenuHost(host: RowContextMenuHost | null): void {
    this.contextMenuHost = host;
  }

  private toRowData(n: NetEntry): Record<string, string> {
    return {
      Proto: n.proto,
      State: n.state,
      'Src': `${n.src_addr}:${n.src_port}`,
      'Dst': `${n.dst_addr}:${n.dst_port}`,
      Time: n.time,
      Object: n.object,
      PID: String(n.pid),
      Process: n.process,
      ProcessPath: n.process_path,
    };
  }

  cleanup(): void {
    this.data = null;
    this.searchKeyword = '';
    this.stateFilter = '';
    this.protoFilter = '';
    this.error = null;
    document.querySelectorAll('.svc-modal-overlay').forEach(e => e.remove());
  }
}
