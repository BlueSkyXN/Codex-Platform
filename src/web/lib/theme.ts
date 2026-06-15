// Theme handling: auto | light | dark, persisted to localStorage.
// "auto" follows the OS via the prefers-color-scheme media query; light/dark
// pin an explicit [data-theme] on <html> so the choice wins over the OS.

export type ThemePreference = 'auto' | 'light' | 'dark';

const STORAGE_KEY = 'codex-platform-theme';

export function getThemePreference(): ThemePreference {
  const stored = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
  return stored === 'light' || stored === 'dark' || stored === 'auto' ? stored : 'auto';
}

export function applyTheme(preference: ThemePreference): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (preference === 'auto') {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = preference;
  }
}

export function setThemePreference(preference: ThemePreference): void {
  if (typeof window !== 'undefined') {
    if (preference === 'auto') window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, preference);
  }
  applyTheme(preference);
}

// Apply the stored preference as early as possible to avoid a theme flash.
export function bootstrapTheme(): void {
  applyTheme(getThemePreference());
}
