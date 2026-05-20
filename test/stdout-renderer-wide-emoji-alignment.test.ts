import { describe, expect, it } from "vitest";
import { createTerminal } from "../src/index";
import { createStdoutRenderer } from "../src/renderer/cli/stdout-renderer";
import { buildMarkdownVisualRows } from "../src/vue/markdown/document.js";
import { createTuiMarkdownParser } from "../src/vue/markdown/parser.js";
import { paintMarkdownVisualRow } from "../src/vue/markdown/render.js";

describe("stdout renderer (wide emoji alignment)", () => {
  it("inserts a cursor fix after 2-cell emoji clusters", () => {
    const terminal = createTerminal({ cols: 20, rows: 1 });

    // Place a 2-cell emoji cluster, then a sentinel character.
    terminal.write("A⚠️B", { x: 0, y: 0 });
    terminal.commit();

    let frame = "";
    const renderer = createStdoutRenderer(terminal, {
      output: {
        isTTY: true,
        write: (chunk) => {
          frame += chunk;
        },
      },
      clear: false,
      hideCursor: false,
      altScreen: false,
      trackResize: false,
    });

    renderer.render();
    renderer.dispose();

    // After writing row 1, the emoji lead cell is at x=1 (0-based) and has width=2,
    // so the renderer should force the cursor to col=4 (1-based) to ensure alignment.
    expect(frame).toContain("\u001B[1;4H");
  });

  it("realigns wide glyphs in markdown table stdout output", () => {
    const check = "\u2705";
    const smile = "\u{1F600}";
    const coder = "\u{1F468}\u{1F3FD}\u200D\u{1F4BB}";
    const rainbowFlag = "\u{1F3F3}\uFE0F\u200D\u{1F308}";
    const keycapOne = "1\uFE0F\u20E3";
    const combiningE = "e\u0301";
    const rows = buildMarkdownVisualRows(
      [
        "| Icon | Name |",
        "|---|---|",
        `| ${check} | check |`,
        `| ${smile} | smile |`,
        `| ${coder} | coder |`,
        `| ${rainbowFlag} | pride |`,
        `| ${keycapOne} | keycap |`,
        "| 中文 | cjk |",
        `| ${combiningE} | combining |`,
      ].join("\n"),
      40,
      createTuiMarkdownParser(),
    );
    const terminal = createTerminal({ cols: 40, rows: rows.length });

    rows.forEach((row, y) => {
      paintMarkdownVisualRow(terminal, row, {
        x: 0,
        y,
        w: 40,
        baseStyle: {},
      });
    });
    terminal.commit();

    let frame = "";
    const renderer = createStdoutRenderer(terminal, {
      output: {
        isTTY: true,
        write: (chunk) => {
          frame += chunk;
        },
      },
      clear: false,
      hideCursor: false,
      altScreen: false,
      trackResize: false,
    });

    renderer.render();
    renderer.dispose();

    const expectedFixes: string[] = [];
    let checkFix = "";
    for (let y = 0; y < rows.length; y++) {
      for (let x = 0; x < 40; x++) {
        const cell = terminal.getCell(x, y);
        if (cell.continuation || cell.width !== 2 || cell.ch === " ") continue;
        const fix = `\u001B[${y + 1};${x + 1 + cell.width}H`;
        expectedFixes.push(fix);
        if (cell.ch === check) checkFix = fix;
      }
    }

    expect(checkFix).toBeTruthy();
    for (const fix of expectedFixes) expect(frame).toContain(fix);
  });

  it("realigns orphaned zero-width markdown table cells in stdout output", () => {
    const orphaned = [
      String.fromCodePoint(0x0301),
      String.fromCodePoint(0xfe0f),
      String.fromCodePoint(0x200d),
      String.fromCodePoint(0xe007f),
    ];
    const rows = buildMarkdownVisualRows(
      [
        "| X | Name |",
        "|---|---|",
        `| ${orphaned[0]} | combining |`,
        `| ${orphaned[1]} | vs16 |`,
        `| ${orphaned[2]} | zwj |`,
        `| ${orphaned[3]} | tag-end |`,
      ].join("\n"),
      40,
      createTuiMarkdownParser(),
    );
    const terminal = createTerminal({ cols: 40, rows: rows.length });

    rows.forEach((row, y) => {
      paintMarkdownVisualRow(terminal, row, {
        x: 0,
        y,
        w: 40,
        baseStyle: {},
      });
    });
    terminal.commit();

    let frame = "";
    const renderer = createStdoutRenderer(terminal, {
      output: {
        isTTY: true,
        write: (chunk) => {
          frame += chunk;
        },
      },
      clear: false,
      hideCursor: false,
      altScreen: false,
      trackResize: false,
    });

    renderer.render();
    renderer.dispose();

    const expectedFixes: string[] = [];
    for (let y = 0; y < rows.length; y++) {
      for (let x = 0; x < 40; x++) {
        const cell = terminal.getCell(x, y);
        if (cell.continuation || !orphaned.some((item) => cell.ch.includes(item))) continue;
        expect(cell.width).toBe(1);
        expectedFixes.push(`\u001B[${y + 1};${x + 1 + cell.width}H`);
      }
    }

    expect(expectedFixes).toHaveLength(orphaned.length);
    for (const fix of expectedFixes) expect(frame).toContain(fix);
  });
});
