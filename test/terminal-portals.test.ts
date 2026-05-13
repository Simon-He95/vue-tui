import { describe, expect, it } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import { TDialog, TText } from "../src/index.js";
import { createTerminalApp } from "../src/cli.js";

describe("terminal portals", () => {
  it("teleported dialog updates in headless terminal runtime", async () => {
    const open = ref(false);

    const App = defineComponent({
      name: "PortalDialogApp",
      setup() {
        return () =>
          h(
            TDialog as any,
            {
              modelValue: open.value,
              "onUpdate:modelValue": (v: boolean) => (open.value = v),
              teleport: true,
              w: 20,
              h: 7,
              title: "Confirm",
              placement: "center",
              buttons: [{ label: "OK", value: "ok", default: true }],
            },
            () => h(TText as any, { x: 0, y: 0, value: "Hello" }),
          );
      },
    });

    const app = createTerminalApp({
      cols: 60,
      rows: 12,
      component: App as any,
      defaultStyle: { fg: "whiteBright" },
    });
    app.mount();
    await nextTick();
    app.scheduler.flush();

    // Open after mount: this used to fail because portal props weren't reactive.
    open.value = true;
    await nextTick();
    app.scheduler.flush();

    const lines = app.terminal.snapshot().lines;
    expect(lines.join("\n")).toContain("Confirm");

    app.dispose();
  });
});
