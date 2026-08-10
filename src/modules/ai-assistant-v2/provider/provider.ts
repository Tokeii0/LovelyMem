/**
 * Provider 模块 - AI模型提供商管理
 */

import type { ProviderConfig, StreamEvent } from '../types';

// 支持的提供商列表
export const SUPPORTED_PROVIDERS = [
    'openai',
    'anthropic', 
    'google',
    'deepseek',
    'ollama',
    'azure',
    'custom'
] as const;

export type ProviderType = typeof SUPPORTED_PROVIDERS[number];

// 提供商模型配置
export interface ModelInfo {
    id: string;
    name: string;
    provider: ProviderType;
    maxTokens: number;
    supportsStreaming: boolean;
    supportsTools: boolean;
    supportsVision: boolean;
}

// 默认模型配置
export const DEFAULT_MODELS: Record<ProviderType, ModelInfo[]> = {
    openai: [
        { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', maxTokens: 128000, supportsStreaming: true, supportsTools: true, supportsVision: true },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', maxTokens: 128000, supportsStreaming: true, supportsTools: true, supportsVision: true },
        { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openai', maxTokens: 128000, supportsStreaming: true, supportsTools: true, supportsVision: true },
    ],
    anthropic: [
        { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'anthropic', maxTokens: 200000, supportsStreaming: true, supportsTools: true, supportsVision: true },
        { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'anthropic', maxTokens: 200000, supportsStreaming: true, supportsTools: true, supportsVision: true },
        { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', provider: 'anthropic', maxTokens: 200000, supportsStreaming: true, supportsTools: true, supportsVision: true },
    ],
    google: [
        { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'google', maxTokens: 1000000, supportsStreaming: true, supportsTools: true, supportsVision: true },
        { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'google', maxTokens: 2000000, supportsStreaming: true, supportsTools: true, supportsVision: true },
    ],
    deepseek: [
        { id: 'deepseek-chat', name: 'DeepSeek Chat', provider: 'deepseek', maxTokens: 64000, supportsStreaming: true, supportsTools: true, supportsVision: false },
        { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', provider: 'deepseek', maxTokens: 64000, supportsStreaming: true, supportsTools: true, supportsVision: false },
    ],
    ollama: [
        { id: 'llama3.3', name: 'Llama 3.3', provider: 'ollama', maxTokens: 128000, supportsStreaming: true, supportsTools: true, supportsVision: false },
        { id: 'qwen2.5-coder', name: 'Qwen 2.5 Coder', provider: 'ollama', maxTokens: 32000, supportsStreaming: true, supportsTools: true, supportsVision: false },
    ],
    azure: [
        { id: 'gpt-4o', name: 'Azure GPT-4o', provider: 'azure', maxTokens: 128000, supportsStreaming: true, supportsTools: true, supportsVision: true },
    ],
    custom: []
};

/**
 * Provider 类 - 管理单个AI提供商
 */
export class Provider {
    private config: ProviderConfig;
    private modelInfo: ModelInfo | null = null;

    constructor(config: ProviderConfig) {
        this.config = config;
        this.loadModelInfo();
    }

    private loadModelInfo(): void {
        const providerModels = DEFAULT_MODELS[this.config.id as ProviderType] || [];
        this.modelInfo = providerModels.find(m => m.id === this.config.model) || null;
    }

    getConfig(): ProviderConfig {
        return this.config;
    }

    getModelInfo(): ModelInfo | null {
        return this.modelInfo;
    }

    supportsStreaming(): boolean {
        return this.modelInfo?.supportsStreaming ?? true;
    }

    supportsTools(): boolean {
        return this.modelInfo?.supportsTools ?? true;
    }

    /**
     * 构建API请求头
     */
    getHeaders(): Record<string, string> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json'
        };

        switch (this.config.id) {
            case 'openai':
            case 'deepseek':
            case 'custom':
                headers['Authorization'] = `Bearer ${this.config.apiKey}`;
                break;
            case 'anthropic':
                headers['x-api-key'] = this.config.apiKey;
                headers['anthropic-version'] = '2023-06-01';
                break;
            case 'google':
                // Google使用API密钥作为查询参数
                break;
            case 'azure':
                headers['api-key'] = this.config.apiKey;
                break;
        }

        return headers;
    }

    /**
     * 获取API端点
     */
    getEndpoint(): string {
        if (this.config.baseUrl) {
            return this.config.baseUrl;
        }

        switch (this.config.id) {
            case 'openai':
                return 'https://api.openai.com/v1';
            case 'anthropic':
                return 'https://api.anthropic.com/v1';
            case 'google':
                return 'https://generativelanguage.googleapis.com/v1beta';
            case 'deepseek':
                return 'https://api.deepseek.com/v1';
            case 'ollama':
                return 'http://localhost:11434/api';
            default:
                return this.config.baseUrl || '';
        }
    }
}

/**
 * Provider 管理器
 */
export class ProviderManager {
    private providers: Map<string, Provider> = new Map();
    private currentProvider: Provider | null = null;

    /**
     * 注册提供商
     */
    register(config: ProviderConfig): Provider {
        const provider = new Provider(config);
        this.providers.set(config.id, provider);
        return provider;
    }

    /**
     * 获取提供商
     */
    get(id: string): Provider | undefined {
        return this.providers.get(id);
    }

    /**
     * 设置当前提供商
     */
    setCurrent(id: string): Provider {
        const provider = this.providers.get(id);
        if (!provider) {
            throw new Error(`Provider not found: ${id}`);
        }
        this.currentProvider = provider;
        return provider;
    }

    /**
     * 获取当前提供商
     */
    getCurrent(): Provider | null {
        return this.currentProvider;
    }

    /**
     * 列出所有提供商
     */
    list(): Provider[] {
        return Array.from(this.providers.values());
    }

    /**
     * 获取指定提供商的可用模型
     */
    getModels(providerType: ProviderType): ModelInfo[] {
        return DEFAULT_MODELS[providerType] || [];
    }

    /**
     * 获取所有支持的提供商类型
     */
    getSupportedProviders(): readonly string[] {
        return SUPPORTED_PROVIDERS;
    }
}

// 导出单例管理器
export const providerManager = new ProviderManager();
