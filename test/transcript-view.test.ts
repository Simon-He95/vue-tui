import { describe, expect, it, vi } from "vitest";
import { createTerminalApp } from "../src/cli.js";
import {
  TTranscriptView,
  type TTranscriptDataSource,
  type TTranscriptRow,
  type TTranscriptViewHandle,
} from "../src/experimental.js";
import { transcriptActionRegionId, transcriptLinkRegionId } from "../src/vue/transcript/layout.js";
import {
  defineComponent,
  h,
  mountTerminal,
  nextTick,
  ref,
  TRenderPlane,
  TText,
  TView,
  useTerminal,
} from "./ui-regressions-support.js";
import { installManualRaf } from "./helpers/manual-raf.js";

function createSource(rows: readonly TTranscriptRow[]): TTranscriptDataSource {
  return {
    rowCount: () => rows.length,
    getRow: (index) => rows[index]!,
  };
}

function rowText(
  mounted: { terminal: { getRow: (y: number) => readonly { ch: string }[] } },
  y: number,
): string {
  return mounted.terminal
    .getRow(y)
    .map((cell) => cell.ch)
    .join("")
    .trimEnd();
}

function cellStyle(
  mounted: { terminal: { getRow: (y: number) => readonly { style: Record<string, unknown> }[] } },
  x: number,
  y: number,
): Record<string, unknown> {
  return mounted.terminal.getRow(y)[x]?.style ?? {};
}

function installNavigatorClipboard(writes: string[]): () => void {
  const previous = (navigator as any).clipboard;
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      readText: vi.fn(async () => writes[writes.length - 1] ?? ""),
      writeText: vi.fn(async (text: string) => {
        writes.push(text);
      }),
    },
  });
  return () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: previous,
    });
  };
}

async function settleClipboard(): Promise<void> {
  await nextTick();
  await Promise.resolve();
}

async function copyTranscriptSelection(
  options: Readonly<{
    rows: readonly TTranscriptRow[];
    w: number;
    h: number;
    wrap?: boolean;
    start: { x: number; y: number };
    end: { x: number; y: number };
  }>,
): Promise<string> {
  const writes: string[] = [];
  const restore = installNavigatorClipboard(writes);
  const mounted = await mountTerminal(
    () =>
      h(TTranscriptView, {
        x: 0,
        y: 0,
        w: options.w,
        h: options.h,
        source: createSource(options.rows),
        version: 1,
        wrap: options.wrap,
        selectable: true,
      }),
    options.w,
    options.h,
    { selection: true },
  );

  try {
    const container = mounted.container()!;
    container.dispatchEvent(
      new MouseEvent("mousedown", {
        clientX: options.start.x,
        clientY: options.start.y,
        bubbles: true,
      }),
    );
    container.dispatchEvent(
      new MouseEvent("mousemove", {
        clientX: options.end.x,
        clientY: options.end.y,
        bubbles: true,
      }),
    );
    container.dispatchEvent(
      new MouseEvent("mouseup", { clientX: options.end.x, clientY: options.end.y, bubbles: true }),
    );
    await settleClipboard();
    return writes[0] ?? "";
  } finally {
    mounted.unmount();
    restore();
  }
}

