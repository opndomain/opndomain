export type TopicIdeaRecordKind = "topic" | "candidate";

export type TopicIdeaDuplicateReason =
  | "exact_title_match"
  | "title_similarity"
  | "title_prompt_similarity"
  | "comparison_family_match";

export type TopicIdeaComparableRecord = {
  recordKind: TopicIdeaRecordKind;
  id: string;
  domainId: string;
  status: string;
  title: string;
  prompt: string;
};

export type TopicIdeaDuplicateMatch = {
  reason: TopicIdeaDuplicateReason;
  existingRecordKind: TopicIdeaRecordKind;
  existingId: string;
  existingStatus: string;
  existingTitle: string;
};

const COMPARISON_PATTERNS: Array<[RegExp, string]> = [
  [/\bversus\b/gi, " vs "],
  [/\bvs\.?\b/gi, " vs "],
  [/\bmatters?\s+more\s+than\b/gi, " vs "],
  [/\bmore\s+than\b/gi, " vs "],
  [/\bbigger\s+edge\s+than\b/gi, " vs "],
  [/\blarger\s+edge\s+than\b/gi, " vs "],
  [/\bgreater\s+edge\s+than\b/gi, " vs "],
  [/\bcreates?\s+more\s+edge\s+than\b/gi, " vs "],
  [/\bis\s+a\s+bigger\s+edge\s+than\b/gi, " vs "],
];

const TOKEN_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "better",
  "big",
  "by",
  "does",
  "for",
  "how",
  "if",
  "in",
  "is",
  "it",
  "large",
  "more",
  "of",
  "on",
  "or",
  "than",
  "that",
  "the",
  "their",
  "there",
  "these",
  "this",
  "to",
  "vs",
  "what",
  "when",
  "which",
  "who",
  "why",
]);

function normalizeWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeComparisonPhrases(value: string) {
  let next = value.toLowerCase();
  for (const [pattern, replacement] of COMPARISON_PATTERNS) {
    next = next.replace(pattern, replacement);
  }
  return next;
}

function normalizeForComparison(value: string) {
  return normalizeWhitespace(
    normalizeComparisonPhrases(value)
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " "),
  );
}

function singularize(token: string) {
  if (token.length <= 4 || !token.endsWith("s")) {
    return token;
  }
  return token.slice(0, -1);
}

function tokenize(value: string) {
  return normalizeForComparison(value)
    .split(" ")
    .map((token) => singularize(token.trim()))
    .filter((token) => token.length >= 3 && !TOKEN_STOP_WORDS.has(token));
}

function uniqueTokens(value: string) {
  return Array.from(new Set(tokenize(value)));
}

function overlap(left: string[], right: string[]) {
  if (left.length === 0 || right.length === 0) {
    return { intersection: 0, coefficient: 0 };
  }
  const rightSet = new Set(right);
  const intersection = left.filter((token) => rightSet.has(token)).length;
  return {
    intersection,
    coefficient: intersection / Math.max(1, Math.min(left.length, right.length)),
  };
}

function extractComparisonSides(value: string) {
  const normalized = normalizeForComparison(value);
  if (!normalized.includes(" vs ")) {
    return null;
  }
  const [leftRaw, ...rest] = normalized.split(" vs ");
  const rightRaw = rest.join(" ").trim();
  if (!leftRaw || !rightRaw) {
    return null;
  }
  const left = uniqueTokens(leftRaw);
  const right = uniqueTokens(rightRaw);
  if (left.length === 0 || right.length === 0) {
    return null;
  }
  return { left, right };
}

function isComparisonFamilyDuplicate(candidate: { title: string }, existing: TopicIdeaComparableRecord) {
  const candidateSides = extractComparisonSides(candidate.title);
  const existingSides = extractComparisonSides(existing.title);
  if (!candidateSides || !existingSides) {
    return false;
  }

  const directLeft = overlap(candidateSides.left, existingSides.left);
  const directRight = overlap(candidateSides.right, existingSides.right);
  const swappedLeft = overlap(candidateSides.left, existingSides.right);
  const swappedRight = overlap(candidateSides.right, existingSides.left);

  const directMatch =
    directLeft.intersection >= 1 &&
    directRight.intersection >= 1 &&
    directLeft.coefficient >= 0.5 &&
    directRight.coefficient >= 0.5;
  const swappedMatch =
    swappedLeft.intersection >= 1 &&
    swappedRight.intersection >= 1 &&
    swappedLeft.coefficient >= 0.5 &&
    swappedRight.coefficient >= 0.5;

  return directMatch || swappedMatch;
}

export function topicIdeaRecordFromCandidate(
  candidate: { domainId: string; title: string; prompt: string },
  id: string,
  status = "generated",
): TopicIdeaComparableRecord {
  return {
    recordKind: "candidate",
    id,
    domainId: candidate.domainId,
    status,
    title: candidate.title,
    prompt: candidate.prompt,
  };
}

export function findTopicIdeaDuplicate(
  candidate: { title: string; prompt: string },
  existingRecords: TopicIdeaComparableRecord[],
  options?: { excludeRecordId?: string },
): TopicIdeaDuplicateMatch | null {
  const candidateTitle = normalizeForComparison(candidate.title);
  const candidateTitleTokens = uniqueTokens(candidate.title);
  const candidatePromptTokens = uniqueTokens(candidate.prompt).slice(0, 40);

  for (const existing of existingRecords) {
    if (options?.excludeRecordId && existing.id === options.excludeRecordId) {
      continue;
    }

    if (candidateTitle === normalizeForComparison(existing.title)) {
      return {
        reason: "exact_title_match",
        existingRecordKind: existing.recordKind,
        existingId: existing.id,
        existingStatus: existing.status,
        existingTitle: existing.title,
      };
    }

    const existingTitleTokens = uniqueTokens(existing.title);
    const existingPromptTokens = uniqueTokens(existing.prompt).slice(0, 40);
    const titleOverlap = overlap(candidateTitleTokens, existingTitleTokens);
    if (titleOverlap.intersection >= 4 && titleOverlap.coefficient >= 0.75) {
      return {
        reason: "title_similarity",
        existingRecordKind: existing.recordKind,
        existingId: existing.id,
        existingStatus: existing.status,
        existingTitle: existing.title,
      };
    }

    const titlePromptOverlap = overlap(candidateTitleTokens, existingPromptTokens);
    const promptTitleOverlap = overlap(existingTitleTokens, candidatePromptTokens);
    if (
      (titlePromptOverlap.intersection >= 4 && titlePromptOverlap.coefficient >= 0.8) ||
      (promptTitleOverlap.intersection >= 4 && promptTitleOverlap.coefficient >= 0.8)
    ) {
      return {
        reason: "title_prompt_similarity",
        existingRecordKind: existing.recordKind,
        existingId: existing.id,
        existingStatus: existing.status,
        existingTitle: existing.title,
      };
    }

    if (isComparisonFamilyDuplicate(candidate, existing)) {
      return {
        reason: "comparison_family_match",
        existingRecordKind: existing.recordKind,
        existingId: existing.id,
        existingStatus: existing.status,
        existingTitle: existing.title,
      };
    }
  }

  return null;
}
