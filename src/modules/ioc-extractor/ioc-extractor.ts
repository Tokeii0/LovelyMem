/**
 * IOC 提取 - 独立窗口
 *
 * 从文本或文件中提取 IP/域名/URL/Email/哈希/比特币地址等 IOC，
 * 支持导出为 Markdown 报告（写入报告编辑器的默认目录）。
 * 可通过监听 `ioc-input-text` 事件接收来自字符串搜索等来源的文本。
 */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { windowThemeAdapter } from '../ui/windowThemeAdapter';

interface IocItem { value: string; count: number; }
interface IocResult {
  ipv4: IocItem[]; ipv6: IocItem[]; domain: IocItem[]; url: IocItem[];
  email: IocItem[]; md5: IocItem[]; sha1: IocItem[]; sha256: IocItem[];
  btc: IocItem[]; truncated: boolean;
}

const CATEGORIES: { key: keyof IocResult; label: string }[] = [
  { key: 'ipv4', label: 'IPv4 地址' },
  { key: 'ipv6', label: 'IPv6 地址' },
  { key: 'domain', label: '域名' },
  { key: 'url', label: 'URL' },
  { key: 'email', label: '邮箱' },
  { key: 'md5', label: 'MD5' },
  { key: 'sha1', label: 'SHA1' },
  { key: 'sha256', label: 'SHA256' },
  { key: 'btc', label: '比特币地址' },
];

class IocExtractor {
  private lastResult: IocResult | null = null;

  async init(): Promise<void> {
    this.setupWindowControls();
    try {
      await windowThemeAdapter.init();
    } catch (err) {
      console.warn('[IOC提取] 主题初始化失败:', err);
    }
    this.renderShell();

    // 接收外部注入文本（如字符串搜索结果）
    await listen<string>('ioc-input-text', (e) => {
      const ta = document.getElementById('ie-text') as HTMLTextAreaElement;
      if (ta) ta.value = e.payload || '';
      void this.extractFromText();
    });
  }

  private setupWindowControls(): void {
    document.getElementById('minimizeBtn')?.addEventListener('click', () => invoke('minimize_window').catch(() => {}));
    document.getElementById('maximizeBtn')?.addEventListener('click', () => invoke('toggle_maximize').catch(() => {}));
    document.getElementById('closeBtn')?.addEventListener('click', () => invoke('close_window').catch(() => {}));
  }

  private renderShell(): void {
    const app = document.getElementById('ioc-extractor-app');
    if (!app) return;
    const body = document.createElement('div');
    body.style.cssText = 'display:flex;flex-direction:column;flex:1;overflow:hidden;';
    body.innerHTML = `
      <div class="ie-input-area">
        <textarea class="ie-textarea" id="ie-text" placeholder="粘贴文本，或点击「从文件提取」…"></textarea>
      </div>
      <div class="ie-toolbar">
        <button class="ie-btn primary" id="ie-extract">提取 IOC</button>
        <button class="ie-btn" id="ie-from-file">从文件提取</button>
        <button class="ie-btn" id="ie-copy">复制全部</button>
        <button class="ie-btn" id="ie-report">导出为报告</button>
        <span class="ie-status" id="ie-status"></span>
      </div>
      <div class="ie-body" id="ie-body">
        <div class="ie-empty">输入文本或选择文件后点击「提取 IOC」</div>
      </div>
    `;
    app.appendChild(body);

    document.getElementById('ie-extract')?.addEventListener('click', () => this.extractFromText());
    document.getElementById('ie-from-file')?.addEventListener('click', () => this.extractFromFile());
    document.getElementById('ie-copy')?.addEventListener('click', () => this.copyAll());
    document.getElementById('ie-report')?.addEventListener('click', () => this.exportReport());
  }

  private setStatus(msg: string): void {
    const el = document.getElementById('ie-status');
    if (el) el.textContent = msg;
  }

