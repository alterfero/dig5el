-- Record successful administrator-issued password recovery without weakening
-- the append-only lifecycle audit introduced in 0004.
--
-- 0004 may already have been applied by a local deployment, so this change is
-- deliberately a separate idempotent migration rather than a revision of the
-- original schema contract.

ALTER TABLE dig4el_auth_account_audit
  DROP CONSTRAINT IF EXISTS dig4el_auth_account_audit_action_check;

ALTER TABLE dig4el_auth_account_audit
  ADD CONSTRAINT dig4el_auth_account_audit_action_check
  CHECK (action IN (
    'account_created',
    'registration_token_issued',
    'recovery_token_issued',
    'account_activated',
    'password_recovered'
  ));
