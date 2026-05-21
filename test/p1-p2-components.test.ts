import { describe, expect, it, vi } from "vitest";
import {
  createTheme,
  TAutocompleteInput,
  TCheckbox,
  TCommandPalette,
  TDataTable,
  TFormField,
  TPasswordInput,
  TRadioGroup,
  TSlider,
  TSwitch,
  TTable,
  TText,
  TTree,
} from "../src/index.js";
import { TBreadcrumb, TContextMenu, TKeyHint, TPopover, TStatusBar, TTooltip } from "../src/vue.js";
import {
  createTerminalApp,
  defineComponent,
  h,
  mountTerminal,
  nextTick,
  ref,
} from "./ui-regressions-support.js";

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

  it("activates data table sortable headers and selectable rows from keyboard focus", async () => {
    const rows = [
      { id: "2", name: "build" },
      { id: "1", name: "test" },
    ];
    const columns = [
      { key: "id", label: "ID", width: 3 },
      { key: "name", label: "Name", width: 8 },
    ];
    const selectedRowKey = ref<unknown>(undefined);
    const onSortChange = vi.fn();
    const onRowSelect = vi.fn();
    const mounted = await mountTerminal(
      () =>
        h(TDataTable, {
          x: 0,
          y: 0,
          w: 16,
          h: 4,
          columns,
          rows,
          rowKey: "id",
          selectedRowKey: selectedRowKey.value,
          "onUpdate:selectedRowKey": (key: unknown) => (selectedRowKey.value = key),
          sortable: true,
          selectable: true,
          onSortChange,
          onRowSelect,
        }),
      24,
      5,
    );

    try {
      const container = mounted.container()!;
      container.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 1, clientY: 0, bubbles: true }),
      );
      container.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          bubbles: true,
          cancelable: true,
        }),
      );
      await nextTick();

      expect(onSortChange).toHaveBeenCalledWith({ sortBy: "id", sortDirection: "asc" });

      container.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 1, clientY: 2, bubbles: true }),
      );
      container.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          bubbles: true,
          cancelable: true,
        }),
      );
      await nextTick();

      expect(selectedRowKey.value).toBe("2");
      expect(onRowSelect).toHaveBeenCalledWith({
        row: rows[0],
        index: 0,
        originalIndex: 0,
        key: "2",
      });
    } finally {
      mounted.unmount();
    }
  });

  it("does not toggle disabled expandable tree nodes", async () => {
    const expandedIds = ref<string[]>([]);
    const onToggle = vi.fn();
    const mounted = await mountTerminal(
      () =>
        h(TTree, {
          x: 0,
          y: 0,
          w: 20,
          h: 3,
          expandedIds: expandedIds.value,
          "onUpdate:expandedIds": (ids: string[]) => (expandedIds.value = ids),
          onToggle,
          nodes: [
            {
              id: "root",
              label: "root",
              disabled: true,
              children: [{ id: "leaf", label: "leaf" }],
            },
          ],
        }),
      30,
      5,
    );

    try {
      mounted
        .container()!
        .dispatchEvent(new MouseEvent("click", { clientX: 0, clientY: 0, bubbles: true }));
      await nextTick();

      expect(expandedIds.value).toEqual([]);
      expect(onToggle).not.toHaveBeenCalled();
      expect(
        mounted
          .events()!
          .debugNodes()
          .some((node) => node.visible && node.focusable && node.rect.x === 0 && node.rect.y === 0),
      ).toBe(false);
    } finally {
      mounted.unmount();
    }
  });

  it("can select expandable tree parents when selectableParents is enabled", async () => {
    const expandedIds = ref<string[]>(["root"]);
    const selectedId = ref("");
    const onSelect = vi.fn();
    const onToggle = vi.fn();
    const App = defineComponent({
      name: "SelectableParentsTreeHost",
      setup() {
        return () =>
          h(TTree, {
            x: 0,
            y: 0,
            w: 20,
            h: 4,
            expandedIds: expandedIds.value,
            selectedId: selectedId.value,
            selectableParents: true,
            "onUpdate:expandedIds": (ids: string[]) => (expandedIds.value = ids),
            "onUpdate:selectedId": (id: string) => (selectedId.value = id),
            onSelect,
            onToggle,
            nodes: [{ id: "root", label: "root", children: [{ id: "leaf", label: "leaf" }] }],
          });
      },
    });

    const app = createTerminalApp({ cols: 24, rows: 6, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "click", cellX: 3, cellY: 0, time: Date.now() } as any);
      await nextTick();
      app.scheduler.flushNow();

      expect(selectedId.value).toBe("root");
      expect(expandedIds.value).toEqual(["root"]);
      expect(onSelect).toHaveBeenCalledWith({
        id: "root",
        node: { id: "root", label: "root", children: [{ id: "leaf", label: "leaf" }] },
      });

      app.events.dispatch({ type: "click", cellX: 0, cellY: 0, time: Date.now() } as any);
      await nextTick();
      app.scheduler.flushNow();

      expect(expandedIds.value).toEqual([]);
      expect(selectedId.value).toBe("root");
      expect(onToggle).toHaveBeenCalledWith({
        id: "root",
        expanded: false,
        node: { id: "root", label: "root", children: [{ id: "leaf", label: "leaf" }] },
      });
    } finally {
      app.dispose();
    }
  });

  it("applies table column header and body styles", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TTable, {
          x: 0,
          y: 0,
          w: 12,
          h: 3,
          border: true,
          headerStyle: { fg: "redBright" },
          style: { fg: "white" },
          columns: [
            {
              key: "name",
              label: "Name",
              width: 8,
              headerStyle: { fg: "blueBright" },
              style: { fg: "greenBright" },
            },
          ],
          rows: [{ name: "build" }],
        }),
      16,
      4,
    );

    try {
      expect(mounted.terminal.getCell(1, 0).style.fg).toBe("blueBright");
      expect(mounted.terminal.getCell(1, 2).style.fg).toBe("greenBright");
      expect(mounted.terminal.getCell(0, 0).style.fg).toBe("redBright");
    } finally {
      mounted.unmount();
    }
  });

  it("keeps static table rows and headers out of the focus flow by default", async () => {
    const rows = [{ id: "1", name: "build" }];
    const columns = [
      { key: "id", label: "ID", width: 3 },
      { key: "name", label: "Name", width: 8 },
    ];
    const mounted = await mountTerminal(
      () => h(TTable, { x: 0, y: 0, w: 16, h: 3, columns, rows }),
      20,
      5,
    );

    try {
      expect(
        mounted
          .events()!
          .debugNodes()
          .filter((node) => node.visible && node.focusable),
      ).toHaveLength(0);
    } finally {
      mounted.unmount();
    }
  });

  it("opts table focusable rows and headers in explicitly", async () => {
    const rows = [{ id: "1", name: "build" }];
    const columns = [
      { key: "id", label: "ID", width: 3 },
      { key: "name", label: "Name", width: 8 },
    ];
    const mounted = await mountTerminal(
      () =>
        h(TTable, {
          x: 0,
          y: 0,
          w: 16,
          h: 3,
          columns,
          rows,
          headerFocusable: true,
          rowFocusable: true,
        }),
      20,
      5,
    );

    try {
      const focusable = mounted
        .events()!
        .debugNodes()
        .filter((node) => node.visible && node.focusable);
      expect(focusable.some((node) => node.rect.y === 0)).toBe(true);
      expect(focusable.some((node) => node.rect.y === 2)).toBe(true);
    } finally {
      mounted.unmount();
    }
  });

  it("keeps data table sortable headers and selectable rows focusable", async () => {
    const rows = [{ id: "1", name: "build" }];
    const columns = [
      { key: "id", label: "ID", width: 3 },
      { key: "name", label: "Name", width: 8 },
    ];
    const mounted = await mountTerminal(
      () =>
        h(TDataTable, {
          x: 0,
          y: 0,
          w: 16,
          h: 3,
          columns,
          rows,
          sortable: true,
          selectable: true,
        }),
      20,
      5,
    );

    try {
      const focusable = mounted
        .events()!
        .debugNodes()
        .filter((node) => node.visible && node.focusable);
      expect(focusable.some((node) => node.rect.y === 0)).toBe(true);
      expect(focusable.some((node) => node.rect.y === 2)).toBe(true);
    } finally {
      mounted.unmount();
    }
  });

  it("preserves TerminalProvider defaultStyle when public components add partial styles", async () => {
    const mounted = await mountTerminal(
      () => [
        h(TTable, {
          x: 0,
          y: 0,
          w: 12,
          h: 3,
          columns: [{ key: "name", label: "Name", width: 8 }],
          rows: [{ name: "build" }],
        }),
        h(TFormField, { x: 14, y: 0, w: 12, h: 3, label: "Token", help: "Required" }),
        h(TSlider, { x: 0, y: 4, w: 18, modelValue: 50 }),
        h(TTree, {
          x: 20,
          y: 4,
          w: 12,
          h: 2,
          selectedId: "selected",
          nodes: [
            { id: "selected", label: "Selected" },
            { id: "disabled", label: "Disabled", disabled: true },
          ],
        }),
        h(TContextMenu, {
          modelValue: true,
          x: 34,
          y: 0,
          w: 12,
          items: [
            { id: "open", label: "Open" },
            { id: "copy", label: "Copy", disabled: true },
          ],
        }),
        h(TKeyHint, { x: 0, y: 7, combo: "Esc", label: "Close" }),
        h(TBreadcrumb, {
          x: 14,
          y: 7,
          w: 16,
          items: [
            { id: "home", label: "home" },
            { id: "src", label: "src" },
          ],
        }),
        h(TStatusBar, { x: 0, y: 8, w: 32, left: "Ready" }),
        h(TTooltip, { x: 34, y: 7, content: "Tip" }),
      ],
      60,
      10,
      { defaultStyle: { fg: "whiteBright", bg: "blue" } },
    );

    try {
      expect(mounted.terminal.getCell(0, 0).style).toMatchObject({
        fg: "whiteBright",
        bg: "blue",
        bold: true,
      });
      expect(mounted.terminal.getCell(0, 2).style).toMatchObject({
        fg: "whiteBright",
        bg: "blue",
      });
      expect(mounted.terminal.getCell(14, 0).style).toMatchObject({
        fg: "whiteBright",
        bg: "blue",
        bold: true,
      });
      expect(mounted.terminal.getCell(14, 2).style).toMatchObject({
        fg: "whiteBright",
        bg: "blue",
        dim: true,
      });
      expect(mounted.terminal.getCell(1, 4).style).toMatchObject({
        fg: "cyanBright",
        bg: "blue",
      });
      expect(mounted.terminal.getCell(20, 4).style).toMatchObject({
        fg: "whiteBright",
        bg: "blue",
        inverse: true,
      });
      expect(mounted.terminal.getCell(20, 5).style).toMatchObject({
        fg: "whiteBright",
        bg: "blue",
        dim: true,
      });
      expect(mounted.terminal.getCell(35, 1).style).toMatchObject({
        fg: "whiteBright",
        bg: "blue",
        inverse: true,
      });
      expect(mounted.terminal.getCell(35, 2).style).toMatchObject({
        fg: "whiteBright",
        bg: "blue",
        dim: true,
      });
      expect(mounted.terminal.getCell(0, 7).style).toMatchObject({
        fg: "whiteBright",
        bg: "blue",
        inverse: true,
      });
      expect(mounted.terminal.getCell(21, 7).style).toMatchObject({
        fg: "whiteBright",
        bg: "blue",
        bold: true,
      });
      expect(mounted.terminal.getCell(0, 8).style).toMatchObject({
        fg: "whiteBright",
        bg: "blue",
        inverse: true,
      });
      expect(mounted.terminal.getCell(34, 7).style).toMatchObject({
        fg: "whiteBright",
        bg: "blue",
        inverse: true,
      });
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
        h(
          TFormField,
          { x: 22, y: 0, w: 24, h: 3, label: "Token", help: "Required", style: { fg: "white" } },
          () => h(TPasswordInput, { x: 0, y: 0, w: 12, modelValue: "secret" }),
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
      expect(mounted.terminal.getCell(22, 0).style.fg).toBe("white");
      expect(mounted.terminal.getCell(22, 2).style.fg).toBe("white");
    } finally {
      mounted.unmount();
    }
  });

  it("forwards autocomplete input and change events from the inner input", async () => {
    const value = ref("");
    const inputs: string[] = [];
    const changes: string[] = [];
    const mounted = await mountTerminal(
      () =>
        h(TAutocompleteInput, {
          x: 0,
          y: 0,
          w: 20,
          h: 3,
          modelValue: value.value,
          "onUpdate:modelValue": (next: string) => (value.value = next),
          onInput: (next: string) => inputs.push(next),
          onChange: (next: string) => changes.push(next),
        }),
      24,
      5,
    );

    try {
      const container = mounted.container()!;
      container.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }),
      );
      await nextTick();
      container.dispatchEvent(
        new KeyboardEvent("keydown", { key: "a", code: "KeyA", bubbles: true }),
      );
      await nextTick();
      container.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }),
      );
      await nextTick();

      expect(value.value).toBe("a");
      expect(inputs).toEqual(["a"]);
      expect(changes).toEqual(["a"]);
    } finally {
      mounted.unmount();
    }
  });

  it("selects a focused autocomplete suggestion with Enter", async () => {
    const value = ref("ap");
    const changes: string[] = [];
    const inputs: string[] = [];
    const onSelect = vi.fn();
    const mounted = await mountTerminal(
      () =>
        h(TAutocompleteInput, {
          x: 0,
          y: 0,
          w: 20,
          h: 3,
          modelValue: value.value,
          "onUpdate:modelValue": (next: string) => (value.value = next),
          suggestions: ["apple", "apricot"],
          onChange: (next: string) => changes.push(next),
          onInput: (next: string) => inputs.push(next),
          onSelect,
        }),
      24,
      5,
    );

    try {
      const container = mounted.container()!;
      container.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 1, clientY: 2, bubbles: true }),
      );
      container.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          bubbles: true,
          cancelable: true,
        }),
      );
      await nextTick();

      expect(value.value).toBe("apricot");
      expect(changes).toEqual(["apricot"]);
      expect(inputs).toEqual([]);
      expect(onSelect).toHaveBeenCalledWith({ value: "apricot", index: 1 });
    } finally {
      mounted.unmount();
    }
  });

  it("sizes form field slot from visible label and message rows", async () => {
    const mounted = await mountTerminal(
      () => [
        h(TFormField, { x: 0, y: 0, w: 18, h: 3, label: "Name" }, () => [
          h(TText, { x: 0, y: 0, w: 18, value: "First" }),
          h(TText, { x: 0, y: 1, w: 18, value: "Second" }),
        ]),
        h(TFormField, { x: 22, y: 0, w: 18, h: 2, label: "Token", help: "Help" }, () =>
          h(TText, { x: 0, y: 0, w: 18, value: "Value" }),
        ),
      ],
      48,
      5,
    );

    try {
      const lines = mounted.terminal.snapshot().lines;
      expect(lines[0]).toContain("Name");
      expect(lines[0]).toContain("Token");
      expect(lines[1]).toContain("First");
      expect(lines[1]).toContain("Value");
      expect(lines[2]).toContain("Second");
      expect(lines.join("\n")).not.toContain("Help");
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
      expect(mounted.terminal.getCell(32, 8).style.inverse).toBe(true);
      expect(mounted.terminal.getCell(35, 8).style.inverse).not.toBe(true);
      expect(mounted.terminal.getCell(36, 8).style.inverse).not.toBe(true);
    } finally {
      mounted.unmount();
    }
  });

  it("uses terminal cell width for breadcrumb hit areas", async () => {
    const onSelect = vi.fn();
    const mounted = await mountTerminal(
      () =>
        h(TBreadcrumb, {
          x: 0,
          y: 0,
          w: 12,
          items: [
            { id: "home", label: "首页" },
            { id: "src", label: "源码" },
          ],
          onSelect,
        }),
      16,
      2,
    );

    try {
      expect(mounted.terminal.getCell(0, 0).ch).toBe("首");
      expect(mounted.terminal.getCell(2, 0).ch).toBe("页");
      expect(mounted.terminal.getCell(5, 0).ch).toBe("/");
      expect(mounted.terminal.getCell(7, 0).ch).toBe("源");
      expect(mounted.terminal.getCell(9, 0).ch).toBe("码");
      mounted
        .container()!
        .dispatchEvent(new MouseEvent("click", { clientX: 6, clientY: 0, bubbles: true }));
      await nextTick();

      expect(onSelect).toHaveBeenCalledWith({
        item: { id: "home", label: "首页" },
        index: 0,
      });
    } finally {
      mounted.unmount();
    }
  });

  it("selects a focused breadcrumb item with Enter", async () => {
    const onSelect = vi.fn();
    const items = [
      { id: "home", label: "home" },
      { id: "src", label: "src" },
    ];
    const mounted = await mountTerminal(
      () =>
        h(TBreadcrumb, {
          x: 0,
          y: 0,
          w: 16,
          items,
          onSelect,
        }),
      20,
      2,
    );

    try {
      const container = mounted.container()!;
      container.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 8, clientY: 0, bubbles: true }),
      );
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

  it("keeps context menu keyboard selection internally when selectedIndex is uncontrolled", async () => {
    const open = ref(true);
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
          onSelect,
        }),
      24,
      5,
    );

    try {
      const container = mounted.container()!;
      container.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowDown",
          code: "ArrowDown",
          bubbles: true,
          cancelable: true,
        }),
      );
      await nextTick();

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

  it("skips disabled context menu items for default selection and keyboard navigation", async () => {
    const open = ref(true);
    const selectedIndex = ref(0);
    const items = [
      { id: "disabled-open", label: "Open Link", disabled: true },
      { id: "copy", label: "Copy Link" },
      { id: "disabled-save", label: "Save Link", disabled: true },
      { id: "inspect", label: "Inspect Link" },
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
      7,
    );

    try {
      expect(mounted.terminal.getCell(1, 1).style.inverse).not.toBe(true);
      expect(mounted.terminal.getCell(1, 2).style.inverse).toBe(true);

      const container = mounted.container()!;
      container.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowDown",
          code: "ArrowDown",
          bubbles: true,
          cancelable: true,
        }),
      );
      await nextTick();

      expect(selectedIndex.value).toBe(3);

      container.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          bubbles: true,
          cancelable: true,
        }),
      );
      await nextTick();

      expect(onSelect).toHaveBeenCalledWith({ item: items[3], index: 3 });
      expect(open.value).toBe(false);
    } finally {
      mounted.unmount();
    }
  });

  it("closes an all-disabled context menu on Escape", async () => {
    const open = ref(true);
    const onClose = vi.fn();
    const mounted = await mountTerminal(
      () =>
        h(TContextMenu, {
          modelValue: open.value,
          "onUpdate:modelValue": (value: boolean) => (open.value = value),
          x: 0,
          y: 0,
          w: 18,
          items: [
            { id: "open", label: "Open Link", disabled: true },
            { id: "copy", label: "Copy Link", disabled: true },
          ],
          onClose,
        }),
      24,
      5,
    );

    try {
      mounted.container()!.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          code: "Escape",
          bubbles: true,
          cancelable: true,
        }),
      );
      await nextTick();

      expect(open.value).toBe(false);
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      mounted.unmount();
    }
  });

  it("renders the clamped context menu selection as active", async () => {
    const items = [
      { id: "open", label: "Open Link" },
      { id: "copy", label: "Copy Link" },
    ];
    const onSelect = vi.fn();
    const mounted = await mountTerminal(
      () =>
        h(TContextMenu, {
          modelValue: true,
          x: 0,
          y: 0,
          w: 18,
          items,
          selectedIndex: 99,
          onSelect,
        }),
      24,
      5,
    );

    try {
      expect(mounted.terminal.getCell(1, 1).style.inverse).not.toBe(true);
      expect(mounted.terminal.getCell(1, 2).style.inverse).toBe(true);

      const container = mounted.container()!;
      container.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 1, clientY: 2, bubbles: true }),
      );
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
    } finally {
      mounted.unmount();
    }
  });

  it("keeps command palette keyboard selection visible while scrolling", async () => {
    const selectedIndex = ref(0);
    const items = Array.from({ length: 6 }, (_, index) => ({ label: `Command ${index}` }));
    const onSelect = vi.fn();
    const PaletteHost = defineComponent({
      name: "CommandPaletteScrollHost",
      setup() {
        return () =>
          h(TCommandPalette, {
            modelValue: true,
            w: 32,
            h: 10,
            items,
            selectedIndex: selectedIndex.value,
            "onUpdate:selectedIndex": (index: number) => (selectedIndex.value = index),
            onSelect,
          });
      },
    });
    const mounted = await mountTerminal(() => h(PaletteHost), 50, 14);

    try {
      const container = mounted.container()!;
      for (let i = 0; i < 3; i++) {
        container.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "ArrowDown",
            code: "ArrowDown",
            bubbles: true,
            cancelable: true,
          }),
        );
        await nextTick();
      }
      await Promise.resolve();
      await nextTick();
      mounted.scheduler()!.flushNow();

      expect(selectedIndex.value).toBe(3);
      expect(mounted.terminal.snapshot().lines.join("\n")).toContain("› Command 3");

      container.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          bubbles: true,
          cancelable: true,
        }),
      );
      await nextTick();

      expect(onSelect).toHaveBeenCalledWith(items[3]);
    } finally {
      mounted.unmount();
    }
  });

  it("keeps command palette keyboard selection internally when selectedIndex is uncontrolled", async () => {
    const items = [{ label: "Open" }, { label: "Copy" }];
    const onSelect = vi.fn();
    const mounted = await mountTerminal(
      () =>
        h(TCommandPalette, {
          modelValue: true,
          w: 32,
          h: 10,
          items,
          onSelect,
        }),
      50,
      14,
    );

    try {
      const container = mounted.container()!;
      container.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowDown",
          code: "ArrowDown",
          bubbles: true,
          cancelable: true,
        }),
      );
      await nextTick();

      container.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          bubbles: true,
          cancelable: true,
        }),
      );
      await nextTick();

      expect(onSelect).toHaveBeenCalledWith(items[1]);
    } finally {
      mounted.unmount();
    }
  });

  it("renders command palette match and detail accent styles", async () => {
    const items = [
      {
        label: "Open File",
        detail: "src/app.ts",
        accentStyle: { fg: "cyan" },
        highlightAccentStyle: { fg: "yellowBright" },
        detailAccentRanges: [{ start: 0, end: 3 }],
        detailAccentSegments: [
          { start: 4, end: 10, style: { fg: "blue" }, highlightStyle: { fg: "magenta" } },
        ],
      },
    ];
    const App = defineComponent({
      name: "CommandPaletteStylesHost",
      setup() {
        return () =>
          h(TCommandPalette, {
            modelValue: true,
            w: 36,
            h: 10,
            initialQuery: "open",
            items,
            selectedIndex: 0,
            showRowDetails: true,
            listStyle: { fg: "white" },
            highlightStyle: { bg: "blue" },
            matchStyle: { fg: "green" },
            highlightMatchStyle: { fg: "red" },
            detailStyle: { dim: true },
          });
      },
    });

    const app = createTerminalApp({ cols: 50, rows: 14, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      expect(app.terminal.snapshot().lines.join("\n")).toContain("› Open File  src/app.ts");
      expect(app.terminal.getCell(11, 6).style.fg).toBe("red");
      expect(app.terminal.getCell(22, 6).style.fg).toBe("yellowBright");
      expect(app.terminal.getCell(26, 6).style.fg).toBe("magenta");
      expect(app.terminal.getCell(25, 6).style.dim).toBe(true);
    } finally {
      app.dispose();
    }
  });

  it("selects command palette items with mouse", async () => {
    const selectedIndex = ref(0);
    const items = [{ label: "Open" }, { label: "Copy" }];
    const onSelect = vi.fn();
    const App = defineComponent({
      name: "CommandPaletteMouseHost",
      setup() {
        return () =>
          h(TCommandPalette, {
            modelValue: true,
            w: 32,
            h: 10,
            items,
            selectedIndex: selectedIndex.value,
            "onUpdate:selectedIndex": (index: number) => (selectedIndex.value = index),
            onSelect,
          });
      },
    });

    const app = createTerminalApp({ cols: 50, rows: 14, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "click", cellX: 11, cellY: 7, time: Date.now() } as any);
      await nextTick();

      expect(selectedIndex.value).toBe(1);
      expect(onSelect).toHaveBeenCalledWith(items[1]);
    } finally {
      app.dispose();
    }
  });

  it("skips disabled command palette items for keyboard navigation", async () => {
    const selectedIndex = ref(0);
    const items = [
      { label: "Open", disabled: true },
      { label: "Copy" },
      { label: "Save", disabled: true },
      { label: "Inspect" },
    ];
    const onSelect = vi.fn();
    const PaletteHost = defineComponent({
      name: "CommandPaletteDisabledHost",
      setup() {
        return () =>
          h(TCommandPalette, {
            modelValue: true,
            w: 32,
            h: 10,
            items,
            selectedIndex: selectedIndex.value,
            "onUpdate:selectedIndex": (index: number) => (selectedIndex.value = index),
            onSelect,
          });
      },
    });
    const mounted = await mountTerminal(() => h(PaletteHost), 50, 14);

    try {
      mounted.scheduler()!.flushNow();
      expect(mounted.terminal.snapshot().lines.join("\n")).toContain("› Copy");

      mounted.container()!.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowDown",
          code: "ArrowDown",
          bubbles: true,
          cancelable: true,
        }),
      );
      await nextTick();
      await Promise.resolve();
      mounted.scheduler()!.flushNow();

      expect(selectedIndex.value).toBe(3);
      expect(mounted.terminal.snapshot().lines.join("\n")).toContain("› Inspect");

      mounted.container()!.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          bubbles: true,
          cancelable: true,
        }),
      );
      await nextTick();

      expect(onSelect).toHaveBeenCalledWith(items[3]);
    } finally {
      mounted.unmount();
    }
  });

  it("keeps command palette open after selection so hosts can close it explicitly", async () => {
    const open = ref(true);
    const items = [{ label: "Open" }, { label: "Copy" }];
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const App = defineComponent({
      name: "CommandPaletteHostControlledCloseApp",
      setup() {
        return () =>
          h(TCommandPalette, {
            modelValue: open.value,
            w: 32,
            h: 10,
            items,
            "onUpdate:modelValue": (value: boolean) => (open.value = value),
            onSelect,
            onClose,
          });
      },
    });

    const app = createTerminalApp({ cols: 50, rows: 14, component: App });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      app.events.dispatch({
        type: "keydown",
        key: "Enter",
        code: "Enter",
        time: Date.now(),
      } as any);
      await nextTick();
      app.scheduler.flushNow();

      expect(onSelect).toHaveBeenCalledWith(items[0]);
      expect(open.value).toBe(true);
      expect(onClose).not.toHaveBeenCalled();
      expect(app.terminal.snapshot().lines.join("\n")).toContain("Open");
    } finally {
      app.dispose();
    }
  });

  it("uses original row indexes for default data table selection keys", async () => {
    const rows = [
      { name: "Alpha", rank: 1 },
      { name: "Beta", rank: 2 },
    ];
    const columns = [
      { key: "name", label: "Name", width: 6 },
      { key: "rank", label: "Rank", width: 4 },
    ];
    const mounted = await mountTerminal(
      () =>
        h(TDataTable, {
          x: 0,
          y: 0,
          w: 12,
          h: 4,
          columns,
          rows,
          sortable: true,
          sortBy: "rank",
          sortDirection: "desc",
          selectedRowKey: 0,
        }),
      16,
      5,
    );

    try {
      const lines = mounted.terminal.snapshot().lines;
      expect(lines[2]).toContain("Beta");
      expect(lines[3]).toContain("Alpha");
      expect(mounted.terminal.getCell(0, 2).style.inverse).not.toBe(true);
      expect(mounted.terminal.getCell(0, 3).style.inverse).toBe(true);
    } finally {
      mounted.unmount();
    }
  });

  it("keeps data table sort marker visible in narrow headers", async () => {
    const columns = [
      { key: "id", label: "ID", width: 3 },
      { key: "name", label: "Name", width: 5 },
    ];
    const rows = [{ id: 1, name: "Alpha" }];
    const mounted = await mountTerminal(
      () =>
        h(TDataTable, {
          x: 0,
          y: 0,
          w: 10,
          h: 3,
          columns,
          rows,
          sortable: true,
          sortBy: "id",
          sortDirection: "asc",
        }),
      12,
      4,
    );

    try {
      expect(mounted.terminal.snapshot().lines[0]).toContain("ID^");
    } finally {
      mounted.unmount();
    }
  });

  it("passes original row indexes to data table rowKey functions", async () => {
    const rows = [
      { name: "Alpha", rank: 1 },
      { name: "Beta", rank: 2 },
    ];
    const columns = [
      { key: "name", label: "Name", width: 6 },
      { key: "rank", label: "Rank", width: 4 },
    ];
    const mounted = await mountTerminal(
      () =>
        h(TDataTable, {
          x: 0,
          y: 0,
          w: 12,
          h: 4,
          columns,
          rows,
          rowKey: (_row: unknown, index: number) => index,
          sortable: true,
          sortBy: "rank",
          sortDirection: "desc",
          selectedRowKey: 0,
        }),
      16,
      5,
    );

    try {
      const lines = mounted.terminal.snapshot().lines;
      expect(lines[2]).toContain("Beta");
      expect(lines[3]).toContain("Alpha");
      expect(mounted.terminal.getCell(0, 2).style.inverse).not.toBe(true);
      expect(mounted.terminal.getCell(0, 3).style.inverse).toBe(true);
    } finally {
      mounted.unmount();
    }
  });

  it("includes visible and original indexes in data table row select payloads", async () => {
    const rows = [
      { name: "Alpha", rank: 1 },
      { name: "Beta", rank: 2 },
    ];
    const columns = [
      { key: "name", label: "Name", width: 6 },
      { key: "rank", label: "Rank", width: 4 },
    ];
    const onRowSelect = vi.fn();
    const mounted = await mountTerminal(
      () =>
        h(TDataTable, {
          x: 0,
          y: 0,
          w: 12,
          h: 4,
          columns,
          rows,
          rowKey: (_row: unknown, index: number) => index,
          selectable: true,
          sortable: true,
          sortBy: "rank",
          sortDirection: "desc",
          onRowSelect,
        }),
      16,
      5,
    );

    try {
      mounted
        .container()!
        .dispatchEvent(new MouseEvent("click", { clientX: 0, clientY: 2, bubbles: true }));
      await nextTick();

      expect(onRowSelect).toHaveBeenCalledWith({
        row: rows[1],
        index: 0,
        originalIndex: 1,
        key: 1,
      });
    } finally {
      mounted.unmount();
    }
  });

  it("does not select data table rows when selectable is false", async () => {
    const rows = [{ id: "1", name: "Alpha" }];
    const columns = [{ key: "name", label: "Name", width: 6 }];
    const onRowSelect = vi.fn();
    const onUpdateSelectedRowKey = vi.fn();
    const mounted = await mountTerminal(
      () =>
        h(TDataTable, {
          x: 0,
          y: 0,
          w: 8,
          h: 3,
          columns,
          rows,
          rowKey: "id",
          onRowSelect,
          "onUpdate:selectedRowKey": onUpdateSelectedRowKey,
        }),
      12,
      4,
    );

    try {
      mounted
        .container()!
        .dispatchEvent(new MouseEvent("click", { clientX: 0, clientY: 2, bubbles: true }));
      await nextTick();

      expect(onRowSelect).not.toHaveBeenCalled();
      expect(onUpdateSelectedRowKey).not.toHaveBeenCalled();
    } finally {
      mounted.unmount();
    }
  });

  it("passes data table borderStyle to the table border", async () => {
    const rows = [{ id: "1", name: "Alpha" }];
    const columns = [{ key: "name", label: "Name", width: 6 }];
    const mounted = await mountTerminal(
      () =>
        h(TDataTable, {
          x: 0,
          y: 0,
          w: 8,
          h: 3,
          columns,
          rows,
          border: true,
          borderStyle: { fg: "redBright" },
        }),
      12,
      4,
    );

    try {
      expect(mounted.terminal.getCell(0, 1).style.fg).toBe("redBright");
    } finally {
      mounted.unmount();
    }
  });

  it("filters data table rows by formatted values", async () => {
    const rows = [
      { name: "Alpha", status: "ok" },
      { name: "Beta", status: "fail" },
    ];
    const columns = [
      { key: "name", label: "Name", width: 6 },
      {
        key: "status",
        label: "Status",
        width: 8,
        format: (value: unknown) => (value === "ok" ? "Ready" : "Blocked"),
      },
    ];
    const mounted = await mountTerminal(
      () =>
        h(TDataTable, {
          x: 0,
          y: 0,
          w: 16,
          h: 4,
          columns,
          rows,
          filterable: true,
          filter: "ready",
        }),
      20,
      5,
    );

    try {
      const lines = mounted.terminal.snapshot().lines;
      expect(lines[2]).toContain("Alpha");
      expect(lines.join("\n")).not.toContain("Beta");
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
      colors: { link: "redBright" },
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

    expect(theme.colors.link).toBe("redBright");
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

  it("uses color tokens for link component defaults", () => {
    const theme = createTheme({
      colors: { link: "blueBright", linkVisited: "yellowBright" },
    });

    expect(theme.components.TLink?.style).toMatchObject({
      fg: "blueBright",
      underline: true,
    });
    expect(theme.components.TLink?.visitedStyle).toMatchObject({
      fg: "yellowBright",
      underline: true,
    });
  });
});
