// Offscreen document: runs the long-lived, DOM/blob-dependent stream download +
// remux work that an MV3 service worker cannot. Receives jobs from the background,
// reports progress, and hands back a blob URL for chrome.downloads.

import type { OffscreenEvent, OffscreenRequest } from '@shared/message-types';
import { downloadHlsStream } from './stream-downloader';

function emit(event: OffscreenEvent): void {
  void chrome.runtime.sendMessage(event).catch(() => {});
}

chrome.runtime.onMessage.addListener((message: OffscreenRequest) => {
  if (message?.type !== 'OFFSCREEN_START_STREAM') return;
  void runJob(message);
});

async function runJob(message: OffscreenRequest): Promise<void> {
  const { job } = message;
  try {
    const result = await downloadHlsStream(job.playlistUrl, {
      concurrency: job.concurrency,
      onProgress: (p) =>
        emit({
          type: 'OFFSCREEN_PROGRESS',
          jobId: job.jobId,
          progress: {
            percent: p.percent,
            downloadedBytes: p.downloadedBytes,
            currentStep: p.currentStep,
          },
        }),
    });

    const blobUrl = URL.createObjectURL(result.blob);
    emit({
      type: 'OFFSCREEN_READY',
      jobId: job.jobId,
      blobUrl,
      filename: `${job.outputBasename}.${result.extension}`,
      engine: result.engine,
    });
  } catch (err) {
    const code = (err as { code?: string })?.code === 'native_required' ? 'native_required' : 'stream_failed';
    emit({
      type: 'OFFSCREEN_FAILED',
      jobId: job.jobId,
      error: { code, message: err instanceof Error ? err.message : 'unknown' },
    });
  }
}

// Allow the background to revoke a finished blob URL to free memory.
chrome.runtime.onMessage.addListener((message: { type?: string; blobUrl?: string }) => {
  if (message?.type === 'OFFSCREEN_REVOKE' && message.blobUrl) {
    URL.revokeObjectURL(message.blobUrl);
  }
});
