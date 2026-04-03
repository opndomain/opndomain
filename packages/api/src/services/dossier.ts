import {
  DossierDataSchema,
  type DossierData,
  type DossierClaim,
  type DossierContestedClaim,
  type DossierClaimConfidence,
  type DossierEvidenceSnippet,
} from "@opndomain/shared";
import type { ApiEnv } from "../lib/env.js";
import { allRows, firstRow, runStatement } from "../lib/db.js";
import { createId } from "../lib/ids.js";

// ---------------------------------------------------------------------------
// Row types for DB queries
// ---------------------------------------------------------------------------

type ClaimRow = {
  id: string;
  body: string;
  contribution_id: string;
  being_id: string;
  being_handle: string;
  verifiability: string;
  resolution_status: string;
  resolution_confidence: number;
};

type EvidenceRow = {
  claim_id: string;
  contribution_id: string;
  being_handle: string;
  evidence_kind: string;
  excerpt: string | null;
  weight: number;
};

type EvidenceAggRow = {
  claim_id: string;
  support_weight: number;
  challenge_weight: number;
  total_evidence: number;
  support_evidence_count: number;
  challenge_evidence_count: number;
};

type ContradictionRow = {
  target_claim_id: string;
  source_claim_id: string;
  source_body: string;
  confidence: number;
};

type TopicStatsRow = {
  completed_rounds: number;
  total_rounds: number;
  participant_count: number;
  contribution_count: number;
};

type PositionRow = {
  label: string;
  support_pct: number;
};

type VerdictRow = {
  confidence: string;
  positions_json: string | null;
};

// ---------------------------------------------------------------------------
// Confidence label assignment
// ---------------------------------------------------------------------------

export function assignConfidenceLabel(
  resolutionStatus: string,
  resolutionConfidence: number,
  supportEvidenceCount: number,
  totalEvidence: number,
): DossierClaimConfidence {
  const reasons: string[] = [];
  if (supportEvidenceCount > 0) reasons.push(`${supportEvidenceCount} supporting contribution${supportEvidenceCount === 1 ? "" : "s"}`);
  const challengeCount = totalEvidence - supportEvidenceCount;
  if (challengeCount > 0) reasons.push(`${challengeCount} challenging contribution${challengeCount === 1 ? "" : "s"}`);
  reasons.push(`Resolution status: ${resolutionStatus}`);

  if (
    resolutionStatus === "supported" &&
    resolutionConfidence >= 0.7 &&
    supportEvidenceCount >= 3
  ) {
    return { label: "high", reasons };
  }

  if (
    (resolutionStatus === "supported" || resolutionStatus === "contested") &&
    resolutionConfidence >= 0.4 &&
    totalEvidence >= 2
  ) {
    return { label: "medium", reasons };
  }

  if (reasons.length === 1) {
    // Only has resolution status, no evidence
    reasons.unshift("No evidence linked to this claim");
  }
  return { label: "low", reasons };
}

// ---------------------------------------------------------------------------
// Executive summary template
// ---------------------------------------------------------------------------

export function buildExecutiveSummary(
  stats: TopicStatsRow,
  strongestPosition: PositionRow | null,
  contestationLevel: "high" | "moderate" | "low",
  confidenceLabel: string,
  confidenceReason: string,
): string {
  const outcomeText = stats.contribution_count > 0
    ? `${stats.contribution_count} contributions were analyzed across the discussion.`
    : "No contributions were recorded.";

  const positionText = strongestPosition
    ? `The strongest position (${Math.round(strongestPosition.support_pct)}% support): "${strongestPosition.label}".`
    : "No clear position emerged.";

  const contestationText = contestationLevel === "high"
    ? "Significant contestation was recorded among claims."
    : contestationLevel === "moderate"
      ? "Moderate contestation was recorded among claims."
      : "Low contestation was recorded among claims.";

  return [
    `This topic closed after ${stats.completed_rounds} of ${stats.total_rounds} rounds with ${stats.participant_count} participant${stats.participant_count === 1 ? "" : "s"} contributing ${stats.contribution_count} entr${stats.contribution_count === 1 ? "y" : "ies"}.`,
    outcomeText,
    positionText,
    contestationText,
    `Confidence: ${confidenceLabel}. ${confidenceReason}`,
  ].join(" ");
}

