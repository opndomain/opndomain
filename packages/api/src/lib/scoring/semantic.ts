import type { ApiEnv } from "../env.js";
import {
  SEMANTIC_EMBEDDING_MODEL,
  SEMANTIC_FLAG_HIGH_REDUNDANCY,
  SEMANTIC_FLAG_LOW_NOVELTY,
  SEMANTIC_FLAG_LOW_TOPIC_ALIGNMENT,
  SEMANTIC_FLAG_NOVELTY_DAMPED_SPARSE_CONTEXT,
  SEMANTIC_FLAG_WEAK_TOPIC_OVERLAP,
  SEMANTIC_NOVELTY_BASELINE,
  SEMANTIC_NOVELTY_CONFIDENCE_EMPTY,
  SEMANTIC_NOVELTY_CONFIDENCE_MULTI,
  SEMANTIC_NOVELTY_CONFIDENCE_SINGLE,
  type SemanticScoreDetails,
} from "@opndomain/shared";
import { SEMANTIC_WINDOW_CONTRACT } from "./constants.js";

type SemanticRow = {
  id: string;
  bodyClean: string;
};

export type EmbeddingBackend = {
  embed(texts: string[]): Promise<number[][]>;
};

type WorkersAiEmbeddingResponse =
  | { data?: unknown }
  | { result?: unknown }
  | unknown;

