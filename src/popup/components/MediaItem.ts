import type { MediaCandidate } from '@shared/types';
import { PROTECTED_MEDIA_MESSAGE } from '@shared/constants';
import { VariantPicker } from './VariantPicker';

const STATUS_LABEL: Record<MediaCandidate['supportStatus'], string> = {
  downloadable: 'Downloadable',
  needs_native_companion: 'Needs desktop helper',
  copy_only: 'Copy URL only',
  unsupported: 'Unsupported',
  protected_likely: 'Protected stream likely',
  blocked_by_policy: 'Blocked by your policy',
};

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

export interface MediaItemProps {
  candidate: MediaCandidate;
  onDownload: (candidateId: string, variantId?: string) => void;
  onCopy: (candidateId: string) => void;
  onDetails: (candidate: MediaCandidate) => void;
  onParse: (candidateId: string) => void;
}

export function MediaItem(props: MediaItemProps): HTMLElement {
  const c = props.candidate;
  const item = document.createElement('div');
  item.className = 'media-item';

  // Title row.
  const row = document.createElement('div');
  row.className = 'row';
  const badge = document.createElement('span');
  badge.className = `badge ${c.mediaType}`;
  badge.textContent = c.mediaType;
  const name = document.createElement('span');
  name.className = 'media-name';
  name.textContent = c.filename || c.url;
  name.title = c.url;
  row.append(badge, name);
  item.appendChild(row);

  // Meta line.
  const meta = document.createElement('div');
  meta.className = 'meta';
  const bits: string[] = [`Source: ${c.source}`];
  if (c.qualityLabel) bits.push(c.qualityLabel);
  else if (c.height) bits.push(`${c.height}p`);
  if (c.fileSizeBytes) bits.push(humanBytes(c.fileSizeBytes));
  if (c.contentType) bits.push(c.contentType);
  meta.textContent = bits.join(' · ');
  item.appendChild(meta);

  // Status.
  const status = document.createElement('div');
  status.className = `status ${c.supportStatus}`;
  status.textContent = STATUS_LABEL[c.supportStatus];
  item.appendChild(status);

  const isProtected = c.supportStatus === 'protected_likely';
  const isStream = c.mediaType === 'hls' || c.mediaType === 'dash';

  if (isProtected) {
    const note = document.createElement('div');
    note.className = 'protected-note';
    note.textContent = c.unsupportedReason ? `${c.unsupportedReason} ${PROTECTED_MEDIA_MESSAGE}` : PROTECTED_MEDIA_MESSAGE;
    item.appendChild(note);
  }

  // Stream variants (after parsing).
  if (isStream && c.variants && c.variants.length > 0 && !isProtected) {
    item.appendChild(
      VariantPicker({ variants: c.variants, onSelect: (variantId) => props.onDownload(c.id, variantId) }),
    );
  }

  // Actions.
  const actions = document.createElement('div');
  actions.className = 'actions';

  if (c.supportStatus === 'downloadable') {
    const dl = document.createElement('button');
    dl.className = 'primary';
    dl.textContent = 'Download';
    dl.addEventListener('click', () => props.onDownload(c.id));
    actions.appendChild(dl);
  }

  if (isStream && !isProtected) {
    const parse = document.createElement('button');
    parse.className = 'primary';
    parse.textContent = c.variants && c.variants.length ? 'Refresh variants' : 'Choose quality';
    parse.addEventListener('click', () => props.onParse(c.id));
    actions.appendChild(parse);
  }

  const copy = document.createElement('button');
  copy.className = 'secondary';
  copy.textContent = 'Copy URL';
  copy.addEventListener('click', () => props.onCopy(c.id));
  actions.appendChild(copy);

  const details = document.createElement('button');
  details.className = 'secondary';
  details.textContent = 'Details';
  details.addEventListener('click', () => props.onDetails(c));
  actions.appendChild(details);

  item.appendChild(actions);
  return item;
}
