/**
 * Volatility3 执行器
 * 
 * 实现 Volatility3 特定的功能执行逻辑:
 * - 支持 offline 模式
 * - TXT/CSV 格式自动判断
 * - 功能卡片视觉反馈
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { VolatilityExecutor, type VolatilityResult } from './volatilityExecutor';
import type { StateManager } from '../core/stateManager';
import type { ModernUIRenderer } from '../ui/modernUIRenderer';
import type { CommandWindowManager } from '../ui/commandWindowManager';

/**
 * Vol3 进度事件数据
 */
interface Vol3ProgressEvent {
  plugin: string;
  message: string;
  stage: string; // 'starting' | 'running' | 'completed' | 'error' | 'cancelled'
}

/**
 * Volatility3 执行器
 */
export class Volatility3Executor extends VolatilityExecutor {
  private progressUnlisten: UnlistenFn | null = null;

  // 使用 TXT 格式输出的插件列表
  private readonly txtPlugins = [
    'info',
    'banners',
    'crashinfo',
    'envars',
    'getservicesids',
    'getsids',
    'hashdump',
    'lsadump',
    'printkey',
    'registry.printkey',
    'cachedump',
  ];

  constructor(
    stateManager: StateManager,
    uiRenderer: ModernUIRenderer,
    commandWindowManager: CommandWindowManager
  ) {
    super(stateManager, uiRenderer, commandWindowManager);
  }

  protected getToolName(): string {
    return 'Volatility3';
  }

  /**
   * 判断是否为 TXT 格式的插件
   */
  private isTxtPlugin(feature: string): boolean {
    return this.txtPlugins.includes(feature);
  }

  /**
   * 设置 Volatility3 执行状态的视觉反馈
   */
  protected setExecutionState(
    feature: string,
    state: 'idle' | 'running' | 'success' | 'error'
  ): void {
    // 尝试查找功能卡片,先尝试带vol3-前缀的,再尝试不带前缀的
    let featureCard = document.querySelector(`[data-feature="vol3-${feature}"]`);
    if (!featureCard) {
      featureCard = document.querySelector(`[data-feature="${feature}"]`);
    }
    if (!featureCard) {
      console.warn(`未找到功能卡片: ${feature}`);
      return;
    }

    // 移除所有状态类
    featureCard.classList.remove('vol3-idle', 'vol3-running', 'vol3-success', 'vol3-error', 'vol3-completed');
    
    // 添加新状态类
    featureCard.classList.add(`vol3-${state}`);

    // 获取功能卡片中的图标和标题
    const icon = featureCard.querySelector('.feature-icon') as HTMLElement;
    const title = featureCard.querySelector('.feature-title') as HTMLElement;
    const description = featureCard.querySelector('.feature-description') as HTMLElement;

    if (!icon || !title) return;

    switch (state) {
      case 'running':
        // 执行中状态
        icon.textContent = '⏳';
        if (title) title.style.color = '#4ecdc4';
        if (description) description.textContent = '正在执行中...';
        featureCard.classList.add('pulse-animation');
        break;
        
      case 'success':
        // 成功状态
        icon.textContent = '✅';
        if (title) title.style.color = '#38a169';
        if (description) description.textContent = '执行成功！';
        featureCard.classList.add('success-animation');
        break;
        
      case 'error':
        // 错误状态
        icon.textContent = '❌';
        if (title) title.style.color = '#e53e3e';
        if (description) description.textContent = '执行失败';
        featureCard.classList.add('error-animation');
        break;
        
      case 'idle':
      default:
        // 重置到默认状态或已完成状态
        featureCard.classList.remove('pulse-animation', 'success-animation', 'error-animation');
        if (title) title.style.color = '';
        
        // 检查是否有已完成的文件
        if (this.completedFiles.has(feature)) {
          // 已完成状态 - 显示特殊标识
          featureCard.classList.add('vol3-completed');
          
          // 根据功能类型显示不同图标
          if (this.isTxtPlugin(feature)) {
            icon.textContent = '📝'; // 文本图标
            if (description) description.textContent = '点击查看文本结果';
          } else {
            icon.textContent = '📊'; // CSV图标
            if (description) description.textContent = '点击查看CSV结果';
          }
          
          if (title) title.style.color = '#4ecdc4'; // Volatility3主题色表示已完成
        } else {
          // 根据功能恢复原始图标和描述
          this.resetVol3FeatureCardToDefault(feature, icon, description);
        }
        break;
    }
  }

  /**
   * 重置 Vol3 功能卡片到默认状态
   */
  private resetVol3FeatureCardToDefault(
    feature: string,
    icon: HTMLElement,
    description: HTMLElement
  ): void {
    // 定义默认图标和描述的映射
    const defaults: Record<string, { icon: string; desc: string }> = {
      'pslist': { icon: '📋', desc: '列出所有进程' },
      'pstree': { icon: '🌳', desc: '进程树视图' },
      'cmdline': { icon: '⌨️', desc: '进程命令行' },
      'filescan': { icon: '📁', desc: '扫描文件对象' },
      'netscan': { icon: '🌐', desc: '网络连接扫描' },
      'dlllist': { icon: '📚', desc: 'DLL列表' },
      'handles': { icon: '🔗', desc: '句柄列表' },
      'modules': { icon: '🧩', desc: '内核模块' },
      'envars': { icon: '🔧', desc: '环境变量' },
      'malfind': { icon: '🔍', desc: '恶意代码检测' }
    };

    const def = defaults[feature];
    if (def) {
      icon.textContent = def.icon;
      if (description) description.textContent = def.desc;
    } else {
      // 默认图标
      icon.textContent = '🔹';
      if (description) description.textContent = '点击执行';
    }
  }

