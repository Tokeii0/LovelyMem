/**
 * 文件浏览器插件管理器
 * 专门用于管理文件浏览器的右键菜单插件
 */

import { invoke } from "@tauri-apps/api/core";
import { MessageManager } from '../utils/message';

export interface FileBrowserPlugin {
  id: string;
  name: string;
  description: string;
  command_template: string;
  icon: string;
  enabled: boolean;
  file_types: string[];
  created_at: string;
  updated_at: string;
}

export class FileBrowserPluginManager {
  private updateStatusCallback?: (message: string) => void;

  constructor(updateStatusCallback?: (message: string) => void) {
    this.updateStatusCallback = updateStatusCallback;
  }

  /**
   * 显示插件管理器对话框
   */
  async showPluginManager(): Promise<void> {
    // 移除现有的对话框
    const existingDialog = document.querySelector('.plugin-manager-dialog');
    if (existingDialog) {
      existingDialog.remove();
    }

    // 创建对话框
    const dialog = document.createElement('div');
    dialog.className = 'plugin-manager-dialog';
    
    try {
      // 加载插件列表
      const plugins = await invoke('load_file_browser_plugins') as FileBrowserPlugin[];

      dialog.innerHTML = this.generateDialogHTML(plugins);
      
      // 创建覆盖层
      const overlay = document.createElement('div');
      overlay.className = 'plugin-manager-overlay';
      
      // 添加到页面
      document.body.appendChild(overlay);
      document.body.appendChild(dialog);

      // 绑定事件
      this.bindEvents(dialog, overlay, plugins);
      
    } catch (error) {
      console.error('加载插件管理器失败:', error);
      this.updateStatus('加载插件管理器失败');
    }
  }



  /**
   * 生成对话框HTML
   */
  private generateDialogHTML(plugins: FileBrowserPlugin[]): string {
    return `
      <div class="plugin-manager-content">
        <div class="plugin-manager-header">
          <h2>🔧 文件浏览器插件管理</h2>
          <button class="close-btn" data-action="close">×</button>
        </div>

        <div class="plugin-manager-body">
          <div class="plugin-toolbar">
            <button class="add-plugin-btn" data-action="add-plugin">➕ 添加插件</button>
            <div class="plugin-info">
              <span>💡 插件可以在文件右键菜单中快速执行自定义命令</span>
            </div>
          </div>

          <div class="plugins-section">
            <h3>🔌 已配置插件</h3>
            <div class="plugins-table-container" id="plugins-list">
              ${this.generatePluginsTable(plugins)}
            </div>
          </div>
        </div>

        <div class="plugin-manager-footer">
          <button class="cancel-btn" data-action="close">关闭</button>
        </div>
      </div>
    `;
  }

