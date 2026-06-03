// Fetches an HLS/DASH manifest from the background context (where host
// permissions apply, avoiding page CORS) and parses it into variants. Encrypted
// or DRM-protected manifests are flagged unsupported — never decrypted.

import type { MediaCandidate, MediaType, StreamVariant } from '@shared/types';
import { parseHls } from '@shared/hls-parser';
import { parseDash } from '@shared/dash-parser';
import { detectManifestType } from '@shared/media-utils';
import { HLS_PROTECTED_MESSAGE, DASH_PROTECTED_MESSAGE } from '@shared/constants';
import { logger } from '@shared/logger';

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { credentials: 'omit', cache: 'no-store' });
    if (!res.ok) return null;
    return await res.text();
  } catch (err) {
    logger.debug('manifest fetch failed', err);
    return null;
  }
}

export async function parseManifestForCandidate(
  candidate: MediaCandidate,
): Promise<MediaCandidate | null> {
  if (candidate.mediaType !== 'hls' && candidate.mediaType !== 'dash') return null;

  const text = await fetchText(candidate.url);
  if (text == null) {
    return { ...candidate, unsupportedReason: 'Manifest could not be fetched.', updatedAt: Date.now() };
  }

  // Trust the fetched body over the guessed type (a `.mpd` URL can be HLS, etc.).
  const realType: MediaType = detectManifestType(text) ?? candidate.mediaType;
  const base: MediaCandidate = { ...candidate, mediaType: realType };

  if (realType === 'hls') {
    const result = parseHls(text, candidate.url);
    if (result.isMaster) {
      return applyVariants(base, result.variants, result.subtitles);
    }
    // Media playlist: encryption check only.
    if (result.protection.isDrmLikely || result.protection.isEncryptedLikely) {
      return markProtected(base, result.protection.reason ?? HLS_PROTECTED_MESSAGE);
    }
    return { ...base, supportStatus: 'downloadable', updatedAt: Date.now() };
  }

  // DASH
  const result = parseDash(text, candidate.url);
  if (result.protection.isDrmLikely || result.protection.isEncryptedLikely) {
    return markProtected(base, result.protection.reason ?? DASH_PROTECTED_MESSAGE);
  }
  return applyVariants(base, result.variants, undefined);
}

function applyVariants(
  candidate: MediaCandidate,
  variants: StreamVariant[],
  subtitles: MediaCandidate['subtitles'],
): MediaCandidate {
  const anyDrm = variants.some((v) => v.protection.hasDrm);
  const anyEncrypted = variants.some((v) => v.protection.hasEncryption);
  // Clear HLS is downloadable in-browser; clear DASH still needs the native helper.
  const clearStatus = candidate.mediaType === 'hls' ? 'downloadable' : 'needs_native_companion';
  const supportStatus = anyDrm ? 'protected_likely' : anyEncrypted ? 'unsupported' : clearStatus;
  return {
    ...candidate,
    variants,
    subtitles: subtitles ?? candidate.subtitles,
    supportStatus,
    isDrmLikely: anyDrm || candidate.isDrmLikely,
    isEncryptedLikely: anyEncrypted || candidate.isEncryptedLikely,
    unsupportedReason: anyDrm
      ? candidate.mediaType === 'hls'
        ? HLS_PROTECTED_MESSAGE
        : DASH_PROTECTED_MESSAGE
      : undefined,
    updatedAt: Date.now(),
  };
}

function markProtected(candidate: MediaCandidate, reason: string): MediaCandidate {
  return {
    ...candidate,
    supportStatus: 'protected_likely',
    isDrmLikely: true,
    isEncryptedLikely: true,
    unsupportedReason: reason,
    updatedAt: Date.now(),
  };
}
