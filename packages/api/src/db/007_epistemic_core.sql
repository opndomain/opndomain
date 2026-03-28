PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,
  contribution_id TEXT NOT NULL REFERENCES contributions(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  domain_id TEXT NOT NULL REFERENCES domains(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  being_id TEXT NOT NULL REFERENCES beings(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ordinal INTEGER NOT NULL,
  body TEXT NOT NULL,
  normalized_body TEXT,
  verifiability TEXT NOT NULL DEFAULT 'unclassified',
  status TEXT NOT NULL DEFAULT 'extracted',
  extraction_version TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(contribution_id, ordinal)
);

CREATE TABLE IF NOT EXISTS claim_relations (
  id TEXT PRIMARY KEY,
  domain_id TEXT NOT NULL REFERENCES domains(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  source_claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  target_claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  relation_kind TEXT NOT NULL CHECK (relation_kind IN ('support', 'contradiction', 'refinement', 'supersession')),
  confidence REAL NOT NULL DEFAULT 0,
  explanation TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (source_claim_id <> target_claim_id),
  UNIQUE(source_claim_id, target_claim_id, relation_kind)
);

CREATE TABLE IF NOT EXISTS claim_resolutions (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL UNIQUE REFERENCES claims(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  domain_id TEXT NOT NULL REFERENCES domains(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  status TEXT NOT NULL DEFAULT 'unresolved' CHECK (status IN ('unresolved', 'contested', 'supported', 'refuted', 'mixed')),
  confidence REAL NOT NULL DEFAULT 0,
  signal_summary_json TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS claim_resolution_evidence (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  contribution_id TEXT NOT NULL REFERENCES contributions(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  relation_id TEXT REFERENCES claim_relations(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  evidence_kind TEXT NOT NULL DEFAULT 'support' CHECK (evidence_kind IN ('support', 'challenge', 'context', 'correction')),
  excerpt TEXT,
  weight REAL NOT NULL DEFAULT 0,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(claim_id, contribution_id, evidence_kind)
);

CREATE TABLE IF NOT EXISTS epistemic_reliability (
  id TEXT PRIMARY KEY,
  domain_id TEXT NOT NULL REFERENCES domains(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  being_id TEXT NOT NULL REFERENCES beings(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  reliability_score REAL NOT NULL DEFAULT 0,
  confidence_score REAL NOT NULL DEFAULT 0,
  supported_claim_count INTEGER NOT NULL DEFAULT 0,
  contested_claim_count INTEGER NOT NULL DEFAULT 0,
  refuted_claim_count INTEGER NOT NULL DEFAULT 0,
  correction_count INTEGER NOT NULL DEFAULT 0,
  last_evaluated_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(domain_id, being_id)
);

CREATE INDEX IF NOT EXISTS idx_claims_topic_ordinal
  ON claims(topic_id, ordinal);

CREATE INDEX IF NOT EXISTS idx_claims_domain_status
  ON claims(domain_id, status, verifiability);

CREATE INDEX IF NOT EXISTS idx_claim_relations_source_kind
  ON claim_relations(source_claim_id, relation_kind);

CREATE INDEX IF NOT EXISTS idx_claim_relations_target_kind
  ON claim_relations(target_claim_id, relation_kind);

CREATE INDEX IF NOT EXISTS idx_claim_resolutions_domain_status
  ON claim_resolutions(domain_id, status, confidence DESC);

CREATE INDEX IF NOT EXISTS idx_claim_resolution_evidence_claim_kind
  ON claim_resolution_evidence(claim_id, evidence_kind, weight DESC);

CREATE INDEX IF NOT EXISTS idx_epistemic_reliability_domain
  ON epistemic_reliability(domain_id, reliability_score DESC, confidence_score DESC);

CREATE TRIGGER IF NOT EXISTS trg_claims_updated_at
AFTER UPDATE ON claims
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE claims SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_claim_relations_updated_at
AFTER UPDATE ON claim_relations
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE claim_relations SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_claim_resolutions_updated_at
AFTER UPDATE ON claim_resolutions
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE claim_resolutions SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_claim_resolution_evidence_updated_at
AFTER UPDATE ON claim_resolution_evidence
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE claim_resolution_evidence SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_epistemic_reliability_updated_at
AFTER UPDATE ON epistemic_reliability
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE epistemic_reliability SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
