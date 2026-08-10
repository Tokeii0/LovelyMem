/**
 * AI Chat V2 Manager - 新版AI聊天管理器
 * 基于模块化架构，支持思考、工具调用、代理模式
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { Agent, AgentManager, agentManager, BUILTIN_AGENTS } from '../agent/agent';
import { Session, SessionManager, sessionManager } from '../session/session';
import { toolRegistry, TOOL_ICONS } from '../tools/registry';
import { providerManager } from '../provider/provider';
import type { Message, StreamEvent, AgentStep, ToolCall, ProviderConfig } from '../types';

/**
 * AI Chat V2 Manager
 */
export class AIChatV2Manager {
    // DOM 元素
    private container: HTMLElement | null = null;
    private messagesContainer: HTMLElement | null = null;
    private messageInput: HTMLTextAreaElement | null = null;
    private sendButton: HTMLButtonElement | null = null;
    private statusIndicator: HTMLElement | null = null;
    private agentRoundsSelector: HTMLSelectElement | null = null;
    
    // 状态
    private currentSession: Session | null = null;
    private currentAgent: Agent | null = null;
    private isLoading: boolean = false;
    private isStopped: boolean = false;
    private streamBuffer: string = '';
    private currentStreamMessage: HTMLElement | null = null;
    
    // 事件监听器
    private eventUnlisteners: {
        streamChunk: UnlistenFn | null;
        streamEnd: UnlistenFn | null;
        streamError: UnlistenFn | null;
        agentStep: UnlistenFn | null;
    } = {
        streamChunk: null,
        streamEnd: null,
        streamError: null,
        agentStep: null
    };

    // 配置
    private aiSettings: ProviderConfig | null = null;
    private agentMaxRounds: number = 40;

    // 会话相关常量
    private readonly CURRENT_SESSION_KEY = 'ai-current-session-id';
    private historyList: HTMLElement | null = null;

    constructor() {
        // 尝试恢复上次会话，否则创建新会话
        this.currentSession = this.restoreOrCreateSession();
    }

    /**
     * 恢复或创建会话
     */
    private restoreOrCreateSession(): Session {
        const lastSessionId = localStorage.getItem(this.CURRENT_SESSION_KEY);
        if (lastSessionId) {
            const restored = sessionManager.loadFromStorage(lastSessionId);
            if (restored) {
                console.log('恢复会话:', lastSessionId);
                return restored;
            }
        }
        
        // 创建新会话
        return this.createNewSession();
    }

    /**
     * 创建新会话
     */
    private createNewSession(): Session {
        const session = sessionManager.create({
            agentName: 'build',
            providerId: 'openai',
            maxHistory: 50,
            autoSave: true
        });
        this.saveCurrentSessionId(session.getId());
        return session;
    }

    /**
     * 保存当前会话ID
     */
    private saveCurrentSessionId(id: string): void {
        localStorage.setItem(this.CURRENT_SESSION_KEY, id);
    }

    /**
     * 保存当前会话到存储
     */
    private saveCurrentSession(): void {
        if (this.currentSession) {
            sessionManager.saveToStorage(this.currentSession.getId());
            this.saveCurrentSessionId(this.currentSession.getId());
        }
    }

    /**
     * 初始化管理器
     */
    async initialize(containerId: string): Promise<void> {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error('Container not found:', containerId);
            return;
        }

        this.bindElements();
        this.bindEvents();
        await this.setupStreamListeners();
        await this.loadSettings();
        
        // 加载历史记录列表
        this.loadHistoryList();
        
        // 渲染当前会话的消息
        this.renderSessionMessages();
        
