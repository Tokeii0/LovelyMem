/**
 * Image Finder 主入口文件
 * 初始化 Image Finder 窗口应用
 */

import { ImageFinderWindow } from './ImageFinderWindow';
import { hydrateIcons } from '../shared/svgIcons';
import { initMountDrive } from '../core/mountDrive';

// 等待 DOM 加载完成后初始化应用
document.addEventListener('DOMContentLoaded', async () => {
    // 先把静态 HTML 中的 data-icon 占位元素替换为 SVG 图标（独立于窗口逻辑）
    hydrateIcons(document);

    // 初始化挂载盘符缓存（须早于窗口构建/路径拼接）
    await initMountDrive();

    const imageFinderWindow = new ImageFinderWindow();

    // 将实例挂载到全局对象，供 HTML 中的事件处理器使用
    (window as unknown as { imageFinderWindow: ImageFinderWindow }).imageFinderWindow = imageFinderWindow;

    console.log('[ImageFinder] 应用已初始化');
});
