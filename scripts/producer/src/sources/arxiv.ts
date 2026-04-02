import { XMLParser } from "fast-xml-parser";
import type { SourceAdapter, SourceItem } from "../types.js";

const ARXIV_CATEGORIES: Record<string, string[]> = {
  "cs.AI": ["dom_ai-safety", "dom_machine-learning"],
  "cs.LG": ["dom_machine-learning"],
  "cs.CL": ["dom_machine-learning", "dom_linguistics"],
  "cs.CR": ["dom_cybersecurity"],
  "cs.SE": ["dom_software-engineering"],
  "stat.ML": ["dom_statistics", "dom_machine-learning"],
  "econ.GN": ["dom_economics"],
  "q-bio.GN": ["dom_biology", "dom_biotechnology"],
  "physics.soc-ph": ["dom_physics", "dom_sociology"],
};

const parser = new XMLParser({ ignoreAttributes: false });

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchCategory(category: string, limit: number, suggestedDomains: string[]): Promise<SourceItem[]> {
  const url = `http://export.arxiv.org/api/query?search_query=cat:${category}&sortBy=submittedDate&sortOrder=descending&max_results=${limit}`;

  const response = await fetch(url, {
    headers: { "User-Agent": "opndomain-producer/0.1" },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    console.error(`arXiv API returned ${response.status} for ${category}`);
    return [];
  }

  const xml = await response.text();
  const parsed = parser.parse(xml) as Record<string, unknown>;
  const feed = parsed.feed as Record<string, unknown> | undefined;
  let entries = feed?.entry;
  if (!entries) return [];
  if (!Array.isArray(entries)) entries = [entries];

  const items: SourceItem[] = [];
  for (const entry of entries as Array<Record<string, unknown>>) {
    const id = String(entry.id ?? "");
    const arxivId = id.replace("http://arxiv.org/abs/", "").replace(/v\d+$/, "");
    const title = String(entry.title ?? "").replace(/\s+/g, " ").trim();
    const summary = String(entry.summary ?? "").replace(/\s+/g, " ").trim();
    const published = String(entry.published ?? "");

    if (!arxivId || !title) continue;

    items.push({
      source: "arxiv",
      sourceId: arxivId,
      sourceUrl: `https://arxiv.org/abs/${arxivId}`,
      title,
      summary: summary.slice(0, 1000),
      publishedAt: published || new Date().toISOString(),
      suggestedDomains: suggestedDomains,
    });
  }

  return items;
}

export function createArxivAdapter(): SourceAdapter {
  return {
    name: "arxiv",
    async fetch({ limit }) {
      const categories = Object.entries(ARXIV_CATEGORIES);
      const perCategory = Math.max(3, Math.ceil(limit / categories.length));
      const items: SourceItem[] = [];

      for (const [category, domains] of categories) {
        try {
          const results = await fetchCategory(category, perCategory, domains);
          items.push(...results);
        } catch (error) {
          console.error(`arXiv fetch failed for ${category}:`, error instanceof Error ? error.message : error);
        }
        await sleep(3000);
      }

      return items.slice(0, limit);
    },
  };
}
