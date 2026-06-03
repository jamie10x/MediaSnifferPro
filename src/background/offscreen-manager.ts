// Manages the offscreen document lifecycle and dispatches in-browser stream
// download jobs to it. The offscreen doc does the heavy fetching + remuxing that
// an MV3 service worker cannot.

import type { StreamDownloadJob } from '@shared/message-types';
import { logger } from '@shared/logger';

const OFFSCREEN_PATH = 'src/offscreen/offscreen.html';
let creating: Promise<void> | null = null;

async function hasOffscreen(): Promise<boolean> {
  // chrome.offscreen.hasDocument exists in recent Chrome; fall back to getContexts.
  const offscreen = chrome.offscreen as unknown as { hasDocument?: () => Promise<boolean> };
  if (typeof offscreen.hasDocument === 'function') {
    return offscreen.hasDocument();
  }
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType],
  });
  return contexts.length > 0;
}

export async function ensureOffscreen(): Promise<void> {
  if (await hasOffscreen()) return;
  if (creating) return creating;
  creating = chrome.offscreen
    .createDocument({
      url: OFFSCREEN_PATH,
      reasons: ['BLOBS' as chrome.offscreen.Reason],
      justification: 'Download and remux clear HLS media segments into a single file.',
    })
    .catch((err) => {
      // Another path may have created it concurrently — ignore "already exists".
      logger.debug('createDocument', err);
    })
    .finally(() => {
      creating = null;
    });
  return creating;
}

export async function startStreamJob(job: StreamDownloadJob): Promise<void> {
  await ensureOffscreen();
  await chrome.runtime.sendMessage({ type: 'OFFSCREEN_START_STREAM', job });
}

export function revokeBlob(blobUrl: string): void {
  void chrome.runtime.sendMessage({ type: 'OFFSCREEN_REVOKE', blobUrl }).catch(() => {});
}

export async function closeOffscreenIfIdle(activeJobCount: number): Promise<void> {
  if (activeJobCount > 0) return;
  if (await hasOffscreen()) {
    try {
      await chrome.offscreen.closeDocument();
    } catch (err) {
      logger.debug('closeDocument', err);
    }
  }
}
