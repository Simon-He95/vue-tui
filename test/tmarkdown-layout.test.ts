import { describe, expect, it } from "vitest";
import type { Terminal } from "../src/index.js";
import { markdownAstToBlocks } from "../src/vue/markdown/ast.js";
import { buildMarkdownVisualRows } from "../src/vue/markdown/document.js";
import { layoutMarkdownBlocks } from "../src/vue/markdown/layout.js";
import { createTuiMarkdownParser } from "../src/vue/markdown/parser.js";
import { paintMarkdownVisualRow } from "../src/vue/markdown/render.js";
import { DEFAULT_TUI_MARKDOWN_THEME } from "../src/vue/markdown/theme.js";

describe("markdown layout", () => {
  it("maps headings, links, and unsafe links into terminal blocks", () => {
    const parser = createTuiMarkdownParser();
    const nodes = parser.parse(
      "# Hello\n\nA **bold** [safe](https://example.com) [unsafe](javascript:alert(1))",
      true,
    );
    const blocks = markdownAstToBlocks(nodes, DEFAULT_TUI_MARKDOWN_THEME);
    const paragraph = blocks[2];

    expect(blocks[0]?.type).toBe("inline");
    expect(blocks[1]?.type).toBe("blank");
    expect(paragraph?.type).toBe("inline");
    if (paragraph?.type !== "inline") throw new Error("expected paragraph block");
    expect(paragraph.segments.some((segment) => segment.style?.bold)).toBe(true);
    expect(
      paragraph.segments.some((segment) => segment.style?.href === "https://example.com"),
    ).toBe(true);
    expect(
      paragraph.segments.some((segment) => segment.style?.href?.startsWith("javascript:")),
    ).toBe(false);
  });

  it("rejects markdown links with control characters and unsupported protocols", () => {
    const parser = createTuiMarkdownParser();
    const nodes = parser.parse(
      [
        "[ok](https://example.com)",
        "[mail](mailto:test@example.com)",
        "[bad-proto-relative](//evil.example)",
        "[bad-control](https://example.com\u0007\u001b]8;;evil\u0007)",
        "[bad-data](data:text/html,boom)",
        "[bad-file](file:///tmp/demo.txt)",
      ].join(" "),
      true,
    );
    const blocks = markdownAstToBlocks(nodes, DEFAULT_TUI_MARKDOWN_THEME);
    const paragraph = blocks[0];

    expect(paragraph?.type).toBe("inline");
    if (paragraph?.type !== "inline") throw new Error("expected inline block");
    expect(
      paragraph.segments.some((segment) => segment.style?.href === "https://example.com"),
    ).toBe(true);
    expect(
      paragraph.segments.some((segment) => segment.style?.href === "mailto:test@example.com"),
    ).toBe(true);
    expect(paragraph.segments.some((segment) => segment.style?.href?.includes("\u0007"))).toBe(
      false,
    );
    expect(paragraph.segments.some((segment) => segment.style?.href === "//evil.example")).toBe(
      false,
    );
    expect(paragraph.segments.some((segment) => segment.style?.href?.startsWith("data:"))).toBe(
      false,
    );
    expect(paragraph.segments.some((segment) => segment.style?.href?.startsWith("file:"))).toBe(
      false,
    );
  });

  it("wraps CJK rows by terminal cells without cutting glyphs", () => {
    const rows = buildMarkdownVisualRows("你好hello", 6, createTuiMarkdownParser());
    expect(rows.map((row) => row.plainText)).toEqual(["你好he", "llo"]);
  });

  it("keeps unordered list markers only on the first wrapped row", () => {
    const parser = createTuiMarkdownParser();
    const nodes = parser.parse("- hello world", true);
    const blocks = markdownAstToBlocks(nodes, DEFAULT_TUI_MARKDOWN_THEME);
    const rows = layoutMarkdownBlocks(blocks, 8);
    expect(rows.map((row) => row.plainText)).toEqual(["- hello ", "  world"]);
  });

  it("keeps streaming strong parsing strict only when final rendering is non-streaming", () => {
    const strictParser = createTuiMarkdownParser({ streaming: false });
    const streamingParser = createTuiMarkdownParser({ streaming: true });
    const strictRows = buildMarkdownVisualRows("[**cxx](xxx)", 20, strictParser, { final: true });
    const streamingRows = buildMarkdownVisualRows("[**cxx](xxx)", 20, streamingParser, {
      final: false,
    });

    expect(strictRows[0]?.plainText.includes("cxx")).toBe(true);
    expect(streamingRows[0]?.plainText.includes("cxx")).toBe(true);
  });

  it("requires closing strong after streaming finalization", () => {
    const parser = createTuiMarkdownParser({ streaming: true });
    const pendingNodes = parser.parse("**dangling", false);
    const finalizedNodes = parser.parse("**dangling", true);
    const pendingBlocks = markdownAstToBlocks(pendingNodes, DEFAULT_TUI_MARKDOWN_THEME);
    const finalizedBlocks = markdownAstToBlocks(finalizedNodes, DEFAULT_TUI_MARKDOWN_THEME);
    const pendingParagraph = pendingBlocks[0];
    const finalizedParagraph = finalizedBlocks[0];

    expect(pendingParagraph?.type).toBe("inline");
    expect(finalizedParagraph?.type).toBe("inline");
    if (pendingParagraph?.type !== "inline" || finalizedParagraph?.type !== "inline") {
      throw new Error("expected inline block");
    }

    expect(pendingParagraph.segments.some((segment) => segment.style?.bold)).toBe(true);
    expect(finalizedParagraph.segments.some((segment) => segment.style?.bold)).toBe(false);
  });

  it("keeps unfinished fenced code stable across final=false to final=true", () => {
    const parser = createTuiMarkdownParser({ streaming: true });
    const markdown = "before\n\n```ts\nconst a = 1";
    const pendingNodes = parser.parse(markdown, false);
    const finalNodes = parser.parse(markdown, true);
    const pendingCode = pendingNodes.find((node) => node.type === "code_block");
    const finalCode = finalNodes.find((node) => node.type === "code_block");
    const pendingRows = buildMarkdownVisualRows(markdown, 20, parser, { final: false });
    const finalRows = buildMarkdownVisualRows(markdown, 20, parser, { final: true });

    expect(pendingCode?.type).toBe("code_block");
    expect(finalCode?.type).toBe("code_block");
    expect("loading" in (pendingCode ?? {}) ? pendingCode?.loading : undefined).toBe(true);
    expect("loading" in (finalCode ?? {}) ? finalCode?.loading : undefined).not.toBe(true);
    expect(pendingRows.map((row) => row.plainText)).toEqual(finalRows.map((row) => row.plainText));
  });

  it("does not hang when list and blockquote prefixes are wider than width", () => {
    const parser = createTuiMarkdownParser();
    const listRows = buildMarkdownVisualRows("- a", 1, parser);
    const quoteRows = buildMarkdownVisualRows("> a", 1, parser);
    const nestedRows = buildMarkdownVisualRows("- a\n  - b", 1, parser);
    const orderedRows = buildMarkdownVisualRows("100. a", 3, parser);

    expect(listRows.length).toBeGreaterThan(0);
    expect(quoteRows.length).toBeGreaterThan(0);
    expect(nestedRows.length).toBeGreaterThan(0);
    expect(orderedRows.length).toBeGreaterThan(0);
    expect(listRows.some((row) => row.plainText.includes("a"))).toBe(true);
    expect(
      quoteRows.some((row) => row.plainText.includes("a") || row.plainText.includes("│")),
    ).toBe(true);
    expect(nestedRows.some((row) => row.plainText.includes("b"))).toBe(true);
    expect(
      orderedRows.some((row) => row.plainText.includes("a") || row.plainText.includes("100")),
    ).toBe(true);
  });

  it("does not consume wide glyphs into rows that exceed the viewport width", () => {
    const parser = createTuiMarkdownParser();
    const rows = buildMarkdownVisualRows("- 你", 3, parser);

    for (const row of rows) {
      const cells = row.segments.reduce((sum, segment) => sum + segment.cells, 0);
      expect(cells).toBeLessThanOrEqual(3);
    }

    expect(rows.map((row) => row.plainText).join("\n")).toContain("你");
  });

  it("reuses merged style objects across markdown paints", () => {
    const writes: Array<{ text: string; style: unknown }> = [];
    const terminal = {
      write(text: string, opts?: { style?: unknown }) {
        writes.push({ text, style: opts?.style });
      },
    } as unknown as Terminal;
    const baseStyle = Object.freeze({ fg: "white" });
    const overlayStyle = Object.freeze({ bold: true });
    const row = {
      key: "row-1",
      blockKey: "block-1",
      rowInBlock: 0,
      plainText: "a",
      segments: [{ text: "a", cells: 1, style: overlayStyle }],
    };

    paintMarkdownVisualRow(terminal, row, { x: 0, y: 0, w: 1, baseStyle });
    paintMarkdownVisualRow(terminal, row, { x: 0, y: 1, w: 1, baseStyle });

    expect(writes).toHaveLength(2);
    expect(writes[0]?.style).toBe(writes[1]?.style);
    expect(writes[0]?.style).toMatchObject({ fg: "white", bold: true });
  });
});
