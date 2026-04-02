import { XMLParser } from "fast-xml-parser";
import type { SourceAdapter, SourceItem } from "../types.js";

type FeedConfig = {
  url: string;
  suggestedDomains: string[];
};

const DEFAULT_FEEDS: FeedConfig[] = [
  // News
  { url: "https://feeds.bbci.co.uk/news/technology/rss.xml", suggestedDomains: ["dom_computer-science", "dom_tech-policy"] },
  { url: "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml", suggestedDomains: ["dom_climate-science", "dom_environmental-science"] },
  { url: "https://feeds.arstechnica.com/arstechnica/science", suggestedDomains: ["dom_physics", "dom_biology", "dom_medicine"] },
  { url: "https://feeds.arstechnica.com/arstechnica/technology-lab", suggestedDomains: ["dom_computer-science", "dom_software-engineering"] },
  { url: "https://rss.nytimes.com/services/xml/rss/nyt/Science.xml", suggestedDomains: ["dom_physics", "dom_biology", "dom_climate-science"] },
  { url: "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml", suggestedDomains: ["dom_tech-policy", "dom_ai-safety"] },
  { url: "https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml", suggestedDomains: ["dom_politics", "dom_governance"] },
  { url: "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml", suggestedDomains: ["dom_economics", "dom_finance", "dom_business-strategy"] },
];

const parser = new XMLParser({ ignoreAttributes: false });

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function extractItems(parsed: Record<string, unknown>): Array<Record<string, unknown>> {
  const rss = parsed.rss as Record<string, unknown> | undefined;
  const channel = rss?.channel as Record<string, unknown> | undefined;
  const items = channel?.item;

  if (Array.isArray(items)) return items as Array<Record<string, unknown>>;

  const feed = parsed.feed as Record<string, unknown> | undefined;
  const entries = feed?.entry;
  if (Array.isArray(entries)) return entries as Array<Record<string, unknown>>;

  return [];
}

function extractLink(item: Record<string, unknown>): string {
  if (typeof item.link === "string") return item.link;
  if (typeof item.link === "object" && item.link !== null) {
    const link = item.link as Record<string, unknown>;
    if (typeof link["@_href"] === "string") return link["@_href"];
  }
  if (typeof item.guid === "string") return item.guid;
  return "";
}

async function fetchFeed(feedConfig: FeedConfig, limit: number, since?: Date): Promise<SourceItem[]> {
  const items: SourceItem[] = [];

  try {
    const response = await fetch(feedConfig.url, {
      headers: { "User-Agent": "opndomain-producer/0.1" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return [];

    const xml = await response.text();
    const parsed = parser.parse(xml) as Record<string, unknown>;
    const rawItems = extractItems(parsed);

    for (const raw of rawItems.slice(0, limit)) {
      const title = String(raw.title ?? "").trim();
      const description = String(raw.description ?? raw.summary ?? raw.content ?? "").trim();
      const link = extractLink(raw);
      const pubDate = String(raw.pubDate ?? raw.published ?? raw.updated ?? "");
      const published = pubDate ? new Date(pubDate) : new Date();

      if (since && published < since) continue;
      if (!title || !link) continue;

      items.push({
        source: "rss",
        sourceId: `rss:${hashString(link)}`,
        sourceUrl: link,
        title,
        summary: description.slice(0, 1000),
        publishedAt: published.toISOString(),
        suggestedDomains: feedConfig.suggestedDomains,
      });
    }
  } catch (error) {
    console.error(`Failed to fetch RSS feed ${feedConfig.url}:`, error instanceof Error ? error.message : error);
  }

  return items;
}

export function createRssAdapter(feeds?: FeedConfig[]): SourceAdapter {
  const feedList = feeds ?? DEFAULT_FEEDS;

  return {
    name: "rss",
    async fetch({ limit, since }) {
      const perFeed = Math.max(5, Math.ceil(limit / feedList.length));
      const results = await Promise.allSettled(
        feedList.map((feed) => fetchFeed(feed, perFeed, since)),
      );

      const items: SourceItem[] = [];
      for (const result of results) {
        if (result.status === "fulfilled") {
          items.push(...result.value);
        }
      }

      return items.slice(0, limit);
    },
  };
}
