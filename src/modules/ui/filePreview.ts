/**
 * 文件快速预览面板
 * - CSV 文件：表格视图
 * - 其他文件：hexdump + ASCII，可切换为 strings 模式，支持多编码
 */
import { invoke } from '@tauri-apps/api/core';
import { IconParkHelper } from '../utils/iconparkHelper';

type PreviewMode = 'hex' | 'strings';
type Encoding = 'ascii' | 'utf8' | 'utf16le' | 'gbk';

const PREVIEW_CHUNK_SIZE = 64 * 1024; // 64 KB
const CSV_PREVIEW_ROWS = 500;

export class FilePreview {
  private container: HTMLElement | null = null;
  private currentPath: string | null = null;
  private currentMode: PreviewMode = 'hex';
  private currentEncoding: Encoding = 'ascii';
  private stringsMinLen: number = 4;
  private cachedBytes: Uint8Array | null = null;
  private cachedFileSize: number = 0;

  public render(): string {
    const iconClose = IconParkHelper.getSvgString('close', { size: 14 });
    return `
      <div class="file-preview-header">
        <div class="preview-title" id="preview-title">快速预览</div>
        <div class="preview-toolbar" id="preview-toolbar"></div>
        <button class="preview-close" id="preview-close" title="清除预览">${iconClose}</button>
      </div>
      <div class="file-preview-body" id="file-preview-body">
        <div class="preview-empty">
          <div class="preview-empty-icon">${IconParkHelper.getSvgString('file-search', { size: 48 })}</div>
          <div>选中文件以预览</div>
        </div>
      </div>
    `;
  }

  public attach(container: HTMLElement): void {
    this.container = container;
    this.bindToolbarEvents();
    this.bindContextMenu();
  }

  private bindToolbarEvents(): void {
    if (!this.container) return;
    this.container.querySelector('#preview-close')?.addEventListener('click', () => {
      this.clear();
    });
  }

