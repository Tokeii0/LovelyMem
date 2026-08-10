/**
 * CSV工具提示规则管理器
 * 负责管理工具提示规则的创建、编辑和删除
 */

// Tauri API导入
const { invoke } = (window as any).__TAURI__.core;

/** 规则匹配类型 */
interface RuleType {
    type: 'exact' | 'range' | 'regex';
    value?: string;
    min?: number;
    max?: number;
    pattern?: string;
}

/** 单条匹配规则 */
interface TooltipRule {
    rule_type: RuleType;
    tooltip: string;
    enabled: boolean;
    created_at: string;
    updated_at: string;
}

/** 某一列的工具提示规则集合 */
interface ColumnTooltipRules {
    column_name: string;
    rules: TooltipRule[];
    enabled: boolean;
    created_at: string;
    updated_at: string;
}

/** 应用设置（本模块用到的字段） */
interface RuleManagerSettings {
    tooltip_rules_path?: string;
}

export class CSVTooltipRuleManager {
    private settings: RuleManagerSettings | null;
    private currentRules: Map<string, ColumnTooltipRules>;
    private isVisible: boolean;
    private managerElement!: HTMLDivElement;
    private rulesListElement!: HTMLDivElement;

    constructor() {
        this.settings = null;
        this.currentRules = new Map();
        this.isVisible = false;

        // 创建管理界面
        this.createManagerUI();

        console.log('工具提示规则管理器初始化完成');
    }

    /**
     * 创建管理界面
     */
    createManagerUI(): void {
        // 创建主容器
        this.managerElement = document.createElement('div');
        this.managerElement.className = 'tooltip-rule-manager';
        this.managerElement.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.6);
            backdrop-filter: blur(8px);
            z-index: 10001;
            display: none;
            align-items: center;
            justify-content: center;
        `;

        // 创建内容容器
        const contentElement = document.createElement('div');
        contentElement.className = 'tooltip-rule-manager-content';
        contentElement.style.cssText = `
            background: var(--bg-primary);
            border: 1px solid var(--border-color);
            border-radius: 16px;
            width: 90%;
            max-width: 800px;
            max-height: 80vh;
            overflow: hidden;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            animation: scaleIn 0.3s ease-out;
        `;

        // 创建标题栏
        const headerElement = document.createElement('div');
        headerElement.className = 'tooltip-rule-manager-header';
        headerElement.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 20px;
            border-bottom: 1px solid var(--border-color);
            background: linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-tertiary) 100%);
        `;

        const titleElement = document.createElement('h3');
        titleElement.textContent = '工具提示规则管理';
        titleElement.style.cssText = `
            margin: 0;
            font-size: 18px;
            font-weight: 600;
            color: var(--text-primary);
        `;

        const closeButton = document.createElement('button');
        closeButton.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
        closeButton.className = 'tooltip-rule-manager-close';
        closeButton.style.cssText = `
            background: rgba(220, 53, 69, 0.1);
            border: 1px solid rgba(220, 53, 69, 0.2);
            color: var(--error-color);
            width: 32px;
            height: 32px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 16px;
            font-weight: bold;
            transition: all 0.2s ease;
        `;

        closeButton.addEventListener('click', () => this.hide());

        headerElement.appendChild(titleElement);
        headerElement.appendChild(closeButton);

        // 创建主体内容
        const bodyElement = document.createElement('div');
        bodyElement.className = 'tooltip-rule-manager-body';
        bodyElement.style.cssText = `
            padding: 20px;
            max-height: 60vh;
            overflow-y: auto;
        `;

        // 创建工具栏
        const toolbarElement = document.createElement('div');
        toolbarElement.className = 'tooltip-rule-toolbar';
        toolbarElement.style.cssText = `
            display: flex;
            gap: 12px;
            margin-bottom: 20px;
            padding: 12px;
            background: var(--bg-secondary);
            border-radius: 8px;
            border: 1px solid var(--border-color);
        `;

