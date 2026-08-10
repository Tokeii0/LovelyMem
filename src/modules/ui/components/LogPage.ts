import { AppState } from '../../core/types';
import logManager from '../../../utils/logManager';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

export class LogPage {
    private container: HTMLElement | null = null;
    private updateInterval: any = null;
    private activeTab: 'frontend' | 'backend' = 'frontend';
    private autoScroll: boolean = true;
    public backendLogs: any[] = []; // 改为 public，允许外部设置

    private searchTerm: string = '';
    private logUpdateInterval: any = null;
    private lastLogCount: number = 0;
    private contextMenu: HTMLElement | null = null;

    constructor() {
        this.loadStyles();
    }

    private loadStyles() {
        if (!document.getElementById('log-page-styles')) {
            const link = document.createElement('link');
            link.id = 'log-page-styles';
            link.rel = 'stylesheet';
            link.href = '/src/css/logPage.css'; // Ensure absolute path
            document.head.appendChild(link);
        }
    }

    public render(): string {
        return `
            <div class="log-page-container">
                <div class="log-header">
                    <div class="log-tabs">
                        <div class="log-tab ${this.activeTab === 'frontend' ? 'active' : ''}" data-tab="frontend">
                            <span>前端日志</span>
                        </div>
                        <div class="log-tab ${this.activeTab === 'backend' ? 'active' : ''}" data-tab="backend">
                            <span>后端日志</span>
                        </div>
                    </div>
                    <div class="log-toolbar">
                        <div class="log-actions">
                            <div class="log-search-container">
                                <span class="log-search-icon">
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                                </span>
                                <input type="text" class="log-search-input" placeholder="搜索日志..." id="log-search-input">
                            </div>
                        </div>
                        <div class="log-actions">
                            <button class="log-btn ${this.autoScroll ? 'active' : ''}" id="log-autoscroll-btn" title="自动滚动">
                                <svg viewBox="0 0 24 24"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" transform="rotate(90 12 12)"/></svg>
                                <span>自动滚动</span>
                            </button>
                            <button class="log-btn" id="log-clear-btn" title="清空日志">
                                <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                                <span>清空</span>
                            </button>
                            <button class="log-btn" id="log-refresh-btn" title="刷新">
                                <svg viewBox="0 0 24 24"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
                            </button>
                        </div>
                    </div>
                </div>

                <div class="log-content-area" id="log-content-area">
                    <div class="log-panel ${this.activeTab === 'frontend' ? 'active' : ''}" id="frontend-log-panel">
                        <div class="log-list" id="frontend-log-list">
                            <!-- Frontend logs will be injected here -->
                        </div>
                    </div>
                    <div class="log-panel ${this.activeTab === 'backend' ? 'active' : ''}" id="backend-log-panel">
                        <div class="backend-terminal-wrapper">
                            <div class="backend-terminal-titlebar">
                                <div class="backend-terminal-dots">
                                    <span class="dot dot-red"></span>
                                    <span class="dot dot-yellow"></span>
                                    <span class="dot dot-green"></span>
                                </div>
                                <div class="backend-terminal-title">Lovelymem V2 - Backend Shell</div>
                                <div class="backend-terminal-dots-placeholder"></div>
                            </div>
                            <div class="log-list backend-terminal-body" id="backend-log-list">
                                <!-- Backend logs will be injected here -->
                            </div>
                        </div>
                    </div>
                </div>

                <div class="log-statusbar">
                    <div class="log-stats" id="log-stats">
                        <div class="log-stat-item"><span class="log-stat-dot stat-info"></span> <span id="stat-info">0</span> <span class="log-stat-label">Info</span></div>
                        <div class="log-stat-item"><span class="log-stat-dot stat-warn"></span> <span id="stat-warn">0</span> <span class="log-stat-label">Warn</span></div>
                        <div class="log-stat-item"><span class="log-stat-dot stat-error"></span> <span id="stat-error">0</span> <span class="log-stat-label">Error</span></div>
                    </div>
                    <div class="log-info">
                        <span id="log-total-count">0</span> 条记录
                    </div>
                </div>

                <!-- 右键菜单 -->
                <div class="log-context-menu" id="log-context-menu">
                    <div class="log-context-menu-item" id="log-copy-item">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                        <span>复制日志</span>
                    </div>
                    <div class="log-context-menu-item" id="log-copy-all-item">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                            <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
                        </svg>
                        <span>复制全部日志</span>
                    </div>
                </div>
            </div>
        `;
    }

