import type {
  TLogDataSource,
  TLogLinkPanelItem,
  TLogLinksPanelActiveChangePayload,
  TLogLinksPanelActivatePayload,
  TLogLinksPanelSelectPayload,
  TLogLinkAction,
  TLogViewHandle,
} from "../src/experimental.js";
import { describe, expect, it, vi } from "vitest";
import { createTerminalApp } from "../src/cli.js";
import { TLogLinksPanel, TLogView, useTLogLinkController } from "../src/experimental.js";
import {
  createApp,
  defineComponent,
  h,
  mountTerminal,
  nextTick,
  onMounted,
  ref,
} from "./ui-regressions-support.js";

function rowText(
  mounted: { terminal: ReturnType<typeof createTerminalApp>["terminal"] },
  y: number,
): string {
  return mounted.terminal
    .getRow(y)
    .map((cell) => cell.ch)
    .join("")
    .trimEnd();
}

function rowStyles(
  mounted: { terminal: ReturnType<typeof createTerminalApp>["terminal"] },
  y: number,
) {
  return mounted.terminal.getRow(y).map((cell) => cell.style);
}

describe("TLogLinksPanel", () => {
  it("renders visible link items with line number text and href", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TLogLinksPanel, {
          x: 0,
          y: 0,
          w: 30,
          h: 2,
          links: [
            {
              visibleIndex: 0,
              href: "https://example.com/1",
              text: "alpha",
              absoluteLineIndex: 12,
              index: 12,
              startCell: 0,
              endCell: 5,
            },
            {
              visibleIndex: 1,
              href: "https://example.com/2",
              text: "beta",
              absoluteLineIndex: 1042,
              index: 42,
              startCell: 1,
              endCell: 5,
            },
          ] satisfies readonly TLogLinkPanelItem[],
        }),
      30,
      2,
    );

    try {
      expect(rowText(mounted, 0)).toBe("  12 alpha https://example.com");
      expect(rowText(mounted, 1)).toBe("1042 beta https://example.com/");
    } finally {
      mounted.unmount();
    }
  });

  it("composes active current and href styles", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TLogLinksPanel, {
          x: 0,
          y: 0,
          w: 24,
          h: 1,
          activeIndex: 0,
          activeStyle: { inverse: true },
          currentStyle: { bold: true },
          hrefStyle: { underline: true, fg: "yellow" },
          links: [
            {
              visibleIndex: 0,
              href: "https://e.dev",
              text: "alpha",
              absoluteLineIndex: 12,
              index: 12,
              startCell: 0,
              endCell: 5,
              current: true,
            },
          ] satisfies readonly TLogLinkPanelItem[],
        }),
      24,
      1,
    );

    try {
      const styles = rowStyles(mounted, 0);
      expect(styles[0]).toMatchObject({ inverse: true, bold: true });
      expect(styles[9]).toMatchObject({
        inverse: true,
        bold: true,
      });
      expect(styles[10]).toMatchObject({
        inverse: true,
        bold: true,
        underline: true,
        fg: "yellow",
      });
    } finally {
      mounted.unmount();
    }
  });

  it("emits select when clicking a row", async () => {
    const onSelect = vi.fn();
    const App = defineComponent({
      name: "TLogLinksPanelClickApp",
      setup() {
        return () =>
          h(TLogLinksPanel, {
            x: 0,
            y: 0,
            w: 24,
            h: 2,
            links: [
              {
                visibleIndex: 0,
                href: "https://example.com/1",
                text: "alpha",
                absoluteLineIndex: 10,
                index: 10,
                startCell: 0,
                endCell: 5,
              },
              {
                visibleIndex: 1,
                href: "https://example.com/2",
                text: "bravo",
                absoluteLineIndex: 20,
                index: 20,
                startCell: 0,
                endCell: 5,
              },
            ] satisfies readonly TLogLinkPanelItem[],
            onSelect,
          });
      },
    });

    const app = createTerminalApp({ cols: 24, rows: 2, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "click", cellX: 0, cellY: 1, time: Date.now() } as any);
      await nextTick();

      expect(onSelect).toHaveBeenCalledWith({
        visibleIndex: 1,
        item: expect.objectContaining({
          href: "https://example.com/2",
          absoluteLineIndex: 20,
        }),
      } satisfies TLogLinksPanelSelectPayload);
    } finally {
      app.dispose();
    }
  });

  it("supports keyboard active-row navigation and escape clearing", async () => {
    const onActiveChange = vi.fn();
    const App = defineComponent({
      name: "TLogLinksPanelKeyboardApp",
      setup() {
        return () =>
          h(TLogLinksPanel, {
            x: 0,
            y: 0,
            w: 24,
            h: 3,
            links: [
              {
                visibleIndex: 0,
                href: "https://example.com/1",
                text: "alpha",
                absoluteLineIndex: 10,
                index: 10,
                startCell: 0,
                endCell: 5,
              },
              {
                visibleIndex: 1,
                href: "https://example.com/2",
                text: "bravo",
                absoluteLineIndex: 11,
                index: 11,
                startCell: 0,
                endCell: 5,
              },
              {
                visibleIndex: 2,
                href: "https://example.com/3",
                text: "charlie",
                absoluteLineIndex: 12,
                index: 12,
                startCell: 0,
                endCell: 7,
              },
            ] satisfies readonly TLogLinkPanelItem[],
            onActiveChange,
          });
      },
    });

    const app = createTerminalApp({ cols: 24, rows: 3, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "click", cellX: 0, cellY: 0, time: Date.now() } as any);
      app.events.dispatch({
        type: "keydown",
        key: "ArrowDown",
        code: "ArrowDown",
        time: Date.now(),
      } as any);
      app.events.dispatch({ type: "keydown", key: "End", code: "End", time: Date.now() } as any);
      app.events.dispatch({ type: "keydown", key: "Home", code: "Home", time: Date.now() } as any);
      app.events.dispatch({
        type: "keydown",
        key: "ArrowUp",
        code: "ArrowUp",
        time: Date.now(),
      } as any);
      app.events.dispatch({
        type: "keydown",
        key: "Escape",
        code: "Escape",
        time: Date.now(),
      } as any);
      await nextTick();

      expect(onActiveChange.mock.calls.map((call) => call[0])).toEqual([
        {
          activeIndex: 0,
          item: expect.objectContaining({ visibleIndex: 0, text: "alpha" }),
        },
        {
          activeIndex: 1,
          item: expect.objectContaining({ visibleIndex: 1, text: "bravo" }),
        },
        {
          activeIndex: 2,
          item: expect.objectContaining({ visibleIndex: 2, text: "charlie" }),
        },
        {
          activeIndex: 0,
          item: expect.objectContaining({ visibleIndex: 0, text: "alpha" }),
        },
        {
          activeIndex: -1,
          item: null,
        },
      ] satisfies readonly TLogLinksPanelActiveChangePayload[]);
    } finally {
      app.dispose();
    }
  });

  it("emits activate on enter", async () => {
    const onActivate = vi.fn();
    const App = defineComponent({
      name: "TLogLinksPanelActivateApp",
      setup() {
        return () =>
          h(TLogLinksPanel, {
            x: 0,
            y: 0,
            w: 24,
            h: 1,
            activeIndex: 0,
            links: [
              {
                visibleIndex: 0,
                href: "https://example.com/1",
                text: "alpha",
                absoluteLineIndex: 10,
                index: 10,
                startCell: 0,
                endCell: 5,
              },
            ] satisfies readonly TLogLinkPanelItem[],
            onActivate,
          });
      },
    });

    const app = createTerminalApp({ cols: 24, rows: 1, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "click", cellX: 0, cellY: 0, time: Date.now() } as any);
      app.events.dispatch({
        type: "keydown",
        key: "Enter",
        code: "Enter",
        time: Date.now(),
      } as any);
      await nextTick();

      expect(onActivate).toHaveBeenCalledWith({
        visibleIndex: 0,
        item: expect.objectContaining({
          href: "https://example.com/1",
          text: "alpha",
        }),
      } satisfies TLogLinksPanelActivatePayload);
    } finally {
      app.dispose();
    }
  });

  it("clips horizontally from the logical row start when offset beyond the viewport", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TLogLinksPanel, {
          x: -2,
          y: 0,
          w: 6,
          h: 1,
          showLineNumbers: false,
          showHref: false,
          links: [
            {
              visibleIndex: 0,
              href: "https://example.com/1",
              text: "abcdefghi",
              absoluteLineIndex: 0,
              index: 0,
              startCell: 0,
              endCell: 9,
            },
          ] satisfies readonly TLogLinkPanelItem[],
        }),
      6,
      1,
    );

    try {
      expect(rowText(mounted, 0)).toBe("cdef");
    } finally {
      mounted.unmount();
    }
  });

  it("renders a safe empty state", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TLogLinksPanel, {
          x: 0,
          y: 0,
          w: 20,
          h: 2,
          links: [],
        }),
      20,
      2,
    );

    try {
      expect(rowText(mounted, 0)).toBe("No visible links");
      expect(rowStyles(mounted, 0)[0]).toMatchObject({ dim: true });
    } finally {
      mounted.unmount();
    }
  });
});

