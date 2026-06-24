// Native-messaging contract between the extension (background) and the local
// companion app. This is a CROSS-PROCESS contract — the companion is a standalone
// program (could be rewritten in another language), so it deliberately declares
// its own copy of these shapes.
//
// ⚠️  KEEP IN SYNC with native-companion/src/native-messaging/protocol.ts
//     If you change a message here, mirror it there (and vice-versa).

import type { DownloadJob, EditSpec } from './types';

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
