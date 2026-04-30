import { describe, expect, it } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import { createTerminalApp } from "../src/index";
import {
  computeJsonIndentGuideDepths,
  lintJsonText,
  TJsonEditor,
} from "../src/vue/components/TJsonEditor";

describe("tjson editor lint", () => {
  it("returns success for valid json", () => {
    const status = lintJsonText('{"ok":true}');
    expect(status.state).toBe("success");
  });

  it("returns error payload for invalid json", () => {
    const status = lintJsonText('{\n  "x": }\n');
    expect(status.state).toBe("error");
    expect(String(status.message ?? "").length).toBeGreaterThan(0);
  });

  it("computes visual indent depths per line", () => {
    const depths = computeJsonIndentGuideDepths('{\n  "a": {\n    "b": 1\n  }\n}');
    expect(depths).toEqual([0, 1, 2, 1, 0]);
  });

  it("emits lintChange for initial value", async () => {
    const value = ref('{\n  "x": }\n');
    const statuses: string[] = [];
    const App = defineComponent({
      setup() {
        return () =>
          h(TJsonEditor as any, {
            x: 0,
            y: 0,
            w: 40,
            h: 6,
            modelValue: value.value,
            "onUpdate:modelValue": (v: string) => {
              value.value = v;
            },
            onLintChange: (status: { state?: string }) =>
              statuses.push(String(status?.state ?? "")),
          });
      },
    });

    const app = createTerminalApp({ cols: 60, rows: 12, component: App as any });
    app.mount();
    await nextTick();
    await nextTick();
    app.scheduler.flush();

    expect(statuses.length).toBeGreaterThan(0);
    expect(statuses[statuses.length - 1]).toBe("error");
    app.dispose();
  });

  it("emits lintChange when modelValue updates externally", async () => {
    const value = ref('{"ok":true}');
    const statuses: string[] = [];
    const App = defineComponent({
      setup() {
        return () =>
          h(TJsonEditor as any, {
            x: 0,
            y: 0,
            w: 40,
            h: 6,
            modelValue: value.value,
            "onUpdate:modelValue": (v: string) => {
              value.value = v;
            },
            onLintChange: (status: { state?: string }) =>
              statuses.push(String(status?.state ?? "")),
          });
      },
    });

    const app = createTerminalApp({ cols: 60, rows: 12, component: App as any });
    app.mount();
    await nextTick();
    await nextTick();
    app.scheduler.flush();

    const startCount = statuses.length;
    value.value = '{\n  "x": }\n';
    await nextTick();
    await nextTick();
    app.scheduler.flush();

    expect(statuses.length).toBeGreaterThan(startCount);
    expect(statuses[statuses.length - 1]).toBe("error");
    app.dispose();
  });
});
