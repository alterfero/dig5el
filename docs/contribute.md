# Using Contribute

Last checked: **2026-09-25**. See [current status](status.md) for unfinished
features and [technical reference](contribute-architecture.md) for storage/API
details. The English button labels below have French equivalents.

## Access and layout

Open `/contribute` after signing in to DIG4EL. Without a session, the page
redirects to `/login`. A system administrator creates language spaces under
`/admin`; administrators and project maintainers manage their membership.
Choose the language space at the top of Contribute before adding material.

| Access | Read sources | Create/edit/save | Mark examples reviewed |
| --- | --- | --- | --- |
| Project reader | Yes | No | No |
| Project writer or maintainer | Yes | Yes | Only with caretaker capability |
| System administrator without project membership | All spaces | No | No |

The four tabs are **Questionnaires**, **Sentence pairs**, **Reference documents**,
and **PLAID**. Each has a source list and an editor in the same workspace.
Switching tabs preserves their selected source, list search/filter, and edits
for the lifetime of the page. Switching between visited language spaces also
keeps their drafts in memory. The last tab is remembered after a reload; drafts
and selections are not. On a phone, all tabs remain visible and **Back to sources**
returns from the editor to its list. Arrow keys, Home, and End navigate the tabs.

## Add, edit, and save

1. Select a source tab and its add/start button. For file imports, choose the
   file, check the preview, and select **Add to workspace**.
2. Open **Source details** to set the title, author/contributor, origin/citation,
   and permitted use/attribution. These are descriptive fields; recording a
   restriction does not create an additional access-control rule.
3. Edit the examples or inspect the attached document.
4. Select **Save to language space** (or **Save changes** for an existing source).
   **Saved in DIG4EL** confirms the request succeeded.

Adding to the workspace creates an unsaved draft. Saving shares the source with
people who have access to that DIG4EL space, even when examples are incomplete
or unreviewed. There is no private saved-draft or publication-approval stage.
Each source is saved separately, including each file in a document batch.

Saved originals remain attached to the source. Subsequent edits change DIG4EL's
working copy; they do not rewrite the imported file or send anything to PLAID.

## Questionnaires (DCQ)

Choose one of the six bundled DIG4EL v1 dialogues. Read its context and full
dialogue, then translate one utterance at a time. Original prompts remain in
English when the interface is switched to French. The target language comes
from the selected language space.

Select a meaning under **Words and meanings**, then click the target-language
words expressing it. Multiple words may express one meaning, and repeated words
are distinguished by position. You can add meanings, notes, and a grammatical
description. Changing the target text clears its word connections and reopens
review. Other example edits also reopen review. Only a caretaker can mark a
complete example reviewed; that change must then be saved.

**Import a DCQ translation** accepts a v1 JSON recording whose `cq_uid` matches
a bundled questionnaire. It reads `data[utteranceId].translation`, `.comment`,
`interviewer`, and the pivot language. A nonempty `target language` must match
the language-space name, ignoring case. The full instrument and recording are
retained. Legacy semantic graphs and `concept_words` remain in the original;
they are not converted into editable positional word connections.

## Sentence pairs

Use **Enter examples** to start a blank collection, or import:

| Format | Expected content |
| --- | --- |
| CSV | Header row with distinct column names; `source` and `target` are selected automatically. Comma, semicolon, and tab separators are detected, including a leading `sep=` declaration. Quoted separators, escaped quotes, and quoted multiline values are supported. Completely empty spreadsheet columns are ignored. |
| TSV | The same structure with tab separators. |
| JSON | A v1 array of objects with string `source` and `target` fields. Optional string `comments` and `description` become editable fields; other fields remain in the original. |

`source` means the reference translation/prompt; `target` means the language
being documented. CSV/TSV columns with those names are selected initially. The
downloadable CSV template contains the header `source,target`. Use UTF-8 files.

For example, this is a synthetic JSON shape, not language evidence:

```json
[
  {
    "source": "Reference sentence",
    "target": "Corresponding target-language sentence",
    "comments": "Contributor's note",
    "description": "Optional grammatical observation"
  }
]
```

