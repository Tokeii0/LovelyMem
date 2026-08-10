/**
 * 模块信息分析视图组件
 * 按进程分组的模块折叠列表，点击模块行弹出详情模态框
 */

import { invoke } from '@tauri-apps/api/core';
import { loadAppSettings } from '../../core/settingsHelper';
import { RowContextMenuHost, attachSharedRowContextMenu } from './rowContextMenuShared';

interface ModuleEntry {
  name: string;
  wow64: boolean;
  size: string;
  start_addr: string;
  end_addr: string;
  imports: number;
  exports: number;
  sections: number;
  path: string;
  company: string;
  description: string;
  file_version: string;
  product_name: string;
}

interface ProcessModules {
  pid: number;
  process_name: string;
  modules: ModuleEntry[];
  total_modules: number;
  total_size: number;
}

interface ModulesStats {
  total_processes: number;
  total_modules: number;
  wow64_count: number;
  company_dist: Record<string, number>;
  top_companies: string[];
}

interface ModulesResult {
  processes: ProcessModules[];
  stats: ModulesStats;
}

function formatSize(sizeStr: string): string {
  let bytes = 0;
  if (sizeStr.startsWith('0x')) {
    bytes = parseInt(sizeStr, 16) || 0;
  } else {
    bytes = parseInt(sizeStr, 10) || 0;
  }
  if (bytes === 0) return '0';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatSizeNum(bytes: number): string {
  if (bytes === 0) return '0';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export class ModulesViewer {
  private container: HTMLElement | null = null;
  private data: ModulesResult | null = null;
  private isLoading = false;
  private error: string | null = null;
  private searchKeyword = '';
  private expandedPids: Set<number> = new Set();
  private companyFilter = '';
  // 缓存过滤后的每个进程的模块列表，用于模态框索引
  private cachedFilteredModules: Map<number, ModuleEntry[]> = new Map();
  private contextMenuHost: RowContextMenuHost | null = null;

  setContextMenuHost(host: RowContextMenuHost | null): void {
    this.contextMenuHost = host;
  }

  private toRowData(m: ModuleEntry, pid: number): Record<string, string> {
    return {
      PID: String(pid),
      Name: m.name,
      Wow64: m.wow64 ? '1' : '0',
      Size: m.size,
      StartAddr: m.start_addr,
      EndAddr: m.end_addr,
      Imports: String(m.imports),
      Exports: String(m.exports),
      Sections: String(m.sections),
      Path: m.path,
      Company: m.company,
      Description: m.description,
      FileVersion: m.file_version,
      ProductName: m.product_name,
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
      const result = await invoke('parse_modules_csv', {
        csvFilePath: `${outputPath}\\\\${csvFile}`,
      }) as ModulesResult;
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
      this.container.innerHTML = `<div class="mod-loading"><div class="mod-spinner"></div><div>正在解析模块数据...</div></div>`;
      return;
    }
    if (this.error) {
      this.container.innerHTML = `<div class="mod-error">${this.esc(this.error)}</div>`;
      return;
    }
    if (!this.data) {
      this.container.innerHTML = `<div class="mod-empty">暂无数据</div>`;
      return;
    }

    const s = this.data.stats;
    const filtered = this.getFiltered();
    const topC = s.top_companies.slice(0, 8);

    this.container.innerHTML = `
      <div class="mod-wrapper">
        <div class="mod-stats-bar">
          <span class="mod-stat"><span class="mod-stat-v">${s.total_processes}</span> 进程</span>
          <span class="mod-stat"><span class="mod-stat-v">${s.total_modules.toLocaleString()}</span> 模块</span>
          ${s.wow64_count > 0 ? `<span class="mod-stat" style="color:#d97706"><span class="mod-stat-v">${s.wow64_count}</span> WoW64</span>` : ''}
          <span class="mod-stat-sep"></span>
          ${topC.slice(0, 3).map(c => `<span class="mod-stat" style="color:#64748b">${this.esc(c)}: ${s.company_dist[c]}</span>`).join('')}
        </div>

        <div class="mod-toolbar">
          <input type="text" class="mod-search" id="mod-search" placeholder="搜索模块名、路径、公司名..." value="${this.esc(this.searchKeyword)}">
          <div class="mod-company-filters">
            <button class="mod-cbtn ${this.companyFilter === '' ? 'active' : ''}" data-company="">全部</button>
            ${topC.map(c => `<button class="mod-cbtn ${this.companyFilter === c ? 'active' : ''}" data-company="${this.esc(c)}">${this.esc(c.length > 16 ? c.substring(0, 14) + '..' : c)}</button>`).join('')}
          </div>
        </div>

        <div class="mod-list" id="mod-list">
          ${filtered.length === 0 ? '<div class="mod-empty">没有匹配的结果</div>' :
            filtered.map(proc => this.renderProcess(proc)).join('')}
        </div>
      </div>
    `;
  }

  private getFilteredModules(proc: ProcessModules): ModuleEntry[] {
    const kw = this.searchKeyword.toLowerCase();
    let mods = proc.modules;
    if (this.companyFilter) {
      mods = mods.filter(m => m.company === this.companyFilter);
    }
    if (kw) {
      mods = mods.filter(m =>
        m.name.toLowerCase().includes(kw) ||
        m.path.toLowerCase().includes(kw) ||
        m.company.toLowerCase().includes(kw) ||
        m.description.toLowerCase().includes(kw));
    }
    return mods;
  }

  private renderProcess(proc: ProcessModules): string {
    const isExpanded = this.expandedPids.has(proc.pid);
    const kw = this.searchKeyword.toLowerCase();
    const mods = this.getFilteredModules(proc);

    // 缓存过滤后的模块用于点击索引
    this.cachedFilteredModules.set(proc.pid, mods);

    const rows = isExpanded ? mods.map((m, i) => `
      <tr class="mod-row mod-row-clickable" data-mod-pid="${proc.pid}" data-mod-idx="${i}" title="点击查看详情">
        <td class="mod-cell-name">${this.highlight(m.name)}${m.wow64 ? ' <span class="mod-wow64">W64</span>' : ''}</td>
        <td class="mod-cell-size">${formatSize(m.size)}</td>
        <td class="mod-cell-addr">${m.start_addr}</td>
        <td class="mod-cell-imp">${m.imports > 0 ? m.imports : ''}</td>
        <td class="mod-cell-exp">${m.exports > 0 ? m.exports : ''}</td>
        <td class="mod-cell-company">${this.highlight(m.company)}</td>
        <td class="mod-cell-desc">${this.highlight(m.description)}</td>
      </tr>
    `).join('') : '';

    return `
      <div class="mod-process ${isExpanded ? 'expanded' : ''}" data-pid="${proc.pid}">
        <div class="mod-process-header">
          <span class="mod-arrow">${isExpanded ? '&#9660;' : '&#9654;'}</span>
          <span class="mod-pid">PID ${proc.pid}</span>
          <span class="mod-pname">${this.esc(proc.process_name)}</span>
          <span class="mod-pcount">${this.companyFilter || kw ? mods.length + '/' : ''}${proc.total_modules} 个模块</span>
          <span class="mod-psize">${formatSizeNum(proc.total_size)}</span>
        </div>
        ${isExpanded ? `
        <div class="mod-detail">
          <table class="mod-table">
            <thead>
              <tr>
                <th style="min-width:140px">模块名</th>
                <th style="width:70px">大小</th>
                <th style="width:130px">基址</th>
                <th style="width:50px">导入</th>
                <th style="width:50px">导出</th>
                <th style="min-width:100px">公司</th>
                <th>描述</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          ${mods.length === 0 ? '<div class="mod-empty" style="padding:16px">没有匹配的模块</div>' : ''}
        </div>
        ` : ''}
      </div>
    `;
  }

  private showModuleDetail(mod: ModuleEntry, pid: number, procName: string): void {
    // 移除已有的模态框
    document.querySelectorAll('.svc-modal-overlay').forEach(e => e.remove());

    const sizeBytes = mod.size.startsWith('0x') ? parseInt(mod.size, 16) || 0 : parseInt(mod.size, 10) || 0;

    const overlay = document.createElement('div');
    overlay.className = 'svc-modal-overlay';
    overlay.innerHTML = `
      <div class="svc-modal">
        <div class="svc-modal-header">
          <span class="svc-modal-title">${this.esc(mod.name)}</span>
          ${mod.wow64 ? '<span class="mod-wow64" style="font-size:11px;padding:1px 6px">WoW64</span>' : ''}
          <button class="svc-modal-close">&times;</button>
        </div>
        ${mod.description ? `<div class="svc-modal-subtitle">${this.esc(mod.description)}</div>` : ''}
        <table class="svc-modal-table">
          <tr><td class="svc-modal-label">模块名称</td><td>${this.esc(mod.name)}</td></tr>
          <tr><td class="svc-modal-label">所属进程</td><td>${this.esc(procName)} (PID ${pid})</td></tr>
          <tr><td class="svc-modal-label">完整路径</td><td class="svc-modal-mono svc-modal-path">${this.esc(mod.path || '-')}</td></tr>
          <tr><td class="svc-modal-label">模块大小</td><td class="svc-modal-mono">${formatSize(mod.size)} (${mod.size}${sizeBytes > 0 ? ' = ' + sizeBytes.toLocaleString() + ' bytes' : ''})</td></tr>
          <tr><td class="svc-modal-label">基址范围</td><td class="svc-modal-mono">${mod.start_addr} - ${mod.end_addr}</td></tr>
          <tr><td class="svc-modal-label">WoW64</td><td>${mod.wow64 ? '是 (32位模块运行在64位系统)' : '否'}</td></tr>
          <tr><td class="svc-modal-label">节区数</td><td>${mod.sections}</td></tr>
          <tr><td class="svc-modal-label">导入函数数</td><td>${mod.imports}</td></tr>
          <tr><td class="svc-modal-label">导出函数数</td><td>${mod.exports}</td></tr>
          <tr><td class="svc-modal-label">公司名称</td><td>${this.esc(mod.company || '-')}</td></tr>
          <tr><td class="svc-modal-label">文件描述</td><td>${this.esc(mod.description || '-')}</td></tr>
          <tr><td class="svc-modal-label">文件版本</td><td>${this.esc(mod.file_version || '-')}</td></tr>
          <tr><td class="svc-modal-label">产品名称</td><td>${this.esc(mod.product_name || '-')}</td></tr>
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

  private getFiltered(): ProcessModules[] {
    if (!this.data) return [];
    const kw = this.searchKeyword.toLowerCase();

    return this.data.processes.filter(proc => {
      if (this.companyFilter) {
        if (!proc.modules.some(m => m.company === this.companyFilter)) return false;
      }
      if (kw) {
        const matchesPid = proc.pid.toString().includes(kw);
        const matchesName = proc.process_name.toLowerCase().includes(kw);
        const matchesMod = proc.modules.some(m =>
          m.name.toLowerCase().includes(kw) ||
          m.path.toLowerCase().includes(kw) ||
          m.company.toLowerCase().includes(kw) ||
          m.description.toLowerCase().includes(kw));
        return matchesPid || matchesName || matchesMod;
      }
      return true;
    });
  }

  private highlight(text: string): string {
    const e = this.esc(text);
    if (!this.searchKeyword) return e;
    const kw = this.esc(this.searchKeyword);
    return e.replace(new RegExp(`(${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<mark class="mod-hl">$1</mark>');
  }

  private esc(t: string): string { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

  private bindEvents(): void {
    if (!this.container) return;

    const list = this.container.querySelector('#mod-list');
    if (list) {
      // 模块行右键 -> 共享 CSV 右键菜单
      attachSharedRowContextMenu(
        list as HTMLElement,
        () => this.contextMenuHost,
        { loadFileName: 'modules.csv', displayName: '模块信息' },
        (target) => {
          const row = target.closest('.mod-row-clickable') as HTMLElement | null;
          if (!row) return null;
          const pid = parseInt(row.getAttribute('data-mod-pid') || '0', 10);
          const idx = parseInt(row.getAttribute('data-mod-idx') || '-1', 10);
          const mods = this.cachedFilteredModules.get(pid);
          if (!mods || idx < 0 || idx >= mods.length) return null;
          return { rowData: this.toRowData(mods[idx], pid) };
        }
      );

      list.addEventListener('click', (e) => {
        // 模块行点击 -> 弹出详情
        const row = (e.target as HTMLElement).closest('.mod-row-clickable') as HTMLElement;
        if (row) {
          const pid = parseInt(row.getAttribute('data-mod-pid') || '0', 10);
          const idx = parseInt(row.getAttribute('data-mod-idx') || '-1', 10);
          const mods = this.cachedFilteredModules.get(pid);
          if (mods && idx >= 0 && idx < mods.length) {
            // 找进程名
            const proc = this.data?.processes.find(p => p.pid === pid);
            this.showModuleDetail(mods[idx], pid, proc?.process_name || `PID ${pid}`);
          }
          return; // 不触发展开/折叠
        }

        // 进程头点击 -> 展开/折叠
        const h = (e.target as HTMLElement).closest('.mod-process-header');
        if (!h) return;
        const p = h.closest('.mod-process') as HTMLElement;
        if (!p) return;
        const pid = parseInt(p.getAttribute('data-pid') || '0', 10);
        if (this.expandedPids.has(pid)) this.expandedPids.delete(pid);
        else this.expandedPids.add(pid);
        this.render();
        this.bindEvents();
      });
    }

    const input = this.container.querySelector('#mod-search') as HTMLInputElement;
    if (input) {
      let timer: number | null = null;
      input.addEventListener('input', () => {
        if (timer) clearTimeout(timer);
        timer = window.setTimeout(() => {
          this.searchKeyword = input.value;
          this.render(); this.bindEvents();
          const ni = this.container?.querySelector('#mod-search') as HTMLInputElement;
          if (ni) { ni.focus(); ni.setSelectionRange(ni.value.length, ni.value.length); }
        }, 300);
      });
    }

    this.container.querySelectorAll('.mod-cbtn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.companyFilter = btn.getAttribute('data-company') || '';
        this.render(); this.bindEvents();
      });
    });
  }

  cleanup(): void {
    this.data = null;
    this.expandedPids.clear();
    this.cachedFilteredModules.clear();
    this.searchKeyword = '';
    this.companyFilter = '';
    this.error = null;
    document.querySelectorAll('.svc-modal-overlay').forEach(e => e.remove());
  }
}
