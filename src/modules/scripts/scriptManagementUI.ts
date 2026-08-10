/**
 * 脚本管理UI组件
 * 提供脚本管理的用户界面
 */

import { scriptManager, PythonScript, ScriptExecutionResult, ScriptExecutionStatus } from './scriptManager';
import { MessageManager } from '../utils/message';
import { IconParkHelper } from '../utils/iconparkHelper';
import { translate } from '../../i18n';

function svgIcon(name: string, size: number = 14): string {
  return IconParkHelper.getSvgString(name, { size, strokeWidth: 3 });
}

export class ScriptManagementUI {
  private container: HTMLElement | null = null;
  private isVisible: boolean = false;
  private scripts: PythonScript[] = [];
  private scriptStatus: Map<string, ScriptExecutionStatus> = new Map();

  constructor() {
    this.initializeEventListeners();
  }

  /**
   * 初始化事件监听器
   */
  private initializeEventListeners(): void {
    // 监听脚本状态变化
    scriptManager.on('statusChanged', (status: ScriptExecutionStatus) => {
      this.scriptStatus.set(status.script_id, status);
      this.updateScriptStatusDisplay(status.script_id);
    });

    // 监听脚本执行完成
    scriptManager.on('executionCompleted', (result: ScriptExecutionResult) => {
      if (result.success) {
        MessageManager.showSuccess(`脚本执行完成: ${this.getScriptName(result.script_id)}`);
      } else {
        MessageManager.showError(`脚本执行失败: ${this.getScriptName(result.script_id)}`);
      }
      this.refreshScriptList();
    });

    // 监听自动执行完成
    scriptManager.on('autoExecutionCompleted', (results: ScriptExecutionResult[]) => {
      const successCount = results.filter(r => r.success).length;
      const totalCount = results.length;
      MessageManager.showSuccess(`自动脚本执行完成: ${successCount}/${totalCount} 成功`);
      this.refreshScriptList();
    });

    // 监听自动执行错误
    scriptManager.on('autoExecutionError', (error: string) => {
      MessageManager.showError(`自动脚本执行失败: ${error}`);
    });
  }

