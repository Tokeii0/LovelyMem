/**
 * 系统服务分析视图组件
 * 卡片式布局展示服务，支持状态/类型/用户/启动类型筛选和搜索
 * 点击卡片弹出详情模态框
 */

import { invoke } from '@tauri-apps/api/core';
import { loadAppSettings } from '../../core/settingsHelper';
import { RowContextMenuHost, attachSharedRowContextMenu } from './rowContextMenuShared';

interface ServiceEntry {
  pid: number;
  ordinal: string;
  service_name: string;
  display_name: string;
  user: string;
  start_type: string;
  state: string;
  type1: string;
  type2: string;
  object_address: string;
  image_path: string;
  driver_path: string;
}

interface ServicesStats {
  total: number;
  running: number;
  stopped: number;
  drivers: number;
  processes: number;
  start_type_dist: Record<string, number>;
  state_dist: Record<string, number>;
}

interface ServicesResult {
  services: ServiceEntry[];
  stats: ServicesStats;
}

const STATE_COLORS: Record<string, string> = {
  'SERVICE_RUNNING': '#16a34a',
  'SERVICE_STOPPED': '#94a3b8',
  'SERVICE_START_PENDING': '#d97706',
  'SERVICE_STOP_PENDING': '#ea580c',
};

const START_TYPE_COLORS: Record<string, string> = {
  'SERVICE_BOOT_START': '#dc2626',
  'SERVICE_SYSTEM_START': '#ea580c',
  'SERVICE_AUTO_START': '#2563eb',
  'SERVICE_DEMAND_START': '#64748b',
  'SERVICE_DISABLED': '#334155',
};

const START_TYPE_LABELS: Record<string, string> = {
  'SERVICE_BOOT_START': 'BOOT - 系统引导时加载',
  'SERVICE_SYSTEM_START': 'SYSTEM - 系统初始化时加载',
  'SERVICE_AUTO_START': 'AUTO - 系统启动后自动启动',
  'SERVICE_DEMAND_START': 'DEMAND - 手动按需启动',
  'SERVICE_DISABLED': 'DISABLED - 已禁用',
};

function shortState(s: string): string {
  return s.replace('SERVICE_', '');
}

function shortStartType(s: string): string {
  return s.replace('SERVICE_', '').replace('_START', '');
}

export class ServicesViewer {
  private container: HTMLElement | null = null;
  private data: ServicesResult | null = null;
  private isLoading = false;
  private error: string | null = null;
  private searchKeyword = '';
  private stateFilter: 'all' | 'running' | 'stopped' = 'all';
  private typeFilter: 'all' | 'Driver' | 'Process' = 'all';
  private startTypeFilter = '';   // 空=全部
  private userFilter = '';        // 空=全部
  private contextMenuHost: RowContextMenuHost | null = null;

  init(containerId: string): void {
    this.container = document.getElementById(containerId);
  }

  setContextMenuHost(host: RowContextMenuHost | null): void {
    this.contextMenuHost = host;
  }

  /** 服务条目 -> 以原始列名为键的行数据（供共享右键菜单使用） */
  private toRowData(svc: ServiceEntry): Record<string, string> {
    return {
      PID: String(svc.pid),
      Name: svc.service_name,
      DisplayName: svc.display_name,
      User: svc.user,
      StartType: svc.start_type,
      State: svc.state,
      Type: [svc.type1, svc.type2].filter(Boolean).join('/'),
      Object: svc.object_address,
      ImagePath: svc.image_path,
      DriverPath: svc.driver_path,
      Ordinal: svc.ordinal,
    };
  }

