// Builds the non-sensitive headers (Referer/Origin/User-Agent — never cookies)
// the native downloader replays so Referer-checking CDNs serve segments.
//
// Priority: headers actually captured from the page's request > the media frame's
// URL > the page URL. The frame URL matters for embedded players (e.g. a vidsrc
// iframe inside streamzy): its segments expect the iframe's URL as Referer.

import type { MediaCandidate } from './types';
import { safeParseUrl } from './url-utils';

export interface ReplayHeaders {
  referer?: string;
  origin?: string;
  userAgent?: string;
}

function originOf(url: string | undefined): string | undefined {
  const u = url ? safeParseUrl(url) : null;
  return u ? u.origin : undefined;
}

export function buildReplayHeaders(candidate: MediaCandidate): ReplayHeaders | undefined {
  const referer = candidate.replayHeaders?.referer || candidate.frameUrl || candidate.pageUrl || undefined;
  const origin = candidate.replayHeaders?.origin || originOf(referer);
  const userAgent = candidate.replayHeaders?.userAgent;
  if (!referer && !origin && !userAgent) return undefined;
  return { referer, origin, userAgent };
}
