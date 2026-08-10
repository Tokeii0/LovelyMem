/**
 * CSV工具提示引擎
 * 负责处理单元格悬停时的智能工具提示显示
 */

// Tauri API导入
const { invoke } = (window as any).__TAURI__.core;

/** 工具提示引擎配置 */
export interface TooltipEngineOptions {
    showDelay?: number;
    hideDelay?: number;
    maxWidth?: number;
    offset?: { x: number; y: number };
}

/** 应用设置（本模块用到的字段） */
interface TooltipEngineSettings {
    tooltip_rules_path?: string;
}

/** 当前显示中的工具提示信息 */
interface CurrentTooltip {
    text: string;
    event: MouseEvent;
}

/** 计算出的工具提示坐标 */
interface TooltipPosition {
    x: number;
    y: number;
}

export class CSVTooltipEngine {
    private options: Required<TooltipEngineOptions>;
    private isEnabled: boolean;
    private currentTooltip: CurrentTooltip | null;
    private showTimer: ReturnType<typeof setTimeout> | null;
    private hideTimer: ReturnType<typeof setTimeout> | null;
    private rulesCache: Map<string, unknown>;
    private settings: TooltipEngineSettings | null;
    private settingsLoaded: boolean;
    private fallbackMode: boolean;
    private tooltipElement!: HTMLDivElement;

    constructor(options: TooltipEngineOptions = {}) {
        this.options = {
            showDelay: 500,           // 显示延迟（毫秒）
            hideDelay: 100,           // 隐藏延迟（毫秒）
            maxWidth: 300,            // 最大宽度
            offset: { x: 10, y: 10 }, // 偏移量
            ...options
        };

        // 状态管理
        this.isEnabled = true;
        this.currentTooltip = null;
        this.showTimer = null;
        this.hideTimer = null;
        this.rulesCache = new Map();
        this.settings = null;
        this.settingsLoaded = false;

        // 创建工具提示元素
        this.createTooltipElement();

        // 绑定事件
        this.bindEvents();

        // 立即加载设置
        this.loadSettings();

        // 添加备用显示方法
        this.fallbackMode = false;

        //console.log('CSV工具提示引擎初始化完成');
    }

    /**
     * 创建工具提示DOM元素
     */
    createTooltipElement(): void {
        // 移除可能存在的旧工具提示
        const existingTooltip = document.querySelector('.csv-custom-tooltip');
        if (existingTooltip) {
            existingTooltip.remove();
        }

        this.tooltipElement = document.createElement('div');
        this.tooltipElement.className = 'csv-custom-tooltip';
        this.tooltipElement.id = 'csv-tooltip-' + Date.now();

        // 使用内联样式确保样式生效
        this.tooltipElement.style.cssText = `
            position: fixed !important;
            z-index: 999999 !important;
            background: #2d3748 !important;
            color: #ffffff !important;
            border: 1px solid #4a5568 !important;
            border-radius: 6px !important;
            padding: 8px 12px !important;
            font-size: 12px !important;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
            line-height: 1.5 !important;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3) !important;
            max-width: ${this.options.maxWidth}px !important;
            min-width: 120px !important;
            word-wrap: break-word !important;
            word-break: break-word !important;
            white-space: pre-wrap !important;
            pointer-events: none !important;
            opacity: 0 !important;
            transform: translateY(-5px) scale(0.95) !important;
            transition: all 0.15s ease-out !important;
            display: none !important;
        `;

        // 添加箭头元素，指向单元格
        const arrow = document.createElement('div');
        arrow.className = 'tooltip-arrow';
        arrow.style.cssText = `
            position: absolute !important;
            top: 100% !important;
            left: 50% !important;
            transform: translateX(-50%) !important;
            width: 0 !important;
            height: 0 !important;
            border-left: 6px solid transparent !important;
            border-right: 6px solid transparent !important;
            border-top: 6px solid #2d3748 !important;
            z-index: 999999 !important;
        `;

        this.tooltipElement.appendChild(arrow);
        document.body.appendChild(this.tooltipElement);

        //console.log('工具提示元素已创建:', this.tooltipElement.id);
    }

