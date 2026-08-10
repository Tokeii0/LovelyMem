/**
 * 脚本管理器
 * 处理Python脚本的CRUD操作、执行和状态管理
 */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export interface PythonScript {
  id: string;
  name: string;
  description: string;
  file_path: string;
  enabled: boolean;
  arguments: string;
  timeout_seconds: number;
  created_at: string;
  updated_at: string;
  last_executed?: string;
  execution_count: number;
  enable_variable_substitution?: boolean; // 是否启用变量替换
  script_content?: string; // 脚本内容模板（可选，用于内联脚本）
}

export interface ScriptExecutionResult {
  script_id: string;
  success: boolean;
  output: string;
  error?: string;
  execution_time_ms: number;
  executed_at: string;
}

export interface ScriptExecutionStatus {
  script_id: string;
  status: string; // "idle", "running", "completed", "error"
  progress?: string;
  started_at?: string;
}

export class ScriptManager {
  private scripts: PythonScript[] = [];
  private scriptStatus: Map<string, ScriptExecutionStatus> = new Map();
  private eventListeners: Map<string, Function[]> = new Map();

  constructor() {
    this.initializeEventListeners();
  }

  /**
   * 初始化事件监听器
   */
  private async initializeEventListeners(): Promise<void> {
    try {
      // 监听脚本状态变化事件
      await listen('script-status-changed', (event: any) => {
        const status = event.payload as ScriptExecutionStatus;
        this.scriptStatus.set(status.script_id, status);
        this.emit('statusChanged', status);
      });

      // 监听脚本执行完成事件
      await listen('script-execution-completed', (event: any) => {
        const result = event.payload as ScriptExecutionResult;
        this.emit('executionCompleted', result);
      });

      // 监听脚本自动执行完成事件
      await listen('scripts-auto-execution-completed', (event: any) => {
        const results = event.payload as ScriptExecutionResult[];
        this.emit('autoExecutionCompleted', results);
      });

      // 监听脚本自动执行错误事件
      await listen('scripts-auto-execution-error', (event: any) => {
        const error = event.payload as string;
        this.emit('autoExecutionError', error);
      });

      console.log('✅ 脚本管理器事件监听器已初始化');
    } catch (error) {
      console.error('❌ 初始化脚本管理器事件监听器失败:', error);
    }
  }

  /**
   * 事件发射器
   */
  private emit(event: string, data: any): void {
    const listeners = this.eventListeners.get(event) || [];
    listeners.forEach(listener => {
      try {
        listener(data);
      } catch (error) {
        console.error(`事件监听器错误 [${event}]:`, error);
      }
    });
  }

  /**
   * 添加事件监听器
   */
  on(event: string, listener: Function): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(listener);

