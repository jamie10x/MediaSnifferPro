// Minimal HLS playlist parser. Parses master playlists into StreamVariant[] and
// media playlists into a segment summary. Encrypted/DRM playlists are flagged so
// the caller can mark them unsupported — we never attempt to decrypt.

import type { StreamVariant, SubtitleTrack, VariantSupportStatus } from './types';
import { resolveUrl } from './url-utils';
import { detectHlsProtection } from './drm-detector';

let variantSeq = 0;
function nextId(): string {
  variantSeq += 1;
  return `hls-${Date.now().toString(36)}-${variantSeq}`;
}

export interface HlsMaster {
  isMaster: true;
  variants: StreamVariant[];
  subtitles: SubtitleTrack[];
}

export interface HlsMedia {
  isMaster: false;
  segmentCount: number;
  estimatedDurationSeconds: number;
  hasInitSegment: boolean;
  protection: ReturnType<typeof detectHlsProtection>;
}

export type HlsParseResult = HlsMaster | HlsMedia;

function parseAttributes(line: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  // Match KEY=VALUE or KEY="quoted value" pairs.
  const re = /([A-Z0-9-]+)=("([^"]*)"|[^,]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    attrs[m[1]!] = m[3] !== undefined ? m[3] : m[2]!;
  }
  return attrs;
}

function resolutionToWh(res?: string): { width?: number; height?: number } {
  if (!res) return {};
  const [w, h] = res.split('x').map((n) => parseInt(n, 10));
  return { width: Number.isFinite(w) ? w : undefined, height: Number.isFinite(h) ? h : undefined };
}

function supportFor(protection: ReturnType<typeof detectHlsProtection>): VariantSupportStatus {
  if (protection.isDrmLikely) return 'unsupported_drm';
  if (protection.isEncryptedLikely) return 'unsupported_encrypted';
  return 'requires_native';
}

export interface HlsMediaPlaylist {
  segments: string[]; // absolute segment URLs in order
  initSegmentUrl?: string; // EXT-X-MAP (fMP4)
  isFmp4: boolean;
  totalDurationSeconds: number;
  protection: ReturnType<typeof detectHlsProtection>;
}

/** Extract ordered segment URLs from a media playlist (used by the downloader). */
export function parseHlsMediaPlaylist(text: string, playlistUrl: string): HlsMediaPlaylist {
  const lines = text.split(/\r?\n/);
  const segments: string[] = [];
  let initSegmentUrl: string | undefined;
  let totalDurationSeconds = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line.startsWith('#EXT-X-MAP')) {
      const a = parseAttributes(line);
      if (a.URI) initSegmentUrl = resolveUrl(playlistUrl, a.URI);
      continue;
    }
    if (line.startsWith('#EXTINF:')) {
      const d = parseFloat(line.slice('#EXTINF:'.length));
      if (Number.isFinite(d)) totalDurationSeconds += d;
      // The next non-comment line is the segment URI.
      const next = lines[i + 1]?.trim();
      if (next && !next.startsWith('#')) segments.push(resolveUrl(playlistUrl, next));
    }
  }

  const isFmp4 = !!initSegmentUrl || segments.some((s) => /\.(m4s|mp4|cmf[va])(\?|$)/i.test(s));
  return {
    segments,
    initSegmentUrl,
    isFmp4,
    totalDurationSeconds: Math.round(totalDurationSeconds),
    protection: detectHlsProtection(text),
  };
}

export function parseHls(text: string, manifestUrl: string): HlsParseResult {
  if (!text.includes('#EXTM3U')) {
    // Not a valid playlist; treat as an empty media playlist.
    return { isMaster: false, segmentCount: 0, estimatedDurationSeconds: 0, hasInitSegment: false, protection: detectHlsProtection(text) };
  }

  const lines = text.split(/\r?\n/);
  const isMaster = lines.some((l) => l.startsWith('#EXT-X-STREAM-INF'));
  const protection = detectHlsProtection(text);

  if (!isMaster) {
    let segmentCount = 0;
    let duration = 0;
    for (const line of lines) {
      if (line.startsWith('#EXTINF:')) {
        segmentCount += 1;
        const d = parseFloat(line.slice('#EXTINF:'.length));
        if (Number.isFinite(d)) duration += d;
      }
    }
    return {
      isMaster: false,
      segmentCount,
      estimatedDurationSeconds: Math.round(duration),
      hasInitSegment: text.includes('#EXT-X-MAP'),
      protection,
    };
  }

  const variants: StreamVariant[] = [];
  const subtitles: SubtitleTrack[] = [];
  const support = supportFor(protection);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.startsWith('#EXT-X-MEDIA')) {
      const a = parseAttributes(line);
      if (a.TYPE === 'SUBTITLES' && a.URI) {
        subtitles.push({
          url: resolveUrl(manifestUrl, a.URI),
          language: a.LANGUAGE,
          label: a.NAME,
        });
      }
      continue;
    }
    if (line.startsWith('#EXT-X-STREAM-INF')) {
      const a = parseAttributes(line);
      const playlistLine = lines[i + 1]?.trim();
      const { width, height } = resolutionToWh(a.RESOLUTION);
      variants.push({
        id: nextId(),
        manifestUrl,
        mediaType: 'hls',
        bandwidth: a.BANDWIDTH ? parseInt(a.BANDWIDTH, 10) : undefined,
        averageBandwidth: a['AVERAGE-BANDWIDTH'] ? parseInt(a['AVERAGE-BANDWIDTH'], 10) : undefined,
        width,
        height,
        frameRate: a['FRAME-RATE'] ? parseFloat(a['FRAME-RATE']) : undefined,
        codecs: a.CODECS,
        audioGroupId: a.AUDIO,
        subtitleGroupId: a.SUBTITLES,
        playlistUrl: playlistLine && !playlistLine.startsWith('#') ? resolveUrl(manifestUrl, playlistLine) : undefined,
        protection: {
          hasDrm: protection.isDrmLikely,
          hasEncryption: protection.isEncryptedLikely,
          scheme: protection.scheme,
          reason: protection.reason,
        },
        supportStatus: support,
      });
    }
  }

  return { isMaster: true, variants, subtitles };
}
