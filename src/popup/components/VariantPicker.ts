import type { StreamVariant } from '@shared/types';
import { icons } from './icons';

function variantLabel(v: StreamVariant): string {
  if (v.height) return `${v.height}p`;
  if (v.bandwidth) return `${Math.round(v.bandwidth / 1000)} kbps`;
  return 'Auto';
}

function variantDetail(v: StreamVariant): string {
  const parts: string[] = [];
  if (v.bandwidth) parts.push(`${(v.bandwidth / 1_000_000).toFixed(1)} Mbps`);
  if (v.codecs) parts.push(v.codecs.split(',')[0]!);
  return parts.join(' · ');
}

export interface VariantPickerProps {
  variants: StreamVariant[];
  onSelect: (variantId: string) => void;
}

export function VariantPicker({ variants, onSelect }: VariantPickerProps): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'variants';

  const sorted = variants
    .slice()
    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0) || (b.bandwidth ?? 0) - (a.bandwidth ?? 0));

  sorted.forEach((v, idx) => {
    const row = document.createElement('div');
    row.className = 'variant';

    const info = document.createElement('div');
    info.className = 'variant-info';
    const q = document.createElement('div');
    q.className = 'variant-q';
    q.textContent = variantLabel(v);
    if (idx === 0) {
      const tag = document.createElement('span');
      tag.className = 'variant-tag';
      tag.textContent = 'Best';
      q.appendChild(tag);
    }
    const sub = document.createElement('div');
    sub.className = 'variant-sub';
    sub.textContent = variantDetail(v);
    info.append(q, sub);
    row.appendChild(info);

    const usable = v.supportStatus === 'requires_native';
    const btn = document.createElement('button');
    btn.className = 'btn-sm';
    if (usable) {
      const wrapIcon = document.createElement('span');
      wrapIcon.className = 'icon';
      wrapIcon.innerHTML = icons.download;
      const txt = document.createElement('span');
      txt.textContent = 'Get';
      btn.append(wrapIcon, txt);
      btn.addEventListener('click', () => onSelect(v.id));
    } else {
      btn.textContent = v.supportStatus === 'unsupported_drm' ? 'DRM' : 'Encrypted';
      btn.disabled = true;
    }
    row.appendChild(btn);
    wrap.appendChild(row);
  });

  return wrap;
}
