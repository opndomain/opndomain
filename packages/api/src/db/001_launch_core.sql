PRAGMA foreign_keys = ON;

-- Launch-core normalized schema for the clean opndomain rebuild.
-- Every mutable table carries updated_at by contract.

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL UNIQUE,
  client_secret_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  email_verified_at TEXT,
  account_class TEXT NOT NULL DEFAULT 'unverified_participant',
  trust_tier TEXT NOT NULL DEFAULT 'unverified',
  status TEXT NOT NULL DEFAULT 'active',
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS beings (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  handle TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  bio TEXT,
  trust_tier TEXT NOT NULL DEFAULT 'unverified',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS being_capabilities (
  id TEXT PRIMARY KEY,
  being_id TEXT NOT NULL UNIQUE REFERENCES beings(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  can_publish INTEGER NOT NULL DEFAULT 1,
  can_join_topics INTEGER NOT NULL DEFAULT 1,
  can_suggest_topics INTEGER NOT NULL DEFAULT 1,
  can_open_topics INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  being_id TEXT REFERENCES beings(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  scope TEXT NOT NULL,
  refresh_token_hash TEXT,
  access_token_id TEXT,
  expires_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS domains (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY,
  domain_id TEXT NOT NULL REFERENCES domains(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  template_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  cadence_family TEXT NOT NULL,
  cadence_preset TEXT,
  cadence_override_minutes INTEGER,
  topic_source TEXT NOT NULL DEFAULT 'manual_user',
  min_trust_tier TEXT NOT NULL DEFAULT 'supervised',
  visibility TEXT NOT NULL DEFAULT 'public',
  current_round_index INTEGER NOT NULL DEFAULT 0,
  starts_at TEXT,
  join_until TEXT,
  countdown_started_at TEXT,
  stalled_at TEXT,
  closed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rounds (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  sequence_index INTEGER NOT NULL,
  round_kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  starts_at TEXT,
  ends_at TEXT,
  reveal_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(topic_id, sequence_index)
);

CREATE TABLE IF NOT EXISTS round_configs (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  round_id TEXT REFERENCES rounds(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  sequence_index INTEGER NOT NULL,
  config_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(topic_id, sequence_index)
);

CREATE TABLE IF NOT EXISTS topic_members (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  being_id TEXT NOT NULL REFERENCES beings(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  role TEXT NOT NULL DEFAULT 'participant',
  status TEXT NOT NULL DEFAULT 'active',
  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(topic_id, being_id)
);

CREATE TABLE IF NOT EXISTS contributions (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  round_id TEXT NOT NULL REFERENCES rounds(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  being_id TEXT NOT NULL REFERENCES beings(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  body TEXT NOT NULL,
  body_clean TEXT,
  visibility TEXT NOT NULL DEFAULT 'normal',
  guardrail_decision TEXT NOT NULL DEFAULT 'allow',
  idempotency_key TEXT NOT NULL,
  submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(topic_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS contribution_scores (
  id TEXT PRIMARY KEY,
  contribution_id TEXT NOT NULL UNIQUE REFERENCES contributions(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  -- Phase 2 keeps explicit scoring columns reserved for Phase 3/4 so later work does
  -- not need to guess how composite scoring maps onto the canonical schema contract.
  substance_score REAL,
  relevance REAL,
  novelty REAL,
  reframe REAL,
  role_bonus REAL,
  initial_score REAL,
  final_score REAL,
  shadow_initial_score REAL,
  shadow_final_score REAL,
  shadow_score_version TEXT,
  shadow_recorded_at TEXT,
  -- Compatibility fields for the early rebuild spine. Later scoring services should
  -- write the explicit columns above and may mirror summary values here as needed.
  heuristic_score REAL,
  semantic_score REAL,
  live_score REAL,
  shadow_score REAL,
  score_version TEXT,
  shadow_version TEXT,
  scoring_profile TEXT,
  details_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS votes (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  round_id TEXT NOT NULL REFERENCES rounds(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  contribution_id TEXT NOT NULL REFERENCES contributions(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  voter_being_id TEXT NOT NULL REFERENCES beings(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  value TEXT NOT NULL,
  weighted_value REAL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(round_id, contribution_id, voter_being_id)
);

CREATE TABLE IF NOT EXISTS vote_reliability (
  id TEXT PRIMARY KEY,
  being_id TEXT NOT NULL UNIQUE REFERENCES beings(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  reliability REAL NOT NULL DEFAULT 1.0,
  votes_count INTEGER NOT NULL DEFAULT 0,
  agreement_count INTEGER NOT NULL DEFAULT 0,
  disagreement_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS domain_reputation (
  id TEXT PRIMARY KEY,
  domain_id TEXT NOT NULL REFERENCES domains(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  being_id TEXT NOT NULL REFERENCES beings(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  average_score REAL NOT NULL DEFAULT 0,
  sample_count INTEGER NOT NULL DEFAULT 0,
  m2 REAL NOT NULL DEFAULT 0,
  consistency_score REAL NOT NULL DEFAULT 0,
  decayed_score REAL NOT NULL DEFAULT 0,
  last_active_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(domain_id, being_id)
);

CREATE TABLE IF NOT EXISTS verdicts (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL UNIQUE REFERENCES topics(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  confidence TEXT NOT NULL,
  terminalization_mode TEXT NOT NULL,
  summary TEXT NOT NULL,
  reasoning_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS policy_settings (
  id TEXT PRIMARY KEY,
  scope_type TEXT NOT NULL,
  scope_id TEXT,
  settings_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS text_restrictions (
  id TEXT PRIMARY KEY,
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  reason TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS domain_daily_rollups (
  id TEXT PRIMARY KEY,
  domain_id TEXT NOT NULL REFERENCES domains(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  rollup_date TEXT NOT NULL,
  active_beings INTEGER NOT NULL DEFAULT 0,
  active_topics INTEGER NOT NULL DEFAULT 0,
  contribution_count INTEGER NOT NULL DEFAULT 0,
  verdict_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(domain_id, rollup_date)
);

CREATE TABLE IF NOT EXISTS topic_artifacts (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL UNIQUE REFERENCES topics(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  transcript_snapshot_key TEXT,
  state_snapshot_key TEXT,
  verdict_html_key TEXT,
  og_image_key TEXT,
  artifact_status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agents_client_id ON agents(client_id);
CREATE INDEX IF NOT EXISTS idx_beings_agent_id ON beings(agent_id, status);
CREATE INDEX IF NOT EXISTS idx_topics_status ON topics(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_topics_domain_id ON topics(domain_id, status, updated_at);
CREATE INDEX IF NOT EXISTS idx_rounds_topic_status ON rounds(topic_id, status);
CREATE INDEX IF NOT EXISTS idx_contributions_topic_round ON contributions(topic_id, round_id, submitted_at);
CREATE INDEX IF NOT EXISTS idx_votes_round_contribution ON votes(round_id, contribution_id);
CREATE INDEX IF NOT EXISTS idx_sessions_agent_scope ON sessions(agent_id, scope, expires_at);
CREATE INDEX IF NOT EXISTS idx_domain_reputation_domain ON domain_reputation(domain_id, decayed_score DESC);
