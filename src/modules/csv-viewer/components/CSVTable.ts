/**
 * CSV表格组件
 * 负责CSV数据的表格渲染和用户交互
 */

import { CSVTooltipEngine } from './CSVTooltipEngine';

/** CSV单行数据 */
type CSVRow = Record<string, string>;

/** 单元格颜色样式 */
interface ColorStyle {
    backgroundColor: string;
    textColor: string;
}

/** 表格组件配置 */
export interface CSVTableOptions {
    onCellClick?: (rowIndex: number, columnName: string | number, value: string) => void;
    onRowSelect?: (...args: unknown[]) => void;
    onSort?: (columnName: string, direction: 'asc' | 'desc') => void;
}

/** 表格内部数据 */
interface CSVTableData {
    headers: string[];
    rows: CSVRow[];
    sortColumn: string | null;
    sortDirection: 'asc' | 'desc';
}

/** 条件着色系统配置 */
interface ColorCoding {
    enabled: boolean;
    targetColumns: string[];
    specialValues: Record<string, ColorStyle>;
    columnColorMaps: Map<string, Map<string, ColorStyle>>;
    colorPalette: string[];
    textColors: string[];
}

/** 选中单元格信息 */
interface SelectedCellInfo {
    rowIndex: number;
    columnIndex: number;
    columnName: string;
    value: string;
}

/** 渲染数据 */
interface RenderData {
    headers: string[];
    rows: CSVRow[];
}

export class CSVTable {
    private tableElement: HTMLTableElement;
    private options: Required<CSVTableOptions>;
    public data: CSVTableData;
    private colorCoding: ColorCoding;
    private tooltipEngine: CSVTooltipEngine | null;
    // 注意：外部（csv-viewer 事件委托）会以列索引(number)作为第二个参数调用，
    // 内部 handleCellClick 则传列名(string)，与原 JS 行为一致，故放宽为 string | number。
    public onCellClick: (rowIndex: number, columnName: string | number, value: string) => void;

