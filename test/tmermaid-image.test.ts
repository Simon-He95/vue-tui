import { afterEach, describe, expect, it, vi } from "vitest";
import { inflateSync } from "node:zlib";
import { createStdoutRenderer } from "../src/cli.js";
import {
  clearMermaidImageCache,
  getCachedMermaidImage,
  getMermaidImage,
  isMermaidImageRendererReady,
  resolveMermaidSvgForResvg,
  setMermaidImageRasterizer,
  subscribeMermaidImage,
  TMermaidImage,
  TMermaid,
  type TMermaidRenderer,
  type TuiMermaidImageRasterizer,
} from "../src/mermaid.js";
import { TRenderPlane, TText, TView } from "../src/vue.js";
import {
  defineComponent,
  h,
  mountTerminal,
  nextTick,
  ref,
  useTerminal,
} from "./ui-regressions-support.js";

type MountedTerminal = Awaited<ReturnType<typeof mountTerminal>>;

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

const SAMPLE_SOURCE = "graph LR\n  A --> B";

function rowText(mounted: MountedTerminal, y: number): string {
  return mounted.terminal
    .getRow(y)
    .map((cell) => cell.ch)
    .join("")
    .trimEnd();
}

function clickCell(mounted: MountedTerminal, cellX: number, cellY: number): void {
  mounted.container()?.dispatchEvent(
    new MouseEvent("click", {
      clientX: cellX * 10 + 1,
      clientY: cellY * 20 + 1,
      bubbles: true,
    }),
  );
}

function lastTransmissionCells(stdout: string): { cols: number; rows: number } | null {
  const matches = [...stdout.matchAll(/a=T[^\u001B\\]*\bc=(\d+),r=(\d+)/g)];
  if (matches.length === 0) return null;
  const last = matches[matches.length - 1]!;
  return { cols: Number(last[1]), rows: Number(last[2]) };
}

function countTransmissionSize(stdout: string, cols: number, rows: number): number {
  return [...stdout.matchAll(/a=T[^\u001B\\]*\bc=(\d+),r=(\d+)/g)].filter(
    (match) => Number(match[1]) === cols && Number(match[2]) === rows,
  ).length;
}

function countTransmissions(stdout: string): number {
  return [...stdout.matchAll(/a=T/g)].length;
}

function lastPlacementCells(stdout: string): { cols: number; rows: number } | null {
  const matches = [...stdout.matchAll(/a=p[^\u001B\\]*\bc=(\d+),r=(\d+)/g)];
  if (matches.length === 0) return null;
  const last = matches[matches.length - 1]!;
  return { cols: Number(last[1]), rows: Number(last[2]) };
}

function setDeterministicMetrics(mounted: MountedTerminal, cols: number, rows: number): void {
  const container = mounted.container();
  const events = mounted.events();
  if (!container || !events) throw new Error("expected mounted terminal events");
  const cellWidth = 10;
  const cellHeight = 20;
  events.setMetrics({ cellWidth, cellHeight });
  container.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      x: 0,
      y: 0,
      width: cols * cellWidth,
      height: rows * cellHeight,
      right: cols * cellWidth,
      bottom: rows * cellHeight,
      toJSON() {},
    }) as any;
}

async function settle(mounted: MountedTerminal): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();
    mounted.scheduler()?.flushNow();
  }
}

async function settleAdaptive(mounted: MountedTerminal): Promise<void> {
  // The built-in beautiful-mermaid bridge resolves through a dynamic import;
  // allow enough macrotask ticks for the module to load and render.
  for (let i = 0; i < 24; i++) {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();
    mounted.scheduler()?.flushNow();
  }
}

/** Minimal RGBA8 PNG decoder (node:zlib only) used to inspect rasterizer output. */
function decodePngRgba(base64: string): {
  width: number;
  height: number;
  pixels: Buffer;
} {
  const buffer = Buffer.from(base64, "base64");
  const chunks: Array<{ type: string; data: Buffer }> = [];
  let offset = 8;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    chunks.push({ type, data: buffer.subarray(offset + 8, offset + 8 + length) });
    offset += 12 + length;
  }

  const ihdr = chunks.find((chunk) => chunk.type === "IHDR");
  if (!ihdr) throw new Error("PNG missing IHDR");
  const width = ihdr.data.readUInt32BE(0);
  const height = ihdr.data.readUInt32BE(4);
  const bitDepth = ihdr.data[8]!;
  const colorType = ihdr.data[9]!;
  if (bitDepth !== 8 || colorType !== 6) {
    throw new Error(`unsupported PNG format bitDepth=${bitDepth} colorType=${colorType}`);
  }

  const idat = Buffer.concat(
    chunks.filter((chunk) => chunk.type === "IDAT").map((chunk) => chunk.data),
  );
  const raw = inflateSync(idat);

  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const pixels = Buffer.alloc(height * stride);

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = pixels.subarray(y * stride, (y + 1) * stride);

    for (let x = 0; x < stride; x++) {
      const rawByte = line[x]!;
      const left = x >= bytesPerPixel ? out[x - bytesPerPixel]! : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x]! : 0;
      const upLeft =
        x >= bytesPerPixel && y > 0 ? pixels[(y - 1) * stride + x - bytesPerPixel]! : 0;

      let value = rawByte;
      if (filter === 1) value = (rawByte + left) & 0xff;
      else if (filter === 2) value = (rawByte + up) & 0xff;
      else if (filter === 3) value = (rawByte + Math.floor((left + up) / 2)) & 0xff;
      else if (filter === 4) {
        const predictor = left + up - upLeft;
        const pa = Math.abs(predictor - left);
        const pb = Math.abs(predictor - up);
        const pc = Math.abs(predictor - upLeft);
        const prediction = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
        value = (rawByte + prediction) & 0xff;
      }
      out[x] = value;
    }
  }

  return { width, height, pixels };
}

async function withEnv<T>(
  updates: Record<string, string | undefined>,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(updates)) {
    previous.set(key, process.env[key]);
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of previous) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function installNavigatorClipboard(writeText: ReturnType<typeof vi.fn>): () => void {
  const originalClipboard = Object.getOwnPropertyDescriptor(globalThis.navigator, "clipboard");
  Object.defineProperty(globalThis.navigator, "clipboard", {
    value: { readText: vi.fn().mockResolvedValue(""), writeText },
    configurable: true,
  });
  return () => {
    if (originalClipboard) {
      Object.defineProperty(globalThis.navigator, "clipboard", originalClipboard);
    } else {
      delete (globalThis.navigator as any).clipboard;
    }
  };
}

afterEach(() => {
  setMermaidImageRasterizer(null);
  clearMermaidImageCache();
});

