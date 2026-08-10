import { commonTranslations, safePrefixTranslations } from './dictionaries/common';
import { backendTranslations } from './dictionaries/backend';
import { featureTranslations } from './dictionaries/features';
import { uiTranslations } from './dictionaries/ui';
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_DOM_EVENT_NAME,
  LANGUAGE_EVENT_NAME,
  LANGUAGE_STORAGE_KEY,
  normalizeLanguage,
  type AppLanguage,
} from './types';

type TranslationDictionary = Record<string, string>;

interface RenderState {
  source: string;
  rendered: string;
}

interface SetLanguageOptions {
  persist?: boolean;
  broadcast?: boolean;
}

const HAN_TEXT = /[\u3400-\u9fff]/u;
const SAFE_PREFIXES = Object.keys(safePrefixTranslations)
  .sort((left, right) => right.length - left.length);
const TRANSLATABLE_ATTRIBUTES = ['placeholder', 'title', 'aria-label', 'alt'] as const;
const DATA_SKIP_SELECTOR = [
  '[data-i18n-ignore]',
  '.monaco-editor',
  '.xterm',
  '.terminal',
  '.terminal-output',
  '.command-output',
  '.hex-editor',
  '.hex-viewer-content',
  '.file-content',
  '.csv-table tbody',
  '.embedded-csv-table tbody',
  '.preview-csv-table tbody',
  '.data-table tbody',
  '.results-table tbody',
  '.rf-grid tbody',
  '.sv-grid tbody',
  '.event-table tbody',
  '.exif-table tbody',
  '.ss-result-value',
  '.ss-string-content',
].join(',');
const TEXT_SKIP_SELECTOR = [
  'script',
  'style',
  'code',
  'pre',
  'textarea',
  '[contenteditable="true"]',
  DATA_SKIP_SELECTOR,
].join(',');

let dictionary: TranslationDictionary = {
  ...backendTranslations,
  ...featureTranslations,
  ...uiTranslations,
  ...commonTranslations,
};
let currentLanguage = readStoredLanguage();
let initialized = false;
let observer: MutationObserver | null = null;
let nativeDialogsWrapped = false;
let nativeTitleUpdateQueued = false;
let nativeWindowTitleState: RenderState | null = null;

const textStates = new WeakMap<Text, RenderState>();
const attributeStates = new WeakMap<Element, Map<string, RenderState>>();

