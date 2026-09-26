# Plan 0001: Direct PLAID integration (deferred)

> Deferred by the 2026-09-25 product decision in
> [ADR 0002](../adr/0002-independent-projects-and-file-import.md).
> Current Contribute work uses independent DIG4EL storage and exported PLAID
> files. The direct API integration prerequisites below do not block that work.

- Status: Historical, deferred; no direct PLAID integration is scheduled here.
- Current work: [implementation status](../status.md) and
  [Contribute guide](../contribute.md).
- Revisit only after a new product decision changes the file-import boundary.

## Original goal (not the current prerequisite)

Implement the boundary in [ADR 0001](../adr/0001-plaid-interoperability-boundary.md) before any user-facing documentation feature. Keep PLAID authoritative, use only its public API/extension mechanisms, and keep DIG4EL independently approachable in its interface.

## Deferred sequence

1. **Ratify the integration contract.** Resolve the remaining ADR 0001 decisions; record the deployed PLAID version/OpenAPI snapshot, base URL, explicit DIG4EL-to-PLAID link hand-off, layer template, and extension agreement. DIG4EL login is a separate local account flow; do not code against inferred PLAID SSO or an undocumented link endpoint.

2. **Create the PLAID adapter and identity guard.** Put every PLAID call behind one typed client module. It owns the approved explicit-link hand-off, short-lived token handling, pagination, error normalization, audit helpers, document-version/strict-mode/batch/lock operations, and PLAID-ID mapping. Validate present PLAID project access on every PLAID-backed request; no route, worker, or UI component calls PLAID directly. A DIG4EL session alone must not authorize a PLAID request.

3. **Add project discovery and safe bootstrap.** Bind one DIG4EL workspace to one `{PLAID instance, project ID}` pair and inspect the existing layer graph before doing anything. For an approved blank/template project, create only agreed `dig4el` layers/configuration using REST and an atomic batch where possible. Reject untagged/ambiguous structural layers instead of guessing.

4. **Create persistence and mutation safety.** Add the minimal database/migrations, including an idempotent operation ledger. Make one generic annotation-write path that stamps `metadata.dig4el`, PLAID provenance/review policy, concise audit messages, explicit overwrite consent, document-version conflict handling, and broken-reference tombstones. Give background services dedicated PLAID accounts; use delegation for user-directed writes.

5. **Add contract and behavior tests before each feature.** Run the adapter against a PLAID test instance or recorded API contract. Cover login/session expiry, role enforcement, project visibility, bootstrap discovery, metadata patch preservation, same-user and cross-user conflicts, atomic rollback, provenance/review overwrite protection, audit attribution, deletion/irrecoverable-project behavior, document restore caveats, and local retention behavior.

6. **Only then implement a thin vertical slice.** The first user-facing workflow uses the completed adapter/database helpers, writes one owned annotation to PLAID, surfaces provenance/audit status in friendly language, and proves that the same state is visible without DIG4EL.

## Original readiness criteria for direct API integration only

- Luke's decisions are recorded and the joint PLAID integration agreement is in place.
- The selected PLAID version/API is pinned in a compatibility test.
- A user can sign in to a separate DIG4EL account. Only after an explicit verified PLAID link can they see PLAID projects, and they can perform no action beyond their present PLAID role.
- A blank or template project can be inspected and, if permitted, initialized without touching unowned layers.
- The local database can create/revise/tombstone its own records without retaining corpus copies.
- Automated tests demonstrate permission, provenance, revision, and deletion behavior.

## Original non-goals (historical scope)

- Direct database access to PLAID, source-code copying, data synchronization, and a replacement project/permission system.
- A multi-project corpus abstraction, offline editing, or unapproved SSO.
- Product screens, CQ workflow behavior, inference UX, or bulk import/export before the boundary has passed the definition of ready.
