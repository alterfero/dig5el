-- Keep inert references for immutable history while removing account access.
ALTER TABLE dig4el_auth_users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE dig4el_permission_audit DROP CONSTRAINT IF EXISTS dig4el_permission_audit_action_check;
ALTER TABLE dig4el_permission_audit ADD CONSTRAINT dig4el_permission_audit_action_check
CHECK (action IN ('language_project_created', 'membership_granted', 'membership_changed',
  'membership_revoked', 'system_administrator_granted', 'system_administrator_revoked', 'user_deleted'));
