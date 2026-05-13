import { describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import { TList } from "../src/index.js";
import { createTerminalApp } from "../src/cli.js";
import { rowText } from "./helpers/list.js";

describe("TList migration semantics", () => {
  it("keeps active detached while wheel scrolling and emits scroll", async () => {
    const onScroll = vi.fn();
    const onUpdateModelValue = vi.fn();
    const app = createTerminalApp({
      cols: 20,
      rows: 8,
      component: TList,
      props: {
        x: 0,
        y: 0,
        w: 12,
        h: 4,
        items: Array.from({ length: 100 }, (_, index) => `item-${index}`),
        modelValue: 0,
        autoFocus: true,
        onScroll,
        "onUpdate:modelValue": onUpdateModelValue,
      },
    });

    try {
      app.mount();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 100, time: 1_000 });
      app.scheduler.flushNow();
      await nextTick();

      expect(onScroll).toHaveBeenCalledTimes(1);
      expect(onScroll).toHaveBeenLastCalledWith(1);
      expect(onUpdateModelValue).not.toHaveBeenCalled();
      expect(rowText(app, 0)).toBe("item-1");
      expect(app.terminal.getRow(0)[0]?.style.inverse).not.toBe(true);
    } finally {
      app.dispose();
    }
  });

  it("anchors ArrowDown to the current viewport after wheel scrolling", async () => {
    const onUpdateModelValue = vi.fn();
    const app = createTerminalApp({
      cols: 20,
      rows: 8,
      component: TList,
      props: {
        x: 0,
        y: 0,
        w: 12,
        h: 4,
        items: Array.from({ length: 200 }, (_, index) => `item-${index}`),
        modelValue: 0,
        autoFocus: true,
        "onUpdate:modelValue": onUpdateModelValue,
      },
    });

    try {
      app.mount();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 10000, time: 1_000 });
      app.scheduler.flushNow();
      await nextTick();
      const top = Number(rowText(app, 0).slice("item-".length));

      app.events.dispatch({ type: "keydown", key: "ArrowDown", code: "ArrowDown", time: 1_010 });
      app.scheduler.flushNow();
      await nextTick();

      expect(top).toBe(100);
      expect(onUpdateModelValue).toHaveBeenLastCalledWith(100);
      expect(rowText(app, 0)).toBe("item-100");
      expect(app.terminal.getRow(0)[0]?.style.inverse).toBe(true);
    } finally {
      app.dispose();
    }
  });

  it("commits the visible item with Enter after wheel scrolling", async () => {
    const onChange = vi.fn();
    const onUpdateModelValue = vi.fn();
    const app = createTerminalApp({
      cols: 20,
      rows: 8,
      component: TList,
      props: {
        x: 0,
        y: 0,
        w: 12,
        h: 4,
        items: Array.from({ length: 200 }, (_, index) => `item-${index}`),
        modelValue: 0,
        autoFocus: true,
        onChange,
        "onUpdate:modelValue": onUpdateModelValue,
      },
    });

    try {
      app.mount();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 10000, time: 1_000 });
      app.scheduler.flushNow();
      await nextTick();

      app.events.dispatch({ type: "keydown", key: "Enter", code: "Enter", time: 1_010 });
      app.scheduler.flushNow();
      await nextTick();

      expect(onUpdateModelValue).toHaveBeenLastCalledWith(100);
      expect(onChange).toHaveBeenLastCalledWith({ index: 100, value: "item-100" });
      expect(rowText(app, 0)).toBe("item-100");
    } finally {
      app.dispose();
    }
  });

  it("keeps the wheel viewport stable when onScroll synchronously updates modelValue", async () => {
    const scrollCalls: number[] = [];
    const onUpdateModelValue = vi.fn();
    const App = defineComponent({
      name: "TListMigrationOnScrollModelValueApp",
      setup() {
        const modelValue = ref(0);
        return () =>
          h(TList, {
            x: 0,
            y: 0,
            w: 12,
            h: 4,
            items: Array.from({ length: 100 }, (_, index) => `item-${index}`),
            modelValue: modelValue.value,
            autoFocus: true,
            onScroll: (top: number) => {
              scrollCalls.push(top);
              modelValue.value = top;
            },
            "onUpdate:modelValue": onUpdateModelValue,
          });
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 1000, time: 1_000 });
      app.scheduler.flushNow();
      await nextTick();
      app.scheduler.flushNow();

      expect(scrollCalls).toEqual([10]);
      expect(onUpdateModelValue).not.toHaveBeenCalled();
      expect(rowText(app, 0)).toBe("item-10");
      expect(app.terminal.getRow(0)[0]?.style.inverse).toBe(true);
    } finally {
      app.dispose();
    }
  });

  it("requires itemVersion for same-length in-place item repaint", async () => {
    let mutateWithoutVersion!: () => void;
    let bumpVersion!: () => void;
    const App = defineComponent({
      name: "TListMigrationItemVersionApp",
      setup() {
        const items = ref(["item-0", "item-1", "item-2", "item-3"]);
        const itemVersion = ref(0);
        mutateWithoutVersion = () => {
          items.value[2] = "changed";
        };
        bumpVersion = () => {
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

      mutateWithoutVersion();
      await nextTick();
      app.scheduler.flushNow();

      expect(rowText(app, 2)).toBe("item-2");

      bumpVersion();
      await nextTick();
      app.scheduler.flushNow();

      expect(rowText(app, 2)).toBe("changed");
    } finally {
      app.dispose();
    }
  });
});
