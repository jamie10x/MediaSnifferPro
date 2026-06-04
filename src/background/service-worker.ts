// MediaSniffer Pro — background service worker.
// Wires detection inputs (content script + network) into the candidate store,
// classifies media, parses manifests on demand, and serves the popup/options UI.

import type { DownloadJob, MediaCandidate } from '@shared/types';
import {
  POPUP_PORT,
  type ContentMessage,
  type NativeStatus,
  type OffscreenEvent,
  type PageSignals,
  type PushMessage,
  type RawCandidate,
  type TabState,
  type UiRequest,
  type UiResponse,
} from '@shared/message-types';
import { classifyMedia, decideSupportStatus } from '@shared/media-utils';
import { classifyPageSignals } from '@shared/drm-detector';
import { canonicalKey, getDomain, getExtension, getFilenameFromUrl, matchesDomainList } from '@shared/url-utils';
import { redactHeaders } from '@shared/privacy-utils';
import { loadSettings, onSettingsChanged } from '@shared/settings';
import { setDebugLogging, logger } from '@shared/logger';
import {
  findCandidateAnyTab,
  findJobByBrowserDownloadId,
  getPageInfo,
  listCandidates,
  listJobs,
  setPageInfo,
  upsertCandidate,
  upsertJob,
} from './candidate-store';
import { installNetworkListener, updateNetworkConfig, type NetworkHit } from './network-listener';
import { installTabLifecycle } from './tab-lifecycle';
import { installDownloadEvents, startDownload } from './download-manager';
import {
  cancelNativeDownload,
  getNativeStatus,
  openOutputFolder,
  pickFolder,
  setProgressHandler,
  startNativeDownload,
} from './native-bridge';
import { parseManifestForCandidate } from './manifest-handler';
import { closeOffscreenIfIdle, revokeBlob } from './offscreen-manager';
import { buildReplayHeaders } from '@shared/replay-headers';

// --- live popup ports ------------------------------------------------------
const ports = new Map<chrome.runtime.Port, number | null>();

function pushToTab(tabId: number, msg: PushMessage): void {
  for (const [port, watched] of ports.entries()) {
    if (watched === tabId) {
      try {
        port.postMessage(msg);
      } catch {
        ports.delete(port);
      }
    }
  }
}

async function pushState(tabId: number): Promise<void> {
  const state = await buildTabState(tabId);
  pushToTab(tabId, { type: 'STATE_UPDATED', state });
}

function pushJob(tabId: number, job: DownloadJob): void {
  pushToTab(tabId, { type: 'JOB_UPDATED', job });
}

// --- per-tab page signals (EME/MSE/blob) -----------------------------------
const pageSignals = new Map<number, PageSignals>();

// --- candidate ingestion ---------------------------------------------------
async function buildTabState(tabId: number): Promise<TabState> {
  const [candidates, jobs, page] = await Promise.all([
    listCandidates(tabId),
    listJobs(tabId),
    getPageInfo(tabId),
  ]);
  return {
    tabId,
    pageUrl: page.pageUrl,
    pageDomain: page.pageDomain,
    candidates: cleanCandidateList(candidates),
    jobs,
  };
}

// Hide noise: blob:/unknown player elements (MSE) when a real HLS/DASH manifest
// is present, and any segments that slipped through.
function cleanCandidateList(candidates: MediaCandidate[]): MediaCandidate[] {
  const hasManifest = candidates.some((c) => c.isManifest && !c.isDrmLikely);
  return candidates.filter((c) => {
    if (c.isSegment) return false;
    if (hasManifest && c.mediaType === 'unknown' && (c.isBlob || c.supportStatus === 'copy_only')) {
      return false;
    }
    return true;
  });
}

interface IngestInput {
  tabId: number;
  frameId?: number;
  frameUrl?: string;
  url: string;
  source: MediaCandidate['source'];
  contentType?: string;
  pageTitle?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  filename?: string;
  qualityLabel?: string;
  isBlob?: boolean;
  fileSizeBytes?: number;
  transferSizeBytes?: number;
  responseHeaders?: Record<string, string>;
  replayHeaders?: MediaCandidate['replayHeaders'];
}