  /**
   * 取消正在运行的 Volatility3 命令
   */
  async cancelExecution(): Promise<void> {
    try {
      const result = await invoke('cancel_volatility3') as string;
      this.stateManager.addCommandOutput(`⚠️ ${result}`);
    } catch (error) {
      console.error('取消执行失败:', error);
    }
  }

  /**
   * 启动进度事件监听
   */
  private async startProgressListener(feature: string): Promise<void> {
    // 清理上一次的监听器
    await this.stopProgressListener();

    this.progressUnlisten = await listen<Vol3ProgressEvent>('vol3-progress', (event) => {
      const { plugin, message, stage } = event.payload;
      if (plugin !== feature) return;

      // 清理进度消息：移除进度条特殊字符，提取有用信息
      const cleanMessage = this.cleanProgressMessage(message);

      // 更新功能卡片描述显示实时进度
      let featureCard = document.querySelector(`[data-feature="vol3-${feature}"]`);
      if (!featureCard) {
        featureCard = document.querySelector(`[data-feature="${feature}"]`);
      }
      if (featureCard) {
        const description = featureCard.querySelector('.feature-description') as HTMLElement;
        if (description && stage === 'running' && cleanMessage) {
          // 截断过长的消息
          const displayMsg = cleanMessage.length > 60 ? cleanMessage.substring(0, 57) + '...' : cleanMessage;
          description.textContent = displayMsg;
        }
      }

      // 同时输出到命令窗口（关键信息 + 符号表下载进度）
      if (stage === 'starting' || stage === 'completed' || stage === 'error' || stage === 'cancelled') {
        this.stateManager.addCommandOutput(`[Vol3] ${cleanMessage}`);
      } else if (stage === 'running' && cleanMessage) {
        // 符号表下载/更新/缓存进度：包含百分比或关键词时也输出到命令窗口
        if (/\d+%|downloading|retrieving|automagic|reading|scanning|progress|caching|building|identifier|updating|symbol|cache|stacking|running/i.test(cleanMessage)) {
          this.stateManager.addCommandOutput(`[Vol3] ${cleanMessage}`);
        }
      }
    });
  }

  /**
   * 清理进度消息：移除进度条特殊字符，提取有用信息
   */
  private cleanProgressMessage(message: string): string {
    let cleaned = message;
    // 移除 ANSI 转义序列
    cleaned = cleaned.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
    // 移除进度条字符（█░▓▒等）
    cleaned = cleaned.replace(/[█░▓▒■□▪▫●○◆◇]/g, '');
    // 压缩多余空格
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    return cleaned;
  }

  /**
   * 停止进度事件监听
   */
  private async stopProgressListener(): Promise<void> {
    if (this.progressUnlisten) {
      this.progressUnlisten();
      this.progressUnlisten = null;
    }
  }

  /**
   * 执行 Volatility3 功能
   */
  async executeFeature(feature: string): Promise<void> {
    console.log('🔍 执行Volatility3功能:', feature);

    // 检查是否已有完成的文件,如果有则直接打开查看器
    const fileExists = await this.checkAndOpenExistingFile(
      feature,
      (f) => this.isTxtPlugin(f)
    );
    if (fileExists) {
      return;
    }

    // 验证基础配置
    const { settings, currentImage, valid } = await this.validateBasicSettings();
    if (!valid) return;

    // 验证 Volatility3 配置
    if (!settings.python3_path || !settings.volatility3_path) {
      this.stateManager.addCommandOutput('❌ 请先在设置中配置Python3和Volatility3路径');
      return;
    }

    // 获取配置选项
    const offlineCheckbox = document.getElementById('vol3-offline') as HTMLInputElement;
    const offline = offlineCheckbox?.checked || false;

    // 设置输出路径
    const outputPath = settings.output_path || 'output';

    // 生成完整的命令行用于记录
    const offlineFlag = offline ? '--offline' : '';
    const commandLine = `${settings.python3_path} -m volatility3 -f "${currentImage.path}" ${offlineFlag} ${feature} --output-dir "${outputPath}"`;

    // 添加到命令历史
    const commandId = this.addCommandToHistory(`Volatility3 ${feature}`, commandLine);

    try {
      // 开始执行 - 添加视觉反馈
      this.setRunningState(feature, commandId);

      // 启动进度事件监听
      await this.startProgressListener(feature);

      // 调用后端命令
      const result = await invoke('execute_volatility3', {
        pythonPath: settings.python3_path,
        volatility3Path: settings.volatility3_path,
        imagePath: currentImage.path,
        plugin: feature,
        offline: offline,
        outputDir: outputPath
      }) as VolatilityResult;

      // 停止进度监听
      await this.stopProgressListener();

      if (result.success) {
        this.handleSuccess(feature, commandId, result);
      } else {
        this.handleFailure(feature, commandId, result);
      }
    } catch (error) {
      await this.stopProgressListener();
      this.handleException(feature, commandId, error);
    }
  }
}
