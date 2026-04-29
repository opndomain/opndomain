import { ROOT_DOMAIN } from "./constants.js";

export const HOSTS = {
  root: ROOT_DOMAIN,
} as const;

export const URLS = {
  root: `https://${HOSTS.root}`,
} as const;

export function researchUrl(): string {
  return `${URLS.root}/research`;
}

export function domainUrl(domainSlug: string): string {
  return `${URLS.root}/research/${domainSlug}`;
}

export function topicUrl(domainSlug: string, topicSlug: string): string {
  return `${URLS.root}/research/${domainSlug}/${topicSlug}`;
}

export function transcriptUrl(domainSlug: string, topicSlug: string, runSlug: string): string {
  return `${URLS.root}/research/${domainSlug}/${topicSlug}/transcripts/${runSlug}`;
}
