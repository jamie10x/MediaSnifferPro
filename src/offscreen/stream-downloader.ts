// In-browser HLS downloader (runs inside the offscreen document).
// Resolves master -> variant -> media playlist, downloads segments concurrently,
// then hands them to the engine router for remuxing to MP4.
//
// Clear (non-DRM) streams only. Encrypted / DRM / SAMPLE-AES streams are rejected.

import type { StreamVariant } from '@shared/types';
import { parseHls, parseHlsMediaPlaylist } from '@shared/hls-parser';
import { remuxWithRouter } from './engines/router';

export interface StreamProgress {
  percent: number;
  downloadedBytes: number;
  currentStep: string;
}

export interface StreamResult {
  blob: Blob;
  extension: string;
  engine: string;
}

export interface StreamOptions {
  concurrency: number;
  advancedFfmpegFallback: boolean;
  onProgress: (p: StreamProgress) => void;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { credentials: 'omit', cache: 'no-store' });
  if (!res.ok) throw new Error(`Playlist fetch failed (${res.status})`);
  return res.text();
}

async function fetchSegment(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { credentials: 'omit', cache: 'no-store' });
  if (!res.ok) throw new Error(`Segment fetch failed (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

function pickBestVariant(variants: StreamVariant[]): StreamVariant | undefined {
  return variants
    .filter((v) => v.playlistUrl)
    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0) || (b.bandwidth ?? 0) - (a.bandwidth ?? 0))[0];
}

/** Download an ordered list of URLs with bounded concurrency, preserving order. */
async function downloadAll(
  urls: string[],
  concurrency: number,
  onOne: (downloadedBytes: number, doneCount: number) => void,
): Promise<Uint8Array[]> {
  const results = new Array<Uint8Array>(urls.length);
  let nextIndex = 0;
  let doneCount = 0;
  let totalBytes = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = nextIndex++;
      if (i >= urls.length) return;
      const buf = await fetchSegment(urls[i]!);
      results[i] = buf;
      totalBytes += buf.length;
      doneCount += 1;
      onOne(totalBytes, doneCount);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, urls.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export async function downloadHlsStream(
  playlistUrl: string,
  options: StreamOptions,
): Promise<StreamResult> {
  options.onProgress({ percent: 1, downloadedBytes: 0, currentStep: 'Reading playlist' });

  let text = await fetchText(playlistUrl);
  let mediaUrl = playlistUrl;

  // If this is a master playlist, resolve to the best variant's media playlist.
  const parsed = parseHls(text, playlistUrl);
  if (parsed.isMaster) {
    const best = pickBestVariant(parsed.variants);
    if (!best?.playlistUrl) throw new Error('No downloadable variant found in master playlist');
    mediaUrl = best.playlistUrl;
    text = await fetchText(mediaUrl);
  }

  const media = parseHlsMediaPlaylist(text, mediaUrl);
  if (media.protection.isDrmLikely || media.protection.isEncryptedLikely) {
    throw new Error(media.protection.reason ?? 'Stream is encrypted/protected and cannot be downloaded');
  }
  if (media.segments.length === 0) throw new Error('Playlist contains no segments');

  // Download init segment (fMP4) first, then media segments concurrently.
  let initSegment: Uint8Array | undefined;
  if (media.initSegmentUrl) {
    options.onProgress({ percent: 3, downloadedBytes: 0, currentStep: 'Init segment' });
    initSegment = await fetchSegment(media.initSegmentUrl);
  }

  const total = media.segments.length;
  const segments = await downloadAll(media.segments, options.concurrency, (bytes, done) => {
    // Reserve the last 8% for remuxing.
    const percent = Math.min(92, Math.round((done / total) * 92));
    options.onProgress({ percent, downloadedBytes: bytes, currentStep: `Downloading ${done}/${total} segments` });
  });

  options.onProgress({ percent: 94, downloadedBytes: 0, currentStep: 'Remuxing to MP4' });
  const result = await remuxWithRouter(
    { segments, initSegment, isFmp4: media.isFmp4 },
    { advancedFfmpegFallback: options.advancedFfmpegFallback },
  );

  options.onProgress({ percent: 100, downloadedBytes: result.blob.size, currentStep: 'Done' });
  return { blob: result.blob, extension: result.extension, engine: result.engine };
}
