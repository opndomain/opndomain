import { D1_BATCH_SAFE_LIMIT } from "@opndomain/shared";
import type { ContributionScoreDetails, GuardrailDecision, ScoringProfile } from "@opndomain/shared";
import type { ExtractedClaim } from "../epistemic/claim-extraction.js";

export const TOPIC_STATE_PENDING_RECORD_LIMIT = D1_BATCH_SAFE_LIMIT;

export type TopicStatePublicResponse = {
  id: string;
  visibility: string;
  guardrailDecision: GuardrailDecision;
  scores: {
    substance: number;
    role: string;
    roleBonus: number;
    echoDetected: boolean;
    metaDetected: boolean;
    relevance: number | null;
    novelty: number | null;
    reframe: number | null;
    semanticFlags: string[];
    initialScore: number;
    finalScore: number;
    shadowInitialScore: number;
    shadowFinalScore: number;
  };
};

export type TopicStateVotePublicResponse = {
  id: string;
  topicId: string;
  roundId: string;
  contributionId: string;
  voterBeingId: string;
  direction: number;
  weight: number;
  value: "up" | "down";
  weightedValue: number;
  acceptedAt: string;
  replayed: boolean;
  pendingFlush: boolean;
};

export type TopicStateIngestRequest = {
  contributionId: string;
  idempotencyKey: string;
  topicId: string;
  roundId: string;
  roundIndex: number;
  beingId: string;
  body: string;
  bodyClean: string;
  visibility: string;
  guardrailDecision: GuardrailDecision;
  scores: {
    substanceScore: number;
    roleBonus: number;
    detectedRole: string;
    echoDetected: boolean;
    metaDetected: boolean;
    liveMultiplier: number;
    shadowMultiplier: number;
    agreementNovDampenLive: number;
    agreementNovDampenShadow: number;
    relevance: number | null;
    novelty: number | null;
    reframe: number | null;
    semanticScore: number | null;
    semanticFlags: string[];
    initialScore: number;
    finalScore: number;
    shadowInitialScore: number;
    shadowFinalScore: number;
    details: ContributionScoreDetails;
  };
  scoreVersion: string;
  shadowVersion: string;
  scoringProfile: ScoringProfile | string;
  submittedAt: string;
  claims?: {
    domainId: string;
    items: ExtractedClaim[];
  };
};

export type PendingMessageRow = {
  id: string;
  topic_id: string;
  payload_json: string;
  flushed: number;
  created_at: string;
};

export type PendingScoreRow = {
  id: string;
  contribution_id: string;
  payload_json: string;
  flushed: number;
  created_at: string;
};

export type TopicStateVoteIngestRequest = {
  voteId: string;
  topicId: string;
  roundId: string;
  contributionId: string;
  voterBeingId: string;
  direction: number;
  weight: number;
  value: "up" | "down";
  weightedValue: number;
  acceptedAt: string;
  idempotencyKey: string;
  targetRoundId: string;
};

export type PendingVoteRow = {
  id: string;
  vote_key: string;
  topic_id: string;
  contribution_id: string;
  payload_json: string;
  flushed: number;
  created_at: string;
};

export const TOPIC_STATE_INIT_SQL = [
  `CREATE TABLE IF NOT EXISTS pending_messages (id TEXT PRIMARY KEY, topic_id TEXT NOT NULL, payload_json TEXT NOT NULL, flushed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS pending_scores (id TEXT PRIMARY KEY, contribution_id TEXT NOT NULL, payload_json TEXT NOT NULL, flushed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS pending_votes (id TEXT PRIMARY KEY, vote_key TEXT NOT NULL UNIQUE, topic_id TEXT NOT NULL, contribution_id TEXT NOT NULL, payload_json TEXT NOT NULL, flushed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS pending_aux (id TEXT PRIMARY KEY, table_name TEXT NOT NULL, operation TEXT NOT NULL, payload_json TEXT NOT NULL, flushed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS idempotency_keys (key TEXT PRIMARY KEY, contribution_id TEXT NOT NULL, response_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS vote_keys (vote_key TEXT PRIMARY KEY, direction INTEGER NOT NULL, response_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS contribution_counts (topic_id TEXT NOT NULL, round_index INTEGER NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (topic_id, round_index))`,
  `CREATE TABLE IF NOT EXISTS latest_round_contributions (contribution_id TEXT PRIMARY KEY, topic_id TEXT NOT NULL, round_index INTEGER NOT NULL, being_id TEXT NOT NULL, visibility TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE INDEX IF NOT EXISTS idx_pending_messages_unflushed ON pending_messages(flushed, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_pending_scores_unflushed ON pending_scores(flushed, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_pending_votes_unflushed ON pending_votes(flushed, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_pending_aux_unflushed ON pending_aux(flushed, created_at)`,
] as const;
