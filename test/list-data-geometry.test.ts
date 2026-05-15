import { describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref, vShow, withDirectives } from "vue";
import { TList, TText, TView } from "../src/index.js";
import { TRenderPlane, useTerminal } from "../src/vue.js";
import { createTerminalApp } from "../src/cli.js";
import { disableRaf, installRaf, rowText } from "./helpers/list.js";

describe("TList data geometry", () => {
  it("does not synchronously commit while mounting an initially scrolled TList", () => {
    const commits: unknown[] = [];
    const app = createTerminalApp({
      cols: 20,
      rows: 8,
      component: defineComponent({
        name: "InitialScrolledTListMountApp",
        setup() {
          return () => [
            h(TList, {
              x: 0,
              y: 0,
              w: 12,
              h: 4,
              items: Array.from({ length: 100 }, (_, index) => `item-${index}`),
              modelValue: 50,
              autoFocus: true,
            }),
            h(TText, { x: 0, y: 6, value: "sibling" }),
          ];
        },
      }),
    });

    const off = app.terminal.on("commit", (commit) => commits.push(commit));
    try {
      app.mount();
      expect(commits).toHaveLength(0);

      app.scheduler.flushNow();
      expect(rowText(app, 0)).toBe("item-47");
      expect(rowText(app, 6)).toBe("sibling");
    } finally {
      off();
      app.dispose();
    }
  });

  it("preserves detached scrollTop when the list becomes fully clipped and visible again", async () => {
    const items = Array.from({ length: 200 }, (_, index) => `item-${index}`);
    const onScroll = vi.fn();
    let viewportH!: { value: number };

    const App = defineComponent({
      name: "TListFullyClippedViewportApp",
      setup() {
        viewportH = ref(4);
        return () =>
          h(
            TView,
            { x: 0, y: 0, w: 12, h: viewportH.value },
            {
              default: () =>
                h(TList, {
                  x: 0,
                  y: 0,
                  w: 12,
                  h: 10,
                  items,
                  modelValue: 0,
                  autoFocus: true,
                  onScroll,
                }),
            },
          );
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 10000, time: 1_000 });
      app.scheduler.flushNow();
      await nextTick();

      expect(rowText(app, 0)).toBe("item-100");

      viewportH.value = 0;
      await nextTick();
      app.scheduler.flushNow();

      expect(onScroll.mock.calls.some(([top]) => top === 0)).toBe(false);

      viewportH.value = 4;
      await nextTick();
      app.scheduler.flushNow();

      expect(rowText(app, 0)).toBe("item-100");
    } finally {
      app.dispose();
    }
  });

  for (const clippedAxis of ["height", "width"] as const) {
    it(`cancels pending wheel when the list becomes fully clipped by ${clippedAxis} before the frame`, async () => {
      const raf = installRaf();
      const items = Array.from({ length: 200 }, (_, index) => `item-${index}`);
      const onScroll = vi.fn();
      const onUpdateModelValue = vi.fn();
      const commits: unknown[] = [];
      let viewportW!: { value: number };
      let viewportH!: { value: number };

      const App = defineComponent({
        name: "TListPendingWheelFullClipApp",
        setup() {
          viewportW = ref(12);
          viewportH = ref(4);
          return () =>
            h(
              TView,
              { x: 0, y: 0, w: viewportW.value, h: viewportH.value },
              {
                default: () =>
                  h(TList, {
                    x: 0,
                    y: 0,
                    w: 12,
                    h: 10,
                    items,
                    modelValue: 0,
                    autoFocus: true,
                    onScroll,
                    "onUpdate:modelValue": onUpdateModelValue,
                  }),
              },
            );
        },
      });
      const app = createTerminalApp({ cols: 20, rows: 8, component: App });
      const offCommit = app.terminal.on("commit", (commit) => commits.push(commit));

      try {
        app.mount();
        app.scheduler.flushNow();

        app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 10000, time: 1_000 });
        expect(raf.callbacks.size).toBe(1);

        if (clippedAxis === "height") viewportH.value = 0;
        else viewportW.value = 0;
        await nextTick();
        app.scheduler.flushNow();

        commits.length = 0;
        onScroll.mockClear();
        onUpdateModelValue.mockClear();

        raf.runNext();
        await nextTick();
        app.scheduler.flushNow();
        expect(onScroll).not.toHaveBeenCalled();
        expect(onUpdateModelValue).not.toHaveBeenCalled();
        expect(commits).toHaveLength(0);

        viewportW.value = 12;
        viewportH.value = 4;
        await nextTick();
        app.scheduler.flushNow();

        expect(rowText(app, 0)).toBe("item-0");
      } finally {
        offCommit();
        app.dispose();
        raf.restore();
      }
    });
  }

  it("repaints items replaced synchronously from onScroll", async () => {
    const App = defineComponent({
      name: "ListWheelOnScrollReplaceItemsApp",
      setup() {
        const items = ref(Array.from({ length: 100 }, (_, index) => `item-${index}`));
        return () =>
          h(TList, {
            x: 0,
            y: 0,
            w: 12,
            h: 4,
            items: items.value,
            modelValue: 0,
            autoFocus: true,
            onScroll: () => {
              items.value = Array.from({ length: 100 }, (_, index) => `next-${index}`);
            },
          });
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();
      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 100, time: 1_000 });
      app.scheduler.flushNow();
      await nextTick();
      app.scheduler.flushNow();

      expect(rowText(app, 0)).toBe("next-1");
    } finally {
      app.dispose();
    }
  });

  it("clamps active and scrollTop when onScroll synchronously shrinks items", async () => {
    const onUpdateModelValue = vi.fn();
    const scrollCalls: number[] = [];
    const App = defineComponent({
      name: "ListWheelOnScrollShrinkItemsApp",
      setup() {
        const items = ref(Array.from({ length: 100 }, (_, index) => `item-${index}`));
        return () =>
          h(TList, {
            x: 0,
            y: 0,
            w: 12,
            h: 4,
            items: items.value,
            modelValue: 50,
            autoFocus: true,
            onScroll: (top: number) => {
              scrollCalls.push(top);
              if (items.value.length > 10) items.value = items.value.slice(0, 10);
            },
            "onUpdate:modelValue": onUpdateModelValue,
          });
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();
      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 10000, time: 1_000 });
      app.scheduler.flushNow();
      await nextTick();
      app.scheduler.flushNow();

      expect(onUpdateModelValue).not.toHaveBeenCalled();
      expect(scrollCalls.at(-1)).toBe(6);
      expect(rowText(app, 0)).toBe("item-6");
      expect(app.terminal.getRow(3)[0]?.style.inverse).toBe(true);
    } finally {
      app.dispose();
    }
  });

  it("external modelValue and same-tick items replacement beat a stale pending wheel", async () => {
    const raf = installRaf();
    const onScroll = vi.fn();
    let replaceData!: () => void;
    const App = defineComponent({
      name: "ListWheelPendingReplacementApp",
      setup() {
        const modelValue = ref(0);
        const items = ref(Array.from({ length: 200 }, (_, index) => `item-${index}`));
        replaceData = () => {
          modelValue.value = 50;
          items.value = Array.from({ length: 200 }, (_, index) => `next-${index}`);
        };
        return () =>
          h(TList, {
            x: 0,
            y: 0,
            w: 12,
            h: 4,
            items: items.value,
            modelValue: modelValue.value,
            autoFocus: true,
            onScroll,
            "onUpdate:modelValue": (value: number) => {
              modelValue.value = value;
            },
          });
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();
      raf.callbacks.clear();

      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 10000, time: 1_000 });
      expect(raf.callbacks.size).toBe(1);

      replaceData();
      await nextTick();
      app.scheduler.flushNow();

      raf.runNext();
      await nextTick();
      app.scheduler.flushNow();

      expect(onScroll).not.toHaveBeenCalled();
      expect(rowText(app, 0)).toBe("next-47");
      expect(app.terminal.getRow(3)[0]?.style.inverse).toBe(true);
    } finally {
      app.dispose();
      raf.restore();
    }
  });

  it("repaints a detached viewport when items are replaced with the same length", async () => {
    let replaceItems!: () => void;
    let framePerf: ReturnType<typeof useTerminal>["observability"]["framePerf"] | null = null;
    const onUpdateModelValue = vi.fn();

    const Probe = defineComponent({
      name: "DetachedSameLengthReplacementPerfProbe",
      setup() {
        framePerf = useTerminal().observability.framePerf;
        framePerf.enabled.value = true;
        return () => null;
      },
    });

    const App = defineComponent({
      name: "DetachedSameLengthReplacementApp",
      setup() {
        const items = ref(Array.from({ length: 100 }, (_, index) => `item-${index}`));
        replaceItems = () => {
          items.value = Array.from({ length: 100 }, (_, index) => `next-${index}`);
        };
        return () => [
          h(Probe),
          h(TList, {
            x: 0,
            y: 0,
            w: 12,
            h: 20,
            items: items.value,
            modelValue: 0,
            autoFocus: true,
            "onUpdate:modelValue": onUpdateModelValue,
          }),
          ...Array.from({ length: 300 }, (_, index) =>
            h(TText, {
              key: index,
              x: 0,
              y: 30,
              w: 12,
              value: `sibling-${index}`,
            }),
          ),
        ];
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 50, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();
      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 1000, time: 1_000 });
      app.scheduler.flushNow();
      await nextTick();
      const top = Number(rowText(app, 0).slice("item-".length));
      framePerf!.clear();

      replaceItems();
      await nextTick();
      app.scheduler.flushNow();

      expect(rowText(app, 0)).toBe(`next-${top}`);
      expect(onUpdateModelValue).not.toHaveBeenCalled();
      expect(framePerf!.latest()).toMatchObject({
        reason: "data",
        paintedNodes: 1,
      });
      expect(framePerf!.latest()?.dirtyRows).toBeLessThanOrEqual(20);
      expect(framePerf!.latest()?.scannedNodes).toBeLessThan(50);
    } finally {
      app.dispose();
    }
  });

  it("repaints same-length in-place item mutation when itemVersion changes", async () => {
    let mutate!: () => void;
    const App = defineComponent({
      name: "TListItemVersionMutationApp",
      setup() {
        const items = ref(["item-0", "item-1", "item-2", "item-3"]);
        const itemVersion = ref(0);
        mutate = () => {
          items.value[2] = "changed";
          itemVersion.value++;
        };
        return () =>
          h(TList, {
            x: 0,
            y: 0,
            w: 12,
            h: 4,
            items: items.value,
            itemVersion: itemVersion.value,
            modelValue: 0,
            autoFocus: true,
          });
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();

      mutate();
      await nextTick();
      app.scheduler.flushNow();

      expect(rowText(app, 2)).toBe("changed");
    } finally {
      app.dispose();
    }
  });

  it("limits itemVersion same-length repaint to viewport rows", async () => {
    let mutate!: () => void;
    let framePerf: ReturnType<typeof useTerminal>["observability"]["framePerf"] | null = null;

    const Probe = defineComponent({
      name: "TListItemVersionFramePerfProbe",
      setup() {
        framePerf = useTerminal().observability.framePerf;
        framePerf.enabled.value = true;
        return () => null;
      },
    });

    const App = defineComponent({
      name: "TListItemVersionViewportRepaintApp",
      setup() {
        const items = ref(["item-0", "item-1", "item-2", "item-3"]);
        const itemVersion = ref(0);
        mutate = () => {
          items.value[2] = "changed";
          itemVersion.value++;
        };
        return () => [
          h(Probe),
          h(TList, {
            x: 0,
            y: 0,
            w: 12,
            h: 4,
            items: items.value,
            itemVersion: itemVersion.value,
            modelValue: 0,
            autoFocus: true,
          }),
        ];
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();
      framePerf!.clear();

      mutate();
      await nextTick();
      app.scheduler.flushNow();

      expect(rowText(app, 2)).toBe("changed");
      expect(framePerf!.latest()).toMatchObject({
        reason: "data",
        paintedNodes: 1,
      });
      expect(framePerf!.latest()?.dirtyRows).toBeLessThanOrEqual(4);
    } finally {
      app.dispose();
    }
  });

  it("keeps pending detached wheel target across itemVersion change before the frame", async () => {
    const raf = installRaf();
    let mutate!: () => void;
    const App = defineComponent({
      name: "TListPendingWheelItemVersionApp",
      setup() {
        const items = ref(Array.from({ length: 200 }, (_, index) => `item-${index}`));
        const itemVersion = ref(0);
        mutate = () => {
          items.value[100] = "changed";
          itemVersion.value++;
        };
        return () =>
          h(TList, {
            x: 0,
            y: 0,
            w: 12,
            h: 4,
            items: items.value,
            itemVersion: itemVersion.value,
            modelValue: 0,
            autoFocus: true,
          });
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();
      raf.callbacks.clear();

      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 10000, time: 1_000 });
      expect(raf.callbacks.size).toBe(1);

      mutate();
      await nextTick();
      app.scheduler.flushNow();

      raf.runNext();
      await nextTick();
      app.scheduler.flushNow();

      expect(rowText(app, 0)).toBe("changed");
    } finally {
      app.dispose();
      raf.restore();
    }
  });

  it("does not reattach detached viewport on parent re-render with the same modelValue", async () => {
    let rerender!: () => void;
    const App = defineComponent({
      name: "DetachedSameModelValueRerenderApp",
      setup() {
        const tick = ref(0);
        rerender = () => {
          tick.value++;
        };
        return () => [
          h(TList, {
            x: 0,
            y: 0,
            w: 12,
            h: 4,
            items: Array.from({ length: 100 }, (_, index) => `item-${index}`),
            modelValue: 2,
            autoFocus: true,
          }),
          h(TText, { x: 0, y: 6, value: `tick-${tick.value}` }),
        ];
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();
      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 100, time: 1_000 });
      app.scheduler.flushNow();
      await nextTick();

      expect(rowText(app, 0)).toBe("item-1");

      rerender();
      await nextTick();
      app.scheduler.flushNow();

      expect(rowText(app, 0)).toBe("item-1");
      expect(rowText(app, 6)).toBe("tick-1");
    } finally {
      app.dispose();
    }
  });

  it("restores controlled modelValue when items grow after an initial empty list", async () => {
    let load!: () => void;
    const App = defineComponent({
      name: "ControlledModelValueGrowthApp",
      setup() {
        const items = ref<string[]>([]);
        load = () => {
          items.value = Array.from({ length: 100 }, (_, index) => `item-${index}`);
        };
        return () =>
          h(TList, {
            x: 0,
            y: 0,
            w: 12,
            h: 4,
            items: items.value,
            modelValue: 50,
            autoFocus: true,
          });
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();

      load();
      await nextTick();
      app.scheduler.flushNow();

      expect(rowText(app, 0)).toBe("item-47");
      expect(app.terminal.getRow(3)[0]?.style.inverse).toBe(true);
    } finally {
      app.dispose();
    }
  });

  it("restores controlled modelValue after shrink then grow when not detached", async () => {
    let setLength!: (next: number) => void;
    const App = defineComponent({
      name: "ControlledModelValueShrinkGrowApp",
      setup() {
        const items = ref(Array.from({ length: 100 }, (_, index) => `item-${index}`));
        setLength = (next) => {
          items.value = Array.from({ length: next }, (_, index) => `item-${index}`);
        };
        return () =>
          h(TList, {
            x: 0,
            y: 0,
            w: 12,
            h: 4,
            items: items.value,
            modelValue: 50,
            autoFocus: true,
          });
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();
      expect(rowText(app, 0)).toBe("item-47");

      setLength(10);
      await nextTick();
      app.scheduler.flushNow();
      expect(rowText(app, 0)).toBe("item-6");

      setLength(100);
      await nextTick();
      app.scheduler.flushNow();
      expect(rowText(app, 0)).toBe("item-47");
    } finally {
      app.dispose();
    }
  });

  it("restores controlled modelValue after shrinking to empty and growing again", async () => {
    let setLength!: (next: number) => void;
    const App = defineComponent({
      name: "ControlledModelValueEmptyShrinkGrowApp",
      setup() {
        const items = ref(Array.from({ length: 100 }, (_, index) => `item-${index}`));
        setLength = (next) => {
          items.value = Array.from({ length: next }, (_, index) => `item-${index}`);
        };
        return () =>
          h(TList, {
            x: 0,
            y: 0,
            w: 12,
            h: 4,
            items: items.value,
            modelValue: 50,
            autoFocus: true,
          });
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();
      expect(rowText(app, 0)).toBe("item-47");

      setLength(0);
      await nextTick();
      app.scheduler.flushNow();
      expect(rowText(app, 0)).toBe("(empty)");

      setLength(100);
      await nextTick();
      app.scheduler.flushNow();
      expect(rowText(app, 0)).toBe("item-47");
    } finally {
      app.dispose();
    }
  });

  it("updates the active style when the style object is replaced", async () => {
    let setStyle!: (fg: string) => void;
    const App = defineComponent({
      name: "TListStyleReplacementApp",
      setup() {
        const style = ref({ fg: "red" });
        setStyle = (fg) => {
          style.value = { fg };
        };
        return () =>
          h(TList, {
            x: 0,
            y: 0,
            w: 12,
            h: 4,
            items: ["a", "b", "c", "d"],
            modelValue: 0,
            autoFocus: true,
            style: style.value,
          });
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();
      expect(app.terminal.getRow(0)[0]?.style.fg).toBe("red");

      setStyle("blue");
      await nextTick();
      app.scheduler.flushNow();

      expect(app.terminal.getRow(0)[0]?.style.fg).toBe("blue");
      expect(app.terminal.getRow(0)[0]?.style.inverse).toBe(true);
    } finally {
      app.dispose();
    }
  });

  it("does not keep stale active style when style object is mutated in place", async () => {
    const style = { fg: "red" };
    const app = createTerminalApp({
      cols: 20,
      rows: 8,
      component: TList,
      props: {
        x: 0,
        y: 0,
        w: 12,
        h: 4,
        items: ["a", "b", "c", "d"],
        modelValue: 0,
        autoFocus: true,
        style,
      },
    });

    try {
      app.mount();
      app.scheduler.flushNow();
      expect(app.terminal.getRow(0)[0]?.style.fg).toBe("red");

      style.fg = "blue";
      app.events.dispatch({ type: "keydown", key: "ArrowDown", code: "ArrowDown", time: 1_000 });
      app.scheduler.flushNow();
      await nextTick();

      expect(app.terminal.getRow(1)[0]?.style.fg).toBe("blue");
      expect(app.terminal.getRow(1)[0]?.style.inverse).toBe(true);
    } finally {
      app.dispose();
    }
  });

  it("emits scroll when data shrink programmatically clamps viewport", async () => {
    let shrink!: () => void;
    const onScroll = vi.fn();
    const App = defineComponent({
      name: "ListWheelShrinkClampApp",
      setup() {
        const items = ref(Array.from({ length: 200 }, (_, index) => `item-${index}`));
        shrink = () => {
          items.value = items.value.slice(0, 20);
        };
        return () =>
          h(TList, {
            x: 0,
            y: 0,
            w: 12,
            h: 4,
            items: items.value,
            modelValue: 0,
            autoFocus: true,
            onScroll,
          });
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();
      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 10000, time: 1_000 });
      app.scheduler.flushNow();
      await nextTick();

      shrink();
      await nextTick();
      app.scheduler.flushNow();

      expect(rowText(app, 0)).toBe("item-16");
      expect(onScroll).toHaveBeenLastCalledWith(16);
    } finally {
      app.dispose();
    }
  });

  it("pending wheel plus data shrink before the frame does not apply a stale top", async () => {
    const raf = installRaf();
    let shrink!: () => void;
    const onScroll = vi.fn();
    const App = defineComponent({
      name: "PendingWheelDataShrinkApp",
      setup() {
        const items = ref(Array.from({ length: 200 }, (_, index) => `item-${index}`));
        shrink = () => {
          items.value = items.value.slice(0, 20);
        };
        return () =>
          h(TList, {
            x: 0,
            y: 0,
            w: 12,
            h: 4,
            items: items.value,
            modelValue: 0,
            autoFocus: true,
            onScroll,
          });
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();
      raf.callbacks.clear();

      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 10000, time: 1_000 });
      expect(raf.callbacks.size).toBe(1);

      shrink();
      await nextTick();
      app.scheduler.flushNow();

      raf.runNext();
      await nextTick();
      app.scheduler.flushNow();

      expect(rowText(app, 0)).toBe("item-16");
      expect(onScroll).toHaveBeenLastCalledWith(16);
    } finally {
      app.dispose();
      raf.restore();
    }
  });

  it("uses the clamped pending wheel top as the base for the next wheel before the frame", async () => {
    const raf = installRaf();
    let shrink!: () => void;
    const onScroll = vi.fn();
    const App = defineComponent({
      name: "PendingWheelClampedBaseApp",
      setup() {
        const items = ref(Array.from({ length: 200 }, (_, index) => `item-${index}`));
        shrink = () => {
          items.value = items.value.slice(0, 54);
        };
        return () =>
          h(TList, {
            x: 0,
            y: 0,
            w: 12,
            h: 4,
            items: items.value,
            modelValue: 0,
            autoFocus: true,
            onScroll,
          });
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();
      raf.callbacks.clear();

      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 10000, time: 1_000 });
      expect(raf.callbacks.size).toBe(1);

      shrink();
      await nextTick();
      expect(onScroll).not.toHaveBeenCalled();

      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: -100, time: 1_100 });
      expect(raf.callbacks.size).toBe(1);

      raf.runNext();
      await nextTick();
      app.scheduler.flushNow();

      expect(onScroll).toHaveBeenCalledOnce();
      expect(onScroll).toHaveBeenLastCalledWith(49);
      expect(rowText(app, 0)).toBe("item-49");
    } finally {
      app.dispose();
      raf.restore();
    }
  });

  it("cancels pending wheel when data shrink clamps it to the clamped scrollTop", async () => {
    const raf = installRaf();
    let shrink!: () => void;
    const onScroll = vi.fn();
    let framePerf: ReturnType<typeof useTerminal>["observability"]["framePerf"] | null = null;

    const Probe = defineComponent({
      name: "TListClampPendingWheelPerfProbe",
      setup() {
        framePerf = useTerminal().observability.framePerf;
        framePerf.enabled.value = true;
        return () => null;
      },
    });

    const App = defineComponent({
      name: "TListClampPendingWheelApp",
      setup() {
        const items = ref(Array.from({ length: 200 }, (_, index) => `item-${index}`));
        shrink = () => {
          items.value = items.value.slice(0, 84);
        };
        return () => [
          h(Probe),
          h(TList, {
            x: 0,
            y: 0,
            w: 12,
            h: 4,
            items: items.value,
            modelValue: 0,
            autoFocus: true,
            onScroll,
          }),
        ];
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 10000, time: 1_000 });
      app.scheduler.flushNow();
      await nextTick();
      expect(onScroll).toHaveBeenLastCalledWith(100);

      framePerf!.clear();
      raf.callbacks.clear();

      const prevented = app.events.dispatch({
        type: "wheel",
        cellX: 0,
        cellY: 0,
        deltaY: 5000,
        time: 2_000,
      });
      expect(prevented).toBe(true);
      expect(raf.callbacks.size).toBe(1);

      shrink();
      await nextTick();
      app.scheduler.flushNow();

      expect(onScroll).toHaveBeenLastCalledWith(80);
      expect(framePerf!.latest()).toMatchObject({
        reason: "data",
        frameTaskCount: 0,
      });
      expect(
        framePerf!.list().some((sample) => sample.reason === "scroll" && sample.frameTaskCount > 0),
      ).toBe(false);
    } finally {
      app.dispose();
      raf.restore();
    }
  });

  it("repaints when items are mutated in place", async () => {
    let pushItem!: () => void;
    const App = defineComponent({
      name: "InPlaceItemsPushApp",
      setup() {
        const items = ref(["item-0", "item-1", "item-2", "item-3"]);
        pushItem = () => {
          items.value.push(`item-${items.value.length}`);
        };
        return () =>
          h(TList, {
            x: 0,
            y: 0,
            w: 12,
            h: 5,
            items: items.value,
            modelValue: 0,
            autoFocus: true,
          });
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();

      pushItem();
      await nextTick();
      app.scheduler.flushNow();

      expect(rowText(app, 4)).toBe("item-4");
    } finally {
      app.dispose();
    }
  });

  it("clamps and repaints when items are spliced in place", async () => {
    let spliceItems!: () => void;
    const App = defineComponent({
      name: "InPlaceItemsSpliceApp",
      setup() {
        const items = ref(Array.from({ length: 30 }, (_, index) => `item-${index}`));
        spliceItems = () => {
          items.value.splice(10);
        };
        return () =>
          h(TList, {
            x: 0,
            y: 0,
            w: 12,
            h: 4,
            items: items.value,
            modelValue: 0,
            autoFocus: true,
          });
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();
      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 3000, time: 1_000 });
      app.scheduler.flushNow();
      await nextTick();

      spliceItems();
      await nextTick();
      app.scheduler.flushNow();

      expect(rowText(app, 0)).toBe("item-6");
    } finally {
      app.dispose();
    }
  });

  it("clipped viewport expansion clamps internal scrollTop", async () => {
    const onScroll = vi.fn();
    let setHeight!: (value: number) => void;
    const items = Array.from({ length: 100 }, (_, index) => `item-${index}`);
    const App = defineComponent({
      name: "ClippedViewportExpansionClampApp",
      setup() {
        const height = ref(4);
        setHeight = (value) => {
          height.value = value;
        };
        return () =>
          h(
            TView,
            { x: 0, y: 0, w: 12, h: height.value },
            {
              default: () =>
                h(TList, {
                  x: 0,
                  y: 0,
                  w: 12,
                  h: 20,
                  items,
                  modelValue: 0,
                  autoFocus: true,
                  onScroll,
                }),
            },
          );
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 24, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();
      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 10000, time: 1_000 });
      app.scheduler.flushNow();
      await nextTick();

      expect(rowText(app, 0)).toBe("item-96");

      setHeight(20);
      await nextTick();
      app.scheduler.flushNow();

      expect(rowText(app, 0)).toBe("item-80");
      expect(onScroll).toHaveBeenLastCalledWith(80);
    } finally {
      app.dispose();
    }
  });

  it("does not dirty visible terminal rows when hidden TList data changes", async () => {
    let setItems!: (items: string[]) => void;
    const show = ref(true);
    const commits: unknown[] = [];

    const App = defineComponent({
      name: "HiddenTListDataChangeApp",
      setup() {
        const items = ref(["hidden-0", "hidden-1"]);
        setItems = (next) => {
          items.value = next;
        };

        return () => [
          withDirectives(
            h(TList, {
              x: 0,
              y: 0,
              w: 12,
              h: 4,
              items: items.value,
              modelValue: 0,
              autoFocus: true,
            }),
            [[vShow, show.value]],
          ),
          h(TText, { x: 0, y: 0, value: "visible" }),
        ];
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });

    const off = app.terminal.on("commit", (commit) => commits.push(commit));
    try {
      app.mount();
      app.scheduler.flushNow();
      show.value = false;
      await nextTick();
      await nextTick();
      app.scheduler.flushNow();
      commits.length = 0;

      setItems(Array.from({ length: 100 }, (_, index) => `hidden-${index}`));
      await nextTick();
      app.scheduler.flushNow();

      expect(rowText(app, 0)).toBe("visible");
      expect(commits).toHaveLength(0);
    } finally {
      off();
      app.dispose();
    }
  });

  it("emits hidden programmatic clamp without committing visible rows", async () => {
    let shrink!: () => void;
    const show = ref(true);
    const onScroll = vi.fn();
    const commits: unknown[] = [];

    const App = defineComponent({
      name: "HiddenTListClampApp",
      setup() {
        const items = ref(Array.from({ length: 200 }, (_, index) => `hidden-${index}`));
        shrink = () => {
          items.value = items.value.slice(0, 20);
        };

        return () => [
          withDirectives(
            h(TList, {
              x: 0,
              y: 0,
              w: 12,
              h: 4,
              items: items.value,
              modelValue: 0,
              autoFocus: true,
              onScroll,
            }),
            [[vShow, show.value]],
          ),
          h(TText, { x: 0, y: 0, value: "visible" }),
        ];
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });

    const off = app.terminal.on("commit", (commit) => commits.push(commit));
    try {
      app.mount();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 10000, time: 1_000 });
      app.scheduler.flushNow();
      await nextTick();
      expect(onScroll).toHaveBeenLastCalledWith(100);

      show.value = false;
      await nextTick();
      await nextTick();
      app.scheduler.flushNow();
      commits.length = 0;
      onScroll.mockClear();

      shrink();
      await nextTick();
      app.scheduler.flushNow();

      expect(onScroll).toHaveBeenCalledOnce();
      expect(onScroll).toHaveBeenLastCalledWith(16);
      expect(rowText(app, 0)).toBe("visible");
      expect(commits).toHaveLength(0);
    } finally {
      off();
      app.dispose();
    }
  });

  it("does not scroll or throw when height is zero", async () => {
    const onScroll = vi.fn();
    const app = createTerminalApp({
      cols: 20,
      rows: 8,
      component: TList,
      props: {
        x: 0,
        y: 0,
        w: 12,
        h: 0,
        items: Array.from({ length: 20 }, (_, index) => `item-${index}`),
        autoFocus: true,
        onScroll,
      },
    });

    try {
      app.mount();
      app.scheduler.flushNow();

      expect(() =>
        app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 100, time: 1_000 }),
      ).not.toThrow();
      expect(() =>
        app.events.dispatch({ type: "keydown", key: "Enter", code: "Enter", time: 1_010 }),
      ).not.toThrow();
      app.scheduler.flushNow();
      await nextTick();

      expect(onScroll).not.toHaveBeenCalled();
    } finally {
      app.dispose();
    }
  });
});
