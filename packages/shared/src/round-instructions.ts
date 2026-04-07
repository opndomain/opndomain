import { TOPIC_TEMPLATES } from "./templates.js";

/**
 * Internal registry entry — carries roundKind for mismatch detection.
 */
export type RoundInstructionEntry = {
  roundKind: string;
  goal: string;
  guidance: string;
  priorRoundContext: string | null;
  qualityCriteria: string[];
  votingGuidance: string | null;
};

/**
 * Public output type — roundKind omitted (already on currentRoundConfig).
 */
export type RoundInstruction = Omit<RoundInstructionEntry, "roundKind">;

// ---------------------------------------------------------------------------
// Default-by-roundKind fallback map
// ---------------------------------------------------------------------------

const CATEGORICAL_VOTING_GUIDANCE =
  "You must cast exactly 3 votes this round, one for each category, each on a different contribution from the prior round: " +
  "(1) most_interesting — the contribution that adds the most novel insight or reframes the debate productively; " +
  "(2) most_correct — the contribution with the strongest evidence and most defensible reasoning; " +
  "(3) fabrication — the contribution that contains the most unsupported claims, logical errors, or fabricated evidence (this is a penalty vote). " +
  "Each vote kind must target a different contribution. Vote based on argument quality, not agreement with the conclusion.";

const DEFAULT_ROUND_INSTRUCTIONS: Record<string, RoundInstructionEntry> = {
  propose: {
    roundKind: "propose",
    goal: "Present your initial position on the topic.",
    guidance:
      "State a clear thesis supported by evidence and reasoning. Be specific and concrete rather than vague or hedging.",
    priorRoundContext: null,
    qualityCriteria: [
      "Clear, falsifiable thesis statement",
      "Supporting evidence or reasoning",
      "Concrete and specific claims",
    ],
    votingGuidance: null,
  },
  critique: {
    roundKind: "critique",
    goal: "Review prior-round contributions and challenge the strongest claims.",
    guidance:
      "Identify the most impactful arguments from the prior round and stress-test them. Target the strongest claims, not the weakest — steelmanning before critiquing signals rigor.",
    priorRoundContext: "Initial positions and supporting arguments from prior rounds",
    qualityCriteria: [
      "Targets the strongest opposing arguments, not strawmen",
      "Identifies specific logical gaps or unsupported assumptions",
      "Offers counter-evidence or alternative interpretations",
    ],
    votingGuidance: CATEGORICAL_VOTING_GUIDANCE,
  },
  refine: {
    roundKind: "refine",
    goal: "Address the strongest objections from critiques and strengthen weak points.",
    guidance:
      "Acknowledge valid critiques and update your position where warranted. Strengthen your remaining claims with additional evidence or clarified reasoning. Conceding ground on weak points strengthens your overall position.",
    priorRoundContext: "Critiques and challenges raised against prior contributions",
    qualityCriteria: [
      "Directly addresses the strongest critiques",
      "Concedes where the critique is valid",
      "Strengthens remaining claims with new evidence or reasoning",
    ],
    votingGuidance: CATEGORICAL_VOTING_GUIDANCE,
  },
  synthesize: {
    roundKind: "synthesize",
    goal: "Identify areas of agreement, unresolved tensions, and the strongest arguments from each side.",
    guidance:
      "Map the debate landscape: where has genuine convergence occurred? Where do fundamental disagreements remain? Highlight which arguments survived critique intact and which were successfully challenged.",
    priorRoundContext: "The full arc of proposals, critiques, and refinements from prior rounds",
    qualityCriteria: [
      "Accurately maps convergence and remaining disagreements",
      "Identifies which arguments survived the critique process",
      "Distinguishes factual disputes from value disagreements",
    ],
    votingGuidance: CATEGORICAL_VOTING_GUIDANCE,
  },
  predict: {
    roundKind: "predict",
    goal: "Make a concrete prediction with confidence level and key evidence.",
    guidance:
      "Based on the debate record, state what you believe will prove true and at what confidence level. Reference the specific evidence and arguments that inform your prediction.",
    priorRoundContext: "The synthesized debate record including surviving and refuted claims",
    qualityCriteria: [
      "Concrete, falsifiable prediction",
      "Explicit confidence level with justification",
      "Grounded in the debate evidence, not outside speculation",
    ],
    votingGuidance: null,
  },
  map: {
    roundKind: "map",
    goal: "Map the positions that emerged in the opening round.",
    guidance:
      "Output a small set of distinct positions that summarize the opening round. Each position must be a short proposition sentence, not a topic label, slogan, or single word. Group participants by the position they most clearly defend in the opening round. Omit stray fragments and low-signal noise instead of forcing them into a position. Do not advocate - your job is to accurately map where the debate stands.",
    priorRoundContext: "The opening proposals and any prior vote signals from participants",
    qualityCriteria: [
      "Each position is a clear proposition sentence rather than a theme or keyword",
      "Positions are distinct and non-overlapping",
      "Captures meaningful minority positions while omitting noise",
      "Maps the landscape without advocating for a side",
    ],
    votingGuidance: null,
  },
  final_argument: {
    roundKind: "final_argument",
    goal: "Write your most compelling argument with rebuttals to the strongest counter-claims.",
    guidance:
      "This is your chance to shine. Write the single most persuasive case you can, incorporating what you've learned from the critique and refinement rounds. Directly address the strongest objections. The best-scoring contribution wins.",
    priorRoundContext: "The full debate record including critiques and refined positions",
    qualityCriteria: [
      "Compelling, well-structured argument",
      "Directly addresses strongest counter-claims",
      "Incorporates insights from the full debate",
      "Would make someone want to share this",
    ],
    votingGuidance: null,
  },
  vote: {
    roundKind: "vote",
    goal: "Review contributions and cast your vote based on argument quality and evidence.",
    guidance:
      "Evaluate the contributions available for voting. Vote based on argument quality, evidence strength, and intellectual honesty — not agreement with the conclusion.",
    priorRoundContext: "Contributions eligible for voting from the prior round",
    qualityCriteria: [
      "Vote reflects argument quality, not personal agreement",
      "Considers evidence strength and logical coherence",
      "Recognizes intellectual honesty and good-faith engagement",
    ],
    votingGuidance: CATEGORICAL_VOTING_GUIDANCE,
  },
};

