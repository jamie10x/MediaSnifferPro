// Spawns real ffmpeg to download + remux a clear HLS/DASH/direct stream to MP4.
// Progress comes from ffmpeg's machine-readable `-progress pipe:1` (reliable,
// unlike scraping stderr): total_size, out_time, speed. Duration (for percent)
// is read from stderr when available; bytes/speed are reported regardless.

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';

const staticPath = ffmpegStatic as unknown as string | null;
const FFMPEG = staticPath && existsSync(staticPath) ? staticPath : 'ffmpeg';

export interface FfmpegJob {
  url: string;
  outputPath: string;
  headers?: { referer?: string; origin?: string; userAgent?: string };
}

export interface FfmpegProgress {
  percent: number;
  downloadedBytes: number;
  speedBytesPerSecond?: number;
  etaSeconds?: number;
  currentStep: string;
}

export interface FfmpegCallbacks {
  onProgress: (p: FfmpegProgress) => void;
  onDone: (outputPath: string) => void;
  onError: (code: string, message: string) => void;
}

function hmsToSeconds(hms: string): number {
  const [h, m, s] = hms.split(':');
  return Number(h) * 3600 + Number(m) * 60 + parseFloat(s ?? '0');
}

function buildArgs(job: FfmpegJob): string[] {
  const args: string[] = ['-hide_banner'];

  // Reconnect on transient HTTP drops, and time out stalled reads (µs) so a CDN
  // that accepts the connection but never sends data can't hang us forever.
  args.push('-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5');
  args.push('-rw_timeout', '20000000'); // 20s I/O timeout

  // Replay non-sensitive headers so Referer-checking CDNs serve the segments.
  const headerLines: string[] = [];
  if (job.headers?.referer) headerLines.push(`Referer: ${job.headers.referer}`);
  if (job.headers?.origin) headerLines.push(`Origin: ${job.headers.origin}`);
  if (headerLines.length) args.push('-headers', headerLines.join('\r\n') + '\r\n');
  // A realistic UA avoids CDN throttling of non-browser clients.
  const ua =
    job.headers?.userAgent ||
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  args.push('-user_agent', ua);

  args.push(
    '-i', job.url,
    '-map', '0:v:0?', '-map', '0:a:0?', // best video + audio if present
    '-c', 'copy',
    '-bsf:a', 'aac_adtstoasc',
    '-movflags', '+faststart',
    '-progress', 'pipe:1',
    '-y', job.outputPath,
  );
  return args;
}

export function runFfmpeg(job: FfmpegJob, cb: FfmpegCallbacks): { cancel: () => void } {
  mkdirSync(dirname(job.outputPath), { recursive: true });

  let proc: ChildProcess;
  try {
    // stdout = machine progress, stderr = duration + errors.
    proc = spawn(FFMPEG, buildArgs(job), { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    cb.onError('spawn_failed', err instanceof Error ? err.message : 'ffmpeg spawn failed');
    return { cancel: () => {} };
  }

  let durationSeconds = 0;
  let stderrTail = '';
  let lastBytes = 0;
  let lastTime = Date.now();
  let progressBuf = '';
  let lastActivity = Date.now();
  let bytesAtLastCheck = 0;

  // Watchdog: if no new bytes arrive for a while, the CDN is likely blocking the
  // download (e.g. missing/!wrong Referer). Kill ffmpeg and fail with a clear msg
  // instead of hanging at "starting" forever.
  const STALL_MS = 45_000;
  const watchdog = setInterval(() => {
    const stalled = lastBytes === bytesAtLastCheck && Date.now() - lastActivity > STALL_MS;
    bytesAtLastCheck = lastBytes;
    if (stalled) {
      clearInterval(watchdog);
      proc.kill('SIGKILL');
      cb.onError(
        'stalled',
        'No data received — the site likely blocks downloads for this server. Try a different server/quality.',
      );
    }
  }, 15_000);

  proc.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf8');
    stderrTail = (stderrTail + text).slice(-4000);
    lastActivity = Date.now();
    const dur = /Duration:\s*(\d+:\d+:\d+\.\d+)/.exec(text);
    if (dur && durationSeconds === 0) durationSeconds = hmsToSeconds(dur[1]!);
  });

  proc.stdout?.on('data', (chunk: Buffer) => {
    progressBuf += chunk.toString('utf8');
    // ffmpeg emits a block of key=value lines ending in progress=continue|end.
    let idx: number;
    while ((idx = progressBuf.indexOf('progress=')) !== -1) {
      const end = progressBuf.indexOf('\n', idx);
      if (end === -1) break;
      const block = progressBuf.slice(0, end);
      progressBuf = progressBuf.slice(end + 1);
      emitProgress(block);
    }
  });

  function emitProgress(block: string): void {
    const get = (k: string): string | undefined => new RegExp(`${k}=([^\\n]+)`).exec(block)?.[1]?.trim();
    const totalSize = Number(get('total_size') ?? '0') || lastBytes;
    const outTimeUs = Number(get('out_time_us') ?? get('out_time_ms') ?? '0') || 0;
    const elapsedMedia = outTimeUs / 1_000_000;
    const speedStr = get('speed'); // e.g. "1.23x"
    const speedX = speedStr ? parseFloat(speedStr) : undefined;

    const now = Date.now();
    const dt = (now - lastTime) / 1000;
    const speedBytesPerSecond = dt > 0 && totalSize > lastBytes ? (totalSize - lastBytes) / dt : undefined;
    if (totalSize > lastBytes) lastActivity = now;
    lastBytes = totalSize;
    lastTime = now;

    const percent = durationSeconds > 0 ? Math.min(99, Math.round((elapsedMedia / durationSeconds) * 100)) : 0;
    const etaSeconds =
      durationSeconds > 0 && speedX && speedX > 0 ? Math.max(0, Math.round((durationSeconds - elapsedMedia) / speedX)) : undefined;

    cb.onProgress({
      percent,
      downloadedBytes: totalSize,
      speedBytesPerSecond,
      etaSeconds,
      currentStep: percent > 0 ? 'Downloading' : 'Downloading…',
    });
  }

  proc.on('close', (code) => {
    clearInterval(watchdog);
    if (code === 0) cb.onDone(job.outputPath);
    else if (code === null) return; // killed by watchdog/cancel; error already sent
    else cb.onError('ffmpeg_failed', `ffmpeg exited ${code}: ${stderrTail.split('\n').slice(-4).join(' ').slice(-500)}`);
  });

  return {
    cancel: () => {
      clearInterval(watchdog);
      proc.kill('SIGKILL');
    },
  };
}
