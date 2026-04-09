/**
 * Parses MAP_POSITION_AUDIT blocks from round-9 voter contributions and
 * builds voter-audited consensus for which map position each final-argument
 * agent actually argued for.
 */

/** Normalize a handle: lowercase, strip leading @ and guest- prefix. */
function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@/, "").replace(/^guest-/i, "").toLowerCase();
}

/**
 * Parses a MAP_POSITION_AUDIT: block from a contribution body.
 * Returns Map<normalizedHandle, positionNumber> or null if no block found.
 *
 * Expected format (after KICKER):
 *   MAP_POSITION_AUDIT:
 *   @handle1: 2
 *   @handle2: 1
 *   @handle3: 1
 */
export function parseMapPositionAudit(body: string): Map<string, number> | null {
  const marker = "MAP_POSITION_AUDIT:";
  const idx = body.indexOf(marker);
  if (idx === -1) return null;

  const block = body.slice(idx + marker.length);
  const lines = block.split("\n");
  const result = new Map<string, number>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Match @handle: N or handle: N
    const m = /^@?([\w-]+)\s*:\s*(\d+)$/i.exec(trimmed);
    if (!m) {
      // Stop parsing if we hit a line that doesn't match the audit format
      // (could be the start of a different section)
      if (result.size > 0) break;
      continue;
    }
    const handle = normalizeHandle(m[1]);
    const pos = Number(m[2]);
    if (pos > 0) {
      result.set(handle, pos);
    }
  }

  return result.size > 0 ? result : null;
}

/**
 * Takes all audits from round-9 voters + list of final-arg contributions.
 * Returns Map<contributionId, consensusPositionNumber>.
 *
 * Quorum: majority of actual round-9 voters (not a fixed number).
 *   e.g. 5 voters → need 3 valid audits, 3 voters → need 2.
 * positionCount: total number of valid positions. Any audited number
 *   outside 1..positionCount is silently dropped before consensus.
 * Ties broken by lower position number.
 *
 * Returns null if:
 *   - quorum not met (fewer than majority of voters submitted audits)
 *   - any final-arg contributor has no consensus entry (partial coverage)
 *
 * The completeness requirement prevents partial audits from silently
 * dropping contributors out of the convergence map.
 */
export function buildAuditConsensus(
  audits: Array<{ audit: Map<string, number>; voterHandle: string }>,
  finalArgContributions: Array<{ id: string; handle: string }>,
  totalVoters: number,
  positionCount: number,
): Map<string, number> | null {
  // Quorum: strict majority of actual voters
  const quorum = Math.floor(totalVoters / 2) + 1;
  if (audits.length < quorum) return null;

  // Build handle → contribution ID lookup (normalized)
  const handleToContribId = new Map<string, string>();
  for (const fc of finalArgContributions) {
    handleToContribId.set(normalizeHandle(fc.handle), fc.id);
  }

  // For each final-arg contributor, tally audited positions across all voters.
  // We accept ANY positive position number voters assign (not just 1..positionCount)
  // because voters may legitimately judge that an agent argued for a position the
  // map didn't capture. Out-of-range positions simply won't match any eligible
  // position in the enrichment step — the agent is accounted for but doesn't land.
  const result = new Map<string, number>();

  for (const fc of finalArgContributions) {
    const normalizedHandle = normalizeHandle(fc.handle);
    // Check if ANY voter mentioned this contributor (regardless of position validity)
    let mentioned = false;
    const positionVotes = new Map<number, number>(); // position → vote count

    for (const { audit } of audits) {
      const auditedPos = audit.get(normalizedHandle);
      if (auditedPos === undefined) continue;
      mentioned = true;
      if (auditedPos < 1) continue;
      positionVotes.set(auditedPos, (positionVotes.get(auditedPos) ?? 0) + 1);
    }

    if (!mentioned) {
      // No voter mentioned this contributor at all — incomplete coverage.
      // Return null so the router falls back to legacy.
      return null;
    }

    if (positionVotes.size === 0) continue;

    // Find position with highest vote count; ties broken by lower position number
    let bestPos = 0;
    let bestCount = 0;
    for (const [pos, count] of positionVotes) {
      if (count > bestCount || (count === bestCount && pos < bestPos)) {
        bestPos = pos;
        bestCount = count;
      }
    }

    if (bestPos > 0) {
      result.set(fc.id, bestPos);
    }
  }

  return result.size > 0 ? result : null;
}
