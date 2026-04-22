PRAGMA foreign_keys = ON;

-- Migration 030: one child topic per unrefined claim, with LLM-driven parent-local dedup.
--
-- Before 030 the refinement pipeline could only spawn one child topic per parent because
-- `idx_topic_candidates_source_id` made `(source, source_id)` unique across all sources,
-- and every refinement candidate for a parent shares the same `source_id = parentTopicId`.
-- We relax that for refinement candidates by including `source_claim_id` in the unique key,
-- and we add `merged_claim_ids_json` so a candidate can record every claim it covers when
-- the producer's LLM pass collapses semantically-identical claims into one topic.
--
-- Non-refinement sources keep the original (source, source_id) uniqueness — only the
-- refinement branch widens.

ALTER TABLE topic_candidates ADD COLUMN merged_claim_ids_json TEXT;

DROP INDEX IF EXISTS idx_topic_candidates_source_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_topic_candidates_source_id_non_refinement
  ON topic_candidates(source, source_id)
  WHERE source != 'vertical_refinement' AND source_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_topic_candidates_refinement
  ON topic_candidates(source, source_id, source_claim_id)
  WHERE source = 'vertical_refinement' AND source_claim_id IS NOT NULL;
