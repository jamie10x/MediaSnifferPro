// Desktop notifications for finished downloads. Respects the user's setting and
// fails silently if the notifications permission isn't granted.

import type { DownloadJob } from '@shared/types';
import { loadSettings } from '@shared/settings';
import { logger } from '@shared/logger';

// Map a notification id -> a click action the service worker can run.
const clickActions = new Map<string, () => void>();

export function installNotificationClicks(): void {
  if (!chrome.notifications?.onClicked) return;
  chrome.notifications.onClicked.addListener((id) => {
    clickActions.get(id)?.();
    chrome.notifications.clear(id);
    clickActions.delete(id);
  });
}

export async function notifyJobDone(job: DownloadJob, onClick?: () => void, posterUrl?: string): Promise<void> {
  const settings = await loadSettings();
  if (!settings.notificationsEnabled) return;
  if (!chrome.notifications?.create) return;

  const title =
    job.status === 'completed'
      ? 'Download complete'
      : job.status === 'cancelled'
        ? 'Download cancelled'
        : 'Download failed';
  const message =
    job.status === 'failed'
      ? `${job.outputFilename} — ${job.error?.message ?? 'error'}`
      : job.outputFilename;

  const id = `msp-${job.id}`;
  const base: chrome.notifications.NotificationOptions<true> = {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('public/icons/icon128.png'),
    title,
    message,
    silent: false,
  };
  // Rich image notification with the poster for completed downloads.
  const opts: chrome.notifications.NotificationOptions<true> =
    posterUrl && job.status === 'completed'
      ? { ...base, type: 'image', imageUrl: posterUrl }
      : base;
  try {
    chrome.notifications.create(id, opts);
    if (onClick) clickActions.set(id, onClick);
  } catch (err) {
    logger.debug('notify failed', err);
  }
}
