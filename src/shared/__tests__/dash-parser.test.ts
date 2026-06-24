import { describe, it, expect } from 'vitest';
import { parseDash } from '@shared/dash-parser';

const CLEAR_MPD = `<?xml version="1.0"?>
<MPD>
  <Period>
    <AdaptationSet mimeType="video/mp4">
      <Representation id="v1" bandwidth="3000000" width="1280" height="720" codecs="avc1.64001f"/>
      <Representation id="v2" bandwidth="700000" width="640" height="360"/>
    </AdaptationSet>
    <AdaptationSet mimeType="audio/mp4">
      <Representation id="a1" bandwidth="128000" codecs="mp4a.40.2"/>
    </AdaptationSet>
  </Period>
</MPD>`;

const DRM_MPD = `<MPD><Period><AdaptationSet mimeType="video/mp4">
  <ContentProtection schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed"/>
  <Representation id="v1" bandwidth="3000000" width="1920" height="1080"/>
</AdaptationSet></Period></MPD>`;

describe('parseDash', () => {
  it('parses video + audio representations', () => {
    const r = parseDash(CLEAR_MPD, 'https://c.com/m.mpd');
    expect(r.protection.isDrmLikely).toBe(false);
    expect(r.variants.length).toBe(3);
    const v = r.variants.find((x) => x.height === 720)!;
    expect(v.bandwidth).toBe(3000000);
    expect(v.codecs).toBe('avc1.64001f');
  });
  it('flags ContentProtection / Widevine', () => {
    const r = parseDash(DRM_MPD, 'https://c.com/m.mpd');
    expect(r.protection.isDrmLikely).toBe(true);
    expect(r.variants[0]!.protection.hasDrm).toBe(true);
  });
});
