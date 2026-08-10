/**
 * CSV插件管理器组件
 * 负责CSV查看器的插件系统管理
 */

import { showModuleStatsIfPID } from './CSVModuleStats';
import { IconParkHelper } from '../../utils/iconparkHelper';

const { invoke } = (window as any).__TAURI__.core;
const { emit } = (window as any).__TAURI__.event;

/** 插件数据结构 */
export interface CSVPlugin {
    id: string;
    name: string;
    description?: string;
    command: string;
    icon: string;
    hotkey?: string | null;
    output_filename?: string | null;
    allowed_columns?: string[] | null;
    allowed_filenames?: string[] | string | null;
    input_labels?: Record<string, string> | null;
    context_menu_enabled?: boolean;
    open_output_folder?: boolean;
    /** 命令分类（右键二级菜单分组） */
    category?: string | null;
    created_at?: string;
    updated_at?: string;
    [key: string]: unknown;
}

/** 上下文菜单数据 */
export interface ContextMenuData {
    cellValue: string;
    rowIndex: number;
    cellIndex: number;
    columnName: string;
    selectedCell?: HTMLElement;
}

/** 插件执行上下文 */
interface PluginContext {
    selected_file: string;
    selected_row: number;
    selected_cell: string;
    selected_column: string;
    all_selected_cells: string;
}

/** 插件执行结果 */
interface PluginResult {
    success: boolean;
    output?: string;
    error?: string;
    executed_command?: string;
    should_open_file?: boolean;
    output_file?: string;
    output_file_type?: string;
}

/** 行上下文查看状态 */
interface RowContextState {
    currentRowIndex: number;
    startIndex: number;
    endIndex: number;
    totalRows: number;
    headers: string[];
}

/** AI对话消息 */
interface AiMessage {
    role: 'user' | 'assistant';
    content: string;
}

/** AI对话状态 */
interface AiConversation {
    fileName: string;
    rowData: Record<string, string>;
    messages: AiMessage[];
}

/** 上下文行信息 */
interface ContextRowInfo {
    index: number;
    data: Record<string, string>;
    isCurrent: boolean;
}

/**
 * CSV插件管理器类
 */
export class CSVPluginManager {
    /** 内嵌取证操作，仅供右键菜单使用 */
    private builtinPlugins: CSVPlugin[] = [];
    private contextMenuData: ContextMenuData | null;
    private eventListenersAdded: boolean;
    private pluginMenuClickHandler?: (e: MouseEvent) => void;
    private contextTableRightClickHandler?: (e: MouseEvent) => void;
    private rowContextState: RowContextState | null = null;
    private aiConversation!: AiConversation;
    public isPluginAllowedForFile!: (plugin: CSVPlugin, currentFileName?: string) => boolean;

    constructor(_stateManager: unknown = null, _commandWindowManager: unknown = null) {
        this.contextMenuData = null;
        this.eventListenersAdded = false; // 标记是否已添加事件监听器

        this.init();
    }

    /**
     * 初始化插件管理器
     */
    async init(): Promise<void> {
        try {
            // 先绑定事件，确保UI响应
            this.bindEvents();

            // 异步加载插件配置，不阻塞初始化
            this.loadPluginsAsync();

            console.log('插件管理器初始化完成');
        } catch (error) {
            console.error('插件管理器初始化失败:', error);
        }
    }

    /**
     * 异步加载插件配置（非阻塞）
     */
    async loadPluginsAsync(): Promise<void> {
        try {
            console.log('开始异步加载插件配置...');
            await this.loadPlugins();
            console.log('插件配置异步加载完成');
        } catch (error) {
            console.error('异步加载插件失败:', error);
        }
    }

    /**
     * 绑定右键菜单事件
     */
    bindEvents(): void {
        if (this.eventListenersAdded) {
            return;
        }

        document.addEventListener('contextmenu', (e: MouseEvent) => this.handleContextMenu(e));
        document.addEventListener('click', (e: MouseEvent) => this.handleDocumentClick(e));
        this.eventListenersAdded = true;
    }

    /**
     * 加载内嵌取证操作
     */
    async loadPlugins(): Promise<void> {
        try {
            this.builtinPlugins = (await invoke('get_builtin_csv_plugins')) as CSVPlugin[] || [];
        } catch (e) {
            console.warn('加载内嵌 CSV 取证操作失败:', e);
            this.builtinPlugins = [];
        }
    }

    /** 供右键菜单使用的内嵌取证操作 */
    private allMenuPlugins(): CSVPlugin[] {
        return this.builtinPlugins;
    }

