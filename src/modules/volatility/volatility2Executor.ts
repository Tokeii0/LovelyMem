/**
 * Volatility2 执行器
 * 
 * 实现 Volatility2 特定的功能执行逻辑:
 * - 支持 Profile 配置
 * - TEXT/JSON 格式自动判断
 * - clipboard 特殊处理(同时执行普通和详细模式)
 * - macOS 平台检测
 */

import { invoke } from '@tauri-apps/api/core';
import { loadAppSettings } from '../core/settingsHelper';
import { VolatilityExecutor, type VolatilityResult } from './volatilityExecutor';
import type { StateManager } from '../core/stateManager';
import type { ModernUIRenderer } from '../ui/modernUIRenderer';
import type { CommandWindowManager } from '../ui/commandWindowManager';

/**
 * 平台检测结果接口
 */
interface PlatformInfo {
  isWindows: boolean;
  isMacOS: boolean;
  isLinux: boolean;
}

/**
 * 平台检测函数
 */
function detectPlatform(): PlatformInfo {
  const userAgent = navigator.userAgent.toLowerCase();
  const platform = navigator.platform.toLowerCase();

  return {
    isWindows: platform.includes('win'),
    isMacOS: platform.includes('mac'),
    isLinux: platform.includes('linux')
  };
}

/**
 * Volatility2 执行器
 */
export class Volatility2Executor extends VolatilityExecutor {
  // 使用 TEXT 格式输出的功能列表
  // 注意：这些插件在 Volatility2 中只实现了 render_text，不支持 --output=json，
  //       若走 json→csv 流程会报错，必须用 text 输出。
  //       需与 Volatility2WorkspaceV2Renderer 的 txtPlugins 保持一致。
  private readonly textPlugins = [
    // 系统信息
    'imageinfo',
    'verinfo',
    'shutdowntime',
    'vboxinfo',
    'atoms',
    'atomscan',
    // 进程分析
    'cmdscan',
    'consoles',
    // 内存分析
    'vadinfo',
    // 注册表
    'printkey',
    'dumpregistry',
    'auditpol',
    // 安全分析
    'hashdump',
    'malfind',
    'apihooks',
    'eventhooks',
    'messagehooks',
    'mimikatz',
    'truecryptmaster',
    'truecryptpassphrase',
    'truecryptsummary',
    // 内核分析
    'ssdt',
    'driverirp',
    'callbacks',
    // 文件系统
    'mftparser',
    // GUI 分析
    'windows',
    'wintree',
    'deskscan',
    'session',
    'clipboard',
    'editbox',
    // 浏览器取证
    'iehistory',
    'chromehistory',
    'firefoxhistory',
  ];

  constructor(
    stateManager: StateManager,
    uiRenderer: ModernUIRenderer,
    commandWindowManager: CommandWindowManager
  ) {
    super(stateManager, uiRenderer, commandWindowManager);
  }

  protected getToolName(): string {
    return 'Volatility2';
  }

  /**
   * 判断是否为 TEXT 格式的插件
   */
  private isTextPlugin(feature: string): boolean {
    return this.textPlugins.includes(feature);
  }

