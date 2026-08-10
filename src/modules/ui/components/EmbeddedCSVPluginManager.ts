/**
 * 内嵌CSV查看器插件管理器
 * 复刻自 CSVPluginManager.js，用于 TypeScript 版本
 */

import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import { IconParkHelper } from '../../utils/iconparkHelper';

// IconPark 风格 SVG 图标
const PLUGIN_ICONS = {
  copy: '<svg viewBox="0 0 48 48" width="14" height="14" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M13 12.432v-4.62A2.813 2.813 0 0 1 15.813 5h24.374A2.813 2.813 0 0 1 43 7.813v24.375A2.813 2.813 0 0 1 40.187 35h-4.67"/><path d="M32.188 13H7.811A2.813 2.813 0 0 0 5 15.813v24.374A2.813 2.813 0 0 0 7.813 43h24.375A2.813 2.813 0 0 0 35 40.187V15.814A2.813 2.813 0 0 0 32.187 13z"/></svg>',
  row: '<svg viewBox="0 0 48 48" width="14" height="14" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h40v24H4z"/><path d="M12 20h24M12 28h24"/></svg>',
  ai: '<svg viewBox="0 0 48 48" width="14" height="14" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="36" height="36" rx="3"/><circle cx="17" cy="19" r="3"/><circle cx="31" cy="19" r="3"/><path d="M17 32c0-3.866 3.134-7 7-7s7 3.134 7 7"/></svg>',
  context: '<svg viewBox="0 0 48 48" width="14" height="14" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 42h32a2 2 0 0 0 2-2V14L30 4H10a2 2 0 0 0-2 2v34a2 2 0 0 0 2 2z"/><path d="M30 4v10h12"/><path d="M16 22h16M16 30h16"/></svg>',
  plugin: '<svg viewBox="0 0 48 48" width="14" height="14" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6h12v8H18zM8 14h32v28H8z"/><circle cx="18" cy="28" r="4"/><circle cx="30" cy="28" r="4"/></svg>'
};

// 插件数据结构
export interface CSVPlugin {
  id: string;
  name: string;
  description: string;
  command: string;
  icon: string;
  hotkey?: string;
  output_filename?: string;
  allowed_columns?: string[];
  allowed_filenames?: string[];
  input_labels?: Record<string, string>;
  context_menu_enabled: boolean;
  open_output_folder?: boolean;
  /** 命令分类（右键二级菜单分组），为空归入"其他" */
  category?: string;
  /** 是否为内置插件（内置库加载时为 true） */
  builtin?: boolean;
  created_at?: string;
  updated_at?: string;
}

// 上下文菜单数据
export interface ContextMenuData {
  cellValue: string;
  rowIndex: number;
  cellIndex: number;
  columnName: string;
  rowData: Record<string, string>;
}

// 插件执行上下文
interface PluginContext {
  selected_file: string;
  selected_row: number;
  selected_cell: string;
  selected_column: string;
  all_selected_cells: string;
}

// 插件执行结果
interface PluginResult {
  success: boolean;
  output?: string;
  error?: string;
  executed_command?: string;
  should_open_file?: boolean;
  output_file?: string;
  output_file_type?: string;
}

/**
 * 内嵌CSV插件管理器类
 */
export class EmbeddedCSVPluginManager {
  private plugins: CSVPlugin[] = [];
  private contextMenuData: ContextMenuData | null = null;
  private currentFilename: string = '';
  private currentFilepath: string = '';

  constructor() {}

  /**
   * 初始化插件管理器
   */
  async init(): Promise<void> {
    try {
      await this.loadPlugins();
      console.log('✅ 内嵌CSV插件管理器初始化完成');
    } catch (error) {
      console.error('❌ 内嵌CSV插件管理器初始化失败:', error);
    }
  }

  /**
   * 设置当前文件信息
   */
  setCurrentFile(filename: string, filepath: string): void {
    this.currentFilename = filename;
    this.currentFilepath = filepath;
  }

  /**
   * 加载内嵌取证操作
   */
  async loadPlugins(): Promise<void> {
    try {
      this.plugins = (await invoke('get_builtin_csv_plugins') as CSVPlugin[]) || [];
      console.log('📦 已加载内嵌 CSV 取证操作:', this.plugins.length, '个');
    } catch (error) {
      console.error('❌ 加载内嵌 CSV 取证操作失败:', error);
      this.plugins = [];
    }
  }