describe("resolveMermaidSvgForResvg", () => {
  // Mirrors the CSS variable + color-mix() output of beautiful-mermaid 1.x.
  const BEAUTIFUL_STYLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100" style="--bg:#1e1e2e;--fg:#f8f8f2">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter&amp;display=swap');
  text { font-family: 'Inter', sans-serif; }
  svg {
    --_text: var(--fg);
    --_text-sec: var(--muted, color-mix(in srgb, var(--fg) 60%, var(--bg)));
    --_line: var(--line, color-mix(in srgb, var(--fg) 50%, var(--bg)));
    --_node-fill: var(--surface, color-mix(in srgb, var(--fg) 3%, var(--bg)));
    --_arrow: color-mix(in srgb, var(--fg) 85%, var(--bg));
  }
</style>
<marker id="arrowhead"><polygon points="0 0, 8 2.5, 0 5" fill="var(--_arrow)" /></marker>
<rect fill="var(--_node-fill)" stroke="var(--_line)" width="50" height="20" />
<text fill="var(--_text)" font-size="13">Hi</text>
<text fill="var(--_text-sec)" font-size="11">sec</text>
</svg>`;

  it("inlines CSS variables and color-mix() into concrete hex colors", () => {
    const resolved = resolveMermaidSvgForResvg(BEAUTIFUL_STYLE_SVG, "#1e1e2e", "#f8f8f2");

    expect(resolved).not.toContain("var(");
    expect(resolved).not.toContain("color-mix(");
    expect(resolved).not.toMatch(/<style/i);

    // --_text = fg
    expect(resolved).toContain('fill="#f8f8f2"');
    // --_node-fill = 3% fg over bg
    expect(resolved).toContain('fill="#252534"');
    // --_line = 50% fg over bg
    expect(resolved).toContain('stroke="#8b8b90"');
    // --_arrow = 85% fg over bg
    expect(resolved).toContain('fill="#d7d7d5"');
  });

  it("uses the root style --bg/--fg values over the fallback colors", () => {
    const resolved = resolveMermaidSvgForResvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" style="--bg:#000000;--fg:#ffffff"><rect fill="var(--_node-fill)" width="10" height="10" /></svg><style>svg{--_node-fill: color-mix(in srgb, var(--fg) 50%, var(--bg));}</style>',
      "#1e1e2e",
      "#f8f8f2",
    );

    // 50% of #ffffff over #000000 is #808080.
    expect(resolved).toContain('fill="#808080"');
  });

  it("resolves nested var() fallbacks containing color-mix()", () => {
    const resolved = resolveMermaidSvgForResvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" style="--bg:#000000;--fg:#ffffff"><text fill="var(--muted, color-mix(in srgb, var(--fg) 25%, var(--bg)))">x</text></svg>',
      "#000000",
      "#ffffff",
    );

    expect(resolved).not.toContain("var(");
    // 25% white over black = #404040
    expect(resolved).toContain('fill="#404040"');
  });

  it("strips nested style sequences until no <style remains", () => {
    // A single replace() pass would turn "<sty<style>x</style>le>" into
    // "<style>", which still injects a style element. Sanitization must loop
    // until stable so no style element survives.
    const resolved = resolveMermaidSvgForResvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><sty<style>x</style>le><rect width="10" height="10" /></svg>',
      "#000000",
      "#ffffff",
    );

    expect(resolved).not.toMatch(/<style/i);
    expect(resolved).toContain("<rect");
  });

  it("drops a lone <style> opener that has no closing tag", () => {
    const resolved = resolveMermaidSvgForResvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><style><rect width="10" height="10" /></svg>',
      "#000000",
      "#ffffff",
    );

    expect(resolved).not.toMatch(/<style/i);
    expect(resolved).toContain("<rect");
  });

  it("does not corrupt surrounding markup on a malformed unterminated opener", () => {
    const resolved = resolveMermaidSvgForResvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><style<rect width="10" height="10" /></svg>',
      "#000000",
      "#ffffff",
    );

    expect(resolved).toContain("<rect");
    expect(resolved).toContain("</svg>");
  });

  it("does not ReDoS on adversarial style or declaration input", () => {
    // Long runs of "<style" / "--" / spaces with no terminators used to make
    // the previous regexes backtrack quadratically.
    const styleFlood = `<style>${"<style".repeat(30_000)}</style>`;
    const dashFlood = `<style>svg{${"--".repeat(30_000)}}</style>`;
    const spaceFlood = `<style>svg{--x: ${" ".repeat(30_000)}}</style>`;
    const resolved = resolveMermaidSvgForResvg(
      `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">${styleFlood}${dashFlood}${spaceFlood}<rect width="10" height="10" /></svg>`,
      "#000000",
      "#ffffff",
    );

    expect(resolved).not.toMatch(/<style/i);
    expect(resolved).toContain("<rect");
  });
});

describe("mermaid-image rasterizer", () => {
  it("rasterizes through a custom rasterizer and caches by source + options", async () => {
    const rasterizer = vi.fn<TuiMermaidImageRasterizer>(async () => ({
      base64: TINY_PNG_BASE64,
      widthCells: 6,
      heightCells: 3,
      naturalWidth: 48,
      naturalHeight: 24,
    }));
    setMermaidImageRasterizer(rasterizer);
    expect(isMermaidImageRendererReady()).toBe(true);

    const first = await getMermaidImage(SAMPLE_SOURCE);
    const second = await getMermaidImage(SAMPLE_SOURCE);

    expect(rasterizer).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    expect(first?.base64).toBe(TINY_PNG_BASE64);
    expect(getCachedMermaidImage(SAMPLE_SOURCE)).toEqual(first);

    // A different cell metric produces a different cache entry.
    await getMermaidImage(SAMPLE_SOURCE, { scale: 3 });
    expect(rasterizer).toHaveBeenCalledTimes(2);

    clearMermaidImageCache();
    expect(getCachedMermaidImage(SAMPLE_SOURCE)).toBeNull();
  });

  it("passes normalized image options to the rasterizer", async () => {
    const rasterizer = vi.fn<TuiMermaidImageRasterizer>(async () => ({
      base64: TINY_PNG_BASE64,
      widthCells: 1,
      heightCells: 1,
    }));
    setMermaidImageRasterizer(rasterizer);

    await getMermaidImage(SAMPLE_SOURCE, { cellWidthPx: 7, fg: "#ffffff", maxWidthCells: 40 });

    expect(rasterizer).toHaveBeenCalledTimes(1);
    expect(rasterizer.mock.calls[0]![0]).toBe(SAMPLE_SOURCE);
    expect(rasterizer.mock.calls[0]![1]).toMatchObject({
      cellWidthPx: 7,
      cellHeightPx: 16,
      scale: 2,
      fg: "#ffffff",
      maxWidthCells: 40,
      maxHeightCells: 0,
      padding: 40,
    });
  });

  it("notifies subscribers when a new image completes", async () => {
    const rasterizer = vi.fn<TuiMermaidImageRasterizer>(async () => ({
      base64: TINY_PNG_BASE64,
      widthCells: 4,
      heightCells: 2,
    }));
    setMermaidImageRasterizer(rasterizer);

    const listener = vi.fn();
    const unsubscribe = subscribeMermaidImage(listener);
    try {
      await getMermaidImage(SAMPLE_SOURCE);
      expect(listener).toHaveBeenCalledTimes(1);

      // Cache hit does not notify again.
      await getMermaidImage(SAMPLE_SOURCE);
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribe();
    }
  });

  it("remembers failed sources and returns null without re-rasterizing", async () => {
    const rasterizer = vi.fn<TuiMermaidImageRasterizer>(async () => null);
    setMermaidImageRasterizer(rasterizer);

    expect(await getMermaidImage(SAMPLE_SOURCE)).toBeNull();
    expect(await getMermaidImage(SAMPLE_SOURCE)).toBeNull();
    expect(rasterizer).toHaveBeenCalledTimes(1);
  });

  it("rasterizes a readable (non-black) PNG through the built-in pipeline", async () => {
    // No custom rasterizer: the built-in beautiful-mermaid + resvg stack loads,
    // and the SVG CSS variables / color-mix() must be inlined so the diagram
    // is not rasterized as a solid black box.
    const result = await getMermaidImage(SAMPLE_SOURCE);

    expect(result).not.toBeNull();
    if (!result) return;

    const { width, height, pixels } = decodePngRgba(result.base64);
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);

    let transparent = 0;
    let light = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const alpha = pixels[i + 3]!;
      if (alpha < 16) {
        transparent++;
        continue;
      }
      const luminance = 0.299 * pixels[i]! + 0.587 * pixels[i + 1]! + 0.114 * pixels[i + 2]!;
      if (luminance > 150) light++;
    }

    const total = width * height;
    // Transparent background, with light (readable) diagram content.
    expect(transparent / total).toBeGreaterThan(0.5);
    expect(light).toBeGreaterThan(30);
  });
});

