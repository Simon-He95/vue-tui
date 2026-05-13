import { appendFileSync, writeFileSync } from "node:fs";
import { setDebugFileWriter } from "../core/debug-logger.js";
import { setTuiProfilerFileWriter } from "../observability/tui-profiler.js";

export const nodeProfilerFileWriter = { appendFileSync };

let installed = false;

export function installNodeFileWriters(): void {
  if (installed) return;
  installed = true;
  setDebugFileWriter({ appendFileSync, writeFileSync });
  setTuiProfilerFileWriter(nodeProfilerFileWriter);
}
