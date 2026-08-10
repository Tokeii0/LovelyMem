/**
 * Agent 模块 - 核心代理实现
 * 支持思考、工具调用、多代理协作
 */

import type { AgentConfig, AgentStep, Message, StreamEvent, ToolCall, ToolResult } from '../types';

// 内置代理配置
export const BUILTIN_AGENTS: Record<string, AgentConfig> = {
    build: {
        name: 'build',
        description: '构建代理 - 用于编写和修改代码、执行构建任务',
        mode: 'primary',
        maxIterations: 20,
        temperature: 0.7,
        tools: ['read_file', 'write_file', 'list_files', 'search_in_file', 'grep_files', 'bash', 'edit'],
        permissions: {
            allowedTools: ['*'],
            deniedTools: [],
            autoApprove: false,
            confirmDangerous: true
        }
    },
    plan: {
        name: 'plan',
        description: '规划代理 - 用于分析需求、制定计划',
        mode: 'primary',
        maxIterations: 10,
        temperature: 0.5,
        tools: ['read_file', 'list_files', 'search_in_file', 'grep_files', 'todowrite', 'todoread'],
        permissions: {
            allowedTools: ['read_file', 'list_files', 'search_in_file', 'grep_files', 'todowrite', 'todoread'],
            deniedTools: ['write_file', 'bash', 'edit'],
            autoApprove: true,
            confirmDangerous: false
        }
    },
    explore: {
        name: 'explore',
        description: '探索代理 - 快速搜索和分析代码库',
        mode: 'subagent',
        maxIterations: 15,
        temperature: 0.3,
        tools: ['read_file', 'list_files', 'search_in_file', 'grep_files', 'get_file_info'],
        permissions: {
            allowedTools: ['read_file', 'list_files', 'search_in_file', 'grep_files', 'get_file_info'],
            deniedTools: ['write_file', 'bash', 'edit'],
            autoApprove: true,
            confirmDangerous: false
        }
    },
    general: {
        name: 'general',
        description: '通用代理 - 处理复杂任务和多步骤操作',
        mode: 'subagent',
        maxIterations: 25,
        temperature: 0.7,
        tools: ['read_file', 'write_file', 'list_files', 'search_in_file', 'grep_files', 'bash', 'task'],
        permissions: {
            allowedTools: ['*'],
            deniedTools: [],
            autoApprove: false,
            confirmDangerous: true
        }
    }
};

// Agent 状态
export interface AgentState {
    currentIteration: number;
    steps: AgentStep[];
    toolCalls: ToolCall[];
    toolResults: ToolResult[];
    thinking: string[];
    isRunning: boolean;
    abortController: AbortController | null;
}

// Agent 执行上下文
export interface AgentContext {
    sessionId: string;
    messages: Message[];
    config: AgentConfig;
    workingDirectory: string;
    emit: (event: StreamEvent) => void;
}

/**
 * Agent 类 - 核心代理实现
 */
export class Agent {
    private config: AgentConfig;
    private state: AgentState;

    constructor(config: AgentConfig) {
        this.config = config;
        this.state = this.createInitialState();
    }

    private createInitialState(): AgentState {
        return {
            currentIteration: 0,
            steps: [],
            toolCalls: [],
            toolResults: [],
            thinking: [],
            isRunning: false,
            abortController: null
        };
    }

    /**
     * 获取代理配置
     */
    getConfig(): AgentConfig {
        return this.config;
    }

    /**
     * 获取代理状态
     */
    getState(): AgentState {
        return { ...this.state };
    }

    /**
     * 重置代理状态
     */
    reset(): void {
        this.state = this.createInitialState();
    }

    /**
     * 开始执行
     */
    start(): void {
        this.state.isRunning = true;
        this.state.abortController = new AbortController();
    }

    /**
     * 停止执行
     */
    stop(): void {
        this.state.isRunning = false;
        this.state.abortController?.abort();
        this.state.abortController = null;
    }

    /**
     * 添加思考步骤
     */
    addThinkingStep(content: string): AgentStep {
        const step: AgentStep = {
            type: 'thinking',
            content,
            timestamp: Date.now()
        };
        this.state.steps.push(step);
        this.state.thinking.push(content);
        return step;
    }