describe("TMermaidImage", () => {
  it("shows the raw source inside the box when the terminal has no graphics protocol", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TMermaidImage, {
          x: 0,
          y: 0,
          w: 24,
          content: SAMPLE_SOURCE,
        }),
      32,
      6,
    );

    try {
      await settle(mounted);

      expect(rowText(mounted, 0)).toContain("mermaid");
      expect(rowText(mounted, 0)).toContain("copy");
      expect(rowText(mounted, 1)).toContain("graph LR");
      expect(rowText(mounted, 2)).toContain("A --> B");
      expect(rowText(mounted, 3)).toBe("└──────────────────────┘");
    } finally {
      mounted.unmount();
    }
  });

  it("emits a Kitty graphics frame when the terminal supports graphics", async () => {
    await withEnv(
      {
        KITTY_WINDOW_ID: "vue-tui-test",
        TERM: "xterm-kitty",
        TERM_PROGRAM: "kitty",
        CI: undefined,
        TMUX: undefined,
        VUE_TUI_GRAPHICS_FORCE: "1",
      },
      async () => {
        setMermaidImageRasterizer(async () => ({
          base64: TINY_PNG_BASE64,
          widthCells: 10,
          heightCells: 3,
          naturalWidth: 80,
          naturalHeight: 24,
        }));

        const mounted = await mountTerminal(
          () =>
            h(TMermaidImage, {
              x: 0,
              y: 0,
              w: 20,
              content: SAMPLE_SOURCE,
            }),
          32,
          8,
        );

        let stdout = "";
        const renderer = createStdoutRenderer(mounted.terminal, {
          output: {
            isTTY: true,
            write(chunk: string) {
              stdout += chunk;
            },
          },
          clear: false,
          hideCursor: false,
          altScreen: false,
          terminalGraphics: { protocol: "kitty", force: true },
        });

        try {
          await settle(mounted);
          (renderer as any).render(undefined, true);

          // Kitty image protocol frames are APC sequences beginning with ESC_G and ending in ST.
          expect(stdout).toContain("\u001B_G");
          expect(stdout).toContain("\u001B\\");
          // The box chrome stays visible with the raw source no longer shown.
          expect(rowText(mounted, 0)).toContain("mermaid");
        } finally {
          renderer.dispose();
          mounted.unmount();
        }
      },
    );
  });

  it("copies the full raw mermaid source when clicking the copy button", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const restoreClipboard = installNavigatorClipboard(writeText);
    const onCopy = vi.fn();

    try {
      const cols = 32;
      const rows = 6;
      const mounted = await mountTerminal(
        () =>
          h(TMermaidImage, {
            x: 0,
            y: 0,
            w: 24,
            content: SAMPLE_SOURCE,
            onCopy,
          }),
        cols,
        rows,
      );

      try {
        await settle(mounted);
        setDeterministicMetrics(mounted, cols, rows);
        clickCell(mounted, 22, 0);
        await settle(mounted);

        expect(writeText).toHaveBeenCalledWith(SAMPLE_SOURCE);
        expect(onCopy).toHaveBeenCalledWith({ text: SAMPLE_SOURCE, ok: true });
        expect(rowText(mounted, 0)).toContain("copied");
      } finally {
        mounted.unmount();
      }
    } finally {
      restoreClipboard();
    }
  });

  it("keeps copy-on-click for the raw-source fallback when no image is rendered", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const restoreClipboard = installNavigatorClipboard(writeText);
    const onPreview = vi.fn();

    try {
      const cols = 32;
      const rows = 8;
      const mounted = await mountTerminal(
        () =>
          h(TMermaidImage, {
            x: 0,
            y: 0,
            w: 24,
            content: SAMPLE_SOURCE,
            onPreview,
          }),
        cols,
        rows,
      );

      try {
        await settle(mounted);
        setDeterministicMetrics(mounted, cols, rows);
        clickCell(mounted, 5, 2);
        await settle(mounted);

        expect(writeText).toHaveBeenCalledWith(SAMPLE_SOURCE);
        expect(onPreview).not.toHaveBeenCalled();
        expect(rowText(mounted, 1)).not.toContain("mermaid preview");
      } finally {
        mounted.unmount();
      }
    } finally {
      restoreClipboard();
    }
  });

  it("opens a larger preview when clicking the rendered image area, and Escape closes it", async () => {
    await withEnv(
      {
        KITTY_WINDOW_ID: "vue-tui-test",
        TERM: "xterm-kitty",
        TERM_PROGRAM: "kitty",
        CI: undefined,
        TMUX: undefined,
        VUE_TUI_GRAPHICS_FORCE: "1",
      },
      async () => {
        setMermaidImageRasterizer(async () => ({
          base64: TINY_PNG_BASE64,
          widthCells: 10,
          heightCells: 3,
          naturalWidth: 80,
          naturalHeight: 24,
        }));

        const writeText = vi.fn().mockResolvedValue(undefined);
        const restoreClipboard = installNavigatorClipboard(writeText);
        const onCopy = vi.fn();
        const onPreview = vi.fn();

        try {
          const cols = 32;
          const rows = 8;
          const mounted = await mountTerminal(
            () => [
              h(TRenderPlane, { plane: "transcript" }, () =>
                h(TView, { x: 0, y: 0, w: 24, h: 7, zIndex: 0 }, () =>
                  h(TMermaidImage, {
                    x: 0,
                    y: 0,
                    w: 20,
                    content: SAMPLE_SOURCE,
                    onCopy,
                    onPreview,
                  }),
                ),
              ),
              h(TRenderPlane, { plane: "chrome" }, () =>
                h(TView, { x: 0, y: 7, w: 20, h: 1, zIndex: 20 }, () =>
                  h(TText, {
                    x: 0,
                    y: 0,
                    w: 20,
                    value: "background-row",
                    style: { fg: "cyan" },
                  }),
                ),
              ),
            ],
            cols,
            rows,
          );

          let stdout = "";
          const stdoutRenderer = createStdoutRenderer(mounted.terminal, {
            output: {
              isTTY: true,
              write(chunk: string) {
                stdout += chunk;
              },
            },
            clear: false,
            hideCursor: false,
            altScreen: false,
            terminalGraphics: { protocol: "kitty", force: true },
          });

          try {
            await settle(mounted);
            setDeterministicMetrics(mounted, cols, rows);
            (stdoutRenderer as any).render(undefined, true);
            const inline = lastTransmissionCells(stdout);
            expect(inline).not.toBeNull();
            const inlineTransmissions = countTransmissions(stdout);

            // Click inside the content area (below the header row), on the image.
            clickCell(mounted, 5, 2);
            await settle(mounted);
            (stdoutRenderer as any).render(undefined, true);

            // The preview is a placement of the raster the inline drawing
            // already sent: it must not upload the PNG a second time.
            const preview = lastPlacementCells(stdout);
            expect(preview).not.toBeNull();
            expect(preview!.cols).toBeGreaterThan(inline!.cols);
            expect(preview!.rows).toBeGreaterThanOrEqual(inline!.rows);
            expect(countTransmissions(stdout)).toBe(inlineTransmissions);
            expect(rowText(mounted, 0)).toContain("mermaid preview");
            expect(rowText(mounted, 7)).not.toContain("background-row");
            expect(onPreview).toHaveBeenCalledWith({ text: SAMPLE_SOURCE, open: true });
            expect(onCopy).not.toHaveBeenCalled();
            expect(writeText).not.toHaveBeenCalled();

            mounted.container()?.dispatchEvent(
              new KeyboardEvent("keydown", {
                key: "Escape",
                code: "Escape",
                bubbles: true,
                cancelable: true,
              }),
            );
            await settle(mounted);
            (stdoutRenderer as any).render(undefined, true);

            expect(rowText(mounted, 0)).not.toContain("mermaid preview");
            expect(rowText(mounted, 7)).toContain("background-row");
            // Closing moves the placement back; the raster stays in the terminal.
            expect(lastPlacementCells(stdout)).toEqual(inline);
            expect(countTransmissions(stdout)).toBe(inlineTransmissions);
            expect(onPreview).toHaveBeenLastCalledWith({ text: SAMPLE_SOURCE, open: false });
            expect(writeText).not.toHaveBeenCalled();
          } finally {
            stdoutRenderer.dispose();
            mounted.unmount();
          }
        } finally {
          restoreClipboard();
        }
      },
    );
  });

  it("hides other mermaid images under the preview and restores them without re-sending PNGs", async () => {
    await withEnv(
      {
        KITTY_WINDOW_ID: "vue-tui-test",
        TERM: "xterm-kitty",
        TERM_PROGRAM: "kitty",
        CI: undefined,
        TMUX: undefined,
        VUE_TUI_GRAPHICS_FORCE: "1",
      },
      async () => {
        setMermaidImageRasterizer(async () => ({
          base64: TINY_PNG_BASE64,
          widthCells: 10,
          heightCells: 3,
          naturalWidth: 80,
          naturalHeight: 24,
        }));

        const cols = 32;
        const rows = 16;
        const mounted = await mountTerminal(
          () => [
            h(TMermaidImage, {
              x: 0,
              y: 0,
              w: 20,
              content: SAMPLE_SOURCE,
            }),
            h(TMermaidImage, {
              x: 0,
              y: 8,
              w: 20,
              content: SAMPLE_SOURCE,
            }),
          ],
          cols,
          rows,
        );

        let stdout = "";
        const stdoutRenderer = createStdoutRenderer(mounted.terminal, {
          output: {
            isTTY: true,
            write(chunk: string) {
              stdout += chunk;
            },
          },
          clear: false,
          hideCursor: false,
          altScreen: false,
          terminalGraphics: { protocol: "kitty", force: true },
        });

        try {
          await settle(mounted);
          setDeterministicMetrics(mounted, cols, rows);
          (stdoutRenderer as any).render(undefined, true);
          expect(countTransmissionSize(stdout, 10, 3)).toBe(2);
          const inlineTransmissions = countTransmissions(stdout);
          const openPhaseStart = stdout.length;

          clickCell(mounted, 5, 2);
          await settle(mounted);
          (stdoutRenderer as any).render(undefined, true);
          const openPhase = stdout.slice(openPhaseStart);

          expect(rowText(mounted, 0)).toContain("mermaid preview");
          // The preview re-places the raster it was opened from, and neither
          // inline diagram is retransmitted behind the lightbox.
          expect(lastPlacementCells(stdout)).toEqual({ cols: 30, rows: 9 });
          expect(countTransmissionSize(stdout, 10, 3)).toBe(2);
          expect(countTransmissions(stdout)).toBe(inlineTransmissions);
          expect(openPhase).not.toContain("a=T");
          // Hiding the covered diagrams removes placements only: the kitty
          // rasters stay so closing the preview never re-uploads them.
          expect(openPhase).toContain("a=d,d=i,");
          expect(openPhase).not.toContain("d=I");

          mounted.container()?.dispatchEvent(
            new KeyboardEvent("keydown", {
              key: "Escape",
              code: "Escape",
              bubbles: true,
              cancelable: true,
            }),
          );
          await settle(mounted);
          (stdoutRenderer as any).render(undefined, true);

          expect(rowText(mounted, 0)).not.toContain("mermaid preview");
          // Both inline diagrams come back as placement draws over the rasters
          // the terminal still holds.
          expect(lastPlacementCells(stdout)).toEqual({ cols: 10, rows: 3 });
          expect(countTransmissions(stdout)).toBe(inlineTransmissions);
        } finally {
          stdoutRenderer.dispose();
          mounted.unmount();
        }
      },
    );
  });

  it("closes the lightbox and restores the inline drawing when the source changes", async () => {
    await withEnv(
      {
        KITTY_WINDOW_ID: "vue-tui-test",
        TERM: "xterm-kitty",
        TERM_PROGRAM: "kitty",
        CI: undefined,
        TMUX: undefined,
        VUE_TUI_GRAPHICS_FORCE: "1",
      },
      async () => {
        setMermaidImageRasterizer(async () => ({
          base64: TINY_PNG_BASE64,
          widthCells: 10,
          heightCells: 3,
          naturalWidth: 80,
          naturalHeight: 24,
        }));

        const source = ref(SAMPLE_SOURCE);
        const cols = 32;
        // Tall enough that the lightbox fit (30x9) differs from the inline fit
        // (20x6), so the assertions below really identify the fullscreen
        // placement.
        const rows = 16;
        const mounted = await mountTerminal(
          () => h(TMermaidImage, { x: 0, y: 0, w: 20, content: source.value }),
          cols,
          rows,
        );

        let stdout = "";
        const stdoutRenderer = createStdoutRenderer(mounted.terminal, {
          output: {
            isTTY: true,
            write(chunk: string) {
              stdout += chunk;
            },
          },
          clear: false,
          hideCursor: false,
          altScreen: false,
          terminalGraphics: { protocol: "kitty", force: true },
        });

        try {
          await settle(mounted);
          setDeterministicMetrics(mounted, cols, rows);
          (stdoutRenderer as any).render(undefined, true);

          clickCell(mounted, 5, 2);
          await settle(mounted);
          (stdoutRenderer as any).render(undefined, true);
          expect(rowText(mounted, 0)).toContain("mermaid preview");
          expect(lastPlacementCells(stdout)).toEqual({ cols: 30, rows: 9 });

          // A new source while the lightbox is open closes it: the lightbox is
          // bound to the raster it was opened from, so it must not keep showing
          // the old picture while a fresh one rasterizes underneath.
          const inlineBefore = countTransmissionSize(stdout, 10, 3);
          const changeStart = stdout.length;
          source.value = `${SAMPLE_SOURCE}\n  %% changed`;
          await settle(mounted);
          (stdoutRenderer as any).render(undefined, true);
          const afterChange = stdout.slice(changeStart);

          expect(rowText(mounted, 0)).not.toContain("mermaid preview");
          expect(rowText(mounted, 0)).toContain("mermaid");
          // The fullscreen placement is dropped right away.
          expect(afterChange).toContain("a=d");

          // Once the new raster is cached the inline drawing takes over again:
          // it uploads the new picture at the inline size.
          expect(countTransmissionSize(stdout, 10, 3)).toBeGreaterThan(inlineBefore);
        } finally {
          stdoutRenderer.dispose();
          mounted.unmount();
        }
      },
    );
  });

  it("allocates no lightbox state before the image is clicked", async () => {
    await withEnv(
      {
        KITTY_WINDOW_ID: "vue-tui-test",
        TERM: "xterm-kitty",
        TERM_PROGRAM: "kitty",
        CI: undefined,
        TMUX: undefined,
        VUE_TUI_GRAPHICS_FORCE: "1",
      },
      async () => {
        setMermaidImageRasterizer(async () => ({
          base64: TINY_PNG_BASE64,
          widthCells: 10,
          heightCells: 3,
          naturalWidth: 80,
          naturalHeight: 24,
        }));

        // Spies install during the first child's setup, before TMermaidImage's
        // setup runs, so anything the lightbox allocates at mount is counted.
        const counts = { stacks: 0, overlayNodes: 0 };
        const Probe = defineComponent({
          name: "RenderManagerProbe",
          setup() {
            const render = useTerminal().render as any;
            const createStack = render.createStack;
            render.createStack = (...args: any[]) => {
              counts.stacks++;
              return createStack.apply(render, args);
            };
            const register = render.register;
            render.register = (node: any) => {
              if (node?.plane === "overlay") counts.overlayNodes++;
              return register.call(render, node);
            };
            return () => null;
          },
        });

        const source = ref(SAMPLE_SOURCE);
        const mounted = await mountTerminal(
          () => [h(Probe), h(TMermaidImage, { x: 0, y: 0, w: 20, content: source.value })],
          32,
          8,
        );

        // The lightbox needs a graphics output to be available at all.
        const stdoutRenderer = createStdoutRenderer(mounted.terminal, {
          output: {
            isTTY: true,
            write() {},
          },
          clear: false,
          hideCursor: false,
          altScreen: false,
          terminalGraphics: { protocol: "kitty", force: true },
        });

        try {
          await settle(mounted);
          setDeterministicMetrics(mounted, 32, 8);
          // Streaming before the click must not warm up lightbox geometry.
          source.value = `${SAMPLE_SOURCE}\n  %% tick 1`;
          await settle(mounted);
          source.value = `${SAMPLE_SOURCE}\n  %% tick 2`;
          await settle(mounted);

          expect(counts).toEqual({ stacks: 0, overlayNodes: 0 });

          clickCell(mounted, 5, 2);
          await settle(mounted);

          expect(counts).toEqual({ stacks: 1, overlayNodes: 1 });
          expect(rowText(mounted, 0)).toContain("mermaid preview");
        } finally {
          stdoutRenderer.dispose();
          mounted.unmount();
        }
      },
    );
  });

  it("keeps copy-on-click when previewOnClick is false", async () => {
    await withEnv(
      {
        KITTY_WINDOW_ID: "vue-tui-test",
        TERM: "xterm-kitty",
        TERM_PROGRAM: "kitty",
        CI: undefined,
        TMUX: undefined,
        VUE_TUI_GRAPHICS_FORCE: "1",
      },
      async () => {
        setMermaidImageRasterizer(async () => ({
          base64: TINY_PNG_BASE64,
          widthCells: 10,
          heightCells: 3,
          naturalWidth: 80,
          naturalHeight: 24,
        }));

        const writeText = vi.fn().mockResolvedValue(undefined);
        const restoreClipboard = installNavigatorClipboard(writeText);
        const onCopy = vi.fn();
        const onPreview = vi.fn();

        try {
          const cols = 32;
          const rows = 8;
          const mounted = await mountTerminal(
            () =>
              h(TMermaidImage, {
                x: 0,
                y: 0,
                w: 20,
                content: SAMPLE_SOURCE,
                previewOnClick: false,
                onCopy,
                onPreview,
              }),
            cols,
            rows,
          );

          try {
            await settle(mounted);
            setDeterministicMetrics(mounted, cols, rows);
            clickCell(mounted, 5, 2);
            await settle(mounted);

            expect(writeText).toHaveBeenCalledWith(SAMPLE_SOURCE);
            expect(onCopy).toHaveBeenCalledWith({ text: SAMPLE_SOURCE, ok: true });
            expect(onPreview).not.toHaveBeenCalled();
            expect(rowText(mounted, 1)).not.toContain("mermaid preview");
          } finally {
            mounted.unmount();
          }
        } finally {
          restoreClipboard();
        }
      },
    );
  });
});

