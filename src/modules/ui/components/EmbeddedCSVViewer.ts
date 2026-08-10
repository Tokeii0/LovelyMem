import { invoke as _invoke } from '@tauri-apps/api/core';
/**
 * 内嵌式CSV查看器组件
 * 用于在工作区内部直接显示CSV数据，无需打开新窗口
 */

import { invoke } from '@tauri-apps/api/core';
import { loadAppSettings } from '../../core/settingsHelper';
import { getMountRoot } from '../../core/mountDrive';
import { EmbeddedCSVPluginManager, ContextMenuData } from './EmbeddedCSVPluginManager';
import { EmbeddedCSVTooltipRuleManager } from './EmbeddedCSVTooltipRuleManager';
import { MessageManager } from '../../utils/message';
import { friendlyError } from '../../utils/errorMessage';
import { dumpAndVisualize } from '../../memory-image-visualizer/dumpAndVisualize';
import { translate } from '../../../i18n';

export interface CSVData {
  filename: string;
  filepath: string;
  headers: string[];
  rows: Record<string, string>[];
}

export interface EmbeddedCSVViewerState {
  isLoading: boolean;
  error: string | null;
  data: CSVData | null;
  currentPage: number;
  rowsPerPage: number;
  totalPages: number;
  searchKeyword: string;
  filteredRows: Record<string, string>[];
  sortColumn: string | null;
  sortDirection: 'asc' | 'desc';
  // 列筛选相关
  columnFilters: Map<string, Set<string>>; // 每列选中的筛选值
  // 文本视图相关
  viewMode: 'csv' | 'text';
  textContent: string;
  textLines: string[];
  filteredTextLines: string[];
}

export class EmbeddedCSVViewer {
  private container: HTMLElement | null = null;
  private state: EmbeddedCSVViewerState = {
    isLoading: false,
    error: null,
    data: null,
    currentPage: 1,
    rowsPerPage: 100,
    totalPages: 1,
    searchKeyword: '',
    filteredRows: [],
    sortColumn: null,
    sortDirection: 'asc',
    columnFilters: new Map(),
    viewMode: 'csv',
    textContent: '',
    textLines: [],
    filteredTextLines: []
  };

  // 条件颜色映射系统
  private colorCoding = {
    enabled: true,
    // 指定需要着色的列名
    targetColumns: [
      'Action', 'Type', 'User', 'IntegrityLevel', 'State', 'SrcAddr', 'SrcPort',
      'Wow64', 'Tag', 'HandleCount', 'pslist', 'psscan', 'thrdproc', 'pspcid',
      'csrss', 'session', 'deskthrd', 'Attributes', 'Privilege', 'LocalAddr', 'LocalPort'
    ],
    // 特殊值的固定颜色映射
    specialValues: {
      // 布尔值 - 绿色/红色
      'True': { backgroundColor: '#E8F5E8', textColor: '#2E7D32' },
      'true': { backgroundColor: '#E8F5E8', textColor: '#2E7D32' },
      'TRUE': { backgroundColor: '#E8F5E8', textColor: '#2E7D32' },
      'False': { backgroundColor: '#FFEBEE', textColor: '#D32F2F' },
      'false': { backgroundColor: '#FFEBEE', textColor: '#D32F2F' },
      'FALSE': { backgroundColor: '#FFEBEE', textColor: '#D32F2F' },
      // Yes/No
      'Yes': { backgroundColor: '#E8F5E8', textColor: '#2E7D32' },
      'yes': { backgroundColor: '#E8F5E8', textColor: '#2E7D32' },
      'YES': { backgroundColor: '#E8F5E8', textColor: '#2E7D32' },
      'No': { backgroundColor: '#FFEBEE', textColor: '#D32F2F' },
      'no': { backgroundColor: '#FFEBEE', textColor: '#D32F2F' },
      'NO': { backgroundColor: '#FFEBEE', textColor: '#D32F2F' },
      // Success/Failed/Error
      'Success': { backgroundColor: '#E8F5E8', textColor: '#2E7D32' },
      'success': { backgroundColor: '#E8F5E8', textColor: '#2E7D32' },
      'SUCCESS': { backgroundColor: '#E8F5E8', textColor: '#2E7D32' },
      'Failed': { backgroundColor: '#FFEBEE', textColor: '#D32F2F' },
      'failed': { backgroundColor: '#FFEBEE', textColor: '#D32F2F' },
      'FAILED': { backgroundColor: '#FFEBEE', textColor: '#D32F2F' },
      'Error': { backgroundColor: '#FFEBEE', textColor: '#D32F2F' },
      'error': { backgroundColor: '#FFEBEE', textColor: '#D32F2F' },
      'ERROR': { backgroundColor: '#FFEBEE', textColor: '#D32F2F' },
      // OK
      'OK': { backgroundColor: '#E8F5E8', textColor: '#2E7D32' },
      'ok': { backgroundColor: '#E8F5E8', textColor: '#2E7D32' },
      // Enabled/Disabled
      'Enabled': { backgroundColor: '#E8F5E8', textColor: '#2E7D32' },
      'enabled': { backgroundColor: '#E8F5E8', textColor: '#2E7D32' },
      'ENABLED': { backgroundColor: '#E8F5E8', textColor: '#2E7D32' },
      'Disabled': { backgroundColor: '#FFEBEE', textColor: '#D32F2F' },
      'disabled': { backgroundColor: '#FFEBEE', textColor: '#D32F2F' },
      'DISABLED': { backgroundColor: '#FFEBEE', textColor: '#D32F2F' },
      // DEL/CRE/MOD 操作
      'DEL': { backgroundColor: '#FFEBEE', textColor: '#D32F2F' },
      'del': { backgroundColor: '#FFEBEE', textColor: '#D32F2F' },
      'DELETE': { backgroundColor: '#FFEBEE', textColor: '#D32F2F' },
      'CRE': { backgroundColor: '#E8F5E8', textColor: '#2E7D32' },
      'cre': { backgroundColor: '#E8F5E8', textColor: '#2E7D32' },
      'CREATE': { backgroundColor: '#E8F5E8', textColor: '#2E7D32' },
      'MOD': { backgroundColor: '#FFF8E1', textColor: '#F57F17' },
      'mod': { backgroundColor: '#FFF8E1', textColor: '#F57F17' },
      'MODIFY': { backgroundColor: '#FFF8E1', textColor: '#F57F17' },
      // 网络状态
      'Running': { backgroundColor: '#dbeafe', textColor: '#1e40af' },
      'Stopped': { backgroundColor: '#fef3c7', textColor: '#92400e' },
      'ESTABLISHED': { backgroundColor: '#E8F5E8', textColor: '#2E7D32' },
      'LISTEN': { backgroundColor: '#E3F2FD', textColor: '#1565C0' },
      'CLOSE_WAIT': { backgroundColor: '#FFF8E1', textColor: '#F57F17' },
      'TIME_WAIT': { backgroundColor: '#FFF8E1', textColor: '#F57F17' },
      'SYN_SENT': { backgroundColor: '#E3F2FD', textColor: '#1565C0' },
      'SYN_RECV': { backgroundColor: '#E3F2FD', textColor: '#1565C0' },
      'FIN_WAIT1': { backgroundColor: '#FFF8E1', textColor: '#F57F17' },
      'FIN_WAIT2': { backgroundColor: '#FFF8E1', textColor: '#F57F17' },
      'LAST_ACK': { backgroundColor: '#FFF8E1', textColor: '#F57F17' },
      'CLOSING': { backgroundColor: '#FFF8E1', textColor: '#F57F17' }
    } as Record<string, { backgroundColor: string; textColor: string }>,
    // 每列的值-颜色映射
    columnColorMaps: new Map<string, Map<string, { backgroundColor: string; textColor: string }>>(),
    // 动态颜色调色板
    colorPalette: [
      '#E3F2FD', '#E8F5E8', '#FFF3E0', '#FCE4EC', '#F3E5F5',
      '#E0F2F1', '#FFF8E1', '#FFEBEE', '#E1F5FE', '#F1F8E9',
      '#FFF9C4', '#FFEAA7', '#DDD6FE', '#DBEAFE', '#D1FAE5'
    ],
    textColors: [
      '#1565C0', '#2E7D32', '#EF6C00', '#C2185B', '#7B1FA2',
      '#00695C', '#F57F17', '#D32F2F', '#0277BD', '#558B2F',
      '#F9A825', '#FF8F00', '#5B21B6', '#1E40AF', '#059669'
    ]
  };

  private onDataLoadedCallback: ((rowCount: number) => void) | null = null;

  // 右键菜单数据
  private contextMenuData: ContextMenuData | null = null;

  // 外部视图（进程树/服务/… 等第二视图）复用本菜单时的文件上下文覆盖；
  // 为 null 时表示本 CSV 表格自身触发，走 state/currentLoadInfo。
  private externalFileContext: { loadFileName?: string; displayName?: string } | null = null;

  // 插件管理器
  private pluginManager: EmbeddedCSVPluginManager;
  
  // 工具提示规则管理器
  private tooltipRuleManager: EmbeddedCSVTooltipRuleManager;

  // 当前加载的文件信息（用于重试）
  private currentLoadInfo: {
    fileName: string;
    displayName: string;
    type: 'csv' | 'text';
  } | null = null;

  // 时区转换相关
  private readonly TIMEZONES = [
    { name: 'UTC', offset: 0, label: 'UTC (协调世界时)' },
    { name: 'Asia/Shanghai', offset: 8, label: 'UTC+8 (北京时间)' },
    { name: 'America/New_York', offset: -5, label: 'UTC-5 (纽约, EST)' },
    { name: 'America/Los_Angeles', offset: -8, label: 'UTC-8 (洛杉矶, PST)' },
    { name: 'Europe/London', offset: 0, label: 'UTC+0 (伦敦, GMT)' },
    { name: 'Europe/Paris', offset: 1, label: 'UTC+1 (巴黎, CET)' },
    { name: 'Asia/Tokyo', offset: 9, label: 'UTC+9 (东京, JST)' },
    { name: 'Asia/Dubai', offset: 4, label: 'UTC+4 (迪拜)' },
    { name: 'Australia/Sydney', offset: 10, label: 'UTC+10 (悉尼)' },
  ];

  // SVG图标
  private readonly ICONS = {
    globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>'
  };

  // 工具提示相关
  private tooltipElement: HTMLElement | null = null;
  private tooltipShowTimer: number | null = null;
  private tooltipHideTimer: number | null = null;
  private currentTooltipCell: HTMLElement | null = null;
  private settings: { tooltip_rules_path?: string } | null = null;

  constructor() {
    this.pluginManager = new EmbeddedCSVPluginManager();
    this.tooltipRuleManager = new EmbeddedCSVTooltipRuleManager();
    this.createTooltipElement();
    this.loadSettings();
  }

  /**
   * 加载设置
   */
  private async loadSettings(): Promise<void> {
    try {
      this.settings = await loadAppSettings();
    } catch (error) {
      console.error('❌ 加载设置失败:', error);
      this.settings = { tooltip_rules_path: 'tooltip_rules' };
    }
  }

  /**
   * 创建工具提示元素
   */
  private createTooltipElement(): void {
    // 移除已存在的工具提示元素
    const existing = document.querySelector('.embedded-csv-tooltip');
    if (existing) {
      existing.remove();
    }

    this.tooltipElement = document.createElement('div');
    this.tooltipElement.className = 'embedded-csv-tooltip';
    this.tooltipElement.style.cssText = `
      position: fixed;
      z-index: 999999;
      background: var(--csv-tooltip-bg, #2d3748);
      color: var(--csv-tooltip-color, #ffffff);
      border: 1px solid var(--csv-tooltip-border, #4a5568);
      border-radius: 6px;
      padding: 8px 12px;
      font-size: 12px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.5;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      max-width: 300px;
      min-width: 120px;
      word-wrap: break-word;
      white-space: pre-wrap;
      pointer-events: none;
      opacity: 0;
      transform: translateY(-5px) scale(0.95);
      transition: all 0.15s ease-out;
      display: none;
    `;
    document.body.appendChild(this.tooltipElement);
  }

  /**
   * 获取工具提示文本
   */
  private async getTooltipText(columnName: string, cellValue: string): Promise<string | null> {
    try {
      const rulesPath = this.settings?.tooltip_rules_path || 'tooltip_rules';
      const tooltip = await invoke('get_cell_tooltip', {
        columnName: columnName,
        cellValue: String(cellValue),
        rulesPath: rulesPath
      }) as string | null;
      return tooltip;
    } catch (error) {
      // 静默失败，不打印错误
      return null;
    }
  }

  /**
   * 显示工具提示
   */
  private showTooltip(event: MouseEvent, text: string): void {
    if (!text || !this.tooltipElement) return;

    this.tooltipElement.textContent = text;
    this.tooltipElement.style.display = 'block';
    this.tooltipElement.style.visibility = 'hidden';

    // 计算位置
    const rect = this.tooltipElement.getBoundingClientRect();
    let x = event.clientX + 10;
    let y = event.clientY - rect.height - 10;

    // 防止超出视口
    if (x + rect.width > window.innerWidth) {
      x = window.innerWidth - rect.width - 10;
    }
    if (y < 0) {
      y = event.clientY + 20;
    }
    if (x < 0) {
      x = 10;
    }

    this.tooltipElement.style.left = `${x}px`;
    this.tooltipElement.style.top = `${y}px`;
    this.tooltipElement.style.visibility = 'visible';

    requestAnimationFrame(() => {
      if (this.tooltipElement) {
        this.tooltipElement.style.opacity = '1';
        this.tooltipElement.style.transform = 'translateY(0) scale(1)';
      }
    });
  }

  /**
   * 隐藏工具提示
   */
  private hideTooltip(): void {
    if (!this.tooltipElement) return;

    this.tooltipElement.style.opacity = '0';
    this.tooltipElement.style.transform = 'translateY(-5px) scale(0.95)';

    setTimeout(() => {
      if (this.tooltipElement) {
        this.tooltipElement.style.display = 'none';
      }
    }, 150);
  }

  /**
   * 清除工具提示定时器
   */
  private clearTooltipTimers(): void {
    if (this.tooltipShowTimer) {
      clearTimeout(this.tooltipShowTimer);
      this.tooltipShowTimer = null;
    }
    if (this.tooltipHideTimer) {
      clearTimeout(this.tooltipHideTimer);
      this.tooltipHideTimer = null;
    }
  }

  /**
   * 处理单元格悬停
   */
  private handleCellMouseEnter(event: MouseEvent, cell: HTMLElement, columnName: string, cellValue: string): void {
    this.clearTooltipTimers();
    this.currentTooltipCell = cell;

    this.tooltipShowTimer = window.setTimeout(async () => {
      if (this.currentTooltipCell !== cell) return;

      const tooltipText = await this.getTooltipText(columnName, cellValue);
      if (tooltipText && this.currentTooltipCell === cell) {
        this.showTooltip(event, tooltipText);
        // 添加视觉提示
        cell.style.cursor = 'help';
      }
    }, 500);
  }

  /**
   * 处理单元格离开
   */
  private handleCellMouseLeave(): void {
    this.clearTooltipTimers();
    this.currentTooltipCell = null;
    this.hideTooltip();
  }

  /**
   * 初始化查看器
   */
  init(containerId: string, onDataLoaded?: (rowCount: number) => void): void {
    this.container = document.getElementById(containerId);
    if (onDataLoaded) {
      this.onDataLoadedCallback = onDataLoaded;
    }
    if (!this.container) {
      console.error('EmbeddedCSVViewer: 找不到容器元素', containerId);
      return;
    }
    
    // 初始化插件管理器
    this.pluginManager.init();
    
    this.render();
  }

  /**
   * 加载CSV文件
   */
  /** 绝对路径(含盘符 X:\ 或 UNC \\)直接使用，否则相对 output 目录 */
  private resolvePath(fileName: string, outputPath: string): string {
    if (/^[a-zA-Z]:[\\/]/.test(fileName) || fileName.startsWith('\\\\')) {
      return fileName;
    }
    return `${outputPath}\\${fileName}`;
  }

  async loadCSV(csvFileName: string, displayName: string): Promise<void> {
    if (!this.container) return;

    // 保存当前加载信息，用于重试
    this.currentLoadInfo = {
      fileName: csvFileName,
      displayName: displayName,
      type: 'csv'
    };

    this.state.isLoading = true;
    this.state.error = null;
    this.state.viewMode = 'csv';
    this.state.data = null;
    this.render();

    try {
      // 获取用户设置中的输出路径
      const settings = await loadAppSettings();
      const outputPath = settings.output_path || 'output';
      const csvPath = this.resolvePath(csvFileName, outputPath);

      console.log(`📊 加载CSV文件: ${csvPath}`);

      // 调用后端命令读取CSV文件
      const csvData = await invoke('read_csv_file_embedded', {
        csvFilePath: csvPath
      }) as CSVData;

      this.state.data = {
        ...csvData,
        filename: displayName
      };
      this.state.filteredRows = [...csvData.rows];
      this.state.currentPage = 1;
      this.calculatePagination();

      // 生成列颜色映射
      this.generateColumnColorMaps();

      // 设置插件管理器的当前文件信息
      this.pluginManager.setCurrentFile(displayName, csvPath);

      console.log(`✅ CSV数据加载完成: ${csvData.rows.length} 行`);
      
      // 通知父组件数据加载完成
      if (this.onDataLoadedCallback) {
        this.onDataLoadedCallback(csvData.rows.length);
      }

    } catch (error) {
      console.error('❌ 加载CSV失败:', error);
      this.state.error = friendlyError(error).message;
    } finally {
      this.state.isLoading = false;
      this.render();
      this.showContextMenuGuide();
    }
  }

