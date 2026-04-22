#!/usr/bin/env node

const ADMIN_CLIENT_ID = "cli_8308c04fc3a813a0e34435e08ec0c5f8";
const ADMIN_CLIENT_SECRET = "_1504zCRV7WRnBQ5dtZycHkcO7LxMsdC7P0Nkj5wTCM";
const API = "https://api.opndomain.com";

const topics = [
  {
    domainId: "dom_economics",
    title: "Will AI automation shift scarcity from goods to human relationships rather than causing mass unemployment?",
    prompt: "Alex Imas argues that AI will trigger structural economic change similar to the agricultural and industrial revolutions — not mass unemployment but a reallocation of labor toward relational services where human involvement is intrinsic to value. The thesis: as AI makes commodity production cheap, people will spend their growing wealth disproportionately on education, healthcare, hospitality, therapy, and personal services. Income effects account for over 75% of observed structural change historically. Evaluate this claim. Is the historical analogy to agriculture-to-manufacturing-to-services valid for AI, or does AI differ in kind because it automates cognitive work, not just physical labor? Can the relational sector realistically absorb the displaced workforce? What are the strongest counterarguments — and does the framework account for AI that penetrates relational services themselves (AI therapists, AI tutors)?",
  },
  {
    domainId: "dom_economics",
    title: "Does human-made exclusivity actually command durable price premiums over AI-generated equivalents?",
    prompt: "Experimental research by Alex Imas and colleagues found that human-made artwork gained 44% in value from exclusivity framing, but AI-generated artwork gained less than half that (21%). Willingness to pay roughly doubled when subjects learned a random subset of people would be excluded from owning the item. The implication: AI goods feel inherently reproducible and cannot sustain exclusivity premiums the way human-made goods can. Evaluate the strength and generalizability of this evidence. Does the exclusivity premium for human provenance hold outside art — in food, fashion, professional services, software? Is this a durable psychological effect or a transitional novelty response that will fade as AI becomes normalized? Could AI-generated goods eventually develop their own exclusivity signals (limited editions, unique generation seeds, creator reputation)?",
  },
  {
    domainId: "dom_economics",
    title: "Are mimetic preferences a strong enough force to prevent AI-driven demand collapse?",
    prompt: "Mimetic desire theory (wanting what others want, especially when excluded) is proposed as a structural mechanism that prevents economic satiation even when production costs approach zero. The argument: as AI makes goods cheap, humans redirect desire toward scarce relational experiences and status goods where exclusion is part of the value. Nonhomothetic preferences — wanting fundamentally different things when richer — provide release valves against demand collapse. Evaluate whether mimetic preferences operate at sufficient scale to absorb majority economic activity. Is wanting-what-others-want a robust enough engine to sustain employment and GDP growth, or is it a niche luxury-market phenomenon being overextended to macroeconomics? What happens in societies where status competition takes non-consumption forms?",
  },
  {
    domainId: "dom_economics",
    title: "Do billionaire spending patterns reliably predict where the mass market will shift next?",
    prompt: "BLS Consumer Expenditure Survey data shows the top income quintile spends 4.3x more than average overall, but far greater multiples on relational services — personal chefs, private education, concierge healthcare, bespoke experiences. The thesis: wealthy consumption patterns are leading indicators of where mass-market spending will migrate as AI raises average incomes. Historical precedent: restaurants, air travel, and personal electronics all started as luxury goods before becoming mass-market. Evaluate this predictive framework. Does trickle-down consumption actually work as a reliable forecasting mechanism? What luxury categories have NOT become mass-market despite decades of income growth? Are there structural reasons why some relational services (private tutoring, concierge medicine) resist democratization even as incomes rise?",
  },
  {
    domainId: "dom_economics",
    title: "Will Baumol's cost disease make human-delivered services unaffordable even as AI makes goods cheap?",
    prompt: "Baumol's cost disease predicts that as productivity rises in automatable sectors, the relative cost of human-delivered services (education, healthcare, live performance, personal care) increases because they cannot be made more efficient without changing their nature. If AI dramatically reduces goods production costs but relational services resist automation, the price gap widens. The optimistic view: rising incomes from AI productivity gains will cover the higher relative cost. The pessimistic view: the cost disease makes human services a luxury that only the wealthy can afford, creating a two-tier economy where most people get AI substitutes. Evaluate both scenarios. Does the income effect reliably outpace the cost disease? What determines which outcome prevails — and for whom?",
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
    id: `tcand_scarcity_${String(i + 1).padStart(2, "0")}_${Date.now().toString(36)}`,
    source: "backfill",
    sourceId: "imas-what-will-be-scarce",
    sourceUrl: "https://aleximas.substack.com/p/what-will-be-scarce",
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
  console.log(`Source: aleximas.substack.com/p/what-will-be-scarce\n`);
  for (const t of topics) {
    console.log(`  [${t.domainId.replace("dom_", "")}] ${t.title}`);
  }
}

main().catch((e) => { console.error("FATAL:", e); process.exitCode = 1; });
