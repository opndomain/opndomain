import { Hono } from "hono";
import {
  AdminAuditLogQuerySchema,
  AnalyticsBackfillRequestSchema,
  AnalyticsBackfillResponseSchema,
  AdminDashboardMetricsQuerySchema,
  AdminListQuerySchema,
  AdminReasonSchema,
  AdminRestrictionsQuerySchema,
  BatchUpsertTopicCandidatesSchema,
  ClearAdminRestrictionSchema,
  CreateInternalTopicSchema,
  CreateAdminRestrictionSchema,
  QuarantineContributionRequestSchema,
  ReconcilePresentationRequestSchema,
  ReterminalizeTopicRequestSchema,
  RoundInstructionOverrideRequestSchema,
  SetAdminTopicCadenceSchema,
  SetAdminTopicDomainSchema,
  SetAdminTopicPromptSchema,
  SetAdminTopicTitleSchema,
  SetAdminTopicTrustThresholdSchema,
  SetAdminTopicVisibilitySchema,
  TOPIC_TEMPLATES,
  TopicCandidateCleanupRequestSchema,
  TopicCandidateQuerySchema,
  TopicIdeaContextQuerySchema,
  TopicAdminReasonSchema,
  TopicTemplateIdSchema,
  UpdateAdminBeingCapabilitySchema,
  UpdateAdminBeingStatusSchema,
  RevokeAdminBeingSessionsSchema,
} from "@opndomain/shared";
import type { ApiEnv } from "../lib/env.js";
import { assertAdminAgent } from "../lib/admin.js";
import { ApiError } from "../lib/errors.js";
import { allRows, firstRow, runStatement } from "../lib/db.js";
import { badRequest, notFound } from "../lib/errors.js";
import { jsonData, parseJsonBody } from "../lib/http.js";
import { listPendingSnapshotRetries } from "../lib/snapshot-sync.js";
import { authenticateRequest } from "../services/auth.js";
import {
  listRecentLifecycleMutations,
  readCronHeartbeatStatuses,
  sweepTopicLifecycle,
} from "../services/lifecycle.js";
import {
  batchUpsertTopicCandidates,
  cleanupExpiredCandidates,
  getTopicCandidate,
  getTopicCandidateInventory,
  getTopicIdeaContext,
  listTopicCandidates,
} from "../services/topic-candidates.js";
import { createInternalTopic } from "../services/topics.js";
import {
  archiveAdminTopic,
  clearAdminRestrictionRecord,
  createAdminRestrictionRecord,
  getAdminAuditLogEntry,
  getAdminDashboardMetrics,
  getAdminDashboardOverview,
  getAdminAgentDetail,
  getAdminBeingDetail,
  getAdminDomainDetail,
  getAdminTopicDetail,
  listAdminAgents,
  listAdminAuditLog,
  listAdminBeings,
  listAdminDomains,
  listActiveAdminRestrictions,
  listAdminTopics,
  revokeAdminBeingSessions,
  setAdminTopicCadence,
  setAdminTopicDomain,
  setAdminTopicPrompt,
  setAdminTopicTitle,
  setAdminTopicTrustThreshold,
  setAdminTopicVisibility,
  unarchiveAdminTopic,
  updateAdminBeingCapability,
  updateAdminBeingStatus,
} from "../services/admin.js";
import { backfillPlatformDailyRollups as backfillPlatformDailyRollupsService } from "../services/analytics.js";
import { reconcileTopicPresentation } from "../services/presentation.js";
import { backfillTopicClaims, forceFlushTopicState, runTerminalizationSequence } from "../services/terminalization.js";
import { recomputeContributionFinalScore } from "../services/votes.js";
import { assembleDossier } from "../services/dossier.js";
import { unaliasSlot } from "../services/canonical-slots.js";
import { getFinalizationProgress } from "../services/instance-finalization.js";
import { getLatestMergeRevision, executeMerge } from "../services/merge-engine.js";
import { sweepAutonomousTopics } from "../services/autonomous-lifecycle.js";

export const internalRoutes = new Hono<{ Bindings: ApiEnv }>();

type TopicStateTelemetrySnapshot = {
  acceptLatencyMsSamples: number[];
  recomputeDurationMsSamples: number[];
  snapshotDurationMsSamples: number[];
  drainThroughputSamples: Array<{
    contributionsPerFlush: number;
    votesPerFlush: number;
    auxRowsPerFlush: number;
  }>;
  pendingContributionBacklog: number;
  pendingVoteBacklog: number;
  pendingAuxBacklog: number;
  semanticBacklog: number;
  publicationFreshnessLagMs: number;
};

function roundMetric(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Number(value.toFixed(2));
}

function percentile(values: number[], percentileRank: number) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil((percentileRank / 100) * sorted.length) - 1);
  return roundMetric(sorted[Math.min(index, sorted.length - 1)] ?? 0);
}

function percentileSummary(values: number[]) {
  if (values.length === 0) {
    return { p50: 0, p95: 0, max: 0 };
  }
  return {
    p50: percentile(values, 50),
    p95: percentile(values, 95),
    max: roundMetric(Math.max(...values)),
  };
}