        const addButton = document.createElement('button');
        addButton.textContent = '添加规则';
        addButton.className = 'tooltip-rule-add-btn';
        addButton.style.cssText = `
            padding: 8px 16px;
            background: var(--primary-color);
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.2s ease;
        `;

        addButton.addEventListener('click', () => this.showAddRuleDialog());

        const refreshButton = document.createElement('button');
        refreshButton.textContent = '刷新';
        refreshButton.className = 'tooltip-rule-refresh-btn';
        refreshButton.style.cssText = `
            padding: 8px 16px;
            background: var(--bg-primary);
            color: var(--text-primary);
            border: 1px solid var(--border-color);
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.2s ease;
        `;

        refreshButton.addEventListener('click', () => this.loadRules());

        toolbarElement.appendChild(addButton);
        toolbarElement.appendChild(refreshButton);

        // 创建规则列表容器
        this.rulesListElement = document.createElement('div');
        this.rulesListElement.className = 'tooltip-rules-list';
        this.rulesListElement.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 12px;
        `;

        // 组装界面
        bodyElement.appendChild(toolbarElement);
        bodyElement.appendChild(this.rulesListElement);

        contentElement.appendChild(headerElement);
        contentElement.appendChild(bodyElement);

        this.managerElement.appendChild(contentElement);
        document.body.appendChild(this.managerElement);

        // 绑定事件
        this.bindEvents();
    }

    /**
     * 绑定事件
     */
    bindEvents(): void {
        // 点击背景关闭
        this.managerElement.addEventListener('click', (e: MouseEvent) => {
            if (e.target === this.managerElement) {
                this.hide();
            }
        });

        // ESC键关闭
        document.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Escape' && this.isVisible) {
                this.hide();
            }
        });
    }

    /**
     * 显示管理器
     */
    async show(): Promise<void> {
        if (this.isVisible) return;

        this.isVisible = true;
        this.managerElement.style.display = 'flex';

        // 加载设置和规则
        await this.loadSettings();
        await this.loadRules();

        // 添加动画类
        requestAnimationFrame(() => {
            this.managerElement.style.opacity = '1';
        });

        console.log('工具提示规则管理器已显示');
    }

    /**
     * 隐藏管理器
     */
    hide(): void {
        if (!this.isVisible) return;

        this.isVisible = false;
        this.managerElement.style.opacity = '0';

        setTimeout(() => {
            this.managerElement.style.display = 'none';
        }, 300);

        console.log('工具提示规则管理器已隐藏');
    }

    /**
     * 加载应用设置
     */
    async loadSettings(): Promise<void> {
        try {
            this.settings = await invoke('load_settings_command') as RuleManagerSettings;
            console.log('规则管理器设置已加载');
        } catch (error) {
            console.error('加载设置失败:', error);
            this.settings = { tooltip_rules_path: 'tooltip_rules' };
        }
    }

    /**
     * 加载所有规则
     */
    async loadRules(): Promise<void> {
        try {
            if (!this.settings) {
                await this.loadSettings();
            }

            const rulesPath = this.settings!.tooltip_rules_path || 'tooltip_rules';
            const allRules = await invoke('get_all_tooltip_rules', { rulesPath }) as ColumnTooltipRules[];

            // 更新规则缓存
            this.currentRules.clear();
            allRules.forEach(rule => {
                this.currentRules.set(rule.column_name, rule);
            });

            // 渲染规则列表
            this.renderRulesList();

            console.log(`已加载 ${allRules.length} 个规则`);
        } catch (error) {
            console.error('加载规则失败:', error);
            this.showError('加载规则失败: ' + (error as Error).message);
        }
    }

    /**
     * 渲染规则列表
     */
    renderRulesList(): void {
        // 清空现有内容
        this.rulesListElement.innerHTML = '';

        if (this.currentRules.size === 0) {
            const emptyElement = document.createElement('div');
            emptyElement.className = 'tooltip-rules-empty';
            emptyElement.style.cssText = `
                text-align: center;
                padding: 40px;
                color: var(--text-secondary);
                font-size: 16px;
            `;
            emptyElement.innerHTML = `
                <div style="font-size: 48px; margin-bottom: 16px;"><svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></div>
                <div>暂无工具提示规则</div>
                <div style="font-size: 14px; margin-top: 8px;">点击"添加规则"开始创建</div>
            `;
            this.rulesListElement.appendChild(emptyElement);
            return;
        }

        // 渲染每个规则
        this.currentRules.forEach((rules) => {
            const ruleElement = this.createRuleElement(rules);
            this.rulesListElement.appendChild(ruleElement);
        });
    }

    /**
     * 创建规则元素
     */
    createRuleElement(rules: ColumnTooltipRules): HTMLElement {
        const element = document.createElement('div');
        element.className = 'tooltip-rule-item';
        element.style.cssText = `
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 16px;
            background: var(--bg-primary);
            transition: all 0.2s ease;
        `;

        // 规则头部
        const headerElement = document.createElement('div');
        headerElement.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
        `;