  /**
   * 获取指定列的可用插件
   */
  async getPluginsForColumn(columnName: string): Promise<CSVPlugin[]> {
    // 本地过滤合并后的插件池（含内置），确保内置插件也参与列匹配
    return this.plugins.filter(p => {
      if (p.context_menu_enabled === false) return false;
      if (p.allowed_columns && p.allowed_columns.length > 0 && !p.allowed_columns.includes(columnName)) return false;
      return this.isPluginAllowedForFile(p, this.currentFilename);
    });
  }

  /**
   * 汇总当前行所有可用插件，并为每个插件确定一个目标列（用于执行）。
   * - 无 allowed_columns 的插件视为适用任意列，绑定到当前列；
   * - 有 allowed_columns 的插件优先绑定当前列，否则绑定行中存在的第一个允许列。
   */
  private getApplicableRowPlugins(): Array<{ plugin: CSVPlugin; column: string }> {
    const rowData = this.contextMenuData?.rowData || {};
    const currentCol = this.contextMenuData?.columnName || '';
    const cols = Object.keys(rowData);
    const seen = new Set<string>();
    const result: Array<{ plugin: CSVPlugin; column: string }> = [];

    for (const p of this.plugins) {
      if (p.context_menu_enabled === false) continue;
      if (!this.isPluginAllowedForFile(p, this.currentFilename)) continue;

      let col = '';
      if (!p.allowed_columns || p.allowed_columns.length === 0) {
        col = currentCol || cols[0] || '';
      } else if (currentCol && p.allowed_columns.includes(currentCol)) {
        col = currentCol;
      } else {
        col = p.allowed_columns.find(c => cols.includes(c)) || '';
        if (!col) continue; // 该行没有此插件可用的列
      }

      if (seen.has(p.id)) continue;
      seen.add(p.id);
      result.push({ plugin: p, column: col });
    }
    return result;
  }

  private isPluginAllowedForFile(plugin: CSVPlugin, currentFileName: string): boolean {
    const allowed = plugin.allowed_filenames;
    if (!allowed || !Array.isArray(allowed) || allowed.length === 0) return true;
    if (!currentFileName) return true;

    const fileLower = currentFileName.toLowerCase();

    return allowed.some((rule) => {
      if (typeof rule !== 'string') return false;
      const r = rule.trim().toLowerCase();
      if (!r) return false;
      if (r === '*') return true;

      if (r.includes('*')) {
        const escaped = r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = '^' + escaped.replace(/\*/g, '.*') + '$';
        try {
          return new RegExp(pattern, 'i').test(currentFileName);
        } catch {
          return false;
        }
      }

      return r === fileLower;
    });
  }

  /**
   * 设置上下文数据
   */
  setContextMenuData(data: ContextMenuData): void {
    this.contextMenuData = data;
  }

