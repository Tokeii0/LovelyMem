import { StateManager } from '../core/stateManager';
import { makeDraggable } from '../utils/helpers';

// 统一的命令记录结构
interface CommandRecord {
  id: string;
  name: string;
  command: string;
  timestamp: string;
  output?: string;
  error?: string;
  type: 'command' | 'system' | 'memprocfs';
}

/**
 * 命令窗口管理器 - 重写版本，简化逻辑
 * 使用统一的命令记录结构，避免多套系统冲突
 */
export class CommandWindowManager {
  private stateManager: StateManager;
  private consoleOutput: HTMLElement | null = null;
  private autoScroll: boolean = true;
  private commandRecords: CommandRecord[] = []; // 统一的命令记录数组
  private maxRecords: number = 1000; // 最大记录数量
  private currentMemProcFSRecord: CommandRecord | null = null; // 当前的MemProcFS记录，用于合并输出

  constructor(stateManager: StateManager) {
    this.stateManager = stateManager;
    this.initializeEventListeners();
  }

  /**
   * 初始化事件监听器
   */
  private async initializeEventListeners(): Promise<void> {
    try {
      const { listen } = await import('@tauri-apps/api/event');

      // 监听控制台输出事件
      await listen('console-output', (event: any) => {
        const data = event.payload;
        console.log('收到控制台输出事件:', data);
        if (data && data.type && data.content) {
          this.handleMemProcFSOutput(data.type, data.content, data.timestamp);
        }
      });

      // 监听脚本自动执行完成事件
      await listen('scripts-auto-execution-completed', (event: any) => {
        const results = event.payload as any[];
        const successCount = results.filter(r => r.success).length;
        const totalCount = results.length;

        console.log('收到脚本自动执行完成事件:', results);

        // 构建详细的脚本执行报告
        let detailOutput = `执行统计: ${successCount}/${totalCount} 成功\n\n`;

        results.forEach((result, index) => {
          // 优先显示原始脚本名，如果没有则使用script_id
          const scriptName = result.script_name || result.name || result.script_id || `脚本${index + 1}`;
          detailOutput += `${index + 1}. ${scriptName}\n`;
          detailOutput += `   状态: ${result.success ? '✅ 成功' : '❌ 失败'}\n`;
          if (result.output && result.output.trim()) {
            detailOutput += `   输出: ${result.output.trim()}\n`;
          }
          if (result.error && result.error.trim()) {
            detailOutput += `   错误: ${result.error.trim()}\n`;
          }
          detailOutput += '\n';
        });

        this.addCommandRecord({
          name: '脚本自动执行完成',
          command: `自动执行 ${totalCount} 个脚本`,
          type: 'system',
          output: detailOutput,
          timestamp: new Date().toLocaleTimeString()
        });
      });

      // 监听脚本自动执行错误事件
      await listen('scripts-auto-execution-error', (event: any) => {
        const error = event.payload as string;

        console.log('收到脚本自动执行错误事件:', error);

        this.addCommandRecord({
          name: '脚本自动执行错误',
          command: '脚本自动执行过程中发生错误',
          type: 'system',
          error: error,
          timestamp: new Date().toLocaleTimeString()
        });
      });

      console.log('命令窗口管理器事件监听器已初始化');
    } catch (error) {
      console.error('初始化事件监听器失败:', error);
    }
  }

