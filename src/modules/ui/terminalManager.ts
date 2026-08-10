import { StateManager } from '../core/stateManager';
import { loadAppSettings } from '../core/settingsHelper';
import { makeDraggable } from '../utils/helpers';
import { getAppVersion } from '../core/appVersion';
import { IconParkHelper } from '../utils/iconparkHelper';

function svgIcon(name: string, size: number = 14): string {
  return IconParkHelper.getSvgString(name, { size, strokeWidth: 3 });
}

interface TerminalCommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exit_code?: number;
  execution_time: number;
  command: string;
  working_directory: string;
}

/**
 * 终端管理器
 * 用于管理终端窗口的创建、显示和交互
 */
export class TerminalManager {
  private stateManager: StateManager;
  private updateStatus: (message: string) => void;
  private currentSettings: any = null;

  constructor(stateManager: StateManager, updateStatus: (message: string) => void) {
    this.stateManager = stateManager;
    this.updateStatus = updateStatus;
  }

  /**
   * 创建终端窗口
   */
  async createTerminalWindow(): Promise<void> {
    try {
      // 加载应用设置
      await this.loadAppSettings();
      
      const terminalWindow = document.createElement('div');
      terminalWindow.className = 'terminal-window';
      terminalWindow.innerHTML = this.renderTerminalWindow();

      document.body.appendChild(terminalWindow);

      // 注入版本号到欢迎文本
      this.injectVersionText(terminalWindow);

      // 绑定事件
      this.bindTerminalEvents(terminalWindow);

      // 添加拖拽功能
      makeDraggable(terminalWindow, '.terminal-window-header');

      // 添加调节大小功能
      this.bindResizeHandles(terminalWindow);

      // 自动聚焦到控制台输入框
      const consoleInput = terminalWindow.querySelector('#console-input') as HTMLInputElement;
      if (consoleInput) {
        setTimeout(() => consoleInput.focus(), 100);
      }

      //console.log('终端窗口已创建');
    } catch (error) {
      console.error('创建终端窗口失败:', error);
      this.updateStatus('终端窗口创建失败');
    }
  }

