/**
 * 句柄分析视图组件
 * 按进程分组展示句柄，支持类型筛选和搜索
 */

import { invoke } from '@tauri-apps/api/core';
import { loadAppSettings } from '../../core/settingsHelper';
import { RowContextMenuHost, attachSharedRowContextMenu } from './rowContextMenuShared';

// ---- 类型定义 ----

interface HandleEntry {
  handle: string;
  object: string;
  access: string;
  handle_type: string;
  tag: string;
  handle_count: string;
  device: string;
  description: string;
}

interface ProcessHandles {
  pid: number;
  process_name: string;
  handles: HandleEntry[];
  total_handles: number;
  type_distribution: Record<string, number>;
}

interface HandlesStats {
  total_processes: number;
  total_handles: number;
  type_distribution: Record<string, number>;
  top_types: string[];
}

interface HandlesResult {
  processes: ProcessHandles[];
  stats: HandlesStats;
}

// ---- 类型颜色映射 ----
const TYPE_COLORS: Record<string, string> = {
  Key: '#8b5cf6',
  File: '#2563eb',
  Process: '#dc2626',
  Thread: '#ea580c',
  Event: '#16a34a',
  Section: '#0891b2',
  Mutant: '#c026d3',
  Directory: '#d97706',
  Token: '#64748b',
  Semaphore: '#059669',
  Timer: '#7c3aed',
  'ALPC Port': '#e11d48',
  Desktop: '#0284c7',
  WindowStation: '#4f46e5',
  SymbolicLink: '#0d9488',
  Job: '#b91c1c',
  IoCompletion: '#6d28d9',
};

function getTypeColor(type: string): string {
  return TYPE_COLORS[type] || '#64748b';
}

// ---- 组件类 ----

export class HandlesViewer {
  private container: HTMLElement | null = null;
  private data: HandlesResult | null = null;
  private isLoading: boolean = false;
  private error: string | null = null;
  private searchKeyword: string = '';
  private activeTypeFilter: string = '';  // 空=全部
  private expandedPids: Set<number> = new Set();
  private selectedPid: number | null = null;
  private contextMenuHost: RowContextMenuHost | null = null;
  // 缓存每个进程当前展示的句柄列表，供右键菜单按索引解析
  private cachedHandlesByPid: Map<number, HandleEntry[]> = new Map();

  init(containerId: string): void {
    this.container = document.getElementById(containerId);
  }

  setContextMenuHost(host: RowContextMenuHost | null): void {
    this.contextMenuHost = host;
  }

  private toRowData(h: HandleEntry, pid: number, procName: string): Record<string, string> {
    return {
      PID: String(pid),
      Process: procName,
      Handle: h.handle,
      Object: h.object,
      Access: h.access,
      Type: h.handle_type,
      Tag: h.tag,
      HandleCount: h.handle_count,
      Device: h.device,
      Description: h.description,
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
      const csvPath = `${outputPath}\\\\${csvFile}`;

      const result = await invoke('parse_handles_csv', {
        csvFilePath: csvPath,
      }) as HandlesResult;

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
      this.container.innerHTML = `
        <div class="handles-loading">
          <div class="handles-spinner"></div>
          <div class="handles-loading-text">正在解析句柄数据...</div>
        </div>
      `;
      return;
    }

    if (this.error) {
      this.container.innerHTML = `
        <div class="handles-error">
          <span class="handles-error-text">${this.escapeHtml(this.error)}</span>
        </div>
      `;
      return;
    }

    if (!this.data) {
      this.container.innerHTML = `<div class="handles-empty">暂无数据</div>`;
      return;
    }

    const stats = this.data.stats;
    const processes = this.getFilteredProcesses();

    // 取前 10 个类型做筛选按钮
    const filterTypes = stats.top_types.slice(0, 12);

    this.container.innerHTML = `
      <div class="handles-wrapper">
        <!-- 统计栏 -->
        <div class="handles-stats-bar">
          <span class="handles-stat-item">
            <span class="handles-stat-label">进程</span>
            <span class="handles-stat-value">${stats.total_processes}</span>
          </span>
          <span class="handles-stat-item">
            <span class="handles-stat-label">句柄</span>
            <span class="handles-stat-value">${stats.total_handles.toLocaleString()}</span>
          </span>
          <span class="handles-stat-item">
            <span class="handles-stat-label">类型</span>
            <span class="handles-stat-value">${stats.top_types.length}</span>
          </span>
          <span class="handles-stat-divider"></span>
          ${filterTypes.slice(0, 6).map(t => `
            <span class="handles-stat-type" style="color:${getTypeColor(t)}">
              ${t}: ${(stats.type_distribution[t] || 0).toLocaleString()}
            </span>
          `).join('')}
        </div>

        <!-- 工具栏 -->
        <div class="handles-toolbar">
          <div class="handles-search">
            <input type="text" class="handles-search-input" id="handles-search-input"
                   placeholder="搜索进程名、PID、句柄描述..." value="${this.escapeHtml(this.searchKeyword)}">
          </div>
          <div class="handles-type-filters">
            <button class="handles-type-btn ${this.activeTypeFilter === '' ? 'active' : ''}" data-type="">全部</button>
            ${filterTypes.map(t => `
              <button class="handles-type-btn ${this.activeTypeFilter === t ? 'active' : ''}" 
                      data-type="${t}" style="${this.activeTypeFilter === t ? `background:${getTypeColor(t)};border-color:${getTypeColor(t)};color:#fff` : ''}">
                ${t}
              </button>
            `).join('')}
          </div>
        </div>

        <!-- 进程列表 -->
        <div class="handles-process-list" id="handles-process-list">
          ${processes.length === 0 ? '<div class="handles-empty">没有匹配的结果</div>' : 
            processes.map(proc => this.renderProcess(proc)).join('')}
        </div>
      </div>
    `;
  }

