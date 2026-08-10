/**
 * SQLite 查看器 - 独立窗口
 *
 * 以只读方式打开任意 SQLite 数据库（微信解密产物、浏览器 History/Cookies 等），
 * 提供表列表浏览、只读 SQL 查询，以及常见浏览器取证的预设查询。
 *
 * 数据库路径通过 URL 查询参数 `?db=<encoded path>` 传入（由后端
 * open_sqlite_viewer_window 构造）；也可在窗口内用「打开数据库」按钮切换。
 */

import { invoke } from '@tauri-apps/api/core';
import { windowThemeAdapter } from '../ui/windowThemeAdapter';
import { translate } from '../../i18n';

interface TableInfo {
  name: string;
  kind: string; // "table" | "view"
  row_count: number;
}

interface QueryResult {
  columns: string[];
  rows: any[][];
  truncated: boolean;
  row_count: number;
}

interface ForensicPreset {
  label: string;
  /** 说明该预设适用于哪种数据库 */
  hint: string;
  sql: string;
}

/**
 * 浏览器取证预设查询。时间戳已在 SQL 内转换为本地可读时间：
 * - Chrome/WebKit：微秒基于 1601-01-01 → `ts/1000000 - 11644473600`
 * - Firefox：微秒基于 1970-01-01 → `ts/1000000`
 */
const FORENSIC_PRESETS: ForensicPreset[] = [
  {
    label: 'Chrome 历史记录 (History)',
    hint: 'Chrome/Edge 的 History 库',
    sql:
      "SELECT url, title, visit_count, " +
      "datetime(last_visit_time/1000000 - 11644473600, 'unixepoch', 'localtime') AS last_visit " +
      "FROM urls ORDER BY last_visit_time DESC",
  },
  {
    label: 'Chrome 下载记录 (Downloads)',
    hint: 'Chrome/Edge 的 History 库',
    sql:
      "SELECT target_path, tab_url, total_bytes, " +
      "datetime(start_time/1000000 - 11644473600, 'unixepoch', 'localtime') AS started " +
      "FROM downloads ORDER BY start_time DESC",
  },
  {
    label: 'Chrome Cookies',
    hint: 'Chrome/Edge 的 Cookies 库',
    sql:
      "SELECT host_key, name, path, " +
      "datetime(creation_utc/1000000 - 11644473600, 'unixepoch', 'localtime') AS created, " +
      "datetime(expires_utc/1000000 - 11644473600, 'unixepoch', 'localtime') AS expires " +
      "FROM cookies ORDER BY creation_utc DESC",
  },
  {
    label: 'Chrome 保存的登录 (Login Data)',
    hint: 'Chrome/Edge 的 Login Data 库（密码字段为加密 BLOB）',
    sql:
      "SELECT origin_url, username_value, " +
      "datetime(date_created/1000000 - 11644473600, 'unixepoch', 'localtime') AS created " +
      "FROM logins ORDER BY date_created DESC",
  },
  {
    label: 'Firefox 历史记录 (places.sqlite)',
    hint: 'Firefox 的 places.sqlite',
    sql:
      "SELECT url, title, visit_count, " +
      "datetime(last_visit_date/1000000, 'unixepoch', 'localtime') AS last_visit " +
      "FROM moz_places ORDER BY last_visit_date DESC",
  },
  {
    label: 'Firefox Cookies (cookies.sqlite)',
    hint: 'Firefox 的 cookies.sqlite',
    sql:
      "SELECT host, name, path, " +
      "datetime(creationTime/1000000, 'unixepoch', 'localtime') AS created " +
      "FROM moz_cookies ORDER BY creationTime DESC",
  },
];

const ROW_LIMIT = 5000;

class SqliteViewer {
  private dbPath = '';
  private tables: TableInfo[] = [];
  private activeTable = '';

  async init(): Promise<void> {
    this.setupWindowControls();
    try {
      await windowThemeAdapter.init();
    } catch (err) {
      console.warn('[SQLite查看器] 主题初始化失败:', err);
    }

    // 从 URL 读取数据库路径
    const params = new URLSearchParams(window.location.search);
    this.dbPath = params.get('db') || '';

    this.renderShell();
    if (this.dbPath) {
      await this.loadTables();
    }
  }

  private setupWindowControls(): void {
    document.getElementById('minimizeBtn')?.addEventListener('click', () => {
      invoke('minimize_window').catch(() => {});
    });
    document.getElementById('maximizeBtn')?.addEventListener('click', () => {
      invoke('toggle_maximize').catch(() => {});
    });
    document.getElementById('closeBtn')?.addEventListener('click', () => {
      invoke('close_window').catch(() => {});
    });
  }

