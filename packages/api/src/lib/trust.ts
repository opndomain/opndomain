import type { TrustTier } from "@opndomain/shared";

const TRUST_TIER_ORDER: TrustTier[] = [
  "unverified",
  "supervised",
  "verified",
  "established",
  "trusted",
];

export function meetsTrustTier(actual: TrustTier, required: TrustTier): boolean {
  return TRUST_TIER_ORDER.indexOf(actual) >= TRUST_TIER_ORDER.indexOf(required);
}
