// Best-effort cover-art fetch. Downloads the poster image to a temp file so
// ffmpeg can embed it as cover art. Returns null on any failure (cover is
// optional — a failed cover must never fail the download).

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fetchBuffer, type FetchHeaders } from './segment-fetcher.js';
import { segmentsDir } from '../storage/app-data.js';

export async function downloadCover(
  jobId: string,
  url: string,
  headers?: FetchHeaders,
): Promise<string | null> {
  try {
    const buf = await fetchBuffer(url, headers, 1, 10_000);
    if (buf.length < 256 || buf.length > 8_000_000) return null; // sanity bounds
    const ext = /\.png(\?|$)/i.test(url) ? 'png' : 'jpg';
    const path = join(segmentsDir(jobId), `cover.${ext}`);
    writeFileSync(path, buf);
    return path;
  } catch {
    return null;
  }
}
