import franklTopic from "../../../../content/research/math/frankl-union-closed/topic.json";
import franklPaper from "../../../../content/research/math/frankl-union-closed/paper.md";
import franklLedger from "../../../../content/research/math/frankl-union-closed/ledger.md";
import franklKilled from "../../../../content/research/math/frankl-union-closed/killed.md";
import franklFramework from "../../../../content/research/math/frankl-union-closed/transcripts/framework-2026-04-28-1437.md";
import franklK4 from "../../../../content/research/math/frankl-union-closed/transcripts/k4-derivation-2026-04-28-1906.md";
import franklK5 from "../../../../content/research/math/frankl-union-closed/transcripts/k5-residual-2026-04-29-1039.md";

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

export type TopicMeta = {
  slug: string;
  domain: ResearchDomain;
  title: string;
  subtitle?: string;
  summary: string;
  status: TopicStatus;
  publishedAt: string;
  lastUpdatedAt: string;
  harness?: TopicHarnessStats;
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

const TOPICS_BY_DOMAIN: Record<ResearchDomain, TopicRecord[]> = {
  math: [FRANKL],
  science: [],
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