describe("TMermaidImage adaptive ANSI fallback", () => {
  it("renders the ANSI diagram when a textRenderer is provided and the terminal has no graphics protocol", async () => {
    const textRenderer = vi.fn<TMermaidRenderer>(async () => "┌───┐\n│ A │\n└───┘");

    const mounted = await mountTerminal(
      () =>
        h(TMermaidImage, {
          x: 0,
          y: 0,
          w: 24,
          content: SAMPLE_SOURCE,
          textRenderer,
        }),
      32,
      8,
    );

    try {
      await settle(mounted);

      expect(textRenderer).toHaveBeenCalledTimes(1);
      expect(textRenderer.mock.calls[0]![0]).toBe(SAMPLE_SOURCE);
      expect(rowText(mounted, 0)).toContain("mermaid");
      expect(rowText(mounted, 1)).toContain("┌───┐");
      expect(rowText(mounted, 2)).toContain("│ A │");
      expect(rowText(mounted, 3)).toContain("└───┘");
      expect(rowText(mounted, 1)).not.toContain("graph LR");
    } finally {
      mounted.unmount();
    }
  });

  it("keeps the raw source when the eligibility guard rejects the ANSI fallback", async () => {
    const textRenderer = vi.fn<TMermaidRenderer>(async () => "rendered");
    const guard = vi.fn(() => false);

    const mounted = await mountTerminal(
      () =>
        h(TMermaidImage, {
          x: 0,
          y: 0,
          w: 24,
          content: SAMPLE_SOURCE,
          textRenderer,
          shouldRenderSource: guard,
        }),
      32,
      6,
    );

    try {
      await settle(mounted);

      expect(guard).toHaveBeenCalledWith(SAMPLE_SOURCE, { final: true, streaming: false });
      expect(textRenderer).not.toHaveBeenCalled();
      expect(rowText(mounted, 1)).toContain("graph LR");
      expect(rowText(mounted, 2)).toContain("A --> B");
    } finally {
      mounted.unmount();
    }
  });

  it("keeps the raw source when the ANSI renderer returns blank output", async () => {
    const textRenderer = vi.fn<TMermaidRenderer>(async () => "");

    const mounted = await mountTerminal(
      () =>
        h(TMermaidImage, {
          x: 0,
          y: 0,
          w: 24,
          content: SAMPLE_SOURCE,
          textRenderer,
        }),
      32,
      6,
    );

    try {
      await settle(mounted);

      expect(rowText(mounted, 1)).toContain("graph LR");
      expect(rowText(mounted, 2)).toContain("A --> B");
    } finally {
      mounted.unmount();
    }
  });

  it("prefers the image over ANSI when the terminal supports graphics", async () => {
    await withEnv(
      {
        KITTY_WINDOW_ID: "vue-tui-test",
        TERM: "xterm-kitty",
        TERM_PROGRAM: "kitty",
        CI: undefined,
        TMUX: undefined,
        VUE_TUI_GRAPHICS_FORCE: "1",
      },
      async () => {
        setMermaidImageRasterizer(async () => ({
          base64: TINY_PNG_BASE64,
          widthCells: 8,
          heightCells: 3,
          naturalWidth: 64,
          naturalHeight: 24,
        }));

        const textRenderer = vi.fn<TMermaidRenderer>(async () => "┌───┐\n│ A │\n└───┘");

        const mounted = await mountTerminal(
          () =>
            h(TMermaidImage, {
              x: 0,
              y: 0,
              w: 20,
              content: SAMPLE_SOURCE,
              textRenderer,
            }),
          32,
          8,
        );

        let stdout = "";
        const stdoutRenderer = createStdoutRenderer(mounted.terminal, {
          output: {
            isTTY: true,
            write(chunk: string) {
              stdout += chunk;
            },
          },
          clear: false,
          hideCursor: false,
          altScreen: false,
          terminalGraphics: { protocol: "kitty", force: true },
        });

        try {
          await settle(mounted);
          (stdoutRenderer as any).render(undefined, true);

          // The kitty graphic wins over the ANSI fallback.
          expect(stdout).toContain("\u001B_G");
          expect(rowText(mounted, 1)).not.toContain("graph LR");
          expect(rowText(mounted, 1)).not.toContain("│ A │");
        } finally {
          stdoutRenderer.dispose();
          mounted.unmount();
        }
      },
    );
  });

  it("uses the per-component image renderer prop instead of the global rasterizer", async () => {
    const renderer = vi.fn<TuiMermaidImageRasterizer>(async () => ({
      base64: TINY_PNG_BASE64,
      widthCells: 8,
      heightCells: 3,
      naturalWidth: 64,
      naturalHeight: 24,
    }));

    await withEnv(
      {
        KITTY_WINDOW_ID: "vue-tui-test",
        TERM: "xterm-kitty",
        TERM_PROGRAM: "kitty",
        CI: undefined,
        TMUX: undefined,
        VUE_TUI_GRAPHICS_FORCE: "1",
      },
      async () => {
        const mounted = await mountTerminal(
          () =>
            h(TMermaidImage, {
              x: 0,
              y: 0,
              w: 20,
              content: SAMPLE_SOURCE,
              renderer,
            }),
          32,
          8,
        );

        const stdoutRenderer = createStdoutRenderer(mounted.terminal, {
          output: { isTTY: true, write() {} },
          clear: false,
          hideCursor: false,
          altScreen: false,
          terminalGraphics: { protocol: "kitty", force: true },
        });

        try {
          await settle(mounted);

          expect(renderer).toHaveBeenCalledTimes(1);
          expect(renderer.mock.calls[0]![0]).toBe(SAMPLE_SOURCE);
        } finally {
          stdoutRenderer.dispose();
          mounted.unmount();
        }
      },
    );
  });
});

