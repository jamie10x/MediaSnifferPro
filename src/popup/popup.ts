import './popup.css';
import type { MediaCandidate } from '@shared/types';
import type { NativeStatus } from '@shared/message-types';
import { redactUrl, redactHeaders } from '@shared/privacy-utils';
import { popupStore, type PopupState } from './state/popup-store';
import { MediaItem } from './components/MediaItem';
import { JobProgress } from './components/JobProgress';
import { EmptyState } from './components/EmptyState';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const domainEl = $('domain');
const listEl = $('list');
const jobsEl = $('jobs');
const countEl = $('count');
const nativeEl = $('native-status');
const modalRoot = $('modal-root');

$('rescan').addEventListener('click', () => popupStore.rescan());
$('open-options').addEventListener('click', () => chrome.runtime.openOptionsPage());

function nativeMessage(native: NativeStatus | null): string | null {
  if (!native) return null;
  if (native.installed) return `Desktop helper connected (v${native.version ?? '?'}).`;
  if (native.reason === 'not_installed') {
    return 'Desktop helper not installed. HLS/DASH streams can be detected but need the companion app to download.';
  }
  return 'Desktop helper unavailable.';
}

function render(state: PopupState): void {
  domainEl.textContent = state.tab?.pageDomain || (state.loading ? 'Scanning…' : '—');

  const msg = nativeMessage(state.native);
  if (msg) {
    nativeEl.textContent = msg;
    nativeEl.classList.remove('hidden');
  } else {
    nativeEl.classList.add('hidden');
  }

  // Jobs.
  jobsEl.replaceChildren();
  const activeJobs = (state.tab?.jobs ?? []).filter(
    (j) => j.status !== 'completed' || Date.now() - (j.completedAt ?? 0) < 60_000,
  );
  activeJobs.forEach((job) => jobsEl.appendChild(JobProgress(job)));

  // Candidates.
  listEl.replaceChildren();
  const candidates = (state.tab?.candidates ?? []).filter((c) => !c.isSegment);
  countEl.textContent = `${candidates.length} item${candidates.length === 1 ? '' : 's'}`;

  if (candidates.length === 0) {
    listEl.appendChild(
      EmptyState(state.loading ? 'Scanning this page…' : 'No downloadable media detected on this page.'),
    );
    return;
  }

  for (const c of candidates) {
    listEl.appendChild(
      MediaItem({
        candidate: c,
        onDownload: (candidateId, variantId) => {
          void popupStore.request({ type: 'START_DOWNLOAD', candidateId, variantId });
        },
        onCopy: async (candidateId) => {
          const res = await popupStore.request({ type: 'COPY_URL', candidateId });
          if (res.type === 'COPIED') {
            await navigator.clipboard.writeText(res.url).catch(() => {});
          }
        },
        onParse: (candidateId) => {
          void popupStore.request({ type: 'PARSE_MANIFEST', candidateId });
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
