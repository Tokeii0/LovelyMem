/**
 * 设置加载工具函数 — 提供类型安全的 invoke 包装
 */
import { invoke } from '@tauri-apps/api/core';
import type { AppSettings } from '../core/types';

/**
 * 从后端加载应用设置（带类型标注）
 */
export async function loadAppSettings(): Promise<AppSettings> {
  return invoke<AppSettings>('load_settings_command');
}

/**
 * 保存应用设置到后端
 */
export async function saveAppSettings(settings: AppSettings): Promise<void> {
  return invoke<void>('save_settings_command', { settings });
}
