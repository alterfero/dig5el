import { describe, expect, it } from "vitest";
import {
  defaultLocale,
  messages,
  resolveLocale,
  supportedLocales,
  translate,
} from "../../i18n/messages";

describe("interface messages", () => {
  it("keeps every registered locale complete", () => {
    const englishKeys = Object.keys(messages.en).sort();

    for (const locale of supportedLocales) {
      expect(Object.keys(messages[locale]).sort()).toEqual(englishKeys);
    }
  });

  it("uses a supported browser language and safely falls back to English", () => {
    expect(resolveLocale(["fr-CA", "en-US"])).toBe("fr");
    expect(resolveLocale(["mi-NZ"])).toBe(defaultLocale);
  });

  it("returns the matching localized message", () => {
    expect(translate("en", "hero.connect")).toBe("Connect");
    expect(translate("fr", "hero.connect")).toBe("Connecter");
  });
});
