/**
 * 应用版本号管理
 * 唯一数据源：tauri.conf.json 中的 version 字段
 * 前端通过 @tauri-apps/api/app 的 getVersion() 读取
 */

import { getVersion } from '@tauri-apps/api/app';

let cachedVersion: string | null = null;

/**
 * 获取当前应用版本号（带 v 前缀，如 "v2.2.0"）
 * 首次调用从 Tauri API 读取，后续使用缓存
 */
export async function getAppVersion(): Promise<string> {
  if (cachedVersion) return cachedVersion;
  try {
    const ver = await getVersion();
    cachedVersion = `v${ver}`;
  } catch {
    cachedVersion = 'v2.2.1';
  }
  return cachedVersion;
}

/**
 * 获取当前应用版本号（不带 v 前缀，如 "2.2.0"）
 */
export async function getAppVersionRaw(): Promise<string> {
  const ver = await getAppVersion();
  return ver.startsWith('v') ? ver.slice(1) : ver;
}

/**
 * 将版本号注入页面中所有 .app-version-text 元素
 * 可在任意时机调用，适用于主界面和启动画面等场景
 */
export async function injectAppVersion(): Promise<void> {
  const ver = await getAppVersion();
  document.querySelectorAll('.app-version-text').forEach(el => {
    el.textContent = ver;
  });
}
