import { defineComponent, h, nextTick, ref } from "vue";
import { describe, expect, it } from "vitest";
import { TText, TTransition } from "../src/index.js";
import { createTerminalApp } from "../src/cli.js";

async function flushAsync(times = 3): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

describe("TTransition", () => {
  it("runs enter/leave hooks and unmounts after leave", async () => {
    const show = ref(false);
    const calls: string[] = [];

    const App = defineComponent({
      name: "TransitionDemo",
      setup() {
        return () =>
          h(
            TTransition,
            {
              show: show.value,
              duration: 0,
              beforeEnter: () => {
                calls.push("beforeEnter");
              },
              enter: () => {
                calls.push("enter");
              },
              afterEnter: () => {
                calls.push("afterEnter");
              },
              beforeLeave: () => {
                calls.push("beforeLeave");
              },
              leave: () => {
                calls.push("leave");
              },
              afterLeave: () => {
                calls.push("afterLeave");
              },
            },
            {
              default: ({ phase, progress }: any) =>
                h(TText, { x: 0, y: 0, w: 20, value: `${phase}:${progress}` }),
            },
          );
      },
    });

    const t = createTerminalApp({ cols: 20, rows: 2, component: App });
    t.mount();
    await nextTick();
    t.scheduler.flush();
    expect(t.terminal.getCell(0, 0).ch).toBe(" ");
    expect(calls).toEqual([]);

    show.value = true;
    await nextTick();
    for (let i = 0; i < 10; i++) {
      await flushAsync();
      await nextTick();
      t.scheduler.flush();
      if (t.terminal.snapshot().lines[0]?.includes("idle:1")) break;
    }
    expect(calls).toEqual(["beforeEnter", "enter", "afterEnter"]);
    expect(t.terminal.snapshot().lines[0]).toContain("idle:1");

    calls.length = 0;

    show.value = false;
    await nextTick();
    for (let i = 0; i < 10; i++) {
      await flushAsync();
      await nextTick();
      t.scheduler.flush();
      if (t.terminal.getCell(0, 0).ch === " ") break;
    }
    expect(calls).toEqual(["beforeLeave", "leave", "afterLeave"]);
    expect(t.terminal.getCell(0, 0).ch).toBe(" ");

    t.dispose();
  });
});
