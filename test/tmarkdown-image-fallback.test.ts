import { describe, expect, it } from "vitest";
import { createStdoutRenderer } from "../src/cli.js";
import { TMarkdownText } from "../src/markdown.js";
import { sanitizeMarkdownImageSource } from "../src/vue/markdown/image.js";
import { h, mountTerminal, nextTick, ref } from "./ui-regressions-support.js";

type MountedTerminal = Awaited<ReturnType<typeof mountTerminal>>;

function rowText(mounted: MountedTerminal, y: number): string {
  return mounted.terminal
    .getRow(y)
    .map((cell) => cell.ch)
    .join("")
    .trimEnd();
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

const TINY_PNG_DATA_URL =
  "data:image/png;base64," +
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

const WIDE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAABgAAAAMCAYAAAB4MH11AAAAG0lEQVR4nGP4r6Dwn5aYYdSCUQtGLRi1gDAGAG0Qhd9FkVPQAAAAAElFTkSuQmCC";
const WIDE_PNG_DATA_URL = `data:image/png;base64,${WIDE_PNG_BASE64}`;

describe("markdown image fallback and sizing", () => {
  it("shows alt text fallback when terminal graphics are not supported", async () => {
    // No kitty env vars set — graphics should not be enabled.
    // The layout compacts image text to 1 cell when alt is wider than 1 char,
    // so only the first char of the alt text is visible as fallback.
    const mounted = await mountTerminal(
      () =>
        h(TMarkdownText, {
          x: 0,
          y: 0,
          w: 40,
          h: 4,
          content: `![my alt text](${TINY_PNG_DATA_URL})`,
        }),
      40,
      6,
    );

    try {
      await nextTick();
      // At minimum, the row should not be blank — some fallback text must appear.
      expect(rowText(mounted, 0)).not.toBe("");
      expect(rowText(mounted, 0)).not.toBe(" ");
    } finally {
      mounted.unmount();
    }
  });

  it("shows alt text when imageRenderer returns null (broken remote)", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TMarkdownText, {
          x: 0,
          y: 0,
          w: 40,
          h: 4,
          content: `![broken image fallback](http://localhost:19999/nonexistent.png)`,
          imageRenderer: () => null,
        }),
      40,
      6,
    );

    try {
      await nextTick();
      expect(rowText(mounted, 0)).toContain("broken image fallback");
      expect(mounted.terminal.getCell(0, 0).style.href).toBe(
        "http://localhost:19999/nonexistent.png",
      );
    } finally {
      mounted.unmount();
    }
  });

  it("shows raw markdown image text and href when alt is missing", async () => {
    const url = "http://localhost:19999/nonexistent.png";
    const mounted = await mountTerminal(
      () =>
        h(TMarkdownText, {
          x: 0,
          y: 0,
          w: 64,
          h: 4,
          content: `![](${url})`,
          imageRenderer: () => null,
        }),
      64,
      6,
    );

    try {
      await nextTick();
      expect(rowText(mounted, 0)).toContain(`![](${url})`);
      expect(mounted.terminal.getCell(0, 0).style.href).toBe(url);
    } finally {
      mounted.unmount();
    }
  });

  it("shows alt text when imageRenderer returns base64 but no graphics support", async () => {
    // imageRenderer resolves a remote URL to base64, but no kitty env is set.
    // Single-char alt text is not compacted so it flows through in full.
    const mounted = await mountTerminal(
      () =>
        h(TMarkdownText, {
          x: 0,
          y: 0,
          w: 40,
          h: 4,
          content: `![R](http://localhost:19999/ok.png)`,
          imageRenderer: () => TINY_PNG_BASE64,
        }),
      40,
      6,
    );

    try {
      await nextTick();
      expect(rowText(mounted, 0)).toContain("R");
    } finally {
      mounted.unmount();
    }
  });

  it("does not overlap inline image followed by trailing text", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TMarkdownText, {
          x: 0,
          y: 0,
          w: 60,
          h: 4,
          content: `![img](${TINY_PNG_DATA_URL}) trailing text after image`,
        }),
      60,
      6,
    );

    try {
      await nextTick();
      const row = rowText(mounted, 0);
      expect(row).toContain("trailing text after image");
      expect(row).not.toContain("base64");
    } finally {
      mounted.unmount();
    }
  });

  it("renders image graphic inside an unordered list item", async () => {
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
            h(TMarkdownText, {
              x: 0,
              y: 0,
              w: 48,
              h: 8,
              content: `- item before\n- ![list image](${TINY_PNG_DATA_URL})\n- item after`,
            }),
          48,
          10,
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
          await nextTick();
          mounted.scheduler()?.flushNow();
          (renderer as any).render(undefined, true);

          expect(stdout).toContain("\u001B_G");
          expect(stdout).toContain("\u001B\\");
          const visible = [0, 1, 2, 3, 4].map((y) => rowText(mounted, y)).join("\n");
          expect(visible).toContain("item before");
          expect(visible).toContain("item after");
          expect(visible).not.toContain("list image");
        } finally {
          renderer.dispose();
          mounted.unmount();
        }
      },
    );
  });

  it("renders image graphic inside an ordered list item", async () => {
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
            h(TMarkdownText, {
              x: 0,
              y: 0,
              w: 48,
              h: 8,
              content: `1. first\n2. ![ordered image](${TINY_PNG_DATA_URL})\n3. third`,
            }),
          48,
          10,
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
          await nextTick();
          mounted.scheduler()?.flushNow();
          (renderer as any).render(undefined, true);

          expect(stdout).toContain("\u001B_G");
          expect(stdout).toContain("\u001B\\");
          const visible = [0, 1, 2, 3, 4].map((y) => rowText(mounted, y)).join("\n");
          expect(visible).toContain("first");
          expect(visible).toContain("third");
          expect(visible).not.toContain("ordered image");
        } finally {
          renderer.dispose();
          mounted.unmount();
        }
      },
    );
  });

  it("renders image graphic inside a nested list", async () => {
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
            h(TMarkdownText, {
              x: 0,
              y: 0,
              w: 48,
              h: 10,
              content: `- parent\n  - ![nested image](${TINY_PNG_DATA_URL})\n  - nested item`,
            }),
          48,
          12,
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
          await nextTick();
          mounted.scheduler()?.flushNow();
          (renderer as any).render(undefined, true);

          expect(stdout).toContain("\u001B_G");
          expect(stdout).toContain("\u001B\\");
          const visible = [0, 1, 2, 3, 4].map((y) => rowText(mounted, y)).join("\n");
          expect(visible).toContain("parent");
          expect(visible).toContain("nested item");
          expect(visible).not.toContain("nested image");
        } finally {
          renderer.dispose();
          mounted.unmount();
        }
      },
    );
  });

  it("shows fallback alt text in list when graphics unsupported", async () => {
    // Without kitty env, image should show alt text inside list items.
    const mounted = await mountTerminal(
      () =>
        h(TMarkdownText, {
          x: 0,
          y: 0,
          w: 48,
          h: 8,
          content: `- before\n- ![list fallback](http://localhost:19999/notfound.png)\n- after`,
          imageRenderer: () => null,
        }),
      48,
      10,
    );

    try {
      await nextTick();
      const visible = [0, 1, 2, 3, 4].map((y) => rowText(mounted, y)).join("\n");
      expect(visible).toContain("list fallback");
      expect(visible).toContain("before");
      expect(visible).toContain("after");
    } finally {
      mounted.unmount();
    }
  });

  it("sized image graphic survives layout (minWidth / maxWidth)", async () => {
    // Regression: when displayWidth > 1, the graphic must not be lost
    // during layout. Verify via buildMarkdownVisualRows directly.
    const { buildMarkdownVisualRows, createTuiMarkdownParser } = await import("../src/markdown.js");
    const parser = createTuiMarkdownParser({ streaming: false });
    const rows = buildMarkdownVisualRows(`![data image](${TINY_PNG_DATA_URL})`, 80, parser, {
      imageSize: { minWidth: 20, maxWidth: 40 },
    });

    expect(rows.length).toBeGreaterThanOrEqual(1);
    const graphicSegment = rows[0]?.segments.find((s) => s.graphic);
    expect(graphicSegment).toBeDefined();
    expect(graphicSegment!.cells).toBeGreaterThanOrEqual(20);
    expect(graphicSegment!.cells).toBeLessThanOrEqual(40);
    expect(graphicSegment!.graphic).toBeDefined();
    expect(graphicSegment!.fallbackText).toBe("data image");
  });

  it("reserves rows for sized image graphics", async () => {
    const { buildMarkdownVisualRows, createTuiMarkdownParser } = await import("../src/markdown.js");
    const parser = createTuiMarkdownParser({ streaming: false });
    const rows = buildMarkdownVisualRows(
      `data URL: ![data image](${TINY_PNG_DATA_URL})\n\nnext line`,
      80,
      parser,
      {
        imageSize: { minWidth: 20, maxWidth: 40, minHeight: 4, maxHeight: 4 },
      },
    );

    const imageRowIndex = rows.findIndex((row) => row.segments.some((segment) => segment.graphic));
    const nextRowIndex = rows.findIndex((row) => row.plainText.includes("next line"));

    expect(imageRowIndex).toBeGreaterThanOrEqual(0);
    expect(nextRowIndex - imageRowIndex).toBeGreaterThanOrEqual(4);
    expect(rows.slice(imageRowIndex + 1, imageRowIndex + 4).map((row) => row.plainText)).toEqual([
      "",
      "",
      "",
    ]);
  });

  it("clips inline image graphics horizontally instead of wrapping them", async () => {
    const { buildMarkdownVisualRows, createTuiMarkdownParser } = await import("../src/markdown.js");
    const parser = createTuiMarkdownParser({ streaming: false });
    const rows = buildMarkdownVisualRows(
      `data URL: ![data image](${TINY_PNG_DATA_URL})\n\nnext line`,
      14,
      parser,
      {
        imageSize: {
          minWidth: 12,
          maxWidth: 12,
          minHeight: 3,
          maxHeight: 3,
          preserveAspectRatio: false,
        },
      },
    );

    expect(rows[0]?.plainText.startsWith("data URL:")).toBe(true);
    expect(rows[0]?.segments.some((segment) => segment.graphic)).toBe(true);
    expect(rows[1]?.plainText).toBe("");
    expect(rows[2]?.plainText).toBe("");
    expect(rows.findIndex((row) => row.plainText.includes("next line"))).toBeGreaterThan(2);
  });

  it("preserves image aspect ratio from source dimensions", async () => {
    const { buildMarkdownVisualRows, createTuiMarkdownParser } = await import("../src/markdown.js");
    const remoteUrl = "http://localhost:19999/wide.png";
    const rows = buildMarkdownVisualRows(
      [
        `data URL: ![short](${WIDE_PNG_DATA_URL})`,
        "",
        `http URL: ![a much longer remote alt label](${remoteUrl})`,
      ].join("\n"),
      80,
      createTuiMarkdownParser({ streaming: false }),
      {
        imageResolver: (image) => (image.src === remoteUrl ? WIDE_PNG_BASE64 : null),
        imageSize: { minWidth: 10, maxWidth: 40, minHeight: 4, maxHeight: 12 },
      },
    );

    const graphics = rows
      .flatMap((row) => row.segments)
      .map((segment) => segment.graphic)
      .filter((graphic): graphic is NonNullable<typeof graphic> => Boolean(graphic));

    expect(graphics).toHaveLength(2);
    expect(graphics.map((graphic) => [graphic.naturalWidth, graphic.naturalHeight])).toEqual([
      [24, 12],
      [24, 12],
    ]);
    expect(graphics.map((graphic) => [graphic.displayWidth, graphic.displayHeight])).toEqual([
      [16, 4],
      [16, 4],
    ]);
  });

  it("sized image renders kitty graphic when graphics enabled", async () => {
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
            h(TMarkdownText, {
              x: 0,
              y: 0,
              w: 80,
              h: 6,
              content: `![data image](${TINY_PNG_DATA_URL})`,
              imageMinWidth: 20,
              imageMaxWidth: 40,
              imageMinHeight: 1,
              imageMaxHeight: 4,
            }),
          80,
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
          await nextTick();
          mounted.scheduler()?.flushNow();
          (renderer as any).render(undefined, true);

          // Kitty graphics sequence must be present.
          expect(stdout).toContain("\u001B_G");
          expect(stdout).toContain("\u001B\\");
          // Alt text must not leak as visible text.
          expect(rowText(mounted, 0)).not.toContain("data image");
          const placeholderCells = mounted.terminal.getRow(0).slice(0, 20);
          expect(placeholderCells.some((cell) => cell.style.underline || cell.style.href)).toBe(
            false,
          );
        } finally {
          renderer.dispose();
          mounted.unmount();
        }
      },
    );
  });

  it("clears image graphics when an occlusion rect covers them", async () => {
    await withEnv(
      {
        TERM: "xterm-kitty",
        KITTY_WINDOW_ID: "1",
      },
      async () => {
        let stdout = "";
        const occlusionRects = ref<readonly { x: number; y: number; w: number; h: number }[]>();
        const mounted = await mountTerminal(
          () =>
            h(TMarkdownText, {
              x: 0,
              y: 0,
              w: 40,
              h: 4,
              content: `![data image](${TINY_PNG_DATA_URL})`,
              imageMinWidth: 10,
              imageMaxWidth: 10,
              imageMinHeight: 2,
              imageMaxHeight: 2,
              imagePreserveAspectRatio: false,
              imageOcclusionRects: occlusionRects.value,
            }),
          40,
          6,
        );
        const renderer = createStdoutRenderer(mounted.terminal, {
          output: {
            write(chunk: string) {
              stdout += chunk;
            },
            isTTY: true,
            columns: 40,
            rows: 6,
          },
          clear: false,
          hideCursor: false,
          altScreen: false,
          terminalGraphics: { protocol: "kitty", force: true },
        });

        try {
          await nextTick();
          mounted.scheduler()?.flushNow();
          (renderer as any).render(undefined, true);
          expect(stdout).toContain("\u001B_Ga=T");

          stdout = "";
          occlusionRects.value = [{ x: 0, y: 0, w: 10, h: 2 }];
          await nextTick();
          mounted.scheduler()?.flushNow();
          (renderer as any).render(undefined, true);

          expect(stdout).toContain("\u001B_Ga=d");
          expect(stdout).not.toContain("\u001B_Ga=T");
        } finally {
          renderer.dispose();
          mounted.unmount();
        }
      },
    );
  });

  it("renders data URL and imageRenderer-resolved URL graphics in the same markdown block", async () => {
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
        const remoteUrl = "http://localhost:19999/tiny.png";
        const blobUrl = "blob:https://example.com/tiny.png";
        const fileUrl = "file:///tmp/tiny.png";
        const mounted = await mountTerminal(
          () =>
            h(TMarkdownText, {
              x: 0,
              y: 0,
              w: 80,
              h: 16,
              content: [
                `data URL: ![data image](${TINY_PNG_DATA_URL})`,
                "",
                `http URL: ![http image](${remoteUrl})`,
                "",
                `blob URL: ![blob image](${blobUrl})`,
                "",
                `file URL: ![file image](${fileUrl})`,
              ].join("\n"),
              imageRenderer: (image) =>
                image.src === remoteUrl || image.src === blobUrl || image.src === fileUrl
                  ? TINY_PNG_BASE64
                  : null,
              imageMinWidth: 10,
              imageMaxWidth: 20,
              imageMinHeight: 2,
              imageMaxHeight: 2,
            }),
          80,
          18,
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
          await nextTick();
          mounted.scheduler()?.flushNow();
          (renderer as any).render(undefined, true);

          expect(stdout.match(/\u001B_Ga=T/g)?.length).toBe(4);
          expect(rowText(mounted, 0)).toContain("data URL:");
          expect(rowText(mounted, 3)).toContain("http URL:");
          expect(rowText(mounted, 6)).toContain("blob URL:");
          expect(rowText(mounted, 9)).toContain("file URL:");
          expect(rowText(mounted, 0)).not.toContain("data image");
          expect(rowText(mounted, 3)).not.toContain("http image");
          expect(rowText(mounted, 6)).not.toContain("blob image");
          expect(rowText(mounted, 9)).not.toContain("file image");
        } finally {
          renderer.dispose();
          mounted.unmount();
        }
      },
    );
  });

  it("allows blob and file image sources to be resolved by imageRenderer", async () => {
    const seen: string[] = [];
    const { buildMarkdownVisualRows, createTuiMarkdownParser } = await import("../src/markdown.js");
    const rows = buildMarkdownVisualRows(
      [
        "![blob image](blob:https://example.com/1234)",
        "",
        "![file image](file:///tmp/demo.png)",
      ].join("\n"),
      80,
      createTuiMarkdownParser({ streaming: false }),
      {
        imageResolver: (image) => {
          seen.push(image.src);
          return TINY_PNG_BASE64;
        },
        imageSize: { minWidth: 4, maxWidth: 8, minHeight: 1, maxHeight: 1 },
      },
    );

    expect(seen).toEqual(["blob:https://example.com/1234", "file:///tmp/demo.png"]);
    expect(rows.filter((row) => row.segments.some((segment) => segment.graphic)).length).toBe(2);
    expect(sanitizeMarkdownImageSource("file:///tmp/demo.png")?.src).toBe("file:///tmp/demo.png");
  });

  it("does not show fallback text when a supported graphic is clipped", async () => {
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
            h(TMarkdownText, {
              x: 0,
              y: 0,
              w: 40,
              h: 4,
              content: `Cat photo: ![cat fallback](${TINY_PNG_DATA_URL})`,
              imageMinWidth: 20,
              imageMaxWidth: 20,
              imageMinHeight: 2,
              imageMaxHeight: 2,
            }),
          24,
          6,
        );

        const renderer = createStdoutRenderer(mounted.terminal, {
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
          await nextTick();
          mounted.scheduler()?.flushNow();
          (renderer as any).render(undefined, true);

          expect(rowText(mounted, 0)).toContain("Cat photo:");
          expect(rowText(mounted, 0)).not.toContain("cat fallback");
        } finally {
          renderer.dispose();
          mounted.unmount();
        }
      },
    );
  });

  it("keeps a supported markdown image active when resize clips it horizontally", async () => {
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
            h(TMarkdownText, {
              x: 0,
              y: 0,
              w: 40,
              h: 4,
              content: `Cat photo: ![cat fallback](${TINY_PNG_DATA_URL})`,
              imageMinWidth: 20,
              imageMaxWidth: 20,
              imageMinHeight: 2,
              imageMaxHeight: 2,
            }),
          40,
          6,
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
          await nextTick();
          mounted.scheduler()?.flushNow();
          (renderer as any).render(undefined, true);
          expect(stdout).toContain("\u001B_G");

          stdout = "";
          mounted.terminal.resize(24, 6);
          await nextTick();
          mounted.scheduler()?.flushNow();
          (renderer as any).render(undefined, true);

          expect(stdout).toContain("a=d");
          expect(stdout).toContain("a=p");
          expect(stdout).not.toContain("a=T");
          expect(rowText(mounted, 0)).toContain("Cat photo:");
          expect(rowText(mounted, 0)).not.toContain("cat fallback");
        } finally {
          renderer.dispose();
          mounted.unmount();
        }
      },
    );
  });

  it("keeps drawing a supported markdown image when resize vertically clips it", async () => {
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
            h(TMarkdownText, {
              x: 0,
              y: 0,
              w: 40,
              h: 6,
              content: `Cat photo: ![cat fallback](${TINY_PNG_DATA_URL})`,
              imageMinWidth: 20,
              imageMaxWidth: 20,
              imageMinHeight: 4,
              imageMaxHeight: 4,
            }),
          40,
          6,
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
          await nextTick();
          mounted.scheduler()?.flushNow();
          (renderer as any).render(undefined, true);
          expect(stdout).toContain("\u001B_G");

          stdout = "";
          mounted.terminal.resize(40, 2);
          await nextTick();
          mounted.scheduler()?.flushNow();
          (renderer as any).render(undefined, true);

          expect(stdout).toContain("a=d");
          expect(stdout).toContain("a=p");
          expect(stdout).not.toContain("a=T");
          expect(rowText(mounted, 0)).toContain("Cat photo:");
          expect(rowText(mounted, 0)).not.toContain("cat fallback");
        } finally {
          renderer.dispose();
          mounted.unmount();
        }
      },
    );
  });

  it("clears the previous markdown image placement when resize moves it", async () => {
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
        const imageY = ref(0);
        const mounted = await mountTerminal(
          () =>
            h(TMarkdownText, {
              x: 0,
              y: imageY.value,
              w: 40,
              h: 4,
              content: `![cat fallback](${TINY_PNG_DATA_URL})`,
              imageMinWidth: 20,
              imageMaxWidth: 20,
              imageMinHeight: 2,
              imageMaxHeight: 2,
            }),
          40,
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
          await nextTick();
          mounted.scheduler()?.flushNow();
          (renderer as any).render(undefined, true);
          expect(stdout).toContain("\u001B_G");

          stdout = "";
          mounted.terminal.resize(40, 10);
          imageY.value = 2;
          await Promise.resolve();
          await nextTick();
          mounted.scheduler()?.flushNow();
          (renderer as any).render(undefined, true);

          const clearIndex = stdout.indexOf("a=d");
          const drawIndex = stdout.indexOf("a=p");
          expect(clearIndex).toBeGreaterThanOrEqual(0);
          expect(drawIndex).toBeGreaterThanOrEqual(0);
          expect(clearIndex).toBeLessThan(drawIndex);
          expect(stdout).not.toContain("a=T");
        } finally {
          renderer.dispose();
          mounted.unmount();
        }
      },
    );
  });
});
