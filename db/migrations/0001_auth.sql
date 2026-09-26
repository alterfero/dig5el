-- DIG4EL local-account authentication boundary.
--
-- Apply this migration to the PostgreSQL database named by DATABASE_URL before
-- enabling local authentication in staging or production. It is idempotent on
-- a fresh database and intentionally stores no PLAID password, token, role,
-- project membership, or corpus data.

CREATE TABLE IF NOT EXISTS dig4el_auth_users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending_verification', 'active', 'disabled')),
  email_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS dig4el_auth_action_tokens (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES dig4el_auth_users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('email_verification', 'password_reset')),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS dig4el_auth_action_tokens_active_idx
  ON dig4el_auth_action_tokens (user_id, purpose, expires_at)
  WHERE used_at IS NULL;

-- The database sees only a server-keyed HMAC digest of the 256-bit cookie capability.
CREATE TABLE IF NOT EXISTS dig4el_auth_sessions (
  id_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES dig4el_auth_users(id) ON DELETE CASCADE,
  issued_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  absolute_expires_at TIMESTAMPTZ NOT NULL,
  CHECK (expires_at <= absolute_expires_at)
);

CREATE INDEX IF NOT EXISTS dig4el_auth_sessions_expiry_idx
  ON dig4el_auth_sessions (expires_at);

CREATE INDEX IF NOT EXISTS dig4el_auth_sessions_user_idx
  ON dig4el_auth_sessions (user_id);

-- Rate-limit buckets are HMAC digests of an account identifier or trusted
-- proxy-provided client address. Raw IP addresses are not persisted here.
CREATE TABLE IF NOT EXISTS dig4el_auth_rate_limits (
  bucket_hash TEXT PRIMARY KEY,
  window_started_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL CHECK (attempts > 0),
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS dig4el_auth_rate_limits_updated_idx
  ON dig4el_auth_rate_limits (updated_at);

-- This is an optional future connection, not a duplicate PLAID account. A
-- PLAID principal may link to at most one DIG4EL user on a given instance.
CREATE TABLE IF NOT EXISTS dig4el_auth_plaid_identity_links (
  user_id UUID NOT NULL REFERENCES dig4el_auth_users(id) ON DELETE CASCADE,
  plaid_instance_id TEXT NOT NULL,
  plaid_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (plaid_instance_id, plaid_user_id)
);

CREATE INDEX IF NOT EXISTS dig4el_auth_plaid_identity_links_user_idx
  ON dig4el_auth_plaid_identity_links (user_id);
