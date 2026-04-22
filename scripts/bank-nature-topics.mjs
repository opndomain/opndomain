#!/usr/bin/env node

const ADMIN_CLIENT_ID = "cli_8308c04fc3a813a0e34435e08ec0c5f8";
const ADMIN_CLIENT_SECRET = "_1504zCRV7WRnBQ5dtZycHkcO7LxMsdC7P0Nkj5wTCM";
const API = "https://api.opndomain.com";

const topics = [
  {
    domainId: "dom_biology",
    title: "Why do trees in a forest avoid touching their canopy neighbors?",
    prompt: "Crown shyness is a well-documented phenomenon where tree canopies maintain gaps between neighboring crowns, creating channel-like patterns visible from below. Proposed mechanisms include abrasion from wind-driven branch contact, light-sensing growth inhibition, and allelopathic chemical signaling. Evaluate the competing hypotheses. Is crown shyness a single mechanism or a convergent outcome of multiple independent strategies? What experiments would distinguish between the leading explanations? Does the pattern vary meaningfully across species, climates, or forest types in ways that favor one hypothesis over another?",
  },
  {
    domainId: "dom_biology",
    title: "Can slime molds solve optimization problems that challenge conventional algorithms?",
    prompt: "Physarum polycephalum has been shown to replicate efficient network topologies including the Tokyo rail system and motorway networks. Evaluate the strength of these claims. Are slime molds genuinely solving optimization problems, or are researchers over-interpreting simple chemotactic behavior through selective comparison? What are the actual computational limits of slime mold networks? Could bio-inspired algorithms derived from Physarum outperform existing heuristics for real-world routing and network design problems, or is this primarily a demonstration curiosity?",
  },
  {
    domainId: "dom_biology",
    title: "Why do some animals produce biofluorescence and what survival advantage does it confer?",
    prompt: "Biofluorescence has been discovered in an expanding list of species including platypuses, flying squirrels, scorpions, sea turtles, and dozens of fish species. In many cases no clear adaptive function has been established. Evaluate the competing hypotheses: species recognition, mate signaling, predator confusion, UV protection byproduct, or no adaptive function at all. Is the widespread distribution of biofluorescence across unrelated taxa evidence of convergent adaptation or a metabolic side effect that selection has not acted on? What experimental designs could distinguish functional biofluorescence from incidental fluorescence?",
  },
  {
    domainId: "dom_environmental-science",
    title: "Is the wood wide web of mycorrhizal networks actually cooperative or exploitative?",
    prompt: 'The popular narrative of the "wood wide web" describes mycorrhizal fungal networks as cooperative infrastructure through which mature trees share nutrients with seedlings and kin. Recent critiques argue the evidence for directed resource sharing is weak, that fungi are extracting carbon in a parasitic or market-like exchange rather than facilitating tree cooperation, and that the "mother tree" narrative has outrun the data. Evaluate the primary evidence on both sides. What do isotope tracing studies actually show about net resource flow direction? Is the cooperative framing scientifically supported, a useful simplification, or actively misleading?',
  },
  {
    domainId: "dom_biology",
    title: "Why do starling murmurations never collide and can the coordination model scale to autonomous systems?",
    prompt: "Starling murmurations involve thousands of birds executing rapid collective maneuvers without centralized coordination or collisions. The standard explanation invokes simple local rules \u2014 each bird tracks its nearest 6-7 neighbors for speed, direction, and separation. But the emergent global coherence, including rapid wavefront propagation and predator-response dynamics, may require more than three-rule boid models. Evaluate what is actually known about the information transfer mechanism. How does the flock achieve near-instantaneous collective turns? Are there implications for autonomous vehicle coordination, drone swarms, or distributed robotics that go beyond the existing boid-model implementations?",
  },
  {
    domainId: "dom_physics",
    title: "Do migrating animals use quantum effects in their biological compasses?",
    prompt: "The radical pair mechanism hypothesis proposes that European robins and other migratory birds sense Earth\u2019s magnetic field through quantum coherent spin states in cryptochrome proteins in their retinas. Recent experiments show that radical pair lifetimes in cryptochrome are long enough for magnetic field effects, and RF interference at specific frequencies disrupts bird navigation in ways consistent with the quantum model. Evaluate the evidence. Is the radical pair mechanism the leading explanation for avian magnetoreception, or are competing hypotheses (magnetite-based sensors, trigeminal nerve pathways) equally or more viable? What would constitute a definitive test? If confirmed, what does a functioning biological quantum sensor imply for our understanding of quantum biology?",
  },
  {
    domainId: "dom_biology",
    title: "Why does convergent evolution produce nearly identical solutions across unrelated species?",
    prompt: "Eyes evolved independently at least 40 times. Echolocation arose separately in bats and dolphins. Camera-eye cephalopods and vertebrates arrived at strikingly similar optical designs through completely independent lineages. Is convergent evolution evidence that the space of viable biological solutions is far more constrained than the theoretical design space suggests? Are there deep physical or developmental constraints that channel evolution toward a small number of attractors? Or is convergence overstated \u2014 are the similarities more superficial than they appear when examined at the molecular level? Evaluate the leading frameworks: developmental constraint, adaptive landscape theory, and structural channeling.",
  },
  {
    domainId: "dom_biology",
    title: "Can tardigrades survive conditions that no evolutionary pressure could have selected for?",
    prompt: 'Tardigrades survive vacuum, extreme radiation, temperatures from near absolute zero to 150\u00b0C, and pressures six times greater than the deepest ocean trench. None of these conditions exist in their natural habitats. The standard explanation is that their survival mechanisms (trehalose vitrification, DNA repair proteins like Dsup, intrinsically disordered proteins) evolved for desiccation resistance and happen to confer broader tolerances as a byproduct. Evaluate this explanation. Is the "desiccation preadaptation" hypothesis sufficient to explain the full range of tardigrade extremotolerance, or does the breadth of survival suggest something deeper about their molecular architecture? What are the limits of the preadaptation framework, and what alternative explanations have been proposed?',
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
    id: `tcand_nature_${String(i + 1).padStart(2, "0")}_${Date.now().toString(36)}`,
    source: "backfill",
    sourceId: "manual-nature-bank",
    sourceUrl: "https://opndomain.com",
    domainId: t.domainId,
    title: t.title,
    prompt: t.prompt,
    templateId: "debate",
    topicFormat: "rolling_research",
    cadenceFamily: "scheduled",
    cadenceOverrideMinutes: 3,
    minTrustTier: "unverified",
    priorityScore: 95,
    publishedAt: null,
  }));

  const result = await fetch(`${API}/v1/internal/topic-candidates`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ items }),
  }).then((r) => r.json());

  const d = result.data || result;
  console.log(`Created: ${d.createdCount}  Updated: ${d.updatedCount}  Duplicates: ${d.duplicates?.length ?? 0}`);
  for (const t of topics) {
    console.log(`  [${t.domainId.replace("dom_", "")}] ${t.title}`);
  }
}

main().catch((e) => { console.error("FATAL:", e); process.exitCode = 1; });
