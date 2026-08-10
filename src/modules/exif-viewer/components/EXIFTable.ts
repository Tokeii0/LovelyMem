/**
 * EXIF表格组件
 * 负责EXIF数据的表格展示和交互
 */

import { EXIFUtils, type EXIFData, type EXIFValue } from '../utils/EXIFUtils';

/** 分类键 -> 分类显示名称 */
type CategoryMap = Record<string, string>;

/** 单条 EXIF 数据项：[标签名, 值] */
type EXIFEntry = [string, EXIFValue];

/** 排序列 */
type SortColumn = 'tag' | 'value' | 'category' | null;

/** 排序方向 */
type SortDirection = 'asc' | 'desc';

export class EXIFTable {
    private container: HTMLElement;
    private data: EXIFData;
    private categories: CategoryMap;
    private sortColumn: SortColumn;
    private sortDirection: SortDirection;

    constructor(container: HTMLElement) {
        this.container = container;
        this.data = {};
        this.categories = {};
        this.sortColumn = null;
        this.sortDirection = 'asc';

        this.init();
    }

    /**
     * 初始化表格
     */
    init(): void {
        this.bindEvents();
    }

    /**
     * 渲染表格
     */
    render(data: EXIFData, categories: CategoryMap): void {
        this.data = data;
        this.categories = categories;

        if (!data || Object.keys(data).length === 0) {
            this.renderEmptyState();
            return;
        }

        this.renderTable();
    }

    /**
     * 渲染空状态
     */
    renderEmptyState(): void {
        this.container.innerHTML = `
            <div class="exif-empty-state">
                <div class="empty-icon">📷</div>
                <h3>没有EXIF数据</h3>
                <p>当前图片没有EXIF元数据信息</p>
            </div>
        `;
    }

