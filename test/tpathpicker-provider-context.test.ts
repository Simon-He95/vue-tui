import { describe, expect, it } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import { TPathPicker } from "../src/vue.js";
import { createTerminalApp } from "../src/cli.js";

async function waitFor<T>(
  fn: () => T | null | undefined | Promise<T | null | undefined>,
  timeoutMs = 500,
): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await fn();
    if (value != null) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("waitFor timeout");
}

describe("TPathPicker provider context", () => {
  it("uses the pathPickerProvider injected by createTerminalApp", async () => {
    const value = ref("../");

    const App = defineComponent({
      name: "TPathPickerProviderContextApp",
      setup() {
        return () =>
          h(TPathPicker as any, {
            x: 0,
            y: 0,
            w: 40,
            h: 6,
            workspace: "/ws",
            mode: "file",
            modelValue: value.value,
            "onUpdate:modelValue": (v: string) => (value.value = v),
            autoFocus: true,
          });
      },
    });

    const app = createTerminalApp({
      cols: 40,
      rows: 6,
      component: App as any,
      pathPickerProvider: {
        async listDir(absDir: string) {
          if (absDir === "/") return [{ name: "adaptive-image", kind: "directory" as const }];
          return [];
        },
        async stat(absPath: string) {
          if (absPath === "/adaptive-image") return { exists: true, kind: "directory" as const };
          return { exists: false, kind: "other" as const };
        },
      },
    });

    app.mount();
    await nextTick();
    await nextTick();
    app.scheduler.flush();

    await waitFor(() => {
      app.scheduler.flush();
      const text = app.terminal.snapshot().lines.join("\n");
      return text.includes("../adaptive-image/") ? true : null;
    });

    app.events.dispatch({ type: "keydown", key: "Tab", code: "Tab" } as any);
    await nextTick();
    await nextTick();
    app.scheduler.flush();

    expect(value.value).toBe("../adaptive-image/");
    app.dispose();
  });
});
