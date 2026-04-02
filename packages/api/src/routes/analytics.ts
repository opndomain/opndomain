import { Hono } from "hono";
import {
  AnalyticsDomainsQuerySchema,
  AnalyticsDomainsResponseSchema,
  AnalyticsLeaderboardParamsSchema,
  AnalyticsLeaderboardResponseSchema,
  AnalyticsOverviewQuerySchema,
  AnalyticsOverviewResponseSchema,
  AnalyticsTopicParamsSchema,
  AnalyticsTopicResponseSchema,
  AnalyticsVoteReliabilityQuerySchema,
  AnalyticsVoteReliabilityResponseSchema,
} from "@opndomain/shared";
import type { ApiEnv } from "../lib/env.js";
import { ApiError } from "../lib/errors.js";
import { jsonData } from "../lib/http.js";
import { authenticateRequest } from "../services/auth.js";
import {
  getAnalyticsDomains,
  getAnalyticsLeaderboard,
  getAnalyticsOverview,
  getAnalyticsTopic,
  getAnalyticsVoteReliability,
} from "../services/analytics.js";

export const analyticsRoutes = new Hono<{ Bindings: ApiEnv }>();

type SafeParseSchema<T> = {
  safeParse(value: unknown):
    | { success: true; data: T }
    | { success: false; error: { flatten(): unknown } };
};

function parseSchema<T>(schema: SafeParseSchema<T>, value: unknown, message: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiError(400, "invalid_request", message, result.error.flatten());
  }
  return result.data;
}

function parseQuery<T>(schema: SafeParseSchema<T>, request: Request): T {
  const url = new URL(request.url);
  const raw: Record<string, string | undefined> = {};
  for (const [key, value] of url.searchParams.entries()) {
    raw[key] = value;
  }
  return parseSchema(schema, raw, "Query parameters failed validation.");
}

async function withAuthenticatedReadAccess(
  c: { env: ApiEnv; req: { raw: Request } },
  action: () => Promise<Response>,
) {
  await authenticateRequest(c.env, c.req.raw);
  return action();
}

analyticsRoutes.get("/overview", async (c) => {
  const query = parseQuery(AnalyticsOverviewQuerySchema, c.req.raw);
  const payload = AnalyticsOverviewResponseSchema.parse(await getAnalyticsOverview(c.env, query));
  return jsonData(c, payload);
});

analyticsRoutes.get("/domains", async (c) => {
  const query = parseQuery(AnalyticsDomainsQuerySchema, c.req.raw);
  const payload = AnalyticsDomainsResponseSchema.parse(await getAnalyticsDomains(c.env, query));
  return jsonData(c, payload);
});

analyticsRoutes.get("/leaderboard/:domainId", async (c) => {
  return withAuthenticatedReadAccess(c, async () => {
    const params = parseSchema(
      AnalyticsLeaderboardParamsSchema,
      { domainId: c.req.param("domainId") },
      "Route parameters failed validation.",
    );
    const payload = AnalyticsLeaderboardResponseSchema.parse(await getAnalyticsLeaderboard(c.env, params));
    return jsonData(c, payload);
  });
});

analyticsRoutes.get("/topic/:topicId", async (c) => {
  return withAuthenticatedReadAccess(c, async () => {
    const params = parseSchema(
      AnalyticsTopicParamsSchema,
      { topicId: c.req.param("topicId") },
      "Route parameters failed validation.",
    );
    const payload = AnalyticsTopicResponseSchema.parse(await getAnalyticsTopic(c.env, params.topicId));
    return jsonData(c, payload);
  });
});

analyticsRoutes.get("/vote-reliability", async (c) => {
  return withAuthenticatedReadAccess(c, async () => {
    const query = parseQuery(AnalyticsVoteReliabilityQuerySchema, c.req.raw);
    const payload = AnalyticsVoteReliabilityResponseSchema.parse(await getAnalyticsVoteReliability(c.env, query));
    return jsonData(c, payload);
  });
});
