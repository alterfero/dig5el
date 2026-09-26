# DIG4EL

DIG4EL is a welcoming workspace for people documenting language together.
DIG4EL and PLAID projects currently remain independent: the Contribute page
imports exported PLAID files without connecting accounts or synchronizing data.
See [ADR 0002](docs/adr/0002-independent-projects-and-file-import.md).

## Current implementation

Status reviewed on **2026-09-25** against the local implementation. This is a
working local application; a production deployment has not been verified.
Start with the [current status and known limits](docs/status.md), the
[Contribute guide](docs/contribute.md), or the
[Contribute technical reference](docs/contribute-architecture.md).

- Accessible, responsive React application shell with plain-language guidance.
- A Next.js application with same-origin `/api/*` routes. The retained
  `server/plaid-gateway.ts` scaffold is inactive and has no product route.
- Server-only runtime configuration, structured redacted logs, safe JSON error
  envelopes, and public liveness/readiness endpoints.
- A separate DIG4EL account register with administrator-issued one-time setup
  and recovery codes, opaque server-side sessions, CSRF protection, and
  PostgreSQL persistence.
- An auditable DIG4EL language-project roster that controls both local
  administration and access to saved Contribute sources.
- A searchable WALS/Grambank language-name catalogue plus custom languages.
- Four stable Contribute tabs, inline source editors, file-import previews,
  explicit shared saving, and caretaker review.
- PLAID imports through exported files only. Direct connection, account
  linking, and synchronization are outside the current product scope.

The `/contribute` workspace supports questionnaires, sentence pairs, reference
documents, and PLAID exports. It uses the existing language-project roster for
DIG4EL permissions. Run `npm run db:migrate` to apply migration 0009 before using
shared source saving with PostgreSQL. Readers can view, writers and maintainers
can edit, and assigned language caretakers can mark examples reviewed. System
administrators can read all language spaces; editing and review still require
the corresponding project membership and caretaker capability.

PLAID import accepts the IGT editor's FieldWorks `.flextext` export without its
lexicon. CSV/TSV and v1 sentence-pair JSON are supported in Sentence pairs; v1
DCQ recordings can be imported as v1 JSON or completed Excel (`.xlsx`) templates
from the DCQ tab. The original Excel templates are available there as a ZIP.
Imports retain notes, pivot and literal translations, concept-to-word links,
and the original recording or workbook; they open as drafts for explicit saving.
Downloaded DIG4EL source copies can also be restored. PDF, DOCX,
and TXT reference files retain their originals. File previews stay in the
current browser page until explicitly saved. There is no persistent browser
corpus cache. An original upload is immutable after saving. Source updates use
optimistic concurrency checks and record the actor and revision in a save audit.

The interface does not simulate AI work: sentence augmentation, grammar
inference, and document search indexing are unavailable until processing
services are implemented. Stored documents can be downloaded; TXT files also
have an inline preview. Current limits are 10 MiB per ordinary imported file,
5,000 examples per source, and 20 MiB per save request including its original.
Downloaded source copies and legacy DCQ recordings have a 20 MiB upload limit.
See the guide for format-specific limits and recovery behavior.

## Local development

1. Use Node.js 22.13 or later.
2. Install dependencies with `npm install`.
3. Copy `.env.example` to `.env.local` and retain
   `DIG4EL_AUTH_MODE=disabled` for shell-only work.
4. Run `npm run dev`, then open `http://localhost:3000`.

Useful commands:

- `npm run typecheck` — TypeScript checks.
- `npm run lint` — lint checks.
- `npm test` — fast frontend and server unit tests.
- `npm run test:smoke` — production build plus local HTTP smoke tests.
- `npm run check` — all of the above.
- `npm run db:migrate` — apply the idempotent local account and
  language-project/contribution schema (migrations 0001–0009) to the database
  named by `DATABASE_URL`.

`npm test` skips the PostgreSQL contribution test unless `DATABASE_URL` is in
the process environment; Vitest does not automatically load `.env.local`.
Run that test explicitly against a configured local database with:

```sh
node --env-file=.env.local node_modules/vitest/vitest.mjs run tests/server/contribute-postgres.test.ts
```

