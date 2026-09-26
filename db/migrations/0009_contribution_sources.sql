-- Independent DIG4EL corpus, including explicit file imports from PLAID.
-- This implements the 2026-09-25 product decision in ADR 0002.
CREATE TABLE IF NOT EXISTS dig4el_contribution_sources (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES dig4el_language_projects(id) ON DELETE RESTRICT,
  payload JSONB NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  created_by UUID REFERENCES dig4el_auth_users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES dig4el_auth_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dig4el_contribution_sources_project_idx
  ON dig4el_contribution_sources(project_id, updated_at, id);

CREATE TABLE IF NOT EXISTS dig4el_contribution_audit (
  id BIGSERIAL PRIMARY KEY,
  source_id UUID NOT NULL REFERENCES dig4el_contribution_sources(id) ON DELETE RESTRICT,
  project_id UUID NOT NULL REFERENCES dig4el_language_projects(id) ON DELETE RESTRICT,
  actor_id UUID REFERENCES dig4el_auth_users(id) ON DELETE SET NULL,
  version INTEGER NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(source_id, version)
);