        console.log('AIChatV2Manager initialized');
    }

    /**
     * 加载历史记录列表
     */
    private loadHistoryList(): void {
        this.historyList = this.container?.querySelector('#history-list') || null;
        if (!this.historyList) return;

        // 获取所有存储的会话
        const storedIds = sessionManager.listStoredSessions();
        
        // 清空列表
        this.historyList.innerHTML = '';
        
        // 收集已渲染的会话ID
        const renderedIds = new Set<string>();
        
        // 先渲染当前会话（如果有）
        if (this.currentSession) {
            this.renderHistoryItem(this.currentSession);
            renderedIds.add(this.currentSession.getId());
        }
        
        // 渲染其他存储的会话
        storedIds.forEach(id => {
            if (!renderedIds.has(id)) {
                const session = sessionManager.loadFromStorage(id);
                if (session) {
                    this.renderHistoryItem(session);
                }
            }
        });
    }

    /**
     * 渲染历史记录项
     */
    private renderHistoryItem(session: Session): void {
        if (!this.historyList) return;

        const state = session.getState();
        const messages = state.messages;
        const firstUserMsg = messages.find(m => m.role === 'user');
        const title = firstUserMsg?.content.substring(0, 30) || '新对话';
        const time = new Date(state.createdAt).toLocaleString('zh-CN', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        const isActive = this.currentSession?.getId() === session.getId();

        const item = document.createElement('div');
        item.className = `cc-session-item${isActive ? ' active' : ''}`;
        item.dataset.sessionId = session.getId();
        item.innerHTML = `
            <div class="cc-session-title">${title}${title.length >= 30 ? '...' : ''}</div>
            <div class="cc-session-meta">
                <span class="cc-session-time">${time}</span>
                <button class="cc-session-delete" title="删除对话">&times;</button>
            </div>
        `;

        // 点击切换会话
        item.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target.classList.contains('cc-session-delete')) return;
            this.switchToSession(session.getId());
        });

        // 删除按钮
        const deleteBtn = item.querySelector('.cc-session-delete');
        deleteBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showDeleteConfirm(session.getId(), title);
        });

        this.historyList.appendChild(item);
    }

    /**
     * 显示删除确认弹窗
     */
    private showDeleteConfirm(sessionId: string, title: string): void {
        const overlay = document.createElement('div');
        overlay.className = 'cc-dialog-overlay';
        overlay.innerHTML = `
            <div class="cc-dialog">
                <div class="cc-dialog-title">删除对话</div>
                <div class="cc-dialog-text">确定要删除 "${title}" 吗？此操作无法撤销。</div>
                <div class="cc-dialog-actions">
                    <button class="cc-dialog-btn cc-dialog-cancel">取消</button>
                    <button class="cc-dialog-btn cc-dialog-confirm">删除</button>
                </div>
            </div>
        `;

        overlay.querySelector('.cc-dialog-cancel')?.addEventListener('click', () => {
            overlay.remove();
        });

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });

        overlay.querySelector('.cc-dialog-confirm')?.addEventListener('click', () => {
            this.deleteSession(sessionId);
            overlay.remove();
        });

        document.body.appendChild(overlay);
    }

    /**
     * 删除会话
     */
    private deleteSession(sessionId: string): void {
        console.log('[AIChatV2Manager] 删除会话:', sessionId);
        
        // 从存储中删除
        sessionManager.deleteFromStorage(sessionId);
        sessionManager.delete(sessionId);
        
        console.log('[AIChatV2Manager] 删除后剩余会话:', sessionManager.listStoredSessions());

        // 如果删除的是当前会话，创建新会话
        if (this.currentSession?.getId() === sessionId) {
            console.log('[AIChatV2Manager] 删除的是当前会话，创建新会话');
            this.currentSession = this.createNewSession();
            if (this.messagesContainer) {
                this.messagesContainer.innerHTML = '';
            }
        }

        // 刷新历史列表
        this.loadHistoryList();
    }

    /**
     * 切换到指定会话
     */
    private switchToSession(sessionId: string): void {
        // 保存当前会话
        this.saveCurrentSession();
        
        // 加载目标会话
        const session = sessionManager.get(sessionId) || sessionManager.loadFromStorage(sessionId);
        if (!session) {
            console.error('Session not found:', sessionId);
            return;
        }

        this.currentSession = session;
        this.saveCurrentSessionId(sessionId);
        
        // 重新渲染
        this.renderSessionMessages();
        this.loadHistoryList();
    }

    /**
     * 渲染当前会话的消息
     */
    private renderSessionMessages(): void {
        if (!this.messagesContainer || !this.currentSession) return;

        // 清空消息区域
        this.messagesContainer.innerHTML = '';
        
        // 渲染所有消息
        const messages = this.currentSession.getMessages();
        messages.forEach(msg => {
            this.renderMessage(msg.role as 'user' | 'assistant' | 'system', msg.content);
        });

        this.scrollToBottom();
    }

    /**
     * 渲染单条消息（不保存到会话）
     */
    private renderMessage(role: 'user' | 'assistant' | 'system', content: string): void {
        if (!this.messagesContainer) return;

        const messageDiv = document.createElement('div');
        messageDiv.className = `cc-message cc-message-${role}`;

        if (role === 'user') {
            messageDiv.innerHTML = `
                <div class="cc-msg-prefix">&gt;</div>
                <div class="cc-msg-body">
                    <div class="cc-msg-content">${this.formatContent(content)}</div>
                </div>
            `;
        } else {
            messageDiv.innerHTML = `
                <div class="cc-msg-prefix">⎿</div>
                <div class="cc-msg-body">
                    <div class="cc-msg-content">${this.formatContent(content)}</div>
                </div>
            `;
        }

        this.messagesContainer.appendChild(messageDiv);
    }

    // 新增DOM元素
    private providerSelector: HTMLSelectElement | null = null;
    private contextInfo: HTMLElement | null = null;

    /**
     * 绑定DOM元素
     */
    private bindElements(): void {
        this.messagesContainer = this.container?.querySelector('.cc-messages') || null;
        this.messageInput = this.container?.querySelector('.cc-input') as HTMLTextAreaElement;
        this.sendButton = this.container?.querySelector('.cc-send-btn') as HTMLButtonElement;
        this.agentRoundsSelector = this.container?.querySelector('#ai-agent-rounds') as HTMLSelectElement;
        this.providerSelector = this.container?.querySelector('#ai-provider-selector') as HTMLSelectElement;
        this.contextInfo = this.container?.querySelector('#cc-context-info') || null;
    }

    // SVG图标
    private readonly SEND_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`;
    private readonly STOP_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"></rect></svg>`;

    /**
     * 绑定事件
     */
    private bindEvents(): void {
        // 发送按钮
        this.sendButton?.addEventListener('click', (e) => {
            e.preventDefault();
            if (this.isLoading) {
                void this.stopGeneration();
            } else {
                this.sendMessage();
            }
        });
        
        // 输入框事件
        this.messageInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        
        // 输入框自动调整高度
        this.messageInput?.addEventListener('input', () => {
            if (this.messageInput) {
                this.messageInput.style.height = 'auto';
                this.messageInput.style.height = Math.min(this.messageInput.scrollHeight, 200) + 'px';
            }
        });

        // 提供商选择事件
        this.providerSelector?.addEventListener('change', (e) => {
            const providerId = (e.target as HTMLSelectElement).value;
            this.switchProvider(providerId);
        });
        
        // Agent 轮次数选择事件
        this.agentRoundsSelector?.addEventListener('change', (e) => {
            this.agentMaxRounds = parseInt((e.target as HTMLSelectElement).value);
            console.log('[AIChatV2Manager] Agent 轮次数设置为:', this.agentMaxRounds);
        });
        
        // 加载提供商列表
        this.loadProviders();
        
        // 新建会话按钮
        const newChatBtn = this.container?.querySelector('#new-chat-btn');
        newChatBtn?.addEventListener('click', () => {
            this.startNewSession();
        });

        // 侧栏收起/展开
        const sidebar = this.container?.querySelector('#history-sidebar');
        const collapseBtn = this.container?.querySelector('#collapse-sidebar-btn');
        const expandBtn = this.container?.querySelector('#expand-sidebar-btn');
        collapseBtn?.addEventListener('click', () => {
            sidebar?.classList.add('collapsed');
            if (expandBtn instanceof HTMLElement) expandBtn.style.display = '';
        });
        expandBtn?.addEventListener('click', () => {
            sidebar?.classList.remove('collapsed');
            if (expandBtn instanceof HTMLElement) expandBtn.style.display = 'none';
        });

        // 独立窗口（竖长界面）默认隐藏侧边栏，按需通过展开按钮唤出
        if (document.body.classList.contains('ai-standalone')) {
            sidebar?.classList.add('collapsed');
            if (expandBtn instanceof HTMLElement) expandBtn.style.display = '';
        }

        // 弹出为独立窗口（嵌入面板中显示；独立窗口内通过 CSS 隐藏）
        const popoutBtn = this.container?.querySelector('#ai-popout-btn');
        popoutBtn?.addEventListener('click', () => {
            void this.openStandaloneWindow();
        });
    }

    /**
     * 弹出 AI 助手为独立窗口
     */
    private async openStandaloneWindow(): Promise<void> {
        try {
            const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
            const label = 'ai-chat-window';

            // 已存在则聚焦，避免重复打开
            const existing = await WebviewWindow.getByLabel(label);
            if (existing) {
                await existing.setFocus();
                return;
            }

            const webview = new WebviewWindow(label, {
                url: 'ai_assistant.html',
                title: 'AI 助手 - Lovelymem V2',
                width: 420,
                height: 820,
                minWidth: 340,
                minHeight: 480,
                center: true,
                decorations: false,
                transparent: false,
            });

            webview.once('tauri://error', (e) => {
                console.error('[AIChatV2Manager] 打开 AI 助手独立窗口失败:', e);
            });
        } catch (error) {
            console.error('[AIChatV2Manager] 打开 AI 助手独立窗口失败:', error);
        }
    }

    /**
     * 开始新会话
     */
    private startNewSession(): void {
        // 保存当前会话
        this.saveCurrentSession();
        
        // 创建新会话
        this.currentSession = this.createNewSession();
        
        // 清空消息区域
        if (this.messagesContainer) {
            this.messagesContainer.innerHTML = '';
        }
        
        // 更新历史记录列表
        this.loadHistoryList();
    }
    
    /**
     * 更新上下文状态显示
     */
    private updateContextStatus(text: string, connected: boolean): void {
        if (!this.contextInfo) return;
        const dot = this.contextInfo.querySelector('.cc-context-dot');
        const label = this.contextInfo.querySelector('.cc-context-text');
        if (dot) {
            (dot as HTMLElement).className = `cc-context-dot ${connected ? 'active' : 'error'}`;
        }
        if (label) label.textContent = text;
    }
    
    /**
     * 加载AI提供商列表
     */
    private async loadProviders(): Promise<void> {
        try {
            const providers = await invoke('load_ai_providers') as any[];
            const currentProvider = await invoke('get_current_ai_provider') as any;
            if (this.providerSelector && providers) {
                this.providerSelector.innerHTML = '';
                
                const enabledProviders = providers.filter((p: any) => p.enabled !== false);
                if (providers.length === 0) {
                    const option = document.createElement('option');
                    option.value = '';
                    option.textContent = '未配置';
                    this.providerSelector.appendChild(option);
                } else {
                    providers.forEach((p: any) => {
                        const option = document.createElement('option');
                        option.value = p.id;
                        const label = p.model || p.name;
                        option.textContent = p.enabled === false ? `${label}（已禁用）` : label;
                        option.disabled = p.enabled === false;
                        if (currentProvider?.id === p.id) {
                            option.selected = true;
                        }
                        this.providerSelector!.appendChild(option);
                    });

                    if (!currentProvider && enabledProviders.length > 0) {
                        const firstEnabled = enabledProviders[0];
                        this.providerSelector.value = firstEnabled.id;
                        await invoke('set_current_ai_provider', { providerId: firstEnabled.id });
                    }
                }
            }
        } catch (error) {
            console.error('Failed to load providers:', error);
            if (this.providerSelector) {
                this.providerSelector.innerHTML = '<option value="">加载失败</option>';
            }
        }
    }

    private isLocalAiProvider(): boolean {
        const baseUrl = ((this.aiSettings as any)?.base_url || (this.aiSettings as any)?.baseUrl || '').toLowerCase();
        return baseUrl.includes('localhost:11434') || baseUrl.includes('127.0.0.1:11434') || baseUrl.includes('ollama');
    }
    
    /**
     * 切换AI提供商
     */
    private async switchProvider(providerId: string): Promise<void> {
        if (!providerId) return;
        try {
            await invoke('set_current_ai_provider', { providerId });
            await this.loadSettings();
            console.log('Provider switched to:', providerId);
        } catch (error) {
            console.error('Failed to switch provider:', error);
        }
    }

    /**
     * 设置流式事件监听器
     */
    private async setupStreamListeners(): Promise<void> {
        // 清理旧监听器
        if (this.eventUnlisteners.streamChunk) this.eventUnlisteners.streamChunk();
        if (this.eventUnlisteners.streamEnd) this.eventUnlisteners.streamEnd();
        if (this.eventUnlisteners.streamError) this.eventUnlisteners.streamError();
        if (this.eventUnlisteners.agentStep) this.eventUnlisteners.agentStep();

        // 注册新监听器
        this.eventUnlisteners.streamChunk = await listen('ai-stream-chunk', (event: any) => {
            this.handleStreamChunk(event.payload);
        });

        this.eventUnlisteners.streamEnd = await listen('ai-stream-end', () => {
            this.handleStreamEnd();
        });

        this.eventUnlisteners.streamError = await listen('ai-stream-error', (event: any) => {
            this.handleStreamError(event.payload);
        });

        this.eventUnlisteners.agentStep = await listen('agent-step', (event: any) => {
            this.handleAgentStep(event.payload);
        });
    }

    /**
     * 加载设置
     */
    private async loadSettings(): Promise<void> {
        try {
            const { getAiConfig } = await import('../../core/aiConfigHelper');
            const config = await getAiConfig();
            if (config) {
                this.aiSettings = config as any;
                console.log('AI Settings loaded via unified helper');
            } else {
                console.log('AI not configured');
            }

            const settings = await invoke('load_settings_command') as any;
            this.currentAgentType = settings.ai_default_agent === 'analyze'
                ? 'forensic'
                : (settings.ai_default_agent || 'general');
            this.updateContextStatus('分析模式', true);
        } catch (error) {
            console.error('Failed to load AI settings:', error);
        }
    }

    /**
     * 发送消息
     */
    async sendMessage(): Promise<void> {
        if (!this.messageInput) return;
        const content = this.messageInput.value.trim();
        if (!content || this.isLoading) return;

        // 检查API Key配置
        const apiKey = (this.aiSettings as any)?.api_key;
        if (!apiKey && !this.isLocalAiProvider()) {
            this.addSystemMessage('请先在设置中配置 AI 提供商的 API Key（设置 → AI助手）');
            return;
        }

        // 添加用户消息
        this.addMessage('user', content);
        this.messageInput.value = '';
        this.messageInput.style.height = 'auto';
        this.isLoading = true;
        this.isStopped = false;
        this.updateButtonState();

        // 显示思考状态
        this.showThinkingStatus('正在分析...');

        try {
            await this.callAgentAPI(content);
        } catch (error) {
            if (this.isStopped) return;
            console.error('Send message failed:', error);
            this.removeThinkingStatus();
            this.addSystemMessage(`发送失败: ${error}`);
            this.isLoading = false;
            this.updateButtonState();
        }
    }

    /**
     * 调用Agent API (V2版本)
     */
    private async callAgentAPI(message: string): Promise<void> {
        const request = {
            message,
            ai_settings: this.aiSettings,
            context: { selected_files: [], selected_text: '' },
            history: this.currentSession?.buildMessagesForAPI() || [],
            max_iterations: this.agentMaxRounds,
            agent_type: this.currentAgentType || 'build'
        };

        console.log('[AIChatV2Manager] 调用 Agent API，轮次数:', this.agentMaxRounds);

        // 使用V2版本的Agent调用
        await invoke('call_ai_agent_v2', {
            request,
            windowLabel: await this.resolveWindowLabel()
        });
    }

    /**
     * 解析当前窗口标签。
     * 后端通过 emit_to(windowLabel, ...) 定向推送流式事件，
     * 嵌入主程序时为 'main'，独立窗口时为自身标签（如 ai-chat-window）。
     */
    private windowLabelCache: string | null = null;
    private async resolveWindowLabel(): Promise<string> {
        if (this.windowLabelCache) return this.windowLabelCache;
        try {
            const { getCurrentWindow } = await import('@tauri-apps/api/window');
            this.windowLabelCache = getCurrentWindow().label || 'main';
        } catch {
            this.windowLabelCache = 'main';
        }
        return this.windowLabelCache;
    }

    /**
     * 获取可用工具列表
     */
    async getAvailableTools(): Promise<any[]> {
        try {
            return await invoke('get_available_tools_v2');
        } catch (error) {
            console.error('获取工具列表失败:', error);
            return [];
        }
    }

    /**
     * 获取可用代理列表
     */
    async getAvailableAgents(): Promise<any[]> {
        try {
            return await invoke('get_available_agents');
        } catch (error) {
            console.error('获取代理列表失败:', error);
            return [];
        }
    }

    /**
     * 直接执行工具
     */
    async executeTool(toolName: string, args: Record<string, any>): Promise<any> {
        try {
            return await invoke('execute_tool_v2', {
                tool_name: toolName,
                args,
                working_directory: null
            });
        } catch (error) {
            console.error('执行工具失败:', error);
            throw error;
        }
    }

    // 当前代理类型
    private currentAgentType: string = 'build';

    /**
     * 处理流式内容块
     */
    private handleStreamChunk(chunk: string): void {
        // 如果已停止，忽略后续事件
        if (this.isStopped) return;

        if (!this.currentStreamMessage) {
            this.createStreamMessage();
        }
        this.streamBuffer += chunk;
        
        if (this.currentStreamMessage) {
            const contentDiv = this.currentStreamMessage.querySelector('.cc-msg-content');
            if (contentDiv) {
                contentDiv.innerHTML = this.formatContent(this.streamBuffer);
            }
        }
        this.scrollToBottom();
    }

    /**
     * 处理流式结束
     */
    private handleStreamEnd(): void {
        if (this.isStopped) return;

        this.isLoading = false;
        this.removeThinkingStatus();
        
        // 保存到会话历史
        if (this.currentSession && this.streamBuffer) {
            this.currentSession.addMessage({
                role: 'assistant',
                content: this.streamBuffer
            });
            // 保存会话到存储
            this.saveCurrentSession();
            this.loadHistoryList();
        }
        
        this.currentStreamMessage = null;
        this.streamBuffer = '';
        this.isLoading = false;
        this.updateButtonState();
        this.updateStatus('已连接', true);
    }

    /**
     * 处理流式错误
     */
    private handleStreamError(error: string): void {
        if (this.isStopped) return;

        this.isLoading = false;
        this.updateButtonState();
        this.removeThinkingStatus();
        this.addSystemMessage(`错误: ${error}`);
        this.currentStreamMessage = null;
        this.updateStatus('错误', false);
    }

    /**
     * 处理Agent步骤
     */
    private handleAgentStep(step: any): void {
        // 如果已停止，忽略后续事件
        if (this.isStopped) return;

        const stepType = step.step_type || step.type || 'unknown';
        const toolName = step.tool_name || step.tool || '';
        const toolArgs = step.tool_args ? JSON.stringify(step.tool_args) : '';
        const content = step.content || '';

        switch (stepType) {
            case 'tool_call':
                this.removeThinkingStatus();
                this.showThinkingStatus(Agent.getToolStatusText(toolName));
                this.addToolCallBubble(toolName, toolArgs);
                break;

            case 'tool_result':
                this.removeThinkingStatus();
                this.updateToolCallStatus(toolName, true, content);
                break;

            case 'tool_error':
                this.removeThinkingStatus();
                this.updateToolCallStatus(toolName, false, content);
                break;

            case 'thinking':
                // 显示思考内容（OpenCode风格 - 可折叠）
                if (content && content.trim()) {
                    this.addThinkingBubble(content);
                } else {
                    this.showThinkingStatus('正在思考...');
                }
                break;

            case 'retry':
                this.showThinkingStatus(content || '正在重试...');
                break;

            case 'final_answer':
                this.removeThinkingStatus();
                if (content && content.trim()) {
                    const reasoningContent = step.reasoning_content
                        || step.reasoningContent
                        || step.tool_args?.reasoning_content
                        || step.toolArgs?.reasoning_content;
                    this.addMessage(
                        'assistant',
                        content,
                        reasoningContent
                            ? {
                                thinking: reasoningContent,
                                metadata: { reasoning_content: reasoningContent }
                            }
                            : undefined
                    );
                    // 保存会话到存储
                    this.saveCurrentSession();
                    this.loadHistoryList();
                }
                this.isLoading = false;
                this.updateButtonState();
                this.updateStatus('已连接', true);
                break;

            case 'cancelled':
                this.removeThinkingStatus();
                this.isLoading = false;
                this.updateButtonState();
                this.updateStatus('已停止', true);
                this.addSystemMessage(content || '已停止生成');
                break;
        }
    }

    /**
     * 添加消息到UI - Claude Code 风格
     */
    private addMessage(
        role: 'user' | 'assistant' | 'system',
        content: string,
        extras?: { thinking?: string; metadata?: Record<string, any> }
    ): void {
        if (!this.messagesContainer) return;

        // 保存到会话
        this.currentSession?.addMessage({ role, content, ...extras });

        const messageDiv = document.createElement('div');
        messageDiv.className = `cc-message cc-message-${role}`;

        if (role === 'user') {
            messageDiv.innerHTML = `
                <div class="cc-msg-prefix">&gt;</div>
                <div class="cc-msg-body">
                    <div class="cc-msg-content">${this.formatContent(content)}</div>
                </div>
            `;
        } else if (role === 'system') {
            messageDiv.innerHTML = `
                <div class="cc-msg-prefix">!</div>
                <div class="cc-msg-body">
                    <div class="cc-msg-content cc-system-text">${content}</div>
                </div>
            `;
        } else {
            messageDiv.innerHTML = `
                <div class="cc-msg-prefix">⎿</div>
                <div class="cc-msg-body">
                    <div class="cc-msg-content">${this.formatContent(content)}</div>
                </div>
            `;
        }

        this.messagesContainer.appendChild(messageDiv);
        this.scrollToBottom();
    }

    /**
     * 添加系统消息
     */
    private addSystemMessage(content: string): void {
        if (!this.messagesContainer) return;

        const div = document.createElement('div');
        div.className = 'cc-message cc-message-system';
        div.innerHTML = `
            <div class="cc-msg-prefix">!</div>
            <div class="cc-msg-body">
                <div class="cc-msg-content cc-system-text">${content}</div>
            </div>
        `;
        this.messagesContainer.appendChild(div);
        this.scrollToBottom();
    }

    /**
     * 创建流式消息 - Claude Code 风格
     */
    private createStreamMessage(): void {
        if (!this.messagesContainer) return;

        this.currentStreamMessage = document.createElement('div');
        this.currentStreamMessage.className = 'cc-message cc-message-assistant';
        this.currentStreamMessage.innerHTML = `
            <div class="cc-msg-prefix">⎿</div>
            <div class="cc-msg-body">
                <div class="cc-msg-content">
                    <span class="cc-cursor"></span>
                </div>
            </div>
        `;
        this.messagesContainer.appendChild(this.currentStreamMessage);
        this.streamBuffer = '';
    }

    /**
     * 显示思考状态（Claude Code 风格 - ∴ 图标）
     */
    private showThinkingStatus(status: string, detail?: string): void {
        if (!this.messagesContainer) return;
        this.removeThinkingStatus();

        const bubble = document.createElement('div');
        bubble.className = 'cc-thinking';
        bubble.innerHTML = `
            <div class="cc-thinking-dot"></div>
            <span class="cc-thinking-text">${status}</span>
            ${detail ? `<span class="cc-thinking-detail">· ${detail}</span>` : ''}
        `;
        this.messagesContainer.appendChild(bubble);
        this.updateContextStatus(status, true);
        this.scrollToBottom();
    }

    /**
     * 移除思考状态
     */
    private removeThinkingStatus(): void {
        this.messagesContainer?.querySelector('.cc-thinking')?.remove();
    }

    /**
     * 添加思考内容气泡（Claude Code 风格 - 可折叠）
     */
    private addThinkingBubble(content: string): void {
        if (!this.messagesContainer) return;
        
        this.removeThinkingStatus();
        
        const lines = content.trim().split('\n');
        const firstLine = lines[0] || '';
        const summary = firstLine.length > 60 ? firstLine.substring(0, 60) + '...' : firstLine;
        const hasMore = content.length > summary.length || lines.length > 1;
        
        const bubble = document.createElement('div');
        bubble.className = 'cc-reasoning collapsed';
        bubble.innerHTML = `
            <div class="cc-reasoning-header">
                <span class="cc-reasoning-icon">∴</span>
                <span class="cc-reasoning-label">Thinking</span>
                <span class="cc-reasoning-summary">${summary}</span>
                ${hasMore ? '<span class="cc-reasoning-chevron">▶</span>' : ''}
            </div>
            <div class="cc-reasoning-body">
                <div class="cc-reasoning-text">${this.formatContent(content)}</div>
            </div>
        `;
        
        if (hasMore) {
            const header = bubble.querySelector('.cc-reasoning-header');
            header?.addEventListener('click', () => {
                bubble.classList.toggle('collapsed');
            });
        }
        
        this.messagesContainer.appendChild(bubble);
        this.scrollToBottom();
    }
    /**
     * 添加工具调用气泡（Claude Code 风格 - ● 状态指示器）
     */
    private addToolCallBubble(toolName: string, args: string): void {
        if (!this.messagesContainer) return;

        let argsDisplay = '';
        let subtitle = '';
        try {
            const argsObj = JSON.parse(args);
            const keys = Object.keys(argsObj);
            if (keys.length > 0) {
                const firstKey = keys[0];
                const firstValue = String(argsObj[firstKey]);
                subtitle = firstValue.length > 60 ? firstValue.substring(0, 60) + '...' : firstValue;
                argsDisplay = JSON.stringify(argsObj, null, 2);
            } else {
                argsDisplay = '无参数';
                subtitle = '';
            }
        } catch {
            argsDisplay = args || '无参数';
            subtitle = args ? args.substring(0, 60) : '';
        }

        const bubble = document.createElement('div');
        bubble.className = 'cc-tool collapsed';
        bubble.setAttribute('data-tool', toolName);
        bubble.innerHTML = `
            <div class="cc-tool-header">
                <span class="cc-tool-dot">●</span>
                <span class="cc-tool-name">${toolName}</span>
                ${subtitle ? `<span class="cc-tool-subtitle">${subtitle}</span>` : ''}
                <span class="cc-tool-chevron">▶</span>
            </div>
            <div class="cc-tool-body">
                <pre class="cc-tool-args">${argsDisplay}</pre>
            </div>
        `;

        const header = bubble.querySelector('.cc-tool-header');
        header?.addEventListener('click', () => {
            bubble.classList.toggle('collapsed');
        });

        this.messagesContainer.appendChild(bubble);
        this.scrollToBottom();
    }

    /**
     * 更新工具调用状态
     */
    private updateToolCallStatus(toolName: string, success: boolean, resultContent?: string): void {
        const bubble = this.messagesContainer?.querySelector(
            `.cc-tool[data-tool="${toolName}"]:not(.done)`
        );
        if (!bubble) return;

        const dot = bubble.querySelector('.cc-tool-dot');
        if (dot) {
            if (success) {
                dot.classList.add('success');
                dot.textContent = '●';
            } else {
                dot.classList.add('error');
                dot.textContent = '●';
            }
        }

        // 将工具结果内容填充到折叠面板中
        if (resultContent && resultContent.trim()) {
            const body = bubble.querySelector('.cc-tool-body');
            if (body) {
                const resultDiv = document.createElement('div');
                resultDiv.className = 'cc-tool-result';
                // 截断过长内容避免 DOM 卡顿
                const maxLen = 5000;
                let display = resultContent;
                if (display.length > maxLen) {
                    display = display.substring(0, maxLen) + `\n\n... (已截断，共 ${resultContent.length} 字符)`;
                }
                resultDiv.innerHTML = `<pre class="cc-tool-output">${this.escapeHtml(display)}</pre>`;
                body.appendChild(resultDiv);
            }
        }

        bubble.classList.add('done');
    }

    /**
     * 更新连接状态
     */
    private updateStatus(text: string, connected: boolean): void {
        this.updateContextStatus(text, connected);
    }

    /**
     * 滚动到底部
     */
    private scrollToBottom(): void {
        if (this.messagesContainer) {
            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        }
    }

    /**
     * 格式化内容（支持Markdown渲染）
     */
    private formatContent(content: string): string {
        return this.parseMarkdown(content);
    }

    /**
     * 简单的Markdown解析器
     */
    private parseMarkdown(text: string): string {
        let html = text;
        
        // 转义HTML特殊字符（保留代码块内的内容）
        html = this.escapeHtml(html);
        
        // 代码块 ```code``` — 先用占位符保护，避免后续 \n→<br> 替换影响 <pre> 内容
        const codeBlocks: string[] = [];
        html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
            const langLabel = lang || 'text';
            const codeId = `code-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            const block = `<div class="cc-code-block-wrapper">` +
                `<div class="cc-code-block-header">` +
                `<span class="cc-code-lang">${langLabel}</span>` +
                `<button class="cc-code-copy-btn" data-code-id="${codeId}" onclick="(function(btn){var c=btn.closest('.cc-code-block-wrapper').querySelector('code');navigator.clipboard.writeText(c.textContent);btn.classList.add('copied');btn.textContent='✓ 已复制';setTimeout(function(){btn.classList.remove('copied');btn.textContent='复制'},1500)})(this)">复制</button>` +
                `</div>` +
                `<pre class="ai-code-block" data-lang="${lang}"><code>${code.trim()}</code></pre>` +
                `</div>`;
            const placeholder = `\x00CODEBLOCK_${codeBlocks.length}\x00`;
            codeBlocks.push(block);
            return placeholder;
        });
        
        // 行内代码 `code`
        html = html.replace(/`([^`]+)`/g, '<code class="ai-inline-code">$1</code>');
        
        // 表格解析
        html = this.parseMarkdownTable(html);
        
        // 标题
        html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
        html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
        html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
        
        // 粗体 **text**
        html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        
        // 斜体 *text*
        html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        
        // 链接 [text](url)
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
        
        // 无序列表
        html = html.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
        html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
        
        // 有序列表
        html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
        
        // 引用块
        html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
        
        // 水平线
        html = html.replace(/^---$/gm, '<hr>');
        
        // 段落（双换行）
        html = html.replace(/\n\n/g, '</p><p>');
        
        // 单换行
        html = html.replace(/\n/g, '<br>');
        
        // 清理：移除空段落和块级元素周围多余的 br/p
        html = html.replace(/<p><\/p>/g, '');
        html = html.replace(/(<br>){3,}/g, '<br>');
        html = html.replace(/<br>\s*(<\/p>)/g, '$1');
        html = html.replace(/(<p>)\s*<br>/g, '$1');
        html = html.replace(/<br>\s*(<h[123]>)/g, '$1');
        html = html.replace(/(<\/h[123]>)\s*<br>/g, '$1');
        html = html.replace(/<br>\s*(<hr>)/g, '$1');
        html = html.replace(/(<hr>)\s*<br>/g, '$1');
        html = html.replace(/<br>\s*(<table)/g, '$1');
        html = html.replace(/(<\/table>)\s*<br>/g, '$1');
        html = html.replace(/<br>\s*(<pre)/g, '$1');
        html = html.replace(/(<\/pre>)\s*<br>/g, '$1');
        html = html.replace(/<br>\s*(<ul>)/g, '$1');
        html = html.replace(/(<\/ul>)\s*<br>/g, '$1');
        html = html.replace(/<br>\s*(<blockquote>)/g, '$1');
        html = html.replace(/(<\/blockquote>)\s*<br>/g, '$1');
        html = html.replace(/<p>\s*(<h[123]>)/g, '$1');
        html = html.replace(/(<\/h[123]>)\s*<\/p>/g, '$1');
        html = html.replace(/<p>\s*(<hr>)/g, '$1');
        html = html.replace(/(<hr>)\s*<\/p>/g, '$1');
        html = html.replace(/<p>\s*(<table)/g, '$1');
        html = html.replace(/(<\/table>)\s*<\/p>/g, '$1');
        html = html.replace(/<p>\s*(<pre)/g, '$1');
        html = html.replace(/(<\/pre>)\s*<\/p>/g, '$1');
        
        // 包装段落
        if (!html.startsWith('<')) {
            html = `<p>${html}</p>`;
        }
        
        // 还原代码块占位符
        for (let i = 0; i < codeBlocks.length; i++) {
            html = html.replace(`\x00CODEBLOCK_${i}\x00`, codeBlocks[i]);
        }
        
        return html;
    }

    /**
     * 解析 Markdown 表格
     */
    private parseMarkdownTable(text: string): string {
        const lines = text.split('\n');
        const result: string[] = [];
        let inTable = false;
        let tableRows: string[] = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // 检测表格行（以 | 开头和结尾）
            if (line.startsWith('|') && line.endsWith('|')) {
                // 检查是否是分隔行（如 |---|---| 或 | :--- | :--- |）
                // 分隔行的特征：每个单元格只包含 -、:、空格
                const cells = line.slice(1, -1).split('|');
                const isSeparator = cells.every(cell => /^[\s\-:]+$/.test(cell) && cell.includes('-'));
                
                if (isSeparator) {
                    // 这是分隔行，标记表格开始
                    if (!inTable && tableRows.length > 0) {
                        inTable = true;
                    }
                    continue;
                }
                
                tableRows.push(line);
            } else {
                // 不是表格行，输出之前累积的表格
                if (tableRows.length > 0) {
                    if (inTable) {
                        result.push(this.buildTable(tableRows));
                    } else {
                        // 只有表头没有分隔行，当普通行处理
                        result.push(...tableRows);
                    }
                    tableRows = [];
                    inTable = false;
                }
                result.push(lines[i]);
            }
        }

        // 处理最后的表格
        if (tableRows.length > 0 && inTable) {
            result.push(this.buildTable(tableRows));
        } else if (tableRows.length > 0) {
            result.push(...tableRows);
        }

        return result.join('\n');
    }

    /**
     * 构建 HTML 表格
     */
    private buildTable(rows: string[]): string {
        if (rows.length === 0) return '';

        const parseRow = (row: string): string[] => {
            return row
                .slice(1, -1) // 去掉首尾的 |
                .split('|')
                .map(cell => cell.trim());
        };

        const headerCells = parseRow(rows[0]);
        const bodyRows = rows.slice(1);

        let html = '<table class="ai-markdown-table">\n<thead>\n<tr>';
        for (const cell of headerCells) {
            html += `<th>${cell}</th>`;
        }
        html += '</tr>\n</thead>\n<tbody>';

        for (const row of bodyRows) {
            const cells = parseRow(row);
            html += '\n<tr>';
            for (const cell of cells) {
                html += `<td>${cell}</td>`;
            }
            html += '</tr>';
        }

        html += '\n</tbody>\n</table>';
        return html;
    }

    /**
     * 转义HTML特殊字符
     */
    private escapeHtml(text: string): string {
        const map: Record<string, string> = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
        };
        return text.replace(/[&<>]/g, m => map[m] || m);
    }

    /**
     * 格式化时间
     */
    private formatTime(): string {
        return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }

    /**
     * 获取当前会话
     */
    getSession(): Session | null {
        return this.currentSession;
    }

    /**
     * 切换Agent
     */
    switchAgent(agentName: string): void {
        this.currentAgent = agentManager.getOrCreateAgent(agentName);
        this.currentAgentType = agentName;
    }

    /**
     * 停止生成
     */
    private async stopGeneration(): Promise<void> {
        console.log('停止生成');
        this.isStopped = true;
        this.isLoading = false;
        this.removeThinkingStatus();
        this.updateButtonState();
        this.addSystemMessage('已停止生成');
        this.currentStreamMessage = null;
        this.streamBuffer = '';
        
        // 清理所有未完成的工具调用气泡
        this.messagesContainer?.querySelectorAll('.cc-tool:not(.done)').forEach(bubble => {
            bubble.remove();
        });

        try {
            await invoke('cancel_agent_v2');
        } catch (error) {
            console.error('取消 AI 生成失败:', error);
        }
    }

    /**
     * 更新按钮状态
     */
    private updateButtonState(): void {
        if (!this.sendButton) return;
        
        if (this.isLoading) {
            this.sendButton.innerHTML = this.STOP_ICON;
            this.sendButton.classList.add('is-loading');
            this.sendButton.title = '停止';
        } else {
            this.sendButton.innerHTML = this.SEND_ICON;
            this.sendButton.classList.remove('is-loading');
            this.sendButton.title = '发送';
        }
    }

    /**
     * 清理资源
     */
    destroy(): void {
        this.eventUnlisteners.streamChunk?.();
        this.eventUnlisteners.streamEnd?.();
        this.eventUnlisteners.streamError?.();
        this.eventUnlisteners.agentStep?.();
    }
}

// 导出单例
export const aiChatV2Manager = new AIChatV2Manager();
