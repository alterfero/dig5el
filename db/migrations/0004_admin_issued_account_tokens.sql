-- Administrator-issued local account setup and password-recovery capabilities.
--
-- DIG4EL intentionally does not send activation or recovery email. A system
-- administrator creates a pending account and receives one opaque code exactly
-- once in the HTTP/CLI response. The database stores only its one-way digest.
-- This migration preserves active legacy accounts, invalidates all old emailed
-- links, and turns legacy pending-verification accounts into pending accounts
-- that need a fresh administrator-issued setup code.

ALTER TABLE dig4el_auth_users
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;

-- The original status check is named deterministically by PostgreSQL for the
-- 0001 table definition. `IF EXISTS` also keeps re-runs harmless.
ALTER TABLE dig4el_auth_users
  DROP CONSTRAINT IF EXISTS dig4el_auth_users_status_check;

UPDATE dig4el_auth_users
SET activated_at = COALESCE(activated_at, email_verified_at, updated_at)
WHERE status = 'active'
  AND activated_at IS NULL;

UPDATE dig4el_auth_users
SET status = 'pending_activation',
    password_hash = NULL,
    updated_at = NOW()
WHERE status = 'pending_verification';

ALTER TABLE dig4el_auth_users
  ALTER COLUMN password_hash DROP NOT NULL;

ALTER TABLE dig4el_auth_users
  DROP CONSTRAINT IF EXISTS dig4el_auth_users_status_check;

ALTER TABLE dig4el_auth_users
  ADD CONSTRAINT dig4el_auth_users_status_check
  CHECK (status IN ('pending_activation', 'active', 'disabled'));

-- Emailed links are intentionally retired. Existing active users retain their
-- password and can sign in; an administrator can issue a fresh recovery code.
ALTER TABLE dig4el_auth_action_tokens
  DROP CONSTRAINT IF EXISTS dig4el_auth_action_tokens_purpose_check;

UPDATE dig4el_auth_action_tokens
SET used_at = COALESCE(used_at, NOW())
WHERE purpose IN ('email_verification', 'password_reset');

UPDATE dig4el_auth_action_tokens
SET purpose = CASE purpose
  WHEN 'email_verification' THEN 'account_registration'
  WHEN 'password_reset' THEN 'password_recovery'
  ELSE purpose
END;

ALTER TABLE dig4el_auth_action_tokens
  ADD COLUMN IF NOT EXISTS issued_by_user_id UUID
    REFERENCES dig4el_auth_users(id) ON DELETE RESTRICT;

ALTER TABLE dig4el_auth_action_tokens
  DROP CONSTRAINT IF EXISTS dig4el_auth_action_tokens_purpose_check;

ALTER TABLE dig4el_auth_action_tokens
  ADD CONSTRAINT dig4el_auth_action_tokens_purpose_check
  CHECK (purpose IN ('account_registration', 'password_recovery'));

CREATE INDEX IF NOT EXISTS dig4el_auth_action_tokens_issuer_idx
  ON dig4el_auth_action_tokens (issued_by_user_id, created_at DESC)
  WHERE issued_by_user_id IS NOT NULL;

-- No runtime code reads the legacy outbox after this migration. Clear the
-- ciphertext to ensure an old server process cannot disclose a retired code.
ALTER TABLE dig4el_auth_email_outbox
  DROP CONSTRAINT IF EXISTS dig4el_auth_email_outbox_purpose_check;

UPDATE dig4el_auth_email_outbox
SET purpose = CASE purpose
      WHEN 'email_verification' THEN 'account_registration'
      WHEN 'password_reset' THEN 'password_recovery'
      ELSE purpose
    END,
    claim_token = NULL,
    encrypted_token = NULL,
    lease_expires_at = NULL,
    discarded_at = CASE
      WHEN delivered_at IS NULL THEN COALESCE(discarded_at, NOW())
      ELSE discarded_at
    END,
    updated_at = NOW()
WHERE purpose IN ('email_verification', 'password_reset');

ALTER TABLE dig4el_auth_email_outbox
  DROP CONSTRAINT IF EXISTS dig4el_auth_email_outbox_purpose_check;

ALTER TABLE dig4el_auth_email_outbox
  ADD CONSTRAINT dig4el_auth_email_outbox_purpose_check
  CHECK (purpose IN ('account_registration', 'password_recovery'));

-- Security-sensitive account lifecycle events are append-only too. Metadata
-- is intentionally limited by application code to non-secret context such as
-- action purpose and expiry; raw codes, code hashes, passwords, and sessions
-- must never be stored here.
CREATE TABLE IF NOT EXISTS dig4el_auth_account_audit (
  id UUID PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL,
  action TEXT NOT NULL CHECK (action IN (
    'account_created',
    'registration_token_issued',
    'recovery_token_issued',
    'account_activated'
  )),
  actor_user_id UUID
    REFERENCES dig4el_auth_users(id) ON DELETE RESTRICT,
  target_user_id UUID NOT NULL
    REFERENCES dig4el_auth_users(id) ON DELETE RESTRICT,
  request_id TEXT CHECK (request_id IS NULL OR char_length(request_id) BETWEEN 1 AND 128),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS dig4el_auth_account_audit_target_idx
  ON dig4el_auth_account_audit (target_user_id, occurred_at DESC, id DESC);

CREATE OR REPLACE FUNCTION dig4el_reject_auth_account_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'dig4el_auth_account_audit is immutable';
END;
$$;

DROP TRIGGER IF EXISTS dig4el_auth_account_audit_immutable
  ON dig4el_auth_account_audit;

CREATE TRIGGER dig4el_auth_account_audit_immutable
  BEFORE UPDATE OR DELETE ON dig4el_auth_account_audit
  FOR EACH ROW
  EXECUTE FUNCTION dig4el_reject_auth_account_audit_mutation();
