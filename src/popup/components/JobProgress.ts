import type { DownloadJob } from '@shared/types';

function humanBytes(n?: number): string {
  if (!n || n <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

function statusLine(job: DownloadJob): string {
  switch (job.status) {
    case 'completed':
      return 'Completed';
    case 'failed':
      return `Failed: ${job.error?.message ?? 'error'}`;
    case 'blocked':
      return job.error?.message ?? 'Blocked';
    case 'downloading': {
      const speed = job.progress.speedBytesPerSecond ? `${humanBytes(job.progress.speedBytesPerSecond)}/s` : '';
      const size = humanBytes(job.progress.downloadedBytes);
      return [`${Math.round(job.progress.percent)}%`, size, speed].filter(Boolean).join(' · ');
    }
    default:
      return job.status;
  }
}

export function JobProgress(job: DownloadJob): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'job';

  const name = document.createElement('div');
  name.className = 'job-name';
  name.textContent = job.outputFilename;
  wrap.appendChild(name);

  if (job.status === 'downloading' || job.status === 'preparing' || job.status === 'remuxing') {
    const track = document.createElement('div');
    track.className = 'progress-track';
    const bar = document.createElement('div');
    bar.className = 'progress-bar';
    bar.style.width = `${Math.max(2, job.progress.percent)}%`;
    track.appendChild(bar);
    wrap.appendChild(track);
  }

  const meta = document.createElement('div');
  meta.className = `job-meta job-status-${job.status}`;
  meta.textContent = statusLine(job);
  wrap.appendChild(meta);

  return wrap;
}
