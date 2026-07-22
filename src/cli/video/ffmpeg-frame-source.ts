import type { TVideoFrameSource, TVideoFrameSourceContext } from "../../vue/video/types.js";
import { parsePngFrames } from "./png-frame-parser.js";
import { parseRawFrames } from "./raw-frame-parser.js";

export type FfmpegVideoFrameSourceOptions = Readonly<{
  ffmpegPath?: string;
  live?: boolean;
  loop?: boolean;
  realtime?: boolean;
  maxFrameBytes?: number;
  httpHeaders?: Readonly<Record<string, string>>;
}>;

const DEFAULT_MAX_FRAME_BYTES = 8 * 1024 * 1024;
const MAX_PNG_DIMENSION = 4096;
const MAX_STDERR_CHARS = 16_384;
const KILL_TIMEOUT_MS = 1_000;
const MIN_FPS = 0.001;

type FfmpegInput = Readonly<{
  protocolWhitelist: string;
  readAtNativeRate: boolean;
}>;

type FfmpegExit = Readonly<{
  code: number | null;
  signal: string | null;
}>;

function positiveInt(value: unknown, fallback: number, max: number): number {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(max, parsed);
}

function positiveNumber(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(MIN_FPS, Math.min(max, parsed));
}

function ffmpegNumber(value: number): string {
  return Number(value.toFixed(3)).toString();
}

function ffmpegHttpHeaders(headers: Readonly<Record<string, string>> | undefined): string {
  if (!headers) return "";

  const lines: string[] = [];
  for (const [name, value] of Object.entries(headers)) {
    const hasControlCharacter = [...value].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 0x1f || code === 0x7f;
    });
    if (!/^[!#$%&'*+.^_`|~\w-]+$/u.test(name) || hasControlCharacter) {
      throw new Error("Invalid FFmpeg HTTP header");
    }
    lines.push(`${name}: ${value}`);
  }
  return lines.length ? `${lines.join("\r\n")}\r\n` : "";
}

function classifyInput(src: string, live: boolean): FfmpegInput {
  if (!src.trim()) throw new Error("TVideo src must not be empty");
  if (/^[a-zA-Z]:[\\/]/u.test(src)) {
    return { protocolWhitelist: "file", readAtNativeRate: !live };
  }

  const scheme = /^([a-zA-Z][a-zA-Z\d+.-]*):/u.exec(src)?.[1]?.toLowerCase();
  if (!scheme || scheme === "file") {
    return { protocolWhitelist: "file", readAtNativeRate: !live };
  }
  if (scheme === "http" || scheme === "https") {
    return {
      protocolWhitelist: "http,https,httpproxy,tcp,tls",
      readAtNativeRate: !live,
    };
  }
  throw new Error(`Unsupported TVideo source protocol: ${scheme}`);
}

