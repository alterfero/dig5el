import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sourceRoute } from "../../server/contribute/routes";
import { contributionStore, MemoryContributionStore } from "../../server/contribute/store";
import { getLocalAuthRuntime, resetLocalAuthRuntimeForTests } from "../../server/auth/auth-runtime";
import { emptySentence, newSource, type Source } from "../../lib/contribute/model";

const projectId = "00000000-0000-4000-8000-000000000101";
const otherProjectId = "00000000-0000-4000-8000-000000000102";
const userIds = { owner: "00000000-0000-4000-8000-000000000201", writer: "00000000-0000-4000-8000-000000000202", reader: "00000000-0000-4000-8000-000000000203", outsider: "00000000-0000-4000-8000-000000000204" };
type Session = { cookieValue: string; csrfToken: string };
let sessions: Record<keyof typeof userIds, Session>;
let source: Source;
const keys = ["DIG4EL_APP_ORIGIN", "DIG4EL_AUTH_MODE", "DIG4EL_ENVIRONMENT", "DIG4EL_LOG_LEVEL", "DIG4EL_TRUST_PROXY", "PLAID_AUTH_MODE", "SESSION_ENCRYPTION_KEY", "DATABASE_URL", "AUTH_SESSION_TTL_SECONDS"];
const originalEnvironment = new Map<string, string | undefined>();

function req(method: string, session?: Session, body?: unknown, csrf = true) {
  return new Request(`http://localhost:3000/api/contribute/projects/${projectId}/sources/${source.id}`, {
    method, headers: { origin: "http://localhost:3000", "content-type": "application/json", ...(session ? { cookie: `dig4el_session=${session.cookieValue}` } : {}), ...(csrf && session ? { "x-dig4el-csrf": session.csrfToken } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(async () => {
  await resetLocalAuthRuntimeForTests();
  keys.forEach((key) => originalEnvironment.set(key, process.env[key]));
  Object.assign(process.env, { DIG4EL_APP_ORIGIN: "http://localhost:3000", DIG4EL_AUTH_MODE: "local-password", DIG4EL_ENVIRONMENT: "development", DIG4EL_LOG_LEVEL: "silent", DIG4EL_TRUST_PROXY: "false", PLAID_AUTH_MODE: "disabled", SESSION_ENCRYPTION_KEY: "f".repeat(64) });
  delete process.env.DATABASE_URL; delete process.env.AUTH_SESSION_TTL_SECONDS;
  const runtime = getLocalAuthRuntime(), store = runtime.persistence.store, now = new Date();
  sessions = {} as typeof sessions;
  for (const [name, id] of Object.entries(userIds)) {
    await store.createUser({ activatedAt: now, email: `${name}@example.test`, id, now, passwordHash: "unused-test-hash", status: "active" });
    sessions[name as keyof typeof userIds] = await runtime.sessions.issue(id);
  }
  await store.bootstrapSystemAdministrator({ now, requestId: "test-bootstrap", targetEmail: "owner@example.test" });
  await store.createLanguageProject({ actorUserId: userIds.owner, id: projectId, languageKey: "catalog:Tahitian", name: "Tahitian", now, requestId: "test-create" });
  await store.createLanguageProject({ actorUserId: userIds.owner, id: otherProjectId, languageKey: "catalog:Nafsan", name: "Nafsan", now, requestId: "test-create-other" });
  for (const role of ["writer", "reader"] as const) await store.grantProjectMembership({ actorUserId: userIds.owner, caretaker: false, projectId, role, targetEmail: `${role}@example.test`, now, requestId: `test-${role}` });
  source = { ...newSource("pairs", "Tahitian", "Test collection"), rows: [{ ...emptySentence(), reference: "one", translation: "test" }], original: { keep: "unchanged" } };
});
afterEach(async () => {
  await resetLocalAuthRuntimeForTests();
  for (const [key, value] of originalEnvironment) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  originalEnvironment.clear();
});

describe("independent DIG4EL source routes", () => {
  it("requires authentication, project membership, write permission, and CSRF", async () => {
    expect((await sourceRoute(req("GET"), projectId)).status).toBe(401);
    expect((await sourceRoute(req("GET", sessions.outsider), projectId)).status).toBe(403);
    expect((await sourceRoute(req("PUT", sessions.reader, { source, version: 0 }), projectId, source.id)).status).toBe(403);
    expect((await sourceRoute(req("PUT", sessions.writer, { source, version: 0 }, false), projectId, source.id)).status).toBe(403);
    expect((await sourceRoute(req("PUT", sessions.writer, { source, version: 0 }), otherProjectId, source.id)).status).toBe(403);
    expect((await sourceRoute(req("GET", sessions.reader), projectId)).status).toBe(200);
  });
  it("saves and reloads sources, audits once on retry, and rejects stale edits", async () => {
    const saved = await sourceRoute(req("PUT", sessions.writer, { source, version: 0 }), projectId, source.id);
    expect(saved.status).toBe(201);
    expect((await sourceRoute(req("PUT", sessions.writer, { source, version: 0 }), projectId, source.id)).status).toBe(200);
    const list = await (await sourceRoute(req("GET", sessions.reader), projectId)).json();
    expect(list.data.sources[0]).toMatchObject({ title: "Test collection", version: 1, translatedCount: 1 });
    expect(list.data.sources[0].original).toBeUndefined();
    const read = await (await sourceRoute(req("GET", sessions.reader), projectId, source.id)).json();
    expect(read.data.source.original).toEqual({ keep: "unchanged" });
    const edited = { ...source, title: "Updated", original: { injected: true } };
    expect((await sourceRoute(req("PUT", sessions.writer, { source: edited, version: 1 }), projectId, source.id)).status).toBe(200);
    const stale = await sourceRoute(req("PUT", sessions.writer, { source: { ...source, title: "Stale" }, version: 1 }), projectId, source.id);
    expect(stale.status).toBe(409);
    const store = contributionStore(getLocalAuthRuntime()) as MemoryContributionStore;
    expect(store.audit).toHaveLength(2);
    expect((await store.get(projectId, source.id))?.source.original).toEqual({ keep: "unchanged" });
  });
  it("does not inherit PLAID review or allow a writer to approve their own import", async () => {
    source.rows[0].checked = true;
    expect((await sourceRoute(req("PUT", sessions.writer, { source, version: 0 }), projectId, source.id)).status).toBe(403);
    expect((await sourceRoute(req("PUT", sessions.owner, { source, version: 0 }), projectId, source.id)).status).toBe(201);
    source.rows[0].translation = "edited";
    const response = await sourceRoute(req("PUT", sessions.writer, { source, version: 1 }), projectId, source.id);
    expect(response.status).toBe(200);
    expect((await response.json()).data.source.rows[0].checked).toBe(false);
  });
  it("validates source identity, language, and annotation positions", async () => {
    const wrongLanguage = { ...source, targetLanguage: "Nafsan" };
    expect((await sourceRoute(req("PUT", sessions.writer, { source: wrongLanguage, version: 0 }), projectId, source.id)).status).toBe(400);
    source.rows[0].links = [{ concept: "invalid position", words: [200] }];
    expect((await sourceRoute(req("PUT", sessions.writer, { source, version: 0 }), projectId, source.id)).status).toBe(400);
  });
});
