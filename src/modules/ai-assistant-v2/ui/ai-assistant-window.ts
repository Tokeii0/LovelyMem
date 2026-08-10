/**
 * AI 助手 独立窗口 主入口文件
 */

import { AIAssistantWindow } from './AIAssistantWindow';

document.addEventListener('DOMContentLoaded', () => {
    const aiAssistantWindow = new AIAssistantWindow();
    (window as any).aiAssistantWindow = aiAssistantWindow;

    console.log('✨ AI 助手 独立窗口已初始化');
});