function publicationFreshnessSummary(values: number[]) {
  if (values.length === 0) {
    return { p95: 0, max: 0 };
  }
  return {
    p95: percentile(values, 95),
    max: roundMetric(Math.max(...values)),
  };
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }
  return roundMetric(values.reduce((sum, value) => sum + value, 0) / values.length);
}

async function readScaleTelemetry(env: ApiEnv) {
  const activeTopics = await allRows<{ id: string }>(
    env.DB,
    `SELECT id FROM topics WHERE status = 'started' ORDER BY updated_at DESC`,
  );

  const telemetryByTopic = await Promise.all(
    activeTopics.map(async ({ id }) => {
      try {
        const namespaceId = env.TOPIC_STATE_DO.idFromName(id);
        const stub = env.TOPIC_STATE_DO.get(namespaceId);
        const response = await stub.fetch("https://topic-state.internal/telemetry");
        if (!response.ok) {
          return null;
        }
        return await response.json() as TopicStateTelemetrySnapshot;
      } catch {
        return null;
      }
    }),
  );

  const telemetry = telemetryByTopic.filter((value): value is TopicStateTelemetrySnapshot => Boolean(value));
  const acceptLatencySamples = telemetry.flatMap((entry) => entry.acceptLatencyMsSamples);
  const recomputeDurationSamples = telemetry.flatMap((entry) => entry.recomputeDurationMsSamples);
  const snapshotDurationSamples = telemetry.flatMap((entry) => entry.snapshotDurationMsSamples);
  const drainThroughputSamples = telemetry.flatMap((entry) => entry.drainThroughputSamples);
  const publicationFreshnessSamples = telemetry.map((entry) => entry.publicationFreshnessLagMs);

  return {
    acceptLatencyMs: percentileSummary(acceptLatencySamples),
    pendingContributionBacklog: telemetry.reduce((sum, entry) => sum + entry.pendingContributionBacklog, 0),
    pendingVoteBacklog: telemetry.reduce((sum, entry) => sum + entry.pendingVoteBacklog, 0),
    pendingAuxBacklog: telemetry.reduce((sum, entry) => sum + entry.pendingAuxBacklog, 0),
    drainThroughput: {
      contributionsPerFlush: average(drainThroughputSamples.map((entry) => entry.contributionsPerFlush)),
      votesPerFlush: average(drainThroughputSamples.map((entry) => entry.votesPerFlush)),
      auxRowsPerFlush: average(drainThroughputSamples.map((entry) => entry.auxRowsPerFlush)),
    },
    recomputeDurationMs: percentileSummary(recomputeDurationSamples),
    semanticBacklog: telemetry.reduce((sum, entry) => sum + entry.semanticBacklog, 0),
    snapshotDurationMs: percentileSummary(snapshotDurationSamples),
    publicationFreshnessLagMs: publicationFreshnessSummary(publicationFreshnessSamples),
  };
}

function apiErrorResponse(error: unknown): Response | null {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    "code" in error &&
    "message" in error
  ) {
    return Response.json(
      {
        error: String(error.code),
        code: String(error.code),
        message: String(error.message),
        details: "details" in error ? error.details : undefined,
      },
      { status: Number(error.status) },
    );
  }
  return null;
}

async function withAdminReadAccess(c: { env: ApiEnv; req: { raw: Request } }, action: () => Promise<Response>) {
  try {
    const { agent } = await authenticateRequest(c.env, c.req.raw);
    assertAdminAgent(c.env, agent);
    return await action();
  } catch (error) {
    const response = apiErrorResponse(error);
    if (response) {
      return response;
    }
    throw error;
  }
}

function parseAdminListQuery(request: Request) {
  const url = new URL(request.url);
  const result = AdminListQuerySchema.safeParse({
    page: url.searchParams.get("page") ?? undefined,
    pageSize: url.searchParams.get("pageSize") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    archived: url.searchParams.get("archived") ?? undefined,
  });
  if (!result.success) {
    throw new ApiError(400, "invalid_request", "Query parameters failed validation.", result.error.flatten());
  }
  return result.data;
}

function parseAdminAuditLogQuery(request: Request) {
  const url = new URL(request.url);
  const result = AdminAuditLogQuerySchema.safeParse({
    actor: url.searchParams.get("actor") ?? undefined,
    targetType: url.searchParams.get("target_type") ?? undefined,
    targetId: url.searchParams.get("target_id") ?? undefined,
    action: url.searchParams.get("action") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
    pageSize: url.searchParams.get("page_size") ?? undefined,
  });
  if (!result.success) {
    throw new ApiError(400, "invalid_request", "Query parameters failed validation.", result.error.flatten());
  }
  return result.data;
}

function parseAdminDashboardMetricsQuery(request: Request) {
  const url = new URL(request.url);
  const result = AdminDashboardMetricsQuerySchema.safeParse({
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });
  if (!result.success) {
    throw new ApiError(400, "invalid_request", "Query parameters failed validation.", result.error.flatten());
  }
  return result.data;
}

function parseAdminRestrictionsQuery(request: Request) {
  const url = new URL(request.url);
  const result = AdminRestrictionsQuerySchema.safeParse({
    scopeType: url.searchParams.get("scope_type") ?? undefined,
    scopeId: url.searchParams.get("scope_id") ?? undefined,
  });
  if (!result.success) {
    throw new ApiError(400, "invalid_request", "Query parameters failed validation.", result.error.flatten());
  }
  return result.data;
}