describe("TLogLinksPanel integration", () => {
  it("focuses and activates visible links through the controller", async () => {
    const logView = ref<TLogViewHandle | null>(null);
    const controller = ref<ReturnType<typeof useTLogLinkController> | null>(null);
    const actions = ref<readonly TLogLinkAction[]>([]);
    const source: TLogDataSource = {
      lineCount: () => 2,
      getLine: (index) =>
        index === 0
          ? "\x1b]8;;https://example.com/1\x07one\x1b]8;;\x07"
          : "\x1b]8;;https://example.com/2\x07two\x1b]8;;\x07",
      getLineKey: (index) => `line-${index}`,
    };

    const App = defineComponent({
      name: "TLogLinksPanelIntegrationApp",
      setup() {
        const links = useTLogLinkController(logView, {
          onAction(action) {
            actions.value = [...actions.value, action];
          },
        });
        controller.value = links;

        function refreshLinks(): void {
          links.refresh();
        }

        function onActiveChange(payload: TLogLinksPanelActiveChangePayload): void {
          if (payload.item) links.focusVisibleLink(payload.item.visibleIndex);
          else links.clearFocus();
        }

        onMounted(() => {
          links.refresh();
        });

        return () =>
          h("span", [
            h(TLogView, {
              ref: logView,
              x: 0,
              y: 0,
              w: 8,
              h: 2,
              source,
              version: 1,
              ansi: true,
              links: true,
              onScroll: refreshLinks,
              onLinkFocus: refreshLinks,
              onLinkClick: links.handleLinkClick,
              onLinkActivate: links.handleLinkActivate,
            }),
            h(TLogLinksPanel, {
              x: 9,
              y: 0,
              w: 22,
              h: 2,
              links: links.visibleLinks.value,
              activeIndex: links.activeIndex.value,
              onSelect: ({ visibleIndex }: TLogLinksPanelSelectPayload) =>
                links.focusVisibleLink(visibleIndex),
              onActiveChange,
              onActivate: ({ visibleIndex }: TLogLinksPanelActivatePayload) =>
                links.activateVisibleLink(visibleIndex),
            }),
          ]);
      },
    });

    const app = createTerminalApp({ cols: 31, rows: 2, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "click", cellX: 9, cellY: 1, time: Date.now() } as any);
      await nextTick();
      app.scheduler.flushNow();
      expect(controller.value?.focusVisibleLink(1)).toBe(true);
      await nextTick();
      app.scheduler.flushNow();

      expect(rowStyles(app, 1)[0]).toMatchObject({
        href: "https://example.com/2",
        inverse: true,
      });

      expect(controller.value?.activateVisibleLink(1)).toBe(true);
      await nextTick();
      app.scheduler.flushNow();

      expect(actions.value.at(-1)).toEqual({
        href: "https://example.com/2",
        text: "two",
        source: "panel",
        absoluteLineIndex: 1,
        index: 1,
        startCell: 0,
        endCell: 3,
      });
      expect(rowStyles(app, 1)[0]).toMatchObject({
        href: "https://example.com/2",
        inverse: true,
      });
    } finally {
      app.dispose();
    }
  });
});
