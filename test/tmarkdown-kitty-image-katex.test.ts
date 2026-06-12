import { describe, expect, it } from "vitest";
import { createStdoutRenderer } from "../src/cli.js";
import { TMarkdownText, TVirtualMarkdown } from "../src/markdown.js";
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

describe("markdown kitty image and KaTeX rendering", () => {
  it("emits a Kitty graphics frame for markdown image URLs instead of text fallback", async () => {
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
              content: `![image](${TINY_PNG_DATA_URL})`,
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

          // Kitty image protocol frames are APC sequences beginning with ESC_G and ending in ST.
          expect(stdout).toContain("\u001B_G");
          expect(stdout).toContain("\u001B\\");
          expect(rowText(mounted, 0)).not.toBe("image");
          expect(rowText(mounted, 0)).not.toContain(TINY_PNG_DATA_URL);
        } finally {
          renderer.dispose();
          mounted.unmount();
        }
      },
    );
  });

  it("renders inline KaTeX instead of leaking raw TeX syntax", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TMarkdownText, {
          x: 0,
          y: 0,
          w: 48,
          h: 4,
          content: "Euler $e^{i\\pi}+1=0$ and fraction $\\frac{a}{b}$",
        }),
      48,
      6,
    );

    try {
      const visible = [0, 1, 2, 3].map((y) => rowText(mounted, y)).join("\n");
      expect(visible).toContain("Euler");
      expect(visible).not.toContain("$e^{i\\pi}+1=0$");
      expect(visible).not.toContain("\\frac");
      expect(visible).not.toContain("\\pi");
      expect(visible).toMatch(/π|pi/i);
    } finally {
      mounted.unmount();
    }
  });

  it("keeps unsupported KaTeX as raw text", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TMarkdownText, {
          x: 0,
          y: 0,
          w: 72,
          h: 4,
          content: "Matrix $\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}$ stays raw",
        }),
      72,
      6,
    );

    try {
      const visible = [0, 1, 2, 3].map((y) => rowText(mounted, y)).join("\n");
      expect(visible).toContain("$\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}$");
    } finally {
      mounted.unmount();
    }
  });

  it("renders KaTeX and images after virtual markdown viewport updates", async () => {
    await withEnv(
      {
        KITTY_WINDOW_ID: "vue-tui-test",
        TERM: "xterm-kitty",
        CI: undefined,
        TMUX: undefined,
        VUE_TUI_GRAPHICS_FORCE: "1",
      },
      async () => {
        const mounted = await mountTerminal(
          () =>
            h(TVirtualMarkdown, {
              x: 0,
              y: 0,
              w: 48,
              h: 5,
              content: [
                "before",
                `![image](${TINY_PNG_DATA_URL})`,
                "formula: $\\int_0^1 x^2 dx$",
                "after",
              ].join("\n"),
            }),
          48,
          8,
        );

        try {
          await nextTick();
          await nextTick();
          const visible = [0, 1, 2, 3, 4].map((y) => rowText(mounted, y)).join("\n");
          expect(visible).not.toContain(TINY_PNG_DATA_URL);
          expect(visible).not.toContain("\\int");
          expect(visible).toMatch(/∫|int/i);
        } finally {
          mounted.unmount();
        }
      },
    );
  });
});
