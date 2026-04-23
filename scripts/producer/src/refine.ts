import {
  type ExtractedRefinementClaim,
  type TopicCandidate,
  type UnrefinedRefinementClaim,
} from "../../../packages/shared/src/schemas.js";
import { REFINEMENT_CANDIDATE_SOURCE } from "../../../packages/shared/src/constants.js";
import type { ApiClient } from "./api-client.js";
import type { ProducerConfig } from "./types.js";
import * as llmClient from "./llm/client.js";

// ============================================================================
// Phase A: claim extraction
// ============================================================================
//
// For each closed+eligible verdict that has no refinement_claims row yet,
// run an LLM extraction pass that returns a list of distinct unresolved
// claims. Post those to the API so they become first-class refinement
// targets. One extraction per topic, one time — the API rejects duplicate
// extraction attempts to keep claim ids stable.

const CLAIM_EXTRACTION_SYSTEM_PROMPT = [
  "You extract the distinct unresolved claims from a closed debate's verdict.",
  "Each claim must be a specific, contestable proposition the debate did NOT resolve — not a broad topic summary.",
  "Prefer claims that are empirically testable or conceptually sharp. Skip procedural or meta-observations.",
  "If the verdict genuinely resolved everything, return an empty array — do NOT invent claims to fill quota.",
  'Respond as a JSON array: [{"claimText":"...","classification":"contested|minority|methodological|scope","sourceQuote":"..."}].',
  "classification is a short tag describing the claim's shape. sourceQuote is an excerpt from the verdict that supports this being a real unresolved point.",
].join(" ");

function buildExtractionPrompt(
  topic: { title: string; prompt: string },
  refinementStatus: unknown,
): string {
  const status = refinementStatus as {
    whatSettled?: string;
    whatContested?: string;
    strongestObjection?: string;
    neutralVerdict?: string;
    positionSummaries?: Array<{ label: string; classification: string }>;
  };
  const sections: string[] = [
    `Closed debate title: ${topic.title}`,
    `Original prompt: ${topic.prompt}`,
    "",
    "Verdict structure:",
    status.whatSettled ? `SETTLED: ${status.whatSettled}` : "SETTLED: (not reported)",
    status.whatContested ? `CONTESTED: ${status.whatContested}` : "CONTESTED: (not reported)",
  ];
  if (status.strongestObjection) sections.push(`STRONGEST OBJECTION: ${status.strongestObjection}`);
  if (status.neutralVerdict) sections.push(`NEUTRAL VERDICT: ${status.neutralVerdict}`);
  sections.push("");
  sections.push("Position summaries:");
  if (status.positionSummaries?.length) {
    for (const position of status.positionSummaries) {
      sections.push(`- ${position.classification}: ${position.label}`);
    }
  } else {
    sections.push("(none)");
  }
  sections.push("");
  sections.push("Extract the distinct unresolved claims. Return [] if the debate cleanly resolved.");
  return sections.join("\n");
}

function isValidExtractedClaim(value: unknown): value is ExtractedRefinementClaim {
  if (typeof value !== "object" || value === null) return false;
  const v = value as { claimText?: unknown; classification?: unknown; sourceQuote?: unknown };
  if (typeof v.claimText !== "string") return false;
  const text = v.claimText.trim();
  if (text.length < 10 || text.length > 2000) return false;
  if (v.classification !== undefined && (typeof v.classification !== "string" || v.classification.length > 64)) return false;
  if (v.sourceQuote !== undefined && (typeof v.sourceQuote !== "string" || v.sourceQuote.length > 2000)) return false;
  return true;
}

