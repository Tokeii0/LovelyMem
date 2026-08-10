/**
 * Read File Tool - 读取文件工具
 */

import { defineTool } from '../registry';
import type { ToolContext, ToolExecutionResult } from '../../types';

export const readFileTool = defineTool('read_file', {
    name: 'read_file',
    description: '读取指定文件的内容。支持文本文件，可指定起始行和读取行数。',
    parameters: [
        {
            name: 'filePath',
            type: 'string',
            description: '要读取的文件路径',
            required: true
        },
        {
            name: 'offset',
            type: 'number',
            description: '起始行号（从0开始）',
            required: false,
            default: 0
        },
        {
            name: 'limit',
            type: 'number',
            description: '读取的行数（默认2000）',
            required: false,
            default: 2000
        }
    ],
    async execute(args: Record<string, any>, context: ToolContext): Promise<ToolExecutionResult> {
        const { filePath, offset = 0, limit = 2000 } = args;
        
        context.emit({
            type: 'thinking',
            content: `正在读取文件: ${filePath}`
        });

        try {
            // 这里会调用后端的Tauri命令
            // 实际实现将通过invoke调用Rust后端
            return {
                output: `文件读取功能将通过后端实现\n路径: ${filePath}\n偏移: ${offset}\n限制: ${limit}`,
                success: true,
                metadata: {
                    filePath,
                    offset,
                    limit
                }
            };
        } catch (error) {
            return {
                output: `读取文件失败: ${error instanceof Error ? error.message : String(error)}`,
                success: false
            };
        }
    }
});
