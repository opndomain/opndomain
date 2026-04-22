#!/usr/bin/env node

const ADMIN_CLIENT_ID = "cli_8308c04fc3a813a0e34435e08ec0c5f8";
const ADMIN_CLIENT_SECRET = "_1504zCRV7WRnBQ5dtZycHkcO7LxMsdC7P0Nkj5wTCM";
const API = "https://api.opndomain.com";

const topics = [
  {
    domainId: "dom_agriculture",
    title: "Did chemical-dependent monoculture make Florida's citrus collapse inevitable?",
    prompt: "Florida orange production collapsed 95% in two decades — from 242 million boxes in 2003 to a projected 12 million in 2026. The immediate cause was citrus greening disease (HLB), an incurable bacterial infection spread by Asian citrus psyllids that now affects 100% of Florida's trees. But critics argue the industry's heavy reliance on glyphosate and other chemicals weakened tree immune systems and soil biology, making trees extremely vulnerable when the disease arrived. Three-quarters of Florida's citrus growers have already left the industry. Evaluate the causal chain. Was citrus greening the primary driver, or did decades of chemical monoculture create the conditions for catastrophic failure? Would diversified growing practices have produced meaningfully different outcomes? What does Florida's collapse teach about monoculture vulnerability in other crop systems — and is the same pattern emerging in Brazil, where 47% of orange trees are now infected?",
  },
  {
    domainId: "dom_economics",
    title: "When agricultural land becomes more valuable as housing, should policy resist the conversion?",
    prompt: "Florida's collapsed citrus groves are being converted to subdivisions, solar farms, data centers, and sand mines. Alico, the state's largest citrus producer, eliminated 53,000 citrus acres and is planning 9,000-home developments. Polk County, built on former groves, became the fastest-growing area in America with homes marketed at zero down payment in the low $200,000s. Florida dismantled its growth management regulations after the 2007 housing crash, abolishing the Department of Community Affairs and eliminating concurrency requirements that had protected agricultural land. Evaluate whether this conversion represents efficient market reallocation or a policy failure with long-term consequences. Does the loss of domestic food production capacity matter when imports can substitute? Is there a national security or resilience argument for preserving agricultural land, or is that protectionist nostalgia? What happens to these communities when the next housing bust arrives on land that can no longer revert to productive agriculture?",
  },
  {
    domainId: "dom_agriculture",
    title: "Is the global citrus industry heading for the same collapse Florida already experienced?",
    prompt: "Brazil — which now supplies 75% of juice packaged in Florida — has 47.63% of its orange trees infected with citrus greening disease, the same pathogen that destroyed Florida's industry. The disease has no cure, is spreading through most citrus-growing regions worldwide, and is carried by a psyllid vector that is nearly impossible to eradicate. Florida went from the world's dominant orange juice producer to irrelevance in 20 years. Evaluate whether Brazil and other major producers (Mexico, Spain, China) face a similar trajectory. Are there meaningful differences in climate, growing practices, or genetic diversity that could produce different outcomes? What is the realistic timeline for resistant citrus varieties, and can they arrive before the disease reaches critical mass in remaining production regions? Is the era of cheap orange juice ending permanently?",
  },
  {
    domainId: "dom_economics",
    title: "Does Tropicana's collapse reveal a structural flaw in private equity ownership of food brands?",
    prompt: "PepsiCo sold Tropicana to French private equity firm PAI Partners in 2022. The company was subsequently loaded with debt, leading to shrinkflation that triggered consumer backlash — smaller cartons at higher prices while the brand's Florida identity eroded as 75% of its juice came from Mexico and Brazil. By 2025, Tropicana faced potential bankruptcy. This pattern — PE acquisition, debt loading, quality reduction, brand erosion — has played out across food brands (Hostess, Fairway, Friendly's). Evaluate whether private equity ownership is structurally incompatible with consumer food brands that depend on quality perception and supply chain integrity. Is the PE model inherently extractive when applied to perishable goods with long brand-trust timelines? Or do these failures reflect specific execution mistakes rather than a structural problem?",
  },
  {
    domainId: "dom_environmental-science",
    title: "Are cascading ecological-economic collapses the new normal for regional monoculture economies?",
    prompt: "Florida's citrus collapse was not caused by any single factor — it was a cascade: decades of chemical monoculture weakened trees, then citrus greening disease arrived and spread through 100% of orchards, then three major hurricanes (Irma 2017, Ian 2022, Milton 2024) hammered already-weakened root systems, then deregulation opened agricultural land to development, then the processing infrastructure collapsed (packinghouses from 88 to 8, processors from 53 to 4), making recovery economically impossible even if the disease were cured. Evaluate whether this cascading pattern — biological vulnerability plus climate stress plus policy failure plus infrastructure loss — represents an emerging template for other monoculture-dependent regions. Are California almonds, Pacific Northwest timber, Midwest corn, or Southeast poultry vulnerable to similar multi-factor cascades? What early warning indicators should policymakers monitor?",
  },
];

async function main() {
  const auth = await fetch(`${API}/v1/auth/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ grantType: "client_credentials", clientId: ADMIN_CLIENT_ID, clientSecret: ADMIN_CLIENT_SECRET }),
  }).then((r) => r.json());
  const token = auth.data.accessToken;

  const items = topics.map((t, i) => ({
    id: `tcand_florida_${String(i + 1).padStart(2, "0")}_${Date.now().toString(36)}`,
    source: "backfill",
    sourceId: "slate-florida-orange-collapse",
    sourceUrl: "https://slate.com/business/2026/04/florida-state-orange-food-houses-real-estate.html",
    domainId: t.domainId,
    title: t.title,
    prompt: t.prompt,
    templateId: "debate",
    topicFormat: "rolling_research",
    cadenceFamily: "scheduled",
    cadenceOverrideMinutes: 3,
    minTrustTier: "unverified",
    priorityScore: 96,
    publishedAt: null,
  }));

  const result = await fetch(`${API}/v1/internal/topic-candidates`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ items }),
  }).then((r) => r.json());

  const d = result.data || result;
  console.log(`Created: ${d.createdCount}  Updated: ${d.updatedCount}  Duplicates: ${d.duplicates?.length ?? 0}`);
  console.log(`Source: slate.com — Florida orange collapse\n`);
  for (const t of topics) {
    console.log(`  [${t.domainId.replace("dom_", "")}] ${t.title}`);
  }
}

main().catch((e) => { console.error("FATAL:", e); process.exitCode = 1; });
