// Collects page-level signals that indicate protected or non-direct playback:
// Encrypted Media Extensions usage, MediaSource usage, and blob-backed media.
//
// These are SIGNALS used only to classify support status honestly. Nothing here
// attempts to access keys, decrypt, or bypass protection.

import type { PageSignals } from '@shared/message-types';

let emeObserved = false;
let mseObserved = false;

/** Patch detection hooks early (idempotent). Records *usage*, never content. */
export function installPageSignalProbes(): void {
  // EME: requestMediaKeySystemAccess is the entry point for DRM playback.
  try {
    const nav = navigator as unknown as {
      requestMediaKeySystemAccess?: (...args: unknown[]) => Promise<unknown>;
    };
    const original = nav.requestMediaKeySystemAccess?.bind(navigator);
    if (original) {
      nav.requestMediaKeySystemAccess = (...args: unknown[]) => {
        emeObserved = true;
        return original(...args);
      };
    }
  } catch {
    /* ignore */
  }

  // MediaSource usage (adaptive streaming via MSE).
  try {
    if ('MediaSource' in self) {
      const proto = (self as unknown as { MediaSource: { prototype: { addSourceBuffer?: unknown } } }).MediaSource;
      const orig = proto.prototype.addSourceBuffer as ((...a: unknown[]) => unknown) | undefined;
      if (orig) {
        proto.prototype.addSourceBuffer = function (this: unknown, ...args: unknown[]) {
          mseObserved = true;
          return orig.apply(this, args);
        };
      }
    }
  } catch {
    /* ignore */
  }
}

function hasBlobMedia(): boolean {
  const media = document.querySelectorAll<HTMLMediaElement>('video, audio');
  return Array.from(media).some((m) => (m.currentSrc || m.src).startsWith('blob:'));
}

// Content scripts run in an isolated world, so the probes above may miss calls
// made by the page. As a fallback, inspect attached media elements: a set
// `mediaKeys` is a definitive EME signal regardless of which world made the call.
function hasAttachedMediaKeys(): boolean {
  const media = document.querySelectorAll<HTMLMediaElement>('video, audio');
  return Array.from(media).some((m) => m.mediaKeys != null);
}

export function collectPageSignals(): PageSignals {
  return {
    usesEme: emeObserved || hasAttachedMediaKeys(),
    usesMediaSource: mseObserved,
    hasBlobMedia: hasBlobMedia(),
  };
}
