"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  defaultLocale,
  isLocale,
  localeDetails,
  localeStorageKey,
  resolveLocale,
  translate,
  type Locale,
  type MessageKey,
} from "../i18n/messages";

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);
const localeChangeEvent = "dig4el:locale-change";

function readSavedLocale(): Locale {
  try {
    const savedLocale = window.localStorage.getItem(localeStorageKey);
    if (isLocale(savedLocale)) return savedLocale;
  } catch {
    // A restrictive browser setting should not prevent the interface loading.
  }

  return resolveLocale(window.navigator.languages);
}

function subscribeToLocalePreference(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(localeChangeEvent, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(localeChangeEvent, onStoreChange);
  };
}

function serverLocaleSnapshot(): Locale {
  return defaultLocale;
}

export function LocaleProvider({ children }: Readonly<{ children: ReactNode }>) {
  const storedLocale = useSyncExternalStore(
    subscribeToLocalePreference,
    readSavedLocale,
    serverLocaleSnapshot,
  );
  const [unpersistedLocale, setUnpersistedLocale] = useState<Locale | null>(null);
  const locale = unpersistedLocale ?? storedLocale;

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = localeDetails[locale].direction;
  }, [locale]);

  const setLocale = useCallback((nextLocale: Locale) => {
    try {
      window.localStorage.setItem(localeStorageKey, nextLocale);
      setUnpersistedLocale(null);
      window.dispatchEvent(new Event(localeChangeEvent));
    } catch {
      // The selected locale remains active for this visit if storage is blocked.
      setUnpersistedLocale(nextLocale);
    }
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key) => translate(locale, key),
    }),
    [locale, setLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("useLocale must be used within LocaleProvider.");
  }
  return context;
}
