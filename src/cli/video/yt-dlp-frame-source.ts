import type { TVideoFrameSource, TVideoFrameSourceContext } from "../../vue/video/types.js";
import { createFfmpegVideoFrameSource } from "./ffmpeg-frame-source.js";

export type YtDlpVideoFrameSourceOptions = Readonly<{
  ytDlpPath?: string;
  ffmpegPath?: string;
  live?: boolean;
  realtime?: boolean;
  maxFrameBytes?: number;
  maxSourceHeight?: number;
  format?: string;
}>;

const DEFAULT_MAX_SOURCE_HEIGHT = 720;
const MAX_SOURCE_HEIGHT = 4320;
const MAX_METADATA_BYTES = 128 * 1024;
const MAX_STDERR_CHARS = 16_384;
const KILL_TIMEOUT_MS = 1_000;
const METADATA_TEMPLATE = "%(.{url,http_headers,protocol,width,height,fps,vcodec})j";
const COMMON_SOURCE_HEIGHTS = [144, 240, 360, 480, 720, 1080, 1440, 2160, 4320] as const;

type ResolvedYtDlpInput = Readonly<{
  url: string;
  httpHeaders: Readonly<Record<string, string>>;
}>;

function positiveInt(value: unknown, fallback: number, max: number): number {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(max, parsed);
}

function resolveSourceHeight(
  options: YtDlpVideoFrameSourceOptions,
  context: TVideoFrameSourceContext | undefined,
): number {
  const maxSourceHeight = positiveInt(
    options.maxSourceHeight,
    DEFAULT_MAX_SOURCE_HEIGHT,
    MAX_SOURCE_HEIGHT,
  );
  if (!context) return maxSourceHeight;

  const minimum = context.preferredFormat === "gray8" ? 144 : 360;
  const requested = Math.max(minimum, positiveInt(context.pixelHeight, minimum, MAX_SOURCE_HEIGHT));
  const rounded = COMMON_SOURCE_HEIGHTS.find((height) => height >= requested) ?? MAX_SOURCE_HEIGHT;
  return Math.min(maxSourceHeight, rounded);
}

function resolveSourceFps(context: TVideoFrameSourceContext | undefined): number {
  const requested = Number(context?.maxFps);
  return Math.max(30, Number.isFinite(requested) && requested > 0 ? Math.ceil(requested) : 30);
}

function abortError(): Error {
  const error = new Error("yt-dlp video URL resolution aborted");
  error.name = "AbortError";
  return error;
}

function sanitizeProcessError(value: string): string {
  let out = "";
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (
      code <= 0x08 ||
      code === 0x0b ||
      code === 0x0c ||
      (code >= 0x0e && code <= 0x1f) ||
      (code >= 0x7f && code <= 0x9f)
    ) {
      continue;
    }
    out += character;
  }
  return out.trim();
}

function assertHttpUrl(value: string, label: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be an HTTP(S) URL`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${label} must be an HTTP(S) URL`);
  }
  return url.href;
}

/** @internal */
export function buildYtDlpVideoArgs(
  src: string,
  options: YtDlpVideoFrameSourceOptions = {},
  context?: TVideoFrameSourceContext,
): string[] {
  const source = assertHttpUrl(src, "yt-dlp source");
  const sourceHeight = resolveSourceHeight(options, context);
  const sourceFps = resolveSourceFps(context);
  const format =
    options.format?.trim() ||
    [
      `bestvideo[height<=${sourceHeight}][fps<=${sourceFps}][protocol^=http][vcodec^=avc1]`,
      `bestvideo[height<=${sourceHeight}][fps<=${sourceFps}][protocol^=http]`,
      `bestvideo[height<=${sourceHeight}][protocol^=http][vcodec^=avc1]`,
      `bestvideo[height<=${sourceHeight}][protocol^=http]`,
      `best[height<=${sourceHeight}][fps<=${sourceFps}][protocol^=http]`,
      `best[height<=${sourceHeight}][protocol^=http]`,
    ].join("/");

  return [
    "--no-config",
    "--no-playlist",
    "--no-warnings",
    "--simulate",
    "--print",
    METADATA_TEMPLATE,
    "--format",
    format,
    "--",
    source,
  ];
}

