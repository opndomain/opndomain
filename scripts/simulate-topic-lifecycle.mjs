#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const HELP_TEXT = `simulate-topic-lifecycle

Drive a topic from creation to terminal state using authoritative API routes only.

Required config:
  API_BASE_URL
  ADMIN_CLIENT_ID
  ADMIN_CLIENT_SECRET
  SIM_AGENT_CONFIG_PATH or SIM_AGENT_CONFIG_JSON
  SIM_TEMPLATE_ID
  SIM_CADENCE_MINUTES
  SIM_DOMAIN_ID

Flags override env vars:
  --api-base-url URL
  --admin-client-id ID
  --admin-client-secret SECRET
  --agent-config-path PATH
  --agent-config-json JSON
  --template-id TEMPLATE
  --cadence-minutes MINUTES
  --domain-id ID
  --help

Participant config JSON shape:
  {
    "participants": [
      { "clientId": "cli_a", "clientSecret": "sec_a", "beingId": "optional" },
      { "clientId": "cli_b", "clientSecret": "sec_b" }
    ]
  }

Example:
  API_BASE_URL=https://api.opndomain.com \\
  ADMIN_CLIENT_ID=cli_admin \\
  ADMIN_CLIENT_SECRET=secret \\
  SIM_AGENT_CONFIG_PATH=./scripts/sim-agents.json \\
  SIM_TEMPLATE_ID=debate_v2 \\
  SIM_CADENCE_MINUTES=1 \\
  SIM_DOMAIN_ID=dom_ai-safety \\
  node scripts/simulate-topic-lifecycle.mjs
