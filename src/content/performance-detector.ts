// Detects media already loaded by the page using the Performance Resource Timing
// API. Catches files fetched by custom players that never touch the DOM.

import type { RawCandidate } from '@shared/message-types';
import { VIDEO_EXTENSIONS, AUDIO_EXTENSIONS, HLS_EXTENSIONS, DASH_EXTENSIONS } from '@shared/constants';
import { getExtension } from '@shared/url-utils';

function isInteresting(url: string): boolean {
  const ext = getExtension(url);
  return (
    VIDEO_EXTENSIONS.has(ext) ||
    AUDIO_EXTENSIONS.has(ext) ||
    HLS_EXTENSIONS.has(ext) ||
    DASH_EXTENSIONS.has(ext)
  );
}

export function detectFromPerformance(): RawCandidate[] {
  const out: RawCandidate[] = [];
  let entries: PerformanceResourceTiming[];
  try {
    entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (!isInteresting(entry.name)) continue;
    out.push({ url: entry.name, source: 'performance', pageTitle: document.title });
  }
  return out;
}
