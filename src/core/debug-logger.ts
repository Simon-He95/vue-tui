import { envFlag, envString } from "../utils/env.js";

const DEFAULT_LOG_FILE = "/tmp/vue-tui-debug.log";
let enabled = false;
let wroteHeader = false;
let debugFileWriter: DebugFileWriter | null = null;

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
}

export function resolveDebugLogPath(
  env: Record<string, unknown> | undefined,
  fallback = DEFAULT_LOG_FILE,
): string {
  return envString(env, "VUE_TUI_DEBUG_LOG_PATH", "DIMCODE_DEBUG_LOG_PATH", fallback);
}

function debugLogPath(): string {
  const env = (globalThis as any).process?.env as Record<string, unknown> | undefined;
  return resolveDebugLogPath(env);
}

export interface DebugLogger {
  render: (message: string) => void;
  stream: (message: string) => void;
  error: (message: string, ...args: any[]) => void;
}

function ensureHeader(): void {
  if (!enabled || wroteHeader) return;
  const writer = getFileWriter();
  if (!writer?.writeFileSync) return;

  try {
    const data = `=== Vue TUI Debug Log Started at ${new Date().toISOString()} ===\n\n`;
    writer.writeFileSync(debugLogPath(), data);
    wroteHeader = true;
  } catch {}
}

export function createDebugLogger(enable = false): DebugLogger {
  enabled = enable;
  if (!enabled) wroteHeader = false;
  else ensureHeader();

  return {
    render: (message: string) => log("[RENDER]", message),
    stream: (message: string) => log("[STREAM]", message),
    error: (message: string, ...args: any[]) => {
      if (!enabled) return;
      const timestamp = new Date().toISOString().split("T")[1].slice(0, -1);
      const fullMessage = `[${timestamp}] [ERROR] ${message}${
        args.length ? ` ${JSON.stringify(args)}` : ""
      }`;
      write(`${fullMessage}\n`);
    },
  };
}

function log(category: string, message: string): void {
  if (!enabled) return;
  const timestamp = new Date().toISOString().split("T")[1].slice(0, -1);
  write(`[${timestamp}] ${category} ${message}\n`);
}

function write(data: string): void {
  if (!enabled) return;
  ensureHeader();
  try {
    getFileWriter()?.appendFileSync?.(debugLogPath(), data);
  } catch {}
}

/**
 * Check if debug logging is enabled via environment variable
 */
export function isDebugEnabled(): boolean {
  const env = (globalThis as any).process?.env;
  return envFlag(env, "VUE_TUI_DEBUG", "DIMCODE_DEBUG") || env?.DEBUG === "1";
}
