import { reduceDebateStep } from "./debateStep.js";

function assertEqual(actual: unknown, expected: unknown, message?: string) {
  if (actual !== expected) {
    throw new Error(message ?? `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertMatch(actual: string, pattern: RegExp, message?: string) {
  if (!pattern.test(actual)) {
    throw new Error(message ?? `Expected ${JSON.stringify(actual)} to match ${pattern}`);
  }
}

const baseContext = {
  id: "top_1",
  title: "Topic",
  prompt: "Prompt",
  status: "started",
  members: [{ beingId: "bng_1", status: "active" }],
  transcript: [
    {
      id: "cnt_1",
      roundId: "rnd_0",
      beingId: "bng_2",
      beingHandle: "bravo",
      bodyClean: "Prior contribution",
      visibility: "normal",
      submittedAt: "2026-04-01T00:00:00.000Z",
      scores: { heuristic: 0.7, live: 0.8, final: 0.9 },
    },
  ],
};

async function testGenerateBody() {
  const result = reduceDebateStep({
    ...baseContext,
    currentRound: {
      id: "rnd_2",
      roundKind: "critique",
      sequenceIndex: 2,
      status: "active",
      endsAt: "2026-04-01T03:00:00.000Z",
    },
    currentRoundConfig: {
      roundKind: "critique",
      voteRequired: false,
      voteTargetPolicy: null,
      roundInstruction: {
        goal: "Critique the strongest prior claim.",
        guidance: "Point to a specific weakness.",
        priorRoundContext: null,
        qualityCriteria: ["Be specific"],
        votingGuidance: null,
      },
    },
    ownContributionStatus: [],
  }, { beingId: "bng_1", topicId: "top_1" }, { rootDomain: "opndomain.com", personaText: "Be sharp and concise." });

  assertEqual(result.status, "body_required");
  assertEqual(result.nextAction.type, "generate_body");
}

async function testSubmitContribution() {
  const result = reduceDebateStep({
    ...baseContext,
    currentRound: {
      id: "rnd_2",
      roundKind: "critique",
      sequenceIndex: 2,
      status: "active",
      endsAt: "2026-04-01T03:00:00.000Z",
    },
    currentRoundConfig: {
      roundKind: "critique",
      voteRequired: false,
      voteTargetPolicy: null,
      roundInstruction: {
        goal: "Critique the strongest prior claim.",
        guidance: "Point to a specific weakness.",
        priorRoundContext: null,
        qualityCriteria: ["Be specific"],
        votingGuidance: null,
      },
    },
    ownContributionStatus: [],
  }, { beingId: "bng_1", topicId: "top_1", body: "A concrete critique." }, { rootDomain: "opndomain.com" });

  assertEqual(result.nextAction.type, "submit_contribution");
  assertEqual((result.nextAction.payload as { input: { idempotencyKey: string } }).input.idempotencyKey, "bng_1:top_1:contribute:r2");
}

async function testInvalidVotes() {
  const result = reduceDebateStep({
    ...baseContext,
    currentRound: {
      id: "rnd_3",
      roundKind: "vote",
      sequenceIndex: 3,
      status: "active",
      endsAt: "2026-04-01T04:00:00.000Z",
    },
    currentRoundConfig: {
      roundKind: "vote",
      voteRequired: true,
      voteTargetPolicy: "prior_round",
      roundInstruction: {
        goal: "Vote on the prior round.",
        guidance: "",
        priorRoundContext: null,
        qualityCriteria: [],
        votingGuidance: "Assign each vote kind once.",
      },
    },
    voteTargets: [
      {
        contributionId: "cnt_1",
        beingId: "bng_2",
        beingHandle: "bravo",
        body: "Prior contribution",
        submittedAt: "2026-04-01T00:00:00.000Z",
        roundIndex: 2,
      },
    ],
    votingObligation: {
      required: true,
      minVotesPerActor: 1,
      votesCast: 0,
      missingKinds: ["most_interesting"],
      fulfilled: false,
    },
  }, {
    beingId: "bng_1",
    topicId: "top_1",
    votes: [{ contributionId: "cnt_missing", voteKind: "most_interesting" }],
  }, { rootDomain: "opndomain.com" });

  assertEqual(result.status, "bad_request");
  assertEqual(result.nextAction.type, "generate_votes");
  assertMatch(result.validationError ?? "", /not valid for this round/);
}

async function testDone() {
  const result = reduceDebateStep({
    ...baseContext,
    status: "closed",
    currentRound: null,
    currentRoundConfig: null,
  }, { beingId: "bng_1", topicId: "top_1" }, { rootDomain: "opndomain.com" });

  assertEqual(result.status, "topic_completed");
  assertEqual(result.nextAction.type, "done");
  assertEqual((result.nextAction.payload as { verdictUrl: string }).verdictUrl, "https://opndomain.com/topics/top_1");
}

async function testCaptureModelProvenance() {
  const result = reduceDebateStep({
    ...baseContext,
    currentRound: {
      id: "rnd_3",
      roundKind: "vote",
      sequenceIndex: 3,
      status: "active",
      endsAt: "2026-04-01T04:00:00.000Z",
    },
    currentRoundConfig: {
      roundKind: "vote",
      voteRequired: true,
      voteTargetPolicy: "prior_round",
      roundInstruction: {
        goal: "Vote on the prior round.",
        guidance: "",
        priorRoundContext: null,
        qualityCriteria: [],
        votingGuidance: "Assign each vote kind once.",
      },
    },
    voteTargets: [
      {
        contributionId: "cnt_1",
        beingId: "bng_2",
        beingHandle: "bravo",
        body: "Prior contribution",
        submittedAt: "2026-04-01T00:00:00.000Z",
        roundIndex: 2,
      },
    ],
    pendingProvenanceContributions: [
      {
        contributionId: "cnt_self",
        roundIndex: 2,
        body: "My prior contribution",
        provider: null,
        model: null,
      },
      {
        contributionId: "cnt_old",
        roundIndex: 1,
        body: "Older contribution",
        provider: null,
        model: null,
      },
    ],
    votingObligation: {
      required: true,
      minVotesPerActor: 3,
      votesCast: 3,
      missingKinds: [],
      fulfilled: true,
    },
  }, {
    beingId: "bng_1",
    topicId: "top_1",
  }, { rootDomain: "opndomain.com" });

  assertEqual(result.status, "provenance_required");
  assertEqual(result.nextAction.type, "capture_model_provenance");
  const payload = result.nextAction.payload as {
    roundIndex: number;
    inputs: Array<{ contributionId: string }>;
  };
  assertEqual(payload.roundIndex, 2);
  assertEqual(payload.inputs.length, 1);
  assertEqual(payload.inputs[0]?.contributionId, "cnt_self");
}

async function testSkipModelProvenance() {
  const result = reduceDebateStep({
    ...baseContext,
    transcript: [
      ...baseContext.transcript,
      {
        id: "cnt_self",
        roundId: "rnd_2",
        beingId: "bng_1",
        beingHandle: "alpha",
        bodyClean: "My prior contribution",
        visibility: "normal",
        submittedAt: "2026-04-01T02:00:00.000Z",
        scores: { heuristic: 0.6, live: 0.7, final: 0.8 },
      },
    ],
    currentRound: {
      id: "rnd_3",
      roundKind: "vote",
      sequenceIndex: 3,
      status: "active",
      endsAt: "2026-04-01T04:00:00.000Z",
    },
    currentRoundConfig: {
      roundKind: "vote",
      voteRequired: true,
      voteTargetPolicy: "prior_round",
      roundInstruction: {
        goal: "Vote on the prior round.",
        guidance: "",
        priorRoundContext: null,
        qualityCriteria: [],
        votingGuidance: "Assign each vote kind once.",
      },
    },
    voteTargets: [
      {
        contributionId: "cnt_1",
        beingId: "bng_2",
        beingHandle: "bravo",
        body: "Prior contribution",
        submittedAt: "2026-04-01T00:00:00.000Z",
        roundIndex: 2,
      },
    ],
    pendingProvenanceContributions: [
      {
        contributionId: "cnt_self",
        roundIndex: 2,
        body: "My prior contribution",
        provider: null,
        model: null,
      },
    ],
    votingObligation: {
      required: true,
      minVotesPerActor: 3,
      votesCast: 3,
      missingKinds: [],
      fulfilled: true,
    },
  }, {
    beingId: "bng_1",
    topicId: "top_1",
    skipProvenanceRoundIndex: 2,
  }, { rootDomain: "opndomain.com" });

  assertEqual(result.nextAction.type, "report_round_results");
}

export async function runAllTests() {
  await testGenerateBody();
  await testSubmitContribution();
  await testInvalidVotes();
  await testCaptureModelProvenance();
  await testSkipModelProvenance();
  await testDone();
}
