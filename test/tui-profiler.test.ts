import process from "node:process";
import { describe, expect, it, vi } from "vitest";
import { createTuiProfiler, setTuiProfilerFileWriter } from "../src/observability/tui-profiler.js";

describe("tui profiler", () => {
  it("uses the default file writer for render-manager profile logs", () => {
    const previousProfile = process.env.VUE_TUI_PROFILE;
    const previousDest = process.env.VUE_TUI_PROFILE_LOG_DEST;
    const previousPath = process.env.VUE_TUI_PROFILE_LOG_PATH;
    const previousEvery = process.env.VUE_TUI_PROFILE_LOG_EVERY_MS;

    process.env.VUE_TUI_PROFILE = "1";
    process.env.VUE_TUI_PROFILE_LOG_DEST = "file";
    process.env.VUE_TUI_PROFILE_LOG_PATH = "/tmp/vue-tui-render-manager-profile-test.log";
    process.env.VUE_TUI_PROFILE_LOG_EVERY_MS = "100";
    vi.useFakeTimers();

    const writes: string[] = [];
    const paths: string[] = [];
    setTuiProfilerFileWriter({
      appendFileSync: (path, data) => {
        paths.push(path);
        writes.push(data);
      },
    });
    const profiler = createTuiProfiler("render-manager");

    try {
      expect(profiler).not.toBeNull();
      profiler?.recordRender({
        durationMs: 2,
        rows: 1,
        nodes: 1,
        fullRepaint: false,
        sorted: false,
      });
      vi.advanceTimersByTime(100);

      expect(paths).toEqual(["/tmp/vue-tui-render-manager-profile-test.log"]);
      expect(writes.join("")).toContain("[VUE_TUI_PROFILE] render-manager");
    } finally {
      setTuiProfilerFileWriter(null);
      vi.clearAllTimers();
      vi.useRealTimers();
      if (previousProfile == null) delete process.env.VUE_TUI_PROFILE;
      else process.env.VUE_TUI_PROFILE = previousProfile;
      if (previousDest == null) delete process.env.VUE_TUI_PROFILE_LOG_DEST;
      else process.env.VUE_TUI_PROFILE_LOG_DEST = previousDest;
      if (previousPath == null) delete process.env.VUE_TUI_PROFILE_LOG_PATH;
      else process.env.VUE_TUI_PROFILE_LOG_PATH = previousPath;
      if (previousEvery == null) delete process.env.VUE_TUI_PROFILE_LOG_EVERY_MS;
      else process.env.VUE_TUI_PROFILE_LOG_EVERY_MS = previousEvery;
    }
  });
});
