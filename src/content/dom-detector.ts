// DOM-based media detection: media elements, sources, links, posters, and page
// metadata (JSON-LD, Open Graph, Twitter cards).

import type { RawCandidate } from '@shared/message-types';
import { VIDEO_EXTENSIONS, AUDIO_EXTENSIONS, SUBTITLE_EXTENSIONS } from '@shared/constants';
import { getExtension } from '@shared/url-utils';

function isHttpLike(url: string): boolean {
  return /^https?:\/\//i.test(url) || url.startsWith('blob:');
}

function push(out: RawCandidate[], url: string | null | undefined, extra: Partial<RawCandidate> = {}): void {
  if (!url) return;
  const abs = toAbsolute(url);
  if (!abs || !isHttpLike(abs)) return;
  out.push({ url: abs, source: 'dom', pageTitle: document.title, ...extra });
}

function toAbsolute(url: string): string | null {
  try {
    return new URL(url, location.href).href;
  } catch {
    return null;
  }
}

function looksLikeMediaUrl(url: string): boolean {
  const ext = getExtension(url);
  return (
    VIDEO_EXTENSIONS.has(ext) ||
    AUDIO_EXTENSIONS.has(ext) ||
    SUBTITLE_EXTENSIONS.has(ext) ||
    ext === 'm3u8' ||
    ext === 'mpd'
  );
}

export function detectFromRoot(root: ParentNode): RawCandidate[] {
  const out: RawCandidate[] = [];

  root.querySelectorAll('video').forEach((el) => {
    const v = el as HTMLVideoElement;
    push(out, v.currentSrc || v.src, {
      width: v.videoWidth || undefined,
      height: v.videoHeight || undefined,
      durationSeconds: Number.isFinite(v.duration) ? v.duration : undefined,
      isBlob: (v.currentSrc || v.src).startsWith('blob:'),
    });
    if (v.poster) push(out, v.poster);
  });

  root.querySelectorAll('audio').forEach((el) => {
    const a = el as HTMLAudioElement;
    push(out, a.currentSrc || a.src, {
      durationSeconds: Number.isFinite(a.duration) ? a.duration : undefined,
      isBlob: (a.currentSrc || a.src).startsWith('blob:'),
    });
  });

  root.querySelectorAll('source').forEach((el) => {
    const s = el as HTMLSourceElement;
    push(out, s.src, { contentType: s.type || undefined });
  });

  root.querySelectorAll('track').forEach((el) => {
    const t = el as HTMLTrackElement;
    push(out, t.src);
  });

  root.querySelectorAll('a[href]').forEach((el) => {
    const href = (el as HTMLAnchorElement).href;
    if (looksLikeMediaUrl(href)) push(out, href);
  });

  // data-* attributes that hold media URLs (common in custom players).
  root.querySelectorAll<HTMLElement>('[data-src],[data-video],[data-video-src],[data-mp4],[data-hls]').forEach((el) => {
    for (const attr of ['data-src', 'data-video', 'data-video-src', 'data-mp4', 'data-hls']) {
      const val = el.getAttribute(attr);
      if (val && looksLikeMediaUrl(val)) push(out, val);
    }
  });

  return out;
}

/** Best representative image for the page (poster/preview), if any. */
export function detectPageThumbnail(): string | undefined {
  const metaSelectors = [
    'meta[property="og:image"]',
    'meta[property="og:image:secure_url"]',
    'meta[name="twitter:image"]',
    'meta[name="twitter:image:src"]',
    'meta[itemprop="image"]',
  ];
  for (const sel of metaSelectors) {
    const el = document.querySelector<HTMLMetaElement>(sel);
    if (el?.content) {
      const abs = toAbsolute(el.content);
      if (abs && isHttpLike(abs)) return abs;
    }
  }
  // Fall back to a same-origin <video poster>.
  for (const v of Array.from(document.querySelectorAll<HTMLVideoElement>('video'))) {
    if (v.poster) {
      const abs = toAbsolute(v.poster);
      if (abs && isHttpLike(abs)) return abs;
    }
  }
  return undefined;
}

export function detectMetadata(): RawCandidate[] {
  const out: RawCandidate[] = [];

  const ogVideo = document.querySelector<HTMLMetaElement>('meta[property="og:video"], meta[property="og:video:url"], meta[property="og:video:secure_url"]');
  if (ogVideo?.content) out.push({ url: absolute(ogVideo.content), source: 'metadata', pageTitle: document.title });

  const twitter = document.querySelector<HTMLMetaElement>('meta[name="twitter:player:stream"]');
  if (twitter?.content) out.push({ url: absolute(twitter.content), source: 'metadata', pageTitle: document.title });

  document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]').forEach((script) => {
    try {
      const data = JSON.parse(script.textContent ?? 'null');
      collectJsonLdVideo(data, out);
    } catch {
      /* ignore malformed JSON-LD */
    }
  });

  return out.filter((c) => c.url && isHttpLike(c.url));
}

function absolute(url: string): string {
  return toAbsolute(url) ?? url;
}

function collectJsonLdVideo(node: unknown, out: RawCandidate[]): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((n) => collectJsonLdVideo(n, out));
    return;
  }
  const obj = node as Record<string, unknown>;
  const type = obj['@type'];
  if (type === 'VideoObject') {
    const url = (obj.contentUrl as string) || (obj.embedUrl as string);
    if (typeof url === 'string') {
      out.push({ url: absolute(url), source: 'metadata', pageTitle: document.title });
    }
  }
  Object.values(obj).forEach((v) => {
    if (v && typeof v === 'object') collectJsonLdVideo(v, out);
  });
}
