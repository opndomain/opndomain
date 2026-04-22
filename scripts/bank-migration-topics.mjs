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
    title: "Do migratory birds outperform human engineering in energy efficiency per unit distance?",
    prompt: "A Bar-tailed Godwit covers 8,400+ miles on stored body fat alone — no refueling, no external energy source. Before departure it converts roughly half its body weight to fuel and shrinks non-essential organs to reduce mass. It maintains continuous flapping flight for 11 days straight across the Pacific. Compare this biological system to the best human-engineered long-range autonomous systems: solar-powered drones, fuel cell aircraft, and long-endurance UAVs. On a joules-per-kilogram-per-kilometer basis, does the godwit's performance match or exceed engineered systems? What specific biological mechanisms — metabolic efficiency, muscle fiber composition, aerodynamic adaptation — account for the difference? Are there engineering lessons from avian migration that have not yet been applied to autonomous flight design?",
  },
  {
    domainId: "dom_biology",
    title: "Can any animal truly sleep while flying and what does that imply about consciousness?",
    prompt: "Bar-tailed Godwits fly continuously for 11+ days without landing. Frigate birds have been recorded sleeping in 10-second bursts during multi-day oceanic flights, using unihemispheric slow-wave sleep — shutting down half the brain while the other half maintains flight control. Alpine swifts stay airborne for 200+ consecutive days. Evaluate the evidence for in-flight sleep across species. Is unihemispheric sleep sufficient to maintain cognitive function over multi-day flights, or are these birds operating in a degraded neurological state that we would classify as severely sleep-deprived in mammals? What does the ability to partition consciousness across brain hemispheres imply about the nature of awareness? Does this challenge the assumption that sleep requires full disengagement from the environment?",
  },
  {
    domainId: "dom_biology",
    title: "Why do some animals undergo reversible organ shrinkage and could humans benefit from the same mechanism?",
    prompt: "Before their nonstop Pacific crossing, Bar-tailed Godwits temporarily shrink their digestive organs — stomach, intestines, liver, and kidneys — to reduce weight and free metabolic energy for flight. After landing they rapidly regrow these organs to resume feeding. This is not unique to godwits: pythons remodel their intestines after feeding, hibernating bears maintain bone density despite months of inactivity, and some frogs survive being frozen solid with reversible cellular damage. Evaluate the mechanisms behind reversible organ remodeling. Is this controlled atrophy or active disassembly? What molecular signals trigger shrinkage and regrowth? Could understanding these pathways lead to medical applications — preventing muscle wasting in bedridden patients, preserving organs for transplant, or enabling controlled tissue regeneration in humans?",
  },
  {
    domainId: "dom_neuroscience",
    title: "Is there an inherited map in the brain and how would evolution encode a specific route?",
    prompt: "Juvenile Bar-tailed Godwits navigate thousands of miles of open Pacific Ocean on their first migration without parental guidance or flock leadership — they depart weeks after the adults. This implies some component of the route is genetically encoded rather than learned. But encoding a specific geographic route in DNA is conceptually different from encoding a simple behavioral instinct. Evaluate the evidence for inherited spatial knowledge in migratory animals. What neural structures could store a rough route template — is it a compass heading, a sequence of waypoints, or a response pattern to environmental gradients? How would natural selection encode and update a multi-thousand-mile route across generations? What happens when the route becomes suboptimal due to climate change — can inherited navigation adapt fast enough?",
  },
  {
    domainId: "dom_biology",
    title: "What are the true limits of biological endurance and which species defines the frontier?",
    prompt: "Bar-tailed Godwits fly 8,400 miles nonstop. Arctic Terns migrate pole to pole covering 44,000 miles annually. Monarch butterflies navigate 3,000 miles across multiple generations. Salmon swim thousands of miles upstream to their birth stream to spawn. Humpback whales migrate 10,000+ miles round trip while fasting. Evaluate which species represents the most extreme endurance achievement when normalized for body mass, metabolic rate, and environmental challenge. Is there a theoretical ceiling to biological endurance set by thermodynamic constraints, or have we not yet discovered the true outliers? What physiological innovations — metabolic efficiency, oxygen transport, fuel storage, waste management — distinguish the endurance champions from related species that cannot perform similar feats?",
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
    id: `tcand_migration_${String(i + 1).padStart(2, "0")}_${Date.now().toString(36)}`,
    source: "backfill",
    sourceId: "manual-godwit-migration",
    sourceUrl: "https://opndomain.com",
    domainId: t.domainId,
    title: t.title,
    prompt: t.prompt,
    templateId: "debate",
    topicFormat: "rolling_research",
    cadenceFamily: "scheduled",
    cadenceOverrideMinutes: 3,
    minTrustTier: "unverified",
    priorityScore: 98,
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
