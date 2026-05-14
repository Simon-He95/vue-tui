import { envFlag, envString } from "../utils/env.js";

const DEFAULT_LOG_FILE = "vue-tui-debug.log";
let debugFileWriter: DebugFileWriter | null = null;
let debugLogDefaultPath = DEFAULT_LOG_FILE;
const initializedDebugLogPaths = new Set<string>();

type DebugFileWriter = Readonly<{
  appendFileSync?: (path: string, data: string) => void;
  writeFileSync?: (path: string, data: string) => void;
}>;

function getFileWriter(): DebugFileWriter | null {
  const writer = (globalThis as any).__VT_DEBUG_FILE_WRITER__;
  if (writer && typeof writer === "object") return writer as DebugFileWriter;
  return debugFileWriter;
}

export function setDebugFileWriter(writer: DebugFileWriter | null): void {
  debugFileWriter = writer;
  if (!writer) initializedDebugLogPaths.clear();
}

export function resolveDebugLogPath(
  env: Record<string, unknown> | undefined,
  fallback = DEFAULT_LOG_FILE,
): string {
  return envString(env, "VUE_TUI_DEBUG_LOG_PATH", "DIMCODE_DEBUG_LOG_PATH", fallback);
}

export function setDebugLogDefaultPath(path: string | null): void {
  debugLogDefaultPath = path || DEFAULT_LOG_FILE;
}

function debugLogPath(): string {
  const env = (globalThis as any).process?.env as Record<string, unknown> | undefined;
  return resolveDebugLogPath(env, debugLogDefaultPath);
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable]";
  }
}

export interface DebugLogger {
  render: (message: string) => void;
  stream: (message: string) => void;
  error: (message: string, ...args: any[]) => void;
}

export function createDebugLogger(enable = false): DebugLogger {
  const enabled = enable;

  const ensureHeader = () => {
    if (!enabled) return;
    const writer = getFileWriter();
    if (!writer?.writeFileSync) return;
    const path = debugLogPath();
    if (initializedDebugLogPaths.has(path)) return;

    try {
      const data = `=== Vue TUI Debug Log Started at ${new Date().toISOString()} ===\n\n`;
      writer.writeFileSync(path, data);
      initializedDebugLogPaths.add(path);
    } catch {}
  };

  const write = (data: string) => {
    if (!enabled) return;
    ensureHeader();
    try {
      getFileWriter()?.appendFileSync?.(debugLogPath(), data);
    } catch {}
  };

  const log = (category: string, message: string) => {
    if (!enabled) return;
    const timestamp = new Date().toISOString().split("T")[1].slice(0, -1);
    write(`[${timestamp}] ${category} ${message}\n`);
  };

  ensureHeader();

  return {
    render: (message: string) => log("[RENDER]", message),
    stream: (message: string) => log("[STREAM]", message),
    error: (message: string, ...args: any[]) => {
      if (!enabled) return;
      const timestamp = new Date().toISOString().split("T")[1].slice(0, -1);
      const fullMessage = `[${timestamp}] [ERROR] ${message}${
        args.length ? ` ${safeJson(args)}` : ""
      }`;
      write(`${fullMessage}\n`);
    },
  };
}

/**
 * Check if debug logging is enabled via environment variable
 */
export function isDebugEnabled(): boolean {
  const env = (globalThis as any).process?.env;
  return envFlag(env, "VUE_TUI_DEBUG", "DIMCODE_DEBUG") || env?.DEBUG === "1";
}