  /**
   * 加载文本文件
   */
  async loadText(textFileName: string, displayName: string): Promise<void> {
    if (!this.container) return;

    // 保存当前加载信息，用于重试
    this.currentLoadInfo = {
      fileName: textFileName,
      displayName: displayName,
      type: 'text'
    };

    this.state.isLoading = true;
    this.state.error = null;
    this.state.viewMode = 'text';
    this.state.data = null;
    this.render();

    try {
      const settings = await loadAppSettings();
      const outputPath = settings.output_path || 'output';
      const textPath = this.resolvePath(textFileName, outputPath);

      console.log(`📄 加载文本文件: ${textPath}`);

      // 智能编码识别读取（兼容 Vol2 GBK 输出 / UTF-8 BOM 等）
      // 旧的 read_file 命令对非 UTF-8 文件直接报错，对 Vol2 在中文 Windows 上的 txt 输出尤其常见
      let content: string;
      try {
        const result = (await invoke('read_text_file_smart', { path: textPath })) as {
          content: string;
          encoding: string;
          had_invalid_bytes: boolean;
        };
        content = result.content;
        if (result.encoding !== 'UTF-8') {
          console.log(
            `📄 文件编码自动识别: ${result.encoding}${
              result.had_invalid_bytes ? ' (含无效字节，已替换)' : ''
            }`,
          );
        }
      } catch (smartErr) {
        // 兜底：旧命令（极端情况）
        console.warn('智能解码失败，降级 read_file:', smartErr);
        content = (await invoke('read_file', { path: textPath })) as string;
      }

      // 保存原始文本内容
      this.state.textContent = content;
      this.state.textLines = content.split('\n');
      this.state.filteredTextLines = [...this.state.textLines];
      this.state.currentPage = 1;
      
      // 设置文件信息用于显示
      this.state.data = {
        filename: displayName,
        filepath: textPath,
        headers: [],
        rows: []
      };

      // 计算分页
      this.calculateTextPagination();

      // 设置插件管理器的当前文件信息
      this.pluginManager.setCurrentFile(displayName, textPath);

      console.log(`✅ 文本数据加载完成: ${this.state.textLines.length} 行`);
      
      // 通知父组件数据加载完成
      if (this.onDataLoadedCallback) {
        this.onDataLoadedCallback(this.state.textLines.length);
      }

    } catch (error) {
      console.error('❌ 加载文本失败:', error);
      this.state.error = String(error);
    } finally {
      this.state.isLoading = false;
      this.render();
      this.showContextMenuGuide();
    }
  }

  /**
   * 计算文本分页
   */
  private calculateTextPagination(): void {
    const totalLines = this.state.filteredTextLines.length;
    this.state.totalPages = Math.max(1, Math.ceil(totalLines / this.state.rowsPerPage));
    if (this.state.currentPage > this.state.totalPages) {
      this.state.currentPage = this.state.totalPages;
    }
  }

  /**
   * 获取当前页文本行
   */
  private getCurrentPageTextLines(): string[] {
    const start = (this.state.currentPage - 1) * this.state.rowsPerPage;
    const end = start + this.state.rowsPerPage;
    return this.state.filteredTextLines.slice(start, end);
  }

  /**
   * 过滤文本内容
   */
  private filterTextContent(): void {
    if (!this.state.searchKeyword.trim()) {
      this.state.filteredTextLines = [...this.state.textLines];
    } else {
      const keyword = this.state.searchKeyword.toLowerCase();
      this.state.filteredTextLines = this.state.textLines.filter(line => 
        line.toLowerCase().includes(keyword)
      );
    }
    this.state.currentPage = 1;
    this.calculateTextPagination();
  }

  /**
   * 高亮文本中的搜索关键词
   */
  private highlightTextLine(line: string): string {
    if (!this.state.searchKeyword.trim()) {
      return this.escapeHtml(line);
    }
    
    const escaped = this.escapeHtml(line);
    const keyword = this.escapeHtml(this.state.searchKeyword);
    const regex = new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return escaped.replace(regex, '<mark class="text-highlight">$1</mark>');
  }

  /**
   * 计算分页信息
   */
  private calculatePagination(): void {
    const totalRows = this.state.filteredRows.length;
    this.state.totalPages = Math.max(1, Math.ceil(totalRows / this.state.rowsPerPage));
    this.state.currentPage = Math.min(this.state.currentPage, this.state.totalPages);
  }

  /**
   * 获取当前页数据
   */
  private getCurrentPageData(): Record<string, string>[] {
    const startIndex = (this.state.currentPage - 1) * this.state.rowsPerPage;
    const endIndex = startIndex + this.state.rowsPerPage;
    return this.state.filteredRows.slice(startIndex, endIndex);
  }

  /**
   * 搜索过滤（支持关键词搜索 + 列筛选）
   */
  private filterData(): void {
    if (!this.state.data) return;

    let rows = [...this.state.data.rows];

    // 应用列筛选
    this.state.columnFilters.forEach((selectedValues, columnName) => {
      if (selectedValues.size > 0) {
        rows = rows.filter(row => {
          const cellValue = (row[columnName] || '').trim();
          return selectedValues.has(cellValue);
        });
      }
    });

    // 应用关键词搜索
    const keyword = this.state.searchKeyword.toLowerCase().trim();
    if (keyword) {
      rows = rows.filter(row => {
        return Object.values(row).some(value => 
          String(value).toLowerCase().includes(keyword)
        );
      });
    }

    this.state.filteredRows = rows;
    this.state.currentPage = 1;
    this.calculatePagination();
  }

  /**
   * 排序数据
   */
  private sortData(column: string): void {
    if (this.state.sortColumn === column) {
      this.state.sortDirection = this.state.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.state.sortColumn = column;
      this.state.sortDirection = 'asc';
    }

    this.state.filteredRows.sort((a, b) => {
      const aVal = a[column] || '';
      const bVal = b[column] || '';
      
      // 尝试数字排序
      const aNum = parseFloat(aVal);
      const bNum = parseFloat(bVal);
      
      if (!isNaN(aNum) && !isNaN(bNum)) {
        return this.state.sortDirection === 'asc' ? aNum - bNum : bNum - aNum;
      }
      
      // 字符串排序
      const compare = aVal.localeCompare(bVal, 'zh-CN');
      return this.state.sortDirection === 'asc' ? compare : -compare;
    });

    this.render();
  }

  /**
   * 生成列的颜色映射
   */
  private generateColumnColorMaps(): void {
    if (!this.colorCoding.enabled || !this.state.data) return;

    this.colorCoding.columnColorMaps.clear();

    // 只为指定的列分析唯一值并分配颜色
    this.state.data.headers.forEach(header => {
      // 检查是否是需要着色的列
      if (!this.colorCoding.targetColumns.includes(header)) {
        return;
      }

      // 收集该列的所有唯一值
      const uniqueValues = new Set<string>();
      this.state.data!.rows.forEach(row => {
        const value = row[header];
        if (value && value.trim()) {
          // 排除已有特殊值颜色的值
          if (!this.colorCoding.specialValues.hasOwnProperty(value.trim())) {
            uniqueValues.add(value.trim());
          }
        }
      });

      if (uniqueValues.size === 0) return;

      // 为唯一值分配颜色
      const colorMap = new Map<string, { backgroundColor: string; textColor: string }>();
      const valuesArray = Array.from(uniqueValues).sort();

      valuesArray.forEach((value, index) => {
        const colorIndex = index % this.colorCoding.colorPalette.length;
        colorMap.set(value, {
          backgroundColor: this.colorCoding.colorPalette[colorIndex],
          textColor: this.colorCoding.textColors[colorIndex]
        });
      });

      this.colorCoding.columnColorMaps.set(header, colorMap);
    });

    console.log('🎨 列颜色映射已生成:', this.colorCoding.columnColorMaps.size, '列');
  }

  /**
   * 获取单元格颜色样式
   */
  private getCellColorStyle(columnName: string, value: string): { backgroundColor: string; textColor: string } | null {
    if (!this.colorCoding.enabled || !value) return null;
    
    const trimmedValue = value.trim();

    // 优先检查特殊值的固定颜色
    if (this.colorCoding.specialValues.hasOwnProperty(trimmedValue)) {
      return this.colorCoding.specialValues[trimmedValue];
    }

    // 如果不是特殊值，使用列的颜色映射
    const columnColorMap = this.colorCoding.columnColorMaps.get(columnName);
    if (!columnColorMap) return null;

    return columnColorMap.get(trimmedValue) || null;
  }

