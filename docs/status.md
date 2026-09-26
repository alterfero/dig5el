# Current implementation status

Last reviewed: **2026-09-25**. This describes the code and local verification in
this workspace, not a production release or deployment certification.

The active product decision is
[ADR 0002: independent projects and file imports](adr/0002-independent-projects-and-file-import.md).
DIG4EL owns its language spaces, corpus copies, permissions, and local review.
PLAID is an optional source of exported files. A direct connection is outside
the current scope and is not a prerequisite for further Contribute work.

## Available now

| Area | Implemented behavior |
| --- | --- |
| Application | Next.js/React application; responsive landing page, authenticated workspace, administration, and Contribute. |
| Accounts | Administrator-issued setup/recovery codes, password sign-in, opaque sessions, CSRF and origin checks, audited account management and account deletion. No public self-registration or recovery-email service. |
| Language spaces | Local project membership (`reader`, `writer`, `maintainer`), separate caretaker capability, and separate system-administrator capability. WALS/Grambank catalogue search plus persisted custom languages. |
| Contribute navigation | Four persistent tabs, per-tab source search/filter and selection, inline editors, desktop expansion, mobile back-to-list, keyboard tab navigation. |
| Questionnaires | Six original v1 instruments, dialogue context and prompts, translation, notes/descriptions, positional word-to-meaning links, caretaker review, legacy recording import. |
| Sentence pairs | Manual collections, CSV/TSV column mapping, v1 JSON import, row preview with incomplete/duplicate selection, subsequent editing. |
| Reference documents | PDF/DOCX/TXT originals, per-file batch feedback, original download, limited TXT preview. |
| PLAID import | Standalone `.flextext` import with translation-language choice, preview, original retention, and one shared source visible in the PLAID and Sentence pairs tabs. |
| Saving | Explicit PostgreSQL source saves, project authorization, optimistic version conflicts, save audit metadata, immutable imported originals. |
| Draft recovery | Page-memory drafts, downloaded source-copy JSON and restore, conflict recovery, session-expiry recovery while the page stays open. |
| Interface languages | English and French; questionnaire content and corpus text are not automatically translated. |
| Operations | Local PostgreSQL setup, migrations through 0009, administrator bootstrap, structured redacted logs, liveness/readiness endpoints, build and test scripts. |

## Not implemented or intentionally outside scope

| Capability | Current status |
| --- | --- |
| Direct PLAID API access, sign-in/linking, project binding, synchronization | Outside current product scope. Gateway/configuration scaffolding remains inactive; runtime validation rejects enabling PLAID auth. |
| Grammar generation/inference and automatic grammatical descriptions | Unavailable; the interface labels the analysis service as not connected. Manually entered descriptions are supported. |
| AI sentence augmentation | Unavailable. |
| Document indexing, full-text search, PDF/DOCX rendering/extraction, OCR | Unavailable. Reference files are stored, not processed. |
| Durable unsaved drafts, autosave, offline mode | Unavailable. Save or download before leaving. Browser storage retains UI preferences only. |
| Revision history, rollback, source/row deletion, bulk saving | No dedicated product controls or endpoints. The audit stores actor/version/time, not old source snapshots. |
| Cross-file duplicate detection, merge/reimport into an existing source | Unavailable. Each import/restore creates a new source; duplicate preview is within-file only. |
| Full PLAID annotation editor, lexicon/media import, edited FLEx export | Unavailable. Original exported annotations are retained; editable content is a limited sentence-level projection. |
| Import formats beyond those in the guide | Not supported, including PLAID ZIP archives, LIFT, ELAN, and CLDF. |
| Public registration, SMTP activation/recovery | Not used. `/recover` explains the administrator-assisted process; `/verify-email` redirects to login. |
| Production deployment and operational backup/restore | Instructions exist; neither was performed or verified for this change. |

## Known limits and follow-up work

- Source visibility is project-wide on save. There is no private saved-draft
  state. System administrators can read all spaces but need explicit project
  write access/caretaker capability for editing/review.
- Saved sources require migration 0009. The readiness endpoint currently checks
  auth/administration tables but not contribution storage.
- Individual uploads and saves have [size and row limits](contribute.md#limits).
  Original/parsed/base64 content can make a valid upload exceed the save limit;
  the UI does not yet report that specific save-size cause.
- Source lists are unpaginated. Large-corpus performance has not been validated.
- Multiple FLEx baseline languages are rejected, and baseline code matching to
  the selected DIG4EL language space remains a manual preview check.
- Legacy questionnaire word/concept annotations and FLEx morpheme/lexicon data
  are preserved in originals but not converted into editable word links.
- Closing an import panel can discard its preview. Opening a different source
  can reset the selected example; stable tabs do not imply durable state across
  page reloads or logout.
- Compatibility was checked against the documented PLAID format with synthetic
  fixtures. A representative export from the user's deployed PLAID instance
  still needs an acceptance pass before claiming complete export coverage.

These are recorded follow-ups, not a commitment to add direct PLAID integration
or a scheduled implementation plan.

## Verification record

Completed on **2026-09-25**, after the Contribute implementation:

| Check | Result and scope |
| --- | --- |
| `npm run typecheck` | Passed. |
| `npm run lint` | Passed. |
| `npm test` | 23 test files / 124 tests passed; one PostgreSQL test file/test skipped without `DATABASE_URL`. |
| Explicit PostgreSQL contribution test | Passed separately against local PostgreSQL with isolated temporary tables; no real user/project/source records changed by the test. |
| `npm run db:migrate` | Migrations through 0009 applied to the configured local database. This does not imply other databases are migrated. |
| `npm run test:smoke` | Production build and all three HTTP smoke tests passed. |
| Browser inspection | Desktop (1440×1000) and phone (390×844), stable draft/tab navigation, synthetic `.flextext` preview, translation-language selection and incomplete rows. Used a temporary synthetic preview route that was removed before the final production build. |
| `git diff --check` | Passed. |
| Documentation audit | Local Markdown links and anchors resolve; commands, formats, permissions, and limits checked against the implementation. |

The browser inspection used synthetic content; the HTTP smoke tests cover the
public shell and API boundary. Together with component/route/database tests,
they provide local implementation evidence, not a full authenticated browser
acceptance test against real corpus data or a deployed service.

For reproducible commands see [local development](../README.md#local-development).
When changing behavior, update this status record, the [usage guide](contribute.md),
and the [technical reference](contribute-architecture.md). Keep historical ADRs
labeled as such; do not treat their deferred requirements as current blockers.