  /**
   * 渲染右键菜单HTML
   */
  async renderContextMenu(): Promise<string> {
    // 汇总可用插件并按「命令分类」组织成二级菜单
    const applicable = this.getApplicableRowPlugins();

    // 按分类分组（保持插件原有顺序：内置在前、同类聚拢）
    const groups = new Map<string, Array<{ plugin: CSVPlugin; column: string }>>();
    for (const item of applicable) {
      const cat = (item.plugin.category && item.plugin.category.trim()) || '其他';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(item);
    }

    let pluginMenuHtml = '';
    for (const [cat, items] of groups) {
      const subItems = items.map(({ plugin, column }) => `
        <div class="context-menu-item plugin-item" data-plugin-id="${plugin.id}" data-column="${this.escapeHtml(column)}">
          <span class="context-menu-icon">${this.renderPluginIcon(plugin.icon)}</span>
          <span>${this.escapeHtml(plugin.name)}</span>
        </div>
      `).join('');
      pluginMenuHtml += `
        <div class="context-menu-submenu">
          <div class="context-menu-item context-menu-submenu-trigger">
            <span class="context-menu-icon">${PLUGIN_ICONS.plugin}</span>
            <span class="context-menu-name">${this.escapeHtml(cat)}</span>
            <span class="context-menu-count">${items.length}</span>
            <span class="context-menu-submenu-arrow">▸</span>
          </div>
          <div class="context-menu-submenu-panel">${subItems}</div>
        </div>
      `;
    }

    if (!pluginMenuHtml) {
      pluginMenuHtml = `
        <div class="context-menu-item disabled">
          <span class="context-menu-icon">${PLUGIN_ICONS.plugin}</span>
          <span style="color: var(--text-tertiary);">暂无可用取证操作</span>
        </div>
      `;
    }

    return `
      <div class="embedded-csv-context-menu" id="embedded-csv-context-menu" style="display: none;">
        <!-- 顶部条件项占位（时区转换等） -->
        <div class="context-menu-conditional-top" id="ctx-conditional-top"></div>
        <!-- 复制 二级菜单 -->
        <div class="context-menu-submenu">
          <div class="context-menu-item context-menu-submenu-trigger">
            <span class="context-menu-icon">${PLUGIN_ICONS.copy}</span>
            <span class="context-menu-name">复制</span>
            <span class="context-menu-submenu-arrow">▸</span>
          </div>
          <div class="context-menu-submenu-panel">
            <div class="context-menu-item" data-action="copy-cell">
              <span class="context-menu-icon">${PLUGIN_ICONS.copy}</span>
              <span>复制单元格</span>
            </div>
            <div class="context-menu-item" data-action="copy-row">
              <span class="context-menu-icon">${PLUGIN_ICONS.row}</span>
              <span>复制整行</span>
            </div>
            <div class="context-menu-item" data-action="copy-row-json">
              <span class="context-menu-icon">{ }</span>
              <span>复制整行(JSON)</span>
            </div>
          </div>
        </div>
        <div class="context-menu-item" data-action="ai-analyze">
          <span class="context-menu-icon">${PLUGIN_ICONS.ai}</span>
          <span>AI分析此行</span>
        </div>
        <!-- 条件动作占位（查看文件内容/可视化进程内存/凭据等，运行时注入） -->
        <div class="context-menu-conditional" id="ctx-conditional"></div>
        <div class="context-menu-separator"></div>
        <div class="context-menu-plugins" id="context-menu-plugins">
          ${pluginMenuHtml}
        </div>
      </div>
    `;
  }

  /**
   * 获取当前行所有列的插件
   */
  private async getAllRowPlugins(): Promise<Map<string, CSVPlugin[]>> {
    const result = new Map<string, CSVPlugin[]>();
    if (!this.contextMenuData?.rowData) return result;

    const columnName = this.contextMenuData.columnName;
    
    // 先添加当前列
    const currentColumnPlugins = await this.getPluginsForColumn(columnName);
    if (currentColumnPlugins.length > 0) {
      result.set(columnName, currentColumnPlugins);
    }

    // 再添加其他列
    for (const col of Object.keys(this.contextMenuData.rowData)) {
      if (col !== columnName) {
        const plugins = await this.getPluginsForColumn(col);
        if (plugins.length > 0) {
          result.set(col, plugins);
        }
      }
    }

    return result;
  }

  /**
   * 处理右键菜单动作
   */
  async handleAction(action: string, pluginId?: string, targetColumn?: string): Promise<void> {
    if (!this.contextMenuData) return;

    switch (action) {
      case 'copy-cell':
        await this.copyToClipboard(this.contextMenuData.cellValue);
        this.showNotification('✅ 已复制单元格');
        break;

      case 'copy-row':
        const rowText = Object.entries(this.contextMenuData.rowData)
          .map(([key, value]) => `${key}: ${value}`)
          .join('\n');
        await this.copyToClipboard(rowText);
        this.showNotification('✅ 已复制整行');
        break;

      case 'copy-row-json':
        await this.copyToClipboard(JSON.stringify(this.contextMenuData.rowData, null, 2));
        this.showNotification('✅ 已复制整行(JSON)');
        break;

      case 'ai-analyze':
        await this.aiAnalyzeRow();
        break;

      case 'view-context':
        this.showRowContext();
        break;

      case 'execute-plugin':
        if (pluginId) {
          // 如果是其他列的插件，临时更新上下文
          if (targetColumn && targetColumn !== this.contextMenuData.columnName) {
            const originalContext = { ...this.contextMenuData };
            this.contextMenuData.columnName = targetColumn;
            this.contextMenuData.cellValue = this.contextMenuData.rowData[targetColumn] || '';
            await this.executePlugin(pluginId);
            this.contextMenuData = originalContext;
          } else {
            await this.executePlugin(pluginId);
          }
        }
        break;
    }
  }