async function runClaimExtractionPass(
  config: ProducerConfig,
  apiClient: ApiClient,
  llm: typeof llmClient,
  filter: { topicId?: string } = {},
): Promise<{ extracted: number; emptyVerdicts: number; failed: number }> {
  const eligible = await apiClient.getRefinementEligible();
  const needsExtraction = await apiClient.getVerdictsNeedingExtraction();
  const needsIds = new Set(needsExtraction.map((v) => v.topicId));
  // getRefinementEligible carries the full refinementStatus we need for the
  // prompt; the needing-extraction endpoint tells us which of those have no
  // claims yet. Intersect, then optionally scope to a single parent topic.
  const pending = eligible
    .filter((topic) => needsIds.has(topic.id))
    .filter((topic) => !filter.topicId || topic.id === filter.topicId);

  let extracted = 0;
  let emptyVerdicts = 0;
  let failed = 0;

  for (const topic of pending) {
    try {
      const prompt = buildExtractionPrompt(topic, topic.refinementStatus);
      const raw = await llm.generateJson(config, CLAIM_EXTRACTION_SYSTEM_PROMPT, prompt);
      const claims = (Array.isArray(raw) ? raw : [])
        .filter(isValidExtractedClaim)
        .map((claim) => ({
          claimText: claim.claimText.trim(),
          classification: claim.classification?.trim() || undefined,
          sourceQuote: claim.sourceQuote?.trim() || undefined,
        }));

      if (claims.length === 0) {
        // Debate genuinely converged or extraction returned nothing usable.
        // We do NOT POST — that would block future extraction attempts, and
        // the LLM may do better next tick. The verdict stays "no claims"
        // meaning eligible topics with zero branches terminate naturally:
        // their children never get spawned.
        emptyVerdicts += 1;
        continue;
      }

      await apiClient.postExtractedClaims(topic.id, claims);
      extracted += 1;
    } catch (error) {
      failed += 1;
      console.error(`claim extraction failed for topic ${topic.id}:`, error instanceof Error ? error.message : error);
    }
  }

  return { extracted, emptyVerdicts, failed };
}

// ============================================================================
// Phase B: generate candidates for unrefined claims
// ============================================================================
//
// Group all unrefined claims by parent topic. For each parent, issue ONE LLM
// call that sees every unresolved claim from that parent and returns a
// deduplicated list of follow-up debates — each output entry can cover one
// or more claims when the LLM judges them to say substantially the same
// thing about the same target. Emit one candidate per output group.
//
// Dedup is strict and parent-local:
//   - Strict: only collapse two+ claims when they say substantially the same
//     thing about the same target. Merely related claims stay separate.
//   - Parent-local: sibling candidates from the same parent share `source_id`
//     and are exempt from the corpus-level findIdeaDuplicate check
//     (`topic-candidates.ts:201` / `:217-221`) by design — the LLM is the
//     authority on within-parent similarity. Cross-parent similarity still
//     flows through findIdeaDuplicate downstream.
//
// LLM-output validation is strict: every input claim must appear in exactly
// one output group. Missing, duplicated, unknown, or empty claimIds fail
// the whole parent's batch — partial output would leave claims unrefined
// forever with no visible error.

const REFINEMENT_SYSTEM_PROMPT = [
  "You generate follow-up debate prompts for opndomain from the unresolved claims of a closed debate.",
  "You receive N claims from a single parent topic, each prefixed with a [claim_id]. Return an array of follow-up topics that cover those claims.",
  "STRICT DEDUP RULE: collapse two or more input claims into one output topic ONLY when they say substantially the same thing about the same target. Merely adjacent or related claims stay separate.",
  "CLAIM COVERAGE RULE: every input claim_id MUST appear in exactly one output entry's claimIds. Do not omit, duplicate, or invent claim_ids.",
  "Each output topic must be narrower than the parent, concrete, contestable, and scoped for a short 5-agent debate. Do NOT restate the parent question — carve out only the claims you are merging.",
  "PROMPT DEPTH RULE: the prompt field must be 3-6 sentences (150-400 words). It must include: (1) specific factual context or data that frames the claim, (2) the competing interpretations or hypotheses at stake, (3) what evidence would distinguish between them, and (4) an explicit evaluation question for debaters. One-liner prompts are not acceptable — the prompt must give debaters enough context to produce substantive, evidence-grounded arguments without external research.",
  'Respond as a JSON array: [{"title":"...","prompt":"...","claimIds":["..."]}].',
].join(" ");

