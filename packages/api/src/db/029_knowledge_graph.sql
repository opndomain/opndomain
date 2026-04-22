-- Typed cross-topic edges. Durable record of relationships that embeddings
-- alone can't capture (citations parsed from contribution bodies, DAG cross-
-- links from claim-to-topic embedding matches, and cached top-K similarity
-- for fast rendering). Link types are API commitments: the product layer
-- assumes a 'cites' means a real human-posted reference, an 'addresses_claim'
-- means an unresolved claim from the from-topic's verdict maps to an
-- existing topic, and 'semantic_similarity' means nearest-neighbor in the
-- topic embedding space. Do not overload these.
--
-- evidence is a JSON string; documented shapes per source:
--   citation_parser: {"quote": "...", "source": "citation_parser"}
--   claim_match:     {"claimId": "rfc_xxx", "source": "claim_match"}
--   vectorize_knn:   {"source": "vectorize_knn"}
CREATE TABLE IF NOT EXISTS topic_links (
  id TEXT PRIMARY KEY,
  from_topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  to_topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  link_type TEXT NOT NULL CHECK (link_type IN ('cites', 'addresses_claim', 'semantic_similarity')),
  confidence REAL,
  evidence TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (from_topic_id, to_topic_id, link_type),
  CHECK (from_topic_id <> to_topic_id)
);
CREATE INDEX IF NOT EXISTS idx_topic_links_from ON topic_links(from_topic_id);
CREATE INDEX IF NOT EXISTS idx_topic_links_to ON topic_links(to_topic_id);
CREATE INDEX IF NOT EXISTS idx_topic_links_type ON topic_links(link_type);

-- Stale-embedding detection for topics. A timestamp alone can't detect model
-- changes, title/prompt edits, verdict reterminalization, or text-composition
-- version bumps. Backfill queries on hash/model/version mismatch, not just
-- NULL, so every repairable row gets re-indexed.
ALTER TABLE topics ADD COLUMN embedding_indexed_at TEXT;
ALTER TABLE topics ADD COLUMN embedding_model TEXT;
ALTER TABLE topics ADD COLUMN embedding_text_hash TEXT;
ALTER TABLE topics ADD COLUMN embedding_version INTEGER;

ALTER TABLE refinement_claims ADD COLUMN embedding_indexed_at TEXT;
ALTER TABLE refinement_claims ADD COLUMN embedding_model TEXT;
ALTER TABLE refinement_claims ADD COLUMN embedding_text_hash TEXT;
ALTER TABLE refinement_claims ADD COLUMN embedding_version INTEGER;

-- Backfill selector: topics/claims needing reindex. Lookups on
-- embedding_indexed_at IS NULL should be cheap.
CREATE INDEX IF NOT EXISTS idx_topics_embedding_pending ON topics(embedding_indexed_at) WHERE embedding_indexed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_refinement_claims_embedding_pending ON refinement_claims(embedding_indexed_at) WHERE embedding_indexed_at IS NULL;
