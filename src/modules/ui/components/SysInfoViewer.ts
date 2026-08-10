/**
 * SysInfoViewer - MemProcFS 系统信息结构化展示面板
 * 
 * 将 sysinfo.txt 的纯文本内容解析为分段卡片式展示，支持切换回原始文本视图
 */
import { invoke } from '@tauri-apps/api/core';
import { loadAppSettings } from '../../core/settingsHelper';

interface SysInfoSection {
  title: string;
  titleCn: string;  // 中文标题
  icon: string;     // SVG icon
  color: string;    // accent color for the card header
  entries: { key: string; keyCn: string; value: string }[];
}

// Section icons as inline SVGs
const SECTION_ICONS: Record<string, { svg: string; color: string; titleCn: string }> = {
  'windows': {
    svg: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
    color: '#3b82f6',
    titleCn: 'Windows 系统信息',
  },
  'hardware': {
    svg: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3"/><circle cx="12" cy="12" r="3"/></svg>',
    color: '#f59e0b',
    titleCn: '硬件信息',
  },
  'users': {
    svg: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M5 20c0-3.87 3.13-7 7-7s7 3.13 7 7"/></svg>',
    color: '#8b5cf6',
    titleCn: '用户信息',
  },
  'process': {
    svg: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    color: '#10b981',
    titleCn: '进程信息',
  },
  'memprocfs': {
    svg: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>',
    color: '#667eea',
    titleCn: 'MemProcFS 信息',
  },
};

// 字段名翻译表
const FIELD_TRANSLATIONS: Record<string, string> = {
  // Windows Information
  'Computer Name': '计算机名',
  'Current Time': '当前时间',
  'Boot Time': '启动时间',
  'Time Zone': '时区',
  'Version': '系统版本',
  // Hardware Information
  'Architecture': '架构',
  'Physical Memory': '物理内存',
  'Max Address': '最大地址',
  'CPU': '处理器',
  'MB Vendor': '主板厂商',
  'MB Product': '主板产品',
  'BIOS Vendor': 'BIOS 厂商',
  'System Vendor': '系统厂商',
  // Process Information
  'Active': '活动进程',
  'Inactive': '非活动进程',
  // MemProcFS Information
  'Parse Time': '解析时间',
  'Memory Source': '内存来源',
  'Unique Tag': '唯一标签',
  'Forensic Mode': '取证模式',
  'VM Parsing': '虚拟机解析',
};

// Section 标题翻译
const SECTION_TRANSLATIONS: Record<string, string> = {
  'Windows Information': 'Windows 系统信息',
  'Hardware Information': '硬件信息',
  'Users': '用户信息',
  'Process Information': '进程信息',
  'MemProcFS Information': 'MemProcFS 信息',
};

function detectSectionType(title: string): string {
  const t = title.toLowerCase();
  if (t.includes('windows')) return 'windows';
  if (t.includes('hardware')) return 'hardware';
  if (t.includes('user')) return 'users';
  if (t.includes('process')) return 'process';
  if (t.includes('memprocfs')) return 'memprocfs';
  return 'windows'; // fallback
}

export class SysInfoViewer {
  private container: HTMLElement | null = null;
  private containerId: string = '';
  private sections: SysInfoSection[] = [];
  private rawContent: string = '';
  private viewMode: 'card' | 'text' = 'card';

  public init(containerId: string): void {
    this.containerId = containerId;
    this.container = document.getElementById(containerId);
  }

  public cleanup(): void {
    this.sections = [];
    this.rawContent = '';
  }

