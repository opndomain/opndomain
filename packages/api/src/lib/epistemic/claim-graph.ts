import type { ApiEnv } from "../env.js";
import { allRows, firstRow } from "../db.js";
import { createId } from "../ids.js";
import type { ExtractedClaim } from "./claim-extraction.js";

export type ClaimRelationKind = "support" | "contradiction" | "refinement" | "supersession";

type PersistedClaimRow = {
  id: string;
  body: string;
  normalized_body: string | null;
  contribution_id: string;
  being_id: string;
  ordinal: number;
};

type PersistedRelationRow = {
  id: string;
};

export type PersistedClaim = {
  id: string;
  contributionId: string;
  beingId: string;
  ordinal: number;
  body: string;
  normalizedBody: string;
};

export type ClaimRelationInference = {
  kind: ClaimRelationKind;
  confidence: number;
  explanation: string;
};

export type DomainClaimGraphUpdate = {
  claims: PersistedClaim[];
  relationCount: number;
  evidenceCount: number;
};

function tokenize(normalizedBody: string): string[] {
  return normalizedBody.split(" ").filter((part) => part.length > 1);
}

function overlapScore(left: string, right: string): number {
  const leftTokens = new Set(tokenize(left));
  const rightTokens = new Set(tokenize(right));
  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }
  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      overlap += 1;
    }
  }
  return overlap / Math.min(leftTokens.size, rightTokens.size);
}

function hasNegationFlip(left: string, right: string): boolean {
  const negationPattern = /\b(no|not|never|none|without|cannot|can't|won't)\b/i;
  return negationPattern.test(left) !== negationPattern.test(right);
}

export function inferClaimRelation(
  source: Pick<PersistedClaim, "body" | "normalizedBody">,
  target: Pick<PersistedClaim, "body" | "normalizedBody">,
): ClaimRelationInference | null {
  if (!source.normalizedBody || !target.normalizedBody) {
    return null;
  }

  if (source.normalizedBody === target.normalizedBody) {
    return {
      kind: "supersession",
      confidence: 0.98,
      explanation: "Claims normalize to the same deterministic body.",
    };
  }

  const score = overlapScore(source.normalizedBody, target.normalizedBody);
  if (score < 0.6) {
    return null;
  }

  if (hasNegationFlip(source.body, target.body)) {
    return {
      kind: "contradiction",
      confidence: Math.min(0.95, 0.55 + score * 0.35),
      explanation: "Claims share a strong token overlap but invert polarity.",
    };
  }

  const sourceLength = tokenize(source.normalizedBody).length;
  const targetLength = tokenize(target.normalizedBody).length;
  if (Math.abs(sourceLength - targetLength) >= 3) {
    return {
      kind: "refinement",
      confidence: Math.min(0.92, 0.52 + score * 0.32),
      explanation: "One claim adds more bounded detail to a highly overlapping claim.",
    };
  }

  return {
    kind: "support",
    confidence: Math.min(0.9, 0.45 + score * 0.35),
    explanation: "Claims share a strong normalized overlap without polarity conflict.",
  };
}

function mapRelationToEvidenceKind(kind: ClaimRelationKind): "support" | "challenge" | "context" | "correction" {
  if (kind === "contradiction") {
    return "challenge";
  }
  if (kind === "refinement") {
    return "context";
  }
  if (kind === "supersession") {
    return "correction";
  }
  return "support";
}

