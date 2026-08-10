/**
 * 查看器日志管理器
 * 专门用于 CSV 查看器和文本查看器的日志记录
 * 这是一个轻量级版本，适用于独立窗口
 */

type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

interface ViewerLogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  args: unknown[];
}

interface ViewerLogStats {
  total: number;
  byLevel: Record<string, number>;
  viewerType: string;
}

class ViewerLogManager {
  public viewerType: string;
  public isInitialized: boolean;
  public logQueue: ViewerLogEntry[];
  private isProcessing: boolean;
  public tauriInvoke: ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null;

  private originalConsole: {
    log: typeof console.log;
    info: typeof console.info;
    warn: typeof console.warn;
    error: typeof console.error;
    debug: typeof console.debug;
  };

  constructor(viewerType: string = 'viewer') {
    this.viewerType = viewerType; // 'csv-viewer' 或 'text-viewer'
    this.isInitialized = false;
    this.logQueue = [];
    this.isProcessing = false;
    this.tauriInvoke = null;

    // 保存原始的 console 方法
    this.originalConsole = {
      log: console.log.bind(console),
      info: console.info.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
      debug: console.debug.bind(console)
    };

    this.init();
  }

  /**
   * 初始化日志管理器
   */
  async init(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // 检查 Tauri API 是否可用
      const tauri = (window as any).__TAURI__;
      if (typeof tauri !== 'undefined' && tauri.core) {
        this.tauriInvoke = tauri.core.invoke;
      } else if (typeof tauri !== 'undefined') {
        // 尝试动态导入
        const { invoke } = await import('@tauri-apps/api/core');
        this.tauriInvoke = invoke as ViewerLogManager['tauriInvoke'];
      }
    } catch (error) {
      this.originalConsole.warn(`⚠️ [${this.viewerType}] Tauri API 不可用，日志将只在控制台显示:`, error);
    }

    // 重写 console 方法
    this.overrideConsoleMethods();
    this.isInitialized = true;

    // 开始处理日志队列
    this.startQueueProcessor();

    this.originalConsole.info(`✅ [${this.viewerType}] 日志管理器已初始化 (文件写入已禁用)`, {
      tauriAvailable: !!this.tauriInvoke,
      queueLength: this.logQueue.length,
      fileWritingEnabled: false
    });
  }

  /**
   * 重写 console 方法
   */
  overrideConsoleMethods(): void {
    const levels: LogLevel[] = ['log', 'info', 'warn', 'error', 'debug'];

    levels.forEach(level => {
      console[level] = (...args: unknown[]) => {
        // 调用原始方法，保持控制台输出
        this.originalConsole[level](...args);

        // 记录日志，添加查看器类型前缀
        this.recordLog(level, args);
      };
    });
  }

  /**
   * 记录日志条目
   */
  recordLog(level: LogLevel, args: unknown[]): void {
    const timestamp = new Date().toISOString();
    const message = this.formatMessage(args);

    // 添加查看器类型前缀
    const prefixedMessage = `[${this.viewerType.toUpperCase()}] ${message}`;

    const logEntry: ViewerLogEntry = {
      level,
      message: prefixedMessage,
      timestamp,
      args
    };

    // 添加到队列
    this.logQueue.push(logEntry);

    // 如果队列太长，移除旧的条目
    if (this.logQueue.length > 500) { // 查看器使用较小的队列
      this.logQueue.shift();
    }

    // 立即尝试处理队列
    if (!this.isProcessing) {
      setTimeout(() => this.processLogQueue(), 10);
    }
  }

  /**
   * 格式化消息
   */
  formatMessage(args: unknown[]): string {
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
  startQueueProcessor(): void {
    // 定期处理日志队列
    setInterval(() => {
      if (this.logQueue.length > 0 && !this.isProcessing) {
        this.processLogQueue();
      }
    }, 2000); // 每2秒检查一次（比主应用频率低）
  }

  /**
   * 处理日志队列
   */
  async processLogQueue(): Promise<void> {
    if (this.isProcessing || this.logQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      // 批量处理日志
      const batchSize = 5; // 较小的批次大小
      const batch = this.logQueue.splice(0, batchSize);

      for (const entry of batch) {
        await this.writeLogToFile(entry);
      }
    } catch (error) {
      this.originalConsole.error(`❌ [${this.viewerType}] 处理日志队列失败:`, error);
    } finally {
      this.isProcessing = false;

      // 如果还有日志，继续处理
      if (this.logQueue.length > 0) {
        setTimeout(() => this.processLogQueue(), 100);
      }
    }
  }

  /**
   * 写入日志到文件 (已禁用 - 仅控制台输出)
   */
  async writeLogToFile(entry: ViewerLogEntry): Promise<void> {
    // 文件写入功能已被禁用，仅在控制台输出
    // 这样可以减少磁盘I/O和文件管理的复杂性

    // 可选：如果需要调试信息，可以偶尔显示
    if (Math.random() < 0.01) { // 1% 概率显示
      this.originalConsole.debug(`📝 [${this.viewerType}] 日志记录 (文件写入已禁用):`, entry.level, entry.message.substring(0, 50));
    }

    // 直接返回，不进行任何文件操作
    return;
  }

  /**
   * 手动添加日志条目
   */
  addLog(level: LogLevel, message: unknown, ...args: unknown[]): void {
    this.recordLog(level, [message, ...args]);
  }

  /**
   * 获取日志统计信息
   */
  getLogStats(): ViewerLogStats {
    const byLevel: Record<string, number> = {};

    this.logQueue.forEach(entry => {
      byLevel[entry.level] = (byLevel[entry.level] || 0) + 1;
    });

    return {
      total: this.logQueue.length,
      byLevel,
      viewerType: this.viewerType
    };
  }

  /**
   * 清空日志队列
   */
  clearQueue(): void {
    this.logQueue = [];
    this.originalConsole.info(`🧹 [${this.viewerType}] 日志队列已清空`);
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
    this.originalConsole.info(`🔄 [${this.viewerType}] Console 方法已恢复`);
  }
}

// 自动检测查看器类型并初始化
function initViewerLogManager(): ViewerLogManager {
  let viewerType = 'viewer';

  // 根据页面 URL 或标题检测查看器类型
  if (window.location.href.includes('csv_viewer.html')) {
    viewerType = 'csv-viewer';
  } else if (window.location.href.includes('text_viewer.html')) {
    viewerType = 'text-viewer';
  } else if (document.title.includes('CSV')) {
    viewerType = 'csv-viewer';
  } else if (document.title.includes('文本')) {
    viewerType = 'text-viewer';
  }

  const logManager = new ViewerLogManager(viewerType);

  // 导出到全局作用域
  (window as any).viewerLogManager = logManager;

  return logManager;
}

// 导出类和初始化函数
(window as any).ViewerLogManager = ViewerLogManager;
(window as any).initViewerLogManager = initViewerLogManager;

// 自动初始化
if (typeof window !== 'undefined') {
  // 等待 DOM 加载完成后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initViewerLogManager();
    });
  } else {
    initViewerLogManager();
  }
}

export { ViewerLogManager, initViewerLogManager };
export type { ViewerLogEntry, ViewerLogStats, LogLevel };
