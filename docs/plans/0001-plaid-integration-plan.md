# Plan 0001: Establish the PLAID-compatible DIG4EL foundation

## Goal

Implement the boundary in [ADR 0001](../adr/0001-plaid-interoperability-boundary.md) before any user-facing documentation feature. Keep PLAID authoritative, use only its public API/extension mechanisms, and keep DIG4EL independently approachable in its interface.

## Sequenced work

1. **Ratify the integration contract.** Resolve the six Luke decisions in ADR 0001; record the deployed PLAID version/OpenAPI snapshot, base URL, identity hand-off, layer template, and extension agreement. Do not code against an inferred SSO or undocumented endpoint.

2. **Create the PLAID adapter and identity guard.** Put every PLAID call behind one typed client module. It owns the approved authentication hand-off, short-lived token handling, pagination, error normalization, audit helpers, document-version/strict-mode/batch/lock operations, and PLAID-ID mapping. Validate present PLAID project access on every protected request; no route, worker, or UI component calls PLAID directly.

3. **Add project discovery and safe bootstrap.** Bind one DIG4EL workspace to one `{PLAID instance, project ID}` pair and inspect the existing layer graph before doing anything. For an approved blank/template project, create only agreed `dig4el` layers/configuration using REST and an atomic batch where possible. Reject untagged/ambiguous structural layers instead of guessing.

4. **Create persistence and mutation safety.** Add the minimal database/migrations, including an idempotent operation ledger. Make one generic annotation-write path that stamps `metadata.dig4el`, PLAID provenance/review policy, concise audit messages, explicit overwrite consent, document-version conflict handling, and broken-reference tombstones. Give background services dedicated PLAID accounts; use delegation for user-directed writes.

5. **Add contract and behavior tests before each feature.** Run the adapter against a PLAID test instance or recorded API contract. Cover login/session expiry, role enforcement, project visibility, bootstrap discovery, metadata patch preservation, same-user and cross-user conflicts, atomic rollback, provenance/review overwrite protection, audit attribution, deletion/irrecoverable-project behavior, document restore caveats, and local retention behavior.

6. **Only then implement a thin vertical slice.** The first user-facing workflow uses the completed adapter/database helpers, writes one owned annotation to PLAID, surfaces provenance/audit status in friendly language, and proves that the same state is visible without DIG4EL.

## Definition of ready for feature work

- Luke's decisions are recorded and the joint PLAID integration agreement is in place.
- The selected PLAID version/API is pinned in a compatibility test.
- A user can authenticate once as their PLAID identity, see only their PLAID projects, and perform no action beyond their PLAID role.
- A blank or template project can be inspected and, if permitted, initialized without touching unowned layers.
- The local database can create/revise/tombstone its own records without retaining corpus copies.
- Automated tests demonstrate permission, provenance, revision, and deletion behavior.

## Non-goals for this plan

- Direct database access to PLAID, source-code copying, data synchronization, and a replacement project/permission system.
- A multi-project corpus abstraction, offline editing, or unapproved SSO.
- Product screens, CQ workflow behavior, inference UX, or bulk import/export before the boundary has passed the definition of ready.
