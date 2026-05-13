import { describe, expect, it } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import { createTextRestrictionPlugin, TInput } from "../src/index.js";
import { createTerminalApp } from "../src/cli.js";

describe("TInput restrictText plugin", () => {
  it("filters key input and paste", async () => {
    const plugin = createTextRestrictionPlugin({
      rules: [{ allowChars: /[0-9.]/ }, { allow: /^\d*\.?\d*$/ }],
    });

    const value = ref("");
    const validations: any[] = [];
    const App = defineComponent({
      name: "RestrictTextApp",
      setup() {
        return () =>
          h(TInput as any, {
            x: 0,
            y: 0,
            w: 10,
            modelValue: value.value,
            "onUpdate:modelValue": (v: string) => (value.value = v),
            onValidationError: (info: any) => validations.push(info),
            autoFocus: true,
            cursorBlink: false,
            plugins: [plugin],
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 3, component: App as any });
    app.mount();
    await nextTick();
    await nextTick();
    app.scheduler.flush();

    app.events.dispatch({ type: "keydown", key: "1", code: "Digit1" } as any);
    app.events.dispatch({ type: "keydown", key: "a", code: "KeyA" } as any);
    app.events.dispatch({ type: "keydown", key: ".", code: "Period" } as any);
    app.events.dispatch({ type: "keydown", key: ".", code: "Period" } as any);
    app.events.dispatch({ type: "keydown", key: "2", code: "Digit2" } as any);
    app.scheduler.flush();

    expect(value.value).toBe("1.2");
    expect(validations.some((v) => v?.kind === "reject")).toBe(true);

    app.events.dispatch({ type: "paste", text: "3x4" } as any);
    app.scheduler.flush();

    expect(value.value).toBe("1.234");
    expect(validations.some((v) => v?.kind === "filter")).toBe(true);
    app.dispose();
  });
});
