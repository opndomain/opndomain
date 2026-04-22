import {
  EMBEDDING_RECORD_VERSION,
  SEMANTIC_EMBEDDING_MODEL,
} from "@opndomain/shared";
import type { ApiEnv } from "../lib/env.js";
import { allRows, firstRow, runStatement } from "../lib/db.js";
import { createWorkersAiEmbeddingBackend } from "../lib/scoring/semantic.js";
import { nowIso } from "../lib/time.js";

// ---------------------------------------------------------------------------
// Canonical text composition
// ---------------------------------------------------------------------------
//
// The embedding_text_hash stored with each row is the sha-256 of this exact
// canonical string. Backfill compares the hash to detect stale embeddings
// caused by title/prompt edits or re-terminalization.

type TopicEmbeddingInput = {
  title: string;
  prompt: string;
  verdictSummary: string | null;
};

type ClaimEmbeddingInput = {
  claimText: string;
  sourceQuote: string | null;
};

export function embeddingTextForTopic(input: TopicEmbeddingInput): string {
  const parts = [input.title, input.prompt];
  if (input.verdictSummary) {
    parts.push(input.verdictSummary);
  }
  return parts.join("\n\n");
}

export function embeddingTextForClaim(input: ClaimEmbeddingInput): string {
  if (input.sourceQuote) {
    return `${input.claimText}\n\n${input.sourceQuote}`;
  }
  return input.claimText;
}

// ---------------------------------------------------------------------------
// Compute + hash
// ---------------------------------------------------------------------------

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

export async function computeEmbedding(
  env: Pick<ApiEnv, "AI">,
  text: string,
): Promise<{ vector: number[]; hash: string }> {
  const backend = createWorkersAiEmbeddingBackend(env);
  const embeddings = await backend.embed([text]);
  const vector = embeddings[0];
  if (!Array.isArray(vector) || vector.length === 0) {
    throw new Error("Workers AI returned empty embedding");
  }
  const hash = await sha256Hex(text);
  return { vector, hash };
}

// ---------------------------------------------------------------------------
// Upsert paths — non-fatal, return an outcome tag so callers can log
// ---------------------------------------------------------------------------

export type UpsertOutcome = "upserted" | "skipped_current" | "skipped_error" | "skipped_missing";

type TopicEmbeddingRow = {
  id: string;
  title: string;
  prompt: string;
  domain_id: string;
  status: string;
  closed_at: string | null;
  parent_topic_id: string | null;
  embedding_indexed_at: string | null;
  embedding_model: string | null;
  embedding_text_hash: string | null;
  embedding_version: number | null;
  verdict_summary: string | null;
};

async function loadTopicEmbeddingRow(env: ApiEnv, topicId: string): Promise<TopicEmbeddingRow | null> {
  return firstRow<TopicEmbeddingRow>(
    env.DB,
    `
      SELECT t.id, t.title, t.prompt, t.domain_id, t.status, t.closed_at, t.parent_topic_id,
             t.embedding_indexed_at, t.embedding_model, t.embedding_text_hash, t.embedding_version,
             v.summary AS verdict_summary
      FROM topics t
      LEFT JOIN verdicts v ON v.topic_id = t.id
      WHERE t.id = ? AND t.archived_at IS NULL
    `,
    topicId,
  );
}

// Walk upward via parent_topic_id to find the root. Used as Vectorize metadata
// so k-NN queries can filter out same-root subtrees server-side.
async function resolveRootTopicId(env: ApiEnv, topicId: string): Promise<string> {
  let cursor = topicId;
  for (let i = 0; i < 16; i += 1) {
    const parent = await firstRow<{ parent_topic_id: string | null }>(
      env.DB,
      "SELECT parent_topic_id FROM topics WHERE id = ?",
      cursor,
    );
    const next = parent?.parent_topic_id ?? null;
    if (!next) return cursor;
    cursor = next;
  }
  return cursor;
}

export async function upsertTopicEmbedding(
  env: ApiEnv,
  topicId: string,
): Promise<UpsertOutcome> {
  // Early-out when the substrate isn't bound (test envs, preview deploys
  // without Vectorize). Skipping here also avoids consuming queued FakeDb
  // responses in tests that don't care about the embedding pipeline.
  if (!env.VECTORIZE_TOPICS || !env.AI) return "skipped_error";
  const row = await loadTopicEmbeddingRow(env, topicId);
  if (!row) return "skipped_missing";

  const canonicalText = embeddingTextForTopic({
    title: row.title,
    prompt: row.prompt,
    verdictSummary: row.verdict_summary,
  });

  try {
    const { vector, hash } = await computeEmbedding(env, canonicalText);

    // Skip if hash + model + version already match AND the row is indexed.
    if (
      row.embedding_indexed_at
      && row.embedding_text_hash === hash
      && row.embedding_model === SEMANTIC_EMBEDDING_MODEL
      && row.embedding_version === EMBEDDING_RECORD_VERSION
    ) {
      return "skipped_current";
    }

    const rootTopicId = await resolveRootTopicId(env, topicId);
    if (!env.VECTORIZE_TOPICS) {
      console.error("embedding upsert skipped: VECTORIZE_TOPICS binding missing", { topicId });
      return "skipped_error";
    }

    await env.VECTORIZE_TOPICS.upsert([
      {
        id: topicId,
        values: vector,
        metadata: {
          domainId: row.domain_id,
          rootTopicId,
          status: row.status,
        },
      },
    ]);

    await runStatement(
      env.DB.prepare(
        `UPDATE topics SET embedding_indexed_at = ?, embedding_model = ?, embedding_text_hash = ?, embedding_version = ? WHERE id = ?`,
      ).bind(nowIso(), SEMANTIC_EMBEDDING_MODEL, hash, EMBEDDING_RECORD_VERSION, topicId),
    );

    return "upserted";
  } catch (error) {
    console.error("upsertTopicEmbedding failed", {
      topicId,
      error: error instanceof Error ? error.message : String(error),
    });
    return "skipped_error";
  }
}

