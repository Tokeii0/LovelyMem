/**
 * 进程管理器
 * 用于监控和管理指定的进程
 */

import { invoke } from '@tauri-apps/api/core';
import { MessageManager } from '../utils';

interface ProcessInfo {
  pid: number;
  name: string;
  command_line: string;
}

export class ProcessManager {
  private isVisible: boolean = false;
  private refreshInterval: number | null = null;
  private readonly REFRESH_INTERVAL = 5000; // 5秒刷新一次，减少频率
  private isRefreshing: boolean = false; // 防止重复刷新
  private consecutiveFailures: number = 0; // 连续失败次数
  private readonly MAX_CONSECUTIVE_FAILURES = 3; // 最大连续失败次数
  private readonly BASE_TIMEOUT = 5000; // 基础超时时间（5秒）
  private readonly MAX_TIMEOUT = 15000; // 最大超时时间（15秒）

  constructor() {
    this.bindEvents();
  }

  /**
   * 绑定事件
   */
  private bindEvents(): void {
    // 监听进程管理按钮点击
    document.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      
      if (target.closest('#show-process-manager-btn')) {
        event.preventDefault();
        this.toggleProcessManager();
      }
      
      // 处理结束进程按钮
      if (target.closest('.kill-process-btn')) {
        event.preventDefault();
        const btn = target.closest('.kill-process-btn') as HTMLElement;
        const pid = parseInt(btn.dataset.pid || '0');
        if (pid > 0 && !btn.classList.contains('killing')) {
          this.killProcess(pid, btn);
        }
      }
      
      // 处理刷新按钮
      if (target.closest('.refresh-processes-btn')) {
        event.preventDefault();
        this.refreshProcessList();
      }
      
      // 处理关闭按钮
      if (target.closest('.close-process-manager-btn')) {
        event.preventDefault();
        this.hideProcessManager();
      }
    });
  }

  /**
   * 切换进程管理器显示状态
   */
  toggleProcessManager(): void {
    if (this.isProcessManagerVisible()) {
      this.hideProcessManager();
    } else {
      this.showProcessManager();
    }
  }

  /**
   * 显示进程管理器
   */
  async showProcessManager(): Promise<void> {
    if (this.isProcessManagerVisible()) {
      return;
    }

    // 创建进程管理器窗口
    this.createProcessManagerWindow();

    // 初始加载进程列表（显示加载状态）
    await this.initialLoadProcessList();

    // 开始自动刷新
    this.startAutoRefresh();
  }

  /**
   * 隐藏进程管理器
   */
  hideProcessManager(): void {
    // 停止自动刷新
    this.stopAutoRefresh();
    
    // 移除窗口
    const processManager = document.getElementById('process-manager-window');
    if (processManager) {
      processManager.remove();
    }
  }


  /**
   * 创建进程管理器窗口
   */
  private createProcessManagerWindow(): void {
    // 如果已存在，先移除
    const existing = document.getElementById('process-manager-window');
    if (existing) {
      existing.remove();
    }

    const processManagerHTML = `
      <div class="process-manager-window" id="process-manager-window">
        <div class="process-manager-header">
          <div class="process-manager-title">
            <span class="process-manager-icon">⚙️</span>
            <span>进程管理</span>
          </div>
          <div class="process-manager-controls">
            <button class="refresh-processes-btn" title="刷新进程列表">
              <span>🔄</span>
            </button>
            <button class="close-process-manager-btn" title="关闭">
              <span>✕</span>
            </button>
          </div>
        </div>
        <div class="process-manager-content">
          <div class="process-list-container">
            <div class="process-list-header">
              <div class="process-header-item process-pid">PID</div>
              <div class="process-header-item process-name">进程名</div>
              <div class="process-header-item process-command">命令行</div>
              <div class="process-header-item process-actions">操作</div>
            </div>
            <div class="process-list" id="process-list">
              <div class="process-loading">
                <span class="loading-spinner">⏳</span>
                <span>正在加载进程列表...</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', processManagerHTML);
  }

  /**
   * 初始加载进程列表（显示加载状态，带重试机制）
   */
  async initialLoadProcessList(): Promise<void> {
    const processList = document.getElementById('process-list');
    if (!processList) return;

    try {
      // 显示加载状态
      processList.innerHTML = `
        <div class="process-loading">
          <span class="loading-spinner">⏳</span>
          <span>正在加载进程列表...</span>
        </div>
      `;

      console.log('🚀 开始初始加载进程列表...');

      // 使用带重试机制的方法获取进程列表
      const processes = await this.getProcessesWithRetry(3); // 初始加载允许更多重试次数

      this.renderProcessList(processes);
      console.log(`✅ 初始加载成功，获取到 ${processes.length} 个进程`);

    } catch (error) {
      console.error('❌ 初始加载进程列表失败:', error);
      processList.innerHTML = `
        <div class="process-error">
          <span class="error-icon">❌</span>
          <span>初始加载失败，将在自动刷新时重试</span>
          <div class="error-details">${error}</div>
          <button class="retry-btn" onclick="document.querySelector('#show-process-manager-btn').click(); document.querySelector('#show-process-manager-btn').click();">
            🔄 立即重试
          </button>
        </div>
      `;
    }
  }

  /**
   * 刷新进程列表（无加载动画，带重试机制）
   */
  async refreshProcessList(): Promise<void> {
    // 防止重复刷新
    if (this.isRefreshing) {
      console.log('⏭️ 进程列表正在刷新中，跳过本次刷新');
      return;
    }

    const processList = document.getElementById('process-list');
    if (!processList) return;

    this.isRefreshing = true;

    try {
      const processes = await this.getProcessesWithRetry();

      // 成功获取进程列表，重置失败计数
      this.consecutiveFailures = 0;
      this.renderProcessList(processes);

      console.log(`✅ 进程列表刷新成功，获取到 ${processes.length} 个进程`);

    } catch (error) {
      this.consecutiveFailures++;
      console.error(`❌ 获取进程列表失败 (第${this.consecutiveFailures}次):`, error);

      // 显示错误信息，包含重试提示
      const errorMessage = this.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES
        ? `连续失败${this.consecutiveFailures}次，请检查系统状态`
        : `获取失败，将在下次自动重试 (${this.consecutiveFailures}/${this.MAX_CONSECUTIVE_FAILURES})`;

      processList.innerHTML = `
        <div class="process-error">
          <span class="error-icon">❌</span>
          <span>${errorMessage}</span>
          <div class="error-details">${error}</div>
        </div>
      `;

      // 如果连续失败次数过多，增加刷新间隔
      if (this.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
        console.warn('⚠️ 连续失败次数过多，考虑降低刷新频率');
      }

    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * 带重试机制的进程获取方法
   */
  private async getProcessesWithRetry(maxRetries: number = 2): Promise<ProcessInfo[]> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        // 计算当前尝试的超时时间（渐进式增加）
        const timeoutMs = Math.min(
          this.BASE_TIMEOUT + (attempt - 1) * 3000,
          this.MAX_TIMEOUT
        );

        console.log(`🔄 尝试获取进程列表 (第${attempt}次尝试，超时${timeoutMs}ms)`);

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`获取进程列表超时 (${timeoutMs}ms)`)), timeoutMs);
        });

        const processPromise = invoke('get_monitored_processes') as Promise<ProcessInfo[]>;
        const processes = await Promise.race([processPromise, timeoutPromise]);

        console.log(`✅ 第${attempt}次尝试成功，获取到 ${processes.length} 个进程`);
        return processes;

      } catch (error) {
        lastError = error as Error;
        console.warn(`⚠️ 第${attempt}次尝试失败:`, error);

        // 如果不是最后一次尝试，等待一段时间再重试
        if (attempt <= maxRetries) {
          const waitTime = attempt * 1000; // 递增等待时间
          console.log(`⏳ 等待 ${waitTime}ms 后重试...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    // 所有尝试都失败了
    throw lastError || new Error('获取进程列表失败');
  }

  /**
   * 渲染进程列表
   */
  private renderProcessList(processes: ProcessInfo[]): void {
    const processList = document.getElementById('process-list');
    if (!processList) return;

    if (processes.length === 0) {
      processList.innerHTML = `
        <div class="no-processes">
          <span class="no-processes-icon">📭</span>
          <span>未发现监控的进程</span>
        </div>
      `;
      return;
    }

    // 渲染进程列表
    const processListHTML = processes.map(process => `
      <div class="process-item" data-pid="${process.pid}">
        <div class="process-item-content process-pid">${process.pid}</div>
        <div class="process-item-content process-name" title="${process.name}">${process.name}</div>
        <div class="process-item-content process-command" title="${process.command_line}">
          ${process.command_line}
        </div>
        <div class="process-item-content process-actions">
          <button class="kill-process-btn" data-pid="${process.pid}" title="结束进程">
            <span>🗑️</span>
            <span>结束</span>
          </button>
        </div>
      </div>
    `).join('');

    processList.innerHTML = processListHTML;
  }

  /**
   * 结束进程
   */
  async killProcess(pid: number, button: HTMLElement): Promise<void> {
    try {
      // 设置按钮为加载状态
      button.classList.add('killing');
      button.innerHTML = '<span>⌛</span><span>结束中</span>';
      (button as HTMLButtonElement).disabled = true;

      const result = await invoke('kill_process_by_pid', { pid }) as string;
      MessageManager.showSuccess(result);

      // 刷新进程列表
      await this.refreshProcessList();

    } catch (error) {
      console.error('结束进程失败:', error);
      MessageManager.showError(`结束进程失败: ${error}`);

      // 恢复按钮状态
      button.classList.remove('killing');
      button.innerHTML = '<span>🗑️</span><span>结束</span>';
      (button as HTMLButtonElement).disabled = false;
    }
  }

  /**
   * 开始自动刷新（智能间隔调整）
   */
  private startAutoRefresh(): void {
    this.stopAutoRefresh(); // 先停止之前的定时器

    this.refreshInterval = window.setInterval(async () => {
      if (this.isProcessManagerVisible() && !this.isRefreshing) {
        // 使用异步方式刷新，避免阻塞UI
        try {
          await this.refreshProcessList();
        } catch (error) {
          console.error('自动刷新进程列表失败:', error);
        }
      }
    }, this.getAdaptiveRefreshInterval());

    console.log(`🔄 进程管理器自动刷新已启动，间隔: ${this.getAdaptiveRefreshInterval()}ms`);
  }

  /**
   * 获取自适应刷新间隔
   */
  private getAdaptiveRefreshInterval(): number {
    // 根据连续失败次数调整刷新间隔
    if (this.consecutiveFailures === 0) {
      return this.REFRESH_INTERVAL; // 正常间隔
    } else if (this.consecutiveFailures < this.MAX_CONSECUTIVE_FAILURES) {
      return this.REFRESH_INTERVAL * 1.5; // 轻微延长
    } else {
      return this.REFRESH_INTERVAL * 3; // 大幅延长，减少系统负担
    }
  }

  /**
   * 停止自动刷新
   */
  private stopAutoRefresh(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
      console.log('⏹️ 进程管理器自动刷新已停止');
    }
    // 重置刷新状态
    this.isRefreshing = false;
  }

  /**
   * 获取当前状态
   */
  isProcessManagerVisible(): boolean {
    return !!document.getElementById('process-manager-window');
  }
}
