import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultCliLatencyLogPath } from "../src/observability/cli-latency-node.js";

describe("cli latency profiler", () => {
  it("uses os.tmpdir for the default log path", () => {
    expect(defaultCliLatencyLogPath()).toBe(join(tmpdir(), "vue-tui-cli-latency.jsonl"));
  });
});