        const titleElement = document.createElement('h4');
        titleElement.textContent = `列: ${rules.column_name}`;
        titleElement.style.cssText = `
            margin: 0;
            font-size: 16px;
            font-weight: 600;
            color: var(--text-primary);
        `;

        const actionsElement = document.createElement('div');
        actionsElement.style.cssText = `
            display: flex;
            gap: 8px;
        `;

        const editButton = document.createElement('button');
        editButton.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
        editButton.title = '编辑规则';
        editButton.style.cssText = `
            padding: 4px 8px;
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        `;

        const deleteButton = document.createElement('button');
        deleteButton.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
        deleteButton.title = '删除规则';
        deleteButton.style.cssText = `
            padding: 4px 8px;
            background: rgba(220, 53, 69, 0.1);
            border: 1px solid rgba(220, 53, 69, 0.2);
            color: var(--error-color);
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        `;

        editButton.addEventListener('click', () => this.editRule(rules));
        deleteButton.addEventListener('click', () => this.deleteRule(rules.column_name));

        actionsElement.appendChild(editButton);
        actionsElement.appendChild(deleteButton);

        headerElement.appendChild(titleElement);
        headerElement.appendChild(actionsElement);

        // 规则详情
        const detailsElement = document.createElement('div');
        detailsElement.style.cssText = `
            font-size: 14px;
            color: var(--text-secondary);
        `;

        detailsElement.innerHTML = `
            <div><strong>状态:</strong> ${rules.enabled ? '启用' : '禁用'}</div>
            <div><strong>规则数量:</strong> ${rules.rules.length}</div>
            <div><strong>创建时间:</strong> ${new Date(rules.created_at).toLocaleString()}</div>
        `;

        element.appendChild(headerElement);
        element.appendChild(detailsElement);

