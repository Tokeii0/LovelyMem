/**
 * 内嵌CSV工具提示规则管理器
 * 负责管理工具提示规则的创建、编辑和删除
 */

import { invoke } from '@tauri-apps/api/core';
import { MessageManager } from '../../utils/message';

// 规则类型定义
interface RuleType {
  type: 'exact' | 'range' | 'regex';
  value?: string;
  min?: number;
  max?: number;
  pattern?: string;
}

interface TooltipRule {
  rule_type: RuleType;
  tooltip: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface ColumnRules {
  column_name: string;
  rules: TooltipRule[];
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

// SVG 图标
const ICONS = {
  settings: '<svg viewBox="0 0 48 48" width="16" height="16" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M36.686 15.171a18.316 18.316 0 0 0-2.529-4.39l2.497-4.873-4.562-4.562-4.873 2.497a18.316 18.316 0 0 0-4.39-2.529L21.314 0h-6.628l-1.515 5.314a18.316 18.316 0 0 0-4.39 2.529L3.908 5.346-.654 9.908l2.497 4.873a18.316 18.316 0 0 0-2.529 4.39L-6 20.686v6.628l5.314 1.515c.618 1.57 1.48 3.04 2.529 4.39l-2.497 4.873 4.562 4.562 4.873-2.497c1.35 1.049 2.82 1.911 4.39 2.529L14.686 48h6.628l1.515-5.314a18.316 18.316 0 0 0 4.39-2.529l4.873 2.497 4.562-4.562-2.497-4.873a18.316 18.316 0 0 0 2.529-4.39L42 27.314v-6.628l-5.314-1.515z" transform="translate(6 0) scale(0.85)"/><circle cx="24" cy="24" r="6"/></svg>',
  add: '<svg viewBox="0 0 48 48" width="14" height="14" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"><path d="M24 8v32M8 24h32"/></svg>',
  refresh: '<svg viewBox="0 0 48 48" width="14" height="14" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M36.728 36.728A17.943 17.943 0 0 1 24 42c-9.941 0-18-8.059-18-18S14.059 6 24 6c4.97 0 9.47 2.015 12.728 5.272"/><path d="M36 6v12h12"/></svg>',
  edit: '<svg viewBox="0 0 48 48" width="14" height="14" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 42h36M25.799 9.929l5.657 5.657-16.97 16.97H8.828v-5.656z"/><path d="M31.456 15.586l4.95-4.95a4 4 0 0 0-5.657-5.657l-4.95 4.95"/></svg>',
  delete: '<svg viewBox="0 0 48 48" width="14" height="14" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 10v34a4 4 0 0 0 4 4h22a4 4 0 0 0 4-4V10M20 20v16M28 20v16M4 10h40M14 10l2-6h16l2 6"/></svg>',
  close: '<svg viewBox="0 0 48 48" width="16" height="16" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"><path d="M8 8l32 32M40 8L8 40"/></svg>'
};

export class EmbeddedCSVTooltipRuleManager {
  private settings: { tooltip_rules_path?: string } | null = null;
  private currentRules: Map<string, ColumnRules> = new Map();
  private isVisible: boolean = false;
  private managerElement: HTMLElement | null = null;
  private rulesListElement: HTMLElement | null = null;

  constructor() {
    this.createManagerUI();
    console.log('🔧 内嵌工具提示规则管理器初始化完成');
  }

  /**
   * 创建管理界面
   */
  private createManagerUI(): void {
    this.managerElement = document.createElement('div');
    this.managerElement.className = 'tooltip-rule-manager-overlay';
    this.managerElement.innerHTML = `
      <div class="tooltip-rule-manager-content">
        <div class="tooltip-rule-manager-header">
          <h3 class="tooltip-rule-manager-title">
            ${ICONS.settings}
            <span>工具提示规则管理</span>
          </h3>
          <button class="tooltip-rule-manager-close">${ICONS.close}</button>
        </div>
        
        <div class="tooltip-rule-manager-body">
          <div class="tooltip-rule-toolbar">
            <button class="tooltip-rule-add-btn">
              ${ICONS.add}
              <span>添加规则</span>
            </button>
            <button class="tooltip-rule-refresh-btn">
              ${ICONS.refresh}
              <span>刷新</span>
            </button>
          </div>
          
          <div class="tooltip-rules-list" id="tooltip-rules-list">
            <!-- 规则列表 -->
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(this.managerElement);
    this.rulesListElement = this.managerElement.querySelector('#tooltip-rules-list');
    this.bindEvents();
  }

  /**
   * 绑定事件
   */
  private bindEvents(): void {
    if (!this.managerElement) return;

    // 关闭按钮
    const closeBtn = this.managerElement.querySelector('.tooltip-rule-manager-close');
    closeBtn?.addEventListener('click', () => this.hide());

    // 点击背景关闭
    this.managerElement.addEventListener('click', (e) => {
      if (e.target === this.managerElement) {
        this.hide();
      }
    });

    // 添加规则按钮
    const addBtn = this.managerElement.querySelector('.tooltip-rule-add-btn');
    addBtn?.addEventListener('click', () => this.showRuleDialog(null));

    // 刷新按钮
    const refreshBtn = this.managerElement.querySelector('.tooltip-rule-refresh-btn');
    refreshBtn?.addEventListener('click', () => this.loadRules());

    // ESC键关闭
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible) {
        this.hide();
      }
    });
  }

  /**
   * 显示管理器
   */
  async show(): Promise<void> {
    if (this.isVisible || !this.managerElement) return;

    this.isVisible = true;
    this.managerElement.style.display = 'flex';

    await this.loadSettings();
    await this.loadRules();

    requestAnimationFrame(() => {
      this.managerElement!.classList.add('visible');
    });

    console.log('📋 工具提示规则管理器已显示');
  }

  /**
   * 隐藏管理器
   */
  hide(): void {
    if (!this.isVisible || !this.managerElement) return;

    this.isVisible = false;
    this.managerElement.classList.remove('visible');

    setTimeout(() => {
      this.managerElement!.style.display = 'none';
    }, 200);

    console.log('📋 工具提示规则管理器已隐藏');
  }

  /**
   * 加载设置
   */
  private async loadSettings(): Promise<void> {
    try {
      this.settings = await invoke('load_settings_command') as { tooltip_rules_path?: string };
    } catch (error) {
      console.error('❌ 加载设置失败:', error);
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

      const rulesPath = this.settings?.tooltip_rules_path || 'tooltip_rules';
      const allRules = await invoke('get_all_tooltip_rules', { rulesPath }) as ColumnRules[];

      this.currentRules.clear();
      allRules.forEach(rule => {
        this.currentRules.set(rule.column_name, rule);
      });

      this.renderRulesList();
      console.log(`📋 已加载 ${allRules.length} 个规则`);
    } catch (error) {
      console.error('❌ 加载规则失败:', error);
      this.renderRulesList();
    }
  }

  /**
   * 渲染规则列表
   */
  private renderRulesList(): void {
    if (!this.rulesListElement) return;

    if (this.currentRules.size === 0) {
      this.rulesListElement.innerHTML = `
        <div class="tooltip-rules-empty">
          <div class="empty-icon">${ICONS.settings}</div>
          <div class="empty-title">暂无工具提示规则</div>
          <div class="empty-desc">点击"添加规则"开始创建</div>
        </div>
      `;
      return;
    }

    this.rulesListElement.innerHTML = Array.from(this.currentRules.values()).map(rules => `
      <div class="tooltip-rule-item" data-column="${rules.column_name}">
        <div class="tooltip-rule-item-header">
          <h4 class="tooltip-rule-item-title">列: ${rules.column_name}</h4>
          <div class="tooltip-rule-item-actions">
            <button class="tooltip-rule-edit-btn" title="编辑">${ICONS.edit}</button>
            <button class="tooltip-rule-delete-btn" title="删除">${ICONS.delete}</button>
          </div>
        </div>
        <div class="tooltip-rule-item-details">
          <span class="status ${rules.enabled ? 'enabled' : 'disabled'}">
            ${rules.enabled ? '已启用' : '已禁用'}
          </span>
          <span>规则数量: ${rules.rules.length}</span>
          <span>创建: ${new Date(rules.created_at).toLocaleDateString()}</span>
        </div>
      </div>
    `).join('');

    // 绑定编辑和删除按钮事件
    this.rulesListElement.querySelectorAll('.tooltip-rule-item').forEach(item => {
      const columnName = item.getAttribute('data-column');
      if (!columnName) return;

      item.querySelector('.tooltip-rule-edit-btn')?.addEventListener('click', () => {
        const rules = this.currentRules.get(columnName);
        if (rules) this.showRuleDialog(rules);
      });

      item.querySelector('.tooltip-rule-delete-btn')?.addEventListener('click', () => {
        this.deleteRule(columnName);
      });
    });
  }

  /**
   * 显示规则编辑对话框
   */
  private showRuleDialog(existingRules: ColumnRules | null): void {
    const isEdit = existingRules !== null;
    const title = isEdit ? '编辑工具提示规则' : '添加工具提示规则';

    const dialogElement = document.createElement('div');
    dialogElement.className = 'tooltip-rule-dialog-overlay';
    dialogElement.innerHTML = `
      <div class="tooltip-rule-dialog">
        <div class="tooltip-rule-dialog-header">
          <h3>${isEdit ? ICONS.edit : ICONS.add} ${title}</h3>
          <button class="dialog-close-btn">${ICONS.close}</button>
        </div>
        
        <div class="tooltip-rule-dialog-body">
          <form class="rule-form">
            <div class="form-group">
              <label>列名:</label>
              <input type="text" name="columnName" placeholder="例如: SrcPort, DstPort, ProcessName"
                     value="${isEdit ? existingRules!.column_name : ''}">
              ${isEdit ? '<div class="form-hint">修改列名将创建新规则，原规则将被删除</div>' : ''}
            </div>

            <div class="form-group">
              <label class="checkbox-label">
                <input type="checkbox" name="enabled" ${!isEdit || existingRules!.enabled ? 'checked' : ''}>
                <span>启用此规则</span>
              </label>
            </div>

            <div class="rules-section">
              <div class="rules-section-header">
                <h4>匹配规则</h4>
                <button type="button" class="add-rule-item-btn">${ICONS.add} 添加规则项</button>
              </div>
              <div class="rules-items-list"></div>
            </div>
          </form>
        </div>

        <div class="tooltip-rule-dialog-footer">
          <button class="dialog-cancel-btn">取消</button>
          <button class="dialog-save-btn">保存</button>
        </div>
      </div>
    `;

    document.body.appendChild(dialogElement);

    // 保存原始列名
    if (isEdit && existingRules) {
      dialogElement.setAttribute('data-original-column-name', existingRules.column_name);
    }

    const rulesItemsList = dialogElement.querySelector('.rules-items-list') as HTMLElement;
    const addRuleItemBtn = dialogElement.querySelector('.add-rule-item-btn');

    // 加载现有规则项或添加空规则项
    if (isEdit && existingRules?.rules) {
      existingRules.rules.forEach(rule => {
        this.addRuleItem(rulesItemsList, rule);
      });
    } else {
      this.addRuleItem(rulesItemsList);
    }

    // 绑定事件
    addRuleItemBtn?.addEventListener('click', () => this.addRuleItem(rulesItemsList));

    const closeDialog = () => dialogElement.remove();

    dialogElement.querySelector('.dialog-close-btn')?.addEventListener('click', closeDialog);
    dialogElement.querySelector('.dialog-cancel-btn')?.addEventListener('click', closeDialog);
    dialogElement.addEventListener('click', (e) => {
      if (e.target === dialogElement) closeDialog();
    });

    dialogElement.querySelector('.dialog-save-btn')?.addEventListener('click', async () => {
      try {
        await this.saveRuleFromDialog(dialogElement, isEdit);
        closeDialog();
        await this.loadRules();
      } catch (error) {
        MessageManager.showError('保存规则失败: ' + (error as Error).message);
      }
    });
  }

  /**
   * 添加规则项到列表
   */
  private addRuleItem(container: HTMLElement, existingRule?: TooltipRule): void {
    const ruleType = existingRule?.rule_type.type || 'exact';
    const ruleValue = existingRule ? (
      existingRule.rule_type.value ||
      (existingRule.rule_type.min !== undefined ? `${existingRule.rule_type.min}-${existingRule.rule_type.max}` : '') ||
      existingRule.rule_type.pattern || ''
    ) : '';
    const tooltip = existingRule?.tooltip || '';
    const enabled = existingRule?.enabled ?? true;

    const ruleItem = document.createElement('div');
    ruleItem.className = 'rule-item';
    ruleItem.innerHTML = `
      <div class="rule-item-header">
        <span>规则项</span>
        <button type="button" class="remove-rule-item-btn">${ICONS.close}</button>
      </div>
      
      <div class="rule-item-row">
        <div class="rule-item-field">
          <label>匹配类型:</label>
          <select name="ruleType">
            <option value="exact" ${ruleType === 'exact' ? 'selected' : ''}>精确匹配</option>
            <option value="range" ${ruleType === 'range' ? 'selected' : ''}>数值范围</option>
            <option value="regex" ${ruleType === 'regex' ? 'selected' : ''}>正则表达式</option>
          </select>
        </div>
        <div class="rule-item-field flex-2">
          <label>匹配值:</label>
          <input type="text" name="ruleValue" placeholder="输入匹配值" value="${ruleValue}">
          <div class="rule-hint">精确匹配: 具体值 | 范围: min-max | 正则: 正则表达式</div>
        </div>
      </div>
      
      <div class="rule-item-field">
        <label>工具提示内容:</label>
        <input type="text" name="tooltip" placeholder="输入要显示的提示内容" value="${tooltip}">
      </div>
      
      <label class="checkbox-label">
        <input type="checkbox" name="ruleEnabled" ${enabled ? 'checked' : ''}>
        <span>启用此规则项</span>
      </label>
    `;

    ruleItem.querySelector('.remove-rule-item-btn')?.addEventListener('click', () => {
      container.removeChild(ruleItem);
    });

    container.appendChild(ruleItem);
  }

  /**
   * 从对话框保存规则
   */
  private async saveRuleFromDialog(dialogElement: HTMLElement, isEdit: boolean): Promise<void> {
    const form = dialogElement.querySelector('.rule-form') as HTMLFormElement;

    const columnName = (form.querySelector('input[name="columnName"]') as HTMLInputElement).value.trim();
    const enabled = (form.querySelector('input[name="enabled"]') as HTMLInputElement).checked;
    const originalColumnName = isEdit ? dialogElement.getAttribute('data-original-column-name') : null;

    if (!columnName) {
      throw new Error('请输入列名');
    }

    const ruleItems = dialogElement.querySelectorAll('.rule-item');
    const rules: TooltipRule[] = [];

    ruleItems.forEach(item => {
      const ruleType = (item.querySelector('select[name="ruleType"]') as HTMLSelectElement).value;
      const ruleValue = (item.querySelector('input[name="ruleValue"]') as HTMLInputElement).value.trim();
      const tooltipText = (item.querySelector('input[name="tooltip"]') as HTMLInputElement).value.trim();
      const ruleEnabled = (item.querySelector('input[name="ruleEnabled"]') as HTMLInputElement).checked;

      if (!ruleValue || !tooltipText) return;

      let ruleTypeObj: RuleType;

      switch (ruleType) {
        case 'exact':
          ruleTypeObj = { type: 'exact', value: ruleValue };
          break;
        case 'range':
          const [min, max] = ruleValue.split('-').map(Number);
          if (isNaN(min) || isNaN(max)) {
            throw new Error(`范围格式错误: "${ruleValue}"，应为 "min-max"`);
          }
          ruleTypeObj = { type: 'range', min, max };
          break;
        case 'regex':
          try { new RegExp(ruleValue); } catch { throw new Error(`正则表达式格式错误: "${ruleValue}"`); }
          ruleTypeObj = { type: 'regex', pattern: ruleValue };
          break;
        default:
          throw new Error(`未知规则类型: ${ruleType}`);
      }

      rules.push({
        rule_type: ruleTypeObj,
        tooltip: tooltipText,
        enabled: ruleEnabled,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    });

    if (rules.length === 0) {
      throw new Error('请至少添加一个有效的规则项');
    }

    const columnRules: ColumnRules = {
      column_name: columnName,
      rules,
      enabled,
      created_at: isEdit && originalColumnName ?
        (this.currentRules.get(originalColumnName)?.created_at || new Date().toISOString()) :
        new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const rulesPath = this.settings?.tooltip_rules_path || 'tooltip_rules';

    // 如果列名改变，删除原规则
    if (isEdit && originalColumnName && originalColumnName !== columnName) {
      try {
        await invoke('delete_tooltip_rules', { columnName: originalColumnName, rulesPath });
      } catch (error) {
        console.warn('删除原规则失败:', error);
      }
    }

    await invoke('save_tooltip_rules', { rules: columnRules, rulesPath });
    console.log(`✅ 已保存列 "${columnName}" 的规则`);
  }

  /**
   * 删除规则
   */
  private async deleteRule(columnName: string): Promise<void> {
    const { showConfirm } = await import('../../core/confirmDialog');
    const confirmed = await showConfirm({
      message: `确定要删除列 "${columnName}" 的工具提示规则吗？`,
      type: 'danger',
      confirmText: '删除',
    });
    if (!confirmed) return;

    try {
      const rulesPath = this.settings?.tooltip_rules_path || 'tooltip_rules';
      await invoke('delete_tooltip_rules', { columnName, rulesPath });
      await this.loadRules();
      console.log(`✅ 已删除列 "${columnName}" 的规则`);
    } catch (error) {
      console.error('❌ 删除规则失败:', error);
      MessageManager.showError('删除规则失败: ' + (error as Error).message);
    }
  }

  /**
   * 清理资源
   */
  cleanup(): void {
    this.managerElement?.remove();
    this.currentRules.clear();
    this.isVisible = false;
  }
}
