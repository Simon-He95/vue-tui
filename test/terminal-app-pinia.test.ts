import { createPinia, defineStore } from "pinia";
import { defineComponent, h, nextTick } from "vue";
import { describe, expect, it } from "vitest";
import { TText } from "../src/index.js";
import { createTerminalApp } from "../src/cli.js";

const useCounter = defineStore("counter", {
  state: () => ({ n: 0 }),
  actions: {
    inc() {
      this.n += 1;
    },
  },
});

const CounterView = defineComponent({
  name: "CounterView",
  setup() {
    const counter = useCounter();
    return () => h(TText, { x: 0, y: 0, w: 20, value: `n=${counter.n}` });
  },
});

describe("createTerminalApp + pinia", () => {
  it("isolates stores with separate pinia instances", async () => {
    const piniaA = createPinia();
    const piniaB = createPinia();

    const appA = createTerminalApp({
      cols: 20,
      rows: 3,
      component: CounterView,
    });
    appA.app.use(piniaA);
    appA.mount();

    const appB = createTerminalApp({
      cols: 20,
      rows: 3,
      component: CounterView,
    });
    appB.app.use(piniaB);
    appB.mount();

    await nextTick();
    appA.scheduler.flush();
    appB.scheduler.flush();

    expect(appA.terminal.snapshot().lines[0]).toContain("n=0");
    expect(appB.terminal.snapshot().lines[0]).toContain("n=0");

    useCounter(piniaA).inc();
    await nextTick();
    appA.scheduler.flush();
    appB.scheduler.flush();

    expect(appA.terminal.snapshot().lines[0]).toContain("n=1");
    expect(appB.terminal.snapshot().lines[0]).toContain("n=0");

    appA.dispose();
    appB.dispose();
  });

  it("shares stores when installing the same pinia", async () => {
    const pinia = createPinia();

    const appA = createTerminalApp({
      cols: 20,
      rows: 3,
      component: CounterView,
    });
    appA.app.use(pinia);
    appA.mount();

    const appB = createTerminalApp({
      cols: 20,
      rows: 3,
      component: CounterView,
    });
    appB.app.use(pinia);
    appB.mount();

    await nextTick();
    appA.scheduler.flush();
    appB.scheduler.flush();

    useCounter(pinia).inc();
    await nextTick();
    appA.scheduler.flush();
    appB.scheduler.flush();

    expect(appA.terminal.snapshot().lines[0]).toContain("n=1");
    expect(appB.terminal.snapshot().lines[0]).toContain("n=1");

    appA.dispose();
    appB.dispose();
  });
});