  /**
   * 执行插件
   */
  async executePlugin(pluginId: string): Promise<void> {
    if (!this.contextMenuData) {
      console.error('❌ 缺少上下文数据');
      return;
    }

    const plugin = this.plugins.find(p => p.id === pluginId);
    if (!plugin) {
      console.error('❌ 取证操作不存在:', pluginId);
      return;
    }

    const commandId = Date.now() + Math.random();

    // 立即显示执行中提示
    const executingNotification = this.showPersistentNotification(`⏳ 正在执行 ${plugin.name}...`);

    try {
      console.log('🚀 执行内嵌取证操作:', plugin.name);

      // 发送命令开始事件
      await emit('csv-plugin-command', {
        id: commandId,
        name: `CSV取证操作: ${plugin.name}`,
        command: '正在执行内嵌操作...',
        status: 'running',
        time: new Date().toLocaleString()
      });

      const context: PluginContext = {
        selected_file: this.currentFilepath,
        selected_row: this.contextMenuData.rowIndex,
        selected_cell: this.contextMenuData.cellValue,
        selected_column: this.contextMenuData.columnName,
        all_selected_cells: this.contextMenuData.cellValue
      };

      const result = await invoke('execute_embedded_forensic_action', {
        pluginId: pluginId,
        context: context
      }) as PluginResult;

      console.log('✅ 插件执行完成:', result);

      // 移除执行中提示
      this.dismissNotification(executingNotification);

      // 发送命令完成事件
      await emit('csv-plugin-command', {
        id: commandId,
        name: `CSV取证操作: ${plugin.name}`,
        command: result.executed_command || plugin.command || '内嵌操作',
        status: result.success ? 'completed' : 'error',
        time: new Date().toLocaleString(),
        output: result.output || '',
        error: result.success ? undefined : (result.output || '取证操作执行失败')
      });

      this.showPluginResult(result, plugin.name);

      // 如果需要打开输出文件（csv/txt 等用对应的新窗口查看器打开）
      if (result.should_open_file && result.output_file) {
        await this.openOutputFile(result.output_file, result.output_file_type);
      }

    } catch (error) {
      console.error('❌ 取证操作执行失败:', error);

      // 移除执行中提示
      this.dismissNotification(executingNotification);

      await emit('csv-plugin-command', {
        id: commandId,
        name: `CSV取证操作: ${plugin.name}`,
        command: plugin.command || '内嵌操作',
        status: 'error',
        time: new Date().toLocaleString(),
        error: '取证操作执行失败: ' + error
      });

      this.showNotification('❌ 取证操作执行失败: ' + error);
    }
  }

  /**
   * AI分析行
   */
  private async aiAnalyzeRow(): Promise<void> {
    if (!this.contextMenuData) return;

    try {
      const rowData = this.contextMenuData.rowData;
      const analysisData = {
        filename: this.currentFilename,
        rowIndex: this.contextMenuData.rowIndex,
        rowData: rowData
      };

      // 发送到AI分析
      await emit('ai-analyze-csv-row', analysisData);
      this.showNotification('📤 已发送至AI分析');
    } catch (error) {
      console.error('❌ AI分析失败:', error);
      this.showNotification('❌ AI分析失败');
    }
  }

  /**
   * 显示行上下文
   */
  private showRowContext(): void {
    if (!this.contextMenuData) return;

    // 发送事件让外部处理
    const event = new CustomEvent('show-row-context', {
      detail: {
        rowIndex: this.contextMenuData.rowIndex,
        rowData: this.contextMenuData.rowData
      }
    });
    document.dispatchEvent(event);
  }

  /**
   * 显示插件执行结果
   */
  private showPluginResult(result: PluginResult, pluginName: string): void {
    if (result.success) {
      this.showNotification(`✅ ${pluginName} 执行成功`);
    } else {
      this.showNotification(`❌ ${pluginName} 执行失败`);
    }
  }

  /**
   * 打开输出文件
   */
  private async openOutputFile(filePath: string, fileType?: string): Promise<void> {
    const ext = (fileType || filePath.split('.').pop() || '').toLowerCase();
    const title = filePath.split(/[\\/]/).pop() || filePath;
    try {
      if (ext === 'directory') {
        await invoke('open_path', { path: filePath });
      } else if (ext === 'csv') {
        // CSV 用内置 CSV 查看器新窗口打开
        await invoke('open_csv_viewer', {
          csvFilePath: filePath,
          windowTitle: title,
          searchQuery: null,
        });
      } else if (['txt', 'log', 'json', 'xml'].includes(ext)) {
        // 文本类优先用内嵌模态框预览（内含"在新窗口打开"按钮）
        await this.showTextPreviewModal(filePath, title);
      } else {
        // 其他类型回退到资源管理器
        await invoke('open_folder_and_select', { path: filePath });
      }
    } catch (error) {
      console.error('❌ 打开输出文件失败，回退到资源管理器:', error);
      try {
        await invoke('open_folder_and_select', { path: filePath });
      } catch { /* ignore */ }
    }
  }

