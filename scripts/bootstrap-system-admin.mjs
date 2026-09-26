import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Client } from "pg";

const [emailArgument, confirmation, ...extra] = process.argv.slice(2);
const email = emailArgument?.trim().toLowerCase();
const databaseUrl = process.env.DATABASE_URL?.trim();
const registrationLifetimeMs = 7 * 24 * 60 * 60 * 1000;

function usage() {
  console.error("Usage: npm run admin:bootstrap -- owner@example.test --confirm");
  process.exitCode = 1;
}

function isSafeEmail(value) {
  return value && value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value);
}

function registrationTokenHash(token) {
  return createHash("sha256")
    .update("dig4el.auth.action.account_registration.v1\0", "utf8")
    .update(token, "utf8")
    .digest("base64url");
}

if (!isSafeEmail(email) || extra.length > 0 || confirmation !== "--confirm") {
  usage();
} else if (!databaseUrl) {
  console.error(
    "DATABASE_URL is required. Set it in .env.local (or export it in your shell) before bootstrapping a DIG4EL system administrator.",
  );
  process.exitCode = 1;
} else {
  let validDatabaseUrl = false;
  try {
    const parsed = new URL(databaseUrl);
    validDatabaseUrl = parsed.protocol === "postgres:" || parsed.protocol === "postgresql:";
  } catch {
    // The generic configuration message below is intentionally enough here.
  }

  if (!validDatabaseUrl) {
    console.error("DATABASE_URL must be a PostgreSQL URL.");
    process.exitCode = 1;
  } else {
    const client = new Client({ connectionString: databaseUrl });
    let displayedSetupToken = null;
    let createdPendingAccount = false;
    let grantedAdministrator = false;
    try {
      await client.connect();
      await client.query("BEGIN");
      const now = new Date();
      const existing = await client.query(
        `
          SELECT id, status
          FROM dig4el_auth_users
          WHERE email = $1
          FOR UPDATE
        `,
        [email],
      );

      let userId;
      let status;
      if (existing.rows[0]) {
        ({ id: userId, status } = existing.rows[0]);
        if (status === "disabled") throw new Error("DISABLED_ACCOUNT");
      } else {
        userId = randomUUID();
        status = "pending_activation";
        createdPendingAccount = true;
        await client.query(
          `
            INSERT INTO dig4el_auth_users
              (id, email, password_hash, status, activated_at, created_at, updated_at)
            VALUES ($1, $2, NULL, 'pending_activation', NULL, $3, $3)
          `,
          [userId, email, now],
        );
        await client.query(
          `
            INSERT INTO dig4el_auth_account_audit
              (id, occurred_at, action, actor_user_id, target_user_id, request_id, metadata)
            VALUES ($1, $2, 'account_created', NULL, $3, $4, $5::jsonb)
          `,
          [
            randomUUID(),
            now,
            userId,
            `bootstrap_${randomUUID().replaceAll("-", "")}`,
            JSON.stringify({ status: "pending_activation" }),
          ],
        );
      }

      const inserted = await client.query(
        `
          INSERT INTO dig4el_system_administrators
            (user_id, granted_at, granted_by_user_id)
          VALUES ($1, $2, NULL)
          ON CONFLICT (user_id) DO NOTHING
          RETURNING user_id
        `,
        [userId, now],
      );
      grantedAdministrator = inserted.rows.length > 0;
      if (grantedAdministrator) {
        await client.query(
          `
            INSERT INTO dig4el_permission_audit
              (id, occurred_at, action, actor_kind, actor_user_id, target_user_id,
               project_id, old_state, new_state, request_id)
            VALUES ($1, $2, 'system_administrator_granted', 'bootstrap', NULL, $3,
                    NULL, $4::jsonb, $5::jsonb, $6)
          `,
          [
            randomUUID(),
            now,
            userId,
            JSON.stringify({ systemAdministrator: false }),
            JSON.stringify({ systemAdministrator: true }),
            `bootstrap_${randomUUID().replaceAll("-", "")}`,
          ],
        );
      }

      // A pending administrator needs a fresh setup token. Re-running this
      // command intentionally replaces a lost one and invalidates any prior
      // unused token for that account.
      if (status === "pending_activation") {
        const token = randomBytes(32).toString("base64url");
        const expiresAt = new Date(now.getTime() + registrationLifetimeMs);
        await client.query(
          `
            UPDATE dig4el_auth_action_tokens
            SET used_at = $2
            WHERE user_id = $1
              AND purpose = 'account_registration'
              AND used_at IS NULL
          `,
          [userId, now],
        );
        await client.query(
          `
            INSERT INTO dig4el_auth_action_tokens
              (id, user_id, purpose, token_hash, expires_at, used_at, created_at, issued_by_user_id)
            VALUES ($1, $2, 'account_registration', $3, $4, NULL, $5, NULL)
          `,
          [randomUUID(), userId, registrationTokenHash(token), expiresAt, now],
        );
        await client.query(
          `
            INSERT INTO dig4el_auth_account_audit
              (id, occurred_at, action, actor_user_id, target_user_id, request_id, metadata)
            VALUES ($1, $2, 'registration_token_issued', NULL, $3, $4, $5::jsonb)
          `,
          [
            randomUUID(),
            now,
            userId,
            `bootstrap_${randomUUID().replaceAll("-", "")}`,
            JSON.stringify({ expiresAt: expiresAt.toISOString(), purpose: "account_registration" }),
          ],
        );
        displayedSetupToken = { expiresAt, token };
      }

      await client.query("COMMIT");
      if (createdPendingAccount) {
        console.info("Created a pending DIG4EL account and granted system-administrator access.");
      } else if (grantedAdministrator) {
        console.info("DIG4EL system-administrator access granted and audited.");
      } else {
        console.info("That DIG4EL account is already a system administrator; no permission change was made.");
      }
      if (displayedSetupToken) {
        console.info("\nCopy this setup token now. It is displayed only once and expires at:");
        console.info(displayedSetupToken.expiresAt.toISOString());
        console.info(displayedSetupToken.token);
      }
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // The connection can fail before a transaction opens.
      }
      if (error instanceof Error && error.message === "DISABLED_ACCOUNT") {
        console.error("That DIG4EL account is disabled and cannot be bootstrapped.");
      } else {
        console.error("System-administrator bootstrap failed. Run database migrations and check database access.");
      }
      process.exitCode = 1;
    } finally {
      await client.end().catch(() => undefined);
    }
  }
}
