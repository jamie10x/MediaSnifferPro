// Download orchestration.
//   - Direct files  -> chrome.downloads.download (browser_direct).
//   - HLS/DASH clear -> native companion if installed, else copy_url_only.
//   - Protected/DRM  -> blocked, never attempted.

import type { DownloadJob, MediaCandidate } from '@shared/types';
import type { StreamDownloadJob } from '@shared/message-types';
import { buildFilename } from '@shared/filename-utils';
import { getExtension } from '@shared/url-utils';
import { loadSettings } from '@shared/settings';
import { getNativeStatus, startNativeDownload } from './native-bridge';
import { getJob, upsertJob } from './candidate-store';
import { startStreamJob } from './offscreen-manager';
import { buildReplayHeaders } from '@shared/replay-headers';
import { pickVariantId, resolveDownloadUrl } from '@shared/quality';
import { logger } from '@shared/logger';

function newJob(candidate: MediaCandidate, partial: Partial<DownloadJob>): DownloadJob {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    candidateId: candidate.id,
    type: 'browser_direct',
    status: 'queued',
    url: candidate.url,
    outputFilename: 'media',
    progress: { percent: 0, downloadedBytes: 0 },
    createdAt: now,
    ...partial,
  };
}

export interface StartResult {
  job: DownloadJob;
}

export async function startDownload(
  candidate: MediaCandidate,
  variantId: string | undefined,
  onJobUpdate: (job: DownloadJob) => void,
  mode: 'video' | 'audio' = 'video',
): Promise<DownloadJob> {
  const settings = await loadSettings();
  const filename = buildFilename(candidate, settings.filenameTemplate);

  if (candidate.supportStatus === 'protected_likely' || candidate.supportStatus === 'blocked_by_policy') {
    const job = newJob(candidate, {
      type: 'copy_url_only',
      status: 'blocked',
      outputFilename: filename,
      error: { code: 'protected', message: candidate.unsupportedReason ?? 'Protected media', recoverable: false },
    });
    await upsertJob(candidate.tabId, job);
    onJobUpdate(job);
    return job;
  }

  // Auto-select a variant by quality preference when the user didn't pick one.
  const effectiveVariantId = variantId ?? pickVariantId(candidate, settings.preferredQuality);

  if (mode === 'audio') {
    return startAudioExtraction(candidate, effectiveVariantId, filename, onJobUpdate);
  }

  if (candidate.mediaType === 'hls') {
    return startHlsDownload(candidate, effectiveVariantId, filename, onJobUpdate);
  }

  if (candidate.mediaType === 'dash') {
    // DASH remux is deferred to the native helper this round.
    return startNativeStreamDownload(candidate, effectiveVariantId, filename, onJobUpdate);
  }

  return startBrowserDownload(candidate, filename, onJobUpdate);
}

/** Clear HLS: download + remux in-browser via the offscreen document. */
async function startHlsDownload(
  candidate: MediaCandidate,
  variantId: string | undefined,
  filename: string,
  onJobUpdate: (job: DownloadJob) => void,
): Promise<DownloadJob> {
  const settings = await loadSettings();
  const job = newJob(candidate, {
    type: 'native_hls',
    status: 'preparing',
    variantId,
    outputFilename: filename.endsWith('.mp4') ? filename : `${stripExt(filename)}.mp4`,
  });
  await upsertJob(candidate.tabId, job);
  onJobUpdate(job);

  const streamJob: StreamDownloadJob = {
    jobId: job.id,
    playlistUrl: resolveDownloadUrl(candidate, variantId),
    outputBasename: stripExt(job.outputFilename),
    concurrency: Math.max(1, Math.min(12, settings.streamConcurrency)),
  };

  try {
    await startStreamJob(streamJob);
    job.status = 'downloading';
    job.progress.currentStep = 'Starting';
  } catch (err) {
    job.status = 'failed';
    job.error = { code: 'offscreen_start_failed', message: err instanceof Error ? err.message : 'unknown', recoverable: true };
  }
  await upsertJob(candidate.tabId, job);
  onJobUpdate(job);
  return job;
}

