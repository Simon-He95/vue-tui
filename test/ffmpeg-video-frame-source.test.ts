import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildFfmpegVideoArgs,
  createFfmpegVideoFrameSource,
} from "../src/cli/video/ffmpeg-frame-source.js";
import { parsePngFrames } from "../src/cli/video/png-frame-parser.js";
import { parseRawFrames } from "../src/cli/video/raw-frame-parser.js";
import {
  buildYtDlpVideoArgs,
  createYtDlpVideoFrameSource,
} from "../src/cli/video/yt-dlp-frame-source.js";
import type { TVideoFrameSourceContext } from "../src/vue/video/types.js";

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({ spawn: spawnMock }));

const TINY_PNG = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    "base64",
  ),
);

async function* fragmented(bytes: Uint8Array, sizes: readonly number[]) {
  let offset = 0;
  let index = 0;
  while (offset < bytes.length) {
    const size = sizes[index++ % sizes.length] ?? 1;
    yield bytes.slice(offset, offset + size);
    offset += size;
  }
}

async function collectFrames(chunks: AsyncIterable<Uint8Array>): Promise<Uint8Array[]> {
  const frames: Uint8Array[] = [];
  for await (const frame of parsePngFrames(chunks, {
    maxFrameBytes: 1024 * 1024,
    maxDimension: 4096,
  })) {
    frames.push(frame);
  }
  return frames;
}

function context(src: string, preferredFormat: "png" | "gray8" = "png"): TVideoFrameSourceContext {
  return {
    src,
    signal: new AbortController().signal,
    maxFps: 12,
    pixelWidth: 320,
    pixelHeight: 180,
    startAtMs: 1500,
    playbackRate: 1,
    loop: false,
    preferredFormat,
  };
}

function fakeFfmpegProcess() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: PassThrough;
    stderr: PassThrough;
    kill: ReturnType<typeof vi.fn>;
  };
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = vi.fn((signal: string) => {
    child.stdout.end();
    child.stderr.end();
    queueMicrotask(() => child.emit("close", null, signal));
    return true;
  });
  return child;
}

