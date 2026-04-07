#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

/**
 * test-debate-e2e.mjs â€” End-to-end debate test with 5 distinct agent personalities.
 *
 * Creates guest accounts, gives them personality profiles, creates a topic
 * with 1-minute cadence, and drives the full debate lifecycle:
 *   propose â†’ critique â†’ refine â†’ synthesize â†’ predict
 *
 * Tests: round instructions, categorical votes (most_interesting, most_correct,
 * fabrication), contribution stances, and round progression via sweep.
 *
 * Usage:
 *   node scripts/test-debate-e2e.mjs [--api-base-url URL] [--domain-id DOMAIN_ID]
 */

function readFlag(name, fallback) {
  const idx = process.argv.indexOf(name);
  return idx !== -1 && process.argv[idx + 1]
    ? process.argv[idx + 1]
    : fallback;
}

const API_BASE_URL = readFlag("--api-base-url", "https://api.opndomain.com");
const DOMAIN_ID = readFlag("--domain-id", "dom_game-theory");
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const LOG_DIR = path.resolve("logs");
const LOG_PATH = path.join(LOG_DIR, `test-debate-e2e-${RUN_ID}.log`);

// Admin credentials (clawdjarvis@gmail.com)
const ADMIN_CLIENT_ID = "cli_8308c04fc3a813a0e34435e08ec0c5f8";
const ADMIN_CLIENT_SECRET = "_1504zCRV7WRnBQ5dtZycHkcO7LxMsdC7P0Nkj5wTCM";

const PERSONALITIES = [
  {
    displayName: "Dr. Empirica",
    bio: "Data-driven policy analyst. Demands falsifiable claims and cites quantitative evidence. Skeptical of untested theory.",
    stance: "support",
    style: "empirical",
  },
  {
    displayName: "Marco the Contrarian",
    bio: "Philosophical gadfly. Stress-tests every consensus position and plays devil's advocate. Values intellectual honesty over agreement.",
    stance: "oppose",
    style: "contrarian",
  },
  {
    displayName: "Sage Synthesizer",
    bio: "Systems thinker who finds common ground between opposing positions. Focuses on second-order effects and implementation realities.",
    stance: "neutral",
    style: "synthesis",
  },
  {
    displayName: "Praxis the Pragmatist",
    bio: "Former city planner focused on what actually works in practice. Dismisses ivory-tower arguments in favor of real-world evidence.",
    stance: "support",
    style: "pragmatic",
  },
  {
    displayName: "Zara the Skeptic",
    bio: "Epistemologist who questions hidden assumptions and framing effects. Challenges the premises of arguments, not just their conclusions.",
    stance: "oppose",
    style: "skeptical",
  },
];

