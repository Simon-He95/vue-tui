import { describe, expect, it, vi } from "vitest";
import { TMermaidText, type TMermaidRenderer } from "../src/vue.js";
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
  for (let i = 0; i < 4; i++) {
    await Promise.resolve();
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

  it.each([
    "Cannot find package 'beautiful-mermaid'",
    "Cannot find module 'beautiful-mermaid'",
    "Failed to resolve module specifier 'beautiful-mermaid'",
    "Could not resolve 'beautiful-mermaid'",
  ])("renders dependency guidance for missing optional peer: %s", async (message) => {
    const renderer: TMermaidRenderer = vi.fn(() => {
      const error = new Error(message);
      (error as Error & { code?: string }).code = message.startsWith("Cannot find")
        ? "ERR_MODULE_NOT_FOUND"
        : undefined;
      throw error;
    });

    const mounted = await mountTerminal(
      () =>
        h(TMermaidText, {
          x: 0,
          y: 0,
          w: 160,
          h: 2,
          content: "graph LR\n  A --> B",
          errorText: "diagram error",
          missingDependencyText: "Missing optional peer.",
          renderer,
        }),
      160,
      4,
    );

    await settleMermaid(mounted);

    expect(rowText(mounted, 0)).toContain("diagram error: Missing optional peer.");
    expect(rowText(mounted, 0)).toContain(message);

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