  private renderShell(): void {
    const app = document.getElementById('sqlite-viewer-app');
    if (!app) return;

    const presetOptions = FORENSIC_PRESETS.map(
      (p, i) => `<option value="${i}">${p.label}</option>`
    ).join('');

    const body = document.createElement('div');
    body.style.cssText = 'display:flex;flex-direction:column;flex:1;overflow:hidden;';
    body.innerHTML = `
      <div class="sv-toolbar">
        <button class="sv-btn" id="sv-open-db">打开数据库</button>
        <select class="sv-select" id="sv-preset">
          <option value="">浏览器取证预设…</option>
          ${presetOptions}
        </select>
        <span class="sv-db-path" id="sv-db-path">${this.dbPath || '未选择数据库'}</span>
      </div>
      <div class="sv-sql-row">
        <textarea class="sv-sql-input" id="sv-sql" placeholder="输入只读 SQL（SELECT / WITH / PRAGMA），Ctrl+Enter 运行"></textarea>
        <button class="sv-btn primary" id="sv-run">运行</button>
      </div>
      <div class="sv-body">
        <div class="sv-tables" id="sv-tables">
          <div class="sv-tables-header">表 / 视图</div>
        </div>
        <div class="sv-result" id="sv-result">
          <div class="sv-empty">选择左侧的表，或运行 SQL 查询</div>
        </div>
      </div>
    `;
    app.appendChild(body);

    document.getElementById('sv-run')?.addEventListener('click', () => this.runSql());
    document.getElementById('sv-sql')?.addEventListener('keydown', (e) => {
      const ke = e as KeyboardEvent;
      if (ke.ctrlKey && ke.key === 'Enter') {
        e.preventDefault();
        this.runSql();
      }
    });
    document.getElementById('sv-open-db')?.addEventListener('click', () => this.pickDatabase());
    document.getElementById('sv-preset')?.addEventListener('change', (e) => {
      const idx = (e.target as HTMLSelectElement).value;
      if (idx === '') return;
      const preset = FORENSIC_PRESETS[Number(idx)];
      if (preset) {
        const sqlInput = document.getElementById('sv-sql') as HTMLTextAreaElement;
        sqlInput.value = preset.sql;
        this.runSql();
      }
      (e.target as HTMLSelectElement).value = '';
    });
  }

  private async pickDatabase(): Promise<void> {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        multiple: false,
        filters: [
          { name: translate('SQLite 数据库'), extensions: ['db', 'sqlite', 'sqlite3', 'db3', 'dat'] },
          { name: translate('所有文件'), extensions: ['*'] },
        ],
      });
      if (typeof selected === 'string') {
        this.dbPath = selected;
        const pathEl = document.getElementById('sv-db-path');
        if (pathEl) pathEl.textContent = selected;
        await this.loadTables();
      }
    } catch (err) {
      console.error('[SQLite查看器] 选择数据库失败:', err);
    }
  }

  private async loadTables(): Promise<void> {
    const container = document.getElementById('sv-tables');
    if (!container) return;
    try {
      this.tables = await invoke<TableInfo[]>('sqlite_list_tables', { dbPath: this.dbPath });
      const header = '<div class="sv-tables-header">表 / 视图</div>';
      const items = this.tables
        .map(
          (t) => `
          <div class="sv-table-item" data-table="${encodeURIComponent(t.name)}">
            <span>${t.name}${t.kind === 'view' ? '<span class="sv-view-badge">视图</span>' : ''}</span>
            <span class="sv-table-count">${t.row_count >= 0 ? t.row_count : '?'}</span>
          </div>`
        )
        .join('');
      container.innerHTML = header + (items || '<div class="sv-empty">无表</div>');
      container.querySelectorAll('.sv-table-item').forEach((el) => {
        el.addEventListener('click', () => {
          const name = decodeURIComponent((el as HTMLElement).dataset.table || '');
          this.selectTable(name);
        });
      });
    } catch (err) {
      container.innerHTML = `<div class="sv-error">加载失败: ${err}</div>`;
    }
  }

  private selectTable(name: string): void {
    this.activeTable = name;
    document.querySelectorAll('.sv-table-item').forEach((el) => {
      el.classList.toggle(
        'active',
        decodeURIComponent((el as HTMLElement).dataset.table || '') === name
      );
    });
    const escaped = name.replace(/"/g, '""');
    const sql = `SELECT * FROM "${escaped}" LIMIT ${ROW_LIMIT}`;
    const sqlInput = document.getElementById('sv-sql') as HTMLTextAreaElement;
    if (sqlInput) sqlInput.value = sql;
    this.runSql(sql);
  }

  private async runSql(sqlOverride?: string): Promise<void> {
    const result = document.getElementById('sv-result');
    if (!result) return;
    if (!this.dbPath) {
      result.innerHTML = '<div class="sv-empty">请先打开一个数据库</div>';
      return;
    }
    const sqlInput = document.getElementById('sv-sql') as HTMLTextAreaElement;
    const sql = (sqlOverride ?? sqlInput?.value ?? '').trim();
    if (!sql) return;

    result.innerHTML = '<div class="sv-empty">查询中…</div>';
    try {
      const res = await invoke<QueryResult>('sqlite_query', {
        dbPath: this.dbPath,
        sql,
        limit: ROW_LIMIT,
      });
      this.renderResult(res);
    } catch (err) {
      result.innerHTML = `<div class="sv-error">查询失败: ${err}</div>`;
    }
  }

  private renderResult(res: QueryResult): void {
    const result = document.getElementById('sv-result');
    if (!result) return;
    if (res.columns.length === 0) {
      result.innerHTML = '<div class="sv-empty">该语句无返回结果</div>';
      return;
    }

    const info =
      `<div class="sv-result-info">` +
      `共 ${res.row_count} 行` +
      (res.truncated ? ` <span class="sv-warn">（已截断至前 ${ROW_LIMIT} 行）</span>` : '') +
      `</div>`;

    const thead = `<tr>${res.columns.map((c) => `<th>${this.escapeHtml(c)}</th>`).join('')}</tr>`;
    const tbody = res.rows
      .map((row) => {
        const cells = row
          .map((cell) => {
            if (cell === null || cell === undefined) {
              return '<td class="sv-null">NULL</td>';
            }
            const text = String(cell);
            return `<td title="${this.escapeHtml(text)}">${this.escapeHtml(text)}</td>`;
          })
          .join('');
        return `<tr>${cells}</tr>`;
      })
      .join('');

    result.innerHTML =
      info + `<table class="sv-grid"><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
  }

  private escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

function bootstrap(): void {
  const viewer = new SqliteViewer();
  void viewer.init();
  (window as any).sqliteViewer = viewer;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
