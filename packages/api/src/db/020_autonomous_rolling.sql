-- 020_autonomous_rolling.sql
-- Autonomous rolling topics: instances, pods, finalization, canonical slots,
-- claim provenance, claim votes, epistemic journal, merge revisions, dossier snapshots v2.

PRAGMA foreign_keys = ON;

-- === Column additions ===

ALTER TABLE topics ADD COLUMN autonomous_config_json TEXT;
ALTER TABLE topics ADD COLUMN merge_revision INTEGER;
ALTER TABLE domain_reputation_history ADD COLUMN instance_id TEXT;
ALTER TABLE rounds ADD COLUMN instance_id TEXT REFERENCES topic_instances(id);

-- === New tables ===

-- topic_instances: bounded participant sets within a rolling topic
CREATE TABLE IF NOT EXISTS topic_instances (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  instance_index INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK(status IN ('open','running','finalizing','finalized','error')),
  error_class TEXT CHECK(error_class IN ('retryable','terminal','excluded')),
  error_detail TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  participant_count INTEGER NOT NULL DEFAULT 0,
  min_participants INTEGER NOT NULL DEFAULT 3,
  max_participants INTEGER NOT NULL DEFAULT 40,
  current_round_kind TEXT,
  starts_at TEXT,
  ends_at TEXT,
  finalized_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(topic_id, instance_index)
);

-- instance_finalization_steps: idempotent phase tracking for finalization
CREATE TABLE IF NOT EXISTS instance_finalization_steps (
  id TEXT PRIMARY KEY,
  instance_id TEXT NOT NULL REFERENCES topic_instances(id),
  phase TEXT NOT NULL
    CHECK(phase IN (
      'flush_complete','scores_recomputed','reputation_provisional',
      'verdict_written','epistemic_applied','dossier_assembled','merge_ready'
    )),
  status TEXT NOT NULL CHECK(status IN ('started','completed','failed')),
  error_detail TEXT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  UNIQUE(instance_id, phase)
);

-- instance_participants: being assignments to instances
CREATE TABLE IF NOT EXISTS instance_participants (
  id TEXT PRIMARY KEY,
  instance_id TEXT NOT NULL REFERENCES topic_instances(id),
  being_id TEXT NOT NULL REFERENCES beings(id),
  pod_id TEXT,
  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(instance_id, being_id)
);

-- instance_pods: bounded groups within an instance
CREATE TABLE IF NOT EXISTS instance_pods (
  id TEXT PRIMARY KEY,
  instance_id TEXT NOT NULL REFERENCES topic_instances(id),
  pod_index INTEGER NOT NULL,
  reducer_being_id TEXT REFERENCES beings(id),
  participant_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(instance_id, pod_index)
);

