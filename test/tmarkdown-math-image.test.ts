import { afterEach, describe, expect, it } from "vitest";
import { createStdoutRenderer } from "../src/cli.js";
import {
  TMarkdownText,
  clearMarkdownMathImageCache,
  getMarkdownMathImage,
  loadMarkdownMathImageRenderer,
  setMarkdownMathRasterizer,
} from "../src/markdown.js";
import { h, mountTerminal, nextTick } from "./ui-regressions-support.js";

type MountedTerminal = Awaited<ReturnType<typeof mountTerminal>>;

function rowText(mounted: MountedTerminal, y: number): string {
  return mounted.terminal
    .getRow(y)
    .map((cell) => cell.ch)
    .join("")
    .trimEnd();
}

function clickCell(mounted: MountedTerminal, cellX: number, cellY: number): void {
  mounted
    .container()
    ?.dispatchEvent(new MouseEvent("click", { clientX: cellX, clientY: cellY, bubbles: true }));
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

const FAKE_PNG_DATA_URL =
  "data:image/png;base64," +
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
const FAKE_PNG_B64 = FAKE_PNG_DATA_URL.slice("data:image/png;base64,".length);

const KITTY_ENV: Record<string, string | undefined> = {
  KITTY_WINDOW_ID: "vue-tui-test",
  TERM: "xterm-kitty",
  TERM_PROGRAM: "kitty",
  CI: undefined,
  TMUX: undefined,
  VUE_TUI_GRAPHICS_FORCE: "1",
};

afterEach(() => {
  setMarkdownMathRasterizer(null);
  clearMarkdownMathImageCache();
});

/** Mount TMarkdownText plus a forced-kitty stdout renderer under kitty env. */
async function mountWithGraphics(
  children: () => any,
  cols = 40,
  rows = 10,
): Promise<{
  mounted: MountedTerminal;
  stdout: () => string;
  renderer: ReturnType<typeof createStdoutRenderer>;
}> {
  const mounted = await mountTerminal(children, cols, rows);
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
  await nextTick();
  await nextTick();
  await nextTick();
  mounted.scheduler()?.flushNow();
  (renderer as any).render(undefined, true);
  return { mounted, stdout: () => stdout, renderer };
}

describe("markdown block math images", () => {
  it("renders $$ block math as a Kitty graphics frame after async rasterization", async () => {
    setMarkdownMathRasterizer(async (tex, mode) => {
      expect(tex).toBe("\\frac{a}{b}");
      expect(mode).toBe("display");
      return { base64: FAKE_PNG_B64, widthCells: 14, heightCells: 3 };
    });

    await withEnv(KITTY_ENV, async () => {
      const { mounted, stdout, renderer } = await mountWithGraphics(
        () =>
          h(TMarkdownText, {
            x: 0,
            y: 0,
            w: 40,
            h: 8,
            content: "before\n\n$$\n\\frac{a}{b}\n$$\n\nafter",
          }),
        40,
        10,
      );

      try {
        expect(stdout()).toContain("\u001B_G");
        expect(stdout()).toContain("\u001B\\");
        // The rendered formula replaced the box.
        expect(rowText(mounted, 2)).not.toContain("frac");
        expect(rowText(mounted, 2)).not.toContain("┌");
      } finally {
        renderer.dispose();
        mounted.unmount();
      }
    });
  });

  it("shows a boxed raw formula when the rasterizer cannot render it", async () => {
    setMarkdownMathRasterizer(async () => null);

    await withEnv(KITTY_ENV, async () => {
      const { mounted, stdout, renderer } = await mountWithGraphics(
        () =>
          h(TMarkdownText, {
            x: 0,
            y: 0,
            w: 40,
            h: 8,
            content: "before\n\n$$\n\\frac{a}{b}\n$$\n\nafter",
          }),
        40,
        10,
      );

      try {
        expect(stdout()).not.toContain("\u001B_G");
        expect(rowText(mounted, 2)).toContain("┌");
        expect(rowText(mounted, 3)).toContain("$$\\frac{a}{b}$$");
        expect(rowText(mounted, 4)).toContain("└");
      } finally {
        renderer.dispose();
        mounted.unmount();
      }
    });
  });

  it("shows a boxed raw formula when graphics are unsupported", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TMarkdownText, {
          x: 0,
          y: 0,
          w: 40,
          h: 8,
          content: "before\n\n$$\n\\int_0^1 x^2\\,dx\n$$\n\nafter",
        }),
      40,
      10,
    );

    try {
      await nextTick();
      mounted.scheduler()?.flushNow();
      expect(rowText(mounted, 0)).toBe("before");
      expect(rowText(mounted, 2)).toContain("┌");
      expect(rowText(mounted, 3)).toContain("$$\\int_0^1 x^2\\,dx$$");
      expect(rowText(mounted, 4)).toContain("└");
      expect(rowText(mounted, 6)).toBe("after");
    } finally {
      mounted.unmount();
    }
  });

  it("emits mathAction with original TeX when a rendered block formula is clicked", async () => {
    setMarkdownMathRasterizer(async () => ({
      base64: FAKE_PNG_B64,
      widthCells: 14,
      heightCells: 3,
    }));

    const actions: unknown[] = [];
    await withEnv(KITTY_ENV, async () => {
      const { mounted, renderer } = await mountWithGraphics(
        () =>
          h(TMarkdownText, {
            x: 0,
            y: 0,
            w: 40,
            h: 8,
            content: "before\n\n$$\n\\frac{a}{b}\n$$\n\nafter",
            mathActions: true,
            onMathAction: (payload: unknown) => actions.push(payload),
          }),
        40,
        10,
      );

      try {
        // Click inside the second row of the rendered formula image.
        clickCell(mounted, 4, 3);

        expect(actions).toHaveLength(1);
        expect(actions[0]).toMatchObject({
          cellX: 4,
          cellY: 3,
          math: { raw: "$$\\frac{a}{b}$$", source: "\\frac{a}{b}", rendered: true },
        });
      } finally {
        renderer.dispose();
        mounted.unmount();
      }
    });
  });

  it("rasterizes once and reuses the cache on rebuilds", async () => {
    let calls = 0;
    setMarkdownMathRasterizer(async () => {
      calls++;
      return { base64: FAKE_PNG_B64, widthCells: 14, heightCells: 3 };
    });

    await withEnv(KITTY_ENV, async () => {
      const { renderer, mounted } = await mountWithGraphics(
        () =>
          h(TMarkdownText, {
            x: 0,
            y: 0,
            w: 40,
            h: 10,
            content: "$$\n\\frac{a}{b}\n$$\n\nafter",
          }),
        40,
        10,
      );

      try {
        expect(calls).toBe(1);

        mounted.scheduler()?.flushNow();
        await nextTick();
        mounted.scheduler()?.flushNow();
        (renderer as any).render(undefined, true);
        expect(calls).toBe(1);
      } finally {
        renderer.dispose();
        mounted.unmount();
      }
    });
  });

  it("rasterizes short inline math into the text row; tall inline stays raw", async () => {
    let rasterized = 0;
    setMarkdownMathRasterizer(async (tex, mode) => {
      expect(mode).toBe("inline");
      if (tex.includes("begin")) return null;
      rasterized++;
      return { base64: FAKE_PNG_B64, widthCells: tex.length, heightCells: 1 };
    });

    const actions: unknown[] = [];
    await withEnv(KITTY_ENV, async () => {
      const { mounted, stdout, renderer } = await mountWithGraphics(
        () =>
          h(TMarkdownText, {
            x: 0,
            y: 0,
            w: 80,
            h: 4,
            content:
              "inline $e^{i\\pi}+1=0$ here and $\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}$ raw",
            mathActions: true,
            onMathAction: (payload: unknown) => actions.push(payload),
          }),
        80,
        6,
      );

      try {
        // Only the short formula is rasterized; the matrix stays raw.
        expect(rasterized).toBe(1);
        expect(stdout()).toContain("\u001B_G");
        const visible = [0, 1].map((y) => rowText(mounted, y)).join(" ");
        expect(visible).toContain("inline");
        expect(visible).not.toContain("$e^{i\\pi}+1=0$");
        expect(visible).toContain("here");
        expect(visible).toContain("$\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}$");

        clickCell(mounted, 7, 0);
        expect(actions).toHaveLength(1);
        expect(actions[0]).toMatchObject({
          math: { raw: "$e^{i\\pi}+1=0$", rendered: true },
        });
      } finally {
        renderer.dispose();
        mounted.unmount();
      }
    });
  });

  it("renders common inline formulas and falls back to raw for malformed TeX", async () => {
    clearMarkdownMathImageCache();
    // Builtin MathJax+resvg path (no custom rasterizer).
    expect(await loadMarkdownMathImageRenderer()).toBe(true);

    const valid = await getMarkdownMathImage("x^{2}+\\sqrt{y}", "inline", {});
    const fraction = await getMarkdownMathImage("\\frac{1}{2}", "inline", {});
    const matrix = await getMarkdownMathImage(
      "\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}",
      "inline",
      {},
    );
    const malformed = await getMarkdownMathImage("\\frac{1}{", "inline", {});

    expect(valid).not.toBeNull();
    expect(fraction).not.toBeNull();
    // Tall matrices and malformed TeX stay raw (negative-cached).
    expect(matrix).toBeNull();
    expect(malformed).toBeNull();
  });
});
