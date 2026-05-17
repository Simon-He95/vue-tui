import { describe, expect, it } from "vitest";
import {
  layoutTranscriptRow,
  transcriptActionRegionId,
  transcriptFoldToggleRegionId,
  transcriptToolCallRegionId,
} from "../src/vue/transcript/layout.js";
import { plainTextForTranscriptRow } from "../src/vue/transcript/plain-text.js";
import { sliceByCellsRange } from "../src/vue/utils/text.js";

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
      id: transcriptActionRegionId("approval", "approve"),
      kind: "action",
      rowIndex: 2,
      payload: { actionId: "approve" },
    });
    const region = rows[0]!.hitRegions[0]!;
    expect(
      sliceByCellsRange(
        rows[0]!.selectionSegments.map((segment) => segment.text).join(""),
        region.x0,
        region.x1,
      ),
    ).toBe("[Approve]");
    expect(
      rows[0]!.selectionSegments.find(
        (segment) => segment.x0 <= region.x0 && segment.x1 >= region.x1,
      ),
    ).toMatchObject({ selectable: false });
    expect(plainTextForTranscriptRow(row)).toBe("Allow command?\npnpm test");
  });

  it("scopes repeated action ids by row key", () => {
    const makeRow = (key: string) => ({
      kind: "approval" as const,
      key,
      title: "Allow?",
      actions: [{ id: "approve", label: "Approve", kind: "primary" as const }],
    });

    const first = layoutTranscriptRow({
      row: makeRow("first"),
      rowIndex: 0,
      rowKey: "first",
      width: 80,
      baseStyle: {},
      wrap: false,
    });
    const second = layoutTranscriptRow({
      row: makeRow("second"),
      rowIndex: 1,
      rowKey: "second",
      width: 80,
      baseStyle: {},
      wrap: false,
    });

    expect(first[0]?.hitRegions[0]?.id).toBe(transcriptActionRegionId("first", "approve"));
    expect(second[0]?.hitRegions[0]?.id).toBe(transcriptActionRegionId("second", "approve"));
  });

  it("keeps selection segments aligned across non-selectable cells", () => {
    const rows = layoutTranscriptRow({
      row: {
        kind: "message",
        key: "msg",
        segments: [{ text: "AA" }, { text: "XX", selectable: false }, { text: "BB" }],
      },
      rowIndex: 0,
      rowKey: "msg",
      width: 80,
      baseStyle: {},
      wrap: false,
    });

    expect(rows[0]?.text).toBe("AAXXBB");
    expect(rows[0]?.selectableText).toBe("AABB");
    expect(rows[0]?.selectionSegments).toEqual([
      { x0: 0, x1: 2, text: "AA", selectable: true },
      { x0: 2, x1: 4, text: "XX", selectable: false },
      { x0: 4, x1: 6, text: "BB", selectable: true },
    ]);
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

  it("creates fold and tool-call hit regions for tool-call rows", () => {
    const row = {
      kind: "tool-call" as const,
      key: "tool",
      title: "read_file",
      collapsed: false,
      summary: [{ text: "src/index.ts" }],
      body: [{ text: "contents" }],
      actions: [{ id: "retry", label: "Retry", disabled: true }],
    };
    const rows = layoutTranscriptRow({
      row,
      rowIndex: 1,
      rowKey: row.key,
      width: 80,
      baseStyle: {},
      wrap: false,
    });

    expect(rows[0]?.hitRegions.map((region) => region.kind)).toContain("fold-toggle");
    expect(rows[0]?.hitRegions.map((region) => region.kind)).toContain("tool-call");
    expect(rows[0]?.hitRegions.some((region) => region.kind === "action")).toBe(false);
    expect(rows[0]?.hitRegions.find((region) => region.kind === "fold-toggle")).toMatchObject({
      id: transcriptFoldToggleRegionId("tool"),
      rowIndex: 1,
      payload: { collapsed: false },
    });
    expect(rows[0]?.hitRegions.find((region) => region.kind === "tool-call")).toMatchObject({
      id: transcriptToolCallRegionId("tool"),
      rowIndex: 1,
    });
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
