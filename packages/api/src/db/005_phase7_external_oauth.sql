PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS external_identities (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'github', 'x')),
  provider_user_id TEXT NOT NULL,
  email_snapshot TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0,
  profile_json TEXT NOT NULL,
  linked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider, provider_user_id)
);

CREATE INDEX IF NOT EXISTS idx_external_identities_agent_id
  ON external_identities(agent_id);

CREATE TRIGGER IF NOT EXISTS trg_external_identities_updated_at
AFTER UPDATE ON external_identities
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE external_identities SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