    /**
     * 绑定全局事件
     */
    bindEvents(): void {
        // 监听窗口大小变化，重新定位工具提示
        window.addEventListener('resize', () => {
            if (this.currentTooltip) {
                this.hideTooltip();
            }
        });

        // 监听滚动事件，隐藏工具提示
        window.addEventListener('scroll', () => {
            if (this.currentTooltip) {
                this.hideTooltip();
            }
        }, true);
    }

    /**
     * 加载应用设置
     */
    async loadSettings(): Promise<void> {
        try {
            this.settings = await invoke('load_settings_command') as TooltipEngineSettings;
            this.settingsLoaded = true;
            //console.log('工具提示引擎设置已加载:', this.settings.tooltip_rules_path);
        } catch (error) {
            console.error('加载设置失败:', error);
            // 使用默认设置
            this.settings = { tooltip_rules_path: 'tooltip_rules' };
            this.settingsLoaded = true;
        }
    }

    /**
     * 处理单元格悬停事件
     */
    async handleCellHover(event: MouseEvent, columnName: string, cellValue: string): Promise<void> {
        if (!this.isEnabled || !columnName || cellValue === null || cellValue === undefined) {
            return;
        }

        // 清除之前的定时器
        this.clearTimers();

        // 设置显示定时器
        this.showTimer = setTimeout(async () => {
            try {
                await this.showTooltipForCell(event, columnName, cellValue);
            } catch (error) {
                console.error('显示工具提示失败:', error);
            }
        }, this.options.showDelay);
    }

    /**
     * 处理单元格离开事件
     */
    handleCellLeave(): void {
        this.clearTimers();

        // 设置隐藏定时器
        this.hideTimer = setTimeout(() => {
            this.hideTooltip();
        }, this.options.hideDelay);
    }

    /**
     * 显示指定单元格的工具提示
     */
    async showTooltipForCell(event: MouseEvent, columnName: string, cellValue: string): Promise<void> {
        // 确保设置已加载
        if (!this.settingsLoaded) {
            //console.log('等待设置加载...');
            await this.loadSettings();
        }

        // 获取工具提示内容
        const tooltipText = await this.getTooltipText(columnName, cellValue);

        if (!tooltipText) {
            //console.log(`没有找到 ${columnName}[${cellValue}] 的工具提示规则`);
            // 如果没有自定义工具提示，恢复原生title显示完整内容
            if (event.target) {
                (event.target as HTMLElement).title = cellValue || '';
            }
            return;
        }

        //console.log(`显示工具提示: ${columnName}[${cellValue}] → ${tooltipText}`);

        // 显示工具提示
        this.showTooltip(event, tooltipText);

        // 更改鼠标样式
        if (event.target) {
            (event.target as HTMLElement).style.cursor = 'help';
        }
    }

    /**
     * 获取工具提示文本
     */
    async getTooltipText(columnName: string, cellValue: string): Promise<string | null> {
        try {
            const rulesPath = this.settings?.tooltip_rules_path || 'tooltip_rules';
            ////console.log(`查询工具提示: 列=${columnName}, 值=${cellValue}, 规则路径=${rulesPath}`);

            const tooltip = await invoke('get_cell_tooltip', {
                columnName: columnName,
                cellValue: String(cellValue),
                rulesPath: rulesPath
            }) as string | null;

            ////console.log(`工具提示查询结果:`, tooltip);
            return tooltip;
        } catch (error) {
            console.error('获取工具提示失败:', error);
            return null;
        }
    }

