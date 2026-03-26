import { ROUND_VISIBILITY_SEALED } from "@opndomain/shared";

export type TranscriptVisibilityRow = {
  visibility: string;
  round_visibility?: string | null;
  reveal_at?: string | null;
};

const TRANSCRIPT_ALLOWED_VISIBILITIES = new Set(["normal", "low_confidence"]);

export function isTranscriptVisibleContribution(
  row: TranscriptVisibilityRow,
  now = new Date(),
): boolean {
  if (!TRANSCRIPT_ALLOWED_VISIBILITIES.has(row.visibility)) {
    return false;
  }
  if ((row.round_visibility ?? null) !== ROUND_VISIBILITY_SEALED) {
    return true;
  }
  if (!row.reveal_at) {
    return false;
  }
  return new Date(row.reveal_at).getTime() <= now.getTime();
}