  /** 绑定自定义右键菜单（因为全局 contextmenu 被禁用） */
  private bindContextMenu(): void {
    if (!this.container) return;
    const body = this.container.querySelector('#file-preview-body') as HTMLElement;
    if (!body) return;

    body.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.showContextMenu((e as MouseEvent).clientX, (e as MouseEvent).clientY);
    });
  }

  /** 展示复制菜单 */
  private showContextMenu(x: number, y: number): void {
    // 先关掉旧的
    this.hideContextMenu();

    const selection = window.getSelection();
    const selectedText = selection?.toString() || '';
    const hasSelection = selectedText.length > 0;

    const menu = document.createElement('div');
    menu.className = 'preview-context-menu';
    menu.id = 'preview-ctx-menu';

    menu.innerHTML = `
      <div class="preview-context-menu-item ${hasSelection ? '' : 'disabled'}" data-action="copy">
        <span>复制</span>
        <span class="preview-context-menu-shortcut">Ctrl+C</span>
      </div>
      <div class="preview-context-menu-item" data-action="copy-all">
        <span>复制全部</span>
      </div>
      <div class="preview-context-menu-sep"></div>
      <div class="preview-context-menu-item" data-action="select-all">
        <span>全选</span>
        <span class="preview-context-menu-shortcut">Ctrl+A</span>
      </div>
    `;

    // 先加到 body 以便测量尺寸
    menu.style.left = '0px';
    menu.style.top = '0px';
    document.body.appendChild(menu);

    // 防止超出视口
    const rect = menu.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let finalX = x;
    let finalY = y;
    if (x + rect.width > vw) finalX = vw - rect.width - 4;
    if (y + rect.height > vh) finalY = vh - rect.height - 4;
    menu.style.left = `${finalX}px`;
    menu.style.top = `${finalY}px`;

    menu.addEventListener('click', async (e) => {
      const target = (e.target as HTMLElement).closest('.preview-context-menu-item') as HTMLElement | null;
      if (!target || target.classList.contains('disabled')) return;
      const action = target.getAttribute('data-action');

      if (action === 'copy' && hasSelection) {
        await this.copyToClipboard(selectedText);
      } else if (action === 'copy-all') {
        const body = this.container?.querySelector('#file-preview-body') as HTMLElement | null;
        if (body) {
          const text = body.innerText || body.textContent || '';
          await this.copyToClipboard(text);
        }
      } else if (action === 'select-all') {
        this.selectAllPreview();
      }
      this.hideContextMenu();
    });

    // 点击菜单外区域或按 Esc 关闭（菜单内的点击由 click 监听处理）
    const closeHandler = (ev: MouseEvent) => {
      if (!(ev.target as Node).isConnected) return;
      if (menu.contains(ev.target as Node)) return; // 菜单内点击，忽略
      this.hideContextMenu();
      document.removeEventListener('mousedown', closeHandler, true);
      document.removeEventListener('keydown', escHandler, true);
    };
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.hideContextMenu();
        document.removeEventListener('mousedown', closeHandler, true);
        document.removeEventListener('keydown', escHandler, true);
      }
    };
    setTimeout(() => {
      document.addEventListener('mousedown', closeHandler, true);
      document.addEventListener('keydown', escHandler, true);
    }, 0);
  }

  private hideContextMenu(): void {
    const existing = document.getElementById('preview-ctx-menu');
    if (existing) existing.remove();
  }

  private async copyToClipboard(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // 降级方案: 用临时 textarea
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } catch {}
      document.body.removeChild(ta);
    }
  }

  private selectAllPreview(): void {
    if (!this.container) return;
    const body = this.container.querySelector('#file-preview-body');
    if (!body) return;
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.selectNodeContents(body);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  public clear(): void {
    this.currentPath = null;
    this.cachedBytes = null;
    this.cachedFileSize = 0;
    if (!this.container) return;
    const title = this.container.querySelector('#preview-title') as HTMLElement;
    if (title) title.textContent = '快速预览';
    const toolbar = this.container.querySelector('#preview-toolbar') as HTMLElement;
    if (toolbar) toolbar.innerHTML = '';
    const body = this.container.querySelector('#file-preview-body') as HTMLElement;
    if (body) {
      body.innerHTML = `
        <div class="preview-empty">
          <div class="preview-empty-icon">${IconParkHelper.getSvgString('file-search', { size: 48 })}</div>
          <div>选中文件以预览</div>
        </div>
      `;
    }
  }

  public async preview(filePath: string, filename: string, isDir: boolean): Promise<void> {
    if (!this.container) return;
    if (isDir) {
      this.clear();
      return;
    }

    this.currentPath = filePath;
    this.cachedBytes = null;

    const title = this.container.querySelector('#preview-title') as HTMLElement;
    if (title) title.textContent = filename;

    const body = this.container.querySelector('#file-preview-body') as HTMLElement;
    if (!body) return;

    body.innerHTML = `<div class="preview-loading">加载中...</div>`;

    const ext = filename.split('.').pop()?.toLowerCase() || '';

    try {
      if (ext === 'csv' || ext === 'tsv') {
        await this.renderCsv(filePath, ext === 'tsv');
      } else {
        await this.renderBinary(filePath);
      }
    } catch (err) {
      body.innerHTML = `<div class="preview-error">预览失败: ${this.escapeHtml(String(err))}</div>`;
    }
  }

  // ─── CSV 预览 ───
  private async renderCsv(filePath: string, isTsv: boolean): Promise<void> {
    if (!this.container) return;
    const body = this.container.querySelector('#file-preview-body') as HTMLElement;
    const toolbar = this.container.querySelector('#preview-toolbar') as HTMLElement;

    // 读取前 1 MB 预览
    const bytes = await invoke<number[]>('read_file_range', {
      path: filePath,
      start: 0,
      length: 1024 * 1024,
    });

    const text = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes));
    const sep = isTsv ? '\t' : ',';
    const rows = this.parseCsv(text, sep).slice(0, CSV_PREVIEW_ROWS);

    if (rows.length === 0) {
      body.innerHTML = `<div class="preview-empty">空文件</div>`;
      return;
    }

    // 工具栏: 仅显示行数信息
    if (toolbar) {
      toolbar.innerHTML = `<span class="preview-info">共 ${rows.length} 行 (限 ${CSV_PREVIEW_ROWS})</span>`;
    }

    const header = rows[0];
    const dataRows = rows.slice(1);

    let html = '<div class="preview-csv-wrap"><table class="preview-csv-table"><thead><tr>';
    html += '<th class="csv-row-num">#</th>';
    for (const cell of header) {
      html += `<th>${this.escapeHtml(cell)}</th>`;
    }
    html += '</tr></thead><tbody>';
    for (let i = 0; i < dataRows.length; i++) {
      html += `<tr><td class="csv-row-num">${i + 1}</td>`;
      for (let j = 0; j < header.length; j++) {
        html += `<td>${this.escapeHtml(dataRows[i][j] ?? '')}</td>`;
      }
      html += '</tr>';
    }
    html += '</tbody></table></div>';
    body.innerHTML = html;
  }

  // 最小 CSV 解析（处理引号转义）
  private parseCsv(text: string, sep: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = '';
    let inQuotes = false;
    let i = 0;

    while (i < text.length) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') {
            cell += '"';
            i += 2;
            continue;
          }
          inQuotes = false;
          i++;
          continue;
        }
        cell += c;
        i++;
        continue;
      }

      if (c === '"') {
        inQuotes = true;
        i++;
        continue;
      }
      if (c === sep) {
        row.push(cell);
        cell = '';
        i++;
        continue;
      }
      if (c === '\r') {
        i++;
        continue;
      }
      if (c === '\n') {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
        i++;
        continue;
      }
      cell += c;
      i++;
    }
    if (cell.length > 0 || row.length > 0) {
      row.push(cell);
      rows.push(row);
    }
    return rows;
  }

  // ─── 二进制预览（hex / strings）───
  private async renderBinary(filePath: string): Promise<void> {
    if (!this.container) return;

    // 读取前 64 KB
    const bytes = await invoke<number[]>('read_file_range', {
      path: filePath,
      start: 0,
      length: PREVIEW_CHUNK_SIZE,
    });
    this.cachedBytes = new Uint8Array(bytes);

    this.renderToolbar();
    this.renderPreviewContent();
  }

  private renderToolbar(): void {
    if (!this.container) return;
    const toolbar = this.container.querySelector('#preview-toolbar') as HTMLElement;
    if (!toolbar) return;

    toolbar.innerHTML = `
      <div class="preview-seg-group">
        <button class="preview-seg ${this.currentMode === 'hex' ? 'active' : ''}" data-mode="hex">Hex</button>
        <button class="preview-seg ${this.currentMode === 'strings' ? 'active' : ''}" data-mode="strings">Strings</button>
      </div>
      <select class="preview-encoding" id="preview-encoding">
        <option value="ascii" ${this.currentEncoding === 'ascii' ? 'selected' : ''}>ASCII</option>
        <option value="utf8" ${this.currentEncoding === 'utf8' ? 'selected' : ''}>UTF-8</option>
        <option value="utf16le" ${this.currentEncoding === 'utf16le' ? 'selected' : ''}>UTF-16LE</option>
        <option value="gbk" ${this.currentEncoding === 'gbk' ? 'selected' : ''}>GBK</option>
      </select>
      ${this.currentMode === 'strings' ? `
        <label class="preview-minlen">
          min <input type="number" id="preview-minlen" min="2" max="64" value="${this.stringsMinLen}" />
        </label>
      ` : ''}
      <span class="preview-info">${this.formatSize(this.cachedBytes?.length || 0)}</span>
    `;

    toolbar.querySelectorAll('.preview-seg').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-mode') as PreviewMode;
        if (mode !== this.currentMode) {
          this.currentMode = mode;
          this.renderToolbar();
          this.renderPreviewContent();
        }
      });
    });

    const encSelect = toolbar.querySelector('#preview-encoding') as HTMLSelectElement;
    encSelect?.addEventListener('change', () => {
      this.currentEncoding = encSelect.value as Encoding;
      this.renderPreviewContent();
    });

    const minLenInput = toolbar.querySelector('#preview-minlen') as HTMLInputElement;
    minLenInput?.addEventListener('change', () => {
      const v = parseInt(minLenInput.value, 10);
      if (!isNaN(v) && v >= 2 && v <= 64) {
        this.stringsMinLen = v;
        this.renderPreviewContent();
      }
    });
  }

  private renderPreviewContent(): void {
    if (!this.container || !this.cachedBytes) return;
    const body = this.container.querySelector('#file-preview-body') as HTMLElement;
    if (!body) return;

    if (this.currentMode === 'hex') {
      body.innerHTML = this.renderHexDump(this.cachedBytes);
    } else {
      body.innerHTML = this.renderStrings(this.cachedBytes);
    }
  }

  // ─── Hexdump 渲染 ───
  private renderHexDump(bytes: Uint8Array): string {
    const bytesPerLine = 16;
    const lines: string[] = ['<div class="preview-hex">'];

    for (let offset = 0; offset < bytes.length; offset += bytesPerLine) {
      const chunk = bytes.slice(offset, offset + bytesPerLine);
      const offsetStr = offset.toString(16).padStart(8, '0').toUpperCase();

      // Hex 部分
      let hexStr = '';
      for (let i = 0; i < bytesPerLine; i++) {
        if (i < chunk.length) {
          hexStr += chunk[i].toString(16).padStart(2, '0').toUpperCase();
        } else {
          hexStr += '  ';
        }
        hexStr += i === 7 ? '  ' : ' ';
      }

      // 字符部分（按编码解码）
      const charStr = this.decodeLine(chunk);

      lines.push(
        `<div class="hex-line">` +
          `<span class="hex-offset">${offsetStr}</span>` +
          `<span class="hex-bytes">${hexStr}</span>` +
          `<span class="hex-ascii">${this.escapeHtml(charStr)}</span>` +
        `</div>`
      );
    }
    lines.push('</div>');
    return lines.join('');
  }

  // 按编码解码一行字节为可显示字符
  private decodeLine(bytes: Uint8Array): string {
    try {
      let text: string;
      switch (this.currentEncoding) {
        case 'utf8':
          text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
          break;
        case 'utf16le':
          text = new TextDecoder('utf-16le', { fatal: false }).decode(bytes);
          break;
        case 'gbk':
          text = new TextDecoder('gbk', { fatal: false }).decode(bytes);
          break;
        case 'ascii':
        default:
          return Array.from(bytes)
            .map(b => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : '.'))
            .join('');
      }
      // 把不可打印字符换为 '.'
      return Array.from(text)
        .map(ch => {
          const code = ch.codePointAt(0) || 0;
          if (code < 0x20 || code === 0x7f) return '.';
          return ch;
        })
        .join('');
    } catch {
      return '.'.repeat(bytes.length);
    }
  }

  // ─── Strings 提取（按编码）───
  private renderStrings(bytes: Uint8Array): string {
    const results: { offset: number; text: string }[] = [];

    if (this.currentEncoding === 'ascii' || this.currentEncoding === 'utf8') {
      // 按字节扫描 ASCII 可打印序列
      let start = -1;
      let cur = '';
      for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i];
        const printable = b >= 0x20 && b <= 0x7e;
        if (printable) {
          if (start < 0) start = i;
          cur += String.fromCharCode(b);
        } else {
          if (cur.length >= this.stringsMinLen) {
            results.push({ offset: start, text: cur });
          }
          cur = '';
          start = -1;
        }
      }
      if (cur.length >= this.stringsMinLen && start >= 0) {
        results.push({ offset: start, text: cur });
      }

      // UTF-8 模式: 额外扫描多字节序列
      if (this.currentEncoding === 'utf8') {
        try {
          const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
          const matches = decoded.matchAll(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]{2,}/g);
          for (const m of matches) {
            if (m.index !== undefined && m[0].length >= this.stringsMinLen) {
              results.push({ offset: m.index, text: m[0] });
            }
          }
        } catch {}
      }
    } else if (this.currentEncoding === 'utf16le') {
      // 扫描 UTF-16LE: 每 2 字节为一个代码单元
      let start = -1;
      let cur = '';
      for (let i = 0; i + 1 < bytes.length; i += 2) {
        const lo = bytes[i];
        const hi = bytes[i + 1];
        if (hi === 0 && lo >= 0x20 && lo <= 0x7e) {
          if (start < 0) start = i;
          cur += String.fromCharCode(lo);
        } else if (hi !== 0 && hi < 0xd8) {
          // 非 ASCII 的常规 BMP 字符
          if (start < 0) start = i;
          cur += String.fromCharCode(lo | (hi << 8));
        } else {
          if (cur.length >= this.stringsMinLen) {
            results.push({ offset: start, text: cur });
          }
          cur = '';
          start = -1;
        }
      }
      if (cur.length >= this.stringsMinLen && start >= 0) {
        results.push({ offset: start, text: cur });
      }
    } else if (this.currentEncoding === 'gbk') {
      try {
        const decoder = new TextDecoder('gbk', { fatal: false });
        // 滑动窗口扫描
        let winStart = 0;
        while (winStart < bytes.length) {
          const winEnd = Math.min(winStart + 4096, bytes.length);
          const text = decoder.decode(bytes.slice(winStart, winEnd));
          const re = /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef\x20-\x7e]{2,}/g;
          let m;
          while ((m = re.exec(text)) !== null) {
            if (m[0].length >= this.stringsMinLen) {
              results.push({ offset: winStart + m.index, text: m[0] });
            }
          }
          winStart = winEnd;
        }
      } catch {}
    }

    if (results.length === 0) {
      return '<div class="preview-empty">未发现符合长度的字符串</div>';
    }

    const lines = results
      .slice(0, 2000)
      .map(
        r =>
          `<div class="str-line">` +
          `<span class="str-offset">${r.offset.toString(16).padStart(8, '0').toUpperCase()}</span>` +
          `<span class="str-text">${this.escapeHtml(r.text)}</span>` +
          `</div>`
      );

    return `<div class="preview-strings">${lines.join('')}</div>`;
  }

  private escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private formatSize(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }
}
