# Bundled data

## Language catalogue

`wals-grambank-language-catalog.json` is the generated union of language display
names in the DIG4EL v1 WALS and Grambank lookup snapshots. It supplies language
selection, not linguistic evidence, grammatical inference, or a live external
connection. Records retain source labels and available WALS/Grambank IDs.
Languages with the same exact name are merged during generation; this is not a
general reconciliation of language identifiers across those databases.

The server loads this snapshot through `server/languages/language-catalog.ts`.
Custom languages are separate PostgreSQL records (migration 0007); they do not
rewrite the bundled JSON. The selector supports normalized name search and
returns at most 24 combined results.

Regenerate from the two v1 lookup files with:

```sh
node scripts/build-language-catalog.mjs /path/to/wals-language-pk-id-by-name.json /path/to/grambank-language-by-lid.json
```

The script reads the supplied local files, handles legacy bare `NaN` lookup
values, deduplicates source IDs, sorts display names, and replaces the generated
catalogue. The source lookup files are not bundled here. Review the resulting
diff and run `npm test` after regenerating; no network lookup happens at runtime.

## Questionnaire instruments

See [Contribute data provenance and maintenance](contribute/README.md) for the
six original v1 dialogues and how their IDs are used by legacy imports.
