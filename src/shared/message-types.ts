// Typed messaging contracts.
//   - Runtime messages: content <-> background <-> popup/options.
//   - Native messages: background <-> native companion (designed now, host stubbed).

import type { DownloadJob, EditSpec, MediaCandidate } from './types';

// ---------------------------------------------------------------------------
// Raw candidate payload sent from the content script (background enriches it).
// ---------------------------------------------------------------------------
export interface RawCandidate {
  url: string;
  source: MediaCandidate['source'];
  pageTitle: string;
  contentType?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  filename?: string;
  qualityLabel?: string;
  subtitles?: MediaCandidate['subtitles'];
  thumbnails?: MediaCandidate['thumbnails'];
  isBlob?: boolean;
}

export interface PageSignals {
  usesEme: boolean;
  usesMediaSource: boolean;
  hasBlobMedia: boolean;
}

// ---------------------------------------------------------------------------
// In-page widget (background -> content script)
// ---------------------------------------------------------------------------
export interface WidgetItem {
  id: string;
  label: string;
  mediaType: string;
  quality?: string;
  needsHelper: boolean;
}

export interface WidgetSummary {
  enabled: boolean;
  items: WidgetItem[];
  helperConnected: boolean;
}

export type ContentInbound =
  | { type: 'RESCAN' }
  | { type: 'WIDGET_UPDATE'; summary: WidgetSummary };

// ---------------------------------------------------------------------------
// content -> background
// ---------------------------------------------------------------------------
export type ContentMessage =
  | { type: 'CANDIDATES_FOUND'; candidates: RawCandidate[]; signals: PageSignals; pageThumbnail?: string }
  | { type: 'PAGE_SIGNALS'; signals: PageSignals };

// ---------------------------------------------------------------------------
// popup/options -> background  (request/response via sendMessage)
// ---------------------------------------------------------------------------
export type UiRequest =
  | { type: 'GET_STATE'; tabId?: number }
  | { type: 'RESCAN'; tabId: number }
  | { type: 'START_DOWNLOAD'; candidateId: string; variantId?: string; mode?: 'video' | 'audio' }
  | { type: 'DOWNLOAD_SUBTITLE'; candidateId: string; subtitleUrl: string; label?: string }
  | { type: 'EDIT_DOWNLOAD'; candidateId: string; edit: EditSpec }
  | { type: 'BATCH_DOWNLOAD'; candidateIds: string[] }
  | { type: 'CANCEL_DOWNLOAD'; jobId: string }
  | { type: 'RETRY_JOB'; jobId: string }
  | { type: 'PAUSE_DOWNLOAD'; jobId: string }
  | { type: 'RESUME_DOWNLOAD'; jobId: string }
  | { type: 'OPEN_JOB_FOLDER'; jobId: string }
  | { type: 'PICK_FOLDER' }
  | { type: 'COPY_URL'; candidateId: string }
  | { type: 'PARSE_MANIFEST'; candidateId: string }
  | { type: 'GET_HISTORY' }
  | { type: 'REMOVE_HISTORY'; id: string }
  | { type: 'CLEAR_HISTORY' }
  | { type: 'OPEN_HISTORY_FOLDER'; id: string }
  | { type: 'REDOWNLOAD'; id: string }
  | { type: 'DISMISS_JOB'; jobId: string }
  | { type: 'OPEN_POPUP' }
  | { type: 'DISABLE_WIDGET_HERE'; domain: string }
  | { type: 'GET_NATIVE_STATUS' };

export interface TabState {
  tabId: number;
  pageUrl: string;
  pageDomain: string;
  candidates: MediaCandidate[];
  jobs: DownloadJob[];
}

export interface NativeStatus {
  installed: boolean;
  version?: string;
  reason?: string;
}

export type UiResponse =
  | { type: 'STATE'; state: TabState; native: NativeStatus }
  | { type: 'OK' }
  | { type: 'COPIED'; url: string }
  | { type: 'FOLDER_PICKED'; path: string | null }
  | { type: 'HISTORY'; entries: import('./history').HistoryEntry[] }
  | { type: 'NATIVE_STATUS'; native: NativeStatus }
  | { type: 'ERROR'; message: string };

// ---------------------------------------------------------------------------
// background -> popup  (live push over a long-lived Port)
// ---------------------------------------------------------------------------
export const POPUP_PORT = 'msp-popup';

export type PushMessage =
  | { type: 'STATE_UPDATED'; state: TabState }
  | { type: 'JOB_UPDATED'; job: DownloadJob }
  | { type: 'HISTORY_UPDATED' }
  | { type: 'NATIVE_STATUS'; native: NativeStatus };

// ---------------------------------------------------------------------------
// background <-> native companion (Phase 4 — protocol frozen now)
// ---------------------------------------------------------------------------
export interface DownloadJobRequest {
  jobId: string;
  kind: 'direct' | 'hls' | 'dash';
  url: string;
  outputFilename: string;
  outputDirectory?: string;
  variantId?: string;
  mode?: 'video' | 'audio' | 'subtitle';
  edit?: EditSpec;
  segmentConcurrency?: number;
  maxParallel?: number;
  bandwidthBytesPerSec?: number;
  title?: string;
  coverUrl?: string;
  /** Non-sensitive headers to replay against Referer-checking CDNs (no cookies). */
  headers?: { referer?: string; origin?: string; userAgent?: string };
}

export type NativeRequest =
  | { type: 'PING'; requestId: string }
  | { type: 'START_DOWNLOAD'; requestId: string; job: DownloadJobRequest }
  | { type: 'CANCEL_DOWNLOAD'; requestId: string; jobId: string }
  | { type: 'PAUSE_DOWNLOAD'; requestId: string; jobId: string }
  | { type: 'RESUME_DOWNLOAD'; requestId: string; jobId: string }
  | { type: 'GET_JOB_STATUS'; requestId: string; jobId: string }
  | { type: 'OPEN_OUTPUT_FOLDER'; requestId: string; jobId: string }
  | { type: 'PICK_FOLDER'; requestId: string };

export type NativeResponse =
  | { type: 'PONG'; requestId: string; version: string }
  | { type: 'JOB_ACCEPTED'; requestId: string; jobId: string }
  | { type: 'JOB_QUEUED'; jobId: string; position: number }
  | { type: 'JOB_PROGRESS'; jobId: string; progress: DownloadJob['progress'] }
  | { type: 'JOB_PAUSED'; jobId: string }
  | { type: 'JOB_COMPLETED'; jobId: string; outputPath: string }
  | { type: 'JOB_FAILED'; jobId: string; error: { code: string; message: string } }
  | { type: 'FOLDER_PICKED'; requestId: string; path: string | null };

// ---------------------------------------------------------------------------
// background <-> offscreen document (in-browser HLS download engine)
// ---------------------------------------------------------------------------
export interface StreamDownloadJob {
  jobId: string;
  /** Media playlist URL to download (already resolved from any master/variant). */
  playlistUrl: string;
  outputBasename: string; // without extension
  concurrency: number;
}

export type OffscreenRequest = { type: 'OFFSCREEN_START_STREAM'; job: StreamDownloadJob };

export type OffscreenEvent =
  | { type: 'OFFSCREEN_PROGRESS'; jobId: string; progress: DownloadJob['progress'] }
  | { type: 'OFFSCREEN_READY'; jobId: string; blobUrl: string; filename: string; engine: string }
  | { type: 'OFFSCREEN_FAILED'; jobId: string; error: { code: string; message: string } };