  private renderProcess(proc: ProcessHandles): string {
    const isExpanded = this.expandedPids.has(proc.pid);

    // 类型分布条
    const totalH = proc.total_handles || 1;
    const barSegments = Object.entries(proc.type_distribution)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => {
        const pct = (count / totalH) * 100;
        return `<div class="handles-bar-seg" style="width:${pct}%;background:${getTypeColor(type)}" title="${type}: ${count}"></div>`;
      }).join('');

    // 筛选后的句柄
    const filteredHandles = this.activeTypeFilter
      ? proc.handles.filter(h => h.handle_type === this.activeTypeFilter)
      : proc.handles;

    // 搜索过滤句柄
    const keyword = this.searchKeyword.toLowerCase();
    const displayHandles = keyword
      ? filteredHandles.filter(h =>
          h.description.toLowerCase().includes(keyword) ||
          h.handle_type.toLowerCase().includes(keyword) ||
          h.object.toLowerCase().includes(keyword))
      : filteredHandles;

    // 顶部类型标签（前5个）
    const topTypes = Object.entries(proc.type_distribution)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // 缓存该进程当前展示的句柄，供右键菜单按 data-handle-idx 解析
    if (isExpanded) this.cachedHandlesByPid.set(proc.pid, displayHandles);

    const handleRows = isExpanded ? displayHandles.map((h, hi) => `
      <tr class="handles-row" data-handle-idx="${hi}" title="${this.escapeHtml(h.description)}">
        <td class="handles-cell-handle">${h.handle}</td>
        <td><span class="handles-type-tag" style="color:${getTypeColor(h.handle_type)};border-color:${getTypeColor(h.handle_type)}30;background:${getTypeColor(h.handle_type)}10">${this.escapeHtml(h.handle_type)}</span></td>
        <td class="handles-cell-obj">${h.object}</td>
        <td class="handles-cell-access">${h.access}</td>
        <td class="handles-cell-desc">${this.highlightSearch(h.description)}</td>
      </tr>
    `).join('') : '';

