import catalog from "../../data/wals-grambank-language-catalog.json";
import { normalizeLanguageSearch, type LanguageOption } from "../../lib/languages";

type CatalogRecord = {
  grambankIds: string[];
  name: string;
  sources: string[];
  walsIds: string[];
};

const maximumSearchResults = 24;

const catalogLanguages: LanguageOption[] = (catalog as CatalogRecord[]).map((record) => ({
  id: `catalog:${encodeURIComponent(record.name)}`,
  name: record.name,
  regionOrCountry: null,
  source: "catalog",
}));

const catalogById = new Map(catalogLanguages.map((language) => [language.id, language]));
const catalogNames = new Set(catalogLanguages.map((language) => normalizeLanguageSearch(language.name)));

function compareSearchMatch(left: LanguageOption, right: LanguageOption, normalizedQuery: string): number {
  const leftName = normalizeLanguageSearch(left.name);
  const rightName = normalizeLanguageSearch(right.name);
  const leftStarts = leftName.startsWith(normalizedQuery);
  const rightStarts = rightName.startsWith(normalizedQuery);
  if (leftStarts !== rightStarts) return leftStarts ? -1 : 1;
  return left.name.localeCompare(right.name, "en");
}

/** Finds a stable v1 WALS/Grambank baseline record by its opaque key. */
export function findCatalogLanguage(languageId: string): LanguageOption | null {
  return catalogById.get(languageId) ?? null;
}

/** True when a display spelling is already represented by the v1 baseline. */
export function isCatalogLanguageName(name: string): boolean {
  return catalogNames.has(normalizeLanguageSearch(name));
}

/**
 * Searches the immutable 4,299-name DIG4EL v1 WALS/Grambank union. The
 * caller adds persisted custom languages before applying the shared limit.
 */
export function searchCatalogLanguages(query: string, limit = maximumSearchResults): LanguageOption[] {
  const normalizedQuery = normalizeLanguageSearch(query);
  if (!normalizedQuery) return [];
  return catalogLanguages
    .filter((language) => normalizeLanguageSearch(language.name).includes(normalizedQuery))
    .sort((left, right) => compareSearchMatch(left, right, normalizedQuery))
    .slice(0, Math.max(0, limit));
}

export { maximumSearchResults };
