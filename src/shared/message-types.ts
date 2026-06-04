// Typed messaging contracts.
//   - Runtime messages: content <-> background <-> popup/options.
//   - Native messages: background <-> native companion (designed now, host stubbed).

import type { DownloadJob, MediaCandidate } from './types';

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
// content -> background
// ---------------------------------------------------------------------------
export type ContentMessage =
  | { type: 'CANDIDATES_FOUND'; candidates: RawCandidate[]; signals: PageSignals }
  | { type: 'PAGE_SIGNALS'; signals: PageSignals };

// ---------------------------------------------------------------------------
// popup/options -> background  (request/response via sendMessage)
// ---------------------------------------------------------------------------
export type UiRequest =
  | { type: 'GET_STATE'; tabId?: number }
  | { type: 'RESCAN'; tabId: number }
  | { type: 'START_DOWNLOAD'; candidateId: string; variantId?: string }
  | { type: 'CANCEL_DOWNLOAD'; jobId: string }
  | { type: 'COPY_URL'; candidateId: string }
  | { type: 'PARSE_MANIFEST'; candidateId: string }
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
  | { type: 'NATIVE_STATUS'; native: NativeStatus }
  | { type: 'ERROR'; message: string };

// ---------------------------------------------------------------------------
// background -> popup  (live push over a long-lived Port)
// ---------------------------------------------------------------------------
export const POPUP_PORT = 'msp-popup';

export type PushMessage =
  | { type: 'STATE_UPDATED'; state: TabState }
  | { type: 'JOB_UPDATED'; job: DownloadJob }
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
  /** Non-sensitive headers to replay against Referer-checking CDNs (no cookies). */
  headers?: { referer?: string; origin?: string; userAgent?: string };
}

export type NativeRequest =
  | { type: 'PING'; requestId: string }
  | { type: 'START_DOWNLOAD'; requestId: string; job: DownloadJobRequest }
  | { type: 'CANCEL_DOWNLOAD'; requestId: string; jobId: string }
  | { type: 'GET_JOB_STATUS'; requestId: string; jobId: string }
  | { type: 'OPEN_OUTPUT_FOLDER'; requestId: string; jobId: string };

export type NativeResponse =
  | { type: 'PONG'; requestId: string; version: string }
  | { type: 'JOB_ACCEPTED'; requestId: string; jobId: string }
  | { type: 'JOB_PROGRESS'; jobId: string; progress: DownloadJob['progress'] }
  | { type: 'JOB_COMPLETED'; jobId: string; outputPath: string }
  | { type: 'JOB_FAILED'; jobId: string; error: { code: string; message: string } };

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
