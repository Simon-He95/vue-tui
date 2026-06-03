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

  it("keeps existing one-line output style while re-rendering", async () => {
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
    expect(rowText(mounted, 0)).toBe("ready");
    expect(mounted.terminal.getCell(0, 0).style.fg).toBe("greenBright");

    resolvers[1]?.("next");
    await settleMermaid(mounted);
    expect(rowText(mounted, 0)).toBe("next");

    mounted.unmount();
  });

  it("renders renderer guidance when no renderer is provided", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TMermaidText, {
          x: 0,
          y: 0,
          w: 160,
          h: 2,
          content: "graph LR\n  A --> B",
          errorText: "diagram error",
          missingDependencyText: "Pass renderer or import @simon_he/vue-tui/mermaid.",
        }),
      120,
      4,
    );

    await settleMermaid(mounted);

    expect(rowText(mounted, 0)).toContain(
      "diagram error: Pass renderer or import @simon_he/vue-tui/mermaid.",
    );

    mounted.unmount();
  });

  it("repaints custom missing-dependency text after entering error state", async () => {
    const missingText = ref("install peer first");

    const mounted = await mountTerminal(
      () =>
        h(TMermaidText, {
          x: 0,
          y: 0,
          w: 80,
          h: 1,
          content: "graph LR\n  A --> B",
          errorText: "diagram error",
          missingDependencyText: missingText.value,
        }),
      80,
      3,
    );

    await settleMermaid(mounted);
    expect(rowText(mounted, 0)).toContain("diagram error: install peer first");

    missingText.value = "pass renderer or import @simon_he/vue-tui/mermaid";
    await settleMermaid(mounted);

    expect(rowText(mounted, 0)).toContain(
      "diagram error: pass renderer or import @simon_he/vue-tui/mermaid",
    );

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

  it("does not classify normal render errors as missing dependency", async () => {
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
          content: "graph LR\n  A -->",
          errorText: "diagram error",
          missingDependencyText: "Missing optional peer.",
          renderer,
        }),
      160,
      4,
    );

    await settleMermaid(mounted);

    expect(rowText(mounted, 0)).toContain(
      "diagram error: beautiful-mermaid parser rejected invalid graph syntax",
    );
    expect(rowText(mounted, 0)).not.toContain("Missing optional peer.");

    mounted.unmount();
  });

  it("keeps the last successful diagram while streaming source is temporarily invalid", async () => {
    const content = ref("graph LR\n  A --> B");
    const renderer: TMermaidRenderer = vi.fn((code) => {
      if (code.includes("BROKEN")) {
        throw new Error("Mermaid source is incomplete");
      }
      return `rendered:${code.split("\n")[1]?.trim() ?? ""}`;
    });

    const mounted = await mountTerminal(
      () =>
        h(TMermaidText, {
          x: 0,
          y: 0,
          w: 48,
          h: 1,
          content: content.value,
          final: false,
          streaming: true,
          renderer,
        }),
      64,
      3,
    );

    await settleMermaid(mounted);
    expect(rowText(mounted, 0)).toBe("rendered:A --> B");

    content.value = "graph LR\n  BROKEN";
    await settleMermaid(mounted);
    expect(rowText(mounted, 0)).toBe("rendered:A --> B");
    expect(rowText(mounted, 0)).not.toContain("Mermaid source is incomplete");

    content.value = "graph LR\n  A --> C";
    await settleMermaid(mounted);
    expect(rowText(mounted, 0)).toBe("rendered:A --> C");

    mounted.unmount();
  });

  it("shows an incomplete placeholder during streaming and a hard error after final", async () => {
    const final = ref(false);
    const renderer: TMermaidRenderer = vi.fn(() => {
      throw new Error("expected node id after arrow");
    });

    const mounted = await mountTerminal(
      () =>
        h(TMermaidText, {
          x: 0,
          y: 0,
          w: 96,
          h: 2,
          content: "graph LR\n  A -->",
          final: final.value,
          streaming: true,
          incompleteText: "waiting for complete Mermaid source",
          errorText: "diagram failed",
          renderer,
        }),
      120,
      4,
    );

    await settleMermaid(mounted);
    expect(rowText(mounted, 0)).toContain("waiting for complete Mermaid source");
    expect(rowText(mounted, 0)).not.toContain("expected node id after arrow");

    final.value = true;
    await settleMermaid(mounted);
    expect(rowText(mounted, 0)).toContain("diagram failed: expected node id after arrow");

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
