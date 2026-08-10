/**
 * Volatility 执行器基类
 *
 * 提供 Volatility2/Volatility3/Vol3Linux 执行的通用框架:
 * - 文件缓存管理(已完成的功能文件记录)
 * - 命令历史记录
 * - 执行状态管理
 * - 结果处理
 * - 错误处理
 */

import { invoke } from '@tauri-apps/api/core';
import { loadAppSettings } from '../core/settingsHelper';
import type { StateManager } from '../core/stateManager';
import type { ModernUIRenderer } from '../ui/modernUIRenderer';
import type { CommandWindowManager } from '../ui/commandWindowManager';


/**
 * Volatility 执行结果接口
 */
export interface VolatilityResult {
  success: boolean;
  message?: string;
  stderr?: string;
  output_file?: string;
  output_type?: string;
  /** 该结果是否命中插件结果缓存（后端直接复用上次输出，未重跑 Python） */
  from_cache?: boolean;
}

/**
 * 命令历史接口
 */
export interface CommandHistory {
  id: number;
  name: string;
  command: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  time: string;
  output?: string;
  error?: string;
}

/**
 * Volatility 执行器基类
 */
export abstract class VolatilityExecutor {
  protected completedFiles: Map<string, string> = new Map();

  constructor(
    protected stateManager: StateManager,
    protected uiRenderer: ModernUIRenderer,
    protected commandWindowManager: CommandWindowManager
  ) {}

  /**
   * 清除已完成文件的缓存
   */
  clearCompletedFiles(): void {
    this.completedFiles.clear();
  }

  /**
   * 获取已完成文件映射
   */
  getCompletedFiles(): Map<string, string> {
    return this.completedFiles;
  }

  /**
   * 检查功能是否已完成,如果已完成则直接打开查看器
   * @returns true 表示文件已存在并成功打开,false 表示需要重新执行
   */
  protected async checkAndOpenExistingFile(
    feature: string,
    isTextPlugin: (feature: string) => boolean
  ): Promise<boolean> {
    const existingFile = this.completedFiles.get(feature);
    if (!existingFile) {
      return false;
    }

    console.log(`🔍 发现已完成的文件: ${existingFile},直接打开查看器`);

    try {
      const viewerCommand = isTextPlugin(feature) ? 'open_text_viewer' : 'open_csv_viewer';
      const titlePrefix = this.getToolName();

      await invoke(viewerCommand, {
        [isTextPlugin(feature) ? 'textFilePath' : 'csvFilePath']: existingFile,
        windowTitle: `${titlePrefix} ${feature} - ${existingFile}`
      });

      return true;
    } catch (error) {
      console.error('打开查看器失败:', error);
      // 如果打开失败,删除记录的文件并重新执行
      this.completedFiles.delete(feature);
      return false;
    }
  }

  /**
   * 验证基础配置(内存镜像、Python路径等)
   */
  protected async validateBasicSettings(): Promise<{
    settings: any;
    currentImage: any;
    valid: boolean;
  }> {
    const settings = await loadAppSettings();
    const currentImage = this.stateManager.getCurrentImage();

    if (!currentImage) {
      this.stateManager.addCommandOutput('❌ 请先加载内存镜像文件');
      return { settings, currentImage, valid: false };
    }

    return { settings, currentImage, valid: true };
  }

  /**
   * 添加命令到历史记录
   */
  protected addCommandToHistory(name: string, commandLine: string): number {
    const commandId = Date.now() + Math.random();
    this.stateManager.addCommandHistory({
      id: commandId,
      name,
      command: commandLine,
      status: 'pending',
      time: new Date().toLocaleString()
    });
    this.commandWindowManager.updateCommandWindowDisplay();
    return commandId;
  }

  /**
   * 更新执行状态为运行中
   */
  protected setRunningState(feature: string, commandId: number): void {
    this.setExecutionState(feature, 'running');
    this.stateManager.addCommandOutput(`🚀 正在执行${this.getToolName()} ${feature}...`);
    this.stateManager.updateCommandStatus(commandId, 'running');
    this.commandWindowManager.updateCommandWindowDisplay();
  }

