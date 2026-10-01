import { describe, expect, it, vi } from "vitest";
import {
  TTranscriptView,
  type TTranscriptDataSource,
  type TTranscriptRow,
} from "../src/experimental.js";
import { mountTerminal, h, nextTick } from "./ui-regressions-support.js";

function createSource(rows: readonly TTranscriptRow[]): TTranscriptDataSource {
  return {
    rowCount: () => rows.length,
    getRow: (index) => rows[index]!,
  };
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

async function copyTranscriptSelection(
  options: Readonly<{
    rows: readonly TTranscriptRow[];
    w: number;
    h: number;
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
    await nextTick();
    await Promise.resolve();
    return writes[0] ?? "";
  } finally {
    mounted.unmount();
    restore();
  }
}

describe("selection copy across wide characters", () => {
  it("copies the trailing wide character when the drag ends on its leading cell", async () => {
    // 正(0,1) 式(2,3) 记(4,5) 录(6,7): the pointer stops on the leading cell of 录.
    await expect(
      copyTranscriptSelection({
        rows: [{ kind: "message", key: "msg", segments: [{ text: "正式记录" }] }],
        w: 12,
        h: 2,
        start: { x: 0, y: 0 },
        end: { x: 6, y: 0 },
      }),
    ).resolves.toBe("正式记录");
  });

  it("copies the trailing wide character when the drag ends on its trailing cell", async () => {
    await expect(
      copyTranscriptSelection({
        rows: [{ kind: "message", key: "msg", segments: [{ text: "正式记录" }] }],
        w: 12,
        h: 2,
        start: { x: 0, y: 0 },
        end: { x: 7, y: 0 },
      }),
    ).resolves.toBe("正式记录");
  });

  it("does not start the copied text with padding when the drag starts on a trailing cell", async () => {
    // 记(0,1) 录(2,3) 程(4,5) 序(6,7) 代(8,9) 码(10,11): the drag starts on the
    // trailing cell of 序, so 序 is not part of the selection and must not be
    // replaced with a leading space.
    await expect(
      copyTranscriptSelection({
        rows: [{ kind: "message", key: "msg", segments: [{ text: "记录程序代码" }] }],
        w: 12,
        h: 2,
        start: { x: 7, y: 0 },
        end: { x: 11, y: 0 },
      }),
    ).resolves.toBe("代码");
  });

  it("keeps ASCII selection behavior unchanged", async () => {
    await expect(
      copyTranscriptSelection({
        rows: [{ kind: "message", key: "msg", segments: [{ text: "abcdef" }] }],
        w: 12,
        h: 2,
        start: { x: 1, y: 0 },
        end: { x: 3, y: 0 },
      }),
    ).resolves.toBe("bcd");
  });
});