type LlmGroupOutput = { title: string; prompt: string; claimIds: string[] };

function buildParentGroupPrompt(
  parentTopic: UnrefinedRefinementClaim["parentTopic"],
  entries: UnrefinedRefinementClaim[],
): string {
  const sections: string[] = [
    `Parent debate title: ${parentTopic.title}`,
    `Parent debate prompt: ${parentTopic.prompt}`,
    `Parent refinement depth: ${parentTopic.refinementDepth}`,
    "",
    "Unresolved claims from this debate (one per line, prefixed with [claim_id]):",
  ];
  for (const entry of entries) {
    sections.push(`[${entry.claim.id}] ${entry.claim.claimText}`);
    if (entry.claim.classification) {
      sections.push(`  classification: ${entry.claim.classification}`);
    }
    if (entry.claim.sourceQuote) {
      sections.push(`  source quote: "${entry.claim.sourceQuote}"`);
    }
  }
  sections.push("");
  sections.push(
    `Produce follow-up debates that cover every claim_id above in exactly one output entry's claimIds. Collapse semantically-identical claims (same thing, same target). Output a JSON array: [{"title":"...","prompt":"...","claimIds":["..."]}].`,
  );
  return sections.join("\n");
}

function isValidLlmGroup(value: unknown): value is LlmGroupOutput {
  if (typeof value !== "object" || value === null) return false;
  const v = value as { title?: unknown; prompt?: unknown; claimIds?: unknown };
  if (typeof v.title !== "string" || v.title.trim().length < 1 || v.title.trim().length > 200) return false;
  if (typeof v.prompt !== "string" || v.prompt.trim().length < 100 || v.prompt.trim().length > 4000) return false;
  if (!Array.isArray(v.claimIds) || v.claimIds.length === 0) return false;
  for (const id of v.claimIds) {
    if (typeof id !== "string" || id.trim().length === 0) return false;
  }
  return true;
}

type LlmValidationResult =
  | { ok: true; groups: LlmGroupOutput[] }
  | { ok: false; reason: string; missing: string[]; unknown: string[]; duplicated: string[] };

function validateLlmGroups(
  inputClaimIds: Set<string>,
  rawGroups: unknown[],
): LlmValidationResult {
  const groups: LlmGroupOutput[] = [];
  for (const raw of rawGroups) {
    if (!isValidLlmGroup(raw)) continue;
    groups.push({
      title: raw.title.trim(),
      prompt: raw.prompt.trim(),
      claimIds: raw.claimIds.map((id) => id.trim()),
    });
  }

  if (groups.length === 0) {
    return { ok: false, reason: "no_valid_groups", missing: [...inputClaimIds], unknown: [], duplicated: [] };
  }

  const seen = new Set<string>();
  const duplicated: string[] = [];
  const unknown: string[] = [];
  for (const group of groups) {
    for (const id of group.claimIds) {
      if (!inputClaimIds.has(id)) {
        unknown.push(id);
        continue;
      }
      if (seen.has(id)) {
        duplicated.push(id);
        continue;
      }
      seen.add(id);
    }
  }
  const missing = [...inputClaimIds].filter((id) => !seen.has(id));

  if (missing.length > 0 || unknown.length > 0 || duplicated.length > 0) {
    return {
      ok: false,
      reason: missing.length > 0
        ? "missing_claim_ids"
        : unknown.length > 0
          ? "unknown_claim_ids"
          : "duplicated_claim_ids",
      missing,
      unknown,
      duplicated,
    };
  }

  return { ok: true, groups };
}

function candidatesFromClaimGroup(
  parentTopic: UnrefinedRefinementClaim["parentTopic"],
  groups: LlmGroupOutput[],
): TopicCandidate[] {
  return groups.map((group) => ({
    // DTO id for logging/idempotency hints only; row uniqueness is enforced
    // by the DB partial unique index (source, source_id, source_claim_id).
    id: `refinement_${parentTopic.id}_${group.claimIds[0]}`,
    source: REFINEMENT_CANDIDATE_SOURCE,
    sourceId: parentTopic.id,
    sourceClaimId: group.claimIds[0],
    mergedClaimIds: group.claimIds,
    domainId: parentTopic.domainId,
    title: group.title,
    prompt: group.prompt,
    templateId: "debate",
    topicFormat: "scheduled_research",
    cadenceFamily: "scheduled",
    cadenceOverrideMinutes: 2,
    minTrustTier: "unverified",
    priorityScore: 90,
    publishedAt: null,
  }));
}

