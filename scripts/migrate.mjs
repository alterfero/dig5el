import { readdir, readFile } from "node:fs/promises";
import { Client } from "pg";

const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  console.error(
    "DATABASE_URL is required. Set it in .env.local (or export it in your shell) before applying DIG4EL database migrations.",
  );
  process.exitCode = 1;
} else {
  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    const migrationDirectory = new URL("../db/migrations/", import.meta.url);
    const migrationFiles = (await readdir(migrationDirectory))
      .filter((file) => /^\d{4}_[a-z0-9_]+\.sql$/iu.test(file))
      .sort();
    if (migrationFiles.length === 0) throw new Error("No database migrations found.");
    await client.query("BEGIN");
    for (const migrationFile of migrationFiles) {
      const migration = await readFile(new URL(migrationFile, migrationDirectory), "utf8");
      await client.query(migration);
    }
    await client.query("COMMIT");
    console.info("Applied DIG4EL database migrations.");
  } catch {
    try {
      await client.query("ROLLBACK");
    } catch {
      // The connection can fail before a transaction is open.
    }
    console.error("Migration failed. Check database connectivity and schema permissions.");
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => undefined);
  }
}