  /**
   * 高亮搜索文本
   */
  private highlightText(text: string): string {
    if (!this.state.searchKeyword) return this.escapeHtml(text);
    
    const keyword = this.state.searchKeyword;
    const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedKeyword})`, 'gi');
    
    return this.escapeHtml(text).replace(regex, '<mark class="embedded-csv-highlight">$1</mark>');
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
   * 渲染组件
   */
  render(): void {
    if (!this.container) return;

    // 保存当前焦点状态（用于搜索框焦点恢复）
    const activeEl = document.activeElement as HTMLInputElement | null;
    const focusedId = activeEl?.id || '';
    const selectionStart = activeEl?.selectionStart ?? null;
    const selectionEnd = activeEl?.selectionEnd ?? null;
    const isFocusedInContainer = activeEl && this.container.contains(activeEl);

    if (this.state.isLoading) {
      this.container.innerHTML = this.renderLoading();
      return;
    }

    if (this.state.error) {
      this.container.innerHTML = this.renderError();
      this.bindRetryEvent();
      return;
    }

    if (!this.state.data) {
      this.container.innerHTML = this.renderEmpty();
      return;
    }

    // 根据视图模式渲染
    if (this.state.viewMode === 'text') {
      this.container.innerHTML = this.renderTextView();
      this.bindTextEvents();
    } else {
      this.container.innerHTML = this.renderTable();
      this.bindEvents();
    }

    // 恢复搜索框焦点和光标位置
    if (isFocusedInContainer && focusedId) {
      const restoredEl = this.container.querySelector(`#${focusedId}`) as HTMLInputElement | null;
      if (restoredEl) {
        restoredEl.focus();
        if (selectionStart !== null && selectionEnd !== null) {
          try {
            restoredEl.setSelectionRange(selectionStart, selectionEnd);
          } catch (_) { /* ignore for non-text inputs */ }
        }
      }
    }
  }

  /**
   * 渲染加载状态
   */
  private renderLoading(): string {
    return `
      <div class="embedded-csv-loading">
        <div class="embedded-csv-spinner"></div>
        <div class="embedded-csv-loading-text">正在加载数据...</div>
      </div>
    `;
  }

  /**
   * 渲染错误状态
   */
  private renderError(): string {
    const errorMessage = this.state.error || '未知错误';
    // 如果错误信息包含"文件不存在"，显示更友好的提示
    const isFileNotFound = errorMessage.includes('文件不存在') || 
                           errorMessage.includes('not found') || 
                           errorMessage.includes('No such file');
    
    const displayTitle = isFileNotFound ? '数据尚未生成' : '加载失败';
    const displayMessage = isFileNotFound 
      ? '请先加载内存或等待内存加载完毕' 
      : this.escapeHtml(errorMessage);
    const displayIcon = isFileNotFound ? '💡' : '⚠️';
    const containerClass = isFileNotFound ? 'embedded-csv-error embedded-csv-hint' : 'embedded-csv-error';
    const buttonText = isFileNotFound ? '复制文件并重试' : '重试';
    
    return `
      <div class="${containerClass}" data-file-not-found="${isFileNotFound}">
        <div class="embedded-csv-error-icon">${displayIcon}</div>
        <div class="embedded-csv-error-title">${displayTitle}</div>
        <div class="embedded-csv-error-message">${displayMessage}</div>
        <button class="embedded-csv-retry-btn" id="embedded-csv-retry">${buttonText}</button>
      </div>
    `;
  }

  /**
   * 渲染空状态
   */
  private renderEmpty(): string {
    return `
      <div class="embedded-csv-empty">
        <div class="embedded-csv-empty-icon">📊</div>
        <div class="embedded-csv-empty-title">请选择一个功能</div>
        <div class="embedded-csv-empty-message">点击上方Tab标签查看对应的CSV数据</div>
      </div>
    `;
  }

  /**
   * 渲染文本视图
   */
  private renderTextView(): string {
    const lines = this.getCurrentPageTextLines();
    const startLine = (this.state.currentPage - 1) * this.state.rowsPerPage + 1;
    const endLine = Math.min(startLine + this.state.rowsPerPage - 1, this.state.filteredTextLines.length);
    const totalLines = this.state.filteredTextLines.length;

    return `
      <div class="embedded-text-container">
        <!-- 文本内容区域 -->
        <div class="embedded-text-content-wrapper" id="embedded-text-wrapper">
          <div class="embedded-text-content" id="embedded-text-content">
            <div class="embedded-text-line-numbers">
              ${lines.map((_, i) => `<div class="line-number">${startLine + i}</div>`).join('')}
            </div>
            <pre class="embedded-text-body" id="embedded-text-body">${lines.map((line, i) => 
              `<div class="text-line" data-line="${startLine + i}">${this.highlightTextLine(line) || '&nbsp;'}</div>`
            ).join('')}</pre>
          </div>
        </div>

        <!-- 底部工具栏 -->
        <div class="embedded-csv-footer">
          <!-- 搜索 -->
          <div class="embedded-csv-search-section">
            <div class="embedded-csv-search-box">
              <span class="embedded-csv-search-icon">
                <svg viewBox="0 0 48 48" width="14" height="14" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 38c9.389 0 17-7.611 17-17S30.389 4 21 4 4 11.611 4 21s7.611 17 17 17z"/>
                  <path d="M33.222 33.222l8.485 8.485"/>
                </svg>
              </span>
              <input type="text" 
                     class="embedded-csv-search-input" 
                     id="embedded-text-search"
                     placeholder="搜索文本..."
                     value="${this.escapeHtml(this.state.searchKeyword)}">
            </div>
            <div class="embedded-csv-page-size">
              <select id="embedded-text-page-size" class="embedded-csv-select">
                <option value="50" ${this.state.rowsPerPage === 50 ? 'selected' : ''}>50行/页</option>
                <option value="100" ${this.state.rowsPerPage === 100 ? 'selected' : ''}>100行/页</option>
                <option value="200" ${this.state.rowsPerPage === 200 ? 'selected' : ''}>200行/页</option>
                <option value="500" ${this.state.rowsPerPage === 500 ? 'selected' : ''}>500行/页</option>
              </select>
            </div>
          </div>

          <!-- 分页 -->
          <div class="embedded-csv-pagination">
            <div class="embedded-csv-pagination-info">
              ${startLine}-${endLine} / ${totalLines.toLocaleString()} 行
            </div>
            <div class="embedded-csv-pagination-controls">
              <button class="embedded-csv-page-btn" id="embedded-text-first" ${this.state.currentPage === 1 ? 'disabled' : ''}>
                <svg viewBox="0 0 48 48" width="12" height="12" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 12v24M36 36L24 24l12-12"/>
                </svg>
              </button>
              <button class="embedded-csv-page-btn" id="embedded-text-prev" ${this.state.currentPage === 1 ? 'disabled' : ''}>
                <svg viewBox="0 0 48 48" width="12" height="12" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M31 36L19 24l12-12"/>
                </svg>
              </button>
              <span class="embedded-csv-page-indicator">
                ${this.state.currentPage}/${this.state.totalPages}
              </span>
              <button class="embedded-csv-page-btn" id="embedded-text-next" ${this.state.currentPage === this.state.totalPages ? 'disabled' : ''}>
                <svg viewBox="0 0 48 48" width="12" height="12" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M19 12l12 12-12 12"/>
                </svg>
              </button>
              <button class="embedded-csv-page-btn" id="embedded-text-last" ${this.state.currentPage === this.state.totalPages ? 'disabled' : ''}>
                <svg viewBox="0 0 48 48" width="12" height="12" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M36 12v24M12 12l12 12-12 12"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // 保存选中的文本
  private savedSelectedText: string = '';

  /**
   * 获取选中的文本
   */
  private getSelectionText(): string {
    const selection = window.getSelection();
    return selection ? selection.toString().trim() : '';
  }

  /**
   * 绑定文本视图事件
   */
  private bindTextEvents(): void {
    if (!this.container) return;

    // 搜索
    const searchInput = this.container.querySelector('#embedded-text-search') as HTMLInputElement;
    if (searchInput) {
      let debounceTimer: number;
      searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = window.setTimeout(() => {
          this.state.searchKeyword = searchInput.value;
          this.filterTextContent();
          this.render();
        }, 300);
      });
    }

    // 每页行数
    const pageSizeSelect = this.container.querySelector('#embedded-text-page-size') as HTMLSelectElement;
    if (pageSizeSelect) {
      pageSizeSelect.addEventListener('change', () => {
        this.state.rowsPerPage = parseInt(pageSizeSelect.value, 10);
        this.state.currentPage = 1;
        this.calculateTextPagination();
        this.render();
      });
    }

    // 分页按钮
    const firstBtn = this.container.querySelector('#embedded-text-first');
    const prevBtn = this.container.querySelector('#embedded-text-prev');
    const nextBtn = this.container.querySelector('#embedded-text-next');
    const lastBtn = this.container.querySelector('#embedded-text-last');

    firstBtn?.addEventListener('click', () => {
      this.state.currentPage = 1;
      this.render();
    });

    prevBtn?.addEventListener('click', () => {
      if (this.state.currentPage > 1) {
        this.state.currentPage--;
        this.render();
      }
    });

    nextBtn?.addEventListener('click', () => {
      if (this.state.currentPage < this.state.totalPages) {
        this.state.currentPage++;
        this.render();
      }
    });

    lastBtn?.addEventListener('click', () => {
      this.state.currentPage = this.state.totalPages;
      this.render();
    });

    // 右键菜单
    this.bindTextContextMenu();
  }

  /**
   * 绑定文本右键菜单
   */
  private bindTextContextMenu(): void {
    const textWrapper = document.getElementById('embedded-text-wrapper');
    if (!textWrapper) return;

    // 右键菜单事件
    textWrapper.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      
      // 保存当前选中的文本
      this.savedSelectedText = this.getSelectionText();
      
      // 显示右键菜单
      this.showTextContextMenu(e.clientX, e.clientY);
    });

    // 点击其他地方关闭菜单
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.embedded-text-context-menu')) {
        this.hideTextContextMenu();
      }
    });
  }

  /**
   * 显示文本右键菜单
   */
  private showTextContextMenu(x: number, y: number): void {
    // 移除旧菜单
    const oldMenu = document.querySelector('.embedded-text-context-menu');
    if (oldMenu) oldMenu.remove();

    const hasSelection = this.savedSelectedText.length > 0;
    const disabledClass = hasSelection ? '' : 'disabled';
    
    // 检测选中文本是否是时间格式
    const isTimeFormat = hasSelection && this.isTimeString(this.savedSelectedText);
    const timezoneMenuItem = isTimeFormat ? `
          <div class="text-context-menu-item" data-action="convert-timezone">
            <span class="text-context-menu-icon">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
            </span>
            <span class="text-context-menu-text">转换时区</span>
          </div>
          <div class="text-context-menu-separator"></div>
    ` : '';

    const menuHtml = `
      <div class="embedded-text-context-menu" id="embedded-text-context-menu">
        <div class="text-context-menu-header">
          <div class="text-context-menu-title">${this.escapeHtml(this.state.data?.filename || '文本')}</div>
          <div class="text-context-menu-subtitle">${hasSelection ? this.savedSelectedText.substring(0, 30) + (this.savedSelectedText.length > 30 ? '...' : '') : '未选中文本'}</div>
        </div>
        <div class="text-context-menu-section">
          ${timezoneMenuItem}
          <div class="text-context-menu-item ${disabledClass}" data-action="copy">
            <span class="text-context-menu-icon">
              <svg viewBox="0 0 48 48" width="14" height="14" fill="none" stroke="currentColor" stroke-width="4"><path d="M13 12.432v-4.62A2.813 2.813 0 0 1 15.813 5h24.374A2.813 2.813 0 0 1 43 7.813v24.375A2.813 2.813 0 0 1 40.187 35h-4.67"/><path d="M32.188 13H7.811A2.813 2.813 0 0 0 5 15.813v24.374A2.813 2.813 0 0 0 7.813 43h24.375A2.813 2.813 0 0 0 35 40.187V15.814A2.813 2.813 0 0 0 32.187 13z"/></svg>
            </span>
            <span class="text-context-menu-text">复制</span>
            <span class="text-context-menu-shortcut">Ctrl+C</span>
          </div>
          <div class="text-context-menu-item ${disabledClass}" data-action="copy-hex">
            <span class="text-context-menu-icon">
              <svg viewBox="0 0 48 48" width="14" height="14" fill="none" stroke="currentColor" stroke-width="4"><rect x="6" y="6" width="36" height="36" rx="3"/><path d="M14 22h8M26 22h8M14 30h8M26 30h8"/></svg>
            </span>
            <span class="text-context-menu-text">复制为Hex</span>
          </div>
          <div class="text-context-menu-separator"></div>
          <div class="text-context-menu-item ${disabledClass}" data-action="search">
            <span class="text-context-menu-icon">
              <svg viewBox="0 0 48 48" width="14" height="14" fill="none" stroke="currentColor" stroke-width="4"><path d="M21 38c9.389 0 17-7.611 17-17S30.389 4 21 4 4 11.611 4 21s7.611 17 17 17z"/><path d="M33.222 33.222l8.485 8.485"/></svg>
            </span>
            <span class="text-context-menu-text">搜索选中内容</span>
          </div>
          <div class="text-context-menu-separator"></div>
          <div class="text-context-menu-item ${disabledClass}" data-action="decode-base64">
            <span class="text-context-menu-icon">
              <svg viewBox="0 0 48 48" width="14" height="14" fill="none" stroke="currentColor" stroke-width="4"><path d="M16 13L4 25.432 16 37M32 13l12 12.432L32 37"/><path d="M28 4L20 44"/></svg>
            </span>
            <span class="text-context-menu-text">Base64解码</span>
          </div>
          <div class="text-context-menu-item ${disabledClass}" data-action="hex-to-string">
            <span class="text-context-menu-icon">
              <svg viewBox="0 0 48 48" width="14" height="14" fill="none" stroke="currentColor" stroke-width="4"><path d="M24 6v36M6 24h36"/><circle cx="24" cy="24" r="18"/></svg>
            </span>
            <span class="text-context-menu-text">Hex转字符串</span>
          </div>
          <div class="text-context-menu-separator"></div>
          <div class="text-context-menu-item ${disabledClass}" data-action="ai-analyze">
            <span class="text-context-menu-icon">
              <svg viewBox="0 0 48 48" width="14" height="14" fill="none" stroke="currentColor" stroke-width="4"><rect x="6" y="6" width="36" height="36" rx="3"/><circle cx="17" cy="19" r="3"/><circle cx="31" cy="19" r="3"/><path d="M17 32c0-3.866 3.134-7 7-7s7 3.134 7 7"/></svg>
            </span>
            <span class="text-context-menu-text">AI分析</span>
          </div>
        </div>
      </div>
    `;

    const menuContainer = document.createElement('div');
    menuContainer.innerHTML = menuHtml;
    const menu = menuContainer.firstElementChild as HTMLElement;
    document.body.appendChild(menu);

    // 计算位置
    const menuRect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = x;
    let top = y;

    if (x + menuRect.width > viewportWidth) {
      left = viewportWidth - menuRect.width - 10;
    }
    if (y + menuRect.height > viewportHeight) {
      top = viewportHeight - menuRect.height - 10;
    }

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    // 绑定菜单项点击事件
    menu.addEventListener('click', (e) => {
      const item = (e.target as HTMLElement).closest('.text-context-menu-item') as HTMLElement;
      if (!item || item.classList.contains('disabled')) return;

      const action = item.dataset.action;
      this.handleTextContextMenuAction(action || '');
      this.hideTextContextMenu();
    });
  }

  /**
   * 隐藏文本右键菜单
   */
  private hideTextContextMenu(): void {
    const menu = document.querySelector('.embedded-text-context-menu');
    if (menu) menu.remove();
  }

  /**
   * 处理文本右键菜单动作
   */
  private async handleTextContextMenuAction(action: string): Promise<void> {
    const selectedText = this.savedSelectedText;
    
    // 时区转换
    if (action === 'convert-timezone') {
      if (selectedText && this.isTimeString(selectedText)) {
        this.showTimezoneModal(selectedText);
      }
      return;
    }
    
    if (!selectedText && action !== 'goto-line') return;

    switch (action) {
      case 'copy':
        await navigator.clipboard.writeText(selectedText);
        this.showTextNotification('✅ 已复制到剪贴板');
        break;

      case 'copy-hex':
        const hexText = Array.from(selectedText)
          .map(char => char.charCodeAt(0).toString(16).padStart(2, '0'))
          .join(' ');
        await navigator.clipboard.writeText(hexText);
        this.showTextNotification('✅ 已复制Hex到剪贴板');
        break;

      case 'search':
        this.state.searchKeyword = selectedText;
        this.filterTextContent();
        this.render();
        break;

      case 'decode-base64':
        this.showDecodeResult('Base64解码', selectedText, this.decodeBase64(selectedText));
        break;

      case 'hex-to-string':
        this.showDecodeResult('Hex转字符串', selectedText, this.hexToString(selectedText));
        break;

      case 'ai-analyze':
        // 发送到AI分析 - 使用模态框展示
        this.showAIAnalysisModal(selectedText);
        break;
    }
  }

  /**
   * Base64解码
   */
  private decodeBase64(text: string): string {
    try {
      const cleanText = text.replace(/\s+/g, '');
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleanText)) {
        return '错误：不是有效的Base64格式';
      }
      return atob(cleanText);
    } catch (error) {
      return `解码失败：${error}`;
    }
  }

  /**
   * Hex转字符串
   */
  private hexToString(text: string): string {
    try {
      const cleanText = text.replace(/[\s\-:]/g, '');
      if (!/^[0-9A-Fa-f]*$/.test(cleanText)) {
        return '错误：不是有效的十六进制格式';
      }
      if (cleanText.length % 2 !== 0) {
        return '错误：十六进制字符串长度必须是偶数';
      }
      let result = '';
      for (let i = 0; i < cleanText.length; i += 2) {
        const hexByte = cleanText.substr(i, 2);
        const charCode = parseInt(hexByte, 16);
        result += String.fromCharCode(charCode);
      }
      return result;
    } catch (error) {
      return `转换失败：${error}`;
    }
  }

  /**
   * 显示解码结果
   */
  private showDecodeResult(title: string, original: string, result: string): void {
    const modal = document.createElement('div');
    modal.className = 'text-decode-modal-overlay';
    modal.innerHTML = `
      <div class="text-decode-modal">
        <div class="text-decode-header">
          <span>${title}</span>
          <button class="text-decode-close">&times;</button>
        </div>
        <div class="text-decode-body">
          <div class="text-decode-section">
            <div class="text-decode-label">原始内容</div>
            <pre class="text-decode-content">${this.escapeHtml(original)}</pre>
          </div>
          <div class="text-decode-section">
            <div class="text-decode-label">解码结果</div>
            <pre class="text-decode-content">${this.escapeHtml(result)}</pre>
          </div>
        </div>
        <div class="text-decode-footer">
          <button class="text-decode-btn copy">复制结果</button>
          <button class="text-decode-btn decrypt">解密</button>
          <button class="text-decode-btn close">关闭</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // 关闭事件
    modal.querySelector('.text-decode-close')?.addEventListener('click', () => modal.remove());
    modal.querySelector('.text-decode-btn.close')?.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });

    // 复制事件
    modal.querySelector('.text-decode-btn.copy')?.addEventListener('click', async () => {
      await navigator.clipboard.writeText(result);
      this.showTextNotification('✅ 已复制结果');
    });

    // 解密事件
    modal.querySelector('.text-decode-btn.decrypt')?.addEventListener('click', async () => {
      try {
        if (!_invoke) {
          this.showTextNotification('❌ Tauri invoke 未加载');
          return;
        }
        // 1. 选择 db-dir
        const dbDir = await _invoke('select_folder_path', { title: translate('请选择微信db_storage目录') });
        if (!dbDir) {
          this.showTextNotification('❌ 未选择db目录');
          return;
        }
        // 2. 选择 output_path
        const outputDir = await _invoke('select_folder_path', { title: translate('请选择解密输出目录') });
        if (!outputDir) {
          this.showTextNotification('❌ 未选择输出目录');
          return;
        }
        // 3. 调用后端解密命令
        this.showTextNotification('⏳ 正在解密...');
        const resp = await _invoke('decrypt_wechat_db', {
          args: {
            keys_json: result,
            db_dir: dbDir,
            output_dir: outputDir
          }
        });
        this.showTextNotification('✅ ' + resp);
      } catch (e) {
        this.showTextNotification('❌ 解密失败: ' + (e && e.toString ? e.toString() : e));
      }
    });
  }

  /**
   * 显示文本通知
   */
  private showTextNotification(message: string): void {
    const notification = document.createElement('div');
    notification.className = 'embedded-csv-notification';
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.classList.add('fade-out');
      setTimeout(() => notification.remove(), 300);
    }, 2500);
  }

  /**
   * 渲染表格
   */
  private renderTable(): string {
    const data = this.state.data!;
    const pageData = this.getCurrentPageData();
    const startRow = (this.state.currentPage - 1) * this.state.rowsPerPage + 1;
    const endRow = Math.min(startRow + this.state.rowsPerPage - 1, this.state.filteredRows.length);

    return `
      <div class="embedded-csv-container">
        <!-- 表格区域 -->
        <div class="embedded-csv-table-wrapper">
          <table class="embedded-csv-table">
            <thead>
              <tr>
                ${data.headers.map((header, colIndex) => {
                  const hasFilter = this.state.columnFilters.has(header) && this.state.columnFilters.get(header)!.size > 0;
                  return `
                  <th class="embedded-csv-th ${this.state.sortColumn === header ? `sort-${this.state.sortDirection}` : ''} ${hasFilter ? 'has-filter' : ''}"
                      data-column="${this.escapeHtml(header)}"
                      data-col-index="${colIndex}">
                    <span class="embedded-csv-th-content">
                      ${this.escapeHtml(header)}
                      <span class="embedded-csv-th-actions">
                        <button class="embedded-csv-filter-btn ${hasFilter ? 'active' : ''}" 
                                data-column="${this.escapeHtml(header)}" 
                                title="筛选">
                          <svg viewBox="0 0 48 48" width="12" height="12" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M6 9l14.4 14.4V42l7.2-4.8V23.4L42 9"/>
                          </svg>
                        </button>
                        <span class="embedded-csv-sort-icon">
                          ${this.state.sortColumn === header 
                            ? (this.state.sortDirection === 'asc' ? '▲' : '▼') 
                            : '⇅'}
                        </span>
                      </span>
                    </span>
                    <div class="embedded-csv-resize-handle" data-col-index="${colIndex}"></div>
                  </th>
                `}).join('')}
              </tr>
            </thead>
            <tbody>
              ${pageData.map((row, index) => `
                <tr class="embedded-csv-row ${index % 2 === 0 ? 'even' : 'odd'}">
                  ${data.headers.map(header => {
                    const value = row[header] || '';
                    const colorStyle = this.getCellColorStyle(header, value);
                    const cellContent = colorStyle 
                      ? `<span class="embedded-csv-colored-text" style="background-color:${colorStyle.backgroundColor};color:${colorStyle.textColor}">${this.highlightText(value)}</span>`
                      : this.highlightText(value);
                    return `<td class="embedded-csv-td" data-column="${this.escapeHtml(header)}" data-value="${this.escapeHtml(value)}" title="${this.escapeHtml(value)}">${cellContent}</td>`;
                  }).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <!-- 底部工具栏：搜索和分页 -->
        <div class="embedded-csv-footer">
          <!-- 搜索和筛选 -->
          <div class="embedded-csv-search-section">
             <div class="embedded-csv-search-box">
              <span class="embedded-csv-search-icon">
                <svg viewBox="0 0 48 48" width="14" height="14" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 38c9.389 0 17-7.611 17-17S30.389 4 21 4 4 11.611 4 21s7.611 17 17 17z"/>
                  <path d="M33.222 33.222l8.485 8.485"/>
                </svg>
              </span>
              <input type="text" 
                     class="embedded-csv-search-input" 
                     id="embedded-csv-search"
                     placeholder="搜索..."
                     value="${this.escapeHtml(this.state.searchKeyword)}">
            </div>
            <div class="embedded-csv-page-size">
              <select id="embedded-csv-page-size" class="embedded-csv-select">
                <option value="50" ${this.state.rowsPerPage === 50 ? 'selected' : ''}>50/页</option>
                <option value="100" ${this.state.rowsPerPage === 100 ? 'selected' : ''}>100/页</option>
                <option value="200" ${this.state.rowsPerPage === 200 ? 'selected' : ''}>200/页</option>
                <option value="500" ${this.state.rowsPerPage === 500 ? 'selected' : ''}>500/页</option>
              </select>
            </div>
          </div>

          <!-- 分页控件 -->
          <div class="embedded-csv-pagination">
            <div class="embedded-csv-pagination-info">
              ${startRow}-${endRow} / ${this.state.filteredRows.length.toLocaleString()}
            </div>
            <div class="embedded-csv-pagination-controls">
              <button class="embedded-csv-page-btn" id="embedded-csv-first" ${this.state.currentPage === 1 ? 'disabled' : ''}>
                <svg viewBox="0 0 48 48" width="12" height="12" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 12v24M36 36L24 24l12-12"/>
                </svg>
              </button>
              <button class="embedded-csv-page-btn" id="embedded-csv-prev" ${this.state.currentPage === 1 ? 'disabled' : ''}>
                <svg viewBox="0 0 48 48" width="12" height="12" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M31 36L19 24l12-12"/>
                </svg>
              </button>
              <span class="embedded-csv-page-indicator">
                ${this.state.currentPage}/${this.state.totalPages}
              </span>
              <button class="embedded-csv-page-btn" id="embedded-csv-next" ${this.state.currentPage === this.state.totalPages ? 'disabled' : ''}>
                <svg viewBox="0 0 48 48" width="12" height="12" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M19 12l12 12-12 12"/>
                </svg>
              </button>
              <button class="embedded-csv-page-btn" id="embedded-csv-last" ${this.state.currentPage === this.state.totalPages ? 'disabled' : ''}>
                <svg viewBox="0 0 48 48" width="12" height="12" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M36 12v24M12 12l12 12-12 12"/>
                </svg>
              </button>
            </div>
          </div>

          <!-- 工具提示规则管理按钮 -->
          <button class="embedded-csv-tooltip-btn" id="embedded-csv-tooltip-rules" title="工具提示规则管理">
            <svg viewBox="0 0 48 48" width="14" height="14" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
              <rect x="6" y="6" width="36" height="36" rx="3"/>
              <path d="M24 28v-8M24 36h0"/>
            </svg>
          </button>
        </div>

      </div>
    `;
  }

  /**
   * 绑定重试按钮事件
   */
  private bindRetryEvent(): void {
    if (!this.container) return;

    const retryBtn = this.container.querySelector('#embedded-csv-retry');
    if (retryBtn) {
      retryBtn.addEventListener('click', async () => {
        if (!this.currentLoadInfo) {
          console.warn('没有可重试的加载信息');
          return;
        }

        const errorContainer = this.container?.querySelector('.embedded-csv-error');
        const isFileNotFound = errorContainer?.getAttribute('data-file-not-found') === 'true';

        // 如果是文件不存在错误，先尝试复制 forensic 文件
        if (isFileNotFound) {
          try {
            console.log('🔄 尝试复制 forensic 文件...');
            // 显示加载状态
            this.state.isLoading = true;
            this.state.error = null;
            this.render();

            // 调用后端复制 forensic 文件
            const copyResult = await invoke('copy_forensic_files_retry') as string;
            console.log(`✅ 文件复制完成: ${copyResult}`);

          } catch (copyError) {
            console.error('❌ 复制文件失败:', copyError);
            this.state.isLoading = false;
            this.state.error = `复制文件失败: ${copyError}`;
            this.render();
            return;
          }
        }

        // 根据文件类型重新加载
        if (this.currentLoadInfo.type === 'csv') {
          await this.loadCSV(this.currentLoadInfo.fileName, this.currentLoadInfo.displayName);
        } else {
          await this.loadText(this.currentLoadInfo.fileName, this.currentLoadInfo.displayName);
        }
      });
    }
  }

  /**
   * 绑定事件
   */
  private bindEvents(): void {
    if (!this.container) return;

    // 搜索
    const searchInput = this.container.querySelector('#embedded-csv-search') as HTMLInputElement;
    if (searchInput) {
      let debounceTimer: number;
      searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = window.setTimeout(() => {
          this.state.searchKeyword = searchInput.value;
          this.filterData();
          this.render();
        }, 300);
      });
    }

    // 每页行数
    const pageSizeSelect = this.container.querySelector('#embedded-csv-page-size') as HTMLSelectElement;
    if (pageSizeSelect) {
      pageSizeSelect.addEventListener('change', () => {
        this.state.rowsPerPage = parseInt(pageSizeSelect.value, 10);
        this.state.currentPage = 1;
        this.calculatePagination();
        this.render();
      });
    }

    // 排序（避免在拖动resize handle时触发）
    const headers = this.container.querySelectorAll('.embedded-csv-th');
    headers.forEach(th => {
      th.addEventListener('click', (e) => {
        // 如果点击的是resize handle，不触发排序
        if ((e.target as HTMLElement).classList.contains('embedded-csv-resize-handle')) {
          return;
        }
        const column = th.getAttribute('data-column');
        if (column) {
          this.sortData(column);
        }
      });
    });

    // 列宽拖动调整
    this.bindColumnResizeEvents();

    // 列筛选
    this.bindFilterEvents();

    // 分页
    const firstBtn = this.container.querySelector('#embedded-csv-first');
    const prevBtn = this.container.querySelector('#embedded-csv-prev');
    const nextBtn = this.container.querySelector('#embedded-csv-next');
    const lastBtn = this.container.querySelector('#embedded-csv-last');

    firstBtn?.addEventListener('click', () => {
      this.state.currentPage = 1;
      this.render();
    });

    prevBtn?.addEventListener('click', () => {
      if (this.state.currentPage > 1) {
        this.state.currentPage--;
        this.render();
      }
    });

    nextBtn?.addEventListener('click', () => {
      if (this.state.currentPage < this.state.totalPages) {
        this.state.currentPage++;
        this.render();
      }
    });

    lastBtn?.addEventListener('click', () => {
      this.state.currentPage = this.state.totalPages;
      this.render();
    });

    // 工具提示规则管理按钮
    const tooltipRulesBtn = this.container.querySelector('#embedded-csv-tooltip-rules');
    tooltipRulesBtn?.addEventListener('click', () => {
      this.tooltipRuleManager.show();
    });

    // 单元格悬停工具提示
    this.bindCellTooltipEvents();

    // 右键菜单
    this.bindContextMenuEvents();
  }

  /**
   * 绑定单元格悬停工具提示事件
   */
  private bindCellTooltipEvents(): void {
    if (!this.container) return;

    const cells = this.container.querySelectorAll('.embedded-csv-td');
    cells.forEach(cell => {
      const cellElement = cell as HTMLElement;
      const columnName = cellElement.getAttribute('data-column') || '';
      const cellValue = cellElement.getAttribute('data-value') || '';

      cellElement.addEventListener('mouseenter', (e) => {
        this.handleCellMouseEnter(e as MouseEvent, cellElement, columnName, cellValue);
      });

      cellElement.addEventListener('mouseleave', () => {
        this.handleCellMouseLeave();
      });

      cellElement.addEventListener('mousemove', (e) => {
        // 如果工具提示正在显示，更新位置
        if (this.tooltipElement && this.tooltipElement.style.display === 'block' && this.currentTooltipCell === cellElement) {
          const mouseEvent = e as MouseEvent;
          const rect = this.tooltipElement.getBoundingClientRect();
          let x = mouseEvent.clientX + 10;
          let y = mouseEvent.clientY - rect.height - 10;

          if (x + rect.width > window.innerWidth) {
            x = window.innerWidth - rect.width - 10;
          }
          if (y < 0) {
            y = mouseEvent.clientY + 20;
          }

          this.tooltipElement.style.left = `${x}px`;
          this.tooltipElement.style.top = `${y}px`;
        }
      });
    });
  }

  /**
   * 绑定列宽拖动调整事件
   */
  private bindColumnResizeEvents(): void {
    if (!this.container) return;

    const table = this.container.querySelector('.embedded-csv-table') as HTMLTableElement;
    const resizeHandles = this.container.querySelectorAll('.embedded-csv-resize-handle');
    
    if (!table || resizeHandles.length === 0) return;

    resizeHandles.forEach(handle => {
      let startX: number;
      let startWidth: number;
      let th: HTMLElement;

      const onMouseDown = (e: Event) => {
        const mouseEvent = e as MouseEvent;
        e.preventDefault();
        e.stopPropagation();
        
        th = (handle as HTMLElement).parentElement as HTMLElement;
        startX = mouseEvent.pageX;
        startWidth = th.offsetWidth;

        // 添加拖动中的样式
        th.classList.add('resizing');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      };

      const onMouseMove = (e: MouseEvent) => {
        const diff = e.pageX - startX;
        const newWidth = Math.max(50, startWidth + diff); // 最小宽度50px
        th.style.width = `${newWidth}px`;
        th.style.minWidth = `${newWidth}px`;
      };

      const onMouseUp = () => {
        th.classList.remove('resizing');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      handle.addEventListener('mousedown', onMouseDown);
    });
  }

  /**
   * 绑定筛选按钮事件
   */
  private bindFilterEvents(): void {
    if (!this.container) return;

    const filterBtns = this.container.querySelectorAll('.embedded-csv-filter-btn');
    filterBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const column = (btn as HTMLElement).getAttribute('data-column');
        if (column) {
          this.showColumnFilterDropdown(column, btn as HTMLElement);
        }
      });
    });
  }

  /** 筛选列表渲染上限：超过此数量时仅渲染高频值，其余通过搜索获取 */
  private static readonly FILTER_RENDER_LIMIT = 200;
  /** 唯一值超过此数量时视为高基数列（如时间列），启用优化模式 */
  private static readonly HIGH_CARDINALITY_THRESHOLD = 500;

  /**
   * 单次遍历建立列频率映射 (value -> count)
   */
  private buildColumnFrequencyMap(column: string): Map<string, number> {
    const freqMap = new Map<string, number>();
    if (!this.state.data) return freqMap;

    for (const row of this.state.data.rows) {
      const value = (row[column] || '').trim();
      freqMap.set(value, (freqMap.get(value) || 0) + 1);
    }
    return freqMap;
  }

  /**
   * 显示列筛选下拉菜单（已优化：高基数列不再一次性渲染所有值）
   */
  private showColumnFilterDropdown(column: string, btnElement: HTMLElement): void {
    // 移除已存在的下拉菜单
    this.hideColumnFilterDropdown();

    if (!this.state.data) return;

    // 单次遍历建立频率映射
    const freqMap = this.buildColumnFrequencyMap(column);
    const totalUnique = freqMap.size;
    const isHighCardinality = totalUnique > EmbeddedCSVViewer.HIGH_CARDINALITY_THRESHOLD;

    // 按频次降序排列项（高频在前），并限制渲染数量
    let sortedEntries = Array.from(freqMap.entries());
    if (isHighCardinality) {
      // 高基数模式下：按频次降序，只取前 FILTER_RENDER_LIMIT 个
      sortedEntries.sort((a, b) => b[1] - a[1]);
      sortedEntries = sortedEntries.slice(0, EmbeddedCSVViewer.FILTER_RENDER_LIMIT);
    } else {
      // 正常模式：按值字典序升序
      sortedEntries.sort((a, b) => a[0].localeCompare(b[0]));
    }

    const currentFilter = this.state.columnFilters.get(column) || new Set<string>();

    // 高基数模式下存储完整的频率 Map 到 DOM dataset，用于搜索时动态加载
    const highCardinalityNotice = isHighCardinality
      ? `<div class="filter-high-cardinality-notice">
           <svg viewBox="0 0 48 48" width="12" height="12" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
             <path d="M24 44a19.937 19.937 0 0 0 14.142-5.858A19.937 19.937 0 0 0 44 24a19.938 19.938 0 0 0-5.858-14.142A19.937 19.937 0 0 0 24 4 19.938 19.938 0 0 0 9.858 9.858 19.938 19.938 0 0 0 4 24a19.937 19.937 0 0 0 5.858 14.142A19.938 19.938 0 0 0 24 44z"/>
             <path d="M24 28v-8M24 36h0"/>
           </svg>
           <span>此列有 <strong>${totalUnique.toLocaleString()}</strong> 个唯一值，显示前 ${sortedEntries.length} 个高频值。请使用搜索查找特定值。</span>
         </div>`
      : '';

    // 创建下拉菜单
    const dropdown = document.createElement('div');
    dropdown.className = 'embedded-csv-filter-dropdown';
    dropdown.id = 'embedded-csv-filter-dropdown';
    
    dropdown.innerHTML = `
      <div class="filter-dropdown-header">
        <span class="filter-dropdown-title">筛选: ${this.escapeHtml(column)}</span>
        <span class="filter-dropdown-count">${totalUnique.toLocaleString()} 个值</span>
        <button class="filter-dropdown-close">
          <svg viewBox="0 0 48 48" width="14" height="14" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round">
            <path d="M8 8l32 32M40 8L8 40"/>
          </svg>
        </button>
      </div>
      <div class="filter-dropdown-search">
        <input type="text" placeholder="搜索值..." class="filter-search-input" id="filter-search-input">
      </div>
      ${highCardinalityNotice}
      <div class="filter-dropdown-actions">
        <button class="filter-action-btn select-all">全选</button>
        <button class="filter-action-btn clear-all">清空</button>
      </div>
      <div class="filter-dropdown-list" id="filter-dropdown-list">
        ${sortedEntries.map(([value, count]) => `
          <label class="filter-option" data-value="${this.escapeHtml(value)}">
            <input type="checkbox" value="${this.escapeHtml(value)}" 
                   ${currentFilter.size === 0 || currentFilter.has(value) ? 'checked' : ''}>
            <span class="filter-option-text">${value || '(空)'}</span>
            <span class="filter-option-count">${count}</span>
          </label>
        `).join('')}
      </div>
      <div class="filter-dropdown-footer">
        <button class="filter-apply-btn">应用筛选</button>
        <button class="filter-clear-btn">清除筛选</button>
      </div>
    `;

    document.body.appendChild(dropdown);

    // 定位下拉菜单
    const btnRect = btnElement.getBoundingClientRect();
    const dropdownHeight = Math.min(400, Math.min(sortedEntries.length, 15) * 32 + 220);
    
    let top = btnRect.bottom + 4;
    let left = btnRect.left;

    // 防止超出视口
    if (top + dropdownHeight > window.innerHeight) {
      top = btnRect.top - dropdownHeight - 4;
    }
    if (left + 280 > window.innerWidth) {
      left = window.innerWidth - 290;
    }

    dropdown.style.top = `${top}px`;
    dropdown.style.left = `${left}px`;

    // 绑定事件（传入频率 Map 用于搜索动态加载）
    this.bindFilterDropdownEvents(dropdown, column, isHighCardinality ? freqMap : undefined);
  }

  /**
   * 获取某列某值的数量（仍保留为兼容方法，但内部使用优化后不再按逐值调用）
   */
  private getValueCount(column: string, value: string): number {
    if (!this.state.data) return 0;
    return this.state.data.rows.filter(row => (row[column] || '').trim() === value).length;
  }

  /**
   * 绑定筛选下拉菜单事件
   * @param freqMap 高基数列的完整频率映射（可选，用于搜索动态加载）
   */
  private bindFilterDropdownEvents(dropdown: HTMLElement, column: string, freqMap?: Map<string, number>): void {
    // 关闭按钮
    dropdown.querySelector('.filter-dropdown-close')?.addEventListener('click', () => {
      this.hideColumnFilterDropdown();
    });

    // 搜索过滤
    const searchInput = dropdown.querySelector('#filter-search-input') as HTMLInputElement;
    const listContainer = dropdown.querySelector('#filter-dropdown-list') as HTMLElement;
    const currentFilter = this.state.columnFilters.get(column) || new Set<string>();

    if (searchInput && listContainer) {
      let searchDebounce: number;
      searchInput.addEventListener('input', () => {
        clearTimeout(searchDebounce);
        searchDebounce = window.setTimeout(() => {
          const keyword = searchInput.value.toLowerCase().trim();

          if (freqMap && keyword.length > 0) {
            // 高基数列：从完整 freqMap 动态搜索匹配项（限制50条）
            const matches: Array<[string, number]> = [];
            for (const [value, count] of freqMap) {
              if (value.toLowerCase().includes(keyword)) {
                matches.push([value, count]);
                if (matches.length >= 50) break;
              }
            }
            // 按频次降序排列
            matches.sort((a, b) => b[1] - a[1]);
            
            listContainer.innerHTML = matches.map(([value, count]) => `
              <label class="filter-option" data-value="${this.escapeHtml(value)}">
                <input type="checkbox" value="${this.escapeHtml(value)}" 
                       ${currentFilter.size === 0 || currentFilter.has(value) ? 'checked' : ''}>
                <span class="filter-option-text">${value || '(空)'}</span>
                <span class="filter-option-count">${count}</span>
              </label>
            `).join('');

            if (matches.length === 0) {
              listContainer.innerHTML = '<div class="filter-no-results">无匹配项</div>';
            }
          } else if (!freqMap) {
            // 普通列：简单显示/隐藏已有的选项
            dropdown.querySelectorAll('.filter-option').forEach(option => {
              const value = (option.getAttribute('data-value') || '').toLowerCase();
              (option as HTMLElement).style.display = value.includes(keyword) ? '' : 'none';
            });
          } else {
            // 高基数列但搜索框清空：恢复默认的高频值列表
            // 重新生成默认列表
            let topEntries = Array.from(freqMap.entries());
            topEntries.sort((a, b) => b[1] - a[1]);
            topEntries = topEntries.slice(0, EmbeddedCSVViewer.FILTER_RENDER_LIMIT);

            listContainer.innerHTML = topEntries.map(([value, count]) => `
              <label class="filter-option" data-value="${this.escapeHtml(value)}">
                <input type="checkbox" value="${this.escapeHtml(value)}" 
                       ${currentFilter.size === 0 || currentFilter.has(value) ? 'checked' : ''}>
                <span class="filter-option-text">${value || '(空)'}</span>
                <span class="filter-option-count">${count}</span>
              </label>
            `).join('');
          }
        }, freqMap ? 200 : 100); // 高基数列搜索适当增加防抖
      });
    }

    // 全选（仅当前可见项）
    dropdown.querySelector('.select-all')?.addEventListener('click', () => {
      dropdown.querySelectorAll('.filter-option input[type="checkbox"]').forEach(cb => {
        const option = (cb as HTMLElement).closest('.filter-option') as HTMLElement;
        if (option.style.display !== 'none') {
          (cb as HTMLInputElement).checked = true;
        }
      });
    });

    // 清空（仅当前可见项）
    dropdown.querySelector('.clear-all')?.addEventListener('click', () => {
      dropdown.querySelectorAll('.filter-option input[type="checkbox"]').forEach(cb => {
        (cb as HTMLInputElement).checked = false;
      });
    });

    // 应用筛选
    dropdown.querySelector('.filter-apply-btn')?.addEventListener('click', () => {
      const selectedValues = new Set<string>();
      dropdown.querySelectorAll('.filter-option input[type="checkbox"]:checked').forEach(cb => {
        selectedValues.add((cb as HTMLInputElement).value);
      });

      // 如果全选或空选，则清除该列筛选
      // 高基数列下：仅当没有选中任何值时清除（不对比总数）
      if (selectedValues.size === 0) {
        this.state.columnFilters.delete(column);
      } else if (!freqMap) {
        // 普通列：如果选中了所有值，相当于不筛选
        const allValues = dropdown.querySelectorAll('.filter-option').length;
        if (selectedValues.size === allValues) {
          this.state.columnFilters.delete(column);
        } else {
          this.state.columnFilters.set(column, selectedValues);
        }
      } else {
        this.state.columnFilters.set(column, selectedValues);
      }

      this.hideColumnFilterDropdown();
      this.filterData();
      this.render();
    });

    // 清除筛选
    dropdown.querySelector('.filter-clear-btn')?.addEventListener('click', () => {
      this.state.columnFilters.delete(column);
      this.hideColumnFilterDropdown();
      this.filterData();
      this.render();
    });

    // 点击外部关闭
    setTimeout(() => {
      document.addEventListener('click', this.handleFilterDropdownOutsideClick);
    }, 0);
  }

  /**
   * 处理点击下拉菜单外部
   */
  private handleFilterDropdownOutsideClick = (e: MouseEvent) => {
    const dropdown = document.getElementById('embedded-csv-filter-dropdown');
    if (dropdown && !dropdown.contains(e.target as Node)) {
      this.hideColumnFilterDropdown();
    }
  };

  /**
   * 隐藏筛选下拉菜单
   */
  private hideColumnFilterDropdown(): void {
    const dropdown = document.getElementById('embedded-csv-filter-dropdown');
    if (dropdown) {
      dropdown.remove();
    }
    document.removeEventListener('click', this.handleFilterDropdownOutsideClick);
  }

  /**
   * 绑定右键菜单事件
   */
  private bindContextMenuEvents(): void {
    if (!this.container) return;

    const tableWrapper = this.container.querySelector('.embedded-csv-table-wrapper');
    
    if (!tableWrapper) return;

    // 表格右键事件
    tableWrapper.addEventListener('contextmenu', async (e: Event) => {
      const mouseEvent = e as MouseEvent;
      const target = mouseEvent.target as HTMLElement;
      const cell = target.closest('.embedded-csv-td') as HTMLElement;
      
      if (!cell) return;
      
      e.preventDefault();
      
      // 清除之前的选中状态
      this.container?.querySelectorAll('.context-selected').forEach(el => {
        el.classList.remove('context-selected');
      });
      
      // 添加选中效果
      cell.classList.add('context-selected');
      
      // 获取单元格数据
      const row = cell.parentElement as HTMLElement;
      const cellIndex = Array.from(row.children).indexOf(cell);
      const rowIndex = Array.from(row.parentElement!.children).indexOf(row);
      const columnName = this.state.data?.headers[cellIndex] || '';
      
      // 获取整行数据
      const pageData = this.getCurrentPageData();
      const rowData = pageData[rowIndex] || {};
      
      this.contextMenuData = {
        cellValue: cell.textContent?.trim() || '',
        rowIndex,
        cellIndex,
        columnName,
        rowData
      };

      // 本表格自身触发，清除外部视图的文件上下文覆盖
      this.externalFileContext = null;

      // 设置插件管理器的上下文数据
      this.pluginManager.setContextMenuData(this.contextMenuData);

      // 显示菜单
      await this.showContextMenu(mouseEvent.clientX, mouseEvent.clientY);
    });

    // 点击其他地方关闭菜单
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.embedded-csv-context-menu')) {
        this.hideContextMenu();
      }
    });
  }

  /**
   * 供外部第二视图（进程树 / 服务 / 模块 / 驱动 / 网络 / 句柄 / 文件树）复用本
   * CSV 右键菜单：设置行上下文与文件上下文后，复用完全相同的菜单构建、动作处理、
   * 弹窗与 CSV 插件逻辑，保证与表格视图右键菜单完全一致。
   *
   * @param opts.rowData        以原始 CSV 列名为键的整行数据
   * @param opts.loadFileName   原始文件名（如 'process.csv'），用于条件项判断
   * @param opts.displayName    显示名（如 '进程信息'），用于条件项判断
   */
  public async showSharedRowContextMenu(opts: {
    rowData: Record<string, string>;
    columnName?: string;
    cellValue?: string;
    loadFileName?: string;
    displayName?: string;
    x: number;
    y: number;
  }): Promise<void> {
    this.contextMenuData = {
      cellValue: opts.cellValue || '',
      rowIndex: -1,
      cellIndex: -1,
      columnName: opts.columnName || '',
      rowData: opts.rowData,
    };
    this.externalFileContext = {
      loadFileName: opts.loadFileName,
      displayName: opts.displayName,
    };
    this.pluginManager.setContextMenuData(this.contextMenuData);
    await this.showContextMenu(opts.x, opts.y);
  }

  /**
   * 绑定菜单项点击事件
   */
  private bindContextMenuItemEvents(): void {
    const contextMenu = document.querySelector('#embedded-csv-context-menu') as HTMLElement;
    if (!contextMenu) return;

    contextMenu.addEventListener('click', async (e) => {
      const item = (e.target as HTMLElement).closest('.context-menu-item') as HTMLElement;
      if (!item || item.classList.contains('disabled')) return;

      // 分类二级菜单的触发项：仅用于悬停展开，点击不关闭菜单、不执行动作
      if (item.classList.contains('context-menu-submenu-trigger')) return;

      const action = item.dataset.action;
      const pluginId = item.dataset.pluginId;
      const targetColumn = item.dataset.column;

      this.hideContextMenu();

      // 处理时区转换
      if (action === 'convert-timezone') {
        const timeValue = this.contextMenuData?.cellValue || '';
        if (timeValue) {
          this.showTimezoneModal(timeValue);
        }
        return;
      }

      // 处理查看文件内容（timeline_ntfs.csv 或 files.csv）
      if (action === 'view-ntfs-file') {
        const rowData = this.contextMenuData?.rowData || {};
        const currentLoadFileName = this.currentLoadInfo?.fileName || '';
        const currentDisplayName = this.state.data?.filename || '';
        const isFilesCsv = currentLoadFileName.toLowerCase() === 'files.csv' || currentDisplayName === '内存文件';

        let filePath = '';
        if (isFilesCsv) {
          // files.csv: {挂载盘}\forensic\files\ROOT + Path目录部分 + Object-File
          const pathValue = (rowData['Path'] || '').replace(/\//g, '\\');
          const objectValue = (rowData['Object'] || '').replace(/^0x/i, '');
          const fileValue = rowData['File'] || '';
          // 提取 Path 的目录部分（去掉文件名）
          const pathDir = pathValue.substring(0, pathValue.lastIndexOf('\\'));
          filePath = getMountRoot() + 'forensic\\files\\ROOT' + pathDir + '\\' + objectValue + '-' + fileValue;
        } else {
          // timeline_ntfs.csv: {挂载盘}\forensic\ntfs + Text
          const textValue = rowData['Text'] || '';
          filePath = getMountRoot() + 'forensic\\ntfs' + textValue.replace(/\//g, '\\');
        }

        if (filePath) {
          this.showFileViewerModal(filePath);
        }
        return;
      }

      // 处理凭据提取 (pypykatz)
      if (action === 'extract-credentials') {
        const rowData = this.contextMenuData?.rowData || {};
        const pid = rowData['PID'] || '';
        if (pid) {
          this.extractCredentials(pid, rowData['Name'] || 'lsass.exe');
        }
        return;
      }

      // 处理可视化进程内存（dump 该进程内存后打开可视化窗口）
      if (action === 'visualize-process-memory') {
        const rowData = this.contextMenuData?.rowData || {};
        const pid = rowData['PID'] || rowData['Pid'] || rowData['pid'] || '';
        const name = rowData['Name'] || rowData['ImageFileName'] || rowData['Process'] || '';
        const pidNum = parseInt(pid, 10);
        if (Number.isFinite(pidNum) && pidNum > 0) {
          void dumpAndVisualize(pidNum, name);
        }
        return;
      }

      // 处理AI分析行
      if (action === 'ai-analyze') {
        const rowData = this.contextMenuData?.rowData;
        if (rowData) {
          const rowText = Object.entries(rowData)
            .map(([key, value]) => `${key}: ${value}`)
            .join('\n');
          this.showAIAnalysisModal(rowText);
        }
        return;
      }

      if (pluginId) {
        // 执行插件
        await this.pluginManager.handleAction('execute-plugin', pluginId, targetColumn);
      } else if (action) {
        // 执行内置动作
        await this.pluginManager.handleAction(action);
      }
    });
  }

  /**
   * 获取当前主题
   */
  private getCurrentTheme(): 'light' | 'dark' | 'sakura' {
    const theme = document.documentElement.getAttribute('data-theme');
    if (theme === 'dark' || theme === 'sakura') {
      return theme;
    }
    return 'light';
  }

  /**
   * 获取主题颜色配置
   */
  private getThemeColors(theme: 'light' | 'dark' | 'sakura') {
    const themes = {
      light: {
        modalBg: '#ffffff',
        modalBorder: '#e5e7eb',
        textPrimary: '#1f2937',
        textSecondary: '#6b7280',
        itemBg: '#f9fafb',
        itemHoverBg: '#e0f2fe',
        itemHoverBorder: '#0ea5e9',
        buttonBg: '#3b82f6',
        buttonHover: '#2563eb',
        buttonText: '#ffffff',
        secondaryBg: '#f3f4f6',
        secondaryHover: '#e5e7eb',
        secondaryText: '#374151',
        inputBg: '#f9fafb',
        shadow: '0 4px 20px rgba(0, 0, 0, 0.1)'
      },
      dark: {
        modalBg: '#1e293b',
        modalBorder: '#334155',
        textPrimary: '#f1f5f9',
        textSecondary: '#94a3b8',
        itemBg: '#0f172a',
        itemHoverBg: '#1e3a5f',
        itemHoverBorder: '#3b82f6',
        buttonBg: '#3b82f6',
        buttonHover: '#2563eb',
        buttonText: '#ffffff',
        secondaryBg: '#334155',
        secondaryHover: '#475569',
        secondaryText: '#cbd5e1',
        inputBg: '#0f172a',
        shadow: '0 4px 20px rgba(0, 0, 0, 0.4)'
      },
      sakura: {
        modalBg: '#fff5f7',
        modalBorder: '#fecdd3',
        textPrimary: '#881337',
        textSecondary: '#be123c',
        itemBg: '#ffe4e6',
        itemHoverBg: '#fce7f3',
        itemHoverBorder: '#ec4899',
        buttonBg: '#ec4899',
        buttonHover: '#db2777',
        buttonText: '#ffffff',
        secondaryBg: '#fce7f3',
        secondaryHover: '#fbcfe8',
        secondaryText: '#9f1239',
        inputBg: '#ffe4e6',
        shadow: '0 4px 20px rgba(236, 72, 153, 0.15)'
      }
    };
    return themes[theme];
  }

  /**
   * 解析时间字符串（支持多种格式）
   */
  private parseTimeString(timeStr: string): Date | null {
    try {
      // 清理时间字符串
      timeStr = timeStr.trim();
      
      // 尝试多种格式解析
      let date: Date | null = null;
      
      // 格式1: ISO 8601格式 (2024-12-09T10:30:00Z)
      if (timeStr.includes('T') || timeStr.endsWith('Z')) {
        date = new Date(timeStr);
      }
      // 格式2: 带UTC后缀的格式 (2019-12-14 10:38:46 UTC)
      else if (timeStr.toUpperCase().includes('UTC')) {
        // 移除UTC后缀并转换为ISO格式
        const cleanStr = timeStr.replace(/\s*UTC\s*$/i, '').trim();
        // 将空格替换为T，添加Z后缀表示UTC
        const isoStr = cleanStr.replace(' ', 'T') + 'Z';
        date = new Date(isoStr);
      }
      // 格式3: Unix时间戳（秒）
      else if (/^\d{10}$/.test(timeStr)) {
        date = new Date(parseInt(timeStr) * 1000);
      }
      // 格式4: Unix时间戳（毫秒）
      else if (/^\d{13}$/.test(timeStr)) {
        date = new Date(parseInt(timeStr));
      }
      // 格式5: 标准日期格式 (2019-12-14 10:38:46) - 假定为UTC
      else if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(timeStr)) {
        const isoStr = timeStr.replace(' ', 'T') + 'Z';
        date = new Date(isoStr);
      }
      // 格式6: 其他格式
      else {
        date = new Date(timeStr);
      }
      
      // 验证日期有效性
      if (date && !isNaN(date.getTime())) {
        return date;
      }
    } catch (e) {
      console.error('时间解析失败:', e);
    }
    return null;
  }

  /**
   * 转换时间到指定时区
   */
  private convertToTimezone(utcDate: Date, offsetHours: number): string {
    const localTime = new Date(utcDate.getTime() + offsetHours * 60 * 60 * 1000);
    
    const year = localTime.getUTCFullYear();
    const month = String(localTime.getUTCMonth() + 1).padStart(2, '0');
    const day = String(localTime.getUTCDate()).padStart(2, '0');
    const hours = String(localTime.getUTCHours()).padStart(2, '0');
    const minutes = String(localTime.getUTCMinutes()).padStart(2, '0');
    const seconds = String(localTime.getUTCSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  /**
   * 检测字符串是否是时间格式
   */
  private isTimeString(str: string): boolean {
    if (!str || str.length < 10) return false;
    
    const trimmed = str.trim();
    
    // ISO 8601格式
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(trimmed)) return true;
    
    // 带UTC后缀的格式
    if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s*UTC$/i.test(trimmed)) return true;
    
    // 标准日期时间格式
    if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(trimmed)) return true;
    
    // Unix时间戳（10位或13位）
    if (/^\d{10}$/.test(trimmed) || /^\d{13}$/.test(trimmed)) return true;
    
    return false;
  }

  /**
   * 显示AI分析模态框
   */
  private async showAIAnalysisModal(selectedText: string): Promise<void> {
    const currentTheme = this.getCurrentTheme();
    const colors = this.getThemeColors(currentTheme);

    // 创建模态框
    const modal = document.createElement('div');
    modal.className = 'ai-analysis-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, ${currentTheme === 'light' ? '0.4' : '0.6'});
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      animation: fadeIn 0.2s ease;
    `;

    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
      background: ${colors.modalBg};
      border: 1px solid ${colors.modalBorder};
      border-radius: 12px;
      padding: 24px;
      width: 700px;
      max-width: 90vw;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
      box-shadow: ${colors.shadow};
      animation: slideIn 0.3s ease;
    `;

    // 标题
    const title = document.createElement('div');
    title.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 2px solid ${colors.modalBorder};
    `;
    
    const titleLeft = document.createElement('div');
    titleLeft.style.cssText = `display: flex; align-items: center; gap: 10px;`;
    
    const aiIcon = document.createElement('span');
    aiIcon.innerHTML = '<svg viewBox="0 0 48 48" width="20" height="20" fill="none" stroke="currentColor" stroke-width="4"><rect x="6" y="6" width="36" height="36" rx="3"/><circle cx="17" cy="19" r="3"/><circle cx="31" cy="19" r="3"/><path d="M17 32c0-3.866 3.134-7 7-7s7 3.134 7 7"/></svg>';
    aiIcon.style.cssText = `display: inline-flex; color: ${colors.buttonBg};`;
    titleLeft.appendChild(aiIcon);
    
    const titleText = document.createElement('span');
    titleText.textContent = 'AI 分析';
    titleText.style.cssText = `font-size: 18px; font-weight: 600; color: ${colors.textPrimary};`;
    titleLeft.appendChild(titleText);
    
    title.appendChild(titleLeft);

    // 关闭按钮
    const closeIconBtn = document.createElement('button');
    closeIconBtn.innerHTML = this.ICONS.close;
    closeIconBtn.style.cssText = `
      background: transparent;
      border: none;
      cursor: pointer;
      padding: 4px;
      color: ${colors.textSecondary};
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      transition: all 0.2s;
    `;
    closeIconBtn.addEventListener('mouseenter', () => {
      closeIconBtn.style.background = colors.secondaryBg;
      closeIconBtn.style.color = colors.textPrimary;
    });
    closeIconBtn.addEventListener('mouseleave', () => {
      closeIconBtn.style.background = 'transparent';
      closeIconBtn.style.color = colors.textSecondary;
    });
    closeIconBtn.addEventListener('click', () => modal.remove());
    title.appendChild(closeIconBtn);

    // 原始文本区域
    const originalSection = document.createElement('div');
    originalSection.style.cssText = `
      margin-bottom: 16px;
      padding: 12px;
      background: ${colors.inputBg};
      border: 1px solid ${colors.modalBorder};
      border-radius: 8px;
      max-height: 100px;
      overflow-y: auto;
    `;
    const originalLabel = document.createElement('div');
    originalLabel.style.cssText = `
      color: ${colors.textSecondary};
      font-size: 11px;
      margin-bottom: 6px;
      font-weight: 500;
    `;
    originalLabel.textContent = '分析内容';
    const originalValue = document.createElement('div');
    originalValue.style.cssText = `
      color: ${colors.textPrimary};
      font-size: 13px;
      font-family: 'Consolas', 'Courier New', monospace;
      white-space: pre-wrap;
      word-break: break-all;
    `;
    originalValue.textContent = selectedText.length > 500 ? selectedText.substring(0, 500) + '...' : selectedText;
    originalSection.appendChild(originalLabel);
    originalSection.appendChild(originalValue);

    // AI 回复区域
    const responseSection = document.createElement('div');
    responseSection.style.cssText = `
      flex: 1;
      min-height: 200px;
      max-height: 400px;
      overflow-y: auto;
      padding: 16px;
      background: ${colors.itemBg};
      border: 1px solid ${colors.modalBorder};
      border-radius: 8px;
      margin-bottom: 16px;
    `;

    const responseLabel = document.createElement('div');
    responseLabel.style.cssText = `
      color: ${colors.textSecondary};
      font-size: 11px;
      margin-bottom: 10px;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 6px;
    `;
    responseLabel.innerHTML = '<span>AI 回复</span>';
    
    const responseContent = document.createElement('div');
    responseContent.style.cssText = `
      color: ${colors.textPrimary};
      font-size: 14px;
      line-height: 1.6;
      white-space: pre-wrap;
      word-break: break-word;
    `;
    responseContent.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px; color: ${colors.textSecondary};">
        <span class="ai-loading-dots" style="display: inline-flex; gap: 4px;">
          <span style="width: 6px; height: 6px; background: ${colors.buttonBg}; border-radius: 50%; animation: dotPulse 1.4s infinite ease-in-out both; animation-delay: -0.32s;"></span>
          <span style="width: 6px; height: 6px; background: ${colors.buttonBg}; border-radius: 50%; animation: dotPulse 1.4s infinite ease-in-out both; animation-delay: -0.16s;"></span>
          <span style="width: 6px; height: 6px; background: ${colors.buttonBg}; border-radius: 50%; animation: dotPulse 1.4s infinite ease-in-out both;"></span>
        </span>
        <span>正在分析...</span>
      </div>
    `;
    
    responseSection.appendChild(responseLabel);
    responseSection.appendChild(responseContent);

    // 底部按钮区域
    const footer = document.createElement('div');
    footer.style.cssText = `
      display: flex;
      gap: 10px;
      justify-content: flex-end;
    `;

    // 复制按钮
    const copyBtn = document.createElement('button');
    copyBtn.style.cssText = `
      padding: 8px 16px;
      background: ${colors.buttonBg};
      color: ${colors.buttonText};
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      gap: 6px;
      opacity: 0.5;
      pointer-events: none;
    `;
    const copyIcon = document.createElement('span');
    copyIcon.innerHTML = this.ICONS.copy;
    copyIcon.style.cssText = `width: 14px; height: 14px; display: inline-flex;`;
    copyBtn.appendChild(copyIcon);
    const copyText = document.createElement('span');
    copyText.textContent = '复制回复';
    copyBtn.appendChild(copyText);

    // 关闭按钮
    const closeBtn = document.createElement('button');
    closeBtn.style.cssText = `
      padding: 8px 16px;
      background: ${colors.secondaryBg};
      color: ${colors.secondaryText};
      border: 1px solid ${colors.modalBorder};
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      gap: 6px;
    `;
    const closeIcon2 = document.createElement('span');
    closeIcon2.innerHTML = this.ICONS.close;
    closeIcon2.style.cssText = `width: 14px; height: 14px; display: inline-flex;`;
    closeBtn.appendChild(closeIcon2);
    const closeText = document.createElement('span');
    closeText.textContent = '关闭';
    closeBtn.appendChild(closeText);
    closeBtn.addEventListener('click', () => modal.remove());
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.background = colors.secondaryHover;
    });
    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.background = colors.secondaryBg;
    });

    footer.appendChild(copyBtn);
    footer.appendChild(closeBtn);

    // 点击模态框背景关闭
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });

    // ESC键关闭
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        modal.remove();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    // 组装模态框
    modalContent.appendChild(title);
    modalContent.appendChild(originalSection);
    modalContent.appendChild(responseSection);
    modalContent.appendChild(footer);
    modal.appendChild(modalContent);

    // 添加动画样式
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes slideIn {
        from { transform: translateY(-20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      @keyframes dotPulse {
        0%, 80%, 100% { transform: scale(0); opacity: 0.5; }
        40% { transform: scale(1); opacity: 1; }
      }
    `;
    modal.appendChild(style);

    document.body.appendChild(modal);

    // 调用 AI API
    let aiResponse = '';
    let unlistenChunk: (() => void) | null = null;
    let unlistenEnd: (() => void) | null = null;
    let unlistenError: (() => void) | null = null;

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const { listen } = await import('@tauri-apps/api/event');
      const { getCurrentWindow } = await import('@tauri-apps/api/window');

      // 加载 AI 设置 - 优先使用当前选中的 AI 提供商
      let aiSettings: { base_url: string; model: string; api_key: string; custom_prompt?: string } | null = null;
      
      try {
        const currentProvider = await invoke('get_current_ai_provider') as any;
        if (currentProvider && currentProvider.enabled && currentProvider.api_key && currentProvider.base_url) {
          aiSettings = {
            base_url: currentProvider.base_url,
            model: currentProvider.model,
            api_key: currentProvider.api_key,
            custom_prompt: currentProvider.custom_prompt
          };
          console.log('🤖 使用AI提供商:', currentProvider.name);
        }
      } catch (e) {
        console.log('获取AI提供商失败，尝试使用传统设置');
      }

      // 回退到旧的单一配置
      if (!aiSettings) {
        try {
          const settings = await loadAppSettings() as any;
          if (settings?.ai_settings?.api_key && settings?.ai_settings?.base_url) {
            aiSettings = settings.ai_settings;
            console.log('🤖 使用传统AI设置');
          }
        } catch (e) {
          console.log('获取传统AI设置失败');
        }
      }

      if (!aiSettings?.api_key || !aiSettings?.base_url) {
        responseContent.innerHTML = `<div style="color: #ef4444;">❌ AI 未配置，请先在设置中配置 AI 参数</div>`;
        return;
      }

      const windowLabel = getCurrentWindow().label;

      // 监听流式响应
      unlistenChunk = await listen('ai-stream-chunk', (event: any) => {
        const chunk = event.payload as string;
        if (aiResponse === '') {
          responseContent.innerHTML = '';
        }
        aiResponse += chunk;
        responseContent.textContent = aiResponse;
        responseSection.scrollTop = responseSection.scrollHeight;
      });

      unlistenEnd = await listen('ai-stream-end', () => {
        // 启用复制按钮
        copyBtn.style.opacity = '1';
        copyBtn.style.pointerEvents = 'auto';
        copyBtn.addEventListener('mouseenter', () => {
          copyBtn.style.background = colors.buttonHover;
        });
        copyBtn.addEventListener('mouseleave', () => {
          copyBtn.style.background = colors.buttonBg;
        });
        copyBtn.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(aiResponse);
            copyText.textContent = '已复制';
            copyIcon.innerHTML = this.ICONS.check;
            setTimeout(() => {
              copyText.textContent = '复制回复';
              copyIcon.innerHTML = this.ICONS.copy;
            }, 1500);
          } catch (err) {
            console.error('复制失败:', err);
          }
        });

        // 清理监听器
        if (unlistenChunk) unlistenChunk();
        if (unlistenEnd) unlistenEnd();
        if (unlistenError) unlistenError();
      });

      unlistenError = await listen('ai-stream-error', (event: any) => {
        const error = event.payload as string;
        responseContent.innerHTML = `<div style="color: #ef4444;">❌ AI 分析失败: ${error}</div>`;
        
        // 清理监听器
        if (unlistenChunk) unlistenChunk();
        if (unlistenEnd) unlistenEnd();
        if (unlistenError) unlistenError();
      });

      // 构建分析提示
      const filename = this.state.data?.filename || '未知文件';
      const prompt = `简要解释以下内容的含义（来自文件: ${filename}）：

${selectedText}

请用简洁的语言说明：这段内容是什么、代表什么意思、有什么作用或价值。`;

      // 调用流式 AI API (使用V2版本)
      const requestData = {
        message: prompt,
        ai_settings: aiSettings,
        context: {
          selected_files: [],
          selected_text: selectedText
        },
        history: []  // V2 版本需要 history 字段
      };

      await invoke('call_ai_api_stream_v2', {
        request: requestData,
        windowLabel: windowLabel
      });

    } catch (error) {
      console.error('AI 分析失败:', error);
      responseContent.innerHTML = `<div style="color: #ef4444;">❌ AI 分析失败: ${error}</div>`;
      
      // 清理监听器
      if (unlistenChunk) unlistenChunk();
      if (unlistenEnd) unlistenEnd();
      if (unlistenError) unlistenError();
    }
  }

  /**
   * 显示NTFS文件查看器模态框
   */
  private async showFileViewerModal(filePath: string): Promise<void> {
    const currentTheme = this.getCurrentTheme();
    const colors = this.getThemeColors(currentTheme);

    // SVG 图标
    const VIEWER_ICONS = {
      hexdump: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2"/><path d="M7 7h2v2H7zM11 7h2v2h-2zM15 7h2v2h-2zM7 11h2v2H7zM11 11h2v2h-2zM15 11h2v2h-2zM7 15h2v2H7zM11 15h2v2h-2zM15 15h2v2h-2z"/></svg>',
      strings: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>',
      encoding: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
      loading: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>',
      file: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
      error: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    };

    let currentMode: 'hexdump' | 'strings' = 'strings';
    let currentEncoding = 'utf-8';

    const modal = document.createElement('div');
    modal.className = 'ntfs-file-viewer-modal';
    modal.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, ${currentTheme === 'light' ? '0.4' : '0.6'});
      display: flex; align-items: center; justify-content: center;
      z-index: 10000; animation: fadeIn 0.2s ease;
    `;

    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
      background: ${colors.modalBg}; border: 1px solid ${colors.modalBorder};
      border-radius: 12px; padding: 0; width: 900px; max-width: 92vw;
      height: 80vh; max-height: 80vh; display: flex; flex-direction: column;
      box-shadow: ${colors.shadow}; animation: slideIn 0.3s ease; overflow: hidden;
    `;

    // ---- 头部 ----
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex; align-items: center; justify-content: space-between;
      padding: 16px 20px; border-bottom: 1px solid ${colors.modalBorder};
      flex-shrink: 0;
    `;

    const titleArea = document.createElement('div');
    titleArea.style.cssText = `display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1;`;
    const fileIcon = document.createElement('span');
    fileIcon.innerHTML = VIEWER_ICONS.file;
    fileIcon.style.cssText = `display: inline-flex; color: ${colors.buttonBg}; flex-shrink: 0;`;
    titleArea.appendChild(fileIcon);

    const titleText = document.createElement('span');
    titleText.style.cssText = `
      font-size: 15px; font-weight: 600; color: ${colors.textPrimary};
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    `;
    titleText.textContent = filePath;
    titleText.title = filePath;
    titleArea.appendChild(titleText);
    header.appendChild(titleArea);

    const closeIconBtn = document.createElement('button');
    closeIconBtn.innerHTML = this.ICONS.close;
    closeIconBtn.style.cssText = `
      background: transparent; border: none; cursor: pointer; padding: 6px;
      color: ${colors.textSecondary}; display: flex; align-items: center;
      justify-content: center; border-radius: 6px; transition: all 0.2s; flex-shrink: 0;
      width: 32px; height: 32px;
    `;
    closeIconBtn.addEventListener('mouseenter', () => { closeIconBtn.style.background = colors.secondaryBg; closeIconBtn.style.color = colors.textPrimary; });
    closeIconBtn.addEventListener('mouseleave', () => { closeIconBtn.style.background = 'transparent'; closeIconBtn.style.color = colors.textSecondary; });
    closeIconBtn.addEventListener('click', () => modal.remove());
    header.appendChild(closeIconBtn);

    // ---- 工具栏 ----
    const toolbar = document.createElement('div');
    toolbar.style.cssText = `
      display: flex; align-items: center; gap: 12px; padding: 10px 20px;
      border-bottom: 1px solid ${colors.modalBorder}; flex-shrink: 0;
      flex-wrap: wrap;
    `;

    // 模式切换按钮组
    const modeGroup = document.createElement('div');
    modeGroup.style.cssText = `display: flex; align-items: center; gap: 2px; background: ${colors.secondaryBg}; border-radius: 8px; padding: 2px;`;

    const createModeBtn = (mode: 'hexdump' | 'strings', icon: string, label: string) => {
      const btn = document.createElement('button');
      btn.dataset.mode = mode;
      btn.style.cssText = `
        display: flex; align-items: center; gap: 5px; padding: 6px 12px;
        border: none; border-radius: 6px; cursor: pointer; font-size: 12px;
        font-weight: 500; transition: all 0.2s; white-space: nowrap;
      `;
      const iconSpan = document.createElement('span');
      iconSpan.innerHTML = icon;
      iconSpan.style.cssText = `display: inline-flex; width: 16px; height: 16px;`;
      btn.appendChild(iconSpan);
      const textSpan = document.createElement('span');
      textSpan.textContent = label;
      btn.appendChild(textSpan);
      return btn;
    };

    const hexBtn = createModeBtn('hexdump', VIEWER_ICONS.hexdump, 'Hexdump');
    const strBtn = createModeBtn('strings', VIEWER_ICONS.strings, 'Strings');
    modeGroup.appendChild(hexBtn);
    modeGroup.appendChild(strBtn);
    toolbar.appendChild(modeGroup);

    // 分隔线
    const sep = document.createElement('div');
    sep.style.cssText = `width: 1px; height: 24px; background: ${colors.modalBorder};`;
    toolbar.appendChild(sep);

    // 编码选择器
    const encodingGroup = document.createElement('div');
    encodingGroup.style.cssText = `display: flex; align-items: center; gap: 6px;`;
    const encodingIcon = document.createElement('span');
    encodingIcon.innerHTML = VIEWER_ICONS.encoding;
    encodingIcon.style.cssText = `display: inline-flex; color: ${colors.textSecondary};`;
    encodingGroup.appendChild(encodingIcon);

    const encodingLabel = document.createElement('span');
    encodingLabel.textContent = '编码:';
    encodingLabel.style.cssText = `font-size: 12px; color: ${colors.textSecondary}; font-weight: 500;`;
    encodingGroup.appendChild(encodingLabel);

    const encodingSelect = document.createElement('select');
    encodingSelect.style.cssText = `
      padding: 5px 8px; border: 1px solid ${colors.modalBorder}; border-radius: 6px;
      background: ${colors.inputBg}; color: ${colors.textPrimary}; font-size: 12px;
      cursor: pointer; outline: none; min-width: 100px;
    `;
    const encodings = [
      { value: 'utf-8', label: 'UTF-8' },
      { value: 'gbk', label: 'GBK' },
      { value: 'utf-16le', label: 'UTF-16LE' },
      { value: 'utf-16be', label: 'UTF-16BE' },
      { value: 'ascii', label: 'ASCII' },
    ];
    encodings.forEach(enc => {
      const opt = document.createElement('option');
      opt.value = enc.value;
      opt.textContent = enc.label;
      if (enc.value === currentEncoding) opt.selected = true;
      encodingSelect.appendChild(opt);
    });
    encodingGroup.appendChild(encodingSelect);
    toolbar.appendChild(encodingGroup);

    // 文件大小信息
    const fileSizeInfo = document.createElement('span');
    fileSizeInfo.style.cssText = `
      font-size: 11px; color: ${colors.textSecondary}; margin-left: auto;
      font-family: 'Consolas', 'Courier New', monospace;
    `;
    fileSizeInfo.textContent = '';
    toolbar.appendChild(fileSizeInfo);

    // ---- 内容区域 ----
    const contentArea = document.createElement('div');
    contentArea.style.cssText = `
      flex: 1; overflow: auto; padding: 0; min-height: 0;
    `;

    const contentPre = document.createElement('pre');
    contentPre.style.cssText = `
      margin: 0; padding: 16px 20px; font-family: 'Consolas', 'Courier New', monospace;
      font-size: 13px; line-height: 1.5; color: ${colors.textPrimary};
      white-space: pre; tab-size: 4; word-break: break-all; min-height: 100%;
    `;
    contentPre.textContent = '';
    contentArea.appendChild(contentPre);

    // 组装
    modalContent.appendChild(header);
    modalContent.appendChild(toolbar);
    modalContent.appendChild(contentArea);
    modal.appendChild(modalContent);

    // 动画样式
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes slideIn { from { transform: translateY(-20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    `;
    modal.appendChild(style);

    // 关闭逻辑
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', escHandler); }
    };
    document.addEventListener('keydown', escHandler);

    document.body.appendChild(modal);

    // ---- 更新UI状态函数 ----
    const updateModeBtnStyles = () => {
      [hexBtn, strBtn].forEach(btn => {
        const isActive = btn.dataset.mode === currentMode;
        btn.style.background = isActive ? colors.buttonBg : 'transparent';
        btn.style.color = isActive ? colors.buttonText : colors.textSecondary;
      });
      // hexdump模式下禁用编码选择
      encodingSelect.disabled = currentMode === 'hexdump';
      encodingSelect.style.opacity = currentMode === 'hexdump' ? '0.5' : '1';
    };

    const formatFileSize = (bytes: number): string => {
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    };

    const loadContent = async () => {
      contentPre.innerHTML = '';
      const loadingDiv = document.createElement('div');
      loadingDiv.style.cssText = `
        display: flex; align-items: center; justify-content: center; gap: 10px;
        padding: 40px; color: ${colors.textSecondary}; font-size: 14px;
      `;
      const spinIcon = document.createElement('span');
      spinIcon.innerHTML = VIEWER_ICONS.loading;
      spinIcon.style.cssText = `display: inline-flex; animation: spin 1s linear infinite;`;
      loadingDiv.appendChild(spinIcon);
      const loadingText = document.createElement('span');
      loadingText.textContent = '正在加载文件...';
      loadingDiv.appendChild(loadingText);
      contentPre.appendChild(loadingDiv);

      try {
        const result = await invoke('read_ntfs_file_for_viewer', {
          filePath: filePath,
          mode: currentMode,
          encoding: currentEncoding,
          maxBytes: 512 * 1024,
        }) as { content: string; file_size: number; truncated: boolean; encoding_used: string; mode: string };

        contentPre.textContent = result.content;
        let sizeText = formatFileSize(result.file_size);
        if (result.truncated) {
          sizeText += ' (已截断, 仅显示前 512 KB)';
        }
        fileSizeInfo.textContent = sizeText;
      } catch (error) {
        contentPre.innerHTML = '';
        const errDiv = document.createElement('div');
        errDiv.style.cssText = `
          display: flex; align-items: center; gap: 8px; padding: 40px;
          color: #ef4444; font-size: 14px; justify-content: center;
        `;
        const errIcon = document.createElement('span');
        errIcon.innerHTML = VIEWER_ICONS.error;
        errIcon.style.cssText = `display: inline-flex;`;
        errDiv.appendChild(errIcon);
        const errText = document.createElement('span');
        errText.textContent = `加载失败: ${error}`;
        errDiv.appendChild(errText);
        contentPre.appendChild(errDiv);
      }
    };

    // ---- 事件绑定 ----
    hexBtn.addEventListener('click', () => {
      if (currentMode === 'hexdump') return;
      currentMode = 'hexdump';
      updateModeBtnStyles();
      loadContent();
    });

    strBtn.addEventListener('click', () => {
      if (currentMode === 'strings') return;
      currentMode = 'strings';
      updateModeBtnStyles();
      loadContent();
    });

    encodingSelect.addEventListener('change', () => {
      currentEncoding = encodingSelect.value;
      loadContent();
    });

    // 初始化
    updateModeBtnStyles();
    loadContent();
  }

  /**
   * 显示时区转换模态框
   */
  private showTimezoneModal(timeValue: string): void {
    // 解析时间
    const utcDate = this.parseTimeString(timeValue);
    if (!utcDate) {
      MessageManager.showError('无法解析时间格式');
      return;
    }

    // 获取当前主题
    const currentTheme = this.getCurrentTheme();
    const colors = this.getThemeColors(currentTheme);

    // 创建模态框
    const modal = document.createElement('div');
    modal.className = 'timezone-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, ${currentTheme === 'light' ? '0.4' : '0.6'});
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      animation: fadeIn 0.2s ease;
    `;

    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
      background: ${colors.modalBg};
      border: 1px solid ${colors.modalBorder};
      border-radius: 12px;
      padding: 24px;
      min-width: 520px;
      max-width: 600px;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: ${colors.shadow};
      animation: slideIn 0.3s ease;
    `;

    // 标题
    const title = document.createElement('div');
    title.style.cssText = `
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 20px;
      color: ${colors.textPrimary};
      border-bottom: 2px solid ${colors.modalBorder};
      padding-bottom: 12px;
    `;
    const globeIcon = document.createElement('span');
    globeIcon.innerHTML = this.ICONS.globe;
    globeIcon.style.cssText = `
      width: 20px;
      height: 20px;
      display: inline-flex;
      color: ${colors.buttonBg};
    `;
    title.appendChild(globeIcon);
    const titleText = document.createElement('span');
    titleText.textContent = '时间格式转换';
    title.appendChild(titleText);

    // 原始时间
    const originalTime = document.createElement('div');
    originalTime.style.cssText = `
      margin-bottom: 20px;
      padding: 14px;
      background: ${colors.inputBg};
      border: 1px solid ${colors.modalBorder};
      border-radius: 8px;
      font-family: 'Consolas', 'Courier New', monospace;
    `;
    const originalLabel = document.createElement('div');
    originalLabel.style.cssText = `
      color: ${colors.textSecondary};
      font-size: 12px;
      margin-bottom: 6px;
      font-weight: 500;
    `;
    originalLabel.textContent = '原始值';
    const originalValue = document.createElement('div');
    originalValue.style.cssText = `
      color: ${colors.textPrimary};
      font-size: 14px;
      font-weight: 500;
    `;
    originalValue.textContent = timeValue;
    originalTime.appendChild(originalLabel);
    originalTime.appendChild(originalValue);

    // 创建复制按钮的辅助函数
    const createCopyButton = (textToCopy: string) => {
      const copyBtn = document.createElement('button');
      copyBtn.className = 'copy-btn';
      copyBtn.style.cssText = `
        padding: 4px 10px;
        background: ${colors.buttonBg};
        color: ${colors.buttonText};
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 11px;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        gap: 4px;
        font-weight: 500;
        flex-shrink: 0;
      `;
      const copyIcon = document.createElement('span');
      copyIcon.innerHTML = this.ICONS.copy;
      copyIcon.style.cssText = `width: 12px; height: 12px; display: inline-flex;`;
      copyBtn.appendChild(copyIcon);
      const copyText = document.createElement('span');
      copyText.textContent = '复制';
      copyBtn.appendChild(copyText);

      copyBtn.addEventListener('mouseenter', () => {
        copyBtn.style.background = colors.buttonHover;
        copyBtn.style.transform = 'scale(1.05)';
      });
      copyBtn.addEventListener('mouseleave', () => {
        copyBtn.style.background = colors.buttonBg;
        copyBtn.style.transform = 'scale(1)';
      });
      copyBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(textToCopy);
          copyIcon.innerHTML = this.ICONS.check;
          copyText.textContent = '已复制';
          copyBtn.style.background = currentTheme === 'sakura' ? '#db2777' : '#10b981';
          setTimeout(() => {
            copyIcon.innerHTML = this.ICONS.copy;
            copyText.textContent = '复制';
            copyBtn.style.background = colors.buttonBg;
          }, 1500);
        } catch (err) {
          console.error('复制失败:', err);
        }
      });

      return copyBtn;
    };

    // 创建格式项的辅助函数
    const createFormatItem = (label: string, value: string, isCompact: boolean = false) => {
      const item = document.createElement('div');
      item.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: ${isCompact ? '8px 12px' : '10px 14px'};
        background: ${colors.itemBg};
        border-radius: 6px;
        border: 1px solid transparent;
        transition: all 0.15s;
      `;

      const textPart = document.createElement('div');
      textPart.style.cssText = `flex: 1; min-width: 0; margin-right: 10px;`;

      const labelDiv = document.createElement('div');
      labelDiv.style.cssText = `
        color: ${colors.textSecondary};
        font-size: 11px;
        margin-bottom: 2px;
      `;
      labelDiv.textContent = label;

      const valueDiv = document.createElement('div');
      valueDiv.style.cssText = `
        color: ${colors.textPrimary};
        font-size: 13px;
        font-family: 'Consolas', 'Courier New', monospace;
        word-break: break-all;
      `;
      valueDiv.textContent = value;

      textPart.appendChild(labelDiv);
      textPart.appendChild(valueDiv);
      item.appendChild(textPart);
      item.appendChild(createCopyButton(value));

      item.addEventListener('mouseenter', () => {
        item.style.background = colors.itemHoverBg;
        item.style.borderColor = colors.itemHoverBorder;
      });
      item.addEventListener('mouseleave', () => {
        item.style.background = colors.itemBg;
        item.style.borderColor = 'transparent';
      });

      return item;
    };

    // 创建分区标题
    const createSectionTitle = (iconSvg: string, text: string) => {
      const section = document.createElement('div');
      section.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 16px 0 10px 0;
        color: ${colors.textPrimary};
        font-weight: 600;
        font-size: 14px;
      `;
      const icon = document.createElement('span');
      icon.innerHTML = iconSvg;
      icon.style.cssText = `width: 16px; height: 16px; display: inline-flex; color: ${colors.buttonBg};`;
      section.appendChild(icon);
      const titleSpan = document.createElement('span');
      titleSpan.textContent = text;
      section.appendChild(titleSpan);
      return section;
    };

    // ========== 通用格式区域 ==========
    const timestampIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
    const formatSection = createSectionTitle(timestampIcon, '时间戳 & 通用格式');

    const formatList = document.createElement('div');
    formatList.style.cssText = `display: flex; flex-direction: column; gap: 6px;`;

    // 时间戳格式
    const unixSeconds = Math.floor(utcDate.getTime() / 1000);
    const unixMillis = utcDate.getTime();
    
    formatList.appendChild(createFormatItem('Unix 时间戳 (秒)', String(unixSeconds), true));
    formatList.appendChild(createFormatItem('Unix 时间戳 (毫秒)', String(unixMillis), true));
    
    // ISO 8601 格式
    formatList.appendChild(createFormatItem('ISO 8601 (UTC)', utcDate.toISOString(), true));
    formatList.appendChild(createFormatItem('ISO 8601 (无毫秒)', utcDate.toISOString().replace(/\\.\\d{3}Z$/, 'Z'), true));
    
    // 其他常见格式
    const pad = (n: number) => String(n).padStart(2, '0');
    const year = utcDate.getUTCFullYear();
    const month = pad(utcDate.getUTCMonth() + 1);
    const day = pad(utcDate.getUTCDate());
    const hours = pad(utcDate.getUTCHours());
    const minutes = pad(utcDate.getUTCMinutes());
    const seconds = pad(utcDate.getUTCSeconds());
    
    formatList.appendChild(createFormatItem('标准格式 (UTC)', `${year}-${month}-${day} ${hours}:${minutes}:${seconds} UTC`, true));
    formatList.appendChild(createFormatItem('日期 (YYYY-MM-DD)', `${year}-${month}-${day}`, true));
    formatList.appendChild(createFormatItem('日期 (DD/MM/YYYY)', `${day}/${month}/${year}`, true));
    formatList.appendChild(createFormatItem('日期 (MM/DD/YYYY)', `${month}/${day}/${year}`, true));
    formatList.appendChild(createFormatItem('仅时间 (HH:MM:SS)', `${hours}:${minutes}:${seconds}`, true));
    
    // RFC 2822 格式
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const rfc2822 = `${weekdays[utcDate.getUTCDay()]}, ${day} ${months[utcDate.getUTCMonth()]} ${year} ${hours}:${minutes}:${seconds} +0000`;
    formatList.appendChild(createFormatItem('RFC 2822', rfc2822, true));
    
    // 相对时间描述
    const now = new Date();
    const diffMs = now.getTime() - utcDate.getTime();
    const diffDays = Math.floor(Math.abs(diffMs) / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(Math.abs(diffMs) / (1000 * 60 * 60));
    const diffMinutes = Math.floor(Math.abs(diffMs) / (1000 * 60));
    let relativeTime = '';
    if (diffMs >= 0) {
      if (diffDays > 365) {
        relativeTime = `${Math.floor(diffDays / 365)} 年前`;
      } else if (diffDays > 30) {
        relativeTime = `${Math.floor(diffDays / 30)} 个月前`;
      } else if (diffDays > 0) {
        relativeTime = `${diffDays} 天前`;
      } else if (diffHours > 0) {
        relativeTime = `${diffHours} 小时前`;
      } else if (diffMinutes > 0) {
        relativeTime = `${diffMinutes} 分钟前`;
      } else {
        relativeTime = '刚刚';
      }
    } else {
      if (diffDays > 365) {
        relativeTime = `${Math.floor(diffDays / 365)} 年后`;
      } else if (diffDays > 30) {
        relativeTime = `${Math.floor(diffDays / 30)} 个月后`;
      } else if (diffDays > 0) {
        relativeTime = `${diffDays} 天后`;
      } else if (diffHours > 0) {
        relativeTime = `${diffHours} 小时后`;
      } else if (diffMinutes > 0) {
        relativeTime = `${diffMinutes} 分钟后`;
      } else {
        relativeTime = '即将到来';
      }
    }
    formatList.appendChild(createFormatItem('相对时间', relativeTime, true));

    // ========== 时区转换区域 ==========
    const globeIcon2 = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>';
    const timezoneSection = createSectionTitle(globeIcon2, '时区转换');

    // 时区列表
    const timezoneList = document.createElement('div');
    timezoneList.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 6px;
    `;

    this.TIMEZONES.forEach(tz => {
      const converted = this.convertToTimezone(utcDate, tz.offset);
      timezoneList.appendChild(createFormatItem(tz.label, converted, true));
    });

    // 关闭按钮
    const closeBtn = document.createElement('button');
    closeBtn.style.cssText = `
      margin-top: 20px;
      padding: 10px 20px;
      background: ${colors.secondaryBg};
      color: ${colors.secondaryText};
      border: 1px solid ${colors.modalBorder};
      border-radius: 8px;
      cursor: pointer;
      width: 100%;
      font-size: 14px;
      font-weight: 500;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    `;
    const closeIcon = document.createElement('span');
    closeIcon.innerHTML = this.ICONS.close;
    closeIcon.style.cssText = `width: 16px; height: 16px; display: inline-flex;`;
    closeBtn.appendChild(closeIcon);
    const closeText = document.createElement('span');
    closeText.textContent = '关闭';
    closeBtn.appendChild(closeText);
    closeBtn.addEventListener('click', () => modal.remove());
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.background = colors.secondaryHover;
      closeBtn.style.transform = 'translateY(-1px)';
    });
    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.background = colors.secondaryBg;
      closeBtn.style.transform = 'translateY(0)';
    });

    // 点击模态框背景关闭
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });

    // ESC键关闭
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        modal.remove();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    // 组装模态框
    modalContent.appendChild(title);
    modalContent.appendChild(originalTime);
    modalContent.appendChild(formatSection);
    modalContent.appendChild(formatList);
    modalContent.appendChild(timezoneSection);
    modalContent.appendChild(timezoneList);
    modalContent.appendChild(closeBtn);
    modal.appendChild(modalContent);

    // 添加动画样式
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes slideIn {
        from { transform: translateY(-20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
    `;
    modal.appendChild(style);

    document.body.appendChild(modal);
  }

  /**
   * 显示右键菜单
   */
  private async showContextMenu(x: number, y: number): Promise<void> {
    // 先移除旧菜单
    const oldMenu = document.querySelector('#embedded-csv-context-menu');
    if (oldMenu) {
      oldMenu.remove();
    }

    // 检查是否为Time列
    const isTimeColumn = this.contextMenuData?.columnName?.toLowerCase().includes('time') || false;
    const timeValue = this.contextMenuData?.cellValue || '';

    // 渲染新菜单（包含插件）
    let menuHtml = await this.pluginManager.renderContextMenu();
    
    // ── 构建条件菜单项，注入基础菜单的占位符（避免脆弱的字符串锚点） ──
    let topConditionalHtml = '';
    let conditionalHtml = '';

    // 时区转换（Time 列）→ 顶部占位
    if (isTimeColumn && timeValue) {
      const globeSvg = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>';
      topConditionalHtml += `
        <div class="context-menu-item timezone-convert-item" data-action="convert-timezone">
          <span class="context-menu-icon">${globeSvg}</span>
          <span>转换时区</span>
        </div>
        <div class="context-menu-separator"></div>`;
    }

    // 外部第二视图复用时用 externalFileContext 覆盖文件上下文，以便条件项判断一致
    const currentFilename = this.externalFileContext?.displayName ?? this.state.data?.filename ?? '';
    const currentLoadFileName = this.externalFileContext?.loadFileName ?? this.currentLoadInfo?.fileName ?? '';

    // 查看该文件内容（timeline_ntfs.csv 的 Text / files.csv 的 Path）
    const isNtfsTimeline = currentFilename.toLowerCase().includes('ntfs') || currentLoadFileName.toLowerCase().includes('timeline_ntfs');
    const isFilesCsv = currentLoadFileName.toLowerCase() === 'files.csv' || currentFilename === '内存文件';
    const textFieldValue = this.contextMenuData?.rowData?.['Text'] || '';
    const pathFieldValue = this.contextMenuData?.rowData?.['Path'] || '';
    if ((isNtfsTimeline && textFieldValue) || (isFilesCsv && pathFieldValue)) {
      const fileViewSvg = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>';
      conditionalHtml += `
        <div class="context-menu-item" data-action="view-ntfs-file">
          <span class="context-menu-icon">${fileViewSvg}</span>
          <span>查看该文件内容</span>
        </div>`;
    }

    // 可视化进程内存（任意含数字 PID 的行）
    const vizPid = this.contextMenuData?.rowData?.['PID']
      || this.contextMenuData?.rowData?.['Pid']
      || this.contextMenuData?.rowData?.['pid'] || '';
    if (/^\d+$/.test(vizPid.trim())) {
      const imgSvg = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><path d="m21 15-5-5L5 21"></path></svg>';
      conditionalHtml += `
        <div class="context-menu-item" data-action="visualize-process-memory">
          <span class="context-menu-icon">${imgSvg}</span>
          <span>可视化进程内存</span>
        </div>`;
    }

    // 凭据提取（process.csv）
    const isProcessCsv = currentLoadFileName.toLowerCase() === 'process.csv' || currentFilename === '进程信息';
    const processName = this.contextMenuData?.rowData?.['Name'] || '';
    const pn = processName.toLowerCase();
    if (isProcessCsv && pn === 'lsass.exe') {
      const credSvg = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>';
      conditionalHtml += `
        <div class="context-menu-item" data-action="extract-credentials">
          <span class="context-menu-icon">${credSvg}</span>
          <span>提取凭据 (pypykatz)</span>
        </div>`;
    }

    const menuContainer = document.createElement('div');
    menuContainer.innerHTML = menuHtml;
    const menu = menuContainer.firstElementChild as HTMLElement;

    if (!menu) return;

    // 注入条件菜单项到占位符
    const topSlot = menu.querySelector('#ctx-conditional-top');
    if (topSlot) topSlot.innerHTML = topConditionalHtml;
    const condSlot = menu.querySelector('#ctx-conditional');
    if (condSlot) condSlot.innerHTML = conditionalHtml;

    // 将菜单添加到 body，确保 position: fixed 生效
    document.body.appendChild(menu);

    // 绑定菜单项事件
    this.bindContextMenuItemEvents();

    menu.style.display = 'block';

    // 计算位置，防止超出视口（始终夹在视口内，避免边缘右键时菜单被裁掉看不见）
    const MARGIN = 8;
    const menuRect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = x;
    let top = y;

    // 水平：优先在光标右侧展开；放不下则左移，并夹在 [MARGIN, 视口-宽-MARGIN]
    if (left + menuRect.width + MARGIN > viewportWidth) {
      left = viewportWidth - menuRect.width - MARGIN;
    }
    left = Math.max(MARGIN, left);

    // 垂直：优先在光标下方展开；放不下则上移，并夹在 [MARGIN, 视口-高-MARGIN]
    if (top + menuRect.height + MARGIN > viewportHeight) {
      top = viewportHeight - menuRect.height - MARGIN;
    }
    top = Math.max(MARGIN, top);

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    // 二级面板方向自适应：右侧空间不足 → 向左展开
    const SUBMENU_WIDTH = 240;
    menu.classList.toggle(
      'submenu-left',
      left + menuRect.width + SUBMENU_WIDTH > viewportWidth
    );

    // 二级面板纵向自适应：触发项位于视口下半区 → 向上展开，避免面板伸出屏幕底部被裁
    menu.querySelectorAll('.context-menu-submenu').forEach((sub) => {
      const triggerRect = (sub as HTMLElement).getBoundingClientRect();
      (sub as HTMLElement).classList.toggle(
        'submenu-up',
        triggerRect.top > viewportHeight * 0.55
      );
    });
  }

  /**
   * 隐藏右键菜单
   */
  private hideContextMenu(): void {
    const menu = document.querySelector('#embedded-csv-context-menu') as HTMLElement;
    if (menu) {
      menu.remove();
    }
    
    // 清除选中状态
    this.container?.querySelectorAll('.context-selected').forEach(el => {
      el.classList.remove('context-selected');
    });
  }

  /**
   * 提取凭据 (pypykatz) —— 右键 lsass.exe 触发，弹窗内分 LSASS / 注册表 / DPAPI 三个标签
   */
  private async extractCredentials(pid: string, processName: string): Promise<void> {
    if (!document.querySelector('#cred-modal-styles')) {
      const styleEl = document.createElement('style');
      styleEl.id = 'cred-modal-styles';
      styleEl.textContent = `
        .cred-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(3px); z-index: 100000; display: flex; align-items: center; justify-content: center; }
        .cred-dialog { width: min(900px, 92vw); max-height: 86vh; display: flex; flex-direction: column; background: var(--bg-secondary, #1e1e2e); color: var(--text-primary, #cdd6f4); border: 1px solid var(--border-color, #45475a); border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,0.4); overflow: hidden; }
        .cred-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; border-bottom: 1px solid var(--border-color, #45475a); flex-shrink: 0; }
        .cred-title { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 600; }
        .cred-title svg { width: 18px; height: 18px; color: var(--primary-color, #89b4fa); }
        .cred-close { width: 30px; height: 30px; border: none; background: transparent; color: var(--text-secondary, #a6adc8); border-radius: 6px; cursor: pointer; font-size: 15px; }
        .cred-close:hover { background: rgba(239,68,68,0.15); color: #ef4444; }
        .cred-meta { padding: 8px 16px; font-size: 12px; color: var(--text-secondary, #a6adc8); border-bottom: 1px solid var(--border-color, #45475a); flex-shrink: 0; }
        .cred-meta code { background: var(--bg-primary, #11111b); padding: 1px 5px; border-radius: 3px; }
        .cred-body { padding: 0 0 14px; overflow: auto; }
        .cred-tabs { display: flex; gap: 4px; padding: 10px 12px 0; border-bottom: 1px solid var(--border-color, #45475a); position: sticky; top: 0; background: var(--bg-secondary, #1e1e2e); z-index: 1; }
        .cred-tab { padding: 7px 14px; border: none; background: transparent; color: var(--text-secondary, #a6adc8); border-radius: 6px 6px 0 0; cursor: pointer; font-size: 13px; }
        .cred-tab.active { background: var(--bg-primary, #11111b); color: var(--primary-color, #89b4fa); font-weight: 600; }
        .cred-panel { display: none; padding: 14px 16px; }
        .cred-panel.active { display: block; }
        .cred-loading { text-align: center; padding: 30px 0; color: var(--text-secondary, #a6adc8); font-size: 13px; }
        .cred-spinner { width: 22px; height: 22px; border: 2.5px solid var(--border-color, #45475a); border-top-color: var(--primary-color, #89b4fa); border-radius: 50%; animation: cred-spin 0.7s linear infinite; display: inline-block; margin-bottom: 10px; }
        @keyframes cred-spin { to { transform: rotate(360deg); } }
        .cred-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .cred-table th { text-align: left; padding: 6px 8px; color: var(--text-secondary, #a6adc8); border-bottom: 1px solid var(--border-color, #45475a); font-weight: 600; white-space: nowrap; }
        .cred-table td { padding: 6px 8px; border-bottom: 1px solid rgba(128,128,128,0.12); vertical-align: top; word-break: break-all; }
        .cred-table tr:hover td { background: rgba(137,180,250,0.06); }
        .cred-mono { font-family: 'Cascadia Code','Consolas',monospace; }
        .cred-copy { border: 1px solid var(--border-color,#45475a); background: var(--bg-primary,#11111b); color: var(--text-secondary,#a6adc8); border-radius: 4px; padding: 1px 7px; cursor: pointer; font-size: 11px; margin-left: 6px; }
        .cred-copy:hover { color: var(--text-primary,#cdd6f4); }
        .cred-empty { color: var(--text-secondary,#a6adc8); font-size: 12.5px; padding: 16px 4px; }
        .cred-err { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.25); color: #f06a64; border-radius: 6px; padding: 10px 12px; font-size: 12.5px; margin-bottom: 10px; word-break: break-all; }
        .cred-section-title { font-size: 12px; font-weight: 600; color: var(--text-primary,#cdd6f4); margin: 12px 0 6px; }
        .cred-source { font-size: 11px; color: var(--text-secondary,#a6adc8); margin-bottom: 8px; padding: 6px 8px; background: color-mix(in srgb, var(--primary-color,#89b4fa) 10%, transparent); border-radius: 6px; word-break: break-all; }
        .cred-vol3 { max-height: 320px; overflow: auto; background: var(--bg-primary,#11111b); border: 1px solid var(--border-color,#45475a); border-radius: 6px; padding: 10px; font-size: 11px; font-family: 'Cascadia Code','Consolas',monospace; white-space: pre-wrap; word-break: break-all; margin-bottom: 10px; }
        .cred-raw { margin-top: 12px; }
        .cred-raw summary { cursor: pointer; font-size: 12px; color: var(--text-secondary,#a6adc8); }
        .cred-raw pre { max-height: 280px; overflow: auto; background: var(--bg-primary,#11111b); border: 1px solid var(--border-color,#45475a); border-radius: 6px; padding: 10px; font-size: 11px; font-family: 'Cascadia Code','Consolas',monospace; white-space: pre-wrap; word-break: break-all; }
        .cred-install { text-align: center; padding: 24px 12px; }
        .cred-install p { color: var(--text-secondary,#a6adc8); font-size: 13px; margin-bottom: 12px; line-height: 1.6; }
        .cred-install-btn { background: var(--primary-color,#89b4fa); color: #fff; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500; }
        .cred-install-btn:disabled { opacity: 0.6; cursor: not-allowed; }
      `;
      document.head.appendChild(styleEl);
    }

    const lockSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
    const modal = document.createElement('div');
    modal.className = 'cred-overlay';
    modal.innerHTML = `
      <div class="cred-dialog">
        <div class="cred-header">
          <div class="cred-title">${lockSvg} 凭据提取 (pypykatz)</div>
          <button class="cred-close" id="cred-close">✕</button>
        </div>
        <div class="cred-meta">进程: <strong>${this.escapeHtml(processName)}</strong> (PID: ${this.escapeHtml(pid)}) · LSASS: <code>${getMountRoot()}pid\\${this.escapeHtml(pid)}\\minidump\\minidump.dmp</code></div>
        <div id="cred-content" class="cred-body">
          <div class="cred-loading"><div class="cred-spinner"></div><p>正在检查 pypykatz 环境...</p></div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.querySelector('#cred-close')?.addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    const content = modal.querySelector('#cred-content') as HTMLElement;

    try {
      const installed = await invoke('check_pypykatz_installed') as boolean;
      if (!installed) {
        content.innerHTML = `
          <div class="cred-install">
            <p>未检测到可用的 pypykatz（未安装，或安装已损坏:缺少 __main__ / .exe 启动器失效）。点击下方按钮用配置的 Python 强制重装修复。</p>
            <button class="cred-install-btn" id="cred-install-btn">安装 / 修复 pypykatz</button>
          </div>`;
        const btn = content.querySelector('#cred-install-btn') as HTMLButtonElement;
        btn?.addEventListener('click', async () => {
          btn.disabled = true;
          btn.textContent = '正在重装 pypykatz(下载中，可能需要一会儿)…';
          try {
            await invoke('repair_pypykatz');
            content.innerHTML = `<div class="cred-loading"><div class="cred-spinner"></div><p>修复完成，正在提取凭据…</p></div>`;
            await this.runCredentialExtraction(pid, content);
          } catch (e) {
            content.innerHTML = `<div class="cred-err">修复失败: ${this.escapeHtml(String(e))}</div>`;
          }
        });
        return;
      }
      content.innerHTML = `<div class="cred-loading"><div class="cred-spinner"></div><p>正在用 pypykatz 提取凭据…<br><span style="font-size:11px;opacity:.8;">若 MemProcFS 无法导出 lsass minidump，将自动改用 Volatility3 转储，可能较慢</span></p></div>`;
      await this.runCredentialExtraction(pid, content);
    } catch (e) {
      content.innerHTML = `<div class="cred-err">${this.escapeHtml(String(e))}</div>`;
    }
  }

  /** 调用后端提取并渲染三个标签 */
  private async runCredentialExtraction(pid: string, content: HTMLElement): Promise<void> {
    let result: any;
    try {
      result = await invoke('extract_credentials', { args: { pid, modes: ['lsa', 'registry', 'dpapi'] } });
    } catch (e) {
      content.innerHTML = `<div class="cred-err">提取失败: ${this.escapeHtml(String(e))}</div>`;
      return;
    }

    const byMode: Record<string, any> = {};
    for (const r of (result?.results || [])) byMode[r.mode] = r;

    content.innerHTML = `
      <div class="cred-tabs">
        <button class="cred-tab active" data-tab="lsa">LSASS</button>
        <button class="cred-tab" data-tab="registry">注册表</button>
        <button class="cred-tab" data-tab="dpapi">DPAPI</button>
      </div>
      <div class="cred-panel active" id="cred-panel-lsa">${this.renderLsaPanel(byMode['lsa'])}</div>
      <div class="cred-panel" id="cred-panel-registry">${this.renderRegistryPanel(byMode['registry'])}</div>
      <div class="cred-panel" id="cred-panel-dpapi">${this.renderDpapiPanel(byMode['lsa'], byMode['dpapi'])}</div>
    `;

    content.querySelectorAll('.cred-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const t = (tab as HTMLElement).dataset.tab;
        content.querySelectorAll('.cred-tab').forEach(x => x.classList.toggle('active', x === tab));
        content.querySelectorAll('.cred-panel').forEach(p => p.classList.toggle('active', (p as HTMLElement).id === `cred-panel-${t}`));
      });
    });

    content.querySelectorAll('.cred-copy').forEach(b => {
      b.addEventListener('click', async () => {
        const val = (b as HTMLElement).dataset.copy || '';
        try {
          await navigator.clipboard.writeText(val);
          (b as HTMLElement).textContent = '已复制';
          setTimeout(() => { (b as HTMLElement).textContent = '复制'; }, 1500);
        } catch { /* ignore */ }
      });
    });
  }

  /** 生成凭据表格（最后一列带复制按钮） */
  private credTable(headers: string[], rows: string[][]): string {
    const th = headers.map(h => `<th>${this.escapeHtml(h)}</th>`).join('');
    const body = rows.map(cols => {
      const tds = cols.map((c, i) => {
        const val = c || '';
        const isLast = i === cols.length - 1;
        const copy = (isLast && val) ? `<button class="cred-copy" data-copy="${this.escapeHtml(val)}">复制</button>` : '';
        return `<td class="${isLast ? 'cred-mono' : ''}">${this.escapeHtml(val)}${copy}</td>`;
      }).join('');
      return `<tr>${tds}</tr>`;
    }).join('');
    return `<table class="cred-table"><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`;
  }

  /** 原始 JSON 折叠块 */
  private rawJsonBlock(json: any): string {
    let s = '';
    try { s = JSON.stringify(json, null, 2); } catch { s = String(json); }
    return `<details class="cred-raw"><summary>查看原始 JSON</summary><pre>${this.escapeHtml(s)}</pre></details>`;
  }

  /** LSASS 面板：按登录会话展开各凭据类型 */
  private renderLsaPanel(mode: any): string {
    if (!mode) return `<div class="cred-empty">无 LSASS 结果</div>`;
    let html = '';
    if (mode.source) html += `<div class="cred-source">来源: ${this.escapeHtml(String(mode.source))}</div>`;
    if (mode.error) html += `<div class="cred-err">${this.escapeHtml(mode.error)}</div>`;

    // Volatility3 兜底结果(整镜像凭据插件输出):按段落展示各插件文本
    if (mode.json && mode.json.vol3 && typeof mode.json.vol3 === 'object') {
      for (const label of Object.keys(mode.json.vol3)) {
        html += `<div class="cred-section-title">${this.escapeHtml(label)}</div>`;
        html += `<pre class="cred-vol3">${this.escapeHtml(String(mode.json.vol3[label] ?? ''))}</pre>`;
      }
      return html;
    }

    const rows: string[][] = [];
    const json = mode.json;
    if (json && typeof json === 'object') {
      const credArrays: Array<[string, string]> = [
        ['msv_creds', 'MSV'], ['wdigest_creds', 'WDIGEST'], ['kerberos_creds', 'Kerberos'],
        ['ssp_creds', 'SSP'], ['livessp_creds', 'LiveSSP'], ['tspkg_creds', 'TsPkg'],
        ['credman_creds', 'CredMan'], ['cloudap_creds', 'CloudAP'],
      ];
      for (const dumpKey of Object.keys(json)) {
        const sessions = json[dumpKey]?.logon_sessions;
        if (!sessions || typeof sessions !== 'object') continue;
        for (const luid of Object.keys(sessions)) {
          const s = sessions[luid] || {};
          const baseUser = s.username || '';
          const baseDom = s.domainname || '';
          for (const [key, label] of credArrays) {
            const arr = s[key];
            if (!Array.isArray(arr)) continue;
            for (const c of arr) {
              const user = c.username || baseUser;
              const dom = c.domainname || baseDom;
              let secret = '';
              const nt = c.NThash || c.nthash;
              const lm = c.LMHash || c.lmhash;
              if (c.password) secret = String(c.password);
              else if (nt) { secret = `NT:${nt}`; if (lm && !/^0+$/.test(String(lm))) secret += `  LM:${lm}`; }
              else if (c.SHA1 || c.sha1) secret = `SHA1:${c.SHA1 || c.sha1}`;
              if (user || secret) rows.push([label, String(user || ''), String(dom || ''), secret]);
            }
          }
        }
      }
    }
    if (rows.length) html += this.credTable(['类型', '用户', '域', '密钥 / 明文'], rows);
    else if (!mode.error) html += `<div class="cred-empty">未从 LSASS 提取到凭据</div>`;
    if (mode.raw) html += `<div class="cred-err">${this.escapeHtml(String(mode.raw)).slice(0, 4000)}</div>`;
    if (json) html += this.rawJsonBlock(json);
    return html;
  }

  /** 注册表面板：通用递归收集含哈希/密码的对象（SAM/LSA secrets/DCC2） */
  private renderRegistryPanel(mode: any): string {
    if (!mode) return `<div class="cred-empty">无注册表结果</div>`;
    let html = '';
    if (mode.error) html += `<div class="cred-err">${this.escapeHtml(mode.error)}</div>`;
    const rows = mode.json ? this.harvestCreds(mode.json) : [];
    if (rows.length) html += this.credTable(['位置', '用户', '哈希/密钥', '明文'], rows.map(r => [r.path, r.user, r.hash, r.secret]));
    else if (!mode.error) html += `<div class="cred-empty">未提取到注册表凭据</div>`;
    if (mode.raw) html += `<div class="cred-err">${this.escapeHtml(String(mode.raw)).slice(0, 4000)}</div>`;
    if (mode.json) html += this.rawJsonBlock(mode.json);
    return html;
  }

  /** DPAPI 面板：汇总 LSASS 中的 DPAPI 主密钥 + 后端说明 */
  private renderDpapiPanel(lsaMode: any, dpapiMode: any): string {
    let html = `<div class="cred-section-title">LSASS 中的 DPAPI 主密钥</div>`;
    const masterkeys: any[] = [];
    const json = lsaMode?.json;
    if (json && typeof json === 'object') {
      for (const dumpKey of Object.keys(json)) {
        const sessions = json[dumpKey]?.logon_sessions;
        if (!sessions || typeof sessions !== 'object') continue;
        for (const luid of Object.keys(sessions)) {
          const arr = sessions[luid]?.dpapi_creds;
          if (Array.isArray(arr)) masterkeys.push(...arr);
        }
      }
    }
    if (masterkeys.length) {
      html += this.credTable(['Key GUID', 'Masterkey', 'SHA1'], masterkeys.map(m => [
        String(m.key_guid || m.keyguid || ''), String(m.masterkey || ''), String(m.sha1_masterkey || m.sha1masterkey || ''),
      ]));
    } else {
      html += `<div class="cred-empty">LSASS 中未发现 DPAPI 主密钥</div>`;
    }
    if (dpapiMode?.error) html += `<div class="cred-err" style="margin-top:12px;">${this.escapeHtml(dpapiMode.error)}</div>`;
    return html;
  }

  /** 递归收集任意 pypykatz JSON 中含哈希/密码的对象 */
  private harvestCreds(json: any): Array<{ path: string; user: string; hash: string; secret: string }> {
    const out: Array<{ path: string; user: string; hash: string; secret: string }> = [];
    const visit = (node: any, path: string): void => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) { node.forEach((v, i) => visit(v, `${path}[${i}]`)); return; }
      const lower: Record<string, any> = {};
      for (const k of Object.keys(node)) lower[k.toLowerCase()] = node[k];
      const hash = lower['nthash'] ?? lower['nt_hash'] ?? lower['lmhash'] ?? lower['lm_hash'] ?? lower['sha1'] ?? lower['masterkey'] ?? lower['sha1_masterkey'] ?? '';
      const secretRaw = lower['password'] ?? lower['secret'] ?? lower['cleartext'] ?? '';
      const user = lower['username'] ?? lower['user'] ?? lower['name'] ?? '';
      if ((hash && String(hash).length) || (secretRaw !== '' && secretRaw != null)) {
        out.push({
          path,
          user: String(user || ''),
          hash: String(hash || ''),
          secret: typeof secretRaw === 'string' ? secretRaw : (secretRaw == null ? '' : JSON.stringify(secretRaw)),
        });
      }
      for (const k of Object.keys(node)) visit(node[k], path ? `${path}.${k}` : k);
    };
    visit(json, '');
    return out;
  }

  /**
   * 清理
   */
  cleanup(): void {
    // 清理工具提示定时器
    this.clearTooltipTimers();
    this.hideTooltip();
    
    this.state = {
      isLoading: false,
      error: null,
      data: null,
      currentPage: 1,
      rowsPerPage: 100,
      totalPages: 1,
      searchKeyword: '',
      filteredRows: [],
      sortColumn: null,
      sortDirection: 'asc',
      columnFilters: new Map(),
      viewMode: 'csv',
      textContent: '',
      textLines: [],
      filteredTextLines: []
    };
    if (this.container) {
      this.container.innerHTML = '';
    }
    
    // 清理颜色映射
    this.colorCoding.columnColorMaps.clear();
    
    // 清理管理器
    this.tooltipRuleManager.cleanup();
  }

  /**
   * 首次使用右键菜单引导
   */
  private showContextMenuGuide(): void {
    const GUIDE_KEY = 'lovelymem-csv-contextmenu-guide-done';
    if (localStorage.getItem(GUIDE_KEY)) return;
    if (!this.state.data && !this.state.textContent) return;

    // 标记已显示
    localStorage.setItem(GUIDE_KEY, 'true');

    // 延迟显示，确保表格已渲染
    setTimeout(() => {
      const toast = document.createElement('div');
      toast.className = 'csv-contextmenu-guide-toast';
      toast.innerHTML = `
        <div class="csv-guide-toast-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
        </div>
        <div class="csv-guide-toast-content">
          <div class="csv-guide-toast-title">右键菜单可用</div>
          <div class="csv-guide-toast-desc">在数据表格上右键点击，可使用以下功能：</div>
          <ul class="csv-guide-toast-list">
            <li>Volatility2 对选中行执行深度分析</li>
            <li>复制单元格/整行数据</li>
            <li>时区转换（UTC/北京时间等）</li>
            <li>导出搜索结果为CSV</li>
            <li>VirusTotal/威胁情报在线查询</li>
          </ul>
        </div>
        <button class="csv-guide-toast-close" id="csv-guide-toast-close">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      `;
      document.body.appendChild(toast);

      // 入场动画
      requestAnimationFrame(() => {
        toast.classList.add('show');
      });

      const dismiss = () => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
      };

      toast.querySelector('#csv-guide-toast-close')?.addEventListener('click', dismiss);

      // 8秒后自动关闭
      setTimeout(dismiss, 8000);
    }, 800);
  }
}

// 导出单例
export const embeddedCSVViewer = new EmbeddedCSVViewer();