  async load(csvFile: string): Promise<void> {
    if (!this.container) return;
    this.isLoading = true;
    this.error = null;
    this.render();

    try {
      const settings = await loadAppSettings();
      const outputPath = (settings as any).output_path || 'output';
      const result = await invoke('parse_services_csv', {
        csvFilePath: `${outputPath}\\\\${csvFile}`,
      }) as ServicesResult;
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
      this.container.innerHTML = `<div class="svc-loading"><div class="svc-spinner"></div><div>正在解析服务数据...</div></div>`;
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

    // 收集唯一用户列表
    const users = [...new Set(this.data.services.map(svc => svc.user).filter(u => u))].sort();

    // StartType 列表 (按数量排序)
    const startTypes = Object.entries(s.start_type_dist)
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => k);

    this.container.innerHTML = `
      <div class="svc-wrapper">
        <div class="svc-stats-bar">
          <span class="svc-stat"><span class="svc-stat-v">${s.total}</span> 总计</span>
          <span class="svc-stat" style="color:${STATE_COLORS['SERVICE_RUNNING']}"><span class="svc-stat-v">${s.running}</span> 运行中</span>
          <span class="svc-stat" style="color:${STATE_COLORS['SERVICE_STOPPED']}"><span class="svc-stat-v">${s.stopped}</span> 已停止</span>
          <span class="svc-stat-sep"></span>
          <span class="svc-stat" style="color:#8b5cf6"><span class="svc-stat-v">${s.drivers}</span> 驱动</span>
          <span class="svc-stat" style="color:#2563eb"><span class="svc-stat-v">${s.processes}</span> 进程服务</span>
        </div>

        <div class="svc-toolbar">
          <input type="text" class="svc-search" id="svc-search" placeholder="搜索服务名、描述、路径..." value="${this.esc(this.searchKeyword)}">
          <div class="svc-filters">
            <button class="svc-fbtn ${this.stateFilter === 'all' ? 'active' : ''}" data-state="all">全部</button>
            <button class="svc-fbtn ${this.stateFilter === 'running' ? 'active' : ''}" data-state="running" style="${this.stateFilter === 'running' ? 'background:#16a34a;color:#fff;border-color:#16a34a' : ''}">运行中</button>
            <button class="svc-fbtn ${this.stateFilter === 'stopped' ? 'active' : ''}" data-state="stopped">已停止</button>
            <span class="svc-stat-sep"></span>
            <button class="svc-fbtn ${this.typeFilter === 'all' ? 'active' : ''}" data-type="all">全部类型</button>
            <button class="svc-fbtn ${this.typeFilter === 'Driver' ? 'active' : ''}" data-type="Driver">驱动</button>
            <button class="svc-fbtn ${this.typeFilter === 'Process' ? 'active' : ''}" data-type="Process">进程服务</button>
          </div>
        </div>

        <!-- 启动类型筛选 -->
        <div class="svc-toolbar svc-toolbar-sub">
          <div class="svc-filter-label">启动类型:</div>
          <div class="svc-filters">
            <button class="svc-fbtn svc-start-btn ${this.startTypeFilter === '' ? 'active' : ''}" data-start="">全部</button>
            ${startTypes.map(st => {
              const color = START_TYPE_COLORS[st] || '#64748b';
              const label = START_TYPE_LABELS[st] || st;
              const short = shortStartType(st);
              const count = s.start_type_dist[st] || 0;
              const isActive = this.startTypeFilter === st;
              return `<button class="svc-fbtn svc-start-btn ${isActive ? 'active' : ''}" data-start="${st}" 
                title="${label}" style="${isActive ? `background:${color};color:#fff;border-color:${color}` : `color:${color}`}">
                ${short} (${count})
              </button>`;
            }).join('')}
          </div>
          ${users.length > 0 ? `
          <span class="svc-stat-sep"></span>
          <div class="svc-filter-label">用户:</div>
          <div class="svc-filters">
            <button class="svc-fbtn ${this.userFilter === '' ? 'active' : ''}" data-user="">全部</button>
            ${users.map(u => `<button class="svc-fbtn ${this.userFilter === u ? 'active' : ''}" data-user="${this.esc(u)}">${this.esc(u)}</button>`).join('')}
          </div>
          ` : ''}
        </div>

        <div class="svc-count">显示 ${filtered.length} / ${s.total} 个服务</div>

        <div class="svc-grid" id="svc-grid">
          ${filtered.length === 0 ? '<div class="svc-empty">没有匹配的服务</div>' :
            filtered.map((svc, i) => this.renderCard(svc, i)).join('')}
        </div>
      </div>
    `;
  }