    /**
     * 添加工具调用步骤
     */
    addToolCallStep(toolName: string, args: Record<string, any>): AgentStep {
        const step: AgentStep = {
            type: 'tool_call',
            toolName,
            toolArgs: args,
            timestamp: Date.now()
        };
        this.state.steps.push(step);
        
        const toolCall: ToolCall = {
            id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: toolName,
            arguments: args,
            status: 'pending'
        };
        this.state.toolCalls.push(toolCall);
        
        return step;
    }

    /**
     * 添加工具结果步骤
     */
    addToolResultStep(toolName: string, output: string, success: boolean): AgentStep {
        const step: AgentStep = {
            type: 'tool_result',
            toolName,
            content: output,
            timestamp: Date.now()
        };
        this.state.steps.push(step);
        
        const lastCall = this.state.toolCalls.find(c => c.name === toolName && c.status === 'running');
        if (lastCall) {
            lastCall.status = success ? 'completed' : 'error';
            this.state.toolResults.push({
                callId: lastCall.id,
                name: toolName,
                output,
                success
            });
        }
        
        return step;
    }

    /**
     * 添加迭代步骤
     */
    incrementIteration(): AgentStep {
        this.state.currentIteration++;
        const step: AgentStep = {
            type: 'iteration',
            iteration: this.state.currentIteration,
            timestamp: Date.now()
        };
        this.state.steps.push(step);
        return step;
    }

    /**
     * 添加最终答案步骤
     */
    addFinalAnswerStep(content: string): AgentStep {
        const step: AgentStep = {
            type: 'final_answer',
            content,
            timestamp: Date.now()
        };
        this.state.steps.push(step);
        this.state.isRunning = false;
        return step;
    }

    /**
     * 检查是否可以继续执行
     */
    canContinue(): boolean {
        return (
            this.state.isRunning &&
            this.state.currentIteration < this.config.maxIterations &&
            !this.state.abortController?.signal.aborted
        );
    }

    /**
     * 检查工具是否被允许
     */
    isToolAllowed(toolName: string): boolean {
        const { allowedTools, deniedTools } = this.config.permissions;
        
        // 检查是否在拒绝列表中
        if (deniedTools.includes(toolName) || deniedTools.includes('*')) {
            return false;
        }
        
        // 检查是否在允许列表中
        if (allowedTools.includes('*') || allowedTools.includes(toolName)) {
            return true;
        }
        
        return false;
    }

    /**
     * 获取工具状态文本（OpenCode风格）
     */
    static getToolStatusText(toolName: string): string {
        const statusMap: Record<string, string> = {
            'list_files': '正在浏览文件',
            'read_file': '正在读取文件',
            'write_file': '正在编辑文件',
            'search_in_file': '正在搜索代码',
            'grep_files': '正在搜索代码库',
            'analyze_csv': '正在分析数据',
            'get_file_info': '正在获取信息',
            'bash': '正在执行命令',
            'edit': '正在编辑文件',
            'web_search': '正在搜索网络',
            'task': '正在委派任务',
            'todowrite': '正在制定计划',
            'todoread': '正在检查计划'
        };
        return statusMap[toolName] || `正在调用 ${toolName}`;
    }
}

/**
 * Agent 管理器
 */
export class AgentManager {
    private agents: Map<string, Agent> = new Map();
    private currentAgent: Agent | null = null;

    /**
     * 获取或创建代理
     */
    getOrCreateAgent(name: string, customConfig?: Partial<AgentConfig>): Agent {
        if (this.agents.has(name)) {
            return this.agents.get(name)!;
        }

        const baseConfig = BUILTIN_AGENTS[name];
        if (!baseConfig && !customConfig) {
            throw new Error(`Unknown agent: ${name}`);
        }

        const config: AgentConfig = {
            ...baseConfig,
            ...customConfig,
            name
        } as AgentConfig;

        const agent = new Agent(config);
        this.agents.set(name, agent);
        return agent;
    }

    /**
     * 设置当前代理
     */
    setCurrentAgent(name: string): Agent {
        this.currentAgent = this.getOrCreateAgent(name);
        return this.currentAgent;
    }

    /**
     * 获取当前代理
     */
    getCurrentAgent(): Agent | null {
        return this.currentAgent;
    }

    /**
     * 列出所有可用代理
     */
    listAgents(): AgentConfig[] {
        return Object.values(BUILTIN_AGENTS);
    }

    /**
     * 停止所有代理
     */
    stopAll(): void {
        this.agents.forEach(agent => agent.stop());
    }
}

// 导出单例管理器
export const agentManager = new AgentManager();
