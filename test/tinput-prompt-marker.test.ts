import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import type { Style } from "../src/core.js";
import { TInput } from "../src/index.js";
import { createPromptMentionPlugin } from "../src/vue.js";
import { createTerminalApp } from "../src/cli.js";

const ambientTerminalEnvKeys = ["TERM_PROGRAM", "VSCODE_PID"] as const;
const ambientTerminalEnv = new Map<string, string | undefined>();

beforeEach(() => {
  for (const key of ambientTerminalEnvKeys) {
    ambientTerminalEnv.set(key, process.env[key]);
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ambientTerminalEnvKeys) {
    const value = ambientTerminalEnv.get(key);
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
  ambientTerminalEnv.clear();
});

type Suggestion = Readonly<{ value: string; detail?: string }>;

async function flushApp(app: ReturnType<typeof createTerminalApp>): Promise<void> {
  await nextTick();
  await nextTick();
  app.scheduler.flushNow();
}

function createPromptApp(options: {
  suggestions: readonly Suggestion[];
  inputWidth?: number;
  selectedMarkerStyle?: () => Style;
}) {
  const plugin = options.selectedMarkerStyle
    ? createPromptMentionPlugin({ selectedMarkerStyle: options.selectedMarkerStyle })
    : createPromptMentionPlugin();
  const value = ref("");
  const App = defineComponent({
    name: "PromptMarkerApp",
    setup() {
      return () =>
        h(TInput as any, {
          x: 0,
          y: 8,
          w: options.inputWidth ?? 30,
          modelValue: value.value,
          "onUpdate:modelValue": (v: string) => (value.value = v),
          autoFocus: true,
          cursorBlink: false,
          plugins: [plugin],
          promptTrigger: "/",
          promptMaxItems: 8,
          promptSuggestions: options.suggestions,
        });
    },
  });
  const app = createTerminalApp({ cols: 40, rows: 12, component: App as any });
  app.mount();
  return app;
}

async function openPromptPopup(app: ReturnType<typeof createTerminalApp>): Promise<string[]> {
  await flushApp(app);
  app.events.dispatch({ type: "keydown", key: "/", code: "Slash" } as any);
  await flushApp(app);
  return [...app.terminal.snapshot().lines];
}

const SUGGESTIONS: readonly Suggestion[] = [
  { value: "/alpha" },
  { value: "/beta" },
  { value: "/gamma" },
];

describe("TInput prompt popup selected-row marker", () => {
  it("keeps the popup gutter-free when no marker style is provided", async () => {
    const app = createPromptApp({ suggestions: SUGGESTIONS });
    try {
      const lines = await openPromptPopup(app);
      expect(lines[3]!.startsWith("┌")).toBe(true);
      expect(lines.join("\n")).not.toContain("›");
      // Without a gutter the label starts in the left padding cell.
      expect(lines[4]!.slice(2, 8)).toBe("/alpha");
      expect(lines[5]!.slice(2, 7)).toBe("/beta");
    } finally {
      app.dispose();
    }
  });

  it("draws the marker in a gutter on the selected row only", async () => {
    const app = createPromptApp({
      suggestions: SUGGESTIONS,
      selectedMarkerStyle: () => ({ fg: "red" }),
    });
    try {
      const lines = await openPromptPopup(app);

      expect(app.terminal.getCell(1, 4).ch).toBe("›");
      expect(app.terminal.getCell(1, 5).ch).toBe(" ");
      expect(app.terminal.getCell(1, 6).ch).toBe(" ");
      // The gutter shifts every label by one cell so rows stay aligned.
      expect(lines[4]!.slice(3, 9)).toBe("/alpha");
      expect(lines[5]!.slice(3, 8)).toBe("/beta");

      const markerStyle = app.terminal.getCell(1, 4).style;
      expect(markerStyle.fg).toBe("red");
      // The marker inherits the selected row background.
      expect(markerStyle.inverse).toBe(true);
      expect(app.terminal.getCell(1, 5).style.inverse).not.toBe(true);
    } finally {
      app.dispose();
    }
  });

  it("keeps detail columns aligned when the gutter is present", async () => {
    const app = createPromptApp({
      suggestions: [
        { value: "/alpha", detail: "first" },
        { value: "/beta", detail: "second" },
      ],
      selectedMarkerStyle: () => ({ fg: "yellow" }),
    });
    try {
      const lines = await openPromptPopup(app);

      // Two suggestions -> a 4-row popup, so its top border sits one row lower.
      expect(lines[4]!.startsWith("┌")).toBe(true);
      expect(app.terminal.getCell(1, 5).ch).toBe("›");
      // 30 cells wide -> 28 inner, 1 side pad, 1 gutter, 25 content.
      expect(lines[5]!.slice(3, 9)).toBe("/alpha");
      expect(lines[5]!.slice(23, 28)).toBe("first");
      expect(lines[6]!.slice(22, 28)).toBe("second");
      expect(lines[5]!.slice(29, 30)).toBe("│");
    } finally {
      app.dispose();
    }
  });

  it("suppresses the gutter when the popup is too narrow for it", async () => {
    const app = createPromptApp({
      suggestions: SUGGESTIONS,
      inputWidth: 7,
      selectedMarkerStyle: () => ({ fg: "red" }),
    });
    try {
      const lines = await openPromptPopup(app);

      expect(lines.join("\n")).not.toContain("›");
      // Narrow popups keep the unmarked layout instead of squeezing content.
      expect(lines[4]!.slice(2, 5)).toBe("/al");
    } finally {
      app.dispose();
    }
  });

  it("repaints the marker when its style changes", async () => {
    const markerColor = ref<"red" | "green">("red");
    const app = createPromptApp({
      suggestions: SUGGESTIONS,
      selectedMarkerStyle: () => ({ fg: markerColor.value }),
    });
    try {
      await openPromptPopup(app);
      expect(app.terminal.getCell(1, 4).style.fg).toBe("red");

      markerColor.value = "green";
      await flushApp(app);

      expect(app.terminal.getCell(1, 4).ch).toBe("›");
      expect(app.terminal.getCell(1, 4).style.fg).toBe("green");
      expect(app.terminal.getCell(1, 5).ch).toBe(" ");
    } finally {
      app.dispose();
    }
  });
});