    // 返回取消监听的函数
    return () => {
      const listeners = this.eventListeners.get(event);
      if (listeners) {
        const index = listeners.indexOf(listener);
        if (index > -1) {
          listeners.splice(index, 1);
        }
      }
    };
  }

  /**
   * 获取所有脚本
   */
  async getScripts(): Promise<PythonScript[]> {
    try {
      this.scripts = await invoke('get_scripts');
      return this.scripts;
    } catch (error) {
      console.error('获取脚本列表失败:', error);
      throw error;
    }
  }

  /**
   * 添加脚本
   */
  async addScript(script: Partial<PythonScript>): Promise<PythonScript> {
    try {
      const newScript: PythonScript = {
        id: '',
        name: script.name || '新脚本',
        description: script.description || '',
        file_path: script.file_path || '',
        enabled: script.enabled !== undefined ? script.enabled : true,
        arguments: script.arguments || '',
        timeout_seconds: script.timeout_seconds || 300,
        created_at: '',
        updated_at: '',
        execution_count: 0,
        ...script
      };

      const addedScript = await invoke('add_script', { script: newScript }) as PythonScript;
      await this.getScripts(); // 刷新脚本列表
      return addedScript;
    } catch (error) {
      console.error('添加脚本失败:', error);
      throw error;
    }
  }

  /**
   * 更新脚本
   */
  async updateScript(script: PythonScript): Promise<PythonScript> {
    try {
      const updatedScript = await invoke('update_script', { script }) as PythonScript;
      await this.getScripts(); // 刷新脚本列表
      return updatedScript;
    } catch (error) {
      console.error('更新脚本失败:', error);
      throw error;
    }
  }

  /**
   * 删除脚本
   */
  async deleteScript(scriptId: string): Promise<void> {
    try {
      await invoke('delete_script', { scriptId });
      await this.getScripts(); // 刷新脚本列表
      this.scriptStatus.delete(scriptId); // 清除状态
    } catch (error) {
      console.error('删除脚本失败:', error);
      throw error;
    }
  }

  /**
   * 扫描scripts文件夹并自动导入脚本
   */
  async scanAndImportScripts(): Promise<void> {
    try {
      console.log('🔍 开始扫描scripts文件夹...');

      // 获取scripts文件夹中的脚本信息
      const scriptInfos = await invoke('get_python_scripts') as any[];
      console.log(`📊 发现 ${scriptInfos.length} 个脚本文件`);

      // 获取当前已有的脚本列表
      const existingScripts = await this.getScripts();
      const existingPaths = new Set(existingScripts.map(s => s.file_path));

      let importedCount = 0;

      // 遍历扫描到的脚本，导入新的脚本
      for (const scriptInfo of scriptInfos) {
        if (!existingPaths.has(scriptInfo.file_path)) {
          try {
            const newScript: Partial<PythonScript> = {
              name: scriptInfo.display_name,
              description: scriptInfo.description,
              file_path: scriptInfo.file_path,
              enabled: true, // 默认启用
              arguments: '',
              timeout_seconds: 300,
              script_content: '', // 使用文件模式，不存储内容
              enable_variable_substitution: true
            };

            await this.addScript(newScript);
            importedCount++;
            console.log(`✅ 已导入脚本: ${scriptInfo.display_name}`);
          } catch (error) {
            console.error(`❌ 导入脚本失败 [${scriptInfo.display_name}]:`, error);
          }
        } else {
          console.log(`⏭️ 脚本已存在，跳过: ${scriptInfo.display_name}`);
        }
      }

      console.log(`🎉 脚本扫描完成，共导入 ${importedCount} 个新脚本`);

      if (importedCount > 0) {
        // 刷新脚本列表
        await this.getScripts();
      }
    } catch (error) {
      console.error('❌ 扫描scripts文件夹失败:', error);
      throw error;
    }
  }

  /**
   * 执行脚本
   */
  async executeScript(scriptId: string): Promise<ScriptExecutionResult> {
    try {
      return await invoke('execute_script', { scriptId });
    } catch (error) {
      console.error('执行脚本失败:', error);
      throw error;
    }
  }

  /**
   * 获取脚本执行状态
   */
  async getScriptStatus(scriptId: string): Promise<ScriptExecutionStatus | null> {
    try {
      return await invoke('get_script_status', { scriptId });
    } catch (error) {
      console.error('获取脚本状态失败:', error);
      return null;
    }
  }

  /**
   * 获取所有脚本执行状态
   */
  async getAllScriptStatus(): Promise<Map<string, ScriptExecutionStatus>> {
    try {
      const statusMap = await invoke('get_all_script_status') as Record<string, ScriptExecutionStatus>;
      this.scriptStatus = new Map(Object.entries(statusMap));
      return this.scriptStatus;
    } catch (error) {
      console.error('获取所有脚本状态失败:', error);
      return new Map();
    }
  }

  /**
   * 执行所有启用的脚本
   */
  async executeAllEnabledScripts(): Promise<ScriptExecutionResult[]> {
    try {
      return await invoke('execute_all_enabled_scripts');
    } catch (error) {
      console.error('执行所有启用脚本失败:', error);
      throw error;
    }
  }

  /**
   * 获取可用的脚本变量
   */
  async getScriptVariables(): Promise<Record<string, string>> {
    try {
      const variables = await invoke<Record<string, string>>('get_script_variables');
      console.log('✅ 获取脚本变量成功:', variables);
      return variables;
    } catch (error) {
      console.error('❌ 获取脚本变量失败:', error);
      throw error;
    }
  }

  /**
   * 获取脚本的当前状态（从本地缓存）
   */
  getLocalScriptStatus(scriptId: string): ScriptExecutionStatus | null {
    return this.scriptStatus.get(scriptId) || null;
  }

  /**
   * 获取脚本列表（从本地缓存）
   */
  getLocalScripts(): PythonScript[] {
    return this.scripts;
  }

  /**
   * 根据ID查找脚本
   */
  findScript(scriptId: string): PythonScript | null {
    return this.scripts.find(script => script.id === scriptId) || null;
  }

  /**
   * 获取启用的脚本数量
   */
  getEnabledScriptCount(): number {
    return this.scripts.filter(script => script.enabled).length;
  }



  /**
   * 验证脚本配置
   */
  validateScript(script: Partial<PythonScript>): string[] {
    const errors: string[] = [];

    if (!script.name || script.name.trim() === '') {
      errors.push('脚本名称不能为空');
    }

    if (!script.file_path || script.file_path.trim() === '') {
      errors.push('脚本文件路径不能为空');
    }

    if (script.timeout_seconds !== undefined && script.timeout_seconds <= 0) {
      errors.push('超时时间必须大于0');
    }

    return errors;
  }

  /**
   * 格式化执行时间
   */
  formatExecutionTime(milliseconds: number): string {
    if (milliseconds < 1000) {
      return `${milliseconds}ms`;
    } else if (milliseconds < 60000) {
      return `${(milliseconds / 1000).toFixed(1)}s`;
    } else {
      const minutes = Math.floor(milliseconds / 60000);
      const seconds = Math.floor((milliseconds % 60000) / 1000);
      return `${minutes}m ${seconds}s`;
    }
  }

  /**
   * 格式化脚本状态显示文本
   */
  formatScriptStatus(status: ScriptExecutionStatus): string {
    switch (status.status) {
      case 'idle':
        return '空闲';
      case 'running':
        return '运行中';
      case 'completed':
        return '已完成';
      case 'error':
        return '错误';
      default:
        return '未知';
    }
  }
}

// 导出单例实例
export const scriptManager = new ScriptManager();