  private renderCard(svc: ServiceEntry, index: number): string {
    const isRunning = svc.state.includes('RUNNING');
    const stateColor = STATE_COLORS[svc.state] || '#64748b';
    const startColor = START_TYPE_COLORS[svc.start_type] || '#64748b';

    return `
      <div class="svc-card ${isRunning ? 'svc-card-running' : ''}" data-svc-idx="${index}" style="cursor:pointer">
        <div class="svc-card-header">
          <span class="svc-dot" style="background:${stateColor}"></span>
          <span class="svc-card-name">${this.highlight(svc.service_name)}</span>
          <span class="svc-badge" style="color:${stateColor};border-color:${stateColor}30;background:${stateColor}10">${shortState(svc.state)}</span>
        </div>
        ${svc.display_name && svc.display_name !== svc.service_name ? `<div class="svc-card-desc">${this.highlight(svc.display_name)}</div>` : ''}
        <div class="svc-card-meta">
          <span class="svc-tag" style="color:${svc.type1 === 'Driver' ? '#8b5cf6' : '#2563eb'}">${svc.type1}</span>
          <span class="svc-tag" style="color:${startColor}">${shortStartType(svc.start_type)}</span>
          ${svc.type2 ? `<span class="svc-tag">${svc.type2}</span>` : ''}
          ${svc.pid > 0 ? `<span class="svc-tag svc-tag-pid">PID ${svc.pid}</span>` : ''}
          ${svc.user ? `<span class="svc-tag">${this.esc(svc.user)}</span>` : ''}
        </div>
        ${svc.driver_path ? `<div class="svc-card-path" title="${this.esc(svc.driver_path)}">${this.highlight(svc.driver_path)}</div>` : ''}
      </div>
    `;
  }

