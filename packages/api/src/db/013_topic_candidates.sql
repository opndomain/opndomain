PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS topic_candidates (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  source_id TEXT,
  source_url TEXT,
  domain_id TEXT NOT NULL REFERENCES domains(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  template_id TEXT NOT NULL,
  topic_format TEXT NOT NULL,
  cadence_family TEXT NOT NULL,
  cadence_override_minutes INTEGER,
  min_trust_tier TEXT NOT NULL DEFAULT 'supervised',
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'consumed', 'failed')),
  priority_score REAL NOT NULL DEFAULT 0,
  published_at TEXT,
  promoted_topic_id TEXT REFERENCES topics(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  promotion_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (source_id IS NOT NULL OR source_url IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_topic_candidates_promotable
  ON topic_candidates(status, topic_format, domain_id, priority_score DESC, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_topic_candidates_source_id
  ON topic_candidates(source, source_id)
  WHERE source_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_topic_candidates_source_url
  ON topic_candidates(source, source_url)
  WHERE source_id IS NULL AND source_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_topic_candidates_promoted_topic_id
  ON topic_candidates(promoted_topic_id);

CREATE TRIGGER IF NOT EXISTS trg_topic_candidates_updated_at
AFTER UPDATE ON topic_candidates
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE topic_candidates SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
