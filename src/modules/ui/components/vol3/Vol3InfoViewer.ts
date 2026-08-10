/**
 * Vol3 系统信息卡片视图 (windows.info)
 *
 * windows.info 使用 `-r quick` 渲染，输出为 `Variable\tValue` 两列文本。
 * 本组件将其解析为按语义分组的卡片，便于快速浏览系统态势。
 * 仅负责「卡片视图」的渲染；「原始文本视图」由外层 toggle bar 调用 loadText 处理。
 */

import { invoke } from '@tauri-apps/api/core';
import { loadAppSettings } from '../../../core/settingsHelper';

interface InfoEntry {
  key: string;
  keyCn: string;
  value: string;
}

interface InfoGroupDef {
  id: string;
  titleCn: string;
  titleEn: string;
  color: string;
  icon: string;
  keys: string[];
}

interface InfoGroup extends InfoGroupDef {
  entries: InfoEntry[];
}

// 字段中文释义
const FIELD_CN: Record<string, string> = {
  'Kernel Base': '内核基址',
  'DTB': '页目录基址 (DTB)',
  'Symbols': '符号文件',
  'Is64Bit': '64 位系统',
  'IsPAE': 'PAE 物理地址扩展',
  'primary': '主内存层',
  'layer_name': '虚拟内存层',
  'memory_layer': '物理内存层',
  'KdVersionBlock': '内核调试版本块',
  'KdDebuggerDataBlock': '内核调试数据块',
  'Major/Minor': '主/次版本号',
  'MachineType': '机器类型',
  'KeNumberProcessors': '处理器数量',
  'SystemTime': '系统时间',
  'NtSystemRoot': '系统根目录',
  'NtProductType': '产品类型',
  'NtMajorVersion': 'NT 主版本号',
  'NtMinorVersion': 'NT 次版本号',
  'NtBuildLab': 'NT 编译标识',
  'PE MajorOperatingSystemVersion': 'PE 主系统版本',
  'PE MinorOperatingSystemVersion': 'PE 次系统版本',
  'PE Machine': 'PE 机器类型',
  'PE TimeDateStamp': 'PE 链接时间戳',
};

// 分组定义（顺序决定卡片展示顺序）
const GROUP_DEFS: InfoGroupDef[] = [
  {
    id: 'os',
    titleCn: '操作系统',
    titleEn: 'Operating System',
    color: '#3b82f6',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
    keys: ['NtMajorVersion', 'NtMinorVersion', 'Major/Minor', 'NtProductType', 'NtSystemRoot', 'NtBuildLab'],
  },
  {
    id: 'kernel',
    titleCn: '内核与内存布局',
    titleEn: 'Kernel & Memory Layout',
    color: '#8b5cf6',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
    keys: ['Kernel Base', 'DTB', 'KdVersionBlock', 'KdDebuggerDataBlock', 'Symbols', 'primary', 'layer_name', 'memory_layer'],
  },
  {
    id: 'arch',
    titleCn: '处理器与架构',
    titleEn: 'Processor & Architecture',
    color: '#f59e0b',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3"/></svg>',
    keys: ['Is64Bit', 'IsPAE', 'MachineType', 'KeNumberProcessors'],
  },
  {
    id: 'pe',
    titleCn: 'PE 头信息',
    titleEn: 'PE Header',
    color: '#10b981',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    keys: ['PE MajorOperatingSystemVersion', 'PE MinorOperatingSystemVersion', 'PE Machine', 'PE TimeDateStamp'],
  },
  {
    id: 'time',
    titleCn: '时间信息',
    titleEn: 'System Time',
    color: '#06b6d4',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    keys: ['SystemTime'],
  },
  {
    id: 'other',
    titleCn: '其他信息',
    titleEn: 'Other',
    color: '#64748b',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    keys: [],
  },
];

// 机器类型代码 → 友好名称
const MACHINE_TYPES: Record<string, string> = {
  '332': 'Intel 386 (x86)',
  '34404': 'AMD64 (x64)',
  '43620': 'ARM64 (AArch64)',
  '512': 'Intel Itanium (IA64)',
  '452': 'ARM',
};