function parseTopicCandidateQuery(request: Request) {
  const url = new URL(request.url);
  const result = TopicCandidateQuerySchema.safeParse({
    domainId: url.searchParams.get("domainId") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
  });
  if (!result.success) {
    throw new ApiError(400, "invalid_request", "Query parameters failed validation.", result.error.flatten());
  }
  return result.data;
}

function parseTopicIdeaContextQuery(request: Request) {
  const url = new URL(request.url);
  const result = TopicIdeaContextQuerySchema.safeParse({
    domainId: url.searchParams.get("domainId") ?? undefined,
  });
  if (!result.success) {
    throw new ApiError(400, "invalid_request", "Query parameters failed validation.", result.error.flatten());
  }
  return result.data;
}

async function repairTopicScores(env: ApiEnv, topicId: string) {
  const rows = await allRows<{ id: string }>(
    env.DB,
    `
      SELECT c.id
      FROM contributions c
      INNER JOIN contribution_scores cs ON cs.contribution_id = c.id
      WHERE c.topic_id = ?
      ORDER BY c.created_at ASC
    `,
    topicId,
  );
  for (const row of rows) {
    await recomputeContributionFinalScore(env, row.id);
  }
  return reconcileTopicPresentation(env, topicId);
}

internalRoutes.post("/topics/sweep", async (c) => {
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  assertAdminAgent(c.env, agent);
  const result = await sweepTopicLifecycle(c.env);
  return jsonData(c, result);
});

internalRoutes.post("/topics", async (c) => {
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  assertAdminAgent(c.env, agent);
  const body = parseJsonBody(CreateInternalTopicSchema, await c.req.json());
  return jsonData(c, await createInternalTopic(c.env, agent, body), 201);
});

internalRoutes.get("/cron", async (c) => {
  return withAdminReadAccess(c, async () => jsonData(c, {
    observedAt: new Date().toISOString(),
    heartbeats: await readCronHeartbeatStatuses(c.env),
    recentLifecycleMutations: await listRecentLifecycleMutations(c.env),
  }));
});

internalRoutes.post("/topic-candidates", async (c) => {
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  assertAdminAgent(c.env, agent);
  const body = parseJsonBody(BatchUpsertTopicCandidatesSchema, await c.req.json());
  return jsonData(c, await batchUpsertTopicCandidates(c.env, body.items));
});

internalRoutes.get("/topic-candidates", async (c) => {
  return withAdminReadAccess(c, async () => jsonData(c, await listTopicCandidates(c.env, parseTopicCandidateQuery(c.req.raw))));
});

internalRoutes.get("/topic-candidates/inventory", async (c) => {
  return withAdminReadAccess(c, async () => jsonData(c, { items: await getTopicCandidateInventory(c.env) }));
});

internalRoutes.get("/topic-candidates/idea-context", async (c) => {
  return withAdminReadAccess(c, async () => {
    const query = parseTopicIdeaContextQuery(c.req.raw);
    return jsonData(c, { items: await getTopicIdeaContext(c.env, query.domainId) });
  });
});

internalRoutes.get("/topic-candidates/:candidateId", async (c) => {
  return withAdminReadAccess(c, async () => jsonData(c, await getTopicCandidate(c.env, c.req.param("candidateId"))));
});

internalRoutes.post("/topic-candidates/cleanup", async (c) => {
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  assertAdminAgent(c.env, agent);
  const body = parseJsonBody(TopicCandidateCleanupRequestSchema, await c.req.json());
  return jsonData(c, await cleanupExpiredCandidates(c.env, body.maxAgeDays));
});

internalRoutes.post("/analytics/platform-rollups/backfill", async (c) => {
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  assertAdminAgent(c.env, agent);
  const body = parseJsonBody(AnalyticsBackfillRequestSchema, await c.req.json());
  const result = AnalyticsBackfillResponseSchema.parse(
    await backfillPlatformDailyRollupsService(c.env, body),
  );
  return jsonData(c, result);
});

internalRoutes.post("/topics/:topicId/reconcile-presentation", async (c) => {
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  assertAdminAgent(c.env, agent);
  const body = parseJsonBody(ReconcilePresentationRequestSchema, await c.req.json());
  const result = await reconcileTopicPresentation(c.env, c.req.param("topicId"), body.reason);
  return jsonData(c, result);
});

internalRoutes.post("/topics/:topicId/dossier/assemble", async (c) => {
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  assertAdminAgent(c.env, agent);
  const topicId = c.req.param("topicId");
  const dossier = await assembleDossier(c.env, topicId);
  return jsonData(c, {
    topicId,
    assembled: dossier !== null,
    revision: dossier?.revision ?? null,
    assemblyMethod: dossier?.assemblyMethod ?? null,
  });
});

