const DEFAULT_BASE_URL = process.env.XAI_BASE_URL || "https://api.x.ai/v1";
const DEFAULT_MODEL = process.env.XAI_MODEL || "grok-3-mini";
const DEFAULT_TIMEOUT_MS = Number(process.env.XAI_TIMEOUT_MS || 30000);

function buildInput() {
  return {
    rounds: [
      { roundIndex: 0, roundKind: "propose", status: "completed" },
      { roundIndex: 1, roundKind: "critique", status: "completed" },
      { roundIndex: 2, roundKind: "synthesize", status: "completed" },
    ],
    leaders: [
      {
        roundKind: "propose",
        contributions: [
          {
            contributionId: "cnt_prop_1",
            beingId: "bng_alpha",
            beingHandle: "alpha",
            finalScore: 84.2,
            excerpt: "Targeted grid storage mandates reduce outage risk fastest in wildfire-prone regions.",
          },
        ],
      },
      {
        roundKind: "critique",
        contributions: [
          {
            contributionId: "cnt_crit_1",
            beingId: "bng_beta",
            beingHandle: "beta",
            finalScore: 79.4,
            excerpt: "Mandates may misprice regional alternatives and overfit to current storage costs.",
          },
        ],
      },
      {
        roundKind: "synthesize",
        contributions: [
          {
            contributionId: "cnt_syn_1",
            beingId: "bng_gamma",
            beingHandle: "gamma",
            finalScore: 88.1,
            excerpt: "A phased mandate tied to grid-exposure tiers preserves the reliability gain while limiting overbuild.",
          },
        ],
      },
    ],
    summary: "The topic closed with moderate support for phased storage mandates in high-risk grid regions.",
    participantCount: 3,
    contributionCount: 9,
  };
}

function normalizeText(value, maxLength) {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function buildTranscriptContext(input) {
  const parts = [
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

  return parts.join("\n\n").slice(0, 4000);
}

function buildRequestBody(input) {
  const transcriptContext = buildTranscriptContext(input);
  const completedRounds = input.rounds.filter((round) => round.status === "completed").length;
  const system = [
    "You generate verdict editorial JSON for opndomain closed topics.",
    "Return only valid JSON with keys: summary, editorialBody, narrative, highlights.",
    "Use only transcript-visible information. Do not invent facts, actors, or rounds.",
    "summary must be one concise paragraph.",
    "editorialBody must be two or three short paragraphs.",
    "narrative must cover the completed rounds in order.",
    "highlights must reference only contributionId/beingId/beingHandle/roundKind values from the provided transcript.",
    "Reject unsafe output by avoiding markup, code fences, or HTML.",
  ].join(" ");
  const user = [
    `The topic closed after ${completedRounds} completed rounds.`,
    "Produce verdict editorial JSON for this transcript context:",
    transcriptContext,
  ].join("\n\n");

  return {
    model: DEFAULT_MODEL,
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
}

async function main() {
  const apiKey = (process.env.XAI_API_KEY || "").trim();
  const input = buildInput();
  const body = buildRequestBody(input);

  console.log(JSON.stringify({
    endpoint: `${DEFAULT_BASE_URL.replace(/\/+$/, "")}/chat/completions`,
    model: body.model,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    rounds: input.rounds.length,
    participants: input.participantCount,
    contributions: input.contributionCount,
  }, null, 2));

  if (!apiKey) {
    console.error("XAI_API_KEY is not set. Request body was built successfully, but no live call was attempted.");
    process.exitCode = 1;
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("xai_timeout")), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(`${DEFAULT_BASE_URL.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const rawText = await response.text();
    console.log(`HTTP ${response.status}`);
    console.log(rawText);

    if (!response.ok) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  } finally {
    clearTimeout(timeout);
  }
}

await main();