function pngDimensions(png: Uint8Array): Readonly<{ width: number; height: number }> {
  return {
    width: (png[16]! * 0x1000000 + (png[17]! << 16) + (png[18]! << 8) + png[19]!) >>> 0,
    height: (png[20]! * 0x1000000 + (png[21]! << 16) + (png[22]! << 8) + png[23]!) >>> 0,
  };
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

function abortError(): Error {
  const error = new Error("FFmpeg video decoding aborted");
  error.name = "AbortError";
  return error;
}

/** @internal */
export function buildFfmpegVideoArgs(
  context: TVideoFrameSourceContext,
  options: FfmpegVideoFrameSourceOptions = {},
): string[] {
  const live = options.live === true;
  const realtime = options.realtime !== false;
  const input = classifyInput(context.src, live);
  const fps = positiveNumber(context.maxFps, 12, 60);
  const playbackRate = positiveNumber(context.playbackRate, 1, 3);
  const width = positiveInt(context.pixelWidth, 320, MAX_PNG_DIMENSION);
  const height = positiveInt(context.pixelHeight, 180, MAX_PNG_DIMENSION);
  const preferredFormat = context.preferredFormat ?? "png";
  const startAtMs = Math.max(0, Number(context.startAtMs) || 0);
  const httpHeaders =
    input.protocolWhitelist === "file" ? "" : ffmpegHttpHeaders(options.httpHeaders);
  const filters = [
    playbackRate === 1
      ? "setpts=PTS-STARTPTS"
      : `setpts=(PTS-STARTPTS)/${ffmpegNumber(playbackRate)}`,
    `fps=${ffmpegNumber(fps)}`,
    ...(realtime ? ["realtime"] : []),
    `scale=${width}:${height}:force_original_aspect_ratio=decrease:flags=fast_bilinear`,
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
  ];

  return [
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "error",
    ...(context.loop || options.loop ? ["-stream_loop", "-1"] : []),
    ...(startAtMs > 0 && !live ? ["-ss", ffmpegNumber(startAtMs / 1000)] : []),
    ...(realtime && input.readAtNativeRate ? ["-readrate", ffmpegNumber(playbackRate)] : []),
    "-protocol_whitelist",
    input.protocolWhitelist,
    ...(httpHeaders ? ["-headers", httpHeaders] : []),
    "-i",
    context.src,
    "-map",
    "0:V:0",
    "-an",
    "-sn",
    "-dn",
    "-vf",
    filters.join(","),
    "-fps_mode",
    "passthrough",
    "-threads",
    "1",
    ...(preferredFormat === "gray8"
      ? ["-f", "rawvideo", "-c:v", "rawvideo", "-pix_fmt", "gray"]
      : ["-f", "image2pipe", "-c:v", "png", "-pix_fmt", "rgb24", "-compression_level", "1"]),
    "pipe:1",
  ];
}

export function createFfmpegVideoFrameSource(
  options: FfmpegVideoFrameSourceOptions = {},
): TVideoFrameSource {
  return async function* ffmpegVideoFrames(context) {
    if (context.signal.aborted) throw abortError();

    const fps = positiveNumber(context.maxFps, 12, 60);
    const playbackRate = positiveNumber(context.playbackRate, 1, 3);
    const startAtMs = Math.max(0, Number(context.startAtMs) || 0);
    const width = positiveInt(context.pixelWidth, 320, MAX_PNG_DIMENSION);
    const height = positiveInt(context.pixelHeight, 180, MAX_PNG_DIMENSION);
    const preferredFormat = context.preferredFormat ?? "png";
    const maxFrameBytes = positiveInt(
      options.maxFrameBytes,
      DEFAULT_MAX_FRAME_BYTES,
      DEFAULT_MAX_FRAME_BYTES,
    );
    const rawFrameBytes = width * height;
    if (preferredFormat === "gray8" && rawFrameBytes > maxFrameBytes) {
      throw new Error(`FFmpeg raw video frame exceeded ${maxFrameBytes} bytes`);
    }

    const { spawn } = await import("node:child_process");
    if (context.signal.aborted) throw abortError();

    const executable = options.ffmpegPath?.trim() || "ffmpeg";
    const args = buildFfmpegVideoArgs(context, options);
    const child = spawn(executable, args, {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = child.stdout;
    const stderr = child.stderr;
    const decoder = new TextDecoder();
    let stderrTail = "";
    let spawnError: unknown;
    let closed = false;
    let aborted = false;
    let killTimer: ReturnType<typeof setTimeout> | null = null;

    stderr.on("data", (chunk: Uint8Array) => {
      stderrTail = `${stderrTail}${decoder.decode(chunk, { stream: true })}`.slice(
        -MAX_STDERR_CHARS,
      );
    });

    const closePromise = new Promise<FfmpegExit>((resolve) => {
      child.once("error", (error) => {
        spawnError = error;
      });
      child.once("close", (code, signal) => {
        closed = true;
        if (killTimer != null) clearTimeout(killTimer);
        killTimer = null;
        stderrTail = `${stderrTail}${decoder.decode()}`.slice(-MAX_STDERR_CHARS);
        resolve({ code, signal });
      });
    });

    const terminate = () => {
      if (closed) return;
      child.kill("SIGTERM");
      if (killTimer != null) return;
      killTimer = setTimeout(() => {
        if (!closed) child.kill("SIGKILL");
      }, KILL_TIMEOUT_MS);
      killTimer.unref?.();
    };
    const onAbort = () => {
      aborted = true;
      terminate();
    };
    context.signal.addEventListener("abort", onAbort, { once: true });
    if (context.signal.aborted) onAbort();

    let frameIndex = 0;

    try {
      if (preferredFormat === "gray8") {
        for await (const pixels of parseRawFrames(stdout, rawFrameBytes)) {
          if (aborted || context.signal.aborted) throw abortError();
          const timestampMs = startAtMs + (frameIndex * 1000 * playbackRate) / fps;
          frameIndex++;
          yield {
            format: "gray8",
            pixels,
            timestampMs,
            pixelWidth: width,
            pixelHeight: height,
          };
        }
      } else {
        for await (const png of parsePngFrames(stdout, {
          maxFrameBytes,
          maxDimension: MAX_PNG_DIMENSION,
        })) {
          if (aborted || context.signal.aborted) throw abortError();
          const timestampMs = startAtMs + (frameIndex * 1000 * playbackRate) / fps;
          frameIndex++;
          const dimensions = pngDimensions(png);
          yield {
            png,
            timestampMs,
            pixelWidth: dimensions.width,
            pixelHeight: dimensions.height,
          };
        }
      }

      const exit = await closePromise;
      if (aborted || context.signal.aborted) throw abortError();
      if (spawnError) throw spawnError;
      if (exit.code !== 0) {
        const details = sanitizeProcessError(stderrTail);
        throw new Error(
          details
            ? `FFmpeg video decoding failed (${exit.code ?? exit.signal}): ${details}`
            : `FFmpeg video decoding failed (${exit.code ?? exit.signal})`,
        );
      }
    } catch (error) {
      if (!closed) terminate();
      await closePromise;
      if (aborted || context.signal.aborted) throw abortError();
      if (spawnError) throw spawnError;
      throw error;
    } finally {
      context.signal.removeEventListener("abort", onAbort);
      if (!closed) terminate();
    }
  };
}
