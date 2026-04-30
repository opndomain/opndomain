import franklTopic from "../../../../content/research/math/frankl-union-closed/topic.json";
import franklPaper from "../../../../content/research/math/frankl-union-closed/paper.md";
import franklLedger from "../../../../content/research/math/frankl-union-closed/ledger.md";
import franklKilled from "../../../../content/research/math/frankl-union-closed/killed.md";
import franklFramework from "../../../../content/research/math/frankl-union-closed/transcripts/framework-2026-04-28-1437.md";
import franklK4 from "../../../../content/research/math/frankl-union-closed/transcripts/k4-derivation-2026-04-28-1906.md";
import franklK5 from "../../../../content/research/math/frankl-union-closed/transcripts/k5-residual-2026-04-29-1039.md";

import couplingTopic from "../../../../content/research/math/frankl-coupling-theorem/topic.json";
import couplingPaper from "../../../../content/research/math/frankl-coupling-theorem/paper.md";
import couplingLedger from "../../../../content/research/math/frankl-coupling-theorem/ledger.md";
import couplingBase from "../../../../content/research/math/frankl-coupling-theorem/transcripts/base-2026-04-29-1325.md";
import couplingAlien from "../../../../content/research/math/frankl-coupling-theorem/transcripts/alien-constraint-2026-04-29-1412.md";
import couplingCross from "../../../../content/research/math/frankl-coupling-theorem/transcripts/cross-domain-2026-04-29-1443.md";
import couplingSynthesis from "../../../../content/research/math/frankl-coupling-theorem/transcripts/synthesis-2026-04-29-1525.md";

import sunflowerTopic from "../../../../content/research/math/sunflower-barrier-theorem/topic.json";
import sunflowerPaper from "../../../../content/research/math/sunflower-barrier-theorem/paper.md";
import sunflowerLedger from "../../../../content/research/math/sunflower-barrier-theorem/ledger.md";
import sunflowerWorkshop from "../../../../content/research/math/sunflower-barrier-theorem/transcripts/workshop-2026-04-29-1741.md";

import batteryTopic from "../../../../content/research/science/battery-energy-density/topic.json";
import batteryPaper from "../../../../content/research/science/battery-energy-density/paper.md";
import batteryLedger from "../../../../content/research/science/battery-energy-density/ledger.md";
import batteryWorkshop from "../../../../content/research/science/battery-energy-density/transcripts/workshop-2026-04-29-1237.md";

import starshipTopic from "../../../../content/research/science/starship-heat-shield/topic.json";
import starshipPaper from "../../../../content/research/science/starship-heat-shield/paper.md";
import starshipLedger from "../../../../content/research/science/starship-heat-shield/ledger.md";
import starshipWorkshop from "../../../../content/research/science/starship-heat-shield/transcripts/workshop-2026-04-29-1300.md";
import starshipRun2 from "../../../../content/research/science/starship-heat-shield/transcripts/run2-cross-domain-2026-04-30.md";

import llmEmergentTopic from "../../../../content/research/ai/llm-emergent-thought/topic.json";
import llmEmergentPaper from "../../../../content/research/ai/llm-emergent-thought/paper.md";
import llmEmergentLedger from "../../../../content/research/ai/llm-emergent-thought/ledger.md";
import llmEmergentWorkshop from "../../../../content/research/ai/llm-emergent-thought/transcripts/workshop-2026-04-30-0633.md";

import type { ResearchDomain, TopicStatus } from "@opndomain/shared";

export type TopicHarnessModel = {
  label: string;
  role: string;
};

export type TopicHarnessStats = {
  totalRuns: number;
  approxComputeHours: number;
  models: TopicHarnessModel[];
  killedClaims: number;
  distinctLemmas: number;
  distinctDeadApproaches: number;
};

export type TranscriptRef = {
  slug: string;
  label: string;
};

export type RelatedTopicRef = {
  slug: string;
  label: string;
  domain: ResearchDomain;
};

export type TopicMeta = {
  slug: string;
  domain: ResearchDomain;
  title: string;
  subtitle?: string;
  summary: string;
  framingNote?: string;
  status: TopicStatus;
  publishedAt: string;
  lastUpdatedAt: string;
  continuedBy?: string;
  harness?: TopicHarnessStats;
  relatedTopics?: RelatedTopicRef[];
};

export type TopicRecord = {
  meta: TopicMeta;
  paper: string;
  ledger?: string;
  killed?: string;
  transcripts: Record<string, { label: string; body: string }>;
};

export type DomainMeta = {
  slug: ResearchDomain;
  title: string;
  blurb: string;
};

