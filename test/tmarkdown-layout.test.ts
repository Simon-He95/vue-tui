import { describe, expect, it } from "vitest";
import { markdownAstToBlocks } from "../src/vue/markdown/ast.js";
import { buildMarkdownVisualRows } from "../src/vue/markdown/document.js";
import { layoutMarkdownBlocks } from "../src/vue/markdown/layout.js";
import { createTuiMarkdownParser } from "../src/vue/markdown/parser.js";
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
});
