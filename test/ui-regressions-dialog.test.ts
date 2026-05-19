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

describe("ui regressions dialog", () => {
  it("dirty-row repaint never lets lower zIndex overwrite overlay", async () => {
    const cols = 70;
    const rows = 22;
    const selected = ref(false);
    const dialogOpen = ref(true);

    // Underlay: a box whose right border passes through where the dialog will be.
    const underX = 2;
    const underY = 6;
    const underW = 28;
    const underH = 10;
    const borderX = underX + underW - 1;

    const dialogW = 34;
    const dialogH = 9;
    const dialogX = Math.floor((cols - dialogW) / 2);
    const dialogY = Math.floor((rows - dialogH) / 2);

    const App = defineComponent({
      name: "DirtyRowsZIndexApp",
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
              h(TBox, {
                x: underX,
                y: underY,
                w: underW,
                h: underH,
                border: true,
                title: "Under",
                padding: 0,
                style: { fg: "blueBright" },
              }),
              h(
                TDialog,
                {
                  modelValue: dialogOpen.value,
                  "onUpdate:modelValue": (v: boolean) => (dialogOpen.value = v),
                  w: dialogW,
                  h: dialogH,
                  title: "Confirm",
                  placement: "center",
                  teleport: true,
                  style: { fg: "redBright" },
                } as any,
                () => [
                  h(TText, {
                    x: 0,
                    y: 0,
                    w: dialogW - 4,
                    value: "This should cover underlay.",
                  }),
                  h(TText, {
                    x: 0,
                    y: 3,
                    value: "[ Yes ]",
                    style: { fg: "redBright", inverse: !selected.value },
                  }),
                  h(TText, {
                    x: 14,
                    y: 3,
                    value: "[ No ]",
                    style: { fg: "blueBright", inverse: selected.value },
                  }),
                ],
              ),
            ],
          );
      },
    });

    const mounted = await mountTerminal(() => h(App), cols, rows);
    await nextTick();
    await nextTick();

    // Pick a non-dirty row inside the dialog where the underlay border would pierce
    // if a lower zIndex component incorrectly redraws outside dirty rows.
    const probeX = borderX;
    const probeY = dialogY + 1;
    expect(probeX).toBeGreaterThanOrEqual(dialogX);
    expect(probeX).toBeLessThan(dialogX + dialogW);

    const before = mounted.terminal.snapshot().lines;
    expect(before[probeY]?.[probeX]).not.toBe("│");

    // Toggle only styles inside the dialog (dirty-row update).
    selected.value = true;
    await nextTick();
    const after = mounted.terminal.snapshot().lines;
    expect(after[probeY]?.[probeX]).not.toBe("│");

    mounted.unmount();
  });

  it("v-for list updates when array mutates (add/remove)", async () => {
    const cols = 30;
    const rows = 8;
    const items = ref<string[]>([]);

    const App = defineComponent({
      name: "VForListApp",
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
              title: "List",
              padding: 1,
            },
            () => [
              items.value.length === 0 ? h(TText, { x: 0, y: 0, value: "(empty)" }) : null,
              items.value.map((t, i) =>
                h(TText, { key: t, x: 0, y: i, w: cols - 4, value: `- ${t}` }),
              ),
            ],
          );
      },
    });

    const mounted = await mountTerminal(() => h(App), cols, rows);
    await nextTick();
    expect(mounted.terminal.snapshot().lines.join("\n")).toContain("(empty)");

    items.value = ["a", "b", "c"];
    await nextTick();
    const s1 = mounted.terminal.snapshot().lines.join("\n");
    expect(s1).toContain("- a");
    expect(s1).toContain("- b");
    expect(s1).toContain("- c");

    items.value = ["a", "c"];
    await nextTick();
    const s2 = mounted.terminal.snapshot().lines.join("\n");
    expect(s2).toContain("- a");
    expect(s2).not.toContain("- b");
    expect(s2).toContain("- c");

    mounted.unmount();
  });

  it("confirm dialog gates destructive action (v-if)", async () => {
    const cols = 36;
    const rows = 10;
    const items = ref([
      { id: 1, text: "a" },
      { id: 2, text: "b" },
    ]);
    const confirmOpen = ref(false);
    const pending = ref<number | null>(null);

    function requestDelete(id: number) {
      pending.value = id;
      confirmOpen.value = true;
    }

    function cancel() {
      confirmOpen.value = false;
      pending.value = null;
    }

    function confirm() {
      const id = pending.value;
      if (id != null) items.value = items.value.filter((x) => x.id !== id);
      cancel();
    }

    const App = defineComponent({
      name: "ConfirmDeleteApp",
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
              items.value.map((t, i) =>
                h(TText, {
                  key: t.id,
                  x: 0,
                  y: i,
                  w: cols - 4,
                  value: `- ${t.text}`,
                }),
              ),
              confirmOpen.value
                ? h(
                    TBox,
                    {
                      x: 0,
                      y: 5,
                      w: cols - 2,
                      h: 3,
                      border: true,
                      title: "Confirm",
                      padding: 0,
                    },
                    () => [
                      h(TText, {
                        x: 0,
                        y: 0,
                        w: cols - 4,
                        value: `Delete id=${pending.value}`,
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
    expect(mounted.terminal.snapshot().lines.join("\n")).toContain("- a");
    expect(mounted.terminal.snapshot().lines.join("\n")).toContain("- b");

    requestDelete(2);
    await nextTick();
    const before = mounted.terminal.snapshot().lines.join("\n");
    expect(before).toContain("Confirm");
    expect(before).toContain("- b");

    cancel();
    await nextTick();
    const canceled = mounted.terminal.snapshot().lines.join("\n");
    expect(canceled).not.toContain("Confirm");
    expect(canceled).toContain("- b");

    requestDelete(2);
    await nextTick();
    confirm();
    await nextTick();
    const after = mounted.terminal.snapshot().lines.join("\n");
    expect(after).not.toContain("Confirm");
    expect(after).toContain("- a");
    expect(after).not.toContain("- b");

    mounted.unmount();
  });

  it("TDialog centers and closes on backdrop/Escape", async () => {
    const cols = 30;
    const rows = 10;
    const open = ref(true);

    const App = defineComponent({
      name: "TDialogApp",
      setup() {
        return () =>
          h(
            TDialog,
            {
              modelValue: open.value,
              "onUpdate:modelValue": (v: boolean) => (open.value = v),
              w: 10,
              h: 5,
              title: "Dlg",
              placement: "center",
            },
            () => h(TText, { x: 0, y: 0, value: "Hi" }),
          );
      },
    });

    const mounted = await mountTerminal(() => h(App), cols, rows);
    await nextTick();
    await nextTick();

    expectBoxBorder(mounted.terminal.snapshot().lines, {
      x: 10,
      y: 2,
      w: 10,
      h: 5,
    });

    const container = mounted.container()!;
    container.dispatchEvent(new MouseEvent("click", { clientX: 0, clientY: 0, bubbles: true }));
    await nextTick();
    expect(open.value).toBe(false);

    open.value = true;
    await nextTick();
    await nextTick();
    container.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        code: "Escape",
        bubbles: true,
      }),
    );
    await nextTick();
    expect(open.value).toBe(false);

    mounted.unmount();
  });

  it("TDialog border stays closed even if a child overdraws it", async () => {
    const cols = 40;
    const rows = 10;
    const open = ref(true);

    const Overdraw = defineComponent({
      name: "OverdrawBorder",
      setup() {
        const { terminal } = useTerminal();
        const layout = useLayout();

        useRenderNode(() => ({
          zIndex: 9_999,
          rect: { x: layout.originX - 2, y: layout.originY + 1, w: 20, h: 1 },
          deps: [layout.originX, layout.originY],
          paint: () => {
            terminal.write("X".repeat(20), {
              x: layout.originX - 2,
              y: layout.originY + 1,
            });
          },
        }));

        return () => null;
      },
    });

    const App = defineComponent({
      name: "TDialogBorderOverdrawApp",
      setup() {
        return () =>
          h(
            TDialog,
            {
              modelValue: open.value,
              "onUpdate:modelValue": (v: boolean) => (open.value = v),
              w: 20,
              h: 7,
              title: "Dlg",
              placement: "top-left",
              backdrop: false,
              padding: 1,
            },
            () => [h(Overdraw), h(TText, { x: 0, y: 0, value: "Hi" })],
          );
      },
    });

    const mounted = await mountTerminal(() => h(App), cols, rows);
    await nextTick();
    await nextTick();

    expectBoxBorder(mounted.terminal.snapshot().lines, {
      x: 0,
      y: 0,
      w: 20,
      h: 7,
    });

    mounted.unmount();
  });

  it("TDialog teleport positions relative to root, not parent", async () => {
    const cols = 30;
    const rows = 10;
    const open = ref(true);

    const App = defineComponent({
      name: "TDialogTeleportApp",
      setup() {
        return () =>
          h(
            TBox,
            {
              x: 0,
              y: 0,
              w: 10,
              h: 4,
              border: true,
              title: "Parent",
              padding: 0,
            },
            () => [
              h(
                TDialog,
                {
                  modelValue: open.value,
                  "onUpdate:modelValue": (v: boolean) => (open.value = v),
                  w: 10,
                  h: 5,
                  title: "Dlg",
                  placement: "center",
                  teleport: true,
                },
                () => h(TText, { x: 0, y: 0, value: "Hi" }),
              ),
            ],
          );
      },
    });

    const mounted = await mountTerminal(() => h(App), cols, rows);
    await nextTick();
    await nextTick();

    const lines = mounted.terminal.snapshot().lines;
    expectBoxBorder(lines, { x: 10, y: 2, w: 10, h: 5 });
    expect(lines[1]?.[1]).not.toBe("┌");

    mounted.unmount();
  });

  it("TDialog buttons support ArrowLeft/Right and Enter confirm", async () => {
    const open = ref(true);
    const confirmed = ref("");
    const mounted = await mountTerminal(
      () =>
        h(
          TDialog as any,
          {
            modelValue: open.value,
            "onUpdate:modelValue": (v: boolean) => (open.value = v),
            w: 26,
            h: 7,
            title: "Confirm",
            placement: "center",
            teleport: true,
            closeOnConfirm: false,
            buttons: [
              { label: "Yes", value: "yes", kind: "primary", default: true },
              { label: "No", value: "no" },
            ],
            onConfirm: (b: any) => {
              confirmed.value = String(b?.value ?? "");
            },
          },
          () => h(TText, { x: 0, y: 0, w: 22, value: "Hi" }),
        ),
      44,
      12,
    );

    const container = mounted.container()!;
    await nextTick();
    await nextTick();

    container.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowLeft",
        code: "ArrowLeft",
        bubbles: true,
      }),
    );
    await nextTick();
    container.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
      }),
    );
    await nextTick();
    expect(confirmed.value).toBe("no");

    container.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowRight",
        code: "ArrowRight",
        bubbles: true,
      }),
    );
    await nextTick();
    container.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
      }),
    );
    await nextTick();
    expect(confirmed.value).toBe("yes");
    mounted.unmount();
  });

  it("TDialog footer buttons forward unhandled keys to the dialog keymap", async () => {
    const open = ref(true);
    const lastKey = ref("");
    const prevented = ref(false);
    const confirmed = ref("");
    const mounted = await mountTerminal(
      () =>
        h(
          TDialog as any,
          {
            modelValue: open.value,
            "onUpdate:modelValue": (v: boolean) => (open.value = v),
            w: 28,
            h: 7,
            title: "Sessions",
            placement: "center",
            teleport: true,
            closeOnConfirm: false,
            buttons: [
              { label: "Open", value: "open", kind: "primary", default: true },
              { label: "Close", value: "close" },
            ],
            onKeydown: (e: any) => {
              lastKey.value = String(e?.key ?? "");
              if (e?.key === "ArrowDown") {
                e.preventDefault?.();
                prevented.value = true;
              }
            },
            onConfirm: (b: any) => {
              confirmed.value = String(b?.value ?? "");
            },
          },
          () => h(TText, { x: 0, y: 0, w: 24, value: "Rows" }),
        ),
      44,
      12,
    );

    const container = mounted.container()!;
    await nextTick();
    await nextTick();

    container.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        code: "ArrowDown",
        bubbles: true,
      }),
    );
    await nextTick();
    expect(lastKey.value).toBe("ArrowDown");
    expect(prevented.value).toBe(true);
    expect(confirmed.value).toBe("");

    mounted.unmount();
  });

  it("TDialog forwards keydown capture before focused footer buttons handle the key", async () => {
    const open = ref(true);
    const calls: string[] = [];
    const confirmed = ref("");
    const mounted = await mountTerminal(
      () =>
        h(
          TDialog as any,
          {
            modelValue: open.value,
            "onUpdate:modelValue": (v: boolean) => (open.value = v),
            w: 28,
            h: 7,
            title: "Sessions",
            placement: "center",
            teleport: true,
            closeOnConfirm: false,
            buttons: [
              { label: "Open", value: "open", kind: "primary", default: true },
              { label: "Close", value: "close" },
            ],
            onKeydownCapture: (e: any) => {
              calls.push(`capture:${String(e?.key ?? "")}`);
              if (e?.key === "ArrowDown") {
                e.preventDefault?.();
                e.stopPropagation?.();
              }
            },
            onKeydown: (e: any) => {
              calls.push(`bubble:${String(e?.key ?? "")}`);
            },
            onConfirm: (b: any) => {
              confirmed.value = String(b?.value ?? "");
            },
          },
          () => h(TText, { x: 0, y: 0, w: 24, value: "Rows" }),
        ),
      44,
      12,
    );

    const container = mounted.container()!;
    await nextTick();
    await nextTick();

    container.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        code: "ArrowDown",
        bubbles: true,
      }),
    );
    await nextTick();
    expect(calls).toEqual(["capture:ArrowDown"]);
    expect(confirmed.value).toBe("");

    mounted.unmount();
  });

  it("TDialog footer hitboxes stay below higher-z dialog content controls", async () => {
    const open = ref(true);
    const selected = ref(0);
    const mounted = await mountTerminal(
      () =>
        h(
          TDialog as any,
          {
            modelValue: open.value,
            "onUpdate:modelValue": (v: boolean) => (open.value = v),
            w: 32,
            h: 9,
            title: "Sessions",
            placement: "center",
            teleport: true,
            closeOnConfirm: false,
            buttons: [
              { label: "Open", value: "open" },
              { label: "Close", value: "close" },
            ],
          },
          () =>
            h(TSelect, {
              x: 0,
              y: 0,
              w: 28,
              h: 3,
              zIndex: 5,
              options: ["one", "two"],
              modelValue: selected.value,
              "onUpdate:modelValue": (v: number) => (selected.value = v),
            }),
        ),
      44,
      12,
    );

    const manager = await waitFor(() => mounted.events());
    await nextTick();
    await nextTick();

    const focusables = manager
      .debugNodes()
      .filter((n) => n.visible && n.focusable && n.rect.w > 0 && n.rect.h > 0);
    const selectNode = focusables.find((n) => n.rect.h === 3 && n.rect.w === 28);
    expect(selectNode).toBeTruthy();

    const footerY = Math.max(...focusables.map((n) => n.rect.y));
    const footerZ = Math.max(
      ...focusables.filter((n) => n.rect.y === footerY).map((n) => n.zIndex),
    );
    expect(footerZ).toBeLessThan(selectNode!.zIndex);

    mounted.unmount();
  });

  it("TDialog only underlines the selected footer button", async () => {
    const open = ref(true);
    const mounted = await mountTerminal(
      () =>
        h(
          TDialog as any,
          {
            modelValue: open.value,
            "onUpdate:modelValue": (v: boolean) => (open.value = v),
            w: 34,
            h: 7,
            title: "Confirm",
            placement: "center",
            teleport: true,
            contentStyle: { bg: "black" },
            buttons: [
              { label: "Apply", value: "apply", kind: "primary", default: true },
              { label: "Cancel", value: "cancel" },
            ],
          },
          () => h(TText, { x: 0, y: 0, w: 28, value: "Hi" }),
        ),
      48,
      12,
    );

    const container = mounted.container()!;
    await nextTick();
    await nextTick();

    const initialLines = mounted.terminal.snapshot().lines;
    const buttonY = initialLines.findIndex((line) => line.includes("[ Apply ]"));
    const applyX = initialLines[buttonY]!.indexOf("[ Apply ]") + 2;
    const cancelX = initialLines[buttonY]!.indexOf("[ Cancel ]") + 2;
    expect(mounted.terminal.getCell(applyX, buttonY).style.underline).toBe(true);
    expect(mounted.terminal.getCell(cancelX, buttonY).style.underline).not.toBe(true);

    container.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowRight",
        code: "ArrowRight",
        bubbles: true,
      }),
    );
    await nextTick();

    expect(mounted.terminal.getCell(applyX, buttonY).style.underline).not.toBe(true);
    expect(mounted.terminal.getCell(cancelX, buttonY).style.underline).toBe(true);
    mounted.unmount();
  });

  it("TDialog suppresses click after pointerup confirms a footer button", async () => {
    const open = ref(true);
    const onConfirm = vi.fn();
    const mounted = await mountTerminal(
      () =>
        h(
          TDialog as any,
          {
            modelValue: open.value,
            "onUpdate:modelValue": (v: boolean) => (open.value = v),
            w: 24,
            h: 7,
            title: "Confirm",
            placement: "center",
            teleport: true,
            closeOnConfirm: false,
            buttons: [{ label: "OK", value: "ok", default: true }],
            onConfirm,
          },
          () => h(TText, { x: 0, y: 0, w: 20, value: "Hi" }),
        ),
      40,
      12,
    );

    const container = mounted.container()!;
    await nextTick();
    await nextTick();

    const lines = mounted.terminal.snapshot().lines;
    const buttonY = lines.findIndex((line) => line.includes("[ OK ]"));
    const okX = lines[buttonY]!.indexOf("[ OK ]") + 2;

    container.dispatchEvent(
      new MouseEvent("pointerdown", { clientX: okX, clientY: buttonY, bubbles: true }),
    );
    container.dispatchEvent(
      new MouseEvent("pointerup", { clientX: okX, clientY: buttonY, bubbles: true }),
    );
    container.dispatchEvent(
      new MouseEvent("click", { clientX: okX, clientY: buttonY, bubbles: true }),
    );
    await nextTick();

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenLastCalledWith({
      label: "OK",
      value: "ok",
      default: true,
      index: 0,
    });
    mounted.unmount();
  });

  it("TDialog pointerup on another footer button cell waits for click confirmation", async () => {
    const open = ref(true);
    const onConfirm = vi.fn();
    const mounted = await mountTerminal(
      () =>
        h(
          TDialog as any,
          {
            modelValue: open.value,
            "onUpdate:modelValue": (v: boolean) => (open.value = v),
            w: 24,
            h: 7,
            title: "Confirm",
            placement: "center",
            teleport: true,
            closeOnConfirm: false,
            buttons: [{ label: "OK", value: "ok", default: true }],
            onConfirm,
          },
          () => h(TText, { x: 0, y: 0, w: 20, value: "Hi" }),
        ),
      40,
      12,
    );

    const container = mounted.container()!;
    await nextTick();
    await nextTick();

    const lines = mounted.terminal.snapshot().lines;
    const buttonY = lines.findIndex((line) => line.includes("[ OK ]"));
    const okX = lines[buttonY]!.indexOf("[ OK ]") + 2;
    const otherOkCellX = okX + 1;

    container.dispatchEvent(
      new MouseEvent("pointerdown", { clientX: okX, clientY: buttonY, bubbles: true }),
    );
    container.dispatchEvent(
      new MouseEvent("pointerup", { clientX: otherOkCellX, clientY: buttonY, bubbles: true }),
    );
    await nextTick();
    expect(onConfirm).not.toHaveBeenCalled();

    container.dispatchEvent(
      new MouseEvent("click", { clientX: otherOkCellX, clientY: buttonY, bubbles: true }),
    );
    await nextTick();
    expect(onConfirm).toHaveBeenCalledTimes(1);
    mounted.unmount();
  });

  it("TDialog Enter still confirms after a suppressed pointer click", async () => {
    const open = ref(true);
    const onConfirm = vi.fn();
    const mounted = await mountTerminal(
      () =>
        h(
          TDialog as any,
          {
            modelValue: open.value,
            "onUpdate:modelValue": (v: boolean) => (open.value = v),
            w: 24,
            h: 7,
            title: "Confirm",
            placement: "center",
            teleport: true,
            closeOnConfirm: false,
            buttons: [{ label: "OK", value: "ok", default: true }],
            onConfirm,
          },
          () => h(TText, { x: 0, y: 0, w: 20, value: "Hi" }),
        ),
      40,
      12,
    );

    const container = mounted.container()!;
    await nextTick();
    await nextTick();

    const lines = mounted.terminal.snapshot().lines;
    const buttonY = lines.findIndex((line) => line.includes("[ OK ]"));
    const okX = lines[buttonY]!.indexOf("[ OK ]") + 2;

    container.dispatchEvent(
      new MouseEvent("pointerdown", { clientX: okX, clientY: buttonY, bubbles: true }),
    );
    container.dispatchEvent(
      new MouseEvent("pointerup", { clientX: okX, clientY: buttonY, bubbles: true }),
    );
    container.dispatchEvent(
      new MouseEvent("click", { clientX: okX, clientY: buttonY, bubbles: true }),
    );
    await nextTick();
    expect(onConfirm).toHaveBeenCalledTimes(1);

    container.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }),
    );
    await nextTick();
    expect(onConfirm).toHaveBeenCalledTimes(2);
    mounted.unmount();
  });

  it("TDialog click, Enter, and Escape paths dispatch once per action", async () => {
    const open = ref(true);
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    const onUpdateModelValue = vi.fn((v: boolean) => {
      open.value = v;
    });
    const mounted = await mountTerminal(
      () =>
        h(
          TDialog as any,
          {
            modelValue: open.value,
            "onUpdate:modelValue": onUpdateModelValue,
            w: 24,
            h: 7,
            title: "Confirm",
            placement: "center",
            teleport: true,
            closeOnConfirm: false,
            buttons: [{ label: "OK", value: "ok", default: true }],
            onConfirm,
            onClose,
          },
          () => h(TText, { x: 0, y: 0, w: 20, value: "Hi" }),
        ),
      40,
      12,
    );

    const container = mounted.container()!;
    await nextTick();
    await nextTick();

    const lines = mounted.terminal.snapshot().lines;
    const buttonY = lines.findIndex((line) => line.includes("[ OK ]"));
    const okX = lines[buttonY]!.indexOf("[ OK ]") + 2;

    container.dispatchEvent(
      new MouseEvent("click", { clientX: okX, clientY: buttonY, bubbles: true }),
    );
    await nextTick();
    expect(onConfirm).toHaveBeenCalledTimes(1);

    container.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }),
    );
    await nextTick();
    expect(onConfirm).toHaveBeenCalledTimes(2);

    container.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }),
    );
    await nextTick();
    container.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }),
    );
    await nextTick();

    expect(onUpdateModelValue).toHaveBeenCalledTimes(1);
    expect(onUpdateModelValue).toHaveBeenLastCalledWith(false);
    expect(onClose).toHaveBeenCalledTimes(1);
    mounted.unmount();
  });

  it("TDialog reopen does not leave stale footer handlers", async () => {
    const open = ref(true);
    const onConfirm = vi.fn();
    const mounted = await mountTerminal(
      () =>
        h(
          TDialog as any,
          {
            modelValue: open.value,
            "onUpdate:modelValue": (v: boolean) => (open.value = v),
            w: 24,
            h: 7,
            title: "Confirm",
            placement: "center",
            teleport: true,
            buttons: [{ label: "OK", value: "ok", default: true }],
            onConfirm,
          },
          () => h(TText, { x: 0, y: 0, w: 20, value: "Hi" }),
        ),
      40,
      12,
    );

    const container = mounted.container()!;
    await nextTick();
    await nextTick();

    let lines = mounted.terminal.snapshot().lines;
    let buttonY = lines.findIndex((line) => line.includes("[ OK ]"));
    let okX = lines[buttonY]!.indexOf("[ OK ]") + 2;

    container.dispatchEvent(
      new MouseEvent("click", { clientX: okX, clientY: buttonY, bubbles: true }),
    );
    await nextTick();
    expect(open.value).toBe(false);
    expect(onConfirm).toHaveBeenCalledTimes(1);

    container.dispatchEvent(
      new MouseEvent("click", { clientX: okX, clientY: buttonY, bubbles: true }),
    );
    await nextTick();
    expect(onConfirm).toHaveBeenCalledTimes(1);

    open.value = true;
    await nextTick();
    await nextTick();

    lines = mounted.terminal.snapshot().lines;
    buttonY = lines.findIndex((line) => line.includes("[ OK ]"));
    okX = lines[buttonY]!.indexOf("[ OK ]") + 2;

    container.dispatchEvent(
      new MouseEvent("click", { clientX: okX, clientY: buttonY, bubbles: true }),
    );
    await nextTick();
    expect(onConfirm).toHaveBeenCalledTimes(2);
    mounted.unmount();
  });

  it("TDialog keeps Tab order in sync after ArrowLeft/Right button navigation", async () => {
    const open = ref(true);
    const confirmed = ref("");
    const mounted = await mountTerminal(
      () =>
        h(
          TDialog as any,
          {
            modelValue: open.value,
            "onUpdate:modelValue": (v: boolean) => (open.value = v),
            w: 30,
            h: 7,
            title: "Confirm",
            placement: "center",
            teleport: true,
            closeOnConfirm: false,
            buttons: [
              { label: "One", value: "one", default: true },
              { label: "Two", value: "two" },
              { label: "Three", value: "three" },
            ],
            onConfirm: (b: any) => {
              confirmed.value = String(b?.value ?? "");
            },
          },
          () => h(TText, { x: 0, y: 0, w: 24, value: "Hi" }),
        ),
      48,
      12,
    );

    const container = mounted.container()!;
    await nextTick();
    await nextTick();

    container.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Tab",
        code: "Tab",
        bubbles: true,
      }),
    );
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));

    container.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowLeft",
        code: "ArrowLeft",
        bubbles: true,
      }),
    );
    await nextTick();

    container.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Tab",
        code: "Tab",
        bubbles: true,
      }),
    );
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));

    container.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
      }),
    );
    await nextTick();

    expect(confirmed.value).toBe("two");
    mounted.unmount();
  });

  it("TDialog tabMode=wrapFromButtons wraps back to content even when footer buttons are clipped", async () => {
    const open = ref(true);
    const value = ref("hi");
    const mounted = await mountTerminal(
      () =>
        h(
          TDialog as any,
          {
            modelValue: open.value,
            "onUpdate:modelValue": (v: boolean) => (open.value = v),
            w: 14,
            h: 8,
            title: "Settings",
            placement: "top-left",
            teleport: true,
            tabMode: "wrapFromButtons",
            closeOnConfirm: false,
            buttons: [
              { label: "ApplyApplyApply", value: "apply", default: true },
              { label: "ResetResetReset", value: "reset" },
              { label: "CancelCancel", value: "cancel" },
            ],
          },
          () =>
            h(TInput, {
              x: 0,
              y: 0,
              w: 10,
              modelValue: value.value,
              "onUpdate:modelValue": (v: string) => (value.value = v),
            }),
        ),
      40,
      12,
    );

    const container = mounted.container()!;
    const manager = await waitFor(() => mounted.events());
    await nextTick();
    await nextTick();

    const focusables = await waitFor(() => {
      const nodes = manager
        .debugNodes()
        .filter((n) => n.visible && n.focusable && n.rect.w > 0 && n.rect.h > 0)
        .sort((a, b) => b.rect.w * b.rect.h - a.rect.w * a.rect.h);

      const inner = nodes.slice(1);
      if (inner.length < 2) return null;
      const ys = new Set(inner.map((n) => n.rect.y));
      return ys.size >= 2 ? inner : null;
    });
    const footerRowY = Math.max(...focusables.map((n) => n.rect.y));
    const contentFocusables = focusables
      .filter((n) => n.rect.y !== footerRowY)
      .sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);
    expect(contentFocusables.length).toBeGreaterThan(0);
    manager.focus(contentFocusables[0]!.id);
    await nextTick();
    const focusedBeforeTab = manager.getFocused();
    expect(focusedBeforeTab).toBeTruthy();
    const initialNode = manager.debugNodes().find((n) => n.id === focusedBeforeTab);
    expect(initialNode?.rect.y).not.toBe(footerRowY);

    // Tab to the footer buttons, then Tab again should wrap back to the first content focusable,
    // even if the button rects are clipped and can't be matched exactly.
    container.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", code: "Tab", bubbles: true }),
    );
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const focusedAfterFirstTab = manager.getFocused();
    expect(focusedAfterFirstTab).toBeTruthy();
    const firstNode = manager.debugNodes().find((n) => n.id === focusedAfterFirstTab);
    expect(firstNode?.rect.y).toBe(footerRowY);

    container.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", code: "Tab", bubbles: true }),
    );
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const focusedAfterSecondTab = manager.getFocused();
    const secondNode = manager.debugNodes().find((n) => n.id === focusedAfterSecondTab);
    expect(secondNode?.rect.y).not.toBe(footerRowY);

    mounted.unmount();
  });
});