internalRoutes.post("/topics/:topicId/dossier/rebuild", async (c) => {
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  assertAdminAgent(c.env, agent);
  const topicId = c.req.param("topicId");
  const steps: Record<string, { success: boolean; error?: string }> = {};

  try {
    await backfillTopicClaims(c.env, topicId);
    steps.backfillClaims = { success: true };
  } catch (error) {
    steps.backfillClaims = { success: false, error: error instanceof Error ? error.message : String(error) };
  }

  try {
    await assembleDossier(c.env, topicId);
    steps.assembleDossier = { success: true };
  } catch (error) {
    steps.assembleDossier = { success: false, error: error instanceof Error ? error.message : String(error) };
  }

  try {
    await reconcileTopicPresentation(c.env, topicId);
    steps.reconcilePresentation = { success: true };
  } catch (error) {
    steps.reconcilePresentation = { success: false, error: error instanceof Error ? error.message : String(error) };
  }

  return jsonData(c, { topicId, steps });
});

internalRoutes.post("/topics/:topicId/open", async (c) => {
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  assertAdminAgent(c.env, agent);
  const body = parseJsonBody(TopicAdminReasonSchema, await c.req.json());
  const topicId = c.req.param("topicId");
  const topic = await firstRow<{ id: string; status: string }>(
    c.env.DB,
    `SELECT id, status FROM topics WHERE id = ?`,
    topicId,
  );
  if (!topic) {
    notFound("The requested topic was not found.");
  }
  if (topic.status !== "closed" && topic.status !== "stalled") {
    badRequest("invalid_topic_status", "Only closed or stalled topics can be reopened.");
  }

  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE topics SET status = 'open', closed_at = NULL, stalled_at = NULL WHERE id = ?`,
    ).bind(topicId),
    c.env.DB.prepare(
      `UPDATE topic_artifacts SET artifact_status = 'suppressed' WHERE topic_id = ?`,
    ).bind(topicId),
  ]);
  const result = await reconcileTopicPresentation(c.env, topicId, "cache_invalidation");
  return jsonData(c, { ...result, reason: body.reason, reopened: true });
});

internalRoutes.post("/topics/:topicId/close", async (c) => {
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  assertAdminAgent(c.env, agent);
  const body = parseJsonBody(TopicAdminReasonSchema, await c.req.json());
  const topicId = c.req.param("topicId");
  const topic = await firstRow<{ id: string; status: string }>(
    c.env.DB,
    `SELECT id, status FROM topics WHERE id = ?`,
    topicId,
  );
  if (!topic) {
    notFound("The requested topic was not found.");
  }
  if (topic.status === "closed") {
    const result = await reconcileTopicPresentation(c.env, topicId);
    return jsonData(c, { ...result, reason: body.reason, closed: true, noop: true });
  }

  await forceFlushTopicState(c.env, topicId);
  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE rounds SET status = 'completed', ends_at = COALESCE(ends_at, CURRENT_TIMESTAMP), reveal_at = COALESCE(reveal_at, CURRENT_TIMESTAMP)
       WHERE topic_id = ? AND status IN ('pending', 'active')`,
    ).bind(topicId),
    c.env.DB.prepare(
      `UPDATE topics SET status = 'closed', closed_at = CURRENT_TIMESTAMP WHERE id = ?`,
    ).bind(topicId),
  ]);
  await runTerminalizationSequence(c.env, topicId, { reterminalize: true });
  const result = await reconcileTopicPresentation(c.env, topicId);
  return jsonData(c, { ...result, reason: body.reason, closed: true, noop: false });
});

internalRoutes.post("/topics/:topicId/repair-scores", async (c) => {
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  assertAdminAgent(c.env, agent);
  const body = parseJsonBody(TopicAdminReasonSchema, await c.req.json());
  const topicId = c.req.param("topicId");
  const result = await repairTopicScores(c.env, topicId);
  return jsonData(c, { ...result, reason: body.reason, repaired: true });
});

internalRoutes.post("/topics/:topicId/reterminalize", async (c) => {
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  assertAdminAgent(c.env, agent);
  parseJsonBody(ReterminalizeTopicRequestSchema, await c.req.json());
  const topicId = c.req.param("topicId");
  await runTerminalizationSequence(c.env, topicId, { reterminalize: true });
  const result = await reconcileTopicPresentation(c.env, topicId);
  return jsonData(c, result);
});

internalRoutes.post("/topics/:topicId/backfill-claims", async (c) => {
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  assertAdminAgent(c.env, agent);
  const topicId = c.req.param("topicId");
  const topic = await firstRow<{ id: string }>(
    c.env.DB,
    `SELECT id FROM topics WHERE id = ?`,
    topicId,
  );
  if (!topic) {
    notFound("The requested topic was not found.");
  }
  const result = await backfillTopicClaims(c.env, topicId);
  return jsonData(c, result);
});

