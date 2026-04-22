import type {
  ExtractedRefinementClaim,
  RefinementClaimRecord,
  UnrefinedRefinementClaim,
} from "@opndomain/shared";
import { SEMANTIC_CROSSLINK_THRESHOLD } from "@opndomain/shared";
import type { ApiEnv } from "../lib/env.js";
import { allRows, firstRow, runStatement } from "../lib/db.js";
import { createId } from "../lib/ids.js";
import { nowIso } from "../lib/time.js";
import { badRequest } from "../lib/errors.js";
import { findTopicsNearestToVector, upsertClaimEmbedding } from "./embeddings.js";
import { getSameRootSubtreeTopicIds, insertLink } from "./topic-links.js";

type RefinementClaimRow = {
  id: string;
  topic_id: string;
  claim_text: string;
  classification: string | null;
  source_quote: string | null;
  promoted_topic_id: string | null;
  created_at: string;
};

function mapClaimRow(row: RefinementClaimRow): RefinementClaimRecord {
  return {
    id: row.id,
    topicId: row.topic_id,
    claimText: row.claim_text,
    classification: row.classification,
    sourceQuote: row.source_quote,
    promotedTopicId: row.promoted_topic_id,
    createdAt: row.created_at,
  };
}

// Persist a batch of extracted claims for a closed verdict. Idempotent per
// topic: if claims already exist, the new extraction is rejected so producers
// can't re-extract and multiply claim ids. Producers query list-by-topic
// first to detect "already extracted."
export async function insertExtractedClaims(
  env: ApiEnv,
  topicId: string,
  claims: ExtractedRefinementClaim[],
): Promise<RefinementClaimRecord[]> {
  const topicExists = await firstRow<{ id: string }>(
    env.DB,
    "SELECT id FROM topics WHERE id = ? AND archived_at IS NULL",
    topicId,
  );
  if (!topicExists) {
    badRequest("unknown_topic", "No active topic matched that id.");
  }

  const alreadyExtracted = await firstRow<{ n: number }>(
    env.DB,
    "SELECT COUNT(*) AS n FROM refinement_claims WHERE topic_id = ?",
    topicId,
  );
  if (Number(alreadyExtracted?.n ?? 0) > 0) {
    badRequest(
      "claims_already_extracted",
      "Refinement claims have already been extracted for this topic. Extraction is idempotent per topic.",
    );
  }

  const now = nowIso();
  const rows: RefinementClaimRecord[] = [];
  for (const claim of claims) {
    const id = createId("rfc");
    await runStatement(
      env.DB.prepare(
        `INSERT INTO refinement_claims (id, topic_id, claim_text, classification, source_quote, promoted_topic_id, created_at)
         VALUES (?, ?, ?, ?, ?, NULL, ?)`,
      ).bind(id, topicId, claim.claimText, claim.classification ?? null, claim.sourceQuote ?? null, now),
    );

    // Embedding + cross-link hook (non-fatal). Runs per-claim so a failure
    // on one claim doesn't block the others. The crosslink check must
    // exclude the entire same-root subtree — otherwise a claim could
    // accidentally auto-link to its own parent topic, suppressing the
    // refinement candidate entirely.
    let promotedTopicId: string | null = null;
    try {
      const upsertResult = await upsertClaimEmbedding(env, id);
      if (upsertResult.vector && upsertResult.rootTopicId) {
        const excludeIds = await getSameRootSubtreeTopicIds(env, topicId);
        const matches = await findTopicsNearestToVector(env, upsertResult.vector, {
          limit: 3,
          threshold: SEMANTIC_CROSSLINK_THRESHOLD,
          excludeIds,
          metadataFilter: { status: "closed" },
        });
        const match = matches[0];
        if (match) {
          // CAS-link: only sets promoted_topic_id if still NULL.
          const claimLinked = await linkClaimToPromotedTopic(env, id, match.topicId);
          if (claimLinked) {
            promotedTopicId = match.topicId;
            await insertLink(env, {
              fromTopicId: topicId,
              toTopicId: match.topicId,
              linkType: "addresses_claim",
              confidence: match.score,
              evidence: { source: "claim_match", claimId: id },
            });
          }
        }
      }
    } catch (hookError) {
      console.error("claim embedding/crosslink hook failed", {
        claimId: id,
        topicId,
        error: hookError instanceof Error ? hookError.message : String(hookError),
      });
    }

    rows.push({
      id,
      topicId,
      claimText: claim.claimText,
      classification: claim.classification ?? null,
      sourceQuote: claim.sourceQuote ?? null,
      promotedTopicId,
      createdAt: now,
    });
  }
  return rows;
}