async function ingest(input: IngestInput): Promise<MediaCandidate | null> {
  const settings = await loadSettings();
  if (!input.url) return null;

  const page = await getPageInfo(input.tabId);
  const pageUrl = page.pageUrl;
  const pageDomain = page.pageDomain || getDomain(input.url);

  // Domain policy gates.
  const blocked = matchesDomainList(input.url, settings.blocklist) || matchesDomainList(pageUrl, settings.blocklist);
  if (settings.allowlist.length > 0 && !matchesDomainList(pageUrl, settings.allowlist)) {
    // When an allowlist is set, only allowlisted pages are processed.
    return null;
  }

  const cls = classifyMedia(input.url, input.contentType);

  // Respect display/segment settings.
  if (cls.isSegment && settings.hideSegments) return null;
  if (cls.mediaType === 'audio' && !settings.showAudio) return null;
  if (cls.mediaType === 'subtitle' && !settings.showSubtitles) return null;
  if (cls.mediaType === 'thumbnail' && !settings.showThumbnails) return null;
  if (cls.mediaType === 'hls' && !settings.detectHls) return null;
  if (cls.mediaType === 'dash' && !settings.detectDash) return null;
  if (input.fileSizeBytes !== undefined && input.fileSizeBytes < settings.minFileSizeBytes) return null;

  // Page-level DRM signals apply mainly to streams / blob playback.
  const signals = pageSignals.get(input.tabId);
  const signalDrm = signals ? classifyPageSignals(signals) : { isDrmLikely: false, isEncryptedLikely: false };
  const isStreamish = cls.mediaType === 'hls' || cls.mediaType === 'dash' || cls.isManifest;
  const isDrmLikely = isStreamish && signalDrm.isDrmLikely;

  const supportStatus = decideSupportStatus({
    mediaType: cls.mediaType,
    url: input.url,
    isDrmLikely,
    isEncryptedLikely: isStreamish && signalDrm.isEncryptedLikely,
    blockedByPolicy: blocked,
  });

  const key = canonicalKey(input.url);
  const now = Date.now();
  const candidate: MediaCandidate = {
    id: crypto.randomUUID(),
    tabId: input.tabId,
    frameId: input.frameId,
    pageUrl,
    pageTitle: input.pageTitle ?? '',
    pageDomain,
    frameUrl: input.frameUrl,
    url: input.url,
    canonicalKey: key,
    source: input.source,
    mediaType: cls.mediaType,
    supportStatus,
    contentType: input.contentType,
    filename: input.filename ?? getFilenameFromUrl(input.url),
    extension: getExtension(input.url) || undefined,
    width: input.width,
    height: input.height,
    durationSeconds: input.durationSeconds,
    fileSizeBytes: input.fileSizeBytes,
    transferSizeBytes: input.transferSizeBytes,
    qualityLabel: input.qualityLabel,
    isSegment: cls.isSegment,
    isBlob: input.isBlob ?? input.url.startsWith('blob:'),
    isManifest: cls.isManifest,
    isEncryptedLikely: isStreamish && signalDrm.isEncryptedLikely,
    isDrmLikely,
    unsupportedReason: isDrmLikely ? signalDrm.reason : undefined,
    responseHeadersRedacted: input.responseHeaders ? redactHeaders(input.responseHeaders) : undefined,
    replayHeaders: input.replayHeaders,
    createdAt: now,
    updatedAt: now,
  };

  const stored = await upsertCandidate(candidate);
  await pushState(input.tabId);
  return stored;
}

async function ingestRawList(
  tabId: number,
  frameId: number | undefined,
  frameUrl: string | undefined,
  raws: RawCandidate[],
): Promise<void> {
  for (const raw of raws) {
    await ingest({
      tabId,
      frameId,
      frameUrl,
      url: raw.url,
      source: raw.source,
      contentType: raw.contentType,
      pageTitle: raw.pageTitle,
      width: raw.width,
      height: raw.height,
      durationSeconds: raw.durationSeconds,
      filename: raw.filename,
      qualityLabel: raw.qualityLabel,
      isBlob: raw.isBlob,
    });
  }
}

