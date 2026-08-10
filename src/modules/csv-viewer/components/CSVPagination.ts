/**
 * CSV分页组件
 * 负责CSV数据的分页显示控制
 */

/** 每页行数：具体数字或 'all' */
export type RowsPerPage = number | 'all';

/** 分页组件配置 */
export interface CSVPaginationOptions {
    onPageChange?: (page: number) => void;
    onRowsPerPageChange?: (rowsPerPage: RowsPerPage) => void;
}

/** 分页状态数据 */
export interface CSVPaginationData {
    currentPage: number;
    totalPages: number;
    rowsPerPage: RowsPerPage;
    totalRows: number;
    startRow: number;
    endRow: number;
}

export class CSVPagination {
    private containerElement: HTMLElement;
    private options: Required<CSVPaginationOptions>;
    private data: CSVPaginationData;

    constructor(containerElement: HTMLElement, options: CSVPaginationOptions = {}) {
        this.containerElement = containerElement;
        this.options = {
            onPageChange: options.onPageChange || (() => {}),
            onRowsPerPageChange: options.onRowsPerPageChange || (() => {}),
            ...options
        };

        this.data = {
            currentPage: 1,
            totalPages: 1,
            rowsPerPage: 100,
            totalRows: 0,
            startRow: 0,
            endRow: 0
        };

        this.init();
    }

    /**
     * 初始化分页组件
     */
    init(): void {
        if (!this.containerElement) {
            throw new Error('分页容器元素不存在');
        }

        // 绑定事件
        this.bindEvents();

        console.log('CSV分页组件初始化完成');
    }

    /**
     * 绑定事件处理器
     */
    bindEvents(): void {
        // 使用事件代理处理分页按钮点击
        this.containerElement.addEventListener('click', (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const button = target.closest('button[data-page-action]') as HTMLButtonElement | null;
            if (!button) return;

            const action = button.dataset.pageAction;
            if (action) this.handlePageAction(action);
        });

        // 处理每页行数变化
        const rowsPerPageSelect = this.containerElement.querySelector('#rowsPerPage') as HTMLSelectElement | null;
        if (rowsPerPageSelect) {
            rowsPerPageSelect.addEventListener('change', (e: Event) => {
                const newRowsPerPage = (e.target as HTMLSelectElement).value;
                this.handleRowsPerPageChange(newRowsPerPage);
            });
        }
    }

    /**
     * 处理分页操作
     */
    handlePageAction(action: string): void {
        let newPage = this.data.currentPage;

        switch (action) {
            case 'first':
                newPage = 1;
                break;
            case 'prev':
                newPage = Math.max(1, this.data.currentPage - 1);
                break;
            case 'next':
                newPage = Math.min(this.data.totalPages, this.data.currentPage + 1);
                break;
            case 'last':
                newPage = this.data.totalPages;
                break;
            default:
                console.warn('未知的分页操作:', action);
                return;
        }

        if (newPage !== this.data.currentPage) {
            this.data.currentPage = newPage;
            this.options.onPageChange(newPage);
            this.updateDisplay();

            console.log(`页面切换到: ${newPage}/${this.data.totalPages}`);
        }
    }

    /**
     * 处理每页行数变化
     */
    handleRowsPerPageChange(newRowsPerPage: string): void {
        const oldRowsPerPage = this.data.rowsPerPage;
        this.data.rowsPerPage = newRowsPerPage === 'all' ? 'all' : parseInt(newRowsPerPage);

        if (oldRowsPerPage !== this.data.rowsPerPage) {
            this.options.onRowsPerPageChange(this.data.rowsPerPage);

            console.log(`每页行数变更: ${oldRowsPerPage} -> ${this.data.rowsPerPage}`);
        }
    }

    /**
     * 更新分页数据
     */
    updatePagination(paginationData: Partial<CSVPaginationData>): void {
        this.data = {
            ...this.data,
            ...paginationData
        };

        this.updateDisplay();
        this.updateButtonStates();
    }

    /**
     * 更新显示信息
     */
    updateDisplay(): void {
        // 更新页码信息
        const currentPageElement = this.containerElement.querySelector('#currentPage');
        if (currentPageElement) {
            currentPageElement.textContent = String(this.data.currentPage);
        }

        const totalPagesElement = this.containerElement.querySelector('#totalPages');
        if (totalPagesElement) {
            totalPagesElement.textContent = String(this.data.totalPages);
        }

        // 更新行数信息
        const startRowElement = this.containerElement.querySelector('#startRow');
        if (startRowElement) {
            startRowElement.textContent = this.data.startRow.toLocaleString();
        }

        const endRowElement = this.containerElement.querySelector('#endRow');
        if (endRowElement) {
            endRowElement.textContent = this.data.endRow.toLocaleString();
        }

        const totalRowsElement = this.containerElement.querySelector('#totalRowsCount');
        if (totalRowsElement) {
            totalRowsElement.textContent = this.data.totalRows.toLocaleString();
        }
    }

