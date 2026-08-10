import { invoke } from "@tauri-apps/api/core";
import { StateManager } from '../core/stateManager';

/**
 * Volatility功能基类
 * 统一处理Volatility2和Volatility3的通用逻辑
 */
export abstract class VolatilityBase {
  protected stateManager: StateManager;
  protected completedFiles: Map<string, string> = new Map();

  constructor(stateManager: StateManager) {
    this.stateManager = stateManager;
  }

  /**
   * 检查镜像和设置
   */
  protected checkPrerequisites(_toolType: 'vol2' | 'vol3' | 'vol3linux'): { success: boolean; message?: string; settings?: any; image?: any } {
    const currentImage = this.stateManager.getCurrentImage();
    if (!currentImage) {
      return { success: false, message: '❌ 请先加载内存镜像文件' };
    }

    // 这里应该从设置中获取配置，暂时返回空对象
    const settings = {}; // TODO: 从设置管理器获取实际设置
    
    return { success: true, settings, image: currentImage };
  }

  /**
   * 生成输出文件名
   */
  protected generateOutputFileName(toolType: 'vol2' | 'vol3' | 'vol3linux', feature: string, extension: string): string {
    return `${toolType}_${feature}.${extension}`;
  }

  /**
   * 设置功能执行状态的视觉反馈
   */
  protected setExecutionState(feature: string, state: 'idle' | 'running' | 'success' | 'error', toolType: 'vol2' | 'vol3' | 'vol3linux'): void {
    // 尝试查找功能卡片
    let featureCard = document.querySelector(`[data-feature="${toolType}-${feature}"]`);
    if (!featureCard) {
      featureCard = document.querySelector(`[data-feature="${feature}"]`);
    }
    if (!featureCard) {
      console.warn(`未找到功能卡片: ${feature}`);
      return;
    }

    // 移除所有状态类
    featureCard.classList.remove(
      `${toolType}-idle`, `${toolType}-running`, `${toolType}-success`, 
      `${toolType}-error`, `${toolType}-completed`
    );
    
    // 添加新状态类
    featureCard.classList.add(`${toolType}-${state}`);

    // 获取功能卡片中的图标和标题
    const icon = featureCard.querySelector('.feature-icon') as HTMLElement;
    const title = featureCard.querySelector('.feature-title') as HTMLElement;
    const description = featureCard.querySelector('.feature-description') as HTMLElement;

    if (!icon || !title) return;

    this.updateCardVisualState(icon, title, description, state, feature, toolType);
  }

  /**
   * 更新卡片视觉状态
   */
  private updateCardVisualState(
    icon: HTMLElement, 
    title: HTMLElement, 
    description: HTMLElement, 
    state: string, 
    feature: string, 
    toolType: string
  ): void {
    const colors = {
      vol2: '#3182ce',
      vol3: '#4ecdc4',
      vol3linux: '#a29bfe'
    };

    switch (state) {
      case 'running':
        icon.textContent = '⏳';
        if (title) title.style.color = colors[toolType as keyof typeof colors];
        if (description) description.textContent = '正在执行中...';
        break;
        
      case 'success':
        icon.textContent = '✅';
        if (title) title.style.color = '#38a169';
        if (description) description.textContent = '执行成功！';
        break;
        
      case 'error':
        icon.textContent = '❌';
        if (title) title.style.color = '#e53e3e';
        if (description) description.textContent = '执行失败';
        break;
        
      case 'idle':
      default:
        // 重置到默认状态或已完成状态
        if (title) title.style.color = '';
        
        // 检查是否有已完成的文件
        if (this.completedFiles.has(feature)) {
          const completedFile = this.completedFiles.get(feature);
          const isTextFile = completedFile?.endsWith('.txt') || false;
          
          icon.textContent = isTextFile ? '📝' : '📊';
          if (description) description.textContent = `点击查看${isTextFile ? '文本' : 'CSV'}结果`;
          if (title) title.style.color = colors[toolType as keyof typeof colors];
        } else {
          // 恢复默认状态
          this.resetToDefaultState(feature, icon, description);
        }
        break;
    }
  }

  /**
   * 重置到默认状态（由子类实现）
   */
  protected abstract resetToDefaultState(feature: string, icon: HTMLElement, description: HTMLElement): void;

