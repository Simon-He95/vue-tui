import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function runTsx(script: string): string {
  return execFileSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", script], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    timeout: 30_000,
  });
}

function parseJsonObject(output: string): any {
  const start = output.indexOf("{");
  expect(start).toBeGreaterThanOrEqual(0);
  return JSON.parse(output.slice(start));
}

describe("bench smoke", () => {
  it("bench:dom-renderer emits mixed rowKey prepass results", () => {
    const output = runTsx("scripts/bench-dom-renderer.ts");
    const results = JSON.parse(output);

    expect(results.mixedRowKeyPrepass).toBeDefined();
    expect(results.mixedRowKeyPrepass.off.secondFlush.rowKeyPrepassChecks).toBe(0);
    expect(results.mixedRowKeyPrepass.default.secondFlush.rowKeyPrepassChecks).toBeGreaterThan(0);
    expect(results.mixedRowKeyPrepass.prepass.secondFlush.rowKeyPrepassChecks).toBeGreaterThan(0);
    expect(results.cacheHitPlain.off).toBeDefined();
    expect(results.cacheHitPlain.default).toBeDefined();
    expect(results.cacheHitPlain.prepass).toBeDefined();
  });

  it("bench:scroll-mailbox still passes and emits scenarios", () => {
    const output = runTsx("scripts/bench-scroll-mailbox.ts");
    expect(output).toContain("[bench:scroll-mailbox] passed");

    const results = parseJsonObject(output);
    expect(results.scenarios.length).toBeGreaterThan(0);
    expect(results.guards).toBeDefined();
  });
});