internalRoutes.post("/contributions/:contributionId/quarantine", async (c) => {
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  assertAdminAgent(c.env, agent);
  const body = parseJsonBody(QuarantineContributionRequestSchema, await c.req.json());
  const contributionId = c.req.param("contributionId");
  const contribution = await firstRow<{ id: string; topic_id: string; visibility: string; guardrail_decision: string }>(
    c.env.DB,
    `SELECT id, topic_id, visibility, guardrail_decision FROM contributions WHERE id = ?`,
    contributionId,
  );
  if (!contribution) {
    notFound("The requested contribution was not found.");
  }

  const alreadyInTargetState =
    (body.action === "release" && contribution.visibility === "normal" && contribution.guardrail_decision === "allow") ||
    (body.action === "quarantine" && contribution.visibility === "quarantined" && contribution.guardrail_decision === "quarantine") ||
    (body.action === "block" && contribution.visibility === "quarantined" && contribution.guardrail_decision === "block");
  if (alreadyInTargetState) {
    badRequest("invalid_transition", "The contribution is already in that moderation state.");
  }

  // A blocked contribution remains hidden from public transcript surfaces using the
  // existing quarantined visibility bucket; the harder moderation state is tracked
  // separately in guardrail_decision.
  const nextVisibility = body.action === "release" ? "normal" : "quarantined";
  const nextGuardrailDecision =
    body.action === "release" ? "allow" : body.action === "block" ? "block" : "quarantine";

  await runStatement(
    c.env.DB.prepare(
      `
        UPDATE contributions
        SET visibility = ?, guardrail_decision = ?
        WHERE id = ?
      `,
    ).bind(nextVisibility, nextGuardrailDecision, contributionId),
  );

  const result = await reconcileTopicPresentation(c.env, contribution.topic_id);
  return jsonData(c, { ...result, contributionId, action: body.action, reason: body.reason });
});

internalRoutes.get("/admin/agents", async (c) => {
  return withAdminReadAccess(c, async () => jsonData(c, await listAdminAgents(c.env, parseAdminListQuery(c.req.raw))));
});

internalRoutes.get("/admin/agents/:agentId", async (c) => {
  return withAdminReadAccess(c, async () => jsonData(c, await getAdminAgentDetail(c.env, c.req.param("agentId"))));
});

internalRoutes.get("/admin/beings", async (c) => {
  return withAdminReadAccess(c, async () => jsonData(c, await listAdminBeings(c.env, parseAdminListQuery(c.req.raw))));
});

internalRoutes.get("/admin/beings/:beingId", async (c) => {
  return withAdminReadAccess(c, async () => jsonData(c, await getAdminBeingDetail(c.env, c.req.param("beingId"))));
});

internalRoutes.get("/admin/domains", async (c) => {
  return withAdminReadAccess(c, async () => jsonData(c, await listAdminDomains(c.env, parseAdminListQuery(c.req.raw))));
});

internalRoutes.get("/admin/domains/:domainId", async (c) => {
  return withAdminReadAccess(c, async () => jsonData(c, await getAdminDomainDetail(c.env, c.req.param("domainId"))));
});

internalRoutes.get("/admin/topics", async (c) => {
  return withAdminReadAccess(c, async () => jsonData(c, await listAdminTopics(c.env, parseAdminListQuery(c.req.raw))));
});

internalRoutes.get("/admin/topics/:topicId", async (c) => {
  return withAdminReadAccess(c, async () => jsonData(c, await getAdminTopicDetail(c.env, c.req.param("topicId"))));
});

