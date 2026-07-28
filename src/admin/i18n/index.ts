import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import de from './locales/de.json';

export type Language = 'en' | 'de';
const LANGUAGE_STORAGE_KEY = 'lox-admin-language';
const SUPPORTED: readonly Language[] = ['en', 'de'];

/**
 * An explicit choice always wins. Without one, follow the browser's preferred
 * languages so a German user gets German on first load instead of having to find
 * the switcher. Only the base tag matters ('de-AT' → 'de').
 */
function detectBrowserLanguage(): Language | null {
  const candidates = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const tag of candidates) {
    const base = tag?.split('-')[0]?.toLowerCase();
    if (base && (SUPPORTED as readonly string[]).includes(base)) {
      return base as Language;
    }
  }
  return null;
}

function readStoredLanguage(): Language {
  if (typeof window === 'undefined') return 'en';
  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (stored && (SUPPORTED as readonly string[]).includes(stored)) {
    return stored as Language;
  }
  try {
    return detectBrowserLanguage() ?? 'en';
  } catch {
    return 'en';
  }
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    de: { translation: de },
  },
  lng: readStoredLanguage(),
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false, // React already escapes
  },
});

export function setLanguage(next: Language): void {
  void i18n.changeLanguage(next);
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
  } catch {
    // ignore storage errors
  }
  document.documentElement.lang = next;
}

document.documentElement.lang = i18n.language || 'en';

export default i18n;
