import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createDebugLogger, setDebugFileWriter } from "../src/core/debug-logger.js";

describe("debug logger", () => {
  it("writes debug logs when a debug file writer is configured", () => {
    const writes: string[] = [];

    setDebugFileWriter({
      writeFileSync: (_path, data) => writes.push(String(data)),
      appendFileSync: (_path, data) => writes.push(String(data)),
    });

    try {
      const logger = createDebugLogger(true);
      logger.render("hello");

      expect(writes.join("")).toContain("Vue TUI Debug Log Started");
      expect(writes.join("")).toContain("[RENDER] hello");
    } finally {
      createDebugLogger(false);
      setDebugFileWriter(null);
    }
  });

  it("writes the debug header after a delayed file writer install", () => {
    const writes: string[] = [];
    setDebugFileWriter(null);

    try {
      const logger = createDebugLogger(true);
      setDebugFileWriter({
        writeFileSync: (_path, data) => writes.push(String(data)),
        appendFileSync: (_path, data) => writes.push(String(data)),
      });

      logger.render("hello");

      expect(writes.join("")).toContain("Vue TUI Debug Log Started");
      expect(writes.join("")).toContain("[RENDER] hello");
    } finally {
      createDebugLogger(false);
      setDebugFileWriter(null);
    }
  });

  it("does not install file writers when importing the CLI entrypoint", async () => {
    const dir = mkdtempSync(join(tmpdir(), "vue-tui-cli-side-effects-"));
    const logPath = join(dir, "debug.log");
    const previousDebug = process.env.VUE_TUI_DEBUG;
    const previousDebugPath = process.env.VUE_TUI_DEBUG_LOG_PATH;

    vi.resetModules();
    process.env.VUE_TUI_DEBUG = "1";
    process.env.VUE_TUI_DEBUG_LOG_PATH = logPath;

    try {
      const debug = await import("../src/core/debug-logger.js");
      debug.setDebugFileWriter(null);

      await import("../src/cli.js");

      const logger = debug.createDebugLogger(true);
      logger.render("hello");

      expect(existsSync(logPath)).toBe(false);
      debug.createDebugLogger(false);
      debug.setDebugFileWriter(null);
    } finally {
      if (previousDebug == null) delete process.env.VUE_TUI_DEBUG;
      else process.env.VUE_TUI_DEBUG = previousDebug;
      if (previousDebugPath == null) delete process.env.VUE_TUI_DEBUG_LOG_PATH;
      else process.env.VUE_TUI_DEBUG_LOG_PATH = previousDebugPath;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
