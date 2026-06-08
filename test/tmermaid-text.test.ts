import { describe, expect, it, vi } from "vitest";
import { TMermaidText, isSimpleMermaidFlowchartSource, type TMermaidRenderer } from "../src/vue.js";
import { isMissingBeautifulMermaid } from "../src/vue/mermaid/beautiful-mermaid.js";
import {
  createTerminalApp,
  defineComponent,
  h,
  mountTerminal,
  nextTick,
  ref,
  TText,
  TView,
} from "./ui-regressions-support.js";

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

async function settleMermaidMicrotasks(mounted: MountedTerminal): Promise<void> {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
    await nextTick();
    mounted.scheduler()?.flushNow();
  }
}

async function settleTerminalApp(app: ReturnType<typeof createTerminalApp>): Promise<void> {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();
    app.scheduler.flushNow();
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

  it("clears a same-source rendered snapshot before a queued streaming re-render", async () => {
    const source = "graph LR\n  A --> B";
    const renderAllowed = ref(true);
    const renderer: TMermaidRenderer = vi.fn(() => "rendered diagram");

    const mounted = await mountTerminal(
      () =>
        h(TMermaidText, {
          x: 0,
          y: 0,
          w: 48,
          h: 2,
          box: false,
          content: source,
          final: true,
          streaming: true,
          renderer,
          shouldRenderSource: renderAllowed.value ? () => true : () => false,
        }),
      64,
      4,
    );

    await settleMermaid(mounted);

    expect(renderer).toHaveBeenCalledTimes(1);
    expect(rowText(mounted, 0)).toBe("rendered diagram");

    const scheduler = mounted.scheduler();
    const originalQueueFrameTask = scheduler?.queueFrameTask.bind(scheduler);

    try {
      // Simulate an accepted low-priority frame task that has not run yet.
      // The component must still repaint source immediately.
      (scheduler as any).queueFrameTask = () => true;

      renderAllowed.value = false;
      await settleMermaidMicrotasks(mounted);

      expect(renderer).toHaveBeenCalledTimes(1);
      expect(rowText(mounted, 0)).toBe("graph LR");
      expect(rowText(mounted, 1)).toBe("  A --> B");
    } finally {
      if (originalQueueFrameTask) {
        (scheduler as any).queueFrameTask = originalQueueFrameTask;
      }
      mounted.unmount();
    }
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

  it("never paints loading/error/incomplete text in source-first mode", async () => {
    const final = ref(true);
    const renderer: TMermaidRenderer = vi.fn(() => {
      throw new Error("renderer exploded");
    });

    const mounted = await mountTerminal(
      () =>
        h(TMermaidText, {
          x: 0,
          y: 0,
          w: 80,
          h: 2,
          box: false,
          content: "graph LR\n  A --> B",
          final: final.value,
          streaming: true,
          loadingText: "LOADING SHOULD NOT PAINT",
          errorText: "ERROR SHOULD NOT PAINT",
          incompleteText: "INCOMPLETE SHOULD NOT PAINT",
          renderer,
        }),
      100,
      4,
    );

    await settleMermaid(mounted);

    expect(rowText(mounted, 0)).toBe("graph LR");
    expect(rowText(mounted, 1)).toBe("  A --> B");
    expect(rowText(mounted, 0)).not.toContain("LOADING");
    expect(rowText(mounted, 0)).not.toContain("ERROR");
    expect(rowText(mounted, 0)).not.toContain("INCOMPLETE");

    mounted.unmount();
  });

  it("skips renderer for oversized Mermaid source and keeps source visible", async () => {
    const source = [
      "graph LR",
      ...Array.from({ length: 6 }, (_, i) => `  A${i} --> A${i + 1}`),
    ].join("\n");
    const renderer: TMermaidRenderer = vi.fn(() => "should not render");

    const mounted = await mountTerminal(
      () =>
        h(TMermaidText, {
          x: 0,
          y: 0,
          w: 40,
          h: 8,
          box: false,
          content: source,
          renderer,
          maxRenderSourceLines: 3,
        }),
      48,
      10,
    );

    await settleMermaid(mounted);

    expect(renderer).not.toHaveBeenCalled();
    expect(rowText(mounted, 0)).toBe("graph LR");
    expect(rowText(mounted, 1)).toBe("  A0 --> A1");

    mounted.unmount();
  });

  it("lets the primitive custom renderer render complex Mermaid by default", async () => {
    const source = ["sequenceDiagram", "  Alice->>Bob: Hello", "  Bob-->>Alice: Hi"].join("\n");
    const renderer: TMermaidRenderer = vi.fn(() => "sequence rendered");

    const mounted = await mountTerminal(
      () =>
        h(TMermaidText, {
          x: 0,
          y: 0,
          w: 40,
          h: 3,
          box: false,
          content: source,
          renderer,
        }),
      48,
      5,
    );

    await settleMermaid(mounted);

    expect(renderer).toHaveBeenCalledTimes(1);
    expect(renderer).toHaveBeenCalledWith(
      source,
      expect.objectContaining({
        colorMode: "none",
      }),
    );
    expect(rowText(mounted, 0)).toBe("sequence rendered");

    mounted.unmount();
  });

  it("allows callers to opt into rendering complex Mermaid source", async () => {
    const source = ["sequenceDiagram", "  Alice->>Bob: Hello", "  Bob-->>Alice: Hi"].join("\n");
    const renderer: TMermaidRenderer = vi.fn(() => "sequence rendered");

    const mounted = await mountTerminal(
      () =>
        h(TMermaidText, {
          x: 0,
          y: 0,
          w: 40,
          h: 3,
          box: false,
          content: source,
          renderer,
          shouldRenderSource: () => true,
        }),
      48,
      5,
    );

    await settleMermaid(mounted);

    expect(renderer).toHaveBeenCalledTimes(1);
    expect(renderer).toHaveBeenCalledWith(
      source,
      expect.objectContaining({
        colorMode: "none",
      }),
    );
    expect(rowText(mounted, 0)).toBe("sequence rendered");

    mounted.unmount();
  });

  it("lets the primitive caller explicitly skip complex Mermaid with shouldRenderSource", async () => {
    const source = ["sequenceDiagram", "  Alice->>Bob: Hello", "  Bob-->>Alice: Hi"].join("\n");
    const renderer: TMermaidRenderer = vi.fn(() => "should not render");

    const mounted = await mountTerminal(
      () =>
        h(TMermaidText, {
          x: 0,
          y: 0,
          w: 40,
          h: 3,
          box: false,
          content: source,
          renderer,
          shouldRenderSource: isSimpleMermaidFlowchartSource,
        }),
      48,
      3,
    );

    await settleMermaid(mounted);

    expect(renderer).not.toHaveBeenCalled();
    expect(rowText(mounted, 0)).toBe("sequenceDiagram");
    expect(rowText(mounted, 1)).toBe("  Alice->>Bob: Hello");
    expect(rowText(mounted, 2)).toBe("  Bob-->>Alice: Hi");

    mounted.unmount();
  });

  it("keeps complex Mermaid source by default in the beautiful-mermaid wrapper", async () => {
    vi.resetModules();

    const renderMermaidASCII = vi.fn(() => "sequence rendered");
    vi.doMock("beautiful-mermaid", () => ({
      renderMermaidASCII,
    }));

    try {
      const { TMermaidText: TMermaidTextWithBeautifulRenderer } = await import("../src/mermaid.js");
      const source = ["sequenceDiagram", "  Alice->>Bob: Hello", "  Bob-->>Alice: Hi"].join("\n");

      const mounted = await mountTerminal(
        () =>
          h(TMermaidTextWithBeautifulRenderer, {
            x: 0,
            y: 0,
            w: 40,
            h: 3,
            box: false,
            content: source,
          }),
        48,
        5,
      );

      await settleMermaid(mounted);

      expect(renderMermaidASCII).not.toHaveBeenCalled();
      expect(rowText(mounted, 0)).toBe("sequenceDiagram");
      expect(rowText(mounted, 1)).toBe("  Alice->>Bob: Hello");
      expect(rowText(mounted, 2)).toBe("  Bob-->>Alice: Hi");

      mounted.unmount();
    } finally {
      vi.doUnmock("beautiful-mermaid");
      vi.resetModules();
    }
  });

  it("keeps complex Mermaid source by default in the mermaid wrapper even with a custom renderer", async () => {
    vi.resetModules();

    try {
      const { TMermaidText: TMermaidTextWithBeautifulRenderer } = await import("../src/mermaid.js");

      const source = ["sequenceDiagram", "  Alice->>Bob: Hello", "  Bob-->>Alice: Hi"].join("\n");
      const renderer: TMermaidRenderer = vi.fn(() => "sequence rendered");

      const mounted = await mountTerminal(
        () =>
          h(TMermaidTextWithBeautifulRenderer, {
            x: 0,
            y: 0,
            w: 40,
            h: 3,
            box: false,
            content: source,
            renderer,
          }),
        48,
        3,
      );

      await settleMermaid(mounted);

      expect(renderer).not.toHaveBeenCalled();
      expect(rowText(mounted, 0)).toBe("sequenceDiagram");
      expect(rowText(mounted, 1)).toBe("  Alice->>Bob: Hello");
      expect(rowText(mounted, 2)).toBe("  Bob-->>Alice: Hi");

      mounted.unmount();
    } finally {
      vi.resetModules();
    }
  });

  it("lets the mermaid wrapper custom renderer render complex Mermaid when explicitly opted in", async () => {
    vi.resetModules();

    try {
      const { TMermaidText: TMermaidTextWithBeautifulRenderer } = await import("../src/mermaid.js");

      const source = ["sequenceDiagram", "  Alice->>Bob: Hello", "  Bob-->>Alice: Hi"].join("\n");
      const renderer: TMermaidRenderer = vi.fn(() => "sequence rendered");

      const mounted = await mountTerminal(
        () =>
          h(TMermaidTextWithBeautifulRenderer, {
            x: 0,
            y: 0,
            w: 40,
            h: 3,
            box: false,
            content: source,
            renderer,
            shouldRenderSource: () => true,
          }),
        48,
        3,
      );

      await settleMermaid(mounted);

      expect(renderer).toHaveBeenCalledTimes(1);
      expect(renderer).toHaveBeenCalledWith(
        source,
        expect.objectContaining({
          colorMode: "none",
        }),
      );
      expect(rowText(mounted, 0)).toBe("sequence rendered");

      mounted.unmount();
    } finally {
      vi.resetModules();
    }
  });

  it("lets the mermaid wrapper custom renderer skip complex Mermaid when explicitly guarded", async () => {
    vi.resetModules();

    try {
      const { TMermaidText: TMermaidTextWithBeautifulRenderer } = await import("../src/mermaid.js");

      const source = ["sequenceDiagram", "  Alice->>Bob: Hello", "  Bob-->>Alice: Hi"].join("\n");
      const renderer: TMermaidRenderer = vi.fn(() => "should not render");

      const mounted = await mountTerminal(
        () =>
          h(TMermaidTextWithBeautifulRenderer, {
            x: 0,
            y: 0,
            w: 40,
            h: 3,
            box: false,
            content: source,
            renderer,
            shouldRenderSource: isSimpleMermaidFlowchartSource,
          }),
        48,
        3,
      );

      await settleMermaid(mounted);

      expect(renderer).not.toHaveBeenCalled();
      expect(rowText(mounted, 0)).toBe("sequenceDiagram");
      expect(rowText(mounted, 1)).toBe("  Alice->>Bob: Hello");
      expect(rowText(mounted, 2)).toBe("  Bob-->>Alice: Hi");

      mounted.unmount();
    } finally {
      vi.resetModules();
    }
  });

  it("treats normal flowchart syntax as renderable and rejects complex Mermaid features", () => {
    expect(isSimpleMermaidFlowchartSource("graph LR\nA --> B\nB --- C")).toBe(true);
    expect(isSimpleMermaidFlowchartSource("flowchart TD; A --> B; B --- C")).toBe(true);

    expect(isSimpleMermaidFlowchartSource("graph LR\nA[Start] --> B")).toBe(true);
    expect(isSimpleMermaidFlowchartSource("graph LR\nA -->|yes| B")).toBe(true);
    expect(isSimpleMermaidFlowchartSource("graph LR\nA -.-> B")).toBe(true);
    expect(isSimpleMermaidFlowchartSource("graph LR\nA ==> B")).toBe(true);
    expect(isSimpleMermaidFlowchartSource("graph LR\nA --> B --> C")).toBe(true);
    expect(isSimpleMermaidFlowchartSource("graph LR\nA & B --> C")).toBe(true);
    expect(isSimpleMermaidFlowchartSource("graph LR\nA --> B & C")).toBe(true);
    expect(isSimpleMermaidFlowchartSource("graph LR\nA[Start] -->|ok| B{Done}")).toBe(true);
    expect(isSimpleMermaidFlowchartSource('graph LR\nA["subgraph; end"] --> B')).toBe(true);
    expect(isSimpleMermaidFlowchartSource('graph LR\nA["a;b;c"] --> B')).toBe(true);
    expect(isSimpleMermaidFlowchartSource("graph LR\nA --> B %% inline comment")).toBe(true);
    expect(isSimpleMermaidFlowchartSource("graph LR\nA -->|yes; no| B")).toBe(true);
    expect(isSimpleMermaidFlowchartSource("graph LR\nA -->|subgraph; end| B")).toBe(true);
    expect(isSimpleMermaidFlowchartSource("graph LR\nA -->|100%% ready| B")).toBe(true);
    expect(isSimpleMermaidFlowchartSource("graph LR\nA -->|foo:::bar| B")).toBe(true);
    expect(isSimpleMermaidFlowchartSource("graph LR\nA -->|shape @{text}| B")).toBe(true);

    expect(isSimpleMermaidFlowchartSource("graph LR")).toBe(false);
    expect(isSimpleMermaidFlowchartSource("sequenceDiagram\nAlice->>Bob: hi")).toBe(false);
    expect(isSimpleMermaidFlowchartSource("graph LR\nsubgraph X\nA --> B\nend")).toBe(false);
    expect(isSimpleMermaidFlowchartSource("graph LR\nsubgraph X; A --> B; end")).toBe(false);
    expect(isSimpleMermaidFlowchartSource("graph LR\nstyle A fill:#f00")).toBe(false);
    expect(isSimpleMermaidFlowchartSource("graph LR\nclassDef hot fill:#f00")).toBe(false);
    expect(isSimpleMermaidFlowchartSource("graph LR\nA --> B; classDef hot fill:#f00")).toBe(false);
    expect(isSimpleMermaidFlowchartSource("graph LR\nA:::hot --> B")).toBe(false);
    expect(isSimpleMermaidFlowchartSource("graph LR\nA@{ shape: rect } --> B")).toBe(false);
    expect(isSimpleMermaidFlowchartSource('graph LR\nclick A href "https://example.com"')).toBe(
      false,
    );
    expect(isSimpleMermaidFlowchartSource("%%{init: {}}%%\ngraph LR\nA --> B")).toBe(false);
  });

  it("renders labeled flowchart source in the beautiful-mermaid wrapper", async () => {
    vi.resetModules();

    const renderMermaidASCII = vi.fn(() => "labeled rendered");
    vi.doMock("beautiful-mermaid", () => ({
      renderMermaidASCII,
    }));

    try {
      const { TMermaidText: TMermaidTextWithBeautifulRenderer } = await import("../src/mermaid.js");
      const source = "graph LR\nA[Start] -->|ok| B{Done}";

      const mounted = await mountTerminal(
        () =>
          h(TMermaidTextWithBeautifulRenderer, {
            x: 0,
            y: 0,
            w: 40,
            h: 4,
            box: false,
            content: source,
          }),
        48,
        6,
      );

      await settleMermaid(mounted);

      expect(renderMermaidASCII).toHaveBeenCalledTimes(1);
      expect(renderMermaidASCII).toHaveBeenCalledWith(
        source,
        expect.objectContaining({
          colorMode: "none",
        }),
      );
      expect(rowText(mounted, 0)).toBe("labeled rendered");

      mounted.unmount();
    } finally {
      vi.doUnmock("beautiful-mermaid");
      vi.resetModules();
    }
  });

  it("keeps labeled flowchart source when the renderer rejects it", async () => {
    const source = "graph LR\nA[Start] -->|ok| B{Done}";
    const renderer: TMermaidRenderer = vi.fn(() => {
      throw new Error("renderer rejected labeled flowchart");
    });

    const mounted = await mountTerminal(
      () =>
        h(TMermaidText, {
          x: 0,
          y: 0,
          w: 48,
          h: 2,
          box: false,
          content: source,
          renderer,
        }),
      64,
      4,
    );

    await settleMermaid(mounted);

    expect(renderer).toHaveBeenCalledTimes(1);
    expect(rowText(mounted, 0)).toBe("graph LR");
    expect(rowText(mounted, 1)).toBe("A[Start] -->|ok| B{Done}");

    mounted.unmount();
  });

  it("uses shouldRenderSource to skip complex flowchart features", async () => {
    const renderer: TMermaidRenderer = vi.fn(() => "should not render");

    const mounted = await mountTerminal(
      () =>
        h(TMermaidText, {
          x: 0,
          y: 0,
          w: 40,
          h: 5,
          box: false,
          content: ["graph LR", "  subgraph Cluster", "    A --> B", "  end"].join("\n"),
          renderer,
          shouldRenderSource: isSimpleMermaidFlowchartSource,
        }),
      48,
      7,
    );

    await settleMermaid(mounted);

    expect(renderer).not.toHaveBeenCalled();
    expect(rowText(mounted, 0)).toBe("graph LR");
    expect(rowText(mounted, 1)).toBe("  subgraph Cluster");
    expect(rowText(mounted, 2)).toBe("    A --> B");
    expect(rowText(mounted, 3)).toBe("  end");

    mounted.unmount();
  });

  it("uses shouldRenderSource to keep styled complex flowchart source", async () => {
    const source = [
      "graph LR",
      "  A[Start] --> B[Done]",
      "  classDef hot fill:#f00,color:#fff",
      "  class A hot",
    ].join("\n");
    const renderer: TMermaidRenderer = vi.fn(() => "should not render");

    const mounted = await mountTerminal(
      () =>
        h(TMermaidText, {
          x: 0,
          y: 0,
          w: 56,
          h: 4,
          box: false,
          content: source,
          renderer,
          shouldRenderSource: isSimpleMermaidFlowchartSource,
        }),
      64,
      6,
    );

    await settleMermaid(mounted);

    expect(renderer).not.toHaveBeenCalled();
    expect(rowText(mounted, 0)).toBe("graph LR");
    expect(rowText(mounted, 2)).toBe("  classDef hot fill:#f00,color:#fff");

    mounted.unmount();
  });

  it("uses shouldRenderSource to skip semicolon-delimited complex flowchart features", async () => {
    const source = "graph LR; subgraph Cluster; A --> B; end";
    const renderer: TMermaidRenderer = vi.fn(() => "should not render");

    const mounted = await mountTerminal(
      () =>
        h(TMermaidText, {
          x: 0,
          y: 0,
          w: 80,
          h: 1,
          box: false,
          content: source,
          renderer,
          shouldRenderSource: isSimpleMermaidFlowchartSource,
        }),
      90,
      3,
    );

    await settleMermaid(mounted);

    expect(renderer).not.toHaveBeenCalled();
    expect(rowText(mounted, 0)).toBe(source);

    mounted.unmount();
  });

  it("uses shouldRenderSource to count semicolon-delimited flow statements before rendering", async () => {
    const source = [
      "graph LR",
      Array.from({ length: 121 }, (_, index) => `A${index} --> A${index + 1}`).join("; "),
    ].join("; ");
    const renderer: TMermaidRenderer = vi.fn(() => "should not render");

    const mounted = await mountTerminal(
      () =>
        h(TMermaidText, {
          x: 0,
          y: 0,
          w: 120,
          h: 1,
          box: false,
          content: source,
          renderer,
          shouldRenderSource: isSimpleMermaidFlowchartSource,
        }),
      130,
      3,
    );

    await settleMermaid(mounted);

    expect(renderer).not.toHaveBeenCalled();
    expect(rowText(mounted, 0)).toContain("graph LR; A0 --> A1");

    mounted.unmount();
  });

  it("applies the max line guard consistently for CR-only Mermaid source", async () => {
    const source = "graph LR\r  A --> B\r  B --> C";
    const renderer: TMermaidRenderer = vi.fn(() => "should not render");

    const mounted = await mountTerminal(
      () =>
        h(TMermaidText, {
          x: 0,
          y: 0,
          w: 40,
          h: 3,
          box: false,
          content: source,
          renderer,
          maxRenderSourceLines: 2,
        }),
      48,
      5,
    );

    await settleMermaid(mounted);

    expect(renderer).not.toHaveBeenCalled();
    expect(rowText(mounted, 0)).toBe("graph LR");
    expect(rowText(mounted, 1)).toBe("  A --> B");
    expect(rowText(mounted, 2)).toBe("  B --> C");

    mounted.unmount();
  });

  it("keeps source when Mermaid rendering times out", async () => {
    vi.useFakeTimers();

    let mounted: MountedTerminal | null = null;
    const renderer: TMermaidRenderer = vi.fn(() => new Promise<string>(() => {}));

    try {
      mounted = await mountTerminal(
        () =>
          h(TMermaidText, {
            x: 0,
            y: 0,
            w: 40,
            h: 2,
            box: false,
            content: "graph LR\n  A --> B",
            renderer,
            renderTimeoutMs: 25,
          }),
        48,
        4,
      );

      await settleMermaidMicrotasks(mounted);
      expect(renderer).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(25);
      await settleMermaidMicrotasks(mounted);

      expect(rowText(mounted, 0)).toBe("graph LR");
      expect(rowText(mounted, 1)).toBe("  A --> B");
    } finally {
      mounted?.unmount();
      vi.useRealTimers();
    }
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

  it("renders when final is false but streaming is not enabled", async () => {
    const final = ref(false);
    const renderer: TMermaidRenderer = vi.fn(() => "rendered diagram");

    const mounted = await mountTerminal(
      () =>
        h(TMermaidText, {
          x: 0,
          y: 0,
          w: 48,
          h: 2,
          box: false,
          content: "graph LR\n  A --> B",
          final: final.value,
          streaming: false,
          renderer,
        }),
      64,
      4,
    );

    await settleMermaid(mounted);

    expect(renderer).toHaveBeenCalledTimes(1);
    expect(rowText(mounted, 0)).toBe("rendered diagram");

    mounted.unmount();
  });

  it("skips renderer only while streaming Mermaid source is non-final", async () => {
    const final = ref(false);
    const streaming = ref(true);
    const renderer: TMermaidRenderer = vi.fn(() => "rendered diagram");

    const mounted = await mountTerminal(
      () =>
        h(TMermaidText, {
          x: 0,
          y: 0,
          w: 48,
          h: 2,
          box: false,
          content: "graph LR\n  A --> B",
          final: final.value,
          streaming: streaming.value,
          renderer,
        }),
      64,
      4,
    );

    await settleMermaid(mounted);

    expect(renderer).not.toHaveBeenCalled();
    expect(rowText(mounted, 0)).toBe("graph LR");
    expect(rowText(mounted, 1)).toBe("  A --> B");

    streaming.value = false;
    await settleMermaid(mounted);

    expect(renderer).toHaveBeenCalledTimes(1);
    expect(rowText(mounted, 0)).toBe("rendered diagram");

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
      value: { readText: vi.fn().mockResolvedValue(""), writeText },
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

  it("uses ASCII border characters for the outer Mermaid box when ascii is true", async () => {
    const renderer: TMermaidRenderer = vi.fn(() => "rendered diagram");

    const mounted = await mountTerminal(
      () =>
        h(TMermaidText, {
          x: 0,
          y: 0,
          w: 28,
          ascii: true,
          content: "graph LR\n  A --> B",
          renderer,
        }),
      32,
      5,
    );

    await settleMermaid(mounted);

    expect(rowText(mounted, 0)).toContain("mermaid");
    expect(rowText(mounted, 0)).toContain("copy");
    expect(rowText(mounted, 0).startsWith("+")).toBe(true);
    expect(rowText(mounted, 0).endsWith("+")).toBe(true);
    expect(rowText(mounted, 0)).not.toContain("┌");
    expect(rowText(mounted, 0)).not.toContain("─");

    expect(rowText(mounted, 1).startsWith("|")).toBe(true);
    expect(rowText(mounted, 1)).toContain("rendered diagram");
    expect(rowText(mounted, 2).startsWith("+")).toBe(true);
    expect(rowText(mounted, 2).endsWith("+")).toBe(true);

    mounted.unmount();
  });

  it("does not reserve box rows when auto-sized width is too narrow to draw the box", async () => {
    const renderer: TMermaidRenderer = vi.fn(() => "R");

    const mounted = await mountTerminal(
      () => [
        h(TText, { x: 0, y: 1, zIndex: -1, value: "below", w: 8 }),
        h(TMermaidText, {
          x: 0,
          y: 0,
          w: 1,
          content: "graph LR\n  A --> B",
          renderer,
        }),
      ],
      12,
      4,
    );

    await settleMermaid(mounted);

    expect(rowText(mounted, 0)).toBe("R");
    expect(rowText(mounted, 1)).toBe("below");

    mounted.unmount();
  });

  it("resets copied label after copiedDurationMs", async () => {
    const source = "graph LR\n  A --> B";
    const renderer: TMermaidRenderer = vi.fn(() => "rendered diagram");
    const writeText = vi.fn().mockResolvedValue(undefined);
    const originalClipboard = Object.getOwnPropertyDescriptor(globalThis.navigator, "clipboard");

    Object.defineProperty(globalThis.navigator, "clipboard", {
      value: { readText: vi.fn().mockResolvedValue(""), writeText },
      configurable: true,
    });

    const cols = 32;
    const rows = 5;
    let mounted: MountedTerminal | null = null;

    try {
      mounted = await mountTerminal(
        () =>
          h(TMermaidText, {
            x: 0,
            y: 0,
            w: 28,
            content: source,
            renderer,
            copiedDurationMs: 50,
          }),
        cols,
        rows,
      );

      await settleMermaid(mounted);
      setDeterministicMetrics(mounted, cols, rows);

      vi.useFakeTimers();
      clickCell(mounted, 22, 0);
      await settleMermaidMicrotasks(mounted);

      expect(rowText(mounted, 0)).toContain("copied");

      await vi.advanceTimersByTimeAsync(50);
      await settleMermaidMicrotasks(mounted);

      expect(rowText(mounted, 0)).toContain("copy");
      expect(rowText(mounted, 0)).not.toContain("copied");
    } finally {
      vi.useRealTimers();
      mounted?.unmount();
      if (originalClipboard) {
        Object.defineProperty(globalThis.navigator, "clipboard", originalClipboard);
      } else {
        delete (globalThis.navigator as any).clipboard;
      }
    }
  });

  it("does not leave copied feedback stuck when copiedDurationMs is zero", async () => {
    const source = "graph LR\n  A --> B";
    const renderer: TMermaidRenderer = vi.fn(() => "rendered diagram");
    const writeText = vi.fn().mockResolvedValue(undefined);
    const originalClipboard = Object.getOwnPropertyDescriptor(globalThis.navigator, "clipboard");

    Object.defineProperty(globalThis.navigator, "clipboard", {
      value: { readText: vi.fn().mockResolvedValue(""), writeText },
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
            copiedDurationMs: 0,
          }),
        cols,
        rows,
      );

      await settleMermaid(mounted);
      setDeterministicMetrics(mounted, cols, rows);

      clickCell(mounted, 22, 0);
      await settleMermaid(mounted);

      expect(writeText).toHaveBeenCalledWith(source);
      expect(rowText(mounted, 0)).toContain("copy");
      expect(rowText(mounted, 0)).not.toContain("copied");

      mounted.unmount();
    } finally {
      if (originalClipboard) {
        Object.defineProperty(globalThis.navigator, "clipboard", originalClipboard);
      } else {
        delete (globalThis.navigator as any).clipboard;
      }
    }
  });

  it("keeps title and copy label separated in narrow Mermaid headers", async () => {
    const renderer: TMermaidRenderer = vi.fn(() => "rendered diagram");

    const mounted = await mountTerminal(
      () =>
        h(TMermaidText, {
          x: 0,
          y: 0,
          w: 12,
          content: "graph LR\n  A --> B",
          title: "very-long-mermaid-title",
          renderer,
        }),
      16,
      4,
    );

    await settleMermaid(mounted);

    expect(rowText(mounted, 0)).toBe("┌ ve─ copy ┐");

    mounted.unmount();
  });

  it("uses the injected clipboard for copy", async () => {
    const source = "graph LR\n  A --> B";
    const renderer: TMermaidRenderer = vi.fn(() => "rendered diagram");
    const writeText = vi.fn().mockResolvedValue(undefined);
    const onCopy = vi.fn();
    const originalClipboard = Object.getOwnPropertyDescriptor(globalThis.navigator, "clipboard");

    Object.defineProperty(globalThis.navigator, "clipboard", {
      value: {
        writeText: vi.fn().mockRejectedValue(new Error("navigator should not be used")),
      },
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
        {
          clipboard: {
            supported: true,
            readText: vi.fn(),
            writeText,
          },
        },
      );

      await settleMermaid(mounted);

      setDeterministicMetrics(mounted, cols, rows);
      clickCell(mounted, 22, 0);
      await settleMermaid(mounted);

      expect(writeText).toHaveBeenCalledWith(source);
      expect(onCopy).toHaveBeenCalledWith({ text: source, ok: true });

      mounted.unmount();
    } finally {
      if (originalClipboard) {
        Object.defineProperty(globalThis.navigator, "clipboard", originalClipboard);
      } else {
        delete (globalThis.navigator as any).clipboard;
      }
    }
  });

  it("uses write-only runtime clipboard for Mermaid copy without changing aggregate support", async () => {
    const source = "graph LR\n  A --> B";
    const renderer: TMermaidRenderer = vi.fn(() => "rendered diagram");
    const writeText = vi.fn().mockResolvedValue(undefined);
    const onCopy = vi.fn();

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
      {
        clipboard: {
          supported: false,
          canRead: false,
          canWrite: true,
          readText: vi.fn(),
          writeText,
        },
      },
    );

    await settleMermaid(mounted);
    setDeterministicMetrics(mounted, cols, rows);

    clickCell(mounted, 22, 0);
    await settleMermaid(mounted);

    expect(writeText).toHaveBeenCalledWith(source);
    expect(onCopy).toHaveBeenCalledWith({ text: source, ok: true });

    mounted.unmount();
  });

  it("does not bypass an explicitly unsupported injected clipboard", async () => {
    const source = "graph LR\n  A --> B";
    const renderer: TMermaidRenderer = vi.fn(() => "rendered diagram");
    const navigatorWriteText = vi.fn().mockResolvedValue(undefined);
    const injectedWriteText = vi.fn().mockResolvedValue(undefined);
    const onCopy = vi.fn();
    const originalClipboard = Object.getOwnPropertyDescriptor(globalThis.navigator, "clipboard");

    Object.defineProperty(globalThis.navigator, "clipboard", {
      value: { writeText: navigatorWriteText },
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
        {
          clipboard: {
            supported: false,
            readText: vi.fn(),
            writeText: injectedWriteText,
          },
        },
      );

      await settleMermaid(mounted);
      setDeterministicMetrics(mounted, cols, rows);

      clickCell(mounted, 22, 0);
      await settleMermaid(mounted);

      expect(injectedWriteText).not.toHaveBeenCalled();
      expect(navigatorWriteText).not.toHaveBeenCalled();
      expect(onCopy).toHaveBeenCalledWith(
        expect.objectContaining({
          text: source,
          ok: false,
          error: expect.any(Error),
        }),
      );
      expect(rowText(mounted, 0)).toContain("copy");
      expect(rowText(mounted, 0)).not.toContain("copied");

      mounted.unmount();
    } finally {
      if (originalClipboard) {
        Object.defineProperty(globalThis.navigator, "clipboard", originalClipboard);
      } else {
        delete (globalThis.navigator as any).clipboard;
      }
    }
  });

  it("does not show copied feedback for a stale async copy after source changes", async () => {
    const firstSource = "graph LR\n  A --> B";
    const nextSource = "graph LR\n  A --> C";
    const content = ref(firstSource);
    const renderer: TMermaidRenderer = vi.fn((code) => `rendered:${code.split("\n")[1]?.trim()}`);
    const onCopy = vi.fn();

    let resolveWrite!: () => void;
    const writeText = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveWrite = resolve;
        }),
    );

    const cols = 32;
    const rows = 5;
    const mounted = await mountTerminal(
      () =>
        h(TMermaidText, {
          x: 0,
          y: 0,
          w: 28,
          content: content.value,
          renderer,
          onCopy,
        }),
      cols,
      rows,
      {
        clipboard: {
          supported: true,
          readText: vi.fn(),
          writeText,
        },
      },
    );

    await settleMermaid(mounted);
    setDeterministicMetrics(mounted, cols, rows);

    clickCell(mounted, 22, 0);
    await settleMermaidMicrotasks(mounted);

    expect(writeText).toHaveBeenCalledWith(firstSource);

    content.value = nextSource;
    await settleMermaid(mounted);

    resolveWrite();
    await settleMermaid(mounted);

    expect(onCopy).toHaveBeenCalledWith({ text: firstSource, ok: true });
    expect(rowText(mounted, 0)).toContain("copy");
    expect(rowText(mounted, 0)).not.toContain("copied");
    expect(rowText(mounted, 1)).toContain("rendered:A --> C");

    mounted.unmount();
  });

  it("uses the createTerminalApp clipboard for copy", async () => {
    const source = "graph LR\n  A --> B";
    const renderer: TMermaidRenderer = vi.fn(() => "rendered diagram");
    const writeText = vi.fn().mockResolvedValue(undefined);
    const onCopy = vi.fn();
    const App = defineComponent({
      setup() {
        return () =>
          h(TMermaidText, {
            x: 0,
            y: 0,
            w: 28,
            content: source,
            renderer,
            onCopy,
          });
      },
    });

    const app = createTerminalApp({
      cols: 32,
      rows: 5,
      component: App,
      clipboard: {
        supported: true,
        readText: vi.fn(),
        writeText,
      },
    });

    try {
      app.mount();
      await settleTerminalApp(app);

      app.events.dispatch({ type: "click", cellX: 22, cellY: 0, time: Date.now() } as any);
      await settleTerminalApp(app);

      expect(writeText).toHaveBeenCalledWith(source);
      expect(onCopy).toHaveBeenCalledWith({ text: source, ok: true });
    } finally {
      app.dispose();
    }
  });

  it("does not expose the copy hit rect outside a clipped parent", async () => {
    const source = "graph LR\n  A --> B";
    const renderer: TMermaidRenderer = vi.fn(() => "rendered diagram");
    const writeText = vi.fn().mockResolvedValue(undefined);
    const onCopy = vi.fn();

    const cols = 32;
    const rows = 5;
    const mounted = await mountTerminal(
      () =>
        h(TView, { x: 0, y: 1, w: 28, h: 2, scrollY: 1 }, () =>
          h(TMermaidText, {
            x: 0,
            y: 0,
            w: 28,
            content: source,
            renderer,
            onCopy,
          }),
        ),
      cols,
      rows,
      {
        clipboard: {
          supported: true,
          readText: vi.fn(),
          writeText,
        },
      },
    );

    await settleMermaid(mounted);

    setDeterministicMetrics(mounted, cols, rows);
    clickCell(mounted, 22, 0);
    await settleMermaid(mounted);

    expect(writeText).not.toHaveBeenCalled();
    expect(onCopy).not.toHaveBeenCalled();

    mounted.unmount();
  });

  it("draws a compact two-row Mermaid box and keeps copy active when explicit height has no content row", async () => {
    const source = "graph LR\n  A --> B";
    const renderer: TMermaidRenderer = vi.fn(() => "rendered diagram");
    const writeText = vi.fn().mockResolvedValue(undefined);
    const onCopy = vi.fn();

    const cols = 32;
    const rows = 4;
    const mounted = await mountTerminal(
      () =>
        h(TMermaidText, {
          x: 0,
          y: 0,
          w: 28,
          h: 2,
          content: source,
          renderer,
          onCopy,
        }),
      cols,
      rows,
      {
        clipboard: {
          supported: true,
          readText: vi.fn(),
          writeText,
        },
      },
    );

    await settleMermaid(mounted);

    expect(rowText(mounted, 0)).toContain("mermaid");
    expect(rowText(mounted, 0)).toContain("copy");
    expect(rowText(mounted, 0).startsWith("┌")).toBe(true);
    expect(rowText(mounted, 0).endsWith("┐")).toBe(true);
    expect(rowText(mounted, 1).startsWith("└")).toBe(true);
    expect(rowText(mounted, 1).endsWith("┘")).toBe(true);
    expect(rowText(mounted, 0)).not.toContain("rendered diagram");
    expect(rowText(mounted, 1)).not.toContain("rendered diagram");

    setDeterministicMetrics(mounted, cols, rows);
    clickCell(mounted, 22, 0);
    await settleMermaid(mounted);

    expect(writeText).toHaveBeenCalledWith(source);
    expect(onCopy).toHaveBeenCalledWith({ text: source, ok: true });

    mounted.unmount();
  });

  it("respects explicit zero Mermaid height", async () => {
    const renderer: TMermaidRenderer = vi.fn(() => "rendered diagram");
    const writeText = vi.fn().mockResolvedValue(undefined);
    const onCopy = vi.fn();

    const mounted = await mountTerminal(
      () =>
        h(TMermaidText, {
          x: 0,
          y: 0,
          w: 28,
          h: 0,
          content: "graph LR\n  A --> B",
          renderer,
          onCopy,
        }),
      32,
      4,
      {
        clipboard: {
          supported: true,
          readText: vi.fn(),
          writeText,
        },
      },
    );

    await settleMermaid(mounted);

    expect(rowText(mounted, 0)).toBe("");
    expect(rowText(mounted, 1)).toBe("");

    setDeterministicMetrics(mounted, 32, 4);
    clickCell(mounted, 22, 0);
    await settleMermaid(mounted);

    expect(writeText).not.toHaveBeenCalled();
    expect(onCopy).not.toHaveBeenCalled();

    mounted.unmount();
  });

  it("adds parent event zIndex to the Mermaid copy hit node", async () => {
    const renderer: TMermaidRenderer = vi.fn(() => "rendered diagram");

    const mounted = await mountTerminal(
      () =>
        h(TView, { x: 0, y: 0, w: 28, h: 4, zIndex: 120 }, () =>
          h(TMermaidText, {
            x: 0,
            y: 0,
            w: 28,
            zIndex: 3,
            content: "graph LR\n  A --> B",
            renderer,
          }),
        ),
      32,
      5,
    );

    await settleMermaid(mounted);

    const events = mounted.events();
    if (!events) throw new Error("expected terminal events");

    const copyNode = events
      .debugNodes()
      .find((node) => node.visible && node.focusable && node.rect.y === 0 && node.rect.w > 0);

    expect(copyNode).toBeDefined();
    expect(copyNode?.zIndex).toBe(124);

    mounted.unmount();
  });

  it("makes the copy hit node inactive when the copy button is hidden", async () => {
    const copyButton = ref(true);
    const renderer: TMermaidRenderer = vi.fn(() => "rendered diagram");

    const mounted = await mountTerminal(
      () =>
        h(TMermaidText, {
          x: 0,
          y: 0,
          w: 28,
          content: "graph LR\n  A --> B",
          copyButton: copyButton.value,
          renderer,
        }),
      32,
      5,
    );

    await settleMermaid(mounted);

    const events = mounted.events();
    if (!events) throw new Error("expected terminal events");
    const copyNode = events
      .debugNodes()
      .find((node) => node.visible && node.focusable && node.zIndex === 1 && node.rect.w > 0);

    expect(copyNode).toBeDefined();

    copyButton.value = false;
    await settleMermaid(mounted);

    const hiddenCopyNode = events.debugNodes().find((node) => node.id === copyNode!.id);
    expect(hiddenCopyNode).toMatchObject({
      visible: false,
      focusable: false,
    });

    mounted.unmount();
  });

  it("does not pad unboxed content when clear is false", async () => {
    const content = ref("graph LR\n  A --> B");
    const renderer: TMermaidRenderer = vi.fn(() => content.value);

    const mounted = await mountTerminal(
      () =>
        h(TMermaidText, {
          x: 0,
          y: 0,
          w: 8,
          h: 1,
          box: false,
          clear: false,
          content: content.value,
          renderer,
        }),
      12,
      3,
    );

    await settleMermaid(mounted);
    expect(rowText(mounted, 0)).toBe("graph LR");

    const writeSpy = vi.spyOn(mounted.terminal, "write");
    content.value = "x";
    await settleMermaid(mounted);

    expect(writeSpy).toHaveBeenCalledWith("x", expect.objectContaining({ x: 0, y: 0 }));
    expect(writeSpy).not.toHaveBeenCalledWith("x       ", expect.anything());

    mounted.unmount();
  });

  it("forwards copy events through the mermaid entry wrapper", async () => {
    vi.resetModules();
    vi.doMock("beautiful-mermaid", () => ({
      renderMermaidASCII: vi.fn(() => "rendered diagram"),
    }));

    const writeText = vi.fn().mockResolvedValue(undefined);
    const onCopy = vi.fn();
    const source = "graph LR\n  A --> B";
    const originalClipboard = Object.getOwnPropertyDescriptor(globalThis.navigator, "clipboard");

    Object.defineProperty(globalThis.navigator, "clipboard", {
      value: { readText: vi.fn().mockResolvedValue(""), writeText },
      configurable: true,
    });

    try {
      const { TMermaidText: TMermaidTextWithBeautifulRenderer } = await import("../src/mermaid.js");

      const cols = 32;
      const rows = 5;
      const mounted = await mountTerminal(
        () =>
          h(TMermaidTextWithBeautifulRenderer, {
            x: 0,
            y: 0,
            w: 28,
            content: source,
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

      mounted.unmount();
    } finally {
      if (originalClipboard) {
        Object.defineProperty(globalThis.navigator, "clipboard", originalClipboard);
      } else {
        delete (globalThis.navigator as any).clipboard;
      }
      vi.doUnmock("beautiful-mermaid");
      vi.resetModules();
    }
  });

  it("treats explicit h as the outer mermaid box height", async () => {
    const renderer: TMermaidRenderer = vi.fn(() => "diagram line 1\ndiagram line 2");

    const mounted = await mountTerminal(
      () =>
        h(TMermaidText, {
          x: 0,
          y: 0,
          w: 28,
          h: 4,
          content: "graph LR\n  A --> B",
          renderer,
        }),
      32,
      6,
    );

    await settleMermaid(mounted);

    expect(rowText(mounted, 0)).toContain("mermaid");
    expect(rowText(mounted, 1)).toContain("diagram line 1");
    expect(rowText(mounted, 2)).toContain("diagram line 2");
    expect(rowText(mounted, 3)).toContain("└");

    mounted.unmount();
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
