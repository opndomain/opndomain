import { Hono } from "hono";
import {
  VerdictFetchResponseSchema,
  VerdictPresentationSchema,
  CreateTopicSchema,
  TopicDirectoryQuerySchema,
  TopicMembershipSchema,
  TopicDirectoryListResponseSchema,
  TranscriptQuerySchema,
  UpdateTopicSchema,
  topicVerdictPresentationArtifactKey,
  verdictJsonCacheKey,
  debateFlagKey,
  DEBATE_FLAG_TTL_SECONDS,
  WS_TICKET_SCOPE,
  WS_TICKET_TTL_SECONDS,
} from "@opndomain/shared";
import type { ApiEnv } from "../lib/env.js";
import { ApiError, badRequest, notFound } from "../lib/errors.js";
import { jsonData, jsonList, parseJsonBody } from "../lib/http.js";
import { authenticateRequest } from "../services/auth.js";
import { signJwt, verifyJwt } from "../lib/jwt.js";
import { createId } from "../lib/ids.js";
import {
  getTopicTranscript,
  type TopicListFilters,
  assertTopicOwnershipOrAdmin,
  createTopic,
  getTopic,
  getTopicContext,
  getTopicContextMine,
  getTopicContextShared,
  getTopicVerdictAvailability,
  joinTopic,
  leaveTopic,
  listTopics,
  recordTopicView,
  updateTopic,
} from "../services/topics.js";
import {
  getDebateSessionStatus,
  touchDebateSession,
  setDebateGuidance,
  isActiveTopicMember,
  bootstrapDebateSession,
  assertAgentOwnsBeing,
} from "../services/debate-sessions.js";

export const topicRoutes = new Hono<{ Bindings: ApiEnv }>();

function parseTopicListFilters(c: { req: { query: (name: string) => string | undefined } }): TopicListFilters | Response {
  const result = TopicDirectoryQuerySchema.safeParse({
    status: c.req.query("status"),
    domain: c.req.query("domain"),
    templateId: c.req.query("templateId"),
    q: c.req.query("q"),
  });
  if (!result.success) {
    if (result.error.issues.some((issue) => issue.path[0] === "status")) {
      return Response.json({
        error: "invalid_topic_status",
        code: "invalid_topic_status",
        message: "Query parameter status must be a valid topic status.",
      }, { status: 400 });
    }
    if (result.error.issues.some((issue) => issue.path[0] === "domain")) {
      return Response.json({
        error: "invalid_domain",
        code: "invalid_domain",
        message: "Query parameter domain must be a non-empty domain slug.",
      }, { status: 400 });
    }
    if (result.error.issues.some((issue) => issue.path[0] === "templateId")) {
      return Response.json({
        error: "invalid_template_id",
        code: "invalid_template_id",
        message: "Query parameter templateId must be a valid topic template id.",
      }, { status: 400 });
    }
    throw new ApiError(400, "invalid_request", "Request query failed validation.", result.error.flatten());
  }

  return {
    status: result.data.status,
    domainSlug: result.data.domain,
    templateId: result.data.templateId,
    q: result.data.q,
  };
}

topicRoutes.post("/", async (c) => {
  const body = parseJsonBody(CreateTopicSchema, await c.req.json());
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  return jsonData(c, await createTopic(c.env, agent, body), 201);
});

topicRoutes.get("/", async (c) => {
  const filters = parseTopicListFilters(c);
  if (filters instanceof Response) {
    return filters;
  }
  const data = await listTopics(c.env, filters);
  TopicDirectoryListResponseSchema.parse({ data });
  return jsonList(c, data);
});

topicRoutes.get("/:topicId/transcript", async (c) => {
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  const queryResult = TranscriptQuerySchema.safeParse({
    since: c.req.query("since"),
    roundIndex: c.req.query("roundIndex"),
    limit: c.req.query("limit"),
    cursor: c.req.query("cursor"),
    mode: c.req.query("mode"),
  });
  if (!queryResult.success) {
    throw new ApiError(400, "invalid_request", "Request query failed validation.", queryResult.error.flatten());
  }
  return jsonData(c, await getTopicTranscript(c.env, agent, c.req.param("topicId"), queryResult.data));
});

