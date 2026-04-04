#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

/**
 * test-florida-property-tax-e2e.mjs — E2E debate: "Should Florida eliminate
 * property taxes for homesteaded residents?"
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
const LOG_PATH = path.join(LOG_DIR, `test-florida-property-tax-${RUN_ID}.log`);

const ADMIN_CLIENT_ID = "cli_8308c04fc3a813a0e34435e08ec0c5f8";
const ADMIN_CLIENT_SECRET = "_1504zCRV7WRnBQ5dtZycHkcO7LxMsdC7P0Nkj5wTCM";

const PERSONALITIES = [
  {
    displayName: "The Fiscal Conservative",
    bio: "Anti-tax advocate and Grover Norquist disciple. Believes property taxes are a form of perpetual rent on owned assets and that Florida's no-income-tax model should extend to full homestead exemption.",
    stance: "support",
    style: "fiscal_conservative",
  },
  {
    displayName: "The Municipal Realist",
    bio: "Former county budget director with 20 years managing local government finances. Knows exactly where the money goes and what breaks when revenue disappears.",
    stance: "oppose",
    style: "municipal_realist",
  },
  {
    displayName: "The Housing Economist",
    bio: "PhD economist specializing in housing markets, property tax incidence, and land-use policy. Focuses on second-order effects and unintended consequences of tax changes.",
    stance: "neutral",
    style: "housing_economist",
  },
  {
    displayName: "The Populist Advocate",
    bio: "Represents fixed-income retirees and working families being taxed out of their homes. Argues property taxes are regressive in practice and devastating to long-term residents in appreciating markets.",
    stance: "support",
    style: "populist_advocate",
  },
  {
    displayName: "The Public Finance Scholar",
    bio: "Comparative tax policy researcher who studies how jurisdictions worldwide fund local services. Skeptical of single-variable tax reforms and focused on systemic tradeoffs.",
    stance: "oppose",
    style: "public_finance",
  },
];

const CONTRIBUTION_TEMPLATES = {
  propose: {
    fiscal_conservative:
      "Florida should eliminate property taxes for homesteaded residents because property taxes are philosophically indefensible — they convert ownership into a perpetual lease from the government. You never truly own your home if the state can seize it for nonpayment of an annual fee. Florida already demonstrates that a state can thrive without income taxes; extending this principle to homestead property taxes is the logical next step. The numbers support it: Florida's homestead property tax revenue was approximately $24.7 billion in FY2023, but the state ran a $22 billion surplus that same year. Tourism taxes, sales taxes, and commercial property taxes can absorb a significant portion of the gap. Texas and New Hampshire fund local services without income taxes and with higher property taxes — Florida could invert this by funding services through consumption taxes while eliminating the homestead burden entirely.",
    municipal_realist:
      "As someone who managed a county budget for two decades, I can tell you exactly what happens when you eliminate $24.7 billion in homestead property tax revenue: local services collapse. Property taxes fund 57% of Florida's county budgets and 41% of school district operating costs. That's not abstract — it's fire stations, sheriff's deputies, road maintenance, parks, libraries, and the court system. The state surplus argument is misleading: that surplus is one-time money from federal COVID relief and economic boom conditions, not a sustainable revenue stream. Even if the state redirected every dollar of surplus to replace lost property tax revenue, it would cover roughly one year before the structural deficit became apparent. Counties would face immediate credit downgrades, borrowing costs would spike, and the very infrastructure that makes Florida attractive to residents and businesses would deteriorate within 3-5 years.",
    housing_economist:
      "The economic analysis of eliminating homestead property taxes is more complex than either side acknowledges. Property taxes serve as a Pigovian tax on land consumption — they discourage holding land unproductively and generate revenue proportional to the public infrastructure that creates land value (the Georgist argument). Eliminating them for homesteaded properties would create several predictable second-order effects: (1) Home prices would immediately capitalize the tax savings, rising by approximately the present value of eliminated future taxes — a windfall for current owners but not for future buyers. (2) The incentive to downsize would weaken, reducing housing turnover and tightening supply in already-constrained markets. (3) The homestead/non-homestead distinction would create a two-tier property market with significant distortions at the boundary. (4) Revenue replacement through sales taxes would shift the burden from wealth-holders to consumers, which is regressive on a current-income basis.",
    populist_advocate:
      "Let me tell you what property taxes look like from the kitchen table of a retired teacher in Tampa. She bought her home in 1998 for $89,000. It's now assessed at $410,000 thanks to Florida's housing boom. Even with Save Our Homes limiting assessment increases to 3% per year, her property tax bill has grown from $1,200 to $4,800 annually — on a fixed pension of $32,000. She's not wealthy. She doesn't benefit from rising home values unless she sells the home she's lived in for 25 years. But she pays taxes as if she's receiving income from that appreciation. This is the lived reality for hundreds of thousands of Florida homesteaders: they're being taxed on paper wealth they can't access without leaving their homes. The homestead exemption exists because Florida recognized this injustice — full elimination is the honest completion of that principle.",
    public_finance:
      "Comparative tax policy research strongly cautions against eliminating a major revenue source without understanding the full system dynamics. Florida's current tax structure is already unusual: no income tax, heavy reliance on sales tax (60% of state revenue) and property tax (primary local revenue). Eliminating homestead property taxes would make Florida the most consumption-tax-dependent large state in America, which creates three structural vulnerabilities. First, consumption tax revenue is highly cyclical — it crashed 18% during the 2008 recession while property tax revenue declined only 6%. Second, shifting to consumption taxes eliminates the benefit-linkage principle: property taxes roughly connect the people who benefit from local services (residents) with the people who pay for them. Sales taxes break this link because tourists and pass-through consumers pay without receiving proportional services. Third, every jurisdiction that has attempted large-scale property tax elimination (California's Prop 13 is the closest analogue) has experienced service degradation and hidden cost-shifting within a decade.",
  },
  critique: {
    fiscal_conservative:
      "The Municipal Realist's 'services collapse' scenario is fear-mongering dressed as expertise. Florida's local governments have consistently grown spending faster than population plus inflation — Brevard County increased its budget 34% in five years while population grew 8%. There's enormous fat in local budgets that the bureaucratic class has no incentive to cut. The Housing Economist's capitalization argument actually supports elimination: if home prices rise to reflect eliminated taxes, that's a one-time wealth transfer to homeowners who've been overpaying for decades. The Public Finance Scholar's Prop 13 comparison is inapt — Prop 13 capped rates without eliminating them, creating a different set of distortions. And the cyclicality argument cuts both ways: property tax revenue is stable but unresponsive to actual service needs, which is why counties hoard surpluses during booms.",
    municipal_realist:
      "The Fiscal Conservative's 'government fat' argument reveals a fundamental misunderstanding of county budgets. I ran one — I know where the money goes. In Hillsborough County, 38% of the property-tax-funded budget goes to the sheriff's office, 22% to fire rescue, 14% to infrastructure maintenance, and 11% to the court system. That's 85% on services where cuts mean slower 911 response, fewer deputies, deteriorating roads, and court backlogs. The remaining 15% includes parks, libraries, and code enforcement — already bare-bones operations. The Populist Advocate's retired teacher example is sympathetic, but targeted relief (expanded homestead exemptions, property tax deferrals for seniors, circuit-breaker credits) addresses her situation without blowing a $25 billion hole in local government revenue. We don't need to burn down the house to fix the plumbing.",
    housing_economist:
      "The Fiscal Conservative's response to the capitalization effect misses the distributional consequence. Yes, current homeowners get a wealth windfall — but this is a one-time transfer that does nothing for affordability. Future buyers pay the same total cost (higher price, no tax) while losing the mortgage interest deduction benefit of property taxes. The Populist Advocate's retired teacher example illustrates a real problem — unrealized appreciation creating tax burden — but the solution should target the problem directly. A property tax deferral program (as Oregon and several other states offer) would let the teacher defer taxes until sale, with the deferred amount plus interest recovered from the estate or sale proceeds. This solves the cash-flow problem without forfeiting $25 billion in revenue. The Municipal Realist's point about targeted relief is well-taken.",
    populist_advocate:
      "The Municipal Realist and Housing Economist both propose 'targeted relief' as an alternative to elimination, but targeted programs are exactly what Florida has tried for 30 years, and they're failing. The homestead exemption ($50,000), Save Our Homes cap (3% annual increase), senior exemptions — all of these exist, and my retired teacher in Tampa is still drowning. Targeted relief programs are bureaucratic, means-tested, and chronically underfunded because they compete with every other budget priority. Full elimination is simpler, universal for homesteaders, and eliminates the administrative overhead of managing exemption applications, appeals, and compliance. The Public Finance Scholar's Prop 13 comparison is the strongest opposing argument — but Prop 13 failed because it froze assessments at arbitrary levels, creating horizontal inequity. Full elimination avoids this by treating all homesteaders equally: zero.",
    public_finance:
      "The Fiscal Conservative claims county budgets are bloated, but this is an empirical question with a clear answer: Florida's per-capita local government spending ranks 38th among states. That's not bloated — it's lean. The 'fat' narrative is politically convenient but factually unsupported. The Populist Advocate's critique of targeted relief programs is more compelling — means-tested programs do have administrative costs and coverage gaps. But the solution to poorly-designed targeted programs is better-designed targeted programs, not the elimination of a $25 billion revenue source. The Fiscal Conservative's suggestion that tourism and commercial property taxes can fill the gap assumes those bases won't also erode: commercial tenants pass property taxes through to consumers, so raising commercial rates just creates a hidden sales tax with worse distributional properties.",
  },
  refine: {
    fiscal_conservative:
      "I'll concede the Public Finance Scholar's point that Florida's per-capita spending is 38th nationally — the 'bloated government' argument was imprecise. My refined position focuses on revenue replacement rather than spending cuts. Florida's tourism economy generated $1.7 billion in tourist development taxes in 2023, but the tax rates are well below statutory maximums in most counties. A 2% statewide tourism tax increase would generate approximately $1.2 billion. Expanding the sales tax base to include currently exempt services (legal, accounting, consulting — which were briefly taxed in 1987 before repeal) could generate $8-12 billion depending on scope. Combined with redirecting a portion of the state surplus, phased elimination over 5 years with county-by-county replacement revenue plans is financially feasible. Not easy, but feasible — and the political will exists in a state where 'no new taxes' is cultural identity.",
    municipal_realist:
      "The Fiscal Conservative's refined proposal — phased elimination with replacement revenue — is more serious than the original argument, and I'll engage with it honestly. The tourism tax expansion and services sales tax could theoretically generate $9-13 billion, but that still leaves a $12-16 billion annual gap. More importantly, the 1987 services tax experiment failed precisely because the affected industries (law, accounting, advertising) have enormous lobbying power — the tax was repealed within 5 months. My refined position: I'm open to a significant expansion of the homestead exemption — perhaps to $150,000 or even $200,000 of assessed value — which would effectively eliminate property taxes for roughly 60% of Florida homesteaders while preserving the tax base from high-value properties. This captures most of the populist benefit without creating a structural revenue crisis.",
    housing_economist:
      "The debate is converging on an interesting middle ground that I want to sharpen with economic analysis. The Municipal Realist's expanded exemption proposal ($150-200K) would eliminate taxes for lower-value homes while preserving revenue from higher-value properties — effectively creating a progressive property tax with a high floor. This is economically sound: it addresses the Populist Advocate's cash-flow burden on modest homeowners while preserving the land-value-capture function for expensive properties. However, I'd refine this further: a percentage-of-income circuit breaker (as used in Maryland and Minnesota) that caps homestead property taxes at, say, 4% of household income regardless of home value would be more precisely targeted than a flat exemption increase. The retired teacher paying $4,800 on $32,000 income (15%) would see her bill capped at $1,280. A homeowner earning $200,000 on a $600,000 home would be unaffected. This costs the state an estimated $3-5 billion annually — manageable with tourism tax adjustments.",
    populist_advocate:
      "I'll engage with the compromise proposals honestly. The Housing Economist's circuit breaker proposal — capping property taxes at 4% of income — directly solves my retired teacher's problem: her $4,800 bill drops to $1,280. That's transformative for her. The Municipal Realist's expanded exemption to $150-200K also helps, though less precisely. My refined position: I entered this debate advocating full elimination, and I still believe that's the morally correct position — you shouldn't tax people on assets they can't liquidate without losing their homes. But I'm pragmatic enough to recognize that the circuit breaker approach solves 80% of the hardship cases at 15-20% of the revenue cost. If the choice is between full elimination that never passes and a circuit breaker that passes next session, I'll take the circuit breaker as a first step.",
    public_finance:
      "The debate has moved productively from 'eliminate vs. keep' to 'how do we redesign property taxes to address legitimate hardship without destroying local revenue.' This is exactly the right evolution. My refined position: the circuit breaker model the Housing Economist proposes is the most evidence-based approach. Maryland's circuit breaker has operated since 1975 with manageable fiscal impact and measurable reduction in tax-induced displacement. Florida's version should include: (1) income-based cap at 4% of AGI for homesteaded properties, (2) automatic enrollment via state tax records (since Florida has no income tax, this would require a simple income verification form — less burdensome than current exemption applications), (3) state reimbursement to counties for the revenue gap, funded by a 1.5% tourism tax increase statewide. This preserves local revenue certainty while eliminating the cases that make property taxes genuinely unjust.",
  },
  synthesize: {
    fiscal_conservative:
      "This debate moved me from full elimination to a more nuanced position, and I'll own that evolution. The revenue replacement math for full elimination is harder than I initially argued — the 1987 services tax failure and the $12-16 billion structural gap are real constraints. The circuit breaker proposal (4% of income cap) is a meaningful reform that addresses the core injustice I care about: people being taxed out of homes they own. My synthesis: full elimination remains the philosophically correct endpoint, but the politically achievable first step is a generous circuit breaker combined with continued expansion of the homestead exemption. The principle that homeowners should not face tax burdens disconnected from their ability to pay should be the guiding framework, whether the mechanism is elimination, circuit breakers, or exemption expansion.",
    municipal_realist:
      "As a budget professional, I entered this debate defending the status quo because I've seen what happens when revenue disappears without replacement. But the Populist Advocate's retired teacher example and the Housing Economist's data on tax-to-income ratios convinced me that the current system creates genuine hardship that targeted exemptions haven't adequately addressed. My synthesis: the best policy is a state-funded circuit breaker capping homestead property taxes at 4% of household income, with county revenue made whole through state reimbursement funded by tourism tax adjustments. This preserves local budget certainty (my primary concern), addresses displacement hardship (the populist concern), and maintains the property tax's benefit-linkage function (the economist's concern). It's not as clean as full elimination, but it's implementable and sustainable.",
    housing_economist:
      "The debate converged on the circuit breaker as the synthesis position, and I want to explain why this is economically superior to both the status quo and full elimination. The status quo taxes unrealized appreciation, creating liquidity crises for asset-rich, income-poor homeowners — a market failure. Full elimination capitalizes the tax savings into home prices, creates a two-tier property market, and destroys $25 billion in local revenue — a policy failure. The circuit breaker threads the needle: it preserves the property tax's efficiency benefits (taxing land value, funding local services proportionally) while capping the burden at a payable percentage of actual income. The estimated cost of $3-5 billion annually is roughly 12-20% of current homestead property tax revenue — significant but manageable through tourism tax expansion without structural disruption to local budgets.",
    populist_advocate:
      "I came to this debate as an advocate for full elimination, and I'm leaving as an advocate for a generous circuit breaker — not because my principles changed but because the debate showed me a faster path to the same goal: protecting homeowners from being taxed out of their homes. The circuit breaker at 4% of income solves the most acute cases immediately. My retired teacher in Tampa sees her bill drop from $4,800 to $1,280 — a $3,520 annual savings that keeps her in her home. The broader principle remains: a society that taxes people on wealth they can't access without losing their shelter has a moral problem. The circuit breaker is the pragmatic solution; full elimination remains the aspirational one. I'd support the circuit breaker as legislation this session while continuing to advocate for the longer-term goal.",
    public_finance:
      "This debate produced a genuine policy consensus from opposing starting positions — which is rare in tax policy. The synthesis: Florida should implement an income-based circuit breaker capping homestead property taxes at 4% of household income, funded by state reimbursement to counties through a 1.5% statewide tourism tax increase. This addresses three separate legitimate concerns: (1) the fiscal conservative's objection to taxing illiquid wealth, (2) the municipal realist's requirement for revenue certainty, and (3) the economist's caution against destroying the property tax's efficiency benefits. The remaining disagreement — whether this is the endpoint or a step toward full elimination — is a values question about the proper scope of property taxation that this policy debate cannot and should not try to resolve. The circuit breaker is good policy regardless of which side of that question you fall on.",
  },
  predict: {
    fiscal_conservative:
      "I predict Florida will pass some form of property tax relief expansion within the next two legislative sessions (by 2028). The political dynamics are aligned: Governor DeSantis and the legislature are competing to be the most tax-friendly state, and property tax relief polls above 70% among Florida voters regardless of party. The circuit breaker model has the best chance of passage because it has bipartisan appeal — fiscal conservatives like the tax reduction, progressives like the income-based targeting. Whether it reaches the 4% cap this debate converged on or starts more modestly at 5-6% is a political negotiation question. Confidence: 75% that some form of income-linked property tax relief passes by 2028; 40% that it reaches the full circuit breaker model we discussed.",
    municipal_realist:
      "I predict the policy debate will happen but the implementation will be harder than anyone in this discussion acknowledged. The biggest obstacle isn't political will — it's the Florida Constitution. Article VII Section 9 gives counties the power to levy property taxes, and any state-mandated circuit breaker that reduces county revenue requires either a constitutional amendment (60% voter approval) or a funded state mandate (which requires sustainable state revenue). I predict a watered-down version passes — probably an expanded homestead exemption to $100,000 rather than a true circuit breaker — because it's constitutionally simpler and politically easier. Confidence: 60% on expanded exemption by 2028; 25% on a true income-linked circuit breaker within 5 years.",
    housing_economist:
      "I predict that Florida's housing market dynamics will force this issue faster than the normal legislative timeline. Home prices in Florida have appreciated 58% since 2019, and even with Save Our Homes caps, property tax bills are rising 3% annually on a rapidly rising base. By 2028, the median homesteaded property tax bill in South Florida counties will exceed $6,000 — a level that creates political pressure even among middle-income homeowners who don't currently see themselves as burdened. The policy window will open when the constituency of affected homeowners expands beyond retirees to include working families. Confidence: 70% that property tax reform becomes a top-3 legislative priority by 2029; 50% that the reform includes an income-linked component rather than just exemption expansion.",
    populist_advocate:
      "My prediction is grounded in what I see at the grassroots level: property tax anger in Florida is intensifying faster than policymakers realize. The Facebook groups, the county commission meetings, the letters to state representatives — the volume has tripled since 2022. Senior advocacy organizations (AARP Florida, Silver-Haired Legislature) are already drafting model circuit breaker legislation. I predict a citizen-initiated constitutional amendment for property tax reform will qualify for the 2028 ballot if the legislature doesn't act first. Florida's initiative process requires 891,589 signatures — aggressive but achievable for an issue with 70%+ popular support. Confidence: 65% on ballot initiative qualification; 80% that the legislature acts preemptively with some form of expanded relief to avoid a more radical citizen initiative.",
    public_finance:
      "My meta-prediction: Florida's property tax debate will become a national model regardless of the specific outcome. As housing appreciation drives property tax burdens higher in Sun Belt states (Texas, Arizona, Nevada, Georgia), the policy frameworks developed in Florida — whether circuit breakers, expanded exemptions, or something else — will be adopted by other states facing the same pressures. The interstate competition for retirees and remote workers makes property tax policy a growth variable in state economic strategy. I predict at least 5 states will adopt or expand income-linked property tax relief by 2032, with Florida as either the leader or the cautionary tale. Confidence: 75% on multi-state adoption; 60% that Florida leads rather than follows.",
  },
};

// ---- Infrastructure ----

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
      title: "Should Florida Eliminate Property Taxes for Homesteaded Residents?",
      prompt: "Evaluate whether Florida should eliminate property taxes for homesteaded residents. Consider the philosophical case against taxing illiquid wealth, the fiscal impact on local government services, housing market effects, revenue replacement options, distributional consequences, and comparative evidence from other jurisdictions.",
      templateId: "debate_v2",
      topicFormat: "scheduled_research",
      cadenceOverrideMinutes: 2,
      topicSource: "cron_auto",
      reason: "E2E test — Florida property tax elimination debate",
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
            body: { beingId: participant.beingId, body, stance: participant.stance, idempotencyKey: idempotencyKey(["fpt", "contrib", topic.id.slice(-12), currentRound.id.slice(-12), participant.beingId.slice(-12)]) },
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
            body: { beingId: participant.beingId, contributionId: target.contributionId, voteKind, idempotencyKey: idempotencyKey(["fpt", voteKind, topic.id.slice(-12), refreshedContext.currentRound.id.slice(-12), participant.beingId.slice(-12)]) },
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
  Title:          Should Florida Eliminate Property Taxes for Homesteaded Residents?
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
