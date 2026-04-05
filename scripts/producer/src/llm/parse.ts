import { z } from "zod";
import type { CandidateOutput, ProducerMode, SourceName } from "../types.js";
import { DOMAIN_BY_ID } from "../domains.js";

const VALID_TEMPLATES = new Set(["debate_v1", "debate_v2", "research", "deep", "socratic", "chaos"]);
const VALID_FORMATS = new Set(["scheduled_research", "rolling_research"]);
const VALID_CADENCE_FAMILIES = new Set(["scheduled", "quorum", "rolling"]);
const VALID_TRUST_TIERS = new Set(["unverified", "supervised", "verified", "established", "trusted"]);
const ATTENTION_TITLE_MAX = 120;
const ATTENTION_GENERIC_STARTERS = new Set([
  "should",
  "will",
  "can",
  "could",
  "would",
  "is",
  "are",
  "do",
  "does",
  "did",
  "how",
  "why",
  "what",
  "when",
  "where",
  "who",
]);
const ATTENTION_JARGON_PATTERNS = [
  /\btransportability\b/i,
  /\bmaximin-regret\b/i,
  /\bx-risk\b/i,
  /\bELCC\b/i,
  /\bhydrogeomorphic\b/i,
  /\bdenitrification\b/i,
  /\bquorum\b/i,
  /\bdeploy(?:ment)? gate\b/i,
];
const ATTENTION_BROAD_TITLE_PATTERNS = [
  /\bstate of (?:the )?/i,
  /\bfuture of\b/i,
  /\bhow should [^?]{0,80}\b(?:change|adapt|respond|evolve)\b/i,
  /\bwhat should [^?]{0,80}\b(?:do|look like|be)\b/i,
  /\bwhy (?:is|are) [^?]{0,80}\bimportant\b/i,
];

function hasAttentionAnchor(title: string): boolean {
  const trimmed = title.trim();
  if (!trimmed) return false;
  if (/\b[A-Z]{2,}\b/.test(trimmed)) return true;
  if (/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/.test(trimmed)) return true;
  if (/\b\d{1,4}\b/.test(trimmed)) return true;

  const words = trimmed.match(/[A-Za-z0-9']+/g) ?? [];
  const firstWord = words[0];
  if (!firstWord) return false;

  if (
    /^[A-Z][A-Za-z0-9']*$/.test(firstWord) &&
    !ATTENTION_GENERIC_STARTERS.has(firstWord.toLowerCase())
  ) {
    return true;
  }

  return words.slice(1).some((word) => /^[A-Z][A-Za-z0-9']*$/.test(word));
}

const GeneratedCandidateSchema = z.object({
  domainId: z.string().min(1),
  title: z.string().min(1).max(200),
  prompt: z.string().min(1).max(4000),
  templateId: z.string().min(1),
  topicFormat: z.string().min(1),
  cadenceFamily: z.string().min(1),
  minTrustTier: z.string().min(1).default("supervised"),
});

export function validateCandidate(
  raw: unknown,
  source: SourceName,
  sourceId: string,
  sourceUrl: string | null,
  publishedAt: string | null,
  priorityScore: number,
  mode: ProducerMode,
): CandidateOutput | null {
  const parsed = GeneratedCandidateSchema.safeParse(raw);
  if (!parsed.success) {
    return null;
  }

  const c = parsed.data;

  if (!DOMAIN_BY_ID.has(c.domainId)) return null;
  if (!VALID_TEMPLATES.has(c.templateId)) return null;
  if (!VALID_FORMATS.has(c.topicFormat)) return null;
  if (!VALID_CADENCE_FAMILIES.has(c.cadenceFamily)) return null;
  if (!VALID_TRUST_TIERS.has(c.minTrustTier)) return null;

  if (mode === "attention") {
    if (c.templateId !== "debate_v2") return null;
    if (c.topicFormat !== "scheduled_research") return null;
    if (c.cadenceFamily !== "scheduled") return null;
    if (c.title.length > ATTENTION_TITLE_MAX) return null;
    if (ATTENTION_JARGON_PATTERNS.some((pattern) => pattern.test(c.title) || pattern.test(c.prompt))) return null;
    if (ATTENTION_BROAD_TITLE_PATTERNS.some((pattern) => pattern.test(c.title))) return null;
    if (!hasAttentionAnchor(c.title)) return null;
  }

  return {
    source,
    sourceId,
    sourceUrl,
    domainId: c.domainId,
    title: c.title,
    prompt: c.prompt,
    templateId: c.templateId,
    topicFormat: c.topicFormat,
    cadenceFamily: c.cadenceFamily,
    cadenceOverrideMinutes: null,
    minTrustTier: c.minTrustTier,
    priorityScore,
    publishedAt,
  };
}
