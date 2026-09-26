-- Local DIG4EL language-project administration.
--
-- These records deliberately govern only the DIG4EL application boundary.
-- They are not PLAID projects, PLAID memberships, or corpus permissions. Any
-- future PLAID operation must still re-check authorization with PLAID.

DO $$
BEGIN
  CREATE TYPE dig4el_project_role AS ENUM ('reader', 'writer', 'maintainer');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS dig4el_language_projects (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL CHECK (btrim(name) <> '' AND octet_length(name) <= 160),
  created_by_user_id UUID NOT NULL
    REFERENCES dig4el_auth_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS dig4el_language_projects_name_idx
  ON dig4el_language_projects (name, id);

-- `caretaker` is a separate project capability, never a fourth role. It can
-- accompany a writer or maintainer assignment only.
CREATE TABLE IF NOT EXISTS dig4el_language_project_memberships (
  project_id UUID NOT NULL
    REFERENCES dig4el_language_projects(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL
    REFERENCES dig4el_auth_users(id) ON DELETE RESTRICT,
  role dig4el_project_role NOT NULL,
  caretaker BOOLEAN NOT NULL DEFAULT FALSE,
  granted_by_user_id UUID NOT NULL
    REFERENCES dig4el_auth_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (project_id, user_id),
  CHECK (NOT caretaker OR role IN ('writer', 'maintainer'))
);

CREATE INDEX IF NOT EXISTS dig4el_language_project_memberships_user_idx
  ON dig4el_language_project_memberships (user_id, project_id);

CREATE INDEX IF NOT EXISTS dig4el_language_project_memberships_maintainer_idx
  ON dig4el_language_project_memberships (project_id)
  WHERE role = 'maintainer';

-- A global operational capability, intentionally separate from all project
-- roles and from every PLAID identity or permission.
CREATE TABLE IF NOT EXISTS dig4el_system_administrators (
  user_id UUID PRIMARY KEY
    REFERENCES dig4el_auth_users(id) ON DELETE RESTRICT,
  granted_at TIMESTAMPTZ NOT NULL,
  granted_by_user_id UUID
    REFERENCES dig4el_auth_users(id) ON DELETE RESTRICT
);

-- Permission history is append-only. It stores only local project/access
-- state snapshots, never secrets, sessions, passwords, or PLAID tokens.
CREATE TABLE IF NOT EXISTS dig4el_permission_audit (
  id UUID PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL,
  action TEXT NOT NULL CHECK (action IN (
    'language_project_created',
    'membership_granted',
    'membership_changed',
    'membership_revoked',
    'system_administrator_granted'
  )),
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('user', 'bootstrap')),
  actor_user_id UUID REFERENCES dig4el_auth_users(id) ON DELETE RESTRICT,
  target_user_id UUID REFERENCES dig4el_auth_users(id) ON DELETE RESTRICT,
  project_id UUID REFERENCES dig4el_language_projects(id) ON DELETE RESTRICT,
  old_state JSONB NOT NULL,
  new_state JSONB NOT NULL,
  request_id TEXT NOT NULL CHECK (char_length(request_id) BETWEEN 1 AND 128),
  CHECK (
    (actor_kind = 'user' AND actor_user_id IS NOT NULL) OR
    (actor_kind = 'bootstrap' AND actor_user_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS dig4el_permission_audit_project_idx
  ON dig4el_permission_audit (project_id, occurred_at DESC, id DESC)
  WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS dig4el_permission_audit_target_idx
  ON dig4el_permission_audit (target_user_id, occurred_at DESC, id DESC)
  WHERE target_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION dig4el_reject_permission_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'dig4el_permission_audit is immutable';
END;
$$;

DROP TRIGGER IF EXISTS dig4el_permission_audit_immutable
  ON dig4el_permission_audit;

CREATE TRIGGER dig4el_permission_audit_immutable
  BEFORE UPDATE OR DELETE ON dig4el_permission_audit
  FOR EACH ROW
  EXECUTE FUNCTION dig4el_reject_permission_audit_mutation();