// Return the list of refinement claims that do not yet have a promoted child
// topic. Bundles parent-topic context so the producer can build the narrower
// prompt in a single pass. Capped to a reasonable batch size.
export async function listUnrefinedClaims(
  env: ApiEnv,
  limit: number = 50,
): Promise<UnrefinedRefinementClaim[]> {
  const cappedLimit = Math.max(1, Math.min(limit, 200));
  const rows = await allRows<RefinementClaimRow & {
    topic_title: string;
    topic_prompt: string;
    topic_domain_id: string;
    topic_refinement_depth: number;
  }>(
    env.DB,
    `
      SELECT rc.id, rc.topic_id, rc.claim_text, rc.classification, rc.source_quote,
             rc.promoted_topic_id, rc.created_at,
             t.title AS topic_title, t.prompt AS topic_prompt, t.domain_id AS topic_domain_id,
             t.refinement_depth AS topic_refinement_depth
      FROM refinement_claims rc
      INNER JOIN topics t ON t.id = rc.topic_id
      WHERE rc.promoted_topic_id IS NULL
        AND t.archived_at IS NULL
      ORDER BY rc.created_at ASC
      LIMIT ?
    `,
    cappedLimit,
  );
  return rows.map((row) => ({
    claim: mapClaimRow(row),
    parentTopic: {
      id: row.topic_id,
      title: row.topic_title,
      prompt: row.topic_prompt,
      domainId: row.topic_domain_id,
      refinementDepth: Number(row.topic_refinement_depth ?? 0),
    },
  }));
}

// Return the count of verdicts that are refinement-eligible but have NO
// refinement_claims row yet. Producer uses this to know which verdicts need
// a fresh LLM extraction pass.
export async function listVerdictsNeedingExtraction(
  env: ApiEnv,
  limit: number = 20,
): Promise<Array<{ topicId: string; title: string; prompt: string; domainId: string }>> {
  const cappedLimit = Math.max(1, Math.min(limit, 100));
  const rows = await allRows<{
    id: string;
    title: string;
    prompt: string;
    domain_id: string;
  }>(
    env.DB,
    `
      SELECT t.id, t.title, t.prompt, t.domain_id
      FROM topics t
      INNER JOIN verdicts v ON v.topic_id = t.id
      WHERE t.status = 'closed'
        AND t.archived_at IS NULL
        AND v.refinement_status_json IS NOT NULL
        AND json_extract(v.refinement_status_json, '$.eligible') = 1
        AND NOT EXISTS (
          SELECT 1 FROM refinement_claims rc WHERE rc.topic_id = t.id
        )
      ORDER BY t.closed_at DESC
      LIMIT ?
    `,
    cappedLimit,
  );
  return rows.map((row) => ({
    topicId: row.id,
    title: row.title,
    prompt: row.prompt,
    domainId: row.domain_id,
  }));
}

// Mark a claim as refined by a specific promoted topic (either a freshly
// spawned child, or an existing topic linked via DAG similarity). Guarded so
// a claim is only linked once — concurrent linkers will lose the CAS.
export async function linkClaimToPromotedTopic(
  env: ApiEnv,
  claimId: string,
  promotedTopicId: string,
): Promise<boolean> {
  const result = await env.DB.prepare(
    `UPDATE refinement_claims SET promoted_topic_id = ? WHERE id = ? AND promoted_topic_id IS NULL`,
  ).bind(promotedTopicId, claimId).run();
  return Number((result.meta as { changes?: number } | undefined)?.changes ?? 0) > 0;
}

// Fetch a claim by id — used by promoteTopicCandidates to verify a
// sourceClaimId before linking.
export async function getRefinementClaim(env: ApiEnv, claimId: string): Promise<RefinementClaimRecord | null> {
  const row = await firstRow<RefinementClaimRow>(
    env.DB,
    "SELECT id, topic_id, claim_text, classification, source_quote, promoted_topic_id, created_at FROM refinement_claims WHERE id = ?",
    claimId,
  );
  return row ? mapClaimRow(row) : null;
}

// Return all claims for a specific verdict-parent topic. Used for UI
// (topic page shows its unresolved claims) and by the producer to detect
// already-extracted state.
export async function listClaimsForTopic(env: ApiEnv, topicId: string): Promise<RefinementClaimRecord[]> {
  const rows = await allRows<RefinementClaimRow>(
    env.DB,
    `SELECT id, topic_id, claim_text, classification, source_quote, promoted_topic_id, created_at
     FROM refinement_claims
     WHERE topic_id = ?
     ORDER BY created_at ASC`,
    topicId,
  );
  return rows.map(mapClaimRow);
}
