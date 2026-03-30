type ThroughputSample = {
  contributionsPerFlush: number;
  votesPerFlush: number;
  auxRowsPerFlush: number;
};

export type TopicStateTelemetrySnapshot = {
  acceptLatencyMsSamples: number[];
  recomputeDurationMsSamples: number[];
  snapshotDurationMsSamples: number[];
  drainThroughputSamples: ThroughputSample[];
  pendingContributionBacklog: number;
  pendingVoteBacklog: number;
  pendingAuxBacklog: number;
  semanticBacklog: number;
  publicationFreshnessLagMs: number;
};

type FlushTelemetryRecord = {
  contributionsPerFlush: number;
  votesPerFlush: number;
  auxRowsPerFlush: number;
  recomputeDurationMs: number | null;
  snapshotDurationMs: number[];
  publishedAt: string | null;
};

const TELEMETRY_ACCEPT_LATENCY_KEY = "telemetry:accept-latency";
const TELEMETRY_RECOMPUTE_DURATION_KEY = "telemetry:recompute-duration";
const TELEMETRY_SNAPSHOT_DURATION_KEY = "telemetry:snapshot-duration";
const TELEMETRY_DRAIN_THROUGHPUT_KEY = "telemetry:drain-throughput";
const TELEMETRY_LAST_ACCEPTED_AT_KEY = "telemetry:last-accepted-at";
const TELEMETRY_LAST_PUBLISHED_AT_KEY = "telemetry:last-published-at";
const TELEMETRY_SAMPLE_LIMIT = 64;

function sqlExec(state: DurableObjectState, sql: string, ...bindings: unknown[]) {
  return Array.from(
    (
      state.storage as DurableObjectStorage & {
        sql: { exec: (statement: string, ...values: unknown[]) => Iterable<Record<string, unknown>> };
      }
    ).sql.exec(sql, ...bindings),
  );
}

function sqlFirst<T>(state: DurableObjectState, sql: string, ...bindings: unknown[]) {
  return (sqlExec(state, sql, ...bindings)[0] as T | undefined) ?? null;
}

function clampMetric(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Number(value.toFixed(2));
}

async function appendBoundedSample<T>(state: DurableObjectState, key: string, value: T) {
  const existing = ((await state.storage.get<T[]>(key)) ?? []).slice(-(TELEMETRY_SAMPLE_LIMIT - 1));
  existing.push(value);
  await state.storage.put(key, existing);
}

async function updateLatestIsoTimestamp(state: DurableObjectState, key: string, nextValue: string) {
  const currentValue = (await state.storage.get<string>(key)) ?? null;
  if (!currentValue || currentValue < nextValue) {
    await state.storage.put(key, nextValue);
  }
}

function normalizeNumberSamples(values: unknown): number[] {
  if (!Array.isArray(values)) {
    return [];
  }
  return values
    .map((value) => clampMetric(Number(value)))
    .filter((value) => Number.isFinite(value));
}

function normalizeThroughputSamples(values: unknown): ThroughputSample[] {
  if (!Array.isArray(values)) {
    return [];
  }
  return values.flatMap((value) => {
    if (typeof value !== "object" || value === null) {
      return [];
    }
    const sample = value as Partial<ThroughputSample>;
    return [{
      contributionsPerFlush: clampMetric(Number(sample.contributionsPerFlush ?? 0)),
      votesPerFlush: clampMetric(Number(sample.votesPerFlush ?? 0)),
      auxRowsPerFlush: clampMetric(Number(sample.auxRowsPerFlush ?? 0)),
    }];
  });
}

function computePublicationFreshnessLag(lastAcceptedAt: string | null, lastPublishedAt: string | null) {
  if (!lastAcceptedAt) {
    return 0;
  }
  const acceptedMs = Date.parse(lastAcceptedAt);
  const publishedMs = lastPublishedAt ? Date.parse(lastPublishedAt) : 0;
  if (!Number.isFinite(acceptedMs) || acceptedMs <= 0) {
    return 0;
  }
  if (!Number.isFinite(publishedMs) || publishedMs <= 0) {
    return clampMetric(Date.now() - acceptedMs);
  }
  return clampMetric(Math.max(acceptedMs - publishedMs, 0));
}

export async function recordTopicStateAcceptLatency(
  state: DurableObjectState,
  latencyMs: number,
  acceptedAt: string,
): Promise<void> {
  await Promise.all([
    appendBoundedSample(state, TELEMETRY_ACCEPT_LATENCY_KEY, clampMetric(latencyMs)),
    updateLatestIsoTimestamp(state, TELEMETRY_LAST_ACCEPTED_AT_KEY, acceptedAt),
  ]);
}