function stripExt(name: string): string {
  return name.replace(/\.[^/.]+$/, '');
}

/** Extract audio to .m4a via native ffmpeg (requires the desktop helper). */
async function startAudioExtraction(
  candidate: MediaCandidate,
  variantId: string | undefined,
  filename: string,
  onJobUpdate: (job: DownloadJob) => void,
): Promise<DownloadJob> {
  const settings = await loadSettings();
  const outputFilename = `${stripExt(filename)}.m4a`;
  const native = await getNativeStatus();
  if (!native.installed) {
    const job = newJob(candidate, {
      type: 'native_dash',
      status: 'blocked',
      outputFilename,
      error: { code: 'native_required', message: 'Install the desktop helper to extract audio.', recoverable: true },
    });
    await upsertJob(candidate.tabId, job);
    onJobUpdate(job);
    return job;
  }

  const job = newJob(candidate, { type: 'native_dash', status: 'preparing', variantId, outputFilename });
  await upsertJob(candidate.tabId, job);
  onJobUpdate(job);

  const kind = candidate.mediaType === 'dash' ? 'dash' : candidate.mediaType === 'hls' ? 'hls' : 'direct';
  const res = await startNativeDownload({
    jobId: job.id,
    kind,
    mode: 'audio',
    url: resolveDownloadUrl(candidate, variantId),
    outputFilename,
    outputDirectory: settings.downloadFolder || undefined,
    headers: buildReplayHeaders(candidate),
  });
  job.status = res.accepted ? 'downloading' : 'failed';
  if (!res.accepted) job.error = { code: 'native_rejected', message: res.error ?? 'rejected', recoverable: true };
  await upsertJob(candidate.tabId, job);
  onJobUpdate(job);
  return job;
}

/** Download a subtitle track: direct files via the browser, m3u8 subs via native. */
export async function startSubtitleDownload(
  candidate: MediaCandidate,
  subtitleUrl: string,
  label: string | undefined,
  onJobUpdate: (job: DownloadJob) => void,
): Promise<DownloadJob> {
  const settings = await loadSettings();
  const titlePart = stripExt(buildFilename(candidate, settings.filenameTemplate));
  const langPart = label ? `.${label.replace(/[^\w-]/g, '_')}` : '';
  const ext = getExtension(subtitleUrl);

  if (ext === 'm3u8') {
    const outputFilename = `${titlePart}${langPart}.srt`;
    const native = await getNativeStatus();
    if (!native.installed) {
      const job = newJob(candidate, {
        type: 'native_dash',
        status: 'blocked',
        url: subtitleUrl,
        outputFilename,
        error: { code: 'native_required', message: 'Install the desktop helper to download this subtitle.', recoverable: true },
      });
      await upsertJob(candidate.tabId, job);
      onJobUpdate(job);
      return job;
    }
    const job = newJob(candidate, { type: 'native_dash', status: 'preparing', url: subtitleUrl, outputFilename });
    await upsertJob(candidate.tabId, job);
    onJobUpdate(job);
    const res = await startNativeDownload({
      jobId: job.id,
      kind: 'direct',
      mode: 'subtitle',
      url: subtitleUrl,
      outputFilename,
      outputDirectory: settings.downloadFolder || undefined,
      headers: buildReplayHeaders(candidate),
    });
    job.status = res.accepted ? 'downloading' : 'failed';
    if (!res.accepted) job.error = { code: 'native_rejected', message: res.error ?? 'rejected', recoverable: true };
    await upsertJob(candidate.tabId, job);
    onJobUpdate(job);
    return job;
  }

  // Direct subtitle file -> browser download.
  const outputFilename = `${titlePart}${langPart}.${ext || 'vtt'}`;
  const job = newJob(candidate, { type: 'browser_direct', status: 'downloading', url: subtitleUrl, outputFilename });
  await upsertJob(candidate.tabId, job);
  onJobUpdate(job);
  try {
    const id = await chrome.downloads.download({ url: subtitleUrl, filename: outputFilename, saveAs: false });
    job.browserDownloadId = id;
  } catch (err) {
    job.status = 'failed';
    job.error = { code: 'download_start_failed', message: err instanceof Error ? err.message : 'unknown', recoverable: true };
  }
  await upsertJob(candidate.tabId, job);
  onJobUpdate(job);
  return job;
}

