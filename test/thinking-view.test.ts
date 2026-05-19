import { describe, expect, it, vi } from "vitest";
import { resolveTThinkingViewModel, TThinkingView } from "../src/agent.js";
import { createTerminalApp } from "../src/cli.js";
import { defineComponent, h, mountTerminal, nextTick } from "./ui-regressions-support.js";

function rowText(
  mounted: { terminal: { getRow: (y: number) => readonly { ch: string }[] } },
  y: number,
): string {
  return mounted.terminal
    .getRow(y)
    .map((cell) => cell.ch)
    .join("")
    .trimEnd();
}

describe("TThinkingView", () => {
  it("exposes the same collapsed pulse model used by the component", () => {
    const model = resolveTThinkingViewModel({
      w: 40,
      title: "abc",
      collapsed: true,
      pulseFrame: 1,
    });

    expect(model.headerText).toBe("▸ aBc");
    expect(model.bodyRows).toEqual([]);
  });

  it("renders expanded body rows", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TThinkingView, {
          x: 0,
          y: 0,
          w: 42,
          title: "Thinking",
          content: "alpha\nbeta",
        }),
      42,
      4,
    );

    try {
      expect(rowText(mounted, 0)).toBe("▾ Thinking");
      expect(rowText(mounted, 1)).toBe("  alpha");
      expect(rowText(mounted, 2)).toBe("  beta");
    } finally {
      mounted.unmount();
    }
  });

  it("falls back to the default header when the header slot is empty", async () => {
    const mounted = await mountTerminal(
      () =>
        h(
          TThinkingView,
          {
            x: 0,
            y: 0,
            w: 42,
            title: "Thinking",
            content: "alpha",
          },
          {
            header: () => null as any,
          },
        ),
      42,
      2,
    );

    try {
      expect(rowText(mounted, 0)).toBe("▾ Thinking");
      expect(rowText(mounted, 1)).toBe("  alpha");
    } finally {
      mounted.unmount();
    }
  });

  it("emits toggle payloads with the next collapsed state and click event", async () => {
    const onToggle = vi.fn();
    const App = defineComponent({
      name: "ThinkingTogglePayloadApp",
      setup() {
        return () =>
          h(TThinkingView, {
            x: 0,
            y: 0,
            w: 24,
            title: "Thinking",
            collapsed: false,
            onToggle,
          });
      },
    });
    const app = createTerminalApp({ cols: 24, rows: 2, component: App });

    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "click", cellX: 0, cellY: 0, button: 0 } as any);

      expect(onToggle).toHaveBeenCalledTimes(1);
      expect(onToggle.mock.calls[0]?.[0]).toMatchObject({
        collapsed: true,
        event: { cellX: 0, cellY: 0 },
      });
    } finally {
      app.dispose();
    }
  });

  it("preserves body whitespace", () => {
    const model = resolveTThinkingViewModel({
      w: 24,
      title: "Thinking",
      content: "  indented\n\ntrailing\n",
    });

    expect(model.bodyRows).toEqual(["    indented", "  ", "  trailing", "  "]);
  });
});
