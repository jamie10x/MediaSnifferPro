// Optional in-page floating download button. Shadow-DOM isolated so page CSS
// can't touch it (and ours can't touch the page). Top frame only. Shown only
// when the background reports downloadable media; hidden on DRM/empty pages.

import type { WidgetSummary } from '@shared/message-types';

const HOST_ID = 'media-sniffer-pro-widget';
const ICON_DL =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M5 21h14"/></svg>';
const ICON_COPY =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

let shadow: ShadowRoot | null = null;
let open = false;
let current: WidgetSummary = { enabled: false, items: [], helperConnected: false };

const STYLE = `
:host { all: initial; }
* { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
.wrap { position: fixed; right: 18px; bottom: 18px; z-index: 2147483647; }
.fab {
  width: 52px; height: 52px; border-radius: 16px; border: none; cursor: pointer;
  background: linear-gradient(135deg, #14b8a6, #6366f1); color: #fff;
  box-shadow: 0 8px 24px rgba(0,0,0,.4); display: grid; place-items: center;
  transition: transform .15s ease; position: relative;
}
.fab:hover { transform: translateY(-2px) scale(1.04); }
.fab svg { width: 22px; height: 22px; }
.badge {
  position: absolute; top: -6px; right: -6px; min-width: 20px; height: 20px; padding: 0 5px;
  border-radius: 10px; background: #f5576c; color: #fff; font-size: 11px; font-weight: 700;
  display: grid; place-items: center; box-shadow: 0 2px 6px rgba(0,0,0,.3);
}
.panel {
  position: absolute; right: 0; bottom: 64px; width: 320px; max-height: 60vh; overflow-y: auto;
  background: #151d31; border: 1px solid #283450; border-radius: 14px; color: #e8edf7;
  box-shadow: 0 12px 36px rgba(0,0,0,.5); padding: 12px; display: none;
}
.panel.show { display: block; }
.phead { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.ptitle { font-size: 13px; font-weight: 700; }
.pclose { background: none; border: none; color: #93a1bd; cursor: pointer; font-size: 18px; line-height: 1; }
.item { background: #1d2740; border: 1px solid #202b45; border-radius: 10px; padding: 9px 10px; margin-bottom: 8px; }
.iname { font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.imeta { font-size: 10.5px; color: #93a1bd; margin-top: 2px; }
.iactions { display: flex; gap: 6px; margin-top: 8px; }
.btn { border: none; border-radius: 7px; padding: 6px 10px; font-size: 11.5px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; }
.btn svg { width: 13px; height: 13px; }
.btn.dl { background: linear-gradient(135deg,#14b8a6,#0d9488); color: #04211d; }
.btn.sec { background: #243150; color: #e8edf7; }
.pfoot { display: flex; align-items: center; justify-content: space-between; margin-top: 4px; }
.link { background: none; border: none; color: #14b8a6; font-size: 11.5px; font-weight: 600; cursor: pointer; }
.link.muted { color: #64708c; }
.helper { font-size: 10.5px; color: #fbbf24; margin-bottom: 8px; }
`;

function send(message: unknown): Promise<{ type?: string; url?: string } | undefined> {
  return chrome.runtime.sendMessage(message).catch(() => undefined) as Promise<{ type?: string; url?: string } | undefined>;
}

function ensureHost(): ShadowRoot {
  if (shadow) return shadow;
  const host = document.createElement('div');
  host.id = HOST_ID;
  shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = STYLE;
  shadow.appendChild(style);
  const wrap = document.createElement('div');
  wrap.className = 'wrap';
  shadow.appendChild(wrap);
  (document.documentElement || document.body).appendChild(host);
  return shadow;
}

function render(): void {
  const root = ensureHost();
  const wrap = root.querySelector('.wrap')!;
  wrap.replaceChildren();

  const fab = document.createElement('button');
  fab.className = 'fab';
  fab.title = 'MediaSniffer Pro — downloadable media';
  fab.innerHTML = ICON_DL;
  if (current.items.length > 0) {
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = String(current.items.length);
    fab.appendChild(badge);
  }
  fab.addEventListener('click', () => {
    open = !open;
    render();
  });
  wrap.appendChild(fab);

  if (!open) return;

  const panel = document.createElement('div');
  panel.className = 'panel show';

  const phead = document.createElement('div');
  phead.className = 'phead';
  const ptitle = document.createElement('span');
  ptitle.className = 'ptitle';
  ptitle.textContent = 'MediaSniffer Pro';
  const pclose = document.createElement('button');
  pclose.className = 'pclose';
  pclose.textContent = '×';
  pclose.addEventListener('click', () => {
    open = false;
    render();
  });
  phead.append(ptitle, pclose);
  panel.appendChild(phead);

  if (current.items.some((i) => i.needsHelper) && !current.helperConnected) {
    const h = document.createElement('div');
    h.className = 'helper';
    h.textContent = 'Some streams need the desktop helper to download.';
    panel.appendChild(h);
  }

  for (const item of current.items) {
    const el = document.createElement('div');
    el.className = 'item';
    const name = document.createElement('div');
    name.className = 'iname';
    name.textContent = item.label;
    name.title = item.label;
    const meta = document.createElement('div');
    meta.className = 'imeta';
    meta.textContent = [item.mediaType.toUpperCase(), item.quality].filter(Boolean).join(' · ');
    const acts = document.createElement('div');
    acts.className = 'iactions';

    const dl = document.createElement('button');
    dl.className = 'btn dl';
    dl.innerHTML = `${ICON_DL}<span>Download</span>`;
    dl.addEventListener('click', () => {
      void send({ type: 'START_DOWNLOAD', candidateId: item.id });
      dl.querySelector('span')!.textContent = 'Started';
      setTimeout(() => (dl.querySelector('span')!.textContent = 'Download'), 1500);
    });

    const copy = document.createElement('button');
    copy.className = 'btn sec';
    copy.innerHTML = `${ICON_COPY}<span>Copy</span>`;
    copy.addEventListener('click', async () => {
      const res = await send({ type: 'COPY_URL', candidateId: item.id });
      if (res?.type === 'COPIED' && res.url) {
        await navigator.clipboard.writeText(res.url).catch(() => {});
        copy.querySelector('span')!.textContent = 'Copied';
        setTimeout(() => (copy.querySelector('span')!.textContent = 'Copy'), 1500);
      }
    });

    acts.append(dl, copy);
    el.append(name, meta, acts);
    panel.appendChild(el);
  }

  const pfoot = document.createElement('div');
  pfoot.className = 'pfoot';
  const openPopup = document.createElement('button');
  openPopup.className = 'link';
  openPopup.textContent = 'Open full panel';
  openPopup.addEventListener('click', () => void send({ type: 'OPEN_POPUP' }));
  const hide = document.createElement('button');
  hide.className = 'link muted';
  hide.textContent = 'Hide on this site';
  hide.addEventListener('click', () => {
    void send({ type: 'DISABLE_WIDGET_HERE', domain: location.hostname });
    removeWidget();
  });
  pfoot.append(openPopup, hide);
  panel.appendChild(pfoot);

  wrap.appendChild(panel);
}

export function updateWidget(summary: WidgetSummary): void {
  current = summary;
  if (!summary.enabled || summary.items.length === 0) {
    removeWidget();
    return;
  }
  render();
}

function removeWidget(): void {
  document.getElementById(HOST_ID)?.remove();
  shadow = null;
  open = false;
}

/** Only inject in the top frame. */
export function isTopFrame(): boolean {
  try {
    return window.top === window.self;
  } catch {
    return false;
  }
}
