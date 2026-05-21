import { describe, expect, it } from "vitest";
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
import { h, mountTerminal } from "./ui-regressions-support.js";

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

  it("creates theme tokens with component overrides", () => {
    const theme = createTheme({
      colors: { link: "blueBright" },
      components: { TLink: { style: { fg: "blueBright", underline: true } } },
    });

    expect(theme.colors.link).toBe("blueBright");
    expect(theme.components.TLink?.style?.fg).toBe("blueBright");
    expect(theme.colors.danger).toBe("redBright");
  });
});
