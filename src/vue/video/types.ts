export type TVideoFrameFormat = "png" | "gray8";
export type TVideoPlaybackRate = 1 | 2 | 3;

export type TVideoFrame =
  | Readonly<{
      format?: "png";
      png: Uint8Array;
      timestampMs?: number;
      durationMs?: number;
      pixelWidth?: number;
      pixelHeight?: number;
      fingerprint?: string | number;
    }>
  | Readonly<{
      format: "gray8";
      pixels: Uint8Array;
      pixelWidth: number;
      pixelHeight: number;
      timestampMs?: number;
      durationMs?: number;
      fingerprint?: string | number;
    }>;

export type TVideoFrameSourceContext = Readonly<{
  src: string;
  signal: AbortSignal;
  maxFps: number;
  pixelWidth: number;
  pixelHeight: number;
  startAtMs: number;
  playbackRate: TVideoPlaybackRate;
  loop: boolean;
  preferredFormat: TVideoFrameFormat;
}>;

export type TVideoFrameSource = (
  context: TVideoFrameSourceContext,
) => AsyncIterable<TVideoFrame> | Promise<AsyncIterable<TVideoFrame>>;

export type TVideoFrameEvent = Readonly<{
  timestampMs: number;
  pixelWidth: number;
  pixelHeight: number;
  droppedFrames: number;
  durationMs?: number;
  playbackRate?: TVideoPlaybackRate;
}>;
