import { Hono } from "hono";
import {
  DAILY_ROLLUP_CRON,
  MATCHMAKING_SWEEP_CRON,
  PHASE5_MAINTENANCE_STUB_CRON,
  PRESENTATION_RETRY_REASON_RECONCILE_UNKNOWN,
  REPUTATION_DECAY_CRON,
  ROUND_AUTO_ADVANCE_SWEEP_CRON,
} from "@opndomain/shared";
import { parseApiEnv } from "./lib/env.js";
import { TopicStateDurableObject } from "./lib/do/topic-state.js";
import { apiErrorMiddleware, buildApiErrorResponse } from "./lib/http.js";
import { listPendingSnapshotRetries, queueSnapshotRetry, syncTopicSnapshots } from "./lib/snapshot-sync.js";
import { authRoutes } from "./routes/auth.js";
import { beingRoutes } from "./routes/beings.js";
import { contributionRoutes } from "./routes/contributions.js";
import { domainRoutes } from "./routes/domains.js";
import { internalRoutes } from "./routes/internal.js";
import { metaRoutes } from "./routes/meta.js";
import { topicRoutes } from "./routes/topics.js";
import { voteRoutes } from "./routes/votes.js";
import { ensureSeedDomains } from "./services/domains.js";
import { recordCronHeartbeat, sweepTopicLifecycle } from "./services/lifecycle.js";
import { purgeExpiredMagicLinks } from "./services/auth.js";
import {
  listPendingPresentationRetries,
  queuePresentationRetry,
  reconcileTopicPresentation,
} from "./services/presentation.js";
import { decayStaleReputations, rollupDomainDailyCounts } from "./services/reputation.js";

type ApiWorkerEnv = {
  Bindings: ReturnType<typeof parseApiEnv>;
};

export function createApiApp() {
  const app = new Hono<ApiWorkerEnv>();

  app.use("*", apiErrorMiddleware);
  app.onError((error) => buildApiErrorResponse(error));
  app.route("/", metaRoutes);
  app.route("/v1/auth", authRoutes);
  app.route("/v1/beings", beingRoutes);
  app.route("/v1/domains", domainRoutes);
  app.route("/v1/topics", topicRoutes);
  app.route("/v1/topics", contributionRoutes);
  app.route("/v1/topics", voteRoutes);
  app.route("/v1/internal", internalRoutes);

  app.notFound((c) =>
    c.json(
      {
        error: "not_found",
        code: "not_found",
        message: "The requested route was not found.",
      },
      404,
    ),
  );

  return app;
}

const app = createApiApp();

export { TopicStateDurableObject };

export default {
  fetch(
    request: Request,
    rawEnv: unknown,
    executionContext: ExecutionContext,
  ) {
    const env = parseApiEnv(rawEnv);
    executionContext.waitUntil(ensureSeedDomains(env));
    return app.fetch(request, env, executionContext);
  },
  async scheduled(
    controller: ScheduledController,
    rawEnv: unknown,
    executionContext: ExecutionContext,
  ) {
    const env = parseApiEnv(rawEnv);
    const now = new Date(controller.scheduledTime);
    executionContext.waitUntil(
      Promise.resolve().then(async () => {
        await ensureSeedDomains(env);
        if (controller.cron === MATCHMAKING_SWEEP_CRON || controller.cron === ROUND_AUTO_ADVANCE_SWEEP_CRON) {
          for (const topicId of await listPendingSnapshotRetries(env)) {
            try {
              await syncTopicSnapshots(env, topicId, "scheduled_retry");
            } catch (error) {
              console.error(`snapshot retry failed before lifecycle sweep for topic ${topicId}`, error);
              await queueSnapshotRetry(env, topicId, "scheduled_retry");
            }
          }
          for (const topicId of await listPendingPresentationRetries(env)) {
            try {
              await reconcileTopicPresentation(env, topicId, PRESENTATION_RETRY_REASON_RECONCILE_UNKNOWN);
            } catch (error) {
              console.error(`presentation retry failed before lifecycle sweep for topic ${topicId}`, error);
              await queuePresentationRetry(env, topicId, PRESENTATION_RETRY_REASON_RECONCILE_UNKNOWN, error);
            }
          }
          const result = await sweepTopicLifecycle(env, { cron: controller.cron, now });
          for (const topicId of result.mutatedTopicIds) {
            try {
              await syncTopicSnapshots(env, topicId, "lifecycle_sweep");
            } catch (error) {
              console.error(`snapshot sync failed after lifecycle mutation for topic ${topicId}`, error);
              await queueSnapshotRetry(env, topicId, "lifecycle_sweep");
            }
          }
        }
        if (controller.cron === PHASE5_MAINTENANCE_STUB_CRON) {
          await env.PUBLIC_CACHE.put("cron/phase5-maintenance-stub", now.toISOString());
          await purgeExpiredMagicLinks(env, now);
        }
        if (controller.cron === REPUTATION_DECAY_CRON) {
          await decayStaleReputations(env, now);
        }
        if (controller.cron === DAILY_ROLLUP_CRON) {
          await rollupDomainDailyCounts(env, now);
        }
        await recordCronHeartbeat(env, controller.cron, now);
      }),
    );
  },
};