  /**
   * 渲染脚本管理界面
   */
  render(): string {
    return `
      <div class="script-management-window" id="script-management-window" style="display: none; opacity: 0;">
        <div class="script-window-header">
          <div class="script-window-title">
            <span class="script-icon">${svgIcon('code', 16)}</span>
            <h3>脚本管理</h3>
          </div>
          <div class="script-window-controls">
            <button class="window-control-btn minimize-btn" id="minimize-script-window" title="最小化">
              <span>−</span>
            </button>
            <button class="window-control-btn close-btn" id="close-script-window" title="关闭">
              <span>✕</span>
            </button>
          </div>
        </div>
        <div class="script-window-content">
          <div class="script-toolbar">
            <div class="script-actions">
              <button class="script-toolbar-btn add-script" id="add-script-btn" title="添加新脚本">
                <span>${svgIcon('plus', 14)}</span>
                <span>添加</span>
              </button>
              <button class="script-toolbar-btn scan-scripts" id="scan-scripts-btn" title="扫描scripts文件夹并导入脚本">
                <span>${svgIcon('search', 14)}</span>
                <span>扫描导入</span>
              </button>
              <button class="script-toolbar-btn execute-all" id="execute-all-scripts-btn" title="执行所有启用的脚本">
                <span>${svgIcon('play', 14)}</span>
                <span>执行全部</span>
              </button>
            </div>
          </div>
          <div class="script-list-container">
            <div class="script-list" id="script-list">
              <div class="script-list-empty" id="script-list-empty">
                <div class="empty-icon">${svgIcon('file-text', 32)}</div>
                <div class="empty-text">暂无脚本</div>
                <div class="empty-hint">点击"添加"按钮开始创建您的第一个Python脚本</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 初始化脚本管理界面
   */
  async initialize(container: HTMLElement): Promise<void> {
    console.log('🔧 初始化脚本管理界面...');

    // 更新容器引用
    this.container = container;

    // 重置状态
    this.isVisible = false;

    // 渲染界面
    container.innerHTML = this.render();

    // 加载脚本数据
    await this.loadScripts();

    // 绑定事件
    this.bindEvents();

    // 初始化时自动扫描scripts文件夹
    try {
      console.log('🔍 初始化时自动扫描scripts文件夹...');
      await scriptManager.scanAndImportScripts();
      await this.refreshScriptList();
      console.log('✅ 初始化扫描完成');
    } catch (error) {
      console.warn('⚠️ 初始化扫描scripts文件夹失败:', error);
      // 不显示错误消息，因为这是后台操作
    }

    console.log('✅ 脚本管理界面初始化完成');
  }

  /**
   * 绑定事件
   */
  private bindEvents(): void {
    if (!this.container) return;

    // 添加脚本按钮
    const addScriptBtn = this.container.querySelector('#add-script-btn');
    addScriptBtn?.addEventListener('click', () => this.showAddScriptDialog());

    // 扫描导入脚本按钮
    const scanScriptsBtn = this.container.querySelector('#scan-scripts-btn');
    scanScriptsBtn?.addEventListener('click', () => this.scanAndImportScripts());

    // 执行全部脚本按钮
    const executeAllBtn = this.container.querySelector('#execute-all-scripts-btn');
    executeAllBtn?.addEventListener('click', () => this.executeAllScripts());

    // 窗口控制按钮
    const minimizeBtn = this.container.querySelector('#minimize-script-window');
    minimizeBtn?.addEventListener('click', () => this.minimizeWindow());

    const closeBtn = this.container.querySelector('#close-script-window');
    closeBtn?.addEventListener('click', () => this.hideWindow());
  }

  /**
   * 加载脚本列表
   */
  private async loadScripts(): Promise<void> {
    try {
      this.scripts = await scriptManager.getScripts();
      await scriptManager.getAllScriptStatus();
      this.renderScriptList();
    } catch (error) {
      console.error('加载脚本列表失败:', error);
      MessageManager.showError('加载脚本列表失败');
    }
  }

  /**
   * 渲染脚本列表
   */
  private renderScriptList(): void {
    // 查找脚本窗口中的脚本列表容器
    const scriptWindow = document.querySelector('.script-management-window');
    if (!scriptWindow) return;

    const scriptList = scriptWindow.querySelector('#script-list');
    if (!scriptList) return;

    if (this.scripts.length === 0) {
      scriptList.innerHTML = `
        <div class="script-list-empty">
          <div class="empty-icon">${svgIcon('file-text', 32)}</div>
          <div class="empty-text">暂无脚本</div>
          <div class="empty-hint">点击"添加"按钮开始创建您的第一个Python脚本</div>
        </div>
      `;
      return;
    }

    const scriptsHtml = this.scripts.map(script => this.renderScriptItem(script)).join('');
    scriptList.innerHTML = scriptsHtml;

    // 绑定脚本项事件
    this.bindScriptItemEvents();
  }

  /**
   * 渲染单个脚本项
   */
  private renderScriptItem(script: PythonScript): string {
    const status = scriptManager.getLocalScriptStatus(script.id);
    const statusText = status ? scriptManager.formatScriptStatus(status) : '空闲';
    const statusClass = status ? `status-${status.status}` : 'status-idle';

    const lastExecuted = script.last_executed
      ? new Date(script.last_executed).toLocaleString('zh-CN')
      : '从未执行';

    const fileName = script.file_path.split(/[/\\]/).pop() || script.file_path;

    return `
      <div class="script-item ${script.enabled ? 'enabled' : 'disabled'}" data-script-id="${script.id}">
        <div class="script-item-main">
          <div class="script-info">
            <div class="script-name-row">
              <span class="script-name">${script.name}</span>
              <span class="status-indicator ${statusClass}" id="status-${script.id}">${statusText}</span>
            </div>
            <div class="script-description">${script.description || '无描述'}</div>
            <div class="script-file">${svgIcon('file-text', 12)} ${fileName}</div>
          </div>
          <div class="script-stats">
            <div class="stat-row">
              <span class="stat-label">执行次数:</span>
              <span class="stat-value">${script.execution_count}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">最后执行:</span>
              <span class="stat-value">${lastExecuted}</span>
            </div>
          </div>
        </div>
        <div class="script-actions">
          <button class="script-action-btn execute-btn" data-action="execute" data-script-id="${script.id}"
                  ${!script.enabled || (status && status.status === 'running') ? 'disabled' : ''}>
            <span>${svgIcon('play', 14)}</span>
          </button>
          <button class="script-action-btn edit-btn" data-action="edit" data-script-id="${script.id}">
            <span>${svgIcon('edit', 14)}</span>
          </button>
          <button class="script-action-btn toggle-btn" data-action="toggle" data-script-id="${script.id}">
            <span>${script.enabled ? svgIcon('pause', 14) : svgIcon('play', 14)}</span>
          </button>
          <button class="script-action-btn delete-btn" data-action="delete" data-script-id="${script.id}">
            <span>${svgIcon('delete', 14)}</span>
          </button>
        </div>
      </div>
    `;
  }

  /**
   * 绑定脚本项事件
   */
  private bindScriptItemEvents(): void {
    const scriptWindow = document.querySelector('.script-management-window');
    if (!scriptWindow) return;

    const scriptItems = scriptWindow.querySelectorAll('.script-item');
    scriptItems.forEach(item => {
      const buttons = item.querySelectorAll('.script-action-btn');
      buttons.forEach(button => {
        button.addEventListener('click', (e) => {
          e.stopPropagation();
          const action = (button as HTMLElement).dataset.action;
          const scriptId = (button as HTMLElement).dataset.scriptId;

          if (action && scriptId) {
            this.handleScriptAction(action, scriptId);
          }
        });
      });
    });
  }

  /**
   * 处理脚本操作
   */
  private async handleScriptAction(action: string, scriptId: string): Promise<void> {
    const script = this.scripts.find(s => s.id === scriptId);
    if (!script) return;

    try {
      switch (action) {
        case 'execute':
          await this.executeScript(scriptId);
          break;
        case 'edit':
          this.showEditScriptDialog(script);
          break;
        case 'toggle':
          await this.toggleScript(script);
          break;
        case 'delete':
          await this.deleteScript(scriptId);
          break;
      }
    } catch (error) {
      console.error(`脚本操作失败 [${action}]:`, error);
      MessageManager.showError(`操作失败: ${error}`);
    }
  }

  /**
   * 执行脚本
   */
  private async executeScript(scriptId: string): Promise<void> {
    try {
      MessageManager.showInfo('脚本开始执行...');
      await scriptManager.executeScript(scriptId);
    } catch (error) {
      MessageManager.showError(`脚本执行失败: ${error}`);
    }
  }

  /**
   * 切换脚本启用状态
   */
  private async toggleScript(script: PythonScript): Promise<void> {
    script.enabled = !script.enabled;
    await scriptManager.updateScript(script);
    await this.refreshScriptList();
    
    MessageManager.showSuccess(`脚本已${script.enabled ? '启用' : '禁用'}`);
  }

  /**
   * 删除脚本
   */
  private async deleteScript(scriptId: string): Promise<void> {
    const script = this.scripts.find(s => s.id === scriptId);
    if (!script) return;

    // 显示确认对话框
    const confirmed = await this.showConfirmDialog(
      '确认删除',
      `确定要删除脚本 "${script.name}" 吗？此操作不可撤销。`
    );

    if (!confirmed) return;

    try {
      await scriptManager.deleteScript(scriptId);
      await this.refreshScriptList();
      MessageManager.showSuccess('脚本已删除');
    } catch (error) {
      console.error('删除脚本失败:', error);
      MessageManager.showError(`删除失败: ${error}`);
    }
  }

  /**
   * 执行所有启用的脚本
   */
  private async executeAllScripts(): Promise<void> {
    const enabledCount = this.scripts.filter(s => s.enabled).length;
    if (enabledCount === 0) {
      MessageManager.showWarning('没有启用的脚本可执行');
      return;
    }

    const { showConfirm } = await import('../core/confirmDialog');
    const confirmed = await showConfirm({
      message: `确定要执行所有 ${enabledCount} 个启用的脚本吗？`,
      type: 'warning',
      confirmText: '执行全部',
    });
    if (confirmed) {
      try {
        MessageManager.showInfo('开始执行所有启用的脚本...');
        await scriptManager.executeAllEnabledScripts();
      } catch (error) {
        MessageManager.showError(`批量执行失败: ${error}`);
      }
    }
  }

  /**
   * 扫描并导入scripts文件夹中的脚本
   */
  private async scanAndImportScripts(): Promise<void> {
    try {
      MessageManager.showInfo('正在扫描scripts文件夹...');
      await scriptManager.scanAndImportScripts();
      await this.refreshScriptList();
      MessageManager.showSuccess('脚本扫描导入完成');
    } catch (error) {
      console.error('扫描导入脚本失败:', error);
      MessageManager.showError(`扫描导入失败: ${error}`);
    }
  }

  /**
   * 显示脚本管理窗口
   */
  showWindow(): void {
    // 检查是否已经存在窗口
    const existingWindow = document.querySelector('.script-management-window');
    if (existingWindow) {
      existingWindow.classList.remove('minimized');
      this.isVisible = true;
      console.log('📖 脚本管理窗口已显示');
      return;
    }

    this.createScriptWindow();
  }

  /**
   * 切换脚本管理窗口显示状态
   */
  toggleWindow(): void {
    const existingWindow = document.querySelector('.script-management-window');
    if (existingWindow) {
      // 如果窗口存在，关闭它
      existingWindow.remove();
      this.isVisible = false;
      console.log('📕 脚本管理窗口已关闭');
    } else {
      // 如果窗口不存在，创建它
      this.createScriptWindow();
      this.isVisible = true;
      console.log('📖 脚本管理窗口已打开');
    }
  }

  /**
   * 创建脚本管理窗口
   */
  createScriptWindow(): void {
    const scriptWindow = document.createElement('div');
    scriptWindow.className = 'script-management-window';
    scriptWindow.innerHTML = this.renderScriptWindow();

    document.body.appendChild(scriptWindow);

    // 立即渲染脚本内容
    this.loadScripts().then(() => {
      this.renderScriptList();
      console.log('✅ 脚本管理窗口创建完成');
    });

    // 绑定事件
    this.bindScriptWindowEvents(scriptWindow);
  }

  /**
   * 渲染脚本管理窗口
   */
  renderScriptWindow(): string {
    return `
      <div class="script-window-header">
        <div class="script-window-title">
          <span class="script-icon">🐍</span>
          <h3>脚本管理</h3>
        </div>
        <div class="script-window-controls">
          <button class="window-control-btn clear" data-action="clear" title="清空脚本">${svgIcon('delete', 14)}</button>
          <button class="window-control-btn refresh" data-action="refresh" title="刷新脚本">${svgIcon('refresh', 14)}</button>
          <button class="window-control-btn minimize" data-action="minimize">−</button>
          <button class="window-control-btn close" data-action="close">×</button>
        </div>
      </div>
      <div class="script-window-content">
        <div class="script-toolbar">
          <div class="script-actions">
            <button class="script-toolbar-btn add-script" id="add-script-btn" title="添加新脚本">
              <span>${svgIcon('plus', 14)}</span>
              <span>添加</span>
            </button>
            <button class="script-toolbar-btn scan-scripts" id="scan-scripts-btn" title="扫描导入脚本">
              <span>${svgIcon('search', 14)}</span>
              <span>扫描</span>
            </button>
            <button class="script-toolbar-btn execute-all" id="execute-all-scripts-btn" title="执行全部脚本">
              <span>${svgIcon('play', 14)}</span>
              <span>全部执行</span>
            </button>
          </div>
        </div>
        <div class="script-list-container">
          <div class="script-list" id="script-list">
            <!-- 脚本列表将在这里动态加载 -->
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 绑定脚本窗口事件
   */
  bindScriptWindowEvents(scriptWindow: HTMLElement): void {
    // 窗口控制按钮事件
    const clearBtn = scriptWindow.querySelector('[data-action="clear"]');
    const refreshBtn = scriptWindow.querySelector('[data-action="refresh"]');
    const minimizeBtn = scriptWindow.querySelector('[data-action="minimize"]');
    const closeBtn = scriptWindow.querySelector('[data-action="close"]');

    clearBtn?.addEventListener('click', () => {
      this.clearAllScripts();
    });

    refreshBtn?.addEventListener('click', () => {
      this.refreshScriptList();
    });

    minimizeBtn?.addEventListener('click', () => {
      scriptWindow.classList.add('minimized');
      this.isVisible = false;
    });

    closeBtn?.addEventListener('click', () => {
      scriptWindow.remove();
      this.isVisible = false;
    });

    // 工具栏按钮事件
    const addScriptBtn = scriptWindow.querySelector('#add-script-btn');
    const scanScriptsBtn = scriptWindow.querySelector('#scan-scripts-btn');
    const executeAllBtn = scriptWindow.querySelector('#execute-all-scripts-btn');

    addScriptBtn?.addEventListener('click', () => this.showAddScriptDialog());
    scanScriptsBtn?.addEventListener('click', () => this.scanAndImportScripts());
    executeAllBtn?.addEventListener('click', () => this.executeAllScripts());
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    // 检查窗口是否存在
    const existingWindow = document.querySelector('.script-management-window');
    return existingWindow !== null;
  }

  /**
   * 获取可见状态
   */
  getVisibleState(): boolean {
    // 检查窗口是否存在且可见
    const existingWindow = document.querySelector('.script-management-window');
    const actuallyVisible = existingWindow !== null && !existingWindow.classList.contains('minimized');

    // 同步内部状态
    if (actuallyVisible !== this.isVisible) {
      this.isVisible = actuallyVisible;
      console.log(`🔄 状态已同步：${actuallyVisible ? '显示' : '隐藏'}`);
    }

    return this.isVisible;
  }

  /**
   * 验证脚本管理器状态
   */
  validateState(): boolean {
    const existingWindow = document.querySelector('.script-management-window');
    return existingWindow !== null;
  }

  /**
   * 清空所有脚本
   */
  private async clearAllScripts(): Promise<void> {
    const { showConfirm } = await import('../core/confirmDialog');
    const confirmed = await showConfirm({
      title: '清空脚本',
      message: '确定要清空所有脚本吗？此操作不可撤销。',
      type: 'danger',
      confirmText: '清空',
    });
    if (confirmed) {
      this.scripts = [];
      this.renderScriptList();
    }
  }

  /**
   * 显示添加脚本对话框
   */
  private showAddScriptDialog(): void {
    this.showScriptDialog();
  }

  /**
   * 显示编辑脚本对话框
   */
  private showEditScriptDialog(script: PythonScript): void {
    this.showScriptDialog(script);
  }

  /**
   * 显示脚本对话框（添加或编辑）
   */
  private showScriptDialog(script?: PythonScript): void {
    const isEdit = !!script;
    const title = isEdit ? '编辑脚本' : '添加脚本';

    const dialogHtml = `
      <div class="script-dialog-overlay" id="script-dialog-overlay">
        <div class="script-dialog">
          <div class="script-dialog-header">
            <h3>${title}</h3>
            <button class="dialog-close-btn" id="script-dialog-close">✕</button>
          </div>
          <div class="script-dialog-content">
            <form id="script-form">
              <div class="form-group">
                <label for="script-name">脚本名称 *</label>
                <input type="text" id="script-name" name="name" required
                       value="${script?.name || ''}" placeholder="输入脚本名称">
              </div>
              <div class="form-group">
                <label for="script-description">描述</label>
                <textarea id="script-description" name="description"
                          placeholder="输入脚本描述">${script?.description || ''}</textarea>
              </div>
              <div class="form-group">
                <label class="script-mode-label">脚本模式</label>
                <div class="script-mode-tabs">
                  <button type="button" class="mode-tab active" data-mode="file" id="file-mode-tab">文件模式</button>
                  <button type="button" class="mode-tab" data-mode="inline" id="inline-mode-tab">内联模式</button>
                </div>
              </div>
              <div class="form-group" id="file-mode-group">
                <label for="script-file-path">脚本文件路径 *</label>
                <div class="file-path-input">
                  <input type="text" id="script-file-path" name="file_path"
                         value="${script?.file_path || ''}" placeholder="选择Python脚本文件">
                  <button type="button" class="browse-btn" id="browse-script-file">浏览</button>
                </div>
              </div>
              <div class="form-group" id="inline-mode-group" style="display: none;">
                <label for="script-content">脚本内容 *</label>
                <textarea id="script-content" name="script_content" rows="10"
                          placeholder="输入Python脚本代码...">${script?.script_content || ''}</textarea>
                <div class="script-help">
                  <small>💡 提示: 可以使用变量如 {output_path}、{current_image_path} 等</small>
                </div>
              </div>
              <div class="form-group">
                <label for="script-arguments">命令行参数</label>
                <input type="text" id="script-arguments" name="arguments"
                       value="${script?.arguments || ''}" placeholder="输入命令行参数（支持变量替换）">
              </div>
              <div class="form-group">
                <label for="script-timeout">超时时间（秒）</label>
                <input type="number" id="script-timeout" name="timeout_seconds" min="1" max="3600"
                       value="${script?.timeout_seconds || 300}">
              </div>
              <div class="form-group checkbox-group">
                <label class="checkbox-label">
                  <input type="checkbox" id="script-enabled" name="enabled"
                         ${script?.enabled !== false ? 'checked' : ''}>
                  <span class="checkbox-text">启用脚本</span>
                </label>
              </div>
              <div class="form-group checkbox-group">
                <label class="checkbox-label">
                  <input type="checkbox" id="script-variable-substitution" name="enable_variable_substitution"
                         ${script?.enable_variable_substitution !== false ? 'checked' : ''}>
                  <span class="checkbox-text">启用变量替换</span>
                </label>
                <button type="button" class="help-btn" id="show-variables-help">查看可用变量</button>
              </div>
            </form>
          </div>
          <div class="script-dialog-footer">
            <button type="button" class="dialog-btn cancel-btn" id="script-dialog-cancel">取消</button>
            <button type="button" class="dialog-btn save-btn" id="script-dialog-save">${isEdit ? '保存' : '添加'}</button>
          </div>
        </div>
      </div>
    `;

    // 添加对话框到页面
    document.body.insertAdjacentHTML('beforeend', dialogHtml);

    // 绑定对话框事件
    this.bindScriptDialogEvents(script);
  }

  /**
   * 绑定脚本对话框事件
   */
  private bindScriptDialogEvents(script?: PythonScript): void {
    const overlay = document.getElementById('script-dialog-overlay');
    const closeBtn = document.getElementById('script-dialog-close');
    const cancelBtn = document.getElementById('script-dialog-cancel');
    const saveBtn = document.getElementById('script-dialog-save');
    const browseBtn = document.getElementById('browse-script-file');
    const form = document.getElementById('script-form') as HTMLFormElement;
    const fileModeTab = document.getElementById('file-mode-tab');
    const inlineModeTab = document.getElementById('inline-mode-tab');
    const fileModeGroup = document.getElementById('file-mode-group');
    const inlineModeGroup = document.getElementById('inline-mode-group');
    const showVariablesBtn = document.getElementById('show-variables-help');

    if (!overlay || !form) return;

    // 关闭对话框
    const closeDialog = () => {
      overlay.remove();
    };

    closeBtn?.addEventListener('click', closeDialog);
    cancelBtn?.addEventListener('click', closeDialog);

    // 点击遮罩关闭
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeDialog();
      }
    });

    // 浏览文件
    browseBtn?.addEventListener('click', async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const result = await invoke('select_file_path', {
          title: translate('选择Python脚本文件'),
          filters: ['py']
        });

        if (result) {
          const filePathInput = document.getElementById('script-file-path') as HTMLInputElement;
          if (filePathInput) {
            filePathInput.value = result as string;
          }
        }
      } catch (error) {
        console.error('选择文件失败:', error);
        MessageManager.showError('选择文件失败');
      }
    });

    // 脚本模式切换
    fileModeTab?.addEventListener('click', () => {
      fileModeTab.classList.add('active');
      inlineModeTab?.classList.remove('active');
      if (fileModeGroup) fileModeGroup.style.display = 'block';
      if (inlineModeGroup) inlineModeGroup.style.display = 'none';

      // 更新必填字段
      const filePathInput = document.getElementById('script-file-path') as HTMLInputElement;
      const scriptContentInput = document.getElementById('script-content') as HTMLTextAreaElement;
      if (filePathInput) filePathInput.required = true;
      if (scriptContentInput) scriptContentInput.required = false;
    });

    inlineModeTab?.addEventListener('click', () => {
      inlineModeTab.classList.add('active');
      fileModeTab?.classList.remove('active');
      if (fileModeGroup) fileModeGroup.style.display = 'none';
      if (inlineModeGroup) inlineModeGroup.style.display = 'block';

      // 更新必填字段
      const filePathInput = document.getElementById('script-file-path') as HTMLInputElement;
      const scriptContentInput = document.getElementById('script-content') as HTMLTextAreaElement;
      if (filePathInput) filePathInput.required = false;
      if (scriptContentInput) scriptContentInput.required = true;
    });

    // 显示可用变量帮助
    showVariablesBtn?.addEventListener('click', async () => {
      try {
        const variables = await scriptManager.getScriptVariables();
        this.showVariablesHelp(variables);
      } catch (error) {
        console.error('获取变量失败:', error);
        MessageManager.showError('获取可用变量失败');
      }
    });

    // 初始化模式（根据现有脚本数据）
    if (script?.script_content) {
      // 如果有脚本内容，切换到内联模式
      inlineModeTab?.click();
    }

    // 保存脚本
    saveBtn?.addEventListener('click', async () => {
      const formData = new FormData(form);
      const scriptData: Partial<PythonScript> = {
        name: formData.get('name') as string,
        description: formData.get('description') as string,
        file_path: formData.get('file_path') as string,
        arguments: formData.get('arguments') as string,
        timeout_seconds: parseInt(formData.get('timeout_seconds') as string) || 300,
        enabled: formData.has('enabled'),
        enable_variable_substitution: formData.has('enable_variable_substitution'),
        script_content: formData.get('script_content') as string || undefined
      };

      // 验证数据
      const errors = scriptManager.validateScript(scriptData);
      if (errors.length > 0) {
        MessageManager.showError(`验证失败: ${errors.join(', ')}`);
        return;
      }

      try {
        if (script) {
          // 编辑模式
          const updatedScript = { ...script, ...scriptData };
          await scriptManager.updateScript(updatedScript);
          MessageManager.showSuccess('脚本已更新');
        } else {
          // 添加模式
          await scriptManager.addScript(scriptData);
          MessageManager.showSuccess('脚本已添加');
        }

        await this.refreshScriptList();
        closeDialog();
      } catch (error) {
        console.error('保存脚本失败:', error);
        MessageManager.showError(`保存失败: ${error}`);
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
   * 更新脚本状态显示
   */
  private updateScriptStatusDisplay(scriptId: string): void {
    if (!this.container) return;

    const statusElement = this.container.querySelector(`#status-${scriptId}`);
    if (!statusElement) return;

    const status = scriptManager.getLocalScriptStatus(scriptId);
    if (!status) return;

    const statusText = scriptManager.formatScriptStatus(status);
    const statusClass = `status-${status.status}`;

    statusElement.textContent = statusText;
    statusElement.className = `status-indicator ${statusClass}`;
  }



  /**
   * 刷新脚本列表
   */
  private async refreshScriptList(): Promise<void> {
    await this.loadScripts();
  }

  /**
   * 显示确认对话框
   */
  private async showConfirmDialog(title: string, message: string): Promise<boolean> {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'script-dialog-overlay';
      overlay.innerHTML = `
        <div class="script-dialog">
          <div class="script-dialog-header">
            <h3>${title}</h3>
          </div>
          <div class="script-dialog-body">
            <p>${message}</p>
          </div>
          <div class="script-dialog-footer">
            <button class="script-btn script-btn-secondary" id="confirm-cancel">取消</button>
            <button class="script-btn script-btn-danger" id="confirm-ok">确定</button>
          </div>
        </div>
      `;

      const closeDialog = (result: boolean) => {
        document.body.removeChild(overlay);
        resolve(result);
      };

      // 绑定按钮事件
      const cancelBtn = overlay.querySelector('#confirm-cancel');
      const okBtn = overlay.querySelector('#confirm-ok');

      cancelBtn?.addEventListener('click', () => closeDialog(false));
      okBtn?.addEventListener('click', () => closeDialog(true));

      // ESC键取消
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          closeDialog(false);
          document.removeEventListener('keydown', handleKeyDown);
        }
      };
      document.addEventListener('keydown', handleKeyDown);

      // 点击遮罩层取消
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          closeDialog(false);
        }
      });

      document.body.appendChild(overlay);
    });
  }

  /**
   * 获取脚本名称
   */
  private getScriptName(scriptId: string): string {
    const script = this.scripts.find(s => s.id === scriptId);
    return script ? script.name : '未知脚本';
  }

  /**
   * 显示可用变量帮助
   */
  private showVariablesHelp(variables: Record<string, string>): void {
    const helpHtml = `
      <div class="variables-help-overlay" id="variables-help-overlay">
        <div class="variables-help-dialog">
          <div class="variables-help-header">
            <h3>可用变量</h3>
            <button class="dialog-close-btn" id="variables-help-close">✕</button>
          </div>
          <div class="variables-help-content">
            <p>在脚本路径、参数和内容中可以使用以下变量：</p>
            <div class="variables-list">
              ${Object.entries(variables).map(([key, value]) => `
                <div class="variable-item">
                  <code class="variable-name">{${key}}</code>
                  <span class="variable-value">${value}</span>
                </div>
              `).join('')}
            </div>
            <div class="variables-help-footer">
              <p><strong>使用方法：</strong> 在需要的地方使用 <code>{变量名}</code> 格式，例如：</p>
              <ul>
                <li><code>{python3_path} {output_path}/my_script.py</code></li>
                <li><code>--output {output_path} --image {current_image_path}</code></li>
                <li><code>print("输出路径:", "{output_path}")</code></li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', helpHtml);

    // 绑定关闭事件
    const overlay = document.getElementById('variables-help-overlay');
    const closeBtn = document.getElementById('variables-help-close');

    const closeHelp = () => {
      overlay?.remove();
    };

    closeBtn?.addEventListener('click', closeHelp);
    overlay?.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeHelp();
      }
    });
  }

  /**
   * 获取容器元素
   */
  getContainer(): HTMLElement | null {
    return this.container;
  }

  /**
   * 最小化窗口
   */
  private minimizeWindow(): void {
    if (this.container) {
      this.container.style.display = 'none';
      this.isVisible = false;
    }
  }

  /**
   * 隐藏窗口
   */
  private hideWindow(): void {
    if (this.container) {
      this.container.style.display = 'none';
      this.isVisible = false;
    }
  }

  /**
   * 销毁组件
   */
  destroy(): void {
    if (this.container) {
      this.container.innerHTML = '';
      this.container = null;
    }
  }
}

// 导出单例实例
export const scriptManagementUI = new ScriptManagementUI();
