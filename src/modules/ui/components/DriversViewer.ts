/**
 * 驱动程序分析视图组件
 * 卡片式布局，点击弹出详情模态框，支持搜索和路径筛选
 */

import { invoke } from '@tauri-apps/api/core';
import { loadAppSettings } from '../../core/settingsHelper';
import { RowContextMenuHost, attachSharedRowContextMenu } from './rowContextMenuShared';

interface DriverEntry {
  name: string;
  object_address: string;
  size: string;
  size_bytes: number;
  start_addr: string;
  end_addr: string;
  service_key: string;
  driver_name: string;
  driver_path: string;
}

interface DriversStats {
  total: number;
  with_path: number;
  without_path: number;
  total_size: number;
  path_dist: Record<string, number>;
  top_paths: string[];
}

interface DriversResult {
  drivers: DriverEntry[];
  stats: DriversStats;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export class DriversViewer {
  private container: HTMLElement | null = null;
  private data: DriversResult | null = null;
  private contextMenuHost: RowContextMenuHost | null = null;
  private isLoading = false;
  private error: string | null = null;
  private searchKeyword = '';
  private pathFilter = '';

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
      const result = await invoke('parse_drivers_csv', {
        csvFilePath: `${outputPath}\\\\${csvFile}`,
      }) as DriversResult;
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
      this.container.innerHTML = `<div class="svc-loading"><div class="svc-spinner"></div><div>正在解析驱动数据...</div></div>`;
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
    const topPaths = s.top_paths.slice(0, 6);

    this.container.innerHTML = `
      <div class="svc-wrapper">
        <div class="svc-stats-bar">
          <span class="svc-stat"><span class="svc-stat-v">${s.total}</span> 驱动</span>
          <span class="svc-stat" style="color:#16a34a"><span class="svc-stat-v">${s.with_path}</span> 有路径</span>
          <span class="svc-stat" style="color:#94a3b8"><span class="svc-stat-v">${s.without_path}</span> 无路径</span>
          <span class="svc-stat-sep"></span>
          <span class="svc-stat"><span class="svc-stat-v">${formatSize(s.total_size)}</span> 总大小</span>
        </div>

        <div class="svc-toolbar">
          <input type="text" class="svc-search" id="drv-search" placeholder="搜索驱动名、路径、服务键..." value="${this.esc(this.searchKeyword)}">
          <div class="svc-filters">
            <button class="svc-fbtn ${this.pathFilter === '' ? 'active' : ''}" data-path="">全部路径</button>
            ${topPaths.map(p => {
              const short = p.length > 30 ? '...' + p.slice(-27) : p;
              return `<button class="svc-fbtn ${this.pathFilter === p ? 'active' : ''}" data-path="${this.esc(p)}" title="${this.esc(p)}">${this.esc(short)} (${s.path_dist[p]})</button>`;
            }).join('')}
          </div>
        </div>

        <div class="svc-count">显示 ${filtered.length} / ${s.total} 个驱动</div>

        <div class="svc-grid" id="drv-grid">
          ${filtered.length === 0 ? '<div class="svc-empty">没有匹配的驱动</div>' :
            filtered.map((drv, i) => this.renderCard(drv, i)).join('')}
        </div>
      </div>
    `;
  }

  private renderCard(drv: DriverEntry, index: number): string {
    const hasPath = !!drv.driver_path;
    const hasSize = drv.size_bytes > 0;

    return `
      <div class="svc-card ${hasPath ? 'svc-card-running' : ''}" data-drv-idx="${index}" style="cursor:pointer">
        <div class="svc-card-header">
          <span class="svc-dot" style="background:${hasPath ? '#16a34a' : '#94a3b8'}"></span>
          <span class="svc-card-name">${this.highlight(drv.name)}</span>
          ${hasSize ? `<span class="svc-badge" style="color:#2563eb;border-color:#2563eb30;background:#2563eb10">${formatSize(drv.size_bytes)}</span>` : ''}
        </div>
        <div class="svc-card-meta">
          ${drv.driver_name ? `<span class="svc-tag" style="color:#8b5cf6">${this.esc(drv.driver_name)}</span>` : ''}
          ${drv.service_key ? `<span class="svc-tag">${this.esc(drv.service_key)}</span>` : ''}
        </div>
        ${drv.driver_path ? `<div class="svc-card-path" title="${this.esc(drv.driver_path)}">${this.highlight(drv.driver_path)}</div>` : ''}
      </div>
    `;
  }