async function upsertClaim(
  env: ApiEnv,
  input: {
    topicId: string;
    domainId: string;
    beingId: string;
    contributionId: string;
    claim: ExtractedClaim;
  },
): Promise<PersistedClaim> {
  const existing = await firstRow<PersistedClaimRow>(
    env.DB,
    `
      SELECT id, body, normalized_body, contribution_id, being_id, ordinal
      FROM claims
      WHERE contribution_id = ? AND ordinal = ?
    `,
    input.contributionId,
    input.claim.ordinal,
  );

  const id = existing?.id ?? createId("clm");
  await env.DB
    .prepare(
      `
        INSERT INTO claims (
          id, contribution_id, topic_id, domain_id, being_id, ordinal, body, normalized_body, verifiability, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'extracted')
        ON CONFLICT(contribution_id, ordinal) DO UPDATE SET
          body = excluded.body,
          normalized_body = excluded.normalized_body,
          verifiability = excluded.verifiability,
          status = excluded.status
      `,
    )
    .bind(
      id,
      input.contributionId,
      input.topicId,
      input.domainId,
      input.beingId,
      input.claim.ordinal,
      input.claim.body,
      input.claim.normalizedBody,
      input.claim.verifiability,
    )
    .run();

  await env.DB
    .prepare(
      `
        INSERT INTO claim_resolutions (id, claim_id, domain_id, status, confidence, signal_summary_json)
        VALUES (?, ?, ?, 'unresolved', 0, ?)
        ON CONFLICT(claim_id) DO NOTHING
      `,
    )
    .bind(
      createId("clr"),
      id,
      input.domainId,
      JSON.stringify({ extractionVersion: "deterministic_v1" }),
    )
    .run();

  return {
    id,
    contributionId: input.contributionId,
    beingId: input.beingId,
    ordinal: input.claim.ordinal,
    body: input.claim.body,
    normalizedBody: input.claim.normalizedBody,
  };
}

async function loadDomainClaims(env: ApiEnv, domainId: string, contributionId: string): Promise<PersistedClaim[]> {
  const rows = await allRows<PersistedClaimRow>(
    env.DB,
    `
      SELECT id, body, normalized_body, contribution_id, being_id, ordinal
      FROM claims
      WHERE domain_id = ? AND contribution_id <> ?
      ORDER BY created_at DESC, ordinal ASC
      LIMIT 48
    `,
    domainId,
    contributionId,
  );
  return rows.map((row) => ({
    id: row.id,
    contributionId: row.contribution_id,
    beingId: row.being_id,
    ordinal: Number(row.ordinal),
    body: row.body,
    normalizedBody: row.normalized_body ?? "",
  }));
}

export async function updateDomainClaimGraph(
  env: ApiEnv,
  input: {
    topicId: string;
    domainId: string;
    beingId: string;
    contributionId: string;
    claims: ExtractedClaim[];
  },
): Promise<DomainClaimGraphUpdate> {
  const persistedClaims: PersistedClaim[] = [];
  for (const claim of input.claims) {
    persistedClaims.push(await upsertClaim(env, { ...input, claim }));
  }

  const graphPool = [
    ...(await loadDomainClaims(env, input.domainId, input.contributionId)),
    ...persistedClaims.slice(0, -1),
  ];

  let relationCount = 0;
  let evidenceCount = 0;
  for (const persistedClaim of persistedClaims) {
    for (const candidate of graphPool) {
      if (candidate.id === persistedClaim.id) {
        continue;
      }
      const relation = inferClaimRelation(persistedClaim, candidate);
      if (!relation) {
        continue;
      }

      const existingRelation = await firstRow<PersistedRelationRow>(
        env.DB,
        `
          SELECT id
          FROM claim_relations
          WHERE source_claim_id = ? AND target_claim_id = ? AND relation_kind = ?
        `,
        persistedClaim.id,
        candidate.id,
        relation.kind,
      );
      const relationId = existingRelation?.id ?? createId("crl");
      await env.DB
        .prepare(
          `
            INSERT INTO claim_relations (
              id, domain_id, source_claim_id, target_claim_id, relation_kind, confidence, explanation
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(source_claim_id, target_claim_id, relation_kind) DO UPDATE SET
              confidence = excluded.confidence,
              explanation = excluded.explanation
          `,
        )
        .bind(
          relationId,
          input.domainId,
          persistedClaim.id,
          candidate.id,
          relation.kind,
          relation.confidence,
          relation.explanation,
        )
        .run();
      relationCount += 1;

      await env.DB
        .prepare(
          `
            INSERT INTO claim_resolution_evidence (
              id, claim_id, contribution_id, relation_id, evidence_kind, excerpt, weight
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(claim_id, contribution_id, evidence_kind) DO UPDATE SET
              relation_id = excluded.relation_id,
              excerpt = excluded.excerpt,
              weight = excluded.weight
          `,
        )
        .bind(
          createId("cre"),
          candidate.id,
          input.contributionId,
          relationId,
          mapRelationToEvidenceKind(relation.kind),
          persistedClaim.body.slice(0, 280),
          relation.confidence,
        )
        .run();
      evidenceCount += 1;
    }
    graphPool.push(persistedClaim);
  }

  return { claims: persistedClaims, relationCount, evidenceCount };
}
