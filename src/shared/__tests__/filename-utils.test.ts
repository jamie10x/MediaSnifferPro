import { describe, it, expect } from 'vitest';
import { sanitizeSegment, sanitizeRelativePath, expandTemplate, buildFilename, type TemplateContext } from '@shared/filename-utils';
import type { MediaCandidate } from '@shared/types';

describe('sanitizeSegment', () => {
  it('replaces illegal characters', () => {
    expect(sanitizeSegment('a/b:c*d?e"f')).toBe('a_b_c_d_e_f');
  });
  it('strips leading/trailing dots (no traversal)', () => {
    expect(sanitizeSegment('..')).toBe('media');
    expect(sanitizeSegment('...evil')).toBe('evil');
  });
  it('guards reserved windows names', () => {
    expect(sanitizeSegment('con')).toBe('_con');
  });
});

describe('sanitizeRelativePath', () => {
  it('drops .. and keeps safe segments', () => {
    expect(sanitizeRelativePath('a/../b/c')).toBe('a/b/c');
  });
  it('drops leading slash', () => {
    expect(sanitizeRelativePath('/etc/passwd')).toBe('etc/passwd');
  });
});

describe('expandTemplate', () => {
  const ctx: TemplateContext = {
    title: 'Daredevil S1E11', pageTitle: 'Daredevil S1E11', domain: 'streamzy.to',
    quality: '1080p', mediaType: 'hls', ext: 'mp4', date: '2026-06-05',
  };
  it('fills tokens', () => {
    expect(expandTemplate('{title}.{ext}', ctx)).toBe('Daredevil S1E11.mp4');
  });
  it('supports folder + date + quality', () => {
    expect(expandTemplate('{domain}/{date}-{title}-{quality}.{ext}', ctx)).toBe(
      'streamzy.to/2026-06-05-Daredevil S1E11-1080p.mp4',
    );
  });
  it('unknown tokens become empty', () => {
    expect(expandTemplate('{nope}{title}.{ext}', ctx)).toBe('Daredevil S1E11.mp4');
  });
});

describe('buildFilename', () => {
  const base: MediaCandidate = {
    id: 'c', tabId: 1, pageUrl: 'https://p', pageTitle: "Marvel's Daredevil - S1E11", pageDomain: 'streamzy.to',
    url: 'https://c/master.m3u8', canonicalKey: 'k', source: 'network', mediaType: 'hls',
    supportStatus: 'downloadable', isSegment: false, isBlob: false, isManifest: true,
    isEncryptedLikely: false, isDrmLikely: false, filename: 'master.m3u8', createdAt: 0, updatedAt: 0,
  };
  it('streams use the page title (not master.m3u8) and .mp4', () => {
    expect(buildFilename(base, '{title}.{ext}')).toBe("Marvel's Daredevil - S1E11.mp4");
  });
  it('direct files keep their filename base', () => {
    const direct = { ...base, mediaType: 'video' as const, url: 'https://c/clip.mp4', filename: 'clip.mp4' };
    expect(buildFilename(direct, '{title}.{ext}')).toBe('clip.mp4');
  });
});
