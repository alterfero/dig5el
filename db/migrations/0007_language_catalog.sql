-- The WALS/Grambank baseline is a generated, immutable application asset.
-- This table holds only languages added after that baseline, including the
-- person and time that established each new shared language record.

CREATE TABLE IF NOT EXISTS dig4el_custom_languages (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL CHECK (btrim(name) <> '' AND octet_length(name) <= 160),
  normalized_name TEXT NOT NULL CHECK (
    btrim(normalized_name) <> '' AND octet_length(normalized_name) <= 160
  ),
  region_or_country TEXT NOT NULL CHECK (
    btrim(region_or_country) <> '' AND octet_length(region_or_country) <= 160
  ),
  created_by_user_id UUID NOT NULL
    REFERENCES dig4el_auth_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS dig4el_custom_languages_normalized_name_key
  ON dig4el_custom_languages (normalized_name);

CREATE INDEX IF NOT EXISTS dig4el_custom_languages_search_idx
  ON dig4el_custom_languages (normalized_name, name, id);

-- Existing local language spaces retain their display-name-only records. New
-- ones save the selected immutable catalog or custom-language reference.
ALTER TABLE dig4el_language_projects
  ADD COLUMN IF NOT EXISTS language_key TEXT;

CREATE INDEX IF NOT EXISTS dig4el_language_projects_language_key_idx
  ON dig4el_language_projects (language_key)
  WHERE language_key IS NOT NULL;