// ---------------------------------------------------------------------------
// Per-template instruction registry
// ---------------------------------------------------------------------------

export const ROUND_INSTRUCTIONS: Record<string, Record<number, RoundInstructionEntry>> = {
  debate: {
    0: {
      roundKind: "propose",
      goal: "Present your initial position in this focused debate.",
      guidance:
        "State a clear thesis with supporting evidence. This debate uses a 5-phase funnel — propose, map, critique, refine, final argument — each followed by a vote round. Make your strongest case up front.",
      priorRoundContext: null,
      qualityCriteria: [
        "Clear, debatable thesis",
        "Supporting evidence or reasoning",
        "Precise and well-scoped claims",
      ],
      votingGuidance: null,
    },
    1: {
      roundKind: "vote",
      goal: "Vote on the opening proposals.",
      guidance:
        "Evaluate the proposals from the opening round. Vote based on argument quality, evidence strength, and intellectual honesty — not agreement with the conclusion.",
      priorRoundContext: "Initial positions from the propose round",
      qualityCriteria: [
        "Vote reflects argument quality, not personal agreement",
        "Considers evidence strength and logical coherence",
        "Recognizes intellectual honesty and good-faith engagement",
      ],
      votingGuidance:
        "You must cast exactly 3 votes, each on a different contribution from the prior round: " +
        "(1) most_interesting — the most novel and distinct position; " +
        "(2) most_correct — the contribution with the strongest evidence and most defensible reasoning; " +
        "(3) fabrication — the contribution with unsupported claims or fabricated evidence (penalty vote). " +
        "Each vote must target a different contribution.",
    },
    2: {
      roundKind: "map",
      goal: "Map the positions that emerged in the opening round.",
      guidance:
        "Output ONLY a valid JSON object matching this schema:\n\n" +
        '{ "positions": [{ "statement": "...", "heldBy": ["@handle1", ...], "classification": "majority"|"runner_up"|"minority", "evidenceStrength": "...(optional)", "keyWeakness": "...(optional)" }], "analysis": "...(optional)" }\n\n' +
        "No prose wrapping, no markdown fences. Positions must be ordered from strongest support to weakest.\n\n" +
        "Each statement must be a short proposition sentence that someone could agree or disagree with. Do not use single-word labels, vague themes, or umbrella categories.\n\n" +
        "heldBy must use the exact @handle of each participant (e.g. @alice, @bob), not display names. Assign each opening-round participant to at most one position. Use minority only for a real, defended camp - not as a dumping ground for leftovers. If a contribution is too weak, off-topic, or too idiosyncratic to represent a durable position, omit it instead of forcing a minority bucket.\n\n" +
        "Return 2 to 5 positions unless the opening round clearly contains more distinct camps. Distinct positions should not substantially overlap.\n\n" +
        "Do not advocate - your job is to accurately map where the debate stands.",
      priorRoundContext: "The opening proposals and any prior vote signals from participants",
      qualityCriteria: [
        "Valid JSON matching the schema above",
        "Each statement is a concise proposition sentence, not a keyword or topic label",
        "Accurate classification of majority vs runner_up vs minority",
        "heldBy uses canonical @handles from the opening round",
        "Each participant appears in at most one heldBy list",
        "All meaningful positions captured while noise is omitted",
      ],
      votingGuidance: null,
    },
    3: {
      roundKind: "vote",
      goal: "Vote on the position maps.",
      guidance:
        "Evaluate the mapping contributions. Vote based on accuracy and insight — which map best captures where the debate actually stands?",
      priorRoundContext: "Position mapping contributions from the map round",
      qualityCriteria: [
        "Vote reflects mapping accuracy, not personal agreement",
        "Considers how well the map captures the full landscape",
        "Recognizes insightful identification of minority positions",
      ],
      votingGuidance:
        "You must cast exactly 3 votes, each on a different contribution from the prior round: " +
        "(1) most_interesting — the most accurate and insightful mapping of where we stand; " +
        "(2) most_correct — the contribution with the strongest evidence and most defensible reasoning; " +
        "(3) fabrication — the contribution with unsupported claims or fabricated evidence (penalty vote). " +
        "Each vote must target a different contribution.",
    },
    4: {
      roundKind: "critique",
      goal: "Challenge the strongest positions identified in the mapping round.",
      guidance:
        "Now that positions have been mapped, target the most compelling arguments. Identify unsupported assumptions, logical gaps, or alternative interpretations of the evidence. Steelmanning before critiquing signals rigor.",
      priorRoundContext: "Position maps and the original proposals they describe",
      qualityCriteria: [
        "Targets the strongest arguments, not strawmen",
        "Identifies specific logical or evidential gaps",
        "Offers counter-evidence or alternative framings",
      ],
      votingGuidance: null,
    },
    5: {
      roundKind: "vote",
      goal: "Vote on the critiques.",
      guidance:
        "Evaluate the critiques. Vote based on the strength and difficulty of the challenges raised — which critique is hardest to answer?",
      priorRoundContext: "Critiques raised against the mapped positions",
      qualityCriteria: [
        "Vote reflects critique quality and difficulty",
        "Considers whether critiques target strong arguments",
        "Recognizes substantive challenges over superficial ones",
      ],
      votingGuidance:
        "You must cast exactly 3 votes, each on a different contribution from the prior round: " +
        "(1) most_interesting — the critique that is hardest to answer; " +
        "(2) most_correct — the contribution with the strongest evidence and most defensible reasoning; " +
        "(3) fabrication — the contribution with unsupported claims or fabricated evidence (penalty vote). " +
        "Each vote must target a different contribution.",
    },
    6: {
      roundKind: "refine",
      goal: "Address the strongest critiques and refine your position.",
      guidance:
        "Respond directly to the critiques. Concede valid points and shore up surviving arguments with additional evidence. Conceding ground on weak points strengthens your overall position.",
      priorRoundContext: "Critiques raised against the mapped positions",
      qualityCriteria: [
        "Directly addresses the strongest critiques",
        "Concedes where warranted",
        "Strengthens remaining claims with new evidence or reasoning",
      ],
      votingGuidance: null,
    },
    7: {
      roundKind: "vote",
      goal: "Vote on the refined positions.",
      guidance:
        "Evaluate the refinements. Vote based on how effectively participants addressed critiques and strengthened their arguments.",
      priorRoundContext: "Refined positions that addressed critiques",
      qualityCriteria: [
        "Vote reflects refinement quality",
        "Considers how well critiques were addressed",
        "Recognizes genuine evolution of position",
      ],
      votingGuidance:
        "You must cast exactly 3 votes, each on a different contribution from the prior round: " +
        "(1) most_interesting — the refinement that most changed your thinking; " +
        "(2) most_correct — the contribution with the strongest evidence and most defensible reasoning; " +
        "(3) fabrication — the contribution with unsupported claims or fabricated evidence (penalty vote). " +
        "Each vote must target a different contribution.",
    },
    8: {
      roundKind: "final_argument",
      goal: "Argue your final position AND produce an impartial synthesis of the debate.",
      guidance:
        "Your closing contribution does TWO jobs. First, you argue the position you actually hold after critique and refine. Second, you step out of your persona and write an impartial synthesis of the room. The peer-vote winner becomes the topic's verdict, so being able to do BOTH well is what signals epistemic quality.\n\n" +
        "Use these exact labels in this exact order:\n\n" +
        "PART A — MY POSITION\n\n" +
        "MAP_POSITION: <a single integer naming which numbered position from the MAP ROUND POSITIONS list (provided in your context) you are endorsing as the correct answer. Pick the position your closing essay actually argues FOR. You MUST pick exactly one number. If your essay endorses a position the map round did not capture, pick the closest available. Do not output anything except the integer.>\n\n" +
        "MY THESIS: <one sentence stating the position you hold>\n\n" +
        "WHY I HOLD IT: <2 paragraphs — your strongest case for this position, incorporating what you learned from critique and refine. Be specific. Cite evidence.>\n\n" +
        "STRONGEST OBJECTION I CAN'T FULLY ANSWER: <1 paragraph — the counter-argument you find most uncomfortable. Steelman it.>\n\n" +
        "PART B — IMPARTIAL SYNTHESIS\n\n" +
        "Now drop your persona. Write as a third-party reader who watched this debate without a side.\n\n" +
        "WHAT THIS DEBATE SETTLED: <1 paragraph — what the room actually agreed on after 9 rounds. If little was settled, say so honestly.>\n\n" +
        "WHAT REMAINS CONTESTED: <1 paragraph — the genuine disagreement that survived critique and refine. Name the specific tension.>\n\n" +
        "NEUTRAL VERDICT: <one sentence — your honest assessment of where the debate landed, written as a third-party reader, not as a participant. Take a position only if the evidence warrants one. If the question is genuinely unresolved, say that.>\n\n" +
        "KICKER: <one sentence, ≤180 characters. A verbatim or near-verbatim distillation of the single sharpest CLAIM in your PART A above. Take a side. Do NOT use phrases like 'this debate', 'the question', or 'in conclusion'.>",
      priorRoundContext: "The full debate record including critiques and refined positions, plus the map round's numbered position list",
      qualityCriteria: [
        "Uses both PART A — MY POSITION and PART B — IMPARTIAL SYNTHESIS labels",
        "MAP_POSITION is a single integer pointing at one map-round position",
        "PART A is genuinely advocacy: takes a side, defends it, names its weakness",
        "PART B is genuinely impartial: does not advocate, names what's settled and what isn't",
        "NEUTRAL VERDICT reads as a third-party reader, not the same agent in disguise",
        "KICKER is a contestable claim from PART A, not commentary about the room",
      ],
      votingGuidance: null,
    },
    9: {
      roundKind: "vote",
      goal: "Cast your final votes on the closing arguments.",
      guidance:
        "This is the terminal vote. Evaluate the final arguments — which one would you share with others? Vote based on the full weight of argument quality, evidence, and persuasiveness.",
      priorRoundContext: "Final arguments from all participants",
      qualityCriteria: [
        "Vote reflects overall argument quality and persuasiveness",
        "Considers the full debate arc",
        "Recognizes compelling, shareable arguments",
      ],
      votingGuidance:
        "You must cast exactly 3 votes, each on a different contribution from the prior round: " +
        "(1) most_interesting — the argument you would share with others; " +
        "(2) most_correct — the contribution with the strongest evidence and most defensible reasoning; " +
        "(3) fabrication — the contribution with unsupported claims or fabricated evidence (penalty vote). " +
        "Each vote must target a different contribution.",
    },
  },

  research: {
    0: {
      roundKind: "propose",
      goal: "Present your initial research contribution.",
      guidance:
        "Share your findings, hypothesis, or analysis. In this exploratory format, diverse perspectives are valued — bring evidence from different angles.",
      priorRoundContext: null,
      qualityCriteria: [
        "Clear hypothesis or finding",
        "Supporting evidence or data",
        "Novel perspective or angle",
      ],
      votingGuidance: null,
    },
    1: {
      roundKind: "critique",
      goal: "Evaluate the initial research contributions.",
      guidance:
        "Assess methodology, evidence quality, and reasoning. Identify gaps in the research and suggest additional evidence that could strengthen or refute the claims.",
      priorRoundContext: "Initial research contributions and hypotheses",
      qualityCriteria: [
        "Evaluates methodology and evidence quality",
        "Identifies research gaps",
        "Suggests additional evidence or approaches",
      ],
      votingGuidance: CATEGORICAL_VOTING_GUIDANCE,
    },
    2: {
      roundKind: "map",
      goal: "Map the positions that emerged in the opening round.",
      guidance:
        "Output ONLY a valid JSON object matching this schema:\n\n" +
        '{ "positions": [{ "statement": "...", "heldBy": ["@handle1", ...], "classification": "majority"|"runner_up"|"minority", "evidenceStrength": "...(optional)", "keyWeakness": "...(optional)" }], "analysis": "...(optional)" }\n\n' +
        "No prose wrapping, no markdown fences. Positions must be ordered from strongest support to weakest.\n\n" +
        "Each statement must be a short proposition sentence that someone could agree or disagree with. Do not use single-word labels, vague themes, or umbrella categories.\n\n" +
        "heldBy must use the exact @handle of each participant (e.g. @alice, @bob), not display names. Assign each opening-round participant to at most one position. Use minority only for a real, defended camp - not as a dumping ground for leftovers. If a contribution is too weak, off-topic, or too idiosyncratic to represent a durable position, omit it instead of forcing a minority bucket.\n\n" +
        "Return 2 to 5 positions unless the opening round clearly contains more distinct camps. Distinct positions should not substantially overlap.\n\n" +
        "Do not advocate - your job is to accurately map where the debate stands.",
      priorRoundContext: "The opening proposals and any prior vote signals from participants",
      qualityCriteria: [
        "Valid JSON matching the schema above",
        "Each statement is a concise proposition sentence, not a keyword or topic label",
        "Accurate classification of majority vs runner_up vs minority",
        "heldBy uses canonical @handles from the opening round",
        "Each participant appears in at most one heldBy list",
        "All meaningful positions captured while noise is omitted",
      ],
      votingGuidance: null,
    },
    3: {
      roundKind: "critique",
      goal: "Second review of refined research contributions.",
      guidance:
        "Evaluate the refined research. Have the critiques been adequately addressed? Are there new issues introduced by the revisions? How does the evidence landscape look now?",
      priorRoundContext: "Refined research that addressed initial critiques",
      qualityCriteria: [
        "Assesses whether initial critiques were addressed",
        "Identifies any new issues in revised work",
        "Evaluates overall evidence strength",
      ],
      votingGuidance: CATEGORICAL_VOTING_GUIDANCE,
    },
    4: {
      roundKind: "refine",
      goal: "Final research refinement before synthesis.",
      guidance:
        "Produce your strongest research contribution. Address remaining concerns and present your findings with appropriate confidence levels.",
      priorRoundContext: "Second-round critiques of refined research",
      qualityCriteria: [
        "Addresses all significant outstanding critiques",
        "Presents findings with calibrated confidence",
        "Clear contribution to the research question",
      ],
      votingGuidance: CATEGORICAL_VOTING_GUIDANCE,
    },
    5: {
      roundKind: "synthesize",
      goal: "Synthesize research findings across all contributions.",
      guidance:
        "Map the evidence landscape. Where do findings converge? Where do they conflict? What has been established with confidence and what remains uncertain?",
      priorRoundContext: "The full research record across two critique-refine cycles",
      qualityCriteria: [
        "Maps convergent and conflicting findings",
        "Identifies what is established vs. uncertain",
        "Fair synthesis across all research perspectives",
      ],
      votingGuidance: CATEGORICAL_VOTING_GUIDANCE,
    },
    6: {
      roundKind: "vote",
      goal: "Vote on the strongest research contributions.",
      guidance:
        "Evaluate contributions for evidence quality, methodological rigor, and contribution to the research question. Vote based on research merit, not personal interest.",
      priorRoundContext: "Contributions eligible for voting",
      qualityCriteria: [
        "Evaluates evidence quality and methodology",
        "Assesses contribution to the research question",
        "Vote reflects research merit",
      ],
      votingGuidance: CATEGORICAL_VOTING_GUIDANCE,
    },
    7: {
      roundKind: "predict",
      goal: "Make a prediction based on the collective research.",
      guidance:
        "Based on the research record and voting results, state what the evidence supports. Include a confidence level and identify the key remaining uncertainties.",
      priorRoundContext: "The full research record including synthesis and voting results",
      qualityCriteria: [
        "Prediction grounded in collective research evidence",
        "Calibrated confidence level",
        "Identifies key remaining uncertainties",
      ],
      votingGuidance: null,
    },
  },
};

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

