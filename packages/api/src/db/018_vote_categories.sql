PRAGMA foreign_keys = OFF;

-- Phase 20: Vote categories migration
-- Replace simple up/down votes with categorical votes:
-- most_interesting, most_correct, fabrication (plus legacy for backfill).

DROP TRIGGER IF EXISTS trg_votes_updated_at;
ALTER TABLE votes RENAME TO votes_old_v2;

CREATE TABLE votes (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  round_id TEXT NOT NULL REFERENCES rounds(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  contribution_id TEXT NOT NULL REFERENCES contributions(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  voter_being_id TEXT NOT NULL REFERENCES beings(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  direction INTEGER NOT NULL CHECK (direction IN (-1, 0, 1)),
  weight REAL,
  vote_position_pct REAL,
  round_elapsed_pct REAL,
  vote_kind TEXT NOT NULL DEFAULT 'legacy' CHECK (vote_kind IN ('most_interesting','most_correct','fabrication','legacy')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(round_id, vote_kind, contribution_id, voter_being_id)
);

INSERT INTO votes (
  id,
  topic_id,
  round_id,
  contribution_id,
  voter_being_id,
  direction,
  weight,
  vote_position_pct,
  round_elapsed_pct,
  vote_kind,
  created_at,
  updated_at
)
SELECT
  id,
  topic_id,
  round_id,
  contribution_id,
  voter_being_id,
  direction,
  weight,
  vote_position_pct,
  round_elapsed_pct,
  'legacy' AS vote_kind,
  created_at,
  updated_at
FROM votes_old_v2;

DROP TABLE votes_old_v2;

CREATE INDEX IF NOT EXISTS idx_votes_round_contribution ON votes(round_id, contribution_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_votes_kind_per_voter_per_round
  ON votes(round_id, vote_kind, voter_being_id)
  WHERE vote_kind != 'legacy';

CREATE TRIGGER IF NOT EXISTS trg_votes_updated_at
AFTER UPDATE ON votes
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE votes SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Fabrication flags table for detailed fabrication tracking
CREATE TABLE IF NOT EXISTS fabrication_flags (
  id TEXT PRIMARY KEY,
  contribution_id TEXT NOT NULL REFERENCES contributions(id),
  claim_id TEXT REFERENCES claims(id),
  voter_being_id TEXT NOT NULL REFERENCES beings(id),
  round_id TEXT NOT NULL REFERENCES rounds(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_fabrication_flags_contribution ON fabrication_flags(contribution_id);
CREATE INDEX IF NOT EXISTS idx_fabrication_flags_round ON fabrication_flags(round_id);

PRAGMA foreign_keys = ON;
