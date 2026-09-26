import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { PostgresContributionStore } from "../../server/contribute/store";
import { emptySentence, newSource } from "../../lib/contribute/model";

// Opt-in integration test. Temporary tables shadow production names only on
// this one dedicated connection; no real project, user or source is touched.
describe.skipIf(!process.env.DATABASE_URL)("PostgreSQL contribution persistence", () => {
  it("round-trips sources, lists bounded metadata, audits saves, and enforces versions", async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    try {
      await pool.query(`CREATE TEMP TABLE dig4el_contribution_sources (
        id uuid PRIMARY KEY, project_id uuid NOT NULL, payload jsonb NOT NULL,
        version integer NOT NULL, created_by uuid, updated_by uuid,
        updated_at timestamptz NOT NULL DEFAULT now());
        CREATE TEMP TABLE dig4el_contribution_audit (
          source_id uuid, project_id uuid, actor_id uuid, version integer,
          occurred_at timestamptz DEFAULT now(), UNIQUE(source_id, version));`);
      const store = new PostgresContributionStore(pool);
      const projectId = crypto.randomUUID(), actorId = crypto.randomUUID();
      const source = { ...newSource("pairs", "Test language", "Test source"), rows: [{ ...emptySentence(), translation: "sample", reference: "example", links: [{ concept: "test", words: [0] }] }] };
      expect(await store.put(projectId, source, 0, actorId)).toMatchObject({ version: 1 });
      expect(await store.put(projectId, source, 0, actorId)).toBeNull();
      expect(await store.get(crypto.randomUUID(), source.id)).toBeNull();
      expect(await store.list(projectId)).toMatchObject([{ rowCount: 1, translatedCount: 1, linkedCount: 1, checkedCount: 0 }]);
      expect(await store.put(projectId, { ...source, title: "Updated" }, 1, actorId)).toMatchObject({ version: 2 });
      expect(await store.put(projectId, source, 1, actorId)).toBeNull();
      expect(await store.get(projectId, source.id)).toMatchObject({ source: { title: "Updated" }, version: 2 });
      const audit = await pool.query("SELECT * FROM dig4el_contribution_audit ORDER BY version");
      expect(audit.rows.map((row) => row.version)).toEqual([1, 2]);
    } finally { await pool.end(); }
  });
});
