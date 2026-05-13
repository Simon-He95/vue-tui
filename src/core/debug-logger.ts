const LOG_FILE = "/tmp/goatchain-debug.log";
let enabled = false;

type DebugFileWriter = Readonly<{
  appendFileSync?: (path: string, data: string) => void;
  writeFileSync?: (path: string, data: string) => void;
}>;

function getFileWriter(): DebugFileWriter | null {
  const writer = (globalThis as any).__VT_DEBUG_FILE_WRITER__;
  if (!writer || typeof writer !== "object") return null;
  return writer as DebugFileWriter;
}

export interface DebugLogger {
  render: (message: string) => void;
  stream: (message: string) => void;
  error: (message: string, ...args: any[]) => void;
}

/**
 * Initialize the debug logger.
 * @param enable Whether to enable debug logging
 * @returns DebugLogger instance
 */
export function createDebugLogger(enable = false): DebugLogger {
  enabled = enable;

  if (enabled) {
    try {
      const data = `=== GoatChain Debug Log Started at ${new Date().toISOString()} ===\n\n`;
      getFileWriter()?.writeFileSync?.(LOG_FILE, data);
    } catch {}
  }

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
  try {
    getFileWriter()?.appendFileSync?.(LOG_FILE, data);
  } catch {}
}

/**
 * Check if debug logging is enabled via environment variable
 */
export function isDebugEnabled(): boolean {
  const env = (globalThis as any).process?.env;
  return env?.VUE_TUI_DEBUG === "1" || env?.DIMCODE_DEBUG === "1" || env?.DEBUG === "1";
}
