import { mkdir, readFile, writeFile } from "node:fs/promises";

const [walsPath, grambankPath] = process.argv.slice(2);

if (!walsPath || !grambankPath) {
  console.error(
    "Usage: node scripts/build-language-catalog.mjs <v1-wals-language-pk-id-by-name.json> <v1-grambank-language-by-lid.json>",
  );
  process.exitCode = 1;
} else {
  // DIG4EL v1's generated WALS lookup contains a handful of bare `NaN`
  // identifiers. The display names remain valid catalogue entries; replace
  // only those non-JSON values before reading the historical snapshot.
  const wals = JSON.parse((await readFile(walsPath, "utf8")).replace(/:\s*NaN(?=\s*[,}])/gu, ": null"));
  const grambank = JSON.parse(await readFile(grambankPath, "utf8"));
  const languages = new Map();

  for (const [name, reference] of Object.entries(wals)) {
    const entry = languages.get(name) ?? { grambankIds: [], name, sources: [], walsIds: [] };
    entry.sources.push("wals");
    if (reference && typeof reference === "object" && typeof reference.id === "string") {
      entry.walsIds.push(reference.id);
    }
    languages.set(name, entry);
  }

  for (const reference of Object.values(grambank)) {
    if (!reference || typeof reference !== "object" || typeof reference.name !== "string") continue;
    const entry = languages.get(reference.name) ?? {
      grambankIds: [],
      name: reference.name,
      sources: [],
      walsIds: [],
    };
    entry.sources.push("grambank");
    if (typeof reference.id === "string") entry.grambankIds.push(reference.id);
    languages.set(reference.name, entry);
  }

  const catalog = [...languages.values()]
    .map((entry) => ({
      grambankIds: [...new Set(entry.grambankIds)].sort(),
      name: entry.name,
      sources: [...new Set(entry.sources)].sort(),
      walsIds: [...new Set(entry.walsIds)].sort(),
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "en"));

  await mkdir(new URL("../data/", import.meta.url), { recursive: true });
  await writeFile(
    new URL("../data/wals-grambank-language-catalog.json", import.meta.url),
    `${JSON.stringify(catalog, null, 2)}\n`,
  );
  console.info(`Wrote ${catalog.length} catalog languages.`);
}
