ALTER TABLE topics ADD COLUMN parent_topic_id TEXT REFERENCES topics(id) ON DELETE SET NULL;
ALTER TABLE topics ADD COLUMN refinement_depth INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_topics_parent_topic_id ON topics(parent_topic_id);

ALTER TABLE verdicts ADD COLUMN refinement_status_json TEXT;

CREATE TABLE IF NOT EXISTS topic_refinement_context (
  topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  sequence_index INTEGER NOT NULL,
  prior_round_context TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (topic_id, sequence_index)
);