    return `
      <div class="handles-process ${isExpanded ? 'expanded' : ''}" data-pid="${proc.pid}">
        <div class="handles-process-header">
          <span class="handles-expand-arrow">${isExpanded ? '&#9660;' : '&#9654;'}</span>
          <span class="handles-proc-pid">PID ${proc.pid}</span>
          <span class="handles-proc-name">${this.escapeHtml(proc.process_name)}</span>
          <span class="handles-proc-count">${this.activeTypeFilter ? displayHandles.length + '/' : ''}${proc.total_handles} 个句柄</span>
          <div class="handles-proc-types">
            ${topTypes.map(([t, c]) => `<span class="handles-mini-tag" style="color:${getTypeColor(t)}">${t}:${c}</span>`).join('')}
          </div>
          <div class="handles-proc-bar">${barSegments}</div>
        </div>
        ${isExpanded ? `
        <div class="handles-detail">
          <table class="handles-table">
            <thead>
              <tr>
                <th style="width:80px">Handle</th>
                <th style="width:100px">Type</th>
                <th style="width:160px">Object</th>
                <th style="width:80px">Access</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>${handleRows}</tbody>
          </table>
          ${displayHandles.length === 0 ? '<div class="handles-empty" style="padding:16px">没有匹配的句柄</div>' : ''}
        </div>
        ` : ''}
      </div>
    `;
  }

  private getFilteredProcesses(): ProcessHandles[] {
    if (!this.data) return [];
    const keyword = this.searchKeyword.toLowerCase();

    return this.data.processes.filter(proc => {
      // 类型筛选: 进程是否包含该类型的句柄
      if (this.activeTypeFilter) {
        if (!proc.type_distribution[this.activeTypeFilter]) return false;
      }
      // 搜索筛选
      if (keyword) {
        const matchesPid = proc.pid.toString().includes(keyword);
        const matchesName = proc.process_name.toLowerCase().includes(keyword);
        const matchesHandle = proc.handles.some(h =>
          h.description.toLowerCase().includes(keyword) ||
          h.handle_type.toLowerCase().includes(keyword) ||
          h.object.toLowerCase().includes(keyword));
        return matchesPid || matchesName || matchesHandle;
      }
      return true;
    });
  }

  private highlightSearch(text: string): string {
    const escaped = this.escapeHtml(text);
    if (!this.searchKeyword) return escaped;
    const keyword = this.escapeHtml(this.searchKeyword);
    const regex = new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return escaped.replace(regex, '<mark class="handles-highlight">$1</mark>');
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private bindEvents(): void {
    if (!this.container) return;

    const list = this.container.querySelector('#handles-process-list');
    if (list) {
      // 句柄行右键 -> 共享 CSV 右键菜单
      attachSharedRowContextMenu(
        list as HTMLElement,
        () => this.contextMenuHost,
        { loadFileName: 'handles.csv', displayName: '句柄信息' },
        (target) => {
          const row = target.closest('.handles-row') as HTMLElement | null;
          if (!row) return null;
          const procEl = row.closest('.handles-process') as HTMLElement | null;
          if (!procEl) return null;
          const pid = parseInt(procEl.getAttribute('data-pid') || '0', 10);
          const idx = parseInt(row.getAttribute('data-handle-idx') || '-1', 10);
          const handles = this.cachedHandlesByPid.get(pid);
          if (!handles || idx < 0 || idx >= handles.length) return null;
          const proc = this.data?.processes.find(p => p.pid === pid);
          return { rowData: this.toRowData(handles[idx], pid, proc?.process_name || `PID ${pid}`) };
        }
      );

      list.addEventListener('click', (e) => {
        const header = (e.target as HTMLElement).closest('.handles-process-header');
        if (!header) return;
        const proc = header.closest('.handles-process') as HTMLElement;
        if (!proc) return;
        const pid = parseInt(proc.getAttribute('data-pid') || '0', 10);
        if (this.expandedPids.has(pid)) {
          this.expandedPids.delete(pid);
        } else {
          this.expandedPids.add(pid);
        }
        this.render();
        this.bindEvents();
      });
    }

    // 搜索
    const searchInput = this.container.querySelector('#handles-search-input') as HTMLInputElement;
    if (searchInput) {
      let debounceTimer: number | null = null;
      searchInput.addEventListener('input', () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = window.setTimeout(() => {
          this.searchKeyword = searchInput.value;
          this.render();
          this.bindEvents();
          const newInput = this.container?.querySelector('#handles-search-input') as HTMLInputElement;
          if (newInput) {
            newInput.focus();
            newInput.setSelectionRange(newInput.value.length, newInput.value.length);
          }
        }, 300);
      });
    }

    // 类型筛选
    const typeBtns = this.container.querySelectorAll('.handles-type-btn');
    typeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeTypeFilter = btn.getAttribute('data-type') || '';
        this.render();
        this.bindEvents();
      });
    });
  }

  cleanup(): void {
    this.data = null;
    this.expandedPids.clear();
    this.searchKeyword = '';
    this.activeTypeFilter = '';
    this.selectedPid = null;
    this.error = null;
  }
}
