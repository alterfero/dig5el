# ADR 0001: PLAID interoperability boundary (historical proposal)

> The current product direction is [ADR 0002](0002-independent-projects-and-file-import.md),
> accepted on 2026-09-25: independent DIG4EL projects and explicit PLAID file
> imports, with no direct connection. The shared-corpus and project-binding
> design below is retained as historical context for a possible future integration.

- Status: Superseded for current product scope by ADR 0002 on 2026-09-25. The direct-integration proposal below is not an implementation requirement or a description of the current corpus store.
- Date: 2026-09-16
- Decision owners: DIG4EL and PLAID maintainers

For the implemented account model, local corpus permissions, storage, and
known limits, see the [current status](../status.md) and
[Contribute technical reference](../contribute-architecture.md). The statements
below about PLAID-only corpus storage, no local corpus copies, and prerequisite
PLAID agreements belong to the superseded proposal. Identity separation still
applies, but identity linking remains unimplemented and outside current scope.

## Context

DIG4EL 2 is a friendly standalone language-documentation application. PLAID is the canonical corpus platform: it supplies the corpus model, project membership, permissions, history, and REST interface. DIG4EL must therefore be a well-behaved PLAID client, not a fork, database peer, or alternate authority for corpus access.

This ADR was prepared against the [PLAID Manual](https://larc-iu.github.io/plaid/manual.html), [JavaScript API reference](https://larc-iu.github.io/plaid/api-js.html), and [development/OpenAPI guidance](https://larc-iu.github.io/plaid/dev.html), reviewed on 2026-09-16. PLAID is currently published as an alpha release, so the deployed instance's `/api/v1/openapi.json` is the implementation contract and must be pinned/contract-tested before feature work.

## Decision

### 1. Identity and authentication

DIG4EL and PLAID have deliberately separate identity domains.

- DIG4EL owns a small application account: immutable DIG4EL UUID, administrator-provisioned local email identifier, password hash, lifecycle state, and application session. It never stores a PLAID password or treats a local role as a corpus permission.
- A person may have only a DIG4EL account, only a PLAID account, or both. DIG4EL does not auto-link matching email addresses and does not create a PLAID account during registration.
- A future explicit link is an independently verified pair `{dig4el_user_id, plaid_instance_id, PLAID user ID}`. It is created only after an approved PLAID proof-of-control hand-off; it is never inferred from email or display name. One PLAID identity pair may link to at most one DIG4EL user until an audited unlink/relink flow is designed.
- DIG4EL uses its own short-lived opaque, HTTP-only session cookie. The server stores only a keyed HMAC digest of the cookie ID and session metadata; it stores no password in a session. A CSRF proof is derived from that cookie and a server-only key, not persisted as a second token. A system administrator creates pending accounts and issues one-time, hashed, time-limited setup or recovery capabilities; raw capabilities are returned once to that administrator and shared out of band. DIG4EL sends no activation or recovery email and exposes no public recovery request.
- A linked PLAID account remains the authority for corpus access. Every PLAID-backed request must use the approved PLAID credential/delegation mechanism and re-check current PLAID access. A DIG4EL account or local session grants no PLAID project access.
- A background service uses a dedicated PLAID service account with the narrowest project membership, plus a named token owned by that account. User-directed corpus changes use PLAID delegation so permission checks and audit attribution remain with the requester; independent machine output uses its service identity and PLAID provenance.

This permits DIG4EL-only use while preserving PLAID as the source of truth for PLAID identities, projects, and corpus permissions.

### 2. Project mapping

Before the approved PLAID hand-off, DIG4EL may keep a **local language-project
roster** for its own administration. It contains only DIG4EL application roles
(`reader`, `writer`, `maintainer`), a separately audited `caretaker`
capability valid only with writer/maintainer access, and a separate global
DIG4EL system-administrator capability. It is not a PLAID project, membership,
role, corpus permission, or claim that a user can access PLAID data. No local
assignment authorizes a PLAID call; future corpus features must re-check the
current PLAID API permission.

Once a PLAID-backed workspace is approved, its mapping is deliberately
one-to-one:

```text
DIG4EL project/workspace  ────────  {PLAID instance ID, PLAID project ID}
```

- The `{instance, project}` pair is the durable external key. A DIG4EL project is an interface over exactly one existing or newly created PLAID project, not a local corpus copy.
- The project picker lists only projects returned by PLAID for the authenticated user. Creation calls the PLAID project API, which makes the creator a maintainer; DIG4EL then bootstraps only its own configuration and layers.
- Project name, documents, media, members, and ACLs are read from and changed through PLAID. DIG4EL may retain a non-authoritative local binding/configuration row for quick startup, but it must re-check PLAID before serving protected data or writing.
- A multi-project DIG4EL collection, cross-project search, and project cloning are deferred. They require an explicit later design rather than silently treating several PLAID projects as one.

### 3. Ownership and system of record

| Data | Authority | DIG4EL rule |
| --- | --- | --- |
| PLAID users, credentials, tokens, project membership, roles, and audit log | PLAID | Never duplicate, edit its database, or elevate a local role into a PLAID permission. |
| DIG4EL app users, password hashes, administrator-issued setup/recovery token hashes, sessions, account-lifecycle audit, and optional PLAID identity links | DIG4EL | Maintain a separate app register; never store a PLAID password, a raw setup/recovery code, or infer a PLAID link from an email match. |
| DIG4EL local language-project roster, caretaker capability, system-administrator capability, and immutable permission audit | DIG4EL application administration | Never treat it as a PLAID project ACL, corpus role, or evidence of current PLAID access; a future PLAID request still re-checks PLAID. |
| Projects, documents, media, shared text/token substrate, shared `plaid` roles, and core IDs | PLAID | Read/write only through PLAID APIs; reuse shared structures rather than recreate them. |
| DIG4EL layer definitions and annotations stored in PLAID | PLAID stores and enforces them; DIG4EL owns their meaning | Create, discover, validate, and change only data marked as DIG4EL-owned. |
| CQ instruments, inference-run records, claims, citations, user/interface settings, and derived application state | DIG4EL local database | Keep references to PLAID IDs, never a shadow corpus or independent ACL. |

“DIG4EL-owned” means that DIG4EL defines the schema and user experience. It does not mean that DIG4EL bypasses PLAID: corpus-attached annotations remain in PLAID and are always written via its API.

### 4. Shared layers and the `dig4el` convention

PLAID's shared structural conventions come first.

- DIG4EL recognizes only explicitly tagged PLAID roles in the reserved `plaid` configuration namespace: `baseline`, `sentence`, `word`, `syntactic-word`, `morpheme`, and `time-alignment` as applicable. It does not read or modify untagged/unknown layers.
- It shares the substrate as far as semantics genuinely agree. DIG4EL must not create a second baseline, sentence, or word structure merely for its UI; when its semantics diverge, it branches below the last compatible token layer.
- Each DIG4EL-created layer is configured through PLAID's configuration namespace `dig4el`, with at least: `owner = "dig4el"`, `kind`, `schema-version`, and an immutable `stable-id`. Human-readable layer names are not identifiers.
- `observation`, `elicitation-response`, and `evidence-link` are proposed placeholders, not a v1 physical layer shape. No layer is created until its anchor scope/type is agreed; additional kinds require a schema/version decision. No generic layer is assumed to be safe to reuse.
- Project-level `dig4el` configuration records the integration schema version and the stable IDs/PLAID IDs of the selected shared and DIG4EL layers. This is a discovery manifest, not a second corpus schema.

PLAID config has a first-class namespace parameter. Entity metadata is a free map, so DIG4EL holds its app-specific entity data inside a `dig4el` object and preserves PLAID's top-level interoperable provenance keys. The initial required metadata shape is:

```json
{
  "dig4el": {
    "id": "UUID generated by DIG4EL and never changed",
    "revision": 1,
    "schemaVersion": 1,
    "owner": {
      "kind": "user | service | project",
      "id": "PLAID user ID or service ID"
    }
  }
}
```

`dig4el.id` identifies the logical DIG4EL annotation; the PLAID entity ID identifies its actual corpus row. Local references retain both. Metadata writes use PLAID's shallow patch operation, updating the complete `dig4el` object when it changes and never using replace-all metadata calls, so other applications' top-level keys survive.

### 5. Revisions, provenance, permissions, and deletion

**Revisions and concurrency.** `metadata.dig4el.revision` increments for every DIG4EL semantic change. The corresponding PLAID document version and audit entry are the authoritative history. Each write must use the deployed API's documented document-version precondition and reload on a conflict; strict mode adds protection from other users but is not sufficient for two tabs of the same user. Until that precondition is contract-tested, the BFF serializes a user's writes per document or uses a short PLAID lock. Atomic batches cover one logical multi-row change.

**Provenance.** DIG4EL adopts PLAID's interoperable metadata convention: trusted human annotations have no `prov`; machine output has `prov: "inferred"` and `provSource`; reviewed contributor output has `prov: "contributed"` and `provSource: "user:<userId>"`; confirmation preserves the source and adds `provConfirmed: true`. It reads the project's shared `plaid.review` policy rather than inventing a local reviewer rule. `provProb` and `provDetail` follow PLAID's convention. DIG4EL adds `metadata.dig4el.runId`, instrument/version IDs, and citation/claim links as needed. A machine writer may replace only unverified machine material by default; human, contributed, or verified material needs an explicit user opt-in.

**Permissions.** PLAID's maintainer/writer/reader roles remain unchanged. Maintainers may bootstrap or alter DIG4EL configuration; writers may make permitted corpus edits; readers receive no write path. Every local claim, citation, or run record carrying a PLAID reference is returned only after the caller's present PLAID access to that project is checked. DIG4EL's local language-project roster is an application-admin boundary only: its similarly named roles, caretaker capability, and global system-administrator capability never replace PLAID authorization or create a parallel corpus ACL.

**Deletion.** Corpus deletion occurs only through PLAID's API after a clear, role-appropriate confirmation. DIG4EL never rewrites a deleted entity automatically and never copies it to a private store to evade a deletion. On a PLAID delete or cascade, local links become `missing`/tombstoned with their external IDs and last-known audit reference. Document time-travel/restore is a maintainer option, but not a project-delete undo and may skip unavailable layers/vocabulary links. DIG4EL-local claims, citations, and run records use soft deletion first; any irreversible purge follows the approved retention policy.

### 6. Minimum local DIG4EL database

The initial database is intentionally small. It contains DIG4EL password hashes and application-session metadata, but no PLAID password, long-lived PLAID bearer token, copied document text, token offsets, media, layer payload, or project ACL. DIG4EL app roles, if added later, are application-only and never become PLAID authority. PLAID's private per-user key/value store is not used for claims, citations, or corpus state because it is private and outside the shared audit/time-travel model.

| Record family | Minimum contents |
| --- | --- |
| `plaid_instance`, `project_binding` | Stable instance ID/base URL and `{instance, PLAID project ID}`, integration schema version, selected layer IDs, last validated timestamp. |
| `dig4el_user`, `session`, `auth_action_token`, `auth_account_audit` | DIG4EL UUID, administrator-provisioned email identifier, password hash, lifecycle state; opaque-session HMAC digest/expiry; one-time hashed setup/recovery tokens and append-only non-secret lifecycle audit. CSRF proof is derived server-side from the cookie/session key. No PLAID password, raw account code, or PLAID token. |
| `plaid_identity_link` | Explicitly verified `{dig4el_user_id, plaid_instance_id, PLAID user ID}` pair, link state, and audit timestamps. No email-based auto-link. |
| `language_project`, `language_project_membership`, `system_administrator`, `permission_audit` | DIG4EL-local administration only: project display record, reader/writer/maintainer assignment, separate caretaker capability, separate global admin capability, and append-only old/new permission snapshots. No PLAID project ID, corpus ACL, or authority claim. |
| `setting` | Scope (`dig4el-user`, `project`, or application), DIG4EL user ID and PLAID instance/project external IDs where relevant, key, JSON value, revision, timestamps. |
| `cq_instrument`, `cq_instrument_version`, `cq_item` | Stable UUIDs, immutable versioned instrument/question definitions, locale/display data, lifecycle state. Corpus-attached answers remain PLAID annotations; do not add a local response store by default. |
| `inference_run` | Stable UUID, project/document/entity references, requester or service reference, model/provider/version, redacted configuration and input/output hashes, status/timestamps, output entity IDs, error summary. Do not retain raw prompt or corpus/PII payloads without approval. |
| `claim`, `claim_revision`, `claim_evidence` | Stable claim UUID, structured assertion, state, owner, revision history, and PLAID evidence entity IDs plus their `dig4el.id` values. |
| `citation`, `claim_citation` | Stable citation UUID, normalized bibliographic data (for example CSL-JSON), external identifiers/checksum, and claim relationship/locator. |
| `tombstone` | Local record type/ID, PLAID external reference where applicable, reason, actor, and time for soft-deleted local records or broken corpus references. |
| `operation_ledger` | Idempotency key, intended PLAID/local mutation references, resulting PLAID audit ID where available, status, and last error for retry/reconciliation. Reconcile by re-reading PLAID state/audit; do not assume resumable events. |

The database may cache a PLAID response only briefly with an explicit expiry. It is not a synchronization target or a backup of PLAID.

## Consequences

- DIG4EL can be warm and task-focused without obscuring who owns corpus data or permissions.
- PLAID audit, time travel, role checks, and interoperable layer roles continue to work for data created in DIG4EL.
- The integration needs an adapter and contract tests early, but it avoids a risky migration or long-term reconciliation system.
- A later SSO mechanism, multi-project workspace, or new `dig4el` layer kind can be added behind a schema version; none should be assumed now.

## Decisions required from Luke

1. **PLAID link hand-off:** Approve the proof-of-control flow for linking a separate DIG4EL account to a PLAID identity. PLAID does not currently document external federation, so no email-based link is permitted.
2. **Bootstrap template:** May DIG4EL create the agreed shared substrate roles for a blank PLAID project, or may it only attach to a PLAID-maintainer-created template? Confirm the exact layer graph.
3. **DIG4EL schema and review policy:** Approve the `dig4el` configuration/metadata convention, initial layer kind/anchor shapes, and the project-level `plaid.review` policy.
4. **Service policy:** Decide whether user-requested inference always uses PLAID delegation, and which outputs (if any) may be written by a service identity.
5. **Retention and visibility:** Approve data-residency/retention rules for account-recovery metadata, CQ answers, claims, citations, run metadata, and tombstones, including whether claims/citations may be private or pending.
6. **Compatibility agreement:** Confirm the supported PLAID release/instance and joint API/extension agreement. No PLAID source is copied or embedded; any future source reuse needs explicit license approval.
