import type {
  TLogLinkAction,
  TLogViewHandle,
  TLogViewScrollMetrics,
  TLogViewVisibleLink,
} from "../src/experimental.js";
import { describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, nextTick, ref } from "./ui-regressions-support.js";
import { useTLogLinkController } from "../src/experimental.js";

async function mountHarness(
  logView: ReturnType<typeof ref<TLogViewHandle | null>>,
  options?: Parameters<typeof useTLogLinkController>[1],
): Promise<{
  api: ReturnType<typeof useTLogLinkController>;
  unmount: () => void;
}> {
  const root = document.createElement("div");
  document.body.appendChild(root);
  let api!: ReturnType<typeof useTLogLinkController>;

  const App = defineComponent({
    name: "UseTLogLinkControllerHarness",
    setup() {
      api = useTLogLinkController(logView, options);
      return () => null;
    },
  });

  const app = createApp(App);
  app.mount(root);
  await nextTick();

  return {
    api,
    unmount: () => {
      app.unmount();
      root.remove();
    },
  };
}

function createMetrics(): TLogViewScrollMetrics {
  return {
    scrollTop: 10,
    maxScrollTop: 100,
    viewportRows: 20,
    lineCount: 200,
    firstLineIndex: 10,
    estimatedVisualRowCount: 200,
    visualRowCount: 200,
    measuredVisualRowCount: 200,
    measuredLineCount: 200,
    visualIndexStatus: "exact",
    atTop: false,
    atBottom: false,
  };
}

function createVisibleLinks(): readonly TLogViewVisibleLink[] {
  return [
    {
      visibleIndex: 0,
      href: "https://example.com/1",
      text: "one",
      absoluteLineIndex: 10,
      index: 10,
      startCell: 0,
      endCell: 3,
      startX: 0,
      endX: 3,
      y: 0,
    },
    {
      visibleIndex: 1,
      href: "https://example.com/2",
      text: "two",
      absoluteLineIndex: 11,
      index: 11,
      startCell: 1,
      endCell: 4,
      startX: 1,
      endX: 4,
      y: 1,
      focused: true,
    },
  ];
}

describe("useTLogLinkController", () => {
  it("refreshes panel items and active index from visible links", async () => {
    const visibleLinks = createVisibleLinks();
    const logView = ref<TLogViewHandle | null>({
      getVisibleLinks: () => visibleLinks,
      getScrollMetrics: () => createMetrics(),
    } as Partial<TLogViewHandle> as TLogViewHandle);
    const harness = await mountHarness(logView);

    try {
      harness.api.refresh();

      expect(harness.api.visibleLinks.value).toEqual([
        {
          visibleIndex: 0,
          href: "https://example.com/1",
          text: "one",
          absoluteLineIndex: 10,
          index: 10,
          startCell: 0,
          endCell: 3,
        },
        {
          visibleIndex: 1,
          href: "https://example.com/2",
          text: "two",
          absoluteLineIndex: 11,
          index: 11,
          startCell: 1,
          endCell: 4,
          current: true,
        },
      ]);
      expect(harness.api.activeIndex.value).toBe(1);
    } finally {
      harness.unmount();
    }
  });

  it("focuses visible links through the handle and refreshes active index", async () => {
    const focused = ref(0);
    const focusVisibleLink = vi.fn((index: number) => {
      focused.value = index;
      return true;
    });
    const logView = ref<TLogViewHandle | null>({
      focusVisibleLink,
      getVisibleLinks: () =>
        createVisibleLinks().map((link, index) => ({
          ...link,
          focused: index === focused.value || undefined,
        })),
      getScrollMetrics: () => createMetrics(),
    } as Partial<TLogViewHandle> as TLogViewHandle);
    const harness = await mountHarness(logView);

    try {
      expect(harness.api.focusVisibleLink(1)).toBe(true);
      expect(focusVisibleLink).toHaveBeenCalledWith(1);
      expect(harness.api.activeIndex.value).toBe(1);
    } finally {
      harness.unmount();
    }
  });

  it("activates a visible link by focusing then activating it", async () => {
    const actions: TLogLinkAction[] = [];
    const focused = ref(0);
    const focusVisibleLink = vi.fn((index: number) => {
      focused.value = index;
      return true;
    });
    const activateFocusedLink = vi.fn(() => true);
    const logView = ref<TLogViewHandle | null>({
      focusVisibleLink,
      activateFocusedLink,
      getVisibleLinks: () =>
        createVisibleLinks().map((link, index) => ({
          ...link,
          focused: index === focused.value || undefined,
        })),
      getScrollMetrics: () => createMetrics(),
    } as Partial<TLogViewHandle> as TLogViewHandle);
    const harness = await mountHarness(logView, {
      onAction(action) {
        actions.push(action);
      },
    });

    try {
      expect(harness.api.activateVisibleLink(1)).toBe(true);
      expect(focusVisibleLink).toHaveBeenCalledWith(1);
      expect(activateFocusedLink).toHaveBeenCalledTimes(1);
      expect(actions).toEqual([
        {
          href: "https://example.com/2",
          text: "two",
          source: "panel",
          absoluteLineIndex: 11,
          index: 11,
          startCell: 1,
          endCell: 4,
        },
      ]);
    } finally {
      harness.unmount();
    }
  });

  it("normalizes link click payloads into actions", async () => {
    const onAction = vi.fn();
    const logView = ref<TLogViewHandle | null>(null);
    const harness = await mountHarness(logView, { onAction });

    try {
      harness.api.handleLinkClick({
        href: "https://example.com",
        text: "docs",
        absoluteLineIndex: 42,
        index: 2,
        startCell: 3,
        endCell: 7,
        cellX: 4,
        cellY: 1,
      });

      expect(onAction).toHaveBeenCalledWith({
        href: "https://example.com",
        text: "docs",
        source: "click",
        absoluteLineIndex: 42,
        index: 2,
        startCell: 3,
        endCell: 7,
      });
    } finally {
      harness.unmount();
    }
  });

  it("normalizes link activate payloads and suppresses duplicates from programmatic activation", async () => {
    const actions: TLogLinkAction[] = [];
    const activateFocusedLink = vi.fn(() => true);
    const logView = ref<TLogViewHandle | null>({
      activateFocusedLink,
      getVisibleLinks: () => createVisibleLinks(),
      getScrollMetrics: () => createMetrics(),
    } as Partial<TLogViewHandle> as TLogViewHandle);
    const harness = await mountHarness(logView, {
      onAction(action) {
        actions.push(action);
      },
    });

    try {
      harness.api.refresh();
      expect(harness.api.activateFocusedLink()).toBe(true);
      harness.api.handleLinkActivate({
        link: createVisibleLinks()[1]!,
        source: "programmatic",
      });
      harness.api.handleLinkActivate({
        link: createVisibleLinks()[1]!,
        source: "keyboard",
      });

      expect(actions).toEqual([
        {
          href: "https://example.com/2",
          text: "two",
          source: "programmatic",
          absoluteLineIndex: 11,
          index: 11,
          startCell: 1,
          endCell: 4,
        },
        {
          href: "https://example.com/2",
          text: "two",
          source: "keyboard",
          absoluteLineIndex: 11,
          index: 11,
          startCell: 1,
          endCell: 4,
        },
      ]);
    } finally {
      harness.unmount();
    }
  });
});
