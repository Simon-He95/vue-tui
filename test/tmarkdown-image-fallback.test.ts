import { describe, expect, it } from "vitest";
import { createStdoutRenderer } from "../src/cli.js";
import { TMarkdownText } from "../src/markdown.js";
import { h, mountTerminal, nextTick } from "./ui-regressions-support.js";

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
          const visible = [0, 1, 2, 3, 4]
            .map((y) => rowText(mounted, y))
            .join("\n");
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
          const visible = [0, 1, 2, 3, 4]
            .map((y) => rowText(mounted, y))
            .join("\n");
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
          const visible = [0, 1, 2, 3, 4]
            .map((y) => rowText(mounted, y))
            .join("\n");
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
      const visible = [0, 1, 2, 3, 4]
        .map((y) => rowText(mounted, y))
        .join("\n");
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
    const { buildMarkdownVisualRows, createTuiMarkdownParser } = await import(
      "../src/markdown.js"
    );
    const parser = createTuiMarkdownParser({ streaming: false });
    const rows = buildMarkdownVisualRows(
      `![data image](${TINY_PNG_DATA_URL})`,
      80,
      parser,
      {
        imageSize: { minWidth: 20, maxWidth: 40 },
      },
    );

    expect(rows.length).toBeGreaterThanOrEqual(1);
    const graphicSegment = rows[0]?.segments.find((s) => s.graphic);
    expect(graphicSegment).toBeDefined();
    expect(graphicSegment!.cells).toBeGreaterThanOrEqual(20);
    expect(graphicSegment!.cells).toBeLessThanOrEqual(40);
    expect(graphicSegment!.graphic).toBeDefined();
    expect(graphicSegment!.fallbackText).toBe("data image");
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
        } finally {
          renderer.dispose();
          mounted.unmount();
        }
      },
    );
  });
});