    constructor(tableElement: HTMLTableElement, options: CSVTableOptions = {}) {
        this.tableElement = tableElement;
        this.options = {
            onCellClick: options.onCellClick || (() => {}),
            onRowSelect: options.onRowSelect || (() => {}),
            onSort: options.onSort || (() => {}),
            ...options
        };
        // 暴露 onCellClick 以兼容外部直接调用（与原 JS 行为一致）
        this.onCellClick = this.options.onCellClick;

        this.data = {
            headers: [],
            rows: [],
            sortColumn: null,
            sortDirection: 'asc'
        };

        // 条件单元格着色系统
        this.colorCoding = {
            enabled: true,
            // 指定需要着色的列名
            targetColumns: ['Action', 'Type', 'User', 'IntegrityLevel', 'State', 'SrcAddr','SrcPort','Wow64','Tag','HandleCount','pslist'
                            ,'psscan','thrdproc','pspcid','csrss','session','deskthrd','Attributes','Privilege'],
            // 特殊值的固定颜色映射
            specialValues: {
                'True': { backgroundColor: '#E8F5E8', textColor: '#2E7D32' },    // 绿色
                'true': { backgroundColor: '#E8F5E8', textColor: '#2E7D32' },    // 绿色
                'TRUE': { backgroundColor: '#E8F5E8', textColor: '#2E7D32' },    // 绿色
                'False': { backgroundColor: '#FFEBEE', textColor: '#D32F2F' },   // 红色
                'false': { backgroundColor: '#FFEBEE', textColor: '#D32F2F' },   // 红色
                'FALSE': { backgroundColor: '#FFEBEE', textColor: '#D32F2F' },   // 红色
                'Yes': { backgroundColor: '#E8F5E8', textColor: '#2E7D32' },     // 绿色
                'yes': { backgroundColor: '#E8F5E8', textColor: '#2E7D32' },     // 绿色
                'YES': { backgroundColor: '#E8F5E8', textColor: '#2E7D32' },     // 绿色
                'No': { backgroundColor: '#FFEBEE', textColor: '#D32F2F' },      // 红色
                'no': { backgroundColor: '#FFEBEE', textColor: '#D32F2F' },      // 红色
                'NO': { backgroundColor: '#FFEBEE', textColor: '#D32F2F' },      // 红色
                'Success': { backgroundColor: '#E8F5E8', textColor: '#2E7D32' }, // 绿色
                'success': { backgroundColor: '#E8F5E8', textColor: '#2E7D32' }, // 绿色
                'SUCCESS': { backgroundColor: '#E8F5E8', textColor: '#2E7D32' }, // 绿色
                'Failed': { backgroundColor: '#FFEBEE', textColor: '#D32F2F' },  // 红色
                'failed': { backgroundColor: '#FFEBEE', textColor: '#D32F2F' },  // 红色
                'FAILED': { backgroundColor: '#FFEBEE', textColor: '#D32F2F' },  // 红色
                'Error': { backgroundColor: '#FFEBEE', textColor: '#D32F2F' },   // 红色
                'error': { backgroundColor: '#FFEBEE', textColor: '#D32F2F' },   // 红色
                'ERROR': { backgroundColor: '#FFEBEE', textColor: '#D32F2F' },   // 红色
                'OK': { backgroundColor: '#E8F5E8', textColor: '#2E7D32' },      // 绿色
                'ok': { backgroundColor: '#E8F5E8', textColor: '#2E7D32' },      // 绿色
                'Enabled': { backgroundColor: '#E8F5E8', textColor: '#2E7D32' }, // 绿色
                'enabled': { backgroundColor: '#E8F5E8', textColor: '#2E7D32' }, // 绿色
                'ENABLED': { backgroundColor: '#E8F5E8', textColor: '#2E7D32' }, // 绿色
                'Disabled': { backgroundColor: '#FFEBEE', textColor: '#D32F2F' },// 红色
                'disabled': { backgroundColor: '#FFEBEE', textColor: '#D32F2F' },// 红色
                'DISABLED': { backgroundColor: '#FFEBEE', textColor: '#D32F2F' } // 红色
            },
            columnColorMaps: new Map(),
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

        // 初始化工具提示引擎
        this.tooltipEngine = new CSVTooltipEngine({
            showDelay: 300,
            hideDelay: 100,
            maxWidth: 250
        });

        this.init();
    }

    /**
     * 初始化表格组件
     */
    init(): void {
        if (!this.tableElement) {
            throw new Error('表格元素不存在');
        }

        // 添加表格类名
        this.tableElement.classList.add('csv-table');

        // 绑定事件
        this.bindEvents();

        console.log('CSV表格组件初始化完成');
    }

    /**
     * 绑定事件处理器
     */
    bindEvents(): void {
        // 表格点击事件代理
        this.tableElement.addEventListener('click', (e: MouseEvent) => {
            const cell = (e.target as HTMLElement).closest('td, th') as HTMLTableCellElement | null;
            if (!cell) return;

            if (cell.tagName === 'TH') {
                // 表头点击 - 排序
                this.handleHeaderClick(cell, e);
            } else if (cell.tagName === 'TD') {
                // 单元格点击
                this.handleCellClick(cell, e);
            }
        });

        // 双击事件
        this.tableElement.addEventListener('dblclick', (e: MouseEvent) => {
            const cell = (e.target as HTMLElement).closest('td') as HTMLTableCellElement | null;
            if (cell) {
                this.handleCellDoubleClick(cell, e);
            }
        });

        // 鼠标悬停事件 - 工具提示
        this.tableElement.addEventListener('mouseover', (e: MouseEvent) => {
            const cell = (e.target as HTMLElement).closest('td') as HTMLTableCellElement | null;
            if (cell) {
                this.handleCellMouseOver(cell, e);
            }
        });

        // 鼠标离开事件 - 工具提示
        this.tableElement.addEventListener('mouseout', (e: MouseEvent) => {
            const cell = (e.target as HTMLElement).closest('td') as HTMLTableCellElement | null;
            if (cell) {
                this.handleCellMouseOut(cell);
            }
        });
    }

    /**
     * 处理表头点击事件（排序）
     */
    handleHeaderClick(headerCell: HTMLTableCellElement, _event: MouseEvent): void {
        const columnIndex = Array.from(headerCell.parentNode!.children).indexOf(headerCell);
        const columnName = this.data.headers[columnIndex];

        if (!columnName) return;

        // 切换排序方向
        if (this.data.sortColumn === columnName) {
            this.data.sortDirection = this.data.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.data.sortColumn = columnName;
            this.data.sortDirection = 'asc';
        }

        // 更新表头样式
        this.updateHeaderStyles();

        // 触发排序回调
        this.options.onSort(columnName, this.data.sortDirection);

        console.log(`表格排序: ${columnName} ${this.data.sortDirection}`);
    }

    /**
     * 处理单元格点击事件
     */
    handleCellClick(cell: HTMLTableCellElement, _event: MouseEvent): void {
        const row = cell.parentNode as HTMLTableRowElement;
        const columnIndex = Array.from(row.children).indexOf(cell);
        const rowIndex = Array.from(row.parentNode!.children).indexOf(row);
        const columnName = this.data.headers[columnIndex];
        const value = cell.textContent || '';

        // 高亮选中的单元格
        this.highlightCell(cell);

        // 触发单元格点击回调
        this.options.onCellClick(rowIndex, columnName, value);

        console.log(`单元格点击: 行${rowIndex}, 列${columnName}, 值: ${value}`);
    }

    /**
     * 处理单元格双击事件
     */
    handleCellDoubleClick(cell: HTMLTableCellElement, _event: MouseEvent): void {
        const row = cell.parentNode as HTMLTableRowElement;
        const rowIndex = Array.from(row.parentNode!.children).indexOf(row);

        // 获取表头信息
        const headerRow = this.tableElement.querySelector('thead tr');
        const headers: string[] = [];
        if (headerRow) {
            Array.from(headerRow.children).forEach(th => {
                headers.push((th.textContent || '').trim());
            });
        }

        // 如果没有从DOM获取到表头，使用存储的数据
        const finalHeaders = headers.length > 0 ? headers : this.data.headers;

        // 获取整行数据
        const rowData: CSVRow = {};
        finalHeaders.forEach((header, index) => {
            const cellValue = row.children[index] ? (row.children[index].textContent || '').trim() : '';
            rowData[header] = cellValue;
        });

        console.log('双击行数据:', { rowIndex, headers: finalHeaders, rowData });

        // 显示行详细信息模态窗口
        this.showRowDetailsModal(rowData, rowIndex);
    }

    /**
     * 显示行详细信息模态窗口
     */
    showRowDetailsModal(rowData: CSVRow, rowIndex: number): void {
        console.log('显示行详细信息模态窗口:', { rowData, rowIndex });

        // 检查数据是否有效
        if (!rowData || Object.keys(rowData).length === 0) {
            console.warn('行数据为空，无法显示详细信息');
            return;
        }

        // 创建模态窗口遮罩
        const overlay = document.createElement('div');
        overlay.className = 'row-details-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.6);
            backdrop-filter: blur(8px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            animation: fadeIn 0.3s ease;
        `;

        // 创建模态窗口内容
        const modal = document.createElement('div');
        modal.className = 'row-details-modal';
        modal.style.cssText = `
            background: var(--bg-secondary, #ffffff);
            border-radius: 20px;
            box-shadow: 0 25px 50px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.05);
            width: 90%;
            max-width: 900px;
            max-height: 85vh;
            overflow: hidden;
            animation: scaleIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
            border: 1px solid var(--border-color, rgba(0, 0, 0, 0.08));
            backdrop-filter: blur(20px);
        `;

        // 创建标题栏
        const header = document.createElement('div');
        header.className = 'row-details-header';
        header.style.cssText = `
            padding: 24px 28px;
            border-bottom: 1px solid var(--border-color, rgba(0, 0, 0, 0.08));
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: var(--bg-secondary, #f8fafc);
            position: relative;
            border-radius: 20px 20px 0 0;
        `;

        const title = document.createElement('h3');
        title.innerHTML = `<span style="margin-right: 8px;"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg></span>行详细信息 <span style="opacity: 0.6; font-size: 14px; font-weight: 400; margin-left: 8px;">(第 ${rowIndex + 1} 行)</span>`;
        title.style.cssText = `
            margin: 0;
            color: var(--text-primary, #1e293b);
            font-size: 18px;
            font-weight: 600;
            display: flex;
            align-items: center;
        `;

        const closeButton = document.createElement('button');
        closeButton.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
        closeButton.className = 'row-details-close';
        closeButton.style.cssText = `
            background: var(--bg-tertiary, #f1f5f9);
            border: 1px solid var(--border-color, #e2e8f0);
            color: var(--text-secondary, #64748b);
            font-size: 16px;
            cursor: pointer;
            padding: 0;
            border-radius: 50%;
            transition: all 0.2s ease;
            width: 36px;
            height: 36px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 400;
        `;

        closeButton.addEventListener('mouseenter', () => {
            closeButton.style.background = 'var(--error-color, #ef4444)';
            closeButton.style.color = 'white';
            closeButton.style.borderColor = 'var(--error-color, #ef4444)';
            closeButton.style.transform = 'scale(1.05)';
        });
        closeButton.addEventListener('mouseleave', () => {
            closeButton.style.background = 'var(--bg-tertiary, #f1f5f9)';
            closeButton.style.color = 'var(--text-secondary, #64748b)';
            closeButton.style.borderColor = 'var(--border-color, #e2e8f0)';
            closeButton.style.transform = 'scale(1)';
        });

        header.appendChild(title);
        header.appendChild(closeButton);

        // 创建内容区域
        const content = document.createElement('div');
        content.className = 'row-details-content';
        content.style.cssText = `
            padding: 28px;
            max-height: calc(85vh - 140px);
            overflow-y: auto;
            background: var(--bg-primary, #ffffff);
            position: relative;
        `;

        // 创建字段列表
        const fieldsList = document.createElement('div');
        fieldsList.className = 'row-details-fields';
        fieldsList.style.cssText = `
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
            gap: 18px;
            align-items: start;
        `;

        console.log('创建字段列表，数据条目数:', Object.keys(rowData).length);

        // 异步处理字段，以便获取工具提示信息
        this.renderFieldsWithTooltips(fieldsList, rowData);


        content.appendChild(fieldsList);
        modal.appendChild(header);
        modal.appendChild(content);
        overlay.appendChild(modal);

        // 关闭模态窗口的函数
        const closeModal = () => {
            overlay.style.animation = 'fadeOut 0.3s ease';
            modal.style.animation = 'scaleOut 0.3s ease';
            setTimeout(() => {
                if (overlay.parentNode) {
                    overlay.parentNode.removeChild(overlay);
                }
            }, 300);
        };

        // 绑定关闭事件
        closeButton.addEventListener('click', closeModal);
        overlay.addEventListener('click', (e: MouseEvent) => {
            if (e.target === overlay) {
                closeModal();
            }
        });

        // ESC键关闭
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', handleKeyDown);
            }
        };
        document.addEventListener('keydown', handleKeyDown);

        // 添加到页面
        document.body.appendChild(overlay);
    }

    /**
     * 回退复制方法
     */
    fallbackCopyToClipboard(text: string): void {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try {
            document.execCommand('copy');
            console.log('文本已复制到剪贴板');
        } catch (err) {
            console.error('复制到剪贴板失败:', err);
        }

        document.body.removeChild(textArea);
    }

    /**
     * 处理单元格鼠标悬停事件
     */
    async handleCellMouseOver(cell: HTMLTableCellElement, event: MouseEvent): Promise<void> {
        const row = cell.parentNode as HTMLTableRowElement;
        const columnIndex = Array.from(row.children).indexOf(cell);

        // 获取列名 - 从表头获取实际的列名
        let columnName: string | null = null;

        // 方法1: 从data.headers获取
        if (this.data.headers && this.data.headers[columnIndex]) {
            columnName = this.data.headers[columnIndex];
        }

        // 方法2: 如果方法1失败，从表头DOM元素获取
        if (!columnName) {
            const thead = this.tableElement.querySelector('thead');
            if (thead) {
                const headerCells = thead.querySelectorAll('th');
                if (headerCells[columnIndex]) {
                    const headerCell = headerCells[columnIndex];
                    // 尝试从title属性获取（如果有的话）
                    columnName = headerCell.getAttribute('data-column-name') ||
                                (headerCell.textContent || '').trim() ||
                                headerCell.getAttribute('title')?.replace('点击排序 ', '') ||
                                null;
                }
            }
        }

        const value = cell.textContent?.trim();

        //console.log(`单元格悬停: 列索引=${columnIndex}, 列名="${columnName}", 值="${value}"`);

        // 移除原生title属性，避免与自定义工具提示冲突
        cell.removeAttribute('title');

        // 触发工具提示引擎
        if (this.tooltipEngine && columnName && value) {
            this.tooltipEngine.handleCellHover(event, columnName, value);
        } else {
            //console.log(`工具提示跳过`);
            // 如果没有工具提示引擎，恢复原生title
            cell.title = value || '';
        }
    }

    /**
     * 处理单元格鼠标离开事件
     */
    handleCellMouseOut(cell: HTMLTableCellElement): void {
        // 触发工具提示引擎隐藏
        if (this.tooltipEngine) {
            this.tooltipEngine.handleCellLeave();
        }

        // 恢复鼠标样式
        cell.style.cursor = '';
    }

    /**
     * 显示工具提示
     */
    showTooltip(element: HTMLElement, message: string): void {
        const tooltip = document.createElement('div');
        tooltip.className = 'csv-tooltip';
        tooltip.textContent = message;
        tooltip.style.cssText = `
            position: absolute;
            background: #333;
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            z-index: 1000;
            pointer-events: none;
        `;

        const rect = element.getBoundingClientRect();
        tooltip.style.left = rect.left + rect.width / 2 + 'px';
        tooltip.style.top = rect.top - 30 + 'px';

        document.body.appendChild(tooltip);

        setTimeout(() => {
            if (tooltip.parentNode) {
                tooltip.parentNode.removeChild(tooltip);
            }
        }, 2000);
    }

    /**
     * 高亮单元格
     */
    highlightCell(cell: HTMLTableCellElement): void {
        // 清除之前的高亮
        const previousHighlighted = this.tableElement.querySelector('.csv-cell-selected');
        if (previousHighlighted) {
            previousHighlighted.classList.remove('csv-cell-selected');
        }

        // 添加高亮样式
        cell.classList.add('csv-cell-selected');

        // 确保样式文件已加载（样式已迁移到 src/css/inline-styles.css）
        this.ensureInlineStylesLoaded();
    }

    /**
     * 确保内联样式文件已加载
     */
    ensureInlineStylesLoaded(): void {
        if (document.getElementById('inline-styles')) {
            return;
        }

        const link = document.createElement('link');
        link.id = 'inline-styles';
        link.rel = 'stylesheet';
        link.href = 'src/css/inline-styles.css';
        document.head.appendChild(link);
    }

    /**
     * 更新表头样式
     */
    updateHeaderStyles(): void {
        const headers = this.tableElement.querySelectorAll('th');
        headers.forEach((th, index) => {
            const columnName = this.data.headers[index];

            // 清除排序样式
            th.classList.remove('sort-asc', 'sort-desc');

            // 添加可排序样式
            th.classList.add('sortable');

            // 添加当前排序样式
            if (columnName === this.data.sortColumn) {
                th.classList.add(this.data.sortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
            }
        });
    }

    /**
     * 生成列的颜色映射
     */
    generateColumnColorMaps(): void {
        if (!this.colorCoding.enabled) return;

        this.colorCoding.columnColorMaps.clear();

        // 只为指定的列分析唯一值并分配颜色
        this.data.headers.forEach(header => {
            // 检查是否是需要着色的列
            if (!this.colorCoding.targetColumns.includes(header)) {
                return;
            }

            const uniqueValues = new Set<string>();

            // 收集该列的所有唯一值
            this.data.rows.forEach(row => {
                const value = row[header];
                if (value && value.toString().trim()) {
                    uniqueValues.add(value.toString().trim());
                }
            });

            // 为唯一值分配颜色
            const colorMap = new Map<string, ColorStyle>();
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

        console.log('CSVTable列颜色映射已生成:', this.colorCoding.columnColorMaps);
    }

    /**
     * 获取单元格的颜色样式
     */
    getCellColorStyle(columnName: string, cellValue: string): ColorStyle | null {
        if (!this.colorCoding.enabled || !cellValue) return null;

        const trimmedValue = cellValue.toString().trim();

        // 优先检查特殊值的固定颜色
        if (Object.prototype.hasOwnProperty.call(this.colorCoding.specialValues, trimmedValue)) {
            return this.colorCoding.specialValues[trimmedValue];
        }

        // 如果不是特殊值，使用列的颜色映射
        const columnColorMap = this.colorCoding.columnColorMaps.get(columnName);
        if (!columnColorMap) return null;

        return columnColorMap.get(trimmedValue) || null;
    }

    /**
     * 渲染表格
     */
    render(data: RenderData): void {
        if (!data || !data.headers || !data.rows) {
            console.warn('无效的表格数据');
            return;
        }

        this.data.headers = data.headers;
        this.data.rows = data.rows;

        // 生成颜色映射
        this.generateColumnColorMaps();

        // 获取表头和表体元素
        const thead = this.tableElement.querySelector('thead');
        const tbody = this.tableElement.querySelector('tbody');

        if (!thead || !tbody) {
            console.error('表格结构不完整，缺少thead或tbody');
            return;
        }

        // 渲染表头
        this.renderHeader(thead);

        // 渲染表体
        this.renderBody(tbody);

        console.log(`表格渲染完成: ${data.rows.length} 行数据`);
    }

    /**
     * 渲染表头
     */
    renderHeader(thead: Element): void {
        thead.innerHTML = '';
        const headerRow = document.createElement('tr');

        this.data.headers.forEach(header => {
            const th = document.createElement('th');
            th.textContent = header;
            th.title = `点击排序 ${header}`;
            // 添加列名属性，用于工具提示功能
            th.setAttribute('data-column-name', header);
            headerRow.appendChild(th);
        });

        thead.appendChild(headerRow);
        this.updateHeaderStyles();
    }

    /**
     * 渲染表体
     */
    renderBody(tbody: Element): void {
        tbody.innerHTML = '';

        this.data.rows.forEach((rowData, rowIndex) => {
            const tr = document.createElement('tr');
            tr.dataset.rowIndex = String(rowIndex);

            this.data.headers.forEach(header => {
                const td = document.createElement('td');
                const value = rowData[header] || '';
                // 移除原生title属性，使用自定义工具提示系统
                // td.title = value; // 工具提示显示完整内容

                // 应用条件颜色样式 - 只包裹文字内容
                const colorStyle = this.getCellColorStyle(header, value);
                if (colorStyle && value.trim()) {
                    // 创建包裹文字的span元素
                    const span = document.createElement('span');
                    span.className = 'color-coded-text';
                    span.style.backgroundColor = colorStyle.backgroundColor;
                    span.style.color = colorStyle.textColor;
                    span.style.fontWeight = '600';
                    span.style.padding = '2px 6px';
                    span.style.borderRadius = '4px';
                    span.style.display = 'inline-block';
                    span.textContent = value;

                    td.appendChild(span);
                } else {
                    // 正常显示文字内容
                    td.textContent = value;
                }

                tr.appendChild(td);
            });

            tbody.appendChild(tr);
        });
    }

    /**
     * 获取表格数据
     */
    getData(): RenderData {
        return {
            headers: [...this.data.headers],
            rows: [...this.data.rows]
        };
    }

    /**
     * 清空表格
     */
    clear(): void {
        const thead = this.tableElement.querySelector('thead');
        const tbody = this.tableElement.querySelector('tbody');

        if (thead) thead.innerHTML = '';
        if (tbody) tbody.innerHTML = '';

        this.data = {
            headers: [],
            rows: [],
            sortColumn: null,
            sortDirection: 'asc'
        };

        console.log('表格已清空');
    }

    /**
     * 更新数据
     */
    updateData(data: RenderData): void {
        this.render(data);
    }

    /**
     * 获取选中的单元格
     */
    getSelectedCell(): SelectedCellInfo | null {
        const selectedCell = this.tableElement.querySelector('.csv-cell-selected') as HTMLTableCellElement | null;
        if (!selectedCell) return null;

        const row = selectedCell.parentNode as HTMLTableRowElement;
        const columnIndex = Array.from(row.children).indexOf(selectedCell);
        const rowIndex = Array.from(row.parentNode!.children).indexOf(row);

        return {
            rowIndex,
            columnIndex,
            columnName: this.data.headers[columnIndex],
            value: selectedCell.textContent || ''
        };
    }

    /**
     * 异步渲染字段列表，包含工具提示信息
     */
    async renderFieldsWithTooltips(fieldsList: HTMLElement, rowData: CSVRow): Promise<void> {
        // 获取工具提示引擎设置
        let tooltipSettings: { tooltip_rules_path?: string } | null = null;
        try {
            const { invoke } = (window as any).__TAURI__.core;
            tooltipSettings = await invoke('load_settings_command');
        } catch (error) {
            console.warn('无法加载工具提示设置:', error);
        }

        for (const [fieldName, fieldValue] of Object.entries(rowData)) {
            console.log('处理字段:', fieldName, '值:', fieldValue);

            // 检查内容长度，决定是否占满整行
            const isLongContent = (fieldValue && fieldValue.length > 100) ||
                                  (fieldName && fieldName.length > 20);

            // 创建字段容器
            const fieldItem = document.createElement('div');
            fieldItem.className = 'row-details-field';
            fieldItem.style.cssText = `
                padding: 20px;
                border: 1px solid var(--border-color, #e2e8f0);
                border-radius: 12px;
                background: var(--bg-secondary, #f8fafc);
                transition: all 0.3s ease;
                position: relative;
                overflow: hidden;
                ${isLongContent ? 'grid-column: 1 / -1;' : ''}
            `;

            // 创建字段标签
            const fieldLabel = document.createElement('div');
            fieldLabel.className = 'row-details-field-label';
            fieldLabel.textContent = fieldName;
            fieldLabel.style.cssText = `
                font-weight: 600;
                color: var(--text-primary, #1e293b);
                margin: -20px -20px 12px -20px;
                padding: 12px 20px;
                font-size: 15px;
                display: flex;
                align-items: center;
                gap: 8px;
                background: var(--bg-tertiary, #f1f5f9);
                border-bottom: 1px solid var(--border-color, #e2e8f0);
            `;

            // 创建字段值容器
            const fieldValueDiv = document.createElement('div');
            fieldValueDiv.className = 'row-details-field-value';
            fieldValueDiv.textContent = fieldValue || '(空值)';
            fieldValueDiv.style.cssText = `
                color: var(--text-secondary, #64748b);
                font-size: 14px;
                line-height: 1.6;
                word-wrap: break-word;
                white-space: pre-wrap;
                margin-bottom: 12px;
                padding: 0 4px;
                ${!fieldValue ? 'font-style: italic; opacity: 0.7;' : ''}
            `;

            // 尝试获取工具提示信息
            let tooltipText: string | null = null;
            if (tooltipSettings && fieldValue) {
                try {
                    const { invoke } = (window as any).__TAURI__.core;
                    const rulesPath = tooltipSettings.tooltip_rules_path || 'tooltip_rules';
                    tooltipText = await invoke('get_cell_tooltip', {
                        columnName: fieldName,
                        cellValue: String(fieldValue),
                        rulesPath: rulesPath
                    });
                } catch (error) {
                    console.warn(`获取字段 ${fieldName} 的工具提示失败:`, error);
                }
            }

            // 先添加标签和值
            fieldItem.appendChild(fieldLabel);
            fieldItem.appendChild(fieldValueDiv);

            // 如果有工具提示信息，添加工具提示区域
            if (tooltipText) {
                const tooltipArea = document.createElement('div');
                tooltipArea.className = 'row-details-field-tooltip';
                tooltipArea.style.cssText = `
                    background: linear-gradient(135deg, var(--info-color, #3b82f6) 0%, var(--primary-color, #667eea) 100%);
                    color: white;
                    padding: 12px 16px;
                    border-radius: 8px;
                    font-size: 13px;
                    line-height: 1.5;
                    margin-top: 12px;
                    position: relative;
                    box-shadow: 0 2px 8px rgba(59, 130, 246, 0.2);
                `;

                const tooltipIcon = document.createElement('span');
                tooltipIcon.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg>';
                tooltipIcon.style.cssText = `
                    margin-right: 8px;
                    font-size: 14px;
                `;

                const tooltipContent = document.createElement('span');
                tooltipContent.textContent = tooltipText;

                tooltipArea.appendChild(tooltipIcon);
                tooltipArea.appendChild(tooltipContent);
                fieldItem.appendChild(tooltipArea);

                // 为标签添加指示器
                const indicator = document.createElement('span');
                indicator.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg>';
                indicator.style.cssText = `
                    color: var(--info-color, #3b82f6);
                    font-size: 14px;
                `;
                fieldLabel.appendChild(indicator);
            }

            // 添加复制功能
            fieldItem.addEventListener('click', () => {
                if (fieldValue && navigator.clipboard) {
                    navigator.clipboard.writeText(fieldValue).then(() => {
                        this.showTooltip(fieldItem, '已复制到剪贴板');
                    });
                }
            });

            // 添加悬停效果
            fieldItem.addEventListener('mouseenter', () => {
                fieldItem.style.background = 'var(--bg-tertiary, #f1f5f9)';
                fieldItem.style.borderColor = 'var(--primary-color, #667eea)';
                fieldItem.style.cursor = fieldValue ? 'pointer' : 'default';
                fieldItem.style.transform = 'translateY(-2px)';
                fieldItem.style.boxShadow = '0 8px 25px rgba(0, 0, 0, 0.1)';
            });

            fieldItem.addEventListener('mouseleave', () => {
                fieldItem.style.background = 'var(--bg-secondary, #f8fafc)';
                fieldItem.style.borderColor = 'var(--border-color, #e2e8f0)';
                fieldItem.style.transform = 'translateY(0)';
                fieldItem.style.boxShadow = 'none';
            });

            fieldsList.appendChild(fieldItem);
        }
    }

    /**
     * 清理组件
     * 注意：原 JS 文件中定义了两个同名 cleanup 方法，运行时以最后定义者为准（仅调用 clear）。
     * 为保持行为一致，这里只保留生效的实现（清空数据），不改动既有逻辑。
     */
    cleanup(): void {
        // 移除事件监听器
        // （由于使用了事件代理，移除表格元素时会自动清理）

        // 清空数据
        this.clear();

        console.log('CSV表格组件已清理');
    }
}
