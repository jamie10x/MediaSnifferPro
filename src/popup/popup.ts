import './popup.css';
import type { DownloadJob, MediaCandidate } from '@shared/types';
import type { HistoryEntry } from '@shared/history';
import type { NativeStatus } from '@shared/message-types';
import { redactUrl, redactHeaders } from '@shared/privacy-utils';
import { popupStore, type PopupState } from './state/popup-store';
import { MediaItem } from './components/MediaItem';
import { JobProgress } from './components/JobProgress';
import { EmptyState } from './components/EmptyState';
import { HistoryItem } from './components/HistoryItem';
import { icons } from './components/icons';
import { showToast } from './components/Toast';
import { isBatchDownloadable } from '@shared/quality';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const domainEl = $('domain');
const statusDot = $('status-dot');
const listEl = $('list');
const jobsEl = $('jobs');
const countEl = $('count');
const nativeEl = $('native-status');
const modalRoot = $('modal-root');

let view: 'detected' | 'history' = 'detected';
let history: HistoryEntry[] = [];
let lastState: PopupState | null = null;
const selection = new Set<string>();

// Header icons.
$('logo').innerHTML = `<span class="icon">${icons.play}</span>`;
$('rescan').innerHTML = `<span class="icon">${icons.refresh}</span>`;
$('settings-icon').innerHTML = `<span class="icon">${icons.settings}</span>`;

$('rescan').addEventListener('click', () => {
  popupStore.rescan();
  showToast('Rescanning page…', 'info', 1400);
});
$('open-options').addEventListener('click', () => chrome.runtime.openOptionsPage());

// Tabs.
function setView(next: 'detected' | 'history'): void {
  view = next;
  $('tab-detected').classList.toggle('active', next === 'detected');
  $('tab-history').classList.toggle('active', next === 'history');
  if (next === 'history') void loadHistory();
  if (lastState) render(lastState);
}
$('tab-detected').addEventListener('click', () => setView('detected'));
$('tab-history').addEventListener('click', () => setView('history'));

async function loadHistory(): Promise<void> {
  const res = await popupStore.request({ type: 'GET_HISTORY' });
  if (res.type === 'HISTORY') {
    history = res.entries;
    if (view === 'history' && lastState) render(lastState);
  }
}
popupStore.onHistoryChanged(() => void loadHistory());

function nativeMessage(native: NativeStatus | null): { text: string; cls: 'ok' | 'warn' } | null {
  if (!native) return null;
  if (native.installed) return { text: `Desktop helper connected · v${native.version ?? '?'}`, cls: 'ok' };
  if (native.reason === 'not_installed') {
    return { text: 'Desktop helper not installed — streams detect, but need the helper to download.', cls: 'warn' };
  }
  return { text: 'Desktop helper unavailable.', cls: 'warn' };
}

// Track job statuses across renders so we can toast on transitions.
const seenJobStatus = new Map<string, DownloadJob['status']>();

function reportJobTransitions(jobs: DownloadJob[]): void {
  for (const job of jobs) {
    const prev = seenJobStatus.get(job.id);
    if (prev && prev !== job.status) {
      if (job.status === 'completed') showToast(`Saved · ${job.outputFilename}`, 'success', 3200);
      else if (job.status === 'failed') showToast(`Download failed — ${job.error?.message ?? 'error'}`, 'error', 4000);
      else if (job.status === 'cancelled') showToast('Download cancelled', 'info');
    }
    seenJobStatus.set(job.id, job.status);
  }
}

