import type { StreamVariant } from '@shared/types';

function variantLabel(v: StreamVariant): string {
  if (v.height) return `${v.height}p`;
  if (v.bandwidth) return `${Math.round(v.bandwidth / 1000)} kbps`;
  return 'variant';
}

function variantDetail(v: StreamVariant): string {
  const parts: string[] = [];
  if (v.codecs) parts.push(v.codecs);
  if (v.bandwidth) parts.push(`${(v.bandwidth / 1_000_000).toFixed(1)} Mbps`);
  return parts.join(' · ');
}

export interface VariantPickerProps {
  variants: StreamVariant[];
  onSelect: (variantId: string) => void;
}

export function VariantPicker({ variants, onSelect }: VariantPickerProps): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'variants';

  variants
    .slice()
    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0) || (b.bandwidth ?? 0) - (a.bandwidth ?? 0))
    .forEach((v) => {
      const row = document.createElement('div');
      row.className = 'variant';

      const left = document.createElement('span');
      left.textContent = `${variantLabel(v)}${variantDetail(v) ? ` — ${variantDetail(v)}` : ''}`;
      row.appendChild(left);

      const usable = v.supportStatus === 'requires_native';
      const btn = document.createElement('button');
      btn.className = 'secondary';
      btn.textContent = usable ? 'Needs helper' : v.supportStatus === 'unsupported_drm' ? 'DRM' : 'Encrypted';
      btn.disabled = !usable;
      if (usable) btn.addEventListener('click', () => onSelect(v.id));
      row.appendChild(btn);

      wrap.appendChild(row);
    });

  return wrap;
}