  private showDetailModal(drv: DriverEntry): void {
    document.querySelectorAll('.svc-modal-overlay').forEach(e => e.remove());

    const overlay = document.createElement('div');
    overlay.className = 'svc-modal-overlay';
    overlay.innerHTML = `
      <div class="svc-modal">
        <div class="svc-modal-header">
          <span class="svc-dot" style="background:${drv.driver_path ? '#16a34a' : '#94a3b8'};width:10px;height:10px"></span>
          <span class="svc-modal-title">${this.esc(drv.name)}</span>
          ${drv.size_bytes > 0 ? `<span class="svc-badge" style="color:#2563eb;border-color:#2563eb30;background:#2563eb10;font-size:12px">${formatSize(drv.size_bytes)}</span>` : ''}
          <button class="svc-modal-close">&times;</button>
        </div>
        <table class="svc-modal-table">
          <tr><td class="svc-modal-label">驱动名称</td><td>${this.esc(drv.name)}</td></tr>
          <tr><td class="svc-modal-label">驱动对象名</td><td class="svc-modal-mono">${this.esc(drv.driver_name || '-')}</td></tr>
          <tr><td class="svc-modal-label">对象地址</td><td class="svc-modal-mono">${this.esc(drv.object_address || '-')}</td></tr>
          <tr><td class="svc-modal-label">驱动大小</td><td class="svc-modal-mono">${drv.size_bytes > 0 ? formatSize(drv.size_bytes) + ' (' + drv.size + ' = ' + drv.size_bytes.toLocaleString() + ' bytes)' : '-'}</td></tr>
          <tr><td class="svc-modal-label">起始地址</td><td class="svc-modal-mono">${this.esc(drv.start_addr || '-')}</td></tr>
          <tr><td class="svc-modal-label">结束地址</td><td class="svc-modal-mono">${this.esc(drv.end_addr || '-')}</td></tr>
          <tr><td class="svc-modal-label">服务注册键</td><td class="svc-modal-mono">${this.esc(drv.service_key || '-')}</td></tr>
          <tr><td class="svc-modal-label">驱动路径</td><td class="svc-modal-mono svc-modal-path">${this.esc(drv.driver_path || '-')}</td></tr>
        </table>
      </div>
    `;

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || (e.target as HTMLElement).classList.contains('svc-modal-close')) {
        overlay.remove();
      }
    });

    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escHandler); }
    };
    document.addEventListener('keydown', escHandler);

    document.body.appendChild(overlay);
  }

  private getFiltered(): DriverEntry[] {
    if (!this.data) return [];
    const kw = this.searchKeyword.toLowerCase();
    return this.data.drivers.filter(drv => {
      if (this.pathFilter) {
        const dir = drv.driver_path.lastIndexOf('\\') >= 0
          ? drv.driver_path.substring(0, drv.driver_path.lastIndexOf('\\'))
          : drv.driver_path;
        if (dir !== this.pathFilter) return false;
      }
      if (kw) {
        return drv.name.toLowerCase().includes(kw) ||
               drv.driver_name.toLowerCase().includes(kw) ||
               drv.driver_path.toLowerCase().includes(kw) ||
               drv.service_key.toLowerCase().includes(kw);
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

    const input = this.container.querySelector('#drv-search') as HTMLInputElement;
    if (input) {
      let timer: number | null = null;
      input.addEventListener('input', () => {
        if (timer) clearTimeout(timer);
        timer = window.setTimeout(() => {
          this.searchKeyword = input.value;
          this.render(); this.bindEvents();
          const ni = this.container?.querySelector('#drv-search') as HTMLInputElement;
          if (ni) { ni.focus(); ni.setSelectionRange(ni.value.length, ni.value.length); }
        }, 300);
      });
    }

    // 路径筛选
    this.container.querySelectorAll('.svc-fbtn[data-path]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.pathFilter = btn.getAttribute('data-path') || '';
        this.render(); this.bindEvents();
      });
    });

    // 卡片点击 -> 详情模态框
    const grid = this.container.querySelector('#drv-grid');
    if (grid) {
      grid.addEventListener('click', (e) => {
        const card = (e.target as HTMLElement).closest('.svc-card') as HTMLElement;
        if (!card) return;
        const idx = parseInt(card.getAttribute('data-drv-idx') || '-1', 10);
        const filtered = this.getFiltered();
        if (idx >= 0 && idx < filtered.length) {
          this.showDetailModal(filtered[idx]);
        }
      });

      // 卡片右键 -> 共享 CSV 右键菜单
      attachSharedRowContextMenu(
        grid as HTMLElement,
        () => this.contextMenuHost,
        { loadFileName: 'drivers.csv', displayName: '驱动信息' },
        (target) => {
          const card = target.closest('.svc-card') as HTMLElement | null;
          if (!card) return null;
          const idx = parseInt(card.getAttribute('data-drv-idx') || '-1', 10);
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

  private toRowData(d: DriverEntry): Record<string, string> {
    return {
      Name: d.name,
      Object: d.object_address,
      Size: d.size,
      StartAddr: d.start_addr,
      EndAddr: d.end_addr,
      ServiceKey: d.service_key,
      DriverName: d.driver_name,
      DriverPath: d.driver_path,
    };
  }

  cleanup(): void {
    this.data = null;
    this.searchKeyword = '';
    this.pathFilter = '';
    this.error = null;
    document.querySelectorAll('.svc-modal-overlay').forEach(e => e.remove());
  }
}
