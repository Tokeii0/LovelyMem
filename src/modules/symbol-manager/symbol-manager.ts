/**
 * 符号表管理 主入口文件
 */

import { SymbolManagerWindow } from './SymbolManagerWindow';

document.addEventListener('DOMContentLoaded', () => {
    const symbolManagerWindow = new SymbolManagerWindow();
    (window as unknown as { symbolManagerWindow: SymbolManagerWindow }).symbolManagerWindow = symbolManagerWindow;

    console.log('📚 符号表管理 应用已初始化');
});
