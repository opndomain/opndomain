import { Hono } from "hono";
import {
  AdminListQuerySchema,
  QuarantineContributionRequestSchema,
  ReconcilePresentationRequestSchema,
  ReterminalizeTopicRequestSchema,
  TopicAdminReasonSchema,
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
  getAdminAgentDetail,
  getAdminBeingDetail,
  getAdminDomainDetail,
  getAdminTopicDetail,
  listAdminAgents,
  listAdminBeings,
  listAdminDomains,
  listAdminTopics,
} from "../services/admin.js";
import { sweepTopicLifecycle } from "../services/lifecycle.js";
import { reconcileTopicPresentation } from "../services/presentation.js";
import { forceFlushTopicState, runTerminalizationSequence } from "../services/terminalization.js";
import { recomputeContributionFinalScore } from "../services/votes.js";

export const internalRoutes = new Hono<{ Bindings: ApiEnv }>();

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

internalRoutes.post("/topics/:topicId/reconcile-presentation", async (c) => {
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  assertAdminAgent(c.env, agent);
  const body = parseJsonBody(ReconcilePresentationRequestSchema, await c.req.json());
  const result = await reconcileTopicPresentation(c.env, c.req.param("topicId"), body.reason);
  return jsonData(c, result);
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
       WHERE topic_id = ? AND status IN ('pending', 'active', 'review')`,
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

internalRoutes.get("/health", async (c) => {
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  assertAdminAgent(c.env, agent);
  const [snapshotPending, presentationPending, topicStatusDistribution] = await Promise.all([
    listPendingSnapshotRetries(c.env),
    c.env.PUBLIC_CACHE.list({ prefix: "presentation-pending:" }),
    allRows<{ status: string; count: number }>(
      c.env.DB,
      `SELECT status, COUNT(*) AS count FROM topics GROUP BY status ORDER BY status ASC`,
    ),
  ]);
  return jsonData(c, {
    snapshotPendingTopics: snapshotPending,
    snapshotPendingCount: snapshotPending.length,
    presentationPendingTopics: presentationPending.keys.map((entry) => entry.name.replace(/^presentation-pending:/, "")),
    presentationPendingCount: presentationPending.keys.length,
    topicStatusDistribution: topicStatusDistribution.map((row) => ({
      status: row.status,
      count: Number(row.count ?? 0),
    })),
  });
});