function readStoredLanguage(): AppLanguage {
  try {
    return normalizeLanguage(localStorage.getItem(LANGUAGE_STORAGE_KEY));
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

function isTauriRuntime(): boolean {
  return Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
}

function preserveOuterWhitespace(source: string, translatedCore: string): string {
  const leading = source.match(/^\s*/u)?.[0] ?? '';
  const trailing = source.match(/\s*$/u)?.[0] ?? '';
  return `${leading}${translatedCore}${trailing}`;
}

function translateDynamicText(source: string): string | null {
  const patterns: Array<[RegExp, (...matches: string[]) => string]> = [
    [/^(\d+)\s*项待检查$/u, (count) => `${count} item${count === '1' ? '' : 's'} to check`],
    [/^共\s*(\d+)\s*项$/u, (count) => `${count} item${count === '1' ? '' : 's'} total`],
    [/^已选择\s*(\d+)\s*项$/u, (count) => `${count} item${count === '1' ? '' : 's'} selected`],
    [/^找到\s*(\d+)\s*个结果$/u, (count) => `${count} result${count === '1' ? '' : 's'} found`],
    [/^第\s*(\d+)\s*页[，,]\s*共\s*(\d+)\s*页$/u, (page, total) => `Page ${page} of ${total}`],
    [/^第\s*(\d+)\s*页$/u, (page) => `Page ${page}`],
    [/^共\s*(\d+)\s*页$/u, (total) => `${total} page${total === '1' ? '' : 's'} total`],
  ];

  for (const [pattern, render] of patterns) {
    const match = source.match(pattern);
    if (match) return render(...match.slice(1));
  }

  const safePrefix = SAFE_PREFIXES.find((prefix) => source.startsWith(prefix));
  if (safePrefix) {
    return `${safePrefixTranslations[safePrefix]}${source.slice(safePrefix.length).trimStart()}`;
  }

  return null;
}

function translateToEnglish(source: string): string {
  if (!source || !HAN_TEXT.test(source)) return source;

  const core = source.trim();
  if (!core) return source;

  const exact = dictionary[core];
  if (exact) return preserveOuterWhitespace(source, exact);

  const dynamic = translateDynamicText(core);
  if (dynamic) return preserveOuterWhitespace(source, dynamic);

  return source;
}

export function translate(source: string, language: AppLanguage = currentLanguage): string {
  return language === 'en-US' ? translateToEnglish(source) : source;
}

function shouldSkipText(element: Element | null): boolean {
  if (element?.closest('button,[role="button"]') && !element.closest('[data-i18n-ignore]')) {
    return false;
  }
  return Boolean(element?.closest(TEXT_SKIP_SELECTOR));
}

function shouldSkipAttribute(element: Element): boolean {
  if (element.closest('button,[role="button"]') && !element.closest('[data-i18n-ignore]')) {
    return false;
  }
  return Boolean(element.closest(DATA_SKIP_SELECTOR));
}

function setTextData(node: Text, value: string): void {
  if (node.data !== value) node.data = value;
}

function renderTextNode(node: Text): void {
  if (shouldSkipText(node.parentElement)) return;

  const previous = textStates.get(node);
  if (currentLanguage === 'zh-CN') {
    if (previous && node.data === previous.rendered) setTextData(node, previous.source);
    textStates.delete(node);
    return;
  }

  const source = previous && node.data === previous.rendered ? previous.source : node.data;
  const rendered = translateToEnglish(source);

  if (rendered === source) {
    textStates.delete(node);
    return;
  }

  textStates.set(node, { source, rendered });
  setTextData(node, rendered);
}

function renderAttribute(element: Element, attribute: string): void {
  if (shouldSkipAttribute(element) || !element.hasAttribute(attribute)) return;

  const states = attributeStates.get(element) ?? new Map<string, RenderState>();
  const previous = states.get(attribute);
  const current = element.getAttribute(attribute) ?? '';

  if (currentLanguage === 'zh-CN') {
    if (previous && current === previous.rendered) element.setAttribute(attribute, previous.source);
    states.delete(attribute);
    if (states.size === 0) attributeStates.delete(element);
    return;
  }

  const source = previous && current === previous.rendered ? previous.source : current;
  const rendered = translateToEnglish(source);

  if (rendered === source) {
    states.delete(attribute);
    if (states.size === 0) attributeStates.delete(element);
    return;
  }

  states.set(attribute, { source, rendered });
  attributeStates.set(element, states);
  if (current !== rendered) element.setAttribute(attribute, rendered);
}

function renderButtonValue(element: Element): void {
  if (!(element instanceof HTMLInputElement)) return;
  if (!['button', 'submit', 'reset'].includes(element.type)) return;
  renderAttribute(element, 'value');
}

function renderElement(element: Element): void {
  for (const attribute of TRANSLATABLE_ATTRIBUTES) renderAttribute(element, attribute);
  renderButtonValue(element);
}

function renderSubtree(root: Node): void {
  if (root instanceof Text) {
    renderTextNode(root);
    return;
  }

  if (root instanceof Element) renderElement(root);

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (node instanceof Text) renderTextNode(node);
    else if (node instanceof Element) renderElement(node);
    node = walker.nextNode();
  }
}

function applyLanguageToDocument(): void {
  document.documentElement.lang = currentLanguage;
  renderSubtree(document.documentElement);
  queueNativeWindowTitleUpdate();
}

function queueNativeWindowTitleUpdate(): void {
  if (!isTauriRuntime() || nativeTitleUpdateQueued) return;
  nativeTitleUpdateQueued = true;

  requestAnimationFrame(() => {
    nativeTitleUpdateQueued = false;
    void import('@tauri-apps/api/window')
      .then(async ({ getCurrentWindow }) => {
        const currentWindow = getCurrentWindow();
        const currentTitle = await currentWindow.title();
        const source = nativeWindowTitleState && currentTitle === nativeWindowTitleState.rendered
          ? nativeWindowTitleState.source
          : (currentTitle || document.title);
        const rendered = translate(source);
        nativeWindowTitleState = { source, rendered };
        if (currentTitle !== rendered) await currentWindow.setTitle(rendered);
      })
      .catch((error) => console.warn('[i18n] Failed to update the window title:', error));
  });
}

function startObserver(): void {
  if (observer) return;

  observer = new MutationObserver((mutations) => {
    let titleChanged = false;
    for (const mutation of mutations) {
      if (mutation.type === 'characterData' && mutation.target instanceof Text) {
        renderTextNode(mutation.target);
        titleChanged ||= mutation.target.parentElement instanceof HTMLTitleElement;
        continue;
      }

      if (mutation.type === 'attributes' && mutation.target instanceof Element && mutation.attributeName) {
        if (mutation.attributeName === 'value') renderButtonValue(mutation.target);
        else renderAttribute(mutation.target, mutation.attributeName);
        continue;
      }

      for (const addedNode of mutation.addedNodes) {
        renderSubtree(addedNode);
        titleChanged ||= addedNode instanceof HTMLTitleElement
          || (addedNode instanceof Element && Boolean(addedNode.querySelector('title')));
      }
    }
    if (titleChanged) queueNativeWindowTitleUpdate();
  });

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: [...TRANSLATABLE_ATTRIBUTES, 'value'],
    characterData: true,
    childList: true,
    subtree: true,
  });
}

