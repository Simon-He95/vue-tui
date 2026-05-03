import type { TLogViewHandle } from "../src/experimental.js";
import { describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "./ui-regressions-support.js";
import { useTLogVirtualSearchResults } from "../src/experimental.js";

describe("useTLogVirtualSearchResults", () => {
  it("lazily reads previews per visible item instead of materializing all results", async () => {
    const getSearchResults = vi.fn(({ offset = 0 } = {}) => [
      {
        matchIndex: offset,
        match: {
          absoluteLineIndex: 100 + offset,
          index: offset,
          startCell: 1,
          endCell: 6,
          text: `error-${offset}`,
        },
        preview: {
          text: `line error-${offset} tail`,
          matchStartCell: 5,
          matchEndCell: 10,
        },
      },
    ]);
    const logView = ref<TLogViewHandle | null>({
      getSearchState: () => ({
        query: "error",
        status: "done" as const,
        matchCount: 10_000,
        currentMatchIndex: 2,
        error: null,
      }),
      getSearchResults,
      selectSearchMatch: vi.fn(() => true),
    } as Partial<TLogViewHandle> as TLogViewHandle);

    const api = useTLogVirtualSearchResults(logView, {
      includePreview: true,
      previewWidth: 32,
    });
    await nextTick();

    expect(api.state.value.itemCount).toBe(10_000);
    expect(getSearchResults).not.toHaveBeenCalled();

    expect(api.getItem(0)).toMatchObject({
      matchIndex: 0,
      absoluteLineIndex: 100,
      text: "line error-0 tail",
    });
    expect(api.getItem(1)).toMatchObject({
      matchIndex: 1,
      absoluteLineIndex: 101,
    });
    expect(getSearchResults).toHaveBeenCalledTimes(2);

    api.getItem(1);
    expect(getSearchResults).toHaveBeenCalledTimes(2);
  });

  it("selects a match through the handle and refreshes active state", async () => {
    let currentMatchIndex = 0;
    const selectSearchMatch = vi.fn((matchIndex: number) => {
      currentMatchIndex = matchIndex;
      return true;
    });
    const logView = ref<TLogViewHandle | null>({
      getSearchState: () => ({
        query: "warn",
        status: "done" as const,
        matchCount: 4,
        currentMatchIndex,
        error: null,
      }),
      getSearchResults: ({ offset = 0 } = {}) => [
        {
          matchIndex: offset,
          match: {
            absoluteLineIndex: offset,
            index: offset,
            startCell: 0,
            endCell: 4,
            text: "warn",
          },
          preview: {
            text: "warn line",
            matchStartCell: 0,
            matchEndCell: 4,
          },
        },
      ],
      selectSearchMatch,
    } as Partial<TLogViewHandle> as TLogViewHandle);

    const api = useTLogVirtualSearchResults(logView);
    await nextTick();

    expect(api.select(3)).toBe(true);
    expect(selectSearchMatch).toHaveBeenCalledWith(3);
    expect(api.state.value.activeIndex).toBe(3);
  });
});
