// Persistent download-history types. Stored locally only (chrome.storage.local),
// never uploaded.

import type { MediaType } from './types';

export type HistoryStatus = 'completed' | 'failed' | 'cancelled';

export interface HistoryEntry {
  id: string;
  jobId: string;
  filename: string;
  pageTitle: string;
  pageUrl: string;
  domain: string;
  mediaType: MediaType;
  quality?: string;
  sizeBytes?: number;
  status: HistoryStatus;
  outputPath?: string; // native downloads
  via: 'browser' | 'native';
  createdAt: number;

  /** Compact snapshot to support one-click re-download (no live candidate needed). */
  redownload?: {
    url: string;
    mediaType: MediaType;
    pageTitle: string;
    pageUrl: string;
    frameUrl?: string;
    replayHeaders?: { referer?: string; origin?: string; userAgent?: string };
    variantId?: string;
  };
}
