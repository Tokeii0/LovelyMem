/**
 * List Files Tool - 列出文件工具
 */

import { defineTool } from '../registry';
import type { ToolContext, ToolExecutionResult } from '../../types';

export const listFilesTool = defineTool('list_files', {
    name: 'list_files',
    description: '列出指定目录中的文件和子目录。',
    parameters: [
        {
            name: 'directory',
            type: 'string',
            description: '要列出的目录路径',
            required: true
        },
        {
            name: 'recursive',
            type: 'boolean',
            description: '是否递归列出子目录',
            required: false,
            default: false
        },
        {
            name: 'pattern',
            type: 'string',
            description: '文件名匹配模式（glob格式）',
            required: false
        }
    ],
    async execute(args: Record<string, any>, context: ToolContext): Promise<ToolExecutionResult> {
        const { directory, recursive = false, pattern } = args;
        
        context.emit({
            type: 'thinking',
            content: `正在浏览目录: ${directory}`
        });

        try {
            return {
                output: `目录列表功能将通过后端实现\n目录: ${directory}\n递归: ${recursive}\n模式: ${pattern || '无'}`,
                success: true,
                metadata: {
                    directory,
                    recursive,
                    pattern
                }
            };
        } catch (error) {
            return {
                output: `列出目录失败: ${error instanceof Error ? error.message : String(error)}`,
                success: false
            };
        }
    }
});