export async function recordTopicStateFlushTelemetry(
  state: DurableObjectState,
  telemetry: FlushTelemetryRecord,
): Promise<void> {
  const writes: Array<Promise<void>> = [
    appendBoundedSample(state, TELEMETRY_DRAIN_THROUGHPUT_KEY, {
      contributionsPerFlush: clampMetric(telemetry.contributionsPerFlush),
      votesPerFlush: clampMetric(telemetry.votesPerFlush),
      auxRowsPerFlush: clampMetric(telemetry.auxRowsPerFlush),
    }),
  ];
  if (telemetry.recomputeDurationMs !== null) {
    writes.push(
      appendBoundedSample(state, TELEMETRY_RECOMPUTE_DURATION_KEY, clampMetric(telemetry.recomputeDurationMs)),
    );
  }
  for (const durationMs of telemetry.snapshotDurationMs) {
    writes.push(appendBoundedSample(state, TELEMETRY_SNAPSHOT_DURATION_KEY, clampMetric(durationMs)));
  }
  if (telemetry.publishedAt) {
    writes.push(updateLatestIsoTimestamp(state, TELEMETRY_LAST_PUBLISHED_AT_KEY, telemetry.publishedAt));
  }
  await Promise.all(writes);
}

export async function readTopicStateTelemetry(state: DurableObjectState): Promise<TopicStateTelemetrySnapshot> {
  const pendingContributionBacklog = Number(
    (sqlFirst<{ count: number }>(state, `SELECT COUNT(*) AS count FROM pending_messages WHERE flushed = 0`)?.count ?? 0),
  );
  const pendingVotesLegacy = Number(
    (sqlFirst<{ count: number }>(state, `SELECT COUNT(*) AS count FROM pending_votes WHERE flushed = 0`)?.count ?? 0),
  );
  const pendingVotesAux = Number(
    (
      sqlFirst<{ count: number }>(
        state,
        `SELECT COUNT(*) AS count FROM pending_aux WHERE flushed = 0 AND table_name = 'votes'`,
      )?.count ?? 0
    ),
  );
  const pendingAuxBacklog = Number(
    (
      sqlFirst<{ count: number }>(
        state,
        `SELECT COUNT(*) AS count FROM pending_aux WHERE flushed = 0 AND table_name != 'votes'`,
      )?.count ?? 0
    ),
  );
  const semanticBacklog = sqlExec(
    state,
    `SELECT payload_json FROM pending_scores WHERE flushed = 0`,
  ).reduce((count, row) => {
    const payload = JSON.parse(String(row.payload_json ?? "{}")) as {
      semantic_score?: number | null;
      details_json?: {
        semantic?: {
          enabled?: boolean;
        };
      };
    };
    return payload.details_json?.semantic?.enabled === true &&
      (payload.semantic_score === null || payload.semantic_score === undefined)
      ? count + 1
      : count;
  }, 0);

  const [
    acceptLatencyMsSamples,
    recomputeDurationMsSamples,
    snapshotDurationMsSamples,
    drainThroughputSamples,
    lastAcceptedAt,
    lastPublishedAt,
  ] = await Promise.all([
    state.storage.get<number[]>(TELEMETRY_ACCEPT_LATENCY_KEY),
    state.storage.get<number[]>(TELEMETRY_RECOMPUTE_DURATION_KEY),
    state.storage.get<number[]>(TELEMETRY_SNAPSHOT_DURATION_KEY),
    state.storage.get<ThroughputSample[]>(TELEMETRY_DRAIN_THROUGHPUT_KEY),
    state.storage.get<string>(TELEMETRY_LAST_ACCEPTED_AT_KEY),
    state.storage.get<string>(TELEMETRY_LAST_PUBLISHED_AT_KEY),
  ]);

  return {
    acceptLatencyMsSamples: normalizeNumberSamples(acceptLatencyMsSamples),
    recomputeDurationMsSamples: normalizeNumberSamples(recomputeDurationMsSamples),
    snapshotDurationMsSamples: normalizeNumberSamples(snapshotDurationMsSamples),
    drainThroughputSamples: normalizeThroughputSamples(drainThroughputSamples),
    pendingContributionBacklog,
    pendingVoteBacklog: pendingVotesLegacy + pendingVotesAux,
    pendingAuxBacklog,
    semanticBacklog,
    publicationFreshnessLagMs: computePublicationFreshnessLag(lastAcceptedAt ?? null, lastPublishedAt ?? null),
  };
}