describe("TTranscriptView", () => {
  it("generates unambiguous hit region ids for structured keys", () => {
    expect(transcriptActionRegionId("a:b", "c")).not.toBe(transcriptActionRegionId("a", "b:c"));
    expect(transcriptLinkRegionId("a:b", 0, "c")).not.toBe(transcriptLinkRegionId("a", 0, "b:c"));
    expect(transcriptLinkRegionId("a:0", 1)).not.toBe(transcriptLinkRegionId("a", 0, "0:1"));
  });

  it("copies wrapped visual rows without repeating the full message", async () => {
    const rows: TTranscriptRow[] = [
      {
        kind: "message",
        key: "msg",
        segments: [{ text: "abcdef" }],
      },
    ];
    await expect(
      copyTranscriptSelection({
        rows,
        w: 3,
        h: 2,
        wrap: true,
        start: { x: 0, y: 0 },
        end: { x: 2, y: 0 },
      }),
    ).resolves.toBe("abc");
    await expect(
      copyTranscriptSelection({
        rows,
        w: 3,
        h: 2,
        wrap: true,
        start: { x: 0, y: 1 },
        end: { x: 2, y: 1 },
      }),
    ).resolves.toBe("def");
    await expect(
      copyTranscriptSelection({
        rows,
        w: 3,
        h: 2,
        wrap: true,
        start: { x: 0, y: 0 },
        end: { x: 2, y: 1 },
      }),
    ).resolves.toBe("abc\ndef");
  });

  it("copies selectable text after non-selectable cells without coordinate drift", async () => {
    await expect(
      copyTranscriptSelection({
        rows: [
          {
            kind: "message",
            key: "msg",
            segments: [{ text: "AA" }, { text: "XX", selectable: false }, { text: "BB" }],
          },
        ],
        w: 6,
        h: 1,
        start: { x: 4, y: 0 },
        end: { x: 5, y: 0 },
      }),
    ).resolves.toBe("BB");
  });

  it("waits for parent-controlled scrollTop before repainting", async () => {
    const raf = installManualRaf();
    const updates: number[] = [];
    const scrolls: number[] = [];
    const rows = Array.from(
      { length: 20 },
      (_, index): TTranscriptRow => ({
        kind: "message",
        key: index,
        segments: [{ text: `row-${index}` }],
      }),
    );
    const App = defineComponent({
      name: "TranscriptControlledScrollApp",
      setup() {
        return () =>
          h(TTranscriptView, {
            x: 0,
            y: 0,
            w: 10,
            h: 2,
            source: createSource(rows),
            version: 1,
            scrollTop: 0,
            autoFocus: true,
            onScroll: (payload: { scrollTop: number }) => {
              scrolls.push(payload.scrollTop);
            },
            "onUpdate:scrollTop": (value: number) => {
              updates.push(value);
            },
          });
      },
    });
    const app = createTerminalApp({ cols: 10, rows: 4, component: App });

    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();
      expect(rowText(app, 0)).toBe("row-0");

      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 100, time: 1_000 });
      expect(raf.pending()).toBe(1);
      raf.runNext();
      await nextTick();
      app.scheduler.flushNow();

      expect(updates).toEqual([1]);
      expect(scrolls).toEqual([1]);
      expect(rowText(app, 0)).toBe("row-0");
    } finally {
      app.dispose();
      raf.restore();
    }
  });

  it("uses row scroll operations for parent-controlled full-row scroll", async () => {
    const raf = installManualRaf();
    const scrollTop = ref(0);
    const rows = Array.from(
      { length: 20 },
      (_, index): TTranscriptRow => ({
        kind: "message",
        key: index,
        segments: [{ text: `row-${index}` }],
      }),
    );
    const App = defineComponent({
      name: "TranscriptControlledScrollOperationApp",
      setup() {
        return () =>
          h(TTranscriptView, {
            x: 0,
            y: 0,
            w: 10,
            h: 3,
            source: createSource(rows),
            version: 1,
            scrollTop: scrollTop.value,
            autoFocus: true,
            rowScrollMode: "unsafe-full-row",
            "onUpdate:scrollTop": (value: number) => {
              scrollTop.value = value;
            },
          });
      },
    });
    const app = createTerminalApp({ cols: 10, rows: 5, component: App });

    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();
      expect(rowText(app, 0)).toBe("row-0");

      const commits: Array<{
        dirtyRows: readonly number[] | null;
        scrollOperations: unknown;
      }> = [];
      const off = app.terminal.on("commit", ({ dirtyRows, scrollOperations }) => {
        commits.push({ dirtyRows, scrollOperations: scrollOperations ?? null });
      });

      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 100, time: 1_000 });
      expect(raf.pending()).toBe(1);
      raf.runNext();
      await nextTick();
      app.scheduler.flushNow();

      off();
      expect(rowText(app, 0)).toBe("row-1");
      expect(rowText(app, 2)).toBe("row-3");
      expect(commits).toEqual([
        { dirtyRows: [2], scrollOperations: [{ startY: 0, endY: 3, delta: 1 }] },
      ]);
    } finally {
      app.dispose();
      raf.restore();
    }
  });

  it("does not focus or click disabled actions", async () => {
    const actionClick = vi.fn();
    const viewRef = ref<TTranscriptViewHandle | null>(null);
    const row: TTranscriptRow = {
      kind: "approval",
      key: "approval",
      title: "Allow?",
      actions: [{ id: "approve", label: "Approve", disabled: true }],
    };
    const App = defineComponent({
      name: "TranscriptDisabledActionApp",
      setup() {
        return () =>
          h(TTranscriptView, {
            ref: viewRef,
            x: 0,
            y: 0,
            w: 24,
            h: 2,
            source: createSource([row]),
            version: 1,
            onActionClick: actionClick,
          });
      },
    });
    const app = createTerminalApp({ cols: 24, rows: 4, component: App });

    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();
      const firstRow = rowText(app, 0);
      const actionX = firstRow.indexOf("[Approve]");
      expect(actionX).toBeGreaterThanOrEqual(0);

      app.events.dispatch({ type: "click", cellX: actionX, cellY: 0, time: 1_000 } as any);
      expect(viewRef.value?.focusNextRegion()).toBe(false);
      expect(viewRef.value?.activateFocusedRegion()).toBe(false);
      expect(actionClick).not.toHaveBeenCalled();
    } finally {
      app.dispose();
    }
  });

  it("handles visible regions with Tab, Enter, and Escape when enabled", async () => {
    const actionClick = vi.fn();
    const rows: TTranscriptRow[] = [
      {
        kind: "approval",
        key: "approval",
        title: "Allow?",
        actions: [
          { id: "first", label: "First" },
          { id: "second", label: "Second" },
        ],
      },
    ];
    const App = defineComponent({
      name: "TranscriptKeyboardRegionsApp",
      setup() {
        return () =>
          h(TTranscriptView, {
            x: 0,
            y: 0,
            w: 32,
            h: 1,
            source: createSource(rows),
            version: 1,
            autoFocus: true,
            onActionClick: actionClick,
          });
      },
    });
    const app = createTerminalApp({ cols: 32, rows: 3, component: App });

    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "keydown", key: "Tab", code: "Tab", time: 1_000 } as any);
      app.events.dispatch({ type: "keydown", key: "Enter", code: "Enter", time: 1_001 } as any);
      app.events.dispatch({
        type: "keydown",
        key: "Tab",
        code: "Tab",
        shiftKey: true,
        time: 1_002,
      } as any);
      app.events.dispatch({ type: "keydown", key: "Enter", code: "Enter", time: 1_003 } as any);
      app.events.dispatch({ type: "keydown", key: "Escape", code: "Escape", time: 1_004 } as any);
      app.events.dispatch({ type: "keydown", key: "Enter", code: "Enter", time: 1_005 } as any);

      expect(actionClick.mock.calls.map(([event]) => event.region.payload.actionId)).toEqual([
        "first",
        "second",
      ]);
    } finally {
      app.dispose();
    }
  });

  it("does not intercept region keyboard handling when keyboardRegions is disabled", async () => {
    const actionClick = vi.fn();
    const rows: TTranscriptRow[] = [
      {
        kind: "approval",
        key: "approval",
        title: "Allow?",
        actions: [{ id: "approve", label: "Approve" }],
      },
    ];
    const App = defineComponent({
      name: "TranscriptKeyboardRegionsDisabledApp",
      setup() {
        return () =>
          h(TTranscriptView, {
            x: 0,
            y: 0,
            w: 32,
            h: 1,
            source: createSource(rows),
            version: 1,
            autoFocus: true,
            keyboardRegions: false,
            onActionClick: actionClick,
          });
      },
    });
    const app = createTerminalApp({ cols: 32, rows: 3, component: App });

    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "keydown", key: "Tab", code: "Tab", time: 1_000 } as any);
      app.events.dispatch({ type: "keydown", key: "Enter", code: "Enter", time: 1_001 } as any);

      expect(actionClick).not.toHaveBeenCalled();
    } finally {
      app.dispose();
    }
  });

  it("emits foldToggle from collapsed and expanded tool-call header clicks", async () => {
    const foldToggle = vi.fn();
    const rows: TTranscriptRow[] = [
      {
        kind: "tool-call",
        key: "collapsed",
        title: "read_file",
        collapsed: true,
        summary: [{ text: "src/index.ts" }],
      },
      {
        kind: "tool-call",
        key: "expanded",
        title: "run_tests",
        collapsed: false,
        body: [{ text: "passed" }],
      },
    ];
    const App = defineComponent({
      name: "TranscriptToolFoldApp",
      setup() {
        return () =>
          h(TTranscriptView, {
            x: 0,
            y: 0,
            w: 32,
            h: 2,
            source: createSource(rows),
            version: 1,
            onFoldToggle: foldToggle,
          });
      },
    });
    const app = createTerminalApp({ cols: 32, rows: 4, component: App });

    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "click", cellX: 0, cellY: 0, time: 1_000 } as any);
      app.events.dispatch({ type: "click", cellX: 0, cellY: 1, time: 1_001 } as any);

      expect(foldToggle).toHaveBeenCalledTimes(2);
      expect(foldToggle.mock.calls.map(([event]) => event.row.key)).toEqual([
        "collapsed",
        "expanded",
      ]);
      expect(foldToggle.mock.calls.map(([event]) => event.region.kind)).toEqual([
        "fold-toggle",
        "fold-toggle",
      ]);
    } finally {
      app.dispose();
    }
  });

  it("emits toolClick from tool-call body regions", async () => {
    const toolClick = vi.fn();
    const row: TTranscriptRow = {
      kind: "tool-call",
      key: "tool",
      title: "run_tests",
      collapsed: false,
      body: [{ text: "passed" }],
    };
    const App = defineComponent({
      name: "TranscriptToolClickApp",
      setup() {
        return () =>
          h(TTranscriptView, {
            x: 0,
            y: 0,
            w: 32,
            h: 1,
            source: createSource([row]),
            version: 1,
            onToolClick: toolClick,
          });
      },
    });
    const app = createTerminalApp({ cols: 32, rows: 3, component: App });

    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      const bodyX = rowText(app, 0).indexOf("passed");
      expect(bodyX).toBeGreaterThanOrEqual(0);
      app.events.dispatch({ type: "click", cellX: bodyX, cellY: 0, time: 1_000 } as any);

      expect(toolClick).toHaveBeenCalledTimes(1);
      expect(toolClick.mock.calls[0]?.[0].region.kind).toBe("tool-call");
      expect(toolClick.mock.calls[0]?.[0].row).toBe(row);
    } finally {
      app.dispose();
    }
  });

  it("repaints every wrapped visual row for hovered and focused links", async () => {
    const viewRef = ref<TTranscriptViewHandle | null>(null);
    const row: TTranscriptRow = {
      kind: "message",
      key: "msg",
      segments: [{ text: "abcdef", href: "https://example.com" }],
    };
    const App = defineComponent({
      name: "TranscriptWrappedLinkRepaintApp",
      setup() {
        return () =>
          h(TTranscriptView, {
            ref: viewRef,
            x: 0,
            y: 0,
            w: 3,
            h: 2,
            source: createSource([row]),
            version: 1,
            wrap: true,
            hoverStyle: { inverse: true },
            focusStyle: { underline: true },
          });
      },
    });
    const app = createTerminalApp({ cols: 3, rows: 3, component: App });

    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();
      expect(rowText(app, 0)).toBe("abc");
      expect(rowText(app, 1)).toBe("def");

      app.events.dispatch({ type: "pointermove", cellX: 0, cellY: 0, time: 1_000 } as any);
      await nextTick();
      app.scheduler.flushNow();

      expect(cellStyle(app, 0, 0)).toMatchObject({ inverse: true });
      expect(cellStyle(app, 0, 1)).toMatchObject({ inverse: true });

      expect(viewRef.value?.focusNextRegion()).toBe(true);
      await nextTick();
      app.scheduler.flushNow();

      expect(cellStyle(app, 0, 0)).toMatchObject({ underline: true });
      expect(cellStyle(app, 0, 1)).toMatchObject({ underline: true });
    } finally {
      app.dispose();
    }
  });

  it("clears hovered regions when they leave the visible viewport", async () => {
    const hoverRegion = vi.fn();
    const viewRef = ref<TTranscriptViewHandle | null>(null);
    const rows: TTranscriptRow[] = [
      {
        kind: "approval",
        key: "approval",
        title: "Allow?",
        actions: [{ id: "approve", label: "Approve" }],
      },
      {
        kind: "message",
        key: "next",
        segments: [{ text: "next" }],
      },
    ];
    const App = defineComponent({
      name: "TranscriptHoverReconcileApp",
      setup() {
        return () =>
          h(TTranscriptView, {
            ref: viewRef,
            x: 0,
            y: 0,
            w: 32,
            h: 1,
            source: createSource(rows),
            version: 1,
            onHoverRegion: hoverRegion,
          });
      },
    });
    const app = createTerminalApp({ cols: 32, rows: 3, component: App });

    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      const actionX = rowText(app, 0).indexOf("[Approve]");
      expect(actionX).toBeGreaterThanOrEqual(0);
      app.events.dispatch({ type: "pointermove", cellX: actionX, cellY: 0, time: 1_000 } as any);
      await nextTick();
      expect(viewRef.value?.getHoveredRegion()?.id).toBe(
        transcriptActionRegionId("approval", "approve"),
      );

      viewRef.value?.scrollToRow(1);
      await nextTick();
      app.scheduler.flushNow();

      expect(viewRef.value?.getHoveredRegion()).toBeNull();
      expect(hoverRegion.mock.calls.at(-1)?.[0]).toBeNull();
    } finally {
      app.dispose();
    }
  });

  it("warns in debug perf mode when transcript rows flatten past the prototype bound", async () => {
    const previousDebugPerf = (globalThis as any).__VT_DEBUG_PERF__;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    (globalThis as any).__VT_DEBUG_PERF__ = true;
    const rows = Array.from(
      { length: 5001 },
      (_, index): TTranscriptRow => ({
        kind: "message",
        key: index,
        segments: [{ text: `row-${index}` }],
      }),
    );
    const App = defineComponent({
      name: "TranscriptLargeFlattenWarningApp",
      setup() {
        return () =>
          h(TTranscriptView, {
            x: 0,
            y: 0,
            w: 16,
            h: 1,
            source: createSource(rows),
            version: 1,
            wrap: true,
          });
      },
    });
    const app = createTerminalApp({ cols: 16, rows: 2, component: App });

    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      expect(warn).toHaveBeenCalledWith(
        "[vue-tui] TTranscriptView flattens all transcript rows; use TLogView or windowed source for large retained output.",
      );
    } finally {
      app.dispose();
      warn.mockRestore();
      if (previousDebugPerf === undefined) delete (globalThis as any).__VT_DEBUG_PERF__;
      else (globalThis as any).__VT_DEBUG_PERF__ = previousDebugPerf;
    }
  });

  it("matches the best-agent ChatMessages source shape with stable row versions", async () => {
    const lines = [
      {
        messageId: "u1",
        role: "user" as const,
        text: "User: inspect the renderer",
        version: 1,
        style: { fg: "white" as const, bg: "blackBright" as const },
      },
      {
        messageId: "a1",
        role: "assistant" as const,
        text: "Assistant: reading visible transcript rows",
        version: 1,
        style: { fg: "white" as const, bg: "black" as const },
      },
      {
        messageId: "tool1",
        role: "tool" as const,
        text: "tool: stdout chunk completed",
        version: 1,
        style: { fg: "cyanBright" as const, bg: "black" as const },
      },
    ];
    const transcriptVersion = ref(1);
    const windowStyle = { bg: "black" as const };
    const hoverStyle = { underline: true };
    const componentSamples: any[] = [];
    let rowBuilds = 0;

    function lineToTranscriptRow(index: number): TTranscriptRow {
      rowBuilds++;
      const line = lines[index];
      if (!line) {
        return {
          kind: "message",
          key: `empty:${index}`,
          segments: [],
          selectableText: "",
        };
      }
      return {
        kind: "message",
        key: `${index}:${line.messageId}`,
        role: line.role,
        segments: [
          { text: "  ", style: windowStyle, selectable: false },
          { text: line.text.padEnd(38), style: line.style },
        ],
        selectableText: `  ${line.text}`,
        meta: { line },
      };
    }

    const source: TTranscriptDataSource = {
      rowCount: () => lines.length,
      getRow: lineToTranscriptRow,
      getRowKey: (index) => {
        const line = lines[index];
        return line ? `${index}:${line.messageId}` : `empty:${index}`;
      },
      getRowVersion: (index) => lines[index]?.version ?? 0,
    };

    const App = defineComponent({
      name: "BestAgentChatShapeProbe",
      setup() {
        const { observability } = useTerminal();
        observability.framePerf.enabled.value = true;
        observability.framePerf.addSink({
          onFramePerf: () => {},
          onComponentPerf: (sample) => componentSamples.push(sample),
        });
        return () =>
          h(TView, { x: 0, y: 0, w: 44, h: 8, focusable: false }, () => [
            h(TRenderPlane, { plane: "transcript" }, () => [
              h(TView, { x: 0, y: 1, w: 44, h: 3, zIndex: 1, selectable: true }, () =>
                h(TTranscriptView, {
                  key: "messages-transcript",
                  x: 0,
                  y: 0,
                  w: 44,
                  h: 3,
                  zIndex: 1,
                  source,
                  version: transcriptVersion.value,
                  scrollTop: 0,
                  style: windowStyle,
                  hoverStyle,
                  focusable: false,
                  selectable: false,
                  wheelScroll: false,
                  wrap: false,
                  rowScrollMode: "unsafe-full-row",
                }),
              ),
            ]),
            h(TRenderPlane, { plane: "chrome" }, () => [
              h(TText, {
                x: 0,
                y: 0,
                w: 44,
                value: "best-agent chat header",
                style: { fg: "white", bg: "blackBright" },
              }),
            ]),
          ]);
      },
    });
    const app = createTerminalApp({ cols: 44, rows: 8, component: App });

    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();
      expect(rowText(app, 1)).toContain("User: inspect the renderer");

      componentSamples.length = 0;
      rowBuilds = 0;
      transcriptVersion.value++;
      await nextTick();
      app.scheduler.flushNow();

      const transcriptSample = componentSamples
        .slice()
        .reverse()
        .find((sample) => sample.name === "TTranscriptView" && sample.phase === "layout");
      expect(rowBuilds).toBe(0);
      expect(transcriptSample).toMatchObject({
        itemCount: lines.length,
        cacheHit: lines.length,
        cacheMiss: 0,
        width: 44,
      });

      componentSamples.length = 0;
      rowBuilds = 0;
      lines[1]!.text = "Assistant: streamed update";
      lines[1]!.version++;
      transcriptVersion.value++;
      await nextTick();
      app.scheduler.flushNow();

      const updatedTranscriptSample = componentSamples
        .slice()
        .reverse()
        .find((sample) => sample.name === "TTranscriptView" && sample.phase === "layout");
      expect(rowText(app, 2)).toContain("Assistant: streamed update");
      expect(rowBuilds).toBe(1);
      expect(updatedTranscriptSample).toMatchObject({
        itemCount: lines.length,
        cacheHit: lines.length - 1,
        cacheMiss: 1,
        width: 44,
      });
    } finally {
      app.dispose();
    }
  });

  it("only reads visible fixed-height transcript rows after version updates", async () => {
    const lines = Array.from({ length: 1000 }, (_, index) => ({
      key: `line-${index}`,
      version: 1,
      text: `row-${index}`,
    }));
    const transcriptVersion = ref(1);
    let rowBuilds = 0;
    let rowVersionRequests = 0;

    const source: TTranscriptDataSource = {
      rowCount: () => lines.length,
      getRow: (index) => {
        rowBuilds++;
        const line = lines[index]!;
        return {
          kind: "message",
          key: line.key,
          segments: [{ text: line.text }],
          selectableText: line.text,
        };
      },
      getRowKey: (index) => lines[index]!.key,
      getRowVersion: (index) => {
        rowVersionRequests++;
        return lines[index]!.version;
      },
    };

    const App = defineComponent({
      name: "TranscriptFixedHeightWindowProbe",
      setup() {
        return () =>
          h(TTranscriptView, {
            x: 0,
            y: 0,
            w: 16,
            h: 4,
            source,
            version: transcriptVersion.value,
            scrollTop: 500,
            wrap: false,
          });
      },
    });
    const app = createTerminalApp({ cols: 16, rows: 6, component: App });

    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();
      expect(rowText(app, 0)).toBe("row-500");

      rowBuilds = 0;
      rowVersionRequests = 0;
      lines[20]!.text = "offscreen update";
      lines[20]!.version++;
      transcriptVersion.value++;
      await nextTick();
      app.scheduler.flushNow();

      expect(rowText(app, 0)).toBe("row-500");
      expect(rowBuilds).toBe(0);
      expect(rowVersionRequests).toBeLessThanOrEqual(4);

      rowBuilds = 0;
      rowVersionRequests = 0;
      lines[502]!.text = "visible update";
      lines[502]!.version++;
      transcriptVersion.value++;
      await nextTick();
      app.scheduler.flushNow();

      expect(rowText(app, 2)).toBe("visible update");
      expect(rowBuilds).toBe(1);
      expect(rowVersionRequests).toBeLessThanOrEqual(4);
    } finally {
      app.dispose();
    }
  });

  it("uses changed ranges to limit fixed-height transcript repaints", async () => {
    const lines = Array.from({ length: 1000 }, (_, index) => ({
      key: `line-${index}`,
      version: 1,
      text: `row-${index}`,
    }));
    const transcriptVersion = ref(1);
    let changedRange: { start: number; end: number } | null = null;

    const source: TTranscriptDataSource = {
      rowCount: () => lines.length,
      getRow: (index) => {
        const line = lines[index]!;
        return {
          kind: "message",
          key: line.key,
          segments: [{ text: line.text }],
          selectableText: line.text,
        };
      },
      getRowKey: (index) => lines[index]!.key,
      getRowVersion: (index) => lines[index]!.version,
      getChangedRange: () => changedRange,
    };

    const App = defineComponent({
      name: "TranscriptFixedHeightChangedRangePaintProbe",
      setup() {
        return () =>
          h(TTranscriptView, {
            x: 0,
            y: 0,
            w: 16,
            h: 4,
            source,
            version: transcriptVersion.value,
            scrollTop: 500,
            wrap: false,
          });
      },
    });
    const app = createTerminalApp({ cols: 16, rows: 6, component: App });

    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();
      expect(rowText(app, 0)).toBe("row-500");

      const commits: Array<{
        dirtyRows: readonly number[] | null;
        scrollOperations: unknown;
      }> = [];
      const off = app.terminal.on("commit", ({ dirtyRows, scrollOperations }) => {
        commits.push({ dirtyRows, scrollOperations: scrollOperations ?? null });
      });

      changedRange = { start: 20, end: 21 };
      lines[20]!.text = "offscreen update";
      lines[20]!.version++;
      transcriptVersion.value++;
      await nextTick();
      app.scheduler.flushNow();
      expect(commits).toEqual([]);

      changedRange = { start: 502, end: 503 };
      lines[502]!.text = "visible update";
      lines[502]!.version++;
      transcriptVersion.value++;
      await nextTick();
      app.scheduler.flushNow();

      off();
      expect(rowText(app, 2)).toBe("visible update");
      expect(commits).toEqual([{ dirtyRows: [2], scrollOperations: null }]);
    } finally {
      app.dispose();
    }
  });

  it("uses changed ranges to avoid scanning unchanged wrapped transcript rows", async () => {
    const lines = Array.from({ length: 1000 }, (_, index) => ({
      key: `line-${index}`,
      version: 1,
      text: `row-${index}`,
    }));
    const transcriptVersion = ref(1);
    let changedRange: { start: number; end: number } | null = null;
    let rowBuilds = 0;
    let rowVersionRequests = 0;

    const source: TTranscriptDataSource = {
      rowCount: () => lines.length,
      getRow: (index) => {
        rowBuilds++;
        const line = lines[index]!;
        return {
          kind: "message",
          key: line.key,
          segments: [{ text: line.text }],
          selectableText: line.text,
        };
      },
      getRowKey: (index) => lines[index]!.key,
      getRowVersion: (index) => {
        rowVersionRequests++;
        return lines[index]!.version;
      },
      getChangedRange: () => changedRange,
    };

    const App = defineComponent({
      name: "TranscriptWrappedChangedRangeProbe",
      setup() {
        return () =>
          h(TTranscriptView, {
            x: 0,
            y: 0,
            w: 16,
            h: 4,
            source,
            version: transcriptVersion.value,
            scrollTop: 0,
            wrap: true,
          });
      },
    });
    const app = createTerminalApp({ cols: 16, rows: 6, component: App });

    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();
      expect(rowText(app, 0)).toBe("row-0");

      rowBuilds = 0;
      rowVersionRequests = 0;
      changedRange = { start: 20, end: 21 };
      lines[20]!.text = "offscreen update";
      lines[20]!.version++;
      transcriptVersion.value++;
      await nextTick();
      app.scheduler.flushNow();

      expect(rowText(app, 0)).toBe("row-0");
      expect(rowBuilds).toBe(1);
      expect(rowVersionRequests).toBe(1);

      rowBuilds = 0;
      rowVersionRequests = 0;
      changedRange = { start: 2, end: 3 };
      lines[2]!.text = "visible update";
      lines[2]!.version++;
      transcriptVersion.value++;
      await nextTick();
      app.scheduler.flushNow();

      expect(rowText(app, 2)).toBe("visible update");
      expect(rowBuilds).toBe(1);
      expect(rowVersionRequests).toBe(1);
    } finally {
      app.dispose();
    }
  });

  it("repaints wrapped transcript viewport when a changed range changes visual height", async () => {
    const lines = [
      { key: "line-0", version: 1, text: "aaaa" },
      { key: "line-1", version: 1, text: "b" },
      { key: "line-2", version: 1, text: "c" },
      { key: "line-3", version: 1, text: "d" },
      { key: "line-4", version: 1, text: "e" },
    ];
    const transcriptVersion = ref(1);
    let changedRange: { start: number; end: number } | null = null;

    const source: TTranscriptDataSource = {
      rowCount: () => lines.length,
      getRow: (index) => {
        const line = lines[index]!;
        return {
          kind: "message",
          key: line.key,
          segments: [{ text: line.text }],
          selectableText: line.text,
        };
      },
      getRowKey: (index) => lines[index]!.key,
      getRowVersion: (index) => lines[index]!.version,
      getChangedRange: () => changedRange,
    };

    const App = defineComponent({
      name: "TranscriptWrappedChangedRangeHeightChangeProbe",
      setup() {
        return () =>
          h(TTranscriptView, {
            x: 0,
            y: 0,
            w: 4,
            h: 5,
            source,
            version: transcriptVersion.value,
            scrollTop: 0,
            wrap: true,
          });
      },
    });
    const app = createTerminalApp({ cols: 4, rows: 6, component: App });

    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();
      expect([0, 1, 2, 3, 4].map((y) => rowText(app, y))).toEqual(["aaaa", "b", "c", "d", "e"]);

      const commits: Array<{
        dirtyRows: readonly number[] | null;
        scrollOperations: unknown;
      }> = [];
      const off = app.terminal.on("commit", ({ dirtyRows, scrollOperations }) => {
        commits.push({ dirtyRows, scrollOperations: scrollOperations ?? null });
      });

      changedRange = { start: 1, end: 2 };
      lines[1]!.text = "bbbbccccdddd";
      lines[1]!.version++;
      transcriptVersion.value++;
      await nextTick();
      app.scheduler.flushNow();

      off();
      expect([0, 1, 2, 3, 4].map((y) => rowText(app, y))).toEqual([
        "aaaa",
        "bbbb",
        "cccc",
        "dddd",
        "c",
      ]);
      expect(commits).toEqual([{ dirtyRows: [0, 1, 2, 3, 4], scrollOperations: null }]);
    } finally {
      app.dispose();
    }
  });

  it("reuses keyed stable rows when a transcript source window shifts", async () => {
    const lines = Array.from({ length: 4 }, (_, index) => ({
      key: `line-${index}`,
      version: 1,
      text: `row-${index}`,
    }));
    const offset = ref(0);
    const transcriptVersion = ref(1);
    const componentSamples: any[] = [];
    let rowBuilds = 0;

    function rowAt(index: number): TTranscriptRow {
      rowBuilds++;
      const line = lines[offset.value + index];
      return {
        kind: "message",
        key: line?.key ?? `empty-${offset.value + index}`,
        segments: [{ text: line?.text ?? "" }],
        selectableText: line?.text ?? "",
      };
    }

    const source: TTranscriptDataSource = {
      rowCount: () => 3,
      getRow: rowAt,
      getRowKey: (index) => lines[offset.value + index]?.key ?? `empty-${offset.value + index}`,
      getRowVersion: (index) => lines[offset.value + index]?.version ?? 0,
      firstRowIndex: () => offset.value,
    };

    const App = defineComponent({
      name: "TranscriptShiftedWindowProbe",
      setup() {
        const { observability } = useTerminal();
        observability.framePerf.enabled.value = true;
        observability.framePerf.addSink({
          onFramePerf: () => {},
          onComponentPerf: (sample) => componentSamples.push(sample),
        });
        return () =>
          h(TTranscriptView, {
            x: 0,
            y: 0,
            w: 16,
            h: 3,
            source,
            version: transcriptVersion.value,
          });
      },
    });
    const app = createTerminalApp({ cols: 16, rows: 4, component: App });

    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();
      expect(rowText(app, 0)).toBe("row-0");
      expect(rowBuilds).toBe(3);

      componentSamples.length = 0;
      rowBuilds = 0;
      offset.value = 1;
      transcriptVersion.value++;
      await nextTick();
      app.scheduler.flushNow();

      const shiftedSample = componentSamples
        .slice()
        .reverse()
        .find((sample) => sample.name === "TTranscriptView" && sample.phase === "layout");
      expect(rowText(app, 0)).toBe("row-1");
      expect(rowText(app, 1)).toBe("row-2");
      expect(rowText(app, 2)).toBe("row-3");
      expect(rowBuilds).toBe(1);
      expect(shiftedSample).toMatchObject({
        itemCount: 3,
        cacheHit: 2,
        cacheMiss: 1,
        width: 16,
      });

      componentSamples.length = 0;
      rowBuilds = 0;
      offset.value = 0;
      transcriptVersion.value++;
      await nextTick();
      app.scheduler.flushNow();

      const restoredSample = componentSamples
        .slice()
        .reverse()
        .find((sample) => sample.name === "TTranscriptView" && sample.phase === "layout");
      expect(rowText(app, 0)).toBe("row-0");
      expect(rowText(app, 1)).toBe("row-1");
      expect(rowText(app, 2)).toBe("row-2");
      expect(rowBuilds).toBe(0);
      expect(restoredSample).toMatchObject({
        itemCount: 3,
        cacheHit: 3,
        cacheMiss: 0,
        width: 16,
      });
    } finally {
      app.dispose();
    }
  });

  it("does not focus or activate offscreen regions by keyboard navigation", async () => {
    const actionClick = vi.fn();
    const viewRef = ref<TTranscriptViewHandle | null>(null);
    const rows: TTranscriptRow[] = [
      {
        kind: "message",
        key: "visible",
        segments: [{ text: "visible" }],
      },
      {
        kind: "approval",
        key: "offscreen",
        title: "Allow?",
        actions: [{ id: "approve", label: "Approve" }],
      },
    ];
    const App = defineComponent({
      name: "TranscriptVisibleFocusApp",
      setup() {
        return () =>
          h(TTranscriptView, {
            ref: viewRef,
            x: 0,
            y: 0,
            w: 24,
            h: 1,
            source: createSource(rows),
            version: 1,
            onActionClick: actionClick,
          });
      },
    });
    const app = createTerminalApp({ cols: 24, rows: 3, component: App });

    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      expect(viewRef.value?.focusNextRegion()).toBe(false);
      expect(viewRef.value?.activateFocusedRegion()).toBe(false);
      expect(actionClick).not.toHaveBeenCalled();
    } finally {
      app.dispose();
    }
  });

  it("focuses repeated action ids by row-scoped region id", async () => {
    const actionClick = vi.fn();
    const viewRef = ref<TTranscriptViewHandle | null>(null);
    const rows: TTranscriptRow[] = [
      {
        kind: "approval",
        key: "first",
        title: "Allow first?",
        actions: [{ id: "approve", label: "Approve" }],
      },
      {
        kind: "approval",
        key: "second",
        title: "Allow second?",
        actions: [{ id: "approve", label: "Approve" }],
      },
    ];
    const App = defineComponent({
      name: "TranscriptRepeatedActionIdsApp",
      setup() {
        return () =>
          h(TTranscriptView, {
            ref: viewRef,
            x: 0,
            y: 0,
            w: 32,
            h: 2,
            source: createSource(rows),
            version: 1,
            onActionClick: actionClick,
          });
      },
    });
    const app = createTerminalApp({ cols: 32, rows: 4, component: App });

    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      expect(viewRef.value?.focusNextRegion()).toBe(true);
      expect(viewRef.value?.activateFocusedRegion()).toBe(true);
      expect(viewRef.value?.focusNextRegion()).toBe(true);
      expect(viewRef.value?.activateFocusedRegion()).toBe(true);
      expect(viewRef.value?.focusNextRegion()).toBe(true);
      expect(viewRef.value?.activateFocusedRegion()).toBe(true);

      expect(actionClick.mock.calls.map(([event]) => event.rowIndex)).toEqual([0, 1, 0]);
      expect(actionClick.mock.calls.map(([event]) => event.region.id)).toEqual([
        transcriptActionRegionId("first", "approve"),
        transcriptActionRegionId("second", "approve"),
        transcriptActionRegionId("first", "approve"),
      ]);
      expect(actionClick.mock.calls[0]?.[0].region.payload).toMatchObject({ actionId: "approve" });
    } finally {
      app.dispose();
    }
  });

  it("paints horizontally clipped transcript rows from the clipped cell offset", async () => {
    const App = defineComponent({
      name: "TranscriptHorizontalClipApp",
      setup() {
        return () =>
          h(TView, { x: 0, y: 0, w: 4, h: 1 }, () =>
            h(TTranscriptView, {
              x: -3,
              y: 0,
              w: 10,
              h: 1,
              source: createSource([
                {
                  kind: "message",
                  key: "msg",
                  segments: [{ text: "ABCDEFGH" }],
                },
              ]),
              version: 1,
            }),
          );
      },
    });
    const app = createTerminalApp({ cols: 8, rows: 2, component: App });

    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      expect(rowText(app, 0)).toBe("DEFG");
    } finally {
      app.dispose();
    }
  });
});
