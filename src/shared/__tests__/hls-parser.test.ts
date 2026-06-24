import { describe, it, expect } from 'vitest';
import { parseHls, parseHlsMediaPlaylist } from '@shared/hls-parser';

const MASTER = `#EXTM3U
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",LANGUAGE="en",URI="sub/en.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720,CODECS="avc1.64001f,mp4a.40.2"
720p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=700000,RESOLUTION=640x360
360p/index.m3u8`;

const MEDIA_TS = `#EXTM3U
#EXT-X-TARGETDURATION:6
#EXTINF:6.0,
seg0.ts
#EXTINF:6.0,
seg1.ts
#EXT-X-ENDLIST`;

const MEDIA_FMP4 = `#EXTM3U
#EXT-X-MAP:URI="init.mp4"
#EXTINF:4.0,
seg0.m4s
#EXT-X-ENDLIST`;

const ENCRYPTED = `#EXTM3U
#EXT-X-KEY:METHOD=AES-128,URI="key.bin"
#EXTINF:6.0,
seg0.ts`;

describe('parseHls master', () => {
  it('returns variants sorted info with resolution + codecs', () => {
    const r = parseHls(MASTER, 'https://c.com/master.m3u8');
    expect(r.isMaster).toBe(true);
    if (!r.isMaster) return;
    expect(r.variants).toHaveLength(2);
    const v720 = r.variants.find((v) => v.height === 720)!;
    expect(v720.bandwidth).toBe(3000000);
    expect(v720.playlistUrl).toBe('https://c.com/720p/index.m3u8');
    expect(r.subtitles).toHaveLength(1);
    expect(r.subtitles[0]!.url).toBe('https://c.com/sub/en.m3u8');
  });
});

describe('parseHls media playlist', () => {
  it('counts segments and duration', () => {
    const r = parseHls(MEDIA_TS, 'https://c.com/x.m3u8');
    expect(r.isMaster).toBe(false);
    if (r.isMaster) return;
    expect(r.segmentCount).toBe(2);
    expect(r.estimatedDurationSeconds).toBe(12);
  });
});

describe('parseHlsMediaPlaylist', () => {
  it('resolves TS segment URLs', () => {
    const m = parseHlsMediaPlaylist(MEDIA_TS, 'https://c.com/hls/x.m3u8');
    expect(m.segments).toEqual(['https://c.com/hls/seg0.ts', 'https://c.com/hls/seg1.ts']);
    expect(m.isFmp4).toBe(false);
    expect(m.protection.isEncryptedLikely).toBe(false);
  });
  it('detects fMP4 + init segment', () => {
    const m = parseHlsMediaPlaylist(MEDIA_FMP4, 'https://c.com/hls/x.m3u8');
    expect(m.isFmp4).toBe(true);
    expect(m.initSegmentUrl).toBe('https://c.com/hls/init.mp4');
  });
  it('flags encryption', () => {
    const m = parseHlsMediaPlaylist(ENCRYPTED, 'https://c.com/x.m3u8');
    expect(m.protection.isEncryptedLikely).toBe(true);
  });
});
