/**
 * Session 模块 - 会话管理
 */

import type { Message, SessionConfig, AgentStep, StreamEvent, ToolCall, ToolResult } from '../types';

/**
 * 会话状态
 */
export interface SessionState {
    id: string;
    messages: Message[];
    currentMessageId: string | null;
    isStreaming: boolean;
    agentSteps: AgentStep[];
    toolCalls: ToolCall[];
    createdAt: number;
    updatedAt: number;
}

/**
 * Session 类 - 管理单个会话
 */
export class Session {
    private config: SessionConfig;
    private state: SessionState;
    private eventListeners: Map<string, Set<(event: StreamEvent) => void>> = new Map();

    constructor(config: SessionConfig) {
        this.config = config;
        this.state = this.createInitialState();
    }

    private createInitialState(): SessionState {
        return {
            id: this.config.id,
            messages: [],
            currentMessageId: null,
            isStreaming: false,
            agentSteps: [],
            toolCalls: [],
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
    }

    /**
     * 获取会话ID
     */
    getId(): string {
        return this.config.id;
    }

    /**
     * 获取会话配置
     */
    getConfig(): SessionConfig {
        return this.config;
    }

    /**
     * 获取会话状态
     */
    getState(): SessionState {
        return { ...this.state };
    }

    /**
     * 获取所有消息
     */
    getMessages(): Message[] {
        return [...this.state.messages];
    }

    /**
     * 添加消息
     */
    addMessage(message: Omit<Message, 'id' | 'timestamp'>): Message {
        const fullMessage: Message = {
            ...message,
            id: this.generateMessageId(),
            timestamp: Date.now()
        };
        
        this.state.messages.push(fullMessage);
        this.state.currentMessageId = fullMessage.id;
        this.state.updatedAt = Date.now();
        
        // 限制历史消息数量
        if (this.config.maxHistory > 0 && this.state.messages.length > this.config.maxHistory) {
            this.state.messages = this.state.messages.slice(-this.config.maxHistory);
        }
        
        return fullMessage;
    }

    /**
     * 更新消息
     */
    updateMessage(id: string, updates: Partial<Message>): Message | null {
        const index = this.state.messages.findIndex(m => m.id === id);
        if (index === -1) return null;
        
        this.state.messages[index] = {
            ...this.state.messages[index],
            ...updates
        };
        this.state.updatedAt = Date.now();
        
        return this.state.messages[index];
    }

    /**
     * 删除消息
     */
    deleteMessage(id: string): boolean {
        const index = this.state.messages.findIndex(m => m.id === id);
        if (index === -1) return false;
        
        this.state.messages.splice(index, 1);
        this.state.updatedAt = Date.now();
        return true;
    }

    /**
     * 添加Agent步骤
     */
    addAgentStep(step: AgentStep): void {
        this.state.agentSteps.push(step);
        this.emit({ type: 'step', step });
    }

    /**
     * 添加工具调用
     */
    addToolCall(toolCall: ToolCall): void {
        this.state.toolCalls.push(toolCall);
        this.emit({
            type: 'tool_call',
            toolName: toolCall.name,
            args: toolCall.arguments
        });
    }

    /**
     * 更新工具调用状态
     */
    updateToolCallStatus(callId: string, status: ToolCall['status']): void {
        const call = this.state.toolCalls.find(c => c.id === callId);
        if (call) {
            call.status = status;
        }
    }

    /**
     * 开始流式响应
     */
    startStreaming(): void {
        this.state.isStreaming = true;
    }

    /**
     * 结束流式响应
     */
    endStreaming(): void {
        this.state.isStreaming = false;
    }

    /**
     * 清空会话
     */
    clear(): void {
        this.state = this.createInitialState();
    }

    /**
     * 订阅事件
     */
    on(event: string, callback: (event: StreamEvent) => void): () => void {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, new Set());
        }
        this.eventListeners.get(event)!.add(callback);
        
        return () => {
            this.eventListeners.get(event)?.delete(callback);
        };
    }

    /**
     * 发送事件
     */
    emit(event: StreamEvent): void {
        const listeners = this.eventListeners.get(event.type);
        if (listeners) {
            listeners.forEach(callback => callback(event));
        }
        
        // 同时触发通用监听器
        const allListeners = this.eventListeners.get('*');
        if (allListeners) {
            allListeners.forEach(callback => callback(event));
        }
    }

    /**
     * 导出会话数据
     */
    export(): { config: SessionConfig; state: SessionState } {
        return {
            config: this.config,
            state: this.state
        };
    }

    /**
     * 导入会话数据
     */
    import(data: { config: SessionConfig; state: SessionState }): void {
        this.config = data.config;
        this.state = data.state;
    }

    /**
     * 构建用于API调用的消息历史
     */
    buildMessagesForAPI(): Array<{ role: string; content: string; reasoning_content?: string }> {
        return this.state.messages
            .filter(m => m.role !== 'system')
            .map(m => {
                const reasoningContent = m.thinking || m.metadata?.reasoning_content;
                return {
                    role: m.role === 'assistant' ? 'assistant' : 'user',
                    content: m.content,
                    ...(reasoningContent ? { reasoning_content: reasoningContent } : {})
                };
            });
    }

    private generateMessageId(): string {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

/**
 * Session 管理器
 */
export class SessionManager {
    private sessions: Map<string, Session> = new Map();
    private currentSession: Session | null = null;

    /**
     * 创建新会话
     */
    create(config: Omit<SessionConfig, 'id'>): Session {
        const id = this.generateSessionId();
        const session = new Session({ ...config, id });
        this.sessions.set(id, session);
        return session;
    }

    /**
     * 获取会话
     */
    get(id: string): Session | undefined {
        return this.sessions.get(id);
    }

    /**
     * 设置当前会话
     */
    setCurrent(id: string): Session {
        const session = this.sessions.get(id);
        if (!session) {
            throw new Error(`Session not found: ${id}`);
        }
        this.currentSession = session;
        return session;
    }

    /**
     * 获取当前会话
     */
    getCurrent(): Session | null {
        return this.currentSession;
    }

    /**
     * 删除会话
     */
    delete(id: string): boolean {
        if (this.currentSession?.getId() === id) {
            this.currentSession = null;
        }
        return this.sessions.delete(id);
    }

    /**
     * 列出所有会话
     */
    list(): Session[] {
        return Array.from(this.sessions.values());
    }

    /**
     * 保存会话到本地存储
     */
    saveToStorage(id: string): void {
        const session = this.sessions.get(id);
        if (session) {
            const data = session.export();
            localStorage.setItem(`ai-session-${id}`, JSON.stringify(data));
        }
    }

    /**
     * 从本地存储加载会话
     */
    loadFromStorage(id: string): Session | null {
        const stored = localStorage.getItem(`ai-session-${id}`);
        if (!stored) return null;
        
        try {
            const data = JSON.parse(stored);
            const session = new Session(data.config);
            session.import(data);
            this.sessions.set(id, session);
            return session;
        } catch {
            return null;
        }
    }

    /**
     * 从本地存储删除会话
     */
    deleteFromStorage(id: string): void {
        localStorage.removeItem(`ai-session-${id}`);
    }

    /**
     * 列出存储中的所有会话ID
     */
    listStoredSessions(): string[] {
        const ids: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith('ai-session-')) {
                ids.push(key.replace('ai-session-', ''));
            }
        }
        return ids;
    }

    private generateSessionId(): string {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

// 导出单例管理器
export const sessionManager = new SessionManager();
