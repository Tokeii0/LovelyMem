import { initializeI18n } from './runtime';

export {
  getLanguage,
  initializeI18n,
  registerTranslations,
  setLanguage,
  translate,
} from './runtime';
export {
  DEFAULT_LANGUAGE,
  LANGUAGE_DOM_EVENT_NAME,
  LANGUAGE_STORAGE_KEY,
  normalizeLanguage,
  type AppLanguage,
} from './types';

initializeI18n();
