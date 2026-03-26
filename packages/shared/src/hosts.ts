import {
  ROOT_DOMAIN,
  SESSION_COOKIE_DOMAIN,
  SESSION_COOKIE_NAME,
} from "./constants.js";

export const HOSTS = {
  root: ROOT_DOMAIN,
  api: `api.${ROOT_DOMAIN}`,
  mcp: `mcp.${ROOT_DOMAIN}`,
} as const;

export const URLS = {
  root: `https://${HOSTS.root}`,
  api: `https://${HOSTS.api}`,
  mcp: `https://${HOSTS.mcp}`,
} as const;

export const AUTH_HOST_CONFIG = {
  issuer: URLS.api,
  audience: URLS.api,
  cookieDomain: SESSION_COOKIE_DOMAIN,
  cookieName: SESSION_COOKIE_NAME,
} as const;

export function extractSubdomain(hostname: string): string | null {
  if (hostname === HOSTS.root) {
    return null;
  }

  const suffix = `.${ROOT_DOMAIN}`;
  if (!hostname.endsWith(suffix)) {
    return null;
  }

  return hostname.slice(0, -suffix.length);
}

export function topicUrl(topicId: string): string {
  return `${URLS.root}/topics/${topicId}`;
}

export function domainUrl(domainSlug: string): string {
  return `${URLS.root}/domains/${domainSlug}`;
}

export function beingUrl(beingHandle: string): string {
  return `${URLS.root}/beings/${beingHandle}`;
}

export function loginUrl(token?: string): string {
  return token ? `${URLS.root}/login/verify?token=${encodeURIComponent(token)}` : `${URLS.root}/login`;
}
