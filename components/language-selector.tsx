"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type { LanguageOption } from "../lib/languages";
import { Icon } from "./icon";
import { useLocale } from "./locale-provider";

export type NewLanguageInput = {
  name: string;
  regionOrCountry: string;
};

export type LanguageSelectorProps = Readonly<{
  /** Show the adjacent add button and dialog only where creation is allowed. */
  allowCreate?: boolean;
  disabled?: boolean;
  hint?: string;
  label: string;
  loadLanguages: (query: string) => Promise<LanguageOption[]>;
  onChange: (language: LanguageOption | null) => void;
  onCreateLanguage?: (language: NewLanguageInput) => Promise<LanguageOption>;
  placeholder?: string;
  value: LanguageOption | null;
}>;

/**
 * A reusable, async combobox for the shared language catalogue. It does not
 * assume where the catalogue lives: callers provide search and (optionally)
 * creation functions appropriate to their authorization boundary.
 */
export function LanguageSelector({
  allowCreate = false,
  disabled = false,
  hint,
  label,
  loadLanguages,
  onChange,
  onCreateLanguage,
  placeholder,
  value,
}: LanguageSelectorProps) {
  const { t } = useLocale();
  const inputId = useId();
  const listboxId = useId();
  const hintId = useId();
  const dialogTitleId = useId();
  const dialogDescriptionId = useId();
  const [query, setQuery] = useState(value?.name ?? "");
  const [matches, setMatches] = useState<LanguageOption[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isOpen, setOpen] = useState(false);
  const [isSearching, setSearching] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [isCreateDialogOpen, setCreateDialogOpen] = useState(false);
  const [newLanguageName, setNewLanguageName] = useState("");
  const [regionOrCountry, setRegionOrCountry] = useState("");
  const [createError, setCreateError] = useState<"request" | "required" | null>(null);
  const [isCreating, setCreating] = useState(false);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const newLanguageNameRef = useRef<HTMLInputElement>(null);
  const requestSequence = useRef(0);
  const clearingSelection = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (value) setQuery(value.name);
      if (!value && !clearingSelection.current) setQuery("");
      clearingSelection.current = false;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [value]);

  useEffect(() => {
    function closeOutside(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", closeOutside);
    return () => document.removeEventListener("mousedown", closeOutside);
  }, []);

  useEffect(() => {
    if (!isCreateDialogOpen) return undefined;
    const timer = window.setTimeout(() => newLanguageNameRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [isCreateDialogOpen]);

  useEffect(() => {
    if (!isCreateDialogOpen) return undefined;
    function handleDialogKeyDown(event: KeyboardEvent) {
      if (!dialogRef.current?.contains(event.target as Node)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (isCreating) return;
        setCreateDialogOpen(false);
        setCreateError(null);
        setNewLanguageName("");
        setRegionOrCountry("");
        window.setTimeout(() => addButtonRef.current?.focus(), 0);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleDialogKeyDown);
    return () => document.removeEventListener("keydown", handleDialogKeyDown);
  }, [isCreateDialogOpen, isCreating]);

  async function lookUpLanguages(nextQuery: string) {
    const sequence = ++requestSequence.current;
    if (!nextQuery.trim()) {
      setMatches([]);
      setActiveIndex(-1);
      setOpen(false);
      setSearching(false);
      setSearchFailed(false);
      return;
    }
    setOpen(true);
    setMatches([]);
    setActiveIndex(-1);
    setSearching(true);
    setSearchFailed(false);
    try {
      const nextMatches = await loadLanguages(nextQuery);
      if (sequence !== requestSequence.current) return;
      setMatches(nextMatches);
      setActiveIndex(nextMatches.length > 0 ? 0 : -1);
    } catch {
      if (sequence !== requestSequence.current) return;
      setMatches([]);
      setActiveIndex(-1);
      setSearchFailed(true);
    } finally {
      if (sequence === requestSequence.current) setSearching(false);
    }
  }

  function selectLanguage(language: LanguageOption) {
    requestSequence.current += 1;
    setQuery(language.name);
    setMatches([]);
    setActiveIndex(-1);
    setOpen(false);
    setSearchFailed(false);
    onChange(language);
    inputRef.current?.focus();
  }

  function changeQuery(nextQuery: string) {
    setQuery(nextQuery);
    if (value) {
      clearingSelection.current = true;
      onChange(null);
    }
    void lookUpLanguages(nextQuery);
  }

  function handleInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!isOpen) {
        void lookUpLanguages(query);
      } else if (matches.length > 0) {
        setActiveIndex((current) => Math.min(current + 1, matches.length - 1));
      }
      return;
    }
    if (event.key === "ArrowUp" && isOpen && matches.length > 0) {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === "Enter" && isOpen && activeIndex >= 0 && matches[activeIndex]) {
      event.preventDefault();
      selectLanguage(matches[activeIndex]);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  }

  function openCreateDialog() {
    setOpen(false);
    setCreateError(null);
    setCreateDialogOpen(true);
  }

  function closeCreateDialog(returnFocus = true) {
    if (isCreating) return;
    setCreateDialogOpen(false);
    setCreateError(null);
    setNewLanguageName("");
    setRegionOrCountry("");
    if (returnFocus) {
      window.setTimeout(() => addButtonRef.current?.focus(), 0);
    }
  }

  async function createLanguage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!onCreateLanguage || isCreating) return;
    const name = newLanguageName.trim();
    const origin = regionOrCountry.trim();
    if (!name || !origin) {
      setCreateError("required");
      return;
    }
    setCreateError(null);
    setCreating(true);
    try {
      const language = await onCreateLanguage({ name, regionOrCountry: origin });
      selectLanguage(language);
      setCreateDialogOpen(false);
      setNewLanguageName("");
      setRegionOrCountry("");
      window.setTimeout(() => addButtonRef.current?.focus(), 0);
    } catch {
      setCreateError("request");
    } finally {
      setCreating(false);
    }
  }

  const activeOptionId = activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined;
  const canCreate = allowCreate && Boolean(onCreateLanguage);

  return (
    <div className="language-selector" ref={containerRef}>
      <label className="language-selector-label" htmlFor={inputId}>{label}</label>
      <div className="language-selector-control">
        <input
          aria-activedescendant={isOpen ? activeOptionId : undefined}
          aria-autocomplete="list"
          aria-controls={isOpen ? listboxId : undefined}
          aria-describedby={hint ? hintId : undefined}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-required="true"
          autoComplete="off"
          disabled={disabled}
          id={inputId}
          onChange={(event) => changeQuery(event.target.value)}
          onFocus={() => {
            if (query.trim()) void lookUpLanguages(query);
          }}
          onBlur={() => {
            window.setTimeout(() => {
              if (!containerRef.current?.contains(document.activeElement)) setOpen(false);
            }, 0);
          }}
          onKeyDown={handleInputKeyDown}
          placeholder={placeholder}
          ref={inputRef}
          role="combobox"
          spellCheck={false}
          type="text"
          value={query}
        />
        {canCreate && (
          <button
            aria-label={t("languageSelector.add")}
            className="language-selector-add"
            data-tooltip={t("languageSelector.add")}
            disabled={disabled}
            onClick={openCreateDialog}
            ref={addButtonRef}
            type="button"
          >
            <Icon className="interface-icon" name="plus" />
          </button>
        )}
      </div>
      {hint && <small className="language-selector-hint" id={hintId}>{hint}</small>}

      {isOpen && (
        <div
          aria-busy={isSearching}
          aria-label={t("languageSelector.results")}
          className="language-selector-results"
          id={listboxId}
          role="listbox"
        >
          {isSearching && <p className="language-selector-status" role="status">{t("languageSelector.searching")}</p>}
          {!isSearching && searchFailed && <p className="language-selector-status language-selector-error" role="alert">{t("languageSelector.searchError")}</p>}
          {!isSearching && !searchFailed && matches.length === 0 && (
            <p className="language-selector-status">{t("languageSelector.empty")}</p>
          )}
          {!isSearching && !searchFailed && matches.map((language, index) => (
            <button
              aria-selected={index === activeIndex}
              className={index === activeIndex ? "language-selector-option language-selector-option-active" : "language-selector-option"}
              id={`${listboxId}-option-${index}`}
              key={language.id}
              onClick={() => selectLanguage(language)}
              role="option"
              tabIndex={-1}
              type="button"
            >
              <span>{language.name}</span>
              {language.regionOrCountry && <small>{language.regionOrCountry}</small>}
            </button>
          ))}
        </div>
      )}

      {isCreateDialogOpen && (
        <div className="language-selector-dialog-backdrop">
          <div
            aria-describedby={dialogDescriptionId}
            aria-labelledby={dialogTitleId}
            aria-modal="true"
            className="language-selector-dialog"
            ref={dialogRef}
            role="dialog"
          >
            <div className="language-selector-dialog-heading">
              <div>
                <h3 id={dialogTitleId}>{t("languageSelector.dialogTitle")}</h3>
                <p id={dialogDescriptionId}>{t("languageSelector.dialogDescription")}</p>
              </div>
              <button
                aria-label={t("languageSelector.cancel")}
                className="language-selector-dialog-close"
                disabled={isCreating}
                onClick={() => closeCreateDialog()}
                type="button"
              >
                <Icon className="interface-icon" name="close" />
              </button>
            </div>
            <form aria-busy={isCreating} className="language-selector-create-form" noValidate onSubmit={(event) => void createLanguage(event)}>
              <label htmlFor={`${inputId}-new-name`}>
                <span>{label}</span>
                <input
                  disabled={isCreating}
                  id={`${inputId}-new-name`}
                  onChange={(event) => setNewLanguageName(event.target.value)}
                  ref={newLanguageNameRef}
                  required
                  type="text"
                  value={newLanguageName}
                />
              </label>
              <label htmlFor={`${inputId}-region`}>
                <span>{t("languageSelector.regionOrCountry")}</span>
                <input
                  disabled={isCreating}
                  id={`${inputId}-region`}
                  onChange={(event) => setRegionOrCountry(event.target.value)}
                  required
                  type="text"
                  value={regionOrCountry}
                />
              </label>
              {createError && (
                <p className="language-selector-dialog-error" role="alert">
                  {t(createError === "required" ? "languageSelector.required" : "languageSelector.createError")}
                </p>
              )}
              <div className="language-selector-dialog-actions">
                <button className="admin-secondary-button" disabled={isCreating} onClick={() => closeCreateDialog()} type="button">
                  {t("languageSelector.cancel")}
                </button>
                <button className="auth-primary" disabled={isCreating} type="submit">
                  {isCreating && <span aria-hidden="true" className="auth-spinner" />}
                  <span>{t(isCreating ? "languageSelector.creating" : "languageSelector.create")}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
