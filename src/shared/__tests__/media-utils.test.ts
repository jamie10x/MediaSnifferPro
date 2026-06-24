import { describe, it, expect } from 'vitest';
import { classifyMedia, decideSupportStatus, detectManifestType, looksLikeMedia } from '@shared/media-utils';

describe('classifyMedia — Content-Type wins over extension', () => {
  it('HLS content-type on a .mpd URL is HLS', () => {
    expect(classifyMedia('https://x/a.mpd', 'application/vnd.apple.mpegurl').mediaType).toBe('hls');
  });
  it('TS segment by content-type is hidden', () => {
    const c = classifyMedia('https://x/chunk', 'video/mp2t');
    expect(c.isSegment).toBe(true);
  });
  it('octet-stream falls back to extension', () => {
    expect(classifyMedia('https://x/v.mp4', 'application/octet-stream').mediaType).toBe('video');
  });
});

describe('classifyMedia — by extension', () => {
  it.each([
    ['https://x/v.mp4', 'video'],
    ['https://x/a.mp3', 'audio'],
    ['https://x/s.vtt', 'subtitle'],
    ['https://x/m.m3u8', 'hls'],
    ['https://x/m.mpd', 'dash'],
    ['https://x/t.jpg', 'thumbnail'],
    ['https://x/seg.ts', 'unknown'], // segment
  ])('%s -> %s', (url, type) => {
    expect(classifyMedia(url).mediaType).toBe(type);
  });
  it('.ts is a segment', () => expect(classifyMedia('https://x/seg.ts').isSegment).toBe(true));
});

describe('classifyMedia — manifest mid-path / query', () => {
  it('detects m3u8 in a query param', () => {
    expect(classifyMedia('https://x/play?file=master.m3u8&t=1').mediaType).toBe('hls');
  });
  it('detects mpd mid-path', () => {
    expect(classifyMedia('https://x/manifest.mpd/Manifest').mediaType).toBe('dash');
  });
});

describe('decideSupportStatus', () => {
  const base = { url: 'https://x/m.m3u8', isDrmLikely: false, isEncryptedLikely: false };
  it('clear HLS is downloadable', () => expect(decideSupportStatus({ ...base, mediaType: 'hls' })).toBe('downloadable'));
  it('clear DASH needs native helper', () => expect(decideSupportStatus({ ...base, mediaType: 'dash' })).toBe('needs_native_companion'));
  it('DRM -> protected_likely', () => expect(decideSupportStatus({ ...base, mediaType: 'hls', isDrmLikely: true })).toBe('protected_likely'));
  it('encrypted stream -> unsupported', () => expect(decideSupportStatus({ ...base, mediaType: 'hls', isEncryptedLikely: true })).toBe('unsupported'));
  it('blob -> copy_only', () => expect(decideSupportStatus({ ...base, mediaType: 'unknown', url: 'blob:https://x/1' })).toBe('copy_only'));
  it('policy block wins', () => expect(decideSupportStatus({ ...base, mediaType: 'video', blockedByPolicy: true })).toBe('blocked_by_policy'));
  it('direct video downloadable', () => expect(decideSupportStatus({ ...base, mediaType: 'video', url: 'https://x/v.mp4' })).toBe('downloadable'));
});

describe('detectManifestType / looksLikeMedia', () => {
  it('detects HLS body', () => expect(detectManifestType('#EXTM3U\n#EXT-X-VERSION:3')).toBe('hls'));
  it('detects DASH body', () => expect(detectManifestType('<?xml version="1.0"?><MPD xmlns="...">')).toBe('dash'));
  it('returns null for junk', () => expect(detectManifestType('not a playlist')).toBeNull());
  it('looksLikeMedia', () => {
    expect(looksLikeMedia('https://x/v.mp4')).toBe(true);
    expect(looksLikeMedia('https://x/page.html')).toBe(false);
  });
});
