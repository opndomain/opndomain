CREATE TABLE IF NOT EXISTS refinement_claims (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  claim_text TEXT NOT NULL,
  classification TEXT,
  source_quote TEXT,
  promoted_topic_id TEXT REFERENCES topics(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_refinement_claims_topic_id ON refinement_claims(topic_id);
CREATE INDEX IF NOT EXISTS idx_refinement_claims_promoted ON refinement_claims(promoted_topic_id);
CREATE INDEX IF NOT EXISTS idx_refinement_claims_unrefined ON refinement_claims(promoted_topic_id) WHERE promoted_topic_id IS NULL;

ALTER TABLE topic_candidates ADD COLUMN source_claim_id TEXT REFERENCES refinement_claims(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_topic_candidates_source_claim_id ON topic_candidates(source_claim_id);
