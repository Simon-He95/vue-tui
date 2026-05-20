import { describe, expect, it, vi } from "vitest";
import { createTerminal, type Style, type Terminal } from "../src/index.js";
import { markdownAstToBlocks } from "../src/vue/markdown/ast.js";
import { buildMarkdownBlocks, buildMarkdownVisualRows } from "../src/vue/markdown/document.js";
import { layoutMarkdownBlocks, layoutMarkdownBlocksCached } from "../src/vue/markdown/layout.js";
import {
  createTuiMarkdownParser,
  isSafeMarkdownLink,
  type TuiMarkdownParser,
} from "../src/vue/markdown/parser.js";
import { paintMarkdownVisualRow } from "../src/vue/markdown/render.js";
import { DEFAULT_TUI_MARKDOWN_THEME } from "../src/vue/markdown/theme.js";
import type { TuiMarkdownNode } from "../src/vue/markdown/types.js";
import { withTextWidthProvider } from "../src/vue/utils/text.js";

function visualRowCells(row: { segments: readonly { cells: number }[] }): number {
  return row.segments.reduce((sum, segment) => sum + segment.cells, 0);
}

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
      paragraph.segments.some((segment) => segment.style?.href === "https://example.com/"),
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
      paragraph.segments.some((segment) => segment.style?.href === "https://example.com/"),
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

  it("keeps bare relative markdown links as safe hrefs", () => {
    const parser = createTuiMarkdownParser();
    const nodes = parser.parse(
      [
        "[guide](guide/parser-api)",
        "[doc](docs/intro.md)",
        "[asset](assets/a.png)",
        "[anchor](#section-1)",
      ].join(" "),
      true,
    );
    const blocks = markdownAstToBlocks(nodes, DEFAULT_TUI_MARKDOWN_THEME);
    const paragraph = blocks[0];

    expect(paragraph?.type).toBe("inline");
    if (paragraph?.type !== "inline") throw new Error("expected inline block");
    expect(paragraph.segments.some((segment) => segment.style?.href === "guide/parser-api")).toBe(
      true,
    );
    expect(paragraph.segments.some((segment) => segment.style?.href === "docs/intro.md")).toBe(
      true,
    );
    expect(paragraph.segments.some((segment) => segment.style?.href === "assets/a.png")).toBe(true);
    expect(paragraph.segments.some((segment) => segment.style?.href === "#section-1")).toBe(true);
  });

  it("does not style unsafe markdown links as active links", () => {
    const parser = createTuiMarkdownParser();
    const nodes = parser.parse("[safe](https://example.com) [unsafe](javascript:alert(1))", true);
    const blocks = markdownAstToBlocks(nodes, DEFAULT_TUI_MARKDOWN_THEME);
    const paragraph = blocks[0];

    expect(paragraph?.type).toBe("inline");
    if (paragraph?.type !== "inline") throw new Error("expected inline block");
    const safeSegment = paragraph.segments.find((segment) => segment.text === "safe");
    const unsafeSegment = paragraph.segments.find((segment) => segment.text === "unsafe");
    expect(safeSegment?.style?.href).toBe("https://example.com/");
    expect(safeSegment?.style?.underline).toBe(true);
    expect(unsafeSegment?.style?.href).toBeUndefined();
    expect(unsafeSegment?.style?.underline).not.toBe(true);
  });

  it("uses core href safety rules for markdown links", () => {
    expect(isSafeMarkdownLink("https://example.com")).toBe(true);
    expect(isSafeMarkdownLink("mailto:test@example.com")).toBe(true);
    expect(isSafeMarkdownLink("#section")).toBe(true);
    expect(isSafeMarkdownLink("/docs/page")).toBe(true);
    expect(isSafeMarkdownLink("foo bar")).toBe(false);
    expect(isSafeMarkdownLink("https://example.com/a b")).toBe(false);
    expect(isSafeMarkdownLink("https://example.com/a%20b")).toBe(true);
    expect(isSafeMarkdownLink("guide%20intro")).toBe(true);
    expect(isSafeMarkdownLink("README%20copy.md")).toBe(true);
    expect(isSafeMarkdownLink("docs/intro%20guide.md")).toBe(true);
    expect(isSafeMarkdownLink("../guide/parser-api")).toBe(true);
    expect(isSafeMarkdownLink("#section-1")).toBe(true);
    expect(isSafeMarkdownLink("javascript:alert(1)")).toBe(false);
    expect(isSafeMarkdownLink("JaVaScRiPt:alert(1)")).toBe(false);
    expect(isSafeMarkdownLink("data:text/html,boom")).toBe(false);
    expect(isSafeMarkdownLink("vbscript:msgbox(1)")).toBe(false);
    expect(isSafeMarkdownLink("docs/<img>")).toBe(false);
    expect(isSafeMarkdownLink('docs/"x"')).toBe(false);
    expect(isSafeMarkdownLink("docs/'x'")).toBe(false);
    expect(isSafeMarkdownLink("docs/`x`")).toBe(false);
    expect(isSafeMarkdownLink("//evil.test")).toBe(false);
    expect(isSafeMarkdownLink("https:\\\\evil.test")).toBe(false);
    expect(isSafeMarkdownLink("\\evil")).toBe(false);
    expect(isSafeMarkdownLink("../ok")).toBe(true);
    expect(isSafeMarkdownLink("mailto:a@b.com?subject=x%0aBCC:c@d.com")).toBe(false);
    expect(isSafeMarkdownLink("guide%0aintro")).toBe(false);
    expect(isSafeMarkdownLink("guide%0dintro")).toBe(false);
    expect(isSafeMarkdownLink("guide%zzintro")).toBe(false);
  });

  it("stores sanitized markdown href in inline segment style", () => {
    const parser = createTuiMarkdownParser();
    const { blocks } = buildMarkdownBlocks("[x](https://example.com)", parser);
    const segment = blocks
      .flatMap((block: any) => block.segments ?? [])
      .find((seg: any) => seg.text === "x");

    expect(segment.style.href).toBe("https://example.com/");
  });

  it("does not store unsafe markdown href", () => {
    const parser = createTuiMarkdownParser();
    const { blocks } = buildMarkdownBlocks("[x](javascript:alert(1))", parser);
    const segment = blocks
      .flatMap((block: any) => block.segments ?? [])
      .find((seg: any) => seg.text === "x");

    expect(segment?.style?.href).toBeUndefined();
  });

  it("evicts only the oldest markdown parser cache entry", async () => {
    vi.resetModules();
    const getMarkdownMock = vi.fn((name: string) => ({ name }));
    vi.doMock("stream-markdown-parser", () => ({
      getMarkdown: getMarkdownMock,
      parseMarkdownToStructure: vi.fn(() => []),
    }));
    try {
      const parserModule = await import("../src/vue/markdown/parser.js");

      for (let i = 0; i < 32; i++) {
        parserModule.createTuiMarkdownParser({ customHtmlTags: [`tag-${i}`] });
      }
      expect(getMarkdownMock).toHaveBeenCalledTimes(32);

      parserModule.createTuiMarkdownParser({ customHtmlTags: ["tag-0"] });
      parserModule.createTuiMarkdownParser({ customHtmlTags: ["tag-32"] });
      parserModule.createTuiMarkdownParser({ customHtmlTags: ["tag-1"] });
      parserModule.createTuiMarkdownParser({ customHtmlTags: ["tag-0"] });

      expect(getMarkdownMock).toHaveBeenCalledTimes(34);
    } finally {
      vi.doUnmock("stream-markdown-parser");
      vi.resetModules();
    }
  });

  it("uses canonical custom HTML tags for cache and parsing", async () => {
    vi.resetModules();
    const getMarkdownMock = vi.fn((name: string, options: unknown) => ({ name, options }));
    const parseMarkdownToStructureMock = vi.fn(() => []);
    vi.doMock("stream-markdown-parser", () => ({
      getMarkdown: getMarkdownMock,
      parseMarkdownToStructure: parseMarkdownToStructureMock,
    }));
    try {
      const parserModule = await import("../src/vue/markdown/parser.js");
      const first = parserModule.createTuiMarkdownParser({
        customHtmlTags: ["foo-card", "bar-card", "foo-card", ""],
      });
      const second = parserModule.createTuiMarkdownParser({
        customHtmlTags: ["bar-card", "foo-card"],
      });

      first.parse("<foo-card>x</foo-card>", true);
      second.parse("<foo-card>x</foo-card>", true);

      expect(getMarkdownMock).toHaveBeenCalledTimes(1);
      expect(getMarkdownMock).toHaveBeenCalledWith(expect.any(String), {
        customHtmlTags: ["bar-card", "foo-card"],
      });
      expect(parseMarkdownToStructureMock).toHaveBeenCalledWith(
        "<foo-card>x</foo-card>",
        expect.anything(),
        expect.objectContaining({
          customHtmlTags: ["bar-card", "foo-card"],
        }),
      );
    } finally {
      vi.doUnmock("stream-markdown-parser");
      vi.resetModules();
    }
  });

  it("lays out long markdown paragraphs without changing row counts", () => {
    const parser = createTuiMarkdownParser();
    const rows = buildMarkdownVisualRows("a".repeat(100_000), 80, parser);

    expect(rows).toHaveLength(1250);
    expect(rows[0]?.plainText).toHaveLength(80);
    expect(rows.at(-1)?.plainText).toHaveLength(80);
  });

  it("falls back to plain text rows when markdown parsing throws", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const parser: TuiMarkdownParser = {
      parse() {
        throw new Error("boom");
      },
    };

    const rows = buildMarkdownVisualRows("hello\n\nworld", 20, parser);

    expect(rows.map((row) => row.plainText)).toEqual(["hello", "", "world"]);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("drops unsafe hrefs even when link nodes bypass parser validation", () => {
    const blocks = markdownAstToBlocks(
      [
        {
          type: "paragraph",
          raw: "",
          children: [
            {
              type: "link",
              raw: "",
              href: "javascript:alert(1)",
              children: [{ type: "text", raw: "unsafe", content: "unsafe" }],
            },
          ],
        } as TuiMarkdownNode,
      ],
      DEFAULT_TUI_MARKDOWN_THEME,
    );
    const paragraph = blocks[0];

    expect(paragraph?.type).toBe("inline");
    if (paragraph?.type !== "inline") throw new Error("expected inline block");
    expect(paragraph.segments.some((segment) => segment.style?.href)).toBe(false);
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

  it("renders markdown tables as bordered terminal rows", () => {
    const rows = buildMarkdownVisualRows(
      ["| Package | Name |", "|---|---|", "| cli | dimcode |"].join("\n"),
      80,
      createTuiMarkdownParser(),
    );

    expect(rows.map((row) => row.plainText)).toEqual([
      "╭─────────┬─────────╮",
      "│ Package │ Name    │",
      "├─────────┼─────────┤",
      "│ cli     │ dimcode │",
      "╰─────────┴─────────╯",
    ]);
    expect(
      rows[1]?.segments.some((segment) => segment.text === "Package" && segment.style?.bold),
    ).toBe(true);
  });

  it("honors markdown table cell alignment", () => {
    const rows = buildMarkdownVisualRows(
      ["| Left | Center | Right |", "|:--|:-:|--:|", "| a | b | c |"].join("\n"),
      80,
      createTuiMarkdownParser(),
    );

    expect(rows[3]?.plainText).toBe("│ a    │   b    │     c │");
  });

  it("lets public markdown helpers use cjk widthProvider for table layout", () => {
    const markdown = ["| X | Name |", "|---|---|", "| Ω | omega |", "| — | dash |"].join("\n");
    const parser = createTuiMarkdownParser();
    const defaultRows = buildMarkdownVisualRows(markdown, 40, parser);
    const rows = buildMarkdownVisualRows(markdown, 40, parser, { widthProvider: "cjk" });
    const { blocks } = buildMarkdownBlocks(markdown, parser);
    const layoutRows = layoutMarkdownBlocks(blocks, 40, { widthProvider: "cjk" });
    const tableWidth = visualRowCells(rows[0]!);
    const terminal = createTerminal({ cols: 40, rows: rows.length, widthProvider: "cjk" });

    expect(layoutRows.map((row) => row.plainText)).toEqual(rows.map((row) => row.plainText));
    expect(tableWidth).toBeGreaterThan(visualRowCells(defaultRows[0]!));
    expect(rows.every((row) => visualRowCells(row) === tableWidth)).toBe(true);

    rows.forEach((row, y) => terminal.write(row.plainText, { x: 0, y }));

    expect(terminal.getCell(tableWidth - 1, 0).ch).toBe("╮");
    expect(terminal.getCell(tableWidth - 1, 1).ch).toBe("│");
    expect(terminal.getCell(tableWidth - 1, 2).ch).toBe("┤");
    expect(terminal.getCell(tableWidth - 1, rows.length - 1).ch).toBe("╯");
  });

  it("does not reuse cached table rows when the widthProvider changes", () => {
    const parser = createTuiMarkdownParser();
    const { blocks } = buildMarkdownBlocks(["| X |", "|---|", "| Ω |"].join("\n"), parser);
    const first = withTextWidthProvider("default", () => layoutMarkdownBlocksCached(blocks, 40));
    const next = withTextWidthProvider("cjk", () =>
      layoutMarkdownBlocksCached(blocks, 40, first.cache),
    );
    const fresh = withTextWidthProvider("cjk", () => layoutMarkdownBlocksCached(blocks, 40));

    expect(next.rows.map((row) => row.plainText)).toEqual(fresh.rows.map((row) => row.plainText));
    expect(visualRowCells(next.rows[0]!)).toBeGreaterThan(visualRowCells(first.rows[0]!));
    expect(next.rows[0]).not.toBe(first.rows[0]);
  });

  it("keeps markdown table borders aligned with wide emoji, tag emoji, and CJK cells", () => {
    const smile = "\u{1F600}";
    const family = "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}";
    const check = "\u2705";
    const englandFlag = "\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}";
    const rows = buildMarkdownVisualRows(
      [
        "| Icon | Text |",
        "|---|---|",
        `| ${smile} | smile |`,
        `| ${family} | family |`,
        "| 中文 | cjk |",
        `| ${check} | ok |`,
        `| ${englandFlag} | england |`,
      ].join("\n"),
      80,
      createTuiMarkdownParser(),
    );

    expect(new Set(rows.map(visualRowCells)).size).toBe(1);
    expect(rows.some((row) => row.plainText.includes(englandFlag))).toBe(true);
  });

  it("keeps table right borders closed with complex emoji clusters", () => {
    const coder = "\u{1F468}\u{1F3FD}\u200D\u{1F4BB}";
    const rainbowFlag = "\u{1F3F3}\uFE0F\u200D\u{1F308}";
    const pirateFlag = "\u{1F3F4}\u200D\u2620\uFE0F";
    const keycapOne = "1\uFE0F\u20E3";
    const combiningE = "e\u0301";
    const rows = buildMarkdownVisualRows(
      [
        "| Icon | Name |",
        "|---|---|",
        `| ${coder} | coder |`,
        `| ${rainbowFlag} | pride |`,
        `| ${pirateFlag} | pirate |`,
        `| ${keycapOne} | keycap |`,
        `| ${combiningE} | combining |`,
      ].join("\n"),
      40,
      createTuiMarkdownParser(),
    );

    expect(new Set(rows.map(visualRowCells)).size).toBe(1);
    expect(rows[0]?.plainText.endsWith("╮")).toBe(true);
    expect(rows[1]?.plainText.endsWith("│")).toBe(true);
    expect(rows[2]?.plainText.endsWith("┤")).toBe(true);
    expect(rows.at(-1)?.plainText.endsWith("╯")).toBe(true);
  });

  it("keeps table borders aligned with non-emoji grapheme clusters", () => {
    const devanagariKi = "\u0915\u093F";
    const devanagariKsha = "\u0915\u094D\u0937";
    const devanagariZwjKsha = "\u0915\u094D\u200D\u0937";
    const rows = buildMarkdownVisualRows(
      [
        "| X |",
        "|---|",
        `| ${devanagariKi} |`,
        `| ${devanagariKsha} |`,
        `| ${devanagariZwjKsha} |`,
      ].join("\n"),
      20,
      createTuiMarkdownParser(),
    );

    expect(rows.every((row) => visualRowCells(row) === 5)).toBe(true);
    expect(rows[0]?.plainText).toBe("╭───╮");
    expect(rows[1]?.plainText.endsWith("│")).toBe(true);
    expect(rows[2]?.plainText.endsWith("┤")).toBe(true);
    expect(rows.at(-1)?.plainText).toBe("╰───╯");
  });

  it("keeps table borders stable with orphaned unicode modifiers", () => {
    const zwj = String.fromCodePoint(0x200d);
    const vs16 = String.fromCodePoint(0xfe0f);
    const combining = String.fromCodePoint(0x0301);
    const tagEnd = String.fromCodePoint(0xe007f);
    const rows = buildMarkdownVisualRows(
      [
        "| X | Name |",
        "|---|---|",
        `| ${zwj} | zwj |`,
        `| ${vs16} | vs16 |`,
        `| ${combining} | combining |`,
        `| ${tagEnd} | tag-end |`,
      ].join("\n"),
      40,
      createTuiMarkdownParser(),
    );
    const width = visualRowCells(rows[0]!);

    expect(rows.every((row) => visualRowCells(row) === width)).toBe(true);
    expect(rows[0]?.plainText.endsWith("╮")).toBe(true);
    expect(rows[1]?.plainText.endsWith("│")).toBe(true);
    expect(rows[2]?.plainText.endsWith("┤")).toBe(true);
    expect(rows.at(-1)?.plainText.endsWith("╯")).toBe(true);

    const terminal = createTerminal({ cols: 40, rows: rows.length });
    rows.forEach((row, y) => {
      paintMarkdownVisualRow(terminal, row, {
        x: 0,
        y,
        w: 40,
        baseStyle: {},
      });
    });

    expect(terminal.getCell(width - 1, 0).ch).toBe("╮");
    expect(terminal.getCell(width - 1, 1).ch).toBe("│");
    expect(terminal.getCell(width - 1, 2).ch).toBe("┤");
    expect(terminal.getCell(width - 1, rows.length - 1).ch).toBe("╯");
  });

  it("paints markdown table right borders at stable terminal columns with complex emoji", () => {
    const coder = "\u{1F468}\u{1F3FD}\u200D\u{1F4BB}";
    const rainbowFlag = "\u{1F3F3}\uFE0F\u200D\u{1F308}";
    const pirateFlag = "\u{1F3F4}\u200D\u2620\uFE0F";
    const keycapOne = "1\uFE0F\u20E3";
    const englandFlag = "\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}";
    const width = 40;
    const rows = buildMarkdownVisualRows(
      [
        "| Icon | Name |",
        "|---|---|",
        `| ${coder} | coder |`,
        `| ${rainbowFlag} | pride |`,
        `| ${pirateFlag} | pirate |`,
        `| ${keycapOne} | keycap |`,
        `| ${englandFlag} | england |`,
      ].join("\n"),
      width,
      createTuiMarkdownParser(),
    );
    const tableWidth = visualRowCells(rows[0]!);
    const terminal = createTerminal({ cols: width, rows: rows.length });

    rows.forEach((row, y) => {
      paintMarkdownVisualRow(terminal, row, {
        x: 0,
        y,
        w: width,
        baseStyle: {},
      });
    });

    expect(rows.every((row) => visualRowCells(row) === tableWidth)).toBe(true);
    expect(terminal.getCell(tableWidth - 1, 0).ch).toBe("╮");
    expect(terminal.getCell(tableWidth - 1, 1).ch).toBe("│");
    expect(terminal.getCell(tableWidth - 1, 2).ch).toBe("┤");
    expect(terminal.getCell(tableWidth - 1, rows.length - 1).ch).toBe("╯");
  });

  it("keeps table borders stable with hidden unicode and bidi controls", () => {
    const zeroWidthSpace = String.fromCodePoint(0x200b);
    const zwnj = String.fromCodePoint(0x200c);
    const rtlMark = String.fromCodePoint(0x200f);
    const rtlOverride = String.fromCodePoint(0x202e);
    const isolate = `${String.fromCodePoint(0x2066)}x${String.fromCodePoint(0x2069)}`;
    const rows = buildMarkdownVisualRows(
      [
        "| X | Name |",
        "|---|---|",
        `| ${zeroWidthSpace} | zwsp |`,
        `| ${zwnj} | zwnj |`,
        `| ${rtlMark} | rtl-mark |`,
        `| ${rtlOverride} | rtl-override |`,
        `| ${isolate} | isolate |`,
      ].join("\n"),
      50,
      createTuiMarkdownParser(),
    );
    const width = visualRowCells(rows[0]!);
    const terminal = createTerminal({ cols: 50, rows: rows.length });

    expect(rows.every((row) => visualRowCells(row) === width)).toBe(true);

    rows.forEach((row, y) => {
      paintMarkdownVisualRow(terminal, row, {
        x: 0,
        y,
        w: 50,
        baseStyle: {},
      });
    });

    expect(terminal.getCell(width - 1, 0).ch).toBe("╮");
    expect(terminal.getCell(width - 1, 1).ch).toBe("│");
    expect(terminal.getCell(width - 1, 2).ch).toBe("┤");
    expect(terminal.getCell(width - 1, rows.length - 1).ch).toBe("╯");
  });

  it("does not split wide emoji when table cells are clipped", () => {
    const rows = buildMarkdownVisualRows(
      ["| A |", "|---|", "| 😀 |"].join("\n"),
      5,
      createTuiMarkdownParser(),
    );

    expect(rows.map(visualRowCells)).toEqual([5, 5, 5, 5, 5]);
  });

  it("keeps the table right border when an emoji column is exactly wide enough", () => {
    const rows = buildMarkdownVisualRows(
      ["| 😀 |", "|---|", "| ok |"].join("\n"),
      6,
      createTuiMarkdownParser(),
    );

    expect(rows.map((row) => row.plainText)).toEqual([
      "╭────╮",
      "│ 😀 │",
      "├────┤",
      "│ ok │",
      "╰────╯",
    ]);
    expect(rows.every((row) => visualRowCells(row) === 6)).toBe(true);
  });

  it("pads a clipped wide emoji while keeping the table right border", () => {
    const rows = buildMarkdownVisualRows(
      ["| A |", "|---|", "| 😀 |"].join("\n"),
      5,
      createTuiMarkdownParser(),
    );
    const dataRow = rows[3];

    expect(rows.every((row) => visualRowCells(row) === 5)).toBe(true);
    expect(dataRow?.plainText).toBe("│   │");
    expect(dataRow?.plainText.endsWith("│")).toBe(true);
  });

  it("clips tables when viewport is narrower than the minimum border width", () => {
    const rows = buildMarkdownVisualRows(
      ["| A | B |", "|---|---|", "| x | y |"].join("\n"),
      5,
      createTuiMarkdownParser(),
    );

    expect(rows.every((row) => visualRowCells(row) <= 5)).toBe(true);
    expect(rows[0]?.plainText.endsWith("╮")).toBe(false);
    expect(rows[1]?.plainText.endsWith("│")).toBe(false);
    expect(rows.at(-1)?.plainText.endsWith("╯")).toBe(false);
  });

  it("does not insert an extra blank row before nested list items", () => {
    const rows = buildMarkdownVisualRows("- parent\n  - child", 40, createTuiMarkdownParser());
    expect(rows.map((row) => row.plainText)).toEqual(["- parent", "  - child"]);
  });

  it("reuses finalized paragraph rows when only the streaming tail paragraph changes", () => {
    const parser = createTuiMarkdownParser({ streaming: true });
    const firstBlocks = markdownAstToBlocks(
      parser.parse("first paragraph\n\nsecond", false),
      DEFAULT_TUI_MARKDOWN_THEME,
    );
    const first = layoutMarkdownBlocksCached(firstBlocks, 20);
    const nextBlocks = markdownAstToBlocks(
      parser.parse("first paragraph\n\nsecond updated", false),
      DEFAULT_TUI_MARKDOWN_THEME,
    );

    const next = layoutMarkdownBlocksCached(nextBlocks, 20, first.cache);

    expect(next.rows.map((row) => row.plainText)).toEqual([
      "first paragraph",
      "",
      "second updated",
    ]);
    expect(next.rows[0]).toBe(first.rows[0]);
    expect(next.rows[1]).toBe(first.rows[1]);
    expect(next.rows[2]).not.toBe(first.rows[2]);
  });

  it("reuses closed code fence rows when appending a following markdown block", () => {
    const parser = createTuiMarkdownParser({ streaming: true });
    const code = "intro\n\n```ts\nconst a = 1\n```";
    const firstBlocks = markdownAstToBlocks(parser.parse(code, false), DEFAULT_TUI_MARKDOWN_THEME);
    const first = layoutMarkdownBlocksCached(firstBlocks, 20);
    const nextBlocks = markdownAstToBlocks(
      parser.parse(`${code}\n\nnext paragraph`, false),
      DEFAULT_TUI_MARKDOWN_THEME,
    );

    const next = layoutMarkdownBlocksCached(nextBlocks, 20, first.cache);

    expect(next.rows.slice(0, first.rows.length).map((row) => row.plainText)).toEqual(
      first.rows.map((row) => row.plainText),
    );
    for (let index = 0; index < first.rows.length; index++) {
      expect(next.rows[index]).toBe(first.rows[index]);
    }
    expect(next.rows.at(-1)?.plainText).toBe("next paragraph");
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

  it("preserves code block tab indentation as spaces", () => {
    const rows = buildMarkdownVisualRows(
      "```ts\n\tconst a = 1\n```",
      40,
      createTuiMarkdownParser(),
    );
    expect(rows.some((row) => row.plainText.includes("    const a = 1"))).toBe(true);
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

  it("omits too-wide graphemes when the viewport is narrower than the glyph", () => {
    const rows = buildMarkdownVisualRows("你", 1, createTuiMarkdownParser());
    expect(rows.map((row) => row.plainText)).toEqual(["", ""]);
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

  it("keeps horizontal clipping aligned when it starts inside a styled wide glyph", () => {
    const writes: Array<{ text: string; x?: number; style?: Style }> = [];
    const terminal = {
      write(text: string, opts?: { x?: number; style?: Style }) {
        writes.push({ text, x: opts?.x, style: opts?.style });
      },
    } as unknown as Terminal;
    const segmentStyle = Object.freeze({ bold: true, href: "https://example.com" });
    const row = {
      key: "row-clip",
      blockKey: "block-clip",
      rowInBlock: 0,
      plainText: "你a",
      segments: [{ text: "你a", cells: 3, style: segmentStyle }],
    };

    paintMarkdownVisualRow(terminal, row, {
      x: 0,
      y: 0,
      w: 2,
      clipStart: 1,
      baseStyle: Object.freeze({ fg: "white" }),
    });

    expect(writes.map((entry) => [entry.text, entry.x])).toEqual([
      [" ", 0],
      ["a", 1],
    ]);
    expect(writes[0]?.style).toMatchObject({
      fg: "white",
      bold: true,
      href: "https://example.com",
    });
    expect(writes[1]?.style).toBe(writes[0]?.style);
  });
});
