import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { showConfirm } from '../core/confirmDialog';
import { withButtonLoading } from '../utils/buttonLoading';
import { registerChildWindowShortcuts } from '../core/childWindowShortcuts';
import { friendlyError } from '../utils/errorMessage';

interface SymbolEntry {
  pdb_name: string;
  guid: string;
  age: string;
  file_size: number;
  modified_time: string;
  full_path: string;
  entry_dir: string;
  system_version: string | null;
  category: string;
  machine: string | null;
}

interface VersionIndexInfo {
  last_synced: string | null;
  entry_count: number;
}

interface PdbDetails {
  machine: string;
  guid: string;
  age: string;
  public_symbol_count: number;
  global_symbol_count: number;
  module_count: number;
  source_file_count: number;
  parse_warnings: string[];
}

const SVG_BASE = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
const ICON_FOLDER_OPEN = `<svg ${SVG_BASE}><path d="M4 19a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v2"/><path d="M2 19l3-7h17l-3 7z"/></svg>`;
const ICON_TRASH = `<svg ${SVG_BASE}><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>`;
const ICON_INFO = `<svg ${SVG_BASE}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><circle cx="12" cy="8" r="0.8" fill="currentColor"/></svg>`;
const ICON_CLOSE = `<svg ${SVG_BASE}><path d="M18 6L6 18M6 6l12 12"/></svg>`;
const ICON_CHEVRON_LEFT = `<svg ${SVG_BASE}><path d="M15 18l-6-6 6-6"/></svg>`;
const ICON_CHEVRON_RIGHT = `<svg ${SVG_BASE}><path d="M9 18l6-6-6-6"/></svg>`;