  /**
   * 处理执行结果
   */
  protected handleExecutionResult(
    result: any, 
    feature: string, 
    toolType: 'vol2' | 'vol3' | 'vol3linux'
  ): void {
    if (result.success) {
      // 执行成功 - 更新视觉反馈
      this.setExecutionState(feature, 'success', toolType);
      this.stateManager.addCommandOutput(`✅ ${toolType.toUpperCase()} ${feature} 执行成功`);
      this.stateManager.addCommandOutput(`📄 输出文件: ${result.output_file}`);
      
      // 记录已完成的文件路径
      let fileName = result.output_file;
      fileName = fileName.split('\\').pop() || fileName;
      fileName = fileName.split('/').pop() || fileName;
      
      if (fileName) {
        this.completedFiles.set(feature, fileName);
        console.log(`📝 记录已完成的功能: ${feature} -> ${fileName}`);
      }
      
      // 3秒后重置状态
      setTimeout(() => {
        this.setExecutionState(feature, 'idle', toolType);
      }, 3000);
    } else {
      // 执行失败 - 更新视觉反馈
      this.setExecutionState(feature, 'error', toolType);
      this.stateManager.addCommandOutput(`❌ ${toolType.toUpperCase()} ${feature} 执行失败: ${result.message}`);
      if (result.stderr) {
        this.stateManager.addCommandOutput(`错误详情: ${result.stderr}`);
      }
      
      // 5秒后重置状态
      setTimeout(() => {
        this.setExecutionState(feature, 'idle', toolType);
      }, 5000);
    }
  }

  /**
   * 处理执行异常
   */
  protected handleExecutionError(
    error: any, 
    feature: string, 
    toolType: 'vol2' | 'vol3' | 'vol3linux'
  ): void {
    console.error(`${toolType.toUpperCase()}功能执行失败:`, error);
    this.setExecutionState(feature, 'error', toolType);
    this.stateManager.addCommandOutput(`❌ ${toolType.toUpperCase()} ${feature} 执行失败: ${error}`);
    
    // 5秒后重置状态
    setTimeout(() => {
      this.setExecutionState(feature, 'idle', toolType);
    }, 5000);
  }

  /**
   * 添加命令到历史记录
   */
  protected addCommandToHistory(
    name: string,
    command: string,
    toolType: 'vol2' | 'vol3' | 'vol3linux'
  ): number {
    const commandId = Date.now() + Math.random();
    this.stateManager.addCommandHistory({
      id: commandId,
      name: `${toolType.toUpperCase()} ${name}`,
      command: command,
      status: 'pending',
      time: new Date().toLocaleString()
    });
    return commandId;
  }

  /**
   * 更新命令状态
   */
  protected updateCommandHistoryStatus(
    commandId: number,
    status: 'pending' | 'running' | 'completed' | 'error',
    output?: string,
    error?: string
  ): void {
    this.stateManager.updateCommandStatus(commandId, status);
    
    if (output || error) {
      const commandHistory = this.stateManager.getCommandHistory();
      const command = commandHistory.find(cmd => cmd.id === commandId);
      if (command) {
        if (output) command.output = output;
        if (error) command.error = error;
      }
    }
  }

  /**
   * 处理执行结果（增强版本，支持命令历史）
   */
  protected handleExecutionResultWithHistory(
    result: any,
    feature: string,
    toolType: 'vol2' | 'vol3' | 'vol3linux',
    commandId: number
  ): void {
    if (result.success) {
      // 执行成功 - 更新视觉反馈
      this.setExecutionState(feature, 'success', toolType);
      this.stateManager.addCommandOutput(`✅ ${toolType.toUpperCase()} ${feature} 执行成功`);
      this.stateManager.addCommandOutput(`📄 输出文件: ${result.output_file}`);
      
      // 更新命令历史状态
      this.updateCommandHistoryStatus(commandId, 'completed', `输出文件: ${result.output_file}`);
      
      // 记录已完成的文件路径
      let fileName = result.output_file;
      fileName = fileName.split('\\').pop() || fileName;
      fileName = fileName.split('/').pop() || fileName;
      
      if (fileName) {
        this.completedFiles.set(feature, fileName);
        console.log(`📝 记录已完成的功能: ${feature} -> ${fileName}`);
      }
      
      // 3秒后重置状态
      setTimeout(() => {
        this.setExecutionState(feature, 'idle', toolType);
      }, 3000);
    } else {
      // 执行失败 - 更新视觉反馈
      this.setExecutionState(feature, 'error', toolType);
      this.stateManager.addCommandOutput(`❌ ${toolType.toUpperCase()} ${feature} 执行失败: ${result.message}`);
      if (result.stderr) {
        this.stateManager.addCommandOutput(`错误详情: ${result.stderr}`);
      }
      
      // 更新命令历史状态
      const errorMessage = result.message + (result.stderr ? `\n${result.stderr}` : '');
      this.updateCommandHistoryStatus(commandId, 'error', undefined, errorMessage);
      
      // 5秒后重置状态
      setTimeout(() => {
        this.setExecutionState(feature, 'idle', toolType);
      }, 5000);
    }
  }

