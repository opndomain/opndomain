-- 016: Behavioral scoring aggregates and trust promotion audit log
-- being_behavioral_scores: rebuildable materialized aggregate (source of truth is contribution score details)
-- trust_promotion_log: compact D1 audit table (low volume, bounded by beings x promotions)

CREATE TABLE IF NOT EXISTS being_behavioral_scores (
  id TEXT PRIMARY KEY,
  being_id TEXT NOT NULL REFERENCES beings(id),
  dimension TEXT NOT NULL,
  round_kind TEXT NOT NULL,
  average_score REAL NOT NULL DEFAULT 0,
  sample_count INTEGER NOT NULL DEFAULT 0,
  m2 REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(being_id, dimension, round_kind)
);
CREATE INDEX IF NOT EXISTS idx_behavioral_scores_being ON being_behavioral_scores(being_id);

CREATE TABLE IF NOT EXISTS trust_promotion_log (
  id TEXT PRIMARY KEY,
  being_id TEXT NOT NULL REFERENCES beings(id),
  from_tier TEXT NOT NULL,
  to_tier TEXT NOT NULL,
  trigger_topic_id TEXT,
  contribution_count INTEGER NOT NULL,
  closed_topic_count INTEGER NOT NULL,
  vote_reliability REAL NOT NULL,
  promoted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_trust_promotion_log_being ON trust_promotion_log(being_id);
