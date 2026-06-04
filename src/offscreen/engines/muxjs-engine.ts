// Extension engine: transmux clear MPEG-TS HLS segments into a single MP4 with
// mux.js. This is the DEFAULT path for simple clear HLS. Anything mux.js can't
// safely handle (fMP4, DASH, separate audio/video, broken timestamps) is routed
// to the native companion instead — see the router and stream-downloader.

import muxjs from 'mux.js';
import type { RemuxEngine, RemuxInput, RemuxResult } from './types';

function concat(buffers: Uint8Array[]): Uint8Array {
  const total = buffers.reduce((n, b) => n + b.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const b of buffers) {
    out.set(b, offset);
    offset += b.length;
  }
  return out;
}

function transmuxTs(segments: Uint8Array[]): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    try {
      const transmuxer = new muxjs.mp4.Transmuxer({ keepOriginalTimestamps: true });
      const out: Uint8Array[] = [];
      let wroteInit = false;

      transmuxer.on('data', (segment) => {
        if (!wroteInit) {
          out.push(segment.initSegment);
          wroteInit = true;
        }
        out.push(segment.data);
      });
      transmuxer.on('done', () => {
        if (out.length === 0) {
          reject(new Error('muxjs produced no output'));
          return;
        }
        resolve(concat(out));
      });

      for (const seg of segments) transmuxer.push(seg);
      transmuxer.flush();
    } catch (err) {
      reject(err instanceof Error ? err : new Error('muxjs transmux failed'));
    }
  });
}

export const muxjsEngine: RemuxEngine = {
  name: 'mux.js',
  canHandle(input: RemuxInput): boolean {
    // TS segments only. fMP4 is handled by the native companion.
    return !input.isFmp4;
  },
  async remux(input: RemuxInput): Promise<RemuxResult> {
    const mp4 = await transmuxTs(input.segments);
    return { blob: new Blob([mp4.buffer as ArrayBuffer], { type: 'video/mp4' }), extension: 'mp4', engine: 'mux.js' };
  },
};
