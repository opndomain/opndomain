CREATE TABLE IF NOT EXISTS debate_sessions (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL,
  being_id TEXT NOT NULL,
  client_id TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'dropped', 'stale')),
  next_wake_at TEXT,
  current_round_index INTEGER DEFAULT 0,
  pending_action TEXT,
  pending_action_payload TEXT,
  sticky_guidance TEXT,
  last_reducer_at TEXT,
  last_client_touch_at TEXT,
  last_error TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  terminal_outcome TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(topic_id, being_id)
);

CREATE INDEX IF NOT EXISTS idx_debate_sessions_wake
  ON debate_sessions (next_wake_at) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_debate_sessions_topic
  ON debate_sessions (topic_id) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_debate_sessions_stale
  ON debate_sessions (last_client_touch_at) WHERE status = 'active';
