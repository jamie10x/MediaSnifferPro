// Spawns real ffmpeg to download + remux a clear HLS/DASH/direct stream to MP4.
// Reports progress by parsing ffmpeg's stderr (Duration + time=).

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';

const FFMPEG = (ffmpegStatic as unknown as string) || 'ffmpeg';

export interface FfmpegJob {
  url: string;
  outputPath: string;
  headers?: { referer?: string; origin?: string; userAgent?: string };
}

export interface FfmpegCallbacks {
  onProgress: (percent: number, currentStep: string) => void;
  onDone: (outputPath: string) => void;
  onError: (code: string, message: string) => void;
}

function hmsToSeconds(hms: string): number {
  const [h, m, s] = hms.split(':');
  return Number(h) * 3600 + Number(m) * 60 + parseFloat(s ?? '0');
}

function buildArgs(job: FfmpegJob): string[] {
  const args: string[] = [];
  // Replay non-sensitive headers so Referer-checking CDNs serve the segments.
  const headerLines: string[] = [];
  if (job.headers?.referer) headerLines.push(`Referer: ${job.headers.referer}`);
  if (job.headers?.origin) headerLines.push(`Origin: ${job.headers.origin}`);
  if (headerLines.length) args.push('-headers', headerLines.join('\r\n') + '\r\n');
  if (job.headers?.userAgent) args.push('-user_agent', job.headers.userAgent);

  args.push('-y', '-i', job.url, '-c', 'copy', '-bsf:a', 'aac_adtstoasc', job.outputPath);
  return args;
}

export function runFfmpeg(job: FfmpegJob, cb: FfmpegCallbacks): { cancel: () => void } {
  mkdirSync(dirname(job.outputPath), { recursive: true });

  let proc: ChildProcess;
  try {
    proc = spawn(FFMPEG, buildArgs(job), { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (err) {
    cb.onError('spawn_failed', err instanceof Error ? err.message : 'ffmpeg spawn failed');
    return { cancel: () => {} };
  }

  let durationSeconds = 0;
  let stderrTail = '';

  proc.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf8');
    stderrTail = (stderrTail + text).slice(-4000);

    const dur = /Duration:\s*(\d+:\d+:\d+\.\d+)/.exec(text);
    if (dur && durationSeconds === 0) durationSeconds = hmsToSeconds(dur[1]!);

    const time = /time=(\d+:\d+:\d+\.\d+)/.exec(text);
    if (time) {
      const elapsed = hmsToSeconds(time[1]!);
      const percent = durationSeconds > 0 ? Math.min(99, Math.round((elapsed / durationSeconds) * 100)) : 0;
      cb.onProgress(percent, 'Downloading + remuxing');
    }
  });

  proc.on('close', (code) => {
    if (code === 0) cb.onDone(job.outputPath);
    else cb.onError('ffmpeg_failed', `ffmpeg exited ${code}: ${stderrTail.split('\n').slice(-3).join(' ')}`);
  });

  return {
    cancel: () => {
      proc.kill('SIGKILL');
    },
  };
}
