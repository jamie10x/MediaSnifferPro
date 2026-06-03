// Privacy: a tab's detected media is purged when it closes or navigates to a new
// document. Nothing about browsing survives beyond the live tab.

import { clearTab, setPageInfo } from './candidate-store';
import { getDomain } from '@shared/url-utils';
import { logger } from '@shared/logger';

export function installTabLifecycle(onCleared: (tabId: number) => void): void {
  chrome.tabs.onRemoved.addListener((tabId) => {
    void clearTab(tabId).then(() => onCleared(tabId));
  });

  // onCommitted fires for real top-frame document navigations (SPA history
  // updates fire onHistoryStateUpdated instead), so this is the right purge point.
  chrome.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId !== 0) return;
    void clearTab(details.tabId)
      .then(() => setPageInfo(details.tabId, details.url, getDomain(details.url)))
      .then(() => onCleared(details.tabId));
    logger.debug('cleared tab on navigation', details.tabId);
  });
}