internalRoutes.get("/admin/topics/:topicId/report", async (c) => {
  return withAdminReadAccess(c, async () => {
    const topicId = c.req.param("topicId");
    const topic = await firstRow<{
      id: string;
      domain_id: string;
      title: string;
      prompt: string;
      template_id: string;
      status: string;
      closed_at: string | null;
    }>(c.env.DB, `SELECT id, domain_id, title, prompt, template_id, status, closed_at FROM topics WHERE id = ?`, topicId);
    if (!topic) {
      notFound("The requested topic was not found.");
    }
    if (topic.status !== "closed") {
      badRequest("topic_not_closed", "Report is only available for closed topics.");
    }

    const rounds = await allRows<{
      id: string;
      sequence_index: number;
      round_kind: string;
      status: string;
      starts_at: string | null;
      ends_at: string | null;
    }>(c.env.DB, `SELECT id, sequence_index, round_kind, status, starts_at, ends_at FROM rounds WHERE topic_id = ? ORDER BY sequence_index ASC`, topicId);

    const transcript = await allRows<{
      id: string;
      round_id: string;
      round_kind: string;
      sequence_index: number;
      being_id: string;
      being_handle: string;
      body_clean: string | null;
      visibility: string;
      submitted_at: string;
      heuristic_score: number | null;
      semantic_score: number | null;
      live_score: number | null;
      final_score: number | null;
    }>(
      c.env.DB,
      `
        SELECT
          c.id, c.round_id, r.round_kind, r.sequence_index,
          c.being_id, b.handle AS being_handle,
          c.body_clean, c.visibility, c.submitted_at,
          cs.heuristic_score, cs.semantic_score, cs.live_score, cs.final_score
        FROM contributions c
        INNER JOIN rounds r ON r.id = c.round_id
        INNER JOIN beings b ON b.id = c.being_id
        LEFT JOIN contribution_scores cs ON cs.contribution_id = c.id
        WHERE c.topic_id = ?
        ORDER BY r.sequence_index ASC, c.submitted_at ASC
      `,
      topicId,
    );

    const verdict = await firstRow<{
      confidence: string;
      terminalization_mode: string;
      summary: string;
      reasoning_json: string | null;
      verdict_outcome: string | null;
      positions_json: string | null;
    }>(c.env.DB, `SELECT confidence, terminalization_mode, summary, reasoning_json, verdict_outcome, positions_json FROM verdicts WHERE topic_id = ?`, topicId);

    const artifact = await firstRow<{
      transcript_snapshot_key: string | null;
      state_snapshot_key: string | null;
      verdict_html_key: string | null;
      og_image_key: string | null;
      artifact_status: string;
    }>(c.env.DB, `SELECT transcript_snapshot_key, state_snapshot_key, verdict_html_key, og_image_key, artifact_status FROM topic_artifacts WHERE topic_id = ?`, topicId);

    return jsonData(c, {
      topic: {
        id: topic.id,
        domainId: topic.domain_id,
        title: topic.title,
        prompt: topic.prompt,
        templateId: topic.template_id,
        status: topic.status,
        closedAt: topic.closed_at,
      },
      rounds: rounds.map((r) => ({
        id: r.id,
        sequenceIndex: r.sequence_index,
        roundKind: r.round_kind,
        status: r.status,
        startsAt: r.starts_at,
        endsAt: r.ends_at,
      })),
      transcript: transcript.map((row) => {
        const isPending = row.final_score === null && row.round_kind !== "vote";
        return {
          contributionId: row.id,
          roundId: row.round_id,
          roundKind: row.round_kind,
          sequenceIndex: row.sequence_index,
          beingId: row.being_id,
          beingHandle: row.being_handle,
          bodyClean: row.body_clean,
          visibility: row.visibility,
          submittedAt: row.submitted_at,
          scores: isPending
            ? { heuristic: null, semantic: null, live: null, final: null }
            : { heuristic: row.heuristic_score, semantic: row.semantic_score, live: row.live_score, final: row.final_score },
        };
      }),
      verdict: verdict
        ? {
            confidence: verdict.confidence,
            terminalizationMode: verdict.terminalization_mode,
            summary: verdict.summary,
            reasoning: verdict.reasoning_json ? JSON.parse(verdict.reasoning_json) : null,
            verdictOutcome: verdict.verdict_outcome ?? null,
            positions: verdict.positions_json ? JSON.parse(verdict.positions_json) : null,
          }
        : null,
      artifact: artifact
        ? {
            transcriptSnapshotKey: artifact.transcript_snapshot_key,
            stateSnapshotKey: artifact.state_snapshot_key,
            verdictHtmlKey: artifact.verdict_html_key,
            ogImageKey: artifact.og_image_key,
            artifactStatus: artifact.artifact_status,
          }
        : null,
    });
  });
});

internalRoutes.get("/admin/audit-log", async (c) => {
  return withAdminReadAccess(c, async () => jsonData(c, await listAdminAuditLog(c.env, parseAdminAuditLogQuery(c.req.raw))));
});

internalRoutes.get("/admin/audit-log/:auditLogId", async (c) => {
  return withAdminReadAccess(c, async () => jsonData(c, await getAdminAuditLogEntry(c.env, c.req.param("auditLogId"))));
});

internalRoutes.get("/admin/dashboard/metrics", async (c) => {
  return withAdminReadAccess(c, async () => jsonData(c, await getAdminDashboardMetrics(c.env, parseAdminDashboardMetricsQuery(c.req.raw))));
});

internalRoutes.get("/admin/dashboard/overview", async (c) => {
  return withAdminReadAccess(c, async () => jsonData(c, await getAdminDashboardOverview(c.env)));
});

internalRoutes.get("/admin/restrictions", async (c) => {
  return withAdminReadAccess(c, async () => jsonData(c, await listActiveAdminRestrictions(c.env, parseAdminRestrictionsQuery(c.req.raw))));
});

internalRoutes.post("/admin/beings/:beingId/capabilities", async (c) => {
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  assertAdminAgent(c.env, agent);
  const body = parseJsonBody(UpdateAdminBeingCapabilitySchema, await c.req.json());
  return jsonData(c, await updateAdminBeingCapability(c.env, agent.id, c.req.param("beingId"), body));
});

internalRoutes.post("/admin/beings/:beingId/status", async (c) => {
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  assertAdminAgent(c.env, agent);
  const body = parseJsonBody(UpdateAdminBeingStatusSchema, await c.req.json());
  return jsonData(c, await updateAdminBeingStatus(c.env, agent.id, c.req.param("beingId"), body));
});

internalRoutes.post("/admin/beings/:beingId/sessions/revoke", async (c) => {
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  assertAdminAgent(c.env, agent);
  const body = parseJsonBody(RevokeAdminBeingSessionsSchema, await c.req.json());
  return jsonData(c, await revokeAdminBeingSessions(c.env, agent.id, c.req.param("beingId"), body.reason));
});

internalRoutes.post("/admin/restrictions", async (c) => {
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  assertAdminAgent(c.env, agent);
  const body = parseJsonBody(CreateAdminRestrictionSchema, await c.req.json());
  return jsonData(c, await createAdminRestrictionRecord(c.env, agent.id, body), 201);
});

internalRoutes.post("/admin/restrictions/:restrictionId/clear", async (c) => {
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  assertAdminAgent(c.env, agent);
  const body = parseJsonBody(ClearAdminRestrictionSchema, await c.req.json());
  return jsonData(c, await clearAdminRestrictionRecord(c.env, agent.id, c.req.param("restrictionId"), body.reason));
});

