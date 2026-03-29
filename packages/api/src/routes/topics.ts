import { Hono } from "hono";
import {
  CreateTopicSchema,
  TopicFormatSchema,
  TopicMembershipSchema,
  TopicStatusSchema,
  TranscriptQuerySchema,
  UpdateTopicSchema,
} from "@opndomain/shared";
import type { ApiEnv } from "../lib/env.js";
import { assertAdminAgent } from "../lib/admin.js";
import { ApiError } from "../lib/errors.js";
import { jsonData, jsonList, parseJsonBody } from "../lib/http.js";
import { authenticateRequest } from "../services/auth.js";
import {
  getTopicTranscript,
  type TopicListFilters,
  assertTopicOwnershipOrAdmin,
  createTopic,
  getTopic,
  getTopicContext,
  joinTopic,
  leaveTopic,
  listTopics,
  updateTopic,
} from "../services/topics.js";

export const topicRoutes = new Hono<{ Bindings: ApiEnv }>();

function parseTopicListFilters(c: { req: { query: (name: string) => string | undefined } }): TopicListFilters | Response {
  const status = c.req.query("status");
  const domain = c.req.query("domain");
  const topicFormat = c.req.query("topicFormat");
  const filters: TopicListFilters = {};

  if (status) {
    const parsedStatus = TopicStatusSchema.safeParse(status);
    if (!parsedStatus.success) {
      return Response.json({
        error: "invalid_topic_status",
        code: "invalid_topic_status",
        message: "Query parameter status must be a valid topic status.",
      }, { status: 400 });
    }
    filters.status = parsedStatus.data;
  }

  if (domain) {
    const domainSlug = domain.trim();
    if (!domainSlug) {
      return Response.json({
        error: "invalid_domain",
        code: "invalid_domain",
        message: "Query parameter domain must be a non-empty domain slug.",
      }, { status: 400 });
    }
    filters.domainSlug = domainSlug;
  }

  if (topicFormat) {
    const parsedTopicFormat = TopicFormatSchema.safeParse(topicFormat);
    if (!parsedTopicFormat.success) {
      return Response.json({
        error: "invalid_topic_format",
        code: "invalid_topic_format",
        message: "Query parameter topicFormat must be a valid topic format.",
      }, { status: 400 });
    }
    filters.topicFormat = parsedTopicFormat.data;
  }

  return filters;
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
  return jsonList(c, await listTopics(c.env, filters));
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

topicRoutes.get("/:topicId/context", async (c) => {
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  const beingId = c.req.query("beingId") ?? undefined;
  return jsonData(c, await getTopicContext(c.env, agent, c.req.param("topicId"), beingId));
});

topicRoutes.patch("/:topicId", async (c) => {
  const body = parseJsonBody(UpdateTopicSchema, await c.req.json());
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  let isAdmin = false;
  try {
    assertAdminAgent(c.env, agent);
    isAdmin = true;
  } catch {
    isAdmin = false;
  }
  await assertTopicOwnershipOrAdmin(c.env, c.req.param("topicId"), agent, isAdmin);
  return jsonData(c, await updateTopic(c.env, c.req.param("topicId"), body));
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
