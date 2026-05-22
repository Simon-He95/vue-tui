import type {
  TLogViewLinkActivatePayload,
  TLogViewLinkClickPayload,
  TLogViewLinkFocusPayload,
  TLogViewHandle,
} from "../src/experimental.js";
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
  it("returns no public linkify segments for empty input", () => {
    expect(linkifyTextSegments("")).toEqual([]);
  });

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
    expect(linkifyTextSegments("C:/Users/me/project", { allowRelative: true })).toEqual([
      { text: "C:/Users/me/project" },
    ]);
    expect(linkifyTextSegments("key:/path", { allowRelative: true })).toEqual([
      { text: "key:/path" },
    ]);
    expect(linkifyTextSegments("GET / 200", { allowRelative: true })).toEqual([
      { text: "GET / 200" },
    ]);
    expect(linkifyTextSegments("see ?", { allowRelative: true })).toEqual([{ text: "see ?" }]);
    expect(linkifyTextSegments("see #", { allowRelative: true })).toEqual([{ text: "see #" }]);
    expect(linkifyTextSegments("see /,", { allowRelative: true })).toEqual([{ text: "see /," }]);
    expect(linkifyTextSegments("see ?.", { allowRelative: true })).toEqual([{ text: "see ?." }]);
    expect(linkifyTextSegments("see #.", { allowRelative: true })).toEqual([{ text: "see #." }]);
    expect(linkifyTextSegments("see ./docs", { allowRelative: true })).toEqual([
      { text: "see " },
      { text: "./docs", href: "./docs" },
    ]);
    expect(linkifyTextSegments("see ../docs", { allowRelative: true })).toEqual([
      { text: "see " },
      { text: "../docs", href: "../docs" },
    ]);
    expect(linkifyTextSegments("see #section", { allowRelative: true })).toEqual([
      { text: "see " },
      { text: "#section", href: "#section" },
    ]);
    expect(linkifyTextSegments("see ?tab=api", { allowRelative: true })).toEqual([
      { text: "see " },
      { text: "?tab=api", href: "?tab=api" },
    ]);
  });

  it("does not expose file URL linkification through public protocols", () => {
    expect(linkifyTextSegments("open file:///tmp/a.txt", { protocols: ["file" as any] })).toEqual([
      { text: "open file:///tmp/a.txt" },
    ]);
    expect(
      linkifyTextSegments("open file:///tmp/a.txt", {
        allowRelative: true,
        protocols: ["file" as any],
      }),
    ).toEqual([{ text: "open file:///tmp/a.txt" }]);
  });

  it("filters public linkification protocols", () => {
    expect(linkifyTextSegments("http://a.test", { protocols: ["https"] })).toEqual([
      { text: "http://a.test" },
    ]);
  });

  it("skips links longer than the configured maximum length", () => {
    expect(linkifyTextSegments("https://example.com/very-long", { maxUrlLength: 8 })).toEqual([
      { text: "https://example.com/very-long" },
    ]);
    expect(
      linkifyTextSegments("see https://a.co/x.", { maxUrlLength: "https://a.co/x".length }),
    ).toEqual([
      { text: "see " },
      { text: "https://a.co/x", href: "https://a.co/x" },
      { text: "." },
    ]);
  });

  it("requires a text boundary before absolute links", () => {
    expect(linkifyTextSegments("foohttps://example.com")).toEqual([
      { text: "foohttps://example.com" },
    ]);
    expect(linkifyTextSegments("url=https://example.com")).toEqual([
      { text: "url=" },
      { text: "https://example.com", href: "https://example.com/" },
    ]);
    expect(linkifyTextSegments('url="https://example.com"')).toEqual([
      { text: 'url="' },
      { text: "https://example.com", href: "https://example.com/" },
      { text: '"' },
    ]);
    expect(linkifyTextSegments("open 'https://example.com'")).toEqual([
      { text: "open '" },
      { text: "https://example.com", href: "https://example.com/" },
      { text: "'" },
    ]);
    expect(linkifyTextSegments("`https://example.com`")).toEqual([
      { text: "`" },
      { text: "https://example.com", href: "https://example.com/" },
      { text: "`" },
    ]);
  });

  it("keeps an invalid URL candidate plain before a later valid URL", () => {
    expect(linkifyTextSegments("foohttps://bad.test then https://ok.test")).toEqual([
      { text: "foohttps://bad.test then " },
      { text: "https://ok.test", href: "https://ok.test/" },
    ]);
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
    expect(linkifyTextSegments("see https://example.com.)")).toEqual([
      { text: "see " },
      { text: "https://example.com", href: "https://example.com/" },
      { text: ".)" },
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
    expect(linkifyTextSegments("see https://example.com/path?x=1#top")).toEqual([
      { text: "see " },
      {
        text: "https://example.com/path?x=1#top",
        href: "https://example.com/path?x=1#top",
      },
    ]);
    expect(linkifyTextSegments("文档：https://example.com。")).toEqual([
      { text: "文档：" },
      { text: "https://example.com", href: "https://example.com/" },
      { text: "。" },
    ]);
    expect(linkifyTextSegments("打开（https://example.com/docs）")).toEqual([
      { text: "打开（" },
      { text: "https://example.com/docs", href: "https://example.com/docs" },
      { text: "）" },
    ]);
    expect(linkifyTextSegments("参考：https://example.com/docs，继续")).toEqual([
      { text: "参考：" },
      { text: "https://example.com/docs", href: "https://example.com/docs" },
      { text: "，继续" },
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

  it("matches TText wrapping for wide glyphs in a one-cell column", async () => {
    const mounted = await mountTerminal(
      () => [
        h(TText, {
          x: 0,
          y: 0,
          w: 1,
          h: 1,
          wrap: true,
          value: "中",
        }),
        h(TLinkifyText, {
          x: 0,
          y: 1,
          w: 1,
          h: 1,
          wrap: true,
          value: "中",
        }),
      ],
      2,
      3,
    );

    try {
      expect(mounted.terminal.snapshot().lines[0]).toBe("  ");
      expect(mounted.terminal.snapshot().lines[1]).toBe("  ");
      expect(mounted.terminal.getCell(0, 1).style.href).toBeUndefined();
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

  it("emits linkClick for TLogView linkified URL cells", async () => {
    const payloads: TLogViewLinkClickPayload[] = [];
    const source = {
      lineCount: () => 1,
      getLine: () => "open https://example.com",
      getLineKey: () => "url",
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
          onLinkClick: (payload: TLogViewLinkClickPayload) => payloads.push(payload),
        }),
      40,
      3,
    );

    try {
      mounted
        .container()!
        .dispatchEvent(new MouseEvent("click", { clientX: 5, clientY: 0, bubbles: true }));

      expect(payloads[0]).toMatchObject({
        href: "https://example.com/",
        text: "https://example.com",
        absoluteLineIndex: 0,
        index: 0,
        startCell: 5,
        cellX: 5,
        cellY: 0,
      });
    } finally {
      mounted.unmount();
    }
  });

  it("clears TLogView visible link state when linkify is disabled", async () => {
    const logView = ref<TLogViewHandle | null>(null);
    const linkify = ref(true);
    const payloads: TLogViewLinkClickPayload[] = [];
    const source = {
      lineCount: () => 1,
      getLine: () => "open https://example.com",
      getLineKey: () => "url",
    };
    const mounted = await mountTerminal(
      () =>
        h(TLogView, {
          ref: logView,
          x: 0,
          y: 0,
          w: 40,
          h: 2,
          source,
          version: 1,
          linkify: linkify.value,
          onLinkClick: (payload: TLogViewLinkClickPayload) => payloads.push(payload),
        }),
      40,
      3,
    );

    try {
      expect(logView.value?.getVisibleLinks()).toHaveLength(1);
      mounted
        .container()!
        .dispatchEvent(new MouseEvent("click", { clientX: 5, clientY: 0, bubbles: true }));
      expect(payloads).toHaveLength(1);

      payloads.length = 0;
      linkify.value = false;
      await nextTick();
      mounted.scheduler()?.flushNow();

      expect(logView.value?.getVisibleLinks()).toEqual([]);
      expect(mounted.terminal.getCell(5, 0).style.href).toBeUndefined();

      mounted
        .container()!
        .dispatchEvent(new MouseEvent("click", { clientX: 5, clientY: 0, bubbles: true }));
      expect(payloads).toEqual([]);
    } finally {
      mounted.unmount();
    }
  });

  it("focuses and activates TLogView linkified URLs with keyboardLinks", async () => {
    const focusPayloads: TLogViewLinkFocusPayload[] = [];
    const activatePayloads: TLogViewLinkActivatePayload[] = [];
    const source = {
      lineCount: () => 1,
      getLine: () => "open https://example.com",
      getLineKey: () => "url",
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
          keyboardLinks: true,
          autoFocus: true,
          onLinkFocus: (payload: TLogViewLinkFocusPayload) => focusPayloads.push(payload),
          onLinkActivate: (payload: TLogViewLinkActivatePayload) => activatePayloads.push(payload),
        }),
      40,
      3,
    );

    try {
      const container = mounted.container()!;
      container.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Tab",
          code: "Tab",
          bubbles: true,
          cancelable: true,
        }),
      );
      await nextTick();
      mounted.scheduler()?.flushNow();

      expect(focusPayloads[0]?.link?.href).toBe("https://example.com/");
      expect(mounted.terminal.getCell(5, 0).style.inverse).toBe(true);

      container.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          bubbles: true,
          cancelable: true,
        }),
      );
      await nextTick();

      expect(activatePayloads[0]).toMatchObject({
        link: {
          href: "https://example.com/",
          text: "https://example.com",
          focused: true,
        },
        source: "keyboard",
      });
    } finally {
      mounted.unmount();
    }
  });

  it("uses link theme defaults for TLogView linkified links", async () => {
    const theme = createTheme({ colors: { link: "blueBright" } });
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
      { theme },
    );

    try {
      expect(mounted.terminal.getCell(5, 0).style.fg).toBe("blueBright");
      expect(mounted.terminal.getCell(5, 0).style.underline).toBe(true);
    } finally {
      mounted.unmount();
    }
  });

  it("honors disabled link underline theme for TLogView linkified links", async () => {
    const theme = createTheme({
      components: {
        TLink: { underline: false },
      },
    });
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
      { theme },
    );

    try {
      expect(mounted.terminal.getCell(5, 0).style.underline).toBe(false);
    } finally {
      mounted.unmount();
    }
  });

  it("keeps TLogView linkified href metadata across wrapped visual rows", async () => {
    const source = {
      lineCount: () => 1,
      getLine: () => "https://example.com",
      getLineKey: () => "url",
    };
    const mounted = await mountTerminal(
      () =>
        h(TLogView, {
          x: 0,
          y: 0,
          w: 10,
          h: 3,
          source,
          version: 1,
          wrap: true,
          linkify: true,
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
});