topicRoutes.get("/:topicId", async (c) => {
  return jsonData(c, await getTopic(c.env, c.req.param("topicId")));
});

topicRoutes.get("/:topicId/verdict", async (c) => {
  const topicId = c.req.param("topicId");
  const cached = await c.env.PUBLIC_CACHE.get(verdictJsonCacheKey(topicId), "json");
  if (cached) {
    const response = VerdictFetchResponseSchema.parse({
      status: "published",
      verdict: VerdictPresentationSchema.parse(cached),
    });
    return jsonData(c, response);
  }

  const availability = await getTopicVerdictAvailability(c.env, topicId);
  if (!availability) {
    notFound();
  }

  if (availability.status !== "closed" || availability.artifact_status !== "published") {
    return jsonData(c, VerdictFetchResponseSchema.parse({
      status: "pending",
      topicStatus: availability.status,
      artifactStatus: availability.artifact_status,
    }));
  }

  const artifact = await c.env.PUBLIC_ARTIFACTS.get(topicVerdictPresentationArtifactKey(topicId));
  if (artifact) {
    const presentation = VerdictPresentationSchema.parse(await artifact.json());
    await c.env.PUBLIC_CACHE.put(verdictJsonCacheKey(topicId), JSON.stringify(presentation));
    return jsonData(c, VerdictFetchResponseSchema.parse({
      status: "published",
      verdict: presentation,
    }));
  }

  return jsonData(c, VerdictFetchResponseSchema.parse({ status: "unavailable" }));
});

topicRoutes.post("/:topicId/views", async (c) => {
  await recordTopicView(c.env, c.req.param("topicId"));
  return new Response(null, { status: 204 });
});

topicRoutes.get("/:topicId/context", async (c) => {
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  const beingId = c.req.query("beingId") ?? undefined;
  return jsonData(c, await getTopicContext(c.env, agent, c.req.param("topicId"), beingId));
});

topicRoutes.get("/:topicId/context/shared", async (c) => {
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  return jsonData(c, await getTopicContextShared(c.env, agent, c.req.param("topicId")));
});

topicRoutes.get("/:topicId/context/mine", async (c) => {
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  const beingId = c.req.query("beingId");
  if (!beingId) {
    badRequest("missing_being_id", "beingId query param required");
  }
  return jsonData(c, await getTopicContextMine(c.env, agent, c.req.param("topicId"), beingId));
});

topicRoutes.patch("/:topicId", async (c) => {
  const body = parseJsonBody(UpdateTopicSchema, await c.req.json());
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  await assertTopicOwnershipOrAdmin(c.env, c.req.param("topicId"), agent, agent.isAdmin);
  return jsonData(c, await updateTopic(c.env, c.req.param("topicId"), body));
});

topicRoutes.post("/:topicId/ws-ticket", async (c) => {
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  const topicId = c.req.param("topicId");
  const body = (await c.req.json()) as { beingId: string };
  const beingId = body.beingId;
  if (!beingId) {
    return c.json({ error: "missing_being_id", message: "beingId is required." }, 400);
  }
  await assertAgentOwnsBeing(c.env, agent, beingId);
  const isMember = await isActiveTopicMember(c.env, topicId, beingId);
  if (!isMember) {
    return c.json({ error: "not_a_member", message: "Being is not an active member of this topic." }, 403);
  }

  const now = Math.floor(Date.now() / 1000);
  const ticket = await signJwt(c.env, {
    iss: c.env.JWT_ISSUER,
    aud: c.env.JWT_AUDIENCE,
    sub: agent.id,
    scope: WS_TICKET_SCOPE,
    exp: now + WS_TICKET_TTL_SECONDS,
    iat: now,
    jti: createId("wst"),
    topic_id: topicId,
    being_id: beingId,
  });

  const wsOrigin = c.env.API_ORIGIN.replace(/^http/, "ws");
  return c.json({
    ticket,
    expiresIn: WS_TICKET_TTL_SECONDS,
    url: `${wsOrigin}/v1/topics/${encodeURIComponent(topicId)}/ws?ticket=${encodeURIComponent(ticket)}`,
  });
});

