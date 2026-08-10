/**
 * Hex 查看器 - 独立窗口
 *
 * 按页（offset + length）从后端分块读取文件字节，避免大文件全量载入。
 * 文件路径与初始偏移通过 URL 查询参数 `?path=&offset=` 传入。
 */

import { invoke } from '@tauri-apps/api/core';
import { windowThemeAdapter } from '../ui/windowThemeAdapter';

interface HexChunk {
  offset: number;
  bytes: number[];
  total_size: number;
}

const PAGE_SIZE = 2048; // 每页字节数（128 行 × 16 字节）
const BYTES_PER_ROW = 16;

class HexViewer {
  private filePath = '';
  private totalSize = 0;
  private pageOffset = 0;

  async init(): Promise<void> {
    this.setupWindowControls();
    try {
      await windowThemeAdapter.init();
    } catch (err) {
      console.warn('[Hex查看器] 主题初始化失败:', err);
    }

    const params = new URLSearchParams(window.location.search);
    this.filePath = params.get('path') || '';
    const initOffset = parseInt(params.get('offset') || '0', 10);
    this.pageOffset = Number.isFinite(initOffset) ? Math.max(0, initOffset) : 0;
    // 对齐到行首
    this.pageOffset -= this.pageOffset % BYTES_PER_ROW;

    this.renderShell();
    if (this.filePath) {
      await this.loadPage(this.pageOffset);
    } else {
      this.setDump('<div class="hv-empty">未指定文件</div>');
    }
  }

  private setupWindowControls(): void {
    document.getElementById('minimizeBtn')?.addEventListener('click', () => invoke('minimize_window').catch(() => {}));
    document.getElementById('maximizeBtn')?.addEventListener('click', () => invoke('toggle_maximize').catch(() => {}));
    document.getElementById('closeBtn')?.addEventListener('click', () => invoke('close_window').catch(() => {}));
  }

  private renderShell(): void {
    const app = document.getElementById('hex-viewer-app');
    if (!app) return;
    const body = document.createElement('div');
    body.style.cssText = 'display:flex;flex-direction:column;flex:1;overflow:hidden;';
    body.innerHTML = `
      <div class="hv-toolbar">
        <span class="hv-file-path" id="hv-path">${this.filePath || '未选择文件'}</span>
        <button class="hv-btn" id="hv-prev">◀ 上一页</button>
        <button class="hv-btn" id="hv-next">下一页 ▶</button>
        <input class="hv-input" id="hv-goto" placeholder="跳转偏移 (0x.. 或十进制)">
        <button class="hv-btn primary" id="hv-goto-btn">跳转</button>
        <span class="hv-page-info" id="hv-info"></span>
      </div>
      <div class="hv-dump" id="hv-dump"><div class="hv-empty">加载中…</div></div>
    `;
    app.appendChild(body);

    document.getElementById('hv-prev')?.addEventListener('click', () => {
      this.loadPage(Math.max(0, this.pageOffset - PAGE_SIZE));
    });
    document.getElementById('hv-next')?.addEventListener('click', () => {
      if (this.pageOffset + PAGE_SIZE < this.totalSize) this.loadPage(this.pageOffset + PAGE_SIZE);
    });
    document.getElementById('hv-goto-btn')?.addEventListener('click', () => this.gotoInput());
    document.getElementById('hv-goto')?.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') this.gotoInput();
    });
  }

  private gotoInput(): void {
    const input = document.getElementById('hv-goto') as HTMLInputElement;
    const raw = (input?.value || '').trim();
    if (!raw) return;
    let off = raw.toLowerCase().startsWith('0x') ? parseInt(raw, 16) : parseInt(raw, 10);
    if (!Number.isFinite(off) || off < 0) return;
    off -= off % BYTES_PER_ROW;
    this.loadPage(off);
  }

  private setDump(html: string): void {
    const dump = document.getElementById('hv-dump');
    if (dump) dump.innerHTML = html;
  }

  private async loadPage(offset: number): Promise<void> {
    if (!this.filePath) return;
    try {
      const chunk = await invoke<HexChunk>('read_file_bytes_range', {
        filePath: this.filePath,
        offset,
        length: PAGE_SIZE,
      });
      this.totalSize = chunk.total_size;
      this.pageOffset = chunk.offset;
      this.renderDump(chunk);
      this.updateNav();
    } catch (err) {
      this.setDump(`<div class="hv-error">读取失败: ${err}</div>`);
    }
  }

  private updateNav(): void {
    const info = document.getElementById('hv-info');
    if (info) {
      const end = Math.min(this.pageOffset + PAGE_SIZE, this.totalSize);
      info.textContent = `偏移 0x${this.pageOffset.toString(16)} – 0x${end.toString(16)} / 共 ${this.formatSize(this.totalSize)}`;
    }
    (document.getElementById('hv-prev') as HTMLButtonElement).disabled = this.pageOffset <= 0;
    (document.getElementById('hv-next') as HTMLButtonElement).disabled =
      this.pageOffset + PAGE_SIZE >= this.totalSize;
  }

  private renderDump(chunk: HexChunk): void {
    const bytes = chunk.bytes;
    if (bytes.length === 0) {
      this.setDump('<div class="hv-empty">（此偏移无数据 / 已到文件尾）</div>');
      return;
    }
    const rows: string[] = [];
    for (let i = 0; i < bytes.length; i += BYTES_PER_ROW) {
      const rowBytes = bytes.slice(i, i + BYTES_PER_ROW);
      const absOffset = chunk.offset + i;
      const offStr = absOffset.toString(16).padStart(8, '0');

      const hexCells = rowBytes
        .map((b, j) => {
          const hex = b.toString(16).padStart(2, '0');
          const sep = j === 7 ? '&nbsp;&nbsp;' : ' ';
          return `${hex}${sep}`;
        })
        .join('');
      // 补齐不足一行的宽度
      const pad = '   '.repeat(BYTES_PER_ROW - rowBytes.length);

      const ascii = rowBytes
        .map((b) => (b >= 0x20 && b <= 0x7e ? this.escapeHtml(String.fromCharCode(b)) : '.'))
        .join('');

      rows.push(
        `<div class="hv-row"><span class="hv-off">${offStr}</span>` +
          `<span class="hv-hex">${hexCells}${pad}</span>` +
          `<span class="hv-ascii">${ascii}</span></div>`
      );
    }
    this.setDump(rows.join(''));
  }

  private formatSize(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
    return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }

  private escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}

function bootstrap(): void {
  const viewer = new HexViewer();
  void viewer.init();
  (window as any).hexViewer = viewer;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
