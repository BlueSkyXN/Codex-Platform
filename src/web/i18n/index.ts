import { useSyncExternalStore } from 'react';
import zhCN from './zh-CN.js';
import en from './en.js';
import type { Locale, MessageKey } from './types.js';

export type { Locale, MessageKey } from './types.js';

const DICTS: Record<Locale, Record<MessageKey, string>> = { 'zh-CN': zhCN, en };
const STORAGE_KEY = 'codex-platform-locale';
const SUPPORTED: Locale[] = ['zh-CN', 'en'];

function detectLocale(): Locale {
  if (typeof window === 'undefined') return 'zh-CN';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'zh-CN' || stored === 'en') return stored;
  const nav = window.navigator?.language?.toLowerCase() ?? 'zh-cn';
  return nav.startsWith('zh') ? 'zh-CN' : 'en';
}

let locale: Locale = detectLocale();
const listeners = new Set<() => void>();

export function getLocale(): Locale {
  return locale;
}

export function getSupportedLocales(): Locale[] {
  return [...SUPPORTED];
}

export function setLocale(next: Locale): void {
  if (!SUPPORTED.includes(next) || next === locale) return;
  locale = next;
  if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, next);
  for (const listener of listeners) listener();
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => String(vars[key] ?? `{${key}}`));
}

// Translate a key. Falls back to zh-CN, then to the raw key, so a missing
// translation degrades gracefully instead of rendering blank.
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  const template = DICTS[locale][key] ?? zhCN[key] ?? key;
  return interpolate(template, vars);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// React hook: returns a `t` bound to the current locale and re-renders on change.
export function useT(): { t: typeof t; locale: Locale } {
  const current = useSyncExternalStore(subscribe, getLocale, getLocale);
  return { t, locale: current };
}
