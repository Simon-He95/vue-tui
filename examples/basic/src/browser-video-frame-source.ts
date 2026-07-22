import type { TVideoFrameSource } from "@simon_he/vue-tui/experimental";

export type BrowserVideoFrameSourceOptions = Readonly<{
  loop?: boolean;
}>;

const MAX_WIDTH = 512;
const MAX_HEIGHT = 256;
const MAX_FPS = 30;

type VideoFrameMetadata = Readonly<{
  mediaTime: number;
  wallTimeMs: number;
}>;

type VideoWithFrameCallbacks = HTMLVideoElement & {
  requestVideoFrameCallback?: (
    callback: (now: number, metadata: VideoFrameMetadata) => void,
  ) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

function positiveInt(value: unknown, fallback: number, max: number): number {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(max, parsed);
}

function positiveNumber(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(max, parsed);
}

function abortError(): Error {
  const error = new Error("Browser video decoding aborted");
  error.name = "AbortError";
  return error;
}

function mediaError(video: HTMLVideoElement): Error {
  return new Error(video.error?.message || "Browser video decoding failed");
}

function waitForMetadata(video: HTMLVideoElement, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(abortError());
  if (video.readyState >= 1) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener("loadedmetadata", onMetadata);
      video.removeEventListener("error", onError);
      signal.removeEventListener("abort", onAbort);
    };
    const onMetadata = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(mediaError(video));
    };
    const onAbort = () => {
      cleanup();
      reject(abortError());
    };

    video.addEventListener("loadedmetadata", onMetadata, { once: true });
    video.addEventListener("error", onError, { once: true });
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function waitForPlayback(video: HTMLVideoElement, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(abortError());

  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    const onAbort = () => {
      cleanup();
      reject(abortError());
    };

    signal.addEventListener("abort", onAbort, { once: true });
    void video.play().then(
      () => {
        cleanup();
        resolve();
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      },
    );
  });
}

function waitForVideoFrame(
  video: VideoWithFrameCallbacks,
  signal: AbortSignal,
  fallbackDelayMs: number,
): Promise<VideoFrameMetadata | null> {
  if (signal.aborted) return Promise.reject(abortError());
  if (video.ended) return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    let callbackHandle: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      if (callbackHandle != null) video.cancelVideoFrameCallback?.(callbackHandle);
      if (timer != null) clearTimeout(timer);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("error", onError);
      signal.removeEventListener("abort", onAbort);
    };
    const finish = (metadata: VideoFrameMetadata | null) => {
      cleanup();
      resolve(metadata);
    };
    const onEnded = () => finish(null);
    const onError = () => {
      cleanup();
      reject(mediaError(video));
    };
    const onAbort = () => {
      cleanup();
      reject(abortError());
    };

    video.addEventListener("ended", onEnded, { once: true });
    video.addEventListener("error", onError, { once: true });
    signal.addEventListener("abort", onAbort, { once: true });

    if (video.requestVideoFrameCallback) {
      callbackHandle = video.requestVideoFrameCallback((now, metadata) =>
        finish({ mediaTime: metadata.mediaTime, wallTimeMs: now }),
      );
    } else {
      timer = setTimeout(
        () => finish({ mediaTime: video.currentTime, wallTimeMs: performance.now() }),
        fallbackDelayMs,
      );
    }
  });
}

function fingerprintPixels(pixels: Uint8Array): number {
  let hash = 0x811c9dc5;
  for (const pixel of pixels) {
    hash ^= pixel;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function createBrowserVideoFrameSource(
  options: BrowserVideoFrameSourceOptions = {},
): TVideoFrameSource {
  return async function* browserVideoFrames(context) {
    if (context.preferredFormat !== "gray8") {
      throw new Error("Browser video frame source only supports gray8 output");
    }
    if (context.signal.aborted) throw abortError();
    if (typeof document === "undefined") {
      throw new Error("Browser video frame source requires a DOM environment");
    }

    const width = positiveInt(context.pixelWidth, 1, MAX_WIDTH);
    const height = positiveInt(context.pixelHeight, 1, MAX_HEIGHT);
    const fps = positiveNumber(context.maxFps, 10, MAX_FPS);
    const frameIntervalMs = 1000 / fps;
    const video = document.createElement("video") as VideoWithFrameCallbacks;
    const canvas = document.createElement("canvas");
    const drawing = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    if (!drawing) throw new Error("Browser video frame source requires Canvas 2D support");

    canvas.width = width;
    canvas.height = height;
    video.crossOrigin = "anonymous";
    video.loop = context.loop || options.loop === true;
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = context.src;

    try {
      await waitForMetadata(video, context.signal);
      if (video.videoWidth <= 0 || video.videoHeight <= 0) {
        throw new Error("Browser video source has no decodable video track");
      }

      const startSeconds = Math.max(0, Number(context.startAtMs) || 0) / 1000;
      if (startSeconds > 0) {
        video.currentTime =
          video.loop && Number.isFinite(video.duration) && video.duration > 0
            ? startSeconds % video.duration
            : Math.min(startSeconds, Math.max(0, video.duration || 0));
      }
      video.playbackRate = context.playbackRate;
      await waitForPlayback(video, context.signal);

      drawing.imageSmoothingEnabled = true;
      drawing.imageSmoothingQuality = "low";

      let lastFrameAtMs = Number.NEGATIVE_INFINITY;
      while (!context.signal.aborted) {
        const metadata = await waitForVideoFrame(video, context.signal, frameIntervalMs);
        if (!metadata) return;

        const timestampMs = Math.max(0, metadata.mediaTime * 1000);
        if (metadata.wallTimeMs - lastFrameAtMs + 0.5 < frameIntervalMs) continue;
        lastFrameAtMs = metadata.wallTimeMs;

        const scale = Math.min(width / video.videoWidth, height / video.videoHeight);
        const drawWidth = Math.max(1, Math.round(video.videoWidth * scale));
        const drawHeight = Math.max(1, Math.round(video.videoHeight * scale));
        const drawX = Math.floor((width - drawWidth) / 2);
        const drawY = Math.floor((height - drawHeight) / 2);

        drawing.fillStyle = "#000";
        drawing.fillRect(0, 0, width, height);
        drawing.drawImage(video, drawX, drawY, drawWidth, drawHeight);

        let rgba: Uint8ClampedArray;
        try {
          rgba = drawing.getImageData(0, 0, width, height).data;
        } catch {
          throw new Error("Browser video URLs must allow CORS before frames can be rendered");
        }

        const pixels = new Uint8Array(width * height);
        for (let source = 0, target = 0; source < rgba.length; source += 4, target++) {
          pixels[target] =
            (rgba[source]! * 77 + rgba[source + 1]! * 150 + rgba[source + 2]! * 29) >> 8;
        }

        yield {
          format: "gray8",
          pixels,
          pixelWidth: width,
          pixelHeight: height,
          timestampMs,
          ...(Number.isFinite(video.duration) && video.duration > 0
            ? { durationMs: video.duration * 1000 }
            : {}),
          fingerprint: fingerprintPixels(pixels),
        };
      }
    } finally {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
  };
}
