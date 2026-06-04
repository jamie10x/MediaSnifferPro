import './popup.css';
import type { DownloadJob, MediaCandidate } from '@shared/types';
import type { NativeStatus } from '@shared/message-types';
import { redactUrl, redactHeaders } from '@shared/privacy-utils';
import { popupStore, type PopupState } from './state/popup-store';
import { MediaItem } from './components/MediaItem';
import { JobProgress } from './components/JobProgress';
import { EmptyState } from './components/EmptyState';
import { icons } from './components/icons';
import { showToast } from './components/Toast';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const domainEl = $('domain');
const statusDot = $('status-dot');
const listEl = $('list');
const jobsEl = $('jobs');
const countEl = $('count');
const nativeEl = $('native-status');
const modalRoot = $('modal-root');

// Header icons.
$('logo').innerHTML = `<span class="icon">${icons.play}</span>`;
$('rescan').innerHTML = `<span class="icon">${icons.refresh}</span>`;
$('settings-icon').innerHTML = `<span class="icon">${icons.settings}</span>`;

$('rescan').addEventListener('click', () => {
  popupStore.rescan();
  showToast('Rescanning page…', 'info', 1400);
});
$('open-options').addEventListener('click', () => chrome.runtime.openOptionsPage());

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

  // Jobs.
  reportJobTransitions(state.tab?.jobs ?? []);
  jobsEl.replaceChildren();
  const activeJobs = (state.tab?.jobs ?? []).filter(
    (j) => j.status !== 'completed' || Date.now() - (j.completedAt ?? 0) < 60_000,
  );
  activeJobs.forEach((job) =>
    jobsEl.appendChild(
      JobProgress({
        job,
        onCancel: (jobId) => void popupStore.request({ type: 'CANCEL_DOWNLOAD', jobId }),
        onOpenFolder: (jobId) => void popupStore.request({ type: 'OPEN_JOB_FOLDER', jobId }),
      }),
    ),
  );

  // Candidates.
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

  for (const c of candidates) {
    listEl.appendChild(
      MediaItem({
        candidate: c,
        onDownload: (candidateId, variantId) => {
          void popupStore.request({ type: 'START_DOWNLOAD', candidateId, variantId });
          showToast('Download started', 'info', 1600);
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
