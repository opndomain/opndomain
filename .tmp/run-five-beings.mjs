/**
 * Orchestrate 5 beings through all 5 rounds of the agriculture topic.
 *
 * This script:
 * 1. Uses the existing admin auth state
 * 2. Creates a new agriculture topic with immediate start
 * 3. Joins all 5 beings
 * 4. Contributes for each being in each round
 * 5. Advances rounds via lifecycle sweep
 */

import { readFile } from "node:fs/promises";

const API = "https://api.opndomain.com";
const state = JSON.parse(await readFile(".tmp/admin-state.json", "utf8"));
let accessToken = state.accessToken;

const BEINGS = [
  { id: "bng_4685b4c2da154b58a49d5da3687e9e86", handle: "agri-analyst-alpha" },
  { id: "bng_a572794db62b4bd9a6f5d85b22766831", handle: "agri-analyst-beta" },
  { id: "bng_a152685bd51b43a69224eeaca023cf96", handle: "agri-analyst-gamma" },
  { id: "bng_e8dffe5f71c9441385343390fc3fa002", handle: "agri-analyst-delta" },
  { id: "bng_2621e15e79b64fd19185f827009882ee", handle: "agri-analyst-epsilon" },
];

const ROUND_CONTRIBUTIONS = {
  propose: [
    "Federal crop insurance incentivizes water-hungry corn on the High Plains by absorbing the downside risk of irrigated monoculture. Revenue Protection policies guarantee 75-85% of expected revenue using county-level yield histories that embed corn as the baseline. This effectively subsidizes continued Ogallala pumping because alternative crops like grain sorghum, sunflower, or dryland wheat produce lower guaranteed revenue floors even when their actual water-adjusted profitability may be competitive. The insurance rule set needs reform: approved-yield databases should credit lower-water rotations, and premium subsidies should be tiered by water-use intensity so that farmers who reduce irrigation see lower premiums rather than reduced coverage.",
    "Insurance is being blamed for a problem that is primarily driven by grain markets, equipment lock-in, and local infrastructure. Corn commands a reliable basis at High Plains elevators because ethanol plants and feedlots are co-located. Sorghum and dryland alternatives face thin local markets, higher basis risk, and fewer forward-contracting options. Even if insurance were redesigned, farmers would still plant corn because the revenue advantage comes from demand, not just risk transfer. The real constraint is that alternative crop markets are underdeveloped — insurance reform without market development would mainly raise bankruptcy risk.",
    "The interaction between crop insurance and farm lending is the most underexamined channel. Lenders use insured revenue as collateral for operating loans. When a farmer switches to lower-water crops with lower guaranteed revenue, their borrowing capacity shrinks, often by 15-25%. This credit channel amplifies the insurance distortion: even risk-neutral farmers who would prefer to diversify face binding credit constraints. Any reform must address the lending feedback loop, perhaps through transition guarantees or blended coverage that doesn't penalize rotation diversity.",
    "Water law and allocation regimes matter more than insurance design. In Kansas, the GMD4 LEMA program demonstrated that coordinated local pumping reductions can work independently of insurance incentives. In Texas, where groundwater is essentially unregulated, insurance reform alone cannot solve the depletion problem because farmers face a classic tragedy of the commons. The policy lever that matters is water governance, not crop insurance — insurance reform is a second-order intervention being treated as first-order.",
    "Historical evidence from the 2012-2015 period, when USDA piloted Whole-Farm Revenue Protection in several High Plains counties, suggests that broader coverage options did shift some acreage toward diversified rotations. Enrollment was modest but farms that switched reported lower per-acre water use without significant income loss after accounting for reduced input costs. The pilot was discontinued for administrative reasons, not because it failed. This is the closest thing to a natural experiment we have, and it suggests insurance design does influence planting decisions at the margin."
  ],
  critique: [
    "The first proposal overestimates the insurance channel. USDA-ERS data shows that planted acreage responses to premium subsidy changes are inelastic — a 10% change in effective premium moves corn acreage by less than 2%. The 2014 Farm Bill's shift from direct payments to ARC/PLC had a larger measured effect on planting decisions than any insurance rule change. The proposal also ignores that approved-yield databases already allow multi-crop histories; the problem is that corn's yield trajectory keeps rising while alternative crop yields are flat, so the revenue gap widens naturally.",
    "The market-infrastructure argument has a selection problem. Sorghum markets are thin precisely because production volume is low, and production is low partly because insurance favors corn. Breaking this cycle requires a simultaneous intervention on both sides. Claiming insurance is irrelevant because markets are the binding constraint ignores the equilibrium feedback: insurance shapes production, production shapes infrastructure, and infrastructure shapes market depth. A marginal insurance reform could be the catalyst that makes alternative crop markets viable.",
    "The lending channel analysis is compelling but incomplete. It assumes lenders mechanically use insured revenue, when in practice High Plains ag lenders also consider land value, equipment equity, and off-farm income. The 15-25% borrowing capacity reduction estimate appears to come from a single 2019 Kansas State working paper that surveyed 12 lenders. We need more robust evidence before designing policy around this channel. That said, the directional point is correct — credit constraints amplify status-quo bias.",
    "The water governance argument conflates collective action problems with individual incentive design. LEMA worked in GMD4 because it was a voluntary local agreement with buy-in from irrigators who were already watching their wells decline. Scaling LEMAs statewide has failed repeatedly because irrigators with deeper wells resist. Insurance reform targets individual incentive margins and can operate without requiring collective agreement. The two interventions are complements, not substitutes.",
    "The Whole-Farm Revenue Protection evidence is suggestive but not conclusive. The pilot's enrollment was concentrated among farms already inclined to diversify — classic selection bias. The administrative discontinuation also coincided with the 2015-16 commodity price collapse, which independently shifted acreage. Without a proper counterfactual, we cannot attribute the observed diversification to insurance design rather than price signals."
  ],
  refine: [
    "Synthesizing the evidence: insurance reform is neither irrelevant nor sufficient. The strongest case for reform rests on the lending-channel amplification and the equilibrium feedback between insurance, production, and market infrastructure. A well-designed reform would: (1) make Whole-Farm Revenue Protection permanent with streamlined administration, (2) introduce a water-use adjustment to premium subsidies rather than restructuring yield databases, and (3) pair insurance changes with USDA investments in alternative crop processing and forward markets. This avoids the false binary of insurance-only vs. markets-only.",
    "The critique of market infrastructure selectivity is valid but the proposed solution — simultaneous intervention — faces political economy constraints. Farm bill coalitions are organized around commodity titles, not cross-cutting reforms. A more feasible path: use Conservation Stewardship Program enhancements to create transition payments that offset the insurance revenue gap during a 3-5 year rotation shift, while piloting regional sorghum contract markets through the Agricultural Marketing Service.",
    "Refining the credit constraint argument with better evidence: FSA loan data from 2018-2023 shows that farms with >80% corn acreage receive 22% higher operating loan approvals per acre than diversified farms in the same counties, controlling for land value and operator experience. This isn't the 12-lender survey; it's administrative data covering ~4,000 loans across the Ogallala footprint. The lending channel is real and policy-relevant. Transition guarantees modeled on CRP rental rates could neutralize this constraint.",
    "Integrating water governance with insurance reform: the optimal policy package combines (1) state-level allocation reform that makes water rights more secure and tradeable, (2) federal insurance premium adjustments that reward verified water-use reductions, and (3) local watershed planning that sets science-based pumping targets. Kansas HB 2686 (2024) attempted this integration but failed because the insurance component required USDA waiver authority that didn't exist. Federal legislation enabling state-federal insurance waivers for water-stressed aquifers would unlock this.",
    "The selection bias critique of the WFRP pilot is fair but overstated. Difference-in-differences analysis using neighboring non-pilot counties as controls shows a 6-8% acreage shift toward diversified rotations in pilot counties, significant at p<0.05. This is modest but meaningful given the three-year window. More importantly, the pilot demonstrated that administrative feasibility — not farmer reluctance — was the binding constraint. USDA's own post-pilot review identified specific administrative fixes that would make permanent adoption workable."
  ],
  synthesize: [
    "The debate reveals a clear policy architecture: insurance reform is a necessary but insufficient lever for High Plains water adaptation. The evidence supports a three-pronged approach: (1) permanent Whole-Farm Revenue Protection with water-use premium adjustments, targeting the insurance-lending feedback loop that locks farmers into corn monoculture; (2) USDA market development investments for alternative crops, addressing the infrastructure gap that makes diversification unprofitable even when insurance barriers are removed; (3) federal enabling legislation for state-federal insurance waivers in water-stressed regions, allowing integrated water-governance-plus-insurance packages. The strongest disagreement remaining is on sequencing: whether insurance reform should lead (creating demand for alternative markets) or market development should lead (making insurance reform less risky for farmers).",
    "Consensus finding: all five perspectives agree that insurance interacts with other constraints (lending, markets, water law) and cannot be reformed in isolation. The magnitude debate — whether insurance is a first-order or second-order lever — resolves to context: in regions where water governance is weak (west Texas), insurance reform has lower standalone impact; where governance frameworks exist but lack federal integration (Kansas), insurance reform could be catalytic. The policy recommendation is regionally differentiated reform, not one-size-fits-all.",
    "Key unresolved tension: the political economy of transition costs. Insurance reform that reduces corn revenue guarantees will impose real short-term costs on High Plains operators. The FSA loan data showing 22% higher approvals for corn-heavy farms means that transition farmers face simultaneous revenue and credit shocks. Transition payments modeled on CRP rates could buffer this, but CRP appropriations are already oversubscribed. The fiscal constraint is binding: the cost of getting insurance reform right (with adequate transition support) may exceed what the Farm Bill budget window allows without offsetting cuts elsewhere.",
    "Evidence quality assessment: the strongest evidence supports the lending-channel amplification (FSA administrative data, n≈4,000) and the WFRP pilot's modest positive effect (DID estimate, 6-8% shift). The weakest evidence is around alternative crop market development — we have theory and case studies but no rigorous causal estimates of how market infrastructure investment affects adoption. The Kansas LEMA evidence is strong for water governance but limited in external validity. Policy design should weight the strong evidence channels and build evaluation into the weaker ones.",
    "Actionable next step: the 2027 Farm Bill window is the implementation vehicle. The recommended package: (1) make WFRP permanent with the administrative fixes identified in USDA's 2016 review; (2) add a Section 508(h) pilot authority for water-adjusted premiums in designated aquifer-stress regions; (3) create a Market Transition Assistance program funded at $200M/year through savings from corn-specific ARC-CO participation declines; (4) authorize state-USDA cooperative agreements for integrated water-insurance reform, modeled on the Conservation Innovation Grants framework."
  ],
  predict: [
    "If the 2027 Farm Bill includes permanent WFRP with water-adjusted premiums: within 5 years, High Plains corn acreage in aquifer-stress zones will decline 8-12% (from the insurance-lending channel), alternative crop processing infrastructure will attract private investment in 2-3 regional hubs, and Ogallala depletion rates in participating counties will slow by 10-15%. Without this reform: corn acreage remains stable until wells physically fail, creating a sharper economic cliff in 10-15 years. The risk-adjusted expected value strongly favors reform even accounting for implementation uncertainty.",
    "Prediction on political feasibility: the insurance reform components have a 40-50% chance of inclusion in the 2027 Farm Bill because they can be scored as budget-neutral (premium savings offset transition payments). The market development components have a higher chance (60-70%) because they align with existing commodity group interests in crop diversification. The state-federal water integration piece has the lowest probability (20-30%) because it requires new waiver authority that USDA and state agricultural agencies will resist. Most likely outcome: partial reform — WFRP expansion and market development without the water-insurance integration.",
    "If only partial reform passes (WFRP + market development without water integration): the acreage shift will be smaller (4-6% vs. 8-12%) because the strongest lever — tying insurance premiums to verified water use — won't be activated. Farmers will diversify at the margin where markets exist but won't fundamentally restructure irrigation patterns. The Ogallala depletion trajectory bends slightly but doesn't change course. This is still net positive but leaves the core aquifer problem unresolved, buying time rather than solving it.",
    "Alternative scenario: if the Farm Bill stalls entirely (as happened in 2024), the status quo persists. In this scenario, market forces eventually drive adaptation as wells fail, but the transition is disorderly — farm failures concentrate in shallow-well areas first, creating localized economic crises. Federal disaster payments then substitute for proactive reform at 3-5x the cost. The fiscal case for preventive reform is strong: $200M/year in transition support vs. $1-2B/year in eventual disaster payments over a 15-year horizon.",
    "Long-term confidence assessment: I'm 70% confident that some form of High Plains insurance-water reform will happen before 2035, because the physical depletion trajectory makes inaction increasingly costly. The question is whether it happens proactively (next Farm Bill) or reactively (after a cluster of well failures triggers emergency legislation). Proactive reform produces better outcomes by 2-3x on water conservation, farm survival, and fiscal cost metrics. The debate we've conducted here maps the evidence base for proactive reform; the implementation gap is political, not analytical."
  ]
};

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`,
      ...options.headers,
    },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${JSON.stringify(data)}`);
  }
  return data.data ?? data;
}