  /**
   * 文本文件内嵌预览模态框（含"在新窗口打开"按钮）
   */
  private async showTextPreviewModal(filePath: string, title: string): Promise<void> {
    let content = '';
    try {
      content = await invoke<string>('read_file', { path: filePath });
    } catch (e) {
      content = `读取文件失败: ${e}`;
    }
    const MAX = 500 * 1024;
    let truncated = false;
    if (content.length > MAX) {
      content = content.slice(0, MAX);
      truncated = true;
    }

    const overlay = document.createElement('div');
    overlay.className = 'csv-text-preview-overlay';
    overlay.innerHTML = `
      <div class="csv-text-preview-modal">
        <div class="csv-text-preview-header">
          <span class="csv-text-preview-title" title="${this.escapeHtml(filePath)}">${this.escapeHtml(title)}</span>
          <div class="csv-text-preview-actions">
            <button class="csv-text-preview-btn" data-act="newwin">在新窗口打开</button>
            <button class="csv-text-preview-btn csv-text-preview-close" data-act="close">关闭</button>
          </div>
        </div>
        ${truncated ? '<div class="csv-text-preview-warn">内容较大，仅预览前 500KB，完整内容请在新窗口打开</div>' : ''}
        <pre class="csv-text-preview-body">${this.escapeHtml(content)}</pre>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('[data-act="close"]')?.addEventListener('click', close);
    overlay.querySelector('[data-act="newwin"]')?.addEventListener('click', async () => {
      close();
      try {
        await invoke('open_text_viewer', { textFilePath: filePath, windowTitle: title, searchQuery: null });
      } catch (e) {
        console.error('打开文本查看器窗口失败:', e);
      }
    });
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
    };
    document.addEventListener('keydown', esc);
  }

  /**
   * 复制到剪贴板
   */
  private async copyToClipboard(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.error('❌ 复制失败:', error);
    }
  }

  /** 去除通知文本中的 emoji / 符号图标，保持通知纯文本 */
  private stripEmoji(message: string): string {
    return message
      .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{FE0F}\u{200D}]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * 显示通知（自动消失）
   */
  private showNotification(message: string): void {
    const notification = document.createElement('div');
    notification.className = 'embedded-csv-notification';
    notification.textContent = this.stripEmoji(message);
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.classList.add('fade-out');
      setTimeout(() => notification.remove(), 300);
    }, 2500);
  }

  /**
   * 显示持久通知（不自动消失，需手动调用 dismissNotification）
   */
  private showPersistentNotification(message: string): HTMLElement {
    const notification = document.createElement('div');
    notification.className = 'embedded-csv-notification embedded-csv-notification-persistent';
    notification.textContent = this.stripEmoji(message);
    document.body.appendChild(notification);
    return notification;
  }

  /**
   * 移除持久通知
   */
  private dismissNotification(notification: HTMLElement | null): void {
    if (notification && notification.parentNode) {
      notification.classList.add('fade-out');
      setTimeout(() => notification.remove(), 200);
    }
  }

  /**
   * 渲染插件图标为 SVG：
   * - 已是 SVG/HTML 直接用；
   * - emoji 经 IconParkHelper 映射为 SVG；
   * - 无法映射则回退到通用插件 SVG 图标（保证不残留 emoji）。
   */
  private renderPluginIcon(icon?: string): string {
    const raw = (icon || '').trim();
    if (raw.startsWith('<svg') || raw.startsWith('<')) return raw;
    if (raw) {
      const name = IconParkHelper.getIconNameFromEmoji(raw);
      if (name) {
        const svg = IconParkHelper.getSvgString(name, { size: 14 });
        if (svg) return svg;
      }
    }
    return PLUGIN_ICONS.plugin;
  }

  /**
   * HTML转义
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * 获取插件列表
   */
  getPlugins(): CSVPlugin[] {
    return this.plugins;
  }
}

// 导出单例
export const embeddedCSVPluginManager = new EmbeddedCSVPluginManager();
