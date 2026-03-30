import { Hono } from "hono";
import {
  CreateTopicSchema,
  TopicDirectoryQuerySchema,
  TopicMembershipSchema,
  TopicDirectoryListResponseSchema,
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
  const result = TopicDirectoryQuerySchema.safeParse({
    status: c.req.query("status"),
    domain: c.req.query("domain"),
    templateId: c.req.query("templateId"),
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
