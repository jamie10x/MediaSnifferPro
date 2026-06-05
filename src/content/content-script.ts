// Content script: orchestrates the DOM/shadow/performance/metadata detectors,
// dedups locally, and reports candidates + page signals to the background.

import type { ContentInbound, ContentMessage, RawCandidate } from '@shared/message-types';
import { detectFromRoot, detectMetadata, detectPageThumbnail } from './dom-detector';
import { detectInShadowDom } from './shadow-dom-detector';
import { detectFromPerformance } from './performance-detector';
import { collectPageSignals, installPageSignalProbes } from './page-signal-detector';
import { observeMediaChanges } from './media-element-observer';
import { isTopFrame, updateWidget } from './in-page-widget';

installPageSignalProbes();

const reported = new Set<string>();

function collectAll(): RawCandidate[] {
  const all: RawCandidate[] = [
    ...detectFromRoot(document),
    ...detectInShadowDom(),
    ...detectFromPerformance(),
    ...detectMetadata(),
  ];
  // Local dedup by raw URL before sending (background dedups canonically again).
  const seen = new Set<string>();
  return all.filter((c) => {
    if (!c.url || seen.has(c.url)) return false;
    seen.add(c.url);
    return true;
  });
}

function scanAndReport(force = false): void {
  const candidates = collectAll();
  const fresh = force ? candidates : candidates.filter((c) => !reported.has(c.url));
  fresh.forEach((c) => reported.add(c.url));

  const signals = collectPageSignals();
  const message: ContentMessage = {
    type: 'CANDIDATES_FOUND',
    candidates: fresh,
    signals,
    pageThumbnail: detectPageThumbnail(),
  };
  // Always send signals; only skip when there is genuinely nothing new.
  if (fresh.length > 0 || force) {
    void chrome.runtime.sendMessage(message).catch(() => {});
  } else {
    void chrome.runtime.sendMessage({ type: 'PAGE_SIGNALS', signals } satisfies ContentMessage).catch(() => {});
  }
}

// Initial scan + observe future changes.
scanAndReport(true);
observeMediaChanges(() => scanAndReport(false));

// Messages from the background: rescan, and in-page widget updates.
chrome.runtime.onMessage.addListener((msg: ContentInbound) => {
  if (msg?.type === 'RESCAN') {
    reported.clear();
    scanAndReport(true);
  } else if (msg?.type === 'WIDGET_UPDATE' && isTopFrame()) {
    updateWidget(msg.summary);
  }
});
