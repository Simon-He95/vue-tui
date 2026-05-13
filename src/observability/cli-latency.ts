import type { CliLatencyProfiler } from "./cli-latency-node.js";

export type { CliLatencyProfiler } from "./cli-latency-node.js";

const GLOBAL_PROFILER_KEY = "__vueTuiCliLatencyProfiler" as const;

type GlobalProfilerRegistry = typeof globalThis & {
  [GLOBAL_PROFILER_KEY]?: () => CliLatencyProfiler | null;
};

export function getCliLatencyProfiler(): CliLatencyProfiler | null {
  const getProfiler = (globalThis as GlobalProfilerRegistry)[GLOBAL_PROFILER_KEY];
  return typeof getProfiler === "function" ? getProfiler() : null;
}
