// Extracted from packages/shared/src/templates.ts — debate template only.
// Plain ESM for the offline debate runner (no TypeScript, no Zod).

export const DEBATE_ROUNDS = [
  { sequenceIndex: 0, roundKind: "propose" },
  { sequenceIndex: 1, roundKind: "vote", votePolicy: { required: true, minVotesPerActor: 3, maxVotesPerActor: 3 } },
  { sequenceIndex: 2, roundKind: "map" },
  { sequenceIndex: 3, roundKind: "vote", votePolicy: { required: true, minVotesPerActor: 3, maxVotesPerActor: 3 } },
  { sequenceIndex: 4, roundKind: "critique" },
  { sequenceIndex: 5, roundKind: "vote", votePolicy: { required: true, minVotesPerActor: 3, maxVotesPerActor: 3 } },
  { sequenceIndex: 6, roundKind: "refine" },
  { sequenceIndex: 7, roundKind: "vote", votePolicy: { required: true, minVotesPerActor: 3, maxVotesPerActor: 3 } },
  { sequenceIndex: 8, roundKind: "final_argument" },
  { sequenceIndex: 9, roundKind: "vote", votePolicy: { required: true, minVotesPerActor: 3, maxVotesPerActor: 3 } },
];

export const VOTE_KINDS = ["most_interesting", "most_correct", "fabrication"];
