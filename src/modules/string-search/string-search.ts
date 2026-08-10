/**
 * 字符串搜索 - 独立窗口入口
 *
 * 设计：直接复用内嵌版 `StringSearchPanel` 组件（模板 + 内嵌样式 + 逻辑），
 * 独立窗口仅提供「窗口标题栏（最小化/最大化/关闭）」与「主题初始化」这层外壳，
 * 面板本身的渲染与交互完全由 StringSearchPanel 负责。
 *
 * 这样可保证独立窗口与内嵌版本（modernUIRenderer 的 string-search 标签页）
 * 永远共用同一份代码，避免历史上「独立窗口与内嵌版各写一套」导致的样式/功能漂移。
 */

import { invoke } from '@tauri-apps/api/core';
import { StringSearchPanel } from './StringSearchPanel';
import { windowThemeAdapter } from '../ui/windowThemeAdapter';
import { initMountDrive } from '../core/mountDrive';

/** 绑定窗口标题栏的最小化 / 最大化 / 关闭按钮（调用后端 window_manager 命令） */
function setupWindowControls(): void {
    document.getElementById('minimizeBtn')?.addEventListener('click', () => {
        invoke('minimize_window').catch((err) => console.error('最小化窗口失败:', err));
    });

    document.getElementById('maximizeBtn')?.addEventListener('click', () => {
        invoke('toggle_maximize').catch((err) => console.error('切换最大化失败:', err));
    });

    document.getElementById('closeBtn')?.addEventListener('click', () => {
        invoke('close_window').catch((err) => console.error('关闭窗口失败:', err));
    });
}

/** 启动独立窗口：初始化主题、渲染并初始化字符串搜索面板 */
async function bootstrap(): Promise<void> {
    const app = document.getElementById('string-search-app');
    if (!app) {
        console.error('[字符串搜索] 未找到 #string-search-app 容器，无法初始化');
        return;
    }

    // 1) 窗口控制按钮
    setupWindowControls();

    // 2) 主题初始化（与其它独立窗口保持一致）
    try {
        await windowThemeAdapter.init();
        console.log(`🎨 字符串搜索窗口主题初始化完成: ${windowThemeAdapter.getCurrentTheme()}`);
    } catch (err) {
        console.warn('[字符串搜索] 主题初始化失败，使用默认主题:', err);
    }

    // 2.5) 初始化挂载盘符缓存（须早于面板构建/路径拼接）
    await initMountDrive();

    // 3) 渲染并初始化面板（复用内嵌版组件，模板根节点 id=string-search-panel-root）
    const panel = new StringSearchPanel();
    app.insertAdjacentHTML('beforeend', panel.render());

    const container = app.querySelector<HTMLElement>('#string-search-panel-root');
    if (!container) {
        console.error('[字符串搜索] 面板渲染失败：未找到 .ss-container 根节点');
        return;
    }

    try {
        await panel.initialize(container);
    } catch (err) {
        console.error('[字符串搜索] 面板初始化失败:', err);
    }

    // 暴露到 window，便于调试
    (window as unknown as { stringSearchPanel?: StringSearchPanel }).stringSearchPanel = panel;
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => void bootstrap());
} else {
    void bootstrap();
}
