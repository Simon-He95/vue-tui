import { describe, expect, it } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import { TInput } from "../src/index.js";
import { createTerminalApp } from "../src/cli.js";
import { MULTILINE_TOKEN } from "../src/vue/components/input/utils/inlineTextTokens.js";

function mountTInputApp(extraProps: Record<string, unknown> = {}) {
  const value = ref("");
  const multilineTexts = ref<readonly string[]>([]);
  const App = defineComponent({
    name: "TInputMultilineCollapseApp",
    setup() {
      return () =>
        h(TInput as any, {
          x: 0,
          y: 0,
          w: 80,
          h: 5,
          modelValue: value.value,
          "onUpdate:modelValue": (v: string) => (value.value = v),
          collapseMultiline: true,
          multilineTexts: multilineTexts.value,
          "onUpdate:multilineTexts": (v: readonly string[]) => (multilineTexts.value = v),
          autoFocus: true,
          cursorBlink: false,
          ...extraProps,
        });
    },
  });
  const app = createTerminalApp({
    cols: 80,
    rows: 6,
    component: App as any,
  });
  app.mount();
  return { app, value, multilineTexts };
}

async function paste(app: ReturnType<typeof createTerminalApp>, text: string): Promise<void> {
  app.events.dispatch({ type: "paste", text } as any);
  await nextTick();
  app.scheduler.flush();
}

describe("TInput multiline paste collapse", () => {
  it("keeps a single long line inline (no length cap)", async () => {
    const { app, value, multilineTexts } = mountTInputApp();
    const singleLine = "x".repeat(400);
    await paste(app, singleLine);
    expect(value.value).toBe(singleLine);
    expect(multilineTexts.value).toEqual([]);
    app.dispose();
  });

  it("keeps exactly 3 lines inline", async () => {
    const { app, value, multilineTexts } = mountTInputApp();
    const threeLines = ["alpha", "beta", "gamma"].join("\n");
    await paste(app, threeLines);
    expect(value.value).toBe(threeLines);
    expect(multilineTexts.value).toEqual([]);
    app.dispose();
  });

  it("collapses 4+ lines into a multiline token", async () => {
    const { app, value, multilineTexts } = mountTInputApp();
    const fourLines = ["alpha", "beta", "gamma", "delta"].join("\n");
    await paste(app, fourLines);
    expect(value.value).toBe(MULTILINE_TOKEN);
    expect(multilineTexts.value).toEqual([fourLines]);
    app.dispose();
  });

  it("honors a custom collapseMultilineLines threshold (higher)", async () => {
    const { app, value, multilineTexts } = mountTInputApp({ collapseMultilineLines: 5 });
    const fiveLines = ["a", "b", "c", "d", "e"].join("\n");
    await paste(app, fiveLines);
    expect(value.value).toBe(fiveLines);
    expect(multilineTexts.value).toEqual([]);
    app.dispose();
  });

  it("collapses above a custom collapseMultilineLines threshold", async () => {
    const { app, value, multilineTexts } = mountTInputApp({ collapseMultilineLines: 5 });
    const sixLines = ["a", "b", "c", "d", "e", "f"].join("\n");
    await paste(app, sixLines);
    expect(value.value).toBe(MULTILINE_TOKEN);
    expect(multilineTexts.value).toEqual([sixLines]);
    app.dispose();
  });
});
