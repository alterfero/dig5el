# ADR 0002: Independent DIG4EL projects and explicit PLAID file imports

- Status: Accepted by the product owner on 2026-09-25.
- Supersedes ADR 0001's shared-corpus/project-binding requirement for current work.
- Implementation: Local Contribute workspace implemented and verified on
  2026-09-25; see [current status](../status.md), [usage guide](../contribute.md),
  and [technical reference](../contribute-architecture.md).

The product owner requested that PLAID projects and DIG4EL projects remain well
separated, with no direct PLAID connection. The current integration is an
explicit import of files exported from PLAID. DIG4EL owns its independent copy,
language-project permissions, latest saved sources, version counters, and local
review state.
No PLAID credentials, API requests, account links, project binding, or automatic
synchronization are involved.

The first supported PLAID export is FieldWorks interlinear XML (`.flextext`),
exported without the lexicon. It is documented by the PLAID IGT export guide and
is a practical single-file interchange format. DIG4EL previews language choices,
missing translations, and within-file duplicates before creating an unsaved
source. Selected examples become sentence pairs; the original file retains the
annotations and metadata that are not editable in DIG4EL's example editor.
PLAID-origin sources appear in both the PLAID and Sentence pairs views of the
same DIG4EL record. No content or review status is fabricated.

Contributions are saved explicitly under DIG4EL's own project permissions:
readers view; writers and maintainers edit; an explicitly assigned caretaker may
mark examples reviewed. System administrators can read all language spaces;
local system administration alone does not grant corpus editing or review.
Every project-source request rechecks current DIG4EL access. Saving uses
an expected version and an audit entry; conflicts preserve the user's browser
draft and offer download and reload. Originals remain immutable on edits.

PostgreSQL migration 0009 stores the latest source payload and its save audit.
Audit records contain actor, version, and time, not previous editable snapshots;
there is no revision-history or rollback UI. The development
memory fallback is labeled in the interface and is not used in production.
Unsaved edits stay only in the current page; users can download a source JSON
including its attachment and restore it later. Only the last active tab is
remembered in browser storage. No corpus payload is stored in localStorage.

Questionnaires use the original six DIG4EL v1 instruments. Sentence imports
accept CSV, TSV, and the v1 `source`/`target` JSON array. Reference documents accept
PDF, DOCX, and TXT; they are stored as original attachments. AI augmentation,
document indexing, and grammar inference need their own processing service and
are explicitly unavailable, rather than reporting simulated completion.

Reference: [PLAID IGT guide, section 13.2](https://larc-iu.github.io/plaid/igt-guide.html)
(export option verified on 2026-09-25).
