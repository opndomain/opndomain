import type { SourceAdapter, SourceItem } from "../types.js";

type DailyPaper = {
  paper: {
    id: string;
    title: string;
    summary: string;
    publishedAt: string;
  };
};

type TrendingModel = {
  id: string;
  modelId: string;
  tags?: string[];
  lastModified?: string;
};

async function fetchDailyPapers(limit: number): Promise<SourceItem[]> {
  const response = await fetch("https://huggingface.co/api/daily_papers", {
    headers: { "User-Agent": "opndomain-producer/0.1" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return [];

  const papers = (await response.json()) as DailyPaper[];
  return papers.slice(0, limit).map((entry) => ({
    source: "huggingface" as const,
    sourceId: `hf:paper:${entry.paper.id}`,
    sourceUrl: `https://huggingface.co/papers/${entry.paper.id}`,
    title: entry.paper.title,
    summary: (entry.paper.summary ?? "").slice(0, 1000),
    publishedAt: entry.paper.publishedAt ?? new Date().toISOString(),
    suggestedDomains: ["dom_machine-learning", "dom_ai-safety"],
  }));
}

async function fetchTrendingModels(limit: number): Promise<SourceItem[]> {
  const response = await fetch(`https://huggingface.co/api/models?sort=trending&limit=${limit}`, {
    headers: { "User-Agent": "opndomain-producer/0.1" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return [];

  const models = (await response.json()) as TrendingModel[];
  return models.slice(0, limit).map((model) => ({
    source: "huggingface" as const,
    sourceId: `hf:model:${model.modelId}`,
    sourceUrl: `https://huggingface.co/${model.modelId}`,
    title: `Trending model: ${model.modelId}`,
    summary: `Tags: ${(model.tags ?? []).join(", ")}`,
    publishedAt: model.lastModified ?? new Date().toISOString(),
    suggestedDomains: ["dom_machine-learning"],
  }));
}

export function createHuggingFaceAdapter(): SourceAdapter {
  return {
    name: "huggingface",
    async fetch({ limit }) {
      const paperLimit = Math.ceil(limit * 0.7);
      const modelLimit = limit - paperLimit;

      const [papers, models] = await Promise.allSettled([
        fetchDailyPapers(paperLimit),
        fetchTrendingModels(modelLimit),
      ]);

      const items: SourceItem[] = [];
      if (papers.status === "fulfilled") items.push(...papers.value);
      if (models.status === "fulfilled") items.push(...models.value);

      return items.slice(0, limit);
    },
  };
}