  public async initialize(container: HTMLElement): Promise<void> {
    this.container = container;
    this.bindEvents();
    this.startLogUpdates();

    // 重新进入日志页 / 父级重渲后，container 是全新的空列表 DOM。
    // 必须重置计数守卫并强制重渲两个标签，否则当日志条数未变化（含已达 1000 上限）时，
    // updateXxxLogs 会因“数量没变”直接跳过，导致已有日志“消失”。
    this.lastLogCount = -1;
    this.lastBackendLogCount = -1;
    this.updateFrontendLogs(true);
    this.updateBackendLogs(true);
  }

    private bindEvents(): void {
        if (!this.container) return;

        // Tab switching
        const tabs = this.container.querySelectorAll('.log-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                const target = e.currentTarget as HTMLElement;
                const tabName = target.dataset.tab as 'frontend' | 'backend';
                this.switchTab(tabName);
            });
        });

        // Search
        const searchInput = this.container.querySelector('#log-search-input') as HTMLInputElement;
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchTerm = (e.target as HTMLInputElement).value.toLowerCase();
                this.updateFrontendLogs(true); // Re-render with filter
            });
        }

        // Auto-scroll toggle
        const autoScrollBtn = this.container.querySelector('#log-autoscroll-btn');
        if (autoScrollBtn) {
            autoScrollBtn.addEventListener('click', () => {
                this.autoScroll = !this.autoScroll;
                autoScrollBtn.classList.toggle('active', this.autoScroll);
                if (this.autoScroll) {
                    this.scrollToBottom();
                }
            });
        }

        // Clear logs
        const clearBtn = this.container.querySelector('#log-clear-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                if (this.activeTab === 'frontend') {
                    logManager.clearQueue();
                    this.updateFrontendLogs();
                } else {
                    // 清空后端日志逻辑
                    this.backendLogs = [];
                    const list = this.container?.querySelector('#backend-log-list');
                    if (list) list.innerHTML = '<div class="log-placeholder"><p>后端日志已清空（仅视图）</p></div>';
                }
            });
        }

        // Refresh
        const refreshBtn = this.container.querySelector('#log-refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.updateFrontendLogs(true);
            });
        }

        // 绑定右键菜单事件
        this.bindContextMenu();
    }

    private bindContextMenu(): void {
        if (!this.container) return;

        this.contextMenu = this.container.querySelector('#log-context-menu');
        let currentLogEntry: HTMLElement | null = null;

        // 为日志列表绑定右键菜单
        const logLists = this.container.querySelectorAll('.log-list');
        logLists.forEach(logList => {
            logList.addEventListener('contextmenu', (e: Event) => {
                const event = e as MouseEvent;
                event.preventDefault();
                
                // 查找点击的日志条目
                const target = event.target as HTMLElement;
                const logEntry = target.closest('.log-entry') as HTMLElement;
                
                if (logEntry && this.contextMenu) {
                    currentLogEntry = logEntry;
                    
                    // 高亮当前选中的日志条目
                    this.container?.querySelectorAll('.log-entry.selected').forEach(el => {
                        el.classList.remove('selected');
                    });
                    logEntry.classList.add('selected');
                    
                    // 显示右键菜单
                    this.contextMenu.style.display = 'block';
                    this.contextMenu.style.left = `${event.clientX}px`;
                    this.contextMenu.style.top = `${event.clientY}px`;
                    
                    // 确保菜单不超出视窗
                    const menuRect = this.contextMenu.getBoundingClientRect();
                    const viewportWidth = window.innerWidth;
                    const viewportHeight = window.innerHeight;
                    
                    if (menuRect.right > viewportWidth) {
                        this.contextMenu.style.left = `${viewportWidth - menuRect.width - 10}px`;
                    }
                    if (menuRect.bottom > viewportHeight) {
                        this.contextMenu.style.top = `${viewportHeight - menuRect.height - 10}px`;
                    }
                }
            });
        });

        // 点击其他地方关闭右键菜单
        document.addEventListener('click', () => {
            this.hideContextMenu();
        });

        // ESC 键关闭右键菜单
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideContextMenu();
            }
        });

        // 复制单条日志
        const copyItem = this.container.querySelector('#log-copy-item');
        if (copyItem) {
            copyItem.addEventListener('click', () => {
                if (currentLogEntry) {
                    const timestamp = currentLogEntry.querySelector('.log-timestamp')?.textContent || '';
                    const level = currentLogEntry.querySelector('.log-level-indicator')?.textContent || '';
                    const message = currentLogEntry.querySelector('.log-message')?.textContent || '';
                    const logText = `[${timestamp}] [${level}] ${message}`;
                    
                    navigator.clipboard.writeText(logText).then(() => {
                        this.showCopyToast('日志已复制到剪贴板');
                    }).catch(err => {
                        console.error('复制失败:', err);
                    });
                }
                this.hideContextMenu();
            });
        }

        // 复制全部日志
        const copyAllItem = this.container.querySelector('#log-copy-all-item');
        if (copyAllItem) {
            copyAllItem.addEventListener('click', () => {
                const logs = this.activeTab === 'frontend' ? logManager.logQueue : this.backendLogs;
                const logText = logs.map(log => {
                    const time = new Date(log.timestamp).toLocaleTimeString();
                    return `[${time}] [${log.level}] ${log.message}`;
                }).join('\n');
                
                navigator.clipboard.writeText(logText).then(() => {
                    this.showCopyToast(`已复制 ${logs.length} 条日志到剪贴板`);
                }).catch(err => {
                    console.error('复制失败:', err);
                });
                this.hideContextMenu();
            });
        }
    }

    private hideContextMenu(): void {
        if (this.contextMenu) {
            this.contextMenu.style.display = 'none';
        }
        // 移除选中状态
        this.container?.querySelectorAll('.log-entry.selected').forEach(el => {
            el.classList.remove('selected');
        });
    }

    private showCopyToast(message: string): void {
        // 创建提示元素
        const toast = document.createElement('div');
        toast.className = 'log-copy-toast';
        toast.textContent = message;
        
        // 添加到容器
        this.container?.appendChild(toast);
        
        // 显示动画
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });
        
        // 2秒后移除
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, 2000);
    }

    private switchTab(tab: 'frontend' | 'backend'): void {
        //console.log('[LogPage] 切换标签到:', tab);
        this.activeTab = tab;
    
        // 更新标签样式
        this.container?.querySelectorAll('.log-tab').forEach(t => {
          if (t.getAttribute('data-tab') === tab) {
            t.classList.add('active');
          } else {
            t.classList.remove('active');
          }
        });

        // 更新面板显示
        this.container?.querySelectorAll('.log-panel').forEach(p => {
          p.classList.remove('active');
        });
        this.container?.querySelector(`#${tab}-log-panel`)?.classList.add('active');

        // 切换后强制重渲目标标签，避免“数量未变 + 空 DOM”导致该标签日志不显示
        if (tab === 'backend') {
          this.updateBackendLogs(true);
        } else {
          this.updateFrontendLogs(true);
        }
      }

    private startLogUpdates(): void {
        if (this.logUpdateInterval) clearInterval(this.logUpdateInterval);
        this.logUpdateInterval = setInterval(() => {
            if (this.activeTab === 'frontend') {
                this.updateFrontendLogs();
            } else if (this.activeTab === 'backend') {
                this.updateBackendLogs();
            }
        }, 1000);
    }

    public destroy(): void {
        if (this.updateInterval) {
          clearInterval(this.updateInterval);
          this.updateInterval = null;
        }
        this.container = null;
      }

    private updateFrontendLogs(force: boolean = false): void {
        const logList = this.container?.querySelector('#frontend-log-list');
        if (!logList) return;

        const logs = logManager.logQueue;

        // 仅当：未强制 + 列表里确实已渲染出日志条目 + 数量未变 + 非搜索 时才跳过。
        // 关键：加入“DOM 是否已渲染”判断，避免标签切换/父级重渲后 DOM 被清空、
        // 但日志数量没变时被守卫跳过，导致日志“消失”。
        const hasRendered = !!logList.querySelector('.log-entry');
        if (!force && hasRendered && logs.length === this.lastLogCount && !this.searchTerm) {
            return;
        }

        this.lastLogCount = logs.length;

        // Filter logs
        const filteredLogs = this.searchTerm
            ? logs.filter(log =>
                log.message.toLowerCase().includes(this.searchTerm) ||
                log.level.toLowerCase().includes(this.searchTerm)
            )
            : logs;

        // Update stats
        this.updateStats(filteredLogs);

        // Render logs
        // For performance, we could use a virtual list, but for now simple HTML string building
        // Limit to last 1000 logs to prevent DOM explosion
        const displayLogs = filteredLogs.slice(-1000);

        if (displayLogs.length === 0) {
            logList.innerHTML = `
                <div class="log-empty-state">
                    <div class="log-empty-icon">
                        <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                    </div>
                    <div class="log-empty-text">暂无日志记录</div>
                </div>
            `;
            return;
        }

        const html = displayLogs.map(log => {
            const time = new Date(log.timestamp).toLocaleTimeString('zh-CN', { hour12: false });
            // 普通日志文本输出：每条日志一行纯文本（时间 级别 消息），不做表格分排
            return `<div class="log-entry ${log.level}">`
                + `<span class="log-timestamp">${time}</span>`
                + `<span class="log-level-indicator">${this.escapeHtml(log.level.toUpperCase())}</span>`
                + `<span class="log-message">${this.escapeHtml(log.message)}</span>`
                + `</div>`;
        }).join('');

        logList.innerHTML = html;

        if (this.autoScroll) {
            this.scrollToBottom();
        }
    }

    private lastBackendLogCount: number = 0;

    private updateBackendLogs(force: boolean = false) {
        const list = this.container?.querySelector('#backend-log-list');
        if (!list) {
            console.log('[LogPage] 警告：未找到 #backend-log-list 元素');
            return;
        }

        if (this.backendLogs.length === 0) {
            list.innerHTML = `
                <div class="backend-terminal-empty">
                    <div class="terminal-cursor-block">_</div>
                    <div class="terminal-empty-text">Awaiting backend output...</div>
                </div>
            `;
            this.lastBackendLogCount = 0;
            return;
        }

        // 仅当：未强制 + 列表里确实已渲染出日志行 + 数量未变 时才跳过。
        // 同样加入“DOM 是否已渲染”判断，避免切换/重渲后 DOM 被清空、数量没变（含已达 1000 上限）
        // 时被守卫跳过，导致后端日志“消失”。
        const hasRendered = !!list.querySelector('.backend-term-line');
        if (!force && hasRendered && this.backendLogs.length === this.lastBackendLogCount) {
            return;
        }
        this.lastBackendLogCount = this.backendLogs.length;

        const filteredLogs = this.searchTerm
            ? this.backendLogs.filter(log =>
                log.message.toLowerCase().includes(this.searchTerm) ||
                log.level.toLowerCase().includes(this.searchTerm)
            )
            : this.backendLogs;

        const displayLogs = filteredLogs.slice(-1000);

        const html = displayLogs.map((log, index) => {
          const timeStr = new Date(log.timestamp).toLocaleTimeString('zh-CN', { hour12: false });
          const levelSymbol = this.getTerminalLevelSymbol(log.level);
          const levelClass = `term-level-${log.level}`;
    
          return `<div class="backend-term-line ${log.level}" data-index="${index}">`
            + `<span class="term-prompt">${levelSymbol}</span>`
            + `<span class="term-time">${timeStr}</span>`
            + `<span class="term-level ${levelClass}">[${log.level.toUpperCase()}]</span>`
            + `<span class="term-msg">${this.escapeHtml(log.message)}</span>`
            + `</div>`;
        }).join('');
    
        list.innerHTML = html;
        if (this.autoScroll) {
            list.scrollTop = list.scrollHeight;
        }

        // 更新统计
        this.updateStats(filteredLogs);
      }

    private getTerminalLevelSymbol(level: string): string {
        switch (level) {
            case 'error': return '<span class="term-symbol-error">✖</span>';
            case 'warn':  return '<span class="term-symbol-warn">▲</span>';
            case 'info':  return '<span class="term-symbol-info">●</span>';
            case 'debug': return '<span class="term-symbol-debug">◆</span>';
            default:      return '<span class="term-symbol-default">›</span>';
        }
    }
    
    private updateStats(logs: any[]): void {
        const stats = {
            info: 0,
            warn: 0,
            error: 0
        };

        logs.forEach(log => {
            if (log.level === 'info' || log.level === 'log') stats.info++;
            else if (log.level === 'warn') stats.warn++;
            else if (log.level === 'error') stats.error++;
        });

        const updateEl = (id: string, count: number) => {
            const el = this.container?.querySelector(`#${id}`);
            if (el) el.textContent = count.toString();
        };

        updateEl('stat-info', stats.info);
        updateEl('stat-warn', stats.warn);
        updateEl('stat-error', stats.error);
        updateEl('log-total-count', logs.length);
    }

    private scrollToBottom(): void {
        const listId = this.activeTab === 'frontend' ? '#frontend-log-list' : '#backend-log-list';
        const logList = this.container?.querySelector(listId);
        if (logList) {
            logList.scrollTop = logList.scrollHeight;
        }
    }

    private escapeHtml(unsafe: string): string {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
}