  /**
   * 加载应用设置
   */
  private async loadAppSettings(): Promise<void> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      this.currentSettings = await loadAppSettings();
      //console.log('已加载应用设置:', this.currentSettings);
    } catch (error) {
      console.error('加载应用设置失败:', error);
      this.currentSettings = {
        python3_path: '',
        volatility3_path: '',
        current_image_path: '',
        output_path: 'output'
      };
    }
  }

  /**
   * 渲染终端窗口
   */
  private renderTerminalWindow(): string {
    return `
      <div class="terminal-window-header">
        <div class="terminal-window-title">
          <span class="terminal-icon">${svgIcon('computer', 16)}</span>
          <span>快速终端</span>
        </div>
        <div class="terminal-window-controls">
          <button class="window-control-btn refresh" data-action="refresh" title="刷新配置">${svgIcon('refresh', 14)}</button>
          <button class="window-control-btn minimize" data-action="minimize">−</button>
          <button class="window-control-btn close" data-action="close">×</button>
        </div>
      </div>
      <div class="terminal-window-content">
        <div class="terminal-input-section">
          <div class="quick-path-buttons">
            <div class="path-buttons-group">
              <label>快速路径插入:</label>
              <div class="path-buttons" id="path-buttons-container">
                ${this.renderAllPathButtons()}
              </div>
            </div>
          </div>
          <div class="terminal-command-section">
            <div class="command-input-group">
              <div class="command-input-container">
                <span class="command-prompt">PS></span>
                <input type="text" class="command-input" id="command-input" placeholder="输入命令..." />
                <button class="execute-btn" id="execute-command-btn" title="执行命令 (Enter)">
                  <span>${svgIcon('play', 14)}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
        <div class="terminal-output-section">
          <div class="output-header">
            <span>终端</span>
            <div class="output-controls">
              <button class="clear-output-btn" id="clear-output-btn" title="清空终端">${svgIcon('delete', 14)}</button>
            </div>
          </div>
          <div class="terminal-console" id="terminal-console">
            <div class="console-content" id="console-content">
              <div class="welcome-message">
                <div class="welcome-text terminal-version-text">Lovelymem V2 Terminal</div>
                <div class="welcome-hint">输入命令开始使用，或点击上方路径按钮快速插入路径</div>
              </div>
            </div>
            <div class="console-input-line" id="console-input-line">
              <span class="console-prompt">PS></span>
              <input type="text" class="console-input" id="console-input" placeholder="" autocomplete="off" spellcheck="false" />
            </div>
          </div>
        </div>
      </div>
      <div class="terminal-window-resize-handle-right"></div>
      <div class="terminal-window-resize-handle-bottom"></div>
      <div class="terminal-window-resize-handle-corner"></div>
    `;
  }

  /**
   * 获取文件名（从完整路径中提取）
   */
  // private getFileName(path: string): string {
  //   if (!path) return '';
  //   const parts = path.split(/[/\\]/);
  //   return parts[parts.length - 1];
  // }

  /**
   * 渲染所有路径按钮
   */
  private renderAllPathButtons(): string {
    const buttons: string[] = [];

    if (!this.currentSettings) {
      return '<div class="no-settings">配置加载中...</div>';
    }

    // 基础路径配置
    const basicPaths = [
      { key: 'python2_path', icon: svgIcon('code', 14), label: 'Python2', title: 'Python2路径' },
      { key: 'python3_path', icon: svgIcon('code', 14), label: 'Python3', title: 'Python3路径' },
      { key: 'memprocfs_path', icon: svgIcon('cpu', 14), label: 'MemProcFS', title: 'MemProcFS路径' },
      { key: 'volatility2_path', icon: svgIcon('search', 14), label: 'Vol2', title: 'Volatility2路径' },
      { key: 'volatility3_path', icon: svgIcon('search', 14), label: 'Vol3', title: 'Volatility3路径' },
      { key: 'current_image_path', icon: svgIcon('save', 14), label: '镜像', title: '当前镜像路径' },
      { key: 'output_path', icon: svgIcon('folder', 14), label: '输出', title: '输出路径' }
    ];

    // 添加基础路径按钮
    basicPaths.forEach(pathConfig => {
      const value = this.currentSettings[pathConfig.key];
      if (value) {
        buttons.push(`
          <button class="path-btn" data-path="${pathConfig.key}" title="${pathConfig.title}: ${value}">
            <span class="path-icon">${pathConfig.icon}</span>
            <span class="path-label">${pathConfig.label}</span>
          </button>
        `);
      }
    });

    // 添加自定义工具按钮
    if (this.currentSettings.custom_tools && this.currentSettings.custom_tools.length > 0) {
      this.currentSettings.custom_tools.forEach((tool: any, index: number) => {
        if (tool.path) {
          buttons.push(`
            <button class="path-btn custom-tool" data-path="custom_tool_${index}" title="自定义工具: ${tool.name} - ${tool.path}">
              <span class="path-icon">${svgIcon('tool', 14)}</span>
              <span class="path-label">${tool.name}</span>
            </button>
          `);
        }
      });
    }

    return buttons.length > 0 ? buttons.join('') : '<div class="no-paths">暂无可用路径配置</div>';
  }

  /**
   * 刷新配置
   */
  private async refreshSettings(terminalWindow: HTMLElement): Promise<void> {
    try {
      // 重新加载设置
      await this.loadAppSettings();

      // 更新路径按钮
      const pathButtonsContainer = terminalWindow.querySelector('#path-buttons-container');
      if (pathButtonsContainer) {
        pathButtonsContainer.innerHTML = this.renderAllPathButtons();

        // 重新绑定路径按钮事件
        this.bindQuickPathEvents(terminalWindow);
      }

      this.updateStatus('配置已刷新');
    } catch (error) {
      console.error('刷新配置失败:', error);
      this.updateStatus('配置刷新失败');
    }
  }

  /**
   * 绑定终端事件
   */
  private bindTerminalEvents(terminalWindow: HTMLElement): void {
    // 窗口控制事件
    this.bindWindowControls(terminalWindow);

    // 快速路径按钮事件
    this.bindQuickPathEvents(terminalWindow);



    // 命令执行事件
    this.bindCommandExecutionEvents(terminalWindow);

    // 控制台事件
    this.bindConsoleEvents(terminalWindow);

    // 输出事件
    this.bindOutputEvents(terminalWindow);
  }

  /**
   * 绑定窗口控制事件
   */
  private bindWindowControls(terminalWindow: HTMLElement): void {
    terminalWindow.querySelectorAll('.window-control-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.getAttribute('data-action');
        
        switch (action) {
          case 'close':
            terminalWindow.remove();
            break;
          case 'minimize':
            terminalWindow.style.display = 'none';
            // 可以添加到任务栏或状态栏的最小化列表
            break;
          case 'refresh':
            this.refreshSettings(terminalWindow);
            break;
        }
      });
    });
  }

  /**
   * 绑定快速路径按钮事件
   */
  private bindQuickPathEvents(terminalWindow: HTMLElement): void {
    const pathButtons = terminalWindow.querySelectorAll('.path-btn');
    pathButtons.forEach(button => {
      button.addEventListener('click', () => {
        const pathType = button.getAttribute('data-path');
        this.insertPathToCommand(terminalWindow, pathType);
      });
    });
  }



  /**
   * 绑定命令执行事件
   */
  private bindCommandExecutionEvents(terminalWindow: HTMLElement): void {
    const executeBtn = terminalWindow.querySelector('#execute-command-btn');
    const commandInput = terminalWindow.querySelector('#command-input') as HTMLInputElement;

    if (executeBtn && commandInput) {
      // 按钮点击事件
      executeBtn.addEventListener('click', () => {
        this.executeCommand(terminalWindow);
      });

      // 回车键执行
      commandInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.executeCommand(terminalWindow);
        }
      });
    }
  }

  /**
   * 绑定控制台事件
   */
  private bindConsoleEvents(terminalWindow: HTMLElement): void {
    const consoleInput = terminalWindow.querySelector('#console-input') as HTMLInputElement;
    const terminalConsole = terminalWindow.querySelector('#terminal-console');

    if (consoleInput) {
      // 回车执行命令
      consoleInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.executeConsoleCommand(terminalWindow);
        }
      });

      // 上下箭头历史记录
      consoleInput.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          this.navigateCommandHistory(terminalWindow, 'up');
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          this.navigateCommandHistory(terminalWindow, 'down');
        }
      });
    }

    // 点击控制台聚焦到输入框
    if (terminalConsole) {
      terminalConsole.addEventListener('click', () => {
        if (consoleInput) {
          consoleInput.focus();
        }
      });
    }
  }

  /**
   * 绑定输出事件
   */
  private bindOutputEvents(terminalWindow: HTMLElement): void {
    const clearBtn = terminalWindow.querySelector('#clear-output-btn');

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this.clearConsole(terminalWindow);
      });
    }
  }



  /**
   * 插入路径到命令输入框
   */
  private insertPathToCommand(terminalWindow: HTMLElement, pathType: string | null): void {
    if (!pathType || !this.currentSettings) return;

    // 优先使用控制台输入框，如果没有则使用命令输入框
    const consoleInput = terminalWindow.querySelector('#console-input') as HTMLInputElement;
    const commandInput = terminalWindow.querySelector('#command-input') as HTMLInputElement;
    const targetInput = consoleInput || commandInput;

    if (!targetInput) return;

    let pathValue = '';
    let displayName = '';

    // 处理自定义工具
    if (pathType.startsWith('custom_tool_')) {
      const toolIndex = parseInt(pathType.replace('custom_tool_', ''));
      if (this.currentSettings.custom_tools && this.currentSettings.custom_tools[toolIndex]) {
        const tool = this.currentSettings.custom_tools[toolIndex];
        pathValue = tool.path || '';
        displayName = tool.name || `自定义工具${toolIndex + 1}`;
      }
    } else {
      // 处理基础路径配置
      pathValue = this.currentSettings[pathType] || '';
      displayName = pathType.replace(/_/g, ' ');
    }

    if (pathValue) {
      // 在光标位置插入路径，如果路径包含空格则加引号
      const needQuotes = pathValue.includes(' ');
      const insertValue = needQuotes ? `"${pathValue}"` : pathValue;

      const cursorPos = targetInput.selectionStart || 0;
      const currentValue = targetInput.value;
      const newValue = currentValue.slice(0, cursorPos) + insertValue + currentValue.slice(cursorPos);

      targetInput.value = newValue;
      targetInput.focus();

      // 设置光标位置到插入内容之后
      const newCursorPos = cursorPos + insertValue.length;
      targetInput.setSelectionRange(newCursorPos, newCursorPos);

      this.updateStatus(`已插入 ${displayName}`);
    } else {
      this.updateStatus(`${displayName} 未配置`);
    }
  }

  /**
   * 执行控制台命令
   */
  private async executeConsoleCommand(terminalWindow: HTMLElement): Promise<void> {
    const consoleInput = terminalWindow.querySelector('#console-input') as HTMLInputElement;
    let command = consoleInput.value.trim();

    if (!command) return;

    // 预处理命令，处理一些常见的组合命令格式
    command = this.preprocessCommand(command);

    // 验证命令
    const validation = this.validateCommand(command);
    if (!validation.isValid) {
      this.addConsoleOutput(terminalWindow, `警告: ${validation.warning}`, 'warning');
    }

    // 添加到命令历史
    this.addToCommandHistory(command);
    this.resetHistoryIndex();

    // 显示命令行
    this.addConsoleOutput(terminalWindow, `PS> ${command}`, 'command');

    // 清空输入框
    consoleInput.value = '';

    // 生成命令ID用于跟踪
    const commandId = Date.now() + Math.random();

    try {
      this.updateStatus('正在执行命令...');

      // 添加到命令历史（初始状态为运行中）
      this.stateManager.addCommandHistory({
        id: commandId,
        name: '终端命令',
        command: command,
        status: 'running',
        time: new Date().toLocaleString()
      });

      // 更新命令窗口显示
      this.updateCommandWindowDisplay();

      // 调用后端执行命令
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke('execute_terminal_command', {
        command: command,
        workingDirectory: this.currentSettings?.output_path || undefined
      }) as TerminalCommandResult;

      // 显示执行结果
      this.displayConsoleResult(terminalWindow, result);

      // 更新命令历史状态
      this.updateCommandHistoryStatus(commandId, result);

      // 如果命令失败但有输出，提供一些帮助信息
      if (!result.success && result.stderr) {
        this.provideErrorHelp(terminalWindow, command, result.stderr);
      }

      this.updateStatus('命令执行完成');
    } catch (error) {
      console.error('命令执行失败:', error);
      this.addConsoleOutput(terminalWindow, `执行错误: ${error}`, 'error');

      // 提供一些常见错误的解决建议
      this.provideErrorHelp(terminalWindow, command, String(error));

      // 更新命令历史为错误状态
      this.updateCommandHistoryStatus(commandId, { success: false, stderr: String(error) });

      this.updateStatus('命令执行失败');
    }
  }

  /**
   * 命令历史相关
   */
  private commandHistory: string[] = [];
  private historyIndex: number = -1;

  private addToCommandHistory(command: string): void {
    // 避免重复的连续命令
    if (this.commandHistory.length === 0 || this.commandHistory[this.commandHistory.length - 1] !== command) {
      this.commandHistory.push(command);
      // 限制历史记录数量
      if (this.commandHistory.length > 100) {
        this.commandHistory.shift();
      }
    }
  }

  private resetHistoryIndex(): void {
    this.historyIndex = this.commandHistory.length;
  }

  private navigateCommandHistory(terminalWindow: HTMLElement, direction: 'up' | 'down'): void {
    const consoleInput = terminalWindow.querySelector('#console-input') as HTMLInputElement;
    if (!consoleInput) return;

    if (direction === 'up') {
      if (this.historyIndex > 0) {
        this.historyIndex--;
        consoleInput.value = this.commandHistory[this.historyIndex] || '';
      }
    } else {
      if (this.historyIndex < this.commandHistory.length - 1) {
        this.historyIndex++;
        consoleInput.value = this.commandHistory[this.historyIndex] || '';
      } else {
        this.historyIndex = this.commandHistory.length;
        consoleInput.value = '';
      }
    }
  }



  /**
   * 执行命令（从上方命令输入框）
   */
  private async executeCommand(terminalWindow: HTMLElement): Promise<void> {
    const commandInput = terminalWindow.querySelector('#command-input') as HTMLInputElement;
    // const executeBtn = terminalWindow.querySelector('#execute-command-btn') as HTMLButtonElement;
    const command = commandInput.value.trim();

    if (!command) {
      this.updateStatus('请输入命令');
      return;
    }

    // 将命令复制到控制台输入框并执行
    const consoleInput = terminalWindow.querySelector('#console-input') as HTMLInputElement;
    if (consoleInput) {
      consoleInput.value = command;
      await this.executeConsoleCommand(terminalWindow);
      // 清空上方的命令输入框
      commandInput.value = '';
    }

  }

  /**
   * 更新命令历史状态
   */
  private updateCommandHistoryStatus(commandId: number, result: any): void {
    const commandHistory = this.stateManager.getCommandHistory();
    const commandIndex = commandHistory.findIndex(cmd => cmd.id === commandId);

    if (commandIndex !== -1) {
      commandHistory[commandIndex].status = result.success ? 'completed' : 'error';
      commandHistory[commandIndex].output = result.stdout;
      commandHistory[commandIndex].error = result.stderr;

      // 更新命令窗口显示
      this.updateCommandWindowDisplay();
    }
  }

  /**
   * 更新命令窗口显示
   */
  private updateCommandWindowDisplay(): void {
    // 检查是否有命令窗口打开
    const commandWindow = document.querySelector('.command-window');
    if (commandWindow) {
      // 动态导入命令窗口管理器并更新显示
      import('./commandWindowManager').then(({ CommandWindowManager }) => {
        const commandWindowManager = new CommandWindowManager(this.stateManager);
        commandWindowManager.updateCommandWindowDisplay();
      }).catch(error => {
        console.error('更新命令窗口显示失败:', error);
      });
    }
  }

  /**
   * 显示控制台执行结果
   */
  private displayConsoleResult(terminalWindow: HTMLElement, result: any): void {
    // 添加调试信息（可选）
    //console.log('命令执行结果:', result);

    if (result.success) {
      if (result.stdout) {
        this.addConsoleOutput(terminalWindow, result.stdout, 'output');
      }
      if (result.stderr) {
        this.addConsoleOutput(terminalWindow, result.stderr, 'warning');
      }
      if (!result.stdout && !result.stderr) {
        this.addConsoleOutput(terminalWindow, '命令执行成功（无输出）', 'success');
      }
    } else {
      this.addConsoleOutput(terminalWindow, result.stderr || '命令执行失败', 'error');
    }

    // 显示执行时间（可选，不显示太多信息保持简洁）
    if (result.execution_time > 1000) {
      this.addConsoleOutput(terminalWindow, `执行时间: ${result.execution_time}ms`, 'info');
    }
  }

  /**
   * 添加控制台输出
   */
  private addConsoleOutput(terminalWindow: HTMLElement, message: string, type: 'command' | 'output' | 'error' | 'warning' | 'success' | 'info'): void {
    const consoleContent = terminalWindow.querySelector('#console-content');
    if (!consoleContent) return;

    // 移除欢迎消息
    const welcomeMessage = consoleContent.querySelector('.welcome-message');
    if (welcomeMessage) {
      welcomeMessage.remove();
    }

    const outputElement = document.createElement('div');
    outputElement.className = `console-line ${type}`;

    // 根据类型设置不同的样式和处理
    if (type === 'command') {
      outputElement.innerHTML = `<span class="command-text">${this.escapeHtml(message)}</span>`;
    } else if (type === 'output') {
      // 处理多行输出，保持原始格式
      const lines = message.split('\n');
      outputElement.innerHTML = lines.map(line => {
        // 处理制表符和特殊空格
        const processedLine = this.escapeHtml(line)
          .replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;') // 制表符转换为4个空格
          .replace(/  /g, '&nbsp;&nbsp;'); // 连续空格保持格式
        return `<span class="output-line">${processedLine}</span>`;
      }).join('<br>');
    } else {
      outputElement.innerHTML = `<span class="message-text">${this.escapeHtml(message)}</span>`;
    }

    consoleContent.appendChild(outputElement);

    // 滚动到底部
    const terminalConsole = terminalWindow.querySelector('#terminal-console');
    if (terminalConsole) {
      terminalConsole.scrollTop = terminalConsole.scrollHeight;
    }
  }

  /**
   * 清空控制台
   */
  private clearConsole(terminalWindow: HTMLElement): void {
    const consoleContent = terminalWindow.querySelector('#console-content');
    if (consoleContent) {
      consoleContent.innerHTML = `
        <div class="welcome-message">
          <div class="welcome-text terminal-version-text">Lovelymem V2 Terminal</div>
          <div class="welcome-hint">输入命令开始使用，或点击上方路径按钮快速插入路径</div>
        </div>
      `;
      this.injectVersionText(terminalWindow);
    }
  }

  /**
   * 注入版本号到终端欢迎文本
   */
  private async injectVersionText(container: HTMLElement): Promise<void> {
    const ver = await getAppVersion();
    container.querySelectorAll('.terminal-version-text').forEach(el => {
      el.textContent = `Lovelymem V2 Terminal ${ver}`;
    });
  }

  /**
   * 预处理命令
   */
  private preprocessCommand(command: string): string {
    // 移除多余的空格
    command = command.replace(/\s+/g, ' ').trim();

    // 处理一些常见的命令格式问题
    // 例如：python "path with spaces" script.py -> "python" "path with spaces" "script.py"

    // 如果命令包含 && 或 || 等组合操作符，确保正确处理
    if (command.includes('&&') || command.includes('||') || command.includes('|')) {
      // 对于复杂的组合命令，不做额外处理，直接传递给系统
      return command;
    }

    // 对于简单命令，确保路径正确引用
    return command;
  }

  /**
   * 验证命令
   */
  private validateCommand(command: string): { isValid: boolean; warning?: string } {
    // 检查是否包含可能有问题的字符组合
    if (command.includes('""')) {
      return {
        isValid: false,
        warning: '命令中包含空引号，可能导致执行失败'
      };
    }

    // 检查引号是否匹配
    const singleQuotes = (command.match(/'/g) || []).length;
    const doubleQuotes = (command.match(/"/g) || []).length;

    if (singleQuotes % 2 !== 0) {
      return {
        isValid: false,
        warning: '单引号不匹配，可能导致命令解析错误'
      };
    }

    if (doubleQuotes % 2 !== 0) {
      return {
        isValid: false,
        warning: '双引号不匹配，可能导致命令解析错误'
      };
    }

    // 检查是否是潜在的危险命令
    const dangerousCommands = ['rm -rf', 'del /f /s /q', 'format', 'fdisk'];
    const lowerCommand = command.toLowerCase();

    for (const dangerous of dangerousCommands) {
      if (lowerCommand.includes(dangerous)) {
        return {
          isValid: false,
          warning: `检测到潜在危险命令: ${dangerous}`
        };
      }
    }

    return { isValid: true };
  }

  /**
   * 提供错误帮助信息
   */
  private provideErrorHelp(terminalWindow: HTMLElement, command: string, errorMessage: string): void {
    const lowerError = errorMessage.toLowerCase();
    const lowerCommand = command.toLowerCase();

    let helpMessage = '';

    // 编码相关错误
    if (lowerError.includes('encoding') || lowerError.includes('codec') || lowerError.includes('utf-8') || lowerError.includes('gbk')) {
      helpMessage = '提示: 检测到编码问题，尝试在命令前添加 "chcp 65001 &&" 或检查文件编码';
    }
    // Python 相关错误
    else if (lowerError.includes('python') && lowerError.includes('not found')) {
      helpMessage = '提示: Python 未找到，请检查 Python 路径配置或使用完整路径';
    }
    // 文件未找到错误
    else if (lowerError.includes('no such file') || lowerError.includes('cannot find') || lowerError.includes('not found')) {
      helpMessage = '提示: 文件或命令未找到，请检查路径是否正确，或使用绝对路径';
    }
    // 权限错误
    else if (lowerError.includes('permission') || lowerError.includes('access denied')) {
      helpMessage = '提示: 权限不足，尝试以管理员身份运行或检查文件权限';
    }
    // Volatility 相关错误
    else if (lowerCommand.includes('vol') && (lowerError.includes('profile') || lowerError.includes('image'))) {
      helpMessage = '提示: Volatility 镜像或配置文件问题，检查镜像路径和格式是否正确';
    }
    // 语法错误
    else if (lowerError.includes('syntax') || lowerError.includes('invalid')) {
      helpMessage = '提示: 命令语法错误，检查命令格式和参数是否正确';
    }

    if (helpMessage) {
      this.addConsoleOutput(terminalWindow, helpMessage, 'info');
    }
  }

  /**
   * 转义HTML
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }





  /**
   * 绑定调节大小功能
   */
  private bindResizeHandles(terminalWindow: HTMLElement): void {
    const rightHandle = terminalWindow.querySelector('.terminal-window-resize-handle-right');
    const bottomHandle = terminalWindow.querySelector('.terminal-window-resize-handle-bottom');
    const cornerHandle = terminalWindow.querySelector('.terminal-window-resize-handle-corner');

    if (rightHandle) {
      this.bindResizeHandle(rightHandle, terminalWindow, 'right');
    }
    if (bottomHandle) {
      this.bindResizeHandle(bottomHandle, terminalWindow, 'bottom');
    }
    if (cornerHandle) {
      this.bindResizeHandle(cornerHandle, terminalWindow, 'corner');
    }
  }

  /**
   * 绑定单个调节大小手柄
   */
  private bindResizeHandle(handle: Element, window: HTMLElement, direction: 'right' | 'bottom' | 'corner'): void {
    let isResizing = false;
    let startX = 0;
    let startY = 0;
    let startWidth = 0;
    let startHeight = 0;

    handle.addEventListener('mousedown', (e: Event) => {
      const mouseEvent = e as MouseEvent;
      isResizing = true;
      startX = mouseEvent.clientX;
      startY = mouseEvent.clientY;
      startWidth = parseInt(getComputedStyle(window).width, 10);
      startHeight = parseInt(getComputedStyle(window).height, 10);

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      e.preventDefault();
    });

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      if (direction === 'right' || direction === 'corner') {
        const newWidth = Math.max(400, startWidth + deltaX);
        window.style.width = `${newWidth}px`;
      }

      if (direction === 'bottom' || direction === 'corner') {
        const newHeight = Math.max(300, startHeight + deltaY);
        window.style.height = `${newHeight}px`;
      }
    };

    const handleMouseUp = () => {
      isResizing = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }
}
