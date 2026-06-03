// Fallback engine (behind the `advancedFfmpegFallback` setting).
//
// The engine-router interface is in place so ffmpeg.wasm can be dropped in as a
// fallback without rewriting the downloader. To stay MV3-compliant, ffmpeg core
// MUST be packaged locally (bundled assets) — never fetched from a CDN. That ~30MB
// payload is NOT bundled in this round, so the engine reports itself unavailable
// until packaged. See NATIVE_COMPANION/STREAM notes in docs.
//
// To wire it later:
//   1. Add @ffmpeg/ffmpeg + @ffmpeg/util and the core .wasm/.js assets to the build.
//   2. Lazy-load here with `coreURL`/`wasmURL` pointing at bundled chrome-extension
//      URLs (chrome.runtime.getURL), with the manifest CSP `wasm-unsafe-eval` (already set).
//   3. Implement remux(): write segments to the virtual FS, run a concat/transcode,
//      read the output, return an MP4 Blob.

import type { RemuxEngine, RemuxInput, RemuxResult } from './types';

let packaged = false; // flip to true once ffmpeg core assets are bundled.

export const ffmpegEngine: RemuxEngine = {
  name: 'ffmpeg.wasm',
  canHandle() {
    return packaged;
  },
  async remux(_input: RemuxInput): Promise<RemuxResult> {
    void _input;
    throw new Error(
      'ffmpeg.wasm fallback is not packaged in this build. Enable it after bundling ffmpeg core locally.',
    );
  },
};

export function isFfmpegPackaged(): boolean {
  return packaged;
}

export function __setFfmpegPackagedForTest(value: boolean): void {
  packaged = value;
}
