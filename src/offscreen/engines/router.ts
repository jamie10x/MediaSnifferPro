// Capability router. Picks one engine per job — never runs both. mux.js is the
// default; ffmpeg.wasm is used only as a fallback when enabled AND mux.js fails.

import type { RemuxEngine, RemuxInput, RemuxResult } from './types';
import { muxjsEngine } from './muxjs-engine';
import { ffmpegEngine } from './ffmpeg-engine';

export interface RouterOptions {
  advancedFfmpegFallback: boolean;
}

export async function remuxWithRouter(
  input: RemuxInput,
  options: RouterOptions,
): Promise<RemuxResult> {
  const primary: RemuxEngine = muxjsEngine;

  try {
    const result = await primary.remux(input);
    if (result.blob.size > 0) return result;
    throw new Error('primary engine produced empty output');
  } catch (primaryErr) {
    // Fallback only if the user enabled it and the engine is actually available.
    if (options.advancedFfmpegFallback && ffmpegEngine.canHandle(input)) {
      return ffmpegEngine.remux(input);
    }
    throw primaryErr instanceof Error ? primaryErr : new Error('remux failed');
  }
}
