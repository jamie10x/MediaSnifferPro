import { describe, it, expect } from 'vitest';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { sanitizeFilename, resolveOutputPath, assertNotProtected } from '../sanitizer';

describe('sanitizeFilename', () => {
  it('strips path components (no traversal)', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('a/b/c.mp4')).toBe('c.mp4');
  });
  it('replaces illegal characters', () => {
    expect(sanitizeFilename('a:b*c?.mp4')).toBe('a_b_c_.mp4');
  });
  it('falls back when empty', () => {
    expect(sanitizeFilename('')).toBe('media');
    expect(sanitizeFilename('...')).toBe('media');
  });
});

describe('resolveOutputPath — contained to home', () => {
  it('defaults under ~/Downloads/MediaSnifferPro', () => {
    const p = resolveOutputPath(undefined, 'v.mp4');
    expect(p).toBe(join(homedir(), 'Downloads', 'MediaSnifferPro', 'v.mp4'));
  });
  it('allows an absolute dir inside home', () => {
    const dir = join(homedir(), 'Movies');
    expect(resolveOutputPath(dir, 'v.mp4')).toBe(join(dir, 'v.mp4'));
  });
  it('rejects a dir outside home (no escape)', () => {
    expect(() => resolveOutputPath('/etc', 'v.mp4')).toThrow();
    expect(() => resolveOutputPath('/tmp/evil', 'v.mp4')).toThrow();
  });
  it('sanitizes the filename even with a valid dir', () => {
    const p = resolveOutputPath(join(homedir(), 'Movies'), '../../x.mp4');
    expect(p).toBe(join(homedir(), 'Movies', 'x.mp4'));
  });
});

describe('assertNotProtected', () => {
  it('throws on DRM/license indicators', () => {
    expect(() => assertNotProtected('https://x/widevine/license')).toThrow();
    expect(() => assertNotProtected('https://x/get?license_url=y')).toThrow();
    expect(() => assertNotProtected('https://x/playready/acquire')).toThrow();
  });
  it('passes clean URLs', () => {
    expect(() => assertNotProtected('https://c.com/master.m3u8')).not.toThrow();
  });
});