const autoParsed = new Set<string>();

function handleNetworkHit(hit: NetworkHit): void {
  void (async () => {
    const candidate = await ingest({
      tabId: hit.tabId,
      url: hit.url,
      source: 'network',
      contentType: hit.contentType,
      fileSizeBytes: hit.contentLength,
      responseHeaders: hit.responseHeaders,
      replayHeaders: hit.requestHeaders,
    });
    if (!candidate) return;
    // Auto-parse HLS/DASH manifests once so qualities/variants show up without
    // the user clicking — matching what competing downloaders do.
    if (
      candidate.isManifest &&
      !candidate.isDrmLikely &&
      !candidate.variants &&
      !autoParsed.has(candidate.canonicalKey)
    ) {
      autoParsed.add(candidate.canonicalKey);
      const updated = await parseManifestForCandidate(candidate);
      if (updated) {
        await upsertCandidate(updated);
        await pushState(candidate.tabId);
      }
    }
  })();
}

// --- message routing -------------------------------------------------------
async function handleUiRequest(req: UiRequest, sender: chrome.runtime.MessageSender): Promise<UiResponse> {
  switch (req.type) {
    case 'GET_STATE': {
      const tabId = req.tabId ?? sender.tab?.id ?? (await activeTabId());
      if (tabId == null) return { type: 'ERROR', message: 'no_active_tab' };
      const state = await buildTabState(tabId);
      const native = await getNativeStatus();
      return { type: 'STATE', state, native };
    }
    case 'RESCAN': {
      await requestRescan(req.tabId);
      return { type: 'OK' };
    }
    case 'START_DOWNLOAD': {
      const candidate = await findCandidateAnyTab(req.candidateId);
      if (!candidate) return { type: 'ERROR', message: 'candidate_not_found' };
      await startDownload(candidate, req.variantId, (job) => pushJob(candidate.tabId, job));
      await pushState(candidate.tabId);
      return { type: 'OK' };
    }
    case 'CANCEL_DOWNLOAD': {
      await cancelNativeDownload(req.jobId);
      return { type: 'OK' };
    }
    case 'OPEN_JOB_FOLDER': {
      openOutputFolder(req.jobId);
      return { type: 'OK' };
    }
    case 'PICK_FOLDER': {
      const path = await pickFolder();
      return { type: 'FOLDER_PICKED', path };
    }
    case 'COPY_URL': {
      const candidate = await findCandidateAnyTab(req.candidateId);
      if (!candidate) return { type: 'ERROR', message: 'candidate_not_found' };
      return { type: 'COPIED', url: candidate.url };
    }
    case 'PARSE_MANIFEST': {
      const candidate = await findCandidateAnyTab(req.candidateId);
      if (!candidate) return { type: 'ERROR', message: 'candidate_not_found' };
      const updated = await parseManifestForCandidate(candidate);
      if (updated) {
        await upsertCandidate(updated);
        await pushState(updated.tabId);
      }
      return { type: 'OK' };
    }
    case 'GET_NATIVE_STATUS': {
      const native = await getNativeStatus(true);
      return { type: 'NATIVE_STATUS', native };
    }
    default:
      return { type: 'ERROR', message: 'unknown_request' };
  }
}

async function activeTabId(): Promise<number | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}

async function requestRescan(tabId: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'RESCAN' });
  } catch (err) {
    logger.debug('rescan message failed', err);
  }
}