  /**
   * 处理MemProcFS输出（合并多行输出到一个记录中）
   */
  private handleMemProcFSOutput(type: string, content: string, timestamp?: string): void {
    // 如果没有当前记录，或者类型不匹配，创建新记录
    if (!this.currentMemProcFSRecord ||
        (type === 'output' && this.currentMemProcFSRecord.error) ||
        (type === 'error' && this.currentMemProcFSRecord.output)) {

      this.currentMemProcFSRecord = {
        id: `memprocfs_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
        name: 'MemProcFS Output',
        command: 'MemProcFS process execution',
        timestamp: timestamp || new Date().toLocaleTimeString(),
        type: 'memprocfs',
        output: type === 'output' ? content : undefined,
        error: type === 'error' ? content : undefined
      };

      this.commandRecords.push(this.currentMemProcFSRecord);

      // 限制记录数量
      if (this.commandRecords.length > this.maxRecords) {
        this.commandRecords.shift();
      }
    } else {
      // 追加到现有记录
      if (type === 'output' && this.currentMemProcFSRecord.output) {
        this.currentMemProcFSRecord.output += '\n' + content;
      } else if (type === 'error' && this.currentMemProcFSRecord.error) {
        this.currentMemProcFSRecord.error += '\n' + content;
      } else if (type === 'output') {
        this.currentMemProcFSRecord.output = content;
      } else if (type === 'error') {
        this.currentMemProcFSRecord.error = content;
      }
    }

    console.log(`MemProcFS输出已合并: ${type}, 当前记录长度: ${
      type === 'output' ? (this.currentMemProcFSRecord.output?.length || 0) :
      (this.currentMemProcFSRecord.error?.length || 0)
    }`);

    // 如果控制台窗口打开，立即更新显示
    if (this.consoleOutput) {
      this.renderConsole();
    }
  }

  /**
   * 添加命令记录（统一入口）
   */
  addCommandRecord(record: Partial<CommandRecord>): void {
    // 对于MemProcFS类型的记录，使用专门的处理逻辑
    if (record.type === 'memprocfs') {
      if (record.output) {
        this.handleMemProcFSOutput('output', record.output, record.timestamp);
      }
      if (record.error) {
        this.handleMemProcFSOutput('error', record.error, record.timestamp);
      }
      return;
    }

    const commandRecord: CommandRecord = {
      id: record.id || `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      name: record.name || 'Unknown Command',
      command: record.command || '',
      timestamp: record.timestamp || new Date().toLocaleTimeString(),
      output: record.output,
      error: record.error,
      type: record.type || 'command'
    };

    this.commandRecords.push(commandRecord);

    // 限制记录数量
    if (this.commandRecords.length > this.maxRecords) {
      this.commandRecords.shift();
    }

    console.log(`添加命令记录: ${commandRecord.name} (${commandRecord.type}) - ID: ${commandRecord.id}`);
    console.log(`命令内容: ${commandRecord.command}`);
    if (commandRecord.output) {
      console.log(`输出内容: ${commandRecord.output.substring(0, 100)}...`);
    }

    // 如果控制台窗口打开，立即更新显示
    if (this.consoleOutput) {
      this.renderConsole();
    }
  }

  /**
   * 渲染控制台内容（统一显示逻辑）
   */
  private renderConsole(): void {
    if (!this.consoleOutput) return;

    let html = '';

    // 按时间顺序显示所有命令记录
    for (const record of this.commandRecords) {
      // 检查命令内容是否为空白
      const hasValidCommand = record.command && record.command.trim().length > 0;
      const hasValidOutput = record.output && record.output.trim().length > 0;
      const hasValidError = record.error && record.error.trim().length > 0;

      // 如果所有内容都是空白，跳过这个记录
      if (!hasValidCommand && !hasValidOutput && !hasValidError) {
        console.log(`跳过空白记录: ${record.name}`);
        continue;
      }

      // 添加命令行（改进样式，换行显示）
      if (hasValidCommand) {
        const timestamp = this.escapeHtml(record.timestamp);
        const name = this.escapeHtml(record.name);
        const command = this.escapeHtml(record.command);
        html += `
          <div class="console-line command">
            <div class="console-line-header">
              <span class="timestamp">${timestamp}</span>
              <span class="command-prefix">[${name}]</span>
            </div>
            <div class="command-content">
              <pre class="command-text">${command}</pre>
            </div>
          </div>
        `;
      } else if (record.type === 'system') {
        const timestamp = this.escapeHtml(record.timestamp);
        const name = this.escapeHtml(record.name);
        // 对于系统消息，即使没有命令内容也显示标题
        html += `
          <div class="console-line system">
            <div class="console-line-header">
              <span class="timestamp">${timestamp}</span>
              <span class="system-prefix">[${name}]</span>
            </div>
          </div>
        `;
      }

      // 添加输出（换行显示，过滤空白，包含项目名称）
      if (hasValidOutput) {
        const timestamp = this.escapeHtml(record.timestamp);
        const name = this.escapeHtml(record.name);
        const output = this.escapeHtml(record.output);
        html += `
          <div class="console-line output">
            <div class="console-line-header">
              <span class="timestamp">${timestamp}</span>
              <span class="output-prefix">[${name} - OUTPUT]</span>
            </div>
            <div class="output-content">
              <pre class="output-text">${output}</pre>
            </div>
          </div>
        `;
      }

      // 添加错误（换行显示，左对齐，过滤空白，包含项目名称）
      if (hasValidError) {
        const timestamp = this.escapeHtml(record.timestamp);
        const name = this.escapeHtml(record.name);
        const error = this.escapeHtml(record.error);
        html += `
          <div class="console-line error">
            <div class="console-line-header">
              <span class="timestamp">${timestamp}</span>
              <span class="error-prefix">[${name} - ERROR]</span>
            </div>
            <div class="error-content">
              <pre class="error-text">${error}</pre>
            </div>
          </div>
        `;
      }
    }

    // 如果没有记录，显示欢迎信息
    if (this.commandRecords.length === 0) {
      html = `
        <div class="console-line system">
          <span class="timestamp">${new Date().toLocaleTimeString()}</span>
          <span class="system-prefix">[System call]</span>
          <span class="message">控制台已启动，等待命令执行...</span>
        </div>
      `;
    }

    this.consoleOutput.innerHTML = html;
    this.scrollToBottom();
    this.bindCopyEvents();
  }

  private escapeHtml(value: unknown): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * 清空所有命令记录
   */
  clearAllRecords(): void {
    this.commandRecords = [];
    console.log('控制台记录已清空');
    
    // 如果控制台窗口打开，立即更新显示
    if (this.consoleOutput) {
      this.renderConsole();
    }
  }

  /**
   * 显示控制台窗口
   */
  showCommandWindow(): void {
    // 检查是否已经存在窗口
    const existingWindow = document.querySelector('.command-window');
    if (existingWindow) {
      existingWindow.classList.remove('minimized');
      return;
    }

    this.createCommandWindow();
  }

  /**
   * 切换控制台窗口显示状态
   */
  toggleCommandWindow(): void {
    const existingWindow = document.querySelector('.command-window');
    if (existingWindow) {
      // 如果窗口存在，关闭它
      existingWindow.remove();
      this.consoleOutput = null;
      console.log('控制台窗口已关闭');
    } else {
      // 如果窗口不存在，创建它
      this.createCommandWindow();
      console.log('控制台窗口已打开');
    }
  }

  /**
   * 创建控制台风格的命令窗口
   */
  createCommandWindow(): void {
    const commandWindow = document.createElement('div');
    commandWindow.className = 'command-window console-style';
    commandWindow.innerHTML = `
      <div class="command-window-header">
        <div class="command-window-title">
          <span>💻</span>
          <span>控制台监控</span>
          <div class="console-status">
            <span class="status-indicator running"></span>
            <span class="status-text">实时监控中</span>
          </div>
        </div>
        <div class="command-window-controls">
          <button class="window-control-btn clear" data-action="clear" title="清空控制台">🗑️</button>
          <button class="window-control-btn scroll-toggle" data-action="scroll-toggle" title="自动滚动">📜</button>
          <button class="window-control-btn minimize" data-action="minimize">−</button>
          <button class="window-control-btn close" data-action="close">×</button>
        </div>
      </div>
      <div class="command-window-content console-content">
        <div class="console-output" id="console-output">
          <!-- 内容将在下面立即加载 -->
        </div>
      </div>
      <div class="command-window-resize-handle-right"></div>
      <div class="command-window-resize-handle-bottom"></div>
      <div class="command-window-resize-handle-corner"></div>
    `;

    document.body.appendChild(commandWindow);
    this.consoleOutput = commandWindow.querySelector('#console-output');

    // 立即渲染控制台内容
    if (this.consoleOutput) {
      console.log(`控制台窗口打开，当前记录数: ${this.commandRecords.length}`);
      this.renderConsole();
      console.log(`控制台内容已加载完成`);
    }

    // 绑定事件
    this.bindWindowEvents(commandWindow);
    
    // 使窗口可拖拽
    makeDraggable(commandWindow, '.command-window-header');
  }

  /**
   * 绑定窗口事件
   */
  private bindWindowEvents(commandWindow: HTMLElement): void {
    const closeBtn = commandWindow.querySelector('[data-action="close"]');
    const minimizeBtn = commandWindow.querySelector('[data-action="minimize"]');
    const clearBtn = commandWindow.querySelector('[data-action="clear"]');
    const scrollToggleBtn = commandWindow.querySelector('[data-action="scroll-toggle"]');

    closeBtn?.addEventListener('click', () => {
      commandWindow.remove();
      this.consoleOutput = null;
    });

    minimizeBtn?.addEventListener('click', () => {
      commandWindow.classList.toggle('minimized');
      if (commandWindow.classList.contains('minimized')) {
        minimizeBtn.textContent = '+';
      } else {
        minimizeBtn.textContent = '−';
      }
    });

    clearBtn?.addEventListener('click', () => {
      this.clearConsole();
    });

    scrollToggleBtn?.addEventListener('click', () => {
      this.autoScroll = !this.autoScroll;
      const statusIndicator = commandWindow.querySelector('.status-indicator');
      if (statusIndicator) {
        statusIndicator.textContent = this.autoScroll ? '📜' : '⏸️';
      }
    });
  }

  /**
   * 清空控制台（简化版本）
   */
  private clearConsole(): void {
    this.stateManager.clearCommandHistory();
    this.clearAllRecords();
    console.log('控制台已完全清空');
  }

  /**
   * 滚动到底部
   */
  private scrollToBottom(): void {
    if (this.autoScroll && this.consoleOutput) {
      this.consoleOutput.scrollTop = this.consoleOutput.scrollHeight;
    }
  }

  /**
   * 绑定复制事件
   */
  private bindCopyEvents(): void {
    if (!this.consoleOutput) return;

    const lines = this.consoleOutput.querySelectorAll('.console-line');
    lines.forEach(line => {
      line.addEventListener('click', () => {
        const text = line.textContent || '';
        navigator.clipboard.writeText(text).then(() => {
          console.log('已复制到剪贴板:', text.substring(0, 50));
        });
      });
    });
  }

  // 兼容方法：同步状态管理器的命令到控制台记录
  updateCommandWindowDisplay(): void {
    console.log('更新命令窗口显示（同步状态管理器命令）');

    // 获取状态管理器中的所有命令
    const stateCommands = this.stateManager.getCommandHistory();

    // 检查是否有新的命令需要添加到控制台记录中
    for (const stateCommand of stateCommands) {
      // 检查这个命令是否已经在控制台记录中
      const existingRecord = this.commandRecords.find(record => record.id === stateCommand.id.toString());

      if (!existingRecord) {
        // 添加新的命令记录
        console.log(`同步状态管理器命令到控制台: ${stateCommand.name} (ID: ${stateCommand.id})`);

        // 识别不同类型的命令并设置正确的类型
        let commandType: 'command' | 'system' | 'memprocfs' = 'command';
        if (stateCommand.name.startsWith('加载镜像:') ||
            stateCommand.name.startsWith('MemProcFS') ||
            stateCommand.name.includes('系统') ||
            stateCommand.name.includes('Profile检测')) {
          commandType = 'system';
        } else if (stateCommand.name.startsWith('CSV插件:')) {
          // CSV插件命令保持为 'command' 类型，确保显示完整的命令和输出
          commandType = 'command';
        }

        const commandRecord: CommandRecord = {
          id: stateCommand.id.toString(),
          name: stateCommand.name,
          command: stateCommand.command,
          timestamp: stateCommand.time,
          output: stateCommand.output,
          error: stateCommand.error,
          type: commandType
        };

        this.commandRecords.push(commandRecord);
      } else {
        // 更新现有记录（可能状态、命令或输出有变化）
        let hasChanges = false;

        if (existingRecord.output !== stateCommand.output) {
          existingRecord.output = stateCommand.output;
          hasChanges = true;
        }

        if (existingRecord.error !== stateCommand.error) {
          existingRecord.error = stateCommand.error;
          hasChanges = true;
        }

        // 对于CSV插件，如果命令内容发生变化（从模板变为实际命令），也要更新
        if (stateCommand.name.startsWith('CSV插件:') &&
            existingRecord.command !== stateCommand.command &&
            stateCommand.command !== '正在执行插件命令...') {
          existingRecord.command = stateCommand.command;
          hasChanges = true;
        }

        if (hasChanges) {
          console.log(`更新控制台记录: ${stateCommand.name} (ID: ${stateCommand.id})`);
          console.log(`命令: ${existingRecord.command}`);
          if (existingRecord.output) {
            console.log(`输出: ${existingRecord.output.substring(0, 100)}...`);
          }

          // 强制重新渲染控制台以显示更新
          if (this.consoleOutput) {
            this.renderConsole();
          }
        }
      }
    }

    // 限制记录数量
    if (this.commandRecords.length > this.maxRecords) {
      this.commandRecords.splice(0, this.commandRecords.length - this.maxRecords);
    }

    // 更新显示
    if (this.consoleOutput) {
      this.renderConsole();
    }
  }

  addConsoleEntry(type: string, content: string, timestamp?: string): void {
    console.log(`兼容模式：添加控制台条目 ${type}: ${content.substring(0, 50)}...`);
    
    this.addCommandRecord({
      name: type === 'system' ? 'System Message' : 'Console Entry',
      command: type === 'command' ? content : '',
      type: type as 'command' | 'system' | 'memprocfs',
      output: type === 'output' ? content : undefined,
      error: type === 'error' ? content : undefined,
      timestamp: timestamp
    });
  }

  saveConsoleContent(): void {
    console.log('保存控制台内容（新版本自动管理）');
  }

  updateSavedContent(): void {
    console.log('更新保存内容（新版本自动管理）');
  }

  appendRealtimeOutput(type: 'output' | 'error', content: string, timestamp?: string): void {
    console.log(`兼容模式：追加实时输出 ${type}: ${content.substring(0, 50)}...`);

    // 使用MemProcFS输出处理逻辑，确保合并输出
    this.handleMemProcFSOutput(type, content, timestamp);
  }
}
