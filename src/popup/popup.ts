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
let historyQuery = '';
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
        onRetry: (jobId) => {
          void popupStore.request({ type: 'RETRY_JOB', jobId });
          showToast('Retrying…', 'info', 1400);
        },
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
        onTools: showTools,
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

  if (history.length === 0) {
    countEl.innerHTML = `<b>0</b> downloads`;
    listEl.appendChild(EmptyState('No downloads yet', 'Your completed downloads will appear here.'));
    return;
  }

  // Search + clear toolbar.
  const bar = document.createElement('div');
  bar.className = 'history-toolbar';
  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'history-search';
  search.placeholder = 'Search downloads…';
  search.value = historyQuery;
  search.addEventListener('input', () => {
    historyQuery = search.value;
    renderHistory();
    // keep focus + caret after re-render
    const fresh = listEl.querySelector<HTMLInputElement>('.history-search');
    if (fresh) {
      fresh.focus();
      fresh.setSelectionRange(historyQuery.length, historyQuery.length);
    }
  });
  bar.appendChild(search);
  if (history.some((e) => e.status === 'completed')) {
    const clear = document.createElement('button');
    clear.className = 'link-btn';
    clear.textContent = 'Clear completed';
    clear.addEventListener('click', () => void popupStore.request({ type: 'CLEAR_HISTORY' }));
    bar.appendChild(clear);
  }
  listEl.appendChild(bar);

  const q = historyQuery.trim().toLowerCase();
  const filtered = q
    ? history.filter((e) => `${e.filename} ${e.domain} ${e.quality ?? ''}`.toLowerCase().includes(q))
    : history;
  countEl.innerHTML = `<b>${filtered.length}</b> download${filtered.length === 1 ? '' : 's'}`;

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-sub';
    empty.style.textAlign = 'center';
    empty.style.padding = '24px';
    empty.textContent = 'No matches.';
    listEl.appendChild(empty);
    return;
  }

  for (const e of filtered) {
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

function openModal(title: string): { modal: HTMLElement; close: () => void } {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) backdrop.remove();
  });
  const modal = document.createElement('div');
  modal.className = 'modal';
  const h = document.createElement('h3');
  h.textContent = title;
  modal.appendChild(h);
  backdrop.appendChild(modal);
  modalRoot.appendChild(backdrop);
  return { modal, close: () => backdrop.remove() };
}

function toolSection(title: string): HTMLElement {
  const sec = document.createElement('div');
  sec.className = 'tool-section';
  const t = document.createElement('div');
  t.className = 'tool-title';
  t.textContent = title;
  sec.appendChild(t);
  return sec;
}

function pill(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'tool-pill';
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function showTools(c: MediaCandidate): void {
  const { modal, close } = openModal('Edit & convert');
  const run = (edit: import('@shared/types').EditSpec, msg: string): void => {
    void popupStore.request({ type: 'EDIT_DOWNLOAD', candidateId: c.id, edit });
    showToast(msg, 'info', 1800);
    close();
  };

  // Trim
  const trim = toolSection('Trim a clip');
  const row = document.createElement('div');
  row.className = 'tool-row';
  const start = document.createElement('input');
  start.type = 'text';
  start.className = 'tool-time';
  start.placeholder = 'Start  0:00';
  const end = document.createElement('input');
  end.type = 'text';
  end.className = 'tool-time';
  end.placeholder = 'End  0:30';
  const go = pill('Download clip', () => {
    if (!start.value && !end.value) {
      showToast('Enter a start and/or end time', 'error');
      return;
    }
    run({ op: 'trim', start: start.value || undefined, end: end.value || undefined }, 'Trimming clip…');
  });
  go.classList.add('primary-pill');
  row.append(start, end, go);
  trim.appendChild(row);
  modal.appendChild(trim);

  // Convert
  const conv = toolSection('Convert format');
  const convRow = document.createElement('div');
  convRow.className = 'tool-row wrap';
  (['mp4', 'mkv', 'webm'] as const).forEach((container) =>
    convRow.appendChild(
      pill(container.toUpperCase(), () => run({ op: 'convert', container }, `Converting to ${container.toUpperCase()}…`)),
    ),
  );
  conv.appendChild(convRow);
  modal.appendChild(conv);

  // Compress
  const comp = toolSection('Compress (re-encode smaller)');
  const compRow = document.createElement('div');
  compRow.className = 'tool-row wrap';
  compRow.appendChild(pill('Balanced', () => run({ op: 'compress', level: 'balanced' }, 'Compressing…')));
  compRow.appendChild(pill('Smaller', () => run({ op: 'compress', level: 'small' }, 'Compressing…')));
  comp.appendChild(compRow);
  modal.appendChild(comp);

  // Audio
  const aud = toolSection('Extract audio');
  const audRow = document.createElement('div');
  audRow.className = 'tool-row wrap';
  (['m4a', 'mp3', 'flac'] as const).forEach((audioFormat) =>
    audRow.appendChild(
      pill(audioFormat.toUpperCase(), () => run({ op: 'audio', audioFormat }, `Extracting ${audioFormat.toUpperCase()}…`)),
    ),
  );
  aud.appendChild(audRow);
  modal.appendChild(aud);

  const note = document.createElement('div');
  note.className = 'tool-note';
  note.textContent = 'Editing runs through the desktop helper and downloads the full media first.';
  modal.appendChild(note);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'secondary';
  closeBtn.textContent = 'Close';
  closeBtn.style.marginTop = '12px';
  closeBtn.addEventListener('click', close);
  modal.appendChild(closeBtn);
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