export const DOMAINS: DomainMeta[] = [
  { slug: "math", title: "Math", blurb: "Combinatorics, additive/multiplicative number theory, set systems, geometric inequalities." },
  { slug: "science", title: "Science", blurb: "Physics, biology, climate, materials. Falsifiable empirical questions." },
  { slug: "ai", title: "AI", blurb: "Large language models, emergent reasoning, multi-agent harnesses, alignment-adjacent formal questions." },
  { slug: "economics", title: "Economics", blurb: "Mechanism design, market microstructure, macro forecasting, public finance." },
  { slug: "finance", title: "Finance", blurb: "Asset pricing, derivatives, fixed income, risk modelling, market microstructure." },
];

const FRANKL: TopicRecord = {
  meta: franklTopic as TopicMeta,
  paper: franklPaper,
  ledger: franklLedger,
  killed: franklKilled,
  transcripts: {
    "framework-2026-04-28-1437": {
      label: "Run 1 — framework (multi-model)",
      body: franklFramework,
    },
    "k4-derivation-2026-04-28-1906": {
      label: "Run 2 — k=4 bound derivation",
      body: franklK4,
    },
    "k5-residual-2026-04-29-1039": {
      label: "Run 10 — k=5 no-go synthesis",
      body: franklK5,
    },
  },
};

const COUPLING: TopicRecord = {
  meta: couplingTopic as TopicMeta,
  paper: couplingPaper,
  ledger: couplingLedger,
  transcripts: {
    "synthesis-2026-04-29-1525": {
      label: "Run 4 — synthesis: cubic invariants, exact decoder, anti-congestion as the surviving obstruction",
      body: couplingSynthesis,
    },
    "cross-domain-2026-04-29-1443": {
      label: "Run 3 — cross-domain, the quadratic observable Q_x",
      body: couplingCross,
    },
    "alien-constraint-2026-04-29-1412": {
      label: "Run 2 — alien-constraint, defect form + tensor blow-up",
      body: couplingAlien,
    },
    "base-2026-04-29-1325": {
      label: "Run 1 — base, transport inequality + augmentation-success mark",
      body: couplingBase,
    },
  },
};

const SUNFLOWER: TopicRecord = {
  meta: sunflowerTopic as TopicMeta,
  paper: sunflowerPaper,
  ledger: sunflowerLedger,
  transcripts: {
    "workshop-2026-04-29-1741": {
      label: "Run 1 — adversarial workshop: original target falsified, link-only impossibility proven",
      body: sunflowerWorkshop,
    },
  },
};

const BATTERY: TopicRecord = {
  meta: batteryTopic as TopicMeta,
  paper: batteryPaper,
  ledger: batteryLedger,
  transcripts: {
    "workshop-2026-04-29-1237": {
      label: "Run 1 — workshop: ledger floors, exact wet-stack ceiling, separator-mass impossibility",
      body: batteryWorkshop,
    },
  },
};

const STARSHIP: TopicRecord = {
  meta: starshipTopic as TopicMeta,
  paper: starshipPaper,
  ledger: starshipLedger,
  transcripts: {
    "run2-cross-domain-2026-04-30": {
      label: "Run 2 — cross-domain: local mechanism-wise TPS floor, methane no-go, leading-edge exclusion",
      body: starshipRun2,
    },
    "workshop-2026-04-29-1300": {
      label: "Run 1 — workshop: shallow-entry law, acreage continuation, sharp-edge impossibility",
      body: starshipWorkshop,
    },
  },
};

const LLM_EMERGENT: TopicRecord = {
  meta: llmEmergentTopic as TopicMeta,
  paper: llmEmergentPaper,
  ledger: llmEmergentLedger,
  transcripts: {
    "workshop-2026-04-30-0633": {
      label: "Run 1 — workshop: emergence-score refinement, phase-transition theorems, verifier-schedule no-go",
      body: llmEmergentWorkshop,
    },
  },
};

const TOPICS_BY_DOMAIN: Record<ResearchDomain, TopicRecord[]> = {
  math: [FRANKL, COUPLING, SUNFLOWER],
  science: [BATTERY, STARSHIP],
  ai: [LLM_EMERGENT],
  economics: [],
  finance: [],
};

export function listDomains(): DomainMeta[] {
  return DOMAINS;
}

export function getDomain(slug: string): DomainMeta | null {
  return DOMAINS.find((d) => d.slug === slug) ?? null;
}

export function listTopicsInDomain(slug: ResearchDomain): TopicRecord[] {
  return TOPICS_BY_DOMAIN[slug] ?? [];
}

export function getTopic(domainSlug: string, topicSlug: string): TopicRecord | null {
  const records = TOPICS_BY_DOMAIN[domainSlug as ResearchDomain] ?? [];
  return records.find((r) => r.meta.slug === topicSlug) ?? null;
}

export function listAllTopics(): TopicRecord[] {
  return DOMAINS.flatMap((d) => TOPICS_BY_DOMAIN[d.slug]);
}

export function listRecentTopics(limit: number): TopicRecord[] {
  return [...listAllTopics()]
    .sort((a, b) => (a.meta.lastUpdatedAt < b.meta.lastUpdatedAt ? 1 : -1))
    .slice(0, limit);
}
