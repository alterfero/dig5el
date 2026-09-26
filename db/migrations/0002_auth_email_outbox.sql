-- Durable deferred delivery for email-verification and password-reset links.
--
-- The raw action token is never stored directly. `encrypted_token` is an
-- authenticated server-side ciphertext and is cleared once the message is
-- delivered, superseded, expired, or abandoned after retry attempts.

CREATE TABLE IF NOT EXISTS dig4el_auth_email_outbox (
  id UUID PRIMARY KEY,
  action_token_id UUID NOT NULL UNIQUE
    REFERENCES dig4el_auth_action_tokens(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES dig4el_auth_users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('email_verification', 'password_reset')),
  recipient TEXT NOT NULL,
  encrypted_token TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  available_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  claim_token UUID,
  lease_expires_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  discarded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CHECK (claim_token IS NULL OR lease_expires_at IS NOT NULL),
  CHECK (delivered_at IS NULL OR encrypted_token IS NULL),
  CHECK (discarded_at IS NULL OR encrypted_token IS NULL)
);

CREATE INDEX IF NOT EXISTS dig4el_auth_email_outbox_pending_idx
  ON dig4el_auth_email_outbox (available_at, created_at)
  WHERE delivered_at IS NULL AND discarded_at IS NULL;

CREATE INDEX IF NOT EXISTS dig4el_auth_email_outbox_user_purpose_idx
  ON dig4el_auth_email_outbox (user_id, purpose)
  WHERE delivered_at IS NULL AND discarded_at IS NULL;