    /**
     * 渲染表格
     */
    renderTable(): void {
        // 按分类组织数据
        const categorizedData = this.categorizeData(this.data);

        let tableHtml = `
            <div class="exif-table-container">
                <table class="exif-table">
                    <thead>
                        <tr>
                            <th class="sortable" data-column="tag">
                                <span>标签名称</span>
                                <i class="sort-icon">↕️</i>
                            </th>
                            <th class="sortable" data-column="value">
                                <span>值</span>
                                <i class="sort-icon">↕️</i>
                            </th>
                            <th class="sortable" data-column="category">
                                <span>分类</span>
                                <i class="sort-icon">↕️</i>
                            </th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        // 按分类渲染数据
        Object.entries(categorizedData).forEach(([categoryKey, items]) => {
            const categoryName = this.categories[categoryKey] || '其他信息';

            // 分类标题行
            tableHtml += `
                <tr class="category-header">
                    <td colspan="4">
                        <div class="category-title">
                            <span class="category-icon">${this.getCategoryIcon(categoryKey)}</span>
                            <span class="category-name">${categoryName}</span>
                            <span class="category-count">(${items.length})</span>
                        </div>
                    </td>
                </tr>
            `;

            // 数据行
            items.forEach(([tag, value]) => {
                const formattedValue = EXIFUtils.formatValue(tag, value);
                const displayValue = this.truncateValue(formattedValue);
                const hasLongValue = formattedValue.length > 50;

                tableHtml += `
                    <tr class="data-row" data-category="${categoryKey}">
                        <td class="tag-cell">
                            <span class="tag-name" title="${tag}">${EXIFUtils.getDisplayName(tag)}</span>
                            <span class="tag-code">${tag}</span>
                        </td>
                        <td class="value-cell">
                            <span class="value-text ${hasLongValue ? 'truncated' : ''}"
                                  title="${formattedValue}">${displayValue}</span>
                            ${hasLongValue ? '<button class="expand-btn" title="展开完整内容">...</button>' : ''}
                        </td>
                        <td class="category-cell">
                            <span class="category-badge category-${categoryKey}">${categoryName}</span>
                        </td>
                        <td class="action-cell">
                            <button class="copy-btn" data-value="${this.escapeHtml(formattedValue)}" title="复制值">
                                📋
                            </button>
                            <button class="detail-btn" data-tag="${tag}" data-value="${this.escapeHtml(formattedValue)}" title="查看详情">
                                🔍
                            </button>
                        </td>
                    </tr>
                `;
            });
        });

        tableHtml += `
                    </tbody>
                </table>
            </div>
        `;

        this.container.innerHTML = tableHtml;
        this.bindTableEvents();
    }

    /**
     * 按分类组织数据
     */
    categorizeData(data: EXIFData): Record<string, EXIFEntry[]> {
        const categorized: Record<string, EXIFEntry[]> = {};

        Object.entries(data).forEach(([tag, value]) => {
            const category = EXIFUtils.getTagCategory(tag);
            if (!categorized[category]) {
                categorized[category] = [];
            }
            categorized[category].push([tag, value]);
        });

        // 对每个分类内的数据进行排序
        Object.keys(categorized).forEach(category => {
            categorized[category].sort((a, b) => a[0].localeCompare(b[0]));
        });

        return categorized;
    }

    /**
     * 获取分类图标
     */
    getCategoryIcon(category: string): string {
        const icons: Record<string, string> = {
            'basic': '📋',
            'camera': '📷',
            'shooting': '⚙️',
            'gps': '🌍',
            'datetime': '🕒',
            'technical': '🔧',
            'other': '📄'
        };
        return icons[category] || '📄';
    }

    /**
     * 截断长值
     */
    truncateValue(value: EXIFValue, maxLength: number = 50): string {
        let str: string;
        if (typeof value !== 'string') {
            str = String(value);
        } else {
            str = value;
        }
        return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
    }

    /**
     * HTML转义
     */
    escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * 绑定表格事件
     */
    bindTableEvents(): void {
        // 复制按钮事件
        this.container.querySelectorAll<HTMLButtonElement>('.copy-btn').forEach(btn => {
            btn.addEventListener('click', async (e: MouseEvent) => {
                const value = (e.currentTarget as HTMLButtonElement).dataset.value ?? '';
                try {
                    await navigator.clipboard.writeText(value);
                    this.showToast('已复制到剪贴板');
                } catch (error) {
                    console.error('复制失败:', error);
                }
            });
        });

        // 详情按钮事件
        this.container.querySelectorAll<HTMLButtonElement>('.detail-btn').forEach(btn => {
            btn.addEventListener('click', (e: MouseEvent) => {
                const target = e.currentTarget as HTMLButtonElement;
                const tag = target.dataset.tag ?? '';
                const value = target.dataset.value ?? '';
                this.showDetailModal(tag, value);
            });
        });

        // 展开按钮事件
        this.container.querySelectorAll<HTMLButtonElement>('.expand-btn').forEach(btn => {
            btn.addEventListener('click', (e: MouseEvent) => {
                const target = e.currentTarget as HTMLButtonElement;
                const valueCell = target.closest('.value-cell');
                const valueText = valueCell?.querySelector<HTMLElement>('.value-text');
                if (!valueText) return;
                const fullValue = valueText.getAttribute('title') ?? '';

                if (valueText.classList.contains('expanded')) {
                    // 收起
                    valueText.textContent = this.truncateValue(fullValue);
                    valueText.classList.remove('expanded');
                    target.textContent = '...';
                } else {
                    // 展开
                    valueText.textContent = fullValue;
                    valueText.classList.add('expanded');
                    target.textContent = '收起';
                }
            });
        });

        // 排序事件
        this.container.querySelectorAll<HTMLElement>('.sortable').forEach(th => {
            th.addEventListener('click', (e: MouseEvent) => {
                const column = (e.currentTarget as HTMLElement).dataset.column as SortColumn;
                this.handleSort(column);
            });
        });
    }

    /**
     * 处理排序
     */
    handleSort(column: SortColumn): void {
        if (this.sortColumn === column) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortColumn = column;
            this.sortDirection = 'asc';
        }

        // 更新排序图标
        this.updateSortIcons();

        // 重新渲染表格
        this.renderTable();
    }

    /**
     * 更新排序图标
     */
    updateSortIcons(): void {
        this.container.querySelectorAll<HTMLElement>('.sortable').forEach(th => {
            const icon = th.querySelector<HTMLElement>('.sort-icon');
            const column = th.dataset.column;
            if (!icon) return;

            if (column === this.sortColumn) {
                icon.textContent = this.sortDirection === 'asc' ? '↑' : '↓';
                th.classList.add('sorted');
            } else {
                icon.textContent = '↕️';
                th.classList.remove('sorted');
            }
        });
    }

    /**
     * 显示详情模态框
     */
    showDetailModal(tag: string, value: string): void {
        const modal = document.createElement('div');
        modal.className = 'exif-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>EXIF标签详情</h3>
                    <button class="modal-close">×</button>
                </div>
                <div class="modal-body">
                    <div class="detail-item">
                        <label>标签名称:</label>
                        <div class="detail-value">${EXIFUtils.getDisplayName(tag)}</div>
                    </div>
                    <div class="detail-item">
                        <label>标签代码:</label>
                        <div class="detail-value code">${tag}</div>
                    </div>
                    <div class="detail-item">
                        <label>分类:</label>
                        <div class="detail-value">${this.categories[EXIFUtils.getTagCategory(tag)] || '其他信息'}</div>
                    </div>
                    <div class="detail-item">
                        <label>值:</label>
                        <div class="detail-value selectable">${value}</div>
                    </div>
                    <div class="detail-item">
                        <label>描述:</label>
                        <div class="detail-value">${EXIFUtils.getTagDescription(tag)}</div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-primary copy-detail-btn">复制值</button>
                    <button class="btn btn-secondary modal-close">关闭</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 绑定事件
        modal.querySelectorAll<HTMLButtonElement>('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => modal.remove());
        });

        const copyDetailBtn = modal.querySelector<HTMLButtonElement>('.copy-detail-btn');
        copyDetailBtn?.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(value);
                this.showToast('已复制到剪贴板');
            } catch (error) {
                console.error('复制失败:', error);
            }
        });

        // 点击背景关闭
        modal.addEventListener('click', (e: MouseEvent) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    /**
     * 显示提示消息
     */
    showToast(message: string): void {
        const toast = document.createElement('div');
        toast.className = 'exif-toast';
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.remove();
        }, 2000);
    }

    /**
     * 绑定事件
     */
    bindEvents(): void {
        // 可以在这里添加全局事件监听
    }

    /**
     * 清理资源
     */
    cleanup(): void {
        // 清理事件监听器和DOM元素
        if (this.container) {
            this.container.innerHTML = '';
        }
    }
}
