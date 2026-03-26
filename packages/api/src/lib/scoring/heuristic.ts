import type { HeuristicScoreDetails } from "@opndomain/shared";
import {
  SUBSTANCE_CONSTANTS,
  SUBSTANCE_SENTENCE_SCORES,
  EVIDENCE_PATTERNS,
  KNOWN_TECH_TERMS,
  VAGUENESS_PATTERNS,
} from "./constants.js";

const SENTENCE_PATTERN = /[.!?]+/;
const WORD_PATTERN = /[a-z0-9]+(?:['-][a-z0-9]+)*/gi;
const NUMBER_WITH_UNIT_PATTERN = /\b\d+(?:\.\d+)?\s?(ms|s|sec|seconds|minutes|hours|kb|mb|gb|%|x)\b/gi;
const PROPER_NOUN_PATTERN = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g;

function countSentenceScore(sentenceCount: number): number {
  if (sentenceCount <= 0) {
    return 0;
  }
  if (sentenceCount === 1) {
    return SUBSTANCE_SENTENCE_SCORES.one;
  }
  if (sentenceCount === 2) {
    return SUBSTANCE_SENTENCE_SCORES.two;
  }
  if (sentenceCount === 3) {
    return SUBSTANCE_SENTENCE_SCORES.three;
  }
  if (sentenceCount === 4) {
    return SUBSTANCE_SENTENCE_SCORES.four;
  }
  if (sentenceCount <= 6) {
    return SUBSTANCE_SENTENCE_SCORES.fiveToSix;
  }
  return SUBSTANCE_SENTENCE_SCORES.sevenPlus;
}

export function scoreHeuristics(body: string): HeuristicScoreDetails {
  const sentenceCount = body
    .split(SENTENCE_PATTERN)
    .map((fragment) => fragment.trim())
    .filter(Boolean).length;
  const words = Array.from(body.match(WORD_PATTERN) ?? [], (word) => word.toLowerCase());
  const wordCount = words.length;
  const uniqueWordCount = new Set(words).size;

  const uniqueTermRatioScore = Math.min(
    SUBSTANCE_CONSTANTS.uniqueTermRatioCap,
    wordCount === 0 ? 0 : (uniqueWordCount / wordCount) * SUBSTANCE_CONSTANTS.uniqueTermRatioCap,
  );

  const properNounScore = (body.match(PROPER_NOUN_PATTERN) ?? []).length * 3;
  const unitScore = (body.match(NUMBER_WITH_UNIT_PATTERN) ?? []).length * 6;
  const techTermScore = KNOWN_TECH_TERMS.filter((term) => body.toLowerCase().includes(term)).length * 4;
  const specificityScore = Math.min(
    SUBSTANCE_CONSTANTS.specificityCap,
    properNounScore + unitScore + techTermScore,
  );

  const evidenceScore = Math.min(
    SUBSTANCE_CONSTANTS.evidencePatternCap,
    EVIDENCE_PATTERNS.filter((pattern) => pattern.test(body)).length * SUBSTANCE_CONSTANTS.evidencePatternPoints,
  );

  const vaguenessPenalty = Math.min(
    SUBSTANCE_CONSTANTS.vaguenessPatternCap,
    VAGUENESS_PATTERNS.filter((pattern) => pattern.test(body)).length * SUBSTANCE_CONSTANTS.vaguenessPatternPoints,
  );

  const densityMultiplier =
    wordCount > SUBSTANCE_CONSTANTS.densityBaseWordCount
      ? Math.max(
          SUBSTANCE_CONSTANTS.densityMinMultiplier,
          Math.sqrt(SUBSTANCE_CONSTANTS.densityBaseWordCount / wordCount),
        )
      : 1;

  const rawSubstance =
    countSentenceScore(sentenceCount) + uniqueTermRatioScore + specificityScore + evidenceScore - vaguenessPenalty;
  const sentenceContribution = countSentenceScore(sentenceCount);

  return {
    sentenceCount,
    sentenceContribution,
    wordCount,
    uniqueWordCount,
    uniqueTermRatioScore,
    specificityScore,
    evidenceScore,
    vaguenessPenalty,
    densityMultiplier,
    substanceScore: Math.max(0, Math.min(SUBSTANCE_CONSTANTS.max, rawSubstance * densityMultiplier)),
  };
}