// ---------------------------------------------------------------------------
// assembleDossier — deterministic assembly from claims/relations/evidence
// ---------------------------------------------------------------------------

export async function assembleDossier(
  env: ApiEnv,
  topicId: string,
): Promise<DossierData | null> {
  // ---- 1. Get superseded claim IDs for dedup ----
  const supersededRows = await allRows<{ target_claim_id: string }>(
    env.DB,
    `SELECT target_claim_id FROM claim_relations
     WHERE source_claim_id IN (SELECT id FROM claims WHERE topic_id = ?)
       AND relation_kind = 'supersession'`,
    topicId,
  );
  const supersededIds = new Set(supersededRows.map((r) => r.target_claim_id));

  // ---- 2. Get all claims for topic with resolution + being handle ----
  const claimRows = await allRows<ClaimRow>(
    env.DB,
    `SELECT
       c.id,
       c.body,
       c.contribution_id,
       c.being_id,
       b.handle AS being_handle,
       c.verifiability,
       COALESCE(cr.status, 'unresolved') AS resolution_status,
       COALESCE(cr.confidence, 0) AS resolution_confidence
     FROM claims c
     LEFT JOIN claim_resolutions cr ON cr.claim_id = c.id
     LEFT JOIN beings b ON b.id = c.being_id
     WHERE c.topic_id = ?`,
    topicId,
  );

  // Filter out superseded claims
  const activeClaims = claimRows.filter((c) => !supersededIds.has(c.id));

  // ---- 3. Get evidence aggregates per claim ----
  const evidenceAggs = await allRows<EvidenceAggRow>(
    env.DB,
    `SELECT
       cre.claim_id,
       COALESCE(SUM(CASE WHEN cre.evidence_kind = 'support' THEN cre.weight ELSE 0 END), 0) AS support_weight,
       COALESCE(SUM(CASE WHEN cre.evidence_kind = 'challenge' THEN cre.weight ELSE 0 END), 0) AS challenge_weight,
       COUNT(*) AS total_evidence,
       SUM(CASE WHEN cre.evidence_kind = 'support' THEN 1 ELSE 0 END) AS support_evidence_count,
       SUM(CASE WHEN cre.evidence_kind = 'challenge' THEN 1 ELSE 0 END) AS challenge_evidence_count
     FROM claim_resolution_evidence cre
     JOIN claims cl ON cl.id = cre.claim_id
     WHERE cl.topic_id = ?
     GROUP BY cre.claim_id`,
    topicId,
  );
  const evidenceMap = new Map(evidenceAggs.map((e) => [e.claim_id, e]));

  // ---- 4. Get top evidence snippets per claim ----
  const evidenceSnippets = await allRows<EvidenceRow>(
    env.DB,
    `SELECT
       cre.claim_id,
       cre.contribution_id,
       COALESCE(b.handle, 'unknown') AS being_handle,
       cre.evidence_kind,
       cre.excerpt,
       cre.weight
     FROM claim_resolution_evidence cre
     JOIN contributions co ON co.id = cre.contribution_id
     JOIN beings b ON b.id = co.being_id
     JOIN claims cl ON cl.id = cre.claim_id
     WHERE cl.topic_id = ?
     ORDER BY cre.weight DESC`,
    topicId,
  );
  const snippetsByClaimId = new Map<string, EvidenceRow[]>();
  for (const s of evidenceSnippets) {
    const list = snippetsByClaimId.get(s.claim_id) ?? [];
    list.push(s);
    snippetsByClaimId.set(s.claim_id, list);
  }

  // ---- 5. Get contradiction relations for contested claims ----
  const contradictions = await allRows<ContradictionRow>(
    env.DB,
    `SELECT
       cr.target_claim_id,
       cr.source_claim_id,
       c.body AS source_body,
       cr.confidence
     FROM claim_relations cr
     JOIN claims c ON c.id = cr.source_claim_id
     WHERE cr.target_claim_id IN (SELECT id FROM claims WHERE topic_id = ?)
       AND cr.relation_kind = 'contradiction'
     ORDER BY cr.confidence DESC`,
    topicId,
  );
  const contradictionsByClaimId = new Map<string, ContradictionRow[]>();
  for (const ct of contradictions) {
    const list = contradictionsByClaimId.get(ct.target_claim_id) ?? [];
    list.push(ct);
    contradictionsByClaimId.set(ct.target_claim_id, list);
  }

  // ---- 6. Build ranked best-supported claims (top 5) ----
  type RankedClaim = ClaimRow & { netSupport: number; rankScore: number; agg: EvidenceAggRow };
  const rankedSupported: RankedClaim[] = [];
  for (const claim of activeClaims) {
    const agg = evidenceMap.get(claim.id);
    if (!agg || agg.total_evidence < 1) continue;
    const netSupport = agg.support_weight - agg.challenge_weight;
    if (netSupport <= 0) continue;
    rankedSupported.push({
      ...claim,
      netSupport,
      rankScore: netSupport * claim.resolution_confidence,
      agg,
    });
  }
  rankedSupported.sort((a, b) => b.rankScore - a.rankScore);
  const topSupported = rankedSupported.slice(0, 5);

  // ---- 7. Build ranked most-contested claims (top 5) ----
  type ContestedRanked = ClaimRow & { contestationScore: number; agg: EvidenceAggRow | undefined };
  const rankedContested: ContestedRanked[] = [];
  for (const claim of activeClaims) {
    const agg = evidenceMap.get(claim.id);
    const challengeWeight = agg?.challenge_weight ?? 0;
    const contradictionCount = contradictionsByClaimId.get(claim.id)?.length ?? 0;
    if (challengeWeight <= 0 && contradictionCount <= 0) continue;
    rankedContested.push({
      ...claim,
      contestationScore: challengeWeight + contradictionCount * 0.5,
      agg,
    });
  }
  rankedContested.sort((a, b) => b.contestationScore - a.contestationScore);
  const topContested = rankedContested.slice(0, 5);

  // ---- Helper: build evidence snippets for a claim ----
  function buildEvidenceSnippets(claimId: string): DossierEvidenceSnippet[] {
    const snippets = snippetsByClaimId.get(claimId) ?? [];
    return snippets.slice(0, 5).map((s) => ({
      contributionId: s.contribution_id,
      beingHandle: s.being_handle,
      evidenceKind: s.evidence_kind as DossierEvidenceSnippet["evidenceKind"],
      excerpt: (s.excerpt ?? "").slice(0, 280),
      finalScore: s.weight,
    }));
  }

  // ---- Helper: build a DossierClaim ----
  function buildDossierClaim(claim: ClaimRow, agg: EvidenceAggRow | undefined): DossierClaim {
    const totalEvidence = agg?.total_evidence ?? 0;
    const supportCount = agg?.support_evidence_count ?? 0;
    return {
      claimId: claim.id,
      body: claim.body,
      contributionId: claim.contribution_id,
      beingHandle: claim.being_handle ?? "unknown",
      verifiability: (claim.verifiability || "unclassified") as DossierClaim["verifiability"],
      resolutionStatus: (claim.resolution_status || "unresolved") as DossierClaim["resolutionStatus"],
      confidence: assignConfidenceLabel(
        claim.resolution_status,
        claim.resolution_confidence,
        supportCount,
        totalEvidence,
      ),
      evidenceCount: totalEvidence,
      evidence: buildEvidenceSnippets(claim.id),
    };
  }

  const bestSupportedClaims: DossierClaim[] = topSupported.map((c) => buildDossierClaim(c, c.agg));

  const mostContestedClaims: DossierContestedClaim[] = topContested.map((c) => {
    const base = buildDossierClaim(c, c.agg);
    const contradictionList = contradictionsByClaimId.get(c.id);
    const strongest = contradictionList?.[0] ?? null;
    return {
      ...base,
      strongestContradiction: strongest
        ? { claimId: strongest.source_claim_id, body: strongest.source_body, confidence: strongest.confidence }
        : null,
    };
  });

  // ---- 8. Topic stats for executive summary ----
  const stats = await firstRow<TopicStatsRow>(
    env.DB,
    `SELECT
       (SELECT COUNT(*) FROM rounds WHERE topic_id = ? AND status = 'completed') AS completed_rounds,
       (SELECT COUNT(*) FROM rounds WHERE topic_id = ?) AS total_rounds,
       (SELECT COUNT(DISTINCT being_id) FROM contributions WHERE topic_id = ?) AS participant_count,
       (SELECT COUNT(*) FROM contributions WHERE topic_id = ?) AS contribution_count`,
    topicId, topicId, topicId, topicId,
  );
  const topicStats: TopicStatsRow = stats ?? {
    completed_rounds: 0,
    total_rounds: 0,
    participant_count: 0,
    contribution_count: 0,
  };

  // ---- 9. Strongest position ----
  const verdict = await firstRow<VerdictRow>(
    env.DB,
    `SELECT confidence, positions_json FROM verdicts WHERE topic_id = ? ORDER BY created_at DESC LIMIT 1`,
    topicId,
  );

  let strongestPosition: PositionRow | null = null;
  if (verdict?.positions_json) {
    try {
      const positions = JSON.parse(verdict.positions_json);
      if (Array.isArray(positions) && positions.length > 0) {
        // Canonical shape: { label, strength, contributionIds, aggregateScore, stanceCounts }
        const sorted = [...positions].sort((a: any, b: any) => (b.strength ?? 0) - (a.strength ?? 0));
        strongestPosition = { label: sorted[0].label ?? "Unknown", support_pct: sorted[0].strength ?? 0 };
      }
    } catch { /* non-fatal */ }
  }

  // ---- 10. Contestation level ----
  const totalContested = rankedContested.length;
  const contestationLevel: "high" | "moderate" | "low" =
    totalContested >= 5 ? "high" : totalContested >= 2 ? "moderate" : "low";

  // ---- 11. Confidence for summary ----
  const verdictConfidence = verdict?.confidence ?? "emerging";
  const confidenceReason = `${topicStats.completed_rounds}/${topicStats.total_rounds} rounds completed.`;

  const executiveSummary = buildExecutiveSummary(
    topicStats,
    strongestPosition,
    contestationLevel,
    verdictConfidence,
    confidenceReason,
  );

  const claimSectionEmpty = bestSupportedClaims.length === 0 && mostContestedClaims.length === 0;

  // ---- 12. Persist snapshot ----
  const assembledAt = new Date().toISOString();

  // Determine the next revision: read existing row first
  const existingSnapshot = await firstRow<{ revision: number }>(
    env.DB,
    `SELECT revision FROM dossier_snapshots WHERE topic_id = ?`,
    topicId,
  );
  const nextRevision = existingSnapshot ? existingSnapshot.revision + 1 : 1;

  const dossierData: DossierData = DossierDataSchema.parse({
    assembledAt,
    assemblyMethod: "deterministic_v1",
    revision: nextRevision,
    executiveSummary,
    bestSupportedClaims,
    mostContestedClaims,
    claimSectionEmpty,
  });

  const id = createId("dos");
  const snapshotJson = JSON.stringify(dossierData);

  await runStatement(
    env.DB.prepare(
      `INSERT INTO dossier_snapshots (id, topic_id, revision, assembled_at, assembly_method, snapshot_json)
       VALUES (?, ?, ?, ?, 'deterministic_v1', ?)
       ON CONFLICT(topic_id) DO UPDATE SET
         revision = excluded.revision,
         assembled_at = excluded.assembled_at,
         assembly_method = excluded.assembly_method,
         snapshot_json = excluded.snapshot_json,
         updated_at = CURRENT_TIMESTAMP`,
    ).bind(id, topicId, nextRevision, assembledAt, snapshotJson),
  );

  return dossierData;
}

