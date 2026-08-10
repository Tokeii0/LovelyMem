/**
 * 前端日志管理器
 * 拦截所有 console 输出并保存到文件
 */

interface LogEntry {
  level: 'log' | 'info' | 'warn' | 'error' | 'debug';
  message: string;
  timestamp: string;
  args?: any[];
}

class LogManager {
  private originalConsole: {
    log: typeof console.log;
    info: typeof console.info;
    warn: typeof console.warn;
    error: typeof console.error;
    debug: typeof console.debug;
  };
  
  public isInitialized = false;
  public logQueue: LogEntry[] = [];
  private isProcessing = false;
  public tauriInvoke: any = null;

  constructor() {
    // 保存原始的 console 方法
    this.originalConsole = {
      log: console.log.bind(console),
      info: console.info.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
      debug: console.debug.bind(console)
    };
  }

  /**
   * 初始化日志管理器
   */
  async init(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // 尝试导入 Tauri API
      if (typeof (window as any).__TAURI__ !== 'undefined') {
        const { invoke } = await import('@tauri-apps/api/core');
        this.tauriInvoke = invoke;
      }
    } catch (error) {
      this.originalConsole.warn('⚠️ Tauri API 不可用，日志将只在控制台显示:', error);
    }

    // 重写 console 方法
    this.overrideConsoleMethods();
    this.isInitialized = true;

    // 开始处理日志队列
    this.startQueueProcessor();

    this.originalConsole.info('✅ 前端日志管理器已初始化 (文件写入已禁用)', {
      tauriAvailable: !!this.tauriInvoke,
      queueLength: this.logQueue.length,
      fileWritingEnabled: false
    });
  }

  /**
   * 重写 console 方法
   */
  private overrideConsoleMethods(): void {
    const levels: Array<keyof typeof this.originalConsole> = ['log', 'info', 'warn', 'error', 'debug'];

    levels.forEach(level => {
      console[level] = (...args: any[]) => {
        // 调用原始方法，保持控制台输出
        this.originalConsole[level](...args);

        // 记录日志
        this.recordLog(level, args);
      };
    });
  }

  /**
   * 记录日志条目
   */
  private recordLog(level: LogEntry['level'], args: any[]): void {
    const timestamp = new Date().toISOString();
    const message = this.formatMessage(args);

    const logEntry: LogEntry = {
      level,
      message,
      timestamp,
      args
    };

    // 添加到队列
    this.logQueue.push(logEntry);

    // 调试信息
    if (level === 'debug' || this.logQueue.length % 10 === 0) {
      this.originalConsole.debug(`📝 日志队列长度: ${this.logQueue.length}, Tauri可用: ${!!this.tauriInvoke}`);
    }

    // 如果队列太长，移除旧的条目
    if (this.logQueue.length > 2000) {
      this.logQueue.shift();
    }

    // 文件写入已禁用，不再处理队列
    // if (!this.isProcessing) {
    //   setTimeout(() => this.processLogQueue(), 10);
    // }
  }

  /**
   * 格式化消息
   */
  private formatMessage(args: any[]): string {
    return args.map(arg => {
      if (typeof arg === 'string') {
        return arg;
      } else if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg, null, 2);
        } catch {
          return String(arg);
        }
      } else {
        return String(arg);
      }
    }).join(' ');
  }

  /**
   * 启动队列处理器
   */
  private startQueueProcessor(): void {
    // 文件写入已禁用，无需启动处理器
    this.originalConsole.debug('🔄 日志队列处理器已跳过 (文件写入已禁用)');
  }

  /**
   * 处理日志队列 (已弃用)
   */
  public async processLogQueue(): Promise<void> {
    // Do nothing, keep logs in memory for UI
    return;
  }

  /**
   * 写入日志到文件 (已禁用 - 仅控制台输出)
   */
  private async writeLogToFile(entry: LogEntry): Promise<void> {
    // 文件写入功能已被禁用，仅在控制台输出
    // 这样可以减少磁盘I/O和文件管理的复杂性

    // 可选：如果需要调试信息，可以偶尔显示
    if (Math.random() < 0.01) { // 1% 概率显示
      this.originalConsole.debug('📝 日志记录 (文件写入已禁用):', entry.level, entry.message.substring(0, 50));
    }

    // 直接返回，不进行任何文件操作
    return;
  }

  /**
   * 手动添加日志条目
   */
  addLog(level: LogEntry['level'], message: string, ...args: any[]): void {
    this.recordLog(level, [message, ...args]);
  }

  /**
   * 获取日志统计信息
   */
  getLogStats(): { total: number; byLevel: Record<string, number> } {
    const byLevel: Record<string, number> = {};
    
    this.logQueue.forEach(entry => {
      byLevel[entry.level] = (byLevel[entry.level] || 0) + 1;
    });

    return {
      total: this.logQueue.length,
      byLevel
    };
  }

  /**
   * 清空日志队列
   */
  clearQueue(): void {
    this.logQueue = [];
    this.originalConsole.info('🧹 日志队列已清空');
  }

  /**
   * 恢复原始 console 方法
   */
  restore(): void {
    if (!this.isInitialized) {
      return;
    }

    console.log = this.originalConsole.log;
    console.info = this.originalConsole.info;
    console.warn = this.originalConsole.warn;
    console.error = this.originalConsole.error;
    console.debug = this.originalConsole.debug;

    this.isInitialized = false;
    this.originalConsole.info('🔄 Console 方法已恢复');
  }
}

// 创建全局实例
const logManager = new LogManager();

// 导出
export default logManager;

// 自动初始化（可选）
if (typeof window !== 'undefined') {
  // 等待 DOM 加载完成后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      logManager.init().catch(console.error);
    });
  } else {
    logManager.init().catch(console.error);
  }
}
