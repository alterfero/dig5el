-- Allow the append-only local-permission audit to record a system
-- administrator revocation. The original global-role grant remains intact;
-- this migration only extends its finite action vocabulary.

ALTER TABLE dig4el_permission_audit
  DROP CONSTRAINT IF EXISTS dig4el_permission_audit_action_check;

ALTER TABLE dig4el_permission_audit
  ADD CONSTRAINT dig4el_permission_audit_action_check
  CHECK (action IN (
    'language_project_created',
    'membership_granted',
    'membership_changed',
    'membership_revoked',
    'system_administrator_granted',
    'system_administrator_revoked',
    'user_deleted'
  ));

-- Include user_deleted so the replay-based migration runner remains compatible
-- with deletion history written after migration 0008.
