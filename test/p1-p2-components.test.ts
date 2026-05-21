import { describe, expect, it, vi } from "vitest";
import {
  createTheme,
  TAutocompleteInput,
  TBreadcrumb,
  TCheckbox,
  TContextMenu,
  TDataTable,
  TFormField,
  TKeyHint,
  TPasswordInput,
  TPopover,
  TRadioGroup,
  TSlider,
  TStatusBar,
  TSwitch,
  TTable,
  TTooltip,
  TTree,
} from "../src/index.js";
import { h, mountTerminal, nextTick, ref } from "./ui-regressions-support.js";

describe("P1/P2 public components", () => {
  it("renders table, data table, and tree primitives", async () => {
    const rows = [
      { id: "2", name: "build", status: "fail" },
      { id: "1", name: "test", status: "ok" },
    ];
    const columns = [
      { key: "id", label: "ID", width: 3 },
      { key: "name", label: "Name", width: 8 },
      { key: "status", label: "Status", width: 6 },
    ];
    const mounted = await mountTerminal(
      () => [
        h(TTable, { x: 0, y: 0, w: 24, h: 4, columns, rows, border: true }),
        h(TDataTable, {
          x: 0,
          y: 5,
          w: 24,
          h: 4,
          columns,
          rows,
          sortable: true,
          sortBy: "id",
          sortDirection: "asc",
        }),
        h(TTree, {
          x: 28,
          y: 0,
          w: 20,
          h: 5,
          expandedIds: ["root"],
          selectedId: "leaf",
          nodes: [{ id: "root", label: "src", children: [{ id: "leaf", label: "index.ts" }] }],
        }),
      ],
      60,
      10,
    );

    try {
      const lines = mounted.terminal.snapshot().lines;
      expect(lines[0]).toContain("|ID ");
      expect(lines[2]).toContain("|2  |build");
      expect(lines[5]).toContain("ID");
      expect(lines[7]).toContain("1");
      expect(lines[0]).toContain("v src");
      expect(lines[1]).toContain("index.ts");
    } finally {
      mounted.unmount();
    }
  });

  it("renders form controls and field wrappers", async () => {
    const mounted = await mountTerminal(
      () => [
        h(TCheckbox, { x: 0, y: 0, w: 18, modelValue: true, label: "Remember" }),
        h(TSwitch, { x: 0, y: 1, w: 18, modelValue: false, label: "Live" }),
        h(TRadioGroup, {
          x: 0,
          y: 2,
          w: 18,
          h: 2,
          modelValue: "b",
          options: [
            { label: "Alpha", value: "a" },
            { label: "Beta", value: "b" },
          ],
        }),
        h(TSlider, { x: 0, y: 4, w: 18, modelValue: 50 }),
        h(TFormField, { x: 22, y: 0, w: 24, h: 3, label: "Token", help: "Required" }, () =>
          h(TPasswordInput, { x: 0, y: 0, w: 12, modelValue: "secret" }),
        ),
        h(TAutocompleteInput, {
          x: 22,
          y: 4,
          w: 20,
          h: 3,
          modelValue: "ap",
          suggestions: ["apple", "apricot"],
          highlightedIndex: 1,
        }),
      ],
      60,
      8,
    );

    try {
      const lines = mounted.terminal.snapshot().lines;
      expect(lines[0]).toContain("[x] Remember");
      expect(lines[1]).toContain("[off] Live");
      expect(lines[3]).toContain("(x) Beta");
      expect(lines[4]).toContain("[=====");
      expect(lines[0]).toContain("Token");
      expect(lines.join("\n")).not.toContain("secret");
      expect(lines[6]).toContain("apricot");
    } finally {
      mounted.unmount();
    }
  });

  it("renders overlay and navigation helpers", async () => {
    const mounted = await mountTerminal(
      () => [
        h(TContextMenu, {
          modelValue: true,
          x: 0,
          y: 0,
          w: 18,
          items: [
            { id: "open", label: "Open Link" },
            { id: "copy", label: "Copy Link" },
          ],
        }),
        h(TPopover, {
          modelValue: true,
          x: 22,
          y: 0,
          w: 18,
          h: 4,
          title: "Info",
          content: "Details",
        }),
        h(TTooltip, { x: 22, y: 5, content: "Ctrl+Click" }),
        h(TStatusBar, { x: 0, y: 7, w: 50, left: "Ready", center: "main", right: "Ctrl+K" }),
        h(TBreadcrumb, {
          x: 0,
          y: 8,
          w: 30,
          items: [
            { id: "home", label: "home" },
            { id: "src", label: "src" },
          ],
        }),
        h(TKeyHint, { x: 32, y: 8, combo: "Esc", label: "Close" }),
      ],
      60,
      10,
    );

    try {
      const lines = mounted.terminal.snapshot().lines;
      expect(lines[1]).toContain("Open Link");
      expect(lines[0]).toContain("Info");
      expect(lines[5]).toContain("Ctrl+Click");
      expect(lines[7]).toContain("Ready");
      expect(lines[8]).toContain("home / src");
      expect(lines[8]).toContain("Esc Close");
    } finally {
      mounted.unmount();
    }
  });

  it("selects the highlighted context menu item after keyboard navigation", async () => {
    const open = ref(true);
    const selectedIndex = ref(0);
    const items = [
      { id: "open", label: "Open Link" },
      { id: "copy", label: "Copy Link" },
    ];
    const onSelect = vi.fn();
    const mounted = await mountTerminal(
      () =>
        h(TContextMenu, {
          modelValue: open.value,
          "onUpdate:modelValue": (value: boolean) => (open.value = value),
          x: 0,
          y: 0,
          w: 18,
          items,
          selectedIndex: selectedIndex.value,
          "onUpdate:selectedIndex": (index: number) => (selectedIndex.value = index),
          onSelect,
        }),
      24,
      5,
    );

    try {
      const container = mounted.container()!;
      container.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 1, clientY: 1, bubbles: true }),
      );
      container.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowDown",
          code: "ArrowDown",
          bubbles: true,
          cancelable: true,
        }),
      );
      await nextTick();

      expect(selectedIndex.value).toBe(1);

      container.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          bubbles: true,
          cancelable: true,
        }),
      );
      await nextTick();

      expect(onSelect).toHaveBeenCalledWith({ item: items[1], index: 1 });
      expect(open.value).toBe(false);
    } finally {
      mounted.unmount();
    }
  });

  it("uses provider theme defaults for table and form field styles", async () => {
    const theme = createTheme({
      components: {
        TTable: {
          headerStyle: { fg: "blueBright" },
          rowStyle: { fg: "greenBright" },
          selectedStyle: { bg: "blue" },
        },
        TFormField: {
          labelStyle: { fg: "cyanBright" },
          errorStyle: { fg: "yellowBright" },
        },
      },
    });
    const mounted = await mountTerminal(
      () => [
        h(TTable, {
          x: 0,
          y: 0,
          w: 12,
          h: 4,
          columns: [{ key: "id", label: "ID", width: 4 }],
          rows: [{ id: "1" }],
          rowKey: "id",
          selectedRowKey: "1",
        }),
        h(TFormField, { x: 16, y: 0, w: 20, h: 3, label: "Token", error: "Required" }),
      ],
      40,
      5,
      { theme },
    );

    try {
      const headerStyle = mounted.terminal.getCell(0, 0).style;
      expect(headerStyle.bold).toBe(true);
      expect(headerStyle.underline).toBe(true);
      expect(headerStyle.fg).toBe("blueBright");

      const rowStyle = mounted.terminal.getCell(0, 2).style;
      expect(rowStyle.fg).toBe("greenBright");
      expect(rowStyle.inverse).toBe(true);
      expect(rowStyle.bg).toBe("blue");

      const labelStyle = mounted.terminal.getCell(16, 0).style;
      expect(labelStyle.bold).toBe(true);
      expect(labelStyle.fg).toBe("cyanBright");
      expect(mounted.terminal.getCell(16, 2).style.fg).toBe("yellowBright");
    } finally {
      mounted.unmount();
    }
  });

  it("creates theme tokens with component overrides", () => {
    const theme = createTheme({
      colors: { link: "blueBright" },
      components: {
        TLink: {
          style: { fg: "blueBright" },
          hoverStyle: { fg: "greenBright" },
          underline: true,
        },
        TTable: { selectedStyle: { bg: "blue" } },
        TFormField: { errorStyle: { fg: "yellowBright" } },
      },
    });

    expect(theme.colors.link).toBe("blueBright");
    expect(theme.components.TLink?.style?.fg).toBe("blueBright");
    expect(theme.components.TLink?.style?.underline).toBe(true);
    expect(theme.components.TLink?.hoverStyle).toMatchObject({
      fg: "greenBright",
      underline: true,
    });
    expect(theme.components.TLink?.focusStyle?.inverse).toBe(true);
    expect(theme.components.TTable?.selectedStyle).toMatchObject({
      bg: "blue",
      inverse: true,
    });
    expect(theme.components.TFormField?.labelStyle?.bold).toBe(true);
    expect(theme.components.TFormField?.errorStyle?.fg).toBe("yellowBright");
    expect(theme.colors.danger).toBe("redBright");
  });
});