  private showDetailModal(svc: ServiceEntry): void {
    // 移除已有的模态框
    document.querySelectorAll('.svc-modal-overlay').forEach(e => e.remove());

    const stateColor = STATE_COLORS[svc.state] || '#64748b';
    const startColor = START_TYPE_COLORS[svc.start_type] || '#64748b';
    const startLabel = START_TYPE_LABELS[svc.start_type] || svc.start_type;

    const overlay = document.createElement('div');
    overlay.className = 'svc-modal-overlay';
    overlay.innerHTML = `
      <div class="svc-modal">
        <div class="svc-modal-header">
          <span class="svc-dot" style="background:${stateColor};width:10px;height:10px"></span>
          <span class="svc-modal-title">${this.esc(svc.service_name)}</span>
          <span class="svc-badge" style="color:${stateColor};border-color:${stateColor}30;background:${stateColor}10;font-size:12px">${shortState(svc.state)}</span>
          <button class="svc-modal-close">&times;</button>
        </div>
        ${svc.display_name ? `<div class="svc-modal-subtitle">${this.esc(svc.display_name)}</div>` : ''}
        <table class="svc-modal-table">
          <tr><td class="svc-modal-label">服务名称</td><td>${this.esc(svc.service_name)}</td></tr>
          <tr><td class="svc-modal-label">显示名称</td><td>${this.esc(svc.display_name || '-')}</td></tr>
          <tr><td class="svc-modal-label">状态</td><td><span style="color:${stateColor};font-weight:600">${shortState(svc.state)}</span></td></tr>
          <tr><td class="svc-modal-label">启动类型</td><td><span style="color:${startColor};font-weight:500">${this.esc(startLabel)}</span></td></tr>
          <tr><td class="svc-modal-label">服务类型</td><td>${this.esc(svc.type1)}${svc.type2 ? ' / ' + this.esc(svc.type2) : ''}</td></tr>
          <tr><td class="svc-modal-label">PID</td><td>${svc.pid > 0 ? svc.pid : '-'}</td></tr>
          <tr><td class="svc-modal-label">运行用户</td><td>${this.esc(svc.user || '-')}</td></tr>
          <tr><td class="svc-modal-label">序号</td><td>${this.esc(svc.ordinal || '-')}</td></tr>
          <tr><td class="svc-modal-label">对象地址</td><td class="svc-modal-mono">${this.esc(svc.object_address || '-')}</td></tr>
          <tr><td class="svc-modal-label">映像路径</td><td class="svc-modal-mono">${this.esc(svc.image_path || '-')}</td></tr>
          <tr><td class="svc-modal-label">驱动路径 / 命令行</td><td class="svc-modal-mono svc-modal-path">${this.esc(svc.driver_path || '-')}</td></tr>
        </table>
      </div>
    `;

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || (e.target as HTMLElement).classList.contains('svc-modal-close')) {
        overlay.remove();
      }
    });

    // ESC 关闭
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escHandler); }
    };
    document.addEventListener('keydown', escHandler);

    document.body.appendChild(overlay);
  }

  private getFiltered(): ServiceEntry[] {
    if (!this.data) return [];
    const kw = this.searchKeyword.toLowerCase();
    return this.data.services.filter(svc => {
      if (this.stateFilter === 'running' && !svc.state.includes('RUNNING')) return false;
      if (this.stateFilter === 'stopped' && !svc.state.includes('STOPPED')) return false;
      if (this.typeFilter !== 'all' && svc.type1 !== this.typeFilter) return false;
      if (this.startTypeFilter && svc.start_type !== this.startTypeFilter) return false;
      if (this.userFilter && svc.user !== this.userFilter) return false;
      if (kw) {
        return svc.service_name.toLowerCase().includes(kw) ||
               svc.display_name.toLowerCase().includes(kw) ||
               svc.driver_path.toLowerCase().includes(kw) ||
               svc.user.toLowerCase().includes(kw);
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

    const input = this.container.querySelector('#svc-search') as HTMLInputElement;
    if (input) {
      let timer: number | null = null;
      input.addEventListener('input', () => {
        if (timer) clearTimeout(timer);
        timer = window.setTimeout(() => {
          this.searchKeyword = input.value;
          this.render();
          this.bindEvents();
          const ni = this.container?.querySelector('#svc-search') as HTMLInputElement;
          if (ni) { ni.focus(); ni.setSelectionRange(ni.value.length, ni.value.length); }
        }, 300);
      });
    }

    // 状态筛选
    this.container.querySelectorAll('.svc-fbtn[data-state]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.stateFilter = (btn.getAttribute('data-state') || 'all') as typeof this.stateFilter;
        this.render(); this.bindEvents();
      });
    });

    // 类型筛选
    this.container.querySelectorAll('.svc-fbtn[data-type]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.typeFilter = (btn.getAttribute('data-type') || 'all') as typeof this.typeFilter;
        this.render(); this.bindEvents();
      });
    });

    // 启动类型筛选
    this.container.querySelectorAll('.svc-start-btn[data-start]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.startTypeFilter = btn.getAttribute('data-start') || '';
        this.render(); this.bindEvents();
      });
    });

    // 用户筛选
    this.container.querySelectorAll('.svc-fbtn[data-user]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.userFilter = btn.getAttribute('data-user') || '';
        this.render(); this.bindEvents();
      });
    });

    // 卡片点击 -> 弹出详情
    const grid = this.container.querySelector('#svc-grid');
    if (grid) {
      grid.addEventListener('click', (e) => {
        const card = (e.target as HTMLElement).closest('.svc-card') as HTMLElement;
        if (!card) return;
        const idx = parseInt(card.getAttribute('data-svc-idx') || '-1', 10);
        const filtered = this.getFiltered();
        if (idx >= 0 && idx < filtered.length) {
          this.showDetailModal(filtered[idx]);
        }
      });

      // 卡片右键 -> 共享 CSV 右键菜单
      attachSharedRowContextMenu(
        grid as HTMLElement,
        () => this.contextMenuHost,
        { loadFileName: 'services.csv', displayName: '系统服务' },
        (target) => {
          const card = target.closest('.svc-card') as HTMLElement | null;
          if (!card) return null;
          const idx = parseInt(card.getAttribute('data-svc-idx') || '-1', 10);
          const filtered = this.getFiltered();
          if (idx < 0 || idx >= filtered.length) return null;
          return { rowData: this.toRowData(filtered[idx]) };
        }
      );
    }
  }

  cleanup(): void {
    this.data = null;
    this.searchKeyword = '';
    this.stateFilter = 'all';
    this.typeFilter = 'all';
    this.startTypeFilter = '';
    this.userFilter = '';
    this.error = null;
    document.querySelectorAll('.svc-modal-overlay').forEach(e => e.remove());
  }
}
