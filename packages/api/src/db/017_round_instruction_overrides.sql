-- 017: Round instruction overrides
-- Runtime-overridable round instructions stored in D1.
-- Keyed by (template_id, sequence_index). The API checks this table before
-- falling back to the shared code defaults in round-instructions.ts.

CREATE TABLE IF NOT EXISTS round_instruction_overrides (
  template_id TEXT NOT NULL,
  sequence_index INTEGER NOT NULL,
  round_kind TEXT NOT NULL,
  goal TEXT NOT NULL,
  guidance TEXT NOT NULL,
  prior_round_context TEXT,
  quality_criteria_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (template_id, sequence_index)
);

CREATE TRIGGER IF NOT EXISTS trg_round_instruction_overrides_updated_at
AFTER UPDATE ON round_instruction_overrides
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE round_instruction_overrides SET updated_at = datetime('now') WHERE template_id = NEW.template_id AND sequence_index = NEW.sequence_index;
END;