function render(state: PopupState): void {
  lastState = state;
  domainEl.textContent = state.tab?.pageDomain || (state.loading ? 'Scanning…' : '—');

  const native = nativeMessage(state.native);
  statusDot.className = `status-dot ${state.native?.installed ? 'connected' : state.native ? 'offline' : ''}`;
  if (native) {
    nativeEl.className = `native-status ${native.cls}`;
    nativeEl.innerHTML = `<span class="icon">${state.native?.installed ? icons.check : icons.warning}</span><span></span>`;
    nativeEl.querySelector('span:last-child')!.textContent = native.text;
  } else {
    nativeEl.className = 'native-status hidden';
  }

  // Jobs (active downloads shown on both tabs; completed stay until dismissed).
  reportJobTransitions(state.tab?.jobs ?? []);
  jobsEl.replaceChildren();
  (state.tab?.jobs ?? []).forEach((job) =>
    jobsEl.appendChild(
      JobProgress({
        job,
        onCancel: (jobId) => void popupStore.request({ type: 'CANCEL_DOWNLOAD', jobId }),
        onPause: (jobId) => {
          void popupStore.request({ type: 'PAUSE_DOWNLOAD', jobId });
          showToast('Paused', 'info', 1400);
        },
        onResume: (jobId) => {
          void popupStore.request({ type: 'RESUME_DOWNLOAD', jobId });
          showToast('Resuming…', 'info', 1400);
        },
        onOpenFolder: (jobId) => void popupStore.request({ type: 'OPEN_JOB_FOLDER', jobId }),
        onDismiss: (jobId) => void popupStore.request({ type: 'DISMISS_JOB', jobId }),
      }),
    ),
  );

  if (view === 'history') renderHistory();
  else renderDetected(state);
}

function renderDetected(state: PopupState): void {
  listEl.replaceChildren();
  const candidates = (state.tab?.candidates ?? []).filter((c) => !c.isSegment);
  countEl.innerHTML = `<b>${candidates.length}</b> item${candidates.length === 1 ? '' : 's'}`;

  if (candidates.length === 0) {
    listEl.appendChild(
      state.loading
        ? EmptyState('Scanning this page…', 'Looking for video, audio and streams.', true)
        : EmptyState('No media found yet', 'Press play on a video, then hit the ⟳ button to rescan.'),
    );
    return;
  }

  const batchable = candidates.filter(isBatchDownloadable);
  // Prune stale selections.
  for (const id of [...selection]) if (!batchable.some((c) => c.id === id)) selection.delete(id);

  if (batchable.length >= 2) listEl.appendChild(batchToolbar(batchable));

  for (const c of candidates) {
    const selectable = isBatchDownloadable(c) && batchable.length >= 2;
    listEl.appendChild(
      MediaItem({
        candidate: c,
        selectable,
        selected: selection.has(c.id),
        onToggleSelect: (id, checked) => {
          if (checked) selection.add(id);
          else selection.delete(id);
          if (lastState) renderDetected(lastState);
        },
        onDownload: (candidateId, variantId) => {
          void popupStore.request({ type: 'START_DOWNLOAD', candidateId, variantId });
          showToast('Download started', 'info', 1600);
        },
        onDownloadAudio: (candidateId) => {
          void popupStore.request({ type: 'START_DOWNLOAD', candidateId, mode: 'audio' });
          showToast('Extracting audio…', 'info', 1600);
        },
        onDownloadSubtitle: (candidateId, url, label) => {
          void popupStore.request({ type: 'DOWNLOAD_SUBTITLE', candidateId, subtitleUrl: url, label });
          showToast('Downloading subtitle…', 'info', 1600);
        },
        onCopy: async (candidateId) => {
          const res = await popupStore.request({ type: 'COPY_URL', candidateId });
          if (res.type === 'COPIED') {
            await navigator.clipboard.writeText(res.url).catch(() => {});
            showToast('URL copied to clipboard', 'success');
          }
        },
        onParse: (candidateId) => {
          void popupStore.request({ type: 'PARSE_MANIFEST', candidateId });
          showToast('Loading qualities…', 'info', 1400);
        },
        onDetails: showDetails,
      }),
    );
  }
}