    /**
     * 显示工具提示
     */
    showTooltip(event: MouseEvent, text: string): void {
        if (!text) return;

        ////console.log(`显示工具提示内容: "${text}"`);

        // 确保工具提示元素存在
        if (!this.tooltipElement || !document.body.contains(this.tooltipElement)) {
            //console.log('重新创建工具提示元素');
            this.createTooltipElement();
        }

        // 清空内容并设置新内容
        this.tooltipElement.innerHTML = '';
        this.tooltipElement.textContent = text;

        // 重新添加箭头
        const arrow = document.createElement('div');
        arrow.className = 'tooltip-arrow';
        arrow.style.cssText = `
            position: absolute !important;
            top: 100% !important;
            left: 50% !important;
            transform: translateX(-50%) !important;
            width: 0 !important;
            height: 0 !important;
            border-left: 6px solid transparent !important;
            border-right: 6px solid transparent !important;
            border-top: 6px solid #2d3748 !important;
        `;
        this.tooltipElement.appendChild(arrow);

        // 临时显示以获取实际尺寸
        this.tooltipElement.style.visibility = 'hidden';
        this.tooltipElement.style.display = 'block';
        this.tooltipElement.style.opacity = '0';

        // 获取实际尺寸后重新计算位置
        const actualRect = this.tooltipElement.getBoundingClientRect();
        const rect = this.calculateTooltipPositionWithSize(event, actualRect.width, actualRect.height);

        // 设置最终位置
        this.tooltipElement.style.left = rect.x + 'px';
        this.tooltipElement.style.top = rect.y + 'px';
        this.tooltipElement.style.visibility = 'visible';

        //console.log(`工具提示位置: x=${rect.x}, y=${rect.y}`);

        // 强制重绘并显示
        void this.tooltipElement.offsetHeight; // 触发重绘

        // 显示动画
        requestAnimationFrame(() => {
            this.tooltipElement.style.opacity = '1';
            this.tooltipElement.style.transform = 'translateY(0) scale(1)';
            //console.log(`工具提示动画已触发`);

            // 再次检查元素状态
            setTimeout(() => {
                getComputedStyle(this.tooltipElement);
                //console.log(`计算样式: ...`);
            }, 100);
        });

        this.currentTooltip = { text, event };

        // 如果1秒后工具提示仍然不可见，尝试备用方法
        setTimeout(() => {
            if (this.tooltipElement && this.currentTooltip) {
                const computed = getComputedStyle(this.tooltipElement);
                if (computed.opacity === '0' || computed.display === 'none') {
                    //console.log('工具提示可能未正确显示，尝试备用方法');
                    this.showFallbackTooltip(event, text);
                }
            }
        }, 1000);
    }

    /**
     * 备用工具提示显示方法
     */
    showFallbackTooltip(event: MouseEvent, text: string): void {
        //console.log('使用备用工具提示方法');

        // 移除现有工具提示
        if (this.tooltipElement) {
            this.tooltipElement.remove();
        }

        // 创建简单的备用工具提示
        this.tooltipElement = document.createElement('div');
        this.tooltipElement.className = 'csv-fallback-tooltip';
        this.tooltipElement.textContent = text;

        // 计算单元格上方位置
        const targetCell = (event.target as HTMLElement).closest('td');
        let left: number;
        let top: number;

        if (targetCell) {
            const cellRect = targetCell.getBoundingClientRect();
            left = cellRect.left + cellRect.width / 2 - 100; // 100是估算的工具提示宽度的一半
            top = cellRect.top - 50; // 显示在单元格上方

            // 如果上方空间不足，显示在下方
            if (top < 10) {
                top = cellRect.bottom + 10;
            }

            //console.log(`备用方法使用单元格上方: (${left}, ${top})`);
        } else {
            left = event.clientX - 100;
            top = event.clientY - 50; // 显示在鼠标上方
            //console.log(`备用方法使用鼠标上方: (${left}, ${top})`);
        }

        // 使用最简单的样式
        Object.assign(this.tooltipElement.style, {
            position: 'fixed',
            zIndex: '999999',
            background: '#333333',
            color: '#ffffff',
            padding: '8px 12px',
            borderRadius: '6px',
            fontSize: '12px',
            fontFamily: 'Arial, sans-serif',
            lineHeight: '1.5',
            border: '1px solid #666666',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            pointerEvents: 'none',
            maxWidth: '300px',
            minWidth: '120px',
            wordWrap: 'break-word',
            wordBreak: 'break-word',
            whiteSpace: 'pre-wrap',
            left: left + 'px',
            top: top + 'px'
        });

        document.body.appendChild(this.tooltipElement);
        this.fallbackMode = true;

        //console.log('备用工具提示已显示');
    }