topicRoutes.get("/:topicId/ws", async (c) => {
  const upgradeHeader = c.req.header("upgrade");
  if (!upgradeHeader || upgradeHeader.toLowerCase() !== "websocket") {
    return c.json({ error: "upgrade_required", message: "WebSocket upgrade required." }, 426);
  }
  const ticket = c.req.query("ticket");
  if (!ticket) {
    return c.json({ error: "missing_ticket", message: "ticket query parameter required." }, 401);
  }

  const payload = await verifyJwt(c.env, ticket);
  if (payload.scope !== WS_TICKET_SCOPE) {
    return c.json({ error: "invalid_ticket", message: "Token is not a valid WebSocket ticket." }, 403);
  }
  const topicId = c.req.param("topicId");
  if (payload.topic_id !== topicId) {
    return c.json({ error: "invalid_ticket", message: "Ticket does not match this topic." }, 403);
  }
  const beingId = String(payload.being_id);

  const doId = c.env.TOPIC_STATE_DO.idFromName(topicId);
  const stub = c.env.TOPIC_STATE_DO.get(doId);
  return stub.fetch(new Request(`https://topic-state.internal/ws?beingId=${encodeURIComponent(beingId)}`, {
    headers: c.req.raw.headers,
  }));
});

topicRoutes.post("/:topicId/join", async (c) => {
  const body = parseJsonBody(TopicMembershipSchema, await c.req.json());
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  return jsonData(c, await joinTopic(c.env, agent, c.req.param("topicId"), body.beingId));
});

topicRoutes.post("/:topicId/leave", async (c) => {
  const body = parseJsonBody(TopicMembershipSchema, await c.req.json());
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  return jsonData(c, await leaveTopic(c.env, agent, c.req.param("topicId"), body.beingId));
});

topicRoutes.get("/:topicId/debate-session", async (c) => {
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  const beingId = c.req.query("beingId");
  if (!beingId) badRequest("missing_being_id", "beingId query param required");
  const topicId = c.req.param("topicId");
  await assertAgentOwnsBeing(c.env, agent, beingId);

  let result = await getDebateSessionStatus(c.env, topicId, beingId);

  // Lazy-create: no session but being is active member → bootstrap synchronously
  if (!result) {
    const isMember = await isActiveTopicMember(c.env, topicId, beingId);
    if (isMember) {
      result = await bootstrapDebateSession(c.env, topicId, beingId);
    } else {
      return jsonData(c, { status: "no_session" });
    }
  }

  // Touch runs async — executionCtx lives on the route handler, not in the service
  c.executionCtx.waitUntil(touchDebateSession(c.env, topicId, beingId));
  return jsonData(c, result);
});

topicRoutes.put("/:topicId/debate-session/guidance", async (c) => {
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  const body = await c.req.json() as { beingId: string; guidance: string | null };
  const topicId = c.req.param("topicId");
  await assertAgentOwnsBeing(c.env, agent, body.beingId);
  await setDebateGuidance(c.env, topicId, body.beingId, body.guidance);

  // Patch KV so next status read returns updated guidance immediately
  const existingFlag = await c.env.PUBLIC_CACHE.get(debateFlagKey(body.beingId, topicId), "json") as Record<string, unknown> | null;
  if (existingFlag) {
    await c.env.PUBLIC_CACHE.put(
      debateFlagKey(body.beingId, topicId),
      JSON.stringify({ ...existingFlag, stickyGuidance: body.guidance }),
      { expirationTtl: DEBATE_FLAG_TTL_SECONDS },
    );
  }

  return jsonData(c, { ok: true });
});
