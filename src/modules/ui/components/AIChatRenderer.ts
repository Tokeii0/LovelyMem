import { AppState } from '../../core/types';
import { AIChatV2Manager } from '../../ai-assistant-v2/ui/AIChatV2Manager';

export class AIChatRenderer {
    private manager: AIChatV2Manager;

    constructor(private state: AppState) {
        this.manager = new AIChatV2Manager();
    }

    public updateState(state: AppState) {
        this.state = state;
    }

    public render(): string {
        // Initialize manager after render when the DOM is ready
        setTimeout(() => {
            const checkAndInit = (attempts: number) => {
                if (document.getElementById('messages-container')) {
                    this.manager.initialize('ai-chat-root');
                } else if (attempts > 0) {
                    setTimeout(() => checkAndInit(attempts - 1), 100);
                } else {
                    console.error('Failed to initialize AIChatV2Manager: DOM elements not found');
                }
            };
            checkAndInit(5);
        }, 50);

        return `
        <div class="cc-chat-container" id="ai-chat-root">
            <!-- 左侧会话边栏 -->
            <aside class="cc-sidebar" id="history-sidebar">
                <div class="cc-sidebar-header">
                    <span class="cc-sidebar-title">会话</span>
                    <div style="display:flex;gap:4px;align-items:center">
                        <button class="cc-icon-btn" id="new-chat-btn" title="新对话">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        </button>
                        <button class="cc-icon-btn" id="collapse-sidebar-btn" title="收起侧栏">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></svg>
                        </button>
                    </div>
                </div>
                <div class="cc-session-list modern-scroll" id="history-list"></div>
            </aside>

            <!-- 主聊天区域 -->
            <main class="cc-main">
                <!-- 侧栏展开按钮（侧栏收起时显示） -->
                <button class="cc-sidebar-expand-btn" id="expand-sidebar-btn" title="展开侧栏" style="display:none">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>
                </button>
                <!-- 顶部状态栏 -->
                <header class="cc-statusbar">
                    <div class="cc-statusbar-left">
                        <div class="cc-model-badge">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
                            <select id="ai-provider-selector" title="选择模型">
                                <option value="">加载中...</option>
                            </select>
                        </div>
                    </div>
                    <div class="cc-statusbar-right">
                        <button class="cc-icon-btn cc-popout-btn" id="ai-popout-btn" title="弹出为独立窗口（可吸附右侧）">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
                        </button>
                        <div class="cc-agent-rounds">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                            <select id="ai-agent-rounds" title="Agent轮次上限">
                                <option value="20">20轮</option>
                                <option value="40" selected>40轮</option>
                                <option value="60">60轮</option>
                                <option value="100">100轮</option>
                            </select>
                        </div>
                        <div class="cc-context-info" id="cc-context-info">
                            <span class="cc-context-dot"></span>
                            <span class="cc-context-text">就绪</span>
                        </div>
                    </div>
                </header>

                <!-- 消息区域 -->
                <div class="cc-messages modern-scroll" id="messages-container"></div>

                <!-- 底部输入区域 -->
                <footer class="cc-input-area">
                    <div class="cc-input-wrapper">
                        <textarea
                            class="cc-input"
                            id="message-input"
                            rows="1"
                            placeholder="输入消息... 使用 Shift+Enter 换行"
                        ></textarea>
                        <button class="cc-send-btn" id="send-button" title="发送 (Enter)">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <line x1="22" y1="2" x2="11" y2="13"></line>
                                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                            </svg>
                        </button>
                    </div>
                </footer>
            </main>
        </div>
        `;
    }
}