function wrapNativeDialogs(): void {
  if (nativeDialogsWrapped) return;
  nativeDialogsWrapped = true;

  const nativeAlert = window.alert.bind(window);
  const nativeConfirm = window.confirm.bind(window);
  const nativePrompt = window.prompt.bind(window);

  window.alert = (message?: unknown): void => nativeAlert(translate(String(message ?? '')));
  window.confirm = (message?: string): boolean => nativeConfirm(translate(String(message ?? '')));
  window.prompt = (message?: string, defaultValue?: string): string | null => (
    nativePrompt(translate(String(message ?? '')), defaultValue)
  );
}

async function broadcastLanguage(language: AppLanguage): Promise<void> {
  if (!isTauriRuntime()) return;

  try {
    const { emit } = await import('@tauri-apps/api/event');
    await emit(LANGUAGE_EVENT_NAME, language);
  } catch (error) {
    console.warn('[i18n] Failed to broadcast language change:', error);
  }
}

async function listenForLanguageChanges(): Promise<void> {
  if (!isTauriRuntime()) return;

  try {
    const { listen } = await import('@tauri-apps/api/event');
    await listen<string>(LANGUAGE_EVENT_NAME, (event) => {
      void setLanguage(event.payload, { persist: true, broadcast: false });
    });
  } catch (error) {
    console.warn('[i18n] Failed to listen for language changes:', error);
  }
}

async function syncLanguageFromSettings(): Promise<void> {
  if (!isTauriRuntime()) return;

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const settings = await invoke<{ language?: string }>('load_settings_command');
    if (settings.language) {
      await setLanguage(settings.language, { persist: true, broadcast: false });
    }
  } catch (error) {
    console.warn('[i18n] Failed to load the saved language:', error);
  }
}

export function getLanguage(): AppLanguage {
  return currentLanguage;
}

export async function setLanguage(
  value: unknown,
  options: SetLanguageOptions = {},
): Promise<void> {
  const nextLanguage = normalizeLanguage(value);
  const { persist = true, broadcast = true } = options;
  const changed = nextLanguage !== currentLanguage;
  currentLanguage = nextLanguage;

  if (persist) {
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, currentLanguage);
    } catch {
      // Some embedded or private browsing contexts can reject localStorage writes.
    }
  }

  if (!changed) return;

  applyLanguageToDocument();
  window.dispatchEvent(new CustomEvent(LANGUAGE_DOM_EVENT_NAME, { detail: currentLanguage }));
  if (broadcast) await broadcastLanguage(currentLanguage);
}

export function registerTranslations(translations: TranslationDictionary): void {
  dictionary = { ...dictionary, ...translations };
  applyLanguageToDocument();
}

export function initializeI18n(): void {
  if (initialized) return;
  initialized = true;

  wrapNativeDialogs();
  applyLanguageToDocument();
  startObserver();

  window.addEventListener('storage', (event) => {
    if (event.key !== LANGUAGE_STORAGE_KEY || !event.newValue) return;
    void setLanguage(event.newValue, { persist: false, broadcast: false });
  });

  void listenForLanguageChanges();
  void syncLanguageFromSettings();
}