    /**
     * 更新按钮状态
     */
    updateButtonStates(): void {
        const firstBtn = this.containerElement.querySelector('[data-page-action="first"]') as HTMLButtonElement | null;
        const prevBtn = this.containerElement.querySelector('[data-page-action="prev"]') as HTMLButtonElement | null;
        const nextBtn = this.containerElement.querySelector('[data-page-action="next"]') as HTMLButtonElement | null;
        const lastBtn = this.containerElement.querySelector('[data-page-action="last"]') as HTMLButtonElement | null;

        const isFirstPage = this.data.currentPage <= 1;
        const isLastPage = this.data.currentPage >= this.data.totalPages;

        if (firstBtn) firstBtn.disabled = isFirstPage;
        if (prevBtn) prevBtn.disabled = isFirstPage;
        if (nextBtn) nextBtn.disabled = isLastPage;
        if (lastBtn) lastBtn.disabled = isLastPage;

        // 容器始终显示（包含工具栏），只控制分页相关元素的显示
        this.containerElement.style.display = 'flex';

        // 控制分页信息的显示/隐藏
        const paginationInfo = this.containerElement.querySelector('.csv-pagination-info') as HTMLElement | null;
        if (paginationInfo) {
            paginationInfo.style.display = this.data.totalRows > 0 ? 'block' : 'none';
        }

        // 控制分页控制按钮的显示/隐藏
        const paginationControls = this.containerElement.querySelector('.csv-pagination-controls') as HTMLElement | null;
        if (paginationControls) {
            const shouldShowControls = this.data.totalPages > 1;
            paginationControls.style.display = shouldShowControls ? 'flex' : 'none';
        }
    }

    /**
     * 跳转到指定页面
     */
    goToPage(pageNumber: number): boolean {
        if (pageNumber < 1 || pageNumber > this.data.totalPages) {
            console.warn('页码超出范围:', pageNumber);
            return false;
        }

        if (pageNumber !== this.data.currentPage) {
            this.data.currentPage = pageNumber;
            this.options.onPageChange(pageNumber);
            this.updateDisplay();
            this.updateButtonStates();

            console.log(`跳转到页面: ${pageNumber}`);
            return true;
        }

        return false;
    }

    /**
     * 设置总页数
     */
    setTotalPages(totalPages: number): void {
        this.data.totalPages = Math.max(1, totalPages);
        this.data.currentPage = Math.min(this.data.currentPage, this.data.totalPages);

        this.updateDisplay();
        this.updateButtonStates();
    }

    /**
     * 设置总行数
     */
    setTotalRows(totalRows: number): void {
        this.data.totalRows = totalRows;
        this.updateDisplay();
    }

    /**
     * 设置当前显示的行范围
     */
    setRowRange(startRow: number, endRow: number): void {
        this.data.startRow = startRow;
        this.data.endRow = endRow;
        this.updateDisplay();
    }

    /**
     * 获取当前分页状态
     */
    getState(): CSVPaginationData {
        return { ...this.data };
    }

    /**
     * 重置分页状态
     */
    reset(): void {
        this.data = {
            currentPage: 1,
            totalPages: 1,
            rowsPerPage: 100,
            totalRows: 0,
            startRow: 0,
            endRow: 0
        };

        this.updateDisplay();
        this.updateButtonStates();

        console.log('分页状态已重置');
    }

    /**
     * 创建分页按钮
     */
    createPaginationButtons(): string {
        const buttonsHtml = `
            <div class="csv-pagination-controls">
                <button class="csv-page-btn" data-page-action="first" title="首页"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="11 19 2 12 11 5"/><polyline points="22 19 13 12 22 5"/></svg></button>
                <button class="csv-page-btn" data-page-action="prev" title="上一页"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="19 20 9 12 19 4"/></svg></button>
                <span class="csv-page-info">
                    第 <span id="currentPage">1</span> 页，共 <span id="totalPages">1</span> 页
                </span>
                <button class="csv-page-btn" data-page-action="next" title="下一页"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="5 4 15 12 5 20"/></svg></button>
                <button class="csv-page-btn" data-page-action="last" title="末页"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="13 19 22 12 13 5"/><polyline points="2 19 11 12 2 5"/></svg></button>
            </div>
        `;

        return buttonsHtml;
    }

    /**
     * 创建页面信息显示
     */
    createPageInfo(): string {
        const infoHtml = `
            <div class="csv-pagination-info">
                显示第 <span id="startRow">0</span> - <span id="endRow">0</span> 行，
                共 <span id="totalRowsCount">0</span> 行
            </div>
        `;

        return infoHtml;
    }

    /**
     * 渲染完整的分页控件
     */
    renderComplete(): void {
        const paginationHtml = `
            ${this.createPageInfo()}
            ${this.createPaginationButtons()}
        `;

        this.containerElement.innerHTML = paginationHtml;
        this.bindEvents();
        this.updateDisplay();
        this.updateButtonStates();

        console.log('分页控件渲染完成');
    }

    /**
     * 清理组件
     */
    cleanup(): void {
        // 清除事件监听器
        // （由于使用了事件代理，移除容器元素时会自动清理）

        // 重置状态
        this.reset();

        console.log('CSV分页组件已清理');
    }
}
