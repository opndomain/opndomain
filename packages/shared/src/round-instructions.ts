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
};

/**
 * Public output type — roundKind omitted (already on currentRoundConfig).
 */
export type RoundInstruction = Omit<RoundInstructionEntry, "roundKind">;

// ---------------------------------------------------------------------------
// Default-by-roundKind fallback map
// ---------------------------------------------------------------------------

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
  },
};

// ---------------------------------------------------------------------------
// Per-template instruction registry
// ---------------------------------------------------------------------------

export const ROUND_INSTRUCTIONS: Record<string, Record<number, RoundInstructionEntry>> = {
  debate_v1: {
    0: {
      roundKind: "propose",
      goal: "Present your initial position in this structured debate.",
      guidance:
        "State a clear, debatable thesis with supporting evidence. You are entering an adversarial debate format — your position will be directly challenged in the next round, so be precise and anticipate objections.",
      priorRoundContext: null,
      qualityCriteria: [
        "Clear, debatable thesis statement",
        "Anticipates likely counter-arguments",
        "Specific evidence and reasoning, not vague appeals",
      ],
    },
    1: {
      roundKind: "critique",
      goal: "Challenge the strongest proposals from Round 1.",
      guidance:
        "Target the most compelling arguments — finding flaws in strong positions is more valuable than dismantling weak ones. Identify unsupported assumptions, logical gaps, or missing evidence.",
      priorRoundContext: "Initial positions and theses from the propose round",
      qualityCriteria: [
        "Engages with the strongest arguments, not strawmen",
        "Identifies specific flaws in reasoning or evidence",
        "Provides counter-evidence where possible",
      ],
    },
    2: {
      roundKind: "refine",
      goal: "Strengthen your position by addressing Round 2 critiques.",
      guidance:
        "Respond to the critiques raised. Concede valid points — this strengthens credibility. Shore up the arguments that survived with additional evidence or clarified logic.",
      priorRoundContext: "Critiques raised against initial proposals",
      qualityCriteria: [
        "Directly addresses specific critiques",
        "Concedes where warranted",
        "Adds new supporting evidence for surviving claims",
      ],
    },
    3: {
      roundKind: "critique",
      goal: "Stress-test refined positions from Round 3.",
      guidance:
        "The refined positions should be stronger now. Look for remaining weaknesses, unaddressed objections, or new vulnerabilities introduced during refinement.",
      priorRoundContext: "Refined positions that addressed earlier critiques",
      qualityCriteria: [
        "Identifies weaknesses that survived the first refinement",
        "Catches new vulnerabilities introduced during revision",
        "Avoids repeating critiques already addressed",
      ],
    },
    4: {
      roundKind: "refine",
      goal: "Final refinement — produce your strongest possible position.",
      guidance:
        "This is your last opportunity to refine. Address remaining critiques, integrate the strongest counter-points, and present the most defensible version of your argument.",
      priorRoundContext: "Second-round critiques of refined positions",
      qualityCriteria: [
        "Integrates lessons from two rounds of critique",
        "Presents the strongest defensible version of the argument",
        "Acknowledges genuine uncertainty where it remains",
      ],
    },
    5: {
      roundKind: "synthesize",
      goal: "Map the debate landscape after two critique-refine cycles.",
      guidance:
        "Identify where genuine convergence occurred across participants. Which original claims survived two rounds of adversarial testing? Which were successfully refuted? Where do fundamental disagreements remain?",
      priorRoundContext: "The full debate arc: proposals, critiques, and two rounds of refinement",
      qualityCriteria: [
        "Accurately tracks which claims survived adversarial testing",
        "Maps genuine convergence vs. persistent disagreements",
        "Distinguishes empirical disagreements from value differences",
      ],
    },
    6: {
      roundKind: "predict",
      goal: "State your final prediction based on the debate record.",
      guidance:
        "Synthesize the debate into a concrete prediction. State your confidence level and the specific evidence from the debate that supports it. Reference which arguments proved most resilient under adversarial scrutiny.",
      priorRoundContext: "The synthesized debate record from all prior rounds",
      qualityCriteria: [
        "Prediction is grounded in debate evidence",
        "Confidence level reflects the state of the debate",
        "References which arguments survived adversarial testing",
      ],
    },
  },

  debate_v2: {
    0: {
      roundKind: "propose",
      goal: "Present your initial position in this focused debate.",
      guidance:
        "State a clear thesis with supporting evidence. This is a compact 5-round debate — be precise and make your strongest case up front.",
      priorRoundContext: null,
      qualityCriteria: [
        "Clear, debatable thesis",
        "Supporting evidence or reasoning",
        "Precise and well-scoped claims",
      ],
    },
    1: {
      roundKind: "critique",
      goal: "Challenge the strongest proposals from the opening round.",
      guidance:
        "Focus on the most compelling arguments. Identify unsupported assumptions, logical gaps, or alternative interpretations of the evidence presented.",
      priorRoundContext: "Initial positions from the propose round",
      qualityCriteria: [
        "Targets strongest arguments",
        "Identifies specific logical or evidential gaps",
        "Offers counter-evidence or alternative framings",
      ],
    },
    2: {
      roundKind: "refine",
      goal: "Address critiques and strengthen your position.",
      guidance:
        "Respond directly to the critiques. Concede valid points and shore up surviving arguments with additional evidence. This is your one chance to refine before synthesis.",
      priorRoundContext: "Critiques raised against initial proposals",
      qualityCriteria: [
        "Addresses the strongest critiques directly",
        "Concedes where warranted",
        "Strengthens remaining claims with new evidence",
      ],
    },
    3: {
      roundKind: "synthesize",
      goal: "Synthesize the debate into a clear landscape.",
      guidance:
        "Map where participants converged and where genuine disagreements remain. Identify the arguments that survived critique and refinement versus those that were successfully challenged.",
      priorRoundContext: "The full arc of proposals, critiques, and refinements",
      qualityCriteria: [
        "Tracks which claims survived the critique-refine cycle",
        "Maps convergence and persistent disagreements",
        "Fair to all positions represented in the debate",
      ],
    },
    4: {
      roundKind: "predict",
      goal: "State your final prediction based on the debate.",
      guidance:
        "Make a concrete prediction with a confidence level. Ground it in the specific arguments and evidence from the debate record.",
      priorRoundContext: "The synthesized debate record",
      qualityCriteria: [
        "Concrete, falsifiable prediction",
        "Confidence level grounded in debate evidence",
        "References surviving arguments from the debate",
      ],
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
    },
    2: {
      roundKind: "refine",
      goal: "Strengthen your research based on peer critique.",
      guidance:
        "Address methodological concerns, incorporate suggested evidence, and refine your analysis. Acknowledge limitations identified by reviewers.",
      priorRoundContext: "Critiques of initial research contributions",
      qualityCriteria: [
        "Addresses methodological critiques",
        "Incorporates new evidence or analysis",
        "Acknowledges genuine limitations",
      ],
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
    },
  },

  deep: {
    0: {
      roundKind: "propose",
      goal: "Present your initial position for deep analysis.",
      guidance:
        "This is an extended 11-round deep-dive. Your initial position will undergo four rounds of adversarial testing. Be thorough and precise.",
      priorRoundContext: null,
      qualityCriteria: [
        "Thorough initial analysis",
        "Precise, well-supported claims",
        "Anticipates multiple lines of critique",
      ],
    },
    1: {
      roundKind: "critique",
      goal: "First critique of initial proposals.",
      guidance:
        "Begin the deep adversarial testing process. Identify the highest-priority weaknesses in the initial proposals — you will have three more opportunities to critique.",
      priorRoundContext: "Initial proposals and analyses",
      qualityCriteria: [
        "Identifies highest-priority weaknesses",
        "Targets fundamental assumptions",
        "Sets up productive lines of inquiry for future rounds",
      ],
    },
    2: {
      roundKind: "refine",
      goal: "First refinement — address initial critiques.",
      guidance:
        "Address the critiques raised. This is the first of four refinement opportunities, so focus on the most fundamental issues first.",
      priorRoundContext: "First round of critiques",
      qualityCriteria: [
        "Addresses the most fundamental critiques first",
        "Concedes where appropriate",
        "Strengthens core arguments",
      ],
    },
    3: {
      roundKind: "critique",
      goal: "Second critique — test refined positions.",
      guidance:
        "Examine how well the first refinement addressed initial critiques. Probe deeper into surviving arguments and look for second-order weaknesses.",
      priorRoundContext: "First refinements addressing initial critiques",
      qualityCriteria: [
        "Probes deeper than surface-level critique",
        "Identifies second-order weaknesses",
        "Tests the quality of concessions made",
      ],
    },
    4: {
      roundKind: "refine",
      goal: "Second refinement — deepen your analysis.",
      guidance:
        "Build on two rounds of critique to strengthen your position. Address deeper structural issues identified in the second critique round.",
      priorRoundContext: "Second round of critiques targeting refined positions",
      qualityCriteria: [
        "Addresses structural issues, not just surface objections",
        "Demonstrates evolving understanding",
        "Integrates insights from prior rounds",
      ],
    },
    5: {
      roundKind: "critique",
      goal: "Third critique — stress-test surviving arguments.",
      guidance:
        "The positions should be significantly stronger by now. Focus on the remaining weaknesses and test whether the arguments hold up under sustained scrutiny.",
      priorRoundContext: "Twice-refined positions",
      qualityCriteria: [
        "Tests arguments under sustained scrutiny",
        "Identifies any remaining fundamental weaknesses",
        "Avoids repeating already-addressed critiques",
      ],
    },
    6: {
      roundKind: "refine",
      goal: "Third refinement — approach final form.",
      guidance:
        "Your position should be approaching its strongest form. Address the third round of critiques and begin consolidating your argument.",
      priorRoundContext: "Third round of critiques",
      qualityCriteria: [
        "Near-final quality of argument",
        "All major critiques addressed",
        "Clear, consolidated reasoning",
      ],
    },
    7: {
      roundKind: "critique",
      goal: "Final critique — last adversarial test.",
      guidance:
        "This is the last opportunity to identify weaknesses. Focus on any remaining gaps in logic or evidence that could undermine the final positions.",
      priorRoundContext: "Thrice-refined, near-final positions",
      qualityCriteria: [
        "Identifies any remaining critical gaps",
        "Tests the robustness of final positions",
        "Distinguishes nit-picks from genuine remaining issues",
      ],
    },
    8: {
      roundKind: "refine",
      goal: "Final refinement — produce your strongest analysis.",
      guidance:
        "This is your last refinement. Produce the strongest, most defensible version of your analysis, incorporating insights from four rounds of adversarial testing.",
      priorRoundContext: "Final critique round",
      qualityCriteria: [
        "Incorporates four rounds of adversarial feedback",
        "Strongest defensible version of the argument",
        "Honest about remaining uncertainties",
      ],
    },
    9: {
      roundKind: "synthesize",
      goal: "Synthesize after four full critique-refine cycles.",
      guidance:
        "Map the comprehensive debate landscape. After four rounds of adversarial testing, what has been established? What arguments proved most resilient? What genuine uncertainties remain?",
      priorRoundContext: "The complete debate record across four critique-refine cycles",
      qualityCriteria: [
        "Tracks argument evolution across all rounds",
        "Identifies what withstood sustained adversarial testing",
        "Maps remaining genuine uncertainties",
      ],
    },
    10: {
      roundKind: "predict",
      goal: "State your prediction after deep adversarial analysis.",
      guidance:
        "After the most thorough adversarial process available, state what you believe with what confidence. Your prediction should reflect the depth of testing the arguments underwent.",
      priorRoundContext: "The full synthesized record from four critique-refine cycles",
      qualityCriteria: [
        "Prediction calibrated to depth of adversarial testing",
        "References which arguments proved most resilient",
        "Confidence level reflects remaining uncertainties",
      ],
    },
  },

  socratic: {
    0: {
      roundKind: "propose",
      goal: "Present your initial thesis for dialectical examination.",
      guidance:
        "State a clear position that can be examined through dialogue. The Socratic format prioritizes intellectual honesty and following arguments where they lead.",
      priorRoundContext: null,
      qualityCriteria: [
        "Clear thesis amenable to dialectical examination",
        "Honest about assumptions and premises",
        "Open to revision through dialogue",
      ],
    },
    1: {
      roundKind: "critique",
      goal: "Examine the initial theses through questioning.",
      guidance:
        "In the dialectical tradition, probe the assumptions underlying each thesis. Ask clarifying questions that expose hidden premises or reveal tensions in the reasoning.",
      priorRoundContext: "Initial theses and positions",
      qualityCriteria: [
        "Probes assumptions rather than attacking conclusions",
        "Asks clarifying questions that advance understanding",
        "Exposes hidden premises or tensions",
      ],
    },
    2: {
      roundKind: "refine",
      goal: "Revise your thesis in response to dialectical examination.",
      guidance:
        "Engage honestly with the questions raised. If your assumptions were exposed as flawed, revise them. The goal is truth-seeking, not position-defending.",
      priorRoundContext: "Dialectical critiques and probing questions",
      qualityCriteria: [
        "Engages honestly with challenges to assumptions",
        "Revises where warranted rather than defending reflexively",
        "Deepens understanding through revision",
      ],
    },
    3: {
      roundKind: "critique",
      goal: "Second dialectical examination of revised positions.",
      guidance:
        "Continue the Socratic process with the revised theses. Have the revisions addressed the fundamental concerns? Do new tensions emerge from the updated positions?",
      priorRoundContext: "Revised theses after initial dialectical examination",
      qualityCriteria: [
        "Examines whether revisions address root concerns",
        "Identifies tensions in updated positions",
        "Continues truth-seeking rather than point-scoring",
      ],
    },
    4: {
      roundKind: "refine",
      goal: "Final thesis revision through dialectical refinement.",
      guidance:
        "Produce your most honestly examined version of your thesis. Acknowledge where the dialectical process changed your thinking and where your original thesis held up.",
      priorRoundContext: "Second round of dialectical examination",
      qualityCriteria: [
        "Reflects genuine intellectual evolution",
        "Acknowledges where thinking changed",
        "Presents the most honestly examined thesis",
      ],
    },
    5: {
      roundKind: "synthesize",
      goal: "Synthesize the dialectical process and its outcomes.",
      guidance:
        "Map how the dialectical process evolved understanding. Where did theses survive examination? Where did they transform? What new understanding emerged from the dialogue?",
      priorRoundContext: "The full dialectical record across two examine-revise cycles",
      qualityCriteria: [
        "Tracks how understanding evolved through dialogue",
        "Identifies transformative moments in the dialectic",
        "Maps emergent understanding from the process",
      ],
    },
    6: {
      roundKind: "predict",
      goal: "State your prediction after dialectical examination.",
      guidance:
        "Based on the dialectical process, state what you believe with appropriate certainty. Reference where the Socratic examination strengthened or transformed your understanding.",
      priorRoundContext: "The synthesized dialectical record",
      qualityCriteria: [
        "Prediction reflects dialectical examination",
        "Certainty calibrated to depth of examination",
        "References how dialogue shaped understanding",
      ],
    },
  },

  chaos: {
    0: {
      roundKind: "propose",
      goal: "Contribute freely to this open-format topic.",
      guidance:
        "This is an open, unscored format with no structured rounds of critique. Share your thoughts, evidence, or perspective on the topic freely.",
      priorRoundContext: null,
      qualityCriteria: [
        "Relevant to the topic",
        "Adds value to the conversation",
        "Clear and understandable",
      ],
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
    };
  }

  // Step 3: Unknown roundKind — return null.
  return null;
}
