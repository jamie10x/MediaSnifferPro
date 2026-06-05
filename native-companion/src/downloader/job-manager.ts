// Job lifecycle + queue. Limits concurrent downloads, routes HLS to the
// segment engine (pause/resume/retry/resume-store) and DASH/direct to ffmpeg.

import { rmSync } from 'node:fs';
import { runFfmpeg } from './ffmpeg-runner.js';
import { JobControl, prepareHlsState, runHlsJob } from './hls-segment-engine.js';
import { loadState, deleteState, type JobState } from './resume-store.js';
import { assertNotProtected, resolveOutputPath, sanitizeFilename } from '../security/sanitizer.js';
import type { DownloadJobRequest, NativeResponse } from '../native-messaging/protocol.js';

type Send = (res: NativeResponse) => void;
const MAX_CONCURRENT = 3;
const SEGMENT_CONCURRENCY = 10;

interface Tracked {
  req: DownloadJobRequest;
  send: Send;
  outputPath: string;
  status: 'queued' | 'running' | 'paused';
  control?: JobControl; // HLS
  ffmpegCancel?: () => void; // DASH/direct
  state?: JobState; // HLS resume state
}

const jobs = new Map<string, Tracked>();
const outputPaths = new Map<string, string>();
const queue: string[] = [];

function activeCount(): number {
  let n = 0;
  for (const t of jobs.values()) if (t.status === 'running') n += 1;
  return n;
}

function ensureExt(name: string, req: DownloadJobRequest): string {
  const base = name.replace(/\.(mp4|mkv|webm|m4a|mp3|flac|aac|srt|vtt)$/i, '');
  const edit = req.edit;
  if (edit) {
    if (edit.op === 'audio') return `${base}.${edit.audioFormat ?? 'm4a'}`;
    if (edit.op === 'convert') return `${base}.${edit.container ?? 'mp4'}`;
    return `${base}.mp4`; // trim / compress
  }
  if (req.mode === 'audio') return `${base}.m4a`;
  if (req.mode === 'subtitle') return `${base}.srt`;
  return `${base}.mp4`;
}

export function startJob(req: DownloadJobRequest, requestId: string, send: Send): void {
  try {
    assertNotProtected(req.url);
  } catch (err) {
    send({ type: 'JOB_FAILED', jobId: req.jobId, error: { code: 'protected', message: (err as Error).message } });
    return;
  }

  let outputPath: string;
  try {
    outputPath = resolveOutputPath(req.outputDirectory, ensureExt(sanitizeFilename(req.outputFilename, 'video'), req));
  } catch (err) {
    send({ type: 'JOB_FAILED', jobId: req.jobId, error: { code: 'bad_output_path', message: (err as Error).message } });
    return;
  }

  outputPaths.set(req.jobId, outputPath);
  const tracked: Tracked = { req, send, outputPath, status: 'queued' };
  jobs.set(req.jobId, tracked);
  send({ type: 'JOB_ACCEPTED', requestId, jobId: req.jobId });

  if (activeCount() >= MAX_CONCURRENT) {
    queue.push(req.jobId);
    send({ type: 'JOB_QUEUED', jobId: req.jobId, position: queue.length });
  } else {
    void runJob(tracked);
  }
}

function finish(jobId: string): void {
  jobs.delete(jobId);
  pumpQueue();
}

function pumpQueue(): void {
  while (activeCount() < MAX_CONCURRENT && queue.length > 0) {
    const id = queue.shift()!;
    const t = jobs.get(id);
    if (t && t.status === 'queued') void runJob(t);
  }
}

async function runJob(tracked: Tracked): Promise<void> {
  tracked.status = 'running';
  const { req, send } = tracked;

  // Audio/subtitle/edit jobs always go through ffmpeg directly (the segment
  // engine is plain-video only). Plain video HLS uses the segment engine.
  if (req.kind === 'hls' && (req.mode ?? 'video') === 'video' && !req.edit) {
    await runHls(tracked, send);
  } else {
    runFfmpegJob(tracked, send);
  }
}

