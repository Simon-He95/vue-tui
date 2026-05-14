import type { TLogDataSource, TLogViewHandle, TLogViewScrollMetrics } from "../src/experimental.js";
import { describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "./ui-regressions-support.js";
import { createTLogLineMatcherPlugin, useTLogRetainedIndex } from "../src/experimental.js";

function createMetrics(): TLogViewScrollMetrics {
  return {
    scrollTop: 10,
    maxScrollTop: 100,
    viewportRows: 20,
    lineCount: 3,
    firstLineIndex: 40,
    estimatedVisualRowCount: 3,
    visualRowCount: 3,
    measuredVisualRowCount: 3,
    measuredLineCount: 3,
    visualIndexStatus: "exact",
    atTop: false,
    atBottom: false,
  };
}

function installManualRaf(): Readonly<{
  flush: () => void;
  restore: () => void;
}> {
  const previousRaf = globalThis.requestAnimationFrame;
  const previousCancel = globalThis.cancelAnimationFrame;
  const callbacks = new Map<number, FrameRequestCallback>();
  let id = 0;
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    const nextId = ++id;
    callbacks.set(nextId, cb);
    return nextId;
  }) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = ((rafId: number) => {
    callbacks.delete(rafId);
  }) as typeof cancelAnimationFrame;

  return {
    flush: () => {
      const pending = Array.from(callbacks.values());
      callbacks.clear();
      for (const cb of pending) cb(0);
    },
    restore: () => {
      globalThis.requestAnimationFrame = previousRaf;
      globalThis.cancelAnimationFrame = previousCancel;
    },
  };
}

describe("useTLogRetainedIndex", () => {
  it("builds retained links, diagnostics, and density with built-in and custom plugins", async () => {
    const raf = installManualRaf();
    const source = ref<TLogDataSource>({
      lineCount: () => 3,
      firstLineIndex: () => 40,
      getLineKey: (index) => index,
      getLine: (index) =>
        [
          "\x1b]8;;https://example.com/one\x07one\x1b]8;;\x07 ERROR request",
          "WARN docs=https://example.com/two",
          "INFO tail-draft",
        ][index] ?? "",
    });
    const version = ref(1);
    const logView = ref<TLogViewHandle | null>({
      getScrollMetrics: () => createMetrics(),
      getSearchState: () => ({
        query: "",
        status: "idle" as const,
        matchCount: 0,
        currentMatchIndex: -1,
        error: null,
      }),
      getSearchMatch: () => null,
    } as Partial<TLogViewHandle> as TLogViewHandle);

    const retained = useTLogRetainedIndex(logView, source, version, {
      links: true,
      levels: true,
      urls: true,
      plugins: [
        createTLogLineMatcherPlugin({
          name: "draft-marker",
          pattern: /tail-draft/u,
          severity: "warning",
          label: "DRAFT",
        }),
      ],
    });

    try {
      await nextTick();
      raf.flush();
      await nextTick();
      raf.flush();

      expect(retained.status.value).toBe("done");
      expect(retained.links.value).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            href: "https://example.com/one",
            source: "osc8",
          }),
          expect.objectContaining({
            href: "https://example.com/two",
            source: "url",
          }),
        ]),
      );
      expect(retained.diagnostics.value).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ severity: "error", source: "tlog-levels" }),
          expect.objectContaining({ severity: "warning", source: "tlog-levels" }),
          expect.objectContaining({ label: "DRAFT", source: "draft-marker" }),
        ]),
      );
      expect(retained.density.value.length).toBeGreaterThan(0);
    } finally {
      raf.restore();
    }
  });

  it("falls back to timers when requestAnimationFrame is unavailable", async () => {
    vi.useFakeTimers();
    const previousRaf = globalThis.requestAnimationFrame;
    const previousCancel = globalThis.cancelAnimationFrame;
    (globalThis as any).requestAnimationFrame = undefined;
    (globalThis as any).cancelAnimationFrame = undefined;

    const source = ref<TLogDataSource>({
      lineCount: () => 2,
      firstLineIndex: () => 0,
      getLineKey: (index) => index,
      getLine: (index) => ["ERROR https://example.com/one", "INFO tail-draft"][index] ?? "",
    });
    const version = ref(1);
    const logView = ref<TLogViewHandle | null>({
      getScrollMetrics: () => createMetrics(),
      getSearchState: () => ({
        query: "",
        status: "idle" as const,
        matchCount: 0,
        currentMatchIndex: -1,
        error: null,
      }),
      getSearchMatch: () => null,
    } as Partial<TLogViewHandle> as TLogViewHandle);

    const retained = useTLogRetainedIndex(logView, source, version, {
      links: true,
      levels: true,
      urls: true,
    });

    try {
      await nextTick();
      await vi.runAllTimersAsync();
      await nextTick();

      expect(retained.status.value).toBe("done");
      expect(retained.links.value).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            href: "https://example.com/one",
          }),
        ]),
      );
      expect(retained.diagnostics.value).toEqual(
        expect.arrayContaining([expect.objectContaining({ severity: "error" })]),
      );
    } finally {
      (globalThis as any).requestAnimationFrame = previousRaf;
      (globalThis as any).cancelAnimationFrame = previousCancel;
      vi.useRealTimers();
    }
  });

  it("sanitizes custom plugin external links in retained index", async () => {
    const raf = installManualRaf();
    const source = ref<TLogDataSource>({
      lineCount: () => 1,
      firstLineIndex: () => 0,
      getLineKey: (index) => index,
      getLine: () => "bad safe",
    });
    const version = ref(1);
    const logView = ref<TLogViewHandle | null>({
      getScrollMetrics: () => createMetrics(),
      getSearchState: () => ({
        query: "",
        status: "idle" as const,
        matchCount: 0,
        currentMatchIndex: -1,
        error: null,
      }),
      getSearchMatch: () => null,
    } as Partial<TLogViewHandle> as TLogViewHandle);

    const retained = useTLogRetainedIndex(logView, source, version, {
      budgetMs: 100,
      plugins: [
        {
          name: "custom-links",
          parseLine() {
            return {
              externalLinks: [
                {
                  href: "javascript:alert(1)",
                  text: "bad",
                  startCell: 0,
                  endCell: 3,
                },
                {
                  href: "https://safe.example/",
                  text: "safe",
                  startCell: 4,
                  endCell: 8,
                },
              ],
            };
          },
        },
      ],
    });

    try {
      await nextTick();
      raf.flush();
      await nextTick();

      expect(retained.status.value).toBe("done");
      expect(retained.links.value.map((link) => link.href)).toEqual(["https://safe.example/"]);
    } finally {
      raf.restore();
    }
  });
});
