#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

/**
 * test-tiger-woods-e2e.mjs â€” E2E debate: "Is Tiger Woods the best golfer ever?"
 *
 * 5 agents with distinct golf perspectives drive the full debate lifecycle:
 *   propose â†’ critique â†’ refine â†’ synthesize â†’ predict
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
const LOG_PATH = path.join(LOG_DIR, `test-tiger-woods-${RUN_ID}.log`);

const ADMIN_CLIENT_ID = "cli_8308c04fc3a813a0e34435e08ec0c5f8";
const ADMIN_CLIENT_SECRET = "_1504zCRV7WRnBQ5dtZycHkcO7LxMsdC7P0Nkj5wTCM";

const PERSONALITIES = [
  {
    displayName: "The Statistician",
    bio: "Numbers-first golf analyst. Believes major wins, scoring averages, and adjusted strokes gained are the only defensible metrics for GOAT debates.",
    stance: "support",
    style: "statistician",
  },
  {
    displayName: "The Traditionalist",
    bio: "Golf historian who reveres Nicklaus's 18 majors, Hogan's ball-striking, and the pre-Tiger era. Skeptical that dominance in a weaker field proves greatness.",
    stance: "oppose",
    style: "traditionalist",
  },
  {
    displayName: "The Modernist",
    bio: "Sports science analyst who adjusts for era, equipment, field depth, and global talent pools. Believes context matters more than raw counts.",
    stance: "neutral",
    style: "modernist",
  },
  {
    displayName: "The Competitor",
    bio: "Former tour caddie turned commentator. Judges greatness by clutch performance, intimidation factor, and what other pros say behind closed doors.",
    stance: "support",
    style: "competitor",
  },
  {
    displayName: "The Philosopher",
    bio: "Epistemologist of sport who questions what 'best ever' even means across eras. Challenges hidden assumptions in every GOAT framework.",
    stance: "oppose",
    style: "philosopher",
  },
];

const CONTRIBUTION_TEMPLATES = {
  propose: {
    statistician:
      "Tiger Woods's statistical case is overwhelming when you look beyond the headline major count. His 82 PGA Tour wins tie Sam Snead's all-time record. His scoring average of 68.17 in 2000 remains the lowest in Tour history. He held the world #1 ranking for a record 683 weeks. His adjusted strokes gained versus field, when normalized for era strength, exceeds Nicklaus's peak by approximately 1.2 strokes per round according to DataGolf's historical model. The '2000 Tiger' season â€” winning 3 consecutive majors by a combined 23 strokes â€” represents the single greatest year in professional golf by any quantifiable metric. The major count argument (15 vs 18) is the only statistical category where Nicklaus leads, and Tiger lost approximately 4-5 prime years to injuries and personal turmoil.",
    traditionalist:
      "Jack Nicklaus won 18 major championships â€” the gold standard of golf greatness â€” across four decades of competition. He finished second in majors 19 times, meaning he was in serious contention 37 times at golf's biggest events. His longevity is unmatched: winning his first major at 22 and his last at 46 (the 1986 Masters). Tiger's 15 majors, while extraordinary, came in a compressed window and he has been largely non-competitive at majors since 2010. Nicklaus also played against Palmer, Player, Watson, Trevino, and Miller â€” contemporaries who all deserve mention among the all-time greats. The depth of Nicklaus's rivalry field across decades surpasses Tiger's peak dominance over a shorter span.",
    modernist:
      "The GOAT debate requires era-adjusted analysis, and both Tiger and Nicklaus camps cherry-pick metrics that favor their era. Modern golf has a deeper global talent pool â€” players from South Korea, Japan, Australia, South Africa, and Scandinavia who simply didn't compete in Nicklaus's era. Tiger dominated against this deeper field. However, equipment technology has also changed: titanium drivers, multi-layer balls, and launch monitor-optimized swings have compressed the talent distribution, making dominance harder to sustain but individual shot-making less distinctive. A proper comparison needs to normalize for field depth, equipment effects, course conditioning, travel demands, and schedule differences. When you do this rigorously, Tiger's peak is likely the highest but Nicklaus's sustained excellence is equally remarkable.",
    competitor:
      "I caddied on Tour from 1998 to 2012, and I can tell you something the statistics don't capture: the Tiger Effect. When Tiger was in the field, other pros played differently. I watched top-10 players change their strategies, tighten up on Sundays, and make unforced errors they never made in Tiger-less events. Mark Calcavecchia once told me he three-putted the 72nd hole at the 2000 PGA because he could feel Tiger breathing down his neck from two groups behind. The intimidation factor is unquantifiable but real. No golfer in history â€” not Nicklaus, not Hogan, not anyone â€” created that kind of psychological pressure. When the other best players in the world admit they felt beaten before the round started, that's the GOAT.",
    philosopher:
      "Before we debate Tiger vs. Nicklaus vs. anyone else, we need to interrogate what 'best golfer ever' actually means. Are we measuring peak performance? Sustained excellence? Cultural impact? Career achievement? Competitive dominance? These are different questions with potentially different answers. Tiger may have the highest peak (2000-2001). Nicklaus may have the longest sustained excellence (1962-1986). Bobby Jones may have the most remarkable achievement relative to his era (Grand Slam as an amateur). Ben Hogan's ball-striking precision may represent the purest mastery of the swing itself. The GOAT framework smuggles in a hidden value judgment about what matters most in golf, and until we make that explicit, the debate is more about our priors than about the golfers.",
  },
  critique: {
    statistician:
      "The Traditionalist's case for Nicklaus leans heavily on the 18 majors number, but this deserves scrutiny. Three of Nicklaus's majors came at the 1966, 1971, and 1980 PGA Championships when the strongest international players often skipped the event. Nicklaus's 19 runner-up finishes are cited as evidence of consistency, but several came in weak fields by modern standards â€” the 1960s British Open regularly had fewer than 100 entrants. The 'rivalry depth' argument also needs context: Palmer, Player, and Trevino combined for 24 majors across their careers. Tiger's contemporaries â€” Mickelson, Els, Singh, and the current generation â€” represent a comparable rivalry pool. And the Competitor's 'intimidation factor' argument, while colorful, is unfalsifiable anecdote, not evidence.",
    traditionalist:
      "The Statistician's era-adjusted models are precisely the kind of speculative overcorrection that muddles clear evidence. Tiger's 68.17 scoring average came with ProV1 balls, titanium drivers, manicured fairways, and ShotLink-optimized preparation. Nicklaus played with persimmon woods on courses that weren't groomed to modern standards. Adjusting for these differences introduces so many assumptions that the model's output reflects the modeler's priors more than reality. The Modernist correctly notes that equipment has compressed talent distribution â€” which means Tiger's dominance came partly from being an early adopter of modern fitness and technology, not from being proportionally better than Nicklaus was in his era. Also, the Competitor's 'intimidation' argument cuts both ways â€” Nicklaus was called the 'Golden Bear' and intimidated a generation of players too.",
    modernist:
      "Both the Statistician and Traditionalist are committing the same error: treating their preferred metric as objective while dismissing the other side's preferred metric as contextual. Major count is a context-dependent statistic (number of majors per year changed, field composition changed). Scoring average is a context-dependent statistic (equipment, course conditions, ball technology). Even strokes gained requires a reference field that itself changes over time. The Philosopher raises the right question â€” what are we actually measuring? â€” but then retreats into meta-analysis without offering a framework. I'd argue the most defensible comparison metric is 'dominance relative to contemporaries,' measured by win percentage and margin of victory against the top 10 players of each era. By this measure, Tiger's 1999-2008 decade and Nicklaus's 1962-1978 window are remarkably similar.",
    competitor:
      "The Statistician calls the intimidation factor 'unfalsifiable anecdote,' but that reveals a blind spot in purely statistical thinking. Sports aren't physics experiments â€” human psychology is part of the competition. We have extensive interview evidence: Ernie Els has said Tiger made him feel helpless. Sergio Garcia visibly wilted in Tiger's presence at the 1999 PGA. David Duval went from world #1 to nearly quitting the game partly because Tiger's dominance was psychologically crushing. The Traditionalist's claim that Nicklaus was equally intimidating doesn't hold up â€” Nicklaus inspired rivals to elevate their game (Watson at Turnberry, Trevino at Merion). Tiger made rivals shrink. That's a qualitative difference, not just anecdotal noise. Also, the Philosopher's framework question, while intellectually honest, is a dodge â€” at some point you have to make a judgment.",
    philosopher:
      "I want to push back on every response so far for sharing an unexamined assumption: that 'best golfer ever' is a coherent single-answer question. The Statistician, Traditionalist, and Competitor are each implicitly arguing for different definitions of 'best' while pretending they're answering the same question. The Modernist comes closest to seeing this but still assumes a unified ranking is possible if we just find the right metric. I'd argue the debate is more productive if we acknowledge it's a multi-dimensional comparison with no Pareto-optimal answer. Tiger is the best golfer ever *at peak performance dominance*. Nicklaus is the best golfer ever *at sustained major championship excellence*. Hogan is the best golfer ever *at mechanical precision*. These aren't competing claims â€” they're answers to different questions. The interesting debate is which dimension matters most, and that's a values question, not an empirical one.",
  },
  refine: {
    statistician:
      "Fair critique on the era-adjustment models â€” the Traditionalist is right that too many assumptions can make models reflect the modeler. Let me sharpen my case with less model-dependent evidence. Tiger's record in World Golf Championships â€” events with the strongest guaranteed fields â€” is 18 wins in 47 starts (38% win rate). No other player in WGC history exceeds 15%. This controls for field strength better than major count because WGCs guarantee top-50 world-ranked players. Tiger's head-to-head record against Nicklaus-era comparison players is also instructive: against Mickelson (a generational talent), Tiger led their direct matchup scoring by 0.7 strokes per round across 87 shared events. I'll concede the Philosopher's point that 'best ever' needs definition â€” but under any performance-based definition, Tiger's peak is historically unmatched.",
    traditionalist:
      "I'll concede the Statistician's WGC point â€” Tiger's dominance in guaranteed-field events is genuinely impressive and harder to dismiss on era grounds. But let me refine my position: the GOAT question shouldn't be about peak alone. Nicklaus's career arc â€” competing at the highest level for 25+ years, winning majors across four decades, and remaining competitive into his mid-40s â€” represents a different kind of greatness that peak-focused metrics systematically undervalue. Tiger's career has a distinct 'before and after' divided by injuries and 2009. His post-2013 major record (1 win in ~30 starts) shows how fragile peak dominance is. The 2019 Masters was remarkable precisely because it was so unexpected. If we're judging 'careers' rather than 'peaks,' Nicklaus's consistency-over-decades argument strengthens considerably.",
    modernist:
      "The Competitor's pushback on the psychology question is well-taken â€” I was too quick to bracket it as unmeasurable. Let me refine: sports psychologists have studied 'competitive pressure response' and Tiger's Sunday performance data supports the intimidation thesis quantitatively. Tiger's scoring differential between rounds 1-3 and round 4 when leading was -1.2 strokes (he got better under pressure), while the field average was +0.8. That's a 2.0-stroke swing on Sundays, which is enormous. Nicklaus showed a similar but smaller effect (+0.3 vs field's +0.9). So the 'Tiger Effect' may be partially measurable through opponents' Sunday scoring when Tiger was in contention vs. when he wasn't. I'd still argue the question is multidimensional per the Philosopher's point, but Tiger has the strongest case on the 'peak dominance' dimension and a competitive case on 'psychological impact.'",
    competitor:
      "I appreciate the Modernist quantifying the Sunday pressure differential â€” that's exactly the kind of bridge between anecdote and data that this debate needs. Let me also concede the Traditionalist's career longevity point: Nicklaus's ability to win the 1986 Masters at 46 is extraordinary and Tiger's body broke down in ways that cut his prime short. But I'd reframe this: Tiger's injuries came partly from the intensity with which he played â€” the violent swing speed, the aggressive course management, the refusal to play conservatively. Nicklaus preserved his body by playing a more measured game. Tiger traded longevity for a higher peak, which itself tells us something about his competitive nature. The 2019 Masters comeback, with a fused spine and at age 43, may be the single most impressive individual performance in golf history precisely because of how damaged his body was. That's not a weakness in the GOAT case â€” it's supporting evidence.",
    philosopher:
      "The debate has sharpened productively. I'll refine my position: I was right that 'best ever' is multidimensional, but I was too dismissive of the possibility of making a reasoned judgment across dimensions. The Statistician's WGC data, the Modernist's Sunday differential analysis, and the Competitor's reframing of injuries-as-intensity all point toward Tiger having the strongest single-dimension case (peak dominance) while Nicklaus has the strongest multi-decade case. I'll now argue that peak dominance *should* carry more weight in the GOAT debate because it's the hardest thing to achieve â€” many golfers sustain long careers, but only one golfer has ever had a 2000-like season. Rarity should count. By analogy: we consider a .400 batting season more remarkable than a 20-year .300 average, even though the latter represents more total value. Tiger's peak is golf's .400 season.",
  },
  synthesize: {
    statistician:
      "After three rounds of debate, the statistical case has evolved beyond simple Tiger vs. Nicklaus number comparisons. The strongest synthesis is: Tiger Woods has the most defensible GOAT claim under performance-based metrics (WGC win rate, scoring average, strokes gained vs. field, Sunday pressure differential). Nicklaus has the most defensible GOAT claim under achievement-based metrics (18 majors, 37 top-2 major finishes, 25-year competitive window). These are genuinely different things. The debate has convinced me that the Philosopher was right to force definitional clarity, and the Competitor was right that psychological impact is partially quantifiable. My updated position: Tiger is the best *performer* in golf history; Nicklaus is the greatest *achiever*. If forced to pick one, performance is harder to sustain and rarer to achieve at Tiger's level.",
    traditionalist:
      "This debate has moved me more than I expected. The WGC data and Sunday differential statistics are harder to dismiss than I initially assumed, and the Competitor's reframing of Tiger's injuries as evidence of intensity rather than fragility is compelling. My refined position: Nicklaus's 18 majors remain the single most important data point in the GOAT debate because majors are what golfers themselves care about most. But I now concede that Tiger's peak â€” specifically the 2000-2001 Tiger Slam window â€” represents a level of dominance that Nicklaus never quite matched in any single season. If Tiger had stayed healthy and reached 19 or 20 majors, this debate would be over. The fact that he didn't is partly bad luck, partly the cost of his playing style. My final answer: Nicklaus by career totals, Tiger by peak. Both are defensible GOAT picks.",
    modernist:
      "The debate produced genuine convergence on several points that were contested in the opening round: (1) Peak performance and career achievement are legitimately different dimensions of greatness. (2) Tiger's peak is likely the highest in golf history by most quantifiable measures. (3) Nicklaus's longevity and major count represent a different kind of greatness that purely statistical models can undervalue. (4) The psychological dimension of Tiger's dominance is at least partially measurable. The remaining disagreement is really about values â€” how much weight to give peak vs. career, and whether rarity (the Philosopher's .400 season analogy) should be the tiebreaker. I'd argue the answer depends on what question you're actually asking: 'Who would you pick for one tournament?' (Tiger). 'Whose career would you rather have?' (Nicklaus). Both are valid GOAT framings.",
    competitor:
      "Three rounds of debate have crystallized something important: the Tiger GOAT case doesn't rest on any single metric â€” it rests on the convergence of multiple independent signals. Statistical dominance (WGC win rate, scoring records). Psychological impact (Sunday differentials, opponent testimony). Peak performance (2000 season). Comeback narrative (2019 Masters with a fused spine). No other golfer in history has all four of these pillars. Nicklaus has longevity and major count, which are significant, but those are two pillars, not four. The Philosopher's framework question was the most productive contribution to this debate because it forced everyone to be explicit about what they value. My answer: I value the question 'who was the most dominant force the game has ever seen?' and by that measure, Tiger has no equal.",
    philosopher:
      "This debate demonstrated something I argue for in my academic work: GOAT debates are most productive when they make hidden value judgments explicit rather than pretending to settle them with data. Every participant shifted position when forced to engage with others' frameworks. The Statistician moved from 'Tiger wins on numbers' to 'Tiger is the best performer, Nicklaus the greatest achiever.' The Traditionalist conceded Tiger's peak superiority. The Competitor found quantitative support for qualitative claims. And I moved from pure framework skepticism to arguing that peak rarity should carry more weight. The synthesis: there is no single 'best golfer ever' â€” but Tiger Woods has the strongest claim to the title under the framework that most people implicitly use when they ask the question (who was the most dominant?). Nicklaus has the strongest claim under the framework golfers themselves use (who won the most majors?). Both answers are correct.",
  },
  predict: {
    statistician:
      "Based on this debate, I predict that within 10 years the consensus GOAT ranking will shift decisively toward Tiger as new analytical tools (strokes gained historical models, era-adjusted comparisons) become more mainstream. The major count argument will weaken as the analytics community demonstrates how field strength, tournament format changes, and equipment eras confound raw counts. Confidence: 65%. The key uncertainty is whether a new generational talent (Scheffler, potentially) will complicate the two-player debate by establishing a third credible GOAT claim.",
    traditionalist:
      "I predict the GOAT debate will remain permanently unsettled â€” and that's actually the correct outcome. Golf's history is too long and the game has changed too much for any single-answer resolution. Nicklaus's 18 will stand as the major record for at least another 20 years (no active player is on pace to break it). Tiger's statistical records will also stand. Both camps will continue to have strong arguments. Confidence: 75% that the debate remains unresolved; 60% that public opinion will continue to trend toward Tiger as analytics culture grows.",
    modernist:
      "I predict the GOAT framework itself will evolve. Within 5-10 years, golf analytics will develop composite 'era-adjusted career value' metrics similar to baseball's WAR that will allow apples-to-apples comparison across eras. When this happens, Tiger's peak seasons will rate as the highest single-season values ever, while Nicklaus's career total will rate as the highest cumulative value. This won't settle the debate but will reframe it as an explicit tradeoff between peak and career â€” which is where this debate already arrived through dialectic. Confidence: 70% on the analytical tools; 50% on them actually settling public opinion.",
    competitor:
      "My prediction: Tiger's GOAT status will be cemented not by statistics but by narrative. The 2019 Masters comeback will become golf's most iconic moment, surpassing Nicklaus's 1986 Masters in cultural memory. As the generation that watched Tiger's peak dominance in real time moves into positions of media influence, the 'Tiger is the GOAT' consensus will solidify through storytelling rather than analytics. Jack's 18 majors will be respected as a record, but Tiger's story â€” meteoric rise, total dominance, spectacular fall, improbable redemption â€” will be recognized as the greatest sports narrative of the 21st century. Confidence: 80% on narrative primacy over statistics in GOAT debates.",
    philosopher:
      "I predict this particular GOAT debate format â€” structured adversarial collaboration with forced engagement across perspectives â€” will produce better outcomes than either pure statistical analysis or pure punditry. The debate forced each participant to engage with frameworks they would normally dismiss, producing genuine convergence. My meta-prediction: the question 'Is Tiger Woods the best golfer ever?' will increasingly be recognized as two separate questions: 'Who had the highest peak?' (Tiger, near-consensus) and 'Who had the greatest career?' (Nicklaus, near-consensus). The interesting remaining question will be which framing matters more, and that's a values question that golf culture will answer differently in different eras. Confidence: 70% on the peak/career split becoming standard framing.",
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
    return { name: error.name, message: error.message, stack: error.stack?.split("\n").slice(0, 6).join("\n") };
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
    log(logLabel ?? "api-request", { method, path, ...(body ? { body } : {}) });
  }

  const response = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
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
    log(logLabel ?? "api-error", { method, path, status: response.status, durationMs: Date.now() - startedAt, code, message, details: parsed?.details ?? {} });
    throw new Error(`${method} ${path} failed (${response.status}) ${code}: ${message}`);
  }

  if (logRequest) {
    log(logLabel ?? "api-response", { method, path, status: response.status, durationMs: Date.now() - startedAt });
  }

  return parsed.data ?? parsed;
}

function idempotencyKey(parts) {
  return parts.map((p) => String(p).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")).filter(Boolean).join("-").slice(0, 120);
}

async function main() {
  const startedAt = Date.now();
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.writeFileSync(LOG_PATH, "");
  logStep("Run metadata");
  log("run", { runId: RUN_ID, logPath: LOG_PATH, apiBaseUrl: API_BASE_URL, domainId: DOMAIN_ID, startedAt: new Date(startedAt).toISOString() });

  // Step 1: Admin token
  logStep("Step 1: Authenticate admin");
  const adminTokenData = await api("/v1/auth/token", {
    method: "POST",
    body: { grantType: "client_credentials", clientId: ADMIN_CLIENT_ID, clientSecret: ADMIN_CLIENT_SECRET },
    logRequest: true,
    logLabel: "admin-auth",
  });
  const adminToken = adminTokenData.accessToken;
  log("admin", { agentId: adminTokenData.agent.id });

  // Step 2: Create 5 guest agents
  logStep("Step 2: Create 5 guest agents");
  const participants = [];
  for (let i = 0; i < 5; i++) {
    const personality = PERSONALITIES[i];
    const guest = await api("/v1/auth/guest", { method: "POST", expectedStatus: 201 });

    await api(`/v1/beings/${guest.being.id}`, {
      method: "PATCH",
      token: guest.accessToken,
      body: { displayName: personality.displayName, bio: personality.bio },
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
    log(`agent-${i + 1}`, { displayName: personality.displayName, beingId: guest.being.id });
  }

  // Step 3: Create topic
  logStep("Step 3: Create topic");
  const topic = await api("/v1/internal/topics", {
    method: "POST",
    token: adminToken,
    expectedStatus: 201,
    body: {
      domainId: DOMAIN_ID,
      title: "Is Tiger Woods the Best Golfer Ever?",
      prompt: "Evaluate Tiger Woods's claim to being the greatest golfer of all time. Consider statistical records, major championship performance, era-adjusted comparisons, psychological dominance, career longevity, and what 'best ever' means across different frameworks.",
      templateId: "debate",
      topicFormat: "scheduled_research",
      cadenceOverrideMinutes: 2,
      topicSource: "cron_auto",
      reason: "E2E test â€” Tiger Woods GOAT debate",
    },
    logRequest: true,
    logLabel: "topic-create",
  });
  log("topic", { id: topic.id, status: topic.status, rounds: topic.rounds.length });

  // Step 4: Set timing and join
  logStep("Step 4: Timing + join");
  const joinUntil = new Date(Date.now() + 30_000).toISOString();
  const startsAt = new Date(Date.now() + 45_000).toISOString();
  await api(`/v1/topics/${topic.id}`, {
    method: "PATCH",
    token: adminToken,
    body: { startsAt, joinUntil },
  });
  log("timing", { startsAt, joinUntil });

  for (const p of participants) {
    await api(`/v1/topics/${topic.id}/join`, {
      method: "POST",
      token: p.accessToken,
      body: { beingId: p.beingId },
    });
    log("joined", p.displayName);
  }

  // Step 5: Drive debate loop
  logStep("Step 5: Drive debate");
  const contributionKeys = new Set();
  const voteKeys = new Set();
  let lastTransitionKey = null;
  const deadlineMs = Date.now() + 30 * 60_000;
  let sweepCount = 0;
  const allVotes = [];
  const allContributions = [];
  let loopCount = 0;

  while (Date.now() < deadlineMs) {
    loopCount++;
    const sweep = await api("/v1/internal/topics/sweep", { method: "POST", token: adminToken, body: {} });
    sweepCount++;
    if (sweep?.mutatedTopicIds?.length > 0) {
      log("sweep", { count: sweepCount, mutated: sweep.mutatedTopicIds });
    }

    const contexts = await Promise.all(
      participants.map((p) =>
        api(`/v1/topics/${topic.id}/context?beingId=${encodeURIComponent(p.beingId)}`, { token: p.accessToken })
          .then((context) => ({ participant: p, context })),
      ),
    );

    const canonical = contexts[0]?.context;
    if (!canonical || typeof canonical.status !== "string") {
      throw new Error("Context response missing status");
    }

    const transitionKey = `${canonical.status}:${canonical.currentRound?.id ?? "none"}`;
    if (transitionKey !== lastTransitionKey) {
      lastTransitionKey = transitionKey;
      log("transition", {
        status: canonical.status,
        roundIndex: canonical.currentRound?.sequenceIndex ?? null,
        roundKind: canonical.currentRound?.roundKind ?? null,
      });
    }

    if (loopCount % 10 === 0) {
      log("heartbeat", { loop: loopCount, sweeps: sweepCount, contributions: allContributions.length, votes: allVotes.length });
    }

    if (canonical.status === "closed" || canonical.status === "stalled") {
      log("terminal", canonical.status);
      break;
    }

    for (const { participant, context } of contexts) {
      const currentRound = context.currentRound;
      if (!currentRound || context.status !== "started") continue;

      const roundKind = currentRound.roundKind;
      const contributionKey = `${participant.beingId}:${currentRound.id}`;

      // Submit contribution
      if (!contributionKeys.has(contributionKey) && (!Array.isArray(context.ownContributionStatus) || context.ownContributionStatus.length === 0)) {
        const body = CONTRIBUTION_TEMPLATES[roundKind]?.[participant.style]
          ?? `${participant.displayName} responds in ${roundKind} round.`;

        try {
          const contribution = await api(`/v1/topics/${topic.id}/contributions`, {
            method: "POST",
            token: participant.accessToken,
            expectedStatus: [200, 201],
            body: {
              beingId: participant.beingId,
              body,
              stance: participant.stance,
              idempotencyKey: idempotencyKey(["tw", "contrib", topic.id.slice(-12), currentRound.id.slice(-12), participant.beingId.slice(-12)]),
            },
          });
          contributionKeys.add(contributionKey);
          allContributions.push({ roundKind, roundIndex: currentRound.sequenceIndex, displayName: participant.displayName, stance: participant.stance });
          log("contribution", { who: participant.displayName, round: roundKind, stance: participant.stance });
        } catch (err) {
          log("contribution-failed", { who: participant.displayName, round: roundKind, error: renderError(err) });
          contributionKeys.add(contributionKey);
        }
      }

      // Cast votes
      const refreshedContext = await api(`/v1/topics/${topic.id}/context?beingId=${participant.beingId}`, { token: participant.accessToken });
      const voteRequired = Boolean(refreshedContext.currentRoundConfig?.voteRequired);
      const voteTargets = Array.isArray(refreshedContext.voteTargets) ? refreshedContext.voteTargets : [];
      if (!voteRequired || voteTargets.length === 0) continue;

      const othersTargets = voteTargets.filter((t) => t.beingId !== participant.beingId);
      if (othersTargets.length === 0) continue;

      const voteKinds = ["most_interesting", "most_correct", "fabrication"];
      for (let ki = 0; ki < voteKinds.length; ki++) {
        const voteKind = voteKinds[ki];
        const voteKey = `${participant.beingId}:${currentRound.id}:${voteKind}`;
        if (voteKeys.has(voteKey)) continue;

        const target = othersTargets[ki % othersTargets.length];
        try {
          await api(`/v1/topics/${topic.id}/votes`, {
            method: "POST",
            token: participant.accessToken,
            expectedStatus: [200, 201],
            body: {
              beingId: participant.beingId,
              contributionId: target.contributionId,
              voteKind,
              idempotencyKey: idempotencyKey(["tw", voteKind, topic.id.slice(-12), refreshedContext.currentRound.id.slice(-12), participant.beingId.slice(-12)]),
            },
          });
          voteKeys.add(voteKey);
          allVotes.push({ roundKind, roundIndex: currentRound.sequenceIndex, voter: participant.displayName, voteKind });
          log("vote", { who: participant.displayName, kind: voteKind, target: target.beingHandle ?? target.beingId });
        } catch (err) {
          log("vote-blocked", { who: participant.displayName, kind: voteKind, error: err.message?.slice(0, 120) });
        }
      }
    }

    await wait(3_000);
  }

  // Step 6: Results
  logStep("Step 6: Results");
  const finalContext = await api(`/v1/topics/${topic.id}/context?beingId=${encodeURIComponent(participants[0].beingId)}`, { token: participants[0].accessToken });

  log("final-status", finalContext.status);
  log("contributions-total", allContributions.length);
  log("votes-total", allVotes.length);

  if (finalContext.status === "closed") {
    try {
      const report = await api(`/v1/internal/admin/topics/${topic.id}/report`, { token: adminToken });
      log("report-verdict", report?.verdict?.verdictOutcome ?? "no verdict");
      log("report-confidence", report?.verdict?.confidence ?? "unknown");
    } catch (err) {
      log("report-error", err.message);
    }
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  logStep(`Complete â€” ${elapsed}s elapsed`);
  writeLine(`
SUMMARY:
  Topic:          ${topic.id}
  Title:          Is Tiger Woods the Best Golfer Ever?
  Template:       debate
  Agents:         ${participants.map((p) => p.displayName).join(", ")}
  Contributions:  ${allContributions.length}
  Votes:          ${allVotes.length}
  Final Status:   ${finalContext.status}
  URL:            ${API_BASE_URL.replace("api.", "")}/topics/${topic.id}
  Log:            ${LOG_PATH}
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
