import type { TopicLinkType, TopicLinkEvidence } from "@opndomain/shared";
import {
  SEMANTIC_SIMILARITY_THRESHOLD,
  SEMANTIC_SIMILARITY_EDGE_LIMIT,
} from "@opndomain/shared";
import type { ApiEnv } from "../lib/env.js";
import { allRows, runStatement } from "../lib/db.js";
import { createId } from "../lib/ids.js";
import { findSimilarTopics } from "./embeddings.js";

// ---------------------------------------------------------------------------
// Insert + list
// ---------------------------------------------------------------------------

export type InsertLinkInput = {
  fromTopicId: string;
  toTopicId: string;
  linkType: TopicLinkType;
  confidence?: number | null;
  evidence?: TopicLinkEvidence | null;
};

// INSERT OR IGNORE relies on the UNIQUE (from, to, linkType) constraint
// in migration 029 to dedup repeated insert calls. Self-loops are rejected
// by the CHECK constraint at the same migration.
export async function insertLink(env: ApiEnv, input: InsertLinkInput): Promise<boolean> {
  if (input.fromTopicId === input.toTopicId) return false;
  const evidenceJson = input.evidence ? JSON.stringify(input.evidence) : null;
  const result = await env.DB.prepare(
    `INSERT OR IGNORE INTO topic_links (id, from_topic_id, to_topic_id, link_type, confidence, evidence)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(
    createId("tlink"),
    input.fromTopicId,
    input.toTopicId,
    input.linkType,
    input.confidence ?? null,
    evidenceJson,
  ).run();
  return Number((result.meta as { changes?: number } | undefined)?.changes ?? 0) > 0;
}

type TopicLinkRow = {
  id: string;
  from_topic_id: string;
  to_topic_id: string;
  link_type: TopicLinkType;
  confidence: number | null;
  evidence: string | null;
  created_at: string;
};

function mapRow(row: TopicLinkRow) {
  return {
    id: row.id,
    fromTopicId: row.from_topic_id,
    toTopicId: row.to_topic_id,
    linkType: row.link_type,
    confidence: row.confidence,
    evidence: row.evidence,
    createdAt: row.created_at,
  };
}

export async function listOutgoingLinks(env: ApiEnv, topicId: string) {
  const rows = await allRows<TopicLinkRow>(
    env.DB,
    "SELECT id, from_topic_id, to_topic_id, link_type, confidence, evidence, created_at FROM topic_links WHERE from_topic_id = ? ORDER BY link_type, created_at",
    topicId,
  );
  return rows.map(mapRow);
}

export async function listIncomingLinks(env: ApiEnv, topicId: string) {
  const rows = await allRows<TopicLinkRow>(
    env.DB,
    "SELECT id, from_topic_id, to_topic_id, link_type, confidence, evidence, created_at FROM topic_links WHERE to_topic_id = ? ORDER BY link_type, created_at",
    topicId,
  );
  return rows.map(mapRow);
}

// ---------------------------------------------------------------------------
// Same-root-subtree walker — used to build exclusion sets for cross-link
// k-NN queries. Includes self + all ancestors (up to root) + all descendants
// reachable via parent_topic_id. Returns a de-duped array.
// ---------------------------------------------------------------------------

export async function getSameRootSubtreeTopicIds(env: ApiEnv, topicId: string): Promise<string[]> {
  const rows = await allRows<{ id: string }>(
    env.DB,
    `
      WITH RECURSIVE ancestry(id) AS (
        SELECT id FROM topics WHERE id = ?
        UNION ALL
        SELECT t.id FROM topics t INNER JOIN ancestry a ON t.id = (
          SELECT parent_topic_id FROM topics WHERE id = a.id
        )
        WHERE t.id IS NOT NULL
      ),
      root(id) AS (
        SELECT id FROM ancestry
        WHERE NOT EXISTS (SELECT 1 FROM topics WHERE id = ancestry.id AND parent_topic_id IS NOT NULL)
        LIMIT 1
      ),
      descendants(id) AS (
        SELECT id FROM root
        UNION ALL
        SELECT t.id FROM topics t INNER JOIN descendants d ON t.parent_topic_id = d.id
      )
      SELECT id FROM descendants
    `,
    topicId,
  );
  const ids = new Set<string>([topicId]);
  for (const row of rows) ids.add(row.id);
  return Array.from(ids);
}

// ---------------------------------------------------------------------------
// Similarity-edge cache — top-K semantic_similarity rows per topic
// ---------------------------------------------------------------------------

export async function refreshSimilarityLinks(
  env: ApiEnv,
  topicId: string,
  options: { limit?: number; threshold?: number } = {},
): Promise<{ inserted: number; cleared: number }> {
  const limit = options.limit ?? SEMANTIC_SIMILARITY_EDGE_LIMIT;
  const threshold = options.threshold ?? SEMANTIC_SIMILARITY_THRESHOLD;

  // Build exclusion = same-root subtree. This filters out ancestry lineage
  // from the cached similar-to list so the UI only surfaces cross-root
  // relationships.
  const excludeIds = await getSameRootSubtreeTopicIds(env, topicId);

  const matches = await findSimilarTopics(env, topicId, {
    limit,
    threshold,
    excludeIds,
  });

  // Replace: delete current semantic_similarity edges from this topic, then
  // insert fresh. Left in place when findSimilarTopics returns [] so we
  // don't wipe a prior good cache on a transient Vectorize outage.
  if (matches.length === 0) {
    return { inserted: 0, cleared: 0 };
  }

  const cleared = await runStatement(
    env.DB.prepare(
      "DELETE FROM topic_links WHERE from_topic_id = ? AND link_type = 'semantic_similarity'",
    ).bind(topicId),
  );

  let inserted = 0;
  for (const match of matches) {
    const ok = await insertLink(env, {
      fromTopicId: topicId,
      toTopicId: match.topicId,
      linkType: "semantic_similarity",
      confidence: match.score,
      evidence: { source: "vectorize_knn" },
    });
    if (ok) inserted += 1;
  }

  return {
    inserted,
    cleared: Number((cleared.meta as { changes?: number } | undefined)?.changes ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Citation parser — extracts /topics/top_<hex32> references from a body of
// text. Returns evidence-bearing edges with the surrounding sentence so UI
// can render context on hover. Skips the source topic itself and dedups
// within a body.
// ---------------------------------------------------------------------------

const TOPIC_ID_PATTERN = /\/topics\/(top_[a-f0-9]{32})\b/g;

export function extractCitationLinks(
  fromTopicId: string,
  body: string,
): Array<{ toTopicId: string; evidence: TopicLinkEvidence }> {
  const seen = new Set<string>();
  const out: Array<{ toTopicId: string; evidence: TopicLinkEvidence }> = [];
  const matches = body.matchAll(TOPIC_ID_PATTERN);
  for (const match of matches) {
    const toTopicId = match[1];
    if (!toTopicId || toTopicId === fromTopicId || seen.has(toTopicId)) continue;
    seen.add(toTopicId);

    // Extract a ~200-char window around the match as evidence.
    const matchIndex = match.index ?? 0;
    const start = Math.max(0, matchIndex - 80);
    const end = Math.min(body.length, matchIndex + match[0].length + 120);
    const rawQuote = body.slice(start, end).trim().slice(0, 200);

    out.push({
      toTopicId,
      evidence: { source: "citation_parser", quote: rawQuote },
    });
  }
  return out;
}
