/**
 * 内存图像可视化 - 独立窗口入口
 *
 * 外壳层：窗口标题栏（最小化/最大化/关闭）+ 主题初始化；
 * 业务由 MemoryImageVisualizer 负责。初始参数（文件路径/尺寸）由后端
 * `mem-img-init-{label}` 事件下发（emit-after-load）。
 */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { windowThemeAdapter } from '../ui/windowThemeAdapter';
import { MemoryImageVisualizer } from './MemoryImageVisualizer';
import type { InitPayload } from './types';

function setupWindowControls(): void {
  document.getElementById('minimizeBtn')?.addEventListener('click', () => {
    invoke('minimize_window').catch((e) => console.error('最小化失败:', e));
  });
  document.getElementById('maximizeBtn')?.addEventListener('click', () => {
    invoke('toggle_maximize').catch((e) => console.error('切换最大化失败:', e));
  });
  document.getElementById('closeBtn')?.addEventListener('click', () => {
    invoke('close_window').catch((e) => console.error('关闭窗口失败:', e));
  });
}

async function bootstrap(): Promise<void> {
  const app = document.getElementById('mem-img-app');
  if (!app) {
    console.error('[内存图像可视化] 未找到 #mem-img-app 容器');
    return;
  }

  setupWindowControls();

  try {
    await windowThemeAdapter.init();
  } catch (e) {
    console.warn('[内存图像可视化] 主题初始化失败，使用默认主题:', e);
  }

  const viz = new MemoryImageVisualizer(app);
  viz.render();

  // 接收初始参数（窗口作用域事件）
  try {
    const label = getCurrentWebviewWindow().label;
    await listen<InitPayload>(`mem-img-init-${label}`, (e) => {
      const p = e.payload || {};
      if (p.filePath) {
        void viz.loadFile(p.filePath, p.width ?? undefined, p.height ?? undefined);
      }
    });
  } catch (e) {
    console.warn('[内存图像可视化] 初始参数监听失败:', e);
  }

  window.addEventListener('beforeunload', () => viz.cleanup());
  (window as unknown as { memViz?: MemoryImageVisualizer }).memViz = viz;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void bootstrap());
} else {
  void bootstrap();
}