function batchToolbar(batchable: MediaCandidate[]): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'batch-bar';

  const left = document.createElement('label');
  left.className = 'batch-select-all';
  const all = document.createElement('input');
  all.type = 'checkbox';
  all.checked = selection.size === batchable.length && batchable.length > 0;
  all.addEventListener('change', () => {
    if (all.checked) batchable.forEach((c) => selection.add(c.id));
    else selection.clear();
    if (lastState) renderDetected(lastState);
  });
  const lbl = document.createElement('span');
  lbl.textContent = selection.size > 0 ? `${selection.size} selected` : 'Select all';
  left.append(all, lbl);

  const btn = document.createElement('button');
  btn.className = 'primary';
  const ids = selection.size > 0 ? [...selection] : batchable.map((c) => c.id);
  btn.innerHTML = `<span class="icon">${icons.download}</span>`;
  const span = document.createElement('span');
  span.textContent = selection.size > 0 ? `Download ${selection.size}` : `Download all (${batchable.length})`;
  btn.appendChild(span);
  btn.addEventListener('click', () => {
    void popupStore.request({ type: 'BATCH_DOWNLOAD', candidateIds: ids });
    showToast(`Queued ${ids.length} download${ids.length === 1 ? '' : 's'}`, 'success', 2200);
    selection.clear();
    if (lastState) renderDetected(lastState);
  });

  bar.append(left, btn);
  return bar;
}

function renderHistory(): void {
  listEl.replaceChildren();
  countEl.innerHTML = `<b>${history.length}</b> download${history.length === 1 ? '' : 's'}`;

  if (history.length === 0) {
    listEl.appendChild(EmptyState('No downloads yet', 'Your completed downloads will appear here.'));
    return;
  }

  if (history.some((e) => e.status === 'completed')) {
    const bar = document.createElement('div');
    bar.className = 'history-toolbar';
    const clear = document.createElement('button');
    clear.className = 'link-btn';
    clear.textContent = 'Clear completed';
    clear.addEventListener('click', () => void popupStore.request({ type: 'CLEAR_HISTORY' }));
    bar.appendChild(clear);
    listEl.appendChild(bar);
  }

  for (const e of history) {
    listEl.appendChild(
      HistoryItem({
        entry: e,
        onOpenFolder: (id) => void popupStore.request({ type: 'OPEN_HISTORY_FOLDER', id }),
        onRedownload: (id) => {
          void popupStore.request({ type: 'REDOWNLOAD', id });
          showToast('Re-downloading…', 'info', 1600);
          setView('detected');
        },
        onCopy: async (url) => {
          await navigator.clipboard.writeText(url).catch(() => {});
          showToast('URL copied to clipboard', 'success');
        },
        onRemove: (id) => void popupStore.request({ type: 'REMOVE_HISTORY', id }),
      }),
    );
  }
}

function detailRow(key: string, value: string): HTMLElement {
  const row = document.createElement('div');
  row.className = 'detail-row';
  const k = document.createElement('span');
  k.className = 'k';
  k.textContent = key;
  const v = document.createElement('span');
  v.className = 'v';
  v.textContent = value;
  row.append(k, v);
  return row;
}

function showDetails(c: MediaCandidate): void {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) backdrop.remove();
  });

  const modal = document.createElement('div');
  modal.className = 'modal';
  const h = document.createElement('h3');
  h.textContent = 'Media details';
  modal.appendChild(h);

  modal.appendChild(detailRow('URL', redactUrl(c.url)));
  modal.appendChild(detailRow('Type', c.mediaType));
  modal.appendChild(detailRow('Source', c.source));
  modal.appendChild(detailRow('Status', c.supportStatus));
  if (c.contentType) modal.appendChild(detailRow('Content-Type', c.contentType));
  if (c.width && c.height) modal.appendChild(detailRow('Resolution', `${c.width}×${c.height}`));
  if (c.durationSeconds) modal.appendChild(detailRow('Duration', `${Math.round(c.durationSeconds)}s`));
  if (c.fileSizeBytes) modal.appendChild(detailRow('Size', `${c.fileSizeBytes} bytes`));
  if (c.unsupportedReason) modal.appendChild(detailRow('Reason', c.unsupportedReason));

  const headers = redactHeaders(c.responseHeadersRedacted);
  Object.entries(headers)
    .slice(0, 8)
    .forEach(([k, v]) => modal.appendChild(detailRow(k, v)));

  const close = document.createElement('button');
  close.className = 'secondary';
  close.textContent = 'Close';
  close.style.marginTop = '12px';
  close.addEventListener('click', () => backdrop.remove());
  modal.appendChild(close);

  backdrop.appendChild(modal);
  modalRoot.appendChild(backdrop);
}

popupStore.subscribe(render);
void popupStore.init();
