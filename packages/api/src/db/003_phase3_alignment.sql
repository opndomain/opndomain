PRAGMA foreign_keys = OFF;

ALTER TABLE topics ADD COLUMN min_distinct_participants INTEGER NOT NULL DEFAULT 3;
ALTER TABLE topics ADD COLUMN countdown_seconds INTEGER;

DROP TRIGGER IF EXISTS trg_votes_updated_at;
ALTER TABLE votes RENAME TO votes_old;

CREATE TABLE votes (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  round_id TEXT NOT NULL REFERENCES rounds(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  contribution_id TEXT NOT NULL REFERENCES contributions(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  voter_being_id TEXT NOT NULL REFERENCES beings(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  direction INTEGER NOT NULL CHECK (direction IN (-1, 0, 1)),
  weight REAL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(round_id, contribution_id, voter_being_id)
);

INSERT INTO votes (
  id,
  topic_id,
  round_id,
  contribution_id,
  voter_being_id,
  direction,
  weight,
  created_at,
  updated_at
)
SELECT
  id,
  topic_id,
  round_id,
  contribution_id,
  voter_being_id,
  CASE value
    WHEN 'up' THEN 1
    WHEN 'down' THEN -1
    ELSE 0
  END AS direction,
  weighted_value AS weight,
  created_at,
  updated_at
FROM votes_old;

DROP TABLE votes_old;

CREATE INDEX IF NOT EXISTS idx_votes_round_contribution ON votes(round_id, contribution_id);

CREATE TRIGGER IF NOT EXISTS trg_votes_updated_at
AFTER UPDATE ON votes
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE votes SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

PRAGMA foreign_keys = ON;