interface SymbolManagerInfo {
  configured: boolean;
  memprocfs_path: string;
  symbols_dir: string;
  exists: boolean;
  total_count: number;
  total_size: number;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatSize(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

export class SymbolManagerWindow {
  private allEntries: SymbolEntry[] = [];
  private filteredEntries: SymbolEntry[] = [];
  private currentInfo: SymbolManagerInfo | null = null;
  private pageSize: number = 50;
  private currentPage: number = 1;
  private kviUnlisten: UnlistenFn | null = null;
  private syncing: boolean = false;

  constructor() {
    this.init();
  }

  private async init(): Promise<void> {
    await this.loadTheme();
    this.bindEvents();
    registerChildWindowShortcuts(); // Ctrl+W 关闭窗口（独立工具窗口）
    await this.subscribeSyncEvents();
    await this.refresh();
    await this.refreshVersionIndexInfo();
  }

  private async subscribeSyncEvents(): Promise<void> {
    this.kviUnlisten = await listen<{ stage: string; file?: string; current?: number; total?: number; entry_count?: number; size?: number }>(
      'kernel_version_sync_progress',
      (ev) => {
        const p = ev.payload;
        const el = document.getElementById('kviProgress');
        if (!el) return;
        el.classList.remove('hidden');
        if (p.stage === 'downloading') {
          el.textContent = `下载中 (${p.current}/${p.total})：${p.file ?? ''}`;
        } else if (p.stage === 'parsing') {
          const sizeKb = p.size ? ` · ${(p.size / 1024).toFixed(0)} KB` : '';
          el.textContent = `解析中 (${p.current}/${p.total})：${p.file ?? ''}${sizeKb}`;
        } else if (p.stage === 'done') {
          el.textContent = `同步完成：${p.entry_count?.toLocaleString() ?? 0} 条`;
          setTimeout(() => el.classList.add('hidden'), 4000);
        }
      }
    );
  }

  private async refreshVersionIndexInfo(): Promise<void> {
    try {
      const info = await invoke<VersionIndexInfo>('get_kernel_version_index_info');
      const c = document.getElementById('kviCount');
      const t = document.getElementById('kviTime');
      if (c) c.textContent = info.entry_count.toLocaleString();
      if (t) t.textContent = info.last_synced ?? '未同步';
    } catch {
      /* ignore */
    }
  }

  private async syncVersionIndex(): Promise<void> {
    if (this.syncing) return;
    this.syncing = true;
    const btn = document.getElementById('syncKviBtn') as HTMLButtonElement | null;
    this.hideError();
    try {
      await withButtonLoading(btn, async () => {
        await invoke<VersionIndexInfo>('sync_kernel_version_index');
        await this.refreshVersionIndexInfo();
        // 重新拉取符号列表，触发后端用最新索引重算 system_version
        await this.refresh();
      }, { loadingText: '同步中…' });
    } catch (err) {
      this.showError(`同步失败：${friendlyError(err).message}`);
    } finally {
      this.syncing = false;
    }
  }

  private async loadTheme(): Promise<void> {
    try {
      const settings = await invoke<{ theme?: string }>('get_app_settings').catch(() => ({}));
      const theme = (settings as any)?.theme ?? 'light';
      document.documentElement.setAttribute('data-theme', theme);
    } catch {
      document.documentElement.setAttribute('data-theme', 'light');
    }
  }

  private bindEvents(): void {
    document.getElementById('refreshBtn')?.addEventListener('click', () => this.refresh());
    document.getElementById('openFolderBtn')?.addEventListener('click', () => this.openFolder());
    document.getElementById('syncKviBtn')?.addEventListener('click', () => this.syncVersionIndex());

    document.getElementById('filterCategory')?.addEventListener('change', () => this.applyFilter());
    document.getElementById('filterKeyword')?.addEventListener('input', () => this.applyFilter());

    const pageSizeEl = document.getElementById('pageSize') as HTMLSelectElement | null;
    pageSizeEl?.addEventListener('change', () => {
      this.pageSize = parseInt(pageSizeEl.value, 10) || 50;
      this.currentPage = 1;
      this.renderPage();
    });
    document.getElementById('prevPageBtn')?.addEventListener('click', () => {
      if (this.currentPage > 1) {
        this.currentPage--;
        this.renderPage();
      }
    });
    document.getElementById('nextPageBtn')?.addEventListener('click', () => {
      const total = this.totalPages();
      if (this.currentPage < total) {
        this.currentPage++;
        this.renderPage();
      }
    });
    document.getElementById('jumpPageInput')?.addEventListener('change', (ev) => {
      const v = parseInt((ev.target as HTMLInputElement).value, 10);
      if (!isNaN(v)) {
        this.currentPage = Math.max(1, Math.min(this.totalPages(), v));
        this.renderPage();
      }
    });

    document.querySelector('.sym-mgr-minimize-btn')?.addEventListener('click', () => this.minimize());
    document.querySelector('.sym-mgr-maximize-btn')?.addEventListener('click', () => this.toggleMaximize());
    document.querySelector('.sym-mgr-close-btn')?.addEventListener('click', () => this.close());
  }

  private async refresh(): Promise<void> {
    this.hideError();
    try {
      const info = await invoke<SymbolManagerInfo>('get_symbol_manager_info');
      this.currentInfo = info;
      this.renderInfo(info);

      if (!info.configured) {
        this.showError('MemProcFS 路径未配置，请先在主程序「应用设置」中配置 MemProcFS 路径');
        this.allEntries = [];
        this.applyFilter();
        return;
      }
      if (!info.exists) {
        this.showError(`Symbols 目录不存在：${info.symbols_dir}\n通常会在 MemProcFS 首次解析镜像时自动创建`);
        this.allEntries = [];
        this.applyFilter();
        return;
      }

      const entries = await invoke<SymbolEntry[]>('list_memprocfs_symbols');
      this.allEntries = entries;
      this.applyFilter();
    } catch (err) {
      this.showError(String(err));
      this.allEntries = [];
      this.applyFilter();
    }
  }

  private renderInfo(info: SymbolManagerInfo): void {
    const memEl = document.getElementById('memprocfsPath');
    const dirEl = document.getElementById('symbolsDir');
    const statusEl = document.getElementById('symbolsStatus');
    const totalCountEl = document.getElementById('totalCount');
    const totalSizeEl = document.getElementById('totalSize');

    if (memEl) {
      memEl.textContent = info.memprocfs_path || '(未配置)';
      memEl.setAttribute('title', info.memprocfs_path || '');
    }
    if (dirEl) {
      dirEl.textContent = info.symbols_dir || '-';
      dirEl.setAttribute('title', info.symbols_dir || '');
    }
    if (statusEl) {
      if (!info.configured) {
        statusEl.textContent = '未配置';
        statusEl.className = 'info-value status-warn';
      } else if (!info.exists) {
        statusEl.textContent = '目录不存在';
        statusEl.className = 'info-value status-warn';
      } else {
        statusEl.textContent = '已就绪';
        statusEl.className = 'info-value status-ok';
      }
    }
    if (totalCountEl) totalCountEl.textContent = String(info.total_count);
    if (totalSizeEl) totalSizeEl.textContent = formatSize(info.total_size);
  }

  private applyFilter(): void {
    const cat = (document.getElementById('filterCategory') as HTMLSelectElement | null)?.value ?? 'all';
    const kw = ((document.getElementById('filterKeyword') as HTMLInputElement | null)?.value ?? '')
      .trim()
      .toLowerCase();

    let list = this.allEntries;
    if (cat !== 'all') {
      list = list.filter((e) => e.category === cat);
    }
    if (kw) {
      list = list.filter(
        (e) =>
          e.pdb_name.toLowerCase().includes(kw) ||
          e.guid.toLowerCase().includes(kw) ||
          (e.system_version ?? '').toLowerCase().includes(kw)
      );
    }
    this.filteredEntries = list;
    this.currentPage = 1;
    this.renderPage();
  }

  private totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredEntries.length / this.pageSize));
  }

  private renderPage(): void {
    const total = this.filteredEntries.length;
    const totalPages = this.totalPages();
    if (this.currentPage > totalPages) this.currentPage = totalPages;
    const startIdx = (this.currentPage - 1) * this.pageSize;
    const endIdx = Math.min(total, startIdx + this.pageSize);
    const slice = this.filteredEntries.slice(startIdx, endIdx);
    this.renderTable(slice, startIdx);
    this.renderPagination(total, totalPages, startIdx, endIdx);
  }

  private renderPagination(total: number, totalPages: number, startIdx: number, endIdx: number): void {
    const info = document.getElementById('pageInfo');
    const jump = document.getElementById('jumpPageInput') as HTMLInputElement | null;
    const prev = document.getElementById('prevPageBtn') as HTMLButtonElement | null;
    const next = document.getElementById('nextPageBtn') as HTMLButtonElement | null;
    const bar = document.getElementById('paginationBar');

    if (info) {
      if (total === 0) {
        info.textContent = '0 / 0';
      } else {
        info.textContent = `${startIdx + 1}-${endIdx} / 共 ${total}（第 ${this.currentPage}/${totalPages} 页）`;
      }
    }
    if (jump) jump.value = String(this.currentPage);
    if (prev) prev.disabled = this.currentPage <= 1;
    if (next) next.disabled = this.currentPage >= totalPages;
    if (bar) bar.classList.toggle('hidden', total === 0);
  }

  private renderTable(list: SymbolEntry[], indexOffset: number = 0): void {
    const tbody = document.getElementById('symbolsTableBody');
    const emptyState = document.getElementById('emptyState');
    const wrapper = document.getElementById('tableWrapper');
    const visibleCount = document.getElementById('visibleCount');

    if (visibleCount) visibleCount.textContent = String(this.filteredEntries.length);
    if (!tbody) return;

    if (this.filteredEntries.length === 0) {
      tbody.innerHTML = '';
      if (wrapper) wrapper.classList.add('hidden');
      if (emptyState) emptyState.classList.remove('hidden');
      return;
    }
    if (wrapper) wrapper.classList.remove('hidden');
    if (emptyState) emptyState.classList.add('hidden');

    tbody.innerHTML = list
      .map((e, i) => {
        const ver = e.system_version
          ? `<span class="version-badge">${escapeHtml(e.system_version)}</span>`
          : '<span class="version-unknown">未知</span>';
        const catLabel =
          e.category === 'kernel'
            ? '<span class="cat-badge cat-kernel">Kernel</span>'
            : e.category === 'driver'
            ? '<span class="cat-badge cat-driver">Driver</span>'
            : '<span class="cat-badge cat-other">其他</span>';
        const archLabel = e.machine
          ? `<span class="arch-badge arch-${escapeHtml(e.machine.toLowerCase())}">${escapeHtml(e.machine)}</span>`
          : '<span class="arch-unknown">-</span>';
        return `
          <tr data-pdb="${escapeHtml(e.pdb_name)}" data-guid="${escapeHtml(e.guid)}" data-age="${escapeHtml(e.age)}">
            <td>${indexOffset + i + 1}</td>
            <td>${catLabel}</td>
            <td class="cell-pdb" title="${escapeHtml(e.full_path)}">${escapeHtml(e.pdb_name)}</td>
            <td>${archLabel}</td>
            <td class="cell-guid"><code>${escapeHtml(e.guid)}</code></td>
            <td><code>${escapeHtml(e.age)}</code></td>
            <td>${formatSize(e.file_size)}</td>
            <td>${escapeHtml(e.modified_time)}</td>
            <td>${ver}</td>
            <td>
              <button class="row-action-btn detail-entry" title="查看 PDB 详情">${ICON_INFO}</button>
              <button class="row-action-btn open-entry" title="打开目录">${ICON_FOLDER_OPEN}</button>
              <button class="row-action-btn delete-entry" title="删除">${ICON_TRASH}</button>
            </td>
          </tr>`;
      })
      .join('');

    tbody.querySelectorAll('button.open-entry').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        const tr = (ev.currentTarget as HTMLElement).closest('tr');
        if (!tr) return;
        const entry = this.findEntry(tr);
        if (entry) {
          invoke('open_path', { path: entry.entry_dir }).catch((e) =>
            this.showError(`打开目录失败：${e}`)
          );
        }
      });
    });
    tbody.querySelectorAll('button.delete-entry').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        const tr = (ev.currentTarget as HTMLElement).closest('tr');
        if (!tr) return;
        const entry = this.findEntry(tr);
        if (entry) this.deleteEntry(entry);
      });
    });
    tbody.querySelectorAll('button.detail-entry').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        const tr = (ev.currentTarget as HTMLElement).closest('tr');
        if (!tr) return;
        const entry = this.findEntry(tr);
        if (entry) this.showDetail(entry);
      });
    });
  }

  private async showDetail(entry: SymbolEntry): Promise<void> {
    const existing = document.querySelector('.pdb-detail-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.className = 'pdb-detail-modal';
    modal.innerHTML = `
      <div class="pdb-detail-mask"></div>
      <div class="pdb-detail-card">
        <div class="pdb-detail-header">
          <div class="pdb-detail-title">
            <span class="pdb-detail-name">${escapeHtml(entry.pdb_name)}</span>
            <span class="pdb-detail-sub"><code>${escapeHtml(entry.guid)}</code> · <code>${escapeHtml(entry.age)}</code></span>
          </div>
          <button class="pdb-detail-close" title="关闭">${ICON_CLOSE}</button>
        </div>
        <div class="pdb-detail-body">
          <div class="pdb-detail-loading">解析中…</div>
        </div>
      </div>
    `;
    document.getElementById('symbol-manager-app')?.appendChild(modal);

    const close = () => modal.remove();
    modal.querySelector('.pdb-detail-mask')?.addEventListener('click', close);
    modal.querySelector('.pdb-detail-close')?.addEventListener('click', close);

    try {
      const d = await invoke<PdbDetails>('get_pdb_details', {
        pdbName: entry.pdb_name,
        guid: entry.guid,
        age: entry.age,
      });
      this.renderDetailBody(modal, entry, d);
    } catch (err) {
      const body = modal.querySelector('.pdb-detail-body');
      if (body) {
        body.innerHTML = `<div class="pdb-detail-error">解析失败：${escapeHtml(friendlyError(err).message)}</div>`;
      }
    }
  }

  private renderDetailBody(modal: HTMLElement, _entry: SymbolEntry, d: PdbDetails): void {
    const body = modal.querySelector('.pdb-detail-body');
    if (!body) return;
    const warnHtml = d.parse_warnings.length
      ? `<details class="pdb-detail-warnings">
           <summary>解析警告 (${d.parse_warnings.length})</summary>
           <ul>${d.parse_warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul>
         </details>`
      : '';
    body.innerHTML = `
      <div class="pdb-detail-grid">
        <div class="pdb-detail-row"><span class="k">机器架构</span><span class="v"><span class="arch-badge arch-${escapeHtml(d.machine.toLowerCase())}">${escapeHtml(d.machine)}</span></span></div>
        <div class="pdb-detail-row"><span class="k">PDB 自带 GUID</span><span class="v"><code>${escapeHtml(d.guid)}</code></span></div>
        <div class="pdb-detail-row"><span class="k">PDB 自带 Age</span><span class="v"><code>${escapeHtml(d.age)}</code></span></div>
        <div class="pdb-detail-row"><span class="k">公共符号数</span><span class="v">${d.public_symbol_count.toLocaleString()}</span></div>
        <div class="pdb-detail-row"><span class="k">全局符号数</span><span class="v">${d.global_symbol_count.toLocaleString()}</span></div>
        <div class="pdb-detail-row"><span class="k">模块数</span><span class="v">${d.module_count.toLocaleString()}</span></div>
        <div class="pdb-detail-row"><span class="k">源文件数（去重）</span><span class="v">${d.source_file_count.toLocaleString()}</span></div>
      </div>
      ${warnHtml}
    `;
  }

  private findEntry(tr: Element): SymbolEntry | undefined {
    const pdb = tr.getAttribute('data-pdb') ?? '';
    const guid = tr.getAttribute('data-guid') ?? '';
    const age = tr.getAttribute('data-age') ?? '';
    return this.allEntries.find(
      (e) => e.pdb_name === pdb && e.guid === guid && e.age === age
    );
  }

  private async deleteEntry(entry: SymbolEntry): Promise<void> {
    const ok = await showConfirm({
      message: `确定要删除符号条目吗？<br><br>${entry.pdb_name}<br>GUID: ${entry.guid}<br>Age: ${entry.age}<br><br>该操作不可撤销。`,
      type: 'danger',
    });
    if (!ok) return;
    try {
      await invoke('delete_symbol_entry', {
        pdbName: entry.pdb_name,
        guid: entry.guid,
        age: entry.age,
      });
      await this.refresh();
    } catch (err) {
      this.showError(`删除失败：${friendlyError(err).message}`);
    }
  }

  private async openFolder(): Promise<void> {
    if (!this.currentInfo?.symbols_dir) {
      this.showError('Symbols 目录未知');
      return;
    }
    try {
      await invoke('open_path', { path: this.currentInfo.symbols_dir });
    } catch (err) {
      this.showError(`打开目录失败：${err}`);
    }
  }

  private showError(msg: string): void {
    const sec = document.getElementById('errorSection');
    const txt = document.getElementById('errorMessage');
    if (sec) sec.classList.remove('hidden');
    if (txt) txt.textContent = msg;
  }
  private hideError(): void {
    document.getElementById('errorSection')?.classList.add('hidden');
  }

  private async minimize(): Promise<void> {
    try {
      await getCurrentWindow().minimize();
    } catch (e) {
      console.error(e);
    }
  }
  private async toggleMaximize(): Promise<void> {
    try {
      const w = getCurrentWindow();
      if (await w.isMaximized()) await w.unmaximize();
      else await w.maximize();
    } catch (e) {
      console.error(e);
    }
  }
  private async close(): Promise<void> {
    try {
      await getCurrentWindow().close();
    } catch (e) {
      console.error(e);
    }
  }
}
