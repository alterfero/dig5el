import { describe, expect, it } from "vitest";
import catalog from "../../../data/wals-grambank-language-catalog.json";
import {
  findCatalogLanguage,
  searchCatalogLanguages,
} from "../../../server/languages/language-catalog";

describe("DIG4EL v1 language catalogue", () => {
  it("snapshots the exact WALS and Grambank name union used by v1", () => {
    expect(catalog).toHaveLength(4_299);
    expect(catalog).toEqual(expect.arrayContaining([
      expect.objectContaining({
        grambankIds: ["tahi1242"],
        name: "Tahitian",
        sources: ["grambank", "wals"],
        walsIds: ["tah"],
      }),
      expect.objectContaining({ name: "Nukuoro" }),
    ]));
  });

  it("finds the baseline with diacritic-insensitive partial matching", () => {
    const matches = searchCatalogLanguages("abe");
    expect(matches).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "catalog:Ab%C3%A9", name: "Abé", source: "catalog" }),
    ]));
    expect(findCatalogLanguage("catalog:Tahitian")).toMatchObject({
      name: "Tahitian",
      regionOrCountry: null,
      source: "catalog",
    });
  });
});
