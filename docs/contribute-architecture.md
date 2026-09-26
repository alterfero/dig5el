# Contribute technical reference

Implementation checked **2026-09-25**. The active boundary is
[ADR 0002](adr/0002-independent-projects-and-file-import.md). See the
[user guide](contribute.md) for interaction and import instructions.

## Components and responsibilities

| Location | Responsibility |
| --- | --- |
| `app/contribute/page.tsx` | Authenticate the page request; load accessible DIG4EL projects and template summaries. |
| `components/contribute/contribute-screen.tsx` | Project/tab state, source lists, in-memory drafts, save/conflict/session handling, downloads and restore. |
| `components/contribute/source-editor.tsx` | Source metadata, questionnaire and pair editing, positional word links, caretaker review, original downloads. |
| `components/contribute/import-panel.tsx` | File selection, mapping, preview, inclusion, document batches. Parsing happens in the browser before saving. |
| `lib/contribute/model.ts` | Shared source/row types and progress calculations. |
| `lib/contribute/imports.ts` | File parsers, original attachment encoding, preview checks and downloads. |
| `lib/contribute/validation.ts` | Server/restore shape validation and save-size limit. |
| `server/contribute/routes.ts` | Authentication, current authorization, CSRF, immutable originals and versioned writes. |
| `server/contribute/store.ts` | PostgreSQL and process-memory persistence adapters. |
| `server/contribute/templates.ts` | Server-side questionnaire imports. Full templates are fetched individually. |
| `i18n/contribute.ts`, `app/contribute/contribute.css` | Typed English/French copy and responsive workspace styling. |

Inactive tabs and visited projects remain mounted so switching preserves state.
There is one shared draft per source ID within a project; the PLAID and Sentence
pairs tabs are views of that same record. The selected example is component
state and may reset when opening a different source. A staged import can be
lost when its add panel is closed; it is not an independently saved draft.

## Source model

`Source.kind` is `questionnaires`, `pairs`, or `documents`. PLAID is a view over
sources whose `originKind` is `plaid-export`; imported PLAID sources are pairs.
Other origins are `manual` and `upload`. A source has a UUID, title, contributor,
origin, permitted-use text, reference/target language labels, context, and rows.

Each row has an ID unique within the source, reference and target text, speaker,
notes, grammatical description, concepts, word links, and a local `checked`
flag. Questionnaire rows retain legacy utterance IDs. Other rows use UUIDs.
Links store zero-based positions in the whitespace-tokenized target text,
retaining punctuation/apostrophes within each token. Editing that text through
the UI clears its links and review. Review requires nonempty text on both sides.

Optional `original` payloads preserve imported structures; attachments contain
`name`, `mediaType`, and base64 bytes. A TXT `textPreview` is capped at 100,000
characters. These payloads may contain linguistic material and contributor
details; they remain protected by project access and are omitted from list
responses. Full schema definitions are in `lib/contribute/model.ts`.

## HTTP contract

All endpoints use DIG4EL local sessions and the common no-store JSON response
helpers. Successful responses are `{ data, meta: { requestId } }`; errors contain
`{ error: { code, message, requestId, retryable } }`.

| Method and route | `data` on success |
| --- | --- |
| `GET /api/contribute/projects/:projectId/sources` | `{ sources: SourceSummary[], persistent: boolean }` |
| `GET /api/contribute/projects/:projectId/sources/:sourceId` | `{ source: Source, version: number, updatedAt: string }` |
| `PUT /api/contribute/projects/:projectId/sources/:sourceId` | The same saved-source shape; 201 on creation, 200 on update or unchanged retry. |
| `GET /api/contribute/questionnaires/:templateId` | `{ template: QuestionnaireTemplate }`; `templateId` is the bundled template UID. |

PUT requires `Content-Type: application/json`, the trusted same-origin request,
and an `x-dig4el-csrf` header from the current authenticated session. Its body is
`{ source: Source, version: number }`. Send version `0` to create; otherwise send
the last saved version. It replaces the complete editable snapshot, not a patch.
The client refreshes `/api/auth/session` before each save so reauthentication in
another tab can recover an existing draft.