internalRoutes.post("/admin/topics/:topicId/archive", async (c) => {
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  assertAdminAgent(c.env, agent);
  const body = parseJsonBody(AdminReasonSchema, await c.req.json());
  return jsonData(c, await archiveAdminTopic(c.env, agent.id, c.req.param("topicId"), body.reason));
});

internalRoutes.post("/admin/topics/:topicId/unarchive", async (c) => {
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  assertAdminAgent(c.env, agent);
  const body = parseJsonBody(AdminReasonSchema, await c.req.json());
  return jsonData(c, await unarchiveAdminTopic(c.env, agent.id, c.req.param("topicId"), body.reason));
});

internalRoutes.post("/admin/topics/:topicId/title", async (c) => {
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  assertAdminAgent(c.env, agent);
  const body = parseJsonBody(SetAdminTopicTitleSchema, await c.req.json());
  return jsonData(c, await setAdminTopicTitle(c.env, agent.id, c.req.param("topicId"), body));
});

internalRoutes.post("/admin/topics/:topicId/visibility", async (c) => {
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  assertAdminAgent(c.env, agent);
  const body = parseJsonBody(SetAdminTopicVisibilitySchema, await c.req.json());
  return jsonData(c, await setAdminTopicVisibility(c.env, agent.id, c.req.param("topicId"), body));
});

internalRoutes.post("/admin/topics/:topicId/prompt", async (c) => {
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  assertAdminAgent(c.env, agent);
  const body = parseJsonBody(SetAdminTopicPromptSchema, await c.req.json());
  return jsonData(c, await setAdminTopicPrompt(c.env, agent.id, c.req.param("topicId"), body));
});

internalRoutes.post("/admin/topics/:topicId/domain", async (c) => {
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  assertAdminAgent(c.env, agent);
  const body = parseJsonBody(SetAdminTopicDomainSchema, await c.req.json());
  return jsonData(c, await setAdminTopicDomain(c.env, agent.id, c.req.param("topicId"), body));
});

internalRoutes.post("/admin/topics/:topicId/trust-threshold", async (c) => {
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  assertAdminAgent(c.env, agent);
  const body = parseJsonBody(SetAdminTopicTrustThresholdSchema, await c.req.json());
  return jsonData(c, await setAdminTopicTrustThreshold(c.env, agent.id, c.req.param("topicId"), body));
});

internalRoutes.post("/admin/topics/:topicId/cadence", async (c) => {
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  assertAdminAgent(c.env, agent);
  const body = parseJsonBody(SetAdminTopicCadenceSchema, await c.req.json());
  return jsonData(c, await setAdminTopicCadence(c.env, agent.id, c.req.param("topicId"), body));
});

// ---------------------------------------------------------------------------
// Round instruction overrides
// ---------------------------------------------------------------------------

internalRoutes.put("/round-instructions/:templateId/:sequenceIndex", async (c) => {
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  assertAdminAgent(c.env, agent);

  const templateId = c.req.param("templateId");
  const sequenceIndexRaw = c.req.param("sequenceIndex");
  const sequenceIndex = Number(sequenceIndexRaw);

  const templateParse = TopicTemplateIdSchema.safeParse(templateId);
  if (!templateParse.success) {
    throw badRequest("invalid_template_id", `Unknown template: ${templateId}`);
  }

  if (!Number.isInteger(sequenceIndex) || sequenceIndex < 0) {
    throw badRequest("invalid_sequence_index", "sequenceIndex must be a non-negative integer.");
  }

  const template = TOPIC_TEMPLATES[templateParse.data];
  if (sequenceIndex >= template.rounds.length) {
    throw badRequest(
      "sequence_index_out_of_range",
      `sequenceIndex ${sequenceIndex} exceeds template round count (${template.rounds.length}).`,
    );
  }

  const body = parseJsonBody(RoundInstructionOverrideRequestSchema, await c.req.json());

  const expectedRoundKind = template.rounds[sequenceIndex]!.roundKind;
  if (body.roundKind !== expectedRoundKind) {
    throw badRequest(
      "round_kind_mismatch",
      `Template ${templateId} at sequenceIndex ${sequenceIndex} expects roundKind "${expectedRoundKind}", got "${body.roundKind}".`,
    );
  }

  await runStatement(
    c.env.DB.prepare(
      `INSERT INTO round_instruction_overrides (template_id, sequence_index, round_kind, goal, guidance, prior_round_context, quality_criteria_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (template_id, sequence_index) DO UPDATE SET
         round_kind = excluded.round_kind,
         goal = excluded.goal,
         guidance = excluded.guidance,
         prior_round_context = excluded.prior_round_context,
         quality_criteria_json = excluded.quality_criteria_json,
         updated_at = datetime('now')`,
    ).bind(
      templateId,
      sequenceIndex,
      body.roundKind,
      body.goal,
      body.guidance,
      body.priorRoundContext,
      JSON.stringify(body.qualityCriteria),
    ),
  );

  return jsonData(c, {
    templateId,
    sequenceIndex,
    roundKind: body.roundKind,
    goal: body.goal,
    guidance: body.guidance,
    priorRoundContext: body.priorRoundContext,
    qualityCriteria: body.qualityCriteria,
  });
});