// --- wiring ----------------------------------------------------------------
function init(): void {
  installNetworkListener(handleNetworkHit);
  installTabLifecycle((tabId) => {
    pageSignals.delete(tabId);
    void pushState(tabId);
  });
  installDownloadEvents(
    async (browserDownloadId) => findJobByBrowserDownloadId(browserDownloadId),
    (job) => {
      // job carries candidateId; resolve its tab to push.
      void resolveJobTab(job).then((tabId) => {
        if (tabId != null) pushJob(tabId, job);
      });
    },
  );

  setProgressHandler((msg) => {
    // Native progress/completion -> update matching job.
    void applyNativeProgress(msg);
  });

  // content -> background
  chrome.runtime.onMessage.addListener((message: ContentMessage | UiRequest | OffscreenEvent, sender, sendResponse) => {
    if (
      'type' in message &&
      (message.type === 'OFFSCREEN_PROGRESS' ||
        message.type === 'OFFSCREEN_READY' ||
        message.type === 'OFFSCREEN_FAILED')
    ) {
      void handleOffscreenEvent(message);
      return false;
    }
    if ('type' in message && (message.type === 'CANDIDATES_FOUND' || message.type === 'PAGE_SIGNALS')) {
      const tabId = sender.tab?.id;
      if (tabId == null) return false;
      if (message.type === 'PAGE_SIGNALS') {
        pageSignals.set(tabId, message.signals);
        return false;
      }
      pageSignals.set(tabId, message.signals);
      // sender.url is the (possibly cross-origin iframe) frame's URL — the best
      // Referer for embedded-player segments.
      const frameUrl = sender.url;
      void (async () => {
        if (sender.tab?.url) await setPageInfo(tabId, sender.tab.url, getDomain(sender.tab.url));
        await ingestRawList(tabId, sender.frameId, frameUrl, message.candidates);
      })();
      return false;
    }
    // UI request (expects async response)
    void handleUiRequest(message as UiRequest, sender).then(sendResponse);
    return true;
  });

  // popup live port
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== POPUP_PORT) return;
    ports.set(port, null);
    port.onMessage.addListener((msg: { type: 'WATCH'; tabId: number }) => {
      if (msg.type === 'WATCH') {
        ports.set(port, msg.tabId);
        void pushState(msg.tabId);
      }
    });
    port.onDisconnect.addListener(() => ports.delete(port));
  });

  // settings -> live config
  void applySettings();
  onSettingsChanged(() => void applySettings());
}

async function applySettings(): Promise<void> {
  const s = await loadSettings();
  setDebugLogging(s.debugLogs);
  updateNetworkConfig({ enabled: s.detectNetwork, hideSegments: s.hideSegments });
}

async function resolveJobTab(job: DownloadJob): Promise<number | null> {
  const candidate = await findCandidateAnyTab(job.candidateId);
  return candidate?.tabId ?? null;
}

async function findJobLocation(jobId: string): Promise<{ tabId: number; job: DownloadJob } | null> {
  const tabIds = (await chrome.tabs.query({})).map((t) => t.id).filter((id): id is number => id != null);
  for (const tabId of tabIds) {
    const job = (await listJobs(tabId)).find((j) => j.id === jobId);
    if (job) return { tabId, job };
  }
  return null;
}

async function applyNativeProgress(
  msg: { type: 'JOB_PROGRESS' | 'JOB_COMPLETED' | 'JOB_FAILED'; jobId: string } & Record<string, unknown>,
): Promise<void> {
  const loc = await findJobLocation(msg.jobId);
  if (!loc) return;
  const { tabId, job } = loc;
  if (msg.type === 'JOB_PROGRESS') {
    job.progress = msg.progress as DownloadJob['progress'];
    job.status = 'downloading';
  } else if (msg.type === 'JOB_COMPLETED') {
    job.status = 'completed';
    job.progress.percent = 100;
    job.completedAt = Date.now();
  } else {
    const e = msg.error as { code: string; message: string } | undefined;
    job.status = e?.code === 'cancelled' ? 'cancelled' : 'failed';
    job.error = { code: e?.code ?? 'native_error', message: e?.message ?? 'failed', recoverable: true };
  }
  await upsertJob(tabId, job);
  pushJob(tabId, job);
}

// --- in-browser stream (offscreen) events ----------------------------------
async function countActiveJobs(): Promise<number> {
  const tabIds = (await chrome.tabs.query({})).map((t) => t.id).filter((id): id is number => id != null);
  let count = 0;
  for (const tabId of tabIds) {
    for (const job of await listJobs(tabId)) {
      if (job.status === 'downloading' || job.status === 'preparing' || job.status === 'remuxing') count += 1;
    }
  }
  return count;
}

