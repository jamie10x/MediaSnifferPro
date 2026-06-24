import { describe, it, expect } from 'vitest';
import { canonicalKey, getExtension, getDomain, isBlobOrData, resolveUrl, matchesDomainList, getFilenameFromUrl } from '@shared/url-utils';

describe('getExtension', () => {
  it('strips query and hash', () => {
    expect(getExtension('https://x.com/a/b/video.mp4?token=1#t')).toBe('mp4');
  });
  it('lowercases', () => expect(getExtension('https://x.com/V.M3U8')).toBe('m3u8'));
  it('returns empty for blob/data and extensionless', () => {
    expect(getExtension('blob:https://x.com/abc')).toBe('');
    expect(getExtension('https://x.com/play')).toBe('');
  });
});

describe('canonicalKey', () => {
  it('collapses tracking params but keeps origin+path', () => {
    const a = canonicalKey('https://cdn.com/v.mp4?utm_source=x&_=123');
    const b = canonicalKey('https://cdn.com/v.mp4?utm_source=y');
    expect(a).toBe(b);
    expect(a).toBe('https://cdn.com/v.mp4');
  });
  it('preserves signed/token params so signed URLs stay distinct', () => {
    const a = canonicalKey('https://cdn.com/v.mp4?token=AAA&expires=1');
    const b = canonicalKey('https://cdn.com/v.mp4?token=BBB&expires=2');
    expect(a).not.toBe(b);
    expect(a).toContain('token=AAA');
  });
  it('matches X-Amz-* signing prefixes', () => {
    const a = canonicalKey('https://s3.com/v.mp4?X-Amz-Signature=AAA');
    const b = canonicalKey('https://s3.com/v.mp4?X-Amz-Signature=BBB');
    expect(a).not.toBe(b);
  });
  it('leaves blob/data URLs as-is', () => {
    expect(canonicalKey('blob:https://x.com/abc')).toBe('blob:https://x.com/abc');
  });
});

describe('getDomain / isBlobOrData / resolveUrl / getFilenameFromUrl', () => {
  it('getDomain', () => expect(getDomain('https://www.a.b.com/x')).toBe('www.a.b.com'));
  it('isBlobOrData', () => {
    expect(isBlobOrData('blob:https://x')).toBe(true);
    expect(isBlobOrData('data:video/mp4;base64,AA')).toBe(true);
    expect(isBlobOrData('https://x')).toBe(false);
  });
  it('resolveUrl handles relative segments', () => {
    expect(resolveUrl('https://c.com/hls/master.m3u8', 'seg0.ts')).toBe('https://c.com/hls/seg0.ts');
    expect(resolveUrl('https://c.com/hls/master.m3u8', '/v/seg.ts')).toBe('https://c.com/v/seg.ts');
  });
  it('getFilenameFromUrl decodes', () => {
    expect(getFilenameFromUrl('https://x.com/a/My%20File.mp4?q=1')).toBe('My File.mp4');
  });
});

describe('matchesDomainList', () => {
  it('matches exact and subdomains', () => {
    expect(matchesDomainList('https://a.example.com/x', ['example.com'])).toBe(true);
    expect(matchesDomainList('https://example.com/x', ['example.com'])).toBe(true);
    expect(matchesDomainList('https://evil.com/x', ['example.com'])).toBe(false);
  });
  it('empty list never matches', () => {
    expect(matchesDomainList('https://example.com', [])).toBe(false);
  });
});
