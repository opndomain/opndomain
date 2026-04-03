import type { ApiEnv } from "../lib/env.js";
import { allRows, firstRow, runStatement } from "../lib/db.js";
import { createId } from "../lib/ids.js";
import { nowIso } from "../lib/time.js";
import { TOPIC_TEMPLATES, type AutonomousConfig, AutonomousConfigSchema } from "@opndomain/shared";
import { finalizeInstance } from "./instance-finalization.js";
import { selectPodReducers } from "./reducer-selection.js";
import { executeMerge } from "./merge-engine.js";

type AutonomousTopicRow = {
  id: string;
  domain_id: string;
  status: string;
  template_id: string;
  autonomous_config_json: string | null;
  [key: string]: unknown;
};

type InstanceRow = {
  id: string;
  topic_id: string;
  instance_index: number;
  status: string;
  participant_count: number;
  current_round_kind: string | null;
  starts_at: string | null;
  ends_at: string | null;
  [key: string]: unknown;
};

function parseAutonomousConfig(json: string | null): AutonomousConfig {
  if (!json) return AutonomousConfigSchema.parse({});
  try {
    return AutonomousConfigSchema.parse(JSON.parse(json));
  } catch {
    return AutonomousConfigSchema.parse({});
  }
}

/**
 * Main cron entry point for autonomous rolling topic lifecycle.
 * Called every 60 seconds.
 */
export async function sweepAutonomousTopics(
  env: ApiEnv,
  now = new Date(),
): Promise<string[]> {
  const mutatedTopicIds: string[] = [];

  const topics = await allRows<AutonomousTopicRow>(
    env.DB,
    `SELECT id, domain_id, status, template_id, autonomous_config_json
     FROM topics
     WHERE template_id = 'autonomous_v1' AND status IN ('open', 'countdown', 'started')`,
  );

  for (const topic of topics) {
    try {
      const mutated = await sweepSingleAutonomousTopic(env, topic, now);
      if (mutated) mutatedTopicIds.push(topic.id);
    } catch (error) {
      console.error(`autonomous sweep failed for topic ${topic.id}`, error);
    }
  }

  return mutatedTopicIds;
}

async function sweepSingleAutonomousTopic(
  env: ApiEnv,
  topic: AutonomousTopicRow,
  now: Date,
): Promise<boolean> {
  const config = parseAutonomousConfig(topic.autonomous_config_json);
  let mutated = false;

  mutated = (await maybeCreateInstance(env, topic, config, now)) || mutated;
  mutated = (await advanceInstanceRounds(env, topic, config, now)) || mutated;
  mutated = (await finalizeCompletedInstances(env, topic, now)) || mutated;
  mutated = (await maybeMerge(env, topic)) || mutated;

  return mutated;
}

/**
 * Create a new instance with real rounds rows.
 */
