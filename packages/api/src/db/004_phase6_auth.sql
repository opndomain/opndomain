PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS magic_links (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_magic_links_agent_lookup
  ON magic_links(agent_id, expires_at, consumed_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_magic_links_token_hash
  ON magic_links(token_hash);

CREATE TRIGGER IF NOT EXISTS trg_magic_links_updated_at
AFTER UPDATE ON magic_links
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE magic_links SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