Project/source identifiers must be UUIDs. The source ID must match the route,
and its target language must equal the current language-project name. Updates
cannot change kind or origin kind. The server preserves the saved original and
attachment, plus original row payloads for matching row IDs. It reopens review
when an already reviewed row changes, and requires caretaker authority when a
row becomes reviewed. Permissions are checked from current membership on every
request; the browser's initial role is only presentation state.

Readers may GET project sources; writers/maintainers may PUT. A system
administrator can GET any project's sources without membership, but requires
writer/maintainer membership to PUT and caretaker capability to mark review.
Questionnaire-template GET requires authentication, not project membership.

Relevant responses are 400 for invalid data or an oversized save, 401 for a
missing/expired session, 403 for access/origin/CSRF failure, 404 for an absent
source/template, 409 for a stale version or conflicting creation, and 500 for
an unexpected failure. Missing auth configuration returns 503. List responses
are metadata-only but currently unpaginated. There is no delete, history,
background-job, attachment-streaming, or bulk-save endpoint.

## Persistence and concurrency

Migration [0009](../db/migrations/0009_contribution_sources.sql) adds:

- `dig4el_contribution_sources`: project reference, latest JSONB source payload,
  integer version, creator/updater references, and update time.
- `dig4el_contribution_audit`: source/project/actor references, saved version,
  and timestamp, unique by source/version.

Creation uses an insert that fails on an existing ID. Updates condition on both
project/ID and the expected version. A successful write increments the version
and inserts its audit record in one transaction; either both commit or neither
does. The route returns the existing result without another audit entry for an
unchanged retry. This is not a general operation ledger or automatic merge.

Only the **latest editable payload** is stored. Audit entries record who saved
which version and when; they do not contain old snapshots or diffs. There is no
revision restore or audit-viewer UI. Imported originals remain available but
do not represent prior edits. Database backups are still needed for recovery.

The PostgreSQL adapter has a separate pool with a maximum of three connections
per auth runtime. Development/tests can use an in-process memory adapter when
the auth runtime has no database. It is not persistent across restarts and is
not available for staging/production fallback.

## Migration and operational checks

Run `npm run db:migrate` with the intended `DATABASE_URL` before using shared
saving. The runner loads `.env.local`, reads all numbered SQL files in order,
and runs their idempotent statements in a single transaction. It does not keep
a separate migration-version ledger or provide a down-migration command.
The local configured database was migrated through 0009 on 2026-09-25; another
installation still needs to run the migrations.

`/api/health/ready` currently checks auth/administration tables only, not the
contribution tables. After deployment, also open Contribute with a suitable
account, list sources, save a small source, and confirm it survives a reload.
Production hosting, backup/restore, realistic large-corpus performance, and
deployed PLAID export compatibility have not been verified in this work.

## Validation and implementation limits

Parsers reject malformed XML and DTD/entity declarations, malformed tabular
quoting, invalid source copies, and unsupported formats. The server separately
validates full source shape, duplicate row IDs, word-position bounds, and the
20 MiB request limit. File extensions drive document-type acceptance; the
application does not parse PDF/DOCX contents or scan attachments.

CSV/TSV previews only map the two chosen text columns. FLEx imports only map the
documented sentence fields. Other annotations survive in originals, not as
editable semantic data. Duplicate checks currently apply only within the file.
No cross-source deduplication, external-language-code validation, media player,
AI processing, document indexing, or export of edited text back to FLEx exists.

Original attachments may expand beyond the save limit when base64 encoding and
parsed rows are included. The UI currently reports a generic save failure for
this case. Refer to [limits and recovery](contribute.md#limits).

## Tests

- `tests/lib/contribute/imports.test.ts`: CSV/Unicode, preview exclusions, FLEx
  variants/original retention, legacy questionnaires, positional links, locales.
- `tests/server/contribute-routes.test.ts`: authentication, CSRF, membership,
  review authority, validation, original preservation, conflicts and retry audit.
- `tests/components/contribute-screen.test.tsx`: stable tabs/drafts/search,
  readonly and keyboard behavior, save conflicts, logout, session recovery.
- `tests/server/contribute-postgres.test.ts`: opt-in real PostgreSQL adapter test
  with temporary tables; save/list/read, version checks, and audit writes.
- `tests/smoke/local-server.test.mjs`: production HTTP shell/health/error checks;
  these do not exercise the authenticated Contribute workflow end to end.

Commands and the dated verification record are in the [README](../README.md)
and [status page](status.md#verification-record).
