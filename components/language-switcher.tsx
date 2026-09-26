"use client";

import { useEffect, useId, useRef, useState } from "react";
import { localeDetails, supportedLocales, type Locale } from "../i18n/messages";
import { Icon } from "./icon";
import { useLocale } from "./locale-provider";

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useLocale();
  const [isOpen, setOpen] = useState(false);
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && isOpen) {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    function closeOutside(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("mousedown", closeOutside);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("mousedown", closeOutside);
    };
  }, [isOpen]);

  function chooseLocale(nextLocale: Locale) {
    setLocale(nextLocale);
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div className="language-picker" ref={containerRef}>
      <button
        aria-controls={menuId}
        aria-expanded={isOpen}
        aria-label={`${t("a11y.changeLanguage")}: ${localeDetails[locale].nativeName}`}
        className="icon-button language-trigger"
        data-tooltip={t("a11y.changeLanguage")}
        onClick={() => setOpen((open) => !open)}
        ref={triggerRef}
        type="button"
      >
        <Icon className="interface-icon" name="globe" />
        <span aria-hidden="true" className="locale-code">
          {localeDetails[locale].shortName}
        </span>
      </button>
      {isOpen && (
        <div aria-label={t("a11y.languageMenu")} className="language-menu" id={menuId} role="group">
          {supportedLocales.map((availableLocale) => (
            <button
              aria-pressed={availableLocale === locale}
              className="language-option"
              key={availableLocale}
              onClick={() => chooseLocale(availableLocale)}
              type="button"
            >
              <span lang={availableLocale}>{localeDetails[availableLocale].nativeName}</span>
              <span aria-hidden="true" className="language-option-code">
                {localeDetails[availableLocale].shortName}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
