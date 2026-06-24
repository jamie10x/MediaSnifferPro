import { describe, it, expect } from 'vitest';
import { pickVariantId, resolveDownloadUrl, isBatchDownloadable } from '@shared/quality';
import type { MediaCandidate, StreamVariant } from '@shared/types';

function variant(id: string, height: number, bandwidth: number): StreamVariant {
  return {
    id,
    manifestUrl: 'https://c/m.m3u8',
    mediaType: 'hls',
    height,
    bandwidth,
    playlistUrl: `https://c/${id}.m3u8`,
    protection: { hasDrm: false, hasEncryption: false },
    supportStatus: 'requires_native',
  };
}

function candidate(extra: Partial<MediaCandidate> = {}): MediaCandidate {
  return {
    id: 'c1', tabId: 1, pageUrl: 'https://p', pageTitle: 'T', pageDomain: 'p', url: 'https://c/m.m3u8',
    canonicalKey: 'k', source: 'network', mediaType: 'hls', supportStatus: 'downloadable',
    isSegment: false, isBlob: false, isManifest: true, isEncryptedLikely: false, isDrmLikely: false,
    createdAt: 0, updatedAt: 0, ...extra,
  };
}

describe('pickVariantId', () => {
  const c = candidate({ variants: [variant('a', 720, 3e6), variant('b', 1080, 6e6), variant('c', 360, 7e5)] });
  it('highest picks 1080p', () => expect(pickVariantId(c, 'highest')).toBe('b'));
  it('lowest picks 360p', () => expect(pickVariantId(c, 'lowest')).toBe('c'));
  it('ask defaults to highest', () => expect(pickVariantId(c, 'ask')).toBe('b'));
  it('no variants -> undefined', () => expect(pickVariantId(candidate(), 'highest')).toBeUndefined());
});

describe('resolveDownloadUrl', () => {
  const c = candidate({ variants: [variant('a', 720, 3e6)] });
  it('uses variant playlistUrl when given', () => expect(resolveDownloadUrl(c, 'a')).toBe('https://c/a.m3u8'));
  it('falls back to candidate url', () => expect(resolveDownloadUrl(c)).toBe('https://c/m.m3u8'));
});

describe('isBatchDownloadable', () => {
  it('downloadable + needs_native are batchable', () => {
    expect(isBatchDownloadable(candidate({ supportStatus: 'downloadable' }))).toBe(true);
    expect(isBatchDownloadable(candidate({ supportStatus: 'needs_native_companion' }))).toBe(true);
  });
  it('protected / segment / copy_only are not', () => {
    expect(isBatchDownloadable(candidate({ supportStatus: 'protected_likely' }))).toBe(false);
    expect(isBatchDownloadable(candidate({ supportStatus: 'copy_only' }))).toBe(false);
    expect(isBatchDownloadable(candidate({ supportStatus: 'downloadable', isSegment: true }))).toBe(false);
  });
});