async function startBrowserDownload(
  candidate: MediaCandidate,
  filename: string,
  onJobUpdate: (job: DownloadJob) => void,
): Promise<DownloadJob> {
  const job = newJob(candidate, { type: 'browser_direct', status: 'downloading', outputFilename: filename });
  await upsertJob(candidate.tabId, job);
  onJobUpdate(job);

  try {
    const downloadId = await chrome.downloads.download({
      url: candidate.url,
      filename,
      saveAs: false,
    });
    job.browserDownloadId = downloadId;
    await upsertJob(candidate.tabId, job);
    onJobUpdate(job);
  } catch (err) {
    job.status = 'failed';
    job.error = {
      code: 'download_start_failed',
      message: err instanceof Error ? err.message : 'unknown',
      recoverable: true,
    };
    await upsertJob(candidate.tabId, job);
    onJobUpdate(job);
  }
  return job;
}

async function startNativeStreamDownload(
  candidate: MediaCandidate,
  variantId: string | undefined,
  filename: string,
  onJobUpdate: (job: DownloadJob) => void,
): Promise<DownloadJob> {
  const native = await getNativeStatus();
  if (!native.installed) {
    const job = newJob(candidate, {
      type: 'copy_url_only',
      status: 'blocked',
      outputFilename: filename,
      error: { code: 'native_required', message: 'Desktop helper required for this stream.', recoverable: true },
    });
    await upsertJob(candidate.tabId, job);
    onJobUpdate(job);
    return job;
  }

  const kind = candidate.mediaType === 'hls' ? 'hls' : 'dash';
  const job = newJob(candidate, {
    type: kind === 'hls' ? 'native_hls' : 'native_dash',
    status: 'preparing',
    outputFilename: filename,
  });
  await upsertJob(candidate.tabId, job);
  onJobUpdate(job);

  const dlSettings = await loadSettings();
  const result = await startNativeDownload({
    jobId: job.id,
    kind,
    url: candidate.url,
    outputFilename: filename,
    outputDirectory: dlSettings.downloadFolder || undefined,
    variantId,
    headers: buildReplayHeaders(candidate),
  });
  if (!result.accepted) {
    job.status = 'failed';
    job.error = { code: 'native_rejected', message: result.error ?? 'rejected', recoverable: true };
  } else {
    job.status = 'downloading';
  }
  await upsertJob(candidate.tabId, job);
  onJobUpdate(job);
  return job;
}

/** Wire chrome.downloads events back onto our job objects. */
export function installDownloadEvents(
  resolveTabId: (browserDownloadId: number) => Promise<{ tabId: number; jobId: string } | null>,
  onJobUpdate: (job: DownloadJob) => void,
): void {
  chrome.downloads.onChanged.addListener(async (delta) => {
    const ref = await resolveTabId(delta.id);
    if (!ref) return;
    const job = await getJob(ref.tabId, ref.jobId);
    if (!job) return;

    if (delta.state?.current === 'complete') {
      job.status = 'completed';
      job.progress.percent = 100;
      job.completedAt = Date.now();
    } else if (delta.state?.current === 'interrupted') {
      job.status = 'failed';
      job.error = { code: 'interrupted', message: delta.error?.current ?? 'interrupted', recoverable: true };
    }
    await upsertJob(ref.tabId, job);
    onJobUpdate(job);
    logger.debug('download changed', job.id, job.status);
  });
}
