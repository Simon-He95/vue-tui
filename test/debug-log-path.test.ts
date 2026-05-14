import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseMouseSequence } from "../src/cli/parse-mouse.js";
import { resolveDebugLogPath } from "../src/core/debug-logger.js";
import { createCliEventManager } from "../src/events/manager/cli-event-manager.js";
import { envFlag } from "../src/utils/env.js";

const ENV_KEYS = [
  "VUE_TUI_DEBUG",
  "DIMCODE_DEBUG",
  "VUE_TUI_DEBUG_LOG_PATH",
  "DIMCODE_DEBUG_LOG_PATH",
  "VUE_TUI_MOUSE_DEBUG",
  "DIMCODE_MOUSE_DEBUG",
  "VUE_TUI_MOUSE_DEBUG_PATH",
  "DIMCODE_MOUSE_DEBUG_PATH",
] as const;

function withEnv(values: Record<string, string | undefined>, run: () => void): void {
  const previous = new Map<string, string | undefined>();
  for (const key of ENV_KEYS) {
    previous.set(key, process.env[key]);
    delete process.env[key];
  }

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    run();
  } finally {
    for (const key of ENV_KEYS) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function withTempDir(run: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "vue-tui-debug-"));
  try {
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("debug log paths", () => {
  it("resolves Vue TUI debug log paths and defaults", () => {
    expect(resolveDebugLogPath(undefined)).toBe("/tmp/vue-tui-debug.log");
    expect(resolveDebugLogPath({}, "/tmp/vue-tui-mouse-debug.log")).toBe(
      "/tmp/vue-tui-mouse-debug.log",
    );
    expect(resolveDebugLogPath({ VUE_TUI_DEBUG_LOG_PATH: " /tmp/custom.log " })).toBe(
      "/tmp/custom.log",
    );
    expect(resolveDebugLogPath({ DIMCODE_DEBUG_LOG_PATH: "/tmp/legacy.log" })).toBe(
      "/tmp/legacy.log",
    );
    expect(
      resolveDebugLogPath({
        VUE_TUI_DEBUG_LOG_PATH: "",
        DIMCODE_DEBUG_LOG_PATH: "/tmp/legacy.log",
      }),
    ).toBe("/tmp/legacy.log");
  });

  it("lets explicit new env flag values override legacy aliases", () => {
    expect(
      envFlag(
        { VUE_TUI_MOUSE_DEBUG: "0", DIMCODE_MOUSE_DEBUG: "1" },
        "VUE_TUI_MOUSE_DEBUG",
        "DIMCODE_MOUSE_DEBUG",
      ),
    ).toBe(false);
  });

  it("parses common env flag values consistently", () => {
    for (const value of ["1", "true", "yes", "on"]) {
      expect(envFlag({ VUE_TUI_DEBUG: value }, "VUE_TUI_DEBUG")).toBe(true);
    }

    for (const value of ["", "0", "false", "no", "off", "bogus"]) {
      expect(envFlag({ VUE_TUI_DEBUG: value }, "VUE_TUI_DEBUG")).toBe(false);
    }
  });

  it("writes CLI event handler debug errors to the configured Vue TUI path", () => {
    withTempDir((dir) => {
      const logPath = join(dir, "custom.log");

      withEnv(
        {
          VUE_TUI_DEBUG: "1",
          VUE_TUI_DEBUG_LOG_PATH: logPath,
        },
        () => {
          const events = createCliEventManager();
          try {
            events.register({
              rect: { x: 0, y: 0, w: 1, h: 1 },
              zIndex: 0,
              handlers: {
                click: () => {
                  throw new Error("boom");
                },
              },
            });

            events.dispatch({ type: "click", cellX: 0, cellY: 0, button: 0 });
          } finally {
            events.dispose();
          }
        },
      );

      const log = readFileSync(logPath, "utf8");
      expect(log).toContain("[EVENT-MGR] ERROR in handler");
      expect(log).toContain("boom");
    });
  });

  it("writes mouse debug logs to the configured Vue TUI mouse path", () => {
    withTempDir((dir) => {
      const logPath = join(dir, "mouse.log");

      withEnv(
        {
          VUE_TUI_MOUSE_DEBUG: "1",
          VUE_TUI_MOUSE_DEBUG_PATH: logPath,
        },
        () => {
          parseMouseSequence("\u001B[<64;10;5M");
        },
      );

      const log = readFileSync(logPath, "utf8");
      expect(log).toContain("[MOUSE] wheel");
    });
  });

  it("falls back to the legacy mouse debug path when the new path is empty", () => {
    withTempDir((dir) => {
      const logPath = join(dir, "legacy-mouse.log");

      withEnv(
        {
          VUE_TUI_MOUSE_DEBUG: "1",
          VUE_TUI_MOUSE_DEBUG_PATH: "",
          DIMCODE_MOUSE_DEBUG_PATH: logPath,
        },
        () => {
          parseMouseSequence("\u001B[<64;10;5M");
        },
      );

      const log = readFileSync(logPath, "utf8");
      expect(log).toContain("[MOUSE] wheel");
    });
  });
});
