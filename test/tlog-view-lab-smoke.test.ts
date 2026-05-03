import type { TLogViewHandle } from "../src/experimental.js";
import type { TLogViewLabApi } from "../examples/tlog-view-lab/App.js";
import { describe, expect, it } from "vitest";
import { createTerminalApp } from "../src/index.js";
import { TLOG_VIEW_LAB_LAYOUT, TLogViewLabApp } from "../examples/tlog-view-lab/App.js";
import { defineComponent, h, nextTick, waitFor } from "./ui-regressions-support.js";

function rowText(app: ReturnType<typeof createTerminalApp>, y: number): string {
  return app.terminal
    .getRow(y)
    .map((cell) => cell.ch)
    .join("")
    .trimEnd();
}

async function flushSearch(
  app: ReturnType<typeof createTerminalApp>,
  handle: TLogViewHandle,
  maxFrames = 40,
): Promise<void> {
  for (let i = 0; i < maxFrames; i++) {
    await nextTick();
    app.scheduler.flushNow();
    if (handle.getSearchState().status !== "scanning") return;
  }
}

describe("TLogView lab smoke", () => {
  it("mounts the full lab stack and survives representative interactions", async () => {
    let api: TLogViewLabApi | null = null;
    const App = defineComponent({
      name: "TLogViewLabSmokeHarness",
      setup() {
        return () =>
          h(TLogViewLabApp, {
            onReady(nextApi: TLogViewLabApi) {
              api = nextApi;
            },
          });
      },
    });

    const app = createTerminalApp({
      cols: TLOG_VIEW_LAB_LAYOUT.cols,
      rows: TLOG_VIEW_LAB_LAYOUT.rows,
      component: App as any,
    });

    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();
      const lab = await waitFor(() => api);
      const handle = await waitFor(() => lab.logView.value);
      await flushSearch(app, handle);

      expect(lab.search.searchState.value.matchCount).toBeGreaterThan(0);
      expect(lab.search.metrics.value).not.toBeNull();
      expect(lab.search.markers.value.length).toBeGreaterThan(0);

      lab.search.updateMode("regex");
      lab.search.updateQuery("ERROR\\s+job-\\d+");
      await flushSearch(app, handle);
      expect(lab.search.searchState.value.matchCount).toBeGreaterThan(0);

      lab.search.updateQuery("[");
      await flushSearch(app, handle);
      expect(lab.search.searchState.value.status).toBe("error");

      lab.search.updateMode("text");
      lab.search.updateQuery("ERROR");
      await flushSearch(app, handle);
      expect(lab.search.resultsPage.state.value.results.length).toBeGreaterThan(1);

      const result = lab.search.resultsPage.state.value.results[1]!;
      const resultCell = lab.getSearchResultCell(1);
      app.events.dispatch({
        type: "click",
        cellX: resultCell.x,
        cellY: resultCell.y,
        time: Date.now(),
      } as any);
      await flushSearch(app, handle);
      expect(lab.search.searchState.value.currentMatchIndex).toBe(result.matchIndex);
      expect(lab.lastSearchSelection.value).toBe(result.matchIndex);

      const metrics = lab.search.metrics.value!;
      const markerIndex = lab.search.markers.value.findIndex(
        (entry) =>
          entry.visualRow < metrics.scrollTop ||
          entry.visualRow >= metrics.scrollTop + metrics.viewportRows,
      );
      const selectedMarkerIndex =
        markerIndex >= 0 ? markerIndex : lab.search.markers.value.length - 1;
      const marker = lab.search.markers.value[selectedMarkerIndex]!;
      const markerCell = lab.getScrollbarMarkerCell(selectedMarkerIndex);
      expect(markerCell).not.toBeNull();
      app.events.dispatch({
        type: "click",
        cellX: markerCell!.x,
        cellY: markerCell!.y,
        time: Date.now(),
      } as any);
      await flushSearch(app, handle);
      expect(lab.lastMarkerSelection.value).not.toBeNull();
      expect(lab.search.searchState.value.currentMatchIndex).toBe(lab.lastMarkerSelection.value);

      const visibleLinkCell = lab.getVisibleLinkCell(0);
      expect(visibleLinkCell).not.toBeNull();
      app.events.dispatch({
        type: "click",
        cellX: visibleLinkCell!.x,
        cellY: visibleLinkCell!.y,
        time: Date.now(),
      } as any);
      await nextTick();
      app.scheduler.flushNow();
      expect(lab.lastLinkAction.value?.source).toBe("click");

      expect(handle.focusNextLink()).toBe(true);
      lab.linkController.refresh();
      expect(lab.linkController.activeIndex.value).toBeGreaterThanOrEqual(0);
      expect(lab.linkController.activateFocusedLink()).toBe(true);
      expect(lab.lastLinkAction.value?.source).toBe("programmatic");

      const panelCell = lab.getLinksPanelCell(0);
      app.events.dispatch({
        type: "click",
        cellX: panelCell.x,
        cellY: panelCell.y,
        time: Date.now(),
      } as any);
      await nextTick();
      app.scheduler.flushNow();
      expect(lab.linkController.activeIndex.value).toBeGreaterThanOrEqual(0);
      app.events.dispatch({
        type: "keydown",
        key: "Enter",
        code: "Enter",
        time: Date.now(),
      } as any);
      await nextTick();
      app.scheduler.flushNow();
      expect(lab.lastLinkAction.value?.source).toBe("panel");

      const previousMode = lab.visualIndexMode.value;
      lab.actions.toggleVisualIndexMode();
      await nextTick();
      app.scheduler.flushNow();
      expect(lab.visualIndexMode.value).not.toBe(previousMode);
      expect(lab.search.metrics.value?.visualIndexStatus).toBeTruthy();

      const beforeLineCount = lab.search.metrics.value?.lineCount ?? 0;
      lab.actions.append1000();
      await flushSearch(app, handle);
      expect(lab.search.metrics.value).not.toBeNull();
      expect(lab.search.metrics.value!.lineCount).toBeGreaterThan(beforeLineCount);
      expect(lab.search.metrics.value!.lineCount).toBeLessThanOrEqual(2_000);
      expect(lab.search.markers.value.length).toBeGreaterThan(0);
      expect(rowText(app, TLOG_VIEW_LAB_LAYOUT.logView.y)).toContain("2026-05-03");
    } finally {
      app.dispose();
    }
  });
});
