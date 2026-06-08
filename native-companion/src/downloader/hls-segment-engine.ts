// Segment-level HLS engine: downloads each segment itself (with the page's
// Referer), tracks per-segment completion in the resume store, supports
// pause/resume/cancel and retry, then assembles a single MP4 via ffmpeg.
//
// Clear (non-DRM) streams only — encrypted playlists are refused upstream.

import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { DownloadJobRequest } from '../native-messaging/protocol.js';
import { fetchBuffer, fetchText } from './segment-fetcher.js';
import { hasSeparateAudioGroup, isMaster, parseMaster, parseMedia, pickBest } from './hls-parser.js';
import { assembleMp4 } from './ffmpeg-concat.js';
import { saveState, deleteState, type JobState } from './resume-store.js';
import { segmentsDir } from '../storage/app-data.js';

export class JobControl {
  state: 'running' | 'paused' | 'cancelled' = 'running';
  pause(): void {
    if (this.state === 'running') this.state = 'paused';
  }
  cancel(): void {
    this.state = 'cancelled';
  }
}

export interface EngineCallbacks {
  onProgress: (p: {
    percent: number;
    downloadedBytes: number;
    segmentsDone: number;
    segmentsTotal: number;
    speedBytesPerSecond?: number;
    etaSeconds?: number;
    currentStep: string;
  }) => void;
  onPaused: () => void;
  onDone: (outputPath: string) => void;
  onError: (code: string, message: string) => void;
}

/** Resolve master->variant->media and build a fresh JobState (all segments pending). */
export async function prepareHlsState(req: DownloadJobRequest, outputPath: string): Promise<JobState> {
  let text = await fetchText(req.url, req.headers);
  let mediaUrl = req.url;

  if (isMaster(text)) {
    // Separate audio rendition -> the segment engine would produce silent video.
    // Signal the job manager to use ffmpeg (which muxes audio groups correctly).
    if (hasSeparateAudioGroup(text)) {
      throw Object.assign(new Error('separate audio group'), { code: 'use_ffmpeg' });
    }
    const best = pickBest(parseMaster(text, req.url));
    if (!best) throw Object.assign(new Error('No variant found'), { code: 'no_variant' });
    mediaUrl = best.playlistUrl;
    text = await fetchText(mediaUrl, req.headers);
  }

  const media = parseMedia(text, mediaUrl);
  if (media.encrypted) throw Object.assign(new Error(media.encryptionReason ?? 'Encrypted'), { code: 'protected' });
  if (media.segments.length === 0) throw Object.assign(new Error('No segments'), { code: 'no_segments' });

  return {
    jobId: req.jobId,
    playlistUrl: req.url,
    mediaPlaylistUrl: mediaUrl,
    outputPath,
    tempDir: segmentsDir(req.jobId),
    segments: media.segments,
    initSegmentUrl: media.initSegmentUrl,
    isFmp4: media.isFmp4,
    done: new Array(media.segments.length).fill(false),
    downloadedBytes: 0,
    headers: req.headers,
    createdAt: Date.now(),
  };
}

function segName(i: number): string {
  return `seg_${String(i).padStart(6, '0')}.ts`;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function runHlsJob(
  state: JobState,
  control: JobControl,
  concurrency: number,
  bandwidthBytesPerSec: number | undefined,
  finishing: { title?: string; coverPath?: string },
  cb: EngineCallbacks,
): Promise<void> {
  const total = state.segments.length;
  const startTime = Date.now();
  let segmentsAtStart = state.done.filter(Boolean).length;
  let nextIndex = 0;
  let persistCounter = 0;

  const report = (step: string): void => {
    const done = state.done.filter(Boolean).length;
    const elapsed = (Date.now() - startTime) / 1000;
    const segThisRun = done - segmentsAtStart;
    const rate = elapsed > 0 ? segThisRun / elapsed : 0; // segments/sec
    const etaSeconds = rate > 0 ? Math.round((total - done) / rate) : undefined;
    cb.onProgress({
      percent: total > 0 ? Math.round((done / total) * 100) : 0,
      downloadedBytes: state.downloadedBytes,
      segmentsDone: done,
      segmentsTotal: total,
      speedBytesPerSecond: elapsed > 0 && segThisRun > 0 ? state.downloadedBytes / elapsed : undefined,
      etaSeconds,
      currentStep: step,
    });
  };

  // Download the fMP4 init segment first (once).
  if (state.initSegmentUrl) {
    const buf = await fetchBuffer(state.initSegmentUrl, state.headers);
    writeFileSync(join(state.tempDir, 'init.mp4'), buf);
  }

  async function worker(): Promise<void> {
    while (true) {
      if (control.state !== 'running') return;
      const i = nextIndex++;
      if (i >= total) return;
      if (state.done[i]) continue;
      const buf = await fetchBuffer(state.segments[i]!, state.headers);
      writeFileSync(join(state.tempDir, segName(i)), buf);
      state.done[i] = true;
      state.downloadedBytes += buf.length;
      if (++persistCounter % 10 === 0) saveState(state);
      report('Downloading');
      // Bandwidth cap: pace the aggregate download to the limit.
      if (bandwidthBytesPerSec && bandwidthBytesPerSec > 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        const target = state.downloadedBytes / bandwidthBytesPerSec;
        if (target > elapsed) await sleep(Math.min(2000, (target - elapsed) * 1000));
      }
    }
  }

  report('Downloading');
  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, total) }, () => worker()));
  } catch (err) {
    saveState(state);
    cb.onError('segment_failed', err instanceof Error ? err.message : 'segment download failed');
    return;
  }

  if (control.state === 'cancelled') {
    cleanup(state);
    deleteState(state.jobId);
    cb.onError('cancelled', 'Cancelled by user');
    return;
  }
  if (control.state === 'paused') {
    saveState(state);
    cb.onPaused();
    return;
  }

  // All segments done -> assemble.
  report('Remuxing to MP4');
  try {
    await assembleMp4({
      tempDir: state.tempDir,
      outputPath: state.outputPath,
      isFmp4: state.isFmp4,
      initPath: state.initSegmentUrl ? join(state.tempDir, 'init.mp4') : undefined,
      title: finishing.title,
      coverPath: finishing.coverPath,
    });
  } catch (err) {
    cb.onError('remux_failed', err instanceof Error ? err.message : 'remux failed');
    return;
  }
  cleanup(state);
  deleteState(state.jobId);
  cb.onDone(state.outputPath);
}

function cleanup(state: JobState): void {
  try {
    rmSync(state.tempDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}
