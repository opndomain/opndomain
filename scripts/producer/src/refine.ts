import {
  type RefinementEligibleTopic,
  type RefinementPositionSummary,
  type RefinementStatus,
  type TopicCandidate,
} from "../../../packages/shared/src/schemas.js";
import { REFINEMENT_CANDIDATE_SOURCE } from "../../../packages/shared/src/constants.js";
import type { ApiClient } from "./api-client.js";
import type { ProducerConfig } from "./types.js";
import * as llmClient from "./llm/client.js";

const REFINEMENT_SYSTEM_PROMPT = [
  "You generate follow-up debate prompts for opndomain.",
  "Produce a narrower investigation that targets the unresolved claim from a prior closed topic.",
  "Keep the new debate concrete, contestable, and scoped tightly enough for a short 5-agent investigation.",
  "Respond as a JSON array with exactly one object: [{\"title\":\"...\",\"prompt\":\"...\"}].",
].join(" ");

function summarizePositions(refinementStatus: RefinementStatus): string {
  const summaries = refinementStatus.positionSummaries ?? [];
  if (summaries.length === 0) {
    return "No structured position breakdown was stored.";
  }
  return summaries.map((position: RefinementPositionSummary) => `${position.classification}: ${position.label}`).join("\n");
}

function buildRefinementLLMPrompt(topic: RefinementEligibleTopic): string {
  return [
    `Prior topic title: ${topic.title}`,
    `Prior topic prompt: ${topic.prompt}`,
    `Current refinement depth: ${topic.refinementDepth}`,
    `Eligibility reason: ${topic.refinementStatus.reason}`,
    "",
    "Settled ground:",
    topic.refinementStatus.whatSettled ?? "Not explicitly provided.",
    "",
    "Contested ground:",
    topic.refinementStatus.whatContested ?? "Not explicitly provided.",
    "",
    "Strongest objection:",
    topic.refinementStatus.strongestObjection ?? "Not explicitly provided.",
    "",
    "Neutral verdict:",
    topic.refinementStatus.neutralVerdict ?? "Not explicitly provided.",
    "",
    "Position summaries:",
    summarizePositions(topic.refinementStatus),
    "",
    "Generate a narrower follow-up debate question.",
    'Output a JSON array with exactly one object: [{ "title": "...", "prompt": "..." }]',
  ].join("\n");
}

function isValidGeneratedRefinement(value: unknown): value is { title: string; prompt: string } {
  return typeof value === "object"
    && value !== null
    && typeof (value as { title?: unknown }).title === "string"
    && typeof (value as { prompt?: unknown }).prompt === "string"
    && (value as { title: string }).title.trim().length >= 1
    && (value as { title: string }).title.trim().length <= 200
    && (value as { prompt: string }).prompt.trim().length >= 100
    && (value as { prompt: string }).prompt.trim().length <= 4000;
}

export async function runRefinementPass(
  config: ProducerConfig,
  apiClient: ApiClient,
  llm: typeof llmClient,
) {
  const eligible = await apiClient.getRefinementEligible();
  if (eligible.length === 0) {
    return { refined: 0, createdCount: 0, updatedCount: 0, duplicates: 0, failed: 0 };
  }

  const candidates: TopicCandidate[] = [];
  let failed = 0;
  for (const topic of eligible) {
    const prompt = buildRefinementLLMPrompt(topic);
    try {
      const results = await llm.generateJson(config, REFINEMENT_SYSTEM_PROMPT, prompt);
      const generated = results[0];
      if (!isValidGeneratedRefinement(generated)) {
        continue;
      }

      candidates.push({
        id: `refinement_${topic.id}`,
        source: REFINEMENT_CANDIDATE_SOURCE,
        sourceId: topic.id,
        domainId: topic.domainId,
        title: generated.title.trim(),
        prompt: generated.prompt.trim(),
        templateId: "debate",
        topicFormat: "scheduled_research",
        cadenceFamily: "scheduled",
        cadenceOverrideMinutes: 2,
        minTrustTier: "unverified",
        priorityScore: 90,
        publishedAt: null,
      });
    } catch (error) {
      failed += 1;
      console.error(`refinement generate failed for topic ${topic.id}:`, error instanceof Error ? error.message : error);
    }
  }

  if (candidates.length === 0) {
    return { refined: eligible.length, createdCount: 0, updatedCount: 0, duplicates: 0, failed };
  }

  const result = await apiClient.upsertCandidates(candidates);
  return {
    refined: eligible.length,
    createdCount: result.createdCount,
    updatedCount: result.updatedCount,
    duplicates: result.duplicates.length,
    failed,
  };
}