  /**
   * 生成插件表格HTML
   */
  private generatePluginsTable(plugins: FileBrowserPlugin[]): string {
    if (plugins.length === 0) {
      return `
        <div class="no-plugins-message">
          <span>💡 暂无插件，点击上方按钮添加插件</span>
        </div>
      `;
    }

    return `
      <table class="plugins-table">
        <thead>
          <tr>
            <th>状态</th>
            <th>图标</th>
            <th>名称</th>
            <th>描述</th>
            <th>命令模板</th>
            <th>文件类型</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          ${plugins.map(plugin => `
            <tr class="plugin-row ${!plugin.enabled ? 'disabled' : ''}">
              <td class="plugin-status">
                <span class="status-indicator ${plugin.enabled ? 'enabled' : 'disabled'}"
                      title="${plugin.enabled ? '已启用' : '已禁用'}">
                  ${plugin.enabled ? '🟢' : '🔴'}
                </span>
              </td>
              <td class="plugin-icon">${plugin.icon}</td>
              <td class="plugin-name">${plugin.name}</td>
              <td class="plugin-description">${plugin.description}</td>
              <td class="plugin-command">
                <code>${plugin.command_template}</code>
              </td>
              <td class="plugin-file-types">
                <span class="file-types-badge">${plugin.file_types.join(', ')}</span>
              </td>
              <td class="plugin-actions">
                <button class="plugin-action-btn toggle"
                        data-action="toggle-plugin"
                        data-plugin-id="${plugin.id}"
                        title="${plugin.enabled ? '禁用' : '启用'}">
                  ${plugin.enabled ? '🔴' : '🟢'}
                </button>
                <button class="plugin-action-btn edit"
                        data-action="edit-plugin"
                        data-plugin-id="${plugin.id}"
                        title="编辑">
                  ✏️
                </button>
                <button class="plugin-action-btn delete"
                        data-action="delete-plugin"
                        data-plugin-id="${plugin.id}"
                        title="删除">
                  🗑️
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  /**
   * 绑定事件
   */
  private bindEvents(dialog: HTMLElement, overlay: HTMLElement, plugins: FileBrowserPlugin[]): void {
    // 阻止对话框内的点击事件冒泡到全局处理器
    dialog.addEventListener('click', async (e) => {
      e.stopPropagation();

      const target = e.target as HTMLElement;
      const action = target.getAttribute('data-action');

      //console.log('🔍 插件管理器点击事件:', action, target);

      switch (action) {
        case 'close':
          overlay.remove();
          dialog.remove();
          break;
        case 'add-plugin':
          await this.showPluginEditor(dialog, null);
          break;
        case 'edit-plugin':
          const pluginId = target.getAttribute('data-plugin-id');
          const plugin = plugins.find(p => p.id === pluginId);
          if (plugin) {
            await this.showPluginEditor(dialog, plugin);
          }
          break;
        case 'toggle-plugin':
          const togglePluginId = target.getAttribute('data-plugin-id');
          if (togglePluginId) {
            await this.togglePlugin(dialog, togglePluginId);
          }
          break;
        case 'delete-plugin':
          const deletePluginId = target.getAttribute('data-plugin-id');
          if (deletePluginId) {
            await this.deletePlugin(dialog, deletePluginId);
          }
          break;
      }
    });

    // 工具项点击复制
    dialog.querySelectorAll('.tool-item').forEach(item => {
      item.addEventListener('click', () => {
        const toolKey = item.getAttribute('data-tool-key');
        if (toolKey) {
          navigator.clipboard.writeText(toolKey);
          this.updateStatus(`已复制: ${toolKey}`);
        }
      });
    });

    // 点击覆盖层关闭
    overlay.addEventListener('click', () => {
      overlay.remove();
      dialog.remove();
    });
  }

  /**
   * 更新状态
   */
  private updateStatus(message: string): void {
    if (this.updateStatusCallback) {
      this.updateStatusCallback(message);
    }
    //console.log('FileBrowserPluginManager:', message);
  }

  /**
   * 显示插件编辑器
   */
  private async showPluginEditor(parentDialog: HTMLElement, existingPlugin: FileBrowserPlugin | null): Promise<void> {
    const editorDialog = document.createElement('div');
    editorDialog.className = 'plugin-editor-dialog';

    const isEdit = existingPlugin !== null;

    editorDialog.innerHTML = `
      <div class="plugin-editor-content">
        <div class="plugin-editor-header">
          <h3>${isEdit ? '编辑插件' : '添加插件'}</h3>
          <button class="close-btn" data-action="close">×</button>
        </div>

        <form class="plugin-editor-form" id="plugin-form">
          <div class="form-group">
            <label for="plugin-name">插件名称 *</label>
            <input type="text" id="plugin-name" name="name" value="${existingPlugin?.name || ''}" required>
          </div>

          <div class="form-group">
            <label for="plugin-description">描述</label>
            <input type="text" id="plugin-description" name="description" value="${existingPlugin?.description || ''}" placeholder="插件功能描述">
          </div>

          <div class="form-group">
            <label for="plugin-icon">图标</label>
            <input type="text" id="plugin-icon" name="icon" value="${existingPlugin?.icon || '🔧'}" placeholder="🔧">
          </div>

          <div class="form-group">
            <label for="plugin-command">命令模板 *</label>
            <textarea id="plugin-command" name="command_template" rows="3" required placeholder="例如: {python3_path} script.py {file_path}">${existingPlugin?.command_template || ''}</textarea>
            <div class="form-help">
              <strong>内置工具变量:</strong> {python2_path}, {python3_path}, {memprocfs_path}, {volatility2_path}, {volatility3_path}<br>
              <strong>目录路径变量:</strong> {output_path}, {scripts_output}, {extensions_path}, {tooltip_rules_path}<br>
              <strong>自定义工具变量:</strong> 使用工具ID，如 {tool_1750147208488_f5og63z0n}<br>
              <strong>文件变量:</strong> {file_path}, {file_name}, {current_path}, {file_extension}, {file_name_without_ext}<br>
              <strong>示例:</strong> {tool_1750147208488_f5og63z0n} "{file_path}" 或 {python3_path} script.py "{file_path}"
            </div>
          </div>

          <div class="form-group">
            <label for="plugin-file-types">支持的文件类型</label>
            <input type="text" id="plugin-file-types" name="file_types" value="${existingPlugin?.file_types?.join(', ') || '*'}" placeholder="*, txt, csv, py">
            <div class="form-help">用逗号分隔，* 表示支持所有文件类型</div>
          </div>

          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" name="enabled" ${existingPlugin?.enabled !== false ? 'checked' : ''}>
              启用插件
            </label>
          </div>
        </form>

        <div class="plugin-editor-footer">
          <button class="cancel-btn" data-action="close">取消</button>
          <button class="save-btn" data-action="save">保存</button>
        </div>
      </div>
    `;

    document.body.appendChild(editorDialog);

    // 绑定编辑器事件
    this.bindEditorEvents(editorDialog, parentDialog, existingPlugin);
  }

  /**
   * 绑定编辑器事件
   */
  private bindEditorEvents(editorDialog: HTMLElement, parentDialog: HTMLElement, existingPlugin: FileBrowserPlugin | null): void {
    const form = editorDialog.querySelector('#plugin-form') as HTMLFormElement;

    const closeEditor = () => {
      editorDialog.remove();
    };

    // 阻止对话框内的点击事件冒泡到全局处理器
    editorDialog.addEventListener('click', (e) => {
      e.stopPropagation();

      const target = e.target as HTMLElement;
      const action = target.getAttribute('data-action');

      //console.log('🔍 插件编辑器点击事件:', action, target);

      if (action === 'close') {
        e.preventDefault();
        //console.log('🔍 关闭插件编辑器');
        closeEditor();
        return;
      }

      if (action === 'save') {
        e.preventDefault();
        //console.log('🔍 保存插件');
        this.handleSavePlugin(form, existingPlugin, parentDialog, closeEditor);
        return;
      }
    });
  }

  /**
   * 处理保存插件
   */
  private async handleSavePlugin(form: HTMLFormElement, existingPlugin: FileBrowserPlugin | null, parentDialog: HTMLElement, closeEditor: () => void): Promise<void> {
    try {
      const formData = new FormData(form);
      const fileTypesStr = formData.get('file_types') as string;
      const fileTypes = fileTypesStr.split(',').map(type => type.trim()).filter(type => type);

      const pluginData: FileBrowserPlugin = {
        id: existingPlugin?.id || this.generateId(),
        name: formData.get('name') as string,
        description: formData.get('description') as string,
        command_template: formData.get('command_template') as string,
        icon: formData.get('icon') as string,
        enabled: formData.has('enabled'),
        file_types: fileTypes.length > 0 ? fileTypes : ['*'],
        created_at: existingPlugin?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (!pluginData.name.trim() || !pluginData.command_template.trim()) {
        MessageManager.showError('请填写插件名称和命令模板');
        return;
      }

      if (existingPlugin) {
        await invoke('update_file_browser_plugin', { pluginId: existingPlugin.id, updatedPlugin: pluginData });
        this.updateStatus('插件更新成功');
      } else {
        await invoke('add_file_browser_plugin', { plugin: pluginData });
        this.updateStatus('插件添加成功');
      }

      // 重新加载插件列表
      await this.refreshPluginsList(parentDialog);
      closeEditor();
    } catch (error) {
      console.error('保存插件失败:', error);
      MessageManager.showError('保存插件失败: ' + error);
    }
  }

  /**
   * 刷新插件列表
   */
  private async refreshPluginsList(dialog: HTMLElement): Promise<void> {
    try {
      const plugins = await invoke('load_file_browser_plugins') as FileBrowserPlugin[];
      const pluginsList = dialog.querySelector('#plugins-list');
      if (pluginsList) {
        pluginsList.innerHTML = this.generatePluginsTable(plugins);
      }
    } catch (error) {
      console.error('刷新插件列表失败:', error);
    }
  }

  /**
   * 切换插件启用状态
   */
  private async togglePlugin(dialog: HTMLElement, pluginId: string): Promise<void> {
    try {
      const plugins = await invoke('load_file_browser_plugins') as FileBrowserPlugin[];
      const plugin = plugins.find(p => p.id === pluginId);

      if (plugin) {
        plugin.enabled = !plugin.enabled;
        plugin.updated_at = new Date().toISOString();

        await invoke('update_file_browser_plugin', { pluginId, updatedPlugin: plugin });
        this.updateStatus(`插件已${plugin.enabled ? '启用' : '禁用'}`);

        await this.refreshPluginsList(dialog);
      }
    } catch (error) {
      console.error('切换插件状态失败:', error);
      this.updateStatus('操作失败，请重试');
    }
  }

  /**
   * 删除插件
   */
  private async deletePlugin(dialog: HTMLElement, pluginId: string): Promise<void> {
    try {
      await invoke('delete_file_browser_plugin', { pluginId });
      this.updateStatus('插件已删除');
      await this.refreshPluginsList(dialog);
    } catch (error) {
      console.error('删除插件失败:', error);
      this.updateStatus('删除失败，请重试');
    }
  }

  /**
   * 生成唯一ID
   */
  private generateId(): string {
    return 'fbp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
}
