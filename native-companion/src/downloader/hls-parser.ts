// Minimal HLS parser for the native segment engine (standalone — the companion
// can't import the extension's shared package). Detects encryption/DRM and
// refuses to handle it (no decryption, ever).

function resolve(base: string, rel: string): string {
  try {
    return new URL(rel, base).href;
  } catch {
    return rel;
  }
}

function attrs(line: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([A-Z0-9-]+)=("([^"]*)"|[^,]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) out[m[1]!] = m[3] !== undefined ? m[3] : m[2]!;
  return out;
}

export function isMaster(text: string): boolean {
  return text.includes('#EXT-X-STREAM-INF');
}

export interface MasterVariant {
  bandwidth: number;
  height?: number;
  playlistUrl: string;
}

export function parseMaster(text: string, url: string): MasterVariant[] {
  const lines = text.split(/\r?\n/);
  const variants: MasterVariant[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]!.startsWith('#EXT-X-STREAM-INF')) continue;
    const a = attrs(lines[i]!);
    const next = lines[i + 1]?.trim();
    if (!next || next.startsWith('#')) continue;
    const res = a.RESOLUTION?.split('x');
    variants.push({
      bandwidth: a.BANDWIDTH ? parseInt(a.BANDWIDTH, 10) : 0,
      height: res && res[1] ? parseInt(res[1], 10) : undefined,
      playlistUrl: resolve(url, next),
    });
  }
  return variants;
}

export interface MediaPlaylist {
  segments: string[];
  initSegmentUrl?: string;
  isFmp4: boolean;
  encrypted: boolean;
  encryptionReason?: string;
}

export function parseMedia(text: string, url: string): MediaPlaylist {
  const lines = text.split(/\r?\n/);
  const segments: string[] = [];
  let initSegmentUrl: string | undefined;
  let encrypted = false;
  let encryptionReason: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line.startsWith('#EXT-X-KEY')) {
      const a = attrs(line);
      const method = (a.METHOD ?? '').toUpperCase();
      if (method && method !== 'NONE') {
        encrypted = true;
        encryptionReason = `Encrypted stream (METHOD=${method})`;
      }
    } else if (line.startsWith('#EXT-X-MAP')) {
      const a = attrs(line);
      if (a.URI) initSegmentUrl = resolve(url, a.URI);
    } else if (line.startsWith('#EXTINF')) {
      const next = lines[i + 1]?.trim();
      if (next && !next.startsWith('#')) segments.push(resolve(url, next));
    }
  }

  const isFmp4 = !!initSegmentUrl || segments.some((s) => /\.(m4s|mp4|cmf[va])(\?|$)/i.test(s));
  return { segments, initSegmentUrl, isFmp4, encrypted, encryptionReason };
}

export function pickBest(variants: MasterVariant[]): MasterVariant | undefined {
  return variants.slice().sort((a, b) => (b.height ?? 0) - (a.height ?? 0) || b.bandwidth - a.bandwidth)[0];
}