  /**
   * 处理执行异常（增强版本，支持命令历史）
   */
  protected handleExecutionErrorWithHistory(
    error: any,
    feature: string,
    toolType: 'vol2' | 'vol3' | 'vol3linux',
    commandId: number
  ): void {
    console.error(`${toolType.toUpperCase()}功能执行失败:`, error);
    this.setExecutionState(feature, 'error', toolType);
    this.stateManager.addCommandOutput(`❌ ${toolType.toUpperCase()} ${feature} 执行失败: ${error}`);
    
    // 更新命令历史状态
    this.updateCommandHistoryStatus(commandId, 'error', undefined, String(error));
    
    // 5秒后重置状态
    setTimeout(() => {
      this.setExecutionState(feature, 'idle', toolType);
    }, 5000);
  }

  /**
   * 检查并打开已完成的文件
   */
  protected async checkAndOpenExistingFile(feature: string, toolType: 'vol2' | 'vol3' | 'vol3linux', txtPlugins: string[] = []): Promise<boolean> {
    const existingFile = this.completedFiles.get(feature);
    if (existingFile) {
      console.log(`🔍 发现已完成的文件: ${existingFile}，直接打开查看器`);
      try {
        if (txtPlugins.includes(feature)) {
          // 使用文本查看器打开
          await invoke('open_text_viewer', {
            textFilePath: existingFile,
            windowTitle: `${toolType.toUpperCase()} ${feature} - ${existingFile}`
          });
        } else {
          // 使用CSV查看器打开
          await invoke('open_csv_viewer', {
            csvFilePath: existingFile,
            windowTitle: `${toolType.toUpperCase()} ${feature} - ${existingFile}`
          });
        }
        return true;
      } catch (error) {
        console.error('打开查看器失败:', error);
        // 如果打开失败，删除记录的文件并重新执行
        this.completedFiles.delete(feature);
        return false;
      }
    }
    return false;
  }

  /**
   * 恢复已完成功能的状态
   */
  protected async restoreCompletedStates(features: string[], toolType: 'vol2' | 'vol3' | 'vol3linux'): Promise<void> {
    try {
      for (const feature of features) {
        // 检查CSV和TXT文件
        const csvFile = `${toolType}_${feature}.csv`;
        const txtFile = `${toolType}_${feature}.txt`;
        
        try {
          // 尝试检查文件是否存在
          const files = await invoke('read_output_directory') as Array<{name: string}>;
          
          // 检查CSV文件
          if (files.some(file => file.name === csvFile)) {
            this.completedFiles.set(feature, csvFile);
            console.log(`🔄 恢复已完成功能状态: ${feature} -> ${csvFile}`);
            setTimeout(() => {
              this.setExecutionState(feature, 'idle', toolType);
            }, 100);
          }
          // 检查TXT文件
          else if (files.some(file => file.name === txtFile)) {
            this.completedFiles.set(feature, txtFile);
            console.log(`🔄 恢复已完成功能状态: ${feature} -> ${txtFile}`);
            setTimeout(() => {
              this.setExecutionState(feature, 'idle', toolType);
            }, 100);
          }
        } catch (error) {
          // 忽略单个文件检查失败
          console.log(`恢复功能状态失败 ${feature}:`, error);
        }
      }
    } catch (error) {
      console.log(`恢复${toolType.toUpperCase()}状态失败:`, error);
    }
  }
} 