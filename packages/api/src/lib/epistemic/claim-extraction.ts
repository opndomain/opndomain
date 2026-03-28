type ClaimVerifiability = "empirical" | "comparative" | "normative" | "predictive" | "unclassified";

export type ExtractedClaim = {
  ordinal: number;
  body: string;
  normalizedBody: string;
  verifiability: ClaimVerifiability;
};

const COMPARATIVE_PATTERNS = [
  /\b[a-z]+er than\b/i,
  /\bmore than\b/i,
  /\bless than\b/i,
  /\bhigher than\b/i,
  /\blower than\b/i,
  /\bfaster than\b/i,
  /\bslower than\b/i,
  /\bbetter than\b/i,
  /\bworse than\b/i,
  /\bcompared to\b/i,
  /\bversus\b/i,
];

const NORMATIVE_PATTERNS = [
  /\bshould\b/i,
  /\bmust\b/i,
  /\bought to\b/i,
  /\bneed to\b/i,
  /\brecommend\b/i,
  /\bprefer\b/i,
  /\bbetter if\b/i,
];

const PREDICTIVE_PATTERNS = [
  /\bwill\b/i,
  /\bgoing to\b/i,
  /\blikely\b/i,
  /\bexpected to\b/i,
  /\bforecast\b/i,
  /\bprediction\b/i,
  /\bby \d{4}\b/i,
  /\bnext (year|month|quarter|week)\b/i,
];

const EMPIRICAL_PATTERNS = [
  /\bdata\b/i,
  /\bstudy\b/i,
  /\breport\b/i,
  /\bobserved\b/i,
  /\bmeasured\b/i,
  /\baccording to\b/i,
  /\bpercent\b/i,
  /\b\d+(?:\.\d+)?%?\b/,
  /\b[A-Z][a-z]+ \d{1,2}, \d{4}\b/,
];

function splitIntoClaimCandidates(body: string): string[] {
  return body
    .split(/[\n\r]+|(?<=[.!?;])\s+/)
    .map((part) => part.trim())
    .filter((part) => /[A-Za-z0-9]/.test(part));
}

export function normalizeClaimBody(body: string): string {
  return body
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function classifyClaimVerifiability(body: string): ClaimVerifiability {
  if (PREDICTIVE_PATTERNS.some((pattern) => pattern.test(body))) {
    return "predictive";
  }
  if (NORMATIVE_PATTERNS.some((pattern) => pattern.test(body))) {
    return "normative";
  }
  if (COMPARATIVE_PATTERNS.some((pattern) => pattern.test(body))) {
    return "comparative";
  }
  if (EMPIRICAL_PATTERNS.some((pattern) => pattern.test(body))) {
    return "empirical";
  }
  return "unclassified";
}

export function extractClaims(body: string): ExtractedClaim[] {
  return splitIntoClaimCandidates(body)
    .map((claimBody, index) => {
      const normalizedBody = normalizeClaimBody(claimBody);
      if (!normalizedBody) {
        return null;
      }
      return {
        ordinal: index + 1,
        body: claimBody,
        normalizedBody,
        verifiability: classifyClaimVerifiability(claimBody),
      } satisfies ExtractedClaim;
    })
    .filter((claim): claim is ExtractedClaim => claim !== null);
}