async function resolveYtDlpVideoInput(
  src: string,
  signal: AbortSignal,
  options: YtDlpVideoFrameSourceOptions,
  context: TVideoFrameSourceContext,
): Promise<ResolvedYtDlpInput> {
  if (signal.aborted) throw abortError();

  const { spawn } = await import("node:child_process");
  if (signal.aborted) throw abortError();

  const executable = options.ytDlpPath?.trim() || "yt-dlp";
  const child = spawn(executable, buildYtDlpVideoArgs(src, options, context), {
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const decoder = new TextDecoder();
  const stderrDecoder = new TextDecoder();
  let stdout = "";
  let stdoutBytes = 0;
  let stderrTail = "";
  let spawnError: unknown;
  let metadataTooLarge = false;
  let closed = false;
  let aborted = false;
  let killTimer: ReturnType<typeof setTimeout> | null = null;

  const terminate = () => {
    if (closed) return;
    child.kill("SIGTERM");
    if (killTimer != null) return;
    killTimer = setTimeout(() => {
      if (!closed) child.kill("SIGKILL");
    }, KILL_TIMEOUT_MS);
    killTimer.unref?.();
  };

  child.stdout.on("data", (chunk: Uint8Array) => {
    stdoutBytes += chunk.byteLength;
    if (stdoutBytes > MAX_METADATA_BYTES) {
      metadataTooLarge = true;
      terminate();
      return;
    }
    stdout += decoder.decode(chunk, { stream: true });
  });
  child.stderr.on("data", (chunk: Uint8Array) => {
    stderrTail = `${stderrTail}${stderrDecoder.decode(chunk, { stream: true })}`.slice(
      -MAX_STDERR_CHARS,
    );
  });

  const closePromise = new Promise<Readonly<{ code: number | null; signal: string | null }>>(
    (resolve) => {
      child.once("error", (error) => {
        spawnError = error;
      });
      child.once("close", (code, closeSignal) => {
        closed = true;
        if (killTimer != null) clearTimeout(killTimer);
        killTimer = null;
        stdout += decoder.decode();
        stderrTail = `${stderrTail}${stderrDecoder.decode()}`.slice(-MAX_STDERR_CHARS);
        resolve({ code, signal: closeSignal });
      });
    },
  );

  const onAbort = () => {
    aborted = true;
    terminate();
  };
  signal.addEventListener("abort", onAbort, { once: true });
  if (signal.aborted) onAbort();

  try {
    const exit = await closePromise;
    if (aborted || signal.aborted) throw abortError();
    if (metadataTooLarge) throw new Error("yt-dlp video metadata exceeded 131072 bytes");
    if (spawnError) {
      const details = spawnError instanceof Error ? spawnError.message : String(spawnError);
      throw new Error(`yt-dlp video URL resolution failed: ${details}`);
    }
    if (exit.code !== 0) {
      const details = sanitizeProcessError(stderrTail);
      throw new Error(
        details
          ? `yt-dlp video URL resolution failed (${exit.code ?? exit.signal}): ${details}`
          : `yt-dlp video URL resolution failed (${exit.code ?? exit.signal})`,
      );
    }

    const lines = stdout.trim().split(/\r?\n/u).filter(Boolean);
    if (lines.length !== 1) throw new Error("yt-dlp returned invalid video metadata");

    let metadata: unknown;
    try {
      metadata = JSON.parse(lines[0]!);
    } catch {
      throw new Error("yt-dlp returned invalid video metadata");
    }
    if (!metadata || typeof metadata !== "object") {
      throw new Error("yt-dlp returned invalid video metadata");
    }

    const raw = metadata as Readonly<{ url?: unknown; http_headers?: unknown }>;
    if (typeof raw.url !== "string") throw new Error("yt-dlp returned invalid video metadata");
    const url = assertHttpUrl(raw.url, "yt-dlp resolved video URL");
    const httpHeaders: Record<string, string> = {};
    if (raw.http_headers != null) {
      if (typeof raw.http_headers !== "object" || Array.isArray(raw.http_headers)) {
        throw new Error("yt-dlp returned invalid video metadata");
      }
      for (const [name, value] of Object.entries(raw.http_headers)) {
        if (typeof value !== "string") throw new Error("yt-dlp returned invalid video metadata");
        httpHeaders[name] = value;
      }
    }
    return { url, httpHeaders };
  } finally {
    signal.removeEventListener("abort", onAbort);
    if (!closed) terminate();
  }
}

export function createYtDlpVideoFrameSource(
  options: YtDlpVideoFrameSourceOptions = {},
): TVideoFrameSource {
  return async function* ytDlpVideoFrames(context) {
    const input = await resolveYtDlpVideoInput(context.src, context.signal, options, context);
    const ffmpegSource = createFfmpegVideoFrameSource({
      ffmpegPath: options.ffmpegPath,
      live: options.live,
      realtime: options.realtime,
      maxFrameBytes: options.maxFrameBytes,
      httpHeaders: input.httpHeaders,
    });
    const frames = await ffmpegSource({ ...context, src: input.url });
    yield* frames;
  };
}