        return element;
    }

    /**
     * 显示错误信息
     */
    showError(message: string): void {
        // 简单的错误提示，可以后续改进
        alert('错误: ' + message);
    }

    /**
     * 显示添加规则对话框
     */
    showAddRuleDialog(): void {
        this.showRuleDialog(null);
    }

    /**
     * 编辑规则
     */
    editRule(rules: ColumnTooltipRules): void {
        this.showRuleDialog(rules);
    }

    /**
     * 删除规则
     */
    async deleteRule(columnName: string): Promise<void> {
        if (!confirm(`确定要删除列 "${columnName}" 的工具提示规则吗？`)) {
            return;
        }

        try {
            const rulesPath = this.settings!.tooltip_rules_path || 'tooltip_rules';
            await invoke('delete_tooltip_rules', { columnName, rulesPath });

            // 重新加载规则
            await this.loadRules();

            console.log(`已删除列 "${columnName}" 的规则`);
        } catch (error) {
            console.error('删除规则失败:', error);
            this.showError('删除规则失败: ' + (error as Error).message);
        }
    }

    /**
     * 清理资源
     */
    cleanup(): void {
        if (this.managerElement && this.managerElement.parentNode) {
            this.managerElement.parentNode.removeChild(this.managerElement);
        }

        this.currentRules.clear();
        this.isVisible = false;

        console.log('工具提示规则管理器已清理');
    }

    /**
     * 显示规则编辑对话框
     */
    showRuleDialog(existingRules: ColumnTooltipRules | null = null): void {
        const isEdit = existingRules !== null;
        const title = isEdit ? '编辑工具提示规则' : '添加工具提示规则';

        // 创建对话框容器
        const dialogElement = document.createElement('div');
        dialogElement.className = 'tooltip-rule-dialog';
        dialogElement.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            backdrop-filter: blur(10px);
            z-index: 10002;
            display: flex;
            align-items: center;
            justify-content: center;
        `;

        // 创建对话框内容
        const contentElement = document.createElement('div');
        contentElement.className = 'tooltip-rule-dialog-content';
        contentElement.style.cssText = `
            background: var(--bg-primary);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            width: 90%;
            max-width: 600px;
            max-height: 80vh;
            overflow: hidden;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
        `;

        // 创建表单HTML
        contentElement.innerHTML = `
            <div class="dialog-header" style="
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 20px;
                border-bottom: 1px solid var(--border-color);
                background: linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-tertiary) 100%);
            ">
                <h3 style="margin: 0; font-size: 18px; font-weight: 600; color: var(--text-primary);">
                    ${title}
                </h3>
                <button class="dialog-close-btn" style="
                    background: rgba(220, 53, 69, 0.1);
                    border: 1px solid rgba(220, 53, 69, 0.2);
                    color: var(--error-color);
                    width: 32px;
                    height: 32px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 16px;
                    font-weight: bold;
                "><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
            </div>

            <div class="dialog-body" style="
                padding: 20px;
                max-height: 60vh;
                overflow-y: auto;
            ">
                <form class="rule-form">
                    <div class="form-group" style="margin-bottom: 20px;">
                        <label style="
                            display: block;
                            margin-bottom: 8px;
                            font-weight: 600;
                            color: var(--text-primary);
                        ">列名:</label>
                        <input type="text" name="columnName" placeholder="例如: SrcPort, DstPort, ProcessName"
                               value="${isEdit ? existingRules!.column_name : ''}"
                               style="
                            width: 100%;
                            padding: 10px 12px;
                            border: 1px solid var(--border-color);
                            border-radius: 6px;
                            background: var(--bg-primary);
                            color: var(--text-primary);
                            font-size: 14px;
                            box-sizing: border-box;
                        ">
                        ${isEdit ? `<div style="
                            font-size: 12px;
                            color: var(--text-secondary);
                            margin-top: 4px;
                        ">提示：修改列名将创建新规则，原规则将被删除</div>` : ''}
                    </div>

                    <div class="form-group" style="margin-bottom: 20px;">
                        <label style="
                            display: block;
                            margin-bottom: 8px;
                            font-weight: 600;
                            color: var(--text-primary);
                        ">规则状态:</label>
                        <label style="display: flex; align-items: center; cursor: pointer;">
                            <input type="checkbox" name="enabled" ${isEdit && existingRules!.enabled ? 'checked' : (!isEdit ? 'checked' : '')}
                                   style="margin-right: 8px;">
                            <span style="color: var(--text-primary);">启用此规则</span>
                        </label>
                    </div>

                    <div class="rules-section">
                        <div style="
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            margin-bottom: 15px;
                        ">
                            <h4 style="
                                margin: 0;
                                font-size: 16px;
                                font-weight: 600;
                                color: var(--text-primary);
                            ">匹配规则</h4>
                            <button type="button" class="add-rule-btn" style="
                                padding: 6px 12px;
                                background: var(--primary-color);
                                color: white;
                                border: none;
                                border-radius: 4px;
                                cursor: pointer;
                                font-size: 12px;
                            ">+ 添加规则</button>
                        </div>

                        <div class="rules-list">
                            <!-- 规则项将在这里动态添加 -->
                        </div>
                    </div>
                </form>
            </div>

            <div class="dialog-footer" style="
                display: flex;
                justify-content: flex-end;
                gap: 12px;
                padding: 20px;
                border-top: 1px solid var(--border-color);
                background: var(--bg-secondary);
            ">
                <button class="dialog-cancel-btn" style="
                    padding: 10px 20px;
                    background: var(--bg-primary);
                    color: var(--text-primary);
                    border: 1px solid var(--border-color);
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 14px;
                ">取消</button>
                <button class="dialog-save-btn" style="
                    padding: 10px 20px;
                    background: var(--primary-color);
                    color: white;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 500;
                ">保存</button>
            </div>
        `;

        dialogElement.appendChild(contentElement);
        document.body.appendChild(dialogElement);

        // 初始化规则列表
        const rulesListElement = contentElement.querySelector('.rules-list') as HTMLElement;
        const addRuleBtn = contentElement.querySelector('.add-rule-btn') as HTMLButtonElement;

        // 如果是编辑模式，加载现有规则
        if (isEdit && existingRules!.rules) {
            existingRules!.rules.forEach(rule => {
                this.addRuleItem(rulesListElement, rule);
            });
        } else {
            // 添加一个空规则项
            this.addRuleItem(rulesListElement);
        }

        // 绑定事件
        addRuleBtn.addEventListener('click', () => {
            this.addRuleItem(rulesListElement);
        });

        // 关闭按钮事件
        const closeBtn = contentElement.querySelector('.dialog-close-btn') as HTMLButtonElement;
        const cancelBtn = contentElement.querySelector('.dialog-cancel-btn') as HTMLButtonElement;

        const closeDialog = () => {
            document.body.removeChild(dialogElement);
        };

        closeBtn.addEventListener('click', closeDialog);
        cancelBtn.addEventListener('click', closeDialog);

        // 点击背景关闭
        dialogElement.addEventListener('click', (e: MouseEvent) => {
            if (e.target === dialogElement) {
                closeDialog();
            }
        });

        // 在对话框元素上保存原始列名（用于编辑模式）
        if (isEdit && existingRules) {
            contentElement.setAttribute('data-original-column-name', existingRules.column_name);
        }

        // 保存按钮事件
        const saveBtn = contentElement.querySelector('.dialog-save-btn') as HTMLButtonElement;
        saveBtn.addEventListener('click', async () => {
            try {
                await this.saveRuleFromDialog(contentElement, isEdit);
                closeDialog();
                await this.loadRules(); // 重新加载规则列表
            } catch (error) {
                this.showError('保存规则失败: ' + (error as Error).message);
            }
        });

        // ESC键关闭
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                closeDialog();
                document.removeEventListener('keydown', handleKeyDown);
            }
        };
        document.addEventListener('keydown', handleKeyDown);
    }

    /**
     * 添加规则项到列表
     */
    addRuleItem(container: HTMLElement, existingRule: TooltipRule | null = null): void {
        const ruleItem = document.createElement('div');
        ruleItem.className = 'rule-item';
        ruleItem.style.cssText = `
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 15px;
            background: var(--bg-secondary);
        `;

        const ruleType = existingRule ? existingRule.rule_type.type : 'exact';
        const ruleValue = existingRule ? (
            existingRule.rule_type.value ||
            (existingRule.rule_type.min !== undefined ? `${existingRule.rule_type.min}-${existingRule.rule_type.max}` : '') ||
            existingRule.rule_type.pattern || ''
        ) : '';
        const tooltip = existingRule ? existingRule.tooltip : '';
        const enabled = existingRule ? existingRule.enabled : true;

        ruleItem.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px;">
                <h5 style="margin: 0; font-size: 14px; font-weight: 600; color: var(--text-primary);">
                    规则项
                </h5>
                <button type="button" class="remove-rule-btn" style="
                    background: rgba(220, 53, 69, 0.1);
                    border: 1px solid rgba(220, 53, 69, 0.2);
                    color: var(--error-color);
                    width: 24px;
                    height: 24px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 12px;
                ">×</button>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 15px; margin-bottom: 15px;">
                <div>
                    <label style="display: block; margin-bottom: 5px; font-size: 13px; font-weight: 500; color: var(--text-primary);">
                        匹配类型:
                    </label>
                    <select name="ruleType" style="
                        width: 100%;
                        padding: 8px;
                        border: 1px solid var(--border-color);
                        border-radius: 4px;
                        background: var(--bg-primary);
                        color: var(--text-primary);
                        font-size: 13px;
                    ">
                        <option value="exact" ${ruleType === 'exact' ? 'selected' : ''}>精确匹配</option>
                        <option value="range" ${ruleType === 'range' ? 'selected' : ''}>数值范围</option>
                        <option value="regex" ${ruleType === 'regex' ? 'selected' : ''}>正则表达式</option>
                    </select>
                </div>

                <div>
                    <label style="display: block; margin-bottom: 5px; font-size: 13px; font-weight: 500; color: var(--text-primary);">
                        匹配值:
                    </label>
                    <input type="text" name="ruleValue" placeholder="输入匹配值" value="${ruleValue}"
                           style="
                        width: 100%;
                        padding: 8px;
                        border: 1px solid var(--border-color);
                        border-radius: 4px;
                        background: var(--bg-primary);
                        color: var(--text-primary);
                        font-size: 13px;
                        box-sizing: border-box;
                    ">
                    <div class="rule-hint" style="
                        font-size: 11px;
                        color: var(--text-secondary);
                        margin-top: 4px;
                    ">
                        精确匹配: 输入具体值 | 数值范围: 格式 min-max | 正则: 输入正则表达式
                    </div>
                </div>
            </div>

            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-size: 13px; font-weight: 500; color: var(--text-primary);">
                    工具提示内容:
                </label>
                <input type="text" name="tooltip" placeholder="输入要显示的提示内容" value="${tooltip}"
                       style="
                    width: 100%;
                    padding: 8px;
                    border: 1px solid var(--border-color);
                    border-radius: 4px;
                    background: var(--bg-primary);
                    color: var(--text-primary);
                    font-size: 13px;
                    box-sizing: border-box;
                ">
            </div>

            <div>
                <label style="display: flex; align-items: center; cursor: pointer; font-size: 13px;">
                    <input type="checkbox" name="ruleEnabled" ${enabled ? 'checked' : ''}
                           style="margin-right: 8px;">
                    <span style="color: var(--text-primary);">启用此规则项</span>
                </label>
            </div>
        `;

        // 绑定删除按钮事件
        const removeBtn = ruleItem.querySelector('.remove-rule-btn') as HTMLButtonElement;
        removeBtn.addEventListener('click', () => {
            container.removeChild(ruleItem);
        });

        // 绑定规则类型变化事件，更新提示文本
        const ruleTypeSelect = ruleItem.querySelector('select[name="ruleType"]') as HTMLSelectElement;
        const ruleHint = ruleItem.querySelector('.rule-hint') as HTMLElement;

        ruleTypeSelect.addEventListener('change', () => {
            const type = ruleTypeSelect.value;
            switch (type) {
                case 'exact':
                    ruleHint.textContent = '精确匹配: 输入具体值，如 "80", "443", "svchost.exe"';
                    break;
                case 'range':
                    ruleHint.textContent = '数值范围: 格式 min-max，如 "1024-65535"';
                    break;
                case 'regex':
                    ruleHint.textContent = '正则表达式: 输入正则表达式，如 ".*\\.exe$"';
                    break;
            }
        });

        container.appendChild(ruleItem);
    }

    /**
     * 从对话框保存规则
     */
    async saveRuleFromDialog(dialogElement: HTMLElement, isEdit: boolean): Promise<void> {
        const form = dialogElement.querySelector('.rule-form') as HTMLFormElement;

        // 获取基本信息
        const columnName = (form.querySelector('input[name="columnName"]') as HTMLInputElement).value.trim();
        const enabled = (form.querySelector('input[name="enabled"]') as HTMLInputElement).checked;

        // 如果是编辑模式，获取原始列名
        const originalColumnName = isEdit ? dialogElement.getAttribute('data-original-column-name') : null;

        if (!columnName) {
            throw new Error('请输入列名');
        }

        // 收集所有规则项
        const ruleItems = dialogElement.querySelectorAll('.rule-item');
        const rules: TooltipRule[] = [];

        for (const item of Array.from(ruleItems)) {
            const ruleType = (item.querySelector('select[name="ruleType"]') as HTMLSelectElement).value;
            const ruleValue = (item.querySelector('input[name="ruleValue"]') as HTMLInputElement).value.trim();
            const tooltip = (item.querySelector('input[name="tooltip"]') as HTMLInputElement).value.trim();
            const ruleEnabled = (item.querySelector('input[name="ruleEnabled"]') as HTMLInputElement).checked;

            if (!ruleValue || !tooltip) {
                continue; // 跳过空规则
            }

            let ruleTypeObj: RuleType;

            switch (ruleType) {
                case 'exact':
                    ruleTypeObj = { type: 'exact', value: ruleValue };
                    break;
                case 'range': {
                    const rangeParts = ruleValue.split('-');
                    if (rangeParts.length !== 2) {
                        throw new Error(`规则值格式错误: "${ruleValue}"，范围格式应为 "min-max"`);
                    }
                    const min = parseFloat(rangeParts[0]);
                    const max = parseFloat(rangeParts[1]);
                    if (isNaN(min) || isNaN(max)) {
                        throw new Error(`规则值格式错误: "${ruleValue}"，范围值必须是数字`);
                    }
                    ruleTypeObj = { type: 'range', min, max };
                    break;
                }
                case 'regex':
                    // 验证正则表达式
                    try {
                        new RegExp(ruleValue);
                    } catch (e) {
                        throw new Error(`正则表达式格式错误: "${ruleValue}"`);
                    }
                    ruleTypeObj = { type: 'regex', pattern: ruleValue };
                    break;
                default:
                    throw new Error(`未知的规则类型: ${ruleType}`);
            }

            rules.push({
                rule_type: ruleTypeObj,
                tooltip: tooltip,
                enabled: ruleEnabled,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });
        }

        if (rules.length === 0) {
            throw new Error('请至少添加一个有效的规则项');
        }

        // 构建规则对象
        const columnRules: ColumnTooltipRules = {
            column_name: columnName,
            rules: rules,
            enabled: enabled,
            created_at: isEdit && originalColumnName ?
                (this.currentRules.get(originalColumnName)?.created_at || new Date().toISOString()) :
                new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        const rulesPath = this.settings!.tooltip_rules_path || 'tooltip_rules';

        // 如果是编辑模式且列名发生了变化，需要删除原规则
        if (isEdit && originalColumnName && originalColumnName !== columnName) {
            try {
                await invoke('delete_tooltip_rules', { columnName: originalColumnName, rulesPath });
                console.log(`已删除原列 "${originalColumnName}" 的规则`);
            } catch (error) {
                console.warn(`删除原规则失败: ${(error as Error).message}`);
            }
        }

        // 保存新规则
        await invoke('save_tooltip_rules', { rules: columnRules, rulesPath });

        if (isEdit && originalColumnName && originalColumnName !== columnName) {
            console.log(`已将列 "${originalColumnName}" 的规则重命名为 "${columnName}"`);
        } else {
            console.log(`已保存列 "${columnName}" 的规则`);
        }
    }
}
