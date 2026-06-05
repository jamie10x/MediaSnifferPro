import type { MediaCandidate } from '@shared/types';
import { PROTECTED_MEDIA_MESSAGE } from '@shared/constants';
import { VariantPicker } from './VariantPicker';
import { icons, iconEl } from './icons';

const STATUS_LABEL: Record<MediaCandidate['supportStatus'], string> = {
  downloadable: 'Ready to download',
  needs_native_companion: 'Needs desktop helper',
  copy_only: 'Copy URL only',
  unsupported: 'Unsupported',
  protected_likely: 'Protected',
  blocked_by_policy: 'Blocked by policy',
};

function iconFor(type: MediaCandidate['mediaType']): keyof typeof icons {
  if (type === 'audio') return 'audio';
  if (type === 'hls' || type === 'dash') return 'film';
  return 'video';
}

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

function chip(text: string, cls = ''): HTMLElement {
  const el = document.createElement('span');
  el.className = `chip ${cls}`.trim();
  el.textContent = text;
  return el;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** The friendly display title: the page/episode title for streams & video. */
function displayName(c: MediaCandidate): string {
  const title = c.pageTitle?.trim();
  const isStream = c.mediaType === 'hls' || c.mediaType === 'dash';
  if (title && (isStream || c.mediaType === 'video')) return title;
  return c.filename || title || c.url;
}

/** Secondary line: the underlying file/manifest name (so it's not lost). */
function displaySub(c: MediaCandidate): string {
  const name = displayName(c);
  if (c.filename && c.filename !== name) return c.filename;
  if (name !== c.url) return hostOf(c.url);
  return '';
}

export interface MediaItemProps {
  candidate: MediaCandidate;
  onDownload: (candidateId: string, variantId?: string) => void;
  onDownloadSubtitle: (candidateId: string, url: string, label?: string) => void;
  onTools: (candidate: MediaCandidate) => void;
  onCopy: (candidateId: string) => void;
  onDetails: (candidate: MediaCandidate) => void;
  onParse: (candidateId: string) => void;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (candidateId: string, checked: boolean) => void;
}

export function MediaItem(props: MediaItemProps): HTMLElement {
  const c = props.candidate;
  const isProtected = c.supportStatus === 'protected_likely';
  const isStream = c.mediaType === 'hls' || c.mediaType === 'dash';

  const item = document.createElement('div');
  item.className = `media-item${isProtected ? ' protected' : ''}${props.selected ? ' selected' : ''}`;

  // Head: optional checkbox + thumbnail + title + type/subtitle.
  const head = document.createElement('div');
  head.className = 'mi-head';
  if (props.selectable) {
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'mi-check';
    cb.checked = !!props.selected;
    cb.addEventListener('change', () => props.onToggleSelect?.(c.id, cb.checked));
    head.appendChild(cb);
  }

  // Thumbnail: poster image if we have one, else a gradient type icon.
  const thumb = document.createElement('div');
  thumb.className = `mi-thumb ${c.mediaType}`;
  const showPoster = !!c.posterUrl && (c.mediaType === 'video' || isStream);
  if (showPoster) {
    const img = document.createElement('img');
    img.src = c.posterUrl!;
    img.alt = '';
    img.loading = 'lazy';
    img.addEventListener('error', () => {
      thumb.classList.add('fallback');
      thumb.innerHTML = icons[iconFor(c.mediaType)];
    });
    thumb.appendChild(img);
    const tag = document.createElement('span');
    tag.className = 'mi-thumb-tag';
    tag.textContent = c.mediaType.toUpperCase();
    thumb.appendChild(tag);
  } else {
    thumb.classList.add('fallback');
    thumb.innerHTML = icons[iconFor(c.mediaType)];
  }

  const headtext = document.createElement('div');
  headtext.className = 'mi-headtext';
  const typeEl = document.createElement('div');
  typeEl.className = `mi-type ${c.mediaType}`;
  typeEl.textContent = c.mediaType.toUpperCase();
  const name = document.createElement('div');
  name.className = 'mi-name';
  name.textContent = displayName(c);
  name.title = displayName(c);
  headtext.append(typeEl, name);
  const sub = displaySub(c);
  if (sub) {
    const subEl = document.createElement('div');
    subEl.className = 'mi-sub';
    subEl.textContent = sub;
    headtext.appendChild(subEl);
  }
  head.append(thumb, headtext);
  item.appendChild(head);

  // Chips: status + metadata.
  const chips = document.createElement('div');
  chips.className = 'chips';
  chips.appendChild(chip(STATUS_LABEL[c.supportStatus], `status ${c.supportStatus}`));
  if (c.qualityLabel) chips.appendChild(chip(c.qualityLabel));
  else if (c.height) chips.appendChild(chip(`${c.height}p`));
  if (c.fileSizeBytes) chips.appendChild(chip(humanBytes(c.fileSizeBytes)));
  if (c.durationSeconds) chips.appendChild(chip(formatDuration(c.durationSeconds)));
  chips.appendChild(chip(c.source));
  item.appendChild(chips);

  if (isProtected) {
    const note = document.createElement('div');
    note.className = 'protected-note';
    note.appendChild(iconEl('lock'));
    const txt = document.createElement('span');
    txt.textContent = c.unsupportedReason ? `${c.unsupportedReason} ${PROTECTED_MEDIA_MESSAGE}` : PROTECTED_MEDIA_MESSAGE;
    note.appendChild(txt);
    item.appendChild(note);
  }

  if (isStream && c.variants && c.variants.length > 0 && !isProtected) {
    item.appendChild(
      VariantPicker({ variants: c.variants, onSelect: (variantId) => props.onDownload(c.id, variantId) }),
    );
  }

  // Subtitle tracks (from HLS #EXT-X-MEDIA or attached metadata).
  if (!isProtected && c.subtitles && c.subtitles.length > 0) {
    const subs = document.createElement('div');
    subs.className = 'subs';
    const heading = document.createElement('div');
    heading.className = 'subs-heading';
    heading.textContent = 'Subtitles';
    subs.appendChild(heading);
    for (const t of c.subtitles) {
      const row = document.createElement('div');
      row.className = 'sub-row';
      const lbl = document.createElement('span');
      lbl.className = 'sub-label';
      lbl.textContent = t.label || t.language || 'Subtitle';
      const dl = document.createElement('button');
      dl.className = 'btn-sm';
      dl.innerHTML = `<span class="icon">${icons.download}</span><span>SRT</span>`;
      dl.addEventListener('click', () => props.onDownloadSubtitle(c.id, t.url, t.language || t.label));
      row.append(lbl, dl);
      subs.appendChild(row);
    }
    item.appendChild(subs);
  }

  // Actions.
  const actions = document.createElement('div');
  actions.className = 'actions';

  const videoish = c.mediaType === 'video' || isStream;
  const downloadable = c.supportStatus === 'downloadable' || c.supportStatus === 'needs_native_companion';

  if (c.supportStatus === 'downloadable') {
    actions.appendChild(button('primary', 'download', 'Download', () => props.onDownload(c.id)));
  }
  if (videoish && downloadable && !isProtected) {
    actions.appendChild(button('secondary', 'scissors', 'Tools', () => props.onTools(c)));
  }
  if (isStream && !isProtected) {
    const label = c.variants && c.variants.length ? 'Refresh' : 'Quality';
    actions.appendChild(button('secondary', 'refresh', label, () => props.onParse(c.id)));
  }
  actions.appendChild(button('secondary', 'copy', 'Copy', () => props.onCopy(c.id)));
  actions.appendChild(button('secondary', 'info', 'Details', () => props.onDetails(c)));

  item.appendChild(actions);
  return item;
}

function button(cls: string, icon: keyof typeof icons, label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = cls;
  const wrap = document.createElement('span');
  wrap.className = 'icon';
  wrap.innerHTML = icons[icon];
  const span = document.createElement('span');
  span.textContent = label;
  b.append(wrap, span);
  b.addEventListener('click', onClick);
  return b;
}

function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