    /** emoji 图标转 SVG（与内嵌查看器一致） */
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
        return '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6h12v8H18zM8 14h32v28H8z" transform="scale(0.5)"/><circle cx="9" cy="14" r="2"/><circle cx="15" cy="14" r="2"/></svg>';
    }

    /**
     * 汇总当前行可用插件（含内置），并为每个插件确定目标列（与内嵌查看器一致）
     */
    private getApplicableRowPlugins(): Array<{ plugin: CSVPlugin; column: string }> {
        const rowData = this.getFullRowData() || {};
        const currentCol = this.contextMenuData?.columnName || '';
        const cols = Object.keys(rowData);
        const fileName = (window as any).currentCSVFileName;
        const seen = new Set<string>();
        const result: Array<{ plugin: CSVPlugin; column: string }> = [];
        for (const p of this.allMenuPlugins()) {
            if (p.context_menu_enabled === false) continue;
            if (!this.isPluginAllowedForFile(p, fileName)) continue;
            const allowed = p.allowed_columns as string[] | null | undefined;
            let col = '';
            if (!allowed || allowed.length === 0) {
                col = currentCol || cols[0] || '';
            } else if (currentCol && allowed.includes(currentCol)) {
                col = currentCol;
            } else {
                col = allowed.find(c => cols.includes(c)) || '';
                if (!col) continue;
            }
            if (seen.has(p.id)) continue;
            seen.add(p.id);
            result.push({ plugin: p, column: col });
        }
        return result;
    }

    /** 把可用插件按分类渲染为二级菜单 HTML（与内嵌查看器一致） */
    private renderPluginCategoryMenu(): string {
        const applicable = this.getApplicableRowPlugins();
        if (applicable.length === 0) {
            return `<div class="context-menu-item" style="color: var(--text-secondary); cursor: default;"><span>此行暂无可用取证操作</span></div>`;
        }
        const groups = new Map<string, Array<{ plugin: CSVPlugin; column: string }>>();
        for (const item of applicable) {
            const cat = ((item.plugin as any).category && String((item.plugin as any).category).trim()) || '其他';
            if (!groups.has(cat)) groups.set(cat, []);
            groups.get(cat)!.push(item);
        }
        const pluginSvg = this.renderPluginIcon('');
        let html = '';
        for (const [cat, items] of groups) {
            const subItems = items.map(({ plugin, column }) => `
                <div class="context-menu-item plugin-item" data-plugin-id="${plugin.id}" data-column="${this.escapeHtml(column)}">
                    <span class="context-menu-icon">${this.renderPluginIcon(plugin.icon)}</span>
                    <span>${this.escapeHtml(plugin.name)}</span>
                </div>`).join('');
            html += `
                <div class="context-menu-submenu">
                    <div class="context-menu-item context-menu-submenu-trigger">
                        <span class="context-menu-icon">${pluginSvg}</span>
                        <span class="context-menu-name">${this.escapeHtml(cat)}</span>
                        <span class="context-menu-count">${items.length}</span>
                        <span class="context-menu-submenu-arrow">▸</span>
                    </div>
                    <div class="context-menu-submenu-panel">${subItems}</div>
                </div>`;
        }
        return html;
    }

    /**
     * 转义HTML字符
     */
    escapeHtml(text: string): string {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * 处理文档点击事件
     */
    handleDocumentClick(e: MouseEvent): void {
        const menu = document.getElementById('contextMenu');
        if (!menu || menu.style.display === 'none') {
            return; // 菜单未显示，无需处理
        }

        // 检查点击的是否是右键菜单或其子元素
        if (menu.contains(e.target as Node)) {
            return; // 点击的是菜单本身，不隐藏
        }

        // 点击的是其他地方，隐藏右键菜单
        this.hideContextMenu();
    }

    /**
     * 处理右键菜单
     */
    handleContextMenu(e: MouseEvent): void {
        // 只在表格单元格上显示右键菜单
        const cell = (e.target as HTMLElement).closest('td') as HTMLTableCellElement | null;
        if (!cell) {
            return;
        }

        e.preventDefault();

        // 清除之前的选中状态
        this.clearContextSelection();

        // 添加右键选中效果
        cell.classList.add('context-selected');

        // 获取单元格数据
        const row = cell.parentElement as HTMLElement;
        const cellIndex = Array.from(row.children).indexOf(cell);
        const rowIndex = Array.from(row.parentElement!.children).indexOf(row);

        // 保存上下文数据
        this.contextMenuData = {
            cellValue: (cell.textContent || '').trim(),
            rowIndex: rowIndex,
            cellIndex: cellIndex,
            columnName: this.getColumnName(cellIndex),
            selectedCell: cell  // 保存选中的单元格引用
        };

        // 显示右键菜单
        this.showContextMenu(e.clientX, e.clientY).catch(error => {
            console.error('显示右键菜单失败:', error);
        });
    }

    /**
     * 获取列名
     * @param cellIndex - 单元格索引
     * @param fromContextTable - 是否从上下文表格获取
     */
    getColumnName(cellIndex: number, fromContextTable: boolean = false): string {
        const tableId = fromContextTable ? '#contextTable' : '#csvTable';
        const headerRow = document.querySelector(`${tableId} thead tr`);
        if (headerRow && headerRow.children[cellIndex]) {
            return (headerRow.children[cellIndex].textContent || '').trim();
        }
        return `列${cellIndex + 1}`;
    }

    /**
     * 获取当前行的完整数据
     * @returns 行数据对象 {列名: 值}
     */
    getFullRowData(): Record<string, string> | null {
        if (!this.contextMenuData) {
            return null;
        }

        try {
            // 优先从全局CSV查看器获取数据
            const w = window as any;
            if (w.globalCSVViewer && w.globalCSVViewer.data) {
                const viewer = w.globalCSVViewer;
                const headers: string[] = viewer.data.headers || [];

                // 获取当前页的数据
                const currentPageData = viewer.getCurrentPageData();
                const rowIndex = this.contextMenuData.rowIndex;

                if (rowIndex >= 0 && rowIndex < currentPageData.length) {
                    const row = currentPageData[rowIndex];
                    const rowData: Record<string, string> = {};

                    headers.forEach(header => {
                        rowData[header] = row[header] || '';
                    });

                    return rowData;
                }
            }

            // 降级方案：从DOM读取
            const table = document.getElementById('csvTable');
            if (!table) {
                console.warn('无法找到CSV表格');
                return null;
            }

            const headerRow = table.querySelector('thead tr');
            const bodyRows = table.querySelectorAll('tbody tr');
            const rowIndex = this.contextMenuData.rowIndex;

            if (!headerRow || rowIndex < 0 || rowIndex >= bodyRows.length) {
                console.warn('行索引超出范围');
                return null;
            }

            const headers = Array.from(headerRow.children).map(th => (th.textContent || '').trim());
            const row = bodyRows[rowIndex];
            const cells = Array.from(row.children).map(td => {
                // 如果单元格内有span包裹（着色的单元格），取span的文本
                const span = td.querySelector('.color-coded-text');
                return span ? (span.textContent || '').trim() : (td.textContent || '').trim();
            });

            const rowData: Record<string, string> = {};
            headers.forEach((header, index) => {
                rowData[header] = cells[index] || '';
            });

            return rowData;
        } catch (error) {
            console.error('获取行数据失败:', error);
            return null;
        }
    }

    /**
     * 显示右键菜单
     */
    async showContextMenu(x: number, y: number): Promise<void> {
        const menu = document.getElementById('contextMenu');
        const pluginMenuItems = document.getElementById('pluginMenuItems');

        if (!menu || !pluginMenuItems) return;

        // 获取当前列名
        const columnName = this.contextMenuData?.columnName;

        // 如果是 PID 列，显示模块统计
        await showModuleStatsIfPID(columnName as string, this.contextMenuData, () => this.getFullRowData());

        try {
            // 按分类渲染二级菜单（含内置插件、SVG 图标，与内嵌查看器一致）
            pluginMenuItems.innerHTML = this.renderPluginCategoryMenu();

            if (this.pluginMenuClickHandler) {
                pluginMenuItems.removeEventListener('click', this.pluginMenuClickHandler);
            }
            this.pluginMenuClickHandler = async (e: MouseEvent) => {
                const item = (e.target as HTMLElement).closest('.context-menu-item') as HTMLElement | null;
                if (!item) return;
                // 分类触发项：仅悬停展开，点击不执行、不关闭
                if (item.classList.contains('context-menu-submenu-trigger')) return;
                const pluginId = item.dataset.pluginId;
                if (!pluginId) return;
                const targetColumn = item.dataset.column;
                const originalContext = { ...this.contextMenuData } as ContextMenuData;
                if (targetColumn && targetColumn !== originalContext.columnName) {
                    const rd = this.getFullRowData();
                    this.contextMenuData!.columnName = targetColumn;
                    this.contextMenuData!.cellValue = (rd && rd[targetColumn]) || '';
                }
                this.hideContextMenu();
                await this.executePlugin(pluginId);
                this.contextMenuData = originalContext;
            };
            pluginMenuItems.addEventListener('click', this.pluginMenuClickHandler);
        } catch (error) {
            console.error('渲染插件菜单失败:', error);
            pluginMenuItems.innerHTML = `<div class="context-menu-item" style="color: var(--text-secondary); cursor: default;"><span>暂无可用取证操作</span></div>`;
        }

        // 复制单元格功能
        const copyCell = document.getElementById('copyCell');
        if (copyCell) {
            copyCell.onclick = () => {
                this.copyCellToClipboard();
                this.hideContextMenu();
            };
        }

        // 过滤具有相同值的行功能
        const filterSameValue = document.getElementById('filterSameValue');
        if (filterSameValue) {
            filterSameValue.onclick = () => {
                this.filterRowsBySameValue();
                this.hideContextMenu();
            };
        }

        // 重置过滤器功能
        const resetFilter = document.getElementById('resetFilter');
        if (resetFilter) {
            resetFilter.onclick = () => {
                this.resetAllFilters();
                this.hideContextMenu();
            };
        }

        // AI分析功能
        const aiAnalyze = document.getElementById('aiAnalyze');
        if (aiAnalyze) {
            aiAnalyze.onclick = () => {
                this.showAiAnalysis();
                this.hideContextMenu();
            };
        }

        // 查看该行上下文功能
        const viewRowContext = document.getElementById('viewRowContext');
        if (viewRowContext) {
            viewRowContext.onclick = () => {
                this.showRowContext();
                this.hideContextMenu();
            };
        }

        const margin = 12;

        // 显示菜单并等待浏览器计算尺寸
        menu.style.display = 'block';
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;

        // 强制浏览器重新计算布局
        void menu.offsetHeight;

        // 确保菜单不超出窗口边界（智能边界检测）
        const rect = menu.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        const maxX = Math.max(margin, viewportWidth - rect.width - margin);
        const maxY = Math.max(margin, viewportHeight - rect.height - margin);

        const finalX = Math.max(margin, Math.min(x, maxX));
        const finalY = Math.max(margin, Math.min(y, maxY));

        const alignRight = x + rect.width + margin > viewportWidth;
        const alignBottom = y + rect.height + margin > viewportHeight;

        menu.classList.toggle('context-menu--align-right', alignRight);
        menu.classList.toggle('context-menu--align-bottom', alignBottom);

        menu.style.left = `${finalX}px`;
        menu.style.top = `${finalY}px`;

        // 二级面板方向自适应（与内嵌查看器一致）：右侧不足向左弹、下半屏向上弹
        const SUBMENU_WIDTH = 240;
        menu.classList.toggle('submenu-left', finalX + rect.width + SUBMENU_WIDTH > viewportWidth);
        menu.querySelectorAll('.context-menu-submenu').forEach((sub) => {
            const tr = (sub as HTMLElement).getBoundingClientRect();
            (sub as HTMLElement).classList.toggle('submenu-up', tr.top > viewportHeight * 0.55);
        });

    } catch (_error: unknown) {
        // 忽略单个列的错误，继续处理其他列
        // 注意：原 JS 中此 `catch` 实为一个被覆盖位置上、名为 `catch` 的方法（运行时不会被调用），
        // 这里如实保留以维持与原文件一致的结构与行为。
    }
    clearContextSelection(): void {
        // 移除所有单元格的右键选中状态
        const selectedCells = document.querySelectorAll('.csv-table td.context-selected');
        selectedCells.forEach(cell => {
            cell.classList.remove('context-selected');
        });
    }

    /**
     * 隐藏右键菜单
     */
    hideContextMenu(): void {
        const menu = document.getElementById('contextMenu');
        if (menu) {
            menu.style.display = 'none';
        }

        // 清除选中状态
        this.clearContextSelection();
    }

    /**
     * 复制单元格到剪贴板
     */
    async copyCellToClipboard(): Promise<void> {
        if (!this.contextMenuData) return;

        try {
            await navigator.clipboard.writeText(this.contextMenuData.cellValue);
            console.log('单元格内容已复制到剪贴板');
        } catch (error) {
            console.error('复制失败:', error);
        }
    }

    /**
     * 过滤具有相同值的行
     */
    filterRowsBySameValue(): void {
        if (!this.contextMenuData || !this.contextMenuData.columnName || this.contextMenuData.cellValue === undefined) {
            console.warn('没有可用的过滤数据');
            return;
        }

        const columnName = this.contextMenuData.columnName;
        const cellValue = this.contextMenuData.cellValue.toString().trim();

        console.log(`过滤列 "${columnName}" 中值为 "${cellValue}" 的行`);

        // 获取全局CSV查看器实例
        const w = window as any;
        if (w.globalCSVViewer && typeof w.globalCSVViewer.addColumnFilter === 'function') {
            w.globalCSVViewer.addColumnFilter(columnName, cellValue);
            console.log(`已应用过滤器: ${columnName} = "${cellValue}"`);
        } else {
            console.error('无法访问CSV查看器实例');
        }
    }

    /**
     * 重置所有过滤器
     */
    resetAllFilters(): void {
        console.log('重置所有过滤器');

        // 获取全局CSV查看器实例
        const w = window as any;
        if (w.globalCSVViewer && typeof w.globalCSVViewer.clearAllFilters === 'function') {
            w.globalCSVViewer.clearAllFilters();
            console.log('已重置所有过滤器');
        } else {
            console.error('无法访问CSV查看器实例');
        }
    }

    /**
     * 显示通知
     */
    showNotification(message: string): void {
        // 简单的通知实现
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: var(--bg-primary, #fff);
            border: 1px solid var(--border-color, #e5e7eb);
            border-radius: 8px;
            padding: 12px 20px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            z-index: 10000;
            animation: slideIn 0.3s ease;
        `;
        notification.textContent = message;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    /**
     * 显示行上下文
     */
    showRowContext(): void {
        if (!this.contextMenuData) {
            console.error('缺少上下文数据');
            return;
        }

        const w = window as any;
        if (!w.globalCSVViewer || !w.globalCSVViewer.data) {
            console.error('无法访问CSV数据');
            this.showNotification('无法访问CSV数据');
            return;
        }

        const viewer = w.globalCSVViewer;
        const currentDisplayedRowIndex = this.contextMenuData.rowIndex;

        // 获取当前显示的行数据（可能是过滤后的）
        const currentPageData = viewer.getCurrentPageData();
        if (currentDisplayedRowIndex < 0 || currentDisplayedRowIndex >= currentPageData.length) {
            console.error('行索引超出范围');
            this.showNotification('行索引超出范围');
            return;
        }

        const currentRowData = currentPageData[currentDisplayedRowIndex];

        // 在原始数据中找到这一行的索引
        const originalRows: Record<string, string>[] = viewer.data.rows;
        const originalRowIndex = originalRows.findIndex(row => {
            // 比较所有列的值来确定是同一行
            return viewer.data.headers.every((header: string) => row[header] === currentRowData[header]);
        });

        if (originalRowIndex === -1) {
            console.error('无法在原始数据中找到该行');
            this.showNotification('无法在原始数据中找到该行');
            return;
        }

        console.log(`查看行上下文: 显示索引=${currentDisplayedRowIndex}, 原始索引=${originalRowIndex}`);

        // 初始化上下文状态
        this.rowContextState = {
            currentRowIndex: originalRowIndex,
            startIndex: Math.max(0, originalRowIndex - 10),
            endIndex: Math.min(originalRows.length - 1, originalRowIndex + 10),
            totalRows: originalRows.length,
            headers: viewer.data.headers
        };

        // 显示上下文模态框
        this.updateRowContextModal();
    }

    /**
     * 更新行上下文模态框
     */
    updateRowContextModal(): void {
        const w = window as any;
        if (!this.rowContextState || !w.globalCSVViewer) {
            return;
        }

        const viewer = w.globalCSVViewer;
        const originalRows: Record<string, string>[] = viewer.data.rows;
        const { startIndex, endIndex, currentRowIndex, headers } = this.rowContextState;

        const contextRows: ContextRowInfo[] = [];
        for (let i = startIndex; i <= endIndex; i++) {
            contextRows.push({
                index: i,
                data: originalRows[i],
                isCurrent: i === currentRowIndex
            });
        }

        console.log(`上下文范围: ${startIndex} - ${endIndex}, 共 ${contextRows.length} 行`);

        // 渲染上下文模态框
        this.renderRowContextModal(contextRows, currentRowIndex, headers);
    }

    /**
     * 向上加载更多行
     */
    loadMoreRowsAbove(): void {
        if (!this.rowContextState) {
            return;
        }

        const newStartIndex = Math.max(0, this.rowContextState.startIndex - 10);
        if (newStartIndex === this.rowContextState.startIndex) {
            this.showNotification('已到达文件开头');
            return;
        }

        this.rowContextState.startIndex = newStartIndex;
        console.log(`向上加载10行，新范围: ${this.rowContextState.startIndex} - ${this.rowContextState.endIndex}`);
        this.updateRowContextModal();
    }

    /**
     * 向下加载更多行
     */
    loadMoreRowsBelow(): void {
        if (!this.rowContextState) {
            return;
        }

        const newEndIndex = Math.min(this.rowContextState.totalRows - 1, this.rowContextState.endIndex + 10);
        if (newEndIndex === this.rowContextState.endIndex) {
            this.showNotification('已到达文件末尾');
            return;
        }

        this.rowContextState.endIndex = newEndIndex;
        console.log(`向下加载10行，新范围: ${this.rowContextState.startIndex} - ${this.rowContextState.endIndex}`);
        this.updateRowContextModal();
    }

    /**
     * 渲染行上下文模态框
     */
    renderRowContextModal(contextRows: ContextRowInfo[], _currentRowIndex: number, headers: string[]): void {
        const modal = document.getElementById('rowContextModal');
        const tableHead = document.getElementById('contextTableHead');
        const tableBody = document.getElementById('contextTableBody');
        const closeBtn = document.getElementById('closeRowContextModal');

        if (!modal || !tableHead || !tableBody) {
            console.error('找不到上下文模态框元素');
            return;
        }

        // 渲染表头
        tableHead.innerHTML = `
            <tr>
                <th style="width: 80px; text-align: center;">行号</th>
                ${headers.map(header => `<th>${this.escapeHtml(header)}</th>`).join('')}
            </tr>
        `;

        // 渲染表体
        tableBody.innerHTML = contextRows.map(rowInfo => {
            const rowClass = rowInfo.isCurrent ? 'context-current-row' : '';
            const rowStyle = rowInfo.isCurrent ?
                'background-color: var(--accent-color, #3b82f6); color: white; font-weight: bold;' : '';

            return `
                <tr class="${rowClass}" style="${rowStyle}">
                    <td style="text-align: center; font-weight: bold;">${rowInfo.index + 1}</td>
                    ${headers.map(header => {
                        const value = rowInfo.data[header] || '';
                        return `<td title="${this.escapeHtml(value)}">${this.escapeHtml(value)}</td>`;
                    }).join('')}
                </tr>
            `;
        }).join('');

        // 获取按钮元素
        const loadMoreAboveBtn = document.getElementById('loadMoreAbove') as HTMLButtonElement | null;
        const loadMoreBelowBtn = document.getElementById('loadMoreBelow') as HTMLButtonElement | null;

        // 更新按钮状态
        if (loadMoreAboveBtn && this.rowContextState) {
            loadMoreAboveBtn.disabled = this.rowContextState.startIndex === 0;
            loadMoreAboveBtn.onclick = () => this.loadMoreRowsAbove();
        }

        if (loadMoreBelowBtn && this.rowContextState) {
            loadMoreBelowBtn.disabled = this.rowContextState.endIndex === this.rowContextState.totalRows - 1;
            loadMoreBelowBtn.onclick = () => this.loadMoreRowsBelow();
        }

        // 绑定关闭按钮
        if (closeBtn) {
            closeBtn.onclick = () => {
                modal.style.display = 'none';
                this.rowContextState = null; // 清除状态
            };
        }

        // 点击模态框外部关闭
        modal.onclick = (e: MouseEvent) => {
            if (e.target === modal) {
                modal.style.display = 'none';
                this.rowContextState = null; // 清除状态
            }
        };

        // 为上下文表格添加右键菜单支持
        const contextTable = document.getElementById('contextTable');
        if (contextTable) {
            // 移除旧的事件监听器（如果存在）
            if (this.contextTableRightClickHandler) {
                contextTable.removeEventListener('contextmenu', this.contextTableRightClickHandler);
            }

            // 添加新的右键菜单事件监听器
            this.contextTableRightClickHandler = (e: MouseEvent) => this.handleContextTableRightClick(e);
            contextTable.addEventListener('contextmenu', this.contextTableRightClickHandler);
        }

        // 显示模态框
        modal.style.display = 'flex'; // 使用 flex 以支持居中

        // 滚动到当前行
        setTimeout(() => {
            const currentRowElement = tableBody.querySelector('.context-current-row');
            if (currentRowElement) {
                currentRowElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 100);
    }

    /**
     * 处理上下文表格的右键点击
     */
    handleContextTableRightClick(e: MouseEvent): void {
        // 只在表格单元格上显示右键菜单
        const cell = (e.target as HTMLElement).closest('td') as HTMLTableCellElement | null;
        if (!cell) {
            return;
        }

        e.preventDefault();

        // 清除之前的选中状态
        this.clearContextSelection();

        // 添加右键选中效果
        cell.classList.add('context-selected');

        // 获取单元格数据
        const row = cell.parentElement as HTMLElement;
        const cellIndex = Array.from(row.children).indexOf(cell);
        const rowIndex = Array.from(row.parentElement!.children).indexOf(row);

        // 上下文表格第一列是行号列，需要跳过
        if (cellIndex === 0) {
            // 点击的是行号列，不显示菜单
            return;
        }

        // 保存上下文数据（cellIndex - 1 因为第一列是行号）
        this.contextMenuData = {
            cellValue: (cell.textContent || '').trim(),
            rowIndex: rowIndex,
            cellIndex: cellIndex - 1, // 减去行号列
            columnName: this.getColumnName(cellIndex, true), // 传入 true 表示从上下文表格获取
            selectedCell: cell  // 保存选中的单元格引用
        };

        // 显示右键菜单
        this.showContextMenu(e.clientX, e.clientY).catch(error => {
            console.error('显示右键菜单失败:', error);
        });
    }

    /**
     * 发送命令事件到主窗口
     */
    async sendCommandEventToMainWindow(commandData: unknown): Promise<void> {
        try {
            // 使用不同的事件名称，避免与CSV查看器的事件冲突
            await emit('csv-plugin-main-window', commandData);
            console.log('已发送命令事件到主窗口:', commandData);
        } catch (error) {
            console.error('发送命令事件失败:', error);
        }
    }

    /**
     * 执行插件
     */
    async executePlugin(pluginId: string): Promise<void> {
        if (!this.contextMenuData) {
            console.error('缺少上下文数据');
            return;
        }

        const plugin = this.allMenuPlugins().find(p => p.id === pluginId);
        if (!plugin) {
            console.error('取证操作不存在:', pluginId);
            return;
        }

        // 生成命令ID用于跟踪
        const commandId = Date.now() + Math.random();

        try {
            console.log('执行内嵌取证操作:', plugin.name);

            // 发送命令开始执行的事件到CSV查看器
            await emit('csv-plugin-command', {
                id: commandId,
                name: `CSV取证操作: ${plugin.name}`,
                command: '正在执行内嵌操作...',
                status: 'running',
                time: new Date().toLocaleString()
            });

            // 通过事件系统发送命令开始执行的信息到主窗口（使用简化信息）
            await this.sendCommandEventToMainWindow({
                id: commandId,
                name: `CSV取证操作: ${plugin.name}`,
                command: '正在执行内嵌操作...',
                status: 'running',
                time: new Date().toLocaleString()
            });

            const result = await invoke('execute_embedded_forensic_action', {
                pluginId: pluginId,
                context: {
                    selected_file: '',  // 暂时为空，可以从CSV组件传递
                    selected_row: parseInt(String(this.contextMenuData.rowIndex)) || 0,
                    selected_cell: this.contextMenuData.cellValue || '',
                    selected_column: this.contextMenuData.columnName || '',
                    all_selected_cells: this.contextMenuData.cellValue || ''
                } as PluginContext
            }) as PluginResult;

            console.log('插件执行完成:', result);
            console.log('命令输出:', result.output);

            // 发送命令完成事件
            await emit('csv-plugin-command', {
                id: commandId,
                name: `CSV取证操作: ${plugin.name}`,
                command: result.executed_command || plugin.command || '内嵌操作',
                status: result.success ? 'completed' : 'error',
                time: new Date().toLocaleString(),
                output: result.output || '',
                error: result.success ? undefined : (result.output || '取证操作执行失败'),
                // 类型化后端在返回时进程已经结束，无需再等待旧执行器的文本标记。
                isReallyComplete: true
            });

            // 通过事件系统发送命令完成的信息到主窗口
            await this.sendCommandEventToMainWindow({
                id: commandId,
                name: `CSV取证操作: ${plugin.name}`,
                command: result.executed_command || plugin.command || '内嵌操作',
                status: result.success ? 'completed' : 'error',
                time: new Date().toLocaleString(),
                output: result.output || '',
                error: result.success ? undefined : (result.output || '取证操作执行失败')
            });

            // 显示执行结果
            this.showPluginResult(result);

            // 如果需要自动打开输出文件
            if (result.should_open_file && result.output_file) {
                await this.openOutputFile(result.output_file, result.output_file_type);
            }

        } catch (error) {
            console.error('取证操作执行失败:', error);

            // 发送命令错误的事件到CSV查看器
            await emit('csv-plugin-command', {
                id: commandId,
                name: `CSV取证操作: ${plugin.name}`,
                command: plugin.command || '内嵌操作',
                status: 'error',
                time: new Date().toLocaleString(),
                error: '取证操作执行失败: ' + error
            });

            // 通过事件系统发送命令错误的信息到主窗口
            await this.sendCommandEventToMainWindow({
                id: commandId,
                name: `CSV取证操作: ${plugin.name}`,
                command: plugin.command || '内嵌操作',
                status: 'error',
                time: new Date().toLocaleString(),
                error: '取证操作执行失败: ' + error
            });

            this.showPluginResult({
                success: false,
                error: '取证操作执行失败: ' + error
            });
        }
    }

    /** 显示取证动作执行结果。 */
    showPluginResult(result: PluginResult): void {
        if (!result.success) {
            const detail = (result.error || result.output || '未知错误').trim();
            const summary = detail.length > 160 ? `${detail.slice(0, 160)}…` : detail;
            this.showResultToast(`命令执行失败：${summary}`, true);
            return;
        }

        this.showResultToast('命令执行成功', false);
    }

    /**
     * 打开输出文件
     */
    async openOutputFile(filePath: string, fileType?: string): Promise<void> {
        try {
            console.log('自动打开输出文件:', filePath, '类型:', fileType);

            const ext = (fileType || filePath.split('.').pop() || '').toLowerCase();
            const title = filePath.split(/[/\\]/).pop() || filePath;
            if (ext === 'directory') {
                await invoke('open_path', { path: filePath });
            } else if (ext === 'csv') {
                await invoke('open_csv_viewer', { csvFilePath: filePath, windowTitle: title, searchQuery: null });
            } else if (['txt', 'log', 'json', 'xml'].includes(ext)) {
                // 文本类优先内嵌模态框预览（含"在新窗口打开"按钮），与内嵌查看器一致
                await this.showTextPreviewModal(filePath, title);
            } else {
                await invoke('open_folder_and_select', { path: filePath });
            }
        } catch (error) {
            console.error('打开输出文件失败:', error);
        }
    }

    /** 文本文件内嵌预览模态框（含"在新窗口打开"按钮），与内嵌查看器一致 */
    private async showTextPreviewModal(filePath: string, title: string): Promise<void> {
        let content = '';
        try {
            content = await invoke('read_file', { path: filePath }) as string;
        } catch (e) {
            content = `读取文件失败: ${e}`;
        }
        const MAX = 500 * 1024;
        let truncated = false;
        if (content.length > MAX) { content = content.slice(0, MAX); truncated = true; }

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
            </div>`;
        document.body.appendChild(overlay);
        const close = () => overlay.remove();
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        overlay.querySelector('[data-act="close"]')?.addEventListener('click', close);
        overlay.querySelector('[data-act="newwin"]')?.addEventListener('click', async () => {
            close();
            try { await invoke('open_text_viewer', { textFilePath: filePath, windowTitle: title, searchQuery: null }); } catch (e) { console.error(e); }
        });
        const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); } };
        document.addEventListener('keydown', esc);
    }

    /** 显示成功或失败提示。 */
    showResultToast(message: string, isError: boolean): void {
        // 创建提示元素
        const toast = document.createElement('div');
        toast.className = `result-toast${isError ? ' error' : ''}`;
        toast.textContent = message;

        // 添加样式
        if (!document.getElementById('result-toast-styles')) {
            const style = document.createElement('style');
            style.id = 'result-toast-styles';
            style.textContent = `
                .result-toast {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    max-width: min(520px, calc(100vw - 40px));
                    background: #4CAF50;
                    color: white;
                    padding: 12px 20px;
                    border-radius: 6px;
                    box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);
                    z-index: 10000;
                    font-size: 14px;
                    font-weight: 500;
                    opacity: 0;
                    transform: translateX(100%);
                    transition: all 0.3s ease;
                }

                .result-toast.error {
                    background: #c62828;
                    box-shadow: 0 4px 12px rgba(198, 40, 40, 0.3);
                }

                .result-toast.show {
                    opacity: 1;
                    transform: translateX(0);
                }

                .result-toast.hide {
                    opacity: 0;
                    transform: translateX(100%);
                }
            `;
            document.head.appendChild(style);
        }

        // 添加到页面
        document.body.appendChild(toast);

        // 显示动画
        setTimeout(() => {
            toast.classList.add('show');
        }, 100);

        // 2秒后自动隐藏
        setTimeout(() => {
            toast.classList.add('hide');
            setTimeout(() => {
                if (document.body.contains(toast)) {
                    document.body.removeChild(toast);
                }
            }, 300);
        }, 2000);
    }

    /**
     * 显示AI分析模态框
     */
    async showAiAnalysis(): Promise<void> {
        if (!this.contextMenuData) {
            console.error('没有选中的行数据');
            return;
        }

        // 获取完整的行数据
        const rowData = this.getRowData(this.contextMenuData.rowIndex);
        if (!rowData) {
            console.error('无法获取行数据');
            return;
        }

        // 获取文件名
        const fileName = this.getFileName();

        // 显示模态框
        const modal = document.getElementById('aiAnalysisModal');
        if (!modal) {
            console.error('AI分析模态框不存在');
            return;
        }

        // 设置文件信息
        const fileInfo = document.getElementById('aiAnalysisFile');
        const rowInfo = document.getElementById('aiAnalysisRow');
        if (fileInfo) fileInfo.textContent = fileName;
        if (rowInfo) rowInfo.textContent = `第 ${this.contextMenuData.rowIndex + 1} 行`;

        // 清空消息容器
        const messagesContainer = document.getElementById('aiMessagesContainer');
        if (messagesContainer) {
            messagesContainer.innerHTML = '';
        }

        // 初始化AI对话
        this.aiConversation = {
            fileName: fileName,
            rowData: rowData,
            messages: []
        };

        // 显示模态框
        modal.style.display = 'flex';

        // 绑定事件
        this.bindAiModalEvents();

        // 自动发送初始分析请求
        await this.sendAiAnalysisRequest(rowData, fileName, true);
    }

    /**
     * 获取行数据（基于 DOM，运行时生效的版本）
     */
    getRowData(rowIndex: number): Record<string, string> | null {
        const table = document.getElementById('csvTable');
        if (!table) return null;

        const headerRow = table.querySelector('thead tr');
        const bodyRow = table.querySelector(`tbody tr:nth-child(${rowIndex + 1})`);

        if (!headerRow || !bodyRow) return null;

        const headers = Array.from(headerRow.children).map(th => (th.textContent || '').trim());
        const cells = Array.from(bodyRow.children).map(td => (td.textContent || '').trim());

        const rowData: Record<string, string> = {};
        headers.forEach((header, index) => {
            rowData[header] = cells[index];
        });

        return rowData;
    }

    /**
     * 获取文件名
     */
    getFileName(): string {
        const fileNameElement = document.getElementById('fileName');
        return fileNameElement ? (fileNameElement.textContent || '未知文件') : '未知文件';
    }

    /**
     * 绑定AI模态框事件
     */
    bindAiModalEvents(): void {
        const modal = document.getElementById('aiAnalysisModal');
        const closeBtn = document.getElementById('aiModalClose');
        const overlay = modal?.querySelector('.ai-modal-overlay') as HTMLElement | null;
        const sendBtn = document.getElementById('aiSendBtn');
        const input = document.getElementById('aiInput') as HTMLTextAreaElement | null;

        // 关闭按钮
        if (closeBtn) {
            (closeBtn as HTMLElement).onclick = () => this.hideAiModal();
        }

        // 点击遮罩关闭
        if (overlay) {
            overlay.onclick = () => this.hideAiModal();
        }

        // 发送按钮
        if (sendBtn) {
            (sendBtn as HTMLElement).onclick = () => this.sendUserMessage();
        }

        // 回车发送
        if (input) {
            input.onkeydown = (e: KeyboardEvent) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendUserMessage();
                }
            };
        }
    }

    /**
     * 隐藏AI模态框
     */
    hideAiModal(): void {
        const modal = document.getElementById('aiAnalysisModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    /**
     * 发送用户消息
     */
    async sendUserMessage(): Promise<void> {
        const input = document.getElementById('aiInput') as HTMLTextAreaElement | null;
        if (!input) return;

        const message = input.value.trim();
        if (!message) return;

        // 清空输入框
        input.value = '';

        // 添加用户消息到界面
        this.addMessageToUI('user', message);

        // 发送到AI
        await this.sendAiAnalysisRequest(
            this.aiConversation.rowData,
            this.aiConversation.fileName,
            false,
            message
        );
    }

    /**
     * 添加消息到UI
     */
    addMessageToUI(role: 'user' | 'assistant', content: string): HTMLElement | undefined {
        const messagesContainer = document.getElementById('aiMessagesContainer');
        if (!messagesContainer) return;

        const messageDiv = document.createElement('div');
        messageDiv.className = `ai-message ${role}`;

        const avatar = role === 'user' ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' : '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="9" cy="16" r="1"/><circle cx="15" cy="16" r="1"/><path d="M12 2v4M8 11V7a4 4 0 0 1 8 0v4"/></svg>';

        messageDiv.innerHTML = `
            <div class="ai-message-avatar">${avatar}</div>
            <div class="ai-message-content">${this.formatMessageContent(content)}</div>
        `;

        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        return messageDiv;
    }

    /**
     * 格式化消息内容
     */
    formatMessageContent(content: string): string {
        // 简单的Markdown格式化
        return content
            .replace(/\n/g, '<br>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    }

    /**
     * 发送AI分析请求
     */
    async sendAiAnalysisRequest(rowData: Record<string, string>, fileName: string, isInitial: boolean = true, userMessage: string = ''): Promise<void> {
        try {
            const sendBtn = document.getElementById('aiSendBtn') as HTMLButtonElement | null;
            if (sendBtn) {
                sendBtn.disabled = true;
                sendBtn.innerHTML = '<div class="ai-loading"></div>';
            }

            // 构建提示词
            let prompt = '';
            if (isInitial) {
                // 初始分析请求
                const rowDataStr = Object.entries(rowData)
                    .map(([key, value]) => `${key}: ${value}`)
                    .join('\n');

                prompt = `你是一个Windows内存取证分析专家。请分析以下来自内存分析工具的数据：

文件名: ${fileName}
数据内容:
${rowDataStr}

请提供专业的分析，包括：
1. 这条记录的含义和重要性
2. 可能的安全隐患或异常行为
3. 建议的进一步调查方向

请用简洁专业的语言回答。`;
            } else {
                // 继续对话
                prompt = userMessage;
            }

            // 保存消息到对话历史
            this.aiConversation.messages.push({
                role: 'user',
                content: prompt
            });

            // 创建AI消息占位符
            const aiMessageDiv = this.addMessageToUI('assistant', '');
            const contentDiv = aiMessageDiv!.querySelector('.ai-message-content') as HTMLElement;

            // 调用AI接口（流式输出）
            await this.streamAiResponse(prompt, contentDiv);

            // 恢复发送按钮
            if (sendBtn) {
                sendBtn.disabled = false;
                sendBtn.innerHTML = '<span>发送</span>';
            }

        } catch (error) {
            console.error('AI分析失败:', error);
            this.addMessageToUI('assistant', `分析失败: ${(error as Error).message || error}`);

            const sendBtn = document.getElementById('aiSendBtn') as HTMLButtonElement | null;
            if (sendBtn) {
                sendBtn.disabled = false;
                sendBtn.innerHTML = '<span>发送</span>';
            }
        }
    }

    /**
     * 流式输出AI响应（使用Tauri后端避免CORS）
     */
    async streamAiResponse(_prompt: string, contentDiv: HTMLElement): Promise<void> {
        try {
            // 获取AI设置
            const settings = await invoke('load_settings_command') as { ai_settings?: any };
            const currentProvider = await invoke('get_current_ai_provider') as any;

            let aiSettings: any;
            if (currentProvider && currentProvider.enabled) {
                aiSettings = {
                    base_url: currentProvider.base_url,
                    model: currentProvider.model,
                    api_key: currentProvider.api_key,
                    custom_prompt: currentProvider.custom_prompt || ''
                };
                console.log('[AI分析] 使用提供商:', currentProvider.name);
            } else {
                aiSettings = settings.ai_settings;
                console.log('[AI分析] 使用默认配置');
            }

            if (!aiSettings || !aiSettings.api_key) {
                throw new Error('请先在设置中配置AI参数');
            }

            console.log('[AI分析] Base URL:', aiSettings.base_url);
            console.log('[AI分析] Model:', aiSettings.model);

            // 构建完整的消息内容（包含历史）
            let fullMessage = '';
            for (const msg of this.aiConversation.messages) {
                if (msg.role === 'user') {
                    fullMessage += `用户: ${msg.content}\n\n`;
                } else {
                    fullMessage += `助手: ${msg.content}\n\n`;
                }
            }

            console.log('[AI分析] 消息历史:', this.aiConversation.messages.length, '条');

            // 使用 Tauri 后端的流式 API（避免 CORS）
            const { listen } = (window as any).__TAURI__.event;
            const { getCurrentWebviewWindow } = (window as any).__TAURI__.webviewWindow;

            // 获取当前窗口标签
            const currentWindow = getCurrentWebviewWindow();
            const windowLabel = currentWindow.label;

            console.log('[AI分析] 窗口标签:', windowLabel);

            let fullContent = '';
            let streamListenerUnsubscribe: (() => void) | null = null;
            let endListenerUnsubscribe: (() => void) | null = null;
            let errorListenerUnsubscribe: (() => void) | null = null;

            // 创建 Promise 来等待流式响应完成
            const streamPromise = new Promise<string>((resolve, reject) => {
                // 监听流式内容块
                listen('ai-stream-chunk', (event: { payload: string }) => {
                    const chunk = event.payload;
                    console.log('[AI分析] 接收内容块:', chunk);
                    fullContent += chunk;
                    contentDiv.innerHTML = this.formatMessageContent(fullContent);

                    // 自动滚动
                    const messagesContainer = document.getElementById('aiMessagesContainer');
                    if (messagesContainer) {
                        messagesContainer.scrollTop = messagesContainer.scrollHeight;
                    }
                }).then((unsubscribe: () => void) => {
                    streamListenerUnsubscribe = unsubscribe;
                });

                // 监听流式结束
                listen('ai-stream-end', () => {
                    console.log('[AI分析] 流式传输完成，总长度:', fullContent.length);
                    resolve(fullContent);
                }).then((unsubscribe: () => void) => {
                    endListenerUnsubscribe = unsubscribe;
                });

                // 监听流式错误
                listen('ai-stream-error', (event: { payload: string }) => {
                    console.error('[AI分析] 流式错误:', event.payload);
                    reject(new Error(event.payload));
                }).then((unsubscribe: () => void) => {
                    errorListenerUnsubscribe = unsubscribe;
                });
            });

            // 调用后端流式 API (使用V2版本)
            const requestData = {
                message: fullMessage,
                ai_settings: aiSettings,
                context: {
                    selected_files: [],
                    selected_text: ''
                },
                history: []  // V2 版本需要 history 字段
            };

            console.log('[AI分析] 发送请求到后端');

            await invoke('call_ai_api_stream_v2', {
                request: requestData,
                windowLabel: windowLabel
            });

            // 等待流式响应完成
            await streamPromise;

            // 清理监听器
            if (streamListenerUnsubscribe) (streamListenerUnsubscribe as () => void)();
            if (endListenerUnsubscribe) (endListenerUnsubscribe as () => void)();
            if (errorListenerUnsubscribe) (errorListenerUnsubscribe as () => void)();

            console.log('[AI分析] 完整响应长度:', fullContent.length, '字符');

            if (fullContent.length === 0) {
                console.warn('[AI分析] 警告：未接收到任何内容');
                throw new Error('未接收到AI响应内容，请检查API配置');
            }

            // 保存AI响应到对话历史
            this.aiConversation.messages.push({
                role: 'assistant',
                content: fullContent
            });

        } catch (error) {
            console.error('[AI分析] 错误:', error);
            throw error;
        }
    }

}

// 创建全局实例
let csvPluginManager: CSVPluginManager | null = null;

// 导出初始化函数
export function initializePluginManager(stateManager: unknown = null, commandWindowManager: unknown = null): CSVPluginManager {
    if (!csvPluginManager) {
        csvPluginManager = new CSVPluginManager(stateManager, commandWindowManager);
        // 将实例添加到全局对象以便在HTML中使用
        (window as any).csvPluginManager = csvPluginManager;
    }
    return csvPluginManager;
}
