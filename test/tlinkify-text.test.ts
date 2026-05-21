import { describe, expect, it } from "vitest";
import { linkifyTextSegments, TLinkifyText } from "../src/index.js";
import { TLogView } from "../src/experimental.js";
import { h, mountTerminal } from "./ui-regressions-support.js";

describe("TLinkifyText", () => {
  it("detects safe absolute links and keeps surrounding text plain", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TLinkifyText, {
          x: 0,
          y: 0,
          w: 48,
          value: "see https://example.com now",
        }),
      48,
      2,
    );

    try {
      expect(mounted.terminal.snapshot().lines[0]).toContain("see https://example.com now");
      expect(mounted.terminal.getCell(0, 0).style.href).toBeUndefined();
      expect(mounted.terminal.getCell(4, 0).style.href).toBe("https://example.com/");
      expect(mounted.terminal.getCell(4, 0).style.underline).toBe(true);
    } finally {
      mounted.unmount();
    }
  });

  it("keeps href metadata across wrapped URL fragments", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TLinkifyText, {
          x: 0,
          y: 0,
          w: 10,
          h: 3,
          wrap: true,
          value: "https://example.com",
        }),
      12,
      4,
    );

    try {
      expect(mounted.terminal.getCell(0, 0).style.href).toBe("https://example.com/");
      expect(mounted.terminal.getCell(0, 1).style.href).toBe("https://example.com/");
    } finally {
      mounted.unmount();
    }
  });

  it("supports relative href detection only when opted in", () => {
    expect(linkifyTextSegments("see /docs", { allowRelative: false })).toEqual([
      { text: "see /docs" },
    ]);
    expect(linkifyTextSegments("see /docs", { allowRelative: true })).toEqual([
      { text: "see " },
      { text: "/docs", href: "/docs" },
    ]);
  });

  it("lets TLogView opt into URL linkification without ANSI OSC8 input", async () => {
    const source = {
      lineCount: () => 1,
      getLine: () => "open https://example.com",
    };
    const mounted = await mountTerminal(
      () =>
        h(TLogView, {
          x: 0,
          y: 0,
          w: 40,
          h: 2,
          source,
          version: 1,
          linkify: true,
        }),
      40,
      3,
    );

    try {
      expect(mounted.terminal.getCell(5, 0).style.href).toBe("https://example.com/");
      expect(mounted.terminal.getCell(5, 0).style.underline).toBe(true);
    } finally {
      mounted.unmount();
    }
  });
});