The preview flags incomplete pairs and exact duplicates within the selected
file. Both are initially unchecked. You can include them explicitly, including
incomplete examples to finish later. Duplicate comparison trims surrounding
whitespace and normalizes Unicode; it remains case-sensitive. It does not
search existing sources or other imports. Each import creates a new collection.

## PLAID exports

DIG4EL and PLAID remain independent. No PLAID login, credentials, API endpoint,
project binding, or synchronization is involved.

1. In PLAID IGT, use a **FieldWorks (FLEx)** export preset and leave the lexicon
   out so the result is a standalone `.flextext` file. Include the baseline and
   sentence translations you need. This export is documented in the
   [PLAID IGT guide, section 13.2](https://larc-iu.github.io/plaid/igt-guide.html),
   checked on 2026-09-25.
2. In the matching DIG4EL language space, select **PLAID → Import a PLAID export**.
3. Choose the `.flextext` file. If it contains several sentence-translation
   languages, choose one for the reference text and inspect the preview.
4. Check the language labels and included examples, add to the workspace, then
   save explicitly.

The FLEx baseline becomes DIG4EL's target-language text; sentence-level `gls`
items become its reference translation. The importer uses phrase text when
present, otherwise joins word/punctuation items with spaces. Confirm the
resulting spacing in the preview. The language-space name is not automatically
matched to the export's language code. Files declaring multiple baseline
languages are currently rejected; export one baseline language at a time.

The original file, including its exported annotations, is retained. The editor
extracts sentence pairs, speaker attributes, and phrase notes; it does not turn
morpheme analyses, lexicon links, or PLAID review/provenance into editable DIG4EL
annotations. DIG4EL can only retain what the selected export contains.

The same imported source appears in both **PLAID** and **Sentence pairs**.
Editing either view updates the same draft and saved record. Importing a file
again creates another source. ZIP/LIFT, PLAID IGT JSON archives, ELAN, and CLDF
are not supported by the PLAID importer in this version.

## Reference documents

Upload PDF, DOCX, or TXT files, up to 20 files per selection. Valid files remain
available when another file in the batch fails; errors are shown per file.
Check their titles before adding them, then attribution and permitted use in
each source's details before saving.

The original file is downloadable. TXT has a preview of its first 100,000
characters. PDF/DOCX rendering, text extraction, OCR, search indexing, and AI
analysis are not implemented. A stored document does not imply that it has
been analyzed.

## Keep and recover work

- **Download a copy** exports a `dig4el-source-v1` JSON containing the current
  source, including unsaved edits and its original attachment when present.
- **Import a previously downloaded copy** in the matching tab imports that JSON as a new
  unsaved source with a fresh ID. Its target language must match the selected
  space exactly. Review flags are reset. This does not overwrite a saved source
  or restore its revision history.
- A failed save keeps the draft in the open page. Retry or download it.
- A version conflict keeps your draft. Download it before **Reload saved version**,
  which discards those unsaved changes. Compare/reapply manually; no automatic
  merge is provided.
- If saving reports an expired session, leave the editor open, use **Sign in
  again** in the new tab, and retry the save. It obtains a fresh session token.
- Save or download before deliberately signing out. Explicit logout clears
  the contribution workspace. Refreshing or closing the page also loses unsaved
  work; browser navigation warnings are a reminder, not a recovery store.

There is no autosave, offline corpus cache, or persistent browser draft storage.
Only interface preferences are stored locally. A **Development storage** notice
means even saved work uses server memory and disappears on server restart;
configure PostgreSQL for persistent shared work.

## Limits

The UI rounds these binary limits to “MB.”

| Limit | Current value |
| --- | --- |
| CSV/TSV/JSON pairs, PLAID file, or reference document | 10 MiB per file |
| Restored source copy or legacy DCQ recording upload | 20 MiB per file |
| Examples per source / parsed FLEx file | 5,000 |
| Reference-document batch | 20 files |
| Entire save request | 20 MiB, including original, base64 attachment, and rows |
| Reference, target, notes, or description in one example | 10,000 characters each |

The full save limit can be reached before the upload limit because attachments
are encoded and parsed annotations are also retained. Large imports may preview
successfully but fail to save. Split the original into smaller files if needed.
There are currently no source deletion, row deletion, history/rollback, or
bulk-save controls. [Current status](status.md) tracks these limits explicitly.
