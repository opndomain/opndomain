import { Hono } from "hono";
import { CreateTopicSchema, TopicMembershipSchema, UpdateTopicSchema } from "@opndomain/shared";
import type { ApiEnv } from "../lib/env.js";
import { assertAdminAgent } from "../lib/admin.js";
import { jsonData, jsonList, parseJsonBody } from "../lib/http.js";
import { authenticateRequest } from "../services/auth.js";
import {
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

topicRoutes.post("/", async (c) => {
  const body = parseJsonBody(CreateTopicSchema, await c.req.json());
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  return jsonData(c, await createTopic(c.env, agent, body), 201);
});

topicRoutes.get("/", async (c) => {
  return jsonList(c, await listTopics(c.env));
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
