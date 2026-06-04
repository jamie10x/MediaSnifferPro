// Observational network detection via chrome.webRequest (MV3: no blocking).
//
// Two complementary listeners, because players vary wildly:
//   1. onBeforeRequest   — earliest signal, classifies by URL pattern alone.
//      Catches `.m3u8`/`.mpd`/direct media even when the Content-Type is missing
//      or non-standard (e.g. vidsrc-style query-laden playlist URLs in iframes).
//   2. onHeadersReceived — classifies by Content-Type for URLs with no useful
//      extension, and records the real byte size.
// We also capture Referer/Origin/User-Agent per stream URL (NOT cookies) so the
// native companion can replay the request against Referer-checking CDNs.

import { looksLikeMedia } from '@shared/media-utils';
import { getExtension } from '@shared/url-utils';
import { HLS_EXTENSIONS, DASH_EXTENSIONS, SEGMENT_EXTENSIONS } from '@shared/constants';
import { logger } from '@shared/logger';

export interface CapturedHeaders {
  referer?: string;
  origin?: string;
  userAgent?: string;
}

export interface NetworkHit {
  url: string;
  tabId: number;
  contentType?: string;
  contentLength?: number;
  responseHeaders?: Record<string, string>;
  requestHeaders?: CapturedHeaders;
}

export interface NetworkListenerConfig {
  enabled: boolean;
  hideSegments: boolean;
}

let config: NetworkListenerConfig = { enabled: true, hideSegments: true };

export function updateNetworkConfig(next: Partial<NetworkListenerConfig>): void {
  config = { ...config, ...next };
}

// Captured request headers keyed by URL (small LRU-ish cap).
const headerCache = new Map<string, CapturedHeaders>();
function rememberHeaders(url: string, headers: CapturedHeaders): void {
  if (headerCache.size > 500) headerCache.clear();
  headerCache.set(url, headers);
}
export function getCapturedHeaders(url: string): CapturedHeaders | undefined {
  return headerCache.get(url);
}

function headerMap(headers?: chrome.webRequest.HttpHeader[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of headers ?? []) {
    if (h.name && h.value) out[h.name.toLowerCase()] = h.value;
  }
  return out;
}

// URL-only media check: look at the path (ignoring query) for a known media or
// manifest extension *anywhere*, not just at the very end.
function urlLooksLikeMedia(url: string): boolean {
  if (url.startsWith('blob:') || url.startsWith('data:')) return false;
  const ext = getExtension(url);
  if (HLS_EXTENSIONS.has(ext) || DASH_EXTENSIONS.has(ext)) return true;
  // Some CDNs put the manifest mid-path: /index.m3u8/... or ?file=master.mpd
  return /\.(m3u8|mpd)(\b|[/?#%])/i.test(url) || /[?&](?:file|url|src)=[^&]*\.(m3u8|mpd)/i.test(url);
}

function isSegment(url: string): boolean {
  return SEGMENT_EXTENSIONS.has(getExtension(url));
}

export function installNetworkListener(onHit: (hit: NetworkHit) => void): void {
  // 1) Earliest, URL-based detection.
  chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
      if (!config.enabled || details.tabId < 0) return;
      if (config.hideSegments && isSegment(details.url)) return;
      if (!urlLooksLikeMedia(details.url)) return;
      logger.debug('network(beforeRequest) hit', details.url);
      onHit({ url: details.url, tabId: details.tabId, requestHeaders: headerCache.get(details.url) });
    },
    { urls: ['<all_urls>'] },
  );

  // 2) Capture Referer/Origin/User-Agent for replay by the native companion.
  chrome.webRequest.onSendHeaders.addListener(
    (details) => {
      if (details.tabId < 0) return;
      if (!urlLooksLikeMedia(details.url) && !isSegment(details.url)) return;
      const h = headerMap(details.requestHeaders);
      rememberHeaders(details.url, { referer: h['referer'], origin: h['origin'], userAgent: h['user-agent'] });
    },
    { urls: ['<all_urls>'] },
    ['requestHeaders'],
  );

  // 3) Content-Type based detection + real size.
  chrome.webRequest.onHeadersReceived.addListener(
    (details) => {
      if (!config.enabled || details.tabId < 0) return;
      const headers = headerMap(details.responseHeaders);
      const contentType = headers['content-type'];
      const contentLength = headers['content-length'] ? parseInt(headers['content-length'], 10) : undefined;

      if (config.hideSegments && isSegment(details.url)) return;
      if (!looksLikeMedia(details.url, contentType) && !urlLooksLikeMedia(details.url)) return;

      logger.debug('network(headers) hit', details.url, contentType);
      onHit({
        url: details.url,
        tabId: details.tabId,
        contentType,
        contentLength,
        responseHeaders: headers,
        requestHeaders: headerCache.get(details.url),
      });
    },
    { urls: ['<all_urls>'] },
    ['responseHeaders'],
  );
}
