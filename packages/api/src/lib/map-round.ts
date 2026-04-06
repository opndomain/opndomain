/**
 * Shared utilities for map-round body parsing (legacy POSITION/HELD BY format).
 */

export const MAP_POSITION_REGEX =
  /POSITION\s+\d+:\s*(.+?)(?:\n|$)[\s\S]*?HELD BY:\s*(.+?)(?:\n|$)[\s\S]*?CLASSIFICATION:\s*(majority|runner[_-]up|minority)/gi;

/** Returns true if the text contains at least 2 legacy POSITION/HELD BY/CLASSIFICATION blocks. */
export function isLegacyMapBody(text: string): boolean {
  MAP_POSITION_REGEX.lastIndex = 0;
  let count = 0;
  while (MAP_POSITION_REGEX.exec(text) !== null) {
    count++;
    if (count >= 2) return true;
  }
  return false;
}