// Round-aware contribution bodies per personality style
const CONTRIBUTION_TEMPLATES = {
  propose: {
    empirical:
      "The evidence on centralized school matching shows a systematic gap between theoretical strategy-proofness and observed family behavior. Data from Boston's school choice reform (AbdulkadiroÄŸlu et al., 2005) found that even under a theoretically strategy-proof mechanism, 19% of families still ranked strategically based on perceived admission probabilities. A lottery-weighted system reduces the cognitive load and levels the information asymmetry, which in turn improves participation rates among lower-income families by approximately 12% according to NYC DOE data from 2018â€“2022.",
    contrarian:
      "The premise that lottery-based matching is 'simpler' deserves scrutiny. Randomness is not simplicity â€” it's merely a different kind of complexity that's harder for families to plan around. The optimal assignment mechanisms have decades of theoretical backing. Abandoning them because some families game the system is like removing traffic lights because some drivers run them. The real question is whether we're willing to invest in better information dissemination rather than retreating to randomness.",
    synthesis:
      "Both sides of this debate contain important truths that point to a hybrid approach. Complex assignment mechanisms genuinely improve match quality when participants understand them, but the assumption of universal comprehension fails in practice. The key insight is that mechanism design and information equity are not substitutes â€” they're complements. A phased approach that retains some optimization while increasing transparency could capture gains from both positions.",
    pragmatic:
      "Having worked with three different school districts during matching redesigns, I can tell you the theoretical debate misses the operational reality. In Cleveland's 2019 transition to a simplified lottery-plus-priority system, parent satisfaction scores rose 23% and the appeals process volume dropped by 40%. The practical lesson: families don't need optimal assignments â€” they need assignments they understand and trust. Trust drives participation more than efficiency.",
    skeptical:
      "Before debating lottery vs. optimization, we should question the framing itself. The premise assumes school assignment quality is primarily a mechanism design problem, but the literature shows that the quality gap between schools â€” not the matching process â€” drives most of the strategic behavior. If schools were more uniform in quality, the matching mechanism would matter far less. Are we solving the right problem?",
  },
  critique: {
    empirical:
      "Several claims in the opening round lack sufficient quantitative backing. The assertion about 12% participation improvement needs to control for concurrent policy changes in NYC during that period. Moreover, the Cleveland satisfaction data cited doesn't distinguish between satisfaction with the process and satisfaction with the outcome â€” a crucial distinction when evaluating mechanism changes.",
    contrarian:
      "The synthesis position commits the false compromise fallacy. Not every policy question has a meaningful middle ground. Either you optimize for match quality or you don't â€” a 'hybrid' that half-optimizes while half-randomizing may capture the worst of both worlds rather than the best. Additionally, the pragmatic argument confuses correlation with causation in the Cleveland case study.",
    synthesis:
      "Looking across the opening positions, I notice an unexamined assumption shared by both sides: that family preferences as stated are their true preferences. Behavioral economics research (Thaler & Sunstein, 2008) shows that stated preferences are heavily influenced by framing and default options. This means both the optimization and lottery camps may be optimizing for the wrong signal, which changes the cost-benefit analysis substantially.",
    pragmatic:
      "The empirical position makes an important point about data, but the 2005 Boston study is now over 20 years old. School choice landscapes have changed dramatically with charter expansion, magnet programs, and demographic shifts. We need contemporary evidence. The contrarian position's traffic light analogy also falls apart because traffic lights are binary while school matching involves ranked preferences â€” fundamentally different decision structures.",
    skeptical:
      "I want to challenge the implicit consequentialism in most arguments so far. We're treating this purely as an efficiency question, but there's a justice dimension that's been underweighted. A system where better-resourced families systematically get better outcomes isn't just inefficient â€” it's inequitable. The question isn't just 'which mechanism produces better matches' but 'better matches for whom?' This distributive question changes which evidence is relevant.",
  },
  refine: {
    empirical:
      "Fair critique on the NYC data â€” the 12% figure does need to be adjusted for concurrent policy changes. Updated analysis controlling for charter expansion shows a 7-9% improvement, which is still meaningful. On the Cleveland distinction between process and outcome satisfaction: the district did separate these in a 2020 follow-up survey, finding process satisfaction drove 65% of the overall improvement. I concede the Boston study is dated but note that more recent work from Denver (2021) shows similar patterns.",
    contrarian:
      "I accept that the traffic light analogy was imprecise, but the underlying point stands: retreating from complexity is not always wise. The hybrid compromise critique was challenged as a false compromise fallacy, but consider that Singapore's school matching system uses exactly such a hybrid â€” priority-based assignment with a random tiebreaker â€” and achieves both high satisfaction (87%) and good match quality. Perhaps my framing was too binary.",
    synthesis:
      "The critique about stated preferences is well-taken and I should sharpen my position. Rather than proposing a vague hybrid, I'll be more specific: a two-phase system where Phase 1 uses simplified priority rules that families can easily verify, and Phase 2 applies optimization only to unmatched students. This preserves transparency for the majority while capturing efficiency gains at the margin â€” addressing both the pragmatist's trust concerns and the empiricist's data demands.",
    pragmatic:
      "I concede that the Cleveland data alone isn't sufficient to generalize. But combining it with similar findings from Denver (2021) and Charlotte (2022) strengthens the pattern. Three different districts, three different demographic profiles, same directional result: simpler mechanisms correlate with higher participation and lower appeals. The skeptic's point about distributive justice is important â€” the practical evidence suggests simpler mechanisms disproportionately benefit lower-income families.",
    skeptical:
      "Several respondents engaged with my framing challenge, which is productive. I'll refine my position: the quality gap between schools is a necessary background condition for any matching mechanism evaluation. If we hold school quality constant (as we should in a mechanism comparison), then the empiricist's data on participation rates becomes more compelling. I was right to question the framing but wrong to suggest it invalidates the mechanism question entirely â€” it constrains which evidence is relevant, not whether the question matters.",
  },
  synthesize: {
    empirical:
      "After three rounds, the evidence converges on a clear finding: mechanism simplicity is instrumentally valuable because it improves participation and equity, but the size of this effect depends on the quality gap between schools. The strongest synthesis is: cities should invest in both school quality equalization AND mechanism simplification, but if forced to choose one intervention, the participation data (7-9% adjusted improvement) suggests mechanism reform has faster returns.",
    contrarian:
      "I entered this debate skeptical of lottery-based approaches and leave with a more nuanced view. The strongest argument for simpler mechanisms isn't simplicity per se â€” it's that they're more robust to the information asymmetries that actually exist. The Singapore example shows optimization and simplicity aren't strictly opposed. The debate has clarified that the real axis of disagreement is empirical (how much gaming occurs) rather than theoretical (which mechanism is better in principle).",
    synthesis:
      "The debate has produced genuine convergence on several points: (1) school quality gaps are the deeper problem, (2) simpler mechanisms improve participation among disadvantaged families, (3) some optimization is possible without sacrificing transparency. The remaining disagreement is about implementation sequencing. The two-phase approach I proposed has been refined by others' critiques into something more concrete and testable â€” a meaningful outcome.",
    pragmatic:
      "Three rounds of debate have moved us from abstract principles to actionable policy. The key synthesis: pilot the two-phase approach in a willing district, measure participation rates and match quality by income quintile, and let the data settle the theoretical disagreements. The most productive contribution was the skeptic's framing challenge â€” it forced everyone to specify what evidence would change their mind, which is exactly what good policy debate should do.",
    skeptical:
      "This debate demonstrated something important: mechanism choice is downstream of values, not just efficiency. The distributive justice question I raised was eventually taken up by most participants, which shifted the debate from 'what's optimal' to 'optimal for whom.' The empirical evidence presented is strongest when interpreted through this equity lens. My revised position: lottery-heavy matching is justified primarily on fairness grounds, with the participation improvements as a welcome secondary benefit.",
  },
  predict: {
    empirical:
      "Based on the evidence presented, I predict that within 5 years, at least 3 major US school districts will adopt simplified matching mechanisms with lottery components. The participation data is compelling enough to drive policy experimentation, and the political incentives align: simpler systems are easier to explain to voters. Confidence: 70%. The key uncertainty is whether the school quality gap will narrow enough to reduce the stakes of matching.",
    contrarian:
      "Prediction: the hybrid approach will win politically but underperform expectations. Districts will adopt two-phase systems as a compromise, but the optimization component will gradually expand as administrators seek to improve metrics, recreating the complexity problem within 3-5 years. Institutional incentives favor complexity because it creates expertise requirements that justify administrative roles. Confidence: 60%.",
    synthesis:
      "I predict the debate will be settled district-by-district rather than through a national consensus. Cities with larger school quality gaps will favor simpler mechanisms (because gaming is worse), while more uniform districts will retain optimization. The two-phase approach will be the modal choice for mid-sized districts. Within 10 years, the evidence base will be strong enough to end the theoretical debate. Confidence: 65%.",
    pragmatic:
      "Prediction: the first city to publicly pilot a simplified matching system post-2026 will see rapid adoption by 5+ other districts within 2 years, similar to the diffusion pattern of participatory budgeting. The bottleneck isn't evidence â€” it's political courage to be first. I predict Denver or Austin as most likely first movers given their existing reform orientation. Confidence: 55% on timing, 80% on rapid diffusion once started.",
    skeptical:
      "I predict the framing question I raised will become more salient as school choice expands. As more cities adopt choice programs, the equity implications of mechanism design will draw attention from civil rights organizations, shifting the debate from efficiency to justice. Within 5 years, 'equitable access' will replace 'optimal matching' as the dominant policy language. The mechanisms may not change quickly, but the evaluation criteria will. Confidence: 75%.",
  },
};

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function writeLine(line = "") {
  console.log(line);
  fs.appendFileSync(LOG_PATH, `${line}\n`);
}

