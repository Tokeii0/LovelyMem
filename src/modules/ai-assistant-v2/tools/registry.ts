/**
 * Tools Registry - 工具注册和管理
 */

import type { ToolDefinition, ToolContext, ToolExecutionResult, ToolParameter } from '../types';

/**
 * 工具注册表
 */
export class ToolRegistry {
    private tools: Map<string, ToolDefinition> = new Map();

    /**
     * 注册工具
     */
    register(tool: ToolDefinition): void {
        this.tools.set(tool.id, tool);
    }

    /**
     * 获取工具
     */
    get(id: string): ToolDefinition | undefined {
        return this.tools.get(id);
    }

    /**
     * 列出所有工具
     */
    list(): ToolDefinition[] {
        return Array.from(this.tools.values());
    }

    /**
     * 检查工具是否存在
     */
    has(id: string): boolean {
        return this.tools.has(id);
    }

    /**
     * 执行工具
     */
    async execute(id: string, args: Record<string, any>, context: ToolContext): Promise<ToolExecutionResult> {
        const tool = this.tools.get(id);
        if (!tool) {
            return {
                output: `工具 "${id}" 不存在`,
                success: false
            };
        }

        try {
            // 验证参数
            const validationError = this.validateParameters(tool.parameters, args);
            if (validationError) {
                return {
                    output: validationError,
                    success: false
                };
            }

            // 执行工具
            return await tool.execute(args, context);
        } catch (error) {
            return {
                output: `工具执行错误: ${error instanceof Error ? error.message : String(error)}`,
                success: false
            };
        }
    }

    /**
     * 验证参数
     */
    private validateParameters(params: ToolParameter[], args: Record<string, any>): string | null {
        for (const param of params) {
            if (param.required && !(param.name in args)) {
                return `缺少必需参数: ${param.name}`;
            }

            if (param.name in args) {
                const value = args[param.name];
                const expectedType = param.type;

                if (expectedType === 'string' && typeof value !== 'string') {
                    return `参数 "${param.name}" 应为字符串类型`;
                }
                if (expectedType === 'number' && typeof value !== 'number') {
                    return `参数 "${param.name}" 应为数字类型`;
                }
                if (expectedType === 'boolean' && typeof value !== 'boolean') {
                    return `参数 "${param.name}" 应为布尔类型`;
                }
                if (expectedType === 'array' && !Array.isArray(value)) {
                    return `参数 "${param.name}" 应为数组类型`;
                }
                if (expectedType === 'object' && (typeof value !== 'object' || value === null || Array.isArray(value))) {
                    return `参数 "${param.name}" 应为对象类型`;
                }
            }
        }
        return null;
    }

    /**
     * 获取工具的JSON Schema描述（用于AI调用）
     */
    getToolSchemas(): Array<{ name: string; description: string; parameters: any }> {
        return this.list().map(tool => ({
            name: tool.id,
            description: tool.description,
            parameters: {
                type: 'object',
                properties: tool.parameters.reduce((acc, param) => {
                    acc[param.name] = {
                        type: param.type,
                        description: param.description
                    };
                    return acc;
                }, {} as Record<string, any>),
                required: tool.parameters.filter(p => p.required).map(p => p.name)
            }
        }));
    }
}

/**
 * 工具定义辅助函数
 */
export function defineTool(
    id: string,
    config: {
        name: string;
        description: string;
        parameters: ToolParameter[];
        execute: (args: Record<string, any>, context: ToolContext) => Promise<ToolExecutionResult>;
    }
): ToolDefinition {
    return {
        id,
        ...config
    };
}

// 全局工具注册表
export const toolRegistry = new ToolRegistry();

// 导出工具图标映射
export const TOOL_ICONS: Record<string, string> = {
    'list_files': 'i-icon-park-outline:folder-open',
    'read_file': 'i-icon-park-outline:file-text',
    'write_file': 'i-icon-park-outline:edit',
    'search_in_file': 'i-icon-park-outline:search',
    'grep_files': 'i-icon-park-outline:findx',
    'analyze_csv': 'i-icon-park-outline:table-file',
    'get_file_info': 'i-icon-park-outline:info',
    'bash': 'i-icon-park-outline:terminal',
    'edit': 'i-icon-park-outline:code',
    'task': 'i-icon-park-outline:send',
    'todowrite': 'i-icon-park-outline:check-list',
    'todoread': 'i-icon-park-outline:view-list',
    'web_search': 'i-icon-park-outline:search',
    'webfetch': 'i-icon-park-outline:download'
};
