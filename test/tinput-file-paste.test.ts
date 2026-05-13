import { describe, expect, it } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import { TInput } from "../src/index.js";
import { createTerminalApp } from "../src/cli.js";

describe("TInput file paste handler", () => {
  it("renders images and files differently when pasted", async () => {
    const value = ref("");
    const mentions = ref<readonly string[]>([]);

    const cachedImage = "/tmp/state/blob-cache/sess-1/attachments/paste-1.png";
    const filePath = "/tmp/docs/readme.txt";

    const App = defineComponent({
      name: "TInputFilePasteApp",
      setup() {
        return () =>
          h(TInput as any, {
            x: 0,
            y: 0,
            w: 80,
            h: 1,
            modelValue: value.value,
            "onUpdate:modelValue": (v: string) => (value.value = v),
            collectMentions: true,
            mentions: mentions.value,
            "onUpdate:mentions": (v: readonly string[]) => (mentions.value = v),
            autoFocus: true,
            cursorBlink: false,
            filePasteHandler: (absPath: string) =>
              absPath.endsWith(".png") ? cachedImage : absPath,
          });
      },
    });

    const app = createTerminalApp({
      cols: 80,
      rows: 3,
      component: App as any,
    });

    app.mount();
    await nextTick();
    await nextTick();
    app.scheduler.flush();

    app.events.dispatch({ type: "paste", text: "/tmp/drop/pic.png" } as any);
    await nextTick();
    app.scheduler.flush();

    expect(mentions.value).toEqual([cachedImage]);

    app.events.dispatch({ type: "paste", text: filePath } as any);
    await nextTick();
    await nextTick();
    app.scheduler.flush();

    expect(mentions.value).toEqual([cachedImage, filePath]);

    const row = Array.from({ length: 80 }, (_, x) => app.terminal.getCell(x, 0).ch).join("");
    expect(row.includes("[Image #1]")).toBe(true);
    expect(row.includes("[readme.txt]")).toBe(true);

    app.dispose();
  });

  it("handles pasted paths with spaces and backslashes", async () => {
    const value = ref("");
    const mentions = ref<readonly string[]>([]);

    const spacedPath = "/tmp/drop/my file.txt";
    const rawBackslashPath = "/tmp/drop/icon\\ sad\\\\12.png";
    const backslashPath = "/tmp/drop/icon sad\\12.png";
    const allowed = new Set([spacedPath, backslashPath]);

    const App = defineComponent({
      name: "TInputFilePasteSpacesApp",
      setup() {
        return () =>
          h(TInput as any, {
            x: 0,
            y: 0,
            w: 80,
            h: 1,
            modelValue: value.value,
            "onUpdate:modelValue": (v: string) => (value.value = v),
            collectMentions: true,
            mentionWorkspace: "/tmp",
            mentions: mentions.value,
            "onUpdate:mentions": (v: readonly string[]) => (mentions.value = v),
            autoFocus: true,
            cursorBlink: false,
            filePasteHandler: (absPath: string) => (allowed.has(absPath) ? absPath : null),
          });
      },
    });

    const app = createTerminalApp({
      cols: 80,
      rows: 3,
      component: App as any,
    });

    app.mount();
    await nextTick();
    await nextTick();
    app.scheduler.flush();

    app.events.dispatch({ type: "paste", text: spacedPath } as any);
    await nextTick();
    app.scheduler.flush();

    app.events.dispatch({ type: "paste", text: rawBackslashPath } as any);
    await nextTick();
    app.scheduler.flush();

    expect(mentions.value).toEqual([spacedPath, backslashPath]);

    app.dispose();
  });

  it("normalizes macOS HFS paths from clipboard text", async () => {
    const value = ref("");
    const mentions = ref<readonly string[]>([]);

    const hfsPath =
      "Macintosh HD:Users:Simon:Github:auto-form-chrome-extension:simon:public:icon_副本.png";
    const posixPath = "/Users/Simon/Github/auto-form-chrome-extension/simon/public/icon_副本.png";

    const App = defineComponent({
      name: "TInputFilePasteHfsPathApp",
      setup() {
        return () =>
          h(TInput as any, {
            x: 0,
            y: 0,
            w: 80,
            h: 1,
            modelValue: value.value,
            "onUpdate:modelValue": (v: string) => (value.value = v),
            collectMentions: true,
            mentions: mentions.value,
            "onUpdate:mentions": (v: readonly string[]) => (mentions.value = v),
            autoFocus: true,
            cursorBlink: false,
            filePasteHandler: (absPath: string) => (absPath === posixPath ? absPath : null),
          });
      },
    });

    const app = createTerminalApp({
      cols: 80,
      rows: 3,
      component: App as any,
    });

    app.mount();
    await nextTick();
    await nextTick();
    app.scheduler.flush();

    app.events.dispatch({ type: "paste", text: hfsPath } as any);
    await nextTick();
    app.scheduler.flush();

    expect(mentions.value).toEqual([posixPath]);

    app.dispose();
  });

  it("does not treat multiline paste as file paths", async () => {
    const value = ref("");
    const mentions = ref<readonly string[]>([]);
    const multilineTexts = ref<readonly string[]>([]);

    const pasted = "/Users/Simon/.dimcode/state/blob-cache/_home/attachments/blob.txt\nhello world";

    const App = defineComponent({
      name: "TInputFilePasteMultilineGuardApp",
      setup() {
        return () =>
          h(TInput as any, {
            x: 0,
            y: 0,
            w: 80,
            h: 3,
            modelValue: value.value,
            "onUpdate:modelValue": (v: string) => (value.value = v),
            collectMentions: true,
            mentions: mentions.value,
            "onUpdate:mentions": (v: readonly string[]) => (mentions.value = v),
            collapseMultiline: true,
            multilineTexts: multilineTexts.value,
            "onUpdate:multilineTexts": (v: readonly string[]) => (multilineTexts.value = v),
            autoFocus: true,
            cursorBlink: false,
            filePasteHandler: (_absPath: string) => "/tmp/should-not-be-used.txt",
          });
      },
    });

    const app = createTerminalApp({
      cols: 80,
      rows: 4,
      component: App as any,
    });

    app.mount();
    await nextTick();
    await nextTick();
    app.scheduler.flush();

    app.events.dispatch({ type: "paste", text: pasted } as any);
    await nextTick();
    app.scheduler.flush();

    expect(mentions.value).toEqual([]);
    expect(multilineTexts.value).toEqual([]);
    expect(value.value).toBe(pasted);

    app.dispose();
  });

  it("keeps diagnostics with embedded absolute paths as multiline text", async () => {
    const value = ref("");
    const mentions = ref<readonly string[]>([]);
    const multilineTexts = ref<readonly string[]>([]);
    const handledPaths: string[] = [];

    const pasted = [
      "/Users/Simon/Github/stream-monaco/docs/diff-integration.md",
      "  155:17  error  Parsing error: Expression expected",
      "  200:31  error  Parsing error: Expression expected",
      "",
      "/Users/Simon/Github/stream-monaco/docs/diff-integration.zh-CN.md",
      "  155:17  error  Parsing error: Expression expected",
      "  200:31  error  Parsing error: Expression expected",
    ].join("\n");

    const App = defineComponent({
      name: "TInputFilePasteDiagnosticsGuardApp",
      setup() {
        return () =>
          h(TInput as any, {
            x: 0,
            y: 0,
            w: 80,
            h: 6,
            modelValue: value.value,
            "onUpdate:modelValue": (v: string) => (value.value = v),
            collectMentions: true,
            mentions: mentions.value,
            "onUpdate:mentions": (v: readonly string[]) => (mentions.value = v),
            collapseMultiline: true,
            multilineTexts: multilineTexts.value,
            "onUpdate:multilineTexts": (v: readonly string[]) => (multilineTexts.value = v),
            autoFocus: true,
            cursorBlink: false,
            filePasteHandler: (absPath: string) => {
              handledPaths.push(absPath);
              return absPath;
            },
          });
      },
    });

    const app = createTerminalApp({
      cols: 80,
      rows: 8,
      component: App as any,
    });

    app.mount();
    await nextTick();
    await nextTick();
    app.scheduler.flush();

    app.events.dispatch({ type: "paste", text: pasted } as any);
    await nextTick();
    app.scheduler.flush();

    expect(handledPaths).toEqual([]);
    expect(mentions.value).toEqual([]);
    expect(multilineTexts.value).toEqual([pasted]);

    app.dispose();
  });
});
