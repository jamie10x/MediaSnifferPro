// URL helpers: extension extraction, domain parsing, and dedup keys that
// deliberately preserve signed query parameters (collapsing them would break
// time-limited CDN URLs).

import { SIGNING_PARAM_HINTS } from './constants';

export function safeParseUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

export function getDomain(raw: string): string {
  const u = safeParseUrl(raw);
  return u ? u.hostname : '';
}

export function isBlobOrData(raw: string): boolean {
  return raw.startsWith('blob:') || raw.startsWith('data:');
}

/** Lowercase extension without the dot, or '' if none / not URL-like. */
export function getExtension(raw: string): string {
  if (isBlobOrData(raw)) return '';
  const u = safeParseUrl(raw);
  const path = u ? u.pathname : raw.split('?')[0]!.split('#')[0]!;
  const last = path.split('/').pop() ?? '';
  const dot = last.lastIndexOf('.');
  if (dot < 0) return '';
  return last.slice(dot + 1).toLowerCase();
}

export function getFilenameFromUrl(raw: string): string | undefined {
  const u = safeParseUrl(raw);
  const path = u ? u.pathname : raw.split('?')[0]!;
  const last = decodeURIComponent(path.split('/').pop() ?? '');
  return last || undefined;
}

function isSigningParam(name: string): boolean {
  const lower = name.toLowerCase();
  return SIGNING_PARAM_HINTS.some((hint) =>
    hint.endsWith('-') ? lower.startsWith(hint) : lower === hint,
  );
}

/**
 * Dedup key: origin + path + only the signing-relevant query params.
 * Two URLs that differ only by tracking params collapse together, but URLs that
 * differ by a signature/token remain distinct so each stays downloadable.
 */
export function canonicalKey(raw: string): string {
  if (isBlobOrData(raw)) return raw;
  const u = safeParseUrl(raw);
  if (!u) return raw;
  const signing = [...u.searchParams.entries()]
    .filter(([k]) => isSigningParam(k))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  const base = `${u.origin}${u.pathname}`;
  return signing ? `${base}?${signing}` : base;
}

/** Resolve a possibly-relative URL against a base (manifest segment resolution). */
export function resolveUrl(base: string, relative: string): string {
  try {
    return new URL(relative, base).href;
  } catch {
    return relative;
  }
}

export function matchesDomainList(url: string, list: string[]): boolean {
  if (list.length === 0) return false;
  const domain = getDomain(url);
  return list.some((entry) => {
    const e = entry.trim().toLowerCase();
    if (!e) return false;
    return domain === e || domain.endsWith(`.${e}`);
  });
}