  /**
   * 处理执行成功
   */
  protected handleSuccess(
    feature: string,
    commandId: number,
    result: VolatilityResult
  ): void {
    this.setExecutionState(feature, 'success');
    if (result.from_cache) {
      this.stateManager.addCommandOutput(`⚡ ${this.getToolName()} ${feature} 命中缓存（未重跑，秒级返回）`);
    } else {
      this.stateManager.addCommandOutput(`✅ ${this.getToolName()} ${feature} 执行成功`);
    }
    this.stateManager.addCommandOutput(`📄 输出文件: ${result.output_file}`);

    if (result.output_type) {
      this.stateManager.addCommandOutput(`📊 输出格式: ${result.output_type}`);
    }

    // 记录已完成的文件路径(提取纯文件名)
    if (result.output_file) {
      let fileName = result.output_file;
      // 处理Windows和Unix路径分隔符
      fileName = fileName.split('\\').pop() || fileName;
      fileName = fileName.split('/').pop() || fileName;

      if (fileName) {
        this.completedFiles.set(feature, fileName);
        console.log(`📝 记录已完成的功能: ${feature} -> ${fileName}`);
      }
    }

    // 更新UI
    this.uiRenderer.updateState(this.stateManager.getState());

    // 更新命令状态为完成
    this.stateManager.updateCommandStatus(commandId, 'completed');

    // 更新命令记录的输出信息
    const commandHistory = this.stateManager.getCommandHistory();
    const command = commandHistory.find((cmd: CommandHistory) => cmd.id === commandId);
    if (command) {
      command.output = `输出文件: ${result.output_file}${result.output_type ? '\n输出格式: ' + result.output_type : ''}`;
    }

    this.commandWindowManager.updateCommandWindowDisplay();

    if (this.getToolName() === 'Volatility3') {

    }

    // 3秒后重置状态
    setTimeout(() => {
      this.setExecutionState(feature, 'idle');
    }, 3000);
  }

  /**
   * 处理执行失败
   */
  protected handleFailure(
    feature: string,
    commandId: number,
    result: VolatilityResult
  ): void {
    this.setExecutionState(feature, 'error');
    this.stateManager.addCommandOutput(`❌ ${this.getToolName()} ${feature} 执行失败: ${result.message}`);

    if (result.stderr) {
      this.stateManager.addCommandOutput(`错误详情: ${result.stderr}`);
    }

    // 更新命令状态为错误
    this.stateManager.updateCommandStatus(commandId, 'error');

    // 更新命令记录的错误信息
    const commandHistory = this.stateManager.getCommandHistory();
    const command = commandHistory.find((cmd: CommandHistory) => cmd.id === commandId);
    if (command) {
      command.error = result.message + (result.stderr ? `\n${result.stderr}` : '');
    }

    this.commandWindowManager.updateCommandWindowDisplay();

    // 5秒后重置状态
    setTimeout(() => {
      this.setExecutionState(feature, 'idle');
    }, 5000);
  }

  /**
   * 处理执行异常
   */
  protected handleException(
    feature: string,
    commandId: number,
    error: any
  ): void {
    console.error(`${this.getToolName()}功能执行失败:`, error);
    this.setExecutionState(feature, 'error');
    this.stateManager.addCommandOutput(`❌ ${this.getToolName()} ${feature} 执行失败: ${error}`);

    // 更新命令状态为错误
    this.stateManager.updateCommandStatus(commandId, 'error');

    // 更新命令记录的错误信息
    const commandHistory = this.stateManager.getCommandHistory();
    const command = commandHistory.find((cmd: CommandHistory) => cmd.id === commandId);
    if (command) {
      command.error = String(error);
    }

    this.commandWindowManager.updateCommandWindowDisplay();

    // 5秒后重置状态
    setTimeout(() => {
      this.setExecutionState(feature, 'idle');
    }, 5000);
  }

  /**
   * 提取文件名(去掉路径)
   */
  protected extractFileName(filePath: string): string {
    let fileName = filePath;
    fileName = fileName.split('\\').pop() || fileName;
    fileName = fileName.split('/').pop() || fileName;
    return fileName;
  }

  // ============ 抽象方法(由子类实现) ============

  /**
   * 获取工具名称(如 "Volatility2", "Volatility3", "Vol3Linux")
   */
  protected abstract getToolName(): string;

  /**
   * 设置执行状态的视觉反馈
   */
  protected abstract setExecutionState(
    feature: string,
    state: 'idle' | 'running' | 'success' | 'error'
  ): void;

  /**
   * 执行功能
   */
  abstract executeFeature(feature: string): Promise<void>;
}