  private async extractFromText(): Promise<void> {
    const ta = document.getElementById('ie-text') as HTMLTextAreaElement;
    const text = ta?.value || '';
    if (!text.trim()) { this.setStatus('无输入文本'); return; }
    this.setStatus('提取中…');
    try {
      const res = await invoke<IocResult>('extract_ioc_from_text', { text });
      this.lastResult = res;
      this.renderResult(res);
    } catch (err) {
      this.setStatus('提取失败: ' + err);
    }
  }

  private async extractFromFile(): Promise<void> {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({ multiple: false });
      if (typeof selected !== 'string') return;
      this.setStatus('读取并提取中…');
      const res = await invoke<IocResult>('extract_ioc_from_file', { filePath: selected });
      this.lastResult = res;
      this.renderResult(res);
    } catch (err) {
      this.setStatus('提取失败: ' + err);
    }
  }

  private totalCount(res: IocResult): number {
    return CATEGORIES.reduce((sum, c) => sum + (res[c.key] as IocItem[]).length, 0);
  }

  private renderResult(res: IocResult): void {
    const body = document.getElementById('ie-body');
    if (!body) return;
    const total = this.totalCount(res);
    if (total === 0) {
      body.innerHTML = '<div class="ie-empty">未发现 IOC</div>';
      this.setStatus('未发现 IOC');
      return;
    }

    let html = '';
    if (res.truncated) {
      html +=
        '<div class="ie-warn"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> 文件较大，仅提取了前 64MB 内容</div>';
    }
    for (const cat of CATEGORIES) {
      const items = res[cat.key] as IocItem[];
      if (items.length === 0) continue;
      const rows = items
        .map(
          (it) =>
            `<div class="ie-item"><span class="ie-val" title="${this.escapeHtml(it.value)}">${this.escapeHtml(it.value)}</span><span class="ie-c">×${it.count}</span></div>`
        )
        .join('');
      html += `
        <div class="ie-section">
          <div class="ie-section-title">${cat.label} <span class="ie-count">${items.length}</span></div>
          <div class="ie-items">${rows}</div>
        </div>`;
    }
    body.innerHTML = html;
    this.setStatus(`共 ${total} 类去重 IOC`);
  }

  private buildText(): string {
    if (!this.lastResult) return '';
    const res = this.lastResult;
    const lines: string[] = [];
    for (const cat of CATEGORIES) {
      const items = res[cat.key] as IocItem[];
      if (items.length === 0) continue;
      lines.push(`# ${cat.label} (${items.length})`);
      items.forEach((it) => lines.push(`${it.value}\t${it.count}`));
      lines.push('');
    }
    return lines.join('\n');
  }

  private buildMarkdown(): string {
    if (!this.lastResult) return '';
    const res = this.lastResult;
    const parts: string[] = ['# IOC 提取报告', ''];
    for (const cat of CATEGORIES) {
      const items = res[cat.key] as IocItem[];
      if (items.length === 0) continue;
      parts.push(`## ${cat.label} (${items.length})`, '', '| 值 | 出现次数 |', '| --- | --- |');
      items.forEach((it) => parts.push(`| ${it.value.replace(/\|/g, '\\|')} | ${it.count} |`));
      parts.push('');
    }
    return parts.join('\n');
  }

  private async copyAll(): Promise<void> {
    const text = this.buildText();
    if (!text) { this.setStatus('无可复制内容'); return; }
    try {
      await navigator.clipboard.writeText(text);
      this.setStatus('已复制到剪贴板');
    } catch {
      this.setStatus('复制失败');
    }
  }

  private async exportReport(): Promise<void> {
    const md = this.buildMarkdown();
    if (!md) { this.setStatus('无可导出内容'); return; }
    try {
      const name = `IOC提取_${this.timestamp()}`;
      const savedPath = await invoke<string>('save_markdown_file', {
        fileName: name,
        content: md,
        customPath: null,
      });
      this.setStatus(`已保存报告: ${savedPath}`);
    } catch (err) {
      this.setStatus('导出失败: ' + err);
    }
  }

  private timestamp(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  }

  private escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}

function bootstrap(): void {
  const app = new IocExtractor();
  void app.init();
  (window as any).iocExtractor = app;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
