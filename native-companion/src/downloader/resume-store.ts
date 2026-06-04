// Persists per-job download state so a paused job can resume — even after the
// host process is restarted by the browser.

import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { jobsDir } from '../storage/app-data.js';

export interface JobState {
  jobId: string;
  playlistUrl: string;
  mediaPlaylistUrl: string;
  outputPath: string;
  tempDir: string;
  segments: string[];
  initSegmentUrl?: string;
  isFmp4: boolean;
  done: boolean[];
  downloadedBytes: number;
  headers?: { referer?: string; origin?: string; userAgent?: string };
  createdAt: number;
}

function statePath(jobId: string): string {
  return join(jobsDir(), `${jobId}.json`);
}

export function saveState(state: JobState): void {
  try {
    writeFileSync(statePath(state.jobId), JSON.stringify(state), 'utf8');
  } catch {
    /* best-effort */
  }
}

export function loadState(jobId: string): JobState | null {
  const p = statePath(jobId);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as JobState;
  } catch {
    return null;
  }
}

export function deleteState(jobId: string): void {
  try {
    rmSync(statePath(jobId), { force: true });
  } catch {
    /* ignore */
  }
}