function log(label, payload) {
  const time = new Date().toISOString().slice(11, 19);
  const rendered = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  writeLine(`[${time}] ${label}: ${rendered}`);
}

function logStep(msg) {
  writeLine(`\n${"=".repeat(60)}\n  ${msg}\n${"=".repeat(60)}`);
}

function summarizeByRound(rows, key) {
  return rows.reduce((acc, row) => {
    const roundKey = `${row.roundIndex}:${row.roundKind}`;
    const bucket = acc[roundKey] ?? {};
    bucket[row[key]] = (bucket[row[key]] ?? 0) + 1;
    acc[roundKey] = bucket;
    return acc;
  }, {});
}

function renderError(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack?.split("\n").slice(0, 6).join("\n"),
    };
  }
  return { message: String(error) };
}

async function api(path, options = {}) {
  const { method = "GET", token, body, expectedStatus = 200, logRequest = false, logLabel = null } = options;
  const url = `${API_BASE_URL}${path}`;
  const headers = {
    accept: "application/json",
    ...(body ? { "content-type": "application/json" } : {}),
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
  const startedAt = Date.now();

  if (logRequest) {
    log(logLabel ?? "api-request", {
      method,
      path,
      body,
    });
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${method} ${path} returned non-JSON: ${text.slice(0, 200)}`);
  }

  const expectedStatuses = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
  if (!expectedStatuses.includes(response.status)) {
    const code = parsed?.code ?? parsed?.error ?? "unknown";
    const message = parsed?.message ?? `HTTP ${response.status}`;
    log(logLabel ?? "api-error", {
      method,
      path,
      status: response.status,
      durationMs: Date.now() - startedAt,
      code,
      message,
      details: parsed?.details ?? {},
    });
    throw new Error(`${method} ${path} failed (${response.status}) ${code}: ${message}\n${JSON.stringify(parsed?.details ?? {}, null, 2)}`);
  }

  if (logRequest) {
    log(logLabel ?? "api-response", {
      method,
      path,
      status: response.status,
      durationMs: Date.now() - startedAt,
      data: parsed?.data ?? parsed,
    });
  }

  return parsed.data ?? parsed;
}

function idempotencyKey(parts) {
  return parts
    .map((p) => String(p).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""))
    .filter(Boolean)
    .join("-")
    .slice(0, 120);
}

async function main() {
  const startedAt = Date.now();
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.writeFileSync(LOG_PATH, "");
  logStep("Run metadata");
  log("run", {
    runId: RUN_ID,
    logPath: LOG_PATH,
    apiBaseUrl: API_BASE_URL,
    domainId: DOMAIN_ID,
    startedAt: new Date(startedAt).toISOString(),
  });

  // ---- Step 1: Admin token ----
  logStep("Step 1: Authenticate admin");
  const adminTokenData = await api("/v1/auth/token", {
    method: "POST",
    body: { grantType: "client_credentials", clientId: ADMIN_CLIENT_ID, clientSecret: ADMIN_CLIENT_SECRET },
    logRequest: true,
    logLabel: "admin-auth",
  });
  const adminToken = adminTokenData.accessToken;
  log("admin", { agentId: adminTokenData.agent.id, email: adminTokenData.agent.email });

  // ---- Step 2: Create 5 guest agents with personalities ----
  logStep("Step 2: Create 5 guest agents with distinct personalities");
  const participants = [];
  for (let i = 0; i < 5; i++) {
    const personality = PERSONALITIES[i];
    const guest = await api("/v1/auth/guest", {
      method: "POST",
      expectedStatus: 201,
      logRequest: true,
      logLabel: `guest-create-${i + 1}`,
    });

    // Update being profile with personality
    await api(`/v1/beings/${guest.being.id}`, {
      method: "PATCH",
      token: guest.accessToken,
      body: { displayName: personality.displayName, bio: personality.bio },
      logRequest: true,
      logLabel: `guest-profile-${i + 1}`,
    });

    participants.push({
      index: i,
      agentId: guest.agent.id,
      beingId: guest.being.id,
      handle: guest.being.handle,
      displayName: personality.displayName,
      stance: personality.stance,
      style: personality.style,
      accessToken: guest.accessToken,
    });
    log(`agent-${i + 1}`, { displayName: personality.displayName, beingId: guest.being.id, handle: guest.being.handle });
  }

  // ---- Step 3: Create a new topic with 1-min cadence ----
  logStep("Step 3: Create debate topic with 1-min cadence");
  const topic = await api("/v1/internal/topics", {
    method: "POST",
    token: adminToken,
    expectedStatus: 201,
    body: {
      domainId: DOMAIN_ID,
      title: "[E2E Test] Lottery vs Optimal School Matching â€” Round Instructions & Categorical Votes",
      prompt:
        "Should cities prefer lottery-based school matching over optimized assignment mechanisms? Test the full debate lifecycle with round instructions, categorical votes, and 5 distinct agent personalities.",
      templateId: "debate",
      topicFormat: "scheduled_research",
      cadenceOverrideMinutes: 2,
      topicSource: "cron_auto",
      reason: "E2E test of round instructions and categorical vote flow",
    },
    logRequest: true,
    logLabel: "topic-create",
  });
  log("topic-created", { id: topic.id, status: topic.status, rounds: topic.rounds.length, template: topic.templateId });
  log("topic-url", `${API_BASE_URL.replace("api.", "")}/topics/${topic.id}`);

  // ---- Step 4: Set timing and join window ----
  logStep("Step 4: Set timing and join all 5 agents");
  const joinUntil = new Date(Date.now() + 30_000).toISOString();
  const startsAt = new Date(Date.now() + 45_000).toISOString();
  await api(`/v1/topics/${topic.id}`, {
    method: "PATCH",
    token: adminToken,
    body: { startsAt, joinUntil },
    logRequest: true,
    logLabel: "topic-timing",
  });
  log("timing", { startsAt, joinUntil });

  for (const p of participants) {
    await api(`/v1/topics/${topic.id}/join`, {
      method: "POST",
      token: p.accessToken,
      body: { beingId: p.beingId },
      logRequest: true,
      logLabel: `join-${p.displayName}`,
    });
    log("joined", { displayName: p.displayName, beingId: p.beingId });
  }

  // ---- Step 5: Drive the debate loop ----
  logStep("Step 5: Drive debate through all rounds");
  const contributionKeys = new Set();
  const voteKeys = new Set();
  let lastTransitionKey = null;
  const deadlineMs = Date.now() + 30 * 60_000; // 30 minute max
  let sweepCount = 0;
  const roundInstructions = {};
  const allVotes = [];
  const allContributions = [];
  let loopCount = 0;

  while (Date.now() < deadlineMs) {
    loopCount++;
    // Sweep to advance lifecycle
    const sweep = await api("/v1/internal/topics/sweep", {
      method: "POST",
      token: adminToken,
      body: {},
      logRequest: loopCount === 1 || sweepCount % 5 === 0,
      logLabel: "sweep",
    });
    sweepCount++;
    if (sweep?.mutatedTopicIds?.length > 0) {
      log("sweep", { count: sweepCount, mutated: sweep.mutatedTopicIds });
    }

    // Fetch context for all participants
    const contexts = await Promise.all(
      participants.map((p) =>
        api(`/v1/topics/${topic.id}/context?beingId=${encodeURIComponent(p.beingId)}`, {
          token: p.accessToken,
        }).then((context) => ({ participant: p, context })),
      ),
    );

    const canonical = contexts[0]?.context;
    if (!canonical || typeof canonical.status !== "string") {
      throw new Error("Context response missing status");
    }

    if (loopCount === 1 || loopCount % 5 === 0) {
      log("loop-summary", {
        loopCount,
        sweepCount,
        topicId: topic.id,
        status: canonical.status,
        currentRoundId: canonical.currentRound?.id ?? null,
        currentRoundKind: canonical.currentRound?.roundKind ?? null,
        activeParticipants: contexts.length,
        contributionsByRound: summarizeByRound(allContributions, "displayName"),
        votesByRound: summarizeByRound(allVotes, "voteKind"),
      });
    }

    const transitionKey = `${canonical.status}:${canonical.currentRound?.id ?? "none"}:${canonical.currentRound?.sequenceIndex ?? -1}`;
    if (transitionKey !== lastTransitionKey) {
      lastTransitionKey = transitionKey;
      log("transition", {
        status: canonical.status,
        roundIndex: canonical.currentRound?.sequenceIndex ?? null,
        roundKind: canonical.currentRound?.roundKind ?? null,
      });

      // Log round instructions when a new round opens
      if (canonical.currentRoundConfig?.roundInstruction) {
        const ri = canonical.currentRoundConfig.roundInstruction;
        const roundKind = canonical.currentRound?.roundKind ?? "unknown";
        roundInstructions[roundKind] = ri;
        log(`round-instruction [${roundKind}]`, {
          goal: ri.goal,
          guidance: ri.guidance?.slice(0, 80) + "...",
          qualityCriteria: ri.qualityCriteria?.length ?? 0,
          hasPriorContext: Boolean(ri.priorRoundContext),
        });
      }

      // Log voting obligation
      if (canonical.votingObligation) {
        log("voting-obligation", canonical.votingObligation);
      }
    }

    // Terminal states
    if (canonical.status === "closed" || canonical.status === "stalled") {
      log("terminal", { status: canonical.status });
      break;
    }

    // Process each participant
    for (const { participant, context } of contexts) {
      const currentRound = context.currentRound;
      if (!currentRound || context.status !== "started") continue;

      const roundKind = currentRound.roundKind;
      const contributionKey = `${participant.beingId}:${currentRound.id}`;

      // ---- Submit contribution ----
      if (!contributionKeys.has(contributionKey) && (!Array.isArray(context.ownContributionStatus) || context.ownContributionStatus.length === 0)) {
        const body = CONTRIBUTION_TEMPLATES[roundKind]?.[participant.style]
          ?? `${participant.displayName} responds in ${roundKind} round with characteristic ${participant.style} perspective.`;
        log("contribution-attempt", {
          who: participant.displayName,
          round: roundKind,
          roundId: currentRound.id,
          stance: participant.stance,
          bodyPreview: body.slice(0, 160),
        });

        try {
          const contribution = await api(`/v1/topics/${topic.id}/contributions`, {
            method: "POST",
            token: participant.accessToken,
            expectedStatus: [200, 201],
            body: {
              beingId: participant.beingId,
              body,
              stance: participant.stance,
              idempotencyKey: idempotencyKey(["e2e", "contrib", topic.id.slice(-12), currentRound.id.slice(-12), participant.beingId.slice(-12)]),
            },
            logRequest: true,
            logLabel: `contribution-${participant.displayName}-${roundKind}`,
          });
          contributionKeys.add(contributionKey);
          allContributions.push({
            roundKind,
            roundIndex: currentRound.sequenceIndex,
            displayName: participant.displayName,
            contributionId: contribution?.id ?? "pending",
            stance: participant.stance,
          });
          log("contribution", {
            who: participant.displayName,
            round: roundKind,
            stance: participant.stance,
            id: contribution?.id ?? "pending",
          });
        } catch (err) {
          log("contribution-failed", {
            who: participant.displayName,
            round: roundKind,
            error: renderError(err),
          });
          contributionKeys.add(contributionKey); // don't retry
          continue;
        }
      }

      // ---- Cast categorical votes ----
      const refreshedContext = await api(`/v1/topics/${topic.id}/context?beingId=${participant.beingId}`, {
        token: participant.accessToken,
      });
      const voteRequired = Boolean(refreshedContext.currentRoundConfig?.voteRequired);
      const voteTargets = Array.isArray(refreshedContext.voteTargets) ? refreshedContext.voteTargets : [];
      log("vote-context", {
        who: participant.displayName,
        round: roundKind,
        roundId: currentRound.id,
        voteRequired,
        voteTargets: voteTargets.map((target) => ({
          contributionId: target.contributionId,
          beingId: target.beingId,
          beingHandle: target.beingHandle ?? null,
        })),
      });
      if (!voteRequired || voteTargets.length === 0) continue;

      // Get other participants' contributions as vote targets
      const othersTargets = voteTargets.filter((t) => t.beingId !== participant.beingId);
      if (othersTargets.length === 0) continue;

      // Cast each vote kind on a different target contribution
      const voteKinds = ["most_interesting", "most_correct", "fabrication"];
      for (let ki = 0; ki < voteKinds.length; ki++) {
        const voteKind = voteKinds[ki];
        const voteKey = `${participant.beingId}:${currentRound.id}:${voteKind}`;
        if (voteKeys.has(voteKey)) continue;

        // Pick a target â€” each kind targets a different contribution if possible
        const target = othersTargets[ki % othersTargets.length];
        log("vote-attempt", {
          who: participant.displayName,
          round: roundKind,
          roundId: currentRound.id,
          voteKind,
          targetContributionId: target.contributionId,
          targetBeingId: target.beingId,
          targetHandle: target.beingHandle ?? null,
        });

        try {
          const vote = await api(`/v1/topics/${topic.id}/votes`, {
            method: "POST",
            token: participant.accessToken,
            expectedStatus: [200, 201],
            body: {
              beingId: participant.beingId,
              contributionId: target.contributionId,
              voteKind,
              idempotencyKey: idempotencyKey(["e2e", voteKind, topic.id.slice(-12), refreshedContext.currentRound.id.slice(-12), participant.beingId.slice(-12)]),
            },
            logRequest: true,
            logLabel: `vote-${participant.displayName}-${voteKind}`,
          });
          voteKeys.add(voteKey);
          allVotes.push({
            roundKind,
            roundIndex: currentRound.sequenceIndex,
            voter: participant.displayName,
            voteKind,
            targetBeingId: target.beingId,
            targetContributionId: target.contributionId,
          });
          log("vote", {
            who: participant.displayName,
            kind: voteKind,
            target: target.beingHandle ?? target.beingId,
            replayed: Boolean(vote?.replayed),
            voteId: vote?.id ?? null,
            pendingFlush: vote?.pendingFlush ?? null,
            weight: vote?.weight ?? null,
          });
        } catch (err) {
          // 3-distinct rule or max-votes may block some combinations â€” expected
          log("vote-blocked", {
            who: participant.displayName,
            kind: voteKind,
            round: roundKind,
            targetContributionId: target.contributionId,
            error: renderError(err),
          });
        }
      }
    }

    await wait(3_000);
  }

  // ---- Step 6: Fetch report if closed ----
  logStep("Step 6: Results");

  const finalContext = await api(`/v1/topics/${topic.id}/context?beingId=${encodeURIComponent(participants[0].beingId)}`, {
    token: participants[0].accessToken,
  });

  log("final-status", finalContext.status);
  log("contributions-total", allContributions.length);
  log("votes-total", allVotes.length);
  log("round-instructions-collected", Object.keys(roundInstructions));
  log("contributions-by-round", summarizeByRound(allContributions, "displayName"));
  log("votes-by-round", summarizeByRound(allVotes, "voteKind"));

  if (finalContext.status === "closed") {
    try {
      const report = await api(`/v1/internal/admin/topics/${topic.id}/report`, { token: adminToken });
      log("report", report);
    } catch (err) {
      log("report-error", err.message);
    }
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  logStep(`Complete â€” ${elapsed}s elapsed`);
  writeLine(`
SUMMARY:
  Topic:          ${topic.id}
  Template:       debate
  Agents:         ${participants.map((p) => p.displayName).join(", ")}
  Contributions:  ${allContributions.length}
  Votes:          ${allVotes.length}
  Round Instrs:   ${Object.keys(roundInstructions).join(", ") || "none collected"}
  Final Status:   ${finalContext.status}
  URL:            ${API_BASE_URL.replace("api.", "")}/topics/${topic.id}
  Log File:       ${LOG_PATH}
  `);

  if (finalContext.status !== "closed") {
    console.error("WARNING: Topic did not reach closed state within timeout.");
    process.exitCode = 1;
  }
}

main().catch((err) => {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_PATH, `[FATAL] ${JSON.stringify(renderError(err), null, 2)}\n`);
  } catch {}
  console.error("FATAL:", err);
  process.exitCode = 1;
});
