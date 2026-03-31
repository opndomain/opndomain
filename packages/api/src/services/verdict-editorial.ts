import { z } from "zod";
import type { RoundKind } from "@opndomain/shared";
import type { ApiEnv } from "../lib/env.js";

const DEFAULT_XAI_BASE_URL = "https://api.x.ai/v1";
const MAX_TRANSCRIPT_CHARS = 4000;
const MAX_SUMMARY_CHARS = 320;
const MAX_EDITORIAL_BODY_CHARS = 2400;
const MAX_NARRATIVE_SUMMARY_CHARS = 280;
const MAX_HIGHLIGHT_EXCERPT_CHARS = 240;
const MAX_HIGHLIGHT_REASON_CHARS = 180;
const MAX_ERROR_BODY_CHARS = 400;

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

const OpenAIChatResponseSchema = z.object({
  id: z.string().optional(),
  choices: z.array(z.object({
    message: z.object({
      content: z.unknown().optional(),
    }),
  })).min(1),
});

export type VerdictEditorialFailureKind =
  | "http_failure"
  | "timeout"
  | "provider_unavailable"
  | "empty_model_output"
  | "unsupported_content_shape"
  | "invalid_json_payload"
  | "schema_validation_failure"
  | "unsafe_text_rejection";

export class VerdictEditorialError extends Error {
  readonly name = "VerdictEditorialError";

  constructor(
    readonly kind: VerdictEditorialFailureKind,
    message: string,
    readonly options?: {
      cause?: unknown;
      details?: Record<string, unknown>;
      requestId?: string | null;
      statusCode?: number;
    },
  ) {
    super(message, { cause: options?.cause });
  }

  get details() {
    return this.options?.details;
  }

  get requestId() {
    return this.options?.requestId ?? null;
  }

  get statusCode() {
    return this.options?.statusCode;
  }
}

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
export type VerdictEditorialProvider = "xai";
export type VerdictEditorialGenerationResult = {
  editorial: VerdictEditorialOutput | null;
  provider: VerdictEditorialProvider | null;
  failure: VerdictEditorialError | null;
};

function normalizeText(value: string, maxLength: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function ensureSafeText(value: string): string {
  if (/[<>]/.test(value) || /```/.test(value)) {
    throw new VerdictEditorialError("unsafe_text_rejection", "unsafe editorial output");
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
  const timeout = setTimeout(() => controller.abort(new Error("xai_timeout")), timeoutMs);
  controller.signal.addEventListener("abort", () => clearTimeout(timeout), { once: true });
  return controller.signal;
}

function normalizeErrorBody(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_ERROR_BODY_CHARS);
}

function extractResponseRequestId(response: Response): string | null {
  return response.headers.get("x-request-id")
    ?? response.headers.get("request-id");
}

function isTimeoutError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.name === "AbortError" || error.message === "xai_timeout";
  }
  return false;
}

function requireStringContent(
  content: unknown,
  provider: string,
  requestId: string | null,
): string {
  if (typeof content !== "string") {
    throw new VerdictEditorialError(
      "unsupported_content_shape",
      `${provider} returned an unsupported message.content shape.`,
      {
        requestId,
        details: {
          contentType: Array.isArray(content) ? "array" : typeof content,
        },
      },
    );
  }

  const trimmed = content.trim();
  if (trimmed.length === 0) {
    throw new VerdictEditorialError(
      "empty_model_output",
      `${provider} returned empty message content.`,
      { requestId },
    );
  }

  return trimmed;
}

function extractModelContent(payload: z.infer<typeof OpenAIChatResponseSchema>): string {
  return requireStringContent(payload.choices[0]?.message?.content, "xAI", payload.id ?? null);
}

function parseEditorialPayload(rawContent: string, requestId: string | null): VerdictEditorialOutput {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawContent);
  } catch (error) {
    throw new VerdictEditorialError("invalid_json_payload", "Editorial provider returned invalid JSON.", {
      cause: error,
      requestId,
    });
  }

  let parsedEditorial: VerdictEditorialOutput;
  try {
    parsedEditorial = VerdictEditorialSchema.parse(parsedJson);
  } catch (error) {
    throw new VerdictEditorialError("schema_validation_failure", "Editorial provider JSON failed schema validation.", {
      cause: error,
      requestId,
    });
  }

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

function buildEditorialMessages(input: VerdictEditorialInput) {
  const transcriptContext = buildTranscriptContext(input);
  const completedRounds = input.rounds.filter((round) => round.status === "completed").length;
  return {
    transcriptContext,
    completedRounds,
    system: [
      "You generate verdict editorial JSON for opndomain closed topics.",
      "Return only valid JSON with keys: summary, editorialBody, narrative, highlights.",
      "Use only transcript-visible information. Do not invent facts, actors, or rounds.",
      "summary must be one concise paragraph.",
      "editorialBody must be two or three short paragraphs.",
      "narrative must cover the completed rounds in order.",
      "highlights must reference only contributionId/beingId/beingHandle/roundKind values from the provided transcript.",
      "Reject unsafe output by avoiding markup, code fences, or HTML.",
    ].join(" "),
    user: [
      `The topic closed after ${completedRounds} completed rounds.`,
      "Produce verdict editorial JSON for this transcript context:",
      transcriptContext,
    ].join("\n\n"),
  };
}

export async function generateVerdictEditorial(
  env: ApiEnv,
  input: VerdictEditorialInput,
): Promise<VerdictEditorialGenerationResult> {
  const apiKey = env.XAI_API_KEY?.trim?.() ?? "";
  if (!apiKey) {
    return {
      editorial: null,
      provider: null,
      failure: new VerdictEditorialError("provider_unavailable", "XAI_API_KEY is not configured."),
    };
  }

  const prompt = buildEditorialMessages(input);
  const endpoint = `${(env.XAI_BASE_URL ?? DEFAULT_XAI_BASE_URL).replace(/\/+$/, "")}/chat/completions`;
  const timeoutMs = env.XAI_TIMEOUT_MS ?? 30000;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.XAI_MODEL || "grok-3-mini",
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: prompt.system,
          },
          {
            role: "user",
            content: prompt.user,
          },
        ],
      }),
      signal: timeoutSignal(timeoutMs),
    });
  } catch (error) {
    if (isTimeoutError(error)) {
      return {
        editorial: null,
        provider: null,
        failure: new VerdictEditorialError("timeout", "xAI verdict editorial request timed out.", { cause: error }),
      };
    }
    throw error;
  }

  if (!response.ok) {
    let bodySnippet = "";
    try {
      bodySnippet = normalizeErrorBody(await response.text());
    } catch {
      bodySnippet = "";
    }
    return {
      editorial: null,
      provider: null,
      failure: new VerdictEditorialError(
        "http_failure",
        `xAI returned HTTP ${response.status}.`,
        {
          requestId: extractResponseRequestId(response),
          statusCode: response.status,
          details: bodySnippet ? { bodySnippet } : undefined,
        },
      ),
    };
  }

  try {
    const rawPayload = OpenAIChatResponseSchema.parse(await response.json());
    const requestId = rawPayload.id ?? extractResponseRequestId(response);
    const rawContent = extractModelContent(rawPayload);
    const editorial = parseEditorialPayload(rawContent, requestId);
    return {
      editorial,
      provider: "xai",
      failure: null,
    };
  } catch (error) {
    if (error instanceof VerdictEditorialError) {
      return {
        editorial: null,
        provider: null,
        failure: error,
      };
    }
    throw error;
  }
}