// ---------------------------------------------------------------------------
// getDossierData — read existing snapshot
// ---------------------------------------------------------------------------

export async function getDossierData(
  env: ApiEnv,
  topicId: string,
): Promise<DossierData | null> {
  const row = await firstRow<{ snapshot_json: string }>(
    env.DB,
    `SELECT snapshot_json FROM dossier_snapshots WHERE topic_id = ?`,
    topicId,
  );
  if (!row) return null;
  try {
    return DossierDataSchema.parse(JSON.parse(row.snapshot_json));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// assembleMergeDossier — assemble a dossier keyed by merge revision / content hash
// For autonomous rolling topics, dossier snapshots are keyed by merge_revision
// and deduplicated by content_hash to prevent revision inflation on retries.
// ---------------------------------------------------------------------------

export async function assembleMergeDossier(
  env: ApiEnv,
  topicId: string,
  mergeRevision: number,
  mergeOutput: { mergedSlotVoteTallies: Array<{ canonicalSlotId: string; slotLabel: string; slotKind: string; accurateNet: number; interestingNet: number; hallucinatedNet: number; totalVotes: number }>; totalParticipants: number },
): Promise<DossierData> {
  // Build dossier from merge output rather than from raw claims
  const assembledAt = new Date().toISOString();

  // Use merge slot tallies as the epistemic signal
  const bestSupported = mergeOutput.mergedSlotVoteTallies
    .filter((t) => t.accurateNet > 0)
    .sort((a, b) => b.accurateNet - a.accurateNet)
    .slice(0, 5);

  const mostContested = mergeOutput.mergedSlotVoteTallies
    .filter((t) => t.hallucinatedNet > 0 || (t.accurateNet < 0 && t.totalVotes > 0))
    .sort((a, b) => b.hallucinatedNet - a.hallucinatedNet || a.accurateNet - b.accurateNet)
    .slice(0, 5);

  const contestationLevel: "high" | "moderate" | "low" =
    mostContested.length >= 5 ? "high" : mostContested.length >= 2 ? "moderate" : "low";

  const executiveSummary = `Merged dossier from ${mergeOutput.totalParticipants} participants across merge revision ${mergeRevision}. Contestation: ${contestationLevel}.`;

  const dossierData: DossierData = DossierDataSchema.parse({
    assembledAt,
    assemblyMethod: "merge_deterministic_v1",
    revision: mergeRevision,
    executiveSummary,
    bestSupportedClaims: bestSupported.map((t) => ({
      claimId: t.canonicalSlotId,
      body: t.slotLabel,
      authorHandle: "merged",
      verifiability: "unclassified",
      confidence: { label: t.accurateNet >= 3 ? "high" : t.accurateNet >= 1 ? "medium" : "low", reasons: [`${t.accurateNet} net accurate votes`] },
      evidenceSnippets: [],
      contradictions: [],
    })),
    mostContestedClaims: mostContested.map((t) => ({
      claimId: t.canonicalSlotId,
      body: t.slotLabel,
      authorHandle: "merged",
      challengeCount: t.hallucinatedNet,
      supportCount: t.accurateNet,
    })),
    claimSectionEmpty: bestSupported.length === 0 && mostContested.length === 0,
  });

  const snapshotJson = JSON.stringify(dossierData);

  // Compute content hash for dedup
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(snapshotJson));
  const contentHash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Check if identical content already exists for this topic
  const existingByHash = await firstRow<{ id: string }>(
    env.DB,
    `SELECT id FROM dossier_snapshots WHERE topic_id = ? AND content_hash = ?`,
    topicId,
    contentHash,
  );
  if (existingByHash) {
    // Identical content — no new snapshot needed
    return dossierData;
  }

  const id = createId("dos");
  await runStatement(
    env.DB.prepare(
      `INSERT INTO dossier_snapshots
       (id, topic_id, revision, assembled_at, assembly_method, snapshot_json, merge_revision, content_hash)
       VALUES (?, ?, ?, ?, 'merge_deterministic_v1', ?, ?, ?)
       ON CONFLICT(topic_id) DO UPDATE SET
         revision = excluded.revision,
         assembled_at = excluded.assembled_at,
         assembly_method = excluded.assembly_method,
         snapshot_json = excluded.snapshot_json,
         merge_revision = excluded.merge_revision,
         content_hash = excluded.content_hash,
         updated_at = CURRENT_TIMESTAMP`,
    ).bind(id, topicId, mergeRevision, assembledAt, snapshotJson, mergeRevision, contentHash),
  );

  return dossierData;
}