type ClaimEmbeddingRow = {
  id: string;
  topic_id: string;
  claim_text: string;
  classification: string | null;
  source_quote: string | null;
  embedding_indexed_at: string | null;
  embedding_model: string | null;
  embedding_text_hash: string | null;
  embedding_version: number | null;
};

async function loadClaimEmbeddingRow(env: ApiEnv, claimId: string): Promise<ClaimEmbeddingRow | null> {
  return firstRow<ClaimEmbeddingRow>(
    env.DB,
    `SELECT id, topic_id, claim_text, classification, source_quote,
            embedding_indexed_at, embedding_model, embedding_text_hash, embedding_version
     FROM refinement_claims WHERE id = ?`,
    claimId,
  );
}

export async function upsertClaimEmbedding(
  env: ApiEnv,
  claimId: string,
): Promise<{ outcome: UpsertOutcome; vector?: number[]; rootTopicId?: string }> {
  // Early-out when the substrate isn't bound. Same reasoning as
  // upsertTopicEmbedding above.
  if (!env.VECTORIZE_CLAIMS || !env.AI) return { outcome: "skipped_error" };
  const row = await loadClaimEmbeddingRow(env, claimId);
  if (!row) return { outcome: "skipped_missing" };

  const canonicalText = embeddingTextForClaim({
    claimText: row.claim_text,
    sourceQuote: row.source_quote,
  });

  try {
    const { vector, hash } = await computeEmbedding(env, canonicalText);

    if (
      row.embedding_indexed_at
      && row.embedding_text_hash === hash
      && row.embedding_model === SEMANTIC_EMBEDDING_MODEL
      && row.embedding_version === EMBEDDING_RECORD_VERSION
    ) {
      // Still compute rootTopicId in case the caller wants to run a cross-
      // link check on the existing vector. But skip Vectorize + DB writes.
      const rootTopicId = await resolveRootTopicId(env, row.topic_id);
      return { outcome: "skipped_current", vector, rootTopicId };
    }

    const rootTopicId = await resolveRootTopicId(env, row.topic_id);
    if (!env.VECTORIZE_CLAIMS) {
      console.error("claim embedding upsert skipped: VECTORIZE_CLAIMS binding missing", { claimId });
      return { outcome: "skipped_error" };
    }

    await env.VECTORIZE_CLAIMS.upsert([
      {
        id: claimId,
        values: vector,
        metadata: {
          topicId: row.topic_id,
          rootTopicId,
        },
      },
    ]);

    await runStatement(
      env.DB.prepare(
        `UPDATE refinement_claims SET embedding_indexed_at = ?, embedding_model = ?, embedding_text_hash = ?, embedding_version = ? WHERE id = ?`,
      ).bind(nowIso(), SEMANTIC_EMBEDDING_MODEL, hash, EMBEDDING_RECORD_VERSION, claimId),
    );

    return { outcome: "upserted", vector, rootTopicId };
  } catch (error) {
    console.error("upsertClaimEmbedding failed", {
      claimId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { outcome: "skipped_error" };
  }
}

// ---------------------------------------------------------------------------
// Similarity queries
// ---------------------------------------------------------------------------

export type SimilarityOptions = {
  limit?: number;
  threshold?: number;
  excludeIds?: string[];
};

type TopicSimilarityMatch = { topicId: string; score: number; metadata: Record<string, string> };

async function queryVectorize(
  index: VectorizeIndex | undefined,
  vector: number[],
  options: SimilarityOptions & { metadataFilter?: Record<string, string> },
): Promise<Array<{ id: string; score: number; metadata: Record<string, string> }>> {
  if (!index) return [];
  const limit = Math.max(1, Math.min(options.limit ?? 10, 50));
  // Over-fetch then filter client-side for excludeIds. Vectorize doesn't
  // support an "exclude by id list" filter directly.
  const fetchK = Math.min(limit + (options.excludeIds?.length ?? 0), 100);
  const result = await index.query(vector, {
    topK: fetchK,
    returnMetadata: "all",
    filter: options.metadataFilter,
  });
  const excludeSet = new Set(options.excludeIds ?? []);
  const threshold = options.threshold ?? 0;
  return result.matches
    .filter((match) => !excludeSet.has(match.id) && match.score >= threshold)
    .slice(0, limit)
    .map((match) => ({ id: match.id, score: match.score, metadata: (match.metadata ?? {}) as Record<string, string> }));
}

export async function findTopicsNearestToVector(
  env: ApiEnv,
  vector: number[],
  options: SimilarityOptions & { metadataFilter?: Record<string, string> } = {},
): Promise<TopicSimilarityMatch[]> {
  const matches = await queryVectorize(env.VECTORIZE_TOPICS, vector, options);
  return matches.map((match) => ({ topicId: match.id, score: match.score, metadata: match.metadata }));
}

async function getStoredVector(
  index: VectorizeIndex | undefined,
  id: string,
): Promise<number[] | null> {
  if (!index) return null;
  const result = await index.getByIds([id]);
  const vec = result?.[0]?.values;
  if (!vec) return null;
  return Array.from(vec);
}

export async function findSimilarTopics(
  env: ApiEnv,
  topicId: string,
  options: SimilarityOptions = {},
): Promise<TopicSimilarityMatch[]> {
  let stored = await getStoredVector(env.VECTORIZE_TOPICS, topicId);
  if (!stored) {
    // Lazy upsert if the topic isn't indexed yet, then retry once. Backfill
    // should prevent this path from being common.
    await upsertTopicEmbedding(env, topicId);
    stored = await getStoredVector(env.VECTORIZE_TOPICS, topicId);
    if (!stored) return [];
  }
  const excludeIds = Array.from(new Set([...(options.excludeIds ?? []), topicId]));
  return findTopicsNearestToVector(env, stored, { ...options, excludeIds });
}

export async function findSimilarClaims(
  env: ApiEnv,
  claimId: string,
  options: SimilarityOptions = {},
): Promise<Array<{ claimId: string; score: number; metadata: Record<string, string> }>> {
  let stored = await getStoredVector(env.VECTORIZE_CLAIMS, claimId);
  if (!stored) {
    await upsertClaimEmbedding(env, claimId);
    stored = await getStoredVector(env.VECTORIZE_CLAIMS, claimId);
    if (!stored) return [];
  }
  const matches = await queryVectorize(env.VECTORIZE_CLAIMS, stored, {
    ...options,
    excludeIds: Array.from(new Set([...(options.excludeIds ?? []), claimId])),
  });
  return matches.map((match) => ({ claimId: match.id, score: match.score, metadata: match.metadata }));
}

// ---------------------------------------------------------------------------
// Backfill
// ---------------------------------------------------------------------------

export async function backfillTopicEmbeddings(
  env: ApiEnv,
  options: { limit?: number } = {},
): Promise<{ processed: number; upserted: number; skipped: number; failed: number }> {
  const limit = Math.max(1, Math.min(options.limit ?? 50, 200));
  // Select rows that are unindexed, or whose recorded model/version mismatch
  // the current values. Hash mismatch is detected at upsert time (we only
  // know the current hash after building the canonical text), so this query
  // is a superset; the upsert returns skipped_current when hash matches.
  const rows = await allRows<{ id: string }>(
    env.DB,
    `
      SELECT id FROM topics
      WHERE archived_at IS NULL
        AND (
          embedding_indexed_at IS NULL
          OR embedding_model <> ?
          OR embedding_version <> ?
        )
      ORDER BY COALESCE(closed_at, updated_at, created_at) DESC
      LIMIT ?
    `,
    SEMANTIC_EMBEDDING_MODEL,
    EMBEDDING_RECORD_VERSION,
    limit,
  );

  let upserted = 0;
  let skipped = 0;
  let failed = 0;
  for (const row of rows) {
    const outcome = await upsertTopicEmbedding(env, row.id);
    if (outcome === "upserted") upserted += 1;
    else if (outcome === "skipped_current") skipped += 1;
    else failed += 1;
  }

  return { processed: rows.length, upserted, skipped, failed };
}

export async function backfillClaimEmbeddings(
  env: ApiEnv,
  options: { limit?: number } = {},
): Promise<{ processed: number; upserted: number; skipped: number; failed: number }> {
  const limit = Math.max(1, Math.min(options.limit ?? 50, 200));
  const rows = await allRows<{ id: string }>(
    env.DB,
    `
      SELECT id FROM refinement_claims
      WHERE (
        embedding_indexed_at IS NULL
        OR embedding_model <> ?
        OR embedding_version <> ?
      )
      ORDER BY created_at DESC
      LIMIT ?
    `,
    SEMANTIC_EMBEDDING_MODEL,
    EMBEDDING_RECORD_VERSION,
    limit,
  );

  let upserted = 0;
  let skipped = 0;
  let failed = 0;
  for (const row of rows) {
    const { outcome } = await upsertClaimEmbedding(env, row.id);
    if (outcome === "upserted") upserted += 1;
    else if (outcome === "skipped_current") skipped += 1;
    else failed += 1;
  }

  return { processed: rows.length, upserted, skipped, failed };
}
