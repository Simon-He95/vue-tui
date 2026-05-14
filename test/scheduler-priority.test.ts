import { describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import { TRenderPlane, TText } from "../src/index.js";
import { createTerminalApp } from "../src/cli.js";

const getFrameDelayMs = () => 16;

async function settleScheduler(): Promise<void> {
  await Promise.resolve();
  await nextTick();
  vi.runOnlyPendingTimers();
  await Promise.resolve();
  await nextTick();
  vi.clearAllTimers();
}

describe("scheduler priority", () => {
  it("coalesces normal-priority flushes to the terminal frame cadence", async () => {
    vi.useFakeTimers();
    const stdout = process.stdout;
    const prevIsTTY = stdout.isTTY;
    Object.defineProperty(stdout, "isTTY", {
      value: true,
      configurable: true,
    });

    const App = defineComponent({
      name: "SchedulerNormalFrameCadenceApp",
      setup() {
        return () => h("div", null, "frame");
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 4, component: App as any });
    let commits = 0;
    const t: any = app.terminal as any;
    const prevCommit = t.commit.bind(app.terminal);
    t.commit = () => {
      commits++;
      return prevCommit();
    };

    try {
      const frameDelayMs = getFrameDelayMs();
      app.mount();
      await nextTick();
      await nextTick();
      app.scheduler.flush();
      await settleScheduler();
      commits = 0;

      app.scheduler.invalidate();
      await Promise.resolve();
      expect(commits).toBe(0);

      vi.advanceTimersByTime(frameDelayMs - 1);
      expect(commits).toBe(0);

      vi.advanceTimersByTime(1);
      expect(commits).toBe(1);
    } finally {
      t.commit = prevCommit;
      app.dispose();
      Object.defineProperty(stdout, "isTTY", {
        value: prevIsTTY,
        configurable: true,
      });
      vi.useRealTimers();
    }
  });

  it("can reschedule a throttled flush earlier with high priority", async () => {
    vi.useFakeTimers();
    const proc: any = (globalThis as any).process;
    const prevNew = proc?.env?.VUE_TUI_THROTTLE_MS;
    const prevLegacy = proc?.env?.DIMCODE_TUI_THROTTLE_MS;
    if (proc?.env) {
      proc.env.VUE_TUI_THROTTLE_MS = "";
      proc.env.DIMCODE_TUI_THROTTLE_MS = "50";
    }

    const msg = ref("a");
    const App = defineComponent({
      name: "SchedulerPriorityApp",
      setup() {
        return () => h("div", null, msg.value);
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 4, component: App as any });
    let commits = 0;
    const t: any = app.terminal as any;
    const prevCommit = t.commit.bind(app.terminal);
    t.commit = () => {
      commits++;
      return prevCommit();
    };

    try {
      app.mount();
      await nextTick();
      await nextTick();
      app.scheduler.flush();
      commits = 0;

      msg.value = "b";
      await nextTick();
      app.scheduler.invalidate({ priority: "low" });
      await Promise.resolve();
      expect(commits).toBe(0);

      app.scheduler.invalidate({ priority: "high" });
      await new Promise<void>((resolve) => (process as any).nextTick(resolve));
      expect(commits).toBe(1);

      vi.advanceTimersByTime(60);
      expect(commits).toBe(1);
    } finally {
      t.commit = prevCommit;
      app.dispose();
      if (proc?.env) {
        if (prevNew == null) delete proc.env.VUE_TUI_THROTTLE_MS;
        else proc.env.VUE_TUI_THROTTLE_MS = prevNew;
        if (prevLegacy == null) delete proc.env.DIMCODE_TUI_THROTTLE_MS;
        else proc.env.DIMCODE_TUI_THROTTLE_MS = prevLegacy;
      }
      vi.useRealTimers();
    }
  });

  it("flushNow bypasses throttle and cancels pending flush", async () => {
    vi.useFakeTimers();
    const proc: any = (globalThis as any).process;
    const prev = proc?.env?.DIMCODE_TUI_THROTTLE_MS;
    if (proc?.env) proc.env.DIMCODE_TUI_THROTTLE_MS = "50";

    const msg = ref("a");
    const App = defineComponent({
      name: "SchedulerFlushNowApp",
      setup() {
        return () => h("div", null, msg.value);
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 4, component: App as any });
    let commits = 0;
    const t: any = app.terminal as any;
    const prevCommit = t.commit.bind(app.terminal);
    t.commit = () => {
      commits++;
      return prevCommit();
    };

    try {
      app.mount();
      await nextTick();
      await nextTick();
      app.scheduler.flush();
      commits = 0;

      msg.value = "b";
      await nextTick();
      app.scheduler.invalidate({ priority: "low" });
      app.scheduler.flushNow();
      expect(commits).toBe(1);

      vi.advanceTimersByTime(60);
      expect(commits).toBe(1);
    } finally {
      t.commit = prevCommit;
      app.dispose();
      if (proc?.env) {
        if (prev == null) delete proc.env.DIMCODE_TUI_THROTTLE_MS;
        else proc.env.DIMCODE_TUI_THROTTLE_MS = prev;
      }
      vi.useRealTimers();
    }
  });

  it("propagates transcript planes through headless app commits", async () => {
    const msg = ref("alpha");
    const commits: Array<readonly string[] | null> = [];

    const App = defineComponent({
      name: "SchedulerPlaneCommitApp",
      setup() {
        return () =>
          h(TRenderPlane, { plane: "transcript" }, () => [
            h(TText, { x: 0, y: 0, value: msg.value }),
          ]);
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 4, component: App as any });
    const offCommit = app.terminal.on("commit", ({ planes }) => {
      commits.push(planes);
    });

    try {
      app.mount();
      await nextTick();
      await nextTick();
      app.scheduler.flushNow();
      commits.length = 0;

      msg.value = "beta";
      await nextTick();
      app.scheduler.flushNow();

      expect(commits.at(-1)).toEqual(["transcript"]);
    } finally {
      offCommit();
      app.dispose();
    }
  });
});
