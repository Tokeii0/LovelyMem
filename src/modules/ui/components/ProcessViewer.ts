/**
 * 进程详情分析视图组件
 * 进程树 + 进程卡片，支持搜索/筛选，点击弹出详情模态框
 */

import { invoke } from '@tauri-apps/api/core';
import { loadAppSettings } from '../../core/settingsHelper';
import { RowContextMenuHost, attachSharedRowContextMenu } from './rowContextMenuShared';

interface ProcessEntry {
  pid: number;
  ppid: number;
  state: string;
  short_name: string;
  name: string;
  integrity: string;
  user: string;
  create_time: string;
  exit_time: string;
  wow64: boolean;
  eprocess: string;
  peb: string;
  dtb: string;
  user_path: string;
  kernel_path: string;
  command_line: string;
  flag: string;
}

interface ProcessTreeNode {
  process: ProcessEntry;
  children: ProcessTreeNode[];
  depth: number;
}

interface ProcessStats {
  total: number;
  active: number;
  exited: number;
  wow64_count: number;
  user_dist: Record<string, number>;
  integrity_dist: Record<string, number>;
}

interface ProcessResult {
  tree: ProcessTreeNode[];
  flat: ProcessEntry[];
  stats: ProcessStats;
}

const INTEGRITY_COLORS: Record<string, string> = {
  'System': '#dc2626',
  'High': '#ea580c',
  'Medium': '#2563eb',
  'Low': '#16a34a',
  'Untrusted': '#64748b',
};

export class ProcessViewer {
  private container: HTMLElement | null = null;
  private data: ProcessResult | null = null;
  private isLoading = false;
  private error: string | null = null;
  private searchKeyword = '';
  private userFilter = '';
  private collapsedPids: Set<number> = new Set();
  private contextMenuHost: RowContextMenuHost | null = null;

  setContextMenuHost(host: RowContextMenuHost | null): void {
    this.contextMenuHost = host;
  }

  private toRowData(p: ProcessEntry): Record<string, string> {
    return {
      PID: String(p.pid),
      PPID: String(p.ppid),
      State: p.state,
      Name: p.short_name || p.name,
      FullName: p.name,
      Integrity: p.integrity,
      User: p.user,
      CreateTime: p.create_time,
      ExitTime: p.exit_time,
      Wow64: p.wow64 ? '1' : '0',
      EPROCESS: p.eprocess,
      PEB: p.peb,
      DTB: p.dtb,
      UserPath: p.user_path,
      KernelPath: p.kernel_path,
      CommandLine: p.command_line,
      Flag: p.flag,
    };
  }

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
      const result = await invoke('parse_process_csv', {
        csvFilePath: `${outputPath}\\\\${csvFile}`,
      }) as ProcessResult;
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
      this.container.innerHTML = `<div class="proc-loading"><div class="svc-spinner"></div><div>正在解析进程数据...</div></div>`;
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
    const users = Object.keys(s.user_dist).sort();
    const kw = this.searchKeyword.toLowerCase();

