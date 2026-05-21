import { describe, expect, it } from "vitest";
import { createTheme, linkifyTextSegments, TLinkifyText, TText } from "../src/index.js";
import { TLogView } from "../src/experimental.js";
import {
  defineComponent,
  h,
  mountTerminal,
  nextTick,
  ref,
  useRenderNode,
} from "./ui-regressions-support.js";

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

  it("uses link theme defaults and lets linkStyle override them", async () => {
    const theme = createTheme({ colors: { link: "blueBright" } });
    const mounted = await mountTerminal(
      () => [
        h(TLinkifyText, {
          x: 0,
          y: 0,
          w: 24,
          value: "https://example.com",
        }),
        h(TLinkifyText, {
          x: 0,
          y: 1,
          w: 24,
          value: "https://example.org",
          linkStyle: { fg: "greenBright" },
        }),
      ],
      28,
      3,
      { theme },
    );

    try {
      expect(mounted.terminal.getCell(0, 0).style.fg).toBe("blueBright");
      expect(mounted.terminal.getCell(0, 0).style.underline).toBe(true);
      expect(mounted.terminal.getCell(0, 1).style.fg).toBe("greenBright");
      expect(mounted.terminal.getCell(0, 1).style.underline).toBe(true);
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
    expect(linkifyTextSegments("src/foo.ts", { allowRelative: true })).toEqual([
      { text: "src/foo.ts" },
    ]);
    expect(linkifyTextSegments("3/4", { allowRelative: true })).toEqual([{ text: "3/4" }]);
  });

  it("keeps trailing punctuation outside link hrefs", () => {
    expect(linkifyTextSegments("see https://example.com/docs.")).toEqual([
      { text: "see " },
      { text: "https://example.com/docs", href: "https://example.com/docs" },
      { text: "." },
    ]);
    expect(linkifyTextSegments("open (https://example.com/docs).")).toEqual([
      { text: "open (" },
      { text: "https://example.com/docs", href: "https://example.com/docs" },
      { text: ")." },
    ]);
    expect(linkifyTextSegments("mail mailto:a@b.com.")).toEqual([
      { text: "mail " },
      { text: "mailto:a@b.com", href: "mailto:a@b.com" },
      { text: "." },
    ]);
    expect(linkifyTextSegments("see https://example.com/a_(b).")).toEqual([
      { text: "see " },
      { text: "https://example.com/a_(b)", href: "https://example.com/a_(b)" },
      { text: "." },
    ]);
  });

  it("ignores dirty rows outside its rect", async () => {
    const value = ref("https://example.com/a");
    const markerVersion = ref(0);
    const DirtyMarker = defineComponent({
      name: "LinkifyDirtyMarker",
      setup() {
        useRenderNode(() => ({
          rect: { x: 0, y: 2, w: 8, h: 1 },
          dirtyRowsHint: markerVersion.value > 0 ? [2] : undefined,
          deps: markerVersion.value,
          paint: () => {},
        }));
        return () => null;
      },
    });

    const mounted = await mountTerminal(
      () => [
        h(TText, { x: 0, y: 2, w: 8, value: "PERSIST" }),
        h(DirtyMarker),
        h(TLinkifyText, {
          x: 0,
          y: 0,
          zIndex: 10,
          w: 8,
          h: 1,
          value: value.value,
        }),
      ],
      20,
      4,
    );

    try {
      await nextTick();
      await Promise.resolve();
      expect(mounted.terminal.snapshot().lines[2]).toContain("PERSIST");

      value.value = "https://example.com/b";
      markerVersion.value++;
      await nextTick();
      await Promise.resolve();
      await nextTick();
      await Promise.resolve();

      expect(mounted.terminal.snapshot().lines[2]).toContain("PERSIST");
    } finally {
      mounted.unmount();
    }
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
