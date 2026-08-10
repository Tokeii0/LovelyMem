/**
 * Search Tools - 搜索相关工具
 */

import { defineTool } from '../registry';
import type { ToolContext, ToolExecutionResult } from '../../types';

export const searchInFileTool = defineTool('search_in_file', {
    name: 'search_in_file',
    description: '在指定文件中搜索文本或正则表达式。',
    parameters: [
        {
            name: 'filePath',
            type: 'string',
            description: '要搜索的文件路径',
            required: true
        },
        {
            name: 'query',
            type: 'string',
            description: '搜索内容（支持正则表达式）',
            required: true
        },
        {
            name: 'caseSensitive',
            type: 'boolean',
            description: '是否区分大小写',
            required: false,
            default: false
        }
    ],
    async execute(args: Record<string, any>, context: ToolContext): Promise<ToolExecutionResult> {
        const { filePath, query, caseSensitive = false } = args;
        
        context.emit({
            type: 'thinking',
            content: `正在搜索: ${query} in ${filePath}`
        });

        try {
            return {
                output: `文件搜索功能将通过后端实现\n文件: ${filePath}\n查询: ${query}\n区分大小写: ${caseSensitive}`,
                success: true,
                metadata: { filePath, query, caseSensitive }
            };
        } catch (error) {
            return {
                output: `搜索失败: ${error instanceof Error ? error.message : String(error)}`,
                success: false
            };
        }
    }
});

export const grepFilesTool = defineTool('grep_files', {
    name: 'grep_files',
    description: '在多个文件中搜索文本，支持glob模式匹配文件。',
    parameters: [
        {
            name: 'directory',
            type: 'string',
            description: '搜索的目录',
            required: true
        },
        {
            name: 'query',
            type: 'string',
            description: '搜索内容',
            required: true
        },
        {
            name: 'pattern',
            type: 'string',
            description: '文件匹配模式（如 *.ts）',
            required: false,
            default: '*'
        },
        {
            name: 'maxResults',
            type: 'number',
            description: '最大结果数',
            required: false,
            default: 100
        }
    ],
    async execute(args: Record<string, any>, context: ToolContext): Promise<ToolExecutionResult> {
        const { directory, query, pattern = '*', maxResults = 100 } = args;
        
        context.emit({
            type: 'thinking',
            content: `正在搜索代码库: ${query}`
        });

        try {
            return {
                output: `代码库搜索功能将通过后端实现\n目录: ${directory}\n查询: ${query}\n模式: ${pattern}\n最大结果: ${maxResults}`,
                success: true,
                metadata: { directory, query, pattern, maxResults }
            };
        } catch (error) {
            return {
                output: `搜索失败: ${error instanceof Error ? error.message : String(error)}`,
                success: false
            };
        }
    }
});
