import { describe, expect, it } from "vitest";
import {
  createCliEventManager,
  createEventManager,
  createPromptMentionPlugin,
  defineComponent,
  expectBoxBorder,
  h,
  mountTerminal,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  spawnOutputsByCmd,
  TBox,
  TDialog,
  TInput,
  TInputBox,
  TList,
  TPathPicker,
  TRenderPlane,
  TSelect,
  TText,
  TView,
  useLayout,
  useRenderNode,
  useTerminal,
  useTerminalNode,
  vShow,
  waitFor,
  watch,
  watchEffect,
  withDirectives,
} from "./ui-regressions-support";

import type { PropType } from "vue";

describe("ui regressions", () => {
  it("useRenderNode batches sibling node invalidates into one scheduler tick", async () => {
    const version = ref(0);
    let invalidateCount = 0;

    const Probe = defineComponent({
      name: "InvalidateProbe",
      setup() {
        const { scheduler } = useTerminal();
        const original = scheduler.invalidate.bind(scheduler);
        (scheduler as any).invalidate = (options?: any) => {
          invalidateCount++;
          return original(options);
        };
        onUnmounted(() => {
          (scheduler as any).invalidate = original;
        });
        return () => null;
      },
    });

    const Node = defineComponent({
      name: "BatchedInvalidateNode",
      props: {
        row: { type: Number, required: true },
      },
      setup(props) {
        useRenderNode(() => ({
          rect: { x: 0, y: props.row, w: 1, h: 1 },
          deps: version.value,
          paint: () => {},
        }));
        return () => null;
      },
    });

    const mounted = await mountTerminal(() =>
      h("div", null, [h(Probe), h(Node, { row: 0 }), h(Node, { row: 1 }), h(Node, { row: 2 })]),
    );

    await nextTick();
    await Promise.resolve();
    invalidateCount = 0;

    version.value++;
    await nextTick();
    await Promise.resolve();

    expect(invalidateCount).toBe(1);
    mounted.unmount();
  });

  it("useRenderNode preserves transcript plane metadata when wrapped", async () => {
    const version = ref(0);
    const invalidatePlanes: Array<string | null> = [];

    const Probe = defineComponent({
      name: "PlaneProbe",
      setup() {
        const { scheduler } = useTerminal();
        const original = scheduler.invalidate.bind(scheduler);
        (scheduler as any).invalidate = (options?: any) => {
          invalidatePlanes.push(options?.plane ?? null);
          return original(options);
        };
        onUnmounted(() => {
          (scheduler as any).invalidate = original;
        });
        return () => null;
      },
    });

    const Node = defineComponent({
      name: "PlaneNode",
      setup() {
        useRenderNode(() => ({
          rect: { x: 0, y: 0, w: 1, h: 1 },
          deps: version.value,
          paint: () => {},
        }));
        return () => null;
      },
    });

    const mounted = await mountTerminal(() =>
      h("div", null, [h(Probe), h(TRenderPlane, { plane: "transcript" }, () => [h(Node)])]),
    );

    await nextTick();
    await Promise.resolve();
    invalidatePlanes.length = 0;

    version.value++;
    await nextTick();
    await Promise.resolve();

    expect(invalidatePlanes.length).toBeGreaterThan(0);
    expect(invalidatePlanes.every((plane) => plane === "transcript")).toBe(true);

    mounted.unmount();
  });

  it("useRenderNode can consume a one-shot dirtyRowsHint without other dep changes", async () => {
    const dirtyRowsHint = ref<readonly number[] | null>(null);
    const paints: string[] = [];

    const Node = defineComponent({
      name: "OneShotDirtyRowsHintNode",
      props: {
        dirtyRowsHint: {
          type: Array as PropType<readonly number[] | null>,
          default: null,
        },
      },
      setup(props) {
        let pendingDirtyRowsHint: readonly number[] | undefined;
        const dirtyRowsHintVersion = ref(0);

        watch(
          () => props.dirtyRowsHint,
          (hint) => {
            if (!hint?.length) return;
            pendingDirtyRowsHint = hint;
            dirtyRowsHintVersion.value++;
          },
          { immediate: true, flush: "sync" },
        );

        useRenderNode(() => ({
          rect: { x: 0, y: 0, w: 4, h: 6 },
          dirtyRowsHint: pendingDirtyRowsHint,
          deps: dirtyRowsHintVersion.value,
          paint: (rows) => {
            pendingDirtyRowsHint = undefined;
            paints.push((rows ?? []).join(","));
          },
        }));
        return () => null;
      },
    });

    const mounted = await mountTerminal(() => h(Node, { dirtyRowsHint: dirtyRowsHint.value }));

    await nextTick();
    await Promise.resolve();
    paints.length = 0;

    dirtyRowsHint.value = [4, 5];
    await nextTick();
    await Promise.resolve();
    await nextTick();
    await Promise.resolve();

    expect(paints).toEqual(["4,5"]);
    mounted.unmount();
  });

  it("useRenderNode can apply a dirtyRowsHint during the same render as another dep update", async () => {
    const dirtyRowsHint = ref<readonly number[] | null>(null);
    const row = ref(0);
    const paints: string[] = [];

    const Node = defineComponent({
      name: "SameRenderDirtyRowsHintNode",
      props: {
        row: { type: Number, required: true },
        dirtyRowsHint: {
          type: Array as PropType<readonly number[] | null>,
          default: null,
        },
      },
      setup(props) {
        let pendingDirtyRowsHint: readonly number[] | undefined;
        const dirtyRowsHintVersion = ref(0);

        watch(
          () => props.dirtyRowsHint,
          (hint) => {
            if (!hint?.length) return;
            pendingDirtyRowsHint = hint;
            dirtyRowsHintVersion.value++;
          },
          { immediate: true, flush: "sync" },
        );

        useRenderNode(() => ({
          rect: { x: 0, y: props.row, w: 4, h: 6 },
          dirtyRowsHint: props.dirtyRowsHint?.length ? props.dirtyRowsHint : pendingDirtyRowsHint,
          deps: [props.row, dirtyRowsHintVersion.value],
          paint: (rows) => {
            pendingDirtyRowsHint = undefined;
            paints.push((rows ?? []).join(","));
          },
        }));
        return () => null;
      },
    });

    const mounted = await mountTerminal(() =>
      h(Node, { row: row.value, dirtyRowsHint: dirtyRowsHint.value }),
    );

    await nextTick();
    await Promise.resolve();
    paints.length = 0;

    row.value = 1;
    dirtyRowsHint.value = [4, 5];
    await nextTick();
    await Promise.resolve();
    await nextTick();
    await Promise.resolve();

    expect(paints).toEqual(["4,5"]);
    mounted.unmount();
  });

  it("TRenderPlane scopes scheduler.invalidate() to its plane by default", async () => {
    const invalidatePlanes: Array<string | null> = [];

    const Node = defineComponent({
      name: "PlaneInvalidateNode",
      setup() {
        const { scheduler } = useTerminal();
        onMounted(() => {
          const original = scheduler.invalidate.bind(scheduler);
          (scheduler as any).invalidate = (options?: any) => {
            invalidatePlanes.push(options?.plane ?? null);
            return original(options);
          };
          scheduler.invalidate();
        });
        return () => h(TText, { x: 0, y: 0, value: "plane" });
      },
    });

    const mounted = await mountTerminal(() =>
      h(TRenderPlane, { plane: "transcript" }, () => [h(Node)]),
    );

    await nextTick();
    await Promise.resolve();

    expect(invalidatePlanes).toContain("transcript");

    mounted.unmount();
  });

  it("runtime portals preserve their overlay plane in commit metadata", async () => {
    const mounted = await mountTerminal(() => null);
    const commits: Array<{
      dirtyRows: readonly number[] | null;
      planes: readonly string[] | null;
    }> = [];
    const offCommit = mounted.terminal.on("commit", ({ dirtyRows, planes }) => {
      commits.push({ dirtyRows, planes });
    });

    mounted.runtime()!.mount(TText, { x: 0, y: 0, value: "overlay portal" }, { plane: "overlay" });

    await nextTick();
    await Promise.resolve();

    expect(commits.at(-1)?.planes).toEqual(["overlay"]);

    offCommit();
    mounted.unmount();
  });

  it("TerminalProvider IME textarea does not sit at negative X", async () => {
    const mounted = await mountTerminal(() => h(TText, { x: 0, y: 0, value: "x" }));
    const container = mounted.container()!;
    const ime = container.parentElement?.querySelector("textarea") as HTMLTextAreaElement | null;
    expect(ime).not.toBe(null);
    expect(ime!.style.left).not.toBe("-9999px");
    mounted.unmount();
  });

  it("TerminalProvider forwards IME compositionend to focused TInput", async () => {
    const value = ref("");
    const mounted = await mountTerminal(() =>
      h(TInput, {
        x: 0,
        y: 0,
        w: 10,
        modelValue: value.value,
        "onUpdate:modelValue": (v: string) => (value.value = v),
        autoFocus: true,
      }),
    );

    const container = mounted.container()!;
    const host = container.parentElement!;
    const ime = host.querySelector("textarea") as HTMLTextAreaElement | null;
    expect(ime).not.toBe(null);

    // Ensure the input is focused (autoFocus should do this, but click is safer).
    container.dispatchEvent(new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }));
    await nextTick();

    const start = new Event("compositionstart", { bubbles: true }) as any;
    start.data = "n";
    ime!.dispatchEvent(start);
    await nextTick();

    const update = new Event("compositionupdate", { bubbles: true }) as any;
    update.data = "ni";
    ime!.dispatchEvent(update);
    await nextTick();

    const end = new Event("compositionend", { bubbles: true }) as any;
    end.data = "你";
    ime!.dispatchEvent(end);
    await nextTick();

    expect(value.value).toBe("你");

    mounted.unmount();
  });

  it("TerminalProvider repositions IME textarea after caret moves", async () => {
    const value = ref("");
    const mounted = await mountTerminal(() =>
      h(TInput, {
        x: 0,
        y: 0,
        w: 12,
        modelValue: value.value,
        "onUpdate:modelValue": (v: string) => (value.value = v),
        autoFocus: true,
        cursorBlink: false,
      }),
    );

    const container = mounted.container()!;
    const host = container.parentElement!;
    const ime = host.querySelector("textarea") as HTMLTextAreaElement | null;
    expect(ime).not.toBe(null);

    // Focus the input.
    container.dispatchEvent(new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }));
    await nextTick();

    const left0 = ime!.style.left;
    const top0 = ime!.style.top;

    // Type text so the caret position changes.
    for (const [k, code] of [
      ["h", "KeyH"],
      ["e", "KeyE"],
      ["l", "KeyL"],
      ["l", "KeyL"],
      ["o", "KeyO"],
    ] as const) {
      container.dispatchEvent(new KeyboardEvent("keydown", { key: k, code, bubbles: true }));
      await nextTick();
    }

    const left1 = ime!.style.left;
    const top1 = ime!.style.top;
    expect(`${left1}:${top1}`).not.toBe(`${left0}:${top0}`);

    // Move caret left and ensure the anchor updates again.
    container.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowLeft",
        code: "ArrowLeft",
        bubbles: true,
      }),
    );
    await nextTick();
    expect(`${ime!.style.left}:${ime!.style.top}`).not.toBe(`${left1}:${top1}`);

    mounted.unmount();
  });

  it("IME composing does not steal Arrow/Enter for candidate navigation (Process/229)", async () => {
    const value = ref("");
    const changes: string[] = [];
    const mounted = await mountTerminal(() =>
      h(TInput, {
        x: 0,
        y: 0,
        w: 10,
        modelValue: value.value,
        "onUpdate:modelValue": (v: string) => (value.value = v),
        onChange: (v: string) => changes.push(v),
        autoFocus: true,
        cursorBlink: false,
      }),
    );

    const container = mounted.container()!;
    const host = container.parentElement!;
    const ime = host.querySelector("textarea") as HTMLTextAreaElement | null;
    expect(ime).not.toBe(null);

    container.dispatchEvent(new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }));
    await nextTick();

    for (const [k, code] of [
      ["h", "KeyH"],
      ["e", "KeyE"],
      ["l", "KeyL"],
      ["l", "KeyL"],
      ["o", "KeyO"],
    ] as const) {
      container.dispatchEvent(new KeyboardEvent("keydown", { key: k, code, bubbles: true }));
      await nextTick();
    }

    // Cursor is at the end (accounting for TInput padding) and is rendered as inverse.
    expect(mounted.terminal.getCell(6, 0).style.inverse).toBe(true);

    const start = new Event("compositionstart", { bubbles: true }) as any;
    start.data = "n";
    ime!.dispatchEvent(start);
    await nextTick();

    // During IME composing, Arrow/Enter should be ignored (no preventDefault, no cursor moves, no submit).
    // Cursor is rendered after the current composition text (preedit).
    const composedCursorX = 1 + value.value.length + String(start.data ?? "").length;
    const arrow = new KeyboardEvent("keydown", {
      key: "ArrowLeft",
      code: "ArrowLeft",
      bubbles: true,
    });
    ime!.dispatchEvent(arrow);
    await nextTick();
    expect(arrow.defaultPrevented).toBe(false);
    expect(mounted.terminal.getCell(composedCursorX, 0).style.inverse).toBe(true);

    const enter = new KeyboardEvent("keydown", {
      key: "Enter",
      code: "Enter",
      bubbles: true,
    });
    ime!.dispatchEvent(enter);
    await nextTick();
    expect(enter.defaultPrevented).toBe(false);
    expect(value.value).toBe("hello");
    expect(changes).toEqual([]);

    mounted.unmount();
  });

  it("TPathPicker Tab completion keeps cursor at end", async () => {
    const value = ref("");
    const mounted = await mountTerminal(() =>
      h(TPathPicker, {
        x: 0,
        y: 0,
        w: 40,
        h: 6,
        workspace: "/ws",
        mode: "file",
        modelValue: value.value,
        "onUpdate:modelValue": (v: string) => (value.value = v),
        autoFocus: true,
        provider: {
          async listDir(absDir: string) {
            if (absDir === "/") return [{ name: "adaptive-image", kind: "directory" as const }];
            return [];
          },
          async stat(absPath: string) {
            if (absPath === "/adaptive-image") return { exists: true, kind: "directory" as const };
            return { exists: false, kind: "other" as const };
          },
        },
      } as any),
    );

    const container = mounted.container()!;
    container.dispatchEvent(new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }));
    await nextTick();

    for (const [k, code] of [
      [".", "Period"],
      [".", "Period"],
      ["/", "Slash"],
    ] as const) {
      container.dispatchEvent(new KeyboardEvent("keydown", { key: k, code, bubbles: true }));
      await nextTick();
    }

    await waitFor(() => {
      const text = mounted.terminal.snapshot().lines.join("\n");
      return text.includes("../adaptive-image/") ? true : null;
    });

    container.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", code: "Tab", bubbles: true }),
    );
    await nextTick();
    await nextTick();

    expect(value.value).toBe("../adaptive-image/");

    // Cursor is at end (accounting for TInput padding) and is rendered as inverse.
    const expectedCursorX = 1 + value.value.length;
    expect(mounted.terminal.getCell(expectedCursorX, 0).style.inverse).toBe(true);

    mounted.unmount();
  });

  it("dialog restores focus to opener after confirm", async () => {
    const cols = 44;
    const rows = 10;
    const open = ref(false);
    const openerId = ref<string | null>(null);

    const Opener = defineComponent({
      name: "DialogOpener",
      setup() {
        const { events } = useTerminal();
        const { id } = useTerminalNode(() => ({
          rect: { x: 1, y: 1, w: 16, h: 1 },
          zIndex: 10,
          visible: true,
          focusable: true,
          handlers: {
            keydown: (e: any) => {
              if (e.key !== "Enter") return;
              e.preventDefault?.();
              open.value = true;
            },
          },
        }));
        watchEffect(() => {
          openerId.value = id.value;
          if (id.value && events.value?.getFocused() == null) events.value?.focus(id.value);
        });
        return () =>
          h(TText, {
            x: 1,
            y: 1,
            value: "[ Open ]",
            style: { fg: "greenBright", bold: true },
          });
      },
    });

    const App = defineComponent({
      name: "DialogRestoreFocusApp",
      setup() {
        return () =>
          h(
            TBox,
            {
              x: 0,
              y: 0,
              w: cols,
              h: rows,
              border: true,
              title: "Root",
              padding: 0,
            },
            () => [
              h(Opener),
              h(
                TDialog,
                {
                  modelValue: open.value,
                  "onUpdate:modelValue": (v: boolean) => (open.value = v),
                  w: 26,
                  h: 6,
                  title: "Confirm",
                  placement: "center",
                  teleport: true,
                  buttons: [
                    {
                      label: "Yes",
                      value: "yes",
                      kind: "primary",
                      default: true,
                    },
                    { label: "No", value: "no" },
                  ],
                } as any,
                () => [h(TText, { x: 0, y: 0, w: 22, value: "Hello" })],
              ),
            ],
          );
      },
    });

    const mounted = await mountTerminal(() => h(App), cols, rows);
    await nextTick();
    await nextTick();

    const events = mounted.events();
    const id = await waitFor(() => openerId.value);
    expect(events?.getFocused()).toBe(id);

    mounted
      .container()
      ?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter" }));
    await nextTick();
    await nextTick();

    // Confirm closes the dialog and should restore focus.
    mounted
      .container()
      ?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter" }));
    await nextTick();
    await nextTick();
    await nextTick();
    await nextTick();
    await nextTick();

    expect(mounted.events()?.getFocused()).toBe(id);
    mounted.unmount();
  });

  it("dialog auto-focuses inner TInput when opened", async () => {
    const cols = 50;
    const rows = 14;
    const open = ref(false);
    const inputValue = ref("");
    const mainInputId = ref<string | null>(null);

    const MainInput = defineComponent({
      name: "MainInput",
      setup() {
        const { events } = useTerminal();
        const { id } = useTerminalNode(() => ({
          rect: { x: 1, y: 1, w: 20, h: 1 },
          zIndex: 10,
          visible: true,
          focusable: true,
          handlers: {
            keydown: (e: any) => {
              if (e.key === "Escape") {
                e.preventDefault?.();
                open.value = true;
              }
            },
          },
        }));
        watchEffect(() => {
          mainInputId.value = id.value;
          if (id.value && events.value?.getFocused() == null) events.value?.focus(id.value);
        });
        return () =>
          h(TText, {
            x: 1,
            y: 1,
            value: "Main Input Area",
            style: { fg: "whiteBright" },
          });
      },
    });

    const App = defineComponent({
      name: "DialogAutoFocusApp",
      setup() {
        return () =>
          h(
            TBox,
            {
              x: 0,
              y: 0,
              w: cols,
              h: rows,
              border: true,
              title: "Root",
              padding: 0,
            },
            () => [
              h(MainInput),
              open.value
                ? h(
                    TDialog,
                    {
                      modelValue: open.value,
                      "onUpdate:modelValue": (v: boolean) => (open.value = v),
                      w: 30,
                      h: 8,
                      title: "Input Dialog",
                      placement: "center",
                      teleport: true,
                    } as any,
                    () => [
                      h(TText, { x: 0, y: 0, w: 26, value: "Enter value:" }),
                      h(TInput, {
                        x: 0,
                        y: 1,
                        w: 26,
                        modelValue: inputValue.value,
                        "onUpdate:modelValue": (v: string) => (inputValue.value = v),
                        autoFocus: true,
                      }),
                    ],
                  )
                : null,
            ],
          );
      },
    });

    const mounted = await mountTerminal(() => h(App), cols, rows);
    await nextTick();
    await nextTick();

    const mainId = await waitFor(() => mainInputId.value);
    expect(mounted.events()?.getFocused()).toBe(mainId);

    // Open dialog by pressing Escape on main input
    mounted
      .container()
      ?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape" }));
    await nextTick();
    await nextTick();
    await nextTick();
    await nextTick();

    // The TInput inside dialog should be focused (not the dialog container or main input)
    const focused = mounted.events()?.getFocused();
    expect(focused).not.toBe(mainId);
    expect(focused).toBeTruthy();

    // Close dialog
    open.value = false;
    await nextTick();
    await nextTick();
    // Wait for restoreFocus() microtask chain (3 levels) plus Vue updates
    await new Promise<void>((resolve) =>
      queueMicrotask(() =>
        queueMicrotask(() => queueMicrotask(() => queueMicrotask(() => resolve()))),
      ),
    );
    await nextTick();
    await nextTick();

    // Focus should return to main input
    expect(mounted.events()?.getFocused()).toBe(mainId);
    mounted.unmount();
  });

  it("teleport dialog mounts/updates without recursive loop", async () => {
    const cols = 44;
    const rows = 12;
    const open = ref(true);

    const App = defineComponent({
      name: "TeleportDialogApp",
      setup() {
        return () =>
          h(
            TBox,
            {
              x: 0,
              y: 0,
              w: cols,
              h: rows,
              border: true,
              title: "Root",
              padding: 0,
            },
            () => [
              h(TText, { x: 0, y: 0, w: cols - 2, value: "Background" }),
              h(
                TDialog,
                {
                  modelValue: open.value,
                  "onUpdate:modelValue": (v: boolean) => (open.value = v),
                  w: 26,
                  h: 6,
                  title: "Teleport",
                  placement: "center",
                  teleport: true,
                  style: { fg: "magentaBright" },
                } as any,
                () => [h(TText, { x: 0, y: 0, w: 22, value: "Hello from portal" })],
              ),
            ],
          );
      },
    });

    const mounted = await mountTerminal(() => h(App), cols, rows);
    await nextTick();
    await nextTick(); // wait for TDialog onMounted() portal mount + render

    expect(mounted.terminal.snapshot().lines.join("\n")).toContain("Teleport");
    expect(mounted.terminal.snapshot().lines.join("\n")).toContain("Hello from portal");

    open.value = false;
    await nextTick();
    await nextTick();
    expect(mounted.terminal.snapshot().lines.join("\n")).not.toContain("Hello from portal");

    open.value = true;
    await nextTick();
    await nextTick();
    expect(mounted.terminal.snapshot().lines.join("\n")).toContain("Hello from portal");

    mounted.unmount();
  });

  it("dialog emits keydown from surface (ArrowLeft/Right navigation)", async () => {
    const cols = 44;
    const rows = 12;
    const open = ref(true);
    const lastKey = ref("");

    const App = defineComponent({
      name: "DialogKeydownEmitApp",
      setup() {
        return () =>
          h(
            TBox,
            {
              x: 0,
              y: 0,
              w: cols,
              h: rows,
              border: true,
              title: "Root",
              padding: 0,
            },
            () => [
              h(
                TDialog,
                {
                  modelValue: open.value,
                  "onUpdate:modelValue": (v: boolean) => (open.value = v),
                  w: 26,
                  h: 6,
                  title: "Confirm",
                  placement: "center",
                  teleport: true,
                  onKeydown: (e: any) => {
                    lastKey.value = e.key;
                  },
                } as any,
                () => [h(TText, { x: 0, y: 0, w: 22, value: "Buttons here" })],
              ),
            ],
          );
      },
    });

    const mounted = await mountTerminal(() => h(App), cols, rows);
    await nextTick();
    await nextTick();

    mounted
      .container()
      ?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", code: "ArrowRight" }));
    await nextTick();
    expect(lastKey.value).toBe("ArrowRight");

    mounted.unmount();
  });
});