It uses temporary tables on one dedicated connection and does not modify real
users, projects, or sources. It verifies the persistence adapter, not migration
installation or a complete authenticated browser workflow. The
[status page](docs/status.md#verification-record) records the latest results.

### Test local accounts and recovery

Full account testing needs only a local PostgreSQL database. You may use the
included optional service (`docker compose -f compose.local.yaml up -d`) or an
already-running PostgreSQL instance, then set these ignored
`.env.local` values:

```dotenv
DIG4EL_AUTH_MODE=local-password
DATABASE_URL=postgresql://dig4el:dig4el-local-password@localhost:5432/dig4el
SESSION_ENCRYPTION_KEY=<a unique base64url 32-byte value>
```

For a visual-only local-network preview, add the computer's current hostname
or IP address (without a scheme or port), for example:

```dotenv
DIG4EL_ALLOWED_DEV_ORIGINS=172.20.10.4
```

This only lets Next.js serve development assets to that explicit host. Keep
authenticated testing on `http://localhost:3000` unless you deliberately set
up HTTPS and a matching trusted application origin for the other device.

Generate the session key with:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Run `npm run db:migrate` before `npm run dev`. There is no public registration,
email activation, SMTP configuration, or public password-reset request. A
system administrator creates an account, receives a high-entropy setup code
once, and passes it to the person out of band. The person opens `/register`,
uses that code, and chooses their password. An administrator can issue a
single-use recovery code for an active account in the same way. A development
process may use its in-memory store when `DATABASE_URL` is absent, but it is
intentionally unavailable in staging and production.

The database commands also load `.env.local` automatically. They still need a
running PostgreSQL database and a non-empty `DATABASE_URL`; an empty value in
the example file is intentionally not enough.

### Bootstrap local language-project administration

The local language-project roster controls DIG4EL administration and saved
Contribute sources. It does not create, mirror, or authorize a PLAID project,
corpus, layer, or membership. File imports require no PLAID account in DIG4EL.

After `npm run db:migrate`, bootstrap the first local system administrator
through a terminal with database access:

```sh
npm run admin:bootstrap -- owner@example.test --confirm
```

The command requires the explicit `--confirm` flag. If the address has no
DIG4EL account, it creates a pending account, grants it system-administrator
access, and displays one setup token after the transaction commits. Copy that
token immediately: it is never stored in raw form or shown again. If the
account is already active, the command grants the capability without changing
its password. Account lifecycle and permission changes are audited. Do not use
this local capability as a substitute for PLAID administration.

After that initial bootstrap, a system administrator can open `/admin` to
manage local accounts. For each person, the administrator can choose the
local user type (standard user or system administrator) and the language
spaces for which they are a caretaker. Selecting a caretaker space grants the
minimum compatible local project role when needed; clearing it retains any
existing project role. The final active system administrator cannot be
demoted or deleted through the interface. Administrators can delete any other
account, including another administrator, after confirmation. Deletion removes
the account from the roster, revokes sessions, setup/recovery codes, memberships,
and linked identities, and clears its email and password. An inert account
reference remains for immutable audit history and project provenance. Existing
PostgreSQL installations must run `npm run db:migrate` to apply migration 0008
before using account deletion.

Within this local roster, `reader`, `writer`, and `maintainer` are the only
project roles. `caretaker` is a separately stored, audited language-project
capability that may accompany a writer or maintainer, never a fourth role or a
PLAID role. A global system administrator is another separate capability; it
does not automatically grant DIG4EL corpus editing or caretaker review.

To use Contribute after signing in, open `/admin`, create a language space as a
system administrator, and assign project access. Existing spaces may also be
managed by their maintainers. Then open `/contribute` and choose that space.
A redirect from `/contribute` to `/login` is expected without an active session.
There is no public demo or authentication-bypass preview route.

## Runtime boundary

Only Next.js server routes and modules under `server/` can read runtime
settings. Keep `SESSION_ENCRYPTION_KEY`, `DATABASE_URL`, and any PLAID secret
in server environment variables; never place them in
`NEXT_PUBLIC_*`, `VITE_*`, or other browser-accessible variables.

Local account identities are UUIDs owned by DIG4EL. Administrators create the
local email identifier and recipients activate it with a one-time code before
choosing a memory-hard password hash; their browser receives only an opaque
HTTP-only session cookie. A person can have a DIG4EL account, a PLAID account,
both, or neither. Matching email addresses never link them. No account-linking
flow is implemented or required for Contribute; a DIG4EL session never confers
PLAID project access.

The same rule applies to the local DIG4EL language-project roster: its
reader/writer/maintainer assignments and optional caretaker capability authorize
DIG4EL-local records. PLAID-origin files become independent DIG4EL copies with
these permissions. Importing does not import PLAID membership or review status.

The public account routes are same-origin JSON endpoints. Mutations validate a
pinned `Origin`; sign-out also requires a per-session HMAC CSRF proof. Cookies
are host-only (`__Host-`), `Secure`, `HttpOnly`, and `SameSite=Lax` outside
local development. Sessions expire after eight hours maximum and thirty
minutes of inactivity by default; the authenticated-session endpoint and
shared route helper roll the idle expiry. Administrator-issued recovery codes
are single-use and invalidate older sessions when redeemed.

Public endpoints:

- `GET /api/health/live` — process liveness only.
- `GET /api/health/ready` — validated configuration and safe dependency state;
  with local auth enabled, it also checks the account/session and administration
  schema without revealing diagnostics. It never contacts PLAID or exposes
  configuration values.

Readiness does **not** currently check migration 0009's contribution tables.
After migration/deployment, verify authenticated source listing and saving as
well as health endpoints. A green readiness response alone is insufficient to
confirm Contribute storage is installed.

All API responses carry a generated request ID. Error responses are friendly
and generic by design; server logs redact credentials, cookies, request bodies,
prompts, and secret-shaped fields. Security headers prevent framing and restrict
browser connections to the same origin.

## Interface languages

DIG4EL currently supports English and French. The compact globe control in the
top bar switches the interface; its choice is kept locally in the browser until
user settings are available. Shared text is kept in the typed catalogue
[`i18n/messages.ts`](i18n/messages.ts), with Contribute text in
[`i18n/contribute.ts`](i18n/contribute.ts), while
[`components/locale-provider.tsx`](components/locale-provider.tsx) supplies
the active language and updates the document language. To add a language,
register its code and native label, then provide its complete message set—the
type checker and localization test flag omissions. Icon-first controls retain
localized accessible names, tooltips, and visible mobile labels.

This first version deliberately uses a client-local preference: the initial
HTML and social metadata are English. When DIG4EL needs shareable localized
URLs or server-rendered preferences, add locale routes or a server-read cookie
and pass its validated value into the provider.

## Railway handoff

Railway can use the standard Node commands already in `package.json`:
`npm run build` and `npm run start`. Its `PORT` environment variable is honored
by `next start` automatically. Configure the Railway health check to
`/api/health/live`.

Set these server-side variables in Railway before production deployment:

- `DIG4EL_ENVIRONMENT=production`
- `DIG4EL_APP_ORIGIN=https://<your-railway-domain>`
- `DIG4EL_LOG_LEVEL=info`
- `DIG4EL_AUTH_MODE=local-password`
- `DATABASE_URL=<Railway PostgreSQL connection URL>`
- `SESSION_ENCRYPTION_KEY=<unique 32-byte base64url or hex value>`
- `DIG4EL_TRUST_PROXY=true` — only when Railway is the trusted reverse proxy
- `PLAID_AUTH_MODE=disabled`

Apply `npm run db:migrate` as the Railway pre-deploy/release command (or once
through its service shell) before turning on `DIG4EL_AUTH_MODE=local-password`.
Railway runs Node in production,
and DIG4EL fails closed if `DIG4EL_ENVIRONMENT` is neither `production` nor an
intentional `staging` deployment.

Leave `PLAID_BASE_URL` and `PLAID_SERVICE_TOKEN` unset. Runtime validation rejects
enabling direct PLAID authentication in this version. No deployment was made
or verified as part of the Contribute work; these are deployment instructions.

## Architecture record

The active decision is ADR 0002. The older API integration proposal is retained
for historical context and does not block current development:

- [Independent projects and file imports — accepted](docs/adr/0002-independent-projects-and-file-import.md)
- [PLAID interoperability ADR — superseded for current scope](docs/adr/0001-plaid-interoperability-boundary.md)
- [Direct PLAID integration plan — deferred](docs/plans/0001-plaid-integration-plan.md)