    this.container.innerHTML = `
      <div class="proc-wrapper">
        <div class="svc-stats-bar">
          <span class="svc-stat"><span class="svc-stat-v">${s.total}</span> 进程</span>
          <span class="svc-stat" style="color:#16a34a"><span class="svc-stat-v">${s.active}</span> 活跃</span>
          <span class="svc-stat" style="color:#94a3b8"><span class="svc-stat-v">${s.exited}</span> 已退出</span>
          ${s.wow64_count > 0 ? `<span class="svc-stat" style="color:#d97706"><span class="svc-stat-v">${s.wow64_count}</span> WoW64</span>` : ''}
          <span class="svc-stat-sep"></span>
          ${Object.entries(s.integrity_dist).map(([k, v]) => `<span class="svc-stat" style="color:${INTEGRITY_COLORS[k] || '#64748b'}"><span class="svc-stat-v">${v}</span> ${k}</span>`).join('')}
        </div>

        <div class="svc-toolbar">
          <input type="text" class="svc-search" id="proc-search" placeholder="搜索进程名、PID、命令行、路径..." value="${this.esc(this.searchKeyword)}">
          ${users.length > 1 ? `
          <div class="svc-filters">
            <button class="svc-fbtn ${this.userFilter === '' ? 'active' : ''}" data-user="">全部用户</button>
            ${users.map(u => `<button class="svc-fbtn ${this.userFilter === u ? 'active' : ''}" data-user="${this.esc(u)}">${this.esc(u)} (${s.user_dist[u]})</button>`).join('')}
          </div>
          ` : ''}
        </div>

        <div class="proc-tree" id="proc-tree">
          ${kw || this.userFilter ? this.renderFlatFiltered() : this.renderTree(this.data.tree)}
        </div>
      </div>
    `;
  }

  private renderTree(nodes: ProcessTreeNode[]): string {
    return nodes.map(node => this.renderTreeNode(node)).join('');
  }

  private renderTreeNode(node: ProcessTreeNode): string {
    const p = node.process;
    const hasChildren = node.children.length > 0;
    const isCollapsed = this.collapsedPids.has(p.pid);
    const isExited = !!p.exit_time;
    const intColor = INTEGRITY_COLORS[p.integrity] || '#64748b';
    const indent = node.depth * 20;
    const path = p.user_path || p.kernel_path || '';
    const cmdShort = p.command_line ? (p.command_line.length > 80 ? p.command_line.substring(0, 77) + '...' : p.command_line) : '';

    return `
      <div class="proc-node" data-pid="${p.pid}">
        <div class="proc-row proc-row-rich ${isExited ? 'proc-exited' : ''}" style="padding-left:${indent + 8}px" data-detail-pid="${p.pid}">
          <div class="proc-row-main">
            ${hasChildren ? `<span class="proc-toggle" data-toggle-pid="${p.pid}">${isCollapsed ? '&#9654;' : '&#9660;'}</span>` : '<span class="proc-toggle-space"></span>'}
            <span class="proc-icon">${isExited ? '&#9675;' : '&#9679;'}</span>
            <span class="proc-name">${this.esc(p.short_name || p.name)}</span>
            <span class="proc-pid">PID ${p.pid}</span>
            ${p.ppid > 0 ? `<span class="proc-ppid">PPID ${p.ppid}</span>` : ''}
            ${p.integrity ? `<span class="proc-int-badge" style="color:${intColor};border-color:${intColor}30;background:${intColor}08">${p.integrity}</span>` : ''}
            ${p.user ? `<span class="proc-tag proc-tag-user">${this.esc(p.user)}</span>` : ''}
            ${p.wow64 ? '<span class="mod-wow64">W64</span>' : ''}
            <span class="proc-time">${p.create_time || ''}</span>
          </div>
          <div class="proc-row-sub">
            ${path ? `<span class="proc-path" title="${this.esc(path)}">${this.esc(path)}</span>` : ''}
            ${cmdShort ? `<span class="proc-cmd" title="${this.esc(p.command_line)}">${this.esc(cmdShort)}</span>` : ''}
            ${p.eprocess ? `<span class="proc-addr">EPROCESS ${p.eprocess}</span>` : ''}
          </div>
        </div>
        ${hasChildren && !isCollapsed ? `<div class="proc-children">${this.renderTree(node.children)}</div>` : ''}
      </div>
    `;
  }

  private renderFlatFiltered(): string {
    if (!this.data) return '';
    const kw = this.searchKeyword.toLowerCase();
    const filtered = this.data.flat.filter(p => {
      if (this.userFilter && p.user !== this.userFilter) return false;
      if (kw) {
        return p.name.toLowerCase().includes(kw) ||
               p.short_name.toLowerCase().includes(kw) ||
               p.pid.toString().includes(kw) ||
               p.command_line.toLowerCase().includes(kw) ||
               p.user_path.toLowerCase().includes(kw) ||
               p.user.toLowerCase().includes(kw);
      }
      return true;
    });

    if (filtered.length === 0) return '<div class="svc-empty">没有匹配的进程</div>';

    return filtered.map(p => {
      const isExited = !!p.exit_time;
      const intColor = INTEGRITY_COLORS[p.integrity] || '#64748b';
      const path = p.user_path || p.kernel_path || '';
      const cmdShort = p.command_line ? (p.command_line.length > 80 ? p.command_line.substring(0, 77) + '...' : p.command_line) : '';
      return `
        <div class="proc-row proc-row-rich ${isExited ? 'proc-exited' : ''}" style="padding-left:8px" data-detail-pid="${p.pid}">
          <div class="proc-row-main">
            <span class="proc-toggle-space"></span>
            <span class="proc-icon">${isExited ? '&#9675;' : '&#9679;'}</span>
            <span class="proc-name">${this.highlight(p.short_name || p.name)}</span>
            <span class="proc-pid">PID ${p.pid}</span>
            <span class="proc-ppid">PPID ${p.ppid}</span>
            ${p.integrity ? `<span class="proc-int-badge" style="color:${intColor};border-color:${intColor}30;background:${intColor}08">${p.integrity}</span>` : ''}
            ${p.user ? `<span class="proc-tag proc-tag-user">${this.esc(p.user)}</span>` : ''}
            ${p.wow64 ? '<span class="mod-wow64">W64</span>' : ''}
            <span class="proc-time">${p.create_time || ''}</span>
          </div>
          <div class="proc-row-sub">
            ${path ? `<span class="proc-path" title="${this.esc(path)}">${this.highlight(path)}</span>` : ''}
            ${cmdShort ? `<span class="proc-cmd" title="${this.esc(p.command_line)}">${this.highlight(cmdShort)}</span>` : ''}
            ${p.eprocess ? `<span class="proc-addr">EPROCESS ${p.eprocess}</span>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  private showDetailModal(pid: number): void {
    if (!this.data) return;
    const p = this.data.flat.find(x => x.pid === pid);
    if (!p) return;

    document.querySelectorAll('.svc-modal-overlay').forEach(e => e.remove());
    const isExited = !!p.exit_time;
    const intColor = INTEGRITY_COLORS[p.integrity] || '#64748b';

    const overlay = document.createElement('div');
    overlay.className = 'svc-modal-overlay';
    overlay.innerHTML = `
      <div class="svc-modal" style="width:620px">
        <div class="svc-modal-header">
          <span class="proc-icon" style="font-size:14px">${isExited ? '&#9675;' : '&#9679;'}</span>
          <span class="svc-modal-title">${this.esc(p.short_name || p.name)}</span>
          ${p.integrity ? `<span class="svc-badge" style="color:${intColor};border-color:${intColor}30;background:${intColor}10">${p.integrity}</span>` : ''}
          ${p.wow64 ? '<span class="mod-wow64" style="font-size:11px;padding:1px 6px">WoW64</span>' : ''}
          <button class="svc-modal-close">&times;</button>
        </div>
        <table class="svc-modal-table">
          <tr><td class="svc-modal-label">进程名称</td><td>${this.esc(p.name)}</td></tr>
          <tr><td class="svc-modal-label">PID</td><td class="svc-modal-mono">${p.pid}</td></tr>
          <tr><td class="svc-modal-label">父进程 PPID</td><td class="svc-modal-mono">${p.ppid}</td></tr>
          <tr><td class="svc-modal-label">状态</td><td>${isExited ? '<span style="color:#94a3b8">已退出</span>' : '<span style="color:#16a34a">活跃</span>'}</td></tr>
          <tr><td class="svc-modal-label">完整性级别</td><td style="color:${intColor};font-weight:500">${this.esc(p.integrity || '-')}</td></tr>
          <tr><td class="svc-modal-label">运行用户</td><td>${this.esc(p.user || '-')}</td></tr>
          <tr><td class="svc-modal-label">创建时间</td><td>${this.esc(p.create_time || '-')}</td></tr>
          ${p.exit_time ? `<tr><td class="svc-modal-label">退出时间</td><td>${this.esc(p.exit_time)}</td></tr>` : ''}
          <tr><td class="svc-modal-label">WoW64</td><td>${p.wow64 ? '是 (32位进程)' : '否'}</td></tr>
          <tr><td class="svc-modal-label">用户路径</td><td class="svc-modal-mono svc-modal-path">${this.esc(p.user_path || '-')}</td></tr>
          <tr><td class="svc-modal-label">内核路径</td><td class="svc-modal-mono svc-modal-path">${this.esc(p.kernel_path || '-')}</td></tr>
          <tr><td class="svc-modal-label">命令行</td><td class="svc-modal-mono svc-modal-path">${this.esc(p.command_line || '-')}</td></tr>
          <tr><td class="svc-modal-label">EPROCESS</td><td class="svc-modal-mono">${this.esc(p.eprocess || '-')}</td></tr>
          <tr><td class="svc-modal-label">PEB</td><td class="svc-modal-mono">${this.esc(p.peb || '-')}</td></tr>
          <tr><td class="svc-modal-label">DTB</td><td class="svc-modal-mono">${this.esc(p.dtb || '-')}</td></tr>
          <tr><td class="svc-modal-label">标志</td><td>${this.esc(p.flag || '-')}</td></tr>
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

  private highlight(text: string): string {
    const e = this.esc(text);
    if (!this.searchKeyword) return e;
    const kw = this.esc(this.searchKeyword);
    return e.replace(new RegExp(`(${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<mark class="svc-hl">$1</mark>');
  }

  private esc(t: string): string { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

  private bindEvents(): void {
    if (!this.container) return;

    const tree = this.container.querySelector('#proc-tree');
    if (tree) {
      // 进程行右键 -> 共享 CSV 右键菜单（进程视图与 process.csv 表格视图完全一致）
      attachSharedRowContextMenu(
        tree as HTMLElement,
        () => this.contextMenuHost,
        { loadFileName: 'process.csv', displayName: '进程信息' },
        (target) => {
          const row = target.closest('.proc-row[data-detail-pid]') as HTMLElement | null;
          if (!row) return null;
          const pid = parseInt(row.getAttribute('data-detail-pid') || '0', 10);
          const p = this.data?.flat.find(x => x.pid === pid);
          if (!p) return null;
          return { rowData: this.toRowData(p) };
        }
      );

      tree.addEventListener('click', (e) => {
        // 展开/折叠
        const toggle = (e.target as HTMLElement).closest('[data-toggle-pid]') as HTMLElement;
        if (toggle) {
          const pid = parseInt(toggle.getAttribute('data-toggle-pid') || '0', 10);
          if (this.collapsedPids.has(pid)) this.collapsedPids.delete(pid);
          else this.collapsedPids.add(pid);
          this.render(); this.bindEvents();
          return;
        }

        // 点击行 -> 详情
        const row = (e.target as HTMLElement).closest('.proc-row[data-detail-pid]') as HTMLElement;
        if (row) {
          const pid = parseInt(row.getAttribute('data-detail-pid') || '0', 10);
          this.showDetailModal(pid);
        }
      });
    }

    const input = this.container.querySelector('#proc-search') as HTMLInputElement;
    if (input) {
      let timer: number | null = null;
      input.addEventListener('input', () => {
        if (timer) clearTimeout(timer);
        timer = window.setTimeout(() => {
          this.searchKeyword = input.value;
          this.render(); this.bindEvents();
          const ni = this.container?.querySelector('#proc-search') as HTMLInputElement;
          if (ni) { ni.focus(); ni.setSelectionRange(ni.value.length, ni.value.length); }
        }, 300);
      });
    }

    this.container.querySelectorAll('.svc-fbtn[data-user]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.userFilter = btn.getAttribute('data-user') || '';
        this.render(); this.bindEvents();
      });
    });
  }

  cleanup(): void {
    this.data = null;
    this.collapsedPids.clear();
    this.searchKeyword = '';
    this.userFilter = '';
    this.error = null;
    document.querySelectorAll('.svc-modal-overlay').forEach(e => e.remove());
  }
}
