import { appendFileSync, writeFileSync } from "node:fs";
import { setDebugFileWriter } from "../core/debug-logger.js";
import { setTuiProfilerFileWriter } from "../observability/tui-profiler.js";
import { envFlag, envString } from "../utils/env.js";

export const nodeProfilerFileWriter = { appendFileSync };

let installed = false;

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
    profileLogDest === "file" ||
    profileLogDest === "both"
  );
}

export function installNodeFileWriters(options: Readonly<{ force?: boolean }> = {}): void {
  if (installed && !options.force) return;
  installed = true;
  setDebugFileWriter({ appendFileSync, writeFileSync });
  setTuiProfilerFileWriter(nodeProfilerFileWriter);
}

export function resetNodeFileWriters(): void {
  installed = false;
  setDebugFileWriter(null);
  setTuiProfilerFileWriter(null);
}