export class Vol3InfoViewer {
  private container: HTMLElement | null = null;
  private entries: InfoEntry[] = [];
  private error: string | null = null;
  private loading = false;

  init(containerId: string): void {
    this.container = document.getElementById(containerId);
    this.injectStyle();
  }

  async load(fileName: string): Promise<void> {
    if (!this.container) return;
    this.loading = true;
    this.error = null;
    this.render();
    try {
      const raw = await this.readText(fileName);
      this.entries = this.parse(raw);
    } catch (e) {
      this.error = String(e);
    }
    this.loading = false;
    this.render();
  }

  cleanup(): void {
    this.entries = [];
    this.error = null;
    this.loading = false;
  }

  /** 读取 info.txt（智能编码，兜底 read_file） */
  private async readText(fileName: string): Promise<string> {
    const settings = await loadAppSettings();
    const outputPath = (settings as any).output_path || 'output';
    const path = /^[a-zA-Z]:[\\/]/.test(fileName) || fileName.startsWith('\\\\')
      ? fileName
      : `${outputPath}\\${fileName}`;
    try {
      const r = await invoke('read_text_file_smart', { path }) as { content: string };
      return r.content;
    } catch {
      return await invoke('read_file', { path }) as string;
    }
  }

  /** 解析 `Variable\tValue` 两列文本 */
  private parse(content: string): InfoEntry[] {
    const out: InfoEntry[] = [];
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.replace(/\s+$/, '');
      if (!line.trim()) continue;

      let key: string;
      let value: string;
      const tabIdx = line.indexOf('\t');
      if (tabIdx >= 0) {
        // quick 渲染器使用制表符分隔
        key = line.slice(0, tabIdx).trim();
        value = line.slice(tabIdx + 1).replace(/\t/g, ' ').trim();
      } else {
        // 兜底：两个及以上空格分隔
        const m = line.match(/^(\S.*?)\s{2,}(.*)$/);
        if (!m) continue;
        key = m[1].trim();
        value = m[2].trim();
      }

      if (!key) continue;
      // 跳过表头行
      if (key === 'Variable' && (value === 'Value' || value === '')) continue;

      out.push({ key, keyCn: FIELD_CN[key] || key, value });
    }
    return out;
  }

  /** 将扁平条目按语义分组 */
  private groupEntries(): InfoGroup[] {
    const groups: InfoGroup[] = GROUP_DEFS.map(d => ({ ...d, entries: [] }));
    const groupById = (id: string) => groups.find(g => g.id === id)!;

    const keyToGroup = new Map<string, string>();
    GROUP_DEFS.forEach(d => d.keys.forEach(k => keyToGroup.set(k.toLowerCase(), d.id)));

    for (const e of this.entries) {
      let gid = keyToGroup.get(e.key.toLowerCase());
      if (!gid) {
        // 未知字段自动归类，兼容不同 vol3 版本的额外输出
        if (/^pe\s/i.test(e.key)) gid = 'pe';
        else if (/^nt/i.test(e.key)) gid = 'os';
        else gid = 'other';
      }
      groupById(gid).entries.push(e);
    }
    return groups.filter(g => g.entries.length > 0);
  }

  /** 取某字段的原始值 */
  private getValue(key: string): string {
    return this.entries.find(e => e.key === key)?.value || '';
  }

  private render(): void {
    if (!this.container) return;

    if (this.loading) {
      this.container.innerHTML = `<div class="vol3-info-state">正在解析系统信息…</div>`;
      return;
    }
    if (this.error) {
      this.container.innerHTML = `
        <div class="vol3-info-state">
          <div style="font-size:32px;margin-bottom:10px">📋</div>
          <div>无法加载系统信息</div>
          <div class="vol3-info-state-sub">${this.esc(this.error)}</div>
        </div>`;
      return;
    }
    if (!this.entries.length) {
      this.container.innerHTML = `<div class="vol3-info-state">暂无系统信息数据</div>`;
      return;
    }

    const groups = this.groupEntries();
    const cards = groups.map(g => this.renderCard(g)).join('');

    this.container.innerHTML = `
      <div class="vol3-info-root">
        ${this.renderSummary()}
        <div class="vol3-info-grid">${cards}</div>
      </div>`;
  }

  /** 顶部摘要横幅 */
  private renderSummary(): string {
    const major = this.getValue('NtMajorVersion');
    const minor = this.getValue('NtMinorVersion');
    const osName = major ? `Windows ${major}${minor !== '' ? '.' + minor : ''}` : 'Windows';
    const build = this.getValue('Major/Minor');
    const arch = this.getValue('Is64Bit') === 'True' ? 'x64' : (this.getValue('Is64Bit') === 'False' ? 'x86' : '');
    const cpu = this.getValue('KeNumberProcessors');
    const sysTime = this.getValue('SystemTime');

    const chips: string[] = [];
    if (build) chips.push(this.chip('Build', build));
    if (arch) chips.push(this.chip('架构', arch));
    if (cpu) chips.push(this.chip('处理器', `${cpu} 核`));
    if (sysTime) chips.push(this.chip('系统时间', sysTime));

    return `
      <div class="vol3-info-summary">
        <div class="vol3-info-summary-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
        </div>
        <div class="vol3-info-summary-main">
          <div class="vol3-info-summary-title">${this.esc(osName)}</div>
          <div class="vol3-info-summary-chips">${chips.join('')}</div>
        </div>
      </div>`;
  }

  private chip(label: string, value: string): string {
    return `<span class="vol3-info-chip"><span class="vol3-info-chip-k">${this.esc(label)}</span><span class="vol3-info-chip-v">${this.esc(value)}</span></span>`;
  }

  private renderCard(g: InfoGroup): string {
    const rows = g.entries.map((entry, idx) => `
      <div class="vol3-info-row${idx % 2 ? ' alt' : ''}">
        <span class="vol3-info-key" title="${this.esc(entry.key)}">${this.esc(entry.keyCn)}</span>
        <span class="vol3-info-val">${this.formatValue(entry)}</span>
      </div>`).join('');

    return `
      <div class="vol3-info-card">
        <div class="vol3-info-card-head" style="background:linear-gradient(135deg, ${g.color}1f, ${g.color}0a);border-color:${g.color}33">
          <span class="vol3-info-card-ic" style="color:${g.color}">${g.icon}</span>
          <span class="vol3-info-card-titles">
            <span class="vol3-info-card-cn">${this.esc(g.titleCn)}</span>
            <span class="vol3-info-card-en">${this.esc(g.titleEn)}</span>
          </span>
          <span class="vol3-info-card-badge" style="color:${g.color};background:${g.color}1a">${g.entries.length}</span>
        </div>
        <div class="vol3-info-card-body">${rows}</div>
      </div>`;
  }

  /** 值美化：布尔徽章 / 机器类型释义 / 地址等宽 / 长路径换行 */
  private formatValue(entry: InfoEntry): string {
    const v = entry.value;
    if (v === '') return '<span class="vol3-info-empty">—</span>';

    if (v === 'True') return '<span class="vol3-info-pill true">True</span>';
    if (v === 'False') return '<span class="vol3-info-pill false">False</span>';

    // 机器类型释义
    if ((entry.key === 'MachineType' || entry.key === 'PE Machine') && MACHINE_TYPES[v]) {
      return `<span class="vol3-info-mono">${this.esc(v)}</span><span class="vol3-info-hint">${this.esc(MACHINE_TYPES[v])}</span>`;
    }

    // 长路径 / 符号文件
    if (/^file:\/\//i.test(v) || v.length > 48) {
      return `<span class="vol3-info-mono wrap">${this.esc(v)}</span>`;
    }

    // 十六进制地址
    if (/^0x[0-9a-fA-F]+$/.test(v)) {
      return `<span class="vol3-info-mono">${this.esc(v)}</span>`;
    }

    return this.esc(v);
  }

  private esc(text: string): string {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
  }

  /** 注入一次性样式 */
  private injectStyle(): void {
    if (document.getElementById('vol3-info-style')) return;
    const style = document.createElement('style');
    style.id = 'vol3-info-style';
    style.textContent = `
.vol3-info-root { padding: 14px; height: 100%; overflow: auto; box-sizing: border-box; }
.vol3-info-state { padding: 48px 20px; text-align: center; color: var(--text-secondary); font-size: 13px; }
.vol3-info-state-sub { margin-top: 8px; font-size: 12px; color: var(--text-tertiary); word-break: break-all; }

.vol3-info-summary { display: flex; align-items: center; gap: 14px; padding: 14px 16px; margin-bottom: 14px;
  border: 1px solid var(--border-color); border-radius: 12px;
  background: linear-gradient(135deg, rgba(59,130,246,0.12), rgba(59,130,246,0.03)); }
.vol3-info-summary-icon { width: 40px; height: 40px; flex-shrink: 0; color: #3b82f6;
  display: flex; align-items: center; justify-content: center;
  background: rgba(59,130,246,0.14); border-radius: 10px; }
.vol3-info-summary-icon svg { width: 22px; height: 22px; }
.vol3-info-summary-main { min-width: 0; flex: 1; }
.vol3-info-summary-title { font-size: 16px; font-weight: 700; color: var(--text-primary); margin-bottom: 6px; }
.vol3-info-summary-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.vol3-info-chip { display: inline-flex; align-items: center; gap: 6px; padding: 3px 9px;
  background: var(--bg-tertiary); border-radius: 6px; font-size: 11.5px; }
.vol3-info-chip-k { color: var(--text-tertiary); }
.vol3-info-chip-v { color: var(--text-primary); font-weight: 600; }

.vol3-info-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 14px; }
.vol3-info-card { border: 1px solid var(--border-color); border-radius: 12px; overflow: hidden;
  background: var(--bg-secondary); transition: transform .15s ease, box-shadow .15s ease; }
.vol3-info-card:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.18); }
.vol3-info-card-head { display: flex; align-items: center; gap: 10px; padding: 11px 14px; border-bottom: 1px solid; }
.vol3-info-card-ic { width: 30px; height: 30px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
.vol3-info-card-ic svg { width: 18px; height: 18px; }
.vol3-info-card-titles { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.vol3-info-card-cn { font-size: 13.5px; font-weight: 700; color: var(--text-primary); }
.vol3-info-card-en { font-size: 10.5px; color: var(--text-tertiary); letter-spacing: .3px; }
.vol3-info-card-badge { flex-shrink: 0; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 10px; }
.vol3-info-card-body { padding: 4px 0; }

.vol3-info-row { display: flex; align-items: flex-start; gap: 12px; padding: 7px 14px; }
.vol3-info-row.alt { background: rgba(127,127,127,0.04); }
.vol3-info-key { flex-shrink: 0; width: 130px; font-size: 12px; color: var(--text-secondary); padding-top: 1px; }
.vol3-info-val { flex: 1; min-width: 0; text-align: right; font-size: 12.5px; color: var(--text-primary);
  display: flex; flex-direction: column; align-items: flex-end; gap: 2px; word-break: break-word; }
.vol3-info-mono { font-family: 'Consolas','Courier New',monospace; font-size: 12px; }
.vol3-info-mono.wrap { text-align: right; word-break: break-all; color: var(--text-secondary); line-height: 1.45; }
.vol3-info-hint { font-size: 10.5px; color: var(--text-tertiary); }
.vol3-info-empty { color: var(--text-tertiary); }
.vol3-info-pill { display: inline-block; padding: 1px 9px; border-radius: 10px; font-size: 11px; font-weight: 700; }
.vol3-info-pill.true { color: #10b981; background: rgba(16,185,129,0.15); }
.vol3-info-pill.false { color: #94a3b8; background: rgba(148,163,184,0.15); }
`;
    document.head.appendChild(style);
  }
}
