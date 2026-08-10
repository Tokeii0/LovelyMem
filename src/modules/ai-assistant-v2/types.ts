/**
 * AI Assistant V2 - 类型定义
 */

// 消息类型
export interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    timestamp: number;
    toolCalls?: ToolCall[];
    toolResults?: ToolResult[];
    thinking?: string;
    metadata?: Record<string, any>;
}

// 工具调用
export interface ToolCall {
    id: string;
    name: string;
    arguments: Record<string, any>;
    status: 'pending' | 'running' | 'completed' | 'error';
}

// 工具结果
export interface ToolResult {
    callId: string;
    name: string;
    output: string;
    success: boolean;
    metadata?: Record<string, any>;
}

// Agent 步骤
export interface AgentStep {
    type: 'thinking' | 'tool_call' | 'tool_result' | 'tool_error' | 'final_answer' | 'iteration' | 'error' | 'retry' | 'cancelled' | 'session_usage' | 'parallel_tools';
    content?: string;
    toolName?: string;
    toolArgs?: Record<string, any>;
    iteration?: number;
    timestamp: number;
}

// Agent 配置
export interface AgentConfig {
    name: string;
    description?: string;
    mode: 'primary' | 'subagent';
    maxIterations: number;
    temperature?: number;
    topP?: number;
    systemPrompt?: string;
    tools: string[];
    permissions: PermissionConfig;
}

// 权限配置
export interface PermissionConfig {
    allowedTools: string[];
    deniedTools: string[];
    autoApprove: boolean;
    confirmDangerous: boolean;
}

// Provider 配置
export interface ProviderConfig {
    id: string;
    name: string;
    apiKey: string;
    baseUrl: string;
    model: string;
    maxTokens?: number;
    streaming?: boolean;
}

// Session 配置
export interface SessionConfig {
    id: string;
    agentName: string;
    providerId: string;
    maxHistory: number;
    autoSave: boolean;
}

// 流式事件
export type StreamEvent = 
    | { type: 'chunk'; content: string }
    | { type: 'thinking'; content: string }
    | { type: 'tool_call'; toolName: string; args: Record<string, any> }
    | { type: 'tool_result'; toolName: string; output: string; success: boolean }
    | { type: 'step'; step: AgentStep }
    | { type: 'error'; message: string }
    | { type: 'done'; finalContent: string };

// 工具定义
export interface ToolDefinition {
    id: string;
    name: string;
    description: string;
    parameters: ToolParameter[];
    execute: (args: Record<string, any>, context: ToolContext) => Promise<ToolExecutionResult>;
}

export interface ToolParameter {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    description: string;
    required: boolean;
    default?: any;
}

export interface ToolContext {
    sessionId: string;
    messageId: string;
    agentName: string;
    workingDirectory: string;
    abort: AbortSignal;
    emit: (event: StreamEvent) => void;
}

export interface ToolExecutionResult {
    output: string;
    success: boolean;
    metadata?: Record<string, any>;
    attachments?: any[];
}
