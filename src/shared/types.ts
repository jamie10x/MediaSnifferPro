// Core domain types shared across background, content, popup, and options.
// These are intentionally framework-free so they can later move into a shared
// workspace package (packages/core-types) without modification.

export type MediaSource =
  | 'dom'
  | 'network'
  | 'performance'
  | 'metadata'
  | 'manual'
  | 'native';

export type MediaType =
  | 'video'
  | 'audio'
  | 'hls'
  | 'dash'
  | 'subtitle'
  | 'thumbnail'
  | 'unknown';

export type SupportStatus =
  | 'downloadable'
  | 'needs_native_companion'
  | 'copy_only'
  | 'unsupported'
  | 'protected_likely'
  | 'blocked_by_policy';

export interface SubtitleTrack {
  url: string;
  language?: string;
  label?: string;
  format?: 'vtt' | 'srt' | 'ttml' | 'dfxp';
}

export interface ThumbnailAsset {
  url: string;
  width?: number;
  height?: number;
}

export interface MediaCandidate {
  id: string;
  tabId: number;
  frameId?: number;

  pageUrl: string;
  pageTitle: string;
  pageDomain: string;
  /** URL of the (possibly cross-origin) frame that hosts the media — used as a
   * Referer fallback for the native downloader when no header was captured. */
  frameUrl?: string;

  url: string;
  finalUrl?: string;
  canonicalKey: string;

  source: MediaSource;
  mediaType: MediaType;
  supportStatus: SupportStatus;

  container?: string;
  contentType?: string;

  filename?: string;
  extension?: string;

  width?: number;
  height?: number;
  durationSeconds?: number;
  bitrate?: number;
  frameRate?: number;
  codecs?: string;

  fileSizeBytes?: number;
  transferSizeBytes?: number;

  qualityLabel?: string;
  variantGroupId?: string;

  isSegment: boolean;
  isBlob: boolean;
  isManifest: boolean;
  isEncryptedLikely: boolean;
  isDrmLikely: boolean;

  /** Human-readable reason when status is unsupported/protected. */
  unsupportedReason?: string;

  variants?: StreamVariant[];
  subtitles?: SubtitleTrack[];
  thumbnails?: ThumbnailAsset[];

  requestHeadersRedacted?: Record<string, string>;
  responseHeadersRedacted?: Record<string, string>;

  /**
   * Non-sensitive request headers (Referer/Origin/User-Agent only — never
   * cookies/auth) captured from the page's own request, so the native companion
   * can replay against Referer-checking CDNs.
   */
  replayHeaders?: { referer?: string; origin?: string; userAgent?: string };

  createdAt: number;
  updatedAt: number;
}

export type VariantSupportStatus =
  | 'downloadable_clear'
  | 'requires_native'
  | 'unsupported_encrypted'
  | 'unsupported_drm';

export interface StreamVariant {
  id: string;
  manifestUrl: string;
  mediaType: 'hls' | 'dash';

  bandwidth?: number;
  averageBandwidth?: number;
  width?: number;
  height?: number;
  frameRate?: number;
  codecs?: string;
  audioGroupId?: string;
  subtitleGroupId?: string;

  playlistUrl?: string;
  initSegmentUrl?: string;

  segmentCount?: number;
  estimatedDurationSeconds?: number;
  estimatedSizeBytes?: number;

  protection: {
    hasDrm: boolean;
    hasEncryption: boolean;
    scheme?: string;
    reason?: string;
  };

  supportStatus: VariantSupportStatus;
}

export type DownloadJobType =
  | 'browser_direct'
  | 'native_direct'
  | 'native_hls'
  | 'native_dash'
  | 'copy_url_only';

export type DownloadJobStatus =
  | 'queued'
  | 'preparing'
  | 'downloading'
  | 'remuxing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'blocked';

export interface DownloadJob {
  id: string;
  candidateId: string;

  type: DownloadJobType;
  status: DownloadJobStatus;

  url: string;
  outputFilename: string;
  outputDirectory?: string;

  progress: {
    percent: number;
    downloadedBytes: number;
    totalBytes?: number;
    speedBytesPerSecond?: number;
    etaSeconds?: number;
    currentStep?: string;
  };

  /** Set on browser_direct jobs so we can map chrome.downloads events back. */
  browserDownloadId?: number;

  error?: {
    code: string;
    message: string;
    recoverable: boolean;
  };

  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}
