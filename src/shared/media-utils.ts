// Classification: turn a URL + optional content-type into a MediaType and an
// initial SupportStatus. DRM/encryption signals override everything else.

import {
  AUDIO_EXTENSIONS,
  CONTENT_TYPE_HINTS,
  DASH_EXTENSIONS,
  HLS_EXTENSIONS,
  SEGMENT_CONTENT_TYPES,
  SEGMENT_EXTENSIONS,
  SUBTITLE_EXTENSIONS,
  THUMBNAIL_EXTENSIONS,
  VIDEO_EXTENSIONS,
} from './constants';
import type { MediaType, SupportStatus } from './types';
import { getExtension, isBlobOrData } from './url-utils';

export interface Classification {
  mediaType: MediaType;
  isSegment: boolean;
  isManifest: boolean;
}

function matchContentType(contentType: string | undefined, hints: readonly string[]): boolean {
  if (!contentType) return false;
  const ct = contentType.toLowerCase();
  return hints.some((h) => ct.includes(h));
}

// Content-Type is authoritative: CDNs frequently serve an HLS playlist from a
// `.mpd`-looking URL, or a TS segment from a generic name. Trust the server's
// declared type first, and only fall back to the file extension when there is no
// (or a useless) Content-Type.
export function classifyMedia(url: string, contentType?: string): Classification {
  const ext = getExtension(url);
  const ct = contentType?.toLowerCase().split(';')[0]?.trim();
  const ctUseful = !!ct && ct !== 'application/octet-stream' && ct !== 'binary/octet-stream';

  // 1) Decide by Content-Type when it tells us something concrete.
  if (ctUseful) {
    if (SEGMENT_CONTENT_TYPES.includes(ct!)) return { mediaType: 'unknown', isSegment: true, isManifest: false };
    if (matchContentType(ct, CONTENT_TYPE_HINTS.hls)) return { mediaType: 'hls', isSegment: false, isManifest: true };
    if (matchContentType(ct, CONTENT_TYPE_HINTS.dash)) return { mediaType: 'dash', isSegment: false, isManifest: true };
    if (matchContentType(ct, CONTENT_TYPE_HINTS.subtitle)) return { mediaType: 'subtitle', isSegment: false, isManifest: false };
    if (matchContentType(ct, CONTENT_TYPE_HINTS.video)) return { mediaType: 'video', isSegment: false, isManifest: false };
    if (matchContentType(ct, CONTENT_TYPE_HINTS.audio)) return { mediaType: 'audio', isSegment: false, isManifest: false };
  }

  // 2) Fall back to the file extension.
  if (HLS_EXTENSIONS.has(ext)) return { mediaType: 'hls', isSegment: false, isManifest: true };
  if (DASH_EXTENSIONS.has(ext)) return { mediaType: 'dash', isSegment: false, isManifest: true };
  if (SEGMENT_EXTENSIONS.has(ext)) return { mediaType: 'unknown', isSegment: true, isManifest: false };
  if (SUBTITLE_EXTENSIONS.has(ext)) return { mediaType: 'subtitle', isSegment: false, isManifest: false };
  if (VIDEO_EXTENSIONS.has(ext)) return { mediaType: 'video', isSegment: false, isManifest: false };
  if (AUDIO_EXTENSIONS.has(ext)) return { mediaType: 'audio', isSegment: false, isManifest: false };
  if (THUMBNAIL_EXTENSIONS.has(ext)) return { mediaType: 'thumbnail', isSegment: false, isManifest: false };
  return { mediaType: 'unknown', isSegment: false, isManifest: false };
}

/** Detect the real manifest type from the fetched body (most reliable signal). */
export function detectManifestType(body: string): 'hls' | 'dash' | null {
  const head = body.slice(0, 2000);
  if (head.includes('#EXTM3U')) return 'hls';
  if (/<MPD[\s>]/i.test(head)) return 'dash';
  return null;
}

export interface SupportInput {
  mediaType: MediaType;
  url: string;
  isDrmLikely: boolean;
  isEncryptedLikely: boolean;
  blockedByPolicy?: boolean;
}

export function decideSupportStatus(input: SupportInput): SupportStatus {
  if (input.blockedByPolicy) return 'blocked_by_policy';
  if (input.isDrmLikely) return 'protected_likely';

  if (isBlobOrData(input.url)) return 'copy_only';

  switch (input.mediaType) {
    case 'video':
    case 'audio':
    case 'subtitle':
    case 'thumbnail':
      return 'downloadable';
    case 'hls':
      // Clear HLS is now downloadable in-browser (offscreen + mux.js).
      return input.isEncryptedLikely ? 'unsupported' : 'downloadable';
    case 'dash':
      // DASH is detected this round but remux is deferred to the native helper.
      return input.isEncryptedLikely ? 'unsupported' : 'needs_native_companion';
    case 'unknown':
    default:
      return 'copy_only';
  }
}

/** True if a content-type / extension looks like media we care about at all. */
export function looksLikeMedia(url: string, contentType?: string): boolean {
  const c = classifyMedia(url, contentType);
  return c.mediaType !== 'unknown' || c.isManifest;
}
