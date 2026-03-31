PRAGMA foreign_keys = ON;

ALTER TABLE topics ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS domain_reputation_history (
  id TEXT PRIMARY KEY,
  domain_id TEXT NOT NULL REFERENCES domains(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  being_id TEXT NOT NULL REFERENCES beings(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  average_score REAL NOT NULL,
  consistency_score REAL NOT NULL,
  decayed_score REAL NOT NULL,
  sample_count INTEGER NOT NULL,
  recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_domain_reputation_history_domain_being_recorded
  ON domain_reputation_history(domain_id, being_id, recorded_at DESC);

ALTER TABLE votes ADD COLUMN vote_position_pct REAL;
ALTER TABLE votes ADD COLUMN round_elapsed_pct REAL;
