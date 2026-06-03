// Minimal DASH MPD parser.
//
// MV3 service workers have no DOM, so DOMParser is unavailable. We use a focused
// regex/string scan instead — enough to list video/audio Representations and to
// detect ContentProtection. Protected manifests are flagged, never decrypted.

import type { StreamVariant, VariantSupportStatus } from './types';
import { detectDashProtection } from './drm-detector';

let variantSeq = 0;
function nextId(): string {
  variantSeq += 1;
  return `dash-${Date.now().toString(36)}-${variantSeq}`;
}

export interface DashParseResult {
  variants: StreamVariant[];
  protection: ReturnType<typeof detectDashProtection>;
}

function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`${name}="([^"]*)"`, 'i').exec(tag);
  return m ? m[1] : undefined;
}

function num(tag: string, name: string): number | undefined {
  const v = attr(tag, name);
  if (v === undefined) return undefined;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : undefined;
}

function supportFor(protection: ReturnType<typeof detectDashProtection>): VariantSupportStatus {
  if (protection.isDrmLikely) return 'unsupported_drm';
  if (protection.isEncryptedLikely) return 'unsupported_encrypted';
  return 'requires_native';
}

export function parseDash(text: string, manifestUrl: string): DashParseResult {
  const protection = detectDashProtection(text);
  const support = supportFor(protection);
  const variants: StreamVariant[] = [];

  // Split into AdaptationSet blocks to inherit contentType / mimeType context.
  const adaptationRe = /<AdaptationSet\b([^>]*)>([\s\S]*?)<\/AdaptationSet>/gi;
  let aMatch: RegExpExecArray | null;
  while ((aMatch = adaptationRe.exec(text)) !== null) {
    const adaptTag = aMatch[1]!;
    const inner = aMatch[2]!;
    const mime = attr(adaptTag, 'mimeType') ?? '';
    const contentType = attr(adaptTag, 'contentType') ?? '';
    const isVideo = mime.startsWith('video') || contentType === 'video';
    const isAudio = mime.startsWith('audio') || contentType === 'audio';
    if (!isVideo && !isAudio) continue;

    const repRe = /<Representation\b([^>]*)\/?>/gi;
    let rMatch: RegExpExecArray | null;
    while ((rMatch = repRe.exec(inner)) !== null) {
      const repTag = rMatch[1]!;
      variants.push({
        id: nextId(),
        manifestUrl,
        mediaType: 'dash',
        bandwidth: num(repTag, 'bandwidth'),
        width: num(repTag, 'width'),
        height: num(repTag, 'height'),
        frameRate: parseFrameRate(attr(repTag, 'frameRate')),
        codecs: attr(repTag, 'codecs') ?? attr(adaptTag, 'codecs'),
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

  return { variants, protection };
}

function parseFrameRate(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  if (raw.includes('/')) {
    const [n, d] = raw.split('/').map((x) => parseFloat(x));
    if (n && d) return Math.round((n / d) * 1000) / 1000;
    return undefined;
  }
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : undefined;
}
