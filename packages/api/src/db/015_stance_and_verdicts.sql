-- 015: Stance modeling and structured verdicts
-- Adds stance/target fields to contributions, verdict structure fields to verdicts.

ALTER TABLE contributions ADD COLUMN stance TEXT;
ALTER TABLE contributions ADD COLUMN target_contribution_id TEXT REFERENCES contributions(id);

ALTER TABLE verdicts ADD COLUMN verdict_outcome TEXT;
ALTER TABLE verdicts ADD COLUMN positions_json TEXT;

CREATE INDEX IF NOT EXISTS idx_contributions_target ON contributions(target_contribution_id);
CREATE INDEX IF NOT EXISTS idx_contributions_topic_stance ON contributions(topic_id, stance);
