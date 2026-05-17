import type { TTranscriptHitRegion, TTranscriptVisualRow } from "./types.js";

export function findTranscriptHitRegion(
  visualRow: TTranscriptVisualRow | undefined,
  x: number,
): TTranscriptHitRegion | null {
  if (!visualRow) return null;
  for (const region of visualRow.hitRegions) {
    if (x >= region.x0 && x < region.x1) return region;
  }
  return null;
}