async function handleOffscreenEvent(evt: OffscreenEvent): Promise<void> {
  const loc = await findJobLocation(evt.jobId);
  if (!loc) return;
  const { tabId, job } = loc;

  if (evt.type === 'OFFSCREEN_PROGRESS') {
    job.progress = { ...job.progress, ...evt.progress };
    job.status = evt.progress.currentStep?.startsWith('Remux') ? 'remuxing' : 'downloading';
  } else if (evt.type === 'OFFSCREEN_READY') {
    job.progress.percent = Math.max(job.progress.percent, 99);
    job.progress.currentStep = 'Saving file';
    try {
      const downloadId = await chrome.downloads.download({ url: evt.blobUrl, filename: evt.filename, saveAs: false });
      job.browserDownloadId = downloadId;
      watchBlobDownload(downloadId, evt.blobUrl);
    } catch (err) {
      job.status = 'failed';
      job.error = { code: 'save_failed', message: err instanceof Error ? err.message : 'unknown', recoverable: true };
      revokeBlob(evt.blobUrl);
    }
  } else {
    // The in-browser engine couldn't finish (complex stream, or a Referer-checking
    // CDN returned 403 on segments). If the desktop helper is available, hand the
    // job off to it automatically — native ffmpeg can replay Referer/UA.
    const native = await getNativeStatus();
    const handoffWorthy =
      evt.error.code === 'native_required' || /\b403\b|segment fetch failed|forbidden/i.test(evt.error.message);

    if (native.installed && handoffWorthy && (await handoffToNative(tabId, job))) {
      await upsertJob(tabId, job);
      pushJob(tabId, job);
      void closeOffscreenIfIdle(await countActiveJobs());
      return;
    }

    if (handoffWorthy) {
      job.status = 'blocked';
      job.error = {
        code: 'native_required',
        message: native.installed
          ? evt.error.message
          : 'Install the desktop helper to download this stream (the CDN blocks in-browser downloads).',
        recoverable: true,
      };
    } else {
      job.status = 'failed';
      job.error = { code: evt.error.code, message: evt.error.message, recoverable: true };
    }
    void closeOffscreenIfIdle(await countActiveJobs());
  }
  await upsertJob(tabId, job);
  pushJob(tabId, job);
}

/** Hand a stuck stream job to the native companion. Returns true if accepted. */
async function handoffToNative(tabId: number, job: DownloadJob): Promise<boolean> {
  const candidate = await findCandidateAnyTab(job.candidateId);
  if (!candidate) return false;
  job.status = 'downloading';
  job.type = candidate.mediaType === 'dash' ? 'native_dash' : 'native_hls';
  job.error = undefined;
  job.progress = { percent: 0, downloadedBytes: 0, currentStep: 'Desktop helper: starting' };

  const settings = await loadSettings();
  const res = await startNativeDownload({
    jobId: job.id,
    kind: candidate.mediaType === 'dash' ? 'dash' : 'hls',
    url: candidate.url,
    outputFilename: job.outputFilename,
    outputDirectory: settings.downloadFolder || undefined,
    headers: buildReplayHeaders(candidate),
  });
  if (!res.accepted) {
    job.status = 'failed';
    job.error = { code: 'native_rejected', message: res.error ?? 'helper rejected job', recoverable: true };
    await upsertJob(tabId, job);
    pushJob(tabId, job);
    return false;
  }
  return true;
}

// Revoke the blob URL and free the offscreen document once the save completes.
function watchBlobDownload(downloadId: number, blobUrl: string): void {
  const listener = (delta: chrome.downloads.DownloadDelta): void => {
    if (delta.id !== downloadId) return;
    const state = delta.state?.current;
    if (state === 'complete' || state === 'interrupted') {
      chrome.downloads.onChanged.removeListener(listener);
      revokeBlob(blobUrl);
      void countActiveJobs().then((n) => closeOffscreenIfIdle(n));
    }
  };
  chrome.downloads.onChanged.addListener(listener);
}

init();

export type { NativeStatus };
