import { Pool } from "pg";
import type { SavedSource, Source, SourceSummary } from "../../lib/contribute/model";
import { summarizeSource } from "../../lib/contribute/model";
import type { LocalAuthRuntime } from "../auth/auth-runtime";

export interface ContributionStore {
  list(projectId: string): Promise<SourceSummary[]>;
  get(projectId: string, id: string): Promise<SavedSource | null>;
  put(projectId: string, source: Source, version: number, actorId: string): Promise<SavedSource | null>;
}

export class MemoryContributionStore implements ContributionStore {
  readonly records = new Map<string, SavedSource>();
  readonly audit: { projectId: string; sourceId: string; actorId: string; version: number }[] = [];
  async list(projectId: string) {
    return [...this.records.entries()].filter(([key]) => key.startsWith(`${projectId}/`)).map(([, record]) => summarizeSource(record));
  }
  async get(projectId: string, id: string) { return structuredClone(this.records.get(`${projectId}/${id}`) ?? null); }
  async put(projectId: string, source: Source, version: number, actorId: string) {
    const key = `${projectId}/${source.id}`;
    const previous = this.records.get(key);
    if ((previous?.version ?? 0) !== version) return null;
    const result = { source: structuredClone(source), version: version + 1, updatedAt: new Date().toISOString() };
    this.records.set(key, result);
    this.audit.push({ projectId, sourceId: source.id, actorId, version: result.version });
    return structuredClone(result);
  }
}

export class PostgresContributionStore implements ContributionStore {
  constructor(readonly pool: Pool) {}
  async list(projectId: string): Promise<SourceSummary[]> {
    // Fetch only list fields, never attachments or complete corpora into the sidebar.
    const result = await this.pool.query(`SELECT id, version, updated_at,
      payload->>'kind' AS kind, payload->>'title' AS title, payload->>'author' AS author,
      payload->>'originKind' AS origin_kind,
      jsonb_array_length(payload->'rows') AS row_count,
      (SELECT count(*)::int FROM jsonb_array_elements(payload->'rows') r WHERE btrim(r->>'translation') <> '' AND btrim(r->>'reference') <> '') AS translated_count,
      (SELECT count(*)::int FROM jsonb_array_elements(payload->'rows') r WHERE EXISTS
        (SELECT 1 FROM jsonb_array_elements(r->'links') l WHERE jsonb_array_length(l->'words') > 0)) AS linked_count,
      (SELECT count(*)::int FROM jsonb_array_elements(payload->'rows') r WHERE r->>'checked' = 'true') AS checked_count
      FROM dig4el_contribution_sources WHERE project_id = $1 ORDER BY updated_at, id`, [projectId]);
    return result.rows.map((row) => ({ id: row.id, kind: row.kind, title: row.title, author: row.author, originKind: row.origin_kind, rowCount: row.row_count, translatedCount: row.translated_count, linkedCount: row.linked_count, checkedCount: row.checked_count, version: row.version, updatedAt: row.updated_at.toISOString() }));
  }
  async get(projectId: string, id: string): Promise<SavedSource | null> {
    const result = await this.pool.query("SELECT payload, version, updated_at FROM dig4el_contribution_sources WHERE project_id = $1 AND id = $2", [projectId, id]);
    const row = result.rows[0];
    return row ? { source: row.payload, version: row.version, updatedAt: row.updated_at.toISOString() } : null;
  }
  async put(projectId: string, source: Source, version: number, actorId: string): Promise<SavedSource | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = version === 0
        ? await client.query(`INSERT INTO dig4el_contribution_sources (id, project_id, payload, version, created_by, updated_by)
          VALUES ($1, $2, $3, 1, $4, $4) ON CONFLICT (id) DO NOTHING RETURNING version, updated_at`, [source.id, projectId, JSON.stringify(source), actorId])
        : await client.query(`UPDATE dig4el_contribution_sources SET payload = $3, version = version + 1, updated_by = $4, updated_at = now()
          WHERE id = $1 AND project_id = $2 AND version = $5 RETURNING version, updated_at`, [source.id, projectId, JSON.stringify(source), actorId, version]);
      const row = result.rows[0];
      if (!row) { await client.query("ROLLBACK"); return null; }
      await client.query("INSERT INTO dig4el_contribution_audit (source_id, project_id, actor_id, version) VALUES ($1,$2,$3,$4)", [source.id, projectId, actorId, row.version]);
      await client.query("COMMIT");
      return { source, version: row.version, updatedAt: row.updated_at.toISOString() };
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
}

const stores = new WeakMap<LocalAuthRuntime, ContributionStore>();
export function contributionStore(runtime: LocalAuthRuntime): ContributionStore {
  let store = stores.get(runtime);
  if (!store) {
    store = runtime.persistence.persistent
      ? new PostgresContributionStore(new Pool({ connectionString: runtime.config.databaseUrl!.toString(), max: 3 }))
      : new MemoryContributionStore();
    stores.set(runtime, store);
  }
  return store;
}
