import process from "node:process";
import { describe, expect, it } from "vitest";
import { createTerminal } from "../src/index.js";
import { createDebugLogger, setDebugFileWriter } from "../src/core/debug-logger.js";
import { createStdoutRenderer, resetNodeFileWriters } from "../src/cli.js";

describe("node file writers", () => {
  it("does not globally install file writers unless file logging is requested", () => {
    const previousDebug = process.env.VUE_TUI_DEBUG;
    const previousLegacyDebug = process.env.DIMCODE_DEBUG;
    const previousProfileDest = process.env.VUE_TUI_PROFILE_LOG_DEST;
    const previousLegacyProfileDest = process.env.DIMCODE_PROFILE_TUI_LOG_DEST;

    delete process.env.VUE_TUI_DEBUG;
    delete process.env.DIMCODE_DEBUG;
    delete process.env.VUE_TUI_PROFILE_LOG_DEST;
    delete process.env.DIMCODE_PROFILE_TUI_LOG_DEST;
    resetNodeFileWriters();

    const writes: string[] = [];
    setDebugFileWriter({
      writeFileSync: (_path, data) => {
        writes.push(data);
      },
    });

    const terminal = createTerminal({ cols: 1, rows: 1 });
    const renderer = createStdoutRenderer(terminal, {
      output: { isTTY: false, write: () => {} },
      clear: false,
      hideCursor: false,
      altScreen: false,
    });

    try {
      createDebugLogger(true);
      expect(writes.join("")).toContain("Vue TUI Debug Log Started");
    } finally {
      renderer.dispose();
      terminal.dispose();
      createDebugLogger(false);
      resetNodeFileWriters();
      if (previousDebug == null) delete process.env.VUE_TUI_DEBUG;
      else process.env.VUE_TUI_DEBUG = previousDebug;
      if (previousLegacyDebug == null) delete process.env.DIMCODE_DEBUG;
      else process.env.DIMCODE_DEBUG = previousLegacyDebug;
      if (previousProfileDest == null) delete process.env.VUE_TUI_PROFILE_LOG_DEST;
      else process.env.VUE_TUI_PROFILE_LOG_DEST = previousProfileDest;
      if (previousLegacyProfileDest == null) delete process.env.DIMCODE_PROFILE_TUI_LOG_DEST;
      else process.env.DIMCODE_PROFILE_TUI_LOG_DEST = previousLegacyProfileDest;
    }
  });
});
