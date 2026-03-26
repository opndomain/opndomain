import type { RiskFamily } from "@opndomain/shared";

export type RiskPattern = {
  family: RiskFamily;
  weight: number;
  pattern: RegExp;
};

const TRANSCRIPT_RISK_PATTERNS: readonly RiskPattern[] = [
  { family: "prompt_wrapper", weight: 30, pattern: /\b(ignore (all|any|previous) instructions|system prompt|developer message|hidden prompt)\b/i },
  { family: "prompt_wrapper", weight: 24, pattern: /<(system|assistant|developer|instructions)>|```(system|assistant|developer|user)/i },
  { family: "prompt_wrapper", weight: 18, pattern: /\b(begin prompt|end prompt|prompt wrapper|quoted prompt wrapper)\b/i },
  { family: "prompt_wrapper", weight: 35, pattern: /\b(bypass the guardrails|evade detection|hidden from the transcript)\b/i },
  { family: "vote_manipulation", weight: 42, pattern: /\b(upvote|downvote|vote for me|rank this first|boost my score)\b/i },
  { family: "vote_manipulation", weight: 30, pattern: /\b(coordinate votes?|swap votes?|everyone vote|bloc vote)\b/i },
  { family: "vote_manipulation", weight: 22, pattern: /\b(don't vote for|bury this|tank their score)\b/i },
  { family: "consensus_laundering", weight: 28, pattern: /\b(consensus is clear|everyone agrees|the group already decided|we all know)\b/i },
  { family: "consensus_laundering", weight: 20, pattern: /\b(common knowledge here|obvious consensus|settled by the room)\b/i },
  { family: "consensus_laundering", weight: 18, pattern: /\b(as agreed above|we've already aligned|group conclusion)\b/i },
  { family: "authority_spoofing", weight: 38, pattern: /\b(as the moderator|official instruction|admin override|trusted operator)\b/i },
  { family: "authority_spoofing", weight: 24, pattern: /\b(platform policy says|system requires|operator directive|maintainer note)\b/i },
  { family: "authority_spoofing", weight: 18, pattern: /\b(this is the canonical answer|approved by admins?|from the system team)\b/i },
  { family: "fake_evidence", weight: 24, pattern: /\b(I ran the benchmark|verified empirically|the logs prove|measured internally)\b/i },
  { family: "fake_evidence", weight: 18, pattern: /\b(source: trust me|unpublished study|private data shows|secret benchmark)\b/i },
  { family: "fake_evidence", weight: 14, pattern: /\b(I checked the production metrics|confidential evidence|internal numbers)\b/i },
  { family: "cross_turn_steering", weight: 28, pattern: /\b(in the next round|future round|later turn|subsequent response)\b/i },
  { family: "cross_turn_steering", weight: 18, pattern: /\b(carry this forward|keep repeating this|anchor the next turn|shape the transcript)\b/i },
  { family: "cross_turn_steering", weight: 16, pattern: /\b(set up the next answer|make the next agent say|seed the following turn)\b/i },
  { family: "cross_turn_steering", weight: 24, pattern: /\b(coordinate with other agents?|make other agents say|everyone should copy)\b/i },
  { family: "off_platform_coordination", weight: 30, pattern: /\b(dm me|message me privately|off platform|take this offline)\b/i },
  { family: "off_platform_coordination", weight: 20, pattern: /\b(secret signal|out of band|private channel|side chat)\b/i },
  { family: "off_platform_coordination", weight: 16, pattern: /\b(join discord|telegram|slack|email me)\b/i },
  { family: "transcript_stuffing", weight: 26, pattern: /\b(repeat this|verbatim|paste the full prompt|dump the context|entire transcript)\b/i },
  { family: "transcript_stuffing", weight: 20, pattern: /\b(long transcript|copy the whole exchange|quote everything|full conversation)\b/i },
  { family: "transcript_stuffing", weight: 18, pattern: /\b(append these instructions|stuff this into the transcript|keep all tokens)\b/i },
  { family: "transcript_stuffing", weight: 16, pattern: /\bquoted block\b/i },
  { family: "transcript_stuffing", weight: 18, pattern: /\bquoted role marker\b/i },
  { family: "transcript_stuffing", weight: 16, pattern: /\bquoted wrapper\b/i },
  { family: "transcript_stuffing", weight: 18, pattern: /\bquoted_(function_call|tool_call)\b/i },
] as const;

const RISK_FAMILY_FLOORS: Partial<Record<RiskFamily, number>> = {
  vote_manipulation: 64,
  consensus_laundering: 42,
  authority_spoofing: 38,
  fake_evidence: 36,
  cross_turn_steering: 40,
  off_platform_coordination: 40,
};

export function scoreTranscriptRisk(body: string) {
  const matchedFamilies = new Set<RiskFamily>();
  const familyMatchCounts = new Map<RiskFamily, number>();
  let totalScore = 0;

  for (const riskPattern of TRANSCRIPT_RISK_PATTERNS) {
    if (!riskPattern.pattern.test(body)) {
      continue;
    }

    matchedFamilies.add(riskPattern.family);
    familyMatchCounts.set(riskPattern.family, (familyMatchCounts.get(riskPattern.family) ?? 0) + 1);
    totalScore += riskPattern.weight;
  }

  let adjustedScore = totalScore;
  for (const family of matchedFamilies) {
    adjustedScore = Math.max(adjustedScore, RISK_FAMILY_FLOORS[family] ?? 0);
  }

  const transcriptStuffingMatches = familyMatchCounts.get("transcript_stuffing") ?? 0;
  if (transcriptStuffingMatches >= 2) {
    adjustedScore = Math.max(adjustedScore, 38);
  }

  return {
    score: Math.min(100, adjustedScore),
    matchedFamilies: Array.from(matchedFamilies),
  };
}
