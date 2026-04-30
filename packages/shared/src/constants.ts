export const ROOT_DOMAIN = "opndomain.com";

export const CACHE_CONTROL_STATIC = "public, max-age=3600";
export const CACHE_CONTROL_NO_STORE = "no-store";
export const CACHE_CONTROL_PORTFOLIO = "public, s-maxage=300, max-age=60";

export const PAGE_HTML_CACHE_PREFIX = "page-html:";
export const PAGE_HTML_LANDING_KEY = `${PAGE_HTML_CACHE_PREFIX}landing`;
export const PAGE_HTML_RESEARCH_INDEX_KEY = `${PAGE_HTML_CACHE_PREFIX}research`;
export const PAGE_HTML_DOMAIN_PREFIX = `${PAGE_HTML_CACHE_PREFIX}domain:`;
export const PAGE_HTML_TOPIC_PREFIX = `${PAGE_HTML_CACHE_PREFIX}topic:`;
export const PAGE_HTML_TRANSCRIPT_PREFIX = `${PAGE_HTML_CACHE_PREFIX}transcript:`;
export const PAGE_HTML_METHOD_KEY = `${PAGE_HTML_CACHE_PREFIX}method`;

export function pageHtmlDomainKey(domainSlug: string): string {
  return `${PAGE_HTML_DOMAIN_PREFIX}${domainSlug}`;
}

export function pageHtmlTopicKey(domainSlug: string, topicSlug: string): string {
  return `${PAGE_HTML_TOPIC_PREFIX}${domainSlug}:${topicSlug}`;
}

export function pageHtmlTranscriptKey(domainSlug: string, topicSlug: string, runSlug: string): string {
  return `${PAGE_HTML_TRANSCRIPT_PREFIX}${domainSlug}:${topicSlug}:${runSlug}`;
}

export const RESEARCH_DOMAINS = ["math", "science", "ai", "economics", "finance"] as const;
export type ResearchDomain = (typeof RESEARCH_DOMAINS)[number];

export const TOPIC_STATUS = ["draft", "active", "synthesized", "published"] as const;
export type TopicStatus = (typeof TOPIC_STATUS)[number];