    /**
     * 隐藏工具提示
     */
    hideTooltip(): void {
        if (!this.currentTooltip || !this.tooltipElement) return;

        //console.log('🫥 隐藏工具提示');

        if (this.fallbackMode) {
            // 备用模式直接移除
            if (this.tooltipElement.parentNode) {
                this.tooltipElement.parentNode.removeChild(this.tooltipElement);
            }
            this.fallbackMode = false;
        } else {
            // 正常模式使用动画
            this.tooltipElement.style.opacity = '0';
            this.tooltipElement.style.transform = 'translateY(-5px) scale(0.95)';

            // 延迟隐藏元素
            setTimeout(() => {
                if (this.tooltipElement) {
                    this.tooltipElement.style.display = 'none';
                }
            }, 150);
        }

        // 恢复鼠标样式
        if (this.currentTooltip.event && this.currentTooltip.event.target) {
            (this.currentTooltip.event.target as HTMLElement).style.cursor = '';
        }

        this.currentTooltip = null;
    }

    /**
     * 计算工具提示位置 - 显示在单元格内容上方
     */
    calculateTooltipPosition(event: MouseEvent): TooltipPosition {
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        const tooltipMaxWidth = this.options.maxWidth || 300;
        const estimatedHeight = 60; // 估算多行高度
        const offset = 8; // 与单元格的间距

        // 获取目标单元格的位置信息
        const targetCell = (event.target as HTMLElement).closest('td');
        if (targetCell) {
            const cellRect = targetCell.getBoundingClientRect();

            // 计算单元格水平中心位置
            const cellCenterX = cellRect.left + cellRect.width / 2;

            // 工具提示水平居中对齐单元格，垂直显示在单元格上方
            let x = cellCenterX - tooltipMaxWidth / 2;
            let y = cellRect.top - estimatedHeight - offset;

            // 防止超出左边界
            if (x < 10) {
                x = 10;
            }

            // 防止超出右边界
            if (x + tooltipMaxWidth > windowWidth - 10) {
                x = windowWidth - tooltipMaxWidth - 10;
            }

            // 如果上方空间不足，显示在单元格下方
            if (y < 10) {
                y = cellRect.bottom + offset;
                //console.log(`上方空间不足，显示在单元格下方: y=${y}`);
            }

            // 如果下方也超出边界，显示在单元格右侧
            if (y + estimatedHeight > windowHeight - 10) {
                x = cellRect.right + offset;
                y = cellRect.top + (cellRect.height - estimatedHeight) / 2;
                //console.log(`下方也超出，显示在单元格右侧: x=${x}, y=${y}`);

                // 如果右侧也超出，显示在左侧
                if (x + tooltipMaxWidth > windowWidth - 10) {
                    x = cellRect.left - tooltipMaxWidth - offset;
                    //console.log(`右侧也超出，显示在单元格左侧: x=${x}`);
                }
            }

            return { x, y };
        } else {
            // 备用方案：使用鼠标位置上方
            const mouseX = event.clientX;
            const mouseY = event.clientY;

            let x = mouseX - tooltipMaxWidth / 2;
            let y = mouseY - estimatedHeight - offset;

            // 边界检查
            if (x < 10) x = 10;
            if (x + tooltipMaxWidth > windowWidth - 10) x = windowWidth - tooltipMaxWidth - 10;
            if (y < 10) y = mouseY + offset; // 显示在鼠标下方
            if (y + estimatedHeight > windowHeight - 10) y = windowHeight - estimatedHeight - 10;

            return { x, y };
        }
    }

