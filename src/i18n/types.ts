export const DEFAULT_LANGUAGE = 'zh-CN' as const;

export const SUPPORTED_LANGUAGES = ['zh-CN', 'en-US'] as const;

export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_STORAGE_KEY = 'lovelymem.language';
export const LANGUAGE_EVENT_NAME = 'app-language-changed';
export const LANGUAGE_DOM_EVENT_NAME = 'lovelymem:language-changed';

export function normalizeLanguage(value: unknown): AppLanguage {
  if (typeof value !== 'string') return DEFAULT_LANGUAGE;

  const normalized = value.trim().toLowerCase();
  return normalized === 'en' || normalized === 'en-us' ? 'en-US' : DEFAULT_LANGUAGE;
}
