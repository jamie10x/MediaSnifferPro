// Capability router. The extension only ships the mux.js engine (clear TS HLS).
// Jobs it can't handle throw NATIVE_REQUIRED so the caller can hand them to the
// native companion. A future ffmpeg.wasm engine could plug in here as another
// in-extension option without changing callers — but it is intentionally not
// implemented in this version (native ffmpeg is preferred for heavy jobs).

import type { RemuxInput, RemuxResult } from './types';
import { muxjsEngine } from './muxjs-engine';

export const NATIVE_REQUIRED = 'native_required';

export class NativeRequiredError extends Error {
  code = NATIVE_REQUIRED;
  constructor(message: string) {
    super(message);
    this.name = 'NativeRequiredError';
  }
}

export async function remuxWithRouter(input: RemuxInput): Promise<RemuxResult> {
  if (!muxjsEngine.canHandle(input)) {
    throw new NativeRequiredError('This stream needs the desktop helper (fMP4 / complex stream).');
  }
  return muxjsEngine.remux(input);
}
