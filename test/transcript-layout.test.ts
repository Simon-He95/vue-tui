import { describe, expect, it } from "vitest";
import { layoutTranscriptRow } from "../src/vue/transcript/layout.js";
import { plainTextForTranscriptRow } from "../src/vue/transcript/plain-text.js";

describe("transcript row layout", () => {
  it("wraps rich text by terminal cells", () => {
    const rows = layoutTranscriptRow({
      row: {
        kind: "message",
        key: "msg",
        segments: [{ text: "a中b", style: { fg: "cyan" } }],
      },
      rowIndex: 0,
      rowKey: "msg",
      width: 3,
      baseStyle: {},
      wrap: true,
    });

    expect(rows.map((row) => row.text)).toEqual(["a中", "b"]);
    expect(rows[0]?.segments[0]?.cells).toBe(3);
  });

  it("keeps selectable text scoped to each wrapped visual row", () => {
    const rows = layoutTranscriptRow({
      row: {
        kind: "message",
        key: "msg",
        segments: [{ text: "abcdef" }],
      },
      rowIndex: 0,
      rowKey: "msg",
      width: 3,
      baseStyle: {},
      wrap: true,
    });

    expect(rows.map((row) => row.selectableText)).toEqual(["abc", "def"]);
  });

  it("lays out action hit regions without adding actions to copy text", () => {
    const row = {
      kind: "approval" as const,
      key: "approval",
      title: "Allow command?",
      description: [{ text: "pnpm test" }],
      actions: [{ id: "approve", label: "Approve", kind: "primary" as const }],
    };
    const rows = layoutTranscriptRow({
      row,
      rowIndex: 2,
      rowKey: row.key,
      width: 80,
      baseStyle: {},
      wrap: false,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.hitRegions[0]).toMatchObject({
      id: "approve",
      kind: "action",
      rowIndex: 2,
    });
    expect(plainTextForTranscriptRow(row)).toBe("Allow command?\npnpm test");
  });

  it("does not create hit regions for disabled actions", () => {
    const row = {
      kind: "approval" as const,
      key: "approval",
      title: "Allow command?",
      actions: [{ id: "approve", label: "Approve", disabled: true }],
    };
    const rows = layoutTranscriptRow({
      row,
      rowIndex: 0,
      rowKey: row.key,
      width: 80,
      baseStyle: {},
      wrap: false,
    });

    expect(rows[0]?.text).toContain("[Approve]");
    expect(rows[0]?.hitRegions).toEqual([]);
  });

  it("omits collapsed tool-call body from plain text", () => {
    const row = {
      kind: "tool-call" as const,
      key: "tool",
      title: "read_file",
      collapsed: true,
      summary: [{ text: "src/index.ts" }],
      body: [{ text: "hidden body" }],
    };

    expect(plainTextForTranscriptRow(row)).toBe("read_file\nsrc/index.ts");
  });
});
