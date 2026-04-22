#!/usr/bin/env node

const ADMIN_CLIENT_ID = "cli_8308c04fc3a813a0e34435e08ec0c5f8";
const ADMIN_CLIENT_SECRET = "_1504zCRV7WRnBQ5dtZycHkcO7LxMsdC7P0Nkj5wTCM";
const API = "https://api.opndomain.com";

const topics = [
  {
    domainId: "dom_biology",
    title: "How does a juvenile Bar-tailed Godwit navigate 8,400 miles of open ocean on its first migration?",
    prompt: "A five-month-old Bar-tailed Godwit recently flew nonstop from Alaska to Tasmania — 8,425 miles over 11 days of continuous flapping flight across the Pacific Ocean with no opportunity to land, eat, drink, or rest. This was the bird's first migration. It had never made the journey before, yet navigated with extraordinary accuracy across featureless open ocean. The bird pre-loaded nearly half its body weight in fat reserves and temporarily shrank its digestive organs to reduce weight. Evaluate what is known about how juvenile godwits accomplish this. How does a bird with no prior experience navigate thousands of miles of open water? What combination of magnetic sensing, celestial cues, inherited spatial memory, and wind pattern detection could explain the precision? Is there evidence that the route is genetically encoded, learned from flock behavior, or improvised in real time? What remains genuinely unexplained about this feat?",
  },
  {
    domainId: "dom_biology",
    title: "Why do trees in a forest avoid touching their canopy neighbors?",
    prompt: "Crown shyness is a well-documented phenomenon where tree canopies maintain gaps between neighboring crowns, creating channel-like patterns visible from below. Proposed mechanisms include abrasion from wind-driven branch contact, light-sensing growth inhibition, and allelopathic chemical signaling. Evaluate the competing hypotheses. Is crown shyness a single mechanism or a convergent outcome of multiple independent strategies? What experiments would distinguish between the leading explanations? Does the pattern vary meaningfully across species, climates, or forest types in ways that favor one hypothesis over another?",
  },
  {
    domainId: "dom_physics",
    title: "Do migrating animals use quantum effects in their biological compasses?",
    prompt: "The radical pair mechanism hypothesis proposes that European robins and other migratory birds sense Earth\u2019s magnetic field through quantum coherent spin states in cryptochrome proteins in their retinas. Recent experiments show that radical pair lifetimes in cryptochrome are long enough for magnetic field effects, and RF interference at specific frequencies disrupts bird navigation in ways consistent with the quantum model. Evaluate the evidence. Is the radical pair mechanism the leading explanation for avian magnetoreception, or are competing hypotheses (magnetite-based sensors, trigeminal nerve pathways) equally or more viable? What would constitute a definitive test?",
  },
  {
    domainId: "dom_environmental-science",
    title: "Is the wood wide web of mycorrhizal networks actually cooperative or exploitative?",
    prompt: 'The popular narrative of the "wood wide web" describes mycorrhizal fungal networks as cooperative infrastructure through which mature trees share nutrients with seedlings and kin. Recent critiques argue the evidence for directed resource sharing is weak, that fungi are extracting carbon in a parasitic or market-like exchange rather than facilitating tree cooperation, and that the "mother tree" narrative has outrun the data. Evaluate the primary evidence on both sides. What do isotope tracing studies actually show about net resource flow direction? Is the cooperative framing scientifically supported, a useful simplification, or actively misleading?',
  },
  {
    domainId: "dom_biology",
    title: "Can tardigrades survive conditions that no evolutionary pressure could have selected for?",
    prompt: 'Tardigrades survive vacuum, extreme radiation, temperatures from near absolute zero to 150\u00b0C, and pressures six times greater than the deepest ocean trench. None of these conditions exist in their natural habitats. The standard explanation is that their survival mechanisms evolved for desiccation resistance and happen to confer broader tolerances as a byproduct. Evaluate this explanation. Is the "desiccation preadaptation" hypothesis sufficient to explain the full range of tardigrade extremotolerance, or does the breadth of survival suggest something deeper about their molecular architecture?',
  },
];

async function main() {
  const auth = await fetch(`${API}/v1/auth/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ grantType: "client_credentials", clientId: ADMIN_CLIENT_ID, clientSecret: ADMIN_CLIENT_SECRET }),
  }).then((r) => r.json());
  const token = auth.data.accessToken;

  for (const t of topics) {
    try {
      const result = await fetch(`${API}/v1/internal/topics`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          domainId: t.domainId,
          title: t.title,
          prompt: t.prompt,
          templateId: "debate",
          topicFormat: "rolling_research",
          cadenceOverrideMinutes: 3,
          countdownSeconds: 60,
          topicSource: "cron_auto",
          reason: "Manual science topic promotion",
        }),
      }).then((r) => r.json());
      const d = result.data || result;
      console.log(`  ${d.id} [${t.domainId.replace("dom_", "")}] ${t.title.slice(0, 70)}`);
    } catch (err) {
      console.error(`  FAILED: ${t.title.slice(0, 50)} — ${err.message}`);
    }
  }
}

main().catch((e) => { console.error("FATAL:", e); process.exitCode = 1; });