    /**
     * 根据实际尺寸计算工具提示位置
     */
    calculateTooltipPositionWithSize(event: MouseEvent, actualWidth: number, actualHeight: number): TooltipPosition {
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        const offset = 8; // 与单元格的间距

        // 获取目标单元格的位置信息
        const targetCell = (event.target as HTMLElement).closest('td');
        if (targetCell) {
            const cellRect = targetCell.getBoundingClientRect();

            // 计算单元格水平中心位置
            const cellCenterX = cellRect.left + cellRect.width / 2;

            // 工具提示水平居中对齐单元格，垂直显示在单元格上方
            let x = cellCenterX - actualWidth / 2;
            let y = cellRect.top - actualHeight - offset;

            // 防止超出左边界
            if (x < 10) {
                x = 10;
            }

            // 防止超出右边界
            if (x + actualWidth > windowWidth - 10) {
                x = windowWidth - actualWidth - 10;
            }

            // 如果上方空间不足，显示在单元格下方
            if (y < 10) {
                y = cellRect.bottom + offset;
                //console.log(`上方空间不足，显示在单元格下方: y=${y}`);
            }

            // 如果下方也超出边界，显示在单元格右侧
            if (y + actualHeight > windowHeight - 10) {
                x = cellRect.right + offset;
                y = cellRect.top + (cellRect.height - actualHeight) / 2;
                //console.log(`下方也超出，显示在单元格右侧: x=${x}, y=${y}`);

                // 如果右侧也超出，显示在左侧
                if (x + actualWidth > windowWidth - 10) {
                    x = cellRect.left - actualWidth - offset;
                    //console.log(`右侧也超出，显示在单元格左侧: x=${x}`);
                }
            }

            return { x, y };
        } else {
            // 备用方案：使用鼠标位置上方
            const mouseX = event.clientX;
            const mouseY = event.clientY;

            let x = mouseX - actualWidth / 2;
            let y = mouseY - actualHeight - offset;

            // 边界检查
            if (x < 10) x = 10;
            if (x + actualWidth > windowWidth - 10) x = windowWidth - actualWidth - 10;
            if (y < 10) y = mouseY + offset; // 显示在鼠标下方
            if (y + actualHeight > windowHeight - 10) y = windowHeight - actualHeight - 10;

            return { x, y };
        }
    }

    /**
     * 清除所有定时器
     */
    clearTimers(): void {
        if (this.showTimer) {
            clearTimeout(this.showTimer);
            this.showTimer = null;
        }

        if (this.hideTimer) {
            clearTimeout(this.hideTimer);
            this.hideTimer = null;
        }
    }

    /**
     * 启用工具提示
     */
    enable(): void {
        this.isEnabled = true;
        //console.log('工具提示引擎已启用');
    }

    /**
     * 禁用工具提示
     */
    disable(): void {
        this.isEnabled = false;
        this.hideTooltip();
        this.clearTimers();
        //console.log('工具提示引擎已禁用');
    }

    /**
     * 清理资源
     */
    cleanup(): void {
        this.disable();

        // 移除DOM元素
        if (this.tooltipElement && this.tooltipElement.parentNode) {
            this.tooltipElement.parentNode.removeChild(this.tooltipElement);
        }

        // 清理缓存
        this.rulesCache.clear();

        //console.log('工具提示引擎已清理');
    }

    /**
     * 重新加载规则缓存
     */
    async reloadRules(): Promise<void> {
        this.rulesCache.clear();
        if (this.settings) {
            try {
                const rulesPath = this.settings.tooltip_rules_path || 'tooltip_rules';
                await invoke('get_all_tooltip_rules', { rulesPath });
                //console.log('工具提示规则已重新加载');
            } catch (error) {
                console.error('重新加载规则失败:', error);
            }
        }
    }
}
