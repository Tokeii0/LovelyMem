/**
 * 注册表取证 - 独立窗口
 *
 * 对 Volatility3 已导出的注册表类 CSV（userassist / shimcache / amcache）做
 * 取证增强展示：统一「程序 / 路径 / 时间戳 / 运行次数 / 风险」字段、时间线排序、
 * 运行次数条形、可疑持久化位置高亮。CSV 路径经 URL 查询参数 `?csv=` 传入。
 */

import { invoke } from '@tauri-apps/api/core';
import { windowThemeAdapter } from '../ui/windowThemeAdapter';
import { translate } from '../../i18n';

interface RegEntry {
  name: string;
  path: string;
  timestamp: string;
  count: number | null;
  risk: string | null;
  raw: Record<string, string>;
}
interface RegResult {
  kind: string;
  columns: string[];
  entries: RegEntry[];
  total: number;
  suspicious: number;
}

/** 内联警告 SVG（替代 ⚠ emoji） */
const WARN_SVG =
  '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';

const KIND_LABELS: Record<string, string> = {
  userassist: 'UserAssist 用户活动',
  shimcache: 'ShimCache 应用兼容缓存',
  amcache: 'Amcache 程序执行',
  generic: '通用注册表',
};

class RegistryForensics {
  private csvPath = '';
  private result: RegResult | null = null;
  private onlyRisk = false;
  private filter = '';

  async init(): Promise<void> {
    this.setupWindowControls();
    try { await windowThemeAdapter.init(); } catch { /* ignore */ }

    const params = new URLSearchParams(window.location.search);
    this.csvPath = params.get('csv') || '';
    this.renderShell();
    if (this.csvPath) {
      await this.analyze();
    } else {
      this.setBody('<div class="rf-empty">未指定 CSV 文件</div>');
    }
  }

  private setupWindowControls(): void {
    document.getElementById('minimizeBtn')?.addEventListener('click', () => invoke('minimize_window').catch(() => {}));
    document.getElementById('maximizeBtn')?.addEventListener('click', () => invoke('toggle_maximize').catch(() => {}));
    document.getElementById('closeBtn')?.addEventListener('click', () => invoke('close_window').catch(() => {}));
  }

  private renderShell(): void {
    const app = document.getElementById('reg-forensics-app');
    if (!app) return;
    const body = document.createElement('div');
    body.style.cssText = 'display:flex;flex-direction:column;flex:1;overflow:hidden;';
    body.innerHTML = `
      <div class="rf-toolbar">
        <button class="rf-btn" id="rf-open">打开 CSV</button>
        <span class="rf-kind-badge" id="rf-kind">—</span>
        <span class="rf-summary" id="rf-summary"></span>
        <input class="rf-filter" id="rf-filter" placeholder="过滤（路径/程序名）">
        <label class="rf-check"><input type="checkbox" id="rf-only-risk"> 仅看可疑</label>
      </div>
      <div class="rf-body" id="rf-body"><div class="rf-empty">加载中…</div></div>
    `;
    app.appendChild(body);

    document.getElementById('rf-open')?.addEventListener('click', () => this.pickCsv());
    document.getElementById('rf-filter')?.addEventListener('input', (e) => {
      this.filter = (e.target as HTMLInputElement).value.toLowerCase();
      this.renderTable();
    });
    document.getElementById('rf-only-risk')?.addEventListener('change', (e) => {
      this.onlyRisk = (e.target as HTMLInputElement).checked;
      this.renderTable();
    });
  }

  private async pickCsv(): Promise<void> {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        multiple: false,
        filters: [{ name: 'CSV', extensions: ['csv'] }, { name: translate('所有文件'), extensions: ['*'] }],
      });
      if (typeof selected === 'string') {
        this.csvPath = selected;
        await this.analyze();
      }
    } catch (err) {
      console.error('[注册表取证] 选择 CSV 失败:', err);
    }
  }

  private setBody(html: string): void {
    const b = document.getElementById('rf-body');
    if (b) b.innerHTML = html;
  }

  private async analyze(): Promise<void> {
    this.setBody('<div class="rf-empty">解析中…</div>');
    try {
      this.result = await invoke<RegResult>('analyze_registry_csv', { csvPath: this.csvPath });
      const kindEl = document.getElementById('rf-kind');
      if (kindEl) kindEl.textContent = KIND_LABELS[this.result.kind] || this.result.kind;
      const sum = document.getElementById('rf-summary');
      if (sum) {
        sum.innerHTML = `共 ${this.result.total} 条 · <span class="rf-risk">可疑 ${this.result.suspicious}</span>`;
      }
      this.renderTable();
    } catch (err) {
      this.setBody(`<div class="rf-error">解析失败: ${err}</div>`);
    }
  }

  private renderTable(): void {
    if (!this.result) return;
    let entries = this.result.entries;
    if (this.onlyRisk) entries = entries.filter((e) => e.risk);
    if (this.filter) {
      entries = entries.filter(
        (e) =>
          e.path.toLowerCase().includes(this.filter) ||
          e.name.toLowerCase().includes(this.filter)
      );
    }
    if (entries.length === 0) {
      this.setBody('<div class="rf-empty">无匹配记录</div>');
      return;
    }

    const hasCount = entries.some((e) => e.count !== null);
    const maxCount = Math.max(1, ...entries.map((e) => e.count || 0));

    const header =
      `<tr><th>程序 / 值名</th><th>路径</th><th>时间戳</th>` +
      (hasCount ? '<th>运行次数</th>' : '') +
      `<th>风险</th></tr>`;

    const rows = entries
      .map((e) => {
        const countCell = hasCount
          ? `<td><div class="rf-count-cell"><div class="rf-count-bar" style="width:${Math.round(((e.count || 0) / maxCount) * 60)}px"></div><span class="rf-count-num">${e.count ?? ''}</span></div></td>`
          : '';
        const riskCell = e.risk
          ? `<td><span class="rf-risk-tag" title="${this.escapeHtml(e.risk)}">${WARN_SVG} 可疑</span></td>`
          : '<td></td>';
        return (
          `<tr class="${e.risk ? 'rf-suspicious' : ''}">` +
          `<td>${this.escapeHtml(e.name)}</td>` +
          `<td class="rf-path" title="${this.escapeHtml(e.path)}">${this.escapeHtml(e.path)}</td>` +
          `<td>${this.escapeHtml(e.timestamp)}</td>` +
          countCell +
          riskCell +
          `</tr>`
        );
      })
      .join('');

    this.setBody(`<table class="rf-grid"><thead>${header}</thead><tbody>${rows}</tbody></table>`);
  }

  private escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}

function bootstrap(): void {
  const app = new RegistryForensics();
  void app.init();
  (window as any).registryForensics = app;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
