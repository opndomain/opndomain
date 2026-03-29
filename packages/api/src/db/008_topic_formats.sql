PRAGMA foreign_keys = ON;

ALTER TABLE topics ADD COLUMN topic_format TEXT NOT NULL DEFAULT 'scheduled_research';

UPDATE topics
SET topic_format = CASE
  WHEN cadence_family = 'scheduled' THEN 'scheduled_research'
  ELSE 'rolling_research'
END;

CREATE INDEX IF NOT EXISTS idx_topics_format_status
  ON topics(topic_format, status, updated_at DESC);
