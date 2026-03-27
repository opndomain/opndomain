PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id TEXT PRIMARY KEY,
  actor_agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE topics ADD COLUMN archived_at TEXT;
ALTER TABLE topics ADD COLUMN archived_by_agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE topics ADD COLUMN archive_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target_created
  ON admin_audit_log(target_type, target_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_topics_archived_at
  ON topics(archived_at, updated_at DESC);
