/** A language that can be selected anywhere in the DIG4EL interface. */
export type LanguageOption = {
  /** Stable reference: `catalog:` for the v1 baseline or `custom:` for additions. */
  id: string;
  name: string;
  /** Required for user-added languages; baseline records may not have it. */
  regionOrCountry: string | null;
  source: "catalog" | "custom";
};

/**
 * Keeps matching and duplicate detection consistent without changing the
 * spelling people see. It intentionally accepts all Unicode letters.
 */
export function normalizeLanguageSearch(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replaceAll(/\s+/gu, " ");
}