describe("TMermaidImage wheel zoom", () => {
  function countOccurrences(haystack: string, needle: string): number {
    let count = 0;
    let index = 0;
    while ((index = haystack.indexOf(needle, index)) !== -1) {
      count++;
      index += needle.length;
    }
    return count;
  }

  function wheelCell(
    mounted: MountedTerminal,
    cellX: number,
    cellY: number,
    deltaY: number,
    modifiers: Readonly<{ ctrl?: boolean; meta?: boolean }> = { ctrl: true },
  ): void {
    // happy-dom's WheelEvent constructor ignores clientX/clientY, so patch
    // them onto the event before dispatch.
    const event = new WheelEvent("wheel", {
      deltaY,
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, "clientX", { value: cellX * 10 + 1 });
    Object.defineProperty(event, "clientY", { value: cellY * 20 + 1 });
    Object.defineProperty(event, "ctrlKey", { value: modifiers.ctrl ?? false });
    Object.defineProperty(event, "metaKey", { value: modifiers.meta ?? false });
    mounted.container()?.dispatchEvent(event);
  }

  function lastPlacementSourceX(stdout: string): number | null {
    const matches = [...stdout.matchAll(/a=p[^\u001B\\]*\bx=(\d+)/g)];
    if (matches.length === 0) return null;
    return Number(matches[matches.length - 1]![1]);
  }

  function lastPlacementSourceY(stdout: string): number | null {
    const matches = [...stdout.matchAll(/a=p[^\u001B\\]*\by=(\d+)/g)];
    if (matches.length === 0) return null;
    return Number(matches[matches.length - 1]![1]);
  }

  it("zooms the image via wheel using a kitty placement resize without re-sending the PNG", async () => {
    await withEnv(
      {
        KITTY_WINDOW_ID: "vue-tui-test",
        TERM: "xterm-kitty",
        TERM_PROGRAM: "kitty",
        CI: undefined,
        TMUX: undefined,
        VUE_TUI_GRAPHICS_FORCE: "1",
      },
      async () => {
        setMermaidImageRasterizer(async () => ({
          base64: TINY_PNG_BASE64,
          widthCells: 10,
          heightCells: 4,
          naturalWidth: 80,
          naturalHeight: 32,
        }));

        const mounted = await mountTerminal(
          () =>
            h(TMermaidImage, {
              x: 0,
              y: 0,
              w: 24,
              content: SAMPLE_SOURCE,
              zoomModifier: "metaCtrl",
            }),
          32,
          8,
        );

        let stdout = "";
        const stdoutRenderer = createStdoutRenderer(mounted.terminal, {
          output: {
            isTTY: true,
            write(chunk: string) {
              stdout += chunk;
            },
          },
          clear: false,
          hideCursor: false,
          altScreen: false,
          terminalGraphics: { protocol: "kitty", force: true },
        });

        try {
          await settle(mounted);
          setDeterministicMetrics(mounted, 32, 8);
          (stdoutRenderer as any).render(undefined, true);

          const transmissionsBefore = countOccurrences(stdout, "a=T");
          expect(transmissionsBefore).toBeGreaterThan(0);

          // Scroll up over the image content area → zoom in.
          wheelCell(mounted, 12, 2, -100);
          await settle(mounted);
          (stdoutRenderer as any).render(undefined, true);

          // Zoom re-queues a placement resize (a=p), not a full PNG re-send.
          expect(countOccurrences(stdout, "a=T")).toBe(transmissionsBefore);
          expect(countOccurrences(stdout, "a=p")).toBeGreaterThan(0);
        } finally {
          stdoutRenderer.dispose();
          mounted.unmount();
        }
      },
    );
  });

  it("clamps the zoomed placement to the container area (source crop emitted)", async () => {
    await withEnv(
      {
        KITTY_WINDOW_ID: "vue-tui-test",
        TERM: "xterm-kitty",
        TERM_PROGRAM: "kitty",
        CI: undefined,
        TMUX: undefined,
        VUE_TUI_GRAPHICS_FORCE: "1",
      },
      async () => {
        setMermaidImageRasterizer(async () => ({
          base64: TINY_PNG_BASE64,
          widthCells: 10,
          heightCells: 4,
          naturalWidth: 80,
          naturalHeight: 32,
        }));

        const mounted = await mountTerminal(
          () =>
            h(TMermaidImage, {
              x: 0,
              y: 0,
              w: 24,
              content: SAMPLE_SOURCE,
              zoomModifier: "metaCtrl",
            }),
          32,
          8,
        );

        let stdout = "";
        const stdoutRenderer = createStdoutRenderer(mounted.terminal, {
          output: {
            isTTY: true,
            write(chunk: string) {
              stdout += chunk;
            },
          },
          clear: false,
          hideCursor: false,
          altScreen: false,
          terminalGraphics: { protocol: "kitty", force: true },
        });

        try {
          await settle(mounted);
          setDeterministicMetrics(mounted, 32, 8);
          (stdoutRenderer as any).render(undefined, true);

          // Zoom in 5 notches so the image exceeds the container height.
          for (let i = 0; i < 5; i++) {
            wheelCell(mounted, 12, 2, -100);
            await settle(mounted);
          }
          (stdoutRenderer as any).render(undefined, true);

          // The placement now carries source crop controls (x=/y=/w=/h=) so the
          // terminal shows only the container-area portion of the zoomed image.
          expect(stdout).toContain("a=p");
          expect(stdout).toMatch(/a=p[^\u001B]*\bx=\d/);
        } finally {
          stdoutRenderer.dispose();
          mounted.unmount();
        }
      },
    );
  });

  it("does not zoom on iTerm2 (no in-place resize sequence)", async () => {
    await withEnv(
      {
        TERM: "xterm-kitty",
        TERM_PROGRAM: "iTerm.app",
        VUE_TUI_GRAPHICS_FORCE: "1",
        CI: undefined,
        TMUX: undefined,
      },
      async () => {
        setMermaidImageRasterizer(async () => ({
          base64: TINY_PNG_BASE64,
          widthCells: 10,
          heightCells: 4,
          naturalWidth: 80,
          naturalHeight: 32,
        }));

        const mounted = await mountTerminal(
          () =>
            h(TMermaidImage, {
              x: 0,
              y: 0,
              w: 24,
              content: SAMPLE_SOURCE,
              zoomModifier: "metaCtrl",
            }),
          32,
          8,
        );

        let stdout = "";
        const stdoutRenderer = createStdoutRenderer(mounted.terminal, {
          output: {
            isTTY: true,
            write(chunk: string) {
              stdout += chunk;
            },
          },
          clear: false,
          hideCursor: false,
          altScreen: false,
          terminalGraphics: { protocol: "iterm2", force: true },
        });

        try {
          await settle(mounted);
          setDeterministicMetrics(mounted, 32, 8);
          (stdoutRenderer as any).render(undefined, true);
          const stdoutBefore = stdout.length;

          wheelCell(mounted, 12, 2, -100);
          await settle(mounted);
          (stdoutRenderer as any).render(undefined, true);

          // No placement resize emitted for iTerm2.
          expect(stdout.slice(stdoutBefore)).not.toContain("a=p");
        } finally {
          stdoutRenderer.dispose();
          mounted.unmount();
        }
      },
    );
  });

  it("passes the wheel through to scrolling when the zoom modifier is not held", async () => {
    await withEnv(
      {
        KITTY_WINDOW_ID: "vue-tui-test",
        TERM: "xterm-kitty",
        TERM_PROGRAM: "kitty",
        CI: undefined,
        TMUX: undefined,
        VUE_TUI_GRAPHICS_FORCE: "1",
      },
      async () => {
        setMermaidImageRasterizer(async () => ({
          base64: TINY_PNG_BASE64,
          widthCells: 10,
          heightCells: 4,
          naturalWidth: 80,
          naturalHeight: 32,
        }));

        const mounted = await mountTerminal(
          () =>
            h(TMermaidImage, {
              x: 0,
              y: 0,
              w: 24,
              content: SAMPLE_SOURCE,
              zoomModifier: "metaCtrl",
            }),
          32,
          8,
        );

        let stdout = "";
        const stdoutRenderer = createStdoutRenderer(mounted.terminal, {
          output: {
            isTTY: true,
            write(chunk: string) {
              stdout += chunk;
            },
          },
          clear: false,
          hideCursor: false,
          altScreen: false,
          terminalGraphics: { protocol: "kitty", force: true },
        });

        try {
          await settle(mounted);
          setDeterministicMetrics(mounted, 32, 8);
          (stdoutRenderer as any).render(undefined, true);
          const stdoutBefore = stdout.length;

          // Wheel WITHOUT the zoom modifier must not zoom (historical-message
          // scrolling keeps working).
          wheelCell(mounted, 12, 2, -100, { ctrl: false });
          await settle(mounted);
          (stdoutRenderer as any).render(undefined, true);

          expect(stdout.slice(stdoutBefore)).not.toContain("a=p");
          expect(stdout.slice(stdoutBefore)).not.toContain("a=T");

          // Wheel WITH the zoom modifier still zooms.
          wheelCell(mounted, 12, 2, -100, { ctrl: true });
          await settle(mounted);
          (stdoutRenderer as any).render(undefined, true);
          expect(stdout).toContain("a=p");
        } finally {
          stdoutRenderer.dispose();
          mounted.unmount();
        }
      },
    );
  });

  it("zooms with Cmd/meta when zoomModifier is explicitly set to meta", async () => {
    await withEnv(
      {
        KITTY_WINDOW_ID: "vue-tui-test",
        TERM: "xterm-kitty",
        TERM_PROGRAM: "kitty",
        CI: undefined,
        TMUX: undefined,
        VUE_TUI_GRAPHICS_FORCE: "1",
      },
      async () => {
        setMermaidImageRasterizer(async () => ({
          base64: TINY_PNG_BASE64,
          widthCells: 10,
          heightCells: 4,
          naturalWidth: 80,
          naturalHeight: 32,
        }));

        const mounted = await mountTerminal(
          () =>
            h(TMermaidImage, {
              x: 0,
              y: 0,
              w: 24,
              content: SAMPLE_SOURCE,
              zoomModifier: "meta",
            }),
          32,
          8,
        );

        let stdout = "";
        const stdoutRenderer = createStdoutRenderer(mounted.terminal, {
          output: {
            isTTY: true,
            write(chunk: string) {
              stdout += chunk;
            },
          },
          clear: false,
          hideCursor: false,
          altScreen: false,
          terminalGraphics: { protocol: "kitty", force: true },
        });

        try {
          await settle(mounted);
          setDeterministicMetrics(mounted, 32, 8);
          (stdoutRenderer as any).render(undefined, true);

          // Ctrl alone must NOT zoom when the modifier is meta.
          wheelCell(mounted, 12, 2, -100, { ctrl: true });
          await settle(mounted);
          (stdoutRenderer as any).render(undefined, true);
          const stdoutBeforeMeta = stdout.length;
          expect(stdout.slice(stdoutBeforeMeta)).not.toContain("a=p");

          // Cmd (meta) zooms.
          wheelCell(mounted, 12, 2, -100, { meta: true });
          await settle(mounted);
          (stdoutRenderer as any).render(undefined, true);
          expect(stdout).toContain("a=p");
        } finally {
          stdoutRenderer.dispose();
          mounted.unmount();
        }
      },
    );
  });

  it("drags the zoomed image to pan and suppresses the copy click", async () => {
    await withEnv(
      {
        KITTY_WINDOW_ID: "vue-tui-test",
        TERM: "xterm-kitty",
        TERM_PROGRAM: "kitty",
        CI: undefined,
        TMUX: undefined,
        VUE_TUI_GRAPHICS_FORCE: "1",
      },
      async () => {
        setMermaidImageRasterizer(async () => ({
          base64: TINY_PNG_BASE64,
          widthCells: 10,
          heightCells: 4,
          naturalWidth: 80,
          naturalHeight: 32,
        }));

        const writeText = vi.fn().mockResolvedValue(undefined);
        const restoreClipboard = installNavigatorClipboard(writeText);
        const onCopy = vi.fn();

        const mounted = await mountTerminal(
          () =>
            h(TMermaidImage, {
              x: 0,
              y: 0,
              w: 24,
              content: SAMPLE_SOURCE,
              onCopy,
            }),
          32,
          8,
        );

        let stdout = "";
        const stdoutRenderer = createStdoutRenderer(mounted.terminal, {
          output: {
            isTTY: true,
            write(chunk: string) {
              stdout += chunk;
            },
          },
          clear: false,
          hideCursor: false,
          altScreen: false,
          terminalGraphics: { protocol: "kitty", force: true },
        });

        function pointer(type: string, cellX: number, cellY: number): void {
          const event = new MouseEvent(type, {
            clientX: cellX * 10 + 1,
            clientY: cellY * 20 + 1,
            bubbles: true,
            cancelable: true,
            button: 0,
          });
          mounted.container()?.dispatchEvent(event);
        }

        try {
          await settle(mounted);
          setDeterministicMetrics(mounted, 32, 8);
          (stdoutRenderer as any).render(undefined, true);

          // Zoom in so drag-pan becomes available.
          for (let i = 0; i < 3; i++) {
            wheelCell(mounted, 12, 2, -100);
            await settle(mounted);
          }
          (stdoutRenderer as any).render(undefined, true);
          const sourceYBeforeDrag = lastPlacementSourceY(stdout);
          expect(sourceYBeforeDrag).not.toBeNull();

          // Drag upward (dy < 0): the zoomed image is taller than the container,
          // so vertical panning is allowed and the visible source region shifts.
          pointer("pointerdown", 12, 2);
          pointer("pointermove", 12, 0);
          pointer("pointerup", 12, 0);
          await settle(mounted);
          (stdoutRenderer as any).render(undefined, true);

          // Pan re-queued a placement with a different source crop, without
          // re-sending the PNG.
          expect(countOccurrences(stdout, "a=T")).toBe(1);
          expect(lastPlacementSourceY(stdout)).not.toBe(sourceYBeforeDrag);

          // The click that ends the drag must not trigger copy-on-click.
          pointer("click", 12, 0);
          await settle(mounted);
          expect(writeText).not.toHaveBeenCalled();
          expect(onCopy).not.toHaveBeenCalled();
        } finally {
          restoreClipboard();
          stdoutRenderer.dispose();
          mounted.unmount();
        }
      },
    );
  });
});

describe("TMermaid adaptive wrapper", () => {
  it("falls back to the beautiful-mermaid ANSI diagram on a non-graphics terminal", async () => {
    const { TMermaid: AdaptiveTMermaid } = await import("../src/mermaid.js");

    const mounted = await mountTerminal(
      () => h(AdaptiveTMermaid, { x: 0, y: 0, w: 24, content: SAMPLE_SOURCE }),
      32,
      10,
    );

    try {
      await settleAdaptive(mounted);

      expect(rowText(mounted, 0)).toContain("mermaid");
      // Simple flowchart is eligible and rendered as an ANSI diagram inside the box.
      expect(rowText(mounted, 1)).toContain("┌");
      expect(rowText(mounted, 1)).toContain("┐");
      expect(rowText(mounted, 1)).not.toContain("graph LR");
    } finally {
      mounted.unmount();
    }
  });
});