async function maybeCreateInstance(
  env: ApiEnv,
  topic: AutonomousTopicRow,
  config: AutonomousConfig,
  now: Date,
): Promise<boolean> {
  // Enforce concurrent instance cap (plan default: 1)
  const activeCount = await firstRow<{ cnt: number }>(
    env.DB,
    `SELECT COUNT(*) as cnt FROM topic_instances
     WHERE topic_id = ? AND status IN ('open', 'running', 'finalizing')`,
    topic.id,
  );
  if ((activeCount?.cnt ?? 0) >= config.maxConcurrentInstances) return false;

  const availableMembers = await allRows<{ being_id: string }>(
    env.DB,
    `SELECT tm.being_id FROM topic_members tm
     WHERE tm.topic_id = ? AND tm.status = 'active'
       AND tm.being_id NOT IN (
         SELECT ip.being_id FROM instance_participants ip
         JOIN topic_instances ti ON ti.id = ip.instance_id
         WHERE ti.topic_id = ? AND ti.status IN ('open', 'running')
       )`,
    topic.id,
    topic.id,
  );

  if (availableMembers.length < config.minParticipantsPerInstance) return false;

  const maxIndex = await firstRow<{ max_idx: number | null }>(
    env.DB,
    `SELECT MAX(instance_index) as max_idx FROM topic_instances WHERE topic_id = ?`,
    topic.id,
  );
  const nextIndex = (maxIndex?.max_idx ?? -1) + 1;

  const instanceId = createId("inst");
  const startsAt = nowIso(now);
  const endsAt = new Date(now.getTime() + config.instanceTimeoutSeconds * 1000).toISOString();

  await runStatement(
    env.DB
      .prepare(
        `INSERT INTO topic_instances
         (id, topic_id, instance_index, status, min_participants, max_participants,
          starts_at, ends_at)
         VALUES (?, ?, ?, 'open', ?, ?, ?, ?)`,
      )
      .bind(instanceId, topic.id, nextIndex, config.minParticipantsPerInstance,
        config.maxParticipantsPerInstance, startsAt, endsAt),
  );

  // Assign participants (frozen at creation)
  const toAssign = availableMembers.slice(0, config.maxParticipantsPerInstance);
  for (const member of toAssign) {
    await runStatement(
      env.DB.prepare(
        `INSERT OR IGNORE INTO instance_participants (id, instance_id, being_id) VALUES (?, ?, ?)`,
      ).bind(createId("ip"), instanceId, member.being_id),
    );
  }

  // Create real rounds rows for this instance
  const template = TOPIC_TEMPLATES.autonomous_v1;
  for (let seqIdx = 0; seqIdx < template.rounds.length; seqIdx++) {
    const roundDef = template.rounds[seqIdx];
    const roundId = createId("rnd");
    const roundStartsAt = new Date(now.getTime() + seqIdx * config.roundDurationSeconds * 1000).toISOString();
    const roundEndsAt = new Date(now.getTime() + (seqIdx + 1) * config.roundDurationSeconds * 1000).toISOString();
    const status = seqIdx === 0 ? "active" : "pending";

    await runStatement(
      env.DB.prepare(
        `INSERT INTO rounds (id, topic_id, sequence_index, round_kind, status, starts_at, ends_at, instance_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(roundId, topic.id, seqIdx, roundDef.roundKind, status, roundStartsAt, roundEndsAt, instanceId),
    );
  }

  // Mark instance running
  await runStatement(
    env.DB.prepare(
      `UPDATE topic_instances SET participant_count = ?, status = 'running',
       current_round_kind = 'propose', updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).bind(toAssign.length, instanceId),
  );

  // Create pods
  await createPods(env, instanceId, toAssign.map((m) => m.being_id), config);

  return true;
}

async function createPods(
  env: ApiEnv,
  instanceId: string,
  beingIds: string[],
  config: AutonomousConfig,
): Promise<void> {
  const podSize = config.podSize;
  const podCount = Math.max(1, Math.ceil(beingIds.length / podSize));

  for (let i = 0; i < podCount; i++) {
    const podId = createId("pod");
    const startIdx = Math.floor((i * beingIds.length) / podCount);
    const endIdx = Math.floor(((i + 1) * beingIds.length) / podCount);
    const podMembers = beingIds.slice(startIdx, endIdx);

    await runStatement(
      env.DB.prepare(
        `INSERT INTO instance_pods (id, instance_id, pod_index, participant_count) VALUES (?, ?, ?, ?)`,
      ).bind(podId, instanceId, i, podMembers.length),
    );

    for (const beingId of podMembers) {
      await runStatement(
        env.DB.prepare(
          `UPDATE instance_participants SET pod_id = ? WHERE instance_id = ? AND being_id = ?`,
        ).bind(podId, instanceId, beingId),
      );
    }
  }
}

/**
 * Advance rounds in running instances by completing the active round
 * and activating the next one when the time window expires.
 */
async function advanceInstanceRounds(
  env: ApiEnv,
  topic: AutonomousTopicRow,
  config: AutonomousConfig,
  now: Date,
): Promise<boolean> {
  const runningInstances = await allRows<InstanceRow>(
    env.DB,
    `SELECT * FROM topic_instances WHERE topic_id = ? AND status = 'running'`,
    topic.id,
  );

  let mutated = false;

  for (const instance of runningInstances) {
    // Check instance timeout
    if (instance.ends_at && new Date(instance.ends_at).getTime() <= now.getTime()) {
      // Complete all remaining active rounds
      await runStatement(
        env.DB.prepare(
          `UPDATE rounds SET status = 'completed', updated_at = CURRENT_TIMESTAMP
           WHERE instance_id = ? AND status = 'active'`,
        ).bind(instance.id),
      );
      await runStatement(
        env.DB.prepare(
          `UPDATE topic_instances SET status = 'finalizing', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        ).bind(instance.id),
      );
      mutated = true;
      continue;
    }

    // Find the active round for this instance
    const activeRound = await firstRow<{
      id: string; sequence_index: number; round_kind: string; ends_at: string | null;
      [key: string]: unknown;
    }>(
      env.DB,
      `SELECT id, sequence_index, round_kind, ends_at FROM rounds
       WHERE instance_id = ? AND status = 'active'
       ORDER BY sequence_index LIMIT 1`,
      instance.id,
    );
    if (!activeRound) continue;

    // Check if round time has elapsed
    if (!activeRound.ends_at || new Date(activeRound.ends_at).getTime() > now.getTime()) {
      continue;
    }

    // If advancing past synthesize, select reducers
    if (activeRound.round_kind === "synthesize") {
      await selectPodReducers(env, instance.id);
    }

    // Complete current round
    await runStatement(
      env.DB.prepare(
        `UPDATE rounds SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      ).bind(activeRound.id),
    );

    // Activate next round
    const nextRound = await firstRow<{ id: string; round_kind: string; [key: string]: unknown }>(
      env.DB,
      `SELECT id, round_kind FROM rounds
       WHERE instance_id = ? AND sequence_index = ?`,
      instance.id,
      activeRound.sequence_index + 1,
    );

    if (nextRound) {
      await runStatement(
        env.DB.prepare(
          `UPDATE rounds SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        ).bind(nextRound.id),
      );
      await runStatement(
        env.DB.prepare(
          `UPDATE topic_instances SET current_round_kind = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        ).bind(nextRound.round_kind, instance.id),
      );

      // Check if this was the terminal round
      const template = TOPIC_TEMPLATES.autonomous_v1;
      const nextRoundDef = template.rounds[activeRound.sequence_index + 1];
      if (nextRoundDef?.terminal) {
        // Terminal round activated — will finalize after its time expires
      }
    } else {
      // No more rounds — move to finalizing
      await runStatement(
        env.DB.prepare(
          `UPDATE topic_instances SET status = 'finalizing', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        ).bind(instance.id),
      );
    }

    mutated = true;
  }

  return mutated;
}

async function finalizeCompletedInstances(
  env: ApiEnv,
  topic: AutonomousTopicRow,
  now: Date,
): Promise<boolean> {
  const finalizingInstances = await allRows<InstanceRow>(
    env.DB,
    `SELECT * FROM topic_instances WHERE topic_id = ? AND status = 'finalizing'`,
    topic.id,
  );

  let mutated = false;
  for (const instance of finalizingInstances) {
    const result = await finalizeInstance(env, instance.id);
    if (result.success) {
      mutated = true;
    }
  }

  return mutated;
}

async function maybeMerge(
  env: ApiEnv,
  topic: AutonomousTopicRow,
): Promise<boolean> {
  const readyInstances = await allRows<{ id: string }>(
    env.DB,
    `SELECT ti.id FROM topic_instances ti
     JOIN instance_finalization_steps ifs
       ON ifs.instance_id = ti.id AND ifs.phase = 'merge_ready' AND ifs.status = 'completed'
     WHERE ti.topic_id = ? AND ti.status = 'finalized' AND ti.error_class IS NULL`,
    topic.id,
  );

  if (readyInstances.length === 0) return false;

  const result = await executeMerge(env, topic.id);
  return result !== null;
}