  /**
   * 加载并渲染 sysinfo.txt
   */
  public async load(): Promise<void> {
    this.container = document.getElementById(this.containerId);
    if (!this.container) return;

    // 显示加载状态
    this.container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:200px;color:var(--text-secondary,#888);font-size:14px;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:8px;animation:spin 1s linear infinite">
          <circle cx="12" cy="12" r="10" stroke-dasharray="40 60"/>
        </svg>
        正在加载系统信息...
      </div>
      <style>@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}</style>
    `;

    try {
      const settings = await loadAppSettings();
      const outputPath = settings.output_path || 'output';
      const textPath = `${outputPath}\\sysinfo.txt`;
      const content = await invoke('read_file', { path: textPath }) as string;
      this.rawContent = content;
      this.sections = this.parseSysInfo(content);
      this.renderCurrentView();
    } catch (error) {
      this.container.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;height:200px;color:#ef4444;font-size:14px;">
          加载失败: ${error}
        </div>
      `;
    }
  }

  /**
   * 解析 sysinfo.txt 内容为结构化 sections
   */
  private parseSysInfo(content: string): SysInfoSection[] {
    const sections: SysInfoSection[] = [];
    const lines = content.split('\n');
    let currentSection: SysInfoSection | null = null;

    for (const rawLine of lines) {
      const line = rawLine.replace(/\r$/, '');
      if (!line.trim()) continue;

      if (!line.startsWith(' ') && !line.startsWith('\t')) {
        const trimmed = line.trim();
        if (trimmed.endsWith(':')) {
          if (currentSection) sections.push(currentSection);
          
          const title = trimmed.slice(0, -1);
          const type = detectSectionType(title);
          const iconInfo = SECTION_ICONS[type] || SECTION_ICONS['windows'];
          const titleCn = SECTION_TRANSLATIONS[title] || iconInfo.titleCn || title;
          currentSection = {
            title,
            titleCn,
            icon: iconInfo.svg,
            color: iconInfo.color,
            entries: [],
          };
          continue;
        }
      }

      if (currentSection) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const colonIdx = trimmed.indexOf(':');
        if (colonIdx > 0) {
          const key = trimmed.substring(0, colonIdx).trim();
          const value = trimmed.substring(colonIdx + 1).trim();
          const keyCn = FIELD_TRANSLATIONS[key] || '';
          currentSection.entries.push({ key, keyCn, value });
        } else {
          currentSection.entries.push({ key: '', keyCn: '', value: trimmed });
        }
      }
    }

    if (currentSection) sections.push(currentSection);
    return sections;
  }

  /**
   * 根据当前 viewMode 渲染
   */
  private renderCurrentView(): void {
    if (this.viewMode === 'card') {
      this.renderCards();
    } else {
      this.renderText();
    }
  }

  /**
   * 渲染视图切换栏
   */
  private renderToggleBar(): string {
    return `
      <div class="sysinfo-toggle-bar" style="
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 6px 20px 2px;
        flex-shrink: 0;
      ">
        <div style="display:flex;gap:2px;background:var(--bg-tertiary,rgba(255,255,255,0.05));border-radius:6px;padding:2px;">
          <button class="sysinfo-view-btn ${this.viewMode === 'card' ? 'active' : ''}" data-view="card" style="
            padding: 5px 14px;
            border: none;
            border-radius: 4px;
            font-size: 12px;
            cursor: pointer;
            background: ${this.viewMode === 'card' ? 'var(--accent-color,#667eea)' : 'transparent'};
            color: ${this.viewMode === 'card' ? '#fff' : 'var(--text-secondary,#94a3b8)'};
            font-weight: ${this.viewMode === 'card' ? '600' : '400'};
            transition: all .2s;
            display: flex;
            align-items: center;
            gap: 5px;
          ">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
            卡片视图
          </button>
          <button class="sysinfo-view-btn ${this.viewMode === 'text' ? 'active' : ''}" data-view="text" style="
            padding: 5px 14px;
            border: none;
            border-radius: 4px;
            font-size: 12px;
            cursor: pointer;
            background: ${this.viewMode === 'text' ? 'var(--accent-color,#667eea)' : 'transparent'};
            color: ${this.viewMode === 'text' ? '#fff' : 'var(--text-secondary,#94a3b8)'};
            font-weight: ${this.viewMode === 'text' ? '600' : '400'};
            transition: all .2s;
            display: flex;
            align-items: center;
            gap: 5px;
          ">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <path d="M14 2v6h6"/><path d="M16 13H8M16 17H8M10 9H8"/>
            </svg>
            原始文本
          </button>
        </div>
      </div>
    `;
  }

  /**
   * 绑定切换按钮事件
   */
  private bindToggleEvents(): void {
    const btns = this.container?.querySelectorAll('.sysinfo-view-btn');
    btns?.forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.getAttribute('data-view') as 'card' | 'text';
        if (view && view !== this.viewMode) {
          this.viewMode = view;
          this.renderCurrentView();
        }
      });
    });
  }

  /**
   * 渲染卡片视图
   */
  private renderCards(): void {
    if (!this.container) return;

    const cardsHtml = this.sections.map(section => `
      <div class="sysinfo-card" style="
        background: var(--bg-secondary, #1e293b);
        border-radius: 12px;
        border: 1px solid var(--border-color, rgba(255,255,255,0.06));
        overflow: hidden;
        transition: box-shadow 0.2s;
      ">
        <div class="sysinfo-card-header" style="
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 14px 18px;
          background: linear-gradient(135deg, ${section.color}15, ${section.color}08);
          border-bottom: 1px solid var(--border-color, rgba(255,255,255,0.06));
        ">
          <div style="
            display: flex;
            align-items: center;
            justify-content: center;
            width: 36px;
            height: 36px;
            border-radius: 10px;
            background: ${section.color}20;
            color: ${section.color};
            flex-shrink: 0;
          ">${section.icon}</div>
          <div>
            <div style="
              font-size: 15px;
              font-weight: 600;
              color: var(--text-primary, #e2e8f0);
              letter-spacing: 0.3px;
            ">${this.escapeHtml(section.titleCn)}</div>
            <div style="
              font-size: 11px;
              color: var(--text-muted, #64748b);
              margin-top: 1px;
            ">${this.escapeHtml(section.title)}</div>
          </div>
        </div>
        <div class="sysinfo-card-body" style="padding: 6px 0;">
          ${section.entries.map((entry, idx) => `
            <div style="
              display: flex;
              align-items: baseline;
              padding: 8px 18px;
              gap: 12px;
              background: ${idx % 2 === 0 ? 'transparent' : 'var(--bg-tertiary, rgba(255,255,255,0.02))'};
              transition: background 0.15s;
            " class="sysinfo-row">
              ${entry.key ? `
                <span style="
                  min-width: 160px;
                  max-width: 220px;
                  flex-shrink: 0;
                  font-size: 13px;
                  color: var(--text-secondary, #94a3b8);
                  font-weight: 500;
                ">${entry.keyCn
                    ? `${this.escapeHtml(entry.keyCn)}<span style="font-size:11px;color:var(--text-muted,#64748b);margin-left:4px">${this.escapeHtml(entry.key)}</span>`
                    : this.escapeHtml(entry.key)
                  }</span>
                <span style="
                  font-size: 13px;
                  color: var(--text-primary, #e2e8f0);
                  font-family: 'JetBrains Mono', 'Cascadia Code', 'Fira Code', monospace;
                  word-break: break-all;
                ">${this.escapeHtml(entry.value) || '<span style="color:var(--text-muted,#475569)">—</span>'}</span>
              ` : `
                <span style="
                  font-size: 13px;
                  color: var(--text-primary, #e2e8f0);
                  font-family: 'JetBrains Mono', 'Cascadia Code', 'Fira Code', monospace;
                  word-break: break-all;
                ">${this.escapeHtml(entry.value)}</span>
              `}
            </div>
          `).join('')}
          ${section.entries.length === 0 ? `
            <div style="padding: 16px 18px; color: var(--text-muted, #475569); font-size: 13px;">暂无数据</div>
          ` : ''}
        </div>
      </div>
    `).join('');

    this.container.innerHTML = `
      ${this.renderToggleBar()}
      <div class="sysinfo-panel" style="
        padding: 4px 20px 20px;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
        gap: 16px;
        max-height: calc(100% - 40px);
        overflow-y: auto;
      ">
        ${cardsHtml}
      </div>
      <style>
        .sysinfo-row:hover {
          background: var(--bg-hover, rgba(255,255,255,0.04)) !important;
        }
        .sysinfo-card:hover {
          box-shadow: 0 4px 24px rgba(0,0,0,0.15);
        }
        .sysinfo-panel::-webkit-scrollbar {
          width: 6px;
        }
        .sysinfo-panel::-webkit-scrollbar-thumb {
          background: var(--border-color, rgba(255,255,255,0.1));
          border-radius: 3px;
        }
      </style>
    `;

    this.bindToggleEvents();
  }

  /**
   * 渲染原始文本视图
   */
  private renderText(): void {
    if (!this.container) return;

    this.container.innerHTML = `
      ${this.renderToggleBar()}
      <div style="
        padding: 4px 20px 20px;
        max-height: calc(100% - 40px);
        overflow-y: auto;
      ">
        <pre style="
          background: var(--bg-secondary, #1e293b);
          border: 1px solid var(--border-color, rgba(255,255,255,0.06));
          border-radius: 10px;
          padding: 18px 22px;
          font-family: 'JetBrains Mono', 'Cascadia Code', 'Fira Code', monospace;
          font-size: 13px;
          line-height: 1.7;
          color: var(--text-primary, #e2e8f0);
          white-space: pre-wrap;
          word-break: break-all;
          margin: 0;
          tab-size: 4;
        ">${this.escapeHtml(this.rawContent)}</pre>
      </div>
    `;

    this.bindToggleEvents();
  }

  private escapeHtml(str: string): string {
    const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return str.replace(/[&<>"']/g, m => map[m] || m);
  }
}
