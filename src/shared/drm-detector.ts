// Signal-based DRM/encryption classifier.
//
// IMPORTANT: This module ONLY classifies media as protected so the UI can show
// an honest "unsupported" message. It does NOT and MUST NOT contain any logic to
// circumvent, decrypt, or bypass DRM, encryption, paywalls, or login restrictions.

// Common DRM system identifiers (UUIDs / keywords) used purely for detection.
const DRM_SYSTEM_UUIDS = [
  'edef8ba9-79d6-4ace-a3c8-27dcd51d21ed', // Widevine
  '9a04f079-9840-4286-ab92-e65be0885f95', // PlayReady
  '94ce86fb-07ff-4f43-adb8-93d2fa968ca2', // FairPlay
  '1077efec-c0b2-4d02-ace3-3c1e52e2fb4b', // W3C common
];

const DRM_KEYWORDS = [
  'widevine',
  'playready',
  'fairplay',
  'com.apple.streamingkeydelivery',
  'com.microsoft.playready',
  'com.widevine.alpha',
  'license',
  'licenseurl',
  'license_url',
  'laurl',
  'pssh',
  'cenc',
];

export interface DrmSignal {
  isDrmLikely: boolean;
  isEncryptedLikely: boolean;
  scheme?: string;
  reason?: string;
}

const NONE: DrmSignal = { isDrmLikely: false, isEncryptedLikely: false };

/** Scan raw HLS playlist text for encryption / DRM key tags. */
export function detectHlsProtection(playlist: string): DrmSignal {
  const text = playlist.toLowerCase();
  // SAMPLE-AES (and key systems) indicate protected playback we won't touch.
  if (text.includes('method=sample-aes') || text.includes('keyformat="com.apple.streamingkeydelivery')) {
    return { isDrmLikely: true, isEncryptedLikely: true, scheme: 'FairPlay', reason: 'HLS SAMPLE-AES / FairPlay key delivery' };
  }
  // #EXT-X-KEY with a real method other than NONE means segments are encrypted.
  const keyMatch = /#ext-x-key:[^\n]*method=([a-z0-9-]+)/.exec(text);
  if (keyMatch && keyMatch[1] && keyMatch[1] !== 'none') {
    const drm = DRM_KEYWORDS.some((k) => text.includes(k));
    return {
      isDrmLikely: drm,
      isEncryptedLikely: true,
      reason: `HLS encrypted segments (METHOD=${keyMatch[1].toUpperCase()})`,
    };
  }
  return NONE;
}

/** Scan a parsed MPD document (or its raw text) for ContentProtection / DRM. */
export function detectDashProtection(mpdText: string): DrmSignal {
  const text = mpdText.toLowerCase();
  if (text.includes('contentprotection')) {
    const uuid = DRM_SYSTEM_UUIDS.find((u) => text.includes(u));
    const keyword = DRM_KEYWORDS.find((k) => text.includes(k));
    return {
      isDrmLikely: true,
      isEncryptedLikely: true,
      scheme: uuid ? schemeFromUuid(uuid) : keyword,
      reason: 'DASH MPD declares ContentProtection',
    };
  }
  return NONE;
}

/** Page-level EEME/MSE/blob signals from the content script. */
export function classifyPageSignals(signals: {
  usesEme: boolean;
  usesMediaSource: boolean;
  hasBlobMedia: boolean;
}): DrmSignal {
  if (signals.usesEme) {
    return {
      isDrmLikely: true,
      isEncryptedLikely: true,
      reason: 'Page uses Encrypted Media Extensions (EME)',
    };
  }
  if (signals.usesMediaSource || signals.hasBlobMedia) {
    // MSE/blob alone is not DRM, but the source is not directly accessible.
    return {
      isDrmLikely: false,
      isEncryptedLikely: false,
      reason: 'Media served via MediaSource/blob (no direct clear source)',
    };
  }
  return NONE;
}

function schemeFromUuid(uuid: string): string {
  switch (uuid) {
    case 'edef8ba9-79d6-4ace-a3c8-27dcd51d21ed':
      return 'Widevine';
    case '9a04f079-9840-4286-ab92-e65be0885f95':
      return 'PlayReady';
    case '94ce86fb-07ff-4f43-adb8-93d2fa968ca2':
      return 'FairPlay';
    default:
      return 'Common Encryption';
  }
}
