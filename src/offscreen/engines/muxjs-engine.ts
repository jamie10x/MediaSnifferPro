// Primary engine.
//   - MPEG-TS HLS segments  -> transmux to fragmented MP4 via mux.js.
//   - fMP4 (m4s) HLS         -> concatenate init segment + media fragments
//                               (already valid fMP4; no transmux needed).

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
  canHandle() {
    // Handles both TS (transmux) and fMP4 (concat).
    return true;
  },
  async remux(input: RemuxInput): Promise<RemuxResult> {
    if (input.isFmp4) {
      const parts = input.initSegment ? [input.initSegment, ...input.segments] : input.segments;
      const merged = concat(parts);
      return { blob: new Blob([merged.buffer as ArrayBuffer], { type: 'video/mp4' }), extension: 'mp4', engine: 'concat-fmp4' };
    }
    const mp4 = await transmuxTs(input.segments);
    return { blob: new Blob([mp4.buffer as ArrayBuffer], { type: 'video/mp4' }), extension: 'mp4', engine: 'mux.js' };
  },
};
