import { describe, it, expect } from 'vitest';
import { isMaster, hasSeparateAudioGroup, parseMaster, parseMedia, pickBest } from '../hls-parser';

const MASTER_MUXED = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720
720p/i.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=700000,RESOLUTION=640x360
360p/i.m3u8`;

const MASTER_SEPARATE_AUDIO = `#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="English",LANGUAGE="en",URI="a/en.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720,AUDIO="aud"
v/720.m3u8`;

const MEDIA = `#EXTM3U
#EXT-X-MAP:URI="init.mp4"
#EXTINF:4,
s0.m4s
#EXTINF:4,
s1.m4s
#EXT-X-ENDLIST`;

describe('isMaster / hasSeparateAudioGroup', () => {
  it('identifies masters', () => {
    expect(isMaster(MASTER_MUXED)).toBe(true);
    expect(isMaster(MEDIA)).toBe(false);
  });
  it('detects a separate audio group (would be silent via segment engine)', () => {
    expect(hasSeparateAudioGroup(MASTER_SEPARATE_AUDIO)).toBe(true);
    expect(hasSeparateAudioGroup(MASTER_MUXED)).toBe(false);
  });
});

describe('parseMaster / pickBest', () => {
  it('parses variants with resolved URLs', () => {
    const vs = parseMaster(MASTER_MUXED, 'https://c.com/master.m3u8');
    expect(vs).toHaveLength(2);
    expect(vs[0]!.playlistUrl).toBe('https://c.com/720p/i.m3u8');
    expect(pickBest(vs)!.height).toBe(720);
  });
});

describe('parseMedia', () => {
  it('resolves segments + init, flags fMP4', () => {
    const m = parseMedia(MEDIA, 'https://c.com/hls/x.m3u8');
    expect(m.segments).toEqual(['https://c.com/hls/s0.m4s', 'https://c.com/hls/s1.m4s']);
    expect(m.initSegmentUrl).toBe('https://c.com/hls/init.mp4');
    expect(m.isFmp4).toBe(true);
    expect(m.encrypted).toBe(false);
  });
  it('flags encryption', () => {
    const m = parseMedia('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="k"\n#EXTINF:4,\ns.ts', 'https://c.com/x.m3u8');
    expect(m.encrypted).toBe(true);
  });
});
