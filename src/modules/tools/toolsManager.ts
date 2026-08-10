/**
 * 独立的工具管理系统
 * 管理小工具区域的自定义工具，使用独立的 JSON 文件存储
 */

import { invoke } from '@tauri-apps/api/core';
import { loadAppSettings } from '../core/settingsHelper';

export interface CustomTool {
  id: string;
  name: string;
  description: string;
  command: string;
  arguments: string;
  icon: string;
  category: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export class ToolsManager {
  private static instance: ToolsManager;
  private tools: CustomTool[] = [];

  private constructor() {}

  static getInstance(): ToolsManager {
    if (!ToolsManager.instance) {
      ToolsManager.instance = new ToolsManager();
    }
    return ToolsManager.instance;
  }

  /**
   * 加载工具列表
   */
  async loadTools(): Promise<CustomTool[]> {
    try {
      const toolsData = await invoke('load_tools_json') as CustomTool[];
      this.tools = toolsData || [];
      console.log('🔧 加载工具列表成功，数量:', this.tools.length);
      return this.tools;
    } catch (error) {
      console.error('加载工具列表失败:', error);
      this.tools = [];
      return this.tools;
    }
  }

  /**
   * 保存工具列表
   */
  async saveTools(): Promise<void> {
    try {
      await invoke('save_tools_json', { tools: this.tools });
      console.log('🔧 保存工具列表成功');
    } catch (error) {
      console.error('保存工具列表失败:', error);
      throw error;
    }
  }

  /**
   * 添加工具
   */
  async addTool(tool: Omit<CustomTool, 'id' | 'created_at' | 'updated_at'>): Promise<CustomTool> {
    const newTool: CustomTool = {
      ...tool,
      id: this.generateToolId(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    this.tools.push(newTool);
    await this.saveTools();
    
    console.log('🔧 添加工具成功:', newTool.name);
    return newTool;
  }

  /**
   * 更新工具
   */
  async updateTool(toolId: string, updates: Partial<CustomTool>): Promise<CustomTool | null> {
    const toolIndex = this.tools.findIndex(tool => tool.id === toolId);
    if (toolIndex === -1) {
      throw new Error('工具未找到');
    }

    this.tools[toolIndex] = {
      ...this.tools[toolIndex],
      ...updates,
      updated_at: new Date().toISOString()
    };

    await this.saveTools();
    console.log('🔧 更新工具成功:', this.tools[toolIndex].name);
    return this.tools[toolIndex];
  }

  /**
   * 删除工具
   */
  async deleteTool(toolId: string): Promise<boolean> {
    const toolIndex = this.tools.findIndex(tool => tool.id === toolId);
    if (toolIndex === -1) {
      return false;
    }

    const deletedTool = this.tools.splice(toolIndex, 1)[0];
    await this.saveTools();
    
    console.log('🔧 删除工具成功:', deletedTool.name);
    return true;
  }

  /**
   * 获取启用的工具
   */
  getEnabledTools(): CustomTool[] {
    return this.tools.filter(tool => tool.enabled);
  }

  /**
   * 获取所有工具
   */
  getAllTools(): CustomTool[] {
    return [...this.tools];
  }

  /**
   * 根据ID获取工具
   */
  getToolById(toolId: string): CustomTool | null {
    return this.tools.find(tool => tool.id === toolId) || null;
  }

  /**
   * 切换工具启用状态
   */
  async toggleTool(toolId: string): Promise<CustomTool | null> {
    const tool = this.getToolById(toolId);
    if (!tool) {
      throw new Error('工具未找到');
    }

    return await this.updateTool(toolId, { enabled: !tool.enabled });
  }

  /**
   * 获取系统变量
   */
  private async getSystemVariables(): Promise<Record<string, string>> {
    try {
      // 获取应用设置
      const settings = await loadAppSettings();

      // 获取当前时间信息
      const now = new Date();
      const timestamp = Math.floor(now.getTime() / 1000).toString();
      const date = now.toISOString().split('T')[0];
      const time = now.toTimeString().split(' ')[0];

      // 构建变量映射
      const variables: Record<string, string> = {
        // 工具路径
        python2_path: settings.python2_path || '',
        python3_path: settings.python3_path || '',
        memprocfs_path: settings.memprocfs_path || '',
        volatility2_path: settings.volatility2_path || '',
        volatility3_path: settings.volatility3_path || '',
        output_path: settings.output_path || '',

        // 镜像相关
        current_image_path: settings.current_image_path || '',
        image_directory: '',
        image_filename: '',

        // 系统信息
        timestamp: timestamp,
        date: date,
        time: time
      };

      // 处理镜像路径相关变量
      if (settings.current_image_path) {
        const imagePath = settings.current_image_path;
        const lastSlashIndex = Math.max(imagePath.lastIndexOf('/'), imagePath.lastIndexOf('\\'));
        if (lastSlashIndex !== -1) {
          variables.image_directory = imagePath.substring(0, lastSlashIndex);
          variables.image_filename = imagePath.substring(lastSlashIndex + 1);
        } else {
          variables.image_filename = imagePath;
        }
      }

      return variables;
    } catch (error) {
      console.error('获取系统变量失败:', error);
      return {};
    }
  }

  /**
   * 执行工具
   */
  async executeTool(toolId: string, customVariables: Record<string, string> = {}): Promise<string> {
    const tool = this.getToolById(toolId);
    if (!tool) {
      throw new Error('工具未找到');
    }

    if (!tool.enabled) {
      throw new Error('工具已禁用');
    }

    try {
      // 获取系统变量并与自定义变量合并
      const systemVariables = await this.getSystemVariables();
      const variables = { ...systemVariables, ...customVariables };

      const result = await invoke('execute_tool_command_tauri', {
        command: tool.command,
        arguments: tool.arguments,
        variables: variables
      });

      console.log('🔧 工具执行成功:', tool.name);
      return result as string;
    } catch (error) {
      console.error('工具执行失败:', error);
      throw error;
    }
  }

  /**
   * 生成工具ID
   */
  private generateToolId(): string {
    return 'tool_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * 检查是否是自定义工具功能
   */
  static isCustomToolFeature(feature: string): boolean {
    return feature.startsWith('custom-tool-');
  }

  /**
   * 从功能名称中提取工具ID
   */
  static extractToolIdFromFeature(feature: string): string {
    return feature.replace('custom-tool-', '');
  }
}

// 导出单例实例
export const toolsManager = ToolsManager.getInstance();
