#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

/**
 * test-georgia-defense-e2e.mjs — E2E debate: "Is the 2021 Georgia Bulldogs defense
 * statistically the greatest defense in college football history?"
 *
 * 5 agents drive the full debate_v2 lifecycle:
 *   propose → critique → refine → synthesize → predict
 */

function readFlag(name, fallback) {
  const idx = process.argv.indexOf(name);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

const API_BASE_URL = readFlag("--api-base-url", "https://api.opndomain.com");
const DOMAIN_ID = readFlag("--domain-id", "dom_game-theory");
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const LOG_DIR = path.resolve("logs");
const LOG_PATH = path.join(LOG_DIR, `test-georgia-defense-${RUN_ID}.log`);

const ADMIN_CLIENT_ID = "cli_8308c04fc3a813a0e34435e08ec0c5f8";
const ADMIN_CLIENT_SECRET = "_1504zCRV7WRnBQ5dtZycHkcO7LxMsdC7P0Nkj5wTCM";

const PERSONALITIES = [
  {
    displayName: "The Sabermetrician",
    bio: "Advanced analytics specialist who evaluates defenses through EPA/play, success rate, and havoc rate. Believes era-adjusted efficiency metrics are the only honest comparison tool.",
    stance: "support",
    style: "sabermetrician",
  },
  {
    displayName: "The Old-School Scout",
    bio: "35-year veteran scout who watched the '85 Bears, 2000 Ravens, and 2011 Bama live. Judges defenses by film, scheme dominance, and how they performed against elite offenses in their era.",
    stance: "oppose",
    style: "oldschool",
  },
  {
    displayName: "The Era Adjuster",
    bio: "College football historian who normalizes stats across eras. Points out that offensive explosion since 2015 makes raw defensive numbers incomparable to pre-spread era defenses.",
    stance: "neutral",
    style: "eraadjuster",
  },
  {
    displayName: "The NFL Evaluator",
    bio: "Draft analyst who grades defenses by how many players became NFL contributors. Believes pro success is the ultimate validator of individual and unit talent.",
    stance: "support",
    style: "nflevaluator",
  },
  {
    displayName: "The Contrarian",
    bio: "Sports epistemologist who stress-tests popular narratives. Believes recency bias inflates modern teams and that 'statistically greatest' is often a product of the metrics you choose.",
    stance: "oppose",
    style: "contrarian",
  },
];

const CONTRIBUTION_TEMPLATES = {
  propose: {
    sabermetrician:
      "The 2021 Georgia Bulldogs defense is the most statistically dominant unit in modern college football history by virtually every advanced metric. They allowed 6.9 points per game during the regular season — the lowest since 1971 Michigan. Their EPA/play allowed of -0.38 was the best in the analytics era (since 2004). Their success rate allowed of 24.1% was a full 4 percentage points better than the next-best defense in the CFP era. They held opponents to 3.4 yards per play, the lowest figure in FBS since 2000. Their havoc rate of 27.3% led the nation. They posted 4 shutouts and allowed more than 17 points only once in the regular season (the SECCG loss to Alabama). When you stack these numbers against every defense since advanced metrics became available, no unit comes close across this many dimensions simultaneously.",
    oldschool:
      "I've been scouting defenses for 35 years, and while 2021 Georgia was exceptional, calling them the greatest ever requires ignoring some legendary units. The 1985 Bears held opponents to 12.4 points per game in the NFL — against professional offenses — and had the most dominant postseason run in football history (10 points allowed in 3 playoff games). The 2000 Ravens allowed 10.3 points per game with 4 shutouts in 16 games. In college, the 2011 Alabama defense held opponents to 8.2 points per game and dominated the BCS title game against LSU 21-0. What made those units special wasn't just statistics — it was the eye test. The 2021 Georgia defense was stacked with talent, but they also played in the SEC East, which was unusually weak that year. Missouri, South Carolina, and Vanderbilt were not the gauntlet that 'SEC schedule' implies.",
    eraadjuster:
      "Any honest comparison of defenses across eras must account for the offensive revolution in college football. In 2021, the average FBS team ran 70.2 plays per game and scored 28.7 points. In 2011, those numbers were 67.8 plays and 25.1 points. In 2001, they were 64.3 plays and 22.8 points. In 1986, they were 61.1 plays and 19.4 points. This means a defense in 2021 faces more possessions, more spread formations, more tempo, and more explosive plays than any defense in the 1980s or 1990s. Georgia's 6.9 points allowed per game in 2021 is arguably more impressive than any sub-10 figure from the pre-spread era because the baseline offensive output was dramatically higher. However, we also need to account for the flip side: Georgia's own offense was elite, which meant opponents played from behind and abandoned efficient game plans. Context cuts both ways.",
    nflevaluator:
      "The 2021 Georgia defense produced an unprecedented NFL talent haul that validates the statistical dominance. Five defensive players were selected in the first round of the 2022 NFL Draft: Travon Walker (1st overall), Jordan Davis (13th), Quay Walker (22nd), Devonte Wyatt (28th), and Lewis Cine (32nd). An additional 3 defenders were drafted in rounds 2-5. By the 2024 NFL season, 8 members of that defense were starting in the NFL. No college defense in history has produced that many high-round NFL draft picks from a single season's unit. The 2011 Alabama defense — often cited as the comparison — produced 5 first-rounders across multiple draft years, but several of those were underclassmen who returned. Georgia's 2021 unit had the depth to lose 5 first-rounders in one draft and still field a top-5 defense in 2022 with the remaining players.",
    contrarian:
      "Before crowning the 2021 Georgia defense as the statistical GOAT, we need to examine what 'statistically greatest' actually means and whether the metrics being cited are cherry-picked to support a predetermined conclusion. Points per game is influenced by opponent quality, field position (Georgia's offense was elite), garbage time scoring, and defensive/special teams touchdowns. EPA/play is only available since 2004, which eliminates 100+ years of college football from comparison. Yards per play doesn't account for era-specific offensive philosophies. The 2021 Georgia defense was undeniably great, but the claim of 'statistically greatest ever' requires selecting a specific set of metrics, over a specific time period, and ignoring legitimate comparisons from eras without advanced analytics. That's not a statistical argument — it's a framing choice disguised as one.",
  },
  critique: {
    sabermetrician:
      "The Old-School Scout's comparison to the '85 Bears and 2000 Ravens is an apples-to-oranges fallacy — those are NFL defenses. We're evaluating college football defenses. The 2011 Alabama comparison is more relevant, but the numbers don't support it as superior: Bama allowed 8.2 PPG vs Georgia's 6.9 PPG, and Alabama's EPA/play allowed was -0.29 vs Georgia's -0.38. The 'weak SEC East' critique is partially valid but overstated — Georgia also held ranked opponents (Arkansas, Kentucky, Clemson in the opener) to an average of 7.3 points. The Contrarian raises a fair point about metric selection, but the strength of Georgia's case is precisely that they lead across *multiple independent metrics* simultaneously, which is much harder to explain by cherry-picking than leading in just one.",
    oldschool:
      "The Sabermetrician is right that I shouldn't have mixed NFL and college comparisons — that's my bias showing. But even in college, the 2021 Georgia defense has legitimate challengers. The 1986 Oklahoma defense allowed 6.6 points per game and held opponents to 168.2 yards per game — in an era when running the ball was the primary offensive strategy and stopping it required a different kind of dominance. The 1971 Michigan defense allowed 5.8 points per game across 11 games. The Era Adjuster correctly identifies that higher offensive baselines make raw PPG comparisons misleading, but the inverse is also true: Georgia faced more pass-happy offenses that are inherently more variance-prone, meaning some of their dominant games may reflect opponent dysfunction as much as defensive excellence.",
    eraadjuster:
      "The NFL Evaluator's draft argument is compelling but commits a logical error: NFL draft position measures *individual talent projection*, not *unit defensive performance*. A defense could produce zero NFL starters and still be the best college defense ever if the scheme maximized lesser talent. Conversely, a defense full of future NFL stars could underperform if poorly coached. The 2021 Georgia defense benefited from both elite talent AND elite coaching, but the draft haul tells us about the talent part, not whether the on-field performance was historically best. The Sabermetrician's point about leading across multiple metrics is the strongest argument so far, but I'd push back: all those metrics are correlated (a team that allows few points also tends to allow few yards and low EPA), so 'leading in multiple metrics' may overstate the independence of the evidence.",
    nflevaluator:
      "The Contrarian raises the most important methodological challenge: the absence of advanced metrics before 2004 genuinely limits our ability to compare across eras. I can't counter that with NFL draft data alone. However, I'd argue the Contrarian's skepticism cuts too deep — at some point we have to work with available data rather than declaring the question unanswerable. The Old-School Scout's 1986 Oklahoma and 1971 Michigan examples deserve engagement: those defenses played 10-11 game seasons against regional schedules with less roster parity (no scholarship limits until 1973). Georgia played a 15-game schedule including two games against the #1 team in the country. The workload and opponent quality context matters enormously and systematically favors the modern defense.",
    contrarian:
      "I appreciate the Sabermetrician engaging with my framing critique, but the response actually proves my point. 'Leading across multiple independent metrics' sounds powerful until you realize those metrics are deeply correlated — as the Era Adjuster correctly notes. Points allowed, yards allowed, EPA/play, and success rate all measure overlapping aspects of the same underlying phenomenon. It's like saying a basketball player is the GOAT because they lead in points, field goals made, AND free throws made — those aren't independent achievements. The more honest framing is: Georgia's 2021 defense was historically dominant on a single underlying dimension (preventing opponent offensive success) as measured by multiple correlated proxies. That's still impressive, but it's one signal, not five independent ones.",
  },
  refine: {
    sabermetrician:
      "The Contrarian and Era Adjuster are right about metric correlation — I'll refine my argument. Instead of citing multiple correlated metrics, let me focus on the single most independent comparison: Georgia's defensive performance *against opponents who were themselves statistically elite offenses*. In 2021, Georgia faced 4 opponents ranked in the top 30 in offensive EPA/play. Against those 4 teams, Georgia allowed an average of 13.5 points and -0.22 EPA/play allowed. For comparison, the 2011 Alabama defense faced 3 top-30 offenses and allowed 16.7 points and -0.14 EPA/play. This controls for opponent quality and metric correlation simultaneously. The performance-against-quality-opponents test is the most rigorous available comparison, and Georgia passes it decisively against every CFP-era defense.",
    oldschool:
      "I'll concede that the 15-game schedule and playing Alabama twice argument is more significant than I initially credited. The NFL Evaluator is right that facing the #1 team twice — and holding them to 10 points in the championship game after allowing 41 in the SECCG — shows adaptive coaching and mental resilience that shorter-schedule defenses were never tested on. My refined position: Georgia's 2021 defense is the best of the CFP era (since 2014) and has a legitimate case for best since 2000. But 'greatest in college football history' requires comparing to units we simply can't measure with equivalent precision — 1986 Oklahoma, 1971 Michigan, the 1940s Army teams. I'd argue the honest answer is 'greatest measurable defense' rather than 'greatest defense,' and that distinction matters for intellectual honesty.",
    eraadjuster:
      "The Sabermetrician's refined approach — performance against top-30 offenses — is the strongest version of the argument. Let me add era-adjustment context to strengthen it further. In 2021, the average top-30 offense scored 37.2 points per game. Georgia held those offenses to 13.5 PPG — a suppression rate of 63.7%. In 2011, the average top-30 offense scored 34.8 PPG. Alabama held them to 16.7 PPG — suppression rate of 52.0%. In 2001, the best defenses (Miami, Oregon) faced top-30 offenses averaging 31.4 PPG and suppressed them by roughly 45-50%. Georgia's suppression rate against elite offenses is the highest I can calculate in the analytics era. My refined position: Georgia 2021 is the most dominant defense *relative to the offensive environment they played in*, which I now believe is the fairest framing of 'statistically greatest.'",
    nflevaluator:
      "The Era Adjuster's critique of my draft argument is fair — draft picks measure talent projection, not unit performance. Let me refine: the NFL success data matters not as proof of defensive greatness but as a *consistency check*. If a defense produces historically great statistics AND an unprecedented NFL talent haul, it's less likely that the statistics were inflated by scheme, schedule, or luck. The correlation between elite stats and elite talent provides mutual validation. Compare to the 2016 Alabama defense, which produced a similar NFL draft haul (5 first-rounders across two drafts) but posted weaker statistical numbers (16.0 PPG, -0.19 EPA/play). Georgia's 2021 unit is the only defense in the analytics era that pairs the top statistical performance with the top talent output. That convergence is the argument.",
    contrarian:
      "The debate has sharpened considerably. I'll refine my position: the Sabermetrician's pivot to performance-against-elite-offenses is a much stronger argument than the original multi-metric approach, and the Era Adjuster's suppression rate analysis adds genuine analytical value. My remaining objection is narrower: the analytics era begins in 2004, giving us ~18 seasons of comparable data. Declaring Georgia 'statistically greatest in history' from an 18-season sample (out of 150+ years of college football) requires a qualifier. The Old-School Scout's 'greatest measurable defense' framing is intellectually honest and, I'd argue, more impressive than it sounds — it means Georgia is the best among all defenses we can rigorously evaluate, which is the strongest defensible claim available.",
  },
  synthesize: {
    sabermetrician:
      "After three rounds of refinement, the evidence supports a precise and defensible claim: the 2021 Georgia Bulldogs defense is the most statistically dominant defense in the analytics era of college football (2004-present) by the most rigorous available comparison — performance against elite offenses, era-adjusted suppression rates, and convergence of statistical dominance with validated talent depth. The Contrarian and Old-School Scout correctly pushed back on the broader 'greatest in history' claim, and the honest synthesis is: Georgia is the greatest defense we can rigorously measure, and the gap between them and the next-best analytics-era defense (2011 Alabama) is larger than the gap between any other adjacent pair. Whether pre-analytics defenses could challenge them is genuinely unknowable, but the available evidence puts the burden of proof on the challenger.",
    oldschool:
      "This debate moved me from skepticism to qualified agreement. The analytics-era framing is the right scope — I was wrong to mix in NFL defenses and pre-metric college teams as direct comparisons. The performance-against-elite-offenses data is the argument that convinced me most, because it controls for the weak-schedule objection I raised. My synthesis: Georgia 2021 is the best defense I can point to concrete evidence for. The '85 Bears, 2000 Ravens, and 1986 Oklahoma still occupy space in my evaluation because I watched them dominate, but I can't produce the same quality of evidence for them. That's a limitation of the historical record, not necessarily a statement about which defense was actually better. I'll accept 'greatest measurable defense' as the fair verdict.",
    eraadjuster:
      "The debate converged on a framework that I think is genuinely more rigorous than where we started. The key analytical moves were: (1) shifting from raw stats to performance-against-elite-offenses, (2) era-adjusting through suppression rates rather than raw PPG, and (3) using NFL draft output as a consistency check rather than primary evidence. By this framework, Georgia 2021 leads every comparison available to us. The 63.7% suppression rate against top-30 offenses is the highest calculable figure in the analytics era by a meaningful margin. The synthesis: 'greatest defense in college football history' is unprovable because the data doesn't exist for most of the history. 'Greatest defense in the era where rigorous comparison is possible' is provable, and Georgia 2021 holds that title convincingly.",
    nflevaluator:
      "The debate refined the GOAT claim from a broad assertion to a precise, defensible thesis. The convergence of three independent lines of evidence — (1) best analytics-era defensive statistics, (2) highest era-adjusted suppression rate against elite offenses, (3) unprecedented NFL talent validation — makes the 2021 Georgia defense the most thoroughly documented case for defensive greatness in college football. The Contrarian's insistence on epistemological honesty improved the argument by forcing us to specify what we can and can't prove. My final position: Georgia 2021 is the greatest college defense we can prove with evidence, and the evidence is strong enough that a pre-analytics challenger would need to be extraordinarily dominant to plausibly surpass them.",
    contrarian:
      "I entered this debate arguing that the 'statistically greatest' claim was a framing choice. I leave it acknowledging that the refined version of the claim — greatest in the analytics era, measured by performance against elite offenses with era adjustment — is well-supported and honestly scoped. The debate's most productive move was the Old-School Scout's 'greatest measurable defense' framing, which the Sabermetrician and Era Adjuster built on rather than resisted. My synthesis: the question 'Is the 2021 Georgia defense statistically the greatest ever?' has a defensible 'yes' if you define 'statistically' as 'within the era of available statistics' and 'greatest' as 'most dominant relative to offensive environment.' Those qualifiers aren't weaknesses — they're what make the claim honest rather than hyperbolic.",
  },
  predict: {
    sabermetrician:
      "I predict that within 5 years, retrospective analytics models will further strengthen Georgia 2021's case as more sophisticated era-adjustment tools are developed. The current generation of college football analytics is still maturing — as models incorporate opponent-adjusted metrics, schedule strength corrections, and play-level data more rigorously, Georgia's defensive performance will likely look even more anomalous. I also predict no defense in the next decade will match their combined statistical profile, because the depth of NFL-caliber talent required is nearly impossible to assemble under current roster and NIL dynamics. Confidence: 70% that Georgia 2021 remains the analytics-era benchmark through 2035.",
    oldschool:
      "My prediction: Georgia 2021 will be remembered as the consensus greatest defense of the 2020s, but the 'greatest ever' debate will persist because football culture values narrative alongside statistics. Some future defense will put up comparable numbers in a single season and reignite the debate — probably within 10 years as defensive coaching adapts to the spread. But matching Georgia's combination of regular-season dominance, championship-game performance, and NFL draft output in a single season will be extraordinarily rare. Confidence: 60% that the debate persists; 80% that no defense matches the full package within 10 years.",
    eraadjuster:
      "I predict the era-adjustment methodology itself will become the lasting contribution of debates like this one. Within 5-10 years, college football analytics will adopt standardized era-adjusted defensive metrics — similar to how baseball adopted OPS+ and ERA+ — that will make cross-era comparisons routine rather than ad hoc. When that happens, Georgia 2021 will be the first team tested against the new standard, and I predict they'll hold up. The bigger prediction: the spread offense revolution will plateau, and defensive innovation will close the gap, meaning future defenses will post better raw numbers but not necessarily better era-adjusted numbers than Georgia 2021. Confidence: 65%.",
    nflevaluator:
      "I predict the NFL careers of Georgia's 2021 defensive players will be the final validator. If Travon Walker, Jordan Davis, and Nakobe Dean develop into Pro Bowl-caliber players by 2027, it will retroactively confirm that the statistical dominance wasn't scheme-dependent — it was talent executing at a historic level. Conversely, if multiple first-rounders bust, it will weaken the 'greatest ever' argument by suggesting the stats were inflated by coaching and scheme rather than generational talent. My prediction: at least 3 of the 5 first-round defensive picks will make a Pro Bowl by 2028, confirming the talent thesis. Confidence: 55% — NFL development is inherently uncertain.",
    contrarian:
      "My meta-prediction: 'greatest defense ever' debates will become more common and more rigorous as analytics penetrate college football culture. Georgia 2021 will be the benchmark case study — the first defense whose GOAT claim was evaluated with analytics-era tools and epistemological honesty about what can and can't be proven. The precedent this debate sets — scoping claims to measurable eras, using suppression rates over raw stats, and demanding convergent evidence — will improve future GOAT arguments across all sports. Confidence: 70% that the methodology matters more than the specific verdict in the long run.",
  },
};

// ---- Reusable infrastructure (same as other e2e scripts) ----

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function writeLine(line = "") { console.log(line); fs.appendFileSync(LOG_PATH, `${line}\n`); }
function log(label, payload) {
  const time = new Date().toISOString().slice(11, 19);
  const rendered = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  writeLine(`[${time}] ${label}: ${rendered}`);
}
function logStep(msg) { writeLine(`\n${"=".repeat(60)}\n  ${msg}\n${"=".repeat(60)}`); }
function renderError(error) {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack?.split("\n").slice(0, 6).join("\n") };
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
  if (logRequest) log(logLabel ?? "api-request", { method, path, ...(body ? { body } : {}) });

  const response = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await response.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error(`${method} ${path} returned non-JSON: ${text.slice(0, 200)}`); }

  const expectedStatuses = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
  if (!expectedStatuses.includes(response.status)) {
    const code = parsed?.code ?? parsed?.error ?? "unknown";
    const message = parsed?.message ?? `HTTP ${response.status}`;
    log(logLabel ?? "api-error", { method, path, status: response.status, durationMs: Date.now() - startedAt, code, message });
    throw new Error(`${method} ${path} failed (${response.status}) ${code}: ${message}`);
  }
  if (logRequest) log(logLabel ?? "api-response", { method, path, status: response.status, durationMs: Date.now() - startedAt });
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
  log("run", { runId: RUN_ID, logPath: LOG_PATH, apiBaseUrl: API_BASE_URL, domainId: DOMAIN_ID });

  logStep("Step 1: Authenticate admin");
  const adminTokenData = await api("/v1/auth/token", {
    method: "POST",
    body: { grantType: "client_credentials", clientId: ADMIN_CLIENT_ID, clientSecret: ADMIN_CLIENT_SECRET },
    logRequest: true, logLabel: "admin-auth",
  });
  const adminToken = adminTokenData.accessToken;
  log("admin", { agentId: adminTokenData.agent.id });

  logStep("Step 2: Create 5 guest agents");
  const participants = [];
  for (let i = 0; i < 5; i++) {
    const p = PERSONALITIES[i];
    const guest = await api("/v1/auth/guest", { method: "POST", expectedStatus: 201 });
    await api(`/v1/beings/${guest.being.id}`, { method: "PATCH", token: guest.accessToken, body: { displayName: p.displayName, bio: p.bio } });
    participants.push({ index: i, agentId: guest.agent.id, beingId: guest.being.id, handle: guest.being.handle, displayName: p.displayName, stance: p.stance, style: p.style, accessToken: guest.accessToken });
    log(`agent-${i + 1}`, { displayName: p.displayName, beingId: guest.being.id });
  }

  logStep("Step 3: Create topic");
  const topic = await api("/v1/internal/topics", {
    method: "POST", token: adminToken, expectedStatus: 201,
    body: {
      domainId: DOMAIN_ID,
      title: "Is the 2021 Georgia Bulldogs Defense the Greatest in College Football History?",
      prompt: "Evaluate whether the 2021 Georgia Bulldogs defense is statistically the greatest defense in college football history. Consider advanced metrics (EPA/play, success rate, havoc rate), era-adjusted comparisons, opponent quality, NFL draft output, and what 'statistically greatest' means across eras with different data availability.",
      templateId: "debate_v2",
      topicFormat: "scheduled_research",
      cadenceOverrideMinutes: 2,
      topicSource: "cron_auto",
      reason: "E2E test — 2021 Georgia defense GOAT debate",
    },
    logRequest: true, logLabel: "topic-create",
  });
  log("topic", { id: topic.id, status: topic.status, rounds: topic.rounds.length });

  logStep("Step 4: Timing + join");
  const joinUntil = new Date(Date.now() + 30_000).toISOString();
  const startsAt = new Date(Date.now() + 45_000).toISOString();
  await api(`/v1/topics/${topic.id}`, { method: "PATCH", token: adminToken, body: { startsAt, joinUntil } });
  log("timing", { startsAt, joinUntil });

  for (const p of participants) {
    await api(`/v1/topics/${topic.id}/join`, { method: "POST", token: p.accessToken, body: { beingId: p.beingId } });
    log("joined", p.displayName);
  }

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
    if (sweep?.mutatedTopicIds?.length > 0) log("sweep", { count: sweepCount, mutated: sweep.mutatedTopicIds });

    const contexts = await Promise.all(
      participants.map((p) =>
        api(`/v1/topics/${topic.id}/context?beingId=${encodeURIComponent(p.beingId)}`, { token: p.accessToken })
          .then((context) => ({ participant: p, context })),
      ),
    );

    const canonical = contexts[0]?.context;
    if (!canonical || typeof canonical.status !== "string") throw new Error("Context response missing status");

    const transitionKey = `${canonical.status}:${canonical.currentRound?.id ?? "none"}`;
    if (transitionKey !== lastTransitionKey) {
      lastTransitionKey = transitionKey;
      log("transition", { status: canonical.status, roundIndex: canonical.currentRound?.sequenceIndex ?? null, roundKind: canonical.currentRound?.roundKind ?? null });
    }

    if (loopCount % 10 === 0) log("heartbeat", { loop: loopCount, sweeps: sweepCount, contributions: allContributions.length, votes: allVotes.length });

    if (canonical.status === "closed" || canonical.status === "stalled") { log("terminal", canonical.status); break; }

    for (const { participant, context } of contexts) {
      const currentRound = context.currentRound;
      if (!currentRound || context.status !== "started") continue;
      const roundKind = currentRound.roundKind;
      const contributionKey = `${participant.beingId}:${currentRound.id}`;

      if (!contributionKeys.has(contributionKey) && (!Array.isArray(context.ownContributionStatus) || context.ownContributionStatus.length === 0)) {
        const body = CONTRIBUTION_TEMPLATES[roundKind]?.[participant.style] ?? `${participant.displayName} responds in ${roundKind} round.`;
        try {
          await api(`/v1/topics/${topic.id}/contributions`, {
            method: "POST", token: participant.accessToken, expectedStatus: [200, 201],
            body: { beingId: participant.beingId, body, stance: participant.stance, idempotencyKey: idempotencyKey(["uga", "contrib", topic.id.slice(-12), currentRound.id.slice(-12), participant.beingId.slice(-12)]) },
          });
          contributionKeys.add(contributionKey);
          allContributions.push({ roundKind, roundIndex: currentRound.sequenceIndex, displayName: participant.displayName, stance: participant.stance });
          log("contribution", { who: participant.displayName, round: roundKind, stance: participant.stance });
        } catch (err) {
          log("contribution-failed", { who: participant.displayName, round: roundKind, error: renderError(err) });
          contributionKeys.add(contributionKey);
        }
      }

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
            method: "POST", token: participant.accessToken, expectedStatus: [200, 201],
            body: { beingId: participant.beingId, contributionId: target.contributionId, voteKind, idempotencyKey: idempotencyKey(["uga", voteKind, topic.id.slice(-12), refreshedContext.currentRound.id.slice(-12), participant.beingId.slice(-12)]) },
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
    } catch (err) { log("report-error", err.message); }
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  logStep(`Complete — ${elapsed}s elapsed`);
  writeLine(`
SUMMARY:
  Topic:          ${topic.id}
  Title:          Is the 2021 Georgia Bulldogs Defense the Greatest in College Football History?
  Template:       debate_v2
  Agents:         ${participants.map((p) => p.displayName).join(", ")}
  Contributions:  ${allContributions.length}
  Votes:          ${allVotes.length}
  Final Status:   ${finalContext.status}
  URL:            ${API_BASE_URL.replace("api.", "")}/topics/${topic.id}
  Log:            ${LOG_PATH}
  `);

  if (finalContext.status !== "closed") { console.error("WARNING: Topic did not reach closed state."); process.exitCode = 1; }
}

main().catch((err) => {
  try { fs.mkdirSync(LOG_DIR, { recursive: true }); fs.appendFileSync(LOG_PATH, `[FATAL] ${JSON.stringify(renderError(err), null, 2)}\n`); } catch {}
  console.error("FATAL:", err);
  process.exitCode = 1;
});
