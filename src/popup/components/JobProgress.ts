import type { DownloadJob } from '@shared/types';
import { icons } from './icons';

function humanBytes(n?: number): string {
  if (!n || n <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  return `${m}m ${seconds % 60}s`;
}

function statusLine(job: DownloadJob): string {
  switch (job.status) {
    case 'completed':
      return `Completed · ${humanBytes(job.progress.downloadedBytes) || 'saved'}`;
    case 'failed':
      return `Failed — ${job.error?.message ?? 'error'}`;
    case 'cancelled':
      return 'Cancelled';
    case 'blocked':
      return job.error?.message ?? 'Blocked';
    case 'remuxing':
      return 'Remuxing to MP4…';
    case 'preparing':
      return job.progress.currentStep ?? 'Preparing…';
    case 'downloading': {
      const speed = job.progress.speedBytesPerSecond ? `${humanBytes(job.progress.speedBytesPerSecond)}/s` : '';
      const size = humanBytes(job.progress.downloadedBytes);
      const eta = job.progress.etaSeconds != null && job.progress.etaSeconds > 0 ? `ETA ${formatEta(job.progress.etaSeconds)}` : '';
      const pct = job.progress.percent > 0 ? `${Math.round(job.progress.percent)}%` : job.progress.currentStep ?? 'Starting…';
      return [pct, size, speed, eta].filter(Boolean).join('  ·  ');
    }
    default:
      return job.status;
  }
}

function badgeIcon(job: DownloadJob): keyof typeof icons {
  if (job.status === 'completed') return 'check';
  if (job.status === 'failed' || job.status === 'blocked') return 'warning';
  if (job.status === 'cancelled') return 'cancel';
  return 'download';
}

export interface JobProgressProps {
  job: DownloadJob;
  onCancel: (jobId: string) => void;
  onOpenFolder: (jobId: string) => void;
}

export function JobProgress({ job, onCancel, onOpenFolder }: JobProgressProps): HTMLElement {
  const active = job.status === 'downloading' || job.status === 'preparing' || job.status === 'remuxing';
  const isNative = job.type === 'native_hls' || job.type === 'native_dash';

  const wrap = document.createElement('div');
  wrap.className = `job${job.status === 'completed' ? ' is-completed' : ''}${job.status === 'failed' || job.status === 'blocked' ? ' is-failed' : ''}`;

  const head = document.createElement('div');
  head.className = 'job-head';
  const badge = document.createElement('span');
  badge.className = 'job-badge';
  badge.innerHTML = icons[badgeIcon(job)];
  const name = document.createElement('div');
  name.className = 'job-name';
  name.textContent = job.outputFilename;
  name.title = job.outputFilename;
  head.append(badge, name);
  wrap.appendChild(head);

  if (active) {
    const track = document.createElement('div');
    track.className = 'progress-track';
    const bar = document.createElement('div');
    const indeterminate = job.progress.percent <= 0;
    bar.className = `progress-bar${indeterminate ? ' indeterminate' : ''}`;
    if (!indeterminate) bar.style.width = `${Math.max(3, job.progress.percent)}%`;
    track.appendChild(bar);
    wrap.appendChild(track);
  }

  const meta = document.createElement('div');
  meta.className = `job-meta job-status-${job.status}`;
  meta.textContent = statusLine(job);
  wrap.appendChild(meta);

  if (isNative && (active || job.status === 'completed')) {
    const actions = document.createElement('div');
    actions.className = 'job-actions';
    if (active) actions.appendChild(iconButton('cancel', 'Cancel', 'danger', () => onCancel(job.id)));
    if (job.status === 'completed') actions.appendChild(iconButton('folder', 'Open folder', '', () => onOpenFolder(job.id)));
    wrap.appendChild(actions);
  }

  return wrap;
}

function iconButton(icon: keyof typeof icons, label: string, cls: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  if (cls) b.className = cls;
  const wrap = document.createElement('span');
  wrap.className = 'icon';
  wrap.innerHTML = icons[icon];
  const span = document.createElement('span');
  span.textContent = label;
  b.append(wrap, span);
  b.addEventListener('click', onClick);
  return b;
}
