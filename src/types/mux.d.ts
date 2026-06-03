// Minimal ambient types for mux.js (no official types shipped).
declare module 'mux.js' {
  namespace mp4 {
    interface TransmuxerOptions {
      remux?: boolean;
      keepOriginalTimestamps?: boolean;
    }
    interface TransmuxedSegment {
      initSegment: Uint8Array;
      data: Uint8Array;
    }
    class Transmuxer {
      constructor(options?: TransmuxerOptions);
      on(event: 'data', cb: (segment: TransmuxedSegment) => void): void;
      on(event: 'done', cb: () => void): void;
      on(event: string, cb: (...args: unknown[]) => void): void;
      off(event: string): void;
      push(data: Uint8Array): void;
      flush(): void;
    }
  }
  const muxjs: { mp4: typeof mp4 };
  export default muxjs;
  export { mp4 };
}
