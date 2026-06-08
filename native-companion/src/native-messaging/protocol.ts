// Native messaging wire protocol + message types.
//
// Chrome native messaging frames each JSON message with a 4-byte little-endian
// length prefix, on stdin/stdout. These types MUST stay in sync with the
// extension's src/shared/message-types.ts (NativeRequest / NativeResponse).

export interface EditSpec {
  op: 'trim' | 'convert' | 'compress' | 'audio';
  start?: string; // trim, "HH:MM:SS" / "MM:SS" / seconds
  end?: string; // trim
  container?: 'mp4' | 'mkv' | 'webm'; // convert
  level?: 'small' | 'balanced'; // compress
  audioFormat?: 'm4a' | 'mp3' | 'flac'; // audio
}

export interface DownloadJobRequest {
  jobId: string;
  kind: 'direct' | 'hls' | 'dash';
  url: string;
  outputFilename: string;
  outputDirectory?: string;
  variantId?: string;
  /** 'video' (default) | 'audio' (extract audio) | 'subtitle' (convert to .srt). */
  mode?: 'video' | 'audio' | 'subtitle';
  /** Editing operation (trim/convert/compress/audio) — overrides plain download. */
  edit?: EditSpec;
  /** Tuning: concurrent segments, parallel jobs, bandwidth cap (bytes/sec, 0=off). */
  segmentConcurrency?: number;
  maxParallel?: number;
  bandwidthBytesPerSec?: number;
  /** Embed a title (metadata) and poster (cover art) into the output. */
  title?: string;
  coverUrl?: string;
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

export interface JobProgress {
  percent: number;
  downloadedBytes: number;
  totalBytes?: number;
  speedBytesPerSecond?: number;
  etaSeconds?: number;
  currentStep?: string;
  segmentsDone?: number;
  segmentsTotal?: number;
}

export type NativeRequestExtra =
  | { type: 'PAUSE_DOWNLOAD'; requestId: string; jobId: string }
  | { type: 'RESUME_DOWNLOAD'; requestId: string; jobId: string };

export type NativeResponse =
  | { type: 'PONG'; requestId: string; version: string }
  | { type: 'JOB_ACCEPTED'; requestId: string; jobId: string }
  | { type: 'JOB_QUEUED'; jobId: string; position: number }
  | { type: 'JOB_PROGRESS'; jobId: string; progress: JobProgress }
  | { type: 'JOB_PAUSED'; jobId: string }
  | { type: 'JOB_COMPLETED'; jobId: string; outputPath: string }
  | { type: 'JOB_FAILED'; jobId: string; error: { code: string; message: string } }
  | { type: 'FOLDER_PICKED'; requestId: string; path: string | null };

/** Encode a message into a length-prefixed Buffer for stdout. */
export function encodeMessage(message: NativeResponse): Buffer {
  const json = Buffer.from(JSON.stringify(message), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(json.length, 0);
  return Buffer.concat([header, json]);
}

/**
 * Incremental decoder: feed raw stdin chunks, get back complete messages.
 * Chrome caps a single message at 1 MB inbound; we enforce that defensively.
 */
export class MessageDecoder {
  private buffer = Buffer.alloc(0);
  private static readonly MAX = 1024 * 1024;

  push(chunk: Buffer): NativeRequest[] {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const out: NativeRequest[] = [];
    while (this.buffer.length >= 4) {
      const length = this.buffer.readUInt32LE(0);
      if (length > MessageDecoder.MAX) throw new Error('inbound message too large');
      if (this.buffer.length < 4 + length) break;
      const body = this.buffer.subarray(4, 4 + length);
      this.buffer = this.buffer.subarray(4 + length);
      out.push(JSON.parse(body.toString('utf8')) as NativeRequest);
    }
    return out;
  }
}
