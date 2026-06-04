// Quality auto-selection + which candidates are eligible for batch download.

import type { MediaCandidate } from './types';
import type { Settings } from './constants';

/** Choose a variant id for a candidate based on the user's quality preference. */
export function pickVariantId(candidate: MediaCandidate, preferred: Settings['preferredQuality']): string | undefined {
  const vs = candidate.variants;
  if (!vs || vs.length === 0) return undefined;
  // Only consider downloadable (clear) variants.
  const usable = vs.filter((v) => v.supportStatus === 'requires_native' || v.supportStatus === 'downloadable_clear');
  const pool = usable.length ? usable : vs;
  const sorted = [...pool].sort((a, b) => (b.height ?? 0) - (a.height ?? 0) || (b.bandwidth ?? 0) - (a.bandwidth ?? 0));
  if (preferred === 'lowest') return sorted[sorted.length - 1]!.id;
  return sorted[0]!.id; // 'highest' and 'ask' default to best
}

/** The media URL to download for a candidate, honoring an explicit/auto variant. */
export function resolveDownloadUrl(candidate: MediaCandidate, variantId?: string): string {
  if (variantId) {
    const v = candidate.variants?.find((x) => x.id === variantId);
    if (v?.playlistUrl) return v.playlistUrl;
  }
  return candidate.url;
}

/** True if this candidate is a real downloadable item (not junk/protected). */
export function isBatchDownloadable(candidate: MediaCandidate): boolean {
  if (candidate.isSegment) return false;
  return candidate.supportStatus === 'downloadable' || candidate.supportStatus === 'needs_native_companion';
}
