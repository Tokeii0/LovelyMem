/**
 * MemProcFS 挂载盘符 — 前端同步可用性 helper
 *
 * 设置是异步加载的（loadAppSettings），但很多调用点是同步的（类字段初始化、
 * 构造函数、模板字符串）。本模块在窗口 bootstrap 期 await initMountDrive() 把盘符
 * 读入模块级缓存，之后所有同步 getter 即可直接返回当前盘符。
 *
 * 铁律：绝不要在模块顶层 const 或类字段初始化里读取这些 getter；只在 async
 * init()/initialize()/render()/事件处理器里读 —— 它们都在 initMountDrive() resolve 之后运行。
 */
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { AppSettings } from './types';

const FALLBACK = 'M';
let cachedLetter = FALLBACK;
let initialized = false;
let initPromise: Promise<void> | null = null;

/** 无害化为单个大写字母（A–Z），非法时回退 'M' */
function sanitize(raw: unknown): string {
  if (typeof raw !== 'string') return FALLBACK;
  const c = raw.trim().charAt(0).toUpperCase();
  return c >= 'A' && c <= 'Z' ? c : FALLBACK;
}

/**
 * bootstrap 期初始化。幂等、并发去重、内部 try/catch 不抛 —— 可在每个窗口入口安全 await。
 */
export async function initMountDrive(): Promise<void> {
  if (initialized) return;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      const s = await invoke<AppSettings>('load_settings_command');
      cachedLetter = sanitize(s?.mount_drive_letter);
    } catch {
      cachedLetter = FALLBACK;
    }
    // 设置保存时实时刷新（manager.ts saveSettings 会 emit 'settings-updated'）
    try {
      await listen<AppSettings>('settings-updated', (e) => {
        cachedLetter = sanitize(e.payload?.mount_drive_letter);
      });
    } catch {
      /* 事件接线可选，失败不影响 */
    }
    initialized = true;
  })();
  return initPromise;
}

/** 当前挂载盘符字母，例如 "M" */
export function getMountLetter(): string {
  return cachedLetter;
}

/** 挂载根（反斜杠风格），例如 "M:\\" */
export function getMountRoot(): string {
  return `${cachedLetter}:\\`;
}

/** 挂载根（正斜杠风格），例如 "M:/" */
export function getMountRootSlash(): string {
  return `${cachedLetter}:/`;
}

/** 反斜杠路径拼接：mountPath('forensic','ntfs','0') -> "M:\\forensic\\ntfs\\0" */
export function mountPath(...segments: string[]): string {
  return `${cachedLetter}:\\` + segments.join('\\');
}

/** 正斜杠路径拼接：mountPathFwd('registry','HKLM') -> "M:/registry/HKLM" */
export function mountPathFwd(...segments: string[]): string {
  return `${cachedLetter}:/` + segments.join('/');
}
