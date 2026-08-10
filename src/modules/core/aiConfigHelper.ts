/**
 * AI 配置工具函数
 * 统一的 AI 设置获取逻辑，所有前端消费者应使用此模块
 */

import { invoke } from "@tauri-apps/api/core";

export interface ResolvedAiConfig {
  base_url: string;
  model: string;
  api_key: string;
  custom_prompt?: string;
}

function isLocalProvider(baseUrl: string): boolean {
  const normalized = baseUrl.toLowerCase();
  return normalized.includes('localhost:11434') || normalized.includes('127.0.0.1:11434') || normalized.includes('ollama');
}

/**
 * 获取当前 AI 配置
 * 优先使用 AI Provider 系统，回退到旧版 ai_settings
 * @returns AI 配置，如果未配置则返回 null
 */
export async function getAiConfig(): Promise<ResolvedAiConfig | null> {
  try {
    // 1. 优先从 AI Provider 系统获取
    const currentProvider = await invoke('get_current_ai_provider') as any;
    if (
      currentProvider &&
      currentProvider.enabled !== false &&
      currentProvider.base_url &&
      currentProvider.model &&
      (currentProvider.api_key || isLocalProvider(currentProvider.base_url))
    ) {
      return {
        base_url: currentProvider.base_url,
        model: currentProvider.model,
        api_key: currentProvider.api_key || '',
        custom_prompt: currentProvider.custom_prompt || undefined,
      };
    }
  } catch (e) {
    console.warn('[getAiConfig] 获取当前 AI Provider 失败:', e);
  }

  try {
    // 2. 回退到旧版 ai_settings
    const settings = await invoke('load_settings_command') as any;
    if (
      settings?.ai_settings?.base_url &&
      settings?.ai_settings?.model &&
      (settings?.ai_settings?.api_key || isLocalProvider(settings.ai_settings.base_url))
    ) {
      return {
        base_url: settings.ai_settings.base_url,
        model: settings.ai_settings.model,
        api_key: settings.ai_settings.api_key || '',
        custom_prompt: settings.ai_settings.custom_prompt || undefined,
      };
    }
  } catch (e) {
    console.warn('[getAiConfig] 获取旧版 AI 设置失败:', e);
  }

  return null;
}

/**
 * 检查 AI 是否已配置
 */
export async function isAiConfigured(): Promise<boolean> {
  const config = await getAiConfig();
  return config !== null;
}