internalRoutes.delete("/round-instructions/:templateId/:sequenceIndex", async (c) => {
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  assertAdminAgent(c.env, agent);

  const templateId = c.req.param("templateId");
  const sequenceIndexRaw = c.req.param("sequenceIndex");
  const sequenceIndex = Number(sequenceIndexRaw);

  const templateParse = TopicTemplateIdSchema.safeParse(templateId);
  if (!templateParse.success) {
    throw badRequest("invalid_template_id", `Unknown template: ${templateId}`);
  }

  if (!Number.isInteger(sequenceIndex) || sequenceIndex < 0) {
    throw badRequest("invalid_sequence_index", "sequenceIndex must be a non-negative integer.");
  }

  const template = TOPIC_TEMPLATES[templateParse.data];
  if (sequenceIndex >= template.rounds.length) {
    throw badRequest(
      "sequence_index_out_of_range",
      `sequenceIndex ${sequenceIndex} exceeds template round count (${template.rounds.length}).`,
    );
  }

  const result = await runStatement(
    c.env.DB.prepare(
      `DELETE FROM round_instruction_overrides WHERE template_id = ? AND sequence_index = ?`,
    ).bind(templateId, sequenceIndex),
  );

  return jsonData(c, { deleted: (result.meta?.changes ?? 0) > 0 });
});

internalRoutes.get("/health", async (c) => {
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  assertAdminAgent(c.env, agent);
  const [snapshotPending, presentationPending, topicStatusDistribution, scaleTelemetry, cronHeartbeats, recentLifecycleMutations] = await Promise.all([
    listPendingSnapshotRetries(c.env),
    c.env.PUBLIC_CACHE.list({ prefix: "presentation-pending:" }),
    allRows<{ status: string; count: number }>(
      c.env.DB,
      `SELECT status, COUNT(*) AS count FROM topics GROUP BY status ORDER BY status ASC`,
    ),
    readScaleTelemetry(c.env),
    readCronHeartbeatStatuses(c.env),
    listRecentLifecycleMutations(c.env),
  ]);
  return jsonData(c, {
    snapshotPendingTopics: snapshotPending,
    snapshotPendingCount: snapshotPending.length,
    presentationPendingTopics: presentationPending.keys.map((entry) => entry.name.replace(/^presentation-pending:/, "")),
    presentationPendingCount: presentationPending.keys.length,
    cronHeartbeats,
    recentLifecycleMutations,
    topicStatusDistribution: topicStatusDistribution.map((row) => ({
      status: row.status,
      count: Number(row.count ?? 0),
    })),
    scaleTelemetry,
  });
});

// === Autonomous Rolling Topic Routes ===

// POST /slots/:slotId/unalias — Remove alias from a canonical slot (future revisions only)
internalRoutes.post("/slots/:slotId/unalias", async (c) => {
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  assertAdminAgent(c.env, agent);
  const slotId = c.req.param("slotId");
  const result = await unaliasSlot(c.env, slotId);
  if (!result) {
    return c.json({ error: "not_found_or_not_aliased", code: "not_found", message: "Slot not found or not aliased." }, 404);
  }
  return c.json({ ok: true, slotId, message: "Alias removed. Future revisions will treat this slot as independent." });
});

// GET /topics/:topicId/instances — List all instances for an autonomous topic
internalRoutes.get("/topics/:topicId/instances", async (c) => {
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  assertAdminAgent(c.env, agent);
  const topicId = c.req.param("topicId");
  const instances = await allRows(
    c.env.DB,
    `SELECT * FROM topic_instances WHERE topic_id = ? ORDER BY instance_index`,
    topicId,
  );
  return c.json({ topicId, instances });
});

// GET /topics/:topicId/instances/:instanceId/finalization — Get finalization progress
internalRoutes.get("/topics/:topicId/instances/:instanceId/finalization", async (c) => {
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  assertAdminAgent(c.env, agent);
  const instanceId = c.req.param("instanceId");
  const progress = await getFinalizationProgress(c.env, instanceId);
  return c.json({ instanceId, ...progress });
});

// GET /topics/:topicId/merge — Get latest merge revision
internalRoutes.get("/topics/:topicId/merge", async (c) => {
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  assertAdminAgent(c.env, agent);
  const topicId = c.req.param("topicId");
  const revision = await getLatestMergeRevision(c.env, topicId);
  return c.json({ topicId, revision });
});

// POST /topics/:topicId/merge — Force a merge
internalRoutes.post("/topics/:topicId/merge", async (c) => {
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  assertAdminAgent(c.env, agent);
  const topicId = c.req.param("topicId");
  const result = await executeMerge(c.env, topicId);
  if (!result) {
    return c.json({ error: "no_instances", code: "no_instances", message: "No finalized instances ready for merge." }, 400);
  }
  return c.json({ ok: true, ...result });
});

// POST /autonomous/sweep — Manually trigger autonomous lifecycle sweep
internalRoutes.post("/autonomous/sweep", async (c) => {
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  assertAdminAgent(c.env, agent);
  const mutatedTopicIds = await sweepAutonomousTopics(c.env);
  return c.json({ ok: true, mutatedTopicIds });
});
