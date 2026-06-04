// Fetches a single playlist/segment with the page's Referer/Origin/User-Agent,
// a per-request timeout, and bounded retries with backoff. 4xx (except 408/429)
// fail immediately — they won't get better on retry.

export interface FetchHeaders {
  referer?: string;
  origin?: string;
  userAgent?: string;
}

// Many CDNs throttle or block non-browser User-Agents (Node's default fetch UA
// gets ~0.18 MB/s vs ~1 MB/s+ for a browser UA on the same server). Always send a
// realistic UA, preferring the one captured from the page.
export const DEFAULT_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function toHeaders(h?: FetchHeaders): Record<string, string> {
  const out: Record<string, string> = { 'User-Agent': h?.userAgent || DEFAULT_UA };
  if (h?.referer) out['Referer'] = h.referer;
  if (h?.origin) out['Origin'] = h.origin;
  return out;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function fetchText(url: string, headers?: FetchHeaders): Promise<string> {
  const buf = await fetchBuffer(url, headers, 2, 15_000);
  return Buffer.from(buf).toString('utf8');
}

export async function fetchBuffer(
  url: string,
  headers: FetchHeaders | undefined,
  retries = 3,
  timeoutMs = 30_000,
): Promise<Uint8Array> {
  let lastErr: Error = new Error('unknown');
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { headers: toHeaders(headers), signal: ctrl.signal, redirect: 'follow' });
      clearTimeout(timer);
      if (!res.ok) {
        // Permanent client errors: don't retry (except 408/429).
        if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
          throw Object.assign(new Error(`HTTP ${res.status}`), { permanent: true, status: res.status });
        }
        throw new Error(`HTTP ${res.status}`);
      }
      return new Uint8Array(await res.arrayBuffer());
    } catch (err) {
      clearTimeout(timer);
      lastErr = err instanceof Error ? err : new Error('fetch failed');
      if ((lastErr as { permanent?: boolean }).permanent) throw lastErr;
      if (attempt < retries) await sleep(Math.min(4000, 400 * 2 ** attempt));
    }
  }
  throw lastErr;
}
