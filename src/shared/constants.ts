// Static classification tables and default settings.

export const VIDEO_EXTENSIONS = new Set([
  'mp4',
  'webm',
  'mov',
  'm4v',
  'ogv',
  'mkv',
  'avi',
]);

export const AUDIO_EXTENSIONS = new Set([
  'mp3',
  'm4a',
  'aac',
  'ogg',
  'opus',
  'wav',
  'flac',
]);

export const SUBTITLE_EXTENSIONS = new Set(['vtt', 'srt', 'ttml', 'dfxp']);

export const THUMBNAIL_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);

/** Stream fragments hidden by default — noisy and not directly downloadable. */
export const SEGMENT_EXTENSIONS = new Set(['ts', 'm4s', 'cmfv', 'cmfa', 'cmf']);

/** Content-Types that always indicate a stream segment (hidden by default). */
export const SEGMENT_CONTENT_TYPES = ['video/mp2t', 'audio/mp2t', 'video/iso.segment'];

export const HLS_EXTENSIONS = new Set(['m3u8', 'm3u']);
export const DASH_EXTENSIONS = new Set(['mpd']);

/** Content-Type fragments that signal each media kind. */
export const CONTENT_TYPE_HINTS = {
  hls: ['application/vnd.apple.mpegurl', 'application/x-mpegurl', 'audio/mpegurl'],
  dash: ['application/dash+xml'],
  video: ['video/'],
  audio: ['audio/'],
  subtitle: ['text/vtt', 'application/ttml+xml'],
} as const;

/** Container -> default extension for filename building. */
export const CONTAINER_EXTENSION: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/flac': 'flac',
};

/** Query-parameter names that indicate a signed URL — never stripped in dedup. */
export const SIGNING_PARAM_HINTS = [
  'sig',
  'signature',
  'token',
  'expires',
  'expire',
  'x-amz-',
  'x-goog-',
  'hmac',
  'policy',
  'key-pair-id',
  'keyid',
  'st',
  'e',
  '__token__',
];

/** Headers redacted before any value is stored or logged. */
export const SENSITIVE_HEADERS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'proxy-authorization',
  'x-api-key',
]);

export const STORAGE_KEYS = {
  settings: 'msp.settings',
  candidatesPrefix: 'msp.candidates.', // + tabId
} as const;

export const NATIVE_HOST_NAME = 'com.mediasniffer.pro.companion';

export const PROTECTED_MEDIA_MESSAGE =
  'This page appears to use protected or restricted streaming. MediaSniffer Pro ' +
  'cannot download DRM-protected, paywalled, or unauthorized media.';

export const HLS_PROTECTED_MESSAGE =
  'This HLS stream appears to be encrypted or protected. It cannot be downloaded by this tool.';

export const DASH_PROTECTED_MESSAGE =
  'This DASH stream appears to use DRM or protected playback. Download is not supported.';

export interface FilenameTemplateChoice {
  id: string;
  template: string;
}

export const FILENAME_TEMPLATES: FilenameTemplateChoice[] = [
  { id: 'title', template: '{title}.{ext}' },
  { id: 'domain-title', template: '{domain}/{title}.{ext}' },
  { id: 'date-title-quality', template: '{date}-{title}-{quality}.{ext}' },
  { id: 'pagetitle-type-quality', template: '{pageTitle}-{mediaType}-{quality}.{ext}' },
];

export interface Settings {
  detectDom: boolean;
  detectNetwork: boolean;
  detectPerformance: boolean;
  detectHls: boolean;
  detectDash: boolean;
  showAudio: boolean;
  showSubtitles: boolean;
  showThumbnails: boolean;
  hideSegments: boolean;
  minFileSizeBytes: number;
  preferredQuality: 'highest' | 'lowest' | 'ask';
  preferredFormat: 'original' | 'mp4' | 'mkv' | 'webm';
  filenameTemplate: string;
  nativeHelperEnabled: boolean;
  /** Concurrent segment downloads (in-browser and native). */
  streamConcurrency: number;
  /** Max simultaneous downloads in the native helper's queue. */
  maxParallelDownloads: number;
  /** Download speed cap in MB/s (0 = unlimited). */
  bandwidthLimitMbps: number;
  /** Output folder for desktop-helper downloads (empty = ~/Downloads/MediaSnifferPro). */
  downloadFolder: string;
  /** Desktop notifications when a download finishes. */
  notificationsEnabled: boolean;
  /** Show a floating download button on pages with downloadable media. */
  inPageWidgetEnabled: boolean;
  /** Domains where the in-page widget is disabled (per-site). */
  widgetDisabledDomains: string[];
  privacyMode: boolean;
  debugLogs: boolean;
  allowlist: string[];
  blocklist: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  detectDom: true,
  detectNetwork: true,
  detectPerformance: true,
  detectHls: true,
  detectDash: true,
  showAudio: true,
  showSubtitles: true,
  showThumbnails: false,
  hideSegments: true,
  minFileSizeBytes: 0,
  preferredQuality: 'highest',
  preferredFormat: 'original',
  filenameTemplate: '{title}.{ext}',
  nativeHelperEnabled: false,
  streamConcurrency: 6,
  maxParallelDownloads: 3,
  bandwidthLimitMbps: 0,
  downloadFolder: '',
  notificationsEnabled: true,
  inPageWidgetEnabled: false,
  widgetDisabledDomains: [],
  privacyMode: true,
  debugLogs: false,
  allowlist: [],
  blocklist: [],
};
