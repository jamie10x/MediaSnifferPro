// Remux engine interface. Implementations turn ordered media segments into a
// single playable file Blob. The router picks one per job.

export interface RemuxInput {
  /** Ordered media segment byte buffers. */
  segments: Uint8Array[];
  /** Optional fMP4 init segment (EXT-X-MAP) prepended for fragmented MP4. */
  initSegment?: Uint8Array;
  /** True when segments are fragmented MP4 (m4s) rather than MPEG-TS. */
  isFmp4: boolean;
}

export interface RemuxResult {
  blob: Blob;
  /** Output file extension, e.g. "mp4". */
  extension: string;
  engine: string;
}

export interface RemuxEngine {
  readonly name: string;
  /** Whether this engine can handle the given input. */
  canHandle(input: RemuxInput): boolean;
  remux(input: RemuxInput): Promise<RemuxResult>;
}