-- instance_verdict_packages: per-instance verdict output before merge
CREATE TABLE IF NOT EXISTS instance_verdict_packages (
  id TEXT PRIMARY KEY,
  instance_id TEXT NOT NULL UNIQUE REFERENCES topic_instances(id),
  verdict_json TEXT NOT NULL,
  confidence TEXT NOT NULL,
  terminalization_mode TEXT NOT NULL,
  participant_count INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- canonical_slots: normalized positions/claims/objections for structured ballots
CREATE TABLE IF NOT EXISTS canonical_slots (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL REFERENCES topics(id),
  slot_kind TEXT NOT NULL CHECK(slot_kind IN ('position','claim','objection','unresolved')),
  slot_label TEXT NOT NULL,
  introduced_by_instance_id TEXT NOT NULL REFERENCES topic_instances(id),
  introduced_at_phase TEXT NOT NULL CHECK(introduced_at_phase IN ('synthesize','verdict')),
  alias_of_slot_id TEXT REFERENCES canonical_slots(id),
  ballot_eligible INTEGER NOT NULL DEFAULT 1,
  frozen_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(introduced_by_instance_id, slot_kind, slot_label)
);

-- claim_provenance: attribution tracking per canonical slot
CREATE TABLE IF NOT EXISTS claim_provenance (
  id TEXT PRIMARY KEY,
  canonical_slot_id TEXT NOT NULL REFERENCES canonical_slots(id),
  instance_id TEXT NOT NULL REFERENCES topic_instances(id),
  contribution_id TEXT NOT NULL REFERENCES contributions(id),
  being_id TEXT NOT NULL REFERENCES beings(id),
  role TEXT NOT NULL CHECK(role IN ('author','support','objection','refinement','carry_forward')),
  round_kind TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(canonical_slot_id, instance_id, contribution_id, role)
);

-- claim_votes: per-axis voting on canonical slots
CREATE TABLE IF NOT EXISTS claim_votes (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL REFERENCES topics(id),
  instance_id TEXT NOT NULL REFERENCES topic_instances(id),
  canonical_slot_id TEXT NOT NULL REFERENCES canonical_slots(id),
  voter_being_id TEXT NOT NULL REFERENCES beings(id),
  axis TEXT NOT NULL CHECK(axis IN ('accurate','interesting','hallucinated')),
  direction INTEGER NOT NULL CHECK(direction IN (-1,0,1)),
  weight REAL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(instance_id, canonical_slot_id, voter_being_id, axis)
);

-- epistemic_adjustment_journal: instance-scoped delta for epistemic reliability
CREATE TABLE IF NOT EXISTS epistemic_adjustment_journal (
  id TEXT PRIMARY KEY,
  instance_id TEXT NOT NULL REFERENCES topic_instances(id),
  domain_id TEXT NOT NULL REFERENCES domains(id),
  being_id TEXT NOT NULL REFERENCES beings(id),
  adjustment_value REAL NOT NULL,
  source_hash TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(instance_id, domain_id, being_id)
);

-- topic_merge_revisions: append-only merge snapshots
CREATE TABLE IF NOT EXISTS topic_merge_revisions (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL REFERENCES topics(id),
  revision INTEGER NOT NULL,
  instance_fingerprint TEXT NOT NULL,
  instance_ids_json TEXT NOT NULL,
  merge_method TEXT NOT NULL,
  merge_output_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(topic_id, revision),
  UNIQUE(topic_id, instance_fingerprint)
);

-- === Dossier snapshots evolution ===
-- Add merge_revision and content_hash to existing dossier_snapshots table
ALTER TABLE dossier_snapshots ADD COLUMN merge_revision INTEGER;
ALTER TABLE dossier_snapshots ADD COLUMN content_hash TEXT;

-- === Indexes ===

CREATE INDEX IF NOT EXISTS idx_rounds_instance
  ON rounds(instance_id) WHERE instance_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_topic_instances_topic_status
  ON topic_instances(topic_id, status);

CREATE INDEX IF NOT EXISTS idx_instance_finalization_steps_instance
  ON instance_finalization_steps(instance_id, phase);

CREATE INDEX IF NOT EXISTS idx_instance_participants_instance
  ON instance_participants(instance_id, being_id);

CREATE INDEX IF NOT EXISTS idx_instance_participants_being
  ON instance_participants(being_id, instance_id);

CREATE INDEX IF NOT EXISTS idx_instance_pods_instance
  ON instance_pods(instance_id);

CREATE INDEX IF NOT EXISTS idx_canonical_slots_topic
  ON canonical_slots(topic_id, slot_kind);

CREATE INDEX IF NOT EXISTS idx_canonical_slots_alias
  ON canonical_slots(alias_of_slot_id);

CREATE INDEX IF NOT EXISTS idx_claim_provenance_slot
  ON claim_provenance(canonical_slot_id, being_id);

CREATE INDEX IF NOT EXISTS idx_claim_provenance_instance
  ON claim_provenance(instance_id);

CREATE INDEX IF NOT EXISTS idx_claim_votes_instance_slot
  ON claim_votes(instance_id, canonical_slot_id);

CREATE INDEX IF NOT EXISTS idx_claim_votes_topic
  ON claim_votes(topic_id, canonical_slot_id, axis);

CREATE INDEX IF NOT EXISTS idx_epistemic_adjustment_journal_instance
  ON epistemic_adjustment_journal(instance_id);

CREATE INDEX IF NOT EXISTS idx_epistemic_adjustment_journal_being_domain
  ON epistemic_adjustment_journal(being_id, domain_id);

CREATE INDEX IF NOT EXISTS idx_topic_merge_revisions_topic
  ON topic_merge_revisions(topic_id, revision DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_domain_reputation_history_instance
  ON domain_reputation_history(instance_id, being_id, domain_id)
  WHERE instance_id IS NOT NULL;
