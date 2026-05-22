import { describe, expect, it, vi } from "vitest";
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

describe("ui regressions portal select and text", () => {
  it("nested boxes + input keep borders at expected positions", async () => {
    const cols = 70;
    const rows = 22;
    const inputValue = ref("");

    const App = defineComponent({
      name: "BorderLayoutApp",
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
              padding: 1,
              style: { fg: "magentaBright" },
            },
            () => [
              h(TView, { x: 0, y: 8, w: 28, h: 5, zIndex: 10, focusable: true }, () =>
                h(
                  TBox,
                  {
                    x: 0,
                    y: 0,
                    w: 28,
                    h: 5,
                    border: true,
                    title: "Button Area",
                    padding: 0,
                    style: { fg: "redBright" },
                  },
                  () => [
                    h(TText, { x: 0, y: 0, value: "Click to focus" }),
                    h(TText, { x: 0, y: 1, value: "Enter: open select" }),
                    h(TText, { x: 0, y: 2, value: "H: toggle hint" }),
                  ],
                ),
              ),
              h(
                TBox,
                {
                  x: 0,
                  y: rows - 9,
                  w: cols - 4,
                  h: 5,
                  border: true,
                  title: "Input",
                  padding: 0,
                  style: { fg: "yellowBright" },
                },
                () =>
                  h(TInput, {
                    x: 0,
                    y: 0,
                    w: cols - 6,
                    h: 3,
                    modelValue: inputValue.value,
                    "onUpdate:modelValue": (v: string) => (inputValue.value = v),
                    placeholder: "Type here",
                  }),
              ),
            ],
          );
      },
    });

    const mounted = await mountTerminal(() => h(App), cols, rows);
    await nextTick();

    const lines = mounted.terminal.snapshot().lines;
    expect(lines[0]?.length).toBe(cols);
    expect(lines.length).toBe(rows);

    // Root box in terminal coords.
    expectBoxBorder(lines, { x: 0, y: 0, w: cols, h: rows });
    // Root padding=1 + border => content origin is (2,2).
    expectBoxBorder(lines, { x: 2, y: 10, w: 28, h: 5 });
    expectBoxBorder(lines, { x: 2, y: 15, w: cols - 4, h: 5 });

    mounted.unmount();
  });

  it("DomRenderer preserves column alignment for wide chars", async () => {
    const mounted = await mountTerminal(
      () =>
        h(
          TBox,
          {
            x: 0,
            y: 0,
            w: 10,
            h: 3,
            border: true,
            title: "Wide",
            style: { fg: "blueBright" },
          },
          () => [h(TText, { x: 0, y: 1, value: "你" })],
        ),
      10,
      3,
    );

    await nextTick();
    mounted.terminal.commit();

    const container = mounted.container();
    expect(container).not.toBe(null);
    const defaultPlaneContent = container!.querySelector(
      '[data-vt-plane="default"] > div',
    ) as HTMLElement | null;
    expect(defaultPlaneContent).not.toBe(null);
    const lines = Array.from(defaultPlaneContent!.children).map(
      (el) => (el as HTMLElement).textContent ?? "",
    );
    expect(lines[0]?.length).toBe(10);
    expect(lines[1]?.length).toBe(10);
    expect(lines[2]?.length).toBe(10);

    mounted.unmount();
  });

  it("TBox border stays closed when nested child stacks clear edge cells", async () => {
    const mounted = await mountTerminal(
      () =>
        h(
          TBox,
          {
            x: 0,
            y: 0,
            w: 20,
            h: 5,
            border: true,
            padding: 0,
            style: { fg: "blueBright", bg: "black" },
          },
          () => [
            h(TView, { x: 15, y: 0, w: 4, h: 1 }, () =>
              h(TText, {
                x: 0,
                y: 0,
                w: 4,
                value: "Link",
                style: { fg: "whiteBright", bg: "black", underline: true },
              }),
            ),
            h(TView, { x: 7, y: 3, w: 8, h: 1 }, () =>
              h(TText, {
                x: 0,
                y: 0,
                w: 8,
                value: "Run 3",
                style: { fg: "yellowBright", bg: "black" },
              }),
            ),
          ],
        ),
      24,
      7,
    );
    await nextTick();

    expectBoxBorder(mounted.terminal.snapshot().lines, { x: 0, y: 0, w: 20, h: 5 });

    mounted.unmount();
  });

  it("v-if mounts/unmounts terminal nodes cleanly", async () => {
    const show = ref(true);
    const mountedCount = ref(0);
    const unmountedCount = ref(0);

    const Child = defineComponent({
      name: "VIfChild",
      setup() {
        onMounted(() => mountedCount.value++);
        onUnmounted(() => unmountedCount.value++);
        return () => h(TText, { x: 0, y: 0, value: "Hi" });
      },
    });

    const Parent = defineComponent({
      name: "VIfParent",
      setup() {
        return () => (show.value ? h(Child) : null);
      },
    });

    const mounted = await mountTerminal(() => h(Parent), 10, 2);
    await nextTick();

    expect(mountedCount.value).toBe(1);
    expect(unmountedCount.value).toBe(0);
    expect(mounted.terminal.getCell(0, 0).ch).toBe("H");

    show.value = false;
    await nextTick();
    await nextTick();
    expect(mounted.terminal.getCell(0, 0).ch).toBe(" ");
    expect(mountedCount.value).toBe(1);
    expect(unmountedCount.value).toBe(1);

    show.value = true;
    await nextTick();
    await nextTick();
    expect(mounted.terminal.getCell(0, 0).ch).toBe("H");
    expect(mountedCount.value).toBe(2);
    expect(unmountedCount.value).toBe(1);

    mounted.unmount();
    expect(unmountedCount.value).toBe(2);
  });

  it("v-show hides terminal output without unmounting", async () => {
    const show = ref(true);
    const mountedCount = ref(0);
    const unmountedCount = ref(0);

    const Demo = defineComponent({
      name: "VShowDemo",
      setup() {
        onMounted(() => mountedCount.value++);
        onUnmounted(() => unmountedCount.value++);
        return () =>
          withDirectives(h(TText, { x: 0, y: 0, value: "Hello" }), [[vShow, show.value]]);
      },
    });

    const mounted = await mountTerminal(() => h(Demo), 10, 2);
    await nextTick();

    expect(mountedCount.value).toBe(1);
    expect(unmountedCount.value).toBe(0);
    expect(mounted.terminal.getCell(0, 0).ch).toBe("H");

    show.value = false;
    await nextTick();
    await nextTick();
    expect(mounted.terminal.getCell(0, 0).ch).toBe(" ");
    expect(mountedCount.value).toBe(1);
    expect(unmountedCount.value).toBe(0);

    show.value = true;
    await nextTick();
    await nextTick();
    expect(mounted.terminal.getCell(0, 0).ch).toBe("H");
    expect(mountedCount.value).toBe(1);
    expect(unmountedCount.value).toBe(0);

    mounted.unmount();
    expect(unmountedCount.value).toBe(1);
  });

  it("v-for style rendering clears removed rows", async () => {
    const items = ref<string[]>(["first", "second", "third"]);

    const List = defineComponent({
      name: "VForList",
      setup() {
        return () =>
          h(TView, { x: 0, y: 0, w: 20, h: 4 }, () =>
            items.value.map((t, i) => h(TText, { key: i, x: 0, y: i, w: 10, value: t })),
          );
      },
    });

    const mounted = await mountTerminal(() => h(List), 12, 4);
    await nextTick();
    await nextTick();

    expect(mounted.terminal.getCell(0, 0).ch).toBe("f");
    expect(mounted.terminal.getCell(0, 2).ch).toBe("t");

    items.value = ["x", "second"];
    await nextTick();
    await nextTick();

    // First row should update and not leave residue.
    expect(mounted.terminal.getCell(0, 0).ch).toBe("x");
    expect(mounted.terminal.getCell(1, 0).ch).toBe(" ");

    // Removed third item should be cleared.
    expect(mounted.terminal.getCell(0, 2).ch).toBe(" ");

    mounted.unmount();
  });

  it("TSelect closeOnBlur emits close when focus moves away", async () => {
    const closed = ref(0);

    const mounted = await mountTerminal(() =>
      h(TView, { x: 0, y: 0, w: 20, h: 10 }, () => [
        h(TSelect, {
          x: 0,
          y: 0,
          w: 10,
          h: 3,
          options: ["A", "B"],
          closeOnBlur: true,
          onClose: () => closed.value++,
        }),
        h(TView, { x: 0, y: 5, w: 5, h: 1, focusable: true }),
      ]),
    );

    const container = mounted.container()!;
    container.dispatchEvent(new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }));
    await nextTick();
    expect(closed.value).toBe(0);

    container.dispatchEvent(new MouseEvent("mousedown", { clientX: 0, clientY: 5, bubbles: true }));
    await nextTick();
    expect(closed.value).toBe(1);

    mounted.unmount();
  });

  it("Portal unmount repaints underlying content (no blank artifacts)", async () => {
    const mounted = await mountTerminal(
      () =>
        h(
          TBox,
          { x: 0, y: 0, w: 12, h: 4, border: true },
          { default: () => h(TText, { x: 1, y: 1, value: "X" }) },
        ),
      20,
      6,
    );

    const Overlay = defineComponent({
      name: "OverlayBox",
      setup() {
        return () =>
          h(TBox, {
            x: 0,
            y: 0,
            w: 6,
            h: 3,
            border: true,
            title: "Popup",
            style: { fg: "cyanBright" },
          });
      },
    });

    const runtime = mounted.runtime();
    expect(runtime).not.toBe(null);

    await nextTick();
    // Underlay text should be overwritten by overlay while open.
    expect(mounted.terminal.getCell(2, 2).ch).toBe("X");

    const handle = runtime!.mount(Overlay as any, {});
    await nextTick();
    expect(mounted.terminal.getCell(2, 2).ch).not.toBe("X");

    handle.unmount();
    await nextTick();
    await nextTick();

    // After overlay unmount, underlay text should be restored.
    expect(mounted.terminal.getCell(2, 2).ch).toBe("X");
    mounted.unmount();
  });

  it("Portal can reopen and stays on top of underlay", async () => {
    const mounted = await mountTerminal(() => h(TText, { x: 2, y: 2, value: "U" }), 20, 8);

    const Overlay = defineComponent({
      name: "OverlayBox2",
      setup() {
        return () =>
          h(TBox, {
            x: 1,
            y: 1,
            w: 8,
            h: 4,
            border: true,
            title: "P",
            style: { fg: "cyanBright" },
          });
      },
    });

    const runtime = mounted.runtime();
    expect(runtime).not.toBe(null);

    const handle1 = runtime!.mount(Overlay as any, {});
    await nextTick();
    // Overlay should cover underlay text at (2,2).
    expect(mounted.terminal.getCell(2, 2).ch).not.toBe("U");

    handle1.unmount();
    await nextTick();
    await nextTick();
    // Underlay restored.
    expect(mounted.terminal.getCell(2, 2).ch).toBe("U");

    const handle2 = runtime!.mount(Overlay as any, {});
    await nextTick();
    // Overlay visible again (top border at y=1, avoid title region).
    expect(mounted.terminal.getCell(6, 1).ch).toBe("─");

    handle2.unmount();
    await nextTick();
    await nextTick();
    expect(mounted.terminal.getCell(2, 2).ch).toBe("U");

    mounted.unmount();
  });

  it("Portal handle unmount is idempotent and does not break reopening", async () => {
    const mounted = await mountTerminal(() => h(TText, { x: 2, y: 2, value: "U" }), 20, 8);
    const Overlay = defineComponent({
      name: "OverlayBox3",
      setup() {
        return () =>
          h(TBox, {
            x: 1,
            y: 1,
            w: 8,
            h: 4,
            border: true,
            title: "P",
            style: { fg: "cyanBright" },
          });
      },
    });

    const runtime = mounted.runtime();
    expect(runtime).not.toBe(null);

    const handle = runtime!.mount(Overlay as any, {});
    await nextTick();
    expect(mounted.terminal.getCell(2, 2).ch).not.toBe("U");

    handle.unmount();
    await nextTick();
    await nextTick();
    expect(mounted.terminal.getCell(2, 2).ch).toBe("U");

    // Second unmount should be a no-op (common when user code keeps stale handle).
    handle.unmount();
    await nextTick();

    const handle2 = runtime!.mount(Overlay as any, {});
    await nextTick();
    expect(mounted.terminal.getCell(2, 2).ch).not.toBe("U");

    handle2.unmount();
    await nextTick();
    await nextTick();
    expect(mounted.terminal.getCell(2, 2).ch).toBe("U");

    mounted.unmount();
  });

  it("Portal overlay stays visually on top when overlapping underlay borders", async () => {
    const mounted = await mountTerminal(
      () =>
        h(
          TBox,
          {
            x: 0,
            y: 0,
            w: 20,
            h: 8,
            border: true,
            style: { fg: "yellowBright" },
          },
          { default: () => h(TText, { x: 16, y: 6, value: "U" }) },
        ),
      24,
      10,
    );

    const Overlay = defineComponent({
      name: "OverlayOverlap",
      setup() {
        // Overlap the underlay right border at x=19 and y=1..7.
        return () =>
          h(
            TBox,
            {
              x: 14,
              y: 1,
              w: 6,
              h: 7,
              border: true,
              title: "P",
              style: { fg: "cyanBright" },
            },
            { default: () => h(TText, { x: 1, y: 5, value: "O" }) },
          );
      },
    });

    const runtime = mounted.runtime();
    expect(runtime).not.toBe(null);

    const handle = runtime!.mount(Overlay as any, {});
    await nextTick();
    await nextTick();

    // The overlapping bottom-right corner should be from overlay (┘), not underlay (│).
    expect(mounted.terminal.getCell(19, 7).ch).toBe("┘");

    handle.unmount();
    await nextTick();
    await nextTick();
    mounted.unmount();
  });

  it("page switch clears old content (fullscreen replace)", async () => {
    const page = ref<"a" | "b">("a");
    const cols = 20;
    const rows = 6;
    const mounted = await mountTerminal(
      () =>
        page.value === "a"
          ? h(TText, { x: 0, y: 4, w: cols, value: "OLD" })
          : h(TText, { x: 0, y: 0, w: cols, value: "NEW" }),
      cols,
      rows,
    );

    await nextTick();
    expect(mounted.terminal.getCell(0, 4).ch).toBe("O");

    page.value = "b";
    await nextTick();
    await nextTick();

    expect(mounted.terminal.getCell(0, 0).ch).toBe("N");
    expect(mounted.terminal.getCell(0, 4).ch).toBe(" ");
    mounted.unmount();
  });

  it("TSelect autoFocus receives ArrowUp/Down key events and moves active row", async () => {
    const mounted = await mountTerminal(() =>
      h(TSelect, {
        x: 0,
        y: 1,
        w: 10,
        h: 3,
        options: ["A", "B", "C"],
        autoFocus: true,
      }),
    );

    const container = mounted.container()!;

    const rowHasHighlight = (y: number) => {
      for (let x = 0; x < 10; x++) {
        const cell = mounted.terminal.getCell(x, y);
        // Check for either inverse (old style) or yellow background (new style)
        if (cell.style.inverse || cell.style.bg === "yellow") return true;
      }
      return false;
    };

    await nextTick();

    // Initially row 1 is active (first option at y=1).
    expect(rowHasHighlight(1)).toBe(true);
    expect(rowHasHighlight(2)).toBe(false);

    container.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        code: "ArrowDown",
        bubbles: true,
      }),
    );
    await nextTick();

    // Now row 2 should be active.
    expect(rowHasHighlight(1)).toBe(false);
    expect(rowHasHighlight(2)).toBe(true);
    mounted.unmount();
  });

  it("TSelect supports per-option row styles", async () => {
    const mounted = await mountTerminal(() =>
      h(TSelect, {
        x: 0,
        y: 0,
        w: 12,
        h: 2,
        options: [
          { label: "Active" },
          { label: "Styled", style: { bg: "blackBright", fg: "whiteBright" } },
        ],
        modelValue: 0,
        style: { bg: "black", fg: "whiteBright" },
        highlightStyle: { bg: "blueBright", fg: "whiteBright", bold: true },
      }),
    );

    await nextTick();
    await nextTick();

    // Active row uses highlightStyle.
    expect(mounted.terminal.getCell(0, 0).style.bg).toBe("blueBright");
    // Non-active row uses the per-option style.
    expect(mounted.terminal.getCell(0, 1).style.bg).toBe("blackBright");

    mounted.unmount();
  });

  it("TSelect supports per-option label accent ranges", async () => {
    const mounted = await mountTerminal(() =>
      h(TSelect, {
        x: 0,
        y: 0,
        w: 20,
        h: 1,
        options: [
          {
            label: "model [think]",
            labelAccentRanges: [{ start: 6, end: 13 }],
            accentStyle: { fg: "cyan", dim: true },
            highlightAccentStyle: { fg: "cyanBright", dim: false, bold: true },
          },
        ],
        modelValue: 0,
        style: { bg: "black", fg: "whiteBright" },
        highlightStyle: { bg: "blueBright", fg: "whiteBright" },
      }),
    );

    await nextTick();
    await nextTick();

    // Non-accented label prefix uses the selected-row style.
    expect(mounted.terminal.getCell(0, 0).style.fg).toBe("whiteBright");
    expect(mounted.terminal.getCell(0, 0).style.bg).toBe("blueBright");
    // Accented tag segment uses the accent color while keeping selected-row background.
    expect(mounted.terminal.getCell(6, 0).ch).toBe("[");
    expect(mounted.terminal.getCell(6, 0).style.fg).toBe("cyanBright");
    expect(mounted.terminal.getCell(6, 0).style.bg).toBe("blueBright");

    mounted.unmount();
  });

  it("TSelect keeps the active row visible when height is smaller than options", async () => {
    const selected = ref<number[]>([1]);
    const mounted = await mountTerminal(() =>
      h(TSelect, {
        x: 0,
        y: 0,
        w: 16,
        h: 1,
        options: ["Open", "Close"],
        multiple: true,
        modelValue: selected.value,
        "onUpdate:modelValue": (v: number | number[]) => {
          selected.value = Array.isArray(v) ? v : [v];
        },
        autoFocus: true,
      }),
    );

    const rowHasHighlight = (y: number) => {
      for (let x = 0; x < 16; x++) {
        const cell = mounted.terminal.getCell(x, y);
        if (cell.style.inverse || cell.style.bg === "yellow") return true;
      }
      return false;
    };

    await nextTick();
    await nextTick();

    // Active row is the selected index (1) so the 1-row select should render "Close".
    expect(mounted.terminal.getCell(4, 0).ch).toBe("C");
    expect(rowHasHighlight(0)).toBe(true);
    mounted.unmount();
  });

  it("TSelect maxVisible limits rendered option rows", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TSelect, {
          x: 0,
          y: 0,
          w: 10,
          h: 8,
          maxVisible: 3,
          options: ["a", "b", "c", "d", "e"],
        }),
      12,
      8,
    );

    await nextTick();
    mounted.scheduler()!.flushNow();

    const snapshot = mounted.terminal.snapshot().lines.join("\n");
    expect(snapshot).toContain("a");
    expect(snapshot).toContain("c");
    expect(snapshot).not.toContain("d");

    mounted.unmount();
  });

  it("TSelect optionProvider rejects without an unhandled rejection", async () => {
    const provider = vi.fn().mockRejectedValue(new Error("load failed"));
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);

    const mounted = await mountTerminal(() =>
      h(TSelect, {
        x: 0,
        y: 0,
        w: 16,
        h: 3,
        options: [],
        optionProvider: provider,
        query: "",
      }),
    );

    try {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await nextTick();
      mounted.scheduler()!.flushNow();

      expect(provider).toHaveBeenCalled();
      expect(unhandled).toEqual([]);
      expect(mounted.terminal.snapshot().lines.join("\n")).toContain("No options");
    } finally {
      process.off("unhandledRejection", onUnhandled);
      mounted.unmount();
    }
  });

  it('TSelect valueMode="value" ignores stale multi-select values', async () => {
    const mounted = await mountTerminal(() =>
      h(TSelect, {
        x: 0,
        y: 0,
        w: 14,
        h: 2,
        multiple: true,
        valueMode: "value",
        modelValue: ["missing"],
        options: [
          { label: "Alpha", value: "a" },
          { label: "Beta", value: "b" },
        ],
      }),
    );

    await nextTick();
    mounted.scheduler()!.flushNow();

    expect(mounted.terminal.getCell(0, 0).ch).toBe("[");
    expect(mounted.terminal.getCell(1, 0).ch).toBe(" ");
    expect(mounted.terminal.getCell(2, 0).ch).toBe("]");

    mounted.unmount();
  });

  it('TSelect valueMode="option" emits option arrays in multi-select mode', async () => {
    const alpha = { label: "Alpha", value: { id: "a" } };
    const beta = { label: "Beta", value: { id: "b" } };
    const selected = ref<unknown[]>([]);
    const changes: unknown[] = [];

    const mounted = await mountTerminal(() =>
      h(TSelect, {
        x: 0,
        y: 0,
        w: 14,
        h: 2,
        multiple: true,
        valueMode: "option",
        modelValue: selected.value,
        options: [alpha, beta],
        "onUpdate:modelValue": (value: unknown) => {
          selected.value = Array.isArray(value) ? value : [value];
        },
        onChange: (value: unknown) => changes.push(value),
        autoFocus: true,
      }),
    );

    const container = mounted.container()!;
    await nextTick();

    container.dispatchEvent(
      new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true }),
    );
    await nextTick();

    expect(selected.value).toEqual([alpha]);
    expect(changes).toEqual([["Alpha"]]);
    mounted.unmount();
  });

  it("TSelect multiple toggles selection with Space and confirms with Enter", async () => {
    const selected = ref<number[]>([]);
    const confirmed = ref<string>("");

    const mounted = await mountTerminal(() =>
      h(TSelect, {
        x: 0,
        y: 0,
        w: 10,
        h: 3,
        options: ["A", "B", "C"],
        multiple: true,
        modelValue: selected.value,
        "onUpdate:modelValue": (v: number | number[]) => {
          selected.value = Array.isArray(v) ? v : [v];
        },
        onConfirm: (v: any) => {
          confirmed.value = Array.isArray(v) ? v.join(",") : "";
        },
        autoFocus: true,
      }),
    );

    const container = mounted.container()!;
    await nextTick();

    // Initially: unchecked prefix.
    expect(mounted.terminal.getCell(1, 0).ch).toBe(" ");

    // Space toggles current row (index 0).
    container.dispatchEvent(
      new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true }),
    );
    await nextTick();
    expect(selected.value).toEqual([0]);
    expect(mounted.terminal.getCell(1, 0).ch).toBe("x");

    // ArrowDown moves cursor but must not modify selection.
    container.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        code: "ArrowDown",
        bubbles: true,
      }),
    );
    await nextTick();
    expect(selected.value).toEqual([0]);

    // Enter confirms without toggling.
    container.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
      }),
    );
    await nextTick();
    expect(selected.value).toEqual([0]);
    expect(confirmed.value).toBe("A");

    // Space toggles current row (index 1).
    container.dispatchEvent(
      new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true }),
    );
    await nextTick();
    expect(selected.value).toEqual([0, 1]);
    expect(mounted.terminal.getCell(1, 1).ch).toBe("x");

    mounted.unmount();
  });

  it("TSelect multipleEmit=index makes confirm emit indices array", async () => {
    const selected = ref<number[]>([1, 2]);
    const confirmed = ref<number[]>([]);

    const mounted = await mountTerminal(() =>
      h(TSelect, {
        x: 0,
        y: 0,
        w: 10,
        h: 3,
        options: ["A", "B", "C"],
        multiple: true,
        multipleEmit: "index",
        modelValue: selected.value,
        "onUpdate:modelValue": (v: number | number[]) => {
          selected.value = Array.isArray(v) ? v : [v];
        },
        onConfirm: (v: any) => {
          confirmed.value = Array.isArray(v) ? v : [];
        },
        autoFocus: true,
      } as any),
    );

    const container = mounted.container()!;
    await nextTick();

    container.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
      }),
    );
    await nextTick();

    expect(confirmed.value).toEqual([1, 2]);
    mounted.unmount();
  });

  it("TSelect sanitizes newline so it does not write outside its rect", async () => {
    const mounted = await mountTerminal(() =>
      h(TSelect, {
        x: 5,
        y: 1,
        w: 8,
        h: 2,
        options: ["A\nB", "C"],
        autoFocus: true,
      }),
    );

    await nextTick();

    // If newline leaked, it would write at x=0 on the next row.
    expect(mounted.terminal.getCell(0, 2).ch).toBe(" ");

    mounted.unmount();
  });

  it("TText clears stale content when value shrinks", async () => {
    const value = ref("ABCDEFGHIJ");
    const mounted = await mountTerminal(
      () => h(TText, { x: 0, y: 0, w: 10, value: value.value }),
      20,
      4,
    );
    expect(mounted.terminal.getCell(9, 0).ch).toBe("J");

    value.value = "A";
    await nextTick();
    await nextTick();

    expect(mounted.terminal.getCell(0, 0).ch).toBe("A");
    for (let x = 1; x < 10; x++) expect(mounted.terminal.getCell(x, 0).ch).toBe(" ");
    mounted.unmount();
  });

  it("TText clips wide chars by cell width (no overflow)", async () => {
    const mounted = await mountTerminal(() => h(TText, { x: 0, y: 0, w: 3, value: "中中" }), 10, 3);
    expect(mounted.terminal.getCell(0, 0).ch).toBe("中");
    expect(mounted.terminal.getCell(1, 0).continuation).toBe(true);
    expect(mounted.terminal.getCell(2, 0).ch).toBe(" ");
    mounted.unmount();
  });

  it("TBox title truncates by cell width (wide chars)", async () => {
    const mounted = await mountTerminal(() =>
      h(TBox, {
        x: 0,
        y: 0,
        w: 10,
        h: 3,
        border: true,
        title: "中中中中中",
        padding: 0,
      }),
    );

    expect(mounted.terminal.getCell(0, 0).ch).toBe("┌");
    expect(mounted.terminal.getCell(9, 0).ch).toBe("┐");
    // Snapshot line should contain some title content without overwriting corners.
    expect(mounted.terminal.snapshot().lines[0]).toContain("中");
    mounted.unmount();
  });

  it("TBox keeps box drawing borders one cell wide with cjk widthProvider", async () => {
    const mounted = await mountTerminal(
      () => h(TBox, { x: 0, y: 0, w: 10, h: 4, border: true, title: "x", padding: 0 }),
      10,
      4,
      { widthProvider: "cjk" },
    );

    expect(mounted.terminal.getCell(0, 0).ch).toBe("┌");
    expect(mounted.terminal.getCell(9, 0).ch).toBe("┐");
    expect(mounted.terminal.getCell(0, 1).ch).toBe("│");
    expect(mounted.terminal.getCell(9, 1).ch).toBe("│");
    expect(mounted.terminal.getCell(0, 3).ch).toBe("└");
    expect(mounted.terminal.getCell(9, 3).ch).toBe("┘");
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 10; x++)
        expect(Boolean(mounted.terminal.getCell(x, y).continuation)).toBe(false);
    }
    mounted.unmount();
  });

  it("TBox clipRect prevents child overflow into border/neighbor", async () => {
    const mounted = await mountTerminal(
      () =>
        h(
          TBox,
          { x: 0, y: 0, w: 12, h: 5, border: true, padding: 0 },
          {
            default: () => h(TText, { x: 0, y: 0, w: 50, value: "X".repeat(50) }),
          },
        ),
      24,
      8,
    );

    // Right border of outer box must remain intact.
    expect(mounted.terminal.getCell(11, 1).ch).toBe("│");
    mounted.unmount();
  });

  it("left/right split layout does not bleed across clipRects", async () => {
    const mounted = await mountTerminal(
      () => [
        h(TBox, { x: 0, y: 0, w: 10, h: 5, border: true, padding: 0 }, () =>
          h(TText, { x: 0, y: 0, w: 100, value: "L".repeat(100) }),
        ),
        h(TBox, { x: 10, y: 0, w: 10, h: 5, border: true, padding: 0 }, () =>
          h(TText, { x: 0, y: 0, w: 8, value: "R" }),
        ),
      ],
      30,
      8,
    );

    // The left edge of the right box must remain its border.
    expect(mounted.terminal.getCell(10, 0).ch).toBe("┌");
    expect(mounted.terminal.getCell(10, 1).ch).toBe("│");
    mounted.unmount();
  });

  it("TSelect closeOnBlur emits close", async () => {
    const closed = ref(false);
    const mounted = await mountTerminal(
      () => [
        h(TView, { x: 0, y: 0, w: 12, h: 1, zIndex: 50, focusable: true }, () =>
          h(TText, { x: 0, y: 0, value: "[ Other ]" }),
        ),
        h(TSelect, {
          x: 0,
          y: 1,
          w: 12,
          h: 3,
          options: ["A", "B", "C"],
          autoFocus: true,
          closeOnBlur: true,
          onClose: () => (closed.value = true),
        } as any),
      ],
      30,
      8,
    );

    const container = mounted.container()!;
    await nextTick();
    expect(closed.value).toBe(false);

    // Focus the other node; select should blur and emit close.
    container.dispatchEvent(new MouseEvent("mousedown", { clientX: 1, clientY: 0, bubbles: true }));
    await nextTick();
    await nextTick();

    expect(closed.value).toBe(true);
    mounted.unmount();
  });

  it("TList scrolls with wheel", async () => {
    const mounted = await mountTerminal(() =>
      h(TList, {
        x: 0,
        y: 0,
        w: 10,
        h: 3,
        items: ["0", "1", "2", "3", "4", "5"],
        autoFocus: true,
      }),
    );

    const container = mounted.container()!;
    // Initial top row is '0'
    expect(mounted.terminal.getCell(0, 0).ch).toBe("0");
    const wheel = new Event("wheel", { bubbles: true }) as any;
    wheel.clientX = 0;
    wheel.clientY = 0;
    wheel.deltaY = 100;
    container.dispatchEvent(wheel);
    await nextTick();
    // After scrolling down, top row should be '1'
    expect(mounted.terminal.getCell(0, 0).ch).toBe("1");
    mounted.unmount();
  });
});
