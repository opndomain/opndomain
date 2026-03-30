import { z } from "zod";
import type { RoundKind } from "@opndomain/shared";
import type { ApiEnv } from "../lib/env.js";

const DEFAULT_ZHIPU_BASE_URL = "https://api.z.ai/api/paas/v4";
const MAX_TRANSCRIPT_CHARS = 4000;
const MAX_SUMMARY_CHARS = 320;
const MAX_EDITORIAL_BODY_CHARS = 2400;
const MAX_NARRATIVE_SUMMARY_CHARS = 280;
const MAX_HIGHLIGHT_EXCERPT_CHARS = 240;
const MAX_HIGHLIGHT_REASON_CHARS = 180;

const VerdictEditorialSchema = z.object({
  summary: z.string().trim().min(1).max(MAX_SUMMARY_CHARS),
  editorialBody: z.string().trim().min(1).max(MAX_EDITORIAL_BODY_CHARS),
  narrative: z.array(z.object({
    roundIndex: z.number().int().nonnegative(),
    roundKind: z.string().trim().min(1),
    title: z.string().trim().min(1).max(80),
    summary: z.string().trim().min(1).max(MAX_NARRATIVE_SUMMARY_CHARS),
  })).min(1).max(12),
  highlights: z.array(z.object({
    contributionId: z.string().trim().min(1),
    beingId: z.string().trim().min(1),
    beingHandle: z.string().trim().min(1),
    roundKind: z.string().trim().min(1),
    excerpt: z.string().trim().min(1).max(MAX_HIGHLIGHT_EXCERPT_CHARS),
    finalScore: z.number().finite(),
    reason: z.string().trim().min(1).max(MAX_HIGHLIGHT_REASON_CHARS),
  })).min(1).max(4),
});

const ZhipuChatResponseSchema = z.object({
  choices: z.array(z.object({
    message: z.object({
      content: z.string().min(1),
    }),
  })).min(1),
});

export type VerdictEditorialInput = {
  rounds: Array<{
    roundIndex: number;
    roundKind: RoundKind;
    status: string;
  }>;
  leaders: Array<{
    roundKind: string;
    contributions: Array<{
      contributionId: string;
      beingId: string;
      beingHandle: string;
      finalScore: number;
      excerpt: string;
    }>;
  }>;
  summary: string;
  participantCount: number;
  contributionCount: number;
};

export type VerdictEditorialOutput = z.infer<typeof VerdictEditorialSchema>;

function normalizeText(value: string, maxLength: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function ensureSafeText(value: string): string {
  if (/[<>]/.test(value) || /```/.test(value)) {
    throw new Error("unsafe editorial output");
  }
  return value;
}

function buildTranscriptContext(input: VerdictEditorialInput): string {
  const parts: string[] = [
    `Participant count: ${input.participantCount}`,
    `Contribution count: ${input.contributionCount}`,
    `Summary: ${normalizeText(input.summary, 300)}`,
  ];

  for (const round of input.rounds) {
    const leader = input.leaders.find((entry) => entry.roundKind === round.roundKind);
    const topContributions = leader?.contributions ?? [];
    const transcriptBlock = [
      `Round ${round.roundIndex + 1}: ${round.roundKind} (${round.status})`,
      ...topContributions.map((contribution, index) =>
        `${index + 1}. @${contribution.beingHandle} score=${contribution.finalScore.toFixed(1)} id=${contribution.contributionId} being=${contribution.beingId} "${normalizeText(contribution.excerpt, 140)}"`),
    ].join("\n");
    parts.push(transcriptBlock);
  }

  return parts.join("\n\n").slice(0, MAX_TRANSCRIPT_CHARS);
}

function timeoutSignal(timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("zhipu_timeout")), timeoutMs);
  controller.signal.addEventListener("abort", () => clearTimeout(timeout), { once: true });
  return controller.signal;
}

export async function generateVerdictEditorial(
  env: ApiEnv,
  input: VerdictEditorialInput,
): Promise<VerdictEditorialOutput | null> {
  const apiKey = env.ZHIPU_API_KEY?.trim?.() ?? "";
  if (!apiKey) {
    return null;
  }

  const transcriptContext = buildTranscriptContext(input);
  const completedRounds = input.rounds.filter((round) => round.status === "completed").length;
  const endpoint = `${(env.ZHIPU_BASE_URL ?? DEFAULT_ZHIPU_BASE_URL).replace(/\/+$/, "")}/chat/completions`;
  const timeoutMs = env.ZHIPU_TIMEOUT_MS ?? 8000;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.ZHIPU_MODEL || "glm-4.7",
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You generate verdict editorial JSON for opndomain closed topics.",
            "Return only valid JSON with keys: summary, editorialBody, narrative, highlights.",
            "Use only transcript-visible information. Do not invent facts, actors, or rounds.",
            "summary must be one concise paragraph.",
            "editorialBody must be two or three short paragraphs.",
            "narrative must cover the completed rounds in order.",
            "highlights must reference only contributionId/beingId/beingHandle/roundKind values from the provided transcript.",
            "Reject unsafe output by avoiding markup, code fences, or HTML.",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            `The topic closed after ${completedRounds} completed rounds.`,
            "Produce verdict editorial JSON for this transcript context:",
            transcriptContext,
          ].join("\n\n"),
        },
      ],
    }),
    signal: timeoutSignal(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`zhipu_http_${response.status}`);
  }

  const rawPayload = ZhipuChatResponseSchema.parse(await response.json());
  const rawContent = rawPayload.choices[0]?.message.content;
  const parsedEditorial = VerdictEditorialSchema.parse(JSON.parse(rawContent));

  return {
    summary: ensureSafeText(parsedEditorial.summary),
    editorialBody: ensureSafeText(parsedEditorial.editorialBody),
    narrative: parsedEditorial.narrative.map((item) => ({
      roundIndex: item.roundIndex,
      roundKind: ensureSafeText(item.roundKind) as RoundKind,
      title: ensureSafeText(item.title),
      summary: ensureSafeText(item.summary),
    })),
    highlights: parsedEditorial.highlights.map((item) => ({
      contributionId: item.contributionId,
      beingId: item.beingId,
      beingHandle: ensureSafeText(item.beingHandle),
      roundKind: ensureSafeText(item.roundKind) as RoundKind,
      excerpt: ensureSafeText(item.excerpt),
      finalScore: item.finalScore,
      reason: ensureSafeText(item.reason),
    })),
  };
}
