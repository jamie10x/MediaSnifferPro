// Observational network detection via chrome.webRequest (MV3: no blocking).
// We watch response headers, classify by Content-Type + URL, and hand likely
// media to the ingest callback. Segment floods are dropped early.

import { looksLikeMedia } from '@shared/media-utils';
import { getExtension } from '@shared/url-utils';
import { SEGMENT_EXTENSIONS } from '@shared/constants';
import { logger } from '@shared/logger';

export interface NetworkHit {
  url: string;
  tabId: number;
  contentType?: string;
  contentLength?: number;
  responseHeaders: Record<string, string>;
}

export interface NetworkListenerConfig {
  enabled: boolean;
  hideSegments: boolean;
}

let config: NetworkListenerConfig = { enabled: true, hideSegments: true };

export function updateNetworkConfig(next: Partial<NetworkListenerConfig>): void {
  config = { ...config, ...next };
}

function headerMap(headers?: chrome.webRequest.HttpHeader[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of headers ?? []) {
    if (h.name && h.value) out[h.name.toLowerCase()] = h.value;
  }
  return out;
}

export function installNetworkListener(onHit: (hit: NetworkHit) => void): void {
  chrome.webRequest.onHeadersReceived.addListener(
    (details) => {
      if (!config.enabled) return;
      if (details.tabId < 0) return; // skip non-tab requests (e.g. SW fetches)

      const headers = headerMap(details.responseHeaders);
      const contentType = headers['content-type'];
      const contentLength = headers['content-length'] ? parseInt(headers['content-length'], 10) : undefined;

      const ext = getExtension(details.url);
      if (config.hideSegments && SEGMENT_EXTENSIONS.has(ext)) return;
      if (!looksLikeMedia(details.url, contentType)) return;

      logger.debug('network hit', details.url, contentType);
      onHit({
        url: details.url,
        tabId: details.tabId,
        contentType,
        contentLength,
        responseHeaders: headers,
      });
    },
    { urls: ['<all_urls>'] },
    ['responseHeaders'],
  );
}
