import type { HistoryEntry } from '@shared/history';
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

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

function statusIcon(entry: HistoryEntry): keyof typeof icons {
  if (entry.status === 'completed') return 'check';
  if (entry.status === 'cancelled') return 'cancel';
  return 'warning';
}

function chip(text: string, cls = ''): HTMLElement {
  const el = document.createElement('span');
  el.className = `chip ${cls}`.trim();
  el.textContent = text;
  return el;
}

export interface HistoryItemProps {
  entry: HistoryEntry;
  onOpenFolder: (id: string) => void;
  onRedownload: (id: string) => void;
  onCopy: (url: string) => void;
  onRemove: (id: string) => void;
}

export function HistoryItem(props: HistoryItemProps): HTMLElement {
  const e = props.entry;
  const item = document.createElement('div');
  item.className = `history-item status-${e.status}`;

  const head = document.createElement('div');
  head.className = 'hi-head';
  const badge = document.createElement('span');
  badge.className = `hi-badge ${e.status}`;
  badge.innerHTML = icons[statusIcon(e)];
  const name = document.createElement('div');
  name.className = 'hi-name';
  name.textContent = e.filename;
  name.title = e.filename;
  head.append(badge, name);
  item.appendChild(head);

  const chips = document.createElement('div');
  chips.className = 'chips';
  if (e.domain) chips.appendChild(chip(e.domain));
  if (e.quality) chips.appendChild(chip(e.quality));
  if (e.sizeBytes) chips.appendChild(chip(humanBytes(e.sizeBytes)));
  chips.appendChild(chip(relativeTime(e.createdAt)));
  if (e.status !== 'completed') chips.appendChild(chip(e.status, `status ${e.status === 'failed' ? 'protected_likely' : 'copy_only'}`));
  item.appendChild(chips);

  const actions = document.createElement('div');
  actions.className = 'actions';
  if (e.status === 'completed' && e.via === 'native') {
    actions.appendChild(btn('secondary', 'folder', 'Open', () => props.onOpenFolder(e.id)));
  }
  if (e.redownload) {
    actions.appendChild(btn('secondary', 'download', 'Re-download', () => props.onRedownload(e.id)));
    actions.appendChild(btn('secondary', 'copy', 'Copy', () => props.onCopy(e.redownload!.url)));
  }
  actions.appendChild(btn('secondary', 'cancel', 'Remove', () => props.onRemove(e.id)));
  item.appendChild(actions);

  return item;
}

function btn(cls: string, icon: keyof typeof icons, label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = cls;
  const w = document.createElement('span');
  w.className = 'icon';
  w.innerHTML = icons[icon];
  const s = document.createElement('span');
  s.textContent = label;
  b.append(w, s);
  b.addEventListener('click', onClick);
  return b;
}