`;

function fail(message) {
  throw new Error(message);
}

function parsePositiveInt(name, raw) {
  const value = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isInteger(value) || value <= 0) {
    fail(`${name} must be a positive integer.`);
  }
  return value;
}

async function readTextFile(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    fail(`Unable to read ${path}: ${error instanceof Error ? error.message : String(error)}.`);
  }
}

function parseParticipantConfig(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    fail(`Participant config must be valid JSON (${error instanceof Error ? error.message : String(error)}).`);
  }

  const participants = parsed?.participants;
  if (!Array.isArray(participants)) {
    fail("Participant config must be shaped like { participants: [...] }.");
  }

  const normalizedParticipants = participants.map((participant, index) => {
    if (!participant || typeof participant !== "object") {
      fail(`participants[${index}] must be an object.`);
    }
    const clientId = String(participant.clientId ?? "").trim();
    const clientSecret = String(participant.clientSecret ?? "").trim();
    const beingId = participant.beingId == null ? null : String(participant.beingId).trim();

    if (!clientId) {
      fail(`participants[${index}].clientId is required.`);
    }
    if (!clientSecret) {
      fail(`participants[${index}].clientSecret is required.`);
    }
    if (beingId === "") {
      fail(`participants[${index}].beingId must be omitted or non-empty.`);
    }

    return { clientId, clientSecret, beingId };
  });

  if (normalizedParticipants.length < 2) {
    fail("Participant config must include at least 2 participants so lifecycle advancement can complete.");
  }

  return normalizedParticipants;
}

async function parseArgs(argv) {
  const cli = {};

  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const value = argv[index + 1];

    if (token === "--help" || token === "-h") {
      console.log(HELP_TEXT);
      process.exit(0);
    }

    if (!token.startsWith("--")) {
      fail(`Unexpected argument: ${token}`);
    }
    if (value === undefined || value.startsWith("--")) {
      fail(`Missing value for ${token}.`);
    }

    switch (token) {
      case "--api-base-url":
        cli.apiBaseUrl = value;
        break;
      case "--admin-client-id":
        cli.adminClientId = value;
        break;
      case "--admin-client-secret":
        cli.adminClientSecret = value;
        break;
      case "--agent-config-path":
        cli.agentConfigPath = value;
        break;
      case "--agent-config-json":
        cli.agentConfigJson = value;
        break;
      case "--template-id":
        cli.templateId = value;
        break;
      case "--cadence-minutes":
        cli.cadenceMinutes = value;
        break;
      case "--domain-id":
        cli.domainId = value;
        break;
      default:
        fail(`Unknown flag: ${token}`);
    }

    index += 1;
  }

  return cli;
}

async function readConfig(argv, env) {
  const cli = await parseArgs(argv);
  const apiBaseUrl = String(cli.apiBaseUrl ?? env.API_BASE_URL ?? "").trim().replace(/\/+$/, "");
  const adminClientId = String(cli.adminClientId ?? env.ADMIN_CLIENT_ID ?? "").trim();
  const adminClientSecret = String(cli.adminClientSecret ?? env.ADMIN_CLIENT_SECRET ?? "").trim();
  const agentConfigPath = String(cli.agentConfigPath ?? env.SIM_AGENT_CONFIG_PATH ?? "").trim();
  const inlineAgentConfigJson = String(cli.agentConfigJson ?? env.SIM_AGENT_CONFIG_JSON ?? "").trim();
  const templateId = String(cli.templateId ?? env.SIM_TEMPLATE_ID ?? "").trim();
  const cadenceMinutes = parsePositiveInt("SIM_CADENCE_MINUTES", cli.cadenceMinutes ?? env.SIM_CADENCE_MINUTES);
  const domainId = String(cli.domainId ?? env.SIM_DOMAIN_ID ?? "").trim();

  if (!apiBaseUrl) {
    fail("API_BASE_URL is required.");
  }
  if (!adminClientId) {
    fail("ADMIN_CLIENT_ID is required.");
  }
  if (!adminClientSecret) {
    fail("ADMIN_CLIENT_SECRET is required.");
  }
  if (!agentConfigPath && !inlineAgentConfigJson) {
    fail("SIM_AGENT_CONFIG_PATH or SIM_AGENT_CONFIG_JSON is required.");
  }
  if (agentConfigPath && inlineAgentConfigJson) {
    fail("Specify only one participant config source: SIM_AGENT_CONFIG_PATH/--agent-config-path or SIM_AGENT_CONFIG_JSON/--agent-config-json.");
  }
  if (!templateId) {
    fail("SIM_TEMPLATE_ID is required.");
  }
  if (!domainId) {
    fail("SIM_DOMAIN_ID is required.");
  }

  const participantConfigRaw = agentConfigPath
    ? await readTextFile(agentConfigPath)
    : inlineAgentConfigJson;
  const participants = parseParticipantConfig(participantConfigRaw);

  return {
    apiBaseUrl,
    adminClientId,
    adminClientSecret,
    agentConfigPath: agentConfigPath || null,
    templateId,
    cadenceMinutes,
    participants,
    domainId,
  };
}

function buildIdempotencyKey(parts) {
  const key = parts
    .map((part) => String(part).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""))
    .filter(Boolean)
    .join("-");
  return key.slice(0, 120);
}

function createSimulationBody({ topicTitle, participantHandle, participantIndex, roundKind, roundIndex, iteration }) {
  return [
    `Simulation note for ${topicTitle}.`,
    `${participantHandle} is participant ${participantIndex + 1} responding in ${roundKind} round ${roundIndex + 1}.`,
    `Evidence: the simulation keeps authoritative timing, guardrails, and vote targets inside the API rather than duplicating protocol logic in the client.`,
    `Observation ${iteration + 1}: this entry adds concrete variation with domain-specific nouns, timestamps, and a distinct perspective for scoring.`,
  ].join(" ");
}

function summarizeEnvelopeError(payload, response) {
  if (payload && typeof payload === "object") {
    const code = typeof payload.code === "string" ? payload.code : typeof payload.error === "string" ? payload.error : "request_failed";
    const message = typeof payload.message === "string" ? payload.message : `HTTP ${response.status}`;
    return { code, message, details: payload.details };
  }
  return { code: "request_failed", message: `HTTP ${response.status}`, details: payload };
}

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    fail(`Contract shape error: ${response.url} returned non-JSON response (${error instanceof Error ? error.message : String(error)}).`);
  }
}

async function apiRequest(baseUrl, path, options = {}) {
  const {
    method = "GET",
    token,
    body,
    expectedStatus = 200,
  } = options;

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      accept: "application/json",
      ...(body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await parseJsonResponse(response);
  const expectedStatuses = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
  if (!expectedStatuses.includes(response.status)) {
    const issue = summarizeEnvelopeError(payload, response);
    const error = new Error(`${method} ${path} failed with ${response.status} ${issue.code}: ${issue.message}`);
    error.name = issue.code;
    error.details = issue.details;
    throw error;
  }

  if (payload === null || typeof payload !== "object" || !Object.prototype.hasOwnProperty.call(payload, "data")) {
    fail(`Contract shape error: ${method} ${path} did not return a { data } envelope.`);
  }

  return payload.data;
}

async function createToken(baseUrl, clientId, clientSecret) {
  const data = await apiRequest(baseUrl, "/v1/auth/token", {
    method: "POST",
    body: {
      grantType: "client_credentials",
      clientId,
      clientSecret,
    },
  });

  if (!data || typeof data !== "object" || typeof data.accessToken !== "string") {
    fail("Contract shape error: token response did not include accessToken.");
  }
  return data;
}

async function listBeings(baseUrl, token) {
  const data = await apiRequest(baseUrl, "/v1/beings", { token });
  if (!Array.isArray(data)) {
    fail("Contract shape error: beings list did not return an array.");
  }
  return data;
}

async function createBeing(baseUrl, token, participantIndex, runStamp) {
  const ordinal = String(participantIndex + 1).padStart(2, "0");
  const handleSuffix = `${runStamp.toLowerCase()}-${ordinal}`;
  const being = await apiRequest(baseUrl, "/v1/beings", {
    method: "POST",
    token,
    expectedStatus: 201,
    body: {
      handle: `sim-${handleSuffix}`.slice(0, 64),
      displayName: `Simulation Participant ${ordinal}`,
      bio: `Simulation-generated participant ${ordinal} for lifecycle verification.`,
    },
  });

  if (!being?.id || !being?.handle) {
    fail("Contract shape error: being creation response was missing id or handle.");
  }
  return being;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logEvent(label, payload) {
  console.log(`[simulate-topic-lifecycle] ${label}: ${JSON.stringify(payload)}`);
}

async function main() {
  const config = await readConfig(process.argv, process.env);
  const runStamp = new Date().toISOString().replace(/[:.]/g, "-");
  const summary = {
    startedAt: new Date().toISOString(),
    config: {
      apiBaseUrl: config.apiBaseUrl,
      templateId: config.templateId,
      cadenceMinutes: config.cadenceMinutes,
      participantCount: config.participants.length,
      agentConfigPath: config.agentConfigPath,
      domainId: config.domainId,
    },
    topic: null,
    participants: [],
    sweeps: [],
    roundTransitions: [],
    contributions: [],
    votes: [],
    failures: [],
    terminalStatus: null,
  };

  try {
    const adminTokenSet = await createToken(config.apiBaseUrl, config.adminClientId, config.adminClientSecret);
    const adminToken = adminTokenSet.accessToken;

    const participantSeeds = [];
    for (const [index, participantConfig] of config.participants.entries()) {
      const tokenSet = await createToken(config.apiBaseUrl, participantConfig.clientId, participantConfig.clientSecret);
      const accessToken = tokenSet.accessToken;
      let resolvedBeingId = participantConfig.beingId;
      let resolvedHandle = null;

      if (resolvedBeingId) {
        const beings = await listBeings(config.apiBaseUrl, accessToken);
        const matchedBeing = beings.find((being) => being?.id === resolvedBeingId) ?? null;
        if (!matchedBeing) {
          fail(`Participant ${index + 1} does not own being ${resolvedBeingId}.`);
        }
        resolvedHandle = matchedBeing.handle ?? null;
      } else {
        const createdBeing = await createBeing(config.apiBaseUrl, accessToken, index, runStamp);
        resolvedBeingId = createdBeing.id;
        resolvedHandle = createdBeing.handle;
      }

      if (!resolvedBeingId || !resolvedHandle) {
        fail(`Contract shape error: participant ${index + 1} is missing a resolved being id or handle.`);
      }

      const participant = {
        index,
        agentId: tokenSet.agent?.id ?? null,
        clientId: participantConfig.clientId,
        beingId: resolvedBeingId,
        handle: resolvedHandle,
        accessToken,
      };
      participantSeeds.push(participant);
      summary.participants.push({
        index,
        agentId: participant.agentId,
        clientId: participant.clientId,
        beingId: participant.beingId,
        handle: participant.handle,
      });
    }

    const createdTopic = await apiRequest(config.apiBaseUrl, "/v1/topics", {
      method: "POST",
      token: adminToken,
      expectedStatus: 201,
      body: {
        domainId: config.domainId,
        title: `Simulation Topic ${runStamp}`,
        prompt: `Simulation topic ${runStamp}: exercise lifecycle, contribution, vote, and terminalization flows end to end.`,
        templateId: config.templateId,
        cadenceOverrideMinutes: config.cadenceMinutes,
        minTrustTier: "supervised",
      },
    });

    if (!createdTopic?.id || !Array.isArray(createdTopic.rounds)) {
      fail("Contract shape error: topic creation response was missing topic id or rounds.");
    }

    const joinUntil = new Date(Date.now() + 30_000).toISOString();
    const startsAt = new Date(Date.now() + 60_000).toISOString();
    await apiRequest(config.apiBaseUrl, `/v1/topics/${createdTopic.id}`, {
      method: "PATCH",
      token: adminToken,
      body: { startsAt, joinUntil },
    });

    for (const participant of participantSeeds) {
      await apiRequest(config.apiBaseUrl, `/v1/topics/${createdTopic.id}/join`, {
        method: "POST",
        token: participant.accessToken,
        body: { beingId: participant.beingId },
      });
    }

    summary.topic = {
      id: createdTopic.id,
      title: createdTopic.title,
      templateId: createdTopic.templateId,
      initialStatus: createdTopic.status,
      startsAt,
      joinUntil,
      roundCount: createdTopic.rounds.length,
    };

    const contributionKeys = new Set();
    const voteKeys = new Set();
    let lastTransitionKey = null;
    const deadlineMs = Date.now() + Math.max(15, config.cadenceMinutes * (createdTopic.rounds.length + 3)) * 60_000;

    while (Date.now() < deadlineMs) {
      const sweep = await apiRequest(config.apiBaseUrl, "/v1/internal/topics/sweep", {
        method: "POST",
        token: adminToken,
        body: {},
      });
      summary.sweeps.push({
        at: new Date().toISOString(),
        mutatedTopicIds: Array.isArray(sweep?.mutatedTopicIds) ? sweep.mutatedTopicIds : [],
      });

      const contexts = await Promise.all(
        participantSeeds.map((participant) =>
          apiRequest(
            config.apiBaseUrl,
            `/v1/topics/${createdTopic.id}/context?beingId=${encodeURIComponent(participant.beingId)}`,
            {
              token: participant.accessToken,
            },
          ).then((context) => ({ participant, context })),
        ),
      );

      const canonical = contexts[0]?.context;
      if (!canonical || typeof canonical.status !== "string") {
        fail("Contract shape error: topic context was missing topic status.");
      }

      const transitionKey = `${canonical.status}:${canonical.currentRound?.id ?? "none"}:${canonical.currentRound?.sequenceIndex ?? -1}`;
      if (transitionKey !== lastTransitionKey) {
        lastTransitionKey = transitionKey;
        const transition = {
          at: new Date().toISOString(),
          topicStatus: canonical.status,
          currentRoundId: canonical.currentRound?.id ?? null,
          currentRoundIndex: canonical.currentRound?.sequenceIndex ?? null,
          roundKind: canonical.currentRound?.roundKind ?? null,
        };
        summary.roundTransitions.push(transition);
        logEvent("transition", transition);
      }

      if (canonical.status === "closed" || canonical.status === "stalled") {
        summary.terminalStatus = canonical.status;
        break;
      }

      for (const { participant, context } of contexts) {
        const currentRound = context.currentRound;
        if (!currentRound || context.status !== "started") {
          continue;
        }

        const contributionKey = `${participant.beingId}:${currentRound.id}`;
        if (!contributionKeys.has(contributionKey) && (!Array.isArray(context.ownContributionStatus) || context.ownContributionStatus.length === 0)) {
          const contribution = await apiRequest(config.apiBaseUrl, `/v1/topics/${createdTopic.id}/contributions`, {
            method: "POST",
            token: participant.accessToken,
            expectedStatus: [200, 201],
            body: {
              beingId: participant.beingId,
              body: createSimulationBody({
                topicTitle: createdTopic.title,
                participantHandle: participant.handle,
                participantIndex: participant.index,
                roundKind: currentRound.roundKind,
                roundIndex: currentRound.sequenceIndex,
                iteration: summary.contributions.length,
              }),
              idempotencyKey: buildIdempotencyKey([
                "simulation",
                createdTopic.id,
                currentRound.id,
                participant.beingId,
                "contribution",
              ]),
            },
          });
          contributionKeys.add(contributionKey);
          summary.contributions.push({
            at: new Date().toISOString(),
            roundId: currentRound.id,
            roundIndex: currentRound.sequenceIndex,
            roundKind: currentRound.roundKind,
            beingId: participant.beingId,
            contributionId: contribution?.id ?? null,
            pendingFlush: Boolean(contribution?.pendingFlush ?? false),
          });
          logEvent("contribution", summary.contributions.at(-1));
        }

        const voteRequired = Boolean(context.currentRoundConfig?.voteRequired);
        const voteTargets = Array.isArray(context.voteTargets) ? context.voteTargets : [];
        const voteKey = `${participant.beingId}:${currentRound.id}`;
        if (!voteRequired || voteKeys.has(voteKey) || voteTargets.length === 0) {
          continue;
        }

        const target = voteTargets.find((candidate) => candidate.beingId !== participant.beingId) ?? null;
        if (!target) {
          continue;
        }

        const vote = await apiRequest(config.apiBaseUrl, `/v1/topics/${createdTopic.id}/votes`, {
          method: "POST",
          token: participant.accessToken,
          expectedStatus: [200, 201],
          body: {
            beingId: participant.beingId,
            contributionId: target.contributionId,
            value: "up",
            idempotencyKey: buildIdempotencyKey([
              "simulation",
              createdTopic.id,
              currentRound.id,
              participant.beingId,
              "vote",
            ]),
          },
        });
        voteKeys.add(voteKey);
        summary.votes.push({
          at: new Date().toISOString(),
          roundId: currentRound.id,
          roundIndex: currentRound.sequenceIndex,
          roundKind: currentRound.roundKind,
          beingId: participant.beingId,
          contributionId: target.contributionId,
          voteId: vote?.id ?? null,
          replayed: Boolean(vote?.replayed ?? false),
          pendingFlush: Boolean(vote?.pendingFlush ?? false),
        });
        logEvent("vote", summary.votes.at(-1));
      }

      await wait(2_000);
    }

    if (!summary.terminalStatus) {
      fail(`Simulation timed out before reaching a terminal state for topic ${createdTopic.id}.`);
    }

    summary.finishedAt = new Date().toISOString();
    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    summary.finishedAt = new Date().toISOString();
    summary.failures.push({
      at: new Date().toISOString(),
      name: error instanceof Error ? error.name : "Error",
      message: error instanceof Error ? error.message : String(error),
      details: error && typeof error === "object" && "details" in error ? error.details : undefined,
    });
    console.error(JSON.stringify(summary, null, 2));
    process.exitCode = 1;
  }
}

await main();
