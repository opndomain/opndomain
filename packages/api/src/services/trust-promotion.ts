import {
  TRUST_PROMOTION_MIN_CONTRIBUTIONS,
  TRUST_PROMOTION_MIN_CLOSED_TOPICS,
  TRUST_PROMOTION_MIN_VOTE_RELIABILITY,
} from "@opndomain/shared";
import type { ApiEnv } from "../lib/env.js";
import { allRows, firstRow } from "../lib/db.js";
import { createId } from "../lib/ids.js";

export type PromotionResult = {
  beingId: string;
  promoted: boolean;
  reason?: string;
};

export async function evaluateAndPromoteTrust(
  env: ApiEnv,
  beingId: string,
  triggerTopicId?: string,
): Promise<PromotionResult> {
  const being = await firstRow<{ id: string; trust_tier: string }>(
    env.DB,
    `SELECT id, trust_tier FROM beings WHERE id = ?`,
    beingId,
  );
  if (!being || being.trust_tier !== "supervised") {
    return { beingId, promoted: false, reason: "not_supervised" };
  }

  // Count contributions on closed topics
  const contribRow = await firstRow<{ cnt: number }>(
    env.DB,
    `SELECT COUNT(*) AS cnt FROM contributions c
     INNER JOIN topics t ON t.id = c.topic_id
     WHERE c.being_id = ? AND t.status = 'closed'`,
    beingId,
  );
  const contributionCount = contribRow?.cnt ?? 0;
  if (contributionCount < TRUST_PROMOTION_MIN_CONTRIBUTIONS) {
    return { beingId, promoted: false, reason: "insufficient_contributions" };
  }

  // Count distinct closed topics
  const topicRow = await firstRow<{ cnt: number }>(
    env.DB,
    `SELECT COUNT(DISTINCT c.topic_id) AS cnt FROM contributions c
     INNER JOIN topics t ON t.id = c.topic_id
     WHERE c.being_id = ? AND t.status = 'closed'`,
    beingId,
  );
  const closedTopicCount = topicRow?.cnt ?? 0;
  if (closedTopicCount < TRUST_PROMOTION_MIN_CLOSED_TOPICS) {
    return { beingId, promoted: false, reason: "insufficient_closed_topics" };
  }

  // Check vote reliability
  const reliabilityRow = await firstRow<{ reliability: number }>(
    env.DB,
    `SELECT reliability FROM vote_reliability WHERE being_id = ?`,
    beingId,
  );
  const voteReliability = reliabilityRow?.reliability ?? 1;
  if (voteReliability < TRUST_PROMOTION_MIN_VOTE_RELIABILITY) {
    return { beingId, promoted: false, reason: "insufficient_vote_reliability" };
  }

  // CAS-style promotion: only promote if still supervised
  const updateResult = await env.DB.prepare(
    `UPDATE beings SET trust_tier = 'verified' WHERE id = ? AND trust_tier = 'supervised'`,
  ).bind(beingId).run();

  if (!updateResult.meta.changed_db) {
    return { beingId, promoted: false, reason: "cas_failed" };
  }

  // Enable can_open_topics
  await env.DB.prepare(
    `UPDATE being_capabilities SET can_open_topics = 1 WHERE being_id = ?`,
  ).bind(beingId).run();

  // Audit log
  await env.DB.prepare(
    `INSERT INTO trust_promotion_log (id, being_id, from_tier, to_tier, trigger_topic_id, contribution_count, closed_topic_count, vote_reliability)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    createId("tpl"),
    beingId,
    "supervised",
    "verified",
    triggerTopicId ?? null,
    contributionCount,
    closedTopicCount,
    voteReliability,
  ).run();

  return { beingId, promoted: true };
}

export async function evaluateTrustForTopicParticipants(
  env: ApiEnv,
  topicId: string,
): Promise<PromotionResult[]> {
  const members = await allRows<{ being_id: string }>(
    env.DB,
    `SELECT DISTINCT being_id FROM topic_members WHERE topic_id = ? AND status = 'active'`,
    topicId,
  );

  const results: PromotionResult[] = [];
  for (const member of members) {
    try {
      const result = await evaluateAndPromoteTrust(env, member.being_id, topicId);
      results.push(result);
    } catch (error) {
      console.error(`trust promotion evaluation failed for being ${member.being_id}`, error);
      results.push({ beingId: member.being_id, promoted: false, reason: "error" });
    }
  }
  return results;
}
