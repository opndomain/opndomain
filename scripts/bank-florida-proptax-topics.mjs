#!/usr/bin/env node

const ADMIN_CLIENT_ID = "cli_8308c04fc3a813a0e34435e08ec0c5f8";
const ADMIN_CLIENT_SECRET = "_1504zCRV7WRnBQ5dtZycHkcO7LxMsdC7P0Nkj5wTCM";
const API = "https://api.opndomain.com";

const topics = [
  {
    domainId: "dom_economics",
    title: "Would eliminating Florida's homestead property tax accelerate or reduce the housing affordability crisis?",
    prompt: "Florida's proposed constitutional amendment would eliminate property taxes for homesteaded residents — roughly $22 billion in annual revenue that funds schools, fire, police, and infrastructure. Proponents argue it stops taxing illiquid wealth and prevents retirees and working families from being priced out of homes they own. Critics argue elimination would spike home values (capitalizing the tax savings into prices), making it harder for new buyers while enriching existing owners. Evaluate both dynamics. Does removing the carrying cost of homeownership primarily help current owners or future buyers? What does evidence from jurisdictions with very low property taxes (Texas cities with high sales tax substitution, states with assessment caps) show about housing price effects? Would the benefit flow disproportionately to owners of expensive waterfront property rather than the working families the proposal claims to help?",
  },
  {
    domainId: "dom_economics",
    title: "Can Florida replace $22 billion in property tax revenue without an income tax?",
    prompt: "Florida's constitution prohibits a state income tax. If homestead property taxes are eliminated, roughly $22 billion in annual local government revenue must be replaced or cut. Proposed alternatives include increased sales tax, tourism taxes, transfer taxes on real estate transactions, and expanded gambling revenue. Florida already has one of the nation's most regressive tax structures — eliminating property tax and raising sales tax would shift the burden further toward consumption and lower-income residents. Evaluate the fiscal arithmetic. Which replacement mechanisms are realistic at scale? What happens to school funding, which depends heavily on local property tax millage? Is there a revenue replacement plan that doesn't either gut services or make the tax structure more regressive? What do other no-income-tax states (Texas, Tennessee, Nevada) teach about the limits of alternative revenue sources?",
  },
  {
    domainId: "dom_economics",
    title: "Is taxing homeowners on unrealized property appreciation fundamentally unjust?",
    prompt: "The philosophical case for eliminating homestead property taxes rests on a specific claim: it is unjust to tax people on unrealized gains in an illiquid asset they need to live in. A retiree who bought a Florida home for $120,000 in 1995 may now owe taxes on a $600,000 assessed value despite no change in income or ability to pay. Unlike capital gains tax, property tax is levied annually regardless of whether the owner has realized any gain or has the cash to pay. Opponents argue property taxes are the price of local services that maintain and increase property value — roads, schools, fire protection — and that owners who object can sell and capture the gain. Evaluate the philosophical and practical arguments. Is property tax more like a wealth tax on illiquid assets (unjust) or a user fee for local services (fair)? Does the Save Our Homes cap already address the hardship case? Are there targeted solutions (deferral, circuit breakers, senior freezes) that solve the hardship without eliminating the entire tax base?",
  },
  {
    domainId: "dom_economics",
    title: "Would eliminating homestead property taxes widen the gap between Florida residents and investors?",
    prompt: "Florida's proposal eliminates property taxes only for homesteaded residents — not for investors, landlords, commercial property, or second homes. This creates a sharp tax wedge: owner-occupants pay zero while investors and rental property owners continue paying full millage rates. Proponents frame this as protecting residents against speculators. Critics argue it would distort the housing market by making owner-occupancy artificially cheap relative to renting, discourage rental housing construction when Florida already has a rental shortage, and create a locked-in effect where homeowners never sell (similar to California's Prop 13). Evaluate the market distortion effects. Would the homestead-only exemption reduce rental housing supply? Would it create a new class of property-tax-free homeowners who resist any future tax changes because they benefit from the status quo? What happened in California after Prop 13 created similar asymmetries between long-term owners and new buyers?",
  },
  {
    domainId: "dom_economics",
    title: "Does Florida's property tax ballot measure represent sound tax reform or populist overreach?",
    prompt: "Constitutional tax amendments that are easy to pass and hard to repeal have a mixed track record. California's Prop 13 (1978) capped property tax assessments and is now widely regarded as having created severe fiscal dysfunction, school funding crises, and housing market distortions — but remains politically untouchable because existing homeowners benefit enormously. Florida's Save Our Homes amendment (1992) already caps assessment increases at 3% per year for homesteaded properties. The new proposal goes further: full elimination. Evaluate whether ballot-box tax policy produces good outcomes. Is the electorate equipped to weigh the second-order fiscal consequences of eliminating a $22 billion revenue source? What does the history of tax limitation ballot measures (Prop 13, Colorado's TABOR, Massachusetts Prop 2.5) reveal about long-term outcomes versus the promises made during campaigns? Is there a structural reason why property tax reforms passed by referendum tend toward excess?",
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
    id: `tcand_flproptax_${String(i + 1).padStart(2, "0")}_${Date.now().toString(36)}`,
    source: "backfill",
    sourceId: "florida-property-tax-ballot-2026",
    sourceUrl: "https://opndomain.com",
    domainId: t.domainId,
    title: t.title,
    prompt: t.prompt,
    templateId: "debate",
    topicFormat: "rolling_research",
    cadenceFamily: "scheduled",
    cadenceOverrideMinutes: 3,
    minTrustTier: "unverified",
    priorityScore: 97,
    publishedAt: null,
  }));

  const result = await fetch(`${API}/v1/internal/topic-candidates`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ items }),
  }).then((r) => r.json());

  const d = result.data || result;
  console.log(`Created: ${d.createdCount}  Updated: ${d.updatedCount}  Duplicates: ${d.duplicates?.length ?? 0}\n`);
  for (const t of topics) {
    console.log(`  [${t.domainId.replace("dom_", "")}] ${t.title}`);
  }
}

main().catch((e) => { console.error("FATAL:", e); process.exitCode = 1; });
