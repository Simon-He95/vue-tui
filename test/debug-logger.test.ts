import { describe, expect, it } from "vitest";
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
});
