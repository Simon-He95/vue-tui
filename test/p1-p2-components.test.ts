import { describe, expect, it, vi } from "vitest";
import {
  createTheme,
  TAutocompleteInput,
  TBadge,
  TCheckbox,
  TCode,
  TCommandPalette,
  TDataTable,
  TDialog,
  TDivider,
  TFormField,
  TInput,
  TPasswordInput,
  TRadioGroup,
  TSelect,
  TSlider,
  TSwitch,
  TTable,
  TTag,
  TText,
  TTree,
  TView,
} from "../src/index.js";
import {
  TBreadcrumb,
  TContextMenu,
  TForm,
  TKeyHint,
  TPopover,
  TProgress,
  TSpinner,
  TSplitPane,
  TStatusBar,
  TTabs,
  TToastViewport,
  TTooltip,
} from "../src/vue.js";
import {
  createTerminalApp,
  defineComponent,
  h,
  mountTerminal,
  nextTick,
  ref,
  waitFor,
} from "./ui-regressions-support.js";

describe("P1/P2 public components", () => {
  it("lets TForm consume Enter without also confirming the parent dialog", async () => {
    const open = ref(true);
    const value = ref("");
    const onSubmit = vi.fn();
    const onConfirm = vi.fn();

    const mounted = await mountTerminal(
      () =>
        h(
          TDialog,
          {
            modelValue: open.value,
            "onUpdate:modelValue": (next: boolean) => (open.value = next),
            w: 44,
            h: 8,
            buttons: [{ label: "OK", default: true }],
            onConfirm,
          },
          () =>
            h(
              TForm,
              {
                x: 0,
                y: 0,
                w: 40,
                h: 4,
                model: { value: value.value },
                submitOnEnter: true,
                onSubmit,
              },
              () =>
                h(TInput, {
                  x: 0,
                  y: 0,
                  w: 20,
                  modelValue: value.value,
                  autoFocus: true,
                  "onUpdate:modelValue": (next: string) => (value.value = next),
                }),
            ),
        ),
      60,
      12,
    );

    try {
      await nextTick();
      mounted.scheduler()!.flushNow();

      mounted.container()!.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          bubbles: true,
          cancelable: true,
        }),
      );
      await nextTick();

      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onConfirm).not.toHaveBeenCalled();
      expect(open.value).toBe(true);
    } finally {
      mounted.unmount();
    }
  });

  it("does not confirm the parent dialog when single TSelect handles Enter", async () => {
    const open = ref(true);
    const selected = ref<unknown>("alpha");
    const changes: string[] = [];
    const onConfirm = vi.fn();

    const mounted = await mountTerminal(
      () =>
        h(
          TDialog,
          {
            modelValue: open.value,
            "onUpdate:modelValue": (value: boolean) => (open.value = value),
            w: 28,
            h: 6,
            buttons: [{ label: "OK", default: true }],
            onConfirm,
          },
          () =>
            h(TSelect, {
              x: 0,
              y: 0,
              w: 16,
              h: 2,
              options: [
                { label: "Alpha", value: "alpha" },
                { label: "Beta", value: "beta" },
              ],
              valueMode: "value",
              modelValue: selected.value,
              "onUpdate:modelValue": (value: unknown) => (selected.value = value),
              onChange: (value: string) => changes.push(value),
            }),
        ),
      40,
      10,
    );

    try {
      await nextTick();
      mounted.scheduler()?.flushNow();

      const selectNode = mounted
        .events()!
        .debugNodes()
        .find((node) => node.visible && node.focusable && node.rect.w === 16 && node.rect.h === 2);

      expect(selectNode).toBeTruthy();
      mounted.events()!.focus(selectNode!.id);

      mounted.container()!.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          bubbles: true,
          cancelable: true,
        }),
      );
      await nextTick();

      expect(changes).toEqual(["Alpha"]);
      expect(onConfirm).not.toHaveBeenCalled();
      expect(open.value).toBe(true);
    } finally {
      mounted.unmount();
    }
  });

  it("drops stale multiple TSelect model indices instead of remapping them", async () => {
    const onConfirm = vi.fn();

    const mounted = await mountTerminal(
      () =>
        h(TSelect, {
          x: 0,
          y: 0,
          w: 12,
          h: 2,
          multiple: true,
          multipleEmit: "index",
          options: [{ label: "Alpha" }],
          modelValue: [99],
          onConfirm,
        }),
      20,
      5,
    );

    try {
      await nextTick();
      mounted.scheduler()?.flushNow();

      const selectNode = mounted
        .events()!
        .debugNodes()
        .find((node) => node.visible && node.focusable && node.rect.x === 0 && node.rect.y === 0);

      expect(selectNode).toBeTruthy();
      mounted.events()!.focus(selectNode!.id);

      mounted.container()!.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          bubbles: true,
          cancelable: true,
        }),
      );

      await nextTick();

      expect(onConfirm).toHaveBeenCalledWith([]);
    } finally {
      mounted.unmount();
    }
  });

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

  it("keeps TTable minWidth when explicit widths overflow but minima still fit", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TTable, {
          x: 0,
          y: 0,
          w: 10,
          h: 3,
          border: false,
          columns: [
            { key: "a", label: "AAAAA", width: 100, minWidth: 5 },
            { key: "b", label: "BBBB", width: 10, minWidth: 4 },
          ],
          rows: [{ a: "aaaaa", b: "bbbb" }],
        }),
      16,
      4,
    );

    try {
      await nextTick();
      mounted.scheduler()!.flushNow();
      const lines = mounted.terminal.snapshot().lines;

      expect(lines[0]).toContain("AAAAA BBBB");
      expect(lines[2]).toContain("aaaaa bbbb");
    } finally {
      mounted.unmount();
    }
  });

  it("keeps TDataTable rowSelect indices correct with scrollTop", async () => {
    const onRowSelect = vi.fn();
    const mounted = await mountTerminal(
      () =>
        h(TDataTable, {
          x: 0,
          y: 0,
          w: 18,
          h: 4,
          columns: [{ key: "name", label: "Name", width: 8 }],
          rows: [{ name: "Alpha" }, { name: "Beta" }, { name: "Gamma" }],
          selectable: true,
          scrollTop: 1,
          onRowSelect,
        }),
      24,
      6,
    );

    try {
      mounted
        .container()!
        .dispatchEvent(new MouseEvent("click", { clientX: 0, clientY: 2, bubbles: true }));
      await nextTick();

      expect(onRowSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          row: { name: "Beta" },
          index: 0,
          dataIndex: 1,
          originalIndex: 1,
          key: 1,
        }),
      );
    } finally {
      mounted.unmount();
    }
  });

  it("emits clamped TDataTable scrollTop when rows shrink below the viewport", async () => {
    const scrollTop = ref(99);

    const mounted = await mountTerminal(
      () =>
        h(TDataTable, {
          x: 0,
          y: 0,
          w: 18,
          h: 4,
          columns: [{ key: "name", label: "Name", width: 8 }],
          rows: [{ name: "Alpha" }],
          scrollTop: scrollTop.value,
          "onUpdate:scrollTop": (next: number) => {
            scrollTop.value = next;
          },
        }),
      24,
      6,
    );

    try {
      await nextTick();
      mounted.scheduler()?.flushNow();

      expect(scrollTop.value).toBe(0);
      expect(mounted.terminal.snapshot().lines.join("\n")).toContain("Alpha");
    } finally {
      mounted.unmount();
    }
  });

  it("commits the keyboard-active data table row after in-viewport arrow navigation", async () => {
    const rows = [
      { id: "a", name: "Alpha" },
      { id: "b", name: "Beta" },
    ];
    const selectedRowKey = ref<unknown>(undefined);
    const onRowSelect = vi.fn();

    const mounted = await mountTerminal(
      () =>
        h(TDataTable, {
          x: 0,
          y: 0,
          w: 12,
          h: 4,
          columns: [{ key: "name", label: "Name", width: 8 }],
          rows,
          rowKey: "id",
          selectable: true,
          selectedRowKey: selectedRowKey.value,
          "onUpdate:selectedRowKey": (key: unknown) => (selectedRowKey.value = key),
          onRowSelect,
        }),
      16,
      5,
    );

    try {
      const container = mounted.container()!;

      container.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 0, clientY: 2, bubbles: true }),
      );

      container.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowDown",
          code: "ArrowDown",
          bubbles: true,
          cancelable: true,
        }),
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

      expect(selectedRowKey.value).toBe("b");
      expect(onRowSelect).toHaveBeenCalledWith({
        row: rows[1],
        index: 1,
        dataIndex: 1,
        originalIndex: 1,
        key: "b",
      });
    } finally {
      mounted.unmount();
    }
  });

  it("keeps TDataTable keyboard scrolling usable when scrollTop is uncontrolled", async () => {
    const rows = [
      { id: "a", name: "Alpha" },
      { id: "b", name: "Beta" },
      { id: "c", name: "Gamma" },
    ];
    const selectedRowKey = ref<unknown>(undefined);
    const onRowSelect = vi.fn();

    const mounted = await mountTerminal(
      () =>
        h(TDataTable, {
          x: 0,
          y: 0,
          w: 12,
          h: 4,
          columns: [{ key: "name", label: "Name", width: 8 }],
          rows,
          rowKey: "id",
          selectable: true,
          selectedRowKey: selectedRowKey.value,
          "onUpdate:selectedRowKey": (key: unknown) => (selectedRowKey.value = key),
          onRowSelect,
        }),
      16,
      5,
    );

    try {
      const container = mounted.container()!;

      container.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 0, clientY: 2, bubbles: true }),
      );

      container.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowDown",
          code: "ArrowDown",
          bubbles: true,
          cancelable: true,
        }),
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
      mounted.scheduler()?.flushNow();

      const snapshot = mounted.terminal.snapshot().lines.join("\n");
      expect(snapshot).toContain("Beta");
      expect(snapshot).toContain("Gamma");

      container.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: " ",
          code: "Space",
          bubbles: true,
          cancelable: true,
        }),
      );

      await nextTick();

      expect(selectedRowKey.value).toBe("c");
      expect(onRowSelect).toHaveBeenCalledWith({
        row: rows[2],
        index: 1,
        dataIndex: 2,
        originalIndex: 2,
        key: "c",
      });
    } finally {
      mounted.unmount();
    }
  });

  it("passes original row indices to TDataTable column format after scrollTop", async () => {
    const format = vi.fn((value: unknown, _row: unknown, index: number) => `${index}:${value}`);
    const mounted = await mountTerminal(
      () =>
        h(TDataTable, {
          x: 0,
          y: 0,
          w: 18,
          h: 4,
          columns: [{ key: "name", label: "Name", width: 12, format }],
          rows: [{ name: "Alpha" }, { name: "Beta" }, { name: "Gamma" }],
          scrollTop: 1,
        }),
      24,
      6,
    );

    try {
      await nextTick();
      mounted.scheduler()!.flushNow();

      const snapshot = mounted.terminal.snapshot().lines.join("\n");
      expect(snapshot).toContain("1:Beta");
      expect(snapshot).toContain("2:Gamma");
      expect(format).toHaveBeenCalledWith("Beta", { name: "Beta" }, 1);
    } finally {
      mounted.unmount();
    }
  });

  it("does not mutate multiple data table selection during arrow navigation", async () => {
    const rows = [
      { id: "a", name: "Alpha" },
      { id: "b", name: "Beta" },
      { id: "c", name: "Gamma" },
    ];
    const selectedRowKeys = ref<unknown[]>([]);
    const scrollTop = ref(0);
    const mounted = await mountTerminal(
      () =>
        h(TDataTable, {
          x: 0,
          y: 0,
          w: 12,
          h: 4,
          columns: [{ key: "name", label: "Name", width: 8 }],
          rows,
          rowKey: "id",
          selectable: true,
          selectionMode: "multiple",
          selectedRowKeys: selectedRowKeys.value,
          scrollTop: scrollTop.value,
          "onUpdate:selectedRowKeys": (keys: unknown[]) => (selectedRowKeys.value = keys),
          "onUpdate:scrollTop": (next: number) => (scrollTop.value = next),
        }),
      16,
      5,
    );

    try {
      const container = mounted.container()!;
      container.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 0, clientY: 2, bubbles: true }),
      );
      container.dispatchEvent(new MouseEvent("click", { clientX: 0, clientY: 2, bubbles: true }));
      await nextTick();

      expect(selectedRowKeys.value).toEqual(["a"]);

      container.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowDown",
          code: "ArrowDown",
          bubbles: true,
          cancelable: true,
        }),
      );
      await nextTick();

      expect(selectedRowKeys.value).toEqual(["a"]);
      expect(scrollTop.value).toBe(0);

      container.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowDown",
          code: "ArrowDown",
          bubbles: true,
          cancelable: true,
        }),
      );
      await nextTick();

      expect(selectedRowKeys.value).toEqual(["a"]);
      expect(scrollTop.value).toBe(1);

      container.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: " ",
          code: "Space",
          bubbles: true,
          cancelable: true,
        }),
      );
      await nextTick();

      expect(selectedRowKeys.value).toEqual(["a", "c"]);
    } finally {
      mounted.unmount();
    }
  });

  it("uses activeStyle for keyboard-active data table rows without selectedStyle", async () => {
    const rows = [
      { id: "a", name: "Alpha" },
      { id: "b", name: "Beta" },
    ];
    const selectedRowKeys = ref<unknown[]>(["a"]);
    const mounted = await mountTerminal(
      () =>
        h(TDataTable, {
          x: 0,
          y: 0,
          w: 12,
          h: 4,
          columns: [{ key: "name", label: "Name", width: 8 }],
          rows,
          rowKey: "id",
          selectable: true,
          selectionMode: "multiple",
          selectedRowKeys: selectedRowKeys.value,
          activeStyle: { underline: true },
        }),
      16,
      5,
    );

    try {
      mounted
        .container()!
        .dispatchEvent(new MouseEvent("mousedown", { clientX: 0, clientY: 2, bubbles: true }));
      mounted
        .container()!
        .dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
      await nextTick();
      mounted.scheduler()?.flushNow();

      expect(mounted.terminal.getCell(0, 2).style.inverse).toBe(true);
      expect(mounted.terminal.getCell(0, 3).style.underline).toBe(true);
      expect(mounted.terminal.getCell(0, 3).style.inverse).not.toBe(true);
    } finally {
      mounted.unmount();
    }
  });

  it("redistributes TTable auto width after maxWidth clamps a column", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TTable, {
          x: 0,
          y: 0,
          w: 10,
          h: 3,
          columns: [
            { key: "a", label: "A", maxWidth: 3 },
            { key: "b", label: "B" },
          ],
          rows: [{ a: "abcdef", b: "123456789" }],
        }),
      12,
      4,
    );

    try {
      expect(mounted.terminal.snapshot().lines[2]?.slice(0, 10)).toBe("abc 123456");
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
        dataIndex: 0,
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

  it("clamps overflowing explicit table columns to the table width", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TTable, {
          x: 0,
          y: 0,
          w: 12,
          h: 3,
          columns: [
            { key: "a", label: "Alpha", width: 8 },
            { key: "b", label: "Beta", width: 8 },
            { key: "c", label: "Gamma", width: 8 },
          ],
          rows: [],
          headerFocusable: true,
        }),
      16,
      4,
    );

    try {
      const headerRects = mounted
        .events()!
        .debugNodes()
        .filter((node) => node.visible && node.focusable && node.rect.y === 0 && node.rect.w > 0)
        .map((node) => node.rect)
        .sort((a, b) => a.x - b.x);

      expect(headerRects).toEqual([
        { x: 0, y: 0, w: 4, h: 1 },
        { x: 5, y: 0, w: 3, h: 1 },
        { x: 9, y: 0, w: 3, h: 1 },
      ]);
      expect(Math.max(...headerRects.map((rect) => rect.x + rect.w))).toBe(12);
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

  it("renders feedback primitives, tabs, split panes, and toast viewport", async () => {
    const activeKey = ref("logs");
    const sizes = ref([10, 10]);
    const mounted = await mountTerminal(
      () => [
        h(TBadge, { x: 0, y: 0, value: "12", tone: "warning" }),
        h(TTag, { x: 6, y: 0, label: "beta", tone: "info" }),
        h(TDivider, { x: 0, y: 1, w: 18, title: "Logs" }),
        h(TCode, { x: 0, y: 2, w: 18, value: "pnpm test" }),
        h(TProgress, { x: 0, y: 3, w: 24, value: 5, max: 10, label: "Index" }),
        h(TSpinner, { x: 0, y: 4, w: 18, frameIndex: 1, label: "Thinking" }),
        h(TToastViewport, {
          offsetY: 6,
          w: 24,
          max: 1,
          items: [{ id: "saved", level: "success", title: "Saved", message: "Profile updated" }],
        }),
        h(TTabs, {
          x: 28,
          y: 0,
          w: 28,
          activeKey: activeKey.value,
          "onUpdate:activeKey": (key: string) => (activeKey.value = key),
          items: [
            { key: "chat", label: "Chat" },
            { key: "logs", label: "Logs", badge: "2" },
          ],
        }),
        h(
          TSplitPane as any,
          {
            x: 28,
            y: 2,
            w: 24,
            h: 3,
            sizes: sizes.value,
            "onUpdate:sizes": (next: number[]) => (sizes.value = next),
          },
          ({ panes }: any) => [
            h(TText, { ...panes[0], value: "Left" }),
            h(TText, { ...panes[1], value: "Right" }),
          ],
        ),
      ],
      70,
      12,
    );

    try {
      const lines = mounted.terminal.snapshot().lines;
      expect(lines[0]).toContain("[12]");
      expect(lines[0]).toContain("<beta>");
      expect(lines[1]).toContain("Logs");
      expect(lines[2]).toContain("pnpm test");
      expect(lines[3]).toContain("Index [");
      expect(lines[4]).toContain("/ Thinking");
      expect(lines[6]).toContain("Saved");
      expect(lines[7]).toContain("Profile updated");
      expect(lines[0]).toContain("Logs 2");
      expect(lines[2]).toContain("Left");
      expect(lines[2]).toContain("Right");

      mounted
        .container()!
        .dispatchEvent(new MouseEvent("click", { clientX: 29, clientY: 0, bubbles: true }));
      await nextTick();
      expect(activeKey.value).toBe("chat");
    } finally {
      mounted.unmount();
    }
  });

  it("uses cell widths for wide feedback labels and tab hit areas", async () => {
    const mounted = await mountTerminal(
      () => [
        h(TProgress, { x: 0, y: 0, w: 10, value: 5, max: 10, label: "中" }),
        h(TTabs, {
          x: 0,
          y: 1,
          w: 12,
          activeKey: "wide",
          items: [
            { key: "wide", label: "中" },
            { key: "ascii", label: "B" },
          ],
        }),
      ],
      16,
      4,
    );

    try {
      expect(mounted.terminal.snapshot().lines[0]).toContain("50%");
      const hitRects = mounted
        .events()!
        .debugNodes()
        .filter((node) => node.visible && node.focusable && node.rect.y === 1)
        .map((node) => node.rect)
        .sort((a, b) => a.x - b.x);
      expect(hitRects).toEqual([
        { x: 0, y: 1, w: 4, h: 1 },
        { x: 4, y: 1, w: 3, h: 1 },
      ]);
    } finally {
      mounted.unmount();
    }
  });

  it("does not emit invalid TSelect values when moving through empty options", async () => {
    for (const valueMode of ["index", "value", "option"] as const) {
      const updates: unknown[] = [];
      const mounted = await mountTerminal(
        () =>
          h(TSelect, {
            x: 0,
            y: 0,
            w: 20,
            h: 3,
            options: [],
            valueMode,
            "onUpdate:modelValue": (value: unknown) => updates.push(value),
          }),
        24,
        5,
      );

      try {
        const container = mounted.container()!;
        container.dispatchEvent(
          new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }),
        );

        for (const key of ["ArrowDown", "ArrowUp"]) {
          expect(() =>
            container.dispatchEvent(
              new KeyboardEvent("keydown", {
                key,
                code: key,
                bubbles: true,
                cancelable: true,
              }),
            ),
          ).not.toThrow();
        }
        await nextTick();

        expect(updates).toEqual([]);
      } finally {
        mounted.unmount();
      }
    }
  });

  it("does not emit TSelect query updates for default typeahead navigation", async () => {
    const queryUpdates: string[] = [];
    const modelUpdates: unknown[] = [];
    const mounted = await mountTerminal(
      () =>
        h(TSelect, {
          x: 0,
          y: 0,
          w: 20,
          h: 3,
          options: ["apple", "banana"],
          autoFocus: true,
          "onUpdate:query": (value: string) => queryUpdates.push(value),
          "onUpdate:modelValue": (value: unknown) => modelUpdates.push(value),
        }),
      24,
      5,
    );

    try {
      await nextTick();
      mounted.container()!.dispatchEvent(new KeyboardEvent("keydown", { key: "b", bubbles: true }));
      await nextTick();

      expect(queryUpdates).toEqual([]);
      expect(modelUpdates).toEqual([1]);
    } finally {
      mounted.unmount();
    }
  });

  it("accepts unknown TSelect model values in value mode", async () => {
    const values = [null, undefined, Symbol("key"), () => "value"];
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      for (const value of values) {
        const updates: unknown[] = [];
        const mounted = await mountTerminal(
          () =>
            h(TSelect, {
              x: 0,
              y: 0,
              w: 20,
              h: 3,
              options: [{ label: "item", value }],
              valueMode: "value",
              modelValue: value,
              autoFocus: true,
              "onUpdate:modelValue": (next: unknown) => updates.push(next),
            }),
          24,
          5,
        );

        try {
          await nextTick();
          mounted
            .container()!
            .dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
          await nextTick();

          expect(updates.at(-1)).toBe(value);
        } finally {
          mounted.unmount();
        }
      }

      expect(warn.mock.calls.some(([message]) => String(message).includes("Invalid prop"))).toBe(
        false,
      );
    } finally {
      warn.mockRestore();
    }
  });

  it("emits TSelect query updates without typeahead movement when disabled", async () => {
    const activeUpdates: number[] = [];
    const modelUpdates: unknown[] = [];
    const queryUpdates: string[] = [];
    const mounted = await mountTerminal(
      () =>
        h(TSelect, {
          x: 0,
          y: 0,
          w: 20,
          h: 3,
          options: ["apple", "banana"],
          autoFocus: true,
          searchable: true,
          typeahead: false,
          "onUpdate:activeIndex": (value: number) => activeUpdates.push(value),
          "onUpdate:modelValue": (value: unknown) => modelUpdates.push(value),
          "onUpdate:query": (value: string) => queryUpdates.push(value),
        }),
      24,
      5,
    );

    try {
      await nextTick();
      mounted.container()!.dispatchEvent(new KeyboardEvent("keydown", { key: "b", bubbles: true }));
      await nextTick();

      expect(queryUpdates).toEqual(["b"]);
      expect(activeUpdates).toEqual([]);
      expect(modelUpdates).toEqual([]);
    } finally {
      mounted.unmount();
    }
  });

  it("moves TSelect active option without committing model while searchable", async () => {
    const activeUpdates: number[] = [];
    const modelUpdates: unknown[] = [];
    const queryUpdates: string[] = [];
    const mounted = await mountTerminal(
      () =>
        h(TSelect, {
          x: 0,
          y: 0,
          w: 20,
          h: 3,
          options: ["apple", "banana"],
          autoFocus: true,
          searchable: true,
          "onUpdate:activeIndex": (value: number) => activeUpdates.push(value),
          "onUpdate:modelValue": (value: unknown) => modelUpdates.push(value),
          "onUpdate:query": (value: string) => queryUpdates.push(value),
        }),
      24,
      5,
    );

    try {
      await nextTick();
      mounted.container()!.dispatchEvent(new KeyboardEvent("keydown", { key: "b", bubbles: true }));
      await nextTick();

      expect(queryUpdates).toEqual(["b"]);
      expect(activeUpdates).toEqual([1]);
      expect(modelUpdates).toEqual([]);
    } finally {
      mounted.unmount();
    }
  });

  it("keeps TSelect searchable query persistent after the typeahead timeout", async () => {
    vi.useFakeTimers();
    const queryUpdates: string[] = [];

    const mounted = await mountTerminal(
      () =>
        h(TSelect, {
          x: 0,
          y: 0,
          w: 20,
          h: 3,
          options: ["banana"],
          autoFocus: true,
          searchable: true,
          "onUpdate:query": (value: string) => queryUpdates.push(value),
        }),
      24,
      5,
    );

    try {
      await nextTick();

      mounted.container()!.dispatchEvent(new KeyboardEvent("keydown", { key: "b", bubbles: true }));
      await nextTick();

      vi.advanceTimersByTime(800);

      mounted.container()!.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
      await nextTick();

      expect(queryUpdates).toEqual(["b", "ba"]);
    } finally {
      mounted.unmount();
      vi.useRealTimers();
    }
  });

  it("clears stale TSelect provider options while loading a new query", async () => {
    const query = ref("old");
    const provider = vi.fn((q: string) => {
      if (q === "old") return Promise.resolve(["old-a", "old-b"]);
      return new Promise<readonly string[]>(() => {});
    });
    const mounted = await mountTerminal(
      () =>
        h(TSelect, {
          x: 0,
          y: 0,
          w: 20,
          h: 3,
          options: [],
          optionProvider: provider,
          query: query.value,
        }),
      24,
      5,
    );

    try {
      await Promise.resolve();
      await nextTick();
      mounted.scheduler()?.flushNow();
      expect(mounted.terminal.snapshot().lines.join("\n")).toContain("old-a");

      query.value = "new";
      await nextTick();
      mounted.scheduler()?.flushNow();
      const loadingFrame = mounted.terminal.snapshot().lines.join("\n");

      expect(loadingFrame).toContain("Loading...");
      expect(loadingFrame).not.toContain("old-a");
      expect(loadingFrame).not.toContain("old-b");
    } finally {
      mounted.unmount();
    }
  });

  it("renders TSelect async provider errors separately from empty state", async () => {
    const onLoadError = vi.fn();
    const mounted = await mountTerminal(
      () =>
        h(TSelect, {
          x: 0,
          y: 0,
          w: 24,
          h: 3,
          options: [],
          optionProvider: async () => {
            throw new Error("network down");
          },
          errorText: "Failed options",
          emptyText: "No options",
          onLoadError,
        }),
      30,
      5,
    );

    try {
      await waitFor(() => {
        mounted.scheduler()?.flushNow();
        const line = mounted.terminal.snapshot().lines[0] ?? "";
        return line.includes("Failed options") ? line : null;
      });

      expect(mounted.terminal.snapshot().lines[0]).not.toContain("No options");
      expect(onLoadError).toHaveBeenCalledWith(
        expect.objectContaining({
          query: "",
          error: expect.any(Error),
        }),
      );
    } finally {
      mounted.unmount();
    }
  });

  it("keeps TSelect loading, error, and empty rows inert on click", async () => {
    const onLoadingClose = vi.fn();
    const loading = await mountTerminal(
      () =>
        h(TSelect, {
          x: 0,
          y: 0,
          w: 24,
          h: 3,
          options: [],
          loading: true,
          onClose: onLoadingClose,
        }),
      30,
      5,
    );

    try {
      loading.scheduler()?.flushNow();
      loading
        .container()!
        .dispatchEvent(new MouseEvent("click", { clientX: 0, clientY: 0, bubbles: true }));
      await nextTick();
      expect(onLoadingClose).not.toHaveBeenCalled();
    } finally {
      loading.unmount();
    }

    const onErrorClose = vi.fn();
    const error = await mountTerminal(
      () =>
        h(TSelect, {
          x: 0,
          y: 0,
          w: 24,
          h: 3,
          options: [],
          optionProvider: async () => {
            throw new Error("network down");
          },
          errorText: "Failed options",
          onClose: onErrorClose,
        }),
      30,
      5,
    );

    try {
      await waitFor(() => {
        error.scheduler()?.flushNow();
        const line = error.terminal.snapshot().lines[0] ?? "";
        return line.includes("Failed options") ? line : null;
      });
      error
        .container()!
        .dispatchEvent(new MouseEvent("click", { clientX: 0, clientY: 0, bubbles: true }));
      await nextTick();
      expect(onErrorClose).not.toHaveBeenCalled();
    } finally {
      error.unmount();
    }

    const onEmptyClose = vi.fn();
    const empty = await mountTerminal(
      () =>
        h(TSelect, {
          x: 0,
          y: 0,
          w: 24,
          h: 3,
          options: [],
          emptyText: "No options",
          onClose: onEmptyClose,
        }),
      30,
      5,
    );

    try {
      empty.scheduler()?.flushNow();
      empty
        .container()!
        .dispatchEvent(new MouseEvent("click", { clientX: 0, clientY: 0, bubbles: true }));
      await nextTick();
      expect(onEmptyClose).not.toHaveBeenCalled();
    } finally {
      empty.unmount();
    }
  });

  it("clears stale TSelect provider options during debounced query changes", async () => {
    const query = ref("old");
    const debounce = ref(0);
    const provider = vi.fn((q: string) => {
      if (q === "old") return Promise.resolve(["old-a", "old-b"]);
      return new Promise<readonly string[]>(() => {});
    });
    const mounted = await mountTerminal(
      () =>
        h(TSelect, {
          x: 0,
          y: 0,
          w: 20,
          h: 3,
          options: [],
          optionProvider: provider,
          query: query.value,
          debounce: debounce.value,
        }),
      24,
      5,
    );

    try {
      await Promise.resolve();
      await nextTick();
      mounted.scheduler()?.flushNow();
      expect(mounted.terminal.snapshot().lines.join("\n")).toContain("old-a");

      query.value = "new";
      debounce.value = 50;
      await nextTick();
      mounted.scheduler()?.flushNow();
      const loadingFrame = mounted.terminal.snapshot().lines.join("\n");

      expect(provider.mock.calls.map(([q]) => q)).not.toContain("new");
      expect(loadingFrame).toContain("Loading...");
      expect(loadingFrame).not.toContain("old-a");
      expect(loadingFrame).not.toContain("old-b");
    } finally {
      mounted.unmount();
    }
  });

  it("uses internal TSelect query for searchable async options when query is uncontrolled", async () => {
    const queryUpdates: string[] = [];
    const provider = vi.fn((q: string) => Promise.resolve(q ? [`${q}-result`] : ["initial"]));
    const mounted = await mountTerminal(
      () =>
        h(TSelect, {
          x: 0,
          y: 0,
          w: 20,
          h: 3,
          options: [],
          optionProvider: provider,
          searchable: true,
          typeahead: false,
          autoFocus: true,
          "onUpdate:query": (value: string) => queryUpdates.push(value),
        }),
      24,
      5,
    );

    try {
      await Promise.resolve();
      await nextTick();

      mounted.container()!.dispatchEvent(new KeyboardEvent("keydown", { key: "b", bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      await nextTick();
      await Promise.resolve();
      mounted.scheduler()?.flushNow();

      expect(queryUpdates).toEqual(["b"]);
      expect(provider.mock.calls.map(([q]) => q)).toContain("b");
      await waitFor(() => {
        mounted.scheduler()?.flushNow();
        return mounted.terminal.snapshot().lines.join("\n").includes("b-result") || null;
      });
      expect(mounted.terminal.snapshot().lines.join("\n")).toContain("b-result");
    } finally {
      mounted.unmount();
    }
  });

  it("allows TSelect to use optionProvider without a static options prop", async () => {
    const provider = vi.fn(async () => [{ label: "Remote", value: "remote" }]);

    const mounted = await mountTerminal(
      () =>
        h(TSelect, {
          x: 0,
          y: 0,
          w: 16,
          h: 3,
          optionProvider: provider,
          valueMode: "value",
          modelValue: "remote",
        }),
      24,
      5,
    );

    try {
      await waitFor(() => {
        mounted.scheduler()!.flushNow();
        return mounted.terminal.snapshot().lines.join("\n").includes("Remote") || null;
      });
      expect(provider).toHaveBeenCalled();
    } finally {
      mounted.unmount();
    }
  });

  it("preserves split pane size sum when keyboard resize reaches min bounds", async () => {
    const sizes = ref([10, 10]);
    const mounted = await mountTerminal(
      () =>
        h(
          TSplitPane as any,
          {
            x: 0,
            y: 0,
            w: 21,
            h: 3,
            sizes: sizes.value,
            minSizes: [1, 1],
            "onUpdate:sizes": (next: number[]) => (sizes.value = next),
          },
          ({ panes }: any) => [
            h(TText, { ...panes[0], value: "Left" }),
            h(TText, { ...panes[1], value: "Right" }),
          ],
        ),
      30,
      5,
    );

    try {
      const container = mounted.container()!;
      container.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 10, clientY: 0, bubbles: true }),
      );
      for (let i = 0; i < 30; i++) {
        container.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "ArrowRight",
            code: "ArrowRight",
            bubbles: true,
            cancelable: true,
          }),
        );
        await nextTick();
      }

      expect(sizes.value[0]! + sizes.value[1]!).toBe(20);
      expect(sizes.value[0]).toBeGreaterThanOrEqual(1);
      expect(sizes.value[1]).toBeGreaterThanOrEqual(1);
    } finally {
      mounted.unmount();
    }
  });

  it("renders horizontal split pane separator through the full height", async () => {
    const mounted = await mountTerminal(
      () =>
        h(
          TSplitPane as any,
          {
            x: 0,
            y: 0,
            w: 21,
            h: 3,
            sizes: [10, 10],
          },
          ({ panes }: any) => [
            h(TText, { ...panes[0], value: "Left" }),
            h(TText, { ...panes[1], value: "Right" }),
          ],
        ),
      30,
      5,
    );

    try {
      const lines = mounted.terminal.snapshot().lines;
      expect(lines[0]?.[10]).toBe("|");
      expect(lines[1]?.[10]).toBe("|");
      expect(lines[2]?.[10]).toBe("|");
    } finally {
      mounted.unmount();
    }
  });

  it("resizes split panes from minimal controlled sizes with keyboard input", async () => {
    const sizes = ref([1, 1]);
    const updates: number[][] = [];
    const mounted = await mountTerminal(
      () =>
        h(
          TSplitPane as any,
          {
            x: 0,
            y: 0,
            w: 21,
            h: 3,
            sizes: sizes.value,
            "onUpdate:sizes": (next: number[]) => {
              updates.push(next);
              sizes.value = next;
            },
          },
          ({ panes }: any) => [
            h(TText, { ...panes[0], value: "Left" }),
            h(TText, { ...panes[1], value: "Right" }),
          ],
        ),
      30,
      5,
    );

    try {
      const container = mounted.container()!;
      container.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 1, clientY: 0, bubbles: true }),
      );
      container.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowRight",
          code: "ArrowRight",
          bubbles: true,
          cancelable: true,
        }),
      );
      await nextTick();

      expect(updates).toHaveLength(1);
      expect(sizes.value).not.toEqual([1, 1]);
      expect(sizes.value[0]! + sizes.value[1]!).toBe(20);
      expect(sizes.value[0]).toBeGreaterThan(1);
    } finally {
      mounted.unmount();
    }
  });

  it("keeps split panes inside the container when minSizes exceed available space", async () => {
    let seenPanes: any[] = [];
    const mounted = await mountTerminal(
      () =>
        h(
          TSplitPane as any,
          {
            x: 0,
            y: 0,
            w: 8,
            h: 2,
            sizes: [1, 1],
            minSizes: [10, 10],
          },
          ({ panes }: any) => {
            seenPanes = panes;
            return panes.map((pane: any, index: number) =>
              h(TText, { ...pane, value: index === 0 ? "Left" : "Right" }),
            );
          },
        ),
      12,
      4,
    );

    try {
      await nextTick();
      expect(seenPanes).toHaveLength(2);
      expect(seenPanes[1].x + seenPanes[1].w).toBeLessThanOrEqual(8);
      expect(seenPanes[0].w + seenPanes[1].w).toBe(7);
    } finally {
      mounted.unmount();
    }
  });

  it("places toast viewport from the current layout clip rect", async () => {
    const mounted = await mountTerminal(
      () => [
        h(TToastViewport, {
          offsetX: 2,
          w: 10,
          max: 1,
          placement: "top-left",
          items: [{ id: "left", title: "Left", message: "L" }],
        }),
        h(TView, { x: 4, y: 3, w: 20, h: 3 }, () =>
          h(TToastViewport, {
            offsetX: 1,
            w: 8,
            max: 1,
            placement: "top-right",
            items: [{ id: "right", title: "Right", message: "R" }],
          }),
        ),
      ],
      30,
      6,
    );

    try {
      const lines = mounted.terminal.snapshot().lines;
      expect(lines[0]?.indexOf("Left")).toBe(3);
      expect(lines[3]?.indexOf("Right")).toBe(16);
    } finally {
      mounted.unmount();
    }
  });

  it("applies toast level style to titleless messages", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TToastViewport, {
          w: 16,
          max: 1,
          placement: "top-left",
          items: [{ id: "saved", level: "success", message: "Saved" }],
        }),
      20,
      4,
    );

    try {
      expect(mounted.terminal.snapshot().lines[0]).toContain("Saved");
      expect(mounted.terminal.getCell(1, 0).style.fg).toBe("greenBright");
    } finally {
      mounted.unmount();
    }
  });

  it("keeps autocomplete suggestions open when closeOnSelect is false", async () => {
    const value = ref("ap");
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
          closeOnSelect: false,
        }),
      24,
      5,
    );

    try {
      const container = mounted.container()!;
      container.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 0, clientY: 1, bubbles: true }),
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
      mounted.scheduler()?.flushNow();

      const lines = mounted.terminal.snapshot().lines.join("\n");
      expect(value.value).toBe("apple");
      expect(lines).toContain("apple");
    } finally {
      mounted.unmount();
    }
  });

  it("clears stale autocomplete suggestions during debounced query changes", async () => {
    const value = ref("old");
    const debounce = ref(0);
    const provider = vi.fn((q: string) => {
      if (q === "old") return Promise.resolve(["old-suggestion"]);
      return new Promise<readonly string[]>(() => {});
    });
    const mounted = await mountTerminal(
      () =>
        h(TAutocompleteInput, {
          x: 0,
          y: 0,
          w: 24,
          h: 3,
          modelValue: value.value,
          suggestionProvider: provider,
          debounce: debounce.value,
        }),
      28,
      5,
    );

    try {
      await Promise.resolve();
      await nextTick();
      mounted.scheduler()?.flushNow();
      expect(mounted.terminal.snapshot().lines.join("\n")).toContain("old-suggestion");

      value.value = "new";
      debounce.value = 50;
      await nextTick();
      mounted.scheduler()?.flushNow();
      const loadingFrame = mounted.terminal.snapshot().lines.join("\n");

      expect(provider.mock.calls.map(([q]) => q)).not.toContain("new");
      expect(loadingFrame).toContain("Loading...");
      expect(loadingFrame).not.toContain("old-suggestion");
    } finally {
      mounted.unmount();
    }
  });

  it("emits autocomplete provider loadError", async () => {
    const onLoadError = vi.fn();
    const mounted = await mountTerminal(
      () =>
        h(TAutocompleteInput, {
          x: 0,
          y: 0,
          w: 24,
          h: 3,
          modelValue: "a",
          suggestionProvider: async () => {
            throw new Error("autocomplete network down");
          },
          onLoadError,
        }),
      30,
      5,
    );

    try {
      await waitFor(() => (onLoadError.mock.calls.length ? true : null));

      expect(onLoadError).toHaveBeenCalledWith({
        query: "a",
        error: expect.any(Error),
      });
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

  it("does not move autocomplete highlight when no suggestions are visible", async () => {
    const highlightedUpdates: number[] = [];
    const onSelect = vi.fn();
    const mounted = await mountTerminal(
      () =>
        h(TAutocompleteInput, {
          x: 0,
          y: 0,
          w: 20,
          h: 3,
          modelValue: "",
          suggestions: [],
          "onUpdate:highlightedIndex": (index: number) => highlightedUpdates.push(index),
          onSelect,
        }),
      24,
      5,
    );

    try {
      const container = mounted.container()!;
      container.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }),
      );
      for (const key of ["ArrowDown", "ArrowUp", "Enter"]) {
        container.dispatchEvent(
          new KeyboardEvent("keydown", { key, code: key, bubbles: true, cancelable: true }),
        );
      }
      await nextTick();

      expect(highlightedUpdates).toEqual([]);
      expect(onSelect).not.toHaveBeenCalled();
    } finally {
      mounted.unmount();
    }
  });

  it("clamps autocomplete highlighted index to visible suggestions", async () => {
    const value = ref("ap");
    const changes: string[] = [];
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
          suggestions: ["apple"],
          highlightedIndex: 4,
          onChange: (next: string) => changes.push(next),
          onSelect,
        }),
      24,
      5,
    );

    try {
      expect(mounted.terminal.getCell(0, 1).style.inverse).toBe(true);

      const container = mounted.container()!;
      container.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }),
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

      expect(value.value).toBe("apple");
      expect(changes).toEqual(["apple"]);
      expect(onSelect).toHaveBeenCalledWith(
        expect.objectContaining({ value: "apple", index: 0, query: "ap" }),
      );
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
      expect(onSelect).toHaveBeenCalledWith(
        expect.objectContaining({ value: "apricot", index: 1, query: "ap" }),
      );
    } finally {
      mounted.unmount();
    }
  });

  it("closes autocomplete suggestions on Escape without closing the parent dialog", async () => {
    const dialogOpen = ref(true);
    const autocompleteOpen = ref(true);

    const mounted = await mountTerminal(
      () =>
        h(
          TDialog,
          {
            modelValue: dialogOpen.value,
            "onUpdate:modelValue": (value: boolean) => (dialogOpen.value = value),
            w: 24,
            h: 6,
            title: "Search",
            closeOnEsc: true,
          },
          () =>
            h(TAutocompleteInput, {
              x: 0,
              y: 0,
              w: 18,
              h: 3,
              modelValue: "ap",
              suggestions: ["apple"],
              open: autocompleteOpen.value,
              "onUpdate:open": (value: boolean) => (autocompleteOpen.value = value),
            }),
        ),
      32,
      10,
    );

    try {
      const container = mounted.container()!;

      container.dispatchEvent(
        new MouseEvent("mousedown", {
          clientX: 6,
          clientY: 4,
          bubbles: true,
        }),
      );
      await nextTick();

      container.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          code: "Escape",
          bubbles: true,
          cancelable: true,
        }),
      );
      await nextTick();

      expect(autocompleteOpen.value).toBe(false);
      expect(dialogOpen.value).toBe(true);
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

  it("does not submit TForm when autocomplete consumes Enter for a suggestion", async () => {
    const value = ref("ap");
    const onSelect = vi.fn();
    const onSubmit = vi.fn();
    const mounted = await mountTerminal(
      () =>
        h(
          TForm,
          {
            x: 0,
            y: 0,
            w: 20,
            h: 3,
            model: { query: value.value },
            submitOnEnter: true,
            onSubmit,
          },
          () =>
            h(TAutocompleteInput, {
              x: 0,
              y: 0,
              w: 20,
              h: 3,
              modelValue: value.value,
              "onUpdate:modelValue": (next: string) => (value.value = next),
              suggestions: ["apple", "apricot"],
              onSelect,
            }),
        ),
      24,
      5,
    );

    try {
      const container = mounted.container()!;
      container.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }),
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

      expect(value.value).toBe("apple");
      expect(onSelect).toHaveBeenCalledWith(
        expect.objectContaining({ value: "apple", index: 0, query: "ap" }),
      );
      expect(onSubmit).not.toHaveBeenCalled();
    } finally {
      mounted.unmount();
    }
  });

  it("does not submit TForm when autocomplete active suggestion is disabled", async () => {
    const value = ref("ap");
    const changes: string[] = [];
    const onSelect = vi.fn();
    const onSubmit = vi.fn();

    const mounted = await mountTerminal(
      () =>
        h(
          TForm,
          {
            x: 0,
            y: 0,
            w: 20,
            h: 3,
            model: { query: value.value },
            submitOnEnter: true,
            onSubmit,
          },
          () =>
            h(TAutocompleteInput, {
              x: 0,
              y: 0,
              w: 20,
              h: 3,
              modelValue: value.value,
              "onUpdate:modelValue": (next: string) => (value.value = next),
              suggestions: [{ label: "apple", disabled: true }],
              highlightedIndex: 0,
              onChange: (next: string) => changes.push(next),
              onSelect,
            }),
        ),
      24,
      5,
    );

    try {
      const container = mounted.container()!;
      container.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }),
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

      expect(value.value).toBe("ap");
      expect(changes).toEqual([]);
      expect(onSelect).not.toHaveBeenCalled();
      expect(onSubmit).not.toHaveBeenCalled();
    } finally {
      mounted.unmount();
    }
  });

  it("submits TForm on Enter when submitOnEnter is enabled", async () => {
    const onSubmit = vi.fn();
    const mounted = await mountTerminal(
      () =>
        h(
          TForm,
          {
            x: 0,
            y: 0,
            w: 20,
            h: 2,
            model: { name: "Ada" },
            submitOnEnter: true,
            onSubmit,
          },
          () => h(TView, { x: 0, y: 0, w: 20, h: 1, focusable: true, autoFocus: true }),
        ),
      24,
      4,
    );

    try {
      mounted.container()!.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          bubbles: true,
          cancelable: true,
        }),
      );
      await nextTick();

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ model: { name: "Ada" }, valid: true, errors: {} }),
      );
    } finally {
      mounted.unmount();
    }
  });

  it("submits TForm on Enter from a focused child input and renders field errors", async () => {
    const onSubmit = vi.fn();
    const model = { name: "" };
    const mounted = await mountTerminal(
      () =>
        h(
          TForm,
          {
            x: 0,
            y: 0,
            w: 24,
            h: 3,
            model,
            rules: {
              name: (value: unknown) => (value ? null : "Name required"),
            },
            submitOnEnter: true,
            onSubmit,
          },
          () =>
            h(TFormField, { x: 0, y: 0, w: 24, h: 3, name: "name", label: "Name" }, () =>
              h(TInput, { x: 0, y: 0, w: 20, modelValue: "", autoFocus: true }),
            ),
        ),
      28,
      5,
    );

    try {
      mounted.container()!.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          bubbles: true,
          cancelable: true,
        }),
      );
      await nextTick();

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          model,
          valid: false,
          errors: { name: "Name required" },
        }),
      );
      expect(mounted.terminal.snapshot().lines.join("\n")).toContain("Name required");
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

  it("closes context menu on outside click without activating background controls", async () => {
    const open = ref(true);
    const backgroundClick = vi.fn();
    const onClose = vi.fn();
    const mounted = await mountTerminal(
      () => [
        h(TView, { x: 20, y: 0, w: 4, h: 1, zIndex: 10, onClick: backgroundClick }),
        h(TContextMenu, {
          modelValue: open.value,
          "onUpdate:modelValue": (value: boolean) => (open.value = value),
          x: 0,
          y: 0,
          w: 18,
          items: [{ id: "open", label: "Open Link" }],
          onClose,
        }),
      ],
      24,
      5,
    );

    try {
      const container = mounted.container()!;
      container.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 20, clientY: 0, bubbles: true }),
      );
      container.dispatchEvent(
        new MouseEvent("mouseup", { clientX: 20, clientY: 0, bubbles: true }),
      );
      container.dispatchEvent(new MouseEvent("click", { clientX: 20, clientY: 0, bubbles: true }));
      await nextTick();

      expect(backgroundClick).not.toHaveBeenCalled();
      expect(open.value).toBe(false);
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      mounted.unmount();
    }
  });

  it("keeps context menu outside close opt-out non-modal", async () => {
    const open = ref(true);
    const backgroundClick = vi.fn();
    const mounted = await mountTerminal(
      () => [
        h(TView, { x: 20, y: 0, w: 4, h: 1, zIndex: 10, onClick: backgroundClick }),
        h(TContextMenu, {
          modelValue: open.value,
          "onUpdate:modelValue": (value: boolean) => (open.value = value),
          x: 0,
          y: 0,
          w: 18,
          items: [{ id: "open", label: "Open Link" }],
          closeOnOutside: false,
        }),
      ],
      24,
      5,
    );

    try {
      const container = mounted.container()!;
      container.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 20, clientY: 0, bubbles: true }),
      );
      container.dispatchEvent(
        new MouseEvent("mouseup", { clientX: 20, clientY: 0, bubbles: true }),
      );
      container.dispatchEvent(new MouseEvent("click", { clientX: 20, clientY: 0, bubbles: true }));
      await nextTick();

      expect(backgroundClick).toHaveBeenCalledTimes(1);
      expect(open.value).toBe(true);
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

      expect(onSelect).toHaveBeenCalledWith(
        expect.objectContaining({ item: items[3], index: 3, source: "keyboard" }),
      );
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

      expect(onSelect).toHaveBeenCalledWith(
        expect.objectContaining({ item: items[1], index: 1, source: "keyboard" }),
      );
    } finally {
      mounted.unmount();
    }
  });

  it("includes sourceIndex in command palette select payloads", async () => {
    const items = [
      { label: "Group", kind: "group" as const },
      { label: "Open" },
      { label: "Copy" },
    ];
    const onSelect = vi.fn();
    const mounted = await mountTerminal(
      () =>
        h(TCommandPalette, {
          modelValue: true,
          w: 32,
          h: 10,
          initialQuery: "copy",
          items,
          onSelect,
        }),
      50,
      14,
    );

    try {
      mounted.container()!.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          bubbles: true,
          cancelable: true,
        }),
      );
      await nextTick();

      expect(onSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          item: items[2],
          index: 0,
          sourceIndex: 2,
          source: "keyboard",
        }),
      );
    } finally {
      mounted.unmount();
    }
  });

  it("clears stale command palette items during debounced query changes", async () => {
    const query = ref("old");
    const debounce = ref(0);
    const provider = vi.fn((q: string) => {
      if (q === "old") return Promise.resolve([{ label: "Old command" }]);
      return new Promise<readonly { label: string }[]>(() => {});
    });
    const mounted = await mountTerminal(
      () =>
        h(TCommandPalette, {
          modelValue: true,
          w: 32,
          h: 10,
          items: [],
          itemsProvider: provider,
          query: query.value,
          debounce: debounce.value,
        }),
      50,
      14,
    );

    try {
      await Promise.resolve();
      await nextTick();
      mounted.scheduler()?.flushNow();
      expect(mounted.terminal.snapshot().lines.join("\n")).toContain("Old command");

      query.value = "new";
      debounce.value = 50;
      await nextTick();
      mounted.scheduler()?.flushNow();
      const loadingFrame = mounted.terminal.snapshot().lines.join("\n");

      expect(provider.mock.calls.map(([q]) => q)).not.toContain("new");
      expect(loadingFrame).toContain("Loading...");
      expect(loadingFrame).not.toContain("Old command");
    } finally {
      mounted.unmount();
    }
  });

  it("emits command palette provider loadError", async () => {
    const onLoadError = vi.fn();
    const mounted = await mountTerminal(
      () =>
        h(TCommandPalette, {
          modelValue: true,
          w: 32,
          h: 10,
          itemsProvider: async () => {
            throw new Error("palette network down");
          },
          onLoadError,
        }),
      50,
      14,
    );

    try {
      await waitFor(() => {
        mounted.scheduler()?.flushNow();
        return onLoadError.mock.calls.length ? true : null;
      });

      expect(onLoadError).toHaveBeenCalledWith({
        query: "",
        error: expect.any(Error),
      });
    } finally {
      mounted.unmount();
    }
  });

  it("emits one command palette query reset when closing", async () => {
    const open = ref(true);
    const query = ref("copy");
    const queryUpdates: string[] = [];
    const mounted = await mountTerminal(
      () =>
        h(TCommandPalette, {
          modelValue: open.value,
          "onUpdate:modelValue": (value: boolean) => (open.value = value),
          query: query.value,
          "onUpdate:query": (value: string) => {
            queryUpdates.push(value);
            query.value = value;
          },
          resetQueryOnClose: true,
          w: 32,
          h: 10,
          items: [{ label: "Open" }, { label: "Copy" }],
        }),
      50,
      14,
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
      await nextTick();

      expect(open.value).toBe(false);
      expect(queryUpdates).toEqual([""]);
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
      expect(onSelect).toHaveBeenCalledWith(
        expect.objectContaining({ item: items[1], index: 1, source: "pointer" }),
      );
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

      expect(onSelect).toHaveBeenCalledWith(
        expect.objectContaining({ item: items[3], index: 3, source: "keyboard" }),
      );
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

      expect(onSelect).toHaveBeenCalledWith(
        expect.objectContaining({ item: items[0], index: 0, source: "keyboard" }),
      );
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
        dataIndex: 0,
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
