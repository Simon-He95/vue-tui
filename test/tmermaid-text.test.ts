import { describe, expect, it, vi } from "vitest";
import { TMermaidText, type TMermaidRenderer } from "../src/vue.js";
import { isMissingBeautifulMermaid } from "../src/vue/mermaid/beautiful-mermaid.js";
import { h, mountTerminal, nextTick, ref } from "./ui-regressions-support.js";

type MountedTerminal = Awaited<ReturnType<typeof mountTerminal>>;

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

async function settleMermaid(mounted: MountedTerminal): Promise<void> {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();
    mounted.scheduler()?.flushNow();
  }
}

describe("TMermaidText", () => {
  it("renders injected Mermaid text output with safe terminal text", async () => {
    const calls: Array<{
      code: string;
      options: Parameters<TMermaidRenderer>[1];
    }> = [];
    const renderer: TMermaidRenderer = vi.fn((code, options) => {
      calls.push({ code, options });
      return "\x1B[31m┌A┐\nline\t2";
    });

    const mounted = await mountTerminal(
      () =>
        h(TMermaidText, {
          x: 1,
          y: 1,
          w: 8,
          h: 3,
          box: false,
          content: "graph LR\n  A --> B",
          code: "graph TD\n  X --> Y",
          ascii: true,
          paddingX: 2,
          options: {
            paddingX: 1,
            paddingY: 3,
            theme: { line: "gray" },
          },
          renderer,
        }),
      12,
      5,
    );

    await settleMermaid(mounted);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      code: "graph TD\n  X --> Y",
      options: {
        useAscii: true,
        paddingX: 2,
        paddingY: 3,
        colorMode: "none",
        theme: { line: "gray" },
      },
    });
    expect(rowText(mounted, 1)).toBe(" ┌A┐");
    expect(rowText(mounted, 2)).toBe(" line 2");

    mounted.unmount();
  });

  it("strips terminal escape sequences from renderer output", async () => {
    const renderer: TMermaidRenderer = vi.fn(
      () => "\x1B]8;;https://example.com\x07link\x1B]8;;\x07\n\x1B[31mred\x1B[0m",
    );

    const mounted = await mountTerminal(
      () =>
        h(TMermaidText, {
          x: 0,
          y: 0,
          w: 20,
          h: 2,
          box: false,
          content: "graph LR\n  A --> B",
          renderer,
        }),
      24,
      4,
    );

    await settleMermaid(mounted);

    expect(rowText(mounted, 0)).toBe("link");
    expect(rowText(mounted, 1)).toBe("red");

    mounted.unmount();
  });

  it("clips rendered rows and clears stale rows when output shrinks", async () => {
    const content = ref("graph LR\n  A --> B");
    const rendered = ref("ABCDEFGHIJK\nsecond\nthird");
    const renderer: TMermaidRenderer = vi.fn(() => rendered.value);

    const mounted = await mountTerminal(
      () =>
        h(TMermaidText, {
          x: 0,
          y: 0,
          w: 5,
          h: 3,
          box: false,
          content: content.value,
          renderer,
        }),
      8,
      4,
    );

    await settleMermaid(mounted);

    expect(rowText(mounted, 0)).toBe("ABCDE");
    expect(rowText(mounted, 1)).toBe("secon");
    expect(rowText(mounted, 2)).toBe("third");

    rendered.value = "XY";
    content.value = "graph LR\n  B --> C";
    await settleMermaid(mounted);

    expect(rowText(mounted, 0)).toBe("XY");
    expect(rowText(mounted, 1)).toBe("");
    expect(rowText(mounted, 2)).toBe("");

    mounted.unmount();
  });

  it("shows source while a new render is pending", async () => {
    const content = ref("graph LR\n  A --> B");
    const resolvers: Array<(value: string) => void> = [];
    const renderer: TMermaidRenderer = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolvers.push(resolve);
        }),
    );

    const mounted = await mountTerminal(
      () =>
        h(TMermaidText, {
          x: 0,
          y: 0,
          w: 24,
          h: 1,
          box: false,
          content: content.value,
          streaming: true,
          style: { fg: "greenBright" },
          loadingStyle: { fg: "yellowBright" },
          renderer,
        }),
      32,
      3,
    );

    expect(resolvers).toHaveLength(1);
    resolvers[0]?.("ready");
    await settleMermaid(mounted);

    expect(rowText(mounted, 0)).toBe("ready");
    expect(mounted.terminal.getCell(0, 0).style.fg).toBe("greenBright");

    content.value = "graph LR\n  B --> C";
    for (let i = 0; i < 8 && resolvers.length < 2; i++) {
      await Promise.resolve();
      await nextTick();
      mounted.scheduler()?.flushNow();
    }

    expect(resolvers).toHaveLength(2);
    expect(rowText(mounted, 0)).toBe("graph LR");
    expect(mounted.terminal.getCell(0, 0).style.fg).toBe("greenBright");

    resolvers[1]?.("next");
    await settleMermaid(mounted);
    expect(rowText(mounted, 0)).toBe("next");

    mounted.unmount();
  });

  it("keeps source when no renderer is provided", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TMermaidText, {
          x: 0,
          y: 0,
          w: 80,
          h: 2,
          box: false,
          content: "graph LR\n  A --> B",
          errorText: "diagram error",
          missingDependencyText: "Pass renderer or import @simon_he/vue-tui/mermaid.",
        }),
      100,
      4,
    );

    await settleMermaid(mounted);

    expect(rowText(mounted, 0)).toBe("graph LR");
    expect(rowText(mounted, 1)).toBe("  A --> B");

    mounted.unmount();
  });

  it("renders immediately when streaming frame task scheduling is rejected", async () => {
    const content = ref("graph LR\n  A --> B");
    const renderer: TMermaidRenderer = vi.fn((code) => `rendered:${code.split("\n")[1]?.trim()}`);

    const mounted = await mountTerminal(
      () =>
        h(TMermaidText, {
          x: 0,
          y: 0,
          w: 24,
          h: 1,
          box: false,
          content: content.value,
          streaming: true,
          renderer,
        }),
      32,
      3,
    );

    await settleMermaid(mounted);
    expect(rowText(mounted, 0)).toBe("rendered:A --> B");

    const scheduler = mounted.scheduler();
    const originalQueueFrameTask = scheduler?.queueFrameTask.bind(scheduler);
    (scheduler as any).queueFrameTask = () => false;

    content.value = "graph LR\n  B --> C";
    await settleMermaid(mounted);

    expect(rowText(mounted, 0)).toBe("rendered:B --> C");

    if (originalQueueFrameTask) (scheduler as any).queueFrameTask = originalQueueFrameTask;
    mounted.unmount();
  });

  it("keeps source when final rendering fails", async () => {
    const renderer: TMermaidRenderer = vi.fn(() => {
      throw new Error("beautiful-mermaid parser rejected invalid graph syntax");
    });

    const mounted = await mountTerminal(
      () =>
        h(TMermaidText, {
          x: 0,
          y: 0,
          w: 100,
          h: 2,
          box: false,
          content: "graph LR\n  A -->",
          errorText: "diagram error",
          missingDependencyText: "Missing optional peer.",
          renderer,
        }),
      160,
      4,
    );

    await settleMermaid(mounted);

    expect(rowText(mounted, 0)).toBe("graph LR");
    expect(rowText(mounted, 1)).toBe("  A -->");
    expect(rowText(mounted, 0)).not.toContain("diagram error");
    expect(rowText(mounted, 0)).not.toContain("Missing optional peer.");

    mounted.unmount();
  });

  it("shows streaming source without calling the renderer until final", async () => {
    const content = ref("graph LR\n  A --> B");
    const final = ref(false);
    const renderer: TMermaidRenderer = vi.fn((code) => `rendered:${code.split("\n")[1]?.trim()}`);

    const mounted = await mountTerminal(
      () =>
        h(TMermaidText, {
          x: 0,
          y: 0,
          w: 48,
          h: 2,
          box: false,
          content: content.value,
          final: final.value,
          streaming: true,
          incompleteText: "waiting for complete Mermaid source",
          renderer,
        }),
      64,
      4,
    );

    await settleMermaid(mounted);
    expect(renderer).not.toHaveBeenCalled();
    expect(rowText(mounted, 0)).toBe("graph LR");
    expect(rowText(mounted, 1)).toBe("  A --> B");

    content.value = "graph LR\n  BROKEN";
    await settleMermaid(mounted);
    expect(renderer).not.toHaveBeenCalled();
    expect(rowText(mounted, 1)).toBe("  BROKEN");
    expect(rowText(mounted, 0)).not.toContain("waiting for complete Mermaid source");

    final.value = true;
    content.value = "graph LR\n  A --> C";
    await settleMermaid(mounted);
    expect(renderer).toHaveBeenCalledTimes(1);
    expect(rowText(mounted, 0)).toBe("rendered:A --> C");

    mounted.unmount();
  });

  it("keeps source when the renderer returns blank output", async () => {
    const renderer: TMermaidRenderer = vi.fn(() => "   \n\t");

    const mounted = await mountTerminal(
      () =>
        h(TMermaidText, {
          x: 0,
          y: 0,
          w: 80,
          h: 2,
          box: false,
          content: "graph LR\n  A --> B",
          renderer,
        }),
      100,
      4,
    );

    await settleMermaid(mounted);

    expect(rowText(mounted, 0)).toBe("graph LR");
    expect(rowText(mounted, 1)).toBe("  A --> B");

    mounted.unmount();
  });

  it("draws the default mermaid box and copies source text", async () => {
    const source = "graph LR\n  A --> B";
    const renderer: TMermaidRenderer = vi.fn(() => "rendered diagram");
    const writeText = vi.fn().mockResolvedValue(undefined);
    const onCopy = vi.fn();
    const originalClipboard = Object.getOwnPropertyDescriptor(globalThis.navigator, "clipboard");

    Object.defineProperty(globalThis.navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    try {
      const cols = 32;
      const rows = 5;
      const mounted = await mountTerminal(
        () =>
          h(TMermaidText, {
            x: 0,
            y: 0,
            w: 28,
            content: source,
            renderer,
            onCopy,
          }),
        cols,
        rows,
      );

      await settleMermaid(mounted);

      expect(rowText(mounted, 0)).toContain("mermaid");
      expect(rowText(mounted, 0)).toContain("copy");
      expect(rowText(mounted, 1)).toContain("rendered diagram");

      setDeterministicMetrics(mounted, cols, rows);
      clickCell(mounted, 22, 0);
      await settleMermaid(mounted);

      expect(writeText).toHaveBeenCalledWith(source);
      expect(onCopy).toHaveBeenCalledWith({ text: source, ok: true });
      expect(rowText(mounted, 0)).toContain("copied");

      mounted.unmount();
    } finally {
      if (originalClipboard) {
        Object.defineProperty(globalThis.navigator, "clipboard", originalClipboard);
      } else {
        delete (globalThis.navigator as any).clipboard;
      }
    }
  });

  it("the mermaid entry TMermaidText supplies the beautiful-mermaid renderer", async () => {
    vi.resetModules();
    vi.doMock("beautiful-mermaid", () => ({
      renderMermaidASCII: vi.fn((code: string) => `rendered:${code}`),
    }));

    const { TBeautifulMermaidText, TMermaidText: TMermaidTextWithBeautifulRenderer } =
      await import("../src/mermaid.js");
    expect(TMermaidTextWithBeautifulRenderer).toBe(TBeautifulMermaidText);

    const mounted = await mountTerminal(
      () =>
        h(TMermaidTextWithBeautifulRenderer, {
          x: 0,
          y: 0,
          w: 40,
          h: 1,
          box: false,
          content: "graph LR\n  A --> B",
        }),
      40,
      3,
    );

    await settleMermaid(mounted);

    expect(rowText(mounted, 0)).toBe("rendered:graph LR");
    mounted.unmount();

    vi.doUnmock("beautiful-mermaid");
    vi.resetModules();
  });

  it("accepts a default-function beautiful-mermaid export", async () => {
    vi.resetModules();
    vi.doMock("beautiful-mermaid", () => ({
      default: vi.fn((code: string) => `default:${code}`),
    }));

    const { beautifulMermaidRenderer } = await import("../src/mermaid.js");
    const rendered = await beautifulMermaidRenderer("flowchart LR\n  A --> B", {
      colorMode: "none",
      useAscii: true,
    });

    expect(rendered).toContain("default:flowchart LR");

    vi.doUnmock("beautiful-mermaid");
    vi.resetModules();
  });

  it("wraps a missing beautiful-mermaid peer once", async () => {
    vi.resetModules();
    vi.doMock("beautiful-mermaid", () => ({
      renderMermaidASCII: vi.fn(() => {
        throw Object.assign(
          new Error("Cannot find package 'beautiful-mermaid' imported from /app"),
          {
            code: "ERR_MODULE_NOT_FOUND",
          },
        );
      }),
    }));

    const { beautifulMermaidRenderer } = await import("../src/mermaid.js");
    const installHint =
      "Install beautiful-mermaid and use TMermaidText from @simon_he/vue-tui/mermaid or @simon_he/vue-tui/agent/mermaid, or pass a custom renderer prop.";

    await expect(
      beautifulMermaidRenderer("flowchart LR\n  A --> B", {
        colorMode: "none",
        useAscii: true,
      }),
    ).rejects.toThrow(
      `${installHint} (Cannot find package 'beautiful-mermaid' imported from /app)`,
    );

    vi.doUnmock("beautiful-mermaid");
    vi.resetModules();
  });

  it("classifies only beautiful-mermaid module resolution failures as missing dependency", () => {
    expect(
      isMissingBeautifulMermaid(
        Object.assign(new Error("Cannot find package 'beautiful-mermaid' imported from /app"), {
          code: "ERR_MODULE_NOT_FOUND",
        }),
      ),
    ).toBe(true);
    expect(
      isMissingBeautifulMermaid(
        new Error("Cannot find package 'other-beautiful-mermaid-plugin' imported from /app"),
      ),
    ).toBe(false);
    expect(
      isMissingBeautifulMermaid(
        Object.assign(
          new Error(
            "Cannot find package 'elkjs' imported from /app/node_modules/beautiful-mermaid/dist/index.js",
          ),
          { code: "ERR_MODULE_NOT_FOUND" },
        ),
      ),
    ).toBe(false);
    expect(
      isMissingBeautifulMermaid(
        new Error("beautiful-mermaid parser rejected invalid graph syntax"),
      ),
    ).toBe(false);
    expect(
      isMissingBeautifulMermaid(
        new Error("Module not found: Error: Can't resolve 'beautiful-mermaid' in '/app'"),
      ),
    ).toBe(true);

    const cyclicError = new Error("wrapper") as Error & { cause?: unknown };
    cyclicError.cause = cyclicError;
    expect(isMissingBeautifulMermaid(cyclicError)).toBe(false);

    const missingPeer = Object.assign(
      new Error("Cannot find package 'beautiful-mermaid' imported from /app"),
      { code: "ERR_MODULE_NOT_FOUND" },
    );
    const wrappedMissingPeer = Object.assign(new Error("wrapper"), {
      cause: missingPeer,
    });
    expect(isMissingBeautifulMermaid(wrappedMissingPeer)).toBe(true);
  });

  it("ignores stale async renders", async () => {
    const content = ref("graph LR\n  A --> B");
    const resolvers: Array<(value: string) => void> = [];
    const renderer: TMermaidRenderer = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolvers.push(resolve);
        }),
    );

    const mounted = await mountTerminal(
      () =>
        h(TMermaidText, {
          x: 0,
          y: 0,
          w: 12,
          h: 1,
          box: false,
          content: content.value,
          renderer,
        }),
      16,
      3,
    );

    await nextTick();
    content.value = "graph LR\n  B --> C";
    await nextTick();

    expect(resolvers).toHaveLength(2);
    resolvers[0]?.("stale");
    resolvers[1]?.("fresh");
    await settleMermaid(mounted);

    expect(rowText(mounted, 0)).toBe("fresh");

    mounted.unmount();
  });
});
