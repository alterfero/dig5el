import { isSource, maximumSourceBytes, uuidPattern } from "../../lib/contribute/validation";
import { apiError } from "../http";
import { AuthRequestValidationError, requireAuthenticatedCsrf, requireAuthenticatedRoute, requireSameOrigin, responseWithAuthenticatedSession, runLocalAuthRoute, type AuthenticatedRouteContext } from "../auth/route-utils";
import { AuthorizationError } from "../auth/guards";
import { contributionStore } from "./store";
import type { Source } from "../../lib/contribute/model";

async function authorize(context: AuthenticatedRouteContext, projectId: string, write: boolean) {
  if (!uuidPattern.test(projectId)) throw new AuthRequestValidationError();
  const store = context.runtime.persistence.store;
  const membership = await store.findProjectMembership(projectId, context.session.user.id);
  const admin = await store.isSystemAdministrator(context.session.user.id);
  if (write ? !membership || membership.role === "reader" : !membership && !admin) throw new AuthorizationError();
  return membership;
}

async function readBody(request: Request): Promise<{ source: Source; version: number }> {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json" || !request.body) throw new AuthRequestValidationError();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximumSourceBytes) { await reader.cancel(); throw new AuthRequestValidationError(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  let body: unknown;
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new AuthRequestValidationError(); }
  if (!body || typeof body !== "object" || !("source" in body) || !("version" in body) || !isSource(body.source) || typeof body.version !== "number" || !Number.isSafeInteger(body.version) || body.version < 0) throw new AuthRequestValidationError();
  return { source: body.source, version: body.version };
}

export function sourceRoute(request: Request, projectId: string, sourceId?: string): Promise<Response> {
  return runLocalAuthRoute(request, "/api/contribute/projects/:projectId/sources", async (context) => {
    const write = request.method === "PUT";
    if (write) requireSameOrigin(context, request);
    const authenticated = await requireAuthenticatedRoute(context, request);
    if (write) requireAuthenticatedCsrf(authenticated, request);
    const membership = await authorize(authenticated, projectId, write);
    if (sourceId && !uuidPattern.test(sourceId)) throw new AuthRequestValidationError();
    const store = contributionStore(context.runtime);
    if (!sourceId) return responseWithAuthenticatedSession({ sources: await store.list(projectId), persistent: context.runtime.persistence.persistent }, authenticated);
    const previous = await store.get(projectId, sourceId);
    if (!write) return previous ? responseWithAuthenticatedSession(previous, authenticated) : apiError("NOT_FOUND", context.requestId);
    const { source, version } = await readBody(request);
    if (source.id !== sourceId) throw new AuthRequestValidationError();
    if (source.targetLanguage !== (await context.runtime.persistence.store.findLanguageProject(projectId))?.name) throw new AuthRequestValidationError();
    if (previous && (previous.source.kind !== source.kind || previous.source.originKind !== source.originKind)) throw new AuthRequestValidationError();
    const oldRows = new Map(previous?.source.rows.map((row) => [row.id, row]) ?? []);
    if (source.rows.some((row) => row.checked && !oldRows.get(row.id)?.checked) && !membership?.caretaker) throw new AuthorizationError();
    // Imported originals stay immutable; edits apply only to DIG4EL's working copy.
    if (previous) { source.original = previous.source.original; source.attachment = previous.source.attachment; }
    for (const row of source.rows) {
      const old = oldRows.get(row.id);
      if (old) {
        row.original = old.original;
        if (old.checked && JSON.stringify({ ...old, checked: false }) !== JSON.stringify({ ...row, checked: false })) row.checked = false;
      }
    }
    // A lost response may be retried safely without creating a second source/revision.
    if (previous && JSON.stringify(previous.source) === JSON.stringify(source)) return responseWithAuthenticatedSession(previous, authenticated);
    const saved = await store.put(projectId, source, version, authenticated.session.user.id);
    return saved ? responseWithAuthenticatedSession(saved, authenticated, version === 0 ? 201 : 200) : apiError("CONFLICT", context.requestId);
  });
}
