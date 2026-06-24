import { describe, it, expect } from 'vitest';
import { detectHlsProtection, detectDashProtection, classifyPageSignals } from '@shared/drm-detector';

describe('detectHlsProtection', () => {
  it('clear playlist -> not protected', () => {
    const r = detectHlsProtection('#EXTM3U\n#EXTINF:6,\nseg0.ts');
    expect(r.isEncryptedLikely).toBe(false);
    expect(r.isDrmLikely).toBe(false);
  });
  it('AES-128 -> encrypted', () => {
    const r = detectHlsProtection('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="k"\n#EXTINF:6,\ns.ts');
    expect(r.isEncryptedLikely).toBe(true);
  });
  it('SAMPLE-AES / FairPlay -> DRM', () => {
    const r = detectHlsProtection('#EXT-X-KEY:METHOD=SAMPLE-AES,KEYFORMAT="com.apple.streamingkeydelivery"');
    expect(r.isDrmLikely).toBe(true);
  });
  it('METHOD=NONE -> not encrypted', () => {
    expect(detectHlsProtection('#EXT-X-KEY:METHOD=NONE').isEncryptedLikely).toBe(false);
  });
});

describe('detectDashProtection', () => {
  it('clear MPD -> not protected', () => {
    expect(detectDashProtection('<MPD><Period></Period></MPD>').isDrmLikely).toBe(false);
  });
  it('ContentProtection -> protected', () => {
    const r = detectDashProtection('<MPD><ContentProtection schemeIdUri="x"/></MPD>');
    expect(r.isDrmLikely).toBe(true);
  });
  it('Widevine UUID -> Widevine scheme', () => {
    const r = detectDashProtection('<ContentProtection schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed"/>');
    expect(r.scheme).toBe('Widevine');
  });
});

describe('classifyPageSignals', () => {
  it('EME usage -> DRM likely', () => {
    const r = classifyPageSignals({ usesEme: true, usesMediaSource: true, hasBlobMedia: true });
    expect(r.isDrmLikely).toBe(true);
  });
  it('MSE/blob alone -> not DRM (no direct source)', () => {
    const r = classifyPageSignals({ usesEme: false, usesMediaSource: true, hasBlobMedia: true });
    expect(r.isDrmLikely).toBe(false);
  });
  it('nothing -> clear', () => {
    const r = classifyPageSignals({ usesEme: false, usesMediaSource: false, hasBlobMedia: false });
    expect(r.isDrmLikely).toBe(false);
    expect(r.isEncryptedLikely).toBe(false);
  });
});
