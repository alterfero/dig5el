# DIG4EL

DIG4EL is a welcoming workspace for people documenting language together. It is
being built as a standalone interface over PLAID’s canonical corpus model and
permissions, rather than as a replacement for PLAID.

## Current foundation

- Accessible, responsive React application shell with plain-language guidance.
- A same-origin backend-for-frontend boundary: browser code may call `/api/*`,
  while future PLAID REST calls are confined to `server/plaid-gateway.ts`.
- Server-only runtime configuration, structured redacted logs, safe JSON error
  envelopes, and public liveness/readiness endpoints.
- PLAID authentication and project connection are intentionally disabled until
  their hand-off and API contract are approved. No PLAID credential is exposed
  to browser code.

This foundation does **not** contain source-management or corpus-editing
features yet.

## Local development

1. Use Node.js 22.13 or later.
2. Install dependencies with `npm install`.
3. Copy `.env.example` to an ignored local environment file and set only the
   values needed for your local run. Keep `PLAID_AUTH_MODE=disabled`.
4. Run `npm run dev`.

Useful commands:

- `npm run typecheck` — TypeScript checks.
- `npm run lint` — lint checks.
- `npm test` — fast frontend and server unit tests.
- `npm run test:smoke` — build plus Worker health-page smoke tests.
- `npm run check` — all of the above.

## Runtime boundary

Only the Worker and `server/` modules can read runtime bindings. Use Worker
secrets for `SESSION_ENCRYPTION_KEY` and `PLAID_SERVICE_TOKEN`; never place them
in a `NEXT_PUBLIC_*`, `VITE_*`, or browser-accessible variable. `PLAID_BASE_URL`
is parsed as a pinned origin, with HTTPS required outside local development.

Public endpoints:

- `GET /api/health/live` — process liveness only.
- `GET /api/health/ready` — validated configuration and safe dependency state;
  it never contacts PLAID or reveals configuration values.

All API responses carry a generated request ID. Error responses are friendly
and generic by design; server logs are structured and redact credentials,
cookies, request bodies, and secret-shaped fields.

## Architecture record

The PLAID interoperability decision and future implementation plan are in:

- [PLAID interoperability ADR](docs/adr/0001-plaid-interoperability-boundary.md)
- [PLAID integration plan](docs/plans/0001-plaid-integration-plan.md)
