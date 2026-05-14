import process from "node:process";
import { describe, expect, it } from "vitest";
import { createTerminal } from "../src/index.js";
import { createDebugLogger, setDebugFileWriter } from "../src/core/debug-logger.js";
import { createStdoutRenderer, resetNodeFileWriters } from "../src/cli.js";
import {
  defaultVueTuiDebugLogPath,
  installNodeFileWriters,
  shouldInstallFileWriters,
} from "../src/cli/node-file-writers.js";

describe("node file writers", () => {
  it("installs file writers when DEBUG=1 enables debug logging", () => {
    expect(shouldInstallFileWriters({ DEBUG: "1" })).toBe(true);
  });

  it("sets a Node default debug log path when installing file writers", () => {
    const previousDebugPath = process.env.VUE_TUI_DEBUG_LOG_PATH;
    const previousLegacyDebugPath = process.env.DIMCODE_DEBUG_LOG_PATH;

    delete process.env.VUE_TUI_DEBUG_LOG_PATH;
    delete process.env.DIMCODE_DEBUG_LOG_PATH;
    resetNodeFileWriters();

    try {
      installNodeFileWriters();
      expect(process.env.VUE_TUI_DEBUG_LOG_PATH).toBe(defaultVueTuiDebugLogPath());
    } finally {
      resetNodeFileWriters();
      if (previousDebugPath == null) delete process.env.VUE_TUI_DEBUG_LOG_PATH;
      else process.env.VUE_TUI_DEBUG_LOG_PATH = previousDebugPath;
      if (previousLegacyDebugPath == null) delete process.env.DIMCODE_DEBUG_LOG_PATH;
      else process.env.DIMCODE_DEBUG_LOG_PATH = previousLegacyDebugPath;
    }
  });

  it("does not globally install file writers unless file logging is requested", () => {
    const previousDebug = process.env.VUE_TUI_DEBUG;
    const previousLegacyDebug = process.env.DIMCODE_DEBUG;
    const previousGlobalDebug = process.env.DEBUG;
    const previousProfileDest = process.env.VUE_TUI_PROFILE_LOG_DEST;
    const previousLegacyProfileDest = process.env.DIMCODE_PROFILE_TUI_LOG_DEST;

    delete process.env.VUE_TUI_DEBUG;
    delete process.env.DIMCODE_DEBUG;
    delete process.env.DEBUG;
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
      if (previousGlobalDebug == null) delete process.env.DEBUG;
      else process.env.DEBUG = previousGlobalDebug;
      if (previousProfileDest == null) delete process.env.VUE_TUI_PROFILE_LOG_DEST;
      else process.env.VUE_TUI_PROFILE_LOG_DEST = previousProfileDest;
      if (previousLegacyProfileDest == null) delete process.env.DIMCODE_PROFILE_TUI_LOG_DEST;
      else process.env.DIMCODE_PROFILE_TUI_LOG_DEST = previousLegacyProfileDest;
    }
  });
});