function tokenize(text: string): string[] {
  return Array.from(text.toLowerCase().match(/[a-z0-9]+/g) ?? []);
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function toScore(value: number): number {
  return Math.max(0, Math.min(100, value * 100));
}

function vectorNorm(vector: number[]): number {
  let sum = 0;
  for (const value of vector) {
    sum += value * value;
  }
  return Math.sqrt(sum);
}

function cosineSimilarity(left: number[], right: number[]): number {
  const leftNorm = vectorNorm(left);
  const rightNorm = vectorNorm(right);
  if (leftNorm <= 0 || rightNorm <= 0) {
    return 0;
  }

  const length = Math.min(left.length, right.length);
  let dot = 0;
  for (let index = 0; index < length; index += 1) {
    dot += left[index] * right[index];
  }
  return dot / (leftNorm * rightNorm);
}

function normalizedCosineSimilarity(left: number[], right: number[]): number {
  return clampUnit((cosineSimilarity(left, right) + 1) / 2);
}

function tokenOverlap(contributionText: string, promptText: string): number {
  const contributionTokens = new Set(tokenize(contributionText).filter((token) => token.length >= 4));
  const promptTokens = new Set(tokenize(promptText).filter((token) => token.length >= 4));
  if (promptTokens.size === 0) {
    return 0;
  }

  let sharedCount = 0;
  for (const token of promptTokens) {
    if (contributionTokens.has(token)) {
      sharedCount += 1;
    }
  }

  return sharedCount / promptTokens.size;
}

function noveltyConfidence(sampleSize: number): number {
  if (sampleSize >= 2) {
    return SEMANTIC_NOVELTY_CONFIDENCE_MULTI;
  }
  if (sampleSize === 1) {
    return SEMANTIC_NOVELTY_CONFIDENCE_SINGLE;
  }
  return SEMANTIC_NOVELTY_CONFIDENCE_EMPTY;
}

function semanticComparisonWindow() {
  return {
    scope: SEMANTIC_WINDOW_CONTRACT.scope,
    size: SEMANTIC_WINDOW_CONTRACT.size,
    includedVisibilities: [...SEMANTIC_WINDOW_CONTRACT.includedVisibilities] as ["normal", "low_confidence"],
    includedDecisions: [...SEMANTIC_WINDOW_CONTRACT.includedDecisions] as ["allow", "queue"],
    topicEmbeddingSource: SEMANTIC_WINDOW_CONTRACT.topicEmbeddingSource,
  };
}

function parseEmbeddings(value: unknown): number[][] {
  if (Array.isArray(value) && value.every((entry) => Array.isArray(entry))) {
    return value.map((entry) => entry.map((item) => Number(item)));
  }
  if (Array.isArray(value) && value.every((entry) => typeof entry === "object" && entry !== null && "embedding" in entry)) {
    return value.map((entry) => Array.from((entry as { embedding: unknown[] }).embedding, (item) => Number(item)));
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "shape" in value &&
    "data" in value &&
    Array.isArray((value as { shape: unknown }).shape) &&
    Array.isArray((value as { data: unknown }).data)
  ) {
    const shape = (value as { shape: number[] }).shape;
    const data = Array.from((value as { data: unknown[] }).data, (item) => Number(item));
    const rows = Number(shape[0] ?? 0);
    const cols = Number(shape[1] ?? 0);
    if (rows > 0 && cols > 0 && rows * cols === data.length) {
      const embeddings: number[][] = [];
      for (let index = 0; index < rows; index += 1) {
        embeddings.push(data.slice(index * cols, (index + 1) * cols));
      }
      return embeddings;
    }
  }
  throw new Error("Workers AI embeddings response was not recognized.");
}

export function createWorkersAiEmbeddingBackend(env: Pick<ApiEnv, "AI">): EmbeddingBackend {
  return {
    async embed(texts: string[]) {
      if (!env.AI) {
        throw new Error("ENABLE_SEMANTIC_SCORING requires the AI binding.");
      }
      const response = (await env.AI.run(SEMANTIC_EMBEDDING_MODEL, {
        text: texts,
      })) as WorkersAiEmbeddingResponse;
      if (typeof response === "object" && response !== null) {
        if ("data" in response) {
          return parseEmbeddings((response as { data?: unknown }).data);
        }
        if ("result" in response) {
          return parseEmbeddings((response as { result?: unknown }).result);
        }
      }
      return parseEmbeddings(response);
    },
  };
}

export async function scoreSemanticSimilarity(
  env: ApiEnv,
  input: {
    topicPrompt: string;
    bodyClean: string;
    recentTranscriptContributions: SemanticRow[];
  },
  backend: EmbeddingBackend = createWorkersAiEmbeddingBackend(env),
): Promise<SemanticScoreDetails> {
  const topicEmbeddingText = input.topicPrompt;

  if (!env.ENABLE_SEMANTIC_SCORING) {
    return {
      enabled: false,
      topicEmbeddingText,
      comparisonWindow: semanticComparisonWindow(),
      comparedContributionIds: [],
      semanticFlags: [],
      relevance: null,
      novelty: null,
      reframe: null,
      semanticAverage: null,
    };
  }

  const comparedContributionIds = input.recentTranscriptContributions.map((row) => row.id);
  const embeddings = await backend.embed([
    topicEmbeddingText,
    input.bodyClean,
    ...input.recentTranscriptContributions.map((row) => row.bodyClean),
  ]);
  if (embeddings.length < 2) {
    throw new Error("Semantic embedding backend returned too few vectors.");
  }

  const [topicVector, contributionVector, ...comparisonVectors] = embeddings;
  const relevance = toScore(normalizedCosineSimilarity(contributionVector, topicVector));
  const overlap = tokenOverlap(input.bodyClean, topicEmbeddingText);
  const comparisons = comparisonVectors.map((vector, index) => ({
    id: comparedContributionIds[index] ?? `cmp_${index}`,
    similarity: normalizedCosineSimilarity(contributionVector, vector),
  }));

  const sampleSize = comparisons.length;
  const meanSimilarity =
    sampleSize > 0
      ? comparisons.reduce((sum, row) => sum + row.similarity, 0) / sampleSize
      : 0;
  const rawNovelty = clampUnit(1 - meanSimilarity);
  const confidence = noveltyConfidence(sampleSize);
  const novelty = toScore(rawNovelty * confidence + SEMANTIC_NOVELTY_BASELINE * (1 - confidence));
  const maxRedundancy = sampleSize > 0 ? Math.max(...comparisons.map((row) => row.similarity)) : 0;
  const reframe = toScore(clampUnit(1 - maxRedundancy));
  const semanticAverage = (relevance + novelty + reframe) / 3;
  const semanticFlags: string[] = [];

  if (relevance / 100 < 0.15) {
    semanticFlags.push(SEMANTIC_FLAG_LOW_TOPIC_ALIGNMENT);
  }
  if (overlap < 0.12) {
    semanticFlags.push(SEMANTIC_FLAG_WEAK_TOPIC_OVERLAP);
  }
  if (maxRedundancy > 0.9) {
    semanticFlags.push(SEMANTIC_FLAG_HIGH_REDUNDANCY);
  }
  if (novelty / 100 < 0.1) {
    semanticFlags.push(SEMANTIC_FLAG_LOW_NOVELTY);
  }
  if (sampleSize < 2) {
    semanticFlags.push(SEMANTIC_FLAG_NOVELTY_DAMPED_SPARSE_CONTEXT);
  }

  return {
    enabled: true,
    topicEmbeddingText,
    comparisonWindow: semanticComparisonWindow(),
    comparedContributionIds,
    semanticFlags,
    relevance,
    novelty,
    reframe,
    semanticAverage,
  };
}