// Exported for producer-side tests that exercise the LLM-output validation
// contract without needing an actual LLM.
export { buildParentGroupPrompt, isValidLlmGroup, validateLlmGroups, candidatesFromClaimGroup };
export type { LlmGroupOutput, LlmValidationResult };

async function runCandidateGenerationPass(
  config: ProducerConfig,
  apiClient: ApiClient,
  llm: typeof llmClient,
  filter: { topicId?: string } = {},
): Promise<{ candidatesCreated: number; candidatesUpdated: number; duplicates: number; failed: number; unrefined: number }> {
  const allUnrefined = await apiClient.getUnrefinedClaims();
  const unrefined = filter.topicId
    ? allUnrefined.filter((entry) => entry.parentTopic.id === filter.topicId)
    : allUnrefined;
  if (unrefined.length === 0) {
    return { candidatesCreated: 0, candidatesUpdated: 0, duplicates: 0, failed: 0, unrefined: 0 };
  }

  // Group claims by their parent topic so each LLM call has visibility
  // across that parent's full unresolved-claim set (required for dedup).
  const byParent = new Map<string, UnrefinedRefinementClaim[]>();
  for (const entry of unrefined) {
    const list = byParent.get(entry.parentTopic.id);
    if (list) {
      list.push(entry);
    } else {
      byParent.set(entry.parentTopic.id, [entry]);
    }
  }

  const candidates: TopicCandidate[] = [];
  let failed = 0;
  for (const [parentTopicId, entries] of byParent) {
    try {
      const parentTopic = entries[0]!.parentTopic;
      const inputClaimIds = new Set(entries.map((entry) => entry.claim.id));
      const prompt = buildParentGroupPrompt(parentTopic, entries);
      const raw = await llm.generateJson(config, REFINEMENT_SYSTEM_PROMPT, prompt);
      const rawGroups = Array.isArray(raw) ? raw : [];
      const validation = validateLlmGroups(inputClaimIds, rawGroups);
      if (!validation.ok) {
        failed += 1;
        console.error(`candidate generation failed for parent ${parentTopicId}: ${validation.reason}`, {
          missing: validation.missing,
          unknown: validation.unknown,
          duplicated: validation.duplicated,
        });
        continue;
      }
      candidates.push(...candidatesFromClaimGroup(parentTopic, validation.groups));
    } catch (error) {
      failed += 1;
      console.error(
        `candidate generation failed for parent ${parentTopicId}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  if (candidates.length === 0) {
    return { candidatesCreated: 0, candidatesUpdated: 0, duplicates: 0, failed, unrefined: unrefined.length };
  }

  // The API-side batchUpsertTopicCandidates runs its own findIdeaDuplicate
  // check against existing topics+candidates. Near-duplicates (i.e. claims
  // that already map to an existing topic in a DIFFERENT parent subtree) are
  // rejected as duplicates — sibling refinement candidates under the same
  // parent bypass that check by design (see the dedup scope note above).
  const result = await apiClient.upsertCandidates(candidates);
  return {
    candidatesCreated: result.createdCount,
    candidatesUpdated: result.updatedCount,
    duplicates: result.duplicates.length,
    failed,
    unrefined: unrefined.length,
  };
}

// ============================================================================
// Public entrypoint
// ============================================================================

export async function runRefinementPass(
  config: ProducerConfig,
  apiClient: ApiClient,
  llm: typeof llmClient,
  filter: { topicId?: string } = {},
) {
  const extraction = await runClaimExtractionPass(config, apiClient, llm, filter);
  const generation = await runCandidateGenerationPass(config, apiClient, llm, filter);
  return { extraction, generation };
}
