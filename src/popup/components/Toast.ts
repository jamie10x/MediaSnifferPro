// Lightweight transient toast notifications.

import { icons } from './icons';

type ToastKind = 'success' | 'error' | 'info';

let container: HTMLElement | null = null;

function ensureContainer(): HTMLElement {
  if (container) return container;
  container = document.createElement('div');
  container.className = 'toast-container';
  document.body.appendChild(container);
  return container;
}

const ICON: Record<ToastKind, keyof typeof icons> = {
  success: 'check',
  error: 'warning',
  info: 'info',
};

export function showToast(message: string, kind: ToastKind = 'info', durationMs = 2600): void {
  const root = ensureContainer();
  const toast = document.createElement('div');
  toast.className = `toast toast-${kind}`;
  toast.innerHTML = `<span class="toast-icon">${icons[ICON[kind]]}</span><span class="toast-msg"></span>`;
  toast.querySelector('.toast-msg')!.textContent = message;
  root.appendChild(toast);

  // Animate in on next frame.
  requestAnimationFrame(() => toast.classList.add('show'));

  const remove = (): void => {
    toast.classList.remove('show');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    setTimeout(() => toast.remove(), 400);
  };
  setTimeout(remove, durationMs);
  toast.addEventListener('click', remove);
}