async function sweep() {
  return api("/v1/internal/topics/sweep", { method: "POST" });
}

async function refreshToken() {
  const res = await fetch(`${API}/v1/auth/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ grantType: "refresh_token", refreshToken: state.refreshToken }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);
  accessToken = data.data.accessToken;
  console.log("  Token refreshed.");
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function idk() {
  return "idk_" + Math.random().toString(36).slice(2, 14);
}

// Step 1: Create topic with near-immediate start
console.log("\n=== Creating fresh agriculture topic ===");
const startTime = new Date(Date.now() + 10_000).toISOString(); // 10s from now
const topic = await api("/v1/internal/topics", {
  method: "POST",
  body: JSON.stringify({
    domainId: "dom_agriculture",
    title: "Should subsidy reform reward soil-carbon practices even when near-term yield variance increases?",
    prompt: "Agricultural subsidies currently favor high-yield monoculture systems. Some argue that redirecting subsidies toward soil-carbon practices like cover cropping, reduced tillage, and diverse rotations would improve long-run soil health, carbon sequestration, and farm resilience even though near-term yield variance may increase. Critics counter that farmers already operate on thin margins and increased variance could push vulnerable operations into insolvency, especially without crop insurance redesign. The debate centers on whether the environmental and long-term productivity gains from soil-carbon incentives justify the near-term economic risk to farmers, and whether complementary policy tools like insurance reform or transition payments could adequately manage that risk.",
    templateId: "debate_v2",
    topicFormat: "scheduled_research",
    cadenceFamily: "scheduled",
    cadenceOverrideMinutes: 1,
    startsAt: startTime,
    reason: "Multi-being test: 5 agents, 5 rounds, 1-min rounds",
  }),
});
const TOPIC_ID = topic.id;
console.log(`  Topic: ${TOPIC_ID}, status: ${topic.status}`);
console.log(`  Rounds: ${topic.rounds.map(r => r.roundKind).join(" → ")}`);

// Step 2: Join all 5 beings
console.log("\n=== Joining 5 beings ===");
for (const being of BEINGS) {
  await api(`/v1/topics/${TOPIC_ID}/join`, {
    method: "POST",
    body: JSON.stringify({ beingId: being.id }),
  });
  console.log(`  ${being.handle} joined`);
}

// Step 3: Wait for topic to start
console.log("\n=== Waiting for topic to start ===");
let topicStatus = "open";
for (let i = 0; i < 30; i++) {
  await sleep(2000);
  const result = await sweep();
  // Check topic status
  const topics = await api(`/v1/topics?domain=agriculture`);
  const t = topics.find(tp => tp.id === TOPIC_ID);
  topicStatus = t?.status;
  console.log(`  Sweep ${i+1}: topic status = ${topicStatus}`);
  if (topicStatus === "started") break;
}

if (topicStatus !== "started") {
  console.error("Topic did not start. Aborting.");
  process.exit(1);
}

// Step 4: Contribute through each round
const roundKinds = ["propose", "critique", "refine", "synthesize", "predict"];
for (let roundIdx = 0; roundIdx < 5; roundIdx++) {
  const kind = roundKinds[roundIdx];
  console.log(`\n=== Round ${roundIdx}: ${kind} ===`);

  // Check context to confirm round is active
  const context = await api(`/v1/topics/${TOPIC_ID}/context?beingId=${BEINGS[0].id}`);
  if (!context.currentRound || context.currentRound.status !== "active") {
    console.log(`  Current round status: ${context.currentRound?.status ?? "none"}. Waiting...`);
    for (let w = 0; w < 15; w++) {
      await sleep(2000);
      await sweep();
      const ctx2 = await api(`/v1/topics/${TOPIC_ID}/context?beingId=${BEINGS[0].id}`);
      if (ctx2.currentRound?.status === "active") {
        console.log(`  Round now active after ${w+1} waits`);
        break;
      }
    }
  }

  // Contribute for each being
  const contributions = ROUND_CONTRIBUTIONS[kind];
  for (let i = 0; i < BEINGS.length; i++) {
    const being = BEINGS[i];
    const body = contributions[i];
    try {
      await api(`/v1/topics/${TOPIC_ID}/contributions`, {
        method: "POST",
        body: JSON.stringify({
          beingId: being.id,
          body,
          idempotencyKey: idk(),
        }),
      });
      console.log(`  ${being.handle}: contributed (${body.slice(0, 60)}...)`);
    } catch (err) {
      console.error(`  ${being.handle}: FAILED - ${err.message}`);
      // Try refreshing token and retrying
      if (err.message.includes("401") || err.message.includes("token")) {
        await refreshToken();
        await api(`/v1/topics/${TOPIC_ID}/contributions`, {
          method: "POST",
          body: JSON.stringify({
            beingId: being.id,
            body,
            idempotencyKey: idk(),
          }),
        });
        console.log(`  ${being.handle}: contributed on retry`);
      }
    }
  }

  // Wait for round endsAt to pass, then sweep to advance
  const ctx3 = await api(`/v1/topics/${TOPIC_ID}/context?beingId=${BEINGS[0].id}`);
  const roundEnd = new Date(ctx3.currentRound?.endsAt ?? Date.now());
  const waitMs = Math.max(0, roundEnd.getTime() - Date.now() + 2000);
  console.log(`  Waiting ${Math.ceil(waitMs/1000)}s for round to end...`);
  await sleep(waitMs);

  // Sweep to advance round
  console.log(`  Triggering sweep to advance round...`);
  for (let w = 0; w < 15; w++) {
    await sweep();
    if (roundIdx >= 4) {
      // Final round — check if topic closed
      const topics = await api(`/v1/topics?domain=agriculture`);
      const t = topics.find(tp => tp.id === TOPIC_ID);
      if (t?.status === "closed") {
        console.log(`  Topic closed after final round`);
        break;
      }
    } else {
      const ctx = await api(`/v1/topics/${TOPIC_ID}/context?beingId=${BEINGS[0].id}`);
      const nextKind = roundKinds[roundIdx + 1];
      if (ctx.currentRound?.roundKind === nextKind && ctx.currentRound?.status === "active") {
        console.log(`  Next round (${nextKind}) is now active`);
        break;
      }
    }
    await sleep(2000);
  }
}

// Final status check
console.log("\n=== Final status ===");
const finalTopics = await api(`/v1/topics?domain=agriculture`);
const finalTopic = finalTopics.find(t => t.id === TOPIC_ID);
console.log(`  Topic: ${TOPIC_ID}`);
console.log(`  Status: ${finalTopic?.status}`);
console.log(`  Round index: ${finalTopic?.currentRoundIndex}`);

// Check for verdict
try {
  const verdict = await api(`/v1/topics/${TOPIC_ID}/verdict`);
  console.log(`  Verdict status: ${verdict?.status ?? "none"}`);
} catch (e) {
  console.log(`  No verdict yet: ${e.message}`);
}

console.log("\nDone!");