  /**
   * 设置 Volatility2 执行状态的视觉反馈
   */
  protected setExecutionState(
    feature: string,
    state: 'idle' | 'running' | 'success' | 'error'
  ): void {
    // 尝试查找功能卡片，先尝试带vol2-前缀的，再尝试不带前缀的
    let featureCard = document.querySelector(`[data-feature="vol2-${feature}"]`);
    if (!featureCard) {
      featureCard = document.querySelector(`[data-feature="${feature}"]`);
    }
    
    if (!featureCard) {
      console.warn(`未找到功能卡片: ${feature}`);
      return;
    }

    // 移除所有状态类
    featureCard.classList.remove('vol2-idle', 'vol2-running', 'vol2-success', 'vol2-error', 'vol2-completed');
    
    // 添加新状态类
    featureCard.classList.add(`vol2-${state}`);

    // 获取功能卡片中的图标和标题
    const icon = featureCard.querySelector('.feature-icon') as HTMLElement;
    const title = featureCard.querySelector('.feature-title') as HTMLElement;
    const description = featureCard.querySelector('.feature-description') as HTMLElement;

    if (!icon || !title) return;

    switch (state) {
      case 'running':
        // 执行中状态
        icon.textContent = '⏳';
        if (title) title.style.color = '#f9a825';
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
          featureCard.classList.add('vol2-completed');
          
          // 根据功能类型显示不同图标
          if (this.isTextPlugin(feature)) {
            icon.textContent = '📝'; // 文本图标
            if (description) description.textContent = '点击查看文本结果';
          } else {
            icon.textContent = '📊'; // CSV图标
            if (description) description.textContent = '点击查看CSV结果';
          }
          
          if (title) title.style.color = '#f9a825'; // Volatility2主题色表示已完成
        } else {
          // 根据功能恢复原始图标和描述
          this.resetFeatureCardToDefault(feature, icon, description);
        }
        break;
    }
  }

  /**
   * 重置功能卡片到默认状态
   */
  private resetFeatureCardToDefault(
    feature: string,
    icon: HTMLElement,
    description: HTMLElement
  ): void {
    // 定义默认图标和描述的映射
    const defaults: Record<string, { icon: string; desc: string }> = {
      'pslist': { icon: '📋', desc: '列出进程' },
      'pstree': { icon: '🌳', desc: '进程树' },
      'psscan': { icon: '🔍', desc: '扫描进程' },
      'dlllist': { icon: '📚', desc: 'DLL列表' },
      'handles': { icon: '🔗', desc: '句柄' },
      'cmdline': { icon: '⌨️', desc: '命令行' },
      'filescan': { icon: '📁', desc: '文件扫描' },
      'netscan': { icon: '🌐', desc: '网络扫描' }
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
   * 检查并打开已存在的文件
   * Volatility2 特殊处理: 需要构建完整路径
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
      // 获取设置以构建完整路径
      const settings = await loadAppSettings();
      const outputPath = settings.output_path || 'output';
      const fullFilePath = `${outputPath}\\${existingFile}`;
      
      // 判断是否为text格式的功能或TXT文件
      const viewerCommand = (isTextPlugin(feature) || existingFile.endsWith('.txt')) 
        ? 'open_text_viewer' 
        : 'open_csv_viewer';
      
      await invoke(viewerCommand, {
        [viewerCommand === 'open_text_viewer' ? 'textFilePath' : 'csvFilePath']: fullFilePath,
        windowTitle: `${this.getToolName()} ${feature} - ${existingFile}`
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
   * 执行 Volatility2 功能
   */
  async executeFeature(feature: string): Promise<void> {
    console.log('🔍 执行Volatility2功能:', feature);

    // macOS 下禁用 Volatility2 功能
    const { isMacOS } = detectPlatform();
    if (isMacOS) {
      this.stateManager.addCommandOutput('❌ Volatility2 功能在 macOS 系统下不可用');
      return;
    }

    // 检查是否已有完成的文件,如果有则直接打开查看器
    const fileExists = await this.checkAndOpenExistingFile(
      feature,
      (f) => this.isTextPlugin(f)
    );
    if (fileExists) {
      return;
    }

    // 验证基础配置
    const { settings, currentImage, valid } = await this.validateBasicSettings();
    if (!valid) return;

    // 验证 Volatility2 配置
    if (!settings.python2_path || !settings.volatility2_path) {
      this.stateManager.addCommandOutput('❌ 请先在设置中配置Python2和Volatility2路径');
      return;
    }

    // 获取 Profile 配置
    const profileSelect = document.getElementById('vol2-profile') as HTMLSelectElement;
    const profile = profileSelect?.value || 'Win7SP1x64';
    
    // 根据功能类型决定输出格式
    const outputFormat = this.isTextPlugin(feature) ? 'text' : 'json';
    const fileExtension = this.isTextPlugin(feature) ? 'txt' : 'json';

    // 生成输出文件名(无时间戳)
    const outputFileName = `vol2_${feature}.${fileExtension}`;
    const outputPath = settings.output_path || 'output';
    const outputFile = `${outputPath}/${outputFileName}`;

    // 生成完整的命令行用于记录（包含 --plugin= 参数，与后端一致）
    const pluginArg = settings.volatility2_plugin ? `--plugin=${settings.volatility2_plugin} ` : '';
    const commandLine = `${settings.python2_path} ${settings.volatility2_path} ${pluginArg}-f "${currentImage.path}" --profile=${profile} ${feature} --output=${outputFormat} --output-file="${outputFile}"`;

    // 添加到命令历史
    const commandId = this.addCommandToHistory(`Volatility2 ${feature}`, commandLine);

    try {
      // 开始执行 - 添加视觉反馈
      this.setRunningState(feature, commandId);

      // 如果是 clipboard,同时执行两个版本(普通版本和详细版本)
      let result: VolatilityResult;
      let verboseResult: VolatilityResult | null = null;
      let verboseCommandId: number | null = null;

      if (feature === 'clipboard') {
        await this.executeClipboardFeature(
          settings,
          currentImage,
          profile,
          outputFormat,
          outputPath,
          outputFile,
          commandId
        );
        return;
      }

      // 其他功能只执行一次
      result = await invoke('execute_volatility2', {
        python2Path: settings.python2_path,
        volatility2Path: settings.volatility2_path,
        volatility2Plugin: settings.volatility2_plugin || '',
        imagePath: currentImage.path,
        profile: profile,
        plugin: feature,
        outputType: outputFormat,
        outputFile: outputFile,
        extraArgs: null
      }) as VolatilityResult;

      if (result.success) {
        // 添加额外的格式转换提示
        const extraMessage = this.isTextPlugin(feature) 
          ? '📝 文本格式输出已保存'
          : (result.output_file?.endsWith('.csv') ? '📊 JSON输出已自动转换为CSV格式' : '');
        
        if (extraMessage) {
          this.stateManager.addCommandOutput(extraMessage);
        }
        
        this.handleSuccess(feature, commandId, result);
      } else {
        this.handleFailure(feature, commandId, result);
      }
    } catch (error) {
      this.handleException(feature, commandId, error);
    }
  }

  /**
   * 执行 clipboard 特殊功能(同时执行普通和详细模式)
   */
  private async executeClipboardFeature(
    settings: any,
    currentImage: any,
    profile: string,
    outputFormat: string,
    outputPath: string,
    outputFile: string,
    commandId: number
  ): Promise<void> {
    this.stateManager.addCommandOutput(`🚀 同时执行 clipboard 和 clipboard -v (详细模式)...`);

    // 生成详细模式的输出文件名
    const verboseOutputFileName = `vol2_clipboard_verbose.txt`;
    const verboseOutputFile = `${outputPath}/${verboseOutputFileName}`;

    // 添加详细模式命令到历史
    const verboseCommandId = Date.now() + Math.random();
    const verboseCommandLine = `${settings.python2_path} ${settings.volatility2_path} -f "${currentImage.path}" --profile=${profile} clipboard -v --output=${outputFormat} --output-file="${verboseOutputFile}"`;
    this.stateManager.addCommandHistory({
      id: verboseCommandId,
      name: `Volatility2 clipboard -v`,
      command: verboseCommandLine,
      status: 'running',
      time: new Date().toLocaleString()
    });
    this.commandWindowManager.updateCommandWindowDisplay();

    // 同时执行两个命令
    const [result, verboseResult] = await Promise.all([
      invoke('execute_volatility2', {
        python2Path: settings.python2_path,
        volatility2Path: settings.volatility2_path,
        volatility2Plugin: settings.volatility2_plugin || '',
        imagePath: currentImage.path,
        profile: profile,
        plugin: 'clipboard',
        outputType: outputFormat,
        outputFile: outputFile,
        extraArgs: null
      }),
      invoke('execute_volatility2', {
        python2Path: settings.python2_path,
        volatility2Path: settings.volatility2_path,
        volatility2Plugin: settings.volatility2_plugin || '',
        imagePath: currentImage.path,
        profile: profile,
        plugin: 'clipboard',
        outputType: outputFormat,
        outputFile: verboseOutputFile,
        extraArgs: ['-v']
      })
    ]) as [VolatilityResult, VolatilityResult];

    // 处理普通版本结果
    if (result.success) {
      // 添加格式转换提示
      if (this.isTextPlugin('clipboard')) {
        this.stateManager.addCommandOutput('📝 文本格式输出已保存');
      } else if (result.output_file?.endsWith('.csv')) {
        this.stateManager.addCommandOutput('📊 JSON输出已自动转换为CSV格式');
      }
      
      this.handleSuccess('clipboard', commandId, result);
    } else {
      this.handleFailure('clipboard', commandId, result);
    }

    // 处理详细版本结果
    if (verboseResult.success) {
      this.stateManager.addCommandOutput(`✅ Volatility2 clipboard -v 执行成功`);
      this.stateManager.addCommandOutput(`📄 详细输出文件: ${verboseResult.output_file}`);

      // 更新命令状态为完成
      this.stateManager.updateCommandStatus(verboseCommandId, 'completed');

      // 更新命令记录的输出信息
      const verboseCommandHistory = this.stateManager.getCommandHistory();
      const verboseCommand = verboseCommandHistory.find(cmd => cmd.id === verboseCommandId);
      if (verboseCommand) {
        verboseCommand.output = `输出文件: ${verboseResult.output_file}`;
      }
    } else {
      this.stateManager.addCommandOutput(`❌ Volatility2 clipboard -v 执行失败: ${verboseResult.message}`);
      this.stateManager.updateCommandStatus(verboseCommandId, 'error');

      // 更新命令记录的错误信息
      const verboseCommandHistory = this.stateManager.getCommandHistory();
      const verboseCommand = verboseCommandHistory.find(cmd => cmd.id === verboseCommandId);
      if (verboseCommand) {
        verboseCommand.error = verboseResult.message + (verboseResult.stderr ? `\n${verboseResult.stderr}` : '');
      }
    }

    this.commandWindowManager.updateCommandWindowDisplay();
  }
}
