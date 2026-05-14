import { appendFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setDebugFileWriter } from "../core/debug-logger.js";
import { setTuiProfilerFileWriter } from "../observability/tui-profiler.js";
import { envFlag, envString } from "../utils/env.js";

export const nodeProfilerFileWriter = { appendFileSync };

let installed = false;

export function defaultVueTuiProfileLogPath(): string {
  return join(tmpdir(), "vue-tui-profile.log");
}

export function defaultVueTuiDebugLogPath(): string {
  return join(tmpdir(), "vue-tui-debug.log");
}

function legacyDebugFlag(env: Readonly<Record<string, unknown>> | undefined): boolean {
  return String(env?.DEBUG ?? "").trim() === "1";
}

export function shouldInstallFileWriters(
  env: Readonly<Record<string, unknown>> | undefined,
): boolean {
  const profileLogDest = envString(
    env,
    "VUE_TUI_PROFILE_LOG_DEST",
    "DIMCODE_PROFILE_TUI_LOG_DEST",
  ).toLowerCase();
  return (
    envFlag(env, "VUE_TUI_DEBUG", "DIMCODE_DEBUG") ||
    legacyDebugFlag(env) ||
    profileLogDest === "file" ||
    profileLogDest === "both"
  );
}

export function installNodeFileWriters(options: Readonly<{ force?: boolean }> = {}): void {
  if (installed && !options.force) return;
  installed = true;
  const env = process.env as Record<string, string | undefined>;
  if (!env.VUE_TUI_DEBUG_LOG_PATH && !env.DIMCODE_DEBUG_LOG_PATH) {
    env.VUE_TUI_DEBUG_LOG_PATH = defaultVueTuiDebugLogPath();
  }
  setDebugFileWriter({ appendFileSync, writeFileSync });
  setTuiProfilerFileWriter(nodeProfilerFileWriter);
}

export function resetNodeFileWriters(): void {
  installed = false;
  setDebugFileWriter(null);
  setTuiProfilerFileWriter(null);
}
