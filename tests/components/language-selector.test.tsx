// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LanguageSelector,
  type NewLanguageInput,
} from "../../components/language-selector";
import { LocaleProvider } from "../../components/locale-provider";
import { localeStorageKey } from "../../i18n/messages";
import type { LanguageOption } from "../../lib/languages";

const tahitian: LanguageOption = {
  id: "catalog:Tahitian",
  name: "Tahitian",
  regionOrCountry: null,
  source: "catalog",
};

const rapa: LanguageOption = {
  id: "custom:00000000-0000-4000-8000-000000000099",
  name: "Rapa",
  regionOrCountry: "French Polynesia",
  source: "custom",
};

type SelectorHarnessProps = Readonly<{
  allowCreate?: boolean;
  loadLanguages: (query: string) => Promise<LanguageOption[]>;
  onChange?: (language: LanguageOption | null) => void;
  onCreateLanguage?: (language: NewLanguageInput) => Promise<LanguageOption>;
}>;

function SelectorHarness({
  allowCreate,
  loadLanguages,
  onChange,
  onCreateLanguage,
}: SelectorHarnessProps) {
  const [value, setValue] = useState<LanguageOption | null>(null);

  return (
    <LanguageSelector
      allowCreate={allowCreate}
      label="Language name"
      loadLanguages={loadLanguages}
      onChange={(language) => {
        setValue(language);
        onChange?.(language);
      }}
      onCreateLanguage={onCreateLanguage}
      value={value}
    />
  );
}

function renderSelector(props: SelectorHarnessProps) {
  return render(
    <LocaleProvider>
      <SelectorHarness {...props} />
    </LocaleProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(localeStorageKey, "en");
});

afterEach(() => {
  cleanup();
});

describe("LanguageSelector", () => {
  it("looks up matching languages and commits the active combobox option with the keyboard", async () => {
    const loadLanguages = vi.fn<(query: string) => Promise<LanguageOption[]>>().mockResolvedValue([
      tahitian,
    ]);
    const onChange = vi.fn();
    renderSelector({ loadLanguages, onChange });

    const input = screen.getByRole<HTMLInputElement>("combobox", { name: "Language name" });
    fireEvent.change(input, { target: { value: "tahi" } });

    const option = await screen.findByRole("option", { name: /Tahitian/ });
    await waitFor(() => expect(loadLanguages).toHaveBeenCalledWith("tahi"));
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(input).toHaveAttribute("aria-activedescendant", option.id);
    expect(option).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(tahitian));
    expect(input).toHaveValue("Tahitian");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("keeps custom-language creation opt-in", () => {
    renderSelector({ loadLanguages: vi.fn().mockResolvedValue([]) });

    expect(screen.queryByRole("button", { name: "Add a new language" })).not.toBeInTheDocument();
  });

  it("closes the dialog with Escape and restores focus to the add button", async () => {
    renderSelector({
      allowCreate: true,
      loadLanguages: vi.fn().mockResolvedValue([]),
      onCreateLanguage: vi.fn().mockResolvedValue(rapa),
    });

    const addButton = screen.getByRole("button", { name: "Add a new language" });
    fireEvent.click(addButton);
    const dialog = await screen.findByRole("dialog", { name: "Add a new language" });

    fireEvent.keyDown(dialog, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(addButton).toHaveFocus());
  });

  it("opens the optional creation dialog and passes the language origin to its creator callback", async () => {
    const loadLanguages = vi.fn<(query: string) => Promise<LanguageOption[]>>().mockResolvedValue([]);
    const onChange = vi.fn();
    const onCreateLanguage = vi
      .fn<(input: NewLanguageInput) => Promise<LanguageOption>>()
      .mockResolvedValue(rapa);
    renderSelector({ allowCreate: true, loadLanguages, onChange, onCreateLanguage });

    const addButton = screen.getByRole("button", { name: "Add a new language" });
    expect(addButton).toHaveAttribute("data-tooltip", "Add a new language");
    fireEvent.click(addButton);

    const dialog = await screen.findByRole("dialog", { name: "Add a new language" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    const dialogScope = within(dialog);
    const name = dialogScope.getByLabelText("Language name");
    const origin = dialogScope.getByLabelText("Region or country of origin");

    await waitFor(() => expect(name).toHaveFocus());
    fireEvent.change(name, { target: { value: " Rapa " } });
    fireEvent.change(origin, { target: { value: " French Polynesia " } });
    fireEvent.click(dialogScope.getByRole("button", { name: "Add language" }));

    await waitFor(() => {
      expect(onCreateLanguage).toHaveBeenCalledWith({
        name: "Rapa",
        regionOrCountry: "French Polynesia",
      });
    });
    expect(onChange).toHaveBeenCalledWith(rapa);
    expect(screen.queryByRole("dialog", { name: "Add a new language" })).not.toBeInTheDocument();
    await waitFor(() => expect(addButton).toHaveFocus());
  });
});