describe("FFmpeg TVideo frame source", () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  it("parses arbitrarily fragmented concatenated PNG frames", async () => {
    const bytes = new Uint8Array(TINY_PNG.length * 2);
    bytes.set(TINY_PNG);
    bytes.set(TINY_PNG, TINY_PNG.length);

    const frames = await collectFrames(fragmented(bytes, [1, 2, 7, 31, 3]));

    expect(frames).toHaveLength(2);
    expect(frames[0]).toEqual(TINY_PNG);
    expect(frames[1]).toEqual(TINY_PNG);
    expect(frames[0]).not.toBe(frames[1]);
  });

  it("rejects a truncated PNG stream", async () => {
    await expect(collectFrames(fragmented(TINY_PNG.slice(0, -3), [5]))).rejects.toThrow(
      "truncated frame",
    );
  });

  it("parses fragmented fixed-size raw frames without retaining shared storage", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const frames: Uint8Array[] = [];

    for await (const frame of parseRawFrames(fragmented(bytes, [1, 5, 2]), 4)) {
      frames.push(frame);
    }

    expect(frames).toEqual([new Uint8Array([1, 2, 3, 4]), new Uint8Array([5, 6, 7, 8])]);
    expect(frames[0]).not.toBe(frames[1]);
  });

  it("rejects a truncated raw video stream", async () => {
    const collect = async () => {
      for await (const _frame of parseRawFrames(fragmented(new Uint8Array([1, 2, 3]), [2]), 4)) {
      }
    };

    await expect(collect()).rejects.toThrow("truncated frame");
  });

  it("passes an HTTPS source as one literal argv and bounds decode work", () => {
    const src = "https://example.com/video.mp4?token=a%26b&literal=$()";
    const args = buildFfmpegVideoArgs(context(src));
    const inputIndex = args.indexOf("-i");

    expect(args[inputIndex + 1]).toBe(src);
    expect(args.filter((arg) => arg === src)).toHaveLength(1);
    expect(args).toContain("http,https,httpproxy,tcp,tls");
    expect(args).toContain("-readrate");
    expect(args[args.indexOf("-readrate") + 1]).toBe("1");
    expect(args).toContain("1.5");
    expect(args[args.indexOf("-vf") + 1]).toBe(
      "setpts=PTS-STARTPTS,fps=12,realtime,scale=320:180:force_original_aspect_ratio=decrease:flags=fast_bilinear,pad=320:180:(ow-iw)/2:(oh-ih)/2",
    );
    expect(args).toContain("-compression_level");
  });

  it.each([1, 2, 3] as const)(
    "keeps the %sx wall-clock frame rate bounded while advancing media time",
    (playbackRate) => {
      const args = buildFfmpegVideoArgs({
        ...context("video.mp4"),
        playbackRate,
      });
      const filter = args[args.indexOf("-vf") + 1]!;
      const setpts =
        playbackRate === 1 ? "setpts=PTS-STARTPTS" : `setpts=(PTS-STARTPTS)/${playbackRate}`;

      expect(args[args.indexOf("-readrate") + 1]).toBe(String(playbackRate));
      expect(filter).toContain(`${setpts},fps=12,realtime`);
    },
  );

  it("loops input when requested by the source context", () => {
    const args = buildFfmpegVideoArgs({ ...context("video.mp4"), loop: true });

    expect(args.slice(args.indexOf("-stream_loop"), args.indexOf("-stream_loop") + 2)).toEqual([
      "-stream_loop",
      "-1",
    ]);
  });

  it("passes resolved HTTP headers to FFmpeg without allowing control characters", () => {
    const args = buildFfmpegVideoArgs(context("https://example.com/video.mp4"), {
      httpHeaders: {
        "User-Agent": "vue-tui-test",
        Accept: "video/*",
      },
    });

    expect(args[args.indexOf("-headers") + 1]).toBe(
      "User-Agent: vue-tui-test\r\nAccept: video/*\r\n",
    );
    expect(() =>
      buildFfmpegVideoArgs(context("https://example.com/video.mp4"), {
        httpHeaders: { Referer: "https://example.com\r\nX-Injected: yes" },
      }),
    ).toThrow("Invalid FFmpeg HTTP header");
    for (const value of ["value\0tail", "value\ttail", "value\u007ftail"]) {
      expect(() =>
        buildFfmpegVideoArgs(context("https://example.com/video.mp4"), {
          httpHeaders: { Referer: value },
        }),
      ).toThrow("Invalid FFmpeg HTTP header");
    }
  });

  it("builds a 360p30 video-only yt-dlp request for the default PNG context", () => {
    const src = "https://www.youtube.com/watch?v=aqz-KE-bpKQ&literal=$()";
    const args = buildYtDlpVideoArgs(src, { maxSourceHeight: 1080 }, context(src));

    expect(args.at(-2)).toBe("--");
    expect(args.at(-1)).toBe(src);
    expect(args.filter((arg) => arg === src)).toHaveLength(1);
    expect(args[args.indexOf("--format") + 1]).toBe(
      "bestvideo[height<=360][fps<=30][protocol^=http][vcodec^=avc1]/bestvideo[height<=360][fps<=30][protocol^=http]/bestvideo[height<=360][protocol^=http][vcodec^=avc1]/bestvideo[height<=360][protocol^=http]/best[height<=360][fps<=30][protocol^=http]/best[height<=360][protocol^=http]",
    );
    expect(args).toContain("--no-config");
    expect(args).toContain("--no-playlist");
    expect(args[args.indexOf("--print") + 1]).toContain("duration");
  });

  it("rounds gray8 source height upward, caps it, and preserves custom formats", () => {
    const src = "https://www.youtube.com/watch?v=aqz-KE-bpKQ";
    const grayContext = {
      ...context(src, "gray8"),
      pixelHeight: 145,
      maxFps: 30.1,
    };
    const rounded = buildYtDlpVideoArgs(src, {}, grayContext);
    const capped = buildYtDlpVideoArgs(
      src,
      { maxSourceHeight: 500 },
      {
        ...grayContext,
        pixelHeight: 600,
      },
    );
    const custom = buildYtDlpVideoArgs(src, { format: "worstvideo[protocol^=http]" }, grayContext);

    expect(rounded[rounded.indexOf("--format") + 1]).toContain("bestvideo[height<=240][fps<=31]");
    expect(capped[capped.indexOf("--format") + 1]).toContain("bestvideo[height<=500]");
    expect(custom[custom.indexOf("--format") + 1]).toBe("worstvideo[protocol^=http]");
  });

  it("caches a completed yt-dlp resolution across playback contexts", async () => {
    const ytDlp = fakeFfmpegProcess();
    const ffmpeg = fakeFfmpegProcess();
    const resumedFfmpeg = fakeFfmpegProcess();
    spawnMock
      .mockReturnValueOnce(ytDlp)
      .mockReturnValueOnce(ffmpeg)
      .mockReturnValueOnce(resumedFfmpeg);
    const source = createYtDlpVideoFrameSource({
      ytDlpPath: "/usr/local/bin/yt-dlp",
      ffmpegPath: "/usr/local/bin/ffmpeg",
      maxSourceHeight: 720,
    });
    const frames = await source(context("https://www.youtube.com/watch?v=aqz-KE-bpKQ"));
    const iterator = frames[Symbol.asyncIterator]();
    const first = iterator.next();
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());

    const [ytDlpExecutable, ytDlpArgs] = spawnMock.mock.calls[0]!;
    expect(ytDlpExecutable).toBe("/usr/local/bin/yt-dlp");
    expect(ytDlpArgs.at(-1)).toBe("https://www.youtube.com/watch?v=aqz-KE-bpKQ");
    expect(ytDlpArgs[ytDlpArgs.indexOf("--format") + 1]).toContain(
      "bestvideo[height<=360][fps<=30][protocol^=http][vcodec^=avc1]",
    );

    ytDlp.stdout.end(
      `${JSON.stringify({
        url: "https://rr.example.googlevideo.com/videoplayback?id=abc",
        http_headers: {
          "User-Agent": "yt-dlp-test",
          Accept: "text/html",
        },
        duration: 596.458,
      })}\n`,
    );
    ytDlp.stderr.end();
    ytDlp.emit("close", 0, null);

    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(2));
    const [ffmpegExecutable, ffmpegArgs] = spawnMock.mock.calls[1]!;
    expect(ffmpegExecutable).toBe("/usr/local/bin/ffmpeg");
    expect(ffmpegArgs[ffmpegArgs.indexOf("-i") + 1]).toBe(
      "https://rr.example.googlevideo.com/videoplayback?id=abc",
    );
    expect(ffmpegArgs[ffmpegArgs.indexOf("-headers") + 1]).toContain("User-Agent: yt-dlp-test\r\n");

    ffmpeg.stdout.write(TINY_PNG);
    await expect(first).resolves.toMatchObject({
      done: false,
      value: { pixelWidth: 1, pixelHeight: 1, durationMs: 596458 },
    });
    await iterator.return?.();
    expect(ffmpeg.kill).toHaveBeenCalledWith("SIGTERM");

    const resumedFrames = await source({
      ...context("https://www.youtube.com/watch?v=aqz-KE-bpKQ"),
      signal: new AbortController().signal,
      startAtMs: 4250,
      playbackRate: 3,
    });
    const resumedIterator = resumedFrames[Symbol.asyncIterator]();
    const resumedFirst = resumedIterator.next();
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(3));

    const [resumedExecutable, resumedArgs] = spawnMock.mock.calls[2]!;
    expect(resumedExecutable).toBe("/usr/local/bin/ffmpeg");
    expect(resumedArgs[resumedArgs.indexOf("-i") + 1]).toBe(
      "https://rr.example.googlevideo.com/videoplayback?id=abc",
    );
    expect(resumedArgs[resumedArgs.indexOf("-ss") + 1]).toBe("4.25");
    expect(resumedArgs[resumedArgs.indexOf("-readrate") + 1]).toBe("3");

    resumedFfmpeg.stdout.write(TINY_PNG);
    await expect(resumedFirst).resolves.toMatchObject({
      done: false,
      value: { timestampMs: 4250, durationMs: 596458 },
    });
    await resumedIterator.return?.();
    expect(resumedFfmpeg.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("aborts yt-dlp resolution before FFmpeg starts", async () => {
    const ytDlp = fakeFfmpegProcess();
    spawnMock.mockReturnValueOnce(ytDlp);
    const controller = new AbortController();
    const source = createYtDlpVideoFrameSource();
    const frames = await source({
      ...context("https://www.youtube.com/watch?v=aqz-KE-bpKQ"),
      signal: controller.signal,
    });
    const next = frames[Symbol.asyncIterator]().next();
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());

    controller.abort();

    await expect(next).rejects.toMatchObject({ name: "AbortError" });
    expect(ytDlp.kill).toHaveBeenCalledWith("SIGTERM");
    expect(spawnMock).toHaveBeenCalledOnce();
  });

  it("evicts a resolved URL after an FFmpeg decode failure", async () => {
    const ytDlp = fakeFfmpegProcess();
    const ffmpeg = fakeFfmpegProcess();
    const retryYtDlp = fakeFfmpegProcess();
    spawnMock
      .mockReturnValueOnce(ytDlp)
      .mockReturnValueOnce(ffmpeg)
      .mockReturnValueOnce(retryYtDlp);
    const src = "https://www.youtube.com/watch?v=aqz-KE-bpKQ";
    const source = createYtDlpVideoFrameSource();
    const frames = await source(context(src));
    const next = frames[Symbol.asyncIterator]().next();
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());

    ytDlp.stdout.end(`${JSON.stringify({ url: "https://rr.example.googlevideo.com/expired" })}\n`);
    ytDlp.stderr.end();
    ytDlp.emit("close", 0, null);
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(2));

    ffmpeg.stdout.end();
    ffmpeg.stderr.end("HTTP error 403 Forbidden");
    ffmpeg.emit("close", 1, null);
    await expect(next).rejects.toThrow("HTTP error 403 Forbidden");

    const retryController = new AbortController();
    const retryFrames = await source({
      ...context(src),
      signal: retryController.signal,
    });
    const retryNext = retryFrames[Symbol.asyncIterator]().next();
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(3));
    expect(spawnMock.mock.calls[2]![0]).toBe("yt-dlp");

    retryController.abort();
    await expect(retryNext).rejects.toMatchObject({ name: "AbortError" });
    expect(retryYtDlp.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("rejects yt-dlp metadata with an array of HTTP headers", async () => {
    const ytDlp = fakeFfmpegProcess();
    spawnMock.mockReturnValueOnce(ytDlp);
    const source = createYtDlpVideoFrameSource();
    const frames = await source(context("https://www.youtube.com/watch?v=aqz-KE-bpKQ"));
    const next = frames[Symbol.asyncIterator]().next();
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());

    ytDlp.stdout.end(
      `${JSON.stringify({
        url: "https://rr.example.googlevideo.com/videoplayback?id=abc",
        http_headers: [],
      })}\n`,
    );
    ytDlp.stderr.end();
    ytDlp.emit("close", 0, null);

    await expect(next).rejects.toThrow("yt-dlp returned invalid video metadata");
    expect(spawnMock).toHaveBeenCalledOnce();
  });

  it("does not throttle a live input with readrate", () => {
    const args = buildFfmpegVideoArgs(context("https://example.com/live.m3u8"), { live: true });
    expect(args).not.toContain("-readrate");
    expect(args[args.indexOf("-vf") + 1]).toContain("realtime");
  });

  it("floors a positive sub-millisecond frame rate instead of serializing fps=0", () => {
    const args = buildFfmpegVideoArgs(
      { ...context("https://example.com/live.m3u8"), maxFps: 0.0001 },
      { live: true },
    );

    expect(args[args.indexOf("-vf") + 1]).toContain("fps=0.001");
  });

  it("requests bounded gray8 raw frames for the Unicode fallback", () => {
    const args = buildFfmpegVideoArgs(context("video.mp4", "gray8"));

    expect(args[args.indexOf("-f") + 1]).toBe("rawvideo");
    expect(args[args.indexOf("-c:v") + 1]).toBe("rawvideo");
    expect(args[args.indexOf("-pix_fmt") + 1]).toBe("gray");
    expect(args).not.toContain("image2pipe");
    expect(args).not.toContain("-compression_level");
  });

  it("rejects unexpected FFmpeg input protocols", () => {
    expect(() => buildFfmpegVideoArgs(context("pipe:0"))).toThrow(
      "Unsupported TVideo source protocol: pipe",
    );
  });

  it("terminates FFmpeg when the frame consumer stops early", async () => {
    const child = fakeFfmpegProcess();
    spawnMock.mockReturnValueOnce(child);
    const source = createFfmpegVideoFrameSource();
    const frames = await source(context("video.mp4"));
    const iterator = frames[Symbol.asyncIterator]();
    const first = iterator.next();
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());

    child.stdout.write(TINY_PNG);
    await expect(first).resolves.toMatchObject({ done: false });
    await iterator.return?.();

    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("waits for close and prefers a spawn error after a stdout iteration failure", async () => {
    const child = fakeFfmpegProcess();
    child.kill.mockImplementation(() => true);
    spawnMock.mockReturnValueOnce(child);
    const source = createFfmpegVideoFrameSource();
    const frames = await source(context("video.mp4"));
    const next = frames[Symbol.asyncIterator]().next();
    const observed = next.then(
      () => new Error("expected frame iteration to reject"),
      (error: unknown) => error,
    );
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());

    const spawnFailure = Object.assign(new Error("spawn ffmpeg ENOENT"), { code: "ENOENT" });
    child.stdout.destroy(new Error("Premature close"));
    await vi.waitFor(() => expect(child.kill).toHaveBeenCalledWith("SIGTERM"));
    child.emit("error", spawnFailure);
    child.stderr.end();
    child.emit("close", -2, null);

    expect(await observed).toBe(spawnFailure);
  });

  it.each([1, 2, 3] as const)(
    "emits gray8 frames with fixed dimensions and %sx media timestamps",
    async (playbackRate) => {
      const child = fakeFfmpegProcess();
      spawnMock.mockReturnValueOnce(child);
      const source = createFfmpegVideoFrameSource();
      const frames = await source({
        ...context("video.mp4", "gray8"),
        pixelWidth: 2,
        pixelHeight: 2,
        playbackRate,
      });
      const iterator = frames[Symbol.asyncIterator]();
      const first = iterator.next();
      await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());

      child.stdout.write(new Uint8Array([0, 64, 128, 255, 255, 128, 64, 0]));

      await expect(first).resolves.toEqual({
        done: false,
        value: {
          format: "gray8",
          pixels: new Uint8Array([0, 64, 128, 255]),
          timestampMs: 1500,
          pixelWidth: 2,
          pixelHeight: 2,
        },
      });
      await expect(iterator.next()).resolves.toEqual({
        done: false,
        value: {
          format: "gray8",
          pixels: new Uint8Array([255, 128, 64, 0]),
          timestampMs: 1500 + (playbackRate * 1000) / 12,
          pixelWidth: 2,
          pixelHeight: 2,
        },
      });
      await iterator.return?.();
    },
  );

  it("rejects an oversized gray8 frame before spawning FFmpeg", async () => {
    const source = createFfmpegVideoFrameSource({ maxFrameBytes: 3 });
    const frames = await source({
      ...context("video.mp4", "gray8"),
      pixelWidth: 2,
      pixelHeight: 2,
    });

    await expect(frames[Symbol.asyncIterator]().next()).rejects.toThrow(
      "raw video frame exceeded 3 bytes",
    );
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("reports AbortError when abort truncates an in-flight PNG", async () => {
    const child = fakeFfmpegProcess();
    spawnMock.mockReturnValueOnce(child);
    const controller = new AbortController();
    const source = createFfmpegVideoFrameSource();
    const frames = await source({
      ...context("video.mp4"),
      signal: controller.signal,
    });
    const next = frames[Symbol.asyncIterator]().next();
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());

    child.stdout.write(TINY_PNG.subarray(0, 20));
    controller.abort();

    await expect(next).rejects.toMatchObject({ name: "AbortError" });
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });
});