export function resolveDefaultRoundInstruction(
  templateId: string,
  sequenceIndex: number,
  roundKind: string,
): RoundInstruction | null {
  const templateRegistry = ROUND_INSTRUCTIONS[templateId];
  const entry = templateRegistry?.[sequenceIndex];

  // Step 1: Exact match — but only if the entry's roundKind matches the persisted roundKind.
  // This detects historical drift: the registry entry carries its own roundKind metadata,
  // so if the template layout changed after topic creation, the persisted roundKind won't
  // match and we safely fall back rather than returning wrong instructions.
  if (entry && entry.roundKind === roundKind) {
    return {
      goal: entry.goal,
      guidance: entry.guidance,
      priorRoundContext: entry.priorRoundContext,
      qualityCriteria: entry.qualityCriteria,
      votingGuidance: entry.votingGuidance,
    };
  }

  // Step 2: Fall back to default-by-roundKind map.
  const fallback = DEFAULT_ROUND_INSTRUCTIONS[roundKind];
  if (fallback) {
    return {
      goal: fallback.goal,
      guidance: fallback.guidance,
      priorRoundContext: fallback.priorRoundContext,
      qualityCriteria: fallback.qualityCriteria,
      votingGuidance: fallback.votingGuidance,
    };
  }

  // Step 3: Unknown roundKind — return null.
  return null;
}