async function runHls(tracked: Tracked, send: Send, resumeState?: JobState): Promise<void> {
  const { req } = tracked;
  const control = new JobControl();
  tracked.control = control;

  let state: JobState;
  try {
    state = resumeState ?? tracked.state ?? (await prepareHlsState(req, tracked.outputPath));
  } catch (err) {
    const code = (err as { code?: string }).code ?? 'prepare_failed';
    send({ type: 'JOB_FAILED', jobId: req.jobId, error: { code, message: (err as Error).message } });
    finish(req.jobId);
    return;
  }
  tracked.state = state;

  await runHlsJob(state, control, SEGMENT_CONCURRENCY, {
    onProgress: (p) =>
      send({
        type: 'JOB_PROGRESS',
        jobId: req.jobId,
        progress: {
          percent: p.percent,
          downloadedBytes: p.downloadedBytes,
          speedBytesPerSecond: p.speedBytesPerSecond,
          etaSeconds: p.etaSeconds,
          segmentsDone: p.segmentsDone,
          segmentsTotal: p.segmentsTotal,
          currentStep: p.currentStep,
        },
      }),
    onPaused: () => {
      tracked.status = 'paused';
      send({ type: 'JOB_PAUSED', jobId: req.jobId });
      pumpQueue(); // free the slot for queued jobs
    },
    onDone: (path) => {
      send({ type: 'JOB_COMPLETED', jobId: req.jobId, outputPath: path });
      finish(req.jobId);
    },
    onError: (code, message) => {
      send({ type: 'JOB_FAILED', jobId: req.jobId, error: { code, message } });
      finish(req.jobId);
    },
  });
}

function runFfmpegJob(tracked: Tracked, send: Send): void {
  const { req, outputPath } = tracked;
  const handle = runFfmpeg(
    { url: req.url, outputPath, mode: req.mode ?? 'video', edit: req.edit, headers: req.headers },
    {
      onProgress: (p) =>
        send({
          type: 'JOB_PROGRESS',
          jobId: req.jobId,
          progress: { percent: p.percent, downloadedBytes: p.downloadedBytes, speedBytesPerSecond: p.speedBytesPerSecond, etaSeconds: p.etaSeconds, currentStep: p.currentStep },
        }),
      onDone: (path) => {
        send({ type: 'JOB_COMPLETED', jobId: req.jobId, outputPath: path });
        finish(req.jobId);
      },
      onError: (code, message) => {
        send({ type: 'JOB_FAILED', jobId: req.jobId, error: { code, message } });
        finish(req.jobId);
      },
    },
  );
  tracked.ffmpegCancel = handle.cancel;
}

export function pauseJob(jobId: string): void {
  const t = jobs.get(jobId);
  if (t?.control && t.status === 'running') t.control.pause();
}

export function resumeJob(jobId: string, send: Send): void {
  const t = jobs.get(jobId);
  if (t && t.status === 'paused') {
    if (activeCount() >= MAX_CONCURRENT) {
      t.status = 'queued';
      queue.push(jobId);
      send({ type: 'JOB_QUEUED', jobId, position: queue.length });
      return;
    }
    void runHls(t, send, t.state);
    return;
  }
  // Not in memory (host restarted) — rebuild from the resume store.
  const state = loadState(jobId);
  if (!state) {
    send({ type: 'JOB_FAILED', jobId, error: { code: 'not_resumable', message: 'No saved state to resume.' } });
    return;
  }
  const rebuilt: Tracked = {
    req: { jobId, kind: 'hls', url: state.playlistUrl, outputFilename: state.outputPath, headers: state.headers },
    send,
    outputPath: state.outputPath,
    status: 'running',
    state,
  };
  jobs.set(jobId, rebuilt);
  outputPaths.set(jobId, state.outputPath);
  void runHls(rebuilt, send, state);
}

export function cancelJob(jobId: string, send: Send): void {
  const t = jobs.get(jobId);
  if (!t) return;
  if (t.control) {
    t.control.cancel();
    // If paused (no worker loop running), clean up + report immediately.
    if (t.status !== 'running') {
      if (t.state) {
        try {
          rmSync(t.state.tempDir, { recursive: true, force: true });
        } catch {
          /* ignore */
        }
      }
      deleteState(jobId);
      send({ type: 'JOB_FAILED', jobId, error: { code: 'cancelled', message: 'Cancelled by user' } });
      finish(jobId);
    }
  } else if (t.ffmpegCancel) {
    t.ffmpegCancel();
    try {
      rmSync(t.outputPath, { force: true });
    } catch {
      /* ignore */
    }
    send({ type: 'JOB_FAILED', jobId, error: { code: 'cancelled', message: 'Cancelled by user' } });
    finish(jobId);
  }
  // Remove from queue if it was waiting.
  const qi = queue.indexOf(jobId);
  if (qi >= 0) queue.splice(qi, 1);
}

export function getOutputPath(jobId: string): string | undefined {
  return jobs.get(jobId)?.outputPath ?? outputPaths.get(jobId);
}
