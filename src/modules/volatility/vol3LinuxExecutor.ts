/**
 * Vol3Linux 执行器
 * 
 * 实现 Volatility3 Linux 特定的功能执行逻辑:
 * - 支持 offline 模式
 * - 支持代理设置
 * - TXT/CSV 格式自动判断
 * - Linux 特有插件支持
 */

import { invoke } from '@tauri-apps/api/core';
import { VolatilityExecutor, type VolatilityResult } from './volatilityExecutor';
import type { StateManager } from '../core/stateManager';
import type { ModernUIRenderer } from '../ui/modernUIRenderer';
import type { CommandWindowManager } from '../ui/commandWindowManager';

/**
 * Vol3Linux 执行器
 */
export class Vol3LinuxExecutor extends VolatilityExecutor {
  // 使用 TXT 格式输出的 Linux 特有插件列表
  private readonly txtPlugins = ['psaux'];

  constructor(
    stateManager: StateManager,
    uiRenderer: ModernUIRenderer,
    commandWindowManager: CommandWindowManager
  ) {
    super(stateManager, uiRenderer, commandWindowManager);
  }

  protected getToolName(): string {
    return 'Vol3Linux';
  }

  /**
   * 判断是否为 TXT 格式的插件
   */
  private isTxtPlugin(feature: string): boolean {
    return this.txtPlugins.includes(feature);
  }

  /**
   * 设置 Vol3Linux 执行状态的视觉反馈
   */
  protected setExecutionState(
    feature: string,
    state: 'idle' | 'running' | 'success' | 'error'
  ): void {
    // 尝试查找功能卡片,先尝试带vol3linux-前缀的,再尝试不带前缀的
    let featureCard = document.querySelector(`[data-feature="vol3linux-${feature}"]`);
    if (!featureCard) {
      featureCard = document.querySelector(`[data-feature="${feature}"]`);
    }
    if (!featureCard) {
      console.warn(`未找到功能卡片: ${feature}`);
      return;
    }

    // 移除所有状态类
    featureCard.classList.remove('vol3linux-idle', 'vol3linux-running', 'vol3linux-success', 'vol3linux-error', 'vol3linux-completed');
    
    // 添加新状态类
    featureCard.classList.add(`vol3linux-${state}`);

    // 获取功能卡片中的图标和标题
    const icon = featureCard.querySelector('.feature-icon') as HTMLElement;
    const title = featureCard.querySelector('.feature-title') as HTMLElement;
    const description = featureCard.querySelector('.feature-description') as HTMLElement;

    if (!icon || !title) return;

    switch (state) {
      case 'running':
        // 执行中状态
        icon.textContent = '⏳';
        if (title) title.style.color = '#ff6b6b';
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
          featureCard.classList.add('vol3linux-completed');
          
          // 根据功能类型显示不同图标
          if (this.isTxtPlugin(feature)) {
            icon.textContent = '📝'; // 文本图标
            if (description) description.textContent = '点击查看文本结果';
          } else {
            icon.textContent = '📊'; // CSV图标
            if (description) description.textContent = '点击查看CSV结果';
          }
          
          if (title) title.style.color = '#ff6b6b'; // Vol3Linux主题色表示已完成
        } else {
          // 根据功能恢复原始图标和描述
          this.resetVol3LinuxFeatureCardToDefault(feature, icon, description);
        }
        break;
    }
  }

  /**
   * 重置 Vol3Linux 功能卡片到默认状态
   */
  private resetVol3LinuxFeatureCardToDefault(
    feature: string,
    icon: HTMLElement,
    description: HTMLElement
  ): void {
    // 定义默认图标和描述的映射(Linux 特有)
    const defaults: Record<string, { icon: string; desc: string }> = {
      'pslist': { icon: '🐧', desc: 'Linux进程列表' },
      'bash': { icon: '💻', desc: 'Bash历史记录' },
      'mountinfo': { icon: '💾', desc: '挂载信息' },
      'lsmod': { icon: '🔧', desc: '内核模块' },
      'psaux': { icon: '📋', desc: 'ps aux输出' }
    };

    const def = defaults[feature];
    if (def) {
      icon.textContent = def.icon;
      if (description) description.textContent = def.desc;
    } else {
      // 默认图标
      icon.textContent = '🐧';
      if (description) description.textContent = '点击执行';
    }
  }

  /**
   * 执行 Vol3Linux 功能
   */
  async executeFeature(feature: string): Promise<void> {
    console.log('🔍 执行Vol3Linux功能:', feature);

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
    const offlineCheckbox = document.getElementById('vol3linux-offline') as HTMLInputElement;
    const offline = offlineCheckbox?.checked || false;
    
    const proxyCheckbox = document.getElementById('vol3linux-proxy') as HTMLInputElement;
    const useProxy = proxyCheckbox?.checked || false;
    
    const proxyUrlInput = document.getElementById('vol3linux-proxy-url') as HTMLInputElement;
    const proxyUrl = useProxy ? proxyUrlInput?.value : null;

    // 设置输出路径
    const outputPath = settings.output_path || 'output';

    // 生成完整的命令行用于记录
    const offlineFlag = offline ? '--offline' : '';
    const proxyFlag = useProxy && proxyUrl ? `--proxy ${proxyUrl}` : '';
    const commandLine = `${settings.python3_path} -m volatility3 -f "${currentImage.path}" ${offlineFlag} ${proxyFlag} linux.${feature} --output-dir "${outputPath}"`;

    // 添加到命令历史
    const commandId = this.addCommandToHistory(`Vol3Linux ${feature}`, commandLine);

    try {
      // 开始执行 - 添加视觉反馈
      this.setRunningState(feature, commandId);

      // 调用后端命令
      const result = await invoke('execute_vol3linux', {
        pythonPath: settings.python3_path,
        volatility3Path: settings.volatility3_path,
        imagePath: currentImage.path,
        plugin: feature,
        offline: offline,
        useProxy: useProxy,
        proxyUrl: proxyUrl,
        outputDir: outputPath
      }) as VolatilityResult;

      if (result.success) {
        this.handleSuccess(feature, commandId, result);
      } else {
        this.handleFailure(feature, commandId, result);
      }
    } catch (error) {
      this.handleException(feature, commandId, error);
    }
  }
}
