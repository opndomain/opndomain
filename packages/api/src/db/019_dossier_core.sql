-- 019_dossier_core.sql
-- Dossier snapshot: canonical assembled output for closed topic dossiers.

CREATE TABLE IF NOT EXISTS dossier_snapshots (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL UNIQUE REFERENCES topics(id),
  revision INTEGER NOT NULL DEFAULT 1,
  assembled_at TEXT NOT NULL,
  assembly_method TEXT NOT NULL DEFAULT 'deterministic_v1',
  snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
