/**
 * Bash Tool - 命令执行工具
 */

import { defineTool } from '../registry';
import type { ToolContext, ToolExecutionResult } from '../../types';

export const bashTool = defineTool('bash', {
    name: 'bash',
    description: '执行shell命令。可以运行系统命令、脚本等。危险操作需要用户确认。',
    parameters: [
        {
            name: 'command',
            type: 'string',
            description: '要执行的命令',
            required: true
        },
        {
            name: 'workdir',
            type: 'string',
            description: '工作目录',
            required: false
        },
        {
            name: 'timeout',
            type: 'number',
            description: '超时时间（毫秒）',
            required: false,
            default: 120000
        },
        {
            name: 'description',
            type: 'string',
            description: '命令描述（5-10个字）',
            required: true
        }
    ],
    async execute(args: Record<string, any>, context: ToolContext): Promise<ToolExecutionResult> {
        const { command, workdir, timeout = 120000, description } = args;
        
        context.emit({
            type: 'thinking',
            content: `正在执行命令: ${description}`
        });

        try {
            // 检查是否被中止
            if (context.abort.aborted) {
                return {
                    output: '命令被用户中止',
                    success: false
                };
            }

            return {
                output: `命令执行功能将通过后端实现\n命令: ${command}\n工作目录: ${workdir || '当前目录'}\n超时: ${timeout}ms\n描述: ${description}`,
                success: true,
                metadata: {
                    command,
                    workdir,
                    timeout,
                    description
                }
            };
        } catch (error) {
            return {
                output: `命令执行失败: ${error instanceof Error ? error.message : String(error)}`,
                success: false
            };
        }
    }
});
