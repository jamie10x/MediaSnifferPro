import { icons } from './icons';

export function EmptyState(title: string, sub = '', scanning = false): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'empty';

  if (scanning) {
    const spin = document.createElement('div');
    spin.className = 'spinner';
    wrap.appendChild(spin);
  } else {
    const icon = document.createElement('div');
    icon.className = 'empty-icon';
    icon.innerHTML = icons.scan;
    wrap.appendChild(icon);
  }

  const t = document.createElement('div');
  t.className = 'empty-title';
  t.textContent = title;
  wrap.appendChild(t);

  if (sub) {
    const s = document.createElement('div');
    s.className = 'empty-sub';
    s.textContent = sub;
    wrap.appendChild(s);
  }
  return wrap;
}
